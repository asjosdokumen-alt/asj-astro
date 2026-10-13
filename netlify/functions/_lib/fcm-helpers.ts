import { supabaseJson } from './db/client.ts';
import * as fcm from './fcm-server.ts';

// ===========================================================================
// fcm-helpers.ts — Shared helper untuk notifikasi FCM push
// Dipakai oleh actions-upload.ts, actions-schedule.ts, dll.
// ===========================================================================

/**
 * Ambil semua token admin dari fcm_tokens.
 * Admin = token yang WA-nya BUKAN format kandidat (628xxxxxxxxxx).
 * Termasuk: test tokens, tokens dengan WA "ADMIN", atau WA kosong.
 */
export async function getAdminTokens(): Promise<string[]> {
  try {
    const rows = (await supabaseJson('GET', 'fcm_tokens', {
      query: { select: 'token,wa', limit: 200 },
    })) as any[];
    if (!Array.isArray(rows)) return [];
    return rows
      .filter((t) => {
        const wa = String(t.wa || '');
        // Kandidat WA: 628xxxxxxxxxx (12-14 digit)
        // Admin WA: selain format itu
        return !wa || !/^628\d{9,11}$/.test(wa);
      })
      .map((t) => t.token)
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Ambil semua token kandidat berdasarkan WA (bisa multiple device).
 */
export async function getKandidatTokens(wa: string): Promise<string[]> {
  try {
    const rows = (await supabaseJson('GET', 'fcm_tokens', {
      query: { select: 'token', wa: 'eq.' + wa, limit: 20 },
    })) as any[];
    if (!Array.isArray(rows)) return [];
    return rows.map((t) => t.token).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Kirim notifikasi ke semua admin — fire-and-forget.
 * Error diam-diam (tidak membatalkan operasi pemanggil).
 */
export async function notifyAdmins(title: string, body: string, url = '/'): Promise<void> {
  try {
    const tokens = await getAdminTokens();
    if (tokens.length === 0) return;
    const { invalidTokens } = await fcm.sendMulticast(tokens, title, body, url);
    await pruneDeadTokens(invalidTokens);
  } catch {
    // best-effort — notif gagal jangan ganggu flow utama
  }
}

/**
 * Kirim notifikasi ke kandidat tertentu (semua device) — fire-and-forget.
 */
export async function notifyKandidat(
  wa: string,
  title: string,
  body: string,
  url = '/',
): Promise<void> {
  try {
    const tokens = await getKandidatTokens(wa);
    if (tokens.length === 0) return;
    const { invalidTokens } = await fcm.sendMulticast(tokens, title, body, url);
    await pruneDeadTokens(invalidTokens);
  } catch {
    // best-effort
  }
}

/**
 * Hapus token yang DITOLAK FCM (perangkat sudah tidak terdaftar).
 *
 * KENAPA INI ADA — 2026-10-13. `sendMulticast()` sudah menghitung
 * `invalidTokens` sejak awal, tapi TIDAK ADA pemanggil yang memakainya: tidak
 * ada satu pun DELETE atas `fcm_tokens` di seluruh repo. Akibatnya token mati
 * menumpuk selamanya. Terukur pada tabel produksi: **25 baris admin, hanya 5
 * hidup** (20 mati), dan 11 dari 15 token kandidat yang disampel juga mati.
 *
 * Gejalanya yang dilaporkan pemilik: "tidak ada notif saat kandidat update
 * biodata" — padahal jalur kodenya benar. Push memang DIKIRIM, tapi hampir
 * semua penerimanya sudah mati, dan kegagalannya ditelan `catch {}`.
 *
 * Token yang gagal karena sebab LAIN (jaringan, kuota, 5xx) TIDAK dihapus:
 * `sendPushNotification()` mengembalikan `false` untuk semua kegagalan, jadi
 * memakai `invalidTokens` apa adanya akan menghapus token yang sebenarnya
 * sehat pada satu gangguan jaringan sesaat.
 */
export async function pruneDeadTokens(tokens: string[]): Promise<number> {
  const list = Array.from(new Set((tokens || []).filter(Boolean)));
  if (list.length === 0) return 0;

  const confirmed: string[] = [];
  for (const token of list) {
    if (await isTokenUnregistered(token)) confirmed.push(token);
  }
  if (confirmed.length === 0) return 0;

  try {
    await supabaseJson('DELETE', 'fcm_tokens', {
      query: { token: 'in.(' + confirmed.join(',') + ')' },
      headers: { Prefer: 'return=minimal' },
    } as Record<string, unknown>);
    console.info('[FCM] pruned ' + confirmed.length + ' dead token(s)');
    return confirmed.length;
  } catch (e) {
    console.error('[FCM] prune failed:', (e as Error).message);
    return 0;
  }
}

/**
 * Benarkah token ini ditolak karena PERANGKAT sudah tidak terdaftar?
 *
 * FCM HTTP v1 membalas 404 dengan `error.status = 'NOT_FOUND'` dan pesan
 * 'Requested entity was not found' / 'Device unregistered' / 'NotRegistered'
 * (ketiganya terukur atas token asli 2026-10-13). Itu satu-satunya jawaban yang
 * berarti "token mati permanen". Galat lain (401, 429, 500, jaringan) bukan
 * bukti token mati, jadi TIDAK dihapus.
 *
 * Sengaja mengirim ulang satu probe, bukan mempercayai `invalidTokens` buta:
 * biaya satu request per token mati jauh lebih murah daripada menghapus token
 * milik admin yang sedang tidak menerima karena gangguan sesaat.
 *
 * PENTING — kenapa `fetch`-nya ada di `fcm-server.ts`, bukan di sini:
 * gerbang `scripts/ci/io-boundary.mjs` melarang `fetch()` mentah di luar
 * `kernel/http.ts`, dan daftar pengecualiannya **hanya boleh menyusut**.
 * `fcm-server.ts` sudah ada di daftar itu (dengan `max: 2`); menambah
 * `fcm-helpers.ts` akan melanggar invarian tersebut. Jadi probe memakai helper
 * di sana alih-alih `fetch` sendiri — aturan ditegakkan, bukan dilonggarkan.
 */
async function isTokenUnregistered(token: string): Promise<boolean> {
  try {
    return await fcm.isDeviceUnregistered(token);
  } catch {
    return false;
  }
}

