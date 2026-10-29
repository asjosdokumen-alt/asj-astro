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

/**
 * Token sesi + token penyegar, diterbitkan BERSAMAAN di setiap login.
 *
 * Sampai 2026-10-29 server hanya menerbitkan token sesi, jadi `refreshToken`
 * di klien selalu kosong dan `refreshAdminSession` / `refreshKandidatSession`
 * tidak pernah bisa berhasil — sesi mati keras 24 jam setelah login. Pemilik
 * memilih memperpanjang diam-diam (keputusan A3), jadi yang hilang hanyalah
 * PENERBITANNYA: verifikasi dan penandatanganan ulang sudah ada dan tidak
 * berubah.
 *
 * Masa berlaku berbeda dan itu disengaja: sesi 24 jam, penyegar 7 hari
 * (`_lib/session.ts`). Penyegar TIDAK dirotasi saat dipakai — tanpa penyimpanan
 * status di server, rotasi tanpa deteksi pemakaian ulang hanya menambah jalur
 * gagal tanpa menambah keamanan. Batas 7 hari tetap berlaku.
 */
function issueTokens(role: 'admin' | 'kandidat', ident: { name?: string; wa?: string }) {
  return {
    token: session.signToken({ role, ...ident, kind: 'session' }),
    refreshToken: session.signToken({ role, ...ident, kind: 'refresh' }),
  };
}

// ── Session revocation (migration 026) ──────────────────────────────────────
//
// Tokens carry no server state, so before 2026-10-29 a stolen refresh token was
// valid for its full 7 days with NO kill switch: `logout` returned
// `{success:true}` and did nothing, and a password change left every issued
// token alive. `session_revocations` stores one epoch per SUBJECT and a token is
// refused when `iat < revoked_at`.
//
// The subject is derived from the SIGNED payload only — never from a request
// field — so a caller cannot choose whose session it kills.

/** `admin:<name>` / `kandidat:<wa>` from a verified payload, or null. */
function subjectOf(t: session.SessionPayload): string | null {
  if (t.role === 'admin') {
    const name = String(t.name || '').trim();
    return name ? `admin:${name}` : null;
  }
  if (t.role === 'kandidat') {
    const wa = normalizeWa(t.wa || '');
    return wa ? `kandidat:${wa}` : null;
  }
  return null;
}

/**
 * Is this token older than its subject's revocation epoch?
 *
 * STRICTLY `<`, not `<=`: a user who logs out and signs back in within the same
 * second must keep the NEW token. The price is a sub-second window in which a
 * token minted in the same second as the revocation survives — cheaper than
 * silently killing a fresh login 24 h later.
 *
 * A token with no `iat` reads as 0, i.e. older than any epoch, so tokens minted
 * before this field existed die on the first revocation. Exported because it is
 * the whole rule in one line and deserves its own test.
 */
export function isRevoked(iat: number | undefined, revokedAt: number | null): boolean {
  if (revokedAt === null) return false;
  return Number(iat || 0) < revokedAt;
}

/** Reject a refresh whose subject has been revoked. */
async function revokedRefreshError(t: session.SessionPayload) {
  const subject = subjectOf(t);
  if (!subject) return null;
  const revokedAt = await repo.getSessionRevokedAt(subject);
  if (!isRevoked(t.iat, revokedAt)) return null;
  return {
    success: false as const,
    sessionInvalid: true,
    message: 'Sesi sudah diakhiri. Silakan masuk lagi.',
  };
}

/**
 * End a session server-side.
 *
 * Accepts the refresh token as a fallback because the session token is usually
 * ALREADY expired by the time a client gets round to logging out (24 h vs 7 d);
 * `verifyToken` refuses an expired token, so without the fallback the one
 * credential that still matters would be the one we could not revoke.
 */
export async function revokeSession(sessionToken?: string, refreshToken?: string) {
  const t = session.verifyToken(sessionToken) || session.verifyToken(refreshToken);
  const subject = t ? subjectOf(t) : null;
  if (!subject) return { success: false, message: 'Sesi tidak valid.' };
  const ok = await repo.revokeSessionSubject(subject);
  // Never answer `{success:true}` for a write that did not land — a logout that
  // silently failed is precisely the bug this exists to remove.
  return ok ? { success: true } : { success: false, message: 'Gagal mengakhiri sesi.' };
}

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
  const tokens = issueTokens('admin', { name: 'master' });
  return { success: true, token: tokens.token, refreshToken: tokens.refreshToken };
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
  const key = `PIN_${name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`;
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
      const tokens = issueTokens('admin', { name: wanted });
      return { success: true, token: tokens.token, refreshToken: tokens.refreshToken, user: wanted };
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
        const tokens = issueTokens('admin', { name: who });
        return { success: true, token: tokens.token, refreshToken: tokens.refreshToken, user: who };
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
  if (t?.kind !== 'refresh' || t?.role !== 'admin') {
    return { success: false, message: 'Refresh token tidak valid.' };
  }
  const revoked = await revokedRefreshError(t);
  if (revoked) return revoked;
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
  const tokens = issueTokens('kandidat', { wa: cand.no_wa });
  return { success: true, token: tokens.token, refreshToken: tokens.refreshToken, user: 'kandidat', wa: cand.no_wa, name: cand.nama_lengkap };
}

