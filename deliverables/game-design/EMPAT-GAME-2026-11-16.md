# Empat game — status penutupan 2026-11-16

> **Tindak lanjut hari yang sama:** pintu Godot **DIPARKIR** (`GODOT_AKTIF=false`)
> karena keempat mode Godot dinilai belum layak. Empat game DOM tetap jalan dan
> tetap jadi jalur utama. Cara menyalakan lagi: `godot/README.md`.

Lanjutan `SKOR-SERVER-2026-11-16.md`. Pertanyaan yang dijawab: **apakah keempat
game sudah bisa dipakai sebagai satu set yang utuh, tanpa satu pun yang
tertinggal?**

Jawaban singkat: **ya untuk pemain, belum untuk kepercayaan skor.** Dua dari
empat papan masih menerima angka kiriman klien.

---

## 1. Matriks kemampuan per game

| | Genba | Combo | Kotoba | Matematika |
|---|---|---|---|---|
| Bisa dimainkan (DOM) | ✅ | ✅ | ✅ 4 mode | ✅ 13 modul + campuran |
| Layar hasil + rekor lokal | ✅ | ✅ | ✅ | ✅ |
| **Papan peringkat di halaman siswa** | ✅ | ✅ | ✅ | ✅ **baru** |
| Skor dihitung ulang server | ✅ | ✅ **baru** | ✅ **baru** | ✅ **baru** |
| Pintu Godot | ✅ | pratinjau | ✅ beta | ✅ beta |
| Unduh paket offline | ✅ | ✅ (satu mesin) | ✅ **baru** | ✅ **baru** |

## 2. Yang ditutup di irisan ini

### 2.1 Matematika tidak punya papan peringkat — sekarang punya

Sejak papan peringkat dibuat (2026-11-04), Matematika adalah **satu-satunya dari
empat game yang mengirim skor ke server tetapi tidak pernah menampilkannya
kembali.** Papan itu hanya ada di panel admin. Siswa bermain 20 soal, skornya
masuk tabel, dan ia tidak punya satu pun cara melihatnya.

Yang ditambahkan di `MatematikaGame.tsx`:

- panel lipat **🏆 Papan Skor** di atas layar (lobi, main, hasil) — bisa dibuka
  kapan saja tanpa kehilangan ronde;
- 10 besar, medali, kelas, dan **baris sendiri ditandai** (⭐) memakai `no_wa`
  sesi;
- tombol segarkan; papan ikut disegarkan setelah skor terkirim bila sedang
  terbuka;
- kunci i18n `matematika.papan_skor` (id + jp).

Pola markupnya sengaja sama dengan Kotoba, supaya keempat papan tidak menjadi
empat gaya.

### 2.2 Skor Matematika kini dihitung ulang server

`skor = benar × SKOR_PER_BENAR`, dan `benar` dulu angka kiriman. Sekarang klien
mengirim **hasil tiap soal** (`ronde: [0|1, …]`), server menghitung ulang:

- `hitungMatematika(ronde, total)` di `netlify/functions/shared/game-skor.ts`;
- `SKOR_PER_BENAR` dipindah ke `src/lib/matematika.ts` sebagai konstanta
  bernama, disalin ke modul backend, paritas dipaku `shared/game-skor.test.ts`;
- kiriman tanpa `ronde` **ditolak sebelum DB**; `benar`/`total` yang tidak
  cocok dengan ronde juga ditolak;
- `akurasi` ikut dihitung ulang (ia tampil di papan admin);
- baris hasil replay: `detail.diverifikasi = true`, `detail.skorKlien` untuk
  audit, `detail.ronde` = jumlah soal (bukan array).

### 2.3 Tombol unduh offline hanya ada di /arcade

Mesin Godot yang sama dipakai tiga halaman, tetapi tombol "Unduh paket game
(offline)" hanya dipasang di `/arcade`. Siswa yang membuka `/kotoba` atau
`/matematika` di Wi-Fi sekolah lalu kehilangan sinyal tidak punya cara
menyiapkan mesinnya — halaman itu akan gagal memuat justru saat dibutuhkan.

Tombol + status unduhan sekarang ada di ketiga halaman (`data-godot-unduh`,
`#asj-godot-unduh-status`); `page-bridge.js` sudah menanganinya secara global,
jadi tidak ada logika baru. Terverifikasi di HTML hasil build: ketiga berkas
memuat tombol itu.

### 2.4 Combo dan Kotoba kini juga direplay

Dua game terakhir yang masih menerima angka klien sudah ditutup dengan pola yang
sama seperti Genba/Matematika:

| Game | Modul replay | Bentuk ronde |
|---|---|---|
| Kotoba | `src/lib/kotoba-skor.ts` (+ salinan backend) | `[tepat, sisa, bonusOn, ketikOn]` |
| Combo | `hitungCombo` di `src/lib/arcade.ts` (+ salinan backend) | `[1,0]` benar · `[0,0]` salah · `[2,sisa,kodeLevel]` selesai |

**Kenapa tiap event membawa penanda tingkat/mode/level.** Panel filter Kotoba
(chip Santai/Normal/Ketat) dan tombol level Combo bisa diubah **di tengah
ronde** tanpa mereset skor. Kalau nilai itu hanya dikirim sekali di `detail`,
replay akan memakai nilai terakhir untuk seluruh riwayat dan menolak skor yang
sah. Karena itu:

- Kotoba: `bonusOn` (1 = tingkat ketat) dan `ketikOn` (1 = mode ketik) ikut per
  jawaban;
- Combo: kode level (0 normal · 1 sulit · 2 hell) ikut di setiap penyelesaian
  kalimat.

Konsekuensi lain: **tidak ada lagi jalur "terima angka klien"**. Keempat cabang
di `simpanSkor` menolak kiriman tanpa `ronde`, dan cabang `else` yang tersisa
hanya jaring untuk game baru yang belum punya replay.

## 3. Verifikasi

| Gerbang | Hasil |
|---|---|
| `npx vitest run e2e/matematika-gate.test.tsx` | **11 tes lulus** (tes papan peringkat baru) |
| `npx vitest run e2e/arcade.test.tsx e2e/kotoba-gate.test.tsx e2e/matematika-gate.test.tsx e2e/matematika-soal.test.ts e2e/kotoba-bank.test.ts` | **119 tes lulus**, termasuk dua tes kontrak baru: kiriman Combo dan Kotoba diputar ulang → skor yang tampil HARUS sama |
| `npx vitest run shared/game-skor.test.ts` | **17 tes paritas + semantik lulus** (Matematika, Kotoba, Combo) |
| `npx vitest run netlify/.../leaderboard.test.ts` | **30 tes lulus** (termasuk penolakan tanpa ronde untuk keempat game) |
| `npm run typecheck` | 0 error |
| `npm run lint-ratchet` | LULUS |
| `npm run build` | LULUS, 20 halaman, SW `asj-astro-9b65a1a38de2` |
| `node scripts/ci/verify-pwa.mjs` | 35 pemeriksaan lulus |
| `npm run bundle:size` | LULUS — 3.827,3 KB / 22 entry |
| `dist/{arcade,kotoba,matematika}/index.html` | masing-masing memuat `data-godot-unduh` |
| `indexer` build + discover | 24 tes lulus (counter 660 terukur) |

## 4. Yang masih terbuka (jujur)

1. **Keempat game sudah direplay, tetapi replay bukan anti-curang penuh.** Klien
   yang dimodifikasi masih bisa mengaku "semua jawaban benar, semua sisa waktu
   penuh" — replay akan menghasilkan skor maksimum yang sah. Yang hilang adalah
   kemampuan mengarang angka di luar ronde (mis. `999.999` tanpa bermain).
   Penjagaan sesungguhnya menuntut soal/ronde terbitan server.
2. **`public/godot/index.wasm` 38 MB** sudah masuk repo (commit `e512cb3`);
   keputusan Netlify Blobs/CDN tetap terbuka bila repo ingin dikecilkan lagi.
3. **Preflight unduhan** sudah ada: `public/godot/preflight.js` menawarkan
   unduhan saat Wi-Fi/4G dan paket belum lengkap, menunda 3 hari bila
   dijawab "Nanti", dan tidak pernah mengunduh otomatis. Diuji tabel kebenaran
   (`e2e/preflight.test.ts`) + banner sungguhan di probe browser.
4. **Combo di Godot tetap panggung visual** — teks Jepang sengaja tinggal di DOM
   (font CJK harus di-embed, teks canvas tidak terbaca pembaca layar). Itu
   keputusan desain, bukan pekerjaan tertunda.

## 5. Cara mengulang

```bash
npx vitest run e2e/arcade.test.tsx e2e/kotoba-gate.test.tsx \
  e2e/matematika-gate.test.tsx shared/game-skor.test.ts \
  netlify/functions/_lib/game/leaderboard.test.ts
npm run build && node scripts/ci/verify-pwa.mjs && npm run bundle:size
```
