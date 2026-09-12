/**
 * contexts/ingestion/repository.ts — Database queries for document parsing + upsert
 *
 * Owns: parse results, master_database_candidate upsert
 */
import {
  normalizeWa, normalizeGender, pick, supabaseJson, supabaseUpsert, toText,
} from '../../_lib/db/client';
import { allColumns } from '../../_lib/db/schema.generated';
import { cacheClear } from '../../_lib/cache';

export async function findMasterByWa(wa: string): Promise<import("../../_lib/db/row-types").MasterRawRow | null> {
  const want = normalizeWa(wa);
  const rows = await supabaseJson('GET', 'master_database_candidate', {
    query: { select: allColumns('master_database_candidate'), no_wa: 'eq.' + want, limit: 1 },
  });
  const arr = Array.isArray(rows) ? rows : [];
  return arr.find((r: Record<string, unknown>) => normalizeWa(String(r.no_wa || '')) === want) || null;
}

export async function patchMaster(id: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  return supabaseJson('PATCH', 'master_database_candidate', {
    query: { id: 'eq.' + id },
    body,
    headers: { Prefer: 'return=representation' },
  }) as Promise<Record<string, unknown>>;
}

export async function upsertMaster(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  return supabaseUpsert('master_database_candidate', body, ['no_wa'], {
    headers: { Prefer: 'return=representation' },
  }) as Promise<Record<string, unknown>>;
}

export async function nextCandidateId(): Promise<string> {
  const { nextCandidateId: ncid } = await import('../../_lib/candidate-helpers');
  return ncid();
}

export { normalizeWa, normalizeGender, cacheClear };
