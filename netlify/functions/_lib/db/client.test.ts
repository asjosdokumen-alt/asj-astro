// ==========================================
// TESTS: db/client — normalisasi WA, status, gender (Fase 1.5).
// Normalisasi WA adalah GATE kritis: 0xx → 62xx, buang non-digit — salah
// normalisasi = kandidat duplikat (kasus SATRIA 6223 vs 6282, 2026-08-15).
// ==========================================
import { describe, it, expect } from 'vitest';
import { normalizeWa, normalizeStatus, normalizeGender, writeBodyFor } from './client';
import { TABLE_COLUMNS } from './schema.generated';

describe('normalizeWa — format baku 628…', () => {
  it('0xx… dikonversi ke 62xx… (awalan HP)', () => {
    expect(normalizeWa('081234567890')).toBe('6281234567890');
    expect(normalizeWa('082130442661')).toBe('6282130442661');
  });

  it('8xx… (tanpa nol depan) dikonversi ke 628xx… — sama dengan frontend', () => {
    expect(normalizeWa('81234567890')).toBe('6281234567890');
    expect(normalizeWa('82130442661')).toBe('6282130442661');
  });

  it('buang semua non-digit (spasi, +, -, kurung)', () => {
    expect(normalizeWa('+62 812-3456-7890')).toBe('6281234567890');
    expect(normalizeWa('(0812) 345 678')).toBe('62812345678');
  });

  it('628… yang sudah baku tetap dipertahankan', () => {
    expect(normalizeWa('6281234567890')).toBe('6281234567890');
  });

  it('nilai kosong / non-string aman', () => {
    expect(normalizeWa('')).toBe('');
    expect(normalizeWa(undefined)).toBe('');
    expect(normalizeWa(null)).toBe('');
    expect(normalizeWa('abc')).toBe('');
  });

  it('nomor pendek tidak menjadi 628 palsu (tetap digit apa adanya)', () => {
    expect(normalizeWa('08123')).toBe('628123');
  });
});

describe('normalizeStatus — status lowongan (OPEN/CLOSE/URGENT)', () => {
  it('kata kunci tutup/close/selesai → CLOSE', () => {
    expect(normalizeStatus('CLOSE')).toBe('CLOSE');
    expect(normalizeStatus('TUTUP')).toBe('CLOSE');
    expect(normalizeStatus('SELESAI / CLOSE')).toBe('CLOSE');
  });

  it('selain itu → OPEN (termasuk kosong dianggap CLOSE di kode lama)', () => {
    expect(normalizeStatus('OPEN')).toBe('OPEN');
    expect(normalizeStatus('✅ OPEN')).toBe('OPEN');
    expect(normalizeStatus('PENCARIAN KANDIDAT')).toBe('OPEN');
    expect(normalizeStatus('PEMBERKASAN')).toBe('OPEN');
    expect(normalizeStatus('')).toBe('CLOSE');
  });

  it('URGENT menang atas kata kunci lain', () => {
    expect(normalizeStatus('URGENT')).toBe('URGENT');
    expect(normalizeStatus('OPEN URGENT')).toBe('URGENT');
  });
});

describe('normalizeGender — kanonikal LAKI-LAKI/PEREMPUAN (konvensi situs lama)', () => {
  it('berbagai varian laki-laki (termasuk L — konvensi L/P)', () => {
    for (const v of ['LAKI-LAKI', 'laki', 'L', 'LK', 'M', 'MALE', 'PRIA', 'Laki-laki']) {
      expect(normalizeGender(v)).toBe('LAKI-LAKI');
    }
  });

  it('berbagai varian perempuan (termasuk P — konvensi L/P)', () => {
    for (const v of [
      'PEREMPUAN',
      'perempuan',
      'P',
      'PR',
      'W',
      'F',
      'FEMALE',
      'WANITA',
      'CEWEK',
      '女',
    ]) {
      expect(normalizeGender(v)).toBe('PEREMPUAN');
    }
  });

  it('nilai tak dikenal / kosong → kosong (bukan L/P)', () => {
    expect(normalizeGender('')).toBe('');
    expect(normalizeGender('-')).toBe('');
    expect(normalizeGender('n/a')).toBe('');
  });
});

