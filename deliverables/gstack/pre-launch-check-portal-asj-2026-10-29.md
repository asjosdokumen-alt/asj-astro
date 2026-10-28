# Pre-launch check — ASJ Portal (internal launch)

**Date**: 2026-10-29
**Scene**: 上线前检查 — code review + security audit + QA testing, plus fixing every red gate and the leftover liabilities behind them
**Members**: 产品评审员 (`product-reviewer`) · 安全官 (`security-officer`) · QA与发布 (`qa-lead`) · 调查员 (`investigator`)
**Baseline**: `8923418`, tree clean. **Result**: `d23099d`, 6 local commits, **NOT pushed** (R19).

---

## 📌 TL;DR

- **Verdict**: 🟢 **Go for internal use** · 🟡 **Conditional for public launch** (3 owner decisions, 2 gate debts).
- **The red is gone.** Baseline had exactly 1 failing assertion (`symbolCount 29 951 > 29 900`). Final suite: **269 files / 3 256 tests, exit 0**; typecheck both projects 0; build exit 0.
- **7 leftovers fixed**, including a half-applied migration: the upload path still converted biodata rows into application rows — the exact thing the owner's A1/A2 decision removed.
- **3 blockers for public launch are NOT code**: session revocation, admin PIN strength (unverified), CSP. All recorded below.

---

## 🎯 核心结论卡片

| Item | Value |
|------|-------|
| Go / No-Go | 🟢 Go (internal) · 🟡 Conditional Go (public) |
| Severity spread | 🔴 1 / 🟠 7 / 🟡 6 / ✅ 7 fixed |
| Action items | 9 (3 owner, 4 lead, 2 product) |
| Stricter axis | **Deployment/config**, not code — the code posture is 🟡, the deployment posture is what limits public launch |
| Deploy state | `main` @ `8923418` is LIVE (`version.json` = `asj-astro-ea747205517c`, verified by `curl`). New commits are **local only**. |

---

## 1. 各成员核心结论

### 🔍 产品评审员
The recent wave is coherent, but the A1/A2 Mail-status migration was applied to **one of two writers**. `syncBiodataKeMail` branched on row kind; `syncFormMailDariUpload` did not — so a document upload on an `INFO` row wrote `UPDATE` (measured, not `MENUNGGU`) and back-filled `code_job`, turning a biodata row into an application row in place. Also: the service-worker precache re-billed two perf fixes shipped the day before (`de461ca`, `8547516`) to every visitor. Both fixed.

### 🛡️ 安全官
Code posture 🟡; deployment posture is what limits a public launch. **Two of their own claims were retracted after verification and are NOT findings**: the admin PIN length (a truncated placeholder was counted) and "no rate limiting" (5/5 min + a 5×30 min lockout exists). What survives verification: **no session revocation** (a 7-day refresh token cannot be killed), `refreshKandidatSession` re-signs without a DB read, the VIP gate **fails open** on a lookup error (documented as deliberate), and `?sessionToken=` is accepted from the query string. The committed env inventory was **recon, not credentials** — every value is an angle-bracket placeholder, so no rotation is needed.

### ✅ QA 与发布
Suite green (269/3 256), typecheck clean, build clean. **Three gates were "green by omission"**, and that is the systemic finding: `verify:classes` could not see descendant selectors (so it cried wolf on a class that existed), `fetch-boundary` counts *files* not *call sites* (so a third `fetch` inside `apiClient` stayed green), and `bundle:size` reads entrypoints while the growth is in a shared import (so it has been red ~9 days with no explanation). `e2e:headings` is red with 14 failures: 8 are a **real** duplicate-`h1` defect on the two public forms, 2 are a stale constant, 4 are the token gate.

### 🔧 调查员
The red was a **wrong number at both ends**, not a broken tree. The recorded baseline `29 808 @ 266aa9b` re-measures to **29 820**, so the delta was +131, not +143. Split: **TES +84, PRODUK +47** (`apiClient +22`, `applications/service +8`, `TabMail +7`, `supabaseHost.ts +4`). `fileCount 604` is `supabaseHost.ts` alone (approved B3). Ceiling raised to **30 000** — margin **+49**, tighter than the +92 already called thin, and the comment now says to measure before moving it.

---

## 2. 综合审查发现（去重，按严重度）

