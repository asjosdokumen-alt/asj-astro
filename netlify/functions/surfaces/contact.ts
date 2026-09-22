/**
 * surfaces/contact.ts — Public contact-form surface
 *
 * Handles: kirimPesanKontak
 *
 * Auth: NONE, deliberately. This is the one surface a visitor reaches before
 * they have any account — that is the entire purpose of a company contact form.
 * The safety work therefore lives in the handler (input guards, a length bound,
 * a honeypot and per-number rate limiting), not in a session check. See
 * `contexts/contact/service.ts` for the reasoning, written where the defences
 * are rather than here.
 *
 * WHY `makeSurfaceHandler` RATHER THAN THE CACHED PUBLIC SURFACE. `public.js`
 * answers with CDN cache headers and a 60-second shared cache, which is correct
 * for a job board and catastrophic for a write: a cached 200 would tell the
 * second visitor their message was received without storing it. This action is
 * therefore kept out of `PUBLIC_ACTIONS` and given no cache headers.
 */
import * as contact from '../contexts/contact';

export const CONTACT_ACTIONS: Record<string, (payload: unknown[], sessionToken?: string) => Promise<unknown>> = {
  kirimPesanKontak: (payload) => contact.handleKirimPesanKontak(payload),
};
