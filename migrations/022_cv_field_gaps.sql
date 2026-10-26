-- 022_cv_field_gaps.sql — kolom untuk sel CV yang selama ini tidak punya sumber.
--
-- SUMBER ANGKANYA
--   `deliverables/cv-template-sel-kosong-2026-10-26.md` — 93 sel berlabel di
--   empat form CV (Form Asli, Firma Elga Pratama, KINKI, JIPA) yang tidak pernah
--   terisi. 31 di antaranya sudah punya kolomnya (cukup disambungkan di kode);
--   sisanya butuh kolom di sini.
--
-- ATURAN
--   • Semua `text`, nullable, tanpa default — sama dengan 180 kolom teks lain di
--     tabel ini. Form mengirim string; angka (`tes_pushup`, `jarak_jakarta_km`)
--     tetap teks karena satuannya ikut ditulis ("15", "1200 km").
--   • ADDITIVE saja. Tidak ada kolom lama yang diubah atau dibuang, jadi kode
--     versi SEBELUM ini tetap jalan (expand/contract): ia tidak mengenal kolom
--     baru dan tidak menulisnya.
--   • `IF NOT EXISTS` supaya migrasi bisa diulang tanpa error kalau dijalankan
--     di database yang sudah pernah menerimanya.
--
-- KENAPA PER SLOT
--   `pekerjaan_1..3_*` dan `keluarga_1..5_*` mengikuti pola slot yang sudah ada
--   (`pendidikan_1..5_*`). KINKI mencetak 3 blok kerja, JIPA 4 baris kerja dan 8
--   baris keluarga — slot 4/6..8 SENGAJA belum ditambah di sini (lihat catatan
--   di §7 dokumen): mayoritas kandidat ≤3 pekerjaan dan ≤5 anggota keluarga,
--   dan menambah 29 kolom slot lebih dulu akan menggeser seluruh peta form
--   sebelum terbukti dibutuhkan.

