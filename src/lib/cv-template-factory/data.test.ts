import { describe, it, expect } from 'vitest';
import { normalizeMasterData } from './data';

describe('normalizeMasterData', () => {
  it('converts flat row to CandidateData', () => {
    const row = {
      nama_lengkap: 'Tanaka',
      gender: 'PEREMPUAN',
      tgl_lahir: '1990-01-15',
      usia: '33',
      tb: '175',
      bb: '70',
    };
    const data = normalizeMasterData(row);
    expect(data.identitas.nama_lengkap).toBe('Tanaka');
    expect(data.identitas.gender).toBe('PEREMPUAN');
    expect(data.identitas.tgl_lahir).toBe('1990-01-15');
    expect(data.identitas.umur).toBe('33');
    expect(data.fisik.tb).toBe('175');
    expect(data.fisik.bb).toBe('70');
  });

  it('resolves nested AIDATAJSON fields', () => {
    const row = {
      nama_lengkap: 'Sato',
      AIDATAJSON: JSON.stringify({
        wawancara: { motivasi_ke_jepang: 'Saya ingin' },
        sertifikasi: { bahasa_jepang: 'JLPT N2' },
      }),
    };
    const data = normalizeMasterData(row);
    expect(data.wawancara.motivasi_ke_jepang).toBe('Saya ingin');
    expect(data.sertifikasi.jft).toBe('JLPT N2');
  });

  it('master row field takes priority over AI data', () => {
    const row = {
      nama_lengkap: 'Sato',
      AIDATAJSON: JSON.stringify({ nama_lengkap: 'Suzuki' }),
    };
    const data = normalizeMasterData(row);
    expect(data.identitas.nama_lengkap).toBe('Sato');
  });

  it('handles empty AIDATAJSON gracefully', () => {
    const row = { nama_lengkap: 'Kimura' };
    const data = normalizeMasterData(row);
    expect(data.identitas.nama_lengkap).toBe('Kimura');
  });

  it('merges pendidikan arrays from master + AI with dedupe', () => {
    const row = {
      pendidikan_1_tingkat: 'SMA',
      pendidikan_1_nama_sekolah: 'SMAN 1',
      AIDATAJSON: JSON.stringify({
        pendidikan: [{ tingkat: 'SMA', sekolah: 'SMAN 1' }],
      }),
    };
    const data = normalizeMasterData(row);
    expect(data.pendidikan.length).toBe(1);
  });

  it('resolves uploads from row.uploads.photo', () => {
    const row = {
      uploads: { photo: 'https://cdn/photo.jpg' },
    };
    const data = normalizeMasterData(row);
    expect(data.uploads.photo).toBe('https://cdn/photo.jpg');
  });

  it('falls back to row.pas_photo when uploads.photo is empty', () => {
    const row: Record<string, unknown> = { pas_photo: 'https://cdn/pas.jpg' };
    const data = normalizeMasterData(row);
    expect(data.uploads.photo).toBe('https://cdn/pas.jpg');
  });

  it('keeps raw reference', () => {
    const row = { nama_lengkap: 'Watanabe' };
    const data = normalizeMasterData(row);
    expect(data.raw).toBe(row);
  });

  it('returns empty arrays for missing array data', () => {
    const row = {};
    const data = normalizeMasterData(row);
    expect(data.pendidikan).toEqual([]);
    expect(data.pekerjaan).toEqual([]);
    expect(data.keluarga).toEqual([]);
  });

  // ------------------------------------------------------------------
  // ORDERING + KEY SHAPE — the two things the port dropped from legacy.
  // Excel/PDF/DOCX all read `data.pendidikan`, so enforcing here is what
  // makes every renderer inherit the baku SD → SMP → SMA order.
  // ------------------------------------------------------------------
  it('pendidikan diurutkan baku SD → SMP → SMA (masukan terbalik)', () => {
    // NB: data.ts reads the pendidikan ARRAY (`row.pendidikan` / AIDATAJSON),
    // not the flat `pendidikan_1_tingkat` slots — those are read by
    // RirekishoBuilder's v() path, which is tested separately.
    const row = {
      pendidikan: [
        { tingkat: 'SMA', sekolah: 'SMAN 1', masuk: '2008-07' },
        { tingkat: 'SD', sekolah: 'SDN 5', masuk: '1999-07' },
        { tingkat: 'SMP', sekolah: 'SMPN 3', masuk: '2005-07' },
      ],
    };
    const data = normalizeMasterData(row);
    expect(data.pendidikan.map((p) => p.tingkat)).toEqual(['SD', 'SMP', 'SMA']);
  });

  it('level determinan atas tahun: S1 2015 tetap SETELAH SMA 2008', () => {
    const row = {
      pendidikan: [
        { tingkat: 'S1', sekolah: 'UNIV A', masuk: '2015-09' },
        { tingkat: 'SMA', sekolah: 'SMAN 2', masuk: '2008-07' },
      ],
    };
    const data = normalizeMasterData(row);
    expect(data.pendidikan.map((p) => p.tingkat)).toEqual(['SMA', 'S1']);
  });

  it('pendidikan terurut juga saat entri datang dari AIDATAJSON', () => {
    const row = {
      AIDATAJSON: JSON.stringify({
        pendidikan: [
          { tingkat: 'S1', sekolah: 'UNIV A', tahunMasuk: '2015' },
          { tingkat: 'SMA', sekolah: 'SMAN 2', tahunMasuk: '2008' },
          { tingkat: 'SMP', sekolah: 'SMPN 1', tahunMasuk: '2005' },
        ],
      }),
    };
    const data = normalizeMasterData(row);
    expect(data.pendidikan.map((p) => p.tingkat)).toEqual(['SMP', 'SMA', 'S1']);
  });

  it('entri AI berbentuk sekolah_id keluar sebagai "sekolah" (bentuk kanonikal)', () => {
    const row = {
      AIDATAJSON: JSON.stringify({
        pendidikan: [{ tingkat: 'SMA', sekolah_id: 'SMAN 7', tahun_masuk: '2010' }],
      }),
    };
    const data = normalizeMasterData(row);
    expect(data.pendidikan[0].sekolah).toBe('SMAN 7');
    expect(data.pendidikan[0].masuk).toBe('2010');
  });

  it('info sekolah TIDAK hilang saat master & AI memakai bentuk kunci berbeda', () => {
    // Bentuk paling berbahaya: dedupe gagal → dua baris, satu di antaranya
    // tanpa nama sekolah sama sekali.
    const row = {
      pendidikan_1_tingkat: 'SMA',
      pendidikan_1_nama_sekolah: 'SMAN 1',
      AIDATAJSON: JSON.stringify({
        pendidikan: [{ tingkat: 'SMA', sekolah_id: 'SMAN 1' }],
      }),
    };
    const data = normalizeMasterData(row);
    expect(data.pendidikan.length).toBe(1);
    expect(data.pendidikan[0].sekolah).toBe('SMAN 1');
  });

  it('pekerjaan & keluarga mempertahankan urutan sumber (tidak ikut terurut)', () => {
    const row = {
      AIDATAJSON: JSON.stringify({
        pekerjaan: [
          { perusahaan: 'PT C', masuk: '2018' },
          { perusahaan: 'PT A', masuk: '2010' },
        ],
      }),
    };
    const data = normalizeMasterData(row);
    expect(data.pekerjaan.map((p) => p.perusahaan)).toEqual(['PT C', 'PT A']);
  });

  // ------------------------------------------------------------------
  // Normalisasi juga berlaku untuk pekerjaan & keluarga, bukan hanya
  // pendidikan — ketiganya lewat getArr yang sama.
  // ------------------------------------------------------------------
  it('pekerjaan dari CV AI (perusahaan_id/jabatan_id) → bentuk kanonikal', () => {
    const row = {
      AIDATAJSON: JSON.stringify({
        pekerjaan: [
          { perusahaan_id: 'PT SEJAHTERA', jabatan_id: 'OPERATOR', tahun_masuk: '2015-03', tahun_keluar: '2018-09' },
        ],
      }),
    };
    const data = normalizeMasterData(row);
    expect(data.pekerjaan[0].perusahaan).toBe('PT SEJAHTERA');
    expect(data.pekerjaan[0].jabatan).toBe('OPERATOR');
    expect(data.pekerjaan[0].masuk).toBe('2015-03');
    expect(data.pekerjaan[0].keluar).toBe('2018-09');
  });

  it('keluarga dari CV AI (hubungan_id/pekerjaan_id/usia) → bentuk kanonikal', () => {
    const row = {
      AIDATAJSON: JSON.stringify({
        keluarga: [{ nama: 'BUDI', hubungan_id: 'AYAH', pekerjaan_id: 'PETANI', usia: '55' }],
      }),
    };
    const data = normalizeMasterData(row);
    expect(data.keluarga[0].hubungan).toBe('AYAH');
    expect(data.keluarga[0].pekerjaan).toBe('PETANI');
    expect(data.keluarga[0].umur).toBe('55');
  });

  it('pekerjaan: master & AI bentuk kunci beda → satu baris, nama perusahaan tetap ada', () => {
    const row = {
      pekerjaan: [{ perusahaan: 'PT MAJU', jabatan: 'STAFF' }],
      AIDATAJSON: JSON.stringify({
        pekerjaan: [{ perusahaan_id: 'PT MAJU', jabatan_id: 'STAFF' }],
      }),
    };
    const data = normalizeMasterData(row);
    expect(data.pekerjaan.length).toBe(1);
    expect(data.pekerjaan[0].perusahaan).toBe('PT MAJU');
  });
});
