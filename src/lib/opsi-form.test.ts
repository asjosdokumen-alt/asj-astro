// ==========================================
// TESTS: opsi-form — daftar dropdown ID/JP + helper sentinel.
//
// Subjek tes ini bukan kosmetik: dua kelas bug yang pernah terjadi di form ini
// adalah "kandidat memilih satu hal, yang tersimpan hal lain" dan "nilai lama
// hilang begitu form disimpan ulang". Keduanya tidak terlihat dari UI, jadi
// hanya tes di level ini yang bisa menangkapnya.
// ==========================================
import { describe, it, expect } from 'vitest';
import {
  PEKERJAAN, PEKERJAAN_LEGACY, PEKERJAAN_UTAMA, JURUSAN, JURUSAN_LPK, JURUSAN_SMK, JURUSAN_SMA, JURUSAN_KULIAH,
  KOTA, HUBUNGAN_LEGACY, HUBUNGAN_KELUARGA, SSW_BIDANG, UJIAN_JP, UJIAN_SSW,
  JENIS_KERJA_PAIRS,
  SENTINEL_LAINNYA, OPSI_KOSONG, OPSI_LAINNYA,
  withOther, isKnown, selectState, resolveOther, withEmpty, labelJp,
  valuesOf, GENDER_PAIRS, AGAMA_PAIRS, STATUS_NIKAH_PAIRS, TANGAN_PAIRS,
  YA_TIDAK_PAIRS, RIWAYAT_JEPANG_PAIRS, BAHASA_JEPANG, GOLONGAN_DARAH,
} from './opsi-form';

