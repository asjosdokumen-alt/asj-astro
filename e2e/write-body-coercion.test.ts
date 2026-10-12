// ==========================================
// TESTS: batas TULIS — bentuk nilai yang disimpan dirapikan di satu tempat.
//
// KENAPA DI `e2e/`: tier `e2e` hanya menghitung mjs/cjs/js, jadi suite `.ts` di
// sini tidak menggerakkan counter beku (lihat `e2e/date-only-normalization.test.ts`).
//
// Dua cacat dengan BENTUK yang sama, keduanya ditemukan dari data nyata dan
// keduanya berarti "dropdown tidak akan pernah cocok dengan baris ini":
//
//   1. GOLONGAN DARAH (permintaan pemilik 2026-10-12)
//      "golongan darah sekarang tolong perbanyak kategorinya jgn a b ab o
//       tambahin + nya juga"
//      DIUKUR atas DB live `gdwvffmevwtwnzrapjwy` (`master_database_candidate`,
//      234 baris) — daftar yang ditawarkan form hanya A/B/AB/O, tetapi datanya
//      sudah memuat varian ber-Rh:
//
//        null 210 · "O" 10 · "B" 4 · "-" 4 · "A" 2 · "O+" 1 · "A+" 1 · "B+" 1
//        · "AB +" 1   ← ASJ00171, SPASI di dalamnya
//
//      Dua akibat: `+`/`-` tidak bisa dipilih sama sekali, dan `"AB +"` tidak
//      cocok dengan opsi mana pun.
//
//   2. SPASI DI TEPI (bagian "check lagi yg lain … sekalian di benerin juga")
//      DIUKUR atas DB yang sama, pada kolom enum yang sama:
//
//        agama              "ISLAM "         ×1
//        status_pernikahan  "BELUM MENIKAH " ×1
//        status_eks_jepang  "BELUM "         ×2
//        minum_alkohol      "TIDAK "         ×1
//
//      `"ISLAM "` bukan `"ISLAM"`: ia tidak cocok dengan `<option>` mana pun,
//      jadi baris itu tampil sebagai opsi hantu dan ejaan aslinya hilang begitu
//      disimpan ulang.
//
// Kenapa nilai LAMA (A/B/AB/O polos) TETAP dipertahankan di daftar: 16 baris
// nyata menyimpannya. Menggantinya dengan varian ber-Rh akan membuat nilai
// tersimpan itu tidak dikenal — dan `selectState()`/`withOther()` memang
// menyelamatkannya, tetapi hasilnya opsi hantu yang tidak pernah dipilih siapa pun.
// ==========================================
import { describe, it, expect } from 'vitest';
import { GOLONGAN_DARAH, golonganDarahDisplay } from '../src/lib/opsi-form';
import { normalizeBloodType, writeBodyFor } from '../netlify/functions/_lib/db/client';
import { buildMasterNested } from '../netlify/functions/contexts/master-data/service';

describe('GOLONGAN_DARAH — kategori lengkap, tanpa duplikat', () => {
  it('memuat kedelapan varian Rh DI SAMPING empat nilai polos', () => {
    const values = GOLONGAN_DARAH.map(([v]) => v);
    for (const v of ['A', 'A+', 'A-', 'B', 'B+', 'B-', 'AB', 'AB+', 'AB-', 'O', 'O+', 'O-', '-']) {
      expect(values, `opsi hilang: ${v}`).toContain(v);
    }
    // 12 varian ABO×Rh + 1 "tidak diketahui".
    expect(values).toHaveLength(13);
  });

  it('tidak ada nilai atau label yang berulang', () => {
    const values = GOLONGAN_DARAH.map(([v]) => v);
    const labels = GOLONGAN_DARAH.map(([, l]) => l);
    expect(new Set(values).size, 'nilai duplikat').toBe(values.length);
    // Label duplikat membuat `idOf()` ambigu — aturan yang sama dipegang
    // `aiCvPairs.test.ts`.
    expect(new Set(labels).size, 'label duplikat').toBe(labels.length);
  });

  it('setiap label menyebut golongan Jepangnya (血液型) supaya tetap terbaca di CV', () => {
    for (const [v, label] of GOLONGAN_DARAH) {
      if (v === '-') continue;
      expect(label, `${v} tidak punya glosa 型`).toContain('型');
    }
    expect(GOLONGAN_DARAH.find(([v]) => v === '-')?.[1]).toBe('不明');
  });
});

describe('golonganDarahDisplay — sufiks Rh dipisah dari 型', () => {
  it('ABO polos → "O 型" (perilaku lama dipertahankan)', () => {
    expect(golonganDarahDisplay('O')).toBe('O 型');
    expect(golonganDarahDisplay('AB')).toBe('AB 型');
    expect(golonganDarahDisplay('a')).toBe('A 型');
  });

  it('varian Rh → "O 型 Rh+", BUKAN "O+ 型"', () => {
    // Bentuk lama `gd + " 型"` menghasilkan "O+ 型" — terbaca "golongan O+",
    // padahal 型 menempel pada ABO. Ini yang lahir begitu kategorinya diperbanyak.
    expect(golonganDarahDisplay('O+')).toBe('O 型 Rh+');
    expect(golonganDarahDisplay('AB-')).toBe('AB 型 Rh-');
    expect(golonganDarahDisplay('B+')).toBe('B 型 Rh+');
  });

  it('kosong / "-" → string KOSONG, bukan " 型" yang menggantung', () => {
    // Dulu `if(gd==="-")gd=""` lalu `gd+" 型"` → sel CV berisi " 型" saja.
    expect(golonganDarahDisplay('')).toBe('');
    expect(golonganDarahDisplay('-')).toBe('');
    expect(golonganDarahDisplay(null)).toBe('');
    expect(golonganDarahDisplay(undefined)).toBe('');
  });

  it('nilai tak dikenal diteruskan apa adanya (tidak mengarang)', () => {
    expect(golonganDarahDisplay('不明')).toBe('不明');
    expect(golonganDarahDisplay('O型')).toBe('O 型');
  });
});

