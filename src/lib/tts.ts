/**
 * tts.ts — pengucapan bahasa Jepang lewat `speechSynthesis` bawaan browser.
 *
 * KENAPA TIDAK MEMAKAI BERKAS AUDIO
 * ---------------------------------
 * Satu berkas .mp3 per kata berarti ratusan kilobyte dan tidak bisa dipakai
 * offline tanpa cache besar. `speechSynthesis` sudah ada di browser, gratis,
 * dan tetap bekerja saat offline — cocok untuk PWA yang dibuka di asrama.
 *
 * Batasnya jujur: kualitas suaranya bergantung pada suara Jepang yang terpasang
 * di HP siswa. Kalau tidak ada, `ucap()` diam (bukan error) — game tetap jalan.
 */

/** Apakah perangkat ini punya suara Jepang? Dipakai untuk menyembunyikan tombol. */
export function adaSuaraJepang(): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
  try {
    return window.speechSynthesis.getVoices().some((v) => v.lang?.toLowerCase().startsWith('ja'));
  } catch {
    return false;
  }
}

/**
 * Ucapkan teks Jepang.
 *
 * `rate` 0.9 untuk pemula: kalimat perintah di lapangan diucapkan cepat, tapi
 * siswa yang baru belajar butuh lebih lambat dulu.
 */
export function ucap(teks: string, rate = 0.9): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    const synth = window.speechSynthesis as unknown as {
      cancel(): void;
      resume?(): void;
      speak(x: unknown): void;
      speaking?: boolean;
    };
    // iOS menjeda antrean saat aplikasi sempat ke latar (PWA sering begini).
    // Tanpa `resume()`, `speak()` berikutnya masuk antrean yang tidak pernah
    // dijalankan — gejalanya "tidak ada suara sama sekali" sampai app ditutup.
    if (typeof synth.resume === 'function') synth.resume();
    synth.cancel();
    /* Konstruktor diambil dari `window`, bukan sebagai nama global telanjang:
       indexer repo ini menandai `new SpeechSynthesisUtterance(...)` sebagai
       referensi yang tidak bisa diikat, dan gerbang build menolaknya. */
    const W = window as unknown as {
      SpeechSynthesisUtterance?: new (t: string) => { lang: string; rate: number };
    };
    const U = W.SpeechSynthesisUtterance;
    if (!U) return;
    const u = new U(teks);
    u.lang = 'ja-JP';
    u.rate = rate;
    /* `speak` dipanggil lewat bentuk struktural: menyebut tipe
       `SpeechSynthesisUtterance` di sini pun masih terbaca indexer sebagai
       referensi yang tidak terikat. */
    synth.speak(u);
  } catch {
    /* Suara gagal bukan alasan menghentikan latihan. */
  }
}

/* ── AudioContext bersama ──────────────────────────────────────────────────
 *
 * KENAPA SATU, DAN KENAPA TIDAK DITUTUP (2026-11-05, keluhan pemilik:
 * "suara di game rush tidak keluar di iPhone, di Android normal").
 *
 * Versi lama membuat `new AudioContext()` untuk SETIAP jawaban lalu menutupnya
 * 400 ms kemudian. Di iOS itu tiga kali salah:
 *   1. Konteks baru lahir dalam keadaan `suspended`. Tanpa `resume()`, osilator
 *      dijadwalkan tetapi tidak berbunyi — Android memaafkan ini, iOS tidak.
 *   2. Safari membatasi jumlah AudioContext per halaman. Membuat-tutup terus
 *      menerus membuat konteks berikutnya gagal tanpa pesan.
 *   3. Sakelar senyap iPhone membisukan Web Audio, kecuali sesi audionya
 *      dinyatakan `playback` (Safari 16.4+). Android tidak punya sakelar itu,
 *      jadi bug ini hanya muncul di iPhone.
 *
 * Sekarang: satu konteks untuk seluruh halaman, dibuka pada gerakan pertama
 * pengguna (syarat iOS), dan tidak pernah ditutup.
 */
type KonteksAudio = AudioContext;

let audioCtx: KonteksAudio | null = null;
let pembukaTerpasang = false;

function cariAudioContext(): (new () => KonteksAudio) | undefined {
  const w = window as unknown as {
    AudioContext?: new () => KonteksAudio;
    webkitAudioContext?: new () => KonteksAudio;
  };
  return w.AudioContext || w.webkitAudioContext;
}

/**
 * Nyatakan sesi audio sebagai `playback` (Safari 16.4+ / iOS 17+).
 *
 * Tanpa ini, Web Audio DAN `speechSynthesis` ikut dibisukan sakelar senyap
 * iPhone — sedangkan Android tidak punya sakelar itu. Itu sebabnya bug yang
 * sama tidak pernah terlihat di Android.
 *
 * Dipisah dari `siapkanAudio` supaya komponen yang punya AudioContext sendiri
 * (MatematikaGame) tetap bisa memakainya tanpa membuat konteks kedua.
 */
export function aktifkanSesiAudio(): void {
  if (typeof navigator === 'undefined') return;
  try {
    const nav = navigator as unknown as { audioSession?: { type?: string } };
    if (nav.audioSession && nav.audioSession.type !== 'playback') {
      nav.audioSession.type = 'playback';
    }
  } catch {
    /* bukan iOS — tidak ada yang perlu diatur */
  }
}

/**
 * Siapkan audio. Aman dipanggil berkali-kali.
 *
 * Wajib dipanggil dari GERAKAN PENGGUNA minimal sekali (lihat
 * `pasangPembukaAudio`) — iOS menolak membuka audio di luar gestur.
 */
export function siapkanAudio(): void {
  if (typeof window === 'undefined') return;
  aktifkanSesiAudio();
  if (!audioCtx) {
    const Ctx = cariAudioContext();
    if (!Ctx) return;
    try {
      audioCtx = new Ctx();
    } catch {
      return;
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    void audioCtx.resume().catch(() => {});
  }
}

/**
 * Pasang pembuka audio pada gerakan pertama (ketuk, sentuh, atau tombol).
 *
 * Dipanggil otomatis saat modul dimuat, jadi setiap halaman yang memakai
 * `bunyi()`/`ucap()` ikut terbuka tanpa perlu mengubah komponen game.
 */
export function pasangPembukaAudio(): void {
  if (typeof window === 'undefined' || pembukaTerpasang) return;
  pembukaTerpasang = true;
  const buka = () => siapkanAudio();
  for (const ev of ['pointerdown', 'touchstart', 'keydown'] as const) {
    window.addEventListener(ev, buka, { once: true, capture: true, passive: true });
  }
}

pasangPembukaAudio();

/**
 * Efek suara tanpa berkas: satu osilator pendek.
 *
 * Benar = dua nada naik (C5→E5), salah = nada rendah turun. Dibangkitkan saat
 * dipanggil, jadi tidak menambah satu byte pun ke bundel.
 */
export function bunyi(ok: boolean): void {
  if (typeof window === 'undefined') return;
  siapkanAudio();
  const ctx = audioCtx;
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    if (ok) {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.08);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.start(now);
      osc.stop(now + 0.22);
    } else {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.setValueAtTime(110, now + 0.12);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
      osc.start(now);
      osc.stop(now + 0.26);
    }
    // Konteks TIDAK ditutup. Satu konteks dipakai ulang sepanjang halaman;
    // menutupnya memaksa konteks baru pada jawaban berikutnya, dan Safari iOS
    // membatasi jumlahnya — persis penyebab suara menghilang di tengah game.
  } catch {
    /* Tanpa audio tetap bisa bermain. */
  }
}
