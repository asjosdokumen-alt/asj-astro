# Desain upgrade 4 game belajar — Godot Web, PWA, mobile-first

Status: **desain detail + kit aset siap pakai**. Belum ada kode produksi yang
diubah. Dokumen ini melanjutkan `RENCANA_GODOT_4_GAME_2026-11-15.md`.

---

## 0. Keputusan yang dikunci pemilik (2026-11-15)

| # | Keputusan | Artinya untuk desain |
|---|---|---|
| 1 | 4 game = yang punya papan skor | `kotoba`, `genba`, `combo`, `matematika` (`GAME_SAH`). Tes-iq/mata/mbti/wawancara keluar dari cakupan |
| 2 | Offline **opsi A** | Engine diunduh sekali saat game Godot pertama dibuka; PWA install tetap ringan; offline jatuh ke DOM lama |
| 3 | Langsung upgrade | Fase 0.5 (redesign tanpa Godot) **dihapus sebagai fase terpisah**; semua perbaikan variasi/progresi dibawa sebagai bagian dari desain game Godot |
| 4 | HP siswa sudah kuat, **koneksi yang jadi perhatian** | Batas CPU longgar, batas **byte & first-load ketat**. Target: paket game ≤ 12 MB gzip, aset ≤ 300 KB, boot ≤ 3 dtk setelah ter-cache, selalu ada indikator unduh + fallback DOM |
| 5 | **Aset dibuat** | Keputusan lama "0 KB aset" dicabut. Kit visual baru ada di `deliverables/game-design/art/` |
| 6 | **Mobile first** | 390×844 jadi ukuran rancangan. Desktop (admin) dapat canvas max 480 px di tengah + panel DOM, bukan layout game desktop |

### Yang berubah dari rencana sebelumnya

- Aset: `0 KB` → **266 KB / 19 berkas** (4 key art, 1 atlas, 12 ikon, 1 palet, 1 skrip build).
- Fase 0.5 tidak berdiri sendiri; variasi harian, Paspor Latihan, dan juice masuk ke spesifikasi tiap game.
- Fokus ukuran bergeser dari "jangan berat di HP" menjadi "jangan berat di jaringan": ukuran engine dan strategi cache jadi kriteria utama, bukan FPS.
- Desktop tidak lagi jadi target desain; hanya harus tetap usable untuk admin.

---

## 1. Art bible & sistem aset

### 1.1 Arah seni

**Flat 2D vektor, paper-cut tipis, palet terbatas, sudut membulat, garis emas 1–2 px.**
Alasan yang bisa diperiksa:

- Tajam di 390 px dan tidak butuh `@2x`/`@3x`; satu WebP 720 px cukup.
- Bisa di-`modulate`/shader → **satu set aset untuk dark & light** (tidak dua kali gambar).
- Tidak ada wajah/manusia → tidak menyentuh aturan consent foto di `scripts/ci/verify-assets.mjs` (repo publik, foto siswa butuh basis publikasi).
- **Tidak ada teks, huruf, angka, kanji, atau logo di dalam gambar.** Semua tulisan tetap dirender sebagai teks asli oleh DOM (atau font di Godot). Generator gambar rutin salah menulis kana; satu kanji salah lebih merusak halaman belajar bahasa daripada tidak ada ilustrasi.

Kesinambungan brand diambil dari `public/assets/banner-sakura-*.webp` dan hero
`deliverables/hero-3d/`: **navy gelap + sakura pink + emas**, ditambah emerald
dari token `--color-primary: #10b981` dan amber `--color-secondary: #f59e0b`.
Foto sinematik pengajar **tidak** dipakai sebagai aset game.

### 1.2 Palet resmi (`art/palet.svg`)

| Peran | Hex | Dipakai untuk |
|---|---|---|
| Latar | `#101a2e` | canvas, tile ikon, ruang kosong |
| Latar naik | `#1b2740` | panel, rak, bayangan datar |
| Sakura | `#ff8fbf` | benar, kelopak, kata benda, highlight |
| Amber | `#f5b942` | garis emas, timer, partikel, peringatan |
| Emerald | `#34d399` | benar, kata kerja, progres |
| Krem | `#fdf6ec` | kartu kosong, teks di atas navy |

Light theme: latar dikrimkan, bentuk tetap navy, garis tetap emas. Di Godot
cukup `modulate` + satu uniform shader; host mengirim palet lewat event `theme`.

