// ==========================================
// TESTS: aiCvDraft — muat draf CV ke state flat AiCvForm
//
// Kenapa ini diuji ketat: panel admin di tab Pelamar memuat CV kandidat ke
// AiCvForm lalu menyimpannya kembali. Kalau satu kunci flat tidak terpetakan
// (atau hanya membaca satu dari beberapa kunci warisan), admin melihat kolom
// kosong, menekan simpan, dan data kandidat TERHAPUS. Tes di bawah mengunci
// cakupan lengkap + pembacaan multi-path itu.
// ==========================================
import { describe, it, expect } from 'vitest';
import {
  AI_CV_FLAT_KEYS,
  AI_CV_PATHS,
  applyAiCvRows,
  buildAiCvNested,
  isiYangKosongSaja,
  mapAiCvDraft,
  mergeAiDraft,
  parseAiCvDraft,
  parseAiCvRows,
  patchAiDenganKonflik,
} from './aiCvDraft';

describe('aiCvDraft — cakupan peta', () => {
  it('setiap kunci flat punya minimal satu path (kunci tak terpetakan = kolom selalu kosong)', () => {
    const missing = AI_CV_FLAT_KEYS.filter((k) => !AI_CV_PATHS[k] || AI_CV_PATHS[k]!.length === 0);
    expect(missing, 'kunci flat tanpa path di AI_CV_PATHS').toEqual([]);
  });

  it('tidak ada path yatim: setiap path di AI_CV_PATHS milik kunci flat yang dikenal', () => {
    const known = new Set<string>(AI_CV_FLAT_KEYS);
    const orphan = Object.keys(AI_CV_PATHS).filter((k) => !known.has(k));
    expect(orphan, 'kunci di AI_CV_PATHS yang tidak ada di AI_CV_FLAT_KEYS').toEqual([]);
  });

  it('kunci warisan yang kuncinya BEDA dari payload punya fallback (bukan hanya satu path)', () => {
    // Terukur dari legacy: tulis ≠ baca. Kalau daftar ini menyusut jadi satu
    // path, round-trip load→save mulai menghapus data.
    const needsFallback = [
      'keinginan_id', 'keinginan_jp', 'moti_id', 'moti_jp', 'pulang_id', 'pulang_jp',
      'keahlian_id', 'keahlian_jp', 'alasan_id', 'alasan_jp', 'gaji_yen', 'tabungan',
      'bhs_jepang', 'nilai', 'lisensi', 'alergi_id', 'medis_id', 'laka_id',
    ];
    for (const k of needsFallback) {
      expect(AI_CV_PATHS[k]!.length, k + ' harus punya >1 path').toBeGreaterThan(1);
    }
  });
});

describe('aiCvDraft — mapAiCvDraft', () => {
  it('membaca bentuk bersarang ke flat, dan melewati nilai kosong/placeholder "-"', () => {
    const out = mapAiCvDraft({
      identitas: { nama_lengkap: 'BUDI', paspor: '-', sim: '  ' },
      fisik: { tb: '170' },
      wawancara: { promosi_id: 'Rajin' },
    });
    expect(out.nama).toBe('BUDI');
    expect(out.tb).toBe('170');
    expect(out.promo_id).toBe('Rajin');
    // "-" dan spasi kosong bukan data — jangan mengisi state dengannya.
    expect('paspor' in out).toBe(false);
    expect('sim' in out).toBe(false);
  });

  it('kunci warisan terbaca dari path ALTERNATIF saat path utama kosong', () => {
    // Draf yang ditulis fieldPaths legacy (bukan payload AiCvForm).
    const legacyShaped = mapAiCvDraft({
      wawancara: {
        keinginan_id: 'Beli rumah',
        motivasi_id: 'Belajar budaya',
        rencana_pulang_id: 'Buka usaha',
        keahlian_id: 'Mengelas',
        alasan_bidang_id: 'Suka mesin',
        harapan_gaji: '200000',
        harapan_tabungan: '300 juta',
      },
      sertifikasi: { bahasa_jepang: 'N4', nilai: '120', lisensi: 'KAIGO' },
    });
    expect(legacyShaped.keinginan_id).toBe('Beli rumah');
    expect(legacyShaped.moti_id).toBe('Belajar budaya');
    expect(legacyShaped.pulang_id).toBe('Buka usaha');
    expect(legacyShaped.keahlian_id).toBe('Mengelas');
    expect(legacyShaped.alasan_id).toBe('Suka mesin');
    expect(legacyShaped.gaji_yen).toBe('200000');
    expect(legacyShaped.tabungan).toBe('300 juta');
    expect(legacyShaped.bhs_jepang).toBe('N4');
    expect(legacyShaped.nilai).toBe('120');
    expect(legacyShaped.lisensi).toBe('KAIGO');
  });

  it('path utama (yang ditulis AiCvForm) menang atas path warisan', () => {
    const out = mapAiCvDraft({
      wawancara: { keinginan_pribadi: 'BARU', keinginan_id: 'LAMA' },
    });
    expect(out.keinginan_id).toBe('BARU');
  });
});

