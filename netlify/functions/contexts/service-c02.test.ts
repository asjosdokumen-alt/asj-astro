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
import { buildMasterBody, buildAiOverflow, mergeAiOverflow, buildMasterNested, buildRiwayatSlots, pruneAiRiwayat } from './master-data';

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
