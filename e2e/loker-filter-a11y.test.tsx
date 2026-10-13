/**
 * TESTS: chip filter tabel lowongan publik harus MENYATAKAN keadaannya.
 *
 * KENAPA DI `e2e/`: `indexer` menghitung SELURUH berkas di bawah `src/**`, jadi
 * `.test.tsx` baru di sana memindahkan counter beku (R15).
 *
 * BUG YANG DIKUNCI (2026-10-13, /public)
 * --------------------------------------
 * Empat chip filter (ALL/OPEN/URGENT/CLOSE) menyatakan filter yang AKTIF hanya
 * lewat WARNA (`filter === fd.key ? fd.cls : "bg-slate-700 …"`). Terukur di
 * Chromium atas /public yang tayang: `aria-pressed` = **null** pada keempatnya,
 * dan tidak ada `aria-current` — jadi pembaca layar tidak bisa tahu filter mana
 * yang sedang berlaku (WCAG 4.1.2 Name, Role, Value; state yang hanya dikodekan
 * warna tidak terbaca oleh AT). Tab di halaman yang SAMA (`public.astro`) sudah
 * memakai `aria-pressed`; chip ini tidak, jadi ini juga soal konsistensi.
 *
 * Tautan "Format" juga `target="_blank"` TANPA `rel`: terukur 14 tautan
 * `target="_blank"` tanpa `rel` di /public (10 di antaranya tautan Format ini,
 * satu per baris tabel).
 */
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/preact';
import { describe, it, expect, vi, afterEach } from 'vitest';
import LokerTable from '../src/components/public/LokerTable';

vi.mock('../src/store/i18n', async () => {
  const { atom } = await import('nanostores');
  return { t: (k: string) => k, langStore: atom<'id' | 'jp'>('id'), useLang: () => 'id' };
});
vi.mock('../src/lib/publicData', () => ({
  getPublicData: async () => ({
    success: true,
    jobs: [
      { code: 'TG1ASJ', pekerjaan: 'X', status: 'OPEN', templateCv: 'https://x/tpl.xlsx' },
      { code: 'TG2ASJ', pekerjaan: 'Y', status: 'CLOSE' },
    ],
  }),
}));

afterEach(cleanup);

const CHIP_LABELS = ['public.all', 'public.open', 'public.urgent', 'public.close'];

async function renderTable() {
  render(<LokerTable />);
  await waitFor(() => expect(screen.getByRole('button', { name: /public\.all/ })).toBeTruthy());
  return CHIP_LABELS.map((k) => screen.getByRole('button', { name: new RegExp(k.replace('.', '\\.')) }));
}

describe('LokerTable — chip filter menyatakan keadaan aktif', () => {
  it('setiap chip punya aria-pressed, dan tepat satu bernilai true', async () => {
    const chips = await renderTable();
    for (const c of chips) {
      expect(c.hasAttribute('aria-pressed'), `chip "${c.textContent?.trim()}" tanpa aria-pressed`).toBe(true);
    }
    expect(chips.filter((c) => c.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
    expect(chips[0].getAttribute('aria-pressed')).toBe('true');
  });

  it('memilih chip lain memindahkan aria-pressed', async () => {
    const chips = await renderTable();
    fireEvent.click(chips[1]);
    await waitFor(() => expect(chips[1].getAttribute('aria-pressed')).toBe('true'));
    expect(chips[0].getAttribute('aria-pressed')).toBe('false');
  });

  // KONTROL POSITIF: chip tetap `type="button"`, supaya "tambah aria-pressed"
  // tidak diam-diam membawa perubahan lain pada tombolnya.
  it('chip bertipe button (bukan submit)', async () => {
    const chips = await renderTable();
    for (const c of chips) expect(c.getAttribute('type')).toBe('button');
  });

  it('tautan Format membuka tab baru dengan rel="noopener"', async () => {
    await renderTable();
    const link = screen.getByRole('link', { name: /button\.format/ }) as HTMLAnchorElement;
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel') || '', 'target=_blank tanpa rel').toContain('noopener');
  });
});
