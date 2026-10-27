/**
 * KotobaGame.tsx — minigame hafalan kosakata Jepang (Minna no Nihongo Bab 1–25).
 *
 * ASAL
 * ----
 * Ditulis ulang dari minigame mandiri milik pemilik (`GAME.html`, satu berkas
 * HTML dengan `<style>` dan `<script>` inline). Yang dipertahankan: isi bank,
 * empat cara belajar (kuis pilihan ganda, ketik, flashcard, kamus), filter
 * bab/jenis kata, suara Jepang, dan lembar cetak. Yang TIDAK dipertahankan:
 * warnanya. Berkas aslinya bertema gelap mati (`#0a0e17`, teks `#f8fafc`), dan
 * menempelkannya apa adanya ke portal berarti satu halaman yang mustahil dibaca
 * di tema terang. Di sini semuanya memakai token tema (`bg-surface`, `text-fg`,
 * `text-accent-*`) sehingga kedua tema hidup.
 *
 * GERBANG
 * -------
 * Sama seperti `/wawancara` dan `/ai-cv`: hanya siswa ASJ (tag `[VIP]` atau
 * `[KELAS xx]`). Tiga lapis, dan ketiganya perlu:
 *
 *   1. dasbor kandidat — tombolnya menolak non-siswa dengan toast (UX saja);
 *   2. halaman ini — gerbang login lalu kartu "khusus siswa" (cermin);
 *   3. server — `getBankKotoba` memakai penjaga yang SAMA dengan bank soal
 *      wawancara (`tolakKecualiSiswa`), jadi non-siswa tidak menerima satu kata
 *      pun. Lapis inilah yang sebenarnya; dua di atas hanya supaya orang tidak
 *      menebak-nebak.
 *
 * KENAPA ADA PEMBOBOTAN (dan bukan acak rata)
 * -------------------------------------------
 * Versi aslinya memilih kata dengan `Math.random()` dari seluruh bank, jadi
 * siswa bisa mendapat kata yang sudah hafal tiga kali sementara kata yang selalu
 * salah tidak pernah muncul lagi. Di sini tiap kata punya catatan `salah`/`benar`
 * yang disimpan per kandidat, dan peluang munculnya naik sesuai jumlah kesalahan
 * — versi sederhana dari pengulangan berjarak. Tombol "Ulangi yang salah" adalah
 * kelanjutannya: ronde baru yang isinya HANYA kata yang barusan gagal.
 */
import { useState, useEffect, useRef } from 'preact/hooks';
import { authStore } from '../../store/authReactive';
import { apiClient, type ApiError } from '../../lib/apiClient';
import { validate, kandidatLoginSchema } from '../../lib/schemas';
import { t, useLang } from '../../store/i18n';
import { showToast } from '../Toast';

type JenisKata = 'verb' | 'adj' | 'noun' | 'other';

/** Satu kosakata — bentuknya sama dengan `Kotoba` di `_lib/kotoba/bank.ts`. */
interface Kotoba {
  b: number;
  pos: JenisKata;
  k: string;
  h: string;
  r: string;
  id: string;
}

interface BankRes {
  success?: boolean;
  /** `true` = boleh; `false` = bukan siswa (server sengaja tidak mengirim bank). */
  isVip?: boolean | null;
  jumlah?: number;
  bab?: number[];
  kosakata?: Kotoba[];
  error?: string;
  message?: string;
  sessionInvalid?: boolean;
}

interface Props {
  /** WA dari URL (`?wa=`) atau dari panel admin. */
  waTarget?: string;
  /** Panel admin: lewati gerbang password kandidat (sama seperti MensetsuForm). */
  adminMode?: boolean;
}

type Mode = 'kuis' | 'ketik' | 'flashcard' | 'kamus';
type Arah = 'jp-id' | 'id-jp';

/**
 * Nyawa. SATU-SATUNYA cara ronde berakhir: ronde berjalan terus sampai habis,
 * sama seperti `GAME.html` aslinya. Tidak ada "jumlah soal per ronde".
 */
const NYAWA_AWAL = 3;
/** Batas waktu satu soal kuis. Mode ketik sengaja TANPA batas waktu. */
const DURASI_SOAL_MS = 9000;
/**
 * Jumlah baris kamus yang digambar sekaligus.
 *
 * Terukur 2026-10-27 (Playwright, 390x844, 864 kata): seluruh daftar = 636 ms
 * dan 6 275 node. Di ponsel kelas bawah yang dipakai siswa ASJ itu jadi ~2
 * detik tanpa tanda apa pun. Pencarian tetap melihat SELURUH bank — angka ini
 * hanya menentukan berapa baris yang digambar.
 */
const BATAS_KAMUS = 120;
/** Awalan kunci penyimpanan. Naikkan versinya kalau bentuk data berubah. */
const KUNCI_SIMPAN = 'asj_kotoba_v1:';

/** Satu catatan per kata: berapa kali salah, berapa kali benar. */
interface Catatan {
  salah: number;
  benar: number;
}
interface Progres {
  rekor: number;
  kata: Record<string, Catatan>;
}

/** Kunci unik satu kata. `k`+`h` — dua entri bisa berbagi kanji atau kana,
 *  tapi tidak keduanya (mis. 起きます/おきます vs 置きます/おきます). */
function kunciKata(v: Kotoba): string {
  return `${v.k}|${v.h}`;
}

function bacaProgres(wa: string): Progres {
  try {
    const raw = localStorage.getItem(KUNCI_SIMPAN + wa);
    if (!raw) return { rekor: 0, kata: {} };
    const p = JSON.parse(raw) as Partial<Progres>;
    return {
      rekor: typeof p.rekor === 'number' ? p.rekor : 0,
      kata: p.kata && typeof p.kata === 'object' ? (p.kata as Record<string, Catatan>) : {},
    };
  } catch {
    return { rekor: 0, kata: {} };
  }
}

function tulisProgres(wa: string, p: Progres): void {
  try {
    localStorage.setItem(KUNCI_SIMPAN + wa, JSON.stringify(p));
  } catch {
    /* Mode privat / kuota penuh: rekor hilang, permainan tetap jalan. */
  }
}

/** Salinan acak (Fisher–Yates) — `sort(() => 0.5 - Math.random())` tidak seragam. */
function acak<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Ambil `n` kata TANPA pengulangan, dengan peluang sebanding bobotnya.
 *
 * Bobot: kata baru 3, kata yang sering salah naik sampai 16, kata yang sudah
 * benar tiga kali turun ke 1. Jadi ronde tetap terasa baru (kata baru ikut
 * muncul) tapi condong ke yang belum hafal.
 */
