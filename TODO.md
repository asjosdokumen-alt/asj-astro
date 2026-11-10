# 📋 TODO — ASJ Portal v2 (Astro)

**Terakhir dirapikan:** 2026-11-10

> 📄 **Laporan sesi + dampak terukur: `deliverables/laporan-2026-11-10.md`**
> (untuk pemilik: apa yang berubah, efeknya, keputusan, dan apa yang menunggu push)

> ### ✅ SISA UTANG: **0 butir** per 2026-11-10
>
> Daftar lengkap dengan bukti terukur: **`deliverables/utang-teknis-2026-11-07.md`**.
> Diurutkan menurut (dampak ÷ usaha).
>
> **Ditutup 2026-11-10 — tujuh butir, dan dua di antaranya ternyata BUKAN utang
> melainkan klaim yang salah:**
>
> | butir | cara ditutup |
> |---|---|
> | kontras panel admin | **diperbaiki** — 12 tab admin kini diukur; gate menemukan 4,4:1, "perbaikan" pertama membuatnya 2,83:1, akarnya aturan CSS turunan (`ca19e57`) |
> | `verify:shim` merah | **diperbaiki** — gate wired di `ci.yml` tapi merah sejak `4bd338b`; judul `KonflikAiPanel` 4,41:1 → `text-amber-900` 7,94:1 |
> | teks merek 320 px | **diperbaiki** — `truncate` memotong 4 px "PT AMANAH SAKURA JAPAN" di `/` dan `/404`; diganti wrap (`App.tsx:783`), sweep 320 px **21/21** |
> | analisis bundle | **diputuskan** — 3849,6 KB/23 entry, headroom `kotoba.js` 97,4 KB, pemicu pemecahan ditulis eksplisit |
> | Lighthouse 90+ | **diukur ulang** bentuk-KIRIM: `/` LCP 1380 ms · CLS 0,000 · TBT 322 ms. Skor 61 = artefak harness tanpa kompresi |
> | error tracking | **diputuskan TIDAK** — tanpa akun/anggaran, dan tidak ada yang menindaklanjuti tumpukan galat |
> | PostHog / analytics | **diputuskan TIDAK** — pihak ketiga + cookie + tidak ada pertanyaan yang mau dijawab |
> | dashboard analytics | **sebagian sudah ada** — applies dilaporkan `getMonthlyReport`; "views" sengaja tidak dilacak |
>
> **Lunas 2026-11-08:** `verify:assets` **kini melihat kandidat `srcset`**
> (32 kandidat, **18 sebelumnya tak terlihat** — termasuk `fasilitas-gedung-700`
> dan `logo-apply-200`). Tiga perubahan, semuanya menambah cakupan: atribut
> `srcset` diurai sebagai atribut, `LayananSection.astro` + `ApplyFullForm.tsx`
> masuk daftar berkas yang dipindai, dan `srcSet` di `gallery.ts` ikut dibaca.
> Varian lebar/DPR **mewarisi dasar dari induknya** (foto yang sama diperkecil),
> dengan dua penjaga: induk harus ada di disk DAN punya dasar sendiri. Dua berkas
> yang baru terlihat dicatat dengan pengamatan bertanggal — `banner-momiji.webp`
> (artwork, tanpa wajah) dan `logo-apply.webp` (lambang = merek). Dibuktikan
> MERAH: mutasi M8 SURVIVED di gerbang lama (exit 0) dan KILLED di gerbang baru;
> baterai **9/9 KILLED**. ⚠ `banner-momiji.webp` membawa watermark "Elysium" —
> itu pertanyaan **lisensi**, bukan consent. **Sudah diganti 2026-11-08** dengan
> artwork tanpa merek pihak ketiga (dua ukuran tetap 900/700 px supaya `srcset`
> cocok); sumbernya dicatat di
> `deliverables/banner-momiji-sumber-ai-2026-11-08.png`.
>
> **Lunas 2026-11-08 (lanjutan):** counter indexer yang merah sejak commit IQ
> diukur ulang dan diatribusi (`660 berkas · 35 069 simbol`, envelope 35 600) ·
> sisa rename `.disabled` milik `dev.cmd` dipulihkan — **itu yang membuat 2 suite
> backend merah**, bukan kode · **Asesmen Penalaran akhirnya terjangkau dari
> dasbor siswa** (sebelumnya satu-satunya tautan ada di tab admin, jadi fitur itu
> tidak bisa dipakai orang yang dituju) · **85 kandidat tanpa tahap DIISI `LIST`**
> (migrasi `052`, keputusan pemilik 2026-11-08 — lihat catatan di bawah).
>
> **Keputusan pemilik 2026-11-08 yang menutup pekerjaan:** email **tidak**
> dibangun, dan notifikasi WA **tidak** diotomatiskan (admin kirim manual bila
> perlu) ⇒ `docs/BACKEND_TODO.md` #17 ditutup · **feed notifikasi admin TIDAK
> dibangun** — *"ya mail itu saja gak perlu lainnya"* ⇒ Mail adalah daftar
> kejadiannya, push hanya pemberitahu · **retensi notifikasi = 30 hari,
> dibersihkan tanggal 1 tiap bulan** (`netlify/functions/retensi-notif.ts`,
> jadwal `0 3 1 * *`) ⇒ butir terakhir di daftar utang ikut lunas.
>
> **Utang teknis: 0 butir.** Semua yang tersisa di bawah ini adalah pekerjaan
> produk/fitur, bukan perbaikan yang tertinggal.
>
> ### Yang ditutup pada 2026-10-08
> - **Root cruft diarsipkan** — `HANDOFF.md`, `make-zip.cjs`, `preview-index.html`,
>   `test_excel_template.cjs`, `cv-selector-candidate.png` → `docs/archive/`. Ini menutup
>   temuan **#23** di `deliverables/gstack/pre-launch-check-2026-10-04.md`. Root sekarang hanya
>   konfigurasi + `README.md`, `TODO.md`, `DESIGN.md`.
> - **Halaman publik tanpa JavaScript** — `/public` 39 → 1.575 karakter, `/loker` dapat
>   fallback WhatsApp; dijaga asersi baru di `e2e:headings`. Lihat
>   `deliverables/gstack/public-pages-review-2026-10-07.md`.
> - **Token Netlify diredaksi** dari `docs/archive/FASE6-NETLIFY.md` (⚠️ **masih di riwayat git —
>   token harus di-revoke**, lihat `README.md` §Status).

