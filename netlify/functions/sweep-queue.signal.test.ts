// ==========================================
// TESTS: sweep-queue — gerbang antrean (`JOB_SIGNAL_MODE`).
//
// YANG DIBUKTIKAN DI SINI BUKAN "gerbang bekerja", melainkan tiga hal yang
// berbeda sifatnya:
//
//   1. `off` (default) = perilaku HARI INI, byte-for-byte. Port gerbang tidak
//      boleh dibuat sama sekali di cabang ini — bukan "dibaca lalu diabaikan".
//      `claimJob()` berputar seperti sebelumnya dan `cleanupIdempotencyKeys()`
//      berjalan SETIAP sweep.
//   2. `shadow` = jalur hari ini dijalankan PENUH, lalu gerbang dibaca hanya
//      untuk dicatat (`sweep.signal.verdict`). `falseIdle` harus `true` TEPAT
//      ketika `verdict === 'idle'` DAN ada job yang benar-benar ter-claim —
//      itulah bukti paritas (gate G1 di docs/RENCANA_ANTREAN_TANPA_NEON.md §10).
//   3. `on` = tiga jalur yang masing-masing punya kewajiban biaya berbeda:
//      'idle' ⇒ NOL request DB; 'due' ⇒ loop claim + nextDueAt + settle;
//      'unknown' ⇒ jalur hari ini DAN cleanup tanpa lease (Redis mati tidak
//      boleh menghentikan pembersihan idempotensi).
//
// CARA MOCK
//   Semua batas modul dipalsukan, jadi tidak ada DB dan tidak ada jaringan:
//     - `_lib/kernel/job-queue`  → claim/complete/fail/recordResult/cleanup/nextDueAt
//     - `_lib/kernel/job-signal` → `jobSignal()` (port gerbang)
//     - `_lib/metrics-sink`      → hanya `exportMetrics` (sweepMetrics tetap ASLI,
//                                  supaya counter yang dikirim bisa diperiksa)
//     - `_lib/kernel/log`        → supaya isi `sweep.signal.verdict` bisa dibaca
//     - `_lib/ai/chat`           → handler job `ai.interview` tanpa modul AI asli
//   `_lib/db/test-guard.ts` mencatat setiap tulisan non-GET di dalam vitest dan
//   menggagalkan berkas ini di `afterAll`, jadi satu `supabaseJson` yang lolos
//   akan terlihat sebagai kegagalan — bukan sebagai ketiadaan bukti.
//
// `vi.resetModules()` dipanggil sebelum setiap impor `sweep-queue` (lihat
// `loadHandler`): tanpa itu modul di-cache, dan asersi "mode off tidak pernah
// membuat port" akan lulus karena alasan yang salah.
//
// Jalankan: npx vitest run netlify/functions/sweep-queue.signal.test.ts
// ==========================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Semua mock dibuat di `vi.hoisted` supaya referensinya STABIL. `vi.resetModules()`
// menjalankan ulang pabrik modul; kalau pabriknya membuat `vi.fn()` baru setiap
// kali, asersi "port tidak pernah dipanggil" akan memeriksa fungsi yang salah.
const mocks = vi.hoisted(() => {
  const state: { observed: number | null } = { observed: null };
  return {
    state,
    claimJob: vi.fn(),
    completeJob: vi.fn(),
    failJob: vi.fn(),
    recordJobResult: vi.fn(),
    cleanupIdempotencyKeys: vi.fn(),
    nextDueAt: vi.fn(),
    jobSignal: vi.fn(),
    peek: vi.fn(),
    announce: vi.fn(),
    settle: vi.fn(),
    lease: vi.fn(),
    exportMetrics: vi.fn(),
    logDebug: vi.fn(),
    logInfo: vi.fn(),
    logWarn: vi.fn(),
    logError: vi.fn(),
    aiInterview: vi.fn(),
  };
});

