// ==========================================
// TESTS: ai/chat — normalizeBidang (pemilihan model wawancara per bidang SSW).
// Resolve bidang dari teks bebas (master/kandidat) ke BIDANG_INTERVIEW —
// salah map = kandidat dapat model wawancara bidang yang salah.
// ==========================================
import { describe, it, expect } from 'vitest';
import { normalizeBidang, boundTranscript, AI_FORM_DATA_INSTRUCTION, kumpulkanTugasTerjemah } from './chat';

// Known-word assertions: tests prove non-null by asserting it once (helper),
// mirroring how the callers treat matched bidang (BIDANG_DEFAULT fallback).
function must(raw: string): NonNullable<ReturnType<typeof normalizeBidang>> {
  const b = normalizeBidang(raw);
  expect(b).not.toBeNull();
  return b!;
}


describe('normalizeBidang — pilih model wawancara per bidang SSW', () => {
  it('7 bidang resmi dikenali (case-insensitive)', () => {
    expect(must('Kaigo').label).toBe('Kaigo (介護)');
    expect(must('KAIGO').label).toBe('Kaigo (介護)');
    expect(must('Shokuhin Seizou').label).toBe('Shokuhin Seizou (食品製造)');
    expect(must('Nougyou').label).toBe('Nougyou (農業)');
    expect(must('Kensetsu').label).toBe('Kensetsu (建設)');
    expect(must('Jidousha Seibi').label).toBe('Jidousha Seibi (自動車整備)');
    expect(must('Binbou').label).toBe('Binbou (ビルクリーニング)');
    expect(must('Sougou Service').label).toBe('Sougou Service (総合サービス)');
  });

  it('sinonim bahasa Indonesia/Inggris ikut terdeteksi', () => {
    expect(must('perawat lansia').label).toBe('Kaigo (介護)');
    expect(must('caregiver').label).toBe('Kaigo (介護)');
    expect(must('food manufacturing').label).toBe('Shokuhin Seizou (食品製造)');
    expect(must('pertanian').label).toBe('Nougyou (農業)');
    expect(must('konstruksi').label).toBe('Kensetsu (建設)');
    expect(must('otomotif').label).toBe('Jidousha Seibi (自動車整備)');
    expect(must('cleaning').label).toBe('Binbou (ビルクリーニング)');
    expect(must('hotel').label).toBe('Sougou Service (総合サービス)');
  });

  it('bidang tidak dikenal → null (caller pakai BIDANG_DEFAULT)', () => {
    expect(normalizeBidang('IT Programmer')).toBe(null);
    expect(normalizeBidang('')).toBe(null);
    expect(normalizeBidang(undefined)).toBe(null);
  });
});

// ==========================================
// TESTS: boundTranscript — transkrip wawancara dibatasi kepala + ekor.
//
// Satu-satunya tempat di lapisan AI yang transkripnya adalah MUATAN, bukan
// konteks tambahan: memotong per giliran berarti membuang isi wawancara. Tapi
// tanpa batas sama sekali, wawancara 60 giliran menempel utuh ke system prompt
// pada satu permintaan.
// ==========================================
describe('boundTranscript — transkrip panjang dipotong di TENGAH', () => {
  it('transkrip pendek lewat tanpa diubah', () => {
    expect(boundTranscript('Jeklin: halo\nKandidat: halo juga')).toBe(
      'Jeklin: halo\nKandidat: halo juga',
    );
  });

  it('kepala (jikoshoukai/biodata) DAN ekor (jawaban terbaru) sama-sama selamat', () => {
    const out = boundTranscript(`AWAL-JIKOSHOUKAI ${'x'.repeat(50_000)} AKHIR-JAWABAN`);

    // Bagian awal berisi jikoshoukai/biodata — yang paling sering masuk ke
    // `biodata` di hasil rangkuman, jadi tidak boleh dibuang.
    expect(out.startsWith('AWAL-JIKOSHOUKAI')).toBe(true);
    // Bagian akhir berisi jawaban terbaru.
    expect(out.endsWith('AKHIR-JAWABAN')).toBe(true);
    // Dan hasilnya benar-benar terbatas, bukan 50 ribu karakter.
    expect(out.length).toBeLessThan(20_000);
  });

  it('pemotongan DITANDAI di dalam prompt', () => {
    const out = boundTranscript('a'.repeat(40_000));
    // Tanpa penanda, model akan menyangka wawancaranya memang sependek itu dan
    // merangkum seolah tidak ada yang hilang.
    expect(out).toContain('dipotong');
  });
});

