/**
 * TESTS: perbaikan bug `ai_data_json` (RPC `master_light`, migrasi 018).
 *
 * KENAPA BERKAS INI ADA
 *   `master_database_candidate.ai_data_json` bertipe **text**. Empat field
 *   identitas yang diminta lewat JSON-path PostgREST
 *   (`ai_gender:ai_data_json->identitas->gender`) karena itu SENYAP kembali
 *   sebagai null — HTTP 200, nilai null, padahal datanya ada. Terukur
 *   2026-10-20 atas DB Neon langsung: 56 dari 234 baris punya
 *   `identitas.gender`/`umur`, dan di lapisan SQL `ai_data_json -> 'identitas'`
 *   bahkan gagal dengan "operator does not exist: text -> unknown".
 *   `projections.test.ts` TIDAK bisa menangkapnya: ia memeriksa kolom DASAR
 *   (`ai_data_json` memang ada), bukan tipe maupun operator. Karena itu yang
 *   diuji di sini adalah tiga hal yang dulu tidak dijaga siapa pun:
 *
 *   1. KONTRAK — daftar kolom RPC (dibaca dari berkas migrasi sebagai teks,
 *      dengan cara BERBEDA dari yang membacanya di TS) sama dengan
 *      MASTER_LIGHT_COLS + empat nama di AI_BIO_FALLBACK. Kalau migrasi dan
 *      kode menyimpang, tes ini merah sebelum ada yang deploy.
 *   2. PENGABELAN — `fetchMasterLightByWa` memanggil RPC DULU, dan fallback
 *      PostgREST-nya tidak lagi membawa empat alias JSON-path itu (fallback
 *      yang membawanya akan terlihat berhasil sambil mengembalikan null).
 *   3. BUKTI LANGSUNG — RPC-nya benar-benar mengisi `ai_*` untuk baris nyata,
 *      termasuk kasus persis bug-nya: master `gender` kosong, isi ada di AI.
 *
 * KENAPA DI `e2e/` (R13f-bis): counter beku `indexer` menghitung berkas `.ts`
 * di bawah `netlify/functions/`, jadi tes `.ts` di sana menggeser angka yang
 * hanya boleh di-baseline ulang team-lead; tier `e2e/` hanya menghitung
 * mjs/cjs/js. Berkas ini TANPA DOM, jadi milik project 'backend' — lihat
 * baris exclude-nya di vitest.config.ts.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import pg from 'pg';
import { MASTER_LIGHT_COLS } from '../netlify/functions/_lib/db/projections';
import { fetchMasterLightByWa } from '../netlify/functions/_lib/db/master';
import { buildBioFromMaster, AI_BIO_FALLBACK } from '../netlify/functions/_lib/db/berkas';
import { initDbEnv, REPO_ROOT } from '../scripts/lib/load-env.mjs';
import { stripSqlComments } from '../scripts/lib/sql-ddl.mjs';

/**
 * Migrasi TERAKHIR yang mendefinisikan `master_light`, bukan nomor berkas yang
 * tetap.
 *
 * Sampai 2026-10-27 baris ini menunjuk `018` secara harfiah, dan itu membuat
 * tes ini buta terhadap keadaan sebenarnya: `MASTER_LIGHT_COLS` tumbuh enam
 * kolom (`pas_photo`, `pendidikan_1..5_tingkat`) sementara `master_light` tetap
 * mengembalikan 29 — selisihnya muncul sebagai SATU kegagalan kontrak yang
 * terbaca seperti "kode dan migrasi menyimpang" tanpa menyebut migrasi mana
 * yang menyimpang. Dengan memilih berkas terakhir yang memuat definisi itu,
 * migrasi baru otomatis menjadi subjek tesnya.
 */
const MIGRATION = (() => {
  const dir = `${REPO_ROOT}/migrations`;
  const candidates = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => `${dir}/${f}`)
    // `CREATE [OR REPLACE] FUNCTION`: migrasi 023 harus DROP dulu (menambah
    // kolom = mengubah tipe hasil, dan `CREATE OR REPLACE` menolak itu), jadi
    // bentuk tanpa `OR REPLACE` WAJIB ikut dikenali — kalau tidak, pencarian
    // ini diam-diam kembali ke 018 dan tesnya buta lagi.
    .filter((p) => /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.master_light\b/i.test(readFileSync(p, 'utf8')));
  const last = candidates.at(-1);
  if (!last) throw new Error('tidak ada migrasi yang mendefinisikan public.master_light');
  return last;
})();

