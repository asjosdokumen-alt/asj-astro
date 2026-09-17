# Analisis Pondasi Codebase — ASJ Portal v2 (Astro + Netlify + Supabase)

**Tanggal:** 2026-09-15
**Metode:** pengukuran langsung ke repo (`git`, `find`, `grep`, `.github/workflows/`), bukan ringkasan dokumen.
Setiap angka punya perintah yang bisa diulang. Ketika temuan awal saya ternyata salah, saya cantumkan
koreksinya di §2 — supaya Anda bisa mempercayai angka yang tersisa.

---

## 0. Ringkasan jawaban (baca ini dulu)

| Pertanyaan Anda | Jawaban singkat |
|---|---|
| Apakah pondasi belum selesai? | **Isinya ~95% jadi. Yang belum jadi adalah PENJAGANYA, bukan fiturnya.** |
| Kenapa lebih lambat dari refactor sebelumnya? | Tiga refactor sebelumnya mengubah **kode**. Yang ini mengubah **standar mutu** — lambat kalau satu orang, dan hasilnya tidak terlihat. |
| Cukup satu orang? | **Tidak untuk 4 jalur paralel. Ya untuk 1 jalur.** Lihat §5. |
| Prioritas utama | **Tutup 6 gate yang belum terpanggil + taruh `verify:rls` di jalur deploy (P0).** |

**Diagnosis satu kalimat:** proyek ini sudah punya *21 gate lokal yang bagus*, tapi *6 di antaranya belum
dijalankan CI* dan *4 gate data belum ada di jalur deploy*. Mutu karena itu bergantung pada disiplin manual
satu orang. **Itulah beban yang terasa seperti "belum kelar" — bukan karena ada fitur yang hilang.**

---

## 0b. STATUS: temuan P0 sudah dikerjakan (ditambahkan 2026-09-15, commit `41285a2`)

Diuji ulang setelah perbaikan:

| Metrik | Sebelum | Sesudah |
|---|---|---|
| Gate blocking yang **tak dipanggil workflow mana pun** | **9** | **0** |
| `verify:rls` di jalur pengiriman | ❌ tidak ada | ✅ kedua workflow deploy, `--json` + mode **definitive** |
| `verify:schema` di jalur pengiriman | ❌ tidak ada | ✅ kedua workflow deploy |
| Total gate di manifest | 23 tak lengkap | **24, semuanya terdaftar** |
| Baterai mutasi gate manifest | 7 mutasi (tanpa C6) | **11 killed / 0 survived** |
| Ratchet lint | 2716 (baseline basi) | **2712** |

**Dua kegagalan CI laten ketemu justru KARENA memasang gate itu** — dan keduanya akan membuat CI merah
di run pertama karena alasan yang tak ada hubungannya dengan mutu kode:

1. `.ci/biome-baseline.json` **tidak di-track** ⇒ `lint-ratchet` exit 2 ("Baseline not found").
2. `scripts/ci/lint-ratchet.mjs` **sendirinya tidak di-track**, bersama `review-gate.mjs` dan **6 baterai
   mutasi** ⇒ **seluruh infrastruktur review belum pernah di-commit.** Dari `git log` terlihat selesai.

**Cek baru C6:** tiap klaim `runs: "<wf>.yml#<job>"` sekarang diverifikasi **di sumber** (berkas ada · job
ada · skrip dipanggil **di dalam job itu**). C6 langsung menemukan klaim palsu yang sudah lama ada
(`cold:start` dideklarasikan di job `cold-start` yang tak pernah ada), **dan versi pertamanya sendiri
adalah tautologi** — mencari string di seluruh berkas, bukan di blok job — yang ditangkap baterai mutasi.

Sisa dari §3 di bawah (tindakan owner, keputusan produk) **tetap berlaku**: no. 16 & 17 masih ditunda owner.

---

## 1. Peta area & ukuran nyata

```
netlify/functions   189 berkas   26.387 LOC   backend (22 entri, 0 mode-kompat)
src                 168 berkas   32.173 LOC   frontend + UI (Astro/Preact)
indexer              37 berkas   13.904 LOC   index kode + gate dampak
scripts              41 berkas   10.833 LOC   CI/ops (21 gate + baterai mutasi)
migrations           12 berkas    1.183 LOC   SQL Supabase
e2e                  10 berkas    2.197 LOC   Playwright
shared                2 berkas      150 LOC   kontrak bersama
─────────────────────────────────────────────
TOTAL                              86.827 LOC
```

Ini **bukan** codebase kecil. Refactor Apps Script → Netlify bisa cepat karena kodenya jauh lebih sedikit.
87k LOC dengan 21 gate adalah kelas pekerjaan yang berbeda.

---

## 2. Temuan utama: gate bagus, penegakan tidak lengkap

