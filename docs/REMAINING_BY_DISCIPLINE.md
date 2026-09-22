# REMAINING BY DISCIPLINE — apa yang belum, per disiplin, dan pondasi apa yang harus dijaga

**Dibuat:** 2026-09-15 · **Basis:** `main` lokal `7e3a86d` (46 commit di depan `newrepo/main` `a5f9549`)
**Sumber:** `docs/BACKEND_TODO.md`, `docs/UI_DESIGN_REVIEW.md`, `docs/CODE_REVIEW_AUDIT.md`,
`docs/CODE_REVIEW_STANDARD.md`, `scripts/ci/review-manifest.json`, `netlify.toml`, `.github/workflows/*`

> **Aturan baca dokumen ini.** Setiap baris **diukur** dengan perintahnya sendiri pada 2026-09-15.
> Di mana dokumen lama bertentangan dengan hasil ukur, **hasil ukur yang menang** dan koreksinya
> disebut. Angka commit/posisi **wajib** diverifikasi ulang saat dipakai — `newrepo/main` tidak
> punya tracking ref di repo ini.

> **Keputusan owner 2026-09-15:** **#16 (realtime) & #17 (email) di-skip** — free tier, fitur
> berlangganan ditunda. Keduanya **tidak** muncul sebagai pekerjaan di bawah; keduanya tetap
> tercatat sebagai "keputusan produk tertunda", bukan utang teknis.

---

## ⚠️ Koreksi 2026-09-17 (audit ulang) — enam baris di dokumen ini sudah tidak benar

Setiap butir di bawah **diukur ulang**; yang menang adalah hasil ukur. Polanya persis yang dokumen
ini sendiri peringatkan: **baris "BELUM" sering sudah selesai**, dan sebaliknya.

**§3.1(a) — "Empat modal tidak memakai `useOverlay` sama sekali" ⇒ SALAH, sudah selesai.**
Kelima berkas memakai hook itu: `ListKandidatModal.tsx`, `AdminAiCopilot.tsx`,
`RejectMailModal.tsx`, `RirekishoBuilder.tsx`, `EsignNaiteiModal.tsx` (masing-masing 2 kemunculan
`useOverlay`). Tidak ada pekerjaan tersisa di butir ini.

**§3.1(b) — pemanggil `fetchKandidatFromAPI` pindah, masalahnya ikut pindah.**
Sekarang `adminStore.fetchKandidatFromAPI`, dan **di sana masih `fetch` mentah** saat baris ini
ditulis. Diperbaiki 2026-09-17 lewat `api.secure(..., { onSessionInvalid: 'throw' })`.

**§3.1(b) — lingkupnya jauh lebih besar dari satu situs.** Dokumen mencatat **satu** situs fetch
mentah. Terukur 2026-09-17: **30 situs** `fetch(getEndpoint(...))` di **18 berkas**, dibanding **80**
pemakaian `apiClient`. Yang dikonversi baru `adminStore` (3 situs); **27 sisanya masih terbuka**, dan
itu pekerjaan yang jauh lebih besar daripada yang baris ini suguhkan.

**§3.1(b5) — "`src/pages/404.astro` tidak ada" ⇒ benar, dan sekarang sudah dibuat.**
Ditambah kunci `notfound.*` di `i18n.ts` **dan** `i18n-jp.ts` (kunci yang hanya ada di satu kamus
akan merender nama kuncinya sendiri, dan `i18n.keys.test.ts` menangkapnya).

**§1.1(c) — "dua skrip e2e yatim" ⇒ dihapus, bukan dipasang.**
`test-admin.mjs` tidak bisa lulus: ia butuh sesi admin yang tidak pernah ia buat (`/admin` di balik
`AuthGuard`), dan asersinya terikat data lama ("dropdown 24 options"). `test-supabase-auth.mjs`
lebih buruk: ia memanggil `auth/v1/signup` dengan **telepon acak pada setiap kali dijalankan** ⇒
**membuat user auth nyata di proyek produksi** dan menumpuk, sementara asersinya menerima status
200 **atau** 400 sehingga hampir tidak menegaskan apa pun; port bawaannya juga 4322 sementara kelima
gerbang lain memakai 4321. Skrip yatim yang tidak bisa dipasang dengan aman bukan cakupan — ia
liabilitas.

**§1.2(8) & §8.1(c) — "baseline lint 2712" ⇒ 2571.**
Sumbernya `.ci/biome-baseline.json` (`generatedAt` 2026-09-16T15:32:44Z, `total: 2571`); terukur
sekarang **2550**. Angka 2712 sudah basi sejak sebelum dokumen ini ditulis.

### Dua cacat yang TIDAK tercatat di dokumen ini, ditemukan 2026-09-17

**1. `BaseLayout` menerima prop `title` dan tidak pernah merender `<title>`.**
⇒ **nol halaman punya judul dokumen** — diperiksa di **10 halaman** hasil build, 0 kemunculan
`<title>`. Tab browser menampilkan URL, hasil pencarian tanpa judul, dan pembaca layar mengumumkan
dokumen tanpa nama: WCAG 2.4.2 "Page Titled" adalah **Level A**. Tidak ada gate yang mengukurnya,
jadi tidak ada yang memerah — persis kelas cacat yang §4.2 butir 1 minta diukur, bukan ditebak.
Diperbaiki 2026-09-17. **Efek samping yang perlu dicatat:** eksempasi `i18n.keys.test.ts` untuk
`<BaseLayout title="…">` bersandar pada premis yang salah — komentarnya menyebut string itu
"dokumen `<title>`: metadata SEO yang di-render server", dan memang alasan itu benar; premisnya yang
tidak, karena string itu tidak mencapai apa pun.

**2. `npm run test:coverage` tidak pernah bisa jalan.**
`@vitest/coverage-v8` **tidak pernah dideklarasikan** di `package.json` — bukan sekadar "tanpa
threshold, tanpa job" seperti §8.1(d) tulis. Skripnya ada, providernya tidak, jadi ia mati seketika
dengan `MISSING DEPENDENCY`. Butir itu karena itu lebih tepat dibaca sebagai "skrip mati", bukan
"cakupan tak terukur".

---

## 0. Peta cepat — apa yang benar-benar terbuka

| Disiplin | Terbuka | Sifat |
|---|---|---|
| **CI / Gate** | 1 gate yatim (`depcruise`); job `batteries` **ada tapi belum pernah dieksekusi** — **sebab akhir (2026-09-17): `_notify.yml` memakai `secrets` di `if:` ⇒ GitHub menolak SELURUH berkas ⇒ 32 run, 32 gagal, 0 job**, dan deploy/rollback ikut mati karena memanggil berkas yang sama. **Dua sebab sebelumnya (izin push, berkas tak ter-track) terukur salah** — lihat §1.1(a); 2 skrip e2e yatim | Infrastruktur + keputusan |
| **Backend** | #2 push; #4/#5/#6 butuh staging; #7 alert rules; #26/#28/#30 aksi owner | Owner + infra, **bukan kode** |
| **Frontend** | 4 modal tanpa `useOverlay`; `fetch` mentah di `TabPelamar`; `getAppData` kirim payload penuh | Kode, berukuran kecil–sedang |
| **UI / Desain** | 5 overlay tanpa semantik; drawer tanpa Escape; jebakan fokus 18 kontainer belum diukur | Kode + keputusan desain |
| **Database** | 270 diagnostik a11y (bukan DB) — DB sendiri bersih: 0 wildcard, RLS 25/25 | Terkendali |
| **OP / Observabilitas** | #3 buktikan sink **menerima** di Grafana; A1–A7 jadi alert rule; staging | Infra + verifikasi |
| **Keamanan** | 3 kredensial hidup perlu revoke/rotasi; `npm audit` report-only | **Aksi owner** |
| **Arsitektur** | G-08: tak ada gate "exported symbol benar-benar dipakai"; `depcruise` vs `boundary` belum diputuskan | Keputusan + tool |

---

## 1. CI / GATE — disiplin paling penting sekarang

### 1.1 Yang terbuka

