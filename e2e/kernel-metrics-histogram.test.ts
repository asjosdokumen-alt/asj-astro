// ==========================================
// TESTS: kernel/metrics — histogram, label, dan durasi yang sudah diukur.
//
// KENAPA DI `e2e/`: lihat catatan panjang di `e2e/ai-cv-submit.test.ts` — tier
// `e2e` hanya menghitung mjs/cjs/js (`indexer/src/util.ts` `includePath()`),
// jadi suite `.ts` di sini tidak memindahkan counter beku yang hanya boleh
// di-baseline ulang oleh team-lead. Preseden: `e2e/share-data.test.ts`.
//
// Tiga cacat yang saling menutupi, semuanya di jalur observabilitas yang
// SEOLAH-OLAH sudah beres:
//
//   1. `metricsSnapshot()` mengelompokkan histogram dengan NAMA SAJA dan
//      membuang labelnya — padahal `increment()` sudah lama memasukkan label ke
//      dalam kunci untuk counter. Akibatnya kunci yang DIDOKUMENTASIKAN
//      (`handler.latency.action=getAppData` di docs/PHASE_C_SINK_SETUP.md:29
//      dan otlp.test.ts:40; `dependency.call.latency{dep}` di
//      metrics-receiver.ts:30) tidak akan pernah muncul di payload.
//   2. `recordDependencyCall()` menerima `durationMs` tetapi memanggil
//      `histogram()` — yang MEMULAI timer baru dan hanya mencatat kalau stop-nya
//      dipanggil — lalu stop itu dibuang. Jadi nol sampel, selamanya.
//   3. Karena (2), `durationMs` satu-satunya jejaknya adalah baris log.
//
// Diuji langsung di sini karena inilah satu-satunya tempat ketiganya bisa
// dibedakan: dari luar, "tidak ada data" dan "ada data tapi salah kunci"
// terlihat sama.
// ==========================================
import { describe, it, expect, beforeEach } from 'vitest';
import {
  flushMetrics,
  histogram,
  metricsSnapshot,
  observe,
  recordDependencyCall,
} from '../netlify/functions/_lib/kernel/metrics';

beforeEach(() => {
  // `flushMetrics()` mengosongkan koleksi dan tidak menyentuh jaringan.
  flushMetrics();
});

describe('histogram — label harus masuk ke KUNCI, sama seperti counter', () => {
  it('kunci memakai bentuk `nama.k=v` yang sudah didokumentasikan', () => {
    const stop = histogram('handler.latency', { action: 'getAppData' });
    stop();

    const snap = metricsSnapshot();
    // Bentuk inilah yang dipakai docs/PHASE_C_SINK_SETUP.md:29 dan
    // otlp.test.ts:40. Sebelumnya labelnya dibuang dan kuncinya `handler.latency`.
    expect(snap.histograms['handler.latency.action=getAppData']).toBeDefined();
    expect(snap.histograms['handler.latency']).toBeUndefined();
  });

  it('dua label berbeda tidak saling mencampur', () => {
    histogram('handler.latency', { action: 'a' })();
    histogram('handler.latency', { action: 'b' })();

    const snap = metricsSnapshot();
    expect(snap.histograms['handler.latency.action=a'].count).toBe(1);
    expect(snap.histograms['handler.latency.action=b'].count).toBe(1);
  });

  it('histogram TANPA label tetap memakai namanya sendiri', () => {
    histogram('flush.lat')();
    // `health-snapshot.test.ts:125` bergantung pada bentuk ini.
    expect(metricsSnapshot().histograms['flush.lat']).toBeDefined();
  });
});

describe('recordDependencyCall — durasi yang DIBERIKAN harus dipakai', () => {
  it('mencatat durasi yang diberikan, bukan timer baru', () => {
    recordDependencyCall('postgrest', 'select', 2000, 812, 'success');

    const h = metricsSnapshot().histograms['dependency.call.latency.dep=postgrest'];
    // Dulu `histogram()` dipanggil dan stop-nya DIBUANG, jadi tidak ada satu pun
    // sampel yang pernah tercatat — dan `metrics-receiver.ts:30` mendokumentasikan
    // metrik ini sebagai bagian dari kontrak payload.
    expect(h).toBeDefined();
    expect(h.count).toBe(1);
    // Nilainya harus 812 (yang diukur pemanggil), bukan ~0 dari timer yang baru
    // dimulai — itulah bedanya "diperbaiki" dan "diperbaiki tapi salah".
    expect(h.max).toBe(812);
    expect(h.p50).toBe(812);
  });

  it('tetap mencatat counter outcome-nya', () => {
    recordDependencyCall('postgrest', 'select', 2000, 812, 'error');
    expect(metricsSnapshot().counters['dependency.call.dep=postgrest.outcome=error']).toBe(1);
  });

  it('beberapa dependency tidak saling mencampur', () => {
    recordDependencyCall('postgrest', 'select', 2000, 100, 'success');
    recordDependencyCall('gemini', 'chat', 4000, 900, 'success');

    const snap = metricsSnapshot();
    expect(snap.histograms['dependency.call.latency.dep=postgrest'].max).toBe(100);
    expect(snap.histograms['dependency.call.latency.dep=gemini'].max).toBe(900);
  });
});

describe('observe — mencatat durasi yang SUDAH diukur', () => {
  it('menerima durasi langsung, tanpa timer', () => {
    observe('ai.model.latency', 620, { model: 'gemini-3.5-flash-lite' });

    const h = metricsSnapshot().histograms['ai.model.latency.model=gemini-3.5-flash-lite'];
    expect(h).toBeDefined();
    expect(h.count).toBe(1);
    expect(h.p50).toBe(620);
  });

  it('durasi dibulatkan ke milidetik', () => {
    observe('ai.model.latency', 620.4, { model: 'x' });
    expect(metricsSnapshot().histograms['ai.model.latency.model=x'].max).toBe(620);
  });
});
