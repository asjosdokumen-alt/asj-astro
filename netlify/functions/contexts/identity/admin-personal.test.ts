// ==========================================
// TESTS: contexts/identity — personal admin login (three tiers)
//
// Restored 2026-09-13. The rebuild had kept only the DB tier of the legacy
// implementation, and the DB table it reads does not exist, so every named
// admin login answered "Admin tidak ditemukan." while the login modal kept
// offering the four-name picker. These tests pin the legacy resolution order:
//
//   1. PIN_<NAME>               (env — no network)
//   2. ASJ_ADMINS="N:pin,..."   (env — no network)
//   3. admin_credentials        (DB, bcrypt, best-effort, last)
//
// and the anti-enumeration property: one message for every miss, so the form
// cannot be used to discover which admin names exist.
//
// `./repository` is mocked: tier 3 is the only tier that touches the DB, and
// leaving it real would turn these unit tests into network tests that pass or
// fail on whether PostgREST happens to be reachable.
// ==========================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import bcrypt from 'bcryptjs';

vi.mock('./repository', () => ({
  findAdminByName: vi.fn(async () => null),
  findAdmins: vi.fn(async () => []),
  findCandidateForAuth: vi.fn(async () => null),
  findCandidateForRefresh: vi.fn(async () => null),
  supabaseJson: vi.fn(async () => []),
}));

import * as repo from './repository';
import { checkAdminPersonal } from './service';

const ENV_KEYS = ['PIN_KHOCI', 'PIN_BU_SARI', 'ASJ_ADMINS'] as const;
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  vi.mocked(repo.findAdminByName).mockResolvedValue(null);
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('checkAdminPersonal — tier 1: PIN_<NAME> dari env', () => {
  it('menerima PIN per-admin tanpa menyentuh DB', async () => {
    process.env.PIN_KHOCI = '4321';
    const r = await checkAdminPersonal('KHOCI', '4321');
    expect(r.success).toBe(true);
    expect(r.user).toBe('KHOCI');
    expect(r.token).toBeTruthy();
  });

  it('nama multi-kata dipetakan ke PIN_BU_SARI', async () => {
    process.env.PIN_BU_SARI = '9999';
    expect((await checkAdminPersonal('bu sari', '9999')).success).toBe(true);
  });

  it('PIN salah → gagal (dan tier 3 tetap dicoba, bukan di-skip)', async () => {
    process.env.PIN_KHOCI = '4321';
    const r = await checkAdminPersonal('KHOCI', '0000');
    expect(r.success).toBe(false);
    expect(repo.findAdminByName).toHaveBeenCalled();
  });

  it('login admin tetap hidup saat DB mati (inilah gunanya tier env)', async () => {
    process.env.PIN_KHOCI = '4321';
    vi.mocked(repo.findAdminByName).mockRejectedValue(new Error('ECONNREFUSED'));
    expect((await checkAdminPersonal('KHOCI', '4321')).success).toBe(true);
  });
});

describe('checkAdminPersonal — tier 2: ASJ_ADMINS', () => {
  it('membaca daftar "Nama:pin" dan cocok tanpa peduli huruf besar/kecil', async () => {
    process.env.ASJ_ADMINS = 'Budi:1111, Sari:2222';
    expect((await checkAdminPersonal('Budi', '1111')).success).toBe(true);
    expect((await checkAdminPersonal('sari', '2222')).success).toBe(true);
  });

  it('entri cacat (tanpa ":") diabaikan, bukan bikin tier 2 meledak', async () => {
    process.env.ASJ_ADMINS = 'cacat,Budi:1111';
    expect((await checkAdminPersonal('cacat', 'cacat')).success).toBe(false);
    expect((await checkAdminPersonal('Budi', '1111')).success).toBe(true);
  });

  it('PIN yang bukan milik nama itu tidak diterima', async () => {
    process.env.ASJ_ADMINS = 'Budi:1111,Sari:2222';
    expect((await checkAdminPersonal('Budi', '2222')).success).toBe(false);
  });
});

describe('checkAdminPersonal — tier 3: admin_credentials (best-effort, terakhir)', () => {
  it('hash bcrypt di DB diterima', async () => {
    const hash = await bcrypt.hash('5678', 10);
    vi.mocked(repo.findAdminByName).mockResolvedValue({ name: 'Budi', pin: hash });
    const r = await checkAdminPersonal('Budi', '5678');
    expect(r.success).toBe(true);
    expect(r.user).toBe('Budi');
  });

  it('PIN plaintext di DB TIDAK diterima (harus bcrypt)', async () => {
    vi.mocked(repo.findAdminByName).mockResolvedValue({ name: 'Budi', pin: '5678' });
    expect((await checkAdminPersonal('Budi', '5678')).success).toBe(false);
  });
});

describe('checkAdminPersonal — anti-enumerasi', () => {
  it('nama tak dikenal dan PIN salah memberi pesan yang identik', async () => {
    process.env.PIN_KHOCI = '4321';
    const unknown = await checkAdminPersonal('TIDAKADA', '0000');
    const wrongPin = await checkAdminPersonal('KHOCI', '0000');
    expect(unknown.success).toBe(false);
    expect(wrongPin.success).toBe(false);
    expect(unknown.message).toBe(wrongPin.message);
    // `error` juga diisi: LoginModal membaca r.error, bukan r.message.
    expect(unknown.error).toBe(wrongPin.error);
    expect(unknown.error).toBeTruthy();
  });

  it('nama atau PIN kosong ditolak sebelum tier mana pun', async () => {
    process.env.PIN_KHOCI = '4321';
    expect((await checkAdminPersonal('', '4321')).success).toBe(false);
    expect((await checkAdminPersonal('KHOCI', '')).success).toBe(false);
  });
});
