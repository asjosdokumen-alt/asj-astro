
/**
 * master-data.js — Master data surface entry point
 *
 * Handles: getMasterDataByWa, submitMasterForm, getDrafCvMaster, simpanUpdateMaster
 */
import { adapt } from './_lib/netlify-adapter.js';
import { makeSurfaceHandler } from './_lib/netlify-wrapper-surface.js';
import { MASTER_ACTIONS } from './surfaces/master.js';
export default adapt(makeSurfaceHandler(MASTER_ACTIONS, [
  'getMasterDataByWa', 'submitMasterForm', 'getDrafCvMaster', 'simpanUpdateMaster',
]));
