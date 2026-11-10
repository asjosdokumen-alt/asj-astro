/**
 * MatematikaGame.tsx — simulasi tes seleksi matematika & psikotes (`/matematika`).
 *
 * ASAL
 * ----
 * Ditulis ulang dari simulator mandiri milik pemilik
 * (`lpk_japan_math_selection_simulator.html`, Tailwind CDN + `<script>` inline).
 * Yang dipertahankan: empat modul, dua format (ujian berwaktu / latihan dengan
 * pembahasan), suara sintetis, konfeti, rekor, dan lembar evaluasi soal salah.
 * Yang TIDAK dipertahankan: warnanya. Berkas aslinya bertema gelap mati
 * (`bg-slate-950`, teks `slate-100`); ditempel apa adanya ke portal berarti satu
 * halaman yang mustahil dibaca di tema terang. Di sini semuanya memakai token
 * tema (`bg-surface`, `text-fg`, `text-accent-*`) sehingga kedua tema hidup.
 *
 * GERBANG
 * -------
 * Sama seperti `/wawancara`, `/ai-cv`, dan `/kotoba`: hanya siswa ASJ (tag
 * `[VIP]` atau `[KELAS xx]`). Tiga lapis, dan ketiganya perlu:
 *
 *   1. dasbor kandidat — tombolnya menolak non-siswa dengan toast (UX saja);
 *   2. halaman ini — gerbang login lalu kartu "khusus siswa" (cermin);
 *   3. server — `getBankMatematika` memakai penjaga yang SAMA dengan bank soal
 *      wawancara dan bank kosakata (`tolakKecualiSiswa`), jadi non-siswa tidak
 *      menerima satu soal cerita pun. Lapis inilah yang sebenarnya.
 *
 * KENAPA SOAL CERITA TIDAK DIHASILKAN DI SINI
 * -------------------------------------------
 * 69 soal cerita + pembahasannya datang dari server. Generator angka
 * (kraepelin/kabataku/deret/satuan/logika) ada di `lib/matematika.ts` karena
 * soal aritmetika acak tak terbatas tidak menyembunyikan apa pun — nilainya ada
 * pada pengulangan, bukan pada kerahasiaan.
 */
import { useState, useEffect, useRef } from 'preact/hooks';
import { authStore } from '../../store/authReactive';
import { bolehKirim, kirimSkor } from '../../lib/skorGame';
import { apiClient, type ApiError } from '../../lib/apiClient';
import { aktifkanSesiAudio } from '../../lib/tts';
import { validate, kandidatLoginSchema } from '../../lib/schemas';
import { t, useLang } from '../../store/i18n';
import {
  buatRonde,
  buatRondeCampur,
  jawabanBenar,
  labelJawaban,
  rekapPerDimensi,
  rekapPerKategori,
  tampilAngka,
  type BankMatematikaRes,
  type BentukFigur,
  type Figur,
  type KategoriId,
  type KesulitanPilih,
  type Soal,
} from '../../lib/matematika';

type Layar = 'lobby' | 'main' | 'hasil';
type Format = 'ujian' | 'latihan';

interface Jawaban {
  soal: Soal;
  jawabUser: string;
  benar: boolean;
}

interface Props {
  /** WA dari URL (`?wa=`) atau dari panel admin. */
  waTarget?: string;
  /** Panel admin: lewati gerbang password kandidat (sama seperti KotobaGame). */
  adminMode?: boolean;
}

interface Rekor {
  skor: number;
  grade: string;
  main: number;
}

const KUNCI_SIMPAN = 'asj_matematika_v1:';
const KUNCI_SUARA = 'asj_matematika_suara';

/** Ambang grade — sama dengan versi HTML aslinya (90 / 75 / 60). */
const AMBANG = { s: 90, a: 75, b: 60 };

function waFromUrl(): string {
  try {
    return new URLSearchParams(window.location.search).get('wa') || '';
  } catch {
    return '';
  }
}

function bacaRekor(wa: string): Rekor {
  try {
    const raw = localStorage.getItem(KUNCI_SIMPAN + wa);
    if (!raw) return { skor: 0, grade: '', main: 0 };
    const p = JSON.parse(raw) as Partial<Rekor>;
    return {
      skor: typeof p.skor === 'number' ? p.skor : 0,
      grade: typeof p.grade === 'string' ? p.grade : '',
      main: typeof p.main === 'number' ? p.main : 0,
    };
  } catch {
    return { skor: 0, grade: '', main: 0 };
  }
}

function tulisRekor(wa: string, r: Rekor): void {
  try {
    localStorage.setItem(KUNCI_SIMPAN + wa, JSON.stringify(r));
  } catch {
    /* Mode privat: rekor tidak diingat. Permainan tetap jalan. */
  }
}

/**
 * Bentuk MINIMAL Web Audio yang dipakai di sini, ditulis tangan.
 *
 * Kenapa tidak memakai tipe bawaan `AudioContext`: indexer menandai nama global
 * itu sebagai `global-unknown` di kode PRODUKSI, dan gate
 * `indexer/src/build.test.ts` ("reports occurrences, unresolved, and stage
 * timings") menuntut nol unresolved dari berkas non-tes. Terukur 2026-10-27:
 * dua rujukan `AudioContext` di berkas ini memerahkan gate itu. Menyebut
 * `window.AudioContext` sebagai PROPERTI (bukan nama tipe) tidak dihitung.
 */
interface OsilatorAudio {
  type: string;
  frequency: { setValueAtTime(v: number, t: number): void };
  connect(n: unknown): void;
  start(t: number): void;
  stop(t: number): void;
}

interface GainAudio {
  gain: {
    setValueAtTime(v: number, t: number): void;
    exponentialRampToValueAtTime(v: number, t: number): void;
  };
  connect(n: unknown): void;
}

interface KonteksAudio {
  state: string;
  currentTime: number;
  destination: unknown;
  resume(): Promise<void> | void;
  createOscillator(): OsilatorAudio;
  createGain(): GainAudio;
}

type PembuatKonteks = new () => KonteksAudio;

