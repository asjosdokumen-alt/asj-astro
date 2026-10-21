import { AI_CV_PATHS } from './aiCvDraft';
import { getPath, isGood } from './helpers_cv';

/**
 * biodataExport.ts — the "DOWNLOAD FULL BIODATA" artefact, built in one place.
 *
 * WHY THIS FILE EXISTS. Legacy produced this download from a SINGLE function,
 * `downloadBiodataLengkap(wa)` (`js/admin_modal/cv.ts:672`), and the SAME
 * `#modal-cv` dossier was opened by both the admin and the candidate — so both
 * got the same file from the same code. The Astro port had the formatter inline
 * inside `admin/CandidateProfileModal.tsx` only, which left the candidate's copy
 * of that button with nothing to call. Extracting it here keeps the two from
 * drifting, which is exactly the failure DESIGN.md §5.5 names for
 * `jobDisplay.ts`: "do not build a second mapping — the duplicate drifts on day
 * one".
 *
 * WHAT THIS IS NOT. It is not a data-gathering function. It takes an
 * already-projected candidate object and formats it: no fetch, no store, no
 * query. The one side effect is the anchor click that hands the file to the
 * browser, and it is isolated in `downloadBiodataText` so `buildBiodataText`
 * stays pure and testable.
 *
 * ⚠ IT MUST NOT GAIN A FIELD FROM THE ADMIN-ONLY SIDE OF THE DOSSIER. The legacy
 * modal hid these from candidates and they stay hidden here: the candidate
 * password, the admin's internal note (`catatanInternal`), the document preview
 * buttons (CV/JFT/SSW/photo/**KTP**), and the pemberkasan folder. `catatanExternal`
 * is deliberately absent too — it is rendered on the dashboard as
 * "Pesan / Evaluasi dari Admin", not exported into a file the candidate forwards
 * around.
 *
 * ── 2026-10-09: "rapikan dan semua datanya masuk" (owner request) ─────────────
 * The first port reproduced the legacy string byte-for-byte. That string had two
 * problems the owner hit immediately:
 *
 *   1. **It printed raw projection keys.** `berkas`/`bio` are keyed by the short
 *      codes the backend uses (`kk`, `ayah`, `pt`, `kotapasport`), so the file
 *      read `ayah: BUDI` and `pt: PT. X` — unreadable for anyone but the code.
 *      Both sections now go through explicit label maps below.
 *   2. **It was missing whole blocks the UI already shows.** "Job Yang Dilamar"
 *      is rendered in the admin dossier AND on the candidate card, right above
 *      the download button, and the file simply did not contain it. `kelas` and
 *      the Siswa-ASJ flag were missing the same way.
 *
 * The identity rows fall back — first to the copy in `bio`, then to the FULL
 * master row — when the candidate row itself is empty, so no value can be
 * present in one section and lost in the other. The four `bio` keys that
 * duplicate an identity row are therefore not printed twice.
 *
 * ── 2026-10-12: "kok gini doang downloadnya, gak semua data masuk" ───────────
 * The fallback above only ever reached `bio`, which is the handful of keys the
 * dashboard happens to read — NOT the master row. So the summary printed `-`
 * while the DATA MASTER block at the bottom of the SAME file printed the value.
 * Measured over the live DB (gdw, 226 candidates), rows printed `-` although
 * master held a value: Tinggi/Berat 50, Usia 37, JFT/JLPT 20, Pendidikan 11,
 * Gender 6, SSW 4 ⇒ **61 of 226 candidates (27%)**. One real example, ASJ00189,
 * has `gender`/`usia`/`tb`/`bb`/`pendidikan` all NULL on the candidate row.
 * `pick()` now ends at `fromMaster()`, and the master keys were checked to be
 * the right KIND of value before being used — `master.jft`/`master.ssw` hold
 * values ("A2/230", "PM"), not the Storage URLs.
 */

/** One row of the "Job Yang Dilamar" block, as `attachApplications` emits it. */
export type BiodataApplication = {
  code?: string;
  kategori?: string;
  status?: string;
};

