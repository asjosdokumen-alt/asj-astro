'use strict';
// ingest.js — Standalone wrapper for Smart Ingestion.
// The original actions-ingest stub was removed. This function now returns
// NOT_IMPLEMENTED until a real implementation is provided.

// ingest.js — Standalone wrapper untuk Smart Ingestion.
// HANYA membundel actions-ingest.ts + deps-nya (pdf-parse, xlsx, mammoth).
// Function lain TIDAK perlu membundel library berat ini.
// Dipanggil dari api-client.js: processUploadDoc → 'ingest'

// PR4 (playbook §3.3 "never leak"): pesan generik punya SATU pemilik —
// GENERIC_ERROR_MESSAGE di kernel/errors.ts (via _lib/handlers).
const { GENERIC_ERROR_MESSAGE } = require('./_lib/handlers');

function clientIp(event) {
  const h = (event && event.headers) || {};
  const fwd = h['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return h['client-ip'] || h['x-real-ip'] || null;
}

exports.handler = async (event) => {
  let body = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    /* body non-JSON */
  }

  const { action, payload, sessionToken } = body;

  if (action !== 'processUploadDoc') {
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: false,
        message: 'Action not supported by ingest function: ' + action,
      }),
    };
  }

  let out;
  try {
    // Stub removed — return NOT_IMPLEMENTED.
    out = { success: false, message: 'Fungsi ini belum diimplementasi di backend rebuild.' };
  } catch (e) {
    // PR4 (playbook §3.3 "never leak"): jangan kirim e.message ke klien —
    // detail internal cukup di log server.
    console.error('[ingest] error:', e);
    out = { success: false, message: GENERIC_ERROR_MESSAGE };
  }

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(out),
  };
};