describe('normalizeBloodType — "AB +" menjadi "AB+"', () => {
  it('spasi di dalam dinormalkan, huruf kecil dinaikkan', () => {
    expect(normalizeBloodType('AB +')).toBe('AB+'); // ASJ00171, baris nyata
    expect(normalizeBloodType('ab+')).toBe('AB+');
    expect(normalizeBloodType(' O ')).toBe('O');
    expect(normalizeBloodType('A -')).toBe('A-');
  });

  it('nilai yang sudah bersih tidak berubah', () => {
    for (const v of ['A', 'A+', 'A-', 'B', 'B+', 'B-', 'AB', 'AB+', 'AB-', 'O', 'O+', 'O-']) {
      expect(normalizeBloodType(v)).toBe(v);
    }
  });

  it('kosong dan "-" tetap seperti adanya', () => {
    expect(normalizeBloodType('')).toBe('');
    expect(normalizeBloodType(null)).toBe('');
    expect(normalizeBloodType(undefined)).toBe('');
    expect(normalizeBloodType('-')).toBe('-');
  });

  it('teks di luar pola tidak dirusak', () => {
    expect(normalizeBloodType('不明')).toBe('不明');
    expect(normalizeBloodType('TIDAK TAHU')).toBe('TIDAK TAHU');
  });
});

describe('batas tulis & baca golongan darah', () => {
  it('writeBodyFor: nilai kotor tidak pernah masuk DB', () => {
    const { body } = writeBodyFor('master_database_candidate', {
      nama_lengkap: 'X',
      golongan_darah: 'AB +',
    }) as { body: Record<string, string> };
    expect(body.golongan_darah).toBe('AB+');
  });

  it('buildMasterNested: baris ASJ00171 bersih untuk CV & prefill form', () => {
    const n = buildMasterNested({ nama_lengkap: 'X', golongan_darah: 'AB +' });
    expect(n.identitas.golongan_darah).toBe('AB+');
    // Nilai yang sudah bersih tidak ikut berubah.
    expect(buildMasterNested({ golongan_darah: 'O+' }).identitas.golongan_darah).toBe('O+');
  });
});

describe('spasi di tepi — nilai enum dirapikan sebelum ditulis', () => {
  // Baris-baris nyata di DB: `"ISLAM "`, `"BELUM MENIKAH "`, `"BELUM "`,
  // `"TIDAK "`. Semuanya tidak cocok dengan opsi mana pun.
  const NYATA: Array<[string, string, string]> = [
    ['agama', 'ISLAM ', 'ISLAM'],
    ['status_pernikahan', 'BELUM MENIKAH ', 'BELUM MENIKAH'],
    ['status_eks_jepang', 'BELUM ', 'BELUM'],
    ['minum_alkohol', 'TIDAK ', 'TIDAK'],
    ['tahan_ac', ' YA ', 'YA'],
    ['ukuranbaju', ' XL', 'XL'],
  ];

  it('writeBodyFor: spasi tepi hilang untuk setiap kolom enum yang terukur', () => {
    for (const [col, dirty, clean] of NYATA) {
      const { body } = writeBodyFor('master_database_candidate', {
        nama_lengkap: 'X',
        [col]: dirty,
      }) as { body: Record<string, string> };
      expect(body[col], `${col}: "${dirty}" tidak dirapikan`).toBe(clean);
    }
  });

  it('nilai yang sudah bersih tidak berubah sama sekali', () => {
    for (const clean of ['ISLAM', 'BELUM MENIKAH', 'BELUM PERNAH', 'TIDAK', 'YA', 'L', '42']) {
      const { body } = writeBodyFor('master_database_candidate', {
        nama_lengkap: 'X',
        agama: clean,
      }) as { body: Record<string, string> };
      expect(body.agama).toBe(clean);
    }
  });

  it('teks bebas TIDAK ikut dirapikan — hanya kolom enum yang terdaftar', () => {
    // Doktrin `writeBodyFor`: coercion hanya untuk kolom yang TERBUKTI perlu.
    // `promosi_diri` menyimpan kalimat kandidat; memangkasnya adalah edit diam.
    const { body } = writeBodyFor('master_database_candidate', {
      nama_lengkap: 'X',
      promosi_diri: '  saya pekerja keras  ',
    }) as { body: Record<string, string> };
    expect(body.promosi_diri).toBe('  saya pekerja keras  ');
  });

  it('golongan darah tetap memakai normalizeBloodType, bukan sekadar trim', () => {
    // Kalau `golongan_darah` ikut memakai `trimText`, `"AB +"` akan tersimpan
    // sebagai `"AB +"` yang sudah di-trim — tetap tidak cocok dengan opsi.
    const { body } = writeBodyFor('master_database_candidate', {
      nama_lengkap: 'X',
      golongan_darah: 'AB +',
    }) as { body: Record<string, string> };
    expect(body.golongan_darah).toBe('AB+');
  });
});
