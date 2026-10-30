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
  riwayatKeyOf,
  esc,
  normalisasiRiwayat,
  normalizeRiwayatFor,
  isLpkTingkat,
  kouritsuSekolah,
  tingkatSekolahJp,
  jenjangKinkiJp,
  sortRiwayatKronologis,
  getTingkatVal,
  getTingkatVal,
  sortByTingkat,
  periodeKey,
  sortRiwayatKronologis,
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

describe('riwayatKeyOf — identitas baris (satu definisi untuk tiga pembaca)', () => {
  /**
   * Keluhan pemilik 2026-10-21: "kenapa ini kok data dobel dobel terus".
   *
   * Dua baris TANPA nama sekolah — satu ditulis form master sebagai `SMA/SMK`,
   * satu oleh form AI sebagai `SMK` — adalah baris yang sama. Kunci lamanya
   * memakai ejaan mentah, jadi keduanya lolos dedupe dan muncul sebagai dua
   * baris kosong bertahun sama di form AI CV.
   */
  it('pendidikan tanpa nama: ejaan jenjang yang setara menghasilkan kunci SAMA', () => {
    expect(riwayatKeyOf('pendidikan', { tingkat: 'SMK' }))
      .toBe(riwayatKeyOf('pendidikan', { tingkat: 'SMA/SMK' }));
    expect(riwayatKeyOf('pendidikan', { tingkat: 'SD' }))
      .toBe(riwayatKeyOf('pendidikan', { tingkat: 'MI' }));
  });

  it('pendidikan tanpa nama: jenjang BERBEDA tetap kunci berbeda', () => {
    // Kalau semua baris tanpa nama jatuh ke satu kunci, memperbaiki "dobel"
    // justru menghapus riwayat sungguhan.
    expect(riwayatKeyOf('pendidikan', { tingkat: 'SD' }))
      .not.toBe(riwayatKeyOf('pendidikan', { tingkat: 'SMP' }));
  });

  it('nama sekolah tetap identitas utama, apa pun ejaan jenjangnya', () => {
    expect(riwayatKeyOf('pendidikan', { tingkat: 'SMK', sekolah: 'SMK NEGERI 1' }))
      .toBe(riwayatKeyOf('pendidikan', { tingkat: 'SMA/SMK', nama_sekolah: 'SMK Negeri 1' }));
  });

  it('tingkat yang tidak dikenal tidak digabung paksa', () => {
    expect(riwayatKeyOf('pendidikan', { tingkat: 'PESANTREN' }))
      .not.toBe(riwayatKeyOf('pendidikan', { tingkat: 'STM' }));
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

describe('riwayatKeyOf — identitas baris riwayat (dedupe nyata, 2026-10-12)', () => {
  it('pendidikan: baris master (masuk + tahun_masuk ganda) menyatu dengan baris AI', () => {
    // Terukur atas 234 baris master gdw: memasukkan periode membuat kunci baris
    // master "2016201620192019" vs baris AI "20162019" => sekolah tampil DUA KALI
    // (8 baris / 21 baris berlebih). Sekarang identitas = NAMA saja.
    const master = { tingkat: 'SMK', sekolah: 'SMK RADEN PATAH', nama_sekolah: 'SMK RADEN PATAH', masuk: '2016', tahun_masuk: '2016', lulus: '2019', tahun_lulus: '2019' };
    const ai = { tingkat: 'SMK', sekolah_id: 'SMK RADEN PATAH', masuk: '2016', lulus: '2019' };
    expect(riwayatKeyOf('pendidikan', master)).toBe(riwayatKeyOf('pendidikan', ai));
    const merged = mergeArrRiwayat([master], [ai], (e) => riwayatKeyOf('pendidikan', e), normalizeRiwayatFor('pendidikan'));
    expect(merged).toHaveLength(1);
  });

  it('pendidikan: sekolah yang sama dengan tahun BERBEDA tetap SATU baris', () => {
    const a = { tingkat: 'SMA', sekolah: 'SMAN 1 JIWAN', masuk: '2013', lulus: '2016' };
    const b = { tingkat: 'SMA', sekolah_id: 'SMAN 1 JIWAN', masuk: '2005', lulus: '2013' };
    expect(riwayatKeyOf('pendidikan', a)).toBe(riwayatKeyOf('pendidikan', b));
  });

  it('pendidikan: sekolah BERBEDA tetap dua baris', () => {
    const a = { tingkat: 'SD', sekolah: 'SDN 1' };
    const b = { tingkat: 'SMP', sekolah: 'SMPN 1' };
    expect(riwayatKeyOf('pendidikan', a)).not.toBe(riwayatKeyOf('pendidikan', b));
    expect(mergeArrRiwayat([a], [b], (e) => riwayatKeyOf('pendidikan', e), normalizeRiwayatFor('pendidikan'))).toHaveLength(2);
  });

  it('pekerjaan: periode ganda menyatu dengan AI, tapi dua masa kerja tetap dua baris', () => {
    const master = { perusahaan: 'PT A', nama_perusahaan: 'PT A', masuk: '2014', tahun_masuk: '2014', keluar: '2022', tahun_keluar: '2022' };
    const ai = { perusahaan_id: 'PT A', masuk: '2014', keluar: '2022' };
    expect(riwayatKeyOf('pekerjaan', master)).toBe(riwayatKeyOf('pekerjaan', ai));
    const stint2 = { perusahaan: 'PT A', masuk: '2010', keluar: '2012' };
    expect(riwayatKeyOf('pekerjaan', master)).not.toBe(riwayatKeyOf('pekerjaan', stint2));
    expect(mergeArrRiwayat([master], [ai, stint2], (e) => riwayatKeyOf('pekerjaan', e), normalizeRiwayatFor('pekerjaan'))).toHaveLength(2);
  });
});

// ==========================================
// 2026-10-29 — sortRiwayatKronologis (urutan rirekisho Jepang).
//
// Ditambahkan karena `sortEdu` mengurutkan per JENJANG dan `pekerjaan` tidak
// diurutkan sama sekali; keduanya menghasilkan 学歴/職歴 yang terbalik untuk
// data yang sah (mis. SMK setelah SMA). Lihat RirekishoBuilder.test.tsx untuk
// laporan pemilik yang memicunya.
// ==========================================
describe('periodeKey / sortRiwayatKronologis', () => {
  it('periodeKey membaca tahun, tahun-bulan, dan teks tanggal', () => {
    expect(periodeKey('2020')).toBe(202000);
    expect(periodeKey('2020-04')).toBe(202004);
    expect(periodeKey('2020/4')).toBe(202004);
    expect(periodeKey('April 2020')).toBe(202004);
    // Bulan di luar 1-12 → "tahun saja", bukan 2020年0月 di CV.
    expect(periodeKey('2020-00')).toBe(202000);
    expect(periodeKey('2020-13')).toBe(202000);
    expect(periodeKey('')).toBeNull();
    expect(periodeKey('-')).toBeNull();
  });

  it('urut menaik berdasarkan tahun DAN bulan', () => {
    const out = sortRiwayatKronologis([
      { n: 'C', masuk: '2018-07' },
      { n: 'A', masuk: '2010-04' },
      { n: 'B', masuk: '2014-11' },
      { n: 'B2', masuk: '2014-04' },
    ]);
    expect(out.map((x) => x.n)).toEqual(['A', 'B2', 'B', 'C']);
  });

  it('tanpa tanggal masuk → paling akhir, urutan asli dipertahankan', () => {
    const out = sortRiwayatKronologis([
      { n: 'X' },
      { n: 'A', masuk: '2010' },
      { n: 'Y' },
    ]);
    expect(out.map((x) => x.n)).toEqual(['A', 'X', 'Y']);
  });

  it('tanggal mulai sama → selesai lebih dulu, lalu tiebreak', () => {
    const out = sortRiwayatKronologis(
      [
        { n: 'B', masuk: '2010-04', lulus: '2013-03' },
        { n: 'A', masuk: '2010-04', lulus: '2012-03' },
      ],
    );
    expect(out.map((x) => x.n)).toEqual(['A', 'B']);
  });
});

/* ── label sekolah untuk form Jepang ─────────────────────────────────────────
   Pemilik 2026-10-30: *"masih banyak yg kosong dari template … riwayat sekolah
   kan harus pendidikan terakhir sama LPK dan kayak negri swasta nya gak dipilih
   dari dropdown padahal ada"*. Dua sebab terukur:
     1. baris LPK dikenali dari teks tingkat ('BAHASA JEPANG'); setelah `LPK`
        menjadi nilai dropdown, baris itu TIDAK lagi dikenali sebagai LPK —
        di KINKI ia terpilih sebagai baris 高校 dan blok 日本語学校 dibiarkan
        kosong;
     2. 国公私 hanya ditebak dari awalan nama sekolah, sehingga sekolah negeri
        yang namanya tidak berawalan SDN/SMPN/SMAN (mis. MADRASAH ALIYAH
        NEGERI) tercetak 私立. */
describe('label sekolah Jepang — LPK, 国公私, dan jenjang', () => {
  it('isLpkTingkat mengenali LPK (dropdown baru) DAN ejaan lama', () => {
    expect(isLpkTingkat('LPK')).toBe(true);
    expect(isLpkTingkat('LPK AMANAH SAKURA')).toBe(true);
    expect(isLpkTingkat('BAHASA JEPANG')).toBe(true);
    expect(isLpkTingkat('KURSUS')).toBe(true);
    expect(isLpkTingkat('SMA/SMK')).toBe(false);
    expect(isLpkTingkat('S1')).toBe(false);
    expect(isLpkTingkat('')).toBe(false);
  });

  it('kouritsuSekolah: negeri = 公立 (bukan 国立), sisanya 私立', () => {
    expect(kouritsuSekolah('SDN 1 MADIUN')).toBe('公立');
    expect(kouritsuSekolah('SMA NEGERI 1')).toBe('公立');
    expect(kouritsuSekolah('MADRASAH ALIYAH NEGERI 2')).toBe('公立');
    expect(kouritsuSekolah('SMK AMANAH SAKURA JAPAN')).toBe('私立');
    expect(kouritsuSekolah('')).toBe('');
  });

  it('tingkatSekolahJp (JIPA): LPK = 日本語学校', () => {
    expect(tingkatSekolahJp('LPK')).toBe('日本語学校');
    expect(tingkatSekolahJp('SD')).toBe('小学校');
    expect(tingkatSekolahJp('SMK')).toBe('専門学校');
    expect(tingkatSekolahJp('SMA/SMK')).toBe('高校');
    expect(tingkatSekolahJp('S1')).toBe('大学');
    expect(tingkatSekolahJp('')).toBe('');
  });

  it('jenjangKinkiJp (KINKI A19/A21): LPK = 日本語学校, SMK = 高校', () => {
    expect(jenjangKinkiJp('LPK')).toBe('日本語学校');
    expect(jenjangKinkiJp('SMK')).toBe('高校');
    expect(jenjangKinkiJp('S1')).toBe('大学');
    expect(jenjangKinkiJp('D3')).toBe('専門');
    // SD/SMP tidak ada di dropdown → kosong, bukan diklaim 高校.
    expect(jenjangKinkiJp('SMP')).toBe('');
  });
});

describe('sortRiwayatKronologis — baris tanpa tahun tetap terurut jenjang', () => {
  /* Terukur 2026-10-30 pada master id 40: baris pendidikan tersimpan
     SMK → SMP → SMA/SMK dan TIDAK punya tahun sama sekali. Form resmi Jepang
     mencetaknya persis dalam urutan itu (SMP di bawah SMK). Penyebabnya:
     cabang "dua-duanya tanpa tanggal" langsung memakai urutan asli dan tidak
     pernah memanggil tie-break. */
  it('tanpa tahun: tie-break jenjang dipakai (SD → SMP → SMA)', () => {
    const list = [
      { tingkat: 'SMK', sekolah: 'A' },
      { tingkat: 'SMP', sekolah: 'B' },
      { tingkat: 'SMA/SMK', sekolah: 'C' },
    ];
    const out = sortRiwayatKronologis(list, {
      tiebreak: (a, b) => getTingkatVal(a.tingkat) - getTingkatVal(b.tingkat),
    });
    expect(out.map((r) => r.tingkat)).toEqual(['SMP', 'SMK', 'SMA/SMK']);
  });

  it('tanpa tie-break, urutan asli dipertahankan (pekerjaan tidak diacak)', () => {
    const list = [{ perusahaan: 'A' }, { perusahaan: 'B' }];
    expect(sortRiwayatKronologis(list).map((r) => r.perusahaan)).toEqual(['A', 'B']);
  });
});