describe('aiCvDraft — mergeAiDraft (AI di atas master)', () => {
  /**
   * `mergeAiDraft` returns `Record<string, unknown>`, which is honest — it
   * merges arbitrary blobs. Reading nested fields off it therefore needs a
   * narrowing step, and `as any` was doing that job while also switching off
   * every subsequent check (a typo in `.identitas.ktp` would have type-checked
   * fine). This asserts the shape ONCE, per nested read, so a wrong key is a
   * compile error rather than a silently-undefined assertion.
   *
   * `Record<string, unknown>` in, `Record<string, unknown>` out — no `any`.
   */
  const nested = (o: Record<string, unknown>, key: string): Record<string, unknown> => {
    const v = o[key];
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      throw new Error(`expected ${key} to be an object, got ${JSON.stringify(v)}`);
    }
    return v as Record<string, unknown>;
  };
  const list = (o: Record<string, unknown>, key: string): unknown[] => {
    const v = o[key];
    if (!Array.isArray(v)) {
      throw new Error(`expected ${key} to be an array, got ${JSON.stringify(v)}`);
    }
    return v;
  };

  /* 2026-11-03: presedensi DIBALIK. Dulu tes ini bernama "… dan AI menang" dan
     mengunci nilai AI menimpa kolom. Itu berlawanan dengan aturan server
     ("KOLOM MENANG; AI hanya mengisi yang kosong") dan itulah yang membuat
     profil dan CV AI menampilkan alamat berbeda — CV AI memuat versi
     `ai_data_json` yang lebih tua, lalu menyimpannya kembali ke kolom. */
  it('menggabungkan dalam-dalam dan KOLOM MASTER menang', () => {
    const merged = mergeAiDraft(
      { identitas: { nama_lengkap: 'BUDI', ktp: '3512' }, medis: { rokok: 'Tidak' } },
      { identitas: { nama_lengkap: 'BUDI SANTOSO' } },
    );
    expect(nested(merged, 'identitas').nama_lengkap).toBe('BUDI'); // kolom menang
    expect(nested(merged, 'identitas').ktp).toBe('3512');
    expect(nested(merged, 'medis').rokok).toBe('Tidak');
  });

  it('AI tetap MENGISI kunci yang belum ada di kolom', () => {
    // Inilah alasan merge ini ada: kunci khusus AI (promosi_id, alergi_id, …)
    // tidak punya kolom di master, jadi harus tetap terbaca.
    const merged = mergeAiDraft({ identitas: { nama: 'BUDI' } }, { wawancara: { promosi_id: 'Saya pekerja keras.' } });
    expect(nested(merged, 'wawancara').promosi_id).toBe('Saya pekerja keras.');
    expect(nested(merged, 'identitas').nama).toBe('BUDI');
  });

  it('alamat: kode pos dari kolom TIDAK hilang oleh versi AI yang lebih tua', () => {
    /* Kasus nyata (terukur 45 dari 58 baris berbeda). Kolom menyimpan alamat
       lengkap ber-kode pos; ai_data_json menyimpan hasil ekstraksi lama tanpa
       kode pos. Sebelum perbaikan, membuka CV AI lalu menyimpan menulis versi
       JSON kembali ke kolom — kode posnya hilang permanen. */
    const merged = mergeAiDraft(
      { identitas: { alamat: 'RT 001 RW 001, DESA KETANDAN, KEC. DAGANGAN, KAB. MADIUN, PROV. JAWA TIMUR 63172' } },
      { identitas: { alamat: 'DESA,KETANDAN RT01 RW01 .KEC,DAGANGAN .KAB,MADIUN .JAWA TIMUR' } },
    );
    expect(nested(merged, 'identitas').alamat).toContain('63172');
  });

  it('nilai AI kosong TIDAK menimpa nilai master yang terisi', () => {
    // AI sering mengembalikan '' untuk field yang belum ditanyakan; menimpanya
    // akan mengubah kolom master yang sudah benar jadi kosong.
    const merged = mergeAiDraft({ identitas: { ktp: '3512', sim: 'A' } }, { identitas: { ktp: '', sim: '-' } });
    expect(nested(merged, 'identitas').ktp).toBe('3512');
    expect(nested(merged, 'identitas').sim).toBe('A');
  });

  /* 2026-11-03: presedensi array DIBALIK, sama seperti skalar. Dulu array AI
     selalu menimpa, sehingga riwayat pendidikan/pekerjaan kembali ke versi lama
     — terukur 5 dari 12 kandidat punya jumlah baris JSON berbeda dari tabel
     anaknya. */
  it('array master menang; array AI hanya mengisi kalau master kosong', () => {
    const merged = mergeAiDraft({ pendidikan: [{ tingkat: 'SMA' }] }, { pendidikan: [] });
    expect(list(merged, 'pendidikan')).toEqual([{ tingkat: 'SMA' }]);

    const merged2 = mergeAiDraft({ pendidikan: [{ tingkat: 'SMA' }] }, { pendidikan: [{ tingkat: 'SMP' }] });
    expect(list(merged2, 'pendidikan')).toEqual([{ tingkat: 'SMA' }]); // master menang

    // Master belum punya baris sama sekali ⇒ AI boleh mengisi (jalur kandidat
    // yang riwayatnya hanya pernah masuk lewat ekstraksi AI).
    const merged3 = mergeAiDraft({ pendidikan: [] }, { pendidikan: [{ tingkat: 'SMP' }] });
    expect(list(merged3, 'pendidikan')).toEqual([{ tingkat: 'SMP' }]);
  });

  it('base null/undefined tetap menghasilkan objek', () => {
    expect(mergeAiDraft(null, null)).toEqual({});
    expect(mergeAiDraft(undefined, { a: '1' })).toEqual({ a: '1' });
  });
});

