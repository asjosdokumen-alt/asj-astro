/**
 * contexts/documents/repository.ts — Database queries for document upload/download
 *
 * Owns: Storage buckets, berkas, pemberkasan_checklist
 */
import { normalizeWa, pick, supabaseJson, supabaseUpsert, toText, hasBackend, supabaseUrl, storageUrl } from '../../_lib/db/client';
import { findFormsByWa, findForms, upsertFormRow } from '../../_lib/db/forms';
import { findCandidateByWaFiltered, findCandidates, findCandidatesByJobFiltered, mapCandidate } from '../../_lib/db/candidates';
import { fetchMasterByWa } from '../../_lib/db/master';
import { nextCandidateId } from '../../_lib/candidate-helpers';

export async function findFormByWa(wa: string): Promise<import("../../_lib/db/row-types").AnyRawRow | null> {
  const want = normalizeWa(wa);
  let rows = await findFormsByWa(wa);
  if (rows === undefined) rows = await findForms();
  return rows.find((r: Record<string, unknown>) => normalizeWa(String(r.no_wa || r.wa || '')) === want) || null;
}

export async function findFormByWaJob(wa: string, code: string): Promise<import("../../_lib/db/row-types").AnyRawRow | null> {
  const want = normalizeWa(wa);
  let rows = await findFormsByWa(wa);
  if (rows === undefined) rows = await findForms();
  return rows.find((r: Record<string, unknown>) =>
    normalizeWa(String(r.no_wa || r.wa || '')) === want &&
    String(r.code_job || '').trim() === String(code || '').trim(),
  ) || null;
}

export async function findCandidateRow(wa: string): Promise<import("../../_lib/db/row-types").AnyRawRow | null> {
  let c = await findCandidateByWaFiltered(wa);
  if (c === undefined) {
    const found = await findCandidates();
    const want = normalizeWa(wa);
    c = found.rows.find((r) => normalizeWa(String(pick(r, ['no_wa', 'wa', 'whatsapp']) || '')) === want) || null;
  }
  return c;
}

export async function findCandidateById(id: string): Promise<import("../../_lib/db/row-types").AnyRawRow | null> {
  const { findCandidateByIdFiltered } = await import('../../_lib/db/candidates');
  let c = await findCandidateByIdFiltered(id);
  if (c === undefined) {
    const found = await findCandidates();
    c = found.rows.find((r) => String(pick(r, ['id_kandidat', 'id']) || '') === id) || null;
  }
  return c;
}

export async function findMasterByWa(wa: string): Promise<import("../../_lib/db/row-types").AnyRawRow | null> {
  const want = normalizeWa(wa);
  const rows = await fetchMasterByWa([want]);
  if (!Array.isArray(rows)) return null;
  return rows.find((r: Record<string, unknown>) => normalizeWa(String(r.no_wa || r.wa || r.whatsapp || '')) === want) || null;
}

export async function findCandidatesByJob(code: string): Promise<import("../../_lib/db/row-types").AnyRawRow[]> {
  let candidates = await findCandidatesByJobFiltered(code);
  if (!candidates || !candidates.length) {
    const all = await findCandidates();
    candidates = (all.rows || []).filter((c) => String(pick(c, ['id_loker_pilihan', 'id_loker']) || '') === code);
  }
  return candidates || [];
}

export async function fetchAllMasters(waList: string[]): Promise<import("../../_lib/db/row-types").AnyRawRow[] | null> {
  return waList.length ? await fetchMasterByWa(waList) : [];
}

export {
  normalizeWa, pick, toText, supabaseJson, supabaseUpsert, hasBackend, supabaseUrl,
  // `storageUrl` is re-exported for the same reason `catalog/repository.ts` does
  // it: a context's SERVICE must not import `_lib/db/client.ts` directly
  // (boundary §5.1), and documents/service.ts needs the storage base to build a
  // signed URL. Measured 2026-10-23: that direct import was the repo's single
  // boundary violation, and it failed two indexer assertions.
  storageUrl,
  findFormsByWa, findForms, upsertFormRow, mapCandidate, nextCandidateId, findCandidates,
};
