/** Supported CV template output formats */
export type TemplateType = 'rirekisho' | 'docx' | 'xlsx' | 'pdf';

/** Context passed to every template renderer */
export interface RenderContext {
  waTarget: string;
  isAdmin: boolean;
  templateId?: string;
  locale?: 'id' | 'jp';
}

/** Result of rendering a template */
export interface RenderResult {
  success: boolean;
  mimeType: string;
  fileName: string;
  blob?: Blob;
  html?: string;
  error?: string;
}

/** Normalized candidate data available to ALL templates */
export interface CandidateData {
  identitas: Record<string, unknown>;
  fisik: Record<string, unknown>;
  medis: Record<string, unknown>;
  pendidikan: Array<Record<string, unknown>>;
  pekerjaan: Array<Record<string, unknown>>;
  keluarga: Array<Record<string, unknown>>;
  sertifikasi: Record<string, unknown>;
  wawancara: Record<string, unknown>;
  kenalan_jepang: Record<string, unknown>;
  uploads: Record<string, unknown>;
  raw: Record<string, unknown>; // original flat row from getDrafCvMaster
}

/** Template definition contract */
export interface CvTemplate {
  id: string;
  name: string;
  type: TemplateType;
  description?: string;
  category: 'resume' | 'form' | 'report' | 'custom';
  icon?: string;
  render(data: CandidateData, context: RenderContext): Promise<RenderResult>;
}