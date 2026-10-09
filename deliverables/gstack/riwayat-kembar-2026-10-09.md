# Baris riwayat kembar ("sekolah kok dobel dobel") — 2026-10-09

Laporan pemilik: *"kan aneh sekolahnya kok dobel dobel. itu karena apa. kalau
simpan cv bukan hapus lama malah nambah terus gak timpa data lama."*

## Penyebabnya

Kunci dedupe baris riwayat menyambung **`tingkat + sekolah`**. Dua sumber
menulis tingkat dengan ejaan BERBEDA untuk sekolah yang SAMA:

| sumber | tingkat | sekolah |
|---|---|---|
| kolom master (`pendidikan_3_*`) | `SMA/SMK` | `SMK RADEN PATAH` |
| `ai_data_json.pendidikan` | `SMK` | *(kosong; nama ada di `sekolah_id`)* |

Kuncinya jadi `smasmksmkradenpatah` vs `smksmkradenpatah` → tidak pernah sama →
`mergeArrRiwayat` mempertahankan KEDUANYA. Karena form AI CV memuat daftar
GABUNGAN lalu menyimpannya kembali, tiap simpan menambah salinan baru — persis
"nambah terus, gak timpa data lama".

Akibatnya muncul di **tiga permukaan sekaligus**: form AI CV, rirekisho, dan
berkas unduhan biodata.

**Terukur:** AGUS KHOCI (ASJ00040) — 11 baris pendidikan untuk 4 sekolah.
Scan 228 baris master: **5 baris terdampak** (ASJ00040, ASJ00187, ASJ00176,
ASJ00148, ASJ00097), semuanya `ai_updated_at` Agu–Sep 2026 ⇒ akumulasinya sudah
berhenti; yang tertinggal datanya.

## Perbaikan

Kunci riwayat kini **SATU definisi** — `riwayatKeyOf` di `src/lib/helpers_cv.ts`
— dipakai bersama form AI CV, rirekisho, dan template CV. Sebelumnya tiga
salinan terpisah yang "sengaja" dipisah; ketiganya sepakat pada aturan yang
salah, jadi bug-nya muncul di ketiganya.

- Identitas baris = **NAMA** (sekolah / perusahaan / orang), fallback ke
  tingkat/jabatan hanya kalau namanya kosong.
- **Periode** (masuk/lulus, masuk/keluar) ikut masuk kunci, supaya dua masa
  kerja di perusahaan yang sama tetap dua baris — bukan dilebur jadi satu.
- Sisi server memakai aturan yang sama, di `mergeRiwayatArrays` (baca) **dan**
  `mergeAiOverflow.setSlot` (tulis). Kalau keduanya berbeda, menyimpan akan
  menganggap baris lama sebagai baris baru dan menambahkannya lagi.

**Efek terukur pada data AGUS:** 11 → 7 baris. Sisa 2 baris bukan duplikat —
nilainya memang hanya ada di `ai_data_json` (`SMAN 1`, `SDN BALONGSARI II`) dan
tidak ada di kolom master mana pun; membuangnya akan menghapus satu-satunya
catatan nama sekolah itu.

## Label (permintaan yang sama)

- **Kolom Kode Job di tab Mail**: baris tanpa `code_job` adalah baris
  biodata/dokumen, bukan lamaran loker ⇒ labelnya **`BIODATA`**, menggantikan
  sentinel "UMUM" yang sudah dibuang.
- **"CV Mini" → "Profil"** (Indonesia + Jepang): badge silver, level, step,
  tombol, toast, dan tombol simpan. `CvMiniModal.test.tsx` ikut disesuaikan
  karena ia mengunci salinan lama.

## Bukti

- `e2e/riwayat-key.test.ts` — 7 tes; **dibuktikan bisa merah**: aturan lama
  dikembalikan ⇒ 2 gagal (termasuk hitungan 11 → 7).
- `tsc --noEmit` exit 0 · `lint-ratchet` PASSED · vitest frontend+backend
  **173 berkas · 2104 tes**; 1 merah = artefak sandbox `spawnSync git EBUSY`
  di `_lib/fcm-server.test.ts` (tidak terkait).

## Sisa yang perlu keputusan pemilik

Perbaikan kunci TIDAK menyentuh data yang sudah tersimpan. Untuk AGUS masih ada
2 baris sisa yang hanya hidup di `ai_data_json` (`SMAN 1` pada baris tingkat SD,
dan `SDN BALONGSARI II`). Keduanya nilai nyata, bukan duplikat — kalau memang
salah, itu keputusan data (mana nama SD yang benar), bukan sesuatu yang bisa
ditebak oleh dedupe.
