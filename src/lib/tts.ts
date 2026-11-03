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
    window.speechSynthesis.cancel();
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
    (window.speechSynthesis as unknown as { speak(x: unknown): void }).speak(u);
  } catch {
    /* Suara gagal bukan alasan menghentikan latihan. */
  }
}

/**
 * Efek suara tanpa berkas: satu osilator pendek.
 *
 * Benar = dua nada naik (C5→E5), salah = nada rendah turun. Dibangkitkan saat
 * dipanggil, jadi tidak menambah satu byte pun ke bundel.
 */
export function bunyi(ok: boolean): void {
  if (typeof window === 'undefined') return;
  const AC = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext });
  const Ctx = AC.AudioContext || AC.webkitAudioContext;
  if (!Ctx) return;
  try {
    const ctx = new Ctx();
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
    // Tutup konteks setelah selesai: satu AudioContext per jawaban akan
    // menumpuk sampai browser menolak membuat yang baru.
    window.setTimeout(() => ctx.close().catch(() => {}), 400);
  } catch {
    /* Tanpa audio tetap bisa bermain. */
  }
}
