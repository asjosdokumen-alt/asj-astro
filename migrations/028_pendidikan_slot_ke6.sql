-- 028_pendidikan_slot_ke6.sql
--
-- Slot pendidikan ke-6.
--
-- Sebelum ini riwayat sekolah dipaku 5 slot (pendidikan_1..5). Seed formnya
-- adalah SD, SMP, SMA/SMK, D3, S1 — TIDAK ADA LPK, padahal hampir semua kandidat
-- LPK. Akibatnya blok 日本語学校 di form KINKI kosong untuk sebagian besar
-- kandidat, dan menambah LPK berarti menghapus salah satu jenjang lain.
--
-- Pemilik 2026-10-30 (pertanyaan di sesi yang sama): "tambahkan slot di db".
-- Dengan slot ke-6, seed bisa memuat SD, SMP, SMA/SMK, LPK tanpa menghilangkan
-- D3/S1 — kandidat tinggal menghapus baris yang tidak dipakai (dan sejak sesi
-- ini menghapus memang menghapus, bukan hanya menyembunyikan).

alter table master_database_candidate
  add column if not exists pendidikan_6_tingkat text default '',
  add column if not exists pendidikan_6_nama_sekolah text default '',
  add column if not exists pendidikan_6_sekolah_jp text default '',
  add column if not exists pendidikan_6_jurusan_id text default '',
  add column if not exists pendidikan_6_jurusan_jp text default '',
  add column if not exists pendidikan_6_tahun_masuk text default '',
  add column if not exists pendidikan_6_tahun_lulus text default '',
  add column if not exists pendidikan_6_status_sekolah text default '';
