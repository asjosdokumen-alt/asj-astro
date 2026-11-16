# PROJECT_CONTEXT — Amanah Sakura Japan (ASJ Portal v2)

> **Untuk AI coding model:** baca berkas ini di awal sesi. Semua permintaan pemilik
> di repo ini menyangkut proyek **ASJ Portal v2**. Jangan meminta pemilik menjelaskan
> ulang siapa ASJ, apa itu LPK, atau apa itu SSW/Magang — ada di bawah. Kalau ada yang
> tidak tercantum, **tanyakan, jangan mengarang**.
>
> **Disegarkan 2026-11-15 dari KODE di repo**, basis ukur `e1bfa2f`
> (HEAD sebelum commit dokumen sesi ini; commit dokumen tidak mengubah kode). Versi sebelumnya
> disusun dari scrape landing page dan menyatakan *"source code belum saya lihat"*;
> itu sudah tidak benar. Berkas ini sekarang memakai kode sebagai sumber utama.
>
> **Urutan sumber kebenaran (pakai yang paling atas bila bertabrakan):**
> 1. **Kode + tes yang berjalan** (`src/`, `netlify/functions/`, `migrations/`).
> 2. **PDF company profile** → transkrip ber-provenance di `docs/COMPANY_PROFILE_DATA.md`.
> 3. **Dokumen bertanggal** di `docs/` dan `deliverables/` ⇒ **snapshot**, bukan status kini.
> 4. Berkas konteks ini (`README.md`, `TODO.md`, `.workbuddy-ai/memory/INDEX.md`).
>
> 🔴 **Aturan anti-basi:** angka atau status tanpa tanggal/cara ukur **jangan
> dipercaya**. Cara mengukur ulang ada di §8.5. Dokumen lama sengaja tetap ada
> (R7: arsip, jangan hapus) — yang dicegah adalah membacanya sebagai keadaan NOW.
>
> **Legenda:** **[FAKTA]** = ada di kode / disampaikan pemilik · **[ASUMSI]** =
> dugaan, perlu konfirmasi · **[ISI]** = belum diketahui, tanyakan pemilik.

---

## 1. Ringkasan satu paragraf

PT Amanah Sakura Japan (ASJ) adalah **LPK (Lembaga Pelatihan Kerja) bahasa & budaya
kerja Jepang** di Kab. Ponorogo, Jawa Timur. ASJ melatih calon pekerja migran
Indonesia (bahasa Jepang, keterampilan, budaya kerja), membantu pemberkasan dan
ujian (JFT/SSW), lalu menyerahkan peserta ke **mitra LPK dan PT (SO)** untuk
keberangkatan lewat **Tokutei Ginou (SSW/TG)** dan **Magang (Ginou Jisshu)**.
ASJ **belum berstatus SO**. Tagline: *"Let's Build Our Future"* / 夢を日本へ.
Repo ini adalah **PWA/portal rekrutmen** untuk proses tersebut.

---

## 2. Status proyek **[FAKTA, terukur 2026-11-15]**

| Hal | Kondisi |
|---|---|
| Repo | `asj-astro` · `asj-portal-v2` v0.1.0 · basis ukur `e1bfa2f` · **1.755 berkas tracked** pada basis itu (2 berkas konteks baru ⇒ 1.757 setelah commit) |
| Situs | **Produksi, tayang publik** di `https://amanahsakura.netlify.app` (nilai `TARGET` di `server.cjs:41`, `PROXY_TARGET` di `serve.cjs:12`, `FUNCTIONS_PROXY_TARGET` di `astro.config.mjs:54`). Cek build yang tersaji lewat `/version.json` |
| Database | **Neon Postgres** (Data API/PostgREST) — bukan Supabase. Storage berkas tetap **Supabase** |
| Migrasi | **60 berkas SQL** di `migrations/` (`001` … `060_candidate_id_tidak_boleh_kosong.sql`) |
| Rute | **20 berkas** di `src/pages/` (19 `.astro` + `sitemap.xml.ts`) — lihat §8.3 |
| Build terakhir di `dist/` | `asj-astro-2d42c963d4c4`, `builtAt 2026-11-14T17:07Z`, 21 HTML ⇒ **`dist/` bisa lebih tua dari HEAD**, cek `stat` sebelum dipakai sebagai bukti |
| Deploy | `main` terhubung ke Netlify ⇒ **setiap push = deploy produksi berbayar**. ⛔ **JANGAN PUSH** (R19); commit lokal saja, push hanya bila pemilik menyuruh |
| Pekerjaan tertinggal | `TODO.md`: **0 utang teknis** per 2026-11-10; daftar backend tunggal di `docs/BACKEND_TODO.md` |

