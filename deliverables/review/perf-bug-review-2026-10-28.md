# Performance & Bug Review — asj-astro

**Revision diukur:** `266aa9b` · 2026-10-28 18:30 · working tree bersih (§7)
**Menggantikan:** snapshot `0220438` di hari yang sama.
**Perbaikan sesudah pengukuran:** `b3f9f50` (dokumen ini), `96d9e25` (G1),
`1630562` (B13). Angka §4 tetap dari artefak `266aa9b` — ketiga commit itu tidak
menyentuh bundle.

> **Kenapa berkas ini ditulis ulang.** Snapshot pertama mengambil gambar pada
> `0220438` (2026-10-27 23:08), lalu 14 temuannya diperbaiki antara **17:25–18:23
> pada 2026-10-28**. Dokumen lama tetap menyajikan ke-14 temuan itu dalam bentuk
> sekarang ("**Where:** …", "**Fix:** …"), sehingga pembaca yang tidak membaca
> tabel status di tengah akan menyimpulkan kode masih rusak. Itu bukan salah
> bacaannya — itu salah dokumennya. Versi ini memisahkan **terbuka** dari
> **tertutup**, dan setiap angka diukur ulang pada `266aa9b`.

## 0 — Ringkasan

| | |
|---|---|
| Temuan pass pertama (`0220438`) | 18 |
| Ditutup 2026-10-28 | **14** (commit `bb5daa4` … `71537a0`) |
| Temuan baru pass ini | **6** (G1, B13, P1b, P2b, P2c, P7) |
| Ditutup di sesi yang sama | **3** — G1 (`96d9e25`), B13 (`1630562`), P2c (`8547516`) |
| **Terbuka pada HEAD** | **7** — B8, P1b, P2b, P4, P5, P6, P7 |
| Suite uji | **269 berkas / 3 223 tes** pada HEAD — hijau; 3 219 saat `266aa9b` (§6a) |
| Yang diukur ulang | island landing **229,5 KB / 74,7 gz** · graf admin **861,3 KB / 317,0 gz** · kamus `i18n` **2 058 entri / 102,0 KB / 34,5 gz** |

---

## 1 — "DB-nya memang Neon?" Ya. Ini buktinya, dan ini sumber kebingungannya

Jawaban singkat: **database produksi adalah Neon Postgres**, diakses lewat Neon
Data API (PostgREST). Yang **masih** Supabase hanyalah **Storage**. Namanya
tertukar karena variabel env-nya sengaja tidak diganti.

| Bukti | Nilai terukur (2026-10-28) |
|---|---|
| `SUPABASE_URL` di `PRODUCTION.env` | `https://ep-…apirest.c-4.ap-southeast-1.aws.neon.tech/neondb` |
| `PUBLIC_SUPABASE_URL` di `PRODUCTION.env` | host yang **sama** (Neon) — dibandingkan lewat hash, ketiganya identik |
| `STORAGE_SUPABASE_URL` di `PRODUCTION.env` | `https://….supabase.co` |
| `SUPABASE_JWT_ALG` / `_PRIVATE_KEY` / `_KID` | ada (EdDSA — Neon tidak punya static JWT secret) |
| `SUPABASE_JWT_SECRET` (HS256, jalur Supabase) | **tidak ada** di produksi |
| Region Neon | `ap-southeast-1` (Singapura) |
| `netlify.toml` `[functions]` | **tidak ada `region`** ⇒ tidak dipin ke `sin` |

Kode sudah tahu ini dan mendokumentasikannya sendiri:

- `.env.example:68-93` — *"Nama variabel SENGAJA tetap SUPABASE_* supaya 0 berkas
  kode berubah … STORAGE — tetap Supabase (Neon tidak punya Storage)"*.
- `netlify/functions/_lib/kernel/db.ts:52-70` — dua mode tanda tangan JWT:
  `HS256` (Supabase, default) vs `EdDSA` (Neon, JWKS), dipilih **eksplisit** lewat
  `SUPABASE_JWT_ALG`, tidak pernah ditebak dari env yang kebetulan ada.

### Jadi kenapa "Supabase" masih muncul di mana-mana?