function pilihBerbobot(pool: readonly Kotoba[], n: number, bobot: (v: Kotoba) => number): Kotoba[] {
  const sisa = [...pool];
  const hasil: Kotoba[] = [];
  while (sisa.length > 0 && hasil.length < n) {
    const total = sisa.reduce((s, x) => s + bobot(x), 0);
    let r = Math.random() * total;
    let ambil = sisa.length - 1;
    for (let i = 0; i < sisa.length; i++) {
      r -= bobot(sisa[i]);
      if (r <= 0) {
        ambil = i;
        break;
      }
    }
    hasil.push(sisa.splice(ambil, 1)[0]);
  }
  return hasil;
}

/**
 * Romaji yang "cukup benar" — sengaja longgar.
 *
 * Siswa menulis romaji dengan gaya yang berbeda-beda dan itu bukan kesalahan
 * hafalan: `byouin`/`byōin`, `kenkyuusha`/`kenkyūsha`, `tsu`/`tu`, `shi`/`si`,
 * `sha`/`sya`. Menolak semua itu mengajari ejaan, bukan kosakata. Kedua sisi
 * dinormalkan dengan fungsi yang sama, jadi yang dibandingkan adalah bentuk
 * kanoniknya.
 */
function normalRomaji(s: string): string {
  return s
    .toLowerCase()
    .replace(/\[na\]/g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z]/g, '')
    .replace(/sya/g, 'sha')
    .replace(/syu/g, 'shu')
    .replace(/syo/g, 'sho')
    .replace(/zya/g, 'ja')
    .replace(/zyu/g, 'ju')
    .replace(/zyo/g, 'jo')
    .replace(/tya/g, 'cha')
    .replace(/tyu/g, 'chu')
    .replace(/tyo/g, 'cho')
    .replace(/tu/g, 'tsu')
    .replace(/si/g, 'shi')
    .replace(/ti/g, 'chi')
    .replace(/hu/g, 'fu')
    .replace(/zi/g, 'ji')
    /* `tch` → `cch`: satu-satunya kata di bank yang memakainya adalah
       サンドイッチ, dan romaji bakunya `sandoitchi` sementara konverter
       kana menghasilkan `sandoicchi`. Keduanya ejaan yang benar, jadi
       keduanya disamakan di sini alih-alih memilih satu dan menolak yang lain. */
    .replace(/tch/g, 'cch')
    .replace(/ou/g, 'o')
    .replace(/oo/g, 'o')
    .replace(/uu/g, 'u')
    .replace(/aa/g, 'a')
    .replace(/ee/g, 'e')
    .replace(/ii/g, 'i');
}

/** `?wa=` pada URL — pengisi awal, bukan token (pola yang sama dengan /ai-cv). */
function waFromUrl(): string {
  if (typeof window === 'undefined') return '';
  try {
    return new URLSearchParams(window.location.search).get('wa') || '';
  } catch {
    return '';
  }
}

/** Teks jawaban satu kata untuk arah tertentu. */
function teksJawaban(v: Kotoba, arah: Arah): string {
  return arah === 'jp-id' ? v.id : `${v.k} 【${v.h}】`;
}

