/**
 * kernel/db.ts — Least-privilege database client selection
 *
 * WHY THIS EXISTS
 * ---------------
 * Currently, all ~74 actions use the service-role key (CODE_REVIEW.md D6),
 * which bypasses Row Level Security. Every bug becomes a full-DB bug.
 * This module selects the appropriate client per request:
 *
 *   - anonClient()     — public read-only (catalog, share view)
 *   - userClient(token) — default for candidate-scoped reads/writes (RLS applies)
 *   - serviceClient()   — allow-listed operations only, each logged
 *
 * USAGE
 * -----
 *   import { clientFor } from '../kernel/db';
 *   const client = clientFor('registry.getCandidatesPage', sessionToken);
 *   // Use client as the Authorization header
 *
 * The allowlist in SERVICE_ROLE_ALLOWLIST contains only operations that
 * genuinely need cross-table access or Storage signing.
 */

import crypto from 'crypto';
import { env } from '../env';
import { log } from './log';
import { verifyToken } from '../session';

// ── Configuration ───────────────────────────────────────────────────────────

function supabaseUrl(): string {
  return env('SUPABASE_URL');
}

/** Operations that genuinely require service-role (cross-table, Storage, etc.) */
const SERVICE_ROLE_ALLOWLIST = new Set([
  'registry.nextCandidateId',   // needs cross-table MAX (now a sequence)
  'documents.signUpload',       // Storage signing
  'documents.signDownload',     // Storage signing
  'configuration.migrate',      // Schema changes
  'registry.patchCandidate',     // Admin catatan/field updates
  'ingestion.parseDocument',    // Cross-table writes
  'scheduling.dueReminders',    // Cross-table reads
]);

// ── Supabase JWT creation ───────────────────────────────────────────────────
// PostgRLS evaluates RLS policies using the JWT's claims. Our session tokens
// are custom HMAC tokens, not Supabase JWTs. This helper creates a
// Supabase-compatible JWT from session claims so RLS can evaluate `wa`.

function createSupabaseJwt(claims: { role: string; wa?: string; name?: string }): string {
  const secret = env('SUPABASE_JWT_SECRET');
  if (!secret) {
    // B9 fix: Log at error level so this is visible in production.
    // Without this, every RLS query silently returns zero rows — the UI
    // appears to work but shows no data, with no error message.
    log.error('supabase_jwt.no_secret', {
      op: claims.role,
      impact: 'RLS queries will return zero rows. Set SUPABASE_JWT_SECRET.',
    });
    return '';
  }

  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    ...claims,
    role: claims.role || 'authenticated',
    iat: now,
    exp: now + 3600, // 1 hour expiry
  })).toString('base64url');

  const signature = crypto.createHmac('sha256', secret)
    .update(header + '.' + payload)
    .digest('base64url');

  return header + '.' + payload + '.' + signature;
}

// ── Client factories ────────────────────────────────────────────────────────

/**
 * Peran Postgres yang SAH untuk sebuah sesi.
 *
 * Token sesi memakai `role: 'admin' | 'kandidat'` (lihat _lib/session.ts dan
 * contexts/identity/service.ts:59,135,150,173,188,197) — keduanya BUKAN role
 * Postgres. PostgREST menolak peran yang tidak dikenal dengan
 * `401 22023 role "X" does not exist` SEBELUM RLS sempat dievaluasi, jadi
 * setiap tulis yang lewat `userClient()` mati selama pemetaan ini tidak ada.
 * Terukur 2026-10-12 terhadap gdw DAN bimq:
 *
 *   role=admin        -> 401 {"code":"22023","message":"role \"admin\" does not exist"}
 *   role=kandidat     -> 401 22023
 *   role=service_role -> 204
 *   role=authenticated-> 403 42501 (tanpa GRANT — efek migrasi 012)
 *
 *   admin   -> service_role   Admin butuh akses lintas-baris. Token sesi admin
 *                             TIDAK membawa claim `wa`, sehingga policy
 *                             `*_own_wa` (`no_wa = jwt.claims->>'wa'`) akan
 *                             mencocokkan 0 baris dan UPDATE-nya menjawab 204
 *                             tanpa mengubah apa pun — kegagalan yang LEBIH
 *                             senyap daripada error. Migrasi 007 menyatakan
 *                             hal yang sama: "For admin/service-role requests,
 *                             RLS is bypassed ... admins need cross-user
 *                             access".
 *   lainnya -> authenticated  RLS berlaku; policy `*_own_wa` membatasi ke baris
 *                             milik `wa` di token. Inilah yang menjaga kandidat
 *                             tetap hanya bisa menyentuh barisnya sendiri.
 *
 * Fail-closed: peran yang tidak dikenal TIDAK pernah diteruskan apa adanya.
 */
