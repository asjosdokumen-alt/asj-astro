/**
 * contexts/identity/repository.ts — DB queries for auth
 *
 * Owns: admin_credentials, session-related queries
 * Interface: findAdmins(), findCandidateForAuth(), findCandidateForRefresh()
 *
 * These are the ONLY files that may query auth-related tables.
 */

import { supabaseJson, normalizeWa, pick } from '../../_lib/db/client';
import { CAND_AUTH_COLS } from '../../_lib/db/projections';
import { env } from '../../_lib/env';

// ── Admin credentials ────────────────────────────────────────────────────────
//
// NOTE (Phase D, 2026-09-12): `admin_credentials` is NOT exposed by PostgREST —
// it is absent from the live schema (25 tables, and this is not one of them).
// Every read below therefore answers 404 and is swallowed by the catch, so both
// helpers return null/[] unconditionally. The projection is spelled out rather
// than wildcarded because a wildcard against a table that does not exist is
// still a wildcard; the dead path is recorded in docs/PHASE_D_DATA_LAYER.md
// rather than silently deleted, since removing it changes auth behaviour.
const ADMIN_CREDENTIAL_COLS = 'name,pin,role';

export interface AdminCredential {
  name: string;
  pin: string;
  role?: string;
}

/**
 * Find admin by name. Returns credential row or null.
 */
export async function findAdminByName(name: string): Promise<AdminCredential | null> {
  try {
    const rows = await supabaseJson('GET', 'admin_credentials', {
      query: { select: ADMIN_CREDENTIAL_COLS, name: 'eq.' + name, limit: '1' },
    });
    if (Array.isArray(rows) && rows.length > 0) return rows[0] as AdminCredential;
    return null;
  } catch {
    return null;
  }
}

/**
 * Get all admin credentials (for PIN verification).
 */
export async function findAdmins(): Promise<AdminCredential[]> {
  try {
    const rows = await supabaseJson('GET', 'admin_credentials', {
      query: { select: ADMIN_CREDENTIAL_COLS, limit: '50' },
    });
    return Array.isArray(rows) ? (rows as AdminCredential[]) : [];
  } catch {
    return [];
  }
}

// ── Candidate auth queries ───────────────────────────────────────────────────

export interface CandidateAuth {
  id: string | number;
  no_wa: string;
  nama_lengkap: string;
  password_kandidat: string;
  [key: string]: unknown;
}

const CAND_WA_COLS = ['no_wa'] as const;

/**
 * Find candidate by WA for login (needs password check).
 */
export async function findCandidateForAuth(wa: string): Promise<CandidateAuth | null> {
  const cols = CAND_WA_COLS;
  for (const col of cols) {
    try {
      const rows = await supabaseJson('GET', 'database_candidate', {
        query: { select: CAND_AUTH_COLS, limit: '1', [col]: 'eq.' + wa },
      });
      if (Array.isArray(rows) && rows.length > 0) return rows[0] as CandidateAuth;
    } catch {
      // column doesn't exist, try next
    }
  }
  return null;
}

/**
 * Find candidate by WA for token refresh (lighter query).
 */
export async function findCandidateForRefresh(wa: string): Promise<CandidateAuth | null> {
  try {
    const rows = await supabaseJson('GET', 'database_candidate', {
      query: { select: 'id,no_wa,nama_lengkap,password_kandidat', limit: '1', no_wa: 'eq.' + wa },
    });
    if (Array.isArray(rows) && rows.length > 0) return rows[0] as CandidateAuth;
    return null;
  } catch {
    return null;
  }
}

export { supabaseJson };
