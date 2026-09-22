/**
 * aiCvPairs.ts — SINGLE OWNER of the paired ID↔JP values used by the AI CV form.
 *
 * Why this file exists
 * --------------------
 * Legacy `ai_form.ts` had two registries that the Astro port never carried over:
 *
 *   FIELD_PAIRS   (`ai_form.ts:212-232`)  — which identity/kenalan fields are
 *                 really enums, so they render as <select> and not free text.
 *   PAIRED_PARTNER(`ai_form.ts:262-277`)  — when the ID side is chosen, which
 *                 JP field must be filled with the matching kanji, and back.
 *
 * Without them the port fell back to `datalist` on `readonly` inputs, which is
 * doubly useless: the field cannot be typed, and a datalist only *suggests*.
 * The candidate therefore has no way to pick a value at all.
 *
 * The failure the original comment recorded (`ai_form.ts:497-503`) is real and
 * is why these are pairs rather than two independent lists: a candidate who
 * picks "MENIKAH" on the ID side but types "既婚" by hand produces a CV where
 * the two halves disagree, and the Japanese half is what the employer reads.
 *
 * Shape contract
 * --------------
 *   PAIRED_FIELDS: cvField -> { pairs, partner }
 *     cvField  — the key in `CvData` (e.g. 'gender', 'agama');
 *     pairs    — Array<[valueId, valueJp]> owned by `opsi-form.ts` where one
 *                exists, so the two forms cannot drift apart;
 *     partner  — the CvData key that must receive the other half's value.
 *
 * Ownership note: the bilingual lists themselves live in `opsi-form.ts`. This
 * file must NOT re-spell them — it maps CV fields onto that single source.
 * Failing that, the AI CV form and the CV Master form would offer different
 * spellings for the same question, which is the exact defect `opsi-form.ts`
 * was created to end.
 */
import { labelJp, type Opsi } from './opsi-form';

/**
 * Lists that exist ONLY on the AI CV form (legacy `IDENTITAS_PAIRS`).
 *
 * These are not occupations or relations, so they do not belong in
 * `opsi-form.ts`, which is scoped to the candidate-facing dropdowns shared
 * with CV Master. They are declared here so the AI CV form has exactly one
 * owner for its own enums, mirroring how `opsi-form.ts` owns the shared ones.
 */
export const GENDER_PAIRS: Opsi[] = [
  ['LAKI-LAKI', '男性'],
  ['PEREMPUAN', '女性'],
];

export const AGAMA_PAIRS: Opsi[] = [
  ['ISLAM', 'イスラム教'],
  ['KRISTEN', 'キリスト教'],
  ['KATOLIK', 'カトリック'],
  ['HINDU', 'ヒンドゥー教'],
  ['BUDDHA', '仏教'],
  ['KONGHUCU', '儒教'],
  ['LAINNYA', 'その他'],
];

export const GOLDAR_PAIRS: Opsi[] = [
  ['A', 'A型'],
  ['B', 'B型'],
  ['AB', 'AB型'],
  ['O', 'O型'],
  ['-', '不明'],
];

export const STATUS_NIKAH_PAIRS: Opsi[] = [
  ['BELUM MENIKAH', '未婚'],
  ['MENIKAH', '既婚'],
  ['CERAI', '離婚'],
];

export const TANGAN_PAIRS: Opsi[] = [
  ['KANAN', '右'],
  ['KIRI', '左'],
];

/** Legacy `ya_tidak`: the yes/no answer the employer reads as 有り/無し. */
export const YA_TIDAK_PAIRS: Opsi[] = [
  ['TIDAK', '無し'],
  ['YA', '有り'],
];

/** Legacy `RIWAYAT_JEPANG_PAIRS`. */
export const RIWAYAT_JEPANG_PAIRS: Opsi[] = [
  ['BELUM PERNAH', '未経験'],
  ['EKS MAGANG', '技能実習生'],
  ['EKS TOKUTEI GINO', '特定技能'],
];

/**
 * Shoe / clothes / hat sizes, in the ID and JP conventions.
 *
 * Legacy carried these as `SEPATU_PAIRS` / `BAJU_PAIRS` / `TOPI_PAIRS`
 * (`ai_form.ts:236-254`) and the port dropped them, so the size fields became
 * untyped text. The mapping matters because the two countries number sizes
 * differently — a bare "XL" is ambiguous on a Japanese form.
 */
export const SEPATU_PAIRS: Opsi[] = [
  ['36', '36 (JP 23.0cm)'], ['37', '37 (JP 23.5cm)'], ['38', '38 (JP 24.0cm)'],
  ['39', '39 (JP 24.5cm)'], ['40', '40 (JP 25.0cm)'], ['41', '41 (JP 25.5cm)'],
  ['42', '42 (JP 26.0cm)'], ['43', '43 (JP 26.5cm)'], ['44', '44 (JP 27.0cm)'],
  ['45', '45 (JP 27.5cm)'], ['46', '46 (JP 28.0cm)'],
];

export const BAJU_PAIRS: Opsi[] = [
  ['S', 'S (JP S)'], ['M', 'M (JP M)'], ['L', 'L (JP L)'],
  ['XL', 'XL (JP LL)'], ['XXL', 'XXL (JP 3L)'],
];

