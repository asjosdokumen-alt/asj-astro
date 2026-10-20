/**
 * contexts/sync/index.ts — Public interface for the sync context
 *
 * Owns: nothing. Reads the four tables migration 017 prepared.
 */
export {
  handleSyncProbe, handleSyncDelta, handleSyncManifest,
} from './service';
export {
  SYNC_TABLES, SYNC_KEYS, SYNC_LIMIT, isSyncKey,
  syncWatermarks, syncRowsSince, syncManifest,
} from './repository';
export type { SyncKey } from './repository';