// `job-queue` hanya diekspor ulang seperlunya: sweep memakai enam fungsi ini,
// dan `Job` adalah tipe (hilang saat kompilasi). Memakai `importOriginal` di
// sini akan memuat `_lib/db/client` — persis yang tidak boleh terjadi di berkas
// ini.
vi.mock('./_lib/kernel/job-queue', () => ({
  claimJob: mocks.claimJob,
  completeJob: mocks.completeJob,
  failJob: mocks.failJob,
  recordJobResult: mocks.recordJobResult,
  cleanupIdempotencyKeys: mocks.cleanupIdempotencyKeys,
  nextDueAt: mocks.nextDueAt,
}));

vi.mock('./_lib/kernel/job-signal', () => ({
  jobSignal: mocks.jobSignal,
}));

// `sweepMetrics` sengaja ASLI: yang diuji adalah counter yang benar-benar
// dikirim (mis. `sweep.gate.false_idle`), bukan panggilan fungsinya.
vi.mock('./_lib/metrics-sink', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./_lib/metrics-sink')>();
  return { ...actual, exportMetrics: mocks.exportMetrics };
});

vi.mock('./_lib/kernel/log', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./_lib/kernel/log')>();
  return {
    ...actual,
    log: {
      debug: mocks.logDebug,
      info: mocks.logInfo,
      warn: mocks.logWarn,
      error: mocks.logError,
    },
  };
});

vi.mock('./_lib/ai/chat', () => ({
  handleProcessAiInterview: mocks.aiInterview,
}));

import type { Job } from './_lib/kernel/job-queue';

type Verdict = 'idle' | 'due' | 'unknown';
type SignalMode = 'off' | 'shadow' | 'on';
type AdaptedHandler = (request: Request) => Promise<Response>;

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'job-1',
    type: 'ai.interview',
    payload: { payload: [], sessionToken: 'tok' },
    idempotency_key: null,
    status: 'pending',
    attempts: 1,
    max_attempts: 5,
    run_after: '2026-11-20T00:00:00.000Z',
    locked_until: null,
    last_error: null,
    created_at: '2026-11-20T00:00:00.000Z',
    ...overrides,
  };
}

/** Handle port gerbang: satu instance per pass, `observed` dibaca `settle()`. */
const signalHandle = {
  peek: mocks.peek,
  announce: mocks.announce,
  settle: mocks.settle,
  lease: mocks.lease,
  get observed(): number | null {
    return mocks.state.observed;
  },
};

/** Pasang jawaban `peek()`. `observed` adalah operand CAS yang dibaca `settle()`. */
function whenPeek(verdict: Verdict, observed: number | null = null): void {
  mocks.peek.mockImplementation(async () => {
    mocks.state.observed = observed;
    return verdict;
  });
}

/** Isi ulang semua mock ke keadaan "antrean kosong, gerbang mati". */
function primeMocks(): void {
  vi.clearAllMocks();
  mocks.state.observed = null;

  mocks.claimJob.mockResolvedValue(null);
  mocks.completeJob.mockResolvedValue(undefined);
  mocks.failJob.mockResolvedValue(undefined);
  mocks.recordJobResult.mockResolvedValue(undefined);
  mocks.cleanupIdempotencyKeys.mockResolvedValue(0);
  mocks.nextDueAt.mockResolvedValue(null);
  mocks.aiInterview.mockResolvedValue({ success: true });

  mocks.jobSignal.mockReturnValue(signalHandle);
  mocks.peek.mockResolvedValue('unknown');
  mocks.settle.mockResolvedValue(true);
  mocks.lease.mockResolvedValue(false);
  mocks.exportMetrics.mockResolvedValue(undefined);
}

/**
 * Impor ulang `sweep-queue` dari awal.
 *
 * `resetModules()` WAJIB: kalau modul di-cache, `process.env.JOB_SIGNAL_MODE`
 * yang diubah per tes tidak akan pernah dibaca ulang, dan asersi "mode off tidak
 * menyentuh port" akan lulus tanpa membuktikan apa pun.
 */
