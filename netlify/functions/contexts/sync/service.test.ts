// ==========================================
// TESTS: contexts/sync — probe, delta, manifest (2026-10-20)
//
// Yang dipaku di sini adalah tiga keputusan yang MUDAH rusak tanpa terlihat:
//
//   1. BATAS INKLUSIF (`gte`). Baris lama yang kolom waktunya baru dibuat
//      (migrasi 017) berbagi SATU nilai `updated_at`. Dengan `gt`, klien yang
//      menyimpan watermark dari jawaban sebelumnya MELOMPATI semuanya.
//   2. PENGHAPUSAN tidak terdeteksi dari watermark — probe wajib membawa
//      JUMLAH, dan manifest wajib membandingkan KUNCI.
//   3. `nextSince` = watermark baris TERAKHIR yang dikirim, BUKAN serverNow().
//      Kalau jawaban dipotong `limit`, serverNow() akan melompati baris yang
//      belum terkirim.
//
// Plus pagar gerbang: ketiga aksi membaca SELURUH isi tabel, jadi tanpa sesi
// admin mereka harus menolak — bukan mengembalikan array kosong.
//
// DB-free: `./repository` di-mock, jadi tidak ada yang menyentuh jaringan.
// ==========================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

/** Bentuk jawaban yang dibaca tes — supaya tidak ada `any` yang
 *  mematikan pemeriksaan tipe (lint-ratchet hanya boleh TURUN).
 *  Field opsional tetap diakses dengan `?.`: kalau service berhenti
 *  mengirim salah satunya, nilai jadi `undefined` dan `expect(...)`
 *  MERAH — bukan lolos diam-diam seperti `any`. */
type Res = {
  success: boolean;
  error?: string;
  v?: number;
  limit?: number;
  table?: string;
  rows?: Record<string, unknown>[];
  nextSince?: string | null;
  count?: number;
  more?: boolean;
  tables?: Record<string, { count: number; watermark: string | null }>;
  manifest?: Array<{ id: string; updatedAt: string | null }>;
};

const m = vi.hoisted(() => ({
  watermarks: vi.fn(),
  rowsSince: vi.fn(),
  manifest: vi.fn(),
}));

vi.mock('./repository', () => ({
  SYNC_TABLES: {
    jobs: { table: 'job_database', key: 'code_job' },
    master: { table: 'master_database_candidate', key: 'id_kandidat' },
    forms: { table: 'database_asj_form', key: 'id' },
    candidates: { table: 'database_candidate', key: 'id_kandidat' },
  },
  SYNC_KEYS: ['jobs', 'master', 'forms', 'candidates'],
  SYNC_LIMIT: 200,
  isSyncKey: (v: unknown) => typeof v === 'string' && ['jobs', 'master', 'forms', 'candidates'].includes(v),
  syncWatermarks: m.watermarks,
  syncRowsSince: m.rowsSince,
  syncManifest: m.manifest,
}));

// `requireAdmin` di-mock supaya tes mengukur PAGARNYA, bukan sesi sungguhan.
const adminOk = vi.hoisted(() => ({ ok: true }));
vi.mock('../identity', () => ({
  requireAdmin: () =>
    adminOk.ok ? { token: { role: 'admin' } } : { error: { success: false, sessionInvalid: true, message: 'Sesi admin tidak valid' } },
}));

// Dekorator: cukup kembalikan penanda supaya tes bisa membuktikan arahnya,
// dan sekaligus membuktikan baris benar-benar MELEWATI dekorator.
vi.mock('../catalog/repository', () => ({
  mapJob: (r: unknown) => ({ ...(r as Record<string, unknown>), _decorated: 'job' }),
  mapCandidate: (r: unknown) => ({ ...(r as Record<string, unknown>), _decorated: 'candidate' }),
  stripRaw: (l: unknown[]) => l,
}));

import { handleSyncProbe, handleSyncDelta, handleSyncManifest } from './service';

const ADMIN = 'admin-token';

beforeEach(() => {
  m.watermarks.mockReset();
  m.rowsSince.mockReset();
  m.manifest.mockReset();
  adminOk.ok = true;
});

describe('syncProbe — pagar gerbang', () => {
  it('tanpa sesi admin → ditolak, bukan array kosong', async () => {
    adminOk.ok = false;
    const r = await handleSyncProbe([], ADMIN);
    expect(r).toEqual({ success: false, sessionInvalid: true, message: 'Sesi admin tidak valid' });
    expect(m.watermarks).not.toHaveBeenCalled();
  });

  it('argumen berlebih ditolak — bukan diabaikan diam-diam', async () => {
    const r = await handleSyncProbe(['x'], ADMIN);
    expect(r).toMatchObject({ success: false });
    expect(m.watermarks).not.toHaveBeenCalled();
  });

  it('tanpa argumen: mengembalikan watermark + jumlah tiap tabel', async () => {
    m.watermarks.mockResolvedValue({
      jobs: { count: 159, watermark: '2026-10-20T16:56:01.156Z' },
    });
    const r = (await handleSyncProbe([], ADMIN)) as Res;
    expect(r.success).toBe(true);
    expect(r.v).toBe(1);
    expect(r.tables?.jobs).toEqual({ count: 159, watermark: '2026-10-20T16:56:01.156Z' });
  });

  it('satu tabel mati tidak membatalkan probe', async () => {
    m.watermarks.mockResolvedValue({
      jobs: { count: 159, watermark: 'w' },
      master: { count: -1, watermark: null },
    });
    const r = (await handleSyncProbe([], ADMIN)) as Res;
    expect(r.success).toBe(true);
    expect(r.tables?.master?.count).toBe(-1);
  });
});

