/**
 * GerbangTes.tsx — gerbang bersama dua tes mandiri (MBTI & Tes Mata).
 *
 * KENAPA DIEKSTRAK
 * ----------------
 * `/kotoba`, `/matematika`, dan `/wawancara` masing-masing menulis gerbangnya
 * sendiri; `/arcade` sudah memakai `LoginGate` bersama. Menambah DUA halaman
 * tes baru dengan dua salinan gerbang berarti aturan "harus login + harus
 * siswa + harus dibuka admin" hidup di empat tempat — dan aturan yang hidup di
 * empat tempat adalah aturan yang cepat atau lambat berbeda di salah satunya.
 *
 * TIGA LAPIS, dan lapisan yang menentukan tetap SERVER
 * ---------------------------------------------------
 *   1. tombol dasbor  — toast untuk non-siswa (UX saja);
 *   2. halaman ini    — login, kartu "khusus siswa", kartu "belum dibuka";
 *   3. server         — `tolakKecualiSiswa` + `bacaSakelar()` di
 *      `_lib/asesmen/tes.ts`. Tanpa lapisan ini, mematikan sakelar di panel
 *      admin hanya menyembunyikan tombol: siapa pun yang tahu nama action
 *      tetap bisa menyimpan hasil.
 */
import { useCallback, useEffect, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { authStore, modeUji, waUjiTersimpan } from '../../../store/authReactive';
import { apiClient, type ApiError } from '../../../lib/apiClient';
import { t } from '../../../store/i18n';
import LoginGate from '../../ui/LoginGate';

export type JenisTes = 'mbti' | 'mata' | 'iq';

export interface HasilTersimpan {
  ringkasan: string;
  hasil: Record<string, unknown>;
  dibuat_pada: string;
}

export interface StatusTesRes {
  success?: boolean;
  isVip?: boolean;
  aktif?: Partial<Record<JenisTes, boolean>>;
  selesai?: Partial<Record<JenisTes, boolean>>;
  hasil?: Partial<Record<JenisTes, HasilTersimpan>>;
  message?: string;
  sessionInvalid?: boolean;
}

export interface Gerbang {
  wa: string;
  /** true = sesi admin sedang mencoba lewat `?uji=1` (lihat `modeUji`). */
  uji: boolean;
  status: StatusTesRes | null;
  memuat: boolean;
  galat: string;
  /** true = server menyatakan bukan siswa ASJ. */
  bukanSiswa: boolean;
  /** true = admin belum membuka tes ini. */
  tertutup: boolean;
  /** Hasil yang sudah tersimpan (kalau sudah pernah mengerjakan). */
  tersimpan: HasilTersimpan | null;
  muat: () => Promise<void>;
  /** Dipanggil setelah hasil tersimpan supaya kartu berubah tanpa reload. */
  tandaiSelesai: (h: HasilTersimpan) => void;
}

function waAwal(): string {
  const a = authStore.get();
  const admin = a.role === 'admin';
  try {
    const q = new URLSearchParams(window.location.search).get('wa');
    /* `?wa=` hanya dihormati untuk ADMIN. Kalau kandidat membuka tautan yang
       membawa nomor orang lain, server memang menolaknya — tetapi halaman ini
       lalu berhenti di "memuat" tanpa penjelasan, dan itu terbaca seperti fitur
       rusak. Sesi sendiri selalu benar, jadi itulah yang dipakai. */
    if (q && admin) return q;
  } catch {
    /* URL tidak terbaca: jatuh ke sesi. */
  }
  /* Panel admin menyimpan nomor uji sekali, lalu setiap tautannya membawa
     nomor yang sama. Cadangan ini hanya berlaku DI DALAM mode uji: tanpa
     `?uji=1`, admin yang membuka `/tes-mbti` langsung tidak boleh diam-diam
     masuk sebagai siswa yang nomornya tersimpan — di jalur itu hasilnya
     benar-benar ditulis. */
  if (admin && modeUji()) {
    const u = waUjiTersimpan();
    if (u) return u;
  }
  return a.isLoggedIn && a.role === 'kandidat' ? a.wa || '' : '';
}

/**
 * Ambil status tes untuk satu siswa. `null` = belum tahu; jangan putuskan apa
 * pun selama masih null (kartu "diblokir" yang muncul sesaat lalu hilang
 * terbaca seperti fitur rusak).
 */
export function useGerbangTes(jenis: JenisTes): Gerbang {
  /* Tanpa setter: WA hanya berubah lewat login, dan login melakukan reload
     ringan (`KartuGerbang`) supaya hook membaca sesi yang baru. */
  const [wa] = useState(waAwal);
  /* Dibaca sekali saat mount: mode uji tidak berubah selama satu halaman hidup. */
  const [uji] = useState(modeUji);
  const [status, setStatus] = useState<StatusTesRes | null>(null);
  const [memuat, setMemuat] = useState(false);
  const [galat, setGalat] = useState('');

  const muat = useCallback(async () => {
    /* Mode uji tanpa nomor tetap mengambil status: `getStatusTes('')` hanya
       melaporkan sakelar, dan tanpa itu admin tidak bisa melihat apakah tes
       sedang dibuka. */
    if (!wa && !uji) return;
    setMemuat(true);
    setGalat('');
    try {
      const d = await apiClient<StatusTesRes>('getStatusTes', [wa], {
        onSessionInvalid: 'throw',
        silent: true,
      });
      if (d.sessionInvalid) {
        authStore.set({ ...authStore.get(), isLoggedIn: false, sessionToken: '', role: 'guest' });
        setStatus(null);
        return;
      }
      setStatus(d);
    } catch (e) {
      const err = e as ApiError;
      setGalat(err?.message || t('tes.galat_muat'));
    } finally {
      setMemuat(false);
    }
  }, [wa, uji]);

  useEffect(() => {
    void muat();
  }, [muat]);

  const tandaiSelesai = useCallback(
    (h: HasilTersimpan) => {
      setStatus((s) => ({
        ...(s || {}),
        selesai: { ...(s?.selesai || {}), [jenis]: true },
        hasil: { ...(s?.hasil || {}), [jenis]: h },
      }));
    },
    [jenis],
  );

  const bukanSiswa = status?.isVip === false;
  const tertutup = status !== null && status.aktif?.[jenis] === false;
  const tersimpan = status?.selesai?.[jenis] ? status.hasil?.[jenis] || null : null;

  return {
    wa,
    uji,
    status,
    memuat,
    galat,
    bukanSiswa,
    tertutup,
    tersimpan,
    muat,
    tandaiSelesai,
  };
}

/** Kartu status: login → bukan siswa → belum dibuka. `null` = boleh lanjut. */
export function KartuGerbang({ gerbang, jenis }: { gerbang: Gerbang; jenis: JenisTes }) {
  /* `uji` meloloskan formulir masuk: yang membuka halaman ini adalah admin yang
     sudah punya sesi sendiri, dan nomor WA di sini hanya identitas percobaan —
     tidak ada hasil yang ditulis atas namanya (lihat `MbtiTest`/`MataTest`). */
  if (!gerbang.wa && !gerbang.uji) {
    return (
      <LoginGate
        onSuccess={(nomor) => {
          /* Login mengisi authStore; muat ulang lewat reload ringan supaya
             hook membaca WA baru dari sesi. Satu reload jauh lebih sederhana
             daripada mengoper setter ke dalam hook. */
          try {
            const url = new URL(window.location.href);
            url.searchParams.set('wa', nomor);
            window.location.replace(url.toString());
          } catch {
            window.location.reload();
          }
        }}
      />
    );
  }

  if (gerbang.galat && !gerbang.status) {
    return (
      <section class="mx-auto my-8 max-w-md rounded-card border border-line bg-surface p-6 text-center">
        <p data-testid="tes-galat" class="mb-4 text-sm text-accent-red">
          {gerbang.galat}
        </p>
        <button
          type="button"
          onClick={() => void gerbang.muat()}
          class="min-h-11 rounded-control bg-accent-sky px-5 text-sm font-bold text-canvas"
        >
          {t('tes.coba_lagi')}
        </button>
      </section>
    );
  }

  /* `status === null` = belum tahu. JANGAN render isi tes selama ini: satu
     frame sebelum efek berjalan, `memuat` masih false dan kartu blokir belum
     bisa diputuskan — tanpa cabang ini, siswa non-VIP melihat soal pertama
     sebelum ditolak. */
  if (!gerbang.status) {
    return (
      <p data-testid="tes-memuat" class="mx-auto my-8 max-w-md text-center text-sm text-fg-muted">
        {t('tes.memuat')}
      </p>
    );
  }

  if (gerbang.bukanSiswa) {
    return (
      <section
        aria-label={t('tes.khusus_siswa_judul')}
        data-testid="tes-khusus-siswa"
        class="mx-auto my-8 max-w-md rounded-card border border-line bg-surface p-6 text-center"
      >
        <h2 class="mb-2 text-base font-black text-fg">{t('tes.khusus_siswa_judul')}</h2>
        <p class="text-[12.5px] leading-relaxed text-fg-muted">{t('tes.khusus_siswa_isi')}</p>
      </section>
    );
  }

  if (gerbang.tertutup) {
    return (
      <section
        aria-label={t('tes.tertutup_judul')}
        data-testid="tes-tertutup"
        class="mx-auto my-8 max-w-md rounded-card border border-accent-amber/40 bg-accent-amber/10 p-6 text-center"
      >
        <h2 class="mb-2 text-base font-black text-accent-amber">{t('tes.tertutup_judul')}</h2>
        <p class="text-[12.5px] leading-relaxed text-fg">
          {jenis === 'mbti'
            ? t('tes.tertutup_isi_mbti')
            : jenis === 'iq'
              ? t('tes.tertutup_isi_iq')
              : t('tes.tertutup_isi_mata')}
        </p>
        <p class="mt-3 text-[11.5px] text-fg-muted">{t('tes.tertutup_hubungi')}</p>
      </section>
    );
  }

  return null;
}

/** Bungkus isi tes: hanya render anak bila gerbang meloloskan. */
export function IsiTes({
  gerbang,
  jenis,
  children,
}: {
  gerbang: Gerbang;
  jenis: JenisTes;
  children: ComponentChildren;
}) {
  /* `KartuGerbang` SELALU mengembalikan elemen, jadi ia tidak boleh dipakai
     sebagai penentu blokir (`if (kartu)`) — elemen selalu truthy. Kondisinya
     diperiksa di sini, satu tempat, lalu kartunya dirender. */
  const diblokir =
    (!gerbang.wa && !gerbang.uji) || !gerbang.status || gerbang.bukanSiswa || gerbang.tertutup;
  if (diblokir) return <KartuGerbang gerbang={gerbang} jenis={jenis} />;
  return <>{children}</>;
}
