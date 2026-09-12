import { env } from '../env.ts';
import { normalizeWa } from '../../shared/wa-rules';
import { request, requestJson, BUDGETS, HttpError, TimeoutError } from '../kernel/http.ts';
import { AppError } from '../kernel/errors';
import { asyncLocalStorage } from '../kernel/log';
import { allColumns, columnsOf } from './schema.generated';
// db/client.js — klien REST Supabase (PostgREST) + normalisasi data.
// perilaku TIDAK berubah.

// Aturan WA (normalisasi + gate) — satu sumber kebenaran: shared/wa-rules.js
// (dipakai frontend js/04_auth.js juga). Jangan definisikan ulang di sini.

/** @typedef {{ query?: Record<string, string | number>, headers?: Record<string, string>, body?: unknown }} JsonOpts */
/** @typedef {{ table: string | null, rows: Record<string, unknown>[] }} FindTableResult */
/** @typedef {{ paths?: Record<string, unknown>, definitions?: Record<string, { properties?: Record<string, unknown> }>, components?: { schemas?: Record<string, { properties?: Record<string, unknown> }> } }} OpenApiSpec */

/** @returns {string} */
function supabaseUrl() {
  return env('SUPABASE_URL');
}

/** @returns {string} */
function supabaseKey() {
  return env('SUPABASE_SERVICE_ROLE_KEY') || env('SUPABASE_ANON_KEY') || env('SUPABASE_KEY');
}

/** @returns {boolean} */
function hasBackend() {
  return !!(supabaseUrl() && supabaseKey());
}

/**
 * Resolve a caller's `select` against the generated contract.
 *
 * PostgREST treats a missing `select` as `*`, so "I forgot to project" and
 * "I asked for every column" are the same request. Both are now answered with
 * an explicit column list taken from `schema.generated.ts`, which means:
 *   - a wildcard can never reach the wire, even from a call site that asks for one;
 *   - a read of a table that is NOT in the generated contract is left untouched,
 *     because there is nothing truthful to project it with.
 *
 * Cost note: `master_database_candidate` is 169 columns / ~1.14 KB per row. An
 * explicit list is the same bytes as `*`; what it buys is that the set is
 * checked in CI instead of discovered in production.
 *
 * @param {string} table @param {string | number | undefined} requested @returns {string | undefined}
 */
function resolveSelect(table: string, requested?: string | number | null): string | undefined {
  const known = columnsOf(table);
  if (!known || known.length === 0) return requested === undefined ? undefined : String(requested);
  if (requested === undefined || requested === null || requested === '' || String(requested) === '*') {
    return allColumns(table);
  }
  return String(requested);
}

/** Seconds a client should wait before retrying a database outage. */
const DB_RETRY_AFTER_S = 5;

/**
 * Is this failure "the database is not there", as opposed to "the database
 * answered, and the answer was no"?
 *
 * YES  — TimeoutError (the socket opened, nothing came back), a bare TypeError
 *        from fetch() (DNS, TLS, connection refused), and any HTTP 5xx (the
 *        pooler or PostgREST itself is unhealthy).
 * NO   — 4xx. A bad column, a missing table or a constraint violation is a
 *        truthful answer from a working database; retrying would fail the same
 *        way. AppError is excluded too: DEADLINE_EXCEEDED and OVERLOADED are
 *        already classified, and the breaker's own SERVICE_UNAVAILABLE is
 *        handled by the caller below rather than re-wrapped.
 */
function isDatabaseUnreachable(err: unknown): boolean {
  if (err instanceof TimeoutError) return true;
  if (err instanceof HttpError) return err.status >= 500;
  if (err instanceof AppError) return false;
  return err instanceof TypeError;
}

/**
 * Record on the request context that the database was unreachable, so the
 * surface wrapper can answer 503 + Retry-After + no-store even after a service
 * has swallowed this error into a friendly string. See LogContext.dbOutage.
 * Best-effort: outside a request scope (scripts, tests, the sweep) there is no
 * store to mark, and the throw alone is still correct.
 */
function markDbOutage(): void {
  const store = asyncLocalStorage.getStore();
  if (store) store.dbOutage = true;
}

