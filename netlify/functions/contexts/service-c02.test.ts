// ==========================================
// TESTS: C02 parity crosscheck (2026-09-05) — MasterFullForm payload contract
//
// Root bugs found by adversarial pass:
// (1) MASTER_COLUMN_MAP mapped BOTH eksJepang and lamaJepang to
//     status_eks_jepang — the write loop iterates in map order, so
//     lamaJepang (tahun, step 2) overwrote eksJepang ('EKS TOKUTEI GINO',
//     step 5) whenever both were filled → kolom terkorup.
// (2) Keluarga slot 1 ditulis tanpa usia → keluarga_1_usia lama TERHAPUS
//     saat simpan ulang.
// (3) Slot riwayat kosong ditulis '' → baris pendidikan/pekerjaan lama
//     terhapus saat simpan ulang.
// Fix: lamaJepang dialihkan ke ai_data_json.wawancara.lama_di_jepang
// (skema chat.ts), slot kosong tidak ditulis. Pure builders → DB-free.
// ==========================================
import { describe, it, expect } from 'vitest';
import { buildMasterBody, buildAiOverflow, mergeAiOverflow, buildMasterNested, buildRiwayatSlots, pruneAiRiwayat, masterColumnsFromAi } from './master-data';
import { TABLE_COLUMNS } from '../_lib/db/schema.generated';

describe('C02 — buildMasterBody (payload MasterFullForm → kolom master)', () => {
  it('eksJepang TIDAK ditimpa lamaJepang (kolisi status_eks_jepang)', () => {
    const body = buildMasterBody({ wa: '6281', eksJepang: 'EKS TOKUTEI GINO', lamaJepang: '3' });
    expect(body.status_eks_jepang).toBe('EKS TOKUTEI GINO');
  });

  it('lamaJepang dialihkan ke ai_data_json.wawancara.lama_di_jepang', () => {
    const o = buildAiOverflow({ lamaJepang: '3' }) as Record<string, any>;
    expect(o.wawancara).toEqual({ lama_di_jepang: '3' });
  });

  it('mergeAiOverflow menggabung wawancara tanpa menghapus isi lama', () => {
    const out = mergeAiOverflow(
      { wawancara: { lama_di_jepang: '2', riwayat_jepang: 'EKS MAGANG' } },
      { wawancara: { lama_di_jepang: '5' } },
    );
    expect(out.wawancara).toEqual({ lama_di_jepang: '5', riwayat_jepang: 'EKS MAGANG' });
  });

  it('keluarga slot 1 menyimpan usia; slot kosong tidak ditulis', () => {
    const body = buildMasterBody({
      keluarga: [{ nama: 'A', hubungan: 'AYAH', usia: '45', pekerjaan: 'PETANI' }],
    });
    expect(body.keluarga_1_nama).toBe('A');
    expect(body.keluarga_1_hubungan).toBe('AYAH');
    expect(body.keluarga_1_usia).toBe('45');
    expect(body.keluarga_1_pekerjaan).toBe('PETANI');
    expect(body.keluarga_2_nama).toBeUndefined();
  });

  it('slot riwayat kosong tidak menimpa kolom lama (pendidikan 2-5, pekerjaan 2-3)', () => {
    const body = buildMasterBody({ pendidikan: [{ tingkat: 'SMA', nama_sekolah: 'SMAN 1' }] });
    expect(body.pendidikan_1_tingkat).toBe('SMA');
    expect(body.pendidikan_2_tingkat).toBeUndefined();
    expect(body.pendidikan_3_nama_sekolah).toBeUndefined();
    expect(body.pekerjaan_2_nama_perusahaan).toBeUndefined();
  });

  it('keluarga tanpa usia → keluarga_1_usia tidak ditulis (tidak menghapus data lama)', () => {
    const body = buildMasterBody({ keluarga: [{ nama: 'A', hubungan: 'AYAH' }] });
    expect(body.keluarga_1_nama).toBe('A');
    expect(body.keluarga_1_usia).toBeUndefined();
  });

  it('kolom yang tidak ada di tabel difilter (keluarga_1_gaji, keluarga_2_nama)', () => {
    const body = buildMasterBody({ keluarga: [{ nama: 'A', gaji: '5jt' }] });
    expect(body.keluarga_1_gaji).toBeUndefined();
    expect(body.keluarga_2_nama).toBeUndefined();
  });

  it('alias legacy jft_text/ssw_text dipetakan ke nilai/lisensi', () => {
    const body = buildMasterBody({ jft_text: 'A2', ssw_text: 'PERAWAT' });
    expect(body.jft).toBe('A2');
    expect(body.bidangssw).toBe('PERAWAT');
  });

  it('pendidikan string legacy (CV mini) tidak menulis slot array', () => {
    const body = buildMasterBody({ pendidikan: 'SMA' });
    expect(body.pendidikan_1_tingkat).toBeUndefined();
  });
});


