# 🔄 Referensi Parity: Legacy Stable (live) ↔ Astro v2 Rebuild

> **Dibuat:** 2026-09-04 · **Sumber legacy:** `F:\Asjpow4v7-main\khoci921` (app monolitik
> HTML/JS yang MASIH LIVE dipakai user & siswa — netlify functions di folder tsb) +
> deep-dive docs `khoci921/docs/*-DEEP.md`, `HTML_PAGES.md`, `AI_DATA_FLOWS.md`,
> `AI_CV_FULL_FLOW.md`.
> **Sumber Astro v2:** repo ini (surfaces/contexts/kernel, `src/pages`, `src/components`).
>
> **Legenda status:** ✅ ported & ter-wire · 🟡 komponen ada, wiring/endpoint belum live ·
> 🔲 belum ada · ❓ perlu verifikasi manual (tidak diverifikasi kode di sesi ini).
>
> **Tujuan:** daftar kerja menuju **100% produksi** — parity fitur + alur data legacy yang
> masih dipakai user, supaya Astro v2 bisa menggantikan legacy sepenuhnya.

---

## 1. Peta Halaman

| Legacy (live) | Astro v2 | Komponen form | Status | Catatan |
|---|---|---|---|---|
| `index.html` (loker publik + login + pamflet) | `src/pages/index.astro` | `LokerTable`, `LokerDetailModal`, `PamfletModal`, `LoginModal` | 🟡 | Pamflet/pengumuman: ❓ cek `simpanPengumuman` (sys_config) tampil di landing |
| `apply-full.html` (form lamaran + upload cloudinary + prefill bridge) | `src/pages/apply.astro` | `ApplyFullForm` | 🟡 | Backend `submitApply` ✅ (C6-validated). Upload/prefill: ❓ QA manual vs legacy deep-doc |
| `master-full.html` (master data + AI auto-translate JP) | `src/pages/master.astro` | `MasterFullForm` | 🟡 | `submitMasterForm` ✅. Alur gate login + auto-translate: ❓ QA manual |
| `ai_form.html` (AI CV chat, wawancara, submit ASJ, TTD) | `src/pages/ai-cv.astro` | `AiCvForm`, `ESignatureModal` | 🟡 | Backend actions AI semua ✅ (lihat §4). fieldPaths 70+ mapping: ❓ parity mapping di form baru |
| `siswa-baru.html` (daftar siswa + AI chat) | `src/pages/siswa-baru.astro` | `SiswaBaruForm`, `CekSiswaModal` | 🟡 | `submitDaftarSiswa` ✅; roster admin-only ✅. Chat flow siswa: ❓ |
| `share.html` (**viewer TSK publik — dipakai klien/user**) | `src/pages/share.astro` | `ShareView` | ✅ 2026-09-05 | `share-data.js` → `contexts/catalog` `handleShareData`. **Publik per kode job, tanpa token** (parity legacy — lihat §5 P1) |
| `admin.html` + tab admin (SPA-like) | `src/pages/admin.astro` | `AdminPanel` + 8 Tab | 🟡 | Lihat §2 |

## 2. Admin — Tabs & Modal Parity

### 2.1 Tabs (legacy `adminSwitchTab`, 7–8 tab)