### Yang BISA dan yang TIDAK bisa dibuktikan dari repo

- ✅ **Bisa:** situs produksi live, DB Neon berisi data kandidat nyata, panel admin
  berbasis PIN, dasbor kandidat berbasis sesi JWT, 60 migrasi, gate CI/e2e aktif.
- ❌ **Tidak bisa:** apakah proses operasional internal sudah **sepenuhnya** pindah
  dari WhatsApp/Google Drive ke PWA. Ini keputusan/kebiasaan kerja di luar repo ⇒
  **[ISI]**, jangan dikarang.
- 🔴 **Klaim lama yang dicabut:** *"Tahap Development, dipakai hanya untuk test
  internal siswa Amanah, belum live untuk publik"*. Itu bertentangan dengan host
  produksi, data nyata, dan riwayat deploy. Jangan menulis copy atau fitur baru
  dengan premis itu. Pernyataan lama soal **WA sebagai kanal komunikasi utama**
  tetap diperlakukan sebagai **[ASUMSI]** sampai pemilik mengonfirmasi.

### Cara kerja lama yang masih dicatat (bukan status operasional kini)

- WhatsApp dulu dipakai untuk menyebar pamflet, lowongan, info kandidat; berkas
  dulu disimpan di grup WA lalu mulai dipindah ke Google Drive.
- Di PWA sekarang sudah ada `/loker`, `/public`, `/apply`, `/siswa-baru`, panel
  admin, dan dasbor kandidat. **WA tetap dipertahankan** lewat tautan `wa.me` dan
  pesan terisi otomatis; jangan memutus alur itu.

---

## 3. Profil perusahaan **[FAKTA]**

> Sumber: `docs/COMPANY_PROFILE_DATA.md` — transkrip 15 halaman PDF
> *"COMPANY PROFILE PT AMANAH SAKURA JAPAN (会社概要_) 2026 AUG"* (25 Agustus 2026),
> tiap baris punya nomor halaman asal. Implementasi UI: `src/lib/companyProfile.ts`.
> **Klaim lama "dokumen company profile belum dilampirkan" sudah dicabut.**

| Item | Isi |
|---|---|
| Nama | PT AMANAH SAKURA JAPAN (LPK Amanah Sakura Japan) |
| Bentuk | Perseroan Terbatas (PT), Swasta Nasional |
| Berdiri | 15 Agustus 2023 (Akta Notaris No. 09, Notaris Setya Budhi, S.H.) |
| SK Kemenkumham | AHU-0063921.AH.01.01.TAHUN 2023 (disahkan 28 Agustus 2023) |
| Nomor pendaftaran | 4023082735107914 |
| Daftar Perseroan | AHU-0167587.AH.01.11.TAHUN 2023 |
| Kedudukan | Kabupaten Ponorogo, Jawa Timur |
| Alamat | Jl. Kyai Ageng Musakaf, RW 03 RT 03, Dukuh Ngujung, Desa Gandu Kepuh, Kec. Sukorejo, Kab. Ponorogo, Jawa Timur |
| Telepon / WhatsApp | `0878-8950-2004` (`wa.me/6287889502004`) — **satu-satunya nomor yang dipublikasikan** |
| Email | amanahsakurajapan@gmail.com |
| Instagram | @amanah_sakura_japan |
| TikTok | @amahsakurajp |
| Jam operasional | Senin–Sabtu, 08.00–16.00 WIB |
| Rating Google | **4.8 · 20 ulasan**, `checkedOn = 2026-10-31` (`src/lib/testimonials.ts`). Perbarui `checkedOn` tiap kali dibaca ulang; lima bintang penuh di samping 4.8 = klaim palsu |

### Status SO — wajib konsisten di semua teks/UI

> ASJ **belum berstatus SO (Sending Organization)**. Keberangkatan dijalankan
> **mitra LPK dan PT (SO)** lewat **MoU**. Ditegakkan di `src/lib/partners.ts`,
> `src/pages/index.astro`, dan kamus `src/store/i18n.ts`.

