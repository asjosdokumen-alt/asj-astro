/**
 * surfaces/master.ts — Master data surface (admin)
 * Actions: getMasterDataByWa, submitMasterForm, getDrafCvMaster, simpanUpdateMaster,
 *          simpanBiodataLengkap, getTemplateCvList, simpanTemplateCv, hapusTemplateCv
 */
import * as masterData from '../contexts/master-data';
export const MASTER_ACTIONS: Record<string, (payload: unknown[], sessionToken?: string) => Promise<unknown>> = {
  getMasterDataByWa: (p, s) => masterData.handleGetMasterDataByWa(p, s),
  submitMasterForm: (p, s) => masterData.handleSubmitMasterForm(p, s),
  getDrafCvMaster: (p, s) => masterData.handleGetDrafCvMaster(p, s),
  simpanUpdateMaster: (p, s) => masterData.handleSimpanUpdateMaster(p, s),
  // A05 parity (2026-09-04): biodata pemberkasan (KTKLN & Visa) — was a
  // NOT_IMPL stub on the docs surface while master-data owns the row.
  simpanBiodataLengkap: (p, s) => masterData.handleSimpanBiodataLengkap(p, s),
  // Template CV (2026-10-10) — CRUD `sys_config`, admin-only. Berkasnya di
  // Storage dan pengisiannya di browser; lihat catatan di service.ts.
  getTemplateCvList: (p, s) => masterData.handleGetTemplateCvList(p, s),
  simpanTemplateCv: (p, s) => masterData.handleSimpanTemplateCv(p, s),
  hapusTemplateCv: (p, s) => masterData.handleHapusTemplateCv(p, s),
};
