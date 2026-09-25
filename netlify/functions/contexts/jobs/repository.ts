/**
 * contexts/jobs/repository.ts — Database queries for job_database CRUD
 *
 * Owns: job_database
 */
import { hasBackend, normalizeWa, pick, supabaseJson, toText } from '../../_lib/db/client';
import { clientFor } from '../../_lib/kernel/db';
import { findForms, findFormsByWa, mapForm } from '../../_lib/db/forms';
import { findCandidates, mapCandidate } from '../../_lib/db/candidates';
import { attachBerkasBio } from '../../_lib/db/berkas';
import { findCandidateByWa } from '../../_lib/candidate-helpers';
import { cacheClear } from '../../_lib/cache';
import { stripRaw } from '../catalog';
import {
  countCandidatesForJob, findJobByCodeFiltered, findJobs, mapJob, maxJobCodeNumber,
} from '../../_lib/db/jobs';

const JOB_COLUMNS: Record<string, string> = {
  tsk: 'tsk', kategori: 'kategori', pekerjaan: 'pekerjaan', lokasi: 'lokasi',
  gender: 'gender', templateCv: 'format_cv', status: 'status', kuota: 'kuota',
  jmlKandidat: 'jumlah_kandidat', syarat: 'syarat', keterangan: 'keterangan',
  pamflet: 'link_pamflet', tahapanDB: 'tahapan', totalBiaya: 'total_biaya',
  rincianBiaya: 'rincian_biaya', dokumenShare: 'dokumen_share',
};

export function mapJobPayloadToRow(data: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const [from, to] of Object.entries(JOB_COLUMNS)) {
    if (data[from] !== undefined && data[from] !== null) row[to] = data[from];
  }
  return row;
}

// Kode job berikutnya untuk satu KATEGORI.
//
// Tokutei Ginou → `TG<N>ASJ`, Magang → `GJ<N>ASJ` (keputusan owner). Nomor N =
// nilai TERBESAR yang sudah ada UNTUK PREFIX ITU + 1, dihitung NUMERIK dan
// per-prefix (lihat maxJobCodeNumber — `desc` string pernah melewatkan TG100
// karena 'TG99ASJ' > 'TG100ASJ', dan scan lintas-prefix bisa mencampur TG/GJ).
//
// Pelajaran: kolom kategori tabel job_database adalah **`kategori`** (bukan
// `kategory` — itu milik database_asj_form). Jangan tertukar.
export const JOB_CODE_PREFIX = { magang: 'GJ', default: 'TG' } as const;

/** Turunkan prefix kode dari kategori job. Magang → GJ, selainnya → TG. */
export function jobCodePrefix(kategori: unknown): string {
  const k = String(kategori || '').trim().toLowerCase();
  return k === 'magang' ? JOB_CODE_PREFIX.magang : JOB_CODE_PREFIX.default;
}

export async function nextJobCode(kategori?: unknown): Promise<string> {
  const prefix = jobCodePrefix(kategori);
  const fast = await maxJobCodeNumber(prefix);
  if (fast && fast.found) return `${prefix}${fast.max + 1}ASJ`;
  // Fallback: kolom/tabel tak dikenal pada query bertarget → scan penuh, di
  // sini pun filter per-prefix + numerik (bukan string-order) supaya hasilnya
  // sama dengan jalur cepat.
  const found = await findJobs();
  const codeRe = new RegExp(`^${prefix}(\\d+)ASJ$`);
  let max = 0;
  for (const row of found.rows) {
    const m = String(row.code_job || row.code || '').match(codeRe);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}${max + 1}ASJ`;
}

export async function getJobMapped(code: string): Promise<import("../../_lib/db/row-types").JobRawRow | null> {
  let row: import("../../_lib/db/row-types").JobRawRow | undefined | null = await findJobByCodeFiltered(code);
  if (row === undefined) {
    const found = await findJobs();
    row = (found.rows || []).find((r) => String(r.code_job || r.code || '') === String(code)) || null;
  }
  if (!row) return null;
  return stripRaw([mapJob(row)])[0] || null;
}

export async function patchJob(code: string, body: Record<string, unknown>, updatedAt?: string, sessionToken?: string): Promise<void> {
  const headers: Record<string, string> = { Prefer: 'return=minimal' };
  if (updatedAt) headers['If-Match'] = '"' + updatedAt + '"';
  const client = clientFor('jobs.patchJob', sessionToken);
  await supabaseJson('PATCH', 'job_database', {
    query: { code_job: 'eq.' + code },
    body,
    headers,
    overrideKey: client.apikey,
    overrideAuthKey: client.authKey,
  } as Record<string, unknown>);
}

export async function deleteJob(code: string): Promise<void> {
  await supabaseJson('DELETE', 'job_database', {
    query: { code_job: 'eq.' + code },
    headers: { Prefer: 'return=minimal' },
  });
}

export async function postJob(body: Record<string, unknown>): Promise<void> {
  await supabaseJson('POST', 'job_database', {
    body,
    headers: { Prefer: 'return=minimal' },
  });
}

export { hasBackend, normalizeWa, pick, toText, mapCandidate, stripRaw,
  findCandidateByWa, cacheClear, findFormsByWa, findForms, mapForm,
  attachBerkasBio, countCandidatesForJob, findCandidates, supabaseJson };
