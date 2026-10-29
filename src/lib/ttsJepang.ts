/**
 * lib/ttsJepang.ts — Web Speech API untuk bahasa Jepang, dua arah:
 *   • KELUARAN (`ucapkanJepang`, `speechSynthesis`) — tombol dengar di
 *     `/wawancara` dan Mode Simulasi;
 *   • MASUKAN (`buatPendengar`, `SpeechRecognition`) — mikrofon Mode Simulasi.
 *
 * KENAPA ADA MODUL SENDIRI, BUKAN DI DALAM KOMPONEN
 * -------------------------------------------------
 * `KotobaGame` menulis `speechSynthesis` langsung di dalam komponennya, dan itu
 * wajar untuk satu tombol. Di `/wawancara` tombolnya tiga jenis (pertanyaan,
 * contoh jawaban, jawaban siswa) di 177 baris, jadi aturan "suara mana yang
 * dipakai" harus bisa diuji tanpa merender 823 baris form. Modul ini murni:
 * tidak menyentuh state, tidak menyentuh DOM kecuali lewat `globalThis`.
 *
 * KENAPA `globalThis`, BUKAN `window`
 * ----------------------------------
 * Supaya bisa diuji di lingkungan `node` (proyek `backend` vitest) tanpa jsdom.
 * Di peramban `globalThis === window`, jadi perilakunya sama.
 *
 * ATURAN YANG DIKUNCI DI SINI (dan diuji di `e2e/tts-jepang.test.ts`)
 * ------------------------------------------------------------------
 *   1. Satu suara pada satu waktu: `cancel()` sebelum `speak()`. Tanpa itu,
 *      menekan dua tombol beruntun membuat dua kalimat Jepang bertumpuk — dan
 *      itu justru merusak latihan mendengar.
 *   2. Suara Jepang DIPILIH, bukan diserahkan ke bawaan peramban. Kalau tidak
 *      ada suara `ja-*`, teks Jepang tetap dibacakan oleh suara Indonesia
 *      (kedengarannya seperti orang membaca huruf Latin) — lebih baik memilih
 *      yang benar atau jujur bilang tidak ada.
 *   3. `lang = 'ja-JP'` selalu diset, bahkan saat `voice` tidak ketemu: itulah
 *      satu-satunya petunjuk yang dipakai mesin suara untuk memilih bahasa.
 *   4. Fungsi mengembalikan `false` (bukan melempar) saat perangkat tidak
 *      mendukung atau teksnya kosong. Pemanggil yang memutuskan mau menampilkan
 *      apa — modul ini tidak tahu apa itu toast.
 */

/** Bagian dari `SpeechSynthesisVoice` yang benar-benar dipakai. */
export interface SuaraJepang {
  name: string;
  lang: string;
}

