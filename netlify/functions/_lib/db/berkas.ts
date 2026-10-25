import { supabaseJson, toText, toDateOnly, pick, normalizeWa } from './client';
import { storageRequest, bucket } from '../storage.ts';
import { fetchMasterLightByWa } from './master';
import { MASTER_LIGHT_COLS, PEMBERKASAN_COLS } from './projections';
// db/berkas.js — repo pemberkasan_checklist + attach berkas/bio kandidat + list folder Storage.

// ---------------------------------------------------------------------------
// Lampirkan berkas (pemberkasan_checklist) & bio (master_database_candidate)
// ke tiap kandidat — bentuk yang diharapkan frontend (candidate.berkas /
// candidate.bio) untuk dashboard kandidat (progres pemberkasan x/17, biodata)
// dan modal admin (berkas tersimpan, auto-fill biodata). Backend asli (GAS)
// mengirim keduanya di getAppData; rebuild ini sebelumnya tidak melakukannya.
// Kolom sumber per dokumen ikut skema yang dipakai handleSimpanBerkasTahapan
// (FILE_LABEL_COLUMNS di actions-extra.js) + fallback nama kolom legacy.
// ---------------------------------------------------------------------------
// Kandidat kolom per dokumen — urut: pemberkasan_checklist → master → legacy.
// pemberkasan_checklist (dibuat rebuild) bisa kosong untuk data lama, jadi
// master_database_candidate (*_url) dipakai sebagai fallback.
const BERKAS_COLUMNS: [string, string[]][] = [
  ['kk', ['kk_url', 'kk']],
  ['akte', ['akte_url', 'akte']],
  ['sd', ['sd_url', 'ijazah_sd_url', 'ijazah_sd', 'sd']],
  ['smp', ['smp_url', 'ijazah_smp_url', 'ijazah_smp', 'smp']],
  ['sma', ['sma_url', 'ijazah_sma_url', 'ijazah_sma', 'sma']],
  ['univ', ['univ_url', 'univ']],
  ['pasport', ['pasport_url', 'pasport']],
  ['mcu', ['mcu_url', 'mcu']],
  ['kontrak', ['kontrak_url', 'kontrak']],
  ['cert', ['cert_url', 'certificate_japan', 'cert']],
  ['ktp', ['ktp_url', 'ktp']],
  ['foto2', ['foto2_url', 'pas_foto_studio', 'foto2']],
  ['ijinortu', ['ijinortu_url', 'ijin_ortu', 'ijinortu']],
  ['cpmi', ['cpmi_url', 'cpmi']],
  ['kawin', ['kawin_url', 'buku_nikah', 'kawin']],
  ['sehat', ['sehat_url', 'surat_sehat', 'sehat']],
  ['bpjs', ['bpjs_url', 'bpjs']],
  ['psikotes', ['psikotes_url', 'psikotes']],
];

// Kolom sumber = KOLOM ASLI master_database_candidate (format JP) — kolom
// legacy (nama_ayah, no_pasport, nama_perusahaan, ...) TIDAK ada di tabel
// (diperiksa 2026-09-08); field legacy tanpa padanan (ttl_ayah/ttl_ibu/shacou/
// telppt/webpt/alamatpt) tidak punya kolom sama sekali → tidak di-prefill.
const BIO_COLUMNS: [string, string[]][] = [
  ['email', ['email']],
  ['tmplahir', ['tempat_lahir', 'tmplahir']],
  ['tgllahir', ['tgl_lahir', 'tgllahir']],
  ['alamat', ['alamat_lengkap', 'alamat']],
  ['ayah', ['keluarga_1_nama', 'nama_ayah', 'ayah']],
  ['pasport', ['no_paspor', 'no_pasport', 'pasport']],
  ['coe', ['no_coe', 'coe']],
  ['kotapasport', ['kota_terbit_pasport', 'kota_pasport', 'kotapasport']],
  ['tglpasport', ['tgl_terbit_pasport', 'tgl_pasport', 'tglpasport']],
  ['exppasport', ['exp_pasport', 'exppasport']],
  ['pt', ['pekerjaan_1_nama_perusahaan', 'nama_perusahaan', 'pt']],
  // Identitas: kolom yang SAMA juga dibaca dossier profil. Terukur 226
  // kandidat (2026-10-13): usia 32 · tb 44 · bb 46 · gender 2 hanya ada di
  // master, KOSONG di `database_candidate`.
  ['gender', ['gender']],
  ['usia', ['usia', 'umur']],
  ['tb', ['tb']],
  ['bb', ['bb']],
  // Foto profil. `database_candidate.pas_photo` KOSONG untuk kandidat yang
  // fotonya sudah diunggah — URL-nya hanya ada di master. Tanpa baris ini,
  // `bio` tidak pernah membawa foto sehingga modal admin selalu jatuh ke
  // inisial huruf nama (terukur ASJ00126, 2026-10-25).
  ['foto', ['pas_photo', 'pasphoto', 'foto']],
];

