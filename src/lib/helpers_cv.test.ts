// ==========================================
// TESTS: helpers_cv — rirekisho date/format + riwayat merge (A10 parity)
//
// The CV preview (legacy renderCVAjaib / Astro RirekishoBuilder) formats all
// Japanese dates through these pure helpers. These tests pin the legacy
// formatting contract: tahun saja → `YYYY年`; tahun-bulan (YYYY-MM / YYYY/M)
// → `YYYY年M月`; tanggal lahir → `YYYY年MM月DD日` (built in the component);
// array master + AI digabung union + dedupe; semua nilai di-escape HTML.
// ==========================================
import { describe, it, expect } from 'vitest';
import {
  getPath,
  isGood,
  makeV,
  fmtMonthYearJp,
  mergeArrRiwayat,
  esc,
  normalisasiRiwayat,
  normalizeRiwayatFor,
  getTingkatVal,
  sortByTingkat,
  sortByYear,
  sortEdu,
} from './helpers_cv';

describe('fmtMonthYearJp — format tahun/bulan gaya Jepang (rirekisho)', () => {
  it('hanya tahun → YYYY年', () => {
    expect(fmtMonthYearJp('2024')).toBe('2024年');
  });

  it('tahun-bulan (YYYY-MM, YYYY/M, YYYY-M) → YYYY年M月', () => {
    expect(fmtMonthYearJp('2018-02')).toBe('2018年2月');
    expect(fmtMonthYearJp('2018/2')).toBe('2018年2月');
    expect(fmtMonthYearJp('2020-12-01')).toBe('2020年12月');
  });

  it('kosong / "-" / tidak dikenal → "" / teks asli', () => {
    expect(fmtMonthYearJp('')).toBe('');
    expect(fmtMonthYearJp('-')).toBe('');
    expect(fmtMonthYearJp('sekarang')).toBe('sekarang');
  });
});

describe('mergeArrRiwayat — gabung master + AI dengan dedupe (A10)', () => {
  const keyOf = (e: Record<string, unknown>) => String(e.nama || '');
  it('union dua sumber, duplikat dibuang', () => {
    const out = mergeArrRiwayat(
      [{ nama: 'A', usia: '10' }, { nama: 'B' }],
      [{ nama: 'B' }, { nama: 'C' }],
      keyOf,
    );
    expect(out.map((e) => e.nama)).toEqual(['A', 'B', 'C']);
  });

  it('menerima string JSON / null / bukan array', () => {
    expect(mergeArrRiwayat('[{"nama":"X"}]', null, keyOf).map((e) => e.nama)).toEqual(['X']);
    expect(mergeArrRiwayat(null, '{}', keyOf)).toEqual([]);
  });
});