describe('C02 — buildMasterNested (kunci prefill baru)', () => {
  it('mengekspos no_coe/paspor/kontak darurat + lama_di_jepang dari ai_data_json', () => {
    const n = buildMasterNested({
      no_coe: 'COE-1', tgl_terbit_pasport: '2024-01-01', exp_pasport: '2029-01-01',
      kota_terbit_pasport: 'SURABAYA', kontak_darurat_nama: 'SITI',
      kontak_darurat_hubungan: 'ISTRI', kontak_darurat_wa: '628111',
      ai_data_json: JSON.stringify({ wawancara: { lama_di_jepang: '3' } }),
    });
    expect(n.identitas.no_coe).toBe('COE-1');
    expect(n.identitas.tgl_terbit_paspor).toBe('2024-01-01');
    expect(n.identitas.exp_paspor).toBe('2029-01-01');
    expect(n.identitas.kota_terbit_paspor).toBe('SURABAYA');
    expect(n.identitas.kontak_darurat_nama).toBe('SITI');
    expect(n.identitas.kontak_darurat_hubungan).toBe('ISTRI');
    expect(n.identitas.hp_darurat).toBe('628111');
    expect(n.wawancara.lama_di_jepang).toBe('3');
  });

  it('ai_data_json rusak → lama_di_jepang kosong (tidak crash)', () => {
    const n = buildMasterNested({ ai_data_json: 'not-json' });
    expect(n.wawancara.lama_di_jepang).toBe('');
  });

  /**
   * Keluhan pemilik 2026-10-21: "kenapa ini kok data dobel dobel terus".
   *
   * Dua baris tanpa NAMA sekolah — satu dari kolom master, satu dari
   * `ai_data_json` — adalah baris yang sama, tetapi kunci lamanya memakai
   * ejaan `tingkat` mentah, jadi `SMK` dan `SMA/SMK` tidak pernah bertemu dan
   * keduanya tampil di form sebagai dua baris kosong bertahun sama.
   */
  it('pendidikan tanpa nama: "SMK" dan "SMA/SMK" menyatu jadi SATU baris', () => {
    const n = buildMasterNested({
      pendidikan_1_tingkat: 'SMK',
      pendidikan_1_tahun_masuk: '2023',
      ai_data_json: JSON.stringify({ pendidikan: [{ tingkat: 'SMA/SMK', tahun_masuk: '2023' }] }),
    });
    expect(n.pendidikan).toHaveLength(1);
  });

  it('pendidikan tanpa nama: jenjang BERBEDA tetap dua baris', () => {
    // Dedupe tidak boleh menelan baris yang memang berbeda — kalau tidak,
    // memperbaiki "dobel" akan menghapus riwayat sungguhan.
    const n = buildMasterNested({
      pendidikan_1_tingkat: 'SD',
      pendidikan_1_tahun_masuk: '2014',
      pendidikan_2_tingkat: 'SMP',
      pendidikan_2_tahun_masuk: '2020',
    });
    expect(n.pendidikan).toHaveLength(2);
  });
});

