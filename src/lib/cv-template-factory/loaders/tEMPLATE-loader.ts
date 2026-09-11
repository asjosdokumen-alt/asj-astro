import type { CandidateData } from '../types';

export type ExcelTemplateOptions = {
  sheetName?: string;
  arrayFields?: string[];
};

const PLACEHOLDER_RE = /\{\{([^}]+)\}\}/g;

export interface TemplateFieldMap {
  [cellAddress: string]: string;
}

interface FieldLabel {
  pattern: RegExp;
  path: string;
}

function rx(pattern: string): RegExp {
  return new RegExp('^(' + pattern + ')$', 'i');
}

export const FIELD_LABELS: FieldLabel[] = [
  { pattern: rx('nama\\s*lengkap|nama|name'), path: 'identitas.nama_lengkap' },
  { pattern: rx('furigana|katakana|nama_katakana'), path: 'identitas.katakana' },
  { pattern: rx('tempat\\s*lahir|TEMPATLAHIR'), path: 'identitas.tempat_lahir' },
  { pattern: rx('tanggal\\s*lahir|tgl\\s*lahir|TGLLAHIR'), path: 'identitas.tgl_lahir' },
  { pattern: rx('usia|umur|USIA'), path: 'identitas.umur' },
  { pattern: rx('jenis\\s*kelamin|gender|JENISKELAMIN'), path: 'identitas.gender' },
  { pattern: rx('agama|AGAMA'), path: 'identitas.agama' },
  { pattern: rx('golongan?\\s*darah|blood\\s*type|GOLDAR'), path: 'identitas.golongan_darah' },
  { pattern: rx('status\\s*nikah|marital|STATUSNIKAH'), path: 'identitas.status_nikah' },
  { pattern: rx('anak|children|JUMLAHANAK'), path: 'identitas.anak' },
  { pattern: rx('alamat|address|ALAMAT'), path: 'identitas.alamat' },
  { pattern: rx('no\\.?\\s*hp|hp|no\\s*wa|phone|mobile|NOHP'), path: 'identitas.hp' },
  { pattern: rx('email|e-mail|EMAIL'), path: 'identitas.email' },
  { pattern: rx('ktp|nik|NIK'), path: 'identitas.ktp' },
  { pattern: rx('paspor|passport|PASPOR'), path: 'identitas.paspor' },
  { pattern: rx('sim|driver\\s*license'), path: 'identitas.sim' },
  { pattern: rx('kewarganegaraan|nationality'), path: 'identitas.raw.kewarganegaraan' },
  { pattern: rx('kontak\\s*darurat'), path: 'identitas.kontak_darurat_nama' },
  { pattern: rx('tinggi\\s*badan|tb|TINGGI'), path: 'fisik.tb' },
  { pattern: rx('berat\\s*badan|bb|BERAT'), path: 'fisik.bb' },
  { pattern: rx('ukuran\\s*topi|topi|UKURANTOPI'), path: 'fisik.topi' },
  { pattern: rx('ukuran\\s*baju|baju|UKURANBAJU'), path: 'fisik.baju' },
  { pattern: rx('ukuran\\s*sepatu|sepatu|UKURANSEPATU'), path: 'fisik.sepatu' },
  { pattern: rx('tangan\\s*dominan|TANGANDOMINAN'), path: 'fisik.tangan_dominan' },
  { pattern: rx('tahan\\s*ac|TAHANAC'), path: 'fisik.tahan_ac' },
  { pattern: rx('mata\\s*kiri|MATAKIRI'), path: 'medis.mata_kiri' },
  { pattern: rx('mata\\s*kanan|MATAKANAN'), path: 'medis.mata_kanan' },
  { pattern: rx('kacamata|KACAMATA'), path: 'medis.kacamata' },
  { pattern: rx('buta\\s*warna|BUTAWARNA'), path: 'medis.buta_warna' },
  { pattern: rx('tato|tattoo|TATO'), path: 'medis.tato' },
  { pattern: rx('tindik|piercing|TINDIK'), path: 'medis.tindik' },
  { pattern: rx('merokok|rokok|MEROKOK'), path: 'medis.rokok' },
  { pattern: rx('alkohol|MINUMALKOHOL'), path: 'medis.alkohol' },
  { pattern: rx('alergi|ALERGI'), path: 'medis.alergi' },
  { pattern: rx('riwayat\\s*medis|RIWAYATPENYAKIT'), path: 'medis.riwayat_medis' },
  { pattern: rx('bahasa\\s*jepang|jft|JFT'), path: 'sertifikasi.jft' },
  { pattern: rx('nilai\\s*jft|NILAIJFT'), path: 'sertifikasi.nilai' },
  { pattern: rx('ssw|SSW'), path: 'sertifikasi.ssw' },
  { pattern: rx('lisensi|license|LISENSI'), path: 'sertifikasi.lisensi' },
  { pattern: rx('bidang|BIDANG'), path: 'sertifikasi.bidang' },
  { pattern: rx('pendidikan|education'), path: 'pendidikan' },
  { pattern: rx('sekolah|school'), path: 'pendidikan' },
  { pattern: rx('tingkat|level'), path: 'pendidikan.tingkat' },
  { pattern: rx('pekerjaan|work\\s*experience'), path: 'pekerjaan' },
  { pattern: rx('perusahaan|company'), path: 'pekerjaan' },
  { pattern: rx('jabatan|position'), path: 'pekerjaan.jabatan' },
  { pattern: rx('keluarga|family'), path: 'keluarga' },
  { pattern: rx('hubungan|relationship'), path: 'keluarga.hubungan' },
];

