/**
 * contexts/documents/service.ts — Business logic for document upload/download
 *
 * Other contexts and surfaces import ONLY from index.ts.
 */
import crypto from "crypto";
import bcrypt from "bcryptjs";
import {
  normalizeWa,
  pick,
  supabaseJson,
  supabaseUpsert,
  toText,
  findFormByWa,
  findFormByWaJob,
  findCandidateRow,
  findMasterByWa,
  findCandidatesByJob,
  fetchAllMasters,
  findCandidates,
  findFormsByWa,
  findForms,
  upsertFormRow,
  mapCandidate,
  nextCandidateId,
  hasBackend,
  supabaseUrl,
} from "./repository";
import { requireRole, isOwnerOrAdmin } from "../identity";
import { emit } from "../../_lib/kernel/events";
import { syncFormMailDariUpload } from "../applications";
import { cacheClear } from "../../_lib/cache";
import { findJobByCodeFiltered, findJobs } from "../../_lib/db/jobs";
import * as session from "../../_lib/session";
import { isAllowedDocumentUrl } from "../../_lib/storage";

const APPLY_WA_COLS = ["no_wa", "wa", "whatsapp"];
// K3 fix: whitelist prefill anonim dipangkas — hapus URL dokumen (pasPhoto,
// jft, ssw, fileCv), email, alamat & TTL yang bisa dipakai enumerasi PII.
// Data lengkap tetap hanya untuk owner/admin.
const PUBLIC_PREFILL_FIELDS = new Set([
  "idKandidat",
  "id",
  "nama",
  "wa",
  "gender",
  "usia",
  "tb",
  "bb",
  "tbBb",
  "pendidikan",
  "tempatLahir",
  "tglLahir",
  "jftText",
  "sswText",
  "idLoker",
  "tahapan",
  "status",
]);

function pickPrefill(data: any) {
  const safe: Record<string, any> = {};
  for (const k of Object.keys(data || {})) {
    if (PUBLIC_PREFILL_FIELDS.has(k)) safe[k] = data[k];
  }
  return safe;
}

// Exported for DB-free parity tests (A05): the modal sends these canonical
// tokens; legacy clients send the long-label aliases further down.
export const FILE_LABEL_COLUMNS: Record<
  string,
  { cand: string | null; master: string | null; pemberkasan: string | null }
> = {
  PAS_PHOTO: { cand: "pas_photo", master: "pas_photo", pemberkasan: null },
  CV: { cand: "file_cv", master: "file_cv", pemberkasan: null },
  CV_REVISI: { cand: "file_cv", master: "file_cv", pemberkasan: null },
  JFT: { cand: "jft", master: "jft_url", pemberkasan: null },
  SSW: { cand: "ssw", master: "ssw_url", pemberkasan: null },
  KTP: { cand: null, master: "ktp_url", pemberkasan: "ktp_url" },
  "KARTU KELUARGA": { cand: null, master: "kk_url", pemberkasan: "kk_url" },
  KK: { cand: null, master: "kk_url", pemberkasan: "kk_url" },
  "IJAZAH SD": { cand: null, master: "ijazah_sd_url", pemberkasan: "sd_url" },
  "IJAZAH SMP": {
    cand: null,
    master: "ijazah_smp_url",
    pemberkasan: "smp_url",
  },
  "IJAZAH SMA": {
    cand: null,
    master: "ijazah_sma_url",
    pemberkasan: "sma_url",
  },
  UNIVERSITAS: { cand: null, master: "univ_url", pemberkasan: "univ_url" },
  AKTE: { cand: null, master: null, pemberkasan: "akte_url" },
  PASPORT: { cand: null, master: null, pemberkasan: "pasport_url" },
  PASSPORT: { cand: null, master: null, pemberkasan: "pasport_url" },
  MCU: { cand: null, master: null, pemberkasan: "mcu_url" },
  KONTRAK: { cand: null, master: null, pemberkasan: "kontrak_url" },
  SERTIFIKAT: { cand: null, master: null, pemberkasan: "cert_url" },
  "FOTO 2X3": { cand: null, master: null, pemberkasan: "foto2_url" },
  "IZIN ORTU": { cand: null, master: null, pemberkasan: "ijinortu_url" },
  CPMI: { cand: null, master: null, pemberkasan: "cpmi_url" },
  "BUKU NIKAH": { cand: null, master: null, pemberkasan: "kawin_url" },
  "SURAT SEHAT": { cand: null, master: null, pemberkasan: "sehat_url" },
  BPJS: { cand: null, master: null, pemberkasan: "bpjs_url" },
  PSIKOTES: { cand: null, master: null, pemberkasan: "psikotes_url" },
  // Aliases — canonical label strings used by the LIVE legacy client
  // (js/03_candidate.ts prosesUploadPemberkasan & modal-pemberkasan). The
  // rebuild modal now sends the canonical keys above, but rows/robots that
  // still speak legacy labels must map to the same columns instead of being
  // silently dropped (A05 parity fix, 2026-09-04).
  "CERTIFICATE JAPAN": { cand: null, master: null, pemberkasan: "cert_url" },
  "PAS FOTO STUDIO": { cand: null, master: null, pemberkasan: "foto2_url" },
  "SURAT IJIN ORTU": { cand: null, master: null, pemberkasan: "ijinortu_url" },
  "STATUS PERKAWINAN": { cand: null, master: null, pemberkasan: "kawin_url" },
  "SURAT SEHAT PUSKESMAS": {
    cand: null,
    master: null,
    pemberkasan: "sehat_url",
  },
  "HASIL PSIKOTES": { cand: null, master: null, pemberkasan: "psikotes_url" },
  "IJAZAH UNIVERSITAS": {
    cand: null,
    master: "univ_url",
    pemberkasan: "univ_url",
  },
};

