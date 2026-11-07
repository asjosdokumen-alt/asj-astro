/**
 * MataTest.tsx — Tes Mata Pra-MCU (`/tes-mata`).
 *
 * DUA TAHAP, dan urutannya tidak boleh dibalik:
 *   1. Ishihara — 12 plate, 5 detik per plate, plate 1 sebagai kontrol.
 *   2. Landolt C — kalibrasi KTP dulu, baru ketajaman per mata.
 *
 * KENAPA KALIBRASI SEBELUM LANDOLT, BUKAN SEBELUM ISHIHARA
 * -------------------------------------------------------
 * Ishihara mengukur HUE, bukan ukuran. Kalibrasi milimeter tidak mengubah
 * plate sedikit pun, jadi memintanya di awal hanya menambah satu langkah
 * sebelum siswa melihat apa pun. Landolt sebaliknya: tanpa `pxPerMm` yang
 * benar, angka visusnya karangan.
 *
 * KENAPA HASIL DIKIRIM SETELAH KEDUA MATA
 * ---------------------------------------
 * Satu baris per siswa (constraint DB). Mengirim per mata berarti kiriman
 * kedua ditolak, dan mata kiri hilang.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { apiClient, type ApiError } from '../../../lib/apiClient';
import { t } from '../../../store/i18n';
import {
  ARAH_ASTIG,
  PLATE_ISHIHARA,
  TINGKAT_KONTRAS,
  TINGKAT_VISUS,
  evaluasiIshihara,
  simpulkanAstig,
  simpulkanKontras,
  simpulkanVisus,
  ukuranLandolt,
  type ArahKontras,
  type ArahLandolt,
  type HasilAstig,
  type HasilIshihara,
  type JawabanPlate,
} from '../../../lib/tesSeleksi';
import { gambarPlate } from '../../../lib/ishiharaCanvas';
import { IsiTes, useGerbangTes, type HasilTersimpan } from './GerbangTes';

type Fase = 'intro' | 'ishihara' | 'jeda' | 'kalibrasi' | 'landolt' | 'kontras' | 'astig' | 'hasil';
type Mata = 'KANAN' | 'KIRI';

const DETIK_PLATE = 5;
const LEBAR_KTP_MM = 85.6;
const TINGGI_KTP_MM = 53.98;
const ARAH: ArahLandolt[] = [
  'ATAS_KIRI',
  'ATAS',
  'ATAS_KANAN',
  'KIRI',
  'KANAN',
  'BAWAH_KIRI',
  'BAWAH',
  'BAWAH_KANAN',
];
const ARAH_KONTRAS: ArahKontras[] = ['ATAS', 'KIRI', 'KANAN', 'BAWAH'];
/** Rotasi SVG untuk memindahkan celah dari 3 o'clock ke arah yang diminta. */
const ROTASI: Record<ArahLandolt, number> = {
  KANAN: 0,
  BAWAH_KANAN: 45,
  BAWAH: 90,
  BAWAH_KIRI: 135,
  KIRI: 180,
  ATAS_KIRI: 225,
  ATAS: 270,
  ATAS_KANAN: 315,
};

interface HasilMata {
  ishihara: { skor: number; total: number; status: string; label: string };
  visus: { kanan: number; kiri: number };
  /** Opsional: hasil lama (sebelum 2026-11-08) tidak punya dua blok ini. */
  kontras?: { kanan: number; kiri: number; terendah: number; label: string };
  astig?: HasilAstig;
}

function angkaVisus(v: number): string {
  return v > 0 ? v.toFixed(1) : '< 0,1';
}

/**
 * Penanda tahap. Dulu tiap layar hanya punya hitungannya sendiri ("Plate 3/12",
 * "1/3"), sehingga di tengah tes siswa tidak tahu ini tahap berapa dari berapa.
 */
function Tahap({ n, label }: { n: number; label: string }) {
  return (
    <p class="mb-2 flex flex-wrap items-center gap-2 text-[10.5px] font-black uppercase tracking-wide text-fg-muted">
      <span class="rounded-full bg-surface-sunken px-2 py-0.5">
        {t('tes.mata_tahap')} {n}/4
      </span>
      <span class="text-accent-sky">{label}</span>
    </p>
  );
}

