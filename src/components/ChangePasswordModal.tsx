/**
 * ChangePasswordModal.tsx — Password change dialog
 * Migrated from legacy/js/04_auth.ts bukaModalGantiPass()/prosesGantiPasswordKandidat().
 *
 * A08 parity fixes (2026-09-05) against the legacy ground truth
 * (partials/modals-shared.html #modal-ganti-pass + js/04_auth.ts):
 *   - Validation mirrors legacy exactly: all filled → confirm match →
 *     baru 6–20 karakter tanpa spasi (hint shown on violation).
 *   - Session is sent through apiClient (Bearer/body sessionToken) — the old
 *     raw fetch never sent a token, so the surface always answered
 *     'Akses ditolak.'.
 *   - Server errors surface as-is (data.message); old code read data.error,
 *     which the Astro backend never emits.
 *   - All copy goes through t() with the changepass.* keys; hint copy matches
 *     legacy ui.pass_new_hint.
 */
import { useState } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import { authStore } from '../store/authReactive';
import { showToast } from './Toast';
import { t } from '../store/i18n';
import Icon from './ui/Icon';
import { useOverlay } from './ui/useOverlay';
import { api } from '../lib/apiClient';

interface Props { onClose: () => void; }

export default function ChangePasswordModal({ onClose }: Props) {
  const user = useStore(authStore);
  const [lama, setLama] = useState('');
  const [baru, setBaru] = useState('');
  const [konfirmasi, setKonfirmasi] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    // Legacy js/04_auth.ts prosesGantiPasswordKandidat() ordering & rules.
    if (!lama || !baru || !konfirmasi) { showToast(t('error.fill_all'), 'error'); return; }
    if (baru !== konfirmasi) { showToast(t('error.password_mismatch'), 'error'); return; }
    if (baru.length < 6 || baru.length > 20 || /\s/.test(baru)) {
      showToast(t('changepass.hint'), 'error');
      return;
    }
    if (!user.wa || !user.isLoggedIn) { showToast(t('error.session_expired'), 'error'); return; }
    setLoading(true);
    try {
      const data = await api.secure('gantiPasswordKandidat', [user.wa, lama, baru]);
      if (data.success) {
        showToast(t('changepass.ok'), 'success');
        onClose();
      } else {
        showToast(data.message || data.error || t('error.wrong_password'), 'error');
      }
    } catch (e: unknown) {
      // apiClient sudah menampilkan toast + redirect untuk sesi invalid &
      // kegagalan jaringan — jangan toast ganda di sini.
      console.warn('[ChangePasswordModal]', (e as Error)?.message || e);
    } finally { setLoading(false); }
  };

  const { containerRef, onBackdropClick } = useOverlay({ open: true, onClose });

  return (
    <div class="fixed inset-0 u-modal-shell bg-black/70 backdrop-blur-md z-[200] flex items-center justify-center p-4" ref={containerRef} onClick={onBackdropClick}>
      <div class="bg-slate-900 border border-slate-700 p-6 rounded-[2rem] w-full max-w-sm shadow-2xl">
        <div class="flex items-center justify-between mb-5">
          <h3 class="text-lg font-bold text-amber-400"><Icon name="lock" class="mr-2" />{t('changepass.title')}</h3>
          <button onClick={onClose} class="text-slate-400 hover:text-white"><Icon name="times" class="text-xl" /></button>
        </div>
        <div class="space-y-3">
          <div>
            <label class="block text-xs font-bold text-slate-400 mb-1" for="cp-lama">{t('changepass.old')}</label>
            <input type="password" id="cp-lama" value={lama} autocomplete="current-password" onInput={e => setLama((e.target as HTMLInputElement).value)} placeholder="••••••" class="w-full p-3 rounded-xl bg-black/60 border border-slate-600 text-sm text-white outline-none focus:border-amber-500" />
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-400 mb-1" for="cp-baru">{t('changepass.new')}</label>
            <input type="password" id="cp-baru" value={baru} autocomplete="new-password" onInput={e => setBaru((e.target as HTMLInputElement).value)} placeholder={t("ui.ph_6_20_karakter")} class="w-full p-3 rounded-xl bg-black/60 border border-slate-600 text-sm text-white outline-none focus:border-amber-500" />
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-400 mb-1" for="cp-konfirmasi">{t('changepass.confirm')}</label>
            <input type="password" id="cp-konfirmasi" value={konfirmasi} autocomplete="new-password" onInput={e => setKonfirmasi((e.target as HTMLInputElement).value)} placeholder="••••••" class="w-full p-3 rounded-xl bg-black/60 border border-slate-600 text-sm text-white outline-none focus:border-amber-500" />
          </div>
          <p class="text-[11px] text-slate-500">{t('changepass.hint')}</p>
        </div>
        <button onClick={handleSubmit} disabled={loading} class="w-full mt-4 py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold text-sm shadow-lg disabled:opacity-50 transition">
          {loading ? t('changepass.loading') : t('changepass.btn')}
        </button>
      </div>
    </div>
  );
}
