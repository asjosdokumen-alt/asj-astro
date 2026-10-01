// ==========================================
// TESTS: contexts/applications — `preloadedRows` benar-benar DIPAKAI.
//
// KENAPA DI `e2e/`: lihat catatan panjang di `e2e/ai-cv-submit.test.ts` — tier
// `e2e` hanya menghitung mjs/cjs/js, jadi suite `.ts` di sini tidak memindahkan
// counter beku `indexer` yang hanya boleh di-baseline ulang oleh team-lead.
// Preseden: `e2e/share-data.test.ts`.
//
// `cv.submit.test.ts` membuktikan PEMANGGIL menyerahkan barisnya, dan mock di
// sana meniru kontraknya. Tapi mock itu tidak menjalankan kode helper-nya: kalau
// `service.ts` diubah agar mengabaikan `preloadedRows` dan membaca sendiri,
// tes itu tetap hijau. Tes ini menutup celah itu — ia memanggil helper
// SUNGGUHAN dan menghitung pembacaannya.
// ==========================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getFormsByWa = vi.fn(async (..._a: unknown[]) => [] as Record<string, unknown>[]);
const patchForm = vi.fn(async (..._a: unknown[]) => {});

// `service.ts` juga mengambil `normalizeWa` dari modul yang sama — biarkan
// implementasi aslinya dipakai, dan hanya ganti dua fungsi yang kita hitung.
vi.mock('../netlify/functions/contexts/applications/repository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../netlify/functions/contexts/applications/repository')>();
  return {
    ...actual,
    getFormsByWa: (...a: unknown[]) => getFormsByWa(...a),
    patchForm: (...a: unknown[]) => patchForm(...a),
  };
});

import { syncBiodataKeMail, syncFormMailDariUpload } from '../netlify/functions/contexts/applications/service';

const WA = '6285700000001';
const ROW = { id: 42, no_wa: WA, status: 'MENUNGGU', feedback_berkas: '' };

beforeEach(() => {
  getFormsByWa.mockClear();
  patchForm.mockClear();
  getFormsByWa.mockResolvedValue([]);
});

describe('syncBiodataKeMail — preloadedRows', () => {
  it('baris yang diserahkan dipakai; TIDAK ada pembacaan tambahan', async () => {
    await syncBiodataKeMail(WA, 'BUDI', ['fisik'], undefined, [ROW]);

    expect(getFormsByWa).not.toHaveBeenCalled();
    // Dan barisnya benar-benar di-PATCH — bukan sekadar "tidak membaca".
    expect(patchForm).toHaveBeenCalledTimes(1);
    expect(patchForm.mock.calls[0]?.[0]).toBe(42);
  });

  it('array KOSONG juga dipakai — "tidak ada baris" adalah jawaban yang sah', async () => {
    await syncBiodataKeMail(WA, 'BUDI', ['fisik'], undefined, []);

    // Ini kasus yang paling sering: kandidat belum punya baris mail sama sekali.
    // Membacanya ulang hanya untuk menemukan hal yang sudah diketahui adalah
    // persis round-trip yang dihapus.
    expect(getFormsByWa).not.toHaveBeenCalled();
    expect(patchForm).not.toHaveBeenCalled();
  });

  it('tanpa baris yang diserahkan, ia membaca sendiri (perilaku lama)', async () => {
    await syncBiodataKeMail(WA, 'BUDI', ['fisik']);

    expect(getFormsByWa).toHaveBeenCalledTimes(1);
  });
});

describe('syncFormMailDariUpload — preloadedRows', () => {
  it('baris yang diserahkan dipakai; TIDAK ada pembacaan tambahan', async () => {
    await syncFormMailDariUpload(WA, 'BUDI', 'AI_CV', 'https://x/y.png', 'KAIGO', undefined, [ROW]);

    expect(getFormsByWa).not.toHaveBeenCalled();
  });

  it('tanpa baris yang diserahkan, ia membaca sendiri (perilaku lama)', async () => {
    getFormsByWa.mockResolvedValue([ROW]);

    await syncFormMailDariUpload(WA, 'BUDI', 'AI_CV', 'https://x/y.png', 'KAIGO');

    expect(getFormsByWa).toHaveBeenCalledTimes(1);
  });
});