### 1.3 Manifest aset (ukuran nyata)

| Berkas | Ukuran | Byte | Dipakai |
|---|---:|---:|---|
| `genba-bg.webp` | 720×1004 | 43.370 | latar parallax Genba |
| `combo-bg.webp` | 720×1004 | 46.258 | panggung Combo (kartu sengaja kosong) |
| `kotoba-garden.webp` | 720×1004 | 58.750 | 3 tingkat taman Kotoba |
| `figural-bg.webp` | 720×1004 | 45.716 | panggung figural Matematika |
| `item-atlas.webp` | 768×576 | 32.800 | 12 region `AtlasTexture` untuk barang Genba |
| `items/*.webp` | 12 × 192×192 | 39.828 | ikon tunggal (preview/UI) |
| `palet.svg` | 650×200 | 1.369 | swatch palet, ditulis tangan |
| `_build-art.mjs` | — | 4.426 | pipeline crop + WebP + slicing |
| **Total bersih** | **19 berkas** | **266.125 B ≈ 266 KB** | |

Master PNG (6 berkas / 9,2 MB, masih ber-watermark) ada di `_masters/` dan
sudah dimasukkan ke `.gitignore` dengan pola
`deliverables/game-design/art/_masters/*.png` mengikuti konvensi
`story-3d/assets/*.png`. Yang dikirim ke game **hanya** WebP hasil crop.

Daftar ikon (`item-atlas` baris demi baris): `helm, kardus, botol, kunci-pas,
sarung-tangan, papan-jepit, sapu, kotak-alat, apron, meteran, gerobak, peti`.
Siluet ini adalah **arah bentuk**; kalau nanti butuh bentuk presisi (misal peti
harus benar-benar peti kayu), ikon diganti versi SVG vektor tanpa mengubah
ukuran sel atlas.

### 1.4 Pipeline & penempatan produksi

```
ImageGen (master PNG, ada watermark)
   → _build-art.mjs : crop 7% bawah (key art) / 15% (sheet)
   → resize 720 px + WebP q82/q88
   → slicing 4×3 → 12 ikon 192 px + item-atlas.webp
   → SAAT EKSEKUSI: salin ke godot/art/ lalu diimpor ke dalam .pck
   → hasil export → public/godot/  (BUKAN public/assets/)
```

**Kenapa bukan `public/assets/`:** seluruh folder itu di-ignore git dan
`verify-assets.mjs` berjalan menyapu `.webp` di sana untuk urusan consent foto.
Meletakkan aset game di sana akan (a) tidak bisa ter-commit tanpa mengubah
`.gitignore`, (b) ikut tercampur dengan set foto yang dijaga gate. Folder baru
`public/godot/` tidak disapu gate itu dan tidak terlihat indexer.

**Provenance sebelum publish:** semua aset game adalah hasil generate, tanpa
wajah orang nyata, tanpa teks. Catatan ini harus ditulis di dokumen aset saat
masuk `public/godot/`, supaya `verify:assets` tidak menemukan berkas tak
berbasis bila aturannya kelak diperluas.

### 1.5 Anggaran berat

| Komponen | Target |
|---|---|
| Aset game | ≤ 300 KB (realisasi 266 KB) |
| Engine Godot (wasm + pck, gzip/Brotli) | ≤ 12 MB, **lazy**, tidak masuk precache install |
| Precache PWA saat install | tetap ≈ 3,7 MB / 136 entri |
| Boot setelah ter-cache | ≤ 3 dtk |
| Unduh pertama di 4G | tampilkan progress "Mengunduh paket game ≈10 MB", boleh ditunda ke Wi-Fi |
| Audio | 0 berkas: 3 blip prosedural via Web Audio + TTS host yang sudah ada |

Tombol **"Unduh paket game"** di dasbor kandidat jadi jawaban untuk "koneksi
mah beda": siswa bisa prefetch saat Wi-Fi kelas, lalu main offline. Ini tidak
mengubah opsi A, cuma memberi kontrol.

---

## 2. Kerangka UI mobile-first (berlaku untuk 4 game)

Rancangan pada **390×844**, area aman:

```
y  0–56    toolbar portal (var --u-toolbar-h)
y 56–136   HUD: sisa waktu → perintah → skor/nyawa  (urutan mata, 80 px)
y 136–600  playfield Godot, SATU layar, tidak boleh scroll saat ronde
y 600–780  zona jempol: barang / kartu / opsi, target sentuh ≥ 44 px
y 780–844  BottomNav / kartu hasil
```

