# Kotak masuk kandidat + alasan penolakan (2026-11-06)

Jawaban atas pertanyaan "idealnya gimana menurut tren PWA?" — dengan acuan, lalu
apa yang dibangun dan apa yang sengaja **tidak** dibangun.

## 1. Acuan yang dipakai

| Sumber | Yang diambil |
|---|---|
| WebKit, *Web Push for Web Apps on iOS and iPadOS* (Feb 2023) | Di iOS push hanya untuk web app yang **dipasang ke Layar Utama**, dan izin **wajib** diminta dari interaksi pengguna langsung. Badging API ikut didukung sejak 16.4. |
| MDN, *Badging API* | `setAppBadge(n)` / `clearAppBadge()`; butuh secure context; `0` = hapus badge. |
| web.dev, *Permission UX* | Jangan minta izin saat halaman dibuka. Pakai "double permission" (penjelasan dulu, baru prompt browser), sediakan sakelar, dan ingat: **setelah diblokir, halaman tidak bisa meminta lagi**. |

Kesimpulan dari ketiganya: **push bukan tempat menyimpan informasi**. Push adalah
kanal; kalau hanya push yang menyimpan, satu izin yang ditolak = informasi hilang.
Karena itu pola yang benar adalah **kotak masuk persisten + push sebagai pemberitahu**.

## 2. Yang dibangun

### a. `notifikasi_kandidat` (migrasi 049)
Satu baris per pemberitahuan, per siswa: `jenis`, `judul`, `isi`, `url`,
`dibaca_pada`. RLS ON. Urutannya selalu **tulis baris dulu, baru kirim push** —
kalau push gagal, barisnya tetap ada.

### b. `alasan_tolak` (migrasi 049)
Sebelumnya alasan penolakan ditulis ke `keterangan`, kolom yang **juga** menyimpan
daftar dokumen (`KTP:https://…;KK:…`). PATCH biasa berarti menolak satu baris
**menghapus seluruh daftar dokumennya** — terukur pada baris 558. Sekarang alasan
punya kolom sendiri, dan itulah yang dikirim ke kandidat.

### c. Satu pintu pengiriman
`_lib/notifikasi/kandidat.ts` menggantikan tiga tempat yang dulu merakit push
sendiri-sendiri (approve/reject, dan reminder jadwal). Semua pemberitahuan
kandidat sekarang lewat sini — jadi pertanyaan "apa saja yang pernah
diberitahukan ke siswa ini?" akhirnya bisa dijawab.

Yang terpasang:
- **Dokumen ditolak / direview / disetujui** — judul + alasan.
- **Reminder jadwal H-7, H-1, H-0** — satu POST berisi array (jadwal bisa 30
  kandidat; 30 round-trip berurutan menahan slot fungsi jauh lebih lama).

### d. Kotak masuk di dasbor
Komponen `KotakMasuk.tsx` di atas kartu jadwal: daftar pemberitahuan, badge
belum dibaca, "tandai semua dibaca", klik → tandai + buka tujuan. Badge ikon
aplikasi disinkronkan lewat Badging API (diabaikan diam-diam bila tak didukung).

### e. Izin yang tidak memancing blokir
Tombol **"Aktifkan notifikasi"** dengan satu kalimat penjelasan — bukan prompt
saat halaman dibuka. Tiga keadaan ditangani terpisah: `granted`, `denied`
(beri tahu cara membuka blokir di pengaturan situs), dan iOS yang belum dipasang
(beri instruksi Tambah ke Layar Utama).

## 3. Yang sengaja TIDAK dibangun

| Usulan | Alasan belum |
|---|---|
| Preferensi per jenis notifikasi | Pada skala satu LPK, semua jenis relevan. Menambah 4 sakelar berarti 4 jalur uji baru untuk manfaat yang belum terbukti dibutuhkan. |
| Quiet hours / jam tenang | Reminder H-0 justru harus berbunyi saat mendekati jamnya. |
| Retensi otomatis (hapus > 90 hari) | Tabel baru; ukur dulu berapa yang menumpuk dalam sebulan sebelum menambah cron. |
| Push untuk admin | **Sudah dibangun** (lihat §3b). Yang tersisa hanya tindakan manusia: admin membuka Pengaturan dan menekan "Aktifkan notifikasi" di perangkatnya. |

## 3b. Notifikasi perangkat admin

Terukur 2026-11-06: `fcm_tokens` berisi 18 baris dan **semuanya** bernomor
kandidat — push "Lamaran Baru!" tidak pernah sampai ke siapa pun. Kode
pengirimannya benar; yang tidak ada adalah satu langkah izin yang hanya bisa
dilakukan manusia.

Sekarang ada kartu **"Notifikasi perangkat ini"** di tab Pengaturan:

- tombol **Aktifkan notifikasi** (gestur pengguna, bukan prompt otomatis);
- **jumlah perangkat admin terdaftar** — supaya "izin diberikan" tidak
  disalahartikan sebagai "token terdaftar";
- keadaan `denied` memberi tahu cara membuka blokir lewat pengaturan situs;
- bila izin sudah ada tapi 0 perangkat, tombolnya berubah menjadi
  **"Daftarkan perangkat ini"**.

Sisa langkahnya operasional: admin membuka Pengaturan di perangkatnya dan
menekan tombol itu sekali.

## 4. Verifikasi

| Gate | Hasil |
|---|---|
| `tsc --noEmit` | 0 error |
| frontend | 140 berkas / 1 822 tes |
| backend | 129 berkas / 1 706 tes |
| indexer | 15 berkas / 199 tes |
| `verify:binding` | 107 action / 18 surface, 0 orphan |
| `verify:schema` | IN SYNC · 35 tabel |
| `verify:rls` | OK |
| `verify:entries` · `verify:md` · `verify:validation` | pass |
| `bundle:size` | pass (notify.js 127,2 KB — naik 35,5 KB karena pustaka notifikasi ikut di entry ini) |
| `lint-ratchet` | PASS (utang −13) |
| build | 19 halaman |
| migrasi | 49 applied · 0 pending · 0 drifted |

Uji REST langsung ke Neon: POST 2 baris (201), daftar terurut, hitung belum
dibaca, PATCH satu (mengembalikan 1 baris), PATCH semua (1 baris), sisa 0, dan
`alasan_tolak` diterima. Data uji dihapus lagi.

## 5. Catatan operasional

- Kandidat **tetap** menerima push hanya jika mengizinkan; kotak masuk menjadi
  jaring pengamannya.
- Di iPhone, push baru hidup setelah aplikasi dipasang ke Layar Utama — instruksi
  itu muncul di kotak masuk, bukan disembunyikan.
- Notifikasi lama tidak dihapus otomatis; lihat tabel "yang sengaja tidak dibangun".

## 6. Tindak lanjut 2026-11-07: banner revisi & teks penolakan

### 6a. Banner "berkas perlu revisi" sebelumnya TIDAK PERNAH muncul

`needRevision` dibaca dari `result.kandidatData` — objek yang tidak pernah
dikirim backend. Akibatnya banner di dasbor (beserta tombol unggah di dalamnya)
mati total, walaupun admin sudah menolak berkas dan mengisi alasannya.

Tiga tes lama tetap hijau karena fixture-nya mengisi `kandidatData.needRevision`
— jalur yang di produksi tidak ada. Itu contoh gerbang yang hijau karena
mengukur hal yang salah.

Sekarang nilainya **diturunkan dari baris riwayat berstatus GAGAL**, dan
aturannya self-healing: `mailStatusUntukUpdate('GAGAL')` mengembalikan `UPDATE`
(`contexts/applications/service.ts:56`), jadi begitu kandidat mengunggah ulang,
baris itu berhenti GAGAL dan banner hilang sendiri.

- Baris **dokumen** (`code_job` kosong) selalu dihitung — penolakannya tidak
  terikat loker mana pun.
- Baris **lamaran** hanya dihitung bila lokernya loker yang sedang aktif,
  supaya penolakan lama pada loker yang sudah ditinggalkan tidak menghantui
  dasbor.

### 6b. Satu kalimat penolakan untuk dua hal yang berbeda

Baris lamaran dan baris dokumen melewati jalur tolak yang sama, dan keduanya
memakai default `'Lamaran ditolak'`. Kandidat yang scan KTP-nya buram membaca
"Lamaran ditolak" — terukur pada baris 507 (AGUS KHOCI, `code_job` kosong).

Default sekarang dipilih di `handleFormStatus` (tempat jenis baris diketahui):

| Jenis baris | Teks default |
|---|---|
| lamaran (`code_job` terisi) | `Lamaran ditolak` |
| dokumen (`code_job` kosong) | `Berkas perlu diperbaiki` |

Satu nilai dipakai tiga pembaca — kolom `alasan_tolak`, isi push, dan event
`application.rejected` — jadi tidak bisa berbeda.

Data: baris 507 diperbaiki ke `Berkas perlu diperbaiki`. Itu satu-satunya baris
dokumen yang membawa teks default lama; alasan yang benar-benar ditulis admin
tidak disentuh.

### 6c. Retensi: DIUKUR, dan angkanya SALAH — koreksi

