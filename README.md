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

## Dua Mode: Simple & Lengkap

Pengaturan → **Mode Aplikasi** (owner/manager). Pilihan tersinkron ke semua perangkat toko; berganti mode tidak mengubah data.

- **Mode Simple** (default): tampilan seperti biasa — kasir cepat, barang, kontak, pembelian, stok opname, akuntansi & laporan inti.
- **Mode Lengkap**: menambah fitur ala ERP untuk bengkel/toko sparepart:
  - **Kasir**: tahan transaksi (F3) & daftar tahan (F4), bayar campuran (tunai + QRIS/transfer/debit + deposit + kredit), diskon per barang (`10`, `10+5+2`, atau `5000`), pilih mekanik per baris (komisi), nomor seri & garansi, peringatan harga di bawah modal/margin minimal, bonus Beli X Gratis Y otomatis, layar pelanggan di monitor kedua (F7), F8 bayar, F9 transaksi baru.
  - **Servis / WO**: estimasi → dikerjakan → selesai → faktur di kasir; DP masuk deposit pelanggan dan otomatis dipakai saat faktur. Cetak estimasi/WO.
  - **Barang jasa** (tanpa stok), **komisi** per barang (% atau Rp) atau default mekanik, **Mekanik & Komisi** (rekap, dikurangi retur, bayar komisi).
  - **Deposit pelanggan**: setor, pakai di kasir, kembalikan.
  - **Promo** terjadwal (tanggal, hari, jam, prioritas, minimal belanja) dan Beli X Gratis Y.
  - **Gudang & Transfer**: kasir menjual dari Gudang Utama; stok gudang/cabang lain dipindah lewat transfer. PO bisa diterima ke gudang lain.
  - **Retur Beli** ke supplier: potong hutang PO atau refund tunai/transfer.
  - **Jurnal & Neraca**: jurnal double-entry otomatis dari setiap transaksi, buku besar, neraca, laba rugi, jurnal manual, **tutup buku** (transaksi di periode terkunci tidak bisa di-void/dihapus).
  - **Laporan Lengkap**: laba per barang, per kategori/merek/mekanik/supplier, barang tidak laku, jam & hari ramai, mutasi stok, cek garansi per nomor seri.
  - **Label barcode** (Code 128, A4 3 kolom atau roll thermal) dengan opsi sandi harga modal.
  - **Pindah dari iPos**: impor CSV hasil Excel iPos (item termasuk satuan besar, pelanggan, supplier, saldo awal piutang).
  - **Backup otomatis** per perangkat (3 slot bergilir, opsional ke folder).

### Akuntansi & sinkronisasi
- Saldo akun **diturunkan dari dokumen transaksi** (penjualan, retur, penerimaan PO, pembayaran, kas keluar, opname, deposit, komisi, retur beli, jurnal manual). Saldo akun lama menjadi saldo awal; akun Persediaan dibuat dengan nilai stok saat ini dan akun Modal sebagai penyeimbang. Ini berlaku di kedua mode.
- Hutang supplier kini dicatat saat **barang diterima** (bukan saat PO dibuat); penjualan mencatat HPP.
- Piutang, poin, dan deposit pelanggan berubah lewat **buku besar pelanggan** (append-only), sehingga dua kasir yang offline bersamaan dan menjual kredit ke pelanggan yang sama sama-sama tercatat setelah online (sama seperti stok).

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
- **Paling aman (disarankan):** simpan kunci OpenRouter sebagai secret Worker — `npx wrangler secret put OPENROUTER_API_KEY`. Perangkat yang login cloud memakai AI lewat proxy `/api/stores/:id/ai`; kunci tidak pernah sampai ke browser.
- Alternatif lokal: isi `VITE_OPENROUTER_API_KEY` di `.env.local` atau di Pengaturan → AI.

