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
       sehingga jawaban cepat pertama bernilai 100 dan kedua 150. */
    expect(poinGenba(100, 1)).toEqual({ tambah: 150, bonusCepat: 50, pengali: 1 });
    expect(poinGenba(0, 1)).toEqual({ tambah: 100, bonusCepat: 0, pengali: 1 });
    expect(poinGenba(100, 4).tambah).toBe(150); // belum fever
    expect(poinGenba(100, 5)).toEqual({ tambah: 300, bonusCepat: 50, pengali: 2 });
    expect(poinGenba(100, 9).pengali).toBe(2);
    expect(poinGenba(100, 10)).toEqual({ tambah: 450, bonusCepat: 50, pengali: 3 });
    /* Batas: kombo 50 tidak boleh memberi ×5. Skor harus tumbuh linear. */
    expect(poinGenba(100, 50).pengali).toBe(3);
    /* Nilai di luar 0–100 (timer yang dihitung ulang) tidak boleh melewati 50. */
    expect(poinGenba(140, 1).bonusCepat).toBe(50);
    expect(poinGenba(-20, 1).bonusCepat).toBe(0);
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
