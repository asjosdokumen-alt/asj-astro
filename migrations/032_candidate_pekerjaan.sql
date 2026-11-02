-- 032_candidate_pekerjaan.sql
--
-- SATU SUMBER untuk riwayat kerja.
--
-- KENAPA
--   Satu fakta pekerjaan sekarang hidup di EMPAT tempat sekaligus, terukur
--   2026-11-02 pada 262 baris master:
--     · kolom pekerjaan_1..3_* (maksimum 3 baris — batas CETAK yang dipaksa
--       jadi batas DATA, jadi kandidat tidak bisa menulis pekerjaan keempat)
--     · ai_data_json.pekerjaan[]  (teks JSON; berisi duplikat persis dan tahun
--       yang saling bertentangan di dalam satu objek: `masuk` 2024-07 tapi
--       `tahun_masuk` 2025-05)
--     · database_candidate        (salinan operasional, disalin kode)
--     · riwayat_pekerjaan_json    (salinan keempat, TIDAK dibaca kode mana pun)
--   Hasilnya 70 entri tapi hanya 65 unik, dan tiap jalur tulis harus mengingat
--   keempatnya.
--
-- APA
--   Tabel anak, satu baris per pekerjaan, TANPA batas jumlah. Batas 3 berhenti
--   menjadi batasan data; formulir cetak boleh menampilkan N pertama saja.
--
--   `urutan` disimpan (bukan dihitung saat baca) supaya urutan yang dilihat
--   kandidat bisa dipakai apa adanya oleh rirekisho, dan supaya
--   `UNIQUE (id_kandidat, urutan)` membuat dua baris berebut slot yang sama
--   menjadi mustahil.
--
--   `UNIQUE (id_kandidat, lower(trim(perusahaan)), coalesce(tahun_masuk,''))`
--   adalah penjaga duplikat yang sesungguhnya: aplikasi boleh lupa, constraint
--   tidak. Duplikat yang terukur kemarin semuanya berbentuk "perusahaan sama +
--   tahun masuk sama".
--
--   `tahun_masuk`/`tahun_keluar` bertipe TEXT, bukan DATE: data nyata berisi
--   "2021", "2021-03", "Juli 2017", dan "Sampai Sekarang". Memaksakan DATE akan
--   membuang informasi yang sudah dipakai renderer (`periodeKey`).
--
-- CATATAN PENTING — MIGRASI INI BELUM MENGUBAH JALUR BACA/TULIS
--   Setelah migrasi ini tabel terisi dan bersih, tetapi `buildMasterNested`
--   masih membaca kolom `pekerjaan_1..3`. Artinya perilaku aplikasi BELUM
--   berubah: ini fondasi, bukan pemindahan. Pemindahan baca+tulis harus
--   dilakukan BERSAMAAN — membaca dari tabel sementara menulis ke kolom akan
--   membuat hasil edit tidak terlihat (lebih buruk daripada sekarang).
--
--   FK ke master belum dipasang: `master_database_candidate.id_kandidat` belum
--   punya UNIQUE constraint, dan FK menuntutnya. Dipasang setelah itu ada.

CREATE TABLE IF NOT EXISTS public.candidate_pekerjaan (
  id            BIGSERIAL PRIMARY KEY,
  id_kandidat   TEXT NOT NULL,
  urutan        INT  NOT NULL,
  perusahaan    TEXT NOT NULL,
  perusahaan_jp TEXT,
  jabatan       TEXT,
  jabatan_jp    TEXT,
  tahun_masuk   TEXT,
  tahun_keluar  TEXT,
  gaji          TEXT,
  jenis         TEXT,
  bidang        TEXT,
  catatan       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT candidate_pekerjaan_perusahaan_isi CHECK (length(trim(perusahaan)) > 0),
  CONSTRAINT candidate_pekerjaan_urutan_positif CHECK (urutan >= 1),
  CONSTRAINT candidate_pekerjaan_slot_unik UNIQUE (id_kandidat, urutan)
);

-- Penjaga duplikat memakai UNIQUE INDEX, bukan UNIQUE constraint: constraint
-- tabel tidak menerima EKSPRESI (`lower(trim(...))`, `coalesce(...)`) — Postgres
-- menjawab `syntax error at or near "("`. Index ekspresi adalah bentuk yang sah
-- dan tetap ditegakkan database, jadi aplikasi tidak bisa melewatinya.
CREATE UNIQUE INDEX IF NOT EXISTS candidate_pekerjaan_tak_duplikat
  ON public.candidate_pekerjaan (id_kandidat, lower(trim(perusahaan)), coalesce(tahun_masuk, ''));

CREATE INDEX IF NOT EXISTS candidate_pekerjaan_kandidat_idx
  ON public.candidate_pekerjaan (id_kandidat, urutan);