/** @param {string} method @param {string} pathname @param {JsonOpts} [opts] @returns {Promise<unknown>} */
async function supabaseJson(
  method: string,
  pathname: string,
  opts: {
    query?: Record<string, string | number>;
    headers?: Record<string, string>;
    body?: unknown;
    overrideKey?: string;
    overrideAuthKey?: string;
  } = {},
) {
  const url = supabaseUrl();
  const overrideKey = opts.overrideKey;
  const overrideAuthKey = opts.overrideAuthKey;
  const key = overrideKey || supabaseKey();
  if (!url || !key) throw new Error('SUPABASE_URL / key belum dikonfigurasi');

  // P13 fix: Don't duplicate breaker/bulkhead here — request() already
  // applies them for all PostgREST calls (reads AND writes). Acquiring
  // them here AND in request() double-counted against the limits.

  // Every GET goes out with an explicit projection. See resolveSelect().
  const query = method === 'GET' ? { ...(opts.query || {}) } : opts.query;
  if (method === 'GET' && query) {
    const resolved = resolveSelect(pathname, query.select);
    if (resolved !== undefined) query.select = resolved;
  }

  const qs = query
    ? '?' +
      new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString()
    : '';
  let res: Response;
  try {
    res = await request(url.replace(/\$/, '') + '/rest/v1/' + pathname + qs, {
      method,
      headers: {
        apikey: key,
        Authorization: 'Bearer ' + (overrideAuthKey || key),
        'Content-Type': 'application/json',
        ...(opts.headers || {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      budgetKey: opts.body ? 'postgrest_write' : 'postgrest_read',
    });
  } catch (e: unknown) {
    // Phase E row 2. An unreachable database used to surface as whatever the
    // caller's catch block produced — usually a code-less message, which
    // `outcomeStatusCode` maps to 400. A client that retries on 503 then gave
    // up exactly when retrying was the right move. Translate it here, at the
    // one place every PostgREST call goes through.
    if (e instanceof AppError && e.code === 'SERVICE_UNAVAILABLE') {
      // The breaker/bulkhead already decided this call must not go out.
      markDbOutage();
      throw e;
    }
    if (isDatabaseUnreachable(e)) {
      markDbOutage();
      throw new AppError('SERVICE_UNAVAILABLE', {
        message: 'Database sedang tidak dapat dihubungi. Coba lagi sebentar lagi.',
        retryAfter: DB_RETRY_AFTER_S,
        cause: e,
      });
    }
    throw e;
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(pathname + ' → HTTP ' + res.status + ' ' + text.slice(0, 200));
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}
// UPSERT via PostgREST: INSERT dengan resolution=merge-duplicates + on_conflict.
// Kalau baris dengan kolom konflik sudah ada (unique index), UPDATE baris lama
// alih-alih error 409 duplicate key — duplikasi tidak mungkin & user tidak
// melihat error. Butuh unique index di kolom konflik (lihat
// migrations/20260825_index_antiduplikat.sql SECTION 4).
/** @param {string} table @param {Record<string, unknown>} row @param {string[]} conflictCols @param {JsonOpts} [opts] @returns {Promise<unknown>} */
async function supabaseUpsert(
  table: string,
  row: Record<string, unknown>,
  conflictCols: string[],
  opts: {
    query?: Record<string, string | number>;
    headers?: Record<string, string>;
    body?: unknown;
  } = {},
): Promise<unknown> {
  const cols = conflictCols.join(',');
  try {
    return await supabaseJson('POST', table, {
      ...opts,
      body: row,
      query: { ...(opts.query || {}), on_conflict: cols },
      // Gabung Prefer pemanggil (mis. return=minimal) dengan resolution upsert.
      headers: {
        ...(opts.headers || {}),
        Prefer:
          ((opts.headers && opts.headers.Prefer) || 'return=minimal') +
          ',resolution=merge-duplicates',
      },
    });
  } catch (e) {
    // 42P10 = unique index di kolom konflik belum ada di DB
    // (migrations/20260825_index_antiduplikat.sql SECTION 4 belum dijalankan).
    // P25 fix: Check for SQLSTATE code in multiple formats — PostgREST may
    // embed it in the message, the hint, or as a separate field.
    const errStr = String((e as { message?: unknown } | null)?.message ?? '') + ' ' + String((e && (e as any).hint) || '');
    if (!errStr.includes('42P10') && !errStr.includes('does not exist')) throw e;
    return supabaseJson('POST', table, {
      ...opts,
      body: row,
      headers: { ...(opts.headers || {}), Prefer: 'return=minimal' },
    });
  }
}

// `supabasePaged()` used to live here: a Range-header (OFFSET/LIMIT) reader used
// only by fetchPagedAll(). It was deleted on 2026-09-12 along with its last
// caller — see ./pagination.ts for why OFFSET paging was the wrong primitive
// (unstable under concurrent inserts, and one wasted round-trip per full page to
// discover the end) and what replaced it.

// Resolve a legacy table name against the generated contract instead of probing
// the network for it.
//
// The old version issued one HTTP request per candidate name until one answered
// with rows — up to nine requests to discover something the schema document
// already states. A name that is not in `schema.generated.ts` is not exposed by
// PostgREST, so there is nothing to probe: skip it. Callers that need the whole
// row still get it, via an explicit projection rather than `*`.
/** @param {string[]} candidates @param {number} [limit] @returns {Promise<FindTableResult>} */
async function findTable(candidates: string[], limit = 1) {
  for (const t of candidates) {
    if (!columnsOf(t)) continue;
    try {
      const rows = await supabaseJson('GET', t, {
        query: { select: allColumns(t), limit },
      });
      if (Array.isArray(rows) && rows.length > 0) return { table: t, rows };
    } catch {
      /* tabel ada di kontrak tapi tidak bisa dibaca — coba kandidat berikutnya */
    }
  }
  return { table: null, rows: [] };
}

/** @param {Record<string, unknown>} row @param {string[]} keys @returns {unknown} */
function pick<T extends object>(row: T, keys: string[]): unknown {
  const rowAny = row as Record<string, unknown>;
  for (const k of keys) {
    if (rowAny[k] !== undefined && rowAny[k] !== null && rowAny[k] !== '') return rowAny[k];
  }
  return null;
}

/** @param {unknown} v @returns {string} */
function toText(v: unknown) {
  if (v == null) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// Normalisasi nomor WA Indonesia: "0821..." -> "62821...", "+62821..." -> "62821...".
// Status asli di DB campur: "✅ OPEN", "❌ CLOSE", "SELESAI / CLOSE",
// "PENCARIAN KANDIDAT", "PEMBERKASAN", "APPROVED", "" — yang berarti masih
// rekrutmen hanya yang eksplisit tertutup; sisanya dianggap OPEN.
/** @param {unknown} v @returns {'OPEN'|'CLOSE'|'URGENT'} */
function normalizeStatus(v: unknown) {
  const s = toText(v).toUpperCase();
  if (s.includes('URGENT')) return 'URGENT';
  if (s === '') return 'CLOSE';
  if (s.includes('CLOSE') || s.includes('TUTUP') || s.includes('SELESAI')) {
    return 'CLOSE';
  }
  return 'OPEN';
}

// SATU-SATUNYA normalisasi gender backend — disamakan dengan kanonikal situs
// lama (normalizeGenderValue di js/03_candidate.js): LAKI-LAKI / PEREMPUAN.
// CV AI dan render L/P mengecek format ini (includes('PEREMPUAN') dsb), jadi
// jangan tambah varian normalisasi lain di jalur mana pun.
/** @param {unknown} v @returns {'LAKI-LAKI'|'PEREMPUAN'|''} */
function normalizeGender(v: unknown) {
  const s = toText(v).trim().toUpperCase();
  if (!s || s === '-') return '';
  if (s === 'L' || s === 'LK' || s === 'M' || s === 'PRIA' || s === 'MALE' || s.includes('LAKI'))
    return 'LAKI-LAKI';
  if (
    s === 'P' ||
    s === 'PR' ||
    s === 'F' ||
    s === 'W' ||
    s === 'FEMALE' ||
    s === 'WANITA' ||
    s === 'CEWEK' ||
    s.includes('PEREMPUAN') ||
    s.includes('女')
  )
    return 'PEREMPUAN';
  return '';
}

// Baca skema OpenAPI (daftar tabel + kolom) — dipakai untuk penemuan tabel
// adaptif saat nama tabel tidak cocok dengan tebakan.
/** @returns {Promise<OpenApiSpec | null>} */
async function getSchema() {
  if (!hasBackend()) return null;
  try {
    return await supabaseJson('GET', '', {});
  } catch {
    return null;
  }
}

/** @param {OpenApiSpec} spec @returns {string[]} */
function tablesFromSchema(spec: { paths?: Record<string, unknown> }) {
  if (!spec || !spec.paths) return [];
  return Object.keys(spec.paths)
    .map((p) => p.replace(/^\//, ''))
    // PostgREST lists RPCs under the same `paths` map. They are not tables and
    // have no columns, so callers that walk the schema for a table should never
    // see them.
    .filter((p) => Boolean(p) && !p.startsWith('rpc/'));
}

/** @param {OpenApiSpec} spec @param {string} table @returns {string[]} */
// Kolom WA pada row apply/candidate: no_wa | wa | whatsapp — selalu dibaca lewat
// pick(r, APPLY_WA_COLS) lalu dinormalisasi. Satu sumber: dipakai cv.js & service master-data.
const APPLY_WA_COLS = ['no_wa', 'wa', 'whatsapp'];

function columnsFromSchema(spec: { definitions?: Record<string, { properties?: Record<string, unknown> }>; components?: { schemas?: Record<string, { properties?: Record<string, unknown> }> } }, table: string) {
  // PostgREST answers Swagger 2.0, which puts the row shapes under `definitions`.
  // This used to read `components.schemas` — always empty — so every caller got
  // an empty column list and the adaptive table discovery in
  // contexts/catalog/repository.ts could never match anything. `components` is
  // kept as a fallback for OpenAPI 3.
  const shapes = spec?.definitions || spec?.components?.schemas;
  if (!shapes) return [];
  const s = shapes[table];
  return s && s.properties ? Object.keys(s.properties) : [];
}

export {
  supabaseUrl,
  supabaseKey,
  hasBackend,
  supabaseJson,
  supabaseUpsert,
  findTable,
  pick,
  APPLY_WA_COLS,
  toText,
  normalizeWa,
  normalizeStatus,
  normalizeGender,
  getSchema,
  tablesFromSchema,
  columnsFromSchema,
};