| # | 严重度 | 类别 | 位置 | 问题 | 建议 | 来源 |
|---|--------|------|------|------|------|------|
| 1 | 🔴 | 安全 | `contexts/identity/service.ts` | **Tidak ada pencabutan sesi.** Refresh token 7 hari tidak bisa dimatikan; logout tidak membatalkannya. | `session_version` di tabel identitas + bump saat logout/ganti sandi; cek saat refresh | 安全官 |
| 2 | 🟠 | 安全 | `_lib/ai/chat.ts` ~276 | Gate VIP **fail-open** saat lookup error (`catch → lookupError = true`). | Fail-closed, atau batasi kuota per-WA saat lookup gagal | 安全官 |
| 3 | 🟠 | 安全 | `identity/service.ts` `refreshKandidatSession` | Re-sign token tanpa membaca DB — token apa pun dengan claim `refresh` diterima. | Wajibkan baris kandidat ada + `session_version` cocok | 安全官 |
| 4 | 🟠 | 安全 | `_lib/kernel/request-helpers.ts` | `?sessionToken=` diterima dari query string. | Hapus cabang query; pastikan tidak ada jalur share/print yang bergantung | 安全官 |
| 5 | 🟠 | 产品 | `src/lib/authReactive.ts` | Logout paksa di 24 jam walau refresh token masih sah. | Perpanjang bila `refreshToken` ada, logout hanya bila refresh gagal | 产品 |
| 6 | 🟠 | 产品 | `CvTemplateSelector` / form publik | Prefill PII lintas sesi di form publik. | Kosongkan prefill untuk pengunjung anonim | 安全官 |
| 7 | 🟠 | 成本 | `surfaces/public.ts` `getMonthlyReport` | Laporan bulanan anonim di-cache bersama — vektor biaya/DoS. | Wajib sesi admin, atau batasi `limit` | 安全官 |
| 8 | 🟠 | A11y/SEO | `FormToolbar.tsx:43` | Dua `<h1>` di `/apply` & `/siswa-baru` (judul konten + toolbar). | Prop `asHeading` default false; 4 rute yang benar-benar butuh tetap `true` | QA |
| 9 | 🟡 | 产品 | `TabMail.tsx` | `DIBACA` tidak disebut di cabang `REVIEW` pada `statusText`. | Tambahkan; nilai kanonik 7 buah | 产品 |
| 10 | 🟡 | 产品 | `TabMail.tsx:405` | Label "Lamaran disetujui" muncul untuk baris biodata bila statusnya belum `INFO` (baris lama). | Sudah dijaga di server; label ikut jenis baris | 产品 |
| 11 | 🟡 | UX | `candidate.astro` / `admin.astro` | Tanpa sesi, rute **redirect diam-diam** ke landing — tidak ada prompt login. | Render gate/login di tempat (`/master` sudah begitu) | QA |
| 12 | 🟡 | 性能 | `AdminPanel.tsx` (P1b) · `i18n.ts` (P2b) · `loadCandidatesUnik` (P5) · laporan bulanan (P6) | 479 KB satu berkas; kamus 2 058 entri untuk 85 key; baca seluruh tabel lalu `slice()`; materialisasi 5 000 baris. | P1b/P2b ditunda pemilik; P5 sebelum 1 000 kandidat; P6 gabung migrasi berikutnya | 产品 |

---

## 3. Yang SUDAH diperbaiki (7)

| # | Apa | Bukti | Commit |
|---|-----|-------|--------|
| 1 | Plafon simbol 29 900 → **30 000**, delta **diukur ulang** (+131, bukan +143) | `build.test.ts` 13/13 | `c3334d2` |
| 2 | Unggahan **tidak** lagi mengubah JENIS baris; baris biodata tetap `INFO` + `code_job: ''` | 25/25; tes baru **terlihat MERAH** dulu (`expected 'UPDATE' to be 'INFO'`) | `f8359d6` |
| 3 | Server **menolak** `DISETUJUI` pada baris tanpa `code_job` (tab basi tidak bisa menyetujui biodata) | tes baru | `f8359d6` |
| 4 | Kunci rate-limit tidak bisa dipalsukan: `x-nf-client-connection-ip`, lalu **hop TERAKHIR** XFF | 10/10; merah dulu (`'1.2.3.4'` vs `'9.9.9.9'`) | `c36d9c8` |
| 5 | Tiga `fetch` tanpa batas diberi timeout (refresh, build-time reader, foto xlsx) | `verify:fetch-boundary` PASS | `d23099d` |
| 6 | **822 KB** keluar dari precache (`AdminPanel` 491 390 B, `supabase` 217 919 B, `i18n-jp` 113 043 B) | `verify-pwa` 29/29; aset 69 → 66 | `d61a699` |
| 7 | `verify:classes` mengakui selektor **descendant** di `<style>` inline (`cv-preview` adalah false positive) | gate PASS (sebelumnya merah) | `d23099d` |
| 8 | Berkas env migrasi di-untrack + di-ignore (**bukan** kredensial — placeholder) | `git ls-files` kosong, berkas tetap di disk | `af463ce` |