ALTER TABLE master_database_candidate
  -- ── pekerjaan: 雇用形態 / 業種 / 備考 ─────────────────────────────────────
  -- KINKI A26/A28/A30 (雇用形態), M26/M28/M30 (業種), Z26/Z28/Z30 (備考);
  -- Firma O16/O18/O20 (雇用形態); JIPA L27..L30 (業種).
  ADD COLUMN IF NOT EXISTS pekerjaan_1_jenis   text,
  ADD COLUMN IF NOT EXISTS pekerjaan_1_bidang  text,
  ADD COLUMN IF NOT EXISTS pekerjaan_1_catatan text,
  ADD COLUMN IF NOT EXISTS pekerjaan_2_jenis   text,
  ADD COLUMN IF NOT EXISTS pekerjaan_2_bidang  text,
  ADD COLUMN IF NOT EXISTS pekerjaan_2_catatan text,
  ADD COLUMN IF NOT EXISTS pekerjaan_3_jenis   text,
  ADD COLUMN IF NOT EXISTS pekerjaan_3_bidang  text,
  ADD COLUMN IF NOT EXISTS pekerjaan_3_catatan text,

  -- ── keluarga: 同居区分 / 電話 ────────────────────────────────────────────
  -- Firma N24:N30 (居住) & O24:O30 (電話); JIPA E33:E40 (同居区分).
  -- `keluarga_N_gaji` sudah ada sejak lama — yang kurang hanya pembacanya.
  ADD COLUMN IF NOT EXISTS keluarga_1_tinggal text,
  ADD COLUMN IF NOT EXISTS keluarga_1_hp      text,
  ADD COLUMN IF NOT EXISTS keluarga_2_tinggal text,
  ADD COLUMN IF NOT EXISTS keluarga_2_hp      text,
  ADD COLUMN IF NOT EXISTS keluarga_3_tinggal text,
  ADD COLUMN IF NOT EXISTS keluarga_3_hp      text,
  ADD COLUMN IF NOT EXISTS keluarga_4_tinggal text,
  ADD COLUMN IF NOT EXISTS keluarga_4_hp      text,
  ADD COLUMN IF NOT EXISTS keluarga_5_tinggal text,
  ADD COLUMN IF NOT EXISTS keluarga_5_hp      text,

  -- ── kenalan di Jepang: 在留資格(在留期間) ────────────────────────────────
  -- JIPA J43. Kolom nama/hubungan/pekerjaan/usia/alamat sudah ada (019).
  ADD COLUMN IF NOT EXISTS kenalan_di_jepang_status_tinggal text,

  -- ── perjalanan & identitas tambahan ──────────────────────────────────────
  -- JIPA E54 (ビザ種類), E55 (在日期間), Firma L32 (渡航経験 negara lain),
  -- KINKI O9 (ジャカルタから…㎞ / 飛行機で…時間…分), M4 (…月取得予定).
  ADD COLUMN IF NOT EXISTS visa_jepang          text,
  ADD COLUMN IF NOT EXISTS lama_di_jepang       text,
  ADD COLUMN IF NOT EXISTS negara_lain          text,
  ADD COLUMN IF NOT EXISTS jarak_jakarta_km     text,
  ADD COLUMN IF NOT EXISTS lama_penerbangan     text,
  ADD COLUMN IF NOT EXISTS rencana_sim_bulan    text,

  -- ── pendidikan: 地域 (wilayah sekolah) ───────────────────────────────────
  -- KINKI J19. Satu kolom, bukan per slot: form itu hanya mencetak baris SMA.
  ADD COLUMN IF NOT EXISTS wilayah_sekolah      text,

  -- ── bahasa & sertifikat ──────────────────────────────────────────────────
  -- Firma L31 (日本語学習期間), KINKI T37 (学習期間) / T39 (学習状況) /
  -- I4 (第…課中) / Q41 (英語レベル) / T41 (その他外国語) / I3 (日本語力).
  -- `sertifikat_lain` = 他資格 (Form Asli H42, JIPA baris 4-5 dari 5).
  -- `catatan_cv` = 付記 (Form Asli A46) dan その他事項 (Firma K33).
  ADD COLUMN IF NOT EXISTS lama_belajar_jp      text,
  ADD COLUMN IF NOT EXISTS status_belajar_jp    text,
  ADD COLUMN IF NOT EXISTS bab_belajar_jp       text,
  ADD COLUMN IF NOT EXISTS level_bahasa_inggris text,
  ADD COLUMN IF NOT EXISTS bahasa_lain          text,
  ADD COLUMN IF NOT EXISTS level_bahasa_jepang  text,
  ADD COLUMN IF NOT EXISTS sertifikat_lain      text,
  ADD COLUMN IF NOT EXISTS catatan_cv           text,

  -- ── tes & fisik ──────────────────────────────────────────────────────────
  -- KINKI Q45 (計算テスト), AB51/AB52 (体力試験), X41 (集団生活年数),
  -- E16 (スポーツ).
  ADD COLUMN IF NOT EXISTS tes_hitung           text,
  ADD COLUMN IF NOT EXISTS tes_pushup           text,
  ADD COLUMN IF NOT EXISTS tes_squat            text,
  ADD COLUMN IF NOT EXISTS tinggal_kursus_tahun text,
  ADD COLUMN IF NOT EXISTS olahraga             text,

  -- ── wawancara ────────────────────────────────────────────────────────────
  -- KINKI Q47 + U48..U52 (性格診断テスト). Sekarang DISIMPULKAN `inferMbti()`
  -- dari kalimat kandidat; kolom ini membuat tipenya stabil dan bisa dikoreksi
  -- admin tanpa mengubah teks wawancara.
  ADD COLUMN IF NOT EXISTS mbti                 text;

COMMENT ON COLUMN master_database_candidate.pekerjaan_1_jenis IS '雇用形態: 正社員/非正社員/アルバイト/インターン/家業';
COMMENT ON COLUMN master_database_candidate.pekerjaan_1_bidang IS '業種 (industri) perusahaan';
COMMENT ON COLUMN master_database_candidate.pekerjaan_1_catatan IS '備考 blok 職歴';
COMMENT ON COLUMN master_database_candidate.keluarga_1_tinggal IS '同居/別居/独立';
COMMENT ON COLUMN master_database_candidate.keluarga_1_hp IS '電話 anggota keluarga';
COMMENT ON COLUMN master_database_candidate.kenalan_di_jepang_status_tinggal IS '在留資格(在留期間)';
COMMENT ON COLUMN master_database_candidate.lama_di_jepang IS '在日期間 (bukan lamakerjadiharapkan)';
COMMENT ON COLUMN master_database_candidate.level_bahasa_jepang IS 'N5レベル..N2合格 — mengisi I3 KINKI tanpa menebak dari teks JFT';
COMMENT ON COLUMN master_database_candidate.mbti IS '性格診断テスト KINKI; kosong = disimpulkan inferMbti()';
COMMENT ON COLUMN master_database_candidate.catatan_cv IS '付記 / その他事項 — catatan bebas yang dicetak di form';
