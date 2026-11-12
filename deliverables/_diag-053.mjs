/**
 * Diag 053 — baca-saja. Menjawab: apakah rekonsiliasi 053 benar-benar menulis,
 * dan kalau tidak, di mana rantainya putus.
 */
import pg from 'pg';
import { initDbEnv } from '../scripts/lib/load-env.mjs';

const env = initDbEnv();
if (!env.ok) {
  console.error('tidak ada connection string');
  process.exit(2);
}
const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
await client.connect();

const q = async (label, sql) => {
  const { rows } = await client.query(sql);
  console.log(label, JSON.stringify(rows));
  return rows;
};

await q(
  'norm:',
  `SELECT public.asj_norm_wa('62822342945') a,
          public.asj_norm_wa('082234278945') b,
          public.asj_norm_wa('622342782945') c`,
);

await q(
  'cocok WA master↔candidate:',
  `SELECT count(*) AS n
     FROM master_database_candidate m
     JOIN database_candidate d
       ON public.asj_norm_wa(d.no_wa) = public.asj_norm_wa(m.no_wa)`,
);

await q(
  'tb master terisi & salinan kosong:',
  `SELECT count(*) AS n
     FROM master_database_candidate m
     JOIN database_candidate d
       ON public.asj_norm_wa(d.no_wa) = public.asj_norm_wa(m.no_wa)
    WHERE NULLIF(btrim(m.tb), '') IS NOT NULL
      AND d.tb IS DISTINCT FROM NULLIF(btrim(m.tb), '')`,
);

await q(
  'contoh 3 baris:',
  `SELECT m.id_kandidat, m.tb AS m_tb, d.tb AS d_tb,
          public.asj_norm_wa(m.no_wa) AS m_wa, public.asj_norm_wa(d.no_wa) AS d_wa
     FROM master_database_candidate m
     JOIN database_candidate d
       ON public.asj_norm_wa(d.no_wa) = public.asj_norm_wa(m.no_wa)
    WHERE NULLIF(btrim(m.tb), '') IS NOT NULL
      AND d.tb IS DISTINCT FROM NULLIF(btrim(m.tb), '')
    LIMIT 3`,
);

await q(
  'definisi trigger:',
  `SELECT p.proname, pg_get_functiondef(p.oid) LIKE '%IS DISTINCT FROM OLD%' AS punya_distinct
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='cermin_master_ke_candidate'`,
);

await client.end();
