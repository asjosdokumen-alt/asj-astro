/// <reference types="astro/client" />

// Hanya variabel PUBLIC_* yang boleh dideklarasikan di sini —
// ImportMetaEnv ini ikut ter-bundle di sisi klien (island).
// Secret server (SUPABASE_SERVICE_ROLE_KEY, SESSION_SECRET, GEMINI_API_KEY,
// ADMIN_PASSWORD, dsb.) hanya dibaca lewat process.env di netlify/functions
// sehingga tidak pernah lolos type-check dari kode klien.
interface ImportMetaEnv {
  readonly PUBLIC_SUPABASE_URL: string;
  readonly PUBLIC_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
