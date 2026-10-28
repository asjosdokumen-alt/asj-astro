# Keputusan yang menunggu pemilik — 2026-10-29

Daftar ini **hanya berisi hal yang tidak boleh saya putuskan sendiri**: menyentuh
nilai data yang sudah ada, biaya uang, atau semantik produk yang Anda yang tahu
jawabannya. Yang bisa dikerjakan tanpa keputusan sudah dikerjakan hari ini
(§0).

Format tiap butir: **kenapa berhenti di sini · pilihan · rekomendasi · biaya
kalau dipilih**. Nomor di depan untuk dipakai saat menjawab (`A1: pilihan 2`).

---

## 0 — Sudah dikerjakan hari ini (tanpa perlu keputusan)

| # | Apa | Commit |
|---|---|---|
| G1 | `lint-ratchet` merah 2.009 → hijau 1.997; 12 diagnostik dibersihkan di sumber, baseline **diturunkan** | `96d9e25` |
| B13 | `isSupabaseConfigured()` berhenti menjawab `true` untuk host Neon yang tidak punya `/auth/v1` | `1630562` |
| P2c | Kamus Jepang (35,6 KB gz) tidak lagi diunduh setiap pengunjung — hanya pembaca JP | `8547516` |
| FCM | Notifikasi "biodata diperbarui" kini punya baris di Mail; push menunjuk `#mail` | `fb692d2` |
| Approve | Menyetujui dokumen tidak lagi menulis `status_kandidat = LULUS` pada kandidat | `fb692d2` |
| Label | Tab admin: "Lulus" → "Setujui / Disetujui" | `f007f6a` |
| Review | Baris yang sedang ditinjau tidak lagi hilang dari keranjang Review (`REVIEW ADMIN` ≠ `REVIEW`) | `fc3ea7c` |

---

## A — Produk & data (paling mendesak; ini yang membuat bingung)

### A1. Satu nilai `LULUS` dipakai untuk dua arti berbeda

**Keadaannya.** `database_asj_form.status` memakai `LULUS` untuk *"berkas/lamaran
ini disetujui admin"*. Di tabel yang sama, `database_candidate.status_kandidat`
juga memakai `LULUS` untuk *"kandidat lulus seleksi"*. Hari ini saya memutus
keduanya di satu titik (menyetujui baris tanpa `code_job` tidak lagi menulis
`status_kandidat`), dan label admin sudah jadi "Disetujui". **Nilainya sendiri
belum berubah** — masih `LULUS` di database, filter, dan ekspor.

Saudara dari masalah ini baru saja diperbaiki (`fc3ea7c`): `handleReviewForm`
menulis `REVIEW ADMIN` sementara keranjangnya `REVIEW`, sehingga baris yang
sedang ditinjau tidak cocok dengan filter mana pun. Dua-duanya gejala dari hal
yang sama — **nilai status ditulis bebas oleh pemanggil, tanpa satu daftar
kanonik**. Kalau A1 dikerjakan, sekalian tetapkan daftar itu di satu tempat
(mis. `STATUS_MAIL` sebagai konstanta bersama) supaya tidak ada nilai ketiga
yang lahir tanpa keranjang.

**Kenapa saya berhenti.** Mengubah nilai enum menyentuh baris yang sudah ada
(226 kandidat, 51 baris form), filter TabMail, ekspor biodata, dan
`syncCandidateDariForm`. Salah migrasi = status hilang, bukan status salah.

**Pilihan.**

1. **Biarkan** — nilai `LULUS`, hanya label yang membedakan (kondisi sekarang).
   Nol risiko, tapi siapa pun yang membaca database tetap melihat satu kata untuk
   dua arti.
2. **Tambah nilai, jangan hapus** — `DISETUJUI` untuk berkas, `LULUS` tetap
   untuk tahapan. Baris lama dimigrasikan (`UPDATE … SET status='DISETUJUI'
   WHERE status='LULUS' AND (code_job IS NULL OR code_job='')`). Konsumen baru
   membaca keduanya.
3. **Pisahkan field** — `status_berkas` (MENUNGGU/DISETUJUI/DITOLAK) dan
   `tahapan_seleksi` (LIST/TES/LULUS) sebagai dua kolom yang tidak saling
   menebak. Paling benar, paling mahal.

**Rekomendasi: (2) dulu**, karena (3) butuh (2) sebagai langkah antara dan (2)
sudah menghapus kebingungan yang Anda keluhkan. Migrasi harus **diterapkan ke
Neon sebelum** kode yang membacanya di-deploy — kalau tidak, 400 PGRST204
membatalkan barisnya (aturan repo ini).

