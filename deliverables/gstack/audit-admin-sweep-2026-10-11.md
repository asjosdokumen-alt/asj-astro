# Sweep admin: tiap tab, tiap modal (2026-10-11)

Audit menyeluruh atas **seluruh permukaan admin** (10 tab + 9 modal admin + semua
permukaan kandidat), dicari lewat 5 kelas cacat:

| kelas | arti |
|---|---|
| **A** | Mutasi sukses tapi tampilan TIDAK ikut berubah (data basi) |
| **B** | Kontrol yang tidak melakukan apa pun / kondisi yang tidak mungkin benar |
| **C** | Daftar terpotong — baris ke-N tidak bisa dijangkau |
| **D** | Error ditelan → kegagalan tampil sebagai "kosong / belum ada" yang terlihat normal |
| **E** | Identifier salah (`id` dikirim padahal backend membacanya sebagai posisi baris, atau sebaliknya) |

## Diperbaiki

### 1. Tombol "More" daftar kandidat tidak pernah muncul & tidak memuat — `9a95ad8`
Kelas B + C. `shown = filtered.slice(0, (page+1) × 20)`, dan syaratnya
`shown.length < filtered.length` — dua nilai itu **selalu sama** karena satu
halaman diambil per klik. Tombolnya tidak pernah dirender ⇒ **kandidat ke-21 dan
seterusnya tidak bisa dijangkau**. Kliknya pun hanya menaikkan counter tanpa
mengambil halaman berikutnya. Pembandingnya kini total di server + atom
`kandidatExhausted`.

### 2. Penyegaran setelah mutasi menggandakan baris — `9a95ad8`
Kelas A. `fetchKandidatFromAPI()` **menambah** saat halaman aktif ≠ 0, jadi
menyunting kandidat di halaman 2 menambahkan halaman itu untuk kedua kalinya —
terukur **40 baris jadi 60**, dan halaman 3 tidak pernah ikut. Kini
`reloadKandidatList()`: halaman 1 mengganti, sisanya berurutan.

### 3. Tab Jadwal: tombol "Edit" membuat SALINAN — commit ini
Kelas A (dan perusakan data). `handleSubmit` selalu memanggil `simpanJadwalBaru`
tanpa id, dan backend **selalu INSERT** dengan id baru
(`'JDW' + Date.now()`). Menekan Edit membuat jadwal duplikat; jadwal aslinya
tidak pernah berubah, tanpa pesan apa pun.

Perbaikan: `handleSimpanJadwalBaru` memperbarui bila `id` dikirim (lewat
`updateScheduleById` yang baru), dan klien menyimpan `editingId`.

### 4. Tab DB Job: job ke-11+ tidak bisa dijangkau — commit ini
Kelas C. `const [limit, _setLimit] = useState(10)` — **`_setLimit` tidak pernah
dipakai**, jadi `filtered.slice(0, limit)` membeku di 10, sementara teks di
bawahnya mencetak jumlah **total** sehingga daftarnya terlihat lengkap.

### 5. Jenis dokumen yang tidak punya kolom → berkas dibuang DIAM-DIAM — commit ini
Kelas D. `InputManualModal` menawarkan 24 jenis dokumen; **7 di antaranya tidak
ada di `FILE_LABEL_COLUMNS`**, termasuk `PAS PHOTO` — pilihan **pertama/default**;
tabel backend memakai `PAS_PHOTO` (garis bawah). Handler melewati seluruh
penulisan lalu tetap `return { success: true }`: admin melihat "berhasil",
berkasnya tidak tercatat di mana pun.

Perbaikan tiga lapis:
- `fileLabelKey` mencoba bentuk asli dulu, lalu menormalkan spasi/garis bawah
  (urutan itu penting — `KARTU KELUARGA` memang memuat spasi).
- Alias baru: `KONTRAK KERJA`, `SERTIFIKAT JAPAN`, `PERNYATAAN CPMI`.
- Handler **mengembalikan error** untuk label tak dikenal, bukan sukses palsu.
- `SIM`, `EKTLN`, `LAINNYA` **dihapus** dari form: tidak ada kolomnya di
  `pemberkasan_checklist` maupun tabel kandidat, jadi menawarkannya hanya
  menjanjikan sesuatu yang tidak bisa disimpan.

### 6. Input "Cari kandidat" mati — commit ini
Kelas B. `#im-cari` tidak punya `value`, `onInput`, maupun handler. Dihapus.
Fitur legacy (cari lewat WA lalu isi form otomatis) **belum dibangun** — itu
butuh sumber data + daftar hasil, bukan sekadar kotak input.