describe('normalisasiRiwayat — bentuk kunci *_id (CV AI) → kanonikal (A10 parity)', () => {
  it('pendidikan: sekolah_id/nama_sekolah → sekolah, tahun_masuk → masuk', () => {
    const out = normalisasiRiwayat(
      [{ tingkat: 'SMA', sekolah_id: 'SMAN 1', tahun_masuk: '2010-04', tahun_lulus: '2013-03' }],
      'pendidikan',
    ) as Record<string, unknown>[];
    expect(out[0].sekolah).toBe('SMAN 1');
    expect(out[0].masuk).toBe('2010-04');
    expect(out[0].lulus).toBe('2013-03');
  });

  it('pekerjaan: perusahaan_id/jabatan_id → perusahaan/jabatan', () => {
    const out = normalisasiRiwayat(
      [{ perusahaan_id: 'PT A', jabatan_id: 'OPERATOR', tahun_masuk: '2015', tahun_keluar: '2018' }],
      'pekerjaan',
    ) as Record<string, unknown>[];
    expect(out[0].perusahaan).toBe('PT A');
    expect(out[0].jabatan).toBe('OPERATOR');
    expect(out[0].masuk).toBe('2015');
    expect(out[0].keluar).toBe('2018');
  });

  it('keluarga: hubungan_id/pekerjaan_id/usia → hubungan/pekerjaan/umur (dua arah)', () => {
    const out = normalisasiRiwayat(
      [{ hubungan_id: 'AYAH', pekerjaan_id: 'PETANI', usia: '55' }],
      'keluarga',
    ) as Record<string, unknown>[];
    expect(out[0].hubungan).toBe('AYAH');
    expect(out[0].pekerjaan).toBe('PETANI');
    expect(out[0].umur).toBe('55');
    // usia is also a canonical keluarga key in this codebase — both stay filled.
    expect(out[0].usia).toBe('55');
  });

  it('ADDITIVE: nilai kanonikal yang sudah ada tidak pernah ditimpa', () => {
    const out = normalisasiRiwayat(
      [{ sekolah: 'SMAN 2', sekolah_id: 'SMAN 1' }],
      'pendidikan',
    ) as Record<string, unknown>[];
    expect(out[0].sekolah).toBe('SMAN 2');
  });

  it('tipe tidak dikenal / nilai kosong → dikembalikan aman', () => {
    expect(normalisasiRiwayat([{ a: 1 }], 'entah')).toEqual([{ a: 1 }]);
    expect(normalisasiRiwayat(null, 'pendidikan')).toEqual([]);
  });

  // Additive per TIPE, bukan hanya per entri: satu tipe yang menimpa nilai
  // kanonikal cukup merusak data meski tipe lain benar.
  it('ADDITIVE di pekerjaan: perusahaan kanonikal tidak ditimpa perusahaan_id', () => {
    const out = normalisasiRiwayat(
      [{ perusahaan: 'PT BENAR', perusahaan_id: 'PT SALAH' }],
      'pekerjaan',
    ) as Record<string, unknown>[];
    expect(out[0].perusahaan).toBe('PT BENAR');
  });

  it('ADDITIVE di keluarga: hubungan kanonikal tidak ditimpa hubungan_id', () => {
    const out = normalisasiRiwayat(
      [{ hubungan: 'IBU', hubungan_id: 'AYAH' }],
      'keluarga',
    ) as Record<string, unknown>[];
    expect(out[0].hubungan).toBe('IBU');
  });

  it('ADDITIVE di keluarga: umur kanonikal tidak ditimpa usia', () => {
    const out = normalisasiRiwayat(
      [{ umur: '40', usia: '55' }],
      'keluarga',
    ) as Record<string, unknown>[];
    expect(out[0].umur).toBe('40');
  });
});

describe('mergeArrRiwayat + normalisasi di titik gabung (kontrak legacy)', () => {
  it('sekolah (master) & sekolah_id (AI) yang sama jadi SATU baris, bukan dua', () => {
    const out = mergeArrRiwayat(
      [{ tingkat: 'SMA', sekolah: 'SMAN 1' }],
      [{ tingkat: 'SMA', sekolah_id: 'SMAN 1' }],
      (e) => String(e.tingkat || '') + String(e.sekolah || e.sekolah_id || ''),
      normalizeRiwayatFor('pendidikan'),
    );
    expect(out.length).toBe(1);
  });

  it('entri AI sekolah_id keluar dengan kunci sekolah (yang dibaca builder)', () => {
    const out = mergeArrRiwayat(
      [],
      [{ tingkat: 'SMP', sekolah_id: 'SMPN 3' }],
      (e) => String(e.tingkat || '') + String(e.sekolah || ''),
      normalizeRiwayatFor('pendidikan'),
    );
    expect(out[0].sekolah).toBe('SMPN 3');
  });

  it('tanpa normalizer tetap jalan (pemanggil lama tidak rusak)', () => {
    const out = mergeArrRiwayat([{ nama: 'A' }], [{ nama: 'B' }], (e) => String(e.nama));
    expect(out.map((e) => e.nama)).toEqual(['A', 'B']);
  });

  it('normalisasi terjadi SEBELUM kunci dedupe dihitung (urutan itu yang penting)', () => {
    // Kunci dedupe hanya membaca bentuk kanonikal. Kalau normalize dijalankan
    // SETELAH keyOf, entri alias menghasilkan kunci kosong → dedupe gagal.
    const seen: string[] = [];
    const out = mergeArrRiwayat(
      [{ tingkat: 'SMA', sekolah: 'SMAN 1' }],
      [{ tingkat: 'SMA', sekolah_id: 'SMAN 1' }],
      (e) => {
        const k = String(e.tingkat || '') + String(e.sekolah || '');
        seen.push(k);
        return k;
      },
      normalizeRiwayatFor('pendidikan'),
    );
    expect(out.length).toBe(1);
    // Setiap kunci yang dihitung harus memuat nama sekolah — bukti urutan benar.
    expect(seen).toEqual(['SMASMAN 1', 'SMASMAN 1']);
  });
});

