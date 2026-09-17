/**
 * i18n.keys.test.ts — Dictionary coverage guard.
 *
 * Fails when a key actually *used* by the UI is missing from the "id" or "jp"
 * dictionary. A missing key is not cosmetic: `t()` then renders the raw key in
 * the id UI, and Japanese users silently fall back to the Indonesian text.
 *
 * Scope of "used":
 *   1. literal `t('key')` / `t("key")` calls,
 *   2. `data-lang="key"` elements (translated via translateDataLang),
 *   3. key-shaped string literals inside src (labels stored in data
 *      structures and later passed to t(), e.g. MasterFullForm labelKey,
 *      berkasCatalog labels, EsignNaiteiModal areas).
 *
 * Known limitation (deliberate): keys assembled at runtime from parts
 * (e.g. t('option.' + x)) cannot be resolved statically — keep those keys in
 * both dictionaries manually. Dictionary files are parsed as source text (not
 * imported) so this test has no runtime dependency on the store.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const I18N_TS = join(ROOT, 'src', 'store', 'i18n.ts');
const I18N_JP_TS = join(ROOT, 'src', 'store', 'i18n-jp.ts');

// Known top-level namespaces — used only for the data-driven literal scan.
const NS = [
  'header', 'ui', 'public', 'button', 'form', 'siswa', 'apply', 'master',
  'ai_cv', 'share', 'admin', 'dash', 'candidate', 'option', 'status',
  'login', 'toast', 'error', 'table', 'landing', 'cvmini', 'esign',
  'changepass', 'doc', 'toolbar', 'bottomnav', 'cv', 'ai', 'input', 'db',
  'pelamar', 'wa', 'footer',
].join('|');

/**
 * Curated Indonesian UI tokens. Deliberately NOT a generic word list: brand
 * and proper names ("Logo ASJ", "WhatsApp", "Instagram", "QR Code",
 * "Google Maps", "Admin") must never trip this. A noisy gate is a skipped
 * gate.
 */
const ID_TOKENS = [
  'Cek', 'Kandidat', 'Tandai', 'Segera', 'Lihat', 'Terdaftar', 'Lengkap',
  'Pratinjau', 'Pamflet', 'Hapus', 'Simpan', 'Batal', 'Kirim', 'Daftar',
  'Masuk', 'Keluar', 'Gagal', 'Berhasil', 'Lanjut', 'Kembali', 'Unduh',
  'Tutup', 'Profil', 'kandidat', 'hadir',
];

/**
 * Wider list for the text-node scan. An attribute value is short and often
 * carries a brand name, so the list above stays tight; a text node is
 * user-visible copy, so this one adds the words that actually shipped as bare
 * text nodes (Usia next to a field that used t(), admin modal titles, …).
 */
const ID_TOKENS_TEXT = [
  ...ID_TOKENS,
  'Usia', 'Aksi', 'Waktu', 'Jadwal', 'Kategori', 'Alamat', 'Dokumen',
  'Lokasi', 'Jenis', 'Cetak', 'Tambah', 'Cari', 'Pilih', 'Memuat',
  'Menyimpan', 'Kaigo', 'Perawatan', 'Selengkapnya', 'Pengumuman',
  'Pemberkasan', 'Wawancara', 'Pelatihan', 'Keberangkatan', 'Berkas',
  'Lamaran', 'Lowongan', 'Keterangan', 'Catatan', 'Pengaturan',
  'Berikut', 'Sebelumnya', 'Halaman', 'Struktur', 'Skema', 'Terminal',
  'Muncul', 'Berjalan', 'Pertahankan', 'Dicetak', 'Dihapus', 'Permanen',
  'Perubahan', 'Dijalankan', 'Semua', 'Teks', 'Hanya', 'Bisa', 'Oleh',
  'Buat', 'Tetap', 'Laki-laki', 'Perempuan', 'Belum',
];

