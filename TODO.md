# 📋 TODO — ASJ Portal v2 (Astro)

**Terakhir dirapikan:** 2026-09-26

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
      ⚠ **Yang BELUM**: (a) **keadaan HOVER/FOCUS tidak diukur** — dua dari lima
      temuan hanya muncul di hover, dan hover yang membuatnya justru keadaan
      TERBURUK di halaman (2.54:1, lebih buruk dari kondisi diam 3.77:1) karena
      konvensi "menyala saat hover" selalu menurunkan kontras teks putih;
      (b) urutan heading & ARIA di semua halaman belum disapu.
- [ ] Loading skeleton di semua halaman yang memuat data

### Polish
- [ ] Image optimization via Cloudinary transforms
- [ ] Analisis bundle — kurangi JS
- [ ] Lighthouse audit — target 90+
- [ ] Error tracking (Sentry/LogRocket) — *ini menyentuh backend bila dipasang di function; lihat
      `docs/BACKEND_TODO.md` #7 untuk sisi observabilitasnya*
- [ ] PostHog / analytics perilaku
- [ ] Dashboard analytics admin (views, applies)

### Diketahui belum selesai (bukan bug, memang belum dibangun)
- [ ] **Daftar Agenda di panel admin masih kosong.** `#dash-agenda-list` adalah
      empty-state hardcoded ("Jadwal akan dimuat dari backend."); tidak ada penulis
      untuk id itu di seluruh repo. Tab `Agenda` karenanya tampil kosong sampai
      disambungkan ke data jadwal sungguhan.
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
