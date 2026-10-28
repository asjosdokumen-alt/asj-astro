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
 * `isSupabaseConfigured()` therefore answers "are two env strings set", NOT "is
 * there an auth server here" — after the cutover those stopped being the same
 * question. Anything that gates a feature on it is gating on the wrong thing.
 * Tracked as finding B13 in `deliverables/review/perf-bug-review-2026-10-28.md`.
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
 * True when both PUBLIC_ env strings are present.
 *
 * ⚠️ This is a CONFIGURATION check, not a capability check. It returns `true`
 * on a Neon endpoint that has no `/auth/v1`, so it must not be used to decide
 * whether Supabase Auth is available — see the module header.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}