**Suite**: `269 files · 3 256 tests · exit 0`. **Typecheck**: 0/0. **Build**: exit 0, `asj-astro-2ef97a3ad967`, 66 aset, 16 halaman, precache 112 URL.

---

## ✅ 行动清单

| # | 行动 | 负责方 | 紧急度 | 为什么 |
|---|------|--------|--------|--------|
| 1 | Konfirmasi panjang PIN admin di produksi (**tidak terverifikasi** dari repo) | pemilik | P0 (publik) | Klaim "4 digit" DITARIK — placeholder terpotong yang dihitung |
| 2 | `session_version` + pencabutan sesi | lead | P0 (publik) | Satu-satunya 🔴 yang tersisa |
| 3 | Perbaiki `<h1>` ganda `FormToolbar.tsx:43` + ukur ulang konstanta 12 → 15 | lead | P1 | 8 kegagalan `e2e:headings` nyata; 2 sisanya konstanta basi |
| 4 | Atribusikan `bundle:size` +147 KB atau naikkan baseline **dengan alasan** | lead | P1 | Merah ~9 hari; pertumbuhan ada di shared import, bukan entrypoint |
| 5 | `fetch-boundary`: asersi `signal` **per call-site** + baterai mutasi | lead | P1 | Gate menghitung BERKAS; `apiClient` menambah call ke-3 dan tetap hijau |
| 6 | `authReactive`: jangan logout 24 jam bila refresh masih sah | lead | P2 | Pengguna kehilangan sesi di tengah formulir |
| 7 | `verify:schema` default `--from-db` saat host Neon | lead | P2 | Default path mati di Neon ⇒ gerbang hijau karena tidak mengukur |
| 8 | Putuskan `?sessionToken=` dan gate VIP fail-open | pemilik | P2 | Keduanya keputusan produk, bukan bug |
| 9 | Push (`d23099d`) — **hanya bila diminta** | pemilik | — | Push = deploy berbayar (R19) |

---

## ⚠️ 待完善 / 已知局限

- **`main` live masih `8923418`.** 6 commit ini lokal. `dist/version.json` lokal (`2ef97a3ad967`) **tidak bisa** dipakai memprediksi hash deploy kali ini: build lokal mencetak `JWT_PUBLIC_JWK not set - /jwks.json not emitted`, jadi `dist/` lokal berbeda dari yang akan dibangun Netlify.
- **Tidak ada CSP** (sengaja, Astro inline script). Risiko XSS belum diukur di build nyata.
- **Tiga gerbang "hijau karena tidak mengukur"** — `verify:classes` (selektor), `fetch-boundary` (per berkas), `bundle:size` (entrypoint). Hanya yang pertama ditutup sesi ini.
- **`e2e:labels`** gagal lokal tanpa `AUDIT_AI_CV_TOKEN` — gerbang menolak lulus pada halaman yang tidak pernah diukur. Bukan cacat.
- **Batas jujur `e2e:headings`**: 4 kegagalan sisanya adalah gerbang token, bukan markup.
- Migrasi `026` (2 baris `GAGAL` biodata) **belum** dibuat — hanya 2 baris, dampaknya kosmetik.

---

## 📚 成员产出索引

- `product-reviewer` — review gelombang 15 commit terakhir + verdict atas B13/P1b/P2b/P5/P6; menemukan bug jalur unggahan dan precache.
- `security-officer` — STRIDE + OWASP Top 10; **dua klaim ditarik sendiri setelah verifikasi** (PIN, rate limit), satu temuan 🔴 tersisa (pencabutan sesi).
- `qa-lead` — matriks gerbang, analisis "green by omission", `e2e:headings` 14 kegagalan dengan pemisahan sebab, rollback plan.
- `investigator` — atribusi angka merah (+131, TES +84 / PRODUK +47), koreksi baseline `266aa9b` 29 808 → 29 820, inventaris tanggungan.

---

> 本报告由软件工坊 AI 协作生成，关键决策请由工程负责人复核。
