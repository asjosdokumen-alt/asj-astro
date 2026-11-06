/**
 * surfaces/docs.ts — Document upload/download surface
 *
 * Handles: getUploadUrls, cekDataPelamar, submitApply, kandidat/berkas/revisi
 * uploads, downloadJobDocs
 * Auth: Required (session check already in handlers); submitApply is public.
 *
 * Parity wiring (2026-09-04): these actions previously fell through to
 * NOT_IMPL stubs while the real handlers existed in contexts/documents — the
 * public apply + candidate document + admin ZIP flows were unreachable over
 * HTTP. shareData stays NOT_IMPL until the share viewer is gated behind a
 * per-job token (see docs/LEGACY_PARITY_REFERENCE.md P1).
 */
import * as documents from '../contexts/documents';

const NOT_IMPL = { success: false, message: 'Fungsi ini belum diimplementasi di backend rebuild.' };

export const DOCS_ACTIONS: Record<string, (payload: unknown[], sessionToken?: string) => Promise<unknown>> = {
  getUploadUrls: (payload, sessionToken) => documents.handleGetUploadUrls(payload, sessionToken),
  cekDataPelamar: (payload, sessionToken) => documents.handleCekDataPelamar(payload, sessionToken),
  submitApply: (payload, sessionToken) => documents.handleSubmitApply(payload),
  getExistingCandidateJsonByWa: (payload, sessionToken) => documents.handleGetExistingCandidateJsonByWa(payload, sessionToken),
  simpanKandidatDanUpload: (payload, sessionToken) => documents.handleSimpanKandidatDanUpload(payload, sessionToken),
  simpanBerkasTahapan: (payload, sessionToken) => documents.handleSimpanBerkasTahapan(payload, sessionToken),
  simpanRevisiKandidat: (payload, sessionToken) => documents.handleSimpanRevisiKandidat(payload, sessionToken),
  // `downloadJobDocs` PINDAH ke `surfaces/job-docs.ts` (entry sendiri, 2026-11-06).
  // Satu baris di sini cukup menarik `contexts/documents/download.ts` + `archiver`
  // (~70 KB) ke `files.js`, yang melayani setiap unggahan kandidat.
  // No handler in the rebuild yet — keep stubs (legacy-only names / pending
  // share-token gate):
  isJobRequiresCv: async () => NOT_IMPL,
  submitFormPelamar: async () => NOT_IMPL,
  // simpanBiodataLengkap (A05): routed to ./master (MASTER_ACTIONS) — the
  // biodata row is owned by contexts/master-data.
  shareData: async () => NOT_IMPL,
};
