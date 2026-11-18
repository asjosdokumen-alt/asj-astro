/**
 * Central session gate — H-3.
 *
 * `requireRole` / `isOwnerOrAdmin` live in contexts/identity and are called
 * from ~67 places. Making them async (and awaiting all 67) is a large, easy
 * to get half-wrong change. This module enforces the SAME rule once, at the
 * single dispatch point every action passes through, without importing
 * identity/service into handlers.ts — that import would pull bcryptjs into
 * every Netlify entry point (the reason handlers.ts keeps its resolver
 * injected).
 *
 * Rule: a token is refused when `iat < revoked_at` for its subject. A refresh
 * token is never a session token. If the revocation table cannot be read, the
 * answer is "cannot prove" and the request is refused for authenticated
 * actions — fail closed, unlike the refresh helper's older fail-open path.
 *
 * The short in-process cache is a cost control, not a security boundary:
 * Neon is billed per compute time and a dashboard tab fires many actions in
 * parallel. 15 s bounds a logout's stale window while reducing reads to one
 * per subject per quarter-minute. An in-flight map coalesces the initial
 * parallel burst. A failed read invalidates the entry so a stale "not
 * revoked" answer can never survive a DB blip.
 */
import * as session from './session';
import { supabaseJson } from './db/client';
import { normalizeWa } from '../shared/wa-rules';

const CACHE_MS = 15_000;

type Epoch = number | null;
const epochs = new Map<string, { at: number; value: Epoch }>();
const inflight = new Map<string, Promise<Epoch>>();

/** Subject from the SIGNED payload only — a request field cannot choose it. */
export function sessionGateSubject(token: string): string | null {
  const t = session.verifyToken(token);
  if (!t) return null;
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

/** Mirrors identity/service.ts `isRevoked`; kept local to avoid its bcrypt import. */
export function sessionGateIsRevoked(iat: number | undefined, revokedAt: Epoch): boolean {
  if (revokedAt === null) return false;
  return Number(iat || 0) < revokedAt;
}

/** `undefined` = the table could not be read; never treated as "no revocation". */
export async function sessionGateEpoch(subject: string): Promise<Epoch | undefined> {
  const hit = epochs.get(subject);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const running = inflight.get(subject);
  if (running) return running;

  const task = (async (): Promise<Epoch | undefined> => {
    try {
      const rows = await supabaseJson('GET', 'session_revocations', {
        query: { select: 'revoked_at', subject: `eq.${subject}`, limit: '1' },
      });
      if (!Array.isArray(rows) || rows.length === 0) return null;
      const ms = Date.parse(String((rows[0] as { revoked_at?: string }).revoked_at || ''));
      if (!Number.isFinite(ms)) return undefined;
      return Math.floor(ms / 1000);
    } catch {
      return undefined;
    }
  })();

  inflight.set(subject, task as Promise<Epoch>);
  try {
    const value = await task;
    if (value === undefined) {
      epochs.delete(subject);
    } else {
      epochs.set(subject, { at: Date.now(), value });
    }
    return value;
  } finally {
    inflight.delete(subject);
  }
}

/** Only tests call this — a cache that cannot be cleared is untestable. */
export function clearSessionGateCache(): void {
  epochs.clear();
  inflight.clear();
}

/**
 * Called by the revocation WRITE path after a successful upsert. Without it a
 * just-logged-out subject could keep riding a cached "not revoked" answer for
 * up to CACHE_MS on the same instance. Other instances still expire naturally.
 */
export function invalidateSessionGateSubject(subject: string): void {
  epochs.delete(subject);
}

/**
 * Actions that must NOT be gated by an existing session:
 *  - login/PIN checks and refreshes (they own their own revocation path, and a
 *    stale token must not lock a user out of re-authenticating);
 *  - `logout` (a revoked user still has to be able to finish logging out);
 *  - the password change that is the recovery action itself.
 * Public actions carry no session, so they fall through the `!token` branch.
 */
const GATE_SKIP = new Set([
  'checkAdminMaster', 'checkAdminPersonal', 'refreshAdminSession',
  'refreshKandidatSession', 'loginKandidat', 'daftarKandidat',
  'logout', 'gantiPasswordKandidat', 'ping',
]);

export type GateResult = { ok: true } | { ok: false; error: string; sessionInvalid: true };

export async function checkSessionGate(action: string, sessionToken: string): Promise<GateResult> {
  if (!sessionToken || GATE_SKIP.has(action)) return { ok: true };
  const t = session.verifyToken(sessionToken);
  // An invalid signature/expiry is the downstream guards' decision; this gate
  // only adds revocation and token-kind checks on top of a VERIFIED payload.
  if (!t) return { ok: true };
  if (t.kind === 'refresh') {
    return { ok: false, sessionInvalid: true, error: 'Sesi tidak valid. Silakan masuk lagi.' };
  }
  const subject = sessionGateSubject(sessionToken);
  if (!subject) return { ok: true };

  const revokedAt = await sessionGateEpoch(subject);
  if (revokedAt === undefined) {
    return {
      ok: false,
      sessionInvalid: true,
      error: 'Sesi tidak dapat diverifikasi. Silakan masuk lagi.',
    };
  }
  if (sessionGateIsRevoked(t.iat, revokedAt)) {
    return {
      ok: false,
      sessionInvalid: true,
      error: 'Sesi sudah diakhiri. Silakan masuk lagi.',
    };
  }
  return { ok: true };
}
