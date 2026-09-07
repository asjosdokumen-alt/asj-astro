import * as session from './session';
import * as rateLimit from './kernel/rate-limit';
import { handleShareData, docTypeOf } from '../contexts/catalog';
import { toErrorResponse } from './kernel/errors';
import { log, asyncLocalStorage } from './kernel/log';
import { metrics } from './kernel/metrics';
import { getSurfaceHandler } from '../surfaces/index';
import { supabaseJson } from './db/client';
import { handleGetJobStatus } from './kernel/job-queue';

// Register domain event handlers (side-effect import)
import { initEventHandlers } from './event-handlers';
initEventHandlers();

// ── Types ──────────────────────────────────────────────────────────────────
interface RequestMeta {
  ip?: string;
  [key: string]: unknown;
}

interface HandlerResult {
  success: boolean;
  error?: string;
  message?: string;
  conflict?: boolean;
  rateLimited?: boolean;
  retryAfter?: number;
  [key: string]: unknown;
}

// Rate limit groups — moved from old action-registry.ts
const LOGIN_ACTIONS = new Set([
  'checkAdminMaster', 'checkAdminPersonal', 'refreshAdminSession',
  'refreshKandidatSession', 'loginKandidat', 'daftarKandidat',
]);
const AI_ACTIONS = new Set([
  'processAIChat', 'processSiswaAIChat', 'processAdminAIChat',
  'processAiInterview', 'parseDokumenBiodata', 'processUploadDoc',
  'generateWawancaraModel',
]);
const FONNTE_ACTIONS = new Set(['kirimSatuPesanFonnte', 'kirimTawaranMassal']);

const NOT_IMPLEMENTED =
  'Fungsi ini belum diimplementasi di backend rebuild (repo GitHub hanya berisi frontend).';

function sessionIdentity(sessionToken: string) {
  const t = session.verifyToken(sessionToken);
  if (!t) return null;
  return t.role === 'admin' ? 'admin:' + String(t.name || '') : 'kandidat:' + String(t.wa || '');
}

function rateLimitChecks(action: string, meta: RequestMeta, sessionToken: string) {
  const ip = (meta && meta.ip && String(meta.ip).trim()) || 'anon';
  const ident = sessionIdentity(sessionToken);
  const adminKey = ident && ident.indexOf('admin:') === 0 ? ident : null;

  if (action === 'checkAdminMaster' || action === 'checkAdminPersonal') {
    return [{ key: 'adminLogin:' + ip, opts: { limit: 5, windowMs: 60000, lockoutAfter: 10, lockoutMs: 300000 } }];
  }
  if (action === 'loginKandidat' || action === 'daftarKandidat') {
    return [{ key: 'kandidatLogin:' + ip, opts: { limit: 10, windowMs: 60000, lockoutAfter: 15, lockoutMs: 300000 } }];
  }
  if (AI_ACTIONS.has(action)) {
    return [
      { key: 'ai:' + (ident || ip), opts: { limit: 10, windowMs: 60000 } },
      { key: 'aiGlobal:' + ip, opts: { limit: 60, windowMs: 60000 } },
    ];
  }
  if (FONNTE_ACTIONS.has(action)) {
    return [{ key: 'fonnte:' + (adminKey || ip), opts: { limit: 2, windowMs: 60000 } }];
  }
  if (adminKey) {
    return [{ key: 'adminCrud:' + adminKey, opts: { limit: 120, windowMs: 60000 } }];
  }
  return [];
}

async function handleAction(action: string, payload: unknown[], sessionToken: string, meta: RequestMeta) {
  // The wrapper already sets the ALS context (requestId, action, idempotencyKey, traceparent).
  // Do NOT call runWithContext here — it would overwrite the parent store and drop
  // idempotencyKey/traceparent. Just read requestId from the existing store.
  const requestId = (asyncLocalStorage.getStore() as any)?.requestId || String(Date.now());

  if (action === 'ping') return { statusCode: 200, body: 'pong' };

  const checks = rateLimitChecks(action, meta, sessionToken);
  for (const c of checks) {
    const r = await rateLimit.check(c.key, c.opts);
    if (!r.ok) {
      return { success: false, error: 'Terlalu banyak permintaan. Coba lagi dalam ' + r.retryAfter + ' detik.', rateLimited: true, retryAfter: r.retryAfter };
    }
  }
  log.info('handler.start', { action, ip: meta?.ip });
  const out = await dispatchAction(action, payload, sessionToken);
  log.info('handler.end', { action, success: out?.success });
  if (out && out.success === false && !out.rateLimited && LOGIN_ACTIONS.has(action)) {
    for (const c of checks) {
      // @ts-expect-error JS→TS migration
      if (c.opts.lockoutAfter) await rateLimit.fail(c.key, c.opts);
    }
  }
  metrics.flushMetrics();
  return out;
}

