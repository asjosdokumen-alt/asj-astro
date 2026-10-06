/**
 * surfaces/schedule.ts — Scheduling surface (admin)
 */
import * as scheduling from '../contexts/scheduling';
export const SCHEDULE_ACTIONS: Record<string, (payload: unknown[], sessionToken?: string) => Promise<unknown>> = {
  simpanJadwalBaru: (p, s) => scheduling.handleSimpanJadwalBaru(p, s),
  hapusJadwal: (p, s) => scheduling.handleHapusJadwal(p, s),
  tambahTugasBaru: (p, s) => scheduling.handleTambahTugasBaru(p, s),
  setTugasStatus: (p, s) => scheduling.handleSetTugasStatus(p, s),
  hapusTugas: (p, s) => scheduling.handleHapusTugas(p, s),
  checkAndSendAgendaReminders: (_p, s) => scheduling.handleCheckAndSendAgendaReminders(s),
};