/** Bagian dari `SpeechSynthesisUtterance` yang benar-benar dipakai. */
interface UcapanLike {
  text: string;
  lang: string;
  rate: number;
  pitch: number;
  voice: SuaraJepang | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

type CtorUcapan = new (teks: string) => UcapanLike;

interface SynthLike {
  speak(u: UcapanLike): void;
  cancel(): void;
  getVoices(): SuaraJepang[];
}

type GlobalSuara = {
  speechSynthesis?: SynthLike;
  SpeechSynthesisUtterance?: CtorUcapan;
};

/**
 * Laju bicara. 0,85 sudah lebih lambat daripada orang Jepang berbicara normal
 * dan itu yang dipakai untuk tombol utama; 0,6 untuk siswa yang baru pertama
 * kali mendengar kalimatnya. Di bawah 0,5 suku katanya jadi terpisah-pisah dan
 * justru lebih sulit diikuti.
 */
export const LAJU_NORMAL = 0.85;
export const LAJU_LAMBAT = 0.6;

function globalSuara(): GlobalSuara {
  return globalThis as unknown as GlobalSuara;
}

/** Apakah perangkat ini punya mesin suara sama sekali. */
export function dukunganSuara(): boolean {
  const g = globalSuara();
  return typeof g.speechSynthesis?.speak === 'function' && typeof g.SpeechSynthesisUtterance === 'function';
}

/**
 * Pilih suara Jepang dari daftar milik perangkat.
 *
 * Urutan: `ja-JP` persis → `ja_JP` (bentuk lama) → apa pun yang berawalan `ja`.
 * `null` = tidak ada, dan pemanggil harus memperlakukannya sebagai "tidak ada
 * suara Jepang", bukan "pakai suara apa saja".
 */
export function pilihSuaraJepang(daftar: readonly SuaraJepang[]): SuaraJepang | null {
  const normal = (v: SuaraJepang) => String(v?.lang ?? '').toLowerCase().replace(/_/g, '-');
  const jepang = daftar.filter((v) => normal(v).startsWith('ja'));
  if (!jepang.length) return null;
  return jepang.find((v) => normal(v) === 'ja-jp') ?? jepang[0] ?? null;
}

/**
 * Ucapkan satu teks Jepang.
 *
 * @returns `true` kalau benar-benar dikirim ke mesin suara; `false` kalau
 *          perangkat tidak mendukung atau teksnya kosong.
 */
export function ucapkanJepang(
  teks: string,
  opsi: { laju?: number; onSelesai?: () => void } = {},
): boolean {
  const g = globalSuara();
  const synth = g.speechSynthesis;
  const Ctor = g.SpeechSynthesisUtterance;
  if (!synth || !Ctor) return false;

  const bersih = String(teks ?? '').trim();
  if (!bersih) return false;

  try {
    /* Satu suara pada satu waktu — lihat aturan 1 di kepala berkas. */
    synth.cancel();
    const u = new Ctor(bersih);
    u.lang = 'ja-JP';
    u.rate = opsi.laju ?? LAJU_NORMAL;
    u.pitch = 1;
    const voice = pilihSuaraJepang(synth.getVoices() ?? []);
    if (voice) u.voice = voice;
    if (opsi.onSelesai) {
      /* `onerror` juga memanggil callback: tombol harus kembali normal walau
         mesin suara gagal di tengah kalimat, kalau tidak ia berputar selamanya. */
      u.onend = opsi.onSelesai;
      u.onerror = opsi.onSelesai;
    }
    synth.speak(u);
    return true;
  } catch {
    /* Safari lama melempar kalau `speak()` dipanggil tanpa gestur pengguna. */
    return false;
  }
}

/* ── masukan suara (SpeechRecognition) ──────────────────────────────────────
 *
 * HANYA CHROME/EDGE (Android & desktop) yang punya `SpeechRecognition`.
 * Safari iOS dan Firefox TIDAK punya — di sana mikrofon tidak akan muncul dan
 * siswa mengetik. Itu batasan peramban, bukan sesuatu yang bisa ditambal di
 * sisi kita, jadi pemanggil WAJIB menyediakan jalur ketik sebagai gantinya.
 *
 * Pengenalannya juga tidak berjalan luring: Chrome mengirim audio ke layanan
 * Google. Karena itu modul ini hanya mengembalikan TEKS — tidak ada rekaman
 * yang disimpan, dan tidak ada audio yang dikirim ke server kita.
 */

/** Bagian dari `SpeechRecognitionEvent` yang benar-benar dipakai. */
type HasilSatu = { isFinal: boolean; 0: { transcript: string } };
type DaftarHasil = { length: number; [index: number]: HasilSatu };
type PeristiwaHasil = { resultIndex: number; results: DaftarHasil };
type PeristiwaGalat = { error?: string };

interface PengenalLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: PeristiwaHasil) => void) | null;
  onerror: ((e: PeristiwaGalat) => void) | null;
  onend: (() => void) | null;
}

type CtorPengenal = new () => PengenalLike;

type GlobalDengar = {
  SpeechRecognition?: CtorPengenal;
  webkitSpeechRecognition?: CtorPengenal;
};

/** Apakah peramban ini bisa mendengar (Chrome/Edge, bukan Safari iOS/Firefox). */
export function dukunganDengar(): boolean {
  const g = globalThis as unknown as GlobalDengar;
  return typeof (g.SpeechRecognition ?? g.webkitSpeechRecognition) === 'function';
}

export interface Pendengar {
  /** Mulai mendengar. Aman dipanggil walau sudah berjalan (tidak melempar). */
  mulai(): void;
  /** Berhenti dan biarkan transkrip terakhir dipakai. */
  hentikan(): void;
  /** Sedang mendengar? */
  aktif(): boolean;
}

/**
 * Buat pendengar Jepang.
 *
 * `onTranskrip` dipanggil setiap ada perubahan (termasuk hasil sementara), jadi
 * kotak teks bisa terisi sambil siswa berbicara. Hasil akhir tetap dikirim
 * dengan `final: true` supaya pemanggil bisa membedakan "sedang didengar" dari
 * "sudah selesai".
 *
 * `null` = peramban tidak mendukung; pemanggil yang memutuskan menampilkan apa.
 */
