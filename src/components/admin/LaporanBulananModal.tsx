/**
 * LaporanBulananModal.tsx — Monthly report modal (admin)
 * Port of legacy `showMonthlyReport` (js/render/candidate.ts → #modal-monthly-report).
 *
 * A13 parity crosscheck (2026-09-05) against legacy ground truth
 * (showMonthlyReport + backend handleGetMonthlyReport) fixed root bugs:
 *  1. The modal NEVER called the backend. It aggregated the client-side
 *     `kandidatList` store, which holds only the currently-loaded, filtered
 *     admin page — so the "report" was an incomplete view of whatever
 *     happened to be rendered. Legacy calls `getMonthlyReport`, which the
 *     backend aggregates over ALL candidates. The modal now fetches the real
 *     report through api.secure('getMonthlyReport').
 *  2. Header metadata (totalCandidates + generatedAt date) and the empty
 *     state were missing entirely.
 *  3. All copy was hard-coded Indonesian instead of i18n keys; legacy uses
 *     admin.report_title / report_total / report_by_stage / report_by_status /
 *     report_empty / monthly_report. Keys added to both id and jp dicts.
 */
import { useEffect, useState } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import { reportModalOpen, closeReportModal } from '../../store/adminStore';
import Icon from '../ui/Icon';
import { useOverlay } from '../ui/useOverlay';
import api from '../../lib/apiClient';
import { showToast } from '../Toast';
import { t } from '../../store/i18n';

export interface ReportLoker {
  loker: string;
  total: number;
  tahapan: Record<string, number>;
  status: Record<string, number>;
}

export interface MonthlyReportData {
  success: boolean;
  sessionInvalid?: boolean;
  error?: string;
  message?: string;
  report: ReportLoker[];
  totalCandidates: number;
  generatedAt: string;
}

export default function LaporanBulananModal() {
  const open = useStore(reportModalOpen);
  const onClose = closeReportModal;
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<ReportLoker[] | null>(null);
  const [meta, setMeta] = useState<{ totalCandidates: number; generatedAt: string } | null>(null);

  const { containerRef, onBackdropClick } = useOverlay({ open, onClose });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setReport(null);
    setMeta(null);
    // Legacy `showMonthlyReport` announces the report with an info toast when opened.
    showToast(t('admin.report_title'), 'info');
    api
      .secure('getMonthlyReport', [])
      .then((res) => {
        if (cancelled) return;
        const d = res as unknown as MonthlyReportData;
        if (!d || !d.success) {
          showToast(t('ui.toast_failed_prefix') + ' ' + (d?.error || d?.message || ''), 'error');
          return;
        }
        setReport(d.report || []);
        setMeta({ totalCandidates: d.totalCandidates, generatedAt: d.generatedAt || '' });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        showToast(t('ui.toast_failed_prefix') + ' ' + msg, 'error');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div class="fixed inset-0 u-modal-shell bg-black/80 z-[9999] flex items-center justify-center p-4" ref={containerRef} onClick={onBackdropClick}>
      <div class="bg-slate-900 border border-blue-900/50 rounded-2xl w-full max-w-lg max-h-[80vh] u-scroll-area shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div class="p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-bold text-white">
              <Icon name="chart-bar" class="mr-2 text-blue-400" /> {t('admin.report_title')}
            </h3>
            <button
              aria-label={t('ui.close')}
              onClick={onClose}
              class="text-slate-400 hover:text-white text-2xl leading-none"
            >
              ×
            </button>
          </div>

          {loading && (
            <div class="py-10 text-center text-slate-400 text-sm">{t('ui.loading')}</div>
          )}

          {!loading && meta && (
            <p class="text-xs text-slate-400 mb-3">
              {t('admin.report_total')}: <b class="text-white">{meta.totalCandidates}</b>
              {meta.generatedAt ? (
                <>
                  {' '}·{' '}
                  <span class="text-slate-500">{String(meta.generatedAt).slice(0, 10)}</span>
                </>
              ) : null}
            </p>
          )}

          {!loading && report && report.length === 0 && (
            <p class="text-slate-500 text-sm">{t('admin.report_empty')}</p>
          )}

          {!loading &&
            report &&
            report.map((r) => {
              const tahapEntries = Object.entries(r.tahapan || {}).sort((a, b) => b[1] - a[1]);
              const statEntries = Object.entries(r.status || {}).sort((a, b) => b[1] - a[1]);
              return (
                <div key={r.loker} class="mb-4 p-3 bg-slate-800/60 rounded-lg border border-slate-700/50">
                  <div class="flex items-center justify-between mb-2">
                    <span class="text-sm font-bold text-sky-300">{r.loker}</span>
                    <span class="text-xs font-bold text-white bg-sky-600/30 px-2 py-0.5 rounded">{r.total}</span>
                  </div>
                  {tahapEntries.length > 0 && (
                    <>
                      <div class="text-[10px] text-slate-400 mb-1">{t('admin.report_by_stage')}:</div>
                      <div class="flex flex-wrap gap-1">
                        {tahapEntries.map(([stage, n]) => (
                          <span key={stage} class="text-[10px] px-1.5 py-0.5 bg-slate-700/60 rounded text-slate-300">
                            {stage}: {n}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                  {statEntries.length > 0 && (
                    <>
                      <div class="text-[10px] text-slate-400 mt-1 mb-1">{t('admin.report_by_status')}:</div>
                      <div class="flex flex-wrap gap-1">
                        {statEntries.map(([status, n]) => (
                          <span key={status} class="text-[10px] px-1.5 py-0.5 bg-slate-700/60 rounded text-slate-300">
                            {status}: {n}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })}

          <button
            onClick={onClose}
            class="w-full py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-bold shadow-lg transition text-sm"
          >
            {t('ui.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
