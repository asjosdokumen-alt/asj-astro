import { env } from '../env.ts';
import { breaker } from '../kernel/resilience';
import { AppError, Errors } from '../kernel/errors';
import { clampBudget, MIN_SLICE_MS } from '../kernel/deadline';
import { metrics } from '../kernel/metrics';
import { log } from '../kernel/log';
// ai/providers.js — lapisan PROVIDER AI (Gemini) + helper parsing output AI.

// ---------------------------------------------------------------------------
// Budgets — OKUPANSI, bukan plafon platform
// ---------------------------------------------------------------------------
// Timeout per-model (ms): model yang menggantung tidak boleh menghabiskan
// jatah waktu permintaan (limit sinkron Netlify sebenarnya 60 dtk, tapi
// permintaan kita dibatasi 12 dtk oleh kernel/deadline.ts).
//
// Setiap angka di bawah adalah PLAFON yang dipotong lagi oleh clampBudget() ke
// sisa deadline permintaan saat panggilan itu benar-benar dibuat. Sebelumnya
// nilai-nilai ini dipakai apa adanya lewat `AbortSignal.timeout()`, sehingga
// satu panggilan AI bisa hidup lebih lama daripada permintaan yang
// menunggunya: slot fungsi tetap dipegang, klien sudah pergi.
const CHAT_MODEL_TIMEOUT_MS = 4000;

// Parse dokumen butuh jatah JAUH lebih besar daripada chat: satu PDF/Excel
// sampai 8 MB harus diunggah lalu dibaca model. Nilai lama (4 dtk, dipakai
// BERSAMA dengan chat) berarti setiap parse dokumen sungguhan hampir pasti
// timeout sebelum model selesai membaca — fitur ini praktis tidak pernah
// berhasil untuk berkas besar, dan gagalnya tampak seperti "AI tidak bisa
// mengekstrak data dari file ini".
const PARSE_MODEL_TIMEOUT_MS = 11000;

// Total okupansi AI untuk satu permintaan (ms). Batas ini menjaga rantai
// model + fallback tetap muat di dalam deadline 12 dtk, bukan di dalam plafon
// platform.
const TOTAL_AI_BUDGET_MS = 9000;

// Timeout provider fallback Grok (ms).
//
// Angka 5 dtk bukan pilihan baru: komentar di kepala berkas ini sudah menulis
// "Gemini race (4s) + Grok fallback (5s) = 9s worst case", jadi konstanta 10 dtk
// yang dulu ada di sini bertentangan dengan anggaran yang didokumentasikan
// sendiri dua baris di atasnya.
const GROK_TIMEOUT_MS = 5000;

// Jarak aman antara akhir rantai Gemini dan awal fallback Grok (ms).
//
// Terukur 2026-10-01, dan inilah yang membuat margin ini ada: dengan anggaran
// rantai PERSIS `TOTAL - grok` (4000 ms), rantai yang menghabiskan seluruh
// waktunya berakhir pada **4015 ms** — bukan 4000 — karena abort terakhir dan
// pemeriksaan `shouldTryGrok()` tidak berjalan pada milidetik yang sama.
// Hasilnya `4015 + 5000 > 9000`, dan Grok ditolak lagi. Batas kesetaraan tanpa
// jarak aman mengulang cacat aslinya (yang juga berupa `4000` dibanding `4000`),
// hanya berpindah tempat. 250 ms ≈ 16x jitter yang terukur.
const FALLBACK_HANDOFF_MS = 250;

// Anggaran RANTAI Gemini untuk chat (ms) — TURUNAN, bukan angka bebas.
//
// Kenapa turunan: cacat aslinya bukan salah satu angka, melainkan aritmetika
// yang TERSEBAR. Jendela fallback dihitung `TOTAL - grok` di satu tempat,
// sementara rantai utama tidak dibatasi sama sekali di tempat lain — ia hanya
// dipotong ke sisa DEADLINE PERMINTAAN (12 dtk). Jadi rantai bisa berjalan
// 1,5 (hedge) + 1,5 (hedge) + 4 (timeout model terakhir) = ~7 dtk, dan
// `TOTAL_AI_BUDGET_MS` baru dibaca SESUDAHNYA, di `shouldTryGrok()` — artinya
// konstanta bernama "total anggaran AI" itu tidak membatasi apa pun.
//
// Terukur 2026-10-01: rantai berkasus-terburuk 7.030 ms, lalu Grok DITOLAK
// karena 7030 + 5000 > 9000. Satu-satunya provider cadangan praktis mati tepat
// di kasus yang paling membutuhkannya.
//
// Sebagai turunan, kedua angka tidak bisa lagi bergeser sendiri-sendiri, dan
// `hedgedInvoke` menerima anggaran ini sebagai PLAFON NYATA (lihat
// `chainBudgetMs`), bukan sekadar perbandingan setelah pekerjaan selesai.
const CHAT_CHAIN_BUDGET_MS = TOTAL_AI_BUDGET_MS - GROK_TIMEOUT_MS - FALLBACK_HANDOFF_MS;

