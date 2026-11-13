/**
 * MataTest.test.tsx — bentuk jawaban & jalan keluar "Tes Ulang".
 *
 * DUA HAL YANG DIJAGA, keduanya dari laporan pemilik 2026-11-13:
 *   1. *"kelamaan kalau ketik angka, 5s gak cukup, kadang salah ketik"* —
 *      plate dijawab dengan PILIHAN GANDA (4 angka + "tidak ada angka"),
 *      bukan kotak ketik.
 *   2. *"yang sudah pernah tes gimana tes ulang, kan jadi salah tadi tes saya"*
 *      — kartu hasil tersimpan wajib punya tombol "Tes Ulang"; tanpa itu satu
 *      hasil yang salah terkunci selamanya karena server menolak simpanan kedua.
 *
 * Canvas tidak tergambar di jsdom (`getContext` → null, `gambarPlate` keluar
 * lebih awal). Yang diuji di sini adalah KONTROLNYA, bukan gambarnya.
 */
import { render, screen, fireEvent, cleanup } from '@testing-library/preact';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import MataTest from './MataTest';

const gerbangDasar = {
  wa: '6281234567890',
  uji: false,
  status: { aktif: { mata: true } },
  memuat: false,
  galat: '',
  bukanSiswa: false,
  tertutup: false,
  tersimpan: null as null | { ringkasan: string; hasil: Record<string, unknown>; dibuat_pada: string },
  muat: vi.fn(async () => {}),
  tandaiSelesai: vi.fn(),
};

let gerbang = { ...gerbangDasar };

vi.mock('./GerbangTes', () => ({
  useGerbangTes: () => gerbang,
  IsiTes: ({ children }: { children: unknown }) => children,
}));

beforeEach(() => {
  gerbang = { ...gerbangDasar };
});
afterEach(() => {
  cleanup();
});

describe('MataTest · jawaban plate', () => {
  it('plate dijawab dengan 4 pilihan angka, bukan kotak ketik', async () => {
    render(<MataTest />);
    await fireEvent.click(screen.getByRole('button', { name: /Mulai Tahap 1/ }));

    const tombol = screen.getAllByRole('button').filter((b) => /^\d{1,2}$/.test((b.textContent || '').trim()));
    expect(tombol).toHaveLength(4);
    // Tidak ada lagi input angka: mengetik mengukur kecepatan mengetik.
    expect(document.querySelector('#tes-mata-jawab')).toBeNull();
    // "Tidak ada angka" tetap ada — penderita defisiensi memang bisa tidak
    // melihat apa pun pada plate 6-9.
    expect(screen.getByRole('button', { name: /Tidak ada angka/i })).toBeTruthy();
  });

  it('menekan satu pilihan langsung lanjut ke plate berikutnya', async () => {
    render(<MataTest />);
    await fireEvent.click(screen.getByRole('button', { name: /Mulai Tahap 1/ }));
    expect(screen.getByText(/1 \/ 12/)).toBeTruthy();

    const tombol = screen.getAllByRole('button').filter((b) => /^\d{1,2}$/.test((b.textContent || '').trim()));
    await fireEvent.click(tombol[0]);
    expect(screen.getByText(/2 \/ 12/)).toBeTruthy();
  });
});

describe('MataTest · tes ulang', () => {
  const hasilLama = {
    ishihara: { skor: 3, total: 12, status: 'DEFISIENSI_MERAH_HIJAU', label: 'Indikasi defisiensi' },
    visus: { kanan: 0.2, kiri: 0.2 },
  };

  it('hasil tersimpan menampilkan tombol "Tes Ulang"', () => {
    gerbang = { ...gerbangDasar, tersimpan: { ringkasan: 'x', hasil: hasilLama, dibuat_pada: '2026-11-13' } };
    render(<MataTest />);
    expect(screen.getByRole('button', { name: 'Tes Ulang' })).toBeTruthy();
    expect(screen.getByText(/MENGGANTI/)).toBeTruthy();
  });

  it('menekan "Tes Ulang" membuka tes lagi dari awal, bukan halaman hasil', async () => {
    gerbang = { ...gerbangDasar, tersimpan: { ringkasan: 'x', hasil: hasilLama, dibuat_pada: '2026-11-13' } };
    render(<MataTest />);
    await fireEvent.click(screen.getByRole('button', { name: 'Tes Ulang' }));
    // Kembali ke intro: tombol mulai tahap 1 muncul lagi.
    expect(screen.getByRole('button', { name: /Mulai Tahap 1/ })).toBeTruthy();
  });

  it('tanpa hasil tersimpan, tombol ulang tidak muncul', () => {
    render(<MataTest />);
    expect(screen.queryByRole('button', { name: 'Tes Ulang' })).toBeNull();
  });
});
