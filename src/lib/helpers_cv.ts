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

/** Merge two arrays (master + AI) with dedupe by key */
export function mergeArrRiwayat(
  srcA: unknown,
  srcB: unknown,
  keyOf?: (e: Record<string, unknown>) => string,
): Record<string, unknown>[] {
  const seen = new Set<string>();
  const out: Record<string, unknown>[] = [];
  const lists = ([] as Record<string, unknown>[]).concat(asArr(srcA), asArr(srcB));
  for (const e of lists) {
    if (!e || typeof e !== "object") continue;
    const k = keyOf ? keyOf(e) : JSON.stringify(e);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
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
