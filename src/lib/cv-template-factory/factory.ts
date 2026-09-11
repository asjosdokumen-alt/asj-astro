import type { CvTemplate, CandidateData, RenderContext, RenderResult } from './types';

class CvTemplateFactory {
  private templates: Map<string, CvTemplate> = new Map();

  register(template: CvTemplate): void {
    this.templates.set(template.id, template);
  }

  get(id: string): CvTemplate | undefined {
    return this.templates.get(id);
  }

  list(): CvTemplate[] {
    return Array.from(this.templates.values());
  }

  listByType(type: string): CvTemplate[] {
    return this.list().filter(t => t.type === type);
  }

  async render(id: string, data: CandidateData, context: RenderContext): Promise<RenderResult> {
    const template = this.templates.get(id);
    if (!template) {
      return { success: false, mimeType: '', fileName: '', error: `Template "${id}" tidak ditemukan.` };
    }
    try {
      return await template.render(data, context);
    } catch (e: unknown) {
      return { success: false, mimeType: '', fileName: '', error: e instanceof Error ? e.message : 'Render error' };
    }
  }
}

export const cvFactory = new CvTemplateFactory();
