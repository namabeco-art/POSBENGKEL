# POS Hulio — Sistem Kasir Bengkel & Retail

Aplikasi kasir (Point of Sale) untuk bengkel, toko sparepart, dan retail kecil-menengah.
Bisa dipakai langsung tanpa internet (mode lokal) atau disinkronkan antar perangkat.

## Fitur Utama

- **Kasir (POS)** — Input penjualan cepat, scan barcode, cetak struk
- **Stok Barang** — Kelola sparepart/produk, stok otomatis berkurang saat jual
- **Pelanggan** — Data pelanggan, hutang, level member
- **Pembelian** — Catat pembelian dari supplier, terima barang
- **Laporan** — Penjualan harian, stok menipis, laba rugi sederhana
- **Multi User** — Admin, Kasir, Gudang — masing-masing punya akses berbeda
- **AI Consultant** — Tanya AI soal bisnis (opsional, perlu API key)
- **Offline First** — Data tersimpan di browser, tetap jalan tanpa internet

## Harga yang Cepat Berubah

- **Kelola Harga** (Barang → Kelola Harga): naik/turun massal per kategori/merk/pilihan (persen atau rupiah), pilih yang diubah (modal, jual, atau keduanya), pembulatan Rp 100/500/1.000, hitung otomatis dari markup per kategori, dan preview yang menandai barang yang akan dijual rugi.
- **Update harga lewat Excel**: Barang → Export, ubah harga di Excel, lalu Import. Kode yang sudah ada diperbarui (stok tidak disentuh), kode baru ditambahkan. Pemisah koma maupun titik koma (Excel Indonesia) didukung.
- **Riwayat harga per barang**: siapa, kapan, dan dari mana (edit manual, update massal, import, penerimaan PO, AI). Tersinkron ke semua perangkat.
- **Tinjau harga setelah terima barang**: jika harga modal rata-rata berubah karena harga supplier naik/turun, sistem menampilkan margin yang tergerus dan menawarkan penyesuaian harga jual sekali klik (markup dipertahankan).
- **Peringatan Harga** di Dashboard: barang yang dijual ≤ modal, margin < 10%, atau harga belum diatur.
- **Kasir selalu memakai harga terbaru**: harga di keranjang ikut berubah bila owner mengubah harga, dan kasir diberi tahu. Barang tanpa harga tidak bisa dijual. Harga Level 2–4 yang dikosongkan otomatis memakai harga Level 1.

## Operasional Lainnya

- **Pelunasan piutang**: Kontak → tombol *Bayar* pada pelanggan, atau Laporan → Piutang. Pembayaran tunai masuk ke rekap shift kasir.
- **Tutup shift**: kas seharusnya = modal awal + penjualan tunai + pelunasan tunai − refund retur tunai − pengeluaran. Selisih ditampilkan saat shift ditutup.
- **Stok opname massal**: Stok Opname → Template → isi kolom *Stok Fisik* → Import. Perubahan tercatat di kartu stok.
- **Profil toko & printer**: Pengaturan → Profil Toko & Struk (nama/alamat/kaki struk) dan opsi cetak langsung ke printer thermal USB (Chrome/Edge).
- **Jual per satuan besar**: Barang → edit → *Satuan Jual* → tambah mis. "Dus (12)" dengan harga sendiri. Di kasir, pilih satuan pada baris keranjang. Stok tetap dihitung dalam satuan dasar; harga Dus ikut naik/turun saat harga Level 1 diubah lewat update massal.
- **Barang paket**: stok paket dihitung dari stok komponennya; saat paket terjual, stok komponen yang berkurang (dan kembali saat retur/void).
- **Void transaksi**: Penjualan → detail faktur → *VOID* (perlu izin `sale.void`, default Owner/Manager). Untuk salah input di shift yang masih berjalan; stok, kas/bank, piutang, dan poin dikembalikan. Faktur dari shift yang sudah ditutup atau yang sudah diretur harus lewat menu Retur.
- **Baca daftar harga supplier (OCR)**: Media → upload foto price list. Model default memakai Gemini Flash terbaru di OpenRouter (bisa diganti lewat `VITE_OPENROUTER_VISION_MODEL`). Tanpa cloud, teks hasil baca tetap disimpan di perangkat untuk AI.