export const TOPI_PAIRS: Opsi[] = [
  ['54', '54 (JP 54cm)'], ['56', '56 (JP 56cm)'], ['58', '58 (JP 58cm)'],
  ['60', '60 (JP 60cm)'], ['62', '62 (JP 62cm)'],
];

/**
 * The registry the form actually reads.
 *
 * `partner` is present only where the CV has a separate JP column that the
 * employer reads. Fields with no JP twin (sizes, yes/no on the fisik card)
 * still get `pairs` so the value is constrained, but have no partner to fill.
 */
export interface PairedField {
  /** [valueId, valueJp] pairs. */
  pairs: Opsi[];
  /**
   * CvData key that receives the other half. Omitted when the JP half is not a
   * separate column (size fields store the bilingual label in one value).
   */
  partner?: string;
}

export const PAIRED_FIELDS: Record<string, PairedField> = {
  // ── Identitas: both halves are real columns on the CV ──
  gender: { pairs: GENDER_PAIRS, partner: 'gender_jp' },
  agama: { pairs: AGAMA_PAIRS, partner: 'agama_jp' },
  status: { pairs: STATUS_NIKAH_PAIRS, partner: 'status_jp' },

  // ── Identitas: single column, constrained value only ──
  goldar: { pairs: GOLDAR_PAIRS },
  tangan: { pairs: TANGAN_PAIRS },

  // ── Fisik: sizes are one bilingual value, no partner column ──
  sepatu: { pairs: SEPATU_PAIRS },
  baju: { pairs: BAJU_PAIRS },
  topi: { pairs: TOPI_PAIRS },
  tahan_ac: { pairs: YA_TIDAK_PAIRS },

  // ── Medis: yes/no, single column ──
  kacamata: { pairs: YA_TIDAK_PAIRS },
  butawarna: { pairs: YA_TIDAK_PAIRS },
  tato: { pairs: YA_TIDAK_PAIRS },
  rokok: { pairs: YA_TIDAK_PAIRS },
  alkohol: { pairs: YA_TIDAK_PAIRS },

  // ── Wawancara ──
  riwayatjepang: { pairs: RIWAYAT_JEPANG_PAIRS },
};

/**
 * Which CvData key is the JP half of a pair, and which pairs it belongs to.
 *
 * The form needs this direction too: if the candidate edits the JP column
 * directly, the ID column must follow. Legacy kept two mirrored maps
 * (`PAIRED_PARTNER` / `PAIRED_PARTNER_JP`) for the same reason.
 *
 * Derived from PAIRED_FIELDS rather than hand-written, so a pair can never be
 * one-directional by accident — the failure legacy's two hand-written maps
 * allowed.
 */
export const JP_HALF_OF: Record<string, { pairs: Opsi[]; partner: string }> = Object.entries(
  PAIRED_FIELDS,
).reduce((acc, [field, cfg]) => {
  if (cfg.partner) acc[cfg.partner] = { pairs: cfg.pairs, partner: field };
  return acc;
}, {} as Record<string, { pairs: Opsi[]; partner: string }>);

/**
 * Look up the JP half of an ID value. Returns '' when the value is not a known pair.
 *
 * Runs the result through `labelJp` rather than returning element 2 verbatim,
 * because the two list conventions in this codebase store the Japanese
 * differently: `GENDER_PAIRS` holds pure kanji (`'男性'`), while `PEKERJAAN` holds
 * a bilingual label (`'OPERATOR PRODUKSI (工場作業員)'`) whose kanji has to be
 * extracted. Returning element 2 unchanged wrote the Indonesian term into
 * `jabatan_jp` for every occupation — the CV's two halves disagreeing, which is
 * precisely what this module was created to prevent.
 */
export function jpOf(pairs: Opsi[], valueId: string): string {
  const found = pairs.find(([id]) => id === valueId);
  return found ? labelJp(found[1]) : '';
}

/**
 * Look up the ID half of a JP value. Returns '' when the value is not a known pair.
 *
 * Matches against `labelJp(...)` rather than the raw label, mirroring `jpOf`:
 * the JP half of an occupation is only ever stored as pure kanji (`工場作業員`)
 * because that is what `jpOf` writes, so a lookup that compared against the
 * full bilingual label would never match anything for `PEKERJAAN` — the field
 * always compares against `GENDER_PAIRS`-style pure kanji in tests, which is why
 * the asymmetry went unnoticed.
 */
export function idOf(pairs: Opsi[], valueJp: string): string {
  const needle = String(valueJp ?? '').trim();
  if (!needle) return '';
  const found = pairs.find(([, jp]) => jp === needle || labelJp(jp) === needle);
  return found ? found[0] : '';
}

/**
 * Resolve an edit into the set of columns that must change.
 *
 * Returns a patch keyed by CvData field. A value outside the registry is
 * written as-is and never overwrites its partner — a candidate who typed free
 * text keeps it, and legacy explicitly guarded the same case
 * ("nilai bebas di luar registry — partner dibiarkan").
 */
export function resolvePairEdit(field: string, value: string): Record<string, string> {
  const patch: Record<string, string> = { [field]: value };
  const idSide = PAIRED_FIELDS[field];
  if (idSide?.partner) {
    const jp = jpOf(idSide.pairs, value);
    if (jp) patch[idSide.partner] = jp;
    return patch;
  }
  const jpSide = JP_HALF_OF[field];
  if (jpSide) {
    const id = idOf(jpSide.pairs, value);
    if (id) patch[jpSide.partner] = id;
  }
  return patch;
}