Aturan keras:

- **Tidak ada scroll saat ronde berjalan** (cacat lama terukur: 12 rak ≈ 384 px
  mendorong meja ke bawah lipatan di ronde 8 detik).
- Semua aksi cukup satu jari: tap, drag-drop, swipe. Tidak ada hover, tidak ada
  keyboard, tidak ada klik kanan.
- Canvas Godot `canvas_items` + `aspect=expand`, resolusi internal dibatasi
  720×1280; di desktop dibatasi **480 px** dan di tengah, panel DOM di sekitarnya.
- `prefers-reduced-motion`: shake/hit-stop/partikel dimatikan, durasi tween
  dipangkas, informasi tetap disampaikan lewat warna + teks (bukan gerak saja).
- Aman untuk `safe-area-inset-bottom` (iPhone), dan tab background dijeda:
  timer **di host**, bukan di Godot, supaya jeda tab tidak mengubah nilai.
- Canvas selalu `aria-hidden="true"` + padanan teks di DOM; label, fokus, dan
  pembaca layar tetap di HTML. Ini yang menjaga `e2e:labels`, `e2e:aria-names`,
  `e2e:contrast`, `e2e:hover-contrast` tetap hijau.

---

## 3. Game 1 — Genba Order Rush (`genba`)

### 3.1 Masalah yang dibasmi

Ronde 8 detik dengan rak statis dan barang yang cuma "diketuk" terasa seperti
kuis bergambar. Yang ditambahkan: **benda yang bisa dipegang**, tata letak yang
berubah tiap hari, dan kondisi kerja yang tidak terduga.

### 3.2 Aturan yang dipertahankan (jangan diubah)

Dari `src/lib/arcade.ts` + `arcade-systems-2026-11-05.md`: poin dasar 100,
bonus cepat `round(50 × sisa waktu)` berlaku sejak jawaban pertama, kombo ×1
(<5) / ×2 (5–9) / ×3 (≥10), bonus shift `100 × pesanan`, pengali tingkat
magang ×1 · reguler ×1 · veteran ×1,5; nyawa 4/3/2; 8 atau 12 pesanan;
gelombang 4 pesanan; waktu 9→8 / 8→7→6 / 6→5→4,5 dtk; rak 4→6→8 mengikuti
kombo; nilai S/A/B/C/D; bintang per tingkat maks 9; "Latih yang salah" ≤ 8 item.

Alasan: skor lama harus tetap bisa dibandingkan dengan rekor di `game_scores`.

### 3.3 Desain baru

| Elemen | Spesifikasi |
|---|---|
| Barang | 12 `AtlasTexture` dari `item-atlas.webp`, ditarik dari `ItemLayer` ke `Slot` dengan drag. Snap 0,18 s (`TRANS_BACK/EASE_OUT`), kembali ke tempat bila dilepas di luar slot |
| Rak | Posisi 4/6/8 slot dihitung dari **seed harian**, bukan dibakar di gambar. `genba-bg.webp` hanya lapisan parallax; hitbox slot tetap `Area2D` kode |
| Kondisi shift | 8 modifier, maks **2 per shift**, tidak boleh dua pengurang waktu sekaligus: rak tercermin · lampu redup (vignette) · TTS 1,2× · waktu −1 dtk · barang berpasangan · bonus item tertentu ×2 · rak diputar 90° · kabut tipis |
| Shift bos | Jumat: 12 pesanan, 2 modifier, TTS 1,2×, tanpa nyawa tambahan, stempel khusus |
| Seed | `hash(tanggal + kelas)` dari server → **semua siswa satu kelas dapat kondisi sama**, papan peringkat tetap adil |

### 3.4 Scene graph

```
GenbaScene (Node2D)
├── ParallaxBG        TextureRect  ← genba-bg.webp
├── ShelfLayer        Node2D
│   └── Slot × 4/6/8  Area2D + CollisionShape2D + NinePatchRect
├── ItemLayer         Node2D
│   └── Item × N      Area2D + Sprite2D(AtlasTexture) + Tween
├── FX                CPUParticles2D × 3 (petal, debu, percikan)
├── Camera2D          shake ← Juice.gd
├── Bridge            Node   ← bridge.gd
└── Juice             Node   ← autoload
```