## Cara Pakai (5 Menit)

### 1. Install

```bash
npm install
```

### 2. Jalankan

```bash
npm run dev
```

Buka browser ke `http://localhost:3000`

### 3. Login Default

| Username | Password | Akses |
|----------|----------|-------|
| admin    | 123      | Semua fitur |
| kasir    | 123      | Kasir + lihat penjualan |
| gudang   | 123      | Stok + terima barang |

> ⚠️ Segera ganti password default setelah login pertama kali!

## Konfigurasi (Opsional)

Jika ingin fitur tambahan, salin `.env.example` → `.env.local`:

```bash
copy .env.example .env.local
```

### Fitur AI (Opsional)
1. Daftar di [openrouter.ai](https://openrouter.ai/settings/keys) (gratis)
2. Isi `VITE_OPENROUTER_API_KEY` di `.env.local`
3. Restart `npm run dev`

### Sinkron Antar Perangkat (Opsional)
Jika punya 2+ komputer/tablet yang perlu data sama:
1. Buat project gratis di [supabase.com](https://supabase.com)
2. Isi `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY`
3. Set `VITE_CLOUD_ENABLED=true`

### Catatan Sinkronisasi
- Perubahan dari beberapa perangkat digabung per bagian data (harga, stok, profil), jadi harga baru dari owner dan penjualan kasir yang terjadi bersamaan sama-sama tersimpan.
- Stok digabung dari kartu stok: bila dua kasir sama-sama **offline** dan menjual barang yang sama, stok akhir tetap benar setelah keduanya online (mis. 24 − 2 − 1 = 21). Hasil stok opname terakhir menjadi patokan.
- Perangkat baru yang bergabung ke workspace memakai data toko dari cloud apa adanya (data contoh bawaan tidak ikut tercampur). Hubungkan perangkat ke cloud **sebelum** mulai bertransaksi.

### Mengamankan Cloud (wajib sebelum dipakai sungguhan)
Tanpa langkah ini, siapa pun yang tahu URL project dan *anon key* (keduanya ikut terbawa di aplikasi) bisa membaca seluruh data toko, termasuk hash password user.

1. Supabase Dashboard → **SQL Editor** → jalankan isi file [`supabase/setup.sql`](supabase/setup.sql). Bucket menjadi private dan hanya akun anggota toko yang boleh membaca/menulis.
2. Hapus policy lama di `storage.objects` yang memberi akses ke `anon`/`public` (perintah untuk melihatnya ada di bagian 5 file SQL).
3. **Authentication → Users → Add user**: buat akun cloud toko (email + password kuat, centang *Auto Confirm*).
4. Daftarkan akun itu ke Store ID toko dengan perintah `insert into public.pos_workspace_members ...` di bagian bawah file SQL.
5. Di tiap perangkat: layar login atau **Pengaturan → Keamanan Cloud** → *Hubungkan ke Cloud* dengan email & password akun cloud toko (cukup sekali; token diperbarui otomatis). Login staf (admin/kasir) tetap seperti biasa.

Perangkat yang belum terhubung tetap bisa bertransaksi secara lokal, tetapi datanya tidak terkirim; aplikasi menampilkan peringatan sampai perangkat dihubungkan. Jika perangkat hilang, ganti password akun cloud di Supabase.

- Ganti password default `admin`/`kasir`/`gudang` sebelum dipakai.

## Pengujian

```bash
npm run test:ci    # typecheck + unit test + build
npm run test:e2e   # simulasi operasional di browser (Playwright)
```

## Build untuk Production

```bash
npm run build
```

Hasil build ada di folder `dist/`. Tinggal upload ke hosting apapun (Vercel, Netlify, VPS, dll).

## Tips Penggunaan

- **Pertama kali**: Masukkan data barang dulu di menu Master Data
- **Barcode**: Bisa pakai scanner USB, langsung ketik di kolom pencarian kasir
- **Backup**: Rutin export backup dari menu Pengaturan → Export Backup
- **Cetak Struk**: Support printer thermal via USB (ESC/POS) atau print biasa

## Teknologi

React + Vite + Tailwind CSS + Zustand. Tidak perlu database server — semua tersimpan di browser (IndexedDB/localStorage).