async function loadHandler(): Promise<AdaptedHandler> {
  vi.resetModules();
  const mod = await import('./sweep-queue');
  return mod.default as unknown as AdaptedHandler;
}

/** Jalankan sweep seperti Netlify: `Request` masuk, `Response` keluar. */
async function runSweep(): Promise<{ res: Response; body: Record<string, unknown> }> {
  const handler = await loadHandler();
  const res = await handler(
    new Request('https://asjastro.netlify.app/.netlify/functions/sweep-queue', { method: 'POST' }),
  );
  const raw = await res.text();
  return { res, body: raw ? (JSON.parse(raw) as Record<string, unknown>) : {} };
}

/** Urutan pemanggilan sebuah mock (untuk membuktikan sequence, bukan cuma count). */
function orderOf(fn: { mock: { invocationCallOrder: number[] } }, index = 0): number {
  return fn.mock.invocationCallOrder[index] ?? Number.NaN;
}

/** Argumen `lease()` yang dipakai — untuk membuktikan short-circuit. */
function leaseNames(): string[] {
  return mocks.lease.mock.calls.map((c) => String(c[0]));
}

beforeEach(() => {
  primeMocks();
});

afterEach(() => {
  delete process.env.JOB_SIGNAL_MODE;
});

// ── 1. Mode `off` — jalur hari ini, byte-for-byte ────────────────────────────

describe('mode off — jalur hari ini, byte-for-byte', () => {
  it('off: port gerbang TIDAK pernah dibuat — jobSignal() nol panggilan', async () => {
    process.env.JOB_SIGNAL_MODE = 'off';
    mocks.cleanupIdempotencyKeys.mockResolvedValue(3);

    await runSweep();

    // Inti invarian: cabang `off` memutuskan SEBELUM port disentuh. Kalau
    // `jobSignal()` pernah dipanggil di sini, mode default sudah bukan perilaku
    // hari ini lagi — walaupun verdict-nya diabaikan.
    expect(mocks.jobSignal).not.toHaveBeenCalled();
    expect(mocks.peek).not.toHaveBeenCalled();
    expect(mocks.settle).not.toHaveBeenCalled();
    expect(mocks.lease).not.toHaveBeenCalled();
    expect(mocks.announce).not.toHaveBeenCalled();

    // Jalur lama tetap utuh.
    expect(mocks.claimJob).toHaveBeenCalledTimes(1);
    expect(mocks.cleanupIdempotencyKeys).toHaveBeenCalledTimes(1);
  });

  it('off: loop claim berputar sampai 5 job lalu berhenti saat claimJob() null', async () => {
    process.env.JOB_SIGNAL_MODE = 'off';
    // Enam job tersedia: loop lama berhenti karena BATAS 5, bukan karena kosong.
    mocks.claimJob
      .mockResolvedValueOnce(makeJob({ id: 'job-1' }))
      .mockResolvedValueOnce(makeJob({ id: 'job-2' }))
      .mockResolvedValueOnce(makeJob({ id: 'job-3' }))
      .mockResolvedValueOnce(makeJob({ id: 'job-4' }))
      .mockResolvedValueOnce(makeJob({ id: 'job-5' }))
      .mockResolvedValueOnce(makeJob({ id: 'job-6' }));

    const { body } = await runSweep();

    expect(mocks.claimJob).toHaveBeenCalledTimes(5);
    expect(mocks.completeJob).toHaveBeenCalledTimes(5);
    expect(body.processed).toBe(5);
    expect(body.failed).toBe(0);
  });

  it('off: cleanupIdempotencyKeys() berjalan tiap sweep dan hasilnya masuk ke respons', async () => {
    process.env.JOB_SIGNAL_MODE = 'off';
    mocks.cleanupIdempotencyKeys.mockResolvedValue(7);

    const { body } = await runSweep();

    // Cleanup adalah retensi 24 jam `idempotency_keys` (§T4). Di mode off ia
    // tidak boleh tunduk pada lease apa pun.
    expect(mocks.cleanupIdempotencyKeys).toHaveBeenCalledTimes(1);
    expect(body.cleaned).toBe(7);
  });

  it('off: job yang gagal dihitung failed, failJob() dipanggil, completeJob() tidak', async () => {
    process.env.JOB_SIGNAL_MODE = 'off';
    mocks.claimJob.mockResolvedValueOnce(makeJob({ id: 'job-gagal' })).mockResolvedValue(null);
    mocks.aiInterview.mockRejectedValueOnce(new Error('handler meledak'));

    const { body } = await runSweep();

    expect(mocks.failJob).toHaveBeenCalledTimes(1);
    expect(mocks.failJob.mock.calls[0][0]).toBe('job-gagal');
    expect(mocks.completeJob).not.toHaveBeenCalled();
    expect(body.processed).toBe(0);
    expect(body.failed).toBe(1);
  });

  it('off: JOB_SIGNAL_MODE tak dikenal (salah ketik) diperlakukan sebagai off', async () => {
    // Salah ketik tidak boleh menyalakan jalur yang belum tervalidasi.
    process.env.JOB_SIGNAL_MODE = 'ONN';

    await runSweep();

    expect(mocks.jobSignal).not.toHaveBeenCalled();
    expect(mocks.claimJob).toHaveBeenCalledTimes(1);
    expect(mocks.cleanupIdempotencyKeys).toHaveBeenCalledTimes(1);
  });

  it('off: JOB_SIGNAL_MODE tidak diisi sama sekali = off', async () => {
    delete process.env.JOB_SIGNAL_MODE;

    await runSweep();

    expect(mocks.jobSignal).not.toHaveBeenCalled();
    expect(mocks.claimJob).toHaveBeenCalledTimes(1);
    expect(mocks.cleanupIdempotencyKeys).toHaveBeenCalledTimes(1);
  });
});