// Anggaran rantai untuk panggilan BEST-EFFORT (terjemahan `_jp` latar).
//
// Terjemahan adalah pekerjaan tambahan yang bisa disusulkan giliran berikutnya,
// jadi ia tidak boleh menandingi balasan yang sedang ditunggu pengguna: dengan
// anggaran rantai yang sama besarnya, `await translation` membuat waktu balas
// ditentukan oleh yang LEBIH LAMBAT dari dua panggilan — dan terjemahan bisa
// memakai seluruh jendela Grok (9 dtk) hanya untuk menerjemahkan beberapa field.
const TRANSLATE_CHAIN_BUDGET_MS = 3000;

// Kunci breaker. Dipisah karena panggilan best-effort berjalan PARALEL dengan
// balasan pengguna dan `breaker.check()` dipanggil secara sinkron sebelum await
// pertama — lihat catatan panjang di `geminiGenerate`.
const BREAKER_GEMINI = 'gemini';
const BREAKER_TRANSLATE = 'gemini-translate';
// Parse dokumen dipisah karena KEGAGALANNYA BERBEDA ARTI, bukan karena
// providernya berbeda. Berkas yang terlalu besar untuk dibaca model, hasil scan
// yang tidak terbaca, atau blokir filter keamanan semuanya menghasilkan
// `breaker.failure()` yang sama — padahal ketiganya tidak mengatakan apa pun
// tentang kesehatan Gemini. Dan UI-nya MENGAJAK mencoba lagi
// (`classify.ts:140`: "Coba file lain"), jadi tiga percobaan adalah perilaku
// yang diharapkan. Dengan kunci bersama, ambang 3 berarti: satu admin dengan
// tiga berkas buruk mematikan CV AI, HRD AI, simulator wawancara, dan parse
// untuk SEMUA pengguna selama 30 dtk. Terukur 2026-10-01: tiga parse gagal
// memang membuka breaker `gemini` (`expected 'open' to be 'closed'`).
const BREAKER_PARSE = 'gemini-parse';

// ---------------------------------------------------------------------------
// Hedging — bukan "tembak semua model sekaligus"
// ---------------------------------------------------------------------------
// Kode sebelumnya menembakkan KETIGA model secara paralel dan mengambil yang
// pertama berhasil (Promise.any). Itu memang memotong worst case ke 4 dtk, tapi
// dibayar tiga kali lipat:
//
//   1. KUOTA — 3 permintaan provider untuk SETIAP giliran chat, termasuk
//      giliran yang model pertamanya sudah menjawab dalam 0,6 dtk.
//   2. SOCKET — 3 koneksi keluar ditahan per permintaan yang di-admit. Cap
//      tier 'ai' di kernel/admission.ts adalah 4, jadi satu instance bisa
//      memegang 12 koneksi keluar hanya dari 4 percakapan bersamaan — persis
//      kebalikan dari "bound the load" yang jadi alasan cap itu ada.
//   3. BREAKER — TIGA kegagalan untuk SATU giliran yang gagal. Ambang breaker
//      `gemini` adalah 3, jadi satu pengguna yang apes sudah cukup untuk
//      membuka breaker dan mematikan SELURUH fitur AI selama 30 dtk. Kegagalan
//      tunggal berubah menjadi outage yang dirasakan semua orang.
//
// Hedging menyimpan keuntungan latensinya dan membuang amplifikasinya: model
// utama diberi jendela sendiri untuk menjawab (model lite yang di-pin menjawab
// ~0,6-1,3 dtk, jadi hedge normalnya TIDAK PERNAH ditembakkan). Hanya kalau ia
// belum menjawab, model berikutnya ditembakkan sebagai hedge. Yang pertama
// berhasil menang, dan semua percobaan lain yang masih jalan DIBATALKAN —
// jadi yang kalah berhenti memegang socket dan berhenti membakar kuota.
const CHAT_HEDGE_AFTER_MS = 1500;

