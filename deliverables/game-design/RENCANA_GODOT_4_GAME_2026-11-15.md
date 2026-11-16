# Rencana upgrade 4 game belajar ke Godot (tetap PWA)

Status: **RENCANA — belum ada kode yang diubah**. Dokumen ini satu-satunya artefak
yang ditambahkan sesi ini. Disimpan di `deliverables/` supaya tidak menggeser
inventori beku indexer / lint-ratchet.

Disusun 2026-11-15 untuk menjawab tiga pertanyaan pemilik:

1. Apakah semua game bisa di-upgrade jadi Godot game?
2. Bisakah tetap berupa PWA?
3. Tanpa aset game sama sekali, bagaimana menghilangkan kesan repetitif/membosankan?

---

## 0. Jawaban pendek

**Bisa secara teknis, tapi jawaban yang benar adalah "jangan semuanya dijadikan
Godot penuh".**

Godot 4 Web (WASM + WebGL2) bisa disisipkan ke dalam halaman Astro yang sudah ada,
jadi PWA-nya tidak hilang: `manifest.webmanifest`, `public/sw.js`, gerbang VIP,
i18n, dan tema tetap dipegang shell. Yang berubah adalah **lapisan visual &
rasa bermain**, bukan otak aplikasi.

Alasan tidak full-migrasi:

| Masalah | Konsekuensi kalau 4 game ditulis ulang penuh di canvas Godot |
|---|---|
| Teks Jepang | Godot butuh font CJK yang di-embed (MB) atau `SystemFont` yang tidak reliabel di Web. Teks di canvas juga tidak bisa diseleksi, tidak terbaca pembaca layar |
| Aksesibilitas | Gerbang `e2e:labels`, `e2e:aria-names`, `e2e:contrast`, `e2e:hover-contrast` membaca DOM; canvas = bitmap buram |
| i18n & tema | `useLang()` dan token `data-theme` (dark/light shim) tidak menjangkau isi canvas |
| Gerbang VIP | Bank soal dari `getBankKotoba` / `getBankMatematika` dijaga server. Kalau bank dibakar ke `.pck` (file statis publik), siswa non-VIP tinggal unduh |
| Berat unduhan | Engine web Godot ~9–10 MB gzip (wasm ~37 MB mentah) + `.pck`, versus precache PWA sekarang **136 entri / 3.688 KB** |
| Dua service worker | Opsi PWA bawaan Godot membuat SW sendiri; bentrok dengan `public/sw.js` yang sudah ada |

**Rekomendasi: arsitektur hybrid "Host = otak, Godot = otot".**
Host (Astro/Preact) tetap memegang data, aturan skor, Leitner, misi harian,
papan peringkat, TTS, bahasa, tema, dan aksesibilitas. Godot hanya menjadi
**mesin render + juice + interaksi spasial**, menerima data lewat jembatan JSON.

Dan yang paling penting: **rasa bosan bukan masalah mesin**. Ia datang dari
tidak adanya variasi, progresi lintas game, dan umpan balik yang terasa. Itu
bisa (dan sebaiknya) dibenerin **lebih dulu di stack sekarang**, sebelum atau
bersamaan dengan spike Godot. Mengganti mesin tanpa mengubah loop permainan
hanya menghasilkan "soal yang sama, tapi berkedip".

---

## 1. Fakta terukur dari repo (bukan asumsi)

### 1.1 Empat game yang dimaksud

Sumber kebenaran: `netlify/functions/_lib/game/leaderboard.ts:32`
`GAME_SAH = ['kotoba', 'genba', 'combo', 'matematika']` — sama dengan
`src/lib/skorGame.ts:28` dan CHECK constraint migrasi 043.

| # | Game | Halaman | Komponen | Karakter |
|---|---|---|---|---|
| 1 | **Genba Order Rush** (`genba`) | `/arcade` | `ArcadeGame.tsx` (1.437 baris) | Real-time, timer 4–9 dtk, dengar perintah TTS, taruh barang ke rak, nyawa, bintang S–D |
| 2 | **Kotoba Combo Builder** (`combo`) | `/arcade` | `ArcadeGame.tsx` | Susun kartu kalimat + partikel, timer per kalimat, kombo ×1–×10 |
| 3 | **Kotoba** (`kotoba`) | `/kotoba` | `KotobaGame.tsx` (2.215 baris) | 4 mode (kuis/ketik/flashcard/kamus), Leitner 5 kotak, bobot kata lemah, gelar, streak, misi harian 20 kata |
| 4 | **Matematika & psikotes** (`matematika`) | `/matematika` | `MatematikaGame.tsx` (1.276 baris) | 20 soal campuran 14 kategori, kurva easy→hard, 6 dimensi profil, `FigurSvg` rotasi/cermin |

