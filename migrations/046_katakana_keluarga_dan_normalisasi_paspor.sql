-- 046_katakana_keluarga_dan_normalisasi_paspor.sql
--
-- Dua hal, keduanya sisa dari pola yang sama: nilai yang dihasilkan/diisi di
-- satu tempat tetapi tidak punya tujuan di tempat lain.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 1. NAMA KELUARGA DALAM KATAKANA (5 kolom baru)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Tombol "Terjemahkan semua kolom" SUDAH membuat tugas [KATAKANA] untuk nama
-- anggota keluarga (`kumpulkanTugasTerjemah`), hasilnya tampil di form, dan
-- payload simpan mengirim `keluarga[i].katakana`. Tetapi tidak ada kolom
-- tujuan: `buildRiwayatSlots` hanya menulis `keluarga_N_nama`, dan
-- `buildMasterNested` tidak membacanya. Jadi terjemahan itu dibuang tanpa
-- pesan — rirekisho mencetak nama Latin ("SOIRIN") di kolom 氏名.
--
-- Lima kolom, sejajar dengan lima slot keluarga yang sudah ada.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 2. NORMALISASI `no_paspor` YANG BUKAN NOMOR
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Terukur: satu baris berisi "tidak" di master dan "Tidak punya" di salinan
-- operasional — dua ejaan untuk arti yang sama, dan keduanya bukan nomor
-- paspor. Sepuluh baris lain di kolom yang sama memakai `-` sebagai penanda
-- "tidak ada", jadi konvensi itu yang dipakai.
--
-- "ADA" (satu baris) SENGAJA tidak disentuh: itu penanda "punya paspor tetapi
-- nomornya belum dicatat", informasi yang berbeda dari "tidak punya".

ALTER TABLE public.master_database_candidate
  ADD COLUMN IF NOT EXISTS keluarga_1_katakana text,
  ADD COLUMN IF NOT EXISTS keluarga_2_katakana text,
  ADD COLUMN IF NOT EXISTS keluarga_3_katakana text,
  ADD COLUMN IF NOT EXISTS keluarga_4_katakana text,
  ADD COLUMN IF NOT EXISTS keluarga_5_katakana text;

COMMENT ON COLUMN public.master_database_candidate.keluarga_1_katakana IS
  '氏名 (katakana) anggota keluarga slot 1 — diisi tombol Terjemahkan / CV AI';

UPDATE public.master_database_candidate
SET no_paspor = '-'
WHERE btrim(coalesce(no_paspor, '')) ~* '^(tidak|tidak punya)$';

-- Salinan operasional ikut diselaraskan bila trigger cermin belum menyentuhnya.
UPDATE public.database_candidate d
SET no_pasport = '-'
FROM public.master_database_candidate m
WHERE d.no_wa = m.no_wa
  AND btrim(m.no_paspor) = '-'
  AND btrim(coalesce(d.no_pasport, '')) ~* '^(tidak|tidak punya)$';
