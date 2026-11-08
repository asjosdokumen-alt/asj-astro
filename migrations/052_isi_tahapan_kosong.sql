-- =============================================================================
-- 2026-11-08 — Migration 052: isi `tahapan_seleksi` yang kosong dengan LIST
-- -----------------------------------------------------------------------------
-- KEPUTUSAN PEMILIK, 2026-11-08: *"85 kandidat tanpa tahap emang belum kan
-- masih development isi saja dengan yg paling [awal] saja biar seragam."*
--
-- Ini MEMBALIKKAN keputusan yang tercatat di `deliverables/utang-teknis-2026-11-07.md`
-- §7, dan pembalikannya disengaja — bukan catatan lama yang terlewat. Alasan
-- lamanya: *"menulis LIST ke 85 baris berarti menciptakan data yang tidak pernah
-- dicatat siapa pun."* Alasan itu benar sebagai pernyataan tentang ASAL-USUL
-- data, tetapi salah sebagai pernyataan tentang GUNA: kolom kosong membuat
-- dasbor memperlakukannya sebagai awal pipeline secara implisit, sehingga
-- "belum diproses" dan "tidak diketahui" tampil identik. Pemilik memilih satu
-- nilai eksplisit yang seragam.
--
-- ── MENGAPA 'LIST' ──────────────────────────────────────────────────────────
-- `LIST` adalah tahap PERTAMA dari daftar kanonik `sys_config.list_tahapan`
-- (lihat `src/lib/tahapanPipeline.ts`, yang juga memaku urutannya di tes).
-- Mengisinya dengan nilai lain berarti mengklaim kandidat sudah melewati tahap
-- yang tidak pernah ia jalani.
--
-- ── APA YANG TERUKUR SEBELUM MENULIS (PostgREST, 2026-11-08) ────────────────
--   database_candidate: 263 baris
--     LIST         177
--     (kosong)      85   <-- yang diisi migrasi ini
--     MCU PARPOR     1
--
--   Nol baris memakai NULL literal, jadi tidak ada dua konvensi "kosong" yang
--   perlu didamaikan: yang ada hanya string kosong. `WHERE` di bawah menangani
--   KEDUANYA (NULL dan ''), karena kolom ini tidak punya NOT NULL.
--
-- ── YANG SENGAJA TIDAK DISENTUH ─────────────────────────────────────────────
--   `updated_at` TIDAK diubah. Perbaikan data bukan aktivitas bisnis, dan
--   menggeser timestamp-nya akan membuat 85 baris tampak "baru diperbarui" di
--   urutan mana pun yang memakai kolom itu. Preseden: migrasi 050.
--
-- Idempoten: menjalankannya dua kali tidak mengubah apa pun pada jalannya yang
-- kedua (tidak ada baris kosong yang tersisa), sehingga aman kalau ledger dan
-- database sempat berbeda pendapat.
-- =============================================================================

UPDATE database_candidate
   SET tahapan_seleksi = 'LIST'
 WHERE tahapan_seleksi IS NULL
    OR btrim(tahapan_seleksi) = '';