function getValueFromPath(data: CandidateData, path: string): string {
  const parts = path.split('.');
  let current: unknown = data;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return '';
    }
    current = (current as Record<string, unknown>)[part];
  }
  if (current === null || current === undefined) return '';
  if (Array.isArray(current)) {
    return current
      .map((item) => {
        if (typeof item === 'object' && item !== null) {
          return Object.values(item).map((v) => String(v ?? '')).join(' / ');
        }
        return String(item);
      })
      .join('\n');
  }
  return String(current);
}

function hasPlaceholders(sheet: Record<string, unknown>): boolean {
  for (const cell of Object.values(sheet)) {
    if (cell && typeof (cell as { v?: unknown }).v === 'string' && PLACEHOLDER_RE.test((cell as { v: string }).v)) {
      return true;
    }
  }
  return false;
}

export function flattenDataForPlaceholders(data: CandidateData): Record<string, string> {
  const flat: Record<string, string> = {};

  function recurse(obj: Record<string, unknown>, prefix = ''): void {
    for (const [key, value] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        recurse(value as Record<string, unknown>, path);
      } else if (Array.isArray(value)) {
        if (value.length > 0 && typeof value[0] === 'object') {
          flat[path] = JSON.stringify(value);
        } else {
          flat[path] = value.join(', ');
        }
      } else if (value !== null && value !== undefined) {
        flat[path] = String(value);
      }
    }
  }

  for (const [section, sectionData] of Object.entries(data)) {
    if (section === 'raw') continue;
    recurse(sectionData as Record<string, unknown>, section);
  }

  return flat;
}

function replacePlaceholders(text: string, flatData: Record<string, string>): string {
  return text.replace(PLACEHOLDER_RE, (match, key) => {
    const trimmed = key.trim();
    if (flatData[trimmed] !== undefined) {
      return flatData[trimmed];
    }
    return match;
  });
}

export async function analyzeExcelTemplate(workbook: unknown): Promise<TemplateFieldMap> {
  const XLSX = await import('xlsx');
  const wb = workbook as { SheetNames: string[]; Sheets: Record<string, Record<string, { v?: unknown; t?: string }>> };
  const fieldMap: TemplateFieldMap = {};
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return fieldMap;

  const range = XLSX.utils.decode_range((sheet['!ref'] as string) || 'A1');
  const maxRow = range.e.r;
  const maxCol = range.e.c;

  for (let row = 0; row <= maxRow; row++) {
    for (let col = 0; col <= maxCol; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
      const cell = sheet[cellAddress];
      if (!cell || typeof cell.v !== 'string') continue;

      const text = cell.v.trim();
      for (const { pattern, path } of FIELD_LABELS) {
        if (pattern.test(text)) {
          const valueCell = findAdjacentValueCell(sheet, row, col, maxRow, maxCol, XLSX);
          if (valueCell) {
            fieldMap[valueCell] = path;
          }
          break;
        }
      }
    }
  }

  return fieldMap;
}

function findAdjacentValueCell(
  sheet: Record<string, { v?: unknown; t?: string }>,
  row: number,
  col: number,
  maxRow: number,
  maxCol: number,
  XLSX: { utils: { encode_cell: (o: { r: number; c: number }) => string } }
): string | null {
  if (col < maxCol) {
    const rightAddr = XLSX.utils.encode_cell({ r: row, c: col + 1 });
    const rightCell = sheet[rightAddr];
    if (rightCell && rightCell.v !== null && rightCell.v !== undefined && String(rightCell.v).trim() !== '') {
      return rightAddr;
    }
  }
  if (col < maxCol - 1) {
    const farRightAddr = XLSX.utils.encode_cell({ r: row, c: col + 2 });
    const farRightCell = sheet[farRightAddr];
    if (farRightCell && farRightCell.v !== null && farRightCell.v !== undefined && String(farRightCell.v).trim() !== '') {
      return farRightAddr;
    }
  }
  if (row < maxRow) {
    const belowAddr = XLSX.utils.encode_cell({ r: row + 1, c: col });
    const belowCell = sheet[belowAddr];
    if (belowCell && belowCell.v !== null && belowCell.v !== undefined && String(belowCell.v).trim() !== '') {
      return belowAddr;
    }
  }
  return null;
}

