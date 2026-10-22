// ==========================================
// TESTS: TabMail — baris UPDATE harus BISA DILIHAT
//
// Keluhan pemilik 2026-10-22: *"saya habis update profil Agus Khoci, ada
// notifnya, tapi di mail admin panel gak ada sama sekali."*
//
// Sebabnya bukan notifikasinya: `syncBiodataKeMail` memang menulis baris itu —
// tetapi kalau lamarannya SUDAH pernah diputuskan (LULUS/GAGAL), statusnya
// diubah menjadi `UPDATE`, bukan `MENUNGGU`. Tab Mail hanya punya empat
// keranjang (MENUNGGU/REVIEW/LULUS/GAGAL), jadi baris `UPDATE` tidak cocok
// dengan SATU PUN — ia hanya terlihat kalau admin menebak menekan "SEMUA".
// Notifikasi datang, daftar kosong, dan admin tidak punya jalan masuk.
// ==========================================
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import TabMail from './TabMail';
import { mailList, mailFilterStatus } from '../../store/adminStore';
import { invalidateAdminData } from '../../store/adminData';

vi.mock('../Toast', () => ({ showToast: vi.fn() }));
vi.mock('../../store/i18n', async () => {
  const { atom } = await import('nanostores');
  return {
    t: (k: string) => {
      const dict: Record<string, string> = {
        'status.waiting': 'Menunggu',
        'status.updated': 'Diperbarui',
        'status.review': 'Review',
        'status.pass': 'Lulus',
        'status.fail': 'Gagal',
        'status.all': 'SEMUA',
        'admin.no_mail_found': 'Tidak ada mail ditemukan.',
        'admin.mail_update_hint': 'Ada {n} pembaruan biodata/dokumen dari kandidat — buka tab Diperbarui untuk melihatnya.',
      };
      return dict[k] ?? k;
    },
    langStore: atom<'id' | 'jp'>('id'),
    toggleLang: vi.fn(),
  };
});
vi.mock('../../lib/apiClient', () => ({
  default: { secure: vi.fn(), get: vi.fn(), call: vi.fn() },
}));

import api from '../../lib/apiClient';

/** Bentuk `mapForm` (backend) — hanya kolom yang dibaca TabMail. */
function row(over: Record<string, unknown>) {
  return {
    rowIndex: 0, id: 1, timestamp: '2026-10-22 04:40', code: 'BIODATA',
    kategori: '-', nama: 'AGUS KHOCI', wa: '628123456789', status: 'MENUNGGU',
    feedback: '', folderUrl: '', photo: '', jft: '', ssw: '', cv: '', keterangan: '', docs: [],
    ...over,
  };
}

const ROWS = [
  row({ rowIndex: 0, id: 1, nama: 'AGUS KHOCI', status: 'UPDATE', feedback: '[BIODATA] email diubah' }),
  row({ rowIndex: 1, id: 2, nama: 'SITI AMINAH', status: 'LULUS', code: 'TG123' }),
  row({ rowIndex: 2, id: 3, nama: 'BUDI SANTOSO', status: 'GAGAL', code: 'TG124' }),
];

describe('TabMail — baris UPDATE (pembaruan biodata) tidak boleh tak terlihat', () => {
  beforeEach(() => {
    invalidateAdminData();
    mailFilterStatus.set('MENUNGGU');
    mailList.set(ROWS as never);
    vi.mocked(api.secure).mockResolvedValue({ success: true, formInbox: ROWS } as never);
  });
  afterEach(() => {
    cleanup();
    vi.mocked(api.secure).mockReset();
  });

  it('hitungan Diperbarui muncul walau tab default (Menunggu) kosong', async () => {
    render(<TabMail />);
    await waitFor(() => expect(screen.getByText(/Diperbarui: 1/)).toBeTruthy());
    // Tab default memang kosong — itu benar, barisnya bukan MENUNGGU.
    expect(screen.getByText('Tidak ada mail ditemukan.')).toBeTruthy();
    // …tapi tabel kosong tidak boleh dibiarkan tanpa jalan keluar: petunjuknya
    // sendiri adalah tombol yang membuka tab Diperbarui.
    const hint = screen.getByRole('button', { name: /Ada 1 pembaruan biodata\/dokumen/ });
    fireEvent.click(hint);
    await waitFor(() => expect(screen.getByText('AGUS KHOCI')).toBeTruthy());
  });

  it('klik tab Diperbarui → barisnya muncul lengkap dengan APA yang berubah', async () => {
    render(<TabMail />);
    await waitFor(() => expect(screen.getByText(/Diperbarui: 1/)).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Diperbarui' }));

    await waitFor(() => expect(screen.getByText('AGUS KHOCI')).toBeTruthy());
    // Yang berubah ikut terlihat — tanpa ini admin hanya melihat status UPDATE
    // dan harus membuka kandidatnya untuk tahu apa yang diperbarui.
    expect(screen.getByText('[BIODATA] email diubah')).toBeTruthy();
    // Baris LULUS/GAGAL tidak ikut campur di tab ini.
    expect(screen.queryByText('SITI AMINAH')).toBeNull();
  });

  it('SEMUA tetap menampilkan semuanya (tidak ada yang hilang dari daftar)', async () => {
    render(<TabMail />);
    await waitFor(() => expect(screen.getByText(/Diperbarui: 1/)).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'SEMUA' }));

    await waitFor(() => expect(screen.getByText('AGUS KHOCI')).toBeTruthy());
    expect(screen.getByText('SITI AMINAH')).toBeTruthy();
    expect(screen.getByText('BUDI SANTOSO')).toBeTruthy();
  });

  // ==========================================
  // TEMA TERANG: label tombol ini nyaris tak terbaca.
  //
  // DIUKUR 2026-10-22 di DOM (Playwright, `data-theme="light"`, /admin#mail):
  //   text-violet-200 (#ddd6fe) di atas bg shim #ede9fe = **1,17:1** — teksnya
  //   praktis hilang, karena `text-violet-200` TIDAK punya padanan tema terang
  //   sementara `bg-violet-600/20` punya. `text-violet-300` di-shim ke #6d28d9
  //   ⇒ **5,98:1** terukur (hover 5,12:1).
  //
  // Gate kontras (`e2e:contrast`) TIDAK menyapu panel admin, jadi tidak ada
  // yang menangkapnya; tes ini yang menahan regresinya.
  // ==========================================
  it('label tombol pembaruan memakai warna teks yang punya padanan tema terang', async () => {
    const { container } = render(<TabMail />);
    await waitFor(() => expect(screen.getByText(/Diperbarui: 1/)).toBeTruthy());
    const btn = [...container.querySelectorAll('button')]
      .find((b) => /pembaruan/i.test(b.textContent || ''));
    if (!btn) throw new Error('tombol "Ada N pembaruan" tidak dirender');
    expect(btn.className).toContain('text-violet-300');
    expect(btn.className).not.toContain('text-violet-200');
  });
});
