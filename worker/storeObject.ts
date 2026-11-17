/**
 * Satu Durable Object per toko (Store ID). Menyimpan:
 * - akun cloud toko (email + hash password PBKDF2) dan sesi perangkat,
 * - snapshot data toko (teks terenkode dari aplikasi) dalam potongan ≤ 1 MB dengan nomor versi,
 * - kunci (lock) singkat untuk transaksi stok.
 *
 * Penyimpanan memakai compare-and-swap: perangkat mengirim versi yang ia baca (If-Match). Jika versi
 * berubah di antaranya, server membalas 409 dan perangkat menggabungkan ulang — tidak ada data yang
 * tertimpa diam-diam. Durable Object memproses request satu per satu, jadi pengecekan versi atomik.
 */
import { DurableObject } from 'cloudflare:workers';
import { hashPassword, randomToken, sha256Hex, verifyPassword } from './crypto';

export interface Env {
  STORE: DurableObjectNamespace<StoreObject>;
  MEDIA: R2Bucket;
  ASSETS: Fetcher;
  SETUP_KEY?: string;
  MEDIA_SIGNING_SECRET?: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL?: string;
}

const CHUNK_SIZE = 1_000_000;
const SESSION_TTL_MS = 180 * 24 * 60 * 60 * 1000;
const MAX_FAILED_LOGINS = 8;
const LOCKOUT_MS = 5 * 60 * 1000;
const MAX_LOCK_TTL_MS = 30_000;

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } });

const errorResponse = (status: number, code: string, message: string) => json({ error: code, message }, status);

