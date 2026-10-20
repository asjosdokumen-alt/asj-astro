/**
 * sync.js — Sync surface entry point (admin)
 *
 * Handles: syncProbe, syncDelta, syncManifest
 *
 * WHY THIS ENTRY POINT EXISTS (2026-10-20)
 * ----------------------------------------
 * The three sync actions exist to keep the admin dashboard from re-pulling the
 * whole `getAppData` payload on every mount. That makes them the HOTTEST path
 * in the app once the local-first store is live — so they get their own small
 * function instead of riding bridge-links, the catch-all that ships every
 * surface and every context. Same hole `parseDokumenBiodata` and
 * `getShareTokenForJob` fell through before: a 404 retried onto the catch-all
 * still answers, so "it works" is not evidence the route is wired.
 *
 * The two allow-lists (this array, and `MUTATING` in _lib/handlers.ts for
 * writes) are hand-maintained — missing one is invisible at runtime.
 */
import { adapt } from './_lib/netlify-adapter.js';
import { makeSurfaceHandler } from './_lib/netlify-wrapper-surface.js';
import { SYNC_ACTIONS } from './surfaces/sync.js';
export default adapt(makeSurfaceHandler(SYNC_ACTIONS, [
  'syncProbe', 'syncDelta', 'syncManifest',
]));
