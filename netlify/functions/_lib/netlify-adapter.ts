/**
 * netlify-adapter.ts — jembatan antara Netlify Functions modern dan handler
 * berbentuk Lambda yang sudah ada di repo ini.
 *
 * ── MENGAPA FILE INI ADA ─────────────────────────────────────────────────────
 * Deploy produksi 2026-09-12 gagal di tahap *function creation*, bukan karena
 * bug: **AWS Lambda compatibility mode** menyuntikkan SELURUH environment ke
 * SETIAP fungsi dan membatasinya 4096 byte per fungsi. Total kita 4275 byte —
 * lebih 179. Satu variabel saja (surat izin Firebase) memakan 59% anggaran.
 *
 * Netlify sendiri yang menyatakan batas itu hilang di runtime fungsi yang baru
 * (changelog 2026-06-12): "no longer applies to functions running on the current
 * Netlify Functions runtime", sementara "still applies to functions running in
 * Lambda compatibility mode". Jadi jalan keluarnya adalah pindah format:
 *
 *   lama : exports.handler = async (event) => ({ statusCode, headers, body })
 *   baru : export default async (request) => new Response(body, { status, headers })
 *
 * ── MENGAPA ADAPTOR, BUKAN TULIS ULANG ───────────────────────────────────────
 * Bentuk "event" itu bukan sekadar gaya penulisan: seluruh wrapper, kernel
 * (deadline, admission, metrics, CORS, backpressure) dan 40+ test mengasumsikan
 * `event.headers`, `event.body`, `event.queryStringParameters`. Menulis ulang
 * semuanya sekaligus berarti menyentuh jalur permintaan yang sedang melayani
 * produksi — risiko besar untuk keuntungan nol, karena yang sebenarnya
 * dibutuhkan hanyalah bentuk *pintu masuk* yang dikenali Netlify.
 *
 * Jadi konversinya dikumpulkan di SATU tempat:
 *
 *   Request  --eventFromRequest()-->  event (bentuk lama)  -->  handler lama
 *   outcome  --responseFromOutcome()-->  Response (bentuk baru)
 *
 * Handler di entry point cukup dibungkus:
 *
 *   import { adapt } from './_lib/netlify-adapter.js';
 *   export default adapt(makeSurfaceHandler(ACTIONS, [...]));
 *
 * Dengan begitu setiap entry point bisa dipindah satu per satu, dan yang belum
 * dipindah tetap berjalan.
 *
 * ── DUAL-MODE (dan mengapa ini disengaja) ────────────────────────────────────
 * `adapt()` menerima Request **atau** event lama. Kalau yang datang bukan
 * Request, ia meneruskan apa adanya ke handler lama dan mengembalikan bentuk
 * lama. Alasannya bukan kemalasan:
 *
 *   1. Test yang ada memanggil handler langsung dengan event buatan (mis.
 *      `handler({ httpMethod: 'GET', headers: {} })`) dan memeriksa
 *      `res.statusCode`. Memaksa bentuk Request akan membuat puluhan test harus
 *      ditulis ulang tanpa menambah keyakinan apa pun.
 *   2. Migrasi jadi bisa dibalik. Kalau ada yang salah di produksi, satu baris
 *      `export default` bisa dikembalikan ke `exports.handler` tanpa menyentuh
 *      logika.
 *   3. `netlify dev` versi lama masih mengirim event, bukan Request.
 *
 * ── CATATAN YANG MUDAH SALAH ─────────────────────────────────────────────────
 * - **Header dinormalkan ke huruf kecil.** Kode lama mencari campuran
 *   `h.authorization || h.Authorization`; di Request, `headers.get()` sudah
 *   case-insensitive, tapi objek yang kita bangun tidak. Normalisasi di sini
 *   berarti pencarian gaya lama tetap bekerja.
 * - **Body dibaca SEKALI sebagai teks.** `request.text()` menghabiskan stream;
 *   membacanya dua kali akan melempar. Handler lama memang hanya butuh string,
 *   jadi dibaca di sini dan diteruskan sebagai `event.body`.
 * - **204/304 tidak boleh membawa body.** `new Response(body, {status: 204})`
 *   melempar TypeError di runtime, jadi body di-null-kan untuk status itu.
 */

/** Bentuk event gaya Lambda yang dipakai seluruh kode lama. */
export interface LegacyEvent {
  httpMethod: string;
  rawUrl: string;
  headers: Record<string, string>;
  queryStringParameters: Record<string, string>;
  body: string | null;
}

