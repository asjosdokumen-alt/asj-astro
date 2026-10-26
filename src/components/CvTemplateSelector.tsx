import { useState, useCallback } from 'preact/hooks';
import { cvFactory, loadExcelTemplate, loadDocxTemplate, loadPdfTemplate, normalizeMasterData, xlsxPreviewHtml } from '../lib/cv-template-factory';
import type { CvTemplate, CandidateData } from '../lib/cv-template-factory';
import apiClient from '../lib/apiClient';
import { t } from '../store/i18n';
import Icon from './ui/Icon';
import { useOverlay } from './ui/useOverlay';

interface Props {
  waTarget: string;
  isAdmin: boolean;
  onClose: () => void;
  onOpenRirekisho?: () => void;
}

const SUPPORTED_EXT: readonly string[] = ['xlsx', 'docx', 'pdf'];

function getFileExt(name: string): string | null {
  const ext = name.split('.').pop()?.toLowerCase();
  return ext && SUPPORTED_EXT.includes(ext) ? ext : null;
}

export default function CvTemplateSelector({ waTarget, isAdmin, onClose, onOpenRirekisho }: Props) {
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [customFile, setCustomFile] = useState<File | null>(null);
  /**
   * Pratinjau hasil SEBELUM diunduh.
   *
   * Pemilik 2026-10-26: "pilihan template ada preview hasil data nya, jgn
   * langsung download". Klik template sekarang merender berkasnya di memori,
   * menampilkan isinya sebagai tabel, dan baru mengunduh setelah tombol Unduh
   * ditekan — jadi salah isi ketahuan tanpa membuka Excel.
   */
  const [preview, setPreview] = useState<{
    html: string;
    blob: Blob;
    fileName: string;
    title: string;
  } | null>(null);
  // Daftar yang DITAWARKAN, bukan seluruh yang terdaftar: `listed: false` menandai
  // template yang tetap ada di factory tapi hasilnya bukan CV yang dipakai
  // (dump Field|Value, HTML bernama .docx, dan pratinjau A4 yang menduplikasi
  // tombol lain). Pemilik 2026-10-26: "lebih sederhanakan saja".
  const [templates] = useState<CvTemplate[]>(() =>
    cvFactory.list().filter((t) => t.listed !== false),
  );

  /**
   * This overlay was the one modal in the admin panel that carried NEITHER
   * `.u-modal-shell` NOR any dialog semantics — measured 2026-10-08 in a real
   * browser, on `#pelamar` -> "Pilih Template CV".
   *
   * Two consequences, both real and both invisible:
   *   - `e2e/test-dialog.mjs`, `e2e/test-candidate-modals.mjs` and
   *     `e2e/test-aria-names.mjs` all key on `.u-modal-shell`, so the component
   *     was unreachable by EVERY overlay gate. This is the same defect
   *     `RejectMailModal` had, and `overlay-contract.test.tsx` records it there
   *     verbatim: "the component was invisible to the guard by CLASS, not merely
   *     by route".
   *   - with no role/aria-modal there was no Escape handler and no focus
   *     management either: the only way out was the mouse, and a keyboard user
   *     stayed behind the scrim.
   *
   * `open: true` is correct because the component is mounted only while it is
   * open (`TabPelamar` renders it behind `showCvTemplateSelector`), and the hook
   * resolves the dialog's name from the `<h3>` below.
   */
  const { containerRef, onBackdropClick } = useOverlay({ open: true, onClose });

  const downloadBlob = useCallback((blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleGenerate = useCallback(async (templateId: string) => {
    if (templateId === 'rirekisho-a4') {
      onOpenRirekisho?.();
      onClose();
      return;
    }
    setError('');
    // Tanpa WA, server menjawab `Data Master belum ada ()` — pesan yang terlihat
    // seperti kandidatnya tidak punya data, padahal nomornya yang tidak terkirim.
    // Penyebab aslinya ada di pemanggil (tombol "Pilih Template CV" dulu tidak
    // mengisi `rirekWa`); penjagaan ini supaya kalau terulang, pesannya jujur.
    if (!waTarget.trim()) {
      setError('Kandidat belum dipilih — buka "Pilih Template CV" dari baris kandidat.');
      return;
    }
    setLoading(true);
    try {
      const d = await apiClient.call<Record<string, unknown>>('getDrafCvMaster', [waTarget]);
      if (!d || (d as Record<string, unknown>).error) {
        setError((d as Record<string, unknown>).error as string || 'Gagal memuat data');
        return;
      }
      const data: CandidateData = normalizeMasterData(d as Record<string, unknown>);
      const result = await cvFactory.render(templateId, data, { waTarget, isAdmin, templateId });
      if (!result.success || !result.blob) {
        setError(result.error || 'Gagal generate CV');
        return;
      }
      // Pratinjau dulu; unduhan terjadi di tombol Unduh, bukan di sini.
      const html = await xlsxPreviewHtml(result.blob);
      const tmpl = templates.find((x) => x.id === templateId);
      setPreview({ html, blob: result.blob, fileName: result.fileName, title: tmpl?.name || '' });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Gagal generate CV');
    } finally {
      setLoading(false);
    }
  }, [waTarget, isAdmin, onOpenRirekisho, onClose, templates]);

  const handleCustomGenerate = useCallback(async () => {
    if (!customFile) return;
    const ext = getFileExt(customFile.name);
    if (!ext) {
      setError('Tipe file tidak didukung. Gunakan .docx, .xlsx, atau .pdf');
      return;
    }
    setGenerating(true);
    setError('');
    try {
      const d = await apiClient.call<Record<string, unknown>>('getDrafCvMaster', [waTarget]);
      if (!d || (d as Record<string, unknown>).error) {
        setError((d as Record<string, unknown>).error as string || 'Gagal memuat data');
        return;
      }
      const data: CandidateData = normalizeMasterData(d as Record<string, unknown>);
      const baseName = customFile.name.replace(/\.[^.]+$/, '');
      if (ext === 'xlsx') {
        const blob = await loadExcelTemplate(customFile, data);
        downloadBlob(blob, `${baseName}_generated.xlsx`);
      } else if (ext === 'docx') {
        const { html } = await loadDocxTemplate(customFile, data);
        downloadBlob(new Blob([html], { type: 'text/html' }), `${baseName}_generated.html`);
      } else {
        const text = await loadPdfTemplate(customFile, data);
        downloadBlob(new Blob([text], { type: 'text/plain' }), `${baseName}_generated.txt`);
      }
      setCustomFile(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Gagal generate CV dengan template kustom');
    } finally {
      setGenerating(false);
    }
  }, [customFile, waTarget, downloadBlob]);

  return (
    <div ref={containerRef} role="none" class="fixed inset-0 u-modal-shell bg-black/70 backdrop-blur-md z-[200] flex items-center justify-center p-4" onClick={onBackdropClick}>
      {/* No `onClick={stopPropagation}` on the panel: `useOverlay`'s
          `onBackdropClick` already closes only when `e.target === containerRef`,
          so a click inside the panel cannot reach the close path. The explicit
          guard is one fewer interactive static element for the a11y ratchet to
          carry — `lint-ratchet` failed on exactly that when it was here. */}
      <div class={`bg-slate-900 border border-slate-700 p-6 rounded-[2rem] w-full ${preview ? 'max-w-6xl' : 'max-w-lg'} max-h-[85vh] overflow-auto shadow-2xl`}>
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-bold text-sky-400"><Icon name="file-alt" class="mr-2" />{t('ui.select_cv_template')}</h3>
          <button type="button" onClick={onClose} aria-label={t('ui.close')} class="min-w-11 min-h-11 inline-flex items-center justify-center text-slate-400 hover:text-white"><Icon name="times" class="text-xl" /></button>
        </div>
        {error && <p class="text-red-400 text-sm mb-4">{error}</p>}
        {preview ? (
          <div class="space-y-3">
            {/* Border/fill template tidak ikut diekspor SheetJS (itu SheetJS Pro);
                garis di bawah ini hanya supaya sel terbaca sebagai tabel, bukan
                meniru form. Yang dicetak tetap berkas .xlsx-nya. */}
            <style>{`.cv-preview table{border-collapse:collapse;table-layout:fixed;background:#fff;color:#111;font-size:9px}
.cv-preview td{border:1px solid #94a3b8;padding:1px 3px;vertical-align:middle;white-space:pre-wrap;line-height:1.15}`}</style>
            <div class="flex items-center justify-between gap-3">
              <p class="text-sm font-semibold text-slate-300">
                {t('ui.preview_cv')} · <span class="text-white">{preview.title}</span>
              </p>
              <button type="button" onClick={() => setPreview(null)}
                class="min-h-11 px-3 rounded-lg border border-slate-600 text-xs font-bold text-slate-200 hover:bg-slate-800">
                {t('button.back')}
              </button>
            </div>
            <div class="rounded-xl border border-slate-700 bg-white overflow-auto max-h-[58vh]">
              <div class="cv-preview" dangerouslySetInnerHTML={{ __html: preview.html }} />
            </div>
            <button type="button" onClick={() => downloadBlob(preview.blob, preview.fileName)}
              class="w-full flex flex-wrap items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-white bg-sky-600 rounded-xl hover:bg-sky-500 transition">
              <Icon name="download" />
              <span>{t('ui.unduh')}</span>
              <span class="font-mono text-[11px] font-normal opacity-80">{preview.fileName}</span>
            </button>
          </div>
        ) : (
        <>
        <div class="space-y-3">
          {templates.map((tmpl) => (
            <button type="button"
              key={tmpl.id}
              onClick={() => handleGenerate(tmpl.id)}
              disabled={loading}
              class="w-full flex items-center gap-3 p-4 rounded-xl border border-slate-700 bg-slate-800 hover:border-sky-500 hover:bg-slate-700 transition text-left disabled:opacity-50"
            >
              <div class="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center text-sky-400">
                <Icon name={tmpl.icon || 'file'} />
              </div>
              <div>
                <div class="text-sm font-bold text-white">{tmpl.name}</div>
                <div class="text-xs text-slate-400">{tmpl.description}</div>
              </div>
            </button>
          ))}
        </div>

        <hr class="border-slate-700 my-5" />

        <div class="space-y-3">
          <h4 class="text-sm font-semibold text-slate-300 flex items-center gap-2"><Icon name="upload" />{t("ui.upload_custom_template")}</h4>
          <label class="flex items-center justify-center w-full gap-2 p-4 text-sm text-slate-300 bg-slate-800 border-2 border-dashed border-slate-600 rounded-xl cursor-pointer hover:border-sky-500 hover:bg-slate-700 transition">
            <Icon name="file-upload" />
            <span>{customFile ? customFile.name : 'Seret & lepas atau klik untuk memilih (.docx/.xlsx/.pdf)'}</span>
            <input
              type="file"
              accept=".docx,.xlsx,.pdf"
              onChange={(e) => setCustomFile((e.target as HTMLInputElement).files?.[0] ?? null)}
              class="hidden"
            />
          </label>
          {customFile && (
            <button type="button"
              onClick={handleCustomGenerate}
              disabled={generating}
              class="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-white bg-sky-600 rounded-xl hover:bg-sky-500 transition disabled:opacity-60"
            >
              {generating ? <><Icon name="spinner" class="animate-spin" /> {t('ui.generating_cv')}</> : 'Generate dengan Template Kustom'}
            </button>
          )}
        </div>
        </>
        )}
      </div>
    </div>
  );
}