// ===========================================================================
// FISIK & MEDIS DARI CV AI — LUBANG YANG DIUKUR 2026-10-22
// ===========================================================================
// Kandidat jalur CV AI hanya menulis `ai_data_json` (`_lib/ai/cv.ts`); kolom
// master untuk fisik/medis tidak pernah disentuh. `buildMasterNested` membaca
// KOLOM saja untuk dua blok itu, jadi rirekisho/CV-template/biodata mereka
// tercetak dengan mata, golongan darah, dan ukuran kepala kosong.
//
// Diukur lewat REST atas 56 baris ber-`ai_data_json`:
//   medis.mata_kiri  kolom kosong 39 · AI punya 23 ⇒ 23 hilang
//   golongan_darah   kolom kosong 32 · AI punya 22 ⇒ 22 hilang
//   fisik.topi       kolom kosong 42 · AI punya  9 ⇒  9 hilang
//
// Prioritas (dikoreksi pemilik 2026-10-22): KOLOM menang, AI hanya mengisi yang
// kosong. Blok ini menguji arah "AI mengisi kolom kosong"; arah "kolom menang"
// diuji di bawahnya.
describe('C02 — fisik & medis: nilai CV AI tidak boleh hilang dari berkas', () => {
  it('kolom kosong + AI terisi ⇒ nilai AI yang dipakai (mata, rokok)', () => {
    const n = buildMasterNested({
      mata_kiri: '', merokok: '',
      ai_data_json: JSON.stringify({ medis: { mata_kiri: '1.0', rokok: 'TIDAK' } }),
    });
    expect(n.medis.mata_kiri).toBe('1.0');
    expect(n.medis.rokok).toBe('TIDAK');
  });

  it('fisik: ukuran topi/baju/sepatu dari AI saat kolom kosong', () => {
    const n = buildMasterNested({
      ai_data_json: JSON.stringify({ fisik: { topi: '58', baju: 'M', sepatu: '26' } }),
    });
    expect(n.fisik.topi).toBe('58');
    expect(n.fisik.baju).toBe('M');
    expect(n.fisik.sepatu).toBe('26');
  });

  it('golongan darah dari AI ikut DINORMALKAN ("AB +" → "AB+")', () => {
    // Tanpa normalisasi, <select> di form tampil kosong walau datanya ada.
    const n = buildMasterNested({
      ai_data_json: JSON.stringify({ identitas: { golongan_darah: 'AB +' } }),
    });
    expect(n.identitas.golongan_darah).toBe('AB+');
  });

  it('KOLOM menang saat kolom dan AI dua-duanya terisi (koreksi manual = mutlak)', () => {
    const n = buildMasterNested({
      mata_kiri: '0.5',
      ai_data_json: JSON.stringify({ medis: { mata_kiri: '1.2' } }),
    });
    expect(n.medis.mata_kiri).toBe('0.5');
  });

  it('kolom tetap dipakai bila AI tidak punya nilainya (tidak ada regresi)', () => {
    const n = buildMasterNested({
      mata_kiri: '0.8', ukuran_topi: '57', golongan_darah: 'O',
      ai_data_json: JSON.stringify({ medis: { mata_kiri: '' }, fisik: {} }),
    });
    expect(n.medis.mata_kiri).toBe('0.8');
    expect(n.fisik.topi).toBe('57');
    expect(n.identitas.golongan_darah).toBe('O');
  });

  it('ai_data_json rusak ⇒ tetap kolom, tidak crash', () => {
    const n = buildMasterNested({ mata_kiri: '0.9', ai_data_json: '{rusak' });
    expect(n.medis.mata_kiri).toBe('0.9');
    expect(n.fisik.topi).toBe('');
  });
});

