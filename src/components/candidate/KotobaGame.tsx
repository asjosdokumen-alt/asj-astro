/**
 * KotobaGame.tsx — minigame hafalan kosakata Jepang (Minna no Nihongo Bab 1–50
 * dan 16 bidang kerja 特定技能).
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
import { ambilPapanGame, bolehKirim, kirimSkor, type BarisPapanGame } from '../../lib/skorGame';
import { bunyi } from '../../lib/tts';
import { apiClient, type ApiError } from '../../lib/apiClient';
import { validate, kandidatLoginSchema } from '../../lib/schemas';
import { t, useLang } from '../../store/i18n';
import { showToast } from '../Toast';

type JenisKata = 'verb' | 'adj' | 'noun' | 'other';

/**
 * Kategori kata bidang kerja (SSW). Kosakata buku tidak punya kategori, jadi
 * kolom ini opsional — dan filter kategori hanya muncul saat sumbernya SSW.
 */
type Kategori = 'alat' | 'kerja' | 'aman' | 'mutu' | 'kantor';

/** Satu kosakata — bentuknya sama dengan `Kotoba` di `_lib/kotoba/bank.ts`. */
interface Kotoba {
  b: number;
  /** Hanya ada pada kata bidang SSW (lihat `ssw.ts`). */
  cat?: Kategori;
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
  n5?: Kotoba[];
  jumlahN5?: number;
  error?: string;
  message?: string;
  sessionInvalid?: boolean;
}

/**
 * Satu bidang kerja SSW — bentuknya sama dengan `BidangSsw` di
 * `_lib/kotoba/ssw.ts`. Kata di dalamnya memakai `b: 0`, penanda "bukan bab
 * buku" (lihat catatan di berkas itu).
 */
interface BidangSsw {
  id: string;
  nama: string;
  namaJp: string;
  ringkas: string;
  kata: Kotoba[];
}

/**
 * Balasan `getBankSsw`. Bentuknya sengaja DITURUNKAN dari `BankRes`, bukan
 * ditulis ulang: tujuh anggota yang sama (success, isVip, jumlah, error,
 * message, sessionInvalid) tidak perlu dideklarasikan dua kali — dan tiap
 * anggota interface di repo ini dihitung sebagai satu simbol oleh indexer,
 * yang punya plafon beku sendiri.
 */
type SswRes = BankRes & { bidang?: BidangSsw[] };

/**
 * Dua sumber kata, dan sengaja hanya dua.
 *
 * Buku dan bidang kerja tidak digabung dalam satu daftar: siswa yang sedang
 * menghafal bab 32 tidak ingin pengecoh jawabannya diambil dari istilah las
 * kapal, dan sebaliknya. Pemisahan ini juga yang membuat "kamus" bisa dicetak
 * per bidang — lembar hafalan untuk satu jenis pekerjaan.
 */
type Sumber = 'minna' | 'ssw' | 'n5';

interface Props {
  /** WA dari URL (`?wa=`) atau dari panel admin. */
  waTarget?: string;
  /** Panel admin: lewati gerbang password kandidat (sama seperti MensetsuForm). */
  adminMode?: boolean;
}

type Mode = 'kuis' | 'ketik' | 'flashcard' | 'kamus' | 'bom';
type Arah = 'jp-id' | 'id-jp';

/**
 * Nyawa. SATU-SATUNYA cara ronde berakhir: ronde berjalan terus sampai habis,
 * sama seperti `GAME.html` aslinya. Tidak ada "jumlah soal per ronde".
 */
const NYAWA_AWAL = 3;
/** Batas waktu satu soal kuis. Mode ketik sengaja TANPA batas waktu. */
const DURASI_SOAL_MS = 9000;
/** Batas waktu tingkat Ketat: 4 detik — cukup untuk mengingat, tidak untuk menebak. */
const DURASI_KILAT_MS = 4000;
/** Panjang satu ronde Bom Sakura. */
const DURASI_BOM_DETIK = 60;
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
  /**
   * Kapan kata ini terakhir dijawab (epoch ms) dan kotak Leitner-nya (1..5).
   *
   * KENAPA DITAMBAHKAN (2026-11-03): tanpa waktu, progres hanya bisa dipakai
   * untuk PEMBOBOTAN — tidak ada cara tahu kata mana yang "jatuh tempo" hari
   * ini. Padahal mengulang tepat sebelum lupa (spaced repetition) jauh lebih
   * efisien daripada mengulang satu bab penuh.
   *
   * Keduanya OPSIONAL: catatan lama (sebelum perubahan ini) tidak punya field
   * ini, dan diperlakukan sebagai kotak 1 yang jatuh tempo sekarang — bukan
   * dibuang, karena `salah`/`benar`-nya masih berharga.
   */
  terakhir?: number;
  kotak?: number;
}

/**
 * Jarak ulang per kotak Leitner, dalam hari.
 *
 * Kotak 1 = baru/sering salah (besok lagi), kotak 5 = sudah stabil (16 hari).
 * Angka ini sengaja sederhana dan bisa dibaca manusia; SM-2 penuh (dengan
 * faktor kemudahan per kata) butuh lebih banyak state daripada yang bisa
 * dipertanggungjawabkan untuk 1.440 kata di localStorage.
 */
export const JARAK_HARI = [1, 2, 4, 8, 16];

/**
 * Gelar siswa dari jumlah kata yang DIKUASAI (bukan skor ronde).
 *
 * KENAPA dari kata dikuasai, bukan skor: skor bisa dinaikkan dengan mengulang
 * bab yang sama terus-menerus, sedangkan `kataDikuasai` hanya bertambah kalau
 * sebuah kata benar tiga kali tanpa salah. Gelar jadi mengukur CAKUPAN, bukan
 * ketekunan menekan tombol.
 *
 * Ambangnya sengaja lebar di atas: 400 kata berarti sekitar seperempat bank
 * buku, dan itu sudah cukup untuk menyebut seseorang siap berangkat.
 */
export const GELAR: readonly { min: number; key: string }[] = [
  { min: 400, key: 'kotoba.gelar_siap' },
  { min: 150, key: 'kotoba.gelar_master' },
  { min: 50, key: 'kotoba.gelar_senpai' },
  { min: 0, key: 'kotoba.gelar_kohai' },
];

/** Kunci i18n gelar untuk `n` kata yang dikuasai. */
export function gelarDari(n: number): string {
  for (const g of GELAR) {
    if (n >= g.min) return g.key;
  }
  return 'kotoba.gelar_kohai';
}

