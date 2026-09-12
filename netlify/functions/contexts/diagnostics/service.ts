/**
 * contexts/diagnostics/service.ts — Business logic for diagnostics
 */
import { requireAdmin, masterPins } from '../identity';
import { debugFileEnvKeys, debugFileStructure } from '../../_lib/env';
import { buildHealthReport, logHealthReport } from '../../_lib/health';
import {
  getTableInfo, getJobInfo, getCandidateInfo,
  getAdminInfo, getSettingsInfo, hasBackend,
} from './repository';

export async function handleGetAppConfig(_payload: any[], sessionToken?: string) {
  const guard = requireAdmin(sessionToken || '');
  if (guard.error) return guard.error;
  const diag: Record<string, any> = {
    success: true,
    backend: 'netlify-functions-rebuild',
    supabaseConfigured: hasBackend(),
    supabaseUrlFormat: null,
    supabaseReachable: false,
    supabaseError: null,
    adminPinConfigured: masterPins().length > 0,
    fileEnvKeys: debugFileEnvKeys(),
    fileEnvStructure: debugFileStructure(),
    tables: {},
  };
  if (!hasBackend()) return diag;
  const tableInfo = await getTableInfo();
  if (tableInfo) {
    diag.supabaseUrlFormat = tableInfo.urlFormat;
    diag.supabaseReachable = tableInfo.reachable;
    diag.supabaseError = tableInfo.error;
    diag.tables.all = tableInfo.all;
    diag.tables.columns = tableInfo.columns;
  }
  const jobInfo = await getJobInfo();
  diag.tables.jobs = jobInfo.exists;
  if (jobInfo.columns) {
    diag.tables.jobsColumns = jobInfo.columns;
    diag.jobStatusSamples = jobInfo.statusSamples;
    diag.jobStatusAll = jobInfo.statusAll;
  }
  const candInfo = await getCandidateInfo();
  diag.tables.candidates = candInfo.exists;
  if (candInfo.columns) {
    diag.tables.candidatesColumns = candInfo.columns;
    diag.candidatePassSample = candInfo.passwordFormat;
    diag.candidatePassChanged = candInfo.passwordChanged;
  }
  const adminInfo = await getAdminInfo();
  diag.tables.admins = adminInfo.exists;
  if (adminInfo.columns) diag.tables.adminsColumns = adminInfo.columns;
  const settingsInfo = await getSettingsInfo();
  diag.tables.settings = settingsInfo.exists;
  if (settingsInfo.columns) {
    diag.tables.settingsColumns = settingsInfo.columns;
    diag.sysConfigTypes = settingsInfo.configTypes;
  }
  return diag;
}

/**
 * getHealth — Phase C item 12.
 *
 * Reachable ONLY from the /health entry point, which is gated behind a shared
 * secret; it is deliberately absent from surfaces/registry.ts and therefore from
 * bridge-links, so no client action can reach it. The admin guard here is
 * defence in depth for the case where that routing is ever changed by mistake:
 * without it a single wiring edit would turn this into an unauthenticated
 * infrastructure-disclosure endpoint (dependency names, queue depth, error
 * strings, timings).
 *
 * `includeShared: false` is honoured so the caller can ask for the cheap
 * in-process view only.
 */
export async function handleGetHealth(payload: any[], sessionToken?: string) {
  const guard = requireAdmin(sessionToken || '');
  if (guard.error) return guard.error;
  const opts = (payload && typeof payload[0] === 'object' && payload[0]) || {};
  const report = await buildHealthReport({
    includeShared: opts.includeShared !== false,
  });
  logHealthReport(report);
  return { success: true, ...report };
}

/**
 * reportWebVital — telemetri Core Web Vitals dari klien (CLS/FCP/LCP/INP/TTFB).
 *
 * PUBLIK BY DESIGN (tanpa sesi): metrik performa bukan data pengguna, dan
 * menuntut auth justru membuang sampel dari halaman yang paling lambat —
 * tepat saat data itu paling dibutuhkan.
 *
 * KONTRAK PAYLOAD — dua bentuk diterima, dan keduanya memang perlu:
 *   1. `[{ name, value, rating, delta, id, navigationType }]` — bentuk yang
 *      BENAR-BENAR dikirim klien. `callAPI("reportWebVital", [metric])`
 *      membungkus argumen dalam array; ini juga konvensi seluruh handler lain
 *      di repo ini (payload selalu array).
 *   2. `{ name, value, ... }` — bentuk telanjang, untuk pemanggil manual/curl.
 *
 * Sebelum 2026-09-12 handler ini hanya membaca `payload.name`, sehingga bentuk
 * array yang dikirim klien SELALU ditolak `{ success:false, error:'invalid
 * payload' }` — telemetri mati diam-diam, tanpa error yang terlihat di mana
 * pun. Diperbaiki di sini dan bukan di klien, karena klien legacy sudah
 * ter-deploy dan tetap mengirim array.
 */
export function handleReportWebVital(payload: any) {
  const metric = Array.isArray(payload) ? payload[0] : payload;
  if (!metric || !metric.name) return { success: false, error: 'invalid payload' };
  const { name, value, rating, delta, id, navigationType } = metric;
  console.log(
    `[web-vitals] ${rating === 'good' ? '✅' : rating === 'needs-improvement' ? '⚠️' : '❌'} ` +
    `${name}: ${typeof value === 'number' ? value.toFixed(name === 'CLS' ? 4 : 0) : value}ms ` +
    `(${rating}) delta=${delta} nav=${navigationType} id=${id}`,
  );
  return { success: true };
}
