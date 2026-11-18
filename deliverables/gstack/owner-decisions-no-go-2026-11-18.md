# Sisa NO-GO — keputusan yang tidak bisa saya ambil sendiri

**Tanggal:** 2026-11-18 · **Status:** 4 blocker kode sudah ditutup malam ini; item di bawah
membutuhkan keputusan owner, akses konsol, atau perubahan produksi yang tidak bisa
dilakukan dari repo. Tidak ada nilai rahasia yang dicatat di berkas ini.

---

## C-3 — bucket dokumen publik (Critical, masih terbuka)

**Fakta:** `_lib/storage.ts:36-38` membangun URL `/storage/v1/object/public/<bucket>/<path>`.
KTP/KK/passport kandidat dapat diambil tanpa sesi bila path-nya diketahui.

**Kenapa belum saya ubah:** mengganti `publicUrl()` menjadi signed URL mengubah kontrak
semua URL yang sudah tersimpan di `database_candidate`, `master_database_candidate`, dan
`pemberkasan_checklist`. Membuka bucket tanpa migrasi membuat semua dokumen lama 404;
membuat signed URL tanpa mematikan bucket tidak mengurangi eksposur sama sekali.

**Urutan yang aman (perlu owner):**
1. Di Supabase Storage, **jangan** langsung ganti bucket. Siapkan bucket privat baru
   (mis. `asj-files-private`) dan service key yang sama.
2. Tambahkan `signedUrl(path, expiresIn)` di `_lib/storage.ts` memakai
   `POST /storage/v1/object/sign/<bucket>/<path>`; simpan **path objek**, bukan URL
   permanen, di kolom DB.
3. Backfill: baca URL lama, ekstrak path, tulis path ke kolom baru; jalankan parser
   dokumen + share view dengan signed URL.
4. Uji satu `GET` tanpa auth ke objek lama → harus **404/401**. Baru matikan bucket lama.
5. Putuskan TTL (disarankan 1 jam untuk unduhan admin, 15 menit untuk share view).

**Verifikasi minimal:** `curl -I` tanpa header ke URL publik lama harus gagal, dan halaman
Mail + share view masih bisa menampilkan dokumen.

---

## C-2 — PII masih di history GitHub (Critical, masih terbuka)

3 berkas sudah dihapus dari HEAD (`dbbe6dfc`), tetapi repo bersifat **publik** dan git
history/fork tetap menyimpan isinya.

**Keputusan owner yang dibutuhkan:**
- `git filter-repo --path deliverables/biodata-ASJ00040.docx --path ... --invert-paths`
  lalu **force-push** — ini operasi destruktif dan mengubah semua hash, jadi saya tidak
  menjalankannya tanpa izin eksplisit.
- Daftarkan siapa saja yang pernah clone/fork; fork tidak ikut tersapu force-push.
- Nilai kewajiban notifikasi sesuai kebijakan privasi perusahaan (data nyata kandidat).
- Tidak ada kunci/secret yang ikut terekspos, jadi **tidak ada rotasi kunci** yang perlu
  dilakukan untuk temuan ini.

---

## H-2 — PIN admin 4 digit (High, masih terbuka)

`masterPins()` di `contexts/identity/service.ts:157-169` menggabungkan
`PIN_KHOCI`/`PIN_SACHOU`/`PIN_AYOK`/`PIN_KHOLIS` ke dalam kumpulan PIN master.
Perbaikan durasi/kompleksitas bukan sekadar kode: nilai yang dipakai produksi ada di
dashboard Netlify dan tidak bisa dibaca dari repo.

**Yang perlu owner lakukan:**
1. Rotasi keempat nilai PIN di Netlify → minimal 12 karakter acak, satu PIN per admin.
2. Hapus PIN personal dari `masterPins()` sehingga hanya `ADMIN_MASTER_PIN`/`MASTER_PIN`
   yang memberi akses `master`; named admin tetap masuk lewat `PIN_<NAMA>`.
3. Deploy ulang, lalu uji login master + satu named admin.

Saya tidak menambahkan validasi panjang di kode karena itu akan **mengunci admin keluar**
sebelum rotasi env selesai. Urutannya harus: rotasi dulu, baru kode.

---

## H-6 — prefill PII per nomor WA (High, dimiter tapi belum hilang)

`getExistingCandidateJsonByWa` tetap publik karena form `/apply` dan `/master`
membutuhkannya sebelum sesi ada. Sudah ada `allowlist` kolom + bucket `prefill:*`
20/menit, tetapi nomor yang diketahui tetap bisa dipakai untuk mengambil nama/TL/pendidikan.

**Pilihan owner:**
- terima risiko dengan rate limit + logging (status sekarang), atau
- ganti kontrak: klien mengirim kode undangan sekali pakai, bukan nomor WA; ini mengubah
  UX form dan perlu keputusan produk.

---

## M-8 — dependency advisories (Medium, masih terbuka)

`zod` terkunci 3.25.76; `xlsx` berasal dari tarball CDN `cdn.sheetjs.com`, bukan registry.
`npm audit --offline` tidak punya data advisories di mesin ini, jadi angka lama (44) belum
diukur ulang dengan jaringan.

**Aman dilakukan owner:** jalankan `npm audit` dengan jaringan, lalu `npm install zod@^4`
hanya jika seluruh suite + build hijau — Zod 4 mengubah beberapa API. `xlsx` sebaiknya
dipindahkan ke registry versi pin jika penyedia mengizinkan, atau dicatat sebagai
pengecualian tertulis. Saya tidak menaikkan versi karena itu dapat memecah build saat
deploy tanpa kesempatan verifikasi di sesi ini.

---

## Yang sudah berubah malam ini (tidak butuh keputusan owner)

| Temuan | Commit | Catatan |
|---|---|---|
| H-3 revokasi | `97ffa1cc` | Gate di dispatch: refresh ditolak, epoch fail-closed, cache 15 dtk + invalidasi saat logout. 11 tes baru |
| M-3 bulk delete | `df7e4fbd` | Satu `DELETE id=in.(...)`; gagal ⇒ semua dilaporkan gagal. 2 tes baru |
| M-6 CORS | `a7416d59` | `share-data` tidak lagi `*`; origin situs sendiri + `Vary: Origin` |
| M-7 CSP | `a7416d59` | `Content-Security-Policy-Report-Only` aktif; **belum enforcement** sampai violation diamati |

**Caveat H-3:** cache 15 detik bersifat per-instance. Pencabutan langsung invalidasi di
instance yang menulisnya; instance Netlify lain baru melihatnya setelah maksimal 15 detik.
Ini trade-off biaya Neon, bukan jaminan pencabutan instan lintas instance.

---

## Ringkasan untuk keputusan

- Bisa di-push kapan saja: seluruh commit perbaikan kode (lokal, belum di-push).
- Harus diputuskan owner sebelum status GO: C-3, C-2 history/fork, H-2 rotasi PIN.
- Bisa diterima sebagai risiko terdokumentasi: H-6, M-7 (mode observasi), M-8.
