/**
 * contexts/applications/service.ts — Business logic for application forms (mail inbox)
 *
 * Other contexts and surfaces import ONLY from index.ts.
 */
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

import { attachBerkasBio } from '../../_lib/db/berkas';
import { safeError } from '../../_lib/kernel/errors';
import { guardPayload, indexLike, ignored, optionalTextOrEmpty } from '../../_lib/kernel/guard';
import { requireAdmin } from '../identity';
import { emit } from '../../_lib/kernel/events';
import { mapCandidate } from '../../_lib/db/candidates';
import { findCandidateByWa, nextCandidateId } from '../../_lib/candidate-helpers';
import { stripRaw } from '../catalog';
import { cacheClear } from '../../_lib/cache';
import * as fcm from '../../_lib/fcm-server';
import {
  getFormByIndex,
  getFormsByWa,
  patchForm,
  deleteForm,
  upsertForm,
  mapForm,
  supabaseJson,
  normalizeWa as normWa,
} from './repository';

const MAIL_PENDING_STATUS = ['MENUNGGU', 'MAIL', 'BARU', 'PENDING'];

function mailStatusUntukUpdate(currentStatus: string): string {
  const cur = String(currentStatus || '').toUpperCase();
  if (!cur || MAIL_PENDING_STATUS.includes(cur)) return 'MENUNGGU';
  return 'UPDATE';
}

function appendFeedback(prev: string, entry: string): string {
  const items = String(prev || '')
    .split('·')
    .map((s) => s.trim())
    .filter(Boolean);
  items.unshift(String(entry || '').trim());
  return items.slice(0, 3).join(' · ');
}

async function syncCandidateDariForm(f: Record<string, unknown>, status: string): Promise<string | null> {
  const wa = normWa(String(f.no_wa || f.wa || ''));
  const codeJob = String(f.code_job || '');
  let lastGenerated: string | null = null;
  if (!wa) return null;
  const row = await findCandidateByWa(wa);
  if (status === 'LULUS') {
    const now = new Date().toISOString();
    const base: Record<string, unknown> = {
      nama_lengkap: String(f.nama_lengkap || ''),
      gender: String(f.gender || ''),
      usia: String(f.usia || ''),
      tb: String(f.tb || ''),
      bb: String(f.bb || ''),
      pas_photo: f.pas_photo || '',
      jft: f.jft || '',
      ssw: f.ssw || '',
      file_cv: f.file_cv || '',
      status_kandidat: 'LULUS',
      updated_at: now,
    };
    if (codeJob) base.id_loker_pilihan = codeJob;
    if (row && row.id !== undefined) {
      for (const k of Object.keys(base)) if (base[k] === undefined) delete base[k];
      await supabaseJson('PATCH', 'database_candidate', {
        query: { id: 'eq.' + row.id },
        body: base,
        headers: { Prefer: 'return=minimal' },
      });
    } else if (codeJob) {
      base.id_kandidat = await nextCandidateId();
      base.no_wa = wa;
      // H6 fix: password default acak (bukan 4 digit terakhir WA yang mudah
      // ditebak) — dikembalikan ke admin untuk diteruskan ke kandidat.
      const generatedPassword = String(crypto.randomInt(100000, 1000000));
      base.password_kandidat = bcrypt.hashSync(generatedPassword, 10);
      base.password_diubah = false;
      lastGenerated = generatedPassword;
      base.tahapan_seleksi = 'LIST';
      base.tanggal_daftar = now;
      base.created_at = now;
      base.updated_at = now;
      await supabaseJson('POST', 'database_candidate', {
        body: base,
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      });
    }
  } else if (status === 'GAGAL' && row && row.id !== undefined) {
    const upd: Record<string, unknown> = { status_kandidat: 'GAGAL', updated_at: new Date().toISOString() };
    if (codeJob && String(row['id_loker_pilihan'] || row['id_loker'] || '') === codeJob) {
      upd.id_loker_pilihan = null;
    }
    await supabaseJson('PATCH', 'database_candidate', {
      query: { id: 'eq.' + row.id },
      body: upd,
      headers: { Prefer: 'return=minimal' },
    });
  }
  return lastGenerated;
}

