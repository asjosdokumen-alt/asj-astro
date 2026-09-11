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
});