/**
 * ==========================================
 * TESTS: db/client — writeBodyFor (sisi TULIS dari kontrak skema)
 * ==========================================
 * Sisi BACA sudah dijaga sejak Phase D: `resolveSelect()` melewatkan setiap
 * `select` lewat `schema.generated.ts`, jadi kolom yang tidak ada tidak pernah
 * sampai ke kabel. Sisi TULIS tidak punya penjaga apa pun, dan PostgREST
 * membalas kolom asing di body dengan **400 / PGRST204** — SELURUH baris
 * ditolak, bukan cuma kolomnya.
 *
 * Terukur 2026-10-08 (PATCH tanpa baris yang cocok, jadi tidak ada data yang
 * tersentuh):
 *   body {nama_lengkap, submitted_by} -> HTTP 400 "Could not find the
 *     'submitted_by' column of 'ai_form_submissions' in the schema cache"
 *   body {nama_lengkap}               -> HTTP 204
 *
 * Itulah kenapa "Simpan CV AI" selalu gagal: `handleSubmitDataAsj` mengirim
 * kunci itu. `writeBodyFor` adalah penjaganya, dan tes di bawah memaku dua
 * janjinya: kolom asing DIBUANG (supaya tulisannya selamat) dan namanya
 * DILAPORKAN (supaya drift skema tidak hilang tanpa suara).
 */
describe('writeBodyFor — kolom asing dibuang, bukan membatalkan seluruh baris', () => {
  it('membuang kolom yang tidak ada di kontrak dan melaporkan namanya', () => {
    const { body, dropped } = writeBodyFor('ai_form_submissions', {
      wa: '628123',
      nama_lengkap: 'BUDI',
      submitted_by: 'admin:test',
    });

    expect(body).toEqual({ wa: '628123', nama_lengkap: 'BUDI' });
    expect(dropped).toEqual(['submitted_by']);
  });

  it('kolom yang benar-benar ada tidak tersentuh', () => {
    const known = TABLE_COLUMNS.ai_form_submissions;
    const body: Record<string, unknown> = {};
    for (const col of known) body[col] = 'x';

    const out = writeBodyFor('ai_form_submissions', body);
    expect(out.dropped).toEqual([]);
    expect(Object.keys(out.body as Record<string, unknown>).sort()).toEqual([...known].sort());
  });

  it('tabel di luar kontrak dibiarkan apa adanya (tidak ada dasar untuk memfilternya)', () => {
    const row = { apa_saja: 1, submitted_by: 2 };
    const out = writeBodyFor('tabel_yang_tidak_ada', row);
    expect(out.body).toBe(row);
    expect(out.dropped).toEqual([]);
  });

  it('body berupa array difilter per baris (insert massal)', () => {
    const { body, dropped } = writeBodyFor('ai_form_submissions', [
      { wa: '1', submitted_by: 'a' },
      { wa: '2', nama_lengkap: 'B' },
    ]);
    expect(body).toEqual([{ wa: '1' }, { wa: '2', nama_lengkap: 'B' }]);
    // Dilaporkan SEKALI walau muncul di beberapa baris.
    expect(dropped).toEqual(['submitted_by']);
  });

  it('body yang bukan objek dilewatkan tanpa error', () => {
    expect(writeBodyFor('ai_form_submissions', null).body).toBeNull();
    expect(writeBodyFor('ai_form_submissions', 'teks').body).toBe('teks');
    expect(writeBodyFor('ai_form_submissions', 42).body).toBe(42);
  });

  it('tidak mengubah objek pemanggil (body boleh dipakai ulang oleh caller)', () => {
    const original = { wa: '628123', submitted_by: 'admin:test' };
    writeBodyFor('ai_form_submissions', original);
    // `supabaseUpsert` memakai ulang `row` di jalur fallback-nya, jadi mutasi di
    // sini akan terlihat sebagai kolom yang hilang dari percobaan kedua.
    expect(original).toEqual({ wa: '628123', submitted_by: 'admin:test' });
  });
});
