/**
 * uploadBerkas.test.ts — uploadBerkasToStorage: unggah ke CLOUDINARY.
 *
 * SEJARAH (penting, jangan dibaca sebagai kebetulan):
 *   • Bentuk asli fungsi ini memakai `getUploadUrls` (Supabase Storage) →
 *     signed URL → PUT. Itu sengaja: penjaga K3 memaksa folder `kandidat/<wa>`
 *     dari sesi, jadi kandidat tidak bisa menulis ke folder kandidat lain.
 *   • TAPI objek Storage dilayani `Cache-Control: no-cache`, sehingga setiap
 *     kali berkas itu DILIHAT, byte-nya keluar dari kuota egress Supabase.
 *     Berkas kandidat (KTP/KK/ijazah/foto) adalah byte terbesar di sistem —
 *     inilah sebab kuota egress jebol walau trafik halaman publik kecil.
 *   • Keputusan pemilik (2026-10-14): berkas dialihkan ke Cloudinary, yang
 *     memang sudah jadi rumah berkas di arsitektur ini.
 *
 * KEAMANAN TIDAK HILANG. Yang dulu dijaga Storage sekarang dijaga di
 * tempat lain, dan tes ini menegaskan keduanya tetap bekerja:
 *   1. `simpanBerkasTahapan` / `simpanRevisiKandidat` memeriksa IDOR — untuk
 *      role kandidat, `wa` pada payload HARUS sama dengan WA di sesi.
 *   2. `badDocumentUrls` menolak URL yang bukan https dari host terdaftar;
 *      `res.cloudinary.com` ada di allow-list itu.
 * Jadi walau klien bebas memilih folder Cloudinary, URL hasilnya tidak bisa
 * dikaitkan dengan kandidat lain.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// `api.secure` menolak SEBELUM fetch bila store tidak melaporkan sesi hidup,
// jadi double ini harus punya `isLoggedIn: true` dan `logout` (diimpor apiClient).
vi.mock('../store/authReactive', () => ({
  authStore: { get: () => ({ isLoggedIn: true, sessionToken: 'tok-kandidat' }) },
  logout: vi.fn(),
}));

import { uploadBerkasToStorage } from './uploadBerkas';

function pngFile(): File {
  return new File(['x'.repeat(10)], 'ktp-e2e.png', { type: 'image/png' });
}

const CLOUD_URL = 'https://res.cloudinary.com/ybzzbw9i/image/upload/v1/kandidat/6281/ktp.png';

function okCloudinary(): Response {
  return new Response(JSON.stringify({ secure_url: CLOUD_URL }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
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

  it('mengunggah ke Cloudinary dan mengembalikan secure_url', async () => {
    fetchMock.mockResolvedValueOnce(okCloudinary());

    const url = await uploadBerkasToStorage(pngFile(), { key: 'ktp', folder: 'kandidat/6281' });

    expect(url).toBe(CLOUD_URL);
    // Satu request saja — tidak ada tahap "minta signed URL" lagi.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [target, init] = fetchMock.mock.calls[0];
    expect(String(target)).toContain('api.cloudinary.com');
    expect((init as RequestInit).method).toBe('POST');
    const body = (init as RequestInit).body as FormData;
    expect(body.get('upload_preset')).toBeTruthy();
    expect(body.get('file')).toBeTruthy();
  });

  it('TIDAK lagi menyentuh Supabase Storage (regresi egress)', async () => {
    fetchMock.mockResolvedValueOnce(okCloudinary());

    await uploadBerkasToStorage(pngFile(), { key: 'ktp' });

    const targets = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(targets.some((t) => t.includes('supabase.co/storage'))).toBe(false);
  });

  it('throw bila Cloudinary tidak mengembalikan secure_url (semua percobaan gagal)', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ error: { message: 'Preset tidak valid' } }), { status: 400 })),
    );
    await expect(uploadBerkasToStorage(pngFile(), { key: 'ktp' })).rejects.toThrow(
      /Preset tidak valid/,
    );
    // 3 percobaan (retry dengan backoff), bukan langsung menyerah.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('retry dengan backoff bila gagal sekali, lalu sukses', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(okCloudinary());

    const url = await uploadBerkasToStorage(pngFile(), { key: 'ktp' });
    expect(url).toBe(CLOUD_URL);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