Jangan menulis copy/label/fitur yang menyiratkan ASJ adalah SO atau memberangkatkan
langsung. **Angka mitra, kandidat, dan keberangkatan dilarang dipublikasi**; testimoni
karangan dilarang — slot review yang kosong hanya boleh diisi teks verbatim listing.

### Visi

Menjadikan PT Amanah Sakura Japan lembaga pendidikan profesional dan berkualitas,
yang menghasilkan SDM mampu berkompetisi di era global dan menjawab tantangan
perkembangan ilmu pengetahuan dan teknologi melalui pengembangan pembelajaran
bahasa asing.

### Misi

1. Menyelenggarakan pendidikan dan pelatihan bahasa Jepang secara profesional.
2. Mencetak SDM yang terampil dan profesional.
3. Membangun kerja sama dengan dunia usaha dan industri di dalam dan luar negeri.
4. Membuka peluang bekerja di luar negeri agar tercipta lapangan pekerjaan.

### Tim **[FAKTA — `src/lib/companyProfile.ts`]**

| Nama | Peran |
|---|---|
| Koirul Mustakim | Direktur |
| Triya Sumaryati | Komisaris |
| Hadi Prasojo | Manager / Education & Training Manager (JLPT N1) |
| Ayok Wahyu Saputro | Staf Administrasi |
| Rian Hari Wijaya | Pengajar Bahasa Jepang |
| Wiwit T Syafitri | Pengajar Bahasa Jepang |

Peran/akses tiap orang **di dalam PWA**: **[ISI]**. Yang ada di kode adalah peran
berbasis PIN admin (`PIN_MASTER`, `PIN_SACHOU`, `PIN_AYOK`, `PIN_KHOLIS`,
`PIN_KHOCI`, `ADMIN_MASTER_PIN`) dan sesi kandidat — bukan identitas orang.

---

## 4. Program & layanan **[FAKTA]**

### 4.1 Jalur program

| Program | Keterangan |
|---|---|
| **Tokutei Ginou (SSW / TG)** | Kaigo, pengolahan makanan, restoran/jasa boga, pertanian, peternakan |
| **Magang (SO Swasta)** | Pendampingan pendaftaran → keberangkatan; juga konstruksi & manufaktur |
| **Pelatihan Bahasa Jepang** | Bahasa, keterampilan, budaya kerja; pengajar bersertifikat JLPT N1 |

### 4.2 Biaya & promo (banner "Penerimaan Siswa", `LayananSection.astro`)

| Program | Pendidikan | Keberangkatan |
|---|---|---|
| TG / SSW | Rp 6 juta | Rp 15–25 juta |
| Magang | Rp 5,5 juta | Rp 45–50 juta |

- Program "6 juta" bisa dicicil; termasuk modul & kamus, seragam, asrama, ujian
  JFT & SSW masing-masing 1 kali.
- **Dana Talang**: biaya keberangkatan tanpa bunga/riba, jaminan sertifikat; uang
  kembali penuh bila kaisha membatalkan sepihak, kecuali biaya MCU.
- **Asrama gratis**, iuran listrik Rp 30.000/bulan (kasur, WiFi, dapur, tempat
  cuci, motor).
- **Kuota 25–30 siswa per angkatan**; banner berjalan: **Angkatan L, mulai Januari 2027**.

### 4.3 Layanan tambahan

- **Pengurusan Visa** (TG & Magang) — area Surabaya, Jakarta, Medan.
- **Pendaftaran Ujian** JFT Basic & SSW Prometric — seluruh lokasi di Indonesia.
- Keduanya diarahkan ke WhatsApp admin dengan pesan terisi otomatis.

### 4.4 Penempatan — 🔴 jangan dipakai sebagai batas

- **Cakupan = SELURUH bidang penempatan + SELURUH 47 prefektur** (keputusan pemilik
  2026-10-30; `PLACEMENT_COVERAGE` di `src/lib/companyProfile.ts`).
  *"5 bidang / 4 prefektur"* hanyalah jejak awal berdiri, **bukan batas** — jangan
  dikembalikan.
- **26 prefektur** = **bukti dari register penempatan** (`PLACEMENTS` +
  `PLACEMENT_PREFECTURES`), diperbarui 2026-11-10 dari `JOB MACHING.xlsx`.
  Ia menjawab *"di mana ada bukti"*, bukan *"ke mana boleh ditempatkan"*.
