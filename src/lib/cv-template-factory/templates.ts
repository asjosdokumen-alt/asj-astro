import { cvFactory } from './factory';
import type { CvTemplate, CandidateData, RenderContext, RenderResult } from './types';
import excelTemplate from './renderers/excel';
import docxTemplate from './renderers/docx';
import pdfTemplate from './renderers/pdf';
import rirekishoXlsxTemplate from './renderers/rirekisho-xlsx';

const rirekishoA4Template: CvTemplate = {
  id: 'rirekisho-a4',
  name: 'Rirekisho A4 (Template Asli)',
  type: 'rirekisho',
  description: 'Template CV rirekisho A4 asli yang sudah ada — format tabel Jepang standar',
  category: 'resume',
  icon: 'file-alt',
  async render(data: CandidateData, context: RenderContext): Promise<RenderResult> {
    return {
      success: true,
      mimeType: 'text/html',
      fileName: 'CV_Rirekisho_A4.html',
      html: '',
    };
  },
};

cvFactory.register(rirekishoA4Template);
cvFactory.register(excelTemplate);
cvFactory.register(docxTemplate);
cvFactory.register(pdfTemplate);
// The real rirekisho form as an .xlsx (column widths, row heights, merges and the
// pas-foto anchor of the supplied workbook, kept 1:1). Registered last so the
// long-standing templates keep their order in `CvTemplateSelector`.
cvFactory.register(rirekishoXlsxTemplate);

export { cvFactory };
