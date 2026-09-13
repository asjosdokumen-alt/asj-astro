import { useState, useCallback } from 'preact/hooks';
import { cvFactory, loadExcelTemplate, loadDocxTemplate, loadPdfTemplate, normalizeMasterData } from '../lib/cv-template-factory';
import type { CvTemplate, CandidateData } from '../lib/cv-template-factory';
import apiClient from '../lib/apiClient';
import { t } from '../store/i18n';
import Icon from './ui/Icon';

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
  const [templates] = useState<CvTemplate[]>(() => cvFactory.list());

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
    setLoading(true);
    setError('');
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
      downloadBlob(result.blob, result.fileName);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Gagal generate CV');
    } finally {
      setLoading(false);
    }
  }, [waTarget, isAdmin, onOpenRirekisho, onClose, downloadBlob]);

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
    <div class="fixed inset-0 bg-black/70 backdrop-blur-md z-[200] flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="bg-slate-900 border border-slate-700 p-6 rounded-[2rem] w-full max-w-lg max-h-[85vh] overflow-auto shadow-2xl">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-bold text-sky-400"><Icon name="file-alt" class="mr-2" />{t('ui.select_cv_template')}</h3>
          <button onClick={onClose} class="text-slate-400 hover:text-white"><Icon name="times" class="text-xl" /></button>
        </div>
        {error && <p class="text-red-400 text-sm mb-4">{error}</p>}
        <div class="space-y-3">
          {templates.map((tmpl) => (
            <button
              key={tmpl.id}
              onClick={() => handleGenerate(tmpl.id)}
              disabled={loading}
              class="w-full flex items-center gap-3 p-4 rounded-xl border border-slate-700 bg-slate-800 hover:border-sky-500 hover:bg-slate-750 transition text-left disabled:opacity-50"
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
          <label class="flex items-center justify-center w-full gap-2 p-4 text-sm text-slate-300 bg-slate-800 border-2 border-dashed border-slate-600 rounded-xl cursor-pointer hover:border-sky-500 hover:bg-slate-750 transition">
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
            <button
              onClick={handleCustomGenerate}
              disabled={generating}
              class="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-white bg-sky-600 rounded-xl hover:bg-sky-500 transition disabled:opacity-60"
            >
              {generating ? <><Icon name="spinner" class="animate-spin" /> {t('ui.generating_cv')}</> : 'Generate dengan Template Kustom'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
