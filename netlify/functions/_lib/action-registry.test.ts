// ==========================================
// TESTS: action-registry — kontrak action backend.
// Registry (action-registry.ts) adalah SATU-SATUNYA sumber kebenaran nama
// action. Test ini menjaga:
//   1. setiap handler terdaftar benar-benar fungsi;
//   2. grup rate limit hanya berisi action yang terdaftar;
//   3. SETIAP action yang dipanggil frontend (src/) ADA di registry —
//      typo nama action gagal di sini, bukan di runtime produksi.
//
// MIGRASI 2026-08-31: test ini sebelumnya memindai direktori `js/` dan file
// `api-client.ts` di root (layout pra-Astro) sehingga SELALU gagal ENOENT dan
// tidak pernah berjalan. Sekarang memindai `src/` sesuai arsitektur baru.
//
// Pengecekan ADMIN_ACTIONS / NETLIFY_FUNCTIONS dihapus: keduanya sudah tidak
// ada di src/lib/apiClient.ts. Dulu diperlukan karena tiap action dipetakan ke
// function Netlify terpisah; sekarang SEMUA action lewat satu dispatcher
// (/.netlify/functions/bridge-links) dan sessionToken dikirim untuk setiap
// action secara default (requireAuth: true), jadi regresi yang dijaga test itu
// tidak mungkin terjadi lagi.
// ==========================================
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { SURFACE_HANDLERS } from '../surfaces/registry';

// Rate limit groups — must match handlers.ts
const LOGIN_ACTIONS = new Set([
  'checkAdminMaster', 'checkAdminPersonal', 'refreshAdminSession',
  'refreshKandidatSession', 'loginKandidat', 'daftarKandidat',
]);
const AI_ACTIONS = new Set([
  'processAIChat', 'processAdminAIChat',
  'processAiInterview', 'parseDokumenBiodata', 'processUploadDoc',
  'generateWawancaraModel',
]);
// Anonymous AI chat — its own IP-only bucket (public /siswa-baru flow).
const PUBLIC_AI_ACTIONS = new Set(['processSiswaAIChat']);
// Anonymous candidate prefill — public by design, IP-only bucket.
const PREFILL_ACTIONS = new Set(['getExistingCandidateJsonByWa']);
const FONNTE_ACTIONS = new Set(['kirimSatuPesanFonnte', 'kirimTawaranMassal']);

const ROOT = process.cwd();
const SRC_DIR = join(ROOT, 'src');

// Pola 1: lewat apiClient terpusat — apiClient.call("x") / api.get("x") / api.secure("x")
const API_RE = /\b(?:apiClient|api)\s*(?:\.\s*(?:call|get|secure)\s*)?\(\s*["']([A-Za-z][A-Za-z0-9_]*)["']/g;
// Pola 2: fetch mentah ke bridge-links — body: JSON.stringify({ action: "x", ... })
const RAW_RE = /action\s*:\s*["']([A-Za-z][A-Za-z0-9_]*)["']/g;

function walkSrc(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const abs = join(dir, f);
    if (statSync(abs).isDirectory()) {
      if (!/node_modules|dist|\.netlify-built/.test(abs)) walkSrc(abs, out);
    } else if (/\.(ts|tsx|astro)$/.test(f) && !f.includes('.test.')) {
      out.push(abs);
    }
  }
  return out;
}

/** Semua literal nama action yang dipanggil frontend, dari dua pola pemanggilan. */
function frontendActions(): string[] {
  const found = new Set<string>();
  for (const f of walkSrc(SRC_DIR)) {
    const src = readFileSync(f, 'utf8');
    for (const re of [API_RE, RAW_RE]) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) found.add(m[1]);
    }
  }
  return [...found].sort();
}

