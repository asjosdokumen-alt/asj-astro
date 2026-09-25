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
 */

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
  berkas?: Record<string, string>;
  bio?: Record<string, string>;
};

/** `'-'` is the projections' own "no value" marker, so it is normalised to it. */
function field(v: unknown): string {
  const s = String(v ?? '').trim();
  return s && s !== 'null' && s !== 'undefined' ? s : '-';
}

/**
 * The exact text the legacy function produced. Kept byte-for-byte in shape
 * because people paste this into chat and email: changing a label here changes
 * a document, not a screen.
 */
export function buildBiodataText(c: BiodataSource): string {
  const lines = [
    'BIODATA KANDIDAT',
    '================',
    `Nama: ${field(c.nama)}`,
    `WA: ${field(c.wa)}`,
    `ID: ${field(c.idKandidat)}`,
    `Gender: ${field(c.gender)}`,
    `Usia: ${c.usia || '-'} Tahun`,
    `Tempat Lahir: ${field(c.tmplahir)}`,
    `Tanggal Lahir: ${field(c.tgllahir)}`,
    `Email: ${field(c.email)}`,
    `Alamat: ${field(c.alamat)}`,
    `JFT: ${field(c.jft)}`,
    `SSW: ${field(c.ssw)}`,
    `Fisik: ${field(c.fisik)}`,
    `Pendidikan: ${field(c.pendidikan)}`,
    `Tahapan: ${field(c.tahapan)}`,
    `Status: ${field(c.status)}`,
    `VIP: ${c.isVIP ? 'YA' : 'TIDAK'}`,
    '',
    'BERKAS:',
    ...Object.entries(c.berkas || {})
      .filter(([, v]) => v)
      .map(([k, v]) => `  ${k}: ${v}`),
    '',
    'BIODATA DETAIL:',
    ...Object.entries(c.bio || {})
      .filter(([, v]) => v)
      .map(([k, v]) => `  ${k}: ${v}`),
  ];
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