export async function refreshKandidatSession(refreshToken: string) {
  const t = session.verifyToken(refreshToken);
  if (t?.kind !== 'refresh' || t?.role !== 'kandidat') {
    return { success: false, message: 'Refresh token tidak valid.' };
  }
  const revoked = await revokedRefreshError(t);
  if (revoked) return revoked;
  const newToken = session.signToken({ role: 'kandidat', wa: t.wa, kind: 'session' });
  return { success: true, sessionToken: newToken, wa: t.wa };
}

export async function registerKandidat(nama: string, wa: string, password?: string, _usia?: number) {
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
      query: { no_wa: `eq.${wa}` },
      body: built.body,
      headers: { Prefer: 'return=minimal' },
    });
    // A password change MUST kill the tokens issued under the old password —
    // otherwise a stolen refresh token survives the one action a victim takes.
    // Best-effort by design: the password IS changed, so a failed bump must not
    // turn a successful change into an error the user cannot fix by retrying.
    // (The reader fails open, so a missing migration does not break login.)
    await repo.revokeSessionSubject(`kandidat:${normalizeWa(wa)}`);
    return { success: true };
  } catch (e: unknown) {
    return {
      success: false,
      message: `Gagal mengubah password: ${(e as Error).message || 'unknown'}`,
    };
  }
}

// ── Token verification & guards ──────────────────────────────────────────────

export function verifyToken(token: string) {
  return session.verifyToken(token);
}

export function requireRole(sessionToken: string | undefined, role: string) {
  const t = session.verifyToken(sessionToken);
  if (!t || t.role !== role || t.kind === 'refresh') {
    return { error: { success: false, sessionInvalid: true, message: `Sesi ${role} tidak valid` } };
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
export async function registerFcmToken(
  payload: unknown[],
  sessionToken?: string,
): Promise<{ success: boolean; message?: string }> {
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
    // UPSERT, bukan INSERT. `on_conflict` saja TIDAK cukup: PostgREST baru
    // memperlakukan POST sebagai upsert kalau header `Prefer:
    // resolution=merge-duplicates` ikut dikirim. Tanpa header itu ini INSERT
    // biasa, dan login kedua di perangkat yang sama dijawab
    // `409 {"code":"23505","message":"duplicate key value violates unique
    // constraint"}` — toast merah yang dilihat pemilik 2026-10-25.
    const { supabaseJson } = await import('./repository');
    await supabaseJson('POST', 'fcm_tokens', {
      query: { on_conflict: 'token' },
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: {
        wa: wa,
        token: token,
        device_info: String(deviceInfo || '').substring(0, 200),
        last_used_at: new Date().toISOString(),
      },
    });

    // Bersihkan token LAMA milik identitas yang sama yang sudah mati.
    //
    // KENAPA: token FCM web bersifat PER-REGISTRASI, bukan per-perangkat.
    // Setiap kali `getToken()` dipanggil — dan klien memanggilnya di SETIAP
    // login (`authReactive.ts`) — Firebase bisa menerbitkan token baru dan
    // token lama langsung mati. Karena tabel di-upsert berdasarkan `token`,
    // tiap token baru menambah BARIS BARU, dan token mati tidak pernah dibuang.
    // Terukur 2026-10-13: 25 baris admin (satu nama, KHOCI) dengan hanya 5
    // hidup. Logout TIDAK menghapus token (memenuhi permintaan pemilik), jadi
    // pembersihannya harus di sini.
    //
    // Cara aman: probe token lain milik identitas ini, hapus HANYA yang
    // dijawab NOT_FOUND oleh FCM. Token yang masih hidup DIBIARKAN, sehingga
    // beberapa perangkat tetap bisa menerima push sekaligus.
    try {
      const siblings = await supabaseJson('GET', 'fcm_tokens', {
        query: { select: 'token', wa: `eq.${wa}`, limit: 50 },
      });
      const stale = (Array.isArray(siblings) ? siblings : [])
        .map((r: Record<string, unknown>) => r.token)
        .filter((t): t is string => Boolean(t) && t !== token);
      if (stale.length > 0) {
        const { pruneDeadTokens } = await import('../../_lib/fcm-helpers');
        await pruneDeadTokens(stale);
      }
    } catch {
      /* pembersihan bersifat best-effort — pendaftaran sudah berhasil */
    }

    return { success: true };
  } catch (e: unknown) {
    return { success: false, message: (e as Error).message };
  }
}
