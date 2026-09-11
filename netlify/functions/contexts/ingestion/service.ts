/**
 * contexts/ingestion/service.ts — Business logic for document parsing + upsert
 *
 * Other contexts and surfaces import ONLY from index.ts.
 */
import {
  normalizeWa, normalizeGender, cacheClear,
  findMasterByWa, patchMaster, upsertMaster, nextCandidateId,
} from './repository';
import { isAllowedDocumentUrl } from '../../_lib/storage';
import { safeError } from '../../_lib/kernel/errors';

interface IngestPayload {
  fileUrl: string;
  fileType: string;
  wa?: string;
}

interface GeminiExtractedData {
  nama_lengkap: string;
  email: string;
  nik: string;
  no_wa: string;
  nomor_telepon: string;
  gender: string;
  skills: string[];
  [key: string]: unknown;
}

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 15000;
const GEMINI_MODEL_TIMEOUT_MS = 12000;
const MODELS = ['gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.5-flash'];

const SYSTEM_PROMPT = [
  'Kamu adalah asisten HRD ASJ (PT Amanah Sakura Japan).',
  'Ekstrak data dari dokumen yang diberikan ke JSON STRUCTURED OUTPUT.',
  'Kembalikan HANYA objek JSON valid tanpa markdown fence.',
  '',
  'Field yang wajib diisi (kalau ada di dokumen):',
  '- nama_lengkap: nama lengkap kandidat (HURUF KAPITAL)',
  '- email: alamat email',
  '- nik: NIK / nomor KTP',
  '- no_wa: nomor WhatsApp (format 628xxx)',
  '- nomor_telepon: nomor telepon lain',
  '- gender: "LAKI-LAKI" atau "PEREMPUAN"',
  '- skills: array string (keahlian/keterampilan yang disebutkan)',
  '',
  'Field opsional (isi kalau ada):',
  '- usia, tempat_lahir, tgl_lahir, pendidikan, alamat, pekerjaan',
  '',
  'Hanya isi field yang benar-benar ada di dokumen.',
  'Yang tidak ada, OMIT (jangan null atau string kosong).',
].join('\n');

async function geminiStructuredExtract(text: string): Promise<GeminiExtractedData> {
  const { env } = await import('../../_lib/env');
  const key = env('GEMINI_API_KEY');
  if (!key) throw new Error('GEMINI_API_KEY belum dikonfigurasi');
  const contents = [{
    role: 'user' as const,
    parts: [
      { text: SYSTEM_PROMPT },
      { text: 'Berikut teks dokumen yang sudah diekstrak:\n\n' + text },
    ],
  }];
  let lastErr: Error | null = null;
  for (const model of MODELS) {
    try {
      const res = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + key,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents, generationConfig: { responseMimeType: 'application/json' } }),
          signal: AbortSignal.timeout(GEMINI_MODEL_TIMEOUT_MS),
        },
      );
      if (!res.ok) {
        const errText = await res.text();
        throw new Error('Gemini HTTP ' + res.status + ' ' + errText.slice(0, 120));
      }
      const j = await res.json();
      const reply = j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('') || '';
      if (reply) {
        const { parseJsonLoose } = await import('../../_lib/ai/providers');
        const parsed = parseJsonLoose(reply) as GeminiExtractedData;
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch (e: unknown) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastErr || new Error('Gemini tidak tersedia');
}

async function downloadFile(url: string): Promise<{ buffer: Buffer; contentType: string }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!res.ok) throw new Error('Gagal download file: HTTP ' + res.status);
  const contentType = res.headers.get('content-type') || '';
  const arrayBuf = await res.arrayBuffer();
  return { buffer: Buffer.from(arrayBuf), contentType };
}

