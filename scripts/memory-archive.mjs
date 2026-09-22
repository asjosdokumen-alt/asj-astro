#!/usr/bin/env node
/**
 * memory-archive.mjs — jaga memory tetap ramping & terbaru, arsipkan yang lama.
 *
 * MASALAH YANG DIPECAHKAN
 * ----------------------
 * Log harian hanya tumbuh. Diukur 2026-09-19 sebelum skrip ini ada:
 *
 *   2026-09-11.md   49.011 B
 *   2026-09-12.md   92.229 B
 *   2026-09-13.md  108.075 B
 *   2026-09-14.md   69.156 B
 *   2026-09-15.md   74.001 B
 *   2026-09-16.md   57.520 B
 *   2026-09-17.md   97.640 B
 *   2026-09-18.md   72.942 B
 *   ─────────────────────────
 *   total log      620.574 B  (605 KB)
 *
 * Sembilan berkas, 605 KB. Yang benar-benar dibaca tiap sesi cuma `MEMORY.md`
 * (4 KB). Sisanya adalah arsip yang **tidak pernah** selesai dibaca siapa pun,
 * tapi tetap ikut menyalin repo, ikut di-grep, dan membuat "cari catatan lama"
 * jadi pekerjaan arkeologi.
 *
 * YANG DILAKUKAN
 * --------------
 *   log >  ROTATE_AFTER_DAYS  → ringkas jadi `arsip/YYYY-MM.md`, berkas hariannya dihapus
 *   MEMORY.md > BUDGET_BYTES  → LAPOR saja (tidak pernah dipangkas otomatis)
 *   MEMORY_DETAIL.md          → LAPOR ukurannya (tidak dirotasi; ini rujukan hidup)
 *
 * `arsip/YYYY-MM.md` bukan salinan mentah — ia **ringkasan terstruktur**: tiap
 * log harian dipotong pada batas bagian `###`/`##`, lalu paragraf pertama tiap
 * bagian dipertahankan sebagai ringkasan. Isinya tetap bisa dicari, tapi 605 KB
 * jadi puluhan KB.
 *
 * KENAPA MEMORY.md TIDAK DIPANGKAS OTOMATIS
 * -----------------------------------------
 * Ini keputusan sadar, bukan kelalaian. `MEMORY.md` adalah **satu-satunya** berkas
 * yang di-inject ke setiap sesi; memangkasnya otomatis berarti sebuah fakta bisa
 * hilang dari konteks tanpa ada yang membacanya lebih dulu. Skrip ini karena itu
 * hanya **melaporkan** pelanggaran anggaran beserta angka dan baris terpanjangnya,
 * supaya yang memangkas adalah model yang sudah membaca isinya — dan **memindahkan**
 * yang dipotong ke `MEMORY_DETAIL.md`, bukan membuangnya. Diukur 2026-09-19:
 * `MEMORY.md` sudah pernah 5.392 B (melampaui 4 KB) dan pemangkasannya dilakukan
 * manual dengan cara itu.
 *
 * PEMAKAIAN
 *   node scripts/memory-archive.mjs              # laporan + rotasi yang jatuh tempo
 *   node scripts/memory-archive.mjs --dry-run    # laporan saja, tidak menulis apa pun
 *   node scripts/memory-archive.mjs --check      # exit 1 bila ada pelanggaran anggaran
 *
 * EXIT CODES
 *   0  tidak ada pelanggaran
 *   1  ada pelanggaran anggaran (hanya dengan --check)
 *   2  direktori memory tidak ada / tidak terbaca
 */

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MEM = join(HERE, '..', '.workbuddy-ai', 'memory');
const ARSIP = join(MEM, 'arsip');

/** Log harian lebih tua dari ini diringkas ke `arsip/YYYY-MM.md`. */
const ROTATE_AFTER_DAYS = 7;
/** Anggaran `MEMORY.md` — ia di-inject ke SETIAP sesi, jadi ini biaya tetap. */
const BUDGET_MEMORY = 4096;
/** Ambang peringatan `MEMORY_DETAIL.md` (rujukan hidup, tidak dirotasi). */
const WARN_DETAIL = 200 * 1024;

