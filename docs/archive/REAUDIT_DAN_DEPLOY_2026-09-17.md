# Re-audit & Netlify auto-deploy — 2026-09-17

> Audit ulang situs + penyiapan jalur deploy otomatis. Semua angka di bawah **diukur pada
> pohon ini hari ini**, bukan disalin dari dokumen. Perintah yang dipakai disebut supaya bisa
> diulang.
>
> **Kesimpulan satu baris:** jalur deploy otomatis Netlify **sudah bekerja** — yang mati total
> adalah **GitHub Actions**, dan sebabnya satu baris di `_notify.yml` yang membuat GitHub
> menolak **seluruh berkas**, lalu menyeret semua workflow yang memanggilnya.

---

## 0. Ringkasan

| # | Temuan | Bukti | Status |
|---|---|---|---|
| 1 | **CI belum pernah jalan sama sekali.** 32 run, 32 gagal, **0 job** di setiap run | API GitHub + anotasi GitHub | **Diperbaiki** `42b2a9b` |
| 2 | `_notify.yml` memakai `secrets` di `if:` ⇒ GitHub menolak seluruh berkas | anotasi: `Unrecognized named-value: 'secrets'`, baris 81 & 105 | **Diperbaiki** |
| 3 | Karena `_notify.yml` dipanggil 4 workflow, **deploy staging, deploy produksi, dan rollback ikut mati** | `uses: ./.github/workflows/_notify.yml` × 4 | **Diperbaiki** |
| 4 | Dua cacat nyata **masih hidup di produksi**: nol `<title>`, dan 404 default Netlify | `curl` ke situs live | **Terkunci lokal, belum di-deploy** |
| 5 | `lint-ratchet` **sudah merah sebelum sesi ini** (+2 tak tercatat dari `83b3541`) | `.ci/biome-baseline.json` vs `byFile` | **Dibayar, total 2499** |
| 6 | Tidak ada gate yang bisa melihat cacat workflow | — | **Gate baru** `c201003` |

---

## 1. Akar masalah: CI belum pernah jalan

Anotasi GitHub pada run `35178253921`, apa adanya:

```
Invalid workflow file: .github/workflows/ci.yml#L379
error parsing called workflow ".github/workflows/ci.yml"
  -> "./.github/workflows/_notify.yml" :
(Line: 81, Col: 13): Unrecognized named-value: 'secrets'.
  Located at position 1 within expression: secrets.SLACK_WEBHOOK_URL != '',
(Line: 105, Col: 13): Unrecognized named-value: 'secrets'.
  Located at position 1 within expression: secrets.SLACK_WEBHOOK_URL == ''
```

`secrets` **tidak tersedia di `if:`** — baik `jobs.<id>.if` maupun `jobs.<id>.steps[*].if`.
Ia **tersedia** di `env`, `steps.env`, `steps.with`, dan `steps.run`. Jadi perbaikannya selalu
mungkin: petakan secret ke `env`, lalu uji di shell.

**Kenapa ini menghancurkan segalanya:** workflow yang **dipanggil** dan gagal di-parse membuat
**pemanggilnya** juga gagal di-parse. `_notify.yml` dipanggil oleh `ci.yml`,
`deploy-staging.yml`, `deploy-production.yml`, dan `rollback.yml` ⇒ **keempatnya mati sekaligus**.

**Tanda yang seharusnya terlihat lebih dulu:** GitHub melaporkan `name` = **jalur berkas**
(`.github/workflows/ci.yml`), bukan `CI`. Itu terjadi ketika berkas tidak bisa di-parse.
Terukur: hanya 2 dari 6 berkas punya gejala itu (`ci.yml`, `_notify.yml`) — persis dua yang gagal.

### Mengapa dua sesi sebelumnya salah menebak

| Dugaan | Kenapa salah |
|---|---|
| "terblokir izin push" | `git rev-list --left-right --count` → `0 0`; push sudah terjadi |
| "36/58 berkas `scripts/ci/` tak ter-track" | **Cacat nyata**, tapi bukan sebabnya — tidak satu pun job pernah sampai ke sana |

Keduanya masalah sungguhan. Yang tidak ada di daftar: **berkas workflow-nya sendiri tidak sah**,
sehingga tidak pernah ada job yang bisa gagal.

---

## 2. Perbaikan

`_notify.yml`: dua `if: ${{ secrets.… }}` diganti satu langkah yang memetakan secret ke `env`
dan menguji di shell. Perilaku tidak berubah — ringkasan job selalu ditulis, Slack dikirim bila
webhook ada, dan pesan "dilewati" dicetak bila tidak.

---

## 3. Gate baru — supaya tidak terulang

`scripts/ci/verify-workflows.mjs` (+ baterai mutasi 10 kasus, 0 lolos). Aturan:

| Aturan | Yang diperiksa | Kenapa bukan selera |
|---|---|---|
| W1 | `on:` dan `jobs:` ada | berkas yang tidak sah = 0 job |
| W2 | tidak ada `secrets` di `if:` | persis insiden ini |
| W3 | target `uses: ./…` ada **dan** `workflow_call` | jalur lain ke pemadaman total yang sama |
| W4 | `name:` tidak kosong | jalur berkas sebagai nama = tanda berkas tak terparse |

**Dibuktikan bisa gagal:** dijalankan pada berkas **sebelum** perbaikan, gate melaporkan
**baris 81 dan 105** — sama persis dengan anotasi GitHub, diturunkan sendiri.

Baterainya **tidak memutasi apa pun**: setiap kasus adalah fixture di `mktemp -d` di luar repo,
jadi tidak ada langkah pemulihan dan tidak ada cadangan yang bisa "melunturkan" berkas rusak —
kegagalan yang paling banyak memakan korban di baterai lain.

---

## 4. Hasil re-audit — terukur

Semua dijalankan pada pohon ini, 2026-09-17.

| Gate | Hasil |
|---|---|
| `npm run build` | exit 0 · **10 halaman** · `sw.js` = `asj-astro-100ebb0e13d6` |
| `typecheck:ratchet` | **0 error** |
| `typecheck:indexer` | lolos |
| `lint-ratchet` | **2499 = baseline** (apiClient 10→9, adminStore 8→7) |
| `boundary` | lolos |
| `verify:workflows` (baru) | lolos |
| `verify:entries` / `binding` / `io` | lolos |
| `verify:classes` / `md` / `projections` | lolos |
| `verify:review-manifest` | lolos (C1–C6, C2b) |
| `verify:pwa` / `aliases` / `validation` | lolos |
| `bundle:size` / `idx:gate` | lolos |
| `cold:start` | lolos |
| `npm run test` | **1614 lolos / 3 gagal** — ketiganya `fcm-server.test.ts`, artefak shim hapus sandbox |
| `smoke` (produksi, `HEALTH_TOKEN`) | **PASS 2/2**, health `status: ok` |

**Halaman (dari `dist/`, komentar HTML dibuang lebih dulu):** 10/10 punya `<title>` yang
**berbeda satu sama lain** — `PT Amanah Sakura Japan — Job Portal`, `Panel Admin — ASJ Portal`,
`Halaman tidak ditemukan — ASJ Portal`, dst.

> Jebakan pengukuran: `BaseLayout` memuat **komentar** yang menyebut literal `<title>`. Regex
> naif akan cocok dari komentar itu sampai `</title>` yang asli dan melaporkan "judul = potongan
> prosa". Strip komentar dulu.

---

## 5. 🔴 Produksi masih memuat dua cacat

Remote `newrepo/main` = **`5b7eb6974`**. Lokal **12 commit di depan**. Terukur di situs live:

| Yang diukur | Live | Seharusnya |
|---|---|---|
| `<title>` di `/` | **0** | 1 (WCAG 2.4.2 Level A) |
| URL tidak dikenal | **404 halaman default Netlify**, 3973 byte, tanpa merek ASJ | `dist/404.html` bermerek |
| `sw.js` | `asj-astro-fc4efc29cf79` | — |

Perbaikan judul dan halaman 404 **sudah ada di commit lokal `3a17963`** dan **belum pernah
sampai ke produksi**. Ini konsekuensi langsung dari CI yang mati: tidak ada yang memberi tahu.

---

## 6. Netlify auto-deploy: statusnya

| Bagian | Status terukur |
|---|---|
| Netlify ↔ GitHub (push `main` ⇒ build) | **Bekerja.** Push terakhir → deploy `2f2c99be3` `ready`, dan `5b7eb6974` live |
| `netlify.toml` | Sah: `build = npm run build`, `publish = dist`, 2 fungsi terjadwal, header cache, redirect `/candidate` |
| Smoke pasca-deploy | **Lolos** terhadap produksi (2/2, health `ok`) |
| Probe health tanpa token | **401** ⇒ klasifikasi `WARN` (credential drift), **bukan** rollback |
| CI bergerbang (Actions) | **Sudah bisa di-parse**; **belum pernah dieksekusi** — perlu push untuk membuktikan |
| Rollback otomatis | Dulu **tidak pernah terpasang** karena `rollback.yml` ikut tak terparse |

**Jadi:** "auto-deploy" sudah hidup. Yang belum pernah hidup adalah **lapisan CI yang menjaga
auto-deploy itu** — dan itu sudah diperbaiki di pohon ini, belum di-deploy.

---

## 7. Pekerjaan setengah jalan yang diselesaikan

| Berkas | Isi |
|---|---|
| `src/lib/apiClient.ts` | opsi `force` — lewati cache baca **dan** tulis ulang dengan nilai baru |
| `src/store/adminStore.ts` | `fetchMailFromAPI` lepas dari `fetch` mentah; pakai `force: true, silent: true` |
| `src/lib/uploadBerkas.ts` | lepas dari `fetch` mentah (`silent: true` — fungsi ini mengulang 3×) |
| `src/store/adminStore.fetchMail.test.ts` | **baru** — penjaga transport + kesegaran sesudah tulis |