## Belum diperbaiki (perlu keputusan Anda)

| berkas | kelas | temuan | catatan |
|---|---|---|---|
| `PemberkasanModal.tsx:87-106` | D | 7 field biodata bisa diisi admin tapi **dibuang backend** (`BIO_LENGKAP_MASTER_COLS` hanya 11 entri): `ttl_ayah, nama_ibu, ttl_ibu, nama_shacou, telp_perusahaan, web_perusahaan, alamat_perusahaan` | **butuh keputusan**: sembunyikan field-nya, atau tambah kolomnya di DB |
| `AdminShareModal.tsx:138-157` | A | `updateDokumenShare` sukses → hanya `onClose()`; induk tidak refetch → buka ulang menampilkan chip LAMA | perlu prop `onSave` |
| `AdminAiCopilot.tsx:212-219` | B | `handleParse` menyetel `parsing`, tapi semua tombol digerbangi `busy` → dua panggilan AI bisa jalan bersamaan (kuota ganda) | penjaga in-flight |
| TabKelola / TabDbJob / TabWA / TabJadwal / TabConfig | D | `catch` hanya `console.error` → daftar jadi kosong → tampil sebagai "belum ada" | **pola menyeluruh**, bukan satu tempat |
| `CandidateDash.tsx:364` | D | `loadDashboard` gagal → UI menampilkan "Data tidak ditemukan" | sama polanya |
| `MatchmakingModal.tsx:202` | C | `filtered.slice(0, 30)` tanpa "muat lagi"; teksnya melaporkan 30 walau cocok lebih banyak | parity legacy |
| `EditCandidateModal.tsx:180-198` | A | `simpanBerkasTahapan` sukses → toast saja, tanpa `candidates-changed` | |
| `CvTemplateSelector.tsx:71,100` | D | cek `d.error`, bukan `d.success` → badan gagal tanpa `error` lolos ke pengisian | |
| `CvTemplateSelector.tsx:28` | B? | daftar template dari `cvFactory.list()` (lokal), bukan `getTemplateCvList` → template tersimpan admin tidak pernah muncul di sini | fitur, bukan cacat kondisi |
| `ApplyFullForm` / `MasterFullForm` / `WAPintarModal` | B | state mati (`_extraDocs`, `_loading`, `_sending`) | kosmetik kode |
| `TabPelamar.tsx:295` | C-lite | gerbang "More" membandingkan daftar terfilter-klien dengan total server → bisa tampil walau tidak ada lagi yang cocok | baris tetap terjangkau |

## Bersih (tanpa temuan)

**Tab:** TabMail (memuat ulang tiap aksi, `rowIndex` benar) · TabAgenda
(read-only, ada state `failed` terpisah) · TabTugas (store, tanpa mutasi) ·
TabTambah (reset form).

**Modal:** `EditCandidateModal` (jalur simpan → `candidates-changed` + `onClose`)
· `CandidateProfileModal` · `AdminJobEditModal` (`onSave → fetchLoker()`, kunci
`syarat` cocok) · `ListKandidatModal` (`fetchAllKandidat({force:true})`).

**Sisi kandidat:** `AsjDossierCard`, `CandidateSkeleton`, `LevelCard`,
`StepGuide`, `FormToolbar` (presentasional) · `InterviewSimulatorModal` ·
`CvMiniModal` · `AiCvForm` · `MasterFullForm` · `SiswaBaruForm` · `ShareView` ·
`ApplyFullForm` · `WAPintarModal` · `RirekishoBuilder`.

Kelas **E tidak ditemukan** lagi: satu-satunya pengiriman posisional
(`MasterFullForm` 5-slot, `AiCvForm` `riwayatLengkap`) memang dibaca server
sebagai array.

## Tes

| berkas | isi |
|---|---|
| `e2e/tab-pelamar-paging.test.tsx` | 2 — tombol More muncul & benar-benar memuat |
| `e2e/admin-store-reload.test.ts` | 3 — penyegaran tidak menggandakan baris |
| `e2e/doc-label-contract.test.ts` | 6 — tiap jenis dokumen di form punya kolom |
| `e2e/tab-jadwal-edit.test.tsx` | 3 — Edit mengirim `id`, tambah tidak |

Semuanya dibuktikan bisa **MERAH** saat perbaikannya dikembalikan.
