/**
 * contexts/catalog/repository.ts — Data loading helpers for public catalog + share
 *
 * Owns: job_database (read), sys_config (read), public data
 * Exports helpers used by other contexts: loadCandidatesUnik, stripRaw
 */
import { cacheGet, cacheSet } from '../../_lib/cache';
import * as demo from '../../_lib/demo';
import * as session from '../../_lib/session';
import {
  columnsFromSchema,
  findTable,
  getSchema,
  hasBackend,
  normalizeWa,
  pick,
  supabaseJson,
  tablesFromSchema,
  toText,
  supabaseUrl,
} from '../../_lib/db/client';
import {
  attachApplications,
  findAllCandidatesLight,
  findCandidateByWaFiltered,
  findCandidates,
  findCandidatesByIds,
  mapCandidate,
} from '../../_lib/db/candidates';
import { findJobs, mapJob, JOB_BOARD_LIMIT } from '../../_lib/db/jobs';
import { findForms, findFormsByWa, findFormsByWaList, findFormsLight, mapForm as _mapForm, parseDocs } from '../../_lib/db/forms';
const mapForm = _mapForm;
export { _mapForm as mapForm };
import { attachBerkasBio } from '../../_lib/db/berkas';
import { findAssets, findSettings } from '../../_lib/db/misc';
import { SCHEDULE_MAP_COLS, TASK_MAP_COLS, WA_TEMPLATE_COLS } from '../../_lib/db/projections';
import { findJobByCodeFiltered } from '../../_lib/db/jobs';
import { findCandidatesByJobFiltered } from '../../_lib/db/candidates';
import { listStorageFolder, BERKAS_COLUMNS } from '../../_lib/db/berkas';

const DROPDOWN_MAP: Record<string, string> = {
  list_kategori: 'kategori',
  list_gender: 'gender',
  list_tahapan: 'tahapan',
  tsk: 'tsk',
  list_lokasi: 'lokasi',
  list_syarat: 'syarat',
  lokasi__link_zoom: 'lokasiZoom',
  list_status_loker: 'statusLoker',
  status_form: 'statusForm',
  list_status_lamaran: 'statusLamaran',
  broadcast: 'broadcast',
};

function parseConfigList(v: unknown): string[] {
  if (Array.isArray(v)) return v;
  const s = String(v || '').trim();
  if (s.startsWith('[') || s.startsWith('{')) {
    try {
      const p = JSON.parse(s);
      if (Array.isArray(p)) return p;
    } catch { /* bukan JSON valid */ }
  }
  return s.split(/[\n,;]+/).map((x: string) => x.trim()).filter(Boolean);
}

function stripRaw(list: Record<string, unknown>[]): Record<string, unknown>[] {
  return (list || []).map(({ _raw, ...rest }: Record<string, unknown>) => rest);
}

async function loadSchedules(): Promise<Record<string, unknown>[]> {
  try {
    const rows = await supabaseJson('GET', 'database_schedule', {
      query: { select: SCHEDULE_MAP_COLS, limit: 500, order: 'created_at.desc' },
    });
    return (Array.isArray(rows) ? rows : []).map((r: Record<string, unknown>) => ({
      idJadwal: toText(r.id_jadwal || r.id || ''),
      namaAgenda: toText(r.nama_agenda || ''),
      idLoker: toText(r.id_loker_terkait || '-'),
      waktu: toText(r.tanggal_waktu || ''),
      link: toText(r.lokasi_link || '-'),
      kandidat: toText(r.daftar_kandidat || '-'),
      tsk: toText(r.tsk || ''),
      status: toText(r.status_jadwal || 'AKTIF'),
    }));
  } catch { return []; }
}

