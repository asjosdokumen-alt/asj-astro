/**
 * CekSiswaModal.test.tsx — transport, dan pemetaan status sesi.
 *
 * Berkas ini sebelumnya TIDAK punya tes sama sekali, jadi konversinya ke klien
 * bersama tidak akan terverifikasi di tingkat kabel. Yang dipaku di sini:
 *
 *   1. Envelope POST memakai kunci `payload` (kunci yang benar-benar dibaca
 *      backend) ke entry point `register`.
 *   2. Jawaban sukses merender barisnya.
 *   3. **Sesi mati → `kind: 'session'`, BUKAN error generik.** Ini yang paling
 *      penting: sinyal protokol `sessionInvalid` datang sebagai **HTTP 400**
 *      (wrapper memetakan `success === false` ke 400), dan klien menerjemahkannya
 *      menjadi pesan kanonik 'Session expired' lewat THROW. Jadi catch komponen
 *      inilah yang harus memetakannya kembali — cabang `data.sessionInvalid`
 *      praktis tidak lagi kena.
 *   4. KONTROL: 400 yang merupakan error biasa tetap memunculkan pesan SERVER,
 *      bukan 'Session expired'. Tanpa kasus ini, tes 3 tidak membuktikan bahwa
 *      pemetaannya selektif.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/preact';

const state = { isLoggedIn: true, sessionToken: 'tok-admin' };

// `api.secure` menolak SEBELUM fetch kalau store tidak melaporkan sesi hidup,
// jadi `isLoggedIn` wajib ada — plus `logout`, yang diimpor apiClient.
vi.mock('../store/authReactive', () => ({
  authStore: { get: () => state },
  logout: vi.fn(),
}));

// `lib/apiEndpoint` SENGAJA tidak di-mock: pemetaan action → URL adalah bagian
// yang ingin diverifikasi (resep §3.1(b2) langkah 1: "periksa kesetaraan
// endpoint — jangan diasumsikan"). Mock yang mengembalikan nama action apa adanya
// akan menyembunyikan pemetaan itu dan membuat asersinya tautologis.
vi.mock('./Toast', () => ({ showToast: vi.fn() }));

// Kamus asli: stub identitas (`t: k => k`) membuat setiap asersi bergantung pada
// KETIADAAN terjemahan.
vi.mock('../store/i18n', async () => {
  const actual = await vi.importActual<typeof import('../store/i18n')>('../store/i18n');
  return { ...actual, t: actual.t };
});

import CekSiswaModal from './CekSiswaModal';
import { t } from '../store/i18n';

function respondWith(body: unknown, status = 200) {
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  state.isLoggedIn = true;
  state.sessionToken = 'tok-admin';
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe('CekSiswaModal — transport & status sesi', () => {
  it('mengirim envelope POST `payload` ke entry point register', async () => {
    const fetchMock = respondWith({ success: true, data: [] });

    render(<CekSiswaModal onClose={() => {}} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toBe('/.netlify/functions/register');
    expect(init.method).toBe('POST');
    const body = JSON.parse(String(init.body));
    expect(body.action).toBe('getDaftarSiswaBaru');
    // Kunci di kabel adalah `payload`, bukan `args`.
    expect(body.payload).toEqual([]);
  });

  it('jawaban sukses merender barisnya', async () => {
    respondWith({
      success: true,
      data: [{ id: 1, nama_lengkap: 'SISWA SATU', jenis_kelamin: 'P', alamat_lengkap: 'Tokyo' }],
    });

    render(<CekSiswaModal onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText('SISWA SATU')).toBeTruthy());
    expect(screen.getByText('Tokyo')).toBeTruthy();
  });

  it('sesi mati (HTTP 400 + sessionInvalid) → pesan sesi, BUKAN error generik', async () => {
    respondWith({ success: false, sessionInvalid: true, message: 'Sesi tidak valid' }, 400);

    render(<CekSiswaModal onClose={() => {}} />);

    await waitFor(() => expect(screen.getByText(t('siswa.session_admin_only'))).toBeTruthy());
    // Kalau pemetaannya meleset, yang muncul adalah cabang error — dan itulah
    // regresi yang tes ini jaga.
    expect(screen.queryByText(t('siswa.load_failed'))).toBeNull();
  });

  it('KONTROL: 400 biasa → pesan SERVER, bukan pesan sesi', async () => {
    respondWith({ success: false, error: 'Roster sedang tidak tersedia.' }, 400);

    render(<CekSiswaModal onClose={() => {}} />);

    await waitFor(() => expect(screen.getByText(t('siswa.load_failed'))).toBeTruthy());
    expect(screen.getByText('Roster sedang tidak tersedia.')).toBeTruthy();
    expect(screen.queryByText(t('siswa.session_admin_only'))).toBeNull();
  });
});
