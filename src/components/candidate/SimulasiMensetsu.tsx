/**
 * SimulasiMensetsu.tsx — Mode Simulasi wawancara (`/wawancara` → tab "Simulasi").
 *
 * BEDA DENGAN TAB BANK SOAL
 * -------------------------
 * Bank soal = menulis dan menyiapkan naskah. Mode ini = latihan mental:
 * soal diacak, ada batas waktu per jawaban, dan siswa MENJAWAB DENGAN SUARA
 * (kalau perambannya mendukung), lalu dinilai.
 *
 * KENAPA KOMPONEN TERPISAH, TAPI BUKAN HALAMAN TERPISAH
 * -----------------------------------------------------
 * Gerbang "khusus siswa ASJ" ada di `MensetsuForm` dan di server
 * (`tolakKecualiSiswa`). Halaman baru berarti gerbang ketiga yang bisa berbeda
 * diam-diam — persis yang diperingatkan di kepala `wawancara.astro`. Jadi mode
 * ini hidup DI DALAM halaman yang sudah bergerbang, memakai bank yang sudah
 * diambil, dan menerima `draft` dari induknya.
 *
 * KENAPA PENILAIANNYA DETERMINISTIK (lihat `lib/simulasiMensetsu.ts`)
 * --------------------------------------------------------------------
 * Jawaban mensetsu itu pribadi; tidak ada kunci jawaban. Yang diukur: seberapa
 * banyak kalimat yang SUDAH DISIAPKAN siswa benar-benar terucap, pengisi suara
 * (えーと/あのー), ketepatan waktu, dan bentuk sopan. Semuanya bisa dihitung di
 * perangkat tanpa biaya dan tanpa mengirim suara siapa pun ke server.
 *
 * BATASAN PERAMBAN YANG DITERIMA
 * ------------------------------
 * `SpeechRecognition` hanya ada di Chrome/Edge. Di Safari iOS dan Firefox
 * mikrofon tidak muncul dan siswa mengetik — jalur ketik SELALU tersedia, jadi
 * mode ini tidak pernah mati total karena peramban.
 */
import { useState, useEffect, useRef } from 'preact/hooks';
import { t } from '../../store/i18n';
import { showToast } from '../Toast';
import { apiClient, type ApiError } from '../../lib/apiClient';
import {
  ucapkanJepang,
  hentikanSuara,
  dukunganDengar,
  buatPendengar,
  dukunganRekam,
  buatPerekamAudio,
  type Pendengar,
  type Perekam,
} from '../../lib/ttsJepang';
import {
  AMBANG_GRADE,
  nilaiJawaban,
  nilaiSusulan,
  pilihSoalAcak,
  ringkasTahap,
  susunRonde,
  RITUAL_MASUK,
  RITUAL_KELUAR,
  type HasilNilai,
  type ItemRonde,
  type ModeLatihan,
  type PertanyaanSusulan,
  type SoalSimulasi,
} from '../../lib/simulasiMensetsu';

type Layar = 'atur' | 'ritual' | 'main' | 'hasil';

/** Fase ritual: masuk ruangan sebelum soal pertama, keluar sesudah soal terakhir. */
type FaseRitual = 'masuk' | 'keluar';

interface DraftMap {
  [kode: string]: { jp: string; romaji: string; arti: string };
}

interface Props {
  soal: SoalSimulasi[];
  /** Draft jawaban siswa dari tab Bank Soal — dipakai sebagai acuan penilaian. */
  draft: DraftMap;
  /** Kembali ke tab Bank Soal (dipakai saat belum ada jawaban yang disiapkan). */
  onKeBank: () => void;
}

interface BarisHasil {
  soal: SoalSimulasi;
  /** `null` = pertanyaan utama; terisi = susulan (深掘り) atas soal itu. */
  susulan: PertanyaanSusulan | null;
  transkrip: string;
  nilai: HasilNilai;
  detik: number;
}

const PILIHAN_JUMLAH = [5, 10, 15];
const PILIHAN_WAKTU = [30, 60, 90];

/**
 * Tiga cara latihan. Urutannya dari paling mudah ke paling mirip wawancara.
 *
 * KENAPA LABELNYA DIPISAH DARI `t(...)` DI JSX
 * -------------------------------------------
 * Kunci i18n yang ditulis sebagai literal di dalam cabang `?:` tidak bisa
 * diverifikasi oleh tes kunci — ia hanya salah ketik yang muncul sebagai teks
 * mentah di layar. Tabel ini membuat daftar kuncinya terbaca di satu tempat.
 */
const MODE_URUT: readonly ModeLatihan[] = ['latihan', 'mensetsu', 'penuh'];
const LABEL_MODE: Record<ModeLatihan, string> = {
  latihan: 'simulasi.mode_latihan',
  mensetsu: 'simulasi.mode_mensetsu',
  penuh: 'simulasi.mode_penuh',
};
const KET_MODE: Record<ModeLatihan, string> = {
  latihan: 'simulasi.mode_latihan_ket',
  mensetsu: 'simulasi.mode_mensetsu_ket',
  penuh: 'simulasi.mode_penuh_ket',
};

/** Blob rekaman → base64 tanpa prefiks data-URL (yang dikirim ke server). */
function blobKeBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const s = String(fr.result || '');
      resolve(s.slice(s.indexOf(',') + 1));
    };
    fr.onerror = () => reject(new Error('rekaman tidak bisa dibaca'));
    fr.readAsDataURL(blob);
  });
}