/** Kartu hasil — dipakai hasil baru maupun yang sudah tersimpan. */
function KartuHasil({ hasil, baru, catatan }: { hasil: HasilMata; baru: boolean; catatan?: string }) {
  const v = simpulkanVisus(hasil.visus.kanan, hasil.visus.kiri);
  const normal = hasil.ishihara.status === 'NORMAL';
  return (
    <div class="space-y-4">
      <section class="rounded-card border border-line bg-surface p-5">
        <p class="mb-1 text-[11px] font-bold uppercase tracking-wide text-accent-sky">
          {baru ? t('tes.mata_hasil_baru') : t('tes.sudah_label')}
        </p>
        <h2 class="text-xl font-black text-fg">{t('tes.mata_judul')}</h2>
      </section>

      <div class="grid gap-3 sm:grid-cols-2">
        <section class="rounded-card border border-line bg-surface p-4">
          <h3 class="mb-2 text-[12px] font-bold uppercase tracking-wide text-fg-muted">{t('tes.mata_ishihara')}</h3>
          <p
            class={`inline-block rounded-control px-2.5 py-1 text-[12px] font-bold ${
              normal
                ? 'border border-accent-emerald/40 bg-accent-emerald/10 text-accent-emerald'
                : 'border border-accent-amber/40 bg-accent-amber/10 text-accent-amber'
            }`}
          >
            {hasil.ishihara.label}
          </p>
          <p class="mt-2 text-[12.5px] text-fg">
            {hasil.ishihara.skor} / {hasil.ishihara.total} {t('tes.mata_plate_benar')}
          </p>
        </section>

        <section class="rounded-card border border-line bg-surface p-4">
          <h3 class="mb-2 text-[12px] font-bold uppercase tracking-wide text-fg-muted">{t('tes.mata_visus')}</h3>
          <div class="flex gap-6">
            <div>
              <p class="text-[11px] text-fg-muted">OD · {t('tes.mata_kanan')}</p>
              <p class="text-2xl font-black text-accent-sky">{angkaVisus(hasil.visus.kanan)}</p>
            </div>
            <div>
              <p class="text-[11px] text-fg-muted">OS · {t('tes.mata_kiri')}</p>
              <p class="text-2xl font-black text-accent-sky">{angkaVisus(hasil.visus.kiri)}</p>
            </div>
          </div>
          <p class="mt-2 text-[11.5px] leading-relaxed text-fg-muted">{v.catatan}</p>
        </section>

        {hasil.kontras && (
          <section class="rounded-card border border-line bg-surface p-4">
            <h3 class="mb-2 text-[12px] font-bold uppercase tracking-wide text-fg-muted">
              {t('tes.mata_kontras')}
            </h3>
            <p class="text-2xl font-black text-accent-sky">
              {Math.round(hasil.kontras.terendah * 100)}%
            </p>
            <p class="mt-1 text-[11.5px] leading-relaxed text-fg-muted">{hasil.kontras.label}</p>
          </section>
        )}

        {hasil.astig && (
          <section class="rounded-card border border-line bg-surface p-4">
            <h3 class="mb-2 text-[12px] font-bold uppercase tracking-wide text-fg-muted">
              {t('tes.mata_astig')}
            </h3>
            <p
              class={`inline-block rounded-control px-2.5 py-1 text-[12px] font-bold ${
                hasil.astig.indikasi
                  ? 'border border-accent-amber/40 bg-accent-amber/10 text-accent-amber'
                  : 'border border-accent-emerald/40 bg-accent-emerald/10 text-accent-emerald'
              }`}
            >
              {hasil.astig.indikasi ? t('tes.mata_astig_perlu') : t('tes.mata_astig_normal')}
            </p>
            <p class="mt-2 text-[11.5px] leading-relaxed text-fg-muted">{hasil.astig.catatan}</p>
          </section>
        )}
      </div>

      <p class="rounded-control border border-line bg-surface-sunken px-3 py-2 text-[11.5px] leading-relaxed text-fg-muted">
        {t('tes.mata_catatan')}
      </p>
      {catatan && (
        <p class="rounded-control border border-accent-amber/40 bg-accent-amber/10 px-3 py-2 text-[11.5px] leading-relaxed text-fg">
          {catatan}
        </p>
      )}
    </div>
  );
}

