import type { CvTemplate, CandidateData, RenderContext, RenderResult } from '../types';
import * as XLSX from 'xlsx';

function s(v: unknown): string {
  return v === undefined || v === null ? '' : String(v);
}

function buildSheet(data: CandidateData): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  const id = data.identitas;
  const rows: Array<[string | number, string | number]> = [];
  rows.push(['Field', 'Value']);
  rows.push(['Nama Lengkap', s(id.nama_lengkap)]);
  rows.push(['Katakana', s(id.katakana)]);
  rows.push(['Nama Panggilan', s(id.panggilan)]);
  rows.push(['Tempat Lahir', s(id.tempat_lahir)]);
  rows.push(['Tanggal Lahir', s(id.tgl_lahir)]);
  rows.push(['Usia', s(id.umur)]);
  rows.push(['Gender', s(id.gender)]);
  rows.push(['Agama', s(id.agama)]);
  rows.push(['Golongan Darah', s(id.golongan_darah)]);
  rows.push(['Status Nikah', s(id.status_nikah)]);
  rows.push(['Anak', s(id.anak)]);
  rows.push(['No HP', s(id.hp)]);
  rows.push(['Alamat', s(id.alamat)]);
  rows.push(['Alamat JP', s(id.alamat_jp)]);
  rows.push(['KTP/NIK', s(id.ktp)]);
  rows.push(['Paspor', s(id.paspor)]);
  rows.push(['SIM', s(id.sim)]);
  rows.push(['Status Eks Jepang', s(id.status_eks_jepang)]);
  rows.push(['TB (cm)', s(data.fisik.tb)]);
  rows.push(['BB (kg)', s(data.fisik.bb)]);
  rows.push(['Topi', s(data.fisik.topi)]);
  rows.push(['Baju', s(data.fisik.baju)]);
  rows.push(['Sepatu', s(data.fisik.sepatu)]);
  rows.push(['Tangan Dominan', s(data.fisik.tangan_dominan)]);
  rows.push(['Tahan AC', s(data.fisik.tahan_ac)]);
  rows.push(['Kacamata', s(data.medis.kacamata)]);
  rows.push(['Buta Warna', s(data.medis.buta_warna)]);
  rows.push(['Tato', s(data.medis.tato)]);
  rows.push(['Tindik', s(data.medis.tindik)]);
  rows.push(['Merokok', s(data.medis.rokok)]);
  rows.push(['Alkohol', s(data.medis.alkohol)]);
  rows.push(['Alergi', s(data.medis.alergi)]);
  rows.push(['JFT', s(data.sertifikasi.jft)]);
  rows.push(['SSW', s(data.sertifikasi.ssw)]);
  rows.push(['Bidang SSW', s(data.sertifikasi.bidang)]);

  rows.push(['', '']);
  rows.push(['PENDIDIKAN', '']);
  rows.push(['Tingkat', 'Sekolah / Jurusan']);
  for (const p of data.pendidikan) {
    rows.push([s(p.tingkat), s(p.sekolah || p.nama_sekolah) + (p.jurusan ? ' / ' + s(p.jurusan) : '')]);
  }

  rows.push(['', '']);
  rows.push(['PEKERJAAN', '']);
  rows.push(['Perusahaan', 'Jabatan / Periode']);
  for (const p of data.pekerjaan) {
    const period = [s(p.masuk || p.tahun_masuk), s(p.keluar || p.tahun_keluar)].filter(Boolean).join(' - ');
    rows.push([s(p.perusahaan || p.nama_perusahaan), s(p.jabatan) + (period ? ' (' + period + ')' : '')]);
  }

  rows.push(['', '']);
  rows.push(['KELUARGA', '']);
  rows.push(['Hubungan / Nama', 'Usia / Pekerjaan']);
  for (const p of data.keluarga) {
    rows.push([s(p.hubungan) + ' / ' + s(p.nama), s(p.usia || p.umur) + ' th / ' + s(p.pekerjaan)]);
  }

  ws['!ref'] = 'A1:B' + rows.length;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    ws['A' + (i + 1)] = { t: 's', v: r[0] };
    ws['B' + (i + 1)] = { t: 's', v: r[1] };
  }
  ws['A1'] = { t: 's', v: 'Field' };
  ws['B1'] = { t: 's', v: 'Value' };
  return ws;
}

const template: CvTemplate = {
  id: 'excel-basic',
  name: 'Excel Basic CV',
  type: 'xlsx',
  description: 'Template Excel dasar untuk CV rirekisho',
  category: 'resume',
  icon: 'file-excel',
  async render(data: CandidateData, _context: RenderContext): Promise<RenderResult> {
    try {
      const wb = XLSX.utils.book_new();
      const ws = buildSheet(data);
      XLSX.utils.book_append_sheet(wb, ws, 'CV');
      const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const nama = s(data.identitas.nama_lengkap).replace(/[^a-zA-Z0-9]/g, '_') || 'kandidat';
      return { success: true, mimeType: blob.type, fileName: 'CV_' + nama + '.xlsx', blob };
    } catch (e: unknown) {
      return { success: false, mimeType: '', fileName: '', error: e instanceof Error ? e.message : 'Excel render error' };
    }
  },
};

export default template;