### Koreksi premis saya sendiri (penting)

Draft pertama analisis ini menyimpulkan "**12 gate tidak dipanggil siapa pun**". **Itu salah**, dan cara
salahnya layak dicatat: saya menghitung `npm run <gate>` **langsung di workflow**, padahal gate-gate itu
dipanggil lewat **skrip npm gabungan** (`ci:quality`). Sesi sebelumnya **sudah menambal sebagian besar** —
lihat komentar `# Gate 1b · the gates CI used to skip` di `ci.yml`. Angka yang benar ada di bawah.

### Angka yang benar

`ci:quality` berisi **15 gate**. Yang **benar-benar belum** dipanggil di `ci.yml`:

```
MISSING: cold:start               (sudah ada di deploy-production, tapi tidak di CI)
MISSING: lint-ratchet
MISSING: typecheck:indexer
MISSING: verify:md
MISSING: verify:projections
MISSING: verify:review-manifest
```

Perintah untuk mengulang:
```bash
for g in cold:start lint-ratchet typecheck:indexer verify:md verify:projections verify:review-manifest; do
  echo "$g -> $(grep -c "npm run $g" .github/workflows/ci.yml)"
done
```

### Dan yang lebih penting: `ci:predeploy` tidak dipanggil siapa pun

`ci:predeploy` adalah skrip yang **menggabungkan 9 gate** dan namanya menyiratkan "syarat sebelum deploy".
Faktanya:

```
verify:env:budget     workflows(total)=0    <- tidak ada workflow mana pun
verify:projections    workflows(total)=0    <- tidak ada
verify:pwa            workflows(total)=0    <- tidak ada
verify:rls            workflows(total)=0    <- tidak ada
verify:schema         workflows(total)=0    <- tidak ada
```

Perintah:
```bash
grep -rc "npm run verify:rls" .github/workflows/   # -> 0
grep -rn "ci:predeploy" .github/workflows/          # -> kosong
```

**Konsekuensi konkret, bukan teoretis:**

1. **`verify:rls` tidak dijaga di jalur deploy.** Lockdown di `migrations/012_rls_lockdown.sql` mengatur
   siapa boleh membaca tabel apa. Kalau berkas itu tidak terpasang atau rusak, **tidak ada workflow yang
   menolak deploy.** Ini risiko kebocoran data, bukan sekadar kerapian.
2. **`verify:projections` tidak dijaga.** Aturan "jangan `SELECT *`" sudah ditulis dan punya gate — tapi
   tidak jalan otomatis.
3. **`verify:pwa` tidak dijaga** — padahal item #18 menemukan bug nyata di fallback offline SW.
4. **Nama `ci:predeploy` menyesatkan.** Isinya benar, tapi karena tidak dipanggil siapa pun, ia memberi
   rasa aman yang tidak berdasar. Ini kelas cacat yang sama dengan yang sudah repo ini dokumentasikan
   berkali-kali: **gate yang tidak bisa gagal = hipotesis, bukan gate.**

### 2b. CI juga tidak bisa menguji lapisan data

`ci.yml` menyajikan artifact dengan `astro preview`. Menurut catatan repo sendiri, **`astro preview`
tidak bisa menjawab Netlify Functions.** Jadi:

- Job `smoke` dan job `e2e` berjalan terhadap build **tanpa backend sama sekali**.
- Klaim "e2e hijau di CI" berarti "UI publik tidak rusak" — **bukan** "alur data bekerja".
- Gate yang benar-benar menguji data (`verify:rls`, `verify:projections`, `verify:schema`) justru absen.

**Ini akar dari perasaan "pondasi belum kelar": mutu terlihat hijau, tapi jangkauannya lebih sempit
daripada yang diyakini.**

---

## 3. Beban tertunda yang MASIH NYATA (bukan dokumen basi)

### A. Tindakan owner — tidak bisa dikerjakan developer (5 item)

