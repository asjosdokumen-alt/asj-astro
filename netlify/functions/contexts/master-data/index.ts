/**
 * contexts/master-data/index.ts — Public interface for master-data context
 *
 * Owns: master_database_candidate (169 columns)
 */
export { findMasterByWa, patchMaster, upsertMaster } from './repository';
export {
  handleGetMasterDataByWa,
  handleSubmitMasterForm,
  handleGetDrafCvMaster,
  handleSimpanBiodataLengkap,
  handleGetTemplateCvList,
  handleSimpanTemplateCv,
  handleHapusTemplateCv,
  buildBioPatch,
  buildMasterNested,
  buildMasterBody,
  masterColumnsFromAi,
  buildAiOverflow,
  mergeAiOverflow,
  buildRiwayatSlots,
  pruneAiRiwayat,
} from './service';
// Alias: simpanUpdateMaster maps to handleSubmitMasterForm
export { handleSubmitMasterForm as handleSimpanUpdateMaster } from './service';
