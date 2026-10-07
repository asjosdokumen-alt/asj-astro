# Perbaikan suite merah — 2026-10-02 (mesin kantor)

**Permintaan:** "tolong fix".
**Hasil:** `4 failed | 177 passed (181)` → **`3 failed | 178 passed (181)`**.
7 tes merah → **3**; berkas merah 4 → 3; tes lulus 2135 → **2139**. Tidak ada regresi.

Dari 7 merah itu, **4 adalah cacat nyata** (diperbaiki) dan **3 adalah artefak lingkungan**
(dibuktikan, bukan diasumsikan — lihat §5).

---

## 1. Cacat nyata: 3 referensi `global-unknown` di berkas PRODUKSI

`build.test.ts §prodGenuine` menegakkan **nol** referensi tak dikenal di luar berkas tes.
Ia melaporkan tiga, semuanya di satu berkas:

```
src/lib/cv-template-factory/renderers/rirekisho-xlsx.ts:276 createImageBitmap
src/lib/cv-template-factory/renderers/rirekisho-xlsx.ts:320 createImageBitmap
src/lib/cv-template-factory/renderers/rirekisho-xlsx.ts:320 BlobPart
```

Dua hal yang berbeda, dan keduanya diperbaiki dengan cara yang berbeda.

### `BlobPart` — akarnya adalah deklarasi tipe yang terlalu lebar, bukan cast yang kurang

Baris itu berbunyi `new Blob([probe as unknown as BlobPart], …)`. Cast `as unknown as`
tampak seperti kelebihan. **Ternyata load-bearing**: tanpa itu `tsc` menolak, karena
`Uint8Array<ArrayBufferLike>` tidak assignable ke `BlobPart` (`ArrayBufferView<ArrayBuffer>`
— `SharedArrayBuffer` tidak punya `resizable`/`detached`/`transfer`).

Tapi `as unknown` adalah **kebohongan tipe**: ia mematikan pemeriksaan, bukan menyelesaikannya.
Akar sebenarnya: `photoToPngBytes()` dideklarasikan `Promise<Uint8Array | null>`, padahal
isinya selalu `new Uint8Array(await blob.arrayBuffer())` — yaitu `Uint8Array<ArrayBuffer>`.
Deklarasi yang lebar itulah yang memaksa cast.

**Perbaikan:** persempit tipe deklarasinya. Cast dan referensi `BlobPart` hilang bersamaan,
dan `tsc` **0 error** tanpa cast.

### `createImageBitmap` — tabel global yang kurang, sama seperti `CSS` dulu

Ini global platform sah (`lib.dom.d.ts`), bukan cacat kode. Persis kelas yang sama dengan
entri `CSS` yang ditambahkan 2026-09-17 setelah tripwire yang sama menangkapnya.

**Perbaikan:** tambahkan ke `LIB_GLOBALS` (`indexer/src/bind.ts`), dengan komentar bertanggal.

Sebelum menambah, satu jebakan diperiksa lebih dulu: entri `LIB_GLOBALS` hanya mengubah
klasifikasi Tier-1 menjadi `lib-not-loaded`, dan assertion **pertama** (`prodLib`) menuntut
bucket itu **kosong** di berkas produksi. Yang menaikkannya adalah **compiler** — deep-tier
menaikkan baris yang identifier-nya diikat ke deklarasi lib bernama sama
(`lib.dom.d.ts: declare function createImageBitmap`). Jadi entri ini **aman**; entri untuk
global yang tidak ada di `lib.*.d.ts` hanya akan memindahkan kegagalan ke `prodLib`.
Dibuktikan dengan menjalankan suite: **11 lulus / 2 gagal**, dan dua yang gagal murni counter.

---

## 2. Counter beku: +6 `ts` / +6 `fileCount` — diatribusi, bukan tambal angka

Counter di `discover.test.ts` / `build.test.ts` sengaja dipin keras; merah berarti ada berkas
ditambahkan tanpa memindahkan angkanya. 18 commit yang belum di-push menambahkan **11 berkas
`.ts`**, tetapi hanya **6** yang masuk inventaris: `includePath()` (`indexer/src/util.ts:92`)
hanya menerima `mjs/cjs/js` di bawah `e2e/`, jadi lima tes di `e2e/` **tidak menggerakkan apa pun**.

Enam yang dihitung:

| # | Berkas | Bucket |
|---|---|---|
| 1–3 | `netlify/functions/_lib/ai/{classify.limits,cv.lookup,providers.hedge}.test.ts` | `ts` |
| 4 | `src/lib/cv-template-factory/renderers/rirekisho-xlsx.ts` | `ts` |
| 5 | `src/lib/cv-template-factory/renderers/rirekisho-xlsx.test.ts` | `ts` |
| 6 | `src/lib/cv-template-factory/templates/rirekisho-xlsx.b64.ts` | `ts` |

**Tiga sumber sepakat persis** — tidak ada yang diturunkan dari penalaran:

