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
