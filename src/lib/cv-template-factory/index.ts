export { cvFactory } from './factory';
export type { CvTemplate, CandidateData, RenderContext, RenderResult, TemplateType } from './types';
export { normalizeMasterData } from './data';
export {
  loadExcelTemplate,
  loadDocxTemplate,
  loadPdfTemplate,
  flattenDataForPlaceholders,
  analyzeExcelTemplate,
  applyFieldMap,
} from './loaders/tEMPLATE-loader';
export type { ExcelTemplateOptions, TemplateFieldMap } from './loaders/tEMPLATE-loader';
