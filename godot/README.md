# `godot/` — DIPARKIR (2026-11-16)

Proyek Godot 4.7.2 ini **tidak dirender di situs**. Pintunya ditutup lewat satu
sakelar:

```ts
// src/lib/fiturGodot.ts
export const GODOT_AKTIF = false;
```

Pemilik menilai keempat mode Godot belum layak dibanding versi DOM, jadi
tombolnya disembunyikan — bukan dihapus. Proyek, ekspor web, dan font subset
tetap di repo supaya bisa dinyalakan lagi tanpa membangun ulang dari nol.

## Menyalakan lagi

1. `src/lib/fiturGodot.ts` → `GODOT_AKTIF = true`
2. `npm run build`
3. Bersihkan Cache Storage sekali (paket engine di-cache-first):
   `caches.keys().then(k=>Promise.all(k.map(x=>caches.delete(x))))`
4. Buka `/arcade`, `/kotoba`, atau `/matematika` → kartu "Versi baru · Godot 4.7"
   muncul kembali.

## Mengekspor ulang (setelah mengubah `.gd`)

Editor tidak ikut repo (181 MB). Di mesin ini ia ada di:

```
E:/godot-tooling/Godot_v4.7.2-stable_win64.exe
```

Export template web ada di `%APPDATA%/Godot/export_templates/4.7.2.stable/`.

```bash
E:/godot-tooling/Godot_v4.7.2-stable_win64.exe --headless \
  --path E:/astro/godot --import
E:/godot-tooling/Godot_v4.7.2-stable_win64.exe --headless \
  --path E:/astro/godot --export-release "Web" E:/astro/public/godot/index.html
npm run build   # menyegarkan dist + hash versi service worker
```

⚠️ Ekspor bisa "sukses" walaupun GDScript gagal dimuat. Error parse hanya
muncul di konsol browser — periksa lewat `deliverables/_probe-4game.mjs`.

## Font Jepang di panggung Combo

`art/font-jp.otf` adalah **subset 224 glyph (25 KB)** dari Noto Sans JP, hanya
huruf yang dipakai bank combo. Kalau kata di `public/godot/page-bridge.js`
bertambah, subset harus dibuat ulang:

```bash
python -m fontTools.subset NotoSansJP-Regular.otf \
  --text-file=glyphs.txt --output-file=font-jp.otf \
  --layout-features="" --no-hinting --desubroutinize
```

## Isi

| Path | Isi |
|---|---|
| `project.godot` | Compatibility, portrait 720×1280, stretch `canvas_items` |
| `scenes/Main.tscn` | satu scene, empat view |
| `scripts/views/*.gd` | genba · combo · kotoba · figural |
| `shaders/fx.gdshader` | vignette + flash |
| `art/*.webp` | 4 latar + atlas barang + font subset |
