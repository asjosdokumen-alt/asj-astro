/**
 * ArcadeGame.tsx — dua game refleks untuk `/arcade`.
 *
 * ASAL RANCANGAN: pemilik mengirim desain + kode HTML siap pakai (2026-11-04).
 * Yang saya AMBIL adalah data dan mekaniknya; yang saya TINGGALKAN adalah
 * bentuk kodenya: berkas itu memuat Tailwind dari CDN dan memakai `onclick`
 * global. Repo ini PWA yang harus jalan OFFLINE dan komponennya Preact — CDN
 * berarti game mati begitu jaringan mati, dan `onclick` global tidak bisa
 * diuji.
 *
 * YANG DIPERTAHANKAN DARI DESAIN
 *   • 2-tap (pilih barang → ketuk rak), bukan drag-and-drop: drag bentrok
 *     dengan scroll dan pull-to-refresh di HP.
 *   • Perintah dirakit acak dari 6 warna × 24 barang × 12 lokasi = 1 728 variasi.
 *   • Mode Choukai (teks disembunyikan) untuk melatih mendengar.
 *   • Kalimat disusun dengan partikel yang benar (を untuk objek, に untuk
 *     tujuan, で untuk tempat aksi) — bukan sekadar kata ditempel.
 *
 * PERUBAHAN 2026-11-05 — DARI LATIHAN MENJADI PERMAINAN
 * ----------------------------------------------------
 * Versi pertama berjalan TERUS sampai tiga kesalahan. Akibatnya satu-satunya
 * akhir yang mungkin adalah kalah: pemain tidak pernah "selesai", tidak tahu
 * seberapa baik ia, dan tidak punya alasan mengulang selain mengejar angka.
 * Tiga hal yang ditambahkan, semuanya dihitung di `lib/arcade.ts` supaya bisa
 * diuji tanpa render:
 *
 *   1. TUJUAN     — shift berisi 8/12 pesanan, bukan tanpa akhir.
 *   2. PENILAIAN  — S/A/B/C dari akurasi DAN kecepatan, plus bintang per
 *                   tingkat (maksimum 9) yang disimpan di perangkat.
 *   3. EKONOMI    — bonus kecepatan berlaku sejak jawaban pertama, pengali
 *                   kombo berhenti di ×3, dan shift yang selesai dibayar
 *                   bonus + pengali tingkat.
 *
 * Combo Kalimat mendapat tiga hal yang sama dalam bentuk lain: batas waktu per
 * kalimat (ada taruhannya), pengali yang berhenti di ×10 (skornya linear, bukan
 * kuadratik), dan bonus menyelesaikan kalimat (yang dinilai adalah menyelesaikan,
 * bukan mengetuk).
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { t, useLang } from '../../store/i18n';
import { authStore } from '../../store/authReactive';
import { ambilPapanGame, bolehKirim, kirimSkor, waSiswa, type BarisPapanGame } from '../../lib/skorGame';
import ArcadeIkon from '../ui/ArcadeIkon';
import LoginGate from '../ui/LoginGate';
import { bunyi, bunyiHasil, bunyiKombo, bunyiMulai, ucap } from '../../lib/tts';
import {
  COMBO_SOAL,
  KOMBO_MAKS,
  SHIFT_GENBA,
  batasKalimat,
  bonusKalimat,
  bonusShift,
  buatPerintah,
  buatPilihan,
  buatZona,
  bintangShift,
  cekGenba,
  durasiShift,
  gelombangShift,
  kartuBenar,
  kocokKartu,
  nilaiShift,
  perintahDari,
  pilihanShift,
  poinGenba,
  skorShift,
  zonaAdaptif,
  type Kartu,
  type LevelCombo,
  type NilaiShift,
  type Perintah,
  type PilihanGenba,
  type TingkatGenba,
  type ZonaGenba,
} from '../../lib/arcade';

const KUNCI_LEMAH = 'asj_arcade_lemah';
const KUNCI_REKOR_GENBA = 'asj_arcade_rekor_genba';
const KUNCI_REKOR_COMBO = 'asj_arcade_rekor_combo';
const KUNCI_BINTANG = 'asj_arcade_bintang';
const KUNCI_TUTORIAL = 'asj_arcade_tutorial';
const TINGKAT: readonly TingkatGenba[] = ['magang', 'reguler', 'veteran'];

/**
 * Dua belas partikel untuk ledakan jawaban benar.
 *
 * Arah dan warnanya TETAP, bukan acak: `Math.random()` di dalam render berarti
 * setiap render ulang (dan setiap perubahan `sisa`) memindahkan partikelnya.
 * Nilainya adalah `[dx, dy, warna]` dalam piksel, disebar merata ke 360°.
 */
const PARTIKEL: readonly (readonly [number, number, string])[] = [
  [-52, -26, '#ffc247'],
  [-30, -46, '#4ade80'],
  [0, -54, '#67e8f9'],
  [30, -46, '#ffc247'],
  [52, -26, '#4ade80'],
  [58, 4, '#67e8f9'],
  [44, 30, '#ffc247'],
  [16, 46, '#4ade80'],
  [-16, 46, '#67e8f9'],
  [-44, 30, '#ffc247'],
  [-58, 4, '#4ade80'],
  [-8, -12, '#eef2f8'],
];

/**
 * Warna peti: latar DAN teks, hex tetap per id warna.
 *
 * KENAPA BUKAN `warna.kelas`
 * --------------------------
 * `GENBA_WARNA` menyimpan kelas Tailwind (`bg-slate-900` untuk くろい), dan
 * `global.css` memetakan ulang kelas palet itu untuk tema terang. Terukur di
 * tema terang 2026-11-10: latar くろい computed `rgba(255, 255, 255, 0.92)` —
 * peti HITAM menjadi PUTIH. Arena ini permukaan bertema-tetap, jadi warnanya
 * juga harus tetap.
 *
 * Pasangan latar/teks dipilih supaya tiap peti lolos ambang 4,5:1 terhadap
 * latarnya SENDIRI — peti adalah satu-satunya elemen yang latarnya berubah
 * menurut isi, jadi kontrasnya tidak bisa diwarisi dari tema. Terukur:
 * akai 5,30 · aoi 5,49 · kiiroi 8,97 · shiroi 12,02 · kuroi 11,86 · midori 6,78.
 *
 * Dua warna TERANG (きいろい, しろい) memakai teks gelap, bukan teks terang yang
 * digelapkan latarnya: versi pertama memakai #78350f untuk きいろい dan di layar
 * peti "kuning" terbaca COKELAT. Warna adalah INFORMASI di game ini — peti
 * kuning harus terlihat kuning, bukan cokelat tua.
 */
const WARNA_PETI: Readonly<Record<string, { bg: string; fg: string }>> = {
  akai: { bg: '#b91c1c', fg: '#fee2e2' },
  aoi: { bg: '#1d4ed8', fg: '#dbeafe' },
  kiiroi: { bg: '#fbbf24', fg: '#451a03' },
  shiroi: { bg: '#cbd5e1', fg: '#0f172a' },
  kuroi: { bg: '#1f2937', fg: '#e5e7eb' },
  midori: { bg: '#065f46', fg: '#d1fae5' },
};

interface CatatanLemah {
  judul: string;
  detail: string;
  /**
   * ID mentah, ditambahkan 2026-11-05 untuk mode "latih yang salah".
   * Entri lama tidak punya ini — dan itu ditangani, bukan diasumsikan: latihan
   * hanya memakai entri yang ketiga ID-nya masih dikenal.
   */
  warna?: string;
  barang?: string;
  zona?: string;
}

interface HasilShift {
  menang: boolean;
  nilai: NilaiShift;
  /** Tingkat yang dimainkan — disimpan supaya rekor yang ditampilkan tidak
   *  berubah bila pemain mengetuk tingkat lain setelah melihat hasil. */
  tingkat: TingkatGenba;
  bintang: number;
  bintangNaik: boolean;
  bonus: number;
  akurasi: number;
  sisaRata: number;
  komboMaks: number;
  deltaRekor: number;
  rekorBaru: boolean;
  drill: boolean;
}

