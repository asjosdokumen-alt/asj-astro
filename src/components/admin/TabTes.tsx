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

export default function TabTes() {
  useLang();
  const [aktif, setAktif] = useState<Partial<Record<Jenis, boolean>> | null>(null);
  const [hasil, setHasil] = useState<BarisHasil[]>([]);
  const [filter, setFilter] = useState<'' | Jenis>('');
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState('');
  const [menyimpan, setMenyimpan] = useState<Jenis | ''>('');

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
