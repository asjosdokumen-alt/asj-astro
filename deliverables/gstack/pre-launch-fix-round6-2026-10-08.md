# Pre-launch fix — Ronde 6 (2026-10-08)

Dua permintaan pemilik, keduanya di area **AI CV**:

1. *"kok gagal menyimpan"* — menekan Simpan di tab manual selalu berakhir
   `Network error: Gagal menyimpan data, silakan coba lagi.`
2. *"cv ai tab manualnya banyak yg redundant … cukup 1 tapi database boleh tetap
   isi 2 untuk build rekishou"*

Keduanya selesai, ter-commit, dan terverifikasi.

---

## 1. Simpan gagal — penyebabnya satu kolom yang tidak ada

### Yang terukur

`handleSubmitDataAsj` (`netlify/functions/_lib/ai/cv.ts`) menulis kunci
**`submitted_by`** ke tabel **`ai_form_submissions`**. Tabel itu tidak punya kolom
tersebut — `netlify/functions/_lib/db/schema.generated.ts` (digenerate dari
PostgREST yang hidup oleh `scripts/ci/gen-schema.mjs`) tidak pernah menyebutnya,
dan begitu pula tabel yang sama di proyek Supabase yang dikonfigurasi lokal.

PostgREST tidak mengabaikan kolom asing; ia menolak **seluruh barisnya**. Diukur
langsung (PATCH dengan filter yang tidak mencocokkan baris mana pun, jadi tidak
ada data yang tersentuh):

| body yang dikirim | hasil |
|---|---|
| `{nama_lengkap, submitted_by}` | **HTTP 400** `{"code":"PGRST204","message":"Could not find the 'submitted_by' column of 'ai_form_submissions' in the schema cache"}` |
| `{nama_lengkap}` | **HTTP 204** |

`{success:false, message}` dari `catch` terluar dipetakan `outcomeStatusCode()`
menjadi HTTP 400, klien melempar, dan `apiClient` menambah prefiks
`Network error: `. Itulah **dua toast yang sama** di tangkapan layar pemilik:
satu dari `apiClient`, satu lagi dari `catch` di `saveToDatabase`.

### Kenapa berhari-hari tak terlihat

`catch` terluar handler itu mengubah **semua** kegagalan menjadi satu kalimat
generik, jadi tidak ada satu pun petunjuk yang sampai ke pemilik, admin, maupun
log. Tidak ada gate di repo ini yang membandingkan body **tulis** dengan kontrak
skema: `verify-projections.mjs` hanya menjaga `select`, dan `resolveSelect()`
sudah menjaga sisi **baca** sejak Phase D. Sisi tulis tidak dijaga siapa pun.

### Perbaikan

1. **`cv.ts`** — kunci hantu dibuang. Atribusi "siapa yang menekan Simpan"
   dipindah ke log (`ai.cv.submit`, WA di-hash) karena kolomnya memang tidak ada.
   `catch` terluar sekarang mencatat sebab aslinya (`ai.cv.submit-failed`).
2. **`db/client.ts`** — `writeBodyFor()`, penjaga sisi **tulis**, kembaran
   `resolveSelect()`. Kolom di luar kontrak dibuang (bukan membatalkan seluruh
   baris) dan namanya **dilog** sebagai `postgrest.write-dropped-unknown-columns`,
   supaya drift skema tidak pernah hilang tanpa suara lagi.

### Bonus: kolom hantu KEDUA ikut ketahuan

Tes kontrak yang baru menemukannya sendiri, bukan review manual:

```
PATCH database_candidate.ktp_url
```

`database_candidate` tidak punya `ktp_url` (hanya `folder_url`). Karena satu body
ditolak utuh, seluruh blok sinkronisasi itu **tidak pernah berhasil**: `nama_lengkap`,
`gender`, `usia`, `tempat_lahir`, `tgl_lahir`, `no_wa`, `pas_photo`, `jft`, `ssw`
dari simpan CV AI tidak pernah sampai ke panel admin. Baris itu dibuang — dan KTP
tidak hilang, karena sudah tersimpan di `master_database_candidate.ktp_url` dan
`pemberkasan_checklist.ktp_url`, dua kolom yang memang ada.

---

## 2. Tab manual dirampingkan — satu kotak per jawaban

Lima kotak dihapus. Semuanya yang setengah-JP-nya **sudah tercetak di label
dropdown-nya**, jadi kotak kedua itu menanyakan satu hal dua kali:

| id yang dihapus | dropdown yang sudah bilingual |
|---|---|
| `ai_gender_jp` | `LAKI-LAKI（男性）` |
| `ai_agama_jp` | `ISLAM（イスラム教）` |
| `ai_status_jp` | `MENIKAH（既婚）` |
| `ai_kenalan_hub_jp` | `AYAH（父）` ← contoh persis dari pemilik |
| `ai_kenalan_kerja_jp` | `OPERATOR PRODUKSI（工場作業員）` |