export type BiodataSource = {
  nama?: string;
  wa?: string;
  idKandidat?: string;
  gender?: string;
  usia?: string;
  /** `"165 / 57"` — pre-joined, as `mapCandidate` emits `tbBb`. */
  fisik?: string;
  pendidikan?: string;
  tmplahir?: string;
  tgllahir?: string;
  email?: string;
  alamat?: string;
  /** JFT/JLPT VALUE (`jftText`), not the certificate URL. */
  jft?: string;
  /** SSW field VALUE (`sswText`), not the certificate URL. */
  ssw?: string;
  tahapan?: string;
  status?: string;
  isVIP?: boolean;
  isSiswaASJ?: boolean;
  /** Class tag (`[KELAS G]` → `"G"`), as `mapCandidate` derives it. */
  kelas?: string;
  /** Rich rows (admin dossier). Takes precedence over `jobs` when non-empty. */
  applications?: BiodataApplication[];
  /** Bare job codes (candidate dashboard's `dossierJobs`). */
  jobs?: string[];
  berkas?: Record<string, string>;
  bio?: Record<string, string>;
  /**
   * The FULL master row, nested as `buildMasterNested()` emits it (identitas /
   * fisik / medis / wawancara / sertifikasi / pendidikan[] / pekerjaan[] /
   * keluarga[] / kenalan_jepang / uploads). This is the "semua data master"
   * block the owner asked for on 2026-10-09: `bio` above is only the handful of
   * keys the dashboard happens to read, while this is the whole
   * `master_database_candidate` row.
   *
   * It is NOT in the candidate payload — the client fetches it (`getDrafCvMaster`)
   * at download time and passes it here, because widening the shared payload
   * projection would cost ~169 columns × 500 rows on every admin/dashboard read.
   * Absent (fetch failed, or no master row) ⇒ the exporter falls back to `bio`.
   */
  master?: Record<string, unknown>;
};

/** `'-'` is the projections' own "no value" marker, so it is normalised to it. */
function has(v: unknown): boolean {
  const s = String(v ?? '').trim();
  return !!s && s !== 'null' && s !== 'undefined' && s !== '-';
}

function field(v: unknown): string {
  return has(v) ? String(v).trim() : '-';
}

/**
 * A master date column can arrive as a full ISO timestamp.
 *
 * `master_database_candidate.tgl_lahir` is a `timestamptz`, so PostgREST
 * serialises it as `2008-04-04T17:00:00.000Z` and `String(v)` printed it raw:
 *
 *     Tanggal Lahir                  : 2008-04-04T17:00:00.000Z
 *
 * MEASURED 2026-10-12 over the live DB: **67 of 226 candidates (30%)** got a
 * line like that in the downloaded file. Two faults at once — it is unreadable,
 * and the day is one EARLY, because the stamp is Jakarta midnight stored as
 * UTC (the date meant above is 2008-04-05).
 *
 * The CV never showed it: `buildKertasA4` runs the same value through
 * `new Date()` and formats it itself (`2007年10月01日`). That is exactly why this
 * survived — it was only visible in the download, and only to an eye.
 *
 * The SERVER read boundary now normalises every date column to `yyyy-mm-dd`
 * (`toDateOnly` in `netlify/functions/_lib/db/client.ts`), so in the live app the
 * value reaching this function is already a plain date and passes through
 * untouched. This helper stays as the printing layer's own guard: it is the
 * thing that made the defect visible, `buildBiodataText` is also called directly
 * with raw rows, and a regression here is a file a candidate actually downloads.
 * It therefore emits the SAME canonical shape as the boundary — one format, not
 * two — and only rewrites an exact ISO stamp.
 */
const ISO_STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/;
const JAKARTA_YMD = new Intl.DateTimeFormat('en-GB', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: 'Asia/Jakarta',
});