/** Every file under src/ — shared by the coverage scan and the attribute scan. */
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function collectUsed(): Set<string> {
  const used = new Set<string>();
  const tKeyRe = /\bt\(\s*(["'])([^"']+?)\1/g;
  const dataLangRe = /data-lang=["']([^"']+)["']/g;
  const litRe = new RegExp(`["']((?:${NS})\\.[A-Za-z0-9_]+(?:\\.[A-Za-z0-9_]+)*)["']`, 'g');

  for (const file of walk(join(ROOT, 'src'))) {
    // Only source code carries t()/data-lang/label usage — scanning assets
    // (sprite.svg, css, ...) pulls in bare words like "admin" as false hits.
    if (!/\.(tsx?|astro)$/.test(file)) continue;
    const name = relative(ROOT, file);
    if (name.includes('test')) continue; // skip test files (they often mock t)
    if (file === I18N_TS || file === I18N_JP_TS) continue;
    const text = readFileSync(file, 'utf-8');
    for (const m of text.matchAll(tKeyRe)) used.add(m[2]);
    for (const m of text.matchAll(dataLangRe)) used.add(m[1]);
    for (const m of text.matchAll(litRe)) used.add(m[1]);
  }
  return used;
}

function parseKeys(text: string, startMarker: string, endMarker?: string): string[] {
  const body = endMarker
    ? text.slice(text.indexOf(startMarker), text.indexOf(endMarker))
    : text;
  const keys: string[] = [];
  for (const line of body.split('\n')) {
    // Definition lines look like:   "some.key": "...",
    const m = /^\s*"([^"]+)":\s*"/.exec(line);
    if (m) keys.push(m[1]);
  }
  return keys;
}

function countDuplicates(keys: string[]): string[] {
  const seen = new Map<string, number>();
  for (const k of keys) seen.set(k, (seen.get(k) ?? 0) + 1);
  return [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k);
}

describe('i18n dictionary coverage', () => {
  const used = collectUsed();
  const idKeys = parseKeys(readFileSync(I18N_TS, 'utf-8'), 'id: {', 'jp: {}');
  const jpKeys = parseKeys(readFileSync(I18N_JP_TS, 'utf-8'), '{');

  it('scans a meaningful number of source keys (sanity: walk found sources)', () => {
    expect(used.size).toBeGreaterThan(400);
  });

  it('contains no duplicate keys', () => {
    expect(countDuplicates(idKeys)).toEqual([]);
    expect(countDuplicates(jpKeys)).toEqual([]);
  });

  it('has every used key in the "id" dictionary', () => {
    const present = new Set(idKeys);
    const missing = [...used].filter((k) => !present.has(k)).sort();
    expect(missing, [
      'Keys used via t()/data-lang/labels are missing from the "id" dictionary.',
      'They render as raw text (e.g. "apply.nama_label"). Add them to src/store/i18n.ts.',
      '',
      ...missing.map((k) => `  - ${k}`),
    ].join('\n')).toEqual([]);
  });

  it('has every used key in the "jp" dictionary', () => {
    const present = new Set(jpKeys);
    const missing = [...used].filter((k) => !present.has(k)).sort();
    expect(missing, [
      'Keys used via t()/data-lang/labels are missing from the "jp" dictionary.',
      'Japanese users would silently see the Indonesian fallback. Add them to src/store/i18n-jp.ts.',
      '',
      ...missing.map((k) => `  - ${k}`),
    ].join('\n')).toEqual([]);
  });

  it('leaves no Indonesian copy in raw title/alt/aria-label attributes', () => {
    // The three checks above only see t(), data-lang and key-shaped literals.
    // A tooltip written as `title="Cek List Kandidat Terdaftar"` is none of
    // those, so it stays Indonesian forever and nothing turns red — which is
    // exactly how the SILVER badge in CandidateDash.tsx survived while the gold
    // and bronze badges either side of it used t(). Same for the admin row
    // actions ("Lihat profil/CV kandidat", "Chat WA", "Tandai gagal …").
    //
    // Fixing one of these is either t('some.key') (tsx) or adding
    // data-lang-title / data-lang-aria (astro) — translateDataLang() already
    // supports both.
    // `(?<!-)` matters: without it, `data-lang-title="x"` matches as if it were
    // a raw `title="x"`, and every already-fixed tooltip shows up as a hit.
    const checks = [
      { re: /(?<!-)\btitle="([^"{}]+)"/g, optOut: /data-lang-title=/, fix: 'data-lang-title' },
      { re: /(?<!-)\baria-label="([^"{}]+)"/g, optOut: /data-lang-aria=/, fix: 'data-lang-aria' },
      { re: /(?<!-)\balt="([^"{}]+)"/g, optOut: /data-lang-alt=/, fix: 't("…")' },
    ];

    const hits: string[] = [];
    for (const file of walk(join(ROOT, 'src'))) {
      if (!/\.(tsx?|astro)$/.test(file)) continue;
      const name = relative(ROOT, file);
      if (name.includes('test')) continue;
      if (file === I18N_TS || file === I18N_JP_TS) continue;
      const lines = readFileSync(file, 'utf-8').split('\n');
      lines.forEach((line, idx) => {
        // <BaseLayout title="…"> is the document <title>: server-rendered SEO
        // metadata. translateDataLang() only runs in the browser, so it cannot
        // fix these — deliberately out of scope, not a false negative.
        if (/<BaseLayout/.test(line)) return;
        for (const { re, optOut, fix } of checks) {
          // A literal sitting next to its data-lang-* twin is the deliberate
          // pre-hydration default (same reason Footer.astro inlines
          // FOOTER_BG_DEFAULT): JS overwrites it on load.
          if (optOut.test(line)) continue;
          for (const m of line.matchAll(re)) {
            if (ID_TOKENS.some((tok) => m[1].includes(tok))) {
              hits.push(`  - ${name}:${idx + 1}  ${m[0]}   → use ${fix}`);
            }
          }
        }
      });
    }

    expect(hits, [
      'Untranslated Indonesian found inside a raw title/alt/aria-label attribute.',
      'The dictionary-coverage checks cannot see these. Use t("key") in .tsx, or',
      'data-lang-title / data-lang-aria in .astro (translateDataLang handles both).',
      '',
      ...hits,
    ].join('\n')).toEqual([]);
  });

  it('leaves no Indonesian copy in bare JSX/HTML text nodes', () => {
    // The four checks above see t(), data-lang, key-shaped literals and raw
    // title/alt/aria attributes. A bare text node is none of those, so it
    // stays Indonesian forever and nothing turns red — which is exactly how
    // "Usia" survived in MasterFullForm right next to a field that used
    // t("master.fam_pekerjaan"), how "Kembali" survived as the ApplyFullForm
    // back button, and how "Edit Data Kandidat" and "List Kandidat" survived
    // as admin modal titles.
    //
    // Extract the text between '>' and '<' — the actual text node — and flag
    // it when it reads as Indonesian. Braces are excluded from the capture so
    // a JSX expression ({t(...)}) can never match; quotes, parens, '+' and
    // '=' are excluded as well so string-built HTML never matches (that is
    // why this is scoped to markup files rather than all of src: pdf.ts and
    // RirekishoBuilder assemble HTML in string concatenation, and their
    // labels are not addressable by t()).
    const TEXT_NODE = />([^<>{}]*)</g;
    const TEXT_EOL = />([^<>{}]*)$/g;   // text node running to end of line
    const BAD_CHARS = /["'()=;+&|`]/;
    const tokenRe = new RegExp(`\\b(${ID_TOKENS_TEXT.join('|')})\\b`);

    const hits: string[] = [];
    for (const file of walk(join(ROOT, 'src'))) {
      // Markup only. A .ts file has no text nodes, only strings.
      if (!/\.(tsx|astro)$/.test(file)) continue;
      const name = relative(ROOT, file);
      if (name.includes('test')) continue;
      const lines = readFileSync(file, 'utf-8').split('\n');
      lines.forEach((line, idx) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
        // Same opt-out as the attribute check: a literal on a line that also
        // carries data-lang is the deliberate pre-hydration default, because
        // translateDataLang() only assigns textContent once JS runs.
        if (/data-lang=/.test(line)) return;
        for (const re of [TEXT_NODE, TEXT_EOL]) {
          re.lastIndex = 0;
          for (const m of line.matchAll(re)) {
            const txt = m[1].trim();
            if (!txt || BAD_CHARS.test(txt)) continue;
            if (!tokenRe.test(txt)) continue;
            hits.push(`  - ${name}:${idx + 1}  ${JSON.stringify(txt)}   → wrap in t("…") or add data-lang`);
          }
        }
      });
    }

    expect(hits, [
      'Untranslated Indonesian found in a bare JSX/HTML text node.',
      'The dictionary-coverage and attribute checks cannot see these. Use',
      't("key") in .tsx, or data-lang on the element in .astro.',
      '',
      ...hits,
    ].join('\n')).toEqual([]);
  });
});