describe('aiCvDraft — parseAiCvDraft (balasan getDrafCvMaster)', () => {
  const response = {
    identitas: { nama_lengkap: 'BUDI', no_wa: '6281234567890' },
    fisik: { tb: '170' },
    // Kunci khusus AI hanya ada di sini — tanpa deep-merge, hilang.
    AIDATAJSON: JSON.stringify({
      medis: { alergi_id: 'Udang' },
      wawancara: { promosi_id: 'Disiplin' },
    }),
  };

  it('mem-parse AIDATAJSON lalu deep-merge di atas bagian master', () => {
    const out = parseAiCvDraft(response);
    expect(out.nama).toBe('BUDI');
    expect(out.hp).toBe('6281234567890');
    expect(out.tb).toBe('170');
    expect(out.alergi_id).toBe('Udang'); // dari AIDATAJSON
    expect(out.promo_id).toBe('Disiplin'); // dari AIDATAJSON
  });

  it("AIDATAJSON rusak atau '-' tidak melempar — bagian master tetap terbaca", () => {
    expect(parseAiCvDraft({ ...response, AIDATAJSON: '{bukan json' }).nama).toBe('BUDI');
    expect(parseAiCvDraft({ ...response, AIDATAJSON: '-' }).nama).toBe('BUDI');
    expect(parseAiCvDraft({ ...response, AIDATAJSON: undefined }).nama).toBe('BUDI');
  });

  it('balasan error ({error}) menghasilkan objek kosong, bukan lemparan', () => {
    expect(parseAiCvDraft({ error: 'Data Master belum ada (6281).' })).toEqual({});
    expect(parseAiCvDraft(null)).toEqual({});
  });
});

