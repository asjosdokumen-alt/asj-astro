/**
 * contexts/master-data/service.ts — Business logic for master_database_candidate
 *
 * Other contexts and surfaces import ONLY from index.ts.
 */
import { findCandidateByWaFiltered, findCandidates } from '../../_lib/db/candidates';
import { candidateIdentityPatch } from '../../_lib/db/identity-sync';
import { MASTER_LIGHT_COLS, SYS_CONFIG_COLS } from '../../_lib/db/projections';
import { masterFolder } from '../../_lib/db/berkas';
import * as session from '../../_lib/session';
import { isOwnerOrAdmin } from '../identity';
import { syncBiodataKeMail } from '../applications';
import { nextCandidateId } from '../../_lib/candidate-helpers';
import { cacheClear } from '../../_lib/cache';
import { safeError } from '../../_lib/kernel/errors';
import { fieldsOf, guardPayload, ignored, text } from '../../_lib/kernel/guard';
import { resolveFileUrl } from '../../_lib/storage';
import {
  findMasterByWa, patchMaster, upsertMaster, findCandidateRow,
  normalizeWa as nw, pick, supabaseJson,
  toText, toDateOnly, normalizeBloodType, APPLY_WA_COLS,
} from './repository';

// --- Constants (moved from actions-master.ts) ---

const MASTER_FIELD_LABEL: Record<string, string> = {
  nama_lengkap: 'nama', furigana: 'furigana', namapanggilan: 'panggilan',
  panggilan_katakana: 'panggilan katakana', gender: 'gender', tempat_lahir: 'tempat lahir',
  tgl_lahir: 'tgl lahir', usia: 'usia', agama: 'agama', status_pernikahan: 'status nikah',
  jumlah_anak: 'anak', nik: 'KTP/NIK', driver_license: 'SIM', alamat_lengkap: 'alamat',
  email: 'email', tb: 'tinggi', bb: 'berat', no_pasport: 'paspor', no_coe: 'nomor COE',
  golongan_darah: 'golongan darah', tangandominan: 'tangan dominan', ukuranbaju: 'ukuran baju',
  ukuransepatu: 'ukuran sepatu', ukuran_topi: 'ukuran topi', tahan_ac: 'kerja di cuaca dingin',
  mata_kiri: 'mata kiri', mata_kanan: 'mata kanan', kacamata: 'kacamata',
  buta_warna: 'buta warna', tato: 'tato', tindik: 'tindik', merokok: 'merokok',
  minum_alkohol: 'alkohol', riwayat_penyakit: 'penyakit', alergi: 'alergi',
  riwayat_kecelakaan: 'kecelakaan', promosi_diri: 'promosi diri', kelebihan: 'kelebihan',
  kekurangan: 'kekurangan', keahlian_khusus: 'keahlian khusus',
  hobi_dan_keterampilan: 'hobi', alasan_memilih_bidang: 'alasan bidang',
  motivasi_ke_jepang: 'motivasi ke Jepang', keinginan_pribadi: 'keinginan',
  rencana_setelah_pulang: 'rencana pulang', tujuan_ke_jepang: 'tujuan ke Jepang',
  status_eks_jepang: 'status eks Jepang', kontak_darurat_nama: 'kontak darurat',
  kontak_darurat_hubungan: 'kontak darurat', kontak_darurat_wa: 'kontak darurat',
  kenalan_di_jepang_nama: 'kenalan di Jepang', kenalan_di_jepang_hubungan: 'kenalan di Jepang',
  kenalan_di_jepang_pekerjaan: 'kenalan di Jepang', kenalan_di_jepang_usia: 'kenalan di Jepang',
  kenalan_di_jepang_alamat: 'alamat kenalan di Jepang',
  harapan_gaji_yen: 'harapan gaji', harapan_tabungan: 'harapan tabungan',
  bahasa: 'bahasa Jepang', jft: 'JFT', bidangssw: 'SSW', ssw: 'SSW',
  tgl_terbit_pasport: 'tgl terbit paspor', exp_pasport: 'masa berlaku paspor',
  kota_terbit_pasport: 'kota terbit paspor',
};

const MASTER_FILE_COLUMNS: Record<string, string> = {
  photoFile: 'pas_photo', jftFile: 'jft_url', sswFile: 'ssw_url',
  ijazahSdFile: 'ijazah_sd_url', ijazahSmpFile: 'ijazah_smp_url',
  ijazahSmaFile: 'ijazah_sma_url', univFile: 'univ_url',
  ktpFile: 'ktp_url', kkFile: 'kk_url', cvFile: 'file_cv',
};

export const MASTER_COLUMN_MAP: Record<string, string> = {
  nama: 'nama_lengkap', furigana: 'furigana', panggilan: 'namapanggilan',
  panggilanKatakana: 'panggilan_katakana', gender: 'gender', tempatLahir: 'tempat_lahir',
  tglLahir: 'tgl_lahir', usia: 'usia', agama: 'agama', statusNikah: 'status_pernikahan',
  anak: 'jumlah_anak', ktp: 'nik', sim: 'driver_license', alamat: 'alamat_lengkap',
  email: 'email', tb: 'tb', bb: 'bb', goldar: 'golongan_darah', tangan: 'tangandominan',
  baju: 'ukuranbaju', sepatu: 'ukuransepatu', topi: 'ukuran_topi', tahanAc: 'tahan_ac',
  mataKiri: 'mata_kiri', mataKanan: 'mata_kanan', kacamata: 'kacamata',
  butaWarna: 'buta_warna', tato: 'tato', tindik: 'tindik', merokok: 'merokok',
  alkohol: 'minum_alkohol', penyakit: 'riwayat_penyakit', alergi: 'alergi',
  laka: 'riwayat_kecelakaan', promosi: 'promosi_diri', kelebihan: 'kelebihan',
  kekurangan: 'kekurangan', keahlianKhusus: 'keahlian_khusus',
  hobi: 'hobi_dan_keterampilan', alasanBidang: 'alasan_memilih_bidang',
  motivasiJepang: 'motivasi_ke_jepang', keinginan: 'keinginan_pribadi',
  rencanaPulang: 'rencana_setelah_pulang', tujuanJepang: 'tujuan_ke_jepang',
  eksJepang: 'status_eks_jepang', daruratNama: 'kontak_darurat_nama',
  daruratHubungan: 'kontak_darurat_hubungan', daruratWa: 'kontak_darurat_wa',
  kenalanNama: 'kenalan_di_jepang_nama', kenalanHubungan: 'kenalan_di_jepang_hubungan',
  kenalanPekerjaan: 'kenalan_di_jepang_pekerjaan', kenalanUsia: 'kenalan_di_jepang_usia',
  kenalanAlamat: 'kenalan_di_jepang_alamat',
  gajiYen: 'harapan_gaji_yen', tabungan: 'harapan_tabungan', bhsJepang: 'bahasa',
  nilai: 'jft', lisensi: 'bidangssw', ssw: 'ssw', noPaspor: 'no_paspor',
  // Lisensi SSW KEDUA. Tanpa baris ini Form Master mengumpulkan `lisensi2`,
  // mengirimnya, lalu `buildMasterBody` tidak punya tujuan — nilainya hilang
  // tanpa pesan. Kolomnya ada sejak migrasi 019.
  lisensi2: 'bidangssw2',
  tglTerbitPaspor: 'tgl_terbit_pasport', expPaspor: 'exp_pasport',
  kotaPaspor: 'kota_terbit_pasport', noCoe: 'no_coe',
  /* ── Migrasi 022: sel CV yang selama ini tidak punya sumber ───────────────
     Setiap baris di sini adalah pertanyaan yang DITANYAKAN Form Master dan
     dicetak salah satu dari empat form CV. Tanpa baris ini jawabannya masuk
     payload lalu dibuang tanpa pesan (`buildMasterBody` hanya menyalin kunci
     yang ada di peta). */
  lamaJepang: 'lama_di_jepang',
  visa: 'visa_jepang', negaraLain: 'negara_lain',
  jarakJakarta: 'jarak_jakarta_km', lamaPenerbangan: 'lama_penerbangan',
  rencanaSim: 'rencana_sim_bulan', wilayahSekolah: 'wilayah_sekolah',
  lamaBelajarJp: 'lama_belajar_jp', statusBelajarJp: 'status_belajar_jp',
  babBelajarJp: 'bab_belajar_jp', bhsInggris: 'level_bahasa_inggris',
  bahasaLain: 'bahasa_lain', levelJepang: 'level_bahasa_jepang',
  sertifikatLain: 'sertifikat_lain', catatanCv: 'catatan_cv',
  tesHitung: 'tes_hitung', tesPushup: 'tes_pushup', tesSquat: 'tes_squat',
  tinggalKursus: 'tinggal_kursus_tahun', olahraga: 'olahraga', mbti: 'mbti',
  kenalanStatusTinggal: 'kenalan_di_jepang_status_tinggal',
};

export const JP_TRANSLATE_MAP: Record<string, string> = {
  promosi: 'promosi_diri_jp', kelebihan: 'kelebihan_jp', kekurangan: 'kekurangan_jp',
  hobi: 'hobi_jp', keahlianKhusus: 'keahlian_khusus_jp', alasanBidang: 'alasan_memilih_bidang_jp',
  motivasiJepang: 'motivasi_ke_jepang_jp', keinginan: 'keinginan_pribadi_jp',
  rencanaPulang: 'rencana_setelah_pulang_jp', tujuanJepang: 'tujuan_ke_jepang_jp',
  penyakit: 'riwayat_medis_jp', alergi: 'alergi_jp', laka: 'riwayat_kecelakaan_jp',
  tempatLahir: 'tempat_lahir_jp', agama: 'agama_jp', alamat: 'alamat_jp',
  /* Status pernikahan punya kolom kanji (`status_pernikahan_jp`) dan CV cetak
     membacanya, tetapi jalur Form Master tidak pernah mengisinya — hanya CV AI
     yang mengirim pasangan JP-nya. Ditambahkan 2026-10-25 supaya kandidat yang
     mengisi lewat Form Master tidak menghasilkan CV dengan kolom kanji kosong. */
  statusNikah: 'status_pernikahan_jp',
};

const SNAKE_TO_CAMEL: Record<string, string> = {
  tempat_lahir: 'tempatLahir', tgl_lahir: 'tglLahir', alamat_lengkap: 'alamat',
  no_pasport: 'noPaspor', no_coe: 'noCoe', kota_pasport: 'kotaPaspor',
  tgl_pasport: 'tglTerbitPaspor', exp_pasport: 'expPaspor',
};

/* DULU: `MASTER_COLUMN_MISSING` — daftar tangan kolom yang "tidak ada di tabel".
   Daftar itu adalah pengganti skema, dan seperti setiap pengganti skema ia BASI:
   setelah migrasi 019 kolom-kolomnya ADA, tetapi daftar ini masih MENGHAPUS
   nilainya di `buildMasterBody` — jadi anggota keluarga ke-2..5 dan jurusan
   sekolah ke-1/2/4/5 tetap tidak pernah tersimpan, walau kolomnya sudah dibuat.
   Ia juga tidak pernah menangkap kolom BARU yang salah ejaan.

   Penggantinya bukan daftar lain, melainkan kontrak: `writeBodyFor()`
   (`_lib/db/client.ts`) sudah membuang setiap kolom yang tidak ada di
   `schema.generated.ts` dan mencatatnya sebagai drift. Satu sumber kebenaran,
   dan ia tidak bisa basi karena dihasilkan dari database. Lihat `patchMaster`. */

// --- Helper functions (moved from actions-master.ts) ---