export function buatPendengar(opsi: {
  onTranskrip: (teks: string, final: boolean) => void;
  onSelesai?: () => void;
  onGalat?: (kode: string) => void;
}): Pendengar | null {  const g = globalThis as unknown as GlobalDengar;
  const Ctor = g.SpeechRecognition ?? g.webkitSpeechRecognition;
  if (!Ctor) return null;

  let pengenal: PengenalLike | null = null;
  let jalan = false;
  /* Transkrip hasil akhir diakumulasi sendiri: `results` dari peramban berisi
     SELURUH riwayat sesi, dan membacanya ulang di setiap peristiwa membuat
     teks yang sama terkirim berkali-kali. */
  let kumpulan = '';

  const buat = (): PengenalLike => {
    const p = new Ctor();
    p.lang = 'ja-JP';
    p.continuous = true;
    p.interimResults = true;
    p.maxAlternatives = 1;
    p.onresult = (e) => {
      let sementara = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const hasil = e.results[i];
        if (!hasil) continue;
        const teks = hasil[0]?.transcript ?? '';
        if (hasil.isFinal) kumpulan += teks;
        else sementara += teks;
      }
      opsi.onTranskrip((kumpulan + sementara).trim(), sementara === '');
    };
    p.onerror = (e) => {
      jalan = false;
      opsi.onGalat?.(String(e?.error ?? 'unknown'));
    };
    p.onend = () => {
      jalan = false;
      opsi.onSelesai?.();
    };
    return p;
  };

  return {
    mulai() {
      if (jalan) return;
      try {
        pengenal = buat();
        kumpulan = '';
        pengenal.start();
        jalan = true;
      } catch {
        /* `start()` dua kali / izin ditolak: biarkan pemanggil tahu lewat galat. */
        jalan = false;
        opsi.onGalat?.('start-gagal');
      }
    },
    hentikan() {
      try {
        pengenal?.stop();
      } catch {
        /* Sudah berhenti. */
      }
      jalan = false;
    },
    aktif: () => jalan,
  };
}

/* ── rekaman suara (MediaRecorder) ─────────────────────────────────────────
 *
 * JALUR CADANGAN, dan sekarang jalur UTAMA di perangkat yang tidak punya
 * `SpeechRecognition` (Safari iOS, Firefox) atau yang layanan suara
 * perambannya tidak tersedia (`service-not-allowed`).
 *
 * Bedanya dengan `buatPendengar`: modul ini TIDAK mengubah suara menjadi teks.
 * Ia hanya merekam; transkripsinya dikerjakan server (`transkripsikanSuara`),
 * jadi tidak ada ketergantungan pada layanan suara peramban — dan tidak ada
 * audio yang dikirim ke pihak ketiga selain penyedia model yang sudah dipakai
 * seluruh fitur AI di aplikasi ini.
 *
 * Sengaja TANPA impor apa pun: berkas ini diuji di lingkungan `node`
 * (`e2e/tts-jepang.test.ts`), dan `navigator`/`MediaRecorder` hanya disentuh di
 * dalam fungsi yang dipanggil peramban.
 */

/** Alasan mikrofon tidak bisa dipakai — dipetakan ke pesan di komponen. */
export type GalatRekam = 'tidak-aman' | 'tidak-didukung' | 'ditolak' | 'tidak-ada' | 'dipakai' | 'lain';

export interface HasilRekam {
  blob: Blob;
  mime: string;
}

export interface Perekam {
  /**
   * Minta izin + mulai merekam.
   * @returns `null` kalau rekaman berjalan; selain itu ALASAN gagalnya.
   *          (Bukan `throw`: alasan gagal adalah nilai yang ditampilkan ke
   *          pengguna, bukan kondisi luar biasa.)
   */
  mulai(): Promise<GalatRekam | null>;
  /** Berhenti dan kembalikan rekaman (null kalau tidak ada data). */
  hentikan(): Promise<HasilRekam | null>;
  /** Berhenti dan buang rekaman (mis. soal dilewati). */
  buang(): void;
  aktif(): boolean;
}

/** Bagian dari MediaStream yang dipakai. Sengaja STRUKTURAL: menyebut nama
 *  tipe DOM di berkas ini membuat indexer mencatatnya sebagai referensi yang
 *  tidak bisa diselesaikan (lihat assertion `prodGenuine` di
 *  indexer/src/build.test.ts). */
type AliranAudio = { getTracks(): Array<{ stop(): void }> };

type GlobalRekam = {
  MediaRecorder?: typeof MediaRecorder;
  navigator?: { mediaDevices?: { getUserMedia?: (c: { audio: boolean }) => Promise<unknown> } };
  isSecureContext?: boolean;
};

/**
 * Apakah perangkat ini PUNYA jalur rekam sama sekali (tanpa soal izin).
 *
 * Konteks tidak aman (http) sengaja TIDAK diperiksa di sini: `getUserMedia`
 * memang tidak ada di sana, tetapi menyatukannya dengan "tidak didukung" akan
 * memberi pesan yang salah — pengguna http perlu tahu bahwa masalahnya HTTPS,
 * bukan perangkatnya. `mulai()` yang memutuskan, dan mengembalikan
 * `'tidak-aman'`.
 */
export function dukunganRekam(): boolean {
  const g = globalThis as unknown as GlobalRekam;
  if (typeof g.MediaRecorder !== 'function') return false;
  return typeof g.navigator?.mediaDevices?.getUserMedia === 'function';
}

