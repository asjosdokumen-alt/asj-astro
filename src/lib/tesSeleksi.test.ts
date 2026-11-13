/**
 * tesSeleksi.test.ts — logika dua tes mandiri.
 *
 * YANG DIJAGA
 *   Tes ini tidak menyentuh DOM. Yang diuji adalah hal-hal yang bisa salah
 *   tanpa satu pun error muncul di layar:
 *
 *   1. Keseimbangan bank soal — 10 soal per dimensi, 5 positif + 5 terbalik.
 *      Tanpa keseimbangan itu, "selalu pilih setuju" menghasilkan satu tipe
 *      untuk semua siswa, dan hasilnya terlihat sah.
 *   2. Arah penskoran — soal terbalik harus MENGURANGI, bukan menambah.
 *   3. Kunci plate Ishihara — plate kontrol yang salah membatalkan seluruh
 *      hasil; protan dan deutan harus terbaca berbeda.
 *   4. Rumus Landolt — diameter = 5 × celah, dan naiknya visus mengecilkan
 *      cincin.
 */
import { describe, expect, it } from 'vitest';
import {
  PLATE_ISHIHARA,
  PROFIL_MBTI,
  SOAL_MBTI,
  SUDUT_ARAH,
  TINGKAT_VISUS,
  evaluasiIshihara,
  geometriCincin,
  hitungMbti,
  pilihanPlate,
  simpulkanVisus,
  ukuranLandolt,
  type ArahLandolt,
} from './tesSeleksi';

describe('bank soal MBTI', () => {
  it('berisi 40 soal unik', () => {
    expect(SOAL_MBTI).toHaveLength(40);
    expect(new Set(SOAL_MBTI.map((s) => s.id)).size).toBe(40);
  });

  it('10 soal per dimensi, 5 positif + 5 terbalik', () => {
    for (const d of ['EI', 'SN', 'TF', 'JP'] as const) {
      const soal = SOAL_MBTI.filter((s) => s.dimensi === d);
      expect(soal, `dimensi ${d}`).toHaveLength(10);
      expect(soal.filter((s) => s.arah === 1), `${d} positif`).toHaveLength(5);
      expect(soal.filter((s) => s.arah === -1), `${d} terbalik`).toHaveLength(5);
    }
  });

  it('tidak ada soal kosong', () => {
    for (const s of SOAL_MBTI) expect(s.teks.trim().length).toBeGreaterThan(10);
  });
});

describe('hitungMbti', () => {
  /**
   * Jawaban "sangat setuju pada kutub pertama": +2 untuk soal positif dan -2
   * untuk soal terbalik. Konstanta +2 untuk SEMUA soal justru menghasilkan 50%
   * — itu bukti keseimbangan bank soal, bukan bug, jadi tes ini harus menjawab
   * sesuai arah soal.
   */
  const kutubPertama = () => Object.fromEntries(SOAL_MBTI.map((s) => [s.id, 2 * s.arah]));
  const kutubKedua = () => Object.fromEntries(SOAL_MBTI.map((s) => [s.id, -2 * s.arah]));
  const semua = (nilai: number) => Object.fromEntries(SOAL_MBTI.map((s) => [s.id, nilai]));

  it('menjawab kutub pertama di semua dimensi → ESTJ', () => {
    const h = hitungMbti(kutubPertama());
    expect(h.tipe).toBe('ESTJ');
    expect(h.persentase.E).toBe(100);
    expect(h.persentase.I).toBe(0);
    expect(h.jumlahTerjawab).toBe(40);
  });

  it('menjawab kutub kedua di semua dimensi → INFP', () => {
    const h = hitungMbti(kutubKedua());
    expect(h.tipe).toBe('INFP');
    expect(h.persentase.E).toBe(0);
    expect(h.persentase.I).toBe(100);
  });

  it('konstanta +2 untuk SEMUA soal menghasilkan 50% — bukti soal seimbang', () => {
    const h = hitungMbti(semua(2));
    expect(h.persentase.E).toBe(50);
    expect(h.persentase.S).toBe(50);
    expect(h.persentase.T).toBe(50);
    expect(h.persentase.J).toBe(50);
  });

  it('semua netral menghasilkan 50% dan tipe pertama (ambang >= 50)', () => {
    const h = hitungMbti(semua(0));
    expect(h.persentase.E).toBe(50);
    expect(h.persentase.S).toBe(50);
    expect(h.tipe).toBe('ESTJ');
  });

  /**
   * Soal terbalik HARUS mengubah hasil. Kalau `arah` diabaikan, menjawab +2
   * pada soal ke-2 (yang terbalik) akan menambah E padahal seharusnya
   * mengurangi — dan tes ini menangkapnya lewat selisih persentase.
   */
  it('soal terbalik mengurangi, bukan menambah', () => {
    const dasar = hitungMbti(semua(0));
    const satuTerbalik = hitungMbti({ ...semua(0), 5: 2 }); // id 5 = EI arah -1
    expect(satuTerbalik.persentase.E).toBeLessThan(dasar.persentase.E);
  });

  it('jawaban kosong tidak melempar dan dihitung 0 terjawab', () => {
    const h = hitungMbti({});
    expect(h.jumlahTerjawab).toBe(0);
    expect(h.tipe).toHaveLength(4);
  });

  it('setiap tipe punya profil lengkap', () => {
    for (const t of Object.keys(PROFIL_MBTI)) {
      const p = PROFIL_MBTI[t];
      expect(p.bidang.length, t).toBeGreaterThanOrEqual(3);
      expect(p.mensetsu.length, t).toBeGreaterThan(20);
    }
    expect(Object.keys(PROFIL_MBTI)).toHaveLength(16);
  });
});