**(a) Baterai mutasi: wiring SUDAH ADA, tapi BELUM PERNAH DIEKSEKUSI — TERUKUR 2026-09-16.**
*(Dikoreksi 2026-09-16: baris ini dulu berbunyi "tidak dijalankan CI mana pun" dan menyebutnya
temuan terbesar. Itu sudah basi — lihat di bawah.)*

Wiring-nya lengkap dan terukur: `package.json` punya **`verify:batteries`** (runner yang membaca
field `battery` dari manifest, bukan daftar tangan — jadi himpunannya tidak bisa menyimpang dari
klasifikasinya), dan `ci.yml` punya job **`batteries`** (~baris 350) yang menjalankannya.
`verify:review-manifest` melaporkan **0 gate blocking yatim**.

**Tapi job itu belum pernah jalan — dan sebabnya bukan gate-nya.** `newrepo/main` masih
`a5f9549` sementara lokal **73 commit di depan**, dan repo ini hanya punya satu branch
(`git branch -a` → `main`; `git ls-remote --heads newrepo` → hanya `main`). Jadi **CI belum
pernah melihat satu pun commit ini.**

Itu persis pembedaan yang doktrin repo ini minta dijaga: *"ada di disk" ≠ "ter-track git"
≠ "pernah dijalankan"* — dan **hanya tingkat ketiga yang menjamin verdict**. Menuliskan butir ini
sebagai "selesai" (karena job-nya ada) sama kelirunya dengan menulisnya "tidak dijalankan":
keduanya menebak, dan yang benar adalah **terblokir pada #2 (izin push)**.

