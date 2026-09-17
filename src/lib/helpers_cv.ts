/**
 * helpers_cv.ts — Pure helper functions for Rirekisho CV builder
 * Ported from legacy js/helpers_cv.ts
 * No DOM access — pure logic only
 */

/** Deep path getter: getPath(obj, "identitas.nama_lengkap") */
export function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce(
    (o: Record<string, unknown> | undefined, k: string) => {
      if (o == null || typeof o !== 'object') return undefined;
      return (o as Record<string, unknown>)[k] as Record<string, unknown> | undefined;
    },
    obj as Record<string, unknown>,
  ) as unknown;
}

/** Check if value is meaningful (not null/undefined/empty/dash) */
export function isGood(val: unknown): boolean {
  return val !== undefined && val !== null && String(val).trim() !== "" && String(val).trim() !== "-";
}

/** Factory: create v() function that searches d (master) then ai (AIDATAJSON) */
export function makeV(d: Record<string, unknown>, ai: Record<string, unknown>) {
  ai = ai || {};
  const getAi = (path: string): string | null => {
    const val = getPath(ai, path);
    return val && String(val).trim() !== "" ? String(val).trim() : null;
  };
  return function v(...keys: string[]): string {
    for (const k of keys) {
      if (k.includes(".")) {
        const val = getPath(d, k);
        if (isGood(val)) return String(val).trim();
        const aiVal = getAi(k);
        if (aiVal) return aiVal;
      } else {
        const dRec = d as Record<string, unknown>;
        if (dRec[k] !== undefined && isGood(dRec[k])) return String(dRec[k]).trim();
        const cleanKey = String(k).toUpperCase().replace(/[^A-Z0-9]/g, "");
        if (dRec[cleanKey] !== undefined && isGood(dRec[cleanKey])) return String(dRec[cleanKey]).trim();
        const matchingKey = Object.keys(dRec).find((candidate) => candidate !== k && candidate !== cleanKey && String(candidate).toUpperCase().replace(/[^A-Z0-9]/g, '') === cleanKey && isGood(dRec[candidate]));
        if (matchingKey !== undefined) return String(dRec[matchingKey]).trim();
        const aiVal = getAi(k);
        if (aiVal) return aiVal;
      }
    }
    return "-";
  };
}

/** Format year+month in Japanese style: 2012年7月 */
export function fmtMonthYearJp(str: string): string {
  if (!str || str === "-") return "";
  const s = String(str).trim();
  if (/^\d{4}$/.test(s)) return s + "年";
  const m = s.match(/^(\d{4})[-/](\d{1,2})/);
  if (m) return m[1] + "年" + parseInt(m[2], 10) + "月";
  const dt = new Date(s);
  if (isNaN(dt.getTime())) return s;
  return dt.getFullYear() + "年" + (dt.getMonth() + 1) + "月";
}