async function handleFormStatus(rowIndex: number, status: string, reason?: string, sessionToken?: string) {
  cacheClear();
  if (!Number.isInteger(rowIndex) || rowIndex < 0) {
    return { success: false, error: 'Index form tidak valid.' };
  }
  try {
    const f = await getFormByIndex(rowIndex);
    if (!f) return { success: false, error: 'Form tidak ditemukan.' };
    const body: Record<string, unknown> = { status };
    if (reason !== null && reason !== undefined) body.keterangan = reason;
    await patchForm(f.id as number, body, sessionToken);
    let generatedPassword: string | null = null;
    try { generatedPassword = await syncCandidateDariForm(f, status); } catch (e) { /* best-effort */ }

    // Emit domain event for cross-context communication
    const waEvent = normWa(String(f.no_wa || f.wa || ''));
    const jobCodeEvent = String(f.code_job || '');
    if (status === 'LULUS' && waEvent) {
      emit({ type: 'application.approved', wa: waEvent, jobCode: jobCodeEvent, at: new Date().toISOString() });
    } else if (status === 'GAGAL' && waEvent) {
      emit({ type: 'application.rejected', wa: waEvent, jobCode: jobCodeEvent, reason: reason || undefined, at: new Date().toISOString() });
    } else if (waEvent) {
      emit({ type: 'application.submitted', wa: waEvent, jobCode: jobCodeEvent, at: new Date().toISOString() });
    }

    // FCM notification
    const waNotify = normWa(String(f.no_wa || f.wa || ''));
    if (waNotify && (status === 'GAGAL' || status === 'REVIEW ADMIN' || status === 'LULUS')) {
      try {
        const jobCode = String(f.code_job || '');
        let title = '', pushBody = '';
        if (status === 'GAGAL') { title = 'Dokumen ' + jobCode + ' perlu revisi'; pushBody = reason || 'Lamaran ditolak.'; }
        else if (status === 'REVIEW ADMIN') { title = 'Dokumen ' + jobCode + ' sedang direview'; pushBody = 'Admin sedang meninjau dokumen Anda.'; }
        else if (status === 'LULUS') { title = 'Lamaran ' + jobCode + ' disetujui! 🎉'; pushBody = 'Selamat! Lamaran Anda telah disetujui.'; }
        if (title) {
          // Phase D follow-up (2026-09-13): was `const { rows: tokens } = …`.
          // `supabaseJson()` returns the parsed body directly, so `tokens` was
          // always undefined and this push was never sent — candidates were
          // never told their application was approved, rejected or under review.
          // BEHAVIOUR CHANGE: fixing it starts delivering those pushes to the
          // devices registered in `fcm_tokens`. Guarded by
          // contexts/scheduling/repository.test.ts.
          const tokens = await supabaseJson('GET', 'fcm_tokens', {
            query: { select: 'token', wa: 'eq.' + waNotify, limit: 10 },
          });
          if (Array.isArray(tokens) && tokens.length > 0) {
            const tokenList = tokens.map((t: Record<string, unknown>) => t.token as string).filter(Boolean);
            if (tokenList.length > 0) await fcm.sendMulticast(tokenList, title, pushBody, '/');
          }
        }
      } catch { /* FCM is best-effort */ }
    }

    // PATCH-IN-PLACE: return updated form + candidate
    f.status = status;
    if (reason !== null && reason !== undefined) f.keterangan = reason;
    let candidate = null;
    const wa = normWa(String(f.no_wa || f.wa || ''));
    if (wa) {
      try {
        const row = await findCandidateByWa(wa);
        if (row && row.id !== undefined) {
          candidate = stripRaw([mapCandidate(row)])[0] || null;
          if (candidate) { try { await attachBerkasBio([candidate]); } catch { /* best-effort */ } }
        }
      } catch { /* best-effort */ }
    }
    const result: Record<string, unknown> = { success: true, form: mapForm(f, rowIndex), candidate };
    if (generatedPassword) result.generatedPassword = generatedPassword;
    return result;
  } catch (e: unknown) {
    return { success: false, error: safeError('Gagal proses form.', e) };
  }
}

