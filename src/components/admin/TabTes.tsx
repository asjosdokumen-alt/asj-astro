/**
 * TabTes.tsx — sakelar & hasil dua tes mandiri (MBTI, Tes Mata Pra-MCU).
 *
 * KENAPA SAKELARNYA DI SINI
 * -------------------------
 * Pemilik 2026-11-06: *"di admin panel dibuatkan toggle untuk mengaktifkan dan
 * menonaktifkan fitur ini … ketika toggle off maka gak bisa diakses lagi walau
 * mereka vip."* Jadi satu tombol per tes, dan tombol itu yang menentukan —
 * bukan tanggal, bukan status VIP.
 *
 * KENAPA HASILNYA IKUT DITAMPILKAN
 * --------------------------------
 * Tanpa daftar ini, satu-satunya cara mengetahui siapa yang sudah tes adalah
 * membuka database. Daftar ini juga yang membuat "sekali per siswa" bisa
 * diperiksa: baris ganda untuk satu WA berarti constraint-nya tidak bekerja.
 */
import { useCallback, useEffect, useState } from 'preact/hooks';
import api from '../../lib/apiClient';
import { simpanWaUji, waUjiTersimpan } from '../../store/authReactive';
import { t, useLang } from '../../store/i18n';
import Icon from '../ui/Icon';

type Jenis = 'mbti' | 'mata';

interface BarisHasil {
  id: number | string;
  no_wa: string;
  nama: string;
  kelas: string;
  jenis: Jenis;
  ringkasan: string;
  dibuat_pada: string;
}

interface StatusRes {
  success?: boolean;
  aktif?: Partial<Record<Jenis, boolean>>;
  message?: string;
}

const TES: { id: Jenis; judul: string; ket: string; ikon: string }[] = [
  { id: 'mbti', judul: 'tes.admin_mbti_judul', ket: 'tes.admin_mbti_ket', ikon: 'clipboard-check' },
  { id: 'mata', judul: 'tes.admin_mata_judul', ket: 'tes.admin_mata_ket', ikon: 'eye' },
];

/**
 * Fitur kandidat yang bisa dibuka admin dari sini.
 *
 * KENAPA TAUTAN, BUKAN KOMPONEN TERTANAM
 * --------------------------------------
 * Yang perlu diperiksa admin adalah halaman yang SAMA dengan yang dipakai
 * siswa: lebar kolom, urutan soal, dan gerbangnya. Menanam komponennya di dalam
 * tab akan mengubah tata letak dan justru menyembunyikan hal yang diperiksa
 * (R17: prop yang tidak pernah dikirim adalah perilaku yang tidak pernah jalan).
 *
 * `?uji=1` membuat halaman itu MENAMPILKAN hasil tanpa menulis apa pun; lihat
 * `modeUji()` di `store/authReactive.ts` untuk batasnya.
 */
const FITUR_UJI: { jalur: string; labelKey: string; ikon: string }[] = [
  { jalur: '/tes-mbti', labelKey: 'ui.tes_mbti', ikon: 'clipboard-check' },
  { jalur: '/tes-mata', labelKey: 'ui.tes_mata', ikon: 'eye' },
  { jalur: '/arcade', labelKey: 'toolbar.arcade', ikon: 'star' },
  { jalur: '/kotoba', labelKey: 'toolbar.kotoba', ikon: 'language' },
  { jalur: '/matematika', labelKey: 'toolbar.matematika', ikon: 'chart-bar' },
  { jalur: '/wawancara', labelKey: 'toolbar.mensetsu', ikon: 'comment-dots' },
];

/**
 * Tautan uji: `uji=1` selalu ada, `wa` hanya bila nomornya diisi.
 *
 * `URLSearchParams` dipakai supaya nomor yang diketik dengan spasi/`+` tidak
 * merusak query — dan supaya penambahan parameter lain nanti tidak perlu
 * menyambung string secara manual.
 */
function tautanUji(jalur: string, wa: string): string {
  const q = new URLSearchParams({ uji: '1' });
  const bersih = String(wa || '').trim();
  if (bersih) q.set('wa', bersih);
  return `${jalur}?${q.toString()}`;
}

