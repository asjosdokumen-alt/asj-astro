/**
 * helpers_cv.ts — Pure helper functions for Rirekisho CV builder
 * Ported from legacy js/helpers_cv.ts
 * No DOM access — pure logic only
 */
import { HUBUNGAN_KELUARGA } from './opsi-form';

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

/**
 * Sentinel values that must NEVER reach the rendered CV.
 *
 * WHY this exists: `isGood` guards against null/undefined/empty/dash, but the
 * LITERAL STRING `"undefined"` passes every one of those checks. That string is
 * exactly what a dirty source produces — a malformed `AIDATAJSON`, or code that
 * string-concatenated a missing value (`"Nama: " + undefined`) — and it was
 * being printed straight onto the rirekisho. The owner's "CV outputs many
 * undefined" report is this class of dirty data; the normalizer fix addressed
 * the alias-key cause, and this guard closes the renderer's last hole.
 *
 * SCOPE — deliberately conservative:
 *   • matched case-INSENSITIVELY only as the WHOLE trimmed value, so a real name
 *     such as "Null" (a surname) or a field genuinely containing the word
 *     ("NaN tolerance training") is NOT destroyed;
 *   • `"-"` is handled separately below and keeps its existing contract: the row
 *     builders strip a lone dash by converting it to "" — that behaviour must
 *     not change here.
 */
function isSentinel(val: string): boolean {
  const s = val.toLowerCase();
  return s === 'undefined' || s === 'null' || s === 'nan';
}

