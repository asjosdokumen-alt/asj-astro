# Baseline suite di mesin kantor — 2026-10-02

> ⚠️ **SEBAGIAN SUPERSEDED — sesi yang sama, beberapa jam kemudian.** Dokumen ini adalah potret
> **SEBELUM** perbaikan. Empat dari tujuh merah sudah diperbaiki, dan §4 di bawah (rekomendasi
> untuk team-lead) sudah dikerjakan ⇒ lihat
> `deliverables/engineering-assurance/red-suite-fix-2026-10-02.md`. Angka di sini tetap sah
> **sebagai baseline sebelum-perbaikan**.

**Konteks.** Sesi rumah berhenti di HEAD `0e83e7c` (pohon bersih, **18 commit lokal belum
di-push**; `origin/main` = `5c6f93b`). Dokumen ini mengukur ulang baseline di mesin kantor
(`E:\astro`) **sebelum** menyentuh kode lagi, sesuai aturan proyek.

**Hasil singkat:** baseline **identik** dengan yang tercatat — `4 failed | 177 passed (181)`.
Tidak ada regresi dari 18 commit yang belum di-push.

---

## 1. Gerbang

| Gerbang | Perintah | Hasil |
|---|---|---|
| Typecheck (main) | `tsc --noEmit` | **0 error** |
| Typecheck (indexer) | `tsc -p tsconfig.indexer.json --noEmit` | **0 error** |
| Lint ratchet | `lint-ratchet --base=HEAD` | **PASSED** — 2454 vs baseline 2475 (debt −21) |
| Review gate | `review:gate --base=HEAD` | **7/7 PASS** (R7 termasuk `memory:check` 2108 ms) |
| Suite penuh | `vitest run`, sandbox dilewati | **4 failed \| 177 passed (181)** · 404 s |

---

## 2. 🪤 Sandbox AKTIF membuat suite TIDAK PERNAH SELESAI

Ini bukan "beberapa tes merah" — dua percobaan pertama **gagal total**:

| Percobaan | Perlakuan | Hasil |
|---|---|---|
| 1 | sandbox aktif, cap 8 mnt | worker vitest **dibunuh** — `Worker exited unexpectedly` |
| 2 | cap 8 mnt | **`EXIT=124`**; `Test Files`/`Tests` tidak pernah tercetak |
| 3 | cap 20 mnt, **sandbox dilewati**, probe `SANDBOX_PROBE=readable` | **selesai, 404 s** |

Penyebab percobaan 1, dari stderr sandbox: penolakan baca `node_modules/jsdom/...`,
`node_modules/undici/...`, `package.json`, dan
`cli/vendor/shim/node-language-shim.cjs`.

**Aturan:** ukur dengan cap **≥ 20 menit** + sandbox dilewati, dan pastikan probe
keterbacaan `node_modules` benar-benar `readable` sebelum mempercayai angkanya. Angka dari
run yang dibunuh timeout **tidak boleh** dilaporkan sebagai baseline.

---

## 3. Diatribusi 7 merah — satu per satu

| # | Tes | Angka | Sebab |
|---|---|---|---|
| 1 | `indexer/src/discover.test.ts` · inventory matches git ls-files | — | counter beku |
| 2 | `indexer/src/discover.test.ts` · counts match the measured profile | **293 vs 287** | counter beku |
| 3 | `indexer/src/build.test.ts` · indexes the measured inventory | **535 vs 529** | counter beku |
| 4 | `indexer/src/build.test.ts` · symbol population Phase-4 envelope | **23923 > 23900** | counter beku |
| 5 | `indexer/src/build.test.ts` · reports occurrences/unresolved/timings | `[]` vs 3 entri | counter beku |
| 6 | `indexer/src/boundary.test.ts` · matches the depcruise oracle | `cruise.status === null` @24.9 s | **artefak harness** |
| 7 | `netlify/functions/_lib/fcm-server.test.ts` · .gitignore rule | `false` vs `true` | **artefak harness** |

