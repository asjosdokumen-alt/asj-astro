// ==========================================
// TESTS: ai/providers — perilaku HEDGING, batas deadline, dan disiplin breaker.
//
// Kenapa suite ini ada (tiga cacat nyata yang sebelumnya tidak dijaga tes):
//
//   1. `Promise.any` atas KETIGA model menembak 3 permintaan provider untuk
//      setiap giliran chat, dan menahan 3 socket per permintaan yang di-admit.
//      Cap tier 'ai' (kernel/admission.ts) adalah 4, jadi satu instance bisa
//      memegang 12 koneksi keluar dari 4 percakapan.
//   2. Karena tiap model memanggil breaker sendiri, SATU giliran yang gagal
//      menyumbang TIGA kegagalan. Ambang breaker `gemini` adalah 3, jadi satu
//      pengguna yang apes sudah cukup membuka breaker dan mematikan seluruh
//      fitur AI selama 30 dtk.
//   3. `AbortSignal.timeout()` dipakai apa adanya, tanpa clampBudget(), jadi
//      panggilan AI bisa hidup lebih lama daripada deadline permintaan yang
//      menunggunya.
//
// Semua tes memakai `fetch` palsu — tidak ada jaringan.
// ==========================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { breaker, DEPENDENCY_CONFIGS } from '../kernel/resilience';
import { metrics } from '../kernel/metrics';
import { runWithContext } from '../kernel/log';
import { AI_BUDGETS, shouldTryGrok, geminiGenerate, geminiParseFile } from './providers';

const GEMINI = 'generativelanguage.googleapis.com';
const GROK = 'api.x.ai';

interface Call {
  model: string;
  signal: AbortSignal;
}