function bacaLemah(): CatatanLemah[] {
  try {
    const raw = localStorage.getItem(KUNCI_LEMAH);
    return raw ? (JSON.parse(raw) as CatatanLemah[]) : [];
  } catch {
    return [];
  }
}

function simpanLemah(n: CatatanLemah[]): void {
  try {
    localStorage.setItem(KUNCI_LEMAH, JSON.stringify(n.slice(0, 30)));
  } catch {
    /* kuota penuh / mode privat */
  }
}

function bacaRekor(kunci: string): number {
  try {
    const n = Number(localStorage.getItem(kunci) || '0');
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function simpanRekor(kunci: string, nilai: number): void {
  try {
    localStorage.setItem(kunci, String(nilai));
  } catch {
    /* mode privat */
  }
}

/** Kunci rekor per tingkat — skor magang dan veteran tidak sebanding. */
function kunciRekor(tk: TingkatGenba): string {
  return `${KUNCI_REKOR_GENBA}_${tk}`;
}

function bacaRekorTingkat(tk: TingkatGenba): number {
  const baru = bacaRekor(kunciRekor(tk));
  if (baru > 0) return baru;
  /* Rekor lama tidak punya tingkat. Ia paling mungkin berasal dari Reguler —
     satu-satunya tingkat yang ada saat itu — jadi hanya Reguler yang mewarisi. */
  return tk === 'reguler' ? bacaRekor(KUNCI_REKOR_GENBA) : 0;
}

function bacaBintang(): Record<TingkatGenba, number> {
  const kosong: Record<TingkatGenba, number> = { magang: 0, reguler: 0, veteran: 0 };
  try {
    const raw = localStorage.getItem(KUNCI_BINTANG);
    if (!raw) return kosong;
    const o = JSON.parse(raw) as Partial<Record<TingkatGenba, unknown>>;
    for (const tk of TINGKAT) {
      const n = Number(o[tk]);
      if (Number.isFinite(n)) kosong[tk] = Math.min(3, Math.max(0, Math.round(n)));
    }
    return kosong;
  } catch {
    return kosong;
  }
}

function simpanBintang(tk: TingkatGenba, n: number): void {
  try {
    const semua = bacaBintang();
    if (n <= semua[tk]) return;
    semua[tk] = n;
    localStorage.setItem(KUNCI_BINTANG, JSON.stringify(semua));
  } catch {
    /* mode privat */
  }
}

function bacaTutorial(): boolean {
  try {
    return localStorage.getItem(KUNCI_TUTORIAL) === '1';
  } catch {
    return false;
  }
}

function tandaiTutorial(): void {
  try {
    localStorage.setItem(KUNCI_TUTORIAL, '1');
  } catch {
    /* mode privat */
  }
}

/** Getaran singkat; diabaikan di perangkat yang tidak mendukung (iOS). */
function getar(pola: number | number[]): void {
  try {
    navigator.vibrate?.(pola);
  } catch {
    /* bukan kegagalan: getaran hanya penguat */
  }
}

function labelTingkat(tk: TingkatGenba): string {
  if (tk === 'magang') return t('arcade.tk_magang');
  if (tk === 'veteran') return t('arcade.tk_veteran');
  return t('arcade.tk_reguler');
}

export default function ArcadeGame() {
  /* Berlangganan bahasa. `t()` membaca store dengan `.get()`, dan nanostores
     TIDAK memberi tahu Preact lewat `get()` — tanpa baris ini, mengganti bahasa
     saat halaman ini terbuka meninggalkan seluruh label dalam bahasa lama. */
  useLang();

  /* Gerbang login — sama seperti /kotoba, /matematika, dan /wawancara.
     BATASNYA JUJUR: ini gerbang KLIEN. Seluruh kata arcade ada di bundel, jadi
     ia menghentikan akses sambil lalu, bukan penyerang; data yang benar-benar
     perlu dijaga harus ditolak di server (lihat `getBankKotoba`). */
  /* Admin tidak digerbang: di `/kotoba` dan `/matematika` admin boleh memeriksa
     permainan tanpa login kandidat, dan `/arcade` harus sama — kalau tidak,
     satu-satunya orang yang perlu MEMERIKSA game justru yang tertahan. */
  const [masuk, setMasuk] = useState(() => {
    const a = authStore.get();
    return !!a.isLoggedIn && (a.role === 'admin' || a.role === 'kandidat');
  });
  const [tab, setTab] = useState<'genba' | 'combo'>('genba');
  const [lemah, setLemah] = useState<CatatanLemah[]>(() => bacaLemah());
  const [bintang, setBintang] = useState<Record<TingkatGenba, number>>(() => bacaBintang());
  const [papanBuka, setPapanBuka] = useState(false);
  const [papan, setPapan] = useState<BarisPapanGame[]>([]);
  const [tutorial, setTutorial] = useState<boolean>(() => !bacaTutorial());

  const muatPapan = (jenis: 'genba' | 'combo') => {
    void ambilPapanGame(jenis, 10).then(setPapan);
  };

  const catatLemah = (baru: CatatanLemah) => {
    setLemah((prev) => {
      if (prev.some((x) => x.judul === baru.judul)) return prev;
      const daftar = [baru, ...prev];
      simpanLemah(daftar);
      return daftar;
    });
  };

  const hapusLemahSatu = (p: Perintah) => {
    setLemah((prev) => {
      const daftar = prev.filter(
        (x) => !(x.warna === p.warna.id && x.barang === p.barang.id && x.zona === p.zona.id),
      );
      if (daftar.length === prev.length) return prev;
      simpanLemah(daftar);
      return daftar;
    });
  };

  const hapusLemah = () => {
    setLemah([]);
    simpanLemah([]);
  };

  const tutupTutorial = () => {
    setTutorial(false);
    tandaiTutorial();
  };

  /* ── GAME 1: Genba Order Rush ────────────────────────────────────────────
     `mode` membedakan shift biasa dari latihan ulang. Latihan memakai aturan
     yang lebih longgar dan TIDAK mengirim skor ke papan peringkat: kalau ia
     mengirim, delapan pesanan dengan waktu 9 detik akan mengalahkan shift
     penuh, dan papan berhenti berarti. */
  const [tingkat, setTingkat] = useState<TingkatGenba>('reguler');
  const aturan = SHIFT_GENBA[tingkat];
  const [mode, setMode] = useState<'shift' | 'drill'>('shift');
  const [target, setTarget] = useState(aturan.pesanan);
  const antrianRef = useRef<Perintah[]>([]);

  const [perintah, setPerintah] = useState<Perintah | null>(null);
  const [pilihan, setPilihan] = useState<PilihanGenba[]>([]);
  /** Rak yang DITAMPILKAN — subset, bukan seluruh 12. Lihat `SHIFT_GENBA`. */
  const [zona, setZona] = useState<ZonaGenba[]>([]);
  const [dipilih, setDipilih] = useState<string | null>(null);
  const [nyawa, setNyawa] = useState(aturan.nyawa);
  const [skor, setSkor] = useState(0);
  const [komboGenba, setKomboGenba] = useState(0);
  const [komboGenbaMaks, setKomboGenbaMaks] = useState(0);
  const [pesananSelesai, setPesananSelesai] = useState(0);
  const [salahGenba, setSalahGenba] = useState(0);
  const [jumlahSisa, setJumlahSisa] = useState(0);
  const [sisa, setSisa] = useState(100);
  const [pesan, setPesan] = useState('');
  const [choukai, setChoukai] = useState(false);
  const [fase, setFase] = useState<'idle' | 'main' | 'selesai'>('idle');
  const [hasil, setHasil] = useState<HasilShift | null>(null);
  const [poinTerbang, setPoinTerbang] = useState<{ id: number; nilai: number } | null>(null);
  /**
   * Sedang menunggu perintah berikutnya setelah satu kesalahan.
   *
   * Tanpa penanda ini, `fase` tetap 'main' dan `dipilih` tetap terpasang selama
   * jeda 1,1 detik — sehingga ketukan kedua pada rak yang salah MENGHABISKAN
   * NYAWA LAGI, dan ketukan pada rak yang benar memberi poin setelah permainan
   * sudah menyatakan salah. Ditemukan saat review 2026-11-04.
   */
  const [menunggu, setMenunggu] = useState(false);
  /**
   * Sinyal visual singkat untuk jawaban benar/salah.
   *
   * Tanpa ini, benar dan salah hanya dibedakan suara dan teks — di kelas ramai
   * atau HP yang diset senyap keduanya tidak terasa, dan siswa baru sadar salah
   * setelah nyawanya berkurang. Dikosongkan lagi setelah 350 ms supaya kelas
   * animasinya tidak menempel dan bisa dipicu ulang pada jawaban berikutnya.
   */
  const [animasi, setAnimasi] = useState<'' | 'benar' | 'salah'>('');
  /**
   * Rak yang diketuk saat salah — dan rak yang SEHARUSNYA.
   *
   * Dulu satu-satunya koreksi adalah satu baris teks selama 1,1 detik. Di layar
   * HP, teks itu harus dibaca sambil menghafal rak mana yang tadi diketuk;
   * menyorot keduanya membuat kesalahannya terlihat, bukan terbaca.
   */
  const [rakSalah, setRakSalah] = useState<string | null>(null);

  const aturanAktif = mode === 'drill' ? SHIFT_GENBA.magang : aturan;

  /**
   * Pasang perintah berikutnya.
   *
   * `kombo` ikut dikirim karena jumlah rak MENGIKUTI performa
   * (`zonaAdaptif`): empat jawaban benar berturut menambah dua rak, dan salah
   * mengembalikannya. Tanpa parameter ini, `pasang` membaca `kombo` dari state
   * yang belum tentu sudah ter-commit pada tick yang sama.
   */
  const pasang = (modeNow: 'shift' | 'drill', urutanKe: number, kombo: number, p?: Perintah) => {
    const a = modeNow === 'drill' ? SHIFT_GENBA.magang : aturan;
    const cmd = p ?? (modeNow === 'drill' ? antrianRef.current.shift() : undefined) ?? buatPerintah();
    setPerintah(cmd);
    setPilihan(buatPilihan(cmd, Math.random, pilihanShift(a, urutanKe)));
    setZona(buatZona(cmd, zonaAdaptif(a, urutanKe, kombo)));
    setDipilih(null);
    setSisa(100);
    setPesan('');
    setMenunggu(false);
    setRakSalah(null);
    setAnimasi('');
    /* Kecepatan bicara ikut gelombang, bukan lompatan pada satu ambang skor:
       dulu 0,9 lalu tiba-tiba 1,05 setelah ¥500, dan siswa yang mendengarnya
       tidak tahu mengapa tiba-tiba lebih cepat. */
    ucap(cmd.jp, 0.9 + 0.06 * gelombangShift(a, urutanKe));
  };

  /** Antrian latihan dari catatan salah; entri lama tanpa ID dilewati. */
  const siapkanDrill = (): Perintah[] => {
    const hasilAntri: Perintah[] = [];
    const terpakai = new Set<string>();
    for (const e of lemah) {
      if (!e.warna || !e.barang || !e.zona) continue;
      const kunci = `${e.warna}_${e.barang}_${e.zona}`;
      if (terpakai.has(kunci)) continue;
      const p = perintahDari(e.warna, e.barang, e.zona);
      if (!p) continue;
      terpakai.add(kunci);
      hasilAntri.push(p);
    }
    return hasilAntri.slice(0, 8);
  };

  const jumlahDrill = (() => {
    const terpakai = new Set<string>();
    for (const e of lemah) {
      if (!e.warna || !e.barang || !e.zona) continue;
      if (!perintahDari(e.warna, e.barang, e.zona)) continue;
      terpakai.add(`${e.warna}_${e.barang}_${e.zona}`);
    }
    return terpakai.size;
  })();

  const mulai = (modeNow: 'shift' | 'drill') => {
    const antrian = modeNow === 'drill' ? siapkanDrill() : [];
    if (modeNow === 'drill' && antrian.length === 0) return;
    antrianRef.current = antrian;
    setMode(modeNow);
    setTarget(modeNow === 'drill' ? antrian.length : aturan.pesanan);
    setNyawa(modeNow === 'drill' ? SHIFT_GENBA.magang.nyawa : aturan.nyawa);
    setSkor(0);
    setKomboGenba(0);
    setKomboGenbaMaks(0);
    setPesananSelesai(0);
    setSalahGenba(0);
    setJumlahSisa(0);
    setHasil(null);
    setPoinTerbang(null);
    setFase('main');
    pasang(modeNow, 0, 0);
    bunyiMulai();
  };

  /* `gagal` dibuat ulang tiap render; efek timer menyimpannya di ref supaya
     memasukkannya ke daftar dependensi tidak me-restart hitungan setiap render. */
  const gagalRef = useRef<(alasan: string, rak?: string) => void>(() => {});

  const selesaikan = (
    menang: boolean,
    skorFinal: number,
    benar: number,
    salahAkhir: number,
    sisaTotal: number,
    komboAkhir: number,
    modeNow: 'shift' | 'drill',
  ) => {
    const percobaan = benar + salahAkhir;
    const akurasi = percobaan > 0 ? benar / percobaan : 0;
    const sisaRata = benar > 0 ? sisaTotal / benar : 0;
    const nilai = nilaiShift({ selesai: menang, benar, salah: salahAkhir, sisaRata });
    const bintangBaru = bintangShift(nilai);
    const drill = modeNow === 'drill';
    const rekorLama = drill ? 0 : bacaRekorTingkat(tingkat);
    const rekorBaru = !drill && skorFinal > rekorLama;
    if (rekorBaru) simpanRekor(kunciRekor(tingkat), skorFinal);
    const bintangLama = bacaBintang()[tingkat];
    const bintangNaik = !drill && bintangBaru > bintangLama;
    if (bintangNaik) simpanBintang(tingkat, bintangBaru);
    if (!drill) setBintang(bacaBintang());
    setHasil({
      menang,
      nilai,
      tingkat,
      bintang: drill ? 0 : bintangBaru,
      bintangNaik,
      bonus: menang && !drill ? bonusShift(aturan) : 0,
      akurasi,
      sisaRata,
      komboMaks: komboAkhir,
      deltaRekor: drill ? 0 : skorFinal - rekorLama,
      rekorBaru,
      drill,
    });
    setSkor(skorFinal);
    setFase('selesai');
    bunyiHasil(menang);
  };

  /** Satu kali salah: nyawa berkurang, catatan disimpan, perintah berganti. */
  const gagal = (alasan: string, rak?: string) => {
    if (!perintah || fase !== 'main' || menunggu) return;
    bunyi(false);
    getar([20, 40, 20]);
    setAnimasi('salah');
    window.setTimeout(() => setAnimasi(''), 350);
    const sisaNyawa = nyawa - 1;
    const salahBaru = salahGenba + 1;
    setNyawa(sisaNyawa);
    setSalahGenba(salahBaru);
    setKomboGenba(0);
    setPesan(alasan);
    setRakSalah(rak ?? null);
    catatLemah({
      judul: `${perintah.warna.jp} ${perintah.barang.jp} → ${perintah.zona.jp}`,
      detail: `Artinya: ${perintah.warna.id_} ${perintah.barang.id_} ditaruh di ${perintah.zona.id_}`,
      warna: perintah.warna.id,
      barang: perintah.barang.id,
      zona: perintah.zona.id,
    });
    if (sisaNyawa <= 0) {
      selesaikan(false, skor, pesananSelesai, salahBaru, jumlahSisa, komboGenbaMaks, mode);
      return;
    }
    setMenunggu(true);
    window.setTimeout(() => {
      if (sisaNyawa <= 0) return;
      /* Di mode latihan, perintah yang gagal DIKEMBALIKAN ke depan antrean —
         itu inti latihan: yang salah diulang sampai benar. Di shift biasa ia
         diganti perintah baru, seperti pesanan yang terlewat. */
      if (mode === 'drill' && perintah) antrianRef.current.unshift(perintah);
      /* Kesulitan dihitung dari pesanan yang SUDAH SELESAI, bukan dari
         percobaan. Kalau dihitung dari percobaan, tiga kesalahan berturut-turut
         menaikkan gelombang dan pemain yang sedang kalah justru dihukum dengan
         waktu lebih pendek — spiral yang tidak diinginkan. */
      pasang(mode, pesananSelesai, 0);
    }, 1100);
  };
  gagalRef.current = gagal;

  const taruh = (zonaId: string) => {
    if (!perintah || !dipilih || fase !== 'main' || menunggu) return;
    const modeNow = mode;
    if (cekGenba(perintah, dipilih, zonaId)) {
      /* Nada DAN haptik naik mengikuti kombo. `komboBaru` dihitung lebih dulu
         supaya keduanya memakai nilai yang sama dengan yang akan ditampilkan —
         versi sebelumnya membunyikan nada yang sama untuk kombo ke-1 dan ke-12,
         jadi pemain tidak punya cara MENDENGAR bahwa ia sedang panas. */
      const komboBaru = komboGenba + 1;
      bunyiKombo(komboBaru);
      getar(komboBaru >= 5 ? [10, 26, 10] : 12);
      const { tambah } = poinGenba(sisa, komboBaru);
      const skorBaru = skor + tambah;
      const benarBaru = pesananSelesai + 1;
      const sisaTotalBaru = jumlahSisa + sisa;
      const komboMaksBaru = Math.max(komboGenbaMaks, komboBaru);
      setKomboGenba(komboBaru);
      setKomboGenbaMaks(komboMaksBaru);
      setPesananSelesai(benarBaru);
      setJumlahSisa(sisaTotalBaru);
      setPoinTerbang({ id: Date.now(), nilai: tambah });
      if (modeNow === 'drill') hapusLemahSatu(perintah);
      if (benarBaru >= target) {
        const skorFinal = modeNow === 'drill' ? skorBaru : skorShift(skorBaru, aturan, true);
        selesaikan(true, skorFinal, benarBaru, salahGenba, sisaTotalBaru, komboMaksBaru, modeNow);
      } else {
        setSkor(skorBaru);
        pasang(modeNow, benarBaru, komboBaru);
        /* SESUDAH `pasang`, bukan sebelum. `pasang()` mengosongkan `animasi`
           (baris `setAnimasi('')` di dalamnya), dan kedua panggilan berada di
           satu batch — jadi menyetelnya lebih dulu berarti nilai terakhir yang
           menang adalah string kosong. Akibatnya animasi jawaban benar TIDAK
           PERNAH tampil sejak ia ditulis; yang salah tetap bergetar karena
           `gagal()` memanggil `pasang` lewat setTimeout 1,1 detik. Ketahuan
           ketika partikel mulai bergantung pada nilai yang sama. */
        setAnimasi('benar');
        window.setTimeout(() => setAnimasi(''), 350);
      }
    } else {
      gagal(
        `${t('arcade.salah_harusnya')} ${perintah.warna.id_} ${perintah.barang.id_} → ${perintah.zona.id_}`,
        zonaId,
      );
    }
  };

  /* Timer per perintah. `perintah` cukup sebagai pemicu: `setPerintah` selalu
     memasang objek BARU, jadi identitasnya berubah di setiap perintah — bahkan
     kalau kebetulan kata-katanya sama.
     `menunggu` WAJIB ada di daftar dependensi: tanpa itu sumbu terus berjalan
     selama jeda 1,1 detik setelah kesalahan, dan kesalahan yang terjadi di
     detik-detik akhir bisa memakan nyawa KEDUA kalinya. */
  // biome-ignore lint/correctness/useExhaustiveDependencies: timer hanya boleh mulai ulang saat perintah/fase/menunggu berubah — bukan tiap kali skor atau gelombang berganti
  useEffect(() => {
    if (fase !== 'main' || !perintah || menunggu) return;
    const batas = durasiShift(aturanAktif, pesananSelesai);
    const mulaiMs = Date.now();
    const id = window.setInterval(() => {
      const lewat = Date.now() - mulaiMs;
      const s = Math.max(0, 100 - (lewat / batas) * 100);
      setSisa(s);
      if (s <= 0) {
        window.clearInterval(id);
        /* Lewat `gagal()` — BUKAN penurunan nyawa sendiri. Versi pertama saya
           hanya mengurangi nyawa di sini, tanpa memanggil perintah berikutnya,
           sehingga siswa yang kehabisan waktu dengan nyawa masih tersisa
           terkurung di layar yang sama dengan sumbu 0 dan tidak bisa apa-apa. */
        gagalRef.current(t('arcade.waktu_habis'));
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [fase, perintah, menunggu]);

  /* ── GAME 2: Kotoba Combo Builder ────────────────────────────────────────
     Kombo naik tiap kartu benar dan TIDAK lagi tanpa batas: `KOMBO_MAKS`
     membuat skor tumbuh linear, bukan kuadratik. Kalimat punya batas waktu,
     dan menyelesaikannya memberi bonus — yang dinilai adalah menyelesaikan,
     bukan mengetuk sebanyak mungkin. */
  const [soalIdx, setSoalIdx] = useState(0);
  const [langkah, setLangkah] = useState(0);
  const [kartu, setKartu] = useState<Kartu[]>([]);
  const [tray, setTray] = useState<string[]>([]);
  const [kombo, setKombo] = useState(1);
  const [balas, setBalas] = useState('');
  const [skorCombo, setSkorCombo] = useState(0);
  const [rekorCombo, setRekorCombo] = useState<number>(() => bacaRekor(KUNCI_REKOR_COMBO));
  const [kalimatSelesai, setKalimatSelesai] = useState(0);
  const [kalimatGagal, setKalimatGagal] = useState(0);
  const [bonusTerakhir, setBonusTerakhir] = useState<number | null>(null);
  const [sisaKalimat, setSisaKalimat] = useState(100);
  const [kalimatAktif, setKalimatAktif] = useState(true);
  const sisaKalimatRef = useRef(100);
  const langkahRef = useRef(0);
  /** `habisWaktu` dibuat ulang tiap render; timer menyimpannya di ref. */
  const habisRef = useRef<() => void>(() => {});
  /**
   * Tingkat kesulitan Combo.
   *
   * `normal` mewarnai kartu menurut jenis kata (partikel kuning, benda biru,
   * kerja merah) — dan itu ternyata MEMBERI JAWABAN: siswa bisa memilih kartu
   * kuning berikutnya tanpa tahu partikel mana yang benar. `sulit` menghapus
   * warna itu, jadi partikel harus ditentukan dari tata bahasa.
   */
  const [level, setLevel] = useState<LevelCombo>('normal');

  /* Hell memakai kalimat PANJANG (dua klausa) yang terpisah dari daftar biasa,
     supaya level mudah tidak ikut kebanjiran kalimat 10–13 kartu. */
  const daftarCombo = level === 'hell' ? COMBO_SOAL.filter((x) => x.hell) : COMBO_SOAL.filter((x) => !x.hell);
  const soal = daftarCombo[soalIdx % daftarCombo.length];

  const muatSoal = (idx: number) => {
    const daftar = level === 'hell' ? COMBO_SOAL.filter((x) => x.hell) : COMBO_SOAL.filter((x) => !x.hell);
    const s = daftar[idx % daftar.length];
    setSoalIdx(idx);
    setLangkah(0);
    setTray([]);
    setKartu(kocokKartu(s));
    setBalas('');
    setBonusTerakhir(null);
    setSisaKalimat(100);
    sisaKalimatRef.current = 100;
    setKalimatAktif(true);
  };

  /** Pilih soal berikutnya secara acak (tidak mengulang soal yang baru saja tampil). */
  const berikutCombo = () => {
    const len = daftarCombo.length;
    if (len <= 1) {
      muatSoal(0);
      return;
    }
    const kini = soalIdx % len;
    const geser = 1 + Math.floor(Math.random() * (len - 1));
    muatSoal((kini + geser) % len);
  };

  /** Kembalikan 1 kartu terakhir dari rel ke meja bila salah susun atau ingin cek ulang. */
  const batalSatu = () => {
    if (langkah <= 0 || langkah >= soal.urutan.length) return;
    const kembali = soal.urutan[langkah - 1];
    if (!kembali) return;
    setLangkah(langkah - 1);
    setTray((tr) => tr.slice(0, -1));
    setKartu((ks) => [...ks, kembali]);
    setBalas('');
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: muat ulang hanya saat LEVEL berganti; muatSoal dibuat ulang tiap render sehingga memasukkannya ke daftar akan mengulang tanpa henti
  useEffect(() => {
    muatSoal(0);
  }, [level]);

  /* Batas waktu kalimat. Dimulai ulang HANYA saat soal/level berganti atau
     setelah kalimat selesai — bukan tiap kartu: kalau ia mulai ulang tiap
     ketukan, tidak ada yang namanya "terlalu lambat". */
  // biome-ignore lint/correctness/useExhaustiveDependencies: dipicu soal/level/aktif, bukan tiap ketukan kartu
  useEffect(() => {
    if (tab !== 'combo' || !kalimatAktif) return;
    const batas = batasKalimat(soal);
    /* Lanjutkan dari sisa terakhir, bukan dari 100. Tanpa ini, berpindah tab
       dan kembali menjadi cara gratis mengulang waktu. */
    const mulaiMs = Date.now() - ((100 - sisaKalimatRef.current) / 100) * batas;
    const id = window.setInterval(() => {
      const s = Math.max(0, 100 - ((Date.now() - mulaiMs) / batas) * 100);
      sisaKalimatRef.current = s;
      setSisaKalimat(s);
      if (s <= 0) {
        window.clearInterval(id);
        habisRef.current();
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [tab, soalIdx, level, kalimatAktif]);

  /** Waktu habis: kalimat gagal, kombo kembali ke x1, jawabannya ditunjukkan. */
  const habisWaktu = () => {
    if (langkahRef.current >= soal.urutan.length) return;
    bunyi(false);
    getar([20, 40, 20]);
    setKalimatAktif(false);
    setKombo(1);
    setKalimatGagal((n) => n + 1);
    const benar = soal.urutan.map((u) => u.jp).join(' ');
    setBalas(`${t('arcade.kalimat_gagal')} ${benar}`);
    catatLemah({ judul: soal.indo, detail: benar });
    window.setTimeout(() => berikutCombo(), 2400);
  };
  habisRef.current = habisWaktu;
  langkahRef.current = langkah;
  // biome-ignore lint/correctness/useExhaustiveDependencies: hanya kirim saat fase selesai dan skor berubah
  useEffect(() => {
    if (fase !== 'selesai' || skor <= 0 || mode === 'drill') return;
    if (!bolehKirim(`genba:${skor}`)) return;
    void kirimSkor('genba', skor, {
      pesanan: pesananSelesai,
      kombo: komboGenbaMaks,
      tingkat,
      nilai: hasil?.nilai ?? '',
    }).then(() => {
      if (papanBuka) muatPapan('genba');
    });
  }, [fase, skor]);

  /* ── Papan peringkat: Combo ────────────────────────────────────────────────
     Combo TIDAK punya akhir ronde — ia berjalan selama pemain mau. Mengirim di
     setiap kalimat selesai berarti puluhan permintaan per menit, jadi dipakai
     JEDA 5 detik: skor dikirim setelah permainan berhenti berubah selama itu.
     Efek ini dibersihkan setiap `skorCombo` berubah, sehingga hitungannya
     selalu mulai lagi dan hanya kiriman TERAKHIR yang benar-benar lolos. */
  // biome-ignore lint/correctness/useExhaustiveDependencies: jeda 5 detik hanya dipicu perubahan skorCombo
  useEffect(() => {
    if (skorCombo <= 0) return;
    const id = window.setTimeout(() => {
      if (!bolehKirim(`combo:${skorCombo}`)) return;
      void kirimSkor('combo', skorCombo, { level, kombo, kalimat: kalimatSelesai }).then(() => {
        if (papanBuka) muatPapan('combo');
      });
    }, 5000);
    return () => window.clearTimeout(id);
  }, [skorCombo]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: muat papan saat tab atau status buka berubah
  useEffect(() => {
    if (papanBuka) muatPapan(tab);
  }, [tab, papanBuka]);

  /** Rekor Combo disimpan per puncak skor, bukan per kalimat. */
  const catatRekorCombo = (n: number) => {
    if (n <= rekorCombo) return;
    setRekorCombo(n);
    simpanRekor(KUNCI_REKOR_COMBO, n);
  };

  const ketuk = (k: Kartu, indeks: number) => {
    /* KALIMAT SUDAH SELESAI — abaikan ketukan berikutnya.
       Tanpa penjaga ini, selama jeda 1,6 detik sebelum soal berganti kartu
       masih bisa diketuk, dan ketukan pada kartu pertama soal LAMA ikut
       memanggil `muatSoal(soalIdx + 1)` lagi — soal bisa melompat dua kali. */
    if (langkah >= soal.urutan.length || !kalimatAktif) return;

    if (kartuBenar(soal, langkah, k)) {
      bunyi(true);
      getar(10);
      ucap(k.jp, 1);
      const l = langkah + 1;
      /* Kombo yang DIPAKAI adalah kombo setelah kenaikan: kartu pertama sebuah
         kalimat bernilai x2, bukan x1. Sebelumnya `setSkorCombo` membaca
         `kombo` lama sehingga ketukan pertama selalu dinilai seolah tidak ada
         rangkaian — dan angka di layar (x2) tidak cocok dengan skor yang masuk. */
      const komboBaru = Math.min(KOMBO_MAKS, kombo + 1);
      const skorBaru = skorCombo + 50 * komboBaru;
      setLangkah(l);
      setTray((tr) => [...tr, k.jp]);
      setKombo(komboBaru);
      setSkorCombo(skorBaru);
      catatRekorCombo(skorBaru);
      setKartu((ks) => ks.filter((_, i) => i !== indeks));
      if (l === soal.urutan.length) {
        /* Bonus menyelesaikan kalimat — inilah yang membuat "selesai" lebih
           bernilai daripada "mengetuk terus". Sisa waktu ikut dihitung, jadi
           kalimat yang cepat dibayar lebih. */
        const bonus = bonusKalimat(soal, sisaKalimatRef.current, level);
        setSkorCombo(skorBaru + bonus);
        catatRekorCombo(skorBaru + bonus);
        setBonusTerakhir(bonus);
        setKalimatAktif(false);
        setKalimatSelesai((n) => n + 1);
        setBalas(t('arcade.sempurna'));
        window.setTimeout(() => ucap(soal.urutan.map((u) => u.jp).join(' '), 0.95), 250);
        window.setTimeout(() => berikutCombo(), 1600);
      }
    } else {
      bunyi(false);
      getar([20, 40, 20]);
      setKombo(1);
      const harap = soal.urutan[langkah];
      setBalas(k.jenis === 'particle' ? k.ket : `${t('arcade.butuh')} ${harap?.jp ?? ''} — ${harap?.ket ?? ''}`);
      catatLemah({ judul: `${soal.indo} — ${k.jp}`, detail: k.ket });
    }
  };

  if (!masuk) {
    return <LoginGate onSuccess={() => setMasuk(true)} />;
  }

  const waSendiri = waSiswa();
  const gelombang = gelombangShift(aturanAktif, pesananSelesai) + 1;
  const progresShift = target > 0 ? Math.min(100, (pesananSelesai / target) * 100) : 0;
  /* Jumlah rak mengikuti performa (lihat `zonaAdaptif`), jadi tata letaknya
     harus ikut: 4 rak = 2 kolom, 6 = 3 kolom, 8 = 4 kolom. Ketiganya tetap DUA
     baris, sehingga tinggi area main tidak bertambah saat rak bertambah. */
  const kolomZona = zona.length >= 7 ? 4 : zona.length >= 5 ? 3 : 2;
  const rapatZona = kolomZona === 4;
  /** Jumlah slot nyawa yang DIGAMBAR. Latihan selalu memakai aturan magang. */
  const nyawaMaks = mode === 'drill' ? SHIFT_GENBA.magang.nyawa : aturan.nyawa;
  const warnaNilai =
    hasil?.nilai === 'S'
      ? 'arc-rank--s'
      : hasil?.nilai === 'A'
        ? 'arc-rank--a'
        : hasil?.nilai === 'B'
          ? 'arc-rank--b'
          : 'arc-rank--c';

  return (
    /* Batas lebar dipegang HALAMAN (`arcade.astro`), bukan komponen: di HP
       kolomnya `max-w-md` dan arena menempel ke tepi layar, di desktop kolomnya
       `lg:max-w-xl`. Kalau komponen ikut memasang `max-w-md` — seperti
       sebelumnya — batas halaman tidak pernah berlaku dan arena tetap 424 px di
       tengah layar 1280 px. */
    <div class="mx-auto w-full max-w-md lg:max-w-none">
      {/* Tab */}
      <div class="mb-3 grid grid-cols-2 gap-2">
        {(['genba', 'combo'] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            aria-pressed={tab === id}
            class={`min-h-11 rounded-control border px-3 text-[12px] font-bold ${
              tab === id ? 'border-accent-violet bg-accent-violet/10 text-accent-violet' : 'border-line bg-surface-raised text-fg-muted'
            }`}
          >
            {id === 'genba' ? `📦 ${t('arcade.tab_genba')}` : `🃏 ${t('arcade.tab_combo')}`}
          </button>
        ))}
      </div>

      {tab === 'genba' ? (
        <section aria-label={t('arcade.tab_genba')} class={`arc ${animasi === 'salah' ? 'arc--miss' : ''}`}>
          {/* ── Hub: tingkat, tutorial, mulai ─────────────────────────────
              Playfield hanya dirender saat bermain. Dulu rak dan meja sudah
              tampil sebelum mulai — siswa mengetuknya dan tidak terjadi apa-apa,
              yang terbaca sebagai game rusak, bukan sebagai "belum mulai". */}
          {fase !== 'main' && (
            <>
              <div>
                <p class="arc-kicker">{t('arcade.tingkat')}</p>
                <div class="mt-1.5 grid grid-cols-3 gap-1.5">
                  {TINGKAT.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setTingkat(id)}
                      aria-pressed={tingkat === id}
                      class={`arc-btn flex-col gap-0.5 px-1.5 ${tingkat === id ? 'arc-btn--on' : 'arc-btn--ghost'}`}
                    >
                      <span class="block text-[11px] font-bold leading-tight">{labelTingkat(id)}</span>
                      <span class="arc-stars">
                        {'★'.repeat(bintang[id])}
                        {'☆'.repeat(3 - bintang[id])}
                      </span>
                    </button>
                  ))}
                </div>
                <label class="arc-check">
                  <input type="checkbox" checked={choukai} onChange={(e) => setChoukai((e.target as HTMLInputElement).checked)} />
                  <span class="break-words">{t('arcade.choukai')}</span>
                </label>
              </div>

              {tutorial && (
                <div class="arc-note">
                  <p class="arc-note-title">{t('arcade.tutor_judul')}</p>
                  <ol class="arc-note-list">
                    <li>{t('arcade.tutor_1')}</li>
                    <li>{t('arcade.tutor_2')}</li>
                    <li>{t('arcade.tutor_3')}</li>
                  </ol>
                  <button type="button" onClick={tutupTutorial} class="arc-btn mt-2">
                    {t('arcade.mengerti')}
                  </button>
                </div>
              )}
            </>
          )}

          {/* ── Hasil shift ─────────────────────────────────────────────── */}
          {fase === 'selesai' && hasil ? (
            <div class="arc-result">
              <p class="arc-kicker">
                {hasil.drill ? t('arcade.latih_salah') : t('arcade.nilai')}
              </p>
              {!hasil.drill && <div class={`arc-rank ${warnaNilai}`}>{hasil.nilai}</div>}
              <p class="arc-result-title">
                {hasil.menang ? `🏁 ${t('arcade.shift_selesai')}` : `💀 ${t('arcade.nyawa_habis')}`}
              </p>
              <p class="arc-result-sub">
                {pesananSelesai}/{target} {t('arcade.pesanan')} · {t('arcade.akurasi')} {Math.round(hasil.akurasi * 100)}%
              </p>
              <div class="arc-stats">
                <div class="arc-stat">
                  <span>{t('arcade.skor_akhir')}</span>
                  <strong>¥ {skor}</strong>
                </div>
                <div class="arc-stat">
                  <span>{t('arcade.kombo_terbaik')}</span>
                  <strong>{hasil.komboMaks}</strong>
                </div>
                <div class="arc-stat">
                  <span>{t('arcade.bonus_shift')}</span>
                  <strong>+{hasil.bonus}</strong>
                </div>
                {/* Sisa waktu ditampilkan karena NILAI bergantung padanya: pemain
                    yang 100% benar tapi lambat mendapat B, dan tanpa angka ini
                    nilai itu terbaca seperti kesalahan. */}
                <div class="arc-stat">
                  <span>{t('arcade.sisa_waktu')}</span>
                  <strong>{Math.round(hasil.sisaRata)}%</strong>
                </div>
              </div>
              {!hasil.drill && (
                <p class="mt-2 text-[11px]">
                  <span class="arc-stars">
                    {'★'.repeat(hasil.bintang)}
                    {'☆'.repeat(3 - hasil.bintang)}
                  </span>
                  {hasil.bintangNaik && <span class="ml-1.5 font-bold text-[#4ade80]">{t('arcade.rekor_baru')}</span>}
                </p>
              )}
              <p class="arc-result-sub">
                {hasil.rekorBaru
                  ? `🏆 ${t('arcade.rekor')} ¥ ${skor}`
                  : `${t('arcade.rekor')} ¥ ${bacaRekorTingkat(hasil.tingkat)}`}
                {hasil.deltaRekor > 0 && !hasil.rekorBaru ? ` · +${hasil.deltaRekor}` : ''}
              </p>
              <div class="arc-actions">
                <button type="button" onClick={() => mulai('shift')} class="arc-btn arc-btn--primary">
                  ▶️ {t('arcade.cobagi')}
                </button>
                <button
                  type="button"
                  onClick={() => mulai('drill')}
                  disabled={jumlahDrill === 0}
                  class="arc-btn arc-btn--ghost disabled:opacity-40"
                >
                  🎯 {t('arcade.latih_salah')}
                </button>
              </div>
            </div>
          ) : fase === 'main' ? (
            <>
              {/* ── HUD ─────────────────────────────────────────────────── */}
              <div class="arc-hud">
                <div class="arc-hud-row">
                  <div class="min-w-0">
                    <span class="arc-kicker">
                      {mode === 'drill' ? t('arcade.latih_salah') : t('arcade.pendapatan')}
                    </span>
                    <span class="arc-skor-baris">
                      <span class="arc-skor" data-testid="arcade-skor">
                        ¥ {skor}
                      </span>
                      {poinTerbang && (
                        <span key={poinTerbang.id} class="arc-poin">
                          +{poinTerbang.nilai}
                        </span>
                      )}
                    </span>
                  </div>
                  <div class="shrink-0 text-right">
                    <p class="arc-order-count">
                      {t('arcade.pesanan')} <b>{pesananSelesai}/{target}</b>
                    </p>
                    {/* Nyawa dirender sebagai ⛑️ SATU PER SATU, bukan satu string
                        berulang: `e2e/arcade.test.tsx` menghitung kemunculan
                        ⛑️ di textContent untuk membuktikan satu kesalahan hanya
                        memakan SATU nyawa. Slot yang sudah hilang memakai ✕,
                        jadi jumlahnya tetap terbaca sebagai "3 slot". */}
                    <p role="img" aria-label={`${t('arcade.nyawa')}: ${Math.max(0, nyawa)}`} class="arc-lives mt-1">
                      {Array.from({ length: Math.max(0, nyawa) }, (_, i) => (
                        <span key={i} class="arc-life">
                          ⛑️
                        </span>
                      ))}
                      {Array.from({ length: Math.max(0, nyawaMaks - nyawa) }, (_, i) => (
                        <span key={`h${i}`} class="arc-life arc-life--hilang">
                          ✕
                        </span>
                      ))}
                    </p>
                  </div>
                </div>
                {komboGenba >= 2 && (
                  <p class="mt-1">
                    <span class={`arc-combo ${komboGenba >= 5 ? 'arc-combo--hot' : ''}`}>
                      🔥 {komboGenba}
                      {komboGenba >= 10 ? ' MAX' : ''}
                    </span>
                  </p>
                )}
                <div class="arc-meter">
                  <div class="arc-meter-fill" style={`transform:scaleX(${progresShift / 100})`} />
                </div>
              </div>

              {/* ── Perintah ────────────────────────────────────────────── */}
              <div
                key={`o${pesananSelesai}-${salahGenba}`}
                class={`arc-order ${animasi === 'benar' ? 'arc-order--hit' : ''}`}
              >
                <div class="arc-order-head">
                  <span class="arc-kicker min-w-0">
                    {t('arcade.perintah_senpai')} · #{pesananSelesai + salahGenba + 1}
                    <span class="arc-order-badge">
                      {t('arcade.gelombang')} {gelombang}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => perintah && ucap(perintah.jp, 0.9 + 0.06 * (gelombang - 1))}
                    class="arc-btn arc-btn--small arc-btn--ghost"
                  >
                    🔊 {t('arcade.ulangi')}
                  </button>
                </div>
                {/* `overflow-wrap:anywhere`: perintah bisa panjang (`しろい はこ を
                    ひだり の はこ に おいてください`) dan pada layar 320 px teks ini
                    pernah melebar keluar kartu, bukan membungkus. */}
                <p class="arc-order-jp" data-testid="arcade-perintah">
                  {perintah ? (choukai ? '🔊 ？？？' : perintah.jp) : t('arcade.mulai_hint')}
                </p>
                {perintah && !choukai && <p class="arc-order-romaji">{perintah.romaji}</p>}
                {pesan && (
                  <p role="status" class="arc-msg">
                    {pesan}
                  </p>
                )}
                {animasi === 'benar' && (
                  <span class="arc-burst" aria-hidden="true">
                    {PARTIKEL.map((p, i) => (
                      <span key={i} class="arc-partikel" style={`--dx:${p[0]}px;--dy:${p[1]}px;--c:${p[2]}`} />
                    ))}
                  </span>
                )}
                <div
                  class="arc-meter"
                  role="progressbar"
                  aria-valuenow={Math.round(sisa)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    class={`arc-meter-fill ${sisa <= 25 ? 'arc-meter-fill--hot' : ''}`}
                    style={`transform:scaleX(${sisa / 100})`}
                  />
                </div>
              </div>

              <p class="arc-hint">
                {dipilih ? t('arcade.ketuk_rak') : t('arcade.pilih_barang')}
              </p>

              {/* ── Meja kerja ──────────────────────────────────────────── */}
              <div class="arc-section">
                <p class="arc-kicker">{t('arcade.meja')}</p>
                <div class="arc-tray">
                  {pilihan.map((p) => {
                    const peti = WARNA_PETI[p.warna.id] ?? { bg: '#334155', fg: '#f2f6fb' };
                    return (
                      <button
                        key={p.kunci}
                        type="button"
                        onClick={() => {
                          setDipilih(p.kunci);
                          ucap(`${p.warna.jp} ${p.barang.jp}`, 1);
                        }}
                        aria-pressed={dipilih === p.kunci}
                        /* Latar peti = warna barangnya, dari hex tetap. Versi
                           sebelumnya memakai `warna.kelas` (kelas Tailwind) dan
                           shim tema terang memetakan `bg-slate-900` menjadi
                           putih — peti くろい berubah putih di tema terang. */
                        class={`arc-crate ${dipilih === p.kunci ? 'arc-crate--picked' : ''}`}
                        style={`background:${peti.bg};color:${peti.fg}`}
                      >
                        <ArcadeIkon jenis="barang" nama={p.barang.id} ukuran={26} kelas="arc-ikon" />
                        <span class="arc-crate-jp">
                          {p.warna.jp}
                          {p.barang.jp}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ── Rak ─────────────────────────────────────────────────── */}
              <div class="arc-section">
                <p class="arc-kicker">
                  {t('arcade.rak')} · {zona.length}
                </p>
                <div
                  class={`arc-shelves mt-1.5 ${
                    kolomZona === 4 ? 'arc-shelves--4' : kolomZona === 3 ? 'arc-shelves--3' : 'arc-shelves--2'
                  }`}
                >
                  {/* Satu array, bukan dua yang dipasangkan lewat INDEKS.
                      Versi sebelumnya memetakan `['ue','shita','hidari','migi']` lalu
                      mengambil label dari array terpisah dengan `[i]` — mengurutkan
                      ulang salah satunya membuat tombol "Rak Atas" menaruh barang ke
                      みぎ tanpa satu pun error. Ditemukan saat review UI 2026-11-04. */}
                  {zona.map((z) => {
                    const kunci = perintah ? perintah.zona.id === z.id : false;
                    const sorotSalah = rakSalah === z.id;
                    return (
                      <button
                        key={z.id}
                        type="button"
                        data-zona={z.id}
                        /* Penanda tujuan yang benar. Atribut ini yang dibaca
                           `e2e/arcade.test.tsx`; sebelumnya tes itu membaca nama
                           kelas `border-accent-emerald`, yang mengikat perilaku
                           ke satu rona palet — rona yang memang sedang diganti. */
                        data-target={kunci && menunggu ? 'true' : undefined}
                        onClick={() => taruh(z.id)}
                        class={`arc-shelf ${rapatZona ? 'arc-shelf--rapat' : ''} ${
                          kunci && menunggu ? 'arc-shelf--target' : sorotSalah ? 'arc-shelf--wrong' : ''
                        }`}
                      >
                        {/* Ikon arah/lokasi menggantikan emoji: bentuknya sama di
                            semua perangkat dan warnanya ikut teks. */}
                        <ArcadeIkon jenis="zona" nama={z.id} ukuran={rapatZona ? 18 : 22} kelas="arc-ikon" />
                        <span class="min-w-0">
                          {/* Pada 4 kolom, label Jepang disembunyikan: 85 px tidak
                              cukup untuk dua baris teks, dan perintahnya sendiri
                              sudah Jepang — yang diuji di sini adalah memilih rak,
                              bukan membaca ulang namanya. */}
                          {!rapatZona && <span class="arc-shelf-jp">{z.jp}</span>}
                          <span class="arc-shelf-id">{z.id_}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <>
              {/* ── Idle: CTA ───────────────────────────────────────────── */}
              <p class="arc-hint mt-2">
                {t('arcade.mulai_hint')}
              </p>
              <button type="button" onClick={() => mulai('shift')} class="arc-btn arc-btn--primary mt-2">
                ▶️ {t('arcade.mulai')} · {aturan.pesanan} {t('arcade.pesanan')}
              </button>
              {jumlahDrill > 0 && (
                <button type="button" onClick={() => mulai('drill')} class="arc-btn arc-btn--ghost mt-1.5">
                  🎯 {t('arcade.latih_salah')} ({jumlahDrill})
                </button>
              )}
            </>
          )}
        </section>
      ) : (
        <section aria-label={t('arcade.tab_combo')}>
          {/* PENTING: Jangan menaruh string berpola `x<angka>` sebelum `🔥 x{kombo}`
              karena `e2e/arcade.test.tsx` membaca kombo dari kecocokan pertama `/x(\d+)/`. */}
          <div class="mb-2 flex flex-wrap items-center justify-between gap-1.5 text-[12px]">
            <span
              class={`rounded-control border px-2 py-1 font-bold ${
                kombo >= 5 ? 'border-accent-amber bg-accent-amber/15 text-accent-amber' : 'border-line bg-surface-raised text-fg-muted'
              }`}
            >
              🔥 x{kombo}
              {kombo >= KOMBO_MAKS ? ' · MAX' : kombo >= 5 ? ` · ${t('arcade.fever')}` : ''}
            </span>
            <span class="rounded-control border border-line bg-surface-sunken px-2 py-1 text-fg-muted">{soal.bab}</span>
            <button
              type="button"
              onClick={() => setLevel((l) => (l === 'normal' ? 'sulit' : l === 'sulit' ? 'hell' : 'normal'))}
              aria-pressed={level !== 'normal'}
              class={`min-h-9 rounded-control border px-2 py-1 font-bold ${
                level !== 'normal' ? 'border-accent-red bg-accent-red/10 text-accent-red' : 'border-line bg-surface-raised text-fg-muted'
              }`}
            >
              {level === 'hell' ? t('arcade.level_hell') : level === 'sulit' ? t('arcade.level_sulit') : t('arcade.level_normal')}
            </button>
            <span class="font-bold text-fg">¥ {skorCombo}</span>
          </div>

          <div class="mb-2 rounded-card border border-line bg-surface-sunken p-3 text-center">
            <div class="mb-1 flex items-center justify-between text-[11px] text-fg-muted">
              <span class="font-bold">{t('arcade.susun')}</span>
              <span>
                {t('arcade.langkah')} {langkah}/{soal.urutan.length}
                {kalimatSelesai > 0 ? ` · ✓ ${kalimatSelesai}` : ''}
                {kalimatGagal > 0 ? ` · ✗ ${kalimatGagal}` : ''}
              </span>
            </div>
            <p class="text-sm font-bold text-fg" data-testid="arcade-target">
              “{soal.indo}”
            </p>
            {balas && <p class="mt-1 text-[11px] font-bold text-accent-amber">{balas}</p>}
            {bonusTerakhir !== null && (
              <p class="animasi-pop mt-1 text-[11px] font-black text-accent-emerald">
                +{bonusTerakhir} {t('arcade.bonus_kalimat')}
              </p>
            )}
            {kalimatAktif && (
              <div
                class="mt-2 h-1.5 w-full overflow-hidden rounded-pill bg-surface-raised"
                role="progressbar"
                aria-valuenow={Math.round(sisaKalimat)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  class={`h-full ${sisaKalimat > 50 ? 'bg-emerald-400' : sisaKalimat > 25 ? 'bg-amber-400' : 'bg-rose-500'}`}
                  style={`transform:scaleX(${sisaKalimat / 100});transform-origin:left`}
                />
              </div>
            )}
          </div>

          <div class="mb-2 flex min-h-16 flex-wrap items-center justify-center gap-1.5 rounded-card border-2 border-dashed border-line p-2">
            {tray.length === 0 ? (
              <span class="text-[11px] text-fg-muted">{t('arcade.ketuk_berurutan')}</span>
            ) : (
              tray.map((w, i) => (
                <span key={i} class="rounded-control border border-line bg-surface-raised px-2 py-1 text-sm font-bold text-fg">
                  {w}
                </span>
              ))
            )}
          </div>

          {/* Kontrol bantu Combo: Batal 1 kartu & Soal Lain */}
          <div class="mb-2 flex items-center justify-between gap-2 text-[11px]">
            <button
              type="button"
              onClick={batalSatu}
              disabled={langkah <= 0 || langkah >= soal.urutan.length}
              class="min-h-9 flex-1 rounded-control border border-line bg-surface-raised px-2 py-1 font-bold text-fg-muted disabled:opacity-40"
            >
              ↩️ {t('arcade.batal_satu')}
            </button>
            {rekorCombo > 0 && (
              <span class="shrink-0 text-fg-muted">
                🏆 <b class="text-fg">¥ {rekorCombo}</b>
              </span>
            )}
            <button
              type="button"
              onClick={berikutCombo}
              class="min-h-9 flex-1 rounded-control border border-line bg-surface-raised px-2 py-1 font-bold text-fg-muted"
            >
              🔀 {t('arcade.soal_lain')}
            </button>
          </div>

          <div class="grid grid-cols-3 gap-2 rounded-card border border-line bg-surface-sunken p-2">
            {kartu.map((k, i) => (
              <button
                key={`${k.jp}-${i}`}
                type="button"
                onClick={() => ketuk(k, i)}
                class={`min-h-12 rounded-control border-2 px-1 text-sm font-bold break-words ${
                  level !== 'normal'
                    ? 'border-line bg-surface-raised text-fg'
                    : k.jenis === 'particle'
                      ? 'border-amber-300 bg-amber-400 text-slate-900'
                      : k.jenis === 'verb'
                        ? 'border-rose-400 bg-rose-600 text-white'
                        : 'border-blue-400 bg-blue-600 text-white'
                }`}
              >
                {k.jp}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Papan Skor In-Game */}
      <div class="mt-3 rounded-card border border-line bg-surface-raised p-3 text-[11px]">
        <div class="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setPapanBuka((b) => !b)}
            aria-expanded={papanBuka}
            class="font-bold text-fg flex items-center gap-1.5"
          >
            <span>
              🏆 {t('arcade.papan_skor')} ({tab === 'genba' ? t('arcade.tab_genba') : t('arcade.tab_combo')})
            </span>
            <span class="text-fg-muted">{papanBuka ? '▲' : '▼'}</span>
          </button>
          {papanBuka && (
            <button
              type="button"
              onClick={() => muatPapan(tab)}
              class="rounded-control border border-line bg-surface-sunken px-2 py-0.5 font-bold text-fg-muted"
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
                  const milikSendiri = Boolean(waSendiri && r.no_wa === waSendiri);
                  const medali = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
                  const tk = typeof r.detail?.tingkat === 'string' ? r.detail.tingkat : '';
                  return (
                    <li
                      key={`${r.nama}-${r.skor}-${i}`}
                      class={`flex items-center justify-between rounded-control border px-2 py-1 ${
                        milikSendiri ? 'border-accent-violet bg-accent-violet/10' : 'border-line bg-surface-sunken'
                      }`}
                    >
                      <span class="min-w-0 truncate">
                        <strong class="mr-1.5">{medali}</strong>
                        <span class="font-bold text-fg">{r.nama}</span>
                        {r.kelas && <span class="ml-1 text-fg-muted">({r.kelas})</span>}
                        {tk && <span class="ml-1 text-[9px] uppercase text-fg-muted">· {tk}</span>}
                        {milikSendiri && (
                          <span class="ml-1.5 rounded-pill bg-accent-violet/15 px-1.5 py-0.5 text-[9px] font-bold text-accent-violet">
                            ⭐ {t('arcade.anda')}
                          </span>
                        )}
                      </span>
                      <strong class="shrink-0 font-mono text-fg">¥ {r.skor.toLocaleString('id-ID')}</strong>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        )}
      </div>

      {/* Evaluasi */}
      <div class="mt-3 rounded-card border border-line bg-surface-raised px-3 py-2 text-[11px]">
        <div class="flex items-center justify-between gap-2">
          <span class="text-fg-muted">
            {t('arcade.evaluasi')}: <b class="text-fg">{lemah.length}</b>
          </span>
          {lemah.length > 0 && (
            <button type="button" onClick={hapusLemah} class="rounded-control border border-line px-2 py-1 font-bold text-fg-muted">
              {t('arcade.bersihkan')}
            </button>
          )}
        </div>
        {lemah.length > 0 && (
          <ul class="mt-1.5 space-y-1">
            {lemah.slice(0, 5).map((n, i) => (
              <li key={i} class="rounded-control border border-line bg-surface-sunken px-2 py-1 text-[11px]">
                <b class="text-fg">{n.judul}</b>
                <span class="block text-fg-muted">{n.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