export async function handleReviewForm(payload: unknown[], sessionToken?: string) {
  const guard = requireAdmin(sessionToken || '');
  if (guard.error) return guard.error;
  return handleFormStatus((payload || [])[0] as number, 'REVIEW ADMIN', undefined, sessionToken);
}

export async function handleApproveForm(payload: unknown[], sessionToken?: string) {
  const guard = requireAdmin(sessionToken || '');
  if (guard.error) return guard.error;
  return handleFormStatus((payload || [])[0] as number, 'LULUS', undefined, sessionToken);
}

export async function handleRejectForm(payload: unknown[], sessionToken?: string) {
  const guard = requireAdmin(sessionToken || '');
  if (guard.error) return guard.error;
  // `reason` is written to the TEXT column `keterangan` and reused verbatim as
  // a push-notification body, so it must be a string before it gets there.
  // Previously an unchecked value travelled straight into PostgREST and came
  // back to the admin as a generic failure that pointed at no argument.
  // An empty reason stays legal — the fallback below is the legacy wording.
  //
  // Guards rather than zod: this module is imported by master-data, registry
  // and _lib/ai/cv, so a zod import here would pull ~67 KB into most of the
  // deployment — see the header of _lib/kernel/guard.ts.
  const [idx, , reason] = guardPayload(payload, [
    indexLike('Index form'),
    ignored,
    // Blank is LEGAL: an empty reason falls back to 'Lamaran ditolak' below.
    optionalTextOrEmpty('Alasan', 1000),
  ]) as [number | string, unknown, string | null | undefined];
  return handleFormStatus(idx as number, 'GAGAL', (reason || 'Lamaran ditolak') as string, sessionToken);
}

export async function handleDeleteForm(payload: unknown[], sessionToken?: string) {
  const guard = requireAdmin(sessionToken || '');
  if (guard.error) return guard.error;
  cacheClear();
  const idx = Number((payload || [])[0]);
  if (!Number.isInteger(idx) || idx < 0) {
    return { success: false, error: 'Index form tidak valid.' };
  }
  try {
    const f = await getFormByIndex(idx);
    if (!f) return { success: false, error: 'Form tidak ditemukan.' };
    await deleteForm(f.id as number, sessionToken);
    return { success: true, rowIndex: idx };
  } catch (e: unknown) {
    return { success: false, error: 'Gagal menghapus form. Silakan coba lagi.' };
  }
}

/**
 * hapusFormTerpilih — hapus massal lamaran dari Mail Inbox (#15).
 *
 * Legacy (`js/api/forms.ts:hapusFormMailTerpilih`) memanggil `deleteForm` SATU PER SATU
 * dari klien, mengirim **rowIndex**. Dua masalah kalau pola itu disalin:
 *
 *   1. N round-trip untuk N baris (10 baris = 10 round-trip ke PostgREST).
 *   2. **Index bergeser saat baris dihapus.** Menghapus index 2 membuat baris yang
 *      tadinya index 3 menjadi 2 — jadi menghapus [2,3] berurutan akan melewati
 *      satu baris dan menghapus baris yang salah.
 *
 * Karena itu endpoint ini menyelesaikan **semua index → id lebih dulu**, baru
 * menghapus. Mengirim id (bukan index) juga membuat operasinya idempoten: index
 * yang sama dikirim dua kali tidak akan menghapus baris tambahan.
 *
 * Batas jumlah ada di `MAX_BULK_DELETE` karena ini satu-satunya jalur di mana
 * satu permintaan bisa menghapus banyak baris sekaligus.
 */
export const MAX_BULK_DELETE = 100;

