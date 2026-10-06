/**
 * surfaces/diagnostics.ts — Diagnostics surface
 *
 * Handles: getAppConfig, reportWebVital
 * These are low-priority monitoring endpoints.
 */
import { handleGetAppConfig, handleReportWebVital } from '../contexts/diagnostics';

export const DIAGNOSTICS_ACTIONS: Record<string, (payload: unknown[], sessionToken?: string) => Promise<unknown>> = {
  getAppConfig: (p, s) => handleGetAppConfig(p, s),
  reportWebVital: async (p, _s) => handleReportWebVital(p as any),
};
