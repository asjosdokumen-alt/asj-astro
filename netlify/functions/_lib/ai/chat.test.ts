// ==========================================
// TESTS: ai/chat — normalizeBidang (pemilihan model wawancara per bidang SSW).
// Resolve bidang dari teks bebas (master/kandidat) ke BIDANG_INTERVIEW —
// salah map = kandidat dapat model wawancara bidang yang salah.
// ==========================================
import { describe, it, expect } from 'vitest';
import { normalizeBidang, boundTranscript } from './chat';

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
