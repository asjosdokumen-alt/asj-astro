# HANDOFF — batas 4 KB env (deploy `6aa4a0bf0044aa0008729bcf`) — **✅ SELESAI, historis**

Dibuat 2026-09-12 pagi, sebelum berangkat kerja. Lanjut nanti di kantor.

> **Status per 2026-09-13:** masalah 4 KB di dokumen ini **sudah selesai** (site keluar dari Lambda
> compatibility mode; `verify:entries` melaporkan **0 fungsi mode kompat**, 22 entri root). Bagian
> penyebab & analisis di bawah tetap berguna sebagai referensi, tapi **jangan dibaca sebagai daftar
> kerja**. Untuk pekerjaan yang benar-benar tersisa, lihat `docs/BACKEND_TODO.md`.

**Baca ini dulu, lalu `docs/HANDOFF_4KB_ENV_LIMIT.md`.** Tidak ada perubahan kode di commit
ini — murni catatan supaya analisis tidak diulang.

---

## TL;DR

Deploy produksi **gagal, bukan karena bug kita**, tapi karena **limit 4 KB environment
variable milik AWS Lambda compatibility mode**. Kelebihan **179 byte**. Satu variabel
(`FIREBASE_SERVICE_ACCOUNT`, 2402 B) memakan **59%** dari seluruh anggaran.

Build **sukses sepenuhnya** — 9 halaman, 21 function dipaketkan — lalu mati di tahap
*function creation*. Tidak ada satu pun request yang pernah dilayani build ini.

Kalau Anda cuma punya 30 detik: **jalankan langkah "Cek cepat" di bawah**, lalu putuskan
opsi di bagian "Keputusan yang menunggu".

---

## Cek cepat (2 menit, tidak mengubah apa pun)

Angka 2402 di catatan ini adalah **estimasi** dari proksi JSON service-account yang ada di
`.env.local`. Untuk angka pasti, jalankan ini — hanya mencetak nama + panjang, **tidak
pernah nilai**:

```bash
cd F:/astro
netlify env:list --context production --json | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
const j=JSON.parse(s);let t=0;const r=[];
for(const [k,v] of Object.entries(j)){const b=k.length+String(v).length+1;t+=b;r.push([b,k]);}
r.sort((a,b)=>b[0]-a[0]);
for(const [b,k] of r) console.log(String(b).padStart(6),k);
console.log('TOTAL:',t,'limit 4096','over by',t-4096);});"
```

Harapan: `FIREBASE_SERVICE_ACCOUNT` di puncak, TOTAL ~4200–4400, `over by` ~150–350.

⚠️ Kalau `netlify env:list` mengembalikan **hanya `NODE_ENV`**, itu bug CLI yang sudah
diketahui (kredensial CLI ini "Owner Reviewer", under-reports). Jangan simpulkan variabel
hilang — buktikan dengan probe fungsional, bukan dengan `env:list`.

---

## Keputusan yang menunggu (pilih satu, saya belum kerjakan)

Kelebihan hanya 179 byte, jadi opsi bisa dipadukan.

### A. Keluar dari Lambda compatibility mode ⭐ rekomendasi teknis

Migrasi ke Netlify Functions modern: handler jadi `export default`, terima `Request` →
kembalikan `Response`, `schedule` lewat `export const config`. **Batas 4 KB hilang
sepenuhnya.**

- Ukuran: ~21 entry point + wrapper + `sweep-queue.ts`.
- Bukti pendukung: `package.json` sudah `"type": "module"` dan Netlify **sudah**
  memperlakukan file-file ini sebagai ESM (lihat 9 warning `commonjs-variable-in-esm` di log)
  — padahal compatibility mode hanya mendukung CommonJS. Jadi repo sudah setengah jalan
  keluar; yang menahan cuma lapisan Lambda.
- Bonus: menghapus 9 warning, dan menyiapkan repo sebelum mode lama di-deprecate
  (dokumentasi Netlify menyebut deprecation mulai 2025).
- Risiko: perubahan terbesar. Bisa dibuat bertahap dengan shim di `netlify-wrapper.ts` supaya
  tidak ada handler yang perlu diubah serentak.

### B. Pindahkan kredensial Firebase keluar dari env var