// ===========================================================================
// masterColumnsFromAi — seksi AI → KOLOM master (2026-10-22)
// ===========================================================================
// Keluhan pemilik: *"cv ai dan form master semua menulis dan sync ke
// masterdatabase, harusnya datanya sama kok bisa beda"*. Tabelnya sama,
// KOLOM-nya tidak: Form Master lewat `buildMasterBody`, CV AI hanya
// `ai_data_json` + slot riwayat + URL. Diukur: 687 sel kosong di 56 baris.
//
// Uji tabelnya di sini (murni); jalur tulis yang benar-benar mengirim body ke
// PostgREST diuji di `e2e/ai-cv-submit.test.ts`.
describe('C02 — masterColumnsFromAi (seksi AI → kolom master)', () => {
  it('memetakan ejaan AI ke ejaan KOLOM (bukan sekadar menyalin kunci)', () => {
    const cols = masterColumnsFromAi({
      identitas: { katakana: 'ブディ', status_nikah: 'BELUM MENIKAH', anak: '2', ktp: '3577', paspor: 'C123', sim: 'A' },
      fisik: { topi: '58', baju: 'M', sepatu: '26', tangan_dominan: 'KANAN' },
      medis: { rokok: 'TIDAK', alkohol: 'TIDAK', riwayat_medis_id: 'ASMA' },
      wawancara: { promosi_id: 'PEKERJA KERAS', gaji_yen: '180000' },
    });
    expect(cols).toEqual({
      furigana: 'ブディ', status_pernikahan: 'BELUM MENIKAH', jumlah_anak: '2',
      nik: '3577', no_paspor: 'C123', driver_license: 'A',
      ukuran_topi: '58', ukuranbaju: 'M', ukuransepatu: '26', tangandominan: 'KANAN',
      merokok: 'TIDAK', minum_alkohol: 'TIDAK', riwayat_penyakit: 'ASMA',
      promosi_diri: 'PEKERJA KERAS', harapan_gaji_yen: '180000',
    });
  });

  it('kunci alternatif: ejaan CV AI lama tetap terbaca', () => {
    const cols = masterColumnsFromAi({ medis: { alergi: 'UDANG' }, wawancara: { kelebihan: 'TELITI' } });
    expect(cols.alergi).toBe('UDANG');
    expect(cols.kelebihan).toBe('TELITI');
  });

  it('nilai KOSONG tidak menghasilkan kunci — kolom lama tidak boleh terhapus', () => {
    const cols = masterColumnsFromAi({ fisik: { topi: '', baju: '   ' }, medis: { mata_kiri: null } });
    expect(cols).toEqual({});
  });

  it('seksi yang hilang / bukan objek tidak melempar', () => {
    expect(masterColumnsFromAi(null)).toEqual({});
    expect(masterColumnsFromAi('bukan objek')).toEqual({});
    expect(masterColumnsFromAi({ fisik: [] })).toEqual({});
    expect(masterColumnsFromAi({})).toEqual({});
  });

  it('hanya kolom yang ADA di kontrak skema (kalau tidak, PATCH dibatalkan 400)', () => {
    // `writeBodyFor` membuang kolom asing dan mencatatnya sebagai drift — tapi
    // satu kunci hantu di body yang sama membatalkan SELURUH baris di PostgREST.
    const cols = masterColumnsFromAi({
      identitas: { nama_lengkap: 'A', katakana: 'B', panggilan: 'C', tempat_lahir: 'D', tgl_lahir: '2000-01-01', umur: '25', gender: 'L', agama: 'ISLAM', golongan_darah: 'O', status_nikah: 'X', anak: '1', email: 'a@b.c', alamat: 'E', ktp: 'F', paspor: 'G', sim: 'H', status_eks_jepang: 'I' },
      fisik: { tb: '1', bb: '2', topi: '3', baju: '4', sepatu: '5', tangan_dominan: '6', tahan_ac: '7' },
      medis: { mata_kiri: '8', mata_kanan: '9', kacamata: '10', buta_warna: '11', tato: '12', rokok: '13', alkohol: '14', alergi_id: '15', riwayat_medis_id: '16', riwayat_kecelakaan_id: '17' },
      wawancara: { promosi_id: '18', kelebihan_id: '19', kekurangan_id: '20', hobi_id: '21', keahlian_id: '22', alasan_id: '23', moti_id: '24', keinginan_id: '25', pulang_id: '26', tujuan_id: '27', gaji_yen: '28', tabungan: '29' },
    });
    const known = TABLE_COLUMNS.master_database_candidate;
    expect(Object.keys(cols).filter((c) => !known.includes(c))).toEqual([]);
  });
});