async function extractText(buffer: Buffer, ext: string): Promise<string> {
  const e = ext.toLowerCase().replace(/^\./, '');
  switch (e) {
    case 'pdf': {
      const pdfModule = await import('pdf-parse');
      const PDFClass = (pdfModule as any).PDFParse || (pdfModule as any).default;
      const fresh = new Uint8Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
      const parser = new PDFClass(fresh);
      await parser.load();
      const result = await parser.getText();
      parser.destroy();
      return cleanText(result?.text || '');
    }
    case 'docx': {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      return cleanText(result.value || '');
    }
    case 'xlsx':
    case 'xls': {
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const allText: string[] = [];
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const csv = XLSX.utils.sheet_to_csv(sheet);
        if (csv.trim()) allText.push('--- Sheet: ' + sheetName + ' ---\n' + csv);
      }
      return cleanText(allText.join('\n\n'));
    }
    case 'csv':
    case 'txt':
      return cleanText(buffer.toString('utf-8'));
    case 'jpg': case 'jpeg': case 'png': case 'webp': case 'gif':
      return '__NEEDS_MANUAL_OCR__';
    default:
      throw new Error('Format file tidak didukung: .' + e + '. Gunakan PDF/DOCX/XLSX/CSV/TXT.');
  }
}

function cleanText(raw: string): string {
  return raw.replace(/\r\n/g, '\n').replace(/\t/g, ' ').replace(/[ ]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

export async function handleProcessUploadDoc(payload: unknown[], sessionToken?: string) {
  const session = await import('../../_lib/session');
  const t = session.verifyToken(sessionToken);
  if (!t || (t.role !== 'admin' && t.role !== 'kandidat')) {
    return { success: false, sessionInvalid: true, message: 'Sesi tidak valid' };
  }
  const d = ((payload && payload[0]) || {}) as IngestPayload;
  const fileUrl = String(d.fileUrl || '').trim();
  const fileType = String(d.fileType || '').trim().toLowerCase().replace(/^\./, '');
  const wa = normalizeWa(String(d.wa || ''));
  // Auth hardening (2026-09-04): a kandidat may only ingest documents for
  // their OWN WA — the extracted no_wa upserts into master_database_candidate,
  // so an unguarded cross-WA write would let one candidate patch another's row.
  if (t.role === 'kandidat' && wa && wa !== normalizeWa(String(t.wa || ''))) {
    return { success: false, error: 'Akses ditolak: nomor WA tidak sesuai sesi.' };
  }
  if (!fileUrl) return { success: false, error: 'fileUrl wajib diisi.' };
  // C6 fix (2026-09-04): download only https URLs from allow-listed storage
  // hosts — blocks SSRF to arbitrary hosts (incl. internal networks).
  if (!isAllowedDocumentUrl(fileUrl)) {
    return { success: false, error: 'fileUrl harus https dari host penyimpanan resmi.' };
  }
  if (!fileType) return { success: false, error: 'fileType wajib diisi (pdf/docx/xlsx/csv/txt).' };

  try {
    const { buffer } = await downloadFile(fileUrl);
    if (buffer.length > MAX_FILE_BYTES) {
      return { success: false, error: 'File terlalu besar (' + Math.round(buffer.length / 1024 / 1024) + ' MB). Maks 10 MB.' };
    }
    const extractedText = await extractText(buffer, fileType);
    if (extractedText === '__NEEDS_MANUAL_OCR__') {
      return { success: true, status: 'needs_manual_ocr', message: 'File gambar memerlukan OCR manual.', fileType, fileName: fileUrl.split('/').pop() || '' };
    }
    if (!extractedText || extractedText.length < 10) {
      return { success: false, error: 'Tidak bisa mengekstrak teks dari file ini.' };
    }
    const aiData = await geminiStructuredExtract(extractedText);
    if (!aiData || typeof aiData !== 'object') {
      return { success: false, error: 'AI tidak bisa mengekstrak data dari dokumen ini.' };
    }
    const no_wa = normalizeWa(String(aiData.no_wa || wa || ''));
    // Post-extraction gate: the document may name a WA other than the
    // uploader's (someone else's CV) — a kandidat must not upsert into it.
    if (t.role === 'kandidat' && no_wa && no_wa !== normalizeWa(String(t.wa || ''))) {
      return { success: false, error: 'Akses ditolak: dokumen atas nama kandidat lain.' };
    }
    const email = String(aiData.email || '').trim().toLowerCase();
    const nik = String(aiData.nik || '').trim();
    const nama = String(aiData.nama_lengkap || '').trim().toUpperCase();
    if (aiData.gender) {
      const g = normalizeGender(aiData.gender);
      if (g) aiData.gender = g;
    }
    cacheClear();
    let upsertedRow: Record<string, unknown> | null = null;
    let action: 'created' | 'updated' = 'updated';
    if (no_wa) {
      const existing = await findMasterByWa(no_wa);
      if (existing && existing.id !== undefined) {
        const patchBody: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (nama) patchBody.nama_lengkap = nama;
        if (email) patchBody.email = email;
        if (nik) patchBody.nik = nik;
        if (aiData.gender) patchBody.gender = aiData.gender;
        if (aiData.usia) patchBody.usia = String(aiData.usia);
        if (aiData.tempat_lahir) patchBody.tempat_lahir = String(aiData.tempat_lahir);
        if (aiData.tgl_lahir) patchBody.tgl_lahir = String(aiData.tgl_lahir);
        if (aiData.alamat) patchBody.alamat_lengkap = String(aiData.alamat);
        if (aiData.pendidikan) patchBody.pendidikan_1_tingkat = String(aiData.pendidikan);
        if (aiData.pekerjaan) patchBody.pekerjaan_1_nama_perusahaan = String(aiData.pekerjaan);
        if (Array.isArray(aiData.skills) && aiData.skills.length) {
          const { parseJsonLoose } = await import('../../_lib/ai/providers');
          const existingAi = existing.ai_data_json ? parseJsonLoose(String(existing.ai_data_json)) : {};
          patchBody.ai_data_json = JSON.stringify({ ...(existingAi || {}), skills: aiData.skills, source: 'smart_ingestion' });
        }
        await patchMaster(String(existing.id), patchBody);
        upsertedRow = { id: existing.id, ...patchBody };
        action = 'updated';
      } else {
        const idKandidat = await nextCandidateId();
        const postBody: Record<string, unknown> = {
          id_kandidat: idKandidat, nama_lengkap: nama || 'KANDIDAT', no_wa,
          gender: aiData.gender || '', usia: aiData.usia ? String(aiData.usia) : '',
          tempat_lahir: aiData.tempat_lahir ? String(aiData.tempat_lahir) : '',
          tgl_lahir: aiData.tgl_lahir ? String(aiData.tgl_lahir) : '',
          alamat_lengkap: aiData.alamat ? String(aiData.alamat) : '',
          email, nik,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        };
        if (aiData.pendidikan) postBody.pendidikan_1_tingkat = String(aiData.pendidikan);
        if (aiData.pekerjaan) postBody.pekerjaan_1_nama_perusahaan = String(aiData.pekerjaan);
        if (Array.isArray(aiData.skills) && aiData.skills.length) {
          postBody.ai_data_json = JSON.stringify({ skills: aiData.skills, source: 'smart_ingestion' });
        }
        const result = await upsertMaster(postBody);
        upsertedRow = Array.isArray(result) ? result[0] : result;
        action = 'created';
      }
    } else {
      return { success: true, status: 'extracted_no_upsert', message: 'Data berhasil diekstrak, tapi tidak ada nomor WA untuk upsert.', data: aiData, extractedTextLength: extractedText.length };
    }
    return {
      success: true, action,
      data: { nama_lengkap: nama, email, nik, no_wa, gender: aiData.gender || '', skills: aiData.skills || [] },
      upsertedId: upsertedRow?.id, extractedTextLength: extractedText.length, parsedByAi: true,
    };
  } catch (e: unknown) {
    // safeError sudah console.error detail internal di server.
    return { success: false, error: safeError('Gagal memproses file.', e) };
  }
}
