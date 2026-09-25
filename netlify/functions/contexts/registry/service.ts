/**
 * contexts/registry/service.ts — Business logic for candidate lifecycle
 *
 * Other contexts and surfaces import ONLY from index.ts.
 */
import { cacheClear } from '../../_lib/cache';
import { requireAdmin } from '../identity';
import { emit } from '../../_lib/kernel/events';
import { safeError } from '../../_lib/kernel/errors';
import { findCandidateByWa } from '../../_lib/candidate-helpers';
import { syncBiodataKeMail } from '../applications';
import { getCandidatesPage as getCandidatesPageRepo, patchCandidate } from './repository';

const SUPER_MAIL_LABELS: Record<string, string> = {
  gender: 'gender', usia: 'usia', tempat_lahir: 'tempat lahir', tgl_lahir: 'tgl lahir',
  tb: 'tinggi', bb: 'berat', nilai_jft_text: 'JFT', bidang_ssw_text: 'SSW', id_loker_pilihan: 'loker',
};

export async function handleUpdateCatatanKandidat(payload: unknown[], sessionToken?: string) {
  const guard = requireAdmin(sessionToken || '');
  if (guard.error) return guard.error;
  cacheClear();
  // Support both formats (parity with legacy js/admin_modal/cv.ts simpanCatatanCv):
  //   Frontend object: [{ wa, catatan }] → catatan_admin (table note, EditCandidateModal)
  //   Frontend object: [{ wa, catatanInternal, catatanExternal }] → evaluasi dossier
  //   Legacy positional: [idKandidat|id, intNote, extNote, adminName?] → internal/ext
  let id: string | number | undefined;
  const patch: Record<string, string> = {};
  let updatedAt: string | undefined;
  const first = payload?.[0];
  if (first && typeof first === 'object') {
    // Frontend formats
    const data = first as Record<string, unknown>;
    const row = await findCandidateByWa(String(data.wa || ''));
    if (!row) return { success: false, error: 'Kandidat tidak ditemukan.' };
    id = row.id;
    if (data.catatan !== undefined) patch.catatan_admin = String(data.catatan ?? '');
    if (data.catatanInternal !== undefined) patch.catatan_internal = String(data.catatanInternal ?? '');
    if (data.catatanExternal !== undefined) patch.catatan_external = String(data.catatanExternal ?? '');
    if (!Object.keys(patch).length) return { success: false, error: 'Tidak ada catatan untuk disimpan.' };
  } else {
    // Legacy positional format — id boleh id_kandidat (ASJ#####) atau id numerik
    const [idRaw, intNote, extNote, maybe4] = (payload || []) as unknown[];
    if (idRaw === undefined || idRaw === null || String(idRaw).trim() === '') {
      return { success: false, error: 'ID kandidat tidak ditemukan.' };
    }
    const raw = String(idRaw).trim();
    if (/^\d+$/.test(raw)) {
      id = raw;
    } else {
      const { findCandidateByIdFiltered } = await import('../../_lib/db/candidates');
      const row = await findCandidateByIdFiltered(raw);
      if (!row || row.id === undefined) return { success: false, error: 'Kandidat tidak ditemukan.' };
      id = row.id;
    }
    patch.catatan_internal = String(intNote ?? '');
    if (extNote !== undefined) patch.catatan_external = String(extNote ?? '');
    // Arg ke-4 legacy = nama admin (bukan timestamp) — jangan dijadikan If-Match.
    // Hanya arg berbentuk ISO timestamp yang dipakai optimistic locking.
    const m4 = String(maybe4 ?? '');
    if (/^\d{4}-\d{2}-\d{2}T/.test(m4)) updatedAt = m4;
  }
  if (id === undefined) return { success: false, error: 'ID kandidat tidak ditemukan.' };
  try {
    await patchCandidate(String(id), patch, updatedAt, sessionToken);
    return { success: true };
  } catch (e: unknown) {
    const msg = String(e instanceof Error ? e.message : e);
    if (msg.includes('412') || msg.includes('Precondition')) {
      return { success: false, error: 'Data telah diubah oleh pengguna lain. Silakan segarkan halaman.', conflict: true };
    }
    return { success: false, error: safeError('Gagal simpan catatan.', e) };
  }
}

