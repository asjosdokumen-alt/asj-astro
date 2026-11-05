# Arcade — sistem permainan & balance (2026-11-05)

Dokumen ini menjawab tiga hal: **mekanik apa yang kurang**, **angka apa yang
dipakai**, dan **apa yang diubah di UI/UX**. Semua angka dihitung di
`src/lib/arcade.ts` dan diuji di `src/lib/arcade.test.ts` + `e2e/arcade.test.tsx`
— bukan dirancang di atas kertas lalu disalin ke kode.

Cakupan perubahan: `/arcade` (Genba Order Rush + Kotoba Combo Builder).
`/kotoba` dan `/matematika` tidak disentuh; catatan lanjutannya ada di §8.

---

## 1. Audit: enam cacat yang membuatnya terasa seperti latihan, bukan permainan

| # | Temuan (terukur dari kode) | Akibat yang dirasakan pemain |
|---|---|---|
| 1 | Ronde berjalan **terus** sampai 3 kesalahan; tidak ada kondisi menang | Satu-satunya akhir adalah kalah. Tidak ada "selesai", tidak ada alasan mengulang selain mengejar angka |
| 2 | Timer **8 detik tetap**, 6 barang, 12 rak untuk semua ronde | Pemain baru dan pemain mahir mendapat beban yang sama; tidak ada kurva |
| 3 | Bonus kecepatan hanya diberikan **mulai kombo ke-2** | Jawaban cepat pertama 100, kedua 150 — terbaca sebagai bug |
| 4 | Pengali kombo **tanpa batas** (×2 sejak kombo 5, terus naik) | Skor tumbuh kuadratik; papan peringkat mengukur kesabaran |
| 5 | Kedua belas rak digambar sekaligus: **6 baris × 64 px ≈ 384 px** | Di 390×844 meja kerja terdorong ke bawah lipatan; pemain menggulir di tengah ronde 8 detik |
| 6 | Catatan salah hanya menyimpan **teks**, bukan ID | Tidak ada "latih yang salah"; catatan hanya pajangan |

Cacat 4 juga ada di Combo Kalimat dalam bentuk lain: tidak ada batas waktu, tidak
ada bonus menyelesaikan kalimat, dan pengali naik tanpa batas — total skornya
kuadratik terhadap jumlah kartu yang pernah diketuk.

---

## 2. Loop inti yang dirancang

```
pilih tingkat → SHIFT (8–12 pesanan) → kartu hasil (S/A/B/C + bintang + ¥)
      ↑                                        │
      └────── "Latih yang salah" (≤8 item) ←───┘
```

Satu shift dirancang **60–120 detik** — cukup pendek untuk satu jeda kelas, cukup
panjang untuk terasa seperti satu "ronde kerja". Yang dinilai bukan hanya benar,
tetapi benar **dan** cepat, karena di lantai kerja keduanya sama-sama dituntut.

---

## 3. Genba Order Rush — ekonomi dan kurva

### 3.1 Poin per pesanan

| Komponen | Nilai | Catatan |
|---|---|---|
| Dasar | 100 | |
| Bonus cepat | `round(50 × sisa waktu)` → 0–50 | Berlaku **setiap** jawaban, termasuk yang pertama |
| Pengali kombo | ×1 (<5), ×2 (5–9), ×3 (≥10) | Berhenti di ×3 — skor tumbuh linear |
| Bonus shift | `100 × jumlah pesanan` (800 / 1200) | Hanya bila shift **selesai** |
| Pengali tingkat | magang ×1 · reguler ×1 · veteran ×1,5 | Kerja lebih sulit dibayar lebih |

Skor maksimum teoretis (semua jawaban benar dan cepat):

| Tingkat | Pesanan | Nyawa | Waktu | Barang | Rak | Skor maks | Skor minimum menang |
|---|---|---|---|---|---|---|---|
| Magang | 8 | 4 | 9 → 8 dtk | 4 → 6 | 4 | ≈ 2.600 | ≈ 1.600 |
| Reguler | 12 | 3 | 8 → 7 → 6 dtk | 6 → 6 → 9 | 4 → 4 → 6 | ≈ 4.550 | ≈ 3.500 |
| Veteran | 12 | 2 | 6 → 5 → 4,5 dtk | 9 | 6 | ≈ 6.600 | ≈ 5.000 |