describe('plate Ishihara', () => {
  const jawabNormal = () => PLATE_ISHIHARA.map((p) => ({ no: p.no, jawaban: p.normal }));

  it('plate 1 adalah kontrol dengan jawaban 12', () => {
    expect(PLATE_ISHIHARA[0].kategori).toBe('kontrol');
    expect(PLATE_ISHIHARA[0].normal).toBe('12');
  });

  it('nomor plate unik dan berurutan', () => {
    expect(PLATE_ISHIHARA.map((p) => p.no)).toEqual(PLATE_ISHIHARA.map((_, i) => i + 1));
  });

  it('jawaban normal sempurna → NORMAL', () => {
    const h = evaluasiIshihara(jawabNormal());
    expect(h.skor).toBe(PLATE_ISHIHARA.length);
    expect(h.status).toBe('NORMAL');
    expect(h.kontrolBenar).toBe(true);
  });

  it('plate kontrol salah → TIDAK_VALID walau plate lain benar', () => {
    const j = jawabNormal();
    j[0] = { no: 1, jawaban: '99' };
    const h = evaluasiIshihara(j);
    expect(h.kontrolBenar).toBe(false);
    expect(h.status).toBe('TIDAK_VALID');
  });

  it('pola protan → PROTAN', () => {
    const j = jawabNormal();
    for (const p of PLATE_ISHIHARA) {
      if (p.kategori === 'diagnostik' && p.protan) {
        const idx = j.findIndex((x) => x.no === p.no);
        j[idx] = { no: p.no, jawaban: p.protan };
      }
    }
    const h = evaluasiIshihara(j);
    expect(h.status).toBe('PROTAN');
  });

  it('pola deutan → DEUTAN', () => {
    const j = jawabNormal();
    for (const p of PLATE_ISHIHARA) {
      if (p.kategori === 'diagnostik' && p.deutan) {
        const idx = j.findIndex((x) => x.no === p.no);
        j[idx] = { no: p.no, jawaban: p.deutan };
      }
    }
    const h = evaluasiIshihara(j);
    expect(h.status).toBe('DEUTAN');
  });

  it('plate hilang dijawab "TIDAK ADA" tidak dihitung benar', () => {
    const j = jawabNormal();
    const idx = j.findIndex((x) => x.no === 6);
    j[idx] = { no: 6, jawaban: 'TIDAK ADA' };
    const h = evaluasiIshihara(j);
    expect(h.skor).toBe(PLATE_ISHIHARA.length - 1);
    expect(h.status).toBe('NORMAL'); // masih di atas ambang 10/12
  });

  it('semua salah selain kontrol → bukan NORMAL', () => {
    const j = PLATE_ISHIHARA.map((p) => ({ no: p.no, jawaban: p.no === 1 ? p.normal : 'X' }));
    const h = evaluasiIshihara(j);
    expect(h.skor).toBe(1);
    expect(h.status).not.toBe('NORMAL');
  });
});