describe('getTingkatVal — peringkat jenjang sekolah', () => {
  it('SD → SMP → SMA naik, varian MI/MTs/SMK/MA sederajat', () => {
    expect(getTingkatVal('SD')).toBe(1);
    expect(getTingkatVal('MI')).toBe(1);
    expect(getTingkatVal('SMP')).toBe(2);
    expect(getTingkatVal('MTs')).toBe(2);
    expect(getTingkatVal('SMA')).toBe(3);
    expect(getTingkatVal('SMK')).toBe(3);
    expect(getTingkatVal('MA')).toBe(3);
    expect(getTingkatVal('S1')).toBe(4);
    expect(getTingkatVal('LPK')).toBe(5);
  });

  it('label panjang & spasi tetap kebaca ("SMK NEGERI 1", "Universitas")', () => {
    expect(getTingkatVal('SMK NEGERI 1')).toBe(3);
    expect(getTingkatVal('universitas')).toBe(4);
    expect(getTingkatVal('  sd  ')).toBe(1);
    expect(getTingkatVal('sma negeri 2 bandung')).toBe(3);
  });

  it('batas token "+": "MADRASAH ALIYAH" = MA, "MAMBA" tidak (silang huruf diblokir)', () => {
    // Level 3 untuk MA tercapai lewat token 'ma' — bukan lewat 'M' + 'A' yang
    // bersebelahan di dalam kata lain.
    expect(getTingkatVal('MADRASAH ALIYAH')).toBe(3);
    expect(getTingkatVal('MAMBA')).toBe(3);
  });

  it('tidak dikenal / kosong → 99', () => {
    expect(getTingkatVal('KURSUS')).toBe(99);
    expect(getTingkatVal('')).toBe(99);
    expect(getTingkatVal(null)).toBe(99);
  });
});

describe('sortEdu / sortByTingkat — urutan baku SD → SMP → SMA (tanpa "-")', () => {
  const ent = (tingkat: string, masuk?: string) => ({ tingkat, masuk });

  it('masukan terbalik (SMA, SMP, SD) → keluar SD, SMP, SMA', () => {
    const out = sortEdu([ent('SMA'), ent('SMP'), ent('SD')]);
    expect(out.map((e) => e.tingkat)).toEqual(['SD', 'SMP', 'SMA']);
  });

  it('level sama → tiebreak tahun masuk menaik', () => {
    const out = sortEdu([ent('SMA', '2011-04'), ent('SMA', '2010-04')]);
    expect(out.map((e) => e.masuk)).toEqual(['2010-04', '2011-04']);
  });

  it('level determinan, bukan tahun: SMA 2008 tetap setelah S1 2015', () => {
    const out = sortEdu([ent('S1', '2015-09'), ent('SMA', '2008-07'), ent('SMP', '2005-07')]);
    expect(out.map((e) => e.tingkat)).toEqual(['SMP', 'SMA', 'S1']);
  });

  it('keluarga jenjang lengkap SD/SMP/SMA/S1/LPK terurut baku', () => {
    const out = sortEdu([ent('LPK'), ent('S1'), ent('SMA'), ent('SMP'), ent('SD')]);
    expect(out.map((e) => e.tingkat)).toEqual(['SD', 'SMP', 'SMA', 'S1', 'LPK']);
  });

  it('NON-MUTATING: array masukan tidak diubah urutannya', () => {
    const input = [ent('SMA'), ent('SD')];
    sortEdu(input);
    expect(input.map((e) => e.tingkat)).toEqual(['SMA', 'SD']);
  });

  it('tidak dikenal taruh di belakang, urutan asli antar-mereka dipertahankan', () => {
    const out = sortEdu([ent('KURSUS A'), ent('SD'), ent('KURSUS B')]);
    expect(out.map((e) => e.tingkat)).toEqual(['SD', 'KURSUS A', 'KURSUS B']);
  });

  it('satu entri / kosong → apa adanya, tanpa lempar', () => {
    expect(sortEdu([ent('SMA')]).length).toBe(1);
    expect(sortEdu([])).toEqual([]);
  });

  it('entri tanpa tingkat → 99, tidak naik ke atas', () => {
    const out = sortByTingkat<{ tingkat?: string; masuk?: string }>([{}, ent('SMA')]);
    expect(out[0].tingkat).toBe('SMA');
  });
});

