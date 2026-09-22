# AI CV Full Page — Side-by-Side: Astro v2 (sekarang) vs Legacy

> **Dibuat:** 2026-09-19 · **Metode:** baca kode, bukan dokumentasi.
> - **v2 sekarang:** `src/components/forms/AiCvForm.tsx` (993 baris), `src/pages/ai-cv.astro`
> - **Legacy:** `F:\Asjpow4v7-main\khoci921\ai_form.html` (393 baris) + `js/pages/ai_form.ts`
>   (1.822 baris) + `js/pages/ai-chat.ts` (163 baris)
>
> **Koreksi terhadap `LEGACY_PARITY_REFERENCE.md`:** dokumen itu menyebut legacy
> `ai_form.html` sebagai "🟡 backend ✅, QA parity ❓". Dokumen ini menjawab "❓"-nya
> dengan kode. Juga mengoreksi `ai_form-DEEP.md` §10 issue #4 — lihat §2 di bawah.

---

## 1. Ringkasan satu layar

| Aspek | Legacy (live) | v2 sekarang | Verdict |
|---|---|---|---|
| Layout | Split 35% chat / 65% form | **Sama** (35/65) | ✅ parity |
| Kolom manual | **BISA DIEDIT** (JS melepas `readonly`) | **SEMUA `readonly`** | ❌ **regresi** |
| Dropdown ID↔JP | `FIELD_PAIRS` + `PAIR` dua arah | datalist (hanya saran) | 🟡 sebagian |
| Pendidikan/Pekerjaan/Keluarga | **3 seksi dinamis, item bisa tambah/hapus** | **kosong** ("Belum ada data") | ❌ **regresi** |
| Suggestion pills | tidak ada | **ada** (6 pill) | ➕ tambahan v2 |
| Login gate | tidak ada (halaman publik) | ada (modal wall) | ➕ hardening |
| Status tombol Simpan | `disabled` + spinner + 3 label progres | **tidak ada state** | ❌ lebih lemah |
| Foto: pratinjau | `#previewFoto` tampil | tampil | ✅ parity |
| Foto: kompresi | `compressImage()` (canvas → JPEG) | tidak ada | ❌ hilang |
| Guard ekstensi upload | cek SEBELUM kirim (PDF/JPG/PNG) | `accept=` saja | 🟡 lebih lemah |
| Mode admin | tidak ada | `waTarget` + `adminMode` | ➕ tambahan v2 |
| Retry jaringan | `withRetry(…, 2, 2000)` | timeout 20 s | 🟡 beda strategi |

---

## 2. KOREKSI PENTING — "Edit manual aktif" itu NYATA di legacy

`ai_form-DEEP.md` §10 issue #4 menulis: *"All 66 inputs readonly — form is
display-only, contradicts 'Edit manual aktif' label"*. **Itu salah.** Angka 66
benar untuk **HTML statis**, tapi JS-nya melepas `readonly` saat init:

```ts
// js/pages/ai_form.ts:438-459
function enableManualPreview() {
  document
    .querySelectorAll('#formPanel input[readonly], #formPanel textarea[readonly]')
    .forEach(function (el) {
      el.removeAttribute('readonly');                    // ← dilepas
      el.setAttribute('title', window.tr('form.ai_f_tooltip'));
    });
  Object.keys(fieldPaths).forEach(function (id) {
    const el = $(id);
    if (!el || el.dataset.manualBound) return;
    el.dataset.manualBound = 'true';
    el.addEventListener('input', function () {
      setByPath(latestCandidateData, fieldPaths[id], el.value);  // ← tulis balik ke state
      el.classList.add('border-sky-400');                        // ← penanda visual
      saveToLocal();                                             // ← persist
      if (id === 'f_tgllahir') syncUmurFromTglLahir();            // ← turunan
    });
  });
}
```

Dipanggil di `aiFormInitApp()` baris 889 — jadi **setiap** field teks/textarea
bisa diketik kandidat di legacy. Form itu bukan display-only; ia *seeded* oleh AI
lalu **bisa dikoreksi manusia**.

**Di v2 semua tetap `readonly`.** `AiCvForm.tsx` menulis `readonly` literal di
~50 pemanggilan `<Field>` dan tidak ada satu pun kode yang melepasnya
(`grep removeAttribute src/components/forms/AiCvForm.tsx` → **0 hasil**).
Jadi kandidat yang melihat AI salah isi **tidak bisa membetulkannya** kecuali
lewat chat lagi, dan chat itu bisa salah lagi.

