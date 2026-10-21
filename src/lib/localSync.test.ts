// ==========================================
// TESTS: localStore + localSync — mirror IndexedDB & mesin local-first
//
// jsdom 30 tidak punya IndexedDB, jadi semua tes memakai backend memori yang
// diekspor `localStore.ts` sendiri. Itu bukan jalan pintas: batas "peramban
// tanpa IndexedDB" adalah jalur yang HARUS bekerja, dan backend memori adalah
// implementasi yang sama persis yang dipakai di sana.
//
// Yang dipaku di sini adalah keputusan yang rusaknya TIDAK terlihat:
//
//   1. PENGHAPUSAN butuh jumlah SETELAH delta. Satu hapus + satu tambah
//      menghasilkan jumlah yang sama kalau dibandingkan sebelum delta.
//   2. WATERMARK = baris TERAKHIR yang dikirim, bukan waktu server — kalau
//      jawaban dipotong limit, waktu server melompati baris yang belum terkirim.
//   3. GANTI AKUN tidak boleh menyajikan baris sesi sebelumnya.
//   4. Delta gagal tidak boleh menggeser watermark: baris yang belum terkirim
//      harus terkirim di percobaan berikutnya.
// ==========================================
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMemoryBackend, LocalTable, entryKey, tableOf, keyOfEntry, openLocalTable } from './localStore';
import { localFirst, type SyncTransport } from './localSync';

type Row = { code_job: string; updated_at: string };

function transport(over: Partial<SyncTransport<Row>> = {}): SyncTransport<Row> {
  const base: SyncTransport<Row> = {
    table: 'jobs',
    probe: vi.fn(async () => ({ success: true, tables: { jobs: { count: 0, watermark: null } } })),
    delta: vi.fn(async () => ({ success: true, rows: [], more: false })),
    manifest: vi.fn(async () => ({ success: true, manifest: [] })),
    full: vi.fn(async () => [] as Row[]),
    keyOf: (r) => String(r.code_job),
  };
  return { ...base, ...over };
}