Karena tiga dokumen **tidak** ikut diperbarui saat cutover 2026-10-25, dan
ketiganya adalah yang paling sering dibaca orang:

| Berkas | Klaim lama (salah) | Sudah diperbaiki di sesi ini |
|---|---|---|
| `README.md:3,5` | "Astro + Preact + **Supabase** … data di Supabase" | ya |
| `README.md:43` | Live Site = `asjastro.netlify.app` (404 sejak rename 2026-10-24) | ya |
| `README.md:45-46` | "**dua** proyek Supabase: data `bimqy…` + aset `gdwv…`" | ya |
| `README.md:100` | "Data: Supabase (Postgres + Storage)" | ya |
| `README.md:18` | `files.length = 535` — **terukur sekarang 603** | ya |
| `docs/ARCHITECTURE.md:243` | "Supabase = `gdwv…`" tanpa menyebut Neon | ya |
| `src/lib/supabase.ts:1-15` | "client ini menangani Auth, Realtime, **dan Storage**" | ya |

**Ini bukan kosmetik.** `files.length` yang tertulis 535 sementara yang benar 603
adalah angka yang akan dipakai orang untuk "membetulkan" gate merah — persis
mekanisme yang membuat satu perbaikan memerahkan hal lain.

---

## 2 — Temuan terbuka

### B8. Refresh token tidak pernah diterbitkan — sesi mati keras di 24 jam *(tetap terbuka)*

`refreshAdminSession` / `refreshKandidatSession` ada di server
(`contexts/identity/service.ts:168,192`), dipetakan di `apiEndpoint.ts:16,18`,
dan **tidak dipanggil dari mana pun di `src/`**. Tidak ada satu pun
`signToken({ kind: 'refresh' })` di seluruh repo, jadi handler itu selalu
menolak. Efeknya: `refreshToken` selalu `''`, dan pengguna ter-logout paksa 24
jam setelah login.

**Butuh keputusan, bukan tambalan:** menerbitkan token refresh (memperpanjang
sesi diam-diam) atau menghapus field + kedua handler (menghapus kemampuan).
Keduanya perubahan perilaku di jalur sesi.

### P1b. `xlsx` sudah keluar, tapi chunk admin masih **479 KB dalam satu berkas** *(baru)*

P1 tertutup dan **diverifikasi ulang di artefak**: tidak ada `xlsx` di graf statis
`AdminPanel`.

```
AdminPanel.BGcnBXOX.js        479,0 KB   190,1 gz   ← satu berkas
graf statis /admin            861,3 KB   317,0 gz   ← 26 berkas
```

Dan tidak ada satu pun chunk `Tab*.js` di `dist/_astro` — artinya **kesembilan
tab dikompilasi ke dalam `AdminPanel` itu**. Admin yang membuka tab "Mail"
mengunduh kode Pemberkasan, Matchmaking, dan CV template factory sekaligus.
Memecah `TAB_VIEWS` menjadi `lazy()` per tab adalah win berikutnya yang paling
besar di panel, dan tidak melanggar alasan `TAB_VIEWS` di-type sebagai
`Record<Tab, FunctionComponent>` (R18 §2) — tipenya tetap, isinya jadi komponen
lazy.

### P2b. Kamus `i18n` mengirim **2 058 entri** ke setiap pengunjung anonim *(baru)*

P2 tertutup (klien Supabase keluar dari graf — lihat §4), tapi penyebab #2 di
dalamnya tidak pernah dikerjakan, dan sekarang ia **bagian terbesar** dari sisa
graf:

```
i18n.QnreTnuV.js   102,0 KB   34,5 gz   ← 46% dari 74,7 KB gzip yang tersisa
```

Terukur di `src/store/i18n.ts`:

| | |
|---|---|
| Entri kamus `id` (baris 44–2494) | **2 058** |
| Komentar kepala berkas | *"Language toggle store (123 keys)"* — basi 16× |
| Key yang benar-benar dipakai island landing (`App`, `public/*`, nav) | **85** literal + `t(stat.labelKey)` |
| Key yang dipakai di seluruh `src/` | 1 266 literal, 33 situs panggilan dinamis |