"Dan lain-lain" = `/tes-iq`, `/tes-mata`, `/tes-mbti`, `/wawancara`. Ini
**asesmen**, bukan game: satu jawaban, dinilai server, butuh aksesibilitas
tinggi. **Tidak masuk fase 1**, hanya boleh dapat polesan kosmetik belakangan.

### 1.2 Kondisi sekarang

- Bank besar: `src/lib/arcade.ts` 2.473 baris, `src/lib/matematika.ts` 1.557,
  `src/lib/tesSeleksi.ts` 755. Bank Kotoba/Matematika ditarik dari server lewat
  `apiClient`; Arcade ada di bundel (`/arcade` jalan offline).
- Progres: `localStorage` per game + `skorGame.ts` → `game_scores` (server).
- Suara: `speechSynthesis` (TTS), **nol berkas audio**.
- Visual: **nol raster game**. CSS gradien/grid, `ArcadeIkon` (27 SVG
  `currentColor`), `FigurSvg` (gambar sebagai data). Dokumen
  `arcade-systems-2026-11-05.md` §6 dan `matematika-kotoba-2026-11-05.md` §3.2
  sudah memutuskan "0 KB aset baru" dengan alasan offline + dua tema + kanji.
- Bundle game: Arcade 121 KB, Kotoba 32 KB, Matematika 47 KB (JS hasil build).
- PWA: `public/sw.js` + `scripts/build-sw-manifest.mjs` +
  `public/manifest.webmanifest`. Precache hasil build = **136 URL / 3.688 KB**.
  `build-sw-manifest` **hanya** menyapu `dist/_astro`, HTML, rute direktori, dan
  `/icons/sprite.svg`. File di `public/godot/` **tidak akan ikut precache**.
- `sw.js` `activate` menghapus **semua** cache selain `VERSION`
  (`keys.filter((k) => k !== VERSION)`), dan itu dipegang tes
  `src/lib/swOffline.test.ts`. Cache terpisah untuk Godot akan ikut terhapus
  tiap update aplikasi kalau aturan ini tidak diubah + diuji.
- Gerbang terkait: `verify:pwa`, `src/lib/swOffline.test.ts`, `bundle:size`
  (plafon 600 KB/entri, total 10.240 KB), `verify:assets`, `lint-ratchet`,
  indexer (inventori beku), `e2e:*` aksesibilitas/kontras.
- Backlog yang sudah tercatat di `arcade-systems-2026-11-05.md` §8: tujuan harian
  + ringkasan sesi Kotoba, kesulitan adaptif Matematika, **satu "paspor latihan"
  lintas game di server**, papan peringkat per tingkat.

---

## 2. Batasan Godot Web yang menentukan desain

Diukur terhadap Godot **4.7.2 stable** (rilis 18 Agustus 2026):

| Hal | Keputusan |
|---|---|
| Renderer | Wajib **Compatibility** (WebGL2). Forward+/Mobile berbasis Vulkan, tidak ada di browser |
| Thread | **Thread Support OFF** (single-threaded). Build ber-thread butuh `SharedArrayBuffer` + header `COOP: same-origin` / `COEP: require-corp`, yang akan memutus resource lintas-origin (Supabase, Cloudinary, font) |
| Bahasa | **GDScript**. C#/.NET tidak bisa di-export ke Web sampai 4.7.2 |
| PWA bawaan | **DIMATIKAN**. Godot membuat SW + manifest sendiri; kita sudah punya `public/sw.js`. Pakai custom HTML shell atau JS `Engine` API untuk menempelkan canvas ke halaman Astro |
| Template | Wajib sama persis dengan editor; sejak 4.5 template butuh WASM SIMD → perlu uji perangkat lama |
| Ukuran | Engine ~37 MB mentah / ~9,4 MB gzip + `.pck`. **Satu** proyek Godot dengan 4 mode (1 wasm + 1 pck), bukan 4 export terpisah |
| Font | Teks Jepang jangan ditaruh di canvas. Overlay HTML, atau subset Noto Sans JP (aset baru, harus jadi keputusan sadar) |
| Audio | Butuh gestur pengguna pertama; audio web Godot 4.3+ memakai Web Audio sample (tanpa efek/procedural). TTS tetap lewat jembatan ke `speechSynthesis` host |
| Simpanan | `user://` = IndexedDB. **Jangan dipakai** — sumber kebenaran tetap `localStorage` + server, supaya tidak ada otak ganda |
| Safari/iOS | WebGL2 & memori lebih ketat, tab background dijeda, fullscreen butuh input event. Wajib uji perangkat nyata |
| MIME/kompresi | `.wasm` harus `application/wasm`, aktifkan Brotli di `netlify.toml` |

