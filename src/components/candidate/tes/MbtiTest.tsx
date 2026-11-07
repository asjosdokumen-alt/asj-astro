/**
 * MbtiTest.tsx — tes kepribadian 40 soal (`/tes-mbti`).
 *
 * ATURAN YANG DIPEGANG
 * --------------------
 *   • Sekali per siswa. Kalau server bilang sudah pernah, halaman menampilkan
 *     hasil yang tersimpan — TIDAK ada tombol "ulangi".
 *   • Hanya saat admin membuka (`getStatusTes.aktif.mbti`).
 *   • Skala bipolar 5 titik (-2…+2) dengan separuh soal terbalik, supaya pola
 *     "selalu pilih kanan" tidak menghasilkan satu tipe untuk semua orang.
 *
 * KENAPA TIDAK ADA TOMBOL "ULANGI"
 * --------------------------------
 * Bukan kelupaan. Tes ini dipakai sebagai bahan pertimbangan penempatan, dan
 * hasil yang bisa diulang sampai "bagus" tidak lagi menggambarkan apa pun.
 * Kalau siswa ingin memperbaiki data, itu urusan admin — bukan tombol di sini.
 */
import { useEffect, useState } from 'preact/hooks';
import { apiClient, type ApiError } from '../../../lib/apiClient';
import { t } from '../../../store/i18n';
import { SOAL_MBTI, PROFIL_MBTI, hitungMbti, type HasilMbti } from '../../../lib/tesSeleksi';
import { IsiTes, useGerbangTes, type HasilTersimpan } from './GerbangTes';

const KUNCI_DRAF = 'asj_mbti_draf_v1';
const PER_HALAMAN = 5;

/** Label skala. Urutannya dari -2 ke +2, sama dengan nilai yang dikirim. */
const SKALA: { nilai: number; kunci: string }[] = [
  { nilai: -2, kunci: 'tes.mbti_skala_0' },
  { nilai: -1, kunci: 'tes.mbti_skala_1' },
  { nilai: 0, kunci: 'tes.mbti_skala_2' },
  { nilai: 1, kunci: 'tes.mbti_skala_3' },
  { nilai: 2, kunci: 'tes.mbti_skala_4' },
];