/** Mirror + satu baris awal, siap dipakai tes delta. */
async function seeded(owner = 's1', rows: Row[] = [], watermark: string | null = null) {
  const t = new LocalTable(createMemoryBackend(), 'jobs', owner);
  if (rows.length > 0) {
    await t.putMany(rows.map((r) => ({ key: r.code_job, row: r, updatedAt: r.updated_at })));
  }
  await t.setWatermark(watermark);
  return t;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('LocalTable — kunci & kepemilikan', () => {
  it('kunci mirror memisahkan tabel, dan bisa dibalik jadi kunci baris', () => {
    expect(entryKey('jobs', 'TG1')).toBe('jobs\u001fTG1');
    expect(tableOf('jobs\u001fTG1')).toBe('jobs');
    expect(keyOfEntry('jobs\u001fTG1')).toBe('TG1');
  });

  it('dua tabel dengan kunci baris sama tidak saling menimpa', async () => {
    const b = createMemoryBackend();
    const jobs = new LocalTable(b, 'jobs', 's');
    const cand = new LocalTable(b, 'candidates', 's');
    await jobs.putMany([{ key: 'K', row: { code_job: 'K' }, updatedAt: null }]);
    await cand.putMany([{ key: 'K', row: { id_kandidat: 'K' }, updatedAt: null }]);
    expect((await jobs.all())[0].row).toEqual({ code_job: 'K' });
    expect((await cand.all())[0].row).toEqual({ id_kandidat: 'K' });
  });

  it('ganti owner mengosongkan store — baris sesi lain TIDAK pernah terlihat', async () => {
    const b = createMemoryBackend();
    const first = new LocalTable(b, 'jobs', 's1');
    await first.putMany([{ key: 'A', row: { code_job: 'A' }, updatedAt: 'w1' }]);
    await first.setWatermark('w1');

    const second = new LocalTable(b, 'jobs', 's2');
    expect(await second.all()).toEqual([]);
    await second.putMany([{ key: 'B', row: { code_job: 'B' }, updatedAt: 'w2' }]);

    // Pemilik pertama tidak ikut melihat baris pemilik kedua.
    const back = new LocalTable(b, 'jobs', 's1');
    expect(await back.all()).toEqual([]);
  });

  it('deleteKeys hanya menghapus kunci yang disebut, bukan seluruh tabel', async () => {
    const t = await seeded('s', [
      { code_job: 'A', updated_at: 'w' },
      { code_job: 'B', updated_at: 'w' },
      { code_job: 'C', updated_at: 'w' },
    ]);
    expect(await t.deleteKeys(['B'])).toBe(1);
    const keys = (await t.all()).map((e) => e.key).sort();
    expect(keys).toEqual(['A', 'C']);
  });

  it('openLocalTable tanpa backend memori mengembalikan null (bukan galat)', async () => {
    // jsdom tidak punya indexedDB, dan allowMemory tidak diminta.
    expect(await openLocalTable('jobs', 's')).toBeNull();
  });

  it('openLocalTable dengan allowMemory mengembalikan mirror volatile', async () => {
    const t = await openLocalTable('jobs', 's', { allowMemory: true });
    expect(t).not.toBeNull();
    expect(t?.durable).toBe(false);
  });
});

describe('localFirst — tarik penuh', () => {
  it('mirror kosong → full dipanggil, watermark dari PROBE (bukan dari baris)', async () => {
    const t = await seeded('s', []);
    const tr = transport({
      probe: vi.fn(async () => ({ success: true, tables: { jobs: { count: 3, watermark: 'W3' } } })),
      full: vi.fn(async () => [
        { code_job: 'A', updated_at: 'w1' },
        { code_job: 'B', updated_at: 'w2' },
      ]),
    });
    const r = await localFirst(t, tr);
    expect(r.rows.map((x) => x.code_job)).toEqual(['A', 'B']);
    expect(r.stats.source).toBe('network');
    // Bukan 'w2' (watermark baris terakhir yang DIBACA): kalau probe bilang W3,
    // menandai w2 akan mengulang tarikan berikutnya dari w2 — aman; menandai W3
    // akan menganggap tarikan penuh ini sudah memuat W3, padahal belum tentu.
    expect(await t.watermark()).toBe('W3');
  });

  it('full gagal dan mirror kosong → lempar (pemanggil punya UI galatnya)', async () => {
    const t = await seeded('s', []);
    const tr = transport({
      full: vi.fn(async () => {
        throw new Error('offline');
      }),
    });
    await expect(localFirst(t, tr)).rejects.toThrow('offline');
  });

  it('full gagal tetapi mirror ADA isi → sajikan mirror, bukan layar kosong', async () => {
    const t = await seeded('s', [{ code_job: 'A', updated_at: 'w1' }]);
    // Watermark sengaja dikosongkan supaya mesin memilih jalur tarik penuh.
    await t.setWatermark(null);
    const tr = transport({
      full: vi.fn(async () => {
        throw new Error('offline');
      }),
    });
    const r = await localFirst(t, tr);
    expect(r.rows.map((x) => x.code_job)).toEqual(['A']);
    expect(r.stats.source).toBe('local-offline');
  });
});

describe('localFirst — probe', () => {
  it('watermark & jumlah sama → TIDAK ada permintaan delta/manifest', async () => {
    const t = await seeded('s', [{ code_job: 'A', updated_at: 'w1' }], 'w1');
    const delta = vi.fn(async () => ({ success: true, rows: [] }));
    const manifest = vi.fn(async () => ({ success: true, manifest: [] }));
    const r = await localFirst(
      t,
      transport({
        probe: vi.fn(async () => ({ success: true, tables: { jobs: { count: 1, watermark: 'w1' } } })),
        delta,
        manifest,
      }),
    );
    expect(r.stats.source).toBe('local');
    expect(r.stats.probeUsed).toBe(true);
    expect(delta).not.toHaveBeenCalled();
    expect(manifest).not.toHaveBeenCalled();
  });

  it('probe gagal (jaringan mati) → mirror tetap disajikan, tanpa galat', async () => {
    const t = await seeded('s', [{ code_job: 'A', updated_at: 'w1' }], 'w1');
    const r = await localFirst(
      t,
      transport({
        probe: vi.fn(async () => {
          throw new Error('offline');
        }),
      }),
    );
    expect(r.rows.map((x) => x.code_job)).toEqual(['A']);
    expect(r.stats.source).toBe('local-offline');
    expect(r.stats.error).toContain('offline');
  });

  it('probe sukses tetapi tabel tidak ada di jawaban → jangan menebak', async () => {
    const t = await seeded('s', [{ code_job: 'A', updated_at: 'w1' }], 'w1');
    const r = await localFirst(
      t,
      transport({ probe: vi.fn(async () => ({ success: true, tables: {} })) }),
    );
    expect(r.rows.map((x) => x.code_job)).toEqual(['A']);
    expect(r.stats.deltaUsed).toBe(false);
    expect(r.stats.error).toContain('probe');
  });
});

describe('localFirst — delta', () => {
  it('delta menggeser watermark ke nextSince, dan baris baru masuk mirror', async () => {
    const t = await seeded('s', [{ code_job: 'A', updated_at: 'w1' }], 'w1');
    const r = await localFirst(
      t,
      transport({
        probe: vi.fn(async () => ({ success: true, tables: { jobs: { count: 2, watermark: 'w2' } } })),
        delta: vi.fn(async () => ({ success: true, rows: [{ code_job: 'B', updated_at: 'w2' }], nextSince: 'w2', more: false })),
      }),
    );
    expect(r.rows.map((x) => x.code_job).sort()).toEqual(['A', 'B']);
    expect(await t.watermark()).toBe('w2');
    expect(r.stats.manifestUsed).toBe(false);
  });

  it('more:true tidak di-loop — tarik penuh, dan watermark lama tidak digeser palsu', async () => {
    // 226 kandidat satu nilai updated_at (backfill migrasi 017). Kalau mesin
    // meng-loop halaman, halaman kedua sama dengan halaman pertama — selamanya.
    // Kalau watermark digeser ke halaman pertama, sisa baris TIDAK PERNAH
    // terkirim, dan count memang berbeda tapi manifest hanya menjawab kunci.
    const t = await seeded('s', [], 'w0');
    const full = vi.fn(async () => [
      { code_job: 'A', updated_at: 'w1' },
      { code_job: 'B', updated_at: 'w1' },
    ]);
    let deltaCalls = 0;
    const r = await localFirst(
      t,
      transport({
        probe: vi.fn(async () => ({ success: true, tables: { jobs: { count: 226, watermark: 'w2' } } })),
        delta: vi.fn(async () => {
          deltaCalls++;
          return { success: true, rows: [{ code_job: 'A', updated_at: 'w1' }], nextSince: 'w1', more: true };
        }),
        full,
      }),
    );
    expect(deltaCalls).toBe(1);
    expect(full).toHaveBeenCalledTimes(1);
    expect(r.rows.map((x) => x.code_job).sort()).toEqual(['A', 'B']);
    expect(r.stats.source).toBe('network');
    // Watermark dari probe pada tarik penuh, bukan dari halaman pertama.
    expect(await t.watermark()).toBe('w2');
  });

  it('nextSince = baris TERAKHIR yang dikirim, bukan waktu server', async () => {
    const t = await seeded('s', [{ code_job: 'A', updated_at: 'w1' }], 'w1');
    const serverNow = '2030-01-01T00:00:00Z';
    const r = await localFirst(
      t,
      transport({
        probe: vi.fn(async () => ({ success: true, tables: { jobs: { count: 2, watermark: serverNow } } })),
        delta: vi.fn(async () => ({
          success: true,
          rows: [{ code_job: 'B', updated_at: 'w2' }],
          nextSince: 'w2', // ← baris terakhir yang benar-benar terkirim
          more: false,
        })),
        manifest: vi.fn(async () => ({ success: true, manifest: [{ id: 'A', updatedAt: 'w1' }, { id: 'B', updatedAt: 'w2' }] })),
      }),
    );
    // Kalau watermark diisi dari probe (serverNow), baris antara w2 dan
    // serverNow tidak pernah terkirim dan hilang tanpa suara.
    expect(await t.watermark()).toBe('w2');
    expect(r.rows.map((x) => x.code_job).sort()).toEqual(['A', 'B']);
  });

  it('delta gagal: yang sudah masuk TERSIMPAN, watermark TIDAK maju', async () => {
    const t = await seeded('s', [{ code_job: 'A', updated_at: 'w1' }], 'w1');
    const r = await localFirst(
      t,
      transport({
        probe: vi.fn(async () => ({ success: true, tables: { jobs: { count: 3, watermark: 'w3' } } })),
        delta: vi.fn(async () => ({ success: false, error: 'koneksi putus' })),
      }),
    );
    expect(r.rows.map((x) => x.code_job)).toEqual(['A']);
    // Watermark tetap w1: kalau ia maju, percobaan berikutnya akan MELOMPATI
    // baris yang belum sempat terkirim.
    expect(await t.watermark()).toBe('w1');
    expect(r.stats.error).toContain('koneksi putus');
  });

  it('onLocal dipanggil dengan mirror SEBELUM probe; onUpdate setelah rekonsiliasi', async () => {
    const t = await seeded('s', [{ code_job: 'A', updated_at: 'w1' }], 'w1');
    const onLocal = vi.fn();
    const onUpdate = vi.fn();
    await localFirst(
      t,
      transport({
        probe: vi.fn(async () => ({ success: true, tables: { jobs: { count: 2, watermark: 'w2' } } })),
        delta: vi.fn(async () => ({ success: true, rows: [{ code_job: 'B', updated_at: 'w2' }], nextSince: 'w2' })),
      }),
      { onLocal, onUpdate },
    );
    expect(onLocal).toHaveBeenCalledTimes(1);
    expect(onLocal.mock.calls[0][0].map((x: Row) => x.code_job)).toEqual(['A']);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate.mock.calls[0][0].map((x: Row) => x.code_job).sort()).toEqual(['A', 'B']);
  });
});

