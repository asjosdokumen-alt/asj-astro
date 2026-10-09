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
 * The identity rows fall back to the master copy in `bio` when the candidate row
 * itself is empty, so no value can be present in one section and lost in the
 * other. The four `bio` keys that duplicate an identity row are therefore not
 * printed twice.
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

const LABEL_WIDTH = 22;
const row = (label: string, value: string): string => `${label.padEnd(LABEL_WIDTH)}: ${value}`;
const rule = (ch: string) => ch.repeat(52);

/**
 * The text handed to the browser. Sections are fixed; a section with nothing in
 * it says so rather than vanishing, so a reader can tell "no documents" from
 * "the exporter forgot documents".
 */
export function buildBiodataText(c: BiodataSource): string {
  const bio = c.bio || {};
  // Identity falls back to the master copy, so a value present only in `bio`
  // still reaches the file exactly once.
  const pick = (own: unknown, bioKey: string) => (has(own) ? own : bio[bioKey]);

  const lines: string[] = [
    'BIODATA KANDIDAT',
    rule('='),
    '',
    'IDENTITAS',
    rule('-'),
    row('Nama', field(c.nama)),
    row('ID Kandidat', field(c.idKandidat)),
    row('WhatsApp', field(c.wa)),
    row('Gender', field(c.gender)),
    row('Usia', has(c.usia) ? `${String(c.usia).trim()} Tahun` : '-'),
    row('Tempat Lahir', field(pick(c.tmplahir, 'tmplahir'))),
    row('Tanggal Lahir', field(pick(c.tgllahir, 'tgllahir'))),
    row('Email', field(pick(c.email, 'email'))),
    row('Alamat', field(pick(c.alamat, 'alamat'))),
    '',
    'FISIK & PENDIDIKAN',
    rule('-'),
    row('Tinggi / Berat', field(c.fisik)),
    row('Pendidikan', field(c.pendidikan)),
    '',
    'JFT / SSW',
    rule('-'),
    row('JFT / JLPT', field(c.jft)),
    row('SSW / Bidang', field(c.ssw)),
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

  lines.push('', 'BIODATA DETAIL', rule('-'));
  const detail = Object.entries(bio).filter(([k, v]) => has(v) && !SHOWN_IN_IDENTITY.has(k));
  if (detail.length) {
    for (const [k, v] of detail) lines.push(row(labelFor(BIO_LABEL, k), String(v).trim()));
  } else {
    lines.push('  (belum ada biodata detail)');
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