// ==========================================
// TESTS: parseAiCvRows — tiga seksi repeater
//
// Terukur 2026-10-07 pada /ai-cv: Pendidikan / Pekerjaan / Keluarga tampil
// KOSONG walaupun datanya ada di Supabase dan muncul di rirekisho. Sebabnya
// `parseAiCvDraft` mengembalikan `Record<string, string>` — satu kolom, satu
// nilai — sehingga array ketiga seksi itu tidak punya tempat dan dibuang.
// `parseAiCvRows` adalah pembaca yang hilang; tes di bawah mengunci
// penggabungan (union master + AI) dan normalisasi alias yang membuat baris
// dari kolom master DAN dari `ai_data_json` sama-sama terbaca.
// ==========================================
describe('aiCvDraft — parseAiCvRows (tiga seksi repeater)', () => {
  it('menggabungkan array master + AIDATAJSON dan menormalkan alias ke kunci flat form', () => {
    const out = parseAiCvRows({
      // Bentuk `buildMasterNested` (kolom master).
      pendidikan: [{ tingkat: 'SMA/SMK', nama_sekolah: 'SMAN 1', tahun_lulus: '2021' }],
      // Bentuk payload AI form (yang ditulis AiCvForm sendiri).
      AIDATAJSON: JSON.stringify({
        pendidikan: [{ tingkat: 'SMP', sekolah_id: 'SMPN 2', tahun_masuk: '2015' }],
        pekerjaan: [{ perusahaan: 'PT ABC', jabatan: 'Operator', gaji: '150000' }],
        keluarga: [{ hubungan: 'Ayah', nama: 'BUDI SENIOR', usia: '55' }],
      }),
    });
    // Union: master dulu, lalu AI — bukan saling menimpa.
    expect(out.pendidikan.map((r) => r.sekolah_id)).toEqual(['SMAN 1', 'SMPN 2']);
    expect(out.pendidikan[0].lulus).toBe('2021');
    expect(out.pendidikan[1].masuk).toBe('2015');
    expect(out.pekerjaan[0]).toMatchObject({ perusahaan_id: 'PT ABC', jabatan_id: 'Operator', gaji: '150000' });
    expect(out.keluarga[0]).toMatchObject({ hubungan_id: 'Ayah', nama: 'BUDI SENIOR', umur: '55' });
  });

  it('baris yang sama dari kedua sumber tidak digandakan', () => {
    const out = parseAiCvRows({
      pendidikan: [{ tingkat: 'SMA', nama_sekolah: 'SMAN 1' }],
      AIDATAJSON: JSON.stringify({ pendidikan: [{ tingkat: 'SMA', sekolah_id: 'SMAN 1' }] }),
    });
    expect(out.pendidikan).toHaveLength(1);
    expect(out.pendidikan[0].sekolah_id).toBe('SMAN 1');
  });

  /**
   * Keluhan pemilik 2026-10-21 ("data dobel dobel terus"): dua baris tanpa nama
   * sekolah, satu ber-tingkat `SMA/SMK` dari kolom master dan satu `SMK` dari
   * `ai_data_json`, tampil sebagai DUA baris kosong bertahun sama.
   */
  it('baris TANPA nama dengan ejaan jenjang setara tidak digandakan', () => {
    const out = parseAiCvRows({
      pendidikan: [{ tingkat: 'SMA/SMK', tahun_masuk: '2023' }],
      AIDATAJSON: JSON.stringify({ pendidikan: [{ tingkat: 'SMK', tahun_masuk: '2023' }] }),
    });
    expect(out.pendidikan).toHaveLength(1);
  });

  it('ejaan kanji dari payload AI form ikut terbaca (nama_sekolah_jp → sekolah_jp)', () => {
    const out = parseAiCvRows({
      AIDATAJSON: JSON.stringify({
        pendidikan: [{ tingkat: 'SMA', nama_sekolah: 'SMAN 1', nama_sekolah_jp: 'スマン1' }],
        pekerjaan: [{ nama_perusahaan: 'PT ABC', nama_perusahaan_jp: 'ABC社' }],
      }),
    });
    expect(out.pendidikan[0].sekolah_jp).toBe('スマン1');
    expect(out.pekerjaan[0].perusahaan_jp).toBe('ABC社');
  });

  it('tanpa data (atau AIDATAJSON rusak) → tiga array kosong, bukan lemparan', () => {
    const empty = { pendidikan: [], pekerjaan: [], keluarga: [] };
    expect(parseAiCvRows(null)).toEqual(empty);
    expect(parseAiCvRows({ AIDATAJSON: '-' })).toEqual(empty);
    expect(parseAiCvRows({ AIDATAJSON: '{bukan json' })).toEqual(empty);
  });

  it('baris tanpa satu pun kunci yang dikenal dibuang (tidak ada baris hantu)', () => {
    const out = parseAiCvRows({ pendidikan: [{}, { tingkat: 'SMP' }] });
    expect(out.pendidikan).toEqual([{ tingkat: 'SMP' }]);
  });
});

