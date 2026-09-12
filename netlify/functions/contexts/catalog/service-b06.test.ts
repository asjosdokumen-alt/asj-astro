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
  // Faithful enough to the real mapper (_lib/db/candidates.ts): it translates the
  // raw row into the camelCase shape `handleShareData` consumes (idKandidat/wa/
  // nama/pasPhoto/fileCv/jftText/…). An identity mock silently made every output
  // field `undefined` while still passing a length assertion — the fixture rows
  // below therefore stay in RAW DB shape and this maps them.
  mapCandidate: (r: any) => ({
    idKandidat: r?.id_kandidat,
    wa: r?.no_wa,
    nama: r?.nama_lengkap,
    gender: r?.gender,
    usia: r?.usia,
    tb: r?.tb,
    bb: r?.bb,
    pasPhoto: r?.pas_photo,
    fileCv: r?.file_cv,
    jft: r?.jft,
    ssw: r?.ssw,
    jftText: r?.nilai_jft_text,
    sswText: r?.bidang_ssw_text,
  }),
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
  findCandidateByWaFiltered: async () => null,
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

import { handleShareData } from './service';

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