State: `IDLE → SHIFT_INTRO → ORDER → RESOLVE → (ORDER) → SHIFT_END → RESULT`.

### 3.5 Juice (durasi nyata)

| Momen | Efek |
|---|---|
| Barang muncul | scale 0→1, 0,18 s, back-ease |
| Benar | flash emerald 0,12 s + blip + 6 kelopak + angka melayang |
| Salah | getar merah 0,20 s + hit-stop `Engine.time_scale = 0.05` selama 0,08 s + slot benar disorot 1,1 s |
| Kombo 5/10 | pita cahaya mengikuti jalur barang, timer HUD berdenyut |
| Shift selesai | stempel nilai 0,4 s, confetti 0,5 s, kamera sedikit zoom |

Audio: 3 blip (benar/salah/kombo) dari oscillator Web Audio lewat host, 0 berkas.
Perintah Jepang tetap `speechSynthesis` host dengan kecepatan `0,9 + 0,06 × gelombang`.

### 3.6 Kontrak jembatan

```
host → godot  { v:1, type:'round', game:'genba', seed, theme, payload:{
                 tingkat, pesanan:[{id,barang,rakBenar,batasWaktu}], modifier:[...] }}
host → godot  { v:1, type:'tick',  game:'genba', payload:{ sisa, nyawa, kombo } }
godot → host  { v:1, type:'answer',game:'genba', payload:{ orderId, slotId, barangId, ms } }
godot → host  { v:1, type:'finish',game:'genba', payload:{ benar, salah, comboMaks } }
```

Host yang menilai benar/salah, menghitung skor, menyimpan `localStorage`, dan
mengirim `kirimSkor('genba', …)`. Godot **tidak punya akses bank, skor, atau API**.

### 3.7 Tetap di DOM

Perintah Jepang, HUD (waktu/nyawa/skor), pengaturan suara, kartu hasil + rekap,
tombol "Latih yang salah", papan peringkat, semua label aksesibilitas.

### 3.8 Kriteria selesai

Ronde 12 pesanan sampai kartu hasil tanpa scroll; 390×844 & iOS Safari hijau;
p95 ≥ 55 fps; skor identik dengan rumus lama (tes tabel di `arcade.test.ts`
tetap lulus); fallback DOM aktif bila WebGL2 gagal; tes jembatan pernah merah.

---

## 4. Game 2 — Kotoba Combo Builder (`combo`)

### 4.1 Dipertahankan

Waktu per kalimat `(4 + 3 × jumlah kartu)` dtk, `KOMBO_MAKS = 10` (maks 500/kartu),
bonus selesai 100/200/300 + sisa waktu × panjang kalimat, tanpa nyawa, waktu
habis → kombo balik ×1 dan kalimat benar **ditunjukkan**.

### 4.2 Desain baru

| Elemen | Spesifikasi |
|---|---|
| Kartu | Objek fisik di Godot: ketuk untuk menambah, atau drag untuk menyisip. `combo-bg.webp` jadi panggung; kartu **kosong**, teks kana/kanji di-overlay DOM |
| Warna kelas kata | `modulate`: kata benda sakura, kata kerja emerald, partikel amber, kata sifat krem. Satu tekstur, 4 warna, 0 aset tambahan |
| Pita kombo | Kurva cahaya menghubungkan kartu yang sudah dipilih; menebal tiap kombo, putus saat salah |
| Kalimat bos | Jumat: 13 kartu, 2 partikel umpan, bonus ×1,5 (tidak mengubah papan skor lama — dicatat di `detail`) |
| Modifier harian | partikel tersembunyi · susun dari belakang · 2 kartu umpan · waktu −10% (maks 1 per kalimat) |
| Tekanan waktu | Vignette amber menyempit, denyut 1 Hz di 3 detik terakhir |

Juice: kartu flip 0,15 s; partikel salah memantul balik 0,25 s; kalimat selesai
→ ribbon melebar + confetti 0,5 s; stempel "KALIMAT SELESAI" 0,3 s.

### 4.3 Scene graph & state

```
ComboScene → Stage(TextureRect) → CardLayer(Node2D) → Card(Area2D+NinePatchRect)
           → Ribbon(Line2D) → FX(CPUParticles2D) → Bridge → Juice
State: IDLE → SENTENCE → CARD_PICK → RESOLVE → SENTENCE → RESULT
```