---

## 3. Arsitektur usulan

```
┌─────────────────────── PWA shell (Astro / Preact) ───────────────────────┐
│ BaseLayout · App · tema · useLang · gerbang VIP · FormToolbar · <noscript> │
│ HUD / teks Jepang / input / hasil / rekap / aksesibilitas  (DOM)           │
│ OT AK: bank, skor, Leitner, misi harian, apiClient, skorGame, leaderboard │
└───────────────┬──────────────────────────────────────┬───────────────────┘
                │ jembatan JSON (postMessage ↔ JavaScriptBridge)            │
                │  host→godot: init, ronde, seed, palet, bahasa, jeda      │
                │  godot→host: jawab, benar/salah, combo, selesai, telemetry│
┌───────────────▼──────────────────────────────────────▼───────────────────┐
│ Godot 4.7.2 Web · 1 engine · 1 .pck · Compatibility · single-threaded    │
│  scene: Genba / Combo / Figural / Kotoba-Garden                            │
│  SEMUA visual dibuat dari kode: shader, draw_*, Polygon2D, partikel, Tween│
└──────────────────────────────────────────────────────────────────────────┘
```

**Kontrak jembatan (versi 1, harus punya tes yang bisa gagal):**

```
Host → Godot : { v:1, type:'init'|'round'|'pause'|'theme'|'lang',
                 game:'genba'|'combo'|'matematika'|'kotoba',
                 seed:string, payload:object, palette:Record<string,string> }
Godot → Host : { v:1, type:'ready'|'answer'|'hit'|'miss'|'combo'|'finish'|'error',
                 game:string, payload:object }
```

Aturan keras:

1. **Bank soal tidak pernah masuk `.pck`**. Godot menerima hanya soal ronde
   ini dari host; gerbang VIP tetap di server.
2. Godot **tidak menghitung skor final**, tidak menulis `localStorage`, tidak
   memanggil API. Ia mengirim *event*, host yang menilai & menyimpan.
3. Semua game logika (`arcade.ts`, `matematika.ts`, Leitner, rekap) tetap
   di TypeScript dan tetap diuji Vitest seperti sekarang.
4. Jembatan punya mock di sisi host, sehingga adegan Godot bisa diuji tanpa
   browser, dan halaman bisa diuji tanpa Godot (R5: tes harus pernah merah).
5. **Fallback**: kalau WebGL2/WASM gagal atau engine gagal dimuat, halaman
   kembali ke renderer DOM yang lama. Tidak ada layar blank.

**Strategi offline (opsi yang disarankan: A):**

| Opsi | Perilaku | Biaya |
|---|---|---|
| **A. Online-first + fallback DOM (REKOMENDASI)** | Engine diunduh sekali saat game Godot pertama dibuka, disimpan di cache bucket `asj-godot-v1` oleh SW; offline → pakai cache kalau ada, kalau tidak → DOM lama | Install PWA tetap ~3,7 MB; game pertama butuh jaringan |
| B. Full offline pack | wasm + pck ikut precache saat install | Precache ~13 MB, install berat di kelas sinyal buruk |
| C. Tanpa offline Godot | PWA tetap terpasang, game butuh jaringan | Melemahkan janji PWA |

Konsekuensi opsi A: `activate` di `sw.js` harus mengecualikan bucket
`asj-godot-*`, dan `swOffline.test.ts` + `verify:pwa` harus diubah & diuji.
`build-sw-manifest.mjs` butuh daftar artefak Godot yang eksplisit (hash
konten → nama cache), supaya update game tidak menyajikan engine basi.

---

## 4. Desain ulang anti-repetitif (inti dari keluhan)

Lima pilar yang **tidak membutuhkan satu pun aset gambar**:

1. **Seed harian + dek modifier.** `seed = hash(no_wa + tanggal)` menentukan
   tata letak, urutan gelombang, dan satu "kondisi shift" hari itu (rak
   tercermin, TTS lebih cepat, lampu redup, waktu lebih ketat, bonus jenis
   tertentu). Besok terasa beda, hari ini adil untuk semua siswa.
