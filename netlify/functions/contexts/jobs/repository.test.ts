// ==========================================
// TESTS: contexts/jobs/repository — penomoran kode loker (item 11 / B1)
//
// Dua cacat yang dipaku di sini:
//   1. `order: 'code_job.desc'` adalah urutan STRING, jadi 'TG99ASJ' > 'TG100ASJ'
//      dan max sesungguhnya bisa terlewat dari jendela `limit`. Fix: filter per
//      PREFIX di server + max NUMERIK di klien.
//   2. Dua prefix (TG, GJ) yang di-scan bersama bisa saling mencemari nomor.
//      Fix: filter per prefix.
//
// Plus: Magang → GJ (mulai dari 1), selainnya → TG.
// ==========================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Kontrol per-tes: baris yang dikembalikan query `maxJobCodeNumber`, dan baris
// untuk fallback scan penuh (findJobs). vi.hoisted karena mock di-hoist.
const m = vi.hoisted(() => ({
  codeRows: [] as Array<Record<string, unknown>>,
  throwOnQuery: false,
  allRows: [] as Array<Record<string, unknown>>,
  lastQuery: null as Record<string, unknown> | null,
}));

vi.mock('../../_lib/db/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../_lib/db/client')>();
  return {
    ...actual,
    supabaseJson: vi.fn(async (_method: string, _table: string, opts: { query?: Record<string, unknown> }) => {
      m.lastQuery = (opts?.query as Record<string, unknown> | undefined) ?? null;
      if (m.throwOnQuery) throw new Error('column unknown');
      return m.codeRows;
    }),
  };
});

vi.mock('../../_lib/db/jobs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../_lib/db/jobs')>();
  return {
    ...actual,
    findJobs: async () => ({ rows: m.allRows }),
  };
});

import { nextJobCode, jobCodePrefix } from './repository';

describe('jobCodePrefix — kategori → prefix kode', () => {
  it('Magang (berbagai kapital) → GJ', () => {
    expect(jobCodePrefix('Magang')).toBe('GJ');
    expect(jobCodePrefix('magang')).toBe('GJ');
    expect(jobCodePrefix('  MAGANG  ')).toBe('GJ');
  });

  it('kategori lain / kosong / tidak ada → TG', () => {
    expect(jobCodePrefix('Tokutei Ginou')).toBe('TG');
    expect(jobCodePrefix('')).toBe('TG');
    expect(jobCodePrefix(undefined)).toBe('TG');
    expect(jobCodePrefix('Kaigo')).toBe('TG');
  });
});

describe('nextJobCode — maksimum per-prefix & numerik', () => {
  beforeEach(() => {
    m.codeRows = [];
    m.allRows = [];
    m.throwOnQuery = false;
    m.lastQuery = null;
  });

  it('TG: TG100ASJ hadir bersama TG99ASJ → berikutnya TG101ASJ (jebakan urutan string)', async () => {
    // Urutan ARRAY dari server tidak penting bagi hasil — inilah yang membuat
    // fix ini tahan terhadap jendela `limit` ber-urutan string. Server bisa
    // mengembalikannya dalam urutan apa pun, termasuk desc string yang sempat
    // menyembunyikan TG100.
    m.codeRows = [{ code_job: 'TG99ASJ' }, { code_job: 'TG100ASJ' }, { code_job: 'TG98ASJ' }];
    expect(await nextJobCode('Tokutei Ginou')).toBe('TG101ASJ');
  });

  it('TG: urutan desc-string pun tetap benar (TG100 muncul di ujung array)', async () => {
    // Persis keluaran order desc string: TG99 di depan, TG100 di belakang.
    m.codeRows = [{ code_job: 'TG99ASJ' }, { code_job: 'TG98ASJ' }, { code_job: 'TG100ASJ' }];
    expect(await nextJobCode('Tokutei Ginou')).toBe('TG101ASJ');
  });

  it('GJ: belum ada kode Magang → GJ1ASJ', async () => {
    m.codeRows = [];
    expect(await nextJobCode('Magang')).toBe('GJ1ASJ');
  });

  it('GJ: ada GJ7ASJ → GJ8ASJ', async () => {
    m.codeRows = [{ code_job: 'GJ7ASJ' }, { code_job: 'GJ3ASJ' }];
    expect(await nextJobCode('Magang')).toBe('GJ8ASJ');
  });

  it('campur TG & GJ → TIDAK saling mencemari (TG dihitung dari TG saja)', async () => {
    // Query mengembalikan row TG SAJA (server sudah memfilter prefix), jadi GJ
    // yang bernomor besar (GJ500ASJ) tidak boleh menaikkan TG.
    m.codeRows = [{ code_job: 'TG99ASJ' }, { code_job: 'TG100ASJ' }];
    expect(await nextJobCode('Tokutei Ginou')).toBe('TG101ASJ');
  });

  it('filter query memakai prefix yang diminta (TG vs GJ) — bukti isolasi', async () => {
    m.codeRows = [{ code_job: 'GJ4ASJ' }];
    await nextJobCode('Magang');
    // Query harus memfilter 'ilike.GJ%ASJ', bukan men-scan semua kode.
    expect(m.lastQuery?.code_job).toBe('ilike.GJ%ASJ');
    m.codeRows = [{ code_job: 'TG4ASJ' }];
    await nextJobCode('Tokutei Ginou');
    expect(m.lastQuery?.code_job).toBe('ilike.TG%ASJ');
  });

  it('kode null/kosong di-skip, tidak membuat crash', async () => {
    m.codeRows = [{ code_job: null }, { code_job: '' }, { code_job: 'TG5ASJ' }];
    expect(await nextJobCode('Tokutei Ginou')).toBe('TG6ASJ');
  });

  it('query gagal (kolom tak dikenal) → fallback scan penuh, tetap per-prefix numerik', async () => {
    m.throwOnQuery = true;
    // Fallback membaca findJobs(); campur prefix untuk memastikan filter tetap.
    m.allRows = [
      { code_job: 'TG99ASJ' },
      { code_job: 'TG100ASJ' },
      { code_job: 'GJ500ASJ' }, // prefix lain, harus diabaikan
    ];
    expect(await nextJobCode('Tokutei Ginou')).toBe('TG101ASJ');
    expect(await nextJobCode('Magang')).toBe('GJ501ASJ');
  });
});
