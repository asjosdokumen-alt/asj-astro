/**
 * TESTS: record template CV (`sys_config`) — kontrak admin ↔ aksi backend ↔ generator.
 *
 * KENAPA DI `e2e/`: `indexer` menghitung SELURUH berkas di bawah `src/**`, jadi
 * `.test.ts` baru di sana memindahkan counter beku.
 *
 * BUG YANG DIKUNCI
 * ----------------
 * `config_value` adalah TEXT bebas, jadi ia bisa berisi apa saja: JSON rusak,
 * record setengah jadi, atau baris `sys_config` milik fitur lain. Kalau yang
 * rusak diterima sebagai "template kosong", hasilnya bukan error — hasilnya CV
 * berisi nama kandidat lain, atau berkas tanpa satu pun sel terisi. Karena itu
 * `decodeTemplateRecord` mengembalikan `null`, dan baris `config_type` lain
 * diabaikan.
 */
import { describe, it, expect } from 'vitest';
import {
  CV_TEMPLATE_CONFIG_TYPE,
  encodeTemplateRecord,
  decodeTemplateRecord,
  decodeTemplateRows,
  templateIdFromName,
  type CvTemplateRecord,
} from '../src/lib/cv-template-factory/templates';

const REC: CvTemplateRecord = {
  id: 'cv-rirekisho-baku',
  nama: 'Rirekisho Baku',
  tipe: 'xlsx',
  fileUrl: 'https://x/storage/cv-templates/baku.xlsx',
  fieldMap: { B2: 'identitas.nama_lengkap', B3: 'identitas.tgl_lahir' },
  ambiguous: { B9: ['identitas.agama', 'sertifikasi.bahasa'] },
  riwayat: {
    pendidikan: { sheet: 'CV', startRow: 20, rows: 3, keyColumn: 'A', columns: { A: 'tingkat', B: 'sekolah' } },
  },
  contohWa: '6282130442661',
  aktif: true,
  updatedAt: '2026-10-10T00:00:00.000Z',
};

describe('decodeTemplateRecord — round trip', () => {
  it('encode → decode mengembalikan record yang sama', () => {
    expect(decodeTemplateRecord(encodeTemplateRecord(REC))).toEqual(REC);
  });

  it('menerima objek langsung (baris DB bisa sudah ter-parse)', () => {
    expect(decodeTemplateRecord({ ...REC })?.id).toBe(REC.id);
  });
});

describe('decodeTemplateRecord — menolak yang tidak bisa dipakai', () => {
  it('JSON rusak ⇒ null', () => {
    expect(decodeTemplateRecord('{bukan json')).toBeNull();
  });

  it('kolom wajib kosong ⇒ null', () => {
    expect(decodeTemplateRecord({ ...REC, fileUrl: '' })).toBeNull();
    expect(decodeTemplateRecord({ ...REC, nama: '   ' })).toBeNull();
    expect(decodeTemplateRecord({ ...REC, id: '' })).toBeNull();
  });

  it('fieldMap hilang DAN riwayat hilang ⇒ null (template tanpa isi = tidak berguna)', () => {
    expect(decodeTemplateRecord({ ...REC, fieldMap: undefined, riwayat: undefined })).toBeNull();
    expect(decodeTemplateRecord({ ...REC, fieldMap: 'B2=identitas.nama', riwayat: undefined })).toBeNull();
  });

  it('template yang HANYA punya tabel riwayat tetap diterima', () => {
    // Penjaga di tab Config memakai syarat yang sama (`fieldMap` kosong boleh
    // asal ada riwayat). Dulu decode menuntut `fieldMap` objek, jadi template
    // seperti ini tersimpan lalu terbaca sebagai "record rusak".
    const rec = decodeTemplateRecord({ ...REC, fieldMap: undefined });
    expect(rec).not.toBeNull();
    expect(rec?.fieldMap).toEqual({});
    expect(rec?.riwayat?.pendidikan?.startRow).toBe(20);
  });

  it('entri fieldMap yang bukan string dibuang, sisanya tetap dipakai', () => {
    const rec = decodeTemplateRecord({
      ...REC,
      fieldMap: { B2: 'identitas.nama_lengkap', B3: 42, B4: '  ', B5: 'fisik.tb' },
    });
    expect(rec?.fieldMap).toEqual({ B2: 'identitas.nama_lengkap', B5: 'fisik.tb' });
  });

  it('blok riwayat tanpa kolom dibuang, tidak jadi blok kosong', () => {
    const rec = decodeTemplateRecord({
      ...REC,
      riwayat: { pendidikan: { sheet: 'CV', startRow: 20, rows: 3, keyColumn: 'A', columns: {} } },
    });
    expect(rec?.riwayat).toBeUndefined();
  });

  it('blok riwayat dengan koordinat tidak sah dibuang — baris 0 bukan baris Excel', () => {
    const cols = { A: 'tingkat', B: 'sekolah' };
    for (const bad of [
      { sheet: 'CV', startRow: 0, rows: 3, keyColumn: 'A', columns: cols },
      { sheet: 'CV', startRow: -1, rows: 3, keyColumn: 'A', columns: cols },
      { sheet: 'CV', startRow: 20, rows: 0, keyColumn: 'A', columns: cols },
      { sheet: 'CV', startRow: 20.5, rows: 3, keyColumn: 'A', columns: cols },
      { sheet: 'CV', startRow: 'dua puluh', rows: 3, keyColumn: 'A', columns: cols },
    ]) {
      const rec = decodeTemplateRecord({ ...REC, riwayat: { pendidikan: bad } });
      expect(rec?.riwayat, JSON.stringify(bad)).toBeUndefined();
    }
  });
});

