// ==========================================
// TESTS: B06 parity — the public TSK share viewer (revised 2026-09-13)
//
// Legacy ground truth, verified against the code and not just the docs:
//   · `khoci921/js/pages/share.ts` fetched `/api/share-data?job=CODE`;
//   · `khoci921/netlify/functions/share-data.js` read ONLY `?job=` and called
//     `handleShareData(job)` — one argument, no token anywhere.
// So the viewer is public by job code. The TSK are outside parties with no
// accounts, and a link they can pass on is the whole point of the feature.
//
// The rebuild added a per-job token gate on 2026-09-05 (sys_config KV, minted by
// updateDokumenShare / getShareTokenForJob). The owner removed it on 2026-09-13:
// it was never legacy parity, and because `sys_config` had no `config_key`
// column the mint could never succeed — which left the viewer returning
// "Link share belum diaktifkan" for every request, i.e. completely dead.
//
// This file now locks the LEGACY contract. The trade-off it accepts (a short,
// enumerable job code) is stated on `handleShareData` itself; what still bounds
// exposure is `dokumen_share`, and the filter is asserted here.
//
// DB-free: service.ts's repository import is mocked.
// ==========================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => ({
  findJob: vi.fn(),
  findCand: vi.fn(),
  findJobsAll: vi.fn(),
  findCandWa: vi.fn(),
  mapCandidate: vi.fn(),
}));

vi.mock('./repository', () => ({
  hasBackend: () => true,
  demo: {},
  normalizeWa: (s: unknown) => String(s || ''),
  pick: (_row: any, keys: string[]) => {
    for (const k of keys) if (_row?.[k] !== undefined && _row[k] !== null) return _row[k];
    return undefined;
  },
  toText: (v: unknown) => (v === undefined || v === null ? '' : String(v)),
  // The REAL mapper, injected in `beforeEach` (see below). A hand-written copy
  // here would silently drift from `_lib/db/candidates.ts` — and the whole point
  // of the kandidat-payload test is that the SHIPPED mapper's fields
  // (`catatan`/`catatanInt`/`_raw`) are the ones `toKandidatView` removes.
  mapCandidate: m.mapCandidate,
  stripRaw: (x: unknown) => x,
  loadCandidatesUnik: async () => ({ rows: [] }),
  loadSchedules: async () => [],
  loadTugas: async () => [],
  loadWaTemplates: async () => [],
  loadPublicBase: async () => ({ jobs: [], dropdowns: {}, assets: null, pengumuman: '', notFound: false }),
  findFormsByWaList: async () => [],
  findFormsByWa: async () => [],
  findFormsLight: async () => [],
  findForms: async () => [],
  parseDocs: () => [],
  findCandidateByWaFiltered: m.findCandWa,
  findCandidates: async () => ({ rows: [] }),
  attachApplications: async (rows: unknown) => rows,
  attachBerkasBio: async (rows: unknown) => rows,
  findJobByCodeFiltered: m.findJob,
  findCandidatesByJobFiltered: m.findCand,
  findJobs: m.findJobsAll,
  listStorageFolder: async () => [],
  BERKAS_COLUMNS: [],
  supabaseJson: async () => [],
  docTypeOf: (n: string) => String(n || '').replace(/\.[a-z0-9]+$/i, '').toUpperCase(),
  docAge: () => 0,
  mapForm: (r: unknown) => r,
  supabaseUrl: () => 'https://x.supabase.co',
}));

import { handleShareData, handleGetAppData } from './service';
import { mapCandidate as realMapCandidate } from '../../_lib/db/candidates';
import { signToken } from '../../_lib/session';

// Inject the REAL mapper (see the mock factory above) and reset the WA lookup
// before every test, so both describes exercise the shipped `mapCandidate`.
beforeEach(() => {
  m.mapCandidate.mockImplementation(realMapCandidate as never);
  m.findCandWa.mockReset();
  m.findCandWa.mockResolvedValue(null);
});

