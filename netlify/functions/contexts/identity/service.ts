/**
 * contexts/identity/service.ts — Auth business logic
 *
 * Pure business rules, no HTTP/Express/Netlify concerns.
 * Calls repository.ts for DB access, session.ts for tokens.
 *
 * PUBLIC INTERFACE (re-exported via index.ts):
 *   checkAdminMaster(pin) → { success, token? }
 *   checkAdminPersonal(name, pin) → { success, token? }
 *   refreshAdminSession(refreshToken) → { success, sessionToken? }
 *   loginKandidat(wa, password) → { success, token?, user? }
 *   refreshKandidatSession(refreshToken) → { success, sessionToken?, wa? }
 *   registerKandidat(nama, wa, password?, usia?) → { success }
 *   changePassword(wa, lama, baru) → { success }
 *   registerFcmToken(payload, sessionToken) → { success }
 *   verifyToken(token) → TokenPayload | null
 *   requireRole(token, role) → { token } | { error }
 *   requireAdmin(token) → { token } | { error }
 *   isOwnerOrAdmin(token, wa) → boolean
 */
import { safeError } from '../../_lib/kernel/errors';

import { timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { normalizeWa } from '../../shared/wa-rules';
import * as session from '../../_lib/session';
import * as repo from './repository';
import { env } from '../../_lib/env';

// S9 fix: satu pesan gagal login (anti-enumerasi nomor WA terdaftar).
const LOGIN_FAIL_MSG = 'Nomor WA atau password salah.';

// ── Admin auth ───────────────────────────────────────────────────────────────

/**
 * Get master PINs from env. Cached after first call.
 */
let _masterPins: string[] | null = null;
export function masterPins(): string[] {
  if (_masterPins) return _masterPins;
  const raw = [
    env('ADMIN_MASTER_PIN'),
    env('MASTER_PIN'),
    env('ADMIN_PIN'),
    env('PIN_KHOCI'),
    env('PIN_SACHOU'),
    env('PIN_AYOK'),
    env('PIN_KHOLIS'),
  ].filter(Boolean);
  _masterPins = [...new Set(raw)];
  return _masterPins;
}

export function checkAdminMaster(pin: string) {
  const pins = masterPins();
  if (!pins.includes(pin)) {
    return { success: false, message: 'PIN master salah.' };
  }
  const token = session.signToken({ role: 'admin', name: 'master', kind: 'session' });
  return { success: true, token };
}

/**
 * Personal admin login: name + PIN.
 *
 * WHY THIS IS NOT A DB LOOKUP
 *   The rebuild kept only the *third* tier of the legacy implementation
 *   (`F:\Asjpow4v7-main\khoci921\netlify\functions\_lib\actions-auth.ts`,
 *   `handleCheckAdminPersonal`) — the Supabase admin table — and that table does
 *   not exist in this project at all (probed 2026-09-13 against the catalog:
 *   `admin_credentials` is absent, not merely unexposed). Every named login
 *   therefore answered "Admin tidak ditemukan." while the login modal kept
 *   offering the form. Only master-PIN login worked.
 *
 *   Legacy resolved the name from env *first*, and treated the table as an
 *   optional extra. `ASJ_ADMINS` has been sitting in this module's env whitelist
 *   (`_lib/env.ts`) the whole time, read by nothing.
 *
 * THREE TIERS, in the legacy order:
 *   1. `PIN_<NAME>` — the legacy KHOCI special case, generalised to every
 *      per-admin PIN the env whitelist carries (`PIN_KHOCI`, `PIN_SACHOU`, …).
 *   2. `ASJ_ADMINS="Nama1:pin1,Nama2:pin2"` — the legacy "quick way for the
 *      rebuild", i.e. named admins without a schema change.
 *   3. The Supabase admin table, best-effort and last, bcrypt-compared.
 *
 *   Tiers 1 and 2 are env-only, so an admin can still get in during a total
 *   database outage — which is exactly when they most need to.
 *
 *   Tier 3 stays last on purpose: it is the tier whose table is missing, and it
 *   must never be able to mask a tier-1/2 match.
 */
const ADMIN_FAIL_MSG = 'Nama atau PIN salah.';

/** Constant-time string compare. Length is not secret here (it is an env PIN). */
function pinsEqual(a: string, b: string): boolean {
  const ba = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** Tier 1: `PIN_<NAME>` — `khoci` → `PIN_KHOCI`, `bu sari` → `PIN_BU_SARI`. */
function personalEnvPins(name: string): string[] {
  const key = 'PIN_' + name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  const value = env(key);
  return value ? [value] : [];
}

/** Tier 2: `ASJ_ADMINS="Nama1:pin1,Nama2:pin2"`. */
function asjAdminsPins(name: string): string[] {
  const list = env('ASJ_ADMINS');
  if (!list) return [];
  const want = name.trim().toLowerCase();
  const out: string[] = [];
  for (const item of list.split(',')) {
    const idx = item.indexOf(':');
    if (idx < 0) continue;
    const n = item.slice(0, idx).trim().toLowerCase();
    const p = item.slice(idx + 1).trim();
    if (n === want && p) out.push(p);
  }
  return out;
}

export async function checkAdminPersonal(name: string, pin: string) {
  const wanted = String(name || '').trim();
  const given = String(pin || '');
  if (!wanted || !given) {
    return { success: false, error: 'Nama dan PIN wajib diisi.', message: 'Nama dan PIN wajib diisi.' };
  }

  // Tiers 1 + 2 — env only, no network.
  for (const candidate of [...personalEnvPins(wanted), ...asjAdminsPins(wanted)]) {
    if (pinsEqual(candidate, given)) {
      const token = session.signToken({ role: 'admin', name: wanted, kind: 'session' });
      return { success: true, token, user: wanted };
    }
  }

  // Tier 3 — the DB table, if it ever exists. Best-effort: a missing table
  // throws and is swallowed, and the env tiers above remain the live path.
  try {
    const admin = await repo.findAdminByName(wanted);
    if (admin?.pin) {
      // S6 fix: bcrypt only, never plaintext — plaintext credentials in the DB
      // are a timing side-channel and mean the DB stores recoverable PINs.
      const pinMatch = await bcrypt.compare(given, String(admin.pin));
      if (pinMatch) {
        const who = String(admin.name || wanted);
        const token = session.signToken({ role: 'admin', name: who, kind: 'session' });
        return { success: true, token, user: who };
      }
    }
  } catch {
    /* admin table absent — see the note above */
  }

  // One message for every miss. The old code distinguished "not found" from
  // "wrong PIN", which is an enumeration oracle for admin names.
  //
  // `error` is set as well as `message`: LoginModal reads `r.error` for every
  // admin/kandidat flow (`LoginModal.tsx` — `showToast(r.error || t(...))`), so
  // a `message`-only rejection silently degrades to the generic "PIN salah"
  // toast and the operator never learns which field was wrong.
  return { success: false, error: ADMIN_FAIL_MSG, message: ADMIN_FAIL_MSG };
}

export async function refreshAdminSession(refreshToken: string) {
  const t = session.verifyToken(refreshToken);
  if (!t || t.kind !== 'refresh' || t.role !== 'admin') {
    return { success: false, message: 'Refresh token tidak valid.' };
  }
  const newToken = session.signToken({ role: 'admin', name: t.name, kind: 'session' });
  return { success: true, sessionToken: newToken };
}

// ── Candidate auth ───────────────────────────────────────────────────────────

export async function loginKandidat(wa: string, password: string) {
  const cand = await repo.findCandidateForAuth(wa);
  if (!cand) return { success: false, message: LOGIN_FAIL_MSG };
  const storedPass = String(cand.password_kandidat || '');
  // S9 fix: pesan gagal disamakan untuk semua kasus (akun tak ada / password
  // belum diatur / password salah) — tanpa ini nomor WA terdaftar bisa
  // di-enumerate. Rate limit per-IP sudah ditangani handlers.ts (LOGIN_ACTIONS).
  const ok = storedPass ? await bcrypt.compare(password, storedPass) : false;
  if (!ok) return { success: false, message: LOGIN_FAIL_MSG };
  const token = session.signToken({ role: 'kandidat', wa: cand.no_wa, kind: 'session' });
  return { success: true, token, user: 'kandidat', wa: cand.no_wa, name: cand.nama_lengkap };
}

export async function refreshKandidatSession(refreshToken: string) {
  const t = session.verifyToken(refreshToken);
  if (!t || t.kind !== 'refresh' || t.role !== 'kandidat') {
    return { success: false, message: 'Refresh token tidak valid.' };
  }
  const newToken = session.signToken({ role: 'kandidat', wa: t.wa, kind: 'session' });
  return { success: true, sessionToken: newToken, wa: t.wa };
}

export async function registerKandidat(nama: string, wa: string, password?: string, usia?: number) {
  // Check if already registered
  const existing = await repo.findCandidateForAuth(wa);
  if (existing) return { success: false, message: 'Nomor WA sudah terdaftar.' };
  // S8 fix: Require explicit password — never default to phone digits.
  // Default passwords are trivially guessable and enumerable.
  if (!password || password.length < 4) {
    return { success: false, message: 'Password harus diisi minimal 4 karakter.' };
  }
  const pass = password;
  const hash = await bcrypt.hash(pass, 10);
  // Insert via Supabase
  const { supabaseJson } = await import('./repository');
  try {
    await supabaseJson('POST', 'database_candidate', {
      body: {
        nama_lengkap: nama,
        no_wa: wa,
        password_kandidat: hash,
        status_kandidat: 'BARU',
        tanggal_daftar: new Date().toISOString(),
      },
      headers: { Prefer: 'return=minimal' },
    });
    return { success: true, message: 'Pendaftaran berhasil.' };
  } catch (e: unknown) {
    return { success: false, message: safeError('Gagal mendaftar.', e) };
  }
}

/** Build the bcrypt PATCH body for a password change. Pure (DB-free).
 * A08 fix: `password_diubah` is a live boolean column — legacy writes `true`
 * (admin UI reads it as "not the 4-digit default anymore"). Writing an ISO
 * timestamp here made the whole PATCH fail against the boolean column, so a
 * candidate could never change their password on Astro. */
export async function buildPasswordPatch(
  storedPass: string,
  lama: string,
  baru: string,
): Promise<{ ok: true; body: { password_kandidat: string; password_diubah: boolean } } | { ok: false; error: string }> {
  // S6 fix: Only use bcrypt comparison — never plaintext.
  const ok = await bcrypt.compare(lama, storedPass || '');
  if (!ok) return { ok: false, error: 'Password lama salah.' };
  const hash = await bcrypt.hash(baru, 10);
  return { ok: true, body: { password_kandidat: hash, password_diubah: true } };
}

export async function changePassword(wa: string, lama: string, baru: string) {
  const cand = await repo.findCandidateForAuth(wa);
  if (!cand) return { success: false, message: 'Kandidat tidak ditemukan.' };
  const built = await buildPasswordPatch(String(cand.password_kandidat || ''), lama, baru);
  if (!built.ok) return { success: false, message: built.error };
  const { supabaseJson } = await import('./repository');
  try {
    await supabaseJson('PATCH', 'database_candidate', {
      query: { no_wa: 'eq.' + wa },
      body: built.body,
      headers: { Prefer: 'return=minimal' },
    });
    return { success: true };
  } catch (e: unknown) {
    return { success: false, message: 'Gagal mengubah password: ' + ((e as Error).message || 'unknown') };
  }
}

// ── Token verification & guards ──────────────────────────────────────────────

export function verifyToken(token: string) {
  return session.verifyToken(token);
}

export function requireRole(sessionToken: string | undefined, role: string) {
  const t = session.verifyToken(sessionToken);
  if (!t || t.role !== role || t.kind === 'refresh') {
    return { error: { success: false, sessionInvalid: true, message: 'Sesi ' + role + ' tidak valid' } };
  }
  return { token: t };
}

export function requireAdmin(sessionToken: string) {
  return requireRole(sessionToken, 'admin');
}

export function isOwnerOrAdmin(sessionToken: string | undefined, wa: string) {
  const t = session.verifyToken(sessionToken);
  if (!t || t.kind === 'refresh') return false;
  if (t.role === 'admin') return true;
  if (t.role === 'kandidat' && normalizeWa(t.wa || '') === normalizeWa(wa)) return true;
  return false;
}

/** Register an FCM device token for a WA number (upsert on token).
 * Admins register under their raw handle ('ADMIN'); a kandidat token may only
 * be bound to its own WA. Moved from the legacy _lib/actions-auth dispatcher.
 * Same logic and deps (normalizeWa, session, supabaseJson via repository). */
export async function registerFcmToken(payload: any[], sessionToken?: string): Promise<{ success: boolean; message?: string }> {
  const [waStr, token, deviceInfo] = payload;
  const waRaw = String(waStr || '').trim();
  let wa = normalizeWa(waRaw);

  // S10 fix: pendaftaran FCM WAJIB punya sesi valid — tanpa sesi, perangkat
  // anonim bisa menerima push admin/kandidat & spam tabel fcm_tokens. Tidak
  // ada lagi jalur anonim 'ADMIN'.
  const ident = session.verifyToken(sessionToken);
  if (!ident || ident.kind === 'refresh') {
    return { success: false, message: 'Sesi tidak valid' };
  }

  if (ident.role === 'admin') {
    // Nama admin (mis. 'khoci') dipakai apa adanya, bukan dinormalisasi.
    wa = waRaw || 'ADMIN';
  } else if (ident.role === 'kandidat') {
    if (!wa || normalizeWa(ident.wa || '') !== wa) {
      return { success: false, message: 'Unauthorized FCM registration' };
    }
  } else {
    return { success: false, message: 'Sesi tidak valid' };
  }

  if (!wa || !token) return { success: false, message: 'Invalid data' };

  try {
    // Insert/upsert ke tabel fcm_tokens (jika token sama, update last_used_at)
    const { supabaseJson } = await import('./repository');
    await supabaseJson('POST', 'fcm_tokens', {
      query: { on_conflict: 'token' },
      body: {
        wa: wa,
        token: token,
        device_info: String(deviceInfo || '').substring(0, 200),
        last_used_at: new Date().toISOString(),
      },
    });
    return { success: true };
  } catch (e: unknown) {
    return { success: false, message: (e as Error).message };
  }
}
