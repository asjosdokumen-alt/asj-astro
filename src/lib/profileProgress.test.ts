// ==========================================
// TESTS: profileProgress — progres CV Mini & CV Master
//
// Latar: kedua progress bar di dashboard kandidat dulu membaca
// `result.kandidatData.cvMiniProgress` / `.cvMasterProgress` — kontrak backend
// GAS legacy yang TIDAK PERNAH dikembalikan backend rebuild. Akibatnya keduanya
// selalu 0 dan badge "PERFECT ASJ STUDENT" mustahil tercapai.
//
// Tes ini mengunci dua hal:
//   1. perhitungan yang benar dari data yang memang tersedia;
//   2. bentuk-bentuk nilai kosong dari backend ('', '-', 'null', 'undefined').
// ==========================================
import { describe, it, expect } from 'vitest';
import {
  isFilled,
  filledPercent,
  computeCvMiniProgress,
  computeCvMasterProgress,
  computeOverallProgress,
  CV_MINI_FIELDS,
  CV_MASTER_FIELDS,
} from './profileProgress';

describe('isFilled — bentuk nilai kosong dari backend', () => {
  it('kosong apa pun bentuknya = belum diisi', () => {
    for (const v of ['', '   ', '-', 'null', 'undefined', null, undefined]) {
      expect(isFilled(v), JSON.stringify(v)).toBe(false);
    }
  });

  it('nilai berisi = terisi', () => {
    for (const v of ['LAKI-LAKI', '170', 'a@b.c', 'A']) {
      expect(isFilled(v), JSON.stringify(v)).toBe(true);
    }
  });

  it('angka 0 dari number dianggap belum diisi (field teks TB/BB)', () => {
    expect(isFilled(0)).toBe(false);
    expect(isFilled('0')).toBe(false);
  });
});

describe('filledPercent', () => {
  it('daftar kosong → 0 (bukan NaN)', () => {
    expect(filledPercent([])).toBe(0);
  });

  it('separuh terisi → 50', () => {
    expect(filledPercent(['a', '', 'b', ''])).toBe(50);
  });

  it('semua terisi → 100, semua kosong → 0', () => {
    expect(filledPercent(['a', 'b'])).toBe(100);
    expect(filledPercent(['', '-'])).toBe(0);
  });
});

describe('computeCvMiniProgress — dari baris mapCandidate', () => {
  it('tanpa baris → 0', () => {
    expect(computeCvMiniProgress(null)).toBe(0);
    expect(computeCvMiniProgress(undefined)).toBe(0);
  });

  it('baris kosong → 0', () => {
    expect(computeCvMiniProgress({})).toBe(0);
  });

  it('semua field CV Mini terisi → 100', () => {
    const full = Object.fromEntries(CV_MINI_FIELDS.map((k) => [k, 'x']));
    expect(computeCvMiniProgress(full)).toBe(100);
  });

  it("'-' dari backend dihitung sebagai belum diisi (regresi nyata)", () => {
    // mapCandidate mengembalikan '-' untuk kolom kosong — kalau ini dihitung
    // sebagai terisi, kandidat tanpa data apa pun akan melihat progres > 0.
    const allDash = Object.fromEntries(CV_MINI_FIELDS.map((k) => [k, '-']));
    expect(computeCvMiniProgress(allDash)).toBe(0);
  });

  it('progres parsial dihitung dari jumlah field, bukan panjang teks', () => {
    const row = { gender: 'LAKI-LAKI', usia: '25', tb: '170', bb: '60' };
    // 4 dari 7 field CV_MINI_FIELDS
    expect(computeCvMiniProgress(row)).toBe(Math.round((4 / CV_MINI_FIELDS.length) * 100));
  });
});

describe('computeCvMasterProgress — dari objek bio (attachBerkasBio)', () => {
  it('bio tidak ada / bukan objek → 0', () => {
    expect(computeCvMasterProgress(null)).toBe(0);
    expect(computeCvMasterProgress(undefined)).toBe(0);
    expect(computeCvMasterProgress({})).toBe(0);
  });

  it('semua field CV Master terisi → 100', () => {
    const full = Object.fromEntries(CV_MASTER_FIELDS.map((k) => [k, 'x']));
    expect(computeCvMasterProgress(full)).toBe(100);
  });

  it('kandidat baru (bio dari attachBerkasBio, semua kosong) → 0', () => {
    const empty = Object.fromEntries(CV_MASTER_FIELDS.map((k) => [k, '']));
    expect(computeCvMasterProgress(empty)).toBe(0);
  });

  it('field tanpa kolom DB tidak ikut menahan progres di 100', () => {
    // ttl_ayah/ttl_ibu/shacou/telppt/webpt/alamatpt TIDAK punya kolom di
    // master_database_candidate, jadi tidak boleh masuk daftar penilaian —
    // kalau masuk, 100% mustahil dicapai.
    for (const ghost of ['ttlayah', 'ttlibu', 'shacou', 'telppt', 'webpt', 'alamatpt']) {
      expect(CV_MASTER_FIELDS as readonly string[]).not.toContain(ghost);
    }
  });
});

describe('computeOverallProgress', () => {
  it('rata-rata dua progres, dibulatkan', () => {
    expect(computeOverallProgress(100, 100)).toBe(100);
    expect(computeOverallProgress(0, 0)).toBe(0);
    expect(computeOverallProgress(50, 100)).toBe(75);
    expect(computeOverallProgress(0, 100)).toBe(50);
  });

  it('100/100 dapat dicapai — syarat PERFECT ASJ STUDENT tidak lagi mustahil', () => {
    const mini = computeCvMiniProgress(
      Object.fromEntries(CV_MINI_FIELDS.map((k) => [k, 'x'])),
    );
    const master = computeCvMasterProgress(
      Object.fromEntries(CV_MASTER_FIELDS.map((k) => [k, 'x'])),
    );
    expect(computeOverallProgress(mini, master)).toBe(100);
  });
});
