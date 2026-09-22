import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

// Dua project: frontend (jsdom, butuh DOM buat komponen Preact) dan backend
// (node, karena netlify functions menyentuh crypto/fs dan tidak punya DOM).
//
// LATAR BELAKANG: sebelumnya `include` cuma `src/**` + `e2e/**`, jadi 13 suite
// backend di netlify/functions/_lib TIDAK PERNAH dijalankan — 4 test gagal
// (bug normalisasi nomor WA) tanpa ada yang tahu. Jangan persempit include ini lagi.
export default defineConfig({
  test: {
    globals: true,
    // ── pool: 'threads' is REQUIRED — jangan dihapus ───────────────────────
    // Dengan pool default 'forks' di Vitest 4.x + Windows, semua test lulus
    // tapi runner TIDAK PERNAH keluar: `npx vitest run` hang selamanya setelah
    // mencetak hasil (terverifikasi: 7 dari 18 file backend, di-kill di 45s).
    // Job CI lalu kena timeout dan dibatalkan tanpa output berguna.
    // 'threads' teardown dengan benar — 223 test selesai ~2.5 detik.
    // Kalau mau balik ke 'forks', verifikasi dulu satu run penuh keluar dengan
    // exit code 0 di Windows sebelum commit.
    //
    // PENTING: `pool` TIDAK diwariskan ke `projects` — harus diset ulang di
    // setiap project di bawah (kalau tidak, file test lulus semua tapi proses
    // tidak pernah exit dan job CI digantung sampai timeout).
    pool: 'threads',
    // Batas atas agar test yang macet tidak bisa menggantung job CI lagi.
    testTimeout: 15000,
    teardownTimeout: 20000,
    // ── Coverage (G-03) ──────────────────────────────────────────────────────
    // Until 2026-09-17 `npm run test:coverage` could not run AT ALL:
    // `@vitest/coverage-v8` was never declared in package.json, so the script
    // died immediately with `MISSING DEPENDENCY`. There was also no `coverage`
    // block here — no provider, no reporter, no threshold — so even once it ran
    // there was nothing holding a line. The open item was recorded as "coverage
    // exists but has no threshold"; the measured truth is that it did not exist.
    //
    // SCOPE: `test:coverage` passes `--project=frontend --project=backend` on
    // purpose. Coverage instrumentation roughly triples the indexer suites'
    // runtime (measured on this tree: the indexer project alone goes 139 s ->
    // 440 s) and pushes `indexer/src/validate.test.ts` past its own 60 s timeout,
    // which turns a coverage run into a timeout report instead of a number. The
    // indexer is a development tool rather than shipped code, and it already has
    // its own ratchets (discover/build/deep-tier). Leaving it out of COVERAGE
    // does not leave it out of CI — `ci:quality` still runs `idx:gate`.
    //
    // THE THRESHOLDS ARE A RATCHET, like `.ci/biome-baseline.json`: set just
    // below what the tree measures today, so coverage may only rise. They are
    // deliberately NOT a quality target. A number picked to look good is a
    // number that gets lowered the first time it fails.
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary'],
      // A test file is not "uncovered product code", and generated output is not
      // code at all. Leaving them in inflates the denominator with files nobody
      // is expected to cover.
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/*.config.{ts,mjs,js}',
        'dist/**',
        'indexer/**',
        'scripts/**',
        'netlify/functions/.netlify-built/**',
      ],
      thresholds: {
        // ── A ratchet measured on 2026-09-17, NOT a target.
        //
        // These four numbers are the measured totals from a real
        // `npm run test:coverage` run (`coverage/coverage-summary.json`),
        // rounded DOWN to the nearest whole percent. A threshold with no
        // measured run behind it is exactly the guess this repo keeps paying
        // for: it gets lowered the first time it fails, and after that it is
        // decoration.
        //
        // Measured, before rounding:
        //   statements 56.38 %   branches 47.85 %
        //   functions  54.21 %   lines    59.21 %
        // ── and the measurement did not come cheaply. This environment could
        //    not run coverage at all at first: the v8 provider removes its own
        //    report directory through `fs.rm`, and the sandbox's bulk-delete
        //    guard refused it (measured: 614 deletions requested against a
        //    50-per-turn quota), crashing `V8CoverageProvider.clean` before the
        //    run and `cleanAfterRun` after it — every attempt ended with no
        //    `coverage-summary.json`. It succeeds when the run is allowed
        //    outside the sandbox.
        //
        // The natural home for that summary file, `coverage/`, is now
        // gitignored (see the bottom of .gitignore). It is evidence, and this
        // config is the only thing that consumes it — so the numbers below must
        // be updated BY HAND after a deliberate re-measure, never by whatever
        // an incidental run happens to leave on disk.
        statements: 56,
        branches: 47,
        functions: 54,
        lines: 59,
      },
    },
    projects: [
      {
        plugins: [preact()],
        test: {
          name: 'frontend',
          // Not inherited from the root config (same as `pool` above), so it has
          // to be repeated here or the project silently runs on vitest's 5 s
          // default while the root appears to promise 15 s.
          testTimeout: 15000,
          environment: 'jsdom',
          pool: 'threads',
          include: ['src/**/*.test.{ts,tsx}', 'e2e/**/*.test.{ts,tsx}'],
          // e2e/share-data.test.ts is a Node-only handler test (node:vm +
          // node:fs readFileSync). It lives in e2e/ because Netlify would
          // otherwise bundle it from netlify/functions/, but it must run in
          // the 'backend' project — jsdom throws `URL must be of scheme file`.
          exclude: ['node_modules/**', 'dist/**', 'e2e/share-data.test.ts'],
        },
      },
      {
        test: {
          name: 'backend',
          // Not inherited from the root config — see the note on the frontend
          // project above. A file-writing test (fcm-server) was observed timing
          // out at 5000 ms under full-suite load on 2026-09-12 while passing in
          // 378 ms on its own, which is what surfaced this.
          testTimeout: 15000,
          environment: 'node',
          pool: 'threads',
          // e2e/*.test.ts ditambahkan 2026-09-11: share-data.test.ts DIPINDAH
          // keluar dari netlify/functions/ (Netlify menganggap *.test.ts di
          // sana sebagai deployable function → bundling gagal karena `vitest`
          // tidak ada di produksi). Isinya handler-level, bukan browser, jadi
          // harus di project 'node' ini — BUKAN di project frontend (jsdom):
          // ia memakai node:vm + node:fs dan readFileSync ke source CJS.
          include: [
            'netlify/functions/**/*.test.ts',
            'shared/**/*.test.ts',
            'e2e/**/*.test.ts',
          ],
          exclude: ['node_modules/**', 'dist/**', 'netlify/functions/.netlify-built/**'],
        },
      },
      {
        test: {
          // Code index (docs/CODE_INDEX_DESIGN.md). pool: 'threads' is required
          // on Windows — same hang lesson as the backend project above.
          name: 'indexer',
          // Real-tree suites (buildIndex now runs the checker-backed deep
          // tier, ~2-9 s per build) need more than the 5 s vitest default.
          testTimeout: 60000,
          environment: 'node',
          pool: 'threads',
          include: ['indexer/**/*.test.ts'],
          exclude: ['node_modules/**', 'dist/**', 'indexer/dist/**'],
        },
      },
    ],
  },
});
