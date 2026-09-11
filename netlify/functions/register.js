'use strict';
/**
 * register.js — Registration surface entry point
 *
 * Handles: getDaftarSiswaBaru, submitDaftarSiswa, getLinkSiswaBaru,
 *          generateFormBridge, generateLegacyMasterBridge, generateAiFormBridge
 */
const { makeSurfaceHandler } = require('./_lib/netlify-wrapper-surface');
const { REGISTER_ACTIONS } = require('./surfaces/register');
exports.handler = makeSurfaceHandler(REGISTER_ACTIONS, [
  'getDaftarSiswaBaru', 'submitDaftarSiswa', 'getLinkSiswaBaru',
  'generateFormBridge', 'generateLegacyMasterBridge', 'generateAiFormBridge',
]);
