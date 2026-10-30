// ==========================================
// TESTS: actions-master — kolom master yang TIDAK ada di tabel + penyimpanan
// overflow ke ai_data_json.
//
// LATAR (2026-08-16): skema master_database_candidate waktu itu tidak punya
// keluarga_N_gaji, keluarga slot 2-5, jurusan slot 1/2/4/5, pekerjaan_3_gaji,
// kenalan pekerjaan/usia/alamat. Menulis kolom itu = HTTP 400 PGRST204 =
// SELURUH simpan gagal. Penjaganya dulu bernama MASTER_COLUMN_MISSING: satu
// daftar tangan berisi kolom yang "tidak ada".
//
// KENAPA DAFTAR ITU DIBUANG (2026-10-25): daftar tangan adalah pengganti skema,
// dan ia BASI. Migrasi 019 MENAMBAH kolom-kolom itu — tetapi daftarnya tetap
// menghapus nilainya, jadi data yang sudah punya tempat tetap tidak tersimpan.
// Penggantinya adalah kontrak yang dihasilkan dari database: writeBodyFor()
// membuang kolom di luar schema.generated.ts dan mencatatnya sebagai drift.
// Tes di bawah menjaga invarian itu, bukan isi sebuah daftar.
// ==========================================
import { describe, it, expect } from 'vitest';
import { buildAiOverflow, mergeAiOverflow, buildMasterBody, buildMasterNested } from '../contexts/master-data';
import { TABLE_COLUMNS } from '../_lib/db/schema.generated';

describe('buildMasterBody — setiap kolom yang ditulis ADA di kontrak', () => {
  const CONTRACT = new Set(TABLE_COLUMNS.master_database_candidate || []);

  it('kontrol: kontrak master terbaca (bukan himpunan kosong)', () => {
    // Tanpa ini, kontrak yang gagal dimuat membuat tes berikutnya lolos hampa.
    expect(CONTRACT.size).toBeGreaterThan(150);
  });

  it('baris slot penuh tidak menghasilkan satu pun kolom di luar kontrak', () => {
    // Bentuk payload = yang dikirim Form Master setelah resolveOther().
    const body = buildMasterBody({
      wa: '6281', nama: 'UJI', riwayatLengkap: true,
      pendidikan: Array.from({ length: 5 }, (_, i) => ({
        tingkat: 'SMA', nama_sekolah: `S${i}`, nama_sekolah_jp: `学校${i}`,
        jurusan: 'IPA', jurusan_jp: '理科', tahun_masuk: '2000', tahun_lulus: '2003',
      })),
      pekerjaan: Array.from({ length: 3 }, (_, i) => ({
        nama_perusahaan: `P${i}`, nama_perusahaan_jp: `会社${i}`,
        jabatan: 'J', jabatan_jp: '職', tahun_masuk: '2000', tahun_keluar: '2001', gaji: '1',
      })),
      keluarga: Array.from({ length: 5 }, (_, i) => ({
        hubungan: 'AYAH', hubungan_jp: '父', nama: `N${i}`, usia: '50', pekerjaan: 'P', gaji: '1',
      })),
    });
    const outside = Object.keys(body).filter((c) => !CONTRACT.has(c));
    expect(outside).toEqual([]);
  });

  it('kanji tiap baris riwayat punya kolom (dulu dibuang tanpa jejak)', () => {
    const body = buildMasterBody({
      pendidikan: [{ tingkat: 'SMA', nama_sekolah: 'SMAN 1', nama_sekolah_jp: '第一高校', jurusan: 'IPA', jurusan_jp: '理科' }],
      pekerjaan: [{ nama_perusahaan: 'PT A', nama_perusahaan_jp: 'A社', jabatan: 'OP', jabatan_jp: '作業員' }],
      keluarga: [{ nama: 'BUDI', hubungan: 'AYAH', hubungan_jp: '父' }],
    });
    expect(body.pendidikan_1_sekolah_jp).toBe('第一高校');
    expect(body.pendidikan_1_jurusan_jp).toBe('理科');
    expect(body.pekerjaan_1_perusahaan_jp).toBe('A社');
    expect(body.pekerjaan_1_jabatan_jp).toBe('作業員');
    expect(body.keluarga_1_hubungan_jp).toBe('父');
  });

  it('slot keluarga 2-5 dan gaji kini tersimpan ke kolom, bukan hanya JSON', () => {
    const body = buildMasterBody({
      keluarga: [{ nama: 'A' }, { nama: 'B' }, { nama: 'C' }, { nama: 'D' }, { nama: 'E' }],
    });
    expect(body.keluarga_2_nama).toBe('B');
    expect(body.keluarga_5_nama).toBe('E');
  });

  /* ── Menghapus isi sebuah kotak harus BENAR-BENAR menghapus ────────────────
     Pemilik 2026-10-30: *"dihapus, kok balik lagi"*. `buildMasterNested`
     membaca KOLOM lebih dulu, jadi selama `buildMasterBody` melewati nilai
     kosong, field yang dikosongkan di form hidup lagi begitu form dibuka ulang
     dan di CV cetak. `formLengkap` adalah pernyataan pemanggil bahwa payload
     memuat SELURUH form — hanya kalau itu benar, kosong berarti dihapus. */
  it('formLengkap: field yang dikirim KOSONG mengosongkan kolomnya', () => {
    const body = buildMasterBody({ nama: 'BUDI', tb: '', bb: '', formLengkap: true });
    expect(body.nama_lengkap).toBe('BUDI');
    expect(body.tb).toBe('');
    expect(body.bb).toBe('');
  });

  it('tanpa formLengkap, field kosong TIDAK menyentuh kolom (pemanggil parsial)', () => {
    const body = buildMasterBody({ nama: 'BUDI', tb: '' });
    expect(body.nama_lengkap).toBe('BUDI');
    expect('tb' in body).toBe(false);
  });
});