// ── 2. Mode `shadow` — bukti paritas ────────────────────────────────────────

describe('mode shadow — jalur hari ini penuh, gerbang hanya dicatat', () => {
  it('shadow: claim + cleanup berjalan penuh, gerbang dibaca sekali, nextDueAt() tidak', async () => {
    process.env.JOB_SIGNAL_MODE = 'shadow';
    whenPeek('due', 1_700_000_000_000);

    await runSweep();

    expect(mocks.claimJob).toHaveBeenCalledTimes(1);
    expect(mocks.cleanupIdempotencyKeys).toHaveBeenCalledTimes(1);
    expect(mocks.peek).toHaveBeenCalledTimes(1);
    // `settle()`/`nextDueAt()` milik mode `on`: di shadow gerbang hanya dibaca,
    // tidak pernah ditulis — kalau tidak, shadow sudah mengubah keadaan Redis.
    expect(mocks.settle).not.toHaveBeenCalled();
    expect(mocks.nextDueAt).not.toHaveBeenCalled();
    expect(mocks.announce).not.toHaveBeenCalled();
  });

  it('shadow: falseIdle=false saat gerbang idle dan tidak ada job ter-claim', async () => {
    process.env.JOB_SIGNAL_MODE = 'shadow';
    whenPeek('idle', 1_800_000_000_000);

    await runSweep();

    const verdictLog = mocks.logInfo.mock.calls.find((c) => c[0] === 'sweep.signal.verdict');
    expect(verdictLog).toBeDefined();
    expect(verdictLog?.[1]).toMatchObject({
      verdict: 'idle',
      actualClaimed: 0,
      wouldSkip: true,
      falseIdle: false,
    });

    // Metrik G1: 0 secara eksplisit supaya "tidak ada pelanggaran" terlihat.
    const payload = mocks.exportMetrics.mock.calls[0][0];
    expect(payload.counters['sweep.gate.false_idle']).toBe(0);
  });

  it('shadow: falseIdle=true saat gerbang idle padahal ada job ter-claim', async () => {
    process.env.JOB_SIGNAL_MODE = 'shadow';
    mocks.claimJob.mockResolvedValueOnce(makeJob({ id: 'job-terlewat' })).mockResolvedValue(null);
    whenPeek('idle', 1_800_000_000_000);

    await runSweep();

    const verdictLog = mocks.logInfo.mock.calls.find((c) => c[0] === 'sweep.signal.verdict');
    // Inilah satu-satunya sinyal yang memblokir aktivasi `on`: gerbang bilang
    // "tidak ada apa-apa" padahal sweep baru saja mengambil satu job.
    expect(verdictLog?.[1]).toMatchObject({ verdict: 'idle', actualClaimed: 1, falseIdle: true });
    expect(mocks.exportMetrics.mock.calls[0][0].counters['sweep.gate.false_idle']).toBe(1);
  });

  it('shadow: falseIdle menghitung job yang GAGAL sebagai ter-claim', async () => {
    process.env.JOB_SIGNAL_MODE = 'shadow';
    mocks.claimJob.mockResolvedValueOnce(makeJob({ id: 'job-gagal' })).mockResolvedValue(null);
    mocks.aiInterview.mockRejectedValueOnce(new Error('gagal'));
    whenPeek('idle', 1_800_000_000_000);

    await runSweep();

    // `actualClaimed = processed + failed`. Job yang gagal tetap berarti gerbang
    // salah kalau ia bilang idle — jadi harus ikut dihitung.
    const verdictLog = mocks.logInfo.mock.calls.find((c) => c[0] === 'sweep.signal.verdict');
    expect(verdictLog?.[1]).toMatchObject({ actualClaimed: 1, falseIdle: true });
  });

  it('shadow: cleanup tetap TANPA syarat — lease tidak dipakai sama sekali', async () => {
    process.env.JOB_SIGNAL_MODE = 'shadow';
    whenPeek('unknown', null);
    mocks.cleanupIdempotencyKeys.mockResolvedValue(2);

    const { body } = await runSweep();

    // Kalau shadow mulai memakai lease cleanup, ia berhenti menjadi pembanding
    // yang setara untuk mode `on` — dan `cleaned` tidak lagi sebanding.
    expect(mocks.lease).not.toHaveBeenCalled();
    expect(mocks.cleanupIdempotencyKeys).toHaveBeenCalledTimes(1);
    expect(body.cleaned).toBe(2);
  });
});