function fileLabelKey(label: string): string | null {
  const l = String(label || "")
    .trim()
    .toUpperCase();
  return FILE_LABEL_COLUMNS[l] ? l : null;
}

const DOC_URL_SENTINELS = new Set(["-", "null", "undefined"]);

// C6 fix (2026-09-04): every document URL persisted from a request must be
// https and from an allow-listed storage host (see _lib/storage
// isAllowedDocumentUrl). Placeholder values ('-') are skipped. Returns the
// offending entries so callers reject before any DB write / download.
function badDocumentUrls(
  entries: Array<{ key: string; url: unknown }>,
): string[] {
  const bad: string[] = [];
  for (const e of entries) {
    const u = String(e.url ?? "").trim();
    if (!u || DOC_URL_SENTINELS.has(u.toLowerCase())) continue;
    if (!isAllowedDocumentUrl(u)) bad.push(e.key + " (" + u.slice(0, 90) + ")");
  }
  return bad;
}

function fireIngest(payload: unknown[], sessionToken?: string): void {
  // P34 fix: /ingest adalah stub NOT_IMPLEMENTED permanen — self-HTTP call
  // per upload/apply hanya membuang budget function. Smart Ingestion di-log
  // saja sampai implementasi nyata tersedia.
  console.log(
    "[Smart Ingest] disabled (stub):",
    JSON.stringify({ payload, hasSession: !!sessionToken }).slice(0, 200),
  );
}

export async function handleGetUploadUrls(
  payload: any[],
  sessionToken?: string,
) {
  const t = session.verifyToken(sessionToken);
  if (!t || (t.role !== "admin" && t.role !== "kandidat")) {
    return {
      success: false,
      sessionInvalid: true,
      message: "Sesi tidak valid",
    };
  }
  if (!hasBackend())
    return { success: false, error: "Backend belum dikonfigurasi." };
  const body = (payload && payload[0]) || payload || {};
  const files = Array.isArray(body.files) ? body.files : [];
  // K3 fix: folder upload kandidat SELALU turun dari sesi — folder bebas dari
  // klien (dengan hapusJenisVarian di bawah) bisa menghapus/menimpa dokumen
  // kandidat lain di master/<NAMA_LAIN>.
  const rawFolder = String(body.folder || "misc")
    .split("/")
    .filter((s) => s && s !== ".." && s !== ".")
    .join("/");
  const folder =
    t.role === "kandidat"
      ? "kandidat/" + normalizeWa(String(t.wa || ""))
      : rawFolder;
  if (files.length === 0)
    return { success: false, error: "Tidak ada file untuk diupload." };
  const urls: Record<string, any> = {};
  try {
    const { storageRequest, publicUrl, hapusJenisVarian, bucket } =
      await import("../../_lib/storage");
    for (const f of files) {
      const key = String(f.key || "").trim();
      if (!key) continue;
      const prefix =
        String(f.prefix || key)
          .trim()
          .replace(/[^a-zA-Z0-9_-]/g, "_") || "FILE";
      const ext =
        String(f.ext || "bin")
          .replace(/[^a-z0-9]/gi, "")
          .toLowerCase() || "bin";
      const path = (folder ? folder + "/" : "") + prefix + "." + ext;
      await hapusJenisVarian(folder, prefix);
      const res = await storageRequest(
        "POST",
        "object/upload/sign/" + bucket() + "/" + path,
        {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expiresIn: 120 }),
        },
      );
      const rel =
        res && res.url
          ? String(res.url)
          : "/object/upload/sign/" + bucket() + "/" + path;
      urls[key] = {
        signedUrl:
          supabaseUrl().replace(/\/$/, "") +
          "/storage/v1" +
          (rel.startsWith("/") ? rel : "/" + rel),
        publicUrl: publicUrl(path),
      };
    }
    return { success: true, urls };
  } catch (e: any) {
    return {
      success: false,
      error: "Gagal membuat link upload. Silakan coba lagi.",
    };
  }
}

