# QA Parity Per-Halaman: apply / master / ai-cv / siswa-baru (2026-09-04)

> **Metode:** bandingkan `khoci921/js/pages/*.ts` + deep-doc legacy vs
> `src/components/forms/*.tsx` + surface backend Astro. Verifikasi = pembacaan kode +
> typecheck + suite backend; **tanpa QA browser** (butuh perangkat/akun).

## ⚠️ Temuan struktural (semua halaman)

1. **Dispatcher backend hanya menerima JSON + field `action`.** Entry
   `netlify/functions/*.js` (makeHandler/makeSurfaceHandler) me-parse `event.body` sbg JSON;
   multipart/FormData gagal parse → `action='ping'` → respons `pong` **dengan HTTP 200**.
   → Form Astro yang mengirim raw `FormData` TANPA `action` **menampilkan sukses tanpa
   menyimpan apa pun** (false-success).
2. **`surfaces/docs.ts` menyandera 8 action sbg stub NOT_IMPL** padahal handler asli ada di
   `contexts/documents` — submitApply/berkas/kandidat/download **tidak reachable via HTTP**
   (dispatch `submitApply`→docs→stub). ✅ **DIPERBAIKI sesi ini** (wire ke handler nyata;
   `shareData` sengaja tetap stub sampai ada per-job token).
3. **Kontrak payload berbeda antar bentuk:** legacy master/siswa/ai mengirim payload dengan
   kunci snake/camel sesuai fieldPaths; beberapa form Astro memakai bentuk sendiri & endpoint
   sendiri → harus disamakan ke kontrak handler backend (semua handler = port 1:1 legacy,
   jadi **legacy adalah kontrak yang benar**).

## Ringkasan delta per halaman

### apply-full ↔ `ApplyFullForm.tsx` + `submitApply` (docs/files)
| # | Delta (legacy → Astro sekarang) | Status |
|---|---|---|
| A1 | Submit memakai action `submitFormPelamar` ke endpoint `cekDataPelamar` (stub) → false-success `res.ok`. Harus action `submitApply` ke files + parse `data.success` | ✅ **FIX sesi ini** |
| A2 | Payload legacy = flat `{photoFile, oldPhoto, cvFile, jftFile, sswFile, extraFiles[]}`; Astro kirim `{...form, fileUrls:{}}` (nested, nama salah) | ✅ **FIX sesi ini** (flat mapping photo/cv/jft/ssw) |
| A3 | `oldCv/oldJft/oldSsw/oldPhoto` (isi ulang utk pelamar lama dari `cekDataPelamar`/draft) tidak dibawa — form baru selalu fresh; backend punya cek riwayat | 🔲 delta kecil: isi old* dari hasil cekRiwayat bila ada |
| A4 | Dokumen wajib per job berasal dari `dokumen_share` server; Astro hardcode `JOB_PARAMS` utk 2 kode + `requiredDocs` dari `cekDataPelamar` (server TIDAK mengembalikan `requiredDocs`) → kartu upload bisa salah utk job lain | 🔲 delta: backend submitApply menolak dgn pesan; UI perlu ambil syarat dari `getAppData`/job agar kartu benar |
| A5 | Draft localStorage `saveDraft/restoreDraft` legacy | 🔲 belum ada |

### master-full ↔ `MasterFullForm.tsx` + `submitMasterForm` (master-data)
| # | Delta | Status |
|---|---|---|
| M1 | Submit kirim raw `FormData` (job/fam/darurat/kenalan/isDraft + file) ke `/.netlify/functions/master-data` TANPA action → **no-op pong, false-success** | 🔲 HARUS: bangun payload flat camel (kontrak legacy `master_full.ts` payload 666+) + upload file → Cloudinary URL → JSON `submitMasterForm` ke master-data dgn Bearer |
| M2 | Legacy: setiap file (photo/jft/ssw/ijazahSd..kk) di-upload dulu ke Cloudinary lalu dikirim URL-nya; backend `handleSubmitMasterForm` membaca `photoFile/jftFile/...` (`MASTER_FILE_COLUMNS`) — Astro harus upload via `uploadToCloudinary` | 🔲 (bagian M1) |
| M3 | Login gate ada ✅ (loginKandidat); auto-translate JP dijalankan server ✅ | ✅ |
| M4 | Draft lokal `asj_master_<wa>` legacy | 🟡 Astro pakai key sama di local state; verifikasi |

