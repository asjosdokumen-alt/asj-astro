
/**
 * public.js — Public data surface entry point
 *
 * Handles: getAppData, getMonthlyReport
 *
 * High-traffic read-only surface with CDN cache headers.
 * Separate function allows independent scaling for public traffic spikes.
 */
import { adapt } from './_lib/netlify-adapter.js';
import { makeSurfaceHandler } from './_lib/netlify-wrapper-surface.js';
import { PUBLIC_ACTIONS } from './surfaces/public.js';
export default adapt(makeSurfaceHandler(PUBLIC_ACTIONS, [
  'getAppData', 'getMonthlyReport',
]));