// ==========================================
// 2026-10-29 — state FLAT → bentuk BERSARANG untuk server AI.
//
// Root cause "terjemahkan semua kolom banyak yg ga berhasil": `handleSend`
// mengirim state FLAT (`cv.alamat`), sedangkan `buildRingkasData` dan
// `autoTranslateMissingJp` membaca BERSARANG (`identitas.alamat`). Akibatnya
// blok konteks kosong DAN auto-terjemahan menemukan nol pasangan — tanpa satu
// pun galat, sehingga tidak ada tes lama yang bisa melihatnya.
// ==========================================
describe('aiCvDraft — buildAiCvNested (flat → bersarang)', () => {
  it('kolom tunggal mendarat di path BERSARANG yang dibaca server', () => {
    const out = buildAiCvNested({
      alamat: 'DUSUN NGLINGI RT 001 RW 002 DESA GANDUKEPUH PONOROGO 63453',
      lebih_id: 'Disiplin',
      promo_id: 'Rajin',
      gender: 'LAKI-LAKI',
    }) as Record<string, Record<string, string>>;
    expect(out.identitas?.alamat).toContain('GANDUKEPUH');
    expect(out.wawancara?.kelebihan_id).toBe('Disiplin');
    expect(out.wawancara?.promosi_id).toBe('Rajin');
    expect(out.identitas?.gender).toBe('LAKI-LAKI');
    // Nilai kosong / sentinel tidak boleh membuat kunci hantu.
    expect(out.identitas && 'paspor' in out.identitas).toBeFalsy();
  });

  it('memakai path PERTAMA saja (ejaan yang kita tulis), bukan semua alias', () => {
    const out = buildAiCvNested({ moti_id: 'Belajar budaya' }) as Record<string, Record<string, string>>;
    expect(out.wawancara?.motivasi_ke_jepang).toBe('Belajar budaya');
    // `motivasi_id` adalah path warisan; menulis keduanya = nilai ganda.
    expect(out.wawancara && 'motivasi_id' in out.wawancara).toBeFalsy();
  });

  it('tiga repeater ikut terkirim dengan ejaan yang dibaca buildMasterNested', () => {
    const out = buildAiCvNested({}, {
      pendidikan: [{ id: 'r1', tingkat: 'SMA', sekolah_id: 'SMAN 1', sekolah_jp: 'スマン1', masuk: '', lulus: '2024' }],
      pekerjaan: [{ id: 'r2', perusahaan_id: 'PT ABC', jabatan_id: 'Operator' }],
      keluarga: [{ id: 'r3', nama: 'SITI', hubungan_id: 'IBU', pekerjaan_id: 'PETANI' }],
    }) as Record<string, Array<Record<string, string>>>;
    expect(out.pendidikan?.[0]).toEqual({ tingkat: 'SMA', sekolah: 'SMAN 1', sekolah_jp: 'スマン1', lulus: '2024' });
    expect(out.pekerjaan?.[0]).toEqual({ perusahaan: 'PT ABC', jabatan: 'Operator' });
    // Keluarga memakai `hubungan_id`/`pekerjaan` — ejaan `buildMasterNested`.
    expect(out.keluarga?.[0]).toEqual({ nama: 'SITI', hubungan_id: 'IBU', pekerjaan: 'PETANI' });
  });

  /* Keluhan pemilik 2026-11-02: *"selalu urutkan riwayat kerja sesuai tahun awal
     sampai terbaru … saat masuk ke template atau rirekisho berantakan
     kronologinya"*. Renderer sudah mengurutkan; yang TERSIMPAN masih urutan ketik.
     Tes ini mengunci urutan simpan, bukan urutan tampil. */
  it('pekerjaan diurutkan KRONOLOGIS saat disimpan (bukan urutan ketik)', () => {
    const out = buildAiCvNested({}, {
      pekerjaan: [
        { id: 'r1', perusahaan_id: 'PT TERBARU', masuk: '2021' },
        { id: 'r2', perusahaan_id: 'PT LAMA', masuk: '2015-04' },
        { id: 'r3', perusahaan_id: 'PT TENGAH', masuk: '2018-09' },
      ],
    }) as Record<string, Array<Record<string, string>>>;
    expect(out.pekerjaan?.map((p) => p.perusahaan)).toEqual(['PT LAMA', 'PT TENGAH', 'PT TERBARU']);
  });

  it('pendidikan diurutkan kronologis, dan jenjang memutus tahun yang sama', () => {
    const out = buildAiCvNested({}, {
      pendidikan: [
        { id: 'r1', tingkat: 'SMK', sekolah_id: 'SMK 1', masuk: '2018' },
        { id: 'r2', tingkat: 'SD', sekolah_id: 'SD 1', masuk: '2006' },
        { id: 'r3', tingkat: 'SMP', sekolah_id: 'SMP 1', masuk: '2012' },
      ],
    }) as Record<string, Array<Record<string, string>>>;
    expect(out.pendidikan?.map((p) => p.tingkat)).toEqual(['SD', 'SMP', 'SMK']);
  });

  it('keluarga TIDAK diurutkan — urutannya konvensi 続柄, bukan tahun', () => {
    const out = buildAiCvNested({}, {
      keluarga: [
        { id: 'r1', nama: 'BAPAK', hubungan_id: 'AYAH' },
        { id: 'r2', nama: 'IBU', hubungan_id: 'IBU' },
      ],
    }) as Record<string, Array<Record<string, string>>>;
    expect(out.keluarga?.map((k) => k.nama)).toEqual(['BAPAK', 'IBU']);
  });
});