export async function applyFieldMap(workbook: unknown, fieldMap: TemplateFieldMap, data: CandidateData): Promise<Blob> {
  const XLSX = await import('xlsx');
  const wb = workbook as { SheetNames: string[]; Sheets: Record<string, Record<string, { v?: unknown; t?: string }>> };
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];

  if (!sheet) {
    throw new Error(`Sheet "${sheetName}" not found in template`);
  }

  for (const [cellAddress, fieldPath] of Object.entries(fieldMap)) {
    const value = getValueFromPath(data, fieldPath);
    if (value) {
      sheet[cellAddress] = { t: 's', v: value };
    }
  }

  const buffer = XLSX.write(wb as never, { type: 'buffer', bookType: 'xlsx' });
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export async function loadExcelTemplate(
  file: File,
  data: CandidateData,
  options: ExcelTemplateOptions = {}
): Promise<Blob> {
  const XLSX = await import('xlsx');
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const flatData = flattenDataForPlaceholders(data);
  const sheetName = options.sheetName || workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  if (!sheet) {
    throw new Error(`Sheet "${sheetName}" not found in template`);
  }

  if (hasPlaceholders(sheet as Record<string, unknown>)) {
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
    const maxRow = range.e.r;
    const maxCol = range.e.c;

    const arrayFields = options.arrayFields || ['pendidikan', 'pekerjaan', 'keluarga'];
    const arrayLengths: Record<string, number> = {};
    for (const field of arrayFields) {
      arrayLengths[field] = (data[field as keyof CandidateData] as unknown[] | undefined)?.length || 1;
    }

    const newData: (string | number | boolean | null)[][] = [];
    const templateRow: (string | number | boolean | null)[] = [];

    for (let row = 0; row <= maxRow; row++) {
      const rowData: (string | number | boolean | null)[] = [];
      for (let col = 0; col <= maxCol; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
        const cell = sheet[cellAddress];
        let value = cell ? cell.v : null;

        if (typeof value === 'string') {
          const replaced = replacePlaceholders(value, flatData);
          value = replaced;
        }

        rowData.push(value);
      }
      templateRow.push(...rowData);
    }

    const maxArrayLength = Math.max(1, ...Object.values(arrayLengths));
    for (let i = 0; i < maxArrayLength; i++) {
      const rowCopy = [...templateRow];
      for (const [field, length] of Object.entries(arrayLengths)) {
        if (i < length) {
          const arrayData = data[field as keyof CandidateData] as Record<string, unknown>[];
          const item = arrayData[i];
          if (item) {
            const itemFlat: Record<string, string> = {};
            for (const [k, v] of Object.entries(item)) {
              if (v !== null && v !== undefined) {
                itemFlat[`${field}.${k}`] = String(v);
              }
            }
            for (let col = 0; col <= maxCol; col++) {
              const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
              const cell = sheet[cellAddress];
              if (cell && typeof cell.v === 'string') {
                let replaced = replacePlaceholders(cell.v, itemFlat);
                replaced = replacePlaceholders(replaced, flatData);
                rowCopy[col] = replaced;
              }
            }
          }
        }
      }
      newData.push(rowCopy);
    }

    const newSheet = XLSX.utils.aoa_to_sheet(newData);
    const newWorkbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(newWorkbook, newSheet, sheetName);

    const buffer = XLSX.write(newWorkbook, { type: 'buffer', bookType: 'xlsx' });
    return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  const fieldMap = await analyzeExcelTemplate(workbook);
  return applyFieldMap(workbook, fieldMap, data);
}

export async function loadDocxTemplate(file: File, data: CandidateData): Promise<{ html: string; text: string }> {
  const mammoth = await import('mammoth');
  const arrayBuffer = await file.arrayBuffer();
  const flatData = flattenDataForPlaceholders(data);

  const htmlResult = await mammoth.convertToHtml({ arrayBuffer });
  let html = htmlResult.value || '';

  html = replacePlaceholders(html, flatData);

  const textResult = await mammoth.extractRawText({ arrayBuffer });
  const text = replacePlaceholders(textResult.value || '', flatData);

  return { html, text };
}

export async function loadPdfTemplate(file: File, data: CandidateData): Promise<string> {
  const pdfModule = await import('pdf-parse');
  const PDFClass = (pdfModule as any).PDFParse || (pdfModule as any).default;
  const arrayBuffer = await file.arrayBuffer();
  const flatData = flattenDataForPlaceholders(data);
  const fresh = new Uint8Array(arrayBuffer as ArrayBuffer);
  const parser = new PDFClass(fresh);
  await parser.load();
  const result = await parser.getText();
  parser.destroy();
  const text = result?.text || '';

  return replacePlaceholders(text, flatData);
}