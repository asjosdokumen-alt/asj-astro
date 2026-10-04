// ==========================================
// TESTS: shared/wa-rules — isValidWaFormat gate (login/daftar kandidat).
// Relocated from the retired _lib/actions-auth dispatcher suite (2026-09-04):
// isValidWaFormat always lived here — actions-auth only re-exported it.
// Hanya /^628\d{9,10}$/ yang diterima — WA typo (mis. 6223… vs 6282…,
// kasus SATRIA 2026-08-15) ditolak supaya tidak bikin kandidat duplikat.
// ==========================================
import { describe, it, expect } from 'vitest';
import { isValidWaFormat, normalizeWa } from './wa-rules';
import { normalizeWa as normalizeWaBackend } from '../netlify/functions/shared/wa-rules';

describe('isValidWaFormat — gate login/daftar kandidat', () => {
  it('menerima 628… 13 digit (awalan HP baku)', () => {
    expect(isValidWaFormat('6281234567890')).toBe(true);
    expect(isValidWaFormat('6282130442661')).toBe(true);
  });

  it('menerima 08xx… (dinormalisasi jadi 628…)', () => {
    expect(isValidWaFormat('081234567890')).toBe(true);
    expect(isValidWaFormat('082130442661')).toBe(true);
  });

  it('menerima 8xx… tanpa nol depan (konsisten dengan frontend)', () => {
    expect(isValidWaFormat('81234567890')).toBe(true);
    expect(isValidWaFormat('82130442661')).toBe(true);
  });

  it('menerima 628 + 9 digit (total 12)', () => {
    expect(isValidWaFormat('628123456789')).toBe(true);
  });

  it('menolak WA typo 6223… (kasus SATRIA)', () => {
    expect(isValidWaFormat('6223123456789')).toBe(false);
    expect(isValidWaFormat('622130442661')).toBe(false);
  });

  it('menolak nomor terlalu pendek / terlalu panjang', () => {
    expect(isValidWaFormat('081234')).toBe(false);
    expect(isValidWaFormat('0812345678')).toBe(false); // 628 + 8 digit → kurang
    expect(isValidWaFormat('628123456789012')).toBe(true); // 15 digit — now accepted
    expect(isValidWaFormat('6281234567890123')).toBe(false); // 16 digit — too long
  });

  it('menolak kosong / non-digit / awalan bukan 62', () => {
    expect(isValidWaFormat('')).toBe(false);
    expect(isValidWaFormat('abc')).toBe(false);
    expect(isValidWaFormat('71234567890')).toBe(false);
    expect(isValidWaFormat('08123456789012345678')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PARITY — dua salinan fisik, satu aturan.
//
// `shared/wa-rules.ts` (klien) dan `netlify/functions/shared/wa-rules.ts`
// (backend) adalah dua salinan fisik dari aturan yang sama: bundler Netlify
// tidak menjangkau root `shared/`, jadi backend memakai salinan sendiri.
//
// Salinan itu PERNAH menyimpang tanpa terlihat (terukur 2026-10-04, 4 dari 9
// fixture berbeda): klien memetakan `080…` (mobile Jepang) ke `62…`, dan
// `07012345678` 12-digit balik ke `62817012345678` — sehingga satu orang bisa
// menjadi dua baris kandidat. Judul tes di `src/lib/schemas.test.ts:51`
// menyebut "080" padahal tidak ada satu pun assertion yang menutupinya, jadi
// penyimpangannya tidak terlihat oleh suite.
//
// Tes ini membuat penyimpangan berikutnya tidak mungkin senyap: ia gagal
// begitu salah satu sisi diubah sendirian.
// ─────────────────────────────────────────────────────────────────────────────
describe('parity — klien vs backend (satu aturan, dua salinan fisik)', () => {
  const FIXTURES = [
    // Indonesia
    '081234567890',
    '81234567890',
    '6281234567890',
    '+62 812-3456-7890',
    '082130442661',
    '6208123456789',
    // Jepang — mobile 060/070/080/090
    '08012345678',
    '0801234567',
    '07012345678',
    '09012345678',
    '818012345678',
    '817012345678',
    '819012345678',
    '81012345678',
    // Bare 81 + digit non-mobile
    '81112345678',
    '81512345678',
    '81612345678',
    // Sampah / ambigu
    '',
    'abc',
    '9999999999999',
    '08123',
    '0212345678',
  ];

  it('normalizeWa menghasilkan nilai identik di kedua sisi', () => {
    const diffs = FIXTURES.map((f) => ({
      f,
      client: normalizeWa(f),
      backend: normalizeWaBackend(f),
    }))
      .filter((r) => r.client !== r.backend)
      .map((r) => `${r.f}: client=${r.client} backend=${r.backend}`);
    expect(diffs).toEqual([]);
  });

  it('080/070 adalah mobile Jepang, bukan Indonesia (regresi 2026-10-04)', () => {
    expect(normalizeWa('08012345678')).toBe('818012345678');
    expect(normalizeWa('07012345678')).toBe('817012345678');
    expect(normalizeWaBackend('08012345678')).toBe('818012345678');
    expect(normalizeWaBackend('07012345678')).toBe('817012345678');
  });

  it('isValidWaFormat menerima nomor Jepang yang sudah dinormalisasi', () => {
    expect(isValidWaFormat('08012345678')).toBe(true);
    expect(isValidWaFormat('07012345678')).toBe(true);
  });
});