describe('aiCvDraft — applyAiCvRows (balasan AI → baris repeater)', () => {
  const baris = [
    { id: 'r1', sekolah_id: 'SMAN 1', sekolah_jp: '', jurusan_id: 'IPA', jurusan_jp: '' },
    { id: 'r2', sekolah_id: 'SMPN 2', sekolah_jp: '', jurusan_id: '', jurusan_jp: '' },
  ];

  it('mengisi kolom Jepang pada baris yang cocok', () => {
    const out = applyAiCvRows('pendidikan', baris, [
      { sekolah: 'SMAN 1', sekolah_jp: 'スマン1', jurusan_jp: '理科' },
    ]);
    expect(out[0].sekolah_jp).toBe('スマン1');
    expect(out[0].jurusan_jp).toBe('理科');
    expect(out[1].sekolah_jp).toBe('');
  });

  it('TIDAK menempel ke baris lain saat urutan/isi berbeda', () => {
    // Model mengembalikan satu baris untuk SMPN 2 di indeks 0 — tanpa penjagaan
    // ID, nama sekolah orang lain akan menempel ke baris pertama.
    const out = applyAiCvRows('pendidikan', baris, [{ sekolah: 'SMPN 2', sekolah_jp: 'スンプン2' }]);
    expect(out[0].sekolah_jp).toBe('');
    expect(out[1].sekolah_jp).toBe('');
  });

  it('hanya kunci Jepang/katakana yang diambil (sisi Indonesia milik form)', () => {
    const fam = [{ id: 'f1', nama: 'SITI', hubungan_id: 'IBU', hubungan_jp: '', katakana: '' }];
    const out = applyAiCvRows('keluarga', fam, [{ nama: 'SITI', hubungan_jp: '母', katakana: 'スィティ', hubungan_id: 'AYAH' }]);
    expect(out[0].hubungan_jp).toBe('母');
    expect(out[0].katakana).toBe('スィティ');
    expect(out[0].hubungan_id).toBe('IBU');
  });
});

