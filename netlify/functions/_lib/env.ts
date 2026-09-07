import fs from 'fs';
import path from 'path';
// env.js — akses env var untuk fungsi backend.
//
// Prioritas: process.env (Netlify production / Freebuff Keys UI) lalu fallback
// ke .env.local di repo (hanya untuk preview sandbox). Hanya kunci whitelist
// yang dibaca dari file — secret lain tidak pernah disentuh.

const WHITELIST = new Set([
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ANON_KEY',
  'SUPABASE_KEY',
  'GEMINI_API_KEY',
  'FONNTE_TOKEN',
  'FONNTE_API_KEY',
  'ADMIN_PASSWORD',
  'ADMIN_MASTER_PASSWORD',
  'MASTER_PASSWORD',
  'ASJ_ADMIN_PASSWORD',
  'ADMIN_PIN',
  'PIN_ADMIN',
  'ADMIN_MASTER_PIN',
  'ADMIN_NUMBERS',
  'PIN_KHOCI',
  'PIN_SACHOU',
  'PIN_AYOK',
  'PIN_KHOLIS',
  'GROQ_API_KEY',
  'XAI_API_KEY',
  'SUPABASE_STORAGE_BUCKET',
  'LOG_DRAIN_TOKEN',
  'CLOUDINARY_URL',
  'NETLIFY_SITE_URL',
  'SESSION_SECRET',
  'SUPABASE_JWT_SECRET',
  'ASJ_ADMINS',
  'SENTRY_DSN',
  'FIREBASE_SERVICE_ACCOUNT',
]);

// Nama scope pada tabel env Netlify yang ditempel. Nilai pada baris scope ini
// milik variabel yang namanya ada di baris komentar (#) tepat di atas bloknya.
const SCOPE_ROWS = new Set([
  'PRODUCTION',
  'DEPLOY_PREVIEW',
  'BRANCH_DEPLOY',
  'LOCAL_DEVELOPMENT_NETLIFY_CLI',
]);

