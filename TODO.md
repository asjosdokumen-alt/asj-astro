# 📋 TODO — ASJ Portal v2 (Astro)

**Terakhir dirapikan:** 2026-09-28

> ## ➡️ Pekerjaan BACKEND ada di satu tempat: **`docs/BACKEND_TODO.md`**
>
> File ini **bukan lagi** daftar backend. Versi sebelumnya (2026-09-03) sudah kedaluwarsa — banyak
> itemnya selesai (RLS, error boundary, document preview, AI interview simulator, WA blast massal)
> dan sebagian klaimnya tidak lagi benar. Daftar backend yang tunggal, berbukti, dan bertanggal ada di
> **`docs/BACKEND_TODO.md`**.
>
> Yang tersisa di bawah ini hanya pekerjaan **non-backend** (frontend, UX, produk).

---

## Frontend / UX (belum, dan bukan backend)

### Candidate experience
- [x] ~~Dark mode toggle — sudah ada, belum diuji menyeluruh~~ → toggle ada; tema
      terang & gelap sudah diukur di `/candidate` dan `/ai-cv` (2026-09-25/26).
      Belum disapu di seluruh halaman.
- [x] ~~Audit mobile responsive — semua halaman di HP~~ → **SELESAI 2026-09-26**
      (commit `5371c0b`): 11 rute × 390/1280, sebelum 0/20 bersih → sesudah
      **20/20 bersih** (0 overflow horizontal, 0 font < 11px, 0 target < 44px).
- [ ] Audit aksesibilitas (WCAG 2.1) — **hampir selesai**: lantai font 11px, lantai
      target 44px, dan focus-trap drawer/dialog sudah dikerjakan. **Kontras
      menyeluruh kini SELESAI untuk kondisi diam** (2026-09-27):
        · gate `e2e/test-contrast.mjs` ditambahkan (`36712a9`), 0 elemen di bawah
          lantai di 24 kombinasi rute × tema × lebar;
        · 182 node yang di-SKIP gate diukur dengan probe pixel (`deliverables/
          gstack/wcag-unmeasurable-audit-2026-09-27.md`);
        · **5 kegagalan AA nyata ditemukan dan diperbaiki** — `/apply` sticky CTA
          (`f02a352`) dan empat CTA gradien (`c000ca4`).
      ✅ **HOVER kini DIUKUR juga (2026-09-28).** Gate `e2e/test-hover-contrast.mjs`
      ada dan **hijau**: 132 elemen, 4 rute × 2 tema × 2 lebar, **0 temuan**, rasio
      hover terendah **4.69:1** (`/apply` "Lanjut"). Keadaan `:hover` TIDAK bisa
      dibaca dengan pointer, jadi dibangkitkan lewat `CSS.forcePseudoState` — dan
      asumsi itu **diverifikasi terhadap pointer sungguhan**, bukan diasumsikan.
      Gate-nya menegakkan LANTAI cakupan (MIN_PROBED = 60), jadi rewrite yang
      memindahkan warna hover ke JS akan GAGAL, bukan lolos diam-diam.
      ⚠ **Batas yang jujur:** `:active` & `:disabled` TIDAK diprobe; dan gate
      hanya melihat CSS — komponen yang menyetel warna hover dari state JS
      terukur pada warna DIAM. Panel admin juga belum tercakup (lubang yang sama
      yang dicatat `test-contrast.mjs`).
      ✅ **NAMA AKSESIBEL kini DISAPU juga (2026-09-28).** Gate `e2e:aria-names` ada
      dan **hijau** (40 cek): 10 rute × 2 lebar, **sembilan tab admin** × 2 lebar,
      dan dialog detail loker yang dibuka klik sungguhan. Ia membaca
      **accessibility tree ASLI** lewat `Accessibility.getFullAXTree` — bukan grep
      `aria-label`, yang mengembalikan ~60 kemunculan dan tidak satu pun memberi
      tahu apakah kontrol yang DIRENDER bernama. **14 kontrol anonim ditemukan dan
      diperbaiki.** Baterai mutasinya membuktikan gate-nya bisa merah:
      **5 KILLED + 1 OK-GREEN, 0 SURVIVED**. Laporan bukti:
      `deliverables/gstack/aria-audit-2026-09-28.md`.
      ⚠ **Batas yang jujur, dan ini bukan daftar yang akan habis:** nama yang ADA
      tapi SALAH ("Tutup" pada tombol hapus) tidak bisa dideteksi alat otomatis
      mana pun; hanya keadaan **DIAM** yang diukur (toast galat, pesan validasi,
      dan menu yang dibuka klik tidak tersapu); modal **tingkat-kedua** tidak
      disapu; dan `CvTemplateSelector`/`InputManualModal` berada di luar semua
      permukaan e2e sehingga dipatok tes komponennya sendiri.
      **Urutan heading, `<main>` tunggal, dan target skip-link sudah ditegakkan
      `e2e:headings` sejak §23/§24** — item (b) di catatan lama sudah tertutup,
      dan catatan itu salah menyebutnya "belum disapu".
- [ ] Loading skeleton di semua halaman yang memuat data

### Polish
- [ ] Image optimization via Cloudinary transforms
- [ ] Analisis bundle — kurangi JS
- [ ] Lighthouse audit — target 90+
- [ ] Error tracking (Sentry/LogRocket) — *ini menyentuh backend bila dipasang di function; lihat
      `docs/BACKEND_TODO.md` #7 untuk sisi observabilitasnya*
- [ ] PostHog / analytics perilaku
- [ ] Dashboard analytics admin (views, applies)

