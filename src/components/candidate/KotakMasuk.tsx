/**
 * KotakMasuk.tsx — kotak masuk kandidat di dasbor.
 *
 * KENAPA ADA
 * ----------
 * Sampai 2026-11-06 satu-satunya cara kandidat tahu berkasnya ditolak atau
 * jadwalnya mendekat adalah PUSH. Itu rapuh di dua titik yang keduanya di luar
 * kendali kita: di iOS push hanya bekerja untuk web app yang dipasang ke Layar
 * Utama, dan izin yang pernah ditolak tidak bisa diminta lagi dari halaman.
 * Kalau push tidak sampai, informasinya hilang — bukan tertunda.
 *
 * Jadi push sekarang hanya KANAL; sumber kebenarannya baris di
 * `notifikasi_kandidat` yang ditampilkan di sini. Server menulis barisnya lebih
 * dulu, baru mengirim push (`_lib/notifikasi/kandidat.ts`).
 *
 * IZIN DIMINTA DARI TOMBOL, BUKAN SAAT HALAMAN DIBUKA
 * --------------------------------------------------
 * `Notification.requestPermission()` di luar gestur pengguna diabaikan browser
 * (dan di iOS malah tidak muncul). Yang lebih buruk: satu prompt yang muncul
 * tanpa penjelasan membuat orang menekan "Block", dan setelah diblokir halaman
 * TIDAK BISA meminta lagi. Karena itu tombolnya di sini, dengan satu kalimat
 * yang menjelaskan gunanya.
 */
import { useEffect, useState } from 'preact/hooks';
import { api } from '../../lib/apiClient';
import { requestNotificationPermission } from '../../lib/fcm';
import { navigateTo } from '../../lib/navigate';
import { t } from '../../store/i18n';
import { showToast } from '../Toast';
import Icon from '../ui/Icon';

interface Baris {
  id: number;
  jenis: string;
  judul: string;
  isi: string;
  url: string;
  dibaca_pada: string | null;
  dibuat_pada: string;
}

interface Res {
  success?: boolean;
  notifikasi?: Baris[];
  belumDibaca?: number;
  sessionInvalid?: boolean;
}

const TAMPIL_RINGKAS = 4;

/** `2026-11-06T12:30:00Z` → `06/11 19:30` (waktu lokal perangkat). */
function waktuRingkas(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
  } catch {
    return '';
  }
}

/** Ikon per jenis — dekoratif, jadi tidak perlu nama aksesibel. */
function ikonJenis(jenis: string): string {
  if (jenis === 'jadwal') return 'calendar-check';
  if (jenis === 'lamaran') return 'clipboard-check';
  if (jenis === 'dokumen') return 'file-alt';
  return 'info-circle';
}