### ai_form ↔ `AiCvForm.tsx` (+ `ai-cv.astro`)
| # | Delta | Status |
|---|---|---|
| AI1 | Chat `processAIChat` → ai-chat ✅ benar | ✅ |
| AI2 | Save kirim raw FormData `cvData`+files ke `/.netlify/functions/ai-form-submit` TANPA action → **no-op pong** | 🔲 HARUS: tentukan action benar (`submitDataAsj`? `simpanDataTtdNaitei`? legacy ai_form pakai `submitDataAsj` utk simpan akhir + fieldPaths 70+ mapping nested ai_data_json) lalu JSON |
| AI3 | fieldPaths 70+ mapping legacy (nested `ai_data_json`, auto-merge array pendidikan/pekerjaan/keluarga) → bentuk `cv` Astro (snake, `buildMasterNested`-style) perlu dicocokkan dgn server `submitDataAsj` | 🔲 delta besar, perlu QA form |
| AI4 | Alur wawancara/signature/autofill portal (verifikasiAksesAiCv, jalankanAutoFill, ESignature) | 🟡 ada komponen (ESignatureModal); alur utuh ❓ |
| AI5 | Upload dokumen KTP/KK/dll sbg bagian CV | 🔲 sama spt M1/M2 |

### siswa-baru ↔ `SiswaBaruForm.tsx` + `submitDaftarSiswa` (register)
| # | Delta | Status |
|---|---|---|
| S1 | Chat memposting action `processSiswaAIChat` ke endpoint **register** (`submitDaftarSiswa` URL) → action tak ada di allow-list register → **404**; harus ke `ai-chat` | 🔲 delta kecil: ganti endpoint `getEndpoint('processSiswaAIChat')` |
| S2 | Payload chat Astro `{message, history, biodata}` (camel) vs legacy `{history, currentData}` — server siswa perlu dicek | 🔲 verifikasi |
| S3 | Save kirim raw FormData ke `ai-form-submit` TANPA action → no-op; legacy: upload 3 file (ktp/kk/ijazah) → Cloudinary → JSON `submitDaftarSiswa` (payload OBJEK snake: nama/ttl/gender/agama/alamat/email/pendidikan/wa_siswa/wa_ortu + ktp/kk/ijazah URL) | 🔲 HARUS (kontrak lengkap dari legacy; register surface kini **normalisasi objek/array** ✅ sesi ini) |
| S4 | Validasi "wajib semua field + 3 dokumen" legacy | 🔲 belum |

## Fixed sesi ini (backend + apply)
1. `surfaces/docs.ts` — wire `submitApply`, `getExistingCandidateJsonByWa`, `simpanKandidatDanUpload`, `simpanBerkasTahapan`, `simpanRevisiKandidat`, `downloadJobDocs` ke handler nyata; `shareData`/`isJobRequiresCv`/`submitFormPelamar`/`simpanBiodataLengkap` tetap NOT_IMPL (belum ada handler / menunggu token).
2. `surfaces/register.ts` — normalisasi payload `submitDaftarSiswa` (objek legacy ATAU array baru).
3. `ApplyFullForm.tsx` — submit → action `submitApply`, payload flat (photoFile/cvFile/jftFile/sswFile), parse `data.success` + pesan error.

## Verifikasi fix
- `npm run typecheck` exit 0 · suite backend **23 file / 216 test hijau** (tiada regresi).
- ⚠️ Belum QA browser; kontrak handler sudah diverifikasi thd implementasi contexts (bacaan kode).

## Urutan kerja rekomendasi
1. **Siswa-baru (S1+S3)** — kontrak lengkap & kecil → tinggal endpoint/payload.
2. **Master (M1)** — bangun payload flat + upload cloudinary + JSON submit.
3. **AiCv (AI2/AI3)** — pasangkan `submitDataAsj` + mapping field (delta terbesar).
4. **Apply polish (A3/A4)** + draft.
5. QA browser per halaman + tandai matriks `docs/LEGACY_PARITY_REFERENCE.md`.