> ## ➡️ Pekerjaan BACKEND ada di satu tempat: **`docs/BACKEND_TODO.md`**
>
> File ini **bukan lagi** daftar backend. Versi sebelumnya (2026-09-03) sudah kedaluwarsa — banyak
> itemnya selesai (RLS, error boundary, document preview, AI interview simulator, WA blast massal)
> dan sebagian klaimnya tidak lagi benar. Daftar backend yang tunggal, berbukti, dan bertanggal ada di
> **`docs/BACKEND_TODO.md`**.
>
> Yang tersisa di bawah ini hanya pekerjaan **non-backend** (frontend, UX, produk).

---

## Frontend / UX (belum, dan bukan backend)

### Candidate experience
- [x] ~~Dark mode toggle — sudah ada, belum diuji menyeluruh~~ → toggle ada; tema
      terang & gelap sudah diukur di `/candidate` dan `/ai-cv` (2026-09-25/26).
      Belum disapu di seluruh halaman.
- [x] ~~Audit mobile responsive — semua halaman di HP~~ → **SELESAI 2026-09-26**
      (commit `5371c0b`): 11 rute × 390/1280, sebelum 0/20 bersih → sesudah
      **20/20 bersih** (0 overflow horizontal, 0 font < 11px, 0 target < 44px).
