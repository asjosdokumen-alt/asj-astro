
/**
 * get-app-data.js — Public read surface entry point (legacy endpoint name).
 *
 * Phase A: this was a catch-all `makeHandler()` entry point, which meant the
 * HOTTEST path in the system (public job board reads) shipped the full action
 * router — all 15 surfaces and 14 contexts, ~690 KB. It now binds to the
 * public surface's action map only: ~59 KB.
 *
 * Narrowing is safe for first-party clients because src/lib/apiClient.ts falls
 * back to bridge-links on a 404, so an action routed here by mistake still
 * resolves through the catch-all.
 *
 * Kept under the legacy name because the path is referenced by deployed
 * clients; src/lib/apiEndpoint.ts maps getAppData/getMonthlyReport here.
 */
import { adapt } from './_lib/netlify-adapter.js';
import { makeSurfaceHandler } from './_lib/netlify-wrapper-surface.js';
import { PUBLIC_ACTIONS } from './surfaces/public.js';
export default adapt(makeSurfaceHandler(PUBLIC_ACTIONS, [
  'getAppData', 'getMonthlyReport',
]));