Jadi ~4% kamus melayani halaman yang pertama kali dibuka. Memecah kamus per-rute
(pola yang **sudah** dipakai `i18n-jp.ts`, lazy 110 KB) menghapus ~30 KB gzip
dari setiap kunjungan anonim.

### P4. Setiap aksi admin membayar satu round-trip DB untuk rate limit *(tetap terbuka)*

`handlers.ts:181` — `{ key: 'adminCrud:' + adminKey, limit: 120 }` dipasang untuk
**semua** aksi ber-sesi admin, termasuk `getAppData('admin')` yang hanya membaca.
Kalau fungsi berjalan di region default (bukan `sin`) sementara DB di Singapura
(§1), biaya per panggilan lebih besar daripada "+40 ms" yang diasumsikan modulnya.

### P5. Daftar kandidat membaca seluruh tabel lalu mengurutkan di JS *(tetap terbuka)*

`catalog/repository.ts:265` — `findAllCandidatesLight()` (keyset walk seluruh
tabel) → `saringKandidat()` di JS → `urutkan()` di JS → `slice()` → round-trip
kedua `findCandidatesByIds()`. Dua round-trip + transfer penuh per halaman.
Tidak terasa pada 226 baris; bentuk kuerinya tidak berubah saat tabel tumbuh.

### P6. `getMonthlyReport` mematerialisasi 5 000 kandidat untuk menghitungnya *(tetap terbuka)*

`catalog/service.ts:139` — `pageSize: 5000`, agregasi di JS. Butuh `GROUP BY`
RPC atau agregat L3. Admin-only, on demand.

### P7. Region fungsi ≠ region database *(baru, konfigurasi — belum diukur ulang)*

`netlify.toml` `[functions]` hanya menyetel `directory` dan `node_bundler`;
**tidak ada `region`**. Neon ada di `ap-southeast-1`. Kalau fungsi benar-benar
jalan di region default Netlify (AS), setiap round-trip DB menyeberangi Pasifik.

Sesi migrasi 2026-10-25 mencatat **215 ms vs 33 ms** untuk perbedaan ini; angka
itu **tidak diukur ulang di sini** dan tidak bisa diverifikasi tanpa akses ke
dasbor Netlify. Yang bisa dipastikan dari repo: region-nya tidak dipin, jadi
perilakunya bergantung pada default akun. Menyetel `[functions] region = "sin"`
adalah satu baris — tapi site-wide dan butuh plan Pro, jadi ini keputusan owner.

---

## 3 — Yang sudah ditutup (jangan dibuka lagi tanpa bukti baru)

Semua baris di bawah **diverifikasi ada di HEAD**, bukan hanya diklaim di
pesan commit. Kolom terakhir adalah cara memeriksanya sendiri.