// ==========================================
// TESTS: prompt — alamat wajib berkode pos.
//
// Laporan pemilik 2026-10-25 (screenshot): ia minta "alamat lengkap sesuai model
// KTP dan kode posnya", dan Qween Jeklin menjawab
// "DUSUN NGLINGI DESA GANDU KEPUH KECAMATAN SUKOREJO KABUPATEN PONOROGO"
// — tanpa kode pos. Sebelum ini prompt TIDAK PERNAH menyebut kode pos sama sekali
// (grep "kode pos" di seluruh src/netlify = 0 hasil), jadi model tidak punya
// alasan untuk menambahkannya. Ketiga asersi di bawah gagal kalau aturan itu
// hilang lagi dari prompt.
// ==========================================
describe('prompt — alamat wajib berkode pos (format KTP)', () => {
  it('menyuruh AI menutup alamat dengan kode pos 5 digit', () => {
    expect(AI_FORM_DATA_INSTRUCTION).toMatch(/KODE POS/i);
    expect(AI_FORM_DATA_INSTRUCTION).toMatch(/5 digit/i);
  });

  it('mengizinkan kode pos diisi dari wilayah yang disebut, karena itu data publik', () => {
    expect(AI_FORM_DATA_INSTRUCTION).toMatch(/desa\/kecamatan\/kabupaten/i);
    expect(AI_FORM_DATA_INSTRUCTION).toMatch(/data wilayah publik/i);
  });

  it('tetap melarang mengarang RT/RW dan nomor rumah', () => {
    expect(AI_FORM_DATA_INSTRUCTION).toMatch(/JANGAN mengarang RT\/RW/i);
  });

  it('mewajibkan PROVINSI ikut ditulis, bukan berhenti di kabupaten', () => {
    expect(AI_FORM_DATA_INSTRUCTION).toMatch(/KABUPATEN\/KOTA, PROVINSI/i);
  });

  it('alamat_jp memakai urutan Jepang dan diawali 〒', () => {
    expect(AI_FORM_DATA_INSTRUCTION).toContain('〒');
    expect(AI_FORM_DATA_INSTRUCTION).toMatch(/TERBESAR ke TERKECIL/i);
  });

  // `alamat_jp` dulu TIDAK ADA di daftar kunci `identitas` pada skema prompt,
  // jadi model tidak punya tempat menaruhnya dan selalu mengembalikan null —
  // terukur 2026-10-25 lewat ai-chat lokal. Tanpa kunci ini, aturan 〒 di atas
  // tidak ada gunanya.
  it('skema identitas memuat kunci alamat_jp', () => {
    expect(AI_FORM_DATA_INSTRUCTION).toContain('"alamat","alamat_jp"');
  });

  it('memperbaiki alamat tanpa menyebut ulang tetap dijalankan', () => {
    expect(AI_FORM_DATA_INSTRUCTION).toMatch(/TANPA menyebut ulang alamatnya/i);
    expect(AI_FORM_DATA_INSTRUCTION).toMatch(/DATA KANDIDAT SAAT INI/);
  });

  it('aturan anti-mengarang data pribadi tidak ikut hilang', () => {
    expect(AI_FORM_DATA_INSTRUCTION).toMatch(/JANGAN menebak\/mengarang data yang tidak disebut/i);
  });
});

// Migrasi 047 menambah kolom `_jp` untuk field teks. Kolom yang ada tetapi
// tidak terdaftar di daftar tugas = kolom yang tidak pernah terisi, dan tidak
// ada satu pun galat. Tes ini mengunci bahwa tombol Terjemahkan benar-benar
// membuat tugas untuk keenam field baru + tiga kolom baris pekerjaan.
describe('migrasi 047 — field teks punya tugas terjemahan', () => {
  it('membuat tugas untuk skalar dan baris pekerjaan', () => {
    const tugas = kumpulkanTugasTerjemah({
      identitas: { darurat_nama: 'SITI' },
      sertifikasi: {
        bahasa_lain: 'Mandarin',
        level_bahasa_jepang: 'N4',
        level_bahasa_inggris: 'menengah',
        sertifikat_lain: 'JFT-Basic',
        catatan_cv: 'Siap ditempatkan',
      },
      pekerjaan: [{ jenis: 'KARYAWAN TETAP', bidang: 'Manufaktur', catatan: 'lembur penuh' }],
    });
    const paths = tugas.map((t) => t.path.join('.'));
    expect(paths).toContain('sertifikasi.bahasa_lain_jp');
    expect(paths).toContain('sertifikasi.level_bahasa_jepang_jp');
    expect(paths).toContain('sertifikasi.level_bahasa_inggris_jp');
    expect(paths).toContain('sertifikasi.sertifikat_lain_jp');
    expect(paths).toContain('sertifikasi.catatan_cv_jp');
    expect(paths).toContain('pekerjaan.0.jenis_jp');
    expect(paths).toContain('pekerjaan.0.bidang_jp');
    expect(paths).toContain('pekerjaan.0.catatan_jp');
    // Nama kontak darurat = nama orang → katakana, bukan terjemahan biasa.
    const katakana = tugas.find((t) => t.path.join('.') === 'identitas.kontak_darurat_nama_jp');
    expect(katakana?.jenis).toBe('kata');
  });
});

