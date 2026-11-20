// ==========================================
// TESTS: kernel/job-signal — gerbang antrean (Upstash Redis).
//
// Yang dijaga di sini adalah KONTRAK dari port-nya, bukan perilaku Redis:
//   1. `off` / env kosong ⇒ null object, dan null object itu TIDAK menyentuh
//      jaringan sama sekali. Inilah yang membuat mode default byte-for-byte
//      sama dengan sebelum gerbang ada.
//   2. `peek()` tidak pernah melempar. Timeout, non-2xx, kunci hilang, dan env
//      kosong semuanya menjadi 'unknown' — "jalur hari ini", bukan "antrean
//      berhenti".
//   3. `announce()` hanya menurunkan nilai (min). Dua enqueue bersamaan tidak
//      boleh saling menimpa ke instant yang lebih jauh.
//   4. `settle()` adalah CAS ketat: menolak menulis bila nilai tersimpan sudah
//      berubah sejak dibaca (kalau `enqueue` menurunkannya di tengah pass).
//      Operand CAS boleh `null`, yang berarti "kunci harus MASIH ABSEN" — itu
//      satu-satunya jalur bangun-ulang setelah kunci hilang, jadi ia diuji
//      terpisah di blok 4.
//   5. `lease()` hanya memberi `true` kepada pemegang pertama.
//
// CARA MOCK
//   `request()` di-mock di batas HTTP (satu-satunya jalur keluar, lihat
//   scripts/ci/io-boundary.mjs) dan diganti fake Redis kecil yang menjalankan
//   semantik skrip Lua yang SAMA. Skripnya dikenali dari penanda baris pertama
//   (`-- asj:gate` / `-- asj:announce` / `-- asj:settle`), dan keberadaan
//   penanda itu ikut diuji di blok terakhir — kalau Lua-nya ditulis ulang tanpa
//   penanda, tes ini gagal alih-alih diam-diam berhenti menguji apa pun.
//
//   Database TIDAK pernah disentuh: tidak ada satu pun impor ke `_lib/db`, jadi
//   pagar `_lib/db/test-guard.ts` tidak punya apa pun untuk dicatat.
// ==========================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { requestMock } = vi.hoisted(() => ({
  requestMock: vi.fn(),
}));

// Sebarkan modul asli supaya `HttpError` / `TimeoutError` / `BUDGETS` tetap
// nyata (dipakai sebagai nilai balik/lemparan di tes ini).
vi.mock('./http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./http')>();
  return { ...actual, request: requestMock };
});

import { jobSignal } from './job-signal';
import { HttpError, TimeoutError } from './http';

const BASE = 'https://asj-test.upstash.io';
const KEY_NEXT = 'asj:job:next';

// ── Fake Redis ───────────────────────────────────────────────────────────────

const store = new Map<string, string>();

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

/**
 * Menjalankan perintah yang dikirim klien dengan semantik yang sama seperti
 * skrip Lua di `job-signal.ts`. Sengaja sederhana: hanya tiga skrip + `SET NX`.
 */
function fakeRedis(url: string, init: { method?: string; body?: unknown } = {}): Response {
  const path = new URL(url).pathname;

  // Lease: POST /set/<key>/1/NX/EX/<ttl>
  if (path.startsWith('/set/')) {
    const parts = path.split('/'); // ['', 'set', key, value, 'NX', 'EX', ttl]
    const key = parts[2];
    const value = parts[3];
    if (parts[4] === 'NX' && store.has(key)) return jsonResponse({ result: null });
    store.set(key, value);
    return jsonResponse({ result: 'OK' });
  }

  const cmd = JSON.parse(String(init.body)) as string[];
  expect(cmd[0]).toBe('EVAL');
  const script = String(cmd[1]);
  const numkeys = Number(cmd[2]);
  const keys = cmd.slice(3, 3 + numkeys);
  const argv = cmd.slice(3 + numkeys);
  const key = keys[0];

  if (script.includes('-- asj:gate')) {
    const v = store.get(key);
    if (v === undefined) return jsonResponse({ result: [-1, ''] });
    const code = Number(v) > Number(argv[0]) ? 0 : 1;
    return jsonResponse({ result: [code, v] });
  }

  if (script.includes('-- asj:announce')) {
    const v = store.get(key);
    if (v === undefined || Number(v) > Number(argv[0])) {
      store.set(key, String(argv[0]));
      return jsonResponse({ result: 1 });
    }
    return jsonResponse({ result: 0 });
  }

  if (script.includes('-- asj:settle')) {
    const v = store.get(key);
    const expected = String(argv[0]);
    if (v === undefined) {
      // ARGV[1] == '' berarti "kunci harus absen" ⇒ bangun ulang.
      if (expected === '') {
        store.set(key, String(argv[1]));
        return jsonResponse({ result: 1 });
      }
      // Seseorang membuatnya di antara peek dan settle: nilai lebih kecil menang.
      return jsonResponse({ result: 0 });
    }
    if (expected !== '' && Number(v) === Number(expected)) {
      store.set(key, String(argv[1]));
      return jsonResponse({ result: 1 });
    }
    return jsonResponse({ result: 0 });
  }

  throw new Error(`fakeRedis: skrip tak dikenal (${script.slice(0, 32)}…)`);
}