const argv = new Set(process.argv.slice(2));
const DRY = argv.has('--dry-run');
const CHECK = argv.has('--check');

if (!existsSync(MEM)) {
  console.error(`[memory] direktori tidak ada: ${MEM}`);
  process.exit(2);
}

const bytes = (p) => statSync(p).size;
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

/** `2026-09-18.md` → Date (UTC, tengah malam). null bila bukan log harian. */
function dailyDate(name) {
  const m = name.match(/^(\d{4})-(\d{2})-(\d{2})\.md$/);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

/**
 * Ringkas satu log harian.
 *
 * Aturan: baris `## …` dan `### …` memulai bagian baru. Di dalam bagian, paragraf
 * pertama (sampai baris kosong) dipertahankan apa adanya — itu kalimat yang biasanya
 * menyatakan APA yang dikerjakan. Sisanya dibuang, tapi **jumlah baris yang dibuang
 * dicatat** supaya ringkasan ini tidak pernah menyamar sebagai isi penuh.
 *
 * Sengaja TIDAK memakai LLM: skrip ini harus jalan di CI/tanpa jaringan, dan
 * ringkasan yang deterministik bisa di-diff.
 */
function summarize(text) {
  const lines = text.split('\n');
  const out = [];
  let i = 0;
  let dropped = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (/^#{2,3}\s/.test(l)) {
      out.push(l);
      i++;
      // pertahankan paragraf pertama pada bagian ini
      while (i < lines.length && lines[i].trim() === '') i++;
      while (i < lines.length && !/^#{2,3}\s/.test(lines[i])) {
        if (lines[i].trim() === '' && out[out.length - 1]?.trim() === '') break;
        if (lines[i].trim() === '') break;
        out.push(lines[i]);
        i++;
      }
      // buang sisa bagian sampai judul berikutnya
      while (i < lines.length && !/^#{2,3}\s/.test(lines[i])) {
        if (lines[i].trim()) dropped++;
        i++;
      }
    } else {
      if (l.trim()) dropped++;
      i++;
    }
  }
  return { body: out.join('\n').trim(), dropped };
}

const files = readdirSync(MEM).filter((f) => statSync(join(MEM, f)).isFile());
const dailies = files
  .map((f) => ({ name: f, date: dailyDate(f) }))
  .filter((x) => x.date)
  .sort((a, b) => a.date - b.date);

const now = new Date();
const cutoffMs = ROTATE_AFTER_DAYS * 86400_000;

const eligible = [];
for (const d of dailies) {
  // Umur dihitung dari tengah malam UTC hari itu, dibandingkan ke `now`.
  if (now - d.date > cutoffMs) eligible.push(d);
}

// ─── Laporan ────────────────────────────────────────────────────────────────
const totalLog = dailies.reduce((s, d) => s + bytes(join(MEM, d.name)), 0);
console.log('[memory] anggaran & ukuran');
console.log(`  MEMORY.md         ${String(bytes(join(MEM, 'MEMORY.md'))).padStart(8)} B  / ${BUDGET_MEMORY} B   ${bytes(join(MEM, 'MEMORY.md')) <= BUDGET_MEMORY ? 'OK' : 'OVER'}`);
if (existsSync(join(MEM, 'MEMORY_DETAIL.md'))) {
  const d = bytes(join(MEM, 'MEMORY_DETAIL.md'));
  console.log(`  MEMORY_DETAIL.md  ${String(d).padStart(8)} B  (tidak dirotasi)  ${d <= WARN_DETAIL ? 'OK' : `WARN > ${kb(WARN_DETAIL)}`}`);
}
console.log(`  log harian        ${String(totalLog).padStart(8)} B  (${dailies.length} berkas, ${kb(totalLog)})`);

