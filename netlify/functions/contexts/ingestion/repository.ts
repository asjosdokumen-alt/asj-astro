/**
 * contexts/ingestion/repository.ts — Database queries for document parsing + upsert
 *
 * Owns: parse results, master_database_candidate upsert
 */
import {
  normalizeWa, normalizeGender, supabaseJson, supabaseUpsert,
} from '../../_lib/db/client';
import { allColumns } from '../../_lib/db/schema.generated';
import { cacheClear } from '../../_lib/cache';
import { syncPekerjaan } from '../../_lib/db/pekerjaan';

export async function findMasterByWa(wa: string): Promise<import("../../_lib/db/row-types").MasterRawRow | null> {
  const want = normalizeWa(wa);
  const rows = await supabaseJson('GET', 'master_database_candidate', {
    query: { select: allColumns('master_database_candidate'), no_wa: 'eq.' + want, limit: 1 },
  });
  const arr = Array.isArray(rows) ? rows : [];
  return arr.find((r: Record<string, unknown>) => normalizeWa(String(r.no_wa || '')) === want) || null;
}

/**
 * Sinkronkan `candidate_pekerjaan` dari body ini.
 *
 * Ingestion hanya mengisi `pekerjaan_1_nama_perusahaan` dari SATU string hasil
 * parsing CV — bukan daftar riwayat. `syncPekerjaan` menolak MENYUSUTKAN daftar
 * tanpa daftar eksplisit, jadi jalur ini tidak bisa menghapus pekerjaan yang
 * sudah ada; ia hanya menambah saat kandidat belum punya baris sama sekali.
 */
async function sinkronPekerjaan(idKandidat: string, body: Record<string, unknown>): Promise<void> {
  if (!idKandidat) return;
  await syncPekerjaan(idKandidat, body, false);
}

async function idKandidatDari(id: string, body: Record<string, unknown>): Promise<string> {
  const dariBody = String(body.id_kandidat ?? '').trim();
  if (dariBody) return dariBody;
  const rows = await supabaseJson('GET', 'master_database_candidate', {
    query: { select: 'id_kandidat', id: `eq.${id}`, limit: '1' },
  });
  const row = Array.isArray(rows) ? rows[0] : null;
  return String((row as Record<string, unknown> | null)?.id_kandidat ?? '').trim();
}

export async function patchMaster(id: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const hasil = (await supabaseJson('PATCH', 'master_database_candidate', {
    query: { id: 'eq.' + id },
    body,
    headers: { Prefer: 'return=representation' },
  })) as Record<string, unknown>;
  await sinkronPekerjaan(await idKandidatDari(id, body), body);
  return hasil;
}

export async function upsertMaster(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const hasil = (await supabaseUpsert('master_database_candidate', body, ['no_wa'], {
    headers: { Prefer: 'return=representation' },
  })) as Record<string, unknown>;
  const idKandidat = String(body.id_kandidat ?? (hasil as { id_kandidat?: string })?.id_kandidat ?? '').trim();
  await sinkronPekerjaan(idKandidat, body);
  return hasil;
}

export async function nextCandidateId(): Promise<string> {
  const { nextCandidateId: ncid } = await import('../../_lib/candidate-helpers');
  return ncid();
}

export { normalizeWa, normalizeGender, cacheClear };
