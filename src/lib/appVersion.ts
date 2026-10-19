/**
 * appVersion.ts — "build mana yang sedang saya pakai, dan apakah itu yang terbaru?"
 *
 * WHY THIS EXISTS
 * ---------------
 * Sampai sekarang tidak ada satu pun tempat di UI yang bisa menjawab pertanyaan
 * itu. Service worker memperbarui dirinya sendiri (setiap 5 menit `reg.update()`,
 * lalu `activate` mem-postMessage `ASJ_FORCE_RELOAD` dan halaman reload), jadi
 * situs MEMANG selalu jadi versi terbaru — tetapi seluruh prosesnya tak terlihat.
 * Akibatnya, satu-satunya cara tahu "apakah saya masih di build lama?" adalah
 * menebak, dan keluhan seperti "kok perubahannya tidak muncul" tidak bisa
 * dibedakan dari bug biasa.
 *
 * DUA ANGKA, BUKAN SATU
 * ---------------------
 * - `running` = `VERSION` milik service worker yang MENGONTROL halaman ini.
 *   Inilah build yang asetnya benar-benar disajikan ke tab ini.
 * - `latest`  = isi `/version.json` di server, ditulis oleh build yang sama
 *   (`scripts/build-sw-manifest.mjs`), jadi angkanya sebanding.
 *
 * Keduanya berasal dari SATU hash: `asj-astro-<12 hex>`. Kalau berbeda, tab ini
 * memakai build lama dan tombol "Muat ulang" memang akan mengubah sesuatu.
 *
 * KENAPA `/version.json` DI-FETCH DENGAN QUERY CACHE-BUSTER
 * ---------------------------------------------------------
 * Service worker LAMA (yang belum tahu soal berkas ini) akan memperlakukannya
 * sebagai aset statis dan menyimpannya lewat stale-while-revalidate. Tanpa
 * `?t=`, pemeriksaan kedua akan membaca salinan LAMA dari cache dan melaporkan
 * "sudah terbaru" pada tab yang justru basi. `sw.js` versi baru melewati
 * (`return`) path ini sepenuhnya; query-nya adalah sabuk pengaman untuk klien
 * yang masih memakai sw.js versi lama.
 */

/** Bentuk isi `/version.json` (ditulis saat build). */
export type VersionFile = {
  version: string;
  builtAt?: string;
};

/** Status perbandingan yang bisa ditampilkan ke pengguna. */
export type VersionState = 'unknown' | 'current' | 'stale';

const VERSION_PREFIX = 'asj-astro-';

/**
 * Versi pendek untuk ditampilkan: 12 hex terakhir dari `asj-astro-<hex>`.
 *
 * Nama lengkapnya (`asj-astro-28cc02065d3c`) terlalu panjang untuk satu baris
 * footer, dan 12 hex sudah persis sepanjang yang dipakai di VERSION itu sendiri.
 * Nilai tak dikenal dikembalikan apa adanya supaya tidak ada yang "hilang"
 * diam-diam saat formatnya berubah.
 */
export function shortVersion(raw: string | null | undefined): string {
  const v = (raw ?? '').trim();
  if (!v) return '—';
  if (v.startsWith(VERSION_PREFIX)) {
    const tail = v.slice(VERSION_PREFIX.length);
    return tail ? tail.slice(0, 12) : v;
  }
  return v;
}

/**
 * Bandingkan build yang berjalan dengan build terbaru di server.
 *
 * `unknown` bukan `current`: tanpa service worker (localhost, atau kunjungan
 * pertama sebelum SW aktif) kita TIDAK tahu build apa yang berjalan, dan
 * menampilkan "Terbaru" di situ adalah klaim yang tidak punya bukti.
 *
 * `asj-astro-dev` juga `unknown` — itu penanda `public/sw.js` yang belum
 * ditulis ulang oleh build, jadi tidak ada artinya untuk dibandingkan.
 */
export function compareVersion(
  running: string | null | undefined,
  latest: string | null | undefined,
): VersionState {
  const r = (running ?? '').trim();
  const l = (latest ?? '').trim();
  if (!r || !l) return 'unknown';
  if (r === 'asj-astro-dev' || l === 'asj-astro-dev') return 'unknown';
  return r === l ? 'current' : 'stale';
}

/** Ambil `/version.json` terbaru dari jaringan. `null` = tidak bisa diperiksa. */
export async function fetchLatestVersion(
  fetchImpl: typeof fetch = fetch,
): Promise<VersionFile | null> {
  try {
    const res = await fetchImpl(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (!data || typeof data !== 'object') return null;
    const version = (data as { version?: unknown }).version;
    if (typeof version !== 'string' || !version) return null;
    const builtAt = (data as { builtAt?: unknown }).builtAt;
    return {
      version,
      ...(typeof builtAt === 'string' ? { builtAt } : {}),
    };
  } catch {
    // Offline, 404 (build lama belum punya berkas ini), atau JSON rusak — semua
    // berarti "tidak bisa diperiksa", bukan "versi terbaru".
    return null;
  }
}

/**
 * Tanya `VERSION` ke service worker yang mengontrol halaman.
 *
 * Lewat MessageChannel karena `postMessage` satu arah: tanpa port balasan, SW
 * tidak punya cara mengirim jawabannya. `timeoutMs` wajib ada — SW yang sedang
 * sibuk atau sudah "zombie" tidak boleh membuat tombol "Periksa pembaruan"
 * menggantung selamanya.
 */
export function readRunningVersion(timeoutMs = 1500): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      resolve(null);
      return;
    }
    const controller = navigator.serviceWorker.controller;
    if (!controller) {
      resolve(null);
      return;
    }

    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };

    const timer = setTimeout(() => finish(null), timeoutMs);

    try {
      const channel = new MessageChannel();
      channel.port1.onmessage = (event: MessageEvent) => {
        const version = (event.data as { version?: unknown } | null)?.version;
        finish(typeof version === 'string' && version ? version : null);
      };
      controller.postMessage({ type: 'GET_VERSION' }, [channel.port2]);
    } catch {
      finish(null);
    }
  });
}