function cleanKey(s: string): string {
  // `\p{L}\p{N}` = huruf & angka SEMUA aksara. Versi lama `[^a-z0-9]` membuang
  // kanji/kana, sehingga nama Jepang menghasilkan kunci KOSONG — dan
  // `mergeRiwayatArrays` menjatuhkan setiap baris berkunci kosong. Terukur
  // 2026-10-13 atas 234 baris master gdw: 5 kandidat kehilangan 8 anggota
  // keluarga; ASJ00094 RIO ARMANDA PUTRA 3 masuk -> 0 keluar. Kunci nama
  // ber-Latin tidak berubah, jadi pencocokan lama tetap sama.
  return String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

/**
 * Identitas pendidikan = NAMA sekolah saja, TANPA periode. Diukur atas 234 baris
 * master gdw (2026-10-12): memasukkan periode membuat 8 baris sekolahnya tampil
 * DUA KALI, karena baris master menulis `masuk` DAN `tahun_masuk` dengan nilai
 * yang sama sehingga periodenya jadi "2005200520112011" sementara baris
 * `ai_data_json` hanya "20052011" — kuncinya tak pernah cocok. Satu orang
 * menempuh satu sekolah SEKALI. (Pekerjaan TETAP memakai periode: dua masa kerja
 * di perusahaan yang sama itu nyata.)
 */
const EDU_PERIOD_KEYS: string[] = [];

/**
 * Peringkat jenjang dari sebuah label `tingkat` — untuk kunci cadangan saat
 * baris tidak punya nama sekolah.
 *
 * 🔴 Diukur 2026-10-21 (keluhan pemilik: "kenapa ini kok data dobel dobel
 * terus"). Dua baris tanpa nama sekolah, satu dari kolom master (`SMA/SMK`)
 * dan satu dari `ai_data_json` (`SMK`), adalah BARIS YANG SAMA — tetapi kunci
 * lamanya memakai ejaan mentah, jadi `t:smaskmk` ≠ `t:smk` dan dedupe
 * meloloskannya. Yang terlihat di form: dua baris kosong dengan tahun sama.
 *
 * Peringkatnya HARUS sama dengan `TINGKAT_ORDER` di `src/lib/helpers_cv.ts`
 * (fungsi `getTingkatVal`), karena kunci baca di backend dan kunci merge di
 * frontend harus menyebut baris yang sama. Salinan fisik ini mengikuti pola
 * `shared/wa-rules.ts` (dua salinan, satu aturan) — kalau salah satu diubah,
 * ubah keduanya.
 */
const TINGKAT_RANK = ([
  ['universitas', 4],
  ['smk', 3], ['sma', 3], ['ma', 3],
  ['smp', 2], ['mts', 2],
  ['sd', 1], ['mi', 1],
  ['d1', 4], ['d2', 4], ['d3', 4], ['d4', 4], ['s1', 4], ['s2', 4],
  ['lpk', 5],
] as Array<[string, number]>).sort((a, b) => b[0].length - a[0].length);

function tingkatToken(raw: string): string {
  const t = String(raw ?? '').toLowerCase().trim();
  if (!t) return '';
  for (const [token, rank] of TINGKAT_RANK) {
    if (new RegExp(`(^|[^a-z])${token}([^a-z]|$)`).test(t)) return `l:${rank}`;
  }
  return cleanKey(raw);
}

/**
 * Identitas satu baris riwayat.
 *
 * 🔴 NAMA dulu (sekolah / perusahaan / nama orang), baru tingkat/jabatan.
 *
 * Sebelumnya kuncinya `tingkat + sekolah` yang DISAMBUNG. Itu tidak pernah
 * menyatukan baris yang sama dari dua sumber, karena kedua sumber menulis
 * tingkat dengan ejaan berbeda: kolom master menyimpan `SMA/SMK` sementara
 * `ai_data_json` menyimpan `SMK` untuk sekolah yang SAMA. Hasilnya baris
 * kembar yang tidak bisa dibuang oleh dedupe — terukur pada AGUS KHOCI
 * (ASJ00040): 11 baris pendidikan untuk 4 sekolah, dan angka itu ikut ke
 * form master, rirekisho, DAN berkas unduhan biodata.
 *
 * Periode ikut masuk kunci supaya dua masa kerja di perusahaan yang sama tetap
 * dua baris; baris tanpa periode di kedua sisi tetap menyatu.
 */

function riwayatKey(
  e: Record<string, unknown> | null | undefined,
  nameKeys: string[],
  altKeys: string[],
  periodKeys: string[],
  altRank?: (raw: string) => string,
): string {
  const pickRaw = (keys: string[]): string => {
    for (const k of keys) {
      const v = e ? e[k] : undefined;
      if (v !== undefined && v !== null && String(v).trim() !== '') return String(v);
    }
    return '';
  };
  const pick = (keys: string[]): string => cleanKey(pickRaw(keys));
  const name = pick(nameKeys);
  // `altRank` menormalkan cadangan (mis. "SMA/SMK" vs "SMK" → peringkat yang
  // sama). Tanpa itu dua ejaan satu jenjang menghasilkan dua kunci.
  const altRaw = pickRaw(altKeys);
  const alt = altRank ? altRank(altRaw) : cleanKey(altRaw);
  // Periode: SATU nilai per slot (dedupe + buang yang kosong). Baris master
  // menulis `masuk` DAN `tahun_masuk` dengan nilai yang sama, jadi menjumlahkan
  // semua kunci menghasilkan "20232023" sementara baris `ai_data_json` hanya
  // "2023" — kuncinya tak pernah cocok. Pendidikan memakai `EDU_PERIOD_KEYS`
  // (tanpa periode sama sekali); alasan terukurnya ada di sana.
  const period = [...new Set(periodKeys.map((k) => pick([k])).filter(Boolean))].join('');
  return (name ? 's:' + name : 't:' + alt) + '|' + period;
}

function entryHasAny(entry: any, keys: string[]): boolean {
  return keys.some((k) => { const val = entry[k]; return val !== undefined && val !== null && String(val).trim() !== '' && String(val).trim() !== '-'; });
}

/**
 * Kunci identitas satu anggota keluarga: NAMA + HUBUNGAN.
 *
 * Ketiga titik WAJIB memakai kunci yang sama — `buildMasterNested` (baca),
 * `pruneAiRiwayat` (pangkas) dan `mergeAiOverflow` (simpan); docblock
 * `pruneAiRiwayat` sudah mensyaratkannya, karena kunci yang berbeda membuat
 * penyimpanan menganggap baris lama sebagai baris baru. Sebelum 2026-10-13
 * pembacaan memakai `cleanKey(nama)` SAJA sementara dua jalur tulis memakai
 * `cleanKey(nama + hubungan)`, jadi kunci baca dan kunci tulis tidak pernah
 * bertemu — baris yang masih ada justru ikut terbuang.
 */
function keluargaKey(e: Record<string, unknown>): string {
  return cleanKey(String(e.nama ?? '') + String(e.hubungan ?? ''));
}

function mergeRiwayatArrays(columns: any[], aiArr: any[] | null, keyFn: (e: any) => string): any[] {
  const seen = new Set(); const out: any[] = [];
  const lists: any[] = ([] as any[]).concat(Array.isArray(columns) ? columns : [], Array.isArray(aiArr) ? aiArr : []);
  for (const e of lists) {
    if (!e || typeof e !== 'object') continue;
    const k = keyFn(e);
    // Kunci KOSONG berarti "baris ini tidak punya identitas", BUKAN "baris ini
    // tidak sah". Menjatuhkannya membuang data nyata: terukur 2026-10-13, 8
    // anggota keluarga ber-nama kanji hilang dari 5 kandidat. Dedupe hanya
    // dijalankan bila kuncinya benar-benar ada.
    if (k) { if (seen.has(k)) continue; seen.add(k); }
    out.push(e);
  }
  return out;
}

export function buildMasterNested(row: any): any {
  const v = (col: string, fallback = '') => {
    const x = row[col]; return x !== undefined && x !== null && x !== '' ? toText(x) : fallback !== undefined ? fallback : '';
  };
  // Kolom tanggal memakai bentuk baku `yyyy-mm-dd` (lihat `toDateOnly` di
  // `_lib/db/client.ts`). Tanpa ini blok DATA MASTER di berkas unduhan biodata
  // mencetak `2008-04-04T17:00:00.000Z` — cap waktu `timestamptz` yang sekaligus
  // mundur satu hari dari tanggal yang dimaksud (2008-04-05 WIB).
  const vd = (col: string) => toDateOnly(row[col]);
  let aiParsed: any = null;
  try { const raw = row.ai_data_json; if (typeof raw === 'string' && raw.trim() && raw !== '-') aiParsed = JSON.parse(raw); } catch { aiParsed = null; }
  const aiArrOf = (key: string) => (aiParsed && Array.isArray(aiParsed[key]) ? aiParsed[key] : null);
  const aiW = aiParsed?.wawancara || {};
  /* KOLOM MENANG; AI hanya MENGISI yang kosong (dikoreksi pemilik 2026-10-22).
   *
   * Versi sebelumnya membalikkannya ("AI menang", `903ceef`) dengan alasan
   * kandidat hampir selalu mengisi lewat CV AI. Alasan itu hilang setelah jalur
   * simpan CV AI ikut menulis kolom (`masterColumnsFromAi`). Arah yang benar
   * menurut pemilik: *"kolom yang bisa manual itu kebenaran mutlak; data AI
   * cuma membantu mengisi kolom"* — jadi AI TIDAK boleh menimpa koreksi admin.
   *
   * Konsekuensi yang diinginkan: `ai_data_json` boleh DIHAPUS. Kalau kolomnya
   * lengkap, membuang JSON tidak mengubah berkas yang dihasilkan. */
  const vw = (col: string, ...aiKeys: string[]) => {
    if (col) {
      const c = v(col);
      if (c !== '') return c;
    }
    for (const k of aiKeys) {
      const a = aiW[k];
      if (a !== undefined && a !== null && String(a).trim() !== '') return toText(a);
    }
    return '';
  };
  /* ── Fisik & medis: LUBANG YANG TERUKUR (2026-10-22) ────────────────────────
     `vw` di atas hanya menutup blok WAWANCARA. Blok fisik/medis tetap membaca
     KOLOM saja, padahal kandidat jalur CV AI tidak pernah menulis kolom itu —
     `_lib/ai/cv.ts` hanya menyimpan `ai_data_json`. Diukur lewat REST atas 56
     baris ber-`ai_data_json`:

       medis.mata_kiri   kolom kosong 39 · AI punya nilai 23 ⇒ 23 hilang
       golongan_darah    kolom kosong 32 · AI punya nilai 22 ⇒ 22 hilang
       fisik.topi        kolom kosong 42 · AI punya nilai  9 ⇒  9 hilang

     Artinya rirekisho/CV-template/biodata kandidat tersebut tercetak dengan
     mata, golongan darah, dan ukuran kepala KOSONG. Prioritasnya sama dengan
     `vw`: KOLOM menang, AI hanya mengisi yang kosong (dikoreksi pemilik
     2026-10-22 — lihat catatan di `vw`).

     ⚠ Klaim lama "identitas 0 hilang" SALAH dan sudah dikoreksi: saat itu hanya
     `nama_lengkap` yang diperiksa (satu-satunya kolom identitas yang ditulis
     eksplisit saat INSERT). Pengukuran penuh menemukan 687 sel hilang di 56
     baris, termasuk `namapanggilan` 25 dan `jumlah_anak` 25 — dan sekarang
     kolomnya diisi di jalur TULIS (`masterColumnsFromAi`), bukan dibaca dari
     sini. Blok ini tetap ada sebagai jaring untuk baris LAMA yang kolomnya
     masih kosong. */
  const aiGroup = (g: string): Record<string, unknown> => {
    const grp = aiParsed?.[g];
    return grp && typeof grp === 'object' ? (grp as Record<string, unknown>) : {};
  };
  const aiF = aiGroup('fisik');
  const aiM = aiGroup('medis');
  const aiI = aiGroup('identitas');
  const va = (aiObj: Record<string, unknown>, aiKeys: string[], col: string) => {
    // Kolom dulu — kebenaran mutlak; AI hanya mengisi yang kosong.
    if (col) {
      const c = v(col);
      if (c !== '') return c;
    }
    for (const k of aiKeys) {
      const a = aiObj[k];
      if (a !== undefined && a !== null && String(a).trim() !== '') return toText(a);
    }
    return '';
  };
  return {
    identitas: {
      nama_lengkap: v('nama_lengkap'), katakana: v('furigana'), panggilan: v('namapanggilan'),
      panggilan_katakana: v('panggilan_katakana'), tempat_lahir: v('tempat_lahir'),
      tempat_lahir_jp: v('tempat_lahir_jp'), tgl_lahir: vd('tgl_lahir'), umur: v('usia'),
      gender: v('gender'), agama: v('agama'), agama_jp: v('agama_jp'),
      /* Golongan darah: `"AB +"` (baris nyata ASJ00171) dirapikan jadi `AB+` supaya
         cocok dengan opsi dropdown mana pun — tanpa ini `<select>`-nya tampil kosong.
         Normalisasi berlaku untuk nilai dari AI MAUPUN dari kolom. */
      golongan_darah: normalizeBloodType(va(aiI, ['golongan_darah'], 'golongan_darah')), status_nikah: v('status_pernikahan'),
      status_pernikahan_jp: v('status_pernikahan_jp'), anak: v('jumlah_anak'),
      email: v('email'), alamat: v('alamat_lengkap'), alamat_jp: v('alamat_jp'),
      hp: v('no_wa'), hp_darurat: v('kontak_darurat_wa'), ktp: v('nik'),
      paspor: v('no_paspor'), sim: v('driver_license'), status_eks_jepang: v('status_eks_jepang'),
      no_coe: v('no_coe'), tgl_terbit_paspor: vd('tgl_terbit_pasport'),
      exp_paspor: vd('exp_pasport'), kota_terbit_paspor: v('kota_terbit_pasport'),
      kontak_darurat_nama: v('kontak_darurat_nama'), kontak_darurat_hubungan: v('kontak_darurat_hubungan'),
      /* Perjalanan & identitas tambahan (migrasi 022). Dibaca dari KOLOM saja —
         tidak ada padanan di `ai_data_json` lama, karena field ini baru
         ditanyakan sejak 2026-10-27. */
      visa_jepang: v('visa_jepang'), negara_lain: v('negara_lain'),
      jarak_jakarta_km: v('jarak_jakarta_km'), lama_penerbangan: v('lama_penerbangan'),
      rencana_sim_bulan: v('rencana_sim_bulan'), wilayah_sekolah: v('wilayah_sekolah'),
    },
    fisik: { tb: va(aiF, ['tb'], 'tb'), bb: va(aiF, ['bb'], 'bb'),
      topi: va(aiF, ['topi'], 'ukuran_topi'), baju: va(aiF, ['baju'], 'ukuranbaju'),
      sepatu: va(aiF, ['sepatu'], 'ukuransepatu'),
      tangan_dominan: va(aiF, ['tangan_dominan'], 'tangandominan'),
      tahan_ac: va(aiF, ['tahan_ac'], 'tahan_ac'),
      /* Tes & kebiasaan fisik (migrasi 022) — dipakai form KINKI (計算テスト,
         体力試験, 集団生活年数, スポーツ). */
      tes_hitung: va(aiF, ['tes_hitung'], 'tes_hitung'),
      tes_pushup: va(aiF, ['tes_pushup'], 'tes_pushup'),
      tes_squat: va(aiF, ['tes_squat'], 'tes_squat'),
      tinggal_kursus_tahun: va(aiF, ['tinggal_kursus_tahun'], 'tinggal_kursus_tahun'),
      olahraga: va(aiF, ['olahraga'], 'olahraga') },
    medis: { mata_kiri: va(aiM, ['mata_kiri'], 'mata_kiri'),
      mata_kanan: va(aiM, ['mata_kanan'], 'mata_kanan'),
      kacamata: va(aiM, ['kacamata'], 'kacamata'),
      buta_warna: va(aiM, ['buta_warna'], 'buta_warna'), tato: va(aiM, ['tato'], 'tato'),
      tindik: v('tindik'), rokok: va(aiM, ['rokok'], 'merokok'),
      alkohol: va(aiM, ['alkohol'], 'minum_alkohol'),
      alergi_id: va(aiM, ['alergi_id', 'alergi'], 'alergi'), alergi_jp: va(aiM, ['alergi_jp'], 'alergi_jp'),
      riwayat_medis_id: va(aiM, ['riwayat_medis_id', 'riwayat_penyakit'], 'riwayat_penyakit'),
      riwayat_medis_jp: va(aiM, ['riwayat_medis_jp'], 'riwayat_medis_jp'),
      riwayat_kecelakaan_id: va(aiM, ['riwayat_kecelakaan_id', 'riwayat_kecelakaan'], 'riwayat_kecelakaan'),
      riwayat_kecelakaan_jp: va(aiM, ['riwayat_kecelakaan_jp'], 'riwayat_kecelakaan_jp') },
    wawancara: {
      keinginan_id: vw('keinginan_pribadi', 'keinginan_pribadi'),
      keinginan_jp: vw('keinginan_pribadi_jp', 'keinginan_pribadi_jp'),
      tujuan_ke_jepang: vw('tujuan_ke_jepang', 'tujuan_ke_jepang'),
      tujuan_ke_jepang_jp: vw('tujuan_ke_jepang_jp', 'tujuan_ke_jepang_jp'),
      riwayat_jepang: vw('status_eks_jepang', 'riwayat_jepang'),
      promosi_id: vw('promosi_diri', 'promosi_id'),
      promosi_jp: vw('promosi_diri_jp', 'promosi_jp'),
      kelebihan_id: vw('kelebihan', 'kelebihan_id'),
      kelebihan_jp: vw('kelebihan_jp', 'kelebihan_jp'),
      kekurangan_id: vw('kekurangan', 'kekurangan_id'),
      kekurangan_jp: vw('kekurangan_jp', 'kekurangan_jp'),
      hobi_id: vw('hobi_dan_keterampilan', 'hobi_id'),
      hobi_jp: vw('hobi_jp', 'hobi_jp'),
      keahlian_khusus: vw('keahlian_khusus', 'keahlian_khusus'),
      keahlian_khusus_jp: vw('keahlian_khusus_jp', 'keahlian_khusus_jp'),
      motivasi_ke_jepang: vw('motivasi_ke_jepang', 'motivasi_ke_jepang'),
      motivasi_ke_jepang_jp: vw('motivasi_ke_jepang_jp', 'motivasi_ke_jepang_jp'),
      alasan_memilih_bidang: vw('alasan_memilih_bidang', 'alasan_memilih_bidang'),
      alasan_memilih_bidang_jp: vw('alasan_memilih_bidang_jp', 'alasan_memilih_bidang_jp'),
      rencana_setelah_pulang: vw('rencana_setelah_pulang', 'rencana_setelah_pulang'),
      rencana_setelah_pulang_jp: vw('rencana_setelah_pulang_jp', 'rencana_setelah_pulang_jp'),
      rencana_pulang_id: vw('rencana_setelah_pulang', 'rencana_setelah_pulang'),
      rencana_pulang_jp: vw('rencana_setelah_pulang_jp', 'rencana_setelah_pulang_jp'),
      gaji_yen: vw('harapan_gaji_yen', 'gaji_yen'),
      tabungan: vw('harapan_tabungan', 'tabungan'),
      /* `lama_di_jepang` akhirnya punya kolom (migrasi 022). Sebelumnya hanya
         hidup di `ai_data_json`, jadi kandidat jalur Form Master tidak punya
         tempat menyimpannya dan JIPA `E55` (在日期間) selalu kosong.
         JANGAN dicampur `lamakerjadiharapkan` — itu lama KERJA yang diharapkan. */
      lama_di_jepang: vw('lama_di_jepang', 'lama_di_jepang'),
      /* Lama KERJA yang diharapkan (KINKI `X47` 就業希望年数). Kolomnya ada
         sejak lama (9 baris terisi) tetapi 0 rujukan kode — "yatim" menurut
         audit 2026-10-25. JANGAN dicampur `lama_di_jepang`. */
      lamakerja_diharapkan: v('lamakerjadiharapkan'),
      mbti: v('mbti'),
    },
    sertifikasi: { bahasa: v('bahasa'), jft: v('jft'), ssw: v('ssw'),
      bidang: v('bidangssw') || v('bidang'), bahasa_jepang: v('jft'), nilai: v('jft'), lisensi: v('ssw'),
      /* Bahasa & sertifikat tambahan (migrasi 022). */
      lama_belajar_jp: v('lama_belajar_jp'), status_belajar_jp: v('status_belajar_jp'),
      bab_belajar_jp: v('bab_belajar_jp'), level_bahasa_inggris: v('level_bahasa_inggris'),
      bahasa_lain: v('bahasa_lain'), level_bahasa_jepang: v('level_bahasa_jepang'),
      sertifikat_lain: v('sertifikat_lain'), catatan_cv: v('catatan_cv') },
    pendidikan: (function () {
      const arr: any[] = [];
      for (let i = 1; i <= 5; i++) {
        const tingkat = row['pendidikan_' + i + '_tingkat'];
        if (tingkat === undefined || tingkat === null) continue;
        arr.push({ tingkat: toText(tingkat), sekolah: v('pendidikan_' + i + '_nama_sekolah'),
          nama_sekolah: v('pendidikan_' + i + '_nama_sekolah'), sekolah_jp: v('pendidikan_' + i + '_sekolah_jp'),
          jurusan_id: v('pendidikan_' + i + '_jurusan_id'), jurusan: v('pendidikan_' + i + '_jurusan_id'),
          jurusan_jp: v('pendidikan_' + i + '_jurusan_jp'), masuk: v('pendidikan_' + i + '_tahun_masuk'),
          tahun_masuk: v('pendidikan_' + i + '_tahun_masuk'), lulus: v('pendidikan_' + i + '_tahun_lulus'),
          tahun_lulus: v('pendidikan_' + i + '_tahun_lulus') });
      }
      return mergeRiwayatArrays(arr.filter((e) => entryHasAny(e, ['tingkat', 'sekolah', 'nama_sekolah', 'jurusan_id', 'jurusan', 'masuk', 'lulus'])),
        aiArrOf('pendidikan'), (e) => riwayatKey(e,
          ['sekolah', 'sekolah_id', 'nama_sekolah', 'namaSekolah'], ['tingkat'],
          EDU_PERIOD_KEYS, tingkatToken));
    })(),
    pekerjaan: (function () {
      const arr: any[] = [];
      for (let i = 1; i <= 3; i++) {
        const nm = row['pekerjaan_' + i + '_nama_perusahaan'];
        if (nm === undefined || nm === null) continue;
        arr.push({ perusahaan: toText(nm), nama_perusahaan: toText(nm),
          perusahaan_jp: v('pekerjaan_' + i + '_perusahaan_jp'), jabatan: v('pekerjaan_' + i + '_jabatan'),
          jabatan_jp: v('pekerjaan_' + i + '_jabatan_jp'), masuk: v('pekerjaan_' + i + '_tahun_masuk'),
          tahun_masuk: v('pekerjaan_' + i + '_tahun_masuk'), keluar: v('pekerjaan_' + i + '_tahun_keluar'),
          tahun_keluar: v('pekerjaan_' + i + '_tahun_keluar'), gaji: v('pekerjaan_' + i + '_gaji'),
          /* Migrasi 022: 雇用形態 / 業種 / 備考 — dicetak KINKI, Firma, JIPA. */
          jenis: v(`pekerjaan_${i}_jenis`), bidang: v(`pekerjaan_${i}_bidang`),
          catatan: v(`pekerjaan_${i}_catatan`) });
      }
      return mergeRiwayatArrays(arr.filter((e) => entryHasAny(e, ['perusahaan', 'nama_perusahaan', 'jabatan', 'masuk', 'keluar'])),
        aiArrOf('pekerjaan'), (e) => riwayatKey(e,
          ['perusahaan', 'perusahaan_id', 'nama_perusahaan', 'namaPt'], ['jabatan', 'jabatan_id'],
          ['masuk', 'tahun_masuk', 'keluar', 'tahun_keluar']));
    })(),
    keluarga: (function () {
      const arr: any[] = [];
      for (let i = 1; i <= 5; i++) {
        const nm = row['keluarga_' + i + '_nama'];
        if (nm === undefined || nm === null) continue;
        arr.push({ nama: toText(nm), umur: v('keluarga_' + i + '_usia'), usia: v('keluarga_' + i + '_usia'),
          hubungan: v('keluarga_' + i + '_hubungan'), hubungan_jp: v('keluarga_' + i + '_hubungan_jp'),
          pekerjaan: v('keluarga_' + i + '_pekerjaan'), pekerjaan_jp: v('keluarga_' + i + '_pekerjaan_jp'),
          /* `gaji` sudah lama ditulis `buildRiwayatSlots` tetapi TIDAK pernah
             dibaca di sini — jadi 月収 keluarga kosong di ketiga form yang
             mencetaknya. Dua kolom lain menyusul di migrasi 022. */
          gaji: v(`keluarga_${i}_gaji`),
          tinggal: v(`keluarga_${i}_tinggal`), hp: v(`keluarga_${i}_hp`) });
      }
      return mergeRiwayatArrays(arr.filter((e) => entryHasAny(e, ['nama', 'hubungan', 'umur', 'usia', 'pekerjaan'])),
        aiArrOf('keluarga'), keluargaKey);
    })(),
    kenalan_jepang: (function () {
      const aiK = (aiParsed && aiParsed.kenalan_jepang) || {};
      const src = (col: string, aiKey: string) => { const c = v(col); const a = aiK[aiKey]; return c !== '' ? c : a !== undefined && a !== null ? toText(a) : ''; };
      return { nama_id: src('kenalan_di_jepang_nama', 'nama_id'), nama_jp: src('kenalan_di_jepang_nama_jp', 'nama_jp'),
        hubungan_id: src('kenalan_di_jepang_hubungan', 'hubungan_id'), hubungan_jp: src('kenalan_di_jepang_hubungan_jp', 'hubungan_jp'),
        pekerjaan_id: src('kenalan_di_jepang_pekerjaan', 'pekerjaan_id'), pekerjaan_jp: src('kenalan_di_jepang_pekerjaan_jp', 'pekerjaan_jp'),
        usia: src('kenalan_di_jepang_usia', 'usia'), alamat_id: src('kenalan_di_jepang_alamat', 'alamat_id'),
        alamat_jp: src('kenalan_di_jepang_alamat_jp', 'alamat_jp'),
        /* 在留資格(在留期間) — JIPA `J43`. Kolomnya baru ada di migrasi 022. */
        status_tinggal: src('kenalan_di_jepang_status_tinggal', 'status_tinggal') };
    })(),
    uploads: { photo: row.pas_photo || '', cv: row.file_cv || '', jft: row.jft_url || '',
      ssw: row.ssw_url || '', ktp: row.ktp_url || '', kk: row.kk_url || '',
      ijazahSd: row.ijazah_sd_url || '', ijazahSmp: row.ijazah_smp_url || '',
      ijazahSma: row.ijazah_sma_url || '', univ: row.univ_url || '',
      sim: row.driver_license_url || row.sim_url || '', cert: row.cert_url || '' },
  };
}

function buildAiOverflow(d: any): Record<string, unknown> | null {
  const set = (obj: any, k: string, v: any) => { if (v !== undefined && v !== null && String(v).trim() !== '') obj[k] = String(v).trim(); };
  const out: Record<string, unknown> = {};
  const ken: Record<string, unknown> = {};
  set(ken, 'nama_id', d.kenalanNama); set(ken, 'hubungan_id', d.kenalanHubungan);
  set(ken, 'pekerjaan_id', d.kenalanPekerjaan); set(ken, 'usia', d.kenalanUsia);
  set(ken, 'alamat_id', d.kenalanAlamat);
  if (Object.keys(ken).length) out.kenalan_jepang = ken;
  const pend: any[] = [];
  if (Array.isArray(d.pendidikan)) {
    for (let i = 0; i < 5; i++) {
      if (i === 2) continue;
      const p = d.pendidikan[i] || {};
      const jur = p.jurusan !== undefined ? p.jurusan : p.jurusan_id;
      if (jur === undefined || jur === null || String(jur).trim() === '') continue;
      const e: Record<string, unknown> = {};
      set(e, 'tingkat', p.tingkat); set(e, 'sekolah', p.nama_sekolah || p.namaSekolah || p.sekolah);
      set(e, 'jurusan_id', jur); pend.push({ slot: i, entry: e });
    }
  }
  if (pend.length) out.pendidikan = pend;
  const pek: any[] = [];
  if (Array.isArray(d.pekerjaan)) {
    for (let i = 1; i < 3; i++) {
      const p = d.pekerjaan[i] || {};
      const gaji = p.gaji !== undefined ? p.gaji : p.pendapatan;
      if (gaji === undefined || gaji === null || String(gaji).trim() === '') continue;
      const e: Record<string, unknown> = {};
      set(e, 'perusahaan', p.nama_perusahaan || p.namaPt || p.perusahaan); set(e, 'gaji', gaji);
      pek.push({ slot: i, entry: e });
    }
  }
  if (pek.length) out.pekerjaan = pek;
  const kel: any[] = [];
  if (Array.isArray(d.keluarga)) {
    for (let i = 0; i < 5; i++) {
      const p = d.keluarga[i] || {};
      const e: Record<string, unknown> = {};
      set(e, 'nama', p.nama); set(e, 'umur', p.usia !== undefined ? p.usia : p.umur);
      set(e, 'usia', p.usia !== undefined ? p.usia : p.umur); set(e, 'hubungan', p.hubungan);
      set(e, 'pekerjaan', p.pekerjaan); set(e, 'gaji', p.gaji !== undefined ? p.gaji : p.pendapatan);
      if (i === 0) { delete e.nama; delete e.umur; delete e.usia; delete e.hubungan; delete e.pekerjaan; }
      if (Object.keys(e).length) kel.push({ slot: i, entry: e });
    }
  }
  if (kel.length) out.keluarga = kel;
  const waw: Record<string, unknown> = {};
  set(waw, 'lama_di_jepang', d.lamaJepang);
  if (Object.keys(waw).length) out.wawancara = waw;
  return Object.keys(out).length ? out : null;
}

/**
 * Buang entri riwayat di `ai_data_json` yang sudah TIDAK ADA lagi di payload.
 *
 * `mergeAiOverflow` hanya menambah/memperbarui — tidak pernah menghapus. Jadi
 * baris yang dihapus pengguna tetap tinggal di `ai_data_json`, dan
 * `buildMasterNested` menggabungkan kolom slot dengan array itu saat MEMBACA
 * ⇒ baris yang dihapus muncul kembali di form. Ini separuh KEDUA dari "hapus
 * tidak berlaku"; separuh pertama adalah kolom slot yang tidak pernah
 * dikosongkan (`setSlots`).
 *
 * HANYA boleh dipanggil kalau pemanggil menyatakan daftarnya lengkap
 * (`riwayatLengkap === true`). Tanpa jaminan itu, "tidak ada di payload" tidak
 * berarti "sudah dihapus" — bisa saja cuma tidak ikut terkirim (mis. hasil
 * ekstraksi AI yang parsial), dan memangkasnya = menghapus data kandidat.
 *
 * Kunci barisnya WAJIB sama dengan `buildMasterNested` dan `mergeAiOverflow`:
 * kalau berbeda, yang terbuang justru baris yang masih ada.
 */
export function pruneAiRiwayat(ai: Record<string, unknown>, d: Record<string, unknown>): Record<string, unknown> {
  const lists: Array<{ key: string; keyOf: (e: Record<string, unknown>) => string }> = [
    { key: 'pendidikan', keyOf: (e) => riwayatKey(e, ['sekolah', 'sekolah_id', 'nama_sekolah', 'namaSekolah'], ['tingkat'], EDU_PERIOD_KEYS, tingkatToken) },
    { key: 'pekerjaan', keyOf: (e) => riwayatKey(e, ['perusahaan', 'perusahaan_id', 'nama_perusahaan', 'namaPt'], ['jabatan', 'jabatan_id'], ['masuk', 'tahun_masuk', 'keluar', 'tahun_keluar']) },
    { key: 'keluarga', keyOf: keluargaKey },
  ];
  for (const { key, keyOf } of lists) {
    const cur = ai[key];
    if (!Array.isArray(cur)) continue;
    const payload = d[key];
    // Payload tidak memuat daftar ini ⇒ jangan sentuh; bukan berarti kosong.
    if (!Array.isArray(payload)) continue;
    const hidup = new Set<string>();
    for (const e of payload) { const k = keyOf((e || {}) as Record<string, unknown>); if (k) hidup.add(k); }
    const sisa = cur.filter((e) => e && typeof e === 'object' && hidup.has(keyOf(e as Record<string, unknown>)));
    if (sisa.length) ai[key] = sisa;
    else delete ai[key];
  }
  return ai;
}

function mergeAiOverflow(ai: any, overflow: any): any {
  ai = ai && typeof ai === 'object' ? ai : {};
  const mergeObj = (base: any, patch: any) => { base = base && typeof base === 'object' ? base : {}; for (const [k, val] of Object.entries(patch || {})) { if (val !== undefined && val !== null && String(val).trim() !== '') base[k] = val; } return base; };
  const setSlot = (listKey: string, patchList: any[], keyOf: (e: any) => string) => {
    if (!Array.isArray(patchList) || !patchList.length) return;
    if (!Array.isArray(ai[listKey])) ai[listKey] = [];
    const arr = ai[listKey];
    for (const { slot, entry } of patchList) {
      const idx = arr.findIndex((e: any) => e && typeof e === 'object' && keyOf(e) === keyOf(entry));
      if (idx === -1) { while (arr.length <= slot) arr.push({}); mergeObj(arr[slot], entry); } else { mergeObj(arr[idx], entry); }
    }
  };
  if (overflow.kenalan_jepang) ai.kenalan_jepang = mergeObj(ai.kenalan_jepang, overflow.kenalan_jepang);
  if (overflow.wawancara) ai.wawancara = mergeObj(ai.wawancara, overflow.wawancara);
  // Kunci yang SAMA dengan `buildMasterNested` — kalau keduanya berbeda,
  // menyimpan menemukan "baris baru" untuk baris yang sebenarnya sudah ada dan
  // menambahkannya lagi, yaitu persis kebocoran yang membuat baris riwayat
  // berlipat.
  if (overflow.pendidikan) setSlot('pendidikan', overflow.pendidikan, (e) => riwayatKey(e,
    ['sekolah', 'sekolah_id', 'nama_sekolah', 'namaSekolah'], ['tingkat'],
    EDU_PERIOD_KEYS, tingkatToken));
  if (overflow.pekerjaan) setSlot('pekerjaan', overflow.pekerjaan, (e) => riwayatKey(e,
    ['perusahaan', 'perusahaan_id', 'nama_perusahaan', 'namaPt'], ['jabatan', 'jabatan_id'],
    ['masuk', 'tahun_masuk', 'keluar', 'tahun_keluar']));
  if (overflow.keluarga) setSlot('keluarga', overflow.keluarga, keluargaKey);
  return ai;
}

/**
 * Kolom slot riwayat (`pendidikan_*` / `pekerjaan_*` / `keluarga_*`) dari daftar baris.
 *
 * Dipakai DUA jalur simpan yang menulis baris master yang SAMA: form master
 * (`buildMasterBody`) dan form CV AI (`_lib/ai/cv.ts`). Keduanya WAJIB memakai
 * fungsi ini. Kalau salah satunya tidak menulis kolom slot, nilai LAMA di kolom
 * itu tetap tinggal, dan `buildMasterNested` menggabungkannya kembali dengan
 * `ai_data_json` saat MEMBACA ⇒ baris yang sudah dihapus muncul lagi. Itu persis
 * keluhan "sudah saya hapus, kok balik lagi di DB".
 *
 * `lengkap` = daftar ini DAFTAR LENGKAP baris yang tersisa. Hanya kalau itu
 * benar, slot yang tidak terisi boleh dikosongkan. Pemanggil yang mengirim daftar
 * parsial (mis. hasil ekstraksi AI di AdminAiCopilot) tidak boleh mengosongkan
 * apa pun — "tidak ikut terkirim" bukan berarti "sudah dihapus".
 */
export function buildRiwayatSlots(d: Record<string, unknown>, lengkap: boolean): Record<string, string> {
  const out: Record<string, string> = {};
  const pickItem = (p: Record<string, unknown>, ...keys: string[]): unknown => { for (const k of keys) { const v = p[k]; if (v !== undefined && v !== null) return v; } return ''; };
  const setSlots = (prefix: string, list: unknown, count: number, defs: ReadonlyArray<readonly [string, ...string[]]>) => {
    if (!Array.isArray(list)) return;
    for (let i = 0; i < count; i++) {
      const p = (list[i] || {}) as Record<string, unknown>;
      const vals: Record<string, string> = {};
      for (const [suffix, ...pickKeys] of defs) {
        const v = String(pickItem(p, ...pickKeys));
        if (v !== '') vals[prefix + (i + 1) + suffix] = v;
      }
      if (!Object.keys(vals).length) {
        if (lengkap) for (const [suffix] of defs) out[prefix + (i + 1) + suffix] = '';
        continue;
      }
      Object.assign(out, vals);
      // Slot yang terisi SEBAGIAN pun harus tuntas: kalau kolom `jurusan_id`
      // baris ini sekarang kosong, nilai lamanya harus ikut dihapus.
      if (lengkap) for (const [suffix] of defs) { const col = prefix + (i + 1) + suffix; if (!(col in vals)) out[col] = ''; }
    }
  };
  setSlots('pendidikan_', d.pendidikan, 5, [
    ['_tingkat', 'tingkat'],
    ['_nama_sekolah', 'nama_sekolah', 'namaSekolah', 'sekolah'],
    ['_sekolah_jp', 'nama_sekolah_jp', 'sekolah_jp'],
    ['_jurusan_id', 'jurusan', 'jurusan_id'],
    ['_jurusan_jp', 'jurusan_jp'],
    ['_tahun_masuk', 'tahun_masuk', 'tahunMasuk', 'masuk'],
    ['_tahun_lulus', 'tahun_lulus', 'tahunLulus', 'lulus'],
  ] as const);
  setSlots('pekerjaan_', d.pekerjaan, 3, [
    ['_nama_perusahaan', 'nama_perusahaan', 'namaPt', 'namaPerusahaan', 'perusahaan'],
    ['_perusahaan_jp', 'nama_perusahaan_jp', 'perusahaan_jp'],
    ['_jabatan', 'jabatan', 'jabatan_id', 'posisi'],
    ['_jabatan_jp', 'jabatan_jp'],
    ['_tahun_masuk', 'tahun_masuk', 'tahunMasuk', 'masuk'],
    ['_tahun_keluar', 'tahun_keluar', 'tahunKeluar', 'keluar'],
    ['_gaji', 'gaji', 'pendapatan'],
    /* Migrasi 022: 雇用形態 / 業種 / 備考. */
    ['_jenis', 'jenis', 'jenis_pekerjaan', 'status_kerja'],
    ['_bidang', 'bidang', 'industri'],
    ['_catatan', 'catatan', 'keterangan'],
  ] as const);
  setSlots('keluarga_', d.keluarga, 5, [
    ['_hubungan', 'hubungan', 'hubungan_id'],
    ['_hubungan_jp', 'hubungan_jp'],
    ['_nama', 'nama'],
    ['_usia', 'usia', 'umur'],
    ['_pekerjaan', 'pekerjaan', 'pekerjaan_id'],
    ['_gaji', 'gaji', 'pendapatan'],
    /* Migrasi 022: 同居区分 / 電話. */
    ['_tinggal', 'tinggal', 'status_tinggal'],
    ['_hp', 'hp', 'telepon', 'no_hp'],
  ] as const);
  return out;
}

/**
 * `ai_data_json` (seksi bersarang) → kolom skalar `master_database_candidate`.
 *
 * KENAPA ADA (2026-10-22, keluhan pemilik: *"cv ai dan form master semua menulis
 * dan sync ke masterdatabase, harusnya datanya sama kok bisa beda"*):
 *
 * Ketiga jalur memang menulis ke TABEL yang sama, tapi tidak ke KOLOM yang sama.
 * Form Master memakai `buildMasterBody` (kolom skalar), sedangkan jalur CV AI
 * hanya menulis `ai_data_json` + slot riwayat + URL berkas. Tidak ada penerjemah
 * dari seksi AI ke nama kolom — jadi untuk kandidat yang hanya mengisi CV AI,
 * kolomnya kosong. Diukur lewat REST atas 56 baris ber-`ai_data_json`:
 * **687 sel** kosong padahal nilainya ada di JSON (mis. `mata_kiri` 23 baris,
 * `golongan_darah` 22, `promosi_diri` 24, `agama` 22).
 *
 * Konsekuensinya bukan hanya berkas unduhan: setiap pembaca KOLOM (panel admin,
 * ekspor CSV, kueri SQL, filter) melihat kandidat itu kosong.
 *
 * ATURAN:
 *   1. HANYA nilai terisi yang menghasilkan kunci. Field AI yang kosong tidak
 *      boleh mengosongkan kolom yang sudah benar (pemanggil menimpa dengan
 *      `Object.assign`, jadi kunci yang tidak ada = kolom tidak disentuh).
 *   2. Nilai ditulis apa adanya; tanggal & enum dikoersi TERPUSAT oleh
 *      `writeBodyFor` (`_lib/db/client.ts`), bukan di sini.
 *   3. Kunci alternatif dicoba berurutan — CV AI lama dan baru memakai ejaan
 *      berbeda (`promosi_id` vs `promosi_diri`, `alergi_id` vs `alergi`).
 *   4. Kolom yang TIDAK ada di kontrak skema tidak boleh disebut di sini;
 *      `writeBodyFor` akan membuangnya dan mencatatnya sebagai drift.
 *   5. `lengkap` = payload ini adalah SELURUH form, jadi kunci yang HADIR tapi
 *      kosong berarti user MENGOSONGKANNYA dan kolomnya harus ikut dikosongkan.
 *      Tanpa flag ini aturan 1 berlaku apa adanya (pemanggil parsial, mis.
 *      ekstraksi AI, tidak boleh menghapus apa pun). Lihat `clearable` di bawah.
 */
export const AI_TO_MASTER_COLUMNS: Record<string, Array<[string, ...string[]]>> = {
  identitas: [
    ['nama_lengkap', 'nama_lengkap'], ['furigana', 'katakana'], ['namapanggilan', 'panggilan'],
    ['panggilan_katakana', 'panggilan_katakana'], ['tempat_lahir', 'tempat_lahir'],
    ['tgl_lahir', 'tgl_lahir'], ['usia', 'umur', 'usia'], ['gender', 'gender'],
    ['agama', 'agama'], ['agama_jp', 'agama_jp'], ['golongan_darah', 'golongan_darah'],
    ['status_pernikahan', 'status_nikah'], ['status_pernikahan_jp', 'status_nikah_jp'],
    ['jumlah_anak', 'anak'], ['email', 'email'], ['alamat_lengkap', 'alamat'],
    /* Alamat versi Jepang. Kolomnya sudah ada sejak lama dan dibaca rirekisho /
       template CV, tetapi CV AI tidak pernah memetakannya — jadi alamat kanji
       selalu kosong walaupun AI mengembalikannya. Ditambahkan 2026-10-25
       bersama `identitas.alamat_jp` di prompt & `AI_CV_PATHS`. */
    ['alamat_jp', 'alamat_jp'],
    ['nik', 'ktp'], ['no_paspor', 'paspor'], ['driver_license', 'sim'],
    ['status_eks_jepang', 'status_eks_jepang'],
    /* Paritas Form Master (2026-10-25): tiga kolom paspor ini sudah ditanyakan
       Form Master sejak lama dan CV AI tidak — jadi kandidat VIP tidak punya
       jalan mengisinya. */
    ['tgl_terbit_pasport', 'tgl_terbit_paspor'], ['exp_pasport', 'exp_paspor'],
    ['kota_terbit_pasport', 'kota_paspor'],
    /* `no_coe` dikirim CV AI di dalam `sertifikasi`, tetapi baris lama (dan
       ekstraksi AI) menaruhnya di `identitas`. Dua kunci, satu kolom — pola yang
       sama dengan `alergi` di seksi medis. Gate cakupan kolom yang menuntut baris
       ini ada: tanpa ia `identitas.no_coe` dianggap field tanpa tujuan. */
    ['no_coe', 'no_coe'],
    /* Kontak darurat. `kontak_darurat_wa` dulu sengaja TIDAK dipetakan ("ditulis
       lewat jalur kontak darurat"), padahal jalur itu tidak ada: `hp_darurat`
       hanya bertahan di `ai_data_json`. Terukur 2026-10-25: `kontak_darurat_wa`
       berisi 13 baris, dan tidak satu pun bisa datang dari CV AI. Nama & hubungan
       ditambahkan bersamaan karena Form Master sudah menanyakan ketiganya. */
    ['kontak_darurat_wa', 'hp_darurat'], ['kontak_darurat_nama', 'darurat_nama'],
    ['kontak_darurat_hubungan', 'darurat_hubungan'],
    /* ── Migrasi 022 ────────────────────────────────────────────────────────
       Perjalanan, wilayah sekolah, dan rencana SIM. Semuanya dicetak form CV
       (JIPA ビザ種類/在日期間, Firma 渡航経験, KINKI ジャカルタから…㎞ & …月取得予定)
       dan sebelumnya tidak punya kolom sama sekali. */
    ['visa_jepang', 'visa_jepang'], ['negara_lain', 'negara_lain'],
    ['jarak_jakarta_km', 'jarak_jakarta_km'], ['lama_penerbangan', 'lama_penerbangan'],
    ['rencana_sim_bulan', 'rencana_sim_bulan'], ['wilayah_sekolah', 'wilayah_sekolah'],
  ],
  fisik: [
    ['tb', 'tb'], ['bb', 'bb'], ['ukuran_topi', 'topi'], ['ukuranbaju', 'baju'],
    ['ukuransepatu', 'sepatu'], ['tangandominan', 'tangan_dominan'], ['tahan_ac', 'tahan_ac'],
    /* ── Migrasi 022: tes & kebiasaan fisik (KINKI 計算テスト / 体力試験 /
       集団生活年数 / スポーツ). */
    ['tes_hitung', 'tes_hitung'], ['tes_pushup', 'tes_pushup'], ['tes_squat', 'tes_squat'],
    ['tinggal_kursus_tahun', 'tinggal_kursus_tahun'], ['olahraga', 'olahraga'],
  ],
  medis: [
    ['mata_kiri', 'mata_kiri'], ['mata_kanan', 'mata_kanan'], ['kacamata', 'kacamata'],
    ['buta_warna', 'buta_warna'], ['tato', 'tato'], ['merokok', 'rokok'],
    ['minum_alkohol', 'alkohol'], ['alergi', 'alergi_id', 'alergi'],
    /* `tindik` satu baris dengan `tato` di form cetak; Form Master menanyakan
       keduanya, CV AI hanya `tato`. Ditambahkan 2026-10-25. */
    ['tindik', 'tindik'],
    ['alergi_jp', 'alergi_jp'],
    ['riwayat_penyakit', 'riwayat_medis_id', 'riwayat_penyakit'],
    ['riwayat_medis_jp', 'riwayat_medis_jp'],
    ['riwayat_kecelakaan', 'riwayat_kecelakaan_id', 'riwayat_kecelakaan'],
    ['riwayat_kecelakaan_jp', 'riwayat_kecelakaan_jp'],
  ],
  wawancara: [
    ['promosi_diri', 'promosi_id', 'promosi_diri'],
    ['promosi_diri_jp', 'promosi_jp'],
    ['kelebihan', 'kelebihan_id', 'kelebihan'], ['kelebihan_jp', 'kelebihan_jp'],
    ['kekurangan', 'kekurangan_id', 'kekurangan'], ['kekurangan_jp', 'kekurangan_jp'],
    ['hobi_dan_keterampilan', 'hobi_id', 'hobi'], ['hobi_jp', 'hobi_jp'],
    ['keahlian_khusus', 'keahlian_id', 'keahlian_khusus'],
    ['keahlian_khusus_jp', 'keahlian_khusus_jp', 'keahlian_jp'],
    ['alasan_memilih_bidang', 'alasan_id', 'alasan_memilih_bidang', 'alasan_bidang_id'],
    ['alasan_memilih_bidang_jp', 'alasan_memilih_bidang_jp', 'alasan_bidang_jp'],
    ['motivasi_ke_jepang', 'moti_id', 'motivasi_ke_jepang', 'motivasi_id'],
    ['motivasi_ke_jepang_jp', 'motivasi_ke_jepang_jp', 'motivasi_jp'],
    ['keinginan_pribadi', 'keinginan_id', 'keinginan_pribadi'],
    ['keinginan_pribadi_jp', 'keinginan_pribadi_jp', 'keinginan_jp'],
    ['rencana_setelah_pulang', 'pulang_id', 'rencana_setelah_pulang', 'rencana_pulang_id'],
    ['rencana_setelah_pulang_jp', 'rencana_setelah_pulang_jp', 'rencana_pulang_jp'],
    ['tujuan_ke_jepang', 'tujuan_id', 'tujuan_ke_jepang'],
    ['tujuan_ke_jepang_jp', 'tujuan_ke_jepang_jp'],
    ['harapan_gaji_yen', 'gaji_yen', 'harapan_gaji'],
    ['harapan_tabungan', 'tabungan', 'harapan_tabungan'],
    /* 在日期間. Dulu terdaftar sebagai "tidak punya kolom"; migrasi 022
       memberinya kolom, jadi pemetaannya pindah ke sini (aturan yang sama
       dengan kenalan_* di 019). */
    ['lama_di_jepang', 'lama', 'lama_di_jepang'],
    ['mbti', 'mbti'],
  ],
  /* Sertifikasi. `sertifikasi.ssw`/`lisensi` adalah NAMA lisensi SSW — di Form
     Master konsep itu kolom `bidangssw` (lihat MASTER_COLUMN_MAP: `lisensi` →
     `bidangssw`), sedangkan `sertifikasi.bidang` SENGAJA tidak dipakai (itu
     sektor kerja, konsep lain). */
  sertifikasi: [
    ['jft', 'jft', 'nilai'],
    ['bidangssw', 'ssw', 'lisensi'],
    ['bahasa', 'bahasa', 'bahasa_jepang'],
    /* Dua field yang dulu hanya ada di Form Master. `bidangssw2` baru punya
       kolom sejak migrasi 019 — sebelumnya lisensi SSW kedua diketik, dikirim,
       lalu dibuang tanpa pesan. */
    ['bidangssw2', 'ssw2', 'lisensi2'],
    ['no_coe', 'no_coe'],
    /* ── Migrasi 022: bahasa & sertifikat tambahan. */
    ['lama_belajar_jp', 'lama_belajar_jp'], ['status_belajar_jp', 'status_belajar_jp'],
    ['bab_belajar_jp', 'bab_belajar_jp'], ['level_bahasa_inggris', 'level_bahasa_inggris'],
    ['bahasa_lain', 'bahasa_lain'], ['level_bahasa_jepang', 'level_bahasa_jepang'],
    ['sertifikat_lain', 'sertifikat_lain'], ['catatan_cv', 'catatan_cv'],
  ],
  /* Kenalan di Jepang. Seksi ini TIDAK dikelola `aiData` (dipertahankan dari
     baris lama), jadi pemetaannya baru berguna setelah `aiOut` yang dipakai —
     lihat catatan di `_lib/ai/cv.ts`.
     Sejak migrasi 019 tabel ini PUNYA kolom versi Indonesia
     (`kenalan_di_jepang_pekerjaan/usia/alamat`), jadi ketiganya dipetakan —
     sebelumnya hanya `_jp`-nya dan nilainya cuma hidup di `ai_data_json`.
     Gate `e2e/ai-cv-column-coverage.test.ts` menuntut pemindahan ini. */
  kenalan_jepang: [
    ['kenalan_di_jepang_nama', 'nama_id'], ['kenalan_di_jepang_nama_jp', 'nama_jp'],
    ['kenalan_di_jepang_hubungan', 'hubungan_id'], ['kenalan_di_jepang_hubungan_jp', 'hubungan_jp'],
    ['kenalan_di_jepang_pekerjaan', 'pekerjaan_id'],
    ['kenalan_di_jepang_pekerjaan_jp', 'pekerjaan_jp'],
    ['kenalan_di_jepang_usia', 'usia'],
    ['kenalan_di_jepang_alamat', 'alamat_id'],
    ['kenalan_di_jepang_alamat_jp', 'alamat_jp'],
    /* 在留資格(在留期間) — migrasi 022. */
    ['kenalan_di_jepang_status_tinggal', 'status_tinggal'],
  ],
};

/**
 * `ai_data_json` (seksi bersarang) → kolom skalar `master_database_candidate`.
 *
 * @param lengkap Payload ini memuat SELURUH form (bukan kutipan parsial), jadi
 *   kunci yang hadir tapi kosong berarti user menghapusnya.
 *
 * KENAPA `lengkap` ADA (2026-10-30, keluhan pemilik: *"sudah tersimpan saya
 * keluar pencet rekhisou kok gak hilang"* dan *"balik ke cv ai terisi lagi"*):
 *
 * Aturan 1 di bawah benar untuk pemanggil PARSIAL (ekstraksi AI yang hanya
 * menemukan separuh dokumen), tetapi form CV AI mengirim SEMUA field-nya —
 * termasuk yang baru saja dikosongkan kandidat. Karena `buildMasterNested`
 * membaca KOLOM lebih dulu (kolom = kebenaran mutlak), kolom yang tidak pernah
 * dikosongkan membuat field yang dihapus hidup lagi di layar, di CV cetak, dan
 * saat form dibuka ulang. Terukur pada `master_database_candidate.id = 127`
 * (2026-10-30 09:49 UTC): `ai_data_json` sudah bersih, kolomnya masih berisi.
 *
 * Jadi flag ini bukan pelonggaran aturan 1 — ia MEMBEDAKAN dua pemanggil yang
 * selama ini diperlakukan sama. Yang tidak mengirim flag tetap tidak menghapus
 * apa pun; itu yang diuji `e2e/ai-cv-submit.test.ts` ("field AI yang KOSONG
 * tidak mengosongkan kolom").
 */
export function masterColumnsFromAi(aiData: unknown, lengkap = false): Record<string, string> {
  const out: Record<string, string> = {};
  if (!aiData || typeof aiData !== 'object' || Array.isArray(aiData)) return out;
  const sections = aiData as Record<string, unknown>;
  for (const [section, fields] of Object.entries(AI_TO_MASTER_COLUMNS)) {
    const grp = sections[section];
    if (!grp || typeof grp !== 'object' || Array.isArray(grp)) continue;
    const g = grp as Record<string, unknown>;
    for (const [col, ...aiKeys] of fields) {
      let filled = false;
      let present = false;
      for (const k of aiKeys) {
        if (!Object.hasOwn(g, k) || g[k] === undefined) continue;
        present = true;
        const val = g[k];
        if (val === null) continue;
        const text = String(val).trim();
        if (text !== '') { out[col] = text; filled = true; break; }
      }
      // Hadir tapi kosong + form lengkap ⇒ user mengosongkannya. Hanya kunci
      // yang BENAR-BENAR ada di payload yang boleh menghasilkan `''`; kunci yang
      // tidak dikirim sama sekali tetap tidak menyentuh kolom (aturan 1).
      // `!(col in out)`: satu kolom bisa punya dua sumber (`no_coe` ada di
      // identitas DAN sertifikasi) — nilai terisi tidak boleh ditimpa kosong.
      if (!filled && present && lengkap && !(col in out)) out[col] = '';
    }
  }
  return out;
}

export function buildMasterBody(d: any): Record<string, any> {
  const body: Record<string, any> = {};
  /* `formLengkap` = payload ini adalah SELURUH form (Form Master mengirim semua
     field-nya). Hanya kalau itu benar, field yang hadir tapi kosong boleh
     mengosongkan kolomnya — kalau tidak, menghapus isi sebuah kotak di form
     tidak pernah berlaku: `buildMasterNested` membaca KOLOM lebih dulu, jadi
     nilai lama hidup lagi begitu form dibuka ulang. Keluhan pemilik 2026-10-30
     ("dihapus, kok balik lagi") adalah persis ini. Pemanggil parsial
     (`AdminAiCopilot`) tidak mengirim flag ⇒ perilakunya tidak berubah. */
  const lengkap = d.formLengkap === true;
  for (const [from, to] of Object.entries(SNAKE_TO_CAMEL)) {
    if (d[from] !== undefined && d[from] !== null && d[from] !== '' && d[to] === undefined) d[to] = d[from];
  }
  for (const [from, to] of [['jft_text', 'nilai'], ['jftText', 'nilai'], ['ssw_text', 'lisensi'], ['sswText', 'lisensi']] as const) {
    if (d[from] !== undefined && d[from] !== null && d[from] !== '' && d[to] === undefined) d[to] = d[from];
  }
  for (const [from, col] of Object.entries(MASTER_COLUMN_MAP)) {
    if (d[from] !== undefined && d[from] !== null && d[from] !== '') body[col] = String(d[from]);
    else if (lengkap && Object.hasOwn(d, from)) body[col] = '';
  }
  // Kolom slot riwayat: SATU implementasi, dipakai juga oleh jalur simpan CV AI
  // (`_lib/ai/cv.ts`) — lihat catatan di `buildRiwayatSlots`.
  Object.assign(body, buildRiwayatSlots(d, d.riwayatLengkap === true));
  // Tidak ada lagi penyaringan tangan di sini: `patchMaster`/`upsertMaster`
  // menyerahkan body ke `writeBodyFor()`, yang membuang kolom di luar kontrak
  // dan mencatatnya sebagai drift. Menyaring dua kali berarti dua daftar yang
  // bisa berbeda — persis defect yang baru dibuang.
  return body;
}

export async function autoTranslateToJp(idFields: Record<string, string>, existingJp?: Record<string, string>): Promise<Record<string, string>> {
  const toTranslate: Array<{ key: string; text: string }> = [];
  for (const [key, jpCol] of Object.entries(JP_TRANSLATE_MAP)) {
    const idText = String(idFields[key] || '').trim(); if (!idText) continue;
    const existing = existingJp ? String(existingJp[jpCol] || '').trim() : ''; if (existing) continue;
    toTranslate.push({ key, text: idText });
  }
  if (toTranslate.length === 0) return {};
  const NL = String.fromCharCode(10);
  const items = toTranslate.map((t, i) => i + 1 + '. ' + t.text).join(NL);
  const prompt = 'Terjemahkan Bahasa Indonesia ke Bahasa Jepang untuk CV kerja.' + NL + 'Kembalikan JSON: ' + String.fromCharCode(123) + '"0":"jp0","1":"jp1",...' + String.fromCharCode(125) + ' tanpa teks lain.' + NL + NL + items;
  try {
    const { geminiGenerate, parseJsonLoose } = await import('../../_lib/ai/providers');
    const r = await geminiGenerate(prompt, []);
    const text = String(r && r.reply ? r.reply : '').trim();
    if (!text) return {};
    const parsed = parseJsonLoose(text);
    if (!parsed || typeof parsed !== 'object') return {};
    const result: Record<string, string> = {};
    for (let i = 0; i < toTranslate.length; i++) { const t = String(parsed[String(i)] || '').trim(); if (t) result[toTranslate[i].key] = t; }
    return result;
  } catch { return {}; }
}

// --- Handlers ---

export async function handleGetMasterDataByWa(payload: any[], sessionToken?: string) {
  const wa = String((payload && payload[0]) || '');
  // P27 fix: jalur baca Master boleh dipakai admin juga (sebelumnya
  // requireRole('kandidat') menolak admin padahal jalur tulis & read saudara
  // mengizinkan admin — prefill bridge master gagal untuk admin).
  const t = session.verifyToken(sessionToken);
  if (!t || (t.role !== 'admin' && t.role !== 'kandidat')) {
    return { success: false, sessionInvalid: true, message: 'Sesi tidak valid' };
  }
  if (!wa) return { error: 'Nomor WA wajib diisi.' };
  if (!isOwnerOrAdmin(sessionToken, wa)) return { success: false, error: 'Akses ditolak: nomor WA tidak sesuai sesi.' };
  try {
    const row = await findMasterByWa(wa);
    if (!row) return { error: 'Data Master belum ada. Silakan isi form Master dulu.' };
    const v = (col: string) => { const x = row[col]; return x !== undefined && x !== null ? toText(x) : ''; };
    // Jalur ini mengisi form Master & CV AI. `<input type="date">` menampilkan
    // KOSONG untuk cap waktu ISO maupun `dd-mm-yyyy`, jadi tanggal dinormalkan
    // di sini seperti di `buildMasterNested` (satu implementasi: `toDateOnly`).
    const vd = (col: string) => { const x = row[col]; return x !== undefined && x !== null ? toDateOnly(x) : ''; };
    // Golongan darah dirapikan seperti di `buildMasterNested` — nilai seperti
    // `"AB +"` tidak cocok dengan opsi mana pun, jadi dropdown-nya tampil kosong.
    const vg = (col: string) => { const x = row[col]; return x !== undefined && x !== null ? normalizeBloodType(x) : ''; };
    let aiParsed: any = null;
    try { const raw = row.ai_data_json; if (typeof raw === 'string' && raw.trim() && raw !== '-') aiParsed = JSON.parse(raw); } catch { aiParsed = null; }
    const aiKen = (aiParsed && aiParsed.kenalan_jepang) || {};
    const aiOf = (k: string) => { const x = aiKen[k]; return x !== undefined && x !== null ? toText(x) : ''; };
    const out: Record<string, any> = {
      NAMA_LENGKAP: v('nama_lengkap'), FURIGANA: v('furigana'), NAMAPANGGILAN: v('namapanggilan'),
      PANGGILAN_KATAKANA: v('panggilan_katakana'), TEMPAT_LAHIR: v('tempat_lahir'),
      TEMPAT_LAHIR_JP: v('tempat_lahir_jp'), TGL_LAHIR: vd('tgl_lahir'), GENDER: v('gender'),
      USIA: v('usia'), AGAMA: v('agama'), AGAMA_JP: v('agama_jp'),
      STATUS_PERNIKAHAN: v('status_pernikahan'), STATUS_NIKAH_JP: v('status_pernikahan_jp'),
      JUMLAH_ANAK: v('jumlah_anak'), NIK: v('nik'), DRIVER_LICENSE: v('driver_license'),
      ALAMAT_LENGKAP: v('alamat_lengkap'), ALAMAT_JP: v('alamat_jp'), EMAIL: v('email'),
      TT: v('tb'), TB: v('tb'), BB: v('bb'), GOLONGAN_DARAH: vg('golongan_darah'),
      TANGANDOMINAN: v('tangandominan'), UKURANBAJU: v('ukuranbaju'), UKURANSEPATU: v('ukuransepatu'),
      UKURAN_TOPI: v('ukuran_topi'), TAHAN_AC: v('tahan_ac'), MATA_KIRI: v('mata_kiri'),
      MATA_KANAN: v('mata_kanan'), KACAMATA: v('kacamata'), BUTA_WARNA: v('buta_warna'),
      TATO: v('tato'), TINDIK: v('tindik'), MEROKOK: v('merokok'), MINUM_ALKOHOL: v('minum_alkohol'),
      RIWAYAT_PENYAKIT: v('riwayat_penyakit'), ALERGI: v('alergi'), RIWAYAT_KECELAKAAN: v('riwayat_kecelakaan'),
      LAMA_DI_JEPANG: v('status_eks_jepang'), HARAPAN_GAJI_YEN: v('harapan_gaji_yen'),
      HARAPAN_TABUNGAN: v('harapan_tabungan'), BAHASA: v('bahasa'), JFT: v('jft'), SSW: v('ssw'),
      BIDANGSSW: v('bidangssw'), PROMOSI_DIRI: v('promosi_diri'), KELEBIHAN: v('kelebihan'),
      KEKURANGAN: v('kekurangan'), KEAHLIAN_KHUSUS: v('keahlian_khusus'),
      'HOBI_&_KETERAMPILAN': v('hobi_dan_keterampilan'), HOBI_AND_KETERAMPILAN: v('hobi_dan_keterampilan'),
      HOBI_JP: v('hobi_jp'), KEAHLIAN_JP: v('keahlian_khusus_jp'),
      ALASAN_MEMILIH_BIDANG: v('alasan_memilih_bidang'), MOTIVASI_KE_JEPANG: v('motivasi_ke_jepang'),
      KEINGINAN_PRIBADI: v('keinginan_pribadi'), RENCANA_SETELAH_PULANG: v('rencana_setelah_pulang'),
      TUJUAN_KE_JEPANG: v('tujuan_ke_jepang'), STATUS_EKS_JEPANG: v('status_eks_jepang'),
      KONTAK_DARURAT_NAMA: v('kontak_darurat_nama'), KONTAK_DARURAT_HUBUNGAN: v('kontak_darurat_hubungan'),
      KONTAK_DARURAT_WA: v('kontak_darurat_wa'),
      KENALAN_DI_JEPANG_NAMA: v('kenalan_di_jepang_nama') || aiOf('nama_id'),
      KENALAN_DI_JEPANG_NAMA_JP: aiOf('nama_jp'),
      KENALAN_DI_JEPANG_HUBUNGAN: v('kenalan_di_jepang_hubungan') || aiOf('hubungan_id'),
      KENALAN_DI_JEPANG_HUBUNGAN_JP: aiOf('hubungan_jp'),
      KENALAN_DI_JEPANG_PEKERJAAN: aiOf('pekerjaan_id'),
      KENALAN_DI_JEPANG_PEKERJAAN_JP: aiOf('pekerjaan_jp'),
      KENALAN_DI_JEPANG_USIA: aiOf('usia'),
      KENALAN_DI_JEPANG_ALAMAT: aiOf('alamat_id'),
      KENALAN_DI_JEPANG_ALAMAT_JP: aiOf('alamat_jp'),
      NO_PASPORT: v('no_paspor'), TGL_TERBIT_PASPORT: vd('tgl_terbit_pasport'),
      EXP_PASPORT: vd('exp_pasport'), KOTA_TERBIT_PASPORT: v('kota_terbit_pasport'),
      NO_COE: v('no_coe'), PAS_PHOTO: v('pas_photo'), JFT_URL: v('jft_url'),
      SSW_URL: v('ssw_url'), FILE_CV: v('file_cv'),
    };
    for (let i = 1; i <= 5; i++) {
      out['PENDIDIKAN_' + i + '_TINGKAT'] = v('pendidikan_' + i + '_tingkat');
      out['PENDIDIKAN_' + i + '_NAMA_SEKOLAH'] = v('pendidikan_' + i + '_nama_sekolah');
      out['PENDIDIKAN_' + i + '_JURUSAN'] = v('pendidikan_' + i + '_jurusan_id');
      out['PENDIDIKAN_' + i + '_JURUSAN_ID'] = v('pendidikan_' + i + '_jurusan_id');
      out['PENDIDIKAN_' + i + '_TAHUN_MASUK'] = v('pendidikan_' + i + '_tahun_masuk');
      out['PENDIDIKAN_' + i + '_TAHUN_LULUS'] = v('pendidikan_' + i + '_tahun_lulus');
    }
    for (let i = 1; i <= 3; i++) {
      out['PEKERJAAN_' + i + '_NAMA_PERUSAHAAN'] = v('pekerjaan_' + i + '_nama_perusahaan');
      out['PEKERJAAN_' + i + '_JABATAN'] = v('pekerjaan_' + i + '_jabatan');
      out['PEKERJAAN_' + i + '_TAHUN_MASUK'] = v('pekerjaan_' + i + '_tahun_masuk');
      out['PEKERJAAN_' + i + '_TAHUN_KELUAR'] = v('pekerjaan_' + i + '_tahun_keluar');
      out['PEKERJAAN_' + i + '_GAJI'] = v('pekerjaan_' + i + '_gaji');
    }
    for (let i = 1; i <= 5; i++) {
      out['KELUARGA_' + i + '_HUBUNGAN'] = v('keluarga_' + i + '_hubungan');
      out['KELUARGA_' + i + '_NAMA'] = v('keluarga_' + i + '_nama');
      out['KELUARGA_' + i + '_USIA'] = v('keluarga_' + i + '_usia');
      out['KELUARGA_' + i + '_PEKERJAAN'] = v('keluarga_' + i + '_pekerjaan');
      out['KELUARGA_' + i + '_PENDAPATAN'] = '';
    }
    return out;
  } catch (e: any) { return { error: safeError('Gagal memuat data Master.', e) }; }
}

export async function handleGetDrafCvMaster(payload: any[], sessionToken?: string) {
  const wa = String((payload && payload[0]) || '');
  // Auth hardening (2026-09-04): a draft CV is candidate PII. Require a
  // verified session and owner-or-admin scope BEFORE touching the row — the
  // old anonymous branch returned a limited identity subset (nama, tgl lahir)
  // for any guessed WA.
  const t = session.verifyToken(sessionToken);
  if (!t || (t.role !== 'admin' && t.role !== 'kandidat')) {
    return { success: false, sessionInvalid: true, message: 'Sesi tidak valid' };
  }
  if (!isOwnerOrAdmin(sessionToken, wa)) {
    return { success: false, error: 'Akses ditolak: nomor WA tidak sesuai sesi.' };
  }
  try {
    const row = await findMasterByWa(wa);
    if (!row) {
      let nama = '';
      try {
        let c = await findCandidateByWaFiltered(wa);
        if (c === undefined) { const found = await findCandidates(); const want = nw(wa); c = ((found && found.rows) || []).find((r) => nw(String(pick(r, APPLY_WA_COLS) || '')) === want) || null; }
        if (c) nama = String(pick(c, ['nama_lengkap', 'nama']) || '');
      } catch { /* non-fatal */ }
      return { error: 'Data Master belum ada' + (nama ? ' untuk ' + nama : '') + ' (' + wa + '). Isi Form Master dulu.' };
    }
    const nested = buildMasterNested(row);
    // Owner or admin already passed the pre-fetch gate — full draft only.
    return Object.assign(nested, { AIDATAJSON: row.ai_data_json || '', id_kandidat: row.id_kandidat || row.id || '' });
  } catch (e: any) { return { error: safeError('Gagal memuat data Master.', e) }; }
}

export async function handleSubmitMasterForm(payload: any[], sessionToken?: string) {
  const d = (payload && payload[0]) || {};
  const wa = nw(String(d.wa || ''));
  const t = session.verifyToken(sessionToken);
  if (!t || (t.role !== 'kandidat' && t.role !== 'admin')) return { success: false, sessionInvalid: true, message: 'Sesi tidak valid' };
  if (!wa) return { success: false, message: 'Nomor WA wajib diisi.' };
  if (!isOwnerOrAdmin(sessionToken, wa)) return { success: false, error: 'Akses ditolak: nomor WA tidak sesuai sesi.' };
  try {
    let row = await findMasterByWa(wa);
    const nama = String(d.nama || '').trim().toUpperCase() || 'KANDIDAT';
    const folder = masterFolder(nama);
    const fileUrls: Record<string, any> = {};
    for (const [from, col] of Object.entries(MASTER_FILE_COLUMNS)) {
      if (d[from]) { const prefix = from.replace(/File$/, '').toUpperCase(); const url = await resolveFileUrl(d[from], folder, prefix + '.jpg'); if (url) fileUrls[col] = url; }
    }
    const pendidikanStr = typeof d.pendidikan === 'string' && d.pendidikan.trim() !== '' ? d.pendidikan.trim() : null;
    const body: Record<string, any> = { no_wa: wa, updated_at: new Date().toISOString(), ...buildMasterBody(d) };
    body.nama_lengkap = nama;
    Object.assign(body, fileUrls);
    if (pendidikanStr) body.pendidikan_1_tingkat = pendidikanStr;

    let jpTranslations: Record<string, string> = {};
    try {
      const existingJp: Record<string, string> = {};
      if (row) { for (const [_fk, jc] of Object.entries(JP_TRANSLATE_MAP)) { const v = row[jc]; if (v !== undefined && v !== null && String(v).trim()) existingJp[jc] = String(v); } }
      jpTranslations = await autoTranslateToJp(d, existingJp);
      for (const [fk, jc] of Object.entries(JP_TRANSLATE_MAP)) { if (jpTranslations[fk]) body[jc] = jpTranslations[fk]; }
    } catch { /* non-fatal */ }

    const changedLabels: string[] = [];
    for (const [from, col] of Object.entries(MASTER_COLUMN_MAP)) {
      if (d[from] === undefined || d[from] === null || d[from] === '') continue;
      const oldVal = row && row[col] !== undefined && row[col] !== null ? String(row[col]) : '';
      const newVal = String(d[from]);
      if (newVal !== oldVal) { const label = MASTER_FIELD_LABEL[col] || col; if (!changedLabels.includes(label)) changedLabels.push(label); }
    }

    const aiOverflow = buildAiOverflow(d);

    // FIRST WRITE. `cacheClear()` used to run as the function's first
    // statement — before the session check, before `!wa`, before the ownership
    // guard — so an unauthenticated POST with a junk payload was rejected AND
    // invalidated the shared cache (public-base + every candidate page).
    cacheClear();
    if (row && row.id !== undefined) {
      await patchMaster(row.id, body);
    } else {
      body.id_kandidat = await nextCandidateId();
      await upsertMaster(body);
    }

    try {
      const lengkap = d.riwayatLengkap === true;
      // `lengkap` juga memicu tulis walau overflow kosong: menghapus SEMUA baris
      // tidak menghasilkan overflow apa pun, dan justru itulah yang harus
      // tersimpan (pemangkasan).
      if (aiOverflow || lengkap) {
        let aiBase: any = null;
        if (row && row.ai_data_json) { try { const parsed = JSON.parse(row.ai_data_json); if (parsed && typeof parsed === 'object') aiBase = parsed; } catch { aiBase = null; } }
        // Snapshot SEBELUM mutasi: `mergeAiOverflow` mengubah `aiBase` di tempat
        // dan mengembalikan objek yang sama, jadi membandingkan sesudahnya akan
        // selalu "tidak berubah" dan tulisan tidak pernah terjadi.
        const before = aiBase ? JSON.stringify(aiBase) : null;
        let aiNew = mergeAiOverflow(aiBase, aiOverflow || {});
        if (lengkap) aiNew = pruneAiRiwayat(aiNew, d);
        const after = JSON.stringify(aiNew);
        if (before !== after && (before !== null || Object.keys(aiNew).length)) {
          const aiPatch = { ai_data_json: after, ai_updated_at: new Date().toISOString() };
          if (row && row.id !== undefined) { await patchMaster(row.id, aiPatch); }
          else {
            const rows2 = await supabaseJson('GET', 'master_database_candidate', { query: { select: MASTER_LIGHT_COLS, no_wa: 'eq.' + wa, limit: 5 } });
            const r2 = (Array.isArray(rows2) ? rows2 : []).find((r: any) => nw(String(r.no_wa || '')) === wa);
            if (r2 && r2.id !== undefined) await patchMaster(r2.id, aiPatch);
          }
        }
      }
    } catch { /* ai merge non-fatal */ }

    try {
      let c = await findCandidateByWaFiltered(wa);
      if (c === undefined) { const candFound = await findCandidates(); const want = nw(wa); c = candFound.rows.find((r) => nw(String(pick(r, APPLY_WA_COLS) || '')) === want) || null; }
      // Satu daftar field, dipakai juga oleh jalur CV AI dan oleh edit admin
      // (`_lib/db/identity-sync.ts`). Sebelumnya daftar ini ditulis tangan di
      // sini DAN di `_lib/ai/cv.ts`, dan keduanya sudah berbeda — jalur CV AI
      // tidak menyalin `tb`/`bb`/`nik`/`email`/`alamat`, sehingga CV Mini
      // menampilkan tinggi/berat kosong untuk kandidat yang mengisi lewat CV AI.
      const candBody: Record<string, string> = { nama_lengkap: nama, ...candidateIdentityPatch(body) };
      if (fileUrls.pas_photo) candBody.pas_photo = fileUrls.pas_photo;
      if (fileUrls.jft_url) candBody.jft = fileUrls.jft_url;
      if (fileUrls.ssw_url) candBody.ssw = fileUrls.ssw_url;
      if (fileUrls.file_cv) candBody.file_cv = fileUrls.file_cv;
      if (c && c.id !== undefined) { await supabaseJson('PATCH', 'database_candidate', { query: { id: 'eq.' + c.id }, body: candBody, headers: { Prefer: 'return=minimal' } }); }
    } catch { /* sync non-fatal */ }

    try { if (changedLabels.length) await syncBiodataKeMail(wa, nama, changedLabels); } catch { /* non-fatal */ }
    return { success: true };
  } catch (e: any) { return { success: false, error: safeError('Gagal simpan Master.', e) }; }
}

// ---------------------------------------------------------------------------
// A05 parity (2026-09-04): simpanBiodataLengkap — form biodata pemberkasan
// (KTKLN & Visa) dari modal "Pusat Pemberkasan". Legacy
// js/03_candidate.ts prosesSimpanBiodataLengkap mengirim satu payload datar
// dengan NAMA KUNCI LEGACY (nama_ayah, no_pasport, ...). master_database_candidate
// sudah restruktur ke format JP — pasangan [from, to] memetakan kunci payload
// ke KOLOM ASLI tabel.
//
// SETIAP kunci payload di sini WAJIB punya kolom. Kunci tanpa pasangan
// di-DIAMKAN (loop hanya melewatinya), jadi admin mengisi field, menekan Simpan,
// melihat "berhasil", dan nilainya tidak tersimpan di mana pun. Tujuh kunci yang
// dulu masuk kategori itu sekarang punya kolom — migrations/016_biodata_keluarga_perusahaan.sql.
// Menambah field baru di PemberkasanModal TANPA kolom + pasangan di sini akan
// mengulang bug yang sama.
// ---------------------------------------------------------------------------
export const BIO_LENGKAP_MASTER_COLS: ReadonlyArray<readonly [string, string]> = [
  ['email', 'email'], ['tempat_lahir', 'tempat_lahir'], ['tgl_lahir', 'tgl_lahir'],
  ['alamat_lengkap', 'alamat_lengkap'], ['no_coe', 'no_coe'], ['exp_pasport', 'exp_pasport'],
  ['no_pasport', 'no_paspor'], ['kota_pasport', 'kota_terbit_pasport'],
  ['tgl_pasport', 'tgl_terbit_pasport'],
  ['nama_ayah', 'keluarga_1_nama'],
  ['nama_perusahaan', 'pekerjaan_1_nama_perusahaan'],
  // ── migration 016 (2026-10-11): tujuh field yang dulu tidak punya kolom ──
  // Ayah menempati slot keluarga 1 (sudah dipakai `nama_ayah`), ibu slot 2.
  ['ttl_ayah', 'keluarga_1_ttl'],
  ['nama_ibu', 'keluarga_2_nama'],
  ['ttl_ibu', 'keluarga_2_ttl'],
  // Perusahaan penempatan — SENGAJA bukan pekerjaan_1_*: itu riwayat kerja
  // kandidat sendiri (rirekisho), bukan perusahaan yang mengirimnya.
  ['nama_shacou', 'perusahaan_1_nama_shacou'],
  ['telp_perusahaan', 'perusahaan_1_telp'],
  ['web_perusahaan', 'perusahaan_1_web'],
  ['alamat_perusahaan', 'perusahaan_1_alamat'],
] as const;

// Kolom biodata yang juga dibaca mapCandidate dari database_candidate.
// Kolom sumber (from) adalah kolom asli master_database_candidate (no_paspor);
// kolom tujuan (to) adalah kolom database_candidate (no_pasport).
//
// ⚠️ SEJAK 2026-10-25 DAFTAR INI BUKAN LAGI SUMBER KEBENARAN. Ia daftar KEEMPAT
// dari konsep yang sama (tiga lainnya: Form Master, CV AI, edit admin), dan
// `buildCandSyncPatch` kini mendelegasikan ke `candidateIdentityPatch()` di
// `_lib/db/identity-sync.ts`. Konstanta ini dipertahankan hanya karena tes A05
// membacanya sebagai dokumentasi pasangan yang ejaannya berbeda; jangan
// menambahkannya lagi ke jalur tulis.
export const BIO_LENGKAP_CAND_SYNC: ReadonlyArray<readonly [string, string]> = [
  ['email', 'email'], ['tempat_lahir', 'tempat_lahir'], ['tgl_lahir', 'tgl_lahir'],
  ['alamat_lengkap', 'alamat_lengkap'], ['no_paspor', 'no_pasport'],
] as const;

/**
 * Body PATCH `database_candidate` dari kolom master.
 *
 * Delegasi ke daftar bersama supaya pemberkasan tidak punya salinan sendiri:
 * salinan tangan adalah persis yang membuat jalur CV AI tertinggal dan CV Mini
 * menampilkan tinggi/berat kosong. Nama lama dipertahankan karena pemanggil dan
 * tes A05 memakainya.
 */
export function buildCandSyncPatch(master: Record<string, string>): Record<string, string> {
  return candidateIdentityPatch(master);
}

/** Pure builder (DB-free testable) — payload datar → patch body master. */
export function buildBioPatch(payload: any): { master: Record<string, string> } {
  const d = (payload && payload[0]) || {};
  const master: Record<string, string> = {};
  for (const [from, to] of BIO_LENGKAP_MASTER_COLS) {
    const v = d[from];
    if (v !== undefined && v !== null && String(v).trim() !== '' && String(v).trim() !== '-') {
      master[to] = String(v).trim();
    }
  }
  return { master };
}

export async function handleSimpanBiodataLengkap(payload: any[], sessionToken?: string) {
  const d = (payload && payload[0]) || {};
  const wa = nw(String(d.wa || ''));
  const t = session.verifyToken(sessionToken);
  if (!t || (t.role !== 'kandidat' && t.role !== 'admin')) {
    return { success: false, sessionInvalid: true, message: 'Sesi tidak valid' };
  }
  if (!wa) return { success: false, error: 'Nomor WA wajib diisi.' };
  if (!isOwnerOrAdmin(sessionToken, wa)) {
    return { success: false, error: 'Akses ditolak: nomor WA tidak sesuai sesi.' };
  }
  cacheClear();
  const { master } = buildBioPatch(payload);
  if (!Object.keys(master).length) {
    return { success: false, error: 'Tidak ada data biodata untuk disimpan.' };
  }
  try {
    const now = new Date().toISOString();
    const row = await findMasterByWa(wa);
    const body = Object.assign({ no_wa: wa, updated_at: now }, master);
    if (row && row.id !== undefined) {
      await patchMaster(row.id, body);
    } else {
      await upsertMaster(Object.assign(
        { created_at: now, nama_lengkap: String(d.nama || 'KANDIDAT').trim().toUpperCase() },
        body,
      ));
    }
    // Sinkron kolom tumpang-tindih ke database_candidate (non-fatal).
    try {
      const c = await findCandidateRow(wa);
      const candPatch = buildCandSyncPatch(master);
      if (c && c.id !== undefined && Object.keys(candPatch).length) {
        await supabaseJson('PATCH', 'database_candidate', {
          query: { id: 'eq.' + c.id },
          body: Object.assign({}, candPatch, { updated_at: now }),
          headers: { Prefer: 'return=minimal' },
        });
      }
    } catch { /* non-fatal */ }
    // Notifikasi admin + jejak di Mail. Dulu handler ini TIDAK memanggil
    // `syncBiodataKeMail` sama sekali, jadi biodata yang diubah dari Pusat
    // Pemberkasan tidak pernah memicu push (laporan pemilik 2026-10-25).
    try {
      const labels = Object.keys(master)
        .filter((k) => k !== 'no_wa' && k !== 'updated_at')
        .map((k) => MASTER_FIELD_LABEL[k] || k)
        .filter((v, i, a) => a.indexOf(v) === i)
        .slice(0, 8);
      if (labels.length) {
        await syncBiodataKeMail(
          wa,
          String(d.nama || 'KANDIDAT').trim().toUpperCase(),
          labels,
          sessionToken,
        );
      }
    } catch { /* non-fatal */ }
    return { success: true };
  } catch (e: any) {
    return { success: false, error: safeError('Gagal menyimpan biodata.', e) };
  }
}

export { buildAiOverflow, mergeAiOverflow, findMasterByWa };

// ---------------------------------------------------------------------------
// TEMPLATE CV — CRUD `sys_config` (config_type = 'cv_template'), ADMIN SAJA
// ---------------------------------------------------------------------------
// Keputusan pemilik 2026-10-10: template disimpan di `sys_config` (tanpa DDL) +
// berkasnya di Storage. Tiga aksi di bawah sengaja TIDAK menyentuh Storage dan
// TIDAK men-decode record:
//
//   · berkas template di-upload dari browser lewat jalur berkas yang sudah ada
//     (`src/lib/uploadBerkas.ts`), jadi yang tersimpan di sini hanya URL-nya;
//   · pengisian berkas juga terjadi di BROWSER (`applyFieldMap` /
//     `applyRiwayatBlock` memakai `xlsx` — pustaka klien), jadi server tidak
//     perlu tahu isi `fieldMap`/`riwayat`;
//   · satu definisi bentuk record lebih baik daripada dua yang bisa berbeda —
//     bentuknya dimiliki `src/lib/cv-template-factory/templates.ts`, dan server
//     memperlakukannya sebagai JSON tak tembus pandang.
//
// Validasi di sini sengaja tipis tapi BUKAN kosong: record tanpa `id`/`nama`/
// `fileUrl` ditolak, karena baris seperti itu akan muncul di daftar admin lalu
// menghasilkan CV kosong saat dipakai — kegagalan yang menyamar sebagai hasil
// normal.
const CV_TEMPLATE_CONFIG_TYPE = 'cv_template';

/** `null` = boleh lanjut; objek = tolak. */
function requireAdminSession(sessionToken?: string): Record<string, unknown> | null {
  const t = session.verifyToken(sessionToken || '');
  if (!t || t.role !== 'admin') {
    return { success: false, sessionInvalid: true, message: 'Sesi admin tidak valid' };
  }
  return null;
}

export async function handleGetTemplateCvList(_payload: unknown[], sessionToken?: string) {
  const denied = requireAdminSession(sessionToken);
  if (denied) return denied;
  try {
    const rows = await supabaseJson('GET', 'sys_config', {
      query: {
        select: SYS_CONFIG_COLS,
        config_type: `eq.${CV_TEMPLATE_CONFIG_TYPE}`,
        order: 'id.asc',
      },
    });
    const templates = (Array.isArray(rows) ? rows : []).map((r: Record<string, unknown>) => ({
      rowId: r.id,
      // Record mentah — klien yang men-decode (`decodeTemplateRecord`).
      record: toText(r.config_value),
      nama: toText(r.deskripsi),
      aktif: r.is_active !== false,
    }));
    return { success: true, templates };
  } catch (e: unknown) {
    return { success: false, error: safeError('Gagal memuat template CV.', e) };
  }
}

export async function handleSimpanTemplateCv(payload: unknown[], sessionToken?: string) {
  const denied = requireAdminSession(sessionToken);
  if (denied) return denied;
  // Validasi TIPE di tepi, SETELAH guard sesi — bentuk `{record}` diperiksa
  // `fieldsOf`, bukan `String(...)` inline. `record` dibatasi 64 KB: satu
  // `fieldMap` template berukuran beberapa KB, jadi batas ini hanya menolak
  // kiriman yang tidak masuk akal, bukan template besar yang sah. Slot kedua
  // `ignored` demi klien yang sudah ter-deploy dan masih mengirim argumen ekstra
  // (lihat trap 1 di kernel/guard.ts).
  const [d] = guardPayload(payload, [
    fieldsOf('Template CV', { record: text('Record template', 65536) }),
    ignored,
  ]) as [Record<string, unknown>];
  const record = String(d.record ?? '').trim();
  if (!record) return { success: false, error: 'Record template kosong.' };

  let parsed: Record<string, unknown> | null = null;
  try {
    const j: unknown = JSON.parse(record);
    parsed = j && typeof j === 'object' && !Array.isArray(j) ? (j as Record<string, unknown>) : null;
  } catch {
    parsed = null;
  }
  if (!parsed) return { success: false, error: 'Record template bukan JSON yang sah.' };
  const id = String(parsed.id ?? '').trim();
  const nama = String(parsed.nama ?? '').trim();
  const fileUrl = String(parsed.fileUrl ?? '').trim();
  if (!id || !nama || !fileUrl) {
    return { success: false, error: 'Record template tidak lengkap (id, nama, fileUrl wajib).' };
  }

  try {
    cacheClear();
    const body = {
      config_type: CV_TEMPLATE_CONFIG_TYPE,
      config_value: record,
      deskripsi: nama.slice(0, 200),
      is_active: parsed.aktif !== false,
    };
    const rowId = d.rowId === undefined || d.rowId === null ? '' : String(d.rowId).trim();
    if (rowId) {
      // `config_type` ikut jadi filter: id baris dari klien tidak boleh dipakai
      // untuk menimpa baris `sys_config` milik fitur lain.
      await supabaseJson('PATCH', 'sys_config', {
        query: { id: `eq.${rowId}`, config_type: `eq.${CV_TEMPLATE_CONFIG_TYPE}` },
        body,
        headers: { Prefer: 'return=minimal' },
      });
      return { success: true, rowId };
    }
    await supabaseJson('POST', 'sys_config', {
      body: Object.assign({ created_at: new Date().toISOString() }, body),
      headers: { Prefer: 'return=minimal' },
    });
    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: safeError('Gagal menyimpan template CV.', e) };
  }
}

export async function handleHapusTemplateCv(payload: unknown[], sessionToken?: string) {
  const denied = requireAdminSession(sessionToken);
  if (denied) return denied;
  // Alasan yang sama dengan `handleSimpanTemplateCv` di atas: `rowId` diperiksa
  // sebagai TIPE di tepi, sedangkan "baris ini ada dan milik config_type ini"
  // tetap urusan query di bawah.
  const [d] = guardPayload(payload, [
    fieldsOf('Hapus template CV', { rowId: text('rowId', 64) }),
    ignored,
  ]) as [Record<string, unknown>];
  const rowId = String(d.rowId ?? '').trim();
  if (!rowId) return { success: false, error: 'rowId wajib diisi.' };
  try {
    cacheClear();
    // Filter `config_type` juga di sini — alasan yang sama dengan PATCH di atas.
    await supabaseJson('DELETE', 'sys_config', {
      query: { id: `eq.${rowId}`, config_type: `eq.${CV_TEMPLATE_CONFIG_TYPE}` },
      headers: { Prefer: 'return=minimal' },
    });
    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: safeError('Gagal menghapus template CV.', e) };
  }
}
