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
import { buildBiodataText, mergeAiGaps } from './biodataExport';

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

  it('kolom master MENANG atas AI — koreksi manual tidak ditimpa', () => {
    const master = {
      ...MASTER_AI_ONLY,
      wawancara: { ...MASTER_AI_ONLY.wawancara, kelebihan_id: 'HASIL KOREKSI ADMIN' },
    };
    const text = buildBiodataText({ bio: BIO, master });
    expect(text).toContain('HASIL KOREKSI ADMIN');
    expect(text).not.toContain('Disiplin dan cepat belajar');
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
