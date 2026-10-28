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

/**
 * Status baris Mail yang berarti "sudah diputuskan admin".
 *
 * `DISETUJUI`, bukan `LULUS`. `LULUS` dipakai untuk TAHAPAN seleksi
 * (`database_candidate.status_kandidat`), dan itulah satu-satunya artinya —
 * keputusan pemilik 2026-10-29: "lulus hanya untuk admin mengganti tahapan,
 * untuk update dokumen ganti saja di setujui admin".
 *
 * Kosakata ini bukan baru: `migrations/013_biodata_status.sql` sudah memilih
 * `DISETUJUI` untuk verdict dokumen dan menulis eksplisit "Deliberately NOT
 * 'LULUS' — the whole defect is one word meaning two things".
 */
const MAIL_APPROVED_STATUS = 'DISETUJUI';

/**
 * Baris biodata/dokumen: INFORMASI, bukan antrean.
 *
 * Pemilik 2026-10-29: "ada baris di mail tapi infonya di mail tab, gak perlu
 * persetujuan admin, gak perlu menunggu". Jadi baris ini tidak pernah masuk
 * hitungan MENUNGGU dan tidak punya tombol Setujui/Tolak; admin hanya perlu
 * melihatnya dan bisa menandainya sudah dibaca (`DIBACA`).
 */
