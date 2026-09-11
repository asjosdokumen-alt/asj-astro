import { describe, it, expect, beforeEach } from 'vitest';
import { cvFactory } from './factory';
import type { CvTemplate, CandidateData, RenderContext, RenderResult } from './types';

describe('CvTemplateFactory', () => {
  const baseData: CandidateData = {
    identitas: { nama_lengkap: 'Test User' },
    fisik: {},
    medis: {},
    pendidikan: [],
    pekerjaan: [],
    keluarga: [],
    sertifikasi: {},
    wawancara: {},
    kenalan_jepang: {},
    uploads: {},
    raw: {},
  };
  const baseContext: RenderContext = { waTarget: '6281234567890', isAdmin: false };

  beforeEach(() => {
    cvFactory.list().forEach(t => {
      cvFactory['templates'].delete(t.id);
    });
  });

  it('starts empty', () => {
    expect(cvFactory.list()).toHaveLength(0);
  });

  it('register adds templates', () => {
    const tpl: CvTemplate = {
      id: 'tpl-test',
      name: 'Test Template',
      type: 'rirekisho',
      category: 'resume',
      render: async () => ({ success: true, mimeType: 'text/html', fileName: 'test.html' }),
    };
    cvFactory.register(tpl);
    expect(cvFactory.list()).toHaveLength(1);
  });

  it('list returns templates', () => {
    const tpl1: CvTemplate = {
      id: 'tpl-1',
      name: 'Template 1',
      type: 'rirekisho',
      category: 'resume',
      render: async () => ({ success: true, mimeType: 'text/html', fileName: 't1.html' }),
    };
    const tpl2: CvTemplate = {
      id: 'tpl-2',
      name: 'Template 2',
      type: 'pdf',
      category: 'report',
      render: async () => ({ success: true, mimeType: 'application/pdf', fileName: 't2.pdf' }),
    };
    cvFactory.register(tpl1);
    cvFactory.register(tpl2);
    expect(cvFactory.list()).toHaveLength(2);
    expect(cvFactory.list()[0].id).toBe('tpl-1');
  });

  it('get returns templates by id', () => {
    const tpl: CvTemplate = {
      id: 'tpl-get',
      name: 'Get Template',
      type: 'docx',
      category: 'form',
      render: async () => ({ success: true, mimeType: 'application/vnd.openxmlformats', fileName: 'g.docx' }),
    };
    cvFactory.register(tpl);
    expect(cvFactory.get('tpl-get')).toBeDefined();
    expect(cvFactory.get('tpl-get')?.id).toBe('tpl-get');
    expect(cvFactory.get('nonexistent')).toBeUndefined();
  });

  it('render returns error for unknown template', async () => {
    const result = await cvFactory.render('unknown-id', baseData, baseContext);
    expect(result.success).toBe(false);
    expect(result.error).toContain('tidak ditemukan');
  });

  it('render calls template.render for known template', async () => {
    const mockedResult: RenderResult = { success: true, mimeType: 'text/html', fileName: 'rendered.html', html: '<div>hello</div>' };
    const tpl: CvTemplate = {
      id: 'tpl-render',
      name: 'Render Template',
      type: 'rirekisho',
      category: 'resume',
      render: async (_data: CandidateData, _ctx: RenderContext) => mockedResult,
    };
    cvFactory.register(tpl);
    const result = await cvFactory.render('tpl-render', baseData, baseContext);
    expect(result.success).toBe(true);
    expect(result).toEqual(mockedResult);
  });
});
