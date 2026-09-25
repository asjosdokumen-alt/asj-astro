/**
 * contexts/jobs/service.ts — Business logic for job_database CRUD
 */
import { requireAdmin } from '../identity';
import { safeError } from '../../_lib/kernel/errors';
import { guardPayload, text, optionalText, optionalTextOrEmpty, requireAtLeastOne } from '../../_lib/kernel/guard';
import {
  hasBackend, mapJobPayloadToRow, nextJobCode, getJobMapped,
  patchJob, deleteJob, postJob, normalizeWa, pick, toText, mapCandidate, stripRaw,
  findCandidateByWa, cacheClear, findFormsByWa, findForms, mapForm,
  attachBerkasBio, countCandidatesForJob, findCandidates, supabaseJson,
} from './repository';

export async function handleSimpanJobBaru(payload: unknown[], sessionToken?: string) {
  const guard = requireAdmin(sessionToken || '');
  if (guard.error) return guard.error;
  const data = ((payload && payload[0]) || {}) as Record<string, any>;
  if (!data.pekerjaan) return { success: false, error: 'Nama pekerjaan wajib diisi.' };
  if (!hasBackend()) return { success: false, error: 'Backend belum dikonfigurasi.' };
  try {
    // Prefix kode mengikuti KATEGORI job (Magang → GJ, selainnya → TG).
    // `data.kategori` adalah nilai dari <select> list_kategori, bukan enum.
    const code = await nextJobCode(data.kategori);
    await postJob({ code_job: code, ...mapJobPayloadToRow(data) });
    return { success: true, code };
  } catch (e: unknown) {
    return { success: false, error: safeError('Gagal simpan loker.', e) };
  }
}

export async function handleEditLokerFull(payload: unknown[], sessionToken?: string) {
  const guard = requireAdmin(sessionToken || '');
  if (guard.error) return guard.error;
  const data = ((payload && payload[0]) || {}) as Record<string, any>;
  if (!data.code) return { success: false, error: 'Kode loker tidak ditemukan.' };
  if (!hasBackend()) return { success: false, error: 'Backend belum dikonfigurasi.' };
  try {
    const body = mapJobPayloadToRow(data);
    for (const k of Object.keys(body)) {
      if (k !== 'dokumen_share' && (body[k] === '' || body[k] === '-')) delete body[k];
    }
    await patchJob(data.code, body, data.updated_at, sessionToken);
    return { success: true };
  } catch (e: unknown) {
    const msg = String((e instanceof Error ? e.message : String(e)) || e);
    if (msg.includes('412') || msg.includes('Precondition')) {
      return { success: false, error: 'Data telah diubah oleh pengguna lain. Silakan segarkan halaman.', conflict: true };
    }
    return { success: false, error: safeError('Gagal edit loker.', e) };
  }
}

export async function handleUbahStatusJob(payload: unknown[], sessionToken?: string) {
  const guard = requireAdmin(sessionToken || '');
  if (guard.error) return guard.error;
  // Validate AFTER the guard and BEFORE the try, deliberately:
  //   - after the guard, so an unauthenticated caller still gets the auth
  //     verdict rather than a schema verdict (identity before input);
  //   - before the try, because the guards throw AppError and the dispatcher
  //     maps that to HTTP 400 + code VALIDATION_FAILED. Inside the catch below
  //     it would be flattened into a 200 + {success:false}.
  //
  // Guards rather than zod here: zod costs ~67 KB in the bundle and this entry
  // point cannot afford it — see the header of _lib/kernel/guard.ts.
  const [code, status, updatedAt] = guardPayload(payload, [
    text('Kode loker', 64),
    text('Status', 40),
    optionalText('Timestamp', 64),
  ]) as [string, string, string | null | undefined];
  try {
    // `updatedAt ?? undefined`: the wire delivers an absent optional as `null`,
    // and `patchJob` distinguishes only "has a value" from "does not" — a null
    // If-Match must mean "no precondition", exactly as undefined did.
    await patchJob(code, { status }, updatedAt ?? undefined, sessionToken);
    return { success: true, job: await getJobMapped(code) };
  } catch (e: unknown) {
    const msg = String((e instanceof Error ? e.message : String(e)) || e);
    if (msg.includes('412') || msg.includes('Precondition')) {
      return { success: false, error: 'Data telah diubah oleh pengguna lain. Silakan segarkan halaman.', conflict: true };
    }
    return { success: false, error: safeError('Gagal ubah status.', e) };
  }
}