Urutan bayaran **veteran > reguler > magang** disengaja: papan peringkat `genba`
dipakai bersama, dan kalau level termudah membayar sama, papan itu berhenti
mengukur kemampuan.

### 3.2 Kurva di dalam satu shift

Gelombang = 4 pesanan. Tiga hal naik bersamaan di gelombang 3 — waktu turun,
barang bertambah, rak bertambah — karena di lantai kerja ketiganya terjadi
bersamaan. Kecepatan bicara TTS ikut gelombang (`0,9 + 0,06 × gelombang`),
bukan lompatan pada satu ambang skor seperti versi lama.

### 3.3 Nilai akhir

| Nilai | Syarat | Bintang |
|---|---|---|
| S | selesai + akurasi 100% + rata-rata sisa waktu ≥ 50% | ★★★ |
| A | selesai + akurasi ≥ 90% + sisa ≥ 30% | ★★☆ |
| B | selesai + akurasi ≥ 75% | ★☆☆ |
| C | selesai, di bawah itu | ☆☆☆ |
| D | nyawa habis | ☆☆☆ |

S menuntut **dua** hal: tanpa salah **dan** cepat. Kalau hanya "tanpa salah",
pemain bisa menunggu sumbu hampir habis dan tetap dapat S; kalau hanya "cepat",
menebak menjadi strategi yang menang. Bintang disimpan per tingkat (maksimum 9)
dan **tidak mengunci** tingkat mana pun — ini alat latihan, bukan tangga hadiah.

---

## 4. Kotoba Combo Builder — tiga angka yang menutup tiga celah

| Masalah lama | Angka baru | Efek |
|---|---|---|
| Tanpa tekanan waktu | `(4 + 3 × jumlah kartu)` detik per kalimat | Kalimat 5 kartu = 19 dtk; 13 kartu = 43 dtk |
| Pengali tanpa batas | `KOMBO_MAKS = 10` (maks 500/kartu) | Skor linear terhadap jumlah kartu |
| Menyelesaikan tidak dihargai | Bonus `100/200/300` + sisa waktu × panjang kalimat | Menyelesaikan lebih bernilai daripada mengetuk terus |

Waktu habis: kombo kembali ke ×1, kalimatnya **ditunjukkan** (bukan hanya
"gagal"), lalu soal berganti. Tidak ada nyawa — kekalahannya adalah kehilangan
kombo dan bonus, bukan hukuman yang mengeluarkan pemain dari latihan.

---

## 5. UI/UX — apa yang berubah dan mengapa

| Sebelum | Sesudah | Alasan |
|---|---|---|
| Rak dan meja tampil sebelum mulai; diketuk = tidak terjadi apa-apa | Playfield hanya dirender saat bermain; idle = hub tingkat + CTA | Layar yang bisa diketuk tanpa hasil terbaca sebagai game rusak |
| HUD satu baris berisi 5 hal (skor, rekor, kombo, nyawa, checkbox) | Skor besar + progres shift + nyawa; pengaturan pindah ke hub | Mata perlu urutan: sisa waktu → perintah → rak → barang |
| 12 rak (6 baris) | 4–8 rak, **mengikuti kombo**: +2 tiap 4 jawaban benar, kembali saat salah | Terukur di 390×844: 8 rak digambar 4 kolom × 2 baris — tinggi yang sama dengan 4 rak 2 kolom, jadi area main tetap satu layar |
| Jumlah rak tetap per gelombang | 4 (dasar) → 6 (kombo 4) → 8 (kombo 8), plafon 8 | Menjawab "cuma 4 pilihan tempat, bukannya jadi gampang?": angka naik-turun mengikuti pemain, bukan tetap |
| Salah = satu baris teks 1,1 dtk | Rak yang benar disorot hijau, yang diketuk merah + getar + animasi | Koreksi harus **terlihat**, bukan dibaca sambil mengingat |
| "Shift selesai" hanya saat mati | Kartu hasil: nilai, akurasi, kombo, bonus, bintang, rekor, dua CTA | Memberi akhir yang terasa seperti akhir |
| Catatan salah = pajangan | Tombol "Latih yang salah" (≤8 item, entri lama tanpa ID dilewati) | Menutup loop belajar: salah → dicatat → dilatih → hilang dari catatan |
| Paragraf pengantar 6 baris + h1 besar | 2 baris + `<details>` "Detail latihan"; kolom disamakan `max-w-md` | Pengantar lama mendorong area main ke bawah lipatan |
| `t()` tanpa langganan bahasa | `useLang()` | Ganti bahasa saat halaman terbuka dulu tidak mengganti satu label pun |

