
/**
 * jobs.js — Jobs surface entry point
 *
 * Handles: simpanJobBaru, editLokerFull, ubahStatusJob,
 *          hapusJobData, updateTahapanDbJob, updateDokumenShare,
 *          tandaiGagalJob
 *
 * This allow-list is the ONLY set of actions this wrapper serves. Anything
 * missing here 404s and is silently retried onto the bridge-links catch-all:
 * it still "works", but every call pays a wasted round-trip through the
 * heaviest function in the repo. That happened to parseDokumenBiodata and to
 * getShareTokenForJob (2026-09-12) — both were invisible in production.
 * Keep this list in sync with JOB_ACTIONS in surfaces/jobs.ts.
 *
 * `getShareTokenForJob` itself was retired on 2026-09-13: the share link is
 * public by job code again, exactly as legacy (see handleShareData).
 */
import { adapt } from './_lib/netlify-adapter.js';
import { makeSurfaceHandler } from './_lib/netlify-wrapper-surface.js';
import { JOB_ACTIONS } from './surfaces/jobs.js';
export default adapt(makeSurfaceHandler(JOB_ACTIONS, [
  'simpanJobBaru', 'editLokerFull', 'ubahStatusJob',
  'hapusJobData', 'updateTahapanDbJob', 'updateDokumenShare',
  'tandaiGagalJob',
]));
