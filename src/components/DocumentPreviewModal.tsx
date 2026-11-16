/**
 * DocumentPreviewModal.tsx - Universal document preview modal
 * Migrated from legacy/js/03_candidate.ts bukaPreviewDokumen()
 * Enhanced with legacy/js/init/preview.ts patterns:
 * - Excel/CSV client-side rendering via SheetJS (lazy loaded)
 * - Google Docs Viewer for PDFs (better mobile compatibility)
 * - Cloudinary URL detection for images
 * - 8-second timeout fallback for failed loads
 * Handles: images, PDFs, Excel/CSV, PPTX, Office docs, fallback
 * previewOnly: hides download button (for candidates; admin can still download)
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import Icon from './ui/Icon';
import { useOverlay } from './ui/useOverlay';
import { t } from '../store/i18n';
// Modul SPESIFIK, bukan `../lib/cv-template-factory`: index-nya menarik factory →
// renderers → exceljs, dan itu akan ikut ke chunk modal ini.
import { xlsxPreviewHtml } from '../lib/cv-template-factory/preview';

interface Props {
  url: string;
  title: string;
  onClose: () => void;
  previewOnly?: boolean;
  /** Exit window (2026-09-28) — see `useOverlayPresence` + `motion.css` §5b. */
  closing?: boolean;
  /**
   * MIME type of the file, when the caller knows it.
   *
   * Needed for `blob:` URLs: a locally picked file has no extension in its
   * URL, so `isImage()`/`isPdf()` cannot recognise it and the modal fell
   * through to "cannot preview" for a file sitting in the browser's memory.
   * Empty/absent keeps the old URL-sniffing behaviour for remote URLs.
   */
  mime?: string;
}

// Lazy-loaded SheetJS vendor for Excel/CSV rendering.
//
// ── WHY THE LOCAL MODULE AND NOT A CDN (2026-10-13) ─────────────────────────
// This appended `<script src="https://cdn.sheetjs.com/xlsx-0.20.1/…">`.
// MEASURED 2026-10-13: **that host is unreachable** — `curl -I` answers nothing
// at all (`http=000`, 11 s then refused), from the same network as the owner.
// The vendor therefore never loaded, the client-side render failed EVERY time,
// and every spreadsheet fell through to the raw-iframe fallback and was
// DOWNLOADED instead of previewed. That is the owner's report: "tiap mo buka
// preview mengdonload".
//
// `xlsx` is already a dependency of this repo and is ALREADY bundled for the
// browser by two other callers — `src/lib/candidateExport.ts` and the CV
// template loader — both with this same `await import('xlsx')` shape. The CDN
// was not merely dead, it was redundant.
//
// The dynamic import keeps SheetJS in its own async chunk: it is fetched the
// first time somebody previews a spreadsheet, never on page load.
//
// The module is held in a local, NOT on `window.XLSX`. The global existed only
// because the vendor used to arrive as a <script>; nothing else in the repo
// reads or writes it (checked 2026-10-13), and keeping it meant four
// `(window as any)` casts in a file that is already over the lint budget.
let xlsxModule: typeof import('xlsx') | null = null;
let xlsxPromise: Promise<void> | null = null;

async function loadXlsx(): Promise<typeof import('xlsx') | null> {
  if (xlsxModule) return xlsxModule;
  if (!xlsxPromise) {
    xlsxPromise = import('xlsx')
      .then((mod) => { xlsxModule = mod; })
      .catch(() => {
        // Retry on the next preview rather than caching the failure forever.
        xlsxPromise = null;
      });
  }
  await xlsxPromise;
  return xlsxModule;
}

