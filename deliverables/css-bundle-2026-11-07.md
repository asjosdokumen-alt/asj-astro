# Bundel CSS — diukur, lalu diputuskan TIDAK dipecah (2026-11-07)

Menjawab butir **(b)** temuan Lighthouse 2026-10-20: *"`admin.*.css` 185 KB
render-blocking di SEMUA halaman"*. Pertanyaannya sederhana — apakah memecah
bundel itu layak? Jawabannya **tidak**, dan alasannya bukan selera: angkanya
tujuh kali lebih besar dari kenyataan.

## 1. Yang benar-benar dikirim ke pengunjung

Diukur dengan `https.get` tanpa dekompresi otomatis, langsung ke produksi
(`amanahsakura.netlify.app`), berkas yang sama dengan build lokal
(`admin.C7G3N6n1.css` — hash isinya identik karena CSS tidak berubah hari ini):

| Permintaan | Byte di kabel |
|---|---|
| `accept-encoding: br` | **28,7 KB** |
| `accept-encoding: gzip` | 32,0 KB |
| `accept-encoding: identity` | 206,9 KB |

Angka 185–207 KB di laporan lama adalah ukuran **tanpa kompresi**, diambil dari
`server.cjs` yang tidak mengompresi sementara Netlify mengirim brotli. Itu bukan
angka yang pernah diterima siapa pun.

**Nama berkasnya juga menyesatkan.** `admin.*.css` adalah satu-satunya berkas CSS
di `dist/_astro/` dan dipakai oleh SEMUA halaman — beranda, `/apply`, `/loker`,
`/admin`, `/candidate`. Astro menamainya `admin` karena chunk entri, bukan
karena isinya CSS admin. Itu, ditambah angka tanpa kompresi, yang membuat
temuan ini terlihat jauh lebih besar dari kenyataannya.

## 2. Isinya: sebagian besar dipakai bersama

Klasifikasi dilakukan lewat **graf impor sungguhan** — bukan menebak dari nama
folder: mulai dari `src/pages/admin.astro` dan `src/pages/candidate.astro`,
telusuri semua impor relatif (125 berkas), lalu setiap aturan CSS diuji ke
kumpulan sumber itu.

| Bagian | Ukuran | Porsi |
|---|---|---|
| Dipakai bersama (publik + admin) | 130,0 KB | 62,8 % |
| **Hanya admin/candidate** | **47,4 KB** | **22,9 %** |
| Tak terklasifikasi (artefak generator) | 15,4 KB | 7,4 % |
| **Total** | **206,9 KB** | |

Artinya: memecah "CSS admin" keluar dari bundel publik hanya memindahkan
47,4 KB mentah — sekitar **6–7 KB setelah brotli**.

## 3. Kalau dipotong per HALAMAN, bukan per permukaan

Beranda hanya memakai **103,7 KB** dari 206,9 KB. Sebanyak **73,7 KB (35,6 %)**
dipakai di luar beranda (form, loker, dasbor, admin).

Jadi batas atas penghematan di beranda ≈ **10 KB brotli** — dan untuk itu
diperlukan dua build Tailwind (`@import "tailwindcss" source(none)` + `@source`
per permukaan), 19 halaman harus dibuktikan tidak kehilangan satu kelas pun,
plus gerbang cakupan CSS baru. Risikonya: satu kelas hilang = satu komponen
rusak di halaman yang mungkin jarang dibuka.

## 4. CSS mati: tidak ada yang layak dihapus

Analisis "kelas yang tidak muncul di sumber mana pun" melaporkan ~13 KB, tapi
contohnya (`.left-4`, `.isolate`, `.z-95`, `.row-1`) adalah **utilitas yang
dihasilkan Tailwind dari pemindaian teks** — bukan aturan tulisan tangan yang
tertinggal. Tidak ada yang bisa dihapus tanpa menyentuh sumber, dan tidak ada
bukti satu keluarga kelas pun sudah mati.

## Keputusan

**Tidak dipecah.** Perbandingannya: ~10 KB brotli (batas atas, butuh refactor
arsitektural + gerbang baru) melawan risiko regresi gaya di 19 halaman.

Sebagai pembanding, pekerjaan gambar hari ini menghemat **260 KB** di beranda HP
— 26x lebih besar, dengan risiko yang jauh lebih kecil. Kalau tujuan akhirnya
waktu muat, CSS bukan pengungkit berikutnya; **gambar sudah menjadi yang
terbesar dan sudah ditangani**.

## Yang tetap benar dari laporan lama

- `unused-javascript` 221 KiB → **sudah hilang**: `/` kini memuat 3 chunk JS,
  total **3,5 KB**. Impor dinamis Supabase dan `i18n-jp` bekerja.
- `unminified-javascript` 7 KiB → tetap sengaja (komentar pengukuran).

## Kalau nanti ini dibuka lagi

Syaratnya bukan "berani refactor", melainkan **gerbang cakupan lebih dulu**:
skrip yang membaca setiap `dist/**/*.html`, mengumpulkan seluruh nama kelas, dan
memastikan tiap kelas ada di berkas CSS yang di-`<link>` halaman itu. Tanpa
gerbang itu, pemecahan bundel hanya bisa diverifikasi dengan mata — dan mata
tidak memeriksa 19 halaman × 2 tema.