function petakanGalat(e: unknown): GalatRekam {
  const nama = String((e as { name?: string })?.name || '');
  if (nama === 'NotAllowedError' || nama === 'SecurityError' || nama === 'PermissionDeniedError') return 'ditolak';
  if (nama === 'NotFoundError' || nama === 'DevicesNotFoundError' || nama === 'OverconstrainedError') return 'tidak-ada';
  if (nama === 'NotReadableError' || nama === 'TrackStartError' || nama === 'AbortError') return 'dipakai';
  return 'lain';
}

/** MIME yang benar-benar didukung peramban ini (Safari memilih mp4). */
function pilihMime(): string {
  const g = globalThis as unknown as GlobalRekam;
  const calon = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  const MR = g.MediaRecorder;
  if (!MR || typeof MR.isTypeSupported !== 'function') return '';
  return calon.find((m) => MR.isTypeSupported(m)) || '';
}

/**
 * Buat perekam. `null` = perangkat tidak mendukung MediaRecorder.
 *
 * `maksDetik` menghentikan rekaman sendiri: satu jawaban mensetsu tidak pernah
 * 45 detik, dan rekaman yang lebih panjang hanya menambah waktu transkripsi
 * (audio 45 dtk ≈ 400 KB, cukup jauh di bawah batas unggah fungsi).
 */
export function buatPerekamAudio(opsi: {
  maksDetik?: number;
  onBatasWaktu?: () => void;
} = {}): Perekam | null {
  const g = globalThis as unknown as GlobalRekam;
  if (!dukunganRekam()) return null;
  const MR = g.MediaRecorder as typeof MediaRecorder;

  let stream: AliranAudio | null = null;
  let rekaman: MediaRecorder | null = null;
  let potongan: BlobPart[] = [];
  let mime = '';
  let jalan = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let selesai: Promise<HasilRekam | null> | null = null;
  let resolveSelesai: ((v: HasilRekam | null) => void) | null = null;

  const bersihkan = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    for (const track of stream?.getTracks() ?? []) track.stop();
    stream = null;
    rekaman = null;
    jalan = false;
  };

  return {
    async mulai() {
      if (jalan) return null;
      if (g.isSecureContext === false) return 'tidak-aman';
      const ambil = g.navigator?.mediaDevices?.getUserMedia;
      if (typeof ambil !== 'function') return 'tidak-didukung';
      let s: AliranAudio;
      try {
        s = (await ambil({ audio: true })) as AliranAudio;
      } catch (e) {
        return petakanGalat(e);
      }
      stream = s;
      mime = pilihMime();
      try {
        rekaman = mime ? new MR(s as never, { mimeType: mime }) : new MR(s as never);
      } catch {
        bersihkan();
        return 'tidak-didukung';
      }
      mime = rekaman.mimeType || mime || 'audio/webm';
      potongan = [];
      selesai = new Promise<HasilRekam | null>((resolve) => { resolveSelesai = resolve; });
      rekaman.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size > 0) potongan.push(e.data);
      };
      rekaman.onstop = () => {
        const blob = potongan.length ? new Blob(potongan, { type: mime }) : null;
        potongan = [];
        bersihkan();
        resolveSelesai?.(blob ? { blob, mime } : null);
        resolveSelesai = null;
      };
      rekaman.start();
      jalan = true;
      const batas = opsi.maksDetik ?? 45;
      timer = setTimeout(() => {
        try { rekaman?.stop(); } catch { /* sudah berhenti */ }
        opsi.onBatasWaktu?.();
      }, batas * 1000);
      return null;
    },
    hentikan() {
      // IDEMPOTEN, dan itu bukan kemewahan: `maksDetik` memanggil `stop()`
      // sendiri lalu memberi tahu komponen, yang memanggil `hentikan()` lagi.
      // Versi pertama memeriksa `jalan` (masih true saat itu, karena `onstop`
      // belum menyala), memanggil `stop()` untuk kedua kalinya — yang MELEMPAR
      // pada recorder yang sudah nonaktif — lalu mengembalikan `null`. Hasilnya
      // rekaman 45 detik dibuang dan pengguna melihat "rekaman tidak bisa
      // diproses". Sekarang satu rekaman = satu promise, dan pemanggil kedua
      // menunggu promise yang sama.
      const p = selesai;
      if (!p) return Promise.resolve(null);
      try {
        rekaman?.stop();
      } catch {
        /* Sudah berhenti (atau belum pernah mulai) — `onstop` tetap menyala. */
      }
      return p;
    },
    buang() {
      potongan = [];
      try { rekaman?.stop(); } catch { /* sudah berhenti */ }
      bersihkan();
      resolveSelesai?.(null);
      resolveSelesai = null;
    },
    aktif: () => jalan,
  };
}
