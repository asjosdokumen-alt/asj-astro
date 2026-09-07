import crypto from 'crypto';
import { env } from './env';
// session.js — token sesi bertanda tangan (HMAC-SHA256).
//
// Pengganti "createSession" di auth.ts asli. Token { role, wa?, name? }
// ditandatangani dengan secret dari env; semua aksi admin/kandidat
// memvalidasinya kembali. Tidak ada penyimpanan status server-side.

export interface SessionPayload { role?: string; wa?: string; name?: string; kind?: string; exp?: number }

/** Memoized secret — computed once per process lifetime. */
let _secret: string | null = null;

/** @returns {string} */
function secret(): string {
  if (_secret) return _secret;

  // S3 fix: Only use SESSION_SECRET — never fall back to admin passwords.
  // Passwords are for authentication, not for token signing.
  const s = env('SESSION_SECRET') || '';

  if (s) {
    _secret = s;
    return s;
  }

  // Production: throw — no forged tokens allowed.
  const isProd =
    process.env.NETLIFY === 'true' ||
    process.env.CONTEXT === 'production' ||
    process.env.NODE_ENV === 'production';

  if (isProd) {
    throw new Error(
      'SESSION_SECRET is not set. ' +
      'Token signing is impossible — refusing to start with a guessable secret. ' +
      'Set SESSION_SECRET in your environment variables.'
    );
  }

  // Local dev fallback: use a random ephemeral secret for the process lifetime
  // so tokens from a previous dev session don't carry over.
  console.warn(
    '[session] ⚠️  No SESSION_SECRET set — using random ephemeral secret. ' +
    'Admin tokens will NOT survive a server restart. Set SESSION_SECRET in .env.local.'
  );
  _secret = crypto.randomBytes(32).toString('hex');
  return _secret;
}

/** @param {SessionPayload} payload @returns {string} */
function signToken(payload: SessionPayload): string {
  // S2 fix: Add expiry if not already set (24 hours for session tokens)
  const tokenPayload = { ...payload };
  if (!tokenPayload.exp && tokenPayload.kind !== 'refresh') {
    // Session tokens expire in 24 hours
    tokenPayload.exp = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
  } else if (!tokenPayload.exp && tokenPayload.kind === 'refresh') {
    // Refresh tokens expire in 7 days
    tokenPayload.exp = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
  }
  const body = Buffer.from(JSON.stringify(tokenPayload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return body + '.' + sig;
}

/** @param {string} token @returns {SessionPayload | null} */
function verifyToken(token: unknown): SessionPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expect = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    // S2 fix: token WAJIB punya exp numerik — tanpa claim exp, token lama
    // (atau jalur tanda tangan lain) tidak pernah kedaluwarsa.
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== 'number' || now > payload.exp) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export { signToken, verifyToken };
