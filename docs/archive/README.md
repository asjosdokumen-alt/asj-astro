# docs/archive — Dokumen Historis

Bagian dari peta dokumentasi: lihat [[README|docs/README]] untuk daftar lengkap.

Dipindahkan **2026-09-05**. Isi folder ini **tidak lagi menjadi referensi aktif**.
Ada karena nilainya historis: keputusan, alur pengerjaan, dan audit yang sudah
selesai atau sudah tertutup.

**Jangan pakai isi folder ini sebagai acuan kondisi kode saat ini.** Beberapa
di antaranya menyatakan sendiri sudah usang.

---

## Kenapa masing-masing ada di sini

### Dari root (4 file)

| File | Alasan |
|---|---|
| `HANDOVER.md` | Log sesi berjalan, 127 KB. Riwayatnya berguna; ukurannya membuat root tidak terbaca. |
| `CODE_REVIEW_2026-09-01.md` | Header sendiri: *"Historical Document"*. Mayoritas temuan sudah difix. |
| `SECURITY_AUDIT_2026-09-03.md` | Sebagian besar tertutup oleh hardening auth 2026-09-04 (C3/C4/C5/C6). |
| `overview.md` | Historikal **dan** duplikat isi `docs/db-optimization-2026-09-01.md`. |

### FASE 1–6 (6 file)

Semua memuat kalimat yang sama: *"Phase completed. This document is historical
reference."* Fase migrasi legacy → Astro sudah selesai.

`FASE1-SETUP.md`, `FASE2-LAYOUT.md`, `FASE3-AUTH.md`, `FASE4-ISLANDS.md`,
`FASE5-PWA.md`, `FASE6-NETLIFY.md`

### Stub `*-DEEP.md` (10 file)

Ringkasan **halaman legacy** (`khoci921`), masing-masing 5–10 baris poin.
Header: *"Analysis may not reflect recent code changes."*

Isinya mendeskripsikan kode lama, bukan `src/` yang sekarang — jadi berpotensi
menyesatkan kalau terbaca tanpa konteks.

`ai_admin_chat-`, `ai_form-`, `ai_parse-`, `ai_submit_ttd-`, `ai_wawancara-`,
`apply-full-`, `index-admin-`, `master-full-`, `share-`, `siswa-baru-` + `-DEEP.md`

> Catatan: `HTML_PAGES.md` dulu mengindex file-file ini. Tautannya sudah
> diperbarui ke `docs/archive/`. Satu tautan (`candidate-DEEP.md`) ternyata
> mengarah ke file yang **tidak pernah ada** — sudah ditandai di tabel.

### Spek orphan (1 file)

`2026-09-02-candidate-profile-modal-design.md` — desain awal
`CandidateProfileModal.tsx`. Modalnya sudah terimplementasi
(`src/components/admin/CandidateProfileModal.tsx`, 521 baris), jadi speknya
tinggal catatan. Aslinya di `docs/superpowers/specs/`; folder kosongnya sudah
dihapus.

---

## Cara mengembalikan

Semua file ini masih ada di `git HEAD` dengan path aslinya:

```bash
git show HEAD:HANDOVER.md            # lihat versi sebelum dipindah
git checkout HEAD -- HANDOVER.md     # kembalikan ke root
```

Salinan fisik juga ada di `.workbuddy-ai/backup-docs-2026-09-05/`
(tidak ikut ter-commit, ada di `.gitignore`).

---

## Kapan suatu dokumen masuk ke sini

Aturan dari `docs/ENGINEERING_PLAYBOOK.md` (W8):

> Tiga status saja: `docs/` (aktif), `docs/archive/` (historis), atau dihapus
> (usang). Root hanya berisi `README.md`.

Tanda sebuah dokumen layak diarsipkan:

- menyatakan sendiri sudah historis / *phase completed*
- menggambarkan kode yang sudah tidak ada
- isinya duplikat dokumen lain
- tidak direferensikan oleh dokumen aktif mana pun
