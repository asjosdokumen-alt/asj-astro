# Uji jalur "buat job baru" (2026-10-09)

Dijalankan ke DB yang `.env` tunjuk (cadangan). Dua job uji **benar-benar
dibuat lalu dihapus**; sesudahnya `job_database` kembali 158 baris, 0 job uji.

## Pertanyaan 1 — "nomor paling besar + 1, baik TG maupun GJ?"

**Logikanya benar, tapi tidak bisa dipakai untuk GJ.** `nextJobCode()` memang
memakai nilai TERBESAR **per prefix** + 1, dihitung numerik (bukan urutan
string) — terverifikasi untuk TG dan GJ.

Yang salah adalah cara prefix ditentukan:

```
jobCodePrefix('Magang')     -> GJ   ✓
jobCodePrefix('🎓 MAGANG')  -> TG   ✗   (sebelum perbaikan)
```

Pemeriksaannya `k === 'magang'` atas **seluruh** string, sedangkan setiap
kategori di data nyata berhias emoji ("🌾 PERTANIAN", "👵 KAIGO", …) — dan
form Tambah Job memang menawarkan **"🎓 MAGANG"**. Jadi cabang GJ tidak pernah
bisa dipakai lewat jalur normal: terukur **0 kode GJ dari 158 job**.

Diperbaiki: 'magang' dicocokkan sebagai KATA (batas kata eksplisit, jadi
'MAGANGKERJA' tidak ikut cocok).

## Pertanyaan 2 — "selalu tampil paling atas, di loker maupun admin?"

**Belum. Tidak ada yang mengurutkan sama sekali.** `findJobs()` memanggil
`findTable()` **tanpa klausa `order`**, dan `job_database` tidak punya kolom
waktu — jadi urutannya apa pun yang dikembalikan Postgres. Diukur: dua job
yang baru dibuat mendarat di posisi **158 dan 159 dari 160** (paling bawah).

Diperbaiki dengan mengurutkan **numerik menurun** di `loadPublicBase` — satu
tempat yang dipakai `/loker` DAN panel admin, karena keduanya membaca
`pub.jobs`. Sesudah: job baru di posisi **0**. Nomor kode dipakai sebagai
penanda usia karena `nextJobCode` selalu nomor terbesar + 1.

**Tab admin punya bug terpisah.** `sortDbJobs` (default TERBARU) mengurutkan
berdasarkan `createdAt`, tetapi kolom `created_at` tidak ada ⇒ `createdAt`
SELALU kosong ⇒ yang selalu jalan adalah tie-break `localeCompare` = **urutan
string**. Akibatnya `TG9ASJ` tampil di ATAS `TG158ASJ`. Tie-break kini
numerik, dengan tes yang dibuktikan bisa merah.

⚠ **Batas yang belum tertutup:** TG dan GJ punya urutan nomor **TERPISAH**,
jadi GJ pertama (GJ1) masih berada di bawah TG158 (terukur: posisi 159).
"Selalu paling atas" untuk KEDUA prefix hanya bisa dijamin dengan kolom
`created_at` di `job_database` (DDL). Saya tidak bisa menjalankan DDL lewat
PostgREST, dan `.env` tidak memuat `SUPABASE_DB_URL`.

## Pertanyaan 3 — "tes semua detailnya sampai jadi"

Form buat job ada di tab **`#tambah`** — tab yang belum pernah telusuri gate
mana pun (daftar tab yang disapu `test-aria-names` tidak memuatnya).

| yang diperiksa | hasil |
|---|---|
| field | **27** kontrol, hampir semuanya ber-`<label for>` yang benar |
| nama aksesibel | AX tree: **44 bernama, 0 tanpa nama** |
| validasi | **6 field `required`** HTML5 (tsk, tahapan, kuota, kategori, pekerjaan, gender) |
| opsi kategori | memuat **"🎓 MAGANG"** ✓ — jalur GJ memang disediakan |
| submit | `type="submit"` di dalam `<form onSubmit={handleSubmit}>` |
| payload terkirim | lengkap 16 field ke `simpanJobBaru` (endpoint `jobs`) |
| kode job | **TIDAK dikirim form** ✓ — server yang menetapkan lewat `nextJobCode` |
| console error | bersih |

Satu jebakan yang sempat menyesatkan saya: **klik pertama tidak mengirim
apa-apa**, dan itu bukan bug — 6 field `required` belum terisi, jadi validasi
HTML5 bawaan browser memblokir submit tanpa toast dan tanpa error konsol. Pada
percobaan pertama fixture saya bahkan tidak menyediakan opsi `tahapan`,
sehingga field wajib itu mustahil diisi.

## Verifikasi

`tsc` 0 · `lint-ratchet` PASSED · vitest **184 berkas · 2252 tes** (3 merah =
artefak spawn sandbox) · tes baru dibuktikan bisa merah lewat mutasi ·
`job_database` kembali 158 baris tanpa job uji.