Simpan service-account sebagai file yang ikut `included_files` (atau modul JSON), dibaca dari
disk, bukan `process.env`. **Bebaskan 2402 byte → sisa 2223 byte headroom.**

- Ukuran: kecil dan lokal (1 variabel + `_lib/fcm-server.ts`).
- Konsekuensi jujur: kunci masuk ke artefak deploy. Repo privat + artefak Netlify, jadi
  risiko terkendali, tapi tetap perubahan postur keamanan — sebutkan ke pemilik sebelum
  dikerjakan.

### C. Bersihkan variabel yang tidak dibaca kode

Cari 179+ byte dari variabel mati. Yang paling menjanjikan (dari `grep` di `netlify/functions/`):

| Variabel | Byte | Catatan |
|---|---|---|
| `CLOUDINARY_UPLOAD_URL` | 142 | whitelisted di `_lib/env.ts`; perlu diverifikasi ada modul yang membacanya |
| `NETLIFY_AUTH_TOKEN` | 93 | **tidak ada modul backend yang membacanya** — ini kredensial deploy, tidak seharusnya ada di runtime function |
| `ALLOWED_DOCUMENT_HOSTS` | 83 | perlu diverifikasi |
| `PIN_MASTER` | 15 | mungkin alias `ADMIN_MASTER_PIN` |

- Cepat, tapi cuma **menambal**: batasnya tetap ada dan akan terlanggar lagi begitu
  `HEALTH_TOKEN` + `METRICS_SINK_URL` + `METRICS_SINK_TOKEN` + `METRICS_RECEIVER_TOKEN` +
  `METRICS_NOTIFY_URL` masuk (bisa +300–400 B).

### D. Padukan A + C ⭐ rekomendasi produksi

Jalankan migrasi sebagai jalur utama, sekaligus bersihkan variabel mati supaya deploy
berikutnya lolos walau migrasi tertunda. Paling aman untuk produksi yang sedang menunggu.

**Status: MENUNGGU KEPUTUSAN ANDA. Belum ada kode yang diubah.**

---

## Dua koreksi terhadap catatan lama (penting)

### 1. `surfaces/index.ts` IKUT ter-deploy

Deploy log mencantumkannya di blok `Packaging Functions from netlify/functions directory:`.

**Ini membatalkan fakta "Netlify hanya men-deploy direct children"** yang saya tulis
2026-09-12. Probe produksi kemarin (`/_lib/health` → 404) tetap benar, tapi **penjelasannya
salah**. Aturan sebenarnya (dokumentasi Netlify): dalam subdirectory, file entry harus
bernama `index` **atau** sama dengan nama subdirectory. Itu sebabnya:

| Path | Ter-deploy? | Alasan |
|---|---|---|
| `surfaces/index.ts` | ✅ ya | bernama `index` |
| `_lib/health.ts` | ❌ tidak | bukan `index`, bukan `_lib` |
| `contexts/*/service.ts` | ❌ tidak | bukan `index` |

**Konsekuensi:** 15 fungsi sampah di bawah `surfaces/` yang saya nilai "inert" kemarin adalah
penilaian yang salah — tapi bukan penyebab deploy ini gagal, karena `surfaces/index` tidak
muncul di daftar `Failed to upload file`. Statusnya: beban mati, bukan penyebab.
`verify-function-entries.mjs` perlu diperbarui untuk premis yang benar ini.

### 2. Kegagalan deploy menjelaskan 404 `/health`

Kemarin saya menyimpulkan "Phase C belum pernah di-deploy, perlu deploy dulu". Kesimpulan
akhirnya sama, tapi **alasannya beda dan itu penting**: `health.js` memang sudah ikut di-build
sejak `38f09ba`. Deploy-nya yang **selalu mati di tahap function creation**, jadi tidak
pernah ada yang naik ke produksi. Artinya memperbaiki batas 4 KB **langsung** membuka Phase C
§6 — tidak ada pekerjaan lain yang tersembunyi.

---

## Setelah deploy lolos — gate §6

Urutan yang sudah disiapkan (dari `docs/PHASE_C_OBSERVABILITY.md` §6):

1. Pastikan `HEALTH_TOKEN` ada di dashboard (`METRICS_SINK_URL` opsional — tanpa itu sink
   jadi no-op yang disengaja).
