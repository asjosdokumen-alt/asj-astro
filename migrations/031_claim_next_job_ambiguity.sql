-- 031_claim_next_job_ambiguity.sql
--
-- KENAPA
--   `claim_next_job()` SELALU gagal dengan 42702 `column reference "id" is
--   ambiguous`, terukur 2026-11-02 di Neon:
--
--     POST /rest/v1/rpc/claim_next_job  -> 400
--     {"code":"42702","message":"column reference \"id\" is ambiguous", ...}
--
--   Sebabnya `RETURNS TABLE (...)` mendeklarasikan parameter KELUAR bernama
--   `id`, `status`, `attempts`, dst. Parameter keluar itu hidup di lingkup
--   fungsi, jadi `WHERE id = (...)` dan `attempts = attempts + 1` di badan
--   fungsi menunjuk DUA hal sekaligus: kolom `job_queue` dan variabel keluar.
--
--   Ini bukan kerusakan baru: badannya tidak berubah sejak 009 (2026-10-12).
--   Yang membuatnya tidak pernah terlihat adalah `claimJob()` di
--   `_lib/kernel/job-queue.ts`: setiap error ditangkap, dicatat sebagai
--   `job.claim-failed`, lalu fungsi mengembalikan `null`. Akibatnya antrean
--   TIDAK PERNAH mengambil job dan setiap job tetap `pending` selamanya —
--   kegagalan yang tampak sama persis dengan "tidak ada job".
--
--   Saat migrasi ini ditulis `job_queue` kosong (0 baris), jadi kerusakannya
--   laten: belum ada pekerjaan yang tertahan. Begitu ada satu job masuk, ia
--   akan tertahan di sana.
--
-- PERBAIKAN
--   Semua rujukan kolom di badan fungsi dibuat berkualifikasi lewat alias
--   `jq` (tabel target) dan `q` (subquery). Nama kolom keluaran TIDAK diubah,
--   supaya bentuk balasan RPC tetap `{id, type, payload, ...}` yang dibaca
--   `job-queue.ts`.
--
--   `reclaim_stuck_jobs()` tidak disentuh: ia `RETURNS INT` dan tidak punya
--   parameter keluar yang bertabrakan.

CREATE OR REPLACE FUNCTION claim_next_job()
RETURNS TABLE (
  id UUID,
  type TEXT,
  payload JSONB,
  idempotency_key TEXT,
  status TEXT,
  attempts INT,
  max_attempts INT,
  run_after TIMESTAMPTZ,
  locked_until TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  UPDATE job_queue AS jq
  SET
    status = 'running',
    attempts = jq.attempts + 1,
    locked_until = NOW() + INTERVAL '5 minutes'
  WHERE jq.id = (
    SELECT q.id
    FROM job_queue q
    WHERE q.status IN ('pending', 'failed')
      AND (q.run_after <= NOW() OR q.status = 'failed')
      AND (q.status != 'failed' OR q.attempts < q.max_attempts)
    ORDER BY q.run_after ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING
    jq.id,
    jq.type,
    jq.payload,
    jq.idempotency_key,
    jq.status,
    jq.attempts,
    jq.max_attempts,
    jq.run_after,
    jq.locked_until,
    jq.last_error,
    jq.created_at;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION claim_next_job TO anon;
