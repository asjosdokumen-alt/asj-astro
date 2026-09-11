// scripts/db-baseline.mjs — Pengukuran baseline performa database (HANYA BACA).
//
// Pemakaian:
//   set DATABASE_URL=postgresql://...
//   node scripts/db-baseline.mjs
//
// Semua query SELECT / EXPLAIN. Tidak ada DDL, tidak ada DML.
// statement_timeout dipasang supaya satu query buruk tidak menggantung.

// ESM mengabaikan NODE_PATH, jadi kalau modul `pg` tidak terpasang di proyek ini,
// izinkan lokasi alternatif lewat env PG_MODULE (path absolut ke direktori pg).
let pg;
try {
  pg = (await import('pg')).default;
} catch {
  const p = process.env.PG_MODULE;
  if (!p) {
    console.error('Modul `pg` tidak ditemukan. Pasang dengan: npm i pg');
    console.error('atau set PG_MODULE=<path absolut ke folder node_modules/pg>');
    process.exit(1);
  }
  pg = (await import('file:///' + p.replace(/\\/g, '/') + '/lib/index.js')).default;
}

// Load .env.local / .env.lokal and map Direct_Connection_DB onto DATABASE_URL,
// so this works locally without exporting anything by hand. process.env wins.
const { initDbEnv, describeDbTarget, failNoDbUrl } = await import('./lib/load-env.mjs');
const dbEnv = initDbEnv();
const URL = dbEnv.url;
if (!URL) {
  failNoDbUrl('db-baseline');
}
console.log(`  target : ${describeDbTarget(URL)}`);

const client = new pg.Client({
  connectionString: URL,
  ssl: { rejectUnauthorized: false },
  statement_timeout: 15000,
  connectionTimeoutMillis: 15000,
});

const pad = (s, n) => String(s ?? '').padEnd(n);
const lpad = (s, n) => String(s ?? '').padStart(n);
const fmtInt = (n) => new Intl.NumberFormat('en-US').format(Number(n ?? 0));
const mb = (b) => (Number(b) / 1024 / 1024).toFixed(1) + ' MB';

function header(t) {
  console.log('\n' + '='.repeat(78));
  console.log(t);
  console.log('='.repeat(78));
}

async function q(sql, params) {
  return (await client.query(sql, params)).rows;
}

