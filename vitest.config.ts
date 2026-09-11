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
    projects: [
      {
        plugins: [preact()],
        test: {
          name: 'frontend',
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
