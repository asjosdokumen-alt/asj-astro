-- 055_hapus_master_duplikat.sql
--
-- Membersihkan DUA baris `master_database_candidate` yang bukan orang baru:
-- duplikat dan sisa uji. Keduanya ditemukan pemilik di panel 2026-11-12
-- ("db nya dobel dobel gini hmmm?") dan diverifikasi sebelum dihapus.
--
-- 1. ASJ00222 — DUPLIKAT ASJ00122
--    id 358 · nama SATRIA PUTRA DEWANGGA · lahir 2008-02-05 · tb/bb 171/62
--    Baris ASJ00122 (id 122, dibuat 2026-08-02) punya data yang sama persis
--    DAN punya baris `database_candidate`. ASJ00222 dibuat 12 hari kemudian
--    dengan `no_wa = 622342782945` — `6282342782945` kehilangan satu digit `8`.
--
--    Sebabnya struktural: `master_database_candidate` berkunci unik pada
--    `no_wa`. Salah ketik nomor = baris BARU, bukan pembaruan baris lama.
--    Karena WA-nya tidak bisa dinormalkan (`62` + digit hilang), baris itu juga
--    tidak pernah muncul di daftar admin dan tidak bisa dibuatkan CV.
--
--    PENJAGA: hanya dihapus kalau (a) tidak ada baris kandidat yang memakainya,
--    dan (b) ada baris LAIN dengan nama + tanggal lahir yang sama yang PUNYA
--    baris kandidat. Baris tanpa kembar tidak disentuh.
--
-- 2. id 552 — SISA UJI
--    nama "agus khoci updated" · no_wa 628123456789 · tanpa id_kandidat,
--    tanpa tanggal lahir, tanpa baris kandidat. Nomor berurutan 123456789 =
--    nomor contoh, bukan orang.
--
-- IDEMPOTEN: dijalankan dua kali, perintah kedua menghapus 0 baris.
-- TIDAK ADA tabel anak yang menggantung: `candidate_pekerjaan` dan
-- `ai_form_submissions` untuk orang ini menunjuk ASJ00122 / WA yang benar.

-- ── 1. Duplikat: baris tanpa kandidat yang kembar dengan baris valid ────────
DELETE FROM public.master_database_candidate m
 WHERE NOT EXISTS (
         SELECT 1 FROM public.database_candidate d
          WHERE d.id_kandidat = m.id_kandidat
       )
   AND NULLIF(btrim(m.tgl_lahir), '') IS NOT NULL
   AND EXISTS (
         SELECT 1
           FROM public.master_database_candidate x
          WHERE x.id <> m.id
            AND upper(btrim(x.nama_lengkap)) = upper(btrim(m.nama_lengkap))
            AND btrim(x.tgl_lahir) = btrim(m.tgl_lahir)
            AND EXISTS (
                  SELECT 1 FROM public.database_candidate d2
                   WHERE d2.id_kandidat = x.id_kandidat
                )
       );

-- ── 2. Sisa uji: tanpa id, tanpa tanggal lahir, tanpa kandidat ──────────────
DELETE FROM public.master_database_candidate m
 WHERE (m.id_kandidat IS NULL OR btrim(m.id_kandidat) = '')
   AND NULLIF(btrim(m.tgl_lahir), '') IS NULL
   AND NOT EXISTS (
         SELECT 1 FROM public.database_candidate d
          WHERE btrim(d.no_wa) = btrim(m.no_wa)
       );