// ===========================================================================
// HAPUS BARIS RIWAYAT HARUS BERLAKU
// ===========================================================================
// Keluhan pemilik 2026-10-10: sebuah sekolah dihapus di form, disimpan, tapi
// muncul lagi. Dua tempat menyimpan riwayat yang sama dan dua-duanya tidak
// pernah dikosongkan: kolom slot `pendidikan_N_*` (hanya ditulis kalau terisi)
// dan `ai_data_json` (hanya ditambah/diperbarui). `buildMasterNested`
// menggabungkan keduanya saat MEMBACA, jadi baris yang dihapus hidup kembali.
describe('hapus baris riwayat harus berlaku', () => {
  it('payload PARSIAL tidak mengosongkan slot — "tidak terkirim" bukan "dihapus"', () => {
    const body = buildRiwayatSlots({ pendidikan: [{ tingkat: 'SD', nama_sekolah: 'SDN 1' }] }, false);
    expect(body.pendidikan_1_tingkat).toBe('SD');
    expect('pendidikan_2_tingkat' in body).toBe(false);
    expect('pendidikan_5_nama_sekolah' in body).toBe(false);
  });

  it('payload LENGKAP mengosongkan slot yang tidak terpakai', () => {
    const body = buildRiwayatSlots({ pendidikan: [{ tingkat: 'SD', nama_sekolah: 'SDN 1' }] }, true);
    expect(body.pendidikan_1_nama_sekolah).toBe('SDN 1');
    for (const i of [2, 3, 4, 5]) {
      expect(body[`pendidikan_${i}_tingkat`]).toBe('');
      expect(body[`pendidikan_${i}_nama_sekolah`]).toBe('');
    }
  });

  it('slot yang terisi SEBAGIAN pun tuntas — kolom yang kini kosong ikut dihapus', () => {
    const body = buildRiwayatSlots({ pendidikan: [{ tingkat: 'SMA', nama_sekolah: 'SMAN 1' }] }, true);
    expect(body.pendidikan_1_tingkat).toBe('SMA');
    expect(body.pendidikan_1_jurusan_id).toBe('');
    expect(body.pendidikan_1_tahun_lulus).toBe('');
  });

  it('buildMasterBody meneruskan penanda `riwayatLengkap`', () => {
    const body = buildMasterBody({ riwayatLengkap: true, pendidikan: [{ tingkat: 'SD' }] });
    expect(body.pendidikan_2_tingkat).toBe('');
  });
});