> Catatan: `StatusNumber` **sudah** editable (select ADA/TIDAK ADA + nomor).
> Itu satu-satunya jalur manual yang hidup di v2 saat ini.

---

## 3. Chat system

| | Legacy | v2 |
|---|---|---|
| Judul header | `Qween Jeklin 👑` | `Qween Jeklin` (emoji crown jadi `<Icon name="crown">`) |
| Tagline | `HRD ASJ (Boss's Daughter)` | `ai_cv.hrd_tagline` (i18n) |
| Avatar | `gdwvffm…/jeklin.png` | URL sama (masih ref proyek lama) |
| Indikator "sedang mengetik" | `#aiTypingStatus` — bar **DI ATAS form**, teks `Qween Jeklin sedang menganalisis & translate datamu…` + `fa-spin` | **bubble 3 titik** di dalam chat + bar tipis di atas form (`form.ai_analyzing`) |
| Greeting awal | dari `chatHistory` restore; kalau kosong tidak ada sapaan eksplisit | **selalu** `t('ai_cv.bot_greeting')` saat mount |
| Riwayat dikirim | `chatHistory.slice(-20)` | `[...messages, msg].slice(-20)` |
| Payload | `{flow, history, currentData, lang}` | `{history, currentData}` — **`flow` tidak dikirim** |
| Retry | `withRetry(fn, 2, 2000)` — 2 percobaan, jeda 2 s | **tidak ada retry**; timeout 20 s |
| Parse `reply` yang berupa JSON | ada: `JSON.parse` + regex fallback `"reply":"…"` | tidak ada (server v2 tidak mengirim bentuk itu) |
| Sanitasi HTML | `appendHTML` me-render HTML AI | `sanitizeAiHtml()` — strip script/style/on*/tag |
| Bold markdown | via HTML dari server | `**x**` → `<b>x</b>` |
| Saran (pills) | **tidak ada** | 6 pill: Perkenalkan diriku, Isi data pendidikan, Terjemahkan semua kolom ke JP, Lengkapi data keluarga, Isi pengalaman kerja, Lengkapi data wawancara |
| Kirim | Enter (`onkeypress`) | Enter tanpa Shift; Shift+Enter = baris baru |
| Input saat kirim | `input.disabled = true` + `btn.disabled = true` | `btn disabled={sending}`; input **tetap aktif** |
| Fokus balik | `inputEl.focus()` setelah selesai | `inputRef.current?.focus()` di `finally` |
| Penanganan error | satu pesan: `form.ai_chat_error` | **3 cabang**: `AI_UNAVAILABLE` → banner; `err.status` → pesan server; transport → copy ramah |
| Banner AI mati | tidak ada | `<AiUnavailableBanner>` saat `code: 'AI_UNAVAILABLE'` |

**Behavioral note:** v2 **tidak mengirim `flow`**. Legacy selalu mengirim
`flow` dari `window.AI_FORM_CONTEXT` (diisi dari URL `?flow=`). Kalau backend
membedakan varian chat berdasarkan `flow`, ini perbedaan kontrak yang perlu
diverifikasi — bukan sekadar rapi-rapian.

---

## 4. Kolom manual — daftar lengkap per seksi

Angka `readonly` = jumlah field yang **tidak bisa diketik** di v2.

### Seksi 1 — Identitas & Kontak

| Field | Legacy | v2 | Catatan |
|---|---|---|---|
| Nama Lengkap | edit + `for=` | `readonly` | legacy punya `for="f_nama"` |
| Katakana | edit (`text-pink-300`) | `readonly` | |
| Panggilan / P. Katakana | edit | `readonly` | |
| Tmp Lahir / Tgl Lahir | edit + `type="date"` | `readonly` + `type="date"` | date picker ✅ parity |
| Umur | edit, auto dari tgl lahir (`syncUmurFromTglLahir`) | `readonly`, **tanpa auto-hitung** | ❌ turunan hilang |
| Gender | **`<select>` ID↔JP** | `readonly` + datalist | 🟡 |
| Agama | **`<select>` ID↔JP** | `readonly` + datalist | 🟡 |
| Gol. Darah | **`<select>`** | `readonly` + datalist | 🟡 |
| Status Nikah | **`<select>` ID↔JP** | `readonly` + datalist | 🟡 |
| Anak | edit | `readonly` | |
| Email, Alamat, HP, HP Darurat, NIK KTP | edit + `for=` | `readonly` | |
| No. Paspor | **`<select>` ADA/TIDAK ADA + input** | `StatusNumber` — **editable!** | ✅ satu-satunya |
| SIM | **`<select>` ADA/TIDAK ADA + input** | `StatusNumber` — **editable!** | ✅ |