// ── 3. Mode `on` + `idle` — nol request DB ──────────────────────────────────

describe('mode on — gerbang idle: nol request DB', () => {
  it('on+idle: claimJob(), cleanupIdempotencyKeys(), nextDueAt() tidak pernah dipanggil', async () => {
    process.env.JOB_SIGNAL_MODE = 'on';
    whenPeek('idle', 1_800_000_000_000);
    mocks.lease.mockResolvedValue(false);

    const { body } = await runSweep();

    // Seluruh tujuan perubahan ini: sweep kosong tidak boleh membangunkan Neon.
    expect(mocks.claimJob).not.toHaveBeenCalled();
    expect(mocks.cleanupIdempotencyKeys).not.toHaveBeenCalled();
    expect(mocks.nextDueAt).not.toHaveBeenCalled();
    expect(mocks.settle).not.toHaveBeenCalled();
    expect(mocks.completeJob).not.toHaveBeenCalled();
    expect(mocks.failJob).not.toHaveBeenCalled();

    expect(body).toMatchObject({ processed: 0, failed: 0, cleaned: 0 });
  });

  it('on+idle: gerbang dibaca sekali, lease hanya dicoba untuk reconcile', async () => {
    process.env.JOB_SIGNAL_MODE = 'on';
    whenPeek('idle', 1_800_000_000_000);
    mocks.lease.mockResolvedValue(false);

    await runSweep();

    expect(mocks.jobSignal).toHaveBeenCalledTimes(1);
    expect(mocks.peek).toHaveBeenCalledTimes(1);
    // `peek()` menerima `now` (epoch ms) sebagai argumen.
    expect(typeof mocks.peek.mock.calls[0][0]).toBe('number');
    // Lease cleanup tidak dicoba saat idle: 2 perintah Redis per sweep, bukan 3.
    expect(leaseNames()).toEqual(['reconcile']);
  });
});

