# Bug pipeline Mail: aksi mengirim `id`, backend membaca `rowIndex` (2026-10-09)

Menutup temuan §4 di `db-rapikan-2026-10-09.md`. Arah perbaikannya **A**
(frontend mengirim `rowIndex`, backend tidak berubah) — dan ternyata itu memang
kontrak yang sudah dirancang backend, bukan pilihan bebas:

- `_lib/db/forms.ts:58-59` — "handler review/approve/reject/delete yang menerima
  **rowIndex = posisi di array ini**";
- `findFormByIndexFiltered(idx)` = `GET database_asj_form?order=timestamp.desc&limit=1&offset=<idx>`;
- `mapForm(row, i)` sudah mengirim `rowIndex: i` ke frontend — field itu ADA
  khusus untuk dikirim balik, dan sebelumnya tidak dipakai siapa pun;
- `docs/PHASE_D_DATA_LAYER.md:412-414` — "the index-based admin actions
  (`rowIndex` positions in the mail tab)";
- `contexts/applications/service-bulk-delete.test.ts:6` — "`deleteForm` lama
  menerima **rowIndex**, bukan id".

Jadi bug-nya di frontend: `TabMail` mengirim `m.id ?? m.wa`, padahal backend
membacanya sebagai **offset posisi**.

## Dampak (terukur/terverifikasi dari kode)

| keadaan | apa yang terjadi |
|---|---|
| DB kecil (21 baris) | `id` = 20 → `offset=20` → "Form tidak ditemukan." |
| DB besar | `id` = 144 → `offset=144` → **baris kandidat LAIN yang di-approve** |
| `id` kosong | fallback `m.wa` (mis. `628…`) → `Number.isInteger` gagal → "Index form tidak valid." |
| hapus massal + filter aktif | index dihitung pada daftar `filtered`, backend meng-offset daftar PENUH ⇒ bergeser |

## Perbaikan (`src/components/admin/TabMail.tsx`)

1. Tombol **Lulus / Review / Gagal** mengirim `m.rowIndex` (dulu `m.id ?? m.wa`).
   `rejectTarget` menyimpan `rowIndex`, bukan `id`.
2. **Hapus massal** mengirim `m.rowIndex` tiap baris terpilih (dulu index di
   daftar `filtered`) — jadi benar walau filter status/pencarian aktif, dan
   tidak bergantung pada urutan `filtered`.
3. **Kolom Kode Job** membaca `m.code` (dulu `m.idLoker`). `mapForm` mengirim
   `code` (`row.code_job`); `idLoker` milik **kandidat** (`mapCandidate`) — jadi
   kolom itu SELALU `'-'` sebelum dikoreksi. Filter pencarian ikut dikoreksi.

Backend tidak disentuh. Tidak ada perubahan data.

## Bukti

- Tes regresi di `e2e/tab-mail-labels.test.tsx`: fixture kini memakai bentuk
  payload NYATA (`rowIndex`, `code`) — sebelumnya `idLoker`, itulah sebabnya
  ketidakcocokan ini tak pernah terlihat. Asersi baru: tombol Lulus/Review
  mengirim `[0]` (= rowIndex) dan **bukan** `['m1']` (id); kolom Kode Job
  memuat `TG591ASJ`.
- **Dibuktikan bisa merah**: mengembalikan `m.id ?? m.wa` ⇒
  `expected [ 'm1' ] to deeply equal [ +0 ]` (1 gagal / 5 lulus).
- `tsc --noEmit` 0 · `lint-ratchet` **PASSED** (debt turun 182) ·
  vitest project `frontend` **89 berkas · 1117 tes hijau**.

## Batas yang masih terbuka (bukan bagian perbaikan ini)

- **Urutan tidak deterministik pada `timestamp` kembar.** Baik daftar
  (`findFormsLight`, `order=timestamp.desc&limit=500`) maupun pencarian per-index
  (`findFormByIndexFiltered`, `order=timestamp.desc&limit=1&offset=n`) tidak
  punya tie-break. Kalau dua baris ber-`timestamp` sama, offset bisa menunjuk
  baris yang berbeda dari yang dilihat admin. Obatnya: tie-break stabil
  (mis. `timestamp.desc,id.desc`) di **kedua** tempat — dicatat sebagai item
  terbuka di `docs/PHASE_D_DATA_LAYER.md:430`, belum dikerjakan.
- **B tetap tersedia** bila kelak diinginkan: backend menerima `id` (bukan
  posisi) — lebih kokoh terhadap perubahan urutan, tapi mengubah
  `handleFormStatus`/`handleDeleteForm`/`handleHapusFormTerpilih` + tesnya.
  Perbaikan ini tidak menutup pintu ke sana.
