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
 * SATU PERMINTAAN UNTUK EMPAT PAPAN
 *   `getPapanSkor` tanpa argumen mengembalikan keempatnya sekaligus. Empat
 *   permintaan terpisah akan membuat tab ini butuh empat status memuat, empat
 *   penanganan galat, dan bisa tampil setengah jadi.
 */
import { useCallback, useEffect, useState } from 'preact/hooks';
import api from '../../lib/apiClient';
import { t, useLang } from '../../store/i18n';
import Icon from '../ui/Icon';
import { Bar, Status } from '../ui/Skeleton';

interface Baris {
  no_wa: string;
  nama: string;
  kelas: string;
  skor: number;
  detail?: Record<string, unknown>;
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

function ringkasDetail(d?: Record<string, unknown>): string {
  if (!d || typeof d !== 'object') return '';
  const bagian: string[] = [];
  if (typeof d.mode === 'string' && d.mode) bagian.push(d.mode);
  if (typeof d.level === 'string' && d.level) bagian.push(d.level);
  if (typeof d.sumber === 'string' && d.sumber) bagian.push(d.sumber);
  if (typeof d.benar === 'number') bagian.push(`✓${d.benar}`);
  if (typeof d.pesanan === 'number') bagian.push(`📦${d.pesanan}`);
  if (typeof d.kalimat === 'number') bagian.push(`🃏${d.kalimat}`);
  if (typeof d.kombo === 'number' && d.kombo > 1) bagian.push(`🔥x${d.kombo}`);
  return bagian.join(' · ');
}

export default function TabPapanSkor() {
  useLang();
  const [papan, setPapan] = useState<Record<string, Baris[]> | null>(null);
  const [filterKelas, setFilterKelas] = useState('');
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState('');

  const muat = useCallback(async () => {
    setMemuat(true);
    setGalat('');
    try {
      const d = await api.secure('getPapanSkor', [undefined, 25], { silent: true });
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

  const daftarKelas = Array.from(
    new Set(
      Object.values(papan || {})
        .flat()
        .map((r) => (r.kelas || '').trim())
        .filter(Boolean),
    ),
  ).sort();

  /* Muat PERTAMA saja. Saat menyegarkan, `papan` sudah berisi data lama dan
     kerangka akan menghapus informasi yang sudah benar — jadi yang diganti
     kerangka hanya keadaan "belum tahu", bukan "sedang memperbarui". */
  const memuatAwal = memuat && !papan;

  /* KERANGKA, BUKAN "BELUM ADA SKOR". Sebelum ini `papan` masih null selama
     muat pertama, jadi keenam kartu menampilkan `admin.papan_skor_kosong` —
     dan itu BUKAN keadaan kosong, itu keadaan BELUM TAHU. Admin membuka tab,
     membaca "belum ada yang bermain", lalu daftarnya muncul sendiri. Kerangka
     memberi tahu BENTUK yang akan datang tanpa mengklaim apa pun.

     Satu `Status` untuk seluruh grid, bukan enam: enam `role="status"` berarti
     enam pengumuman pembaca layar untuk satu kali pemuatan. */
  const kerangka = (
    <Status class="grid gap-4 md:grid-cols-2">
      {PAPAN.map((g) => (
        <section key={g.id} class="rounded-card border border-line bg-surface-raised p-3">
          <div class="mb-2.5 flex items-center justify-between gap-2 border-b border-line pb-2">
            <Bar class="h-4 w-32" />
            <Bar class="h-3 w-14" />
          </div>
          <div class="space-y-1.5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} class="flex items-center gap-2 rounded-control bg-surface-sunken px-2.5 py-1.5">
                <Bar class="h-4 w-6 shrink-0" />
                <div class="min-w-0 flex-1 space-y-1">
                  <Bar class="h-3 w-1/2" />
                  <Bar class="h-2 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </Status>
  );

  return (
    <div>
      <div class="flex flex-wrap justify-between items-center gap-2 border-b border-pink-900/50 pb-4 mb-4">
        <h2 class="text-pink-400 font-bold text-lg">
          <Icon name="tasks" class="mr-2" /> {t('admin.tab_papan_skor')}
        </h2>
        <div class="flex items-center gap-2">
          {daftarKelas.length > 0 && (
            <select
              value={filterKelas}
              onChange={(e) => setFilterKelas((e.currentTarget as HTMLSelectElement).value)}
              aria-label={t('admin.papan_skor_semua_kelas')}
              class="min-h-11 rounded-control border border-line bg-surface-raised px-2.5 text-[12px] font-bold text-fg"
            >
              <option value="">{t('admin.papan_skor_semua_kelas')}</option>
              {daftarKelas.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => void muat()}
            class="min-h-11 rounded-control border border-line bg-surface-raised px-3 text-[12px] font-bold text-fg-muted hover:text-fg"
          >
            {memuat ? t('admin.papan_skor_muat') : t('admin.papan_skor_segarkan')}
          </button>
        </div>
      </div>

      <p class="mb-4 text-[12px] text-fg-muted">{t('admin.papan_skor_ket')}</p>

      {galat && (
        <p role="alert" class="mb-4 rounded-control border border-accent-red/40 bg-accent-red/10 px-3 py-2 text-[12px] text-accent-red">
          {galat}
        </p>
      )}

      {memuatAwal ? (
        kerangka
      ) : (
      <div class="grid gap-4 md:grid-cols-2">
        {PAPAN.map((g) => {
          const semuaBaris = papan?.[g.id] || [];
          const baris = filterKelas ? semuaBaris.filter((r) => r.kelas === filterKelas) : semuaBaris;
          const tertinggi = baris[0]?.skor ?? 0;
          return (
            <section key={g.id} class="rounded-card border border-line bg-surface-raised p-3" data-testid={`papan-${g.id}`}>
              <h3 class="mb-2.5 flex items-center justify-between gap-2 border-b border-line pb-2 text-sm font-bold text-fg">
                <span>
                  <span aria-hidden="true">{g.ikon}</span> {t(g.labelKey)}
                </span>
                <span class="flex items-center gap-2 text-[11px] font-normal text-fg-muted">
                  {tertinggi > 0 && (
                    <span class="rounded border border-accent-amber/40 bg-accent-amber/15 px-1.5 py-0.5 font-bold text-accent-amber tabular-nums">
                      👑 {t('admin.papan_skor_tertinggi')}: {tertinggi}
                    </span>
                  )}
                  <span>
                    {baris.length} {t('admin.papan_skor_peserta')}
                  </span>
                </span>
              </h3>

              {baris.length === 0 ? (
                <p class="py-4 text-center text-[12px] text-fg-muted">{t('admin.papan_skor_kosong')}</p>
              ) : (
                <ol class="space-y-1.5">
                  {baris.map((r, i) => {
                    const info = ringkasDetail(r.detail);
                    const tgl = r.dibuat_pada ? r.dibuat_pada.slice(5, 10).replace('-', '/') : '';
                    const isTop3 = i < 3;
                    return (
                      <li
                        key={`${r.no_wa}-${i}`}
                        class={`flex items-center gap-2 rounded-control border px-2.5 py-1.5 text-[12px] ${
                          i === 0
                            ? 'border-accent-amber/40 bg-accent-amber/15'
                            : isTop3
                              ? 'border-accent-violet/30 bg-accent-violet/10'
                              : 'border-transparent bg-surface-sunken'
                        }`}
                      >
                        <span class="w-6 shrink-0 text-center font-bold text-fg-muted" aria-hidden="true">
                          {MEDALI[i] || i + 1}
                        </span>
                        <div class="min-w-0 flex-1">
                          <div class="flex items-center gap-1.5">
                            <span class="truncate font-bold text-fg">{r.nama || r.no_wa}</span>
                            {r.kelas && (
                              <span class="shrink-0 rounded border border-line bg-surface-raised px-1 text-[10px] font-bold text-fg-muted">
                                {r.kelas}
                              </span>
                            )}
                          </div>
                          {(info || tgl) && (
                            <div class="truncate text-[10px] text-fg-muted">
                              {info}
                              {info && tgl ? ' · ' : ''}
                              {tgl}
                            </div>
                          )}
                        </div>
                        <span class="shrink-0 tabular-nums text-sm font-black text-accent-violet">{r.skor}</span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          );
        })}
      </div>
      )}
    </div>
  );
}
