/**
 * appVersion.test.ts — penjaga logika "build mana yang saya pakai".
 *
 * Yang diuji di sini adalah bagian yang MENENTUKAN TAMPILAN, bukan komponennya:
 * kalau `compareVersion` salah menyimpulkan "current", tombol "Muat ulang"
 * tidak pernah muncul dan pengguna duduk di build lama tanpa tahu — kegagalan
 * yang justru ingin dicegah fitur ini.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  compareVersion,
  fetchLatestVersion,
  readRunningVersion,
  shortVersion,
} from './appVersion';

describe('shortVersion', () => {
  it('memotong prefix build menjadi 12 hex', () => {
    expect(shortVersion('asj-astro-28cc02065d3c')).toBe('28cc02065d3c');
  });

  it('memotong hash yang lebih panjang ke 12 karakter', () => {
    expect(shortVersion('asj-astro-abcdef0123456789')).toBe('abcdef012345');
  });

  it('mengembalikan nilai asing apa adanya, tidak menelannya', () => {
    expect(shortVersion('asj-astro-dev')).toBe('dev');
    expect(shortVersion('v1.2.3')).toBe('v1.2.3');
  });

  it('null/kosong menjadi tanda pisah, bukan string kosong', () => {
    expect(shortVersion(null)).toBe('—');
    expect(shortVersion(undefined)).toBe('—');
    expect(shortVersion('   ')).toBe('—');
  });
});

describe('compareVersion', () => {
  it('versi sama = current', () => {
    expect(compareVersion('asj-astro-aaa', 'asj-astro-aaa')).toBe('current');
  });

  it('versi berbeda = stale — inilah satu-satunya keadaan yang memunculkan tombol', () => {
    expect(compareVersion('asj-astro-aaa', 'asj-astro-bbb')).toBe('stale');
  });

  it('tanpa service worker (localhost / kunjungan pertama) = unknown, BUKAN current', () => {
    // Menampilkan "Terbaru" tanpa SW berarti mengklaim sesuatu yang tidak
    // diukur. `unknown` membuat UI diam.
    expect(compareVersion(null, 'asj-astro-bbb')).toBe('unknown');
    expect(compareVersion('asj-astro-aaa', null)).toBe('unknown');
    expect(compareVersion('', '')).toBe('unknown');
  });

  it('penanda dev dari public/sw.js = unknown, bukan stale', () => {
    // `asj-astro-dev` berarti build belum menulis ulang VERSION; membanding-
    // kannya akan memunculkan tombol "Muat ulang" di setiap muat halaman lokal.
    expect(compareVersion('asj-astro-dev', 'asj-astro-bbb')).toBe('unknown');
    expect(compareVersion('asj-astro-aaa', 'asj-astro-dev')).toBe('unknown');
  });
});

describe('fetchLatestVersion', () => {
  const ok = (body: unknown) =>
    ({ ok: true, json: async () => body }) as unknown as Response;

  it('membaca version + builtAt dari /version.json', async () => {
    const fetchImpl = vi.fn(async () => ok({ version: 'asj-astro-bbb', builtAt: '2026-10-19T12:00:00Z' }));
    await expect(fetchLatestVersion(fetchImpl as unknown as typeof fetch)).resolves.toEqual({
      version: 'asj-astro-bbb',
      builtAt: '2026-10-19T12:00:00Z',
    });
  });

  it('meminta dengan cache-buster dan no-store', async () => {
    // Tanpa keduanya, pemeriksaan kedua membaca salinan LAMA (sw.js versi
    // sebelumnya menyimpan berkas ini lewat stale-while-revalidate) dan
    // melaporkan "terbaru" pada tab yang justru basi.
    const fetchImpl = vi.fn(async () => ok({ version: 'asj-astro-bbb' }));
    await fetchLatestVersion(fetchImpl as unknown as typeof fetch);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/^\/version\.json\?t=\d+$/);
    expect(init.cache).toBe('no-store');
  });

  it('404 (build lama belum punya berkas ini) = null, bukan lempar', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, json: async () => ({}) }) as unknown as Response);
    await expect(fetchLatestVersion(fetchImpl as unknown as typeof fetch)).resolves.toBeNull();
  });

  it('jaringan mati = null', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('offline');
    });
    await expect(fetchLatestVersion(fetchImpl as unknown as typeof fetch)).resolves.toBeNull();
  });

  it('JSON tanpa version = null — bukan objek setengah jadi', async () => {
    const fetchImpl = vi.fn(async () => ok({ builtAt: '2026-10-19' }));
    await expect(fetchLatestVersion(fetchImpl as unknown as typeof fetch)).resolves.toBeNull();
  });
});

describe('readRunningVersion', () => {
  it('menanyakan VERSION ke service worker yang mengontrol halaman', async () => {
    const posted: unknown[] = [];
    const fakeController = {
      postMessage: (msg: unknown, ports?: MessagePort[]) => {
        posted.push(msg);
        // Tiru balasan SW: port yang dikirim halaman dipakai untuk menjawab.
        const port = ports?.[0];
        port?.postMessage({ type: 'VERSION', version: 'asj-astro-aaa' });
      },
    };
    const original = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { controller: fakeController },
    });

    try {
      await expect(readRunningVersion(500)).resolves.toBe('asj-astro-aaa');
      expect(posted[0]).toEqual({ type: 'GET_VERSION' });
    } finally {
      if (original) Object.defineProperty(navigator, 'serviceWorker', original);
      else Reflect.deleteProperty(navigator as unknown as Record<string, unknown>, 'serviceWorker');
    }
  });

  it('tanpa controller (belum ada SW) = null', async () => {
    const original = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { controller: null },
    });
    try {
      await expect(readRunningVersion(50)).resolves.toBeNull();
    } finally {
      if (original) Object.defineProperty(navigator, 'serviceWorker', original);
      else Reflect.deleteProperty(navigator as unknown as Record<string, unknown>, 'serviceWorker');
    }
  });
});
