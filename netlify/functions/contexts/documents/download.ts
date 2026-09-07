/**
 * contexts/documents/download.ts — Download all candidate docs per job as ZIP
 */
import { normalizeWa, pick, toText } from './repository';
import { findCandidatesByJob, fetchAllMasters } from './repository';
import { requireRole } from '../identity';
import { isAllowedDocumentUrl } from '../../_lib/storage';

const DOC_COLUMNS: [string, string[]][] = [
  ['CV', ['file_cv']], ['JFT', ['jft_url', 'jft']], ['SSW', ['ssw_url', 'ssw']],
  ['PasFoto', ['pas_photo']], ['KTP', ['ktp_url']], ['KK', ['kk_url']],
  ['IjazahSD', ['ijazah_sd_url']], ['IjazahSMP', ['ijazah_smp_url']],
  ['IjazahSMA', ['ijazah_sma_url']], ['Universitas', ['univ_url']],
  ['Sertifikat', ['cert_url']], ['SIM', ['driver_license_url', 'sim_url']],
];

async function fetchBuffer(url: string): Promise<Buffer | null> {
  try { const res = await fetch(url, { signal: AbortSignal.timeout(10000) }); if (!res.ok) return null; return Buffer.from(await res.arrayBuffer()); } catch { return null; }
}
function extFromUrl(url: string): string { const m = url.match(/\.([a-z0-9]{2,5})(?:\?|$)/i); return m ? m[1].toLowerCase() : 'bin'; }
function filenameFromUrl(url: string, label: string): string { return label.replace(/[^a-zA-Z0-9_-]/g, '_') + '.' + extFromUrl(url); }
function safeFolderName(name: string): string { return name.replace(/[^a-zA-Z0-9 _-]/g, '_').substring(0, 60) || 'KANDIDAT'; }

export async function handleDownloadJobDocs(payload: unknown[], sessionToken?: string) {
  const guard = requireRole(sessionToken || '', 'admin');
  if (guard.error) return guard.error;
  const code = String((payload && payload[0]) || '').trim();
  if (!code) return { success: false, error: 'Kode job wajib diisi.' };
  try {
    const candidates = await findCandidatesByJob(code);
    if (!candidates.length) return { success: false, error: 'Tidak ada kandidat untuk job ' + code + '.' };
    const waList = candidates.map((c) => normalizeWa(String(pick(c, ['no_wa', 'wa', 'whatsapp']) || ''))).filter(Boolean);
    const masterRows = await fetchAllMasters(waList);
    const masterByWa = new Map<string, Record<string, unknown>>();
    if (Array.isArray(masterRows)) { for (const row of masterRows) { const wa = normalizeWa(String(row.no_wa || '')); if (wa) masterByWa.set(wa, row); } }
    const downloads: { url: string; folder: string; label: string }[] = [];
    for (const cand of candidates) {
      if (!cand || typeof cand !== 'object') continue;
      const wa = normalizeWa(String(pick(cand, ['no_wa', 'wa', 'whatsapp']) || ''));
      const nama = safeFolderName(String(pick(cand, ['nama_lengkap', 'nama']) || 'KANDIDAT').toUpperCase());
      const master = wa ? masterByWa.get(wa) : null;
      for (const [label, cols] of DOC_COLUMNS) {
        let url = '';
        // C6 fix: only allow-listed https hosts are fetched server-side (legacy
        // rows outside the allow-list are skipped, like fetch failures).
        if (master) { for (const col of cols) { const v = toText((master as any)[col] || ''); if (v && v !== '-' && isAllowedDocumentUrl(v)) { url = v; break; } } }
        if (!url) { for (const col of cols) { const v = toText((cand as any)[col] || ''); if (v && v !== '-' && isAllowedDocumentUrl(v)) { url = v; break; } } }
        if (url) downloads.push({ url, folder: nama, label });
      }
    }
    if (!downloads.length) return { success: false, error: 'Tidak ada dokumen yang bisa di-download.' };
    // P30 fix: batasi ukuran batch — ZIP dibangun di memori lalu dikirim
    // sebagai base64 (+33%) — job besar bisa timeout/OOM.
    const MAX_FILES = 200;
    const MAX_TOTAL_BYTES = 100 * 1024 * 1024;
    if (downloads.length > MAX_FILES) {
      return { success: false, error: 'Terlalu banyak dokumen (' + downloads.length + '). Batasi job ke ' + MAX_FILES + ' file.' };
    }
    const archiverMod = await import('archiver');
    const ZipClass = (archiverMod as any).ZipArchive;
    const ArchiveClass = ZipClass || (archiverMod as any).Archiver || (archiverMod as any).default;
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      const archive = ZipClass ? new ZipClass('zip', { zlib: { level: 6 } }) : typeof ArchiveClass === 'function' ? new ArchiveClass('zip', { zlib: { level: 6 } }) : (archiverMod as any)('zip', { zlib: { level: 6 } });
      archive.on('data', (chunk: Buffer) => chunks.push(chunk));
      archive.on('end', () => { const zipBuf = Buffer.concat(chunks); resolve({ success: true, zipBase64: zipBuf.toString('base64'), fileName: 'Dokumen_' + code + '.zip', totalFiles: downloads.length, totalSize: zipBuf.length, candidateCount: candidates.length }); });
      archive.on('error', (err: Error) => resolve({ success: false, error: 'Gagal membuat ZIP: ' + err.message }));
      let processed = 0;
      let totalBytes = 0;
      async function processNext() {
        try {
          if (processed >= total) { archive.finalize(); return; }
          const d = downloads[processed]; processed++;
          const buf = await fetchBuffer(d.url);
          if (buf) {
            totalBytes += buf.length;
            if (totalBytes > MAX_TOTAL_BYTES) {
              resolve({ success: false, error: 'Ukuran total dokumen melebihi batas (100 MB).' });
              archive.abort();
              return;
            }
            archive.append(buf, { name: d.folder + '/' + filenameFromUrl(d.url, d.label) });
          }
          await processNext();
        } catch (err: unknown) { archive.abort(); }
      }
      const total = downloads.length;
      processNext().catch(() => archive.abort());
    });
  } catch (e: unknown) { const msg = e instanceof Error ? e.message : String(e); return { success: false, error: 'Gagal download dokumen: ' + msg }; }
}