/* ── Kolom `_jp` yang berisi teks INDONESIA (2026-11-05) ─────────────────────
 * Terukur pada kandidat REIHAN: `ai_data_json.pendidikan[0]` berisi
 * `nama_sekolah: ""` dan `nama_sekolah_jp: "amanah sakura japan"`. Pemeriksa
 * lama hanya bertanya "kosong atau tidak", jadi kolom itu dianggap SELESAI:
 * tombol Terjemahkan melewatinya selamanya dan CV mencetak kata Indonesia di
 * kolom kanji. Aturannya sekarang: yang dianggap terisi adalah yang mengandung
 * huruf Jepang.
 */
describe('saringan terjemah — teks Indonesia di kolom _jp dianggap KOSONG', () => {
  it('kolom _jp berisi huruf latin tetap masuk daftar tugas', () => {
    const tugas = kumpulkanTugasTerjemah({
      identitas: { nama_lengkap: 'REIHAN OKTA', katakana: 'reihan okta' },
    });
    expect(tugas.map((t) => t.path.join('.'))).toContain('identitas.katakana');
  });

  it('kolom _jp yang SUDAH berhuruf Jepang tidak dikirim ulang', () => {
    const tugas = kumpulkanTugasTerjemah({
      identitas: { nama_lengkap: 'REIHAN OKTA', katakana: 'レイハン・オクタ' },
    });
    expect(tugas).toHaveLength(0);
  });

  it('baris riwayat: sekolah_jp berisi teks Indonesia ikut diterjemahkan', () => {
    const tugas = kumpulkanTugasTerjemah({
      pendidikan: [{ sekolah: 'SMK MUHAMMADIYAH 1 METRO', sekolah_jp: 'smk muhamadiyah 1 metro' }],
    });
    expect(tugas.map((t) => t.path.join('.'))).toContain('pendidikan.0.sekolah_jp');
  });

  it('baris riwayat: yang sudah kanji dilewati', () => {
    const tugas = kumpulkanTugasTerjemah({
      pendidikan: [{ sekolah: 'SMK MUHAMMADIYAH 1 METRO', sekolah_jp: 'ムハンマディヤ第1職業高等学校' }],
    });
    expect(tugas).toHaveLength(0);
  });
});

/* ── Kontrak data: DELTA, bukan seluruh CV (2026-11-05) ─────────────────────
 * Instruksi lama berbunyi "data harus berisi SEMUA data kandidat" DAN
 * "sertakan juga data yang sudah ada di DATA KANDIDAT SAAT INI". Itu perintah
 * menulis ulang seluruh CV pada setiap balasan — output token terbesar di
 * sistem, padahal klien sudah punya datanya dan menggabung dengan aturan
 * "hanya isi yang kosong". Yang diminta sekarang: kirim yang berubah saja.
 */
describe('kontrak data chat — delta, bukan seluruh CV', () => {
  it('melarang mengulang data yang tidak berubah', () => {
    expect(AI_FORM_DATA_INSTRUCTION).toContain('JANGAN mengulang field');
  });

  it('tidak lagi memerintahkan mengirim SEMUA data', () => {
    expect(AI_FORM_DATA_INSTRUCTION).not.toContain('SEMUA data kandidat');
    expect(AI_FORM_DATA_INSTRUCTION).not.toContain('sertakan juga data yang sudah ada');
  });

  it('skema kunci tetap lengkap — model masih tahu nama field yang sah', () => {
    for (const k of ['identitas', 'fisik', 'medis', 'pendidikan', 'pekerjaan', 'keluarga']) {
      expect(AI_FORM_DATA_INSTRUCTION).toContain(k);
    }
  });
});
