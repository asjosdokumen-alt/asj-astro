'use strict';
/**
 * config.js — Configuration surface entry point
 *
 * Handles: updateSysConfig, getRincianPresets, saveRincianPreset, deleteRincianPreset
 */
const { makeSurfaceHandler } = require('./_lib/netlify-wrapper-surface');
const { CONFIG_ACTIONS } = require('./surfaces/config');
exports.handler = makeSurfaceHandler(CONFIG_ACTIONS, [
  'updateSysConfig', 'getRincianPresets', 'saveRincianPreset', 'deleteRincianPreset',
]);