2. **Juice (umpan balik 100 ms).** Godot: screen shake, hit-stop
   (`Engine.time_scale`), flash, jejak kombo, partikel debu/confetti, kamera
   punch, stempel nilai beranimasi. Ini yang paling murah dan paling terasa.
3. **Paspor Latihan lintas game.** Satu sumber kebenaran di server: total
   bintang (maks 9), gelar Kotoba, streak, misi harian, tantangan mingguan.
   Sudah tercatat sebagai utang di `arcade-systems-2026-11-05.md` §8.
   Membuka tujuan yang habis dalam satu duduk, bukan sekadar "skor naik terus".
4. **Sesi yang punya akhir & tindak lanjut.** Shift 60–120 dtk, kartu hasil,
   "latih yang salah", peta penguasaan, rekap per dimensi; kesulitan adaptif
   dari 3 soal terakhir (utang yang sudah tercatat).
5. **Kosmetik hasil kode, bukan file.** Palet, pola bingkai, gaya partikel,
   stempel — dibuka lewat pencapaian. Tetap mengikuti token tema host, jadi
   benar di dark & light tanpa dua set aset.

### 4.1 Perlakuan per game

| Game | Keputusan | Desain ulang |
|---|---|---|
| **Genba Order Rush** | **Godot penuh (pilot)** | Gudang prosedural dari `draw_*` + grid shader; barang bisa di-drag, jatuh, mental; rak 4→6→8 mengikuti kombo; modifier harian; "shift bos" di akhir minggu; TTS tetap host; teks perintah Jepang overlay DOM |
| **Kotoba Combo Builder** | **Godot + overlay teks** | Kartu jadi objek fisik (Tween, snap, tolak saat partikel salah), jejak kombo, bonus kalimat selesai meledak; kalimat 13 kartu jadi "boss"; teks kana/kanji tetap HTML di atas canvas |
| **Kotoba** | **DOM tetap + 1 adegan Godot** | Kuis/ketik/flashcard/kamus tidak dipindah (aksesibilitas, 1.440 kata, TTS). Tambah **"Kotoba Garden"**: adegan prosedural yang tumbuh sesuai Leitner & misi harian — kata dikuasai = daun, streak = musim, gelar = stempel. Ini hadiah visual tanpa mengubah jalur belajar |
| **Matematika & psikotes** | **DOM tetap + modul Godot sempit** | Soal, opsi, rekap 6 dimensi tetap HTML. Godot hanya untuk **figural/spasial interaktif** (putar/cermin bentuk dengan gesture, bukan pilih ganda) + animasi stempel hasil. Lanjutkan kesulitan adaptif & penguasaan per kategori |
| **Lain-lain (tes-iq/mata/mbti/wawancara)** | **Tidak disentuh fase 1** | Asesmen, bukan game; nilainya dipakai administrasi. Risiko aksesibilitas paling besar |

Catatan: keputusan "nol aset" yang sudah dibuat di dua dokumen desain lama
**tetap dipegang**. Godot justru mempermudahnya: shader & prosedural adalah
bahan bakunya, jadi tidak ada gambar AI yang salah menulis kanji.

---

## 5. Roadmap (urut, satu fitur utuh per fase)

| Fase | Isi | Selesai kalau | Gerbang yang tersentuh |
|---|---|---|---|
| **0. Baseline & keputusan** | Ukur baseline hijau (`vitest`, `lint-ratchet`), kunci 4 game + opsi offline, tulis ADR & kontrak jembatan, tetapkan angka batas (byte, waktu boot, FPS) | ADR disetujui; angka batas tertulis; **belum ada kode produksi berubah** | tidak ada |
| **0.5 Redesign tanpa Godot (bisa paralel)** | Paspor Latihan di server, seed harian + dek modifier, misi harian, kartu hasil, adaptif 3 soal terakhir — dikerjakan di stack sekarang | 4 game terasa berbeda dalam seminggu pemakaian; metrik sesi naik | Vitest, e2e game, `bundle:size` |
| **1. Spike vertikal: Genba** | 1 proyek Godot 4.7.2, GDScript, Compatibility, thread OFF, PWA bawaan OFF, custom shell, jembatan v1, 1 adegan prosedural, 0 aset, fallback DOM, lazy cache | Boot < batas, first-load < batas, 390×844 & iOS Safari hijau, tes jembatan pernah merah, DOM fallback terbukti | `sw.js`, `build-sw-manifest.mjs`, `swOffline.test.ts`, `verify:pwa`, `netlify.toml` |
| **2. Shadow / A-B** | Flag per kelas: Godot vs DOM lama berdampingan; ukur durasi sesi, pengulangan, skor, error rate | Data menunjukkan perbaikan; kalau tidak → **berhenti, simpan DOM** | metrik, e2e |
| **3. Rol out bertahap** | Combo → modul figural Matematika → Kotoba Garden. Tiap game = satu irisan utuh (scene + jembatan + tes + flag), bukan "semua sekaligus" | Tiap game lolos gate & punya jalur kembali | e2e aksesibilitas, kontras, `bundle:size` |
| **4. Meta & pembersihan** | Papan peringkat per tingkat, tantangan mingguan, hapus jalur DOM lama **hanya** setelah semua hijau; dokumen lama diarsipkan (R7), tidak dihapus | Satu sumber progresi; tidak ada regresi offline | `verify:pwa`, `idx:gate` |
| **5. Optimasi** | Custom export template (buang modul tak dipakai), Brotli, pecah `.pck` per mode, lazy load, uji baterai gerbang | First-load turun, cold start terjaga | `cold:start`, `bundle:size` |

