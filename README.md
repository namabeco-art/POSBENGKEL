# POS Hulio

POS retail berbasis React + Vite dengan mode `local` atau `cloud`.

## Tujuan Setup

Aplikasi ini sekarang mendukung 2 pola deployment:

1. `Environment-driven deployment`
   Cocok untuk server, VPS, Vercel, atau host lain.
   Semua database dan API diisi lewat file `.env`.

2. `Runtime settings deployment`
Cocok untuk demo atau instalasi cepat.
Konfigurasi database dan OpenRouter bisa diisi dari halaman Settings.

## Quick Start

1. Install dependency:
   `npm install`
2. Salin file env:
   `Copy-Item .env.example .env.local`
3. Isi variabel yang dibutuhkan.
4. Jalankan:
   `npm run dev`

## Environment Variables

Gunakan variabel berikut:

```env
VITE_OPENROUTER_API_KEY=
VITE_OPENROUTER_MODEL=openrouter/auto
VITE_CLOUD_ENABLED=false
VITE_UPSTASH_URL=
VITE_UPSTASH_TOKEN=
VITE_STORE_ID=demo_store
VITE_ALLOW_RUNTIME_SETTINGS=true
```

Penjelasan:

- `VITE_OPENROUTER_API_KEY`: API key untuk fitur AI via OpenRouter.
- `VITE_OPENROUTER_MODEL`: model routing OpenRouter, default `openrouter/auto`.
- `VITE_CLOUD_ENABLED`: `true` jika ingin sinkronisasi cloud aktif.
- `VITE_UPSTASH_URL`: endpoint REST Upstash Redis.
- `VITE_UPSTASH_TOKEN`: token REST Upstash.
- `VITE_STORE_ID`: identitas store/workspace.
- `VITE_ALLOW_RUNTIME_SETTINGS`: `false` jika konfigurasi ingin dikunci dari UI dan hanya boleh diatur lewat env.

## Mode Deployment

### 1. Local only

Gunakan:

```env
VITE_CLOUD_ENABLED=false
VITE_OPENROUTER_API_KEY=your_openrouter_key
VITE_OPENROUTER_MODEL=openrouter/auto
```

### 2. Cloud with env config

Gunakan:

```env
VITE_CLOUD_ENABLED=true
VITE_UPSTASH_URL=https://your-upstash-url
VITE_UPSTASH_TOKEN=your-token
VITE_STORE_ID=toko_pusat
VITE_OPENROUTER_API_KEY=your_openrouter_key
VITE_OPENROUTER_MODEL=openrouter/auto
VITE_ALLOW_RUNTIME_SETTINGS=false
```

Mode ini paling cocok untuk production karena deploy baru cukup copy `.env` lalu build ulang.

## Build Production

```bash
npm run build
npm run preview
```

Folder hasil build ada di `dist/`.

## Deploy ke Server Lain

Checklist cepat:

1. Copy source code.
2. Jalankan `npm install`.
3. Copy `.env.example` menjadi `.env.local` atau isi env di platform deployment.
4. Jalankan `npm run build`.
5. Serve folder `dist`.

## Catatan Operasional

- Jika env cloud aktif, aplikasi akan memakai konfigurasi dari environment sebagai sumber utama.
- Jika `VITE_ALLOW_RUNTIME_SETTINGS=false`, pengaturan database/API dari UI akan dikunci agar konsisten antar server.
- Untuk production jangka panjang, tetap disarankan memindahkan akses database dan API key ke backend/proxy, bukan langsung dari browser.
