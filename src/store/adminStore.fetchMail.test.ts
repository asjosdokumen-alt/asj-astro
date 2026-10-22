// ==========================================
// TESTS: adminStore.fetchMailFromAPI — transport + kesegaran sesudah tulis
//
// Fungsi ini dulu menulis `fetch`-nya sendiri. Sekarang ia lewat klien bersama
// DAN lewat cache modul `store/adminData` (fix egress 2026-10-22: pindah tab
// tidak boleh menarik 107 KB lagi). Dua sifatnya diuji di TINGKAT KABEL, bukan
// dengan membaca sumbernya:
//
//   1. Envelope POST memakai kunci `payload` (kunci yang benar-benar dibaca
//      backend) dan diarahkan ke entry point get-app-data.
//   2. `force: true` benar-benar diteruskan — refresh SESUDAH "tandai sudah
//      dibaca" tidak boleh dijawab dari cache, kalau tidak aksi admin sendiri
//      akan terlihat tidak terjadi apa-apa.
//   3. Tanpa `force`, panggilan KEDUA dilayani cache. Ini bukan pelengkap: ia
//      yang membuat (2) bermakna, karena kalau cache-nya mati, "2 fetch" di (2)
//      akan terjadi apa pun pilihan `force`-nya.
//
// ⚠ KENAPA `invalidateAdminData()` WAJIB DI `beforeEach`
// Cache-nya hidup di TINGKAT MODUL dan TIDAK berkunci token (sengaja: satu
// payload untuk semua tab). Versi pertama tes ini mengandalkan token acak per
// tes untuk isolasi — itu tidak mengisolasi apa pun, karena cache-nya tidak
// pernah melihat token. Akibatnya tes pertama mengisi cache, dan tes
// berikutnya menerima 0 fetch (bukan 1, bukan 2) sambil `mailList` terisi
// data milik tes sebelumnya. Gejalanya menyesatkan: "expected 2, got 0".
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
import { invalidateAdminData } from './adminData';

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
  state.sessionToken = `tok-${Math.random().toString(36).slice(2)}`;
  mailList.set([]);
  sessionStorage.clear();
  invalidateAdminData();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  invalidateAdminData();
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

  it('tanpa force: panggilan KEDUA dilayani cache modul (1 fetch)', async () => {
    const fetchMock = inbox(['a']);
    vi.stubGlobal('fetch', fetchMock);

    await fetchMailFromAPI();
    await fetchMailFromAPI();

    // Inilah fix egress 2026-10-22: membuka tab Mail berulang kali tidak lagi
    // menarik payload admin penuh. Kalau angka ini 2, cache-nya mati dan tes
    // `force` di bawah tidak membuktikan apa pun.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('force:true — panggilan kedua MENEMBAK ULANG, tidak dilayani cache', async () => {
    const fetchMock = inbox(['a']);
    vi.stubGlobal('fetch', fetchMock);

    await fetchMailFromAPI();
    await fetchMailFromAPI(true);

    expect(fetchMock).toHaveBeenCalledTimes(2);
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

  it('gagal TIDAK meracuni cache — percobaan berikutnya benar-benar menembak lagi', async () => {
    // `store/adminData` sengaja tidak menyimpan jawaban gagal: menyimpannya
    // berarti lima menit penuh semua tab menampilkan daftar kosong tanpa
    // mencoba lagi.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchMock = vi.fn(async () => {
      throw new Error('boom');
    });
    vi.stubGlobal('fetch', fetchMock);

    await fetchMailFromAPI();
    await fetchMailFromAPI();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(errSpy).toHaveBeenCalledTimes(2);
  });
});
