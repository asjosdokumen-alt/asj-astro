/**
 * uploadBerkas.test.ts — uploadBerkasToStorage: getUploadUrls → PUT → publicUrl.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// `api.secure` refuses BEFORE it fetches when the store does not report a live
// session, so this double must expose `isLoggedIn: true` — and `logout`, which
// apiClient imports. Without them all four cases below fail at the request
// assertions, and the failure points far away from the actual cause: the code
// under test never reached `fetch` at all.
vi.mock('../store/authReactive', () => ({
  authStore: { get: () => ({ isLoggedIn: true, sessionToken: 'tok-kandidat' }) },
  logout: vi.fn(),
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

  it('sessionInvalid → error sesi yang KANONIK (pesan server tidak diteruskan di jalur ini)', async () => {
    // Ini SATU-SATUNYA jalur di mana klien tidak meneruskan pesan server.
    // Sinyal protokol `sessionInvalid` diterjemahkan menjadi satu pesan kanonik
    // supaya pemanggil dapat mengenalinya tanpa bergantung pada teks server —
    // `AiCvForm.tsx` membandingkan persis 'Session expired' / 'No valid session'
    // untuk memutuskan apakah toast perlu ditampilkan.
    //
    // Jalur gagal biasa TETAP meneruskan pesan server; tes sebelumnya menegaskan
    // itu ('Sesi tidak valid'). Kalau kelak diputuskan bahwa pesan server juga
    // harus selamat di jalur ini, yang berubah adalah apiClient + AiCvForm + tiga
    // asersi di apiClient.test.ts — bukan tes ini sendirian.
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ success: false, sessionInvalid: true, message: 'Sesi kedaluwarsa' }),
          { status: 200 },
        ),
      ),
    );
    await expect(uploadBerkasToStorage(pngFile(), { key: 'ktp' })).rejects.toThrow(
      /Session expired/,
    );
  });
});