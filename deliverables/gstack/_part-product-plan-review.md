# PLAN REVIEW — dampak keputusan pemilik 2026-09-25 terhadap rencana landing page

**Reviewer:** product-reviewer (GStack) · **Tanggal:** 2026-09-25
**HEAD terukur:** `7422bce` · **`git rev-list --count origin/main..HEAD` = 2** · pohon bersih
**Basis:** baca-saja. Tidak ada berkas di `src/`, `netlify/`, `e2e/`, `scripts/`, `docs/` yang disentuh.

> **Catatan integritas sitasi.** Lima hash yang dikutip sebagai *basis ukur* di dokumen rencana
> **tidak ada di object DB ini**. Diperiksa dengan `git cat-file -t`, bukan diasumsikan:
>
> | Hash | Dikutip di | `git cat-file -t` |
> |---|---|---|
> | `41e64cc` | `LANDING_PAGE_ROADMAP.md:3`, `LANDING_PAGE_SPEC.md:4` | `Not a valid object name` |
> | `238748c` | `LANDING_PAGE_ROADMAP.md:75` | `Not a valid object name` |
> | `1e9f6fb` | `LANDING_PAGE_ROADMAP.md:334,342,344,357,363-370` | `Not a valid object name` |
> | `e9317cf` | `LANDING_PAGE_ROADMAP.md:282`, `LANDING_PAGE_SPEC.md:270,284` | `Not a valid object name` |
> | `3c12e51` | `LANDING_PAGE_ROADMAP.md:276,370` | `Not a valid object name` |
>
> Artinya **seluruh angka "terukur di `<hash>`" di `LANDING_PAGE_ROADMAP.md` §L8.5 (baris 357-370)
> tidak bisa diverifikasi ulang** — gate itu memang hijau pada suatu pohon, tapi pohon itu tidak
> ada lagi. Ini bukan alasan membatalkan rencana; ini alasan **tidak mengutip angka-angka itu
> sebagai fakta** dan mengukurnya ulang di HEAD kalau mau dipakai. (`866f6b2` **ada** sebagai commit.)

---

## (a) Apa yang rencana katakan hari ini

### A1. `docs/LANDING_PAGE_ROADMAP.md` — rencana fase

| Baris | Isi | Status lawan kode hari ini |
|---|---|---|
| `:21-34` | Ringkasan keputusan L0–L8 | L0/L1/L2 ✅, L3 🟡, L4 sebagian, **L5/L6/L7/L8 belum** |
| `:26-28` | L0 paritas tab · L1 fondasi · L2 kerangka (hero, **strip statistik**, tab→anchor) | L2 sudah jalan; **"strip statistik"** yang dimaksud = strip lowongan (lihat A2) |
| `:38-40` | "`/` adalah `index.astro` + `App` + `LokerTable` + `LayananSection`" | **BASI** — `LokerTable` pindah ke `/loker`; `/` kini 15 section profil |
| `:41-48` | `:149-171` §2.3: nav desktop **harus masuk `<nav>` yang sudah ada** | **DIBANTAH** oleh `LANDING_PAGE_SPEC.md:543-563` — geometri drawer mustahil; `SiteNav.astro` jadi nav kedua |
| `:149-171` | Jebakan selektor `querySelector` satu label (`test-drawer.mjs:71`) | Masih valid; lubang sudah ditutup asersi jumlah = 1 |
| `:213-226` | L2.3 "Strip statistik dari data nyata"; L2.5 nav di dalam nav lama | L2.3 dikerjakan sebagai strip lowongan terpisah; L2.5 dibatalkan sadar |
| `:276-306` | L5.5: tabel loker **dipertahankan**; gate `e2e:loker-layout` dipindah ke `/loker` | Sesuai kode; `JobCard` belum ada |
| `:308-320` | L6 rail kanan + L7 bottom nav tamu | **L6 dibatalkan** (pemilik 2026-09-24); L7 belum |
| `:322-403` | L8 gate `e2e:test-landing.mjs` + barrel | Gate **ada dan terpasang di CI** (`.github/workflows/ci.yml:264`) |
| `:407-423` | §4 angka: jumlah lowongan dihitung dari `jobs`; 500+/200+/50+ **butuh pemilik** | Sesuai `COMPANY_PROFILE_DATA.md` §13 |
| `:427-447` | §5 urutan + definisi selesai | **Definisi selesai TIDAK memuat `e2e:landing`** — lihat risiko R5 |
| `:460-486` | §7 arah ilustrasi anime = fase L9 terpisah | Belum; di luar lingkup |

