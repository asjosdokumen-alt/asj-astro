/**
 * health.test.ts — Phase C item 12.
 *
 * The load-bearing assertions here are about what the report says when things
 * are FINE. A health endpoint is easy to write for the outage case (everything
 * red) and easy to get wrong for the normal case, because the naive
 * implementation enumerates only the records that exist — and a healthy
 * dependency has no record. That omission is exactly the regression this file
 * guards, so it is asserted directly rather than inferred.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildHealthReport, HEALTH_THRESHOLDS } from '../health';
import { breaker, DEPENDENCY_CONFIGS, bulkhead } from './resilience';

/**
 * Jam dan "jaringan" yang bisa dikendalikan, untuk menguji `probePostgrest`.
 *
 * Sampai 2026-10-27 probe itu tidak punya satu tes pun: seluruh berkas ini
 * memakai `includeShared: false`, jadi jalur yang menentukan status endpoint
 * `/health` tidak pernah dieksekusi. Yang bocor ke produksi karena itu:
 * `degraded` setiap kali health dipanggil setelah menganggur — sampel pertama
 * instance dingin membayar jabat tangan TLS (terukur 697 ms; delapan sampel
 * berurutan 697, 241, 222, 279, 215, 214, 214, 215), dan itulah satu-satunya
 * sampel yang melewati ambang 800 ms.
 *
 * `delays` = lama tiap panggilan PostgREST berturut-turut; `calls` = berapa
 * panggilan yang benar-benar terjadi (kontrol negatif: yang hangat TIDAK
 * boleh menambah kueri).
 */
const clock = vi.hoisted(() => ({ now: 0, delays: [] as number[], calls: 0 }));

vi.mock('../db/client', () => ({
  supabaseJson: async () => {
    clock.calls += 1;
    clock.now += clock.delays.length ? (clock.delays.shift() as number) : 10;
  },
  supabaseUrl: () => 'https://health.test',
  supabaseKey: () => 'test-key',
}));

// `probeQueue` memakai jalur mentah (HEAD + Prefer: count=exact), bukan
// supabaseJson. Tanpa mock ini queue terlihat tidak terbaca dan laporannya
// `degraded` apa pun hasil probe PostgREST — tesnya jadi tidak membedakan apa pun.
vi.mock('./http', () => ({
  request: async () => ({ ok: true, headers: { get: () => '0-0/0' } }),
}));

const KNOWN_DEPS = Object.keys(DEPENDENCY_CONFIGS).sort();

describe('buildHealthReport — normal operation', () => {
  beforeEach(() => {
    for (const dep of KNOWN_DEPS) breaker.reset(dep);
  });

  it('lists EVERY configured dependency even when all are healthy', async () => {
    const report = await buildHealthReport({ includeShared: false });
    const names = report.instance.dependencies.map((d) => d.name).sort();
    expect(names).toEqual(KNOWN_DEPS);
  });

  it('reports healthy dependencies as closed with zero failures, not as missing', async () => {
    const report = await buildHealthReport({ includeShared: false });
    for (const dep of report.instance.dependencies) {
      expect(dep.breaker.state, `${dep.name} should be closed`).toBe('closed');
      expect(dep.breaker.failures).toBe(0);
      expect(dep.breaker.openForMs).toBe(0);
    }
  });

  it('carries each dependency\'s configured threshold, not a global default', async () => {
    const report = await buildHealthReport({ includeShared: false });
    const byName = Object.fromEntries(report.instance.dependencies.map((d) => [d.name, d]));
    // These differ per dependency in DEPENDENCY_CONFIGS; a reader must be able
    // to see that gemini opens at 3 while fcm opens at 10.
    expect(byName.gemini.threshold).toBe(3);
    expect(byName.fcm.threshold).toBe(10);
    expect(byName.postgrest.threshold).toBe(5);
  });

  it('says so explicitly in `reasons` when nothing is wrong', async () => {
    const report = await buildHealthReport({ includeShared: false });
    expect(report.reasons).toEqual(['all dependencies healthy']);
    expect(report.levels).toEqual([]);
    expect(report.status).toBe('ok');
  });

  it('skips the database probes entirely when includeShared is false', async () => {
    const report = await buildHealthReport({ includeShared: false });
    // No network was attempted, so the shared half must not claim reachability.
    expect(report.shared.postgrest.reachable).toBe(false);
    expect(report.shared.postgrest.latencyMs).toBeNull();
    expect(report.shared.jobQueue.depth).toBeNull();
  });
});

