/**
 * TESTS: TabJadwal — tombol "Edit" harus MEMPERBARUI, bukan menyalin.
 *
 * KENAPA DI `e2e/`: `indexer` menghitung SELURUH berkas di bawah `src/**`, jadi
 * `.test.tsx` baru di sana memindahkan counter beku.
 *
 * BUG YANG DIKUNCI
 * ----------------
 * Tombol "Edit" hanya mengisi formulir lalu membukanya; `handleSubmit` selalu
 * memanggil `simpanJadwalBaru` TANPA id, dan backend selalu INSERT dengan id
 * baru (`'JDW' + Date.now()`). Jadi menekan Edit membuat jadwal SALINAN, dan
 * jadwal aslinya tidak pernah berubah — tanpa pesan apa pun.
 */
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import TabJadwal from '../src/components/admin/TabJadwal';

const { mockSecure } = vi.hoisted(() => ({ mockSecure: vi.fn() }));

vi.mock('../src/components/Toast', () => ({ showToast: vi.fn() }));
vi.mock('../src/lib/apiClient', () => ({
  default: { secure: (...a: unknown[]) => mockSecure(...a) },
}));
vi.mock('../src/store/i18n', async () => {
  const { atom } = await import('nanostores');
  return { t: (k: string) => k, langStore: atom<'id' | 'jp'>('id'), toggleLang: vi.fn() };
});

const JADWAL = {
  id: 'JDW1700000000000',
  nama: 'BRIEFING JEPANG',
  loker: 'TG658',
  waktu: '2026-10-12 09:00',
  lokasi: 'Zoom',
  tsk: 'TSK A',
  link: 'https://zoom.example/x',
};

beforeEach(() => {
  mockSecure.mockReset();
  mockSecure.mockImplementation(async (action: string) => {
    if (action === 'getAppData') return { success: true, schedules: [JADWAL], dropdowns: { tsk: [] } };
    return { success: true };
  });
});

afterEach(cleanup);

/** Payload yang dikirim ke `simpanJadwalBaru`. */
function payload(): Record<string, unknown> {
  const call = mockSecure.mock.calls.find((c) => c[0] === 'simpanJadwalBaru');
  expect(call, 'simpanJadwalBaru tidak pernah dipanggil').toBeTruthy();
  const args = call?.[1] as Array<Record<string, unknown>>;
  return args[0];
}

function isi(sel: string, nilai: string): void {
  const el = document.querySelector(sel) as HTMLInputElement | null;
  expect(el, `input ${sel} tidak ada`).not.toBeNull();
  fireEvent.input(el as HTMLInputElement, { target: { value: nilai } });
}

/** `fireEvent.submit` sengaja dipakai, bukan klik tombol: jsdom melewatkan
 *  validasi `required`, dan yang diuji di sini handler-nya, bukan validasinya. */
async function submit(): Promise<void> {
  const form = document.querySelector('form');
  expect(form, 'form tidak ditemukan').not.toBeNull();
  fireEvent.submit(form as HTMLFormElement);
  await waitFor(() => expect(mockSecure).toHaveBeenCalledWith('simpanJadwalBaru', expect.anything()));
}

async function renderDenganSatuJadwal(): Promise<void> {
  render(<TabJadwal />);
  await screen.findByText('BRIEFING JEPANG');
}

describe('TabJadwal — Edit memperbarui jadwal yang ada', () => {
  it('menyimpan hasil Edit mengirim `id` jadwal itu', async () => {
    await renderDenganSatuJadwal();

    fireEvent.click(screen.getByText('Edit'));
    // Formulir terbuka dengan nilai baris itu — buktinya input nama terisi.
    expect((document.querySelector('#tj-nama') as HTMLInputElement).value).toBe('BRIEFING JEPANG');
    await submit();

    expect(payload().id).toBe(JADWAL.id);
  });

  it('jadwal BARU tidak mengirim `id` (tetap INSERT)', async () => {
    await renderDenganSatuJadwal();

    fireEvent.click(screen.getByText('admin.new_schedule'));
    isi('#tj-nama', 'AGENDA BARU');
    isi('#tj-waktu', '2026-10-12T09:00');
    await submit();

    expect(payload().id).toBeUndefined();
  });

  it('menutup formulir membatalkan mode edit', async () => {
    await renderDenganSatuJadwal();

    fireEvent.click(screen.getByText('Edit'));
    fireEvent.click(screen.getByText('ui.close'));
    fireEvent.click(screen.getByText('admin.new_schedule'));
    isi('#tj-nama', 'AGENDA LAIN');
    isi('#tj-waktu', '2026-10-13T09:00');
    await submit();

    expect(payload().id).toBeUndefined();
  });
});
