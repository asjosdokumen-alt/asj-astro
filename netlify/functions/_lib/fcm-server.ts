import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// =============================================================================
// fcm-server.js — Helper untuk mengirim Push Notification via FCM HTTP v1 API
// =============================================================================

// Cache token untuk performa
let _oauthToken: string | null = null;
let _tokenExpiry = 0;

// ── Where the service account comes from ─────────────────────────────────────
//
// HISTORY. This module originally read `process.env.FIREBASE_SERVICE_ACCOUNT`
// directly. That worked, but the value is a ~2.4 KB JSON blob and AWS Lambda
// compatibility mode caps the TOTAL environment at 4 KB per function — one
// variable was consuming 59 % of the entire budget and the deploy died at
// function creation ("environment variables exceed the 4KB limit"). See
// docs/HANDOFF_4KB_ENV_LIMIT.md.
//
// The service account is therefore loaded from a FILE bundled with the
// function via `included_files` in netlify.toml. It is a credential inside the
// deploy artifact, which is a deliberate, owner-approved trade-off: the repo is
// private, the artifact is private to the Netlify account, and it buys back
// 2.4 KB of a 4 KB hard limit.
//
// The env var is still honoured as a FALLBACK so an existing deployment keeps
// working during transition, and so local `netlify dev` can keep using
// .env.local. Precedence is file-first, then env — the opposite of the usual
// order on purpose: the file is the intended production source.
//
// PATH RESOLUTION. `included_files` preserves the repo-relative layout of what
// it bundles, so the file lands at `<some root>/netlify/functions/secrets/…`.
// Which root depends on the context: the repo root under `netlify dev` and
// vitest, but the function's own stage directory when bundled (the same reason
// `_lib/env.ts` walks upward to find `.env.local`). So rather than trusting a
// single `process.cwd()`, walk up from cwd AND from this module's own location,
// which is what makes the lookup work in BOTH contexts.
function candidatePaths(): string[] {
  const rel = ['netlify', 'functions', 'secrets', 'firebase-service-account.json'];
  const out: string[] = [];

  // (a) Walk up from cwd — mirrors env.ts's findEnvFile().
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    out.push(path.join(dir, ...rel));
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // (b) Walk up from this file (…/netlify/functions/_lib/fcm-server.ts).
  //     In a bundle __filename-relative resolution is what survives, and the
  //     target sits two levels up from _lib/.
  try {
    const here = typeof __dirname !== 'undefined' ? __dirname : '';
    if (here) {
      let d = here;
      for (let i = 0; i < 4; i++) {
        out.push(path.join(d, 'secrets', 'firebase-service-account.json'));
        d = path.dirname(d);
      }
    }
  } catch {
    /* __dirname unavailable in a pure-ESM context — cwd candidates suffice */
  }

  return [...new Set(out)];
}

let _serviceAccount: { client_email: string; private_key: string; project_id: string } | null =
  null;
let _serviceAccountResolved = false;

function loadServiceAccount() {
  if (_serviceAccountResolved) return _serviceAccount;
  _serviceAccountResolved = true;

  // 1. Bundled file (production + any context where included_files applies).
  for (const candidate of candidatePaths()) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8'));
      if (parsed && parsed.client_email && parsed.private_key) {
        _serviceAccount = normaliseKey(parsed);
        return _serviceAccount;
      }
      console.error(
        '[FCM] service-account file found at ' +
          candidate +
          ' but missing client_email/private_key',
      );
    } catch (e) {
      console.error('[FCM] Error reading service account at ' + candidate + ':', (e as Error).message);
    }
  }

  // 2. Env var fallback (transition + local dev).
  const envRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!envRaw) return null;
  try {
    const parsed = JSON.parse(envRaw);
    _serviceAccount = normaliseKey(parsed);
    return _serviceAccount;
  } catch {
    console.error('[FCM] Error parse FIREBASE_SERVICE_ACCOUNT');
    return null;
  }
}

// Fix double-escaped newlines in private_key (freebuff-env bug), which also
// occurs when the JSON was transported through a file.
function normaliseKey(parsed: { private_key?: string }) {
  if (parsed && parsed.private_key && parsed.private_key.includes('\\n')) {
    parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
  }
  return parsed as { client_email: string; private_key: string; project_id: string };
}

