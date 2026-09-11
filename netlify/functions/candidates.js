'use strict';
/**
 * candidates.js — Candidate management surface entry point
 *
 * Handles: getCandidatesPage, updateCatatanKandidat, updateKandidatSuper
 */
const { makeSurfaceHandler } = require('./_lib/netlify-wrapper-surface');
const { CANDIDATE_ACTIONS } = require('./surfaces/candidates');
exports.handler = makeSurfaceHandler(CANDIDATE_ACTIONS, [
  'getCandidatesPage', 'updateCatatanKandidat', 'updateKandidatSuper',
]);