// 出身地 kanji pernah HILANG di dua arah sekaligus: `tempat_lahir_jp` tidak ada
// di AI_CV_PATHS (hasil terjemahan server dibuang) dan tidak dikirim saat simpan
// (kolomnya tidak pernah ditulis). Akibatnya satu baris berisi "Jepang" — kata
// Indonesia di kolom kanji — dan tidak ada layar yang bisa mengoreksinya.
describe('tempat_lahir_jp — bolak-balik lengkap', () => {
  it('terdaftar di daftar kunci flat (kalau tidak, state form tidak punya tempatnya)', () => {
    expect(AI_CV_FLAT_KEYS).toContain('tmplahir_jp');
  });

  it('dibaca dari balasan AI dan dikirim balik dengan path yang sama', () => {
    const flat = mapAiCvDraft({ identitas: { tempat_lahir_jp: 'ポノロゴ' } });
    expect(flat.tmplahir_jp).toBe('ポノロゴ');

    const nested = buildAiCvNested({ ...flat });
    expect((nested.identitas as Record<string, unknown>).tempat_lahir_jp).toBe('ポノロゴ');
  });

  it('tidak menciptakan kunci saat nilainya kosong', () => {
    const nested = buildAiCvNested({ tmplahir_jp: '' });
    expect(nested.identitas).toBeUndefined();
  });
});

// AI mengisi, bukan menimpa. Sebelum 2026-11-05 klien memakai
// `{...prev, ...patch}`: satu balasan chat mengganti SEMUA field yang
// dikembalikan model, termasuk yang sudah diketik/dikoreksi kandidat — lalu
// tersimpan ke DB saat tekan Simpan.
describe('hasil AI hanya mengisi yang kosong', () => {
  it('tidak menimpa nilai yang sudah ada', () => {
    const out = isiYangKosongSaja(
      { nama: 'AGUS SUSILO', tmplahir: '' },
      { nama: 'NAMA LAIN', tmplahir: 'PONOROGO' },
    );
    expect(out.nama).toBe('AGUS SUSILO');
    expect(out.tmplahir).toBe('PONOROGO');
  });

  it('mengisi field yang kosong/spasi saja', () => {
    const out = isiYangKosongSaja({ a: '', b: '   ' }, { a: '1', b: '2' });
    expect(out).toEqual({ a: '1', b: '2' });
  });

  it('baris repeater: JP yang sudah dikoreksi tangan tidak ditimpa', () => {
    const rows = [{ id: 'r1', sekolah_id: 'SMK PEMKAB', sekolah_jp: '県立工業高校' }];
    const out = applyAiCvRows('pendidikan', rows, [
      { sekolah: 'SMK PEMKAB', sekolah_jp: 'スミック・プムカブ' },
    ]);
    expect(out[0].sekolah_jp).toBe('県立工業高校');
  });
});

