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
  buatPerintah,
  buatPilihan,
  cekGenba,
  kocokKartu,
  kartuBenar,
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