// Bangun body PATCH kandidat dari payload updateKandidatSuper (parity legacy
// simpanSuperEditKandidat di khoci921/js/api/candidates.ts). Murni — dipakai
// handler + test DB-free. VIP dikelola sbg tag [VIP] di catatan_internal;
// catatanExt → catatan_external; pendidikan ikut tersimpan (dulu terbuang).
export function buildKandidatSuperPatch(row: Record<string, any>, data: Record<string, unknown>): Record<string, any> {
  const body: Record<string, any> = {
    gender: data.gender !== undefined ? data.gender : undefined,
    usia: data.usia !== undefined ? data.usia : undefined,
    tempat_lahir: data.tempatLahir !== undefined ? data.tempatLahir : undefined,
    tgl_lahir: data.tglLahir !== undefined ? data.tglLahir : undefined,
    tb: data.tb !== undefined ? data.tb : undefined,
    bb: data.bb !== undefined ? data.bb : undefined,
    pendidikan: data.pendidikan !== undefined ? data.pendidikan : undefined,
    nilai_jft_text: data.jftText !== undefined ? data.jftText : undefined,
    bidang_ssw_text: data.sswText !== undefined ? data.sswText : undefined,
    id_loker_pilihan: data.idLoker !== undefined && data.idLoker !== null ? String(data.idLoker).trim() : undefined,
    tahapan_seleksi: data.tahapan !== undefined ? data.tahapan : undefined,
    status_kandidat: data.status !== undefined ? data.status : undefined,
  };
  for (const k of Object.keys(body)) if (body[k] === undefined) delete body[k];
  if (data.isVip !== undefined || data.catatanExt !== undefined) {
    const rawInt = row.catatan_internal !== undefined ? row.catatan_internal : row.catatan_int;
    let internal = String(rawInt ?? '');
    const vipOn = data.isVip === true || data.isVip === 'true';
    if (vipOn) {
      // Case-SENSITIVE: tag kanonikal `[VIP]` saja, sejalan dengan
      // isVipCatatan (_lib/ai/interview-shared.ts) dan lib/vip.ts. Versi
      // /\[VIP\]/i dulu membuat `[vip]` dianggap "sudah ada" sehingga penulis
      // tidak menambahkan `[VIP]` — kandidat tetap terkunci dari gerbang.
      if (!internal.includes('[VIP]')) internal = internal.trim() ? '[VIP] ' + internal.trim() : '[VIP]';
    } else {
      // Strip bentuk kanonikal saja: `i` sengaja dibuang supaya `[vip]` (bukan
      // tag) tidak ikut terhapus dari catatan.
      internal = internal.replace(/\[VIP\]\s*/g, '').trim();
    }
    body.catatan_internal = internal;
    if (data.catatanExt !== undefined) body.catatan_external = String(data.catatanExt ?? '');
  }
  return body;
}

export async function handleUpdateKandidatSuper(payload: unknown[], sessionToken?: string) {
  const guard = requireAdmin(sessionToken || '');
  if (guard.error) return guard.error;
  cacheClear();
  const data = ((payload && payload[0]) || {}) as Record<string, unknown>;
  if (!data.wa) return { success: false, error: 'Nomor WA tidak ditemukan.' };
  const updatedAt = data.updated_at as string | undefined;
  try {
    const row = await findCandidateByWa(data.wa as string);
    if (!row) return { success: false, error: 'Kandidat tidak ditemukan.' };
    const body = buildKandidatSuperPatch(row, data);
    const { normalizeWa } = await import('./repository');
    await patchCandidate(row.id, body, updatedAt, sessionToken);

    // Emit stage-changed event if status_kandidat was modified
    if (body.status_kandidat && String(body.status_kandidat) !== String(row.status_kandidat || '')) {
      emit({ type: 'candidate.stageChanged', wa: data.wa as string, from: String(row.status_kandidat || ''), to: String(body.status_kandidat), at: new Date().toISOString() });
    }
    try {
      const labels: string[] = [];
      for (const k of Object.keys(body)) {
        const label = SUPER_MAIL_LABELS[k];
        if (!label) continue;
        const oldVal = row[k] !== undefined && row[k] !== null ? String(row[k]).trim() : '';
        const newVal = String(body[k] === null || body[k] === undefined ? '' : body[k]).trim();
        if (newVal !== oldVal) labels.push(label);
      }
      if (labels.length) {
        await syncBiodataKeMail(data.wa as string, String(row.nama_lengkap || row.nama || 'KANDIDAT'), labels, sessionToken);
      }
    } catch { /* sync mail is best-effort */ }
    return { success: true };
  } catch (e: unknown) {
    const msg = String(e instanceof Error ? e.message : e);
    if (msg.includes('412') || msg.includes('Precondition')) {
      return { success: false, error: 'Data telah diubah oleh pengguna lain. Silakan segarkan halaman.', conflict: true };
    }
    return { success: false, error: safeError('Gagal update kandidat.', e) };
  }
}

export async function handleGetCandidatesPage(payload: unknown[], sessionToken?: string) {
  const guard = requireAdmin(sessionToken || '');
  if (guard.error) return guard.error;
  const opts = ((payload && payload[0]) || {}) as Record<string, unknown>;
  try {
    const { candidates, total } = await getCandidatesPageRepo({
      q: (opts.q || '') as string,
      page: Number(opts.page) || 1,
      pageSize: Number(opts.pageSize) || 50,
    });
    return { success: true, candidates, total };
  } catch (e: unknown) {
    return { success: false, error: safeError('Gagal memuat kandidat.', e) };
  }
}