async function main() {
  await client.connect();

  // ---- Info koneksi ----
  header('0. INFO KONEKSI');
  const info = await q(`
    SELECT current_database() db, current_user usr, version() pg,
           inet_server_addr() host, inet_server_port() port,
           pg_size_pretty(pg_database_size(current_database())) db_size`);
  console.log(`database : ${info[0].db}`);
  console.log(`user     : ${info[0].usr}`);
  console.log(`host     : ${info[0].host}:${info[0].port}`);
  console.log(`ukuran DB: ${info[0].db_size}`);
  console.log(`postgres : ${String(info[0].pg).split(',').slice(0, 1).join('')}`);

  // ---- Daftar tabel ----
  header('1. UKURAN & JUMLAH BARIS TABEL');
  // pg_class tidak punya n_live_tup/seq_scan — itu milik pg_stat_user_tables.
  const tables = await q(`
    SELECT c.relname AS tabel,
           c.reltuples::bigint AS estimasi_baris,
           pg_total_relation_size(c.oid) AS total_bytes,
           pg_relation_size(c.oid) AS heap_bytes,
           pg_indexes_size(c.oid) AS index_bytes,
           s.n_live_tup, s.n_dead_tup,
           s.seq_scan, s.idx_scan, s.seq_tup_read,
           s.last_vacuum, s.last_autovacuum, s.last_analyze, s.last_autoanalyze
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
    WHERE n.nspname = 'public' AND c.relkind IN ('r','m','p')
    ORDER BY pg_total_relation_size(c.oid) DESC`);

  console.log(pad('TABEL', 32) + lpad('BARIS', 10) + lpad('TOTAL', 11) +
              lpad('HEAP', 11) + lpad('INDEX', 11) + lpad('DEAD', 10));
  console.log('-'.repeat(85));
  for (const t of tables) {
    console.log(
      pad(t.tabel, 32) +
      lpad(fmtInt(t.estimasi_baris), 10) +
      lpad(mb(t.total_bytes), 11) +
      lpad(mb(t.heap_bytes), 11) +
      lpad(mb(t.index_bytes), 11) +
      lpad(fmtInt(t.n_dead_tup), 10));
  }

  // ---- Jumlah baris eksak untuk tabel utama ----
  header('2. JUMLAH BARIS EKSAK (tabel utama)');
  const main = ['database_candidate', 'master_database_candidate', 'database_asj_form',
                'pemberkasan_checklist', 'job_database', 'database_schedule',
                'database_tugas', 'sys_config', 'fcm_tokens', 'wa_templates'];
  const existing = new Set(tables.map((t) => t.tabel));
  for (const t of main) {
    if (!existing.has(t)) { console.log(`${pad(t, 30)} — tabel tidak ada`); continue; }
    try {
      const r = await q(`SELECT count(*)::bigint n FROM public.${t}`);
      console.log(`${pad(t, 30)} ${lpad(fmtInt(r[0].n), 12)} baris`);
    } catch (e) {
      console.log(`${pad(t, 30)} ERROR: ${e.message.slice(0, 60)}`);
    }
  }

  // ---- Seq scan vs index scan ----
  header('3. SEQ SCAN vs INDEX SCAN (tabel utama)');
  const scans = await q(`
    SELECT relname AS tabel, seq_scan, seq_tup_read, idx_scan,
           COALESCE(idx_scan,0) + COALESCE(seq_scan,0) AS total_reads,
           CASE WHEN COALESCE(idx_scan,0) + COALESCE(seq_scan,0) = 0 THEN 0
                ELSE ROUND(100.0 * COALESCE(idx_scan,0) /
                     (COALESCE(idx_scan,0) + COALESCE(seq_scan,0)), 1) END AS pct_index,
           last_analyze, last_autoanalyze
    FROM pg_stat_user_tables
    WHERE schemaname='public'
      AND relname = ANY($1::text[])
    ORDER BY seq_tup_read DESC`, [main]);
  console.log(pad('TABEL', 30) + lpad('SEQ SCAN', 10) + lpad('SEQ TUP READ', 14) +
              lpad('IDX SCAN', 10) + lpad('% INDEX', 10) + '   LAST ANALYZE');
  console.log('-'.repeat(90));
  for (const s of scans) {
    console.log(pad(s.tabel, 30) + lpad(fmtInt(s.seq_scan), 10) +
                lpad(fmtInt(s.seq_tup_read), 14) + lpad(fmtInt(s.idx_scan), 10) +
                lpad(s.pct_index + '%', 10) + '   ' +
                String(s.last_autoanalyze || s.last_analyze || 'tidak pernah').slice(0, 19));
  }

  // ---- Index yang sudah ada ----
  header('4. INDEX YANG SUDAH ADA (tabel utama)');
  const idx = await q(`
    SELECT tablename, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname='public' AND tablename = ANY($1::text[])
    ORDER BY tablename, indexname`, [main]);
  let cur = '';
  for (const i of idx) {
    if (i.tablename !== cur) { cur = i.tablename; console.log(`\n[${cur}]`); }
    console.log('  ' + i.indexname);
    console.log('    ' + i.indexdef);
  }
  if (!idx.length) console.log('TIDAK ADA INDEX — migrasi 2026-08-16 tidak pernah dijalankan.');

  // ---- Cek apakah migrasi 2026-08-16 pernah dijalankan ----
  header('5. STATUS MIGRASI SEBELUMNYA');
  const migChecks = [
    ['idx_asj_form_timestamp', 'database_asj_form', '2026-08-16'],
    ['idx_asj_form_no_wa', 'database_asj_form', '2026-08-16'],
    ['idx_asj_form_code_job', 'database_asj_form', '2026-08-16'],
    ['idx_cand_updated_at', 'database_candidate', '2026-08-16'],
    ['idx_cand_loker_trgm', 'database_candidate', '2026-08-16'],
    ['idx_berkas_wa', 'pemberkasan_checklist', '2026-08-16'],
  ];
  for (const [name, tbl, src] of migChecks) {
    const r = await q(`SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname=$1`, [name]);
    console.log(`${r.length ? 'ADA   ' : 'TIDAK '} ${pad(name, 28)} (${src})`);
  }
  const fnExists = await q(`SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                            WHERE n.nspname='public' AND p.proname='normalize_wa'`);
  console.log(`${fnExists.length ? 'ADA   ' : 'TIDAK '} ${pad('normalize_wa()', 28)} (2026-09-01)`);
  const mvExists = await q(`SELECT 1 FROM pg_matviews WHERE schemaname='public'
                            AND matviewname='mv_candidate_current'`);
  console.log(`${mvExists.length ? 'ADA   ' : 'TIDAK '} ${pad('mv_candidate_current', 28)} (2026-09-01)`);

  // ---- Constraint unik (yang dirujuk kode) ----
  header('6. CONSTRAINT UNIK ANTI-DUPLIKAT (dirujuk kode)');
  const cons = await q(`
    SELECT conrelid::regclass AS tabel, conname, pg_get_constraintdef(oid) def
    FROM pg_constraint
    WHERE connamespace='public'::regnamespace AND contype IN ('u','p')
      AND conrelid::regclass::text = ANY($1::text[])
    ORDER BY 1, 2`, [main.map((t) => t)]);
  if (!cons.length) console.log('TIDAK ADA constraint unik/primer pada tabel utama.');
  for (const c of cons) console.log(`${pad(c.tabel, 30)} ${pad(c.conname, 42)} ${c.def}`);

  // ---- Lebar tabel ----
  header('7. LEBAR TABEL (jumlah & jenis kolom)');
  const cols = await q(`
    SELECT table_name,
           count(*) AS kolom,
           count(*) FILTER (WHERE data_type IN ('text','character varying')) AS teks,
           count(*) FILTER (WHERE data_type='jsonb' OR data_type='json') AS json,
           count(*) FILTER (WHERE data_type='ARRAY') AS array
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name = ANY($1::text[])
    GROUP BY table_name ORDER BY kolom DESC`, [main]);
  console.log(pad('TABEL', 30) + lpad('KOLOM', 8) + lpad('TEKS', 8) + lpad('JSON', 8));
  for (const c of cols) {
    console.log(pad(c.table_name, 30) + lpad(c.kolom, 8) + lpad(c.teks, 8) + lpad(c.json, 8));
  }

  // ---- Ukuran rata-rata baris ----
  console.log('\nUkuran rata-rata per baris (perkiraan):');
  for (const t of ['database_candidate', 'master_database_candidate', 'database_asj_form']) {
    if (!existing.has(t)) continue;
    try {
      const r = await q(`SELECT (pg_relation_size($1::regclass) /
                                 NULLIF((SELECT reltuples FROM pg_class WHERE oid=$1::regclass),0)
                                )::bigint AS per_row`, [t]);
      if (r[0] && r[0].per_row) console.log(`  ${pad(t, 30)} ${fmtInt(r[0].per_row)} byte/baris`);
    } catch { /* abaikan */ }
  }

  // ---- Distribusi format nomor WA ----
  header('8. DISTRIBUSI FORMAT NOMOR WA (akar masalah normalisasi)');
  // Nama kolom TIDAK bisa jadi parameter ($1) di PostgreSQL — jadi dibangun
  // dari daftar yang sudah divalidasi terhadap information_schema.
  const WA_ALIASES = ['no_wa', 'wa', 'whatsapp', 'telepon', 'phone', 'no_hp', 'telp'];
  const waTables = [
    ['database_candidate', WA_ALIASES],
    ['master_database_candidate', WA_ALIASES],
    ['database_asj_form', WA_ALIASES],
  ];
  // Kolom WA yang BENAR-BENAR ada, per tabel — ini yang menentukan apakah
  // pola `or=(no_wa.…,wa.…,whatsapp.…)` di kode bisa pernah berhasil.
  const waColsFound = {};
  for (const [t, aliases] of waTables) {
    const found = await q(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name=$1 AND column_name = ANY($2::text[])`,
      [t, aliases]);
    waColsFound[t] = found.map((r) => r.column_name);
  }

  console.log('Kolom WA yang TERSEDIA vs yang DITEBAK kode:');
  console.log('  kode mencoba  : ' + WA_ALIASES.join(', '));
  for (const [t] of waTables) {
    const miss = WA_ALIASES.filter((a) => !waColsFound[t].includes(a));
    console.log(`  ${pad(t, 28)} ada: ${(waColsFound[t].join(', ') || '(tidak ada)')}` +
                (miss.length ? `\n  ${' '.repeat(28)} TIDAK ADA: ${miss.join(', ')}` : ''));
  }

  for (const [t] of waTables) {
    const c = waColsFound[t][0];
    if (!existing.has(t) || !c) {
      console.log(`\n[${t}] tidak ada kolom WA yang dikenal`);
      continue;
    }
    const col = c.replace(/"/g, '""');
    try {
      const r = await q(`
        SELECT count(*) total,
               count(*) FILTER (WHERE "${col}" IS NULL OR btrim("${col}"::text)='') kosong,
               count(*) FILTER (WHERE "${col}"::text LIKE '0%')  awalan_0,
               count(*) FILTER (WHERE "${col}"::text LIKE '62%') awalan_62,
               count(*) FILTER (WHERE "${col}"::text LIKE '+62%') awalan_plus62,
               count(*) FILTER (WHERE "${col}"::text LIKE '8%')  awalan_8,
               count(*) FILTER (WHERE "${col}"::text ~ '[^0-9]') mengandung_non_digit
        FROM public.${t}`);
      const d = r[0];
      console.log(`\n[${t}.${c}]`);
      console.log(`  total                 : ${fmtInt(d.total)}`);
      console.log(`  kosong/NULL           : ${fmtInt(d.kosong)}`);
      console.log(`  awalan '0'   (08xx)   : ${fmtInt(d.awalan_0)}`);
      console.log(`  awalan '62'  (628xx)  : ${fmtInt(d.awalan_62)}`);
      console.log(`  awalan '+62'          : ${fmtInt(d.awalan_plus62)}`);
      console.log(`  awalan '8'   (8xx)    : ${fmtInt(d.awalan_8)}`);
      console.log(`  mengandung non-digit  : ${fmtInt(d.mengandung_non_digit)}  <- butuh normalisasi`);
    } catch (e) { console.log(`\n[${t}] ERROR: ${e.message.slice(0, 70)}`); }
  }

  // ---- Duplikasi WA ----
  header('9. DUPLIKASI BARIS PER WA');
  for (const [t] of waTables) {
    const c = waColsFound[t][0];
    if (!existing.has(t) || !c) continue;
    const col = c.replace(/"/g, '""');
    try {
      const r = await q(`
        SELECT count(*) AS wa_unik,
               COALESCE(sum(n),0) AS baris_terlibat
        FROM (SELECT "${col}" AS w, count(*) n FROM public.${t}
              WHERE "${col}" IS NOT NULL AND btrim("${col}"::text)<>''
              GROUP BY "${col}" HAVING count(*)>1) d`);
      console.log(`${pad(t + '.' + c, 30)} ${lpad(fmtInt(r[0].wa_unik), 8)} WA duplikat, ` +
                  `${lpad(fmtInt(r[0].baris_terlibat), 8)} baris terlibat`);
    } catch (e) { console.log(`${pad(t, 30)} ERROR: ${e.message.slice(0, 60)}`); }
  }

  // ---- id_loker_pilihan (CSV dalam kolom) ----
  header('10. id_loker_pilihan — ANTI-POLA CSV DALAM KOLOM');
  if (existing.has('database_candidate')) {
    const csvCol = await q(`SELECT 1 FROM information_schema.columns
                            WHERE table_schema='public' AND table_name='database_candidate'
                            AND column_name='id_loker_pilihan'`);
    if (csvCol.length) {
      const r = await q(`
        SELECT count(*) total,
               count(*) FILTER (WHERE id_loker_pilihan IS NULL OR btrim(id_loker_pilihan)='') kosong,
               count(*) FILTER (WHERE id_loker_pilihan LIKE '%,%') multi_job,
               count(*) FILTER (WHERE id_loker_pilihan LIKE '%,%' )::float
                 / NULLIF(count(*),0)::float AS pct_multi
        FROM public.database_candidate`);
      console.log(`total baris            : ${fmtInt(r[0].total)}`);
      console.log(`kolom kosong           : ${fmtInt(r[0].kosong)}`);
      console.log(`berisi BANYAK job (,)  : ${fmtInt(r[0].multi_job)} ` +
                  `(${(Number(r[0].pct_multi || 0) * 100).toFixed(1)}%)`);
    } else console.log('kolom id_loker_pilihan tidak ada');
  }

  // ---- EXPLAIN query nyata ----
  header('11. EXPLAIN ANALYZE — POLA QUERY NYATA APLIKASI');

  const plans = [
    ['Q1  Ambil seluruh kandidat (ringan) — inti loadCandidatesUnik',
     `SELECT id,id_kandidat,nama_lengkap,no_wa,status_kandidat,id_loker_pilihan,
             tahapan_seleksi,updated_at,created_at,tanggal_daftar
      FROM database_candidate`],

    ['Q2  1 halaman 1000 baris + ORDER BY updated_at',
     `SELECT id,id_kandidat,nama_lengkap,no_wa,updated_at
      FROM database_candidate ORDER BY updated_at DESC LIMIT 1000 OFFSET 0`],

    // Q3 dibangun HANYA dari kolom yang benar-benar ada — supaya terlihat
    // bagaimana pola `or=` di kode berperilaku terhadap skema nyata.
    ['Q3  Cari kandidat by WA (pola aplikasi: OR 3 kolom)',
     `SELECT * FROM database_candidate WHERE ` +
       (waColsFound['database_candidate'] || ['no_wa'])
         .slice(0, 3)
         .map((c) => `"${c}" = '6281234567890'`).join(' OR ')],

    ['Q4  Cari kandidat per loker (ILIKE wildcard awal)',
     `SELECT * FROM database_candidate WHERE id_loker_pilihan ILIKE '%ASJ%' LIMIT 500`],

    ['Q5  Inbox form, 500 terbaru',
     `SELECT id,timestamp,code_job,kategory,nama_lengkap,no_wa,status
      FROM database_asj_form ORDER BY timestamp DESC LIMIT 500`],

    ['Q6  Master light by WA list (pola aplikasi: OR 3 kolom IN)',
     `SELECT id,no_wa,nama_lengkap FROM master_database_candidate WHERE ` +
       (waColsFound['master_database_candidate'] || ['no_wa'])
         .slice(0, 3)
         .map((c) => `"${c}" IN ('6281234567890','6281234567891')`).join(' OR ')],

    ['Q7  COUNT(*) kandidat — pengganti Prefer: count=exact',
     `SELECT count(*) FROM database_candidate`],
  ];

  for (const [label, sql] of plans) {
    console.log(`\n--- ${label} ---`);
    try {
      const r = await q('EXPLAIN (ANALYZE, BUFFERS, TIMING) ' + sql);
      const planText = r.map((x) => x['QUERY PLAN']).join('\n');
      // Ambil baris ringkasan yang paling informatif
      const lines = planText.split('\n');
      for (const l of lines) {
        if (/Seq Scan|Index Scan|Bitmap|Sort|Aggregate|Limit|Gather|Nested|Hash Join|Execution Time|Planning Time|Buffers|Rows Removed|Filter|Recheck/.test(l)) {
          console.log('  ' + l.trim());
        }
      }
    } catch (e) {
      console.log('  ERROR: ' + e.message.slice(0, 140));
    }
  }

  // ---- pg_stat_statements ----
  header('12. QUERY TERPALING LAMBAT (pg_stat_statements)');
  try {
    const has = await q(`SELECT 1 FROM pg_extension WHERE extname='pg_stat_statements'`);
    if (!has.length) {
      console.log('Ekstensi pg_stat_statements BELUM AKTIF.');
      console.log('Aktifkan: CREATE EXTENSION pg_stat_statements;');
      console.log('(di Supabase: Database → Extensions → pg_stat_statements)');
    } else {
      const slow = await q(`
        SELECT round(total_exec_time::numeric,0) total_ms, calls,
               round(mean_exec_time::numeric,1) rata2_ms,
               round(shared_blks_hit::numeric / NULLIF(shared_blks_hit+shared_blks_read,0) * 100, 1) cache_hit,
               left(query, 150) query
        FROM pg_stat_statements
        WHERE query NOT LIKE '%pg_stat_statements%'
        ORDER BY total_exec_time DESC LIMIT 20`);
      if (!slow.length) console.log('Belum ada data (ekstensi baru dipasang / statistik direset).');
      for (const s of slow) {
        console.log(`\n  total ${fmtInt(s.total_ms)} ms | ${fmtInt(s.calls)} kali | rata2 ${s.rata2_ms} ms | cache hit ${s.cache_hit}%`);
        console.log('  ' + s.query.replace(/\s+/g, ' '));
      }
    }
  } catch (e) { console.log('Tidak bisa membaca pg_stat_statements: ' + e.message.slice(0, 100)); }

  // ---- Index tidak terpakai ----
  header('13. INDEX TIDAK PERNAH DIPAKAI (kandidat di-drop)');
  try {
    const unused = await q(`
      SELECT relname AS tabel, indexrelname AS index, idx_scan,
             pg_size_pretty(pg_relation_size(indexrelid)) ukuran
      FROM pg_stat_user_indexes
      WHERE schemaname='public' AND idx_scan = 0
        AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indexrelid = pg_stat_user_indexes.indexrelid AND i.indisunique)
      ORDER BY pg_relation_size(indexrelid) DESC LIMIT 20`);
    if (!unused.length) console.log('Semua index non-unik pernah dipakai.');
    for (const u of unused) {
      console.log(`${pad(u.tabel, 28)} ${pad(u.index, 42)} ${lpad(u.ukuran, 9)}  0 scan`);
    }
  } catch (e) { console.log('ERROR: ' + e.message.slice(0, 90)); }

  // ---- Autovacuum / dead tuple ----
  header('14. KESEHATAN VACUUM');
  const vac = await q(`
    SELECT relname AS tabel, n_live_tup, n_dead_tup,
           CASE WHEN n_live_tup > 0
                THEN round(100.0*n_dead_tup/(n_live_tup+n_dead_tup),1) ELSE 0 END pct_dead,
           last_autovacuum, last_autoanalyze, autovacuum_count
    FROM pg_stat_user_tables
    WHERE schemaname='public' AND (n_dead_tup > 1000 OR n_live_tup > 0)
      AND relname = ANY($1::text[])
    ORDER BY n_dead_tup DESC`, [main]);
  console.log(pad('TABEL', 30) + lpad('LIVE', 10) + lpad('DEAD', 9) + lpad('% DEAD', 9) +
              '   LAST AUTOVACUUM');
  console.log('-'.repeat(80));
  for (const v of vac) {
    console.log(pad(v.tabel, 30) + lpad(fmtInt(v.n_live_tup), 10) + lpad(fmtInt(v.n_dead_tup), 9) +
                lpad(v.pct_dead + '%', 9) + '   ' +
                String(v.last_autovacuum || 'tidak pernah').slice(0, 19));
  }

  // ---- Cache hit ratio ----
  header('15. CACHE HIT RATIO');
  try {
    const ch = await q(`
      SELECT sum(heap_blks_hit) hit, sum(heap_blks_read) read,
             round(100.0*sum(heap_blks_hit)/NULLIF(sum(heap_blks_hit)+sum(heap_blks_read),0),2) ratio
      FROM pg_statio_user_tables WHERE schemaname='public'`);
    console.log(`index/heap cache hit: ${ch[0].ratio}%  (hit ${fmtInt(ch[0].hit)}, read ${fmtInt(ch[0].read)})`);
  } catch (e) { console.log('ERROR: ' + e.message.slice(0, 90)); }

  // ---- Index redundan ----
  header('16. INDEX REDUNDAN (duplikat / prefix-sama)');
  // Pakai indkey::text (vektor attnum, mis. "2 3") — lebih andal daripada
  // unnest(indkey) yang rusak untuk index berbasis ekspresi.
  const red = await q(`
    WITH ix AS (
      SELECT i.indrelid::regclass::text AS tabel,
             c.relname::text AS index,
             i.indkey::text AS kunci,
             i.indisunique AS unik,
             pg_get_indexdef(i.indexrelid) AS def,
             pg_relation_size(i.indexrelid) AS bytes
      FROM pg_index i
      JOIN pg_class c ON c.oid = i.indexrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname='public'
    )
    SELECT a.tabel, a.index AS a_index, b.index AS b_index,
           a.unik AS a_unik, b.unik AS b_unik,
           pg_size_pretty(a.bytes) AS ukuran,
           CASE WHEN a.kunci = b.kunci THEN 'IDENTIK'
                WHEN b.kunci LIKE a.kunci || ' %' THEN 'prefix dari'
                WHEN a.kunci LIKE b.kunci || ' %' THEN 'prefix dari'
                ELSE 'sama' END AS jenis
    FROM ix a JOIN ix b
      ON a.tabel = b.tabel AND a.index < b.index
     AND (a.kunci = b.kunci
          OR b.kunci LIKE a.kunci || ' %'
          OR a.kunci LIKE b.kunci || ' %')
    ORDER BY a.tabel, a.index`);
  if (!red.length) console.log('Tidak ada index redundan yang terdeteksi.');
  else {
    let total = 0;
    for (const r of red) {
      console.log(`\n[${r.tabel}]  ${r.jenis}`);
      console.log(`   ${r.a_index}${r.a_unik ? ' (UNIQUE)' : ''}`);
      console.log(`   ${r.b_index}${r.b_unik ? ' (UNIQUE)' : ''}   <- bisa di-drop (${r.ukuran})`);
      total++;
    }
    console.log(`\nTotal pasang redundan: ${total}`);
  }
  const idxTotal = await q(`
    SELECT c.relname AS tabel,
           pg_indexes_size(c.oid) AS idx_bytes,
           pg_relation_size(c.oid) AS heap_bytes
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r'
      AND pg_indexes_size(c.oid) > pg_relation_size(c.oid)
      AND pg_relation_size(c.oid) > 0
    ORDER BY pg_indexes_size(c.oid) DESC`);
  if (idxTotal.length) {
    console.log('\nTabel di mana INDEX LEBIH BESAR dari datanya:');
    for (const t of idxTotal) {
      console.log(`  ${pad(t.tabel, 30)} index ${lpad(mb(t.idx_bytes), 9)}  vs data ${lpad(mb(t.heap_bytes), 9)}`);
    }
  }

  // ---- Pengaturan ----
  header('17. PENGATURAN RELEVAN');
  const settings = ['shared_buffers', 'work_mem', 'effective_cache_size',
                    'random_page_cost', 'statement_timeout', 'max_connections',
                    'default_statistics_target', 'maintenance_work_mem'];
  for (const s of settings) {
    try {
      const r = await q('SELECT current_setting($1) v', [s]);
      console.log(`${pad(s, 28)} ${r[0].v}`);
    } catch { /* tidak tersedia */ }
  }

  await client.end();
  console.log('\nSelesai. Tidak ada perubahan yang dilakukan (semua query bersifat baca).');
}

main().catch(async (e) => {
  console.error('\nGAGAL: ' + e.message);
  try { await client.end(); } catch { /* abaikan */ }
  process.exit(1);
});
