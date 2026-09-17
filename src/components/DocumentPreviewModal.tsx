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
}

// Lazy-loaded SheetJS vendor for Excel/CSV rendering
let xlsxVendorLoaded = false;
let xlsxVendorPromise: Promise<void> | null = null;

async function loadXlsxVendor(): Promise<boolean> {
  if (typeof (window as any).XLSX !== 'undefined') return true;
  if (xlsxVendorLoaded) return typeof (window as any).XLSX !== 'undefined';
  
  if (!xlsxVendorPromise) {
    xlsxVendorPromise = new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js';
      script.onload = () => {
        xlsxVendorLoaded = true;
        resolve();
      };
      script.onerror = () => {
        xlsxVendorPromise = null;
        resolve();
      };
      document.head.appendChild(script);
    });
  }
  await xlsxVendorPromise;
  return typeof (window as any).XLSX !== 'undefined';
}

// Check if URL is an image (including Cloudinary URLs)
function isImage(url: string): boolean {
  const lower = url.toLowerCase();
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

// Client-side Excel/CSV rendering via SheetJS
async function renderExcelToHtml(url: string): Promise<string | null> {
  try {
    const loaded = await loadXlsxVendor();
    if (!loaded) return null;
    
    const XLSX = (window as any).XLSX;
    const res = await fetch(url);
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

export default function DocumentPreviewModal({ url, title, onClose, previewOnly }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [excelHtml, setExcelHtml] = useState<string | null>(null);
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
    if (isExcel(url)) {
      setLoading(true);
      renderExcelToHtml(url).then((html) => {
        if (html) {
          setExcelHtml(html);
          setLoading(false);
        } else {
          // Fallback to iframe if client-side render fails
          setError(false);
        }
      });
    }
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
    if (isImage(url)) {
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

    if (isPdf(url)) {
      // Use Google Docs Viewer for better mobile compatibility (from legacy preview.ts)
      return (
        <iframe
          ref={iframeRef}
          src={getPdfViewerUrl(url)}
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

    if (isExcel(url)) {
      // Fallback to iframe if client-side render failed
      return (
        <iframe
          ref={iframeRef}
          src={url}
          class="w-full h-full border-0 rounded-lg"
          onLoad={handleLoad}
          onError={handleError}
          title={title}
        />
      );
    }

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

  const { containerRef, onBackdropClick } = useOverlay({ open: true, onClose });

  return (
    <div class="fixed inset-0 u-modal-shell bg-black/80 backdrop-blur-md z-[300] flex flex-col p-2 md:p-6" ref={containerRef} onClick={onBackdropClick}>
      <div class="bg-slate-900 border border-slate-700 rounded-2xl w-full h-full flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div class="flex items-center justify-between px-4 py-3 border-b border-slate-700 shrink-0">
          <h3 class="text-sm font-bold text-white truncate flex-1">
            <Icon name="file-alt" class="mr-2 text-sky-400" />{title}
          </h3>
          <div class="flex items-center gap-2 ml-3">
            {!previewOnly && (
              <a href={url} target="_blank" rel="noopener"
                 class="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-bold transition"
                 title={t('ui.download')}>
                <Icon name="download" />
              </a>
            )}
            <button onClick={onClose}
                    class="text-slate-400 hover:text-white transition p-1">
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
          ) : renderContent()}
        </div>
      </div>
    </div>
  );
}