/**
 * Komentar DIBUANG sebelum teks SQL dianalisis — pakai helper yang sama dengan
 * runner migrasi (`scripts/lib/sql-ddl.mjs`, dibangun 2026-10-20 setelah
 * insiden CONCURRENTLY-nya). Ini bukan kerapian: versi pertama tes ini sendiri
 * membaca KOMENTAR header migrasi sebagai kode — ia menghitung baris komentar
 * di daftar SELECT sebagai kolom, dan pola `GRANT … TO anon` yang dikutip di
 * dalam prosa header membuat tes keamanan merah. Komentar tidak boleh mengubah
 * apa pun tentang bagaimana berkas dieksekusi; termasuk di dalam tes.
 */
const sql = stripSqlComments(readFileSync(MIGRATION, 'utf8'));

/**
 * Semua percakapan PostgREST yang dilakukan test pengabelan di bawah.
 * Dicatat apa adanya — {method, path} — supaya "RPC dipanggil sekali" bisa
 * dibuktikan sebagai jumlah, bukan diklaim.
 */
const rtt: Array<{ method: string; path: string; query?: unknown; body?: unknown }> = [];

vi.mock('../netlify/functions/_lib/db/client.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../netlify/functions/_lib/db/client.ts')>();
  return {
    ...actual,
    supabaseJson: vi.fn(async (method: string, pathname: string, opts?: { query?: unknown; body?: unknown }) => {
      rtt.push({ method, path: pathname, query: opts?.query, body: opts?.body });
      // RPC gagal SENGAJA di test pertama; yang memutuskan hidup/mati
      // fallback adalah `rpcFails`, bukan mock ini.
      if (pathname.startsWith('rpc/master_light') && rpcFails) throw new Error('rpc master_light belum ada');
      if (pathname.startsWith('rpc/master_light')) return [];
      return [];
    }),
  };
});

/** Dibalikkan oleh test pengabelan: true = seolah-olah migrasi 018 belum jalan. */
let rpcFails = false;

// ── 1. KONTRAK: migrasi ↔ kode, dibaca dua cara yang berbeda ─────────────────
describe('kontrak: RPC master_light vs proyeksi TS', () => {
  it('RETURNS TABLE memuat PERSIS kolom proyeksi + empat nama ai_*', () => {
    const block = /RETURNS TABLE \(([\s\S]*?)\)\s*\nLANGUAGE/.exec(sql);
    expect(block, 'RETURNS TABLE tidak terbaca dari migrasi').not.toBeNull();
    if (!block) throw new Error('RETURNS TABLE tidak terbaca dari migrasi');
    const cols = block[1]
      .split('\n')
      .map((l) => l.trim().replace(/,\s*$/, ''))
      .filter(Boolean)
      .map((l) => l.split(/\s+/)[0]);

    const projectionCols = MASTER_LIGHT_COLS.split(',');
    const aiCols = AI_BIO_FALLBACK.map(([, aiKey]) => aiKey);

    expect(cols).toEqual([...projectionCols, ...aiCols]);
    // Urutan juga penting: RETURNS TABLE dan daftar SELECT dipasangkan
    // posisional di Postgres, jadi "isi sama, urutan beda" tetap rusak.
    // CATATAN: `stripSqlComments` menjaga badan `$$ … $$` UTUH apa adanya
    // (memang begitu rancangannya — isinya kode, bukan yang boleh diubah), jadi
    // komentar DI DALAM badan fungsi masih terbaca di sini. Baris komentar
    // dibuang eksplisit: sebuah item SELECT tidak mungkin dimulai dengan `--`.
    const selectList = /SELECT([\s\S]*?)FROM public\.master_database_candidate/.exec(sql);
    if (!selectList) throw new Error('daftar SELECT tidak terbaca dari migrasi');
    const selectLines = selectList[1]
      .split('\n')
      .map((l) => l.trim().replace(/,$/, ''))
      .filter((l) => l && !l.startsWith('--'));
    const selectNames = selectLines.map((l) => {
      const asM = /\bAS\s+(\w+)\s*$/i.exec(l);
      if (asM) return asM[1]; // `(expr) AS ai_gender`
      return l.replace(/^m\./, '').replace(/::\w+.*$/, ''); // `m.id::bigint` -> `id`
    });
    expect(selectNames).toEqual(cols);
    expect(selectList[1]).toContain('AS ai_gender');
    expect(selectList[1]).toContain('AS ai_umur');
    expect(selectList[1]).toContain('AS ai_tb');
    expect(selectList[1]).toContain('AS ai_bb');
  });

  it('keempat ai_* memakai cast ::jsonb — itu inti perbaikannya', () => {
    // `->` pada kolom text tidak ada di Postgres ("operator does not exist:
    // text -> unknown") dan JSON-path PostgREST jawab 200+null. Yang membuat
    // RPC ini berguna HANYALAH cast di dalam SQL.
    expect(sql).toContain("m.ai_data_json::jsonb -> 'identitas' ->> 'gender'");
    expect(sql).toContain("m.ai_data_json::jsonb -> 'identitas' ->> 'umur'");
    expect(sql).toContain("m.ai_data_json::jsonb -> 'identitas' ->> 'tb'");
    expect(sql).toContain("m.ai_data_json::jsonb -> 'identitas' ->> 'bb'");
  });

  it('filter memakai indeks UNIQUE no_wa yang sudah ada', () => {
    expect(sql).toContain('WHERE m.no_wa = ANY (wa_list)');
    expect(sql).toContain('LIMIT 500');
    expect(sql).toContain('LANGUAGE sql');
    expect(sql).toContain('STABLE');
  });

  it('TIDAK memberi anon hak eksekusi (PII; RLS master_own_wa sudah menutup)', () => {
    expect(sql).not.toMatch(/GRANT\s+EXECUTE[^;]*\bTO\s+anon/i);
    expect(sql).not.toMatch(/SECURITY\s+DEFINER/i);
  });

  it('proyeksi fallback tidak lagi membawa alias JSON-path yang selalu null', () => {
    // Kalau empat alias itu kembali, fallback akan terlihat berhasil sambil
    // mengembalikan null — persis bug yang berkas ini perbaiki.
    expect(MASTER_LIGHT_COLS).not.toContain('->');
    expect(MASTER_LIGHT_COLS).not.toContain(':');
    expect(MASTER_LIGHT_COLS).not.toContain('ai_');
  });
});