async function loadTugas(): Promise<Record<string, unknown>[]> {
  try {
    const rows = await supabaseJson('GET', 'database_tugas', {
      query: { select: TASK_MAP_COLS, limit: 500, order: 'created_at.desc' },
    });
    return (Array.isArray(rows) ? rows : []).map((r: Record<string, unknown>) => ({
      id: toText(r.id_tugas || r.id || ''),
      task: toText(r.nama_tugas || ''),
      status: toText(r.status || 'BARU'),
      dibuatOleh: toText(r.dibuat_oleh || ''),
      waktuDibuat: toText(r.waktu_dibuat || ''),
    }));
  } catch { return []; }
}

async function loadWaTemplates(): Promise<Record<string, unknown>[]> {
  try {
    const rows = await supabaseJson('GET', 'wa_templates', {
      query: { select: WA_TEMPLATE_COLS, limit: 500 },
    });
    return (Array.isArray(rows) ? rows : []).map((r: Record<string, unknown>) => ({
      id: toText(r.id || ''),
      nama: toText(r.nama || ''),
      isi: toText(r.isi || ''),
    }));
  } catch { return []; }
}

function saringKandidatUnik(uniq: Record<string, unknown>[], q: string): Record<string, unknown>[] {
  const needle = String(q || '').trim().toLowerCase();
  if (!needle) return uniq;
  const digit = needle.replace(/\D/g, '');
  return uniq.filter((r) => {
    const nama = String(pick(r, ['nama_lengkap', 'nama', 'name']) || '').toLowerCase();
    const wa = normalizeWa(String(pick(r, ['no_wa', 'wa', 'whatsapp', 'telepon', 'phone', 'no_hp', 'telp']) || ''));
    return nama.includes(needle) || (digit && wa.includes(digit));
  });
}

const CAND_CACHE_TTL_MS = 25_000;

async function loadCandidatesUnik(q: string, opts: { page?: number; pageSize?: number } = {}): Promise<{ rows: Record<string, unknown>[]; total: number }> {
  const page = Number(opts.page) || 1;
  const pageSize = Number(opts.pageSize) || 50;
  const cacheKey = 'cand:' + String(q || '') + '|p' + page + '|s' + pageSize;
  const cached = cacheGet<{ rows: Record<string, unknown>[]; total: number }>(cacheKey);
  if (cached) return cached;

  const start = (page - 1) * pageSize;
  const tsOf = (r: Record<string, unknown>) => String(pick(r, ['updated_at', 'created_at', 'tanggal_daftar']) || '');
  const urutkan = (u: Record<string, unknown>[]) => u.sort((a, b) => (tsOf(b) > tsOf(a) ? 1 : tsOf(b) < tsOf(a) ? -1 : 0));

  const light = await findAllCandidatesLight();
  if (light !== undefined) {
    let uniq = saringKandidatUnik(light, q);
    urutkan(uniq);
    const total = uniq.length;
    const slice = uniq.slice(start, start + pageSize);
    const full = await findCandidatesByIds(slice.map((r) => r.id as string | number));
    if (full !== undefined) {
      const byId = new Map(full.map((r) => [String(r.id), r]));
      if (slice.every((r) => byId.has(String(r.id)))) {
        const result = { rows: slice.map((r) => byId.get(String(r.id))), total };
        cacheSet(cacheKey, result, CAND_CACHE_TTL_MS);
        return result;
      }
    }
  }

  const found = await findCandidates();
  const rows = Array.isArray(found.rows) ? found.rows : [];
  let uniq = saringKandidatUnik(rows, q);
  urutkan(uniq);
  return { rows: uniq.slice(start, start + pageSize), total: uniq.length };
}

const PUBLIC_CACHE_TTL_MS = 20_000;