### Sinkron Antar Perangkat (Cloudflare)
Jika punya 2+ komputer/tablet yang perlu data sama:
1. Pengaturan → **Cloud Sync**: isi **Store ID** unik (mis. `bengkel_jaya`), centang *Aktifkan*, Simpan.
2. Perangkat pertama (owner): Pengaturan → **Keamanan Cloud** → *Daftarkan toko baru* — email, password (min. 8 karakter), dan **kode pendaftaran** (`SETUP_KEY` server).
3. Perangkat lain: isi Store ID yang sama (atau tempel *kode aktivasi* yang ditampilkan di Pengaturan), lalu *Login perangkat* dengan email & password cloud toko.

Login staf (admin/kasir/gudang) tetap seperti biasa. Perangkat yang belum login cloud tetap bisa bertransaksi lokal; aplikasi menampilkan peringatan sampai perangkat dihubungkan. Jika perangkat hilang: Keamanan Cloud → *Ganti password* — semua perangkat lain otomatis keluar.

### Catatan Sinkronisasi
- Data toko disimpan di **Durable Object per toko** dengan nomor versi. Setiap simpan memakai *compare-and-swap*: jika perangkat lain menyimpan lebih dulu, perangkat menarik ulang, menggabungkan, lalu menyimpan lagi — tidak ada perubahan yang tertimpa diam-diam.
- Perubahan dari beberapa perangkat digabung per bagian data (harga, stok, profil), jadi harga baru dari owner dan penjualan kasir yang terjadi bersamaan sama-sama tersimpan.
- Stok digabung dari kartu stok: bila dua kasir sama-sama **offline** dan menjual barang yang sama, stok akhir tetap benar setelah keduanya online (mis. 24 − 2 − 1 = 21). Piutang/poin/deposit pelanggan digabung dengan cara yang sama.
- Perangkat baru yang bergabung memakai data toko dari cloud apa adanya (data contoh bawaan tidak ikut tercampur). Hubungkan perangkat ke cloud **sebelum** mulai bertransaksi.
- Ganti password default `admin`/`kasir`/`gudang` sebelum dipakai.

## Pengujian

```bash
npm run test:ci    # typecheck (aplikasi + Worker) + unit test + build
npm run test:e2e   # simulasi operasional di browser, termasuk backend Cloudflare asli secara lokal
```

## Deploy ke Cloudflare

Arsitektur (paket gratis Workers cukup):

| Bagian | Layanan Cloudflare |
|---|---|
| Aplikasi (SPA) | Workers Static Assets |
| API `/api/*` | Worker (`worker/index.ts`) |
| Data toko, akun cloud, sesi, lock | Durable Object SQLite per toko (`worker/storeObject.ts`) |
| Foto price list / faktur | R2 bucket `poshulio-media` (URL bertanda tangan) |
| Proxy AI | Worker + secret `OPENROUTER_API_KEY` |

Sekali di awal:

```bash
npx wrangler login
npx wrangler r2 bucket create poshulio-media
npx wrangler secret put SETUP_KEY             # kode untuk mendaftarkan toko
npx wrangler secret put MEDIA_SIGNING_SECRET  # string acak panjang
npx wrangler secret put OPENROUTER_API_KEY    # opsional
```

Setiap rilis:

```bash
npm run deploy    # build + wrangler deploy
```

Pengembangan lokal: `npm run dev` menjalankan aplikasi **dan** Worker + Durable Object + R2 (workerd) di `localhost:3000`. Rahasia lokal ada di `.dev.vars` (dibuat otomatis dari `.dev.vars.example`).

## Tips Penggunaan

- **Pertama kali**: Masukkan data barang dulu di menu Master Data
- **Barcode**: Bisa pakai scanner USB, langsung ketik di kolom pencarian kasir
- **Backup**: Rutin export backup dari menu Pengaturan → Export Backup
- **Cetak Struk**: Support printer thermal via USB (ESC/POS) atau print biasa

## Teknologi

React + Vite + Tailwind CSS + Zustand di browser (offline-first: IndexedDB/localStorage), Cloudflare Workers + Durable Objects + R2 untuk sinkron, akun cloud, dan file.
