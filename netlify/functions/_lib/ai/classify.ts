import { normalizeWa, pick, normalizeGender } from '../db/client.ts';
import { findCandidateByIdFiltered, findCandidates } from '../db/candidates.ts';
import { requireRole } from '../../contexts/identity';
import { findMasterByWa } from './cv';
import { geminiParseFile, parseJsonLoose } from './providers';
import { AppError, safeError } from '../kernel/errors';
// ai/classify.js — domain AI klasifikasi & parse dokumen biodata/CV admin
// (PDF/Excel/Word/CSV/TXT/gambar → Gemini → JSON). MODUL BARU (Fase 1.4

// ---------------------------------------------------------------------------
// parseDokumenBiodata — admin upload file CV (PDF/Excel/Word/CSV/TXT/gambar)
// → Gemini parse → JSON biodata (kunci MASTER_COLUMN_MAP camelCase, sama
// dengan payload submitMasterForm) → frontend bisa langsung update master.
// ---------------------------------------------------------------------------
const PARSE_MAX_BYTES = 8 * 1024 * 1024;
const PARSE_ALLOWED_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
  'application/vnd.ms-excel', // xls
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
  'application/msword', // doc
  'text/csv',
  'text/plain',
  'text/html',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif', // hasil scan foto CV
]);

const PARSE_SYSTEM_PROMPT = [
  'Kamu adalah asisten HRD ASJ (PT Amanah Sakura Japan).',
  'Admin mengupload dokumen biodata/CV kandidat kerja ke Jepang.',
  'Ekstrak semua data yang bisa kamu baca ke JSON MURNI (tanpa teks lain, tanpa markdown fence).',
  'Hanya isi field yang benar-benar ada di dokumen — yang tidak ada, OMIT (jangan null/string kosong).',
  'Normalisasi: nama dalam HURUF KAPITAL, tanggal lahir format YYYY-MM-DD, nomor HP/WA tanpa spasi.',
  'Kunci yang diizinkan (persis, camelCase):',
  'nama, furigana, panggilan, panggilanKatakana, gender, tempatLahir, tglLahir, usia, agama, statusNikah,',
  'anak, ktp, sim, alamat, email, tb, bb, goldar, tangan, baju, sepatu, topi, tahanAc,',
  'mataKiri, mataKanan, kacamata, butaWarna, tato, tindik, merokok, alkohol, penyakit, alergi, laka,',
  'promosi, kelebihan, kekurangan, keahlianKhusus, hobi, alasanBidang, motivasiJepang, keinginan,',
  'rencanaPulang, tujuanJepang, eksJepang, daruratNama, daruratHubungan, daruratWa,',
  'kenalanNama, kenalanHubungan, kenalanPekerjaan, kenalanUsia, kenalanAlamat, lamaJepang,',
  'gajiYen, tabungan, bhsJepang, nilai, lisensi, ssw, noPaspor, tglTerbitPaspor, expPaspor, kotaPaspor, noCoe.',
  'gender: Laki-laki/L/P/MALE → "L", Perempuan/P/FEMALE → "P".',
  'Riwayat sebagai ARRAY (maks 5 pendidikan, 3 pekerjaan, 5 keluarga):',
  'pendidikan: [{ tingkat, namaSekolah, jurusan, tahunMasuk, tahunLulus }]',
  'pekerjaan: [{ namaPerusahaan, jabatan, tahunMasuk, tahunKeluar, gaji }]',
  'keluarga: [{ nama, usia, hubungan, pekerjaan }]',
  'Bahasa Jepang pada dokumen (nama katakana, alamat jp, dll) tetap disalin apa adanya.',
  'Kembalikan HANYA objek JSON valid.',
].join(' ');

async function handleParseDokumenBiodata(payload: unknown, sessionToken: string | undefined) {
  const guard = requireRole(sessionToken, 'admin');
  if (guard.error) return guard.error;
  const d = (payload && (payload as any[])[0]) || {};
  const file = d.file || {};
  const name = String(file.name || '').trim();
  const mimeType = String(file.mimeType || file.type || '').trim();
  const data = String(file.data || '').trim();
  if (!name || !data) return { success: false, error: 'File belum dipilih.' };
  let buf;
  try {
    buf = Buffer.from(data, 'base64');
  } catch (e: any) {
    return { success: false, error: 'File tidak bisa dibaca.' };
  }
  if (buf.length > PARSE_MAX_BYTES) {
    return { success: false, error: 'File terlalu besar (maks 8 MB).' };
  }
  if (!PARSE_ALLOWED_MIME.has(mimeType)) {
    return {
      success: false,
      error:
        'Format tidak didukung: ' +
        (name.split('.').pop() || mimeType || '?') +
        '. Gunakan PDF/Excel/Word/CSV/TXT/gambar.',
    };
  }

  // Target kandidat: dari WA eksplisit, atau resolve dari candidateId (admin
  // membuka AI copilot dari baris kandidat → cukup klik upload).
  let wa = normalizeWa(String(d.wa || ''));
  if (!wa && d.candidateId) {
    let cand = await findCandidateByIdFiltered(String(d.candidateId));
    if (cand === undefined) {
      const found = await findCandidates();
      cand =
        (found.rows || []).find(
          (r) => String(pick(r, ['id_kandidat', 'id']) || '') === String(d.candidateId),
        ) || null;
    }
    if (cand) wa = normalizeWa(String(cand.no_wa || ''));
  }
  if (!wa) {
    return {
      success: false,
      error: 'Nomor WA kandidat tidak ditemukan — pilih kandidat dulu atau isi nomor WA.',
    };
  }

  let namaSekarang = '';
  try {
    const m = await findMasterByWa(wa);
    if (m) namaSekarang = String(m.nama_lengkap || '');
  } catch (e: any) {
    /* opsional */
  }

  try {
    const reply = await geminiParseFile(PARSE_SYSTEM_PROMPT, { mimeType, data });
    const parsed = parseJsonLoose(reply);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        success: false,
        error: 'AI tidak bisa mengekstrak data dari file ini. Coba file lain.',
      };
    }

    if (parsed.gender) {
      const g = normalizeGender(parsed.gender);
      if (g) parsed.gender = g;
    }

    const fields = Object.keys(parsed).filter(
      (k) => k !== 'pendidikan' && k !== 'pekerjaan' && k !== 'keluarga',
    );
    return {
      success: true,
      wa,
      namaSekarang,
      fileName: name,
      data: parsed,
      fieldCount: fields.length,
      riwayat: {
        pendidikan: Array.isArray(parsed.pendidikan) ? parsed.pendidikan.length : 0,
        pekerjaan: Array.isArray(parsed.pekerjaan) ? parsed.pekerjaan.length : 0,
        keluarga: Array.isArray(parsed.keluarga) ? parsed.keluarga.length : 0,
      },
    };
  } catch (e: any) {
    // PR4 (playbook §3.3): jangan bocorkan detail internal — safeError sudah
    // console.error pesan aslinya di server.
    // The code travels too: `geminiParseFile` raises AI_UNAVAILABLE when the
    // provider cannot answer, and the client needs that to tell "AI is down"
    // (show the banner, retry later) from "this file was rejected".
    const code = e instanceof AppError ? e.code : undefined;
    return {
      success: false,
      error: safeError('Gagal parse dokumen.', e),
      ...(code ? { code, retryAfter: e.retryAfter } : {}),
    };
  }
}

export { handleParseDokumenBiodata };
