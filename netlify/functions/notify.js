
/**
 * notify.js — Notification surface entry point
 *
 * Handles: simpanWaTemplate, hapusWaTemplate, kirimSatuPesanFonnte, kirimTawaranMassal
 */
import { adapt } from './_lib/netlify-adapter.js';
import { makeSurfaceHandler } from './_lib/netlify-wrapper-surface.js';
import { NOTIFY_ACTIONS } from './surfaces/notify.js';
// getJobStatus is owned by the ai surface in the router but is routed here by
// src/lib/apiEndpoint.ts — compose both so wire behaviour is unchanged.
import { AI_ACTIONS } from './surfaces/ai.js';
export default adapt(makeSurfaceHandler([NOTIFY_ACTIONS, AI_ACTIONS], [
  'simpanWaTemplate', 'hapusWaTemplate', 'kirimSatuPesanFonnte', 'kirimTawaranMassal', 'getJobStatus',
]));