### 4.4 Kontrak jembatan

```
host → godot  { type:'round', game:'combo', payload:{ kalimatId, kartu:[{id,teks?}], batasWaktu, modifier } }
godot → host  { type:'pick',  game:'combo', payload:{ cardId, posisi, ms } }
godot → host  { type:'finish',game:'combo', payload:{ selesai, sisaWaktu, kombo } }
```

`teks` **tidak** dikirim ke Godot: host merender label di atas posisi kartu yang
dilaporkan Godot lewat event `layout`. Godot hanya mengirim koordinat, bukan
menuliskan bahasa Jepang.

### 4.5 Tetap di DOM & kriteria

Teks kartu, arti kalimat, timer, skor, riwayat salah, tombol ulang. Kriteria:
kalimat 13 kartu tidak memotong layar; tidak ada kanji yang berasal dari gambar;
skor lama tetap sebanding; partikel salah tidak pernah mengunci pemain.

---

## 5. Game 3 — Kotoba (`kotoba`)

### 5.1 Dipertahankan (jangan dipindah ke canvas)

4 mode (kuis pilihan ganda, ketik, flashcard, kamus), Leitner 5 kotak, bobot
kemunculan kata lemah, `kataDikuasai` (benar 3× tanpa salah), gelar, streak
harian, misi harian **20 kata benar**, "ulangi yang salah", bank 1.440 kata dari
`getBankKotoba`, TTS `speechSynthesis`.

Alasan: ini halaman **membaca dan mengetik**, bukan aksi. Memindahkannya ke
canvas merusak aksesibilitas, seleksi teks, zoom, dan i18n — tanpa menambah
keseruan sedikit pun.

### 5.2 Yang baru: "Kotoba Garden" (lapisan Godot)

Canvas kecil **390×220 px** di atas tab mode, `aria-hidden="true"`, dengan
padanan teks ("Pohon: tunas muda · 12 kata dikuasai hari ini").

| Progres | Perubahan visual |
|---|---|
| Jawaban benar | 1 daun muncul (maks 30 daun terlihat), 0,25 s |
| Misi harian 20 kata | tier naik: tunas → anakan → sakura mekar (`kotoba-garden.webp`) |
| Streak 3/7/30 hari | lentera menyala, then torii, then kelopak terus-menerus |
| Gelar tercapai | stempel emas 0,4 s + palet musim terbuka |
| Salah | daun layu 0,2 s (tidak mengurangi pohon — hukuman sudah ada di Leitner) |

**4 palet musim tanpa 4 gambar**: sakura (pink), momiji (amber/merah), yuki
(krem/biru pucat), tsuyu (emerald) — semuanya `modulate` dari satu tekstur.
Seed harian menentukan arah angin kelopak dan kedip lentera.

Anti-bosan tambahan: "Ulang yang salah" mingguan jadi **boss 20 kata terlemah**
dengan kartu hasil tersendiri; target harian punya garis finish yang benar-benar
habis; ringkasan sesi ("hari ini: 20/20 · 3 kata naik kotak · gelar baru").

### 5.3 Scene graph & kontrak

```
GardenScene → BG(TextureRect) → TierLayer(Node2D) → LeafLayer(CPUParticles2D)
            → Lantern(Node2D) → Stamp(Node2D) → Bridge → Juice
host → godot { type:'progress', game:'kotoba', payload:{ kotak:[5 angka], harian, streak, gelar, musim } }
host → godot { type:'answer',   game:'kotoba', payload:{ benar, kataId, kotakBaru } }
godot → host { type:'milestone',game:'kotoba', payload:{ jenis } }   // hanya untuk animasi
```

### 5.4 Kriteria

Progres pohon **persis** mengikuti data Leitner yang sudah ada (bukan hitungan
Godot sendiri); 0 regresi pada 31 tes `e2e/kotoba-gate.test.tsx`; ringkasan
sesi terbaca pembaca layar; canvas tidak pernah jadi satu-satunya penyampai
informasi.

---

## 6. Game 4 — Matematika & psikotes (`matematika`)

### 6.1 Dipertahankan

20 soal / 300 dtk, "Simulasi Seleksi" campuran 13–14 kategori tanpa kategori
sama berurutan, kurva 6 easy · 7 medium · 7 hard, 50 poin/jawaban benar,
ambang S ≥ 90% · A ≥ 75% · B ≥ 60%, rekap per kategori, profil **6 dimensi**
(kecepatan hitung, ketelitian, penalaran, verbal, spasial, aplikasi kerja),
`FigurSvg` 3 bentuk asimetris dengan `kunciGambar` penjaga keunikan opsi.

