import { describe, it, expect, beforeEach } from 'vitest';
import { cvFactory } from './factory';
import { xlsxPreviewHtml } from './preview';
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

/**
 * `xlsxPreviewHtml` — pratinjau berkas hasil render.
 *
 * KENAPA DI BERKAS INI, BUKAN `preview.test.ts`
 * ---------------------------------------------
 * Berkas .ts baru menggeser `files.length` di counter indexer (`indexer/src/
 * discover.test.ts`), dan counter itu milik team-lead — bukan sesuatu yang
 * boleh digeser oleh sesi fitur. Tes ini kecil dan tidak butuh berkas sendiri.
 *
 * YANG DIUKUR ADALAH HAL YANG DULU SALAH, bukan "fungsinya jalan". Versi
 * sebelumnya hijau di semua gerbang sambil menampilkan kertas grafik dan
 * memotong kolom di Z, karena tidak ada satu pun tes yang membuka hasilnya.
 */
describe('xlsxPreviewHtml', () => {
  /** Workbook minimal: cukup bagian yang dibaca `preview.ts`. */
  async function buildXlsx(sheet: string, styles: string, shared: string[]): Promise<Blob> {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    zip.file(
      'xl/workbook.xml',
      '<workbook><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>',
    );
    zip.file(
      'xl/_rels/workbook.xml.rels',
      '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    );
    zip.file('xl/styles.xml', styles);
    zip.file(
      'xl/sharedStrings.xml',
      `<sst>${shared.map((s) => `<si><t>${s}</t></si>`).join('')}</sst>`,
    );
    zip.file('xl/worksheets/sheet1.xml', sheet);
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    return new Blob([bytes as unknown as BlobPart]);
  }

  const STYLES =
    '<styleSheet>' +
    '<numFmts count="1"><numFmt numFmtId="165" formatCode="yyyy&quot;年&quot;m&quot;月&quot;d&quot;日&quot;"/></numFmts>' +
    '<fonts count="2"><font><sz val="11"/></font><font><b/><sz val="11"/></font></fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFFC000"/></patternFill></fill></fills>' +
    '<borders count="2"><border><left/><right/><top/><bottom/></border>' +
    '<border><left style="thin"><color rgb="FF000000"/></left><right style="thin"/><top style="thin"/><bottom style="thin"/></border></borders>' +
    '<cellXfs count="4">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" applyBorder="1"/>' +
    '<xf numFmtId="165" fontId="0" fillId="0" borderId="1" applyBorder="1"/>' +
    '<xf numFmtId="0" fontId="1" fillId="1" borderId="1" applyBorder="1" applyFill="1"/>' +
    '</cellXfs></styleSheet>';

  // fitWidth kecil ⇒ k = 1, jadi angka px di assert tidak bergeser karena skala.
  const NO_SCALE = { fitWidth: 1 };

  it('membaca border dari styles.xml, bukan memasang garis di setiap sel', async () => {
    const sheet =
      '<worksheet><sheetData><row r="1">' +
      '<c r="A1" s="1" t="s"><v>0</v></c>' +
      '<c r="B1" s="0" t="s"><v>1</v></c>' +
      '</row></sheetData></worksheet>';
    const html = await xlsxPreviewHtml(await buildXlsx(sheet, STYLES, ['Berbingkai', 'Kosong']), NO_SCALE);

    // A1 memakai xf borderId=1 ⇒ keempat sisinya bergaris.
    expect(html).toMatch(/<td style="[^"]*border-top:1px solid #000000[^"]*">Berbingkai<\/td>/);
    // B1 memakai xf borderId=0 ⇒ TIDAK bergaris. Inilah bedanya dengan versi
    // lama, yang memberi `1px solid #7f7f7f` ke semua sel tanpa kecuali.
    expect(html).toMatch(/<td style="[^"]*border-top:none[^"]*">Kosong<\/td>/);
  });

  it('menghormati kolom hidden dan tidak memotong form di kolom Z', async () => {
    // Kolom B hidden; teks di kolom AD (29) harus tetap muncul. Versi lama
    // membatasi `maxCols` ke 26, jadi AD hilang tanpa pesan.
    const sheet =
      '<worksheet><cols><col min="2" max="2" width="9" hidden="1"/></cols><sheetData>' +
      '<row r="1">' +
      '<c r="A1" t="s"><v>0</v></c>' +
      '<c r="B1" t="s"><v>1</v></c>' +
      '<c r="AD1" t="s"><v>2</v></c>' +
      '</row></sheetData></worksheet>';
    const html = await xlsxPreviewHtml(await buildXlsx(sheet, STYLES, ['Awal', 'RAHASIA', 'Ujung']), NO_SCALE);

    expect(html).toContain('Awal');
    expect(html).not.toContain('RAHASIA');
    expect(html).toContain('Ujung');
  });

  it('mencetak tanggal sesuai numFmt, bukan serial mentah', async () => {
    const sheet =
      '<worksheet><sheetData><row r="1">' +
      '<c r="A1" s="2"><v>36633</v></c>' +
      '</row></sheetData></worksheet>';
    const html = await xlsxPreviewHtml(await buildXlsx(sheet, STYLES, []), NO_SCALE);

    expect(html).toContain('2000年4月17日');
    expect(html).not.toContain('36633');
  });

  it('memakai font dan fill dari cellXfs', async () => {
    const sheet =
      '<worksheet><sheetData><row r="1">' +
      '<c r="A1" s="3" t="s"><v>0</v></c>' +
      '</row></sheetData></worksheet>';
    const html = await xlsxPreviewHtml(await buildXlsx(sheet, STYLES, ['Judul']), NO_SCALE);

    expect(html).toMatch(/<td style="[^"]*font-weight:700[^"]*background:#ffc000[^"]*">Judul<\/td>/);
  });
});
