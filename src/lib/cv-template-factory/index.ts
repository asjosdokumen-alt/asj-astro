export { cvFactory } from './factory';
export { xlsxPreviewHtml } from './preview';
export type { CvTemplate, CandidateData, RenderContext, RenderResult, TemplateType } from './types';
export { normalizeMasterData } from './data';
/* Hanya jalur "isi berkas sendiri" yang masih hidup: pengguna memilih .xlsx /
   .docx / .pdf lalu nilainya ditulis ke `{{placeholder}}`. Fitur "unggah
   template lalu analisa" (peta sel dipelajari dari contoh) DIHENTIKAN pemilik
   2026-11-12 — hasil parse-nya tidak bisa dipercaya dan biayanya mahal. */
export {
  loadExcelTemplate,
  loadDocxTemplate,
  loadPdfTemplate,
  flattenDataForPlaceholders,
  readWorkbook,
} from './loaders/tEMPLATE-loader';
export type { ExcelTemplateOptions } from './loaders/tEMPLATE-loader';
