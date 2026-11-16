// @vitest-environment node
/**
 * preflight.test.ts — kapan unduhan paket game DITAWARKAN.
 *
 * KENAPA DI `e2e/`: `indexer` menghitung seluruh berkas di bawah `src/**`, dan
 * suite ini tidak menguji kode `src/` sama sekali — ia menguji skrip publik
 * `public/godot/preflight.js` yang dimuat halaman. Menaruhnya di `e2e/` tidak
 * menggeser counter beku.
 *
 * YANG DIUJI
 *   1. Tabel kebenaran keputusan (murni, tanpa DOM).
 *   2. Kabelnya: skrip itu benar-benar dimuat ketiga halaman, dan page-bridge
 *      memanggilnya saat paket BELUM lengkap. Tanpa (2), (1) bisa hijau
 *      sementara tidak ada yang pernah memanggil fungsinya.
 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const kode = readFileSync(new URL('../public/godot/preflight.js', import.meta.url), 'utf8');
const kotak: { window: Record<string, unknown> } = { window: {} };
vm.runInNewContext(kode, kotak);
type Putusan = { tawarkan: boolean; alasan: string };
const preflight = (
  kotak.window as {
    ASJPreflight: { putuskan: (m: Record<string, unknown>) => Putusan; TUNDA_MS: number };
  }
).ASJPreflight;

const putuskan = (masukan: Record<string, unknown>): Putusan => preflight.putuskan(masukan);

describe('putuskanPreflight — tabel kebenaran', () => {
  const sekarang = 1_000_000;

  it('paket sudah lengkap → tidak menawarkan', () => {
    expect(putuskan({ tersimpan: true, tipe: 'wifi', sekarang })).toEqual({
      tawarkan: false,
      alasan: 'sudah-tersimpan',
    });
  });

  it('mode hemat data → tidak menawarkan, sekalipun Wi-Fi', () => {
    expect(putuskan({ hematData: true, tipe: 'wifi', sekarang }).alasan).toBe('hemat-data');
  });

  it('"Nanti" menunda sampai waktunya lewat', () => {
    expect(putuskan({ tipe: 'wifi', ditundaSampai: sekarang + 1, sekarang }).alasan).toBe('ditunda');
    expect(putuskan({ tipe: 'wifi', ditundaSampai: sekarang - 1, sekarang }).tawarkan).toBe(true);
  });

  it('Wi-Fi atau 4G → menawarkan', () => {
    expect(putuskan({ tipe: 'wifi', sekarang })).toEqual({
      tawarkan: true,
      alasan: 'koneksi-bagus',
    });
    expect(putuskan({ effectiveType: '4g', sekarang }).tawarkan).toBe(true);
  });

  it('3G/2G atau koneksi tak diketahui → TIDAK menawarkan', () => {
    /* 10 MB di jaringan lambat bukan tawaran, melainkan jebakan kuota. */
    expect(putuskan({ effectiveType: '3g', sekarang }).tawarkan).toBe(false);
    expect(putuskan({ effectiveType: '2g', sekarang }).tawarkan).toBe(false);
    expect(putuskan({ tipe: 'cellular', sekarang }).tawarkan).toBe(false);
    /* Safari tidak punya Network Information API sama sekali. */
    expect(putuskan({ sekarang }).tawarkan).toBe(false);
  });

  it('penundaan tiga hari, bukan selamanya', () => {
    expect(preflight.TUNDA_MS).toBe(3 * 24 * 60 * 60 * 1000);
  });
});

describe('kabel preflight di halaman', () => {
  for (const halaman of ['arcade', 'kotoba', 'matematika']) {
    it(`/ ${halaman} memuat /godot/preflight.js`, () => {
      const astro = readFileSync(new URL(`../src/pages/${halaman}.astro`, import.meta.url), 'utf8');
      expect(astro).toContain('/godot/preflight.js');
      /* Harus SEBELUM page-bridge: bridge memanggil window.ASJPreflight. */
      expect(astro.indexOf('/godot/preflight.js')).toBeLessThan(
        astro.indexOf('/godot/page-bridge.js'),
      );
    });
  }

  it('page-bridge memanggil preflight hanya saat paket BELUM lengkap', () => {
    const bridge = readFileSync(new URL('../public/godot/page-bridge.js', import.meta.url), 'utf8');
    expect(bridge).toContain('tawarkanPreflight(unduhBtn)');
    /* Kalau semua berkas ada, yang tampil status "siap" — bukan tawaran. */
    const cabang = bridge.slice(bridge.indexOf('hasil.every(Boolean)'), bridge.indexOf('hasil.every(Boolean)') + 320);
    expect(cabang).toContain('Paket offline siap.');
    expect(cabang).toContain('tawarkanPreflight');
  });
});