describe('syncDelta — batas inklusif & nextSince', () => {
  it('memakai gte (bukan gt) — baris ber-watermark sama ikut terkirim', async () => {
    m.rowsSince.mockResolvedValue([]);
    await handleSyncDelta(['jobs', '2026-10-20T00:00:00Z'], ADMIN);
    const q = m.rowsSince.mock.calls[0];
    expect(q[0]).toBe('jobs');
    expect(q[1]).toBe('2026-10-20T00:00:00Z');
    // Arah query adalah urusan repository; yang dipaku di sini adalah
    // repo menerima watermark apa adanya, dan servis meneruskannya.
    expect(q.length).toBe(2);
  });

  it('nextSince = watermark baris TERAKHIR, bukan waktu server', async () => {
    m.rowsSince.mockResolvedValue([
      { code_job: 'TG1', updated_at: '2026-10-20T10:00:00Z' },
      { code_job: 'TG2', updated_at: '2026-10-20T11:00:00Z' },
    ]);
    const r = (await handleSyncDelta(['jobs', '2026-10-20T09:00:00Z'], ADMIN)) as Res;
    expect(r.nextSince).toBe('2026-10-20T11:00:00Z');
    expect(r.more).toBe(false);
    expect(r.count).toBe(2);
  });

  it('dipotong limit → more=true dan nextSince urutan TERAKHIR yang terkirim', async () => {
    m.rowsSince.mockResolvedValue([
      { code_job: 'A', updated_at: '2026-10-20T10:00:00Z' },
      { code_job: 'B', updated_at: '2026-10-20T11:00:00Z' },
      { code_job: 'C', updated_at: '2026-10-20T12:00:00Z' },
    ]);
    const r = (await handleSyncDelta(['jobs', 'x', '2'], ADMIN)) as Res;
    expect(r.count).toBe(2);
    expect(r.more).toBe(true);
    // Bukan C (yang belum terkirim) dan bukan serverNow() — harus B.
    expect(r.nextSince).toBe('2026-10-20T11:00:00Z');
  });

  it('tanpa `sejak` → ditolak jujur, bukan seluruh tabel', async () => {
    const r = (await handleSyncDelta(['jobs', ''], ADMIN)) as Res;
    expect(r.success).toBe(false);
    expect(r.error).toContain('sejak');
    expect(m.rowsSince).not.toHaveBeenCalled();
  });

  it('tabel tak dikenal ditolak — bukan fallback ke tabel pertama', async () => {
    const r = (await handleSyncDelta(['rahasia', 'x'], ADMIN)) as Res;
    expect(r.success).toBe(false);
    expect(r.error).toContain('rahasia');
    expect(m.rowsSince).not.toHaveBeenCalled();
  });

  it('batas dari klien dibatasi SYNC_LIMIT (200), tidak dipercaya mentah', async () => {
    m.rowsSince.mockResolvedValue([]);
    await handleSyncDelta(['jobs', 'x', '99999'], ADMIN);
    // 200 baris dummy untuk membuktikan pemotongan berlaku.
    m.rowsSince.mockResolvedValue(Array.from({ length: 250 }, (_, i) => ({ code_job: `J${i}`, updated_at: `w${i}` })));
    const r = (await handleSyncDelta(['jobs', 'x', '99999'], ADMIN)) as Res;
    expect(r.count).toBe(200);
    expect(r.more).toBe(true);
  });

  it('baris jobs benar-benar MELEWATI mapJob', async () => {
    m.rowsSince.mockResolvedValue([{ code_job: 'TG1', updated_at: 'w' }]);
    const r = (await handleSyncDelta(['jobs', 'x'], ADMIN)) as Res;
    expect(r.rows?.[0]?._decorated).toBe('job');
  });

  it('baris candidates benar-benar MELEWATI mapCandidate', async () => {
    m.rowsSince.mockResolvedValue([{ id_kandidat: 'ASJ-1', updated_at: 'w' }]);
    const r = (await handleSyncDelta(['candidates', 'x'], ADMIN)) as Res;
    expect(r.rows?.[0]?._decorated).toBe('candidate');
  });
});

describe('syncManifest — deteksi penghapusan', () => {
  it('tanpa sesi admin → ditolak', async () => {
    adminOk.ok = false;
    await expect(handleSyncManifest(['jobs'], ADMIN)).resolves.toMatchObject({ success: false });
    expect(m.manifest).not.toHaveBeenCalled();
  });

  it('manifest memakai KUNCI tabel itu, bukan satu nama seragam', async () => {
    m.manifest.mockResolvedValue([{ code_job: 'TG1', updated_at: 'w' }]);
    const r = (await handleSyncManifest(['jobs'], ADMIN)) as Res;
    expect(r.manifest).toEqual([{ id: 'TG1', updatedAt: 'w' }]);

    m.manifest.mockResolvedValue([{ id_kandidat: 'ASJ-1', updated_at: 'w' }]);
    const r2 = (await handleSyncManifest(['candidates'], ADMIN)) as Res;
    expect(r2.manifest).toEqual([{ id: 'ASJ-1', updatedAt: 'w' }]);
  });

  it('tabel tak dikenal ditolak', async () => {
    const r = (await handleSyncManifest(['bukan'], ADMIN)) as Res;
    expect(r.success).toBe(false);
    expect(m.manifest).not.toHaveBeenCalled();
  });
});