function pgRoleFor(sessionRole?: string): string {
  return sessionRole === 'admin' ? 'service_role' : 'authenticated';
}

/**
 * Client info with separate apikey (project identification) and
 * authKey (RLS evaluation via JWT). For anon/service, both are the same key.
 * For user client, apikey = anon key, authKey = Supabase JWT with wa claim.
 */
export interface ClientInfo {
  url: string;
  /** The apikey header — identifies the Supabase project. */
  apikey: string;
  /** The Authorization header value (without 'Bearer ' prefix). */
  authKey: string;
  label: string;
}

/**
 * Anonymous client — public read-only access (anon key, RLS applies).
 * Used for: catalog, share view, public endpoints.
 */
export function anonClient(): ClientInfo {
  const key = env('SUPABASE_ANON_KEY') || env('SUPABASE_KEY');
  return {
    url: supabaseUrl(),
    apikey: key,
    authKey: key,
    label: 'anon',
  };
}

/**
 * User client — authenticated access with Supabase JWT (RLS applies).
 * apikey = anon key (project identification)
 * authKey = Supabase JWT with wa claim (RLS policy evaluation)
 */
export function userClient(sessionToken?: string): ClientInfo {
  const anonKey = env('SUPABASE_ANON_KEY') || env('SUPABASE_KEY');

  if (!sessionToken) {
    // No session — fall back to anon (public read)
    return { url: supabaseUrl(), apikey: anonKey, authKey: anonKey, label: 'anon' };
  }

  // B8 fix: VERIFY the HMAC signature before trusting any claims.
  // The old code decoded parts[0] without checking parts[1], allowing
  // an attacker to craft arbitrary tokens with any role/wa claim.
  const verified = verifyToken(sessionToken);
  if (!verified) {
    log.warn('db.userClient.invalid_token', {});
    return { url: supabaseUrl(), apikey: anonKey, authKey: anonKey, label: 'anon' };
  }

  // Token is cryptographically verified — safe to extract claims.
  try {
    const supabaseJwt = createSupabaseJwt({
      role: pgRoleFor(verified.role),
      wa: verified.wa,
      name: verified.name,
    });
    if (supabaseJwt) {
      return { url: supabaseUrl(), apikey: anonKey, authKey: supabaseJwt, label: 'user' };
    }
  } catch {
    // JWT creation failed — fall back to anon
  }

  return { url: supabaseUrl(), apikey: anonKey, authKey: anonKey, label: 'anon' };
}

/**
 * Service-role client — bypasses RLS. Only for allow-listed operations.
 * Each use is logged with the operation name for audit.
 */
export function serviceClient(op: string): ClientInfo {
  const key = env('SUPABASE_SERVICE_ROLE_KEY') || env('SUPABASE_KEY');
  log.debug('service_role.used', { op });
  return {
    url: supabaseUrl(),
    apikey: key,
    authKey: key,
    label: 'service',
  };
}

/**
 * Select the appropriate client for an operation.
 *
 *   const { url, apikey, authKey } = clientFor('registry.getCandidatesPage', sessionToken);
 *   // Use: headers: { apikey, Authorization: `Bearer ${authKey}` }
 */
export function clientFor(
  op: string,
  sessionToken?: string,
): ClientInfo {
  if (SERVICE_ROLE_ALLOWLIST.has(op)) {
    return serviceClient(op);
  }
  if (sessionToken) {
    return userClient(sessionToken);
  }
  return anonClient();
}

/**
 * Check if an operation requires service-role.
 * Useful for auditing and testing.
 */
export function requiresServiceRole(op: string): boolean {
  return SERVICE_ROLE_ALLOWLIST.has(op);
}
