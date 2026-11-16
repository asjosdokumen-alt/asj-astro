# Panggung Combo Godot: kartu berisi kata — 2026-11-16

Keluhan pemilik (screenshot): panggung Combo hanya kartu kosong, dan HUD-nya
menulis "Tarik barang ke rak berwarna yang disebut" — instruksi Genba di mode
Combo. Pertanyaannya: "masih bagusan DOM berarti ya, apa emang assetnya kurang?"

Jawabannya: **bukan asetnya yang kurang, teksnya yang tidak pernah dikirim.**
Bridge hanya mengirim `kartu.length`, jadi `combo.gd` menggambar panel kosong.
HUD-nya juga tidak pernah tahu mode mana yang sedang dibuka.

---

## 1. Yang diperbaiki

| Masalah | Perbaikan |
|---|---|
| Kartu kosong | `combo.gd` menggambar `Label` berisi kata di setiap kartu |
| Font Jepang tidak ada di proyek | Font Noto Sans JP **di-subset ke 224 glyph** (25 KB) → `godot/art/font-jp.otf` |
| Bridge hanya kirim jumlah kartu | Kirim array kata: `payload: { kartu: soal.kartu }` |
| Kartu tidak hilang saat kata dipakai | Event `benar` membawa `kata`; panggung memudarkan kartu yang cocok |
| HUD Combo menampilkan instruksi Genba | `tampil(mode)` menyetel kicker + hint per mode |

Kicker sekarang: `GENBA · SHIFT` / `KALIMAT · COMBO` / `FIGURAL · …`.
Hint Combo: "Ketuk kartu sesuai urutan kalimat".

## 2. Kenapa font subset, bukan font penuh

Teks Jepang tetap **dimiliki DOM** (aksesibilitas + font situs), tetapi panggung
butuh glyph untuk menggambar kartu. Font Noto Sans JP penuh 4,4 MB; yang dipakai
bank combo hanya 224 karakter unik → **25 KB** setelah `pyftsubset`. Hasilnya
pck tetap 1,6 MB (kenaikan < 1%).

Kalau nanti bank combo bertambah kata, subset harus dibuat ulang:

```bash
python -m fontTools.subset NotoSansJP-Regular.otf \
  --text-file=glyphs.txt --output-file=font-jp.otf \
  --layout-features="" --no-hinting --desubroutinize
```

`glyphs.txt` = semua karakter non-ASCII di `public/godot/page-bridge.js` +
ASCII yang mungkin tampil.

## 3. Bukti

Screenshot `deliverables/game-test-2026-11-16/godot-combo.png`: kartu fanned
menampilkan **コーヒー / は / を / わたし / のみます** untuk kalimat "Saya minum
kopi di kantin", dengan kicker `KALIMAT · COMBO`.

- probe browser: **18/18 langkah**, **0 error konsol** (sebelum perbaikan:
  `SCRIPT ERROR: Parse Error … _susun()` — dua kesalahan tipe GDScript yang
  muncul saat ekspor dan langsung diperbaiki)
- ekspor headless Godot 4.7.2 berhasil; `index.pck` 1,6 MB, `index.wasm` 38 MB

## 4. Yang belum

- **Penilaian kalimat tetap di DOM.** Panggung Godot menampilkan dan memudarkan
  kartu, tetapi validasi urutan masih milik DOM — memindahkannya berarti
  memindahkan teks Jepang ke canvas, dan itu bertentangan dengan alasan font
  subset ini ada.
- **Kartu belum punya ilustrasi**; masih panel navy + teks. Kalau ingin terasa
  seperti kartu fisik, langkah berikutnya adalah tekstur kartu (satu atlas,
  bukan 30 gambar).
- Kotoba Garden dan Figural belum disentuh.