### 6.2 Yang baru: modul figural interaktif

Soal figural tidak lagi "pilih A/B/C/D", tapi **putar / cerminkan bentuk dengan
jari**:

| Aksi | Gestur | Feedback |
|---|---|---|
| Rotasi 90°/180°/270° | swipe kiri/kanan pada bentuk | snap 0,2 s + bayangan posisi awal |
| Cermin vertikal | swipe dua jari / tombol 44 px | flip 0,2 s + garis sumbu |
| Deret 3 gambar | geser sel ke urutan benar | sel berdenyut, klik emerald |
| Salah | — | wobble 0,25 s, bentuk kembali, tidak keluar dari soal |

`figural-bg.webp` jadi panggung; **bentuk tetap digambar sebagai poligon kode**
(`Polygon2D` / `draw_*`), supaya rotasi benar-benar rotasi, bukan gambar yang
ditukar. Generator soal, `putarGambar`, `cerminGambar`, `kunciGambar`, dan
penilaian **tetap di TypeScript** — Godot hanya melaporkan gestur.

Soal non-figural (kraepelin, ketelitian, verbal, silogisme, cerita, dll.) tetap
DOM. Kesulitan adaptif dari 3 soal terakhir dan penguasaan per kategori
(utang yang sudah tercatat) dikerjakan di host, bukan di Godot.

### 6.3 Scene graph & kontrak

```
FiguralScene → Stage(TextureRect) → ShapeLayer(Node2D) → Shape(Polygon2D+Area2D)
             → Ghost(Polygon2D, alpha 0.25) → SeriesCells(Node2D) → Bridge → Juice
host → godot { type:'round', game:'matematika', payload:{ mode:'putar'|'cermin'|'deret',
               bentuk:'L'|'pisau'|'bendera', transform:{putar,cermin,x,isi}, opsi:[...] } }
godot → host { type:'answer', game:'matematika', payload:{ transformTerpilih, ms } }
```

Kartu hasil & bar 6 dimensi tetap DOM; Godot hanya menggambar radar dekoratif
`aria-hidden` di sampingnya (boleh dinonaktifkan lewat flag).

### 6.4 Kriteria

30 tes `e2e/matematika-soal.test.ts` + 10 tes `e2e/matematika-gate.test.tsx`
tetap lulus; tidak ada soal dengan dua jawaban benar; rekap per dimensi tidak
berubah; modul figural bisa dilewati (fallback ke pilihan ganda DOM).

---

## 7. Sistem bersama (yang bikin 4 game terasa satu produk)

| Sistem | Sumber kebenaran | Catatan |
|---|---|---|
| **Seed harian** | server: `hash(tanggal + kelas + game)` | Satu kelas = kondisi sama, papan skor adil |
| **Dek modifier** | `src/lib/` (TS) | 8 modifier, maks 2/shift, tidak dua pengurang waktu; Godot cuma menerima hasil |
| **Paspor Latihan** | **satu tabel server** (migrasi baru) | total bintang (maks 9) + gelar Kotoba + streak + misi harian + tantangan mingguan. Menggantikan tiga `localStorage` yang terpisah |
| **Juice library** | `godot/scripts/juice.gd` (autoload) | `shake()`, `flash()`, `hitstop()`, `confetti()`, `stamp()` dipakai 4 scene |
| **Tema** | host kirim event `theme` | palet override + `modulate`; tidak ada aset kedua untuk light |
| **Skor** | `src/lib/skorGame.ts` → `game_scores` | Godot tidak pernah menulis skor |
| **Telemetri** | host (endpoint existing `metrics-receiver`) | durasi sesi, pengulangan, error WebGL; dasar A/B Fase 2 |
| **Fallback** | flag per kelas + deteksi WebGL2 | Gagal → renderer DOM lama, tidak ada layar blank |
| **Audio** | host | 3 blip prosedural Web Audio + TTS existing; 0 berkas |

---

## 8. Spesifikasi teknis Godot

