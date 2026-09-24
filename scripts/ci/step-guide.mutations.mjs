#!/usr/bin/env node
/**
 * StepGuide mutation battery — membuktikan test-nya bisa GAGAL.
 *
 * R5: pemeriksaan yang belum pernah terlihat merah hanyalah hipotesis. Setiap
 * mutasi di bawah merusak komponen dengan cara yang test-nya KLAIM bisa
 * menangkap; verdict SURVIVED berarti test-nya berlubang, bukan berarti lulus.
 *
 * Pelajaran dari baterai JapanTexture (R15 3b) yang sudah dipasang di sini:
 *  - jangan pakai `--reporter=basic` (dihapus di vitest 4, CLI mati saat startup
 *    dan SEMUA mutasi terbaca KILLED palsu);
 *  - periksa `Startup Error` secara eksplisit;
 *  - selalu cetak verdict kontrol OK-GREEN;
 *  - pastikan restore byte-for-byte.
 *
 * Jalankan: node scripts/ci/step-guide.mutations.mjs
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const TARGET = join(ROOT, 'src/components/candidate/StepGuide.tsx');
const I18N_ID = join(ROOT, 'src/store/i18n.ts');
const SUITE = 'src/components/candidate/StepGuide.test.ts';

const original = readFileSync(TARGET, 'utf8');
const originalI18n = readFileSync(I18N_ID, 'utf8');

/**
 * Ganti tepat SATU kemunculan. Jumlah kecocokan diperiksa supaya mutasi yang
 * targetnya bergeser (kalimat berubah) gagal keras sebagai NOT-APPLIED,
 * bukan diam-diam tidak melakukan apa-apa lalu dinilai sebagai survivor.
 *
 * AKHIR BARIS DINORMALISASI (2026-09-23). Berkas ini CRLF murni — diukur: 159
 * CRLF, 0 LF — sedangkan anchor di bawah ditulis dengan `\n`. `split` yang persis
 * karena itu menemukan NOL kecocokan, dan hanya anchor MULTI-BARIS yang terkena:
 * M3 adalah satu-satunya, jadi delapan mutasi satu-baris di sekitarnya tetap
 * KILLED sementara M3 tidak pernah benar-benar diuji. Verdict NOT-APPLIED-nya
 * benar, tapi penyebabnya format berkas, bukan kalimat yang bergeser — dan
 * "tidak diuji" yang menyamar sebagai "diuji" adalah persis yang baterai ini ada
 * untuk mencegah.
 *
 * Normalisasi mempertahankan jaminan aslinya: kalimat yang benar-benar berubah
 * TETAP gagal keras sebagai NOT-APPLIED. Yang berhenti dihukum hanya perbedaan
 * CRLF/LF, yang bukan pergeseran. Berkas ditulis kembali dengan akhir baris
 * aslinya supaya restore tetap byte-for-byte.
 */
function apply(from, to, file = TARGET, originalText = original) {
  const crlf = originalText.includes('\r\n');
  const lf = (s) => s.replace(/\r\n/g, '\n');
  const parts = lf(originalText).split(lf(from));
  if (parts.length !== 2) {
    throw new Error(
      `NOT-APPLIED (${parts.length - 1} matches): ${JSON.stringify(from.slice(0, 60))}`,
    );
  }
  let out = parts.join(lf(to));
  if (crlf) out = out.replace(/\n/g, '\r\n');
  writeFileSync(file, out);
}