const bearer = (request: Request) => (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();

const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export class StoreObject extends DurableObject<Env> {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, label TEXT, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, last_seen INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS state_chunks (idx INTEGER PRIMARY KEY, data TEXT NOT NULL);
    `);
  }

  private getMeta(key: string): string | null {
    const row = this.sql.exec<{ value: string }>('SELECT value FROM meta WHERE key = ?', key).toArray()[0];
    return row ? row.value : null;
  }

  private setMeta(key: string, value: string | number) {
    this.sql.exec('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, String(value));
  }

  private deleteMeta(key: string) {
    this.sql.exec('DELETE FROM meta WHERE key = ?', key);
  }

  private get version() {
    return Number(this.getMeta('state_version') || '0');
  }

  private async createSession(label: string) {
    const token = randomToken();
    const now = Date.now();
    this.sql.exec(
      'INSERT INTO sessions (token_hash, label, created_at, expires_at, last_seen) VALUES (?, ?, ?, ?, ?)',
      await sha256Hex(token), label.slice(0, 120), now, now + SESSION_TTL_MS, now,
    );
    // Bersihkan sesi kedaluwarsa sesekali.
    this.sql.exec('DELETE FROM sessions WHERE expires_at < ?', now);
    return token;
  }

  /** Sesi valid? Dipakai Worker untuk media & AI. */
  async verify(token: string): Promise<boolean> {
    if (!token) return false;
    const hash = await sha256Hex(token);
    const now = Date.now();
    const row = this.sql.exec<{ expires_at: number; last_seen: number }>('SELECT expires_at, last_seen FROM sessions WHERE token_hash = ?', hash).toArray()[0];
    if (!row || row.expires_at < now) return false;
    // Perpanjang sesi yang aktif (maks. sekali per jam agar tidak menulis di setiap request).
    if (now - row.last_seen > 60 * 60 * 1000) this.sql.exec('UPDATE sessions SET last_seen = ?, expires_at = ? WHERE token_hash = ?', now, now + SESSION_TTL_MS, hash);
    return true;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    // Path internal: /<storeId>/<aksi>
    const action = url.pathname.split('/').filter(Boolean).slice(1).join('/');
    const method = request.method;
    try {
      if (action === 'status' && method === 'GET') return json({ registered: Boolean(this.getMeta('password_hash')), version: this.version });
      if (action === 'register' && method === 'POST') return await this.register(request);
      if (action === 'login' && method === 'POST') return await this.login(request);

      // Semua aksi di bawah butuh sesi perangkat.
      const token = bearer(request);
      if (!(await this.verify(token))) return errorResponse(401, 'CLOUD_AUTH_REQUIRED', 'Perangkat belum login ke cloud toko atau sesinya sudah berakhir.');

      if (action === 'logout' && method === 'POST') {
        this.sql.exec('DELETE FROM sessions WHERE token_hash = ?', await sha256Hex(token));
        return json({ ok: true });
      }
      if (action === 'password' && method === 'POST') return await this.changePassword(request);
      if (action === 'state' && method === 'GET') return this.readState();
      if (action === 'state' && method === 'PUT') return await this.writeState(request);
      if (action === 'lock' && method === 'POST') return await this.acquireLock(request);
      if (action === 'lock' && method === 'DELETE') return this.releaseLock(url.searchParams.get('owner') || '');
      return errorResponse(404, 'NOT_FOUND', 'Endpoint tidak dikenal.');
    } catch (error: any) {
      if (String(error?.message || '').includes('SQLITE_FULL')) return errorResponse(507, 'STORAGE_FULL', 'Penyimpanan cloud toko penuh.');
      console.error('[StoreObject]', action, error);
      return errorResponse(500, 'INTERNAL', 'Terjadi kesalahan di server.');
    }
  }

  private async readBody(request: Request) {
    try {
      return await request.json() as Record<string, any>;
    } catch {
      return {};
    }
  }

  private async register(request: Request) {
    if (this.getMeta('password_hash')) return errorResponse(409, 'STORE_EXISTS', 'Store ID ini sudah terdaftar. Gunakan login.');
    const body = await this.readBody(request);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!isValidEmail(email)) return errorResponse(400, 'INVALID_EMAIL', 'Email tidak valid.');
    if (password.length < 8) return errorResponse(400, 'WEAK_PASSWORD', 'Password minimal 8 karakter.');
    const passwordHash = await hashPassword(password);
    // Cek ulang setelah await: dua pendaftaran bersamaan tidak boleh saling menimpa.
    if (this.getMeta('password_hash')) return errorResponse(409, 'STORE_EXISTS', 'Store ID ini sudah terdaftar. Gunakan login.');
    this.setMeta('email', email);
    this.setMeta('password_hash', passwordHash);
    this.setMeta('created_at', Date.now());
    const token = await this.createSession(String(body.label || 'Perangkat pendaftar'));
    return json({ token, email }, 201);
  }

  private async login(request: Request) {
    const storedHash = this.getMeta('password_hash');
    if (!storedHash) return errorResponse(404, 'STORE_NOT_FOUND', 'Store ID belum terdaftar di cloud.');
    const lockedUntil = Number(this.getMeta('locked_until') || '0');
    if (lockedUntil > Date.now()) {
      return errorResponse(429, 'TOO_MANY_ATTEMPTS', `Terlalu banyak percobaan. Coba lagi dalam ${Math.ceil((lockedUntil - Date.now()) / 60000)} menit.`);
    }
    const body = await this.readBody(request);
    const email = String(body.email || '').trim().toLowerCase();
    const ok = email === this.getMeta('email') && await verifyPassword(String(body.password || ''), storedHash);
    if (!ok) {
      const failures = Number(this.getMeta('failed_logins') || '0') + 1;
      if (failures >= MAX_FAILED_LOGINS) {
        this.setMeta('locked_until', Date.now() + LOCKOUT_MS);
        this.setMeta('failed_logins', 0);
      } else {
        this.setMeta('failed_logins', failures);
      }
      return errorResponse(401, 'INVALID_CREDENTIALS', 'Email atau password cloud salah.');
    }
    this.setMeta('failed_logins', 0);
    this.deleteMeta('locked_until');
    const token = await this.createSession(String(body.label || 'Perangkat'));
    return json({ token, email });
  }

  /** Ganti password akun cloud: semua perangkat lain otomatis keluar (mis. perangkat hilang). */
  private async changePassword(request: Request) {
    const body = await this.readBody(request);
    const storedHash = this.getMeta('password_hash')!;
    if (!(await verifyPassword(String(body.currentPassword || ''), storedHash))) return errorResponse(401, 'INVALID_CREDENTIALS', 'Password lama salah.');
    const next = String(body.newPassword || '');
    if (next.length < 8) return errorResponse(400, 'WEAK_PASSWORD', 'Password baru minimal 8 karakter.');
    this.setMeta('password_hash', await hashPassword(next));
    this.sql.exec('DELETE FROM sessions');
    const token = await this.createSession('Perangkat (ganti password)');
    return json({ token });
  }

  private readState() {
    const version = this.version;
    const chunks = this.sql.exec<{ data: string }>('SELECT data FROM state_chunks ORDER BY idx').toArray();
    if (version === 0 || chunks.length === 0) return new Response(null, { status: 204, headers: { 'X-State-Version': String(version), 'Cache-Control': 'no-store' } });
    return new Response(chunks.map(chunk => chunk.data).join(''), {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-State-Version': String(version), 'Cache-Control': 'no-store' },
    });
  }

  private async writeState(request: Request) {
    const expected = request.headers.get('If-Match');
    const current = this.version;
    if (expected === null || Number(expected) !== current) {
      return json({ error: 'VERSION_CONFLICT', message: 'Data cloud sudah berubah. Tarik ulang lalu gabungkan.', version: current }, 409, { 'X-State-Version': String(current) });
    }
    const text = await request.text();
    if (!text) return errorResponse(400, 'EMPTY_STATE', 'Data kosong tidak disimpan.');
    // Cek ulang setelah membaca body: request lain bisa masuk saat menunggu body.
    if (this.version !== current) {
      return json({ error: 'VERSION_CONFLICT', message: 'Data cloud sudah berubah. Tarik ulang lalu gabungkan.', version: this.version }, 409, { 'X-State-Version': String(this.version) });
    }
    const next = current + 1;
    this.ctx.storage.transactionSync(() => {
      this.sql.exec('DELETE FROM state_chunks');
      for (let offset = 0, idx = 0; offset < text.length; offset += CHUNK_SIZE, idx += 1) {
        this.sql.exec('INSERT INTO state_chunks (idx, data) VALUES (?, ?)', idx, text.slice(offset, offset + CHUNK_SIZE));
      }
      this.setMeta('state_version', next);
      this.setMeta('state_updated_at', Date.now());
      this.setMeta('state_bytes', text.length);
    });
    return json({ ok: true, version: next }, 200, { 'X-State-Version': String(next) });
  }

  private async acquireLock(request: Request) {
    const body = await this.readBody(request);
    const owner = String(body.owner || '');
    if (!owner) return errorResponse(400, 'INVALID_OWNER', 'Owner lock wajib diisi.');
    const ttl = Math.min(MAX_LOCK_TTL_MS, Math.max(1000, Number(body.ttlMs) || 10_000));
    const now = Date.now();
    const holder = this.getMeta('lock_owner');
    const expires = Number(this.getMeta('lock_expires') || '0');
    if (holder && holder !== owner && expires > now) return json({ acquired: false, retryAfterMs: expires - now }, 423);
    this.setMeta('lock_owner', owner);
    this.setMeta('lock_expires', now + ttl);
    return json({ acquired: true, expiresAt: now + ttl });
  }

  private releaseLock(owner: string) {
    if (owner && this.getMeta('lock_owner') === owner) {
      this.deleteMeta('lock_owner');
      this.deleteMeta('lock_expires');
    }
    return json({ ok: true });
  }
}