// Parse jauh lebih lambat, jadi hedge-nya juga harus jauh lebih longgar: kalau
// tidak, setiap parse dokumen menembak ketiga model (3x kuota untuk satu
// berkas) padahal model pertama hanya perlu waktu lebih lama untuk membacanya.
const PARSE_HEDGE_FRACTION = 0.5;

// Model saat ini (Agt 2026): gemini-1.5-flash & 2.0-flash sudah dihapus Google (404),
// gemini-2.5-flash & 2.5-pro sudah tidak tersedia untuk key baru (404),
// gemini-flash-latest sering 503 "high demand" (lambat), gemini-3.5-flash
// respons 7-29 dtk (sering kena timeout Netlify 502). Pakai model LITE yang
// stabil & cepat (~0,6-1,3 dtk, dibuktikan 2026-08-16 vs Netlify lama
// asjportal.netlify.app yang respons ~1 dtk): gemini-3.5-flash-lite (pin,
// lolos SEMUA tes, paling stabil) dulu, lalu alias flash-lite-latest (ikut
// model terbaru; sesekali 503), terakhir flash penuh sebagai jaring pengaman.
const MODELS = ['gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.5-flash'];

/** Ceilings, exported so tests and callers read one source instead of copies. */
const AI_BUDGETS = {
  chatModelMs: CHAT_MODEL_TIMEOUT_MS,
  parseModelMs: PARSE_MODEL_TIMEOUT_MS,
  /** Plafon NYATA rantai Gemini untuk chat — dipotong dari `totalMs` oleh `grokMs`. */
  chatChainMs: CHAT_CHAIN_BUDGET_MS,
  translateChainMs: TRANSLATE_CHAIN_BUDGET_MS,
  chatHedgeAfterMs: CHAT_HEDGE_AFTER_MS,
  totalMs: TOTAL_AI_BUDGET_MS,
  grokMs: GROK_TIMEOUT_MS,
  /** Jitter allowance so the chain never eats the fallback's window. */
  fallbackHandoffMs: FALLBACK_HANDOFF_MS,
} as const;

// Gemini API menolak request yang berakhiran giliran model ("Requests ending
// with a model turn are not supported") — buang giliran model di akhir history
// sebelum dikirim (bisa terjadi kalau history frontend terakumulasi asinkron).
function trimTrailingModelTurn(contents: Array<{ role: string }>) {
  const out = contents.slice();
  while (out.length > 1 && out[out.length - 1].role === 'model') out.pop();
  return out;
}

// ---------------------------------------------------------------------------
// hedgedInvoke — jalankan model berurutan dengan hedge, satu hasil untuk satu
// panggilan logis.
// ---------------------------------------------------------------------------

type ModelAttempt = (model: string, signal: AbortSignal, budgetMs: number) => Promise<string>;

interface HedgeOpts {
  /** Plafon satu panggilan model, sebelum dipotong ke sisa deadline. */
  modelBudgetMs: number;
  /**
   * Plafon SELURUH rantai (ms) — plafon nyata, bukan sekadar pembanding.
   *
   * Inilah yang membuat `TOTAL_AI_BUDGET_MS` berarti: tanpa ini, satu-satunya
   * batas adalah sisa deadline permintaan, sehingga hedge berlipat
   * (1,5 + 1,5 + 4 = ~7 dtk) dan fallback provider kehabisan jendela sebelum
   * sempat dicoba. Setiap percobaan dipotong ke `min(plafon model, sisa rantai)`,
   * jadi rantai berakhir tepat di plafonnya — bukan di jumlah kebetulan dari
   * timeout-timeout yang berurutan.
   */
  chainBudgetMs: number;
  /**
   * Jendela sendirian untuk percobaan aktif sebelum yang berikutnya ditembak.
   * `undefined` = JANGAN pernah hedge: percobaan berikutnya hanya dijalankan
   * kalau yang aktif benar-benar GAGAL. Dipakai panggilan best-effort, yang
   * tidak mengejar latensi dan tidak boleh menggandakan kuota provider.
   */
  hedgeAfterMs?: number;
}

/**
 * Coba `models` berurutan, hedge hanya kalau perlu, dan batalkan sisanya.
 *
 * Menolak dengan error terakhir (atau AggregateError kalau lebih dari satu)
 * ketika SEMUA model yang tersedia sudah gagal. Kosong bukan jawaban: model
 * yang mengembalikan '' dihitung gagal supaya model berikutnya dapat giliran —
 * perilaku lama me-resolve dengan '' lalu melempar "Gemini returned empty
 * response" tanpa pernah mencoba fallback.
 */
