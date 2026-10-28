-- =============================================================================
-- 2026-10-29 — Migration 025: satu kata untuk satu arti di kotak masuk Mail
-- -----------------------------------------------------------------------------
-- WHY
--   Keputusan pemilik, 2026-10-29:
--
--     "lulus hanya untuk admin mengganti tahapan, untuk update dokumen ganti
--      saja di setujui admin"
--     "ada baris di mail tapi infonya di mail tab. gak perlu persetujuan admin,
--      gak perlu menunggu"
--
--   `database_asj_form.status` sebelumnya memakai `LULUS` untuk dua hal:
--   verdict BERKAS (disetujui admin) dan — lewat `syncCandidateDariForm` —
--   kelulusan TAHAPAN pada kandidat. `migrations/013_biodata_status.sql` sudah
--   menolak penggabungan itu untuk kolom dokumen dan menulis alasannya:
--   "Deliberately NOT 'LULUS' — the whole defect is one word meaning two
--   things". Migrasi ini melakukan hal yang sama untuk baris Mail.
--
-- STATES (sesudah migrasi ini)
--   MENUNGGU    lamaran baru, belum ditinjau                      -> antrean
--   REVIEW      sedang ditinjau admin                             -> antrean
--   UPDATE      lamaran yang sudah diputuskan, lalu diubah        -> sinyal
--   DISETUJUI   berkas/lamaran disetujui admin                    -> hasil
--   GAGAL       ditolak                                           -> hasil
--   INFO        biodata diperbarui — INFORMASI, bukan antrean     -> info
--   DIBACA      baris INFO yang sudah dilihat admin               -> info
--
--   `LULUS` tidak lagi sah sebagai status baris Mail. Ia tinggal arti TAHAPAN
--   dan hanya ditulis admin lewat form kandidat
--   (`registry/service.ts` -> `buildKandidatSuperPatch`).
--
-- BACKFILL
--   Tiga pernyataan, semuanya idempoten: menjalankannya dua kali tidak
--   mengubah apa pun pada jalankan kedua.
--
--   URUTAN PENTING. Baris biodata didahulukan, karena sebagian di antaranya
--   berstatus `LULUS` hari ini dan harus menjadi `INFO` — bukan `DISETUJUI`.
--   Kalau urutannya dibalik, baris itu akan lewat jalur "berkas disetujui" dan
--   kembali terlihat seperti antrean keputusan.
--
--   Kolom `status` TIDAK punya CHECK constraint (diperiksa: tidak ada di
--   migrations/ mana pun), jadi nilai baru tidak butuh DDL.
--
--   ⚠️ `feedback_berkas` adalah **jsonb**, bukan text — diverifikasi langsung ke
--   database 2026-10-29 (`jsonb_typeof` = 'string' untuk 29 baris, NULL untuk
--   2). Versi pertama migrasi ini memakai `LIKE`/`regexp_replace` pada kolomnya
--   dan GAGAL dengan `invalid input syntax for type json`. Karena itu isinya
--   dibaca lewat `#>> '{}'` (teks dari skalar jsonb) dan ditulis kembali lewat
--   `to_jsonb(...)`. Jangan diganti ke cast `::text`: hasilnya membawa tanda
--   kutip pembungkus dan akan tersimpan sebagai string yang dikutip dua kali.
-- =============================================================================

-- 1) Baris BIODATA menjadi INFORMASI.
--    Penandanya `[BIODATA]` di `feedback_berkas`, ditulis `syncBiodataKeMail`;
--    pembaca yang sama dipakai `isBiodataRow()` di CandidateDash.tsx.
--    Penanda `[[PREV:x]]` ikut dibuang: ia hanya berarti "kembalikan ke status
--    sebelumnya", dan baris INFO tidak punya status sebelumnya.
UPDATE database_asj_form
   SET status = 'INFO',
       feedback_berkas = to_jsonb(
         regexp_replace(COALESCE(feedback_berkas #>> '{}', ''), '\[\[PREV:[^\]]+\]\]\s*', '', 'g')
       )
 WHERE COALESCE(btrim(code_job), '') = ''
   AND status IN ('MENUNGGU', 'UPDATE', 'LULUS')
   AND COALESCE(feedback_berkas #>> '{}', '') LIKE '%[BIODATA]%';

-- 2) Nilai lama yang tidak cocok dengan keranjang mana pun.
--    `handleReviewForm` menulis `REVIEW ADMIN` (dengan spasi) sementara
--    keranjangnya bernama `REVIEW`; baris itu tidak muncul di filter mana pun
--    kecuali SEMUA. Penulisnya sudah diperbaiki (`fc3ea7c`), ini sisi datanya.
UPDATE database_asj_form
   SET status = 'REVIEW'
 WHERE status = 'REVIEW ADMIN';

-- 3) Sisa `LULUS` = verdict berkas. Artinya sekarang `DISETUJUI`.
UPDATE database_asj_form
   SET status = 'DISETUJUI'
 WHERE status = 'LULUS';

-- Verifikasi (jalankan manual; harus mengembalikan 0 baris):
--   SELECT status, COUNT(*) FROM database_asj_form
--    WHERE status IN ('LULUS', 'REVIEW ADMIN') GROUP BY status;