- [ ] Audit aksesibilitas (WCAG 2.1) — **hampir selesai**: lantai font 11px, lantai
      target 44px, dan focus-trap drawer/dialog sudah dikerjakan. **Kontras
      menyeluruh kini SELESAI untuk kondisi diam** (2026-09-27):
        · gate `e2e/test-contrast.mjs` ditambahkan (`36712a9`), 0 elemen di bawah
          lantai di 24 kombinasi rute × tema × lebar;
        · 182 node yang di-SKIP gate diukur dengan probe pixel (`deliverables/
          gstack/wcag-unmeasurable-audit-2026-09-27.md`);
        · **5 kegagalan AA nyata ditemukan dan diperbaiki** — `/apply` sticky CTA
          (`f02a352`) dan empat CTA gradien (`c000ca4`).
      ✅ **HOVER kini DIUKUR juga (2026-09-28).** Gate `e2e/test-hover-contrast.mjs`
      ada dan **hijau**: 132 elemen, 4 rute × 2 tema × 2 lebar, **0 temuan**, rasio
      hover terendah **4.69:1** (`/apply` "Lanjut"). Keadaan `:hover` TIDAK bisa
      dibaca dengan pointer, jadi dibangkitkan lewat `CSS.forcePseudoState` — dan
      asumsi itu **diverifikasi terhadap pointer sungguhan**, bukan diasumsikan.
      Gate-nya menegakkan LANTAI cakupan (MIN_PROBED = 60), jadi rewrite yang
      memindahkan warna hover ke JS akan GAGAL, bukan lolos diam-diam.
      ⚠ **Batas yang jujur:** `:active` & `:disabled` TIDAK diprobe; dan gate
      hanya melihat CSS — komponen yang menyetel warna hover dari state JS
      terukur pada warna DIAM. Panel admin juga belum tercakup (lubang yang sama
      yang dicatat `test-contrast.mjs`).
      ✅ **NAMA AKSESIBEL kini DISAPU juga (2026-09-28).** Gate `e2e:aria-names` ada
      dan **hijau** (40 cek): 10 rute × 2 lebar, **sembilan tab admin** × 2 lebar,
      dan dialog detail loker yang dibuka klik sungguhan. Ia membaca
      **accessibility tree ASLI** lewat `Accessibility.getFullAXTree` — bukan grep
      `aria-label`, yang mengembalikan ~60 kemunculan dan tidak satu pun memberi
      tahu apakah kontrol yang DIRENDER bernama. **14 kontrol anonim ditemukan dan
      diperbaiki.** Baterai mutasinya membuktikan gate-nya bisa merah:
      **5 KILLED + 1 OK-GREEN, 0 SURVIVED**. Laporan bukti:
      `deliverables/gstack/aria-audit-2026-09-28.md`.
      ⚠ **Batas yang jujur, dan ini bukan daftar yang akan habis:** nama yang ADA
      tapi SALAH ("Tutup" pada tombol hapus) tidak bisa dideteksi alat otomatis
      mana pun; hanya keadaan **DIAM** yang diukur (toast galat, pesan validasi,
      dan menu yang dibuka klik tidak tersapu); modal **tingkat-kedua** tidak
      disapu; dan `CvTemplateSelector`/`InputManualModal` berada di luar semua
      permukaan e2e sehingga dipatok tes komponennya sendiri.
      **Urutan heading, `<main>` tunggal, dan target skip-link sudah ditegakkan
      `e2e:headings` sejak §23/§24** — item (b) di catatan lama sudah tertutup,
      dan catatan itu salah menyebutnya "belum disapu".
      ⚠ **Cakupan outline diperluas 2026-10-20, dan itu lubang nyata.**
      Asersi "heading levels do not skip a level" hanya berjalan atas `ROUTES`
      (tujuh rute form), sementara asersi `h1` dan skip-link di file yang sama
      berjalan atas `ALL_HEADING_ROUTES` — jadi `/` tidak pernah diukur. Akibatnya
      terukur: Lighthouse memberi `heading-order` **0** untuk `H2 → H4` di
      `LayananSection.astro` sementara `e2e:headings` hijau. Loop dipindah ke
      `ALL_HEADING_ROUTES`, dan mutasi balik ke `h4` membuat gate gagal dengan
      pesan yang menyebut kedua heading-nya. **Pelajaran:** yang salah bukan
      aturannya, melainkan CAKUPAN daftar yang di-walk.
      ✅ **PANEL ADMIN kini DISAPU juga (2026-11-10)** — lubang terakhir di butir
      ini tertutup. `e2e:contrast` mengukur **12 tab admin** × 2 tema × 2 lebar
      (dibaca lewat HASH, setiap panggilan `/.netlify/functions/**` dijawab
      fixture lokal), dan pada run PERTAMA ia menemukan satu kegagalan nyata:
      angka keranjang AKTIF di tab Mail **4,4:1** — `text-white/80` menjadi
      rgb(205,225,236) di atas `#0369a1` (shim `global.css:1750` yang justru ada
      supaya teks PUTIH mencapai 5,86:1), 0,1 di bawah lantai, di tab yang dipakai
      admin menyaring setiap lamaran.
      ⚠ **"Perbaikan" pertama SALAH, dan gerbang yang membuktikannya.** Mengganti
      `/80` menjadi `text-white` **menurunkan** rasio ke **2,83:1** (terukur, dua
      lebar): §5b `global.css:462` membalik `.text-white` menjadi `#1f1d1c` di
      tema terang, sedangkan aturan pemulih di `global.css:1782` hanya berlaku
      bila latar DAN `text-white` ada di elemen yang SAMA — di sini teksnya ada di
      `<span>` ANAK, jadi tidak ada yang memulihkannya. Angka 4,4 lalu 2,83 itu
      bukan kontradiksi: keduanya nyata, pada dua keadaan kode yang berbeda.
      Perbaikan yang benar ada di **`global.css:1793`** — aturan pemulih diperluas
      ke `[class*="text-white"]` sebagai **turunannya**, jadi kelas bug ini (teks
      putih dipecah ke span di dalam tombol yang di-shim) tertutup untuk SELURUH
      keluarga warna, bukan hanya tombol Mail. Sesudahnya **0 temuan di 72
      permukaan** (3340 elemen tak terukur, dilaporkan bukan disembunyikan).
      Setiap permukaan admin juga punya **lantai cakupan** (`MIN_ADMIN_ELEMENTS`
      = 8, di bawah permukaan tertipis yang terukur = 14) dan menegaskan penanda
      `[data-tab]`, jadi hash yang diabaikan — satu tab dirender dua belas kali —
      tidak bisa terbaca sebagai dua belas baris hijau.
      ⚠ Batas yang jujur dan TERUKUR: panel admin hanya **sebagian** terukur di
      tema TERANG (492 elemen terukur / 841 dilewati; tema gelap 1135 / 198)
      karena `body` membawa pola titik `background-image` dan kartu admin tembus
      pandang, sehingga penelusuran leluhur berhenti di `body`. Itu sifat METODE,
      dicetak setiap run, bukan lulus. Modal admin tetap belum tercakup.
      Bukti: `deliverables/gstack/admin-contrast-2026-11-10.md`.