/** Bentuk kembalian gaya Lambda: { statusCode, headers, body }. */
export interface LegacyOutcome {
  statusCode?: number;
  headers?: Record<string, string>;
  body?: unknown;
}

export type LegacyHandler = (event: LegacyEvent) => Promise<LegacyOutcome> | LegacyOutcome;

/**
 * Handler bentuk baru. `context` sengaja `unknown` dan tidak dipakai: satu-
 * satunya hal yang kita butuhkan darinya (IP klien) sudah tersedia di header
 * `x-forwarded-for`, yang juga dipakai saat dijalankan sebagai event lama —
 * jadi kedua jalur membaca sumber yang sama.
 */
export type ModernHandler = (
  request: Request,
  context?: unknown,
) => Promise<Response | LegacyOutcome>;

/** Apakah nilai ini Request (bukan event lama)? */
export function isRequest(value: unknown): value is Request {
  return typeof Request !== 'undefined' && value instanceof Request;
}

/**
 * Bangun event gaya lama dari Request.
 *
 * `body` diterima sebagai argumen, bukan dibaca di sini, supaya pemanggil
 * mengendalikan kapan stream dibaca (dan supaya fungsi ini tetap sinkron serta
 * mudah diuji).
 */
export function eventFromRequest(request: Request, body: string | null): LegacyEvent {
  const url = new URL(request.url);

  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  const queryStringParameters: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    queryStringParameters[key] = value;
  });

  return {
    httpMethod: request.method,
    rawUrl: request.url,
    headers,
    queryStringParameters,
    body: body && body.length ? body : null,
  };
}

/** Status yang secara spesifikasi tidak boleh membawa body. */
const NULL_BODY_STATUSES = new Set([204, 205, 304]);

/**
 * Ubah kembalian gaya lama menjadi Response.
 *
 * Toleran terhadap handler yang lupa mengisi `statusCode` (dianggap 200) dan
 * terhadap `body` yang bukan string (di-string-kan) — karena `String(body)` di
 * jalur lama pun berperilaku begitu, dan kita tidak ingin migrasi ini diam-diam
 * mengubah bentuk respons.
 */
export function responseFromOutcome(outcome: LegacyOutcome | null | undefined): Response {
  const status = typeof outcome?.statusCode === 'number' ? outcome.statusCode : 200;

  const headers = new Headers();
  const raw = (outcome?.headers ?? {}) as Record<string, unknown>;
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined || value === null) continue;
    headers.set(key, String(value));
  }

  const body = outcome?.body;
  if (NULL_BODY_STATUSES.has(status) || body === undefined || body === null) {
    return new Response(null, { status, headers });
  }

  return new Response(typeof body === 'string' ? body : String(body), { status, headers });
}

/**
 * Bungkus handler gaya lama supaya bisa dipakai sebagai `export default` di
 * Netlify Functions modern.
 *
 * Dual-mode: diberi Request → kembalikan Response; diberi apa pun selain itu →
 * teruskan ke handler lama dan kembalikan bentuk lama. Lihat catatan panjang di
 * atas file tentang mengapa kedua perilaku itu diperlukan.
 *
 * Error sengaja TIDAK ditangkap di sini. Wrapper lama sudah menangkap dan
 * memetakan error ke status yang benar (dan menyembunyikan detail internal
 * sesuai aturan "never leak"), sedangkan handler mandiri juga menangkap
 * sendiri. Menambah catch kedua akan menutupi bug yang seharusnya terlihat di
 * log, dan mengubah status yang sudah diputuskan dengan sengaja.
 */
export function adapt(legacy: LegacyHandler): ModernHandler {
  return async function adapted(
    input: Request | LegacyEvent,
    _context?: unknown,
  ): Promise<Response | LegacyOutcome> {
    if (!isRequest(input)) {
      return legacy(input as LegacyEvent);
    }

    let raw = '';
    try {
      raw = await input.text();
    } catch {
      // Body yang tidak bisa dibaca diperlakukan sebagai body kosong, sama
      // seperti `event.body` yang null di jalur lama — handler sudah menangani
      // JSON.parse yang gagal.
      raw = '';
    }

    const outcome = await legacy(eventFromRequest(input, raw));
    return responseFromOutcome(outcome);
  };
}