describe('SURFACE_HANDLERS — isi registry', () => {
  it('semua nilai adalah fungsi (handler terdaftar benar)', () => {
    for (const [name, h] of Object.entries(SURFACE_HANDLERS)) {
      expect(typeof h, `handler '${name}' harus fungsi`).toBe('function');
    }
  });

  it('tidak kosong dan tidak ada nama duplikat', () => {
    const names = Object.keys(SURFACE_HANDLERS);
    expect(names.length).toBeGreaterThan(50);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('grup rate limit ⊆ registry', () => {
  for (const [label, set] of [
    ['LOGIN', LOGIN_ACTIONS],
    ['AI', AI_ACTIONS],
    ['PUBLIC_AI', PUBLIC_AI_ACTIONS],
    ['PREFILL', PREFILL_ACTIONS],
    ['FONNTE', FONNTE_ACTIONS],
  ]) {
    it(`${label}_ACTIONS hanya berisi action terdaftar`, () => {
      for (const a of set) {
        expect(SURFACE_HANDLERS[a], `'${a}' harus ada di SURFACE_HANDLERS`).toBeDefined();
      }
    });
  }
});

describe('kontrak frontend → registry', () => {
  const front = frontendActions();

  it('menemukan action yang dipanggil frontend (sanity)', () => {
    expect(front.length).toBeGreaterThan(15);
  });

  it('setiap action yang dipanggil frontend ADA di registry backend', () => {
    const missing = front.filter((a) => !(a in SURFACE_HANDLERS));
    expect(
      missing,
      'action dipanggil frontend tapi tidak terdaftar — fitur akan gagal diam-diam ' +
        '(dispatcher mengembalikan "not implemented"): ' +
        missing.join(', '),
    ).toEqual([]);
  });
});

// ─── REGRESI: action frontend yang pernah hilang dari registry ─────────────
// Kedua action ini dipanggil dari src/ tetapi tidak terdaftar, sehingga
// dispatcher menolaknya. Test ini mengunci perbaikannya.
describe('regresi — action yang pernah tidak terdaftar', () => {
  it('submitFormPelamar (ApplyFullForm) terdaftar', () => {
    expect(typeof SURFACE_HANDLERS.submitFormPelamar).toBe('function');
  });

  it('saveSignature (CandidateDash) terdaftar', () => {
    expect(typeof SURFACE_HANDLERS.saveSignature).toBe('function');
  });

  it('getJobStatus (polling background job) terdaftar + menolak payload kosong', async () => {
    expect(typeof SURFACE_HANDLERS.getJobStatus).toBe('function');
    // Deterministic without a DB: missing jobId throws the kernel validation error.
    await expect(SURFACE_HANDLERS.getJobStatus([])).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});

// ─── KONTRAK RUTE KLIEN → ENTRY POINT (2026-09-12) ──────────────────────────
//
// Kenapa lapisan ini perlu, padahal registry sudah dijaga di atas
// ------------------------------------------------------------------
// Test di atas hanya membuktikan action ADA di registry. Itu TIDAK cukup:
// registry adalah gabungan semua surface, sedangkan klien memanggil SATU
// entry point tertentu lewat src/lib/apiEndpoint.ts. Kalau action-nya ada di
// registry tetapi entry point yang ditunjuk tidak meng-allow-list-nya, wrapper
// membalas 404 lebih dulu — dan apiClient.ts diam-diam mengulang ke catch-all
// bridge-links. Fitur tetap jalan, jadi tidak ada yang sadar, tapi:
//   - setiap panggilan membayar satu round-trip sia-sia, dan
//   - fitur itu bergantung pada fungsi terberat di repo tanpa deklarasi apa pun.
//
// Dua bug hidup ditemukan lewat celah ini (keduanya diperbaiki 2026-09-12;
// getShareTokenForJob dihentikan 2026-09-13 — share publik per kode job lagi):
//   getShareTokenForJob — dirutekan ke /jobs, tidak ada di allow-list jobs.js
//   parseDokumenBiodata — tidak ada rutenya sama sekali, selalu jatuh ke FALLBACK
//
// Gate statis yang setara ada di scripts/ci/surface-binding.mjs (aturan
// "reachability"). Test ini menjaga sisi kliennya: rute → entry → allow-list.
function clientRoutes(): Record<string, string> {
  const src = readFileSync(join(ROOT, 'src/lib/apiEndpoint.ts'), 'utf8');
  const block = src.match(/const SURFACE_ENDPOINTS[^{]*\{([\s\S]*?)\n\};/);
  if (!block) return {};
  const out: Record<string, string> = {};
  const re = /^\s*([A-Za-z][A-Za-z0-9_]*)\s*:\s*'([^']+)'/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block[1])) !== null) {
    out[m[1]] = m[2].replace('/.netlify/functions/', '');
  }
  return out;
}

/** Allow-list sebuah entry point sempit, atau null kalau bukan entry sempit. */
function entryAllowList(fnName: string): string[] | null {
  let src: string;
  try {
    src = readFileSync(join(ROOT, 'netlify/functions', fnName + '.js'), 'utf8');
  } catch {
    return null;
  }
  const call = src.match(
    /makeSurfaceHandler\(\s*(?:\[[^\]]*\]|[A-Z0-9_]+_ACTIONS)\s*,\s*\[([\s\S]*?)\]\s*\)/,
  );
  if (!call) return null;
  return call[1]
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

describe('kontrak rute klien → entry point', () => {
  const routes = clientRoutes();

  it('menemukan rute klien (sanity)', () => {
    expect(Object.keys(routes).length).toBeGreaterThan(50);
  });

  it('setiap action yang dirutekan klien diterima oleh entry point tujuannya', () => {
    const broken: string[] = [];
    for (const [action, fn] of Object.entries(routes)) {
      const allowed = entryAllowList(fn);
      if (allowed === null) {
        broken.push(`${action} -> /${fn} (entry tidak ada / bukan entry sempit)`);
        continue;
      }
      if (!allowed.includes(action)) {
        broken.push(`${action} -> /${fn} (entry menolak action ini → 404 → retry diam-diam ke catch-all)`);
      }
    }
    expect(
      broken,
      'rute klien menunjuk entry point yang tidak menerima action-nya:\n  ' + broken.join('\n  '),
    ).toEqual([]);
  });
});

// ─── KONTRAK REGISTRY → RUTE KLIEN (2026-10-06) ─────────────────────────────
//
// Blok di atas menjaga arah rute → entry: action yang DIRUTEKAN harus diterima
// entry point yang ditunjuknya. Arah sebaliknya tidak dijaga siapa pun: sebuah
// action yang terdaftar di registry (dan dipanggil frontend) tetapi TIDAK punya
// rute sendiri. Yang terjadi bukan error, melainkan degradasi senyap —
// `getEndpoint()` mengembalikan FALLBACK bridge-links (`apiEndpoint.ts:135`),
// dan apiClient mengulang ke catch-all saat entry yang dituju membalas 404
// (`apiClient.ts:335-337`). Fitur tetap jalan, jadi tidak ada yang sadar.
//
// Kelas cacat ini sudah dua kali nyata di repo ini, dan keduanya tercatat di
// komentar `src/lib/apiEndpoint.ts` sendiri:
//   parseDokumenBiodata — tidak punya rute sama sekali, selalu ke FALLBACK
//   getAppConfig / reportWebVital — hanya terjangkau lewat catch-all
// `reportWebVital` khususnya dipanggil klien pada SETIAP page view, jadi ia
// membayar satu round-trip sia-sia ke fungsi terberat di repo tiap kali.
//
// `scripts/ci/surface-binding.mjs` punya gate statis untuk reachability sisi
// entry; blok ini menutup sisi kliennya supaya rute yang hilang gagal DI SINI,
// bukan menghilang ke catch-all.
describe('kontrak registry → rute klien', () => {
  const routes = clientRoutes();

  /** Rute cadangan yang dipakai getEndpoint() untuk action tak dikenal. */
  function fallbackRoute(): string | null {
    const src = readFileSync(join(ROOT, 'src/lib/apiEndpoint.ts'), 'utf8');
    const m = src.match(/const FALLBACK\s*=\s*'([^']+)'/);
    return m ? m[1].replace('/.netlify/functions/', '') : null;
  }

  it('FALLBACK masih bridge-links (sanity — kalau ini berubah, blok ini salah sasaran)', () => {
    expect(fallbackRoute()).toBe('bridge-links');
  });

  it('setiap action yang dipanggil frontend punya rute EKSPLISIT (bukan catch-all)', () => {
    const unrouted = frontendActions().filter((a) => !(a in routes));
    expect(
      unrouted,
      'action dipanggil frontend TANPA rute eksplisit — akan jatuh ke catch-all ' +
        `bridge-links secara diam-diam (404 lalu retry): ${unrouted.join(', ')}`,
    ).toEqual([]);
  });
});