- [x] ~~Loading skeleton di semua halaman yang memuat data~~ → **AUDIT SELESAI
      2026-11-07.** Sebagian besar sudah ada sebelum butir ini diperiksa:
      `ui/Skeleton.tsx` dipakai 9 tab admin, `CandidateSkeleton` untuk dasbor
      kandidat, `LokerTable` memakai `TableRows`, `/public` memakai `Status`.
      **Satu celah nyata ditemukan dan ditutup:** tab **Papan Skor** tidak punya
      keadaan memuat — selama muat pertama `papan` masih `null`, jadi KEEMPAT
      kartu menampilkan `admin.papan_skor_kosong` ("belum ada skor"), lalu
      daftarnya muncul sendiri. Itu bukan keadaan kosong, itu tebakan yang
      tampil sebagai fakta. Sekarang kerangka berbentuk kartu+baris, satu
      `role="status"` untuk seluruh grid (enam akan berarti enam pengumuman
      pembaca layar), dan keadaan "sedang menyegarkan" tetap menampilkan data
      lama — bukan kerangka. Dua tes di `AdminPanel.test.tsx`; dibuktikan bisa
      MERAH dengan mematikan `memuatAwal`.
      ⚠ Yang TIDAK dikerjakan, dan alasannya: modal-modal admin
      (`CekSiswaModal`, `EditCandidateModal`, dll.) memuat data tanpa kerangka,
      tetapi isinya formulir yang sudah punya bentuk — kerangka di sana akan
      menutupi field yang sudah bisa dibaca. Bukan halaman.