/** Normalize source to array (handles string JSON, null, undefined) */
export function asArr(src: unknown): Record<string, unknown>[] {
  if (Array.isArray(src)) return src;
  if (typeof src === "string" && src.trim() && src !== "-") {
    try {
      const p = JSON.parse(src);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Merge two arrays (master + AI) with dedupe by key.
 *
 * `normalize` (optional) is applied **before** the dedupe key is computed, so an
 * entry carrying only alias keys dedupes against the same row in canonical
 * form — "SMAN 1" from the master column and `{sekolah_id:"SMAN 1"}` from the AI
 * CV collapse to one row instead of two.
 */
export function mergeArrRiwayat(
  srcA: unknown,
  srcB: unknown,
  keyOf?: (e: Record<string, unknown>) => string,
  normalize?: ((e: Record<string, unknown>) => Record<string, unknown>) | null,
): Record<string, unknown>[] {
  const seen = new Set<string>();
  const out: Record<string, unknown>[] = [];
  const norm = typeof normalize === "function" ? normalize : null;
  const lists = ([] as Record<string, unknown>[]).concat(asArr(srcA), asArr(srcB));
  for (const e of lists) {
    if (!e || typeof e !== "object") continue;
    const item = (norm ? norm(e) : e) as Record<string, unknown>;
    const k = keyOf ? keyOf(item) : JSON.stringify(item);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

// ---------------------------------------------------------------------------
// CENTRAL RIWAYAT KEY NORMALIZER — ported from legacy js/helpers_cv.ts
// ---------------------------------------------------------------------------
// The two riwayat sources use two different key shapes:
//   - AI form (js/pages/ai_form.ts → arrayFields): sekolah_id / perusahaan_id /
//     jabatan_id / hubungan_id / pekerjaan_id
//   - master columns (buildMasterNested): sekolah / perusahaan / jabatan / …
// The CV builders read the CANONICAL shape, so entries carrying only *_id keys
// render with blank school/company/job names — the dates still show up (those
// keys happen to match), which is exactly what makes the bug look cosmetic.
//
// Legacy fixed this with ONE normalizer applied at the merge point, instead of
// patching each reader. The Astro port dropped it, so this file restores it.
const RIWAYAT_ALIAS_MAP: Record<string, Record<string, string[]>> = {
  pendidikan: {
    sekolah: ["sekolah_id", "nama_sekolah", "namaSekolah"],
    jurusan_id: ["jurusan"],
    masuk: ["tahun_masuk", "tahunMasuk"],
    lulus: ["tahun_lulus", "tahunLulus"],
  },
  pekerjaan: {
    perusahaan: ["perusahaan_id", "nama_perusahaan", "namaPerusahaan", "namaPt"],
    jabatan: ["jabatan_id", "posisi"],
    masuk: ["tahun_masuk", "tahunMasuk"],
    keluar: ["tahun_keluar", "tahunKeluar"],
  },
  keluarga: {
    hubungan: ["hubungan_id"],
    pekerjaan: ["pekerjaan_id"],
    umur: ["usia"],
    usia: ["umur"],
  },
};

/**
 * Fill canonical keys from aliases. **Additive only** — a key that already holds
 * a meaningful value is never overwritten, so callers that already rely on the
 * alias shape keep working. `tipe` selects the alias map; an unknown type
 * returns the source untouched.
 */
export function normalisasiRiwayat(src: unknown, tipe: string): unknown {
  const map = RIWAYAT_ALIAS_MAP[tipe];
  if (!map) return src === undefined || src === null ? [] : src;
  // Single object (called per-entry by mergeArrRiwayat) → wrap then unwrap.
  if (src && typeof src === "object" && !Array.isArray(src)) {
    return (normalisasiRiwayat([src], tipe) as Record<string, unknown>[])[0] || src;
  }
  const list = asArr(src);
  if (!list.length) return list;
  return list.map((e) => {
    if (!e || typeof e !== "object") return e;
    const out: Record<string, unknown> = Object.assign({}, e);
    let changed = false;
    for (const [target, aliases] of Object.entries(map)) {
      if (isGood(out[target])) continue;
      for (const alias of aliases) {
        if (isGood(out[alias])) {
          out[target] = String(out[alias]).trim();
          changed = true;
          break;
        }
      }
    }
    return changed ? out : e;
  });
}

/**
 * Wrapper for mergeArrRiwayat's `normalize` slot. The type MUST be bound per
 * call — `normalisasiRiwayat` needs `tipe` to pick the alias map, and passing
 * the bare function makes it resolve to an unknown type, i.e. a silent no-op.
 */
export function normalizeRiwayatFor(tipe: string) {
  return (e: Record<string, unknown>) => normalisasiRiwayat(e, tipe) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// EDUCATION ORDERING — ported from legacy js/10b_cv_builders.ts
// ---------------------------------------------------------------------------
// Indonesian school ladder, ascending: SD → SMP → SMA → higher → LPK. The `−`
// sign on the user-facing request means "no reverse order", i.e. the baku
// (standard) sequence, which is this one.
const TINGKAT_ORDER: Record<string, number> = {
  sd: 1, mi: 1,
  smp: 2, mts: 2,
  sma: 3, smk: 3, ma: 3,
  d1: 4, d2: 4, d3: 4, d4: 4, s1: 4, s2: 4, universitas: 4,
  lpk: 5,
};

/** Longest key matching first, so "smp" cannot be swallowed by a shorter hit. */
const TINGKAT_KEYS = Object.keys(TINGKAT_ORDER).sort((a, b) => b.length - a.length);

/**
 * Rank a `tingkat` label. Matching prefers an **embedded token with letter
 * boundaries**, then falls back to plain substring. The boundary pass is what
 * stops "SMAN 1" ranking as SMA — under the legacy `includes('ma')` rule those
 * two letters inside "SMAN" are read as MA, and it would equally misrank any
 * label that happens to contain a level's letters in sequence. The substring
 * pass is kept so genuinely suffixed labels (e.g. "SMAKEJURUAN") still resolve.
 */
export function getTingkatVal(t: unknown): number {
  const raw = String(t == null ? "" : t).toLowerCase().trim();
  if (!raw) return 99;
  for (const k of TINGKAT_KEYS) {
    if (new RegExp(`(^|[^a-z])${k}([^a-z]|$)`).test(raw)) return TINGKAT_ORDER[k];
  }
  for (const k of TINGKAT_KEYS) {
    if (raw.includes(k)) return TINGKAT_ORDER[k];
  }
  return 99;
}

/** Extract the first 4-digit year so entries tiebreak by intake year. */
function firstYear(e: Record<string, unknown>): number {
  const m = String(e?.masuk || e?.tahun_masuk || e?.tahunMasuk || "").match(/\d{4}/);
  return m ? parseInt(m[0], 10) : 9999;
}

/**
 * Sort riwayat entries by sekolah level (SD → SMP → SMA → …), tiebroken by
 * intake year. Non-mutating (`slice()`), and stable for equal ranks so entries
 * the user entered first keep their position when the level is unknown.
 */
export function sortByTingkat<T extends Record<string, unknown>>(list: T[]): T[] {
  return (list || []).slice().sort((a, b) => {
    const tA = getTingkatVal(a?.tingkat);
    const tB = getTingkatVal(b?.tingkat);
    if (tA !== tB) return tA - tB;
    return firstYear(a) - firstYear(b);
  });
}

/** Sort riwayat entries chronologically by intake year (legacy job/family). */
export function sortByYear<T extends Record<string, unknown>>(list: T[]): T[] {
  return (list || []).slice().sort((a, b) => firstYear(a) - firstYear(b));
}

/** Education in baku order (SD → SMP → SMA). Alias kept for call-site clarity. */
export function sortEdu<T extends Record<string, unknown>>(list: T[]): T[] {
  return sortByTingkat(list);
}

/** Escape HTML to prevent XSS */
export function esc(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
