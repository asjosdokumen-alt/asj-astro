/**
 * CvMiniModal.tsx — CV Mini quick-edit dialog
 * Migrated from legacy/js/03_candidate.ts bukaModalCvMini()/prosesSimpanCvMini()
 * + partials/modals-shared.html #modal-cv-mini.
 *
 * A09 parity fixes (2026-09-05) against the legacy ground truth:
 *   - Opens PREFILLED from the candidate's decorated row (gender normalized
 *     PRIA/L→LAKI-LAKI & WANITA/P→PEREMPUAN, usia/tb/bb digit-only, last
 *     education level, jft_text/ssw_text) — the old modal opened empty with a
 *     hard default.
 *   - pendidikan is the legacy fixed select (SMA/SMK/MA/D3/S1), not free text —
 *     free text never round-trips into pendidikan_1_tingkat, so the CV progress
 *     stayed stale. '-' (belum ada) is NOT sent, so existing data is preserved
 *     instead of being overwritten with '-'.
 *   - Session now goes through api.secure (raw fetch never sent a token → the
 *     master surface always answered sessionInvalid).
 *   - Photo uploads under `photoFile` (the key MASTER_FILE_COLUMNS maps to
 *     pas_photo). The old `photo` key was silently dropped by the shared
 *     handleSubmitMasterForm in BOTH legacy and Astro — deliberate upgrade:
 *     PAS FOTO from CV Mini now persists + syncs into the candidate row.
 *   - Success dispatches `candidates-changed` (CandidateDash reloads), matching
 *     legacy refreshDataDinamis().
 *   - All copy via t(); success toast = legacy ui.toast_cvmini_updated.
 */
import { useState } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import { authStore } from '../store/authReactive';
import { showToast } from './Toast';
import { t } from '../store/i18n';
import { uploadToCloudinary } from '../lib/cloudinary';
import Icon from './ui/Icon';
import { useOverlay } from './ui/useOverlay';
import { api } from '../lib/apiClient';

/** Pendidikan level options — parity legacy #modal-cv-mini (um-pendidikan). */
export const PENDIDIKAN_OPTIONS = ['SMA', 'SMK', 'MA', 'D3', 'S1'] as const;

/** Raw mini-CV fields of the decorated candidate row (mapCandidate shape). */
export interface CvMiniPrefill {
  nama?: string | null;
  gender?: string | null;
  usia?: string | null;
  tb?: string | null;
  bb?: string | null;
  pendidikan?: string | null;
  jftText?: string | null;
  sswText?: string | null;
}

/** Legacy bukaModalCvMini: gender PRIA/L → LAKI-LAKI; WANITA/P → PEREMPUAN;
 *  anything else/'-'/empty → LAKI-LAKI (select default). */
export function normalizeGender(v?: string | null): 'LAKI-LAKI' | 'PEREMPUAN' {
  const s = String(v || '').trim().toUpperCase();
  if (s.includes('WANITA') || s === 'P') return 'PEREMPUAN';
  return 'LAKI-LAKI';
}

/** Strip semua non-digit (legacy safeSetVal `.replace(/\D/g,'')`). */
export function digitsOnly(v?: string | null): string {
  return String(v || '').replace(/\D/g, '');
}

/** Pilih tingkat pendidikan terakhir dari nilai mentah (row/pendidikan_1_tingkat). */
export function pendidikanLevel(v?: string | null): string {
  const s = String(v || '').toUpperCase();
  for (const lv of PENDIDIKAN_OPTIONS) {
    if (lv === 'MA') { if (s === 'MA' || /\bMA\b/.test(s)) return 'MA'; continue; }
    if (s.includes(lv)) return lv;
  }
  return '-';
}

interface Props { onClose: () => void; prefill?: CvMiniPrefill; }

