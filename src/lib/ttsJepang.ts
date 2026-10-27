/**
 * lib/ttsJepang.ts — pengucapan bahasa Jepang lewat Web Speech API.
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