```
count-indexed.test.ts (alat resmi) : 293 ts + 112 tsx + 20 astro + 84 mjs + 6 cjs + 20 js = 535
git ls-files + aturan includePath   : 293 ts + 112 tsx + 20 astro + 84 mjs + 6 cjs + 20 js = 535
assertion yang ditulis              : 293 ts + 112 tsx + 20 astro + 84 mjs + 6 cjs + 20 js = 535
```

`tsx`/`astro`/`mjs`/`cjs`/`js` tidak bergerak, dan enam hitungan tetap menjumlah ke
`files.length` — invarian di `discover.test.ts` tetap berlaku.

Assertion yang diperbarui: `count('ts')` 287→**293**, `files.length` 529→**535**
(`discover.test.ts`), `fileCount` 529→**535** (`build.test.ts`).

---

## 3. Envelope Phase-4: 23900 → 24500

Terukur **23923**, mengikuti konvensi terdokumentasi "measured + ~500, dibulatkan ke ratusan
berikutnya" (23923 + 500 = 24423 → **24500**).

Catatan jujur yang ditulis ke dalam tes: **payload bukan penyebabnya.**
`templates/rirekisho-xlsx.b64.ts` adalah **satu** `export const` berisi seluruh workbook
sebagai base64 — 538 baris, satu simbol. Pertumbuhannya dari renderer + suite-nya.

---

## 4. Dua diagnostik yang berbohong (diperbaiki; keduanya tetap merah)

Keduanya melaporkan verdict yang **tidak pernah diproduksi** — kelas yang sama dengan stub
senyap `db/candidates.ts` yang ditutup `e6baf19`. Prinsipnya: jadikan berisik.

| Tes | Perilaku lama | Perilaku sekarang |
|---|---|---|
| `boundary.test.ts` | `status === null` dicap **"oracle disagrees"** | memisahkan "COULD NOT RUN (signal/error)" dari "disagrees" |
| `fcm-server.test.ts` | `catch { return false }` → kegagalan spawn terbaca "tidak di-ignore" | exit 1 = jawaban sah; selain itu **dilempar** dengan pesan actionable |

Dibuktikan: setelah perbaikan, string lama `"oracle disagrees"` muncul **0 kali** di keluaran
suite, dan kedua pesan baru muncul dengan `error=… EBUSY`.

Assertion-nya **tetap gagal** — oracle yang tidak bisa dijalankan bukan berarti lulus — tetapi
sekarang ia mengatakan **yang mana** dari dua hal itu yang terjadi. Pesan palsu itu sudah
menelan waktu dua sesi.

---

## 5. Akar tunggal 3 merah yang tersisa: lingkungan ini tidak bisa membuat proses anak

Diukur langsung, bukan disimpulkan dari pesan gagal:

```
spawnSync(process.execPath, [oracle depcruise, …])  →  status=null  error=spawnSync … EBUSY
execFileSync('git', ['check-ignore', …])            →  status=null  error=spawnSync git EBUSY
```

Termasuk setelah `NODE_OPTIONS` dikosongkan (harness menyuntik
`--require …node-language-shim.cjs`, tetapi **bukan** itu penyebabnya). Perintah yang sama
dijalankan sebagai Bash biasa **berhasil**:

- oracle depcruise → `no dependency violations found (223 modules, 686 dependencies)`, **exit 0**, 19.3 s;
- `git check-ignore` → `.gitignore:136:netlify/functions/secrets/*`, exit 0 (contoh & README exit 1);
- perbandingan inventaris dihitung tangan → **535**, sama dengan alat resmi.

⇒ Ketiga merah itu **hijau di CI**. Tidak ada perubahan kode yang bisa membuatnya hijau di sini
tanpa **melemahkan gate** (mis. melewatinya saat spawn gagal). Itu keputusan pemilik, bukan
keputusan yang boleh diambil sendiri.

---

## 6. Verifikasi

| Gerbang | Hasil |
|---|---|
| `tsc --noEmit` (main) | **0 error** |
| `tsc -p tsconfig.indexer.json --noEmit` | **0 error** |
| `lint-ratchet --base=HEAD` | **PASSED** — debt −21, **0 diagnostik baru** |
| `review:gate --base=HEAD` | **7/7 PASS** (termasuk `memory:check`) |
| Suite penuh (sandbox dilewati) | **3 failed \| 178 passed (181)** · `3 failed \| 2139 passed (2142)` |
| Diagnostik baru | terbukti muncul; klaim lama `"oracle disagrees"` **0 kemunculan** |

`indexer/validate-report.json` (artefak ter-track) ditulis ulang oleh suite saat pengukuran ⇒
**direstore**; pohon hanya berisi enam berkas yang sengaja diubah.

## 7. Yang sengaja TIDAK diubah

- **Kebijakan merah lingkungan.** Ketiga tes itu tetap merah di sini. Melewatinya saat spawn
  gagal akan membuat suite hijau — dan sekaligus menghapus gate di lingkungan yang tidak bisa
  menjalankan oracle. **Keputusan pemilik.**
- **Berkas yang belum di-commit.** 18 commit masih belum di-push; perubahan sesi ini juga belum
  di-commit (R19: push butuh izin eksplisit).
