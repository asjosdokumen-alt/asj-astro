// ==========================================
// TESTS: A05 parity crosscheck (2026-09-04) — PemberkasanModal root
//
// Fixes verified here:
//   1. simpanBiodataLengkap was a NOT_IMPL stub on the docs surface while the
//      biodata row belongs to master-data — new handleSimpanBiodataLengkap
//      requires a verified session + owner-or-admin scope BEFORE any DB call
//      and persists exactly the legacy flat payload columns.
//   2. FILE_LABEL_COLUMNS now also accepts the canonical long label strings
//      the LIVE legacy client sends (CERTIFICATE JAPAN, PAS FOTO STUDIO, ...)
//      so re-uploaded/legacy rows map to the same *_url columns instead of
//      being silently dropped.
// Every rejection below fires BEFORE any DB/network call (DB-free).
// ==========================================
import { describe, it, expect } from 'vitest';
import { signToken } from '../_lib/session';
import { handleSimpanBiodataLengkap, buildBioPatch, buildCandSyncPatch } from './master-data/service';
import { FILE_LABEL_COLUMNS } from './documents/service';

const kandidatA = signToken({ role: 'kandidat', wa: '6281111111111' });
const kandidatB = signToken({ role: 'kandidat', wa: '6289999999999' });
const admin = signToken({ role: 'admin', wa: '6280000000000' });

const asRecord = (p: Promise<unknown>): Promise<Record<string, any>> => p as Promise<Record<string, any>>;

const BIO_PAYLOAD = {
  wa: '6281111111111',
  email: 'budi@mail.com',
  tempat_lahir: 'Ponorogo',
  tgl_lahir: '2000-01-01',
  alamat_lengkap: 'Jl. Merdeka 1',
  nama_ayah: 'Ayah Budi',
  ttl_ayah: 'Ponorogo, 1970-01-01',
  nama_ibu: 'Ibu Budi',
  ttl_ibu: 'Ponorogo, 1972-02-02',
  no_pasport: 'C1234567',
  no_coe: 'COE-2026-01',
  kota_pasport: 'Surabaya',
  tgl_pasport: '2026-01-01',
  exp_pasport: '2031-01-01',
  nama_perusahaan: 'PT Sakura Japan',
  nama_shacou: 'Sakura Shacou',
  telp_perusahaan: '0352-123456',
  web_perusahaan: 'https://sakura.example',
  alamat_perusahaan: 'Jl. Jepang 1, Jakarta',
};

describe('master-data — simpanBiodataLengkap guard (A05)', () => {
  it('anonymous callers are rejected before any DB read/write', async () => {
    const res = await asRecord(handleSimpanBiodataLengkap([BIO_PAYLOAD]));
    expect(res.sessionInvalid).toBe(true);
    expect(res.success).toBe(false);
  });

  it('a kandidat may not save biodata for another WA (owner-or-admin gate)', async () => {
    const res = await asRecord(
      handleSimpanBiodataLengkap([{ ...BIO_PAYLOAD, wa: '6281111111111' }], kandidatB),
    );
    expect(res.success).toBe(false);
    expect(res.error).toContain('Akses ditolak');
  });

  it('an empty payload without any bio field is rejected', async () => {
    const res = await asRecord(handleSimpanBiodataLengkap([{ wa: '6281111111111' }], admin));
    expect(res.success).toBe(false);
    expect(res.error).toContain('Tidak ada data biodata');
  });
});

describe('buildBioPatch — legacy flat payload → master columns (A05)', () => {
  it('maps legacy keys to REAL master_database_candidate columns, trimming values', () => {
    const { master } = buildBioPatch([BIO_PAYLOAD]);
    expect(master.email).toBe('budi@mail.com');
    expect(master.no_coe).toBe('COE-2026-01');
    // Kolom asli tabel (format JP) — nama legacy tidak ada di skema.
    expect(master.no_paspor).toBe('C1234567');
    expect(master.kota_terbit_pasport).toBe('Surabaya');
    expect(master.tgl_terbit_pasport).toBe('2026-01-01');
    expect(master.keluarga_1_nama).toBe('Ayah Budi');
    expect(master.pekerjaan_1_nama_perusahaan).toBe('PT Sakura Japan');
    // Field legacy tanpa kolom di tabel di-drop (bukan 400 PostgREST).
    // Skema keluarga hanya punya keluarga_1_nama — anggota 2+ hanya *_hubungan_jp.
    expect(master.nama_ayah).toBeUndefined();
    expect(master.nama_ibu).toBeUndefined();
    expect(master.keluarga_2_nama).toBeUndefined();
    expect(master.ttl_ayah).toBeUndefined();
    expect(master.nama_shacou).toBeUndefined();
    expect(master.alamat_perusahaan).toBeUndefined();
    // 11 pasangan [from,to] yang valid — semuanya terisi payload ini.
    expect(Object.keys(master)).toHaveLength(11);
  });

  it('skips placeholder (-) and empty values and unknown keys', () => {
    const { master } = buildBioPatch([
      { wa: '6281111111111', email: '-', nama_ayah: '', nama_ibu: 'IBU', extra: 'junk' },
    ]);
    expect(master.email).toBeUndefined();
    expect(master.keluarga_1_nama).toBeUndefined();
    expect(master.extra).toBeUndefined();
  });
});