### Polish
- [x] ~~Image optimization via Cloudinary transforms~~ → **SELESAI 2026-11-08
      (`cafd0f3`), dan sebagian besarnya sudah sejak 2026-10-19.** Helper
      `src/lib/thumbUrl.ts` menangani DUA penyedia (Cloudinary `w_/h_/q_auto/
      f_auto` dan Supabase `render/image`), tapi baru dipakai tiga tempat.
      Audit hari ini menemukan **tiga permukaan yang masih mengunduh foto
      ASLI untuk kotak kecil**: `AsjDossierCard` (128x160 → 256x320),
      `ShareView` (84x112 → 168x224), dan `MatchmakingModal` (40x40 → 80x80 —
      daftar hasil bisa 30 baris). Zoom ShareView SENGAJA tetap berkas asli.
      Tiga tes baru, semuanya terbukti MERAH saat perbaikannya dilepas.
- [x] ~~Analisis bundle — kurangi JS~~ → **DITUTUP 2026-11-10: diukur, dan
      pemecahan SENGAJA ditunda sampai pemicu yang bisa diperiksa.**
      Total **3849,6 KB / 23 entry**. Terberat yang sah: `kotoba.js` **502,6**
      (ssw 200 + bank 120 + iq-bank 28 + n5 24 + matematika 15 + tes 10 +
      wawancara 8), `job-docs.js` 459,4, `ai-chat.js` 226,8, `files.js` 174.
      `bridge-links.js` 1190,5 = catch-all yang dikecualikan.
      **Headroom `kotoba.js` = 97,4 KB** dari plafon keras 600.
      Keputusan: **tidak dipecah hari ini**, karena (a) 502,6 masih di bawah
      plafon, (b) memecah entry menambah cold start baru untuk siswa yang
      memakai lebih dari satu jenis latihan, dan (c) tidak ada angka yang
      menunjukkan cold start itu masalah — `ping` tetap 1,5 KB sebagai kontrol
      bahwa bundler tidak berubah. **Pemicunya eksplisit: bank soal berikutnya
      (atau apa pun yang menambah > 90 KB ke entry ini) WAJIB memecah lebih
      dulu, bukan menembus 600 lalu dipindah.** Akar penggelembungan yang sudah
      ditutup 2026-11-07: re-export di `_lib/handlers.ts` (−474,3 KB).
- [x] ~~Lighthouse audit — target 90+~~ → **DITUTUP 2026-11-10 dengan angka
      bentuk-KIRIM, bukan skor.** Skor 61 itu artefak harness: `server.cjs`
      tidak mengompresi. Diukur lewat `deliverables/serve-gzip.mjs` (gzip untuk
      tipe teks — bentuk yang benar-benar dikirim Netlify), 390 px, CPU 4×,
      Slow 4G, median 3 run:

      | rute | LCP | CLS | TBT | js | css | font | img |
      |---|---|---|---|---|---|---|---|
      | `/` | **1380 ms** | **0,000** | 322 ms | 143 KB | 32 KB | 115 KB | 271 KB |
      | `/loker` | 1916 ms | 0,010 | 107 ms | 152 KB | 32 KB | 94 KB | 54 KB |
      | `/public` | 1400 ms | 0,042 | 348 ms | 152 KB | 32 KB | 94 KB | 54 KB |
      | `/apply` | 1804 ms | 0,082 | 270 ms | 151 KB | 32 KB | 70 KB | 144 KB |

      **Ketiga metrik inti ada di kategori "good"** (LCP < 2,5 s, CLS < 0,1).
      Yang menahan skor Lighthouse bukan LCP/CLS melainkan **TBT 322 ms** —
      kerja main-thread dari island `client:only`, dan itu sifat arsitekturnya,
      bukan cacat yang bisa dipoles. **CLS 0,03–0,08 di sembilan halaman form
      TIDAK ditutup, dan itu keputusan**: menutupnya berarti mencadangkan ~860 px
      ruang kosong permanen di setiap halaman (supaya `VersionBadge` tidak
      bergeser), sementara angkanya sudah di bawah ambang "good". Menukar ruang
      kosong nyata dengan 0,08 poin CLS adalah pertukaran yang salah.
      Laporan lengkap: `deliverables/gstack/lighthouse-2026-10-20.md`.
