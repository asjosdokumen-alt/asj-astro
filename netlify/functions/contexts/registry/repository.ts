/**
 * contexts/registry/repository.ts — Database queries for candidate lifecycle
 *
 * Owns: database_candidate (lifecycle), master_database_candidate (read)
 * All DB access goes through kernel/http → supabaseJson
 */
import { normalizeWa, supabaseJson } from '../../_lib/db/client';
import { clientFor } from '../../_lib/kernel/db';
import { mapCandidate } from '../../_lib/db/candidates';
import { findForms, findFormsByWaList } from '../../_lib/db/forms';
import { attachBerkasBio } from '../../_lib/db/berkas';
import { attachApplications } from '../../_lib/db/candidates';
import { stripRaw, loadCandidatesUnik } from '../catalog';

export async function getCandidatesPage(opts: any): Promise<{ candidates: any[]; total: number }> {
  // Keempat kriteria diteruskan apa adanya: penyaringan terjadi di repository
  // katalog SEBELUM potong-per-halaman, jadi `total` yang dikirim ke layar
  // adalah jumlah yang BENAR-BENAR cocok dengan filter, bukan jumlah seluruh
  // kandidat.
  const { rows: candRows, total } = await loadCandidatesUnik(
    {
      q: opts.q || '',
      gender: opts.gender || 'all',
      age: opts.age || 'all',
      jft: opts.jft || 'all',
    },
    {
      page: opts.page || 1,
      pageSize: opts.pageSize || 50,
    },
  );
  const cands = stripRaw(candRows.map(mapCandidate));
  const waList = cands.map((c) => normalizeWa(String(c.wa || ''))).filter(Boolean);
  let allForms: any;
  await Promise.all([
    attachBerkasBio(cands),
    findFormsByWaList(waList).then((r) => { allForms = r; }),
  ]);
  if (allForms === undefined) allForms = await findForms();
  attachApplications(cands, allForms);
  return { candidates: cands, total };
}

export async function patchCandidate(id: string, body: Record<string, any>, updatedAt?: string, sessionToken?: string): Promise<void> {
  const headers: Record<string, string> = { Prefer: 'return=minimal' };
  if (updatedAt) headers['If-Match'] = '"' + updatedAt + '"';
  const client = clientFor('registry.patchCandidate', sessionToken);
  await supabaseJson('PATCH', 'database_candidate', {
    query: { id: 'eq.' + id },
    body,
    headers,
    overrideKey: client.apikey,
    overrideAuthKey: client.authKey,
  } as any);
}

export { normalizeWa, supabaseJson };
