/**
 * Bukti trigger cermin 053 bekerja, TANPA mengubah produksi.
 *
 * Seluruh uji berjalan di dalam satu transaksi yang di-ROLLBACK di akhir.
 * Yang dibuktikan:
 *   1. nilai baru di master sampai ke salinan;
 *   2. nilai yang DIKOSONGKAN di master ikut mengosongkan salinan (cacat 041);
 *   3. tulisan ke kolom LAIN tidak menyentuh kolom yang tidak berubah.
 */
import pg from 'pg';
import { initDbEnv } from '../scripts/lib/load-env.mjs';

const env = initDbEnv();
if (!env.ok) {
  console.error('tidak ada connection string');
  process.exit(2);
}
const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
await c.connect();
await c.query('BEGIN');

const one = async (sql, params) => (await c.query(sql, params)).rows[0];

const target = await one(
  `SELECT m.id, m.id_kandidat, m.tb, d.id AS did, d.tb AS dtb
     FROM master_database_candidate m
     JOIN database_candidate d ON public.asj_norm_wa(d.no_wa) = public.asj_norm_wa(m.no_wa)
    WHERE NULLIF(btrim(m.tb), '') IS NOT NULL
    LIMIT 1`,
);
if (!target) {
  console.log('tidak ada baris uji');
  await c.query('ROLLBACK');
  await c.end();
  process.exit(0);
}
console.log('baris uji:', target.id_kandidat, '| master.tb =', target.tb, '| salinan.tb =', target.dtb);

await c.query(`UPDATE master_database_candidate SET tb = '999' WHERE id = $1`, [target.id]);
let d = await one(`SELECT tb, updated_at FROM database_candidate WHERE id = $1`, [target.did]);
console.log('1. master.tb := 999  -> salinan.tb =', JSON.stringify(d.tb), d.tb === '999' ? 'OK' : 'GAGAL');

await c.query(`UPDATE master_database_candidate SET tb = '' WHERE id = $1`, [target.id]);
d = await one(`SELECT tb FROM database_candidate WHERE id = $1`, [target.did]);
console.log('2. master.tb := ""   -> salinan.tb =', JSON.stringify(d.tb), d.tb === null ? 'OK (ikut kosong)' : 'GAGAL');

const before = await one(`SELECT nik FROM database_candidate WHERE id = $1`, [target.did]);
await c.query(`UPDATE master_database_candidate SET ai_data_json = ai_data_json WHERE id = $1`, [target.id]);
const after = await one(`SELECT nik FROM database_candidate WHERE id = $1`, [target.did]);
console.log('3. tulis kolom lain   -> salinan.nik tetap', before.nik === after.nik ? 'OK' : 'GAGAL');

await c.query('ROLLBACK');
console.log('ROLLBACK — tidak ada perubahan permanen.');
await c.end();