### Seksi 2 — Fisik

| Field | Legacy | v2 |
|---|---|---|
| Tinggi (cm), Berat (kg) | edit + satuan `cm`/`kg` di dalam field | `readonly` + satuan di dalam field ✅ |
| Tgn Dominan | **`<select>` KANAN/KIRI** | `readonly` + datalist 🟡 |
| Uk. Sepatu | **`<select>` 36–46 (JP cm)** | `readonly`, **tanpa pilihan** ❌ |
| Uk. Baju | **`<select>` S/M/L/XL/XXL (JP LL/3L)** | `readonly` ❌ |
| Uk. Topi | **`<select>` 54–62** | `readonly` ❌ |
| Sanggup Tanpa AC | **`<select>` YA/TIDAK** | `readonly` + datalist 🟡 |

> `SEPATU_PAIRS` / `BAJU_PAIRS` / `TOPI_PAIRS` di legacy memetakan ukuran ID ke
> ukuran JP (mis. `XL → "XL (JP LL)"`). v2 kehilangan peta itu — nilainya hanya
> teks bebas dari AI.

### Seksi 3 — Medis

| Field | Legacy | v2 |
|---|---|---|
| Mata Kanan / Kiri | edit | `readonly` |
| Kacamata, Buta Warna, Tato, Rokok, Alkohol | **`<select>` YA/TIDAK** | `readonly` + datalist 🟡 |
| Alergi / Penyakit / Kecelakaan (ID+JP) | edit, textarea `rows=1` | **editable** (textarea, `rows=2`) ✅ |
| — | — | v2 bungkus `<fieldset><legend>` untuk a11y ✅ |

### Seksi 4 — Jiko PR & Wawancara

| Field | Legacy | v2 |
|---|---|---|
| Pernah ke Jepang? | edit, `w-1/3` | `readonly` + datalist 🟡 |
| 10 pasang bilingual (promo, lebih, kurang, hobi, keahlian, moti, alasan, pulang, keinginan, tujuan) | **editable** textarea `rows=1`, helper `text-[9px] italic` | **editable** `rows=2`, helper `text-fg-subtle` ✅ |
| Lama di Jepang (thn) | edit | `readonly` |
| Gaji (yen) | edit, `text-amber-300` | `readonly`, `jp`, `text-pink-300` 🟡 |
| Tabungan | edit, `text-amber-300` | `readonly`, `jp`, `text-pink-300` 🟡 |

### Seksi 5 — Pendidikan / Pekerjaan / Keluarga ← **GAP TERBESAR**

| | Legacy | v2 |
|---|---|---|
| Sertifikasi (bhs/nilai/lisensi) | 3 field + 2 datalist | 3 field + 2 datalist ✅ |
| `#c_pendidikan` | **dinamis, max 5 item** | ❌ teks "Belum ada data…" |
| `#c_pekerjaan` | **dinamis, max 3 item** | ❌ teks "Belum ada data…" |
| `#c_keluarga` | **dinamis, max 5 item** | ❌ teks "Belum ada data…" |
| `pekerjaan-options` datalist | **23 jenis pekerjaan + kanji** | ❌ tidak ada |

Struktur item dinamis legacy (`arrayFields`):

```
pendidikan : tingkat(select) · sekolah_id/jp · jurusan_id/jp · masuk · lulus   (month-year)
pekerjaan  : perusahaan_id/jp · jabatan_id/jp(select-pair) · masuk · keluar · gaji
keluarga   : hubungan_id/jp(select-pair) · nama · katakana · umur · pekerjaan_id/jp(select-pair) · gaji
```