function Isi({ gerbang }: { gerbang: ReturnType<typeof useGerbangTes> }) {
  const [fase, setFase] = useState<Fase>('intro');

  /* Ishihara */
  const [plateIdx, setPlateIdx] = useState(0);
  const [sisa, setSisa] = useState(DETIK_PLATE);
  const [masukan, setMasukan] = useState('');
  const [jawaban, setJawaban] = useState<JawabanPlate[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  /* Kalibrasi & Landolt */
  const [lebarKtp, setLebarKtp] = useState(290);
  const [jarak, setJarak] = useState<0.5 | 1>(0.5);
  const [mata, setMata] = useState<Mata>('KANAN');
  const [level, setLevel] = useState(0);
  const [percobaan, setPercobaan] = useState(0);
  const [benarLevel, setBenarLevel] = useState(0);
  const [arah, setArah] = useState<ArahLandolt>('KANAN');
  const [visus, setVisus] = useState({ kanan: 0, kiri: 0 });

  /* Kontras: skor = kontras TERENDAH yang masih terbaca, per mata. */
  const [kontrasMata, setKontrasMata] = useState<Mata>('KANAN');
  const [kontrasIdx, setKontrasIdx] = useState(0);
  const [kontrasSkor, setKontrasSkor] = useState({ kanan: 0, kiri: 0 });
  const [arahKontras, setArahKontras] = useState<ArahKontras>('KANAN');

  /* Astigmatisme: arah garis yang tampak paling tebal; '' = semua sama. */
  const [astigMata, setAstigMata] = useState<Mata>('KANAN');
  const [astigPilih, setAstigPilih] = useState({ kanan: '', kiri: '' });

  const [hasil, setHasil] = useState<HasilMata | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);
  const [galat, setGalat] = useState('');
  const [catatanCv, setCatatanCv] = useState('');

  /* Sudah pernah mengerjakan: tampilkan yang tersimpan. */
  if (gerbang.tersimpan && !hasil) {
    const h = gerbang.tersimpan.hasil as unknown as HasilMata;
    if (h?.ishihara && h?.visus) return <KartuHasil hasil={h} baru={false} />;
  }
  if (hasil) return <KartuHasil hasil={hasil} baru catatan={catatanCv} />;

  const plate = PLATE_ISHIHARA[plateIdx];

  /* ── gambar plate ─────────────────────────────────────────────────────── */
  useEffect(() => {
    if (fase !== 'ishihara' || !canvasRef.current) return;
    gambarPlate(canvasRef.current, PLATE_ISHIHARA[plateIdx]);
  }, [fase, plateIdx]);

  const kirimPlate = (teks: string) => {
    const isi = (teks || '').trim().toUpperCase() || 'TIDAK ADA';
    const baru = [...jawaban, { no: plate.no, jawaban: isi }];
    setJawaban(baru);
    setMasukan('');
    if (plateIdx + 1 < PLATE_ISHIHARA.length) {
      setPlateIdx((i) => i + 1);
      setSisa(DETIK_PLATE);
    } else {
      /* Jeda sejenak: lompatan langsung dari plate terakhir ke layar kalibrasi
         terbaca seperti halaman yang berubah sendiri. */
      setFase('jeda');
    }
  };
  const kirimRef = useRef(kirimPlate);
  kirimRef.current = kirimPlate;

  /* ── timer 5 detik ────────────────────────────────────────────────────── */
  useEffect(() => {
    if (fase !== 'ishihara') return;
    if (sisa <= 0) {
      kirimRef.current('TIDAK ADA');
      return;
    }
    const id = setTimeout(() => setSisa((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [fase, sisa]);

  /* ── Landolt ──────────────────────────────────────────────────────────── */
  const acakArah = () => setArah(ARAH[Math.floor(Math.random() * ARAH.length)]);

  const simpanHasil = async (
    v: { kanan: number; kiri: number },
    k: { kanan: number; kiri: number },
    a: { kanan: string; kiri: string },
  ) => {
    const ish: HasilIshihara = evaluasiIshihara(jawaban);
    const kontras = simpulkanKontras(k.kanan, k.kiri);
    const astig = simpulkanAstig(a.kanan, a.kiri);
    const payload: HasilMata = {
      ishihara: { skor: ish.skor, total: ish.total, status: ish.status, label: ish.label },
      visus: v,
      kontras: { kanan: k.kanan, kiri: k.kiri, terendah: kontras.terendah, label: kontras.label },
      astig,
    };
    const ringkas = `${ish.label} · OD ${v.kanan} / OS ${v.kiri} · kontras ${Math.round(
      kontras.terendah * 100,
    )}%${astig.indikasi ? ' · astig: perlu cek' : ''}`;
    setMenyimpan(true);
    setGalat('');
    try {
      /* Mode uji admin: hasil ditampilkan, TIDAK dikirim. Sama seperti MBTI —
         satu baris per siswa, dan percobaan admin atas nama WA siswa akan
         memakai jatah satu-satunya milik siswa itu. */
      if (gerbang.uji) {
        setCatatanCv(t('tes.uji_tidak_disimpan'));
        gerbang.tandaiSelesai({
          ringkasan: ringkas,
          hasil: payload as unknown as Record<string, unknown>,
          dibuat_pada: new Date().toISOString(),
        });
        setHasil(payload);
        return;
      }
      const d = await apiClient<{
        success?: boolean;
        sudah?: boolean;
        message?: string;
        cv?: { ditulis?: string[]; dilewati?: string[] };
      }>(
        'simpanHasilTes',
        [{ wa: gerbang.wa, jenis: 'mata', hasil: payload }],
        { onSessionInvalid: 'throw', silent: true },
      );
      if (d.success === false) {
        if (d.sudah) {
          await gerbang.muat();
          return;
        }
        setGalat(d.message || t('tes.galat_simpan'));
        return;
      }
      if (d.cv?.dilewati?.length) setCatatanCv(t('tes.cv_manual_mata'));
      const tersimpan: HasilTersimpan = {
        ringkasan: ringkas,
        hasil: payload as unknown as Record<string, unknown>,
        dibuat_pada: new Date().toISOString(),
      };
      gerbang.tandaiSelesai(tersimpan);
      setHasil(payload);
    } catch (e) {
      const err = e as ApiError;
      setGalat(err?.message || t('tes.galat_simpan'));
    } finally {
      setMenyimpan(false);
    }
  };

  const selesaikanMata = (visusBaru: number) => {
    if (mata === 'KANAN') {
      setVisus((v) => ({ ...v, kanan: visusBaru }));
      setMata('KIRI');
      setLevel(0);
      setPercobaan(0);
      setBenarLevel(0);
      acakArah();
      return;
    }
    const akhir = { kanan: visus.kanan, kiri: visusBaru };
    setVisus(akhir);
    /* Lanjut ke KONTRAS, bukan langsung ke hasil. Dua saringan tambahan ini
       yang membuat tes setara lima pemeriksaan ZEISS (tanpa Amsler). */
    setKontrasMata('KANAN');
    setKontrasIdx(0);
    setArahKontras(ARAH_KONTRAS[Math.floor(Math.random() * ARAH_KONTRAS.length)]);
    setFase('kontras');
  };

  const jawabLandolt = (pilihan: ArahLandolt) => {
    const tepat = pilihan === arah;
    const benar = benarLevel + (tepat ? 1 : 0);
    const percobaanBaru = percobaan + 1;
    const target = TINGKAT_VISUS[level];

    if (benar >= 2) {
      if (level + 1 < TINGKAT_VISUS.length) {
        setLevel((l) => l + 1);
        setPercobaan(0);
        setBenarLevel(0);
        acakArah();
      } else {
        selesaikanMata(target);
      }
      return;
    }
    if (percobaanBaru >= 3) {
      selesaikanMata(target > TINGKAT_VISUS[0] ? TINGKAT_VISUS[level - 1] : 0);
      return;
    }
    setBenarLevel(benar);
    setPercobaan(percobaanBaru);
    acakArah();
  };

  const pxPerMm = lebarKtp / LEBAR_KTP_MM;
  const ukuran = ukuranLandolt(TINGKAT_VISUS[level], jarak, pxPerMm);

  /**
   * Kontras: satu percobaan per tingkat, berhenti pada tingkat pertama yang
   * salah. Skor = tingkat TERAKHIR yang benar — bukan rata-rata, karena yang
   * diukur adalah batas, bukan ketepatan.
   */
  const jawabKontras = (pilih: ArahKontras) => {
    const tepat = pilih === arahKontras;
    const skorBaru = tepat ? TINGKAT_KONTRAS[kontrasIdx] : kontrasIdx > 0 ? TINGKAT_KONTRAS[kontrasIdx - 1] : 0;
    const kunciMata = kontrasMata === 'KANAN' ? 'kanan' : 'kiri';
    const nilai = { ...kontrasSkor, [kunciMata]: skorBaru };

    if (!tepat || kontrasIdx + 1 >= TINGKAT_KONTRAS.length) {
      setKontrasSkor(nilai);
      if (kontrasMata === 'KANAN') {
        setKontrasMata('KIRI');
        setKontrasIdx(0);
        setArahKontras(ARAH_KONTRAS[Math.floor(Math.random() * ARAH_KONTRAS.length)]);
        return;
      }
      setAstigMata('KANAN');
      setFase('astig');
      return;
    }
    setKontrasSkor(nilai);
    setKontrasIdx((i) => i + 1);
    setArahKontras(ARAH_KONTRAS[Math.floor(Math.random() * ARAH_KONTRAS.length)]);
  };

  const jawabAstig = (arah: string) => {
    const baru = { ...astigPilih, [astigMata === 'KANAN' ? 'kanan' : 'kiri']: arah };
    setAstigPilih(baru);
    if (astigMata === 'KANAN') {
      setAstigMata('KIRI');
      return;
    }
    setFase('hasil');
    void simpanHasil(visus, kontrasSkor, baru);
  };

  /* ── INTRO ────────────────────────────────────────────────────────────── */
  if (fase === 'intro') {
    return (
      <div class="space-y-4">
        <section class="rounded-card border border-accent-amber/40 bg-accent-amber/10 p-4">
          <h2 class="mb-1.5 text-[12.5px] font-black text-accent-amber">{t('tes.mata_intro_syarat_judul')}</h2>
          <ul class="list-disc space-y-1 pl-5 text-[12px] leading-relaxed text-fg">
            <li>{t('tes.mata_intro_syarat_1')}</li>
            <li>{t('tes.mata_intro_syarat_2')}</li>
            <li>{t('tes.mata_intro_syarat_3')}</li>
          </ul>
        </section>
        <section class="rounded-card border border-line bg-surface p-4">
          <h3 class="mb-1 text-sm font-bold text-fg">{t('tes.mata_intro_alur')}</h3>
          <p class="text-[12px] leading-relaxed text-fg-muted">{t('tes.mata_intro_alur_isi')}</p>
        </section>
        <button
          type="button"
          onClick={() => {
            setPlateIdx(0);
            setJawaban([]);
            setMasukan('');
            setSisa(DETIK_PLATE);
            setFase('ishihara');
          }}
          class="min-h-11 w-full rounded-control bg-accent-sky px-5 text-sm font-bold text-canvas"
        >
          {t('tes.mata_mulai_ishihara')}
        </button>
      </div>
    );
  }

  /* ── ISHIHARA ─────────────────────────────────────────────────────────── */
  if (fase === 'ishihara') {
    return (
      <div class="flex flex-col items-center rounded-card border border-line bg-surface p-4 sm:p-6">
        <Tahap n={1} label={t('tes.mata_ishihara')} />
        <div class="mb-3 flex w-full flex-wrap items-center justify-between gap-2 text-[11.5px] font-bold text-fg">
          <span>
            {t('tes.mata_plate')} {plateIdx + 1} / {PLATE_ISHIHARA.length}
          </span>
          <span
            class={`rounded-full px-2.5 py-0.5 ${
              sisa <= 2 ? 'bg-accent-red/15 text-accent-red' : 'bg-surface-sunken text-fg-muted'
            }`}
          >
            {t('tes.mata_sisa')} {sisa}s
          </span>
        </div>

        <canvas
          ref={canvasRef}
          width={280}
          height={280}
          aria-label={t('tes.mata_plate_alt')}
          class="rounded-card border border-line bg-white"
        />

        <div class="mt-4 w-full max-w-xs space-y-2.5">
          <label for="tes-mata-jawab" class="block text-[11px] font-bold text-fg-muted">
            {t('tes.mata_ketik_angka')}
          </label>
          <input
            id="tes-mata-jawab"
            type="text"
            inputMode="numeric"
            autocomplete="off"
            value={masukan}
            onInput={(e) => setMasukan((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if ((e as KeyboardEvent).key === 'Enter') kirimPlate(masukan);
            }}
            class="min-h-11 w-full rounded-control border-2 border-line bg-surface-sunken px-3 text-center text-lg font-black text-fg focus:border-accent-sky focus:outline-none"
          />
          <div class="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => kirimPlate('TIDAK ADA')}
              class="min-h-11 rounded-control border border-line px-2 text-[11.5px] font-bold text-fg-muted hover:text-fg"
            >
              {t('tes.mata_tidak_ada')}
            </button>
            <button
              type="button"
              onClick={() => kirimPlate(masukan)}
              class="min-h-11 rounded-control bg-accent-sky px-2 text-[11.5px] font-bold text-canvas"
            >
              {t('tes.mata_jawab')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── JEDA SETELAH TAHAP 1 ─────────────────────────────────────────────── */
  if (fase === 'jeda') {
    return (
      <div class="space-y-3 rounded-card border border-accent-emerald/40 bg-accent-emerald/5 p-5 text-center">
        <p class="text-[10.5px] font-black uppercase tracking-wide text-accent-emerald">
          {t('tes.mata_tahap_selesai')}
        </p>
        <h2 class="text-lg font-black text-fg">{t('tes.mata_tahap1_judul')}</h2>
        <p class="text-[12px] leading-relaxed text-fg-muted">{t('tes.mata_tahap1_isi')}</p>
        <button
          type="button"
          onClick={() => setFase('kalibrasi')}
          class="min-h-11 w-full rounded-control bg-accent-emerald px-5 text-sm font-bold text-canvas"
        >
          {t('tes.mata_lanjut_kalibrasi')}
        </button>
      </div>
    );
  }

  /* ── KALIBRASI ────────────────────────────────────────────────────────── */
  if (fase === 'kalibrasi') {
    return (
      <div class="space-y-4 rounded-card border border-line bg-surface p-4 sm:p-6">
        <Tahap n={2} label={t('tes.mata_visus')} />
        <h2 class="text-base font-black text-fg">{t('tes.mata_kalibrasi_judul')}</h2>
        <p class="text-[12px] leading-relaxed text-fg-muted">{t('tes.mata_kalibrasi_isi')}</p>

        <div class="flex flex-col items-center rounded-card border border-line bg-surface-sunken py-5">
          <div
            style={{ width: `${lebarKtp}px`, height: `${Math.round((lebarKtp * TINGGI_KTP_MM) / LEBAR_KTP_MM)}px` }}
            class="flex flex-col items-center justify-center rounded-control bg-accent-sky p-2 text-canvas transition-all"
          >
            <span class="text-[10px] font-black uppercase tracking-wide">{t('tes.mata_kalibrasi_kotak')}</span>
            <span class="mt-0.5 text-[10px] opacity-80">
              {lebarKtp} px · {pxPerMm.toFixed(2)} px/mm
            </span>
          </div>
          <input
            type="range"
            min={180}
            max={480}
            value={lebarKtp}
            onInput={(e) => setLebarKtp(Number((e.target as HTMLInputElement).value) || 290)}
            aria-label={t('tes.mata_kalibrasi_slider')}
            class="mt-5 w-full max-w-sm accent-sky"
          />
        </div>

        <div class="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            aria-pressed={jarak === 0.5}
            onClick={() => setJarak(0.5)}
            class={`min-h-11 rounded-control border px-3 text-left text-[12px] font-bold ${
              jarak === 0.5 ? 'border-accent-sky bg-accent-sky/10 text-fg' : 'border-line text-fg-muted'
            }`}
          >
            {t('tes.mata_jarak_hp')}
          </button>
          <button
            type="button"
            aria-pressed={jarak === 1}
            onClick={() => setJarak(1)}
            class={`min-h-11 rounded-control border px-3 text-left text-[12px] font-bold ${
              jarak === 1 ? 'border-accent-sky bg-accent-sky/10 text-fg' : 'border-line text-fg-muted'
            }`}
          >
            {t('tes.mata_jarak_pc')}
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            setMata('KANAN');
            setLevel(0);
            setPercobaan(0);
            setBenarLevel(0);
            acakArah();
            setFase('landolt');
          }}
          class="min-h-11 w-full rounded-control bg-accent-emerald px-5 text-sm font-bold text-canvas"
        >
          {t('tes.mata_mulai_landolt')}
        </button>
      </div>
    );
  }

  /* ── LANDOLT ──────────────────────────────────────────────────────────── */
  if (fase === 'landolt') {
    const d = ukuran.diameterPx;
    const tebal = ukuran.tebalPx;
    const celah = ukuran.celahPx;
    const keliling = Math.PI * Math.max(0.01, d - tebal);
    const kotak = Math.max(56, Math.ceil(d + 32));
    return (
      <div class="flex flex-col items-center rounded-card border border-line bg-surface p-4 sm:p-6">
        <Tahap n={2} label={t('tes.mata_visus')} />
        <div class="mb-3 w-full rounded-control bg-surface-sunken p-2.5 text-[11.5px] font-bold text-fg">
          <div class="flex flex-wrap items-center justify-between gap-1">
            <span>
              {mata === 'KANAN' ? t('tes.mata_tutup_kiri') : t('tes.mata_tutup_kanan')}
            </span>
            <span class="text-accent-sky">
              {t('tes.mata_target')} {TINGKAT_VISUS[level].toFixed(1)} · {jarak * 100} cm
            </span>
          </div>
        </div>

        <div
          class="my-2 flex items-center justify-center rounded-card border border-line bg-white"
          style={{ width: `${kotak}px`, height: `${kotak}px` }}
        >
          <svg
            width={d}
            height={d}
            viewBox={`0 0 ${d} ${d}`}
            role="img"
            aria-label={t('tes.mata_cincin_alt')}
            class="text-slate-900"
          >
            <circle
              cx={d / 2}
              cy={d / 2}
              r={Math.max(0.2, (d - tebal) / 2)}
              fill="none"
              stroke="currentColor"
              stroke-width={tebal}
              stroke-dasharray={`${Math.max(0.1, keliling - celah)} ${celah}`}
              transform={`rotate(${ROTASI[arah]} ${d / 2} ${d / 2})`}
            />
          </svg>
        </div>

        {ukuran.terlaluKecil && (
          <p class="mb-2 rounded-control border border-accent-amber/40 bg-accent-amber/10 px-2.5 py-1.5 text-[11px] leading-snug text-fg">
            {t('tes.mata_terlalu_kecil')}
          </p>
        )}

        <p class="mb-2 text-[11px] text-fg-muted">{t('tes.mata_mengecil')}</p>
        <p class="mb-2 text-[11px] text-fg-muted">{t('tes.mata_pilih_arah')}</p>

        {/* 3×3: delapan arah mengelilingi penghitung percobaan. Tombol diagonal
            sengaja tetap ada — tanpa itu, celah diagonal hanya bisa ditebak
            sebagai "atas" atau "kanan", dan skornya jadi karangan. */}
        <div class="grid w-64 grid-cols-3 gap-2">
          <button type="button" aria-label={t('tes.mata_atas_kiri')} onClick={() => jawabLandolt('ATAS_KIRI')} class="min-h-11 rounded-control bg-slate-900 text-[13px] font-bold text-white">
            ↖
          </button>
          <button type="button" onClick={() => jawabLandolt('ATAS')} class="min-h-11 rounded-control bg-slate-900 text-[11px] font-bold text-white">
            ▲ {t('tes.mata_atas')}
          </button>
          <button type="button" aria-label={t('tes.mata_atas_kanan')} onClick={() => jawabLandolt('ATAS_KANAN')} class="min-h-11 rounded-control bg-slate-900 text-[13px] font-bold text-white">
            ↗
          </button>
          <button type="button" onClick={() => jawabLandolt('KIRI')} class="min-h-11 rounded-control bg-slate-900 text-[11px] font-bold text-white">
            ◀ {t('tes.mata_kiri_arah')}
          </button>
          <div class="flex items-center justify-center text-[11px] font-bold text-fg-muted">
            {percobaan + 1}/3
          </div>
          <button type="button" onClick={() => jawabLandolt('KANAN')} class="min-h-11 rounded-control bg-slate-900 text-[11px] font-bold text-white">
            {t('tes.mata_kanan_arah')} ▶
          </button>
          <button type="button" aria-label={t('tes.mata_bawah_kiri')} onClick={() => jawabLandolt('BAWAH_KIRI')} class="min-h-11 rounded-control bg-slate-900 text-[13px] font-bold text-white">
            ↙
          </button>
          <button type="button" onClick={() => jawabLandolt('BAWAH')} class="min-h-11 rounded-control bg-slate-900 text-[11px] font-bold text-white">
            ▼ {t('tes.mata_bawah')}
          </button>
          <button type="button" aria-label={t('tes.mata_bawah_kanan')} onClick={() => jawabLandolt('BAWAH_KANAN')} class="min-h-11 rounded-control bg-slate-900 text-[13px] font-bold text-white">
            ↘
          </button>
        </div>
      </div>
    );
  }

  /* ── KONTRAS ──────────────────────────────────────────────────────────── */
  if (fase === 'kontras') {
    const nilai = TINGKAT_KONTRAS[kontrasIdx];
    const abu = Math.round(255 * (1 - nilai));
    const uk = ukuranLandolt(1.0, jarak, pxPerMm);
    const d = uk.diameterPx;
    const tebal = uk.tebalPx;
    const keliling = Math.PI * Math.max(0.01, d - tebal);
    const kotak = Math.max(56, Math.ceil(d + 32));
    return (
      <div class="flex flex-col items-center rounded-card border border-line bg-surface p-4 sm:p-6">
        <Tahap n={3} label={t("tes.mata_kontras")} />
        <div class="mb-2 w-full rounded-control bg-surface-sunken p-2.5 text-[11.5px] font-bold text-fg">
          <div class="flex flex-wrap items-center justify-between gap-1">
            <span>{kontrasMata === 'KANAN' ? t('tes.mata_tutup_kiri') : t('tes.mata_tutup_kanan')}</span>
            <span class="text-accent-sky">
              {t('tes.mata_tahap_kontras')} {kontrasIdx + 1}/{TINGKAT_KONTRAS.length} · {jarak * 100} cm
            </span>
          </div>
        </div>
        <p class="mb-2 text-center text-[11.5px] leading-snug text-fg-muted">{t('tes.mata_kontras_ket')}</p>

        <div
          class="my-2 flex items-center justify-center rounded-card border border-line bg-white"
          style={{ width: `${kotak}px`, height: `${kotak}px` }}
        >
          <svg width={d} height={d} viewBox={`0 0 ${d} ${d}`} role="img" aria-label={t('tes.mata_cincin_alt')}>
            <circle
              cx={d / 2}
              cy={d / 2}
              r={Math.max(0.2, (d - tebal) / 2)}
              fill="none"
              stroke={`rgb(${abu},${abu},${abu})`}
              stroke-width={tebal}
              stroke-dasharray={`${Math.max(0.1, keliling - uk.celahPx)} ${uk.celahPx}`}
              transform={`rotate(${ROTASI[arahKontras]} ${d / 2} ${d / 2})`}
            />
          </svg>
        </div>

        <p class="mb-2 text-[11px] text-fg-muted">{t('tes.mata_pilih_arah')}</p>
        <div class="grid w-56 grid-cols-3 gap-2">
          <div />
          <button type="button" onClick={() => jawabKontras('ATAS')} class="min-h-11 rounded-control bg-slate-900 text-[11px] font-bold text-white">
            ▲ {t('tes.mata_atas')}
          </button>
          <div />
          <button type="button" onClick={() => jawabKontras('KIRI')} class="min-h-11 rounded-control bg-slate-900 text-[11px] font-bold text-white">
            ◀ {t('tes.mata_kiri_arah')}
          </button>
          <div class="flex items-center justify-center text-[11px] font-bold text-fg-muted">
            {Math.round(nilai * 100)}%
          </div>
          <button type="button" onClick={() => jawabKontras('KANAN')} class="min-h-11 rounded-control bg-slate-900 text-[11px] font-bold text-white">
            {t('tes.mata_kanan_arah')} ▶
          </button>
          <div />
          <button type="button" onClick={() => jawabKontras('BAWAH')} class="min-h-11 rounded-control bg-slate-900 text-[11px] font-bold text-white">
            ▼ {t('tes.mata_bawah')}
          </button>
          <div />
        </div>
        <button
          type="button"
          onClick={() => jawabKontras('ATAS')}
          class="mt-3 min-h-11 w-full rounded-control border border-line text-[11.5px] font-bold text-fg-muted"
        >
          {t('tes.mata_tidak_yakin')}
        </button>
      </div>
    );
  }

  /* ── ASTIGMATISME ─────────────────────────────────────────────────────── */
  if (fase === 'astig') {
    const pilihan: { nilai: string; label: string }[] = [
      { nilai: '0', label: t('tes.mata_astig_12') },
      { nilai: '30', label: t('tes.mata_astig_1') },
      { nilai: '60', label: t('tes.mata_astig_2') },
      { nilai: '90', label: t('tes.mata_astig_3') },
      { nilai: '120', label: t('tes.mata_astig_4') },
      { nilai: '150', label: t('tes.mata_astig_5') },
    ];
    return (
      <div class="space-y-3 rounded-card border border-line bg-surface p-4 sm:p-6">
        <Tahap n={4} label={t("tes.mata_astig")} />
        <div class="rounded-control bg-surface-sunken p-2.5 text-[11.5px] font-bold text-fg">
          {astigMata === 'KANAN' ? t('tes.mata_tutup_kiri') : t('tes.mata_tutup_kanan')} ·{' '}
          <span class="text-accent-sky">{t('tes.mata_tahap_astig')}</span>
        </div>
        <p class="text-[12px] leading-relaxed text-fg-muted">{t('tes.mata_astig_ket')}</p>

        <div class="mx-auto w-full max-w-[260px] rounded-card border border-line bg-white p-2">
          <svg viewBox="0 0 240 240" class="h-auto w-full" role="img" aria-label={t('tes.mata_astig_alt')}>
            {ARAH_ASTIG.map((deg) => (
              <line
                key={deg}
                x1="120"
                y1="14"
                x2="120"
                y2="226"
                stroke="#0f172a"
                stroke-width="7"
                stroke-linecap="round"
                transform={`rotate(${deg} 120 120)`}
              />
            ))}
            <circle cx="120" cy="120" r="4" fill="#0f172a" />
          </svg>
        </div>

        <p class="text-[11.5px] font-bold text-fg">{t('tes.mata_astig_tanya')}</p>
        <div class="grid grid-cols-2 gap-2">
          {pilihan.map((p) => (
            <button
              key={p.nilai}
              type="button"
              onClick={() => jawabAstig(p.nilai)}
              class="min-h-11 rounded-control border border-line bg-surface-raised px-2 text-[11.5px] font-bold text-fg hover:border-accent-sky"
            >
              {p.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => jawabAstig('')}
          class="min-h-11 w-full rounded-control border border-accent-emerald/50 bg-accent-emerald/10 px-3 text-[12px] font-bold text-fg"
        >
          {t('tes.mata_astig_sama')}
        </button>
      </div>
    );
  }

  /* ── HASIL (menunggu simpan) ──────────────────────────────────────────── */
  return (
    <div class="mx-auto my-8 max-w-md text-center">
      {menyimpan ? (
        <p class="text-sm text-fg-muted">{t('tes.menyimpan')}</p>
      ) : (
        <>
          <p role="alert" class="mb-3 rounded-control border border-accent-red/40 bg-accent-red/10 px-3 py-2 text-[12px] text-accent-red">
            {galat || t('tes.galat_simpan')}
          </p>
          <button
            type="button"
            onClick={() => void simpanHasil(visus, kontrasSkor, astigPilih)}
            class="min-h-11 rounded-control bg-accent-sky px-5 text-sm font-bold text-canvas"
          >
            {t('tes.coba_lagi')}
          </button>
        </>
      )}
    </div>
  );
}

export default function MataTest() {
  const gerbang = useGerbangTes('mata');
  return (
    <IsiTes gerbang={gerbang} jenis="mata">
      <Isi gerbang={gerbang} />
    </IsiTes>
  );
}