// Check if URL is an image (including Cloudinary URLs)
//
// ⚠ Cloudinary hosts DOCUMENTS too, not just images: an unsigned upload of a
// PDF lands on `/image/upload/…/ktp.pdf`, and the old `includes('res.cloudinary.com')`
// arm therefore classified it as an image. The modal then rendered `<img
// src="…pdf">`, which cannot load, and the file was reported as "preview
// failed" — one of the ways "pratinjau tidak bisa semua" happened. A document
// extension always wins over the host heuristic.
const DOC_EXT_RE = /\.(pdf|docx?|xlsx?|xlsm|pptx?|odt|ods|odp|csv|txt)([?#].*)?$/i;

function isImage(url: string): boolean {
  const lower = url.toLowerCase();
  if (DOC_EXT_RE.test(lower)) return false;
  return (
    /\.(jpeg|jpg|gif|png|webp|bmp|svg)([?#].*)?$/i.test(lower) ||
    lower.includes('pas_photo') ||
    /image\/upload\//i.test(url) ||
    url.includes('res.cloudinary.com')
  );
}

function isPdf(url: string): boolean {
  return /\.pdf(\?.*)?$/i.test(url);
}

function isExcel(url: string): boolean {
  return /\.(csv|xls|xlsx|xlsm)(\?.*)?$/i.test(url);
}

/** Word yang BISA dibaca browser. `.doc` (biner lama) tidak — jatuh ke fallback. */
function isDocx(url: string): boolean {
  return /\.docx(\?.*)?$/i.test(url);
}

/* CATATAN Office tanpa pembaca di browser — `.doc` biner, `.ppt/.pptx`,
   `.odt/.ods/.odp`: dulu jenis-jenis ini diserahkan ke
   `view.officeapps.live.com`, dan pratinjaunya TIDAK PERNAH jadi. Terukur
   2026-11-16 pada `.docx` kandidat asli: iframe-nya berhenti di halaman
   Microsoft "We're fetching your file…" dan tetap di situ setelah 11 detik,
   karena Microsoft harus mengambil berkasnya sendiri dari Cloudinary. Pratinjau
   yang menggantung selamanya lebih buruk daripada pesan jujur "tidak bisa
   dipratinjau" + tombol Unduh — jadi tidak ada lagi cabang iframe untuk jenis
   ini. `.docx` sendiri kini dirender di klien (mammoth). */

/**
 * Jenis berkas yang dirender DI KLIEN, atau '' kalau bukan urusan kita.
 *
 * `mime` diutamakan untuk URL `blob:` (berkas yang baru dipilih pengguna): URL
 * seperti itu tidak punya ekstensi, jadi `isExcel`/`isDocx` selalu meleset.
 */
type RenderKind = 'sheet' | 'docx' | '';

const SHEET_MIME = /spreadsheetml\.sheet|ms-excel|text\/csv/i;
const DOCX_MIME = /wordprocessingml\.document/i;

function renderKind(url: string, mime?: string): RenderKind {
  if (mime) {
    if (SHEET_MIME.test(mime)) return 'sheet';
    if (DOCX_MIME.test(mime)) return 'docx';
  }
  if (isExcel(url)) return 'sheet';
  if (isDocx(url)) return 'docx';
  return '';
}

// Google Docs Viewer for PDFs (better mobile compatibility than native iframe)
function getPdfViewerUrl(url: string): string {
  return 'https://docs.google.com/gview?url=' + encodeURIComponent(url) + '&embedded=true';
}

// Drive folder links cannot be previewed inline — legacy bukaPreviewDokumen
// (03_candidate.ts) opens them in a new tab as the fallback.
const DRIVE_FOLDER_RE = /drive\.google\.com\/drive\/folders/i;

export function isDriveFolder(url: string): boolean {
  return DRIVE_FOLDER_RE.test(String(url || ''));
}

/**
 * Berkas Google Drive (BUKAN folder) → id berkasnya.
 *
 * KENAPA INI ADA (terukur 2026-10-29)
 * -----------------------------------
 * Berkas kandidat lama tersimpan sebagai tautan Drive, bukan objek Storage:
 * di `master_database_candidate`, **34 dari 51** `ktp_url` berbentuk
 * `https://drive.google.com/open?id=…`. Tautan itu tidak berakhiran ekstensi
 * apa pun, jadi `isImage`/`isPdf`/`isExcel` semuanya meleset dan modal berhenti
 * di "tidak bisa dipratinjau" — laporan pemilik: "pratinjau kelas L tidak bisa
 * semua". Drive punya endpoint embed sendiri; tidak perlu mengunduh.
 *
 * Bentuk yang dikenali: `/file/d/<id>/view`, `/open?id=<id>`, `/uc?id=<id>`.
 */
const DRIVE_FILE_RES = [
  /drive\.google\.com\/file\/d\/([A-Za-z0-9_-]{10,})/i,
  /drive\.google\.com\/open\?(?:[^#]*&)?id=([A-Za-z0-9_-]{10,})/i,
  /drive\.google\.com\/uc\?(?:[^#]*&)?id=([A-Za-z0-9_-]{10,})/i,
];

export function driveFileId(url: string): string {
  const s = String(url || '');
  if (isDriveFolder(s)) return '';
  for (const re of DRIVE_FILE_RES) {
    const m = s.match(re);
    if (m?.[1]) return m[1];
  }
  return '';
}

/** URL embed Drive — `/preview`, bukan `/view`: yang pertama bisa di-iframe. */
export function drivePreviewUrl(url: string): string {
  const id = driveFileId(url);
  return id ? `https://drive.google.com/file/d/${id}/preview` : '';
}

/**
 * Satu berkas dari storage/CDN, dengan batas waktu.
 *
 * Tanpa `signal` host yang menggantung membuat modal berputar selamanya —
 * `try/catch` tidak pernah jalan selama `fetch` masih pending
 * (2026-10-29, `verify:fetch-boundary`).
 */
const FETCH_MS = 20_000;

/**
 * Satu pintu untuk kegagalan render. Modal tetap berakhir di keadaan
 * "tidak bisa dipratinjau" + Unduh, tetapi konsol harus bisa menjelaskan
 * kenapa — satu tempat, supaya tidak ada `console` baru di tiap cabang.
 */
function renderFailed(what: string, e: unknown): null {
  console.error('[Preview]', what, e);
  return null;
}

async function fetchDocBlob(url: string): Promise<Blob | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_MS) });
    if (!res.ok) return null;
    return await res.blob();
  } catch (e) {
    return renderFailed('fetch gagal', e);
  }
}

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Dokumen pembungkus untuk hasil render spreadsheet.
 *
 * ⚠ JANGAN menambah `border` di `#cv-preview-table`. Versi lama menaruh
 * `td, th { border:1px solid #cbd5e1 }` di sini DAN memakai
 * `XLSX.utils.sheet_to_html`, yang tidak membawa border dari `styles.xml` —
 * hasilnya grid seragam di seluruh berkas: "kertas grafik", bukan form.
 * Pemilik 2026-11-16: *"kalau excel kek kemarin kotor gak kek aslinya"*.
 * Border sekarang datang per sel dari `xlsxPreviewHtml`.
 */
function sheetDocument(tableHtml: string, nama: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(nama)}</title><style>
html,body{margin:0;background:#fff}
body{padding:14px 16px 24px;font-family:Arial,Helvetica,sans-serif}
.cap{margin:0 0 10px;font:600 12px system-ui,-apple-system,sans-serif;color:#64748b}
.wrap{overflow:auto}
#cv-preview-table{border-collapse:collapse;table-layout:fixed;background:#fff;color:#111}
#cv-preview-table td{overflow:hidden}
/* Fallback SheetJS (.xls biner / .csv): tabel DATA, bukan form — garis tipis wajar. */
.data{border-collapse:collapse;background:#fff;color:#111;font-size:12px}
.data td,.data th{border:1px solid #e2e8f0;padding:4px 8px;white-space:nowrap}
.data th{background:#f1f5f9;font-weight:700}
</style></head><body><p class="cap">${esc(nama)}</p><div class="wrap">${tableHtml}</div></body></html>`;
}

/**
 * `.xlsx` → `xlsxPreviewHtml` (membaca `styles.xml`: border per sisi, merge,
 * lebar kolom, font, format angka). `.xls`/`.csv` → SheetJS, karena keduanya
 * tidak membawa styles.xml yang bisa dibaca.
 */
async function renderSheetToHtml(url: string): Promise<string | null> {
  const nama = decodeURIComponent(url.split('/').pop() || 'spreadsheet');
  const blob = await fetchDocBlob(url);
  if (!blob) return null;

  if (/\.(xlsx|xlsm)(\?.*)?$/i.test(url)) {
    try {
      const table = await xlsxPreviewHtml(blob);
      if (table) return sheetDocument(table, nama);
    } catch (e) {
      renderFailed('xlsx render gagal', e);
    }
  }

  try {
    const XLSX = await loadXlsx();
    if (!XLSX) return null;
    const wb = XLSX.read(new Uint8Array(await blob.arrayBuffer()), { type: 'array' });
    const sheet = wb?.Sheets?.[wb.SheetNames?.[0] ?? ''];
    if (!sheet) return null;
    return sheetDocument(XLSX.utils.sheet_to_html(sheet), nama);
  } catch (e) {
    return renderFailed('sheet render gagal', e);
  }
}

/** Halaman putih untuk hasil mammoth — bentuk terdekat dengan Word-nya. */
function docxDocument(bodyHtml: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;background:#e2e8f0}
.page{background:#fff;color:#111;max-width:820px;margin:16px auto;padding:26px 30px;
box-shadow:0 1px 3px rgba(15,23,42,.25);font:14px/1.5 Arial,Helvetica,sans-serif}
.page p{margin:0 0 6px}
.page table{border-collapse:collapse;width:100%;margin:0 0 10px}
/* mammoth membuang border/lebar asli Word. Form CV berupa tabel, jadi garis
   tipis adalah pendekatan terdekat — tanpa itu semua sel menyatu. */
.page td,.page th{border:1px solid #94a3b8;padding:4px 6px;vertical-align:top}
.page img{max-width:100%;height:auto}
/* mammoth juga membuang UKURAN gambar: pas foto 600×800 di dalam sel 90 pt
   akan mengisi seluruh lebar sel dan mendorong form keluar layar (terlihat
   2026-11-16). Batas tinggi mengembalikannya ke ukuran pas foto. */
.page td img,.page th img{max-width:100%;max-height:150px;width:auto;height:auto}
</style></head><body><div class="page">${bodyHtml}</div></body></html>`;
}

/**
 * `.docx` → HTML di klien lewat mammoth (sudah dipakai `loadDocxTemplate`).
 *
 * KENAPA TIDAK LAGI ke Microsoft (2026-11-16): iframe `view.officeapps.live.com`
 * berhenti di "We're fetching your file…" untuk berkas Cloudinary — pratinjau
 * `.docx` tidak pernah tampil, padahal berkasnya sehat (200, MIME benar).
 */
async function renderDocxToHtml(url: string): Promise<string | null> {
  const blob = await fetchDocBlob(url);
  if (!blob) return null;
  try {
    const mammoth = await import('mammoth');
    const out = await mammoth.convertToHtml({ arrayBuffer: await blob.arrayBuffer() });
    const body = String(out?.value || '');
    return body.trim() ? docxDocument(body) : null;
  } catch (e) {
    return renderFailed('docx render gagal', e);
  }
}

export default function DocumentPreviewModal({ url, title, onClose, previewOnly, closing = false, mime }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  /**
   * "Slow", NOT "failed". Set by the 8-second notice below, cleared the moment
   * the frame finally reports `load`.
   *
   * KENAPA DIPISAH (terukur 2026-11-16)
   * -----------------------------------
   * Pemilik: *"masih banyak pratinjau yg gagal"*, dengan tangkapan layar
   * "Sertif SSW — Gagal memuat pratinjau". Diukur di produksi:
   *   · **270 dari 270** URL dokumen (`ssw_url`, `jft_url`, `file_cv`) menjawab
   *     **200** dengan MIME yang benar — tidak ada satu berkas pun rusak;
   *   · modal-nya yang salah: timer 8 detik menulis `error = true`, dan cabang
   *     `error` MENGGANTI isi — iframe-nya di-unmount, jadi pemuatan yang
   *     selesai pada detik ke-12 tidak pernah terlihat.
   * Direproduksi pada komponen ini sendiri (Chromium, throttle 400 kbps):
   * `iframe=no err=true`, teks persis seperti tangkapan layar pemilik.
   * Dengan jaringan cepat/3G-normal: `iframe=yes err=false`.
   *
   * Jadi batas waktu hanya boleh menjadi PETUNJUK, bukan putusan: berkas 0,8–3,4 MB
   * lewat Google Docs Viewer memang bisa lebih dari 8 detik di jaringan lambat.
   */
  const [slow, setSlow] = useState(false);
  const [renderedHtml, setRenderedHtml] = useState<string | null>(null);
  // MEASURED 2026-10-11 on production `share?job=TG591ASJ`, in Chromium, with a
  // HAR-level timeline:
  //
  //   75206 REQ  <CV .xlsx>              ← the iframe rendered HERE
  //   75216 REQ  cdn.sheetjs.com/xlsx…   ← SheetJS only STARTED loading here
  //   75305 REQ  <CV .xlsx>
  //   75482 DOWNLOAD 1._DWI_AYU_ANGGRAINI_CV.xlsx
  //
  // 60 KB of spreadsheet can never render as HTML, so the browser did the only
  // thing left and downloaded it. The owner reported exactly this: "buka preview
  // cv malah auto donload juga".
  //
  // `renderContent()` was rendering the `<iframe src={url}>` fallback while the
  // SheetJS render was still in flight, because nothing gated it on the pending
  // work. Two facts make that fallback permanently wrong for a spreadsheet:
  // `isExcel(url)` is true, so a *deferred* HTML render is coming; and Supabase
  // serves these files as
  // `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` with NO
  // `Content-Disposition: inline`, which an iframe treats as a download, while
  // `application/pdf` (the JFT/SSW siblings) renders inline and so never showed
  // the bug.
  //
  // `renderPending` is what closes the race: while a client-side render is
  // outstanding, show the spinner and DO NOT mount the iframe. It is
  // initialised from the URL so the very first paint after the click is already
  // holding back, rather than waiting for an effect that runs a tick too late.
  //
  // Sejak 2026-11-16 gerbang yang sama juga menahan `.docx`: mammoth butuh
  // waktu membaca ZIP-nya, dan iframe `src={url}` untuk `.docx` akan membuat
  // browser MENGUNDUH berkasnya (MIME-nya bukan yang bisa dirender inline).
  const [renderPending, setRenderPending] = useState(() => renderKind(url, mime) !== '');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Escape is handled by `useOverlay` below, on the capture phase and with
  // `stopImmediatePropagation` so only the topmost overlay closes. A second,
  // hand-rolled `window` listener used to live here as well and was strictly
  // worse: its empty dep array pinned the FIRST `onClose` for the lifetime of
  // the component, and it fired even when this modal was not the topmost one.

  // 8-second NOTICE (legacy preview.ts timer). It used to raise `error`, which
  // unmounted the frame — see the `slow` note above. A timeout is not evidence
  // of failure, so it only reveals whatever has painted and offers the download.
  //
  // `renderPending` is excluded on purpose: while the client-side render is in
  // flight the iframe is deliberately NOT mounted (anti auto-download), so the
  // 8 s would always elapse and warn about a file that is still being parsed.
  // That path has its own 20 s fetch bound and its own failure state
  // ("tidak bisa dipratinjau" + Unduh).
  useEffect(() => {
    if (!loading || renderPending) return;
    const timeout = setTimeout(() => {
      setLoading(false);
      setSlow(true);
    }, 8000);
    return () => clearTimeout(timeout);
  }, [loading, renderPending]);

  // Render di klien: spreadsheet (.xlsx/.xls/.csv) dan Word (.docx).
  useEffect(() => {
    const kind = renderKind(url, mime);
    if (!kind) return;
    setLoading(true);
    setRenderPending(true);
    (kind === 'sheet' ? renderSheetToHtml(url) : renderDocxToHtml(url)).then((html) => {
      if (html) {
        setRenderedHtml(html);
        setLoading(false);
      } else {
        // Render failed (berkas bukan xlsx asli, jaringan putus, atau pustaka
        // gagal dimuat). Release the gate BEFORE flipping to the fallback —
        // leaving `renderPending` true would trap the user on a spinner
        // forever, which is a worse failure than a download.
        //
        // `loading` is cleared here too: the spinner is absolutely positioned
        // over the content area (`inset-0`), so leaving it up would hide the
        // fallback that is about to render.
        setLoading(false);
        setError(false);
      }
      setRenderPending(false);
    });
  }, [url, mime]);

  // Drive folder fallback (parity legacy bukaPreviewDokumen)
  useEffect(() => {
    if (isDriveFolder(url)) {
      window.open(url, '_blank', 'noopener');
      onClose();
    }
  }, [url]);

  // A late `load` must be able to clear everything the notice raised: that is
  // the whole point of not treating the timeout as a failure.
  const handleLoad = () => { setLoading(false); setSlow(false); setError(false); };
  const handleError = () => { setLoading(false); setError(true); };

  const renderContent = () => {
    // Drive file → embed endpoint. Diperiksa PALING AWAL: tautannya tidak
    // berakhiran ekstensi, jadi semua pemeriksaan berbasis ekstensi di bawah
    // ini pasti meleset (lihat catatan `driveFileId`).
    const driveEmbed = drivePreviewUrl(url);
    if (driveEmbed) {
      return (
        <iframe
          ref={iframeRef}
          src={driveEmbed}
          class="w-full h-full border-0 rounded-lg"
          onLoad={handleLoad}
          onError={handleError}
          title={title}
          allow="autoplay"
        />
      );
    }

    if (mime ? mime.startsWith('image/') : isImage(url)) {
      return (
        <div class="flex items-center justify-center h-full overflow-auto">
          <img
            src={url}
            alt={title}
            class="max-w-full max-h-full object-contain rounded-lg"
            onLoad={handleLoad}
            onError={handleError}
          />
        </div>
      );
    }

    if (mime ? mime === 'application/pdf' : isPdf(url)) {
      // Use Google Docs Viewer for better mobile compatibility (from legacy preview.ts)
      return (
        <iframe
          ref={iframeRef}
          src={url.startsWith('blob:') ? url : getPdfViewerUrl(url)}
          class="w-full h-full border-0 rounded-lg"
          onLoad={handleLoad}
          onError={handleError}
          title={title}
        />
      );
    }

    if (renderKind(url, mime) && renderedHtml) {
      // Hasil render di klien: spreadsheet (xlsxPreviewHtml/SheetJS) atau docx
      // (mammoth). srcDoc, bukan src — berkasnya tidak pernah diserahkan ke
      // browser, jadi tidak ada unduhan tak sengaja.
      return (
        <iframe
          ref={iframeRef}
          srcDoc={renderedHtml}
          class="w-full h-full border-0 rounded-lg bg-white"
          onLoad={handleLoad}
          onError={handleError}
          title={title}
        />
      );
    }

    // ⚠ THERE IS DELIBERATELY NO `if (isExcel(url)) <iframe src={url}>` HERE.
    //
    // One used to sit at this point, as the "render failed" fallback. Supabase
    // serves these spreadsheets with no `Content-Disposition: inline`, so an
    // iframe pointing at the file makes the browser DOWNLOAD it — the fallback
    // *was* the auto-download. MEASURED 2026-10-13: the vendor CDN was
    // unreachable, so that fallback was reached on EVERY spreadsheet preview,
    // which is why the owner saw a download every time ("tiap mo buka preview
    // mengdonload").
    //
    // A spreadsheet whose client-side render failed now falls through to the
    // "cannot preview inline" state below, which offers an explicit Unduh
    // button. An explicit click is the only way this modal may hand a file to
    // the browser — do not reintroduce an iframe src pointing at a document
    // URL here.
    //
    // ⚠ SAMA untuk Office: tidak ada lagi iframe ke `view.officeapps.live.com`.
    // Terukur 2026-11-16 — halaman Microsoft berhenti di "We're fetching your
    // file…" dan tidak pernah selesai untuk berkas Cloudinary, jadi `.doc`,
    // `.pptx`, `.odt` dst. berhenti di keadaan jujur di bawah (pesan + Unduh).

    // Fallback: unsupported file type (from legacy preview.ts)
    const ext = url.match(/\.([a-z0-9]+)([?#].*)?$/i)?.[1] || '';
    return (
      <div class="flex items-center justify-center h-full">
        <div class="text-center space-y-4">
          <Icon name="file" class="text-5xl text-slate-400" />
          <p class="text-sm text-slate-300 font-bold">
            {t('ui.preview_unavailable')} {ext && <span class="opacity-60">(.{ext})</span>}
          </p>
          <p class="text-xs text-slate-500">{t('ui.preview_unavailable_hint')}</p>
          {!previewOnly ? (
            <a href={url} target="_blank" rel="noopener"
               class="inline-block px-6 py-3 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-bold text-sm transition">
              <Icon name="download" class="mr-2" />{t('ui.download')}
            </a>
          ) : (
            <p class="text-xs text-slate-500 italic">{t('ui.preview_admin_only_download')}</p>
          )}
        </div>
      </div>
    );
  };

  const { containerRef, onBackdropClick } = useOverlay({ open: true, onClose, closing });

  return (
    <div class="fixed inset-0 u-modal-shell bg-black/80 backdrop-blur-md z-[300] flex flex-col p-2 md:p-6" ref={containerRef} role="none" onClick={onBackdropClick}>
      <div class="bg-slate-900 border border-slate-700 rounded-2xl w-full h-full flex flex-col overflow-hidden">
        {/* Header */}
        <div class="flex items-center justify-between px-4 py-3 border-b border-slate-700 shrink-0">
          <h3 class="text-sm font-bold text-white truncate flex-1">
            <Icon name="file-alt" class="mr-2 text-sky-400" />{title}
          </h3>
          <div class="flex items-center gap-2 ml-3">
            {!previewOnly && (
              /* Touch floor (DESIGN.md:852). MEASURED 2026-10-02: 36x28. */
              <a href={url} target="_blank" rel="noopener"
                 class="min-w-11 min-h-11 inline-flex items-center justify-center bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-bold transition"
                 title={t('ui.download')}>
                <Icon name="download" />
              </a>
            )}
            {/* MEASURED 2026-10-02: 24x32 — same pre-6a92f39 shape as the rest. */}
            <button type="button" onClick={onClose}
                    class="min-w-11 min-h-11 inline-flex items-center justify-center text-slate-400 hover:text-white transition">
              <Icon name="times" class="text-xl" />
            </button>
          </div>
        </div>
        {/* Content */}
        <div class="flex-1 relative bg-black/50 m-2 rounded-xl overflow-hidden">
          {/* Full-cover spinner only while there is nothing to look at yet. Once
              the notice fires, it is replaced by the slim bar below so a frame
              that has already painted is no longer hidden behind it. */}
          {loading && !error && !slow && (
            <div class="absolute inset-0 flex items-center justify-center z-10">
              <div class="text-center space-y-2">
                <Icon spin name="spinner" class="text-2xl text-sky-400" />
                <p class="text-xs text-slate-400">{t('ui.preview_loading')}</p>
              </div>
            </div>
          )}
          {/* Slow-link notice — NON-destructive: the frame stays mounted under
              it, so a load that finishes late is shown instead of being thrown
              away (that discard was the "gagal memuat pratinjau" report). */}
          {slow && !error && (
            <div class="absolute inset-x-0 top-0 z-20 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-b border-slate-700 bg-slate-900/95 px-3 py-2">
              <Icon spin name="spinner" class="text-xs text-sky-400" />
              <span class="text-xs text-slate-300">{t('ui.preview_slow')}</span>
              {!previewOnly && (
                <a href={url} target="_blank" rel="noopener"
                   class="inline-flex items-center gap-1 text-xs font-bold text-sky-400 hover:text-sky-300 underline">
                  <Icon name="download" />{t('ui.download')}
                </a>
              )}
            </div>
          )}
          {error ? (
            <div class="flex items-center justify-center h-full">
              <div class="text-center space-y-3">
                <Icon name="exclamation-triangle" class="text-4xl text-amber-400" />
                <p class="text-sm text-slate-300 font-bold">{t('ui.preview_load_failed')}</p>
                {!previewOnly ? (
                  <a href={url} target="_blank" rel="noopener"
                     class="inline-block px-6 py-3 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-bold text-sm transition">
                    <Icon name="download" class="mr-2" />{t('ui.download')}
                  </a>
                ) : (
                  <p class="text-xs text-slate-500 italic">{t('ui.preview_admin_only_download')}</p>
                )}
              </div>
            </div>
          ) : renderPending ? null : renderContent()}
        </div>
      </div>
    </div>
  );
}
