-- 045_sinkronkan_data_lama.sql
--
-- Dua ketidakcocokan DATA yang sudah terukur di produksi 2026-11-05. Keduanya
-- bukan bug kode yang masih hidup — kodenya sudah diperbaiki — melainkan sisa
-- dari jalur tulis lama yang tidak menulis ke kolom yang sama.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 1. MASTER KOSONG, SALINAN OPERASIONAL TERISI (70 sel)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Terukur: `database_candidate.nik` terisi sementara
-- `master_database_candidate.nik` kosong di 39 baris; `gender` 21 baris;
-- `no_pasport`/`no_paspor` 10 baris. Penyebabnya trigger cermin (migrasi 041)
-- yang sengaja TIDAK menghapus nilai salinan saat master kosong
-- (`COALESCE(NULLIF(NEW.x), d.x)`), ditambah edit admin lama yang belum
-- menulis balik ke master (jalur `masterIdentityPatch` baru ada 2026-10-30).
--
-- Efeknya persis keluhan pemilik: daftar admin menampilkan NIK/gender yang
-- terisi, sedangkan CV (yang membaca MASTER) mencetak kosong.
--
-- Arah perbaikan mengikuti aturan yang sudah berlaku: edit admin → master.
-- HANYA sel master yang KOSONG yang diisi; nilai master yang sudah ada tidak
-- pernah ditimpa. `database_candidate` tidak diubah sama sekali.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 2. KOLOM `_jp` BERISI TEKS NON-JEPANG (29 sel)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Terukur: 29 sel di 20 kolom `*_jp` berisi kata Indonesia atau romaji —
-- `tempat_lahir_jp` = "Jepang"/"Ponorogo", `alergi_jp` = "tidak",
-- `lama_belajar_jp` = "3 bulan", `keluarga_1_pekerjaan_jp` = "IBU RUMAH TANGGA".
-- Rirekisho mencetak kolom kanji, jadi nilai itu tampil sebagai bahasa
-- Indonesia di sisi Jepang.
--
-- Yang dikosongkan HANYA nilai yang tidak mengandung satu pun huruf Jepang,
-- dan BUKAN placeholder `-` atau angka murni (keduanya sah: `-` berarti "tidak
-- ada", angka adalah isi kolom hitungan seperti `bab_belajar_jp`).
--
-- Mengosongkan, bukan menerjemahkan: terjemahan butuh model, dan kolom kosong
-- jauh lebih murah daripada kolom yang salah. Pengisian ulang terjadi lewat
-- jalur yang sudah ada — `autoTranslateToJp` saat simpan (alamat & tempat
-- lahir, termasuk self-heal untuk nilai tak sah) dan tombol "Terjemahkan
-- semua kolom" untuk sisanya.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- IDEMPOTEN
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Dijalankan dua kali: perintah pertama tidak menemukan sel master yang kosong
-- lagi, perintah kedua tidak menemukan `_jp` non-Jepang lagi. Tidak ada
-- perubahan pada jalan kedua.

-- ── 1. Isi master yang kosong dari salinan operasional ─────────────────────
-- `COALESCE(NULLIF(btrim(m.x), ''), NULLIF(btrim(d.x), ''))` = pertahankan
-- nilai master bila ada; ambil dari salinan hanya bila master kosong.
UPDATE public.master_database_candidate m
SET nik       = COALESCE(NULLIF(btrim(m.nik), ''), NULLIF(btrim(d.nik), '')),
    gender    = COALESCE(NULLIF(btrim(m.gender), ''), NULLIF(btrim(d.gender), '')),
    no_paspor = COALESCE(NULLIF(btrim(m.no_paspor), ''), NULLIF(btrim(d.no_pasport), ''))
FROM public.database_candidate d
WHERE d.no_wa = m.no_wa
  AND (
       (COALESCE(btrim(m.nik), '') = ''       AND COALESCE(btrim(d.nik), '') <> '')
    OR (COALESCE(btrim(m.gender), '') = ''    AND COALESCE(btrim(d.gender), '') <> '')
    OR (COALESCE(btrim(m.no_paspor), '') = '' AND COALESCE(btrim(d.no_pasport), '') <> '')
  );

-- ── 2. Kosongkan `_jp` yang bukan huruf Jepang ─────────────────────────────
-- Dinamis: 48 kolom `*_jp`, dan daftar itu bertambah tiap migrasi.
DO $$
DECLARE
  kol RECORD;
BEGIN
  FOR kol IN
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'master_database_candidate'
      AND right(column_name, 3) = '_jp'
  LOOP
    EXECUTE format(
      'UPDATE public.master_database_candidate
          SET %1$I = ''''
        WHERE %1$I IS NOT NULL
          AND btrim(%1$I) <> ''''
          AND btrim(%1$I) <> ''-''
          AND %1$I !~ ''[ぁ-ヿ一-龯]''
          AND btrim(%1$I) !~ ''^[0-9]+$''',
      kol.column_name
    );
  END LOOP;
END $$;
