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

/** `applyFieldMap` dan `applyRiwayatBlock` menulis satu nilai per sel. */
export async function openWorkbookFromUrl(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Berkas template tidak bisa diambil (${res.status}).`);
  const XLSX = await import('xlsx');
  return XLSX.read(new Uint8Array(await res.arrayBuffer()), { type: 'array' });
}

/**
 * Serialisasi workbook yang sudah diisi jadi berkas .xlsx.
 *
 * Dua helper ini ada supaya KOMPONEN tidak memanggil `fetch` mentah dan tidak
 * meng-import `xlsx` sendiri: `CandidateProfileModal` punya tes yang menegakkan
 * "tidak ada fetch mentah di sumbernya", dan satu tempat untuk aturan jaringan
 * lebih baik daripada tersebar di tiap pemanggil.
 */
export async function workbookToXlsxBlob(workbook: unknown): Promise<Blob> {
  const XLSX = await import('xlsx');
  const buffer = XLSX.write(workbook as never, { type: 'buffer', bookType: 'xlsx' });
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
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

// ---------------------------------------------------------------------------
// BELAJAR DARI CONTOH TERISI (keputusan pemilik 2026-10-09: opsi C)
// ---------------------------------------------------------------------------
// Admin mengisi template dengan data SATU kandidat nyata lalu meng-upload-nya
// sekali. Peta sel→field disimpulkan dengan mencocokkan NILAI di setiap sel
// terhadap nilai field kandidat itu — jadi tidak perlu mengetik
// `{{placeholder}}` di setiap sel, dan template yang sudah terisi penuh
// langsung bisa dipakai ulang untuk kandidat lain.
//
// Syarat yang tidak bisa dihindari: contohnya harus dari kandidat yang datanya
// ADA di database. Tanpa itu tidak ada yang bisa dicocokkan, dan peta harus
// diisi manual. Sel yang nilainya cocok dengan LEBIH DARI SATU field tidak
// ditebak — dimasukkan ke `ambiguous` supaya admin memilih.
export interface ExampleAnalysis {
  /** sel → path data (siap diserahkan ke `applyFieldMap`) */
  fieldMap: TemplateFieldMap;
  /** sel → daftar path yang nilainya sama; admin harus memilih satu */
  ambiguous: Record<string, string[]>;
  /** path yang TIDAK ketemu di template — admin tahu apa yang belum tertampung */
  unmatched: string[];
}

/** Nilai yang terlalu pendek/terlalu umum untuk dijadikan bukti. */
function tooWeakToMatch(v: string): boolean {
  const s = v.trim();
  if (s.length < 3) return true;
  if (/^[-–—.,;:/\\|]+$/.test(s)) return true;
  return false;
}

function matchKey(v: unknown): string {
  return String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export async function analyzeFromExample(
  workbook: unknown,
  data: CandidateData,
): Promise<ExampleAnalysis> {
  const XLSX = await import('xlsx');
  const wb = workbook as {
    SheetNames: string[];
    Sheets: Record<string, Record<string, { v?: unknown; t?: string }>>;
  };
  const flat = flattenDataForPlaceholders(data);

  // Nilai → path. Hanya nilai yang cukup khas yang boleh jadi bukti.
  const byValue = new Map<string, string[]>();
  for (const [path, value] of Object.entries(flat)) {
    const key = matchKey(value);
    if (!key || tooWeakToMatch(String(value))) continue;
    const list = byValue.get(key) ?? [];
    if (!list.includes(path)) list.push(path);
    byValue.set(key, list);
  }

  const fieldMap: TemplateFieldMap = {};
  const ambiguous: Record<string, string[]> = {};
  const used = new Set<string>();

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const range = XLSX.utils.decode_range((sheet['!ref'] as string) || 'A1');
    for (let row = range.s.r; row <= range.e.r; row++) {
      for (let col = range.s.c; col <= range.e.c; col++) {
        const addr = XLSX.utils.encode_cell({ r: row, c: col });
        const cell = sheet[addr];
        if (!cell || cell.v === null || cell.v === undefined) continue;
        const text = String(cell.v);

        // `{{path}}` selalu menang: itu perintah eksplisit, bukan tebakan.
        const token = PLACEHOLDER_RE.exec(text);
        PLACEHOLDER_RE.lastIndex = 0;
        if (token && flat[token[1].trim()] !== undefined) {
          fieldMap[addr] = token[1].trim();
          used.add(token[1].trim());
          continue;
        }

        const paths = byValue.get(matchKey(text));
        if (!paths?.length) continue;
        if (paths.length === 1) {
          fieldMap[addr] = paths[0];
          used.add(paths[0]);
        } else {
          ambiguous[addr] = paths;
        }
      }
    }
  }

  const unmatched = Object.keys(flat).filter(
    (p) => !used.has(p) && !tooWeakToMatch(String(flat[p])),
  );
  return { fieldMap, ambiguous, unmatched };
}

// ---------------------------------------------------------------------------
// BLOK RIWAYAT MULTI-BARIS (pendidikan / pekerjaan / keluarga)
// ---------------------------------------------------------------------------
// `applyFieldMap` menulis SATU nilai per sel. Tabel riwayat butuh N baris
// (satu baris per sekolah / perusahaan / anggota keluarga), jadi ia tidak bisa
// ditangani peta sel biasa — tanpa ini, CV hasil regenerasi kehilangan justru
// bagian terpentingnya.
//
// Bloknya juga dipelajari dari contoh yang sama: cari KOLOM yang nilainya
// berurutan sama dengan nilai field kunci tiap entri (mis. `tingkat` untuk
// pendidikan), lalu kolom-kolom lain di baris yang sama dipetakan dengan
// mencocokkan nilainya ke field entri pada baris itu.
export interface RiwayatBlock {
  sheet: string;
  /** Baris Excel (1-based) entri PERTAMA. */
  startRow: number;
  /** Berapa baris yang ditempati blok di template (dari contoh yang terisi). */
  rows: number;
  /** Kolom kunci, mis. 'A'. */
  keyColumn: string;
  /** Kolom → field entri, mis. `{ A: 'tingkat', B: 'sekolah' }`. */
  columns: Record<string, string>;
}

const colName = (xlsx: { utils: { encode_col: (c: number) => string } }, c: number) => xlsx.utils.encode_col(c);

export async function detectRiwayatBlock(
  workbook: unknown,
  entries: Array<Record<string, unknown>>,
  keyField: string,
): Promise<RiwayatBlock | null> {
  if (!Array.isArray(entries) || entries.length < 2) return null;
  const XLSX = await import('xlsx');
  const wb = workbook as {
    SheetNames: string[];
    Sheets: Record<string, Record<string, { v?: unknown }>>;
  };

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const range = XLSX.utils.decode_range((sheet['!ref'] as string) || 'A1');

    for (let col = range.s.c; col <= range.e.c; col++) {
      const letter = colName(XLSX, col);
      // Baris mana saja di kolom ini yang cocok dengan field kunci entri ke-i?
      const hits: number[] = [];
      for (let row = range.s.r; row <= range.e.r; row++) {
        const cell = sheet[`${letter}${row + 1}`];
        if (!cell || cell.v === null || cell.v === undefined) continue;
        const key = matchKey(cell.v);
        if (!key) continue;
        const i = entries.findIndex((e) => matchKey(e[keyField]) === key);
        if (i >= 0 && !hits.includes(i)) hits.push(i);
      }
      // Blok dikenali kalau kolom ini memuat SEMUA entri (bukan kebetulan satu).
      if (hits.length !== entries.length) continue;

      const startRow = Math.min(
        ...entries.map((e) => {
          for (let row = range.s.r; row <= range.e.r; row++) {
            const cell = sheet[`${letter}${row + 1}`];
            if (cell && matchKey(cell.v) === matchKey(e[keyField])) return row + 1;
          }
          return Number.MAX_SAFE_INTEGER;
        }),
      );
      if (!Number.isFinite(startRow) || startRow === Number.MAX_SAFE_INTEGER) continue;

      // Kolom lain: nilainya harus cocok dengan field entri di BARIS yang sama.
      const columns: Record<string, string> = { [letter]: keyField };
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cl = colName(XLSX, c);
        if (cl === letter) continue;
        const row0 = sheet[`${cl}${startRow}`];
        if (!row0 || row0.v === null || row0.v === undefined) continue;
        const key = matchKey(row0.v);
        if (!key) continue;
        for (const [field, value] of Object.entries(entries[0])) {
          if (field === keyField) continue;
          if (matchKey(value) === key) {
            columns[cl] = field;
            break;
          }
        }
      }
      return { sheet: sheetName, startRow, rows: entries.length, keyColumn: letter, columns };
    }
  }
  return null;
}

type RawSheet = Record<string, unknown>;
type XlsxModule = typeof import('xlsx');

/** Kunci sel A1-style. Kunci lain di sheet (`!ref`, `!merges`, …) dilewati. */
const CELL_RE = /^[A-Z]{1,3}[0-9]+$/;

/**
 * Geser semua baris ≥ `fromRow0` (0-based) turun sebanyak `delta`.
 *
 * SheetJS komunitas tidak punya `insert_row`, jadi penggeseran dilakukan
 * manual. Satu detail yang menentukan benar/tidaknya: SELURUH kunci lama
 * dihapus lebih dulu, baru kunci baru ditulis. Kalau tidak, sel yang sudah
 * pindah bisa menimpa sel yang belum dipindah — dua alamat bertabrakan di kunci
 * yang sama, dan isinya hilang tanpa error.
 *
 * Ikut digeser: `!ref`, `!merges`, `!rows` (tinggi baris), `!autofilter`. Kalau
 * `!merges` tertinggal, sel gabungan akan menutupi baris yang salah.
 */
function shiftRowsDown(
  sheet: RawSheet,
  fromRow0: number,
  delta: number,
  XLSX: XlsxModule,
): void {
  const moves: Array<{ from: string; to: string; cell: unknown }> = [];
  for (const key of Object.keys(sheet)) {
    if (!CELL_RE.test(key)) continue;
    const { c, r } = XLSX.utils.decode_cell(key);
    if (r >= fromRow0) {
      moves.push({ from: key, to: XLSX.utils.encode_cell({ c, r: r + delta }), cell: sheet[key] });
    }
  }
  for (const m of moves) delete sheet[m.from];
  for (const m of moves) sheet[m.to] = m.cell;

  const ref = sheet['!ref'];
  if (typeof ref === 'string' && ref) {
    const rng = XLSX.utils.decode_range(ref);
    const shifted = rng.e.r >= fromRow0 ? rng.e.r + delta : rng.e.r;
    // Baris baru yang disisipkan WAJIB masuk `!ref`: kalau blok riwayat adalah
    // hal terakhir di sheet, baris tambahannya berada di luar rentang lama dan
    // akan dibuang diam-diam saat serialisasi.
    rng.e.r = Math.max(shifted, fromRow0 + delta - 1);
    sheet['!ref'] = XLSX.utils.encode_range(rng);
  }

  const merges = sheet['!merges'];
  if (Array.isArray(merges)) {
    sheet['!merges'] = merges.map((m) => {
      const mg = m as { s?: { c: number; r: number }; e?: { c: number; r: number } };
      if (!mg?.s || !mg.e || mg.s.r < fromRow0) return m;
      return { s: { c: mg.s.c, r: mg.s.r + delta }, e: { c: mg.e.c, r: mg.e.r + delta } };
    });
  }

  const heights = sheet['!rows'];
  if (Array.isArray(heights) && heights.length > fromRow0) {
    const pad: undefined[] = [];
    for (let i = 0; i < delta; i++) pad.push(undefined);
    heights.splice(fromRow0, 0, ...pad);
  }

  const af = sheet['!autofilter'] as { ref?: string } | undefined;
  if (af && typeof af.ref === 'string') {
    const rng = XLSX.utils.decode_range(af.ref);
    if (rng.e.r >= fromRow0) {
      rng.e.r += delta;
      af.ref = XLSX.utils.encode_range(rng);
    }
  }
}

/** Tulis N entri ke N baris berturut-turut mulai `block.startRow`. */
export async function applyRiwayatBlock(
  workbook: unknown,
  block: RiwayatBlock,
  entries: Array<Record<string, unknown>>,
): Promise<Blob> {
  const XLSX = await import('xlsx');
  const wb = workbook as { SheetNames: string[]; Sheets: Record<string, RawSheet> };
  const sheet = wb.Sheets[block.sheet];
  if (!sheet) throw new Error(`Sheet "${block.sheet}" not found in template`);

  // Kandidat ini punya riwayat LEBIH BANYAK daripada contoh ⇒ barisnya harus
  // DITAMBAH, bukan dipotong. Sebelum ini kelebihannya dibuang tanpa jejak:
  // sekolah/pekerjaan terakhir hilang, dan berkasnya tetap terlihat wajar.
  const extra = entries.length - block.rows;
  if (extra > 0) {
    shiftRowsDown(sheet, block.startRow + block.rows - 1, extra, XLSX);
  }

  for (let i = 0; i < entries.length; i++) {
    for (const [col, field] of Object.entries(block.columns)) {
      const value = entries[i][field];
      const addr = `${col}${block.startRow + i}`;
      // Sel kosong pada entri tetap ditulis kosong: baris milik kandidat
      // SEBELUMNYA tidak boleh tertinggal di baris kandidat berikutnya.
      sheet[addr] = { t: 's', v: value === null || value === undefined ? '' : String(value) };
    }
  }
  // Sisa baris blok (kandidat ini punya riwayat LEBIH PENDEK daripada contoh)
  // harus dikosongkan — kalau tidak, nama sekolah milik kandidat contoh ikut
  // tercetak sebagai riwayat kandidat ini. Ini kesalahan yang paling mudah
  // lolos: hasilnya terlihat wajar, hanya isinya milik orang lain.
  for (let i = entries.length; i < block.rows; i++) {
    for (const col of Object.keys(block.columns)) {
      sheet[`${col}${block.startRow + i}`] = { t: 's', v: '' };
    }
  }
  const buffer = XLSX.write(wb as never, { type: 'buffer', bookType: 'xlsx' });
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
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