| Legacy tab | Astro | Status | Catatan |
|---|---|---|---|
| Loker / DB Job | `TabDbJob.tsx` | ✅ | `AdminJobEditModal` untuk tambah/edit |
| Kandidat / Pelamar | `TabPelamar.tsx` + `ListKandidatModal` | ✅ | Daftar/filter/CSV ada |
| Mail (inbox lamaran: review/approve/reject) | `TabMail.tsx` | ✅ | Wiring **sudah ada** (koreksi 2026-09-13 — lihat #22 di `BACKEND_TODO.md`): `TabMail` memanggil `approveForm`/`reviewForm`/`rejectForm`/`deleteForm`/`tandaiDibacaForm` (backend ✅ admin-guarded). Sisa yang benar-benar kurang hanya pola sesi mentah (`fetch` langsung, bukan `api.secure`) — #19 |
| Jadwal (+ tugas admin) | `TabJadwal.tsx` | ✅ | Wiring `simpanJadwalBaru`/`hapusJadwal`/tugas **sudah ada** (koreksi 2026-09-13 — lihat #22 di `BACKEND_TODO.md`). Reminder `checkAndSendAgendaReminders` kini punya **pemicu cron** (`agenda-reminders.ts`, 10 menit) — sebelumnya admin-guarded tapi tidak pernah dipanggil apa pun |
| WA (template + blast) | `TabWA.tsx` | 🟡 | Template ✅ admin-guarded; batch blast progress: ❓ |
| Kelola | `TabKelola.tsx` | ✅ | Manajemen kandidat/super |
| Tambah | `TabTambah.tsx` | ✅ | Tambah kandidat manual |
| Config (sys_config + rincian presets) | `TabConfig.tsx` | 🟡 **GAP** | UI ada; `getRincianPresets` kini admin-guarded ✅ tapi tidak ada caller client; `updateSysConfig`/preset perlu wiring |

### 2.2 Modal & Aksi Admin (legacy `data-action`/`admin_modal`/`admin_ops`)

| Legacy (trigger/modul) | Astro | Status |
|---|---|---|
| `bukaModalKandidat` (profil kandidat) | `CandidateProfileModal.tsx` | ✅ (ada test) |
| `bukaModalTambahKandidat` | `EditCandidateModal.tsx` (+ `ListKandidatModal`) | ✅ rebuilt 2026-09-03 (BB, catatan, VIP, upload) |
| `bukaModalUndanganKelas` (WA group invite) | `UndanganKelasModal.tsx` | ✅ |
| `bukaModalTtd` (ESignature) | `ESignatureModal.tsx` | ✅ |
| `bukaModalGantiPass` | `ChangePasswordModal.tsx` | ✅ |
| `bukaModalCvMini` / `bukaPreviewCV` / cv-rirekisho (`10_cv_rirekisho`, `10b_cv_builders`) | `CvMiniModal.tsx`, `RirekishoBuilder.tsx`, `DocumentPreviewModal.tsx` | ✅ (template tunggal; multi-template = Prioritas 3 referensi) |
| `bukaModalCekDataSiswa` | `CekSiswaModal.tsx` | ✅ |
| `bukaAdminAiCopilot` | `AdminAiCopilot.tsx` | ✅ |
| `openRincianBuilder` (`13_rincian_builder`) | `InputManualModal.tsx` | ✅ ❓ |
| `showMonthlyReport` | `LaporanBulananModal.tsx` | ✅ (admin-guarded) |
| Pemberkasan checklist | `PemberkasanModal.tsx` | ✅ |
| Share settings per job | `AdminShareModal.tsx` | ✅ (set `dokumen_share`) |
| Matchmaking AI headhunter | `MatchmakingModal.tsx` | ✅ |
| `exportKandidatCsv` | `TabPelamar` CSV | ✅ CSV; **Export Excel = TODO gap** |
| `bukaSimulatorInterview` (AI Wawancara admin) | ❓ | Komponen admin wawancara perlu cek (ada referensi di `EditCandidateModal`/`AdminAiCopilot`); TODO.md: "AI Interview simulator (legacy punya, Astro belum)" |
| `bukaMasterLengkapPortal` / `bukaMasterEksternal` / `bukaFormSiswa` | route ke master.astro / apply / siswa-baru | ✅ via link |
| Reject mail composer (legacy) | 🔲 | TODO.md MEDIUM — lihat #12 di `BACKEND_TODO.md` |
| ~~Migration Drive modal (legacy)~~ **→ BUKAN gap; sengaja TIDAK dibangun** | ❌ sengaja | **Legacy `js/admin_ops/migration.ts` adalah *database* migration runner, bukan "Drive".** Ia memanggil `callAPI('runMigration', {})` dari POST body. Di repo baru action itu **dihapus dengan sengaja** (`surfaces/config.ts:10` — *"schema changes must never be reachable from a POST body"*, `SCALABILITY…§11`, `PHASE_A…:24,121`). Penggantinya: **`scripts/migrate.mjs`** — ledger berversi + checksum, dijalankan dari CLI. Menambahkan kembali modal ini = mengembalikan lubang keamanan. Sisa 2 key i18n (`admin.db_migration_auto`, `admin.run_migration`) hanya sisa teks tanpa UI |

## 3. Kandidat / Publik — Modal & Fitur

| Fitur | Astro | Status |
|---|---|---|
| Login kandidat (WA) + ganti password | `LoginModal`, `ChangePasswordModal` | ✅ |
| WA Pintar (auto-reply/assistant link) | `WAPintarModal.tsx` | ✅ (mirror `08_wa_pintar.ts`) |
| Dokumen preview | `DocumentPreviewModal.tsx` | ✅ |
| Upload dokumen dashboard kandidat | `handleGetUploadUrls` + `simpanBerkasTahapan`/`simpanRevisiKandidat` | ✅ (C6 + WA-scope hardening) |
| Share view (grid + preview + pilih + kirim WA) | `ShareView.tsx` | ✅ (`?job=CODE` publik, tanpa token — parity legacy) |
| Loker detail + pamflet | `LokerDetailModal`, `PamfletModal` | ✅ |
| PWA | `manifest` + sw | ❓ audit offline mode (TODO LOW) |

## 4. Pipeline / Alur Data — Parity Backend

Backend Astro v2 = **rebuild 1:1 dari action legacy** (surfaces → contexts → kernel), jadi
parity ALUR DATA di sisi backend ✅ untuk action berikut (diverifikasi dari
`surfaces/index.ts`, semua masuk `AI_ACTIONS`/surface masing-masing):

| Alur (legacy docs) | Action | Astro backend |
|---|---|---|
| AI CV Master (chat → simpan → sync) | `processAIChat` (flow=master), `submitDataAsj`, `simpanDataTtdNaitei` | ✅ |
| AI Admin Chat | `processAdminAIChat` | ✅ |
| AI Siswa Baru | `processSiswaAIChat`, `submitDaftarSiswa` | ✅ |
| AI Wawancara | `processAiInterview`, `selesaikanWawancara`, `simpanHasilWawancara`, `generateWawancaraModel` | ✅ |
| Parse dokumen (Gemini) | `parseDokumenBiodata`, `processUploadDoc` | ✅ (C6 + auth hardening) |
| Apply → master → mail | `submitApply`, `submitMasterForm`, `syncBiodataKeMail`, mail actions | ✅ |
| Upload/berkas (storage) | `getUploadUrls`, `simpanBerkasTahapan`, `simpanRevisiKandidat`, `downloadJobDocs` | ✅ (C6 allow-list) |
| Jadwal/tugas + reminder | `simpanJadwalBaru`, tugas, `checkAndSendAgendaReminders` | ✅ backend (admin) — UI belum (GAP §5) |
| Konfigurasi/preset | `updateSysConfig`, rincian presets | ✅ backend (admin) — UI belum |
| Share TSK viewer | `shareData` | ✅ (`share-data.js` → `handleShareData`; publik per kode job) |

Catatan keamanan alur: seluruh gap auth C3–C6 sudah ditutup di backend Astro (pass
2026-09-04); klaim "live & dipakai user" legacy berarti **migrasi hanya selesai saat UI
Astro menutup delta di §5**, lalu cut-over domain + matikan legacy.

## 5. Delta Menuju 100% Produksi (dari parity di atas + TODO.md + referensi)

### P1 — Blocker parity (fitur live legacy yang belum live di Astro)
1. ~~**Share viewer TSK** (`share.html` → `share.astro`)~~ ✅ **SELESAI 2026-09-05; gate token DIBATALKAN 2026-09-13.**
   `share-data.js` → `contexts/catalog` `handleShareData`, `ShareView.tsx` ter-wire.
   **Koreksi penting:** item ini semula menuntut "gate **per-job share token** (generate/rotate via
   `updateDokumenShare`; verifikasi server-side; link tanpa token ditolak)". Itu **bukan** parity legacy —
   legacy tidak punya token sama sekali (`khoci921/netlify/functions/share-data.js` hanya membaca `?job=`;
   `js/pages/share.ts` fetch `/api/share-data?job=<CODE>`). Gagasan hardening itu terbundel ke dalam baris
   "parity" ini, lalu dari sini menyebar ke kode. Gate-nya pun tidak pernah hidup: `sys_config` tidak
   punya kolom `config_key`, jadi mint selalu gagal dan viewer membalas "Link share belum diaktifkan"
   untuk setiap request. Keputusan owner 2026-09-13: **kembalikan ke legacy — publik per kode job, tanpa token.**
2. **TabMail**: wire data load + `reviewForm`/`approveForm`/`rejectForm`/`deleteForm`/
   `tandaiDibacaForm`; root-cause "data tidak muncul".
3. **TabJadwal + TabConfig**: wire `simpanJadwalBaru`/tugas UI + tombol "kirim reminder"
   (panggil `checkAndSendAgendaReminders` dgn sesi admin) + `updateSysConfig`/preset UI
   (panggil `getRincianPresets` dgn sesi admin — guard sudah ada).

### P2 — Fitur HIGH (TODO.md)
4. Notifikasi email ke kandidat (apply/status/reject) — belum ada provider/flow.
5. WA notif admin saat lamaran baru — sudah via FCM `notifyAdmins` ✅ di apply; ❓ verifikasi.
6. Reminder jadwal terjadwal (cron): Netlify `sweep-queue` untuk job-queue saja; reminder
   agenda butuh jalur cron atau tombol admin (endpoint sudah admin-guarded).
7. Export Excel (bukan CSV) utk laporan.
8. Reject mail composer; Migration Drive modal (fitur legacy).
9. AI Interview simulator admin (cek apakah sudah ada di EditCandidate/AdminAiCopilot).
10. QA parity per halaman apply/master/ai-cv/siswa-baru thd deep-doc legacy (fieldPaths,
    auto-fill, gate login, i18n) — checklist §6.

### P3 — Polish/ops (TODO LOW/MED)
11. Real-time updates (Supabase realtime), push kandidat, upload dokumen dari dashboard
    kandidat (sebagian ✅), batch WA blast progress, audit PWA offline, aksesibilitas.

## 6. Cara Pakai Referensi Ini (checklist migrasi per halaman)

Saat port/QA satu halaman:
1. Buka deep-doc legacy (`khoci921/docs/<page>-DEEP.md`) → §Dependensi (actions/DB/external),
   §Alur Data, §State (fieldPaths, localStorage), §Backend.
2. Cocokkan action di `src/lib/apiEndpoint.ts` + surface ts + handler (guard).
3. Jalankan QA alur (load → login gate → isi → submit → cek row di tabel DB yg sama).
4. Tandai ✅ di matriks §1–§3 + commit per halaman/fitur; update HANDOVER.

---

*Referensi pendukung: `TODO.md`, `docs/archive/HANDOVER.md`,
`docs/ASTRO_PIPELINE_REFERENCE.md`, `docs/archive/SECURITY_AUDIT_2026-09-03.md`,
deep-doc legacy di `F:\Asjpow4v7-main\khoci921\docs\`.*
