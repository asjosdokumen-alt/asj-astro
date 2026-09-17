/**
 * AdminShareModal.tsx — Share loker config (admin)
 * Port of legacy partials/modals-shared.html #modal-share-loker +
 * js/render/share.ts (bukaModalShare / renderShareCheckboxes /
 * simpanDokumenShare / templateShareWa / copyShareLink / copasShareWa).
 *
 * A15 parity crosscheck (2026-09-05) fixed root bugs:
 *  1. Doc selection was 4 hard-coded checkboxes (CV/JFT/SSW/ALL) that NEVER
 *     loaded the job's saved `dokumenShare` and were NEVER persisted. Legacy
 *     renders chips from the saved config (SHARE_DOC_CHIPS = CV/JFT/SSW/SIM A/
 *     KTP/KK/AKTE/IJAZAH/…/ALL; default 'CV,JFT,SSW') and saves via
 *     updateDokumenShare. The Astro backend handler exists — the UI never
 *     called it. Now chips load from job.dokumenShare and the modal saves via
 *     api.secure('updateDokumenShare', [code, joined]).
 *  2. Save / link-copy / WA-copy were hard-coded copy with non-existent
 *     `toast.*` keys and no feedback parity; now legacy keys + toasts.
 *  3. WA copy used a throwaway message instead of the legacy
 *     templateShareWa (お疲れ様です DOKUMEN … KAMI APLOD/UPDATE DI SINI …)
 *     built from job code/pekerjaan + the share link.
 *  4. The share link pointed at `/share?job=` while ShareView read `?code`;
 *     both now use `?job` (legacy share.html?job=CODE).
 *  5. A per-job share TOKEN was added (2026-09-05) and removed (2026-09-13):
 *     the viewer is public by job code, exactly as legacy. The TSK have no
 *     accounts, so a link they can pass on is the point; the `dokumen_share`
 *     chips below are the only lever on what a viewer may see.
 */
import { useState } from 'preact/hooks';
import { showToast } from '../Toast';
import { t } from '../../store/i18n';
import Icon from '../ui/Icon';
import { useOverlay } from '../ui/useOverlay';
import api from '../../lib/apiClient';

interface Job {
  code: string;
  pekerjaan: string;
  tsk?: string;
  dokumenShare?: string;
}
interface Props { job: Job; onClose: () => void; }

/** Chip dokumen share — parity legacy js/render/share.ts SHARE_DOC_CHIPS. */
export const SHARE_DOC_CHIPS = [
  'CV', 'JFT', 'SSW', 'SIM A', 'KTP', 'KK', 'AKTE', 'IJAZAH',
  'IJAZAH SD', 'IJAZAH SMP', 'IJAZAH SMA', 'UNIVERSITAS', 'ALL',
];

/** i18n label key per chip; token tanpa kunci tampil apa adanya (parity legacy). */
export function shareDocLabelKey(key: string): string | null {
  const map: Record<string, string> = {
    CV: 'ui.share_doc_cv',
    JFT: 'ui.share_doc_jft',
    SSW: 'ui.share_doc_ssw',
    'SIM A': 'ui.share_doc_sim_a',
    KTP: 'ui.share_doc_ktp',
    KK: 'ui.share_doc_kk',
    AKTE: 'ui.share_doc_akte',
    IJAZAH: 'ui.share_doc_ijazah',
    'IJAZAH SD': 'admin.doc_ijazah_sd',
    'IJAZAH SMP': 'admin.doc_ijazah_smp',
    'IJAZAH SMA': 'admin.doc_ijazah_sma',
    UNIVERSITAS: 'admin.doc_univ',
    ALL: 'ui.share_doc_all',
  };
  return map[key] || null;
}

