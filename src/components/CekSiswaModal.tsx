/**
 * CekSiswaModal.tsx — Modal "Cek Data" (roster pendaftar siswa baru, admin)
 *
 * Parity cross-check (2026-09-04) thd legacy js/admin_ops/candidates.ts
 * bukaModalCekDataSiswa(): data = action getDaftarSiswaBaru (admin-only),
 * tabel No | Nama | JK (L/P badge) | Alamat. Rebuild lama memanggil getAppData
 * mode 'siswa' (mode tak didukung backend) + render wa/status/kelas yg salah —
 * dikoreksi ke akar kontraknya.
 */
import { useState, useEffect } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import { t, langStore } from '../store/i18n';
import Icon from './ui/Icon';
import { useOverlay } from './ui/useOverlay';
import { authStore } from '../store/authReactive';
import { getEndpoint } from '../lib/apiEndpoint';

interface Props {
  onClose: () => void;
}

interface SiswaRow {
  id?: string | number;
  nama_lengkap?: string;
  nama?: string;
  alamat_lengkap?: string;
  jenis_kelamin?: string; // kanonikal 'L' | 'P' | '' (getDaftarSiswaBaru)
}

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'session' }
  | { kind: 'ready'; rows: SiswaRow[] };

export default function CekSiswaModal({ onClose }: Props) {
  const _lang = useStore(langStore);
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    async function fetchSiswa() {
      setState({ kind: 'loading' });
      try {
        const token = authStore.get().sessionToken;
        const res = await fetch(getEndpoint('getDaftarSiswaBaru'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: 'Bearer ' + token } : {}),
          },
          body: JSON.stringify({ action: 'getDaftarSiswaBaru', payload: [] }),
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (data.sessionInvalid || (!data.success && data.message)) {
          // Roster siswa = admin-only (hardening C4/C5) — jangan bocor.
          setState({ kind: 'session' });
        } else if (data.success && Array.isArray(data.data)) {
          setState({ kind: 'ready', rows: data.data });
        } else {
          setState({ kind: 'error', message: data.message || data.error || 'Gagal memuat data.' });
        }
      } catch (err) {
        if (cancelled) return;
        setState({ kind: 'error', message: (err as Error).message || 'Network error.' });
      }
    }
    fetchSiswa();
    return () => { cancelled = true; };
  }, []);

  const { containerRef, onBackdropClick } = useOverlay({ open: true, onClose });

  const genderBadge = (g: string) => {
    const val = String(g || '').trim().toUpperCase();
    if (val === 'L') {
      return <span class="inline-flex w-6 h-6 rounded-full bg-blue-900/50 text-blue-400 items-center justify-center font-bold text-[10px] border border-blue-500/30">L</span>;
    }
    if (val === 'P') {
      return <span class="inline-flex w-6 h-6 rounded-full bg-pink-900/50 text-pink-400 items-center justify-center font-bold text-[10px] border border-pink-500/30">P</span>;
    }
    return (
      <span class="inline-flex w-6 h-6 rounded-full bg-slate-800 text-slate-500 items-center justify-center font-bold text-[10px] border border-slate-600/50" title={t('siswa.gender_unfilled')}>&mdash;</span>
    );
  };

  return (
    <div class="fixed inset-0 u-modal-shell bg-black/80 backdrop-blur-md z-[260] flex items-center justify-center p-4" ref={containerRef} onClick={onBackdropClick}>
      <div class="bg-slate-900 border border-slate-700 rounded-[2rem] w-full max-w-lg max-h-[80vh] overflow-hidden shadow-2xl">
        <div class="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h3 class="text-lg font-bold text-white">
            <Icon name="users" class="text-emerald-400 mr-2" />
            {t('siswa.title_registered')}
          </h3>
          <button onClick={onClose} class="text-slate-400 hover:text-white transition">
            <Icon name="times" class="text-xl" />
          </button>
        </div>
        <div class="u-scroll-area max-h-[70vh]">
          {state.kind === 'loading' && (
            <div class="text-center py-10">
              <Icon spin name="spinner" class="text-2xl text-sky-400" />
              <p class="text-slate-400 mt-2 text-sm">{t('ui.loading')}</p>
            </div>
          )}
          {state.kind === 'session' && (
            <div class="text-center py-10 px-6">
              <Icon name="lock" class="text-3xl text-amber-400 mb-3" />
              <p class="text-slate-300 text-sm font-bold">{t('siswa.session_admin_only')}</p>
              <p class="text-slate-500 text-xs mt-1">{t('siswa.login_admin_hint')}</p>
            </div>
          )}
          {state.kind === 'error' && (
            <div class="text-center py-10 px-6">
              <Icon name="circle-exclamation" class="text-3xl text-rose-400 mb-3" />
              <p class="text-rose-300 text-sm font-bold">{t('siswa.load_failed')}</p>
              <p class="text-slate-500 text-xs mt-1">{state.message}</p>
            </div>
          )}
          {state.kind === 'ready' && (state.rows.length === 0 ? (
            <div class="text-center py-10">
              <Icon name="inbox" class="text-3xl text-slate-600 mb-3" />
              <p class="text-slate-400 text-sm">{t('ui.no_students')}</p>
            </div>
          ) : (
            <table class="w-full text-left">
              <thead class="sticky top-0 bg-slate-900">
                <tr class="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                  <th class="px-4 py-3 text-center w-10">No</th>
                  <th class="px-4 py-3">{t('table.full_name')}</th>
                  <th class="px-4 py-3 text-center w-16">{t('table.gender')}</th>
                  <th class="px-4 py-3">{t('table.address')}</th>
                </tr>
              </thead>
              <tbody>
                {state.rows.map((s, i) => (
                  <tr key={s.id ?? i} class="hover:bg-white/5 transition border-b border-slate-800/60">
                    <td class="px-4 py-3 text-center text-slate-400 text-xs">{i + 1}</td>
                    <td class="px-4 py-3 font-bold text-white text-xs">{String(s.nama_lengkap || s.nama || '-')}</td>
                    <td class="px-4 py-3 text-center">{genderBadge(s.jenis_kelamin || '')}</td>
                    <td class="px-4 py-3 text-xs text-amber-300 font-medium">
                      <Icon name="map-marker-alt" class="text-red-400 mr-1.5 inline" />
                      {String(s.alamat_lengkap || '-')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        </div>
      </div>
    </div>
  );
}