function asDate(v: unknown): string {
  const s = String(v ?? '').trim();
  if (!ISO_STAMP.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const p: Record<string, string> = {};
  for (const part of JAKARTA_YMD.formatToParts(d)) p[part.type] = part.value;
  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * Projection key → human label. Unknown keys are NOT dropped (a new document
 * column must still show up in the file); they fall back to the raw key, which
 * is what `labelFor` does.
 */
const BERKAS_LABEL: Record<string, string> = {
  kk: 'Kartu Keluarga',
  akte: 'Akta Lahir',
  sd: 'Ijazah SD',
  smp: 'Ijazah SMP',
  sma: 'Ijazah SMA',
  univ: 'Ijazah Universitas',
  pasport: 'Paspor',
  mcu: 'MCU / Medical Check-up',
  kontrak: 'Kontrak Kerja',
  cert: 'Sertifikat Jepang',
  ktp: 'KTP',
  foto2: 'Foto Studio',
  ijinortu: 'Surat Izin Orang Tua',
  cpmi: 'CPMI',
  kawin: 'Buku Nikah',
  sehat: 'Surat Sehat',
  bpjs: 'BPJS',
  psikotes: 'Psikotes',
};

const BIO_LABEL: Record<string, string> = {
  email: 'Email',
  tmplahir: 'Tempat Lahir',
  tgllahir: 'Tanggal Lahir',
  alamat: 'Alamat',
  ayah: 'Nama Ayah',
  pasport: 'No. Paspor',
  coe: 'No. COE',
  kotapasport: 'Kota Terbit Paspor',
  tglpasport: 'Tanggal Terbit Paspor',
  exppasport: 'Paspor Berlaku Sampai',
  pt: 'Nama Perusahaan',
};

/**
 * `bio` keys already printed as an identity row (see `buildBiodataText`), so the
 * "BIODATA DETAIL" section does not repeat them.
 */
const SHOWN_IN_IDENTITY = new Set(['email', 'tmplahir', 'tgllahir', 'alamat']);

function labelFor(map: Record<string, string>, key: string): string {
  return map[key] || key.toUpperCase();
}

// Wide enough for the longest master label ("Rencana Setelah Pulang (Kanji)",
// 30) plus a space, so every colon lines up. A shorter width lets the long ones
// push their colon out of the column — the opposite of "rapikan".
const LABEL_WIDTH = 31;
const row = (label: string, value: string): string => `${label.padEnd(LABEL_WIDTH)}: ${value}`;
const rule = (ch: string) => ch.repeat(52);

// ── DATA MASTER (LENGKAP) ───────────────────────────────────────────────────
// Keys of the nested master object (`buildMasterNested` in
// `contexts/master-data/service.ts`). Grouped so the file reads like the CV
// answer sheet rather than a 169-column dump.
const MASTER_GROUP_LABEL: Record<string, string> = {
  identitas: 'IDENTITAS (MASTER)',
  fisik: 'FISIK & UKURAN',
  medis: 'KESEHATAN & RIWAYAT MEDIS',
  wawancara: 'WAWANCARA & MOTIVASI',
  sertifikasi: 'SERTIFIKASI & BAHASA',
  pendidikan: 'RIWAYAT PENDIDIKAN',
  pekerjaan: 'PENGALAMAN KERJA',
  keluarga: 'KELUARGA (SESUAI KK)',
  kenalan_jepang: 'KENALAN DI JEPANG',
  uploads: 'DOKUMEN (MASTER)',
};

const MASTER_LABEL: Record<string, string> = {
  nama_lengkap: 'Nama Lengkap',
  katakana: 'Nama Katakana',
  panggilan: 'Nama Panggilan',
  panggilan_katakana: 'Panggilan Katakana',
  tempat_lahir: 'Tempat Lahir',
  tempat_lahir_jp: 'Tempat Lahir (Kanji)',
  tgl_lahir: 'Tanggal Lahir',
  umur: 'Usia',
  gender: 'Gender',
  agama: 'Agama',
  agama_jp: 'Agama (Kanji)',
  golongan_darah: 'Golongan Darah',
  status_nikah: 'Status Pernikahan',
  status_pernikahan_jp: 'Status Pernikahan (Kanji)',
  anak: 'Jumlah Anak',
  email: 'Email',
  alamat: 'Alamat',
  alamat_jp: 'Alamat (Kanji)',
  hp: 'No. WhatsApp',
  hp_darurat: 'No. WA Darurat',
  ktp: 'NIK KTP',
  paspor: 'No. Paspor',
  sim: 'SIM',
  status_eks_jepang: 'Status Eks Jepang',
  no_coe: 'No. COE',
  tgl_terbit_paspor: 'Tanggal Terbit Paspor',
  exp_paspor: 'Paspor Berlaku Sampai',
  kota_terbit_paspor: 'Kota Terbit Paspor',
  kontak_darurat_nama: 'Kontak Darurat — Nama',
  kontak_darurat_hubungan: 'Kontak Darurat — Hubungan',
  tb: 'Tinggi Badan',
  bb: 'Berat Badan',
  topi: 'Ukuran Topi',
  baju: 'Ukuran Baju',
  sepatu: 'Ukuran Sepatu',
  tangan_dominan: 'Tangan Dominan',
  // 2026-10-12 (pemilik): "hapus bekerja dalam ac? harusnya kan bekerja di
  // cuaca dingin itu" — kolomnya tetap `tahan_ac`, pertanyaannya yang berubah.
  tahan_ac: 'Bekerja di Cuaca Dingin',
  mata_kiri: 'Mata Minus Kiri',
  mata_kanan: 'Mata Minus Kanan',
  kacamata: 'Kacamata',
  buta_warna: 'Buta Warna',
  tato: 'Tato',
  tindik: 'Tindik',
  rokok: 'Merokok',
  alkohol: 'Minum Alkohol',
  alergi_id: 'Alergi',
  alergi_jp: 'Alergi (Kanji)',
  riwayat_medis_id: 'Riwayat Penyakit',
  riwayat_medis_jp: 'Riwayat Penyakit (Kanji)',
  riwayat_kecelakaan_id: 'Riwayat Kecelakaan',
  riwayat_kecelakaan_jp: 'Riwayat Kecelakaan (Kanji)',
  keinginan_id: 'Keinginan Pribadi',
  keinginan_jp: 'Keinginan Pribadi (Kanji)',
  tujuan_ke_jepang: 'Tujuan ke Jepang',
  tujuan_ke_jepang_jp: 'Tujuan ke Jepang (Kanji)',
  riwayat_jepang: 'Riwayat ke Jepang',
  promosi_id: 'Promosi Diri',
  promosi_jp: 'Promosi Diri (Kanji)',
  kelebihan_id: 'Kelebihan',
  kelebihan_jp: 'Kelebihan (Kanji)',
  kekurangan_id: 'Kekurangan',
  kekurangan_jp: 'Kekurangan (Kanji)',
  hobi_id: 'Hobi & Keterampilan',
  hobi_jp: 'Hobi & Keterampilan (Kanji)',
  keahlian_khusus: 'Keahlian Khusus',
  keahlian_khusus_jp: 'Keahlian Khusus (Kanji)',
  motivasi_ke_jepang: 'Motivasi ke Jepang',
  motivasi_ke_jepang_jp: 'Motivasi ke Jepang (Kanji)',
  alasan_memilih_bidang: 'Alasan Memilih Bidang',
  alasan_memilih_bidang_jp: 'Alasan Memilih Bidang (Kanji)',
  rencana_setelah_pulang: 'Rencana Setelah Pulang',
  rencana_setelah_pulang_jp: 'Rencana Setelah Pulang (Kanji)',
  rencana_pulang_id: 'Rencana Setelah Pulang',
  rencana_pulang_jp: 'Rencana Setelah Pulang (Kanji)',
  gaji_yen: 'Harapan Gaji (Yen)',
  tabungan: 'Harapan Tabungan',
  lama_di_jepang: 'Lama di Jepang',
  bahasa: 'Bahasa',
  jft: 'JFT / JLPT',
  ssw: 'SSW',
  bidang: 'Bidang',
  tingkat: 'Tingkat',
  sekolah: 'Nama Sekolah',
  sekolah_jp: 'Nama Sekolah (Kanji)',
  jurusan_id: 'Jurusan',
  jurusan_jp: 'Jurusan (Kanji)',
  masuk: 'Tahun Masuk',
  lulus: 'Tahun Lulus',
  perusahaan: 'Nama Perusahaan',
  perusahaan_jp: 'Nama Perusahaan (Kanji)',
  jabatan: 'Jabatan',
  jabatan_jp: 'Jabatan (Kanji)',
  keluar: 'Tahun Keluar',
  gaji: 'Gaji',
  nama: 'Nama',
  hubungan: 'Hubungan',
  hubungan_id: 'Hubungan',
  hubungan_jp: 'Hubungan (Kanji)',
  pekerjaan: 'Pekerjaan',
  pekerjaan_jp: 'Pekerjaan (Kanji)',
  nama_id: 'Nama',
  nama_jp: 'Nama (Kanji)',
  pekerjaan_id: 'Pekerjaan',
  alamat_id: 'Alamat',
};

/** `uploads` reuses keys that mean something else elsewhere (`jft` = a URL). */
const UPLOAD_LABEL: Record<string, string> = {
  photo: 'Foto',
  cv: 'CV',
  jft: 'Sertifikat JFT',
  ssw: 'Sertifikat SSW',
  ktp: 'KTP',
  kk: 'Kartu Keluarga',
  ijazahSd: 'Ijazah SD',
  ijazahSmp: 'Ijazah SMP',
  ijazahSma: 'Ijazah SMA',
  univ: 'Ijazah Universitas',
  sim: 'SIM',
  cert: 'Sertifikat',
};

/**
 * Alias keys the backend emits beside the column they duplicate. Skipped only
 * when the canonical key is present, so no value is printed twice — and no
 * value is lost either.
 */
const MASTER_ALIAS: Record<string, string> = {
  nama_sekolah: 'sekolah',
  jurusan: 'jurusan_id',
  tahun_masuk: 'masuk',
  tahun_lulus: 'lulus',
  nama_perusahaan: 'perusahaan',
  tahun_keluar: 'keluar',
  usia: 'umur',
  bahasa_jepang: 'jft',
  nilai: 'jft',
  lisensi: 'ssw',
  // `buildMasterNested` emits the "rencana pulang" pair twice (short and long
  // key) pointing at the same two columns.
  rencana_pulang_id: 'rencana_setelah_pulang',
  rencana_pulang_jp: 'rencana_setelah_pulang_jp',
};

/** Top-level keys that are plumbing, not biodata. */
const MASTER_SKIP = new Set(['AIDATAJSON', 'id_kandidat']);

function prettify(key: string): string {
  return key
    .split('_')
    .map((w) => (w.toUpperCase() === 'JP' ? 'JP' : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

/**
 * Cari sebuah kunci di objek master yang BERSARANG (`identitas` / `fisik` /
 * `medis` / `wawancara` / `sertifikasi` / …).
 *
 * `bio` hanya memuat segelintir kunci yang kebetulan dibaca dasbor; baris master
 * yang penuh inilah yang menyimpan sisanya. Karena itu blok ringkasan TIDAK
 * cukup jatuh ke `bio` — terukur 2026-10-12, 61 dari 226 kandidat (27%)
 * menerima berkas yang bagian atasnya `-` padahal bagian bawahnya berisi.
 */
function fromMaster(master: Record<string, unknown>, key: string): unknown {
  for (const group of Object.values(master)) {
    if (!group || typeof group !== 'object' || Array.isArray(group)) continue;
    const v = (group as Record<string, unknown>)[key];
    if (has(v)) return v;
  }
  return undefined;
}

/**
 * Tingkat pendidikan dari `master.pendidikan[]`. `buildMasterNested` menyusun
 * array itu dari slot 1..5, dan slot 1 adalah jenjang TERTINGGI — jadi elemen
 * pertama yang berisi `tingkat` yang dipakai, sama dengan yang dibaca
 * `pendidikan_1_tingkat`.
 */
function masterPendidikan(master: Record<string, unknown>): string {
  const arr = master.pendidikan;
  if (!Array.isArray(arr)) return '';
  for (const e of arr) {
    if (e && typeof e === 'object') {
      const t = (e as Record<string, unknown>).tingkat;
      if (has(t)) return String(t).trim();
    }
  }
  return '';
}

/** `tb / bb` — bentuk yang sama dengan `tbBb` milik `mapCandidate`. */
function masterFisik(master: Record<string, unknown>): string {
  return [fromMaster(master, 'tb'), fromMaster(master, 'bb')]
    .filter(has)
    .map((x) => String(x).trim())
    .join(' / ');
}

function masterRows(obj: Record<string, unknown>, group: string): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (!has(v)) continue;
    const alias = MASTER_ALIAS[k];
    if (alias && has(obj[alias])) continue;
    const label = group === 'uploads' ? UPLOAD_LABEL[k] || prettify(k) : MASTER_LABEL[k] || prettify(k);
    // `asDate` — kolom tanggal master datang sebagai cap waktu ISO; lihat
    // komentarnya. Aman untuk semua kolom lain: hanya stempel ISO persis yang
    // ditulis ulang.
    out.push(row(label, asDate(v)));
  }
  return out;
}

/** One master group. Returns `[]` when it has nothing to show. */
function masterGroupLines(group: string, value: unknown): string[] {
  const title = MASTER_GROUP_LABEL[group] || group.toUpperCase();
  if (Array.isArray(value)) {
    const entries = value.filter((e) => e && typeof e === 'object') as Record<string, unknown>[];
    const body = entries.flatMap((e, i) => {
      const inner = masterRows(e, group);
      return inner.length ? [`  ${i + 1}.`, ...inner.map((l) => `  ${l}`)] : [];
    });
    return body.length ? [title, rule('-'), ...body, ''] : [];
  }
  if (value && typeof value === 'object') {
    const inner = masterRows(value as Record<string, unknown>, group);
    return inner.length ? [title, rule('-'), ...inner, ''] : [];
  }
  return [];
}

/**
 * The text handed to the browser. Sections are fixed; a section with nothing in
 * it says so rather than vanishing, so a reader can tell "no documents" from
 * "the exporter forgot documents".
 */
/**
 * `buildMasterNested()` (backend) membaca KOLOM master saja. Kandidat yang
 * mengisi CV-nya lewat **CV AI** menyimpan jawaban wawancara di
 * `ai_data_json`, dan jalur simpan itu (`_lib/ai/cv.ts`) memang TIDAK menulis
 * kolom wawancara — jadi `master.wawancara` kosong dan blok WAWANCARA hilang
 * dari berkas unduhan.
 *
 * Keluhan pemilik 2026-10-22: *"download biodata tiap siswa kok hasilnya beda
 * beda … ada yg masuk ke download dan ada yg gak"* — yang membedakan bukan
 * kelengkapan isian kandidat, melainkan JALUR mana yang dipakai saat mengisi:
 * lewat form Master (kolom terisi) atau lewat CV AI (hanya `ai_data_json`).
 *
 * Fungsi ini mengisi kekosongan itu dari `AIDATAJSON` yang ikut di respons
 * `getDrafCvMaster`. Arahnya SATU ARAH — kolom master selalu menang; AI hanya
 * mengisi yang kosong. Pemetaan ejaannya memakai `AI_CV_PATHS` (satu sumber
 * yang juga dipakai form), jadi `motivasi_id` milik AI tetap mendarat di
 * `wawancara.motivasi_ke_jepang` yang dibaca label di berkas ini.
 */
export function mergeAiGaps(master: Record<string, unknown>): Record<string, unknown> {
  let ai: unknown = null;
  try {
    const raw = master.AIDATAJSON;
    if (typeof raw === 'string' && raw.trim() && raw !== '-') ai = JSON.parse(raw);
  } catch { ai = null; }
  if (!ai || typeof ai !== 'object' || Array.isArray(ai)) return master;

  // Salin satu tingkat: grup (identitas/wawancara/…) tidak boleh ikut berubah
  // di objek pemanggil.
  const out: Record<string, unknown> = { ...master };
  for (const [group, val] of Object.entries(master)) {
    if (val && typeof val === 'object' && !Array.isArray(val)) out[group] = { ...(val as Record<string, unknown>) };
  }

  for (const paths of Object.values(AI_CV_PATHS)) {
    const target = paths[0];
    if (isGood(getPath(out, target))) continue;
    for (const p of paths) {
      const v = getPath(ai, p);
      if (!isGood(v)) continue;
      const segs = target.split('.');
      let cur: Record<string, unknown> = out;
      for (let i = 0; i < segs.length - 1; i++) {
        const next = cur[segs[i]];
        const branch = next && typeof next === 'object' && !Array.isArray(next) ? next : {};
        cur[segs[i]] = branch;
        cur = branch as Record<string, unknown>;
      }
      cur[segs[segs.length - 1]] = String(v).trim();
      break;
    }
  }
  return out;
}
export function buildBiodataText(c: BiodataSource): string {
  const bio = c.bio || {};
  const master = mergeAiGaps(c.master || {});
  /* Rantai cadangan sebuah baris ringkasan, berurutan:
   *   1. nilai di baris kandidat sendiri,
   *   2. salinan di `bio` (peta kecil yang ikut di payload),
   *   3. baris master yang penuh — diambil SAAT unduh oleh pemanggil.
   * Langkah 3 ditambahkan 2026-10-12: tanpa itu baris identitas mencetak `-`
   * padahal blok DATA MASTER di berkas yang SAMA memuat nilainya (61 dari 226
   * kandidat). Arahnya satu arah — master hanya MENGISI yang kosong, tidak
   * pernah menimpa nilai baris kandidat. */
  const pick = (own: unknown, bioKey: string, masterKey?: string) =>
    has(own) ? own : has(bio[bioKey]) ? bio[bioKey] : fromMaster(master, masterKey ?? bioKey);

  const usia = pick(c.usia, 'usia', 'umur');
  const fisik = has(c.fisik) ? c.fisik : masterFisik(master);
  const pendidikan = has(c.pendidikan) ? c.pendidikan : masterPendidikan(master);

  const lines: string[] = [
    'BIODATA KANDIDAT',
    rule('='),
    '',
    'IDENTITAS',
    rule('-'),
    row('Nama', field(pick(c.nama, 'nama', 'nama_lengkap'))),
    row('ID Kandidat', field(c.idKandidat)),
    row('WhatsApp', field(pick(c.wa, 'wa', 'hp'))),
    row('Gender', field(pick(c.gender, 'gender'))),
    row('Usia', has(usia) ? `${String(usia).trim()} Tahun` : '-'),
    row('Tempat Lahir', field(pick(c.tmplahir, 'tmplahir', 'tempat_lahir'))),
    row('Tanggal Lahir', field(asDate(pick(c.tgllahir, 'tgllahir', 'tgl_lahir')))),
    row('Email', field(pick(c.email, 'email'))),
    row('Alamat', field(pick(c.alamat, 'alamat'))),
    '',
    'FISIK & PENDIDIKAN',
    rule('-'),
    row('Tinggi / Berat', field(fisik)),
    row('Pendidikan', field(pendidikan)),
    '',
    'JFT / SSW',
    rule('-'),
    row('JFT / JLPT', field(pick(c.jft, 'jft'))),
    row('SSW / Bidang', field(pick(c.ssw, 'ssw'))),
    '',
    'STATUS',
    rule('-'),
    row('Tahapan', field(c.tahapan)),
    row('Status', field(c.status)),
    row('VIP', c.isVIP ? 'YA' : 'TIDAK'),
    row('Siswa ASJ', c.isSiswaASJ ? 'YA' : 'TIDAK'),
    row('Kelas', field(c.kelas)),
    '',
    'JOB YANG DILAMAR',
    rule('-'),
  ];

  const apps = (c.applications || []).filter(
    (a) => a && (has(a.kategori) || has(a.code)),
  );
  const jobs = (c.jobs || []).filter(has);
  if (apps.length) {
    apps.forEach((a, i) => {
      const name = field(a.kategori || a.code);
      const code = has(a.kategori) && has(a.code) ? ` (${String(a.code).trim()})` : '';
      const st = has(a.status) ? ` — ${String(a.status).trim()}` : '';
      lines.push(`${i + 1}. ${name}${code}${st}`);
    });
  } else if (jobs.length) {
    jobs.forEach((j, i) => {
      lines.push(`${i + 1}. ${String(j).trim()}`);
    });
  } else {
    lines.push('  (belum ada lamaran)');
  }

  lines.push('', 'BERKAS', rule('-'));
  const berkas = Object.entries(c.berkas || {}).filter(([, v]) => has(v));
  if (berkas.length) {
    for (const [k, v] of berkas) lines.push(row(labelFor(BERKAS_LABEL, k), String(v).trim()));
  } else {
    lines.push('  (belum ada berkas)');
  }

  // Full master row when the caller fetched it; otherwise the handful of `bio`
  // keys that ride along in the candidate payload. Never both — `bio` IS a
  // subset of master, and printing it twice would be the opposite of "rapi".
  const masterLines = Object.entries(master)
    .filter(([g]) => !MASTER_SKIP.has(g))
    .flatMap(([g, v]) => masterGroupLines(g, v));

  if (masterLines.length) {
    lines.push('', 'DATA MASTER (LENGKAP)', rule('='), '', ...masterLines);
  } else {
    lines.push('', 'BIODATA DETAIL', rule('-'));
    const detail = Object.entries(bio).filter(([k, v]) => has(v) && !SHOWN_IN_IDENTITY.has(k));
    if (detail.length) {
      for (const [k, v] of detail) lines.push(row(labelFor(BIO_LABEL, k), String(v).trim()));
    } else {
      lines.push('  (belum ada biodata detail)');
    }
  }

  return lines.join('\n');
}

/** Builds the text and hands it to the browser as `biodata-<id|wa>.txt`. */
export function downloadBiodataText(c: BiodataSource): void {
  const blob = new Blob([buildBiodataText(c)], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `biodata-${c.idKandidat || c.wa || 'kandidat'}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}
