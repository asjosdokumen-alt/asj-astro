'use strict';
/**
 * jobs.js — Jobs surface entry point
 *
 * Handles: simpanJobBaru, editLokerFull, ubahStatusJob,
 *          hapusJobData, updateTahapanDbJob, updateDokumenShare, tandaiGagalJob
 */
const { makeSurfaceHandler } = require('./_lib/netlify-wrapper-surface');
const { JOB_ACTIONS } = require('./surfaces/jobs');
exports.handler = makeSurfaceHandler(JOB_ACTIONS, [
  'simpanJobBaru', 'editLokerFull', 'ubahStatusJob',
  'hapusJobData', 'updateTahapanDbJob', 'updateDokumenShare', 'tandaiGagalJob',
]);
