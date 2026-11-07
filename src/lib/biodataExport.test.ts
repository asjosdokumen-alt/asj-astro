// ==========================================
// TESTS: biodataExport — jawaban wawancara dari CV AI harus IKUT terunduh
//
// Keluhan pemilik 2026-10-22: *"download biodata tiap siswa kok hasilnya beda
// beda. padahal sudah isi lengkap semua beserta jawaban wawancara jiko pr di cv
// ai tapi ada yg masuk ke donload dan ada yg gak masuk"*.
//
// Sebabnya: `buildMasterNested()` membaca KOLOM master, sedangkan jalur simpan
// CV AI (`_lib/ai/cv.ts`) hanya menulis `ai_data_json` — kolom wawancara tidak
// pernah disentuh. Jadi berkas kandidat yang mengisi lewat form Master memuat
// jawaban wawancara, dan yang mengisi lewat CV AI tidak, walaupun isiannya sama
// lengkap.
// ==========================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildBiodataDocx, buildBiodataDocxXml, buildBiodataText, mergeAiGaps } from './biodataExport';

const BIO = { nama: 'AGUS KHOCI', wa: '628123456789' };

/** Bentuk `buildMasterNested` untuk kandidat yang mengisi lewat CV AI:
 *  kolom wawancara KOSONG, semuanya ada di `AIDATAJSON`. */
const MASTER_AI_ONLY = {
  identitas: { nama_lengkap: '', gender: '', hp: '' },
  wawancara: {
    kelebihan_id: '', kelebihan_jp: '', kekurangan_id: '', hobi_id: '',
    motivasi_ke_jepang: '', alasan_memilih_bidang: '', rencana_setelah_pulang: '',
    keahlian_khusus: '', gaji_yen: '', tabungan: '',
  },
  AIDATAJSON: JSON.stringify({
    identitas: { nama_lengkap: 'AGUS KHOCI', gender: 'LAKI-LAKI' },
    wawancara: {
      kelebihan_id: 'Disiplin dan cepat belajar',
      motivasi_id: 'Ingin bekerja di Jepang untuk membantu keluarga',
      alasan_bidang_id: 'Suka bidang otomotif sejak SMK',
      rencana_pulang_id: 'Membuka bengkel sendiri',
      keahlian_id: 'Mengelas dan servis mesin',
      harapan_gaji: '180000',
    },
  }),
};

describe('biodataExport — jawaban CV AI ikut terunduh', () => {
  it('blok WAWANCARA terisi dari AIDATAJSON saat kolom master kosong', () => {
    const text = buildBiodataText({ bio: BIO, master: MASTER_AI_ONLY });

    expect(text).toContain('WAWANCARA & MOTIVASI');
    // Ejaan AI (`motivasi_id`) harus mendarat di label master
    // (`motivasi_ke_jepang`) — itu inti pemetaan AI_CV_PATHS.
    expect(text).toContain('Motivasi ke Jepang');
    expect(text).toContain('Ingin bekerja di Jepang untuk membantu keluarga');
    expect(text).toContain('Disiplin dan cepat belajar');
    expect(text).toContain('Suka bidang otomotif sejak SMK');
    expect(text).toContain('Membuka bengkel sendiri');
    expect(text).toContain('Mengelas dan servis mesin');
  });

  it('identitas yang hanya ada di AI juga ikut (bukan cuma wawancara)', () => {
    const text = buildBiodataText({ bio: BIO, master: MASTER_AI_ONLY });
    expect(text).toContain('AGUS KHOCI');
    expect(text).toContain('LAKI-LAKI');
  });

  it('KOLOM menang atas AI — koreksi manual adalah kebenaran mutlak', () => {
    // Dikoreksi pemilik 2026-10-22: *"kolom yang bisa manual itu kebenaran
    // mutlak; data AI cuma membantu mengisi kolom"*. Versi sebelumnya
    // (`903ceef`) membalikkannya, dengan alasan yang sudah tidak berlaku
    // setelah jalur simpan CV AI ikut menulis kolom.
    const master = {
      ...MASTER_AI_ONLY,
      wawancara: { ...MASTER_AI_ONLY.wawancara, kelebihan_id: 'HASIL KOREKSI ADMIN' },
    };
    const text = buildBiodataText({ bio: BIO, master });
    expect(text).toContain('HASIL KOREKSI ADMIN');
    expect(text).not.toContain('Disiplin dan cepat belajar');
  });

  it('A boleh dihapus: yang sudah ada di kolom tidak berubah karena AIDATAJSON', () => {
    // Diuji di tingkat `mergeAiGaps` (bukan seluruh dokumen): invariannya
    // PER FIELD — field yang kolomnya terisi tidak boleh tersentuh AI, dan
    // field yang kolomnya kosong tetap boleh diisi AI. Dokumen utuh tidak bisa
    // dipakai untuk ini karena AI mengisi banyak field lain yang memang kosong.
    const master = {
      identitas: { nama_lengkap: 'AGUS KHOCI', gender: 'LAKI-LAKI' },
      wawancara: { kelebihan_id: 'HASIL KOREKSI ADMIN' },
      AIDATAJSON: JSON.stringify({
        identitas: { nama_lengkap: 'NAMA DARI AI', gender: 'PEREMPUAN', alamat: 'JL. DARI AI 1' },
        wawancara: { kelebihan_id: 'DARI AI' },
      }),
    };
    const out = mergeAiGaps(master) as { identitas: Record<string, unknown>; wawancara: Record<string, unknown> };
    expect(out.identitas.nama_lengkap).toBe('AGUS KHOCI');
    expect(out.identitas.gender).toBe('LAKI-LAKI');
    expect(out.wawancara.kelebihan_id).toBe('HASIL KOREKSI ADMIN');
    // …tapi kolom yang KOSONG tetap dibantu AI.
    expect(out.identitas.alamat).toBe('JL. DARI AI 1');
  });

  it('tanpa AIDATAJSON tetap jalan (tidak crash, tidak mengarang)', () => {
    const text = buildBiodataText({ bio: BIO, master: { identitas: { nama_lengkap: 'BUDI' } } });
    expect(text).toContain('BUDI');
  });

  it('AIDATAJSON rusak tidak melempar', () => {
    const text = buildBiodataText({ bio: BIO, master: { AIDATAJSON: 'bukan-json' } });
    expect(text).toContain('BIODATA KANDIDAT');
  });

  it('mergeAiGaps tidak mengubah objek pemanggil', () => {
    const before = JSON.stringify(MASTER_AI_ONLY);
    mergeAiGaps(MASTER_AI_ONLY);
    expect(JSON.stringify(MASTER_AI_ONLY)).toBe(before);
  });
});