async function hedgedInvoke(
  models: string[],
  opts: HedgeOpts,
  attempt: ModelAttempt,
): Promise<string> {
  const controller = new AbortController();
  const errors: unknown[] = [];
  let launched = 0;
  let failed = 0;
  let settled = false;
  let hedgeTimer: ReturnType<typeof setTimeout> | undefined;

  // Plafon rantai dihitung SEKALI, dari waktu mulai, lalu dipotong ke sisa
  // deadline permintaan (kalau ada). Semua percobaan berbagi plafon yang sama —
  // itu yang membuat durasi total bisa diprediksi, alih-alih menjadi jumlah dari
  // timeout-timeout yang berurutan.
  const chainDeadline = Date.now() + clampBudget(opts.chainBudgetMs);

  return new Promise<string>((resolve, reject) => {
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      if (hedgeTimer) clearTimeout(hedgeTimer);
      hedgeTimer = undefined;
      // Bebaskan setiap percobaan yang masih jalan. Tanpa ini yang kalah tetap
      // menahan socket dan tetap membakar kuota sampai timeout-nya sendiri
      // habis — persis yang dilakukan race "tembak semua model" sebelumnya.
      controller.abort();
      fn();
    };

    const scheduleHedge = () => {
      // Tanpa `hedgeAfterMs` tidak ada hedge sama sekali: percobaan berikutnya
      // menunggu kegagalan, bukan waktu.
      if (opts.hedgeAfterMs === undefined) return;
      if (hedgeTimer || settled || launched >= models.length) return;
      hedgeTimer = setTimeout(() => {
        hedgeTimer = undefined;
        launch(true);
      }, opts.hedgeAfterMs);
    };

    const onFailure = (e: unknown) => {
      if (settled) return;
      errors.push(e);
      failed++;
      if (failed >= models.length) {
        metrics.increment('ai.call', { outcome: 'failure', attempts: String(launched) });
        // Sebab setiap model dicatat, karena inilah satu-satunya tempat yang
        // tahu MENGAPA. "Gemini HTTP 503", "diblokir filter keamanan", dan
        // "deadline habis" adalah tiga masalah berbeda dengan tiga tindakan
        // berbeda — dan sebelumnya ketiganya muncul sebagai satu pesan yang
        // tidak bisa ditindaklanjuti: "Gemini returned empty response".
        log.warn('ai.call.failed', {
          attempts: launched,
          reasons: errors.map((e) => String(e).slice(0, 160)),
        });
        settle(() =>
          reject(
            errors.length === 1
              ? errors[0]
              : new AggregateError(errors, 'semua model AI gagal'),
          ),
        );
        return;
      }
      // Model yang gagal CEPAT tidak boleh membuat pemanggil menunggu hedge
      // delay — langsung ke model berikutnya.
      if (hedgeTimer) {
        clearTimeout(hedgeTimer);
        hedgeTimer = undefined;
      }
      launch(false);
    };

    const launch = (fromHedge: boolean) => {
      if (settled || launched >= models.length) return;
      // Kehabisan waktu: panggilan yang dibuat sekarang tidak mungkin selesai
      // di dalam deadline, jadi ia hanya akan menahan slot. Gagal lokal saja —
      // aturan yang sama dengan kernel/http.ts.
      //
      // Dua batas sekaligus: plafon model, dan SISA RANTAI. Yang kedua inilah
      // yang membuat anggaran total mengikat; tanpa itu tiap percobaan hanya
      // dipotong ke deadline permintaan dan rantai berjalan sampai jumlah
      // kebetulan dari timeout-timeout berurutan.
      const chainLeft = chainDeadline - Date.now();
      const budgetMs = Math.min(clampBudget(opts.modelBudgetMs), chainLeft);
      if (budgetMs <= MIN_SLICE_MS) {
        onFailure(
          new AppError('DEADLINE_EXCEEDED', {
            message: 'Batas waktu permintaan habis sebelum model AI dipanggil',
            retryAfter: 2,
          }),
        );
        return;
      }
      const model = models[launched++];
      const attemptStarted = Date.now();
      // Seberapa sering hedge BENAR-BENAR ditembakkan adalah satu-satunya angka
      // yang bisa mengkalibrasi lebar hedge: kalau ~0, jendelanya bisa dipendekkan;
      // kalau tinggi, asumsi "model lite menjawab 0,6-1,3 dtk" sudah bergeser dan
      // amplifikasinya naik. Tanpa ini kalibrasinya hanya asumsi.
      if (fromHedge) metrics.increment('ai.hedge.fired');
      metrics.increment('ai.model.attempt', { model });
      attempt(model, controller.signal, budgetMs).then((text) => {
        const ms = Date.now() - attemptStarted;
        if (settled) return;
        if (text) {
          // Latensi PER MODEL — angka yang tidak pernah ada sebelumnya, dan
          // tanpa itu lebar hedge (1,5 dtk) hanya bisa diasumsikan. Ia yang
          // menentukan berapa kali kuota provider dibayar per giliran.
          metrics.observe('ai.model.latency', ms, { model, outcome: 'success' });
          metrics.increment('ai.call', { outcome: 'success', attempts: String(launched) });
          settle(() => resolve(text));
        } else {
          metrics.observe('ai.model.latency', ms, { model, outcome: 'empty' });
          onFailure(new Error(`model ${model} mengembalikan jawaban kosong`));
        }
      }, (e) => {
        // `cancelled` dibedakan dari `error`: pecundang hedge memang dibatalkan
        // dan itu SEHAT. Mencampurnya dengan kegagalan sungguhan akan membuat
        // tingkat kegagalan per model terlihat jauh lebih buruk daripada
        // kenyataannya — persis jenis angka menyesatkan yang mahal.
        metrics.observe('ai.model.latency', Date.now() - attemptStarted, {
          model,
          outcome: settled ? 'cancelled' : 'error',
        });
        onFailure(e);
      });
      scheduleHedge();
    };

    launch(false);
  });
}

