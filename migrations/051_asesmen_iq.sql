-- 051_asesmen_iq.sql
--
-- TES PENALARAN (jenis 'iq') — satu nilai baru pada constraint `jenis`.
--
-- KENAPA MIGRASI BARU, BUKAN MENGUBAH 048
-- ---------------------------------------
-- 048 sudah diterapkan di produksi; checksum-nya terkunci dan mengeditnya akan
-- membuat `migrate` menolak seluruh riwayat. Jadi constraint-nya dilepas di
-- sini, lalu dipasang ulang dengan nilai ketiga.
--
-- KENAPA 'iq' TETAP DITULIS 'iq' DI DATABASE, TAPI TIDAK DISEBUT "IQ" DI UI
-- -------------------------------------------------------------------------
-- Nama kolom adalah urusan internal; yang dibaca siswa dan mitra adalah label.
-- Labelnya "Asesmen Penalaran" karena tes ini tidak punya norma populasi dan
-- tidak diadministrasikan psikolog — lihat catatan di `_lib/asesmen/iq-scorer.ts`.
--
-- `UNIQUE (no_wa, jenis)` dari 048 TIDAK disentuh: aturan "sekali seumur hidup"
-- berlaku sama untuk tes ini, dan yang membuka ulang hanyalah tindakan admin
-- (`resetHasilIq`), bukan sakelar.

ALTER TABLE public.candidate_assessments
  DROP CONSTRAINT IF EXISTS candidate_assessments_jenis_sah;

ALTER TABLE public.candidate_assessments
  ADD CONSTRAINT candidate_assessments_jenis_sah
  CHECK (jenis IN ('mbti', 'mata', 'iq'));