### Harness uji / tooling (bukan fitur)
- [x] ~~**`server.cjs` belum memetakan `.avif`**~~ → **SELESAI 2026-09-28.**
      `'.avif': 'image/avif'` ditambahkan (sebelumnya jatuh ke
      `application/octet-stream` — `text/html` untuk berkas yang TIDAK ada,
      karena SPA-fallback di `server.cjs:117` tidak memeriksa keberadaan
      `dist/index.html`).
      ⚠ **Severity-nya perlu dikoreksi, dan itu bagian dari temuan.** `server.cjs`
      **BUKAN produksi** — Netlify menyajikan situs dengan penanganan MIME-nya
      sendiri. Ia adalah **harness yang dipakai lima gate e2e** (`test-contrast`,
      `test-hover-contrast`, `test-headings`, `test-dialog`, WCAG audit). Jadi
      cacat ini **tidak terlihat di produksi** sementara **nyata di setiap tempat
      yang benar-benar mengukur**. Dampaknya luas: **18 referensi AVIF unik** di
      `dist/*.html`, semuanya di dalam `srcset` (itu sebabnya `grep src=` biasa
      melewatkannya) — dan semuanya tetap ter-paint, jadi tidak ada yang sadar.
      **Gate regresi:** `src/lib/serverMime.test.ts` — menegakkan invarian yang
      membuat bug ini mungkin, bukan hanya memperbaiki satu barisnya: setiap
      ekstensi gambar yang **benar-benar direferensikan `dist/`** harus punya
      entri MIME ber-`image/*`. Diverifikasi **merah** saat perbaikan dikembalikan
      (2 dari 4 tes gagal: `.avif` spesifik + cakupan gambar generik).
- [ ] `e2e/test-hover-contrast.mjs` + baterainya + `e2e/measure-hover-contrast.mjs`
      masih **belum di-commit** (lihat `git status`); wiring `package.json`,
      `.github/workflows/ci.yml`, dan `review-manifest.json` juga. Gate-nya
      **hijau** (diverifikasi 2026-09-28, 132 elemen / 0 temuan), tapi selama belum
      di-commit ia tidak melindungi apa pun di riwayat.

### Diketahui belum selesai (bukan bug, memang belum dibangun)
- [x] ~~**Daftar Agenda di panel admin masih kosong.**~~ → **SELESAI 2026-09-27**
      (`09878b9`). **Premis catatan lama ini SALAH** — lapisan datanya **sudah ada**
      (`netlify/functions/schedule.js` punya surface penuh, dan tab `jadwal` sudah
      membacanya: aksi sama, argumen sama, bentuk `d.schedules` sama). Yang hilang
      bukan backend, melainkan **komponen yang tidak pernah disambungkan** ke
      backend yang sudah ada. "Belum dibangun" dan "belum disambung" terlihat
      identik dari sebuah div kosong — hanya satu dari keduanya ketiadaan yang
      nyata. **Sebelum memercayai catatan "belum dibangun", cari dulu surface-nya.**
      Tile-nya kini juga membedakan LOADING / FAILED / EMPTY (sebelumnya ketiganya
      dirender identik), mengurut `waktu` menaik, dan menampilkan "5/9" supaya cap
      5 baris tidak disangka daftar lengkap.
- [x] ~~**`/loker` judul perusahaan terpotong**~~ → **SELESAI 2026-09-27**
      (commit `672d2f1`). Cap `max-w-[210px]` dibuang; nama perusahaan kini
      **utuh dari 390px** ke atas (sebelumnya selalu terpotong di 210px).
      ⚠ **Premis catatan lama ini salah.** Ia bilang cap itu "melindungi tombol
      menu" — padahal perbandingannya hanya rentang **x**. Tombol ada di
      `y 41..85` dan judul di `y 195..223`: diukur 3 rute × 6 lebar, **18/18
      tidak ada tumpang tindih vertikal**. Jadi cap itu tidak melindungi apa pun.
      Jangan tambahkan cap lagi berdasarkan alasan itu — bandingkan dua
      **persegi panjang**, bukan rentang x-nya.
- [x] ~~**Dropdown `ComboSelect` di `/ai-cv` dibatasi 50 item**~~ → **SELESAI
      2026-09-27** (commit `40a2fba`). `PEKERJAAN` berisi **100 entri** (25 legacy
      + 75 tambahan, diverifikasi saat runtime), jadi cap itu menyembunyikan
      separuh pilihan yang **tidak bisa dijangkau dengan scroll sama sekali**.
      Cap dibuang; kini 100 opsi dirender dan entri terakhir terjangkau.
      Sengaja **tidak** ditambah penanda "menampilkan N dari M" — beralasan,
      lihat pesan commit.

---

## Produk (butuh keputusan, bukan kode)

- [ ] Apakah email notification masih dibutuhkan? WA sudah jadi kanal utama dan **tidak ada modul email
      sama sekali** di repo — lihat `docs/BACKEND_TODO.md` #17
- [ ] Prioritas antara paritas legacy yang belum dibangun (Export Excel, reject composer, Migrasi Drive)
      vs fitur baru — lihat `docs/BACKEND_TODO.md` #11–#13

---

## ✅ Selesai (arsip ringkas)

Detail lengkap ada di `docs/BACKEND_TODO.md` §7 dan `docs/PARITY_CHECKLIST.md`.

- Backend architecture: 15 surface, 14 context, 13 kernel
- Phase A–D selesai (dengan sisa yang disebut namanya di `docs/BACKEND_TODO.md`)
- Phase E: chaos suite + idempotency replay selesai; load test & failover drill butuh staging
- Paritas A01–A19, B01–B07, C01–C04, C06
- Item owner 1, 2, 3, 5 (2026-09-13) — item 4 (B06 share token) masih tertahan, lihat #1