export async function handleCekDataPelamar(
  payload: any[],
  sessionToken?: string,
) {
  let wa = String((payload && payload[0]) || "");
  const t = session.verifyToken(sessionToken);
  if (!t || (t.role !== "admin" && t.role !== "kandidat")) {
    return {
      success: false,
      sessionInvalid: true,
      message: "Sesi tidak valid",
    };
  }
  // K3 fix: kandidat hanya boleh cek profil DIRINYA — WA payload diabaikan.
  if (t.role === "kandidat") wa = normalizeWa(String(t.wa || ""));
  if (!wa) return { found: false, applications: [] };
  try {
    let rows = await findFormsByWa(wa);
    if (rows === undefined) rows = await findForms();
    const want = normalizeWa(wa);
    const apps = rows
      .filter((r: any) => normalizeWa(String(r.no_wa || r.wa || "")) === want)
      .map((r: any) => ({
        code: toText(r.code_job || ""),
        status: toText(r.status || "MENUNGGU"),
        timestamp: toText(r.timestamp || r.created_at || ""),
      }))
      .sort((a: any, b: any) =>
        String(b.timestamp).localeCompare(String(a.timestamp)),
      );
    const myRows = rows.filter(
      (r: any) => normalizeWa(String(r.no_wa || r.wa || "")) === want,
    );
    if (!myRows.length) {
      const cands = await findCandidates();
      const candRow = (Array.isArray(cands?.rows) ? cands.rows : []).find(
        (r: any) =>
          normalizeWa(String(pick(r, ["no_wa", "wa", "whatsapp"]) || "")) ===
          want,
      );
      if (candRow) {
        return {
          found: true,
          nama: toText(pick(candRow, ["nama_lengkap", "nama"])),
          gender: toText(pick(candRow, ["gender", "jenis_kelamin"])),
          usia: toText(pick(candRow, ["usia", "umur"])),
          tb: toText(pick(candRow, ["tb"])),
          bb: toText(pick(candRow, ["bb"])),
          pasPhoto: toText(pick(candRow, ["pas_photo"])) || "-",
          photoUrl: toText(pick(candRow, ["pas_photo"])) || "-",
          jftUrl: toText(pick(candRow, ["jft"])) || "-",
          sswUrl: toText(pick(candRow, ["ssw"])) || "-",
          email: toText(pick(candRow, ["email"])),
          applications: apps,
        };
      }
      return { found: false, applications: apps };
    }
    const first = myRows[0];
    const pickFirstNonEmpty = (fields: string[]) => {
      for (const r of myRows) {
        const v = toText(pick(r, fields));
        if (v && v !== "-" && v !== "null") return v;
      }
      return "-";
    };
    const extraFilesMap: Record<string, any> = {};
    myRows.forEach((r: any) => {
      const ket = toText(pick(r, ["keterangan"])) || "";
      ket.split(";").forEach((p: string) => {
        const parts = p.split(":");
        if (parts.length >= 2) {
          const key = parts[0].trim().toUpperCase();
          const val = parts.slice(1).join(":").trim();
          if (key && val.startsWith("http") && !extraFilesMap[key])
            extraFilesMap[key] = val;
        }
      });
    });
    let finalPhoto = pickFirstNonEmpty(["pas_photo", "pasPhoto", "photo"]);
    let finalJft = pickFirstNonEmpty(["jft", "jft_url"]);
    let finalSsw = pickFirstNonEmpty(["ssw", "ssw_url"]);
    let finalEmail = "";
    try {
      const cands = await findCandidates();
      const candRow = (Array.isArray(cands?.rows) ? cands.rows : []).find(
        (r: any) =>
          normalizeWa(String(pick(r, ["no_wa", "wa", "whatsapp"]) || "")) ===
          want,
      );
      if (candRow) {
        finalEmail = toText(pick(candRow, ["email"]));
        if (finalPhoto === "-") {
          const cPhoto = toText(pick(candRow, ["pas_photo"]));
          if (cPhoto && cPhoto !== "-") finalPhoto = cPhoto;
        }
        if (finalJft === "-") {
          const cJft = toText(pick(candRow, ["jft"]));
          if (cJft && cJft !== "-") finalJft = cJft;
        }
        if (finalSsw === "-") {
          const cSsw = toText(pick(candRow, ["ssw"]));
          if (cSsw && cSsw !== "-") finalSsw = cSsw;
        }
      }
    } catch {
      /* fallback */
    }
    return {
      found: true,
      nama: toText(pick(first, ["nama_lengkap", "nama"])),
      gender: toText(pick(first, ["gender", "jenis_kelamin"])),
      usia: toText(pick(first, ["usia", "umur"])),
      tb: toText(pick(first, ["tb"])),
      bb: toText(pick(first, ["bb"])),
      pasPhoto: finalPhoto,
      photoUrl: finalPhoto,
      jftUrl: finalJft,
      sswUrl: finalSsw,
      email: finalEmail,
      applications: apps,
    };
  } catch {
    return { found: false, applications: [] };
  }
}