`masuk`/`lulus`/`mulai`/`keluar` di legacy adalah **dropdown tahun + bulan**
(`yearOptionsHtml` / `monthOptionsHtml`, rentang 60 tahun), dengan alasan eksplisit
di komentar: *"dulu input bebas, sering '2019' vs '2019-04' campur → sort
Rirekisho kacau"*. v2 tidak punya seksi ini sama sekali.

### Kenalan di Jepang

| Field | Legacy | v2 |
|---|---|---|
| Nama (ID / Katakana) | edit | `readonly` |
| Hubungan (ID / JP) | **`<select>` pair** | `readonly` 🟡 |
| Pekerjaan (ID / JP) | **`<select>` pair** | `readonly` 🟡 |
| Usia | edit + `thn` | `readonly` + `thn` |
| Alamat (ID / JP) | edit | `readonly` |

### Upload — 8 baris

| Baris | Legacy | v2 |
|---|---|---|
| Pas Foto | `accept="image/*"` → `compressImage()` canvas | `accept="image/*"`, **tanpa kompresi** ❌ |
| JFT | `.pdf` | `.pdf` ✅ |
| SSW | `.pdf` | `.pdf` ✅ |
| KTP / KK | `.pdf,image/*` | `.pdf,image/*` ✅ |
| Ijazah SD/SMP/SMA/Univ | `.pdf,image/*` | `.pdf,image/*` ✅ (pernah `.pdf` saja, sudah diperbaiki) |
| Status per baris | `#status_<type>` (hidden → tampil nama file) | `docStatus[type]` ✅ |
| Pratinjau foto | `#previewFoto` `h-14 w-12` | `<img>` `h-14 w-12` ✅ parity |

---

## 5. Behavior tiap tombol

| Tombol | Legacy | v2 | Beda |
|---|---|---|---|
| **Tab Chat** (mobile) | `switchTab('chat')`, `aria-label="Tab Chat"` | `setTab('chat')`, ikon+label i18n | ✅ parallax sama |
| **Tab Preview CV** (mobile) | `switchTab('form')` | `setTab('form')` | ✅ sama |
| **Kirim** (paper-plane) | `sendMessage()`; `disabled` saat kirim; retry 2× | `handleSend()`; `disabled={sending}`; **tanpa retry** | 🟡 |
| **Pill saran** (6×) | **tidak ada** | `handleSend(s)` lalu pills disembunyikan; muncul lagi 500 ms bila ada `suggestions` | ➕ v2 baru |
| **SIMPAN DB** | `saveToDatabase()` — lihat detail di bawah | `saveToDatabase()` — lihat detail | ❌ state hilang |
| **Toggle bahasa** | `toggleFormLanguage(); updateFormUI();` label `JP`/`ID` | `toggleLang()` label `ID`/`JP` | 🟡 label terbalik arah, cek i18n store |
| **Portal** (kiri atas) | ada — `fixed top-4 left-4`, `aria-label` | **tidak ada** | ❌ di v2 hanya lewat FormToolbar |
| **Skip link** | `href="#formPanel"` | `#main-content` | ✅ setara |
| **File input ×8** | `onchange="handleDocUpload(event,'x')"`, foto → `compressImage` | `onChange` → `handleDocUpload(type,file)` | 🟡 kompresi hilang |
| **Select ADA/TIDAK ADA** (paspor/SIM) | `readonly` di HTML, dilepas JS; menyembunyikan input nomor saat TIDAK ADA | **editable**, sembunyikan nomor saat TIDAK ADA | ✅ parity (+1 perbaikan sengaja) |
| **Tombol dinamis item** (tambah/hapus item) | ada di `c_pendidikan/pekerjaan/keluarga` | **tidak ada** | ❌ |

### Detail `SIMPAN DB` — state tombol

Legacy punya **5 state visual berurutan**:

```ts
btn.disabled = true;
btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + tr('form.ai_saving_db') + '…';
// → guard ekstensi SEMUA file dulu (JFT/SSW wajib pdf; KTP/KK/ijazah boleh jpg/png/pdf)
btn.innerHTML = '<i class="fas fa-cloud-upload-alt fa-spin"></i> Mengunggah dokumen...';
btn.innerHTML = '<i class="fas fa-paper-plane fa-spin"></i> Menyimpan data...';
// sukses:
btn.innerHTML = '<i class="fas fa-check"></i> ' + tr('form.ai_save_success_btn');
btn.classList.replace('bg-emerald-600', 'bg-sky-600');   // ← tombol berubah WARNA
```

