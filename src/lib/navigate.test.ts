/**
 * TESTS: src/lib/navigate.ts — jahitan navigasi tunggal
 *
 * Kenapa berkas ini ada (terukur 2026-10-20):
 *
 *   Object.getOwnPropertyDescriptor(window, 'location')
 *     → { configurable: false, get: fn, set: undefined }
 *
 * `location` bersifat `[LegacyUnforgeable]` menurut spesifikasi HTML, dan jsdom
 * 30 menegakkannya. `Object.defineProperty(window, 'location', …)`,
 * `delete window.location`, `vi.stubGlobal('location', …)` dan
 * `vi.stubGlobal('window', …)` SEMUANYA melempar "Cannot redefine property".
 * Bahkan `href` di instance Location ikut terkunci, dan `globalThis.window`
 * sendiri non-configurable.
 *
 * Konsekuensinya: TIDAK ADA cara mengamati sebuah redirect dari dalam tes selain
 * melalui satu modul yang bisa di-mock. Modul itu `navigate.ts`. Tes di bawah
 * menjaga agar jahitan itu tidak lapuk — kalau seseorang menulis
 * `window.location.href = …` lagi di suatu komponen, navigasi tersebut menjadi
 * TAK TERLIHAT bagi tes, dan gerbang seperti penjaga /ai-cv bisa rusak tanpa
 * satu tes pun merah.
 *
 * Ini bukan teori: sebelum jahitan ini ada, 38 tes di dua berkas gagal dengan
 * "Cannot redefine property: location" — dan 6 di antaranya (penjaga akses
 * /ai-cv) ternyata belum pernah benar-benar DIJALANKAN.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { navigateTo } from './navigate';

describe('navigate.ts — satu-satunya penulis location.href', () => {
  /** Hanya berkas ini yang boleh menulis `location.href`. */
  const ALLOWED = 'src/lib/navigate.ts';

  /** `location.href =` tapi BUKAN `==`, `===`, atau `=>`. */
  const WRITE = /location\.href\s*=(?![=>])/;

  /**
   * Buang komentar baris dan blok, supaya komentar tidak terhitung sebagai kode.
   *
   * Regex baris sengaja TIDAK memakai pola `[^:]//` ala vip.test.ts: skrip inline
   * di berkas .astro memuat `https://…`, dan pola itu bergantung pada lookbehind
   * yang tidak konsisten antar mesin. Di sini cukup pola eksplisit di bawah —
   * sudah diuji terhadap seluruh isi src/ saat ini.
   */
  function stripComments(src: string): string {
    return src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^[ \t]*\/\/[^\n]*/gm, '')
      .replace(/([^:'"`\w])\/\/[^\n]*/g, '$1');
  }

  function walk(dir: string, out: string[] = []): string[] {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p, out);
      else if (/\.(ts|tsx|astro)$/.test(e.name)) out.push(p);
    }
    return out;
  }

  it('tidak ada penulis location.href lain di src/ selain navigate.ts', () => {
    const offenders: string[] = [];
    for (const rel of walk('src')) {
      const norm = rel.split(sep).join('/');
      if (norm === ALLOWED) continue;
      const code = stripComments(readFileSync(rel, 'utf8'));
      if (WRITE.test(code)) offenders.push(norm);
    }
    expect(offenders).toEqual([]);
  });

  it('navigate.ts sendiri memakai jahitan itu (bukan assign tanpa arti)', () => {
    const code = stripComments(readFileSync('src/lib/navigate.ts', 'utf8'));
    expect(WRITE.test(code)).toBe(true);
  });

  it('navigateTo adalah fungsi — kontrak yang dipakai 10 pemanggil', () => {
    expect(typeof navigateTo).toBe('function');
    expect(navigateTo.length).toBe(1);
  });
});
