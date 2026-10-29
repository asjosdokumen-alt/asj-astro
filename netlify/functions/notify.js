
/**
 * notify.js — Notification surface entry point
 *
 * Handles: simpanWaTemplate, hapusWaTemplate, kirimSatuPesanFonnte, kirimTawaranMassal
 */
import { adapt } from './_lib/netlify-adapter.js';
import { makeSurfaceHandler } from './_lib/netlify-wrapper-surface.js';
import { NOTIFY_ACTIONS } from './surfaces/notify.js';
// getJobStatus is owned by the ai surface in the router but is routed here by
// src/lib/apiEndpoint.ts — compose it so wire behaviour is unchanged.
//
// 2026-10-29: imported DIRECTLY from its kernel module instead of importing
// `AI_ACTIONS`. The allow-list below already narrows this entry to five actions,
// but `AI_ACTIONS` is one module, so importing it pulled the WHOLE ai surface —
// including the three VIP data banks (`_lib/kotoba`, `_lib/matematika`,
// `_lib/wawancara`, ~2 200 lines) — into a notification function that serves
// none of them. Measured: notify.js 146.7 -> 295.1 KB (+148.4, +101%) purely
// from that import. esbuild inlines dynamic imports, so being `await import()`ed
// inside ai.ts did not keep them out.
import { handleGetJobStatus } from './_lib/kernel/job-queue.js';

/** The ONE action this entry needs from the ai surface. */
const JOB_STATUS_ACTIONS = {
  getJobStatus: async (p, s) => handleGetJobStatus(p, s),
};

export default adapt(makeSurfaceHandler([NOTIFY_ACTIONS, JOB_STATUS_ACTIONS], [
  'simpanWaTemplate', 'hapusWaTemplate', 'kirimSatuPesanFonnte', 'kirimTawaranMassal', 'getJobStatus',
]));
