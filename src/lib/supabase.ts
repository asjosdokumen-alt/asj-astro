/**
 * supabase.ts — Supabase client singleton
 *
 * Creates a single Supabase client instance shared across the app.
 * Uses Astro PUBLIC_ env vars (exposed to client-side via import.meta.env).
 *
 * ⚠️ READ THIS BEFORE USING `supabase.auth.*` (2026-10-25 cutover).
 *
 * `PUBLIC_SUPABASE_URL` points at the **Neon Data API**
 * (`…apirest.….aws.neon.tech/neondb`), not at a Supabase project. Neon serves
 * PostgREST and nothing else: there is no `/auth/v1`, no Realtime, no Storage on
 * that host. So of the three things this client used to do, only one is real —
 * and even that one is done server-side by `_lib/db/client.ts`, not here.
 *
 *   · Authentication — **dead.** The app's real auth is the custom JWT in
 *     `netlify/functions/_lib/session.ts`; `loginKandidatSupabase()` /
 *     `registerKandidatSupabase()` are not imported by any component, and the
 *     calls they make would 404.
 *   · Realtime — not used.
 *   · Storage — moved to Supabase Storage via `STORAGE_SUPABASE_URL`
 *     (`_lib/db/client.ts:50`), because Neon has no Storage. Uploads do not go
 *     through this client.
 *
 * `isSupabaseConfigured()` used to answer "are two env strings set" — which after
 * the cutover is NOT the same question as "is there an auth server here". It now
 * also rejects a Neon Data API host, so the four call sites (`getFreshToken`,
 * `initializeAuthListener`, `logoutSupabase`, the two login helpers) no longer
 * build a client against a URL that cannot authenticate anyone. Finding B13 in
 * `deliverables/review/perf-bug-review-2026-10-28.md`.
 *
 * Pattern: singleton module export — import { supabase } from '@/lib/supabase'
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.PUBLIC_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    '[Supabase] Missing PUBLIC_SUPABASE_URL or PUBLIC_SUPABASE_ANON_KEY in environment. ' +
    'Auth features will be disabled. Copy .env.example to .env and fill in values.'
  );
}

/**
 * Supabase client — safe to import anywhere.
 * If env vars are missing, client is created with empty strings
 * (API calls will fail gracefully with errors, no crash).
 *
 * On the current deployment the URL is a Neon endpoint, so every `auth.*` call
 * on this client is a 404 — see the module header.
 */
export const supabase: SupabaseClient = createClient(
  SUPABASE_URL || 'https://placeholder.supabase.co',
  SUPABASE_ANON_KEY || 'placeholder-key'
);

/**
 * True when `url` is a Neon Data API endpoint — i.e. a host that serves
 * PostgREST and **no auth server**.
 *
 * Implementasinya tinggal di `./supabaseHost` (modul tanpa impor) supaya
 * `apiClient.ts` bisa memakainya untuk memutuskan apakah klien Supabase perlu
 * diunduh sama sekali — tanpa harus mengimpor modul ini. Diekspor ulang di sini
 * karena ini permukaan yang selama ini dipakai tes.
 */
import { isNeonDataApiHost } from './supabaseHost';
export { isNeonDataApiHost };

/**
 * True when the Supabase client has both a URL and a key **and** that URL can
 * plausibly serve auth.
 *
 * The second half is the fix for B13: after the 2026-10-25 cutover
 * `PUBLIC_SUPABASE_URL` is a Neon endpoint, so "both strings are set" stopped
 * meaning "there is an auth server here". Leaving it out made `getFreshToken()`
 * and `initializeAuthListener()` build a client against a host with no
 * `/auth/v1` — harmless today only because nothing calls the login helpers.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY) && !isNeonDataApiHost(SUPABASE_URL);
}