async function fetchGemini(
  model: string,
  key: string,
  contents: Array<{ role: string }>,
  budgetMs: number,
  signal: AbortSignal,
) {
  // S11 fix: Use header instead of URL query string for API key.
  // Query strings appear in access logs and error reports.
  const res = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/' +
      model +
      ':generateContent',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': key,
      },
      body: JSON.stringify({ contents }),
      // Dua batas independen: anggaran panggilan (sudah dipotong ke sisa
      // deadline oleh pemanggil) dan sinyal pembatalan hedge yang menyala saat
      // model saudaranya menang lebih dulu.
      signal: AbortSignal.any([signal, AbortSignal.timeout(budgetMs)]),
    },
  );
  if (!res.ok) {
    throw new Error('Gemini HTTP ' + res.status + ' ' + (await res.text()).slice(0, 120));
  }
  const j = await res.json();
  const cand = j?.candidates?.[0];
  const parts = cand?.content?.parts;
  const text = Array.isArray(parts)
    ? parts.map((p: { text?: unknown }) => p.text || '').join('')
    : '';
  if (!text) {
    // Kenapa kosong? Dua sebab yang sangat berbeda, dan keduanya dulu muncul
    // sebagai "Gemini returned empty response" — pesan yang tidak memberi tahu
    // apa pun:
    //   - `promptFeedback.blockReason` / `finishReason: 'SAFETY'` → permintaan
    //     DIBLOKIR filter keamanan. Biodata kandidat (riwayat medis, tato,
    //     tindik) cukup untuk memicunya. Melonggarkan `safetySettings` adalah
    //     keputusan kebijakan, bukan sesuatu yang pantas dilakukan diam-diam di
    //     lapisan provider — jadi yang dilakukan di sini hanya MEMBEDAKANnya,
    //     supaya kegagalan berulang bisa dikenali alih-alih ditebak.
    //   - `finishReason: 'MAX_TOKENS'` → output terpotong sebelum ada teks.
    const blockReason = j?.promptFeedback?.blockReason;
    const finishReason = cand?.finishReason;
    if (blockReason || finishReason) {
      throw new Error(
        `Gemini tanpa teks (blockReason=${blockReason ?? '-'} finishReason=${finishReason ?? '-'})`,
      );
    }
  }
  return text;
}

