/**
 * thumbUrl.test.ts — thumbnail delivery, NOT a re-upload.
 *
 * Each case here is a URL shape that exists in the live `job_database` table
 * (measured 2026-10-19: 27 pamflet on Cloudinary, 52 on Supabase Storage).
 * The one that matters most is the LAST group: a URL the helper does not
 * recognise must come back byte-identical, because that is what keeps this
 * change safe for CDNs and formats it has never seen.
 */
import { describe, expect, it } from 'vitest';
import { thumbUrl } from './thumbUrl';

const CDN = 'https://res.cloudinary.com/ybzzbw9i/image/upload/v1787886300/DOKUMENASJ/663_dqyhli.jpg';
const SB = 'https://gdwvffmevwtwnzrapjwy.supabase.co/storage/v1/object/public/asj-files/jobs/1786692885383_Peternakan/PAMFLET_1786692887350.jpg';

describe('thumbUrl', () => {
  it('menyisipkan transformasi Cloudinary sebelum segmen versi', () => {
    expect(thumbUrl(CDN)).toBe(
      'https://res.cloudinary.com/ybzzbw9i/image/upload/w_96,h_128,c_fill,q_auto,f_auto/v1787886300/DOKUMENASJ/663_dqyhli.jpg',
    );
  });

  it('menghormati ukuran yang diminta pemanggil', () => {
    expect(thumbUrl(CDN, 160, 224)).toContain('/w_160,h_224,c_fill,q_auto,f_auto/');
  });

  it('TIDAK menumpuk transformasi pada URL Cloudinary yang sudah punya satu', () => {
    const already = 'https://res.cloudinary.com/ybzzbw9i/image/upload/w_400,c_scale/v1787886300/DOKUMENASJ/663_dqyhli.jpg';
    expect(thumbUrl(already)).toBe(already);
  });

  it('TIDAK menyentuh /raw/upload/ (xlsx) — Cloudinary tidak me-resize non-gambar', () => {
    const xlsx = 'https://res.cloudinary.com/ybzzbw9i/raw/upload/v1787986742/DOKUMENASJ/666_jk5gue.xlsx';
    expect(thumbUrl(xlsx)).toBe(xlsx);
  });

  it('mengalihkan objek publik Supabase ke endpoint render/image', () => {
    expect(thumbUrl(SB)).toBe(
      'https://gdwvffmevwtwnzrapjwy.supabase.co/storage/v1/render/image/public/asj-files/jobs/1786692885383_Peternakan/PAMFLET_1786692887350.jpg?width=96&height=128&resize=cover',
    );
  });

  it('TIDAK mengalihkan objek non-gambar di bucket yang sama', () => {
    const pdf = 'https://gdwvffmevwtwnzrapjwy.supabase.co/storage/v1/object/public/asj-files/kandidat/6281/KTP.pdf';
    expect(thumbUrl(pdf)).toBe(pdf);
  });

  it('idempoten: URL yang sudah render/image tidak diubah lagi', () => {
    const once = thumbUrl(SB);
    expect(thumbUrl(once)).toBe(once);
  });

  it('membiarkan host yang tidak dikenal apa adanya', () => {
    const other = 'https://cdn.example/pamflet.jpg';
    expect(thumbUrl(other)).toBe(other);
  });

  it('mengembalikan nilai kosong tanpa melempar', () => {
    expect(thumbUrl('')).toBe('');
    expect(thumbUrl(null)).toBe('');
    expect(thumbUrl(undefined)).toBe('');
    expect(thumbUrl('-')).toBe('-');
  });
});