/**
 * `bio` yang boleh ditambal dari `ai_data_json.identitas`.
 *
 * Nilainya datang dari RPC `master_light(wa_list text[])` (migrasi 018), yang
 * melakukan cast `ai_data_json::jsonb -> 'identitas' ->> '<field>' DI DALAM
 * SQL — satu-satunya tempat cast itu bisa dilakukan. Proyeksi PostgREST TIDAK
 * bisa: kolomnya `text`, jadi JSON-path `->` di `select` menjawab **200 dengan
 * nilai null** (terukur 2026-10-20: 56 dari 234 baris punya `gender`/`umur`),
 * dan menulis `::jsonb` eksplisit dijawab 400 PGRST100. Sintalarlah: baris
 * master yang masih kosong lah yang ditambal; kalau RPC tidak ada, `db/master.ts`
 * jatuh ke proyeksi lama yang kini TANPA empat alias `ai_*` ini — jadi tanpa
 * RPC patch ini no-op, bukan pembawa null.
 * Terukur 2026-10-13: **21** kandidat punya `gender` HANYA di `ai_data_json`.
 */
const AI_BIO_FALLBACK: [string, string][] = [
  ['gender', 'ai_gender'],
  ['usia', 'ai_umur'],
  ['tb', 'ai_tb'],
  ['bb', 'ai_bb'],
];

/**
 * Susun `bio` dari baris master: kolom `BIO_COLUMNS`, lalu tambalan
 * `ai_data_json` untuk yang masih kosong. Urutannya SAMA dengan `makeV()` di
 * CV — baris (master) menang, AI hanya mengisi yang kosong.
 */
/**
 * Peringkat jenjang, dari yang TERENDAH ke TERTINGGI. Dipakai untuk memilih
 * ijazah terakhir dari slot `pendidikan_1..5_tingkat`; urutan regex penting
 * (S3 diperiksa sebelum SMA, dst.) karena `break` mengambil yang pertama cocok.
 */
const TINGKAT_RANK: [RegExp, number][] = [
  [/\bS3\b/, 7],
  [/\bS2\b/, 6],
  [/\bS1\b|SARJANA|UNIVERSITAS|\bUNIV\b/, 5],
  [/D3|D4|DIPLOMA/, 4],
  [/SMA|SMK|SLTA|PAKET\s*C/, 3],
  [/SMP|MTS|SLTP|PAKET\s*B/, 2],
  [/\bSD\b|\bMI\b|SEKOLAH DASAR|PAKET\s*A/, 1],
];

/** Jenjang tertinggi yang terisi, atau '' bila belum ada satu pun. */
function pendidikanTerakhir(mr: Record<string, unknown>): string {
  let best = '';
  let bestRank = 0;
  for (let i = 1; i <= 5; i++) {
    const v = toText(pick(mr, [`pendidikan_${i}_tingkat`]));
    if (!v || v === '-') continue;
    const u = v.toUpperCase();
    for (const [re, rank] of TINGKAT_RANK) {
      if (!re.test(u)) continue;
      if (rank > bestRank) { bestRank = rank; best = v; }
      break;
    }
  }
  return best;
}

export function buildBioFromMaster(mr: Record<string, any>): Record<string, string> {
  const bio: Record<string, string> = {};
  for (const [key, cols] of BIO_COLUMNS) {
    const v = pick(mr, cols);
    bio[key] = v && v !== '-' ? (DATE_BIO_KEYS.has(key) ? toDateOnly(v) : toText(v)) : '';
  }
  // Ijazah TERAKHIR, bukan yang pertama. `database_candidate.pendidikan` hanya
  // menyimpan SATU nilai, dan yang tersimpan justru yang TERENDAH — terukur
  // ASJ00126 (2026-10-25): kolom itu berisi "SD" padahal riwayatnya SD → SMP →
  // SMA/SMK, sehingga dossier mencetak "SD" untuk lulusan SMA. Slot
  // `pendidikan_N_tingkat` adalah kebenarannya, jadi turunkan dari situ.
  bio.pendidikan_terakhir = pendidikanTerakhir(mr);
  for (const [key, aiKey] of AI_BIO_FALLBACK) {
    if (!bio[key]) {
      // Sentinel `-` juga berarti kosong — kalau tidak, nilai AI yang kosong
      // menyalin `-` ke dossier (tertangkap tes sentinel di e2e).
      const ai = toText(pick(mr, [aiKey]));
      bio[key] = ai && ai !== '-' ? ai : '';
    }
  }
  return bio;
}

// Kunci `bio` yang berisi TANGGAL. `bio` dikonsumsi langsung oleh berkas
// unduhan biodata (`biodataExport`) DAN oleh prefill form (`PemberkasanModal`,
// `MasterFullForm`) — dua-duanya butuh `yyyy-mm-dd`, bukan cap waktu. Terukur
// 2026-10-12: kolom sumbernya (`master_database_candidate.tgl_lahir`) memuat 65
// cap waktu ISO, jadi tanpa normalisasi di sini baris "Tanggal Lahir" di berkas
// unduhan mencetak `2008-04-04T17:00:00.000Z` — sekaligus mundur satu hari.
const DATE_BIO_KEYS = new Set(['tgllahir', 'tglpasport', 'exppasport']);

