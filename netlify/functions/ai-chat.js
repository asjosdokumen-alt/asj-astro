
/**
 * ai-chat.js — AI surface entry point
 *
 * Handles: processAIChat, processSiswaAIChat, processAdminAIChat,
 *          processAiInterview, processUploadDoc,
 *          generateWawancaraModel, simpanHasilWawancara, selesaikanWawancara,
 *          getHasilWawancara, getAdminAiContext, buildAdminAiCandidateSummary,
 *          submitDataAsj, simpanDataTtdNaitei, saveSignature
 *
 * AI requests are slow (5-30s) — separate function prevents blocking other surfaces.
 *
 * `processAiFormSubmit` was removed 2026-09-12: it was a ghost name — no
 * implementation anywhere, never called by src/, and zero occurrences in the
 * legacy codebase it was supposedly carried over from. It only ever produced
 * NOT_IMPLEMENTED. `processUploadDoc` is kept deliberately: it is a legacy
 * compatibility shim that returns a "moved to /ingest" notice rather than a
 * silent failure.
 */
import { adapt } from './_lib/netlify-adapter.js';
import { makeSurfaceHandler } from './_lib/netlify-wrapper-surface.js';
import { AI_ACTIONS } from './surfaces/ai.js';
export default adapt(makeSurfaceHandler(AI_ACTIONS, [
  'processAIChat', 'processSiswaAIChat', 'processAdminAIChat',
  'processAiInterview', 'processUploadDoc',
  'generateWawancaraModel', 'simpanHasilWawancara', 'selesaikanWawancara',
  'getHasilWawancara', 'getAdminAiContext', 'buildAdminAiCandidateSummary',
  'submitDataAsj', 'simpanDataTtdNaitei', 'saveSignature', 'getJobStatus',
]));