const memSize = bytes(join(MEM, 'MEMORY.md'));
const overBudget = memSize > BUDGET_MEMORY;
if (overBudget) {
  console.log('');
  console.log(`[memory] PELANGGARAN: MEMORY.md ${memSize} B > ${BUDGET_MEMORY} B (kelebihan ${memSize - BUDGET_MEMORY} B).`);
  console.log('  Perbaikan yang BENAR — bukan memangkas membabi buta:');
  console.log('    1. pindahkan butir terpanjang ke MEMORY_DETAIL.md (JANGAN dibuang)');
  console.log('    2. sisakan pointer singkatnya di MEMORY.md');
  console.log('    3. ulangi sampai di bawah anggaran');
  const longest = readFileSync(join(MEM, 'MEMORY.md'), 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .sort((a, b) => b.length - a.length)
    .slice(0, 3);
  console.log('  Baris terpanjang saat ini (kandidat pindah):');
  for (const l of longest) console.log(`    ${String(l.length).padStart(4)} B  ${l.trim().slice(0, 80)}`);
}

if (eligible.length === 0) {
  console.log('');
  console.log(`[memory] tidak ada log yang jatuh tempo (ambang ${ROTATE_AFTER_DAYS} hari). Tidak ada yang diarsipkan.`);
} else {
  console.log('');
  console.log(`[memory] ${eligible.length} log jatuh tempo (> ${ROTATE_AFTER_DAYS} hari) akan diringkas ke arsip/YYYY-MM.md:`);
  for (const e of eligible) console.log(`  ${e.name}  ${bytes(join(MEM, e.name))} B`);
}

if (DRY) {
  console.log('');
  console.log('[memory] --dry-run: tidak ada berkas yang ditulis.');
  process.exit(CHECK && overBudget ? 1 : 0);
}

// ─── Rotasi ─────────────────────────────────────────────────────────────────
if (eligible.length > 0) {
  if (!existsSync(ARSIP)) mkdirSync(ARSIP, { recursive: true });
  /** @type {Map<string, {parts: string[], src: string[]}>} */
  const perMonth = new Map();

  for (const e of eligible) {
    const month = e.name.slice(0, 7); // YYYY-MM
    const { body, dropped } = summarize(readFileSync(join(MEM, e.name), 'utf8'));
    if (!perMonth.has(month)) perMonth.set(month, { parts: [], src: [] });
    const bucket = perMonth.get(month);
    bucket.src.push(`${e.name} (${bytes(join(MEM, e.name))} B)`);
    bucket.parts.push(`${body}\n\n_(diringkas dari \`${e.name}\` — ${dropped} baris detail dibuang; berkas aslinya dihapus)_`);
  }

  for (const [month, bucket] of perMonth) {
    const target = join(ARSIP, `${month}.md`);
    const existed = existsSync(target);
    const header = existed
      ? ''
      : `# Arsip memory — ${month}\n\n` +
        '> Ringkasan log harian bulan ini. **Bukan** salinan penuh: paragraf pertama tiap\n' +
        '> bagian dipertahankan, sisanya dibuang. Berkas harian aslinya sudah dihapus oleh\n' +
        '> `scripts/memory-archive.mjs`. Kalau butuh detail penuh, ia ada di riwayat git\n' +
        '> (folder `.workbuddy-ai/` di-gitignore, jadi kalau sudah terhapus ia tidak bisa\n' +
        '> dipulihkan dari sana — itulah sebabnya ringkasan ini menyimpan kalimat keputusan,\n' +
        '> bukan sekadar judul).\n\n---\n\n';
    const add = `## Sumber\n\n${bucket.src.map((s) => `- ${s}`).join('\n')}\n\n---\n\n${bucket.parts.join('\n\n---\n\n')}\n`;
    writeFileSync(target, (existed ? readFileSync(target, 'utf8') : header) + add);
    console.log(`[memory] ${existed ? 'tambah' : 'buat'} ${target}  (${bytes(target)} B)`);
  }

  for (const e of eligible) {
    writeFileSync(join(MEM, e.name), '');
    const fs = await import('node:fs');
    fs.unlinkSync(join(MEM, e.name));
    console.log(`[memory] hapus ${e.name} (sudah diringkas ke arsip)`);
  }
}

console.log('');
console.log('[memory] selesai.');
process.exit(CHECK && overBudget ? 1 : 0);