describe('buildHealthReport — a failing dependency', () => {
  beforeEach(() => {
    for (const dep of KNOWN_DEPS) breaker.reset(dep);
  });

  it('shows `open` and a non-zero openForMs once the breaker trips', async () => {
    // Trip the gemini breaker (threshold 3).
    for (let i = 0; i < 3; i++) breaker.failure('gemini');

    const report = await buildHealthReport({ includeShared: false });
    const gemini = report.instance.dependencies.find((d) => d.name === 'gemini')!;
    expect(gemini.breaker.state).toBe('open');
    expect(gemini.breaker.failures).toBe(3);
    expect(gemini.breaker.openForMs).toBeGreaterThanOrEqual(0);
    expect(report.instance.breakersOpen).toBe(1);
  });

  it('names the dependency in `reasons` — the reader must not have to infer it', async () => {
    for (let i = 0; i < 3; i++) breaker.failure('gemini');
    const report = await buildHealthReport({ includeShared: false });
    expect(report.reasons.join(' ')).toContain('gemini');
    expect(report.status).toBe('degraded');
  });

  it('escalates to `down` once a breaker has been open past the alert threshold', async () => {
    for (let i = 0; i < 3; i++) breaker.failure('gemini');
    // Backdate the open time rather than sleeping 2 minutes.
    const snap = breaker.snapshot();
    expect(snap.gemini.state).toBe('open');
    const rec = (breaker as unknown as { records: Map<string, { openedAt: number }> }).records.get('gemini')!;
    rec.openedAt = Date.now() - HEALTH_THRESHOLDS.breakerOpenMs - 1_000;

    const report = await buildHealthReport({ includeShared: false });
    expect(report.levels).toContain('fail');
    expect(report.status).toBe('down');
    expect(report.reasons.join(' ')).toContain('alert threshold');
  });

  it('keeps every healthy dependency visible alongside the broken one', async () => {
    for (let i = 0; i < 3; i++) breaker.failure('fonnte');
    const report = await buildHealthReport({ includeShared: false });
    const names = report.instance.dependencies.map((d) => d.name).sort();
    expect(names).toEqual(KNOWN_DEPS);
    const postgrest = report.instance.dependencies.find((d) => d.name === 'postgrest')!;
    expect(postgrest.breaker.state).toBe('closed');
  });
});

describe('buildHealthReport — bulkhead saturation', () => {
  beforeEach(() => {
    for (const dep of KNOWN_DEPS) breaker.reset(dep);
  });

  it('flags `degraded` when a dependency is at three quarters of its cap', async () => {
    const max = bulkhead.snapshot().maxConcurrent;
    const releases: Array<() => void> = [];
    // We cannot easily know the live count, so drive it up to the warn ratio.
    const target = Math.ceil(max * HEALTH_THRESHOLDS.bulkheadWarnRatio);
    for (let i = 0; i < target; i++) releases.push(await bulkhead.acquire('storage'));

    const report = await buildHealthReport({ includeShared: false });
    const storage = report.instance.dependencies.find((d) => d.name === 'storage')!;
    expect(storage.inflight).toBe(target);
    expect(report.levels).toContain('warn');
    expect(report.reasons.join(' ')).toContain('storage');

    for (const r of releases) r();
  });
});

describe('HEALTH_THRESHOLDS', () => {
  it('matches the §7.2 alert figures it claims to mirror', () => {
    // These are the documented alert thresholds. If the doc changes, the
    // endpoint and the runbook must change with it — pin both here so a
    // silent divergence fails the suite instead of the incident.
    expect(HEALTH_THRESHOLDS.breakerOpenMs).toBe(120_000);
    expect(HEALTH_THRESHOLDS.queueDepth).toBe(100);
    expect(HEALTH_THRESHOLDS.deadLetter).toBe(0);
  });
});

describe('probePostgrest — sampel dingin vs sampel hangat', () => {
  let realNow: typeof Date.now;

  beforeEach(() => {
    for (const dep of KNOWN_DEPS) breaker.reset(dep);
    clock.now = 0;
    clock.delays = [];
    clock.calls = 0;
    realNow = Date.now;
    vi.spyOn(Date, 'now').mockImplementation(() => clock.now);
  });

  afterEach(() => {
    vi.spyOn(Date, 'now').mockRestore();
    Date.now = realNow;
  });

  it('sampel dingin yang lambat TIDAK sendirian menjadikan laporan degraded', async () => {
    // 900 ms lalu 40 ms = instance baru hidup, lalu permintaan kedua di
    // instance yang sama. Inilah yang dialami pengguna, dan dulu angka 900
    // itulah yang dilaporkan sebagai "PostgREST reachable but slow".
    clock.delays = [900, 40];
    const report = await buildHealthReport({ includeShared: true });

    expect(report.shared.postgrest.reachable).toBe(true);
    expect(report.shared.postgrest.latencyMs).toBe(40);
    expect(report.shared.postgrest.firstMs).toBe(900);
    expect(report.status).toBe('ok');
    expect(report.reasons.join(' ')).not.toContain('slow');
  });

  it('dua sampel yang sama-sama lambat TETAP degraded — DB lambat tidak dimaafkan', async () => {
    // Tanpa kasus ini, "ambil sampel kedua" sama saja dengan mematikan alarm.
    clock.delays = [900, 850];
    const report = await buildHealthReport({ includeShared: true });

    expect(report.shared.postgrest.latencyMs).toBe(850);
    expect(report.status).toBe('degraded');
    expect(report.reasons.join(' ')).toContain('two samples: 900ms then 850ms');
  });

  it('sampel pertama yang sudah cepat memakai PERSIS satu kueri', async () => {
    // Kontrol negatif untuk biaya: endpoint health boleh dipanggil tiap menit,
    // jadi sampel kedua tidak boleh menjadi harga tetap.
    clock.delays = [40];
    const report = await buildHealthReport({ includeShared: true });

    expect(report.shared.postgrest.latencyMs).toBe(40);
    expect(report.shared.postgrest.firstMs).toBeUndefined();
    expect(clock.calls).toBe(1);
  });
});
