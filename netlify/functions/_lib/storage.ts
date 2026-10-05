import { supabaseKey, supabaseUrl } from './db/client';
import { env } from './env';
import { request, BUDGETS } from './kernel/http';
// storage.js — helper Supabase Storage (upload base64, hapus varian lama,
// actions-extra.js, perilaku TIDAK berubah.

function bucket() {
  return env('SUPABASE_STORAGE_BUCKET') || 'asj-files';
}

// Request ke Supabase Storage (di luar /rest/v1).
async function storageRequest(method: string, pathname: string, opts: { headers?: Record<string, string>; body?: unknown } = {}) {
  const url = supabaseUrl();
  const key = supabaseKey();
  if (!url || !key) throw new Error('Supabase belum dikonfigurasi');
  // P2 fix: Route through request() for timeout + circuit breaker.
  const res = await request(url.replace(/\/$/, '') + '/storage/v1/' + pathname, {
    method,
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key,
      ...(opts.headers || {}),
    },
    // @ts-expect-error JS→TS migration
    body: opts.body,
    budgetKey: 'storage',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error('storage/' + pathname + ' → HTTP ' + res.status + ' ' + text.slice(0, 200));
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function publicUrl(path: string) {
  return supabaseUrl().replace(/\/$/, '') + '/storage/v1/object/public/' + bucket() + '/' + path;
}

// Terima base64 (boleh dengan prefix data:*) → kembalikan Buffer.
function b64ToBuffer(data: unknown) {
  let s = String(data || '');
  const comma = s.indexOf(',');
  if (comma >= 0 && /^data:/i.test(s.slice(0, comma + 1))) s = s.slice(comma + 1);
  return Buffer.from(s, 'base64');
}

// S7 hardening (2026-10-04): server-side upload allow-list — the single list of
// file types this backend will ever sign or store.
//
// Two paths took the extension from the CLIENT:
//   - handleGetUploadUrls (contexts/documents/service.ts) signs an upload URL
//     whose object key ends in the client's `ext`; `ext` was only stripped to
//     [a-z0-9], so ANY extension — .svg, .html — was signed.
//   - uploadBase64 (below) set the stored object's Content-Type from the
//     filename and accepted any extension; its MIME map even carried svg.
//
// The boundary that matters is ACTIVE CONTENT, not document type: svg (and
// html/htm/js/…) can execute in a browser origin; .doc/.xls/.csv cannot. So this
// is a SUPERSET of every extension the UI offers, MINUS anything scriptable or
// executable — not a narrow list of "the types we happen to store today".
//
// ⚠️ COUPLING — do not narrow this without checking `src/components/**`.
// `accept=` attributes across the portal (ApplyFullForm, MasterFullForm,
// EditCandidateModal, PemberkasanModal, AdminJobEditModal, TabTambah,
// CvTemplateSelector, AdminAiCopilot, InputManualModal, AiCvForm,
// SiswaBaruForm, CvMiniModal) offer the types marked "UI" below, and
// src/lib/uploadGuard.ts expands `image/*` to jpg/jpeg/png/gif/webp/bmp. A set
// narrower than the UI offers means a client-validated file dies server-side
// with "Upload gagal." — the failure the S7 first cut would have caused.
//
// Kept server-side and independent of those `accept=` hints (a renamed file or a
// drag-and-drop bypasses them). NOTE ON SIZE: Supabase's create-signed-upload-url
// API takes NO max-size parameter, and the client PUTs the object straight to the
// signed URL — so the ONLY size bound is the bucket's own `file_size_limit` (an
// ops setting), not this function. Do not add a maxBytes field here: it would be
// a no-op that reads like a guard.
const ALLOWED_UPLOAD_EXTENSIONS = new Set([
  // Images. jpg/jpeg/png/webp/gif/bmp is exactly what `image/*` expands to, so
  // every `accept="image/*"` slot is covered.
  'jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp',
  // Documents offered by some `accept=` attribute in src/components/**.
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt',
  // Legacy document types carried by the pre-S7 MIME map. No current `accept=`
  // offers them; kept so this remains a complete non-active document set.
  'ppt', 'pptx', 'rtf', 'odt',
]);
// Deliberately EXCLUDED (active or executable content): svg, html, htm, js,
// mjs, cjs, exe, sh — anything that can execute in a browser origin or a host.

/** True when `ext` (with or without a leading dot, any case) is an accepted upload type. */
function isAllowedUploadExtension(ext: unknown): boolean {
  const e = String(ext || '')
    .trim()
    .toLowerCase()
    .replace(/^\./, '');
  return ALLOWED_UPLOAD_EXTENSIONS.has(e);
}

function mimeFromName(name: string, fallback?: string) {
  const ext = String(name || '')
    .split('.')
    .pop()!
    .toLowerCase();
  // Every allow-listed type maps to a correct, INERT Content-Type so the stored
  // object is served with the right MIME. svg is deliberately absent — it is
  // scriptable content, the exact thing this allow-list exists to keep out.
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    bmp: 'image/bmp',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    csv: 'text/csv',
    txt: 'text/plain',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    rtf: 'application/rtf',
    odt: 'application/vnd.oasis.opendocument.text',
  };
  return map[ext] || fallback || 'application/octet-stream';
}

// Alias nama file per jenis — semua jalur upload (apply-full, dashboard,
// master form, admin) dijamin memakai stem yang sama, sehingga file lama
// ikut terhapus & tidak ada dokumen dobel (mis. KTP 2 / KK 2 di share view).
function stemAliases(stem: string) {
  const u = String(stem || '').toUpperCase();
  const m: Record<string, string[]> = {
    PAS_PHOTO: ['PHOTOFILE', 'PASPHOTO', 'FOTO'],
    PHOTOFILE: ['PAS_PHOTO', 'PASPHOTO', 'FOTO'],
    PASPHOTO: ['PAS_PHOTO', 'PHOTOFILE', 'FOTO'],
    CV: ['CVFILE', 'FILE_CV', 'CV_REVISI'],
    CVFILE: ['CV', 'FILE_CV', 'CV_REVISI'],
    CV_REVISI: ['CV', 'CVFILE', 'FILE_CV'],
    JFT: ['JFTFILE'],
    JFTFILE: ['JFT'],
    SSW: ['SSWFILE'],
    SSWFILE: ['SSW'],
    KK: ['KARTU_KELUARGA'],
    KARTU_KELUARGA: ['KK'],
  };
  return m[u] || [];
}

// Hapus semua varian lama satu jenis file di folder (mis. KTP.jpg, KTP.png,
// KK_1786….pdf — termasuk varian bertimestamp dari backend lama — plus
// alias-nya). Dipanggil SEBELUM upload supaya selalu menimpa file lama.
// Catatan API: object/list mengembalikan nama RELATIF terhadap prefix, jadi
// filter + delete harus pakai path lengkap (folder + "/" + nama).
function isVarianOf(name: string, stem: string) {
  const n = String(name || '');
  if (!n || !stem) return false;
  // KTP.ext / KTP.png — varian tanpa timestamp.
  if (n.startsWith(stem + '.')) return true;
  // KTP_1786683311216.pdf — varian bertimestamp (backend lama menamai
  // file dengan timestamp sehingga upload kedua tidak menimpa).
  return n.startsWith(stem + '_');
}

async function hapusJenisVarian(folder: string, stem: string) {
  const f = String(folder).replace(/^\/+|\/+$/g, '');
  const stems = [String(stem || '')].concat(stemAliases(stem)).filter(Boolean);
  try {
    const list = await storageRequest('POST', 'object/list/' + bucket(), {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: f + '/', limit: 300, offset: 0 }),
    });
    const items = Array.isArray(list) ? list : [];
    const victims = items
      .map((o) => (o && o.name ? String(o.name) : ''))
      .filter((n) => n && stems.some((s) => isVarianOf(n, s)));
    if (victims.length) {
      await storageRequest('DELETE', 'object/' + bucket(), {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: victims.map((n) => f + '/' + n) }),
      });
    }
  } catch (e) {
    // List/hapus gagal tidak memblokir upload — x-upsert tetap menimpa nama sama.
  }
}