const MAIL_INFO_STATUS = 'INFO';
const MAIL_INFO_READ_STATUS = 'DIBACA';

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
  if (status === MAIL_APPROVED_STATUS) {
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
      updated_at: now,
    };
    // TIDAK ada `status_kandidat` di sini — sama sekali.
    //
    // Dua alasan, keduanya dari pemilik (2026-10-29):
    //   1. "lulus hanya untuk admin mengganti tahapan". `status_kandidat` dan
    //      `tahapan_seleksi` diubah admin lewat form kandidat
    //      (`registry/service.ts` → `buildKandidatSuperPatch`), bukan lewat
    //      kotak masuk Mail.
    //   2. Menyetujui satu baris Mail tidak boleh menjadi pernyataan lulus.
    //      `database_asj_form` menyimpan dua jenis baris — lamaran (code_job
    //      terisi) dan biodata/dokumen (code_job kosong, lihat `isBiodataRow`
    //      di CandidateDash.tsx) — dan keduanya sampai ke fungsi ini.
    //
    // Salinan field biodata di atas tetap: menyetujui dokumen memang menyegarkan
    // data kandidat, dan itu bukan pernyataan lulus.
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
    // Penjaga JENIS BARIS, bukan hanya jenis status.
    //
    // Baris BIODATA (code_job kosong) tidak punya keputusan untuk disetujui —
    // keputusan pemilik 2026-10-29 (A2): "gak perlu persetujuan admin". UI
    // menyembunyikan tombolnya lewat `isInfoRow(status)`, tapi status adalah
    // turunan, bukan penyebab: tab admin yang sudah terbuka SEBELUM barisnya
    // berubah masih merender tombol Setujui, dan menekannya menulis DISETUJUI
    // pada baris yang seharusnya INFO. Server tidak boleh bergantung pada UI
    // yang kebetulan sudah segar.
    if (status === MAIL_APPROVED_STATUS && !String(f.code_job || '').trim()) {
      return {
        success: false,
        error: 'Baris biodata/dokumen tidak perlu disetujui — tandai sudah dibaca.',
      };
    }
    const body: Record<string, unknown> = { status };
    if (reason !== null && reason !== undefined) body.keterangan = reason;
    await patchForm(f.id as number, body, sessionToken);
    let generatedPassword: string | null = null;
    try { generatedPassword = await syncCandidateDariForm(f, status); } catch (_e) { /* best-effort */ }

    // Emit domain event for cross-context communication
    const waEvent = normWa(String(f.no_wa || f.wa || ''));
    const jobCodeEvent = String(f.code_job || '');
    if (status === MAIL_APPROVED_STATUS && waEvent) {
      emit({ type: 'application.approved', wa: waEvent, jobCode: jobCodeEvent, at: new Date().toISOString() });
    } else if (status === 'GAGAL' && waEvent) {
      emit({ type: 'application.rejected', wa: waEvent, jobCode: jobCodeEvent, reason: reason || undefined, at: new Date().toISOString() });
    } else if (waEvent) {
      emit({ type: 'application.submitted', wa: waEvent, jobCode: jobCodeEvent, at: new Date().toISOString() });
    }

    // FCM notification
    const waNotify = normWa(String(f.no_wa || f.wa || ''));
    if (waNotify && (status === 'GAGAL' || status === 'REVIEW' || status === MAIL_APPROVED_STATUS)) {
      try {
        const jobCode = String(f.code_job || '');
        let title = '', pushBody = '';
        if (status === 'GAGAL') { title = 'Dokumen ' + jobCode + ' perlu revisi'; pushBody = reason || 'Lamaran ditolak.'; }
        else if (status === 'REVIEW') { title = 'Dokumen ' + jobCode + ' sedang direview'; pushBody = 'Admin sedang meninjau dokumen Anda.'; }
        else if (status === MAIL_APPROVED_STATUS) { title = 'Lamaran ' + jobCode + ' disetujui! 🎉'; pushBody = 'Selamat! Lamaran Anda telah disetujui.'; }
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
  return handleFormStatus((payload || [])[0] as number, 'REVIEW', undefined, sessionToken);
}

export async function handleApproveForm(payload: unknown[], sessionToken?: string) {
  const guard = requireAdmin(sessionToken || '');
  if (guard.error) return guard.error;
  return handleFormStatus((payload || [])[0] as number, MAIL_APPROVED_STATUS, undefined, sessionToken);
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
  } catch (_e: unknown) {
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
    const cur = String(f.status || '').toUpperCase();
    // Baris INFORMASI (biodata) tidak punya "status sebelumnya" untuk
    // dikembalikan — yang dilacak justru apakah admin sudah melihatnya.
    // Tanpa ini, menekan "Tandai dibaca" pada baris biodata akan mengembalikannya
    // ke MENUNGGU dan memasukkannya ke antrean yang justru ingin dihindari.
    if (cur === MAIL_INFO_STATUS) {
      await patchForm(f.id as number, { status: MAIL_INFO_READ_STATUS, updated_at: new Date().toISOString() }, sessionToken);
      f.status = MAIL_INFO_READ_STATUS;
      return { success: true, form: mapForm(f, idx) };
    }
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

/**
 * Satu baris `database_asj_form`, persis seperti yang dikembalikan
 * `getFormsByWa`. Dipakai sebagai tipe `preloadedRows` supaya `r.id` tetap
 * bertipe saat barisnya diserahkan pemanggil — bukan `unknown`.
 */
type FormRow = Awaited<ReturnType<typeof getFormsByWa>>[number];

/**
 * `preloadedRows` (opsional) — baris `database_asj_form` yang SUDAH dibaca
 * pemanggil untuk WA yang sama, supaya satu permintaan tidak menanyakan tabel
 * yang sama berkali-kali.
 *
 * Aman dipakai di sini karena fungsi ini TIDAK PERNAH membuat baris: ia hanya
 * `patchForm()` baris yang sudah ada (lihat repository.ts — `patchForm` adalah
 * PATCH murni). Jadi jawaban "baris mana milik WA ini" tidak bisa berubah
 * antara pembacaan pemanggil dan pemakaian di sini.
 *
 * `undefined` = pemanggil tidak punya baris yang bisa dipakai (mis. pembacaan
 * sebelumnya gagal); fungsi membaca sendiri seperti sebelumnya. Array KOSONG
 * tetap dipakai — "tidak ada baris" adalah jawaban yang sah, dan justru itulah
 * kasus yang paling sering.
 */
export async function syncBiodataKeMail(
  wa: string,
  nama: string,
  labels: string[],
  sessionToken?: string,
  preloadedRows?: FormRow[],
) {
  const want = normWa(wa);
  const rows: FormRow[] = Array.isArray(preloadedRows) ? preloadedRows : await getFormsByWa(wa);
  const mine = rows.filter((r: Record<string, unknown>) => normWa(String(r.no_wa || r.wa || '')) === want);
  // ⚠️ JANGAN `return` di sini kalau `mine` kosong. Kandidat yang biodatanya
  // diperbarui lewat form Master sering TIDAK punya satu pun baris
  // `database_asj_form` (terukur 2026-10-25: 51 baris form untuk 226 kandidat),
  // dan dulu fungsi ini berhenti sebelum `notifyAdmins` — sehingga push ke admin
  // tidak pernah terkirim justru untuk mayoritas kandidat. Yang bergantung pada
  // `mine` hanyalah PENULISAN jejak ke Mail, bukan notifikasinya.
  //
  // 2026-10-29: `mine` kosong kini membuat SATU baris, bukan nol. Sebelumnya
  // admin menerima push "memperbarui data" lalu membuka Mail dan tidak menemukan
  // apa pun — untuk mayoritas kandidat. Jalur upload sudah melakukan hal yang
  // sama (`syncFormMailDariUpload`: `if (!targets.length) targets = [{}]`), jadi
  // bentuk barisnya bukan hal baru: `database_asj_form` memang menyimpan dua
  // jenis baris, dan pembedanya `code_job` kosong + penanda `[BIODATA]` di
  // `feedback_berkas` (lihat `isBiodataRow` di CandidateDash.tsx).
  // `upsertFormRow` memakai `on_conflict: no_wa,code_job`, jadi pemanggilan
  // berulang MENGGABUNG ke baris yang sama, bukan menumpuk.
  const targets: FormRow[] = mine.length ? mine : [{ no_wa: want } as unknown as FormRow];
  for (const r of targets) {
    const hasId = r.id !== undefined && r.id !== null;
    // Dua jenis baris, dua arti status.
    //
    //   · Baris LAMARAN (code_job terisi): biodata yang berubah adalah sinyal
    //     bagi admin, jadi pakai `mailStatusUntukUpdate` — MENUNGGU kalau belum
    //     diputuskan, UPDATE kalau sudah.
    //   · Baris BIODATA (code_job kosong): INFORMASI. Pemilik 2026-10-29:
    //     "gak perlu persetujuan admin, gak perlu menunggu". Menaruhnya di
    //     MENUNGGU membuat antrean Mail penuh hal yang tidak perlu diputuskan.
    const isApplicationRow = Boolean(String(r.code_job || '').trim());
    const nextStatus = isApplicationRow
      ? mailStatusUntukUpdate(r.status as string)
      : MAIL_INFO_STATUS;
    const isUpdate = nextStatus === 'UPDATE';
    const entry =
      (isUpdate ? '[[PREV:' + String(r.status || '').toUpperCase() + ']] ' : '') +
      '[BIODATA] ' + (labels.length ? labels.join(', ') : 'data diperbarui');
    const body: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status: nextStatus,
      feedback_berkas: appendFeedback(r.feedback_berkas as string, entry),
    };
    if (hasId) {
      await patchForm(r.id as number, body, sessionToken);
    } else {
      // Baris pertama untuk kandidat ini. Statusnya ikut aturan di atas: INFO,
      // karena barisnya biodata — bukan lamaran yang menunggu keputusan.
      await upsertForm({
        ...body,
        no_wa: want,
        code_job: '',
        nama_lengkap: String(nama || 'KANDIDAT').toUpperCase(),
      });
    }
  }
  if (labels && labels.length > 0) {
    try {
      const { notifyAdmins } = await import('../../_lib/fcm-helpers');
      // `#mail`, bukan `/admin.html`: barisnya kini benar-benar ada di Mail.
      await notifyAdmins('Biodata Lengkap (CV) Diperbarui', `Kandidat ${nama} (${wa}) memperbarui data: ${labels.join(', ')}.`, '/admin.html#mail');
    } catch { /* ignore */ }
  }
}

/** `preloadedRows` — sama dengan `syncBiodataKeMail`; lihat catatannya di atas. */
export async function syncFormMailDariUpload(
  wa: string,
  nama: string,
  docLabel: string,
  url: string,
  jobCode: string,
  sessionToken?: string,
  preloadedRows?: FormRow[],
) {
  const want = normWa(wa);
  const rows: FormRow[] = Array.isArray(preloadedRows) ? preloadedRows : await getFormsByWa(wa);
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
    // Dua jenis baris, dua arti status — aturan yang SAMA dengan
    // `syncBiodataKeMail` di atas (keputusan pemilik 2026-10-29, A1/A2).
    //
    // Sebelum ini jalur UPLOAD hanya punya SATU aturan, jadi mengunggah dokumen
    // pada baris biodata (code_job kosong, status INFO) menulis
    // `mailStatusUntukUpdate('INFO')` = **UPDATE** (terukur, bukan MENUNGGU:
    // INFO tidak ada di `MAIL_PENDING_STATUS`) — baris informasi keluar dari
    // keranjang Info dan masuk keranjang "perlu ditinjau", tepat keadaan yang A2
    // hapus. Lebih buruk lagi,
    // `code_job: existing.code_job || code` MENGISI code_job pada baris biodata,
    // sehingga barisnya berubah JENIS di tempat — status INFO-nya lalu dibaca
    // sebagai keputusan lamaran, dan `syncCandidateDariForm` bisa menulis
    // `status_kandidat` dari unggahan dokumen.
    //
    // Jenis baris ditentukan sekali: baris yang SUDAH ada mempertahankan jenisnya,
    // dan hanya baris BARU yang jenisnya boleh ditentukan oleh `code` unggahan.
    const hasExistingRow = Boolean(existing && existing.id !== undefined);
    const isApplicationRow = hasExistingRow
      ? Boolean(String((existing && existing.code_job) || '').trim())
      : Boolean(code);
    const nextStatus = isApplicationRow
      ? mailStatusUntukUpdate((existing && existing.status) as string)
      : MAIL_INFO_STATUS;
    const entry =
      (nextStatus === 'UPDATE' && existing && existing.status
        ? '[[PREV:' + String(existing.status).toUpperCase() + ']] ' : '') +
      '[UPLOAD ' + label + ']';
    const keterangan = Object.entries(docs).filter(([, v]) => v).map(([k, v]) => k + ':' + v).join(';');
    const body: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      code_job: isApplicationRow
        ? (hasExistingRow ? String(existing.code_job) : code)
        : '',
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