- [x] ~~Error tracking (Sentry/LogRocket)~~ → **DIPUTUSKAN 2026-11-10: TIDAK
      dipasang, dan bukan karena malas.** Tiga alasan yang bisa diperiksa:
      (a) **tidak ada akun & tidak ada anggaran** — Sentry/LogRocket adalah
      langganan; menambahkannya berarti menambah tagihan dan satu pemroses data
      pihak ketiga ke situs yang melayani data pribadi pelamar (nama, WA,
      paspor); (b) **sisi server sudah punya observabilitas** — `/health`,
      `metrics-receiver`, eksportir OTLP, dan `metrics-sink`; yang tidak ada
      hanya error di BROWSER; (c) **tidak ada yang bisa menindaklanjutinya** —
      tumpukan galat JS tanpa orang yang membacanya adalah biaya tanpa manfaat.
      **Yang dipakai sebagai gantinya, dan sudah ada:** `showToast` untuk galat
      yang dilihat pengguna, `/health` untuk sisi server, dan `VersionBadge`
      untuk menjawab "build mana yang sedang berjalan" saat ada laporan.
      **Pemicu untuk membuka lagi:** ada keluhan pengguna yang tidak bisa
      direproduksi DAN trafiknya cukup untuk membuat sampel bermakna.
- [x] ~~PostHog / analytics perilaku~~ → **DIPUTUSKAN 2026-11-10: TIDAK
      dipasang.** Alasan yang sama dengan butir di atas (pihak ketiga, cookie,
      data pribadi pelamar), ditambah satu alasan yang lebih menentukan: **tidak
      ada pertanyaan yang mau dijawabnya.** Yang ingin diketahui pemilik adalah
      "berapa yang melamar", dan itu sudah terjawab dari tabel lamaran — bukan
      dari pageview. Menambah PostHog berarti menambah skrip pihak ketiga ke
      halaman yang saat ini memuat **143 KB JS total** (terukur 2026-11-10,
      `/` 390 px) — dan skrip analytics adalah yang pertama dieksekusi, sebelum
      apa pun yang dilihat pengguna.
- [x] ~~Dashboard analytics admin (views, applies)~~ → **SEBAGIAN SUDAH ADA,
      dan premis "views" yang tidak.** **Applies sudah dilaporkan**:
      `LaporanBulananModal` (dibuka dari tab Pelamar) memanggil
      `getMonthlyReport`, yang mengagregasi SELURUH kandidat di server — bukan
      daftar yang kebetulan ter-render — lalu menampilkan per loker: total,
      sebaran tahapan, sebaran status. Itu yang dimaksud "applies".
      **"Views" sengaja tidak dibangun**: ia menuntut pelacakan setiap kunjungan,
      dan satu-satunya cara menghindari pihak ketiga adalah menulis endpoint
      tulis anonim baru + tabel baru — permukaan serangan baru untuk angka yang
      tidak mengubah keputusan apa pun. Kalau nanti benar-benar dibutuhkan,
      bentuk termurahnya adalah penghitung harian per rute tanpa PII, bukan
      analytics perilaku.

