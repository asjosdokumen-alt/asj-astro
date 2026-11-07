/**
 * IqTest.tsx — Asesmen Penalaran (`/tes-iq`).
 *
 * ATURAN YANG DIPEGANG
 * --------------------
 *   • Kunci jawaban TIDAK ADA di klien. Soal datang dari server tanpa `kunci`,
 *     dan jawaban dinilai di sana. Komponen ini hanya mengumpulkan pilihan.
 *   • Sekali per siswa. Kalau server bilang sudah pernah, yang tampil adalah
 *     hasil tersimpan — tidak ada tombol ulang. Membuka ulang hanya tindakan
 *     admin (tombol di tab Tes & Uji).
 *   • Waktu berjalan dari JAM MULAI yang tersimpan, bukan dari hitungan di
 *     layar: me-refresh halaman tidak boleh menambah 25 menit baru.
 *   • Mode uji admin: `uji: true` dikirim, server menilai TANPA menyimpan.
 */
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { apiClient, type ApiError } from '../../../lib/apiClient';
import { t } from '../../../store/i18n';
import { IsiTes, useGerbangTes, type Gerbang } from './GerbangTes';

type Kategori = 'verbal' | 'numerik' | 'spasial' | 'logika';

interface Soal {
  id: string;
  kategori: Kategori;
  tanya: string;
  svg?: string;
  pilihan: string[];
}

interface Tampilan {
  catatan: string;
  subskor: Record<Kategori, number>;
  kekuatan: string[];
  latihan: string[];
  dikerjakanPada: string;
}

/** Angka penuh — HANYA dikirim server pada jalur mode uji admin. */
interface AdminView {
  benar: number;
  maks: number;
  skala: number;
  klasifikasi: string;
  rincian: Record<Kategori, { benar: number; total: number; subskor: number }>;
}

const PER_HALAMAN = 5;
const KUNCI_DRAF = 'asj_iq_draf_v1';
const KATEGORI: Kategori[] = ['verbal', 'numerik', 'spasial', 'logika'];

const kunciDraf = (wa: string) => `${KUNCI_DRAF}:${wa || 'uji'}`;

/** Draf disimpan per nomor WA supaya satu HP yang dipakai bergantian tidak
 *  mewariskan jawaban orang lain ke siswa berikutnya. */
function bacaDraf(wa: string): { jawaban: Record<string, number>; mulai: number } {
  try {
    const raw = localStorage.getItem(kunciDraf(wa));
    if (!raw) return { jawaban: {}, mulai: 0 };
    const p = JSON.parse(raw) as { j?: Record<string, unknown>; m?: unknown };
    const jawaban: Record<string, number> = {};
    for (const [k, v] of Object.entries(p.j || {})) {
      const n = Number(v);
      if (Number.isInteger(n) && n >= 0 && n <= 3) jawaban[k] = n;
    }
    return { jawaban, mulai: Number(p.m) || 0 };
  } catch {
    return { jawaban: {}, mulai: 0 };
  }
}

