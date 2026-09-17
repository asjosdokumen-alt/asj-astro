// ==========================================
// TESTS: aiCvDraft — muat draf CV ke state flat AiCvForm
//
// Kenapa ini diuji ketat: panel admin di tab Pelamar memuat CV kandidat ke
// AiCvForm lalu menyimpannya kembali. Kalau satu kunci flat tidak terpetakan
// (atau hanya membaca satu dari beberapa kunci warisan), admin melihat kolom
// kosong, menekan simpan, dan data kandidat TERHAPUS. Tes di bawah mengunci
// cakupan lengkap + pembacaan multi-path itu.
// ==========================================
import { describe, it, expect } from 'vitest';
import { AI_CV_FLAT_KEYS, AI_CV_PATHS, mapAiCvDraft, mergeAiDraft, parseAiCvDraft } from './aiCvDraft';

describe('aiCvDraft — cakupan peta', () => {
  it('setiap kunci flat punya minimal satu path (kunci tak terpetakan = kolom selalu kosong)', () => {
    const missing = AI_CV_FLAT_KEYS.filter((k) => !AI_CV_PATHS[k] || AI_CV_PATHS[k]!.length === 0);
    expect(missing, 'kunci flat tanpa path di AI_CV_PATHS').toEqual([]);
  });

  it('tidak ada path yatim: setiap path di AI_CV_PATHS milik kunci flat yang dikenal', () => {
    const known = new Set<string>(AI_CV_FLAT_KEYS);
    const orphan = Object.keys(AI_CV_PATHS).filter((k) => !known.has(k));
    expect(orphan, 'kunci di AI_CV_PATHS yang tidak ada di AI_CV_FLAT_KEYS').toEqual([]);
  });

  it('kunci warisan yang kuncinya BEDA dari payload punya fallback (bukan hanya satu path)', () => {
    // Terukur dari legacy: tulis ≠ baca. Kalau daftar ini menyusut jadi satu
    // path, round-trip load→save mulai menghapus data.
    const needsFallback = [
      'keinginan_id', 'keinginan_jp', 'moti_id', 'moti_jp', 'pulang_id', 'pulang_jp',
      'keahlian_id', 'keahlian_jp', 'alasan_id', 'alasan_jp', 'gaji_yen', 'tabungan',
      'bhs_jepang', 'nilai', 'lisensi', 'alergi_id', 'medis_id', 'laka_id',
    ];
    for (const k of needsFallback) {
      expect(AI_CV_PATHS[k]!.length, k + ' harus punya >1 path').toBeGreaterThan(1);
    }
  });
});

describe('aiCvDraft — mapAiCvDraft', () => {
  it('membaca bentuk bersarang ke flat, dan melewati nilai kosong/placeholder "-"', () => {
    const out = mapAiCvDraft({
      identitas: { nama_lengkap: 'BUDI', paspor: '-', sim: '  ' },
      fisik: { tb: '170' },
      wawancara: { promosi_id: 'Rajin' },
    });
    expect(out.nama).toBe('BUDI');
    expect(out.tb).toBe('170');
    expect(out.promo_id).toBe('Rajin');
    // "-" dan spasi kosong bukan data — jangan mengisi state dengannya.
    expect('paspor' in out).toBe(false);
    expect('sim' in out).toBe(false);
  });

  it('kunci warisan terbaca dari path ALTERNATIF saat path utama kosong', () => {
    // Draf yang ditulis fieldPaths legacy (bukan payload AiCvForm).
    const legacyShaped = mapAiCvDraft({
      wawancara: {
        keinginan_id: 'Beli rumah',
        motivasi_id: 'Belajar budaya',
        rencana_pulang_id: 'Buka usaha',
        keahlian_id: 'Mengelas',
        alasan_bidang_id: 'Suka mesin',
        harapan_gaji: '200000',
        harapan_tabungan: '300 juta',
      },
      sertifikasi: { bahasa_jepang: 'N4', nilai: '120', lisensi: 'KAIGO' },
    });
    expect(legacyShaped.keinginan_id).toBe('Beli rumah');
    expect(legacyShaped.moti_id).toBe('Belajar budaya');
    expect(legacyShaped.pulang_id).toBe('Buka usaha');
    expect(legacyShaped.keahlian_id).toBe('Mengelas');
    expect(legacyShaped.alasan_id).toBe('Suka mesin');
    expect(legacyShaped.gaji_yen).toBe('200000');
    expect(legacyShaped.tabungan).toBe('300 juta');
    expect(legacyShaped.bhs_jepang).toBe('N4');
    expect(legacyShaped.nilai).toBe('120');
    expect(legacyShaped.lisensi).toBe('KAIGO');
  });

  it('path utama (yang ditulis AiCvForm) menang atas path warisan', () => {
    const out = mapAiCvDraft({
      wawancara: { keinginan_pribadi: 'BARU', keinginan_id: 'LAMA' },
    });
    expect(out.keinginan_id).toBe('BARU');
  });
});