describe('buildAiOverflow — nilai form yang kolomnya tidak ada di tabel', () => {
  it('null kalau tidak ada yang perlu disimpan', () => {
    expect(buildAiOverflow({ wa: '6281', nama: 'X' })).toBeNull();
  });

  it('kenalan → kenalan_jepang (hanya non-kosong)', () => {
    const o = buildAiOverflow({
      kenalanNama: 'KENJI',
      kenalanAlamat: 'TOKYO',
      kenalanUsia: '',
    }) as Record<string, any>;
    expect(o.kenalan_jepang).toEqual({
      nama_id: 'KENJI',
      alamat_id: 'TOKYO',
    });
  });

  it('jurusan slot 1 masuk (slot 3 dilewati — kolomnya ada)', () => {
    const o = buildAiOverflow({
      pendidikan: [
        { tingkat: 'SD', namaSekolah: 'SDN A', jurusan: 'IPA' },
        {},
        { tingkat: 'SMA', namaSekolah: 'SMAN B', jurusan: 'IPS' },
        {},
        {},
      ],
    }) as Record<string, any>;
    expect(o.pendidikan).toHaveLength(1);
    expect(o.pendidikan[0]).toEqual({
      slot: 0,
      entry: { tingkat: 'SD', sekolah: 'SDN A', jurusan_id: 'IPA' },
    });
  });

  it('gaji pekerjaan slot 3 → pekerjaan; keluarga slot 2 → keluarga', () => {
    const o = buildAiOverflow({
      pekerjaan: [{}, {}, { namaPt: 'PT X', gaji: '5.000.000' }],
      keluarga: [
        { hubungan: 'AYAH', nama: 'A', gaji: '' },
        { hubungan: 'IBU', nama: 'B', usia: 50, pekerjaan: 'IRT' },
        {},
        {},
        {},
      ],
    }) as Record<string, any>;
    expect(o.pekerjaan).toEqual([{ slot: 2, entry: { perusahaan: 'PT X', gaji: '5.000.000' } }]);
    expect(o.keluarga).toEqual([
      { slot: 1, entry: { nama: 'B', umur: '50', usia: '50', hubungan: 'IBU', pekerjaan: 'IRT' } },
    ]);
  });
});

describe('mergeAiOverflow — deep-merge ke ai_data_json (newest-wins, isi lama utuh)', () => {
  it('kenalan_jepang digabung tanpa menghapus isi lama', () => {
    const ai = { kenalan_jepang: { nama_id: 'KENJI', nama_jp: 'ケンジ' } };
    const out = mergeAiOverflow(ai, {
      kenalan_jepang: { alamat_id: 'TOKYO', nama_jp: 'ケンジ2' },
    });
    expect(out.kenalan_jepang).toEqual({
      nama_id: 'KENJI',
      nama_jp: 'ケンジ2',
      alamat_id: 'TOKYO',
    });
  });

  it('pendidikan dicocokkan per sekolah; data lama (sekolah_jp) dipertahankan', () => {
    const ai = {
      pendidikan: [{ tingkat: 'SD', sekolah: 'SDN A', sekolah_jp: 'Ａ小学校' }],
    };
    const out = mergeAiOverflow(ai, {
      pendidikan: [{ slot: 0, entry: { tingkat: 'SD', sekolah: 'SDN A', jurusan_id: 'IPA' } }],
    });
    expect(out.pendidikan[0]).toEqual({
      tingkat: 'SD',
      sekolah: 'SDN A',
      sekolah_jp: 'Ａ小学校',
      jurusan_id: 'IPA',
    });
  });

  it('keluarga slot baru diisi sampai index slot', () => {
    const out = mergeAiOverflow(
      { keluarga: [{ nama: 'A' }] },
      { keluarga: [{ slot: 2, entry: { nama: 'C', hubungan: 'ADIK' } }] },
    );
    expect(out.keluarga).toEqual([{ nama: 'A' }, {}, { nama: 'C', hubungan: 'ADIK' }]);
  });
});