describe('opsi-form — paritas nilai legacy', () => {
  it('PEKERJAAN_LEGACY memuat 25 pekerjaan legacy byte-identik', () => {
    // Daftar ini datang dari ai_form.html `#pekerjaan-options` dan
    // master_full.js `PEKERJAAN_LIST`. Kalau nilainya berubah, data lama
    // tidak akan pernah cocok lagi dengan pilihan baru.
    expect(PEKERJAAN_LEGACY).toHaveLength(25);
    expect(PEKERJAAN_LEGACY[0]).toEqual(['OPERATOR PRODUKSI', 'OPERATOR PRODUKSI (工場作業員)']);
    expect(PEKERJAAN_LEGACY[23]).toEqual(['PELAJAR / MAHASISWA', 'PELAJAR / MAHASISWA (学生)']);
    expect(PEKERJAAN_LEGACY[24]).toEqual(['BELUM BEKERJA', 'BELUM BEKERJA (無職)']);
  });

  it('PEKERJAAN = yang sering dipakai di depan, lalu SELURUH nilai legacy, lalu sisanya', () => {
    expect(PEKERJAAN.length).toBeGreaterThan(PEKERJAAN_LEGACY.length);
    // Kontraknya berubah 2026-10-30 atas permintaan pemilik ("dropdown
    // pekerjaannya ga lengkap … karyawan swasta juga gak ada"). Urutan tampil
    // sekarang dimulai dari pekerjaan yang paling sering dikirim ASJ, BUKAN
    // dari daftar legacy — `KARYAWAN SWASTA` tadinya duduk di urutan ke-11 dan
    // terbaca "tidak ada" di layar ponsel.
    //
    // Yang TIDAK boleh berubah adalah nilainya: setiap nilai legacy harus tetap
    // ada tepat sekali, karena baris tersimpan memakainya. Itu yang diuji di
    // bawah — bukan urutannya, yang murni tampilan.
    for (const [v, label] of PEKERJAAN_LEGACY) {
      const hits = PEKERJAAN.filter(([x]) => x === v);
      expect(hits, `nilai legacy hilang/duplikat: ${v}`).toHaveLength(1);
      expect(hits[0][1]).toBe(label);
    }
    expect(PEKERJAAN.slice(0, PEKERJAAN_UTAMA.length).map(([v]) => v)).toEqual(PEKERJAAN_UTAMA);
  });

  it('setiap nilai PEKERJAAN_UTAMA benar-benar ada di daftar (tidak ada yang hilang diam-diam)', () => {
    // `PEKERJAAN` menyaring nilai yang tidak ditemukan, jadi salah ketik di
    // `PEKERJAAN_UTAMA` hanya akan MEMENDEKKAN bagian depan daftar tanpa error.
    // Tes ini yang membuatnya kelihatan.
    const values = new Set(PEKERJAAN.map(([v]) => v));
    for (const v of PEKERJAAN_UTAMA) expect(values.has(v), `tidak ada di PEKERJAAN: ${v}`).toBe(true);
  });

  it('petani & peternak dipisah per komoditas — bukan satu entri "PETANI / PERKEBUNAN"', () => {
    const values = new Set(PEKERJAAN.map(([v]) => v));
    for (const v of ['PETANI', 'PETERNAK', 'PETERNAK SAPI PERAH', 'PETERNAK AYAM PETELUR']) {
      expect(values.has(v), `pekerjaan ternak tidak ada: ${v}`).toBe(true);
    }
    // Nilai lama tetap ada supaya baris tersimpan tidak kehilangan opsinya.
    expect(values.has('PETANI / PERKEBUNAN')).toBe(true);
  });

  it('HUBUNGAN_LEGACY memakai UPPERCASE 7 nilai legacy — BUKAN TitleCase', () => {
    // Legacy `fam_hub_<n>` hanya punya 7 opsi ini, semuanya UPPERCASE.
    // Versi Astro sebelumnya memakai 'Ayah'/'Ibu'/… — bug paritas: hubungan
    // yang disimpan dari form ini tidak akan cocok dengan data legacy.
    expect(HUBUNGAN_LEGACY.map(([v]) => v)).toEqual([
      'AYAH', 'IBU', 'SUAMI', 'ISTRI', 'ANAK', 'KAKAK', 'ADIK',
    ]);
    for (const [, label] of HUBUNGAN_LEGACY) {
      expect(label).not.toBe('');
    }
  });

  it('HUBUNGAN_KELUARGA memuat ketujuh nilai legacy — dan yang berjenis kelamin lebih dulu', () => {
    const values = HUBUNGAN_KELUARGA.map(([v]) => v);
    // Paritas DATA: setiap nilai legacy masih ada, tepat sekali. Baris lama
    // tidak boleh kehilangan opsinya.
    for (const [v] of HUBUNGAN_LEGACY) {
      expect(values.filter((x) => x === v)).toHaveLength(1);
    }
    // Paritas URUTAN sudah sengaja diubah 2026-10-21: `KAKAK (兄・姉)` tidak
    // bisa dicetak ke rirekisho tanpa memilih salah satu, jadi versi spesifik
    // harus muncul lebih dulu — kalau tidak, yang generik tetap jadi pilihan
    // paling gampang dan pemisahannya tidak pernah terpakai.
    const firstGendered = values.indexOf('KAKAK LAKI-LAKI');
    const generic = values.indexOf('KAKAK');
    expect(firstGendered).toBeGreaterThan(-1);
    expect(firstGendered).toBeLessThan(generic);
    expect(values.indexOf('ADIK PEREMPUAN')).toBeLessThan(values.indexOf('ADIK'));
    expect(values.indexOf('ANAK LAKI-LAKI')).toBeLessThan(values.indexOf('ANAK'));
  });

  it('setiap hubungan berjenis kelamin memakai kanji yang BERBEDA per jenis kelamin', () => {
    // Inti keluhan pemilik: "karena beda". Kalau dua entri masih memakai gloss
    // yang sama, pemisahannya hanya menambah baris tanpa menambah informasi.
    const jp = (v: string) => labelJp(HUBUNGAN_KELUARGA.find(([x]) => x === v)?.[1] || '');
    expect(jp('KAKAK LAKI-LAKI')).toBe('兄');
    expect(jp('KAKAK PEREMPUAN')).toBe('姉');
    expect(jp('ADIK LAKI-LAKI')).toBe('弟');
    expect(jp('ADIK PEREMPUAN')).toBe('妹');
    expect(jp('ANAK LAKI-LAKI')).toBe('息子');
    expect(jp('ANAK PEREMPUAN')).toBe('娘');
  });

  it('JURUSAN menggabungkan LPK + SMK + SMA + Kuliah tanpa duplikat', () => {
    expect(JURUSAN).toEqual([...JURUSAN_LPK, ...JURUSAN_SMK, ...JURUSAN_SMA, ...JURUSAN_KULIAH]);
    const values = JURUSAN.map(([v]) => v);
    expect(new Set(values).size).toBe(values.length);
    // Ketiga jenjang benar-benar terisi — kalau salah satu kosong, "tambah
    // jurusan" yang diminta user tidak benar-benar terjadi.
    expect(JURUSAN_SMK.length).toBeGreaterThan(10);
    expect(JURUSAN_SMA.length).toBeGreaterThan(2);
    expect(JURUSAN_KULIAH.length).toBeGreaterThan(10);
  });

  it('jurusan bahasa Jepang ada — LPK adalah asal sebagian besar kandidat', () => {
    // Pemilik 2026-10-30: "dropdown ... jurusan bahasa jepang tolong tambah".
    // Sebelum ini satu-satunya cara mengisi jurusan LPK adalah mengetik bebas,
    // dan hasilnya berbeda ejaan di tiap baris ("bahasa JEPANG", "LPK bahasa
    // Jepang", …) — persis drift yang daftar ini ada untuk mencegah.
    const values = JURUSAN.map(([v]) => v);
    expect(values).toContain('BAHASA JEPANG');
    // Label kanji ikut, karena `ComboSelect` mengisi kolom JP dari entri daftar.
    expect(JURUSAN_LPK[0][1]).toContain('日本語');
    expect(JURUSAN_LPK.length).toBeGreaterThanOrEqual(2);
  });

  it('PEKERJAAN dan KOTA tidak punya nilai duplikat', () => {
    for (const [name, list] of [['PEKERJAAN', PEKERJAAN], ['KOTA', KOTA]] as const) {
      const values = list.map(([v]) => v);
      expect(`${name}:${new Set(values).size}`).toBe(`${name}:${values.length}`);
    }
  });

  it('tidak ada opsi yang memakai sentinel sebagai nilai data', () => {
    // Sentinel harus hanya muncul dari `withOther`/`OPSI_LAINNYA`. Kalau
    // sebuah entri data kebetulan bernilai `__LAINNYA__`, `selectState` tidak
    // bisa membedakan "pilih Lainnya" dari "nilai data".
    for (const list of [PEKERJAAN, JURUSAN, KOTA, HUBUNGAN_KELUARGA]) {
      expect(list.some(([v]) => v === SENTINEL_LAINNYA)).toBe(false);
      expect(list.some(([v]) => v === '')).toBe(false);
    }
  });
});