| # | Commit | Yang berubah | Cek cepat |
|---|---|---|---|
| **G1 lint-ratchet** | `96d9e25` | 12 diagnostik baru dibersihkan di sumber: `_init?: any` → bentuk eksplisit, `Record<string, any>` → `unknown`, `hasOwnProperty.call` → `Object.hasOwn`, 2 konkatenasi → template literal. Baseline **diturunkan** 2.001 → 1.997 (bukan dinaikkan), jadi penurunan 4 di dua berkas lain ikut terkunci | `node scripts/ci/lint-ratchet.mjs` → PASSED 1.997 |
| **B13 guard auth** | `1630562` | `isSupabaseConfigured()` = dua string terisi **dan** bukan host Neon Data API; `isNeonDataApiHost()` baru. Domain kustom yang mem-front GoTrue tetap sah | `src/lib/supabase.ts:76-89`; tes blok B13 di `apiClient.test.ts` |
| **P2c preload kamus JP** | `8547516` | `loadJp()` dipanggil di module scope **dan** lewat `preloadJpDict()` di `BaseLayout` — jadi kamus 110,3 KB / 35,6 gz diunduh setiap pengunjung, bukan hanya pembaca JP. Keduanya kini dijaga `langStore.get() === 'jp'`. `ShareView` juga dirutekan lewat `toggleLang()` (satu-satunya tombol bahasa yang melewati `await ensureJpLoaded()`) | `src/store/i18n.ts` (`preloadJpDict`); tes "kamus JP hanya untuk pembaca JP" di `i18n.test.ts` |
| B1 breaker | `bb5daa4` | `breaker.success()` pindah ke **setelah** cek status; 5xx/429 = failure, 4xx = netral; `admitted` menandai panggilan yang tidak pernah terjadi | `kernel/http.ts:169-190` |
| B2 ping-pong tab | `962269b` | handler `storage` mengadopsi identitas dan menulis **byte yang sama**; `lastChecked` tab lain tidak disalin | `authReactive.ts` |
| B3 cache token | `5011ed2` | cache dikunci ke sesi yang mengisinya (`cachedFor`) | `apiClient.ts:180` |
| B4 hapus-sebelum-unggah | `6c7ae77` | `hapusJenisVarian(folder, stem, keep)`; tulis dulu, bersihkan kemudian | `storage.ts` |
| B5 `rpc/nextval` | `33c9a0e` | `migrations/024` membuat `public.nextval(text)` (SECURITY DEFINER, hanya `candidate_id_seq`); fallback MAX+1 kini berlog | `ls migrations/024*` |
| B6 sanitizer folder | `349103d` | `masterFolder()` — satu aturan untuk 3 pembaca + 4 penulis | `db/berkas.ts` |
| B7 `cacheClear()` | `861d155` | pindah ke tulis pertama, setelah guard dan validasi | 6 handler |
| B12 gerbang VIP tulis | `2839287` | `simpanHasilWawancara` memakai `statusVip` yang sama dengan pembacaan | `surfaces/ai.ts` |
| P1 `xlsx` | `e618fd1` | `renderers/excel.ts` memuat SheetJS di dalam `render()` | §4 — graf statis bersih |
| P2 island | `c8e6a3d`, `71537a0` | `supabase` + `AdminAiCopilot` + `userStore` jadi dynamic import | §4 — 229,5 KB |
| B10 `getPublicData` | `c1f2df2` | abort 8 s, cek `res.ok` + content-type, tidak pernah reject, `inflight` selalu dilepas | `publicData.ts` |
| B11 job DEMO | `6fcf1bd` | `notFoundPayload()` mengosongkan `jobs` dan menandai `demo: true` | `catalog/repository.ts` |
| P3 tanda tangan unggah | `4037de9` | 4 tanda tangan sekaligus (di bawah bulkhead 8) | `documents/service.ts` |
| B9 truncation senyap | `c019823` | `log.warn` saat bacaan ber-cap kembali penuh | `db/forms.ts`, `db/jobs.ts`, `catalog/repository.ts` |

---

## 4 — Angka yang diukur ulang di sesi ini

Semua diukur pada `dist/` hasil build `2026-10-28 18:22:26` (sw `asj-astro-279b86c6f4ae`).
Bahwa artefak itu **memuat** perbaikan terakhir dibuktikan oleh isinya sendiri,
bukan oleh jam: commit `71537a0` (18:23) adalah yang mengeluarkan `userStore →
supabase`, dan chunk `supabase` **tidak ada** di graf yang diukur di bawah. Build
lama akan menampakkan 212,7 KB tambahan.

**Graf statis island landing** (`dist/index.html` → `App.BmfAdo-n.js`):

```
FILES 16   RAW 229,5 KB   GZIP 74,7 KB        (sebelum P2: 19 berkas / 453,4 KB / 131,0 gz)
  102,0 KB  34,5 gz  i18n.QnreTnuV.js          ← P2b
   53,5 KB  12,6 gz  schemas.B0Gcbwbf.js
   25,2 KB   6,7 gz  App.BmfAdo-n.js
   11,2 KB   4,8 gz  preact.module
    8,4 KB   2,9 gz  apiClient
```

Chunk `supabase` **tidak ada lagi** di graf. Klaim P2 di dokumen lama (229,5 KB /
74,7 gz) **benar** — diverifikasi ulang, bukan dikutip.

**Graf statis `/admin`:** 26 berkas, **861,3 KB / 317,0 gz**, dengan
`AdminPanel` sendiri **479,0 KB / 190,1 gz**. `xlsx` **tidak** ada di graf statis
(ia masih ada di `dist/` sebagai chunk lazy 488,1 KB — itu benar).