/**
 * Migrasi 022 (2026-10-27): 41 kolom yang menutup sel CV yang dulu tidak punya
 * sumber. Yang diuji bukan "kolomnya ada", melainkan JALURNYA UTUH:
 * payload form → kolom → `buildMasterNested` → yang dibaca renderer.
 *
 * Tanpa tes ini, satu kunci yang lupa dipetakan di `MASTER_COLUMN_MAP` akan
 * lolos: field muncul di form, tersimpan ke `ai_data_json`, dan kolomnya tetap
 * kosong — persis keluhan pemilik 2026-10-22 ("harusnya datanya sama").
 */
describe('migrasi 022 — form → kolom → nested', () => {
  const payload = {
    visa: '技能実習1号', negaraLain: 'Malaysia 2019', jarakJakarta: '780',
    lamaPenerbangan: '1 jam 40 menit', rencanaSim: '2027-08', wilayahSekolah: 'Jawa Timur',
    lamaBelajarJp: '6 bulan', statusBelajarJp: 'sedang belajar', babBelajarJp: '25',
    levelJepang: 'N4レベル', bhsInggris: 'menengah', bahasaLain: 'Mandarin dasar',
    sertifikatLain: '簿記3級', catatanCv: 'Siap ditempatkan', tesHitung: '85',
    tesPushup: '30', tesSquat: '40', tinggalKursus: '2', olahraga: 'Futsal', mbti: 'ENFP',
    kenalanStatusTinggal: '技能実習2号 (2024-2027)',
    pekerjaan: [{ nama_perusahaan: 'PT A', jenis: 'KARYAWAN TETAP', bidang: 'Manufaktur', catatan: 'lembur penuh' }],
    keluarga: [{ nama: 'BUDI', hubungan: 'AYAH', tinggal: 'SERUMAH', hp: '081234567', gaji: '150000' }],
  };

  it('semua kolom baru ditulis dari payload form', () => {
    const b = buildMasterBody(payload);
    expect(b.visa_jepang).toBe('技能実習1号');
    expect(b.negara_lain).toBe('Malaysia 2019');
    expect(b.jarak_jakarta_km).toBe('780');
    expect(b.lama_penerbangan).toBe('1 jam 40 menit');
    expect(b.rencana_sim_bulan).toBe('2027-08');
    expect(b.wilayah_sekolah).toBe('Jawa Timur');
    expect(b.lama_belajar_jp).toBe('6 bulan');
    expect(b.status_belajar_jp).toBe('sedang belajar');
    expect(b.bab_belajar_jp).toBe('25');
    expect(b.level_bahasa_jepang).toBe('N4レベル');
    expect(b.level_bahasa_inggris).toBe('menengah');
    expect(b.bahasa_lain).toBe('Mandarin dasar');
    expect(b.sertifikat_lain).toBe('簿記3級');
    expect(b.catatan_cv).toBe('Siap ditempatkan');
    expect(b.tes_hitung).toBe('85');
    expect(b.tes_pushup).toBe('30');
    expect(b.tes_squat).toBe('40');
    expect(b.tinggal_kursus_tahun).toBe('2');
    expect(b.olahraga).toBe('Futsal');
    expect(b.mbti).toBe('ENFP');
    expect(b.kenalan_di_jepang_status_tinggal).toBe('技能実習2号 (2024-2027)');
    expect(b.pekerjaan_1_jenis).toBe('KARYAWAN TETAP');
    expect(b.pekerjaan_1_bidang).toBe('Manufaktur');
    expect(b.pekerjaan_1_catatan).toBe('lembur penuh');
    expect(b.keluarga_1_tinggal).toBe('SERUMAH');
    expect(b.keluarga_1_hp).toBe('081234567');
    expect(b.keluarga_1_gaji).toBe('150000');
  });

  it('kolomnya dibaca kembali ke bentuk yang dipakai renderer CV', () => {
    const n = buildMasterNested(buildMasterBody(payload));
    expect(n.identitas.visa_jepang).toBe('技能実習1号');
    expect(n.identitas.wilayah_sekolah).toBe('Jawa Timur');
    expect(n.sertifikasi.lama_belajar_jp).toBe('6 bulan');
    expect(n.sertifikasi.level_bahasa_inggris).toBe('menengah');
    expect(n.fisik.tes_pushup).toBe('30');
    expect(n.wawancara.mbti).toBe('ENFP');
    expect(n.kenalan_jepang.status_tinggal).toBe('技能実習2号 (2024-2027)');
    expect(n.pekerjaan[0].jenis).toBe('KARYAWAN TETAP');
    expect(n.pekerjaan[0].bidang).toBe('Manufaktur');
    expect(n.keluarga[0].tinggal).toBe('SERUMAH');
    expect(n.keluarga[0].hp).toBe('081234567');
    // `keluarga_N_gaji` dulu ditulis tetapi TIDAK PERNAH dibaca.
    expect(n.keluarga[0].gaji).toBe('150000');
  });
});