function KartuHasil({
  tampilan,
  baru,
  admin,
}: {
  tampilan: Tampilan;
  baru: boolean;
  admin: AdminView | null;
}) {
  return (
    <div class="space-y-4">
      <section class="rounded-card border border-line bg-surface p-5">
        <p class="mb-1 text-[11px] font-bold uppercase tracking-wide text-accent-sky">
          {baru ? t('tes.hasil_baru') : t('tes.sudah_label')}
        </p>
        <h2 class="text-xl font-black text-fg">{t('tes.iq_hasil')}</h2>
        <p class="mt-1 text-[12px] leading-relaxed text-fg-muted">{tampilan.catatan}</p>
      </section>

      {/* Blok ini hanya muncul di mode uji admin — server tidak pernah
          mengirim `admin` pada jalur siswa. */}
      {admin && (
        <section
          data-testid="iq-admin-angka"
          class="rounded-card border border-accent-violet/40 bg-accent-violet/10 p-4"
        >
          <p class="mb-1 text-[10.5px] font-bold uppercase tracking-wide text-fg-muted">
            {t('tes.iq_admin_angka')}
          </p>
          <p class="text-3xl font-black tabular-nums text-fg">
            {admin.skala}
            <span class="ml-1 text-sm font-bold text-fg-muted">/ 130</span>
          </p>
          <p class="mt-0.5 text-[12px] font-bold text-fg">
            {admin.benar}/{admin.maks} benar · {admin.klasifikasi}
          </p>
          <ul class="mt-2 grid gap-1 text-[11.5px] text-fg-muted sm:grid-cols-2">
            {KATEGORI.map((k) => (
              <li key={k} class="tabular-nums">
                {t(`tes.iq_${k}`)}: {admin.rincian[k]?.benar ?? 0}/{admin.rincian[k]?.total ?? 0}
              </li>
            ))}
          </ul>
          <p class="mt-2 text-[11px] leading-relaxed text-fg-muted">{t('tes.uji_tidak_disimpan')}</p>
        </section>
      )}

      <section class="rounded-card border border-line bg-surface p-4">
        <h3 class="mb-3 text-sm font-bold text-fg">{t('tes.iq_subskor')}</h3>
        <div class="space-y-2.5">
          {KATEGORI.map((k) => {
            const v = Math.max(1, Math.min(5, Number(tampilan.subskor[k]) || 1));
            return (
              <div key={k}>
                <div class="mb-1 flex justify-between text-[11.5px] font-bold text-fg">
                  <span>{t(`tes.iq_${k}`)}</span>
                  <span class="tabular-nums text-fg-muted">{v}/5</span>
                </div>
                <div class="h-2 w-full overflow-hidden rounded-full bg-surface-raised">
                  <div class="h-full bg-accent-sky" style={{ width: `${(v / 5) * 100}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {tampilan.kekuatan.length > 0 && (
        <section class="rounded-card border border-accent-emerald/40 bg-accent-emerald/5 p-4">
          <h3 class="mb-2 text-sm font-bold text-fg">{t('tes.iq_kekuatan')}</h3>
          <ul class="space-y-1 text-[12px] text-fg">
            {tampilan.kekuatan.map((x) => (
              <li key={x}>• {x}</li>
            ))}
          </ul>
        </section>
      )}

      {tampilan.latihan.length > 0 && (
        <section class="rounded-card border border-accent-amber/40 bg-accent-amber/10 p-4">
          <h3 class="mb-2 text-sm font-bold text-fg">{t('tes.iq_latihan')}</h3>
          <ul class="space-y-1 text-[12px] text-fg">
            {tampilan.latihan.map((x) => (
              <li key={x}>• {x}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Isi({ gerbang }: { gerbang: Gerbang }) {
  const [soal, setSoal] = useState<Soal[]>([]);
  const [jawaban, setJawaban] = useState<Record<string, number>>({});
  const [halaman, setHalaman] = useState(0);
  const [durasi, setDurasi] = useState(0);
  const [mulai, setMulai] = useState(0);
  const [sisa, setSisa] = useState(0);
  const [hasil, setHasil] = useState<Tampilan | null>(null);
  const [adminView, setAdminView] = useState<AdminView | null>(null);
  const [baru, setBaru] = useState(false);
  const [memuat, setMemuat] = useState(true);
  const [mengirim, setMengirim] = useState(false);
  const [galat, setGalat] = useState('');
  const [habis, setHabis] = useState(false);

  const muat = useCallback(async () => {
    setMemuat(true);
    setGalat('');
    try {
      const d = await apiClient<{
        success?: boolean;
        sudah?: boolean;
        soal?: Soal[];
        durasiMenit?: number;
        tampilan?: Tampilan | null;
        message?: string;
      }>('getSoalIq', [gerbang.wa], { onSessionInvalid: 'throw', silent: true });

      if (d.success === false) {
        setGalat(d.message || t('tes.galat_muat'));
        return;
      }
      if (d.sudah) {
        setHasil(d.tampilan || null);
        setBaru(false);
        return;
      }
      const daftar = Array.isArray(d.soal) ? d.soal : [];
      setSoal(daftar);
      setDurasi(Math.max(1, Number(d.durasiMenit) || 25) * 60);
      const draf = bacaDraf(gerbang.wa);
      setJawaban(draf.jawaban);
      setMulai(draf.mulai);
    } catch (e) {
      setGalat((e as ApiError)?.message || t('tes.galat_muat'));
    } finally {
      setMemuat(false);
    }
  }, [gerbang.wa]);

  useEffect(() => {
    void muat();
  }, [muat]);

  const kirim = useCallback(
    async (otomatis = false) => {
      if (mengirim || hasil) return;
      setMengirim(true);
      setGalat('');
      const durasiDetik = durasi > 0 ? Math.max(0, durasi - sisa) : 0;
      try {
        const d = await apiClient<{
          success?: boolean;
          sudah?: boolean;
          tampilan?: Tampilan | null;
          admin?: AdminView;
          message?: string;
        }>(
          'simpanHasilIq',
          /* `uji` dikirim hanya bila sesi memang admin; server memeriksa ulang
             dengan `requireAdmin`, jadi siswa tidak bisa memakainya untuk
             melihat hasil tanpa memakai kesempatan satu-satunya. */
          [{ wa: gerbang.wa, jawaban, durasiDetik, uji: gerbang.uji }],
          { onSessionInvalid: 'throw', silent: true },
        );
        if (d.success === false) {
          if (d.sudah) {
            await muat();
            return;
          }
          setGalat(d.message || t('tes.galat_simpan'));
          return;
        }
        setHasil(d.tampilan || null);
        setBaru(true);
        if (d.admin) setAdminView(d.admin);
        try {
          localStorage.removeItem(kunciDraf(gerbang.wa));
        } catch {
          /* mode privat: draf tidak bisa dihapus, tidak fatal */
        }
      } catch (e) {
        setGalat((e as ApiError)?.message || t('tes.galat_simpan'));
      } finally {
        setMengirim(false);
        if (otomatis) setHabis(true);
      }
    },
    [durasi, gerbang.uji, gerbang.wa, hasil, jawaban, mengirim, muat, sisa],
  );

  /* Timer memakai `ref` supaya interval tidak perlu dipasang ulang tiap detik
     hanya karena `kirim` berubah identitas. */
  const kirimRef = useRef(kirim);
  kirimRef.current = kirim;

  useEffect(() => {
    if (!soal.length || hasil || !durasi) return;
    /* Jam mulai disimpan di draf. Kalau tidak ada (kunjungan pertama), mulai
       sekarang dan simpan — refresh berikutnya melanjutkan sisa waktunya. */
    const awal = mulai || Date.now();
    if (!mulai) {
      setMulai(awal);
      try {
        localStorage.setItem(kunciDraf(gerbang.wa), JSON.stringify({ j: jawaban, m: awal }));
      } catch {
        /* mode privat: waktu tetap jalan di layar, hanya tidak bertahan */
      }
    }
    const detak = () => {
      const lewat = Math.floor((Date.now() - awal) / 1000);
      const s = Math.max(0, durasi - lewat);
      setSisa(s);
      if (s === 0) void kirimRef.current(true);
    };
    detak();
    const id = setInterval(detak, 1000);
    return () => clearInterval(id);
  }, [durasi, gerbang.wa, hasil, jawaban, mulai, soal.length]);

  const pilih = (id: string, nilai: number) => {
    const baru = { ...jawaban, [id]: nilai };
    setJawaban(baru);
    try {
      localStorage.setItem(kunciDraf(gerbang.wa), JSON.stringify({ j: baru, m: mulai || Date.now() }));
    } catch {
      /* tidak fatal */
    }
  };

  if (galat && !soal.length) {
    return (
      <section class="mx-auto my-8 max-w-md rounded-card border border-line bg-surface p-6 text-center">
        <p data-testid="iq-galat" class="mb-4 text-sm text-accent-red">{galat}</p>
        <button
          type="button"
          onClick={() => void muat()}
          class="min-h-11 rounded-control bg-accent-sky px-5 text-sm font-bold text-canvas"
        >
          {t('tes.coba_lagi')}
        </button>
      </section>
    );
  }

  if (hasil) return <KartuHasil tampilan={hasil} baru={baru} admin={adminView} />;

  if (memuat || !soal.length) {
    return <p class="mx-auto my-8 max-w-md text-center text-sm text-fg-muted">{t('tes.memuat')}</p>;
  }

  const totalHalaman = Math.ceil(soal.length / PER_HALAMAN);
  const soalHalaman = soal.slice(halaman * PER_HALAMAN, (halaman + 1) * PER_HALAMAN);
  const terjawab = Object.keys(jawaban).length;
  const menit = Math.floor(sisa / 60);
  const detik = sisa % 60;

  return (
    <div class="rounded-card border border-line bg-surface p-4 sm:p-6">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3 text-[11.5px] font-bold">
        <span class="text-fg">
          {t('tes.halaman')} {halaman + 1} / {totalHalaman} · {terjawab}/{soal.length}
        </span>
        <span data-testid="iq-sisa" class={`tabular-nums ${sisa <= 60 ? 'text-accent-red' : 'text-accent-sky'}`}>
          {t('tes.iq_sisa')} {menit}:{String(detik).padStart(2, '0')}
        </span>
      </div>

      {habis && (
        <p class="mb-3 rounded-control border border-accent-amber/40 bg-accent-amber/10 px-3 py-2 text-[11.5px] text-fg">
          {t('tes.iq_waktu_habis')}
        </p>
      )}

      <div class="space-y-5">
        {soalHalaman.map((s, i) => (
          <section key={s.id}>
            <p class="mb-1 text-[10.5px] font-bold uppercase tracking-wide text-fg-muted">
              {halaman * PER_HALAMAN + i + 1} · {t(`tes.iq_${s.kategori}`)}
            </p>
            <p class="mb-2 text-[13.5px] font-bold leading-snug text-fg">{s.tanya}</p>
            {s.svg && (
              <div
                class="mb-2 overflow-hidden rounded-control border border-line bg-surface-sunken p-2 [&_svg]:h-auto [&_svg]:w-full"
                dangerouslySetInnerHTML={{ __html: s.svg }}
              />
            )}
            <div class="grid gap-1.5">
              {s.pilihan.map((p, idx) => {
                const dipilih = jawaban[s.id] === idx;
                return (
                  <button
                    key={`${s.id}-${idx}`}
                    type="button"
                    aria-pressed={dipilih}
                    onClick={() => pilih(s.id, idx)}
                    class={`flex min-h-11 items-center gap-2 rounded-control border px-3 py-2 text-left text-[12.5px] transition ${
                      dipilih
                        ? 'border-accent-sky bg-accent-sky/15 font-bold text-fg'
                        : 'border-line bg-surface-raised text-fg hover:border-accent-sky/60'
                    }`}
                  >
                    <span class="shrink-0 font-black text-fg-muted">{String.fromCharCode(65 + idx)}</span>
                    <span>{p}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {galat && <p class="mt-3 text-[12px] text-accent-red">{galat}</p>}

      <div class="mt-5 flex items-center justify-between gap-2 border-t border-line pt-4">
        <button
          type="button"
          disabled={halaman === 0}
          onClick={() => setHalaman((h) => Math.max(0, h - 1))}
          class="min-h-11 rounded-control border border-line px-4 text-[12px] font-bold text-fg disabled:opacity-40"
        >
          {t('tes.iq_sebelumnya')}
        </button>

        {halaman < totalHalaman - 1 ? (
          <button
            type="button"
            onClick={() => setHalaman((h) => Math.min(totalHalaman - 1, h + 1))}
            class="min-h-11 rounded-control bg-accent-sky px-5 text-[12px] font-bold text-canvas"
          >
            {t('tes.iq_berikutnya')}
          </button>
        ) : (
          <button
            type="button"
            disabled={mengirim}
            onClick={() => void kirim()}
            class="min-h-11 rounded-control bg-accent-emerald px-5 text-[12px] font-bold text-canvas disabled:opacity-60"
          >
            {mengirim ? '…' : t('tes.iq_kirim')}
          </button>
        )}
      </div>
    </div>
  );
}

export default function IqTest() {
  const gerbang = useGerbangTes('iq');
  return (
    <IsiTes gerbang={gerbang} jenis="iq">
      <Isi gerbang={gerbang} />
    </IsiTes>
  );
}