describe('ai_data_json tidak lagi menghidupkan baris yang dihapus', () => {
  it('entri yang tidak ada di payload dibuang, kunci lain tidak tersentuh', () => {
    const out = pruneAiRiwayat(
      {
        pendidikan: [
          { tingkat: 'SD', nama_sekolah: 'SDN 1' },
          { tingkat: 'SMP', nama_sekolah: 'SMPN 2' },
        ],
        kenalan_jepang: { nama_id: 'X' },
      },
      { pendidikan: [{ tingkat: 'SD', nama_sekolah: 'SDN 1' }] },
    );
    const list = out.pendidikan as Array<Record<string, unknown>>;
    expect(list).toHaveLength(1);
    expect(list[0].nama_sekolah).toBe('SDN 1');
    expect(out.kenalan_jepang).toEqual({ nama_id: 'X' });
  });

  it('daftar yang TIDAK dikirim tidak disentuh sama sekali', () => {
    const out = pruneAiRiwayat({ pekerjaan: [{ nama_perusahaan: 'PT A' }] }, { pendidikan: [] });
    expect(out.pekerjaan as unknown[]).toHaveLength(1);
  });

  it('semua baris dihapus ⇒ kuncinya dibuang', () => {
    const out = pruneAiRiwayat({ pendidikan: [{ tingkat: 'SD', nama_sekolah: 'SDN 1' }] }, { pendidikan: [] });
    expect('pendidikan' in out).toBe(false);
  });
  it('buildMasterNested: sekolah yang sama dari KOLOM dan ai_data_json jadi SATU baris', () => {
    // Terukur 2026-10-12 atas 234 baris master gdw: kolom menulis `masuk` DAN
    // `tahun_masuk` (periode "2016201620192019") sementara AI hanya "20162019"
    // => kunci tak cocok => sekolah tampil DUA KALI (8 baris).
    const row = {
      pendidikan_1_tingkat: 'SMK',
      pendidikan_1_nama_sekolah: 'SMK RADEN PATAH',
      pendidikan_1_tahun_masuk: '2016',
      pendidikan_1_tahun_lulus: '2019',
      ai_data_json: JSON.stringify({ pendidikan: [{ tingkat: 'SMK', sekolah_id: 'SMK RADEN PATAH', masuk: '2016', lulus: '2019' }] }),
    };
    const out = buildMasterNested(row) as { pendidikan: Array<Record<string, unknown>> };
    expect(out.pendidikan).toHaveLength(1);
    expect(out.pendidikan[0].sekolah).toBe('SMK RADEN PATAH');
  });
});

describe('keluarga ber-nama kanji tidak boleh hilang (2026-10-13)', () => {
  // Keluhan pemilik: "kok saya donload biodata ga ke donload semuanya".
  // mergeRiwayatArrays menjatuhkan SETIAP baris yang kuncinya KOSONG, dan kunci
  // keluarga = cleanKey(nama) sementara cleanKey membuang seluruh karakter
  // non-ASCII => nama ber-kanji (ミセナヤンティ) menghasilkan kunci '' => barisnya
  // dibuang. Terukur atas 234 baris master gdw: 5 kandidat kehilangan 8 anggota
  // keluarga; ASJ00094 RIO ARMANDA PUTRA 3 masuk -> 0 keluar, sehingga SELURUH
  // blok keluarga hilang dari CV DAN berkas biodata.
  it('anggota keluarga bernama kanji tetap muncul', () => {
    const n = buildMasterNested({
      keluarga_1_nama: 'ミセナヤンティ', keluarga_1_hubungan: 'IBU', keluarga_1_usia: '50',
    }) as { keluarga: Array<Record<string, unknown>> };
    expect(n.keluarga).toHaveLength(1);
    expect(n.keluarga[0].nama).toBe('ミセナヤンティ');
  });

  it('baris kanji dari KOLOM dan ai_data_json tidak digandakan', () => {
    const n = buildMasterNested({
      keluarga_1_nama: 'ミセナヤンティ', keluarga_1_hubungan: 'IBU', keluarga_1_usia: '50',
      ai_data_json: JSON.stringify({ keluarga: [{ nama: 'ミセナヤンティ', hubungan: 'IBU', umur: '50' }] }),
    }) as { keluarga: Array<Record<string, unknown>> };
    expect(n.keluarga).toHaveLength(1);
  });

  // KONTROL POSITIF: dedupe nama Latin harus TETAP berlaku, supaya perbaikan
  // "jangan buang kunci kosong" tidak berubah jadi "jangan dedupe sama sekali".
  it('dedupe keluarga nama Latin tetap berlaku', () => {
    const n = buildMasterNested({
      keluarga_1_nama: 'SUPARNO', keluarga_1_hubungan: 'AYAH',
      ai_data_json: JSON.stringify({ keluarga: [{ nama: 'SUPARNO', hubungan: 'AYAH' }] }),
    }) as { keluarga: Array<Record<string, unknown>> };
    expect(n.keluarga).toHaveLength(1);
  });
});

