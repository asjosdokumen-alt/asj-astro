// Kontrol positif untuk detektor index redundan (scripts/db-baseline.mjs §16).
// Membuat tabel sementara berisi SATU duplikat murni + SATU index parsial,
// lalu memastikan detektor hanya menyebut yang duplikat. Tabelnya dibuang lagi.
import pg from 'pg';
const { initDbEnv } = await import('../scripts/lib/load-env.mjs');
const { url } = initDbEnv();
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

const QUERY = `
  WITH ix AS (
    SELECT i.indrelid::regclass::text AS tabel, c.relname::text AS index,
           i.indkey::text AS kunci, coalesce(i.indpred::text,'') AS pred,
           coalesce(i.indexprs::text,'') AS exprs, i.indisunique AS unik,
           pg_relation_size(i.indexrelid) AS bytes
    FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND i.indrelid::regclass::text = '_idxprobe'
  )
  SELECT a.index a_index, b.index b_index,
         CASE WHEN a.kunci=b.kunci THEN 'IDENTIK'
              WHEN b.kunci LIKE a.kunci||' %' THEN 'prefix dari'
              WHEN a.kunci LIKE b.kunci||' %' THEN 'prefix dari' ELSE 'sama' END jenis
  FROM ix a JOIN ix b ON a.tabel=b.tabel AND a.index<b.index
   AND (a.kunci=b.kunci OR b.kunci LIKE a.kunci||' %' OR a.kunci LIKE b.kunci||' %')
   AND a.pred=b.pred AND a.exprs=b.exprs`;

try {
  await c.query('DROP TABLE IF EXISTS public._idxprobe');
  await c.query('CREATE TABLE public._idxprobe (id int PRIMARY KEY, status text)');
  await c.query('CREATE INDEX _idxprobe_dup ON public._idxprobe (id)');
  await c.query("CREATE INDEX _idxprobe_partial ON public._idxprobe (id) WHERE status='x'");
  const r = await c.query(QUERY);
  console.log('terdeteksi:', r.rows.length, 'pasang');
  for (const x of r.rows) console.log(' ', x.a_index, '<->', x.b_index, x.jenis);
  const onlyDup = r.rows.length === 1 && /_dup/.test(r.rows[0].a_index + r.rows[0].b_index);
  console.log(onlyDup ? 'OK — hanya duplikat murni yang dilaporkan' : 'GAGAL — detektor masih salah');
} finally {
  await c.query('DROP TABLE IF EXISTS public._idxprobe');
  await c.end();
}