- Dua daftar itu sengaja dipisah agar tidak saling membantah di halaman.
- Nama prefektur ditulis huruf Latin; versi JP ada di kamus `i18n-jp.ts`.

---

## 5. Syarat & berkas pendaftaran **[FAKTA]**

**Syarat umum**

- Pria/wanita, usia 18–28 tahun · pendidikan minimal SMA/SMK sederajat
- Belum atau sudah menikah · sehat jasmani dan rohani
- Tinggi badan minimal pria 160 cm, berat badan 50 kg (FAQ: bisa berbeda antar jalur)
- Tidak bertato/tindik, tidak buta warna, bebas TBC

**Berkas**

- Form pendaftaran lembaga · surat izin orang tua
- Scan/fotokopi KTP, akta lahir, Kartu Keluarga
- Scan/fotokopi ijazah (SD/MI, SMP/MTs, SMA/SMK) · pas foto 3×4, 2 lembar

---

## 6. Alur siswa/kandidat — 6 tahap **[FAKTA]**

| # | Tahap | Isi |
|---|---|---|
| 01 | Registration | Pemeriksaan kesehatan, dokumen, isi form pendaftaran |
| 02 | Training & Education | Bahasa Jepang, keterampilan, budaya Jepang |
| 03 | Interview | Wawancara kerja dengan perusahaan Jepang |
| 04 | Employment Document | Kepengurusan berkas di Indonesia |
| 05 | Document Preparing | MCU, tanda tangan kontrak, berkas imigrasi Jepang (COE) |
| 06 | Go to Japan | Paspor, visa, EKTLN, lalu berangkat |

Ujian JFT Basic dan SSW (Prometric) berlangsung di sekitar fase pelatihan; waktu
pasti per siswa **[ISI]**. Status tahapan di DB punya nilai kanonik sendiri —
jangan mengarang enum, baca `migrations/` dan `netlify/functions/contexts/`.

---

## 7. Aktor / persona

| Aktor | Bukti di kode |
|---|---|
| Pengunjung publik | `/`, `/loker`, `/public`, `/share`, `/404`, artikel `/blog/[...slug]` |
| Calon siswa | `/siswa-baru` |
| Pelamar / kandidat | `/apply` (form lengkap/parsial), `/candidate` (butuh sesi JWT) |
| Siswa / peserta pelatihan | `/master` (butuh sesi), `/ai-cv` (AI CV Master, gate VIP), latihan `/kotoba`, `/matematika`, `/tes-iq`, `/tes-mata`, `/tes-mbti`, `/wawancara`, `/arcade` |
| Admin / staf | `/admin` — PIN per peran, 9+ tab, `AdminPanel.tsx` |
| Mitra LPK & PT (SO) | Pihak yang memberangkatkan (MoU); tidak punya akun PWA **[ASUMSI]** |
| Kaisha Jepang | Perusahaan pemberi kerja/pewawancara; tidak punya akun PWA **[ASUMSI]** |
| Orang tua / wali | Pemberi izin; tidak punya akun PWA **[ASUMSI]** |

🔴 **Klaim lama "siswa Amanah satu-satunya kelompok test internal" dicabut** —
rute publik, kandidat, dan admin sudah berjalan di produksi. Hak akses matriks
lengkap per peran: **[ISI]**.

---

## 8. Fakta teknis — diukur dari repo, bukan dari tampilan luar

### 8.1 Stack

| Lapisan | Teknologi |
|---|---|
| Framework | **Astro 5 (SSG)** + pulau **Preact** (`client:only="preact"`) |
| State | **Nanostores** (`@nanostores/persistent` untuk auth & tema) |
| Auth | Fungsi sendiri: WA/password atau PIN → **JWT** (`SESSION_SECRET`), 24 jam; `netlify/functions/_lib/session.ts`. Jalur `supabase.auth.*` **mati** sejak cutover Neon |
| Validasi | Zod (`src/lib/schemas.ts`) |
| CSS | Tailwind CSS v4 + `src/styles/{global,theme,layout,motion}.css` (⚠ `global.css` **unlayered**, mengalahkan utilitas Tailwind — R20) |
| Ikon | Sprite SVG sendiri (`npm run icons`) |
| PWA | Service worker + manifest (`scripts/build-sw-manifest.mjs`, `dist/version.json`) |
| Backend | **Netlify Functions**: `netlify/functions/*.{js,ts}` → `surfaces/` → `contexts/` → `_lib/` |
| Data | **Neon Postgres** via PostgREST; **Supabase Storage** (`asj-files`) hanya untuk berkas |
| Node | 22 (`.nvmrc`) · Vitest · Biome · Playwright (e2e) |

