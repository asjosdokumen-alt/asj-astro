/**
 * share-data.js — GET endpoint for the public TSK candidate viewer.
 *
 * The share view page (share.astro / legacy share.html) fetches
 * '/.netlify/functions/share-data?job=KODE' (GET, not a POST action).
 * Netlify maps /.netlify/functions/share-data to this file.
 *
 * A15 parity fix (2026-09-05): this file used to be a NOT_IMPLEMENTED stub
 * ("Fungsi ini belum diimplementasi di backend rebuild"), so the whole
 * share-card flow produced an error page — the modal's "Buka Share View"
 * never showed candidates. The real implementation (guard-less public read,
 * job lookup + candidate docs) lives in contexts/catalog service
 * handleShareData and is re-exported by _lib/handlers. This endpoint now
 * delegates to it (same contract as the previous generation build).
 *
 * Public by job code, exactly as legacy: `share.html?job=KODE`, no account and
 * no token. A per-job token gate was added during the rebuild (2026-09-05) and
 * removed on 2026-09-13 — the TSK are outside parties with no accounts, and a
 * link they can simply pass on is the whole point of the feature. See the
 * trade-off note on `handleShareData` in contexts/catalog/service.ts.
 */
// PR4 (playbook §3.3 "never leak") + satu pemilik pesan generik:
// GENERIC_ERROR_MESSAGE di kernel/errors.ts, diekspor via _lib/handlers.
import { adapt } from './_lib/netlify-adapter.js';
import { GENERIC_ERROR_MESSAGE } from './_lib/handlers.js';
// `handleShareData` diimpor LANGSUNG dari konteksnya, bukan lewat
// `_lib/handlers`. Re-export lewat handlers membuat setiap entry point ikut
// menarik `contexts/catalog` (bcryptjs + demo); hanya endpoint inilah yang
// benar-benar memakainya.
import { handleShareData } from './contexts/catalog/index.js';

async function handler(event) {
  const p = (event.queryStringParameters) || {};
  const job = p.job || '';
  // M-6: the viewer is same-origin (ShareView.tsx fetches
  // `/.netlify/functions/share-data`), so a wildcard CORS header buys nothing
  // and lets any site read a candidate list by job code. Reflect the request's
  // own host/scheme instead — a third-party origin will not match it.
  const headers = (event && event.headers) || {};
  const host = String(headers.host || headers.Host || '').split(',')[0].trim();
  const proto = String(headers['x-forwarded-proto'] || headers['X-Forwarded-Proto'] || 'https')
    .split(',')[0]
    .trim();
  const ownOrigin = host ? proto + '://' + host : 'https://amanahsakura.netlify.app';
  let out;
  try {
    out = await handleShareData(job);
  } catch (e) {
    // PR4 (playbook §3.3 "never leak"): jangan kirim e.message ke klien —
    // detail internal cukup di log server.
    console.error('[share-data] error:', e);
    out = { error: GENERIC_ERROR_MESSAGE };
  }
  return {
    statusCode: out.error ? 400 : 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': ownOrigin,
      Vary: 'Origin',
    },
    body: JSON.stringify(out),
  };
}

export default adapt(handler);