// 国公私 (Status Sekolah) punya tiga jalur dan dulu hanya SATU yang terpasang:
// `NESTED_ROW_KEYS` (tulis ke bersarang) ada, `ROW_KEYS` (baca balik ke form)
// tidak, dan payload simpan `AiCvForm` juga tidak mengirimnya. Akibatnya
// dropdown selalu kembali ke "—" setelah simpan, dan renderer menebak 公立/私立
// dari nama sekolah — persis yang dilaporkan pemilik 2026-11-05.
describe('status_sekolah — tiga jalur harus sepakat', () => {
  it('dibaca balik dari bentuk bersarang ke baris form', () => {
    const rows = parseAiCvRows({
      pendidikan: [{ tingkat: 'SMK', nama_sekolah: 'SMKN 1 JENANGAN', status_sekolah: 'NEGERI' }],
    });
    expect(rows.pendidikan[0]?.status_sekolah).toBe('NEGERI');
  });

  it('dikirim balik ke bentuk bersarang saat simpan', () => {
    const nested = buildAiCvNested({}, {
      pendidikan: [
        {
          id: 'r1', tingkat: 'LPK', sekolah_id: 'LPK AMANAH SAKURA', sekolah_jp: '',
          jurusan_id: 'BAHASA JEPANG', jurusan_jp: '', masuk: '', lulus: '',
          status_sekolah: 'SWASTA',
        },
      ],
    });
    const arr = nested.pendidikan as Record<string, unknown>[];
    expect(arr[0].status_sekolah).toBe('SWASTA');
  });

  it('ejaan lama negeri_swasta tetap terbaca', () => {
    const rows = parseAiCvRows({
      pendidikan: [{ tingkat: 'SMA', nama_sekolah: 'SMAN 1', negeri_swasta: 'NEGERI' }],
    });
    expect(rows.pendidikan[0]?.status_sekolah).toBe('NEGERI');
  });
});

/**
 * `patchAiDenganKonflik` — keputusan pemilik 2026-11-09: "jangan paksa masukin,
 * kasih pilihan admin mau masukin data yang mana".
 *
 * Yang dijaga: kolom KOSONG tetap terisi otomatis (tidak ada yang bisa hilang),
 * dan kolom yang SUDAH berisi nilai BERBEDA tidak pernah ditimpa tanpa
 * keputusan — tetapi juga tidak dibuang diam-diam seperti `isiYangKosongSaja`
 * (yang membuat admin menyimpulkan "AI-nya rusak").
 */
describe('patchAiDenganKonflik', () => {
  it('kolom kosong langsung diisi, tanpa konflik', () => {
    const r = patchAiDenganKonflik({ nama_lengkap: '', alamat: '  ' }, {
      nama_lengkap: 'Budi',
      alamat: 'Jl. Merdeka 1',
    });
    expect(r.hasil).toEqual({ nama_lengkap: 'Budi', alamat: 'Jl. Merdeka 1' });
    expect(r.konflik).toEqual([]);
  });

  it('nilai yang SAMA bukan konflik dan bukan perubahan', () => {
    const r = patchAiDenganKonflik({ nama_lengkap: 'Budi' }, { nama_lengkap: '  Budi ' });
    expect(r.hasil.nama_lengkap).toBe('Budi');
    expect(r.konflik).toEqual([]);
  });

  it('nilai BERBEDA → masuk konflik, form TIDAK diubah', () => {
    const r = patchAiDenganKonflik({ nama_lengkap: 'Budi Santoso', alamat: '' }, {
      nama_lengkap: 'Budi S.',
      alamat: 'Jl. Baru 2',
    });
    // Yang kosong tetap masuk; yang bentrok TIDAK.
    expect(r.hasil.nama_lengkap).toBe('Budi Santoso');
    expect(r.hasil.alamat).toBe('Jl. Baru 2');
    expect(r.konflik).toEqual([{ key: 'nama_lengkap', lama: 'Budi Santoso', baru: 'Budi S.' }]);
  });

  it('nilai kosong dari AI diabaikan (tidak menghapus isi form)', () => {
    const r = patchAiDenganKonflik({ alamat: 'Jl. Lama' }, { alamat: '', nama_lengkap: '   ' });
    expect(r.hasil.alamat).toBe('Jl. Lama');
    expect(r.konflik).toEqual([]);
  });
});
