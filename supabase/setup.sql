-- =====================================================================
-- POS Hulio — Mengamankan data toko di Supabase
-- Jalankan sekali di Supabase Dashboard → SQL Editor → New query → Run.
-- Aman dijalankan ulang (idempotent).
--
-- Hasil:
--   * Bucket 'erp-media' menjadi PRIVATE (tidak bisa dibaca lewat URL publik/anon key).
--   * Hanya akun Supabase yang terdaftar sebagai anggota toko (tabel pos_workspace_members)
--     yang boleh membaca/menulis file toko: state/<STORE_ID>/... dan <STORE_ID>/... (media).
--
-- Ganti 'erp-media' di bawah bila Anda memakai nama bucket lain (VITE_SUPABASE_BUCKET).
-- =====================================================================

-- 1) Bucket private
insert into storage.buckets (id, name, public)
values ('erp-media', 'erp-media', false)
on conflict (id) do update set public = false;

-- 2) Daftar anggota toko: akun Supabase mana boleh mengakses Store ID mana.
create table if not exists public.pos_workspace_members (
  user_id uuid not null references auth.users (id) on delete cascade,
  store_id text not null,
  note text,
  created_at timestamptz not null default now(),
  primary key (user_id, store_id)
);

-- Tabel ini hanya diubah lewat SQL Editor (service role). Tanpa policy = tidak bisa diakses dari aplikasi.
alter table public.pos_workspace_members enable row level security;

-- 3) Fungsi pemeriksa akses berdasarkan path objek.
--    state/<store>/app-data.txt, state/<store>/locks/..., state/<store>/config-ai.json → store = segmen ke-2
--    <store>/<file media>                                                      → store = segmen ke-1
create or replace function public.pos_can_access_object(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.pos_workspace_members m
    where m.user_id = auth.uid()
      and m.store_id = case
        when split_part(object_name, '/', 1) = 'state' then split_part(object_name, '/', 2)
        else split_part(object_name, '/', 1)
      end
  );
$$;

revoke all on function public.pos_can_access_object(text) from public;
grant execute on function public.pos_can_access_object(text) to authenticated;

-- 4) Policy storage: hanya anggota toko (role authenticated). Anon key tidak mendapat akses apa pun.
drop policy if exists "pos_hulio_select" on storage.objects;
drop policy if exists "pos_hulio_insert" on storage.objects;
drop policy if exists "pos_hulio_update" on storage.objects;
drop policy if exists "pos_hulio_delete" on storage.objects;

create policy "pos_hulio_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'erp-media' and public.pos_can_access_object(name));

create policy "pos_hulio_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'erp-media' and public.pos_can_access_object(name));

create policy "pos_hulio_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'erp-media' and public.pos_can_access_object(name))
  with check (bucket_id = 'erp-media' and public.pos_can_access_object(name));

create policy "pos_hulio_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'erp-media' and public.pos_can_access_object(name));

-- 5) PENTING: hapus policy lama yang mengizinkan akses anon/publik ke bucket ini.
--    Lihat daftar policy yang ada:
--      select policyname, roles, cmd, qual, with_check
--      from pg_policies where schemaname = 'storage' and tablename = 'objects';
--    Lalu hapus yang memberi akses ke role 'anon' / 'public' untuk bucket ini, contoh:
--      drop policy "nama policy lama" on storage.objects;

-- =====================================================================
-- MENDAFTARKAN AKUN TOKO (lakukan setelah langkah di atas)
-- 1. Supabase Dashboard → Authentication → Users → Add user → isi email & password
--    (centang "Auto Confirm User"). Akun ini dipakai untuk login cloud di setiap perangkat toko.
-- 2. Daftarkan akun tersebut ke Store ID toko (sama dengan VITE_STORE_ID / Workspace ID di aplikasi):
--
-- insert into public.pos_workspace_members (user_id, store_id, note)
-- select id, 'bengkel_saya', 'Akun perangkat toko'
-- from auth.users where email = 'toko@contoh.com'
-- on conflict do nothing;
--
-- Mencabut akses (mis. perangkat hilang): ganti password akun di Authentication → Users,
-- atau hapus barisnya:
-- delete from public.pos_workspace_members where store_id = 'bengkel_saya'
--   and user_id = (select id from auth.users where email = 'toko@contoh.com');
-- =====================================================================
