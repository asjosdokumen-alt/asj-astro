/**
 * e2e/kernel-db-role.test.ts — peran Postgres yang SAH di klien ber-sesi.
 *
 * MASALAH YANG DIKUNCI TES INI
 * ----------------------------
 * `userClient()` menandatangani JWT Supabase dengan `role: verified.role`,
 * sementara `signToken()` hanya pernah menulis `'admin'` atau `'kandidat'`
 * (lihat _lib/session.ts dan contexts/identity/service.ts:59,135,150,173,188,197).
 * Keduanya BUKAN role Postgres. PostgREST menolak peran tak dikenal SEBELUM
 * RLS sempat dievaluasi (terukur 2026-10-12 terhadap gdw DAN bimq):
 *
 *   PATCH database_asj_form  Authorization: Bearer <JWT role=admin>
 *     -> 401 {"code":"22023","message":"role \"admin\" does not exist"}
 *   role=service_role  -> 204    role=authenticated -> 403 42501 (tanpa GRANT)
 *
 * Akibatnya tiga aksi admin mati: `applications.patchForm`,
 * `applications.deleteForm`, dan `jobs.patchJob` — ketiganya TIDAK ada di
 * SERVICE_ROLE_ALLOWLIST sehingga jatuh ke `userClient()`.
 *
 * MENGAPA `authenticated` BUKAN JAWABAN UNTUK ADMIN
 * -------------------------------------------------
 * Token sesi admin TIDAK membawa claim `wa` (identity/service.ts memanggil
 * `signToken({ role: 'admin', name, kind })` — tanpa `wa`). Policy
 * `form_own_wa` berbunyi `no_wa = jwt.claims->>'wa'`, jadi untuk admin ia
 * mencocokkan 0 baris: UPDATE-nya "berhasil" (204, `Prefer: return=minimal`)
 * tanpa mengubah apa pun — kegagalan yang lebih senyap daripada error.
 * Admin memang harus service_role; migrasi 007 menyatakannya sendiri:
 * "For admin/service-role requests, RLS is bypassed ... admins need
 * cross-user access".
 *
 * MENGAPA DI e2e/
 * ---------------
 * Tier `indexer` yang beku hanya menghitung mjs/cjs/js di `e2e/`, jadi `.ts`
 * di sini tidak memindahkan counter mana pun (R13f). WAJIB juga terdaftar di
 * `exclude` project `frontend` pada `vitest.config.ts`, atau ia berjalan di
 * jsdom dan terhitung dua kali (R13f-bis).
 */
import { createHmac } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { clientFor } from '../netlify/functions/_lib/kernel/db';
import { signToken } from '../netlify/functions/_lib/session';

const SESSION_SECRET = 'e2e-kernel-db-role-session-secret';
const JWT_SECRET = 'e2e-kernel-db-role-jwt-secret';
const ANON_KEY = 'e2e-anon-key';

/** Peran yang benar-benar ada sebagai role Postgres di Supabase. */
const POSTGRES_ROLES = new Set(['anon', 'authenticated', 'service_role']);

beforeAll(() => {
  // `env()` membaca process.env lebih dulu, dan pembacaan secret bersifat
  // lazy (di dalam signToken / createSupabaseJwt), jadi menetapkannya di
  // beforeAll sudah cukup — tidak perlu trik impor dinamis.
  process.env.SESSION_SECRET = SESSION_SECRET;
  process.env.SUPABASE_JWT_SECRET = JWT_SECRET;
  process.env.SUPABASE_URL = 'https://e2e-kernel-db-role.supabase.co';
  process.env.SUPABASE_ANON_KEY = ANON_KEY;
});

function adminToken(): string {
  return signToken({ role: 'admin', name: 'master', kind: 'session' });
}

function kandidatToken(): string {
  return signToken({ role: 'kandidat', wa: '628123456789', kind: 'session' });
}

/** Membaca payload JWT tanpa memverifikasi tanda tangannya. */
function payloadOf(jwt: string): Record<string, unknown> {
  const parts = jwt.split('.');
  expect(parts).toHaveLength(3);
  return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<string, unknown>;
}

/** Verifikasi tanda tangan HS256 secara mandiri, ala PostgREST. */
function signatureValid(jwt: string, secret: string): boolean {
  const [header, payload, signature] = jwt.split('.');
  const expected = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return signature === expected;
}

