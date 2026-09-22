
/**
 * kontak.js — Public contact-form entry point
 *
 * Handles: kirimPesanKontak
 *
 * Named `kontak`, not `contact`, to match the action name and the table
 * (`database_asj_kontak`) — the repo's public-facing identifiers are Indonesian.
 *
 * Its own entry point rather than a slot in `public.js`, so a burst of contact
 * submissions cannot consume the concurrency of the job-board reads, and so the
 * write never inherits the public surface's 60-second CDN cache.
 */
import { adapt } from './_lib/netlify-adapter.js';
import { makeSurfaceHandler } from './_lib/netlify-wrapper-surface.js';
import { CONTACT_ACTIONS } from './surfaces/contact.js';
export default adapt(makeSurfaceHandler(CONTACT_ACTIONS, [
  'kirimPesanKontak',
]));
