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

export async function checkAdminPersonal(name: string, pin: string) {
  const admin = await repo.findAdminByName(name);
  if (!admin) return { success: false, message: 'Admin tidak ditemukan.' };
  // S6 fix: Only use bcrypt comparison — never plaintext.
  // Plaintext comparison is a timing side-channel and means plaintext credentials exist in DB.
  const pinMatch = await bcrypt.compare(pin, admin.pin);
  if (!pinMatch) return { success: false, message: 'PIN salah.' };
  const token = session.signToken({ role: 'admin', name: admin.name, kind: 'session' });
  return { success: true, token, user: admin.name };
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
    return { success: false, message: 'Gagal mendaftar: ' + ((e as Error).message || 'unknown') };
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
