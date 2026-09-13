/**
 * contexts/scheduling/service.ts — Business logic for schedules + tasks
 *
 * Other contexts and surfaces import ONLY from index.ts.
 */
import { requireRole } from '../identity';
import * as fcm from '../../_lib/fcm-server';
import { log } from '../../_lib/kernel/log';
import { safeError } from '../../_lib/kernel/errors';
import { normalizeWa } from '../../shared/wa-rules';
import {
  insertSchedule,
  findScheduleById,
  deleteScheduleById,
  insertTask,
  findTaskById,
  updateTaskStatus,
  deleteTaskById,
  getActiveSchedules,
  markReminderSent,
  getFcmTokensForWaList,
  toText,
} from './repository';

export async function handleSimpanJadwalBaru(payload: any[], sessionToken?: string) {
  const guard = requireRole(sessionToken || '', 'admin');
  if (guard.error) return guard.error;
  const d = (payload && payload[0]) || {};
  if (!d.nama) return { success: false, error: 'Nama agenda wajib diisi.' };
  const idJadwal = 'JDW' + Date.now();
  try {
    await insertSchedule({
      id_jadwal: idJadwal,
      nama_agenda: String(d.nama),
      id_loker_terkait: String(d.loker || '-'),
      tanggal_waktu: String(d.waktu || ''),
      lokasi_link: String(d.link || d.lokasi || '-'),
      daftar_kandidat: String(d.kandidat || '-'),
      tsk: String(d.tsk || ''),
      status_jadwal: 'AKTIF',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    return {
      success: true,
      schedule: {
        idJadwal,
        namaAgenda: String(d.nama),
        idLoker: String(d.loker || '-'),
        waktu: String(d.waktu || ''),
        link: String(d.link || d.lokasi || '-'),
        kandidat: String(d.kandidat || '-'),
        tsk: String(d.tsk || ''),
      },
    };
  } catch (e: any) {
    return { success: false, error: safeError('Gagal simpan jadwal.', e) };
  }
}

export async function handleHapusJadwal(payload: any[], sessionToken?: string) {
  const guard = requireRole(sessionToken || '', 'admin');
  if (guard.error) return guard.error;
  const id = String((payload && payload[0]) || '');
  if (!id) return { success: false, error: 'ID jadwal tidak ditemukan.' };
  try {
    const row = await findScheduleById(id);
    if (!row || row.id === undefined || row.id === null) {
      return { success: false, error: 'Jadwal tidak ditemukan.' };
    }
    await deleteScheduleById(row.id);
    return { success: true, id };
  } catch (e: any) {
    return { success: false, error: safeError('Gagal hapus jadwal.', e) };
  }
}

export async function handleTambahTugasBaru(payload: any[], sessionToken?: string) {
  const guard = requireRole(sessionToken || '', 'admin');
  if (guard.error) return guard.error;
  const nama = String((payload && payload[0]) || '').trim();
  const admin = String((payload && payload[1]) || '');
  if (!nama) return { success: false, error: 'Nama tugas wajib diisi.' };
  const idTugas = 'TGS' + Date.now();
  const waktuDibuat = new Date().toISOString();
  try {
    await insertTask({
      id_tugas: idTugas,
      nama_tugas: nama,
      dibuat_oleh: admin,
      waktu_dibuat: waktuDibuat,
      status: 'BARU',
      created_at: waktuDibuat,
      updated_at: waktuDibuat,
    });
    return {
      success: true,
      tugas: { id: idTugas, task: nama, status: 'BARU', dibuatOleh: admin, waktuDibuat },
    };
  } catch (e: any) {
    return { success: false, error: safeError('Gagal tambah tugas.', e) };
  }
}

export async function handleSetTugasStatus(payload: any[], sessionToken?: string) {
  const guard = requireRole(sessionToken || '', 'admin');
  if (guard.error) return guard.error;
  const id = String((payload && payload[0]) || '');
  const st = String((payload && payload[1]) || '');
  if (!id || !st) return { success: false, error: 'Data tidak lengkap.' };
  try {
    const row = await findTaskById(id);
    if (!row || row.id === undefined || row.id === null) {
      return { success: false, error: 'Tugas tidak ditemukan.' };
    }
    const body: Record<string, any> = { status: st, updated_at: new Date().toISOString() };
    if (st === 'SELESAI') body.waktu_selesai = new Date().toISOString();
    await updateTaskStatus(row.id, body);
    return {
      success: true,
      tugas: {
        id: String(row.id_tugas || row.id || ''),
        task: toText(row.nama_tugas || ''),
        status: st,
        dibuatOleh: toText(row.dibuat_oleh || ''),
        waktuDibuat: toText(row.waktu_dibuat || ''),
      },
    };
  } catch (e: any) {
    return { success: false, error: safeError('Gagal update status tugas.', e) };
  }
}

export async function handleHapusTugas(payload: any[], sessionToken?: string) {
  const guard = requireRole(sessionToken || '', 'admin');
  if (guard.error) return guard.error;
  const id = String((payload && payload[0]) || '');
  if (!id) return { success: false, error: 'ID tugas tidak ditemukan.' };
  try {
    const row = await findTaskById(id);
    if (!row || row.id === undefined || row.id === null) {
      return { success: false, error: 'Tugas tidak ditemukan.' };
    }
    await deleteTaskById(row.id);
    return { success: true, id };
  } catch (e: any) {
    return { success: false, error: safeError('Gagal hapus tugas.', e) };
  }
}

// === CHECK & SEND AGENDA REMINDERS (MULTI-LEVEL) ===
function parseTime(waktu: string): number {
  if (!waktu) return 0;
  try {
    if (waktu.includes('/')) {
      const [datePart, timePart] = waktu.split(' ');
      const [dd, mm, yyyy] = datePart.split('/');
      const [hh, mi] = (timePart || '00:00').split(':');
      return new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(mi)).getTime();
    }
    return new Date(waktu).getTime();
  } catch {
    return 0;
  }
}

function parseWaList(raw: string): string[] {
  // P38 fix: pakai normalizeWa dari shared/wa-rules (080/090/070/81 dan
  // format Indonesia) — parser lokal lama membuang nomor Jepang diam-diam
  // sehingga daftar kosong membuat jadwal di-skip tanpa sinyal.
  return String(raw || '')
    .split(/[\n,;]+/)
    .map((x) => normalizeWa(x.replace(/\D/g, '')))
    .filter(Boolean);
}
export async function handleCheckAndSendAgendaReminders(
  sessionToken?: string,
  opts?: { internal?: boolean },
) {
  // C3 fix (2026-09-04): this reads schedule WA lists and sends FCM pushes —
  // admin only over HTTP.
  //
  // internal=true is the cron path, and it is what the parenthetical here always
  // anticipated ("call this context code directly from the scheduled function,
  // not through the HTTP surface"): `agenda-reminders.ts` has no session to
  // present, so it calls this function directly and declares itself trusted.
  // Same shape as handleKirimSatuPesanFonnte / handleKirimTawaranMassal in
  // contexts/notifications/service.ts. The HTTP surface (surfaces/schedule.ts)
  // passes no opts, so a caller cannot opt itself out of the guard from outside.
  if (!opts?.internal) {
    const guard = requireRole(sessionToken || '', 'admin');
    if (guard.error) return guard.error;
  }
  let sent = 0;
  let errors = 0;
  try {
    const now = Date.now();
    const schedules = await getActiveSchedules();
    if (schedules.length === 0) {
      return { success: true, sent: 0, checked: 0 };
    }

    const WINDOWS = [
      { key: 'h7', field: 'reminder_h7_sent', minMs: 6 * 86400000, maxMs: 8 * 86400000, label: '7 hari' },
      { key: 'h1', field: 'reminder_h1_sent', minMs: 20 * 3600000, maxMs: 28 * 3600000, label: 'besok' },
      { key: 'h0', field: 'reminder_sent', minMs: 0, maxMs: 60 * 60000, label: 'mulai' },
    ];

    const sendToWaList = async (waList: string[], title: string, body: string) => {
      if (waList.length === 0) return;
      let allTokens = await getFcmTokensForWaList(waList);
      if (allTokens.length === 0) {
        // Fallback: per-WA query
        for (const wa of waList) {
          try {
            const { supabaseJson } = await import('./repository');
            // Phase D follow-up (2026-09-13): was `{ rows: tokens }` — the
            // helper returns the array itself, so the fallback never resolved
            // a token either. Third instance of the same defect.
            const tokens = await supabaseJson('GET', 'fcm_tokens', {
              query: { select: 'token', wa: 'eq.' + wa, limit: 5 },
            });
            if (Array.isArray(tokens) && tokens.length > 0) {
              const tokenList = tokens.map((t: any) => t.token).filter(Boolean);
              if (tokenList.length > 0) {
                await fcm.sendMulticast(tokenList, title, body, '/');
                sent++;
              }
            }
          } catch { errors++; }
        }
        return;
      }
      try {
        await fcm.sendMulticast(allTokens, title, body, '/');
        sent++;
      } catch { errors++; }
    };

    for (const s of schedules) {
      const schedTime = parseTime(s.tanggal_waktu);
      if (!schedTime || isNaN(schedTime)) continue;
      const diffMs = schedTime - now;
      const agenda = s.nama_agenda || 'Jadwal';
      const lokasi = s.lokasi_link || '';
      const waList = parseWaList(s.daftar_kandidat);
      if (waList.length === 0) continue;

      for (const w of WINDOWS) {
        if (s[w.field] === true || s[w.field] === 'true') continue;
        if (diffMs < w.minMs || diffMs > w.maxMs) continue;

        let title: string, body: string;
        if (w.key === 'h0') {
          const mins = Math.round(diffMs / 60000);
          title = '⏰ ' + agenda;
          body = agenda + (mins > 0 ? ' dalam ' + mins + ' menit' : ' dimulai sekarang') + (lokasi ? ' di ' + lokasi : '');
        } else if (w.key === 'h1') {
          title = '📅 Jadwal besok: ' + agenda;
          body = agenda + ' dijadwalkan besok' + (lokasi ? ' di ' + lokasi : '');
        } else {
          title = '📅 Jadwal 7 hari lagi: ' + agenda;
          body = agenda + ' dijadwalkan 7 hari lagi' + (lokasi ? ' di ' + lokasi : '');
        }

        // P29 fix: tandai flag SEBELUM kirim — kalau PATCH flag gagal terus,
        // reminder yang sama terkirim ulang tiap 2 menit selama window aktif
        // (spam push). Gagal flag = lewati kirim, log error-nya.
        try {
          const schedId = s.id || s.id_jadwal;
          if (schedId) await markReminderSent(schedId, w.field);
        } catch (err) {
          log.error('schedule.reminder-flag-failed', { err: String(err) });
          continue;
        }
        await sendToWaList(waList, title, body);
      }
    }
    return { success: true, sent, errors, checked: schedules.length };
  } catch (e: any) {
    return { success: false, error: safeError('Gagal check reminders.', e) };
  }
}