### A2. `docs/LANDING_PAGE_SPEC.md` — spesifikasi halaman

| Baris | Isi | Status |
|---|---|---|
| `:27` | **D1** satu halaman panjang + anchor (bukan 6 tab, bukan `/profil`) | Dipatuhi |
| `:29` | **D3** nav desktop di dalam `<nav>` lama | **Dibatalkan** oleh `§5.1:543-563` |
| `:30`,`:32` | **D4/D6** rail kanan **DIHAPUS** (pemilik 2026-09-24) | Sudah; tapi `DESIGN.md` masih memuat rail (lihat C4) |
| `:47-69` | Peta section S1..S12 + R1..R5 | S3 → rute `/loker`; R2 dihapus; rail dihapus |
| `:80` | "`/` menyisakan **tepat satu** tautan ke `/loker` (nav section)" | **INI YANG DIHAPUS OLEH KEPUTUSAN BARU** — lihat C1 |
| `:184-218` | **S1 Hero**: strip lowongan `N lowongan aktif` + tautan `#loker`; tinggi 28/32 rem; bento 2×2 | Strip lowongan dirender **di luar hero** (`index.astro:129-142`), tanpa tautan; tinggi hero nyata `min-h-[26rem] md:min-h-[32rem]` (`App.tsx:298`) — spec bilang 28rem |
| `:190`,`:217` | Kriteria terima: "Strip lowongan menampilkan angka yang sama dengan jumlah baris di `#loker`" | **Dibatalkan** oleh keputusan baru (strip dihapus) |
| `:267-306` | **S3** Lowongan → rute `/loker`; `e2e:test-landing` menjaga **keterjangkauan** | Gate-nya ada (`test-landing.mjs:172-225`) |
| `:286` | "nav section `/` wajib menautkan ke `/loker` — **satu-satunya** tautan" | **INI YANG DIHAPUS** |
| `:508-537` | §4 rail R1..R5 → section biasa; `aside` dihapus | Sesuai kode |
| `:543-575` | §5.1 nav baris atas = **`<nav>` kedua**, `aria-label="Navigasi halaman"`, `hidden lg:block`, item Lowongan/Program/Alur/Fasilitas/Tentang/Layanan + Login Pelamar | **INI YANG DIHAPUS** |
| `:577-599` | §5.2 peta anchor; `#loker` "sudah tidak ada di `/`" | Sesuai |
| `:671-691` | §9 P-1..P-7 menunggu pemilik + K-2/K-10 | Sesuai `COMPANY_PROFILE_DATA.md:415-431` |
| `:695-709` | §10 urutan L0..L8 | Sama dengan roadmap |

### A3. `docs/COMPANY_PROFILE_DATA.md`

- `:415-431` §13: **P-1..P-7 masih menunggu pemilik** (jumlah kandidat, keberangkatan, mitra,
  jam operasional, tinggi badan wanita, status TikTok, izin tayang foto). Aturan "jangan mengarang
  nilai" **tidak berubah** oleh keputusan baru.
- `:429-431` "Satu hal yang tidak perlu ditanyakan lagi": harga 6 juta, 5 bidang, 4 prefektur,
  6 langkah, 8 syarat, 4 cakupan — **terverifikasi, boleh dipakai**.

### A4. `DESIGN.md` (dokumen sistem desain yang akan "dibangun")

Memuat **empat bagian yang sudah basi** terhadap kode hari ini — dan inilah alasan sesi ini tidak
cukup "menambah token", harus **merekonsiliasi**:

| Baris | Isi | Kenyataan |
|---|---|---|
| `:490-491` | `lg` "rail mulai tampil"; `xl` "rail kanan penuh" | Rail **dihapus** (pemilik 2026-09-24) |
| `:515` | Whitelist bento: "Statistik \| bento 2×2 **di dalam hero**" | Hero kini strip **3** ubin (`HERO_STATS`, `App.tsx:84-88`), bukan 2×2 |
| `:532-553` | §4.3 **Rail kanan** lengkap dengan `<aside class="rail">` | Rail + grid-nya dihapus (`index.astro:166-172`) |
| `:619`,`:621` | `TestimonialCard`, `RailCard` | Tidak ada konsumen |
| `:626-644` | §5.5 `JobCard` | Belum dibangun (roadmap L5.5) |
| `:646-661` | §5.6 `AnchorTabs`, target `#loker` `#program` `#layanan` `#tentang` `#proses` `#kontak` | `#loker` bukan anchor di `/`; `#proses` tidak ada (yang ada `#alur`) |
| `:663-671` | §5.7 `StepList`: "Daftar → Lengkapi Profil → Pilih Lowongan → Seleksi → Pemberkasan → Berangkat" | Alur nyata (`FLOW_STEPS`) = Registration → Training → Interview → Employment Document → Document Preparing → GO TO JAPAN (`COMPANY_PROFILE_DATA.md:235-242`) |
| `:679-693` | §5.9 `BottomNav` versi tamu 4 tombol | Belum ada; `BottomNav.tsx:19` masih menolak tamu |
| `:835-844` | §8.3 urutan L0..L8 | Konsisten dengan roadmap |