| Item | Nilai |
|---|---|
| Versi | **4.7.2 stable**, template Web versi sama persis |
| Renderer | **Compatibility** (WebGL2); Forward+/Mobile berbasis Vulkan, tidak ada di browser |
| Thread | **OFF** — menghindari `SharedArrayBuffer` + COOP/COEP yang memutus Supabase/Cloudinary |
| Bahasa | **GDScript**; C#/.NET tidak bisa export Web per 4.7.2 |
| PWA bawaan Godot | **OFF** — ia membuat service worker sendiri, bentrok dengan `public/sw.js` |
| GDExtension | OFF |
| Shell HTML | custom, canvas ditanam di halaman Astro; bukan `index.html` bawaan |
| Proyek | `F:/astro/godot/` (tidak termasuk allowlist indexer, jadi tidak menggeser inventori beku) |
| Output export | `F:/astro/public/godot/` → `engine.wasm`, `engine.js`, `game.pck`, `art/` |
| Aset | diimpor ke dalam `.pck`; updates art = hash pck berubah = cache bust otomatis |
| Resolusi | internal 720×1280, `stretch_mode=canvas_items`, `aspect=expand`, cap 480 px di desktop |
| Partikel | `CPUParticles2D` ≤ 60 partikel (paling aman di Compatibility/Web) |
| Target | p95 ≥ 55 fps @ 390×844, ≤ 200 draw call |
| Penyimpanan | **jangan** pakai `user://` (IndexedDB di Web) — sumber kebenaran tetap host + server |
| Font | Teks Jepang tetap DOM. Bila nanti wajib di canvas: subset Noto Sans JP ±1,5 MB jadi keputusan terpisah |
| Status tooling | Godot **belum terpasang** di mesin ini (`godot` tidak ada di PATH). Instal editor + Web export template adalah prasyarat Fase 0 |

### Jembatan (implementasi)

- Host mendefinisikan `window.ASJ_HOST = { emit(json) }`.
- Godot: `JavaScriptBridge.get_interface("ASJ_HOST").emit(JSON.stringify(msg))`.
- Inbound: `JavaScriptBridge.create_callback(...)` disimpan dalam **variabel
  anggota** (kalau tidak, callback bisa dilepas GC dan event hilang diam-diam),
  lalu dipasang sebagai `window.ASJ_GODOT_IN`; host memanggilnya dengan string JSON.
- Semua pesan `{ v, type, game, seed?, theme?, payload }`; `v` ditolak bila
  bukan 1. Gagal parse → event `error` + fallback DOM.
- `bridge.gd` di-`guard` dengan `OS.has_feature("web")` supaya adegan tetap bisa
  dibuka di editor; logika uji ada di sisi TypeScript dengan emitter palsu.

---

## 9. Integrasi PWA (opsi A) — berkas yang akan tersentuh nanti

| Berkas | Perubahan |
|---|---|
| `public/sw.js` | `activate` jangan hapus bucket `asj-godot-*`; tambah handler lazy-cache untuk `/godot/*` dengan progress; tetap network-first navigasi, API tetap tidak di-cache |
| `scripts/build-sw-manifest.mjs` | daftar artefak Godot eksplisit + hash konten jadi nama cache; jangan masukkan ke `PRECACHE` install |
| `src/lib/swOffline.test.ts` | tes baru: bucket Godot selamat saat update, engine tidak ikut precache install, fallback offline benar |
| `scripts/ci/verify-pwa.mjs` | pastikan `PRECACHE` tetap ≥ 20 entri dan Godot tidak masuk daftar precache |
| `netlify.toml` | header `Content-Type: application/wasm`, `Content-Encoding: br`, `Cache-Control: immutable` untuk `/godot/*` |
| `scripts/ci/bundle-size.mjs` | baseline hanya bila ada JS baru di host; aset `.webp` tidak dihitung sebagai kode |
| `deliverables/...` + `public/godot/` | aman untuk indexer; `.gitignore` sudah diperbarui untuk master PNG |

Tidak ada perubahan pada `verify-assets.mjs` selama aset tidak ditaruh di
`public/assets/`.

---

## 10. Urutan eksekusi (setelah dokumen ini disetujui)

