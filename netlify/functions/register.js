
/**
 * register.js — Registration surface entry point
 *
 * Handles: getDaftarSiswaBaru, submitDaftarSiswa, getLinkSiswaBaru,
 *          generateFormBridge, generateLegacyMasterBridge, generateAiFormBridge
 */
import { adapt } from './_lib/netlify-adapter.js';
import { makeSurfaceHandler } from './_lib/netlify-wrapper-surface.js';
import { REGISTER_ACTIONS } from './surfaces/register.js';
export default adapt(makeSurfaceHandler(REGISTER_ACTIONS, [
  'getDaftarSiswaBaru', 'submitDaftarSiswa', 'getLinkSiswaBaru',
  'generateFormBridge', 'generateLegacyMasterBridge', 'generateAiFormBridge',
]));