Bukti visual: `deliverables/game-design/shots/` (idle, main 4 rak, main 8 rak,
hasil, combo; 390
dark + 1280 light).

---

## 6. Perlukah gambar hasil generate?

**Untuk gameplay: tidak.** Alasan yang bisa diperiksa, bukan selera:

1. **PWA offline.** `/arcade` harus jalan tanpa jaringan. Setiap raster menambah
   berat precache (saat ini 69 aset / 1.789 KB) dan gagal dimuat di kelas dengan
   sinyal buruk.
2. **Dua tema.** Aset raster tidak bisa diwarnai ulang; satu set gambar harus
   dibuat dua kali (gelap & terang), lalu tetap terasa asing di salah satunya.
   Ikon yang ada (`ArcadeIkon`, 27 ikon SVG) mewarisi `currentColor` dan
   otomatis benar di kedua tema.
3. **Konsistensi.** Game ini memakai token tema (`bg-surface`, `text-fg`,
   `accent-*`). Gambar AI membawa palet sendiri dan akan langsung terlihat
   "tempelan".
4. **Teks Jepang.** Generator gambar rutin salah menulis kanji/kana. Di halaman
   yang mengajarkan bahasa Jepang, satu kanji salah lebih merusak daripada satu
   ilustrasi yang tidak ada.

**Yang lebih layak, dan murah:** latar rak digambar dengan CSS (gradien + garis
grid), ikon SVG yang sudah ada diperbesar peran visualnya, dan kartu hasil
memakai stempel nilai beranimasi. Itu yang dipakai di versi ini — 0 KB aset baru.

**Satu raster yang justru berguna:** kartu OG untuk dibagikan (1200×630) saat
siswa memamerkan nilai S. Itu di luar gameplay, tidak perlu dua tema, dan boleh
dibuat sekali. Catatan: teks Jepang di dalam gambar generate harus dihindari —
pakai teks Latin ("SHIFT S · ¥4.546") atau tambahkan teksnya di HTML.

---

## 7. Verifikasi

| Gerbang | Hasil |
|---|---|
| `vitest run --project=frontend` | 136 berkas · 1.770 tes lulus |
| `src/lib/arcade.test.ts` | 27 tes (termasuk tabel kurva, ekonomi, nilai, subset rak) |
| `e2e/arcade.test.tsx` | 18 tes (termasuk 12 pesanan sampai kartu hasil, sorot rak, tutorial, latihan ulang, bahasa) |
| `tsc --noEmit` | 0 error |
| `lint-ratchet` | LULUS (debt turun 6) |
| `astro build` + `build-sw-manifest` | LULUS, 17 halaman |

Catatan jujur: `scripts/ci/shim-coverage.mjs` **merah karena
`src/components/forms/AiCvForm.tsx:2099` (`bg-slate-900/30`)** — berkas yang
tidak disentuh sesi ini, dan `ArcadeGame.tsx` menyumbang 0 pelanggaran. Itu
utang lama, bukan akibat perubahan ini.

---

## 8. Yang belum dikerjakan (dan urutannya)

1. **Kotoba**: tujuan harian + ringkasan sesi. Leitner, bobot, dan gelar sudah
   ada; yang hilang adalah "hari ini selesai" dan umpan balik akhir sesi.
2. **Matematika**: kesulitan adaptif. Sekarang ujian berdurasi tetap; soal
   berikutnya bisa dipilih dari tingkat keberhasilan 3 soal terakhir.
3. **Meta lintas game**: satu "paspor latihan" (total bintang 9 + gelar Kotoba)
   di dasbor kandidat. Butuh satu sumber kebenaran di server, bukan tiga
   `localStorage`.
4. **Papan peringkat per tingkat**: `detail.tingkat` sudah dikirim dan chip-nya
   sudah tampil; berikutnya memfilter papan, supaya skor magang tidak
   bercampur dengan veteran.