**Biaya (2):** 1 migrasi SQL + ~6 berkas konsumen + 1 sesi pengujian.

---

### A2. Apakah update biodata memang perlu "direview" admin?

**Keadaannya.** Setiap update biodata menulis baris Mail berstatus `MENUNGGU`
dengan tombol Setujui/Review/Gagal — sama persis dengan lamaran loker. Anda
bilang ini tidak perlu. Teknisnya sekarang baris itu **tidak lagi** menandai
kandidat lulus (sudah diperbaiki hari ini), tapi tombolnya masih ada dan
statusnya masih `MENUNGGU`, jadi ia tetap muncul di antrean "belum ditinjau".

**Kenapa saya berhenti.** Menghilangkan tombol = memutuskan bahwa update biodata
tidak butuh persetujuan. Itu keputusan alur kerja Anda, bukan keputusan teknis.
Ada juga efek samping: kalau tidak ada tombol, baris `MENUNGGU` menumpuk di
filter default selamanya.

**Pilihan.**

1. **Baris informasi** — baris `[BIODATA]` (penanda sudah ada di
   `feedback_berkas`) tidak menampilkan Setujui/Gagal, hanya "Tandai dibaca", dan
   tidak dihitung di antrean `MENUNGGU`. Statusnya `INFO`.
2. **Tetap direview** seperti sekarang, hanya labelnya yang diperbaiki.
3. **Tidak dibuatkan baris sama sekali** — kembali ke perilaku lama (notif ada,
   Mail kosong). Tidak saya sarankan: itu keluhan Anda kemarin.

**Rekomendasi: (1).** Penandanya sudah ada dan sudah dipakai dashboard kandidat
(`isBiodataRow`), jadi tidak perlu kolom baru — hanya satu predikat di TabMail
plus satu status.

**Biaya:** ~1 sesi, tanpa migrasi kalau `INFO` cukup jadi nilai status baru di
baris yang dibuat mulai sekarang.

---

### A3. Sesi berakhir keras di 24 jam (B8)

**Keadaannya.** Server punya `refreshAdminSession` / `refreshKandidatSession`,
tapi tidak ada satu pun `signToken({ kind: 'refresh' })` di repo dan klien tidak
pernah memanggilnya. Jadi `refreshToken` selalu kosong dan sesi mati tepat 24 jam
setelah login — pengguna melihat "Sesi expired" di tengah kerja.

**Kenapa saya berhenti.** Dua arah yang sama-sama masuk akal, dan keduanya
mengubah perilaku sesi: (a) terbitkan token refresh → sesi diperpanjang diam-diam;
(b) hapus field + kedua handler → tidak ada yang percaya perpanjangan itu ada.

**Pilihan.** (a) perpanjang otomatis · (b) hapus kemampuannya · (c) biarkan, tapi
tampilkan hitung mundur di UI supaya tidak mengejutkan.

**Rekomendasi: (a)** untuk portal rekrutmen — kandidat mengisi formulir panjang
dan kehilangan sesi di tengah pengisian adalah keluhan yang mahal. Tapi ini
pilihan Anda.

**Biaya:** 1 sesi; menyentuh jalur login, logout, dan middleware sesi.

---

## B — Biaya & infrastruktur

### B1. Region Netlify Functions tidak dipin ke Singapura (P7)

**Keadaannya.** `netlify.toml [functions]` hanya menyetel `directory` dan
`node_bundler`; **tidak ada `region`**. Neon ada di `ap-southeast-1`. Sesi
migrasi 2026-10-25 mencatat **215 ms vs 33 ms** untuk perbedaan ini (tidak
diukur ulang hari ini — butuh dasbor).

**Kenapa saya berhenti.** Menyetel `region = "sin"` itu satu baris, tapi
site-wide dan butuh plan Pro. Itu keputusan uang, bukan teknis.

**Pilihan.** (1) pin ke `sin` · (2) biarkan · (3) ukur dulu dari dasbor sebelum
memutuskan.

**Rekomendasi: (3) lalu (1)** — kalau fungsi memang jalan di AS, ini kemenangan
latensi terbesar yang tersisa dan tidak menyentuh kode sama sekali.

---

### B2. Kamus i18n 2.058 entri untuk 85 key (P2b)

**Keadaannya.** `i18n.ts` mengirim 102 KB / 34,5 gz kamus Indonesia ke setiap
pengunjung; island landing hanya memakai **85 key** literal.