describe('aiCvDraft — mergeAiDraft (AI di atas master)', () => {
  /**
   * `mergeAiDraft` returns `Record<string, unknown>`, which is honest — it
   * merges arbitrary blobs. Reading nested fields off it therefore needs a
   * narrowing step, and `as any` was doing that job while also switching off
   * every subsequent check (a typo in `.identitas.ktp` would have type-checked
   * fine). This asserts the shape ONCE, per nested read, so a wrong key is a
   * compile error rather than a silently-undefined assertion.
   *
   * `Record<string, unknown>` in, `Record<string, unknown>` out — no `any`.
   */
  const nested = (o: Record<string, unknown>, key: string): Record<string, unknown> => {
    const v = o[key];
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      throw new Error(`expected ${key} to be an object, got ${JSON.stringify(v)}`);
    }
    return v as Record<string, unknown>;
  };
  const list = (o: Record<string, unknown>, key: string): unknown[] => {
    const v = o[key];
    if (!Array.isArray(v)) {
      throw new Error(`expected ${key} to be an array, got ${JSON.stringify(v)}`);
    }
    return v;
  };

  it('menggabungkan dalam-dalam dan AI menang', () => {
    const merged = mergeAiDraft(
      { identitas: { nama_lengkap: 'BUDI', ktp: '3512' }, medis: { rokok: 'Tidak' } },
      { identitas: { nama_lengkap: 'BUDI SANTOSO' } },
    );
    expect(nested(merged, 'identitas').nama_lengkap).toBe('BUDI SANTOSO');
    expect(nested(merged, 'identitas').ktp).toBe('3512'); // kunci master tetap ada
    expect(nested(merged, 'medis').rokok).toBe('Tidak');
  });

  it('nilai AI kosong TIDAK menimpa nilai master yang terisi', () => {
    // AI sering mengembalikan '' untuk field yang belum ditanyakan; menimpanya
    // akan mengubah kolom master yang sudah benar jadi kosong.
    const merged = mergeAiDraft({ identitas: { ktp: '3512', sim: 'A' } }, { identitas: { ktp: '', sim: '-' } });
    expect(nested(merged, 'identitas').ktp).toBe('3512');
    expect(nested(merged, 'identitas').sim).toBe('A');
  });

  it('array AI yang tidak kosong menimpa; array kosong tidak menghapus', () => {
    const merged = mergeAiDraft({ pendidikan: [{ tingkat: 'SMA' }] }, { pendidikan: [] });
    expect(list(merged, 'pendidikan')).toEqual([{ tingkat: 'SMA' }]);
    const merged2 = mergeAiDraft({ pendidikan: [{ tingkat: 'SMA' }] }, { pendidikan: [{ tingkat: 'SMP' }] });
    expect(list(merged2, 'pendidikan')).toEqual([{ tingkat: 'SMP' }]);
  });

  it('base null/undefined tetap menghasilkan objek', () => {
    expect(mergeAiDraft(null, null)).toEqual({});
    expect(mergeAiDraft(undefined, { a: '1' })).toEqual({ a: '1' });
  });
});

describe('aiCvDraft — parseAiCvDraft (balasan getDrafCvMaster)', () => {
  const response = {
    identitas: { nama_lengkap: 'BUDI', no_wa: '6281234567890' },
    fisik: { tb: '170' },
    // Kunci khusus AI hanya ada di sini — tanpa deep-merge, hilang.
    AIDATAJSON: JSON.stringify({
      medis: { alergi_id: 'Udang' },
      wawancara: { promosi_id: 'Disiplin' },
    }),
  };

  it('mem-parse AIDATAJSON lalu deep-merge di atas bagian master', () => {
    const out = parseAiCvDraft(response);
    expect(out.nama).toBe('BUDI');
    expect(out.hp).toBe('6281234567890');
    expect(out.tb).toBe('170');
    expect(out.alergi_id).toBe('Udang'); // dari AIDATAJSON
    expect(out.promo_id).toBe('Disiplin'); // dari AIDATAJSON
  });

  it("AIDATAJSON rusak atau '-' tidak melempar — bagian master tetap terbaca", () => {
    expect(parseAiCvDraft({ ...response, AIDATAJSON: '{bukan json' }).nama).toBe('BUDI');
    expect(parseAiCvDraft({ ...response, AIDATAJSON: '-' }).nama).toBe('BUDI');
    expect(parseAiCvDraft({ ...response, AIDATAJSON: undefined }).nama).toBe('BUDI');
  });

  it('balasan error ({error}) menghasilkan objek kosong, bukan lemparan', () => {
    expect(parseAiCvDraft({ error: 'Data Master belum ada (6281).' })).toEqual({});
    expect(parseAiCvDraft(null)).toEqual({});
  });
});
