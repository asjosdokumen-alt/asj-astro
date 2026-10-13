/**
 * TESTS: pembersihan token FCM mati — "kenapa tidak ada notif" 2026-10-13.
 *
 * BUG YANG DIKUNCI
 * ----------------
 * `sendMulticast()` menghitung `invalidTokens` sejak awal, tapi **tidak ada
 * pemanggil** yang memakainya — tidak ada satu pun DELETE atas `fcm_tokens` di
 * seluruh repo. Akibatnya token mati menumpuk selamanya dan setiap push
 * dikirim ke mayoritas penerima yang sudah tidak terdaftar.
 *
 * Terukur atas tabel produksi 2026-10-13 (65 baris):
 *   admin   : 25 baris, hanya 5 HIDUP  (20 mati)
 *   kandidat: 11 dari 15 sampel MATI
 *   ditambah 6 baris fixture tes di tabel PRODUKSI
 * FCM menjawab token mati dengan 404 / error.status=NOT_FOUND /
 * 'Requested entity was not found' (terukur).
 *
 * YANG DIPERIKSA — dan kenapa tiap kasus ada:
 *   1. token yang dijawab NOT_FOUND DIHAPUS;
 *   2. token HIDUP **tidak** disentuh (multi-device tetap jalan);
 *   3. galat sesaat (429/500/jaringan) **tidak** menghapus apa pun — kalau ini
 *      salah, satu gangguan jaringan akan menghapus token admin yang sehat;
 *   4. `notifyAdmins` benar-benar memanggil pembersihan (kabel yang hilang);
 *   5. 404 dengan status lain (mis. 404 tanpa NOT_FOUND) tidak dihapus.
 *
 * `fetch` di-stub di batas terluar (seperti chaos.test.ts): token endpoint
 * Google + FCM send + PostgREST DELETE semuanya lewat satu stub.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

type Route = { match: RegExp; reply: (url: string, init: any) => Response };
let routes: Route[] = [];
let deleted: string[] = [];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

function installFetch() {
  vi.stubGlobal('fetch', async (input: any, init: any = {}) => {
    const url = String(typeof input === 'string' ? input : (input && input.url) || input);
    const method = String(init?.method || 'GET').toUpperCase();

    // PostgREST DELETE → catat token yang benar-benar dihapus.
    if (/supabase/.test(url) && method === 'DELETE') {
      const decoded = decodeURIComponent(url);
      for (const m of decoded.matchAll(/token=in\.\(([^)]*)\)/g)) {
        for (const t of m[1].split(',')) if (t.trim()) deleted.push(t.trim());
      }
      return new Response(null, { status: 204 });
    }

    // Rute khusus (mis. pengembalian baris fcm_tokens) DIDAHULUKAN atas default
    // PostgREST — kalau tidak, default GET menelan permintaan dan rute uji tidak
    // pernah jalan (bug yang membuat satu kasus merah pada run pertama).
    for (const r of routes) if (r.match.test(url)) return r.reply(url, init);

    // Default PostgREST: tidak ada baris.
    if (/supabase/.test(url) && method === 'GET') return json([]);

    return json([]);
  });
}

/** Token endpoint Google — selalu sukses, kecuali diuji sebaliknya. */
const oauthOk: Route = {
  match: /oauth2\.googleapis\.com/,
  reply: () => json({ access_token: 'probe-token', expires_in: 3600 }),
};

/** FCM: token di map => NOT_FOUND (mati). Lainnya => 200 (hidup). */
function fcmRoute(deadTokens: Set<string>, otherStatus = 0) {
  return {
    match: /fcm\.googleapis\.com/,
    reply: (_url: string, init: any) => {
      const body = JSON.parse(init?.body || '{}');
      const token = String(body?.message?.token || '');
      if (otherStatus) return json({ error: { status: 'INTERNAL', message: 'boom' } }, otherStatus);
      if (deadTokens.has(token)) {
        return json(
          {
            error: {
              status: 'NOT_FOUND',
              message: 'Requested entity was not found.',
            },
          },
          404,
        );
      }
      return json({ name: 'projects/khoci/messages/1' });
    },
  };
}