| Fase | Isi | Selesai kalau |
|---|---|---|
| **0** | Baseline hijau; instal Godot 4.7.2 + template; ADR; kontrak jembatan v1; flag per kelas; tombol "Unduh paket game" | Semua gate hijau sebelum fitur masuk; angka batas (12 MB / 3 dtk) tercatat |
| **1** | **Genba vertikal** — aset, 12 ikon, drag-drop, seed, 8 modifier, juice, jembatan, fallback DOM, lazy cache | Boot/login/offline/390×844/iOS Safari hijau; 27 tes `arcade.test.ts` + 18–19 e2e tetap lulus; tes jembatan pernah merah |
| **2** | Shadow A/B per kelas: Godot vs DOM; ukur durasi sesi, pengulangan, error WebGL | Data membaik; kalau tidak → berhenti, simpan DOM, tetap pertahankan perbaikan variasi |
| **3** | Combo → Figural Matematika → Kotoba Garden, **satu irisan utuh per game** | Tiap game lolos gate aksesibilitas/kontras + punya jalur kembali |
| **4** | Paspor Latihan (migrasi + satu sumber progresi), papan peringkat per tingkat, adaptif 3 soal terakhir, tantangan mingguan | Tidak ada lagi tiga `localStorage` yang saling tidak tahu |
| **5** | Custom export template (buang modul tak dipakai), Brotli, pecah pck per mode, pembersihan jalur DOM lama, arsip dokumen | First-load turun, cold start terjaga, `ci:quality` penuh hijau |

**Kill switch:** first-load > 12 MB gzip, boot > 3 dtk setelah cache, WebGL2
gagal di iOS Safari, satu gerbang aksesibilitas merah, atau A-B tidak
menunjukkan perbaikan → Godot dilepas, aset & variasi tetap dipertahankan di DOM.

**Aturan repo yang melekat:** baseline hijau dulu (R1) · satu fitur utuh
lintas lapisan (R2) · tiap perbaikan bawa tes yang pernah merah (R5) ·
preview lokal, bukan deploy per commit (R6) · **jangan push**, commit lokal
saja, deploy diborong sekali (R19) · file baru di `src/` menggeser 3–4
inventori beku (R15) · pakai `npm run build`, bukan `astro build` saja (R21a).

> **Catatan baseline (diukur 2026-11-15, bukan hasil sesi ini):** `git status`
> sudah menunjukkan 5 berkas termodifikasi sebelum desain ini dibuat —
> `indexer/validate-report.json`, `src/components/CvTemplateSelector.tsx`,
> `src/lib/cv-template-factory/factory.test.ts`,
> `src/lib/cv-template-factory/preview.ts`, plus `.gitignore` (perubahan sesi
> ini). Pekerjaan itu harus dirapikan/dikomit pemilik sebelum Fase 0 dimulai;
> jangan menjadikan tree yang sudah kotor sebagai baseline hijau.

---

## 11. Yang masih perlu keputusan Anda

1. **Bolehkah saya menginstal Godot 4.7.2 + Web export template** di mesin ini?
   Tanpa itu Fase 1 tidak bisa menghasilkan `.wasm`/`.pck`.
2. **Tombol "Unduh paket game ≈10 MB"** di dasbor kandidat: setuju? Ini yang
   menjawab "koneksi mah beda" tanpa mengubah opsi A.
3. **Foto/maskot brand** sengaja tidak dipakai di game (aturan consent repo
   publik). Kalau mau karakter maskot tampil, itu jadi paket aset terpisah
   dengan basis publikasi yang jelas.
4. Angka **12 MB / 3 dtk** saya jadikan kill switch. Kalau mau lebih longgar
   atau lebih ketat, sebut sebelum Fase 1.

---

## 12. Artefak sesi ini

| Berkas | Isi |
|---|---|
| `deliverables/game-design/DESAIN_UPGRADE_4_GAME_2026-11-15.md` | dokumen ini |
| `deliverables/game-design/RENCANA_GODOT_4_GAME_2026-11-15.md` | rencana arsitektur sebelumnya |
| `deliverables/game-design/art/*.webp` | 4 key art + atlas, bersih watermark |
| `deliverables/game-design/art/items/*.webp` | 12 ikon 192 px |
| `deliverables/game-design/art/palet.svg` | swatch palet resmi |
| `deliverables/game-design/art/_build-art.mjs` | pipeline crop + WebP + slicing |
| `deliverables/game-design/art/_masters/*.png` | master ber-watermark, di-ignore git |
| `.gitignore` | satu pola baru untuk master PNG |

**Tidak ada** perubahan pada `src/`, `netlify/`, `public/sw.js`,
`netlify.toml`, CI, atau kode game. Tidak ada commit, push, maupun deploy.
