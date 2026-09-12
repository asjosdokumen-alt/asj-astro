
/**
 * config.js — Configuration surface entry point
 *
 * Handles: updateSysConfig, getRincianPresets, saveRincianPreset, deleteRincianPreset
 */
import { adapt } from './_lib/netlify-adapter.js';
import { makeSurfaceHandler } from './_lib/netlify-wrapper-surface.js';
import { CONFIG_ACTIONS } from './surfaces/config.js';
export default adapt(makeSurfaceHandler(CONFIG_ACTIONS, [
  'updateSysConfig', 'getRincianPresets', 'saveRincianPreset', 'deleteRincianPreset',
]));
