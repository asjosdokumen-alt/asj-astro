/**
 * supabase-server.ts — Server-side Supabase Client (Astro SSR)
 *
 * Uses @supabase/ssr for cookie-based auth in Netlify Serverless Functions.
 * Import this ONLY in .astro frontmatter (server-side).
 *
 * Pattern:
 *   import { supabaseServer } from '../lib/supabase-server';
 *   const { data, error } = await supabaseServer(Astro).from('table').select('*');
 */
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AstroGlobal } from 'astro';

/**
 * Create a Supabase client for server-side usage (SSR).
 * Reads auth tokens from cookies set by the client-side Supabase.
 *
 * @param astro - The Astro global object (provides request.cookies)
 * @returns SupabaseClient configured for server-side auth
 */
export function supabaseServer(astro: AstroGlobal): SupabaseClient {
  return createServerClient(
    import.meta.env.PUBLIC_SUPABASE_URL || '',
    import.meta.env.PUBLIC_SUPABASE_ANON_KEY || '',
    {
      cookies: {
        get(name: string) {
          return astro.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: Record<string, unknown>) {
          try {
            astro.cookies.set(name, value, options as any);
          } catch {
            // Cookie setting may fail in some SSR contexts
          }
        },
        remove(name: string, options: Record<string, unknown>) {
          try {
            astro.cookies.set(name, '', { ...options, maxAge: 0 } as any);
          } catch {
            // Ignore
          }
        },
      },
    }
  );
}

/**
 * Create a Supabase client for service-level operations (no user auth needed).
 * Uses the service role key for admin operations.
 */
export function supabaseServiceRole(): SupabaseClient {
  // Secret server dibaca dari process.env (bukan import.meta.env) supaya
  // tidak ada deklarasi ImportMetaEnv server yang ikut ter-bundle/merge ke
  // sisi klien — src/env.d.ts hanya mendeklarasikan PUBLIC_*.
  const url = process.env.PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY tidak terkonfigurasi — fungsi admin tidak bisa dipanggil.');
  }
  return createClient(url, key);
}
