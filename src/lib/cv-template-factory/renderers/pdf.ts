import type { CvTemplate, CandidateData, RenderContext, RenderResult } from '../types';
import { esc } from '../../helpers_cv';

function s(v: unknown): string {
  return v == undefined || v == null ? '' : String(v);
}

const template: CvTemplate = {
  id: 'pdf-basic',
  name: 'PDF Basic CV',
  type: 'pdf',
  description: 'Template PDF dasar untuk CV rirekisho',
  category: 'resume',
  icon: 'file-pdf',
  async render(data: CandidateData, _context: RenderContext): Promise<RenderResult> {
    try {
      const id = data.identitas;
      const html = '<!DOCTYPE html><html><head><meta charset="utf-8">' +
        '<style>@page{size:A4}body{font-family:Arial,sans-serif;font-size:11px;color:#000;margin:0}table{width:100%;border-collapse:collapse;border:1px solid #000}th,td{border:1px solid #000;padding:4px;font-size:10px;vertical-align:top}th{background:#faeec8;font-weight:bold;text-align:center}h1{text-align:center;font-size:18px;margin:10px 0}h2{font-size:13px;background:#faeec8;padding:4px;margin:10px 0 0}</style></head><body>' +
        '<h1>DAFTAR RIWAYAT HIDUP</h1>' +
        '<table><tr><th colspan="4">IDENTITAS</th></tr>' +
        '<tr><td>Nama</td><td>' + esc(s(id.nama_lengkap)) + '</td><td>Tempat Lahir</td><td>' + esc(s(id.tempat_lahir)) + '</td></tr>' +
        '<tr><td>Tanggal Lahir</td><td>' + esc(s(id.tgl_lahir)) + '</td><td>Usia</td><td>' + esc(s(id.umur)) + '</td></tr>' +
        '<tr><td>Gender</td><td>' + esc(s(id.gender)) + '</td><td>Alamat</td><td>' + esc(s(id.alamat)) + '</td></tr>' +
        '</table>' +
        '<h2>Pendidikan</h2><table><tr><th>Tingkat</th><th>Sekolah</th><th>Jurusan</th></tr>' +
        data.pendidikan.map((p) => '<tr><td>' + esc(s(p.tingkat)) + '</td><td>' + esc(s(p.sekolah || p.nama_sekolah)) + '</td><td>' + esc(s(p.jurusan)) + '</td></tr>').join('') +
        '</table>' +
        '<h2>Pengalaman Kerja</h2><table><tr><th>Perusahaan</th><th>Jabatan</th><th>Periode</th></tr>' +
        data.pekerjaan.map((p) => '<tr><td>' + esc(s(p.perusahaan || p.nama_perusahaan)) + '</td><td>' + esc(s(p.jabatan)) + '</td><td>' + esc(s(p.masuk || p.tahun_masuk)) + ' - ' + esc(s(p.keluar || p.tahun_keluar)) + '</td></tr>').join('') +
        '</table>' +
        '</body></html>';
      const nama = s(id.nama_lengkap).replace(/[^a-zA-Z0-9]/g, '_') || 'kandidat';
      return { success: true, mimeType: 'text/html', fileName: 'CV_' + nama + '.pdf.html', html };
    } catch (e: unknown) {
      return { success: false, mimeType: '', fileName: '', error: e instanceof Error ? e.message : 'PDF render error' };
    }
  }
};

export default template;