/** Parse nilai tersimpan (koma/titik-koma; 'SIM A' tetap satu item). */
export function parseDocsShare(saved: string | undefined): Set<string> {
  return new Set(
    String(saved || 'CV,JFT,SSW')
      .toUpperCase()
      .split(/[,;]+/)
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/** WA copas template — parity legacy templateShareWa. */
export function shareWaTemplate(code: string, pekerjaan: string, shareUrl: string): string {
  return (
    'お疲れ様です\n\n DOKUMEN\n ' + code + ' - ' + String(pekerjaan || '').toUpperCase() +
    '\n\n KAMI APLOD /UPDATE DI SINI: \n' + shareUrl + '\n\n' +
    'jika ada tambahan kami aplod di sini juga sensei\n宜しくお願いします.'
  );
}

export default function AdminShareModal({ job, onClose }: Props) {
  const [checked, setChecked] = useState<Set<string>>(() => parseDocsShare(job.dokumenShare));
  const [saving, setSaving] = useState(false);
  const { containerRef, onBackdropClick } = useOverlay({ open: true, onClose });

  // Public by job code, exactly as legacy (`share.html?job=CODE`). The TSK are
  // outside parties with no accounts, so the link itself IS the access — there
  // is no token. The `dokumen_share` checkboxes below are therefore the only
  // lever on what a viewer sees, which is why they are worth being deliberate
  // about. A per-job token gate was tried (2026-09-05) and removed 2026-09-13.
  const base = typeof window !== 'undefined' ? window.location.origin + window.location.pathname.replace(/[^/]*$/, '') : '';
  const shareUrl = base ? `${base}share?job=${encodeURIComponent(job.code)}` : '';
  const waPreview = shareWaTemplate(job.code, job.pekerjaan, shareUrl || '(link belum siap)');

  const toggleDoc = (key: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const chips = (() => {
    const all = SHARE_DOC_CHIPS.slice();
    checked.forEach((d) => { if (!all.includes(d)) all.push(d); });
    return all;
  })();

  const copyLink = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl).then(
      () => showToast(t('ui.toast_tsk_copied'), 'success'),
      () => showToast(t('ui.toast_copy_text_failed'), 'error'),
    );
  };

  const copyWA = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(waPreview).then(
      () => showToast(t('ui.toast_tsk_copied'), 'success'),
      () => showToast(t('ui.toast_copy_text_failed'), 'error'),
    );
  };

  const saveDocs = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const joined = [...checked].join(',');
      const data = (await api.secure('updateDokumenShare', [job.code, joined])) as {
        success?: boolean; error?: string;
      };
      if (data.success) {
        showToast(t('ui.toast_share_saved'), 'success');
        onClose();
      } else {
        showToast(t('alert.failed') + ' ' + (data.error || ''), 'error');
      }
    } catch (err) {
      showToast(t('alert.network') + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div class="fixed inset-0 u-modal-shell bg-black/80 backdrop-blur-md z-[250] flex items-center justify-center p-4" ref={containerRef} onClick={onBackdropClick}>
      <div onClick={(e) => e.stopPropagation()} class="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] u-scroll-area custom-scrollbar">
        <div class="p-4 border-b border-slate-700 flex items-center justify-between">
          <h3 class="text-lg font-bold text-emerald-400"><Icon name="share-alt" class="mr-2" />{t('ui.share_modal_title')}</h3>
          <button onClick={onClose} aria-label={t('public.close')} class="text-slate-400 hover:text-white p-1"><Icon name="times" class="text-xl" /></button>
        </div>
        <div class="p-5 space-y-5">
          <p class="text-[11px] font-bold text-slate-400">
            {(job.tsk || '-')} | {job.code} — {job.pekerjaan}
          </p>

          {/* Share link */}
          <div>
            <label for="as-share-link" class="text-[10px] font-bold text-sky-400 uppercase mb-1 block">{t('ui.share_link_view')}</label>
            <div class="flex gap-2">
              <input id="as-share-link" value={shareUrl} readonly placeholder={shareUrl ? '' : t('share.link_pending')} onClick={(e) => (e.target as HTMLInputElement).select()} class="flex-1 p-2 rounded-lg bg-black/60 border border-slate-700 text-[11px] text-sky-300 font-mono outline-none" />
              <button onClick={copyLink} disabled={!shareUrl} class="px-3 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-bold transition shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"><Icon name="copy" class="mr-1" />{t('ui.share_copy_link')}</button>
              {shareUrl
                ? <a href={shareUrl} target="_blank" rel="noopener" class="px-3 py-2 bg-sky-900/60 hover:bg-sky-800 border border-sky-700 text-sky-300 rounded-lg text-xs font-bold shrink-0 whitespace-nowrap transition flex items-center"><Icon name="external-link-alt" class="mr-1" />{t('ui.share_open_view')}</a>
                : <span class="px-3 py-2 bg-sky-900/30 border border-sky-800 text-sky-500 rounded-lg text-xs font-bold shrink-0 whitespace-nowrap flex items-center"><Icon name="external-link-alt" class="mr-1" />{t('ui.share_open_view')}</span>}
            </div>
          </div>

          {/* Doc selection */}
          <div>
            <div class="text-[10px] font-bold text-emerald-400 uppercase mb-1 block">{t('ui.share_card_title')}</div>
            <div class="flex flex-wrap gap-2 mb-1">
              {chips.map((key) => {
                const isAll = key === 'ALL';
                const on = checked.has(key);
                const accent = isAll
                  ? 'border-pink-500/60 hover:border-pink-400 text-pink-200'
                  : on
                    ? 'border-emerald-500/60 text-emerald-200'
                    : 'border-slate-700 hover:border-emerald-500/50 text-slate-200';
                return (
                  <label key={key} class={`inline-flex items-center gap-2 px-3 py-2 bg-slate-950/60 border rounded-lg cursor-pointer text-[11px] font-bold ${accent}`}>
                    <input type="checkbox" checked={on} onChange={() => toggleDoc(key)} class={`${isAll ? 'accent-pink-500' : 'accent-emerald-500'} w-4 h-4`} />
                    {shareDocLabelKey(key) ? t(shareDocLabelKey(key) as string) : key}
                  </label>
                );
              })}
            </div>
            <p class="text-[10px] text-slate-500 mb-2">{t('ui.share_card_hint')}</p>
            <button onClick={saveDocs} disabled={saving} class="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg font-bold shadow text-xs disabled:opacity-50 transition">
              <Icon name={saving ? 'spinner' : 'save'} spin={saving} class="mr-1" />{t('ui.save_share')}
            </button>
          </div>

          {/* WA template */}
          <div>
            <label for="as-wa" class="text-[10px] font-bold text-amber-400 uppercase mb-1 block">{t('ui.share_template_label')}</label>
            <textarea id="as-wa" value={waPreview} readOnly rows={9} class="w-full p-3 rounded-lg bg-black/60 border border-slate-700 text-[11px] text-slate-200 font-mono outline-none resize-none" />
            <button onClick={copyWA} class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold shadow text-xs transition"><Icon name="whatsapp" class="mr-1" />{t('ui.share_copas_wa')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