// ── 4. Mode `on` + `due` ────────────────────────────────────────────────────

describe('mode on — gerbang due', () => {
  it('on+due: loop claim, lalu nextDueAt(), lalu settle(observed, due) — berurutan', async () => {
    process.env.JOB_SIGNAL_MODE = 'on';
    const OBSERVED = 1_700_000_000_000;
    const DUE = 1_700_000_600_000;
    whenPeek('due', OBSERVED);
    mocks.lease.mockImplementation(async (name: string) => name === 'cleanup');
    mocks.claimJob.mockResolvedValueOnce(makeJob({ id: 'job-due' })).mockResolvedValue(null);
    mocks.nextDueAt.mockResolvedValue(DUE);

    const { body } = await runSweep();

    expect(mocks.claimJob).toHaveBeenCalledTimes(2);
    expect(mocks.completeJob).toHaveBeenCalledTimes(1);
    expect(body.processed).toBe(1);

    // Urutannya bermakna: `settle()` adalah CAS terhadap nilai yang dibaca
    // `peek()` pada handle yang sama, dan `due` harus berasal dari pass ini.
    expect(orderOf(mocks.claimJob, 1)).toBeLessThan(orderOf(mocks.nextDueAt));
    expect(orderOf(mocks.nextDueAt)).toBeLessThan(orderOf(mocks.settle));
    expect(mocks.settle).toHaveBeenCalledTimes(1);
    expect(mocks.settle.mock.calls[0]).toEqual([OBSERVED, DUE]);
  });

  it('on+due: cleanup berjalan hanya bila lease(cleanup) true', async () => {
    process.env.JOB_SIGNAL_MODE = 'on';
    whenPeek('due', 1_700_000_000_000);
    mocks.lease.mockImplementation(async (name: string) => name === 'cleanup');
    mocks.cleanupIdempotencyKeys.mockResolvedValue(4);

    const { body } = await runSweep();

    expect(leaseNames()).toEqual(['reconcile', 'cleanup']);
    expect(mocks.cleanupIdempotencyKeys).toHaveBeenCalledTimes(1);
    expect(body.cleaned).toBe(4);
  });

  it('on+due: lease(cleanup) false ⇒ cleanupIdempotencyKeys() dilewati, cleaned=0', async () => {
    process.env.JOB_SIGNAL_MODE = 'on';
    whenPeek('due', 1_700_000_000_000);
    mocks.lease.mockResolvedValue(false); // tidak ada lease yang didapat

    const { body } = await runSweep();

    expect(leaseNames()).toEqual(['reconcile', 'cleanup']);
    expect(mocks.cleanupIdempotencyKeys).not.toHaveBeenCalled();
    expect(body.cleaned).toBe(0);
  });

  it('on+due: settle ditolak (CAS kalah) tidak menggagalkan sweep', async () => {
    process.env.JOB_SIGNAL_MODE = 'on';
    whenPeek('due', 1_700_000_000_000);
    mocks.lease.mockImplementation(async (name: string) => name === 'cleanup');
    mocks.settle.mockResolvedValue(false); // `enqueue` menurunkan gerbang di tengah pass
    mocks.cleanupIdempotencyKeys.mockResolvedValue(1);

    const { res, body } = await runSweep();

    // Nilai yang lebih kecil menang: settle menolak menulis, sweep tetap sukses.
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ processed: 0, failed: 0, cleaned: 1 });
    expect(mocks.logInfo.mock.calls.some((c) => c[0] === 'sweep.signal.settle-skipped')).toBe(true);
  });
});

// ── 5. Mode `on` + `unknown` — Redis bermasalah ─────────────────────────────