### 8.2 Env — 🪤 jebakan paling sering menyesatkan

- 🔴 **`.env` di root = proyek Supabase LAMA** (`gdwvffmevwtwnzrapjwy.supabase.co`,
  ledger berhenti di migrasi `016`). **BUKAN produksi.**
- Produksi = **`.env.local`** / **`env-kunci/PRODUCTION.env`**: `SUPABASE_URL`
  menunjuk host Neon `ep-bold-sunset-…apirest.c-4.ap-southeast-1.aws.neon.tech`.
  Nama variabel tetap `SUPABASE_*` **dengan sengaja** supaya kode tidak berubah saat
  cutover. Storage memakai `STORAGE_SUPABASE_URL` yang berbeda.
- `scripts/lib/load-env.mjs` aman (prioritas `.env.local` dulu). **Cetak host DB
  sebelum menyimpulkan apa pun** dari probe/audit; jangan pernah mencetak koneksi
  atau kunci.
- **45 kunci** ada di `.env.example` (daftar otoritatif). `.env*` dan
  `netlify/functions/secrets/` **gitignored**, repo ini **publik** — jangan commit.

### 8.3 Rute (`src/pages/`, 20 berkas)

`/` · `/404` · `/loker` · `/public` · `/apply` · `/siswa-baru` · `/share` ·
`/candidate` · `/master` · `/ai-cv` · `/admin` · `/arcade` · `/kotoba` ·
`/matematika` · `/tes-iq` · `/tes-mata` · `/tes-mbti` · `/wawancara` ·
`/blog/[...slug]` · `/sitemap.xml.ts`.

> Daftar lama **"11 rute"** dan **"6 rute yang tampak dari luar"** sudah basi.

### 8.4 Perintah yang benar

```bash
npm run serve                 # node server.cjs → dist/, proxy fungsi ke PRODUKSI
npm run dev                   # astro dev (port 4321; baca PORT dari stdout!)
npm run dev:8888              # netlify dev → localhost:8888 = DB PRODUKSI (hati-hati)
npm run build                 # astro build + sw-manifest + JWKS (BUKAN astro build saja)
npm run typecheck             # tsc --noEmit
npm test                      # vitest penuh (lihat peringatan di bawah)
npm run verify:md             # bentuk tabel markdown (77 berkas)
npm run lint-ratchet          # diagnostik Biome vs baseline
npm run migrate:status        # status migrasi
```

- 🔴 **Baca port dari stdout server** (`findPort(4321)` bisa pindah ke 4322).
- 🔴 **`npm run build`, jangan `astro build` saja** — yang kedua meninggalkan
  `dist/sw.js` ber-`asj-astro-dev` dan membuat 5 tes `swOffline` merah (R21a).
- 🔴 **`vitest` dulu, build kemudian**; `CODEBUDDY_SAFE_DELETE_ENABLED=0` bila
  gate hapus-terkunci mengganggu. `pool:'threads'` rusak ⇒ pakai
  `--project=<frontend|backend|indexer> --pool=vmForks`.
- 🔴 **Sebagian tes service-context menembus stub dan PERNAH menulis baris master
  ke DB PRODUKSI.** Bila ragu, jalankan suite tertarget, bukan `npm test` penuh,
  dan pastikan service memakai `supabaseJson` milik context.
- ⛔ **`verify:batteries`, `memory:check`, dan baterai mutasi itu MUTATIF.**
  `memory:check` merotasi log harian > 7 hari ke `arsip/YYYY-MM.md` lalu
  **menghapus aslinya** (ringkasan bukan salinan penuh). Pakai `--dry-run` bila
  hanya ingin membaca status.

### 8.5 Cara mengukur ulang berkas ini

```bash
git rev-parse --short HEAD
git ls-files | wc -l                       # tracked
ls migrations/*.sql | wc -l                # migrasi
find src/pages -type f | wc -l             # rute
grep -nE 'TARGET|netlify.app' server.cjs serve.cjs astro.config.mjs
node -e "const fs=require('fs');for(const f of ['.env','.env.local'])console.log(f,fs.readFileSync(f,'utf8').match(/^SUPABASE_URL=(.*)$/m)?.[1]?.split('/')[2])"
cat dist/version.json                      # build yang tersaji lokal
npm run verify:md && npm run lint-ratchet
```