describe('opsi-form — withOther (bentuk daftar satu <select>)', () => {
  it('kosong di depan, sentinel di belakang', () => {
    const out = withOther(PEKERJAAN_LEGACY);
    expect(out[0]).toEqual(OPSI_KOSONG);
    expect(out[out.length - 1]).toEqual(OPSI_LAINNYA);
    expect(out).toHaveLength(PEKERJAAN_LEGACY.length + 2);
  });

  it('nilai lama yang TIDAK ada di daftar tetap muncul sebagai opsi sendiri', () => {
    // Ini legacy `fillManualSelect`: tanpa ini, nilai lama yang tidak dikenali
    // daftar akan hilang dari <select> dan tersimpan sebagai kosong.
    const out = withOther(PEKERJAAN_LEGACY, 'PETANI IKAN HIAS');
    expect(out.some(([v]) => v === 'PETANI IKAN HIAS')).toBe(true);
    expect(out).toHaveLength(PEKERJAAN_LEGACY.length + 3);
  });

  it('nilai yang SUDAH ada di daftar tidak diduplikasi', () => {
    const out = withOther(PEKERJAAN_LEGACY, 'KASIR');
    const values = out.map(([v]) => v);
    expect(values.filter((v) => v === 'KASIR')).toHaveLength(1);
  });

  it('sentinel tidak ditambahkan dua kali walau extraValue = sentinel', () => {
    const out = withOther(PEKERJAAN_LEGACY, SENTINEL_LAINNYA);
    const values = out.map(([v]) => v);
    expect(values.filter((v) => v === SENTINEL_LAINNYA)).toHaveLength(1);
  });
});

