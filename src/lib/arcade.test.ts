// ==========================================
// TES: logika arcade (game 1 & 2).
//
// Yang diuji sengaja bagian MURNI-nya: perakit perintah, penyusun pilihan, dan
// pemeriksa urutan. Kalau ini benar, komponennya hanya soal tampilan; kalau ini
// salah, layar akan terlihat normal sambil mengajari tata bahasa yang keliru.
// ==========================================
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  GENBA_BARANG,
  GENBA_WARNA,
  GENBA_ZONA,
  COMBO_SOAL,
  SHIFT_GENBA,
  buatPerintah,
  buatPilihan,
  cekGenba,
  kocokKartu,
  kartuBenar,
  perintahDari,
  gelombangShift,
  durasiShift,
  pilihanShift,
  zonaShift,
  zonaAdaptif,
  buatZona,
  poinGenba,
  nilaiShift,
  bintangShift,
  bonusShift,
  skorShift,
  KOMBO_MAKS,
  batasKalimat,
  bonusKalimat,
  ULTIMATE,
  PRESISI_MOD,
  SKOR_MAKS_ULTIMATE,
  bolehUltimate,
  aturanUltimate,
  bonusUltimate,
  digitPresisi,
  kunciPresisi,
  formatSkorPresisi,
  tandaSiswa,
  hitungGenba,
} from './arcade';

/** RNG deterministik: urutan yang sama setiap kali, supaya tes tidak undian. */
const rngDari = (biji: number[]) => {
  let i = 0;
  return () => biji[i++ % biji.length];
};

describe('arcade — perakit perintah Genba', () => {
  it('kalimat memakai partikel yang benar: を untuk objek, に untuk tujuan', () => {
    const p = buatPerintah(rngDari([0]));
    expect(p.jp).toBe(`${GENBA_WARNA[0].jp} ${GENBA_BARANG[0].jp} を ${GENBA_ZONA[0].jp} に おいてください`);
    expect(p.romaji).toContain(' o ');
    expect(p.romaji).toContain(' ni oite kudasai');
  });

  it('setiap kombinasi yang mungkin tetap menghasilkan kalimat utuh', () => {
    /* 6 × 24 × 12 = 1.728 kombinasi; menyapu semuanya jauh lebih murah daripada
       menemukan satu kalimat cacat di tangan siswa. */
    for (let w = 0; w < GENBA_WARNA.length; w++) {
      for (let b = 0; b < GENBA_BARANG.length; b++) {
        for (let z = 0; z < GENBA_ZONA.length; z++) {
          const p = buatPerintah(rngDari([w / GENBA_WARNA.length, b / GENBA_BARANG.length, z / GENBA_ZONA.length]));
          expect(p.jp).toContain('を');
          expect(p.jp).toContain('に');
          expect(p.jp.endsWith('おいてください')).toBe(true);
        }
      }
    }
  });

  it('enam pilihan, unik, diacak (tidak selalu di indeks 0), dan memuat jawaban yang benar', () => {
    const p = buatPerintah(rngDari([0.1, 0.2, 0.3]));
    const kunciBenar = `${p.warna.id}_${p.barang.id}`;
    const opsi = buatPilihan(p, rngDari([0.05, 0.3, 0.6, 0.9, 0.15, 0.45, 0.75, 0.2, 0.4, 0.8]));
    expect(opsi).toHaveLength(6);
    expect(new Set(opsi.map((o) => o.kunci)).size).toBe(6);
    expect(opsi.some((o) => o.kunci === kunciBenar)).toBe(true);
    /* Regresi bug lama: jawaban benar tidak boleh selalu terparkir di indeks 0. */
    const posisi = [0.15, 0.35, 0.65, 0.85].map((s) =>
      buatPilihan(p, rngDari([s, s * 0.7, (s + 0.3) % 1, (s + 0.6) % 1, (s + 0.1) % 1])).findIndex(
        (o) => o.kunci === kunciBenar,
      ),
    );
    expect(new Set(posisi).size).toBeGreaterThan(1);
  });

  it('cekGenba menuntut barang DAN lokasi benar — bukan salah satu', () => {
    const p = buatPerintah(rngDari([0, 0, 0]));
    const kunci = `${p.warna.id}_${p.barang.id}`;
    expect(cekGenba(p, kunci, p.zona.id)).toBe(true);
    /* Barang benar, rak salah: ini kesalahan yang paling sering terjadi, dan
       harus dihitung salah. */
    const zonaLain = GENBA_ZONA.find((z) => z.id !== p.zona.id);
    expect(zonaLain).toBeTruthy();
    expect(cekGenba(p, kunci, zonaLain?.id ?? '')).toBe(false);
    expect(cekGenba(p, 'shiroi_kutsu', p.zona.id)).toBe(false);
  });
});