export async function handleHapusFormTerpilih(payload: unknown[], sessionToken?: string) {
  const guard = requireAdmin(sessionToken || '');
  if (guard.error) return guard.error;

  const raw = Array.isArray((payload || [])[0]) ? ((payload || [])[0] as unknown[]) : [];
  // Dedupe + validasi: index harus bilangan bulat >= 0.
  //
  // PERANGKAP: `Number(null)` === 0 dan `Number('')` === 0, jadi `null`/`''` di
  // dalam daftar pilihan akan diam-diam menjadi "hapus baris 0". Itu menghapus
  // baris yang SALAH tanpa error. Karena itu selain Number.isInteger, tipe
  // aslinya juga harus number|string yang benar-benar berisi angka.
  const idxs = Array.from(
    new Set(
      raw
        .filter((v) => typeof v === 'number' || (typeof v === 'string' && v.trim() !== ''))
        .map((v) => Number(v))
        .filter((n) => Number.isInteger(n) && n >= 0),
    ),
  );
  if (idxs.length === 0) {
    return { success: false, error: 'Tidak ada baris yang dipilih.' };
  }
  if (idxs.length > MAX_BULK_DELETE) {
    return {
      success: false,
      error: `Maksimal ${MAX_BULK_DELETE} baris sekali hapus.`,
      max: MAX_BULK_DELETE,
    };
  }

  cacheClear();

  // TAHAP 1 — resolve SEMUA index → id SEBELUM menghapus apa pun.
  // Kalau ini digabung dengan penghapusan, index akan bergeser di tengah loop.
  const resolved: Array<{ idx: number; id: string | number }> = [];
  const notFound: number[] = [];
  for (const idx of idxs) {
    try {
      const f = await getFormByIndex(idx);
      if (f && f.id !== undefined && f.id !== null) {
        resolved.push({ idx, id: f.id });
      } else {
        notFound.push(idx);
      }
    } catch {
      notFound.push(idx);
    }
  }

  // TAHAP 2 — hapus by id.
  const deleted: number[] = [];
  const failed: Array<{ idx: number; error: string }> = [];
  for (const { idx, id } of resolved) {
    try {
      await deleteForm(id, sessionToken);
      deleted.push(idx);
    } catch (e: unknown) {
      failed.push({ idx, error: safeError('Gagal menghapus.', e) });
    }
  }

  return {
    success: failed.length === 0,
    deleted: deleted.length,
    deletedIndexes: deleted,
    notFound,
    failed,
  };
}

export async function handleTandaiDibacaForm(payload: unknown[], sessionToken?: string) {
  const guard = requireAdmin(sessionToken || '');
  if (guard.error) return guard.error;
  const idx = Number((payload || [])[0]);
  if (!Number.isInteger(idx) || idx < 0) {
    return { success: false, error: 'Index form tidak valid.' };
  }
  try {
    const f = await getFormByIndex(idx);
    if (!f) return { success: false, error: 'Form tidak ditemukan.' };
    const fb = String(f.feedback_berkas || '');
    const m = fb.match(/\[\[PREV:([^\]]+)\]\]/);
    const prevStatus = m ? m[1].trim() : 'MENUNGGU';
    const newFb = fb.replace(/\[\[PREV:[^\]]+\]\]\s*/, '').trim();
    await patchForm(f.id as number, { status: prevStatus, feedback_berkas: newFb, updated_at: new Date().toISOString() }, sessionToken);
    f.status = prevStatus;
    f.feedback_berkas = newFb;
    return { success: true, form: mapForm(f, idx) };
  } catch (e: unknown) {
    return { success: false, error: safeError('Gagal tandai dibaca.', e) };
  }
}

