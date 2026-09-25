# 🚀 Referensi Migrasi Pipeline ASJ (Legacy -> Astro v2)

> **Status sync 2026-09-04:** salinan kanonik dari referensi "brain" eksternal
> (`~/.gemini/antigravity-ide/brain/<session>/ASTRO_PIPELINE_REFERENCE.md`), disimpan ke repo
> agar sesi AI berikutnya selalu punya satu sumber. Bagian Prioritas 1 (C3–C6) diselaraskan
> dengan keadaan aktual kode: **C3–C6 sudah ditutup** oleh pass backend 2026-09-04 (C4/C5
> auth hardening, C6 URL allow-list, C3 sweep semua handle*). Item residual: gate wiring
> share view (`share.astro`) dgn per-job token saat diimplementasi. Status keamanan
> terkini: `docs/archive/SECURITY_AUDIT_2026-09-03.md` + `TODO.md`.

Dokumen ini adalah panduan teknis yang dipetakan dari pipeline data lama (Legacy ASJ) ke arsitektur **Domain-Driven Design (DDD)** di codebase baru (Astro + Netlify). Referensi ini dirancang khusus untuk memandu AI Developer dalam mengeksekusi sisa 20% fitur dan *hardening* sebelum produksi.

---

## 🏗️ 1. Perubahan Arsitektur Utama (Legacy vs Astro)

### Legacy (Codebase Lama)
- **Frontend**: Vanilla JS / jQuery (ESM) terpencar di `js/pages/*.js`.
- **API Routing**: Semua masuk ke satu file raksasa `handlers.ts` dengan `switch-case` statis dari `action-registry.ts`. Sangat berat dan lambat saat *cold start*.
- **State**: Mutasi langsung ke DOM atau variabel global.

### Astro v2 (Codebase Baru)
- **Frontend**: Menggunakan **Astro** untuk routing halaman (`src/pages/*.astro`), **Preact Islands** untuk modal/tab reaktif (`src/components/admin/*.tsx`), dan **Nanostores** untuk *state management* lintas pulau (`src/store/*.ts`).
- **API Routing**: Menggunakan pola **Surfaces & Contexts**.
  - Klien memanggil API melalui fungsi klien yang tersentralisasi.
  - Masuk ke `netlify/functions/surfaces/index.ts`. File ini secara otomatis akan melakukan **Lazy Loading** ke modul surface spesifik (contoh: `auth.ts`, `jobs.ts`) untuk mengurangi beban *cold start*.
  - Surface kemudian memanggil logika bisnis di folder `netlify/functions/contexts/`.

---

## 🗺️ 2. Peta Lokasi Pipeline Baru (Di Mana Saya Harus Coding?)

Jika Anda (AI Developer) ingin menambahkan atau memperbaiki fitur, ikuti peta rute ini:

### A. Alur Frontend (UI & State)
1. **Halaman Utama**: `src/pages/*.astro` (Contoh: `src/pages/admin.astro`).
2. **Komponen Interaktif**: `src/components/` (Contoh: `src/components/admin/TabMail.tsx`, `EditCandidateModal.tsx`).
3. **State Management**: `src/store/` (Contoh: `adminStore.ts` untuk menyimpan data pelamar yang sedang login).
4. **API Client**: Pemanggilan ke backend tidak lagi manual `fetch`, gunakan `apiClient.ts` di folder `src/lib/`.

### B. Alur Backend (API & DB)
1. **Surfaces (Entry Point)**: `netlify/functions/surfaces/*.ts`. Di sinilah *payload validation* dan deklarasi *action* terjadi (Contoh: `processAIChat` ada di `surfaces/ai.ts`).
2. **Contexts (Logika Bisnis)**: `netlify/functions/contexts/<domain>/service.ts`. Di sinilah data diolah.
   - Contoh Domain: `registration`, `master-data`, `jobs`, `ingestion`.
3. **Kernel (Core Engine)**: `netlify/functions/_lib/kernel/`. Jangan ubah ini kecuali diperlukan! Berisi koneksi DB (Supabase), Logging terstruktur, Metrics, dan Rate Limiter (Postgres-backed).

---

## 🎯 3. Panduan Eksekusi 20% Pekerjaan Tersisa

Berikut adalah *roadmap* teknis untuk 20% fitur krusial yang masih menggantung berdasarkan `TODO.md` dan `docs/archive/HANDOVER.md`:

### 🔴 Prioritas 1: Security Hardening (IDOR C3-C6)
- **Konteks**: celah di mana *endpoint* publik bisa menarik data PII (Identitas Pribadi) kandidat.
- **Status per 2026-09-04 (sudah diselaraskan dengan kode):**
  - **C4/C5 — SELESAI** (pass auth hardening 2026-09-04): roster pendaftar
    (`getDaftarSiswaBaru`) kini admin-only; bridge legacy/AI admin-only (`generateFormBridge`
    untuk prefill apply publik tetap publik); draft CV (`getDrafCvMaster`) wajib sesi +
    owner-or-admin SEBELUM baca DB (cabang anonim "limited identity" dihapus); ingestion
    (`processUploadDoc`) menolak dokumen lintas WA (payload `wa` pre-download DAN `no_wa`
    hasil ekstraksi AI pre-upsert); revisi upload (`handleSimpanRevisiKandidat`) di-scope ke
    WA sesi. Regresi: `netlify/functions/contexts/service-auth.test.ts`.
  - **C6 — SELESAI** (pass URL allow-list 2026-09-04): setiap URL dokumen yang diterima dari
    klien divalidasi satu gate `_lib/storage.isAllowedDocumentUrl` (https-only + host
    allow-list: Supabase storage + Cloudinary + GCS, diperluas env `ALLOWED_DOCUMENT_HOSTS`) —
    di apply publik, simpan kandidat admin, berkas-tahapan, revisi, ingestion (anti-SSRF),
    dan ZIP download (`documents/download.ts`).
  - **C3 — SELESAI** (sweep 2026-09-04): audit SEMUA ekspor `handle*` di
    `netlify/functions/contexts/*/service.ts` — dua action live tanpa guard ditutup
    admin-only: `getRincianPresets` (config admin) dan `checkAndSendAgendaReminders` (baca
    daftar WA jadwal + kirim FCM; cron Netlify = `sweep-queue`, bukan surface ini). Regresi:
    `netlify/functions/contexts/service-c3.test.ts`.
- **Hasil audit (tidak ada gap PII live tersisa):** `handleShareData` (roster kandidat per
  job utk viewer TSK) publik by-design DAN **belum ter-wire** di pipeline modern —
  `surfaces/docs.ts` tidak memetakan action `shareData` & endpoint GET `share-data`
  NOT_IMPLEMENTED → tak ter-reach; wajib di-gate dgn per-job share token saat `share.astro`
  diimplementasi. Write publik by design tetap publik (submitDaftarSiswa, submitApply,
  generateFormBridge, getLinkSiswaBaru, reportWebVital). 40+ handler lain sudah
  ber-guard (requireRole/verifyToken/isOwnerOrAdmin).

### 🟡 Prioritas 2: Melengkapi Tab Admin (Mail, Jadwal, Config)
- **Tab Mail**:
  - **Masalah**: UI `TabMail.tsx` sudah ada, tapi datanya tidak muncul karena sesi lokal salah atau endpoint belum ter-wire dengan benar.
  - **Aksi**: Cek `src/components/admin/TabMail.tsx`. Pastikan ia memanggil *action* yang ada di `surfaces/mail.ts` (misal: `reviewForm`, `approveForm`).
- **Tab Jadwal**:
  - **Aksi**: Wire UI di `TabJadwal.tsx` ke endpoint `simpanJadwalBaru` di `surfaces/schedule.ts`.
- **Tab Config**:
  - **Aksi**: Buat UI di `TabConfig.tsx` dan hubungkan dengan `updateSysConfig` di `surfaces/config.ts`.

### 🟢 Prioritas 3: Template CV Baru (Implementasi — Factory Pattern)
- **Konteks**: Di codebase lama hanya ada 1 template CV (Rirekisho A4).
- **Solusi**: Sistem pabrik generator CV (factory pattern) yang mendukung banyak template sekaligus.
- **File utama**: `src/lib/cv-template-factory/` — factory, types, data normalization, renderers, loaders
- **Template tersedia** (di `templates.ts`): `rirekisho-a4` (preserved as-is), `excel-basic`, `docx-basic`, `pdf-basic`
- **Loader**: `loadExcelTemplate()`, `loadDocxTemplate()`, `loadPdfTemplate()` — baca file template dengan `{{placeholder}}` dan isi data kandidat
- **UI**: `CvTemplateSelector.tsx` — tombol `Pilih Template CV` di **TabPelamar (admin) SAJA**.
  Sisi kandidat dihapus 2026-09-25 (keputusan owner: *"template cv itu fitur admin bukan buat
  kandidat"*). Kandidat tetap punya `RirekishoBuilder` lewat tombol `Preview Desain CV`.
  Dijaga `CandidateDash.test.tsx` — tes itu memastikan dasbor kandidat tidak menawarkan
  pemilih template, dengan kontrol positif bahwa grid aksinya memang ter-render.
- **Data flow**: getDrafCvMaster → normalizeMasterData → cvFactory.render → download blob

---

## 💡 Pesan untuk AI Assistant (Cursor/Copilot) yang Menangani Ini
Arsitektur aplikasi ini sudah **80% lengkap** dengan *Best Practice* tingkat tinggi (menggunakan *Lazy Loading*, *Circuit Breaker*, dan *RLS Supabase*).
Tugas utama Anda bukan lagi melakukan *refactoring* sistem dasar, melainkan **menghubungkan (wiring) UI Preact Islands yang sudah ada ke backend Surfaces**, dan **menutup celah logika keamanan (IDOR)**.

Selalu gunakan TypeScript secara ketat, pertahankan konsep **Domain-Driven Design (DDD)** yang sudah tertata di backend, dan perhatikan file `.env.local` saat *testing*. Jangan lupa *commit* pekerjaan yang tersisa sesuai dengan catatan di `docs/archive/HANDOVER.md`.

**Selamat bekerja! 🚀**
