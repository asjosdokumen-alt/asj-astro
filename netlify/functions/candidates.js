
/**
 * candidates.js — Candidate management surface entry point
 *
 * Handles: getCandidatesPage, updateCatatanKandidat, updateKandidatSuper
 */
import { adapt } from './_lib/netlify-adapter.js';
import { makeSurfaceHandler } from './_lib/netlify-wrapper-surface.js';
import { CANDIDATE_ACTIONS } from './surfaces/candidates.js';
export default adapt(makeSurfaceHandler(CANDIDATE_ACTIONS, [
  'getCandidatesPage', 'updateCatatanKandidat', 'updateKandidatSuper',
]));
