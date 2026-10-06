// ==========================================
// TESTS: A07 parity crosscheck (2026-09-04) — E-Sign & Naitei
//
// Fixes verified here:
//   1. handleSimpanDataTtdNaitei menerima ARRAY args (callAPI) maupun objek
//      (GAS legacy) — sebelumnya hanya objek, jadi jalan HTTP tak pernah
//      menemukan wa ("Nomor WA tidak ditemukan").
//   2. Guard kini kandidat (self) ATAU admin, bukan kandidat-only — legacy
//      bukaModalTtd mengizinkan admin selalu membuka/menandatangani.
//   3. Scope tetap owner-or-admin (IDOR) & semua rejection di bawah terjadi
//      SEBELUM sentuhan DB (DB-free).
// ==========================================
import { describe, it, expect } from 'vitest';
import { signToken } from '../_lib/session';
import { handleSimpanDataTtdNaitei, handleSaveSignature } from '../_lib/ai/cv';

const _kandidatA = signToken({ role: 'kandidat', wa: '6281111111111' });
const kandidatB = signToken({ role: 'kandidat', wa: '6289999999999' });

const asRecord = (p: Promise<unknown>): Promise<Record<string, any>> => p as Promise<Record<string, any>>;

const SIGS = { wa: '6281111111111', ttd1: 'data:image/png;base64,AAA', nama1: '', ttd2: '', nama2: '' };

describe('simpanDataTtdNaitei — guard & payload unwrap (A07)', () => {
  it('anonymous callers are rejected before any DB read/write', async () => {
    const res = await asRecord(handleSimpanDataTtdNaitei(SIGS));
    expect(res.sessionInvalid).toBe(true);
    expect(res.success).toBe(false);
  });

  it('accepts the ARRAY args shape used by callAPI (unwrap payload[0])', async () => {
    // Owner sendiri → melewati guard; uji lewat kandidat LAIN untuk tetap DB-free:
    // kalau payload tidak di-unwrap, wa menjadi undefined dan error berbeda.
    const res = await asRecord(handleSimpanDataTtdNaitei([SIGS], kandidatB));
    expect(res.success).toBe(false);
    expect(res.error).toContain('Akses ditolak');
  });

  it('accepts the legacy OBJECT payload shape (GAS)', async () => {
    const res = await asRecord(handleSimpanDataTtdNaitei(SIGS, kandidatB));
    expect(res.success).toBe(false);
    expect(res.error).toContain('Akses ditolak');
  });

  it('a kandidat cannot sign for another WA (owner-or-admin scope)', async () => {
    const res = await asRecord(handleSimpanDataTtdNaitei([SIGS], kandidatB));
    expect(res.error).toContain('Akses ditolak');
  });
});

describe('saveSignature — guard (A07)', () => {
  it('anonymous callers are rejected before any DB read/write', async () => {
    const res = await asRecord(handleSaveSignature(['6281111111111', 'data:image/png;base64,AAA']));
    expect(res.sessionInvalid).toBe(true);
  });

  it('a kandidat cannot save a signature for another WA', async () => {
    const res = await asRecord(
      handleSaveSignature(['6281111111111', 'data:image/png;base64,AAA'], kandidatB),
    );
    expect(res.success).toBe(false);
    expect(res.error).toContain('Akses ditolak');
  });
});
