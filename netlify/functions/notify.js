'use strict';
/**
 * notify.js — Notification surface entry point
 *
 * Handles: simpanWaTemplate, hapusWaTemplate, kirimSatuPesanFonnte, kirimTawaranMassal
 */
const { makeSurfaceHandler } = require('./_lib/netlify-wrapper-surface');
const { NOTIFY_ACTIONS } = require('./surfaces/notify');
// getJobStatus is owned by the ai surface in the router but is routed here by
// src/lib/apiEndpoint.ts — compose both so wire behaviour is unchanged.
const { AI_ACTIONS } = require('./surfaces/ai');
exports.handler = makeSurfaceHandler([NOTIFY_ACTIONS, AI_ACTIONS], [
  'simpanWaTemplate', 'hapusWaTemplate', 'kirimSatuPesanFonnte', 'kirimTawaranMassal', 'getJobStatus',
]);
