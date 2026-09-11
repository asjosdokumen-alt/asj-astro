import type { CvTemplate, CandidateData, RenderContext, RenderResult } from '../types';
import { esc } from '../../helpers_cv';

function s(v: unknown): string {
  return v === undefined || v === null ? '' : String(v);
}

const template: CvTemplate = {
  id: 'docx-basic',
  name: 'Word Basic CV',
  type: 'docx',
  description: 'Template Word dasar untuk CV rirekisho',
  category: 'resume',
  icon: 'file-alt',
  async render(data: CandidateData, _context: RenderContext): Promise<RenderResult> {
    try {
      const id = data.identitas;
      const rows: string[] = [];
      const addRow = (label: string, val: unknown) => {
        const v = s(val);
        if (!v) return;
        rows.push('<tr><td style="width:35%;font-weight:bold;border:1px solid #000;padding:4px;">' + esc(label) + '</td><td style="border:1px solid #000;padding:4px;">' + esc(v) + '</td></tr>');
      };
      const html = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>' +
        '<h1>CV - ' + esc(s(id.nama_lengkap)) + '</h1>' +
        '<h2>Identitas</h2><table style="border-collapse:collapse;width:100%;">' +
        addRow('Nama Lengkap', id.nama_lengkap) +
        addRow('Katakana', id.katakana) +
        addRow('Tanggal Lahir', id.tgl_lahir) +
        addRow('Usia', id.umur) +
        addRow('Gender', id.gender) +
        addRow('Alamat', id.alamat) +
        addRow('No HP', id.hp) +
        '</table>' +
        '<h2>Pendidikan</h2><table style="border-collapse:collapse;width:100%;">' +
        data.pendidikan.map((p) => '<tr><td style="border:1px solid #000;padding:4px;">' + esc(s(p.tingkat)) + '</td><td style="border:1px solid #000;padding:4px;">' + esc(s(p.sekolah || p.nama_sekolah)) + '</td></tr>').join('') +
        '</table>' +
        '<h2>Pengalaman Kerja</h2><table style="border-collapse:collapse;width:100%;">' +
        data.pekerjaan.map((p) => '<tr><td style="border:1px solid #000;padding:4px;">' + esc(s(p.perusahaan || p.nama_perusahaan)) + '</td><td style="border:1px solid #000;padding:4px;">' + esc(s(p.jabatan)) + '</td></tr>').join('') +
        '</table>' +
        '</body></html>';

      const blob = new Blob([html], { type: 'application/vnd.ms-word' });
      const nama = s(id.nama_lengkap).replace(/[^a-zA-Z0-9]/g, '_') || 'kandidat';
      return { success: true, mimeType: blob.type, fileName: 'CV_' + nama + '.doc', blob };
    } catch (e: unknown) {
      return { success: false, mimeType: '', fileName: '', error: e instanceof Error ? e.message : 'DOCX render error' };
    }
  },
};

export default template;