describe('ukuran Landolt', () => {
  it('diameter = 5 × celah', () => {
    const u = ukuranLandolt(0.5, 0.5, 3.4);
    expect(u.diameterPx / u.celahPx).toBeCloseTo(5, 5);
  });

  it('visus lebih tinggi → cincin lebih kecil', () => {
    const rendah = ukuranLandolt(0.1, 0.5, 3.4);
    const tinggi = ukuranLandolt(1.0, 0.5, 3.4);
    expect(tinggi.diameterPx).toBeLessThan(rendah.diameterPx);
  });

  it('jarak lebih jauh → cincin lebih besar (untuk visus sama)', () => {
    const dekat = ukuranLandolt(0.5, 0.5, 3.4);
    const jauh = ukuranLandolt(0.5, 1.0, 3.4);
    expect(jauh.diameterPx).toBeCloseTo(dekat.diameterPx * 2, 4);
  });

  it('pxPerMm lebih besar → cincin lebih besar', () => {
    const kecil = ukuranLandolt(0.5, 0.5, 3);
    const besar = ukuranLandolt(0.5, 0.5, 6);
    expect(besar.diameterPx).toBeCloseTo(kecil.diameterPx * 2, 4);
  });

  it('nilai mustahil tidak menghasilkan NaN/negatif', () => {
    for (const [v, d, k] of [
      [0, 0, 0],
      [-1, -1, -1],
      [Number.NaN, Number.NaN, Number.NaN],
    ]) {
      const u = ukuranLandolt(v as number, d as number, k as number);
      expect(Number.isFinite(u.diameterPx)).toBe(true);
      expect(u.diameterPx).toBeGreaterThan(0);
    }
  });

  it('level 1,2 di layar HP ditandai terlalu kecil', () => {
    expect(ukuranLandolt(TINGKAT_VISUS[6], 0.5, 3.4).terlaluKecil).toBe(true);
    expect(ukuranLandolt(0.1, 0.5, 3.4).terlaluKecil).toBe(false);
  });
});

describe('pilihan jawaban plate (pilihan ganda)', () => {
  it('setiap plate memberi 4 pilihan, semuanya unik, dan jawabannya ada di dalamnya', () => {
    for (const p of PLATE_ISHIHARA) {
      const opsi = pilihanPlate(p);
      expect(opsi.length, `plate #${p.no}`).toBe(4);
      expect(new Set(opsi).size).toBe(4);
      expect(opsi).toContain(p.normal);
    }
  });

  it('pengecoh menyerupai jawaban: panjang sama, dan berbagi digit', () => {
    /* Pengecoh yang jauh berbeda (`29` vs `74`) membuat pilihan ganda terlalu
       mudah — tesnya lalu mengukur keberanian menebak, bukan penglihatan. */
    for (const p of PLATE_ISHIHARA) {
      const opsi = pilihanPlate(p).filter((o) => o !== p.normal);
      for (const o of opsi) {
        expect(o.length, `plate #${p.no}: ${o}`).toBe(p.normal.length);
        /* Untuk satu digit, "berbagi digit" hanya bisa berarti sama persis —
           kemiripannya datang dari tabel MIRIP, bukan dari posisi. */
        if (p.normal.length < 2) continue;
        const sama = [...o].filter((ch, i) => ch === p.normal[i]).length;
        const dipakai = [...o].filter((ch) => p.normal.includes(ch)).length;
        expect(Math.max(sama, dipakai), `plate #${p.no}: ${o}`).toBeGreaterThan(0);
      }
    }
  });

  it('deterministik: plate yang sama selalu menampilkan urutan yang sama', () => {
    for (const p of PLATE_ISHIHARA) {
      expect(pilihanPlate(p)).toEqual(pilihanPlate(p));
    }
  });

  it('tidak pernah menawarkan "TIDAK ADA" sebagai angka', () => {
    for (const p of PLATE_ISHIHARA) {
      expect(pilihanPlate(p).every((o) => /^\d+$/.test(o))).toBe(true);
    }
  });
});