export default function CvMiniModal({ onClose, prefill }: Props) {
  const user = useStore(authStore);
  const [gender, setGender] = useState<'LAKI-LAKI' | 'PEREMPUAN'>(() => normalizeGender(prefill?.gender));
  const [usia, setUsia] = useState(() => digitsOnly(prefill?.usia));
  const [tb, setTb] = useState(() => digitsOnly(prefill?.tb));
  const [bb, setBb] = useState(() => digitsOnly(prefill?.bb));
  const [pendidikan, setPendidikan] = useState(() => pendidikanLevel(prefill?.pendidikan));
  const [jftText, setJftText] = useState(() => String(prefill?.jftText || '').replace(/^-\s*$/, ''));
  const [sswText, setSswText] = useState(() => String(prefill?.sswText || '').replace(/^-\s*$/, ''));
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoName, setPhotoName] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePhoto = (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) { setPhoto(file); setPhotoName(file.name); }
  };

  const handleSubmit = async () => {
    if (!user.wa) { showToast(t('error.session_expired'), 'error'); return; }
    setLoading(true);
    try {
      const payload: Record<string, string> = {
        wa: user.wa,
        nama: prefill?.nama || user.name || '',
        gender,
        usia: digitsOnly(usia),
        tb: digitsOnly(tb),
        bb: digitsOnly(bb),
        jft_text: jftText.trim(),
        ssw_text: sswText.trim(),
      };
      // '-' = belum memilih: jangan kirim supaya nilai lama tidak ditimpa '-'.
      if (pendidikan && pendidikan !== '-') payload.pendidikan = pendidikan;
      if (photo) payload.photoFile = await uploadToCloudinary(photo);
      const data = await api.secure('simpanUpdateMaster', [payload]);
      if (data.success) {
        showToast(t('ui.toast_cvmini_updated'), 'success');
        // Legacy refreshDataDinamis() — CandidateDash mendengar event ini (A05).
        window.dispatchEvent(new CustomEvent('candidates-changed'));
        onClose();
      } else {
        showToast(data.message || data.error || t('toast.upload_failed'), 'error');
      }
    } catch (e: unknown) {
      // apiClient sudah toast + redirect untuk sesi/jaringan — jangan ganda.
      console.warn('[CvMiniModal]', (e as Error)?.message || e);
    } finally { setLoading(false); }
  };

  const { containerRef, onBackdropClick } = useOverlay({ open: true, onClose });

  return (
    <div class="fixed inset-0 u-modal-shell bg-black/70 backdrop-blur-md z-[200] flex items-center justify-center p-4" ref={containerRef} onClick={onBackdropClick}>
      <div class="bg-slate-900 border border-slate-700 p-6 rounded-[2rem] w-full max-w-md max-h-[85vh] u-scroll-area shadow-2xl custom-scrollbar">
        <div class="flex items-center justify-between mb-2">
          <h3 class="text-lg font-bold text-sky-400"><Icon name="user-edit" class="mr-2" />{t('ui.update_cv_mini')}</h3>
          <button onClick={onClose} class="text-slate-400 hover:text-white"><Icon name="times" class="text-xl" /></button>
        </div>
        <p class="text-xs text-slate-400 mb-5 leading-relaxed">{t('ui.master_update_hint')}</p>
        <div class="space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-bold text-slate-400 mb-1 uppercase">{t('form.gender')}</label>
              <select value={gender} onChange={e => setGender((e.target as HTMLSelectElement).value as 'LAKI-LAKI' | 'PEREMPUAN')} class="w-full p-3 rounded-xl bg-black/60 border border-slate-600 text-sm text-white outline-none focus:border-sky-500">
                <option value="LAKI-LAKI">{t('form.gender_m')}</option>
                <option value="PEREMPUAN">{t('form.gender_f')}</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-400 mb-1 uppercase">{t('cvmini.usia')}</label>
              <input type="number" inputmode="numeric" value={usia} onInput={e => setUsia((e.target as HTMLInputElement).value)} class="w-full p-3 rounded-xl bg-black/60 border border-slate-600 text-sm text-white outline-none focus:border-sky-500" placeholder="22" />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-bold text-slate-400 mb-1 uppercase">{t('cvmini.tb')}</label>
              <input type="number" inputmode="numeric" value={tb} onInput={e => setTb((e.target as HTMLInputElement).value)} class="w-full p-3 rounded-xl bg-black/60 border border-slate-600 text-sm text-white outline-none focus:border-sky-500" placeholder="165" />
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-400 mb-1 uppercase">{t('cvmini.bb')}</label>
              <input type="number" inputmode="numeric" value={bb} onInput={e => setBb((e.target as HTMLInputElement).value)} class="w-full p-3 rounded-xl bg-black/60 border border-slate-600 text-sm text-white outline-none focus:border-sky-500" placeholder="55" />
            </div>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-400 mb-1 uppercase">{t('cvmini.pendidikan')}</label>
            <select value={pendidikan} onChange={e => setPendidikan((e.target as HTMLSelectElement).value)} class="w-full p-3 rounded-xl bg-black/60 border border-slate-600 text-sm text-white outline-none focus:border-sky-500">
              <option value="-">{t('cvmini.pilih_pendidikan')}</option>
              {PENDIDIKAN_OPTIONS.map(lv => <option key={lv} value={lv}>{lv}</option>)}
            </select>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-bold text-slate-400 mb-1 uppercase">{t('cvmini.jft')}</label>
              <input type="text" value={jftText} onInput={e => setJftText((e.target as HTMLInputElement).value)} class="w-full p-3 rounded-xl bg-black/60 border border-slate-600 text-sm text-white outline-none focus:border-sky-500" placeholder={t("ui.ph_jft_level")} />
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-400 mb-1 uppercase">{t('cvmini.ssw')}</label>
              <input type="text" value={sswText} onInput={e => setSswText((e.target as HTMLInputElement).value)} class="w-full p-3 rounded-xl bg-black/60 border border-slate-600 text-sm text-white outline-none focus:border-sky-500" placeholder={t("ui.ph_ssw_bidang")} />
            </div>
          </div>
          <div class="p-4 bg-sky-900/20 border border-dashed border-sky-500/50 rounded-xl">
            <label class="block text-[11px] font-bold text-sky-400 mb-1.5">{t('ui.latest_photo')}</label>
            <input type="file" accept="image/*" onChange={handlePhoto} class="w-full text-xs text-slate-400 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-slate-700 file:text-white" />
            {photoName && <p class="text-[10px] text-slate-500 mt-1">{photoName}</p>}
          </div>
        </div>
        <button onClick={handleSubmit} disabled={loading} class="w-full mt-4 py-3 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-bold text-sm shadow-lg disabled:opacity-50 transition">
          {loading ? t('ui.saving') : t('ui.save_cv_mini')}
        </button>
      </div>
    </div>
  );
}