### Harness uji / tooling (bukan fitur)
- [x] ~~**`server.cjs` belum memetakan `.avif`**~~ → **SELESAI 2026-09-28.**
      `'.avif': 'image/avif'` ditambahkan (sebelumnya jatuh ke
      `application/octet-stream` — `text/html` untuk berkas yang TIDAK ada,
      karena SPA-fallback di `server.cjs:117` tidak memeriksa keberadaan
      `dist/index.html`).
      ⚠ **Severity-nya perlu dikoreksi, dan itu bagian dari temuan.** `server.cjs`
      **BUKAN produksi** — Netlify menyajikan situs dengan penanganan MIME-nya
      sendiri. Ia adalah **harness yang dipakai lima gate e2e** (`test-contrast`,
      `test-hover-contrast`, `test-headings`, `test-dialog`, WCAG audit). Jadi
      cacat ini **tidak terlihat di produksi** sementara **nyata di setiap tempat
      yang benar-benar mengukur**. Dampaknya luas: **18 referensi AVIF unik** di
      `dist/*.html`, semuanya di dalam `srcset` (itu sebabnya `grep src=` biasa
      melewatkannya) — dan semuanya tetap ter-paint, jadi tidak ada yang sadar.
      **Gate regresi:** `src/lib/serverMime.test.ts` — menegakkan invarian yang
      membuat bug ini mungkin, bukan hanya memperbaiki satu barisnya: setiap
      ekstensi gambar yang **benar-benar direferensikan `dist/`** harus punya
      entri MIME ber-`image/*`. Diverifikasi **merah** saat perbaikan dikembalikan
      (2 dari 4 tes gagal: `.avif` spesifik + cakupan gambar generik).
- [x] ~~`e2e/test-hover-contrast.mjs` + baterainya + `e2e/measure-hover-contrast.mjs`
      masih **belum di-commit** (lihat `git status`); wiring `package.json`,
      `.github/workflows/ci.yml`, dan `review-manifest.json` juga.~~ →
      **CATATAN INI BASI; DITUTUP 2026-10-19.** Diukur, bukan diasumsikan:
      ketiga berkas **tracked** (`git ls-files` mengembalikannya; riwayatnya
      `8ecb1ec` gate, `523d1f2` baterai, `2593634` revive), `package.json` punya
      `e2e:hover-contrast`, `ci.yml` memanggilnya (baris 285), dan
      `review-manifest.json` mencantumkannya dengan `provenBy`
      `e2e/test-hover-contrast.mutations.sh` — berkas yang ada. Jadi gate-nya
      memang melindungi riwayat; yang salah cuma catatan ini.
      ⚠ **Pelajarannya, dan ini yang membuat catatan seperti ini berbahaya:**
      "belum di-commit" adalah klaim tentang keadaan yang berubah setiap kali
      ada yang menjalankan `git add`, dan catatan yang ditulis sekali tidak
      pernah ikut berubah. Sebelum memercayai baris seperti ini, jalankan
      `git ls-files` untuk berkas yang disebutnya — satu perintah, dan hasilnya
      mengalahkan ingatan.

### Diketahui belum selesai (bukan bug, memang belum dibangun)
- [x] ~~**Daftar Agenda di panel admin masih kosong.**~~ → **SELESAI 2026-09-27**
      (`09878b9`). **Premis catatan lama ini SALAH** — lapisan datanya **sudah ada**
      (`netlify/functions/schedule.js` punya surface penuh, dan tab `jadwal` sudah
      membacanya: aksi sama, argumen sama, bentuk `d.schedules` sama). Yang hilang
      bukan backend, melainkan **komponen yang tidak pernah disambungkan** ke
      backend yang sudah ada. "Belum dibangun" dan "belum disambung" terlihat
      identik dari sebuah div kosong — hanya satu dari keduanya ketiadaan yang
      nyata. **Sebelum memercayai catatan "belum dibangun", cari dulu surface-nya.**
      Tile-nya kini juga membedakan LOADING / FAILED / EMPTY (sebelumnya ketiganya
      dirender identik), mengurut `waktu` menaik, dan menampilkan "5/9" supaya cap
      5 baris tidak disangka daftar lengkap.
