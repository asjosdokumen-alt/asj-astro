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
