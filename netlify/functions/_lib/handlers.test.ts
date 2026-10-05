// ==========================================
// TESTS: docTypeOf (handlers.js) — klasifikasi tipe dokumen dari nama file
// supaya 1 loker = 1 CV/JFT/SSW/foto (tidak dobel di share view).
// ==========================================
import { describe, it, expect } from 'vitest';
import { docTypeOf, rateLimitChecks } from './handlers';

describe('docTypeOf — pola baru (prefix kapital)', () => {
  it('KK / KTP / CVFILE / PHOTOFILE bertimestamp', () => {
    expect(docTypeOf('KK_1786683312223.pdf')).toBe('KK');
    expect(docTypeOf('KTP_1786700397069.pdf')).toBe('KTP');
    expect(docTypeOf('CVFILE_1786683307401.xlsx')).toBe('CV');
    expect(docTypeOf('PHOTOFILE_1786676876946.jpg')).toBe('PHOTO');
  });

  it('paspor/ijazah tetap tipe sendiri (bukan tipe utama)', () => {
    expect(docTypeOf('PASSPORT_1786506019053.pdf')).toBe('PASSPORT');
    expect(docTypeOf('IJAZAH_SD_1786544972324.png')).toBe('IJAZAH');
  });
});

describe('docTypeOf — pola lawas (nama kandidat + suffix tipe)', () => {
  it('1. X_CV.xlsx dan 1._X_CV.xlsx → CV', () => {
    expect(docTypeOf('1. MUHAMAD SATORI_CV.xlsx')).toBe('CV');
    expect(docTypeOf('1._MUHAMAD_SATORI_CV.xlsx')).toBe('CV');
    expect(docTypeOf('1. SUNARTO HADI PRASETYO_CV.xlsx')).toBe('CV');
  });

  it('suffix JFT / SSW / PAS_PHOTO dikenali', () => {
    expect(docTypeOf('1._MUHAMAD_SATORI_JFT.pdf')).toBe('JFT');
    expect(docTypeOf('1._MUHAMAD_SATORI_SSW.pdf')).toBe('SSW');
    expect(docTypeOf('1._MUHAMAD_SATORI_PAS_PHOTO.jpg')).toBe('PHOTO');
  });

  it('nama_jft.pdf / nama_ssw.pdf / nama_photo.file → tipe utama', () => {
    expect(docTypeOf('nama_jft.pdf')).toBe('JFT');
    expect(docTypeOf('nama_ssw.pdf')).toBe('SSW');
    expect(docTypeOf('nama_photo.file')).toBe('PHOTO');
  });
});

// ==========================================
// TESTS: rateLimitChecks — pemetaan grup → bucket (S7 round-2).
// Dua endpoint ANONIM sebelumnya tidak termeter sama sekali:
//   - getExistingCandidateJsonByWa (prefill PII publik) — dulu di grup mana pun
//     tidak ada → tanpa throttle;
//   - processSiswaAIChat (chat AI publik) — dipindah ke bucket IP khusus.
// ==========================================
describe('rateLimitChecks — endpoint anonim termeter', () => {
  const ip = '203.0.113.7';

  it('getExistingCandidateJsonByWa → bucket IP prefill (dulu: tidak ada bucket)', () => {
    const checks = rateLimitChecks('getExistingCandidateJsonByWa', { ip }, '');
    expect(checks).toHaveLength(1);
    expect(checks[0].key).toBe(`prefill:${ip}`);
    expect(checks[0].opts.limit).toBeGreaterThan(0);
  });

  it('processSiswaAIChat → bucket IP siswaAi khusus, BUKAN grup ai: terautentikasi', () => {
    const keys = rateLimitChecks('processSiswaAIChat', { ip }, '').map((c) => c.key);
    expect(keys).toContain(`siswaAi:${ip}`);
    expect(keys.some((k) => k.startsWith('ai:'))).toBe(false);
  });

  it('aksi AI terautentikasi tetap memakai bucket ai:', () => {
    const keys = rateLimitChecks('processAIChat', { ip }, '').map((c) => c.key);
    expect(keys).toContain(`ai:${ip}`);
  });

  it('tanpa IP (meta kosong) tetap dapat bucket, tidak lolos tanpa batas', () => {
    const checks = rateLimitChecks('getExistingCandidateJsonByWa', {}, '');
    expect(checks).toHaveLength(1);
    expect(checks[0].key).toBe('prefill:anon');
  });
});