describe('kernel/db — peran JWT Supabase untuk klien ber-sesi', () => {
  it('sesi admin dipetakan ke role Postgres service_role', () => {
    const client = clientFor('applications.patchForm', adminToken());
    expect(client.label).toBe('user');
    expect(payloadOf(client.authKey).role).toBe('service_role');
  });

  it('sesi kandidat dipetakan ke role Postgres authenticated', () => {
    const client = clientFor('applications.deleteForm', kandidatToken());
    expect(client.label).toBe('user');
    expect(payloadOf(client.authKey).role).toBe('authenticated');
  });

  it('peran yang dipancarkan SELALU role Postgres yang nyata', () => {
    // Pernyataan umum dari bug di atas: apa pun peran di token sesi, yang
    // dikirim ke PostgREST harus role yang ada di Postgres. Inilah yang
    // membuat `role: 'admin'` -> 401 22023 mustahil terulang.
    for (const token of [adminToken(), kandidatToken()]) {
      const role = String(payloadOf(clientFor('jobs.patchJob', token).authKey).role);
      expect(POSTGRES_ROLES.has(role)).toBe(true);
    }
  });

  it('JWT-nya ditandatangani dengan SUPABASE_JWT_SECRET yang benar', () => {
    const jwt = clientFor('applications.patchForm', adminToken()).authKey;
    expect(signatureValid(jwt, JWT_SECRET)).toBe(true);
  });

  it('kontrol negatif: secret yang salah TIDAK memvalidasi tanda tangan itu', () => {
    // Tanpa kontrol ini, `signatureValid` bisa saja selalu true dan tes di
    // atasnya tidak membuktikan apa pun.
    const jwt = clientFor('applications.patchForm', adminToken()).authKey;
    expect(signatureValid(jwt, `${JWT_SECRET}-salah`)).toBe(false);
  });

  it('apikey tetap kunci anon — ia mengidentifikasi proyek, bukan peran', () => {
    const client = clientFor('applications.patchForm', adminToken());
    expect(client.apikey).toBe(ANON_KEY);
  });

  it('tanpa token sesi jatuh ke anon (baca publik)', () => {
    const client = clientFor('applications.patchForm');
    expect(client.label).toBe('anon');
    expect(client.authKey).toBe(ANON_KEY);
  });

  it('token sesi yang dipalsukan ditolak dan jatuh ke anon', () => {
    const forged = `${Buffer.from(JSON.stringify({ role: 'admin', exp: 4102444800 })).toString('base64url')}.palsu`;
    const client = clientFor('applications.patchForm', forged);
    expect(client.label).toBe('anon');
    expect(client.authKey).toBe(ANON_KEY);
  });

  it('operasi yang di-allowlist memakai kunci service-role, bukan JWT sesi', () => {
    const client = clientFor('registry.patchCandidate', adminToken());
    expect(client.label).toBe('service');
  });

});

/*
 * SENGAJA TIDAK DIUJI DI SINI — `SUPABASE_JWT_SECRET` kosong.
 *
 * Perilakunya nyata dan berbahaya: `createSupabaseJwt()` mengembalikan `''`
 * tanpa secret, lalu `userClient()` mundur ke anon. Digabung dengan
 * `Prefer: return=minimal`, UPDATE-nya menjawab **204 "sukses" tanpa
 * mengubah satu baris pun** — kegagalan yang lebih senyap daripada 401.
 *
 * Tapi ia TIDAK bisa diuji secara deterministik dari sini: `env()` membaca
 * `process.env` lebih dulu dan **jatuh ke `.env.local`** bila nilainya kosong
 * (`_lib/env.ts:204-208`). Di mesin yang punya `.env.local` (semua dev), JWT
 * tetap terbentuk; di CI yang tidak punya, ia kosong. Tesnya akan merah di
 * sini dan hijau di CI — persis jebakan "hijau/merah tergantung DB mana yang
 * ditunjuk `env`" yang sudah pernah memerahkan `client.test.ts` (lihat
 * catatan 2026-10-12 di berkas itu). Jadi hazard-nya didokumentasikan, bukan
 * diuji dengan asumsi yang bergantung mesin.
 */