describe('opsi-form — withEmpty (daftar tertutup TANPA "Lainnya")', () => {
  it('kosong di depan, TANPA sentinel di belakang', () => {
    // Inti helper ini: field tanpa kotak teks manual tidak boleh menawarkan
    // "ketik manual". Kalau sentinel muncul di sini, yang tersimpan adalah
    // string literal '__LAINNYA__'.
    const out = withEmpty(HUBUNGAN_KELUARGA);
    expect(out[0]).toEqual(OPSI_KOSONG);
    expect(out.map(([v]) => v)).not.toContain(SENTINEL_LAINNYA);
    expect(out).toHaveLength(HUBUNGAN_KELUARGA.length + 1);
  });

  it('nilai lama yang TIDAK ada di daftar tetap muncul sebagai opsi sendiri', () => {
    // 'WALI' sengaja dipilih karena memang TIDAK ada di HUBUNGAN_KELUARGA —
    // 'MERTUA' pernah dipakai di sini dan gagal, karena ternyata sudah ada di
    // daftar, jadi tesnya tidak menguji apa pun.
    expect(HUBUNGAN_KELUARGA.map(([v]) => v)).not.toContain('WALI');
    const out = withEmpty(HUBUNGAN_KELUARGA, 'WALI');
    expect(out.some(([v]) => v === 'WALI')).toBe(true);
    expect(out).toHaveLength(HUBUNGAN_KELUARGA.length + 2);
  });

  it('nilai yang SUDAH ada di daftar tidak diduplikasi', () => {
    const out = withEmpty(HUBUNGAN_KELUARGA, 'AYAH');
    expect(out.map(([v]) => v).filter((v) => v === 'AYAH')).toHaveLength(1);
  });

  it('extraValue = sentinel tidak menambahkan sentinel apa pun', () => {
    // Nilai sentinel yang tersimpan di data lama tidak boleh dipromosikan jadi
    // opsi yang bisa dipilih ulang.
    const out = withEmpty(HUBUNGAN_KELUARGA, SENTINEL_LAINNYA);
    expect(out.map(([v]) => v)).not.toContain(SENTINEL_LAINNYA);
    expect(out).toHaveLength(HUBUNGAN_KELUARGA.length + 1);
  });

  it('urutan nilai legacy dipertahankan persis (paritas)', () => {
    const out = withEmpty(HUBUNGAN_LEGACY);
    expect(out.slice(1).map(([v]) => v)).toEqual(HUBUNGAN_LEGACY.map(([v]) => v));
  });
});

describe('opsi-form — selectState (apa yang ditampilkan)', () => {
  it('kosong → opsi kosong, tanpa kotak manual', () => {
    expect(selectState(PEKERJAAN, '')).toEqual({ select: '', manual: '' });
    expect(selectState(PEKERJAAN, '   ')).toEqual({ select: '', manual: '' });
  });

  it('nilai yang dikenal → nilai itu, tanpa kotak manual', () => {
    expect(selectState(PEKERJAAN, 'KASIR')).toEqual({ select: 'KASIR', manual: '' });
  });

  it('sentinel tersimpan → sentinel, kotak manual kosong', () => {
    expect(selectState(PEKERJAAN, SENTINEL_LAINNYA)).toEqual({ select: SENTINEL_LAINNYA, manual: '' });
  });

  it('nilai tak dikenal → select parkir di sentinel + teks asli di kotak manual', () => {
    // Inilah yang membuat data legacy tidak "terlihat hilang" saat form dibuka.
    expect(selectState(PEKERJAAN, 'PETANI IKAN HIAS'))
      .toEqual({ select: SENTINEL_LAINNYA, manual: 'PETANI IKAN HIAS' });
  });
});

describe('opsi-form — resolveOther (apa yang DISIMPAN)', () => {
  it('entri daftar → nilainya sendiri', () => {
    expect(resolveOther('KASIR', '')).toBe('KASIR');
  });

  it('sentinel → teks manualnya, BUKAN sentinel', () => {
    expect(resolveOther(SENTINEL_LAINNYA, 'PETANI IKAN HIAS')).toBe('PETANI IKAN HIAS');
    expect(resolveOther(SENTINEL_LAINNYA, 'PETANI IKAN HIAS')).not.toBe(SENTINEL_LAINNYA);
  });

  it('sentinel tanpa teks manual → string kosong (bukan sentinel)', () => {
    expect(resolveOther(SENTINEL_LAINNYA, '')).toBe('');
  });
});