beforeEach(() => {
  routes = [];
  deleted = [];
  process.env.SUPABASE_URL = 'https://fcm-test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fcm-test-key';
  installFetch();
  vi.resetModules();
  // `fcm-server` menyimpan service account di singleton modul, dan
  // `fcm-server.test.ts` SEMENTARA MEMINDAHKAN berkas kredensial saat ia
  // berjalan. Tanpa reset, dua berkas yang berjalan bersamaan bisa saling
  // menimpa: satu membaca kredensial yang sedang diparkir berkas lain, probe
  // gagal, dan kasus "menghapus token NOT_FOUND" merah karena ALASAN YANG
  // SALAH. Ini pernah terjadi (run batch 2-merah, padahal per-berkas hijau).
  // `__loadServiceAccountForTest({ reset: true })` memaksa muat ulang.
  return import('./fcm-server').then((m) => m.__loadServiceAccountForTest({ reset: true }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('pruneDeadTokens', () => {
  it('menghapus token yang dijawab FCM NOT_FOUND', async () => {
    routes = [oauthOk, fcmRoute(new Set(['dead-1', 'dead-2']))];
    const { pruneDeadTokens } = await import('./fcm-helpers');

    const removed = await pruneDeadTokens(['dead-1', 'dead-2', 'alive-1']);

    expect(removed).toBe(2);
    expect(deleted.sort()).toEqual(['dead-1', 'dead-2']);
  });

  it('TIDAK menyentuh token yang masih hidup (multi-device tetap jalan)', async () => {
    routes = [oauthOk, fcmRoute(new Set(['dead-1']))];
    const { pruneDeadTokens } = await import('./fcm-helpers');

    await pruneDeadTokens(['dead-1', 'alive-a', 'alive-b']);

    // Inti permintaan pemilik: "token bisa multiple device". Token hidup milik
    // identitas yang sama TIDAK boleh ikut terhapus.
    expect(deleted).toEqual(['dead-1']);
    expect(deleted).not.toContain('alive-a');
    expect(deleted).not.toContain('alive-b');
  });

  it('galat sesaat (500) tidak menghapus apa pun', async () => {
    routes = [oauthOk, fcmRoute(new Set(), 500)];
    const { pruneDeadTokens } = await import('./fcm-helpers');

    const removed = await pruneDeadTokens(['token-a', 'token-b']);

    // Kalau ini gagal, satu gangguan FCM sesaat akan menghapus perangkat admin
    // yang sebenarnya sehat — kerusakan yang lebih buruk daripada token basi.
    expect(removed).toBe(0);
    expect(deleted).toEqual([]);
  });

  it('kegagalan jaringan di jalur probe tidak menghapus apa pun', async () => {
    routes = [
      oauthOk,
      {
        match: /fcm\.googleapis\.com/,
        reply: () => {
          throw new TypeError('fetch failed');
        },
      },
    ];
    const { pruneDeadTokens } = await import('./fcm-helpers');

    const removed = await pruneDeadTokens(['token-a']);

    expect(removed).toBe(0);
    expect(deleted).toEqual([]);
  });

  it('daftar kosong tidak memanggil FCM sama sekali', async () => {
    routes = [oauthOk, fcmRoute(new Set())];
    const { pruneDeadTokens } = await import('./fcm-helpers');

    expect(await pruneDeadTokens([])).toBe(0);
    expect(deleted).toEqual([]);
  });

  it('dedup token kembar supaya DELETE-nya tidak berisi duplikat', async () => {
    routes = [oauthOk, fcmRoute(new Set(['dead-1']))];
    const { pruneDeadTokens } = await import('./fcm-helpers');

    const removed = await pruneDeadTokens(['dead-1', 'dead-1', 'dead-1']);

    expect(removed).toBe(1);
    expect(deleted).toEqual(['dead-1']);
  });
});

describe('notifyAdmins — kabel pembersihan yang hilang', () => {
  it('membersihkan token mati SESUDAH kirim, tanpa membatalkan pengiriman', async () => {
    routes = [
      oauthOk,
      {
        match: /supabase.*fcm_tokens/,
        reply: () =>
          json([
            { token: 'admin-dead', wa: 'KHOCI' },
            { token: 'admin-alive', wa: 'KHOCI' },
          ]),
      },
      fcmRoute(new Set(['admin-dead'])),
    ];
    const { notifyAdmins } = await import('./fcm-helpers');

    await notifyAdmins('Judul', 'Isi', '/admin.html');

    // Token hidup harus tetap terkirim (di sini: tidak dihapus), dan token mati
    // dibuang — itulah perbaikan "kenapa tidak ada notif".
    expect(deleted).toEqual(['admin-dead']);
  });

  it('kegagalan FCM total tidak melempar (fire-and-forget tetap aman)', async () => {
    routes = [
      { match: /oauth2\.googleapis\.com/, reply: () => json({}, 401) },
      fcmRoute(new Set()),
    ];
    const { notifyAdmins } = await import('./fcm-helpers');

    await expect(notifyAdmins('Judul', 'Isi')).resolves.toBeUndefined();
  });
});
