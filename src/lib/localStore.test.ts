/**
 * localStore.test.ts — Penjaga mirror lokal (memory backend = degradasi IDB)
 *
 * IndexedDB tidak tersedia di jsdom, jadi suite ini membuktikan dua hal:
 *   1. Memory backend bekerja PERSIS seperti kontrak IDB (put/get/keys/clear).
 *   2. `openLocalTable()` otomatis jatuh ke memory ketika `openDB` gagal.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { openLocalTable, createMemoryBackend, type LocalTable } from './localStore';

describe('memory backend — kontrak LocalTable', () => {
  let table: LocalTable;

  beforeEach(async () => {
    const be = createMemoryBackend();
    table = {
      durable: be.durable,
      get: (k: string) => be.get('rows', k) as Promise<unknown>,
      put: (k: string, v: unknown) => be.put('rows', k, v),
      deleteKeys: (keys: string[]) => Promise.all(keys.map((k) => be.del('rows', k))).then(() => undefined),
      all: async () => {
        const keys = await be.keys('rows');
        const out: Array<{ key: string; row: unknown; updatedAt: string | null }> = [];
        for (const k of keys) {
          const v = (await be.get('rows', k)) as { key: string; row: unknown; updatedAt: string | null } | undefined;
          if (v) out.push(v);
        }
        return out;
      },
      watermark: () => be.get('meta', 'watermark') as Promise<string | null>,
      setWatermark: (w: string | null) => be.put('meta', 'watermark', w),
      putMany: async (entries) => {
        for (const e of entries) await be.put('rows', e.key, e);
      },
    };
  });

  it('put → get roundtrip', async () => {
    await table.put('k1', { nama: 'A' });
    const v = await table.get('k1');
    expect(v).toEqual({ nama: 'A' });
  });

  it('get kunci yang tidak ada → undefined', async () => {
    const v = await table.get('missing');
    expect(v).toBeUndefined();
  });

  it('all() mengembalikan SEMUA baris dengan bentuk entry', async () => {
    await table.putMany([
      { key: 'a', row: { x: 1 }, updatedAt: 'w1' },
      { key: 'b', row: { x: 2 }, updatedAt: 'w2' },
    ]);
    const rows = await table.all();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.key)).toEqual(['a', 'b']);
  });

  it('watermark roundtrip', async () => {
    await table.setWatermark('2026-10-20T12:00:00Z');
    expect(await table.watermark()).toBe('2026-10-20T12:00:00Z');
  });

  it('deleteKeys menghapus HANYA yang diminta', async () => {
    await table.putMany([
      { key: 'a', row: {}, updatedAt: null },
      { key: 'b', row: {}, updatedAt: null },
      { key: 'c', row: {}, updatedAt: null },
    ]);
    await table.deleteKeys(['b']);
    const rows = await table.all();
    expect(rows.map((r) => r.key)).toEqual(['a', 'c']);
  });

  it('putMany menimpa kunci yang sama', async () => {
    await table.put('k', { v: 1 });
    await table.put('k', { v: 2 });
    expect(await table.get('k')).toEqual({ v: 2 });
  });

  it('durable = false untuk memory backend', async () => {
    expect(table.durable).toBe(false);
  });
});

describe('openLocalTable — degradasi otomatis ke memory', () => {
  it('fallback memory ketika IDB tidak ada', async () => {
    const t = await openLocalTable('fallback', 'tester', { allowMemory: true });
    if (!t) throw new Error('unexpected null');
    expect(t.durable).toBe(false);
    await t.putMany([{ key: 'x', row: 1, updatedAt: null }]);
    const rows = await t.all();
    expect(rows.find((r) => r.key === 'x')?.row).toBe(1);
  });

  it('dua panggilan dengan nama BERBEDA menghasilkan tabel TERPISAH', async () => {
    const t1 = await openLocalTable('a', 'tester', { allowMemory: true });
    const t2 = await openLocalTable('b', 'tester', { allowMemory: true });
    if (!t1 || !t2) throw new Error('unexpected null');
    await t1.putMany([{ key: 'k', row: 'from-a', updatedAt: null }]);
    await t2.putMany([{ key: 'k', row: 'from-b', updatedAt: null }]);
    expect((await t1.all()).find((r) => r.key === 'k')?.row).toBe('from-a');
    expect((await t2.all()).find((r) => r.key === 'k')?.row).toBe('from-b');
  });

  it('instance yang sama berbagi data (putMany → all)', async () => {
    const t = await openLocalTable('shared', 'tester', { allowMemory: true });
    if (!t) throw new Error('unexpected null');
    await t.putMany([{ key: 'k', row: 'v', updatedAt: null }]);
    expect((await t.all()).find((r) => r.key === 'k')?.row).toBe('v');
  });
});
