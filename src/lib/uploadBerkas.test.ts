/**
 * uploadBerkas.test.ts — uploadBerkasToStorage: getUploadUrls → PUT → publicUrl.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../store/authReactive', () => ({
  authStore: { get: () => ({ sessionToken: 'tok-kandidat' }) },
}));

import { uploadBerkasToStorage } from './uploadBerkas';

function pngFile(): File {
  return new File(['x'.repeat(10)], 'ktp-e2e.png', { type: 'image/png' });
}

const SIGNED = 'https://supabase.example/storage/v1/object/upload/sign/asj-files/kandidat/6281/ktp.png?token=abc';
const PUBLIC = 'https://supabase.example/storage/v1/object/public/asj-files/kandidat/6281/ktp.png';

function okUploadUrls(): Response {
  return new Response(
    JSON.stringify({ success: true, urls: { ktp: { signedUrl: SIGNED, publicUrl: PUBLIC } } }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

describe('uploadBerkasToStorage', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('minta signed URL via getUploadUrls lalu PUT file dan mengembalikan publicUrl', async () => {
    fetchMock
      .mockResolvedValueOnce(okUploadUrls())
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    const url = await uploadBerkasToStorage(pngFile(), { key: 'ktp', folder: 'master/x' });

    expect(url).toBe(PUBLIC);
    const [req1, req2] = fetchMock.mock.calls;
    // getUploadUrls: action + payload berisi folder & prefix/ext dari key.
    expect(String(req1[0])).toContain('/files');
    const body = JSON.parse(String((req1[1] as RequestInit).body));
    expect(body.action).toBe('getUploadUrls');
    expect(body.sessionToken).toBe('tok-kandidat');
    expect(body.payload[0].folder).toBe('master/x');
    expect(body.payload[0].files).toEqual([{ key: 'ktp', prefix: 'ktp', ext: 'png' }]);
    // PUT: signed URL + file sebagai body.
    expect(String(req2[0])).toBe(SIGNED);
    expect((req2[1] as RequestInit).method).toBe('PUT');
  });

  it('retry dengan backoff bila PUT gagal, lalu sukses', async () => {
    fetchMock
      .mockResolvedValueOnce(okUploadUrls())
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(okUploadUrls())
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    const url = await uploadBerkasToStorage(pngFile(), { key: 'ktp' });
    expect(url).toBe(PUBLIC);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('throw bila signed URL tidak tersedia (semua percobaan gagal)', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ success: false, error: 'Sesi tidak valid' }), {
          status: 200,
        }),
      ),
    );
    await expect(uploadBerkasToStorage(pngFile(), { key: 'ktp' })).rejects.toThrow(
      /Sesi tidak valid/,
    );
    // 3 percobaan (retry dengan backoff), bukan langsung menyerah.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('throw dengan data.message bila backend mengembalikan sessionInvalid dengan message', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ success: false, sessionInvalid: true, message: 'Sesi kedaluwarsa' }),
          { status: 200 },
        ),
      ),
    );
    await expect(uploadBerkasToStorage(pngFile(), { key: 'ktp' })).rejects.toThrow(
      /Sesi kedaluwarsa/,
    );
  });
});