> **Koreksi 2026-09-17 (audit ulang) — sebabnya salah, dan salahnya instruktif.**
> Diukur ulang: `git rev-list --left-right --count newrepo/main...a5f9549` → **`0 0`**, dan
> `newrepo/main` memuat **322** commit. Jadi `newrepo/main` **sudah** `a5f9549`; tidak ada
> commit yang tertahan izin push. Blokirnya satu lapis lebih dalam, dan persis jenis yang
> paragraf di atas sendiri ajarkan untuk dicurigai: **berkas gate-nya tidak pernah di-track.**
> **36 dari 58** berkas `scripts/ci/` tidak ada di git — termasuk `run-batteries.mjs`,
> `lint-ratchet.mjs`, `verify-classes.mjs`, `verify-review-manifest.mjs`,
> `verify-validation-coverage.mjs`, dan `review-manifest.json`. Setiap job CI mati di
> `Cannot find module` **sebelum** menilai apa pun: hijau karena tidak pernah jalan.
> `verify:review-manifest` sendiri menyebutnya apa adanya (C2b, "invisible to a fresh
> checkout"), dan gate itu pun tak bisa jalan di CI karena berkasnya ikut hilang.
> Diperbaiki di `071743e`.
>
> **Koreksi ketiga (2026-09-17, audit ulang) — dua koreksi di atas masih belum menyentuh
> sebabnya.** Sebab sebenarnya **satu baris di `_notify.yml`**: `if: ${{ secrets.… }}`.
> `secrets` tidak tersedia di `if:` — dan di dalam workflow yang **dipanggil** GitHub tidak
> memberi peringatan, ia **menolak seluruh berkas** dengan
> `Unrecognized named-value: 'secrets'`; workflow yang dipanggil lalu menyeret **pemanggilnya**
> ikut tak terparse. Karena `_notify.yml` dipanggil `ci.yml`, `deploy-staging.yml`,
> `deploy-production.yml`, dan `rollback.yml`, **keempatnya mati sekaligus**.
>
> Terukur dari anotasi GitHub: **32 run, 32 gagal, 0 job di setiap run**. Jadi tidak pernah ada
> job yang bisa gagal karena berkas `scripts/ci/` hilang — perbaikan `071743e` tetap perlu,
> tapi ia **bukan** sebabnya, dan tidak satu pun job pernah sampai ke sana.
>
> Perbaikan: `42b2a9b`. Gate: **`verify:workflows`** (`c201003`), dengan baterai mutasi 10 kasus.
> Dijalankan pada berkas sebelum perbaikan, gate itu melaporkan **baris 81 dan 105** — sama
> dengan anotasi GitHub, diturunkan sendiri.
>
> **Pelajaran yang berlaku tepat di sini:** ketiga penjelasan — "izin push", "berkas tak
> ter-track", dan "berkas workflow tidak sah" — semuanya *terlihat masuk akal*, dan dua yang
> pertama bahkan diperkuat oleh bukti nyata. Hanya tingkat ketiga ("pernah dijalankan") yang
> membedakannya, dan untuk kelas cacat ini tingkat itu **hanya terbaca dari anotasi GitHub**,
> bukan dari pohon. Pohon bisa membuktikan sebuah berkas ada; ia tidak bisa membuktikan GitHub
> mau mem-parse-nya.

Yang **masih** benar dari butir ini: `depcruise` tetap gate yatim (`battery: none`, `runs: []`),
dan **9 baterai `infra` memang tidak dijalankan CI** (butuh DB/server/kredensial — klasifikasi itu
disengaja, bukan kelalaian).

**Konsekuensi yang tetap berlaku:** manifest mencetak `a battery EXISTS for 27/28 (96%)` —
*"ada baterainya"*, **bukan** *"properti itu masih berlaku"*. Runner sudah menutup celah itu untuk
**19 baterai hermetik**, tapi angka itu baru bermakna **setelah job-nya benar-benar dieksekusi**.
Sebab empat run pertama salah membaca ada di `docs/CI_BATTERY_RUNNER_STATUS.md` (2026-09-16).

**(b) `depcruise` — gate yatim.** `runs: []`, `provenBy: null`, `blocking: false`. Tidak pernah
dipanggil workflow mana pun. Sengaja dibiarkan advisory sampai diputuskan mana yang otoritatif
antara `depcruise` dan `npm run boundary` (audit A-07).

**(c) Dua skrip e2e yatim — TERUKUR.** `test:e2e` hanya menjalankan 4 dari 7 berkas:

| berkas | status |
|---|---|
| `e2e/test-public.mjs` | dijalankan `test:e2e` |
| `e2e/test-loker-layout.mjs` | dijalankan |
| `e2e/test-headings.mjs` | dijalankan + punya baterai |
| `e2e/test-dialog.mjs` | dijalankan + punya baterai |
| `e2e/test-admin.mjs` | **YATIM** — tak dipanggil siapa pun |
| `e2e/test-supabase-auth.mjs` | **YATIM** |
| `e2e/share-data.test.ts` | dijalankan lewat project vitest `backend` (bukan `test:e2e`) |

Empat yang dijalankan **hanya 3 punya baterai** — `test-public.mjs` tidak.

**(d) `ui:audit` & `test-admin` tidak ada di CI.** `ui:audit` adalah alat ukur manual (bagus),
tapi tidak ada gate otomatis yang menjaganya.

### 1.2 Pondasi yang WAJIB dijaga expert CI/Gate

1. **Setiap gate blocking harus dijalankan minimal satu workflow.** Ukur dengan field `runs[]` di
   manifest + `C3`. Saat ini **0 gate blocking yatim** — jangan sampai naik lagi.
2. **Setiap gate harus dibuktikan bisa GAGAL**, dan buktinya **harus dieksekusi ulang** — bukan
   disimpan sebagai angka di dokumen. Kalau baterai tidak dijalankan CI, properti itu **tidak
   dijaga**. Ini celah terbesar sekarang.
3. **Naikkan tingkatan bukti secara bertahap**, dari `provenBy` dideklarasikan → **dijalankan CI**.
   Urutan yang aman: mulai dari baterai **hermetik & murah** (tak butuh server/DB/Postgres):
   `verify:md`, `verify:classes`, `boundary`, `verify:io`, `bundle:size`, `typecheck*`,
   `lint-ratchet`, `idx:gate`, `test`. Yang butuh server/Postgres (`smoke`, `cold:start`,
   `verify:db/schema/rls`, `verify:env`) **jangan** dimasukkan tanpa mengukur runtime-nya dulu.
   **Harga harus diukur, bukan ditebak** — jebakan "ukur dulu" berulang di proyek ini.
4. **Gate harus mencetak apa yang diukur**, dan cakupannya harus **di-scope ke unit tempat klaim
   dibuat**. "Ada di berkas" ≠ "ada di job itu" (tautan: tautologi §25).
5. **Gate baru wajib punya entri manifest** (`script`, `tier`, `blocking`, `provenBy`, `runs[]`,
   `note`). `verify:review-manifest` C1–C6 + `C2b` menegakkan ini; jangan dilonggarkan.
6. **`C2b` tetap wajib:** `provenBy` harus **ter-track git** — "ada di disk" ≠ "sampai ke checkout".
7. **Satu gate, satu verdict.** Jangan menggabungkan beberapa gate jadi satu langkah CI — status
   merah harus menyebut gate mana yang rusak (`ci.yml` `quality-gates` sudah benar begini).
8. **Jangan longgarkan ratchet untuk melewatkan PR.** Lint ratchet **hanya boleh turun**;
   baseline beku di `.ci/biome-baseline.json` (sekarang **2712**).

---

## 2. BACKEND

### 2.1 Yang terbuka

**Dikoreksi 2026-09-16:** baris ini dulu menulis *"Hanya **delapan** item, dan **tak satu pun
pekerjaan kode yang bisa dikerjakan tanpa keputusan/infra"*. **Itu salah** — celah validasi tepi
adalah pekerjaan kode yang tidak butuh keputusan maupun infra, dan ia terlewat karena **tiga
dokumen mengklaim cakupannya sudah universal** sementara kenyataannya 7 dari 81 aksi, semuanya
di satu surface. Pelajarannya sama dengan §9 butir 2: klaim cakupan yang tidak diukur akan
menyembunyikan pekerjaan, bukan cuma salah angka.

Sisa item owner/infra:

| # | Item | Blokir |
|---|---|---|
| **2** | Push `main` | **Izin owner** (push = deploy produksi) |
| **4** | Phase E #20 — load test 10× peak | **Staging** + Supabase project terpisah |
| **5** | Phase E #22 — pooler failover drill | Staging yang sama |
| **6** | Phase B §7.2 — kalibrasi in-flight cap (24/4/3) | Staging yang sama |
| **7** | Alert §7.2 + error budget §7.3 → jadikan alert rule | Keputusan owner + akses Grafana |
| **26** | Revoke token `ghp_qzq70Qy…` | **Aksi owner** (hanya Anda punya akses GitHub) |
| **28** | Rotasi `SESSION_SECRET` | **Aksi owner**; kode tak punya fallback ⇒ nilainya kritis |
| **30** | Revoke token `ghp_` utuh di `netlify_auth_token=nfp_….txt` | **Aksi owner**; berkas gitignored, **tidak** bocor ke remote |

**#16 (realtime) & #17 (email): di-skip owner.** Free tier; keputusan produk, bukan utang.

**Yang sudah selesai (jangan bangun ulang):** **validasi tepi handler (2026-09-16)** — klaim
tiga dokumen dikoreksi (terukur 7/81, bukan universal), celah `jobs` ditutup, satu bug PATCH-kosong
diperbaiki, dan `verify:validation` + `.ci/validation-baseline.json` menjaga angkanya (**9/33**
aksi mutasi, dari 3/33). **Mekanismenya `_lib/kernel/guard.ts`, bukan zod** — zod menambah ~67 KB
ke delapan entry point dan menembus plafon 600 KB `files.js`; guard tanpa dependensi hanya ~5 KB
(§2.2 butir 3 dan butir 10 saling mengunci, dan ukuran menang); #8 reminder agenda (cron hidup),
#9 defer P3,
#10–#15 (paritas legacy — **tiga di antaranya bug nyata**), #18 PWA offline, #19 `api.secure`,
#20–#25 koreksi dokumen, #27 env Grafana, #29 cold start (terukur + **bergate**), #31 gate rollback
memeriksa health.

### 2.2 Pondasi yang WAJIB dijaga expert Backend

1. **Read-modify-write pada state bersama DILARANG.** Tiap mutasi = satu pernyataan atomik.
2. **Tidak ada state per-request di scope modul/global** — pakai `AsyncLocalStorage`.
3. **Semua I/O keluar lewat `kernel/http.ts`**; `fetch` mentah hanya di allow-list yang berbasis
   **hitung**, bukan sekadar nama berkas. `verify:io` menjaga ini.
4. **Mutasi harus OPT-IN ke retry** — jangan asumsikan idempoten.
5. **Latency terburuk harus muat deadline 12 s**, dijumlahkan sepanjang rantai fallback.
6. **Error mengembalikan status HTTP yang benar** — **jangan** `200` + `{success:false}`.
7. **Identitas dari token terverifikasi, BUKAN dari body.** Peran diturunkan **server-side**.
   Pemeriksaan **object-level** (kepemilikan), bukan cuma peran.
8. **Zod di tepi handler.** Output tak tepercaya di-escape **sebelum** transform HTML apa pun.
9. **Tidak ada secret/PII di log, storage, atau query string.**
10. **Database: proyeksi kolom eksplisit, dilarang `SELECT *`** (tabel master 169 kolom ≈ 570 KB
    JSON per cold read). **Tanpa N+1.** Migrasi baru **reversibel** atau menyatakannya terang-terangan.
11. **Gerbang fungsi:** tiap subdirektori langsung tak boleh punya `index.*` (Netlify tanpa handler
    ⇒ batas env 4 KB hidup lagi). Dijaga `verify:entries`.
12. **Cakupan RLS:** semua tabel `public` **RLS on**; tak ada GRANT `TRUNCATE`; tak ada policy
    tak terbatas ke `PUBLIC`. Dijaga `verify:rls` (kini **bisa offline**, §30).

---

## 3. FRONTEND

### 3.1 Yang terbuka

**(a) Empat modal tidak memakai `useOverlay` sama sekali** — jadi **tidak punya perangkap Tab,
tidak punya Escape, tidak punya pemulihan fokus**. Cacatnya **lebih besar dari nama**:
manajemen keyboard-nya memang belum ada.

| berkas | catatan |
|---|---|
| `src/components/admin/ListKandidatModal.tsx` | modal admin, interaktif |
| `src/components/ui/RirekishoBuilder.tsx` | builder CV |
| `src/components/admin/AdminAiCopilot.tsx` | copilot AI |
| `src/components/admin/RejectMailModal.tsx` | modal kirim email |

Plus `EsignNaiteiModal:304` (permukaan gambar layar penuh).

**Memperbaikinya = mengadopsi `useOverlay` di lima tempat**, dengan perubahan perilaku yang
**butuh pengujian sendiri** — bukan penambahan atribut seragam.

**(b) `fetchKandidatFromAPI` (`TabPelamar`) masih `fetch()` mentah dan tidak lewat cache.**
Belum diubah karena tidak ada keluhan latensi di sana. Kalau dibiarkan, ia **tidak** melanggar
`verify:io` (masuk allow-list), tapi melanggar semangat non-negotiable #3.

**(b2) AKAR MASALAHNYA SUDAH DIPERBAIKI, 21 SITUS SISANYA BELUM (2026-09-17).**

Alasan situs-situs ini memakai `fetch` sendiri **bukan** kelalaian, dan itu baru ketahuan setelah
membaca `apiClient`: pada respons non-2xx ia melempar `HTTP <status>: <statusText>` **dan membuang
badan responsnya**. Padahal fungsi mengembalikan error sebagai
`{ success:false, error:"Nomor ini belum terdaftar" }` **dengan status HTTP yang benar**
(non-negotiable #6) — jadi satu-satunya tempat alasannya berada adalah **badan respons**. Klien
memberi kategori ("HTTP 400: Bad Request"), bukan penjelasan. Karena itu tiap alur yang butuh pesan
yang bisa ditindaklanjuti mempertahankan `fetch`-nya sendiri.

**Diperbaiki di `83b3541`:** klien kini mem-parse badan error dan memunculkannya, dengan fallback ke
baris status. Ini memperbaiki pesan untuk **80 call site yang sudah ada** juga — sebelumnya semuanya
menampilkan "Network error: HTTP 500: Internal Server Error" padahal server sudah mengatakan sesuatu
yang berguna. Buktinya **mutasi, bukan asumsi**: 2 dari 4 kasus baru MATI saat `throw` lama
dikembalikan, 2 sisanya sengaja OK-GREEN karena mengunci fallback yang juga dipenuhi kode lama.

**Sisa terukur (2026-09-17, sesudah dua batch): 18 situs di 12 berkas — 14 di antaranya bisa
dikonversi, 4 sudah terdokumentasi sebagai pengecualian.** Yang sudah selesai:
`adminStore.fetchMailFromAPI` + `uploadBerkas` (`131593a`), lalu `EsignNaiteiModal` +
`EditCandidateModal` (`simpanDataTtdNaitei`, `updateKandidatSuper`, `simpanBerkasTahapan`).

Sisa yang **bisa** dikonversi — 14 situs di 8 berkas: `ApplyFullForm` 3, `MasterFullForm` 3,
`AiCvForm` 2, `CandidateDash` 2, `CekSiswaModal` 1, `PemberkasanModal` 1, `SiswaBaruForm` 1,
`LoginModal` 1.

Empat yang **tidak** dihitung sebagai sisa:
- `lib/apiEndpoint.ts` — sebuah **komentar** di kepala berkas, bukan situs. Penghitung manual yang
  naif melaporkannya sebagai satu situs; ia bukan, dan itu sebabnya angkanya pernah "21" bukan "20".
- `lib/publicData.ts` — cache single-flight yang memang dirancang **menembak ulang setelah settle**;
  cache 30 s milik klien akan mengubah perilaku itu.
- `forms/ShareView.tsx` — `share-data` adalah **GET** dengan query string, bukan envelope POST action
  (kepala handler-nya menyatakan itu). Klien hanya bisa POST action.
- `admin/CandidateProfileModal.tsx` — satu situs, mengoper `signal: controller.signal`; lihat di bawah.

**Resep yang SUDAH DIJALANKAN** — `ListKandidatModal` (`83b3541`), `InputManualModal`, dan
`CandidateProfileModal` (satu situs; satunya sengaja ditinggal, lihat di bawah):
1. `api.secure(action, args, { onSessionInvalid: 'throw' })` menggantikan envelope buatan tangan.
   Periksa kesetaraan endpoint — jangan diasumsikan (`getEndpoint(action)` harus resolve ke URL yang sama).
2. **Catch-nya jangan menambah toast**: klien sudah menampilkan pesan server. Dua toast untuk satu
   kegagalan itu regresi, bukan ketelitian.
   **⚠️ Menggantinya dengan `console.error` BERBIAYA satu diagnostik `lint/suspicious/noConsole`**
   (severity `warn`, dan ratchet menghitung **semua** tingkat). Ratchet hanya mengizinkan TOTAL
   turun, jadi resep "ganti dengan `console.error`" **tidak bisa dipakai untuk 14 situs yang tersisa**
   — ia akan menambah 14 diagnostik yang tidak ada tempat menebusnya. Terukur: `83b3541` menambahkan
   2 `console.error` di `ListKandidatModal` dan total langsung naik **2499 → 2501**, tanpa ada yang
   menyadarinya karena tidak ada gate yang membacanya sebagai "resep vs ratchet".
   ⇒ **Jalur yang benar untuk sisa situs adalah langkah 3** (`silent: true`, toast pemanggil
   dipertahankan): biayanya **nol diagnostik**, karena tidak ada `console.error` yang ditambahkan.
   Terukur pada batch 2026-09-17: `EsignNaiteiModal` + `EditCandidateModal` (3 situs) ⇒ total tetap
   **2499** dan `typecheck:ratchet` tetap 0.
   Kalau jejak konsol memang dibutuhkan, tempatnya **satu kali di dalam klien** — klien yang memiliki
   transport — bukan satu per pemanggil. Itu menukar N diagnostik dengan 1.
3. **Kalau pemanggil MEMANG punya toast kontekstual sendiri** (`"Gagal upload <jenis>."` — konteks
   yang tidak mungkin diketahui klien), pakai **`silent: true`** dan biarkan catch itu yang bicara.
   Pesan server tidak hilang: klien tetap melempar dan `err.message` kini berisi pesan server.
   Opsi `silent` ditambahkan 2026-09-17 dengan tes yang **MATI saat dimutasi**.
4. Buang impor `getEndpoint`/`authStore` **kalau keduanya hanya dipakai situs itu** — kalau tidak,
   jadi impor mati dan ratchet lint menyalak.
5. **Tes — tiga hal, ketiganya ditemukan dengan menjalankannya, bukan diperkirakan:**
   a. mock `authReactive` **wajib** menambahkan `isLoggedIn: true` + `logout`. Klien menolak —
      dan dengan `onSessionInvalid:'throw'` ia melempar — **sebelum fetch** kalau store tidak
      melaporkan sesi hidup. Mock lama hanya mengembalikan `sessionToken`, dan itu cukup selama
      komponen membangun fetch-nya sendiri.
   b. asersi badan memakai kunci **`payload`**, bukan `args` (backend menerima keduanya:
      `body.payload || body.args` di `_lib/netlify-wrapper.ts`) ⇒ ganti nama di kabel, bukan
      perubahan perilaku.
   c. mock fetch **wajib** menambahkan **`ok: true`**. Klien memeriksa `res.ok`; kode mentah tidak
      pernah (ia hanya memanggil `.json()`). Mock tanpa `ok` terbaca sebagai respons gagal ⇒ klien
      melempar ⇒ asersi melihat tidak ada badan permintaan sama sekali. Gejalanya menyesatkan:
      tesnya gagal pada asersi *berikutnya* (`expected [] to include …`), bukan pada fetch-nya.
6. **Situs yang MEMERIKSA `sessionInvalid` sendiri butuh perlakuan khusus.** Sinyal itu datang
   sebagai **HTTP 400**, bukan 200: wrapper memetakan `success === false` → **400**
   (`_lib/netlify-wrapper.ts`), dan jawaban `sessionInvalid` selalu `success: false`. Terukur pada
   **produksi** dengan token palsu: `getDrafCvMaster` → `400 success=false sessionInvalid=true`, dan
   `updateKandidatSuper` → sama. Klien menerjemahkannya menjadi pesan kanonik `'Session expired'`
   lewat **throw**, jadi cabang `data.sessionInvalid` di komponen **praktis tidak lagi kena** —
   **catch-nya** yang harus mengenali pesan itu dan memetakannya kembali ke keadaan sesi komponen
   (lihat `CekSiswaModal`, yang punya `kind: 'session'`). Perbandingan string itu memang kontrak
   klien; `AiCvForm.tsx` sudah bergantung padanya.

   **Cacat yang ditemukan sambil mengerjakan ini, dan sudah diperbaiki 2026-09-17:** klien dulu
   memeriksa `sessionInvalid` **hanya di jalur 2xx**. Karena sesi mati selalu 400, `onSessionInvalid`
   — termasuk default **`'logout'`** — **tidak pernah menyala** untuk kedaluwarsa yang sebenarnya:
   pengguna tetap "login" memegang token mati dan hanya melihat error. Kini diperiksa di **kedua**
   jalur, lewat satu fungsi `sessionInvalidVerdict()` supaya keduanya tidak bisa menyimpang.
   **Bukti: mutasi.** Hapus pemeriksaan di jalur non-2xx ⇒ **2 tes MATI** dengan pesan yang justru
   menjelaskan bug-nya (`expected 'Session expired' but got 'Sesi tidak valid'`), sementara tes
   **KONTROL** (400 biasa harus tetap memunculkan pesan server) tetap hijau — itu yang membuktikan
   pemetaannya selektif, bukan menelan semua error 400.

**SATU SITUS SENGAJA TETAP MENTAH, dan bukan karena lupa:**
`CandidateProfileModal` → `getExistingCandidateJsonByWa` mengoper **`signal: controller.signal`**
untuk membatalkan permintaan saat efeknya dibersihkan. `apiClient` **belum punya opsi `signal`** —
ia memasang AbortController-nya sendiri untuk batas waktu. Mengonversinya sekarang berarti
**kehilangan pembatalan saat unmount**: regresi, bukan konsistensi. Menunggu opsi `signal` di klien
(kombinasikan dengan sinyal batas waktu lewat listener `abort`, bukan `AbortSignal.any()`, yang
terlalu baru untuk audiens Android lama di sini).

**KEPUTUSAN YANG MASIH DIBUTUHKAN sebelum sisanya dikerjakan:** beberapa catch punya toast
kontekstual sendiri (mis. `'Gagal upload ' + d.type`), jadi konversi akan **melaporkan dua kali**.
Pilihannya: tambahkan opsi `silent` pada `apiClient` supaya pemanggil yang punya UI error sendiri
tidak ikut mendapat toast klien — lalu catch-nya menampilkan `err.message` (yang kini berisi pesan
server). Itu perubahan API kecil tapi **keputusan desain**, bukan tambalan; jangan dikerjakan borongan
tanpa bisa menjalankan gerbang e2e browser.

**(c) `getAppData` masih mengirim seluruh payload aplikasi untuk satu field.** Memangkasnya butuh
parameter `fields`/endpoint khusus di **backend** — di luar lingkup "frontend saja".

**(d) Inkonsistensi sesi yang dibiarkan sengaja** (keputusan produk, bukan bug): sesi mati di
`TabKelola` ⇒ daftar kosong; di `TabDbJob` ⇒ logout + redirect. Belum diseragamkan.

**(e) Kesegaran tiga konsumen `fetchAllKandidat` yang lain belum diaudit** — hanya
`ListKandidatModal` yang punya refresh sengaja (`{ force: true }`).

**(f) 4 modal tanpa hook = 5 total adopsi.** Lihat (a).

### 3.2 Pondasi yang WAJIB dijaga expert Frontend

1. **Tanpa `dangerouslySetInnerHTML` pada data tak tepercaya.**
2. **`persistentAtom` `decode` WAJIB `try/catch` dengan fallback** — throw di scope modul =
   layar putih tanpa pemulihan.
3. **Tanpa `setInterval` di scope modul**, dan **setiap listener punya cleanup yang cocok.**
4. **Tanpa token di `localStorage`.**
5. **I/O lewat kernel**, bukan `fetch` mentah (kecuali allow-list berhitung).
6. **Setiap overlay baru WAJIB pakai `useOverlay`** — hook itu yang memasang `role="dialog"`,
   `aria-modal`, nama dari heading pertama, perangkap Tab, Escape, dan pemulihan fokus. Ini
   **kontrak**, bukan opsional (§25). Overlay tanpa hook = keyboard user terkurung.
7. **Setiap halaman punya SATU `h1`**, dan tingkat heading **tidak melompat**. Dijaga
   `e2e/test-headings.mjs` (103 pemeriksaan, 7 rute).
8. **Tanpa kelas CSS yang tak menghasilkan aturan** — Tailwind diam kalau kelasnya salah tulis.
   Dijaga `verify:classes` (memakai compiler Tailwind sendiri).
9. **Ukur performa sebelum menuduh "lambat"** — §26 menemukan ±1,8 s untuk baris pertama panel
   loker, dan **ketiga sebabnya ada di frontend**, bukan backend.

---

## 4. UI / DESAIN

### 4.1 Yang terbuka

**(a) Lima overlay status/gerbang tanpa semantik — SELESAI.** Baris ini menyatakan pekerjaan
yang sudah selesai beberapa ronde lalu. Diukur ulang 2026-09-16 pada sumber: kelimanya sudah
bersemantik — **3** lewat `useOverlay` (`AiCvForm:202`, `ApplyFullForm:53`, `MasterFullForm:160`)
dan **2** `role="status" aria-live="polite"` (`AiCvForm:492`, `ApplyFullForm:418`,
`MasterFullForm:891`). Dua yang layar tunggu memang `role="status"`, persis seperti yang
diputuskan di sini. Lihat `UI_DESIGN_REVIEW.md` §27.2.

**(b) Drawer `App.tsx` — DIUKUR, LALU DIPERBAIKI (2026-09-16).** Baris ini benar bahwa
perbaikannya harus menunggu pengukuran; yang keliru adalah asumsinya bahwa cacatnya sebatas
Escape dan trap fokus. Terukur pada 390×844 di artefak build: `nav` tertutup berdiri di
`rect.x = 390` (= lebar viewport, di luar layar) dengan `inert = false`, dan **7 dari 22** Tab
stop mendarat **di dalam drawer tertutup** — cincin fokus digambar di luar layar. Escape tidak
berefek sama sekali. Diperbaiki: `inert` saat tertutup (lewat `useLayoutEffect`, supaya tidak ada
frame di mana drawer tertutup tapi masih memegang 6 Tab stop), Escape, fokus masuk saat dibuka,
dan fokus kembali ke trigger saat ditutup. Dijaga `e2e:drawer` (baterai 7/0).

**(b2) Latar tidak inert saat drawer terbuka — keputusan produk, BELUM.** Terukur **19 dari 30**
Tab keluar dari drawer ke halaman di belakang, di mana cincin fokus mendarat di bawah drawer
288 px. Scrim sudah membuat latar inert terhadap pointer; menutup asimetri itu mengubah perilaku,
jadi menunggu keputusan owner. `UI_DESIGN_REVIEW.md` §27.7 butir 3.

**(b3) `LoginModal` memanggil `useOverlay` tanpa memasang `containerRef` — DIPERBAIKI (2026-09-16).**
`containerRef.current` bernilai null seumur hidup modal, jadi setiap efek yang membacanya keluar
lebih awal. Terukur dengan modal terlihat: `[role="dialog"]` = **0**, tanpa `aria-modal`, tanpa
nama aksesibel, fokus awal di luar modal, 12× Tab keluar. Escape dan pemulihan fokus tetap
bekerja — sebabnya cacat ini tak terlihat. Dari **27** call site `useOverlay`, ini satu-satunya
yang tanpa ref. Dijaga `e2e:drawer`.

**(b4) Utang a11y — diperbarui 2026-09-16, sesudah ronde label terakhir.** **0**
`noLabelWithoutControl` di `src/` (perjalanan **153 → 138 → 95 → 80 → 66 → 26 → 10 → 0**). Dari
**139** kemunculan `<label` di berkas non-uji `src/`, **127** membawa `for=` dan **12**
membungkus kontrolnya. Peringatan metodologis: hitungan label-level ini adalah **pola atas teks
sumber**, sehingga ia **ikut menghitung** kemunculan di dalam komentar — angka yang mengikat adalah
diagnostik lint (yang berbasis AST), bukan yang ini.
**Empat** rute kandidat sudah **219/219 terasosiasi** dan dijaga `e2e:labels`; sisanya — modal/tab
admin — kini juga **0** (`UI_DESIGN_REVIEW.md` §27.9–§27.12).

**0 di sini BUKAN "setiap kontrol punya nama".** Aturan ini hanya melihat `<label>` **yatim**; ia
**buta** pada kontrol yang tidak punya `<label>` sama sekali. Dua grup seperti itu ditemukan di
`RincianBiayaModal` — dua input per baris tahapan pembayaran, dan input "Item custom" per seksi —
dan keduanya sekarang bernama (§27.12); kelas yang sama sebelumnya muncul di `InputManualModal`
(§27.10). Sisa kelas itu diukur **kasar** (statis, bukan AST) atas 49 berkas `.tsx` non-uji:
**169 kontrol**, **133** bernama di tag-nya sendiri, **36** tidak. **36 itu batas ATAS**, bukan
cacat: sebagian dinamai `<label>` pembungkus (dibaca dan diverifikasi di `TabTambah` 229/240/251
dan `AdminShareModal` 192).

Dari **10** lokasi terakhir, **5** pasangan label/kontrol (⇒ `for=` + `id=`), **3** `<label>` yang
sebenarnya **judul grup** (⇒ `<div>`), dan **2** `<label>` di atas elemen yang `for=` **tidak
bisa** capai (`<button>`, `<pre>`) ⇒ `<div>`. Tidak ada yang jatuh ke ember "tidak jelas".

Tiga label kelompok `/ai-cv` sudah ditutup dengan **`<fieldset>` + `<legend>`** (`TextAreaPair`
prop `groupLabel`) — **bukan** `role="group"` + `aria-labelledby`. Percobaan pertama memakai yang
kedua dan menukar satu diagnostik dengan yang lain (`lint/a11y/useSemanticElements` menyarankan
`<fieldset>`); saran linter itu juga perbaikan yang lebih kuat, karena `<legend>` menamai
fieldset-nya secara **native** — tidak ada id yang bisa melenceng dari namanya.
**195** `useButtonType` — **bukan** jalur kerusakan: hanya ada **4** `<form>` di `src/` dan **0**
tombol tanpa `type` di dalamnya (§27.7 butir 2). **38** `useKeyWithClickEvents` + **33**
`noStaticElementInteractions`. **0** utilitas token semantik — `--color-primary`/`--color-secondary`
dideklarasikan di `:root` (bukan `@theme`) dan dibaca **0 kali**, sementara **2861** utilitas palet
hardcoded dipakai di 105 berkas. Prioritas: `UI_DESIGN_REVIEW.md` §27.7.

**(b5) Belum dibuat: halaman 404, komponen skeleton/loading, komponen empty-state.**
`src/pages/404.astro` tidak ada dan `netlify.toml` tidak punya aturan 404; nol komponen skeleton
padahal panel admin butuh **1,8 s** ke baris pertama (§26); empty-state hanya string ad-hoc di
3 berkas. `UI_DESIGN_REVIEW.md` §27.7 P3.

**(c) Cakupan gate overlay terbatas.** Gate mengukur overlay yang **bisa dicapai tanpa backend
ber-sesi**: modal detail lowongan, modal pamflet (bertumpuk), scrim drawer, layer dekoratif.
**Delapan belas kontainer `useOverlay` lain** hanya tercakup **lewat kontrak hook yang sama** —
bukan diukur satu per satu. Yang membuktikan kontraknya adalah pemeriksaan langsung + baterai.

**(d) Utang a11y terukur — 270 diagnostik di 5 aturan** (bagian dari **2571** baseline lint;
  angka 2026-09-16, sesudah `noLabelWithoutControl` = 0). Dua angka ini beda **cakupan**:
  **270** dihitung atas `src/` saja, sedangkan baseline lint dihitung atas **seluruh repo**.
  Diukur, keduanya kebetulan **sama** (270) karena aturan a11y hanya menyala di `.tsx`, dan
  seluruh `.tsx` berada di `src/`.

| jumlah | aturan |
|---|---|
| 195 | `lint/a11y/useButtonType` |
| 38 | `lint/a11y/useKeyWithClickEvents` |
| 33 | `lint/a11y/noStaticElementInteractions` |
| 3 | `lint/a11y/useSemanticElements` |
| 1 | `lint/a11y/noSvgWithoutTitle` |

Ini **utang yang dibekukan, bukan pelanggaran baru** — ratchet memastikan ia hanya boleh **turun**.

**(e) Tema harus tetap benar di light AND dark.** Shim light-mode: tiap latar gelap yang tak
dibalik jadi **bug kontras**. Diukur di build produksi, dua tema.

### 4.2 Pondasi yang WAJIB dijaga expert UI

1. **Ukur, jangan tebak.** Tiap temuan UI harus punya angka: `getBoundingClientRect` (posisi,
   tabrakan, ukuran target), `getComputedStyle` (radius/border/warna/uppercase),
   `scrollWidth vs clientWidth`.
2. **Target sentuh ≥ 44 px** (pernah ditemukan 28 px dan tombol tutup 24×32 — §11.2/§11.3).
3. **Tanpa tabrakan elemen.** Judul header pernah menimpa tombol menu (§11.1).
4. **Satu bahasa visual, bukan dua** (§11.4).
5. **Aksen tidak boleh tabrakan dengan warna tenant** (§11.5).
6. **`uppercase` tidak dipakai pada judul kolom berbahasa Indonesia** (§11.6) — sudah diperbaiki.
7. **Enam kelas komponen inti harus ada** (`.input`, `.btn`, …) — pernah hilang semua (§2),
   sekarang dijaga `verify:classes`.
8. **Falsifikasi kelas di CSSOM** saat mencurigai kelas mati: uji `hover:bg-slate-750` → 0 aturan.
9. **Yang sudah benar jangan "diperbaiki"** — ada bagian khusus untuk itu (`§11.7`).
10. **Kontras WAJIB diuji di dua tema.** Shim light-mode adalah sumber bug kontras.
11. **Jangan mengubah perilaku fokus/keyboard diam-diam.** Cacatnya lebih besar dari namanya.

---

## 5. DATABASE

### 5.1 Yang terbuka

**Nol pekerjaan kode terbuka.** Terukur 2026-09-15:
- `verify:projections` → **0 wildcard projection** pada **189 berkas** di `netlify/functions/`.
- `verify:rls` → semua tabel `public` RLS on; tak ada GRANT `TRUNCATE`; tak ada policy tak terbatas
  ke `PUBLIC` (diuji terhadap **produksi, 25 tabel**, dan kini **bisa offline** lewat baterai §30).
- `verify:schema` → `schema.generated.ts` cocok dengan render live.

Yang tersisa bersifat **prosedural**, bukan skema: migrasi baru harus **reversibel** atau
menyatakannya terang-terangan, dan gate-nya berjalan **hanya di jalur deploy** (bukan `ci.yml`),
karena hanya di sana kredensial ada.

### 5.2 Pondasi yang WAJIB dijaga expert Database

1. **Dilarang `SELECT *`** — proyeksi kolom eksplisit. Tabel master 169 kolom ≈ **570 KB JSON**
   per cold read. Dijaga `verify:projections`.
2. **Tanpa N+1.**
3. **Migrasi baru reversibel** atau **menyatakan terang-terangan bahwa ia tidak**.
4. **RLS on untuk semua tabel `public`** — 16 tabel tanpa policy = **fail-closed, bukan eksposur**;
   jangan "perbaiki" dengan menambah policy longgar.
5. **Kunci RLS yang benar:** written `USING (true)` disimpan Postgres sebagai **ekspresi `'true'`**,
   **bukan NULL**. Cek `polqual is null` **tak akan pernah menyala** (§30). Pakai
   `polqual is null OR pg_get_expr(polqual)= 'true'`.
6. **Gate skema/RLS hidup di jalur DEPLOY**, bukan `ci.yml` — CI tidak punya kredensial DB.
7. **Posisi DB selalu diukur lewat API**, bukan dibaca dari dokumen.
8. **Pooler** = Supavisor `:6543`; `db.<ref>.supabase.co:5432` **tidak resolve**.

---

## 6. OP / OBSERVABILITAS

### 6.1 Yang terbuka

**(a) #3 — buktikan sink Grafana benar-benar MENERIMA.** Kedua env var Grafana **sudah ada**
(`GRAFANA_CLOUD_OTLP_ENDPOINT` + `GRAFANA_CLOUD_BASIC_AUTH_HEADER`, scope benar). Yang belum:
bukti **data masuk** — env ada ≠ data masuk.

**(b) #7 — A1–A7 belum menjadi alert rule.** `metrics-receiver.ts` (335 baris, 13/13 tes hijau)
sudah **live di produksi** (fail-closed: `POST` → 503 `METRICS_RECEIVER_TOKEN not configured`,
bukan 404 ⇒ benar ter-deploy).

**(c) Nilai `dev` yang kosong** untuk `GRAFANA_CLOUD_BASIC_AUTH_HEADER`.

**(d) Staging belum ada.** `deploy-staging.yml` sudah ada; **project Supabase-nya belum**. Ini yang
membuka **tiga item sekaligus** (#4, #5, #6) + kalibrasi cap.

**(e) `npm audit` report-only.** `continue-on-error: true` dengan 13 advisory. Keputusan:
nyalakan (`false`) **setelah** pohon dependensi produksi bersih — kalau tidak, tiap PR mewarisi
advisory hari ini.

### 6.2 Pondasi yang WAJIB dijaga expert OP

1. **Tiap status deploy harus punya jalur rollback yang ter-test** — `classifyHealth()` teruji +
   termutasi, sehingga probe yang tak bisa mengautentikasi **memberi warning, bukan rollback**.
2. **`HEALTH_TOKEN` wajib sama** antara env site Netlify dan secret GitHub Environment
   `production`, supaya verdict-nya penuh (bukan warning).
3. **Jalur kanonik health = `/.netlify/functions/health`.** `/health` tanpa prefix **404** —
   `netlify.toml` tidak punya redirect untuknya; 404 di situ = gejala deploy rusak.
4. **Gate DB/skema/RLS berjalan SEBELUM publish**, di jalur deploy. `skip-db-gate` hanya untuk
   dispatch manual.
5. **Cold start terburuk < 3 s** (sekarang terukur 1,81 s, margin ~1,2 s). `cold:start`
   **report-only** sampai ia stabil — latency itu berisik, satu sampel sial tak boleh me-rollback
   rilis sehat.
6. **Satu gate yang bisa memicu rollback punya dua arah mahal:** terlalu ketat ⇒ rollback produksi
   sehat; terlalu longgar ⇒ mengirim outage. Keduanya harus diuji (`smoke.mutations.sh`).
7. **Jangan percaya `netlify env:list`** — under-reports. **Percaya probe.**
8. **Jangan commit `netlify/functions/secrets/*`.**

---

## 7. KEAMANAN

### 7.1 Yang terbuka — semuanya **aksi owner**

| item | tindakan | kenapa saya tak bisa |
|---|---|---|
| **#26** | Revoke `ghp_qzq70Qy…` | Hanya Anda punya akses GitHub; nilainya pun hanya prefiks terpotong di repo, jadi tak bisa diuji |
| **#30 (i)** | Sama dengan #26 | idem |
| **#30 (ii)** | Revoke token `ghp_` **utuh** (40 karakter, `ghp_WHHjpzY…`) di `netlify_auth_token=nfp_….txt` | Berkas **gitignored** (`.gitignore:40 *nfp_*`) dan `git log --all -S` membuktikan **tak pernah di-commit**. Tetap: kredensial hidup dalam pohon kerja |
| **#28** | Rotasi `SESSION_SECRET` | Kode tak punya fallback ke password admin (S3) ⇒ nilainya kritis |

**Catatan penting:** `.gitignore:19 .workbuddy-ai/` — memori sesi **tidak** ter-commit, jadi
kredensial di dalamnya tak ikut bocor. Tapi token di root repo tetap harus dianggap hidup.

### 7.2 Pondasi yang WAJIB dijaga expert Keamanan

1. **Identitas dari token terverifikasi, BUKAN body.** Peran **server-side**, bukan metadata
   user-writable.
2. **Pemeriksaan object-level** (kepemilikan), bukan cuma peran.
3. **Zod di tepi handler.** Output tak tepercaya di-escape **sebelum** transform HTML.
4. **Tanpa secret/PII di log, storage, atau query string.**
5. **`review-gate.mjs` menjalankan secret scan** sebelum push — jangan dilewati.
6. **Kebocoran token adalah kelas yang BERULANG di proyek ini** (tiga kali). Tiap kredensial baru
   wajib masuk `.gitignore` **dan** diuji `git log --all -S` bahwa ia tak pernah ter-commit.
7. **Fail-closed, bukan fail-open:** health tanpa token ⇒ 401; metrics-receiver tanpa token ⇒ 503.
   Bukan 404 (yang tak terbedakan dari "tak ter-deploy").

---

## 8. ARSITEKTUR / LINT

### 8.1 Yang terbuka

**(a) G-08 — tak ada gate "exported symbol benar-benar dipakai".** Checklist menuntutnya; tak ada
alatnya. Alat dead-code (mis. `knip`) akan menutupnya. Terukur: tak ada `knip`/`ts-prune` di repo.

**(b) A-07 — dua pemeriksa layering bersaing, satu tersambung.** `depcruise` vs `boundary`.
Butuh keputusan mana yang otoritatif.

**(c) 2712 diagnostik lint dibekukan.** Ratchet memastikan **hanya boleh turun**. Sebaran terbesar:
`useTemplate` 768 · `noExplicitAny` 445 · `noNonNullAssertion` 290 · `useOptionalChain` 253.

**(d) G-03 — cakupan diwajibkan checklist, tak diukur apa pun.** `test:coverage` ada, **tanpa
threshold, tanpa job**.

### 8.2 Pondasi yang WAJIB dijaga expert Arsitektur

1. **Tanpa `any` baru. Tanpa cast `as` atau `!` di trust boundary.**
2. **Retry & klasifikasi error membaca field bertipe**, **bukan** regex atas `error.message`.
3. **Ratchet hanya turun.** Baseline beku di `.ci/biome-baseline.json`; jangan pernah dinaikkan
   untuk meloloskan PR.
4. **Batas layering ditegakkan mesin** (`boundary` = `indexer violations`), termasuk aturan
   `surfaces-no-cross-surface`.
5. **Ukuran berkas/PR punya budget** (`bundle:size`, size budget di `review-gate`).
6. **Menamai ulang berkas BUKAN pekerjaan mekanis** di repo ini — grep `index\.ts$` di seluruh
   config & gate, bukan cuma import. Dua gate pernah keyed pada nama berkas literal.
7. **`git log` menyembunyikan utang terbesar; `git status` tidak.**

---

## 9. Garis besar PONDASI yang harus dijaga SEMUA expert

Ini sembilan aturan yang berlaku lintas disiplin. Kalau satu expert hanya menghafal satu bagian,
hafalkan yang ini.

1. **Satu aturan induk:** *"Cacat yang tidak diubah menjadi gate otomatis akan terjadi lagi."*
   Setiap temuan ditutup dengan tepat satu dari: (a) perbaikan kode, (b) tes yang akan
   menangkapnya, (c) gate yang berjalan tanpa diminta. **"Dicatat, nanti hati-hati" bukan
   penutupan.** Dokumen adalah jebakan — begitu pula checkbox.
2. **Ukur, jangan percaya prosa.** Baris "BELUM" di dokumen sering sudah selesai beberapa ronde
   lalu; premis salah bisa bertahan lama. **Termasuk angka commit/posisi.**
3. **Setiap gate wajib dibuktikan bisa GAGAL** — dan buktinya **harus dijalankan ulang**, bukan
   disimpan sebagai angka. Baterai mutasi adalah caranya. **Gate yang belum pernah terlihat gagal
   hanya hipotesis.**
4. **"Ada di disk" ≠ "ter-track git" ≠ "pernah dijalankan".** Tiga tingkat berbeda; hanya yang
   terakhir yang menjamin verdict. CI mem-checkout repo, jadi bukti harus sampai ke checkout —
   **dan** harus benar-benar dieksekusi.
5. **Periksa apakah assertion Anda bisa gagal sama sekali.** Membandingkan dua tepi yang bertemu
   secara konstruksi **tidak bisa gagal**. Klaim cakupan harus diuji **di sumber DAN di-scope ke
   unit tempat klaim dibuat** — "ada di berkas" ≠ "ada di job itu". Dijaga **tautan §25**.
6. **Gate harus mencetak apa yang diukur.** Gate yang hijau tapi tak menyebut cakupannya
   ("58 berkas" vs "berapa sel") menyembunyikan lubangnya sendiri.
7. **Tidak ada pekerjaan belum di-commit** — itu celah nyata. Tapi **jangan push tanpa izin owner**:
   push `main` = deploy produksi. `git add` **per-berkas**, bukan `-A`, karena berkas sesi lain
   sering kotor.
8. **Pratinjau lokal: `npm run serve`.** `astro preview` **tidak bisa** menjawab fungsi. CI memakai
   `astro preview` — itu **sengaja**, supaya smoke/e2e jalan tanpa backend.
9. **Jangan mengubah perilaku diam-diam.** Inkonsistensi yang ditemukan **dilaporkan**, bukan
   diseragamkan tanpa keputusan produk. Perubahan perilaku butuh pengujian sendiri.

---

## 10. Bagaimana memakai dokumen ini untuk memilih expert

| Kalau mau mengerjakan… | Expert-nya | Baca mulai dari |
|---|---|---|
| Baterai mutasi dijalankan CI, gate yatim, cakupan gate | **CI / Gate** | §1 |
| #2 push, paritas, handler, kernel/http | **Backend** | §2 |
| Modal tanpa `useOverlay`, `fetch` mentah, performa panel | **Frontend** | §3 |
| Heading, target sentuh, kontras dua tema, kelas CSS | **UI / Desain** | §4 |
| RLS, proyeksi, migrasi, skema | **Database** | §5 |
| Grafana sink, alert rule, staging, rollback | **OP / Observabilitas** | §6 |
| Revoke/rotasi token, secret scan, fail-closed | **Keamanan** | §7 |
| Ratchet lint, layering, budget, nama berkas | **Arsitektur** | §8 |
| Apa pun — aturan lintas disiplin | **Semua** | §9 |

**Catatan urutan.** Menurut saya yang paling bernilai lebih dulu: **§1.1(a)** — menjalankan baterai
hermetik di CI — karena satu perubahan itu menaikkan **semua** disiplin dari "pernah dibuktikan"
ke "terus dibuktikan". Baru setelah itu pekerjaan per-disiplin.

---

## 11. Verifikasi ulang (perintah yang dipakai)

```bash
# posisi repo (WAJIB, jangan baca prosa)
git ls-remote newrepo refs/heads/main
git rev-list --count a5f9549..HEAD

# gate & cakupan
npm run verify:review-manifest     # 24 gate; 22/22 blocking proven; 0 yatim
npm run verify:io                  # 6 bypass diketahui, semuanya allow-listed
npm run verify:projections         # 0 wildcard / 189 berkas
npm run lint-ratchet               # 2712 dibekukan, hanya boleh turun
npm run verify:md                  # 58 berkas (57 sebelum dokumen ini ditambahkan)
npm run cold:start                 # butuh --url untuk pengukuran nyata

# baterai tidak dijalankan CI — buktikan sendiri
grep -c 'mutations\.sh' .github/workflows/*.yml
```

**Sisa aturan owner:** **JANGAN push tanpa izin.** `newrepo/main` = `a5f9549`; lokal **46 commit
di depan**.

---

## ⚠️ Koreksi 2026-09-18 — tiga klaim di dokumen ini SALAH, dan satu di antaranya berbahaya

Sesi 2026-09-18 masuk untuk membersihkan backlog (41 modified + 21 untracked). Yang ditemukan
bukan utang kosmetik: **HEAD tidak bisa di-build**, dan **perbaikan CI yang dokumen ini catat
sebagai "sudah dikerjakan" tidak pernah masuk commit.**

### (a) `42b2a9b` dan `c201003` TIDAK ADA di repo ini

§1.1(a) menulis: *"Perbaikan: `42b2a9b`. Gate: **`verify:workflows`** (`c201003`)."* Kedua objek
itu tidak dapat dibaca sama sekali:

```bash
git cat-file -t 42b2a9b    # fatal: git cat-file: could not get object info
git cat-file -t c201003    # fatal: git cat-file: could not get object info
```

HEAD **masih memuat bug-nya**. Diukur langsung:

```bash
git show HEAD:.github/workflows/_notify.yml | grep -n "secrets.SLACK_WEBHOOK_URL"
#   81:        if: ${{ secrets.SLACK_WEBHOOK_URL != '' }}
#  105:        if: ${{ secrets.SLACK_WEBHOOK_URL == '' }}
```

Dua baris itu persis yang anotasi GitHub tunjuk. Jadi seluruh uraian §1.1(a) benar sebagai
**diagnosis** dan salah sebagai **status**: perbaikannya hidup di pohon kerja saja, dan push HEAD
akan mengirim bug itu apa adanya.

Gate-nya setengah ter-track dari sisi lain: `package.json` sudah memanggil `verify:workflows`, dan
`provenBy`-nya (`verify-workflows.mutations.sh`) sudah ter-track — tetapi **berkas implementasinya
tidak ada di HEAD**:

```bash
git show HEAD:scripts/ci/verify-workflows.mjs
# fatal: path 'scripts/ci/verify-workflows.mjs' exists on disk, but not in 'HEAD'
```

Jadi gate itu pun tidak bisa jalan di checkout bersih. **Keduanya sudah di-commit (`7c2d0b8`).**
Ini kelas `C2b` yang **kambuh**: `C2b` hanya memeriksa `provenBy`, tidak pernah memeriksa berkas
implementasi gate itu sendiri.

**Aturan yang lahir dari sini:** klaim "sudah di-commit" wajib diuji dengan
`git cat-file -t <hash>` atau `git show HEAD:<path>`. Prosa tidak pernah cukup.

### (b) HEAD TIDAK BISA DI-BUILD — dan semua gate lokal hijau

`src/components/candidate/CandidateDash.tsx` **sudah ter-commit** dan mengimpor
`../../lib/profileProgress`, sementara berkas itu **tidak ada di HEAD**:

```bash
git show HEAD:src/components/candidate/CandidateDash.tsx | grep profileProgress
#   23: import { computeCvMiniProgress, ... } from '../../lib/profileProgress';
git show HEAD:src/lib/profileProgress.ts
# fatal: path exists on disk, but not in 'HEAD'
```

Checkout bersih gagal me-resolve impor itu. `npm run typecheck`, `npm test`, dan seluruh gate
**hijau**, karena di pohon kerja berkasnya ada. Hanya checkout bersih — atau CI — yang bisa
melihatnya, dan CI belum pernah mengeksekusi satu job pun.

**Konsekuensi metodologis yang penting:** selama pohon kerja kotor, "tes hijau" adalah pernyataan
tentang **pohon kerja**, bukan tentang commit. Commit lebih dulu, lalu ukur ulang. Diperbaiki:
`7d2b34a`.

### (c) Ratchet indexer MERAH di HEAD (phantom)

`discover.test.ts` menuntut `ts=247` dan `build.test.ts` `fileCount=415`. Diukur dengan
menjalankan `discoverFiles()` atas **pohon HEAD** (`git archive HEAD | tar -x` ke direktori temp):

**ts=248, tsx=86, astro=12, mjs=46, cjs=5, js=19 = 416.**

Selisih satu berkas adalah `netlify/functions/_lib/db/candidates.test.ts`, ditambahkan sesudah
`e354e35` tanpa pernah menaikkan hitungannya:

```bash
git diff --diff-filter=AD --name-status e354e35 HEAD -- '*.ts'
# A  netlify/functions/_lib/db/candidates.test.ts      <- satu-satunya
```

Berkas itu juga penyebab `typecheck:ratchet` merah (TS7006 di baris 102). Nilai benar sesudah
seluruh pekerjaan menggantung masuk: **251 ts + 87 tsx + 13 astro + 51 mjs + 5 cjs + 19 js = 426**,
dan keempat asersi bergerak bersama. Diperbaiki: `490b74b`, `2bc113c`.

Dokumen ini juga menunjuk alat `indexer/src/count-indexed.test.ts` yang **tidak pernah ada** —
komentar menyuruh membaca angka dari berkas yang tidak ditulis, dan itulah sebab angka turunan lolos
sebagai angka terukur. Berkasnya kini ada (`490b74b`).

### (d) Status sesudah 2026-09-18

| | Sebelum | Sesudah |
|---|---|---|
| Modified + untracked | 41 + 21 | **0 + 0** |
| Gate hermetik hijau | 12 dari 13 | **13 dari 13** |
| `typecheck:ratchet` | MERAH (1 error) | hijau |
| Ratchet indexer | MERAH (2 asersi) | hijau |
| HEAD bisa di-build | **tidak** | ya |

16 commit lokal, **belum di-push** (aturan owner). Yang **belum** punya verdict bersih:
`vitest run` penuh dan `verify:batteries` — keduanya butuh turn tanpa kuota hapus yang sudah
terpakai; lihat `.workbuddy-ai/memory/2026-09-18.md`. Suite penuh sempat hijau 1.655 tes sebelum
kuota habis; sesudahnya 148/149 berkas hijau dengan satu berkas (`fcm-server.test.ts`) gagal
**hanya** karena `SAFE_DELETE_BULK_CONFIRM_REQUIRED` di `unpark()`-nya.