### Sisi "database tetap isi 2" butuh perbaikan dulu

`kenalan_hub_id` dan `kenalan_kerja_id` **tidak terdaftar** di `PAIRED_FIELDS`
(`src/lib/aiCvPairs.ts`), jadi `resolvePairEdit` tidak punya partner untuk diisi —
kolom `hubungan_jp` / `pekerjaan_jp` selama ini memang hanya bisa diisi dari kotak
manual yang mau dihapus itu. (Komentar lama di formulir mengklaim sebaliknya;
klaim itu baru benar sekarang.)

Keduanya didaftarkan memakai daftar yang sudah ada di `opsi-form.ts`
(`HUBUNGAN_KELUARGA`, `PEKERJAAN`), jadi kanjinya terisi **dari daftar**, bukan
diketik ulang. Payload `submitDataAsj` tidak berubah sama sekali — `hubungan_id`
+ `hubungan_jp` tetap dua-duanya terkirim.

### Yang SENGAJA tidak dihapus

- `katakana` / `panggilan_katakana` — transliterasi nama, bukan terjemahan.
- `nama_jp` sekolah & perusahaan, `alamat_jp`, alergi/riwayat medis JP — tanpa
  dropdown, jadi tidak ada sumber kanji selain manusia.
- `jabatan_jp` di riwayat pekerjaan — ComboSelect-nya menerima **teks bebas**;
  untuk pekerjaan yang tidak ada di daftar 100 entri, kanjinya tidak bisa
  diturunkan dari registry.

---

## 3. Verifikasi

| Gate | Hasil |
|---|---|
| `vitest run` (penuh) | **183 berkas · 2232 tes**; 3 merah = artefak spawn sandbox yang sudah terdokumentasi (`EBUSY` di `boundary` / `discover` / `fcm-server`) |
| `tsc --noEmit -p tsconfig.json` | exit 0 |
| `lint-ratchet` | PASSED (utang turun 180; `cv.ts` 50 → 36) |
| `npm run build` | exit 0, `sw-manifest` versi `asj-astro-ecb06e60ccd7` |
| Jumlah berkas `indexer` | 183 berkas (tidak berubah — tidak ada berkas baru) |

**Tes baru, dan buktinya bisa merah:**

- `e2e/ai-cv-submit.test.ts` — membandingkan **setiap body tulis** dengan kontrak
  skema. Dibuktikan bisa gagal: `submitted_by` dikembalikan sebentar, tesnya merah
  dengan nama persisnya (`POST ai_form_submissions.submitted_by`), lalu
  dikembalikan dan diverifikasi dengan hash.
- `netlify/functions/_lib/db/client.test.ts` — 6 tes `writeBodyFor` (buang kolom
  asing, jangan sentuh kolom sah, array/insert massal, non-objek, tabel di luar
  kontrak, tidak memutasi objek pemanggil).
- `src/components/forms/AiCvForm.test.tsx` — 3 tes baru: (a) `AYAH` satu kali di
  layar, dua nilai di payload; (b) pekerjaan kenalan mengisi kanji dari daftar;
  (c) lima id kotak itu **NULL** di DOM, dengan kontrol positif bahwa dropdown
  ID-nya masih ada supaya tes tidak lulus secara vacuous. Dua tes lama dipindah
  dari membaca input DOM ke membaca payload — asersi yang lebih kuat, karena yang
  penting adalah apa yang sampai ke database.

## 4. Commit

| Commit | Isi |
|---|---|
| `e3c2eae` | `fix(ai-cv)`: kolom hantu `submitted_by` + penjaga sisi tulis `writeBodyFor()` |
| `2091bd4` | `feat(ai-cv)`: kotak JP kedua dibuang, kanji tetap terisi dari daftar |

⛔ **Belum di-push** (situs auto-deploy dari `main`). Menunggu perintah pemilik.

---

## 5. Dua hal yang perlu keputusan pemilik

1. **Kolom audit "siapa yang menyimpan"** tidak ada di `ai_form_submissions`.
   Sekarang atribusinya masuk ke log. Kalau memang mau tersimpan di database,
   perlu migration menambah kolom `submitted_by` — baru setelah itu kodenya boleh
   menulis ke sana lagi.
2. **`.env` dan `.env.local` di mesin ini menunjuk proyek Supabase
   `bimqyugdhiuxcqltjjnt`**, sementara `docs/ARCHITECTURE.md:243` menyebut proyek
   yang dipakai sekarang adalah `gdwvffmevwtwnzrapjwy` (dan `bimqyugdhiuxcqltjjnt`
   justru didaftarkan sebagai proyek yang **sudah tidak dipakai**, di catatan
   pembaruan 2026-09-26 pada dokumen yang sama). Artinya preview lokal
   (`netlify dev`) berbicara ke database yang berbeda dari produksi. Saya tidak
   mengubahnya — itu file kredensial, dan bisa jadi memang disengaja. Mohon
   dikonfirmasi.