/** Check if value is meaningful (not null/undefined/empty/dash/sentinel) */
export function isGood(val: unknown): boolean {
  if (val === undefined || val === null) return false;
  const s = String(val).trim();
  if (s === '' || s === '-') return false;
  return !isSentinel(s);
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
// ROW IDENTITY for the three riwayat sections — ONE definition.
// ---------------------------------------------------------------------------
// Previously each consumer (AiCvForm's draft, RirekishoBuilder, the CV template
// factory) carried its own copy of this key and they had to "agree". They did
// agree — on the WRONG rule, which is why the duplicates below survived.
//
// 🔴 The old rule concatenated `tingkat + sekolah`. That never unites the same
// row coming from the two sources, because the two sources spell the level
// differently: the master columns hold `SMA/SMK` while `ai_data_json` holds
// `SMK` for the SAME school. The concatenated keys differ, so `mergeArrRiwayat`
// keeps both and the row shows up twice — in the AI CV form, in the rirekisho,
// and in the biodata download. Measured on AGUS KHOCI (ASJ00040): 11 education
// rows for 4 schools.
//
// Identity is therefore the NAME (school / company / person), falling back to
// the level only when no name is present. The period is part of the key so two
// stints at the same company stay two rows.
export function riwayatKeyOf(
  tipe: 'pendidikan' | 'pekerjaan' | 'keluarga',
  e: Record<string, unknown>,
): string {
  const clean = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const pick = (keys: string[]): string => {
    for (const k of keys) {
      const v = e[k];
      if (v !== undefined && v !== null && String(v).trim() !== '') return clean(v);
    }
    return '';
  };
  if (tipe === 'keluarga') return clean(e.nama);
  if (tipe === 'pendidikan') {
    // 🔴 IDENTITAS SEKOLAH = NAMANYA SAJA, TANPA periode. Diukur atas 234 baris
    // master gdw (2026-10-12): memasukkan periode membuat **8 baris** sekolahnya
    // tampil DUA KALI (21 baris berlebih). Sebabnya baris master menulis `masuk`
    // DAN `tahun_masuk` — plus `lulus`/`tahun_lulus` — dengan nilai yang SAMA,
    // sehingga periodenya jadi "2005200520112011" sementara baris AI hanya
    // "20052011"; kuncinya tak pernah cocok dan dedupe lolos. Tanpa periode: 0.
    // Satu orang menempuh satu sekolah SEKALI, jadi periode tidak memisahkan apa
    // pun di sini — berbeda dari pekerjaan, di mana dua masa kerja itu nyata.
    const eduName = pick(['sekolah', 'sekolah_id', 'nama_sekolah', 'namaSekolah']);
    // Fallback: the LEVEL, as a rank — not the raw spelling.
    //
    // Measured 2026-10-21 (owner: "kenapa ini kok data dobel dobel terus"):
    // a nameless row written by the master form holds `SMA/SMK` while the same
    // row written by the AI form holds `SMK`. Both rank 3, but as raw strings
    // they were different keys, so `mergeArrRiwayat` kept BOTH and the AI CV
    // form showed two identical empty rows with the same year. `getTingkatVal`
    // is the same ranker `sortEduRows` already uses, so "SMK" and "SMA/SMK"
    // collapse here exactly as they do when the list is sorted.
    if (eduName) return `s:${eduName}`;
    const rank = getTingkatVal(e.tingkat);
    return rank >= 1 && rank <= 5 ? `l:${rank}` : `t:${pick(['tingkat'])}`;
  }
  const name = pick(['perusahaan', 'perusahaan_id', 'nama_perusahaan', 'namaPt']);
  const alt = pick(['jabatan', 'jabatan_id']);
  // Periode pekerjaan: SATU nilai per slot. `pick` tiap kunci lalu dedupe + buang
  // kosong — kalau tidak, baris master (yang menulis `masuk` DAN `tahun_masuk`)
  // menghasilkan "20232023" sementara AI "2023". Terukur: 7 baris dobel → 5.
  // Dua masa kerja di perusahaan yang sama TETAP dua baris.
  const period = [...new Set(['masuk', 'tahun_masuk', 'keluar', 'tahun_keluar'].map((k) => pick([k])).filter(Boolean))].join('');
  return `${name ? `s:${name}` : `t:${alt}`}|${period}`;
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

/**
 * (tahun × 100 + bulan) dari satu nilai periode, atau `null` bila tidak ada.
 *
 * Menerima "2020", "2020-04", "2020/4", "04/2020" TIDAK didukung (bulan dulu
 * ambigu dengan tahun) dan "April 2020" lewat `Date`. Bulan 0/13+ dianggap
 * "tahun saja" — rirekisho mencetak `2020年` lebih baik daripada `2020年0月`.
 */
export function periodeKey(v: unknown): number | null {
  const s = String(v ?? '').trim();
  if (!s || s === '-') return null;
  // Bentuk numerik yang kita tulis sendiri: `2020`, `2020-04`, `2020/4`,
  // `2020-04-15`. DIBACA SEBELUM `Date`, karena `new Date('2020-04')` memakai
  // UTC dan bisa memundurkan bulan satu langkah di zona waktu negatif.
  const m = s.match(/^(\d{4})(?:[-/.](\d{1,2}))?(?:[-/.]\d{1,2})?$/);
  if (m) {
    const y = parseInt(m[1] ?? '0', 10);
    let mo = m[2] ? parseInt(m[2], 10) : 0;
    if (!Number.isFinite(mo) || mo < 0 || mo > 12) mo = 0;
    return y * 100 + mo;
  }
  // Bentuk lain ("April 2020", "2020年4月") — serahkan ke Date, lalu ke
  // pencocokan longgar sebagai jaring terakhir.
  const dt = new Date(s);
  if (!Number.isNaN(dt.getTime())) return dt.getFullYear() * 100 + (dt.getMonth() + 1);
  const longgar = s.match(/(\d{4})\D{0,3}(\d{1,2})?/);
  if (longgar) {
    let mo = longgar[2] ? parseInt(longgar[2], 10) : 0;
    if (!Number.isFinite(mo) || mo < 0 || mo > 12) mo = 0;
    return parseInt(longgar[1] ?? '0', 10) * 100 + mo;
  }
  return null;
}

/**
 * Urutkan riwayat secara KRONOLOGIS (paling lama dulu) — urutan yang dipakai
 * rirekisho Jepang untuk 学歴 dan 職歴.
 *
 * KENAPA BUKAN `sortEdu`
 * ---------------------
 * `sortEdu` mengurutkan berdasarkan JENJANG (SD → SMP → SMA). Untuk data yang
 * konsisten keduanya sama, tetapi rirekisho Jepang tidak membaca jenjang: ia
 * membaca tahun. Kandidat yang masuk SMK setelah SMA, atau D3 setelah S1,
 * akan tercetak terbalik oleh urutan jenjang — laporan pemilik 2026-10-29:
 * "riwayat sekolah gak urut, riwayat kerja gak auto urut sesuai tahun dan
 * bulan kerjanya".
 *
 * `pekerjaan` sebelumnya TIDAK diurutkan sama sekali (urutan sumber), jadi
 * riwayat kerja tercetak sesuai urutan isi formulir.
 *
 * Entri tanpa tanggal masuk ditaruh di BELAKANG dan mempertahankan urutan
 * aslinya: baris tanpa tahun bukan riwayat, dan menaruhnya di atas akan
 * mendorong riwayat sungguhan ke bawah.
 */
export function sortRiwayatKronologis<T extends Record<string, unknown>>(
  list: T[],
  opsi: {
    mulai?: string[];
    selesai?: string[];
    /** Tie-break untuk tanggal mulai yang sama (mis. jenjang sekolah). */
    tiebreak?: (a: T, b: T) => number;
  } = {},
): T[] {
  const mulai = opsi.mulai ?? ['masuk', 'tahun_masuk', 'tahunMasuk'];
  const selesai = opsi.selesai ?? ['keluar', 'tahun_keluar', 'tahunKeluar', 'lulus', 'tahun_lulus', 'tahunLulus'];
  const ambil = (e: T, keys: string[]): number | null => {
    for (const k of keys) {
      const n = periodeKey(e?.[k]);
      if (n !== null) return n;
    }
    return null;
  };
  return (list || [])
    .map((e, i) => ({ e, i, m: ambil(e, mulai), s: ambil(e, selesai) }))
    .sort((a, b) => {
      // Tanpa tanggal mulai → tie-break dulu, lalu urutan asli.
      //
      // Sebelum 2026-10-30 cabang ini LANGSUNG `a.i - b.i`, sehingga tie-break
      // jenjang tidak pernah dipakai untuk baris tanpa tahun — dan itu justru
      // kasus yang paling sering: kandidat mengisi sekolahnya tanpa tahun.
      // Terukur pada master id 40: urutan tercetak SMK → SMP → SMA/SMK di form
      // resmi. Sekarang baris tanpa tahun tetap naik SD → SMP → SMA.
      if (a.m === null && b.m === null) {
        const tb0 = opsi.tiebreak?.(a.e, b.e) ?? 0;
        return tb0 !== 0 ? tb0 : a.i - b.i;
      }
      if (a.m === null) return 1;
      if (b.m === null) return -1;
      if (a.m !== b.m) return a.m - b.m;
      if (a.s !== null && b.s !== null && a.s !== b.s) return a.s - b.s;
      const tb = opsi.tiebreak?.(a.e, b.e) ?? 0;
      if (tb !== 0) return tb;
      return a.i - b.i;
    })
    .map((x) => x.e);
}

// ---------------------------------------------------------------------------
// 続柄 — SATU kamus untuk rirekisho HTML dan keempat form .xlsx
// ---------------------------------------------------------------------------
// Sebelumnya `kanjiHubungan`/`rapikanKanjiHubungan` hanya hidup di
// `components/admin/RirekishoBuilder.tsx`, jadi form .xlsx tidak bisa memakainya
// dan mencetak nilai Indonesia apa adanya ("AYAH") di kolom 続柄 — satu-satunya
// kolom Jepang di rirekisho yang berisi huruf Latin. Dipindahkan ke sini supaya
// kedua keluaran memakai daftar yang sama.

/**
 * 続柄 yang sah di rirekisho Jepang — satu kata, tanpa お/ご dan tanpa さん.
 *
 * KENAPA (laporan pemilik 2026-10-29): "kanji nya ga sesuai kek ayah harus nya
 * chichi saja". Kolom 続柄 di rirekisho berisi 父, bukan 「お父さん」 dan bukan
 * 「AYAH 父」. Nilai Jepang datang dari dua sumber yang sama-sama bisa meleset:
 * AI (sering menulis bentuk sopan お父さん/父さん) dan kandidat sendiri.
 */
const KANJI_HUBUNGAN: Array<[RegExp, string]> = [
  // URUTAN PENTING: yang lebih spesifik lebih dulu. `義父` dan `祖父`
  // mengandung `父`, jadi keduanya HARUS diperiksa sebelum aturan `父`.
  [/曾祖父|ひいおじい/, '曾祖父'],
  [/曾祖母|ひいおばあ/, '曾祖母'],
  [/義父|ぎふ/, '義父'],
  [/義母|ぎぼ/, '義母'],
  [/祖父|おじい(さん|ちゃん)?|grandfather/i, '祖父'],
  [/祖母|おばあ(さん|ちゃん)?|grandmother/i, '祖母'],
  [/父|お父さん|パパ|ちち/i, '父'],
  [/母|お母さん|ママ|はは/i, '母'],
  [/兄|お兄さん|にいさん/i, '兄'],
  [/姉|お姉さん|ねえさん/i, '姉'],
  [/弟|おとうと/i, '弟'],
  [/妹|いもうと/i, '妹'],
  [/夫|旦那|おっと/i, '夫'],
  [/妻|奥さん|つま/i, '妻'],
  [/息子|むすこ/i, '息子'],
  [/娘|むすめ/i, '娘'],
  [/子|お子さん|子供/i, '子'],
  [/伯父|叔父|おじさん/i, '叔父'],
  [/伯母|叔母|おばさん/i, '叔母'],
  [/従兄弟|いとこ/i, '従兄弟'],
  [/甥|おいご/i, '甥'],
  [/姪|めいご/i, '姪'],
];

/**
 * Rapikan nilai 続柄 Jepang menjadi SATU kata baku.
 *
 * Mengembalikan '' kalau tidak ada yang cocok — pemanggil lalu memakai nilai
 * Indonesia apa adanya, bukan kanji karangan.
 */
export function rapikanKanjiHubungan(nilai: string): string {
  const s = String(nilai ?? '').trim();
  if (!s) return '';
  for (const [re, kanji] of KANJI_HUBUNGAN) {
    if (re.test(s)) return kanji;
  }
  return '';
}

/**
 * Kanji 続柄 dari hubungan Indonesia ("AYAH" → 父).
 *
 * Dipakai HANYA kalau kolom Jepangnya kosong atau berisi penanda. Sumbernya
 * `HUBUNGAN_KELUARGA` di `lib/opsi-form.ts` — daftar yang sama yang dipakai
 * formulir — supaya CV tidak punya kamus sendiri yang bisa menyimpang.
 * Hubungan yang tidak ada di daftar dibiarkan kosong: menebak kanji keluarga
 * kandidat lebih buruk daripada sel kosong.
 */
export function kanjiHubungan(hub: string): string {
  const teks = String(hub ?? '').trim();
  if (!teks) return '';
  const bagian = teks.split(/\s+/);

  /* Nilai lama kadang sudah membawa kanjinya sendiri ("AYAH 父親"). Kalau
     sisanya memang huruf Jepang, itulah jawabannya — tidak perlu kamus. */
  if (bagian.length > 1) {
    const sisa = bagian.slice(1).join(' ');
    if (/[\u3040-\u30ff\u4e00-\u9fff]/.test(sisa)) return rapikanKanjiHubungan(sisa);
    /* Sisa berhuruf Latin TIDAK boleh ditebak dari kata pertamanya ("TETANGGA
       JAUH" bukan "AYAH"), tetapi juga tidak boleh langsung menyerah: hubungan
       majemuk yang SAH ("KAKAK PEREMPUAN", "ANAK LAKI-LAKI") memang dua kata.
       Karena itu pencocokan di bawah memakai SELURUH teks dan harus PERSIS. */
  }

  const kunci = teks.toUpperCase().replace(/\s+/g, ' ');
  for (const [nilai, label] of HUBUNGAN_KELUARGA) {
    if (String(nilai).toUpperCase() !== kunci) continue;
    const m = String(label).match(/[（(]([^）)]+)[）)]/);
    if (m?.[1]) return rapikanKanjiHubungan(m[1]);
  }
  return '';
}

/**
 * 続柄 untuk form .xlsx: kanji dari kolom Jepang kalau ada, kalau tidak dari
 * kamus Indonesia. `''` = tidak diketahui (pemanggil memutuskan sendiri).
 */
export function kanjiHubunganDari(hubungan: unknown, hubunganJp: unknown): string {
  return rapikanKanjiHubungan(String(hubunganJp ?? '')) || kanjiHubungan(String(hubungan ?? ''));
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

/* ── label sekolah untuk form Jepang (KINKI / JIPA / rirekisho) ─────────────
 *
 * Sebelum 2026-10-30 tiap renderer menyalin logika ini sendiri-sendiri, dan
 * ketiganya berbeda diam-diam: `kouritsu()` ada dua kali (kinki.ts + jipa.ts),
 * `tingkatJp()` hanya di jipa.ts, dan `jenjangKinki()` hanya di kinki.ts.
 * Akibatnya satu jenjang bisa tercetak benar di satu form dan kosong di form
 * lain — persis keluhan pemilik "masih banyak yang kosong dari template".
 * Sekarang satu sumber, diuji langsung di `helpers_cv.test.ts`.
 */

/**
 * Baris pendidikan yang merupakan LPK / kursus bahasa Jepang.
 *
 * `LPK` adalah nilai dropdown sejak 2026-10-30 (sebelumnya kandidat mengetik
 * "BAHASA JEPANG" di kolom tingkat). Keduanya harus dikenali: kalau tidak,
 * baris LPK dianggap sekolah biasa — di KINKI ia bahkan terpilih sebagai
 * baris 高校 dan blok 日本語学校 dibiarkan kosong.
 */
export function isLpkTingkat(tingkat: unknown): boolean {
  const t = String(tingkat ?? '').trim().toUpperCase();
  if (!t) return false;
  return /^LPK\b/.test(t) || t.includes('日本語') || t.includes('BAHASA JEPANG') || t.includes('KURSUS');
}

/**
 * 国公私 — sekolah NEGERI = 公立, bukan 国立.
 *
 * 国立 dipakai untuk lembaga yang didirikan negara (mis. 東京大学); SDN/SMPN/
 * SMAN didirikan pemerintah daerah, jadi istilahnya 公立. Dropdown form memuat
 * 国立/公立/私立, jadi nilai yang salah tidak ditolak siapa pun — karena itu
 * pemeriksaannya ada di sini.
 */
export function kouritsuSekolah(sekolah: unknown, status?: unknown): string {
  /* Pilihan EKSPLISIT menang atas tebakan (migrasi 027). Kandidat bisa
     mengoreksi sekolah negeri yang namanya tidak berawalan SDN/SMPN/SMAN. */
  const st = String(status ?? '').trim().toUpperCase();
  if (st.startsWith('NEGERI')) return '公立';
  if (st.startsWith('SWASTA')) return '私立';
  const s = String(sekolah ?? '').trim();
  if (!s) return '';
  return /^(SDN|SMPN|SMAN|SMKN|MIN|MTSN|MAN|(SD|SMP|SMA|SMK)\s*NEGERI|NEGERI|SEKOLAH\s*NEGERI)/i.test(s)
    || /\bNEGERI\b/i.test(s)
    ? '公立'
    : '私立';
}

/** Jenjang sekolah dalam istilah Jepang, untuk kolom bebas (JIPA `G`). */
export function tingkatSekolahJp(tingkat: unknown): string {
  const t = String(tingkat ?? '').trim().toUpperCase();
  if (!t) return '';
  if (isLpkTingkat(t)) return '日本語学校';
  if (/^SD|DASAR/.test(t)) return '小学校';
  if (/^SMP|PERTAMA|MTS/.test(t)) return '中学校';
  if (/^SMK|KEJURUAN/.test(t)) return '専門学校';
  if (/^SMA|ATAS|^MA\b|MADRASAH ALIYAH/.test(t)) return '高校';
  if (/UNIVERSITAS|^S[12]\b|SARJANA|DIPLOMA|^D[234]/.test(t)) return '大学';
  return '';
}

/**
 * 分類 学歴 untuk dropdown KINKI (`A19/A21`): 高校 / 専門 / 大学 / 日本語学校.
 *
 * `''` untuk jenjang yang TIDAK ada di daftar (SD/SMP): mencetak "高校: SDN …"
 * untuk lulusan SD adalah klaim yang salah. Sel kosong lebih jujur — dan
 * dropdown-nya memang tidak punya pilihan untuk itu.
 */
export function jenjangKinkiJp(tingkat: unknown): string {
  const t = String(tingkat ?? '').trim().toUpperCase();
  if (!t) return '';
  if (isLpkTingkat(t)) return '日本語学校';
  if (/SMA|SMK|ATAS|KEJURUAN/.test(t)) return '高校';
  if (/UNIVERSITAS|^S[12]\b|SARJANA/.test(t)) return '大学';
  if (/^D[234]|DIPLOMA/.test(t)) return '専門';
  return '';
}