- [x] ~~**`/loker` judul perusahaan terpotong**~~ → **SELESAI 2026-09-27**
      (commit `672d2f1`). Cap `max-w-[210px]` dibuang; nama perusahaan kini
      **utuh dari 390px** ke atas (sebelumnya selalu terpotong di 210px).
      ⚠ **Premis catatan lama ini salah.** Ia bilang cap itu "melindungi tombol
      menu" — padahal perbandingannya hanya rentang **x**. Tombol ada di
      `y 41..85` dan judul di `y 195..223`: diukur 3 rute × 6 lebar, **18/18
      tidak ada tumpang tindih vertikal**. Jadi cap itu tidak melindungi apa pun.
      Jangan tambahkan cap lagi berdasarkan alasan itu — bandingkan dua
      **persegi panjang**, bukan rentang x-nya.
- [x] ~~**Dropdown `ComboSelect` di `/ai-cv` dibatasi 50 item**~~ → **SELESAI
      2026-09-27** (commit `40a2fba`). `PEKERJAAN` berisi **100 entri** (25 legacy
      + 75 tambahan, diverifikasi saat runtime), jadi cap itu menyembunyikan
      separuh pilihan yang **tidak bisa dijangkau dengan scroll sama sekali**.
      Cap dibuang; kini 100 opsi dirender dan entri terakhir terjangkau.
      Sengaja **tidak** ditambah penanda "menampilkan N dari M" — beralasan,
      lihat pesan commit.

---

## Produk (butuh keputusan, bukan kode)

- [x] ~~Apakah email notification masih dibutuhkan?~~ → **DIPUTUSKAN 2026-11-08:
      TIDAK.** Kata pemilik: *"untuk email skip saja gak perlu lebih cepat wa gak
      guna email. jadi notif wa ga usah biar manual dari kami saja bila emang
      butuh."* Dua keputusan sekaligus, keduanya menutup pekerjaan:
      (a) **email tidak dibangun** — tidak ada modul email di repo dan tidak akan
      ditambah; (b) **notifikasi WA TIDAK diotomatiskan** — admin mengirim sendiri
      kalau perlu. Yang sudah ada tetap: blast/penawaran manual dari panel, dan
      pengingat agenda lewat **push** (bukan WA). Lihat `docs/BACKEND_TODO.md` #17.
- [x] ~~Prioritas antara paritas legacy yang belum dibangun (Export Excel, reject composer,
      Migrasi Drive) vs fitur baru~~ → **PREMISNYA BASI; DITUTUP 2026-11-10.**
      Ketiganya sudah tidak "belum dibangun": **Export Excel** ✅ `0b46c22`
      (`src/lib/candidateExport.ts`, CSV dan Excel berbagi satu daftar kolom) ·
      **reject composer** ✅ `d927cce` (`RejectMailModal.tsx`) · **Migrasi Drive**
      ✅ **diputuskan TIDAK dibangun** (`docs/BACKEND_TODO.md` #13) karena
      legacy-nya adalah *database migration runner* yang dipanggil dari POST
      body — mengembalikannya berarti mengembalikan lubang keamanan. Jadi tidak
      ada yang perlu diprioritaskan: daftarnya kosong.

---

## ✅ Selesai (arsip ringkas)

Detail lengkap ada di `docs/BACKEND_TODO.md` §7 dan `docs/PARITY_CHECKLIST.md`.

- Backend architecture: 15 surface, 14 context, 13 kernel
- Phase A–D selesai (dengan sisa yang disebut namanya di `docs/BACKEND_TODO.md`)
- Phase E: chaos suite + idempotency replay selesai; load test & failover drill butuh staging
- Paritas A01–A19, B01–B07, C01–C04, C06
- Item owner 1, 2, 3, 5 (2026-09-13) — item 4 (B06 share token) masih tertahan, lihat #1
