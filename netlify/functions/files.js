'use strict';
/**
 * files.js — Documents/docs surface entry point
 *
 * Handles: shareData, submitFormPelamar, cekDataPelamar, getUploadUrls,
 *          isJobRequiresCv, submitApply, getExistingCandidateJsonByWa,
 *          simpanBiodataLengkap, simpanKandidatDanUpload,
 *          simpanBerkasTahapan, simpanRevisiKandidat, downloadJobDocs
 */
const { makeSurfaceHandler } = require('./_lib/netlify-wrapper-surface');
const { DOCS_ACTIONS } = require('./surfaces/docs');
// simpanBiodataLengkap is owned by the master surface in the router but is
// routed here by src/lib/apiEndpoint.ts — compose both so wire behaviour is
// unchanged.
const { MASTER_ACTIONS } = require('./surfaces/master');
exports.handler = makeSurfaceHandler([DOCS_ACTIONS, MASTER_ACTIONS], [
  'shareData', 'submitFormPelamar', 'cekDataPelamar', 'getUploadUrls',
  'isJobRequiresCv', 'submitApply', 'getExistingCandidateJsonByWa',
  'simpanBiodataLengkap', 'simpanKandidatDanUpload',
  'simpanBerkasTahapan', 'simpanRevisiKandidat', 'downloadJobDocs',
]);
