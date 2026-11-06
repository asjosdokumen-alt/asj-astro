
/**
 * files.js — Documents/docs surface entry point
 *
 * Handles: shareData, submitFormPelamar, cekDataPelamar, getUploadUrls,
 *          isJobRequiresCv, submitApply, getExistingCandidateJsonByWa,
 *          simpanBiodataLengkap, simpanKandidatDanUpload,
 *          simpanBerkasTahapan, simpanRevisiKandidat
 *
 * `downloadJobDocs` DIPINDAH ke `job-docs.js` (2026-11-06): action itu memakai
 * `archiver`, dan satu action ZIP tidak boleh membebani setiap unggahan.
 */
import { adapt } from './_lib/netlify-adapter.js';
import { makeSurfaceHandler } from './_lib/netlify-wrapper-surface.js';
import { DOCS_ACTIONS } from './surfaces/docs.js';
// simpanBiodataLengkap is owned by the master surface in the router but is
// routed here by src/lib/apiEndpoint.ts — compose both so wire behaviour is
// unchanged.
import { MASTER_ACTIONS } from './surfaces/master.js';
export default adapt(makeSurfaceHandler([DOCS_ACTIONS, MASTER_ACTIONS], [
  'shareData', 'submitFormPelamar', 'cekDataPelamar', 'getUploadUrls',
  'isJobRequiresCv', 'submitApply', 'getExistingCandidateJsonByWa',
  'simpanBiodataLengkap', 'simpanKandidatDanUpload',
  'simpanBerkasTahapan', 'simpanRevisiKandidat',
]));
