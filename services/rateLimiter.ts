/**
 * Client-side Rate Limiter for Login Attempts
 * 
 * Prevents brute-force attacks by limiting login attempts.
 * After MAX_ATTEMPTS failed attempts, the user is locked out for LOCKOUT_DURATION_MS.
 * 
 * Note: This is client-side only. For production, implement server-side rate limiting too.
 */

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const STORAGE_KEY = 'HGROUP_LOGIN_ATTEMPTS';

interface LoginAttemptRecord {
  count: number;
  firstAttemptAt: number;
  lockedUntil: number | null;
}

const getRecord = (): LoginAttemptRecord => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { count: 0, firstAttemptAt: 0, lockedUntil: null };
    return JSON.parse(raw);
  } catch {
    return { count: 0, firstAttemptAt: 0, lockedUntil: null };
  }
};

const saveRecord = (record: LoginAttemptRecord) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
};

/**
 * Check if login is currently locked out.
 * Returns remaining lockout time in seconds, or 0 if not locked.
 */
export const getLoginLockoutRemaining = (): number => {
  const record = getRecord();
  if (!record.lockedUntil) return 0;

  const remaining = record.lockedUntil - Date.now();
  if (remaining <= 0) {
    // Lockout expired, reset
    saveRecord({ count: 0, firstAttemptAt: 0, lockedUntil: null });
    return 0;
  }

  return Math.ceil(remaining / 1000);
};

/**
 * Record a failed login attempt.
 * Returns error message if locked out, or null if attempt is allowed.
 */
export const recordFailedLogin = (): string | null => {
  const record = getRecord();
  const now = Date.now();

  // Check if currently locked
  if (record.lockedUntil && record.lockedUntil > now) {
    const remainingSec = Math.ceil((record.lockedUntil - now) / 1000);
    const minutes = Math.floor(remainingSec / 60);
    const seconds = remainingSec % 60;
    return `Terlalu banyak percobaan login. Coba lagi dalam ${minutes}m ${seconds}s.`;
  }

  // Reset if window expired (older than lockout duration)
  if (record.firstAttemptAt && (now - record.firstAttemptAt) > LOCKOUT_DURATION_MS) {
    const newRecord: LoginAttemptRecord = { count: 1, firstAttemptAt: now, lockedUntil: null };
    saveRecord(newRecord);
    return null;
  }

  const newCount = record.count + 1;

  if (newCount >= MAX_ATTEMPTS) {
    const lockedUntil = now + LOCKOUT_DURATION_MS;
    saveRecord({ count: newCount, firstAttemptAt: record.firstAttemptAt || now, lockedUntil });
    return `Akun terkunci selama 5 menit setelah ${MAX_ATTEMPTS} percobaan gagal.`;
  }

  saveRecord({
    count: newCount,
    firstAttemptAt: record.firstAttemptAt || now,
    lockedUntil: null,
  });

  const remaining = MAX_ATTEMPTS - newCount;
  if (remaining <= 2) {
    return null; // Will show warning separately
  }
  return null;
};

/**
 * Get remaining attempts before lockout.
 */
export const getRemainingAttempts = (): number => {
  const record = getRecord();
  if (record.lockedUntil && record.lockedUntil > Date.now()) return 0;
  return Math.max(0, MAX_ATTEMPTS - record.count);
};

/**
 * Reset login attempts (call after successful login).
 */
export const resetLoginAttempts = () => {
  localStorage.removeItem(STORAGE_KEY);
};
