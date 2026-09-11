import { describe, expect, it, vi } from 'vitest';
import { translations, ensureJpLoaded } from './i18n';

describe('i18n lazy JP dict (P9b)', () => {
  it('ensureJpLoaded installs the JP dict before resolving', async () => {
    await ensureJpLoaded();
    expect(Object.keys(translations.jp).length).toBeGreaterThan(0);
    expect(translations.jp['public.all']).toBeTruthy();
  });

  it('a page loaded with lang=jp preloads the dict and notifies jpReady', async () => {
    vi.resetModules();
    localStorage.setItem('asj_lang', JSON.stringify('jp'));
    const fresh = await import('./i18n');
    await fresh.ensureJpLoaded();
    expect(Object.keys(fresh.translations.jp).length).toBeGreaterThan(0);
    expect(fresh.translations.jp['public.all']).toBeTruthy();
    expect(fresh.jpReady.get()).toBe(true);
    localStorage.setItem('asj_lang', JSON.stringify('id'));
    fresh.langStore.set('id');
  });
});