**Kamus i18n:** 2 058 entri, 102,0 KB / 34,5 gz; 85 key dipakai island landing.

**Kamus JP (`i18n-jp.cO6Oc8Sc.js`):** 110,3 KB / **35,6 gz** — dan sampai
`8547516` ia diunduh oleh **setiap** pengunjung, bukan hanya pembaca Jepang,
karena `loadJp()` dipanggil di module scope dan `preloadJpDict()` dipanggil lagi
dari `BaseLayout`. Graf statis tidak menampakkannya (ia `import()` dinamis), jadi
angka island 74,7 gz di atas **bukan** seluruh biaya halaman depan: pembaca
Indonesia membayar 74,7 + 35,6 sebelum perbaikan, 74,7 sesudahnya.

---

## 5 — Dua hal yang harus dibaca sebelum sesi berikutnya

**1. Satu run "bukti merah" pernah MENULIS ke database produksi.** `e2e/` berjalan
dengan `.env.local` yang menunjuk instance Neon produksi. Menjalankan
`simpanHasilWawancara` yang **belum diperbaiki** menyisipkan baris 97 ke
`ai_form_submissions` (WA `628111222333`, `nama_lengkap: "Biasa"`). Baris itu
sudah dihapus dan diverifikasi hilang; suite sekarang mem-mock `supabaseJson`.
**Aturannya: tes yang bisa mencapai jalur tulis harus men-stub database, bukan
sekadar "diharapkan tidak menulis".**

**2. Plafon simbol naik dan butuh persetujuan team-lead.** `build.test.ts:789`
sekarang `≤ 29 900`, terukur **29 808** pada tree saat itu. Kenaikannya +147
simbol dari 23 berkas yang **sudah ada** (`fileCount` tetap **603**), 92 di
antaranya tes. Margin sebelum sesi itu hanya 39, jadi ratchet-nya memang sudah di
batas — bukan kelonggaran baru.

---

## 6 — Apa yang TIDAK diverifikasi di pass ini

Dinyatakan eksplisit supaya tidak ada klaim yang terbaca lebih kuat dari buktinya.

- **Skema database hidup.** Tidak ada kredensial yang dipakai. Apakah
  `migrations/024` (`nextval`) benar-benar sudah diterapkan ke Neon **tidak**
  bisa dijawab dari repo. Perintah yang menyelesaikannya:
  `curl -s -o /dev/null -w '%{http_code}' "$SUPABASE_URL/rest/v1/rpc/nextval?seqname=candidate_id_seq" -H "apikey: $KEY"`
  → 404 berarti migrasi belum jalan, dan jalur MAX+1 masih hidup.
- **Situs live.** `amanahsakura.netlify.app` tidak diprobe di sesi ini; semua
  angka berasal dari `dist/` lokal.
- **Region fungsi Netlify.** Lihat P7 — bisa dilihat di dasbor, tidak di repo.
- **Suite uji.** Dijalankan sekali di sesi ini **sebelum** build apa pun, sesuai
  R13a. Hasil dan atribusi ada di §6a.

### 6a — Hasil suite

Dijalankan **sekali** pada `266aa9b`, sebelum build apa pun di sesi ini (R13a):

```
Test Files  1 failed | 268 passed (269)
     Tests  1 failed | 3218 passed (3219)
  Duration  409,30 s
```

**Yang merah, dan atribusinya.** Satu-satunya kegagalan adalah
`indexer/src/validate.test.ts:34` — `offsetMismatch` **9**, diharapkan 0. Itu
**bukan** cacat kode dan **bukan** artefak sandbox: penyebabnya berkas
`src/lib/supabase.ts` **saya sunting pada 19:17:05, di tengah run yang mulai
19:13:04**. Pemeriksa diferensial itu mengindeks seluruh pohon dan membandingkan
offset dengan compiler; berkas yang berubah di antara dua pembacaan menghasilkan
selisih offset. Buktinya: dijalankan ulang sendirian pada pohon yang tenang →
**3/3 lulus, 51,09 s**, `offsetMismatch` 0.

