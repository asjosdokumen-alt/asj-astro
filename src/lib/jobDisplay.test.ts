/**
 * jobDisplay.test.ts — the JP–ID toggle must actually change job DATA values.
 *
 * Regression guard for the bug the owner reported as "toggle jp-id saya tekan
 * ga berubah": the header switched to Japanese but the table kept showing
 * "🌾 PERTANIAN", "🌾 Ibaraki" and "Pria/Wanita" because those come from the
 * DB as free text and never went through a translation layer.
 *
 * The values asserted here are the REAL production values, copied from a live
 * `getAppData` response, so this test fails if the mapping regresses.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { langStore } from '../store/i18n';
import {
  jobCategoryLabel,
  jobGenderLabel,
  jobLocationLabel,
  jobTitleLabel,
} from './jobDisplay';

/** Real values as stored by the admin sheet. */
const DB_ROW = {
  pekerjaan: 'NOUGYOU SAYURAN',
  kategori: '🌾 PERTANIAN',
  lokasi: '🌾 Ibaraki',
  gender: '👨 Pria👩 Wanita',
};

describe('jobDisplay — DB values follow the language toggle', () => {
  beforeEach(() => {
    langStore.set('id');
  });

  it('category: emoji-prefixed DB text resolves to an i18n label', () => {
    langStore.set('id');
    expect(jobCategoryLabel(DB_ROW.kategori)).toBe('Pertanian');

    langStore.set('jp');
    expect(jobCategoryLabel(DB_ROW.kategori)).toBe('農業');
  });

  it('category: matches case-insensitively and with noise', () => {
    langStore.set('jp');
    expect(jobCategoryLabel('Pertanian')).toBe('農業');
    expect(jobCategoryLabel('  🌾  pertanian  ')).toBe('農業');
  });

  it('category: unknown value passes through, never empty', () => {
    expect(jobCategoryLabel('🛠 SESUATU BARU')).toBe('🛠 SESUATU BARU');
    expect(jobCategoryLabel('')).toBe('');
  });

  it('gender: both options in one cell are translated and rejoined', () => {
    langStore.set('id');
    expect(jobGenderLabel(DB_ROW.gender)).toBe('Pria / Wanita');

    langStore.set('jp');
    expect(jobGenderLabel(DB_ROW.gender)).toBe('男性 / 女性');
  });

  it('gender: single value and unknown value', () => {
    langStore.set('jp');
    expect(jobGenderLabel('👩 Wanita')).toBe('女性');
    expect(jobGenderLabel('Lainnya')).toBe('Lainnya');
    expect(jobGenderLabel('')).toBe('');
  });

  it('location: emoji stripped, proper noun preserved', () => {
    expect(jobLocationLabel(DB_ROW.lokasi)).toBe('Ibaraki');
    langStore.set('jp');
    expect(jobLocationLabel(DB_ROW.lokasi)).toBe('Ibaraki');
  });

  it('job title is never invented — proper noun returned as-is', () => {
    expect(jobTitleLabel(DB_ROW.pekerjaan)).toBe('NOUGYOU SAYURAN');
    langStore.set('jp');
    expect(jobTitleLabel(DB_ROW.pekerjaan)).toBe('NOUGYOU SAYURAN');
  });

  it('the whole row differs between id and jp (the actual owner complaint)', () => {
    const render = () =>
      [
        jobCategoryLabel(DB_ROW.kategori),
        jobLocationLabel(DB_ROW.lokasi),
        jobGenderLabel(DB_ROW.gender),
      ].join(' | ');

    langStore.set('id');
    const id = render();
    langStore.set('jp');
    const jp = render();

    expect(id).not.toBe(jp);
    expect(id).toContain('Pertanian');
    expect(jp).toContain('農業');
  });
});