async function dispatchAction(action: string, payload: unknown[], sessionToken: string) {
  // B4 fix: Read idempotencyKey from AsyncLocalStorage context, not globalThis.
  const idempotencyKey = (asyncLocalStorage.getStore() as any)?.idempotencyKey as string | undefined;
  // P35 fix: kunci idempotensi di-scope ke <identitas>|<action>|<key> — klien
  // yang menebak key milik orang lain tidak mendapat result-nya, dan retry
  // dengan action berbeda tidak memakai hasil action lain.
  const idempotencyScope =
    idempotencyKey && isMutatingAction(action)
      ? (sessionIdentity(sessionToken) || 'anon') + '|' + action + '|' + idempotencyKey
      : undefined;
  if (idempotencyScope) {
    try {
      const existing = await supabaseJson('GET', 'idempotency_keys', {
        query: { select: '*', key: 'eq.' + idempotencyScope, limit: '1' },
      }).catch(() => null);
      if (Array.isArray(existing) && existing.length > 0) {
        log.info('idempotency.hit', { action, key: idempotencyKey!.slice(0, 8) });
        return existing[0].result;
      }
    } catch { /* If idempotency table doesn't exist yet, proceed normally */ }
  }

  let result: unknown;
  const stop = metrics.histogram('handler.dispatch', { action });
  const surfaceHandler = await getSurfaceHandler(action);
  if (!surfaceHandler) {
    stop();
    return { success: false, message: NOT_IMPLEMENTED + ' (action: ' + action + ')' };
  }
  try {
    result = await surfaceHandler(payload, sessionToken);
  } catch (err) {
    log.error('surface.error', { action, err: String(err) });
    return toErrorResponse(err);
  }

  if (idempotencyScope && result && (result as HandlerResult).success !== false) {
    try {
      await supabaseJson('POST', 'idempotency_keys', {
        query: { on_conflict: 'key' },
        body: { key: idempotencyScope, result, created_at: new Date().toISOString() },
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      }).catch(() => {});
    } catch { /* Storage failure must not affect the response */ }
  }

  stop();
  return result;
}

function isMutatingAction(action: string): boolean {
  const MUTATING = new Set([
    // Auth
    'daftarKandidat', 'gantiPasswordKandidat', 'loginKandidat',
    // Jobs
    'simpanJobBaru', 'editLokerFull', 'ubahStatusJob',
    'hapusJobData', 'updateTahapanDbJob', 'updateDokumenShare',
    'getShareTokenForJob', 'tandaiGagalJob',
    // Mail
    'reviewForm', 'approveForm', 'rejectForm', 'deleteForm',
    // Candidates
    'updateCatatanKandidat', 'updateKandidatSuper',
    // Notify
    'simpanWaTemplate', 'hapusWaTemplate',
    'kirimSatuPesanFonnte', 'kirimTawaranMassal',
    // Master
    'submitMasterForm',
    // Schedule
    'setTugasStatus', 'hapusJadwal', 'simpanJadwalBaru',
    // Config
    'updateSysConfig',
    // AI
    'processUploadDoc', 'processAiFormSubmit',
    // Docs
    'submitFormPelamar', 'simpanBiodataLengkap',
    'simpanKandidatDanUpload', 'simpanBerkasTahapan', 'simpanRevisiKandidat',
    // Register
    'submitDaftarSiswa',
  ]);
  return MUTATING.has(action);
}

export { handleAction, NOT_IMPLEMENTED };
export { handleShareData, docTypeOf };
