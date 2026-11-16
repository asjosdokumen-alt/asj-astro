# Skor Genba dihitung ulang di server — 2026-11-16

Status: **butir #1 dari "Yang belum selesai" (laporan 2026-11-15) selesai untuk
Genba.** Skor yang masuk papan peringkat sekarang adalah hasil replay ronde di
server, bukan angka kiriman klien.

> **Tindak lanjut hari yang sama:** Matematika, Kotoba, dan Combo menyusul —
> lihat `EMPAT-GAME-2026-11-16.md`. Keempat game kini menolak kiriman tanpa
> `ronde`; `diverifikasi:false` tidak dipakai lagi.

Basis: HEAD `6992b75` (kerja 2026-11-15 malam belum di-commit) + irisan ini.
Tidak ada push, tidak ada deploy.

---

## 1. Masalah yang dijawab

Laporan 2026-11-15 mencatat sendiri:

> Papan sudah kebal seri, tetapi klien yang dimodifikasi masih bisa mengirim
> angka. Kalau skor mau dipercaya, server harus menghitung ulang dari event ronde.

Sebelum irisan ini, `simpanSkor` hanya memeriksa `0 ≤ skor ≤ 1.000.000`. Klien
yang membuka DevTools bisa mengirim `999999` tanpa memainkan satu pesanan pun,
dan papan peringkat menampilkannya sebagai juara — tanpa satu pun error.

## 2. Yang berubah

| Berkas | Perubahan |
|---|---|
| `src/lib/arcade.ts` | `poinGenba(sisaMs, batasMs, kombo)` — argumen pertama MILIDETIK, bukan persen. Tambah `hitungGenba(tingkat, ronde)` + `RONDE_MAKS` + `HasilHitungGenba` |
| `netlify/functions/shared/genba-skor.ts` | **BARU.** Salinan fisik rumus + `hitungGenba` untuk server (bundler Netlify tidak menjangkau `src/`, pola sama dengan `shared/wa-rules.ts`) |
| `shared/genba-skor.test.ts` | **BARU.** 14 tes paritas: tabel tingkat, rumus poin, kurva gelombang, replay penuh, payload rusak |
| `netlify/functions/_lib/game/leaderboard.ts` | Genba: replay ronde → skor; tolak kiriman tanpa ronde; simpan `diverifikasi`, `skorKlien`, jumlah event |
| `netlify/functions/_lib/game/leaderboard.test.ts` | 7 tes baru dengan DB palsu (tidak ada koneksi) |
| `src/components/candidate/ArcadeGame.tsx` | Mencatat setiap jawaban `[benar, sisaMs]` di `rondeRef`, mengirimnya di `detail.ronde` |
| `e2e/arcade.test.tsx` | Tes kontrak: payload kiriman diputar ulang → skor HARUS sama dengan yang tampil |
| `indexer/src/{build,discover}.test.ts` | Counter beku 655 → 657 (dua berkas `.ts` baru), diatribusi per bucket |

### 2.1 Mengapa milidetik, bukan persen

Persen 0–100 yang sudah dibulatkan kehilangan informasi tepat di tempat
pembulatan terjadi. Dua kiriman yang sah bisa berbeda 1 poin antara hitungan
klien dan replay, lalu ditolak. Milidetik adalah angka yang benar-benar diukur
timer, jadi ia yang dipakai kedua sisi. Efek sampingnya: `presisi` (4 digit
pemecah seri) kini dijumlahkan dari `sisaMs` yang sama, bukan dari
`round(sisa/100 × durasi)` — satu sumber, bukan dua.

### 2.2 Kontrak kiriman

```jsonc
// detail pada simpanSkorGame (game: "genba")
{
  "tingkat": "reguler",
  "pesanan": 12,          // pesanan fase terakhir (klien mereset ke 0 tiap gelombang)
  "loop": 0,              // nomor gelombang BERJALAN (0 = shift dasar)
  "presisi": 4000,        // diabaikan server, dihitung ulang
  "ronde": [[1, 8000], [1, 7643], [0, 0], ...]  // [benar, sisaMs] berurutan
}
```

Server memakai `tingkat` + `ronde` saja. `pesanan` dan `loop` hanya untuk
memeriksa kewajaran; keduanya tidak pernah dipakai sebagai angka skor.

### 2.3 Yang ditolak

| Kiriman | Hasil |
|---|---|
| Genba tanpa `ronde` | ditolak — **sebelum** menyentuh DB |
| `ronde` kosong / bukan array / event rusak / > 4.000 event | ditolak |
| `tingkat` asing | ditolak (tidak diam-diam jadi reguler) |
| `ronde` 3 event tapi `pesanan: 12` | ditolak |
| `loop: 7` padahal ronde tidak berisi gelombang | ditolak |
| Skor replay melewati plafon | ditolak |