/** Badge ikon aplikasi (Badging API). Diabaikan diam-diam bila tak didukung. */
function setBadge(n: number): void {
  try {
    /* Tipe STRUKTURAL, bukan `Navigator`: indexer menandai nama tipe DOM sebagai
       `global-unknown` di kode produksi (gate `build.test.ts`). Bentuk yang
       dipakai di sini hanya dua method, jadi tidak ada yang hilang. */
    const nav = navigator as unknown as {
      setAppBadge?: (n?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (n > 0) void nav.setAppBadge?.(n);
    else void nav.clearAppBadge?.();
  } catch {
    /* Safari lama / Firefox: tidak ada badge, bukan kesalahan. */
  }
}

export default function KotakMasuk({ wa }: { wa: string }) {
  const [daftar, setDaftar] = useState<Baris[]>([]);
  const [belum, setBelum] = useState(0);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState('');
  const [terbuka, setTerbuka] = useState(false);
  const [izin, setIzin] = useState<string>(() => {
    try {
      return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
    } catch {
      return 'unsupported';
    }
  });
  const [memintaIzin, setMemintaIzin] = useState(false);

  useEffect(() => {
    let hidup = true;
    if (!wa) return;
    (async () => {
      setMemuat(true);
      setGalat('');
      try {
        const d = (await api.secure('getNotifikasiKandidat', [wa, 30], { silent: true })) as Res;
        if (!hidup) return;
        if (d?.sessionInvalid) {
          setGalat(t('notif.galat'));
          return;
        }
        setDaftar(Array.isArray(d?.notifikasi) ? d.notifikasi : []);
        setBelum(Number(d?.belumDibaca) || 0);
      } catch {
        if (hidup) setGalat(t('notif.galat'));
      } finally {
        if (hidup) setMemuat(false);
      }
    })();
    return () => {
      hidup = false;
    };
  }, [wa]);

  /* Badge mengikuti jumlah belum dibaca — termasuk setelah ditandai. */
  useEffect(() => {
    setBadge(belum);
  }, [belum]);

  const tandaiSatu = async (b: Baris) => {
    if (!b.dibaca_pada) {
      setDaftar((d) => d.map((x) => (x.id === b.id ? { ...x, dibaca_pada: new Date().toISOString() } : x)));
      setBelum((n) => Math.max(0, n - 1));
      try {
        await api.secure('tandaiNotifikasiDibaca', [wa, b.id], { silent: true });
      } catch {
        /* optimistis: kalau gagal, badge akan terkoreksi saat muat ulang */
      }
    }
    /* Hanya pindah kalau tujuannya BUKAN halaman ini tanpa anchor. Dulu semua
       pemberitahuan menunjuk `/candidate`, jadi menekannya memuat ulang dasbor
       yang sedang dibuka — terasa seperti tombol mati (laporan pemilik
       2026-11-07). Sekarang server menulis anchor (`#revisi`, `#jadwal`,
       `#riwayat`) sehingga klik benar-benar mendarat di bagian yang dimaksud. */
    if (b.url) {
      let sama = false;
      try {
        sama = b.url === window.location.pathname;
      } catch {
        sama = false;
      }
      if (!sama) navigateTo(b.url);
    }
  };

  /** Hapus satu baris. Optimistis, tapi DIKEMBALIKAN kalau server menolak. */
  const hapusSatu = async (b: Baris) => {
    const sebelum = daftar;
    const belumSebelum = belum;
    setDaftar((d) => d.filter((x) => x.id !== b.id));
    if (!b.dibaca_pada) setBelum((n) => Math.max(0, n - 1));
    try {
      const d = (await api.secure('hapusNotifikasi', [wa, b.id], { silent: true })) as {
        success?: boolean;
      };
      if (d?.success === false) throw new Error('ditolak');
    } catch {
      /* Baris yang hilang dari layar padahal masih ada di server lebih buruk
         daripada gagal menghapus: kembalikan apa adanya lalu beri tahu. */
      setDaftar(sebelum);
      setBelum(belumSebelum);
      showToast(t('notif.galat_hapus'), 'error');
    }
  };

  /** Hapus SEMUA yang sudah dibaca. Yang belum dibaca tidak disentuh. */
  const bersihkan = async () => {
    const sisa = daftar.filter((x) => !x.dibaca_pada);
    if (sisa.length === daftar.length) return;
    const sebelum = daftar;
    setDaftar(sisa);
    try {
      const d = (await api.secure('hapusNotifikasi', [wa], { silent: true })) as {
        success?: boolean;
      };
      if (d?.success === false) throw new Error('ditolak');
    } catch {
      setDaftar(sebelum);
      showToast(t('notif.galat_hapus'), 'error');
    }
  };

  const tandaiSemua = async () => {
    if (belum === 0) return;
    const now = new Date().toISOString();
    setDaftar((d) => d.map((x) => (x.dibaca_pada ? x : { ...x, dibaca_pada: now })));
    setBelum(0);
    try {
      await api.secure('tandaiSemuaNotifikasiDibaca', [wa], { silent: true });
    } catch {
      /* idem */
    }
  };

  const mintaIzin = async () => {
    setMemintaIzin(true);
    try {
      const hasil = await requestNotificationPermission(wa);
      setIzin(hasil === 'registered' ? 'granted' : hasil === 'permission-denied' ? 'denied' : 'default');
    } finally {
      setMemintaIzin(false);
    }
  };

  const tampil = terbuka ? daftar : daftar.slice(0, TAMPIL_RINGKAS);
  /** Tombol "Bersihkan" hanya muncul kalau memang ada yang bisa dibersihkan. */
  const adaDibaca = daftar.some((x) => x.dibaca_pada);

  /* Petunjuk pemasangan hanya relevan di iOS yang belum dipasang: di sana
     `Notification` bahkan tidak ada sampai web app masuk Layar Utama. */
  const iosBelumPasang = (() => {
    try {
      const ua = navigator.userAgent || '';
      const ios = /iPad|iPhone|iPod/.test(ua);
      const standalone =
        window.matchMedia?.('(display-mode: standalone)').matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true;
      return ios && !standalone;
    } catch {
      return false;
    }
  })();

  if (memuat && daftar.length === 0) {
    return (
      <section class="mb-6 rounded-panel border border-line bg-surface p-4" data-testid="kotak-masuk">
        <p class="text-[12px] text-fg-muted">{t('notif.memuat')}</p>
      </section>
    );
  }

  if (galat && daftar.length === 0) {
    return (
      <section class="mb-6 rounded-panel border border-accent-red/40 bg-accent-red/10 p-4" data-testid="kotak-masuk">
        <p class="text-[12px] text-accent-red">{galat}</p>
      </section>
    );
  }

  return (
    <section
      class="mb-6 rounded-panel border border-line bg-surface p-4 sm:p-5"
      aria-label={t('notif.judul')}
      data-testid="kotak-masuk"
    >
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 class="flex items-center gap-2 text-base font-black text-fg">
          <Icon name="envelope" class="text-accent-sky" />
          {t('notif.judul')}
          {belum > 0 && (
            <span
              role="status"
              class="rounded-full bg-accent-red px-2 py-0.5 text-[10.5px] font-black text-canvas"
              aria-label={`${belum} ${t('notif.belum')}`}
            >
              {belum}
            </span>
          )}
        </h2>
        <div class="flex flex-wrap items-center justify-end gap-1.5">
          {adaDibaca && (
            <button
              type="button"
              onClick={() => void bersihkan()}
              class="min-h-9 rounded-control border border-line px-2.5 text-[11px] font-bold text-fg-muted hover:border-accent-red/50 hover:text-accent-red"
            >
              {t('notif.bersihkan')}
            </button>
          )}
          {belum > 0 && (
            <button
              type="button"
              onClick={() => void tandaiSemua()}
              class="min-h-9 rounded-control border border-line px-2.5 text-[11px] font-bold text-fg-muted hover:text-fg"
            >
              {t('notif.tandai_semua')}
            </button>
          )}
        </div>
      </div>

      {daftar.length === 0 ? (
        <p class="text-[12px] text-fg-muted">{t('notif.kosong')}</p>
      ) : (
        <ul class="space-y-1.5">
          {tampil.map((b) => {
            const belumDibaca = !b.dibaca_pada;
            return (
              /* DUA tombol, bukan satu: membuka dan menghapus adalah tindakan
                 yang berbeda, dan tombol bersarang tidak sah di HTML. */
              <li key={b.id} class="flex items-stretch gap-1">
                <button
                  type="button"
                  onClick={() => void tandaiSatu(b)}
                  class={`min-w-0 flex-1 rounded-control border px-3 py-2 text-left transition ${
                    belumDibaca
                      ? 'border-accent-sky/40 bg-accent-sky/10 hover:border-accent-sky'
                      : 'border-transparent bg-surface-sunken hover:border-line'
                  }`}
                >
                  <span class="flex items-start gap-2">
                    <Icon name={ikonJenis(b.jenis)} class="mt-0.5 shrink-0 text-accent-sky" />
                    <span class="min-w-0 flex-1">
                      <span class="flex flex-wrap items-baseline justify-between gap-x-2">
                        <span class={`text-[12.5px] ${belumDibaca ? 'font-black text-fg' : 'font-bold text-fg-muted'}`}>
                          {b.judul}
                        </span>
                        <span class="text-[10.5px] tabular-nums text-fg-muted">{waktuRingkas(b.dibuat_pada)}</span>
                      </span>
                      {b.isi && <span class="mt-0.5 block text-[11.5px] leading-snug text-fg-muted">{b.isi}</span>}
                    </span>
                    {/* Penanda bahwa baris ini membawa ke suatu tempat. Tanpa
                        ini, baris yang tujuannya halaman yang sama terlihat
                        persis seperti teks biasa. */}
                    {b.url && <Icon name="chevron-right" class="mt-0.5 shrink-0 text-fg-subtle" />}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => void hapusSatu(b)}
                  aria-label={`${t('notif.hapus')}: ${b.judul}`}
                  title={t('notif.hapus')}
                  class="shrink-0 rounded-control border border-line px-2 text-fg-muted transition hover:border-accent-red/50 hover:text-accent-red"
                >
                  <Icon name="trash" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {daftar.length > TAMPIL_RINGKAS && (
        <button
          type="button"
          onClick={() => setTerbuka((v) => !v)}
          class="mt-2 min-h-9 text-[11px] font-bold text-accent-sky"
        >
          {terbuka ? t('notif.ringkas') : `${t('notif.lihat_semua')} (${daftar.length})`}
        </button>
      )}

      {/* ── Izin notifikasi ───────────────────────────────────────────────── */}
      <div class="mt-3 border-t border-line pt-2.5">
        {iosBelumPasang ? (
          <p class="text-[11px] leading-relaxed text-fg-muted">{t('notif.ios_install')}</p>
        ) : izin === 'granted' ? (
          <p class="flex items-center gap-1.5 text-[11px] font-bold text-accent-emerald">
            <Icon name="check-circle" /> {t('notif.aktif')}
          </p>
        ) : izin === 'denied' ? (
          <p class="text-[11px] leading-relaxed text-fg-muted">{t('notif.ditolak')}</p>
        ) : izin === 'unsupported' ? (
          <p class="text-[11px] leading-relaxed text-fg-muted">{t('notif.tidak_didukung')}</p>
        ) : (
          <div class="flex flex-wrap items-center gap-2">
            <p class="min-w-0 flex-1 text-[11px] leading-relaxed text-fg-muted">{t('notif.izin_ket')}</p>
            <button
              type="button"
              disabled={memintaIzin}
              onClick={() => void mintaIzin()}
              class="min-h-9 shrink-0 rounded-control bg-accent-sky px-3 text-[11px] font-bold text-canvas disabled:opacity-50"
            >
              {memintaIzin ? t('notif.memuat') : t('notif.aktifkan')}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