// ── 2. PENGABELAN: RPC dulu, fallback tanpa alias ────────────────────────────
describe('fetchMasterLightByWa — urutan panggilan', () => {
  it('memanggil RPC master_light lebih dulu dengan body wa_list', async () => {
    rpcFails = false;
    rtt.length = 0;
    const rows = await fetchMasterLightByWa(['628123456789', '628987654321']);
    expect(rtt).toHaveLength(1); // RPC menjawab — fallback TIDAK dijalankan
    expect(rtt[0]).toMatchObject({ method: 'POST', path: 'rpc/master_light' });
    expect(rtt[0].body).toEqual({ wa_list: ['628123456789', '628987654321'] });
    expect(Array.isArray(rows)).toBe(true);
  });

  it('jatuh ke proyeksi PostgREST (tanpa ai_*) kalau RPC gagal', async () => {
    rpcFails = true;
    rtt.length = 0;
    const rows = await fetchMasterLightByWa(['628123456789']);
    expect(rtt).toHaveLength(2); // RPC gagal → satu GET fallback
    expect(rtt[0].path).toBe('rpc/master_light');
    expect(rtt[1]).toMatchObject({ method: 'GET', path: 'master_database_candidate' });
    const q = rtt[1].query as { select: string; no_wa: string };
    expect(q.select).toBe(MASTER_LIGHT_COLS);
    expect(q.select).not.toContain('->'); // bug-nya tidak ikut di fallback
    expect(q.no_wa).toBe('in.(628123456789)');
    expect(Array.isArray(rows)).toBe(true);
    rpcFails = false;
  });

  it('mengembalikan null kalau RPC DAN fallback sama-sama gagal', async () => {
    rpcFails = true;
    rtt.length = 0;
    // Mock menjawab [] (bukan melempar) untuk GET, jadi untuk mencapai null
    // kedua jalur harus melempar — di situasi nyata itu berarti DB mati.
    const original = vi.mocked(await import('../netlify/functions/_lib/db/client.ts')).supabaseJson;
    original.mockImplementationOnce(async () => {
      throw new Error('rpc gagal');
    });
    original.mockImplementationOnce(async () => {
      throw new Error('get gagal');
    });
    const rows = await fetchMasterLightByWa(['628123456789']);
    expect(rows).toBeNull();
    rpcFails = false;
  });
});

// ── 3. BUKTI LANGSUNG: RPC mengisi ai_* untuk baris nyata ────────────────────
// Dijalankan hanya kalau kredensial DB langsung tersedia (.env.local di mesin
// pemilik / CI rahasia). Tanpa itu tes DILEWATI, bukan gagal — jalur ini bukan
// milik CI, dan repo memang tidak punya tes lain yang menyentuh DB nyata.
const dbUrl = (() => {
  initDbEnv();
  return process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || '';
})();