describe('arcade — Combo Kalimat', () => {
  it('bank soal kaya (minimal 35 soal: normal + hell), tiap soal punya urutan dan jebakan', () => {
    expect(COMBO_SOAL.length).toBeGreaterThanOrEqual(35);
    expect(COMBO_SOAL.filter((s) => !s.hell).length).toBeGreaterThanOrEqual(25);
    expect(COMBO_SOAL.filter((s) => s.hell).length).toBeGreaterThanOrEqual(10);
    for (const s of COMBO_SOAL) {
      expect(s.urutan.length).toBeGreaterThan(3);
      expect(s.jebakan.length).toBeGreaterThan(0);
      expect(s.indo.length).toBeGreaterThan(5);
    }
  });

  it('setiap soal diakhiri kata kerja (predikat di akhir)', () => {
    for (const s of COMBO_SOAL) {
      expect(s.urutan[s.urutan.length - 1].jenis).toBe('verb');
    }
  });

  it('kocokKartu memuat SEMUA kartu, tanpa menambah atau menghilangkan', () => {
    for (const s of COMBO_SOAL) {
      const kocok = kocokKartu(s, rngDari([0.1, 0.5, 0.9, 0.3]));
      expect(kocok).toHaveLength(s.urutan.length + s.jebakan.length);
      const teks = kocok.map((k) => k.jp).sort();
      const asli = [...s.urutan, ...s.jebakan].map((k) => k.jp).sort();
      expect(teks).toEqual(asli);
    }
  });

  it('kartuBenar hanya menerima kartu pada urutan yang sedang diminta di SEMUA soal', () => {
    const s0 = COMBO_SOAL[0];
    expect(kartuBenar(s0, 0, s0.urutan[0])).toBe(true);
    expect(kartuBenar(s0, 0, s0.urutan[1])).toBe(false);
    /* Kartu jebakan tidak pernah sah, di posisi mana pun, pada soal mana pun. */
    for (const s of COMBO_SOAL) {
      for (let i = 0; i < s.urutan.length; i++) {
        for (const j of s.jebakan) {
          expect(kartuBenar(s, i, j), `${s.indo}: jebakan "${j.jp}" bentrok di posisi ${i}`).toBe(false);
        }
      }
    }
  });

  it('melewati akhir urutan tidak pernah dianggap benar', () => {
    const s = COMBO_SOAL[0];
    expect(kartuBenar(s, s.urutan.length, s.urutan[0])).toBe(false);
  });
});

/* ── Audio game di iOS (2026-11-05) ─────────────────────────────────────────
 * Keluhan pemilik: "suara di game rush tidak keluar di iPhone, di Android
 * normal". Penyebabnya bukan volume, tapi tiga aturan iOS yang tidak ada di
 * Android:
 *   1. AudioContext baru lahir `suspended`; tanpa `resume()` ia diam.
 *   2. Safari membatasi jumlah AudioContext — versi lama membuat SATU per
 *      jawaban lalu menutupnya 400 ms kemudian, jadi konteks berikutnya gagal.
 *   3. Sakelar senyap iPhone membisukan Web Audio kecuali sesi audionya
 *      `playback` (Safari 16.4+).
 */
