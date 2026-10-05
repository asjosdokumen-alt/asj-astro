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
    storageRequest: async (_method: string, url: string) => ({ url: '/' + url }),
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
import { hapusJenisVarian } from '../../_lib/storage';

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
    expect(hapusJenisVarian).toHaveBeenCalledWith(
      'kandidat/6285700000001',
      'foto',
    );
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