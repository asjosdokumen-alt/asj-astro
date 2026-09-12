
/**
 * diagnostics.js — Diagnostics surface entry point
 *
 * Handles: getAppConfig, reportWebVital
 *
 * WHY THIS ENTRY POINT EXISTS (2026-09-12)
 * ----------------------------------------
 * Before this file, `surfaces/diagnostics.ts` had no entry point of its own, so
 * both actions were reachable ONLY through bridge-links — the catch-all that
 * ships the full action router (all 15 surfaces + 14 contexts). Two different
 * problems came from that:
 *
 *   - `reportWebVital` is called by the DEPLOYED legacy client on every page
 *     view (`callAPI("reportWebVital", [metric])`, skipped only on localhost).
 *     So the heaviest function in the repo sat on the hot path of ordinary
 *     browsing, for a console.log.
 *   - `getAppConfig` is admin-gated diagnostics. Reaching it through the
 *     catch-all meant the only thing standing between it and the internet was
 *     the admin check inside the handler. Routing it here narrows the exposure
 *     to exactly one function instead of "wherever the catch-all is mounted".
 *
 * This is the same hole `parseDokumenBiodata` fell through and the same one
 * `getShareTokenForJob` was falling through via a 404 retry. It is now a gate
 * failure, not a discovery: scripts/ci/surface-binding.mjs fails the build if
 * any router action has no narrow entry point.
 *
 * Both actions are cheap and unrelated to each other, but they share the
 * diagnostics context, so one small function is the right granularity — no
 * reason to pay a second cold start.
 */
import { adapt } from './_lib/netlify-adapter.js';
import { makeSurfaceHandler } from './_lib/netlify-wrapper-surface.js';
import { DIAGNOSTICS_ACTIONS } from './surfaces/diagnostics.js';
export default adapt(makeSurfaceHandler(DIAGNOSTICS_ACTIONS, [
  'getAppConfig', 'reportWebVital',
]));
