'use strict';
/**
 * schedule.js — Schedule surface entry point
 *
 * Handles: simpanJadwalBaru, hapusJadwal, tambahTugasBaru,
 *          setTugasStatus, hapusTugas, checkAndSendAgendaReminders
 */
const { makeSurfaceHandler } = require('./_lib/netlify-wrapper-surface');
const { SCHEDULE_ACTIONS } = require('./surfaces/schedule');
exports.handler = makeSurfaceHandler(SCHEDULE_ACTIONS, [
  'simpanJadwalBaru', 'hapusJadwal', 'tambahTugasBaru',
  'setTugasStatus', 'hapusTugas', 'checkAndSendAgendaReminders',
]);
