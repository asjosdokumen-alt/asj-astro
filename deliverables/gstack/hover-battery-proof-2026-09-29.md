# Bukti: baterai mutasi gate hover bisa GAGAL (2026-09-29)

**Yang ditutup:** satu-satunya klaim yang belum pernah terbukti di repo ini —
*"baterai mutasi gate hover belum pernah lulus di lingkungan mana pun"*, item **P0**
di `backlog-execution-2026-09-28.md`.

**Gate:** `e2e:hover-contrast` (`e2e/test-hover-contrast.mjs`)
**Baterai:** `e2e/test-hover-contrast.mutations.sh`
**Build yang diukur:** disajikan `node server.cjs` di `127.0.0.1:4321`

---

## Hasil

Dijalankan **satu mode per panggilan** (alasannya di §2):

| Mode | Isi | Verdict |
|---|---|---|
| `baseline` | gate penuh di tree bersih | **hijau** |
| `self` | M3–M6 — mutasi pada **GATE-nya sendiri**, tanpa rebuild | **4 KILLED** |
| `m1` | hover amber dicerahkan ke `#fde68a` (bentuk cacat audit) | **KILLED** |
| `m2` | hover emerald dicerahkan (membuktikan aturannya bukan khusus amber) | **KILLED** |
| `m7` | lantai AA diturunkan ke 0.5 | **KILLED** |
| `m8` | **OK-GREEN** — amber digelapkan ke `#78350f`, tetap patuh | **OK-GREEN** |
| `final` | restore + build bersih | **hijau** |

**7 KILLED · 0 SURVIVED · 1 OK-GREEN · 0 unexpected.**

### Baseline, diukur independen

**132 elemen** diperiksa · 0 tak terukur · 0 miss terkonfirmasi ·
rasio hover terendah **4.69:1** (`/apply`, tombol "Lanjut", lantai 4.5) ·
6/6 assert lulus.

⚠ Angka-angka itu **identik** dengan yang tercatat di `note` gate-nya — itulah yang
membuatnya verifikasi, bukan pengulangan.

---

## 1. M3 adalah mutasi yang paling penting, dan ia KILLED

M3 melumpuhkan panggilan `CSS.forcePseudoState` milik gate itu sendiri, sehingga
sapuan mengukur keadaan **DIAM**. Gate seperti itu **melaporkan setiap baris LULUS**
sambil menjadi lebih buta — lebih sehat di permukaan, tidak berguna di dalam.

Yang menangkapnya adalah **asersi premis** (membandingkan keadaan terpaksa dengan
pointer sungguhan), bukan sapuannya. Tanpa asersi itu, "0 kegagalan" gate ini tidak
berarti apa-apa.

---

## 2. Tiga pengerasan yang diperlukan — DUA di antaranya cacat di baterainya sendiri

### a. `clean_dist` dibuang

Membersihkan `dist/` subdir-per-subdir adalah resep yang **didokumentasikan header
baterai ini sendiri** — dan resep itu salah.

- Terukur: **~570 delete sandbox dalam SATU round**; sesudah itu guard menolak
  **setiap** delete.
- Gejalanya menipu: bukan "baterai berhenti", melainkan **perintah tak berhubungan
  gagal tanpa alasan** — satu `rm -f` di preamble pemanggil menggagalkan seluruh
  perintah **sebelum skripnya jalan**.
- Bahaya sesungguhnya: `astro build` ditolak di dalam `cleanServerOutput` **SETELAH**
  menyalin `sw.js` dev ⇒ **putusan palsu ke dua arah**.

Penggantinya bukan "bersihkan lebih hati-hati", melainkan **membuktikan kesegaran**:
`rebuild()` menuntut `stat -c %Y dist/index.html` **≥ waktu mulai build**.
**Keberadaan berkas bukan kesegaran** — build yang mati meninggalkan artefak
SEBELUMNYA, dan setiap pengukuran sesudahnya tentang tree yang sudah tidak ada.

### b. `npm run build` → path modul langsung

`npm run` pernah mati di mesin ini dengan *"astro is not recognized"*. Perintah di
Daftar Aksi lama memakainya, jadi resep itu **tidak bisa jalan bahkan tanpa masalah
kuota**. Baterai sekarang memakai `node node_modules/astro/astro.js build`.

### c. Satu mode per panggilan + lock + output di-tee

Terukur di baterai ARIA sehari sebelumnya: perintah panjang yang di-escalate
**dibunuh di tengah**, dan yang tertinggal adalah **mutasi**-nya. Run berikutnya
melaporkannya sebagai:

```
!! src/components/public/LokerDetailModal.tsx has UNCOMMITTED changes — an editor holds this file.
```

**Baterai yang GAGAL terbaca persis seperti editor yang berantakan.**

Output sekarang juga di-tee ke `F:/tmp/hover-mut-run.log`, karena harness yang
menjalankan ulang perintah hanya memperlihatkan stdout run **KEDUA**.

---

## 3. Restore diverifikasi dengan KONTEN

Sesudah seluruh baterai, kedua target diperiksa dengan
`git hash-object <file>` vs `git rev-parse HEAD:<file>` — **byte-identik**.

`git status` saja tidak cukup: edit dengan jumlah byte yang sama bisa bersembunyi di
stat-cache, dan itu pernah terjadi di repo ini.

---

## 4. Batas yang jujur

- Baterai ini **tidak** membuktikan gate-nya lengkap — hanya bahwa **tujuh** bentuk
  cacat yang ia klaim bisa ditangkap memang tertangkap.
- `:active` dan `:disabled` tetap tidak diprobe (didokumentasikan gate-nya sendiri).
- Panel admin tetap tidak tercakup (lubang yang sama yang dicatat `test-contrast.mjs`).
- M7 sengaja **tidak** diharapkan KILLED sebagai mutasi biasa: ia membuktikan
  **lantai AA itu load-bearing** dengan menunjukkan CSS yang sama LULUS di 0.5 dan
  GAGAL di 4.5. Itu sebabnya verdict-nya dihitung dari **dua** run.

---

## 5. Artefak

| Berkas | Perubahan |
|---|---|
| `e2e/test-hover-contrast.mutations.sh` | mode per-panggilan, lock, run log, freshness check, `clean_dist` dibuang, `npm run build` diganti |
| `scripts/ci/review-manifest.json` | verdict + tiga pengerasan dicatat di `batteryNote` gate-nya |
| `deliverables/gstack/backlog-execution-2026-09-28.md` | 4 klaim usang dikoreksi + blok PEMBARUAN |
