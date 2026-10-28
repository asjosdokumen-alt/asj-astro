// ==========================================
// TESTS: documents/service — K3 folder upload kandidat SELALU turun dari sesi.
// Klien boleh mengirim folder apa pun (mis. "master/hacker"); kandidat tetap
// dikunci ke "kandidat/<wa>" supaya hapusJenisVarian tidak bisa menghapus /
// menimpa dokumen kandidat lain.
// ==========================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./repository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./repository')>();
  return {
    ...actual,
    hasBackend: () => true,
    supabaseUrl: () => 'https://supabase.example',
  };
});

vi.mock('../../_lib/session', () => ({
  verifyToken: vi.fn(() => ({
    role: 'kandidat',
    wa: '6285700000001',
    exp: Date.now() + 60_000,
  })),
}));

// `importOriginal` keeps the REAL `isAllowedUploadExtension` /
// `ALLOWED_UPLOAD_EXTENSIONS` in play — only the I/O helpers are stubbed. A
// hand-written copy of the allow-list here would make the assertions below
// vacuous (they would test the mock, not the code).
vi.mock('../../_lib/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../_lib/storage')>();
  return {
    ...actual,
    bucket: () => 'b',
    storageRequest: vi.fn(async (_method: string, url: string) => ({ url: '/' + url })),
    publicUrl: (p: string) => 'https://cdn.example/' + p,
    hapusJenisVarian: vi.fn(async () => undefined),
    b64ToBuffer: () => Buffer.from(''),
    mimeFromName: () => 'application/octet-stream',
    stemAliases: (s: string) => [s],
    isVarianOf: () => false,
    uploadBase64: async () => null,
    resolveFileUrl: (p: string) => p,
  };
});

import { handleGetUploadUrls } from './service';
import { hapusJenisVarian, storageRequest } from '../../_lib/storage';

describe('handleGetUploadUrls — K3 folder upload kandidat dari sesi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mengabaikan folder klien dan memaksa kandidat/<wa> dari sesi', async () => {
    const res = await handleGetUploadUrls(
      [
        {
          files: [{ key: 'foto', prefix: 'foto', ext: 'jpg' }],
          folder: 'master/hacker/../../rahasia',
        },
      ],
      'token-kandidat',
    );

    expect(res.success).toBe(true);
    const url = (res as { urls: Record<string, { signedUrl: string }> }).urls
      .foto.signedUrl;
    expect(url).toContain('kandidat/6285700000001/foto.jpg');
    expect(url).not.toContain('master');
    expect(url).not.toContain('hacker');
    // KONTRAK BERUBAH 2026-10-28 — dulu `toHaveBeenCalledWith('kandidat/…',
    // 'foto')`. Handler ini hanya MENANDATANGANI URL; byte-nya dikirim browser
    // sesudahnya, dan PUT itu bisa gagal. Menghapus varian lama di sini berarti
    // dokumen lama hilang sebelum penggantinya ada (kasus nyata: CV.pdf dihapus
    // lalu unggahannya gagal). Pembersihan pindah ke titik konfirmasi
    // (`handleSimpanBerkasTahapan`), jadi di sini justru TIDAK boleh menghapus.
    expect(hapusJenisVarian).not.toHaveBeenCalled();
  });

  it('menolak ekstensi di luar allow-list (svg) — tidak menandatangani URL', async () => {
    const res = await handleGetUploadUrls(
      [{ files: [{ key: 'x', prefix: 'x', ext: 'svg' }], folder: 'misc' }],
      'token-kandidat',
    );
    expect(res.success).toBe(false);
    expect(String((res as { error?: string }).error || '')).toContain('svg');
  });

  it('menolak konten aktif/executable (html, js, mjs, cjs, exe, sh)', async () => {
    for (const ext of ['html', 'js', 'mjs', 'cjs', 'exe', 'sh']) {
      const res = await handleGetUploadUrls(
        [{ files: [{ key: 'x', prefix: 'x', ext }], folder: 'misc' }],
        'token-kandidat',
      );
      expect(res.success, `ext ${ext} harus ditolak`).toBe(false);
    }
  });

  it('menerima SETIAP ekstensi yang ditawarkan UI (superset, minus konten aktif)', async () => {
    // Termasuk doc/xls/csv/txt/gif — yang akan GAGAL terhadap set sempit pertama.
    const accepted = [
      'pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp',
      'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt',
    ];
    for (const ext of accepted) {
      const res = await handleGetUploadUrls(
        [{ files: [{ key: 'f', prefix: 'f', ext }], folder: 'misc' }],
        'token-kandidat',
      );
      expect(res.success, `ext ${ext} harus diterima`).toBe(true);
    }
  });
});

/**
 * PENANDATANGANAN BATCH (2026-10-28).
 *
 * Versi sebelumnya menandatangani satu per satu, dan SEBELUM perbaikan hapus-
 * varian tiap berkas juga memicu list+delete — tiga round-trip storage per
 * berkas, berurutan. Enam dokumen pemberkasan = 18 perjalanan sebelum browser
 * bisa mengunggah byte pertama.
 *
 * Yang dikunci di sini bukan durasinya (itu milik jaringan), melainkan
 * BENTUKNYA: ada lebih dari satu permintaan yang berjalan bersamaan, dan
 * jumlahnya tidak melewati bulkhead `storage` (8) — melewatinya akan membuat
 * seluruh permintaan gagal "Gagal membuat link upload", bukan sekadar lambat.
 */
describe('handleGetUploadUrls — penandatanganan batch, di bawah batas bulkhead', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('6 berkas ditandatangani bersamaan (maks 4 sekaligus), semuanya dapat URL', async () => {
    let inflight = 0;
    let maxInflight = 0;
    vi.mocked(storageRequest).mockImplementation(async (_m: string, url: string) => {
      inflight += 1;
      maxInflight = Math.max(maxInflight, inflight);
      // Satu microtask: cukup untuk membuat permintaan yang berurutan terlihat
      // berurutan (inflight selalu 1) tanpa bergantung pada waktu nyata.
      await Promise.resolve();
      inflight -= 1;
      return { url: '/' + url };
    });

    const files = ['a', 'b', 'c', 'd', 'e', 'f'].map((k) => ({ key: k, prefix: k, ext: 'pdf' }));
    const res = (await handleGetUploadUrls([{ files, folder: 'misc' }], 'token-kandidat')) as {
      success: boolean;
      urls: Record<string, { signedUrl: string }>;
    };

    expect(res.success).toBe(true);
    expect(Object.keys(res.urls).sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(maxInflight).toBeGreaterThan(1);
    // 4 < 8 (bulkhead storage). Kalau ini naik, batch besar akan gagal total.
    expect(maxInflight).toBeLessThanOrEqual(4);
    expect(vi.mocked(storageRequest)).toHaveBeenCalledTimes(6);
  });
});