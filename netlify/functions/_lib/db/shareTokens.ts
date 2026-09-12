/**
 * _lib/db/shareTokens.ts — Per-job share-view tokens (sys_config KV)
 *
 * B06 (2026-09-05): the TSK share viewer (share.html?job=CODE in legacy) was
 * open by job code alone — anyone who guessed/enumerated a code could read a
 * whole job's candidate dossiers. Per LEGACY_PARITY_REFERENCE §5 P1 the view
 * is now gated behind a per-job token (docs/PARITY_CHECKLIST.md B06):
 *   - stored in sys_config rows: config_type='share_token',
 *     config_key=<JOB CODE> (upper), config_value=<random 32-hex token>;
 *   - LAZY MINT + STABLE: ensureShareTokenForJob() mints once and returns the
 *     same token forever after (rotating on every doc-config save would kill
 *     links already shared with the TSK); no rotate control yet;
 *   - handleShareData rejects requests without the matching ?tk= value.
 *
 * sys_config is the KV table already owned by contexts/configuration; config
 * rows use config_type/config_key/config_value (row-types SysConfigRawRow).
 */
import { randomBytes } from 'node:crypto';
import { supabaseJson } from './client';
import { SYS_CONFIG_COLS } from './projections';

const CONFIG_TYPE = 'share_token';

const normCode = (code: unknown): string => String(code || '').trim().toUpperCase();

export async function getShareTokenForJob(code: string): Promise<string | null> {
  const key = normCode(code);
  if (!key) return null;
  try {
    const rows = await supabaseJson('GET', 'sys_config', {
      query: { select: SYS_CONFIG_COLS, config_type: 'eq.' + CONFIG_TYPE, limit: 500 },
    });
    if (!Array.isArray(rows)) return null;
    const hit = rows.find(
      (r) => String(r?.config_key || '').toUpperCase() === key && r?.config_value,
    );
    return hit ? String(hit.config_value) : null;
  } catch {
    // Non-fatal: caller decides how to treat a missing backend.
    return null;
  }
}

/** Mint-once + stable. Returns the (existing or new) token for a job code. */
export async function ensureShareTokenForJob(code: string): Promise<string | null> {
  const key = normCode(code);
  if (!key) return null;
  const existing = await getShareTokenForJob(key);
  if (existing) return existing;
  const token = randomBytes(16).toString('hex');
  try {
    await supabaseJson('POST', 'sys_config', {
      body: {
        config_type: CONFIG_TYPE,
        config_key: key,
        config_value: token,
        is_active: true,
        created_at: new Date().toISOString(),
      },
      headers: { Prefer: 'return=minimal' },
    });
    return token;
  } catch {
    return null;
  }
}