export async function handleHapusJobData(payload: unknown[], sessionToken?: string) {
  const guard = requireAdmin(sessionToken || '');
  if (guard.error) return guard.error;
  // `!code` used to be checked here and returned a 400 body. The guard now owns
  // that rule (non-blank, bounded) and adds the part the old check could not
  // express: a non-string code. Without it, `code_job=eq.<object>` deleted zero
  // rows and still answered `{success:true}`.
  const [code] = guardPayload(payload, [text('Kode loker', 64)]) as [string];
  try {
    const adaTerkait = await countCandidatesForJob(code);
    if (adaTerkait === true) {
      return { success: false, error: 'Gagal hapus loker. Mungkin masih ada kandidat terkait.' };
    }
    if (adaTerkait === undefined) {
      const cands = await findCandidates();
      const terkait = cands.rows.some((r: Record<string, unknown>) => String(r.id_loker_pilihan || '') === String(code));
      if (terkait) return { success: false, error: 'Gagal hapus loker. Mungkin masih ada kandidat terkait.' };
    }
    await deleteJob(code);
    return { success: true, code };
  } catch (e: unknown) {
    return { success: false, error: safeError('Gagal hapus loker.', e) };
  }
}

export async function handleUpdateTahapanDbJob(payload: unknown[], sessionToken?: string) {
  const guard = requireAdmin(sessionToken || '');
  if (guard.error) return guard.error;
  // `requireAtLeastOne` closes a real hole: with neither field, `body` stayed
  // `{}`, the handler PATCHed an EMPTY body and answered `{success:true}` — an
  // empty write is not a successful write. `optionalText` accepts BOTH `null`
  // and `undefined` because an omitted wire argument arrives as `null`.
  const [code, tahapan, status] = guardPayload(payload, [
    text('Kode loker', 64),
    optionalText('Tahapan', 40),
    optionalText('Status', 40),
  ]) as [string, string | null | undefined, string | null | undefined];
  requireAtLeastOne([tahapan, status], 'Tahapan atau status harus diisi');
  const body: Record<string, unknown> = {};
  if (tahapan != null) body.tahapan = tahapan;
  if (status != null) body.status = status;
  try {
    await patchJob(code, body, undefined, sessionToken);
    return { success: true, job: await getJobMapped(code) };
  } catch (e: unknown) {
    return { success: false, error: safeError('Gagal update tahapan.', e) };
  }
}

// Saves which document TYPES the public share view may show for a job
// (`dokumen_share`). This is the only real lever on what a TSK viewer sees, and
// it is per job by design — legacy had the same column for the same reason.
//
// It used to also lazy-mint a per-job share token. That gate was removed on
// 2026-09-13: the viewer is public by job code, as legacy was.
export async function handleUpdateDokumenShare(payload: unknown[], sessionToken?: string) {
  const guard = requireAdmin(sessionToken || '');
  if (guard.error) return guard.error;
  const [code, joined] = guardPayload(payload, [
    text('Kode loker', 64),
    // Blank is LEGAL here: the UI clears the shared-document list by sending ''.
    optionalTextOrEmpty('Daftar dokumen', 400),
  ]) as [string, string | null | undefined];
  try {
    await patchJob(code, { dokumen_share: joined || '' }, undefined, sessionToken);
    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: safeError('Gagal update dokumen share.', e) };
  }
}

export async function handleTandaiGagalJob(payload: unknown[], sessionToken?: string) {
  const guard = requireAdmin(sessionToken || '');
  if (guard.error) return guard.error;
  const [wa, jobCode] = guardPayload(payload, [
    text('Nomor WA', 32),
    text('Kode loker', 64),
  ]) as [string, string];
  cacheClear();
  try {
    const row = await findCandidateByWa(wa);
    if (!row) return { success: false, error: 'Kandidat tidak ditemukan.' };
    const idLoker = toText(pick(row, ['id_loker_pilihan', 'id_loker']));
    if (String(idLoker) !== String(jobCode)) {
      return { success: false, error: 'Kandidat tidak terdaftar di job ini.' };
    }
    await supabaseJson('PATCH', 'database_candidate', {
      query: { id: 'eq.' + row.id },
      body: { status_kandidat: 'GAGAL', id_loker_pilihan: null, updated_at: new Date().toISOString() },
      headers: { Prefer: 'return=minimal' },
    });
    let formUpdated: Record<string, unknown> | null = null;
    try {
      let forms = await findFormsByWa(wa);
      if (forms === undefined) forms = await findForms();
      const want = normalizeWa(wa);
      const m = forms.find((r) => normalizeWa(String(r.no_wa || '')) === want) || null;
      if (m && m.id !== undefined) {
        await supabaseJson('PATCH', 'database_asj_form', {
          query: { id: 'eq.' + m.id },
          body: { status: 'GAGAL' },
          headers: { Prefer: 'return=minimal' },
        });
        m.status = 'GAGAL';
        formUpdated = mapForm(m, -1);
      }
    } catch { /* opsional */ }
    let candidate: Record<string, unknown> | null = null;
    try {
      const row2 = await findCandidateByWa(wa);
      if (row2 && row2.id !== undefined) {
        candidate = stripRaw([mapCandidate(row2)])[0] || null;
        if (candidate) { try { await attachBerkasBio([candidate]); } catch { /* best-effort */ } }
      }
    } catch { /* best-effort */ }
    return { success: true, candidate, form: formUpdated };
  } catch (e: unknown) {
    return { success: false, error: safeError('Gagal tandai gagal.', e) };
  }
}
