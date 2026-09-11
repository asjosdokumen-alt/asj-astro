'use strict';
/**
 * ai-chat.js — AI surface entry point
 *
 * Handles: processAIChat, processSiswaAIChat, processAdminAIChat,
 *          processAiInterview, processAiFormSubmit, processUploadDoc,
 *          generateWawancaraModel, simpanHasilWawancara, selesaikanWawancara,
 *          getHasilWawancara, getAdminAiContext, buildAdminAiCandidateSummary,
 *          submitDataAsj, simpanDataTtdNaitei, saveSignature
 *
 * AI requests are slow (5-30s) — separate function prevents blocking other surfaces.
 */
const { makeSurfaceHandler } = require('./_lib/netlify-wrapper-surface');
const { AI_ACTIONS } = require('./surfaces/ai');
exports.handler = makeSurfaceHandler(AI_ACTIONS, [
  'processAIChat', 'processSiswaAIChat', 'processAdminAIChat',
  'processAiInterview', 'processAiFormSubmit', 'processUploadDoc',
  'generateWawancaraModel', 'simpanHasilWawancara', 'selesaikanWawancara',
  'getHasilWawancara', 'getAdminAiContext', 'buildAdminAiCandidateSummary',
  'submitDataAsj', 'simpanDataTtdNaitei', 'saveSignature', 'getJobStatus',
]);