class KonteksPalsu {
  static dibuat = 0;
  static terakhir: KonteksPalsu | null = null;
  state = 'suspended';
  currentTime = 0;
  destination = {};
  resume = vi.fn(async () => { this.state = 'running'; });
  close = vi.fn(async () => {});
  constructor() { KonteksPalsu.dibuat++; KonteksPalsu.terakhir = this; }
  createOscillator() {
    return {
      type: 'sine',
      frequency: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
  }
  createGain() {
    return {
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
    };
  }
}

describe('bunyi() — satu AudioContext untuk seluruh halaman', () => {
  beforeEach(() => {
    vi.resetModules();
    KonteksPalsu.dibuat = 0;
    KonteksPalsu.terakhir = null;
    (window as unknown as { AudioContext?: unknown }).AudioContext = KonteksPalsu;
    delete (navigator as unknown as { audioSession?: unknown }).audioSession;
  });

  it('tiga jawaban berturut-turut memakai SATU konteks, bukan tiga', async () => {
    const { bunyi } = await import('./tts');
    bunyi(true);
    bunyi(false);
    bunyi(true);
    expect(KonteksPalsu.dibuat).toBe(1);
  });

  it('konteks TIDAK ditutup setelah berbunyi (dulu ditutup 400 ms)', async () => {
    vi.useFakeTimers();
    try {
      const { bunyi } = await import('./tts');
      bunyi(true);
      vi.advanceTimersByTime(1000);
      expect(KonteksPalsu.terakhir?.close).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('konteks suspended di-resume sebelum berbunyi', async () => {
    const { bunyi } = await import('./tts');
    bunyi(true);
    expect(KonteksPalsu.terakhir?.state).toBe('running');
    expect(KonteksPalsu.terakhir?.resume).toHaveBeenCalled();
  });

  it('sesi audio dinyatakan playback supaya sakelar senyap iPhone tidak membisukan', async () => {
    const nav = navigator as unknown as { audioSession?: { type?: string } };
    nav.audioSession = { type: 'ambient' };
    const { siapkanAudio } = await import('./tts');
    siapkanAudio();
    expect(nav.audioSession.type).toBe('playback');
  });
});

/* ── Cakupan bab 1–50 (2026-11-05) ─────────────────────────────────────────
 * Pemilik: "permainan sudah mantap tapi takut kena soal yang itu-itu saja".
 * Bank lama 47 soal hanya menyentuh bab 4–35. Blok baru menambah 2 soal per
 * bab 1–50 + 10 Hell, dan tes ini menjaga agar tidak ada bab yang hilang lagi
 * saat bank dirapikan.
 */
describe('arcade — cakupan bank soal', () => {
  it('setiap bab 1–50 punya minimal satu soal', () => {
    const bab = new Set<number>();
    for (const s of COMBO_SOAL) {
      const m = s.bab.match(/Bab\s+(\d+)/);
      if (m) bab.add(Number(m[1]));
    }
    const hilang: number[] = [];
    for (let i = 1; i <= 50; i++) if (!bab.has(i)) hilang.push(i);
    expect(hilang).toEqual([]);
  });

  it('tidak ada kalimat Indonesia yang kembar', () => {
    const indo = COMBO_SOAL.map((s) => s.indo);
    expect(new Set(indo).size).toBe(indo.length);
  });

  it('tidak ada kartu kembar di dalam satu kalimat', () => {
    // Kartu dinilai berdasarkan teksnya (`kartuBenar` membandingkan `jp`), jadi
    // dua kartu berteks sama membuat posisi kedua menerima kartu yang salah.
    for (const s of COMBO_SOAL) {
      const jp = s.urutan.map((k) => k.jp);
      expect(new Set(jp).size, `${s.indo}: kartu kembar`).toBe(jp.length);
    }
  });
});

describe('arcade — struktur shift Genba', () => {
  it('tiga tingkat, dan tiap tingkat punya kurva sendiri', () => {
    /* Yang dijaga: setiap tingkat WAJIB memendekkan waktu antar gelombang dan
       tidak pernah menambah nyawa seiring naiknya tingkat. Tanpa invarian ini,
       "veteran" bisa jadi lebih mudah daripada "reguler" tanpa satu pun error. */
    const tingkat = Object.values(SHIFT_GENBA);
    expect(tingkat).toHaveLength(3);
    for (const a of tingkat) {
      expect(a.durasi.length).toBe(a.pilihan.length);
      expect(a.durasi.length).toBe(a.zona.length);
      expect(a.durasi[a.durasi.length - 1]).toBeLessThan(a.durasi[0]);
      for (let i = 1; i < a.durasi.length; i++) expect(a.durasi[i]).toBeLessThan(a.durasi[i - 1]);
      expect(a.pesanan % 4).toBe(0); // tiap gelombang tepat 4 pesanan
    }
    expect(SHIFT_GENBA.veteran.nyawa).toBeLessThan(SHIFT_GENBA.reguler.nyawa);
    expect(SHIFT_GENBA.veteran.pengali).toBeGreaterThan(SHIFT_GENBA.reguler.pengali);
  });

  it('gelombang berganti tiap 4 pesanan dan berhenti di gelombang terakhir', () => {
    const a = SHIFT_GENBA.reguler;
    const gelombang = Array.from({ length: a.pesanan }, (_, i) => gelombangShift(a, i));
    expect(gelombang).toEqual([0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2]);
    /* Pesanan ke-99 tidak boleh menghasilkan `undefined` — timer tanpa angka
       berarti `NaN`, dan `NaN <= 0` selalu false: sumbu tidak pernah habis. */
    expect(durasiShift(a, 99)).toBe(a.durasi[a.durasi.length - 1]);
    expect(pilihanShift(a, 99)).toBe(a.pilihan[a.pilihan.length - 1]);
    expect(durasiShift(a, 0)).toBe(8000);
    expect(durasiShift(a, 11)).toBe(6000);
    expect(pilihanShift(a, 0)).toBe(6);
    expect(pilihanShift(a, 11)).toBe(9);
    expect(zonaShift(a, 0)).toBe(4);
    expect(zonaShift(a, 11)).toBe(6);
  });

  it('jumlah rak MENGIKUTI kombo — bukan angka tetap 4', () => {
    const r = SHIFT_GENBA.reguler;
    expect(zonaAdaptif(r, 0, 0)).toBe(4);
    expect(zonaAdaptif(r, 0, 3)).toBe(4);
    expect(zonaAdaptif(r, 0, 4)).toBe(6);
    expect(zonaAdaptif(r, 0, 7)).toBe(6);
    expect(zonaAdaptif(r, 0, 8)).toBe(8);
    /* Plafon: 8, bukan 10. Di atas 8 grid menambah baris dan meja kerja
       terdorong ke bawah lipatan lagi. */
    expect(zonaAdaptif(r, 0, 20)).toBe(8);
    expect(zonaAdaptif(SHIFT_GENBA.magang, 0, 20)).toBe(6);
    expect(zonaAdaptif(SHIFT_GENBA.veteran, 0, 0)).toBe(6);
    expect(zonaAdaptif(SHIFT_GENBA.veteran, 0, 4)).toBe(8);
    /* Gelombang lanjut menaikkan DASAR-nya juga: 6 di gelombang 3. */
    expect(zonaAdaptif(r, 11, 0)).toBe(6);
  });

  it('rak yang ditampilkan: tepat sejumlah gelombang, unik, dan memuat jawaban', () => {
    const p = buatPerintah(rngDari([0.1, 0.2, 0.3]));
    for (const n of [4, 6]) {
      const rak = buatZona(p, n, rngDari([0.05, 0.3, 0.6, 0.9, 0.15, 0.45]));
      expect(rak).toHaveLength(n);
      expect(new Set(rak.map((z) => z.id)).size).toBe(n);
      expect(rak.some((z) => z.id === p.zona.id)).toBe(true);
    }
    /* Jawaban benar tidak boleh selalu di indeks 0 — pemain akan menghafal
       posisi, bukan membaca perintah. */
    const posisi = [0.1, 0.4, 0.7, 0.9].map((s) =>
      buatZona(p, 4, rngDari([s, (s + 0.3) % 1, (s + 0.6) % 1, (s + 0.1) % 1])).findIndex(
        (z) => z.id === p.zona.id,
      ),
    );
    expect(new Set(posisi).size).toBeGreaterThan(1);
    /* Jumlah di luar jangkauan dijepit, bukan menghasilkan array kosong. */
    expect(buatZona(p, 1).length).toBe(2);
    expect(buatZona(p, 99).length).toBe(GENBA_ZONA.length);
  });

  it('perintahDari merakit kalimat yang sama dan menolak ID asing', () => {
    const p = perintahDari('akai', 'hako', 'ue');
    expect(p?.jp).toBe('あかい はこ を うえ の たな に おいてください');
    /* Entri catatan lama tidak punya ID sama sekali; `perintahDari` harus
       mengembalikan null supaya pemanggil melewatinya, bukan melempar. */
    expect(perintahDari('', '', '')).toBeNull();
    expect(perintahDari('akai', 'hako', 'bukan-zona')).toBeNull();
  });

  it('buatPilihan menghormati jumlah yang diminta, tetap unik dan memuat jawaban', () => {
    const p = buatPerintah(rngDari([0.1, 0.2, 0.3]));
    const kunci = `${p.warna.id}_${p.barang.id}`;
    /* RNG di sini harus BENAR-BENAR beragam: `rngDari` memutar daftar pendek,
       dan dengan daftar sependek itu kombinasi warna×barang yang unik habis
       sebelum sembilan pilihan — kegagalannya akan terbaca seperti bug
       `buatPilihan`, padahal fixture-nya yang miskin. */
    const rngLcg = (biji: number) => {
      let s = biji >>> 0;
      return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
      };
    };
    for (const n of [4, 6, 9]) {
      const opsi = buatPilihan(p, rngLcg(7 + n), n);
      expect(opsi).toHaveLength(n);
      expect(new Set(opsi.map((o) => o.kunci)).size).toBe(n);
      expect(opsi.some((o) => o.kunci === kunci)).toBe(true);
    }
  });

  it('poin: bonus kecepatan berlaku sejak jawaban PERTAMA, pengali bertingkat', () => {
    /* Regresi yang dijaga: dulu `bonusCepat` hanya diberikan bila kombo >= 2,
       sehingga jawaban cepat pertama bernilai 100 dan kedua 150.
       Sejak skor dihitung ulang di server (2026-11-16), argumen pertama adalah
       MILIDETIK sisa waktu dan yang kedua batas waktu pesanan itu — persen
       yang dibulatkan tidak cukup presisi untuk diputar ulang. `batas 100`
       di sini menjaga angka lama tetap bermakna. */
    expect(poinGenba(100, 100, 1)).toEqual({ tambah: 150, bonusCepat: 50, pengali: 1 });
    expect(poinGenba(0, 100, 1)).toEqual({ tambah: 100, bonusCepat: 0, pengali: 1 });
    expect(poinGenba(100, 100, 4).tambah).toBe(150); // belum fever
    expect(poinGenba(100, 100, 5)).toEqual({ tambah: 300, bonusCepat: 50, pengali: 2 });
    expect(poinGenba(100, 100, 9).pengali).toBe(2);
    expect(poinGenba(100, 100, 10)).toEqual({ tambah: 450, bonusCepat: 50, pengali: 3 });
    /* Batas: kombo 50 tidak boleh memberi ×5. Skor harus tumbuh linear. */
    expect(poinGenba(100, 100, 50).pengali).toBe(3);
    /* Nilai di luar rentang (timer yang dihitung ulang) tidak boleh melewati 50. */
    expect(poinGenba(140, 100, 1).bonusCepat).toBe(50);
    expect(poinGenba(-20, 100, 1).bonusCepat).toBe(0);
  });

  it('poin: milidetik, bukan persen — dua sisa waktu yang sama persennya bisa beda poin', () => {
    /* 6.400 ms dari 8.000 ms = 80% → bonus 40. Kalau fungsi ini masih memakai
       persen bulat, server tidak akan bisa memutar ulang skor klien dan
       selisih 1 poin akan menolak kiriman yang sah. */
    expect(poinGenba(6400, 8000, 1)).toEqual({ tambah: 140, bonusCepat: 40, pengali: 1 });
    expect(poinGenba(8000, 8000, 1).tambah).toBe(150);
    expect(poinGenba(0, 8000, 1).tambah).toBe(100);
    /* Batas 0 (gelombang yang salah konfigurasi) tidak boleh menghasilkan NaN. */
    expect(Number.isFinite(poinGenba(0, 0, 1).tambah)).toBe(true);
  });

  it('nilai shift menuntut selesai, akurasi, DAN kecepatan', () => {
    expect(nilaiShift({ selesai: false, benar: 11, salah: 1, sisaRata: 90 })).toBe('D');
    expect(nilaiShift({ selesai: true, benar: 12, salah: 0, sisaRata: 60 })).toBe('S');
    /* Sempurna tapi lambat BUKAN S: menunggu sumbu habis tidak boleh menang. */
    expect(nilaiShift({ selesai: true, benar: 12, salah: 0, sisaRata: 20 })).toBe('B');
    expect(nilaiShift({ selesai: true, benar: 11, salah: 1, sisaRata: 40 })).toBe('A');
    expect(nilaiShift({ selesai: true, benar: 9, salah: 3, sisaRata: 20 })).toBe('B');
    expect(nilaiShift({ selesai: true, benar: 6, salah: 6, sisaRata: 20 })).toBe('C');
    expect(bintangShift('S')).toBe(3);
    expect(bintangShift('A')).toBe(2);
    expect(bintangShift('B')).toBe(1);
    expect(bintangShift('C')).toBe(0);
    expect(bintangShift('D')).toBe(0);
  });

  it('skor shift: bonus dan pengali tingkat hanya bila selesai', () => {
    const reguler = SHIFT_GENBA.reguler;
    const veteran = SHIFT_GENBA.veteran;
    expect(bonusShift(reguler)).toBe(1200);
    expect(skorShift(3000, reguler, true)).toBe(4200);
    expect(skorShift(3000, reguler, false)).toBe(3000);
    /* Level lebih sulit harus membayar lebih — kalau tidak, papan peringkat
       bersama selalu dimenangkan pemain level termudah. */
    expect(skorShift(3000, veteran, true)).toBe(Math.round((3000 + 1200) * 1.5));
  });
});

describe('arcade — ekonomi Combo Kalimat', () => {
  it('batas waktu tumbuh bersama panjang kalimat', () => {
    const pendek = COMBO_SOAL.find((s) => s.urutan.length === 5);
    const panjang = COMBO_SOAL.find((s) => s.urutan.length >= 10);
    expect(pendek).toBeTruthy();
    expect(panjang).toBeTruthy();
    if (!pendek || !panjang) return;
    expect(batasKalimat(pendek)).toBe((4 + 15) * 1000);
    expect(batasKalimat(panjang)).toBeGreaterThan(batasKalimat(pendek));
  });

  it('bonus kalimat: level lebih sulit dan sisa waktu menaikkan bayaran', () => {
    const s = COMBO_SOAL[0];
    expect(bonusKalimat(s, 100, 'normal')).toBeGreaterThan(bonusKalimat(s, 0, 'normal'));
    expect(bonusKalimat(s, 50, 'sulit')).toBeGreaterThan(bonusKalimat(s, 50, 'normal'));
    expect(bonusKalimat(s, 50, 'hell')).toBeGreaterThan(bonusKalimat(s, 50, 'sulit'));
    /* Sisa waktu di luar 0–100 tidak boleh menghasilkan bonus negatif. */
    expect(bonusKalimat(s, -50, 'normal')).toBeGreaterThanOrEqual(100);
    expect(bonusKalimat(s, 500, 'normal')).toBe(bonusKalimat(s, 100, 'normal'));
  });

  it('pengali kombo berhenti di batas, bukan tumbuh tanpa akhir', () => {
    expect(KOMBO_MAKS).toBe(10);
  });
});

/* ── ULTIMATE LOOP ──────────────────────────────────────────────────────────
 * Tes ini sengaja ditaruh di berkas yang SUDAH ADA: menambah berkas baru di
 * `src/` menggeser empat inventori beku indexer (R15), sedangkan menambah
 * blok tes di sini hanya menambah dua nama impor.
 */
describe('arcade — Ultimate Loop: S adalah gerbang, bukan plafon', () => {
  const dasar = SHIFT_GENBA.veteran;

  it('hanya shift selesai bernilai S yang membuka gerbang', () => {
    expect(bolehUltimate('S', true)).toBe(true);
    expect(bolehUltimate('A', true)).toBe(false);
    expect(bolehUltimate('B', true)).toBe(false);
    expect(bolehUltimate('D', true)).toBe(false);
    /* Nyawa habis tidak boleh membuka loop walau nilainya S (mustahil, tapi
       penjaga ini murah dan mencegah state yang setengah selesai). */
    expect(bolehUltimate('S', false)).toBe(false);
  });

  it('kesulitan naik per gelombang, tapi selalu berhenti di plafon', () => {
    const g0 = aturanUltimate(dasar, 0);
    const g1 = aturanUltimate(dasar, 1);
    const g2 = aturanUltimate(dasar, 2);
    expect(g1.durasiMs).toBeLessThan(g0.durasiMs);
    expect(g2.zona).toBeGreaterThan(g0.zona);
    for (const g of [g0, g1, g2, aturanUltimate(dasar, 50), aturanUltimate(dasar, 500)]) {
      expect(g.durasiMs).toBeGreaterThanOrEqual(ULTIMATE.durasiMin);
      expect(g.pilihan).toBeLessThanOrEqual(ULTIMATE.pilihanMaks);
      expect(g.zona).toBeLessThanOrEqual(ULTIMATE.zonaMaks);
      expect(g.kecepatanTts).toBeLessThanOrEqual(ULTIMATE.kecepatanTtsMaks);
    }
    /* Input rusak tidak boleh menghasilkan waktu negatif atau NaN. */
    expect(aturanUltimate(dasar, Number.NaN).durasiMs).toBeGreaterThan(0);
    expect(aturanUltimate(dasar, -7).gelombang).toBe(0);
  });

  it('bayaran gelombang tumbuh tanpa akhir, sehingga skor tidak punya plafon', () => {
    const b0 = bonusUltimate(0, 4);
    const b1 = bonusUltimate(1, 4);
    const b2 = bonusUltimate(2, 4);
    expect(b1).toBeGreaterThan(b0);
    expect(b2).toBeGreaterThan(b1);
    expect(bonusUltimate(100, 4)).toBeGreaterThan(b2);
    /* Tidak boleh meledak kuadratik liar: gelombang 100 masih di bawah batas
       server, jadi pemain yang benar-benar bertahan tidak ditolak DB. */
    let total = skorShift(6600, dasar, true);
    for (let w = 0; w < 100; w++) total += bonusUltimate(w, 4) + 4 * 150;
    expect(total).toBeLessThan(SKOR_MAKS_ULTIMATE);
    expect(bonusUltimate(Number.NaN, Number.NaN)).toBeGreaterThanOrEqual(0);
  });

  it('digit presisi berasal dari milidetik, bukan angka acak', () => {
    expect(PRESISI_MOD).toBe(10_000);
    expect(digitPresisi(3712)).toBe(3712);
    expect(digitPresisi(13_712)).toBe(3712); // modulus, tidak clamp → tidak jenuh
    expect(digitPresisi(0)).toBe(0);
    expect(digitPresisi(-5)).toBe(0);
    expect(digitPresisi(Number.NaN)).toBe(0);
    /* Dua reaksi yang berbeda 1 ms HARUS menghasilkan digit berbeda. */
    expect(digitPresisi(40_001)).not.toBe(digitPresisi(40_002));
  });

  it('dua siswa sempurna tidak bisa menempati kunci urut yang sama', () => {
    const skorSama = 6600;
    const a = kunciPresisi(skorSama, digitPresisi(31_111));
    const b = kunciPresisi(skorSama, digitPresisi(31_112));
    expect(a).not.toBe(b);
    expect(b).toBeGreaterThan(a);
    /* Skor lebih tinggi selalu menang, berapa pun digit presisi lawan. */
    expect(kunciPresisi(skorSama + 1, 0)).toBeGreaterThan(kunciPresisi(skorSama, 9999));
    expect(formatSkorPresisi(skorSama, 3712)).toBe('6.600,3712');
    expect(formatSkorPresisi(skorSama, 0)).toBe('6.600,0000');
  });

  it('tanda siswa deterministik dan berbeda untuk nomor berbeda', () => {
    expect(tandaSiswa('081234567890')).toBe(tandaSiswa('081234567890'));
    expect(tandaSiswa('081234567890')).not.toBe(tandaSiswa('081234567891'));
  });
});

/* ── REPLAY: skor Genba dihitung ulang dari ronde ───────────────────────────
 * KENAPA ADA
 *   Sampai 2026-11-15 papan peringkat menerima angka apa pun dari klien; batas
 *   1 juta hanya menolak kiriman mustahil. Replay ini membuat skor menjadi
 *   FUNGSI dari urutan jawaban, bukan dari angka yang diklaim.
 *
 * YANG TIDAK DIKLAIM
 *   Ini bukan anti-curang penuh: klien yang dimodifikasi masih bisa mengaku
 *   "12 jawaban benar dalam 0 ms". Yang hilang adalah kemampuan mengirim angka
 *   arbitrer (mis. 999.999) tanpa memalsukan satu ronde pun. Penjagaan
 *   sesungguhnya menuntut soal yang diterbitkan server.
 */
describe('arcade — hitungGenba: replay ronde menjadi skor', () => {
  /** [benar?, sisaMs] — bentuk yang sama dengan yang dikirim ke server. */
  const r = (benar: boolean, sisaMs: number): [number, number] => [benar ? 1 : 0, sisaMs];

  it('12 pesanan sempurna di reguler = 4.650 dengan presisi 4.000', () => {
    /* Dihitung tangan, bukan disalin dari keluaran fungsi:
       gelombang 1 (8 dtk) 4×150 = 600 · gelombang 2 (7 dtk, ×2) 4×300 = 1.200 ·
       gelombang 3 (6 dtk) kombo 9 = 300 lalu kombo 10–12 = 3×450 = 1.350.
       Jumlah 3.450; `skorShift` menambah bonus 100×12 lalu ×1 = 4.650.
       Presisi = 4×8000 + 4×7000 + 4×6000 = 84.000 ms → 4 digit terakhir 4.000. */
    const ronde = Array.from({ length: 12 }, (_, i) =>
      r(true, [8000, 8000, 8000, 8000, 7000, 7000, 7000, 7000, 6000, 6000, 6000, 6000][i]),
    );
    const h = hitungGenba('reguler', ronde);
    expect(h).not.toBeNull();
    expect(h?.skor).toBe(4650);
    expect(h?.presisi).toBe(4000);
    expect(h?.benar).toBe(12);
    expect(h?.salah).toBe(0);
    expect(h?.loop).toBe(0);
    /* Belum masuk loop: nomor gelombang yang dimainkan juga 0. */
    expect(h?.loopDimainkan).toBe(0);
    expect(h?.selesai).toBe(true);
    expect(h?.nilai).toBe('S');
  });

  it('jawaban salah memutus kombo, mengurangi nyawa, dan tidak menambah skor', () => {
    const h = hitungGenba('reguler', [r(true, 8000), r(true, 8000), r(false, 0), r(true, 8000)]);
    expect(h?.skor).toBe(450);
    expect(h?.benar).toBe(3);
    expect(h?.salah).toBe(1);
    /* Nyawa reguler 3 → satu kesalahan belum mengakhiri run. */
    expect(h?.berhenti).toBe(false);
    expect(h?.selesai).toBe(false);
    /* Kombo direset: jawaban benar sesudah salah kembali ×1. */
    expect(h?.pesananAkhir).toBe(3);
  });

  it('nyawa habis mengakhiri run TANPA bonus shift', () => {
    const h = hitungGenba('veteran', [r(false, 0), r(false, 0)]);
    expect(h?.skor).toBe(0);
    expect(h?.berhenti).toBe(true);
    expect(h?.selesai).toBe(false);
    expect(h?.nilai).toBe('D');
  });

  it('gelombang Ultimate Loop menambah bonus, bukan skorShift kedua', () => {
    /* 12 sempurna (4.650) + gelombang 0 (batas 6.000 ms, 4×150 + bonus 200)
       + 1 pesanan gelombang 1 (batas 5.750 ms, kombo 1 → 150) = 5.600.
       Presisi 84.000 + 4×6.000 + 5.750 = 113.750 → 3.750. */
    const ronde = [
      ...Array.from({ length: 12 }, (_, i) =>
        r(true, [8000, 8000, 8000, 8000, 7000, 7000, 7000, 7000, 6000, 6000, 6000, 6000][i]),
      ),
      r(true, 6000),
      r(true, 6000),
      r(true, 6000),
      r(true, 6000),
      r(true, 5750),
    ];
    const h = hitungGenba('reguler', ronde);
    expect(h?.skor).toBe(5600);
    expect(h?.presisi).toBe(3750);
    expect(h?.loop).toBe(1);
    expect(h?.loopDimainkan).toBe(2);
    expect(h?.benar).toBe(17);
    expect(h?.pesananAkhir).toBe(1);
    /* Run belum berakhir: pemain masih di gelombang 1. */
    expect(h?.berhenti).toBe(false);
  });

  it('gugur di gelombang loop PERTAMA: loop 0 tuntas, tapi gelombang 1 dimainkan', () => {
    /* Kasus yang paling sering terjadi di Ultimate Loop, dan yang paling mudah
       salah dibandingkan: klien mengirim `loop: 1` (gelombang berjalan),
       sedangkan gelombang yang TUNTAS masih 0. Pemeriksa konsistensi server
       harus memakai `loopDimainkan`, bukan `loop`. */
    const ronde = [
      ...Array.from({ length: 12 }, (_, i) =>
        r(true, [8000, 8000, 8000, 8000, 7000, 7000, 7000, 7000, 6000, 6000, 6000, 6000][i]),
      ),
      r(true, 6000),
      r(false, 0),
    ];
    const h = hitungGenba('reguler', ronde);
    expect(h?.loop).toBe(0);
    expect(h?.loopDimainkan).toBe(1);
    expect(h?.berhenti).toBe(true);
    expect(h?.selesai).toBe(true);
    /* Satu pesanan benar di gelombang itu, lalu nyawa (1) habis. */
    expect(h?.pesananAkhir).toBe(1);
    expect(h?.benar).toBe(13);
  });

  it('sisa waktu di luar batas dijepit, bukan dipercaya', () => {
    const h = hitungGenba('reguler', [r(true, 9_999_999), r(true, -500)]);
    /* 9.999.999 dijepit ke 8.000 → 150; −500 dijepit ke 0 → 100. */
    expect(h?.skor).toBe(250);
    expect(h?.presisi).toBe(8000);
  });

  it('ronde kosong/rusak ditolak, bukan menghasilkan skor 0 yang tampak sah', () => {
    expect(hitungGenba('reguler', [])).toBeNull();
    expect(hitungGenba('reguler', 'bukan array')).toBeNull();
    expect(hitungGenba('reguler', [[1]])).toBeNull();
    expect(hitungGenba('reguler', [['1', 8000]])).toBeNull();
    expect(hitungGenba('reguler', [[1, Number.NaN]])).toBeNull();
    /* Nama tingkat yang tidak dikenal tidak boleh diam-diam jadi reguler. */
    expect(hitungGenba('dewa', [r(true, 8000)])).toBeNull();
    /* Batas ukuran: kiriman raksasa ditolak sebelum memakan CPU fungsi. */
    expect(hitungGenba('reguler', Array.from({ length: 4001 }, () => r(true, 0)))).toBeNull();
  });

  it('deterministik: ronde yang sama selalu menghasilkan skor yang sama', () => {
    const ronde = [r(true, 7311), r(true, 6222), r(false, 0), r(true, 5111)];
    expect(hitungGenba('magang', ronde)).toEqual(hitungGenba('magang', ronde));
  });
});
