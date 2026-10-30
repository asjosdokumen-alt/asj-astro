-- 027_pendidikan_status_sekolah.sql
--
-- Kolom 国公私 (国立/公立/私立) di form 履歴書 KINKI/JIPA.
--
-- Sebelum ini renderer MENEBak dari nama sekolah: awalan SDN/SMPN/SMAN → 公立,
-- sisanya 私立. Tebakan itu salah untuk sekolah negeri yang namanya tidak
-- berawalan itu (mis. MADRASAH ALIYAH NEGERI), dan kandidat tidak punya cara
-- mengoreksinya. Pemilik 2026-10-30: "negeri swasta nya gak dipilih dari
-- dropdown padahal ada" → minta dropdown per baris, terisi otomatis dari nama
-- sekolah dan bisa dikoreksi.
--
-- Nilai: '' (belum diisi) | 'NEGERI' | 'SWASTA'. Disimpan sebagai teks bebas
-- seperti kolom riwayat lain, supaya baris lama tidak perlu di-backfill:
-- renderer memakai tebakan dari nama selama kolom ini kosong.

alter table master_database_candidate
  add column if not exists pendidikan_1_status_sekolah text default '',
  add column if not exists pendidikan_2_status_sekolah text default '',
  add column if not exists pendidikan_3_status_sekolah text default '',
  add column if not exists pendidikan_4_status_sekolah text default '',
  add column if not exists pendidikan_5_status_sekolah text default '';

comment on column master_database_candidate.pendidikan_1_status_sekolah is
  'NEGERI | SWASTA — dicetak sebagai 公立/私立. Kosong = tebak dari nama sekolah.';