function runSuite() {
  try {
    const out = execFileSync('node', ['node_modules/vitest/vitest.mjs', 'run', SUITE], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { failed: false, out };
  } catch (err) {
    return { failed: true, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

// `noTemplateCurlyInString` vs `useTemplate` is a PAIRED trap: a template
// literal containing a literal `${...}` trips the first rule, and rewriting it
// as string concatenation trips the second. Both were hit while building this
// battery.
//
// The way out is a template literal whose interpolation is a REAL variable —
// so the rule sees `${DOLLAR_BRACE}` (valid, and what `useTemplate` asks for)
// and never sees a literal `${` in source. The assembled result still contains
// the exact characters the component uses, which is all the search string needs.
//
// `DOLLAR_BRACE` is itself the awkward case: `'$' + String.fromCharCode(123)`
// dodges `noTemplateCurlyInString` but trips `useTemplate`, and writing the
// literal sequence trips the first again. The form below is the only one that
// satisfies both — a template literal whose `$` is plain text and whose only
// `${...}` is a genuine interpolation, so the flagged sequence never appears.
const DOLLAR_BRACE = `$${String.fromCharCode(123)}`;
const KEY_TEXT = 'key';

const MUTATIONS = [
  {
    id: 'M1',
    what: 'berkas didahulukan berubah jadi diabaikan total (berkasTotal>0 tapi bukan prioritas)',
    apply: () => apply('  if (!berkasDone) return \'berkas\';', ''),
    expect: /berkas/i,
  },
  {
    id: 'M2',
    what: 'berkasTotal 0 tetap memilih berkas — langkah yang MUSTAHIL',
    apply: () => apply('berkasTotal <= 0 || berkasProgress >= COMPLETE', 'berkasProgress >= COMPLETE'),
    expect: /berkas|mustahil|impossible/i,
  },
  {
    id: 'M3',
    what: 'urutan mini/master dibalik',
    apply: () =>
      apply(
        "  if (mini < COMPLETE) return 'mini';\n  if (master < COMPLETE) return 'master';",
        "  if (master < COMPLETE) return 'master';\n  if (mini < COMPLETE) return 'mini';",
      ),
    expect: /mini|master|didahulukan/i,
  },
  {
    id: 'M4',
    what: 'ambang 100 dilonggarkan jadi 50 (bagian dinyatakan beres padahal belum)',
    apply: () => apply('const COMPLETE = 100;', 'const COMPLETE = 50;'),
    expect: /ambang|99|100/i,
  },
  {
    id: 'M5',
    what: 'profil lengkap memakai ikon file-upload, bukan circle-check (dua langkah jadi ikon yang sama)',
    apply: () => apply("return 'circle-check';", "return 'file-upload';"),
    expect: /circle-check|berbeda/i,
  },
  {
    id: 'M6',
    what: 'ikon diganti ke nama yang TIDAK ADA di sprite-map.ts (render kosong tanpa error)',
    apply: () => apply("return 'circle-check';", "return 'angry';"),
    expect: /angry|sprite/i,
  },
  {
    id: 'M7',
    what: 'kunci judul tidak diberi prefix, jadi hilang dari i18n',
    // Both sides are TEMPLATE LITERALS in the component, so the mutation has to
    // match that syntax exactly — which is why the sequence is assembled through
    // DOLLAR_BRACE rather than written. See its definition above.
    apply: () =>
      apply(
        `return \`candidate.step_${DOLLAR_BRACE}${KEY_TEXT}}_title\`;`,
        `return \`step_${DOLLAR_BRACE}${KEY_TEXT}}_title\`;`,
      ),
    expect: /judul|title|hilang/i,
  },
];

// Mutasi pada BERKAS i18n, bukan pada komponen: membuktikan pemeriksaan bahasa
// benar-benar membaca nilai terjemahan dan bukan hanya keberadaan kuncinya.
const I18N_MUTATIONS = [
  {
    id: 'M8',
    what: 'menyisipkan kata skor seleksi ke nilai terjemahan',
    apply: () =>
      apply(
        '"candidate.step_done_body": "Semua bagian sudah terisi.',
        '"candidate.step_done_body": "Skor profil kamu sudah terisi.',
        I18N_ID,
        originalI18n,
      ),
    expect: /skor/i,
  },
  {
    id: 'M9',
    what: 'mengosongkan salah satu nilai terjemahan',
    apply: () =>
      apply(
        '"candidate.step_mini_title": "Isi data dasar di CV Mini"',
        '"candidate.step_mini_title": ""',
        I18N_ID,
        originalI18n,
      ),
    expect: /kosong|mini/i,
  },
];

let killed = 0;
let survived = 0;
const problems = [];

const ALL = [...MUTATIONS, ...I18N_MUTATIONS];

for (const m of ALL) {
  try {
    m.apply();
  } catch (err) {
    console.log(`  ${m.id}  NOT-APPLIED   ${m.what}`);
    console.log(`       ${err.message}`);
    problems.push(`${m.id} did not apply`);
    writeFileSync(TARGET, original);
    writeFileSync(I18N_ID, originalI18n);
    continue;
  }

  const res = runSuite();
  if (!res.failed) {
    console.log(`  ${m.id}  SURVIVED      ${m.what}   <-- TEST HOLE`);
    survived++;
    problems.push(`${m.id} survived`);
  } else if (/Startup Error|Failed to load custom Reporter/.test(res.out)) {
    // Harness yang mati saat startup keluar non-zero untuk SETIAP mutasi, dan itu
    // terbaca sebagai 9 KILLED dari baterai yang tidak menjalankan satu tes pun.
    console.log(`  ${m.id}  HARNESS-ERROR ${m.what}`);
    problems.push(`${m.id}: vitest did not start`);
  } else if (m.expect.test(res.out)) {
    console.log(`  ${m.id}  KILLED        ${m.what}`);
    killed++;
  } else {
    console.log(`  ${m.id}  WRONG-FAILURE ${m.what}`);
    const reason = (res.out.match(/AssertionError:[^\n]*/) ?? ['(no assertion)'])[0];
    console.log(`       ${reason}`);
    problems.push(`${m.id} failed for an unrelated reason`);
  }

  writeFileSync(TARGET, original);
  writeFileSync(I18N_ID, originalI18n);
}

// Kontrol. Tanpa ini, mutasi yang tertinggal karena crash terbaca sebagai temuan
// di run berikutnya — dan harness yang rusak terbaca sebagai baterai sempurna.
const control = runSuite();
const okGreen = !control.failed;
console.log(`\n  CONTROL  OK-GREEN   restored files pass: ${okGreen}`);
if (!okGreen) problems.push('the restored files do not pass — a mutation was left behind');

console.log(
  `\n  ${killed} killed · ${survived} survived · ${ALL.length - killed - survived} other · ${okGreen ? '1 ok-green' : '0 ok-green'}`,
);

const exact =
  readFileSync(TARGET, 'utf8') === original && readFileSync(I18N_ID, 'utf8') === originalI18n;
console.log(`  restore verified byte-for-byte: ${exact}`);
if (!exact) problems.push('restore is not byte-for-byte');

if (problems.length) {
  console.log('\nFAILED:');
  for (const p of problems) console.log(`  - ${p}`);
  process.exit(1);
}
console.log('\nALL MUTATIONS KILLED.');