| # | Item | Dampak kalau dibiarkan |
|---|---|---|
| 30 | Revoke **dua** token GitHub `ghp_` (satu utuh 40 karakter) | Token bocor = akses repo. **Paling mendesak.** |
| 28 | Rotasi `SESSION_SECRET` di produksi | Kalau bocor → sesi bisa dipalsukan |
| 2 | Izin push `main` | 27+ commit tertahan, kerja menumpuk |
| 7 | Pilih receiver in-repo vs Grafana + set 3 env var | Alert tidak pernah menyala |
| 26 | (tercakup di #30) | — |

### B. Butuh infrastruktur baru (1 blok, membuka 3 item)

**Staging deployment + Supabase project terpisah.** Memblokir #4 (load test 10× peak), item 22 Phase E,
dan kalibrasi cap. `deploy-staging.yml` **sudah ada** — yang belum hanya project Supabase-nya. Ini
pekerjaan provisioning, bukan penulisan kode besar.

### C. Keputusan produk (2 item) — jangan dikerjakan sebelum diputuskan

- **#16 Realtime** — tidak ada subscription Supabase di `src/` sama sekali
- **#17 Email** — tidak ada modul email apa pun

Keduanya 🟡, tapi **menunggu keputusan Anda**, bukan menunggu tenaga.

### D. Pekerjaan kode yang benar-benar tersisa

- 6 gate di §2 → dipasang ke CI (kecil, satu duduk)
- 9 aksi P3 tanpa worker (supaya bisa di-defer, bukan 503)
- 4 modal tanpa hook overlay + `EsignNaiteiModal:304`
- 5 overlay status/gerbang yang belum diperiksa

**Kesimpulan §3:** beban migrasi/upgrade **kecil**. Terasa besar karena tercampur dengan keputusan owner
dan kebutuhan infra di dokumen yang sama.

---

## 4. Inkonsistensi struktural

| # | Inkonsistensi | Bukti | Tingkat |
|---|---|---|---|
| S1 | 6 gate `ci:quality` belum dipanggil `ci.yml` | §2 | 🟠 Sedang |
| S2 | `verify:rls` (+ `:projections`, `:schema`, `:pwa`, `:env:budget`) absen dari jalur deploy | §2 | 🔴 Tinggi (risiko data) |
| S3 | `ci:predeploy` tidak dipanggil siapa pun — namanya menyesatkan | §2 | 🟠 Sedang |
| S4 | CI menguji build tanpa functions (`astro preview`) | §2b | 🟠 Sedang |
| S5 | Ratchet absolut (jumlah berkas) di `discover/build.test.ts` | sudah diperbaiki §27 | 🟡 Rendah |
| S6 | `deploy-staging` & `deploy-production` menduplikasi langkah gate | staging tanpa `cold:start` | 🟡 Rendah |

---

## 5. Satu orang atau expert paralel?

### Yang **TIDAK** efektif diparalelkan

- **Menutup gate (P0).** Menyentuh `ci.yml`, 2 workflow deploy, `package.json`. Dua orang bersamaan →
  konflik merge berulang di berkas yang sama. **Satu orang, satu duduk.**
- **Ratchet & baseline.** Angka saling terkait (berkas ↔ simbol ↔ utang lint). Dua orang menggeser
  baseline bersamaan = angka bertabrakan.
- **Provisioning staging.** Berurutan, satu pekerjaan.

### Yang **EFEKTIF** diparalelkan (pohon terpisah, tidak saling sentuh)

| Jalur | Cakupan | Kenapa aman |
|---|---|---|
| **A. Backend** | `netlify/functions/**` | Pohon terpisah; kontrak dijaga `verify:binding` |
| **B. Frontend/UI** | `src/**` | Pohon terpisah; sisa §25 ada di sini |
| **C. CI/CD** | `.github/**`, `scripts/ci/**` | Terpisah dari A & B |
| **D. Ops/infra** | staging + Supabase project | Pekerjaan dashboard, bukan kode |
| **E. Indexer** | `indexer/**` | Mandiri |

### Rekomendasi: **3 expert paralel + Anda sebagai pengambil keputusan**

- **Expert 1 — Backend & Data:** 9 aksi P3 → worker; perkuat gate data.
- **Expert 2 — Frontend & UI:** sisa §25 (4 modal + 5 overlay), konsistensi kelas CSS, aksesibilitas.
- **Expert 3 — CI/CD & Reliability:** tutup 6 gate; **buat CI bisa menjalankan functions**; hapus duplikasi deploy.
- **Anda / Ops:** provisioning staging + Supabase → membuka 3 item sekaligus.

**Dan satu orang memegang P0 lebih dulu, sendirian, sebelum tiga jalur dibuka.** Kalau P0 dikerjakan
bersamaan, kalian berkonflik di `ci.yml` dan `package.json` berulang kali — itu memperlambat, bukan mempercepat.

### Kenapa satu orang lambat di proyek INI (bukan di proyek sebelumnya)

Refactor sebelumnya **mengganti teknologi** — hasilnya terlihat (Apps Script hilang, jadi Netlify).
Yang ini **menambah penjagaan mutu** — hasilnya tidak terlihat, dan setiap gate baru menambah permukaan
yang harus dijaga. Ditambah pola yang berulang: **setiap sesi menambah gate ke `scripts/ci/` tanpa
memperbarui ratchet**, sehingga gate memerah lalu diabaikan (terdokumentasi di `discover.test.ts`).

**Satu orang cukup — kalau hanya mengerjakan satu jalur.** Yang membuatnya tidak cukup adalah mengerjakan
lima jalur berurutan sendirian **sambil menunggu 5 keputusan owner**.

---

## 6. Rekomendasi prioritas

### P0 — Satu orang, satu duduk

**Sasarannya: tidak ada gate bagus yang tidak dijalankan, dan tidak ada nama yang berbohong.**

1. Pasang **6 gate** yang belum terpanggil ke `ci.yml`: `lint-ratchet`, `typecheck:indexer`,
   `verify:md`, `verify:projections`, `verify:review-manifest`, `cold:start`.
2. **`verify:rls` + `verify:projections` + `verify:schema` ke jalur DEPLOY**, bukan hanya CI.
   Ini satu-satunya kelompok gate dengan konsekuensi kebocoran data.
3. **Perbaiki atau hapus `ci:predeploy`.** Sekarang ia menyesatkan: terlihat seperti syarat deploy,
   padahal tidak dipanggil siapa pun. Pilih: panggil dari deploy, atau hapus dan ganti nama.
4. Hapus duplikasi langkah gate antara `deploy-staging.yml` dan `deploy-production.yml`.

**Kriteria selesai:** setiap gate di `package.json` punya pemanggil di `.github/workflows/`, atau
dihapus. Tidak boleh ada gate yang hanya hidup sebagai skrip npm.

### P1 — Buka tiga jalur paralel (setelah P0 selesai)

- **Backend:** 9 aksi P3 → worker; perkuat gate data.
- **Frontend:** sisa §25 (4 modal + 5 overlay).
- **CI:** buat CI bisa menjalankan functions (`netlify dev` atau equivalent) → smoke/e2e benar-benar menguji data.
- **Ops (Anda):** staging + Supabase project.

### P2 — Keputusan owner (jangan tunggu engineering)

- Revoke 2 token, rotasi `SESSION_SECRET`, izin push.
- Putuskan #16 Realtime & #17 Email → kalau "belum perlu", **tutup itemnya**.
- Pilih receiver in-repo vs Grafana (#7).

**Item P2 yang dibiarkan "terbuka" itulah yang membuat pondasi terasa belum kelar. Menutup item dengan
keputusan "tidak dikerjakan" sama berharganya dengan mengerjakannya.**

---

## 7. Satu perubahan cara kerja yang saya sarankan

`docs/BACKEND_TODO.md` sudah sangat baik — setiap klaim punya bukti dan perintah. **Masalahnya: dokumen
itu mencampur tiga jenis pekerjaan dalam satu tabel** — (a) kerja kode, (b) keputusan owner,
(c) provisioning infra. Karena tercampur, "sisa pekerjaan" selalu terlihat besar.

Saran: pecah menjadi tiga daftar.
- `BACKEND_TODO.md` → hanya kerja kode
- `OWNER_DECISIONS.md` → hanya keputusan Anda, dengan kolom **"kalau tidak diputuskan, akibatnya X"**
- `INFRA_TODO.md` → provisioning

Dengan itu "sisa kode" akan terlihat sebagaimana adanya: **kecil**. Dan yang sebenarnya menahan pondasi —
keputusan dan infra — akan menonjol, bukan tersembunyi di antara baris kode.

---

## 8. Kalau hanya boleh melakukan SATU hal

**Panggil `ci:quality` dari `ci.yml`.** Satu baris:

```yaml
      - name: Full quality gate
        run: npm run ci:quality
```

Itu langsung menutup **keenam** gate yang belum terpanggil sekaligus — sudah diverifikasi bahwa
`ci:quality` memuat semuanya:

```bash
node -e "console.log(require('./package.json').scripts['ci:quality'])" \
  | tr '&' '\n' | grep -oE "npm run [a-z:0-9-]+" | sort -u \
  | grep -E "cold:start|lint-ratchet|typecheck:indexer|verify:md|verify:projections|verify:review-manifest"
# -> keenamnya ada
```

**Aman di CI hari ini:** `cold:start` melewatkan dirinya sendiri (exit 0) ketika dijalankan tanpa
`--url` — jadi memanggilnya di CI tidak akan memerahkan pipeline karena alasan lingkungan.

Setelah itu, tambahkan `verify:rls` / `verify:projections` / `verify:schema` ke **deploy**, karena
kegagalan di sana menimbulkan kerusakan yang **tidak bisa dibatalkan oleh rollback aplikasi** —
rollback mengembalikan kode, bukan kebijakan akses tabel.

### Yang perlu diwaspadai saat melakukannya

`ci:quality` menjalankan `npm run test` (seluruh suite). Suite ini butuh **~4 menit** dan `idx:gate`
membangun indexer lebih dulu. Jadi bukan penambahan gratis — pertimbangkan matrix job terpisah
supaya tidak memperlambat umpan balik PR. **Tapi lebih lambat dan benar jauh lebih baik daripada
cepat dan tidak memeriksa apa pun.**