describe('mode on — gerbang unknown', () => {
  it('on+unknown: jalur hari ini berjalan dan cleanup berjalan TANPA lease', async () => {
    process.env.JOB_SIGNAL_MODE = 'on';
    whenPeek('unknown', null);
    mocks.claimJob.mockResolvedValueOnce(makeJob({ id: 'job-unknown' })).mockResolvedValue(null);
    mocks.cleanupIdempotencyKeys.mockResolvedValue(5);

    const { body } = await runSweep();

    expect(mocks.claimJob).toHaveBeenCalledTimes(2);
    expect(body.processed).toBe(1);

    // Lease cleanup TIDAK boleh diminta: `verdict === 'unknown'` melakukan
    // short-circuit. Redis yang mati tidak boleh menahan retensi
    // `idempotency_keys` sampai 30 jam.
    expect(leaseNames()).toEqual(['reconcile']);
    expect(mocks.cleanupIdempotencyKeys).toHaveBeenCalledTimes(1);
    expect(body.cleaned).toBe(5);
  });

  it('on+unknown: settle menerima operand CAS null (bangun ulang), bukan `now`', async () => {
    process.env.JOB_SIGNAL_MODE = 'on';
    whenPeek('unknown', null);
    mocks.lease.mockResolvedValue(false);

    await runSweep();

    expect(mocks.settle).toHaveBeenCalledTimes(1);
    // Kunci absen ⇒ `observed` null ⇒ operand CAS "kunci harus masih absen".
    // Skrip menulis karena itu, sehingga kunci dibangun ulang dalam SATU sweep.
    // Menggantinya dengan `now` (perilaku lama) membuat CAS tidak pernah cocok
    // dan gerbang terjebak 'unknown' selamanya — setiap sweep membayar Neon.
    expect(mocks.settle.mock.calls[0]).toEqual([null, null]);
  });
});

// ── 6. Mode `on` — rekonsiliasi 6 jam ───────────────────────────────────────

describe('mode on — rekonsiliasi', () => {
  it('on+reconcile: lease reconcile didapat ⇒ Neon dibaca walau gerbang idle', async () => {
    process.env.JOB_SIGNAL_MODE = 'on';
    whenPeek('idle', 1_800_000_000_000);
    // Sweep ini memegang lease rekonsiliasi; cleanup ikut didapat.
    mocks.lease.mockResolvedValue(true);

    await runSweep();

    // Jaring pengaman untuk "Redis hidup tetapi satu EVAL gagal": satu sweep per
    // 6 jam WAJIB membaca Neon, kalau tidak job bisa tertunda berhari-hari.
    expect(mocks.claimJob).toHaveBeenCalledTimes(1);
    expect(mocks.nextDueAt).toHaveBeenCalledTimes(1);
    expect(mocks.settle).toHaveBeenCalledTimes(1);
    expect(mocks.cleanupIdempotencyKeys).toHaveBeenCalledTimes(1);
    expect(mocks.exportMetrics.mock.calls[0][0].counters['sweep.reconcile']).toBe(1);

    // Rekonsiliasi MEMAKSA baca, tetapi TIDAK mengubah verdict: lease 6 jam pada
    // cron 15 menit = 4/96 sweep, jadi melabelinya 'unknown' membuat gate G2
    // (≤ 1 %) mustahil lulus dan menyembunyikan nilai gerbang asli saat insiden.
    const counters = mocks.exportMetrics.mock.calls[0][0].counters;
    expect(counters['sweep.gate.idle']).toBe(1);
    expect(counters['sweep.gate.unknown']).toBeUndefined();
  });
});

// ── 7. Bentuk respons HTTP ──────────────────────────────────────────────────