const JOB_ROW = { code_job: 'TG658', pekerjaan: 'Perawat Jepang', dokumen_share: 'CV,JFT,SSW' };
const CAND_ROW = {
  id_kandidat: 'K1',
  id_loker_pilihan: 'TG658',
  no_wa: '628111222333',
  nama_lengkap: 'Budi Santoso',
};

/** `handleShareData` takes one argument now; call it with a stale second one. */
const callWithStaleToken = handleShareData as unknown as (
  code: string,
  tk?: string,
) => Promise<Record<string, unknown>>;

describe('B06 — the share viewer is public by job code (legacy contract)', () => {
  beforeEach(() => {
    m.findJob.mockReset();
    m.findCand.mockReset();
    m.findJobsAll.mockReset();
    m.findJob.mockResolvedValue(JOB_ROW);
    m.findCand.mockResolvedValue([]);
    m.findJobsAll.mockResolvedValue({ rows: [] });
  });

  it('serves the job and its candidates from a bare ?job=CODE', async () => {
    m.findCand.mockResolvedValue([CAND_ROW]);
    const out = (await handleShareData('TG658')) as {
      error?: string;
      job?: { code?: string; name?: string };
      candidates?: unknown[];
    };
    expect(out.error).toBeUndefined();
    expect(out.job?.code).toBe('TG658');
    expect(out.job?.name).toBe('Perawat Jepang');
    expect(out.candidates).toHaveLength(1);
    // Proves the raw→camelCase mapping is exercised: these three come out of
    // `mapCandidate`, so an identity mapper cannot pass this by accident.
    const c0 = (out.candidates as Array<{ id_kandidat?: string; no_wa?: string; nama_lengkap?: string }>)[0];
    expect(c0.id_kandidat).toBe('K1');
    expect(c0.no_wa).toBe('628111222333');
    expect(c0.nama_lengkap).toBe('Budi Santoso');
  });

  it('ignores a stale ?tk= — links handed out before 2026-09-13 keep working', async () => {
    // Every link shared while the token gate existed carries &tk=<hex>. Removing
    // the gate must not break those; the extra argument is simply unused.
    const out = await callWithStaleToken('TG658', 'stale-token-hex');
    expect(out.error).toBeUndefined();
    expect((out.job as { code?: string } | undefined)?.code).toBe('TG658');
  });

  it('still errors on an unknown job code, before any candidate lookup', async () => {
    m.findJob.mockResolvedValue(undefined);
    m.findJobsAll.mockResolvedValue({ rows: [] });
    const out = (await handleShareData('TG999')) as { error?: string };
    expect(out.error).toContain('Kode job tidak ditemukan');
    expect(m.findCand).not.toHaveBeenCalled();
  });

  it('errors on an empty code', async () => {
    const out = (await handleShareData('')) as { error?: string };
    expect(out.error).toContain('Kode job tidak ditemukan');
    expect(m.findJob).not.toHaveBeenCalled();
  });

  it('returns only candidates actually attached to the requested job', async () => {
    // The job filter is the one thing that bounds what a guessed code exposes,
    // so it is worth pinning: a row for a DIFFERENT job must not appear.
    m.findCand.mockResolvedValue([
      CAND_ROW,
      { id_kandidat: 'K2', id_loker_pilihan: 'TG999', no_wa: '628999888777', nama_lengkap: 'Siti' },
    ]);
    const out = (await handleShareData('TG658')) as { candidates?: Array<{ id_kandidat?: string }> };
    expect(out.candidates).toHaveLength(1);
    expect(out.candidates?.[0]?.id_kandidat).toBe('K1');
  });

  it('treats a multi-job candidate as attached when the code is one of them', async () => {
    m.findCand.mockResolvedValue([
      { id_kandidat: 'K3', id_loker_pilihan: 'TG999, TG658', no_wa: '628123', nama_lengkap: 'Rina' },
    ]);
    const out = (await handleShareData('TG658')) as { candidates?: unknown[] };
    expect(out.candidates).toHaveLength(1);
  });

  it('falls back to a full job scan when the filtered lookup is unavailable', async () => {
    // `findJobByCodeFiltered` returns undefined when it cannot query; the viewer
    // must still work, which is the behaviour legacy had.
    m.findJob.mockResolvedValue(undefined);
    m.findJobsAll.mockResolvedValue({ rows: [JOB_ROW] });
    const out = (await handleShareData('TG658')) as {
      error?: string;
      job?: { code?: string };
    };
    expect(out.error).toBeUndefined();
    expect(out.job?.code).toBe('TG658');
  });
});