**Bukti mutasi:** `force: true` → `false` ⇒ tes kesegaran **MATI** (`expected 2 calls, got 1`),
sementara tes kontrolnya (pembacaan biasa **memang** dilayani cache) **tetap hijau**. Itu yang
membuat asersinya diskriminatif, bukan hampa.

Dua tes yang rusak karena konversi juga diperbaiki, dan keduanya memberi pelajaran yang sama
seperti catatan sesi sebelumnya: mock `authReactive` **wajib** punya `isLoggedIn` + `logout`,
kalau tidak `api.secure` menolak **sebelum fetch** dan tesnya gagal di asersi request.

---

## 8. Yang TIDAK diklaim

- **CI hijau belum terbukti.** Semua gate yang bisa dijalankan lokal hijau, tapi hanya push yang
  membuktikan workflow-nya benar-benar dieksekusi. Itu keputusan owner.
- **`verify:batteries` tidak diukur.** Baterai mutasi meninggalkan fixture di sandbox ini
  (kuota hapus 50/turn; terukur `count: 174`), dan fixture yang tertinggal **membuat gate lain
  merah palsu**. Dua di antaranya sudah dibersihkan manual.
- **`fcm-server.test.ts` merah di sini** — murni shim hapus sandbox. Tidak bisa diverifikasi
  ulang dari dalam sandbox.
- **`ListKandidatModal.tsx` 16 → 18** masih dilaporkan ratchet. Itu drift dari `83b3541`
  (dua `console.error` baru). Ratchet hanya **memblokir TOTAL**, jadi ini dilaporkan, bukan
  disembunyikan.
- **`secrets` di jalur `sessionInvalid` tidak diteruskan** oleh klien (diganti pesan kanonik
  `Session expired`). `AiCvForm` + 3 asersi bergantung pada perilaku itu, jadi ini **keputusan
  yang lebih lebar**, bukan tambalan — sudah dicatat di tesnya, belum diubah.

---

## 9. Keputusan owner

1. **Push atau tidak.** 12 commit lokal siap; push `main` = deploy produksi. Tanpa push, dua
   cacat di §5 tetap hidup dan CI tetap belum pernah jalan.
2. **Kredensial di berkas scratch** (`netlify_auth_token=nfp_….txt`): berisi token Netlify, **PAT
   GitHub `ghp_…`**, `HEALTH_TOKEN`, dan kunci Grafana. Gitignored, tidak pernah ke remote — tapi
   sebaiknya dirotasi/dihapus. PAT itu yang dipakai untuk membaca anotasi CI di atas.
3. **Tiga file scratch** di `.workbuddy-ai/tmp/` (probe CI, runner gate) boleh dihapus kapan saja.

---

## 10. Tambahan — cacat ketiga, ditemukan sambil melanjutkan §7

Ditemukan saat mengonversi `CekSiswaModal`, yang **memeriksa `sessionInvalid` sendiri**.

**Gejala:** sesi kedaluwarsa tidak pernah memicu logout. Pengguna tetap "login" memegang token
mati dan hanya melihat pesan error.

**Sebab, terukur:** backend melaporkan sesi mati sebagai
`{ success:false, sessionInvalid:true, message:'Sesi … tidak valid' }`, dan wrapper memetakan
`success === false` → **HTTP 400** (`_lib/netlify-wrapper.ts`). Tetapi `apiClient` membaca
`sessionInvalid` **hanya di jalur 2xx** ⇒ cabang itu **tidak pernah kena** untuk kedaluwarsa
nyata, sehingga `onSessionInvalid` — termasuk default **`'logout'`** — tidak berbuat apa-apa.

**Dibuktikan pada produksi**, dengan token sengaja dibuat palsu:

| Action | HTTP | success | sessionInvalid |
|---|---|---|---|
| `getDrafCvMaster` | **400** | false | true |
| `updateKandidatSuper` | **400** | false | true |
| `getAppData` (publik) | 200 | true | false |

**Perbaikan:** kedua jalur kini lewat satu fungsi `sessionInvalidVerdict()`, supaya tidak bisa
menyimpang. Cabang 2xx tetap ada karena varian `success:true, sessionInvalid:true`
(`catalog/service.ts`) memang datang sebagai 200.

**Bukti: mutasi.** Hapus pemeriksaan di jalur non-2xx ⇒ **2 tes MATI**, dan pesan gagalnya justru
menjelaskan bug-nya sendiri: `expected 'Session expired' but got 'Sesi tidak valid'`. Tes **KONTROL**
(400 biasa harus tetap memunculkan pesan server, tanpa logout) tetap hijau di kedua versi — itulah
yang membuktikan pemetaannya **selektif**, bukan "semua 400 dianggap sesi mati".

**Verifikasi:** suite penuh **1617 lolos / 0 tes gagal** (146 berkas) · `typecheck:ratchet` 0 ·
`lint-ratchet` **2499 → 2498** (batch ini melunasi utang, bukan menambah).