// ---------------------------------------------------------------------------
// Grok (xAI) — fallback when all Gemini models fail
// API is OpenAI-compatible: https://api.x.ai/v1/chat/completions
// ---------------------------------------------------------------------------
async function fetchGrok(
  key: string,
  systemPrompt: string,
  history: Array<{ role?: string; content?: unknown }>,
  budgetMs: number,
) {
  breaker.check('grok');
  const messages = [{ role: 'system', content: systemPrompt }];
  for (const h of Array.isArray(history) ? history : []) {
    const role = h && h.role === 'assistant' ? 'assistant' : 'user';
    if (h && h.content) messages.push({ role, content: String(h.content) });
  }
  try {
    const res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key,
      },
      body: JSON.stringify({
        model: 'grok-3-mini',
        messages,
        max_tokens: 2048,
        temperature: 0.7,
      }),
      signal: AbortSignal.timeout(budgetMs),
    });
    if (!res.ok) {
      breaker.failure('grok');
      throw new Error('Grok HTTP ' + res.status + ' ' + (await res.text()).slice(0, 120));
    }
    breaker.success('grok');
    const j = await res.json();
    return j?.choices?.[0]?.message?.content || '';
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Grok HTTP')) throw e;
    breaker.failure('grok');
    throw e;
  }
}

async function grokGenerate(
  systemPrompt: string,
  history: Array<{ role?: string; content?: unknown }>,
  budgetMs: number = AI_BUDGETS.grokMs,
) {
  const key = env('XAI_API_KEY');
  if (!key) return null;
  try {
    const text = await fetchGrok(key, systemPrompt, history, budgetMs);
    if (text) return { reply: text };
  } catch { /* fallback failed */ }
  return null;
}

/**
 * Boleh tidaknya fallback Grok dimulai.
 *
 * PURE, dan sengaja begitu: batas inilah tempat cacatnya bersembunyi. Bentuk
 * lamanya `elapsed < TOTAL_AI_BUDGET_MS - grokMs` menyembunyikan batas di dalam
 * pengurangan, sehingga `4000 < 9000 - 5000` terbaca seolah masuk akal padahal
 * artinya "tepat setelah Gemini menghabiskan timeout per-modelnya, fallback
 * tidak dicoba" — persis kasus yang paling membutuhkannya. Sebagai fungsi murni,
 * batasnya bisa diuji langsung (termasuk titik 4000 yang dulu salah), bukan
 * hanya lewat satu panggilan yang butuh 7 detik untuk sampai ke sana.
 *
 * `grokBudgetMs` adalah anggaran yang SUDAH dipotong deadline, jadi fallback
 * yang sebenarnya masih muat tidak ditolak.
 *
 * SEJAK 2026-10-01 jendela ini STRUKTURAL, bukan harapan: rantai Gemini
 * dibatasi `CHAT_CHAIN_BUDGET_MS = TOTAL_AI_BUDGET_MS - GROK_TIMEOUT_MS`, jadi
 * selama anggaran rantai belum terpakai, `elapsed + grokBudget <= TOTAL` selalu
 * benar dan Grok benar-benar dicoba — termasuk saat SEMUA model Gemini
 * menghabiskan waktunya, kasus yang dulu membuatnya selalu ditolak. Penjaga ini
 * tetap ada sebagai jaring untuk kasus anggaran-yang-sudah-dipotong-deadline
 * (`grokBudgetMs < grokMs`), di mana jumlahnya bisa saja tidak muat.
 */
function shouldTryGrok(elapsedMs: number, grokBudgetMs: number): boolean {
  return grokBudgetMs > MIN_SLICE_MS && elapsedMs + grokBudgetMs <= TOTAL_AI_BUDGET_MS;
}

/**
 * Opsi satu panggilan logis ke Gemini.
 *
 * `bestEffort` menandai pekerjaan LATAR yang tidak sedang ditunggu siapa pun —
 * saat ini hanya auto-terjemahan `_jp` di `chat.ts`. Ia mengubah tiga hal
 * sekaligus, dan ketiganya harus bersama-sama:
 *
 *   1. KUNCI BREAKER SENDIRI. `autoTranslateMissingJp` dijalankan PARALEL dan
 *      dipanggil LEBIH DULU daripada balasan chat, sedangkan `breaker.check()`
 *      sinkron. Saat breaker `gemini` sudah `open` melewati cooldown, `check()`
 *      memindahkannya ke `half-open` dan mengizinkan SATU probe — panggilan
 *      kedua untuk dependency yang sama ditolak `SERVICE_UNAVAILABLE`
 *      ("Circuit breaker probing"). Jadi terjemahanlah yang mengambil probe,
 *      dan balasan yang ditunggu pengguna gagal padahal providernya sehat.
 *      Terukur 2026-10-01: dengan kunci bersama, `gemini` berpindah dari
 *      `open` ke `closed` karena panggilan terjemahan — probe itu memang
 *      diambilnya. Satu giliran yang gagal juga menyumbang DUA kegagalan
 *      (ambang breaker `gemini` adalah 3), yaitu amplifikasi T1 yang dimasukkan
 *      kembali oleh perbaikan T7.
 *   2. TANPA FALLBACK GROK. Provider cadangan adalah sumber daya terakhir untuk
 *      balasan yang sedang ditunggu; terjemahan bisa disusulkan giliran
 *      berikutnya, balasan tidak bisa.
 *   3. TANPA HEDGE, anggaran rantai lebih kecil. Terjemahan tidak mengejar
 *      latensi, jadi menembak model kedua hanya menggandakan kuota — sementara
 *      `await translation` di `handleProcessAIChat` membuat waktu balas
 *      ditentukan oleh yang LEBIH LAMBAT dari dua panggilan.
 */