/** Jatuh tempo? `true` hanya kalau kata itu SUDAH pernah dijawab. */
export function jatuhTempo(c: Catatan | undefined, sekarang: number): boolean {
  if (!c) return false; // belum pernah dilihat = baru, bukan jatuh tempo
  const kotak = Math.min(Math.max(c.kotak ?? 1, 1), JARAK_HARI.length);
  const sejak = c.terakhir ?? 0;
  return sekarang - sejak >= JARAK_HARI[kotak - 1] * 86_400_000;
}
interface Progres {
  rekor: number;
  kata: Record<string, Catatan>;
  /** Rangkaian hari berturut-turut bermain (kebiasaan, bukan skor). */
  streak?: { hari: string; jumlah: number };
  /**
   * Misi harian: berapa kata BENAR hari ini.
   *
   * Kenapa disimpan per tanggal, bukan sekadar angka yang di-reset saat
   * halaman dibuka: siswa sering membuka-tutup latihan di sela kelas, dan
   * hitungan yang kembali ke nol setiap muat ulang membuat misi ini mustahil
   * diselesaikan — lebih buruk daripada tidak ada misi sama sekali.
   */
  harian?: { tanggal: string; benar: number };
}

/** Target misi harian. 20 kata benar ≈ 2–3 menit — satu jeda kelas. */
export const MISI_HARIAN = 20;

/**
 * Tambah hitungan misi harian, dengan pergantian hari.
 *
 * `hariIni` diterima sebagai parameter supaya bisa diuji tanpa memalsukan jam
 * sistem — pola yang sama dengan `hitungStreak`.
 */
export function hitungHarian(
  sebelumnya: { tanggal: string; benar: number } | undefined,
  hariIni: string,
  tambah: number,
): { tanggal: string; benar: number } {
  const n = Math.max(0, Math.floor(tambah));
  if (!sebelumnya || sebelumnya.tanggal !== hariIni) return { tanggal: hariIni, benar: n };
  return { tanggal: hariIni, benar: Math.max(0, sebelumnya.benar + n) };
}

/** Tanggal lokal `YYYY-MM-DD` — bukan `toISOString()` yang memakai UTC. */
export function tanggalLokal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Hitung streak setelah bermain hari ini.
 *
 * `kemarin` diterima sebagai parameter supaya bisa diuji tanpa memalsukan jam
 * sistem. Aturannya: hari yang sama tidak menambah; hari setelah hari terakhir
 * menambah satu; selain itu (bolong) kembali ke 1.
 */
