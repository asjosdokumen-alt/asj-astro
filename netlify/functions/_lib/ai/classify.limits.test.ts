// ==========================================
// TESTS: ai/classify — batas unggah parse dokumen harus BENAR-BENAR bisa
// dieksekusi, bukan sekadar diumumkan.
//
// Kenapa tes ini ada: `PARSE_MAX_BYTES` dulu 8 MiB, dan itu mustahil tercapai.
// Klien mengirim berkas sebagai base64 di dalam body JSON, jadi 8 MiB menjadi
// ~10,7 MiB — di atas batas 6 MB body Netlify Functions. Platform menolaknya
// SEBELUM handler jalan, sehingga pemeriksaan ukuran di `classify.ts` tidak
// pernah dieksekusi dan pesan "File terlalu besar (maks 8 MB)" tidak pernah
// tampil. Klien hanya melihat kegagalan jaringan generik.
//
// Tes ini menegakkan INVARIAN-nya, bukan angkanya: berkas sebesar batas yang
// kami umumkan harus muat di body platform setelah base64. Kalau seseorang
// menaikkan batasnya lagi tanpa memeriksa aritmetika ini, tesnya memerah.
// ==========================================
import { describe, it, expect } from 'vitest';
import { PARSE_MAX_BYTES, PLATFORM_BODY_LIMIT_BYTES } from './classify';

/** Panjang base64 untuk n byte — rumus yang sama dengan Buffer.toString('base64'). */
function base64Length(n: number): number {
  return Math.ceil(n / 3) * 4;
}

/** Amplop JSON di sekitar `data`: name, mimeType, candidateId/wa, dan kunci lain. */
const ENVELOPE_BYTES = 4096;

describe('batas unggah parse dokumen — bisa dieksekusi, bukan hanya diumumkan', () => {
  it('berkas sebesar batas yang diumumkan MUAT di body platform setelah base64', () => {
    const wire = base64Length(PARSE_MAX_BYTES) + ENVELOPE_BYTES;
    expect(wire).toBeLessThan(PLATFORM_BODY_LIMIT_BYTES);
  });

  it('menyisakan ruang, bukan pas-pasan di tepi batas platform', () => {
    const wire = base64Length(PARSE_MAX_BYTES);
    const fraction = wire / PLATFORM_BODY_LIMIT_BYTES;
    // Tidak boleh menempel di tepi — header dan amplop ikut terhitung di 6 MB.
    expect(fraction).toBeLessThan(0.95);
    // Tapi juga tidak mengecil sampai fiturnya tidak berguna lagi.
    expect(fraction).toBeGreaterThan(0.5);
  });

  it('regresi: 8 MiB TIDAK muat — batas lama memang tidak pernah bisa dieksekusi', () => {
    expect(base64Length(8 * 1024 * 1024)).toBeGreaterThan(PLATFORM_BODY_LIMIT_BYTES);
  });
});