/**
 * Membuat JWT untuk menukar OAuth2 token dari Google API (tanpa dependency luar).
 */
function getGoogleAuthToken(serviceAccount: { client_email: string; private_key: string }) {
  return new Promise((resolve, reject) => {
    if (_oauthToken && Date.now() < _tokenExpiry) {
      return resolve(_oauthToken);
    }

    const header = { alg: 'RS256', typ: 'JWT' };
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + 3600; // 1 jam
    const claim = {
      iss: serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      exp: exp,
      iat: iat,
    };

    const toBase64Url = (obj: unknown) =>
      Buffer.from(JSON.stringify(obj))
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

    const signatureInput = toBase64Url(header) + '.' + toBase64Url(claim);

    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signatureInput);
    const signature = sign
      .sign(serviceAccount.private_key, 'base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    const jwt = signatureInput + '.' + signature;

    const body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }).toString();

    fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body,
      signal: AbortSignal.timeout(10000),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.access_token) {
          _oauthToken = data.access_token;
          _tokenExpiry = Date.now() + (data.expires_in - 300) * 1000;
          resolve(_oauthToken);
        } else {
          reject(new Error('Gagal mendapatkan token: ' + JSON.stringify(data)));
        }
      })
      .catch(reject);
  });
}

/**
 * Mengirim Notifikasi via Firebase Cloud Messaging HTTP v1 API.
 * @param {string} token - FCM Token device tujuan
 * @param {string} title - Judul notifikasi
 * @param {string} body - Isi notifikasi
 * @param {string} url - URL tujuan saat notifikasi di-klik (opsional)
 */
async function sendPushNotification(token: string, title: string, body: string, url = '/') {
  const serviceAccount = loadServiceAccount();
  if (!serviceAccount) return false;

  try {
    const accessToken = await getGoogleAuthToken(serviceAccount);
    const projectId = serviceAccount.project_id;

    const payload = buildPushPayload(token, title, body, url);

    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error('[FCM] Send Error:', data);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[FCM] Catch Error:', (e as Error).message);
    return false;
  }
}

/**
 * Mengirim notifikasi ke daftar token. Token yang tidak valid akan di-return
 * agar bisa dihapus dari database.
 */
async function sendMulticast(tokens: string[], title: string, body: string, url = '/') {
  const invalidTokens: string[] = [];
  const unique = Array.from(new Set((tokens || []).filter(Boolean)));
  // P33 fix: kirim paralel per batch 20 (sebelumnya sequential per token —
  // loop >200 token menahan slot fungsi terlalu lama, dan error ditelan
  // diam-diam karena permintaan kehabisan waktu sebelum loop selesai).
  for (let i = 0; i < unique.length; i += 20) {
    const chunk = unique.slice(i, i + 20);
    const results = await Promise.allSettled(
      chunk.map((token) => sendPushNotification(token, title, body, url)),
    );
    results.forEach((r, idx) => {
      // Di API HTTP v1, token tidak valid akan menghasilkan error.
      if (r.status !== 'fulfilled' || !r.value) invalidTokens.push(chunk[idx]);
    });
  }
  return { successCount: unique.length - invalidTokens.length, invalidTokens };
}

export function buildPushPayload(token: string, title: string, body: string, url = '/') {
  return {
    message: {
      token: String(token),
      data: { title: String(title || ''), body: String(body || ''), url: String(url || '/') },
      webpush: { headers: { Urgency: 'high' } },
    },
  };
}

// Exported for tests only. The resolution order here is security-relevant: if a
// credential silently resolves to the wrong source, push notifications fail at
// runtime with no obvious cause. Tests assert the real behaviour rather than a
// no-throw proxy. Not part of the module's public surface — do not call it from
// application code; use sendPushNotification/sendMulticast.
export function __loadServiceAccountForTest(opts?: { reset?: boolean }) {
  if (opts?.reset) {
    _serviceAccount = null;
    _serviceAccountResolved = false;
  }
  return loadServiceAccount();
}

export { sendPushNotification, sendMulticast };