/** Body sukses Gemini yang bentuknya sama dengan yang dibaca fetchGemini. */
function ok(text: string): Response {
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

/** Body sukses Gemini tanpa teks sama sekali (kandidat kosong). */
function emptyBody(): Response {
  return new Response(JSON.stringify({ candidates: [] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

const calls: Call[] = [];
let handler: (model: string, signal: AbortSignal) => Promise<Response>;

/** Panggilan ke provider fallback. Dihitung terpisah dari `calls` (Gemini). */
let grokCalls = 0;
let grokHandler: () => Promise<Response>;

function installFetch() {
  vi.stubGlobal('fetch', (url: string, init: RequestInit = {}) => {
    const href = String(url);
    if (href.includes(GROK)) {
      grokCalls++;
      return grokHandler();
    }
    // Hermetik: host apa pun selain dua provider di atas gagal keras, supaya tes
    // tidak pernah menyentuh jaringan sungguhan.
    if (!href.includes(GEMINI)) {
      return Promise.reject(new Error(`unexpected outbound fetch in test: ${href}`));
    }
    const model = href.split('/models/')[1]?.split(':')[0] ?? '';
    const signal = init.signal as AbortSignal;
    calls.push({ model, signal });
    return handler(model, signal);
  });
}

beforeEach(() => {
  calls.length = 0;
  grokCalls = 0;
  handler = () => Promise.resolve(ok('{"reply":"ok"}'));
  // Default: fallback TIDAK diharapkan. Tes yang memang menguji Grok memasang
  // grokHandler sendiri — kalau tidak, permintaan tak terduga gagal cepat dan
  // grokCalls tetap memberi tahu kita bahwa jalur itu tersentuh.
  grokHandler = () => Promise.reject(new Error('grok not expected in this test'));
  // Kunci provider harus eksplisit: env() jatuh ke .env.local kalau process.env
  // kosong, dan itu membuat tes bergantung pada berkas di mesin developer.
  vi.stubEnv('GEMINI_API_KEY', 'test-key');
  vi.stubEnv('XAI_API_KEY', '');
  breaker.reset('gemini');
  breaker.reset('grok');
  breaker.reset('gemini-parse');
  breaker.reset('gemini-translate');
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  breaker.reset('gemini');
  breaker.reset('grok');
  breaker.reset('gemini-parse');
  breaker.reset('gemini-translate');
});

describe('hedging — model berikutnya hanya kalau perlu', () => {
  it('model pertama yang menjawab cepat → TEPAT SATU panggilan provider', async () => {
    handler = () => Promise.resolve(ok('{"reply":"halo"}'));

    const out = await geminiGenerate('sys', []);

    expect(out.reply).toBe('{"reply":"halo"}');
    // Regresi inti: implementasi lama (Promise.any) sudah menembak tiga model
    // pada titik ini juga — satu giliran sukses membayar 3x kuota.
    expect(calls).toHaveLength(1);
    expect(calls[0].model).toBe('gemini-3.5-flash-lite');
  });

  it('model utama menggantung → hedge menembak model kedua, lalu yang kalah dibatalkan', async () => {
    handler = (model, signal) => {
      if (model === 'gemini-3.5-flash-lite') {
        // Tidak pernah menjawab sendiri — hanya abort yang bisa mengakhirinya.
        return new Promise<Response>((_resolve, reject) => {
          signal.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        });
      }
      return new Promise<Response>((resolve) =>
        setTimeout(() => resolve(ok('{"reply":"hedged"}')), 20),
      );
    };

    const out = await geminiGenerate('sys', []);

    expect(out.reply).toBe('{"reply":"hedged"}');
    expect(calls.map((c) => c.model)).toEqual([
      'gemini-3.5-flash-lite',
      'gemini-flash-lite-latest',
    ]);
    // Yang kalah berhenti memegang socket — inilah yang membedakan hedge dari
    // race "tembak semua model", yang membiarkan pecundang hidup sampai
    // timeout-nya sendiri habis.
    expect(calls[0].signal.aborted).toBe(true);
  }, 10_000);

  it('jawaban KOSONG dihitung gagal → model berikutnya dapat giliran', async () => {
    handler = (model) =>
      Promise.resolve(model === 'gemini-3.5-flash-lite' ? emptyBody() : ok('{"reply":"cadangan"}'));

    const out = await geminiGenerate('sys', []);

    expect(out.reply).toBe('{"reply":"cadangan"}');
    // Implementasi lama me-resolve dengan '' lalu melempar "Gemini returned
    // empty response" — fallback tidak pernah dicoba.
    expect(calls).toHaveLength(2);
  });
});

describe('breaker — satu hasil untuk satu panggilan logis', () => {
  it('satu giliran chat yang gagal TIDAK membuka breaker', async () => {
    handler = () => Promise.resolve(new Response('high demand', { status: 503 }));

    await expect(geminiGenerate('sys', [])).rejects.toMatchObject({
      code: 'AI_UNAVAILABLE',
    });

    // Ketiga model dicoba...
    expect(calls).toHaveLength(3);
    // ...tapi hanya SATU kegagalan yang dicatat. Ambang breaker `gemini` adalah
    // 3, jadi dengan penghitungan lama satu giliran gagal ini sudah cukup untuk
    // mematikan seluruh fitur AI selama 30 dtk.
    expect(breaker.getState('gemini')).toBe('closed');
  });

  it('kegagalan yang benar-benar berulang tetap membuka breaker', async () => {
    handler = () => Promise.resolve(new Response('high demand', { status: 503 }));

    for (let i = 0; i < 3; i++) {
      await expect(geminiGenerate('sys', [])).rejects.toMatchObject({
        code: 'AI_UNAVAILABLE',
      });
    }

    // Proteksi tetap ada — hanya amplifikasinya yang dibuang.
    expect(breaker.getState('gemini')).toBe('open');
  }, 20_000);

  it('breaker terbuka → gagal cepat TANPA menambah catatan kegagalan', async () => {
    handler = () => Promise.resolve(new Response('down', { status: 503 }));
    for (let i = 0; i < 3; i++) {
      await expect(geminiGenerate('sys', [])).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
    }
    expect(breaker.getState('gemini')).toBe('open');

    const before = calls.length;
    await expect(geminiGenerate('sys', [])).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });

    // Tidak ada model yang dipanggil saat breaker terbuka...
    expect(calls.length).toBe(before);
    // ...dan outage tidak diperpanjang oleh kegagalan yang tidak informatif.
    expect(breaker.getState('gemini')).toBe('open');
  }, 20_000);
});

describe('deadline — panggilan AI tidak boleh hidup lebih lama dari permintaannya', () => {
  it('deadline sudah lewat → provider TIDAK dipanggil sama sekali', async () => {
    const out = runWithContext({ requestId: 't', deadlineAt: Date.now() - 1 }, () =>
      geminiGenerate('sys', []).then(
        () => 'resolved',
        (e: unknown) => (e as { code?: string }).code,
      ),
    );

    expect(await out).toBe('AI_UNAVAILABLE');
    // Inti klaimnya: panggilan yang tidak mungkin selesai di dalam deadline
    // ditolak LOKAL, bukan dikirim lalu menahan slot sampai timeout-nya habis.
    expect(calls).toHaveLength(0);
  });

  it('deadline sangat pendek → hanya satu model dikirim, sisanya ditolak LOKAL', async () => {
    handler = (_model, signal) =>
      // Tidak pernah menjawab sendiri; hanya abort yang bisa mengakhirinya.
      new Promise<Response>((_resolve, reject) => {
        signal.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      });

    const started = Date.now();
    const res = await runWithContext({ requestId: 't', deadlineAt: Date.now() + 300 }, () =>
      geminiGenerate('sys', []).then(
        (v) => v.reply,
        () => 'failed',
      ),
    );
    const elapsed = Date.now() - started;

    expect(res).toBe('failed');
    // Yang mengikat adalah deadline permintaan (300 ms), bukan timeout per-model
    // (4 dtk) dan bukan pula timeout platform.
    expect(elapsed).toBeLessThan(2000);
    // Model kedua dan ketiga TIDAK dikirim: setelah deadline lewat, satu-satunya
    // panggilan yang mungkin tinggal adalah yang ditolak lokal oleh clampBudget.
    expect(calls).toHaveLength(1);
  }, 10_000);
});

describe('diagnosa — sebab kegagalan harus bisa ditindaklanjuti', () => {
  it('grok terdaftar sebagai dependency — fallback tidak boleh tak terlihat di /health', () => {
    // `breaker.check/failure/success('grok')` sudah lama dipanggil dari
    // providers.ts, tapi `grok` tidak pernah masuk DEPENDENCY_CONFIGS: ia
    // memakai ambang default DAN tidak pernah ter-enumerasi `snapshot()`,
    // sehingga satu-satunya provider fallback di sistem ini tidak muncul di
    // laporan kesehatan sama sekali.
    expect(DEPENDENCY_CONFIGS.grok).toBeDefined();
    expect(breaker.snapshot().grok).toBeDefined();
  });

  it('blokir filter keamanan DIBEDAKAN dari "jawaban kosong"', async () => {
    handler = () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            promptFeedback: { blockReason: 'SAFETY' },
            candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await expect(geminiGenerate('sys', [])).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });

      const line = warn.mock.calls
        .map((c) => String(c[0]))
        .find((l) => l.includes('ai.call.failed'));
      expect(line, 'kegagalan AI harus tercatat dengan sebabnya').toBeTruthy();
      // Sebabnya harus terbaca. Dulu satu-satunya jejaknya adalah
      // "Gemini returned empty response", yang tidak memberi tahu apa pun.
      expect(line).toContain('blockReason=SAFETY');
    } finally {
      warn.mockRestore();
    }
  });

  it('hedge yang benar-benar ditembakkan tercatat di metrik', async () => {
    const before = metrics.metricsSnapshot().counters['ai.hedge.fired'] ?? 0;
    handler = (model, signal) => {
      if (model === 'gemini-3.5-flash-lite') {
        return new Promise<Response>((_resolve, reject) => {
          signal.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        });
      }
      return new Promise<Response>((resolve) =>
        setTimeout(() => resolve(ok('{"reply":"hedged"}')), 20),
      );
    };

    await geminiGenerate('sys', []);

    // Inilah satu-satunya angka yang bisa mengkalibrasi lebar hedge dari data
    // produksi: kalau ~0, jendelanya bisa dipendekkan; kalau tinggi, asumsi
    // "model lite menjawab 0,6-1,3 dtk" sudah bergeser.
    const after = metrics.metricsSnapshot().counters['ai.hedge.fired'] ?? 0;
    expect(after).toBe(before + 1);
  }, 10_000);

  it('giliran yang sukses di model pertama TIDAK menembak hedge', async () => {
    const before = metrics.metricsSnapshot().counters['ai.hedge.fired'] ?? 0;
    handler = () => Promise.resolve(ok('{"reply":"cepat"}'));

    await geminiGenerate('sys', []);

    expect(metrics.metricsSnapshot().counters['ai.hedge.fired'] ?? 0).toBe(before);
  });

  it('latensi PER MODEL tercatat — angka yang hilang untuk kalibrasi hedge', async () => {
    handler = () =>
      new Promise<Response>((resolve) =>
        setTimeout(() => resolve(ok('{"reply":"lambat"}')), 40),
      );

    await geminiGenerate('sys', []);

    // Tinjauan 2026-10-01 §7 menyatakan batas jujurnya: "Kalibrasi lebar hedge
    // masih belum terukur… latensi per model masih hanya terlihat lewat
    // histogram `handler.dispatch` per aksi, bukan per dependency." Tanpa angka
    // per model, lebar hedge (1,5 dtk) hanya bisa diasumsikan, dan asumsi itu
    // yang menentukan berapa kali kuota provider dibayar.
    const snap = metrics.metricsSnapshot();
    const key = 'ai.model.latency.model=gemini-3.5-flash-lite.outcome=success';
    expect(snap.histograms[key]).toBeDefined();
    expect(snap.histograms[key].count).toBeGreaterThan(0);
    expect(snap.histograms[key].max).toBeGreaterThanOrEqual(30);
  }, 10_000);

  it('provider AI terlihat oleh aturan `dependency.call{dep,outcome}`', async () => {
    handler = () => Promise.resolve(ok('{"reply":"halo"}'));

    await geminiGenerate('sys', []);

    // `metrics-receiver.ts` mengimplementasikan aturan peringatan di atas
    // `dependency.call{dep,outcome}` — dan jalur AI memakai `fetch` langsung
    // (sengaja, lihat tinjauan §7), jadi Gemini selama ini TIDAK PERNAH muncul
    // di sana: satu-satunya provider yang paling sering gagal tidak punya
    // peringatan sama sekali.
    const snap = metrics.metricsSnapshot();
    expect(snap.counters['dependency.call.dep=gemini.outcome=success']).toBeGreaterThan(0);
    expect(snap.histograms['dependency.call.latency.dep=gemini']).toBeDefined();
  });
});