describe('buildMasterNested: wawancara dari ai_data_json saat kolom kosong (2026-10-22)', () => {
  it('mengisi wawancara dari AI ketika kolom master kosong', () => {
    const n = buildMasterNested({
      kelebihan: '', motivasi_ke_jepang: '', keinginan_pribadi: '',
      ai_data_json: JSON.stringify({
        wawancara: {
          kelebihan_id: 'Disiplin', kelebihan_jp: 'まじめ',
          motivasi_ke_jepang: 'Ingin bekerja', motivasi_ke_jepang_jp: '働きたい',
          keinginan_pribadi: 'Bahagia', keinginan_pribadi_jp: '幸せ',
          lama_di_jepang: '3',
        },
      }),
    }) as { wawancara: Record<string, unknown> };
    expect(n.wawancara.kelebihan_id).toBe('Disiplin');
    expect(n.wawancara.kelebihan_jp).toBe('まじめ');
    expect(n.wawancara.motivasi_ke_jepang).toBe('Ingin bekerja');
    expect(n.wawancara.motivasi_ke_jepang_jp).toBe('働きたい');
    expect(n.wawancara.keinginan_id).toBe('Bahagia');
    expect(n.wawancara.keinginan_jp).toBe('幸せ');
    expect(n.wawancara.lama_di_jepang).toBe('3');
  });

  it('KOLOM menang atas AI — koreksi manual adalah kebenaran mutlak', () => {
    // Dikoreksi pemilik 2026-10-22: *"kolom yang bisa manual itu kebenaran
    // mutlak; data AI cuma membantu mengisi kolom"*. Versi sebelumnya
    // (`903ceef`) membalikkannya.
    const n = buildMasterNested({
      kelebihan: 'Rajin', motivasi_ke_jepang: 'Semangat',
      ai_data_json: JSON.stringify({
        wawancara: { kelebihan_id: 'Disiplin', motivasi_ke_jepang: 'Ingin bekerja' },
      }),
    }) as { wawancara: Record<string, unknown> };
    expect(n.wawancara.kelebihan_id).toBe('Rajin');
    expect(n.wawancara.motivasi_ke_jepang).toBe('Semangat');
  });

  it('A BOLEH DIHAPUS: kolom lengkap ⇒ membuang ai_data_json tidak mengubah hasil', () => {
    // Invarian inti "A = alat bantu, B = kebenaran". JSON di bawah sengaja
    // berisi nilai BERBEDA; kalau ia masih menimpa kolom, hasilnya berubah.
    const kolom = { kelebihan: 'Rajin', motivasi_ke_jepang: 'Semangat', mata_kiri: '1.0', tb: '170' };
    const denganAi = buildMasterNested({
      ...kolom,
      ai_data_json: JSON.stringify({
        wawancara: { kelebihan_id: 'Disiplin', motivasi_ke_jepang: 'Ingin bekerja' },
        medis: { mata_kiri: '2.0' },
        fisik: { tb: '180' },
      }),
    });
    const tanpaAi = buildMasterNested({ ...kolom });
    expect(denganAi).toEqual(tanpaAi);
  });

  it('promosi_diri (kolom) → promosi_id (output) lewat fallback AI', () => {
    const n = buildMasterNested({
      promosi_diri: '', promosi_diri_jp: '',
      ai_data_json: JSON.stringify({ wawancara: { promosi_id: 'Saya tekun', promosi_jp: '私は熱心です' } }),
    }) as { wawancara: Record<string, unknown> };
    expect(n.wawancara.promosi_id).toBe('Saya tekun');
    expect(n.wawancara.promosi_jp).toBe('私は熱心です');
  });
});
