/**
 * AdminJobEditModal.tsx — Edit loker full (admin)
 * Port of legacy js/api/jobs.ts (bukaEditFullLoker / submitEditFullLoker) +
 * partials/modals-shared.html #modal-edit-full-loker (ef-* form).
 *
 * A12 parity fixes (2026-09-05):
 *   - ef-total-biaya + ef-rincian-biaya + "Buka Editor Rincian" wired to
 *     RincianBiayaModal; save routes through api.secure('editLokerFull').
 *
 * A17 parity fixes (2026-09-05):
 *  1. The form field was named `syRat` (a typo that also leaked into the
 *     shared Job type) while the backend maps & persists `syarat` — the
 *     Syarat box ALWAYS opened empty and edits were silently dropped. Fixed
 *     to `syarat` end-to-end.
 *  2. ef-tsk (TSK pengurus select) was missing — edit could never change the
 *     pengurus. Now a select fed from the config dropdown list (getAppData
 *     admin → dropdowns), with the current value always kept as an option.
 *  3. ef-template / ef-pamflet uploads were missing — admins could not
 *     replace the CV template or pamflet from the edit form (legacy uploads
 *     to Cloudinary, keeps old value when left empty). Both added.
 *  4. The modal added a "Status" select that legacy ef-* does NOT have —
 *     job_database status values are raw ("✅ OPEN", "❌ CLOSE", ...), so a
 *     select of OPEN/URGENT/CLOSE blanked on rows with the emoji form and a
 *     plain save rewrote the raw value. Status changes belong to the
 *     dedicated OPEN/CLOSE toggles (like legacy row actions), so the select
 *     was removed — the form now matches ef-* field-for-field.
 *  5. kategori became a config-fed select (value union keeps legacy rows
 *     visible) and lokasi keeps the legacy text+datalist pattern.
 *  6. All copy via t() (id+jp) — no hard-coded labels.
 */
import { useEffect, useState } from 'preact/hooks';
import { t } from '../../store/i18n';
import Icon from '../ui/Icon';
import { useOverlay } from '../ui/useOverlay';
import { api } from '../../lib/apiClient';
import { uploadToCloudinary } from '../../lib/cloudinary';
import { showToast } from '../Toast';
import RincianBiayaModal, { parseRincianState, rincianSummary } from './RincianBiayaModal';

export interface EditableJob {
  code: string;
  pekerjaan: string;
  status?: string;
  kategori?: string;
  kuota?: string;
  gender?: string;
  lokasi?: string;
  syarat?: string;
  keterangan?: string;
  tsk?: string;
  templateCv?: string;
  pamflet?: string;
  totalBiaya?: string;
  rincianBiaya?: string;
  updated_at?: string;
}

interface Props {
  job: EditableJob;
  onClose: () => void;
  onSave?: (data: EditableJob) => void;
}

interface FormState {
  pekerjaan: string;
  kategori: string;
  gender: string;
  lokasi: string;
  syarat: string;
  keterangan: string;
  tsk: string;
  kuota: string;
  totalBiaya: string;
  rincianBiaya: string;
}