-- Postur sama dengan tabel lain: RLS aktif TANPA policy, jadi hanya service
-- role (BYPASSRLS) yang bisa membaca/menulis. `verify:rls` menegakkan ini.
ALTER TABLE public.candidate_pekerjaan ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.candidate_pekerjaan IS
  'Riwayat kerja kandidat, satu baris per pekerjaan, tanpa batas 3. Sumber tunggal untuk rirekisho dan semua template CV.';
COMMENT ON COLUMN public.candidate_pekerjaan.urutan IS
  'Urutan kronologis (paling lama dulu), disimpan supaya cetakan memakai urutan yang sama dengan yang dilihat kandidat.';

-- ── Backfill dari kolom pekerjaan_1..3 ────────────────────────────────────
-- Idempoten (`ON CONFLICT DO NOTHING`), jadi menjalankan ulang tidak menggandakan.
-- Duplikat dibuang dengan kunci yang SAMA dengan constraint di atas; urutan
-- dihitung dari tahun masuk (bukan nomor slot), karena nomor slot adalah urutan
-- ketik siswa.
WITH src AS (
  SELECT m.id_kandidat,
         f.slot,
         trim(f.nm) AS perusahaan,
         NULLIF(trim(f.nmjp), '') AS perusahaan_jp,
         NULLIF(trim(f.jb),   '') AS jabatan,
         NULLIF(trim(f.jbjp), '') AS jabatan_jp,
         NULLIF(trim(f.tm),   '') AS tahun_masuk,
         NULLIF(trim(f.tk),   '') AS tahun_keluar,
         NULLIF(trim(f.gj),   '') AS gaji,
         NULLIF(trim(f.jn),   '') AS jenis,
         NULLIF(trim(f.bd),   '') AS bidang,
         NULLIF(trim(f.ct),   '') AS catatan
  FROM public.master_database_candidate m
  CROSS JOIN LATERAL (VALUES
    (1, m.pekerjaan_1_nama_perusahaan, m.pekerjaan_1_perusahaan_jp, m.pekerjaan_1_jabatan, m.pekerjaan_1_jabatan_jp, m.pekerjaan_1_tahun_masuk, m.pekerjaan_1_tahun_keluar, m.pekerjaan_1_gaji, m.pekerjaan_1_jenis, m.pekerjaan_1_bidang, m.pekerjaan_1_catatan),
    (2, m.pekerjaan_2_nama_perusahaan, m.pekerjaan_2_perusahaan_jp, m.pekerjaan_2_jabatan, m.pekerjaan_2_jabatan_jp, m.pekerjaan_2_tahun_masuk, m.pekerjaan_2_tahun_keluar, m.pekerjaan_2_gaji, m.pekerjaan_2_jenis, m.pekerjaan_2_bidang, m.pekerjaan_2_catatan),
    (3, m.pekerjaan_3_nama_perusahaan, m.pekerjaan_3_perusahaan_jp, m.pekerjaan_3_jabatan, m.pekerjaan_3_jabatan_jp, m.pekerjaan_3_tahun_masuk, m.pekerjaan_3_tahun_keluar, m.pekerjaan_3_gaji, m.pekerjaan_3_jenis, m.pekerjaan_3_bidang, m.pekerjaan_3_catatan)
  ) AS f(slot, nm, nmjp, jb, jbjp, tm, tk, gj, jn, bd, ct)
  WHERE m.id_kandidat IS NOT NULL
    AND f.nm IS NOT NULL
    AND trim(f.nm) <> ''
    AND trim(f.nm) <> '-'
),
dedup AS (
  SELECT DISTINCT ON (id_kandidat, lower(perusahaan), coalesce(tahun_masuk, ''))
         id_kandidat, slot, perusahaan, perusahaan_jp, jabatan, jabatan_jp,
         tahun_masuk, tahun_keluar, gaji, jenis, bidang, catatan
  FROM src
  ORDER BY id_kandidat, lower(perusahaan), coalesce(tahun_masuk, ''), slot
),
ordered AS (
  SELECT *,
         row_number() OVER (
           PARTITION BY id_kandidat
           ORDER BY NULLIF(regexp_replace(coalesce(tahun_masuk, ''), '[^0-9]', '', 'g'), '')::int NULLS LAST,
                    slot
         ) AS rn
  FROM dedup
)
INSERT INTO public.candidate_pekerjaan
  (id_kandidat, urutan, perusahaan, perusahaan_jp, jabatan, jabatan_jp,
   tahun_masuk, tahun_keluar, gaji, jenis, bidang, catatan)
SELECT id_kandidat, rn, perusahaan, perusahaan_jp, jabatan, jabatan_jp,
       tahun_masuk, tahun_keluar, gaji, jenis, bidang, catatan
FROM ordered
ON CONFLICT DO NOTHING;