describe('opsi-form — isKnown', () => {
  it('true hanya untuk nilai yang persis ada di daftar', () => {
    expect(isKnown(PEKERJAAN, 'KASIR')).toBe(true);
    expect(isKnown(PEKERJAAN, 'kasir')).toBe(false);
    expect(isKnown(PEKERJAAN, 'PETANI IKAN HIAS')).toBe(false);
    expect(isKnown(PEKERJAAN, '')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Integritas daftar gabungan.
//
// Kenapa di sini dan bukan cuma `console.error` saat dev: assertion dev-only di
// `opsi-form.ts` hanya memeriksa **value** dan hanya jalan di mode dev — ia
// tidak pernah jalan di CI, jadi ia tidak bisa gagal di CI. Empat tes di bawah
// menggantikannya dengan pemeriksaan yang benar-benar dieksekusi, dan
// memperluasnya ke **label**, yang sebelumnya tidak diperiksa sama sekali.
// ---------------------------------------------------------------------------
describe('opsi-form — integritas daftar gabungan', () => {
  const LISTS: Array<[string, Array<[string, string]>]> = [
    ['PEKERJAAN', PEKERJAAN],
    ['JURUSAN', JURUSAN],
    ['HUBUNGAN_KELUARGA', HUBUNGAN_KELUARGA],
    ['KOTA', KOTA],
  ];

  it('tidak ada <option value> kembar di daftar gabungan', () => {
    // Dua <option> dengan value sama = React warning + browser diam-diam
    // memilih salah satu. Ini versi yang jalan di CI dari assertion dev-only.
    for (const [name, list] of LISTS) {
      const values = list.map(([v]) => v);
      const dupes = [...new Set(values.filter((v, i) => values.indexOf(v) !== i))];
      expect(dupes, `${name} punya value kembar: ${dupes.join(', ')}`).toEqual([]);
    }
  });

  it('tidak ada label kembar di daftar gabungan', () => {
    // Label kembar BUKAN masalah React — ia masalah manusia: kandidat melihat
    // dua baris yang tulisannya persis sama dan tidak punya cara membedakan
    // mana yang harus dipilih. Ini pernah terjadi di JURUSAN (`TEKNIK MESIN`
    // dan `TEKNIK MESIN (D3/S1)` sama-sama berlabel "TEKNIK MESIN (機械工学)").
    for (const [name, list] of LISTS) {
      const labels = list.map(([, l]) => l);
      const dupes = [...new Set(labels.filter((l, i) => labels.indexOf(l) !== i))];
      expect(dupes, `${name} punya label kembar: ${dupes.join(' | ')}`).toEqual([]);
    }
  });

  it('komposisi daftar gabungan tetap seperti yang didokumentasikan', () => {
    // Angka-angka ini juga dipakai di docs/UI_DESIGN_REVIEW.md §9. Kalau
    // salah satu berubah, dokumennya ikut perlu diperbarui.
    expect(PEKERJAAN_LEGACY).toHaveLength(25);
    // 115 = 100 sebelum 2026-10-30, +19 entri pertanian/peternakan per komoditas
    // (`PEKERJAAN_PERTANIAN`), −7 yang dipindahkan dari `PEKERJAAN_TAMBAHAN` ke
    // kelompok itu (tidak diduplikasi), +3 baru (teh, penebang kayu, jamur).
    // Angka ini SENGAJA ditulis, bukan diturunkan dari panjang tiap blok: yang
    // dijaga adalah "daftar tidak menyusut", dan penambahan yang lupa
    // didokumentasikan harus terlihat di sini.
    expect(PEKERJAAN).toHaveLength(115);
    // 94 -> 96 (2026-10-30): dua jurusan LPK (bahasa Jepang), diminta pemilik
    // supaya kandidat tidak mengetik jurusannya sendiri dengan ejaan berbeda.
    expect(JURUSAN).toHaveLength(96);
    expect(HUBUNGAN_LEGACY).toHaveLength(7);
    // 7 legacy + 12 hubungan berjenis kelamin (2026-10-21). Angka ini SENGAJA
    // dihitung ulang, bukan diturunkan dari `HUBUNGAN_LEGACY.length`: yang
    // dijaga adalah "daftar tidak menyusut", dan penambahan yang lupa
    // didokumentasikan harus terlihat di sini.
    expect(HUBUNGAN_KELUARGA).toHaveLength(31);
  });

  it('sentinel tidak pernah bocor ke dalam daftar data', () => {
    // Sentinel ditambahkan oleh `withOther`; kalau ia muncul di daftar data,
    // memilih "Lainnya" akan mengirim sentinel sebagai jawaban.
    for (const [name, list] of LISTS) {
      const has = list.some(([v]) => v === SENTINEL_LAINNYA);
      expect(has, `${name} mengandung sentinel`).toBe(false);
    }
  });
});

describe('opsi-form — daftar enum BERSAMA (AI CV + CV Master)', () => {
  // Tujuh daftar ini dulu hidup di `aiCvPairs.ts` (milik AI CV saja) sementara
  // `MasterFullForm.tsx` menyimpan SALINAN-nya sendiri. Salinan itu sudah
  // berbeda: `agama` di form Master berbunyi `BUDHA`/`KATHOLIK`, di sini
  // `BUDDHA`/`KATOLIK` — jadi satu agama BISA tersimpan dua ejaan.
  //
  // KOREKSI 2026-10-12: draf komentar sebelumnya menambahkan "terukur atas DB
  // live: `BUDHA` 3 baris, `KATHOLIK` 1 baris". Itu TIDAK diukur dan SALAH —
  // diukur ulang, `master_database_candidate.agama` dan `.religion` berisi 0
  // baris dengan ejaan itu. Drift-nya nyata di SUMBER (terlihat di
  // `git show 2dbcb44^`), belum pernah tertulis ke tabel. Jangan kembalikan
  // angka barisnya.
  //
  // Tes ini mengunci kedua sisi: nilai tiap daftar (yang ditulis ke DB) dan
  // fakta bahwa `valuesOf` mengembalikan nilai tanpa label kanji — sebab form
  // Master harus tetap berlabel istilah Indonesia.
  const BERSAMA: Record<string, [string, string][]> = {
    GENDER_PAIRS, AGAMA_PAIRS, STATUS_NIKAH_PAIRS, TANGAN_PAIRS,
    YA_TIDAK_PAIRS, RIWAYAT_JEPANG_PAIRS, GOLONGAN_DARAH,
  };

  it('valuesOf mengembalikan separuh NILAI saja, tanpa label kanji', () => {
    expect(valuesOf(GENDER_PAIRS)).toEqual(['LAKI-LAKI', 'PEREMPUAN']);
    expect(valuesOf(AGAMA_PAIRS)).toEqual([
      'ISLAM', 'KRISTEN', 'KATOLIK', 'HINDU', 'BUDDHA', 'KONGHUCU', 'LAINNYA',
    ]);
    expect(valuesOf(YA_TIDAK_PAIRS)).toEqual(['TIDAK', 'YA']);
    // Tidak ada label yang mengandung aksara Jepang yang ikut terbawa.
    for (const [name, list] of Object.entries(BERSAMA)) {
      for (const v of valuesOf(list)) {
        expect(/[\u3040-\u30ff\u4e00-\u9fff]/.test(v), `${name}: nilai mengandung kanji: ${v}`).toBe(false);
      }
    }
  });

  it('ejaan agama kanonik TIDAK memuat `BUDHA`/`KATHOLIK`', () => {
    // Dua ejaan inilah yang tersimpan di DB dan tidak dikenal daftar CV AI.
    const v = valuesOf(AGAMA_PAIRS);
    expect(v).not.toContain('BUDHA');
    expect(v).not.toContain('KATHOLIK');
    expect(v).toContain('BUDDHA');
    expect(v).toContain('KATOLIK');
  });

  it('BAHASA_JEPANG memuat delapan level sah, tanpa penanda `-` milik form Master', () => {
    // `-` adalah nilai DEFAULT form Master (`bhsJepang:'-'`), bukan level —
    // form Master menambahkannya sendiri. Kalau ia masuk ke daftar ini, ia
    // ikut muncul sebagai saran di <datalist> form kandidat.
    expect(BAHASA_JEPANG).toEqual([
      'N1', 'N2', 'N3', 'N4', 'N5', 'JFT BASIC A2', 'BELUM LULUS', 'BELUM TES',
    ]);
    expect(BAHASA_JEPANG).not.toContain('-');
  });

  it('tidak ada nilai yang mengandung spasi di tepinya (bentuk `AB +` di DB)', () => {
    // Data nyata punya `"AB +"`. Daftar opsi tidak boleh memuat bentuk
    // ber-spasi: itu akan mencocokkan baris yang salah, dan menyisakan baris
    // aslinya tetap tak dikenal. Normalisasi ada di `normalizeBloodType`.
    for (const [name, list] of Object.entries(BERSAMA)) {
      for (const [v, label] of list) {
        expect(v, `${name}: nilai punya spasi tepi`).toBe(v.trim());
        expect(label.trim(), `${name}: label punya spasi tepi`).toBe(label);
      }
    }
  });
});

// ==========================================
// TESTS: bidang SSW & ujian (2026-10-30)
//
// Permintaan pemilik: "ssw ternak juga gak ada" dan "masukkan dropdown semua
// prometric ujian yg bisa di indo id-jp nya beserta kasih tgl lulus nya".
// Dua hal yang harus dijaga di sini: 16 nilai legacy TIDAK berubah (baris
// `bidangssw` lama harus tetap cocok), dan daftar ujian SSW DITURUNKAN dari
// daftar bidang — bukan disalin — supaya menambah satu bidang tidak
// meninggalkan ujiannya.
// ==========================================
describe('opsi-form — bidang SSW & ujian', () => {
  it('SSW_BIDANG memuat 16 bidang legacy byte-identik + ternak & bidang baru', () => {
    const values = SSW_BIDANG.map(([v]) => v);
    // Enam belas nilai asli, urutannya tidak diubah.
    expect(values.slice(0, 10)).toEqual([
      'KAIGO', 'BUILDING CLEANING', 'FOUNDRY & PLASTIC', 'INDUSTRIAL MACHINERY',
      'ELECTRIC & ELECTRONIC', 'CONSTRUCTION', 'SHIPBUILDING', 'AUTOMOBILE REPAIR',
      'AVIATION', 'ACCOMMODATION',
    ]);
    expect(values).toContain('AGRICULTURE');
    expect(values).toContain('LIVESTOCK'); // 畜産 — "ssw ternak"
    expect(values).toContain('AUTOMOBILE TRANSPORT');
    expect(values).toContain('RAILWAY');
    expect(values).toContain('RESOURCE CIRCULATION');
    expect(new Set(values).size).toBe(values.length);
  });

  it('label LIVESTOCK menyebut 畜産 supaya tidak tertukar dengan 耕種', () => {
    const livestock = SSW_BIDANG.find(([v]) => v === 'LIVESTOCK');
    const agriculture = SSW_BIDANG.find(([v]) => v === 'AGRICULTURE');
    expect(livestock?.[1]).toContain('畜産');
    expect(agriculture?.[1]).toContain('耕種');
  });

  it('UJIAN_SSW diturunkan dari SSW_BIDANG — satu ujian per bidang', () => {
    expect(UJIAN_SSW).toHaveLength(SSW_BIDANG.length);
    expect(UJIAN_SSW.map(([v]) => v)).toContain('SSW LIVESTOCK');
    expect(UJIAN_JP.map(([v]) => v)).toContain('JFT-BASIC A2');
    expect(UJIAN_JP.map(([v]) => v)).toContain('JLPT N4');
    // Kode ujian SSW diberi awalan supaya tidak bertabrakan dengan nilai
    // `SSW_BIDANG` (`KAIGO` vs `SSW KAIGO`) di payload yang sama.
    expect(UJIAN_JP.map(([v]) => v)).not.toContain('KAIGO');
    expect(new Set(UJIAN_JP.map(([v]) => v)).size).toBe(UJIAN_JP.length);
  });

  it('JENIS_KERJA_PAIRS mencakup status kerja di luar karyawan tetap', () => {
    // "status kerja cuma dikit" — pemilik 2026-10-30.
    const values = JENIS_KERJA_PAIRS.map(([v]) => v);
    for (const v of ['KARYAWAN HARIAN', 'WIRAUSAHA', 'FREELANCE', 'PNS / ASN', 'TNI / POLRI', 'BELUM BEKERJA']) {
      expect(values, `status kerja tidak ada: ${v}`).toContain(v);
    }
    // Nilai lama tidak boleh hilang: baris `pekerjaan_*_jenis` memakainya.
    for (const v of ['KARYAWAN TETAP', 'KARYAWAN KONTRAK', 'PART TIME', 'MAGANG', 'USAHA KELUARGA']) {
      expect(values).toContain(v);
    }
  });
});
