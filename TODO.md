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
- [ ] Audit aksesibilitas (WCAG 2.1) — **sebagian**: lantai font 11px, lantai
      target 44px, dan focus-trap drawer/dialog sudah dikerjakan; audit WCAG penuh
      (kontras menyeluruh, urutan heading semua halaman, ARIA) belum.
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
- [ ] **`/loker` judul perusahaan terpotong** jadi "PT AMANAH SAKUR…". Penyebabnya
      cap `max-w-[210px]` yang selalu lebih sempit dari teksnya (terukur: kotak
      210px vs teks 274px, jadi 64px terpotong di SEMUA lebar 320–414). Perlu cap
      responsif; `truncate` sendiri sudah benar untuk melindungi tombol menu.
- [ ] **Dropdown `ComboSelect` di `/ai-cv` dibatasi 50 item** (`matches.slice(0,50)`)
      sementara CV Master menampilkan semua. Bisa dicari dengan mengetik, tapi
      daftar kosong terlihat lebih pendek daripada CV Master.

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
