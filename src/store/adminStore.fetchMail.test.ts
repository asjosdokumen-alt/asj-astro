// ==========================================
// TESTS: adminStore.fetchMailFromAPI — transport + kesegaran sesudah tulis
//
// Fungsi ini dulu menulis `fetch`-nya sendiri. Sekarang ia lewat klien bersama,
// dan dua sifatnya diuji di TINGKAT KABEL, bukan dengan membaca sumbernya:
//
//   1. Envelope POST memakai kunci `payload` (kunci yang benar-benar dibaca
//      backend) dan diarahkan ke entry point get-app-data.
//   2. `force: true` benar-benar diteruskan — refresh SESUDAH "tandai sudah
//      dibaca" tidak boleh dijawab dari cache baca 30 detik, kalau tidak aksi
//      admin sendiri akan terlihat tidak terjadi apa-apa. Dibuktikan sebagai
//      PUTARAN JARINGAN KEDUA, bukan sebagai pemeriksaan flag.
//
// Tes ketiga ada supaya tes kedua tidak hampa: ia menunjukkan bahwa cache di
// harness ini memang AKTIF, jadi "2 fetch" di tes kedua adalah pilihan `force`,
// bukan karena cache-nya kebetulan mati.
// ==========================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const state: { isLoggedIn: boolean; sessionToken: string } = {
  isLoggedIn: true,
  sessionToken: '',
};

// `api.secure` menolak SEBELUM fetch kalau store tidak melaporkan sesi hidup,
// jadi mock ini wajib punya isLoggedIn + logout — tanpa itu tes gagal di
// asersi request, bukan di tempat yang benar.
vi.mock('./authReactive', () => ({
  authStore: { get: () => state, set: () => {}, listen: () => () => {} },
  logout: vi.fn(),
}));

import { mailList, fetchMailFromAPI } from './adminStore';
import api from '../lib/apiClient';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Responder getAppData yang meniru bentuk balasan backend untuk inbox. */
function inbox(ids: string[]) {
  return vi.fn(async () =>
    jsonResponse({ success: true, formInbox: ids.map((id) => ({ id, subject: `s${id}` })) }),
  );
}

beforeEach(() => {
  state.isLoggedIn = true;
  // Token unik per tes: cache baca hidup di sessionStorage dan berkunci token,
  // jadi token baru menjamin tidak ada tes yang menumpang hasil tes lain.
  state.sessionToken = `tok-${Math.random().toString(36).slice(2)}`;
  mailList.set([]);
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fetchMailFromAPI — transport', () => {
  it('mengirim envelope POST `payload` ke entry point get-app-data', async () => {
    const fetchMock = inbox(['a', 'b']);
    vi.stubGlobal('fetch', fetchMock);

    await fetchMailFromAPI();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toContain('get-app-data');
    expect(init.method).toBe('POST');

    const body = JSON.parse(String(init.body));
    expect(body.action).toBe('getAppData');
    // Kunci di kabel adalah `payload`, bukan `args` — backend menerima keduanya
    // (`body.payload || body.args`), jadi ini ganti nama, bukan perubahan perilaku.
    expect(body.payload).toEqual(['admin']);

    expect((mailList.get() as { id: string }[]).map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('force:true — panggilan kedua MENEMBAK ULANG, tidak dilayani cache 30 detik', async () => {
    const fetchMock = inbox(['a']);
    vi.stubGlobal('fetch', fetchMock);

    await fetchMailFromAPI();
    await fetchMailFromAPI();

    // Tanpa `force`, panggilan kedua dijawab dari cache baca ⇒ 1 fetch. Itulah
    // cacat yang membuat refresh sesudah "tandai sudah dibaca" tampak gagal.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('kontrol: pembacaan biasa memang dilayani cache — jadi tes di atas tidak hampa', async () => {
    const fetchMock = inbox(['a']);
    vi.stubGlobal('fetch', fetchMock);

    await api.secure('getAppData', ['admin'], { silent: true, onSessionInvalid: 'throw' });
    await api.secure('getAppData', ['admin'], { silent: true, onSessionInvalid: 'throw' });

    // Kalau angka ini 2, cache-nya mati dan tes `force` di atas tidak
    // membuktikan apa pun.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gagal → mailList TIDAK dikosongkan, daftar lama tetap tampil', async () => {
    mailList.set([{ id: 'lama' }]);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('boom');
      }),
    );

    await fetchMailFromAPI();

    expect(mailList.get()).toEqual([{ id: 'lama' }]);
    expect(errSpy).toHaveBeenCalled();
  });
});
