/**
 * surfaces/jobs.ts — Job management surface (admin)
 *
 * Handles all job_database CRUD actions.
 * Auth: Admin only.
 */
import {
  handleSimpanJobBaru, handleEditLokerFull, handleUbahStatusJob,
  handleHapusJobData, handleUpdateTahapanDbJob, handleUpdateDokumenShare,
  handleTandaiGagalJob,
} from '../contexts/jobs';

export const JOB_ACTIONS: Record<string, (payload: unknown[], sessionToken?: string) => Promise<unknown>> = {
  simpanJobBaru: (p, s) => handleSimpanJobBaru(p, s),
  editLokerFull: (p, s) => handleEditLokerFull(p, s),
  ubahStatusJob: (p, s) => handleUbahStatusJob(p, s),
  hapusJobData: (p, s) => handleHapusJobData(p, s),
  updateTahapanDbJob: (p, s) => handleUpdateTahapanDbJob(p, s),
  updateDokumenShare: (p, s) => handleUpdateDokumenShare(p, s),
  tandaiGagalJob: (p, s) => handleTandaiGagalJob(p, s),
};
