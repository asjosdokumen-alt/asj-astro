// ==========================================
// TESTS: TabDbJob helpers (A18 parity, 2026-09-05)
//
// Legacy ground truth: js/render/admin.ts filterDbJob() +
// js/admin_modal/dbfilter.ts (renderDbFilters). Root bugs pinned here:
//   - TERBANYAK sort was a no-op (return 0) — now sorts DESC by real
//     per-job candidate count
//   - chip filter rows were never rendered (state existed, UI not)
//   - count per row used substring includes() per render — now a tokenized
//     count map (multi-job idLoker counted for every code)
//   - all copy via t() keys in both dicts
// ==========================================
import { describe, it, expect } from 'vitest';
import {
  buildCandidateCountMap,
  filterDbJobs,
  sortDbJobs,
  type DbJob,
} from './TabDbJob';

const job = (p: Partial<DbJob>): DbJob => ({
  code: 'J1',
  tsk: 'TSK-A',
  pekerjaan: 'Kaigo',
  kategori: 'KAIGO',
  lokasi: 'Tokyo',
  tahapan: 'BERKAS',
  statusInt: 'OPEN',
  createdAt: '2026-08-01T00:00:00Z',
  ...p,
});

describe('TabDbJob DB filter/sort (A18)', () => {
  it('buildCandidateCountMap counts per job code, splitting multi-job idLoker', () => {
    const cands = [
      { idLoker: 'J1' },
      { idLoker: 'J1' },
      { idLoker: 'J2' },
      { idLoker: 'J1, J2' }, // kandidat multi-loker dihitung utk setiap kodenya
      { idLoker: '' },
      { idLoker: undefined },
    ];
    const m = buildCandidateCountMap(cands);
    expect(m.J1).toBe(3);
    expect(m.J2).toBe(2);
  });

  it('filterDbJobs: search OR-includes code/tsk/pekerjaan/lokasi (case-insensitive)', () => {
    const jobs = [
      job({ code: 'J1', tsk: 'TSK-A', pekerjaan: 'Kaigo', lokasi: 'Tokyo' }),
      job({ code: 'J2', tsk: 'TSK-B', pekerjaan: 'Kensetsu', lokasi: 'Osaka' }),
    ];
    const byCode = filterDbJobs(jobs, { search: 'j1', bidang: 'ALL', tahapan: 'ALL' });
    expect(byCode.map((j) => j.code)).toEqual(['J1']);
    const byPekerjaan = filterDbJobs(jobs, { search: 'kensetsu', bidang: 'ALL', tahapan: 'ALL' });
    expect(byPekerjaan.map((j) => j.code)).toEqual(['J2']);
    const emptyQ = filterDbJobs(jobs, { search: '', bidang: 'ALL', tahapan: 'ALL' });
    expect(emptyQ.length).toBe(2);
  });

  it('filterDbJobs: bidang/tahapan filter eksak (parity filterDbJob)', () => {
    const jobs = [
      job({ code: 'J1', kategori: 'KAIGO', tahapan: 'BERKAS' }),
      job({ code: 'J2', kategori: 'KENSETSU', tahapan: 'BERKAS' }),
      job({ code: 'J3', kategori: 'KAIGO', tahapan: 'COE' }),
    ];
    expect(filterDbJobs(jobs, { search: '', bidang: 'KAIGO', tahapan: 'ALL' }).map((j) => j.code)).toEqual(['J1', 'J3']);
    expect(filterDbJobs(jobs, { search: '', bidang: 'ALL', tahapan: 'BERKAS' }).map((j) => j.code)).toEqual(['J1', 'J2']);
    expect(filterDbJobs(jobs, { search: '', bidang: 'KAIGO', tahapan: 'COE' }).map((j) => j.code)).toEqual(['J3']);
    expect(filterDbJobs(jobs, { search: '', bidang: 'NONE', tahapan: 'ALL' })).toEqual([]);
  });

  it('sortDbJobs TERBANYAK = jumlah kandidat DESC (no-op lama jadi sort nyata)', () => {
    const jobs = [job({ code: 'J1' }), job({ code: 'J2' }), job({ code: 'J3' })];
    const countMap = { J1: 1, J2: 9, J3: 4 };
    expect(sortDbJobs(jobs, 'TERBANYAK', countMap).map((j) => j.code)).toEqual(['J2', 'J3', 'J1']);
    // tanpa kandidat → 0 (stable sort pertahankan urutan input utk nilai sama)
    const countMap2 = { J2: 9 };
    expect(sortDbJobs(jobs, 'TERBANYAK', countMap2).map((j) => j.code)).toEqual(['J2', 'J1', 'J3']);
  });

  it('sortDbJobs TERBARU/TERLAMA by createdAt with code tie-break (parity)', () => {
    const jobs = [
      job({ code: 'A1', createdAt: '2026-08-01T00:00:00Z' }),
      job({ code: 'B2', createdAt: '2026-08-03T00:00:00Z' }),
      job({ code: 'C3', createdAt: '2026-08-02T00:00:00Z' }),
      job({ code: 'D4', createdAt: '' }),
    ];
    expect(sortDbJobs(jobs, 'TERBARU', {}).map((j) => j.code)).toEqual(['B2', 'C3', 'A1', 'D4']);
    expect(sortDbJobs(jobs, 'TERLAMA', {}).map((j) => j.code)).toEqual(['D4', 'A1', 'C3', 'B2']);
    // tie/NaN → code ascending (TERLAMA) / descending (TERBARU)
    const ties = [
      job({ code: 'X1', createdAt: '2026-08-01T00:00:00Z' }),
      job({ code: 'X2', createdAt: '2026-08-01T00:00:00Z' }),
    ];
    expect(sortDbJobs(ties, 'TERLAMA', {}).map((j) => j.code)).toEqual(['X1', 'X2']);
    expect(sortDbJobs(ties, 'TERBARU', {}).map((j) => j.code)).toEqual(['X2', 'X1']);
  });

  it('TERBARU memakai nomor kode, bukan urutan string (TG158 di atas TG9)', () => {
    // MEASURED 2026-10-09: kolom `created_at` tidak ada di tabel
    // `job_database`, jadi createdAt SELALU kosong dan tie-break inilah yang
    // selalu jalan. Dengan
    // localeCompare, 'TG9ASJ' > 'TG158ASJ' sebagai string sehingga job
    // terbaru tidak pernah muncul paling atas.
    const jobs = [
      job({ code: 'TG9ASJ', createdAt: '' }),
      job({ code: 'TG158ASJ', createdAt: '' }),
      job({ code: 'TG100ASJ', createdAt: '' }),
    ];
    expect(sortDbJobs(jobs, 'TERBARU', {}).map((j) => j.code)).toEqual(['TG158ASJ', 'TG100ASJ', 'TG9ASJ']);
    expect(sortDbJobs(jobs, 'TERLAMA', {}).map((j) => j.code)).toEqual(['TG9ASJ', 'TG100ASJ', 'TG158ASJ']);
  });


  it('sortDbJobs tidak memutasi array asli', () => {
    const jobs = [job({ code: 'J2' }), job({ code: 'J1' })];
    sortDbJobs(jobs, 'TERBARU', {});
    expect(jobs.map((j) => j.code)).toEqual(['J2', 'J1']);
  });
});