describe('decodeTemplateRows — baris sys_config', () => {
  const rows = [
    { config_type: CV_TEMPLATE_CONFIG_TYPE, config_value: encodeTemplateRecord(REC) },
    { config_type: CV_TEMPLATE_CONFIG_TYPE, config_value: '{rusak' },
    { config_type: 'pengumuman', config_value: 'teks biasa fitur lain' },
    { config_type: CV_TEMPLATE_CONFIG_TYPE, config_value: encodeTemplateRecord({ ...REC, id: 'nonaktif', aktif: false }) },
  ];

  it('mengabaikan baris config_type lain dan record rusak', () => {
    const list = decodeTemplateRows(rows);
    expect(list.map((r) => r.id)).toEqual([REC.id]);
  });

  it('template nonaktif disembunyikan kecuali diminta', () => {
    expect(decodeTemplateRows(rows, { includeInactive: true }).map((r) => r.id)).toEqual([
      REC.id,
      'nonaktif',
    ]);
  });

  it('input bukan array ⇒ daftar kosong, bukan lempar', () => {
    expect(decodeTemplateRows(null)).toEqual([]);
  });
});


// ---------------------------------------------------------------------------
// ID TEMPLATE — dipakai sebagai kunci `sys_config` DAN nama berkas di Storage,
// jadi dua nama berbeda HARUS menghasilkan dua id berbeda.
// ---------------------------------------------------------------------------
describe('templateIdFromName', () => {
  it('nama ASCII menghasilkan slug yang enak dibaca', () => {
    expect(templateIdFromName('Rirekisho Baku')).toBe('tpl-rirekisho-baku');
    expect(templateIdFromName('  Rirekisho   Baku  ')).toBe('tpl-rirekisho-baku');
  });

  it('nama sama ⇒ id sama (unggah ulang = perbarui, bukan salinan kedua)', () => {
    expect(templateIdFromName('CV Contoh')).toBe(templateIdFromName('cv contoh'));
  });

  it('nama tanpa huruf/angka ASCII tidak menabrak nama lain', () => {
    // Dulu semuanya jatuh ke `tpl-`, sehingga template kedua MENIMPA yang
    // pertama — record-nya maupun berkasnya, tanpa peringatan apa pun.
    const a = templateIdFromName('履歴書');
    const b = templateIdFromName('日本語テンプレート');
    const c = templateIdFromName('***');
    expect(a).not.toBe('tpl-');
    expect(new Set([a, b, c]).size).toBe(3);
    // dan stabil untuk nama yang sama
    expect(templateIdFromName('履歴書')).toBe(a);
  });

  it('id tidak pernah kosong atau hanya `tpl-`', () => {
    for (const n of ['', '   ', '***', '---', '日本語', '  日本  ']) {
      const id = templateIdFromName(n);
      expect(id.length, JSON.stringify(n)).toBeGreaterThan('tpl-'.length);
    }
  });
});
