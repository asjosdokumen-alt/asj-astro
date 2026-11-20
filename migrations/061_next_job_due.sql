-- 061_next_job_due.sql
--
-- KENAPA
--   Sweep antrean harus bisa menjawab "adakah yang bisa di-claim sekarang?"
--   TANPA mengirim satu pun request ke Neon. Jawaban itu datang dari satu kunci
--   skalar di Upstash Redis (lihat netlify/functions/_lib/kernel/job-signal.ts),
--   dan nilai yang ditulis ke kunci itu dihitung oleh fungsi ini.
--
--   Predikatnya SALINAN PERSIS dari claim_next_job() (031:59-61, byte demi
--   byte termasuk spasinya):
--
--       q.status IN ('pending', 'failed')
--         AND (q.run_after <= NOW() OR q.status = 'failed')
--         AND (q.status != 'failed' OR q.attempts < q.max_attempts)
--
--   Kalau predikat ini berbeda sedikit saja dari claim, gerbang akan menyatakan
--   'idle' sementara ada baris yang sebenarnya bisa di-claim — dan itu kegagalan
--   SENYAP yang bentuknya sudah pernah terjadi di repo ini: `claimJob()`
--   menelan error dan mengembalikan `null`, sehingga "antrean rusak" tidak bisa
--   dibedakan dari "antrean kosong" (lihat komentar 031 dan job-queue.ts).
--   Gerbang yang salah akan membuat kegagalan yang sama, tetapi tanpa error sama
--   sekali.
--
--   KENAPA DISALIN, BUKAN DIBAGI: predikat itu hidup di dalam badan fungsi
--   plpgsql. PostgREST tidak bisa mengekspresikan perbandingan kolom-ke-kolom
--   (`attempts < max_attempts`), jadi pembacaannya harus SQL, dan SQL tidak bisa
--   "memanggil" potongan WHERE milik fungsi lain. Satu-satunya cara berbagi
--   adalah mengubah 031 — dan itu DILARANG: `scripts/migrate.mjs` memegang
--   ledger checksum per migrasi, jadi menyunting berkas yang sudah diterapkan
--   akan membuat `npm run verify:db` gagal (dan riwayat migrasi tidak lagi bisa
--   direproduksi). Migrasi bersifat append-only.
--
--   Konsekuensi yang harus diterima: kalau 031 kelak diubah, berkas ini harus
--   diikuti migrasi baru yang menyalin predikat barunya.
--
-- SEMANTIK
--   1. Ada baris 'failed' yang masih boleh dicoba ⇒ NOW().
--      Claim mengabaikan `run_after` untuk status 'failed' (031:60), jadi baris
--      seperti itu jatuh tempo SEKARANG, bukan pada `run_after`-nya.
--   2. Selain itu ⇒ min(run_after) atas SELURUH baris 'pending'.
--      Sengaja TIDAK dibatasi `run_after <= NOW()`: baris bertanggal masa depan
--      justru satu-satunya alasan fungsi ini mengembalikan instant masa depan.
--      Kalau baris masa depan dikecualikan, gerbang akan 'idle' selamanya untuk
--      job yang dijadwalkan nanti — kelas bug "job bertanggal-masa-depan tidak
--      pernah terbangunkan" (RENCANA_ANTREAN_TANPA_NEON §1 T8).
--   3. Tidak ada apa-apa ⇒ NULL. Pemanggil memetakannya ke sentinel jauh
--      (now + 365 hari) sampai ada `enqueue()` yang mengumumkan nilai baru.
--
--   `attempts < max_attempts` hanya relevan untuk 'failed': baris 'pending'
--   belum pernah dicoba, jadi tidak ada ambang yang bisa dilewatinya.
--
-- TIDAK MENGUBAH APA PUN
--   Fungsi BARU. Tidak ada ALTER, tidak ada DROP, tidak ada indeks baru:
--   `idx_job_queue_pending` (005:23-25) sudah menutupi `(status, run_after)
--   WHERE status IN ('pending','failed')`, jadi pembacaan ini memakai indeks
--   yang sama dengan claim.
--
--   `STABLE`, bukan `VOLATILE`: ia hanya membaca, dan `NOW()` adalah instant
--   tetap di dalam satu statement — sehingga planner boleh mengevaluasinya
--   sekali per query.
--
-- URUTAN DEPLOY
--   Migrasi DULU, kode kemudian (PROJECT_CONTEXT R7 / PGRST204). Sampai kode
--   yang memanggilnya di-deploy, fungsi ini tidak dipakai siapa pun — jadi
--   langkah ini berisiko nol. Setelah `migrate up`: `npm run db:schema` lalu
--   `npm run verify:schema`.

CREATE OR REPLACE FUNCTION next_job_due()
RETURNS timestamptz
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    -- (1) Ada yang bisa di-claim SEKARANG tanpa menunggu waktu.
    WHEN EXISTS (
      SELECT 1
      FROM job_queue q
      WHERE q.status IN ('pending', 'failed')
        AND (q.run_after <= NOW() OR q.status = 'failed')
        AND (q.status != 'failed' OR q.attempts < q.max_attempts)
        AND q.status = 'failed'
    ) THEN NOW()
    -- (2) Belum ada yang jatuh tempo: instant paling awal sebuah baris
    --     'pending' menjadi due (termasuk yang bertanggal masa depan).
    ELSE (
      SELECT min(q.run_after)
      FROM job_queue q
      WHERE q.status = 'pending'
    )
  END;
$$;

-- Sama dengan grant 031: klien REST memanggilnya sebagai role `anon`
-- (JWT Neon role `anonymous`), bukan sebagai pemilik fungsi.
GRANT EXECUTE ON FUNCTION next_job_due() TO anon;