describe('fallback Grok — penjaganya harus benar-benar bisa tercapai', () => {
  it('Gemini gagal CEPAT → Grok dipakai', async () => {
    // Regresi langsung terhadap cacat T5: penjaganya dulu
    // `elapsed < TOTAL_AI_BUDGET_MS - 5000` → `4000 < 4000` = SALAH, jadi
    // begitu Gemini menghabiskan timeout 4 dtk-nya, fallback ini tidak pernah
    // dicoba. Di kasus gagal-cepat ia menyala, tapi dengan timeout 10 dtk yang
    // justru melebihi anggaran 9 dtk yang dipakai membandingkannya.
    vi.stubEnv('XAI_API_KEY', 'test-xai-key');
    handler = () => Promise.resolve(new Response('high demand', { status: 503 }));
    grokHandler = () =>
      Promise.resolve(
        new Response(JSON.stringify({ choices: [{ message: { content: 'halo dari grok' } }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    const out = await geminiGenerate('sys', []);

    expect(out.reply).toBe('halo dari grok');
    expect(grokCalls).toBe(1);
    // Ketiga model Gemini tetap dicoba lebih dulu — fallback TIDAK menggantikan
    // rantai utama, ia melanjutkannya.
    expect(calls).toHaveLength(3);
  });

  it('batas jendela Grok diuji langsung — termasuk titik 4000 yang dulu salah', () => {
    // Sisi lain dari penjaga yang sama, dan inilah yang harus jujur diakui:
    // rantai Gemini berkasus-terburuk ~7 dtk (hedge 1,5 + hedge 1,5 + timeout
    // model terakhir 4), sedangkan jendela Grok hanya
    // TOTAL_AI_BUDGET_MS - GROK_TIMEOUT_MS = 4 dtk. Jadi Grok menangani
    // kegagalan CEPAT, belum timeout penuh.
    //
    // Diuji sebagai fungsi murni supaya batasnya bisa disapu menyeluruh tanpa
    // menunggu rantai 7 detik untuk sampai ke sana — dan supaya batas itu tidak
    // bisa berubah tanpa suara.
    const TOTAL = AI_BUDGETS.totalMs;
    const GROK = AI_BUDGETS.grokMs;

    // Gagal cepat (3 × HTTP 503 dalam ~10 ms) → jendela masih penuh.
    expect(shouldTryGrok(10, GROK)).toBe(true);
    // TITIK YANG DULU SALAH, dan inilah inti perbaikannya. Tepat setelah Gemini
    // menghabiskan timeout per-modelnya (4 dtk), bentuk lama membandingkan
    // `4000 < 9000 - 5000` → `4000 < 4000` → SALAH, jadi fallback tidak pernah
    // dicoba di kasus yang paling membutuhkannya. Bentuk baru menjumlah:
    // 4000 + 5000 = 9000 ≤ 9000 → benar, dan Grok dicoba.
    expect(shouldTryGrok(4000, GROK)).toBe(true);
    // Batasnya tepat di TOTAL - GROK; satu milidetik lebih lama sudah tidak muat.
    expect(shouldTryGrok(TOTAL - GROK, GROK)).toBe(true);
    expect(shouldTryGrok(TOTAL - GROK + 1, GROK)).toBe(false);
    // Memakai anggaran yang SUDAH dipotong deadline: sisa waktu sedikit berarti
    // Grok mendapat jatah kecil, dan itu tetap boleh dicoba selama jumlahnya
    // masih muat — inilah yang tidak bisa dilakukan bentuk lama, yang selalu
    // membandingkan terhadap konstanta penuh.
    expect(shouldTryGrok(6500, 2000)).toBe(true);
    // Tidak ada sisa waktu sama sekali → jangan buka socket.
    expect(shouldTryGrok(0, 0)).toBe(false);
    expect(shouldTryGrok(8500, 100)).toBe(false);
  });

  it('kegagalan Grok tercatat di breaker-nya SENDIRI, terpisah dari Gemini', async () => {
    vi.stubEnv('XAI_API_KEY', 'test-xai-key');
    handler = () => Promise.resolve(new Response('high demand', { status: 503 }));
    grokHandler = () => Promise.resolve(new Response('nope', { status: 500 }));

    await expect(geminiGenerate('sys', [])).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });

    // Dua dependency terpisah: provider yang berbeda bisa sakit pada waktu yang
    // berbeda, dan menyatukannya akan membuat satu provider yang down mematikan
    // provider lainnya juga. Grok kini TERDAFTAR (P5) sehingga kegagalannya
    // benar-benar tercatat dan ikut muncul di /health — dulu ia memakai
    // konfigurasi default dan tidak ter-enumerasi sama sekali.
    expect(breaker.snapshot().grok.failures).toBeGreaterThan(0);
    // Satu giliran Gemini yang gagal tetap belum membuka breaker Gemini.
    expect(breaker.getState('gemini')).toBe('closed');
  });
});

describe('anggaran parse dokumen — terpisah dari chat', () => {
  it('parse memakai jatah model yang jauh lebih besar daripada chat', () => {
    // Nilai lama 4000 ms dipakai BERSAMA chat: setiap parse PDF/Excel
    // sungguhan hampir pasti timeout sebelum model selesai membaca berkas.
    expect(AI_BUDGETS.parseModelMs).toBeGreaterThan(4000);
    expect(AI_BUDGETS.parseModelMs).toBeGreaterThan(AI_BUDGETS.chatModelMs);
  });

  it('parse 4,5 dtk BERHASIL — batas lama 4 dtk akan menggagalkannya', async () => {
    // Regresi langsung terhadap cacat T4. `MODEL_TIMEOUT_MS = 4000` dulu dipakai
    // BERSAMA chat dan parse, jadi berkas yang modelnya butuh lebih dari 4 dtk
    // selalu timeout — dan pesan yang muncul menyalahkan berkasnya
    // ("AI tidak bisa mengekstrak data dari file ini"), bukan anggarannya.
    handler = () =>
      new Promise<Response>((resolve) =>
        setTimeout(() => resolve(ok('{"nama":"BUDI"}')), 4500),
      );

    const text = await geminiParseFile('sys', { mimeType: 'application/pdf', data: 'AAA' });

    expect(text).toBe('{"nama":"BUDI"}');
    // Dan hedge parse yang lebih longgar (50% anggaran) berarti berkas lambat
    // tidak otomatis menembak model kedua — satu berkas tetap satu panggilan.
    expect(calls).toHaveLength(1);
  }, 15_000);

  it('parse tidak di-hedge seagresif chat — satu berkas lambat tetap satu panggilan', async () => {
    handler = () =>
      new Promise<Response>((resolve) =>
        setTimeout(() => resolve(ok('{"nama":"BUDI"}')), 2000),
      );

    const text = await geminiParseFile('sys', { mimeType: 'application/pdf', data: 'AAA' });

    expect(text).toBe('{"nama":"BUDI"}');
    // 2 dtk > hedge chat (1,5 dtk). Kalau parse memakai hedge chat, model kedua
    // sudah ditembak dan satu berkas akan membayar kuota 2x.
    expect(calls).toHaveLength(1);
  }, 10_000);
});

// ==========================================
// TESTS: anggaran RANTAI — `TOTAL_AI_BUDGET_MS` harus MENGIKAT, bukan sekadar
// nama yang dipakai setelah pekerjaannya selesai.
//
// Cacat yang dijaga di sini (dinyatakan terbuka di tinjauan 2026-10-01 §4c P8):
// `TOTAL_AI_BUDGET_MS` = 9 dtk hanya muncul di `shouldTryGrok()`, yaitu SETELAH
// rantai Gemini selesai. Rantai itu sendiri tidak punya anggaran: tiap model
// hanya dipotong ke sisa DEADLINE PERMINTAAN (12 dtk), jadi hedge 1,5 + hedge
// 1,5 + timeout model terakhir 4 = ~7 dtk. Akibatnya jendela Grok
// (TOTAL - grok = 4 dtk) sudah habis sebelum fallback sempat dicoba — tepat di
// kasus yang paling membutuhkannya. Dan pada jalur parse, satu berkas bisa
// memegang 11 dtk dari 12 dtk deadline, karena PARSE_MODEL_TIMEOUT_MS (11000)
// melebihi TOTAL_AI_BUDGET_MS (9000) yang seharusnya membatasinya.
// ==========================================
describe('anggaran rantai — TOTAL_AI_BUDGET_MS benar-benar membatasi rantai', () => {
  /** Model yang hanya bisa berakhir karena abort — cara termurah mengukur durasi rantai. */
  const hangingHandler = (_model: string, signal: AbortSignal) =>
    new Promise<Response>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    });

  it('rantai Gemini berhenti di anggaran rantai, bukan di 1,5 + 1,5 + 4 dtk', async () => {
    handler = hangingHandler;

    const started = Date.now();
    await expect(geminiGenerate('sys', [])).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
    const elapsed = Date.now() - started;

    // Ketiga model tetap dicoba — anggaran rantai memotong DURASI, bukan jumlah
    // percobaan.
    expect(calls).toHaveLength(3);
    // Yang mengikat sekarang adalah anggaran rantai. Sebelumnya tidak ada yang
    // mengikat selain deadline permintaan (12 dtk), sehingga rantai berjalan ~7
    // dtk dan konstanta 9 dtk itu tidak pernah membatasi apa pun.
    expect(elapsed).toBeLessThan(AI_BUDGETS.chatChainMs + 1200);
  }, 20_000);

  it('SEMUA model Gemini menghabiskan waktunya → Grok TETAP dicoba (dulu tidak pernah)', async () => {
    // Inilah cacat yang dinyatakan terbuka di tinjauan: Grok hanya menangani
    // kegagalan CEPAT. Kalau Gemini menghabiskan timeout-nya, `elapsed` sudah
    // melewati `TOTAL - grok`, jadi fallback tidak pernah dicoba — satu-satunya
    // provider cadangan praktis mati di kasus terburuk.
    vi.stubEnv('XAI_API_KEY', 'test-xai-key');
    handler = hangingHandler;
    grokHandler = () =>
      Promise.resolve(
        new Response(JSON.stringify({ choices: [{ message: { content: 'halo dari grok' } }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    const out = await geminiGenerate('sys', []);

    expect(out.reply).toBe('halo dari grok');
    expect(grokCalls).toBe(1);
  }, 20_000);

  it('anggaran rantai + jendela Grok + jarak aman = TOTAL — tak bisa bergeser sendiri', () => {
    // Bentuk cacat aslinya adalah aritmetika yang tersebar: jendela fallback
    // dihitung dari `TOTAL - grok` di satu tempat, sementara rantai utama tidak
    // dibatasi sama sekali di tempat lain. Sebagai turunan, keduanya tidak bisa
    // lagi bergeser sendiri-sendiri.
    //
    // `fallbackHandoffMs` ada karena kesetaraan tanpa jarak aman TERUKUR gagal:
    // rantai berakhir di 4015 ms (bukan 4000) sehingga `4015 + 5000 > 9000` dan
    // Grok ditolak lagi — cacat aslinya berpindah tempat, bukan hilang.
    expect(AI_BUDGETS.chatChainMs + AI_BUDGETS.grokMs + AI_BUDGETS.fallbackHandoffMs).toBe(
      AI_BUDGETS.totalMs,
    );
    // Parse tidak punya fallback, jadi ia boleh memakai SELURUH anggaran AI —
    // tapi tetap di bawah anggaran itu, bukan 11 dtk dari deadline 12 dtk.
    expect(AI_BUDGETS.parseModelMs).toBeGreaterThan(AI_BUDGETS.chatChainMs);
    expect(AI_BUDGETS.parseModelMs).toBeGreaterThan(AI_BUDGETS.totalMs);
    // Terjemahan latar tidak boleh sebesar rantai yang ditunggu pengguna.
    expect(AI_BUDGETS.translateChainMs).toBeLessThan(AI_BUDGETS.chatChainMs);
  });
});

// ==========================================
// TESTS: panggilan BEST-EFFORT (terjemahan `_jp` latar) — harus terisolasi dari
// balasan yang sedang ditunggu pengguna.
//
// `handleProcessAIChat` menjalankan auto-terjemahan PARALEL dengan balasan chat
// (perbaikan T7). Tapi `autoTranslateMissingJp` dipanggil LEBIH DULU, dan
// `geminiGenerate` memanggil `breaker.check()` secara sinkron sebelum await
// pertamanya — jadi terjemahanlah yang mengambil probe `half-open` milik
// balasan. Saat breaker sudah `open` lebih dari cooldown, `check()` mentransisikan
// ke `half-open` dan mengembalikan izin; panggilan KEDUA untuk dependency yang
// sama langsung ditolak `SERVICE_UNAVAILABLE` ("Circuit breaker probing"). Jadi
// balasan yang ditunggu pengguna gagal padahal providernya sehat — dan satu
// giliran yang gagal menyumbang DUA kegagalan breaker (ambangnya 3).
// ==========================================
describe('breaker parse — berkas yang tidak terbaca tidak boleh mematikan chat', () => {
  it('tiga parse gagal TIDAK membuka breaker yang menjaga balasan pengguna', async () => {
    // Penyebabnya BUKAN kesehatan provider: berkas yang terlalu besar untuk
    // dibaca model, berkas hasil scan yang tidak terbaca, atau blokir filter
    // keamanan. Dan UI-nya sendiri MENGAJAK mencoba lagi — `classify.ts:140`
    // menjawab "Coba file lain" — jadi tiga percobaan adalah perilaku yang
    // diharapkan, bukan penyalahgunaan.
    handler = () => Promise.resolve(new Response('file too large for model', { status: 413 }));
    for (let i = 0; i < 3; i++) {
      await expect(
        geminiParseFile('sys', { mimeType: 'application/pdf', data: 'AAA' }),
      ).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
    }

    // Sebelumnya ketiga kegagalan ini dicatat di breaker `gemini` — ambangnya 3
    // — sehingga SATU admin dengan tiga berkas buruk mematikan CV AI, HRD AI,
    // simulator wawancara, dan parse itu sendiri untuk SEMUA pengguna selama
    // `coolDownMs` 30 dtk. Kelas yang sama dengan T1/T9: blast radius satu
    // permukaan menimpa permukaan lain.
    expect(breaker.getState('gemini')).toBe('closed');
    // Proteksinya tidak hilang — hanya pindah ke breaker yang benar.
    expect(breaker.snapshot()['gemini-parse'].failures).toBeGreaterThan(0);
  }, 20_000);

  it('setelah parse gagal berulang, balasan pengguna masih benar-benar dikirim', async () => {
    handler = () => Promise.resolve(new Response('file too large for model', { status: 413 }));
    for (let i = 0; i < 3; i++) {
      await expect(
        geminiParseFile('sys', { mimeType: 'application/pdf', data: 'AAA' }),
      ).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
    }

    // Bukan sekadar "state breaker terlihat benar": panggilan berikutnya harus
    // benar-benar MENYENTUH provider. Kalau breaker `gemini` terbuka, panggilan
    // ini ditolak lokal dan `calls` tetap kosong.
    calls.length = 0;
    handler = () => Promise.resolve(ok('{"reply":"masih hidup"}'));

    const out = await geminiGenerate('sys', []);

    expect(out.reply).toBe('{"reply":"masih hidup"}');
    expect(calls).toHaveLength(1);
  }, 20_000);
});

describe('panggilan best-effort — terisolasi dari balasan pengguna', () => {
  it('kegagalannya dicatat di breaker SENDIRI, bukan di breaker balasan', async () => {
    handler = () => Promise.resolve(new Response('high demand', { status: 503 }));

    await expect(geminiGenerate('sys', [], { bestEffort: true })).rejects.toMatchObject({
      code: 'AI_UNAVAILABLE',
    });

    const snap = breaker.snapshot();
    expect(snap['gemini-translate'].failures).toBeGreaterThan(0);
    // Balasan pengguna tidak boleh ikut tercemar: ambang breaker `gemini` adalah
    // 3, jadi satu giliran dengan terjemahan yang gagal tidak boleh menyumbang 2.
    expect(snap.gemini.failures).toBe(0);
    expect(breaker.getState('gemini')).toBe('closed');
  });

  it('tidak memakai provider fallback — kuota Grok disisakan untuk balasan', async () => {
    vi.stubEnv('XAI_API_KEY', 'test-xai-key');
    handler = () => Promise.resolve(new Response('high demand', { status: 503 }));
    grokHandler = () =>
      Promise.resolve(
        new Response(JSON.stringify({ choices: [{ message: { content: 'grok' } }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    await expect(geminiGenerate('sys', [], { bestEffort: true })).rejects.toMatchObject({
      code: 'AI_UNAVAILABLE',
    });

    // Terjemahan adalah pekerjaan latar yang bisa disusulkan giliran berikutnya.
    // Balasan yang sedang ditunggu tidak punya alternatif lain — jadi provider
    // cadangan disisakan untuknya.
    expect(grokCalls).toBe(0);
  });

  it('tidak bisa mencuri probe half-open milik balasan pengguna', async () => {
    for (let i = 0; i < 3; i++) breaker.failure('gemini');
    expect(breaker.getState('gemini')).toBe('open');
    // Backdate alih-alih menunggu 30 dtk — pola yang sama dengan health.test.ts.
    // Helper eksplisit (bukan `!`): record yang hilang harus GAGAL KERAS, sebab
    // kalau tidak, tes ini akan lulus tanpa pernah benar-benar memundurkan
    // `openedAt` — hijau yang tidak mengukur apa pun.
    const backdateOpen = (dep: string) => {
      const records = (
        breaker as unknown as { records: Map<string, { openedAt: number }> }
      ).records;
      const rec = records.get(dep);
      if (!rec) throw new Error(`tidak ada record breaker untuk ${dep}`);
      rec.openedAt = Date.now() - 31_000;
    };
    backdateOpen('gemini');

    handler = () => Promise.resolve(ok('{"reply":"balasan"}'));
    // Urutan ini yang terjadi di produksi: terjemahan dijalankan lebih dulu.
    await geminiGenerate('sys', [], { bestEffort: true });

    // Probe `half-open` harus UTUH untuk balasan pengguna. Kalau terjemahan
    // memakai kunci breaker yang sama, ia sudah mentransisikan breaker ke
    // `half-open` dan balasan berikutnya ditolak SERVICE_UNAVAILABLE.
    expect(breaker.getState('gemini')).toBe('open');

    const out = await geminiGenerate('sys', []);
    expect(out.reply).toBe('{"reply":"balasan"}');
  });
});
