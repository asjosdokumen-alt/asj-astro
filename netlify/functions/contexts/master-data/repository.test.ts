// ==========================================
// TESTS: contexts/master-data/repository — findMasterByWa fallback
//
// Cacat yang dipaku di sini (diukur 2026-10-20 atas DB live):
//   Fallback lama menarik `select <169 kolom> limit 500` TANPA filter setiap
//   kali jalur utama (fetchMasterByWa) melempar — 1,35 MB JSON per permintaan.
//   Nilai tutupnya NOL: 233/234 baris tersimpan kanonik `628…` (sudah ketemu
//   lewat `eq`), dan satu-satunya penyimpangan (`622342782945`) dinormalisasi
//   menjadi '' oleh normalizeWa, jadi tidak ada baris yang HANYA bisa ditemukan
//   dengan menarik seluruh tabel.
//
// Fix: fallback yang sama-sama dilayani index unik `no_wa` (daftar `in.(…)`
// dua bentuk: kanonik + lokal). `limit: 500` di fetchMasterByWa tidak pernah
//   mengikat karena index unik membatasi hasil maksimal dua baris.
// ==========================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => ({
  // Setiap panggilan supabaseJson: { method, table, query }
  calls: [] as Array<{ method: string; table: string; query: Record<string, unknown> }>,
  // Jumlah panggilan pertama yang gagal (melempar) sebelum "pulih".
  failFirst: 0,
  rows: [] as Array<Record<string, unknown>>,
}));

vi.mock('../../_lib/db/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../_lib/db/client')>();
  return {
    ...actual,
    supabaseJson: vi.fn(async (method: string, table: string, opts: { query?: Record<string, unknown> } = {}) => {
      m.calls.push({ method, table, query: (opts.query as Record<string, unknown>) ?? {} });
      if (m.calls.length <= m.failFirst) throw new Error('simulated transient failure');
      return m.rows;
    }),
  };
});

import { findMasterByWa } from './repository';

const WA = '6282231326126';

function masterRow(over: Record<string, unknown> = {}) {
  return { id: 112, id_kandidat: 'ASJ00112', nama_lengkap: 'EWALDO', no_wa: WA, ...over };
}

describe('findMasterByWa — tak pernah menarik tabel tanpa filter', () => {
  beforeEach(() => {
    m.calls = [];
    m.failFirst = 0;
    m.rows = [];
  });

  it('jalur utama: satu permintaan ber-filter, baris dikembalikan', async () => {
    m.rows = [masterRow()];
    const row = await findMasterByWa(WA);
    expect(row?.id_kandidat).toBe('ASJ00112');
    expect(m.calls).toHaveLength(1);
    expect(m.calls[0].method).toBe('GET');
    expect(m.calls[0].table).toBe('master_database_candidate');
    expect(String(m.calls[0].query.no_wa)).toBe('in.(' + WA + ')');
  });

  it('fallback: query TETAP ber-filter no_wa (dua bentuk), bukan scan 500 baris', async () => {
    m.rows = [masterRow()];
    m.failFirst = 1; // jalur utama melempar → fallback
    const row = await findMasterByWa(WA);
    expect(row?.id_kandidat).toBe('ASJ00112');
    expect(m.calls).toHaveLength(2);
    const fb = m.calls[1];
    expect(fb.method).toBe('GET');
    // Filter WA wajib ada — inilah inti perbaikannya. Bentuk lokal = 0 + 62…
    const local = '0' + WA.slice(2);
    expect(String(fb.query.no_wa)).toBe('in.(' + WA + ',' + local + ')');
    // Tidak ada satu pun permintaan tanpa filter no_wa.
    for (const c of m.calls) {
      expect(Object.keys(c.query), JSON.stringify(c.query)).toContain('no_wa');
    }
  });

  it('fallback: baris tersimpan bentuk lokal (0…) tetap ketemu lewat query yang sama', async () => {
    const local = '08' + WA.slice(3); // 628xxxx → 08xxxx (satu digit awal ditahan)
    m.rows = [masterRow({ no_wa: local })];
    m.failFirst = 1;
    const row = await findMasterByWa(WA);
    // Ditemukan lewat normalisasi JS di ujung — TAPI request-nya tetap bertarget.
    expect(row?.no_wa).toBe(local);
    expect(String(m.calls[1].query.no_wa)).toContain(local);
  });

  it('nomor non-Indonesia (81…): fallback tetap satu bentuk, tetap ber-filter', async () => {
    const jp = '818012345678';
    m.rows = [masterRow({ no_wa: jp })];
    m.failFirst = 1;
    const row = await findMasterByWa(jp);
    expect(row?.no_wa).toBe(jp);
    expect(String(m.calls[1].query.no_wa)).toBe('in.(' + jp + ')');
  });

  it('kedua jalur gagal → error DITERUSKAN (bukan null yang menyamar sebagai "tidak ada")', async () => {
    m.failFirst = 2;
    await expect(findMasterByWa(WA)).rejects.toThrow('simulated transient failure');
    expect(m.calls).toHaveLength(2);
  });

  it('WA tak bisa dinormalisasi → nol permintaan DB', async () => {
    expect(await findMasterByWa('12345')).toBeNull();
    expect(m.calls).toHaveLength(0);
  });
});
