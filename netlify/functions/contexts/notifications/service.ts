/**
 * contexts/notifications/service.ts — Business logic for WA templates + Fonnte messaging
 *
 * Other contexts and surfaces import ONLY from index.ts.
 */
import { env } from '../../_lib/env';
import { requireRole } from '../identity';
import { normalizeWa, upsertWaTemplate, deleteWaTemplate, getWaTemplates } from './repository';

async function fonnteSend(target: string, message: string): Promise<any> {
  const token = env('FONNTE_TOKEN') || env('FONNTE_API_KEY');
  if (!token) throw new Error('FONNTE_TOKEN belum dikonfigurasi');
  const params = new URLSearchParams();
  params.set('target', String(target));
  params.set('message', String(message));
  const res = await fetch('https://api.fonnte.com/send', {
    method: 'POST',
    headers: {
      Authorization: token,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  const text = await res.text();
  if (!res.ok) throw new Error('Fonnte HTTP ' + res.status + ' ' + text.slice(0, 200));
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

function applyTemplatePlaceholders(text: string, nama: string, jobCode: string, linkGrup: string): string {
  return String(text || '')
    .replace(/\{nama\}/g, nama)
    .replace(/<<NAMA>>/gi, nama)
    .replace(/\{job_code\}/g, jobCode)
    .replace(/\{job\}/g, jobCode)
    .replace(/<<JOB>>/gi, jobCode)
    .replace(/\{link_grup\}/g, linkGrup)
    .replace(/\{link\}/g, linkGrup)
    .replace(/<<LINK>>/gi, linkGrup);
}

export function buildPesanTawaranMassal(
  variants: string[],
  templateIsi: string | null,
  nama: string,
  jobCode: string,
  linkGrup: string,
  index: number,
): string {
  if (variants.length) {
    return applyTemplatePlaceholders(variants[index % variants.length], nama, jobCode, linkGrup);
  }
  if (templateIsi) {
    return applyTemplatePlaceholders(templateIsi, nama, jobCode, linkGrup);
  }
  return 'Halo ' + nama + '! Anda terpilih untuk Lowongan ' + jobCode + '. Silakan bergabung ke grup resmi kami: ' + linkGrup;
}

export async function handleSimpanWaTemplate(payload: any[], sessionToken?: string) {
  const guard = requireRole(sessionToken || '', 'admin');
  if (guard.error) return guard.error;
  const id = String((payload && payload[0]) || '');
  const nama = String((payload && payload[1]) || '').trim();
  const isi = String((payload && payload[2]) || '');
  if (!nama) return { success: false, error: 'Nama template wajib diisi.' };
  try {
    await upsertWaTemplate(
      { nama, isi, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      id || undefined,
    );
    return { success: true };
  } catch (e: any) {
    return { success: false, error: 'Gagal simpan template: ' + e.message };
  }
}

export async function handleHapusWaTemplate(payload: any[], sessionToken?: string) {
  const guard = requireRole(sessionToken || '', 'admin');
  if (guard.error) return guard.error;
  const id = String((payload && payload[0]) || '');
  if (!id) return { success: false, error: 'ID template tidak ditemukan.' };
  try {
    await deleteWaTemplate(id);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: 'Gagal hapus template: ' + e.message };
  }
}

export async function handleKirimSatuPesanFonnte(payload: any[], sessionToken?: string) {
  const guard = requireRole(sessionToken || '', 'admin');
  if (guard.error) return guard.error;
  const wa = String((payload && payload[0]) || '');
  const message = String((payload && payload[1]) || '');
  if (!wa || !message) return { success: false, error: 'Nomor WA dan pesan wajib diisi.' };
  try {
    const result = await fonnteSend(normalizeWa(wa), message);
    return { success: true, result };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function handleKirimTawaranMassal(
  payload: any[],
  sessionToken?: string,
  opts?: { internal?: boolean },
) {
  // internal=true dipakai sweep-queue worker (kode server terpercaya yang
  // sudah meng-claim job dari antrean); sesi admin sudah divalidasi di
  // surfaces/notify.ts saat enqueue, jadi token tidak perlu disimpan di
  // payload job. Jalur HTTP langsung tetap wajib sesi admin.
  if (!opts?.internal) {
    const guard = requireRole(sessionToken || '', 'admin');
    if (guard.error) return guard.error;
  }
  const d = (payload && payload[0]) || {};
  const cands = Array.isArray(d.candidates) ? d.candidates : [];
  if (cands.length === 0) return { success: false, error: 'Tidak ada kandidat.' };
  const jobCode = String(d.jobCode || '');
  const linkGrup = String(d.linkGrup || '');
  const interval = Math.max(Number(d.interval) || 5, 1);
  const results: any[] = [];
  const variants = String(d.customMessage || '')
    .split(/^---\s*$/m)
    .map((s) => s.trim())
    .filter(Boolean);
  try {
    let templateIsi: string | null = null;
    try {
      const rows = await getWaTemplates();
      const tpl = rows.find(
        (r: any) =>
          String(r.nama || '').toLowerCase().includes('grup') ||
          String(r.nama || '').toLowerCase().includes('undang'),
      );
      if (tpl) templateIsi = String(tpl.isi || '');
    } catch { /* template opsional */ }

    for (let i = 0; i < cands.length; i += 1) {
      const c = cands[i];
      const wa = normalizeWa(String(c.wa || ''));
      const nama = String(c.nama || 'Kandidat');
      const message = buildPesanTawaranMassal(variants, templateIsi, nama, jobCode, linkGrup, i);
      try {
        await fonnteSend(wa, message);
        results.push({ wa: c.wa, nama, success: true });
      } catch (e: any) {
        results.push({ wa: c.wa, nama, success: false, error: e.message });
      }
      if (interval > 0) await new Promise((r) => setTimeout(r, interval * 1000));
    }
    return { success: true, results };
  } catch (e: any) {
    return { success: false, error: e.message, results };
  }
}
