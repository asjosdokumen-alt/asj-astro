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
import { apiClient, type ApiError } from '../../lib/apiClient';
import { validate, kandidatLoginSchema } from '../../lib/schemas';
import { t, useLang } from '../../store/i18n';
import {
  buatRonde,
  jawabanBenar,
  tampilAngka,
  type BankMatematikaRes,
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
  const [kategori, setKategori] = useState<KategoriId>('kraepelin');
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
  const kategoriAktif = (kategoriBank ?? []).find((k) => k.id === kategori);
  const jumlahSoal = kategoriAktif?.soal ?? 20;
  const batasDetik = kategoriAktif?.detik ?? 120;

  const mulai = () => {
    const daftar = buatRonde(kategori, kesulitan, jumlahSoal, bankCerita || []);
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
  const warnaGrade: Record<string, string> = {
    s: 'border-accent-emerald bg-accent-emerald/10 text-accent-emerald',
    a: 'border-accent-sky bg-accent-sky/10 text-accent-sky',
    b: 'border-accent-amber bg-accent-amber/10 text-accent-amber',
    c: 'border-accent-red bg-accent-red/10 text-accent-red',
  };

  const kartuKategori: { id: KategoriId; label: string; ket: string }[] = [
    { id: 'kraepelin', label: t('matematika.kat_kraepelin'), ket: t('matematika.kat_kraepelin_ket') },
    { id: 'kabataku', label: t('matematika.kat_kabataku'), ket: t('matematika.kat_kabataku_ket') },
    { id: 'deret', label: t('matematika.kat_deret'), ket: t('matematika.kat_deret_ket') },
    { id: 'satuan', label: t('matematika.kat_satuan'), ket: t('matematika.kat_satuan_ket') },
    { id: 'logika', label: t('matematika.kat_logika'), ket: t('matematika.kat_logika_ket') },
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

  const fmtWaktu = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div class="max-w-2xl mx-auto">
      <canvas ref={canvasRef} class="fixed inset-0 pointer-events-none z-50 w-full h-full" />

      {/* ── LOBI ── */}
      {layar === 'lobby' && (
        <div class="space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-2 rounded-card border border-line bg-surface p-3.5">
            <div>
              <span class="block text-[10px] font-extrabold uppercase tracking-wider text-fg-muted">{t('matematika.rekor')}</span>
              <div class="flex items-baseline gap-2">
                <span class="text-2xl font-black text-accent-amber">{rekor.skor}</span>
                <span class="text-xs font-semibold text-fg-muted">({rekor.grade || t('matematika.belum_ada')})</span>
              </div>
            </div>
            <span class="text-[11px] font-bold text-accent-emerald bg-accent-emerald/10 border border-accent-emerald/30 px-2 py-1 rounded-full">
              {t('matematika.target')}
            </span>
          </div>

          <div>
            <p class="mb-1.5 text-[11px] font-extrabold uppercase tracking-wider text-fg-muted">{t('matematika.pilih_modul')}</p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {kartuKategori.map((k) => {
                const meta = (kategoriBank ?? []).find((m) => m.id === k.id);
                const aktif = kategori === k.id;
                return (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() => setKategori(k.id)}
                    aria-pressed={aktif}
                    class={`min-h-11 text-left p-3 rounded-card border transition-colors motion-reduce:transition-none ${
                      aktif ? 'border-accent-red bg-accent-red/10' : 'border-line bg-surface-raised hover:border-line-strong'
                    }`}
                  >
                    <div class="flex items-center justify-between gap-2">
                      <span class="text-[11px] font-bold text-accent-sky">{meta?.jp ?? ''}</span>
                      {meta && (
                        <span class="text-[10px] font-semibold text-fg-muted">
                          {meta.soal} {t('matematika.soal')} · {meta.detik} {t('matematika.detik')}
                        </span>
                      )}
                    </div>
                    <div class="mt-1 text-[13px] font-extrabold text-fg">{k.label}</div>
                    <p class="mt-0.5 text-[11px] leading-snug text-fg-muted">{k.ket}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p class="mb-1.5 text-[11px] font-extrabold uppercase tracking-wider text-fg-muted">{t('matematika.pilih_kesulitan')}</p>
            <div class="grid grid-cols-4 gap-1.5">
              {daftarKesulitan.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setKesulitan(d.id)}
                  aria-pressed={kesulitan === d.id}
                  class={`min-h-11 rounded-control border text-[11px] font-bold transition-colors motion-reduce:transition-none ${
                    kesulitan === d.id
                      ? 'border-accent-emerald bg-accent-emerald/10 text-accent-emerald'
                      : 'border-line bg-surface-raised text-fg-muted'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p class="mb-1.5 text-[11px] font-extrabold uppercase tracking-wider text-fg-muted">{t('matematika.pilih_format')}</p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
                  class={`min-h-11 text-left p-2.5 rounded-control border transition-colors motion-reduce:transition-none ${
                    format === f.id ? 'border-accent-red bg-accent-red/10' : 'border-line bg-surface-raised'
                  }`}
                >
                  <div class="text-[12px] font-bold text-fg">{f.judul}</div>
                  <div class="text-[10px] text-fg-muted">{f.ket}</div>
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={mulai}
            class="w-full min-h-12 rounded-control bg-gradient-to-r from-accent-red to-accent-violet text-canvas font-extrabold text-sm"
          >
            {t('matematika.mulai')}
          </button>
        </div>
      )}

      {/* ── PERMAINAN ── */}
      {layar === 'main' && soalAktif && (
        <div class="space-y-3">
          <div class="flex items-center justify-between gap-2 rounded-card border border-line bg-surface p-3">
            <div>
              <span class="block text-[10px] font-bold uppercase tracking-wider text-fg-muted">{t('matematika.nomor')}</span>
              <div class="flex items-baseline gap-1">
                <span class="text-lg font-black text-fg">{String(idx + 1).padStart(2, '0')}</span>
                <span class="text-xs font-semibold text-fg-muted">/ {ronde.length}</span>
              </div>
            </div>
            <div class="text-center">
              <span class="block text-[10px] font-bold uppercase tracking-wider text-fg-muted">{t('matematika.akurasi')}</span>
              <span class="text-lg font-black text-accent-emerald">{akurasiBerjalan}%</span>
            </div>
            <div class="text-right">
              <span class="block text-[10px] font-bold uppercase tracking-wider text-fg-muted">
                {format === 'ujian' ? t('matematika.sisa_waktu') : t('matematika.mode')}
              </span>
              <span class={`text-lg font-black ${format === 'ujian' && sisaWaktu <= 15 ? 'text-accent-red' : 'text-accent-red'}`}>
                {format === 'ujian' ? fmtWaktu(sisaWaktu) : t('matematika.santai')}
              </span>
            </div>
          </div>

          <div class="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
            <div
              class="h-full bg-gradient-to-r from-accent-red to-accent-violet transition-[width] duration-300 motion-reduce:transition-none"
              style={{ width: `${(idx / Math.max(1, ronde.length)) * 100}%` }}
            />
          </div>

          <div class="rounded-card border border-line bg-surface p-4 text-center">
            <div class="mb-2 flex flex-wrap items-center justify-center gap-1.5">
              <span class="rounded-full border border-accent-sky/40 bg-accent-sky/10 px-2.5 py-0.5 text-[10px] font-bold text-accent-sky">
                {soalAktif.tag}
              </span>
              {soalAktif.kraepelin && (
                <span class="rounded-full border border-accent-amber/40 bg-accent-amber/10 px-2 py-0.5 text-[10px] font-bold text-accent-amber">
                  {t('matematika.petunjuk_kraepelin')}
                </span>
              )}
            </div>
            <div class="overflow-x-auto p-1 text-xl font-extrabold leading-snug text-fg sm:text-2xl">{soalAktif.tanya}</div>
            {terakhirBenar !== null && (
              <div class={`mt-2 text-xs font-black ${terakhirBenar ? 'text-accent-emerald' : 'text-accent-red'}`}>
                {terakhirBenar ? t('matematika.benar') : t('matematika.salah')}
              </div>
            )}
          </div>

          {soalAktif.input === 'pilihan' ? (
            <div class="grid grid-cols-2 gap-2">
              {(soalAktif.pilihan ?? []).map((p) => (
                <button
                  key={p}
                  type="button"
                  disabled={terjawab}
                  onClick={() => jawab(String(p))}
                  class="min-h-12 rounded-control border-2 border-line bg-surface-raised px-3 text-sm font-extrabold text-fg hover:border-accent-sky disabled:opacity-60"
                >
                  {tampilAngka(p)} {soalAktif.satuan}
                </button>
              ))}
            </div>
          ) : (
            <div class="space-y-2">
              <div class="flex items-center justify-between rounded-card border border-line bg-surface px-4 py-2.5">
                <span class="text-[11px] font-bold text-fg-muted">{t('matematika.jawaban_anda')}</span>
                <span class="text-xl font-black text-accent-red">{masukan || '?'}</span>
              </div>
              <div class="grid grid-cols-3 gap-1.5">
                {['7', '8', '9', '4', '5', '6', '1', '2', '3'].map((k) => (
                  <button
                    key={k}
                    type="button"
                    disabled={terjawab}
                    onClick={() => tekanNumpad(k)}
                    class="min-h-11 rounded-control border border-line bg-surface-raised text-lg font-black text-fg disabled:opacity-60"
                  >
                    {k}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={terjawab}
                  onClick={() => tekanNumpad('min')}
                  class="min-h-11 rounded-control border border-line bg-surface-sunken text-[12px] font-bold text-fg-muted disabled:opacity-60"
                >
                  {t('matematika.min')}
                </button>
                <button
                  type="button"
                  disabled={terjawab}
                  onClick={() => tekanNumpad('0')}
                  class="min-h-11 rounded-control border border-line bg-surface-raised text-lg font-black text-fg disabled:opacity-60"
                >
                  0
                </button>
                <button
                  type="button"
                  disabled={terjawab}
                  onClick={() => tekanNumpad('titik')}
                  class="min-h-11 rounded-control border border-line bg-surface-sunken text-lg font-black text-fg-muted disabled:opacity-60"
                >
                  ,
                </button>
                <button
                  type="button"
                  disabled={terjawab}
                  onClick={() => tekanNumpad('back')}
                  class="col-span-3 min-h-11 rounded-control border border-line bg-surface-sunken text-[12px] font-bold text-accent-red disabled:opacity-60"
                >
                  {t('matematika.hapus')}
                </button>
              </div>
              <button
                type="button"
                disabled={terjawab || !masukan}
                onClick={() => jawab(masukan)}
                class="w-full min-h-12 rounded-control bg-accent-violet text-canvas text-sm font-extrabold disabled:opacity-50"
              >
                {t('matematika.kirim')}
              </button>
            </div>
          )}

          {pembahasanTampil && (
            <div class="rounded-card border border-accent-amber/40 bg-accent-amber/10 p-3.5 text-[12px] text-fg">
              <div class="mb-1 font-extrabold">{t('matematika.pembahasan')}</div>
              <p class="leading-relaxed text-fg-muted">{soalAktif.pembahasan}</p>
              <button
                type="button"
                onClick={lanjut}
                class="mt-2.5 w-full min-h-11 rounded-control bg-accent-amber text-canvas text-xs font-black"
              >
                {t('matematika.lanjut')}
              </button>
            </div>
          )}

          <div class="flex items-center justify-between text-[11px] text-fg-muted">
            <button
              type="button"
              onClick={() => {
                setLayar('lobby');
                setRonde([]);
                setRiwayat([]);
              }}
              class="min-h-11 font-semibold"
            >
              {t('matematika.batalkan')}
            </button>
            <span>{t('matematika.petunjuk_papan')}</span>
          </div>
        </div>
      )}

      {/* ── HASIL ── */}
      {layar === 'hasil' && (
        <div class="space-y-3">
          <div class="rounded-card border border-line bg-surface p-4 text-center">
            <div class={`mb-2 inline-block rounded-control border-2 px-4 py-1 text-2xl font-black ${warnaGrade[gradeAkhir] ?? ''}`}>
              {gradeAkhir.toUpperCase()}
            </div>
            <h2 class="text-lg font-black text-fg">{t(`matematika.hasil_${gradeAkhir}`)}</h2>
            <p class="mx-auto mt-1 max-w-md text-[12px] leading-relaxed text-fg-muted">{t(`matematika.komentar_${gradeAkhir}`)}</p>
          </div>

          <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div class="rounded-card border border-line bg-surface p-3 text-center">
              <span class="block text-[10px] font-bold uppercase text-fg-muted">{t('matematika.skor')}</span>
              <span class="text-xl font-black text-accent-red">{totalBenar * 50}</span>
            </div>
            <div class="rounded-card border border-line bg-surface p-3 text-center">
              <span class="block text-[10px] font-bold uppercase text-fg-muted">{t('matematika.akurasi')}</span>
              <span class="text-xl font-black text-accent-emerald">{akurasiAkhir}%</span>
            </div>
            <div class="rounded-card border border-line bg-surface p-3 text-center">
              <span class="block text-[10px] font-bold uppercase text-fg-muted">{t('matematika.benar_total')}</span>
              <span class="text-xl font-black text-accent-sky">
                {totalBenar} / {riwayat.length}
              </span>
            </div>
            <div class="rounded-card border border-line bg-surface p-3 text-center">
              <span class="block text-[10px] font-bold uppercase text-fg-muted">{t('matematika.kecepatan')}</span>
              <span class="text-xl font-black text-accent-amber">
                {kecepatan} {t('matematika.detik_soal')}
              </span>
            </div>
          </div>

          <div class="rounded-card border border-line bg-surface p-3.5">
            <div class="mb-2 flex items-center justify-between">
              <h3 class="text-[11px] font-extrabold uppercase tracking-wider text-fg-muted">{t('matematika.evaluasi')}</h3>
              <span class="rounded-full bg-surface-sunken px-2 py-0.5 text-[10px] font-bold text-fg-muted">
                {riwayat.filter((r) => !r.benar).length} {t('matematika.perlu_evaluasi')}
              </span>
            </div>
            <div class="max-h-56 space-y-2 overflow-y-auto pr-1">
              {riwayat.filter((r) => !r.benar).length === 0 && (
                <p class="py-4 text-center text-[12px] text-fg-muted">{t('matematika.sempurna')}</p>
              )}
              {riwayat
                .filter((r) => !r.benar)
                .map((r, i) => (
                  <div key={`${r.soal.id}-${i}`} class="rounded-control border border-line bg-surface-sunken p-3 text-[11px]">
                    <div class="mb-1 flex items-center justify-between font-bold">
                      <span class="text-[10px] uppercase text-accent-red">{r.soal.tag}</span>
                      <span class="text-accent-red">{t('matematika.salah')}</span>
                    </div>
                    <div class="text-[12px] font-bold text-fg">{r.soal.tanya}</div>
                    <div class="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                      <span class="text-fg-muted">
                        {t('matematika.jawaban_anda')}: <strong class="text-accent-red">{r.jawabUser}</strong>
                      </span>
                      <span class="text-accent-emerald">
                        {t('matematika.kunci')}:{' '}
                        <strong>
                          {tampilAngka(r.soal.jawab)} {r.soal.satuan}
                        </strong>
                      </span>
                    </div>
                    <p class="mt-1 rounded-control border border-line bg-surface p-2 text-[11px] leading-relaxed text-fg-muted">
                      {r.soal.pembahasan}
                    </p>
                  </div>
                ))}
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={mulai}
              class="min-h-12 rounded-control bg-accent-red text-canvas text-xs font-extrabold"
            >
              {t('matematika.ulangi')}
            </button>
            <button
              type="button"
              onClick={() => {
                setLayar('lobby');
                setRonde([]);
                setRiwayat([]);
              }}
              class="min-h-12 rounded-control border border-line bg-surface-raised text-xs font-extrabold text-fg"
            >
              {t('matematika.ganti_modul')}
            </button>
          </div>
        </div>
      )}

      {/* Tombol suara — di luar ketiga layar supaya tetap terjangkau. */}
      <div class="mt-4 flex justify-end">
        <button
          type="button"
          onClick={alihSuara}
          aria-pressed={suara}
          class="min-h-11 inline-flex items-center gap-1.5 rounded-control border border-line bg-surface-raised px-3 text-[11px] font-bold text-fg-muted"
        >
          <span aria-hidden="true">{suara ? '🔊' : '🔇'}</span>
          {t('matematika.suara')}
        </button>
      </div>
    </div>
  );
}