describe('buildCandSyncPatch — master columns → candidate columns sync (A05)', () => {
  it('correctly maps master no_paspor to candidate no_pasport', () => {
    const { master } = buildBioPatch([BIO_PAYLOAD]);
    const candPatch = buildCandSyncPatch(master);
    expect(candPatch.no_pasport).toBe('C1234567');
    expect(candPatch.email).toBe('budi@mail.com');
    expect(candPatch.tempat_lahir).toBe('Ponorogo');
    expect(candPatch.tgl_lahir).toBe('2000-01-01');
    expect(candPatch.alamat_lengkap).toBe('Jl. Merdeka 1');
  });

  it('handles empty or missing passport without error', () => {
    const candPatch = buildCandSyncPatch({});
    expect(candPatch.no_pasport).toBeUndefined();
    expect(Object.keys(candPatch)).toHaveLength(0);
  });
});

describe('FILE_LABEL_COLUMNS — canonical tokens + legacy aliases (A05)', () => {
  it('canonical tokens the rebuild modal sends all map to a pemberkasan column', () => {
    // src/lib/berkasCatalog.ts sends exactly these tokens.
    const canonical: [string, string][] = [
      ['KK', 'kk_url'],
      ['AKTE', 'akte_url'],
      ['IJAZAH SD', 'sd_url'],
      ['IJAZAH SMP', 'smp_url'],
      ['IJAZAH SMA', 'sma_url'],
      ['UNIVERSITAS', 'univ_url'],
      ['PASPORT', 'pasport_url'],
      ['MCU', 'mcu_url'],
      ['KONTRAK', 'kontrak_url'],
      ['SERTIFIKAT', 'cert_url'],
      ['KTP', 'ktp_url'],
      ['FOTO 2X3', 'foto2_url'],
      ['IZIN ORTU', 'ijinortu_url'],
      ['CPMI', 'cpmi_url'],
      ['BUKU NIKAH', 'kawin_url'],
      ['SURAT SEHAT', 'sehat_url'],
      ['BPJS', 'bpjs_url'],
      ['PSIKOTES', 'psikotes_url'],
    ];
    for (const [label, col] of canonical) {
      expect(FILE_LABEL_COLUMNS[label]).toBeDefined();
      expect(FILE_LABEL_COLUMNS[label].pemberkasan).toBe(col);
    }
  });

  it('CV, CV_REVISI, and REVISI all map to file_cv on candidate and master', () => {
    for (const token of ['CV', 'CV_REVISI', 'REVISI']) {
      expect(FILE_LABEL_COLUMNS[token]).toBeDefined();
      expect(FILE_LABEL_COLUMNS[token].cand).toBe('file_cv');
      expect(FILE_LABEL_COLUMNS[token].master).toBe('file_cv');
      expect(FILE_LABEL_COLUMNS[token].pemberkasan).toBeNull();
    }
  });

  it('legacy long labels used by the live legacy client map to the same columns', () => {
    const legacy: [string, string][] = [
      ['CERTIFICATE JAPAN', 'cert_url'],
      ['PAS FOTO STUDIO', 'foto2_url'],
      ['SURAT IJIN ORTU', 'ijinortu_url'],
      ['STATUS PERKAWINAN', 'kawin_url'],
      ['SURAT SEHAT PUSKESMAS', 'sehat_url'],
      ['HASIL PSIKOTES', 'psikotes_url'],
      ['IJAZAH UNIVERSITAS', 'univ_url'],
    ];
    for (const [label, col] of legacy) {
      expect(FILE_LABEL_COLUMNS[label]).toBeDefined();
      expect(FILE_LABEL_COLUMNS[label].pemberkasan).toBe(col);
    }
  });
});