export default function TabTes() {
  useLang();
  const [aktif, setAktif] = useState<Partial<Record<Jenis, boolean>> | null>(null);
  const [hasil, setHasil] = useState<BarisHasil[]>([]);
  const [filter, setFilter] = useState<'' | Jenis>('');
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState('');
  const [menyimpan, setMenyimpan] = useState<Jenis | ''>('');
  /* Nomor uji disimpan di localStorage: admin mengetiknya SEKALI, lalu semua
     tautan di bawah membawanya. Halaman tes juga membacanya sendiri, jadi
     `/tes-mbti` boleh dibuka tanpa `?wa=` sama sekali. */
  const [waUji, setWaUji] = useState(waUjiTersimpan);

  const muat = useCallback(async () => {
    setMemuat(true);
    setGalat('');
    try {
      const [s, h] = await Promise.all([
        api.secure('getStatusTes', [''], { silent: true }) as Promise<StatusRes>,
        api.secure('getHasilTesAdmin', [undefined, 500], { silent: true }) as Promise<{
          success?: boolean;
          hasil?: BarisHasil[];
        }>,
      ]);
      setAktif(s?.aktif || { mbti: false, mata: false });
      setHasil(Array.isArray(h?.hasil) ? h.hasil : []);
    } catch {
      setGalat(t('tes.admin_galat_muat'));
      setAktif(null);
    } finally {
      setMemuat(false);
    }
  }, []);

  useEffect(() => {
    void muat();
  }, [muat]);

  const ubah = async (jenis: Jenis, nilai: boolean) => {
    setMenyimpan(jenis);
    setGalat('');
    try {
      const d = (await api.secure('setTesAktif', [{ jenis, aktif: nilai }], { silent: true })) as {
        success?: boolean;
        message?: string;
      };
      if (d?.success === false) {
        setGalat(d.message || t('tes.admin_galat_simpan'));
        return;
      }
      setAktif((a) => ({ ...(a || {}), [jenis]: nilai }));
    } catch {
      setGalat(t('tes.admin_galat_simpan'));
    } finally {
      setMenyimpan('');
    }
  };

  const baris = filter ? hasil.filter((r) => r.jenis === filter) : hasil;

  return (
    <div>
      <div class="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-pink-900/50 pb-4">
        <h2 class="text-lg font-bold text-pink-400">
          <Icon name="clipboard-check" class="mr-2" /> {t('tes.admin_judul')}
        </h2>
        <div class="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter((e.currentTarget as HTMLSelectElement).value as '' | Jenis)}
            aria-label={t('tes.admin_filter')}
            class="min-h-11 rounded-control border border-line bg-surface-raised px-2.5 text-[12px] font-bold text-fg"
          >
            <option value="">{t('tes.admin_filter_semua')}</option>
            <option value="mbti">MBTI</option>
            <option value="mata">{t('tes.admin_mata_judul')}</option>
          </select>
          <button
            type="button"
            onClick={() => void muat()}
            class="min-h-11 rounded-control border border-line bg-surface-raised px-3 text-[12px] font-bold text-fg-muted hover:text-fg"
          >
            {memuat ? t('tes.admin_memuat') : t('tes.admin_segarkan')}
          </button>
        </div>
      </div>

      {galat && (
        <p role="alert" class="mb-4 rounded-control border border-accent-red/40 bg-accent-red/10 px-3 py-2 text-[12px] text-accent-red">
          {galat}
        </p>
      )}

      {/* Mode uji — jalur khusus pemilik (2026-11-07). Ditaruh DI ATAS sakelar
          karena inilah yang dipakai sehari-hari; sakelar hanya diubah saat tes
          dibuka/ditutup untuk siswa. */}
      <section
        aria-label={t('tes.uji_judul')}
        data-testid="tes-mode-uji"
        class="mb-5 rounded-card border border-accent-emerald/40 bg-accent-emerald/5 p-4"
      >
        <h3 class="flex items-center gap-1.5 text-sm font-bold text-fg">
          <Icon name="rocket" class="text-accent-emerald" /> {t('tes.uji_judul')}
        </h3>
        <p class="mt-1 text-[11.5px] leading-relaxed text-fg-muted">{t('tes.uji_ket')}</p>

        <label for="tes-uji-wa" class="mt-3 block text-[11px] font-bold text-fg">
          {t('tes.uji_wa_label')}
        </label>
        <input
          id="tes-uji-wa"
          type="tel"
          value={waUji}
          onInput={(e) => {
            const v = (e.currentTarget as HTMLInputElement).value;
            setWaUji(v);
            simpanWaUji(v);
          }}
          placeholder="628xxxxxxxxxx"
          class="mt-1 w-full min-h-11 rounded-control border border-line bg-surface-sunken px-3 text-sm text-fg"
        />
        <p class="mt-1 text-[11px] leading-relaxed text-fg-muted">{t('tes.uji_wa_hint')}</p>

        <div class="mt-3 grid gap-2 sm:grid-cols-2">
          {FITUR_UJI.map((f) => (
            /* TANPA `target="_blank"`. Panel ini hidup di dalam PWA; tab baru
               berarti keluar ke browser dan kehilangan shell aplikasinya —
               pemilik 2026-11-07: *"kan ini pwa … kudu browser lagi, gak
               sempurna jadinya pwa nya"*. Navigasi di jendela yang sama tetap
               di dalam PWA, dan tombol Back browser mengembalikan ke panel. */
            <a
              key={f.jalur}
              href={tautanUji(f.jalur, waUji)}
              class="flex min-h-11 items-center gap-2 rounded-control border border-line bg-surface px-3 text-[12px] font-bold text-fg transition hover:border-accent-sky"
            >
              <Icon name={f.ikon} class="shrink-0 text-accent-sky" />
              <span class="min-w-0 truncate">{t(f.labelKey)}</span>
              <Icon name="arrow-right" class="ml-auto shrink-0 text-fg-muted" />
            </a>
          ))}
        </div>
      </section>

      <div class="mb-5 grid gap-3 md:grid-cols-2">
        {TES.map((tes) => {
          const nyala = aktif?.[tes.id] === true;
          return (
            <section key={tes.id} class="rounded-card border border-line bg-surface-raised p-4">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <h3 class="flex items-center gap-1.5 text-sm font-bold text-fg">
                    <Icon name={tes.ikon} class="text-accent-sky" /> {t(tes.judul)}
                  </h3>
                  <p class="mt-1 text-[11.5px] leading-relaxed text-fg-muted">{t(tes.ket)}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={nyala}
                  aria-label={t(tes.judul)}
                  disabled={aktif === null || menyimpan === tes.id}
                  onClick={() => void ubah(tes.id, !nyala)}
                  class={`relative min-h-11 min-w-[76px] shrink-0 rounded-full border px-2 text-[11px] font-black transition disabled:opacity-50 ${
                    nyala
                      ? 'border-accent-emerald bg-accent-emerald text-canvas'
                      : 'border-line bg-surface-sunken text-fg-muted'
                  }`}
                >
                  {menyimpan === tes.id ? '…' : nyala ? t('tes.admin_aktif') : t('tes.admin_nonaktif')}
                </button>
              </div>
              <p class="mt-2 text-[11px] text-fg-muted">
                {nyala ? t('tes.admin_status_buka') : t('tes.admin_status_tutup')}
              </p>
            </section>
          );
        })}
      </div>

      <section class="rounded-card border border-line bg-surface-raised p-3">
        <h3 class="mb-2 flex items-center justify-between gap-2 border-b border-line pb-2 text-sm font-bold text-fg">
          <span>{t('tes.admin_hasil')}</span>
          <span class="text-[11px] font-normal text-fg-muted">
            {baris.length} {t('tes.admin_baris')}
          </span>
        </h3>

        {baris.length === 0 ? (
          <p class="py-6 text-center text-[12px] text-fg-muted">
            {memuat ? t('tes.admin_memuat') : t('tes.admin_kosong')}
          </p>
        ) : (
          <div class="u-scroll-x">
            <table class="w-full min-w-[560px] text-left text-[12px]">
              <thead>
                <tr class="text-[11px] uppercase tracking-wide text-fg-muted">
                  <th class="py-1.5 pr-2 font-bold">{t('tes.admin_kolom_nama')}</th>
                  <th class="py-1.5 pr-2 font-bold">{t('tes.admin_kolom_jenis')}</th>
                  <th class="py-1.5 pr-2 font-bold">{t('tes.admin_kolom_ringkasan')}</th>
                  <th class="py-1.5 font-bold">{t('tes.admin_kolom_tanggal')}</th>
                </tr>
              </thead>
              <tbody>
                {baris.map((r) => (
                  <tr key={`${r.id}`} class="border-t border-line">
                    <td class="py-1.5 pr-2 font-bold text-fg">
                      {r.nama || r.no_wa}
                      {r.kelas && (
                        <span class="ml-1.5 rounded border border-line bg-surface-sunken px-1 text-[10px] font-bold text-fg-muted">
                          {r.kelas}
                        </span>
                      )}
                    </td>
                    <td class="py-1.5 pr-2 text-fg-muted">{r.jenis === 'mbti' ? 'MBTI' : t('tes.admin_mata_judul')}</td>
                    <td class="py-1.5 pr-2 text-fg">{r.ringkasan}</td>
                    <td class="py-1.5 tabular-nums text-fg-muted">
                      {r.dibuat_pada ? r.dibuat_pada.slice(0, 10).split('-').reverse().join('/') : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