function bacaDraf(): Record<number, number> {
  try {
    const raw = localStorage.getItem(KUNCI_DRAF);
    if (!raw) return {};
    const p = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<number, number> = {};
    for (const s of SOAL_MBTI) {
      const v = Number(p?.[String(s.id)]);
      if (Number.isFinite(v) && v >= -2 && v <= 2) out[s.id] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function tulisDraf(j: Record<number, number>): void {
  try {
    localStorage.setItem(KUNCI_DRAF, JSON.stringify(j));
  } catch {
    /* Mode privat: draf tidak diingat, tes tetap jalan. */
  }
}

/** Kartu hasil — dipakai untuk hasil baru maupun hasil yang sudah tersimpan. */
function KartuHasil({ hasil, baru, catatan }: { hasil: HasilMbti; baru: boolean; catatan?: string }) {
  const p = hasil.persentase;
  const baris: { kiri: string; kanan: string; l: number; r: number; warna: string }[] = [
    { kiri: 'E', kanan: 'I', l: p.E, r: p.I, warna: 'bg-accent-sky' },
    { kiri: 'S', kanan: 'N', l: p.S, r: p.N, warna: 'bg-accent-amber' },
    { kiri: 'T', kanan: 'F', l: p.T, r: p.F, warna: 'bg-accent-emerald' },
    { kiri: 'J', kanan: 'P', l: p.J, r: p.P, warna: 'bg-accent-violet' },
  ];
  return (
    <div class="space-y-4">
      <section class="rounded-card border border-line bg-surface p-5">
        <p class="mb-1 text-[11px] font-bold uppercase tracking-wide text-accent-sky">
          {baru ? t('tes.mbti_hasil_baru') : t('tes.sudah_label')}
        </p>
        <h2 class="text-2xl font-black text-fg">
          {hasil.tipe} <span class="text-base font-bold text-fg-muted">— {hasil.profil.judul}</span>
        </h2>
        <p class="mt-1 text-[12.5px] leading-relaxed text-fg-muted">{hasil.profil.ringkas}</p>
        <div class="mt-4 grid gap-2.5 sm:grid-cols-2">
          {baris.map((b) => (
            <div key={b.kiri} class="rounded-control border border-line bg-surface-sunken p-2.5">
              <div class="mb-1 flex justify-between text-[11px] font-bold text-fg">
                <span>
                  {b.kiri} {b.l}%
                </span>
                <span>
                  {b.r}% {b.kanan}
                </span>
              </div>
              <div class="h-2 w-full overflow-hidden rounded-full bg-surface-raised">
                <div class={`h-full ${b.warna}`} style={{ width: `${b.l}%` }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section class="rounded-card border border-line bg-surface p-5">
        <h3 class="mb-2 text-sm font-bold text-fg">{t('tes.mbti_bidang')}</h3>
        <ul class="flex flex-wrap gap-2">
          {hasil.profil.bidang.map((b) => (
            <li key={b} class="rounded-control border border-accent-sky/40 bg-accent-sky/10 px-2.5 py-1 text-[12px] font-bold text-fg">
              {b}
            </li>
          ))}
        </ul>
      </section>

      <section class="rounded-card border border-line bg-surface p-5">
        <h3 class="mb-1 text-sm font-bold text-fg">{t('tes.mbti_mensetsu')}</h3>
        <p class="text-[12.5px] leading-relaxed text-fg-muted">{hasil.profil.mensetsu}</p>
      </section>

      <p class="rounded-control border border-line bg-surface-sunken px-3 py-2 text-[11.5px] leading-relaxed text-fg-muted">
        {t('tes.mbti_catatan')}
      </p>
      {catatan && (
        <p class="rounded-control border border-accent-amber/40 bg-accent-amber/10 px-3 py-2 text-[11.5px] leading-relaxed text-fg">
          {catatan}
        </p>
      )}
    </div>
  );
}

/**
 * Bangun ulang hasil dari yang TERSIMPAN di server.
 *
 * Server hanya menyimpan `tipe`, `persentase`, dan `jumlahTerjawab` — bukan
 * seluruh profil. Profilnya deterministik dari tipe, jadi ia dibangun ulang di
 * sini; tanpa ini kartu hasil akan membaca `profil.judul` dari `undefined`
 * setiap kali halaman dibuka ulang.
 */
function dariTersimpan(h: Record<string, unknown>): HasilMbti | null {
  const tipe = String(h?.tipe ?? '').toUpperCase();
  const p = h?.persentase as Record<string, unknown> | undefined;
  if (!/^[EI][SN][TF][JP]$/.test(tipe) || !p) return null;
  const angka = (k: string) => Math.max(0, Math.min(100, Math.round(Number(p[k]) || 0)));
  return {
    tipe,
    persentase: {
      E: angka('E'),
      I: angka('I'),
      S: angka('S'),
      N: angka('N'),
      T: angka('T'),
      F: angka('F'),
      J: angka('J'),
      P: angka('P'),
    },
    jumlahTerjawab: Number(h?.jumlahTerjawab) || SOAL_MBTI.length,
    profil: PROFIL_MBTI[tipe] || PROFIL_MBTI.ISTJ,
  };
}

function Isi({ gerbang }: { gerbang: ReturnType<typeof useGerbangTes> }) {
  const [jawaban, setJawaban] = useState<Record<number, number>>({});
  const [halaman, setHalaman] = useState(0);
  const [hasil, setHasil] = useState<HasilMbti | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);
  const [galat, setGalat] = useState('');
  const [catatanCv, setCatatanCv] = useState('');

  useEffect(() => {
    setJawaban(bacaDraf());
  }, []);

  /* Sudah pernah mengerjakan: tampilkan yang tersimpan, tanpa jalur mengulang. */
  if (gerbang.tersimpan && !hasil) {
    const h = dariTersimpan(gerbang.tersimpan.hasil);
    if (h) return <KartuHasil hasil={h} baru={false} />;
  }

  if (hasil) return <KartuHasil hasil={hasil} baru catatan={catatanCv} />;

  const totalHalaman = Math.ceil(SOAL_MBTI.length / PER_HALAMAN);
  const soalHalaman = SOAL_MBTI.slice(halaman * PER_HALAMAN, (halaman + 1) * PER_HALAMAN);
  const terjawab = Object.keys(jawaban).length;
  const persen = Math.round((terjawab / SOAL_MBTI.length) * 100);
  const halamanLengkap = soalHalaman.every((s) => jawaban[s.id] !== undefined);

  const pilih = (id: number, nilai: number) => {
    const baru = { ...jawaban, [id]: nilai };
    setJawaban(baru);
    tulisDraf(baru);
  };

  const kirim = async () => {
    const h = hitungMbti(jawaban);
    setMenyimpan(true);
    setGalat('');
    try {
      /* Mode uji admin (lihat `modeUji` di `store/authReactive`): hasilnya
         DITAMPILKAN, tidak dikirim. Tes ini hanya boleh dikerjakan sekali per
         siswa — `candidate_assessments_sekali` — jadi satu percobaan admin atas
         nama WA siswa akan membakar jatah satu-satunya milik siswa itu, dan
         sekaligus mengisi kolom CV-nya. */
      if (gerbang.uji) {
        setCatatanCv(t('tes.uji_tidak_disimpan'));
        gerbang.tandaiSelesai({
          ringkasan: h.tipe,
          hasil: h as unknown as Record<string, unknown>,
          dibuat_pada: new Date().toISOString(),
        });
        setHasil(h);
        return;
      }
      const d = await apiClient<{
        success?: boolean;
        sudah?: boolean;
        message?: string;
        cv?: { ditulis?: string[]; dilewati?: string[] };
      }>(
        'simpanHasilTes',
        [{ wa: gerbang.wa, jenis: 'mbti', hasil: { tipe: h.tipe, persentase: h.persentase, jumlahTerjawab: h.jumlahTerjawab } }],
        { onSessionInvalid: 'throw', silent: true },
      );
      if (d.success === false) {
        if (d.sudah) {
          /* Sudah pernah: muat ulang status supaya hasil lama yang tampil. */
          await gerbang.muat();
          return;
        }
        setGalat(d.message || t('tes.galat_simpan'));
        return;
      }
      if (d.cv?.dilewati?.includes('mbti')) setCatatanCv(t('tes.cv_manual_mbti'));
      const tersimpan: HasilTersimpan = {
        ringkasan: h.tipe,
        hasil: h as unknown as Record<string, unknown>,
        dibuat_pada: new Date().toISOString(),
      };
      gerbang.tandaiSelesai(tersimpan);
      try {
        localStorage.removeItem(KUNCI_DRAF);
      } catch {
        /* tidak fatal */
      }
      setHasil(h);
    } catch (e) {
      const err = e as ApiError;
      setGalat(err?.message || t('tes.galat_simpan'));
    } finally {
      setMenyimpan(false);
    }
  };

  return (
    <div class="rounded-card border border-line bg-surface p-4 sm:p-6">
      <div class="mb-5">
        <div class="mb-1.5 flex flex-wrap items-center justify-between gap-1 text-[11.5px] font-bold text-fg">
          <span>
            {t('tes.halaman')} {halaman + 1} / {totalHalaman}
          </span>
          <span class="text-accent-sky">
            {terjawab} / {SOAL_MBTI.length} · {persen}%
          </span>
        </div>
        <div class="h-2 w-full overflow-hidden rounded-full bg-surface-sunken">
          <div class="h-full bg-accent-sky transition-all" style={{ width: `${persen}%` }} />
        </div>
      </div>

      <div class="space-y-4">
        {soalHalaman.map((s, i) => {
          const dipilih = jawaban[s.id];
          return (
            <fieldset key={s.id} class="rounded-control border border-line bg-surface-sunken p-3">
              <legend class="px-1 text-[11px] font-bold text-fg-muted">{halaman * PER_HALAMAN + i + 1} / {SOAL_MBTI.length}</legend>
              <p class="mb-3 text-[13px] font-semibold leading-snug text-fg">{s.teks}</p>
              <div class="grid grid-cols-1 gap-1.5 sm:grid-cols-5">
                {SKALA.map((o) => {
                  const aktif = dipilih === o.nilai;
                  return (
                    <button
                      key={o.nilai}
                      type="button"
                      aria-pressed={aktif}
                      onClick={() => pilih(s.id, o.nilai)}
                      class={`min-h-11 rounded-control border px-2 text-[11.5px] font-bold transition ${
                        aktif
                          ? 'border-accent-sky bg-accent-sky text-canvas'
                          : 'border-line bg-surface text-fg-muted hover:border-accent-sky hover:text-fg'
                      }`}
                    >
                      {t(o.kunci)}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
      </div>

      {galat && (
        <p role="alert" class="mt-4 rounded-control border border-accent-red/40 bg-accent-red/10 px-3 py-2 text-[12px] text-accent-red">
          {galat}
        </p>
      )}

      <div class="mt-5 flex items-center justify-between gap-2 border-t border-line pt-4">
        <button
          type="button"
          disabled={halaman === 0}
          onClick={() => {
            setHalaman((h) => Math.max(0, h - 1));
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          class="min-h-11 rounded-control border border-line px-4 text-[12px] font-bold text-fg-muted disabled:opacity-40"
        >
          {t('tes.sebelumnya')}
        </button>

        {halaman < totalHalaman - 1 ? (
          <button
            type="button"
            disabled={!halamanLengkap}
            onClick={() => {
              setHalaman((h) => h + 1);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            class="min-h-11 rounded-control bg-accent-sky px-5 text-[12px] font-bold text-canvas disabled:opacity-40"
          >
            {t('tes.selanjutnya')}
          </button>
        ) : (
          <button
            type="button"
            disabled={terjawab < SOAL_MBTI.length || menyimpan}
            onClick={() => void kirim()}
            class="min-h-11 rounded-control bg-accent-emerald px-5 text-[12px] font-bold text-canvas disabled:opacity-40"
          >
            {menyimpan ? t('tes.menyimpan') : t('tes.mbti_selesai')}
          </button>
        )}
      </div>

      <p class="mt-3 text-[11px] leading-relaxed text-fg-muted">{t('tes.mbti_catatan')}</p>
    </div>
  );
}

export default function MbtiTest() {
  const gerbang = useGerbangTes('mbti');
  return (
    <IsiTes gerbang={gerbang} jenis="mbti">
      <Isi gerbang={gerbang} />
    </IsiTes>
  );
}
