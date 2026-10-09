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

  it('fieldMap hilang/bukan objek ⇒ null (template tanpa peta = tidak berguna)', () => {
    expect(decodeTemplateRecord({ ...REC, fieldMap: undefined })).toBeNull();
    expect(decodeTemplateRecord({ ...REC, fieldMap: 'B2=identitas.nama' })).toBeNull();
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