export async function handleSubmitApply(payload: any[], sessionToken?: string) {
  cacheClear();
  const d = (payload && payload[0]) || {};
  const wa = normalizeWa(String(d.wa || ""));
  const code = String(d.job || "").trim();
  if (!wa || !code || !d.nama)
    return { success: false, message: "Data lamaran tidak lengkap." };
  const applyDocCheck: Array<{ key: string; url: unknown }> = [
    { key: "PAS_PHOTO", url: d.photoFile || d.oldPhoto },
    { key: "CV", url: d.cvFile || d.oldCv },
    { key: "JFT", url: d.jftFile || d.oldJft },
    { key: "SSW", url: d.sswFile || d.oldSsw },
  ];
  (d.extraFiles || []).forEach((x: any, i: number) =>
    applyDocCheck.push({
      key: "extra#" + i + ":" + String((x && x.name) || "FILE"),
      url: x && x.url,
    }),
  );
  const badApplyDocs = badDocumentUrls(applyDocCheck);
  if (badApplyDocs.length) {
    return {
      success: false,
      message:
        "URL dokumen tidak valid (https + host penyimpanan resmi saja): " +
        badApplyDocs.join(", "),
    };
  }
  try {
    let job = await findJobByCodeFiltered(code);
    if (job === undefined) {
      const found = await findJobs();
      job =
        found.rows.find(
          (r: any) => String(pick(r, ["code_job", "code"]) || "") === code,
        ) || null;
    }
    if (!job)
      return { success: false, message: "Kode loker tidak ditemukan: " + code };
    const share = String(pick(job, ["dokumen_share"]) || "")
      .split(",")
      .map((s: string) => s.trim().toUpperCase())
      .filter(Boolean);
    const have = new Set();
    if (d.cvFile || d.oldCv) have.add("CV");
    if (d.jftFile || d.oldJft) have.add("JFT");
    if (d.sswFile || d.oldSsw) have.add("SSW");
    (d.extraFiles || []).forEach((x: any) =>
      have.add(String((x && x.name) || "").toUpperCase()),
    );
    const missingCore = share.filter(
      (req: string) => ["CV", "JFT", "SSW"].includes(req) && !have.has(req),
    );
    if (missingCore.length)
      return {
        success: false,
        message:
          "Berkas belum lengkap. Harup upload: " + missingCore.join(", "),
      };
    const jobBidang = String(
      pick(job, ["kategori", "category", "bidang", "sektor"]) || "",
    );
    const body: Record<string, any> = {
      timestamp: new Date().toISOString(),
      code_job: code,
      kategory: String(d.bidang || jobBidang || ""),
      nama_lengkap: String(d.nama || "")
        .trim()
        .toUpperCase(),
      no_wa: wa,
      email: String(d.email || "").trim(),
      gender: String(d.gender || ""),
      usia: String(d.usia || ""),
      tb: String(d.tb || ""),
      bb: String(d.bb || ""),
      pas_photo: d.photoFile || d.oldPhoto || "",
      jft: d.jftFile || d.oldJft || "",
      ssw: d.sswFile || d.oldSsw || "",
      file_cv: d.cvFile || d.oldCv || "",
      status: "MENUNGGU",
      keterangan: (d.extraFiles || [])
        .map(
          (x: any) =>
            String((x && x.name) || "") + ":" + String((x && x.url) || ""),
        )
        .join(";"),
    };
    const existing = await findFormByWaJob(wa, code);
    if (existing && existing.id !== undefined) {
      // K3 fix: jalur publik TIDAK boleh menimpa lamaran existing (cukup tahu
      // wa+code bisa membajak/reset status lamaran orang lain) — PATCH hanya
      // untuk pemilik sesi/admin.
      if (!isOwnerOrAdmin(sessionToken, wa)) {
        return {
          success: false,
          message:
            "Lamaran untuk nomor WA ini sudah ada. Silakan login untuk memperbarui lamaran.",
        };
      }
      await supabaseJson("PATCH", "database_asj_form", {
        query: { id: "eq." + existing.id },
        body,
        headers: { Prefer: "return=minimal" },
      });
    } else {
      await upsertFormRow(body);
    }
    try {
      const candRow = await findCandidateRow(wa);
      if (candRow && candRow.id !== undefined) {
        const candPatch: Record<string, any> = {};
        if (String(body.pas_photo || "").trim() && body.pas_photo !== "-")
          candPatch.pas_photo = body.pas_photo;
        if (String(body.jft || "").trim() && body.jft !== "-")
          candPatch.jft = body.jft;
        if (String(body.ssw || "").trim() && body.ssw !== "-")
          candPatch.ssw = body.ssw;
        if (String(body.file_cv || "").trim() && body.file_cv !== "-")
          candPatch.file_cv = body.file_cv;
        if (Object.keys(candPatch).length) {
          await supabaseJson("PATCH", "database_candidate", {
            query: { id: "eq." + candRow.id },
            body: candPatch,
            headers: { Prefer: "return=minimal" },
          });
        }
      }
    } catch {
      /* non-fatal */
    }
    try {
      const mRow = await findMasterByWa(wa);
      if (mRow && mRow.id !== undefined) {
        const masterPatch: Record<string, any> = {};
        (d.extraFiles || []).forEach((x: any) => {
          const label = String((x && x.name) || "")
            .trim()
            .toUpperCase();
          const url = String((x && x.url) || "").trim();
          if (!label || !url) return;
          const key = fileLabelKey(label);
          const map = key ? FILE_LABEL_COLUMNS[key] : null;
          if (map && map.master) masterPatch[map.master] = url;
        });
        if (Object.keys(masterPatch).length) {
          await supabaseJson("PATCH", "master_database_candidate", {
            query: { id: "eq." + mRow.id },
            body: masterPatch,
            headers: { Prefer: "return=minimal" },
          });
        }
      }
    } catch {
      /* non-fatal */
    }
    try {
      const { notifyAdmins } = await import("../../_lib/fcm-helpers");
      notifyAdmins(
        "Lamaran Baru!",
        `${d.nama || "Kandidat"} baru saja melamar posisi ${code}.`,
        "/admin.html",
      );
    } catch {
      /* non-fatal */
    }
    const PARSEABLE_EXTS = new Set([
      "pdf",
      "docx",
      "xlsx",
      "xls",
      "csv",
      "txt",
    ]);
    const ingestFiles: any[] = [];
    const collectIngest = (fileUrl: string) => {
      if (!fileUrl) return;
      const ext = (String(fileUrl).split(".").pop() || "")
        .split("?")[0]
        .toLowerCase();
      if (PARSEABLE_EXTS.has(ext)) ingestFiles.push({ fileUrl, fileType: ext });
    };
    collectIngest(d.cvFile || d.oldCv);
    collectIngest(d.jftFile || d.oldJft);
    collectIngest(d.sswFile || d.oldSsw);
    (d.extraFiles || []).forEach((x: any) => collectIngest(x && x.url));
    if (ingestFiles.length && wa)
      fireIngest(
        ingestFiles.map((f) => ({ ...f, wa })),
        undefined,
      );
    return {
      success: true,
      message: "Lamaran berhasil dikirim. Terima kasih.",
    };
  } catch (e: any) {
    return { success: false, message: "Gagal simpan lamaran: " + e.message };
  }
}