export function hitungStreak(
  sebelumnya: { hari: string; jumlah: number } | undefined,
  hariIni: string,
  kemarin: string,
): { hari: string; jumlah: number } {
  if (!sebelumnya?.hari) return { hari: hariIni, jumlah: 1 };
  if (sebelumnya.hari === hariIni) return sebelumnya;
  if (sebelumnya.hari === kemarin) return { hari: hariIni, jumlah: sebelumnya.jumlah + 1 };
  return { hari: hariIni, jumlah: 1 };
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
      streak: p.streak && typeof p.streak === 'object' ? p.streak : undefined,
      harian:
        p.harian &&
        typeof p.harian === 'object' &&
        typeof p.harian.tanggal === 'string' &&
        typeof p.harian.benar === 'number'
          ? p.harian
          : undefined,
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

/**
 * Apakah bab `b` masuk rentang `dari`..`sampai`.
 *
 * Fungsi MURNI dan diekspor supaya aturannya bisa diuji tanpa merender
 * permainan. `''` berarti "tanpa batas" di sisi itu, jadi `('', '')` = semua bab.
 *
 * Batas yang DIBALIK (dari 25, sampai 10) dibaca sebagai 10..25: menukar dua
 * kotak adalah kekeliruan yang wajar, dan menjawab "0 kata" hanya membuat siswa
 * mengira banknya kosong.
 */
export function dalamRentangBab(b: number, dari: string, sampai: string): boolean {
  const lo = dari === '' ? -Infinity : Number(dari);
  const hi = sampai === '' ? Infinity : Number(sampai);
  if (!Number.isFinite(lo) && !Number.isFinite(hi)) return true;
  return b >= Math.min(lo, hi) && b <= Math.max(lo, hi);
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
  /** 174 kata N5 tambahan — dikirim bersama bank buku, gerbang yang sama. */
  const [bankN5, setBankN5] = useState<Kotoba[]>([]);
  const [daftarBab, setDaftarBab] = useState<number[]>([]);
  const [progres, setProgres] = useState<Progres>({ rekor: 0, kata: {} });

  /* ── filter & mode ─────────────────────────────────────────────────────── */
  const [mode, setMode] = useState<Mode>('kuis');
  /**
   * Rentang bab, bukan satu bab.
   *
   * Pemilik 2026-11-03: *"bank kotoba kanji tolong bikin pilihannya secara
   * universal bisa milih kek milih bab 1- bab 10, milih bab 1-25 begitu?"*.
   * Satu `<select>` "Bab 1..50" memaksa siswa menghafal per bab, padahal ujian
   * JFT/SSW mencampur banyak bab dan siswa biasanya ingin "bab 1 sampai 10".
   * Dua kotak (dari–sampai) menutup SEMUA rentang tanpa daftar preset yang
   * harus ditambah tiap kali jumlah bab berubah.
   *
   * String kosong = tanpa batas di sisi itu (`''`..`''` = semua bab).
   */
  const [babDari, setBabDari] = useState('');
  const [babSampai, setBabSampai] = useState('');
  const [posFilter, setPosFilter] = useState('all');
  /**
   * Hanya kata yang masih LEMAH.
   *
   * Progres per kata sudah lama disimpan (`benar`/`salah`) tetapi hanya dipakai
   * untuk pembobotan ronde berikutnya — siswa tidak punya cara MENGULANG kata
   * yang paling sering salah. Padahal itu inti belajar kosakata: retrieval
   * practice pada kata yang belum stabil, bukan mengulang seluruh bab.
   *
   * Ambangnya `salah > benar`: kata yang salahnya masih lebih banyak daripada
   * benarnya. Kata yang baru sekali salah lalu dua kali benar tidak ikut, supaya
   * daftarnya menyusut dan bisa habis.
   */
  const [fokus, setFokus] = useState<'semua' | 'lemah' | 'tempo'>('semua');
  const [arah, setArah] = useState<Arah>('jp-id');

  /* ── sumber: buku atau bidang kerja ─────────────────────────────────────── */
  const [sumber, setSumber] = useState<Sumber>('minna');
  /**
   * Bank SSW dimuat MALAS, saat tabnya pertama kali dibuka. 382 kata bidang
   * tidak ada gunanya bagi siswa yang hanya memakai bank buku, dan memuatnya
   * di awal berarti setiap pembukaan `/kotoba` membayar dua permintaan.
   */
  const [bidangList, setBidangList] = useState<BidangSsw[]>([]);
  const [bidangId, setBidangId] = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [sswMemuat, setSswMemuat] = useState(false);
  const [sswGalat, setSswGalat] = useState('');

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
  const [komboMaks, setKomboMaks] = useState(0);
  const [papanBuka, setPapanBuka] = useState(false);
  const [papan, setPapan] = useState<BarisPapanGame[]>([]);
  const [jumlahBenar, setJumlahBenar] = useState(0);
  const [salahKata, setSalahKata] = useState<Kotoba[]>([]);
  const [fase, setFase] = useState<'tanya' | 'hasil'>('tanya');
  /* Cermin `fase` untuk pembacaan di dalam setTimeout: closure `terapkan`
     menangkap nilai saat jawaban diberikan, bukan saat jedanya berakhir. */
  const faseRef = useRef<'tanya' | 'hasil'>('tanya');
  faseRef.current = fase;
  const [sisaWaktu, setSisaWaktu] = useState(100);
  /**
   * TINGKAT KESULITAN — tiga keadaan, satu kontrol.
   *
   * KENAPA menggantikan sakelar "Kilat": pemilik 2026-11-10 — *"kotoba sih gak
   * perlu cepat kan fungsinya melatih bener, ada game bikin saja di
   * kesulitannya kan bisa milih sendiri"*. Sakelar biner memaksa pilihan
   * "tekanan waktu atau tidak"; tiga tingkat memberi pilihan tengah yang
   * sebenarnya dipakai kebanyakan siswa.
   *
   *   santai  tanpa batas waktu — bar waktu TIDAK digambar, bukan digambar
   *           penuh: bar yang diam terbaca sebagai "waktumu tidak habis",
   *           padahal yang benar adalah "tidak ada waktu".
   *   normal  9 detik per soal, tanpa bonus kecepatan.
   *   ketat   4 detik per soal + bonus kecepatan (dulu bernama "Kilat").
   */
  const [tingkat, setTingkat] = useState<'santai' | 'normal' | 'ketat'>('normal');
  /**
   * BOM SAKURA — satu ronde 60 detik, bukan per soal.
   *
   * Beda dengan Kilat (batas per soal): di sini yang habis adalah RONDE-nya, jadi
   * siswa mengejar berapa banyak kata yang bisa dijawab benar sebelum sumbu
   * habis. Itu yang membuatnya bisa diadu antar siswa, bukan sekadar latihan.
   */
  const [sisaBom, setSisaBom] = useState(DURASI_BOM_DETIK);
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
      setBankN5(Array.isArray(d.n5) ? d.n5 : []);
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

  /**
   * Pegangan ke `muatSsw` versi terbaru — alasannya sama dengan `muatRef`:
   * fungsi ini dibuat ulang setiap render, jadi memasukkannya ke daftar
   * dependensi akan menghasilkan satu permintaan per render.
   */
  const sswRef = useRef<(nomor: string) => void>(() => {});

  /* ── muat bank bidang kerja (SSW) ──────────────────────────────────────── */
  const muatSsw = async (nomor: string) => {
    if (!nomor || sswMemuat) return;
    setSswMemuat(true);
    setSswGalat('');
    try {
      const d = await apiClient<SswRes>('getBankSsw', [nomor], {
        onSessionInvalid: 'throw',
        silent: true,
      });
      if (d.sessionInvalid) {
        if (adminMode) {
          setSswGalat(t('kotoba.galat_sesi_admin'));
          return;
        }
        setLoginGate(true);
        setGateMsg(t('kotoba.galat_sesi'));
        return;
      }
      /* Bukan siswa: server menjawab tanpa satu kata pun. Sama seperti bank
         buku — jangan lanjut ke "bidang kosong", itu menyalahkan data. */
      if (d.success === false && d.isVip === false) {
        setVip(false);
        setBidangList([]);
        return;
      }
      const daftar = Array.isArray(d.bidang) ? d.bidang : [];
      setBidangList(daftar);
      if (!bidangId && daftar.length) setBidangId(daftar[0].id);
      if (!daftar.length) setSswGalat(t('kotoba.ssw_kosong'));
    } catch (e) {
      const err = e as ApiError;
      setSswGalat(err?.message || t('kotoba.galat_muat'));
    } finally {
      setSswMemuat(false);
    }
  };
  sswRef.current = muatSsw;

  useEffect(() => {
    if (sumber !== 'ssw') return;
    if (loginGate || !wa) return;
    if (bidangList.length) return;
    sswRef.current(wa);
  }, [sumber, wa, loginGate, bidangList.length]);

  // Progres per kandidat: dibaca saat WA diketahui, ditulis setiap berubah.
  // Streak dihitung DI SINI (sekali per pemuatan, bukan per jawaban): bermain
  // hari ini = hari ini dihitung, dan efek penulis di bawah yang menyimpannya.
  useEffect(() => {
    if (!wa) return;
    const p = bacaProgres(wa);
    const kini = new Date();
    const kemarin = new Date(kini.getTime() - 86_400_000);
    setProgres({ ...p, streak: hitungStreak(p.streak, tanggalLokal(kini), tanggalLokal(kemarin)) });
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
  /**
   * Bidang yang sedang dibuka. `undefined` = SSW dipilih tapi banknya belum
   * tiba; itu bukan keadaan kosong yang perlu dimarahi, cukup ditunggu.
   */
  const bidangAktif = bidangList.find((b) => b.id === bidangId);
  const kataBidang = bidangAktif?.kata ?? [];

  /**
   * Satu `pool`, dua sumber. Filter bab hanya berlaku untuk bank buku: kata
   * bidang tidak punya bab, dan menampilkan "Semua bab" di sana akan menjadi
   * kontrol yang tidak mengubah apa pun.
   */
  /* Rentang bab. Batas dibalik (dari 25 sampai 10) TIDAK ditolak — dibaca
     sebagai 10..25, karena membalik dua kotak adalah kekeliruan yang wajar dan
     menampilkan "0 kata" hanya akan membingungkan. Aturannya ada di
     `dalamRentangBab` (fungsi murni, diuji langsung). */

  /** Label rentang untuk kepala daftar: "1–10", "1+", "–10", atau "semua". */
  const labelRentangBab = (): string => {
    if (!babDari && !babSampai) return t('kotoba.semua_bab');
    if (babDari && babSampai) {
      const d = Math.min(Number(babDari), Number(babSampai));
      const s = Math.max(Number(babDari), Number(babSampai));
      return `${d}–${s}`;
    }
    return babDari ? `${babDari}+` : `–${babSampai}`;
  };

  /** Kata yang salahnya masih lebih banyak daripada benarnya. */
  const kataLemah = (v: Kotoba): boolean => {
    const c = progres.kata[kunciKata(v)];
    return !!c && c.salah > 0 && c.salah > c.benar;
  };

  const sekarang = Date.now();
  const dasar = sumber === 'ssw' ? kataBidang : sumber === 'n5' ? bankN5 : bank;
  const pool = dasar.filter((v) => {
    if (fokus === 'lemah' && !kataLemah(v)) return false;
    if (fokus === 'tempo' && !jatuhTempo(progres.kata[kunciKata(v)], sekarang)) return false;
    if (sumber === 'ssw')
      return (catFilter === 'all' || v.cat === catFilter) && (posFilter === 'all' || v.pos === posFilter);
    /* N5 tidak punya bab buku (`b = 0`), jadi filter bab DILEWATI — kalau tidak,
       rentang 1..50 akan menyaringnya habis dan daftarnya tampak kosong. */
    if (sumber === 'n5') return posFilter === 'all' || v.pos === posFilter;
    return dalamRentangBab(v.b, babDari, babSampai) && (posFilter === 'all' || v.pos === posFilter);
  });

  /** Sumber pengecoh: bidang yang sedang dibuka, atau seluruh bank buku. */
  const sumberKata = sumber === 'ssw' ? kataBidang : sumber === 'n5' ? bankN5 : bank;

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
    const lapis = [dasar.filter((x) => x.b === v.b), dasar.filter((x) => x.pos === v.pos), dasar, sumberKata];
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
    /* Jangan pernah memulai ronde tanpa kata. Tanpa penjaga ini, memilih tab
       SSW sebelum banknya tiba (atau kombinasi filter yang mustahil) langsung
       memanggil `pasangSoal(null)` → layar "Ronde selesai · 0/0", yang terbaca
       sebagai "rondemu gagal" padahal belum ada satu soal pun. */
    if (!khusus?.length && !pool.length) return;
    setSkor(0);
    setHp(NYAWA_AWAL);
    setKombo(0);
    setKomboMaks(0);
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: mulaiRonde dibuat ulang tiap render; filter/arah/sumber di daftar adalah masukan sebenarnya
  useEffect(() => {
    if (!bank.length && !kataBidang.length && !bankN5.length) return;
    if (mode !== 'kuis' && mode !== 'ketik' && mode !== 'bom') return;
    if (loginGate || vip === false) return;
    mulaiRonde();
  // `progres` SENGAJA tidak ada di daftar: ia berubah setiap jawaban, dan
  // memasukkannya membuat efek ini me-reset ronde tepat setelah siswa menjawab —
  // ronde tidak akan pernah selesai. Yang menentukan isi ronde adalah filter,
  // dan `fokus` ikut karena mengubahnya memang harus memulai ronde baru.
  }, [bank, babDari, babSampai, posFilter, arah, mode, loginGate, vip, sumber, bidangId, catFilter, kataBidang.length, bankN5.length, fokus]);

  /** Catat satu jawaban ke progres (dipakai pembobotan ronde berikutnya). */
  const catat = (v: Kotoba, tepat: boolean) => {
    const kunci = kunciKata(v);
    setProgres((p) => {
      const c = p.kata[kunci] || { salah: 0, benar: 0 };
      /* Leitner: benar menaikkan kotak (maks 5), salah menjatuhkannya ke 1.
         `terakhir` dicatat untuk SEMUA jawaban — dari situ "jatuh tempo"
         dihitung. Tanpa ini SRS tidak punya titik acuan waktu. */
      const kotak = tepat ? Math.min((c.kotak ?? 1) + 1, JARAK_HARI.length) : 1;
      return {
        ...p,
        /* Misi harian hanya menghitung jawaban BENAR. Salah tidak mengurangi:
           misi ini mengukur latihan yang dilakukan, bukan menghukum kesalahan —
           hukuman sudah ada di Leitner (kotak turun ke 1). */
        harian: hitungHarian(p.harian, tanggalLokal(new Date()), tepat ? 1 : 0),
        kata: {
          ...p.kata,
          [kunci]: {
            ...c,
            ...(tepat ? { benar: c.benar + 1 } : { salah: c.salah + 1 }),
            kotak,
            terakhir: Date.now(),
          },
        },
      };
    });
  };

  /**
   * Soal berikutnya. Ronde hanya berakhir kalau nyawa habis — tidak ada
   * "daftar soal habis", karena memang tidak ada daftar: kata ditarik satu per
   * satu dari bank berbobot.
   */
  const lanjut = (hpBaru: number) => {
    /* RONDE SUDAH BERAKHIR — jangan pasang soal lagi.
       `lanjut` dijadwalkan lewat setTimeout setelah setiap jawaban (750 ms kalau
       benar, 1 400 ms kalau salah). Di Bom Sakura, sumbu 60 detik bisa habis
       SEBELUM jeda itu selesai; tanpa penjaga ini soal berikutnya tetap dipasang
       di bawah layar hasil, dan saat siswa menekan "main lagi" keadaannya sudah
       tidak bersih. */
    if (faseRef.current !== 'tanya') return;
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
    /* Bonus kecepatan hanya di tingkat Ketat: menjawab cepat saat waktunya tak
       terbatas (Santai) tidak layak diberi nilai lebih. */
    const bonus = tepat && tingkat === 'ketat' ? Math.round(sisaWaktu / 10) : 0;
    const poin = (mode === 'ketik' ? 15 : 10) + kombo * 2 + bonus + (tepat && kombo >= 5 ? 5 : 0);
    bunyi(tepat);
    if (tepat) setKomboMaks((m) => Math.max(m, kombo + 1));
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
  //
  // TINGKAT mengatur durasinya, dan `santai` mematikan efek ini sepenuhnya —
  // bukan memberi durasi sangat panjang. Percobaan pertama saya menambah
  // interval KEDUA untuk mode ini, padahal efek ini sudah menghitung mundur —
  // dua interval menulis `sisaWaktu` yang sama dan angkanya jadi tidak masuk
  // akal (terukur 87 alih-alih 100 atau 52). Yang benar: SATU timer, durasinya
  // yang berbeda.
  useEffect(() => {
    if (mode !== 'kuis' || fase !== 'tanya' || benar !== null || !item) return;
    if (tingkat === 'santai') return;
    const durasi = tingkat === 'ketat' ? DURASI_KILAT_MS : DURASI_SOAL_MS;
    const mulai = Date.now();
    const id = window.setInterval(() => {
      const lewat = Date.now() - mulai;
      const s = Math.max(0, 100 - (lewat / durasi) * 100);
      setSisaWaktu(s);
      if (s <= 0) {
        window.clearInterval(id);
        jawabRef.current(null);
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [mode, fase, benar, item, tingkat]);

  /* Sumbu Bom Sakura: satu hitungan untuk SELURUH ronde. Berbeda dari batas
     waktu per soal di atas — di sini yang dikejar adalah berapa banyak kata
     yang bisa dijawab sebelum waktunya habis. */
  useEffect(() => {
    if (mode !== 'bom' || fase !== 'tanya') return;
    setSisaBom(DURASI_BOM_DETIK);
    const mulai = Date.now();
    const id = window.setInterval(() => {
      const lewat = Math.floor((Date.now() - mulai) / 1000);
      const sisa = Math.max(0, DURASI_BOM_DETIK - lewat);
      setSisaBom(sisa);
      if (sisa <= 0) {
        window.clearInterval(id);
        setFase('hasil');
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [mode, fase]);

  // Rekor diperbarui saat ronde berakhir — di satu tempat, bukan di setiap
  // penambahan skor (kalau tidak, "rekor" berubah di tengah ronde).
  // biome-ignore lint/correctness/useExhaustiveDependencies: hanya dijalankan saat ronde berakhir (fase === 'hasil')
  useEffect(() => {
    if (fase !== 'hasil') return;
    setProgres((p) => (p.rekor >= skor ? p : { ...p, rekor: skor }));
    /* Kirim ke papan peringkat. Penjaga `bolehKirim` mencegah ronde yang sama
       terkirim dua kali bila efek ini berjalan ulang (render ganda); kuncinya
       memuat skornya, jadi dua ronde dengan skor berbeda tetap terkirim
       keduanya. Kegagalan diabaikan — skor lokal sudah tersimpan lebih dulu. */
    if (skor > 0 && bolehKirim(`kotoba:${skor}`)) {
      void kirimSkor('kotoba', skor, { mode, sumber, benar: jumlahBenar, kombo: komboMaks }).then(() => {
        if (papanBuka) void ambilPapanGame('kotoba', 10).then(setPapan);
      });
    }
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
      if ((mode === 'kuis' || mode === 'bom') && benar === null) {
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
    if (mode !== 'kuis' && mode !== 'ketik' && mode !== 'bom') return;
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

  const labelKategori: Record<Kategori, string> = {
    alat: t('kotoba.cat_alat'),
    kerja: t('kotoba.cat_kerja'),
    aman: t('kotoba.cat_aman'),
    mutu: t('kotoba.cat_mutu'),
    kantor: t('kotoba.cat_kantor'),
  };

  /** Kembalikan semua filter ke "semua" — jalan keluar dari kombinasi kosong. */
  const resetFilter = () => {
    setBabDari('');
    setBabSampai('');
    setPosFilter('all');
    setCatFilter('all');
  };

  /**
   * Label kecil di kartu soal/kartu hafalan.
   *
   * Kata bidang tidak punya bab, jadi `b`-nya 0 — dan badge yang mencetak
   * "Bab 0" adalah bug yang terlihat siswa, bukan detail internal. Di mode SSW
   * badge itu menampilkan kategorinya, yang justru informasi yang dicari.
   */
  const labelAsal = (v: Kotoba): string =>
    sumber === 'ssw' ? (v.cat ? labelKategori[v.cat] : 'SSW') : `${t('kotoba.bab')} ${v.b}`;

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
  /**
   * "Dikuasai" dihitung pada `pool`, bukan seluruh progres.
   *
   * Sebelumnya ia menjumlahkan SELURUH riwayat peramban. Begitu bank bidang
   * berisi 1 061 kata, angka itu berhenti berarti apa pun: siswa melihat
   * "63 kata · 180 dikuasai" di satu bidang — angka yang mustahil dan membuat
   * kop halaman berbohong. Yang relevan adalah berapa kata DI FILTER INI yang
   * sudah dikuasai.
   */
  /**
   * Kata yang dikuasai dihitung dari SELURUH sumber, bukan dari `pool`.
   *
   * `pool` sudah tersaring sumber + rentang bab + fokus, jadi memakainya membuat
   * angka ini (dan gelar yang diturunkan darinya) BERUBAH hanya karena siswa
   * berpindah tampilan — memilih "N5" atau "Bab 1–5" seolah mengurangi apa yang
   * sudah dikuasai. Ditemukan saat review 2026-11-04.
   *
   * Digabung dan di-dedupe lewat `kunciKata`: satu kata bisa muncul di bank buku
   * dan di bank N5, dan itu tetap satu kata.
   */
  const semuaKata = (() => {
    const peta = new Map<string, Kotoba>();
    for (const v of [...bank, ...bankN5, ...kataBidang]) {
      if (!peta.has(kunciKata(v))) peta.set(kunciKata(v), v);
    }
    return [...peta.values()];
  })();
  const kataDikuasai = semuaKata.filter((v) => {
    const c = progres.kata[kunciKata(v)];
    return !!c && c.benar >= 3 && c.salah === 0;
  }).length;
  /* Misi harian. Tanggal dibandingkan, bukan sekadar dibaca: entri kemarin
     tidak boleh tampil sebagai "18/20" hari ini. */
  const hariIni = tanggalLokal(new Date());
  const harianBenar = progres.harian?.tanggal === hariIni ? progres.harian.benar : 0;
  const misiSelesai = harianBenar >= MISI_HARIAN;
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
    { id: 'bom', label: `💣 ${t('kotoba.mode_bom')}` },
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
          {pool.length} {t('kotoba.kata_tersedia')} ·{' '}
          {kataDikuasai} {t('kotoba.kata_dikuasai')} · {t('kotoba.rekor')} {progres.rekor} ·{' '}
          <b class="text-accent-violet">{t(gelarDari(kataDikuasai))}</b>
          {progres.streak && progres.streak.jumlah > 1 ? (
            <> · 🔥 {progres.streak.jumlah} {t('kotoba.streak_hari')}</>
          ) : null}
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

      {/* Seluruh area permainan ada di dalam arena gelap. Kamus sengaja DI LUAR
          (lihat komentar di `arcade.css`): ia lembar hafalan yang dicetak. */}
      <div class="arc">
      {/* ── Misi harian ──
          Streak menjawab "sudah berapa hari"; misi ini menjawab "hari ini sudah
          berapa". Tanpa angka harian, latihan terasa tanpa ujung: skor bisa
          dinaikkan kapan saja, jadi tidak ada alasan untuk mulai HARI INI. */}
      <div class="mb-3 rounded-control border border-line bg-surface-raised px-3 py-2">
        <div class="flex items-center justify-between gap-2 text-[11px]">
          <span class="font-bold text-fg-muted">🎯 {t('kotoba.misi_harian')}</span>
          <span class={misiSelesai ? 'font-bold text-accent-emerald' : 'font-bold text-fg'}>
            {Math.min(harianBenar, MISI_HARIAN)}/{MISI_HARIAN}
            {misiSelesai ? ' ✓' : ''}
          </span>
        </div>
        <div class="mt-1 h-1.5 w-full overflow-hidden rounded-pill bg-surface-sunken">
          <div
            class={`h-full rounded-pill ${misiSelesai ? 'bg-accent-emerald' : 'bg-accent-violet'}`}
            style={`width:${Math.min(100, (harianBenar / MISI_HARIAN) * 100)}%`}
          />
        </div>
      </div>

      {/* ── Tab mode ── */}
      <div class="arc-tab">
        {modeTab.map((m) => (
          <button key={m.id} type="button" onClick={() => setMode(m.id)} aria-pressed={mode === m.id}>
            {m.label}
          </button>
        ))}
      </div>

      {/* ── Sumber: buku atau bidang kerja ──
          Tiga tombol, bukan satu daftar gabungan. `aria-pressed` dipakai karena
          ini pilihan keadaan, bukan navigasi — pembaca layar harus bisa
          membacakan mana yang sedang aktif tanpa melihat warnanya. */}
      {/* `flex-wrap` + `min-w-[30%]`: sejak sumbernya menjadi TIGA, label
          "Bidang Kerja (SSW)" tidak lagi muat sepertiga lebar layar 320 px —
          tanpa pembungkusan ia meluber keluar tombol. Ditemukan saat review UI
          2026-11-04. */}
      <fieldset class="arc-tab" data-aksen="hijau">
        <legend class="sr-only">{t('kotoba.sumber_label')}</legend>
        {(['minna', 'ssw', 'n5'] as Sumber[]).map((s) => (
          <button key={s} type="button" onClick={() => setSumber(s)} aria-pressed={sumber === s}>
            {s === 'minna' ? t('kotoba.sumber_minna') : s === 'ssw' ? t('kotoba.sumber_ssw') : t('kotoba.sumber_n5')}
          </button>
        ))}
      </fieldset>

      {/* ── Filter ──
          Mode buku: 3 kontrol dalam 3 kolom. Mode SSW: 4 kontrol, jadi gridnya
          dipaksa 2 kolom di semua lebar — dengan 3 kolom, dropdown keempat
          jatuh sendirian di baris kedua dan menyisakan dua sel kosong (terukur
          di 1180 px: tiga select di y=382, satu di y=434). */}
      {/* Baris filter. `col-span-2` untuk tiga kontrol yang butuh lebar penuh:
          rentang bab (dua select + tanda pisah) dan dua kelompok chip. Tanpa
          itu, chip "Semua/Lemah/Jatuh tempo" berbagi sel dengan dua select dan
          saling menimpa — terukur di 390 px pada halaman asli, bukan mockup. */}
      <div class="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {sumber === 'ssw' ? (
          <select
            aria-label={t('kotoba.filter_bidang')}
            value={bidangId}
            onChange={(e) => setBidangId((e.target as HTMLSelectElement).value)}
            class="min-h-11 rounded-control bg-surface-sunken border border-line px-2 text-[12px] text-fg"
          >
            {bidangList.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nama}
              </option>
            ))}
          </select>
        ) : (
          /* Dua kotak = SEMUA rentang, tanpa daftar preset yang harus ditambah
             setiap kali jumlah bab berubah. `aria-label` menyebut perannya
             (dari/sampai), bukan sekadar "filter bab", karena dua kotak dengan
             label sama tidak bisa dibedakan pembaca layar. */
          <div class="col-span-2 flex items-center gap-1">
            <select
              aria-label={`${t('kotoba.filter_bab')} — ${t('kotoba.bab_dari')}`}
              value={babDari}
              onChange={(e) => setBabDari((e.target as HTMLSelectElement).value)}
              class="min-h-11 rounded-control bg-surface-sunken border border-line px-2 text-[12px] text-fg"
            >
              <option value="">{t('kotoba.semua_bab')}</option>
              {daftarBab.map((b) => (
                <option key={b} value={String(b)}>
                  {t('kotoba.bab')} {b}
                </option>
              ))}
            </select>
            <span class="text-[12px] text-fg-muted" aria-hidden="true">–</span>
            <select
              aria-label={`${t('kotoba.filter_bab')} — ${t('kotoba.bab_sampai')}`}
              value={babSampai}
              onChange={(e) => setBabSampai((e.target as HTMLSelectElement).value)}
              class="min-h-11 rounded-control bg-surface-sunken border border-line px-2 text-[12px] text-fg"
            >
              <option value="">{t('kotoba.semua_bab')}</option>
              {daftarBab.map((b) => (
                <option key={b} value={String(b)}>
                  {t('kotoba.bab')} {b}
                </option>
              ))}
            </select>
          </div>
        )}
        {/* Fokus lingkup. Tiga pilihan, bukan dua tombol terpisah: "lemah" dan
            "jatuh tempo" saling meniadakan, jadi dua toggle independen akan
            membingungkan (dua-duanya menyala = irisan yang hampir selalu kosong). */}
        <fieldset class="col-span-2 flex flex-wrap items-center gap-1 border-0 p-0 m-0">
          <legend class="sr-only">{t('kotoba.fokus_label')}</legend>
          {([
            ['semua', t('kotoba.fokus_semua')],
            ['lemah', t('kotoba.fokus_lemah')],
            ['tempo', t('kotoba.fokus_tempo')],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFokus(id)}
              aria-pressed={fokus === id}
              class="arc-chip"
            >
              {label}
            </button>
          ))}
        </fieldset>
        {/* Tingkat kesulitan: satu kontrol, tiga keadaan. Menggantikan sakelar
            "Kilat" yang biner — lihat catatan di `useState(tingkat)`. */}
        <fieldset class="col-span-2 flex flex-wrap items-center gap-1 border-0 p-0 m-0">
          <legend class="sr-only">{t('kotoba.tingkat')}</legend>
          {([
            ['santai', t('kotoba.tk_santai')],
            ['normal', t('kotoba.tk_normal')],
            ['ketat', t('kotoba.tk_ketat')],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTingkat(id)}
              aria-pressed={tingkat === id}
              class="arc-chip"
            >
              {label}
            </button>
          ))}
        </fieldset>
        {sumber === 'ssw' && (
          <select
            aria-label={t('kotoba.filter_kategori')}
            value={catFilter}
            onChange={(e) => setCatFilter((e.target as HTMLSelectElement).value)}
            class="min-h-11 rounded-control bg-surface-sunken border border-line px-2 text-[12px] text-fg"
          >
            <option value="all">{t('kotoba.semua_kategori')}</option>
            <option value="alat">{t('kotoba.cat_alat')}</option>
            <option value="kerja">{t('kotoba.cat_kerja')}</option>
            <option value="aman">{t('kotoba.cat_aman')}</option>
            <option value="mutu">{t('kotoba.cat_mutu')}</option>
            <option value="kantor">{t('kotoba.cat_kantor')}</option>
          </select>
        )}
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
          /* Di mode SSW ada EMPAT dropdown; `col-span-2` yang dipakai mode buku
             akan menyisakan lubang satu sel di baris kedua pada layar ponsel. */
          class={`${
            sumber === 'ssw' ? '' : 'col-span-2 sm:col-span-1'
          } min-h-11 rounded-control bg-surface-sunken border border-line px-2 text-[12px] text-fg`}
        >
          <option value="jp-id">{t('kotoba.arah_jp_id')}</option>
          <option value="id-jp">{t('kotoba.arah_id_jp')}</option>
        </select>
      </div>

      {/* Keterangan bidang: nama resmi Jepang + satu kalimat isi pekerjaan.
          Tanpa ini, "Pengolahan Makanan" dan "Restoran" terlihat sama saja
          bagi siswa yang belum pernah membaca daftar bidang. */}
      {sumber === 'ssw' && bidangAktif && (
        <p class="text-[11.5px] text-fg-muted mb-3">
          <b class="text-fg">{bidangAktif.namaJp}</b> · {bidangAktif.ringkas}
        </p>
      )}
      {sumber === 'ssw' && sswMemuat && (
        <p class="text-[12px] text-fg-muted mb-3">{t('kotoba.ssw_memuat')}</p>
      )}
      {sumber === 'ssw' && sswGalat && (
        <div class="flex flex-wrap items-center gap-2 mb-3">
          <p class="text-[12px] text-accent-red">{sswGalat}</p>
          {/* Tanpa tombol ini, kegagalan muat berarti tab SSW kosong selamanya:
              efek pemuat hanya jalan saat `bidangList.length` berubah, dan
              kegagalan tidak mengubahnya. */}
          <button
            type="button"
            onClick={() => void muatSsw(wa)}
            class="min-h-11 px-3 rounded-control border border-line bg-surface-raised text-fg text-[12px] font-bold"
          >
            {t('kotoba.coba_lagi')}
          </button>
        </div>
      )}

      {/* "Kosong" hanya kalau memang kosong — saat bidang SSW masih dimuat,
          pesan "tidak ada kosakata untuk filter ini" akan menyalahkan filter
          padahal yang belum selesai adalah permintaannya. */}
      {!pool.length && !(sumber === 'ssw' && (sswMemuat || !bidangId)) && (
        <div class="text-center py-6">
          <p class="text-sm text-fg-muted mb-3">{t('kotoba.kosong')}</p>
          {/* Kombinasi filter yang mustahil (mis. kategori "mutu" + jenis
              "kata kerja" — kategori itu isinya kata benda) dulu berakhir di
              jalan buntu: pesannya benar, tapi tidak ada cara keluar selain
              menebak dropdown mana yang harus diubah. */}
          <button
            type="button"
            onClick={resetFilter}
            class="min-h-11 px-4 rounded-control border border-line bg-surface-raised text-fg text-[12px] font-bold"
          >
            {t('kotoba.reset_filter')}
          </button>
        </div>
      )}

      {/* ── PAPAN SKOR IN-GAME ── */}
      <div class="mb-3 rounded-card border border-line bg-surface p-3 text-[12px] cetak-sembunyi">
        <div class="flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              const bukaBaru = !papanBuka;
              setPapanBuka(bukaBaru);
              if (bukaBaru) void ambilPapanGame('kotoba', 10).then(setPapan);
            }}
            aria-expanded={papanBuka}
            class="font-bold text-fg flex items-center gap-1.5"
          >
            <span>🏆 {t('kotoba.papan_skor')}</span>
            <span class="text-fg-muted">{papanBuka ? '▲' : '▼'}</span>
          </button>
          {papanBuka && (
            <button
              type="button"
              onClick={() => void ambilPapanGame('kotoba', 10).then(setPapan)}
              class="rounded-control border border-line bg-surface-raised px-2 py-0.5 text-[11px] font-bold text-fg-muted"
            >
              🔄
            </button>
          )}
        </div>
        {papanBuka && (
          <div class="mt-2">
            {papan.length === 0 ? (
              <p class="text-fg-muted py-1">{t('admin.papan_skor_kosong')}</p>
            ) : (
              <ol class="space-y-1">
                {papan.map((r, i) => {
                  const milikSendiri = Boolean(wa && r.no_wa === wa);
                  const medali = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
                  return (
                    <li
                      key={`${r.nama}-${r.skor}-${i}`}
                      class={`flex items-center justify-between rounded-control border px-2.5 py-1.5 ${
                        milikSendiri ? 'border-accent-violet bg-accent-violet/10' : 'border-line bg-surface-sunken'
                      }`}
                    >
                      <span class="min-w-0 truncate">
                        <strong class="mr-1.5">{medali}</strong>
                        <span class="font-bold text-fg">{r.nama}</span>
                        {r.kelas && <span class="ml-1 text-fg-muted">({r.kelas})</span>}
                        {milikSendiri && (
                          <span class="ml-1.5 rounded-pill bg-accent-violet/15 px-1.5 py-0.5 text-[10px] font-bold text-accent-violet">
                            ⭐ {t('arcade.anda')}
                          </span>
                        )}
                      </span>
                      <strong class="shrink-0 font-mono text-fg">{r.skor.toLocaleString('id-ID')}</strong>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        )}
      </div>

      {/* ── KUIS / KETIK ── */}
      {pool.length > 0 && (mode === 'kuis' || mode === 'ketik' || mode === 'bom') && (
        <section
          data-testid="kotoba-kartu"
          class={benar === true ? 'animasi-pop' : benar === false ? 'animasi-getar' : ''}
        >
          {fase === 'tanya' && item ? (
            <>
              {/* HUD */}
              <div class="arc-hud flex items-center justify-between gap-2">
                {/* Hati hanya bisa dibaca sebagai gambar: tanpa `role="img"`
                    + nama, pembaca layar menerima karakter ❤/♡ mentah dan
                    `aria-label` pada <span> biasa diabaikan (biome:
                    useAriaPropsSupportedByRole). Warnanya `.arc-merah`, bukan
                    `text-accent-red`: arena ini tidak ikut tema, sedangkan
                    token aksen berubah bersama tema. */}
                <span role="img" aria-label={`${t('kotoba.nyawa')}: ${hp}/${NYAWA_AWAL}`} class="arc-merah">
                  {Array.from({ length: NYAWA_AWAL }, (_, i) => (i < hp ? '❤' : '♡')).join(' ')}
                </span>
                <span>
                  {t('kotoba.skor')} <strong>{skor}</strong>
                  {kombo >= 2 && (
                    <span class="arc-amber font-bold">
                      {' '}· {kombo}×{kombo >= 5 ? ` 🔥 ${t('kotoba.fever')}` : ''}
                    </span>
                  )}
                </span>
                <span>{soalKe}</span>
              </div>

              {/* Sumbu Bom Sakura — satu hitungan untuk seluruh ronde. Angkanya
                  ditulis besar dan berubah warna di 10 detik terakhir, supaya
                  siswa merasakan desakan tanpa harus membaca bar tipis. */}
              {mode === 'bom' && (
                <div
                  class={`arc-bom ${sisaBom <= 10 ? 'arc-bom--bahaya' : ''}`}
                  role="timer"
                  aria-live="off"
                  aria-label={`${t('kotoba.mode_bom')} — ${sisaBom} ${t('kotoba.detik')}`}
                >
                  <span>💣 {t('kotoba.mode_bom')}</span>
                  <span class="tabular-nums text-lg">{sisaBom}{t('kotoba.detik')}</span>
                </div>
              )}
              {mode === 'bom' && (
                <div class="arc-meter">
                  <div
                    class={`arc-meter-fill ${sisaBom <= 10 ? 'arc-meter-fill--hot' : ''}`}
                    style={`transform:scaleX(${sisaBom / DURASI_BOM_DETIK})`}
                  />
                </div>
              )}
              {/* Batas waktu — hanya kuis, dan TIDAK digambar pada tingkat
                  Santai: bar yang diam terbaca sebagai "waktumu tidak habis",
                  padahal yang benar "tidak ada waktu". */}
              {mode === 'kuis' && tingkat !== 'santai' && (
                <div
                  class="arc-meter"
                  role="progressbar"
                  aria-label={t('kotoba.sisa_waktu')}
                  aria-valuenow={Math.round(sisaWaktu)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    class={`arc-meter-fill ${sisaWaktu <= 25 ? 'arc-meter-fill--hot' : ''}`}
                    style={`transform:scaleX(${sisaWaktu / 100})`}
                  />
                </div>
              )}

              {/* Soal */}
              <div class="mt-3 text-center">
                <div class="mb-2 flex justify-center gap-1.5">
                  <span class="arc-cyan text-[10px] font-bold">{labelAsal(item)}</span>
                  <span class="arc-amber text-[10px] font-bold">· {labelPos[item.pos]}</span>
                </div>
                <p data-testid="kotoba-soal" class="arc-tanya">
                  {mode === 'ketik' ? item.k : arah === 'jp-id' ? item.k : item.id}
                </p>
                <p class="mt-1 text-[13px]">
                  {mode === 'ketik'
                    ? item.id
                    : arah === 'jp-id'
                      ? `${item.h} (${item.r})`
                      : t('kotoba.pilih_kotoba')}
                </p>
                <button
                  type="button"
                  onClick={() => ucapkan(item.h)}
                  class="arc-btn arc-btn--small arc-btn--ghost mx-auto mt-2"
                  aria-label={t('kotoba.dengarkan')}
                >
                  🔊
                </button>
              </div>

              {/* Jawaban */}
              {mode === 'kuis' || mode === 'bom' ? (
                <div class="mt-3 grid gap-2">
                  {pilihan.map((opsi, i) => {
                    const sudah = benar !== null;
                    const iniBenar = opsi === teksBenar;
                    const iniDipilih = opsi === dijawab;
                    let gaya = '';
                    if (sudah && iniBenar) gaya = 'arc-opsi--benar';
                    else if (sudah && iniDipilih) gaya = 'arc-opsi--salah';
                    else if (sudah) gaya = 'arc-opsi--redup';
                    return (
                      <button
                        key={opsi}
                        type="button"
                        data-opsi={i + 1}
                        disabled={sudah}
                        onClick={() => jawabSoal(opsi)}
                        class={`arc-opsi arc-opsi--teks ${gaya}`}
                      >
                        <span class="break-words">{opsi}</span>
                        <span class="arc-opsi--kunci">{i + 1}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div class="mt-3">
                  <label for="kotoba-ketik" class="mb-1 block text-[11px] font-bold">
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
                      class="min-h-11 flex-1 text-sm"
                    />
                    <button
                      type="button"
                      onClick={cekKetikan}
                      disabled={benar !== null}
                      class="arc-btn arc-btn--violet arc-btn--small"
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
          ) : fase === 'hasil' ? (
            /* ── HASIL RONDE ── */
            <div data-testid="kotoba-hasil">
              <h3 class="text-base font-black text-fg text-center mb-1">{t('kotoba.hasil_judul')}</h3>
              <p class="text-center text-[12px] text-fg-muted mb-4">
                {t('kotoba.hasil_skor')} <strong class="text-fg">{skor}</strong> ·{' '}
                {t('kotoba.hasil_benar')} {jumlahBenar}/{soalKe}
                {soalKe > 0 ? ` (${Math.round((jumlahBenar / soalKe) * 100)}%)` : ''}
                {komboMaks >= 2 ? ` · 🔥 ${t('kotoba.kombo_maks')} ${komboMaks}×` : ''}
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
          ) : (
            /* Ronde belum punya soal — satu frame saat bank bidang baru tiba.
               Dulu cabang ini menampilkan kartu "Ronde selesai · 0/0", yang
               terbaca sebagai "ronde gagal" padahal tidak ada satu soal pun
               yang ditanyakan. */
            <p class="text-center text-sm text-fg-muted py-6">{t('kotoba.memuat')}</p>
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
                {labelAsal(kartu)} · {(kartuIdx % pool.length) + 1}/{pool.length}
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
      </div>

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
              <p class="text-sm font-bold text-fg">
                {sumber === 'ssw' ? t('kotoba.judul_cetak_ssw') : t('kotoba.judul_cetak')}
              </p>
              <p class="text-[11px] text-fg-muted">
                {sumber === 'ssw'
                  ? `${bidangAktif?.nama ?? ''} (${bidangAktif?.namaJp ?? ''})${
                      catFilter === 'all' ? '' : ` · ${labelKategori[catFilter as Kategori]}`
                    }`
                  : `${t('kotoba.bab')} ${labelRentangBab()}`}{' '}
                · {hasilCari.length} {t('kotoba.kata_tersedia')}
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
                        {v.h} ({v.r}) ·{' '}
                        {sumber === 'ssw'
                          ? /* Kategori, bukan jenis kata: di mode bidang,
                               "Kata benda" tidak memberi tahu apa pun —
                               "Alat & bahan" yang menunjukkan bagian mana
                               yang sedang dilatih. */
                            (v.cat ? labelKategori[v.cat] : labelPos[v.pos])
                          : `${t('kotoba.bab')} ${v.b} · ${labelPos[v.pos]}`}
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