// Tarik pemberkasan_checklist hanya untuk WA di daftar (fallback: null → scan).
async function fetchBerkasByWa(waList: string[]) {
  try {
    const rows = await supabaseJson('GET', 'pemberkasan_checklist', {
      query: { select: PEMBERKASAN_COLS, limit: '500', wa: 'in.(' + waList.join(',') + ')' },
    });
    return Array.isArray(rows) ? rows : null;
  } catch {
    return null;
  }
}

async function attachBerkasBio(candidates: any[]) {
  if (!Array.isArray(candidates) || candidates.length === 0) return candidates;
  try {
    // Filter server-side: tarik hanya baris yang WA-nya ada di daftar kandidat
    // (max 150 per panggilan), bukan scan 500 baris penuh tiap kali.
    const waList = [
      ...new Set(candidates.map((c) => normalizeWa(String(c.wa || ''))).filter(Boolean)),
    ];
    const useFilter = waList.length > 0 && waList.length <= 150;
    // Fase 3.18: berkas (pemberkasan_checklist) & bio (master) ditarik
    // PARALEL — independen, dulu berurutan (2 roundtrip serial di getAppData
    // admin & halaman kandidat). Kedua fetch sudah catch internal → aman.
    // Jalur ringan: master hanya butuh kolom BERKAS_COLUMNS/BIO_COLUMNS —
    // jangan bawa 154 kolom penuh (sebelumnya ±6,5 KB/baris per kandidat).
    let pRows = null;
    let mRows = null;
    if (useFilter) {
      const [p, m] = await Promise.all([fetchBerkasByWa(waList), fetchMasterLightByWa(waList)]);
      pRows = p;
      mRows = m;
    }
    // Fallback per-tabel: scan penuh (perilaku lama) kalau filter gagal — tetap
    // berproyeksi, supaya "fallback" tidak berarti "baca semua kolom".
    if (!Array.isArray(pRows)) {
      try {
        pRows = await supabaseJson('GET', 'pemberkasan_checklist', {
          query: { select: PEMBERKASAN_COLS, limit: 500 },
        });
      } catch {
        pRows = [];
      }
    }
    if (!Array.isArray(mRows)) {
      try {
        mRows = await supabaseJson('GET', 'master_database_candidate', {
          query: { select: MASTER_LIGHT_COLS, limit: 500 },
        });
      } catch {
        mRows = [];
      }
    }
    const pByWa = new Map();
    for (const r of Array.isArray(pRows) ? pRows : []) {
      pByWa.set(normalizeWa(String(r.wa || '')), r);
    }
    const mByWa = new Map();
    for (const r of Array.isArray(mRows) ? mRows : []) {
      mByWa.set(normalizeWa(String(pick(r, ['no_wa', 'wa', 'whatsapp']) || '')), r);
    }
    for (const c of candidates) {
      const want = normalizeWa(String(c.wa || ''));
      const pr = pByWa.get(want);
      const mr = mByWa.get(want);
      // Gabung pemberkasan_checklist + master (*_url) — master jadi fallback
      // untuk data lama yang belum pernah ditulis ke pemberkasan_checklist.
      const sources = [pr, mr].filter(Boolean);
      if (sources.length) {
        const berkas: Record<string, any> = {};
        for (const [key, cols] of BERKAS_COLUMNS) {
          let v = '';
          for (const src of sources) {
            for (const col of cols) {
              if (src[col]) {
                v = src[col];
                break;
              }
            }
            if (v) break;
          }
          berkas[key] = v && v !== '-' ? toText(v) : '';
        }
        c.berkas = berkas;
      } else {
        c.berkas = {};
      }
      if (mr) {
        c.bio = buildBioFromMaster(mr);
      } else {
        c.bio = {};
      }
    }
  } catch (_e) {
    // Non-fatal: tanpa berkas/bio dashboard tetap render (progres 0/x).
  }
  return candidates;
}

// Daftar file dalam folder Supabase Storage (bucket asj-files). Dipakai
// share-data untuk menampilkan dokumen folder master (KK/KTP/ijazah/dll),
// persis perilaku backend lama (produksi). Non-fatal: error → daftar kosong.
async function listStorageFolder(prefix: string) {
  if (!prefix) return [];
  try {
    const j = await storageRequest('POST', 'object/list/' + bucket(), {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prefix,
        limit: 200,
        sortBy: { column: 'name', order: 'asc' },
      }),
    });
    return Array.isArray(j)
      ? j.filter((f) => f && f.name && !String(f.name).endsWith('/')).map((f) => String(f.name))
      : [];
  } catch {
    return [];
  }
}

export { attachBerkasBio, listStorageFolder, BERKAS_COLUMNS, AI_BIO_FALLBACK };
