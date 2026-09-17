# Dua hal yang menunggu keputusan Anda

## 1. "cvdigi ganti dengan profil" — teks itu TIDAK ADA di kode

Saya cari ulang dengan tiga pola, seluruh repo (bukan hanya `src`):

```
grep -rni "cvdigi|cv digi|cv-digi|cvdigital|cv digital"  → 0 hasil
grep -rn  "cvDigital"                                     → 0 hasil
```

Jadi saya **tidak menebak**. Tapi supaya Anda bisa menunjuk dengan cepat, ini **semua** label
CV yang benar-benar dirender ke kandidat (dari `src/store/i18n.ts`):

| Kunci i18n | Teks saat ini | Baris |
|---|---|---|
| `ui.cv_mini_basic` | "CV Mini (Data Dasar)" | 584 |
| `ui.cv_master_detail` | "CV Master (Detail)" | 585 |
| `ui.cv_type_hint` | "Pilih CV Mini untuk profil singkat, CV Master untuk detail lengkap." | 586 |
| `ui.update_cv_mini` | "Update CV Mini" | 583 |
| `ui.save_cv_mini` | "Simpan CV Mini" | 706 |
| `ui.ai_cv_assistant` | "AI CV Master Assistant" | 60 |
| `master.title` | "Form CV Master" | 234 |
| `toolbar.master` | "CV Master" | 1131 |
| `candidate.btn_cv_mini` | "CV Mini" | 1213 |
| `candidate.badge_silver_title` | "CV Mini Lengkap (Silver)" | 1208 |
| `ui.badge_silver` | "CV Mini Selesai (Silver)" | 559 |
| `ui.profile_incomplete` | "Selesaikan CV Mini & Master Profile" | 564 |
| `ui.toast_ai_cv_locked` | "Fitur AI CV Master eksklusif untuk Siswa ASJ…" | 600 |

**Yang paling mungkin Anda maksud:** `ui.cv_master_detail` = "CV Master (Detail)" — kalau diganti
"Profil", tombolnya jadi "Profil". Atau `master.title` "Form CV Master" → "Form Profil".

**Tolong tunjukkan yang mana** (screenshot, nama tombol, atau kunci i18n di tabel).

---

## 2. "Tambah status biodata baru" — SAYA SUDAH TEMUKAN BUG-nya, ini desainnya

### Bug yang saya buktikan (bukan dugaan)

Rantai persetujuan admin punya **satu jalur saja**:

```
handleApproveForm(payload)                        ← requireAdmin
  → handleFormStatus(idx, 'LULUS')                ← applications/service.ts:189
    → patchForm({ status: 'LULUS' })              ← status BARIS MAIL
    → syncCandidateDariForm(f, 'LULUS')           ← :65
        → PATCH database_candidate
             { status_kandidat: 'LULUS' }         ← ⚠️ STATUS LAMARAN ikut berubah
```

`handleApproveForm` tidak peduli baris mail itu **lamaran kerja** atau **update biodata/dokumen**.
Begitu admin menekan Setujui di Mail — termasuk untuk perbaikan biodata — `status_kandidat`
kandidat itu **menjadi 'LULUS'**.

Itulah yang Anda rasakan: *"update biodata di approve admin … bukan tulisan lulus"*.

### Fakta lain yang terverifikasi

- **Tidak ada kolom status biodata.** `grep status_biodata|biodata_status|status_berkas` = **0 hasil**
  di `netlify/`, `src/`, `migrations/`. Migrasi terakhir **`012`** ⇒ yang baru jadi **`013`**.
- **Jenis baris mail sudah tersimpan** di `feedback_berkas` dengan penanda:
  `[BIODATA] …` dan `[UPLOAD <LABEL>]`, plus `[[PREV:<status>]]` untuk menyimpan status sebelumnya.
- **`code_job` bisa kosong** untuk baris biodata murni; unique key-nya `(no_wa, code_job)`.
- Biodata disimpan ke `master_database_candidate` (154 kolom; 11 dipakai progress bar), lalu
  disinkronkan sebagian ke `database_candidate`.

### Tiga pilihan desain

**A. Kolom baru `status_biodata` di `database_candidate`** (paling eksplisit)
- Migrasi `013_biodata_status.sql`: kolom + default `NULL`.
- Saat admin menyetujui baris mail yang **bukan lamaran** (`[BIODATA]`/`[UPLOAD …]`, atau `code_job`
  kosong) ⇒ tulis `status_biodata = 'DISETUJUI'`, **jangan** sentuh `status_kandidat`.
- Saat baris itu **lamaran** ⇒ perilaku lama (`status_kandidat`).
- UI dashboard: badge "Telah disetujui admin" dari `status_biodata`.
- **+**: benar secara model data; tahan audit. **−**: butuh migrasi + kolom proyeksi + tes.

**B. Tanpa migrasi — turunkan dari `feedback_berkas`** (paling murah)
- "Telah disetujui admin" dihitung dari ada/tidaknya penanda persetujuan pada entri biodata.
- **+**: nol perubahan skema, bisa dikirim hari ini. **−**: status tidak eksplisit; sulit
  membedakan "belum pernah dikirim" dari "sudah disetujui" kalau entri tertimpa.

**C. Kolom `status_biodata` + tetap simpan riwayat di `feedback_berkas`** (A + B)
- Paling lengkap, tapi paling banyak kerja.

### Rekomendasi saya: **A**

Karena Anda secara eksplisit memilih **"Tambah status biodata baru"**, dan pilihan itu memang
butuh kolom tersendiri supaya "disetujui" bisa dibedakan dari "lulus tahapan". Sebelum saya
menulis kode, tolong konfirmasi:

1. Setuju **A** (kolom + migrasi `013`), atau cukup **B** tanpa migrasi?
2. Nilai statusnya: `DISETUJUI` saja, atau butuh tahapan lain (`BELUM_DIKIRIM`, `MENUNGGU`,
   `REVISI`)?
3. Untuk baris mail lama yang sudah `LULUS` sebelum perbaikan ini — **diamkan**, atau ada skrip
   backfill?