async function loadPublicBase(mode: string): Promise<Record<string, unknown>> {
  const cached = cacheGet<Record<string, unknown>>('public-base');
  if (cached) return cached;

  const base = demo.demoGetAppData(mode || 'public');
  const [found, assets, settings] = await Promise.all([findJobs(), findAssets(), findSettings()]);

  let foundTable = found;
  if (!foundTable.table) {
    const spec = await getSchema();
    const names = tablesFromSchema(spec);
    for (const name of names) {
      const cols = columnsFromSchema(spec, name);
      if (
        cols.some((c) => /pekerjaan|judul|nama_loker|lowongan|title/.test(c)) &&
        cols.some((c) => /status|kode|code/.test(c))
      ) {
        // Same trap as findJobs(): findTable() defaults to limit=1 because it
        // was built to answer "does this table exist?". Here we need the rows,
        // so the limit must be explicit — otherwise this fallback silently
        // truncates the public board to a single job.
        const hit = await findTable([name], JOB_BOARD_LIMIT);
        if (hit.table) { foundTable = hit; break; }
      }
    }
  }
  if (!foundTable.table) {
    base.pengumuman = '⚠ Backend Supabase terhubung, tapi tabel lowongan belum terdeteksi.';
    return { notFound: true, base };
  }

  const jobs = foundTable.rows.map(mapJob).filter((j) => j.pekerjaan && j.pekerjaan !== '');
  const dropdowns: Record<string, string[]> = {};
  let pengumuman = '';
  if (settings.table) {
    for (const row of settings.rows) {
      const type = toText(row.config_type);
      const key = DROPDOWN_MAP[type];
      if (key) dropdowns[key] = (dropdowns[key] || []).concat(parseConfigList(row.config_value));
      if (type === 'broadcast' && toText(row.config_value).trim() && !pengumuman) {
        pengumuman = toText(row.config_value);
      }
    }
  }

  const data = { jobs: stripRaw(jobs), assets: assets || base.assets, dropdowns, pengumuman };
  cacheSet('public-base', data, PUBLIC_CACHE_TTL_MS);
  return data;
}

// --- Share data helpers ---
const TYPE_ALIAS: Record<string, string> = {
  CVFILE: 'CV', FILE_CV: 'CV', CV_REVISI: 'CV',
  PHOTOFILE: 'PHOTO', PAS_PHOTO: 'PHOTO', PASSPHOTO: 'PHOTO', FOTO: 'PHOTO', PHOTO: 'PHOTO',
  JFTFILE: 'JFT', SSWFILE: 'SSW', KARTU_KELUARGA: 'KK',
};
const TYPE_TOKENS = [
  'PAS_PHOTO', 'PHOTOFILE', 'KARTU_KELUARGA', 'CVFILE', 'FILE_CV', 'CV_REVISI',
  'JFTFILE', 'SSWFILE', 'PASSPHOTO', 'PASSPORT', 'IJAZAH', 'KTP', 'KK', 'CV', 'JFT', 'SSW', 'FOTO', 'PHOTO',
];

function docTypeOf(name: string): string {
  const base = String(name || '').replace(/\.[a-z0-9]+$/i, '');
  const up = base.toUpperCase();
  for (const tk of TYPE_TOKENS) {
    if (tk.length > 3 && up.includes(tk)) return TYPE_ALIAS[tk] || tk;
  }
  const m = base.match(/^[A-Z]+/);
  const prefix = m ? m[0] : null;
  if (prefix && TYPE_ALIAS[prefix]) return TYPE_ALIAS[prefix];
  if (prefix && prefix.length >= 2) return prefix;
  for (const tk of TYPE_TOKENS) {
    if (tk.length >= 2 && up.includes(tk)) return TYPE_ALIAS[tk] || tk;
  }
  return up;
}

function docAge(name: string): number {
  const m = String(name || '').match(/_(\d{10,})/);
  return m ? Number(m[1]) : 0;
}

export {
  hasBackend, demo, session, normalizeWa, pick, toText, mapCandidate, stripRaw,
  loadCandidatesUnik, loadSchedules, loadTugas, loadWaTemplates, loadPublicBase,
  findFormsByWaList, findFormsByWa, findFormsLight, findForms, parseDocs,
  findCandidateByWaFiltered, findCandidates, attachApplications, attachBerkasBio,
  findJobs, mapJob, findAssets, findSettings, findJobByCodeFiltered,
  findCandidatesByJobFiltered, listStorageFolder, BERKAS_COLUMNS,
  supabaseJson, docTypeOf, docAge, supabaseUrl,
};
