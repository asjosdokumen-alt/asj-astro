// ==========================================
// TES: logika arcade (game 1 & 2).
//
// Yang diuji sengaja bagian MURNI-nya: perakit perintah, penyusun pilihan, dan
// pemeriksa urutan. Kalau ini benar, komponennya hanya soal tampilan; kalau ini
// salah, layar akan terlihat normal sambil mengajari tata bahasa yang keliru.
// ==========================================
import { describe, it, expect } from 'vitest';
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