Klaim sebelumnya di laporan ini ("21 baris, isinya nyata, kotak masuk sudah
dipakai end-to-end") **salah**. Semua baris itu artefak **tes**, bukan aktivitas
kandidat.

| Ukuran | Nilai |
|---|---|
| Baris saat pertama diukur | 21 (sedang bertambah saat diukur) |
| Setelah diusut | **35**, dari 5 ledakan waktu: 13:53 · 16:20 · 16:33 · 22:58 · 23:13 UTC |
| Setelah dibersihkan | **0** |

Pola waktunya yang membongkar: tidak ada satu pun baris di luar lima menit
tersebut, dan tidak ada yang berjarak manusiawi. Isinya pun berulang persis
("Lamaran TG1ASJ disetujui" ×banyak untuk satu WA).

Penyebabnya ada di §7. Setelah diperbaiki, suite backend penuh (129 berkas /
1 706 tes) dan frontend (141 / 1 843) tidak menambah satu baris pun.

**Retensi tetap belum perlu** — tapi sekarang alasannya berbeda: bukan karena
volumenya wajar, melainkan karena **belum ada satu pun pemberitahuan nyata**
yang tercatat. Ukur ulang setelah kotak masuk dipakai sungguhan.

### 6d. Verifikasi

`tsc` 0 · frontend **141 berkas / 1 843 tes** (+4 tes banner) · backend
129/1 706 · indexer 653 berkas · `bundle:size` pass · lint & typecheck ratchet
pass · build 19 halaman.

## 7. Temuan 2026-11-07: suite tes menulis ke database PRODUKSI

`.env.local` menunjuk Neon (produksi), dan **dua suite** memanggil jalur tulis
sungguhan tanpa mock yang memadai.

### 7a. `service-bulk-delete.test.ts` — +4 baris per run

`handleApproveForm` / `handleReviewForm` memanggil
`await import('../../_lib/notifikasi/kandidat')` di dalam `handleFormStatus`.
Mock yang ada hanya mengganti `_lib/fcm-helpers`, jadi `kirimNotifikasi`
menulis baris `notifikasi_kandidat` **sungguhan**.

Terukur: satu run berkas itu menambah 4 baris (30 → 34).

### 7b. `service-input-validation.test.ts` — +1 baris per run, dan menyentuh baris nyata

Berkas ini **tidak punya mock sama sekali**. Tes "an empty reason is legal"
memanggil:

```ts
handleRejectForm([3, '', ''], admin)   // `admin` = signToken({ role: 'admin' })
```

Token itu SAH, jadi `handleFormStatus` berjalan penuh: `getFormByIndex(3)`
membaca baris ke-4 (`order: timestamp.desc`) dari database sungguhan, lalu
baris itu di-PATCH menjadi `GAGAL` dan satu notifikasi dikirim.

Kerusakannya **tersembunyi**: baris yang kena kebetulan sudah `GAGAL`, jadi
hitungan status tidak berubah dan tidak ada yang curiga. Yang bertambah hanya
baris notifikasi — satu per run.

### 7c. Dampak

| Hal | Nilai |
|---|---|
| Baris `notifikasi_kandidat` dari tes | **35** (5 ledakan waktu) |
| Nomor fixture `628111222333` | 27 baris — nomor ini **tidak ada** di `database_candidate` |
| Kandidat ASLI terdampak | **AGUS KHOCI** (`6282130442661`, tag `[VIP]`) — 8 baris |
| Push ke perangkat | **tidak terkirim** — mock `fcm-helpers` tidak punya `getKandidatTokens`, `kirimPush` gagal lalu ditelan |

Push tidak terkirim hanya karena kebetulan mock-nya tidak lengkap. Kalau mock
itu suatu hari dilengkapi, tes yang sama akan mengirim notifikasi ke ponsel
orang sungguhan.

### 7d. Perbaikan

- `service-bulk-delete.test.ts`: modul `_lib/notifikasi/kandidat` di-mock habis.
- `service-input-validation.test.ts`: `getFormByIndex` dibuat mengembalikan
  `null`, sehingga `handleFormStatus` berhenti di "Form tidak ditemukan."
  **sebelum** patch dan **sebelum** notifikasi.
- 35 baris artefak dihapus dari produksi.

Bukti sesudah perbaikan — dijalankan berurutan, hitungan tidak bergerak:

| Langkah | Baris |
|---|---|
| Sebelum | 0 |
| Suite backend penuh (129 berkas / 1 706 tes) | **0** |
| Suite frontend penuh (141 berkas / 1 843 tes) | **0** |

### 7e. Yang belum ditutup

Gerbang yang mencegah ini terulang **belum ada**. Yang bisa menangkapnya:
`supabaseJson` yang melempar bila `NODE_ENV === 'test'` dan URL-nya bukan
localhost — tapi itu menyentuh seluruh suite sekaligus dan perlu diukur
dampaknya. Dicatat sebagai utang, bukan dikerjakan diam-diam.
