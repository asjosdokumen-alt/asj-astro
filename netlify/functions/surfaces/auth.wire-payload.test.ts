/**
 * surfaces/auth — kontrak WIRE payload `loginKandidat`.
 *
 * Kenapa tes ini ada: `loginKandidat` adalah satu-satunya action auth yang
 * argumennya divalidasi sebagai `z.tuple([waField, passwordField])`, dan tidak
 * ada satu pun tes yang menyentuh bentuk payload-nya. Dua gate UI —
 * `AiCvForm.gateLogin` dan `MasterFullForm.gateLogin` — mengirim
 * `[{ wa, password }]` (satu objek DI DALAM array) selama ini. Zod menolaknya
 * dengan "Array must contain at least 2 element(s)", sehingga gate-nya tidak
 * pernah bisa lolos: user selalu melihat "Password salah atau akun tidak
 * ditemukan." walaupun passwordnya benar.
 *
 * `LoginModal`, jalur login utama, mengirim `[wa, password]` dan memang jalan —
 * jadi schema-nya benar dan kedua gate itulah yang menyimpang.
 *
 * Tes ini memaku bentuk yang benar di sisi SERVER. Gunanya bukan menangkap bug
 * klien (itu tugas tes komponen), melainkan mencegah bug klien "diperbaiki"
 * dengan melonggarkan schema: pelonggaran seperti itu akan menyembunyikan
 * penyimpangan berikutnya alih-alih menampakkannya.
 */
import { describe, expect, it } from 'vitest';
import { schemas, validatePayload } from '../_lib/kernel/validate';

describe('loginKandidat — kontrak wire payload', () => {
  const WA = '081234567890';
  const PASS = 'rahasia123';

  it('menerima [wa, password] — bentuk yang dipakai LoginModal', () => {
    expect(validatePayload([WA, PASS], schemas.kandidatLogin)).toEqual([WA, PASS]);
  });

  it('MENOLAK [{ wa, password }] — bentuk lama kedua gate UI', () => {
    // Bentuk ini bug nyata, bukan hipotesis. Sengaja dibiarkan GAGAL di sini:
    // kalau suatu saat schema dilonggarkan untuk menerimanya, tes ini merah dan
    // memaksa keputusan itu diambil sadar alih-alih diam-diam.
    let err: unknown;
    try {
      validatePayload([{ wa: WA, password: PASS }], schemas.kandidatLogin);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(Error);
    // Kode, bukan teks pesan zod — teks bisa berubah antar versi, kode tidak.
    expect((err as { code?: string }).code).toBe('VALIDATION_FAILED');
  });
});