---

## 9. Aturan kerja untuk AI coding model

1. **Konteks:** setiap permintaan adalah bagian dari proyek ini; pakai glosarium.
2. **Jangan mengarang** stack, skema, endpoint, enum, atau kebijakan bisnis.
   Tandai **[ASUMSI]**/**[ISI]** bila tidak ada bukti di kode.
3. **Ukur, jangan mengingat.** Angka di dokumen tanpa tanggal = usang sampai
   diukur ulang. Bedakan tabel **NOW** dari **snapshot bertanggal** (R13l).
4. **Ikuti stack & konvensi repo;** jangan tambah framework/dependensi besar tanpa
   alasan. Berkas baru di `src/`, `scripts/`, `e2e/` menggeser **counter beku
   indexer** (R15) — tempatkan probe sekali pakai di `deliverables/**` atau `F:/tmp`.
5. ⛔ **JANGAN PUSH** (R19). Commit lokal tiap sesi; `git add -A` / `git rm`
   **DILARANG** ⇒ sebut path eksplisit (R4). `git rm` pernah menghapus `public/`
   dan `e2e/`.
6. **Docs: arsipkan, jangan hapus** (R7). Dokumen lama dipindah ke `docs/archive/`.
   `MEMORY.md` tetap ringkas (≤ 4 KB), rincian ke `MEMORY_DETAIL.md`.
7. **Migrasi DULU, deploy kode kemudian** (PGRST204). Jangan edit migrasi
   `021`–`023` (checksum). Sesudah DDL: `npm run db:schema` + `npm run verify:schema`.
8. **Bahasa:** UI/copy Bahasa Indonesia yang sopan; jawab pemilik dalam Bahasa
   Indonesia. Kamus ID + JP harus sama-sama punya kunci (`i18n.keys.test.ts`).
9. **Mobile-first & ringan:** pengguna memakai HP kuota terbatas **[ASUMSI]**.
   Perhatikan ukuran aset, caching/offline, form mudah diisi.
10. **WA tetap penting:** pertahankan `wa.me` dan pesan terisi otomatis.
11. **Data pribadi sensitif:** KTP, KK, akta, ijazah, paspor, foto, MCU. Jangan
    di-hardcode, di-log, atau di-commit; batasi per peran; pertimbangkan UU PDP.
    Pakai data dummy, jangan data siswa asli sebagai seed/contoh.
12. **Jangan menyatakan status SO**, jangan menjanjikan gaji/penempatan/jadwal
    pasti, jangan mengubah angka biaya/legalitas tanpa konfirmasi pemilik.
13. **Jangan mempublikasikan** jumlah mitra/kandidat/keberangkatan; testimoni
    karangan dilarang.
14. **Jangan menulis seolah PWA masih development/test internal.** Status rilis
    = produksi; yang belum jelas hanya **adopsi operasional internal** ⇒ **[ISI]**.
15. **Sebelum perubahan besar** (struktur data, auth, storage), ajukan rencana
    singkat. Aturan lengkap R1–R25 ada di skill `asj-session-rules` (**grep**,
    jangan muat 118 KB penuh).
16. **Satu perbaikan = satu tes yang TERAMAT MERAH sebelum diperbaiki** (R5).

---

## 10. Ketidakkonsistenan: sudah diputuskan vs masih terbuka

**Sudah diputuskan di kode (jangan dibuka lagi):**

| Dulu | Sekarang |
|---|---|
| "6 bidang / 26 prefektur" dibaca sebagai batas | Cakupan = seluruh bidang + 47 prefektur; 26 = bukti register |
| "5 bidang / 4 prefektur" | Jejak awal berdirinya, bukan batas (owner 2026-10-30) |
| Rating 5,00 / 7 ulasan | **4.8 · 20**, `checkedOn 2026-10-31` |
| "11 rute" / "rute yang tampak dari luar" | 20 berkas rute di `src/pages/` |
| "company profile belum dilampirkan" | `docs/COMPANY_PROFILE_DATA.md` (PDF 15 hal.) |
| "stack/backend/DB belum diketahui **[ISI]**" | Astro + Preact + Netlify Functions + Neon/Supabase (§8) |

**Masih terbuka, jangan dikarang:**

- Biaya program disebut "6 juta" di beberapa tempat, sementara banner memisahkan
  TG **Rp 6 jt** dan Magang **Rp 5,5 jt**. Sumber kebenaran untuk hardcode belum
  ditetapkan ⇒ tanyakan pemilik.
- "Bahasa Jepang 6 juta" vs "Pendidikan 6 Jt" untuk TG: apakah produk sama?
- Persyaratan tinggi badan 160 cm vs FAQ "berbeda antar jalur".
- Daftar prefektur pernah muncul di bawah judul "Kanto" (artefak tampilan lama).

---

## 11. Glosarium

**Bisnis** — **LPK** Lembaga Pelatihan Kerja · **SO (Sending Organization)**
lembaga pengirim resmi; ASJ **belum** SO, bermitra lewat **MoU** · **SSW / Tokutei
Ginou (TG)** visa Specified Skilled Worker · **Magang (Ginou Jisshu)** pemagangan
teknis · **JFT Basic** Japan Foundation Test for Basic Japanese · **JLPT N1**
sertifikasi bahasa Jepang tertinggi · **Prometric** penyelenggara ujian SSW ·
**COE** Certificate of Eligibility · **MCU** Medical Check-Up · **EKTLN** kartu
pekerja migran · **Kaigo** perawatan lansia · **Kaisha** perusahaan Jepang ·
**Sensei** pengajar · **Dana Talang** talangan biaya tanpa riba · **Angkatan L**
gelombang penerimaan Januari 2027 · **Job hub** info lowongan (di PWA: `/loker`,
`/public`) · **PWA** Progressive Web App.

**Teknis** — **island** pulau Preact `client:only` · **surface / context / _lib**
lapisan Netlify Functions (entry → logika domain → kernel) · **PostgREST / Data
API** jalur baca-tulis Neon · **RLS** Row Level Security; `asj_service`
BYPASSRLS, JWT lain bisa baca 0 baris tanpa error · **counter beku** invariant
jumlah berkas/simbol di `indexer/src/*.test.ts` · **ratchet** gate yang menolak
bertambahnya diagnostik/angka · **baterai mutasi** uji bahwa gate bisa merah ·
**snapshot** dokumen bertanggal yang tidak lagi menggambarkan NOW ·
**`/version.json`** penanda build yang sedang tersaji.

---

## 12. Yang masih perlu diisi pemilik **[ISI]**

- [ ] Apakah proses operasional internal **sudah penuh** pindah dari WA/Drive ke
      PWA, atau keduanya masih berdampingan?
- [ ] Tujuan utama PWA & urutan prioritas fitur berikutnya.
- [ ] Matriks hak akses per peran/orang; apakah mitra SO butuh akun.
- [ ] Struktur folder Google Drive & aturan penamaan berkas (bila masih dipakai).
- [ ] Sumber kebenaran tunggal untuk biaya & persyaratan per jalur (lihat §10).
- [ ] Aturan privasi/persetujuan pemakaian data siswa.
- [ ] Keputusan keamanan yang masih menunggu: rotasi PIN, CSP (Report-Only dulu),
      revokasi sesi saat logout, CORS/throttle `share-data`, `verify:rls` DEGRADED.

> Yang **sudah terjawab** dan dicoret dari daftar lama: stack teknis, repo,
> struktur folder, cara deploy, daftar rute, fungsi `/apply`·`/loker`·`/siswa-baru`,
> dokumen company profile, status rilis.

---

## 13. Cara memakai berkas ini

- Berkas ini **hidup di root repo** (`PROJECT_CONTEXT.md`) dan dibaca di awal
  sesi. Untuk alat yang memakai nama lain, **salin sebagai**
  `CLAUDE.md` / `AGENTS.md` / `.cursor/rules/amanah.mdc` — jangan duplikasi isi
  tanpa sinkronisasi, karena dua salinan akan segera bertentangan.
- Peta lanjutan: `README.md` (status & perintah) · `docs/README.md` (peta
  dokumen) · `.workbuddy-ai/memory/INDEX.md` (fakta kanonik & jebakan) ·
  skill `asj-session-rules` (R1–R25).
- **Perbarui berkas ini bila ada keputusan penting** (stack, fitur, biaya, status
  rilis, host produksi). Setiap perubahan wajib menyebut tanggal + cara ukur;
  tanpa itu ia berubah dari fakta menjadi kenangan.