**1–5 ⇒ team-lead saja** (counter beku di `indexer/src/{discover,build}.test.ts`).

### Dua yang terakhir dibuktikan artefak, bukan cacat

Dijalankan **di luar tes**, bukan disimpulkan dari pesan gagal:

- **Oracle depcruise** — `node node_modules/dependency-cruiser/bin/dependency-cruise.mjs
  netlify/functions --config .dependency-cruiser.cjs --output-type err` ⇒
  `✔ no dependency violations found (223 modules, 686 dependencies cruised)`, **exit 0**,
  19.3 s. Jadi `boundary.ts` **setuju** dengan oracle; yang mati adalah proses anak yang
  di-spawn dari worker vitest, bukan verdict-nya.
- **Aturan `.gitignore`** — `git check-ignore -v
  netlify/functions/secrets/firebase-service-account.json` ⇒
  `.gitignore:136:netlify/functions/secrets/*`, exit 0; berkas contoh & `README.md` exit 1.
  **Persis** tiga assertion tes itu. Yang gagal `execFileSync('git', …)` di dalam worker.

🔴 **Koreksi dua klaim lama:** (a) `libRefs` **tidak lagi merah** (di run ini hijau);
(b) dua merah "lingkungan" tetap merah **walau sandbox dilewati** ⇒ sebabnya spawn proses
anak dari worker, bukan sandbox.

---

## 4. Rekomendasi untuk team-lead (counter beku)

1. **Drift TUMBUH, bukan tetap.** Envelope Phase-4 tercatat **23909** di sesi sebelumnya,
   kini **23923** (+14). Karena angkanya dipin keras, pohon yang tumbuh **selalu** akan
   melewatinya — menaikkan angka lagi hanya menunda kegagalan berikutnya.
2. **Pertimbangkan menurunkan nilainya dari sumber**, bukan dari konstanta: `discover`
   sudah punya "inventory matches git ls-files" sebagai kriteria Phase 0 — menjadikan
   hitungan turunan (bukan literal) menghapus kelas kegagalan ini alih-alih menyetel ulang.
3. Sampai itu diputuskan, kelima tes ini **tetap merah dan tetap milik team-lead**; jangan
   direbaseline diam-diam dari sesi lain.

---

## 5. Catatan kebersihan

- `indexer/validate-report.json` (artefak **ter-track**) ditulis ulang oleh suite saat
  pengukuran (23+/23−). Direstore dengan `git checkout --` ⇒ pohon kembali bersih.
- Pohon setelah sesi ini: **bersih** (hanya dokumen ini yang untracked).
- `MEMORY.md` 4090 → **4068 B / 4096 B** (anggaran): pointer `asj-session-rules` ditandai
  **HILANG**, bullet baseline dikoreksi ke cap 8 mnt/`EXIT=124` vs 404 s.

## 6. Temuan terpisah: skill `asj-session-rules` HILANG

Dirujuk sebagai rumah aturan sesi R1–R25 di **6+ tempat** (`MEMORY.md`, log 09-26/09-28/
10-02, `AI_INFERENCE_BATCH6`, `docs/LANDING_PAGE_ROADMAP.md:186`), tapi **tidak ada di
disk** — baik di `E:/astro/.workbuddy-ai/skills/` (folder tidak ada) maupun di
`~/.workbuddy-ai/skills/` (18 skill, tidak satu pun memuat `R19`/`R13f`).

Fragmen yang selamat: R1, R1a, R2, R3, R6, R7, R8, R11, R12, R13, R13e, R13f, R13f-bis,
R13l, R14, R15, R19, R21, R22, R25.
**R4, R5, R9, R10, R16, R17, R18, R20, R23, R24 tidak muncul di mana pun** ⇒ teks penuh
tidak dapat direkonstruksi dari artefak yang ada.
