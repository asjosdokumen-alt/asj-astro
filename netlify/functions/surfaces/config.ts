/**
 * surfaces/config.ts — Configuration surface (admin)
 */
import * as configuration from '../contexts/configuration';
export const CONFIG_ACTIONS: Record<string, (payload: unknown[], sessionToken?: string) => Promise<unknown>> = {
  updateSysConfig: (p, s) => configuration.handleUpdateSysConfig(p, s),
  getRincianPresets: (_p, s) => configuration.handleGetRincianPresets(s),
  saveRincianPreset: (p, s) => configuration.handleSaveRincianPreset(p, s),
  deleteRincianPreset: (p, s) => configuration.handleDeleteRincianPreset(p, s),
  // REMOVED: runMigration — schema changes must never be reachable from a POST body.
};