describe.skipIf(!dbUrl)('langsung: master_light mengisi ai_* (butuh DB)', () => {
  it('baris dengan gender hanya di ai_data_json kini terisi lewat bio', async () => {
    const client = new pg.Client({ connectionString: dbUrl });
    await client.connect();
    try {
      // Cari baris yang KOLOM gender-nya kosong TAPI ai-nya ada — kasus persis
      // yang dulu tampil "-" di dossier profil.
      const target = await client.query(
        `select no_wa from master_database_candidate
         where coalesce(gender, '') = ''
           and coalesce(ai_data_json::jsonb -> 'identitas' ->> 'gender', '') <> ''
         limit 1`,
      );
      expect(target.rows.length, 'harus ada baris uji dengan master gender kosong').toBeGreaterThan(0);
      const wa: string = target.rows[0].no_wa;

      const rows = await client.query('select * from public.master_light($1::text[])', [[wa]]);
      expect(rows.rows).toHaveLength(1);
      // Jumlah kolom DITURUNKAN dari proyeksi, bukan ditulis 29: angka harfiah
      // di sini adalah cara berkas ini dulu menyembunyikan selisih yang justru
      // dicarinya — 29 dipaku padahal `MASTER_LIGHT_COLS` sudah 31 kolom.
      expect(Object.keys(rows.rows[0])).toHaveLength(
        MASTER_LIGHT_COLS.split(',').length + AI_BIO_FALLBACK.length,
      );
      const mr = rows.rows[0] as Record<string, unknown>;
      expect(String(mr.gender ?? '')).toBe('');
      expect(String(mr.ai_gender ?? '')).not.toBe('');

      // Ujung penerima: buildBioFromMaster harus menambal gender dari AI.
      const bio = buildBioFromMaster(mr);
      expect(bio.gender).not.toBe('');
    } finally {
      await client.end();
    }
  }, 60000);

  it('WA yang tidak ada tetap mengembalikan nol baris (bukan error)', async () => {
    const client = new pg.Client({ connectionString: dbUrl });
    await client.connect();
    try {
      const rows = await client.query('select * from public.master_light($1::text[])', [['6280000000000']]);
      expect(rows.rows).toHaveLength(0);
      const empty = await client.query('select * from public.master_light($1::text[])', [[]]);
      expect(empty.rows).toHaveLength(0);
    } finally {
      await client.end();
    }
  }, 60000);
});

/**
 * KONTRAK `rpc/nextval` — alokasi id kandidat.
 *
 * KENAPA DI SINI, DAN KENAPA INI PENTING
 *   `_lib/candidate-helpers.ts` memanggil `GET /rest/v1/rpc/nextval` dan
 *   mengklaim alokasi id-nya atomik. Ternyata migrasi 006 hanya membuat
 *   SEQUENCE-nya; tidak ada fungsi `nextval` di schema yang diekspos PostgREST,
 *   dan `pg_catalog.nextval` tidak bisa dijangkau sebagai `rpc/nextval`. Setiap
 *   panggilan dijawab 404, `.catch(() => null)` menelannya, dan alokasi berjalan
 *   pada `MAX(id_kandidat)+1` — TOCTOU yang justru ingin dihapus sequence itu
 *   (gejalanya sudah tercatat: ASJ00226 bentrok). Tidak ada satu pun tes yang
 *   merah, karena fallback-nya hampir selalu berhasil.
 *
 *   Yang dikunci di sini adalah pasangan kode↔migrasi: kalau panggilan RPC-nya
 *   hilang, atau fungsinya tidak pernah dibuat, tes ini merah SEBELUM deploy —
 *   bukan setelah ada dua kandidat yang mendapat id sama.
 */
describe('kontrak: rpc/nextval (alokasi id kandidat)', () => {
  const dir = `${REPO_ROOT}/migrations`;
  const defining = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .filter((f) =>
      /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.nextval\b/i.test(
        stripSqlComments(readFileSync(`${dir}/${f}`, 'utf8')),
      ),
    );

  it('ada migrasi yang mendefinisikan public.nextval', () => {
    expect(defining.length).toBeGreaterThan(0);
  });

  it('fungsinya hanya melayani candidate_id_seq (bukan sequence apa pun)', () => {
    const last = defining.at(-1);
    expect(last).toBeTruthy();
    const ddl = stripSqlComments(readFileSync(`${dir}/${last as string}`, 'utf8'));

    expect(ddl).toContain('candidate_id_seq');
    // Tanpa penolakan eksplisit, `rpc/nextval` yang publik menjadi alat untuk
    // memajukan sequence tabel LAIN hanya dengan mengirim namanya.
    expect(ddl).toMatch(/RAISE\s+EXCEPTION/i);
    expect(ddl).toMatch(/SECURITY\s+DEFINER/i);
  });

  it('kode memanggil RPC itu untuk sequence yang sama', () => {
    const src = readFileSync(
      `${REPO_ROOT}/netlify/functions/_lib/candidate-helpers.ts`,
      'utf8',
    );
    expect(src).toContain("'rpc/nextval'");
    expect(src).toContain("seqname: 'candidate_id_seq'");
    // Degradasi ke MAX+1 harus TERLIHAT, bukan senyap.
    expect(src).toContain('candidate-id.sequence-unavailable');
  });
});