Plus jalur gagal yang **selalu** mengembalikan `btn.disabled=false` +
`btn.innerHTML` semula (3 blok `catch` terpisah: submit, upload, luar).

v2: klik → `uploadMany()` → `submitDataAsj` → toast. **Tidak ada** `disabled`,
spinner, atau label progres. Kandidat yang menekan dua kali bisa mengirim dua
kali; dan selama upload dokumen besar berjalan tombol tetap tampak siap ditekan.

### Guard ekstensi — apa yang hilang

Legacy memeriksa ekstensi **sebelum** apa pun dikirim, dan menolak dengan nama
file di pesan:

```ts
const ok = extCheck[ei].t === 'foto' ? ['pdf','jpg','jpeg','png'] : ['pdf'];
if (ok.indexOf(nm) === -1) {
  btn.disabled = false;
  showToast(tr('form.ai_ext_check_bad').replace('{file}', ...), 'error');
  return;   // ← batal, tidak ada byte terkirim
}
```

v2 mengandalkan atribut `accept=` (yang bisa dilewati drag-and-drop / "All files"
di beberapa browser). Tidak ada validasi sisi-klien sebelum `uploadMany`.

---

## 6. Validasi & gate

| | Legacy | v2 |
|---|---|---|
| Gate login | **tidak ada** — halaman publik, `AI_FORM_CONTEXT.wa` dari URL | **modal wall** wajib login kandidat (kecuali `adminMode`) |
| Cek akses AI | `verifikasiAksesAiCv()` → redirect non-siswa ke Form Master | `aiCvAccessRedirect()` di `useEffect` ✅ parity |
| Wajib nama sebelum simpan | **ada** — `namaEl` jadi `border-rose-500` + `focus()` + `switchTab('chat')` di mobile | **tidak ada** |
| Wajib WA sebelum simpan | tidak eksplisit | `waSchema` + toast "Nomor WA belum diisi." ✅ |
| Payload WA | `formContext` (flow/job/bidang/wa/nama dari URL) | `{context:{wa}}` + section bersarang |
| `paspor_status` / `sim_status` | disimpan di `identitas.*` | disimpan + fallback `'ADA'` bila nomor ada ✅ |

---

## 7. Apa yang v2 lakukan LEBIH BAIK dari legacy

1. **Label → kontrol terhubung.** Legacy: **0 dari 74 label** punya `for=`
   (WCAG 2.1 SC 1.3.1 gagal). v2 memberi `for={`ai_${id}`}` di hampir semua field,
   `<fieldset><legend>` untuk blok medis, `aria-label` di select status.
2. **XSS.** Legacy `appendHTML` menyuntik HTML dari AI apa adanya. v2
   `sanitizeAiHtml()` membuang `<script>`, `<style>`, `on*`, dan seluruh tag.
3. **Pesan error chat berlapis.** v2 memisahkan `AI_UNAVAILABLE` (banner + copy
   server), error server ber-status, dan kegagalan transport. Legacy: satu pesan.
4. **Timeout.** v2 membatasi 20 s; legacy bisa menggantung tanpa batas.
5. **Mode admin.** `waTarget` + `adminMode` — admin bisa membuka & mengoreksi CV
   kandidat. Legacy tidak punya.
6. **i18n.** v2 memakai store i18n sungguhan; legacy `data-lang` di-render ulang.
7. **`StatusNumber` sengaja tidak meniru bug legacy** — legacy men-default status
   ke `TIDAK ADA` dan `syncSimPasporVisibility()` **mengosongkan nomor paspor yang
   sudah tersimpan** (data hilang tanpa peringatan). v2 membiarkan kosong `—` dan
   tidak pernah menghapus nomor diam-diam. Ini perbaikan sadar, bukan regresi.

---

## 8. Prioritas perbaikan (urut dampak)

**Status per 2026-09-19:** P1 (semua) + P2 (semua) **SELESAI** — lihat §8.1.
P3 masih terbuka.

