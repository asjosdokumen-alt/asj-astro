/**
 * contexts/registration/service.ts — Business logic for student registration + form bridges
 *
 * Other contexts and surfaces import ONLY from index.ts.
 */
import { cacheClear } from '../../_lib/cache';
import { safeError } from '../../_lib/kernel/errors';
import { env } from '../../_lib/env';
import * as session from '../../_lib/session';
import { requireRole } from '../identity';
import { getDaftarSiswaBaru, insertSiswaBaru, normalizeGender } from './repository';

function siteBase(): string {
  return (env('NETLIFY_SITE_URL') || 'https://asjportal.netlify.app').replace(/\/$/, '');
}

export async function handleGetDaftarSiswaBaru(payload: any[], sessionToken?: string) {
  // C4/C5 hardening (2026-09-04): the roster of ALL registrants (id, nama,
  // alamat, kelamin) is admin-only — an authenticated kandidat must not be
  // able to enumerate other candidates' PII.
  const t = session.verifyToken(sessionToken || '');
  if (!t || t.role !== 'admin') {
    return { success: false, sessionInvalid: true, message: 'Sesi tidak valid (khusus admin)' };
  }
  try {
    const rows = await getDaftarSiswaBaru();
    const data = rows.map((r: any) => {
      const g = normalizeGender(r.jenis_kelamin || r.gender);
      return {
        id: r.id,
        nama_lengkap: r.nama_lengkap || '',
        alamat_lengkap: r.alamat_lengkap || '',
        jenis_kelamin: g === 'LAKI-LAKI' ? 'L' : g === 'PEREMPUAN' ? 'P' : '',
      };
    });
    return { success: true, data };
  } catch (e: any) {
    return { success: false, error: safeError('Gagal memuat data siswa baru.', e) };
  }
}

export async function handleSubmitDaftarSiswa(payload: unknown) {
  cacheClear();
  const d = (payload || {}) as Record<string, any>;
  const nama = String(d.nama || '').trim();
  if (!nama) return { success: false, message: 'Nama wajib diisi.' };
  try {
    await insertSiswaBaru({
      timestamp: new Date().toISOString(),
      nama_lengkap: nama,
      alamat_email: String(d.email || ''),
      jenis_kelamin: String(d.gender || ''),
      alamat_lengkap: String(d.alamat || ''),
      tempat_tanggal_lahir: String(d.ttl || ''),
      agama: String(d.agama || ''),
      nomor_wa_peserta: String(d.wa_siswa || ''),
      nomor_wa_orangtua: String(d.wa_ortu || ''),
      pendidikan_terakhir: String(d.pendidikan || ''),
      file_ktp: String(d.ktp || ''),
      file_kk: String(d.kk || ''),
      file_ijazah: String(d.ijazah || ''),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    return { success: true };
  } catch (e: any) {
    return { success: false, message: safeError('Gagal mendaftar.', e) };
  }
}

export async function handleGetLinkSiswaBaru() {
  return { url: siteBase() + '/siswa-baru.html', formUrl: siteBase() + '/siswa-baru.html' };
}

export async function handleGenerateFormBridge(payload: any[]) {
  const code = String((payload && payload[0]) || '');
  const bidang = String((payload && payload[1]) || '');
  const wa = String((payload && payload[2]) || '');
  const nama = String((payload && payload[3]) || '');
  const req = String((payload && payload[4]) || '');
  const formUrl =
    siteBase() +
    '/apply-full.html?job=' + encodeURIComponent(code) +
    '&bidang=' + encodeURIComponent(bidang) +
    '&wa=' + encodeURIComponent(wa) +
    '&nama=' + encodeURIComponent(nama) +
    '&req=' + encodeURIComponent(req);
  return { formUrl };
}

export async function handleGenerateLegacyMasterBridge(payload: any[], sessionToken?: string) {
  // Auth hardening (2026-09-04): minting a pre-filled master bridge embeds a
  // candidate's WA + nama — admin-only (legacy WA-link flow).
  const guard = requireRole(sessionToken || '', 'admin');
  if (guard.error) return guard.error;
  const wa = String((payload && payload[0]) || '');
  const nama = String((payload && payload[1]) || '');
  const formUrl =
    siteBase() + '/master-full.html?wa=' + encodeURIComponent(wa) + '&nama=' + encodeURIComponent(nama);
  return { formUrl };
}

export async function handleGenerateAiFormBridge(payload: any[], sessionToken?: string) {
  // Auth hardening (2026-09-04): minting a pre-filled AI-form bridge embeds a
  // candidate's WA + nama — admin-only.
  const guard = requireRole(sessionToken || '', 'admin');
  if (guard.error) return guard.error;
  const flow = String((payload && payload[0]) || '');
  const job = String((payload && payload[1]) || '');
  const bidang = String((payload && payload[2]) || '');
  const wa = String((payload && payload[3]) || '');
  const nama = String((payload && payload[4]) || '');
  const formUrl =
    siteBase() +
    '/ai_form.html?flow=' + encodeURIComponent(flow) +
    '&job=' + encodeURIComponent(job) +
    '&bidang=' + encodeURIComponent(bidang) +
    '&wa=' + encodeURIComponent(wa) +
    '&nama=' + encodeURIComponent(nama);
  return { formUrl };
}