### A5. `TODO.md` / `HANDOFF.md`

- `TODO.md:16-31`: daftar non-backend (dark mode diuji menyeluruh, audit mobile, audit WCAG,
  skeleton, Cloudinary, Lighthouse, analytics). **Tidak satu pun menyebut landing page** — file ini
  bukan rencana `/`.
- `HANDOFF.md` **historis** (`:1` "✅ SELESAI, historis"): batas 4 KB env, sudah selesai. Tidak relevan.

### A6. `docs/UI_DESIGN_REVIEW.md`

Ada, 4273 baris. Dirujuk rencana untuk §21 (kelas yang hanya *kelihatan* seperti kelas) dan
§23 (heading). Relevan sebagai **katalog jebakan**, bukan sebagai rencana kerja.

---

## (b) Apa yang keputusan baru ubah, section demi section

### Keputusan baru (2026-09-25), verbatim dari brief

| Kode | Keputusan |
|---|---|
| **R-A** | **Hapus SELURUH band di bawah hero** pada `/` — strip `158 lowongan aktif` **dan** `SiteNav` |
| **R-B** | Kerjakan semuanya **satu sesi** (4 perbaikan cacat + bangun sistem desain), bukan rencana-saja |
| **R-C** | Profil kandidat harus seperti legacy **"ASJ DOSSIER / VERIFIED CANDIDATE"** |
| **R-D** | "Update Profil" sudah ganti; **template CV itu fitur ADMIN, bukan untuk kandidat** |

### R-A — hapus seluruh band di bawah hero

**Yang persisnya terhapus** (urutan DOM, `src/pages/index.astro`):

| Baris | Elemen | Ikut terhapus? |
|---|---|---|
| `:102-117` | Marquee pengumuman `#global-announcement` | **AMBIGU** — lihat D1 |
| `:129-142` | Strip jumlah lowongan (`#live-job-count`) + `<Icon briefcase>` | **ya** |
| `:144-159` | `<script>` `getPublicData()` pengisi marquee + count | **sebagian** — lihat C3 |
| `:161-164` | `<SiteNav />` | **ya** |

**Section yang jadi basi** (wajib diperbarui di commit yang sama):

| Berkas | Baris | Kenapa basi |
|---|---|---|
| `index.astro` | `:119-140` | Komentar "WHY IT IS HERE AND NOT INSIDE THE HERO" + "The live count **stays**" + "the only path … is the section nav" |
| `index.astro` | `:161-163` | Komentar "Desktop section nav. Rendered AFTER the hero band…" |
| `LANDING_PAGE_SPEC.md` | `:80`, `:184-218` (S1), `:286`, `:543-575` (§5.1) | Strip lowongan + "tepat satu tautan di nav" + seluruh §5.1 |
| `LANDING_PAGE_ROADMAP.md` | `:26-28`, `:213-226` (L2.3/L2.5), `:308-320` (L6) | Strip statistik & nav baris atas |
| `DESIGN.md` | `:532-553` (§4.3), `:619`,`:621`, `:646-661` (§5.6) | Rail + RailCard/TestimonialCard + AnchorTabs |
| `e2e/test-landing.mjs` | `:172-225` (LOKER_ROUTE) | **MERAH** — lihat C1 |
| `e2e/test-landing.mutations.sh` | `:119` (`NAV=src/components/public/SiteNav.astro`) | Baterai mutasi kehilangan target |
| `e2e/test-site-nav.mjs` | `:133` (`EXPECTED_IDS`), `:154`,`:198` (`[data-site-nav]`) | **MERAH KERAS** — lihat C1 |
| `e2e/measure-site-nav.mjs` | `:34`,`:71` | Alat bukti kehilangan objek (bukan gate) |

**Item yang di-*unblock*** oleh R-A (tidak lagi terhalang):

- L2.4 "tab → anchor" tidak lagi relevan untuk nav baris atas (nav-nya hilang); anchor section
  tetap ada di `index.astro` dan tetap bisa ditautkan dari footer/closing band.