**Kriteria berhenti (kill switch) untuk spike:** first-load > 15 MB gzip,
boot > 5 dtk di Android kelas menengah, WebGL2 gagal di iOS Safari,
satu pun gerbang aksesibilitas merah, atau A-B tidak menunjukkan perbaikan
→ Godot dilepas, redesign fase 0.5 tetap dipertahankan.

**Aturan kerja repo yang melekat:** baseline hijau dulu sebelum fitur (R1);
satu fitur utuh lintas lapisan (R2); tiap perbaikan bawa tes yang pernah merah
(R5); preview lokal, bukan deploy per commit (R6); **jangan push** — commit
lokal saja, deploy diborong sekali (R19); file baru di `src/` menggeser
inventori beku indexer (R15), jadi artefak Godot ditaruh di `public/godot/` dan
dokumen di `deliverables/`; pakai `npm run build`, bukan `astro build` saja (R21a).

---

## 6. Risiko & mitigasi

| Risiko | Mitigasi |
|---|---|
| Dua service worker (Godot vs `public/sw.js`) | PWA bawaan Godot OFF; satu SW, bucket `asj-godot-v1` dikecualikan dari `activate` + tes baru |
| Engine 9–10 MB merusak install PWA | Lazy-load saat game pertama; tidak masuk precache install; Brotli; custom template |
| COOP/COEP memutus Supabase/Cloudinary/font | Thread OFF, tidak pasang header isolasi |
| Bank soal bocor ke non-VIP lewat `.pck` statis | Bank tetap server; Godot hanya terima ronde aktif |
| Kanji/kana salah atau tak terbaca di canvas | Overlay HTML; keputusan font subset hanya kalau terpaksa |
| Regresi aksesibilitas (canvas buram) | DOM fallback selalu ada; e2e labels/aria/contrast tetap menyapu kontrol nyata |
| Progresi pecah dua (`user://` vs localStorage) | Godot tidak menyimpan apa pun |
| Update game menyajikan engine basi | Nama cache dari hash konten artefak Godot |
| Gerbang beku merah karena file baru | Letakkan di `public/godot/` & `deliverables/`; perubahan `scripts/` dan `src/lib/` diiringi update inventori satu per satu |
| Deploy boros / kredit Netlify | Commit lokal sering, push sekali saat batch siap |

---

## 7. Yang perlu diputuskan pemilik sebelum eksekusi

1. **Empat game** = `kotoba`, `genba`, `combo`, `matematika` (sesuai
   `GAME_SAH`), dan "lain-lain" (3 tes + wawancara) keluar dari fase 1. Betul?
2. **Offline**: pilih opsi A (online-first + fallback DOM), B (full offline
   pack), atau C? Rekomendasi: **A**.
3. **Urutan**: mulai dari redesign fase 0.5 dulu (murah, langsung menjawab
   keluhan bosan), atau langsung spike Godot Fase 1? Rekomendasi: **0.5 dulu,
   spike Godot berjalan paralel sebagai bukti konsep**.
4. **Batas berat**: berapa MB first-load dan berapa detik boot yang masih
   boleh di HP siswa? Angka ini jadi kill switch, jadi perlu disepakati
   sebelum baris kode pertama.

---

## 8. Yang TIDAK dilakukan sesi ini

Tidak ada perubahan pada `src/`, `public/sw.js`, `netlify/`, `netlify.toml`,
`package.json`, atau CI. Tidak ada commit, tidak ada push, tidak ada deploy,
tidak ada aset gambar/audio yang dibuat. Hanya dokumen rencana ini.
