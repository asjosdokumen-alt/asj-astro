'use strict';
/**
 * master-data.js — Master data surface entry point
 *
 * Handles: getMasterDataByWa, submitMasterForm, getDrafCvMaster, simpanUpdateMaster
 */
const { makeSurfaceHandler } = require('./_lib/netlify-wrapper-surface');
const { MASTER_ACTIONS } = require('./surfaces/master');
exports.handler = makeSurfaceHandler(MASTER_ACTIONS, [
  'getMasterDataByWa', 'submitMasterForm', 'getDrafCvMaster', 'simpanUpdateMaster',
]);