describe('sortByYear — kronologis menaik (pekerjaan)', () => {
  it('tahun masuk menaik, tahun hilang di belakang', () => {
    const out = sortByYear([
      { perusahaan: 'C', masuk: '2018' },
      { perusahaan: 'A', masuk: '2010' },
      { perusahaan: 'B' },
      { perusahaan: 'D', masuk: '2014' },
    ]);
    expect(out.map((e) => e.perusahaan)).toEqual(['A', 'D', 'C', 'B']);
  });

  it('fallback tahun_masuk (bentuk lama)', () => {
    const out = sortByYear([{ masuk: '2015' }, { tahun_masuk: '2012' }]);
    expect(out.map((e) => e.tahun_masuk || e.masuk)).toEqual(['2012', '2015']);
  });
});

describe('esc — escape HTML semua nilai kandidat sebelum masuk template A4', () => {
  it('& < > " \' di-escape', () => {
    expect(esc(`<b onclick="x">A&B'`)).toBe('&lt;b onclick=&quot;x&quot;&gt;A&amp;B&#39;');
  });
});

describe('getPath/makeV — pencarian nilai nested + fallback flat legacy', () => {
  const d = { identitas: { nama_lengkap: 'KANDIDAT A', tgl_lahir: '1995-08-14' }, WA: '6281' };
  it('getPath menembus titik', () => {
    expect(getPath(d, 'identitas.nama_lengkap')).toBe('KANDIDAT A');
  });
  it('makeV: key bertitik → nested; key flat → property langsung', () => {
    const v = makeV(d, {});
    expect(v('identitas.nama_lengkap')).toBe('KANDIDAT A');
    expect(v('identitas.tgl_lahir')).toBe('1995-08-14');
  });
  it('isGood menolak kosong / "-"', () => {
    expect(isGood('')).toBe(false);
    expect(isGood('-')).toBe(false);
    expect(isGood('A')).toBe(true);
  });
});

// ==========================================
// TESTS: isGood — penjaga sentinel literal (item 8, 2026-09-25)
//
// Owner melaporkan CV/rirekisho mencetak banyak "undefined". Akar alias-key
// SUDAH diperbaiki oleh normalizer; sisa lubangnya adalah STRING LITERAL
// "undefined" yang lolos setiap gerbang lama (bukan null/undefined JS, bukan
// kosong, bukan "-") lalu tercetak ke kertas. Guard ini menutup lubang itu
// secara KONSERVATIF: hanya kecocokan PERSIS nilai utuh (case-insensitive).
// ==========================================
describe('isGood — sentinel literal "undefined"/"null"/"NaN" tidak pernah dirender', () => {
  it('string literal "undefined" → kosong (tidak dicetak ke CV)', () => {
    expect(isGood('undefined')).toBe(false);
    expect(isGood('  undefined  ')).toBe(false); // spasi tepi pun tetap kosong
    expect(isGood('UNDEFINED')).toBe(false);     // case-insensitive
  });

  it('string literal "null" dan "NaN" → kosong', () => {
    expect(isGood('null')).toBe(false);
    expect(isGood('NULL')).toBe(false);
    expect(isGood('NaN')).toBe(false);
    expect(isGood('nan')).toBe(false);
  });

  it('KONSERVATIF: nilai asli yang mengandung kata itu UTUH', () => {
    // Nama keluarga "Null" nyata; hanya kecocokan PERSIS yang dianggap kosong.
    expect(isGood('Null')).toBe(false);       // (tepat "null" → memang kosong)
    expect(isGood('Van Der Null')).toBe(true); // frasa → nilai sah
    expect(isGood('undefined behaviour')).toBe(true);
    expect(isGood('NaN tolerance training')).toBe(true);
    expect(isGood('Siti Nabila')).toBe(true);
  });

  it('kontrak lama "-"/kosong/null JS tetap sama', () => {
    expect(isGood('-')).toBe(false);
    expect(isGood('')).toBe(false);
    expect(isGood(null)).toBe(false);
    expect(isGood(undefined)).toBe(false);
  });

  it('makeV jatuh ke "-" saat nilai adalah sentinel (bukan mencetak "undefined")', () => {
    const v = makeV({ nama: 'undefined', kota: 'null', umur: 'NaN' }, {});
    expect(v('nama')).toBe('-');
    expect(v('kota')).toBe('-');
    expect(v('umur')).toBe('-');
    // Nilai asli tidak terpengaruh.
    expect(makeV({ nama: 'Budi' }, {})('nama')).toBe('Budi');
  });
});
