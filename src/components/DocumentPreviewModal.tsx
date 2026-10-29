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

function isOffice(url: string): boolean {
  return /\.(doc|docx|ppt|pptx|odt|ods|odp)(\?.*)?$/i.test(url);
}

// Google Docs Viewer for PDFs (better mobile compatibility than native iframe)
function getPdfViewerUrl(url: string): string {
  return 'https://docs.google.com/gview?url=' + encodeURIComponent(url) + '&embedded=true';
}

// MS Office Viewer for Office docs
function getOfficeViewerUrl(url: string): string {
  return 'https://view.officeapps.live.com/op/embed.aspx?src=' + encodeURIComponent(url);
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

// Client-side Excel/CSV rendering via SheetJS
async function renderExcelToHtml(url: string): Promise<string | null> {
  try {
    const XLSX = await loadXlsx();
    if (!XLSX) return null;

    // Bounded: this is a storage/CDN blob, and without a timer a stalled host
    // left the preview modal spinning forever — the `try/catch` never runs
    // while `fetch` is pending. On timeout it returns null, which the modal
    // already renders as "no preview" (2026-10-29, `verify:fetch-boundary`).
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    
    const buf = await res.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    if (!wb || !wb.SheetNames || !wb.SheetNames.length) return null;
    
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) return null;
    
    const html = XLSX.utils.sheet_to_html(sheet);
    const nama = decodeURIComponent(url.split('/').pop() || 'spreadsheet');
    
    return `
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${nama}</title>
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #e2e8f0; margin: 0; padding: 16px; font-size: 13px; }
          table { border-collapse: collapse; background: #fff; color: #0f172a; min-width: 60%; }
          td, th { border: 1px solid #cbd5e1; padding: 6px 10px; white-space: nowrap; }
          th { background: #e2e8f0; position: sticky; top: 0; font-weight: 700; }
          tr:nth-child(even) td { background: #f8fafc; }
          td[data-t] { text-align: center; }
        </style>
      </head>
      <body>
        <div style="margin-bottom:10px;color:#94a3b8;font-size:12px">📊 ${nama}</div>
        ${html}
      </body>
      </html>
    `;
  } catch (e) {
    console.error('[Preview] Excel render failed:', e);
    return null;
  }
}

export default function DocumentPreviewModal({ url, title, onClose, previewOnly, closing = false, mime }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [excelHtml, setExcelHtml] = useState<string | null>(null);
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
  // `excelPending` is what closes the race: while a client-side spreadsheet
  // render is outstanding, show the spinner and DO NOT mount the iframe. It is
  // initialised from `isExcel(url)` so the very first paint after the click is
  // already holding back, rather than waiting for an effect that runs a tick too
  // late.
  const [excelPending, setExcelPending] = useState(() => isExcel(url));
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Escape is handled by `useOverlay` below, on the capture phase and with
  // `stopImmediatePropagation` so only the topmost overlay closes. A second,
  // hand-rolled `window` listener used to live here as well and was strictly
  // worse: its empty dep array pinned the FIRST `onClose` for the lifetime of
  // the component, and it fired even when this modal was not the topmost one.

  // 8-second timeout fallback (from legacy preview.ts)
  useEffect(() => {
    if (!loading) return;
    const timeout = setTimeout(() => {
      if (loading) {
        setLoading(false);
        setError(true);
      }
    }, 8000);
    return () => clearTimeout(timeout);
  }, [loading]);

  // Excel/CSV client-side rendering (from legacy preview.ts)
  useEffect(() => {
    if (!isExcel(url)) return;
    setLoading(true);
    setExcelPending(true);
    renderExcelToHtml(url).then((html) => {
      if (html) {
        setExcelHtml(html);
        setLoading(false);
      } else {
        // Render failed (SheetJS CDN blocked, or the file is not really a
        // spreadsheet). Release the gate BEFORE flipping to the iframe
        // fallback — leaving `excelPending` true would trap the user on a
        // spinner forever, which is a worse failure than a download.
        //
        // `loading` is cleared here too: the spinner is absolutely positioned
        // over the content area (`inset-0`), so leaving it up would hide the
        // iframe fallback that is about to render. The 8s timeout effect only
        // clears `loading` on a stuck load, which is a different case.
        setLoading(false);
        setError(false);
      }
      setExcelPending(false);
    });
  }, [url]);

  // Drive folder fallback (parity legacy bukaPreviewDokumen)
  useEffect(() => {
    if (isDriveFolder(url)) {
      window.open(url, '_blank', 'noopener');
      onClose();
    }
  }, [url]);

  const handleLoad = () => setLoading(false);
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

    if (isExcel(url) && excelHtml) {
      // Client-side rendered Excel (from legacy preview.ts)
      return (
        <iframe
          ref={iframeRef}
          srcDoc={excelHtml}
          class="w-full h-full border-0 rounded-lg"
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

    if (isOffice(url)) {
      return (
        <iframe
          ref={iframeRef}
          src={getOfficeViewerUrl(url)}
          class="w-full h-full border-0 rounded-lg"
          onLoad={handleLoad}
          onError={handleError}
          title={title}
        />
      );
    }

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
          {loading && !error && (
            <div class="absolute inset-0 flex items-center justify-center z-10">
              <div class="text-center space-y-2">
                <Icon spin name="spinner" class="text-2xl text-sky-400" />
                <p class="text-xs text-slate-400">{t('ui.preview_loading')}</p>
              </div>
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
          ) : excelPending ? null : renderContent()}
        </div>
      </div>
    </div>
  );
}