export default function KotobaGame({ waTarget = '', adminMode = false }: Props) {
  useLang(); // langganan bahasa: tanpa ini `t()` tidak dirender ulang saat toggle
  const auth = authStore.get();
  const admin = auth.role === 'admin';

  /* ── gerbang login (pola sama dengan MensetsuForm.gateLogin) ───────────── */
  const [loginGate, setLoginGate] = useState(!adminMode && !auth.isLoggedIn);
  const [gateWa, setGateWa] = useState(waFromUrl() || waTarget);
  const [gatePass, setGatePass] = useState('');
  const [gateMsg, setGateMsg] = useState('');
  const [wa, setWa] = useState(
    waTarget || (auth.role === 'admin' ? waFromUrl() : '') || (auth.isLoggedIn ? auth.wa || '' : ''),
  );

  const [memuat, setMemuat] = useState(false);
  const [galat, setGalat] = useState('');
  /** `null` = belum/tidak diketahui. Jangan putuskan apa pun saat masih null. */
  const [vip, setVip] = useState<boolean | null>(null);
  const [bank, setBank] = useState<Kotoba[]>([]);
  const [daftarBab, setDaftarBab] = useState<number[]>([]);
  const [progres, setProgres] = useState<Progres>({ rekor: 0, kata: {} });

  /* ── filter & mode ─────────────────────────────────────────────────────── */
  const [mode, setMode] = useState<Mode>('kuis');
  const [babFilter, setBabFilter] = useState('all');
  const [posFilter, setPosFilter] = useState('all');
  const [arah, setArah] = useState<Arah>('jp-id');

  /* ── ronde kuis / ketik ────────────────────────────────────────────────── */
  /**
   * TAK ADA BATAS SOAL. Ronde berjalan sampai nyawa habis — sama seperti
   * `GAME.html` aslinya, dan itu yang diminta pemilik 2026-10-27 ("gak kek
   * game html yg asli sampai nyawanya mati"). Versi pertama di portal memakai
   * 10 soal per ronde; akibatnya permainan berhenti bukan karena siswa salah,
   * tapi karena daftar soal habis — dan di bank kecil malah berhenti setelah 5.
   */
  const [soal, setSoal] = useState<Kotoba | null>(null);
  /** Nomor soal yang sedang tampil (1-based). Saat hasil, = jumlah soal dijawab. */
  const [soalKe, setSoalKe] = useState(0);
  const [pilihan, setPilihan] = useState<string[]>([]);
  const [dijawab, setDijawab] = useState<string | null>(null);
  const [benar, setBenar] = useState<boolean | null>(null);
  const [ketikan, setKetikan] = useState('');
  const [tampilKunci, setTampilKunci] = useState(false);
  const [skor, setSkor] = useState(0);
  const [hp, setHp] = useState(NYAWA_AWAL);
  const [kombo, setKombo] = useState(0);
  const [jumlahBenar, setJumlahBenar] = useState(0);
  const [salahKata, setSalahKata] = useState<Kotoba[]>([]);
  const [fase, setFase] = useState<'tanya' | 'hasil'>('tanya');
  const [sisaWaktu, setSisaWaktu] = useState(100);
  /**
   * Kantong kata untuk "ulangi yang salah". `null` = ronde normal (soal
   * ditarik dari `pool` berbobot). Kalau kantong habis, ia diisi ulang —
   * jadi mode ulangan pun berjalan sampai nyawa habis, bukan berhenti setelah
   * semua kata salah tampil sekali.
   */
  const [kantong, setKantong] = useState<Kotoba[] | null>(null);

  /**
   * Suara otomatis. Dulu setiap soal HARUS dipencet 🔊 dulu; pemilik meminta
   * suara langsung keluar seperti versi HTML aslinya. Pilihannya diingat
   * (satu peramban, bukan per kandidat — ini preferensi alat, bukan progres).
   */
  const [suaraOtomatis, setSuaraOtomatis] = useState<boolean>(() => {
    try {
      return localStorage.getItem('asj_kotoba_suara') !== '0';
    } catch {
      return true;
    }
  });

  /* ── flashcard ─────────────────────────────────────────────────────────── */
  const [kartuIdx, setKartuIdx] = useState(0);
  const [balik, setBalik] = useState(false);

  /* ── kamus ─────────────────────────────────────────────────────────────── */
  const [cari, setCari] = useState('');
  /**
   * Kamus menampilkan 120 baris pertama dulu, sisanya lewat tombol.
   *
   * Terukur 2026-10-27 (Playwright, 390x844, 864 kata): merender SELURUH daftar
   * memakan 636 ms dan 6 275 node. Di ponsel kelas bawah yang ASJ pakai, angka
   * itu jadi ~2 detik menunggu tanpa tanda apa pun. 120 baris cukup untuk
   * menggulir dan mencari, dan pencarian selalu melihat SELURUH daftar — batas
   * ini hanya soal berapa yang digambar, bukan berapa yang bisa dicari.
   */
  const [tampilSemua, setTampilSemua] = useState(false);

  /**
   * Pegangan ke handler jawab TERBARU untuk timer.
   *
   * Timer hidup di dalam `useEffect` yang tidak boleh bergantung pada
   * `jawabSoal` (fungsi itu dibuat ulang setiap render, jadi memasukkannya ke
   * daftar dependensi akan me-reset interval 10x per detik — soal tidak akan
   * pernah kehabisan waktu). Ref memberi versi terbaru tanpa ikut jadi
   * dependensi.
   */
  const jawabRef = useRef<(pilih: string | null) => void>(() => {});

  /**
   * Pegangan ke `muat` versi TERBARU.
   *
   * `muat` adalah fungsi biasa yang dibuat ulang setiap render, jadi
   * memasukkannya ke daftar dependensi sebuah `useEffect` akan membuat efek
   * pemuat jalan di setiap render — artinya satu permintaan HTTP per render.
   * Ref memberi versi terbaru tanpa ikut menjadi dependensi; yang menentukan
   * "perlu muat ulang" hanyalah WA dan status gerbang.
   */
  const muatRef = useRef<(nomor: string) => void>(() => {});

  /* ── muat bank ─────────────────────────────────────────────────────────── */
  const muat = async (nomor: string) => {
    if (!nomor) return;
    setMemuat(true);
    setGalat('');
    try {
      const d = await apiClient<BankRes>('getBankKotoba', [nomor], {
        onSessionInvalid: 'throw',
        silent: true,
      });
      if (d.sessionInvalid) {
        if (adminMode) {
          setGalat(t('kotoba.galat_sesi_admin'));
          return;
        }
        setLoginGate(true);
        setGateMsg(t('kotoba.galat_sesi'));
        return;
      }
      /* Bukan siswa ASJ: server menjawab `success:false` + `isVip:false` TANPA
         bank. Jangan lanjut ke "bank kosong" — itu menyalahkan data, padahal
         yang kurang adalah status siswa. */
      if (d.success === false && d.isVip === false) {
        setVip(false);
        setBank([]);
        return;
      }
      const daftar = Array.isArray(d.kosakata) ? d.kosakata : [];
      setBank(daftar);
      setVip(typeof d.isVip === 'boolean' ? d.isVip : null);
      setDaftarBab(Array.isArray(d.bab) ? d.bab : []);
      if (!daftar.length) setGalat(t('kotoba.bank_kosong'));
    } catch (e) {
      const err = e as ApiError;
      setGalat(err?.message || t('kotoba.galat_muat'));
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

  // Progres per kandidat: dibaca saat WA diketahui, ditulis setiap berubah.
  useEffect(() => {
    if (!wa) return;
    setProgres(bacaProgres(wa));
  }, [wa]);
  useEffect(() => {
    if (!wa) return;
    tulisProgres(wa, progres);
  }, [wa, progres]);

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
      setGateMsg(err.status ? t('kotoba.galat_login') : t('kotoba.galat_koneksi'));
    }
  };

  /* ── turunan ───────────────────────────────────────────────────────────── */
  const pool = bank.filter(
    (v) => (babFilter === 'all' || v.b === Number(babFilter)) && (posFilter === 'all' || v.pos === posFilter),
  );

  const bobot = (v: Kotoba): number => {
    const c = progres.kata[kunciKata(v)];
    if (!c) return 3;
    return Math.max(1, 1 + Math.min(c.salah, 5) * 3 - Math.min(c.benar, 3));
  };

  const item = fase === 'tanya' ? soal : null;
  const teksBenar = item ? teksJawaban(item, arah) : '';

  /**
   * Tiga pilihan salah + satu benar.
   *
   * Versi aslinya mengambil pengecoh dari SELURUH bank, jadi soal Bab 1 bisa
   * menawarkan arti dari Bab 25 — secara teknis benar, secara belajar berisik.
   * Di sini pengecoh diambil dari lingkup terdekat dulu (bab sama, lalu jenis
   * kata sama, baru seluruh bank), dan teks yang sudah dipakai tidak dipakai
   * lagi: dua opsi identik membuat soal mustahil dijawab pasti.
   */
  const buatPilihan = (v: Kotoba, dasar: readonly Kotoba[], a: Arah): string[] => {
    const pakai = new Set<string>([teksJawaban(v, a)]);
    const salah: string[] = [];
    const lapis = [dasar.filter((x) => x.b === v.b), dasar.filter((x) => x.pos === v.pos), dasar, bank];
    for (const sumber of lapis) {
      for (const kandidat of acak(sumber)) {
        if (salah.length >= 3) break;
        const tx = teksJawaban(kandidat, a);
        if (pakai.has(tx)) continue;
        pakai.add(tx);
        salah.push(tx);
      }
      if (salah.length >= 3) break;
    }
    return acak([teksJawaban(v, a), ...salah]);
  };

  /**
   * Satu kata berikutnya, berbobot, dan tidak mengulang kata yang barusan
   * tampil (kalau pool-nya lebih dari satu kata). Mengulang kata yang sama
   * dua kali berurutan terasa seperti bug, bukan latihan.
   */
  const tarikSoal = (dasar: readonly Kotoba[], kecuali: Kotoba | null): Kotoba | null => {
    const calon =
      dasar.length > 1 && kecuali ? dasar.filter((v) => kunciKata(v) !== kunciKata(kecuali)) : dasar;
    const hasil = pilihBerbobot(calon.length ? calon : dasar, 1, bobot);
    return hasil[0] || null;
  };

  /** Pasang satu soal ke layar (atau akhiri ronde kalau tidak ada kata). */
  const pasangSoal = (kata: Kotoba | null, dasar: readonly Kotoba[], nomor: number) => {
    setSoal(kata);
    setSoalKe(kata ? nomor : nomor - 1);
    setDijawab(null);
    setBenar(null);
    setKetikan('');
    setTampilKunci(false);
    setSisaWaktu(100);
    if (!kata) {
      setFase('hasil');
      setPilihan([]);
      return;
    }
    setFase('tanya');
    setPilihan(buatPilihan(kata, dasar, arah));
  };

  const mulaiRonde = (khusus?: readonly Kotoba[]) => {
    setSkor(0);
    setHp(NYAWA_AWAL);
    setKombo(0);
    setJumlahBenar(0);
    setSalahKata([]);
    if (khusus?.length) {
      const bag = acak(khusus);
      setKantong(bag);
      pasangSoal(bag[0] ?? null, khusus, 1);
      return;
    }
    setKantong(null);
    pasangSoal(tarikSoal(pool, null), pool, 1);
  };

  // Ronde dimulai ulang setiap kali bank/filter/arah/mode berubah. Ditulis
  // sebagai efek, bukan dipanggil dari handler, supaya tidak ada jalur di mana
  // soal yang tampil berasal dari filter yang sudah tidak berlaku.
  //
  // SUPPRESS INI DISENGAJA, bukan malas. `mulaiRonde` dibuat ulang setiap
  // render (ia membaca `pool`/`bobot` dari render itu), jadi menambahkannya ke
  // daftar dependensi membuat efek ini jalan SETIAP render — dan setiap jalannya
  // me-reset ronde, sehingga tidak ada soal yang pernah bisa dijawab. Yang
  // benar-benar menentukan isi ronde adalah tujuh nilai di bawah, dan ketujuhnya
  // ada di daftar.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mulaiRonde dibuat ulang tiap render; filter/arah di daftar adalah masukan sebenarnya
  useEffect(() => {
    if (!bank.length) return;
    if (mode !== 'kuis' && mode !== 'ketik') return;
    if (loginGate || vip === false) return;
    mulaiRonde();
  }, [bank, babFilter, posFilter, arah, mode, loginGate, vip]);

  /** Catat satu jawaban ke progres (dipakai pembobotan ronde berikutnya). */
  const catat = (v: Kotoba, tepat: boolean) => {
    const kunci = kunciKata(v);
    setProgres((p) => {
      const c = p.kata[kunci] || { salah: 0, benar: 0 };
      return {
        ...p,
        kata: { ...p.kata, [kunci]: tepat ? { ...c, benar: c.benar + 1 } : { ...c, salah: c.salah + 1 } },
      };
    });
  };

  /**
   * Soal berikutnya. Ronde hanya berakhir kalau nyawa habis — tidak ada
   * "daftar soal habis", karena memang tidak ada daftar: kata ditarik satu per
   * satu dari bank berbobot.
   */
  const lanjut = (hpBaru: number) => {
    if (hpBaru <= 0) {
      setFase('hasil');
      return;
    }
    if (kantong) {
      const sisa = kantong.slice(1);
      // Kantong habis = ulangi kumpulan kata salah itu dari awal (diacak
      // ulang). Mode ulangan pun berjalan sampai nyawa habis.
      const isi = sisa.length ? sisa : acak(kantong);
      setKantong(isi);
      pasangSoal(isi[0] ?? null, kantong, soalKe + 1);
      return;
    }
    pasangSoal(tarikSoal(pool, soal), pool, soalKe + 1);
  };

  /** Inti penilaian — dipakai kuis (pilihan) dan ketik (romaji). */
  const terapkan = (tepat: boolean) => {
    if (!item || benar !== null) return;
    const hpBaru = tepat ? hp : hp - 1;
    const poin = (mode === 'ketik' ? 15 : 10) + kombo * 2;
    setBenar(tepat);
    setHp(hpBaru);
    setSkor(tepat ? skor + poin : skor);
    setKombo(tepat ? kombo + 1 : 0);
    if (tepat) setJumlahBenar((n) => n + 1);
    else setSalahKata((a) => [...a, item]);
    catat(item, tepat);
    // Jeda membaca: cukup lama untuk melihat kunci jawaban, cukup pendek agar
    // tidak terasa menunggu. Efek samping di dalam setTimeout, bukan useEffect,
    // supaya nilai hp yang dipakai adalah yang baru saja dihitung.
    window.setTimeout(() => lanjut(hpBaru), tepat ? 750 : 1400);
  };

  const jawabSoal = (pilih: string | null) => {
    if (!item || benar !== null) return;
    setDijawab(pilih);
    terapkan(pilih !== null && pilih === teksJawaban(item, arah));
  };
  jawabRef.current = jawabSoal;

  const cekKetikan = () => {
    if (!item || benar !== null) return;
    if (!ketikan.trim()) return;
    terapkan(normalRomaji(ketikan) === normalRomaji(item.r));
  };

  // Batas waktu — hanya mode kuis. Mode ketik sengaja tanpa batas: yang dilatih
  // di sana adalah mengingat ejaan, dan stopwatch membuat orang menebak.
  useEffect(() => {
    if (mode !== 'kuis' || fase !== 'tanya' || benar !== null || !item) return;
    const mulai = Date.now();
    const id = window.setInterval(() => {
      const lewat = Date.now() - mulai;
      const s = Math.max(0, 100 - (lewat / DURASI_SOAL_MS) * 100);
      setSisaWaktu(s);
      if (s <= 0) {
        window.clearInterval(id);
        jawabRef.current(null);
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [mode, fase, benar, item]);

  // Rekor diperbarui saat ronde berakhir — di satu tempat, bukan di setiap
  // penambahan skor (kalau tidak, "rekor" berubah di tengah ronde).
  useEffect(() => {
    if (fase !== 'hasil') return;
    setProgres((p) => (p.rekor >= skor ? p : { ...p, rekor: skor }));
  }, [fase, skor]);

  /**
   * Pintasan papan tombol — 1–4 menjawab, Spasi membalik kartu.
   *
   * Versi asli punya keduanya dan teks petunjuknya sudah menyebutkan angka
   * 1–4; tanpa handler ini petunjuk itu akan berbohong. Abaikan saat fokus ada
   * di input (mode ketik) supaya mengetik "1" tidak menjawab soal.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (mode === 'kuis' && benar === null) {
        const n = Number(e.key);
        if (n >= 1 && n <= 4) {
          const opsi = pilihan[n - 1];
          if (opsi) {
            e.preventDefault();
            jawabRef.current(opsi);
          }
        }
        return;
      }
      if (mode === 'flashcard' && e.code === 'Space') {
        e.preventDefault();
        setBalik((b) => !b);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, benar, pilihan]);

  /**
   * Suara Jepang.
   *
   * `diam` = jangan beri toast saat perangkat tidak punya suara. Bunyi otomatis
   * memanggil ini untuk SETIAP soal, jadi tanpa `diam` satu perangkat tanpa
   * TTS akan menumpuk puluhan toast yang sama.
   */
  const ucapkan = (teks: string, diam = false) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      if (!diam) showToast(t('kotoba.audio_tidak_ada'), 'info');
      return;
    }
    window.speechSynthesis.cancel();
    /* `window.SpeechSynthesisUtterance`, BUKAN nama telanjangnya: indexer
       mencatat referensi global yang tidak dikenal sebagai `unresolvedRefs`,
       dan `SpeechSynthesisUtterance` tidak ada di daftar lib-nya — satu nama
       telanjang di sini menaikkan gerbang `prodGenuine` dari 0 ke 1. */
    const u = new window.SpeechSynthesisUtterance(teks);
    u.lang = 'ja-JP';
    u.rate = 0.85;
    window.speechSynthesis.speak(u);
  };

  /**
   * Bacakan soal baru otomatis.
   *
   * Pemilik 2026-10-27: "suaranya kok harus pencet dulu". Versi aslinya memang
   * membacakan setiap soal baru; di portal ini sempat dijadikan manual karena
   * takut diblokir autoplay — padahal `speechSynthesis` tidak tunduk pada
   * kebijakan autoplay media. Sekarang dibacakan langsung, dan tombol di kop
   * bisa mematikannya (pilihan diingat).
   *
   * Syaratnya arah Jepang→Indonesia: kalau soalnya berbahasa Indonesia,
   * membacakan cara baca Jepang berarti membocorkan jawabannya.
   *
   * `ucapkan` sengaja TIDAK masuk daftar dependensi: ia dibuat ulang setiap
   * render, dan memasukkannya akan membacakan soal yang sama berulang kali di
   * setiap render (skor berubah → soal dibacakan lagi). Yang menentukan
   * pembacaan hanyalah soal yang tampil, fase, arah, dan pilihan pengguna.
   */
  // biome-ignore lint/correctness/useExhaustiveDependencies: pembacaan dipicu oleh soal/fase/arah, bukan identitas fungsi ucapkan
  useEffect(() => {
    if (!suaraOtomatis) return;
    if (fase !== 'tanya' || !soal) return;
    if (mode !== 'kuis' && mode !== 'ketik') return;
    if (arah !== 'jp-id') return;
    ucapkan(soal.h, true);
  }, [soal, fase, mode, arah, suaraOtomatis]);

  const alihSuara = () => {
    const baru = !suaraOtomatis;
    setSuaraOtomatis(baru);
    try {
      localStorage.setItem('asj_kotoba_suara', baru ? '1' : '0');
    } catch {
      /* Mode privat: pilihan tidak diingat, tapi tetap berlaku di sesi ini. */
    }
    if (!baru && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  };

  const labelPos: Record<JenisKata, string> = {
    verb: t('kotoba.pos_verb'),
    adj: t('kotoba.pos_adj'),
    noun: t('kotoba.pos_noun'),
    other: t('kotoba.pos_other'),
  };

  /* ── render: gerbang login ─────────────────────────────────────────────── */
  if (loginGate) {
    return (
      <section
        aria-label={t('kotoba.gate_title')}
        class="max-w-md mx-auto my-8 rounded-card border border-line bg-surface p-6"
      >
        <h2 class="text-base font-black text-fg mb-1">{t('kotoba.gate_title')}</h2>
        <p class="text-[12px] text-fg-muted mb-4">{t('kotoba.gate_desc')}</p>
        <label for="kotoba-gate-wa" class="block text-[11px] font-bold text-fg mb-1">
          {t('kotoba.gate_wa')}
        </label>
        <input
          id="kotoba-gate-wa"
          type="tel"
          value={gateWa}
          onInput={(e) => setGateWa((e.target as HTMLInputElement).value)}
          placeholder="08xxxxxxxxxx"
          class="w-full mb-3 rounded-control bg-surface-sunken border border-line px-3 py-2 min-h-11 text-sm text-fg"
        />
        <label for="kotoba-gate-pass" class="block text-[11px] font-bold text-fg mb-1">
          {t('kotoba.gate_pass')}
        </label>
        <input
          id="kotoba-gate-pass"
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
          {t('kotoba.gate_submit')}
        </button>
      </section>
    );
  }

  /* ── render: khusus siswa ASJ ──────────────────────────────────────────── */
  if (!admin && vip === false) {
    return (
      <section
        aria-label={t('kotoba.khusus_vip_judul')}
        data-testid="kotoba-khusus-vip"
        class="max-w-md mx-auto my-8 rounded-card border border-line bg-surface p-6 text-center"
      >
        <h2 class="text-base font-black text-fg mb-2">{t('kotoba.khusus_vip_judul')}</h2>
        <p class="text-[12.5px] text-fg-muted leading-relaxed">{t('kotoba.khusus_vip_isi')}</p>
      </section>
    );
  }

  /* ── render: memuat / galat ────────────────────────────────────────────── */
  if (memuat && !bank.length) {
    return (
      <p data-testid="kotoba-memuat" class="max-w-md mx-auto my-8 text-center text-sm text-fg-muted">
        {t('kotoba.memuat')}
      </p>
    );
  }
  if (galat && !bank.length) {
    return (
      <section class="max-w-md mx-auto my-8 rounded-card border border-line bg-surface p-6 text-center">
        <p data-testid="kotoba-galat" class="text-sm text-accent-red mb-4">
          {galat}
        </p>
        <button
          type="button"
          onClick={() => void muat(wa)}
          class="min-h-11 px-5 rounded-control bg-accent-violet text-canvas text-sm font-bold"
        >
          {t('kotoba.coba_lagi')}
        </button>
      </section>
    );
  }

  const kartu = pool.length ? pool[kartuIdx % pool.length] : undefined;
  const kataDikuasai = Object.values(progres.kata).filter((c) => c.benar >= 3 && c.salah === 0).length;
  const kueri = cari.trim().toLowerCase();
  const hasilCari = kueri
    ? pool.filter(
        (v) =>
          v.k.includes(cari.trim()) ||
          v.h.includes(cari.trim()) ||
          v.r.toLowerCase().includes(kueri) ||
          v.id.toLowerCase().includes(kueri),
      )
    : pool;

  /** Yang benar-benar digambar: pencarian selalu penuh, tanpa pencarian dibatasi. */
  const tampilKamus = kueri || tampilSemua ? hasilCari : hasilCari.slice(0, BATAS_KAMUS);

  /**
   * Cetak HARUS memuat seluruh daftar, bukan 120 baris yang sedang tampil.
   *
   * `tampilSemua` dinyalakan dulu, lalu dua `requestAnimationFrame` — pola yang
   * sama dengan `MensetsuForm.cetak()`. Satu frame belum cukup: `window.print()`
   * memotret DOM yang sudah ditata, dan 864 baris butuh satu frame penuh untuk
   * masuk. Tanpa jeda itu yang tercetak masih daftar yang pendek.
   */
  const cetakKamus = () => {
    setTampilSemua(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => window.print());
    });
  };

  const modeTab: { id: Mode; label: string }[] = [
    { id: 'kuis', label: t('kotoba.mode_kuis') },
    { id: 'ketik', label: t('kotoba.mode_ketik') },
    { id: 'flashcard', label: t('kotoba.mode_flashcard') },
    { id: 'kamus', label: t('kotoba.mode_kamus') },
  ];

  return (
    <div class="max-w-3xl mx-auto">
      {/* ── Kop ── */}
      {/* Judul di sini SR-ONLY: halaman sudah punya `h1` "Latihan Kosakata
          Jepang", dan mengulanginya sebagai `h2` membuat satu layar dibuka
          dengan kalimat yang sama dua kali. Heading-nya tetap ada supaya
          outline halaman tidak melompat h1 -> h3 (hasil ronde). */}
      <header class="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 class="sr-only">{t('kotoba.judul')}</h2>
        <p class="text-[12px] text-fg-muted">
          {bank.length} {t('kotoba.kata_tersedia')} · {kataDikuasai} {t('kotoba.kata_dikuasai')} ·{' '}
          {t('kotoba.rekor')} {progres.rekor}
        </p>
        {/* Saklar suara otomatis. Teksnya berubah, bukan cuma ikon: ikon 🔊/🔇
            saja tidak memberi tahu mana yang sedang aktif. */}
        <button
          type="button"
          onClick={alihSuara}
          aria-pressed={suaraOtomatis}
          class={`min-h-11 inline-flex items-center gap-1.5 px-3 rounded-control border text-[12px] font-bold transition-colors motion-reduce:transition-none ${
            suaraOtomatis
              ? 'border-accent-sky/60 text-accent-sky bg-accent-sky/10'
              : 'border-line text-fg-muted bg-surface-raised'
          }`}
        >
          <span aria-hidden="true">{suaraOtomatis ? '🔊' : '🔇'}</span>
          {t('kotoba.suara_otomatis')}
        </button>
      </header>

      {/* ── Tab mode ── */}
      <div class="flex gap-1.5 p-1 rounded-control bg-surface-sunken border border-line mb-3">
        {modeTab.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            aria-pressed={mode === m.id}
            class={`flex-1 min-h-11 px-2 rounded-[0.6rem] text-[12px] font-bold transition-colors motion-reduce:transition-none ${
              mode === m.id
                ? 'bg-accent-violet text-canvas'
                : 'text-fg-muted hover:text-fg hover:bg-surface-raised'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* ── Filter ── */}
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
        <select
          aria-label={t('kotoba.filter_bab')}
          value={babFilter}
          onChange={(e) => setBabFilter((e.target as HTMLSelectElement).value)}
          class="min-h-11 rounded-control bg-surface-sunken border border-line px-2 text-[12px] text-fg"
        >
          <option value="all">{t('kotoba.semua_bab')}</option>
          {daftarBab.map((b) => (
            <option key={b} value={String(b)}>
              {t('kotoba.bab')} {b}
            </option>
          ))}
        </select>
        <select
          aria-label={t('kotoba.filter_jenis')}
          value={posFilter}
          onChange={(e) => setPosFilter((e.target as HTMLSelectElement).value)}
          class="min-h-11 rounded-control bg-surface-sunken border border-line px-2 text-[12px] text-fg"
        >
          <option value="all">{t('kotoba.semua_jenis')}</option>
          <option value="verb">{t('kotoba.pos_verb')}</option>
          <option value="adj">{t('kotoba.pos_adj')}</option>
          <option value="noun">{t('kotoba.pos_noun')}</option>
          <option value="other">{t('kotoba.pos_other')}</option>
        </select>
        <select
          aria-label={t('kotoba.filter_arah')}
          value={arah}
          onChange={(e) => setArah((e.target as HTMLSelectElement).value as Arah)}
          class="col-span-2 sm:col-span-1 min-h-11 rounded-control bg-surface-sunken border border-line px-2 text-[12px] text-fg"
        >
          <option value="jp-id">{t('kotoba.arah_jp_id')}</option>
          <option value="id-jp">{t('kotoba.arah_id_jp')}</option>
        </select>
      </div>

      {!pool.length && (
        <p class="text-center text-sm text-fg-muted py-6">{t('kotoba.kosong')}</p>
      )}

      {/* ── KUIS / KETIK ── */}
      {pool.length > 0 && (mode === 'kuis' || mode === 'ketik') && (
        <section class="rounded-card border border-line bg-surface p-4 md:p-5">
          {fase === 'tanya' && item ? (
            <>
              {/* HUD */}
              <div class="flex items-center justify-between gap-2 text-[11px] text-fg-muted mb-2">
                {/* Hati hanya bisa dibaca sebagai gambar: tanpa `role="img"`
                    + nama, pembaca layar menerima karakter ❤/♡ mentah dan
                    `aria-label` pada <span> biasa diabaikan (biome:
                    useAriaPropsSupportedByRole). Warnanya accent-red, bukan
                    warna teks: `❤` tanpa VS16 digambar sebagai GLIF TEKS,
                    jadi di tema terang ia jadi abu-abu gelap di atas kertas
                    putih — nyawa terlihat seperti coretan. */}
                <span
                  role="img"
                  aria-label={`${t('kotoba.nyawa')}: ${hp}/${NYAWA_AWAL}`}
                  class="text-accent-red"
                >
                  {Array.from({ length: NYAWA_AWAL }, (_, i) => (i < hp ? '❤' : '♡')).join(' ')}
                </span>
                <span>
                  {t('kotoba.skor')} <strong class="text-fg">{skor}</strong>
                  {kombo >= 2 && <span class="text-accent-amber font-bold"> · {kombo}×</span>}
                </span>
                <span>
                  {soalKe}
                </span>
              </div>

              {/* Batas waktu — hanya kuis */}
              {mode === 'kuis' && (
                <div
                  class="h-1.5 w-full rounded-pill bg-surface-sunken overflow-hidden mb-3"
                  role="progressbar"
                  aria-label={t('kotoba.sisa_waktu')}
                  aria-valuenow={Math.round(sisaWaktu)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    class="h-full bg-accent-sky origin-left"
                    style={`transform:scaleX(${sisaWaktu / 100})`}
                  />
                </div>
              )}

              {/* Soal */}
              <div class="text-center py-5">
                <div class="flex justify-center gap-1.5 mb-2">
                  <span class="px-2 py-0.5 rounded-pill bg-accent-sky/15 text-accent-sky text-[10px] font-bold">
                    {t('kotoba.bab')} {item.b}
                  </span>
                  <span class="px-2 py-0.5 rounded-pill bg-accent-amber/15 text-accent-amber text-[10px] font-bold">
                    {labelPos[item.pos]}
                  </span>
                </div>
                <p
                  data-testid="kotoba-soal"
                  class="text-3xl md:text-4xl font-black text-fg leading-tight break-words"
                >
                  {mode === 'ketik' ? item.k : arah === 'jp-id' ? item.k : item.id}
                </p>
                <p class="text-[13px] text-fg-muted mt-1">
                  {mode === 'ketik'
                    ? item.id
                    : arah === 'jp-id'
                      ? `${item.h} (${item.r})`
                      : t('kotoba.pilih_kotoba')}
                </p>
                <button
                  type="button"
                  onClick={() => ucapkan(item.h)}
                  class="mt-2 min-h-11 min-w-11 inline-flex items-center justify-center rounded-pill border border-line text-fg-muted hover:text-fg hover:border-accent-sky transition-colors motion-reduce:transition-none"
                  aria-label={t('kotoba.dengarkan')}
                >
                  🔊
                </button>
              </div>

              {/* Jawaban */}
              {mode === 'kuis' ? (
                <div class="grid gap-2">
                  {pilihan.map((opsi, i) => {
                    const sudah = benar !== null;
                    const iniBenar = opsi === teksBenar;
                    const iniDipilih = opsi === dijawab;
                    let gaya = 'bg-surface-raised border-line hover:border-accent-sky';
                    if (sudah && iniBenar) gaya = 'bg-accent-emerald/15 border-accent-emerald text-accent-emerald';
                    else if (sudah && iniDipilih) gaya = 'bg-accent-red/15 border-accent-red text-accent-red';
                    else if (sudah) gaya = 'bg-surface-raised border-line opacity-60';
                    return (
                      <button
                        key={opsi}
                        type="button"
                        disabled={sudah}
                        onClick={() => jawabSoal(opsi)}
                        class={`w-full min-h-11 flex items-center justify-between gap-2 px-4 py-3 rounded-control border text-left text-sm font-medium text-fg transition-colors motion-reduce:transition-none ${gaya}`}
                      >
                        <span class="break-words">{opsi}</span>
                        <span class="shrink-0 text-[10px] text-fg-muted border border-line rounded px-1.5">
                          {i + 1}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div>
                  <label for="kotoba-ketik" class="block text-[11px] font-bold text-fg mb-1">
                    {t('kotoba.ketik_label')}
                  </label>
                  <div class="flex gap-2">
                    <input
                      id="kotoba-ketik"
                      type="text"
                      autocomplete="off"
                      autocapitalize="off"
                      spellcheck={false}
                      value={ketikan}
                      disabled={benar !== null}
                      onInput={(e) => setKetikan((e.target as HTMLInputElement).value)}
                      onKeyDown={(e) => {
                        if ((e as KeyboardEvent).key === 'Enter') cekKetikan();
                      }}
                      placeholder="romaji"
                      class="flex-1 min-h-11 rounded-control bg-surface-sunken border border-line px-3 text-sm text-fg"
                    />
                    <button
                      type="button"
                      onClick={cekKetikan}
                      disabled={benar !== null}
                      class="min-h-11 px-4 rounded-control bg-accent-violet text-canvas text-sm font-bold"
                    >
                      {t('kotoba.periksa')}
                    </button>
                  </div>
                  {benar === false && !tampilKunci && (
                    <button
                      type="button"
                      onClick={() => setTampilKunci(true)}
                      class="mt-2 text-[12px] text-accent-sky underline"
                    >
                      {t('kotoba.lihat_kunci')}
                    </button>
                  )}
                </div>
              )}

              {/* Umpan balik — live region supaya pembaca layar ikut tahu */}
              <div role="status" class="mt-3 min-h-6 text-center text-[13px] font-bold">
                {benar === true && <span class="text-accent-emerald">{t('kotoba.benar')}</span>}
                {benar === false && (
                  <span class="text-accent-red">
                    {dijawab === null && mode === 'kuis' ? t('kotoba.waktu_habis') : t('kotoba.salah')}
                    {' — '}
                    <span class="text-fg">
                      {item.k} 【{item.h}】 = {item.id}
                    </span>
                  </span>
                )}
                {mode === 'ketik' && (benar === false || tampilKunci) && (
                  <span class="block text-[12px] font-normal text-fg-muted mt-1">{item.r}</span>
                )}
              </div>

              {/* Petunjuk papan tombol hanya di mode kuis — di mode ketik
                  angka 1–4 adalah isi jawaban, bukan pilihan. */}
              {mode === 'kuis' && (
                <p class="mt-2 text-center text-[11px] text-fg-muted">{t('kotoba.petunjuk_papan')}</p>
              )}
            </>
          ) : (
            /* ── HASIL RONDE ── */
            <div data-testid="kotoba-hasil">
              <h3 class="text-base font-black text-fg text-center mb-1">{t('kotoba.hasil_judul')}</h3>
              <p class="text-center text-[12px] text-fg-muted mb-4">
                {t('kotoba.hasil_skor')} <strong class="text-fg">{skor}</strong> ·{' '}
                {t('kotoba.hasil_benar')} {jumlahBenar}/{soalKe}
              </p>
              {salahKata.length > 0 && (
                <div class="mb-4">
                  <p class="text-[11px] font-bold text-accent-red mb-2">{t('kotoba.hasil_ulang')}</p>
                  <ul class="max-h-64 u-scroll-area custom-scrollbar divide-y divide-line rounded-control border border-line">
                    {salahKata.map((v) => (
                      <li key={kunciKata(v)} class="flex items-center justify-between gap-2 px-3 py-2">
                        <span class="min-w-0">
                          <span class="block text-sm font-bold text-fg break-words">{v.k}</span>
                          <span class="block text-[11px] text-fg-muted">
                            {v.h} ({v.r})
                          </span>
                        </span>
                        <span class="flex items-center gap-2 shrink-0">
                          <span class="text-[12px] text-accent-sky text-right">{v.id}</span>
                          <button
                            type="button"
                            onClick={() => ucapkan(v.h)}
                            aria-label={t('kotoba.dengarkan')}
                            class="min-h-11 min-w-11 inline-flex items-center justify-center rounded-pill border border-line text-fg-muted hover:text-fg"
                          >
                            🔊
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div class="flex flex-col sm:flex-row gap-2">
                {salahKata.length > 0 && (
                  <button
                    type="button"
                    onClick={() => mulaiRonde(salahKata)}
                    class="flex-1 min-h-11 rounded-control bg-accent-amber text-canvas text-sm font-bold"
                  >
                    {t('kotoba.ulang_salah')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => mulaiRonde()}
                  class="flex-1 min-h-11 rounded-control bg-accent-violet text-canvas text-sm font-bold"
                >
                  {t('kotoba.ronde_baru')}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── FLASHCARD ── */}
      {pool.length > 0 && mode === 'flashcard' && kartu && (
        <section class="rounded-card border border-line bg-surface p-4">
          <button
            type="button"
            onClick={() => setBalik((b) => !b)}
            class="w-full min-h-56 rounded-card bg-surface-raised border border-line px-4 py-8 text-center"
          >
            <span class="flex justify-center gap-1.5 mb-3">
              <span class="px-2 py-0.5 rounded-pill bg-accent-sky/15 text-accent-sky text-[10px] font-bold">
                {t('kotoba.bab')} {kartu.b} · {(kartuIdx % pool.length) + 1}/{pool.length}
              </span>
              <span class="px-2 py-0.5 rounded-pill bg-accent-amber/15 text-accent-amber text-[10px] font-bold">
                {labelPos[kartu.pos]}
              </span>
            </span>
            <span class="block text-3xl md:text-4xl font-black text-fg break-words">
              {balik ? kartu.id : kartu.k}
            </span>
            <span class="block text-[13px] text-fg-muted mt-2">
              {balik ? `${kartu.k} 【${kartu.h}】 (${kartu.r})` : `${kartu.h} · ${t('kotoba.balik_petunjuk')}`}
            </span>
          </button>
          <div class="flex gap-2 mt-3">
            <button
              type="button"
              onClick={() => {
                setKartuIdx((i) => (i - 1 + pool.length) % pool.length);
                setBalik(false);
              }}
              class="flex-1 min-h-11 rounded-control border border-line bg-surface-raised text-fg text-[13px] font-bold"
            >
              {t('kotoba.sebelumnya')}
            </button>
            <button
              type="button"
              onClick={() => ucapkan(kartu.h)}
              aria-label={t('kotoba.dengarkan')}
              class="min-h-11 min-w-11 rounded-control border border-line bg-surface-raised text-fg-muted"
            >
              🔊
            </button>
            <button
              type="button"
              onClick={() => {
                setKartuIdx((i) => (i + 1) % pool.length);
                setBalik(false);
              }}
              class="flex-1 min-h-11 rounded-control border border-line bg-surface-raised text-fg text-[13px] font-bold"
            >
              {t('kotoba.berikutnya')}
            </button>
          </div>
        </section>
      )}

      {/* ── KAMUS ── */}
      {pool.length > 0 && mode === 'kamus' && (
        <section class="rounded-card border border-line bg-surface p-4">
          <div class="flex flex-col sm:flex-row gap-2 mb-3 cetak-sembunyi">
            <input
              type="search"
              value={cari}
              onInput={(e) => setCari((e.target as HTMLInputElement).value)}
              placeholder={t('kotoba.cari_placeholder')}
              aria-label={t('kotoba.cari_label')}
              class="flex-1 min-h-11 rounded-control bg-surface-sunken border border-line px-3 text-sm text-fg"
            />
            <button
              type="button"
              onClick={cetakKamus}
              class="min-h-11 px-4 rounded-control border border-line bg-surface-raised text-fg text-[13px] font-bold"
            >
              {t('kotoba.cetak')}
            </button>
          </div>

          {/* Lembar cetak: `data-cetak` adalah mekanisme repo ini (layout.css §5b)
              — saat mencetak, hanya bagian ini yang tersisa dan teksnya dipaksa
              hitam di atas kertas putih. `cetak-sembunyi` menyembunyikan
              kontrol yang tidak berguna di kertas. */}
          <div data-cetak class="rounded-control">
            <div class="hidden print:block mb-2">
              <p class="text-sm font-bold text-fg">{t('kotoba.judul_cetak')}</p>
              <p class="text-[11px] text-fg-muted">
                {t('kotoba.bab')} {babFilter === 'all' ? t('kotoba.semua_bab') : babFilter} ·{' '}
                {hasilCari.length} {t('kotoba.kata_tersedia')}
              </p>
            </div>
            {/* Tombol ini DI ATAS daftar, bukan di bawahnya: daftarnya sendiri
                bisa digulir (`max-h-96`), jadi tombol di bawah akan tersembunyi
                di balik gulungan dan siswa menyangka 120 baris itu seluruh isi
                kamus. Angka "120 / 864" menyatakan sebaliknya. */}
            {!kueri && !tampilSemua && hasilCari.length > BATAS_KAMUS && (
              <div class="cetak-sembunyi mb-2 flex items-center justify-between gap-2">
                <p class="text-[11px] text-fg-muted">
                  {tampilKamus.length} / {hasilCari.length}
                </p>
                <button
                  type="button"
                  onClick={() => setTampilSemua(true)}
                  class="min-h-11 px-3 rounded-control border border-line bg-surface-raised text-fg text-[12px] font-bold"
                >
                  {t('kotoba.tampil_semua')}
                </button>
              </div>
            )}
            <ul class="kotoba-lembar max-h-96 u-scroll-area custom-scrollbar divide-y divide-line">
              {tampilKamus.map((v) => {
                const c = progres.kata[kunciKata(v)];
                const kuasai = !!c && c.benar >= 3 && c.salah === 0;
                const lemah = !!c && c.salah > 0;
                return (
                  <li key={kunciKata(v)} class="flex items-start justify-between gap-3 px-3 py-2">
                    <span class="min-w-0">
                      <span class="block text-[15px] font-bold text-fg break-words">{v.k}</span>
                      <span class="block text-[11px] text-fg-muted">
                        {v.h} ({v.r}) · {t('kotoba.bab')} {v.b} · {labelPos[v.pos]}
                      </span>
                    </span>
                    <span class="flex items-center gap-2 shrink-0">
                      {kuasai && <span class="text-accent-emerald text-[11px] font-bold">✓</span>}
                      {lemah && !kuasai && <span class="text-accent-amber text-[11px] font-bold">!</span>}
                      <span class="text-[13px] text-accent-sky text-right max-w-[10rem]">{v.id}</span>
                      <button
                        type="button"
                        onClick={() => ucapkan(v.h)}
                        aria-label={t('kotoba.dengarkan')}
                        class="cetak-sembunyi min-h-11 min-w-11 inline-flex items-center justify-center rounded-pill text-fg-muted hover:text-fg"
                      >
                        🔊
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
            {!hasilCari.length && (
              <p class="text-center text-sm text-fg-muted py-6">{t('kotoba.kosong')}</p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