interface AiCallOpts {
  /** Pekerjaan latar non-kritis: terisolasi dari breaker & fallback balasan. */
  bestEffort?: boolean;
}

/**
 * Catat satu panggilan AI sebagai dependency, dengan bentuk metrik yang SAMA
 * dengan `kernel/http.ts`: `dependency.call{dep,outcome}` +
 * `dependency.call.latency{dep}`.
 *
 * Kenapa ini ada: jalur AI memakai `fetch` langsung dan karena itu tidak pernah
 * lewat `recordDependencyCall` — sementara `metrics-receiver.ts` mengimplementasi
 * aturan peringatan di atas nama metrik itu. Akibatnya Gemini, provider yang
 * paling sering gagal di sistem ini, tidak punya peringatan sama sekali.
 *
 * `dep` sengaja 'gemini' untuk chat, parse, DAN terjemahan: yang diukur adalah
 * kesehatan PROVIDER-nya. Pemisahan blast radius (kunci breaker) dan pemisahan
 * permukaan (label `action`) sudah punya dimensinya masing-masing.
 *
 * Yang TIDAK dicatat: penolakan `breaker.check()`. Di situ tidak ada panggilan
 * yang pernah keluar dari kotak, dan mencatatnya sebagai kegagalan provider
 * akan membuat tingkat kegagalan naik justru saat breaker sedang melindungi.
 */
function recordAiCall(dep: string, startedAt: number, outcome: 'success' | 'error') {
  metrics.increment('dependency.call', { dep, outcome });
  metrics.observe('dependency.call.latency', Date.now() - startedAt, { dep });
}

async function geminiGenerate(
  systemPrompt: string,
  history: Array<{ role?: string; content?: unknown }>,
  opts: AiCallOpts = {},
) {
  const key = env('GEMINI_API_KEY');
  if (!key) {
    // Used to RETURN a friendly reply, which made "the AI is not configured"
    // indistinguishable from "the AI answered" — no code, no banner, no signal.
    // Now it is a typed failure; the chat handlers render the same kind of copy
    // but with `code: 'AI_UNAVAILABLE'`.
    throw Errors.aiUnavailable('Asisten AI belum dikonfigurasi di server. Hubungi admin ya!');
  }
  const breakerKey = opts.bestEffort ? BREAKER_TRANSLATE : BREAKER_GEMINI;
  const contents = [{ role: 'user', parts: [{ text: systemPrompt }] }];
  for (const h of Array.isArray(history) ? history : []) {
    const role = h && h.role === 'assistant' ? 'model' : 'user';
    if (h && h.content) contents.push({ role, parts: [{ text: String(h.content) }] });
  }
  const body = trimTrailingModelTurn(contents);

  const started = Date.now();
  let geminiError: unknown = null;
  try {
    // SATU hasil breaker untuk SATU panggilan logis, bukan satu per model yang
    // dicoba. Sebelumnya tiap model memanggil breaker sendiri, jadi satu
    // giliran chat yang gagal menyumbang tiga kegagalan sekaligus dan langsung
    // melampaui ambang 3 — satu pengguna bisa mematikan AI untuk semua orang.
    breaker.check(breakerKey);
    const text = await hedgedInvoke(
      MODELS,
      {
        modelBudgetMs: CHAT_MODEL_TIMEOUT_MS,
        chainBudgetMs: opts.bestEffort ? TRANSLATE_CHAIN_BUDGET_MS : CHAT_CHAIN_BUDGET_MS,
        // Best-effort: `undefined` = jangan pernah hedge.
        hedgeAfterMs: opts.bestEffort ? undefined : CHAT_HEDGE_AFTER_MS,
      },
      (model, signal, budgetMs) => fetchGemini(model, key, body, budgetMs, signal),
    );
    breaker.success(breakerKey);
    recordAiCall('gemini', started, 'success');
    return { reply: text };
  } catch (e) {
    geminiError = e;
    // Penolakan `check()` berarti breaker SUDAH terbuka: mencatat kegagalan
    // lagi hanya memperpanjang outage tanpa menambah informasi.
    if (!(e instanceof AppError && e.code === 'SERVICE_UNAVAILABLE')) {
      breaker.failure(breakerKey);
      recordAiCall('gemini', started, 'error');
    }
  }

  // Grok (xAI) — provider yang benar-benar berbeda, jadi tetap layak dicoba
  // walaupun breaker Gemini sedang terbuka. Batasnya ada di `shouldTryGrok`,
  // yang diuji langsung sebagai fungsi murni.
  //
  // Jendela Grok sekarang STRUKTURAL: rantai Gemini dibatasi
  // `CHAT_CHAIN_BUDGET_MS` = `TOTAL_AI_BUDGET_MS - GROK_TIMEOUT_MS`, jadi
  // selama anggaran itu belum terpakai, `elapsed + grokBudget <= TOTAL` selalu
  // benar dan fallback benar-benar dicoba. Sebelumnya rantai tidak dibatasi dan
  // berkasus-terburuk berjalan 7 dtk, sehingga penjaga ini menolak Grok tepat
  // di kasus yang paling membutuhkannya. `shouldTryGrok` tetap dipertahankan
  // sebagai jaring untuk kasus anggaran-yang-sudah-dipotong-deadline.
  //
  // Panggilan best-effort berhenti di sini: provider cadangan disisakan untuk
  // balasan yang sedang ditunggu pengguna.
  if (opts.bestEffort) throw Errors.aiUnavailable(undefined, 5, geminiError);

  const elapsed = Date.now() - started;
  const grokBudget = clampBudget(AI_BUDGETS.grokMs);
  if (shouldTryGrok(elapsed, grokBudget)) {
    const grokResult = await grokGenerate(systemPrompt, history, grokBudget);
    if (grokResult) {
      recordAiCall('grok', started, 'success');
      return grokResult;
    }
  }
  throw Errors.aiUnavailable(undefined, 5, geminiError);
}