| # | Item | Status | Rujukan |
|---|---|---|---|
| P1 | **Aktifkan edit manual** — lepas `readonly`, tulis balik ke state, tandai field yang disentuh | ✅ **SELESAI** | §2 |
| P1 | **Bangun 3 seksi dinamis** (pendidikan max 5, pekerjaan max 3, keluarga max 5) + dropdown tahun/bulan | ✅ **SELESAI** | §4 |
| P1 | **Dropdown berpasangan ID↔JP** (`aiCvPairs.ts`) + kolom kanji bisa dikoreksi | ✅ **SELESAI** | §4 |
| P2 | **State tombol SIMPAN DB** (`disabled` + spinner + label progres + warna sukses) | ✅ **SELESAI** | §5 |
| P2 | **Guard ekstensi sebelum kirim** | ✅ **SELESAI** | §5 |
| P2 | **Auto-hitung umur dari tanggal lahir** | ✅ **SELESAI** | §4 |
| P3 | **Kompresi foto** (`compressImage`, canvas → JPEG) | ⬜ terbuka | §4 |
| P3 | **Kirim `flow` di payload chat** | ⬜ terbuka | §3 |
| P3 | **Retry jaringan chat** (`withRetry`, 2×) | ⬜ terbuka | §3 |
| P3 | **Pindahkan URL aset dari ref Supabase lama** (`gdwvffm…`) ke ref aktif | ⬜ terbuka | sesi 2026-09-19 |

### 8.1 Apa yang sudah dikerjakan (2026-09-19)

| Berkas | Perubahan |
|---|---|
| `src/lib/aiCvPairs.ts` | **baru** — pemilik tunggal registry pasangan ID↔JP, dipetakan ke `opsi-form.ts` supaya kedua form tidak bisa menyimpang. `JP_HALF_OF` **diturunkan** dari `PAIRED_FIELDS` |
| `src/lib/aiCvPairs.test.ts` | **baru** — 14 tes; dibuktikan bisa gagal via mutasi (hapus `partner` gender → **2 failed / 12 passed**) |
| `src/components/forms/AiCvForm.tsx` | `Field` bisa diedit + penanda `border-sky-400`; `PairSelect`/`JpField`/`RepeaterRow`/`RowSelect`; `handleManualEdit`/`handlePairEdit`/`handleTglLahir`; `savePhase`; `DOC_EXT_RULES`; payload `pendidikan`/`pekerjaan`/`keluarga` + `gender_jp`/`agama_jp`/`status_nikah_jp` |
| `src/lib/aiCvDraft.ts` | `gender_jp`/`agama_jp`/`status_jp` masuk `AI_CV_FLAT_KEYS` + `AI_CV_PATHS` (kalau tidak, draft hilang saat reload) |
| `src/store/i18n.ts`, `i18n-jp.ts` | ~29 kunci baru per lokal |

**Jebakan yang ditemukan saat mengerjakan** (layak diingat):

- **`Field`/`PairSelect`/`JpField` menambah prefiks `ai_` sendiri**, sedangkan
  `RowSelect` memakai `id` apa adanya. Menulis ``id={`edu-sekolah-id-${i}`}`` ke
  `Field` menghasilkan `ai_ai-edu-…`. Sekarang ketiganya memakai `const domId = \`ai_${id}\``
  lokal supaya aturannya terlihat di satu tempat.
- **Tidak cukup melepas `readonly` sebagai default `Field`.** Kolom kanji
  (`gender_jp` dkk) tidak dirender sama sekali, jadi memilih gender mengisi state
  tetapi **tidak ada elemen** yang menampilkannya — dan payload tidak pernah
  memuatnya. Dua cacat, keduanya lolos dari pembacaan source.
- **`saveToDatabase` menolak jalan tanpa `cv.hp`** (dipakai sebagai
  `context.wa`). Tes submit yang tidak mengisi `ai_hp` akan "lulus" dengan
  menganggur — assert harus menunggu `submitDataAsj` benar-benar terpanggil.
- **Diagnosis lewat probe render, bukan `grep`.** Membuang satu berkas tes
  sementara yang mencetak semua `[id]` yang benar-benar ter-render lebih cepat
  daripada menebak dari source.

---

## 9. Cara memakai dokumen ini

1. Baca §2 dulu — itu koreksi yang mengubah prioritas (legacy **bisa** diedit).
2. Untuk tiap P1, kerja sebagai **satu slice vertikal** (R2): UI + state + payload
   backend + tes, lalu commit.
3. Setiap perbaikan wajib bawa **tes yang terbukti bisa gagal** (R5).
4. Jangan commit `-A` (R4); `git add` per berkas.