/** `webkitAudioContext` masih dipakai Safari lama; keduanya dicari lewat properti. */
function cariAudioContext(): PembuatKonteks | null {
  const w = window as unknown as { AudioContext?: PembuatKonteks; webkitAudioContext?: PembuatKonteks };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/* ── Figur (spasial) ──────────────────────────────────────────────────────── */

/**
 * Path tiap bentuk di dalam kotak 100×100.
 *
 * Semua bentuk digambar dengan satu `<path>` supaya transformasi (rotasi +
 * cermin) bisa diterapkan ke SATU grup — kalau tiap bentuk memakai elemen
 * berbeda (rect/polygon/line), transform-nya harus ditulis ulang per elemen dan
 * salah satunya pasti ketinggalan.
 */
function pathFigur(bentuk: BentukFigur): string | null {
  if (bentuk === 'kotak') return 'M22 22 H78 V78 H22 Z';
  if (bentuk === 'segitiga') return 'M50 16 L86 80 H14 Z';
  if (bentuk === 'L') return 'M28 18 H44 V64 H78 V80 H28 Z';
  if (bentuk === 'pisau') return 'M18 62 L58 22 H80 V40 L40 80 H18 Z';
  if (bentuk === 'bendera') return 'M32 14 V86 M32 18 H78 L60 34 L78 50 H32';
  if (bentuk === 'garis') return 'M20 50 H80';
  return null; // titik digambar sebagai <circle>
}

/**
 * Render satu gambar figural.
 *
 * `sel` > 1 dipakai soal deret: tiga gambar berjajar dalam satu SVG, masing-
 * masing digeser 100 px. `aria-hidden` selalu true — pembaca layar tidak bisa
 * mendeskripsikan rotasi; teks pertanyaannya yang menjadi konteks.
 */
function FigurSvg({
  gambar,
  sel = 1,
  ukuran = 96,
  kelas = '',
}: {
  gambar: readonly Figur[];
  sel?: number;
  ukuran?: number;
  kelas?: string;
}) {
  return (
    <svg
      viewBox={`0 0 ${sel * 100} 100`}
      width={ukuran * sel}
      height={ukuran}
      class={kelas}
      aria-hidden="true"
      focusable="false"
    >
      {gambar.map((f, i) => {
        const d = pathFigur(f.bentuk);
        return (
          <g
            key={i}
            transform={`translate(${(f.x ?? 0) * 100} 0) rotate(${f.putar} 50 50)${
              f.cermin ? ' translate(100 0) scale(-1 1)' : ''
            }`}
            fill={f.isi ? 'currentColor' : 'none'}
            stroke="currentColor"
            stroke-width={f.isi ? 0 : 6}
            stroke-linejoin="round"
            stroke-linecap="round"
          >
            {d ? <path d={d} /> : <circle cx="50" cy="50" r="10" fill="currentColor" />}
          </g>
        );
      })}
    </svg>
  );
}

export default function MatematikaGame({ waTarget = '', adminMode = false }: Props) {
  useLang();
  const auth = authStore.get();
  const admin = auth.role === 'admin';

  /* ── gerbang login (pola sama dengan KotobaGame/MensetsuForm) ──────────── */
  const [loginGate, setLoginGate] = useState(!adminMode && !auth.isLoggedIn);
  const [gateWa, setGateWa] = useState(waFromUrl() || waTarget);
  const [gatePass, setGatePass] = useState('');
  const [gateMsg, setGateMsg] = useState('');
  const [wa, setWa] = useState(
    waTarget || (auth.role === 'admin' ? waFromUrl() : '') || (auth.isLoggedIn ? auth.wa || '' : ''),
  );

  const [memuat, setMemuat] = useState(false);
  const [galat, setGalat] = useState('');
  /** `null` = belum diketahui. Jangan putuskan apa pun selama masih null. */
  const [vip, setVip] = useState<boolean | null>(null);
  const [bankCerita, setBankCerita] = useState<BankMatematikaRes['cerita']>([]);
  const [kategoriBank, setKategoriBank] = useState<BankMatematikaRes['kategori']>([]);
  const [rekor, setRekor] = useState<Rekor>({ skor: 0, grade: '', main: 0 });

  /* ── pilihan lobi ─────────────────────────────────────────────────────── */
  const [kategori, setKategori] = useState<KategoriId | 'campur'>('kraepelin');
  const [kesulitan, setKesulitan] = useState<KesulitanPilih>('easy');
  const [format, setFormat] = useState<Format>('ujian');

  /* ── permainan ────────────────────────────────────────────────────────── */
  const [layar, setLayar] = useState<Layar>('lobby');
  const [ronde, setRonde] = useState<Soal[]>([]);
  const [idx, setIdx] = useState(0);
  const [masukan, setMasukan] = useState('');
  const [riwayat, setRiwayat] = useState<Jawaban[]>([]);
  const [terjawab, setTerjawab] = useState(false);
  const [terakhirBenar, setTerakhirBenar] = useState<boolean | null>(null);
  const [pembahasanTampil, setPembahasanTampil] = useState(false);
  const [sisaWaktu, setSisaWaktu] = useState(0);
  const [detikMulai, setDetikMulai] = useState(0);
  /** Durasi ronde DIBEKUKAN saat selesai. Menghitungnya saat render membuat
   *  angka "detik/soal" terus naik selama layar hasil terbuka (setiap render
   *  membaca Date.now() lagi), dan tombol suara cukup untuk mengubahnya. */
  const [durasi, setDurasi] = useState(0);

  const [suara, setSuara] = useState<boolean>(() => {
    try {
      return localStorage.getItem(KUNCI_SUARA) !== '0';
    } catch {
      return true;
    }
  });

  const mulaiRef = useRef(0);
  /** Root game — dipakai untuk menggulir ke soal pertama setelah "Mulai tes". */
  const rootRef = useRef<HTMLDivElement>(null);
  const selesaiRef = useRef<() => void>(() => {});
  const muatRef = useRef<(nomor: string) => void>(() => {});
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const jawabRef = useRef<(nilai: string) => void>(() => {});
  /* `masukan` versi terbaru untuk handler papan ketik — memasukkan `masukan` ke
     daftar dependensi effect akan memasang ulang listener di setiap ketikan. */
  const masukanRef = useRef('');
  masukanRef.current = masukan;

  /* ── muat bank (gerbang sebenarnya) ───────────────────────────────────── */
  const muat = async (nomor: string) => {
    if (!nomor) return;
    setMemuat(true);
    setGalat('');
    try {
      const d = await apiClient<BankMatematikaRes>('getBankMatematika', [nomor], {
        onSessionInvalid: 'throw',
        silent: true,
      });
      if (d.sessionInvalid) {
        if (adminMode) {
          setGalat(t('matematika.galat_sesi_admin'));
          return;
        }
        setLoginGate(true);
        setGateMsg(t('matematika.galat_sesi'));
        return;
      }
      /* Bukan siswa ASJ: server menjawab `success:false` + `isVip:false` TANPA
         bank. Jangan lanjut ke "bank kosong" — itu menyalahkan data, padahal
         yang kurang adalah status siswa. */
      if (d.success === false && d.isVip === false) {
        setVip(false);
        setBankCerita([]);
        return;
      }
      setVip(typeof d.isVip === 'boolean' ? d.isVip : null);
      setBankCerita(Array.isArray(d.cerita) ? d.cerita : []);
      setKategoriBank(Array.isArray(d.kategori) ? d.kategori : []);
      setRekor(bacaRekor(nomor));
    } catch (e) {
      const err = e as ApiError;
      setGalat(err?.message || t('matematika.galat_muat'));
    } finally {
      setMemuat(false);
    }
  };
  muatRef.current = muat;

  useEffect(() => {
    if (loginGate) return;
    if (!wa) return;
    muatRef.current(wa);
  }, [wa, loginGate]);

  const gateLogin = async () => {
    const vg = validate(kandidatLoginSchema, { wa: gateWa.trim(), password: gatePass });
    if (!vg.success) {
      setGateMsg(vg.errors[0]);
      return;
    }
    try {
      const d = await apiClient<{ sessionToken?: string; token?: string; user?: string }>(
        'loginKandidat',
        [gateWa.trim(), gatePass],
        { requireAuth: false, onSessionInvalid: 'throw', silent: true },
      );
      const token = d.sessionToken || d.token || '';
      authStore.set({
        ...authStore.get(),
        sessionToken: token,
        wa: gateWa.trim(),
        name: d.user || 'kandidat',
        isLoggedIn: true,
        role: 'kandidat',
        lastChecked: Date.now(),
      });
      setWa(gateWa.trim());
      setLoginGate(false);
    } catch (e) {
      const err = e as ApiError;
      setGateMsg(err?.message || t('matematika.galat_sesi'));
    }
  };

  /* ── suara sintetis (tanpa berkas audio) ──────────────────────────────── */
  const audioRef = useRef<KonteksAudio | null>(null);
  const bunyi = (jenis: 'tap' | 'benar' | 'salah' | 'lulus') => {
    if (!suara) return;
    // Sesi `playback` — tanpa ini sakelar senyap iPhone membisukan Web Audio
    // walau konteksnya sudah berjalan. Android tidak punya sakelar itu.
    aktifkanSesiAudio();
    try {
      if (!audioRef.current) {
        const Ctx = cariAudioContext();
        if (!Ctx) return;
        audioRef.current = new Ctx();
      }
      const ctx = audioRef.current;
      if (ctx.state === 'suspended') void ctx.resume();
      const now = ctx.currentTime;
      const nada = (freq: number, mulai: number, durasi: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + mulai);
        gain.gain.setValueAtTime(0.12, now + mulai);
        gain.gain.exponentialRampToValueAtTime(0.001, now + mulai + durasi);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + mulai);
        osc.stop(now + mulai + durasi);
      };
      if (jenis === 'tap') nada(450, 0, 0.05);
      else if (jenis === 'benar') {
        nada(659.25, 0, 0.18);
        nada(880, 0.08, 0.18);
      } else if (jenis === 'salah') nada(180, 0, 0.2);
      else {
        for (const [i, f] of [523.25, 659.25, 783.99, 1046.5].entries()) nada(f, i * 0.1, 0.5);
      }
    } catch {
      /* AudioContext diblokir: permainan tetap jalan tanpa suara. */
    }
  };

  const alihSuara = () => {
    const baru = !suara;
    setSuara(baru);
    try {
      localStorage.setItem(KUNCI_SUARA, baru ? '1' : '0');
    } catch {
      /* Mode privat: pilihan tidak diingat. */
    }
  };

  /* ── konfeti (canvas 2D, tanpa pustaka) ───────────────────────────────── */
  const konfeti = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const warna = ['#f43f5e', '#38bdf8', '#fbbf24', '#34d399', '#a855f7', '#ffffff'];
    const parts = Array.from({ length: 90 }, () => ({
      x: canvas.width / 2,
      y: canvas.height / 2,
      s: Math.random() * 6 + 4,
      c: warna[Math.floor(Math.random() * warna.length)] as string,
      vx: (Math.random() - 0.5) * 16,
      vy: (Math.random() - 0.7) * 16,
      rot: Math.random() * 360,
      spin: (Math.random() - 0.5) * 12,
      op: 1,
    }));
    const langkah = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let hidup = false;
      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.35;
        p.vx *= 0.95;
        p.op -= 0.012;
        p.rot += p.spin;
        if (p.op > 0) hidup = true;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rot * Math.PI) / 180);
        ctx.globalAlpha = Math.max(0, p.op);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s);
        ctx.restore();
      }
      if (hidup) requestAnimationFrame(langkah);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
    requestAnimationFrame(langkah);
  };

  /* ── alur ronde ───────────────────────────────────────────────────────── */
  const campur = kategori === 'campur';
  const kategoriAktif = (kategoriBank ?? []).find((k) => k.id === kategori);
  /* Simulasi campuran memakai 20 soal / 300 detik — angka yang sama dengan
     modul terpanjang, karena isinya berganti jenis dan butuh waktu berpindah. */
  const jumlahSoal = campur ? 20 : kategoriAktif?.soal ?? 20;
  /* Durasi bawaan per kategori yang tidak dikirim bank. Soal verbal butuh
     membaca 4 kalimat; 120 detik untuk 20 soal (6 dtk/soal) terlalu kejam. */
  const DETIK_BAWAAN: Partial<Record<KategoriId, number>> = {
    ketelitian: 180,
    verbal: 240,
    silogisme: 240,
  };
  const detikKategori = kategori === 'campur' ? undefined : DETIK_BAWAAN[kategori];
  const batasDetik = campur ? 300 : kategoriAktif?.detik ?? detikKategori ?? 120;

  const mulai = () => {
    const daftar =
      kategori === 'campur'
        ? buatRondeCampur(jumlahSoal, bankCerita || [])
        : buatRonde(kategori, kesulitan, jumlahSoal, bankCerita || []);
    if (!daftar.length) {
      setGalat(t('matematika.bank_kosong'));
      return;
    }
    setRonde(daftar);
    setIdx(0);
    setMasukan('');
    setRiwayat([]);
    setTerjawab(false);
    setTerakhirBenar(null);
    setPembahasanTampil(false);
    setSisaWaktu(batasDetik);
    setDurasi(0);
    setDetikMulai(Date.now());
    mulaiRef.current = Date.now();
    setGalat('');
    setLayar('main');
    bunyi('tap');
    /* Lobi panjang (15 kartu) membuat "Mulai tes" berada jauh di bawah. Tanpa
       ini, layar soal pertama muncul pada posisi gulir yang sama — siswa melihat
       bagian tengah soal, bukan pertanyaannya. `scroll-mt` di root menyisakan
       ruang untuk toolbar yang menempel. */
    window.setTimeout(() => {
      const el = rootRef.current;
      if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'start', behavior: 'auto' });
    }, 0);
  };

  const selesai = () => {
    const total = ronde.length;
    if (!total) {
      setLayar('lobby');
      return;
    }
    const benar = riwayat.filter((r) => r.benar).length;
    const akurasi = Math.round((benar / total) * 100);
    const skor = benar * 50;
    setDurasi(Math.max(1, Math.round((Date.now() - mulaiRef.current) / 1000)));
    const grade = akurasi >= AMBANG.s ? 'S' : akurasi >= AMBANG.a ? 'A' : akurasi >= AMBANG.b ? 'B' : 'C';
    /* Papan peringkat. Dikirim sekali per ronde; `bolehKirim` menjaga render
       ganda tidak mengirim dua kali. Kegagalan diabaikan — rekor lokal sudah
       ditulis di bawah dan itu yang dilihat siswa. */
    if (skor > 0 && bolehKirim(`matematika:${skor}:${total}`)) {
      void kirimSkor('matematika', skor, { akurasi, benar, total, grade, campur });
    }
    if (skor > rekor.skor) {
      const baru = { skor, grade, main: rekor.main + 1 };
      setRekor(baru);
      if (wa) tulisRekor(wa, baru);
    } else if (wa) {
      const baru = { ...rekor, main: rekor.main + 1 };
      setRekor(baru);
      tulisRekor(wa, baru);
    }
    if (akurasi >= AMBANG.s) {
      konfeti();
      bunyi('lulus');
    } else if (akurasi >= AMBANG.a) bunyi('benar');
    setLayar('hasil');
  };
  selesaiRef.current = selesai;

  const lanjut = () => {
    setPembahasanTampil(false);
    setTerjawab(false);
    setTerakhirBenar(null);
    setMasukan('');
    setIdx((i) => {
      const next = i + 1;
      if (next >= ronde.length) {
        window.setTimeout(() => selesaiRef.current(), 0);
        return i;
      }
      return next;
    });
  };

  const jawab = (nilai: string) => {
    if (terjawab || layar !== 'main') return;
    const soal = ronde[idx];
    if (!soal) return;
    const teks = String(nilai).trim();
    if (!teks) return;
    const cocok = soal.input === 'pilihan' ? Number.parseFloat(teks) === soal.jawab : jawabanBenar(teks, soal.jawab);
    setRiwayat((r) => [...r, { soal, jawabUser: teks, benar: cocok }]);
    setTerjawab(true);
    setTerakhirBenar(cocok);
    bunyi(cocok ? 'benar' : 'salah');
    /* Mode latihan + salah: tahan dulu, tampilkan pembahasan. Mode ujian
       melanjutkan otomatis — di ujian sungguhan tidak ada waktu membaca
       pembahasan, dan menahannya akan membuat skor tidak sebanding. */
    if (!cocok && format === 'latihan') {
      setPembahasanTampil(true);
      return;
    }
    window.setTimeout(() => {
      setTerjawab(false);
      setTerakhirBenar(null);
      setMasukan('');
      setIdx((i) => {
        const next = i + 1;
        if (next >= ronde.length) {
          window.setTimeout(() => selesaiRef.current(), 0);
          return i;
        }
        return next;
      });
    }, 420);
  };
  jawabRef.current = jawab;

  /* Timer ujian. Efek terpisah untuk "waktu habis" supaya tidak ada efek
     samping di dalam updater setState (itu membuat React memanggil selesai
     dua kali di StrictMode). */
  useEffect(() => {
    if (layar !== 'main' || format !== 'ujian') return;
    const id = window.setInterval(() => setSisaWaktu((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => window.clearInterval(id);
  }, [layar, format]);

  useEffect(() => {
    if (layar !== 'main' || format !== 'ujian') return;
    if (sisaWaktu === 0 && detikMulai > 0) selesaiRef.current();
  }, [sisaWaktu, layar, format, detikMulai]);

  /* Papan ketik fisik. */
  // biome-ignore lint/correctness/useExhaustiveDependencies: bunyi dibuat ulang tiap render (ia menutup `suara`); memasukkannya ke daftar dependensi akan memasang ulang listener di setiap ketikan, dan itulah bug yang komentar di atas hindari.
  useEffect(() => {
    if (layar !== 'main') return;
    const onKey = (e: KeyboardEvent) => {
      if (terjawab) return;
      const soal = ronde[idx];
      if (!soal) return;
      if (/^[0-9]$/.test(e.key)) {
        setMasukan((m) => (m.length < 9 ? m + e.key : m));
        bunyi('tap');
      } else if (e.key === '.' || e.key === ',') {
        setMasukan((m) => (m.includes('.') || m.includes(',') ? m : `${m}.`));
      } else if (e.key === '-') {
        setMasukan((m) => (m.startsWith('-') ? m.slice(1) : `-${m}`));
      } else if (e.key === 'Backspace') {
        setMasukan((m) => m.slice(0, -1));
      } else if (e.key === 'Enter') {
        if (soal.input === 'pilihan') return;
        jawabRef.current(masukanRef.current);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [layar, terjawab, ronde, idx]);

  /* ── numpad ───────────────────────────────────────────────────────────── */
  const tekanNumpad = (kunci: string) => {
    if (terjawab) return;
    bunyi('tap');
    setMasukan((m) => {
      if (kunci === 'back') return m.slice(0, -1);
      if (kunci === 'min') return m.startsWith('-') ? m.slice(1) : `-${m}`;
      if (kunci === 'titik') return m.includes('.') ? m : `${m}.`;
      return m.length < 9 ? `${m}${kunci}` : m;
    });
  };

  /* ── render: gerbang login ────────────────────────────────────────────── */
  if (loginGate) {
    return (
      <section aria-label={t('matematika.gate_title')} class="max-w-md mx-auto my-8 rounded-card border border-line bg-surface p-6">
        <h2 class="text-base font-black text-fg mb-1">{t('matematika.gate_title')}</h2>
        <p class="text-[12px] text-fg-muted mb-4">{t('matematika.gate_desc')}</p>
        <label for="mat-gate-wa" class="block text-[11px] font-bold text-fg mb-1">
          {t('matematika.gate_wa')}
        </label>
        <input
          id="mat-gate-wa"
          type="tel"
          value={gateWa}
          onInput={(e) => setGateWa((e.target as HTMLInputElement).value)}
          placeholder="08xxxxxxxxxx"
          class="w-full mb-3 rounded-control bg-surface-sunken border border-line px-3 py-2 min-h-11 text-sm text-fg"
        />
        <label for="mat-gate-pass" class="block text-[11px] font-bold text-fg mb-1">
          {t('matematika.gate_pass')}
        </label>
        <input
          id="mat-gate-pass"
          type="password"
          value={gatePass}
          onInput={(e) => setGatePass((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if ((e as KeyboardEvent).key === 'Enter') void gateLogin();
          }}
          class="w-full mb-3 rounded-control bg-surface-sunken border border-line px-3 py-2 min-h-11 text-sm text-fg"
        />
        {gateMsg && <p class="text-[12px] text-accent-red mb-3">{gateMsg}</p>}
        <button
          type="button"
          onClick={() => void gateLogin()}
          class="w-full min-h-11 rounded-control bg-accent-violet text-canvas text-sm font-bold"
        >
          {t('matematika.gate_submit')}
        </button>
      </section>
    );
  }

  /* ── render: khusus siswa ASJ ─────────────────────────────────────────── */
  if (!admin && vip === false) {
    return (
      <section
        aria-label={t('matematika.khusus_vip_judul')}
        data-testid="matematika-khusus-vip"
        class="max-w-md mx-auto my-8 rounded-card border border-line bg-surface p-6 text-center"
      >
        <h2 class="text-base font-black text-fg mb-2">{t('matematika.khusus_vip_judul')}</h2>
        <p class="text-[12.5px] text-fg-muted leading-relaxed">{t('matematika.khusus_vip_isi')}</p>
      </section>
    );
  }

  if (memuat && !bankCerita?.length) {
    return (
      <p data-testid="matematika-memuat" class="max-w-md mx-auto my-8 text-center text-sm text-fg-muted">
        {t('matematika.memuat')}
      </p>
    );
  }
  if (galat && !bankCerita?.length) {
    return (
      <section class="max-w-md mx-auto my-8 rounded-card border border-line bg-surface p-6 text-center">
        <p data-testid="matematika-galat" class="text-sm text-accent-red mb-4">
          {galat}
        </p>
        <button
          type="button"
          onClick={() => void muat(wa)}
          class="min-h-11 px-5 rounded-control bg-accent-violet text-canvas text-sm font-bold"
        >
          {t('matematika.coba_lagi')}
        </button>
      </section>
    );
  }

  /* ── data turunan ─────────────────────────────────────────────────────── */
  const benarSejauhIni = riwayat.filter((r) => r.benar).length;
  const akurasiBerjalan = riwayat.length ? Math.round((benarSejauhIni / riwayat.length) * 100) : 100;
  const soalAktif = ronde[idx];
  const totalBenar = riwayat.filter((r) => r.benar).length;
  const akurasiAkhir = riwayat.length ? Math.round((totalBenar / riwayat.length) * 100) : 0;
  const detikTerpakai = durasi || (detikMulai ? Math.max(1, Math.round((Date.now() - detikMulai) / 1000)) : 1);
  /* Koma, bukan titik: ini angka Indonesia, dan helper `tampilAngka` sudah
     memakai aturan yang sama di seluruh halaman (2,5 / 112,5). */
  const kecepatan = tampilAngka(Math.round((detikTerpakai / Math.max(1, riwayat.length)) * 10) / 10);
  const gradeAkhir =
    akurasiAkhir >= AMBANG.s ? 's' : akurasiAkhir >= AMBANG.a ? 'a' : akurasiAkhir >= AMBANG.b ? 'b' : 'c';
  /* Warna lencana grade. Nilainya kelas `.arc-rank--*` (hex tetap), bukan
     utilitas palet: arena ini tidak ikut tema terang, dan `text-accent-*` akan
     berubah warna bersama tema. */
  const warnaGrade: Record<string, string> = {
    s: 'arc-rank--hijau',
    a: 'arc-rank--biru',
    b: 'arc-rank--amber',
    c: 'arc-rank--merah',
  };

  /* Metadata untuk kategori yang tidak dikirim bank (baru, atau belum ada di
     bank server). Tanpa ini kartunya tampil kosong di baris atas — tanpa label
     Jepang dan tanpa jumlah soal — dan terbaca seperti modul yang rusak. */
  const META_LOKAL: Partial<Record<KategoriId, { jp: string; soal: number; detik: number }>> = {
    ketelitian: { jp: '注意力', soal: 20, detik: 180 },
    verbal: { jp: '言語', soal: 20, detik: 240 },
    silogisme: { jp: '論理', soal: 20, detik: 240 },
    figural: { jp: '空間', soal: 20, detik: 240 },
  };

  const kartuKategori: { id: KategoriId | 'campur'; label: string; ket: string }[] = [
    /* Simulasi campuran ditaruh PERTAMA: ia jawaban langsung atas keluhan
       "semua repetitif, cuma beda angka". Modul tunggal tetap ada untuk
       latihan terarah. */
    { id: 'campur', label: t('matematika.kat_campur'), ket: t('matematika.kat_campur_ket') },
    { id: 'kraepelin', label: t('matematika.kat_kraepelin'), ket: t('matematika.kat_kraepelin_ket') },
    { id: 'kabataku', label: t('matematika.kat_kabataku'), ket: t('matematika.kat_kabataku_ket') },
    { id: 'deret', label: t('matematika.kat_deret'), ket: t('matematika.kat_deret_ket') },
    { id: 'satuan', label: t('matematika.kat_satuan'), ket: t('matematika.kat_satuan_ket') },
    { id: 'logika', label: t('matematika.kat_logika'), ket: t('matematika.kat_logika_ket') },
    /* Tiga dimensi psikotes yang sebelumnya tidak ada. Ditaruh berurutan
       supaya terbaca sebagai satu blok "psikotes", bukan tersebar. */
    { id: 'ketelitian', label: t('matematika.kat_ketelitian'), ket: t('matematika.kat_ketelitian_ket') },
    { id: 'verbal', label: t('matematika.kat_verbal'), ket: t('matematika.kat_verbal_ket') },
    { id: 'silogisme', label: t('matematika.kat_silogisme'), ket: t('matematika.kat_silogisme_ket') },
    { id: 'figural', label: t('matematika.kat_figural'), ket: t('matematika.kat_figural_ket') },
    { id: 'cerita', label: t('matematika.kat_cerita'), ket: t('matematika.kat_cerita_ket') },
    { id: 'gyakusan', label: t('matematika.kat_gyakusan'), ket: t('matematika.kat_gyakusan_ket') },
    { id: 'sansu', label: t('matematika.kat_sansu'), ket: t('matematika.kat_sansu_ket') },
    { id: 'suiri', label: t('matematika.kat_suiri'), ket: t('matematika.kat_suiri_ket') },
    { id: 'baai', label: t('matematika.kat_baai'), ket: t('matematika.kat_baai_ket') },
  ];
  const daftarKesulitan: { id: KesulitanPilih; label: string }[] = [
    { id: 'easy', label: t('matematika.diff_easy') },
    { id: 'medium', label: t('matematika.diff_medium') },
    { id: 'hard', label: t('matematika.diff_hard') },
    { id: 'mixed', label: t('matematika.diff_mixed') },
  ];

  /**
   * Rekap per jenis soal — hanya berguna pada simulasi campuran, tetapi
   * dihitung untuk semua mode (satu jenis = satu baris, tidak ditampilkan).
   *
   * Inilah yang membuat hasilnya terasa seperti TES, bukan skor: "deret 2/3,
   * kraepelin 4/4" memberi tahu APA yang masih lemah, sedangkan satu angka
   * akurasi hanya memberi tahu bahwa ada yang lemah.
   */
  const rekapKategori = rekapPerKategori(riwayat.map((r) => ({ kategori: r.soal.kategori, benar: r.benar }))).map(
    (r) => ({ ...r, label: kartuKategori.find((k) => k.id === r.kategori)?.label ?? r.kategori }),
  );
  /* Profil per DIMENSI — gambaran besar yang dibaca seperti hasil psikotes.
     Kategori tetap ada di rincian, tetapi 13 bar tidak terbaca sebagai profil. */
  const rekapDimensi = rekapPerDimensi(riwayat.map((r) => ({ kategori: r.soal.kategori, benar: r.benar })));
  const labelDimensi = (d: string): string => {
    if (d === 'kecepatan') return t('matematika.dim_kecepatan');
    if (d === 'ketelitian') return t('matematika.dim_ketelitian');
    if (d === 'penalaran') return t('matematika.dim_penalaran');
    if (d === 'verbal') return t('matematika.dim_verbal');
    if (d === 'spasial') return t('matematika.dim_spasial');
    return t('matematika.dim_aplikasi');
  };

  const fmtWaktu = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div ref={rootRef} class="max-w-2xl mx-auto scroll-mt-[var(--u-toolbar-h)]">
      <canvas ref={canvasRef} class="fixed inset-0 pointer-events-none z-50 w-full h-full" />

      {/* Kanvas konfeti sengaja DI LUAR `.arc`: `.arc` adalah stacking context
          (`z-index: 1`) dan memotong apa pun yang dicat di dalamnya, sedangkan
          konfeti harus menutupi seluruh layar. */}
      <div class="arc">

      {/* ── LOBI ── */}
      {layar === 'lobby' && (
        <div>
          <div class="arc-hud">
            <div class="arc-hud-row">
              <div class="min-w-0">
                <span class="arc-kicker">{t('matematika.rekor')}</span>
                <span class="arc-skor">{rekor.skor}</span>
              </div>
              <div class="shrink-0 text-right">
                <span class="arc-kicker">{rekor.grade || t('matematika.belum_ada')}</span>
                <span class="arc-combo">{t('matematika.target')}</span>
              </div>
            </div>
          </div>

          <div class="arc-section">
            <p class="arc-kicker">{t('matematika.pilih_modul')}</p>
            <div class="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {kartuKategori.map((k) => {
                const meta =
                  (kategoriBank ?? []).find((m) => m.id === k.id) ??
                  (k.id === 'campur' ? undefined : META_LOKAL[k.id]);
                const aktif = kategori === k.id;
                return (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() => setKategori(k.id)}
                    aria-pressed={aktif}
                    class="arc-pilih"
                  >
                    <div class="flex items-center justify-between gap-2">
                      <span class="arc-jp">{k.id === 'campur' ? t('matematika.kat_campur_jp') : (meta?.jp ?? '')}</span>
                      {k.id === 'campur' ? (
                        <span class="arc-mini">
                          20 {t('matematika.soal')} · 300 {t('matematika.detik')}
                        </span>
                      ) : (
                        meta && (
                          <span class="arc-mini">
                            {meta.soal} {t('matematika.soal')} · {meta.detik} {t('matematika.detik')}
                          </span>
                        )
                      )}
                    </div>
                    <span class="arc-judul-kartu">{k.label}</span>
                    <span class="arc-kecil">{k.ket}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Simulasi campuran memakai kurva sendiri (easy → medium → hard),
              jadi pemilih kesulitan DISEMBUNYIKAN — menampilkannya berarti
              menawarkan tombol yang tidak mengubah apa pun. */}
          {!campur && (
            <div class="arc-section">
              <p class="arc-kicker">{t('matematika.pilih_kesulitan')}</p>
              <div class="mt-1.5 grid grid-cols-4 gap-1.5">
                {daftarKesulitan.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setKesulitan(d.id)}
                    aria-pressed={kesulitan === d.id}
                    class="arc-pilih arc-pilih--kecil"
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div class="arc-section">
            <p class="arc-kicker">{t('matematika.pilih_format')}</p>
            <div class="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {(
                [
                  { id: 'ujian' as Format, judul: t('matematika.format_ujian'), ket: t('matematika.format_ujian_ket') },
                  { id: 'latihan' as Format, judul: t('matematika.format_latihan'), ket: t('matematika.format_latihan_ket') },
                ]
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFormat(f.id)}
                  aria-pressed={format === f.id}
                  class="arc-pilih"
                >
                  <span class="arc-judul-kartu">{f.judul}</span>
                  <span class="arc-mini">{f.ket}</span>
                </button>
              ))}
            </div>
          </div>

          <button type="button" onClick={mulai} class="arc-btn arc-btn--violet mt-3">
            {t('matematika.mulai')}
          </button>
        </div>
      )}

      {/* ── PERMAINAN ── */}
      {layar === 'main' && soalAktif && (
        <div>
          <div class="arc-hud">
            <div class="arc-hud-row">
              <div class="min-w-0">
                <span class="arc-kicker">{t('matematika.nomor')}</span>
                <span class="arc-skor-baris">
                  <span class="arc-skor">{String(idx + 1).padStart(2, '0')}</span>
                  <span class="arc-mini">/ {ronde.length}</span>
                </span>
              </div>
              <div class="shrink-0 text-center">
                <span class="arc-kicker">{t('matematika.akurasi')}</span>
                <span class="arc-skor arc-skor--kecil">{akurasiBerjalan}%</span>
              </div>
              <div class="shrink-0 text-right">
                <span class="arc-kicker">
                  {format === 'ujian' ? t('matematika.sisa_waktu') : t('matematika.mode')}
                </span>
                <span class={`arc-skor arc-skor--kecil ${format === 'ujian' && sisaWaktu <= 15 ? 'arc-skor--bahaya' : ''}`}>
                  {format === 'ujian' ? fmtWaktu(sisaWaktu) : t('matematika.santai')}
                </span>
              </div>
            </div>
            <div class="arc-meter">
              <div
                class="arc-meter-fill arc-meter-fill--violet"
                style={`transform:scaleX(${idx / Math.max(1, ronde.length)})`}
              />
            </div>
          </div>

          <div class="arc-order arc-order--violet">
            <div class="arc-order-head">
              <span class="arc-tag">{soalAktif.tag}</span>
              {soalAktif.kraepelin && (
                <span class="arc-order-badge">{t('matematika.petunjuk_kraepelin')}</span>
              )}
            </div>
            {soalAktif.gambar && (
              <div class="arc-figur mt-2">
                <FigurSvg
                  gambar={soalAktif.gambar}
                  sel={soalAktif.gambarSel ?? 1}
                  ukuran={(soalAktif.gambarSel ?? 1) > 1 ? 72 : 110}
                />
              </div>
            )}
            <div class="arc-order-jp arc-soal mt-1">{soalAktif.tanya}</div>
            {terakhirBenar !== null && (
              <p class={`arc-msg ${terakhirBenar ? 'arc-msg--benar' : ''}`}>
                {terakhirBenar ? t('matematika.benar') : t('matematika.salah')}
              </p>
            )}
          </div>

          {soalAktif.input === 'pilihan' ? (
            soalAktif.opsiGambar ? (
              /* Opsi GAMBAR (figural): 2×2, tiap kartu satu SVG. Nomor tidak
                 ditampilkan — yang dipilih adalah gambarnya, dan nomor urut
                 hanya akan mengalihkan perhatian dari bentuk. */
              <div class="grid grid-cols-2 gap-2">
                {soalAktif.opsiGambar.map((g, i) => (
                  <button
                    key={i}
                    type="button"
                    data-opsi={i + 1}
                    aria-label={`Opsi ${i + 1}`}
                    disabled={terjawab}
                    onClick={() => jawab(String(i + 1))}
                    class="arc-opsi arc-opsi--gambar"
                  >
                    <FigurSvg gambar={g} ukuran={76} />
                  </button>
                ))}
              </div>
            ) : soalAktif.opsiTeks ? (
              /* Opsi TEKS (analogi/silogisme): satu kolom, karena kalimat
                 kesimpulan tidak muat dua kolom di 390 px. Nomornya tetap
                 ditampilkan supaya bisa dirujuk saat membahas. */
              <div class="grid grid-cols-1 gap-2">
                {soalAktif.opsiTeks.map((teks, i) => (
                  <button
                    key={teks}
                    type="button"
                    data-opsi={i + 1}
                    disabled={terjawab}
                    onClick={() => jawab(String(i + 1))}
                    class="arc-opsi arc-opsi--teks"
                  >
                    <span class="arc-nomor">{i + 1}.</span>
                    {teks}
                  </button>
                ))}
              </div>
            ) : (
              <div class="grid grid-cols-2 gap-2">
                {(soalAktif.pilihan ?? []).map((p) => (
                  <button
                    key={p}
                    type="button"
                    data-opsi={p}
                    disabled={terjawab}
                    onClick={() => jawab(String(p))}
                    class="arc-opsi"
                  >
                    {tampilAngka(p)} {soalAktif.satuan}
                  </button>
                ))}
              </div>
            )
          ) : (
            <div>
              <div class="arc-opsi arc-opsi--jawab">
                <span class="arc-kicker">{t('matematika.jawaban_anda')}</span>
                <span class="arc-skor arc-skor--kecil">{masukan || '?'}</span>
              </div>
              <div class="arc-numpad mt-1.5">
                {['7', '8', '9', '4', '5', '6', '1', '2', '3'].map((k) => (
                  <button key={k} type="button" disabled={terjawab} onClick={() => tekanNumpad(k)}>
                    {k}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={terjawab}
                  onClick={() => tekanNumpad('min')}
                  class="arc-numpad--sempit"
                >
                  {t('matematika.min')}
                </button>
                <button type="button" disabled={terjawab} onClick={() => tekanNumpad('0')}>
                  0
                </button>
                <button
                  type="button"
                  disabled={terjawab}
                  onClick={() => tekanNumpad('titik')}
                  class="arc-numpad--sempit"
                >
                  ,
                </button>
                <button
                  type="button"
                  disabled={terjawab}
                  onClick={() => tekanNumpad('back')}
                  class="arc-numpad--sempit arc-numpad--lebar"
                >
                  {t('matematika.hapus')}
                </button>
              </div>
              <button
                type="button"
                disabled={terjawab || !masukan}
                onClick={() => jawab(masukan)}
                class="arc-btn arc-btn--violet mt-1.5 disabled:opacity-50"
              >
                {t('matematika.kirim')}
              </button>
            </div>
          )}

          {pembahasanTampil && (
            <div class="arc-note mt-2">
              <div class="arc-note-title">{t('matematika.pembahasan')}</div>
              <p class="arc-kecil">{soalAktif.pembahasan}</p>
              <button
                type="button"
                onClick={lanjut}
                class="arc-btn arc-btn--primary mt-2"
              >
                {t('matematika.lanjut')}
              </button>
            </div>
          )}

          <div class="arc-hint flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                setLayar('lobby');
                setRonde([]);
                setRiwayat([]);
              }}
              class="font-bold"
            >
              {t('matematika.batalkan')}
            </button>
            <span>{t('matematika.petunjuk_papan')}</span>
          </div>
        </div>
      )}

      {/* ── HASIL ── */}
      {layar === 'hasil' && (
        <div>
          <div class="arc-result">
            <p class="arc-kicker">{t('matematika.skor')}</p>
            <div class={`arc-rank ${warnaGrade[gradeAkhir] ?? 'arc-rank--c'}`}>{gradeAkhir.toUpperCase()}</div>
            <h2 class="arc-result-title">{t(`matematika.hasil_${gradeAkhir}`)}</h2>
            <p class="arc-result-sub">{t(`matematika.komentar_${gradeAkhir}`)}</p>
          </div>

          <div class="arc-stats">
            <div class="arc-stat">
              <span>{t('matematika.skor')}</span>
              <strong>{totalBenar * 50}</strong>
            </div>
            <div class="arc-stat">
              <span>{t('matematika.akurasi')}</span>
              <strong>{akurasiAkhir}%</strong>
            </div>
            <div class="arc-stat">
              <span>{t('matematika.benar_total')}</span>
              <strong>
                {totalBenar} / {riwayat.length}
              </strong>
            </div>
            <div class="arc-stat">
              <span>{t('matematika.kecepatan')}</span>
              <strong>
                {kecepatan} {t('matematika.detik_soal')}
              </strong>
            </div>
          </div>

          {rekapDimensi.length > 1 && (
            <div class="arc-panel">
              <div class="mb-2 flex flex-wrap items-center justify-between gap-1">
                <h3 class="arc-kicker">{t('matematika.profil_psiko')}</h3>
                <span class="arc-mini">{t('matematika.profil_ket')}</span>
              </div>
              <ul class="space-y-2">
                {rekapDimensi.map((d) => {
                  const persen = Math.round((d.benar / d.total) * 100);
                  const warna =
                    persen >= 80
                      ? 'arc-bar-isi--hijau'
                      : persen >= 50
                        ? 'arc-bar-isi--amber'
                        : 'arc-bar-isi--merah';
                  return (
                    <li key={d.dimensi}>
                      <div class="arc-baris">
                        <span class="font-bold">{labelDimensi(d.dimensi)}</span>
                        <span class="arc-mini">
                          {d.benar}/{d.total} · {persen}%
                        </span>
                      </div>
                      <span class="arc-bar">
                        <span class={`arc-bar-isi ${warna}`} style={`width:${persen}%`} />
                      </span>
                    </li>
                  );
                })}
              </ul>
              {rekapKategori.length > 1 && (
                <details class="mt-2.5">
                  <summary class="arc-jp cursor-pointer">{t('matematika.rekap_kategori')}</summary>
                  <ul class="mt-1.5 space-y-1">
                    {rekapKategori.map((r) => {
                      const persen = Math.round((r.benar / r.total) * 100);
                      return (
                        <li key={r.kategori} class="arc-baris">
                          <span class="arc-kecil min-w-0 truncate">{r.label}</span>
                          <span class="arc-mini shrink-0">
                            {r.benar}/{r.total} · {persen}%
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </details>
              )}
            </div>
          )}

          <div class="arc-panel">
            <div class="mb-2 flex items-center justify-between">
              <h3 class="arc-kicker">{t('matematika.evaluasi')}</h3>
              <span class="arc-combo">
                {riwayat.filter((r) => !r.benar).length} {t('matematika.perlu_evaluasi')}
              </span>
            </div>
            <div class="max-h-56 space-y-2 overflow-y-auto pr-1">
              {riwayat.filter((r) => !r.benar).length === 0 && (
                <p class="arc-kecil py-4 text-center">{t('matematika.sempurna')}</p>
              )}
              {riwayat
                .filter((r) => !r.benar)
                .map((r, i) => (
                  <div key={`${r.soal.id}-${i}`} class="arc-panel">
                    <div class="mb-1 flex items-center justify-between font-bold">
                      <span class="arc-mini">{r.soal.tag}</span>
                      <span class="arc-mini arc-merah">{t('matematika.salah')}</span>
                    </div>
                    <div class="arc-kecil font-bold">{r.soal.tanya}</div>
                    <div class="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                      <span class="arc-mini">
                        {t('matematika.jawaban_anda')}: <strong class="arc-merah">{labelJawaban(r.soal, r.jawabUser)}</strong>
                      </span>
                      <span class="arc-mini">
                        {t('matematika.kunci')}:{' '}
                        <strong class="arc-hijau">
                          {labelJawaban(r.soal, r.soal.jawab)}
                          {r.soal.opsiTeks ? '' : ` ${r.soal.satuan}`}
                        </strong>
                      </span>
                    </div>
                    <p class="arc-kecil mt-1">{r.soal.pembahasan}</p>
                  </div>
                ))}
            </div>
          </div>

          <div class="arc-actions">
            <button type="button" onClick={mulai} class="arc-btn arc-btn--violet">
              {t('matematika.ulangi')}
            </button>
            <button
              type="button"
              onClick={() => {
                setLayar('lobby');
                setRonde([]);
                setRiwayat([]);
              }}
              class="arc-btn arc-btn--ghost"
            >
              {t('matematika.ganti_modul')}
            </button>
          </div>
        </div>
      )}

      {/* Tombol suara — di luar ketiga layar supaya tetap terjangkau. */}
      <div class="mt-3 flex justify-end">
        <button
          type="button"
          onClick={alihSuara}
          aria-pressed={suara}
          class="arc-btn arc-btn--small arc-btn--ghost"
        >
          <span aria-hidden="true">{suara ? '🔊' : '🔇'}</span>
          {t('matematika.suara')}
        </button>
      </div>
      </div>
    </div>
  );
}