// Normalisasi nama key dari tabel yang ditempel:
// "SUPABASE URL" -> "SUPABASE_URL", "Service Role Key" -> "SERVICE_ROLE_KEY", dst.
function normalizeKey(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// Alias umum bila nama asli di dashboard Netlify beda dari nama baku.
const ALIASES: Record<string, string> = {
  SERVICE_ROLE_KEY: 'SUPABASE_SERVICE_ROLE_KEY',
  SERVICE_KEY: 'SUPABASE_SERVICE_ROLE_KEY',
  SUPABASE_KEY: 'SUPABASE_SERVICE_ROLE_KEY',
  ANON_KEY: 'SUPABASE_ANON_KEY',
  SUPABASE_ANON: 'SUPABASE_ANON_KEY',
  GEMINI_KEY: 'GEMINI_API_KEY',
  GEMINI: 'GEMINI_API_KEY',
  GOOGLE_GEMINI_KEY: 'GEMINI_API_KEY',
  FONNTE: 'FONNTE_TOKEN',
  FONNTE_API: 'FONNTE_TOKEN',
  MASTER_PIN: 'ADMIN_MASTER_PIN',
  ADMIN_PIN: 'ADMIN_MASTER_PIN',
  SESSION_KEY: 'SESSION_SECRET',
  JWT_SECRET: 'SUPABASE_JWT_SECRET',
  SUPABASE_JWT: 'SUPABASE_JWT_SECRET',
  ASJ_ADMIN: 'ASJ_ADMINS',
};

// Parse satu baris env: dukung format "KEY=value" DAN format tabel
// "| label | nilai |" (hasil salin tabel Environment Variables Netlify).
function parseLine(line: string): { key: string; value: string } | null {
  const kv = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (kv) return { key: kv[1], value: kv[2].trim() };
  const pipeFull = line.match(/^\s*\|\s*(.+?)\s*\|\s*([^|]*?)\s*\|\s*$/);
  if (pipeFull) {
    const key = normalizeKey(pipeFull[1]);
    if (key) return { key, value: pipeFull[2].trim() };
  }
  const pipeTail = line.match(/^\s*\|\s*(.+?)\s*\|\s*([^|]*)$/);
  if (pipeTail) {
    const key = normalizeKey(pipeTail[1]);
    if (key) return { key, value: pipeTail[2].trim() };
  }
  return null;
}

// Lokasi .env.local dicari dari cwd ke ATAS (maks 8 level) karena worker
// netlify dev (functions:serve / netlify dev) berjalan dengan cwd = direktori
// stage (.netlify/functions-serve/<fn>/), bukan akar repo — tanpa ini
// SESSION_SECRET jatuh ke fallback secret acak dan semua token lokal ditolak.
// Guard: file hanya dipakai bila berada di direktori ber-package.json
// (penanda akar repo), supaya .env.local milik direktori induk di luar repo
// tidak pernah terbaca.
function findEnvFile(): string | null {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, '.env.local');
    if (fs.existsSync(candidate)) {
      if (dir === process.cwd() || fs.existsSync(path.join(dir, 'package.json'))) {
        return candidate;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

let fileEnv: Record<string, string> | null = null;
function loadFileEnv(): Record<string, string> {
  if (fileEnv) return fileEnv;
  fileEnv = {};
  try {
    const p = findEnvFile();
    if (!p) return fileEnv;
    // Diagnostik sekali per proses. Aman: hanya mencetak bila file .env.local
    // benar-benar ada di disk — di produksi file tidak pernah ikut deploy, jadi
    // baris ini tidak akan pernah muncul di sana. Tidak ada nilai rahasia.
    if (!process.env.VITEST) {
      console.error('[env] cwd=' + process.cwd() + ' envFile=' + p +
        ' procEnvSessionSecret=' + (process.env.SESSION_SECRET ? 'set' : 'missing'));
    }
    const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
    // Format yang didukung:
    //   KEY=value
    //   # NAMA_VARIABEL  (nama variabel untuk blok tabel scope di bawahnya)
    //   | Production | <nilai> |  (dst.) — nilai milik variabel di komentar atas
    let currentVar = '';
    for (const line of lines) {
      const cm = line.match(/^\s*#+\s*(.+?)\s*$/);
      if (cm) {
        currentVar = normalizeKey(cm[1]);
        continue;
      }
      const parsed = parseLine(line);
      if (!parsed) continue;
      let val = parsed.value;
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
      const isScope = SCOPE_ROWS.has(parsed.key);
      const target = isScope
        ? ALIASES[currentVar] || currentVar
        : ALIASES[parsed.key] || parsed.key;
      if (!WHITELIST.has(target)) continue;
      if (isScope) {
        // Nilai scope: utamakan baris PRODUCTION; jangan menimpa nilai KEY=value.
        if (parsed.key === 'PRODUCTION' || !(target in fileEnv)) {
          fileEnv[target] = val;
        }
      } else {
        fileEnv[target] = val;
      }
    }
  } catch {
    /* file tidak ada / tidak terbaca — abaikan */
  }
  return fileEnv;
}

function env(key: string): string {
  const v =
    process.env[key] !== undefined && process.env[key] !== ''
      ? process.env[key]
      : loadFileEnv()[key] || '';
  // NETLIFY_SITE_URL kadang tercemar baris paste tabel env Netlify (multi-
  // baris berisi variabel lain) — ambil hanya URL valid pertama.
  if (key === 'NETLIFY_SITE_URL') {
    // Nilai bisa tercemar paste tabel env Netlify — ambil host saja
    // (https://<subdomain>.<domain>), tanpa path. Port dipertahankan
    // (mis. http://127.0.0.1:3000 untuk preview lokal).
    const m = String(v).match(/https?:\/\/[a-z0-9.-]+(?::\d+)?/i);
    if (m) return m[0];
  }
  return v;
}

// Debug: nama-nama kunci yang berhasil dibaca dari .env.local (TANPA nilai).
function debugFileEnvKeys() {
  return Object.keys(loadFileEnv());
}

// Debug lanjutan: struktur file .env.local — cwd, ukuran file, jumlah baris,
// dan NAMA key apa pun yang terlihat (nilainya TIDAK pernah dibaca/ditampilkan).
// Dipakai untuk mendiagnosis kenapa key tidak terbaca (nama beda / format beda).
function debugFileStructure() {
  const info = {
    cwd: process.cwd(),
    exists: false,
    size: 0,
    lines: 0,
    keys: [] as string[],
    // Klasifikasi bentuk baris (nilai tidak pernah ditampilkan):
    keyValue: 0, // KEY=value
    jsonKey: 0, // "KEY": value (format JSON)
    comment: 0, // # ... / ; ...
    blank: 0,
    other: 0,
    otherShapes: [] as string[], // klasifikasi bentuk baris lain (tanpa isi)
  };
  try {
    const p = findEnvFile();
    if (!p) return info;
    const st = fs.statSync(p);
    info.exists = true;
    info.size = st.size;
    const content = fs.readFileSync(p, 'utf8');
    const rawLines = content.split(/\r?\n/);
    info.lines = rawLines.length;
    for (const line of rawLines) {
      const trimmed = line.trim();
      const parsedRow = parseLine(line);
      if (parsedRow) {
        info.keyValue++;
        info.keys.push(parsedRow.key);
      } else if (trimmed.startsWith('#') || trimmed.startsWith(';')) {
        info.comment++;
      } else if (trimmed === '') {
        info.blank++;
      } else {
        info.other++;
        const shape = trimmed.startsWith('{')
          ? '{obj'
          : trimmed.startsWith('[')
            ? '[arr'
            : trimmed.startsWith('"')
              ? '\"str'
              : 'len' + trimmed.length + ':' + trimmed.charAt(0);
        if (info.otherShapes.length < 5 && !info.otherShapes.includes(shape)) {
          info.otherShapes.push(shape);
        }
      }
    }
    info.keys = [...new Set(info.keys)];
    // Rincian per key: jumlah kemunculan, panjang nilai, apakah nilainya
    // mengandung pipe (tanda multi-kolom ikut tersalin). Nilai TIDAK pernah
    // ditampilkan.
    const keyStats: Record<string, any> = {};
    for (const line of rawLines) {
      const parsed = parseLine(line);
      if (!parsed) continue;
      const s = keyStats[parsed.key] || { count: 0, valueLen: 0, valueHasPipe: false };
      s.count++;
      s.valueLen = parsed.value.length;
      if (parsed.value.includes('|')) s.valueHasPipe = true;
      keyStats[parsed.key] = s;
    }
    // @ts-expect-error JS→TS migration
    info.keyStats = Object.entries(keyStats).map(([k, s]) => ({ key: k, ...s }));
    // Klasifikasi baris "other" berdasarkan prefix (tanpa isi):
    const prefixCount: Record<string, any> = {};
    for (const line of rawLines) {
      const trimmed = line.trim();
      if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith(';')) continue;
      if (parseLine(line)) continue;
      const cls = trimmed.startsWith('|-')
        ? '|- (separator tabel)'
        : trimmed.startsWith('|')
          ? '| (pipe lain)'
          : trimmed.startsWith('-')
            ? '- (dash)'
            : trimmed.startsWith('{')
              ? '{ (obj)'
              : 'lainnya';
      prefixCount[cls] = (prefixCount[cls] || 0) + 1;
    }
    // @ts-expect-error JS→TS migration
    info.otherPrefix = prefixCount;
    // Bentuk baris "other": klasifikasi tiap field pipa (TANPA nilai).
    // Dipakai untuk mengenali layout tabel yang ditempel (mis. value-first).
    function fieldShape(f: string): string {
      const t = f.trim();
      if (/^https?:\/\//.test(t)) return 'url';
      if (/^ey[A-Za-z0-9_-]+$/.test(t) && t.length > 20) return 'jwt';
      if (/^\d+$/.test(t)) return 'num';
      if (/^[A-Za-z][A-Za-z0-9_. -]{0,40}$/.test(t)) return 'word';
      if (t === '✅' || t === '✔' || t === '✓') return 'check';
      if (t === '') return 'empty';
      return 'mixed(' + t.length + ')';
    }
    const shapeCount: Record<string, any> = {};
    for (const line of rawLines) {
      const trimmed = line.trim();
      if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith(';')) continue;
      if (parseLine(line)) continue;
      const fields = trimmed.split('|').map(fieldShape);
      const pat = fields.join(' | ');
      shapeCount[pat] = (shapeCount[pat] || 0) + 1;
    }
    // @ts-expect-error JS→TS migration
    info.otherFieldShapes = Object.entries(shapeCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([pat, cnt]) => pat + ' x' + cnt);
    // Nama field pertama (key) dari baris "other" yang TIDAK ter-parse,
    // ditampilkan ter-mask (nama variabel bukan rahasia):
    // "SUP…_KEY (26)". Nilai tidak pernah ditampilkan.
    const masked: string[] = [];
    for (const line of rawLines) {
      const trimmed = line.trim();
      if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith(';')) continue;
      if (parseLine(line)) continue;
      const m = trimmed.match(/^\s*\|\s*([^|]*)/);
      if (m) {
        const f = m[1].trim();
        const mask =
          f.length <= 8
            ? f.charAt(0) + '…'
            : f.slice(0, 5) + '…' + f.slice(-5) + ' (' + f.length + ')';
        if (!masked.includes(mask)) masked.push(mask);
      }
    }
    // @ts-expect-error JS→TS migration
    info.otherMaskedKeys = masked.slice(0, 12);
    // Dump 30 baris pertama: NAMA KEY (atau bentuk baris) + nilai ter-mask
    // (3 karakter awal + 3 akhir + panjang). Nilai penuh TIDAK pernah tampil.
    function maskVal(v: string): string {
      if (v === '') return '(kosong)';
      const s =
        v.length <= 12
          ? v.charAt(0) + '…(' + v.length + ')'
          : v.slice(0, 3) + '…' + v.slice(-3) + ' (' + v.length + ')';
      return s;
    }
    const linesDump = [];
    for (let i = 0; i < Math.min(rawLines.length, 30); i++) {
      const line = rawLines[i];
      const trimmed = line.trim();
      if (trimmed === '') continue;
      const parsed = parseLine(line);
      if (parsed) {
        linesDump.push(i + 1 + ': ' + parsed.key + ' = ' + maskVal(parsed.value));
      } else if (trimmed.startsWith('#')) {
        const text = trimmed.replace(/^#+\s*/, '').trim();
        linesDump.push(i + 1 + ': # ' + (text.length > 60 ? text.slice(0, 60) + '…' : text));
      } else {
        const fields = trimmed.split('|');
        linesDump.push(i + 1 + ': [' + fields.map((f) => maskVal(f.trim())).join(' | ') + ']');
      }
    }
    // @ts-expect-error JS→TS migration
    info.linesDump = linesDump;
    // Semua nama variabel (baris komentar), unik — hanya nama, bukan nilai.
    const allComments = [];
    for (const line of rawLines) {
      const m = line.match(/^\s*#+\s*(.+?)\s*$/);
      if (m) allComments.push(m[1]);
    }
    // @ts-expect-error JS→TS migration
    info.comments = [...new Set(allComments)];
  } catch {
    /* file tidak ada / tidak terbaca */
  }
  return info;
}

export { env, debugFileEnvKeys, debugFileStructure };