describe('respons HTTP', () => {
  const CASES: Array<{ label: string; mode: SignalMode; verdict: Verdict; due: boolean }> = [
    { label: 'off', mode: 'off', verdict: 'unknown', due: false },
    { label: 'shadow', mode: 'shadow', verdict: 'due', due: false },
    { label: 'on+idle', mode: 'on', verdict: 'idle', due: false },
    { label: 'on+due', mode: 'on', verdict: 'due', due: true },
    { label: 'on+unknown', mode: 'on', verdict: 'unknown', due: true },
  ];

  it('selalu {processed, failed, cleaned, durationMs} — tanpa kunci baru', async () => {
    for (const c of CASES) {
      primeMocks();
      process.env.JOB_SIGNAL_MODE = c.mode;
      whenPeek(c.verdict, 1_700_000_000_000);
      mocks.lease.mockResolvedValue(true);
      if (c.due) {
        mocks.claimJob.mockResolvedValueOnce(makeJob()).mockResolvedValue(null);
        mocks.nextDueAt.mockResolvedValue(1_700_000_600_000);
      }

      const { res, body } = await runSweep();

      expect(res.status, c.label).toBe(200);
      // Kontrak yang dibaca probe/monitoring: empat field ini, tidak lebih.
      expect(Object.keys(body).sort(), c.label).toEqual([
        'cleaned',
        'durationMs',
        'failed',
        'processed',
      ]);
      expect(typeof body.durationMs, c.label).toBe('number');
      expect(body.durationMs as number, c.label).toBeGreaterThanOrEqual(0);
    }
  });
});

// ── 8. Metrik ──────────────────────────────────────────────────────────────

describe('metrik sweep', () => {
  it('off: empat field lama tetap dikirim dengan arti yang sama', async () => {
    process.env.JOB_SIGNAL_MODE = 'off';
    mocks.claimJob.mockResolvedValueOnce(makeJob()).mockResolvedValue(null);
    mocks.cleanupIdempotencyKeys.mockResolvedValue(2);

    const { body } = await runSweep();

    expect(mocks.exportMetrics).toHaveBeenCalledTimes(1);
    const payload = mocks.exportMetrics.mock.calls[0][0];
    expect(payload.counters['sweep.processed']).toBe(1);
    expect(payload.counters['sweep.failed']).toBe(0);
    expect(payload.counters['sweep.cleaned']).toBe(2);
    expect(payload.gauges['sweep.duration_ms']).toBe(body.durationMs);
  });

  it('off: TIDAK mengirim counter gerbang apa pun (payload identik pra-fitur)', async () => {
    process.env.JOB_SIGNAL_MODE = 'off';

    await runSweep();

    // `off` tidak membaca gerbang, jadi ia tidak boleh melaporkan verdict.
    // Satu `sweep.gate.unknown` per sweep `off` akan membuat gate G2 (≤ 1 %)
    // terbaca 100 % selama jendela bayangan 7 hari — dashboard jadi derau.
    const payload = mocks.exportMetrics.mock.calls[0][0];
    expect(Object.keys(payload.counters).sort()).toEqual([
      'sweep.cleaned',
      'sweep.failed',
      'sweep.processed',
    ]);
    expect(payload.counters['sweep.gate.unknown']).toBeUndefined();
    expect(payload.counters['sweep.gate.idle']).toBeUndefined();
    expect(payload.counters['sweep.gate.due']).toBeUndefined();
    expect(payload.counters['sweep.gate.false_idle']).toBeUndefined();
    expect(payload.counters['sweep.reconcile']).toBeUndefined();
  });

  it('shadow: falseIdle dilaporkan sebagai sweep.gate.false_idle (gate G1)', async () => {
    process.env.JOB_SIGNAL_MODE = 'shadow';
    mocks.claimJob.mockResolvedValueOnce(makeJob()).mockResolvedValue(null);
    whenPeek('idle', 1_800_000_000_000);

    await runSweep();

    // Gate G1 membaca counter ini dari dashboard: satu saja bernilai 1 berarti
    // gerbang salah dan `on` tidak boleh diaktifkan.
    const payload = mocks.exportMetrics.mock.calls[0][0];
    expect(payload.counters['sweep.gate.false_idle']).toBe(1);
    expect(payload.counters['sweep.gate.idle']).toBe(1);
  });
});
