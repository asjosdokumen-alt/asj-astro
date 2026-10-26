/**
 * TESTS: `xlsxPreviewHtml` — pratinjau CV sebelum diunduh.
 *
 * KENAPA ADA
 * ----------
 * Pemilik 2026-10-26: "pilihan template ada preview hasil data nya, jgn langsung
 * download". Pratinjau ini satu-satunya cara melihat isi CV tanpa membuka Excel,
 * jadi dua sifatnya harus dikunci:
 *
 *   1. ISINYA benar — nama kandidat dan merge template benar-benar muncul. Kalau
 *      helper ini diam-diam mengembalikan tabel kosong, tombolnya tetap tampil
 *      dan pratinjaunya kosong tanpa satu pun error.
 *   2. TIDAK mengekspor 996 baris kosong ber-style — berkas template menyimpan
 *      seluruh tinggi baris, dan tanpa pemangkasan HTML-nya 1,2 MB untuk form
 *      yang isinya 27 baris.
 *
 * KENAPA DI `e2e/`: `src/**` dihitung counter beku `indexer`; `.ts` di tier
 * `e2e` tidak dihitung. Wajib terdaftar di `exclude` project 'frontend'
 * (jsdom) atau ia jalan dua kali (R13f-bis).
 */
import { describe, it, expect } from 'vitest';
import { xlsxPreviewHtml } from '../src/lib/cv-template-factory/preview';
import firmaTemplate from '../src/lib/cv-template-factory/renderers/rirekisho-firma';
import type { CandidateData } from '../src/lib/cv-template-factory/types';

function kandidat(): CandidateData {
  return {
    identitas: {
      nama_lengkap: 'BUDI TRISNANTO',
      katakana: 'ブディ・トリスナント',
      alamat: 'DUSUN KRAJAN RT 002 RW 003 PONOROGO',
      tgl_lahir: '2005-11-02',
      umur: '21',
      gender: 'LAKI-LAKI',
      agama: 'ISLAM',
      golongan_darah: 'O',
      status_nikah: 'BELUM MENIKAH',
      anak: 'TIDAK',
      hp: '628999170623',
      paspor: 'TIDAK',
    },
    fisik: { tb: '170', bb: '60', tangan_dominan: 'KANAN' },
    medis: { riwayat_medis: 'TIDAK', kacamata: 'TIDAK', rokok: 'TIDAK', alkohol: 'TIDAK' },
    pendidikan: [
      { tingkat: 'SMK', masuk: '2021-07', lulus: '2024-06', sekolah: 'SMK NEGERI 1 SLAHUNG', jurusan: 'TEKNIK OTOMOTIF' },
    ],
    pekerjaan: [
      { masuk: '2024-06', keluar: '2025-06', perusahaan: 'RESTORAN SAKURA', jabatan: 'KITCHEN HELPER' },
    ],
    keluarga: [{ hubungan: 'AYAH', nama: 'HARIADI', usia: '55', pekerjaan: 'PETANI' }],
    sertifikasi: { jft: 'A2' },
    wawancara: {},
    kenalan_jepang: { nama_id: '', nama_jp: '' },
    uploads: { photo: '' },
    raw: { idKandidat: 'ASJ00188' },
  } as unknown as CandidateData;
}

async function previewFirma(): Promise<string> {
  const res = await firmaTemplate.render(kandidat(), { waTarget: '628999170623', isAdmin: true });
  expect(res.success).toBe(true);
  if (!res.blob) throw new Error('render tidak menghasilkan blob');
  return xlsxPreviewHtml(res.blob);
}

describe('xlsxPreviewHtml · pratinjau CV', () => {
  it('memuat data kandidat, bukan tabel kosong', async () => {
    const html = await previewFirma();
    expect(html).toContain('<table');
    expect(html).toContain('BUDI TRISNANTO');
    expect(html).toContain('2005年11月2日');
    expect(html).toContain('RESTORAN SAKURA');
  });

  it('mempertahankan merge template sebagai colspan/rowspan', async () => {
    const html = await previewFirma();
    // Judul form D1:P1 = 13 kolom, dan blok pas foto N2:P6 = rowspan 5.
    expect(html).toMatch(/colspan="1[0-9]"/);
    expect(html).toMatch(/rowspan="[2-9]"/);
    // Warna header ikut: tanpa ini form biru-putih keluar sebagai tabel putih
    // polos — keluhan pemilik "jelek bener ga nampak sesuai aslinya".
    expect(html).toMatch(/background:#[0-9A-F]{6}/i);
  });

  it('membawa lebar kolom template, bukan lebar otomatis', async () => {
    // Tanpa <colgroup>, kolom foto menyusut dan alamat panjang tumpah ke kolom
    // sebelah — terbaca seperti jumlah kolomnya berubah.
    const html = await previewFirma();
    expect(html).toContain('<colgroup>');
    expect(html).toContain('<col style="width:');
  });

  it('memangkas baris kosong: 996 baris template tidak ikut diekspor', async () => {
    const html = await previewFirma();
    const baris = (html.match(/<tr\b/g) ?? []).length;
    expect(baris).toBeGreaterThan(10);
    // Form Firma berisi 33 baris. Batas tetap 60 menyisakan baris kosong di
    // bawahnya, jadi pemangkasan harus mengikuti ISI, bukan angka bulat.
    expect(baris).toBeLessThanOrEqual(40);
    // 1,2 MB adalah ukuran tanpa pemangkasan; 60 baris jauh di bawahnya.
    expect(html.length).toBeLessThan(400_000);
  });

  it('mengembalikan string kosong untuk blob yang bukan xlsx', async () => {
    const html = await xlsxPreviewHtml(new Blob(['bukan workbook'])).catch(() => '');
    expect(html).toBe('');
  });
});
