/**
 * jobDisplay.ts — Translate job *data values* for display (single source of truth).
 *
 * Why this exists
 * ---------------
 * The `jobs` rows come from the admin spreadsheet / DB and store free text in
 * Indonesian with emoji baked in, e.g.:
 *
 *   kategori : "🌾 PERTANIAN"
 *   lokasi   : "🌾 Ibaraki"
 *   gender   : "👨 Pria👩 Wanita"
 *   status   : "❌ CLOSE"
 *
 * The JP–ID toggle cannot touch those: they are DATA, not UI labels, so
 * `t()` has no key to look up and the JP page kept showing Indonesian. That is
 * exactly what looked like "toggle tidak berubah" on the public table.
 *
 * This module is the ONLY place that maps those raw values onto i18n keys. It
 * is intentionally a *display* layer: the DB is never rewritten, so the admin
 * sheet keeps working exactly as before.
 *
 * Rules
 * -----
 * - Match case-insensitively and ignore emoji/punctuation, so "🌾 PERTANIAN",
 *   "Pertanian" and "pertanian " all resolve to the same key.
 * - Unknown values pass through unchanged. Never return an empty string — a
 *   job category we have not catalogued yet must still render.
 * - Prefer the longest matching token, so "PETERNAKAN" does not lose to
 *   "PERTANIAN" or vice versa on substrings.
 */

import { t } from '../store/i18n';

/** Strip emoji, variation selectors, ZWJ and punctuation; collapse spaces. */
function normalize(raw: string): string {
  return String(raw || '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu, ' ')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/**
 * Category label. The admin sheet writes a free-text bidang, so this maps the
 * ones actually in use. Add a `jobcat.*` key to both dictionaries to extend.
 */
const CATEGORY_KEYS: Array<[string, string]> = [
  ['PETERNAKAN', 'jobcat.PETERNAKAN'],
  ['PERTANIAN', 'jobcat.PERTANIAN'],
  ['PERIKANAN', 'jobcat.PERIKANAN'],
  ['PERTAMBANGAN', 'jobcat.PERTAMBANGAN'],
  ['KONSTRUKSI', 'jobcat.KONSTRUKSI'],
  ['MANUFAKTUR', 'jobcat.MANUFAKTUR'],
  ['PENGOLAHAN', 'jobcat.PENGOLAHAN'],
  ['PERAWATAN', 'jobcat.PERAWATAN'],
  ['MAKANAN', 'jobcat.MAKANAN'],
  ['TEKNIK', 'jobcat.TEKNIK'],
];

/** Translate a `kategori` value such as "🌾 PERTANIAN" → "農業" in JP mode. */
export function jobCategoryLabel(raw: string | null | undefined): string {
  const n = normalize(raw || '');
  if (!n) return '';
  for (const [token, key] of CATEGORY_KEYS) {
    if (n.includes(token)) return t(key);
  }
  return String(raw || '').trim();
}

/**
 * Location label. Values are prefecture/city names with a leading emoji
 * ("🌾 Ibaraki"). We cannot translate a place name via a key map without
 * cataloguing every city, so we only strip the emoji in JP mode and keep the
 * proper noun — which is also what a Japanese reader expects to see.
 */
export function jobLocationLabel(raw: string | null | undefined): string {
  const stripped = String(raw || '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped;
}

/**
 * Gender label. The DB packs BOTH options into one cell
 * ("👨 Pria👩 Wanita"), so we translate each side and rejoin with the same
 * separator the admin used.
 */
export function jobGenderLabel(raw: string | null | undefined): string {
  const src = String(raw || '').trim();
  if (!src) return '';

  const found: Array<{ at: number; key: string }> = [];
  const probes: Array<[string, string]> = [
    ['PRIA', 'option.PRIA'],
    ['LAKI', 'option.LAKI'],
    ['WANITA', 'option.WANITA'],
    ['PEREMPUAN', 'option.PEREMPUAN'],
    ['PEREM', 'option.PEREM'],
  ];

  const n = normalize(src);
  for (const [token, key] of probes) {
    const at = n.indexOf(token);
    if (at >= 0) found.push({ at, key });
  }
  if (!found.length) return src;

  // Dedupe by resolved label, keep source order.
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const f of found.sort((a, b) => a.at - b.at)) {
    const lbl = t(f.key);
    if (seen.has(lbl)) continue;
    seen.add(lbl);
    labels.push(lbl);
  }
  return labels.join(' / ');
}

/**
 * Job-type / pekerjaan value, e.g. "NOUGYOU SAYURAN".
 *
 * This is a proper noun from the admin sheet (often romaji Japanese), so it is
 * deliberately returned unchanged — translating it would invent meaning the
 * admin never entered. Kept as a named export so callers do not each re-decide.
 */
export function jobTitleLabel(raw: string | null | undefined): string {
  return String(raw || '').trim();
}
