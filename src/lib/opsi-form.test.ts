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
  PEKERJAAN, PEKERJAAN_LEGACY, JURUSAN, JURUSAN_SMK, JURUSAN_SMA, JURUSAN_KULIAH,
  KOTA, HUBUNGAN_LEGACY, HUBUNGAN_KELUARGA,
  SENTINEL_LAINNYA, OPSI_KOSONG, OPSI_LAINNYA,
  withOther, isKnown, selectState, resolveOther, withEmpty,
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

  it('PEKERJAAN = legacy + tambahan, dan legacy tetap di depan', () => {
    expect(PEKERJAAN.length).toBeGreaterThan(PEKERJAAN_LEGACY.length);
    // Legacy harus mendahului tambahan: kandidat yang pekerjaannya sudah ada
    // di daftar lama melihat pilihannya di posisi yang sama seperti dulu.
    expect(PEKERJAAN.slice(0, PEKERJAAN_LEGACY.length)).toEqual(PEKERJAAN_LEGACY);
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

  it('HUBUNGAN_KELUARGA = legacy + tambahan, legacy di depan', () => {
    expect(HUBUNGAN_KELUARGA.slice(0, HUBUNGAN_LEGACY.length)).toEqual(HUBUNGAN_LEGACY);
  });

  it('JURUSAN menggabungkan SMK + SMA + Kuliah tanpa duplikat', () => {
    expect(JURUSAN).toEqual([...JURUSAN_SMK, ...JURUSAN_SMA, ...JURUSAN_KULIAH]);
    const values = JURUSAN.map(([v]) => v);
    expect(new Set(values).size).toBe(values.length);
    // Ketiga jenjang benar-benar terisi — kalau salah satu kosong, "tambah
    // jurusan" yang diminta user tidak benar-benar terjadi.
    expect(JURUSAN_SMK.length).toBeGreaterThan(10);
    expect(JURUSAN_SMA.length).toBeGreaterThan(2);
    expect(JURUSAN_KULIAH.length).toBeGreaterThan(10);
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
    expect(PEKERJAAN).toHaveLength(100);
    expect(JURUSAN).toHaveLength(94);
    expect(HUBUNGAN_LEGACY).toHaveLength(7);
    expect(HUBUNGAN_KELUARGA).toHaveLength(19);
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