export async function handleGetExistingCandidateJsonByWa(
  payload: any[],
  sessionToken?: string,
) {
  const wa = String((payload && payload[0]) || "");
  try {
    const row = await findCandidateRow(wa);
    if (!row) return { success: false, error: "Kandidat tidak ditemukan." };
    const data = mapCandidate(row);
    if (isOwnerOrAdmin(sessionToken, wa)) return { success: true, data };
    return { success: true, data: pickPrefill(data), limited: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function handleSimpanKandidatDanUpload(
  payload: any[],
  sessionToken?: string,
) {
  const guard = requireRole(sessionToken || "", "admin");
  if (guard.error) return guard.error;
  cacheClear();
  const d = (payload && payload[0]) || {};
  const wa = normalizeWa(String(d.wa || ""));
  if (!d.nama || !wa)
    return { success: false, error: "Nama dan nomor WA wajib diisi." };
  if (wa.length < 12 || wa.length > 13)
    return { success: false, error: "Nomor WA tidak valid (" + wa + ")." };
  try {
    const nama = String(d.nama).trim().toUpperCase();
    let existing = await findCandidateRow(wa);
    const idKand = existing
      ? String(pick(existing, ["id_kandidat", "id"]) || "")
      : await nextCandidateId();
    const folder = "master/" + nama.replace(/[^A-Z0-9_-]/g, "_");
    const uploaded: string[] = [];
    const files = Array.isArray(d.files) ? d.files : [];
    const fileUrls: Record<string, any> = {};
    const { uploadBase64 } = await import("../../_lib/storage");
    for (const f of files) {
      if (!f) continue;
      const label = String(f.label || "").toUpperCase();
      let url = String(f.url || "").trim();
      if (!url && f.data) {
        const ext =
          String(f.name || "file")
            .split(".")
            .pop() || "jpg";
        url =
          (await uploadBase64(f.data, folder, (label || "FILE") + "." + ext)) ??
          "";
      }
      // C6 fix: a client-supplied URL string must be https from an allow-listed
      // storage host (base64 uploads already produced our own public URL).
      const badAdminDocs = badDocumentUrls([{ key: label || "FILE", url }]);
      if (badAdminDocs.length)
        return {
          success: false,
          error:
            "URL file tidak valid (https + host penyimpanan resmi saja): " +
            badAdminDocs.join(", "),
        };
      if (url) {
        fileUrls[label] = url;
        uploaded.push(label);
      }
    }
    const now = new Date().toISOString();
    // H6 fix: password default acak (bukan 4 digit terakhir WA yang mudah
    // ditebak) — dikembalikan ke admin untuk diteruskan ke kandidat.
    const generatedPassword = String(crypto.randomInt(100000, 1000000));
    const hash = bcrypt.hashSync(generatedPassword, 10);
    const candBody: Record<string, any> = {
      id_kandidat: idKand,
      nama_lengkap: nama,
      gender: String(d.gender || ""),
      usia: String(d.usia || ""),
      tb: String(d.tb || ""),
      bb: String(d.bb || ""),
      pendidikan: String(d.pendidikan || ""),
      no_wa: wa,
      id_loker_pilihan: String(d.loker || ""),
      tahapan_seleksi: "LIST",
      status_kandidat: "",
      tanggal_daftar: now,
      pas_photo: fileUrls.PAS_PHOTO || "",
      jft: fileUrls.JFT || "",
      ssw: fileUrls.SSW || "",
      file_cv: fileUrls.CV || "",
      password_kandidat: hash,
      password_diubah: false,
      created_at: now,
      updated_at: now,
    };
    const masterBody: Record<string, any> = {
      id_kandidat: idKand,
      nama_lengkap: nama,
      gender: candBody.gender,
      usia: candBody.usia,
      tb: candBody.tb,
      bb: candBody.bb,
      no_wa: wa,
      pas_photo: candBody.pas_photo,
      jft_url: fileUrls.JFT || "",
      ssw_url: fileUrls.SSW || "",
      file_cv: fileUrls.CV || "",
    };
    const formBody: Record<string, any> = {
      timestamp: now,
      code_job: String(d.loker || ""),
      nama_lengkap: nama,
      no_wa: wa,
      gender: candBody.gender,
      usia: candBody.usia,
      tb: candBody.tb,
      bb: candBody.bb,
      pas_photo: candBody.pas_photo,
      jft: fileUrls.JFT || "",
      ssw: fileUrls.SSW || "",
      file_cv: fileUrls.CV || "",
      status: "MENUNGGU",
    };
    if (existing && existing.id !== undefined) {
      const upd = Object.assign({}, candBody);
      delete upd.id_kandidat;
      delete upd.password_kandidat;
      delete upd.password_diubah;
      delete upd.tanggal_daftar;
      delete upd.tahapan_seleksi;
      delete upd.status_kandidat;
      delete upd.created_at;
      await supabaseJson("PATCH", "database_candidate", {
        query: { id: "eq." + existing.id },
        body: upd,
        headers: { Prefer: "return=minimal" },
      });
    } else {
      await supabaseUpsert("database_candidate", candBody, ["no_wa"], {
        headers: { Prefer: "return=minimal" },
      });
    }
    const mRow = await findMasterByWa(wa);
    if (mRow && mRow.id !== undefined) {
      await supabaseJson("PATCH", "master_database_candidate", {
        query: { id: "eq." + mRow.id },
        body: Object.assign({}, masterBody, { updated_at: now }),
        headers: { Prefer: "return=minimal" },
      });
    } else {
      await supabaseUpsert(
        "master_database_candidate",
        Object.assign({ created_at: now, updated_at: now }, masterBody),
        ["no_wa"],
        { headers: { Prefer: "return=minimal" } },
      );
    }
    const fRow = await findFormByWa(wa);
    if (fRow && fRow.id !== undefined) {
      await supabaseJson("PATCH", "database_asj_form", {
        query: { id: "eq." + fRow.id },
        body: Object.assign({}, formBody, { updated_at: now }),
        headers: { Prefer: "return=minimal" },
      });
    } else {
      await upsertFormRow(
        Object.assign({ created_at: now, updated_at: now }, formBody),
      );
    }
    const PARSEABLE_EXTS = new Set([
      "pdf",
      "docx",
      "xlsx",
      "xls",
      "csv",
      "txt",
    ]);
    const ingestFiles: any[] = [];
    for (const f of files) {
      if (!f) continue;
      const fUrl = String(f.url || "").trim();
      if (!fUrl) continue;
      const ext = (fUrl.split(".").pop() || "").split("?")[0].toLowerCase();
      if (PARSEABLE_EXTS.has(ext))
        ingestFiles.push({ fileUrl: fUrl, fileType: ext });
    }
    if (ingestFiles.length && wa)
      fireIngest(
        ingestFiles.map((f) => ({ ...f, wa })),
        sessionToken,
      );
    // Emit domain event for each uploaded file
    if (wa) {
      for (const label of uploaded) {
        emit({
          type: "document.uploaded",
          wa,
          kind: label,
          path: fileUrls[label] || "",
          at: new Date().toISOString(),
        });
      }
    }
    return { success: true, uploaded, generatedPassword };
  } catch (e: any) {
    return { success: false, error: "Gagal simpan kandidat: " + e.message };
  }
}

export async function handleSimpanBerkasTahapan(
  payload: any[],
  sessionToken?: string,
) {
  cacheClear();
  const d = (payload && payload[0]) || {};
  const t = session.verifyToken(sessionToken);
  if (!t || (t.role !== "admin" && t.role !== "kandidat"))
    return {
      success: false,
      sessionInvalid: true,
      message: "Sesi tidak valid",
    };
  if (t.role === "kandidat") {
    const dWa = normalizeWa(String(d.wa || ""));
    if (dWa && normalizeWa(String(t.wa || "")) !== dWa)
      return { success: false, error: "Nomor WA tidak sesuai sesi." };
  }
  const wa = normalizeWa(String(d.wa || ""));
  const jenis = String(d.jenisBerkas || "")
    .trim()
    .toUpperCase();
  const f = d.file || {};
  const directUrl = String(d.fileUrl || (f && f.url) || "").trim();
  if (!wa || (!directUrl && !f.data))
    return { success: false, error: "Data tidak lengkap." };
  // C6 fix: a direct (client-supplied) URL must be https from an allow-listed host.
  const badBerkasDocs = badDocumentUrls([
    { key: jenis || "DOKUMEN", url: directUrl },
  ]);
  if (badBerkasDocs.length) {
    return {
      success: false,
      error:
        "URL dokumen tidak valid (https + host penyimpanan resmi saja): " +
        badBerkasDocs.join(", "),
    };
  }
  try {
    const nama = String(d.nama || "KANDIDAT")
      .trim()
      .toUpperCase();
    const folder = "master/" + nama.replace(/[^A-Z0-9_-]/g, "_");
    const ext =
      String(f.name || "file")
        .split(".")
        .pop() || "jpg";
    let fileName = (jenis || "DOKUMEN") + "." + ext;
    const isCv = jenis === "CV" || jenis === "CV_REVISI";
    const candRow = await findCandidateRow(wa);
    if (isCv && candRow) {
      const jobCode = String(
        pick(candRow, ["id_loker_pilihan", "id_loker"]) || "",
      )
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_-]/g, "_");
      if (jobCode) fileName = "JOB" + jobCode + "_CV." + ext;
    }
    let url = directUrl;
    if (!url) {
      const { uploadBase64 } = await import("../../_lib/storage");
      url = (await uploadBase64(f.data, folder, fileName)) ?? "";
      if (!url) return { success: false, error: "Upload gagal." };
    }
    try {
      await syncFormMailDariUpload(
        wa,
        nama,
        jenis,
        url,
        candRow
          ? String(pick(candRow, ["id_loker_pilihan", "id_loker"]) || "")
          : "",
      );
    } catch {
      /* non-fatal */
    }
    const labelKey = fileLabelKey(jenis);
    const map = labelKey ? FILE_LABEL_COLUMNS[labelKey] : null;
    if (map) {
      if (candRow && candRow.id !== undefined && map.cand) {
        await supabaseJson("PATCH", "database_candidate", {
          query: { id: "eq." + candRow.id },
          body: { [map.cand]: url },
          headers: { Prefer: "return=minimal" },
        });
      }
      const m = await findMasterByWa(wa);
      if (m && m.id !== undefined && map.master) {
        await supabaseJson("PATCH", "master_database_candidate", {
          query: { id: "eq." + m.id },
          body: { [map.master]: url },
          headers: { Prefer: "return=minimal" },
        });
      }
      if (map.pemberkasan) {
        await supabaseJson("POST", "pemberkasan_checklist", {
          query: { on_conflict: "wa,tahap" },
          body: {
            wa,
            nama_lengkap: nama,
            tahap: 1,
            updated_at: new Date().toISOString(),
            [map.pemberkasan]: url,
          },
          headers: { Prefer: "return=minimal,resolution=merge-duplicates" },
        });
      }
    }
    const PARSEABLE_EXTS = new Set([
      "pdf",
      "docx",
      "xlsx",
      "xls",
      "csv",
      "txt",
    ]);
    if (PARSEABLE_EXTS.has(ext.toLowerCase()) && url && wa)
      fireIngest(
        [{ fileUrl: url, fileType: ext.toLowerCase(), wa }],
        sessionToken,
      );
    // Emit domain event for document upload
    if (wa && url) {
      emit({
        type: "document.uploaded",
        wa,
        kind: jenis || "UNKNOWN",
        path: url,
        at: new Date().toISOString(),
      });
    }
    try {
      const { notifyAdmins } = await import("../../_lib/fcm-helpers");
      notifyAdmins(
        "Berkas Baru!",
        `${nama || "Kandidat"} mengunggah ${jenis || "dokumen"}.`,
        "/admin.html",
      );
    } catch {
      /* non-fatal */
    }
    return { success: true };
  } catch (e: any) {
    return {
      success: false,
      error: "Gagal menyimpan berkas. Silakan coba lagi.",
    };
  }
}

export async function handleSimpanRevisiKandidat(
  payload: any[],
  sessionToken?: string,
) {
  const guard = requireRole(sessionToken || "", "kandidat");
  if (guard.error) return guard.error;
  cacheClear();
  const wa = String((payload && payload[0]) || "");
  const f = (payload && payload[1]) || {};
  const directUrl = String(f.url || f.fileUrl || "").trim();
  if (!wa || (!directUrl && !f.data))
    return { success: false, error: "Data tidak lengkap." };
  // IDOR guard (2026-09-04): a kandidat may only attach a revisi to their OWN
  // WA — payload[0] names the target row, so scope it to the session.
  const revSession = session.verifyToken(sessionToken);
  if (
    revSession &&
    revSession.role === "kandidat" &&
    normalizeWa(String(revSession.wa || "")) !== normalizeWa(wa)
  ) {
    return {
      success: false,
      error: "Akses ditolak: nomor WA tidak sesuai sesi.",
    };
  }
  // C6 fix: a direct (client-supplied) URL must be https from an allow-listed host.
  const badRevisiDocs = badDocumentUrls([{ key: "CV_REVISI", url: directUrl }]);
  if (badRevisiDocs.length) {
    return {
      success: false,
      error:
        "URL dokumen tidak valid (https + host penyimpanan resmi saja): " +
        badRevisiDocs.join(", "),
    };
  }
  try {
    const row = await findMasterByWa(wa);
    const nama =
      row && row.nama_lengkap
        ? String(row.nama_lengkap).toUpperCase()
        : "KANDIDAT";
    const folder = "master/" + nama.replace(/[^A-Z0-9_-]/g, "_");
    const ext =
      String(f.name || "file")
        .split(".")
        .pop() || "jpg";
    let fileName = "CV_REVISI." + ext;
    let cvJobCode = "";
    const candRow = await findCandidateRow(wa);
    if (candRow) {
      const jobCode = String(
        pick(candRow, ["id_loker_pilihan", "id_loker"]) || "",
      )
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_-]/g, "_");
      if (jobCode) {
        fileName = "JOB" + jobCode + "_CV." + ext;
        cvJobCode = jobCode;
      }
    }
    let url = directUrl;
    if (!url) {
      const { uploadBase64 } = await import("../../_lib/storage");
      url = (await uploadBase64(f.data, folder, fileName)) ?? "";
      if (!url) return { success: false, error: "Upload gagal." };
    }
    try {
      await syncFormMailDariUpload(wa, nama, "CV", url, cvJobCode);
    } catch {
      /* non-fatal */
    }
    if (candRow && candRow.id !== undefined) {
      await supabaseJson("PATCH", "database_candidate", {
        query: { id: "eq." + candRow.id },
        body: { file_cv: url },
        headers: { Prefer: "return=minimal" },
      });
    }
    if (row && row.id !== undefined) {
      await supabaseJson("PATCH", "master_database_candidate", {
        query: { id: "eq." + row.id },
        body: { file_cv: url },
        headers: { Prefer: "return=minimal" },
      });
    }
    const PARSEABLE_EXTS = new Set([
      "pdf",
      "docx",
      "xlsx",
      "xls",
      "csv",
      "txt",
    ]);
    if (url && PARSEABLE_EXTS.has(ext.toLowerCase()) && wa)
      fireIngest(
        [{ fileUrl: url, fileType: ext.toLowerCase(), wa }],
        sessionToken,
      );
    return { success: true };
  } catch (e: any) {
    return { success: false, error: "Gagal upload revisi: " + e.message };
  }
}