/**
 * Ekspor WORD (.docx) — permintaan pemilik 2026-11-07.
 *
 * Yang dikunci di sini bukan "berkasnya bisa diunduh" (itu tombolnya), melainkan
 * tiga hal yang kalau salah tidak bergejala: isinya benar-benar memuat data,
 * karakter `&`/`<` tidak merusak dokumen, dan berkasnya adalah ZIP/OOXML yang
 * sah — bukan HTML yang diberi nama `.docx`.
 */
describe('biodataExport — Word (.docx) KHUSUS ADMIN', () => {
  it('memuat identitas dan seksi master, labelnya sama dengan ekspor teks', () => {
    const xml = buildBiodataDocxXml({ bio: BIO, master: MASTER_AI_ONLY });

    expect(xml).toContain('BIODATA KANDIDAT');
    expect(xml).toContain('AGUS KHOCI');
    // '&' WAJIB ter-escape di XML — label grup memang mengandung '&'.
    expect(xml).toContain('WAWANCARA &amp; MOTIVASI');
    expect(xml).toContain('Disiplin dan cepat belajar');
  });

  it('meng-escape karakter XML: nama ber-& dan < tidak merusak dokumen', () => {
    const xml = buildBiodataDocxXml({
      bio: { nama: 'A & B' },
      master: { identitas: { nama_lengkap: 'A & B <C>' } },
    });

    expect(xml).toContain('A &amp; B &lt;C&gt;');
    expect(xml).not.toContain('<C>');
  });

  it('menghasilkan ZIP/OOXML sah, bukan HTML bernama .docx', async () => {
    const blob = await buildBiodataDocx({ bio: BIO, master: MASTER_AI_ONLY });
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());

    for (const part of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml']) {
      expect(zip.file(part), `bagian ${part} hilang`).toBeTruthy();
    }

    const doc = zip.file('word/document.xml');
    expect(doc).toBeTruthy();
    const xml = doc ? await doc.async('string') : '';
    expect(xml.startsWith('<?xml')).toBe(true);
    // Keseimbangan tag: struktur rusak tidak akan terbaca Word sama sekali.
    expect((xml.match(/<w:tbl>/g) || []).length).toBe((xml.match(/<\/w:tbl>/g) || []).length);
    expect((xml.match(/<w:tr>/g) || []).length).toBe((xml.match(/<\/w:tr>/g) || []).length);
  });

  it('TIDAK dipasang di dasbor kandidat (permintaan pemilik 2026-11-07)', () => {
    // Gerbang satu baris: kalau suatu saat tombolnya "dibagikan" ke dasbor
    // siswa, tes ini yang mengingatkan bahwa itu keputusan yang pernah ditolak.
    const dash = readFileSync('src/components/candidate/CandidateDash.tsx', 'utf8');
    expect(dash).not.toContain('downloadBiodataDocx');
  });
});