beforeEach(() => {
  store.clear();
  requestMock.mockReset();
  requestMock.mockImplementation(fakeRedis);
  process.env.UPSTASH_REDIS_REST_URL = BASE;
  process.env.UPSTASH_REDIS_REST_TOKEN = 'token-uji';
  process.env.JOB_SIGNAL_MODE = 'on';
});

afterEach(() => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.JOB_SIGNAL_MODE;
});

// ── 1. Null object = kill switch ─────────────────────────────────────────────

describe('jobSignal — null object saat gerbang dimatikan', () => {
  it("mode 'off' ⇒ semua metode netral dan TIDAK ada perintah Redis", async () => {
    process.env.JOB_SIGNAL_MODE = 'off';
    const s = jobSignal();

    expect(await s.peek(Date.now())).toBe('unknown');
    expect(await s.announce(Date.now())).toBe(true);
    expect(await s.settle(1_000, 2_000)).toBe(true);
    // lease true = cleanup jalan tiap sweep, persis perilaku hari ini.
    expect(await s.lease('cleanup')).toBe(true);
    expect(await s.lease('reconcile')).toBe(true);
    expect(s.observed).toBeNull();

    expect(requestMock).not.toHaveBeenCalled();
  });

  it('JOB_SIGNAL_MODE tidak diisi ⇒ default off', async () => {
    delete process.env.JOB_SIGNAL_MODE;
    const s = jobSignal();
    expect(await s.peek(Date.now())).toBe('unknown');
    expect(await s.lease('cleanup')).toBe(true);
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("nilai mode tak dikenal ⇒ off (salah ketik tidak boleh menyalakan gerbang)", async () => {
    process.env.JOB_SIGNAL_MODE = 'ON!';
    const s = jobSignal();
    expect(await s.peek(Date.now())).toBe('unknown');
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("mode 'on' tetapi env Upstash kosong ⇒ null object (deploy tanpa Redis tetap jalan)", async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    const s = jobSignal();

    expect(await s.peek(Date.now())).toBe('unknown');
    expect(await s.announce(Date.now())).toBe(true);
    expect(await s.settle(1, null)).toBe(true);
    expect(await s.lease('cleanup')).toBe(true);
    expect(requestMock).not.toHaveBeenCalled();
  });
});

// ── 2. peek: pemetaan jawaban ────────────────────────────────────────────────

describe('peek — memetakan jawaban Redis ke Verdict', () => {
  it('200 / nilai masa depan ⇒ idle, dan nilai mentahnya tersimpan', async () => {
    const now = 1_700_000_000_000;
    store.set(KEY_NEXT, String(now + 60_000));

    const s = jobSignal();
    expect(await s.peek(now)).toBe('idle');
    expect(s.observed).toBe(now + 60_000);
  });

  it('200 / nilai sudah lewat ⇒ due', async () => {
    const now = 1_700_000_000_000;
    store.set(KEY_NEXT, String(now - 1));

    const s = jobSignal();
    expect(await s.peek(now)).toBe('due');
    expect(s.observed).toBe(now - 1);
  });

  it('200 / nilai sama dengan now ⇒ due (batas inklusif)', async () => {
    const now = 1_700_000_000_000;
    store.set(KEY_NEXT, String(now));
    expect(await jobSignal().peek(now)).toBe('due');
  });

  it('kunci tidak ada ⇒ unknown, dan TIDAK ada nilai observed', async () => {
    const s = jobSignal();
    expect(await s.peek(1_700_000_000_000)).toBe('unknown');
    expect(s.observed).toBeNull();
  });

  it('timeout ⇒ unknown (tidak melempar)', async () => {
    requestMock.mockRejectedValue(new TimeoutError(BASE, 300));
    const s = jobSignal();
    await expect(s.peek(1)).resolves.toBe('unknown');
    expect(s.observed).toBeNull();
  });

  it('non-2xx ⇒ unknown (tidak melempar)', async () => {
    requestMock.mockRejectedValue(new HttpError(`HTTP 500 ${BASE}`, 500));
    const s = jobSignal();
    await expect(s.peek(1)).resolves.toBe('unknown');
  });

  it('error jaringan generik ⇒ unknown', async () => {
    requestMock.mockRejectedValue(new Error('ECONNRESET'));
    await expect(jobSignal().peek(1)).resolves.toBe('unknown');
  });

  it('balasan berbentuk error di dalam 200 ⇒ unknown', async () => {
    requestMock.mockResolvedValue(jsonResponse({ error: 'WRONGTYPE' }));
    await expect(jobSignal().peek(1)).resolves.toBe('unknown');
  });

  it('memakai kunci dan perintah yang benar: EVAL … 1 asj:job:next <now>', async () => {
    store.set(KEY_NEXT, '5');
    await jobSignal().peek(9);

    const [url, init] = requestMock.mock.calls[0] as [string, { body: string }];
    expect(url).toBe(BASE);
    const cmd = JSON.parse(init.body) as string[];
    expect(cmd[0]).toBe('EVAL');
    expect(cmd[2]).toBe('1');
    expect(cmd[3]).toBe(KEY_NEXT);
    expect(cmd[4]).toBe('9');
  });
});

// ── 3. announce: hanya menurunkan ────────────────────────────────────────────

describe('announce — hanya menurunkan (min), tidak pernah menaikkan', () => {
  it('nilai lebih kecil menang', async () => {
    const s = jobSignal();
    expect(await s.announce(1_000)).toBe(true);
    expect(await s.announce(2_000)).toBe(true); // lebih besar: tidak boleh menimpa
    expect(store.get(KEY_NEXT)).toBe('1000');
  });

  it('nilai lebih kecil berikutnya menurunkan gerbang', async () => {
    const s = jobSignal();
    await s.announce(2_000);
    await s.announce(1_000);
    expect(store.get(KEY_NEXT)).toBe('1000');
  });

  it('kegagalan Redis ⇒ false, tidak melempar', async () => {
    requestMock.mockRejectedValue(new TimeoutError(BASE, 300));
    await expect(jobSignal().announce(1)).resolves.toBe(false);
  });
});

// ── 4. settle: CAS ketat ─────────────────────────────────────────────────────

describe('settle — CAS ketat terhadap nilai yang dibaca', () => {
  it('menulis bila nilai tersimpan masih persis expected', async () => {
    store.set(KEY_NEXT, '1000');
    const s = jobSignal();
    expect(await s.settle(1_000, 5_000)).toBe(true);
    expect(store.get(KEY_NEXT)).toBe('5000');
  });

  it('MENOLAK bila nilai tersimpan sudah berubah (enqueue menurunkannya di tengah pass)', async () => {
    store.set(KEY_NEXT, '500'); // enqueue menurunkan gerbang setelah peek
    const s = jobSignal();
    expect(await s.settle(1_000, 5_000)).toBe(false);
    expect(store.get(KEY_NEXT)).toBe('500'); // nilai lebih kecil menang
  });

  // ── Operand CAS `null` = "kunci harus absen" ⇒ BANGUN ULANG ────────────────
  //
  // Ini bukan kasus tepi: kunci hilang karena eviction / restart Redis / sweep
  // pertama, dan tanpa cabang ini `peek()` selamanya 'unknown' sehingga setiap
  // sweep membayar jalur Neon penuh — biaya yang justru ingin dihapus.

  it('kunci ABSEN + expected null ⇒ MENULIS (bangun ulang, satu sweep)', async () => {
    const s = jobSignal();
    expect(await s.settle(null, 5_000)).toBe(true);
    expect(store.get(KEY_NEXT)).toBe('5000');
  });

  it('kunci ABSEN + expected null + next null ⇒ sentinel jauh tetap ditulis', async () => {
    const before = Date.now();
    expect(await jobSignal().settle(null, null)).toBe(true);

    const stored = Number(store.get(KEY_NEXT));
    const setahun = 365 * 86_400_000;
    expect(stored).toBeGreaterThanOrEqual(before + setahun);
    expect(stored).toBeLessThanOrEqual(Date.now() + setahun);
  });

  it('kunci ABSEN + expected angka ⇒ TIDAK menulis (seseorang membuatnya lebih dulu)', async () => {
    // Kunci dibuat di antara peek dan settle: nilai yang lebih kecil menang,
    // jadi CAS terhadap angka yang sudah tidak ada tidak boleh menimpa apa pun.
    const s = jobSignal();
    expect(await s.settle(1_000, 5_000)).toBe(false);
    expect(store.has(KEY_NEXT)).toBe(false);
  });

  it('kunci ADA + expected null ⇒ TIDAK menulis (kunci tidak absen seperti dugaan)', async () => {
    store.set(KEY_NEXT, '1000');
    expect(await jobSignal().settle(null, 5_000)).toBe(false);
    expect(store.get(KEY_NEXT)).toBe('1000');
  });

  it('operand null dikirim ke Redis sebagai string kosong, bukan "null"', async () => {
    store.set(KEY_NEXT, '1000');
    await jobSignal().settle(null, 5_000);

    const [, init] = requestMock.mock.calls[0] as [string, { body: string }];
    const cmd = JSON.parse(init.body) as string[];
    // EVAL <skrip> 1 asj:job:next <expected> <next>
    expect(cmd[4]).toBe('');
    expect(cmd[5]).toBe('5000');
  });

  it('next === null ⇒ sentinel jauh (kosong, jangan lihat lagi)', async () => {
    store.set(KEY_NEXT, '1000');
    const before = Date.now();
    expect(await jobSignal().settle(1_000, null)).toBe(true);

    const stored = Number(store.get(KEY_NEXT));
    const setahun = 365 * 86_400_000;
    expect(stored).toBeGreaterThanOrEqual(before + setahun);
    expect(stored).toBeLessThanOrEqual(Date.now() + setahun);
  });

  it('expected bukan angka ⇒ false tanpa menyentuh Redis', async () => {
    expect(await jobSignal().settle(Number.NaN, 5)).toBe(false);
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('kegagalan Redis ⇒ false, tidak melempar', async () => {
    requestMock.mockRejectedValue(new HttpError('HTTP 503', 503));
    await expect(jobSignal().settle(1, 2)).resolves.toBe(false);
  });
});

// ── 5. lease ─────────────────────────────────────────────────────────────────

describe('lease — sekali pakai per 6 jam', () => {
  it('pemegang pertama true, pemegang berikutnya false', async () => {
    const s = jobSignal();
    expect(await s.lease('cleanup')).toBe(true);
    expect(await s.lease('cleanup')).toBe(false);
  });

  it('cleanup dan reconcile punya kunci terpisah', async () => {
    const s = jobSignal();
    expect(await s.lease('cleanup')).toBe(true);
    expect(await s.lease('reconcile')).toBe(true);
    expect(store.has('asj:job:lease:cleanup')).toBe(true);
    expect(store.has('asj:job:lease:reconcile')).toBe(true);
  });

  it('memakai bentuk URL SET NX EX 21600 yang didokumentasikan', async () => {
    await jobSignal().lease('cleanup');
    const [url] = requestMock.mock.calls[0] as [string];
    expect(url).toBe(`${BASE}/set/asj:job:lease:cleanup/1/NX/EX/21600`);
  });

  it('kegagalan Redis ⇒ false (jangan menjalankan tugasnya)', async () => {
    requestMock.mockRejectedValue(new TimeoutError(BASE, 300));
    await expect(jobSignal().lease('reconcile')).resolves.toBe(false);
  });
});

// ── 6. Penjaga: skrip Lua masih membawa penanda & semantiknya ────────────────

describe('skrip Lua — penanda dan semantik yang diuji di atas', () => {
  /** Ambil teks skrip dari perintah EVAL yang dikirim klien. */
  async function scriptUntuk(jalankan: (s: ReturnType<typeof jobSignal>) => Promise<unknown>) {
    store.set(KEY_NEXT, '1');
    requestMock.mockClear();
    await jalankan(jobSignal());
    const body = (requestMock.mock.calls[0] as [string, { body: string }])[1].body;
    return String((JSON.parse(body) as string[])[1]);
  }

  it('gate: membandingkan nilai tersimpan dengan now', async () => {
    const s = await scriptUntuk((sig) => sig.peek(2));
    expect(s.startsWith('-- asj:gate')).toBe(true);
    expect(s).toContain("tonumber(v) > tonumber(ARGV[1])");
    expect(s).toContain("redis.call('GET', KEYS[1])");
  });

  it('announce: hanya menulis bila kunci kosong atau nilainya lebih besar', async () => {
    const s = await scriptUntuk((sig) => sig.announce(2));
    expect(s.startsWith('-- asj:announce')).toBe(true);
    expect(s).toContain('(not v) or tonumber(v) > tonumber(ARGV[1])');
  });

  it('settle: perbandingan KETAT (==), bukan ambang', async () => {
    const s = await scriptUntuk((sig) => sig.settle(1, 2));
    expect(s.startsWith('-- asj:settle')).toBe(true);
    expect(s).toContain('tonumber(v) == tonumber(ARGV[1])');
  });

  it("settle: punya cabang 'kunci absen' yang menulis (bangun ulang setelah eviction)", async () => {
    // Kalau cabang ini hilang, `settle()` tidak akan pernah menulis saat kunci
    // tidak ada — bug yang membuat gerbang terjebak 'unknown' selamanya.
    const s = await scriptUntuk((sig) => sig.settle(null, 2));
    expect(s.startsWith('-- asj:settle')).toBe(true);
    expect(s).toContain("if not v then");
    expect(s).toContain("ARGV[1] == ''");
  });
});
