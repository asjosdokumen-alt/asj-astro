// deliverables/form-parity-probe.mjs — kolom apa yang ditulis tiap form?
//
// Memanggil BUILDER SEBENARNYA (bukan membaca daftar dari dokumen):
//   - `buildMasterBody`  → jalur Form Master
//   - `masterColumnsFromAi` → jalur CV AI (ai_data_json → kolom)
// Keduanya diberi payload "semua field terisi", lalu keluaran kuncinya
// dibandingkan. Selisihnya = drift yang dikeluhkan pemilik.
import { buildMasterBody, masterColumnsFromAi, AI_TO_MASTER_COLUMNS } from '../netlify/functions/contexts/master-data/service.ts';
import { AI_CV_PATHS } from '../src/lib/aiCvDraft.ts';
import { readFileSync } from 'node:fs';

const camel = (s) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());

// 1. Nama field yang benar-benar dipakai Form Master: dibaca dari interface
//    `MasterData` di sumbernya, supaya probe ini tidak punya daftar sendiri.
const src = readFileSync('src/components/forms/MasterFullForm.tsx', 'utf8');
const iface = /interface MasterData \{([\s\S]*?)\n\}/.exec(src);
// Beberapa field ditulis satu baris (`a: string; b: string;`), jadi pisahkan
// per `;` — bukan per baris. Versi per-baris hanya menemukan 14 dari ~60.
const masterFields = iface
  ? iface[1].split(';').map((chunk) => (/^\s*([A-Za-z0-9_]+)\s*:/.exec(chunk) || [])[1]).filter(Boolean)
  : [];
console.log(`field MasterData terbaca: ${masterFields.length}`);

// 2. Payload Master: semua field terisi + baris slot penuh.
const masterPayload = Object.fromEntries(masterFields.map((k) => [k, 'X']));
masterPayload.riwayatLengkap = true;
masterPayload.pendidikan = Array.from({ length: 5 }, () => ({ tingkat: 'SMA', nama: 'S', namaSekolah: 'S', jurusan: 'J', tahunMasuk: '2000', tahunLulus: '2003' }));
masterPayload.pekerjaan = Array.from({ length: 3 }, () => ({ nama_perusahaan: 'P', jabatan: 'J', tahun_masuk: '2000', tahun_keluar: '2001', gaji: '1' }));
masterPayload.keluarga = Array.from({ length: 5 }, () => ({ hubungan: 'AYAH', nama: 'N', usia: '50', pekerjaan: 'P', gaji: '1' }));
const masterCols = new Set(Object.keys(buildMasterBody(masterPayload)));

// 3. Payload AI: setiap path di AI_CV_PATHS diisi.
const aiSections = {};
for (const [flat, paths] of Object.entries(AI_CV_PATHS)) {
  for (const p of paths) {
    const [sec, key] = p.split('.');
    (aiSections[sec] ||= {})[key] = 'X';
  }
  void flat;
}
const aiCols = new Set(Object.keys(masterColumnsFromAi(aiSections)));

const only = (a, b) => [...a].filter((x) => !b.has(x)).sort();
const masterOnly = only(masterCols, aiCols);
const aiOnly = only(aiCols, masterCols);

console.log(`\nkolom ditulis Form Master : ${masterCols.size}`);
console.log(`kolom ditulis CV AI       : ${aiCols.size}`);
console.log(`irisan                    : ${[...masterCols].filter((c) => aiCols.has(c)).length}`);

console.log(`\n=== HANYA Form Master (${masterOnly.length}) ===`);
for (const c of masterOnly) console.log('  ' + c);

console.log(`\n=== HANYA CV AI (${aiOnly.length}) ===`);
for (const c of aiOnly) console.log('  ' + c);

// 4. Field CV AI yang tidak punya kolom sama sekali (bukan hanya beda jalur).
const mapped = new Set(Object.values(AI_TO_MASTER_COLUMNS).flat().flatMap((r) => r.slice(1).map((k) => k)));
const aiFields = Object.values(AI_CV_PATHS).flat();
const noCol = aiFields.filter((p) => !mapped.has(p.split('.')[1])).sort();
console.log(`\n=== field CV AI tanpa tujuan kolom (${noCol.length}) ===`);
for (const f of noCol) console.log('  ' + f);
