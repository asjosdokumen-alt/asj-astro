/**
 * contexts/master-data/repository.ts — Database queries for master_database_candidate
 *
 * Owns: master_database_candidate
 */
import { normalizeWa, pick, supabaseJson, supabaseUpsert, toText, APPLY_WA_COLS } from '../../_lib/db/client';
import { allColumns } from '../../_lib/db/schema.generated';
import { findCandidateByWaFiltered, findCandidates } from '../../_lib/db/candidates';
import { fetchMasterByWa } from '../../_lib/db/master';
import { nextCandidateId } from '../../_lib/candidate-helpers';

export async function findMasterByWa(wa: string): Promise<any | null> {
  const want = normalizeWa(wa);
  let rows = await fetchMasterByWa([want]);
  if (rows === null) {
    rows = await supabaseJson('GET', 'master_database_candidate', {
      query: { select: allColumns('master_database_candidate'), limit: 500 },
    });
  }
  const arr = Array.isArray(rows) ? rows : [];
  return arr.find((r) => normalizeWa(String(r.no_wa || '')) === want) || null;
}

export async function patchMaster(id: string, body: Record<string, any>): Promise<void> {
  await supabaseJson('PATCH', 'master_database_candidate', {
    query: { id: 'eq.' + id },
    body,
    headers: { Prefer: 'return=minimal' },
  });
}

export async function upsertMaster(body: Record<string, any>): Promise<void> {
  await supabaseUpsert('master_database_candidate', body, ['no_wa'], {
    headers: { Prefer: 'return=minimal' },
  });
}

export async function findCandidateRow(wa: string): Promise<any | null> {
  let c = await findCandidateByWaFiltered(wa);
  if (c === undefined) {
    const found = await findCandidates();
    const want = normalizeWa(wa);
    c = found.rows.find((r) => normalizeWa(String(pick(r, ['no_wa', 'wa', 'whatsapp', 'telepon', 'phone', 'no_hp']) || '')) === want) || null;
  }
  return c;
}

export { normalizeWa, pick, toText, supabaseJson, supabaseUpsert, nextCandidateId, APPLY_WA_COLS };