// Upload file base64 ke Storage, kembalikan public URL.
async function uploadBase64(data: unknown, folder: string, fileName: string) {
  if (!data) return null;
  // S7 hardening: refuse a type outside the allow-list BEFORE any storage call.
  // Returning null (not throwing) keeps every caller's existing `?? ""` →
  // "Upload gagal." handling intact — a rejection, not a new failure mode.
  if (!isAllowedUploadExtension(String(fileName).split('.').pop())) return null;
  const buf = b64ToBuffer(data);
  const cleanName = String(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
  const stem = cleanName.split('.')[0];
  // FIX anti-duplikat: hapus varian lama (KTP.jpg / KTP.png / alias) dulu.
  await hapusJenisVarian(folder, stem);
  const path = String(folder).replace(/^\/+|\/+$/g, '') + '/' + cleanName;
  await storageRequest('POST', 'object/' + bucket() + '/' + path, {
    headers: {
      'Content-Type': mimeFromName(cleanName),
      'x-upsert': 'true',
    },
    body: buf,
  });
  return publicUrl(path);
}

// S5/C6 hardening (2026-09-04): ONE validator for every accepted document URL.
// https-only + host allow-list. Base allow-list covers Supabase storage (any
// project subdomain), Cloudinary and Google Cloud Storage; the Supabase host
// from env SUPABASE_URL (custom domains) and env ALLOWED_DOCUMENT_HOSTS
// (comma-separated host list) extend it for ops. Every path that stores or
// ingests a client-supplied document URL must go through this function —
// storage (resolveFileUrl), documents (apply/berkas/revisi/kandidat+upload)
// and ingestion (processUploadDoc) all do.
const DEFAULT_ALLOWED_DOCUMENT_HOSTS = [
  'supabase.co',
  'cloudinary.com',
  'res.cloudinary.com',
  'storage.googleapis.com',
];

function allowedDocumentHosts(): string[] {
  const extras = String(env('ALLOWED_DOCUMENT_HOSTS') || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  let supabaseHost = '';
  try {
    supabaseHost = new URL(supabaseUrl()).hostname.toLowerCase();
  } catch {
    // SUPABASE_URL unset — defaults still apply.
  }
  return [...new Set([...DEFAULT_ALLOWED_DOCUMENT_HOSTS, ...(supabaseHost ? [supabaseHost] : []), ...extras])];
}

/** https-only + host allow-list for stored/ingested document URLs. */
export function isAllowedDocumentUrl(raw: string): boolean {
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    return allowedDocumentHosts().some((h) => host === h || host.endsWith('.' + h));
  } catch {
    return false;
  }
}

// Jalur Cloudinary (2026-08-17): nilai sudah URL string (hasil upload langsung
// dari browser) → dipakai apa adanya. Base64 (jalur lama Frontend → Netlify →
// Storage) tetap didukung sebagai fallback untuk klien yang belum dimigrasi.
async function resolveFileUrl(value: unknown, folder: string, fileName: string) {
  if (typeof value === 'string' && /^https?:\/\//i.test(value.trim())) {
    // S5/C6 fix: https-only + host allow-list before accepting the URL.
    if (!isAllowedDocumentUrl(value.trim())) {
      throw new Error('URL not from allowed host: ' + new URL(value.trim()).hostname);
    }
    return value.trim();
  }
  return uploadBase64(value, folder, fileName);
}

export {
  bucket,
  storageRequest,
  publicUrl,
  b64ToBuffer,
  mimeFromName,
  ALLOWED_UPLOAD_EXTENSIONS,
  isAllowedUploadExtension,
  stemAliases,
  isVarianOf,
  hapusJenisVarian,
  uploadBase64,
  resolveFileUrl,
};
