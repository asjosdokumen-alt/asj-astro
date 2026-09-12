
/**
 * jobs.js — Jobs surface entry point
 *
 * Handles: simpanJobBaru, editLokerFull, ubahStatusJob,
 *          hapusJobData, updateTahapanDbJob, updateDokumenShare,
 *          getShareTokenForJob, tandaiGagalJob
 *
 * `getShareTokenForJob` was missing from this allow-list until 2026-09-12.
 * AdminShareModal calls it (api.secure('getShareTokenForJob', ...)) and
 * src/lib/apiEndpoint.ts routes it HERE, so every call got a 404 from this
 * wrapper and was silently retried onto the bridge-links catch-all. It worked,
 * but the share modal depended on the heaviest function in the repo and paid a
 * wasted round-trip on every open. Same failure class as parseDokumenBiodata.
 */
import { adapt } from './_lib/netlify-adapter.js';
import { makeSurfaceHandler } from './_lib/netlify-wrapper-surface.js';
import { JOB_ACTIONS } from './surfaces/jobs.js';
export default adapt(makeSurfaceHandler(JOB_ACTIONS, [
  'simpanJobBaru', 'editLokerFull', 'ubahStatusJob',
  'hapusJobData', 'updateTahapanDbJob', 'updateDokumenShare',
  'getShareTokenForJob', 'tandaiGagalJob',
]));