describe('localFirst — penghapusan', () => {
  it('jumlah berbeda setelah delta → manifest ditarik, baris mati dibuang', async () => {
    const t = await seeded('s', [
      { code_job: 'A', updated_at: 'w1' },
      { code_job: 'B', updated_at: 'w1' },
    ], 'w1');
    const manifest = vi.fn(async () => ({ success: true, manifest: [{ id: 'A', updatedAt: 'w1' }] }));
    const r = await localFirst(
      t,
      transport({
        probe: vi.fn(async () => ({ success: true, tables: { jobs: { count: 1, watermark: 'w1' } } })),
        delta: vi.fn(async () => ({ success: true, rows: [], nextSince: 'w1' })),
        manifest,
      }),
    );
    expect(manifest).toHaveBeenCalledTimes(1);
    expect(r.rows.map((x) => x.code_job)).toEqual(['A']);
    expect(r.stats.deleted).toBe(1);
    // Mirror juga sudah dibersihkan — bukan hanya hasil di memori.
    expect((await t.all()).map((e) => e.key)).toEqual(['A']);
  });

  it('HAPUS + TAMBAH sekaligus: jumlah cocok SETELAH delta tidak menipu', async () => {
    // Local: A, B (2). Server: A, C (2). Delta membawa C. Kalau perbandingan
    // jumlah dilakukan SEBELUM delta (2 vs 2), B akan tinggal selamanya.
    const t = await seeded('s', [
      { code_job: 'A', updated_at: 'w1' },
      { code_job: 'B', updated_at: 'w1' },
    ], 'w1');
    const r = await localFirst(
      t,
      transport({
        probe: vi.fn(async () => ({ success: true, tables: { jobs: { count: 2, watermark: 'w2' } } })),
        delta: vi.fn(async () => ({ success: true, rows: [{ code_job: 'C', updated_at: 'w2' }], nextSince: 'w2' })),
        manifest: vi.fn(async () => ({ success: true, manifest: [{ id: 'A', updatedAt: 'w1' }, { id: 'C', updatedAt: 'w2' }] })),
      }),
    );
    expect(r.rows.map((x) => x.code_job).sort()).toEqual(['A', 'C']);
    expect(r.stats.deleted).toBe(1);
  });

  it('manifest gagal: mirror TIDAK dibersihkan berdasarkan jumlah saja', async () => {
    // Menghapus baris karena "jumlah tidak cocok" saat manifest gagal akan
    // membuang baris yang sebenarnya masih ada.
    const t = await seeded('s', [
      { code_job: 'A', updated_at: 'w1' },
      { code_job: 'B', updated_at: 'w1' },
    ], 'w1');
    const r = await localFirst(
      t,
      transport({
        probe: vi.fn(async () => ({ success: true, tables: { jobs: { count: 9, watermark: 'w1' } } })),
        delta: vi.fn(async () => ({ success: true, rows: [], nextSince: 'w1' })),
        manifest: vi.fn(async () => {
          throw new Error('manifest 500');
        }),
      }),
    );
    expect(r.rows.map((x) => x.code_job).sort()).toEqual(['A', 'B']);
    expect(r.stats.deleted).toBe(0);
    expect(r.stats.error).toContain('manifest 500');
  });
});