Jadi angka yang jujur adalah **269 berkas / 3 219 tes, hijau** — dengan satu
kegagalan yang saya sendiri sebabkan dan sudah dibersihkan. Tiga berkas yang
biasanya merah di sandbox (`discover`, `boundary`, `fcm-server`) **lulus di run
ini**; kuota hapus tidak habis dan `spawnSync` tidak diblokir.

> **Pelajaran yang berlaku untuk siapa pun yang mengulang ini:** jangan menyunting
> berkas di dalam repo selama suite berjalan. Pemeriksa diferensial membaca pohon
> dua kali (indexer lalu compiler), dan suntingan di antaranya muncul sebagai
> "offset mismatch" yang bentuknya persis seperti cacat parser. Tunggu run selesai,
> atau jalankan berkas itu sendirian setelahnya.

**Run penutup, setelah G1 dan B13 (`96d9e25`, `1630562`):** `269 berkas /
3 223 tes lulus`, exit 0, 396,90 s. Empat tes tambahan adalah blok B13; jumlah
berkas tidak bergerak karena tesnya masuk `apiClient.test.ts`, bukan berkas baru
(§8).

---

## 7 — Kebersihan tree

| Item | Status |
|---|---|
| `deliverables/parity2.mjs` (10 baris, probe sekali pakai, mengimpor `.ts` dari `.mjs` sehingga tidak bisa dijalankan) | dihapus |
| `test-results/` — 29 MB / 171 PNG | **gitignored**, keluaran Playwright, regenerable. Tidak dihapus di sini (kuota hapus sandbox, R13a); aman dihapus manual |
| `dist/` — 9,6 MB | gitignored, keluaran build |
| `indexer/validate-report.json` | ditulis ulang setiap `idx:build` dengan path mesin; **jangan di-commit** (R14 §20) |

---

## 8 — Urutan kerja yang disarankan

G1, B13, dan P2c sudah dikerjakan (`96d9e25`, `1630562`, `8547516`). Sisanya,
berurutan — dengan risiko yang dinyatakan lebih dulu, karena dua teratas bukan
tambalan satu baris:

1. **P1b** — 190 KB gz dari first paint admin. Mekanis (10 `lazy()`), tapi
   `TAB_VIEWS` di-type `Record<Tab, FunctionComponent>` justru supaya tab tidak
   bisa hilang, jadi tipenya harus jadi `ComponentType` dan `AdminPanel.test.tsx`
   perlu `waitFor` karena render tab jadi asinkron. Menyentuh 10 berkas; ukur
   ulang pada build, jangan percaya perkiraan.
2. **P2b** — ~30 KB gz dari setiap kunjungan anonim. **Bukan** pemecahan modul
   biasa: kamus `id` adalah default dan `t()` mengembalikan KEY mentah kalau
   entri tidak ada, jadi memecahnya per-rute berarti setiap island non-landing
   harus menunggu kamusnya sebelum render. Butuh keputusan produk (skeleton vs
   key mentah), bukan hanya refactor.
3. **P7** — satu baris konfigurasi, tapi butuh keputusan owner (plan + site-wide).
4. **B8** — keputusan produk: perpanjang sesi, atau hapus kemampuan yang tidak ada.
5. **P4, P5, P6** — pekerjaan throughput; ukur setelah yang di atas.

Satu kandidat baru yang belum masuk daftar, terukur dari kode: `getFreshToken()`
di `apiClient.ts` tetap `await import('./supabase')` (212,7 KB / 56 gz) untuk
setiap pengguna yang login, lalu `isSupabaseConfigured()` menjawab `false` dan
chunk itu tidak dipakai sama sekali. Memperbaikinya berarti predikat host harus
pindah ke modul ringan — dan modul baru menggeser `files.length`, jadi ini
butuh keputusan pemilik dulu.

Setiap item: satu commit, satu tes yang **diamati merah** sebelum perbaikan (R5),
dan **tanpa push** (R19).

> **Jebakan yang sudah menelan satu korban di sesi ini:** jangan menaruh tes baru
> di berkas baru. `src/**` dihitung `files.length` (counter beku 603), jadi
> `src/lib/supabase.test.ts` akan menggeser ratchet tanpa satu baris kode produk
> pun. Tes B13 karena itu masuk ke `apiClient.test.ts`.
