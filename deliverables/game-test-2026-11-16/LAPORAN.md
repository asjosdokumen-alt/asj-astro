# Uji keempat game di browser — 2026-11-16

Dua pekerjaan: **memasang ulang Godot 4.7.2 di `E:`** (sebelumnya hanya ada di
`F:`, komputer rumah) dan **menguji keempat game** di browser sungguhan.

Hasil: **14/14 langkah lulus, 0 error konsol.**

---

## 1. Tooling Godot yang dipasang ulang

| Berkas | Lokasi | Ukuran |
|---|---|---|
| Editor 4.7.2 | `E:/godot-tooling/Godot_v4.7.2-stable_win64.exe` | 181 MB |
| Zip asli | `E:/godot-tooling/Godot_v4.7.2-stable_win64.exe.zip` | 82 MB |
| Export template | `%APPDATA%/Godot/export_templates/4.7.2.stable/web_nothreads_release.zip` | 10,2 MB |
| Paket template asli | `E:/godot-tooling/Godot_v4.7.2-stable_export_templates.tpz` | 1,19 GB |

Diambil dari rilis resmi `4.7.2-stable` (GitHub godotengine/godot). Versi yang
dilaporkan editor: `4.7.2.stable.official.ed1daf0bf`.

**Bukti bisa dipakai, bukan sekadar terpasang:** impor + ekspor headless
dijalankan ke folder di luar repo (`E:/godot-tooling/export-test/`):

```bash
E:/godot-tooling/Godot_v4.7.2-stable_win64.exe --headless \
  --path E:/astro/godot --import
E:/godot-tooling/Godot_v4.7.2-stable_win64.exe --headless \
  --path E:/astro/godot --export-release "Web" E:/godot-tooling/export-test/index.html
```

Hasil ekspor: `index.wasm` 38 MB · `index.pck` 1,6 MB · `index.js` 274 KB —
**sama persis** dengan build yang sudah ada di `public/godot/`. Artinya
lingkungan ekspor sudah utuh; tidak ada yang perlu di-commit ulang.

## 2. Cara uji

`deliverables/_probe-4game.mjs` — Playwright, viewport 390×844, menjalankan
`server.cjs` sendiri.

- **API dipalsukan di browser** (`page.route`): `getBankKotoba`,
  `getBankMatematika`, `getPapanSkor`, `simpanSkorGame` dijawab fixture.
  Halaman tetap menjalankan kode aslinya, tetapi **tidak ada satu pun permintaan
  yang keluar** — jadi tidak ada risiko menyentuh DB produksi.
- Sesi palsu ditanam di `localStorage('asj_auth')` supaya gerbang login berjalan
  seperti untuk siswa.
- Setiap pintu Godot diukur waktunya sampai `#asj-godot[data-status="siap"]`.

## 3. Hasil

| # | Langkah | Hasil |
|---|---|---|
| 1 | `/arcade` terbuka | ✅ |
| 2 | **Preflight: tawaran unduhan muncul** (Wi-Fi, cache kosong) | ✅ teks "Unduh paket game (±10 MB)" |
| 3 | **Preflight: "Nanti" menunda 3 hari** | ✅ `asj_godot_preflight_nanti` diisi |
| 4 | Genba: satu pesanan benar memajukan ronde | ✅ perintah berganti |
| 5 | Combo: panggung kalimat tampil | ✅ |
| 6 | Combo: kartu bisa diketuk | ✅ |
| 7 | Godot Genba: engine siap | ✅ 1–2 dtk |
| 8 | Godot Combo (pratinjau): engine siap | ✅ 1 dtk |
| 9 | Kotoba: soal tampil | ✅ |
| 10 | Kotoba: jawaban benar diterima | ✅ |
| 11 | Kotoba: papan peringkat terbuka | ✅ |
| 12 | Godot Kotoba Garden: engine siap | ✅ 1 dtk |
| 13 | Matematika: lobi tampil | ✅ |
| 14 | Matematika: papan peringkat terbuka | ✅ baris sendiri ditandai |
| 15 | Matematika: satu soal bisa dijawab | ✅ |
| 16 | Godot Figural: engine siap | ✅ 1 dtk |

**0 error konsol, 0 `pageerror`.** Screenshot tiap langkah ada di folder ini:
`preflight.png`, `genba-dom.png`, `combo-dom.png`, `kotoba-kuis.png`,
`matematika-papan.png`, `matematika-soal.png`,
`godot-{genba,combo,garden,figural}.png`.

## 3b. Preflight unduhan (baru)

Sebelum ini tombol "Unduh paket game (offline)" hanya berguna bagi siswa yang
tahu ia harus menekannya **sebelum** kehilangan sinyal. Preflight menawarkan
unduhan pada momen yang tepat: halaman terbuka, sinyal bagus, paket belum ada.

| Keputusan | Syarat |
|---|---|
| Tawarkan | `connection.type === 'wifi'` **atau** `effectiveType === '4g'` |
| Jangan tawarkan | `saveData` aktif · sudah pernah ditunda · paket sudah lengkap |
| Jangan tawarkan | koneksi 3G/2G atau API koneksi tidak ada (Safari) — 10 MB di kuota bukan tawaran |

- Logika murni di `public/godot/preflight.js`; DOM-nya dirakit `page-bridge.js`.
- "Nanti" menunda **3 hari**, bukan selamanya.
- Tidak pernah mengunduh otomatis.
- Diuji dua lapis: tabel kebenaran `e2e/preflight.test.ts` (10 tes, jalan di
  proyek frontend **dan** backend) + banner sungguhan di probe ini.

Catatan Godot: engine memuat **1–3 detik** dari localhost (38 MB wasm, cache
HTTP hangat). HUD, instruksi Jepang, skor, nyawa, rak berwarna, dan tombol
Tutup/Ulangi/Choukai tampil di dalam bingkai 9:16.

## 4. Dua kesalahan probe yang diperbaiki (bukan bug aplikasi)

1. Probe menunggu `[data-testid="arcade-perintah"]` **sebelum** menekan "Mulai
   Shift" — elemen itu baru ada setelah shift dimulai. Timeout 30 dtk.
2. Probe memeriksa `#asj-godot-mount[data-status="siap"]`, padahal loader
   menempelkan status di `#asj-godot` (kanvas). Sempat dilaporkan "gagal"
   padahal engine siap.

Keduanya dipertahankan sebagai komentar di dalam skrip supaya tidak terulang.

## 5. Yang belum

- **Combo di Godot tetap panggung visual**, dan itu keputusan desain: teks
  kana/kanji hidup di DOM (font CJK harus di-embed beberapa MB dan teks canvas
  tidak terbaca pembaca layar). Memindahkan penilaian kalimat ke Godot berarti
  kehilangan keduanya, jadi tidak dikerjakan.
- `public/godot/index.wasm` 38 MB **sudah masuk repo** (commit `e512cb3`).
- Preflight unduhan **sudah ada** (bagian 3b).
