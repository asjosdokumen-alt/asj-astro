
/**
 * schedule.js — Schedule surface entry point
 *
 * Handles: simpanJadwalBaru, hapusJadwal, tambahTugasBaru,
 *          setTugasStatus, hapusTugas, checkAndSendAgendaReminders
 */
import { adapt } from './_lib/netlify-adapter.js';
import { makeSurfaceHandler } from './_lib/netlify-wrapper-surface.js';
import { SCHEDULE_ACTIONS } from './surfaces/schedule.js';
export default adapt(makeSurfaceHandler(SCHEDULE_ACTIONS, [
  'simpanJadwalBaru', 'hapusJadwal', 'tambahTugasBaru',
  'setTugasStatus', 'hapusTugas', 'checkAndSendAgendaReminders',
]));
