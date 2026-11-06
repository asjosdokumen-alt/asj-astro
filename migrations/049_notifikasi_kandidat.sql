-- 049_notifikasi_kandidat.sql
--
-- DUA HAL, satu sebab: kandidat tidak punya tempat menyimpan pemberitahuan.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 1. `alasan_tolak` — alasan penolakan tidak lagi menimpa daftar dokumen
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `database_asj_form.keterangan` menyimpan DUA hal yang tidak berhubungan:
--   · daftar dokumen  `KTP:https://…;KK:https://…` (ditulis jalur upload)
--   · alasan penolakan `Lamaran ditolak` (ditulis `handleRejectForm`)
--
-- Keduanya memakai kolom yang sama, dan `handleFormStatus` menulis dengan
-- PATCH biasa — jadi menolak satu baris MENGHAPUS seluruh daftar dokumennya.
-- Terukur 2026-11-06: baris 558 berstatus GAGAL dengan `keterangan` berisi
-- "Lamaran ditolak", sementara baris lain di tabel yang sama berisi URL.
--
-- Kolom terpisah membuat dua hal itu tidak bisa saling menghapus, dan membuat
-- alasan penolakan aman dikirim ke kandidat: `keterangan` berisi URL dokumen
-- miliknya sendiri, tetapi mencampurnya dengan alasan berarti setiap pembaca
-- harus menebak mana yang mana.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 2. `notifikasi_kandidat` — kotak masuk, bukan sekadar push
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Push adalah kanal TERBAIK, bukan kanal SATU-SATUNYA. Dua batas nyata:
--   · di iOS, web push hanya bekerja untuk web app yang DIPASANG ke Layar
--     Utama, dan izinnya harus diminta dari gestur pengguna (WebKit, 2023);
--   · push bisa gagal tanpa jejak (token mati, izin dicabut, perangkat offline
--     lebih lama dari masa simpan FCM).
-- Kalau satu-satunya salinan pemberitahuan ada di push, kegagalan itu berarti
-- informasi hilang — bukan tertunda.
--
-- Karena itu setiap push DITULIS DULU ke tabel ini, lalu dikirim. Urutannya
-- penting: kalau pengiriman gagal, barisnya tetap ada dan muncul di dasbor.
--
-- `dibaca_pada` (bukan boolean) menyimpan KAPAN dibaca — cukup untuk badge dan
-- untuk memisahkan "belum dilihat" dari "sudah dilihat".

ALTER TABLE public.database_asj_form
  ADD COLUMN IF NOT EXISTS alasan_tolak text;

CREATE TABLE IF NOT EXISTS public.notifikasi_kandidat (
  id           bigserial PRIMARY KEY,
  no_wa        text        NOT NULL,
  -- Jenis ditutup di sini: nilai asing akan membuat filter di UI menampilkan
  -- kelompok kosong tanpa satu pun error.
  jenis        text        NOT NULL,
  judul        text        NOT NULL,
  isi          text        NOT NULL DEFAULT '',
  -- Tujuan klik. Relatif terhadap origin; divalidasi di service (hanya path).
  url          text        NOT NULL DEFAULT '/candidate',
  dibaca_pada  timestamptz,
  dibuat_pada  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notifikasi_kandidat_jenis_sah
    CHECK (jenis IN ('lamaran', 'dokumen', 'jadwal', 'sistem'))
);

-- Daftar kotak masuk: terbaru dulu, per siswa.
CREATE INDEX IF NOT EXISTS notifikasi_kandidat_wa_idx
  ON public.notifikasi_kandidat (no_wa, dibuat_pada DESC);

-- Hitung badge "belum dibaca" — indeks parsial supaya tetap murah saat tabel
-- sudah berisi ribuan baris yang mayoritas sudah dibaca.
CREATE INDEX IF NOT EXISTS notifikasi_kandidat_belum_idx
  ON public.notifikasi_kandidat (no_wa)
  WHERE dibaca_pada IS NULL;

-- RLS ON tanpa policy = hanya `asj_service` (BYPASSRLS) yang bisa membaca.
-- Pola yang sama dengan 28 tabel lain: isi kotak masuk adalah data pribadi.
ALTER TABLE public.notifikasi_kandidat ENABLE ROW LEVEL SECURITY;
