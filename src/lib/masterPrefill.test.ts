// ==========================================
// TESTS: masterPrefill — map nested draft (getDrafCvMaster) ke state
// MasterFullForm. Pure mapper, DB-free.
// ==========================================
import { describe, it, expect } from 'vitest';
import { mapMasterNestedToForm } from './masterPrefill';

const NESTED: any = {
  identitas: {
    nama_lengkap: 'BUDI', katakana: 'ブディ', panggilan: 'Budi', tgl_lahir: '1990-01-01',
    umur: '35', gender: 'LAKI-LAKI', agama: 'ISLAM', golongan_darah: 'O',
    status_nikah: 'MENIKAH', anak: '1', email: 'budi@x.id', alamat: 'SURABAYA',
    hp: '6281234567890', ktp: '351234', paspor: 'P123', no_coe: 'COE-1',
    tgl_terbit_paspor: '2024-01-01', exp_paspor: '2029-01-01', kota_terbit_paspor: 'SURABAYA',
    status_eks_jepang: 'EKS TOKUTEI GINO',
    kontak_darurat_nama: 'SITI', kontak_darurat_hubungan: 'ISTRI', hp_darurat: '628111',
  },
  fisik: { tb: '170', bb: '65', topi: 'M', baju: 'L', sepatu: '42', tangan_dominan: 'KANAN', tahan_ac: 'YA' },
  medis: { mata_kiri: '5/5', mata_kanan: '5/5', kacamata: 'TIDAK', buta_warna: 'TIDAK', tato: 'TIDAK', tindik: 'TIDAK', rokok: 'TIDAK', alkohol: 'TIDAK' },
  wawancara: { promosi_id: 'P', kelebihan_id: 'K1', kekurangan_id: 'K2', keahlian_khusus: 'AH', hobi_id: 'SEPAK', alasan_memilih_bidang: 'AB', motivasi_ke_jepang: 'M', keinginan_pribadi: 'ING', rencana_setelah_pulang: 'RP', tujuan_ke_jepang: 'TJ', lama_di_jepang: '3', gaji_yen: '200000', tabungan: '50jt' },
  sertifikasi: { bahasa: 'N3', jft: 'A2', ssw: 'PERAWAT', bidang: 'KEPERAWATAN' },
  pendidikan: [{ tingkat: 'SMA', nama_sekolah: 'SMAN 1', tahun_masuk: '2005', tahun_lulus: '2008', jurusan: 'IPA' }],
  pekerjaan: [{ perusahaan: 'PT X', jabatan: 'STAFF', tahun_masuk: '2010', tahun_keluar: '2015', gaji: '3jt' }],
  keluarga: [{ nama: 'SITI', hubungan: 'ISTRI', usia: '30', pekerjaan: 'IRT' }],
  kenalan_jepang: { nama_id: 'KENJI', hubungan_id: 'TEMAN', pekerjaan_id: 'KARYAWAN', usia: '32', alamat_id: 'TOKYO' },
};

describe('mapMasterNestedToForm — prefill MasterFullForm dari getDrafCvMaster', () => {
  it('memetakan identitas/fisik/medis/wawancara/sertifikasi ke data datar', () => {
    const p = mapMasterNestedToForm(NESTED);
    expect(p.data.nama).toBe('BUDI');
    expect(p.data.furigana).toBe('ブディ');
    expect(p.data.tglLahir).toBe('1990-01-01');
    expect(p.data.eksJepang).toBe('EKS TOKUTEI GINO');
    expect(p.data.noCoe).toBe('COE-1');
    expect(p.data.tglTerbitPaspor).toBe('2024-01-01');
    expect(p.data.expPaspor).toBe('2029-01-01');
    expect(p.data.kotaPaspor).toBe('SURABAYA');
    expect(p.data.lamaJepang).toBe('3');
    expect(p.data.tb).toBe('170');
    expect(p.data.merokok).toBe('TIDAK');
    expect(p.data.bhsJepang).toBe('N3');
    expect(p.data.nilai).toBe('A2');
    expect(p.data.lisensi).toBe('KEPERAWATAN');
    expect(p.data.lisensi2).toBe('PERAWAT');
  });

  it('memetakan kontak darurat + kenalan jepang', () => {
    const p = mapMasterNestedToForm(NESTED);
    expect(p.daruratNama).toBe('SITI');
    expect(p.daruratHubungan).toBe('ISTRI');
    expect(p.daruratWa).toBe('628111');
    expect(p.kenalan).toEqual({ nama: 'KENJI', usia: '32', hubungan: 'TEMAN', pekerjaan: 'KARYAWAN', alamat: 'TOKYO' });
  });

  it('memetakan array riwayat (pendidikan/pekerjaan/keluarga)', () => {
    const p = mapMasterNestedToForm(NESTED);
    expect(p.eduList).toEqual([{ jenjang: 'SMA', nama: 'SMAN 1', thnAwal: '2005', thnAkhir: '2008', jurusan: 'IPA', jurusanManual: '', alamat: '' }]);
    expect(p.jobList[0]).toEqual({ perusahaan: 'PT X', jabatan: 'STAFF', jabatanManual: '', thnAwal: '2010', thnAkhir: '2015', gaji: '3jt', alasan: '' });
    expect(p.famList[0]).toEqual({ nama: 'SITI', hubungan: 'ISTRI', usia: '30', pekerjaan: 'IRT', pekerjaanManual: '' });
  });

  it('nested kosong → data kosong + satu baris default per list', () => {
    const p = mapMasterNestedToForm({});
    expect(p.data.nama).toBe('');
    expect(p.data.usia).toBe('');
    expect(p.eduList).toHaveLength(1);
    expect(p.jobList).toHaveLength(1);
    expect(p.famList).toHaveLength(1);
    expect(p.kenalan.nama).toBe('');
    expect(p.daruratWa).toBe('');
  });

  it('null/undefined → string kosong, bukan literal null', () => {
    const p = mapMasterNestedToForm({ identitas: { nama_lengkap: null, umur: undefined } });
    expect(p.data.nama).toBe('');
    expect(p.data.usia).toBe('');
  });

  it('keluarga tanpa usia → usia kosong (prefill tidak mengarang angka)', () => {
    const p = mapMasterNestedToForm({ keluarga: [{ nama: 'A', hubungan: 'AYAH' }] });
    expect(p.famList).toEqual([{ nama: 'A', hubungan: 'AYAH', usia: '', pekerjaan: '', pekerjaanManual: '' }]);
  });

  it('list melebihi kapasitas form dipotong (pendidikan max 5, pekerjaan max 3, keluarga max 5)', () => {
    const p = mapMasterNestedToForm({
      pendidikan: Array.from({ length: 7 }, (_, i) => ({ tingkat: 'SD', nama: 'S' + i })),
      pekerjaan: Array.from({ length: 5 }, (_, i) => ({ perusahaan: 'P' + i })),
      keluarga: Array.from({ length: 7 }, (_, i) => ({ nama: 'K' + i })),
    });
    expect(p.eduList).toHaveLength(5);
    expect(p.jobList).toHaveLength(3);
    expect(p.famList).toHaveLength(5);
  });
});
