/**
 * contexts/scheduling/repository.ts — Database queries for schedules + tasks
 *
 * Owns: database_schedule, database_tugas
 * All DB access goes through kernel/http → supabaseJson
 */
import { supabaseJson, toText } from '../../_lib/db/client';
import { SCHEDULE_REMINDER_COLS } from '../../_lib/db/projections';

/** Insert a new schedule */
export async function insertSchedule(row: Record<string, any>): Promise<void> {
  await supabaseJson('POST', 'database_schedule', {
    body: row,
    headers: { Prefer: 'return=minimal' },
  });
}

/** Find schedule by id_jadwal or id (legacy fallback) */
export async function findScheduleById(id: string): Promise<any | null> {
  // Try id_jadwal first
  try {
    const rows = await supabaseJson('GET', 'database_schedule', {
      query: { select: 'id,id_jadwal', limit: '1', id_jadwal: 'eq.' + id },
    });
    if (Array.isArray(rows) && rows.length) return rows[0];
  } catch { /* kolom id_jadwal mungkin tidak ada di skema legacy */ }
  // Fallback to id
  try {
    const rows = await supabaseJson('GET', 'database_schedule', {
      query: { select: 'id,id_jadwal', limit: '1', id: 'eq.' + id },
    });
    if (Array.isArray(rows) && rows.length) return rows[0];
  } catch { /* id kolom mungkin tidak ada */ }
  return null;
}

/** Delete a schedule by primary key id */
export async function deleteScheduleById(id: number): Promise<void> {
  await supabaseJson('DELETE', 'database_schedule', {
    query: { id: 'eq.' + id },
    headers: { Prefer: 'return=minimal' },
  });
}

/** Insert a new task */
export async function insertTask(row: Record<string, any>): Promise<void> {
  await supabaseJson('POST', 'database_tugas', {
    body: row,
    headers: { Prefer: 'return=minimal' },
  });
}

/** Find task by id_tugas or id (legacy fallback) */
export async function findTaskById(id: string): Promise<any | null> {
  try {
    const rows = await supabaseJson('GET', 'database_tugas', {
      query: { select: 'id,id_tugas,nama_tugas,dibuat_oleh,waktu_dibuat', limit: '1', id_tugas: 'eq.' + id },
    });
    if (Array.isArray(rows) && rows.length) return rows[0];
  } catch { /* kolom id_tugas mungkin tidak ada */ }
  try {
    const rows = await supabaseJson('GET', 'database_tugas', {
      query: { select: 'id,id_tugas,nama_tugas,dibuat_oleh,waktu_dibuat', limit: '1', id: 'eq.' + id },
    });
    if (Array.isArray(rows) && rows.length) return rows[0];
  } catch { /* id kolom mungkin tidak ada */ }
  return null;
}

/** Update task status */
export async function updateTaskStatus(id: number, body: Record<string, any>): Promise<void> {
  await supabaseJson('PATCH', 'database_tugas', {
    query: { id: 'eq.' + id },
    body,
    headers: { Prefer: 'return=minimal' },
  });
}

/** Delete a task by primary key id */
export async function deleteTaskById(id: number): Promise<void> {
  await supabaseJson('DELETE', 'database_tugas', {
    query: { id: 'eq.' + id },
    headers: { Prefer: 'return=minimal' },
  });
}

/**
 * Get active schedules for reminder checking.
 *
 * Phase D follow-up (2026-09-13): this used to destructure `{ rows }` from
 * `supabaseJson()`. That helper resolves the parsed JSON body directly — for a
 * GET list endpoint that is the array itself — so `rows` was always
 * `undefined` and the guard below returned `[]` unconditionally. The function
 * could therefore never report a schedule, which silently disabled
 * `checkAndSendAgendaReminders` (a live admin surface action).
 *
 * Probed against production before changing it: `database_schedule` holds 0
 * rows, so the correction is behaviour-neutral today — the fixed function also
 * returns `[]` until a schedule is created.
 */
export async function getActiveSchedules(): Promise<any[]> {
  const rows = await supabaseJson('GET', 'database_schedule', {
    query: { select: SCHEDULE_REMINDER_COLS, status_jadwal: 'eq.AKTIF', limit: 100 },
  });
  return Array.isArray(rows) ? rows : [];
}

/** Mark a reminder window as sent on a schedule */
export async function markReminderSent(schedId: string, field: string): Promise<void> {
  await supabaseJson('PATCH', 'database_schedule', {
    query: { id: 'eq.' + schedId },
    body: { [field]: true, updated_at: new Date().toISOString() },
    headers: { Prefer: 'return=minimal' },
  });
}

/**
 * Get FCM tokens for a list of WA numbers (batch).
 *
 * Phase D follow-up (2026-09-13): same defect as `getActiveSchedules` above —
 * `{ rows: tokens }` destructured a value that is already the array, so this
 * always returned `[]` and the reminder path could not resolve a single device
 * token. Its only caller is `checkAndSendAgendaReminders`, so the blast radius
 * is confined to a path that has no rows to act on today.
 */
export async function getFcmTokensForWaList(waList: string[]): Promise<string[]> {
  if (waList.length === 0) return [];
  const inList = waList.join(',');
  const rows = await supabaseJson('GET', 'fcm_tokens', {
    query: { select: 'token,wa', wa: 'in.(' + inList + ')', limit: String(waList.length * 5) },
  });
  if (Array.isArray(rows)) {
    return rows.map((t: any) => t.token).filter(Boolean);
  }
  return [];
}

export { toText, supabaseJson };