export default function AdminJobEditModal({ job, onClose, onSave }: Props) {
  const [form, setForm] = useState<FormState>({
    pekerjaan: job.pekerjaan || '',
    kategori: job.kategori || '',
    gender: job.gender || '',
    lokasi: job.lokasi || '',
    syarat: job.syarat || '',
    keterangan: job.keterangan || '',
    tsk: job.tsk || '',
    kuota: job.kuota || '',
    totalBiaya: job.totalBiaya || '',
    rincianBiaya: job.rincianBiaya || '',
  });
  // Dropdown config (getAppData admin → dropdowns) — same source as TabTambah.
  const [dd, setDd] = useState<{ kategori: string[]; gender: string[]; tsk: string[]; lokasi: string[] }>({
    kategori: [], gender: [], tsk: [], lokasi: [],
  });
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [pamfletFile, setPamfletFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [rbOpen, setRbOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = (await api.get('getAppData', ['admin'])) as Record<string, any>;
        const drop: Record<string, string[]> =
          d && d.success && d.dropdowns ? d.dropdowns : {};
        if (alive) {
          setDd({
            kategori: Array.isArray(drop.kategori) ? drop.kategori : [],
            gender: Array.isArray(drop.gender) ? drop.gender : [],
            tsk: Array.isArray(drop.tsk) ? drop.tsk : [],
            lokasi: Array.isArray(drop.lokasi) ? drop.lokasi : [],
          });
        }
      } catch {
        /* dropdown optional — field tetap bisa diisi */
      }
    })();
    return () => { alive = false; };
  }, []);

  /** Update single field in edit form */
  const upd = (k: keyof FormState, v: string) => setForm((prev) => ({ ...prev, [k]: v }));

  const onRincianApply = (total: string, rincian: string) => {
    upd('totalBiaya', total);
    upd('rincianBiaya', rincian);
  };

  // Nilai tersimpan lama yang tidak ada di daftar config tetap ditampilkan
  // (select tidak boleh blank / memaksa pilihan baru — parity legacy).
  const union = (cur: string, opts: string[]) => {
    const list = opts.filter(Boolean);
    if (cur && !list.includes(cur)) return [cur, ...list];
    return list;
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      // Legacy submitEditFullLoker: template/pamflet di-upload Cloudinary hanya
      // bila file dipilih; kalau tidak, nilai lama dipertahankan ('-' → server
      // mempertahankan karena body ''/'-' dihapus handler).
      let templateCv = '-';
      let pamflet = '-';
      if (templateFile) {
        const url = await uploadToCloudinary(templateFile);
        if (url) templateCv = url;
      }
      if (pamfletFile) {
        const url = await uploadToCloudinary(pamfletFile);
        if (url) pamflet = url;
      }
      const payload = {
        code: job.code,
        pekerjaan: form.pekerjaan,
        kategori: form.kategori,
        gender: form.gender,
        lokasi: form.lokasi,
        syarat: form.syarat,
        keterangan: form.keterangan,
        tsk: form.tsk,
        kuota: form.kuota,
        templateCv,
        pamflet,
        totalBiaya: form.totalBiaya,
        rincianBiaya: form.rincianBiaya,
        updated_at: job.updated_at,
      };
      const data = await api.secure('editLokerFull', [payload]);
      if (data && data.success) {
        onSave?.({ ...job, ...payload } as EditableJob);
        showToast(t('ui.toast_job_updated'), 'success');
        onClose();
      } else {
        const msg =
          (data && (data as Record<string, unknown>).error) ||
          (data && (data as Record<string, unknown>).message) ||
          'Gagal simpan loker.';
        showToast(String(msg), 'error');
      }
    } catch (e) {
      showToast('Network error: ' + ((e as Error).message || String(e)), 'error');
    } finally {
      setLoading(false);
    }
  };

  const { containerRef, onBackdropClick } = useOverlay({ open: true, onClose });

  const rbSt = parseRincianState(form.rincianBiaya);
  if (form.totalBiaya.trim() && !rbSt.total.trim()) rbSt.total = form.totalBiaya.trim();
  const rbSummary = form.rincianBiaya || form.totalBiaya
    ? rincianSummary(rbSt)
    : t('ui.summary_empty');

  const ic = 'w-full p-2.5 rounded-lg bg-black/60 border border-slate-700 text-sm text-white outline-none focus:border-red-500 transition';
  const lc = 'block text-xs font-bold text-slate-400 mb-1';

  return (
    <div
      class="fixed inset-0 u-modal-shell bg-black/80 backdrop-blur-md z-[250] flex items-center justify-center p-4"
      ref={containerRef}
      onClick={onBackdropClick}
    >
      <div onClick={(e) => e.stopPropagation()} class="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[88vh] u-scroll-area shadow-2xl custom-scrollbar">
        <div class="sticky top-0 bg-slate-900/95 backdrop-blur-sm border-b border-slate-700 p-4 flex items-center justify-between z-10">
          <h3 class="text-sm font-bold text-white">
            <Icon name="edit" class="mr-2 text-red-400" />
            {t('admin.modal_edit_job_title')}
          </h3>
          <button onClick={onClose} aria-label={t('public.close')} class="text-slate-400 hover:text-white p-1">
            <Icon name="times" class="text-xl" />
          </button>
        </div>
        <div class="p-5 space-y-3">
          <div class="text-xs text-slate-500 mb-2">
            <span>{t('admin.form_job_code_ro')}:</span>{' '}
            <span class="text-sky-400 font-mono font-bold">{job.code}</span>
          </div>

          <div class="u-grid-auto u-grid-auto--form gap-3">
            <div class="md:col-span-2">
              <label class={lc} for="ef-pekerjaan">{t('admin.form_job_name')}</label>
              <input
                id="ef-pekerjaan"
                value={form.pekerjaan}
                onInput={(e) => upd('pekerjaan', (e.target as HTMLInputElement).value)}
                class={ic}
              />
            </div>
            <div>
              <label class={lc} for="ef-kategori">{t('admin.form_category')}</label>
              <select
                id="ef-kategori"
                value={form.kategori}
                onChange={(e) => upd('kategori', (e.target as HTMLSelectElement).value)}
                class={ic}
              >
                <option value="">-</option>
                {union(form.kategori, dd.kategori).map((x) => (
                  <option key={x} value={x}>{x}</option>
                ))}
              </select>
            </div>
            <div>
              <label class={lc} for="ef-gender">{t('admin.form_gender')}</label>
              <select
                id="ef-gender"
                value={form.gender}
                onChange={(e) => upd('gender', (e.target as HTMLSelectElement).value)}
                class={ic}
              >
                <option value="">-</option>
                {union(form.gender, dd.gender).map((x) => (
                  <option key={x} value={x}>{x}</option>
                ))}
              </select>
            </div>
            <div class="md:col-span-2">
              <label class={lc} for="ef-lokasi">{t('admin.form_location_short')}</label>
              <input
                id="ef-lokasi"
                value={form.lokasi}
                onInput={(e) => upd('lokasi', (e.target as HTMLInputElement).value)}
                list="ef-lokasi-list"
                class={ic}
              />
              <datalist id="ef-lokasi-list">
                {dd.lokasi.map((l) => <option key={l} value={l} />)}
              </datalist>
            </div>
            <div>
              <label class={lc} for="ef-tsk">{t('admin.form_tsk')}</label>
              <select
                id="ef-tsk"
                value={form.tsk}
                onChange={(e) => upd('tsk', (e.target as HTMLSelectElement).value)}
                class={ic}
              >
                <option value="">-</option>
                {union(form.tsk, dd.tsk).map((x) => (
                  <option key={x} value={x}>{x}</option>
                ))}
              </select>
            </div>
            <div>
              <label class={lc} for="ef-kuota">{t('admin.form_quota_short')}</label>
              <input
                id="ef-kuota"
                value={form.kuota}
                onInput={(e) => upd('kuota', (e.target as HTMLInputElement).value)}
                class={ic}
                placeholder="3"
              />
            </div>
            <div class="md:col-span-2">
              <label class={lc} for="ef-syarat">{t('admin.form_req_short')}</label>
              <textarea
                id="ef-syarat"
                value={form.syarat}
                onInput={(e) => upd('syarat', (e.target as HTMLTextAreaElement).value)}
                class={ic + ' resize-none h-16'}
                placeholder={t("master.ph_usia_sma")}
              />
            </div>
            <div class="md:col-span-2">
              <label class={lc} for="ef-keterangan">{t('admin.form_note_short')}</label>
              <textarea
                id="ef-keterangan"
                value={form.keterangan}
                onInput={(e) => upd('keterangan', (e.target as HTMLTextAreaElement).value)}
                class={ic + ' resize-none h-16'}
                placeholder={t("admin.contoh_keterangan")}
              />
            </div>
          </div>

          {/* Upload template CV / pamflet — parity ef-template/ef-pamflet. */}
          <div>
            <label class="block text-xs font-bold text-sky-400 mb-1 uppercase" for="ef-template">
              <Icon name="file-excel" class="mr-1" /> {t('ui.update_cv_template')}
            </label>
            <input
              type="file"
              id="ef-template"
              accept=".pdf,.xls,.xlsx,.doc,.docx"
              onChange={(e) => setTemplateFile((e.target as HTMLInputElement).files?.[0] || null)}
              class="w-full text-sm text-slate-400 file:mr-2 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-bold file:bg-sky-900/50 file:text-sky-400 hover:file:bg-sky-900/80 cursor-pointer"
            />
          </div>
          <div>
            <label class="block text-xs font-bold text-pink-400 mb-1 uppercase" for="ef-pamflet">
              <Icon name="image" class="mr-1" /> {t('ui.update_pamflet')}
            </label>
            <input
              type="file"
              id="ef-pamflet"
              accept="image/*"
              onChange={(e) => setPamfletFile((e.target as HTMLInputElement).files?.[0] || null)}
              class="w-full text-sm text-slate-400 file:mr-2 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-bold file:bg-pink-900/50 file:text-pink-400 hover:file:bg-pink-900/80 cursor-pointer"
            />
          </div>

          {/* Total / Rincian (A12) */}
          <div class="u-grid-auto u-grid-auto--form gap-3">
            <div>
              <label class="block text-xs font-bold text-emerald-400 mb-1 uppercase" for="ef-total-biaya">
                <Icon name="wallet" class="mr-1" /> {t('ui.total_cost')}
              </label>
              <input
                id="ef-total-biaya"
                value={form.totalBiaya}
                onInput={(e) => upd('totalBiaya', (e.target as HTMLInputElement).value)}
                class={ic}
                placeholder={t('ui.total_cost_ph')}
              />
            </div>
            <div>
              <div class="block text-xs font-bold text-emerald-400 mb-1 uppercase">
                <Icon name="list-check" class="mr-1" /> {t('ui.rincian_biaya')}
              </div>
              <button
                type="button"
                onClick={() => setRbOpen(true)}
                class="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-black uppercase shadow-lg transition"
              >
                <Icon name="edit" class="mr-1" /> {t('ui.open_rincian_editor')}
              </button>
              <div class="text-[10px] font-bold text-emerald-300 mt-1 min-h-[14px]">{rbSummary}</div>
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={loading}
            class="w-full py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold text-sm shadow-lg disabled:opacity-50 transition"
          >
            {loading ? t('ui.loading') : t('button.save_changes')}
          </button>
        </div>
      </div>

      <RincianBiayaModal
        open={rbOpen}
        initialTotal={form.totalBiaya}
        initialRincian={form.rincianBiaya}
        onApply={onRincianApply}
        onClose={() => setRbOpen(false)}
      />
    </div>
  );
}