### 2.4 Toleransi yang disengaja

Dua perbandingan dibuat longgar karena semantik klien dan replay memang beda:

- **`pesanan`** — klien mereset penghitung ke 0 setiap fase tuntas, jadi `0`
  selalu diterima. Tanpa ini, pemain yang berhenti tepat di pergantian
  gelombang akan ditolak.
- **`loop`** — klien mengirim nomor gelombang BERJALAN, replay menghitung
  gelombang TUNTAS. Selisih 1 karena itu normal (gugur di gelombang loop
  pertama — akhir yang paling sering terjadi). Selisih > 1 ditolak.

Yang **disimpan** tetap angka replay, bukan angka klien. Toleransi hanya
mempengaruhi penerimaan, bukan nilai.

## 3. Batas yang jujur

Ini **bukan anti-curang penuh**. Klien yang dimodifikasi masih bisa mengaku
"12 jawaban benar, masing-masing 8.000 ms" — dan replay akan menghasilkan skor
sempurna. Yang hilang:

- kemampuan mengarang angka di luar ronde (mis. `999.999` tanpa bermain);
- kemampuan memilih skor yang tidak konsisten dengan jumlah pesanan/loop;
- kemampuan menyelundupkan `presisi` palsu (dihitung ulang).

Penjagaan sesungguhnya menuntut **soal yang diterbitkan server** (nonce per
ronde), dan itu perubahan protokol yang jauh lebih besar. Belum dikerjakan.

**Game lain: sudah menyusul (hari yang sama).** `matematika`, `kotoba`, dan
`combo` kini juga punya replay (`hitungMatematika`, `hitungKotoba`,
`hitungCombo`). Rinciannya di `EMPAT-GAME-2026-11-16.md`; catatan di bawah tetap
berlaku untuk seluruh replay, bukan hanya Genba.

**Klien lama ditolak.** Bundel yang masih cached dan belum punya `ronde` tidak
bisa menyimpan skor Genba. Rekor lokal tetap jalan; papan peringkat menunggu
satu reload. Ini konsekuensi sadar dari "tanpa ronde = ditolak" — kalau tidak,
celahnya cuma berpindah ke "jangan kirim ronde".

## 4. Verifikasi

| Gerbang | Hasil |
|---|---|
| `npx vitest run src/lib/arcade.test.ts` | **43 tes lulus** (9 merah dulu: `hitungGenba is not a function`, 6 angka poin meleset) |
| `npx vitest run netlify/.../leaderboard.test.ts` | **22 tes lulus** (6 merah dulu: tanpa ronde masih diterima, `diverifikasi` belum ada) |
| `npx vitest run shared/genba-skor.test.ts` | **14 tes paritas lulus** |
| `npx vitest run e2e/arcade.test.tsx` | **22 tes lulus**, termasuk kiriman ronde 12 pesanan → replay = skor yang tampil |
| `npm run typecheck` | 0 error |
| `npm run lint-ratchet` | LULUS (utang turun 8, baseline tidak di-rebaseline) |
| `npm run verify:io` | PASS (137 berkas, 6 bypass ter-allow-list) |
| `npm run verify:validation` | PASS (10/34, baseline sinkron) |
| `npm run build` | LULUS, 20 halaman, SW `asj-astro-9aecc909a955` |
| `npm run bundle:size` | LULUS — 3.821,5 KB / 22 entry (naik 6,7 KB dari 3.814,8) |
| `node scripts/ci/verify-pwa.mjs` | 35 pemeriksaan lulus |
| `npx vitest run indexer/src/{build,discover,count-indexed}.test.ts` | 25 tes lulus (counter 657 terukur, bukan ditebak) |

Tes yang **sengaja tidak** dijalankan: `npm test` penuh (sebagian suite
service-context pernah menulis ke DB produksi — catatan proyek).

## 5. Cara mengulang

```bash
npx vitest run src/lib/arcade.test.ts shared/genba-skor.test.ts \
  netlify/functions/_lib/game/leaderboard.test.ts e2e/arcade.test.tsx
npm run typecheck && npm run lint-ratchet && npm run verify:io
```

Kalau `SHIFT_GENBA` diubah: ubah **kedua** salinan
(`src/lib/arcade.ts` + `netlify/functions/shared/genba-skor.ts`). Paritas akan
merah kalau hanya satu sisi yang bergerak — itu tujuannya.

## 6. Yang belum

1. Replay untuk `combo`, `kotoba`, `matematika` (pola sama, rumus beda).
2. Soal/ronde yang diterbitkan server (anti-curang sesungguhnya).
3. `public/godot/index.wasm` 38 MB masih untracked di repo — belum diputuskan.
4. Preflight unduhan otomatis (butir #2 laporan 2026-11-15) belum disentuh.