export default function SimulasiMensetsu({ soal, draft, onKeBank }: Props) {
  const [layar, setLayar] = useState<Layar>('atur');

  /* ── pengaturan ───────────────────────────────────────────────────────── */
  const [jumlah, setJumlah] = useState(5);
  /** Mode 'semua soal': seluruh isi cakupan, bukan potongan 5/10/15. */
  const [semua, setSemua] = useState(false);
  const [cakupan, setCakupan] = useState('semua');
  const [batasDetik, setBatasDetik] = useState(60);
  const [suaraOtomatis, setSuaraOtomatis] = useState(true);
  /**
   * 'latihan' = soal terlihat (perilaku lama). 'mensetsu' = soal HANYA diucapkan.
   *
   * KENAPA INI YANG MENAIKKAN KESULITAN, BUKAN SOAL YANG LEBIH SULIT
   * ---------------------------------------------------------------
   * Ambang bahasa untuk 特定技能1号 adalah A2 (JFT-Basic), dan JFT-Basic TIDAK
   * punya bagian berbicara — empat seksinya semua pilihan ganda. Jadi siswa
   * bisa lulus tes resminya tanpa pernah mengucapkan satu kalimat Jepang.
   * Yang tidak diuji di tes itulah yang diuji di mensetsu: mendengar pertanyaan
   * yang tidak bisa dibaca ulang, lalu menjawab dengan suara.
   *
   * Selama teks soal selalu terlihat, mode ini mengukur MEMBACA, bukan
   * mendengar — dan siswa bisa menjawab dengan mata tanpa telinga. Karena itu
   * teksnya disembunyikan, bukan soalnya dibuat lebih susah: menaikkan level
   * bahasa di atas A2 akan melatih hal yang tidak diminta, lalu membuat siswa
   * gagal pada ukuran yang bukan ukuran wawancara.
   */
  const [mode, setMode] = useState<ModeLatihan>('latihan');
  /** Berapa kali teks soal dibuka di mode mensetsu/penuh. Dihitung, bukan disembunyikan. */
  const [terbuka, setTerbuka] = useState(0);
  const [teksTampil, setTeksTampil] = useState(true);

  /* ── ritual (hanya mode penuh) ─────────────────────────────────────────── */
  const [ritualFase, setRitualFase] = useState<FaseRitual>('masuk');
  /** Indeks kalimat yang sudah dicentang. Penilaian DIRI — tidak masuk nilai. */
  const [centangMasuk, setCentangMasuk] = useState<number[]>([]);
  const [centangKeluar, setCentangKeluar] = useState<number[]>([]);

  /* ── ronde ────────────────────────────────────────────────────────────── */
  const [ronde, setRonde] = useState<ItemRonde[]>([]);
  const [idx, setIdx] = useState(0);
  const [transkrip, setTranskrip] = useState('');
  const [mendengar, setMendengar] = useState(false);
  /** Sedang merekam lewat MediaRecorder (jalur tanpa SpeechRecognition). */
  const [merekam, setMerekam] = useState(false);
  /** Rekaman sedang diubah menjadi teks di server. */
  const [memproses, setMemproses] = useState(false);
  const [sisaWaktu, setSisaWaktu] = useState(60);
  const [hasil, setHasil] = useState<BarisHasil[]>([]);
  /**
   * Berapa soal yang DILEWATI (tombol "Lewati"), bukan dijawab kosong.
   *
   * KENAPA DIPISAH DARI `hasil`: melewati berarti tidak ada jawaban yang bisa
   * dinilai, jadi tidak ada baris nilai — kalau dipaksa jadi nilai 0, rata-rata
   * siswa tercampur dengan angka yang bukan hasil ucapannya. Tetapi
   * menghilangkannya dari layar hasil membuat "2 soal" untuk ronde yang
   * dilewati semua terbaca seperti data yang hilang, jadi jumlahnya dilaporkan
   * sendiri.
   */
  const [dilewati, setDilewati] = useState(0);

  const mulaiRef = useRef(0);
  const dasarRef = useRef('');
  const pendengarRef = useRef<Pendengar | null>(null);
  const perekamRef = useRef<Perekam | null>(null);
  /** Sedang mengunggah rekaman? Ref, bukan state: dipakai di dalam callback
   *  timer yang closure-nya bisa basi. */
  const memprosesRef = useRef(false);
  const kirimRef = useRef<(teks?: string) => void>(() => {});
  /** Sama alasannya dengan `kirimRef`: efek "waktu habis" tidak boleh
   *  bergantung pada identitas fungsi yang dibuat ulang tiap render. */
  const selesaikanRef = useRef<() => Promise<string>>(async () => '');

  const daftarTahap = ringkasTahap(soal);
  const bisaDengar = dukunganDengar();
  const bisaRekam = dukunganRekam();

  /* Satu langkah ronde bisa berupa pertanyaan utama ATAU susulan atasnya.
     `itemAktif` adalah sumbernya; `soalAktif` tetap dipakai untuk acuan dan
     tahap, karena susulan menempel pada soal yang sama. */
  const itemAktif = ronde[idx];
  const soalAktif = itemAktif?.soal;
  const susulanAktif = itemAktif?.susulan ?? null;
  /** Yang diucapkan pewawancara pada langkah ini — pertanyaan atau susulan. */
  const teksTanya = susulanAktif ? susulanAktif.jp : (soalAktif?.jp ?? '');
  /** Mode penuh = dua langkah per soal (tanya + susulan). */
  const faktorRonde = mode === 'penuh' ? 2 : 1;

  /* Acuan penilaian: jawaban Jepang milik siswa lebih dulu, contoh bank kalau
     belum ada. `bank` sengaja ditandai di layar hasil — menilai siswa terhadap
     kalimat yang tidak pernah ia tulis harus terlihat, bukan disembunyikan. */
  const acuanUntuk = (s: SoalSimulasi) => ({
    teks: String(draft[s.kode]?.jp || s.jawaban_jp || '').trim(),
    dari: draft[s.kode]?.jp?.trim() ? ('siswa' as const) : s.jawaban_jp ? ('bank' as const) : ('tidak-ada' as const),
  });

  const adaJawabanSiap = soal.some((s) => !!draft[s.kode]?.jp?.trim());

  /** Kumpulan soal untuk cakupan yang sedang dipilih. */
  const pool = cakupan === 'semua' ? soal : soal.filter((s) => s.tahap === cakupan);

  /* ── ronde ────────────────────────────────────────────────────────────── */
  /**
   * Mulai satu langkah ronde: layar main, timer, dan soal diucapkan.
   *
   * Dipisah dari `mulai()` karena mode penuh menyisipkan layar ritual di antara
   * "pengaturan" dan "soal pertama" — dan ritual itu tidak boleh menghabiskan
   * jatah waktu soal pertama.
   */
  const masukSoal = (daftar: ItemRonde[], i: number) => {
    setLayar('main');
    setIdx(i);
    setTranskrip('');
    setSisaWaktu(batasDetik);
    mulaiRef.current = Date.now();
    const item = daftar[i];
    const teks = item?.susulan ? item.susulan.jp : (item?.soal.jp ?? '');
    /* Di mode mensetsu DAN penuh suara WAJIB, bukan opsional: tanpa suara tidak
       ada pertanyaan sama sekali. Kalau perangkat tidak punya suara Jepang,
       menampilkan teks adalah satu-satunya cara mode ini tetap terpakai — jadi
       teksnya dibuka, bukan dibiarkan kosong dan membuat siswa menebak. */
    const perluSuara = mode !== 'latihan' || suaraOtomatis;
    const bersuara = perluSuara ? ucapkanJepang(teks) : false;
    setTeksTampil(mode === 'latihan' ? true : !bersuara);
  };

  const mulai = () => {
    /* "Semua" mengambil SELURUH pool, bukan angka 999: `pilihSoalAcak` sudah
       memotong ke panjang pool, dan menulis 999 di sini akan membuat layar
       pengaturan berbohong kalau nanti banknya bertambah. */
    const dipilih = pilihSoalAcak(pool, semua ? pool.length : jumlah);
    if (!dipilih.length) {
      showToast(t('simulasi.tidak_ada_soal'), 'error');
      return;
    }
    const urutan = susunRonde(dipilih, mode);
    setRonde(urutan);
    setHasil([]);
    setDilewati(0);
    setTerbuka(0);
    setCentangMasuk([]);
    setCentangKeluar([]);
    if (mode === 'penuh') {
      /* Ritual masuk DULU. Wawancara tidak dimulai saat pertanyaan pertama
         dibaca — ia dimulai saat pintu dibuka. */
      setRitualFase('masuk');
      setLayar('ritual');
      return;
    }
    masukSoal(urutan, 0);
  };

  const selesai = () => {
    hentikanMikrofon();
    setLayar('hasil');
  };

  /**
   * Tutup ronde. Di mode penuh wawancara belum selesai sampai siswa keluar
   * ruangan, jadi ritual keluar dulu — baru layar hasil.
   */
  const tutupRonde = () => {
    hentikanMikrofon();
    if (mode === 'penuh') {
      setRitualFase('keluar');
      setLayar('ritual');
      return;
    }
    setLayar('hasil');
  };

  /**
   * Pindah ke langkah berikutnya, atau tutup ronde.
   *
   * Sengaja TIDAK memakai updater `setIdx((i) => …)`: efek samping di dalam
   * updater (memulai timer, memutar suara) dijalankan dua kali oleh React di
   * StrictMode, dan suara pertanyaan akan terdengar dua kali bertumpuk.
   */
  const lanjut = () => {
    const next = idx + 1;
    if (next >= ronde.length) {
      tutupRonde();
      return;
    }
    masukSoal(ronde, next);
  };

  /**
   * Kirim jawaban soal aktif.
   *
   * `teksKirim` dipakai saat transkrip belum sempat masuk state: waktu habis
   * ketika rekaman masih diproses. Tanpa parameter ini, jalur "waktu habis"
   * mengirim string kosong dan jawaban yang baru saja diucapkan hilang.
   */
  const kirim = (teksKirim?: string) => {
    if (layar !== 'main' || !soalAktif) return;
    hentikanMikrofon();
    const teks = String(teksKirim ?? transkrip);
    const detik = Math.max(1, Math.round((Date.now() - mulaiRef.current) / 1000));

    /* Susulan tidak punya naskah: tidak ada kalimat yang bisa dibandingkan,
       jadi isi dilewati dan hanya tiga aspek lain yang dinilai. `nilaiSusulan`
       mengembalikan skor 0–100 yang TIDAK dipotong di 70 — angka itu bukan
       nilai akhir, ia hanya muncul di bagian susulan layar hasil. */
    if (susulanAktif) {
      const s = nilaiSusulan({ transkrip: teks, detikTerpakai: detik, batasDetik });
      const nilai: HasilNilai = {
        total: s.skor,
        grade: s.skor >= AMBANG_GRADE.A ? 'A' : s.skor >= AMBANG_GRADE.B ? 'B' : s.skor >= AMBANG_GRADE.C ? 'C' : 'D',
        aspek: s.aspek,
        catatan: s.catatan,
        acuan: 'tidak-ada',
      };
      setHasil((h) => [...h, { soal: soalAktif, susulan: susulanAktif, transkrip: teks, nilai, detik }]);
      lanjut();
      return;
    }

    const acuan = acuanUntuk(soalAktif);
    const nilai = nilaiJawaban({
      transkrip: teks,
      acuan: acuan.teks,
      acuanDari: acuan.dari === 'bank' ? 'bank' : 'siswa',
      detikTerpakai: detik,
      batasDetik,
    });
    setHasil((h) => [...h, { soal: soalAktif, susulan: null, transkrip: teks, nilai, detik }]);
    lanjut();
  };
  kirimRef.current = kirim;

  /**
   * Lewati soal ini tanpa menilai.
   *
   * KENAPA BUKAN `kirim()` KOSONG — itu yang dipakai sampai 2026-11-01, dan
   * akibatnya dua tombol di layar berperilaku persis sama: "Lewati" mengirim
   * jawaban yang sedang diketik, dan "Kirim" pada kotak kosong sama dengan
   * melewati. Dua label berbeda untuk satu perilaku berarti siswa tidak bisa
   * memilih mana pun dengan sadar.
   *
   * Yang TIDAK dilakukan: mencatat nilai 0. Melewati bukan menjawab salah, dan
   * rata-rata yang mencampur keduanya membuat angka di layar hasil bukan lagi
   * gambaran ucapannya. Jumlah soal yang dilewati dilaporkan terpisah.
   */
  const lewati = () => {
    if (layar !== 'main' || !soalAktif) return;
    hentikanMikrofon();
    setTranskrip('');
    setDilewati((n) => n + 1);
    lanjut();
  };

  /* Timer. Efek "waktu habis" dipisah supaya tidak ada efek samping di dalam
     updater setState (React memanggilnya dua kali di StrictMode). */
  useEffect(() => {
    if (layar !== 'main') return;
    const id = window.setInterval(() => setSisaWaktu((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => window.clearInterval(id);
  }, [layar]);

  useEffect(() => {
    if (layar !== 'main' || sisaWaktu > 0) return;
    /* Waktu habis = kirim apa adanya. Jawaban kosong tetap dinilai nol dan
       dicatat "lewat waktu" — itu informasi yang berguna, bukan kegagalan UI.

       TAPI kalau mikrofon masih merekam, transkripnya belum ada sama sekali:
       transkripsi baru terjadi setelah rekaman berhenti. Menutup soal di sini
       membuang seluruh jawaban, jadi rekaman diselesaikan dulu. */
    if (!perekamRef.current?.aktif()) {
      kirimRef.current();
      return;
    }
    void (async () => {
      const teks = await selesaikanRef.current();
      kirimRef.current(teks);
    })();
  }, [sisaWaktu, layar]);

  /* ── mikrofon ─────────────────────────────────────────────────────────── */
  const hentikanMikrofon = () => {
    pendengarRef.current?.hentikan();
    pendengarRef.current = null;
    setMendengar(false);
    perekamRef.current?.buang();
    setMerekam(false);
  };

  /** Pesan untuk tiap alasan mikrofon gagal — jangan satukan, penyebabnya beda. */
  const pesanGalatRekam = (kode: string): string => {
    switch (kode) {
      case 'tidak-aman': return t('simulasi.mikrofon_tidak_aman');
      case 'tidak-didukung': return t('simulasi.mikrofon_tidak_ada');
      case 'ditolak': return t('simulasi.mikrofon_ditolak');
      case 'tidak-ada': return t('simulasi.mikrofon_tidak_ada_perangkat');
      case 'dipakai': return t('simulasi.mikrofon_dipakai');
      default: return t('simulasi.mikrofon_galat');
    }
  };

  /** Jalur rekam: MediaRecorder → server men-transkripsi. */
  const mulaiRekam = async () => {
    // Batas rekaman mengikuti SISA WAKTU soal, bukan angka tetap: dengan batas
    // 45 dtk sementara soal hanya 30 dtk, recorder memotong jawaban di tengah
    // kalimat — dan dulu hasilnya dibuang oleh timer soal. `+5` hanya jaring
    // pengaman supaya recorder tidak pernah berhenti LEBIH DULU daripada
    // timer soal (dua jalur berhenti bersamaan = balapan yang tidak perlu).
    perekamRef.current = buatPerekamAudio({
      maksDetik: Math.max(5, Math.min(90, sisaWaktu + 5)),
      onBatasWaktu: () => {
        showToast(t('simulasi.rekam_batas'), 'info');
        void selesaikanRekaman();
      },
    });
    const p = perekamRef.current;
    if (!p) {
      showToast(t('simulasi.mikrofon_tidak_ada'), 'info');
      return;
    }
    try {
      const kode = await p.mulai();
      if (kode) {
        showToast(pesanGalatRekam(kode), 'error');
        return;
      }
      setMerekam(true);
    } catch {
      showToast(t('simulasi.mikrofon_galat'), 'error');
    }
  };

  /**
   * Hentikan rekaman dan ubah menjadi teks.
   *
   * @returns transkrip yang baru didapat ('' kalau gagal/kosong) — pemanggil
   *          "waktu habis" memakainya untuk mengirim jawaban yang belum sempat
   *          masuk state.
   */
  const selesaikanRekaman = async (): Promise<string> => {
    const p = perekamRef.current;
    if (!p) return '';
    // Satu rekaman = satu unggahan. Timer dan klik pengguna bisa tiba di
    // milidetik yang sama, dan `hentikan()` kini idempoten — tanpa penjaga
    // ini keduanya akan menunggu blob yang SAMA lalu mengirimnya dua kali.
    if (memprosesRef.current) return '';
    memprosesRef.current = true;
    setMerekam(false);
    setMemproses(true);
    try {
      const hasilRekam = await p.hentikan();
      if (!hasilRekam) {
        showToast(t('simulasi.rekam_gagal'), 'error');
        return '';
      }
      const data = await blobKeBase64(hasilRekam.blob);
      const r = await apiClient<{ success?: boolean; teks?: string; error?: string }>(
        'transkripsikanSuara',
        [{ mime: hasilRekam.mime, data }],
        { onSessionInvalid: 'throw', silent: true },
      );
      if (r?.success === false) {
        showToast(r.error || t('simulasi.rekam_gagal'), 'error');
        return '';
      }
      const teks = String(r?.teks || '').trim();
      if (teks) {
        setTranskrip((prev) => (prev ? `${prev} ${teks}`.trim() : teks));
        return teks;
      }
      showToast(t('simulasi.rekam_kosong'), 'info');
      return '';
    } catch (e) {
      showToast((e as ApiError)?.message || t('simulasi.rekam_gagal'), 'error');
      return '';
    } finally {
      memprosesRef.current = false;
      setMemproses(false);
    }
  };

  selesaikanRef.current = selesaikanRekaman;

  const alihMikrofon = async () => {
    if (merekam) {
      await selesaikanRekaman();
      return;
    }
    if (mendengar) {
      hentikanMikrofon();
      return;
    }
    /* Suara pertanyaan dimatikan dulu: mikrofon yang mendengar TTS akan
       menyalin pertanyaannya sendiri sebagai jawaban.

       ⚠ 2026-11-01 — kalimat di atas dulu hanya KOMENTAR: tidak ada satu baris
       pun yang mematikan suara, dan `ttsJepang` bahkan tidak punya fungsi
       cancel. Terukur di perangkat: pertanyaan yang masih dibacakan masuk ke
       kotak jawaban sebagai "ucapan siswa", lalu dinilai sebagai jawaban.
       `hentikanSuara()` adalah baris yang membuat komentar ini benar. */
    hentikanSuara();
    if (!bisaDengar) {
      await mulaiRekam();
      return;
    }
    const p = buatPendengar({
      onTranskrip: (teks, final) => {
        setTranskrip(dasarRef.current ? `${dasarRef.current} ${teks}`.trim() : teks);
        if (final) setMendengar(false);
      },
      onSelesai: () => setMendengar(false),
      onGalat: (kode) => {
        setMendengar(false);
        /* `service-not-allowed` BUKAN "izin ditolak": itu layanan suara
           peramban yang tidak tersedia. Dulu keduanya memakai pesan izin, jadi
           pemilik mencari izin mikrofon yang sebenarnya tidak pernah diminta.
           Di sini keduanya jatuh ke jalur rekam, yang tidak butuh layanan itu. */
        const fatal = kode === 'not-allowed' || kode === 'service-not-allowed'
          || kode === 'network' || kode === 'audio-capture';
        if (fatal) {
          showToast(t('simulasi.mikrofon_layanan'), 'info');
          void mulaiRekam();
          return;
        }
        showToast(t('simulasi.mikrofon_galat'), 'error');
      },
    });
    if (!p) {
      await mulaiRekam();
      return;
    }
    /* Suara sudah dimatikan di atas (sebelum cabang mana pun). */
    pendengarRef.current = p;
    dasarRef.current = transkrip.trim();
    p.mulai();
    setMendengar(true);
  };

  useEffect(() => () => {
    pendengarRef.current?.hentikan();
    perekamRef.current?.buang();
  }, []);

  /* ── layar: pengaturan ────────────────────────────────────────────────── */
  if (layar === 'atur') {
    return (
      <div class="rounded-card border border-line bg-surface p-4">
        <h2 class="text-[15px] font-black text-fg">{t('simulasi.judul')}</h2>
        <p class="mt-1 text-[12px] leading-relaxed text-fg-muted">{t('simulasi.ket')}</p>

        {!adaJawabanSiap && (
          <div class="mt-3 rounded-control border border-accent-amber/40 bg-accent-amber/10 p-3 text-[12px] leading-relaxed text-fg">
            {t('simulasi.belum_ada_jawaban')}{' '}
            <button type="button" onClick={onKeBank} class="font-black underline">
              {t('simulasi.ke_bank')}
            </button>
          </div>
        )}

        <div class="mt-4">
          <p class="mb-1.5 text-[11px] font-extrabold uppercase tracking-wider text-fg-muted">{t('simulasi.mode')}</p>
          <div class="grid grid-cols-3 gap-1.5">
            {MODE_URUT.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                data-testid={`simulasi-mode-${m}`}
                class={`min-h-11 rounded-control border px-1 text-[11.5px] font-bold leading-tight ${
                  mode === m ? 'border-accent-violet bg-accent-violet/10 text-accent-violet' : 'border-line bg-surface-raised text-fg-muted'
                }`}
              >
                {t(LABEL_MODE[m])}
              </button>
            ))}
          </div>
          <p class="mt-1.5 text-[11px] leading-relaxed text-fg-muted" data-testid="simulasi-mode-ket">
            {t(KET_MODE[mode])}
          </p>
          {mode === 'penuh' && (
            <p class="mt-1 text-[11px] font-bold text-accent-violet" data-testid="simulasi-mode-penuh-jumlah">
              {(semua ? pool.length : Math.min(jumlah, pool.length)) * faktorRonde} {t('simulasi.soal')} ·{' '}
              {t('simulasi.mode_penuh_rinci')}
            </p>
          )}
        </div>

        <div class="mt-4">
          <p class="mb-1.5 text-[11px] font-extrabold uppercase tracking-wider text-fg-muted">{t('simulasi.jumlah_soal')}</p>
          <div class="grid grid-cols-4 gap-1.5">
            {PILIHAN_JUMLAH.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => {
                  setJumlah(n);
                  setSemua(false);
                }}
                aria-pressed={!semua && jumlah === n}
                class={`min-h-11 rounded-control border text-[12px] font-bold ${
                  !semua && jumlah === n
                    ? 'border-accent-violet bg-accent-violet/10 text-accent-violet'
                    : 'border-line bg-surface-raised text-fg-muted'
                }`}
              >
                {n}
              </button>
            ))}
            {/* "Semua" = seluruh isi cakupan. Jumlahnya mengikuti pilihan
                cakupan di bawah, jadi angkanya ditulis di tombolnya sendiri —
                tombol "Semua" yang tidak menyebut berapa soal akan
                mengejutkan siswa di tengah ronde. */}
            <button
              type="button"
              onClick={() => setSemua(true)}
              aria-pressed={semua}
              data-testid="simulasi-semua"
              class={`min-h-11 rounded-control border text-[12px] font-bold ${
                semua ? 'border-accent-violet bg-accent-violet/10 text-accent-violet' : 'border-line bg-surface-raised text-fg-muted'
              }`}
            >
              {t('simulasi.semua')}
              <span class="ml-1 text-[10px] font-semibold opacity-70">({pool.length * faktorRonde})</span>
            </button>
          </div>
        </div>

        <div class="mt-3">
          <p class="mb-1.5 text-[11px] font-extrabold uppercase tracking-wider text-fg-muted">{t('simulasi.cakupan')}</p>
          <select
            value={cakupan}
            onChange={(e) => setCakupan((e.target as HTMLSelectElement).value)}
            class="w-full min-h-11 rounded-control border border-line bg-surface-sunken px-2 text-[12.5px] text-fg"
          >
            <option value="semua">
              {t('simulasi.semua_tahap')} ({soal.length})
            </option>
            {daftarTahap.map((d) => (
              <option key={d.tahap} value={d.tahap}>
                {d.tahap} ({d.jumlah})
              </option>
            ))}
          </select>
        </div>

        <div class="mt-3">
          <p class="mb-1.5 text-[11px] font-extrabold uppercase tracking-wider text-fg-muted">{t('simulasi.batas_waktu')}</p>
          <div class="grid grid-cols-3 gap-1.5">
            {PILIHAN_WAKTU.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setBatasDetik(n)}
                aria-pressed={batasDetik === n}
                class={`min-h-11 rounded-control border text-[12px] font-bold ${
                  batasDetik === n ? 'border-accent-violet bg-accent-violet/10 text-accent-violet' : 'border-line bg-surface-raised text-fg-muted'
                }`}
              >
                {n} {t('simulasi.detik')}
              </button>
            ))}
          </div>
        </div>

        {/* Centang ini HANYA berlaku di mode latihan. Di mensetsu/penuh suara
            wajib — soal tidak punya teks untuk dibaca — jadi kotak centang yang
            bisa dimatikan akan menjadi janji yang tidak ditepati. */}
        {mode === 'latihan' ? (
          <label class="mt-3 flex items-center gap-2 text-[12px] font-bold text-fg">
            <input
              type="checkbox"
              checked={suaraOtomatis}
              onChange={(e) => setSuaraOtomatis((e.target as HTMLInputElement).checked)}
              class="h-4 w-4"
            />
            {t('simulasi.suara_otomatis')}
          </label>
        ) : (
          <p class="mt-3 text-[11px] leading-relaxed text-fg-muted" data-testid="simulasi-suara-wajib">
            {t('simulasi.suara_wajib')}
          </p>
        )}

        {!bisaDengar && !bisaRekam && (
          <p class="mt-3 rounded-control border border-line bg-surface-sunken p-3 text-[11.5px] leading-relaxed text-fg-muted">
            {t('simulasi.mikrofon_tidak_ada')}
          </p>
        )}

        <button
          type="button"
          onClick={mulai}
          data-testid="simulasi-mulai"
          class="mt-4 w-full min-h-12 rounded-control bg-accent-violet text-canvas text-sm font-extrabold"
        >
          {t('simulasi.mulai')}
        </button>
      </div>
    );
  }

  /* ── layar: ritual masuk / keluar (hanya mode penuh) ───────────────────── */
  if (layar === 'ritual') {
    const daftar = ritualFase === 'masuk' ? RITUAL_MASUK : RITUAL_KELUAR;
    const centang = ritualFase === 'masuk' ? centangMasuk : centangKeluar;
    const setCentang = ritualFase === 'masuk' ? setCentangMasuk : setCentangKeluar;
    const alih = (i: number) => setCentang((c) => (c.includes(i) ? c.filter((x) => x !== i) : [...c, i]));
    return (
      <div class="space-y-3">
        <div class="rounded-card border border-line bg-surface p-4">
          <p class="text-[10px] font-bold uppercase tracking-wider text-accent-violet">{t('simulasi.ritual_judul')}</p>
          <h2 class="mt-1 text-[15px] font-black text-fg" data-testid="simulasi-ritual-judul">
            {ritualFase === 'masuk' ? t('simulasi.ritual_masuk') : t('simulasi.ritual_keluar')}
          </h2>
          <p class="mt-1 text-[12px] leading-relaxed text-fg-muted">
            {ritualFase === 'masuk' ? t('simulasi.ritual_masuk_ket') : t('simulasi.ritual_keluar_ket')}
          </p>
        </div>

        <ol class="space-y-2">
          {daftar.map((k, i) => (
            <li
              key={k.jp}
              class="rounded-card border border-line bg-surface p-3"
              data-testid={`simulasi-ritual-${ritualFase}-${i}`}
            >
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="text-[15px] font-bold leading-snug text-fg" lang="ja">
                    {k.jp}
                  </p>
                  <p class="text-[11px] text-fg-muted">{k.romaji}</p>
                  <p class="mt-0.5 text-[12px] text-fg">{k.arti}</p>
                  <p class="mt-0.5 text-[11px] leading-relaxed text-fg-muted">{k.kapan}</p>
                </div>
                <button
                  type="button"
                  onClick={() => ucapkanJepang(k.jp)}
                  aria-label={t('wawancara.dengar')}
                  class="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-line bg-surface-raised text-[13px]"
                >
                  <span aria-hidden="true">🔊</span>
                </button>
              </div>
              <label class="mt-2 flex items-center gap-2 text-[11.5px] font-bold text-fg">
                <input type="checkbox" checked={centang.includes(i)} onChange={() => alih(i)} class="h-4 w-4" />
                {t('simulasi.ritual_centang')}
              </label>
            </li>
          ))}
        </ol>

        <button
          type="button"
          onClick={() => {
            if (ritualFase === 'masuk') {
              masukSoal(ronde, 0);
              return;
            }
            selesai();
          }}
          data-testid="simulasi-ritual-lanjut"
          class="min-h-12 w-full rounded-control bg-accent-violet text-canvas text-sm font-extrabold"
        >
          {ritualFase === 'masuk' ? t('simulasi.ritual_mulai') : t('simulasi.lihat_hasil')}
        </button>
        <p class="text-center text-[10.5px] leading-relaxed text-fg-muted">
          {centang.length}/{daftar.length} · {t('simulasi.ritual_ket')}
        </p>
      </div>
    );
  }

  /* ── layar: hasil ─────────────────────────────────────────────────────── */
  if (layar === 'hasil') {
    /* Rata-rata HANYA dari pertanyaan utama. Susulan tidak punya naskah, jadi
       skornya tidak sebanding: mencampurnya ke rata-rata akan membuat jawaban
       hafalan yang bagus terlihat lebih buruk hanya karena susulannya sulit.
       Keduanya dilaporkan terpisah — lihat `nilaiSusulan`. */
    const utama = hasil.filter((h) => !h.susulan);
    const susulan = hasil.filter((h) => h.susulan);
    const rata = utama.length ? Math.round(utama.reduce((a, b) => a + b.nilai.total, 0) / utama.length) : 0;
    const rataSusulan = susulan.length ? Math.round(susulan.reduce((a, b) => a + b.nilai.total, 0) / susulan.length) : 0;
    const ritualDicentang = centangMasuk.length + centangKeluar.length;
    const ritualTotal = RITUAL_MASUK.length + RITUAL_KELUAR.length;
    const grade = rata >= AMBANG_GRADE.A ? 'A' : rata >= AMBANG_GRADE.B ? 'B' : rata >= AMBANG_GRADE.C ? 'C' : 'D';
    const warna: Record<string, string> = {
      A: 'border-accent-emerald bg-accent-emerald/10 text-accent-emerald',
      B: 'border-accent-sky bg-accent-sky/10 text-accent-sky',
      C: 'border-accent-amber bg-accent-amber/10 text-accent-amber',
      D: 'border-accent-red bg-accent-red/10 text-accent-red',
    };
    return (
      <div class="space-y-3">
        <div class="rounded-card border border-line bg-surface p-4 text-center">
          <div class={`mb-2 inline-block rounded-control border-2 px-4 py-1 text-2xl font-black ${warna[grade] ?? ''}`}>{grade}</div>
          <h2 class="text-[15px] font-black text-fg">{t('simulasi.hasil_judul')}</h2>
          <p class="mt-1 text-[12px] text-fg-muted">
            {t('simulasi.skor_total')}: <b class="text-fg">{rata}</b> / 100 · {utama.length} {t('simulasi.soal')}
          </p>
          {/* Dilewati dilaporkan SENDIRI, bukan sebagai nilai 0: lihat catatan
              di `lewati()`. Tanpa baris ini, ronde yang dilewati semua tampil
              sebagai "0 soal" — terbaca seperti data yang hilang. */}
          {dilewati > 0 && (
            <p class="mt-1 text-[11.5px] text-fg-muted" data-testid="simulasi-hasil-dilewati">
              {t('simulasi.dilewati')}: <b class="text-fg">{dilewati}</b>
            </p>
          )}
          {/* Diukur di setiap mode yang menyembunyikan teks: di mode latihan
              teksnya memang selalu terbuka, jadi angka 0 di sana bukan pujian. */}
          {mode !== 'latihan' && (
            <p class="mt-1 text-[11.5px] text-fg-muted" data-testid="simulasi-hasil-terbuka">
              {t('simulasi.hasil_terbuka')}: <b class="text-fg">{terbuka}</b>
            </p>
          )}
          {mode === 'penuh' && (
            <div class="mt-2 space-y-1 border-t border-line pt-2 text-[11.5px] text-fg-muted" data-testid="simulasi-hasil-penuh">
              <p>
                {t('simulasi.hasil_susulan')}: <b class="text-fg">{susulan.length}</b> · {t('simulasi.hasil_susulan_rata')}:{' '}
                <b class="text-fg">{rataSusulan}</b>/100
              </p>
              <p>
                {t('simulasi.hasil_ritual')}: <b class="text-fg">{ritualDicentang}</b>/{ritualTotal}
              </p>
            </div>
          )}
        </div>

        <div class="space-y-2">
          {hasil.map((h, i) => (
            <div
              key={`${h.soal.kode}-${i}`}
              data-jenis={h.susulan ? 'susulan' : 'utama'}
              class="rounded-card border border-line bg-surface p-3"
            >
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="text-[10px] font-bold uppercase text-fg-muted">
                    {h.soal.tahap}
                    {h.susulan && (
                      <span class="ml-1 rounded bg-accent-violet/10 px-1 py-0.5 text-[9px] text-accent-violet">
                        {t('simulasi.susulan_badge')}
                      </span>
                    )}
                  </p>
                  <p class="text-[13px] font-bold text-fg" lang="ja">
                    {h.susulan ? h.susulan.jp : h.soal.jp}
                  </p>
                  {/* Susulan selalu dibaca sebagai lanjutan dari pertanyaan
                      sebelumnya — tanpa pertanyaannya di sini, laporan ini
                      terbaca seperti daftar soal yang tidak berhubungan. */}
                  {h.susulan && (
                    <p class="mt-0.5 text-[10.5px] leading-snug text-fg-muted" lang="ja">
                      ↳ {h.soal.jp}
                    </p>
                  )}
                </div>
                <span class={`shrink-0 rounded-control border px-2 py-0.5 text-[12px] font-black ${warna[h.nilai.grade] ?? ''}`}>
                  {h.nilai.total}
                </span>
              </div>

              <div class="mt-1.5 grid grid-cols-2 gap-1 text-[11px] text-fg-muted">
                <span>
                  {t('simulasi.aspek_kecocokan')}: {h.nilai.aspek.kecocokan === null ? '—' : `${h.nilai.aspek.kecocokan}/50`}
                </span>
                <span>
                  {t('simulasi.aspek_kelancaran')}: {h.nilai.aspek.kelancaran}/25
                </span>
                <span>
                  {t('simulasi.aspek_waktu')}: {h.nilai.aspek.waktu}/15 ({h.detik}s)
                </span>
                <span>
                  {t('simulasi.aspek_sopan')}: {h.nilai.aspek.sopan}/10
                </span>
              </div>

              {h.transkrip && (
                <p class="mt-1.5 rounded-control border border-line bg-surface-sunken p-2 text-[12px] text-fg" lang="ja">
                  {h.transkrip}
                </p>
              )}

              <p class="mt-1 text-[10px] font-bold text-fg-muted">
                {h.susulan
                  ? t('simulasi.susulan_tanpa_acuan')
                  : h.nilai.acuan === 'siswa'
                    ? t('simulasi.acuan_siswa')
                    : h.nilai.acuan === 'bank'
                      ? t('simulasi.acuan_bank')
                      : t('simulasi.acuan_tidak_ada')}
              </p>

              <ul class="mt-1 space-y-0.5 text-[11.5px] text-fg-muted">
                {h.nilai.catatan.map((c, ci) => (
                  <li key={`${c.kode}-${ci}`}>
                    · {t(`simulasi.catatan_${c.kode}`)}
                    {typeof c.angka === 'number' ? ` (${c.angka})` : ''}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div class="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={mulai}
            class="min-h-12 rounded-control bg-accent-violet text-canvas text-xs font-extrabold"
          >
            {t('simulasi.ulangi')}
          </button>
          <button
            type="button"
            onClick={() => setLayar('atur')}
            class="min-h-12 rounded-control border border-line bg-surface-raised text-xs font-extrabold text-fg"
          >
            {t('simulasi.ganti_pengaturan')}
          </button>
        </div>
      </div>
    );
  }

  /* ── layar: main ──────────────────────────────────────────────────────── */
  /* Acuan hanya berlaku untuk pertanyaan utama. Susulan tidak punya naskah —
     menampilkan "Acuan: jawaban Anda sendiri" di sana akan mengklaim siswa
     dinilai terhadap kalimat yang tidak menjawab pertanyaan itu. */
  const acuanAktif =
    soalAktif && !susulanAktif ? acuanUntuk(soalAktif) : { teks: '', dari: 'tidak-ada' as const };
  const romajiTanya = susulanAktif ? susulanAktif.romaji : (soalAktif?.romaji ?? '');
  const artiTanya = susulanAktif ? susulanAktif.arti : (soalAktif?.arti ?? '');
  return (
    <div class="space-y-3">
      <div class="flex items-center justify-between gap-2 rounded-card border border-line bg-surface p-3">
        <div>
          <span class="block text-[10px] font-bold uppercase tracking-wider text-fg-muted">{t('simulasi.nomor')}</span>
          <div class="flex items-baseline gap-1">
            <span class="text-lg font-black text-fg">{String(idx + 1).padStart(2, '0')}</span>
            <span class="text-xs font-semibold text-fg-muted">/ {ronde.length}</span>
          </div>
        </div>
        <div class="text-right">
          <span class="block text-[10px] font-bold uppercase tracking-wider text-fg-muted">{t('simulasi.sisa_waktu')}</span>
          <span class={`text-lg font-black ${sisaWaktu <= 10 ? 'text-accent-red' : 'text-accent-violet'}`}>{sisaWaktu}s</span>
        </div>
      </div>

      <div class="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
        <div
          class="h-full bg-gradient-to-r from-accent-violet to-accent-sky transition-[width] duration-300 motion-reduce:transition-none"
          style={{ width: `${(sisaWaktu / Math.max(1, batasDetik)) * 100}%` }}
        />
      </div>

      <div class="rounded-card border border-line bg-surface p-4">
        <p class="text-[10px] font-bold uppercase tracking-wider text-fg-muted">
          {soalAktif?.tahap}
          {susulanAktif && (
            <span
              class="ml-1 rounded bg-accent-violet/10 px-1 py-0.5 text-[9px] text-accent-violet"
              data-testid="simulasi-susulan-badge"
            >
              {t('simulasi.susulan_badge')}
            </span>
          )}
        </p>

        {mode !== 'latihan' && !teksTampil ? (
          <div
            class="mt-2 rounded-control border border-dashed border-line bg-surface-sunken px-3 py-5 text-center"
            data-testid="simulasi-mendengarkan"
          >
            <p class="text-[12.5px] font-bold text-fg-muted">{t('simulasi.mendengarkan')}</p>
            <p class="mt-1 text-[11px] leading-relaxed text-fg-muted">
              {susulanAktif ? t('simulasi.susulan_ket') : t('simulasi.mendengarkan_ket')}
            </p>
          </div>
        ) : (
          <>
            <p class="mt-1 text-[16px] font-bold leading-snug text-fg" lang="ja" data-testid="simulasi-soal">
              {teksTanya}
            </p>
            <p class="text-[11.5px] text-fg-muted">{romajiTanya}</p>
            <p class="text-[12px] text-fg">{artiTanya}</p>
            {/* Saat susulan, pertanyaan asalnya ikut ditampilkan sebagai
                konteks — susulan tanpa pertanyaannya tidak bisa dipahami. */}
            {susulanAktif && (
              <p class="mt-1 border-t border-line pt-1 text-[11px] leading-snug text-fg-muted" lang="ja">
                ↳ {soalAktif?.jp}
              </p>
            )}
          </>
        )}

        <div class="mt-2 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => ucapkanJepang(teksTanya)}
            class="inline-flex min-h-11 items-center gap-1 rounded-md border border-line bg-surface-raised px-2.5 text-[11px] font-bold text-fg-muted"
          >
            <span aria-hidden="true">🔊</span>
            {t('wawancara.dengar')}
          </button>
          {mode !== 'latihan' && !teksTampil && (
            <button
              type="button"
              onClick={() => {
                setTeksTampil(true);
                setTerbuka((n) => n + 1);
              }}
              data-testid="simulasi-lihat-teks"
              class="inline-flex min-h-11 items-center rounded-md border border-line bg-surface-raised px-2.5 text-[11px] font-bold text-fg-muted"
            >
              {t('simulasi.lihat_teks')}
            </button>
          )}
          <span class="text-[10.5px] text-fg-muted">
            {acuanAktif.dari === 'siswa' ? t('simulasi.acuan_siswa') : acuanAktif.dari === 'bank' ? t('simulasi.acuan_bank') : t('simulasi.acuan_tidak_ada')}
          </span>
        </div>
      </div>

      <div class="rounded-card border border-line bg-surface p-3">
        <div class="flex items-center justify-between gap-2">
          <span class="text-[11px] font-extrabold uppercase tracking-wider text-fg-muted">{t('simulasi.jawaban')}</span>
          <button
            type="button"
            onClick={() => void alihMikrofon()}
            aria-pressed={mendengar || merekam}
            disabled={memproses}
            data-testid="simulasi-mikrofon"
            class={`inline-flex min-h-11 items-center gap-1.5 rounded-control border px-3 text-[11.5px] font-bold disabled:opacity-60 ${
              mendengar || merekam ? 'border-accent-red bg-accent-red/10 text-accent-red' : 'border-line bg-surface-raised text-fg-muted'
            }`}
          >
            <span aria-hidden="true">{memproses ? '⏳' : mendengar || merekam ? '⏹' : '🎙'}</span>
            {memproses
              ? t('simulasi.rekam_proses')
              : mendengar
                ? t('simulasi.berhenti_dengar')
                : merekam
                  ? t('simulasi.berhenti_dengar')
                  : t('simulasi.mulai_dengar')}
          </button>
        </div>
        <textarea
          rows={3}
          lang="ja"
          value={transkrip}
          onInput={(e) => setTranskrip((e.target as HTMLTextAreaElement).value)}
          placeholder={t('simulasi.ketik_jawaban')}
          data-testid="simulasi-transkrip"
          class="mt-2 w-full rounded-control border border-line bg-surface-sunken px-2 py-1.5 text-[13px] text-fg"
        />
        <div class="mt-2 grid grid-cols-[1fr_auto] gap-2">
          <button
            type="button"
            onClick={() => kirim()}
            data-testid="simulasi-kirim"
            class="min-h-11 rounded-control bg-accent-violet text-canvas text-[12.5px] font-extrabold"
          >
            {t('simulasi.kirim')}
          </button>
          <button
            type="button"
            onClick={lewati}
            data-testid="simulasi-lewati"
            class="min-h-11 rounded-control border border-line bg-surface-raised px-3 text-[11.5px] font-bold text-fg-muted"
          >
            {t('simulasi.lewati')}
          </button>
        </div>
      </div>

      <button type="button" onClick={tutupRonde} class="min-h-11 w-full text-[11px] font-bold text-fg-muted">
        {t('simulasi.akhiri')}
      </button>
    </div>
  );
}
