/**
 * KartuNotifikasiAdmin.tsx — tombol "aktifkan notifikasi" untuk perangkat admin.
 *
 * KENAPA ADA
 * ----------
 * Terukur 2026-11-06: `fcm_tokens` berisi 18 baris, SEMUANYA bernomor kandidat.
 * Artinya push "Lamaran Baru!" dan "Dokumen Baru Diupload" tidak pernah sampai
 * ke siapa pun — admin tidak punya perangkat terdaftar, dan panel tidak punya
 * satu pun tombol untuk mendaftarkannya. Yang hilang bukan kode pengiriman,
 * melainkan satu langkah izin yang hanya bisa dilakukan manusia.
 *
 * KENAPA IZIN DIMINTA DARI TOMBOL
 * -------------------------------
 * `Notification.requestPermission()` di luar gestur pengguna diabaikan browser.
 * Lebih buruk: setelah diblokir, halaman tidak bisa meminta lagi — jadi satu
 * prompt yang muncul tiba-tiba bisa mematikan notifikasi permanen.
 *
 * KENAPA ADA ANGKA "PERANGKAT TERDAFTAR"
 * --------------------------------------
 * Izin `granted` TIDAK berarti tokennya sampai ke server (VAPID kosong, service
 * worker belum aktif, unggahan token gagal). Tanpa angka ini, admin melihat
 * "aktif" dan menyimpulkan notifikasinya hidup padahal tidak ada yang terdaftar.
 */
import { useCallback, useEffect, useState } from 'preact/hooks';
import { api } from '../../lib/apiClient';
import { requestNotificationPermission } from '../../lib/fcm';
import { authStore } from '../../store/authReactive';
import { t } from '../../store/i18n';
import Icon from '../ui/Icon';

interface Res {
  success?: boolean;
  perangkat?: number;
}

export default function KartuNotifikasiAdmin() {
  const [perangkat, setPerangkat] = useState<number | null>(null);
  const [izin, setIzin] = useState<string>(() => {
    try {
      return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
    } catch {
      return 'unsupported';
    }
  });
  const [meminta, setMeminta] = useState(false);
  const [pesan, setPesan] = useState('');

  /* `useCallback` + deps: `muat` dipanggil dari efek DAN dari tombol. Tanpa
     identitas stabil, efek akan berjalan di setiap render (dan `lint-ratchet`
     menolaknya sebagai dependency yang hilang). */
  const muat = useCallback(async () => {
    try {
      const d = (await api.secure('getStatusNotifikasiAdmin', [], { silent: true })) as Res;
      setPerangkat(Number(d?.perangkat) || 0);
    } catch {
      setPerangkat(null);
    }
  }, []);

  useEffect(() => {
    void muat();
  }, [muat]);

  const aktifkan = async () => {
    setMeminta(true);
    setPesan('');
    try {
      const admin = authStore.get().name || 'ADMIN';
      const hasil = await requestNotificationPermission(admin);
      if (hasil === 'registered') {
        setIzin('granted');
        await muat();
      } else if (hasil === 'permission-denied') {
        setIzin('denied');
      } else {
        setPesan(
          hasil === 'no-sw'
            ? t('notif.admin_sw')
            : hasil === 'unsupported'
              ? t('notif.admin_tidak_didukung')
              : t('notif.admin_gagal'),
        );
      }
    } finally {
      setMeminta(false);
    }
  };

  const perluDaftar = izin === 'granted' && perangkat === 0;

  return (
    <section class="mb-6 rounded-xl border border-slate-600/40 bg-black/40 p-5" data-testid="kartu-notif-admin">
      <h3 class="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-300">
        <Icon name="bullhorn" class="text-slate-300" /> {t('notif.admin_judul')}
      </h3>
      <p class="mb-3 text-xs leading-relaxed text-slate-300">{t('notif.admin_ket')}</p>

      {perangkat !== null && (
        <p class="mb-3 text-xs font-bold text-slate-400">
          {perangkat > 0 ? (
            <span class="text-emerald-400">
              <Icon name="check-circle" class="mr-1" /> {perangkat} {t('notif.admin_perangkat')}
            </span>
          ) : (
            <span class="text-amber-400">
              <Icon name="exclamation-triangle" class="mr-1" /> {t('notif.admin_belum')}
            </span>
          )}
        </p>
      )}

      {izin === 'unsupported' ? (
        <p class="text-xs text-slate-400">{t('notif.admin_tidak_didukung')}</p>
      ) : izin === 'denied' ? (
        <p class="text-xs text-slate-400">{t('notif.admin_ditolak')}</p>
      ) : perluDaftar || izin === 'default' ? (
        <button
          type="button"
          disabled={meminta}
          onClick={() => void aktifkan()}
          class="min-h-11 rounded-lg bg-emerald-600 px-4 text-xs font-bold text-white transition hover:bg-emerald-500 disabled:opacity-50"
        >
          {meminta ? '…' : perluDaftar ? t('notif.admin_daftarkan') : t('notif.admin_aktifkan')}
        </button>
      ) : (
        <p class="text-xs font-bold text-emerald-400">
          <Icon name="check-circle" class="mr-1" /> {t('notif.admin_aktif')}
        </p>
      )}

      {pesan && <p class="mt-2 text-xs text-amber-400">{pesan}</p>}
    </section>
  );
}
