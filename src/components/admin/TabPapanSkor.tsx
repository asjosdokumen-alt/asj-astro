/**
 * TabPapanSkor.tsx — papan peringkat keempat game, untuk ADMIN.
 *
 * KENAPA ADA
 *   Pemilik 2026-11-04: *"game yg bisa ada leaderboardnya dan game tolong kasih
 *   di menu admin supaya bisa check langsung leaderboard baik matematika atau
 *   game arcade kotoba dll."*
 *
 *   Sebelum ini skor hanya hidup di `localStorage` tiap perangkat, jadi pengajar
 *   tidak punya cara melihat siapa yang benar-benar berlatih.
 *
 * KENAPA ADMIN SAJA
 *   Isinya NAMA siswa satu angkatan. Itu bukan rahasia, tapi juga bukan sesuatu
 *   yang perlu dibuka ke semua siswa dari satu panggilan API — gerbangnya ada di
 *   server (`getPapanSkor` memakai `requireAdmin`), bukan hanya di tab ini.
 *
 * SATU PERMINTAAN UNTUK EMPAT PAPAN
 *   `getPapanSkor` tanpa argumen mengembalikan keempatnya sekaligus. Empat
 *   permintaan terpisah akan membuat tab ini butuh empat status memuat, empat
 *   penanganan galat, dan bisa tampil setengah jadi.
 */
import { useCallback, useEffect, useState } from 'preact/hooks';
import api from '../../lib/apiClient';
import { t, useLang } from '../../store/i18n';
import Icon from '../ui/Icon';

interface Baris {
  no_wa: string;
  nama: string;
  kelas: string;
  skor: number;
  dibuat_pada: string;
}

type GameId = 'kotoba' | 'genba' | 'combo' | 'matematika';

/**
 * Urutan & label papan. Ditulis sebagai array, bukan objek, supaya urutan
 * tampilnya eksplisit — objek JS tidak menjamin urutan kunci, dan papan yang
 * berpindah posisi setiap render akan terasa seperti bug.
 */
const PAPAN: { id: GameId; labelKey: string; ikon: string }[] = [
  { id: 'kotoba', labelKey: 'admin.game_kotoba', ikon: '📚' },
  { id: 'genba', labelKey: 'admin.game_genba', ikon: '📦' },
  { id: 'combo', labelKey: 'admin.game_combo', ikon: '🃏' },
  { id: 'matematika', labelKey: 'admin.game_matematika', ikon: '🧮' },
];

const MEDALI = ['🥇', '🥈', '🥉'];

export default function TabPapanSkor() {
  useLang();
  const [papan, setPapan] = useState<Record<string, Baris[]> | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState('');

  const muat = useCallback(async () => {
    setMemuat(true);
    setGalat('');
    try {
      const d = await api.secure('getPapanSkor', [], { silent: true });
      const hasil = (d as { papan?: Record<string, Baris[]> })?.papan;
      if (!hasil) {
        /* Jangan diamkan: respons tanpa `papan` berarti bentuknya berubah, dan
           tab yang menampilkan "belum ada skor" akan menyamarkan itu sebagai
           "tidak ada yang bermain". */
        setGalat(t('admin.papan_skor_gagal'));
        setPapan(null);
        return;
      }
      setPapan(hasil);
    } catch {
      setGalat(t('admin.papan_skor_gagal'));
      setPapan(null);
    } finally {
      setMemuat(false);
    }
  }, []);

  useEffect(() => {
    void muat();
  }, [muat]);

  return (
    <div>
      <div class="flex flex-wrap justify-between items-center gap-2 border-b border-pink-900/50 pb-4 mb-4">
        <h2 class="text-pink-400 font-bold text-lg">
          <Icon name="tasks" class="mr-2" /> {t('admin.tab_papan_skor')}
        </h2>
        <button
          type="button"
          onClick={() => void muat()}
          class="min-h-11 rounded-control border border-line bg-surface-raised px-3 text-[12px] font-bold text-fg-muted"
        >
          {memuat ? t('admin.papan_skor_muat') : t('admin.papan_skor_segarkan')}
        </button>
      </div>

      <p class="mb-4 text-[12px] text-fg-muted">{t('admin.papan_skor_ket')}</p>

      {galat && (
        <p role="alert" class="mb-4 rounded-control border border-accent-red/40 bg-accent-red/10 px-3 py-2 text-[12px] text-accent-red">
          {galat}
        </p>
      )}

      <div class="grid gap-4 md:grid-cols-2">
        {PAPAN.map((g) => {
          const baris = papan?.[g.id] || [];
          return (
            <section key={g.id} class="rounded-card border border-line bg-surface-raised p-3" data-testid={`papan-${g.id}`}>
              <h3 class="mb-2 flex items-center justify-between text-sm font-bold text-fg">
                <span>
                  <span aria-hidden="true">{g.ikon}</span> {t(g.labelKey)}
                </span>
                <span class="text-[11px] font-normal text-fg-muted">
                  {baris.length} {t('admin.papan_skor_peserta')}
                </span>
              </h3>

              {baris.length === 0 ? (
                <p class="py-3 text-center text-[12px] text-fg-muted">{t('admin.papan_skor_kosong')}</p>
              ) : (
                <ol class="space-y-1">
                  {baris.map((r, i) => (
                    <li
                      key={`${r.no_wa}-${i}`}
                      class="flex items-center gap-2 rounded-control bg-surface-sunken px-2 py-1.5 text-[12px]"
                    >
                      <span class="w-6 shrink-0 text-center font-bold text-fg-muted" aria-hidden="true">
                        {MEDALI[i] || i + 1}
                      </span>
                      <span class="min-w-0 flex-1 truncate font-bold text-fg">{r.nama || r.no_wa}</span>
                      {r.kelas && (
                        <span class="shrink-0 rounded border border-line px-1 text-[10px] text-fg-muted">
                          {r.kelas}
                        </span>
                      )}
                      <span class="shrink-0 tabular-nums font-bold text-accent-violet">{r.skor}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
