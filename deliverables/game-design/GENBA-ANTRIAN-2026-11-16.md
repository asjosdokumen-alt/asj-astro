# Genba: antrian pelanggan — 2026-11-16

Jawaban atas "game-nya simple banget, jauh dari versi DOM lama". Genba DOM
sebelumnya melayani **satu pesanan pada satu waktu**: tidak ada yang harus
dipilih, tidak ada yang bisa hilang. Sekarang tiga pelanggan menunggu
bersamaan, masing-masing dengan kesabarannya sendiri.

---

## 1. Apa yang berubah untuk pemain

- **Tiga pelanggan terlihat sekaligus** di atas meja, lengkap dengan bar
  kesabaran. Yang aktif diberi bingkai amber; bar memerah di bawah 30%.
- **Kesabaran berjalan bersamaan.** Melayani satu pelanggan tidak menghentikan
  dua lainnya. Memilih siapa dulu adalah keputusan yang punya harga.
- **Pelanggan kabur** kalau kesabarannya habis: nyawa −1, kombo putus, pesanan
  hangus, dan pengganti langsung masuk antrian.
- **Salah taruh tidak menghapus pelanggan.** Nyawa −1 dan kombo putus, tetapi
  ia tetap menunggu dengan sisa kesabaran yang sama — jadi kesalahan tidak
  "menghadiahkan" pesanan baru.
- **Berpindah pelanggan** menata ulang meja (barang pelanggan sebelumnya tidak
  boleh tertinggal), tetapi TIDAK mereset kesabaran siapa pun.
- Kesabaran = **2× batas gelombang** (reguler 16 dtk), supaya tiga orang bisa
  hidup bersamaan tanpa menjadi mustahil.

## 2. Kontrak skor: berubah sedikit, tetap bisa direplay

Satu pelanggan tetap satu pesanan, jadi `hitungGenba` tidak perlu tahu konsep
antrian. Yang berubah hanya **batas waktu per event**:

```
[benar, sisaMs]  →  [benar, sisaMs, batasMs]
```

- `batasMs` = kesabaran penuh pelanggan itu (bukan durasi gelombang), karena
  pelanggan yang datang lebih awal punya batas lebih longgar.
- Server menjepit `batasMs` ke **1.000–30.000 ms**. Di luar itu, nilai
  diturunkan dari gelombang seperti dulu. Tanpa jepitan, klien bisa mengirim
  `batasMs` kecil dan menggelembungkan bonus kecepatan.
- Event lama dua-elemen tetap diterima (jatuh ke batas turunan), jadi tidak ada
  data historis yang perlu dimigrasi.
- `[0,0]` menjadi `[0,0,0]`; wrong dan kabur sama-sama satu event.

## 3. Berkas

| Berkas | Perubahan |
|---|---|
| `src/lib/genba-antrian.ts` | **baru** — `buatPelanggan`, `tick`, `palingMendesak`, `batasPelanggan` (murni) |
| `src/components/candidate/ArcadeGame.tsx` | antrian 3 pelanggan, timer paralel, `kabur`, `layani`, `pilihAktif`, strip antrian |
| `src/styles/arcade.css` | `.arc-antrian*` (kartu, bar, keadaan panas) |
| `src/lib/arcade.ts` + `netlify/functions/shared/genba-skor.ts` | replay menerima `batasMs` per event, dijepit 1–30 dtk |
| `src/store/i18n{,-jp}.ts` | `arcade.antrian`, `arcade.pelanggan_kabur` |
| `e2e/genba-antrian.test.ts` | **baru** — 9 tes logika antrian |
| `e2e/arcade.test.tsx` | dua tes disesuaikan dengan perilaku baru |
| `indexer/src/{build,discover}.test.ts` | counter 660 → 661 |

## 4. Verifikasi

| Gerbang | Hasil |
|---|---|
| `npx vitest run e2e/genba-antrian.test.ts` | **9 tes** (×2 proyek) |
| `npx vitest run e2e/arcade.test.tsx` | **23 tes lulus** |
| `npx vitest run shared/{genba,game}-skor.test.ts netlify/.../leaderboard.test.ts` | **61 tes lulus** |
| `npm run typecheck` | 0 error |
| `npm run lint-ratchet` | LULUS (2 diagnostik baru diperbaiki di sumber) |
| `npm run build` | LULUS |
| probe browser (`_probe-4game.mjs`) | **18/18 langkah**, termasuk "antrian 3 pelanggan tampil" dan "berpindah pelanggan mengganti pesanan" |

## 5. Yang belum (jujur)

- **Kesulitan belum dikalibrasi dengan pemain sungguhan.** 16 dtk × 3 pelanggan
  adalah tebakan dari kurva lama; kalau terasa terlalu kejam, `SABAR_KALI`
  adalah satu angka yang bisa diturunkan.
- **Pelanggan belum punya karakter/visual** — masih kartu teks. Nama, wajah,
  atau keluhan saat kesabaran menipis akan menambah "rasa restoran" tanpa
  mengubah aturan.
- **Combo/Kotoba/Matematika belum disentuh.** Ini irisan Genba dulu.