- L4 "nav baris atas: item, penanda aktif, bahasa, login" **batal seluruhnya** — tidak ada lagi
  permukaan nav desktop di `/`. Yang tersisa: drawer (`App.tsx:606`, `aria-label="Primary navigation"`).
- L6 (rail) sudah batal 2026-09-24; R-A menutup sisa ambiguitas tata letak kolom.
- **Membuka satu pekerjaan baru yang belum ada di rencana**: memutuskan **di mana** — kalau di mana pun
  — tautan `/loker` tinggal di `/`. Lihat D2.

**Item yang di-*invalidate*** oleh R-A:

- Kriteria terima `LANDING_PAGE_SPEC.md:217` ("strip lowongan menampilkan angka yang sama dengan
  jumlah baris di `#loker`") — objeknya dihapus.
- Kriteria terima `LANDING_PAGE_SPEC.md:286` dan `e2e/test-landing.mjs:222` ("the page nav is now
  the ONLY path to the list") — jalur itu dihapus.
- `LANDING_PAGE_ROADMAP.md:213-226` L2.5 + `LANDING_PAGE_SPEC.md:543-575` §5.1 — permukaannya hilang.

### R-C / R-D — di luar cakupan dokumen rencana yang ada

Kedua keputusan ini menyasar **`/candidate` dan admin**, sedangkan `LANDING_PAGE_ROADMAP.md` /
`LANDING_PAGE_SPEC.md` **hanya** membahas `/`. Jadi:

- **R-C** ("profil seperti ASJ DOSSIER / VERIFIED CANDIDATE"): string `ASJ DOSSIER` **sudah ada**
  sebagai `master.form_brand` (`i18n.ts:1749`, `i18n-jp.ts:1605`) dan dipakai `MasterFullForm`
  (`/master`). Yang owner minta adalah **kartu profil kandidat** mengambil bentuk legacy itu.
  Komponen terkait: `CandidateDash.tsx` (profil kandidat) vs `CandidateProfileModal.tsx` /
  `ListKandidatModal.tsx` (admin, sudah memuat "DOSSIER"). **Tidak ada satu baris pun di rencana
  yang membahas ini** — jadi R-C adalah pekerjaan tanpa spec, bukan pekerjaan yang "tinggal dikerjakan".
- **R-D** (template CV = fitur admin): **terverifikasi di kode**. `CvTemplateSelector` dirender
  **dua kali** dengan flag berbeda:
  - `CandidateDash.tsx:654` → `isAdmin={false}` + tombol `:534` (`button.pilih_template_cv`) — **kandidat**
  - `TabPelamar.tsx:261` → `isAdmin={true}` + tombol `:233` — **admin**
  Yang diminta owner = hapus jalur kandidat (`:534` + `:654`), pertahankan jalur admin (`:233` + `:261`).
  Catatan: `CvTemplateSelector.test.tsx` + `CvMiniModal.test.tsx` menyentuh jalur ini.
- "Update Profil sudah ganti": `CvMiniModal` (`ui.update_cv_mini` = "Update Profil",
  `CandidateDash.tsx:528`) dan tombol `button.profil` (`:458`) masih ada. Perlu **dikonfirmasi
  maksud owner**: apakah "sudah ganti" berarti *sudah pernah saya kerjakan* (maka tidak ada yang
  perlu diubah) atau *harus diganti* (maka ada pekerjaan). Ini tidak bisa disimpulkan dari repo.

---

## (c) Kontradiksi & risiko, diberi peringkat

### C1 — 🔴 **R-A menghapus SATU-SATUNYA tautan ke `/loker`, dan gate yang menjaganya ada di CI**

**Terukur, bukan disimpulkan.** `grep` se-repo untuk `href="/loker"` di `src/` menemukan **tepat
satu** hasil:

```
src/components/public/SiteNav.astro:105   <a href="/loker" … >Lowongan</a>
```

Semua jalur lain **sudah dihapus** oleh keputusan 2026-09-24 dan dikonfirmasi di kode:

| Kandidat jalur | Status |
|---|---|
| Hero CTA | dihapus (`App.tsx:504-508` — komentar eksplisit "NO Lihat Lowongan CTA HERE") |
| Closing band | dihapus (`ClosingBand.astro:35-46`) |
| Footer nav | **tidak pernah ada** — hanya Program/Alur/Fasilitas/Tentang (`Footer.astro:97-100`) |
| Drawer (`aria-label="Primary navigation"`) | **tidak ada item `/loker`** (`App.tsx:620-641`: install, bahasa, login, register, admin, public, candidate, logout) |
| BottomNav | menolak tamu (`BottomNav.tsx:19`) |

**Konsekuensi berantai, semuanya terverifikasi:**

1. Setelah R-A, `/` punya **NOL tautan ke `/loker`**. Daftar lowongan tidak bisa dicapai dari `/`
   dengan cara apa pun di dalam halaman.
2. `e2e/test-landing.mjs:195-224` `LOKER_ROUTE.regions` mengasersikan
   `nav[aria-label="Navigasi halaman"] a[href="/loker"]` **non-kosong**, dengan alasan tertulis
   `:222` = *"the page nav is now the ONLY path to the list — if it breaks, nothing on / can reach
   the vacancy list"*. Hapus `SiteNav` ⇒ selector cocok **0** ⇒ **gate MERAH**.
3. Gate itu **terpasang di CI**: `.github/workflows/ci.yml:264` menjalankan `npm run e2e:landing`.
   ⇒ **CI merah ⇒ deploy produksi terblokir.**
4. `e2e/test-site-nav.mjs:154,198` mewajibkan `[data-site-nav]` ada di dokumen; `:133`
   `EXPECTED_IDS = ['layanan','program','alur','fasilitas','tentang']` dan `:224-229` menolak
   *missing* **dan** *extra*. Hapus `SiteNav` ⇒ `[data-site-nav]` = `null` ⇒ **gate gagal keras**.
   (Catatan: `e2e:site-nav` **tidak** ada di `ci.yml` — hanya di `package.json:31` — jadi merahnya
   tidak memblokir deploy, tapi tetap merah.)
5. `e2e/test-landing.mutations.sh:119` memutasi `src/components/public/SiteNav.astro`; baterai
   kehilangan target dan harus ditulis ulang.

**Jawaban atas pertanyaan brief — apakah R-A konsisten dengan "tepat SATU tautan ke `/loker`, di
nav"?** **TIDAK.** Kedua keputusan saling meniadakan: yang dimaksud "nav" pada keputusan 2026-09-24
adalah **persis** `SiteNav` yang sekarang diminta dihapus. Ini **keputusan owner, bukan detail
implementasi** — saya tidak mengasumsikan jawabannya (lihat D2).

### C2 — 🟠 Komentar kode mengklaim "satu-satunya sinyal kepercayaan", dan klaim itu terlalu kuat

`index.astro:136-140` menulis *"The live count stays: it is a real number … and a trust signal"*,
dan `:120-125` menyebutnya *"the cheapest trust signal available"*. Membaca "satu-satunya" lalu
menghapusnya akan terasa seperti membuang bukti terakhir. **Itu keliru.** `/` masih punya sinyal
kepercayaan yang **bisa diperiksa**, dan yang lebih kuat karena bisa ditautkan:

- `#legalitas` — 6 baris nomor resmi (AHU-0063921…, akta No. 09, NIB) dari `COMPANY_PROFILE_DATA.md` §2
- `#tim` — **JLPT N1** atas nama Hadi Prasojo, sertifikat N1A225127J (kredensial level tertinggi)
- `#penempatan` — 4 prefektur nyata (Miyazaki · Okayama · Nagano · Kagoshima)

Jadi R-A menghapus **satu-satunya angka *live/kuantitatif***, bukan satu-satunya bukti. Klaim
komentar harus dikoreksi, dan **kekhawatiran "kehilangan trust signal" tidak boleh dipakai sebagai
alasan menahan R-A** — itu argumen yang lemah secara terukur.

### C3 — 🟠 `<script>` `getPublicData()` punya dua tugas; hanya satu yang mati

`index.astro:144-159` melakukan **dua** hal: mengisi marquee pengumuman (`:148-155`) **dan**
mengisi count (`:156-157`). Hapus strip count saja ⇒ cabang `count` mati (dijaga `if(count && …)`,
jadi tidak error) tapi script **harus tetap ada** selama marquee ada. Hapus marquee juga ⇒
seluruh script + impor `getPublicData` bisa dibuang. **Ini bergantung pada D1.**

Kunci i18n yang jadi yatim dan **wajib dihapus manual dari KEDUA kamus** (karena
`i18n.keys.test.ts` hanya memeriksa *used→present*, bukan *present→used*):
`profile.hero_jobs_live` (`i18n.ts:1106`, `i18n-jp.ts:790`) · `profile.nav_aria` (`i18n.ts:1357`)
· `profile.nav_loker` (`:1358`) · `profile.nav_program` · `profile.nav_alur` · `profile.nav_fasilitas`
· `profile.nav_tentang` · `profile.nav_layanan` (`:1367`).

### C4 — 🟠 "Bangun sistem desain" ≠ "tambah token"; `DESIGN.md` sendiri sudah tidak sinkron

R-B meminta sistem desain **dibangun** dalam sesi yang sama. Tapi `DESIGN.md` (883 baris, 10 bagian)
sudah ada dan **memuat minimal 4 blok basi** (A4): rail (§4.3), `AnchorTabs` dengan target mati
(§5.6), `StepList` dengan 6 langkah yang **berbeda dari alur resmi** (§5.7), dan whitelist bento
yang menyebut statistik 2×2 (§4.2). Kalau "membangun sistem desain" dikerjakan tanpa merekonsiliasi
ini, hasilnya menambah lapisan **di atas** dokumen yang salah — persis pola yang repo ini sudah
dokumentasikan sebagai kesalahan berulang ("dokumen menjanjikan keadaan yang tidak ada").

**Yang paling berbahaya: `DESIGN.md:663-671` §5.7.** Ia menyebut alur 6 langkah *"Daftar → Lengkapi
Profil → Pilih Lowongan → Seleksi → Pemberkasan → Berangkat"*, sedangkan alur **resmi** yang sudah
diverifikasi (`COMPANY_PROFILE_DATA.md:235-242`, dipakai `FLOW_STEPS`) adalah
*Registration → Training & Education → Interview → Employment Document → Document Preparing → GO TO
JAPAN*. Sistem desain yang "dibangun" dari §5.7 akan **mengubah alur resmi perusahaan** — klaim
publik, bukan hiasan.

### C5 — 🟡 Definisi selesai tidak memuat `e2e:landing`, padahal gate itu ada di CI

`LANDING_PAGE_ROADMAP.md:427-447` §5 dan `DESIGN.md:841-844` §8.3 menyebut `tsc`, `vitest`,
`lint-ratchet`, `build` — **tidak** `e2e:landing`. Padahal `.github/workflows/ci.yml:264`
menjalankannya. Sesi 2026-09-24 sudah sekali menemukan `e2e:landing` **merah tanpa tercatat** karena
lubang ini. R-A **pasti** memerahkannya ⇒ kalau definisi selesai tidak diperbarui, sesi ini akan
"hijau" di dokumen sambil memblokir deploy.

### C6 — 🟡 Cacat drawer adalah prasyarat implisit, bukan item terpisah

Owner melaporkan *"kok gini kayak rusak kalo buka menu hamburger"* (screenshot drawer terbuka).
Ini tugas investigator (task #2), tapi **berinteraksi dengan R-A**: setelah `SiteNav` dihapus,
drawer (`App.tsx:606`) menjadi **satu-satunya permukaan navigasi** di `/` pada **semua** viewport.
Drawer yang rusak + tidak punya tautan `/loker` = halaman tanpa navigasi apa pun. Urutan
**perbaiki drawer dulu, hapus band kemudian** — kalau dibalik, ada jendela di mana `/` tidak punya
navigasi yang berfungsi.

### C7 — 🟡 Sisa pekerjaan yang belum pernah selesai, masih terbuka

Dari memori sesi 2026-09-24 (`Sesi 3`, "Yang BELUM selesai") dan `LANDING_PAGE_ROADMAP.md:322-403`:
jarak antar-target `gap-1` = 4px vs `DESIGN.md:751` ≥8px; uji sensitivitas instrumen kontras belum
dijalankan; L5 (kartu loker) belum ada; L7 (bottom nav tamu) belum ada; L8.5 barrel belum diukur di
HEAD `7422bce`. Ini **bukan** bagian R-A, tapi masuk sesi yang sama menurut R-B — anggaran sesi
harus sadar bahwa ini ada.

---

## (d) Keputusan yang dibutuhkan dari owner

**D1 — Apakah marquee pengumuman `#global-announcement` ikut terhapus?**
Band di bawah hero berisi tiga elemen, bukan dua: marquee (`index.astro:102-117`), strip count
(`:129-142`), nav (`:164`). Screenshot owner melingkari **dua yang terakhir**. "Seluruh band" bisa
berarti tiga. Marquee adalah **kanal pengumuman admin** — menghapusnya mematikan pengumuman di `/`.
→ *Hapus dua yang dilingkari, pertahankan marquee? Atau hapus ketiganya?*

**D2 — Kalau band dihapus, dari mana pengunjung `/` bisa mencapai `/loker`?** (yang paling penting)
Opsi, dengan konsekuensinya:

| Opsi | Konsekuensi |
|---|---|
| **A. Tidak sama sekali** — `/loker` hanya via URL langsung/sitemap | `/` jadi profil B2B murni; **`e2e:landing` LOKER_ROUTE harus diubah** (aturan dihapus, bukan dilonggarkan) — dan itu berarti **tidak ada gate yang menjamin daftar lowongan bisa dicapai dari mana pun** |
| **B. Satu tautan teks di footer** (mis. di kolom "Navigasi") | Melanggar huruf keputusan 2026-09-24 ("di nav") tapi memenuhi maksudnya; footer sudah punya nav `aria-label="Footer navigation"` |
| **C. Satu tautan di hero** | Mengembalikan CTA hero yang baru saja dihapus |
| **D. Pertahankan nav baris atas TANPA item Lowongan** | Kontradiksi langsung dengan R-A (owner minta nav dihapus) |

→ *Pilih satu. Tanpa jawaban, pekerjaan tidak bisa "hijau" — gate CI akan merah atau aturannya dilonggarkan tanpa dasar.*

**D3 — "Update Profil sudah ganti": sudah dikerjakan, atau harus dikerjakan?**
`CvMiniModal` ("Update Profil", `CandidateDash.tsx:528`) dan tombol profil (`:458`) masih ada. Repo
tidak bisa memberi tahu apakah owner menganggap ini beres atau belum.

**D4 — Profil "ASJ DOSSIER / VERIFIED CANDIDATE": komponen mana yang dimaksud?**
Profil **kandidat** (`CandidateDash.tsx`) atau modal admin (`CandidateProfileModal.tsx`, yang sudah
memuat string DOSSIER)? Dan apakah bentuknya = kartu ringkas (nama, status verifikasi, kelengkapan)
atau seluruh isi master?

**D5 — Template CV: konfirmasi bahwa yang dihapus hanya jalur kandidat.**
`CandidateDash.tsx:534` + `:654` (`isAdmin={false}`) dihapus; `TabPelamar.tsx:233` + `:261`
(`isAdmin={true}`) **tetap**. Perlu konfirmasi bahwa admin tetap memegang fitur ini — kalau tidak,
`CvTemplateSelector` kehilangan satu-satunya konsumen.

**D6 — P-1..P-7 tetap ditahan?**
Keputusan baru tidak menyebut angka. Saya asumsikan **ya** (aturan `COMPANY_PROFILE_DATA.md:415-431`
tidak berubah): jangan mengarang jumlah kandidat/keberangkatan/mitra, jam operasional, tinggi badan
wanita, status TikTok, atau izin tayang foto. **Konfirmasi agar tidak ada yang "mengisi" ubin hero
dengan 500+/200+/50+.**

---

## (e) Urutan yang direkomendasikan

**Prinsip yang dipakai:** *perbaiki yang bisa gagal lebih dulu, jangan hapus gate sebelum tahu apa
yang menggantikannya, dan jangan pernah mengubah klaim publik untuk mengejar tampilan.*

| # | Langkah | Kenapa di sini | Gate yang tersentuh |
|---|---|---|---|
| **1** | **Jawab D1, D2 lebih dulu** (blocking) | D2 menentukan apakah aturan `LOKER_ROUTE` **diubah** atau **dihapus**; D1 menentukan apakah `getPublicData` masih dipakai. Salah tebak ⇒ tulis ulang dua kali | — |
| **2** | **Perbaiki cacat drawer** (task #2, investigator) | Drawer jadi satu-satunya nav `/` setelah langkah 4. Kalau dibalik, ada jendela `/` tanpa navigasi | `e2e:drawer`, `e2e:dialog` |
| **3** | **Perbarui gate LEBIH DULU, lalu markup** | `test-landing.mjs:172-225` LOKER_ROUTE + `test-site-nav.mjs:133` `EXPECTED_IDS` + `test-landing.mutations.sh:119` diubah **dalam commit yang sama** dengan penghapusan `SiteNav`. Gate yang dihapus **wajib diberi tahu alasannya tertulis** (repo ini menolak aturan yang hilang tanpa pengganti) | `e2e:landing` (**CI**), `e2e:site-nav`, baterai `test-landing.mutations.sh` |
| **4** | **Hapus band** (`index.astro:129-142` + `:161-164` + `SiteNav.astro`) + kunci i18n yatim di **kedua** kamus + perbarui komentar `:119-140` | Setelah gate siap. Commit per berkas | `verify:classes` (hapus pemakaian kelas **tanpa menulis namanya di komentar** — `DESIGN.md:825-827`), `i18n.keys`, inventaris beku indexer (`astro` −1) |
| **5** | **Sinkronkan dokumen** (`SPEC:80,184-218,286,543-575`; `ROADMAP:26-28,213-226,308-320`; `DESIGN:490-491,515,532-553,619,621,646-661`) | Dokumen yang menggambarkan halaman yang sudah tidak ada adalah jebakan berikutnya | `verify:md` |
| **6** | **Rekonsiliasi `DESIGN.md` §5.7 `StepList` dengan alur resmi** | **Klaim publik.** Alur 6 langkah di DESIGN.md berbeda dari `COMPANY_PROFILE_DATA.md:235-242`. Jangan bangun sistem desain di atas alur yang salah | `verify:md`, `companyProfile.test.ts` |
| **7** | **Bangun sistem desain** dari `DESIGN.md` yang sudah direkonsiliasi | Setelah dokumennya benar | `bundle:size`, `verify:classes`, `lint-ratchet` |
| **8** | **R-D** (hapus template CV jalur kandidat) | Independen, kecil, jelas (`CandidateDash.tsx:534,654`) | `CvTemplateSelector.test.tsx`, `CvMiniModal.test.tsx` |
| **9** | **R-C** (kartu profil ASJ Dossier) — **hanya setelah D4 dijawab** | Tanpa D4 ini menebak; pekerjaan tanpa spec | — |
| **10** | **Perbarui definisi selesai** agar memuat `e2e:landing` | Menutup C5 — sekali ini merah tanpa tercatat | — |

**Yang saya rekomendasikan DITOLAK:**

- **Melonggarkan `LOKER_ROUTE` tanpa menggantinya.** Menghapus aturan itu tanpa pengganti berarti
  tidak ada apa pun yang menjaga bahwa daftar lowongan bisa dicapai. Kalau D2 = opsi A, aturannya
  harus **dihapus dengan alasan tertulis di berkas gate**, bukan dilonggarkan jadi `count >= 0`.
- **Mengisi ubin hero dengan 500+/200+/50+** untuk "mengganti" strip yang dihapus. Itu mengubah
  penghapusan menjadi klaim hukum palsu (`COMPANY_PROFILE_DATA.md:408-411`).
- **Mengubah `DESIGN.md` §5.7 mengikuti sistem desain** alih-alih mengikuti alur resmi. Arahnya
  harus satu arah: dokumen mengejar dokumen resmi, bukan sebaliknya.
- **Menyentuh `indexer/src/{discover,build,parse}.test.ts`** untuk menyerap `astro` −1; hanya
  team-lead yang boleh, dan pergeserannya harus diukur satu per satu (bukan diinfer).
- **`git add -A` / `git rm` / push.** Aturan repo tetap: hapus `SiteNav.astro` dengan
  `unlinkSync` + `git add <path>`.

**Yang saya rekomendasikan DITUNDA:**

- L5 (kartu loker), L7 (bottom nav tamu), L9 (ilustrasi anime) — tidak berhubungan dengan R-A dan
  tidak boleh diselipkan ke tengahnya (`ROADMAP:460-486` sudah melarang untuk L9).
- `e2e:landing` barrel ulang di HEAD — ukur setelah langkah 4-5, jangan sebelum.

---

## Ringkasan satu paragraf

Rencana hari ini sudah **sebagian besar konsisten dengan keputusan 2026-09-24**, tetapi
keputusan baru **R-A (hapus seluruh band di bawah hero)** memukul satu titik yang belum pernah
diputuskan: `SiteNav.astro:105` adalah **satu-satunya `href="/loker"` di seluruh `src/`**, dan
`e2e/test-landing.mjs:222` secara eksplisit menjaganya dengan alasan *"the page nav is now the ONLY
path to the list"* — gate itu **ada di CI** (`.github/workflows/ci.yml:264`). Jadi R-A **tidak
konsisten** dengan keputusan 2026-09-24 ("tepat satu tautan ke `/loker`, di nav"), dan itu
**keputusan owner (D2)**, bukan detail implementasi. Risiko terbesar kedua adalah **R-B "bangun
sistem desain"**: `DESIGN.md` yang akan jadi fondasinya sendiri sudah basi di ≥4 tempat, dan
§5.7-nya memuat **alur 6 langkah yang berbeda dari alur resmi perusahaan** — membangun di atasnya
berarti mengubah klaim publik. Urutan yang benar: jawab D1/D2 → perbaiki drawer → perbarui gate
lebih dulu → baru hapus band → sinkronkan dokumen → rekonsiliasi §5.7 → bangun sistem desain.