2. Redeploy.
3. `curl` tanpa token → harap `401`
4. `curl` token salah → harap `401`
5. `curl` token benar + `?detail=1` → harap `200` + report lengkap
6. Inject kegagalan DB → harap `status:"down"` + HTTP `503`

Yang belum ada dan masih perlu dibuat **Anda**: ~~`HEALTH_TOKEN`~~ — **✅ sudah dipasang sejak lama**
(terverifikasi 2026-09-13: liveness membalas `detail:"gated"`, artinya env-nya truthy; tanpa token
`?detail=1` → `401`). Sisa **hanya keputusan `METRICS_SINK_URL`**.

---

## Housekeeping yang masih terbuka

> **Ditinjau ulang 2026-09-13 malam.** Tiga dari empat butir di bawah ternyata **sudah selesai** —
> dibiarkan tercoret supaya tidak ada yang mengerjakannya lagi.

- **Revoke token `ghp_qzq70Qy…`** yang Anda tempel di chat. **Ini satu-satunya yang masih terbuka** —
  dan hanya Anda yang bisa (nilainya tidak tersimpan utuh di repo, cuma prefiks terpotong, jadi saya
  tidak bisa mengujinya). GitHub → Settings → Developer settings → Tokens. Kebocoran ke-3 lewat chat
  di proyek ini.
- ~~`origin` masih menunjuk `khoci280-arch/asj-astro`~~ — **SUDAH TIDAK ADA.** `git remote -v` kini
  hanya menampilkan **`newrepo`** → `asjosdokumen-alt/asj-astro`. Tidak ada `origin` lagi.
- ~~`dev` tertinggal 14 commit / berhenti di `f250e4b4`~~ — **SUDAH TIDAK ADA.** `git branch -a` hanya
  menampilkan `main`.
- ~~`main` = `198624e`~~ — **USANG.** Terukur 2026-09-13 malam: `main` sudah lewat `cd0c2c1`, remote
  (`newrepo/main`) = **`1adb960`**. Angka di prosa mana pun di repo ini bisa basi; **ukur sendiri**.
  Catatan alat ukurnya: `git rev-list --count newrepo/main..main` **gagal** (`unknown revision`) karena
  `newrepo/main` tidak punya tracking ref di repo ini (`git show-ref` hanya memuat `refs/heads/main`).
  Urutan yang benar:
  `SHA=$(git ls-remote newrepo refs/heads/main | cut -f1)` lalu `git rev-list --count HEAD --not $SHA`.
- ~~973 test / 110 file~~ — **USANG.** Terukur 2026-09-13 malam: **1295 tes lulus / 128 file hijau**
  (`npm test`; 1 file merah = `fcm-server.test.ts` yang diblokir shim safe-delete di sandbox lokal,
  lulus 9/9 saat dijalankan langsung — bukan regresi). Naik terus; jangan hafal.

**Pelajaran dari baris-baris yang tercoret di atas** (dan ini yang layak diingat): dokumen ini sempat
menyuruh membereskan `origin`/`dev` yang sudah lama tidak ada, dan menyebut `HEALTH_TOKEN` sebagai
"belum dibuat" padahal sudah terpasang. **Dokumen status tidak punya cara menandai dirinya basi** —
jadi setiap angka di sini harus diverifikasi dengan perintahnya sebelum dipakai.
Ini kelas yang sama dengan `ai_unavailable` dan 4-dari-7 baris matriks degradasi: dokumen menjanjikan
keadaan yang tidak ada, dan operator yang mempercayainya salah membaca sistem yang sehat.

---

## Perintah yang sering dipakai

```bash
cd F:/astro
git log --oneline -3                 # cek HEAD apa adanya — JANGAN hafal hash
git ls-remote newrepo refs/heads/main  # kebenaran remote; bandingkan dengan HEAD
git status --short                   # harus bersih
netlify status                       # catatan: cetak "Current site: undefined" (bug CLI)
```

Repo: `asjosdokumen-alt/asj-astro` (remote `newrepo`). Branch deploy: `main`.
Site: `asjastro` = `be40978f-aeab-42b7-a549-d9556e4f15de`.
