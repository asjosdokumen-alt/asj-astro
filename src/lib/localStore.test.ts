/**
 * localStore.test.ts — Penjaga mirror lokal (memory backend = degradasi IDB)
 *
 * IndexedDB tidak tersedia di jsdom, jadi suite ini membuktikan dua hal:
 *   1. `LocalTable` bekerja PERSIS seperti kontrak IDB (putMany/all/deleteKeys/
 *      watermark/clearTable) ketika backend-nya memori.
 *   2. `openLocalTable()` otomatis jatuh ke memory ketika `openDB` gagal.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * KENAPA TES INI DITULIS ULANG (2026-10-22)
 * ═════════════════════════════════════════════════════════════════════════════
 * Versi pertama membangun OBJEK LITERAL yang meniru `LocalTable` dari
 * `createMemoryBackend()`, lalu menguji objek itu. Buruk dua kali:
 *
 *   - `tsc` gagal 8 kali (`put`/`get` tidak ada di kelas asli; `deleteKeys`
 *     mengembalikan `number`, bukan `undefined`). Itu tidak terlihat saat
 *     `vitest` dijalankan karena vitest hanya MEMBUANG tipe — jadi tesnya
 *     "hijau" sambil tidak menguji satu baris pun dari `LocalTable`.
 *     `typecheck:ratchet` (baseline 0 error) yang menangkapnya.
 *   - kontrak yang benar-benar dipakai produksi tidak tersentuh sama sekali:
 *     `enforceOwner` (ganti akun harus membuang baris akun sebelumnya),
 *     `putMany`/`deleteKeys` yang mengembalikan JUMLAH, dan `clearTable`.
 *
 * Sekarang yang diuji adalah KELAS aslinya.
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { describe, it, expect } from 'vitest';
import { LocalTable, openLocalTable, createMemoryBackend } from './localStore';

describe('LocalTable + memory backend — kontrak mirror', () => {
  const make = (owner = 'tester') => new LocalTable(createMemoryBackend(), 'rows', owner);

  it('putMany → all roundtrip, dan mengembalikan JUMLAH baris', async () => {
    const t = make();
    const n = await t.putMany([{ key: 'k1', row: { nama: 'A' }, updatedAt: null }]);
    expect(n).toBe(1);
    const rows = await t.all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ key: 'k1', row: { nama: 'A' }, updatedAt: null });
  });

  it('tabel kosong → all() kosong (bukan null, bukan galat)', async () => {
    const t = make();
    expect(await t.all()).toEqual([]);
    expect(await t.watermark()).toBeNull();
  });

  it('putMany menimpa kunci yang sama — delta `gte` inklusif aman dikirim ulang', async () => {
    const t = make();
    await t.putMany([{ key: 'k', row: { v: 1 }, updatedAt: 'w1' }]);
    await t.putMany([{ key: 'k', row: { v: 2 }, updatedAt: 'w2' }]);
    const rows = await t.all();
    expect(rows).toHaveLength(1);
    expect(rows[0].row).toEqual({ v: 2 });
    expect(rows[0].updatedAt).toBe('w2');
  });

  it('deleteKeys menghapus HANYA yang diminta, dan mengembalikan jumlahnya', async () => {
    const t = make();
    await t.putMany([
      { key: 'a', row: {}, updatedAt: null },
      { key: 'b', row: {}, updatedAt: null },
      { key: 'c', row: {}, updatedAt: null },
    ]);
    expect(await t.deleteKeys(['b'])).toBe(1);
    expect((await t.all()).map((r) => r.key).sort()).toEqual(['a', 'c']);
  });

  it('watermark roundtrip; null MENGHAPUSnya, bukan menyimpan "null"', async () => {
    const t = make();
    await t.setWatermark('2026-10-20T12:00:00Z');
    expect(await t.watermark()).toBe('2026-10-20T12:00:00Z');
    await t.setWatermark(null);
    expect(await t.watermark()).toBeNull();
  });

  it('clearTable mengosongkan baris DAN watermark, bukan hanya baris', async () => {
    const t = make();
    await t.putMany([
      { key: 'a', row: 1, updatedAt: null },
      { key: 'b', row: 2, updatedAt: null },
    ]);
    await t.setWatermark('w1');
    await t.clearTable();
    expect(await t.all()).toEqual([]);
    // Watermark yang tertinggal akan membuat sinkronisasi berikutnya memakai
    // `gte` dari titik yang datanya sudah tidak ada — lubang data senyap.
    expect(await t.watermark()).toBeNull();
  });

  it('pemilik berbeda ⇒ tidak satu pun byte sesi lama terpakai', async () => {
    const be = createMemoryBackend();
    const a = new LocalTable(be, 'rows', 'sesi-A');
    await a.putMany([{ key: 'k', row: 'milik-A', updatedAt: 'w1' }]);
    await a.setWatermark('w1');

    const b = new LocalTable(be, 'rows', 'sesi-B');
    expect(await b.all()).toEqual([]); // ganti akun: baris akun lama dibuang
    expect(await b.watermark()).toBeNull();
    // Dan benar-benar HILANG, bukan hanya disembunyikan dari sesi B.
    expect(await a.all()).toEqual([]);
  });

  it('durable = false untuk memory backend (pemanggil tidak boleh anggap abadi)', () => {
    expect(make().durable).toBe(false);
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

  it('tanpa allowMemory dan tanpa IDB → null (bukan tabel memori diam-diam)', async () => {
    expect(await openLocalTable('fallback', 'tester')).toBeNull();
  });

  it('dua nama tabel BERBEDA di backend yang SAMA tidak saling bocor', async () => {
    // Versi lama memakai dua `openLocalTable()` terpisah, yang di jsdom selalu
    // mendapat backend memori BARU — jadi tesnya lolos bukan karena pemisahan
    // per nama tabel, melainkan karena backend-nya memang lain. Di sini
    // backend-nya DIBAGI, supaya yang diuji benar-benar `tableOf(key)`.
    const be = createMemoryBackend();
    const t1 = await openLocalTable('a', 'tester', { backend: be });
    const t2 = await openLocalTable('b', 'tester', { backend: be });
    if (!t1 || !t2) throw new Error('unexpected null');
    await t1.putMany([{ key: 'k', row: 'from-a', updatedAt: null }]);
    await t2.putMany([{ key: 'k', row: 'from-b', updatedAt: null }]);
    expect((await t1.all()).find((r) => r.key === 'k')?.row).toBe('from-a');
    expect((await t2.all()).find((r) => r.key === 'k')?.row).toBe('from-b');
  });
});