// ==========================================
// TESTS: kandidat payload — the admin memos must not leave the server (#10).
//
// The RENDERING was fixed long ago (`CandidateDash.tsx` shows only
// `catatanExt`), but the PAYLOAD was not: `mapCandidate` returned `catatan`
// (← catatan_admin) and `catatanInt` (← catatan_internal) plus `_raw` (the whole
// DB row), and the kandidat branch handed the mapped row straight to the client.
// "The UI hides it" is not a control when devtools is one keypress away.
//
// These assertions are on the SERIALISED RESPONSE — the strongest form: they do
// not care WHICH field the memo hides in, only that its VALUE is not on the
// wire. The real `mapCandidate` is injected (mock factory above), so the fields
// removed are exactly the ones the shipped mapper emits.
// ==========================================
describe('kandidat payload — admin memos never leave the server (#10)', () => {
  const KANDIDAT_ROW = {
    id_kandidat: 'K1',
    id_loker_pilihan: 'TG658',
    no_wa: '628111222333',
    nama_lengkap: 'Budi Santoso',
    catatan_admin: 'MEMO-ADMIN-INTERNAL',
    catatan_internal: 'MEMO-KANDIDAT-INTERNAL [VIP]',
    catatan_external: 'CATATAN-UNTUK-KANDIDAT',
    nik: '3512345678901234',
    email: 'budi@contoh.test',
    alamat_lengkap: 'Jl. Mawar 1, Ponorogo',
  };

  const asKandidat = () =>
    handleGetAppData(['kandidat', '628111222333'], signToken({ role: 'kandidat', wa: '628111222333' })) as Promise<{
      success: boolean;
      candidates: Record<string, unknown>[];
    }>;

  it('mode=kandidat never serialises catatan_admin / catatan_internal / _raw', async () => {
    m.findCandWa.mockResolvedValue(KANDIDAT_ROW);
    const out = await asKandidat();
    expect(out.success).toBe(true);

    const wire = JSON.stringify(out);
    // RED before the fix: both memo values used to be on the wire verbatim.
    expect(wire).not.toContain('MEMO-ADMIN-INTERNAL');
    expect(wire).not.toContain('MEMO-KANDIDAT-INTERNAL');

    const row = out.candidates[0];
    expect(row).not.toHaveProperty('catatan');
    expect(row).not.toHaveProperty('catatanInt');
    expect(row).not.toHaveProperty('_raw');
  });

  it('the candidate still receives the derived flags and their own external note', async () => {
    m.findCandWa.mockResolvedValue(KANDIDAT_ROW);
    const out = await asKandidat();
    const row = out.candidates[0];

    // Server-derived VIP flags — what the dashboard/guard read instead of the memo.
    expect(row.isVIP).toBe(true); // `[VIP]` in the internal memo
    expect(row.kelas).toBe(''); // no `[KELAS xx]`
    expect(row.isSiswaASJ).toBe(false); // `[VIP]` is a VIP tag, NOT a class tag
    // The note the admin wrote FOR the candidate is still delivered.
    expect(row.catatanExt).toBe('CATATAN-UNTUK-KANDIDAT');
    // The candidate's OWN profile fields are deliberately NOT stripped (they are
    // viewing themselves) — stripping them would break the profile/dossier.
    expect(row.email).toBe('budi@contoh.test');
    expect(row.nik).toBe('3512345678901234');
    expect(row.alamat).toBe('Jl. Mawar 1, Ponorogo');
  });
});