**Kenapa saya berhenti.** Ini **bukan** pemecahan modul biasa. `t()`
mengembalikan **key mentah** kalau entri tidak ada, jadi memecah kamus per-rute
berarti setiap island non-landing harus menunggu kamusnya sebelum render — atau
layar menampilkan `header.login`. Pilihannya produk: skeleton (layar kosong
sekejap) atau key mentah (teks rusak sekejap).

**Pilihan.** (1) kamus inti + sisanya lazy, dengan skeleton di island non-landing ·
(2) biarkan · (3) audit dulu berapa entri yang benar-benar mati (lebih murah,
tapi key dinamis seperti `t('option.' + x)` tidak bisa dibuktikan statis).

**Rekomendasi: (3) dulu.** Kalau ternyata ratusan entri mati, menghapusnya adalah
kemenangan tanpa risiko arsitektur. (1) hanya kalau (3) tidak menghasilkan apa-apa.

---

### B3. `getFreshToken()` mengunduh 56 KB gzip lalu tidak memakainya

**Keadaannya.** Setiap pengguna yang login, `apiClient.getFreshToken()` tetap
`await import('./supabase')` (212,7 KB / 56 gz). Setelah B13, `isSupabaseConfigured()`
menjawab `false` di produksi — jadi chunk itu diunduh dan **tidak dipakai**.

**Kenapa saya berhenti.** Predikat host (`isNeonDataApiHost`) sekarang tinggal di
`supabase.ts`, modul yang justru berat itu. Memindahkannya ke modul ringan
berarti **berkas baru**, dan berkas baru di `src/**` menggeser `files.length`
(counter beku 603) — itu wewenang team-lead.

**Pilihan.** (1) izinkan satu modul baru `src/lib/supabaseHost.ts` (+1 berkas,
counter 603 → 604, tercatat dengan atribusi) · (2) duplikasi 3 baris predikat di
`apiClient.ts` (tanpa berkas baru, tapi dua sumber kebenaran — persis pola yang
dulu melahirkan B6) · (3) biarkan.

**Rekomendasi: (1).** Duplikasi predikat adalah utang yang sudah pernah menagih
di repo ini.

---

## C — Performa yang mengubah semantik kueri

### C1. Rate limit per aksi admin (P4)

Setiap aksi ber-sesi admin — termasuk `getAppData('admin')` yang hanya membaca —
membayar satu RPC `rate_limit_check`. **Kenapa berhenti:** membatasi bucket ke
aksi yang menulis butuh daftar "aksi baca" yang tepercaya; salah menebak berarti
satu jalur tulis kehilangan perlindungan tanpa ada yang tahu. **Rekomendasi:**
turunkannya dari daftar aksi di `surfaces/` (yang sudah eksplisit), bukan dari
nama aksi.

### C2. Daftar kandidat membaca seluruh tabel (P5)

`loadCandidatesUnik()` mengambil seluruh tabel, memfilter dan mengurutkan di JS,
lalu `slice()` — `LIMIT/OFFSET` diemulasikan di memori. Tidak terasa pada 226
baris; bentuk kuerinya tidak berubah saat tumbuh. **Kenapa berhenti:** predikat
filter (`gender`, `usia`, `nilai_jft_text`) harus pindah ke PostgREST bersama
semantiknya, dan `saringKandidat()` mendokumentasikannya panjang. **Rekomendasi:**
kerjakan sebelum 1.000 kandidat, tidak mendesak sekarang.

### C3. Laporan bulanan mematerialisasi 5.000 baris (P6)

Butuh RPC `GROUP BY` (migrasi baru) atau agregat L3. **Kenapa berhenti:** migrasi
harus diterapkan ke Neon oleh Anda (saya tidak punya kredensial). **Rekomendasi:**
gabungkan dengan A1 saat migrasi berikutnya.

---

## D — Kerumahtanggaan

### D1. `test-results/` — 29 MB, 171 PNG

Gitignored, keluaran Playwright, aman dihapus dan akan dibuat ulang. Tidak saya
hapus karena kuota hapus sandbox ~50 berkas per sesi (R13a) — menghabiskannya
akan memalsukan gate berikutnya. **Keputusan Anda:** hapus manual, atau biarkan.

### D2. Push ke `main` = deploy berbayar

9 commit lokal menunggu (lihat `git log --oneline -9`). Saya tidak push (R19).
**Keputusan Anda:** kapan.

---

## Ringkasan yang paling saya butuhkan

Kalau hanya sempat menjawab tiga: **A2** (apakah biodata perlu direview),
**A1** (arti `LULUS`), **B1** (region fungsi). Ketiganya yang paling terasa
sehari-hari, dan A2 + A1 bisa dikerjakan dalam satu sesi.