export async function syncBiodataKeMail(wa: string, nama: string, labels: string[], sessionToken?: string) {
  const want = normWa(wa);
  let rows = await getFormsByWa(wa);
  const mine = rows.filter((r: Record<string, unknown>) => normWa(String(r.no_wa || r.wa || '')) === want);
  if (!mine.length) return;
  for (const r of mine) {
    if (r.id === undefined || r.id === null) continue;
    const isUpdate = mailStatusUntukUpdate(r.status as string) === 'UPDATE';
    const entry =
      (isUpdate ? '[[PREV:' + String(r.status || '').toUpperCase() + ']] ' : '') +
      '[BIODATA] ' + (labels.length ? labels.join(', ') : 'data diperbarui');
    const body: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      feedback_berkas: appendFeedback(r.feedback_berkas as string, entry),
    };
    if (isUpdate) body.status = 'UPDATE';
    await patchForm(r.id, body, sessionToken);
  }
  if (labels && labels.length > 0) {
    try {
      const { notifyAdmins } = await import('../../_lib/fcm-helpers');
      await notifyAdmins('Biodata Lengkap (CV) Diperbarui', `Kandidat ${nama} (${wa}) memperbarui data: ${labels.join(', ')}.`, '/admin.html');
    } catch { /* ignore */ }
  }
}

export async function syncFormMailDariUpload(wa: string, nama: string, docLabel: string, url: string, jobCode: string, sessionToken?: string) {
  const want = normWa(wa);
  const rows = await getFormsByWa(wa);
  const label = String(docLabel || 'DOKUMEN').trim().toUpperCase();
  const code = String(jobCode || '').trim();

  let targets: Record<string, unknown>[] = [];
  if (label === 'CV' || label === 'CV_REVISI') {
    if (code) targets = rows.filter((r: Record<string, unknown>) => normWa(String(r.no_wa || r.wa || '')) === want && String(r.code_job || '').trim() === code);
    if (!targets.length) targets = rows.filter((r: Record<string, unknown>) => normWa(String(r.no_wa || r.wa || '')) === want);
  } else {
    targets = rows.filter((r: Record<string, unknown>) => normWa(String(r.no_wa || r.wa || '')) === want);
  }
  if (!targets.length) targets = [{}];

  for (const existing of targets) {
    const docs: Record<string, string> = {};
    const raw = String((existing && existing.keterangan) || '');
    raw.split(';').forEach((chunk: string) => {
      const i = chunk.indexOf(':');
      if (i > 0) docs[chunk.slice(0, i).trim().toUpperCase()] = chunk.slice(i + 1).trim();
    });
    docs[label] = String(url || '');
    const nextStatus = mailStatusUntukUpdate((existing && existing.status) as string);
    const entry =
      (nextStatus === 'UPDATE' && existing && existing.status
        ? '[[PREV:' + String(existing.status).toUpperCase() + ']] ' : '') +
      '[UPLOAD ' + label + ']';
    const keterangan = Object.entries(docs).filter(([, v]) => v).map(([k, v]) => k + ':' + v).join(';');
    const body: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      code_job: String((existing && existing.code_job) || code || ''),
      nama_lengkap: String(nama || (existing && existing.nama_lengkap) || 'KANDIDAT').toUpperCase(),
      no_wa: want,
      keterangan,
      status: nextStatus,
      feedback_berkas: appendFeedback((existing && existing.feedback_berkas) as string, entry),
      updated_at: new Date().toISOString(),
    };
    if (label === 'PAS_PHOTO' || label === 'PHOTO') body.pas_photo = String(url || '');
    if (label === 'CV' || label === 'CV_REVISI') body.file_cv = String(url || '');
    if (label === 'JFT') body.jft = String(url || '');
    if (label === 'SSW') body.ssw = String(url || '');

    if (existing && existing.id !== undefined) {
      await patchForm(existing.id as number, body, sessionToken);
    } else {
      await upsertForm(body);
    }

    if (label && targets.length > 0) {
      try {
        const { notifyAdmins } = await import('../../_lib/fcm-helpers');
        await notifyAdmins('Dokumen Baru Diupload', `${nama} (${want}) mengupload ${label}. Silakan review di Mail.`, '/admin.html#mail');
      } catch { /* ignore */ }
    }
  }
}

export { mailStatusUntukUpdate, appendFeedback };