async function geminiParseFile(systemPrompt: string, file: { mimeType?: string; data?: unknown }) {
  const key = env('GEMINI_API_KEY');
  if (!key) {
    throw Errors.aiUnavailable('Fitur AI belum dikonfigurasi di server.');
  }
  const contents = [
    {
      role: 'user',
      parts: [{ inlineData: { mimeType: file.mimeType, data: file.data } }, { text: systemPrompt }],
    },
  ];
  const parseStarted = Date.now();
  try {
    breaker.check(BREAKER_PARSE);
    const text = await hedgedInvoke(
      MODELS,
      {
        modelBudgetMs: PARSE_MODEL_TIMEOUT_MS,
        // Parse tidak punya fallback provider, jadi ia boleh memakai SELURUH
        // anggaran AI — tidak ada jendela yang perlu disisakan. Tapi tetap
        // DIBATASI anggaran itu: sebelumnya satu berkas bisa memegang 11 dtk
        // dari deadline 12 dtk, karena PARSE_MODEL_TIMEOUT_MS (11000) melebihi
        // TOTAL_AI_BUDGET_MS (9000) yang seharusnya membatasinya.
        chainBudgetMs: TOTAL_AI_BUDGET_MS,
        hedgeAfterMs: Math.round(PARSE_MODEL_TIMEOUT_MS * PARSE_HEDGE_FRACTION),
      },
      (model, signal, budgetMs) => fetchGemini(model, key, contents, budgetMs, signal),
    );
    breaker.success(BREAKER_PARSE);
    recordAiCall('gemini', parseStarted, 'success');
    return text;
  } catch (e) {
    if (!(e instanceof AppError && e.code === 'SERVICE_UNAVAILABLE')) {
      breaker.failure(BREAKER_PARSE);
      recordAiCall('gemini', parseStarted, 'error');
    }
    throw Errors.aiUnavailable(undefined, 5, e);
  }
}

function parseJsonLoose(text: unknown) {
  let t = String(text || '').trim();
  t = t
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  try {
    return JSON.parse(t);
  } catch (e) {
    const start = t.indexOf('{');
    const end = t.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(t.slice(start, end + 1));
      } catch (e2) {
        /* fallthrough */
      }
    }
    throw e;
  }
}

export {
  AI_BUDGETS,
  MODELS,
  shouldTryGrok,
  geminiGenerate,
  geminiParseFile,
  grokGenerate,
  parseJsonLoose,
};