describe('geometri cincin Landolt — arah celah', () => {
  /** Pusat celah dalam derajat, dihitung ULANG dari dasharray/offset. */
  function pusatCelah(g: { keliling: number; celah: number; dashoffset: number }): number {
    const awal = (((-g.dashoffset + (g.keliling - g.celah)) % g.keliling) + g.keliling) % g.keliling;
    const tengah = (awal + g.celah / 2) % g.keliling;
    return (tengah / g.keliling) * 360;
  }
  const uk = ukuranLandolt(0.5, 0.5, 3.4);

  it('setiap arah menaruh pusat celah TEPAT di sudut yang diminta', () => {
    /* Inilah yang diukur tes ini. Sebelum 2026-11-13 pola dash mulai di jam 3
       dan celah jatuh di UJUNG pola, jadi pusatnya meleset `celah/2` —
       terukur 14° untuk level 0,5, yaitu sepertiga jarak antar pilihan. */
    for (const arah of Object.keys(SUDUT_ARAH) as ArahLandolt[]) {
      const g = geometriCincin(uk.diameterPx, uk.tebalPx, uk.celahPx, arah);
      /* Arah akhir = posisi celah di kerangka cincin (selalu 0 setelah offset)
         DITAMBAH rotasi SVG. Menguji salah satunya saja tidak menguji apa pun:
         rotasi tanpa offset menghasilkan celah 14° meleset. */
      const derajat = (pusatCelah(g) + g.rotasi) % 360;
      const selisih = ((derajat - SUDUT_ARAH[arah]) % 360 + 360) % 360;
      expect(Math.min(selisih, 360 - selisih), `arah ${arah}`).toBeLessThan(0.001);
    }
  });

  it('tanpa dashoffset, celah meleset setengah lebarnya — bug yang dijaga', () => {
    const g = geometriCincin(uk.diameterPx, uk.tebalPx, uk.celahPx, 'KANAN');
    const tanpaOffset = pusatCelah({ ...g, dashoffset: 0 });
    // 360 - (celah/2)/keliling*360 = beberapa derajat SEBELUM kanan.
    expect(tanpaOffset).toBeGreaterThan(340);
    expect(360 - tanpaOffset).toBeGreaterThan(5);
  });

  it('sudut mengikuti arah jarum jam pada sumbu y-ke-bawah (BAWAH = +90)', () => {
    expect(SUDUT_ARAH.KANAN).toBe(0);
    expect(SUDUT_ARAH.BAWAH).toBe(90);
    expect(SUDUT_ARAH.KIRI).toBe(180);
    expect(SUDUT_ARAH.ATAS).toBe(270);
    expect(SUDUT_ARAH.BAWAH_KANAN).toBe(45);
    expect(SUDUT_ARAH.ATAS_KANAN).toBe(315);
  });

  it('celah selebar garis — perbandingan baku optotipe Landolt', () => {
    const g = geometriCincin(uk.diameterPx, uk.tebalPx, uk.celahPx, 'ATAS');
    expect(g.celah).toBeCloseTo(g.tebal, 6);
  });

  it('celah tidak pernah melebihi keliling (dasharray negatif = cincin hilang)', () => {
    const g = geometriCincin(10, 2, 999, 'ATAS');
    expect(g.celah).toBeLessThan(g.keliling);
    const [dash] = g.dasharray.split(' ').map(Number);
    expect(dash).toBeGreaterThan(0);
  });

  it('diameter mustahil tidak menghasilkan NaN/negatif', () => {
    for (const [d, t, c] of [[0, 0, 0], [-5, -5, -5], [Number.NaN, Number.NaN, Number.NaN]]) {
      const g = geometriCincin(d, t, c, 'KANAN');
      expect(Number.isFinite(g.r)).toBe(true);
      expect(g.r).toBeGreaterThan(0);
      expect(Number.isFinite(g.keliling)).toBe(true);
    }
  });
});

describe('simpulkanVisus', () => {
  it('kedua mata ≥ 0,7 → lolos', () => {
    const h = simpulkanVisus(1.0, 0.7);
    expect(h.lolos).toBe(true);
    expect(h.catatan).toContain('0,7');
  });

  it('satu mata di bawah 0,7 → tidak lolos', () => {
    expect(simpulkanVisus(1.0, 0.5).lolos).toBe(false);
  });

  it('0 berarti di bawah ambang ukur, bukan visus nol', () => {
    const h = simpulkanVisus(0, 0.3);
    expect(h.lolos).toBe(false);
    expect(h.catatan).toContain('0,1');
  });
});
