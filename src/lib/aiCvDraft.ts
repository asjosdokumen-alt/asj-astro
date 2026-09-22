/**
 * aiCvDraft.ts — muat draf CV dari `getDrafCvMaster` ke bentuk FLAT AiCvForm.
 *
 * AiCvForm memakai state flat (`cv.paspor`, `cv.promo_id`, …) sementara yang
 * tersimpan bersarang (`identitas.paspor`, `wawancara.promosi_id`, …). Legacy
 * menjembatani ini lewat `fieldPaths` di `js/pages/ai_form.ts` (id DOM → path).
 *
 * Kenapa tabel di bawah tidak sekadar menyalin `fieldPaths`: legacy MENULIS
 * lewat satu set kunci dan MEMBACA lewat set lain, dan dua pembaca berbeda
 * (`buildMasterNested` di backend, `cv-template-factory/data.ts` di frontend)
 * memakai kunci berbeda lagi. Contoh terukur:
 *
 *   keinginan : ditulis `wawancara.keinginan_pribadi` (payload AiCvForm),
 *               dibaca  `wawancara.keinginan_id` (fieldPaths legacy) dan
 *               `wawancara.keinginan_pribadi` (buildMasterNested, kolom master)
 *   motivasi  : ditulis `wawancara.motivasi_ke_jepang`,
 *               dibaca  `wawancara.motivasi_id`
 *   rencana   : ditulis `wawancara.rencana_setelah_pulang`,
 *               dibaca  `wawancara.rencana_pulang_id`
 *   keahlian  : ditulis `wawancara.keahlian_khusus`,
 *               dibaca  `wawancara.keahlian_id`
 *   alasan    : ditulis `wawancara.alasan_memilih_bidang`,
 *               dibaca  `wawancara.alasan_bidang_id`
 *   gaji/nabung: ditulis `wawancara.gaji_yen` / `wawancara.tabungan`,
 *               dibaca  `wawancara.harapan_gaji` / `wawancara.harapan_tabungan`
 *
 * Kalau hanya SATU path yang dibaca, admin membuka CV kandidat → kolom tampak
 * kosong → klik simpan → data kandidat terhapus. Karena itu setiap kunci flat
 * membaca SEMUA kandidat path secara berurutan (path yang kita tulis dulu,
 * lalu path warisan legacy).
 *
 * Sengaja TIDAK mengubah kunci payload: itu kontrak dengan backend yang sudah
 * menyimpan data produksi. Hanya sisi BACA yang dibuat toleran.
 */
import { getPath, isGood } from './helpers_cv';

/**
 * Daftar lengkap kunci flat AiCvForm — SATU sumber kebenaran. AiCvForm
 * membangun `EMPTY_CV` dari sini, dan tes menegaskan `AI_CV_PATHS` menutupi
 * seluruh daftar ini (kunci baru yang lupa dipetakan = kolom yang tidak pernah
 * terisi saat admin memuat CV kandidat).
 */
export const AI_CV_FLAT_KEYS = [
  'nama', 'katakana', 'panggilan', 'panggilan_katakana', 'tmplahir', 'tgllahir', 'umur', 'gender', 'agama',
  /* JP halves of the paired identity columns. Legacy stored these as separate
     columns (`identitas.gender_jp`, `agama_jp`, `status_nikah_jp`) because the
     employer reads the kanji. They must be in the flat key list or the pair
     registry has nowhere to write and the CV ships with an empty JP side. */
  'gender_jp', 'agama_jp', 'status_jp',
  'goldar', 'status', 'anak', 'email', 'alamat', 'hp', 'hpdarurat', 'ktp', 'paspor', 'sim',
  'paspor_status', 'sim_status',
  'tb', 'bb', 'tangan', 'sepatu', 'baju', 'topi', 'tahan_ac',
  'matakanan', 'matakiri', 'kacamata', 'butawarna', 'tato', 'rokok', 'alkohol',
  'alergi_id', 'alergi_jp', 'medis_id', 'medis_jp', 'laka_id', 'laka_jp',
  'riwayatjepang', 'promo_id', 'promo_jp', 'lebih_id', 'lebih_jp', 'kurang_id', 'kurang_jp',
  'hobi_id', 'hobi_jp', 'keahlian_id', 'keahlian_jp', 'moti_id', 'moti_jp',
  'alasan_id', 'alasan_jp', 'pulang_id', 'pulang_jp', 'keinginan_id', 'keinginan_jp',
  'tujuan_id', 'tujuan_jp', 'lama', 'gaji_yen', 'tabungan',
  'bhs_jepang', 'nilai', 'lisensi',
  'kenalan_nama_id', 'kenalan_nama_jp', 'kenalan_hub_id', 'kenalan_hub_jp',
  'kenalan_kerja_id', 'kenalan_kerja_jp', 'kenalan_usia', 'kenalan_alamat_id', 'kenalan_alamat_jp',
] as const;

/** Kunci flat AiCvForm → path bersarang, urut prioritas. */
export const AI_CV_PATHS: Record<string, string[]> = {
  // 1. Identitas & Kontak
  nama: ['identitas.nama_lengkap'],
  katakana: ['identitas.katakana'],
  panggilan: ['identitas.panggilan'],
  panggilan_katakana: ['identitas.panggilan_katakana'],
  tmplahir: ['identitas.tempat_lahir'],
  tgllahir: ['identitas.tgl_lahir'],
  umur: ['identitas.umur', 'identitas.usia'],
  gender: ['identitas.gender'],
  gender_jp: ['identitas.gender_jp'],
  agama: ['identitas.agama'],
  agama_jp: ['identitas.agama_jp'],
  goldar: ['identitas.golongan_darah'],
  status: ['identitas.status_nikah'],
  status_jp: ['identitas.status_nikah_jp'],
  anak: ['identitas.anak'],
  email: ['identitas.email'],
  alamat: ['identitas.alamat'],
  hp: ['identitas.hp', 'identitas.no_wa'],
  hpdarurat: ['identitas.hp_darurat'],
  ktp: ['identitas.ktp'],
  paspor: ['identitas.paspor'],
  sim: ['identitas.sim'],
  paspor_status: ['identitas.paspor_status'],
  sim_status: ['identitas.sim_status'],
  riwayatjepang: ['identitas.status_eks_jepang', 'wawancara.riwayat_jepang'],

  // 2. Fisik & Ukuran
  tb: ['fisik.tb'],
  bb: ['fisik.bb'],
  tangan: ['fisik.tangan_dominan'],
  sepatu: ['fisik.sepatu'],
  baju: ['fisik.baju'],
  topi: ['fisik.topi'],
  tahan_ac: ['fisik.tahan_ac'],

  // 3. Medis & Kebiasaan
  matakiri: ['medis.mata_kiri'],
  matakanan: ['medis.mata_kanan'],
  kacamata: ['medis.kacamata'],
  butawarna: ['medis.buta_warna'],
  tato: ['medis.tato'],
  rokok: ['medis.rokok'],
  alkohol: ['medis.alkohol'],
  alergi_id: ['medis.alergi_id', 'medis.alergi'],
  alergi_jp: ['medis.alergi_jp'],
  medis_id: ['medis.riwayat_medis_id', 'medis.riwayat_penyakit'],
  medis_jp: ['medis.riwayat_medis_jp'],
  laka_id: ['medis.riwayat_kecelakaan_id', 'medis.riwayat_kecelakaan'],
  laka_jp: ['medis.riwayat_kecelakaan_jp'],

  // 4. Jiko PR & Wawancara (bilingual)
  promo_id: ['wawancara.promosi_id'],
  promo_jp: ['wawancara.promosi_jp'],
  lebih_id: ['wawancara.kelebihan_id'],
  lebih_jp: ['wawancara.kelebihan_jp'],
  kurang_id: ['wawancara.kekurangan_id'],
  kurang_jp: ['wawancara.kekurangan_jp'],
  hobi_id: ['wawancara.hobi_id'],
  hobi_jp: ['wawancara.hobi_jp'],
  keahlian_id: ['wawancara.keahlian_khusus', 'wawancara.keahlian_id'],
  keahlian_jp: ['wawancara.keahlian_khusus_jp', 'wawancara.keahlian_jp'],
  moti_id: ['wawancara.motivasi_ke_jepang', 'wawancara.motivasi_id'],
  moti_jp: ['wawancara.motivasi_ke_jepang_jp', 'wawancara.motivasi_jp'],
  alasan_id: ['wawancara.alasan_memilih_bidang', 'wawancara.alasan_bidang_id'],
  alasan_jp: ['wawancara.alasan_memilih_bidang_jp', 'wawancara.alasan_bidang_jp'],
  pulang_id: ['wawancara.rencana_setelah_pulang', 'wawancara.rencana_pulang_id'],
  pulang_jp: ['wawancara.rencana_setelah_pulang_jp', 'wawancara.rencana_pulang_jp'],
  keinginan_id: ['wawancara.keinginan_pribadi', 'wawancara.keinginan_id'],
  keinginan_jp: ['wawancara.keinginan_pribadi_jp', 'wawancara.keinginan_jp'],
  tujuan_id: ['wawancara.tujuan_ke_jepang'],
  tujuan_jp: ['wawancara.tujuan_ke_jepang_jp'],
  lama: ['wawancara.lama_di_jepang', 'wawancara.lama'],
  gaji_yen: ['wawancara.gaji_yen', 'wawancara.harapan_gaji'],
  tabungan: ['wawancara.tabungan', 'wawancara.harapan_tabungan'],

  // 5. Sertifikasi & Bahasa
  // AiCvForm menulis `sertifikasi.bahasa`/`jft`/`ssw`; fieldPaths legacy membaca
  // `sertifikasi.bahasa_jepang`/`nilai`/`lisensi`. Keduanya dibaca.
  // `sertifikasi.bidang` sengaja TIDAK dipakai sebagai fallback `lisensi`:
  // di Form Master itu konsep lain (sektor kerja), bukan nama lisensi SSW.
  bhs_jepang: ['sertifikasi.bahasa', 'sertifikasi.bahasa_jepang'],
  nilai: ['sertifikasi.jft', 'sertifikasi.nilai'],
  lisensi: ['sertifikasi.ssw', 'sertifikasi.lisensi'],

  // 6. Kenalan di Jepang (bilingual)
  kenalan_nama_id: ['kenalan_jepang.nama_id'],
  kenalan_nama_jp: ['kenalan_jepang.nama_jp'],
  kenalan_hub_id: ['kenalan_jepang.hubungan_id'],
  kenalan_hub_jp: ['kenalan_jepang.hubungan_jp'],
  kenalan_kerja_id: ['kenalan_jepang.pekerjaan_id'],
  kenalan_kerja_jp: ['kenalan_jepang.pekerjaan_jp'],
  kenalan_usia: ['kenalan_jepang.usia'],
  kenalan_alamat_id: ['kenalan_jepang.alamat_id'],
  kenalan_alamat_jp: ['kenalan_jepang.alamat_jp'],
};

/**
 * Deep-merge `ai` di atas `base` (AI menang) — padanan `O(e, a)` legacy.
 *
 * Nilai AI yang KOSONG tidak pernah menimpa nilai base yang terisi: AI kerap
 * mengembalikan `''` untuk field yang belum ditanyakan, dan menimpanya akan
 * mengubah kolom master yang sudah benar jadi kosong.
 */
export function mergeAiDraft(base: unknown, ai: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = { ...((base as Record<string, unknown>) || {}) };
  if (!ai || typeof ai !== 'object' || Array.isArray(ai)) return out;
  for (const [k, v] of Object.entries(ai as Record<string, unknown>)) {
    const cur = out[k];
    if (Array.isArray(v)) {
      if (v.length) out[k] = v;
      continue;
    }
    if (v && typeof v === 'object') {
      const curObj = cur && typeof cur === 'object' && !Array.isArray(cur) ? cur : {};
      out[k] = mergeAiDraft(curObj, v);
      continue;
    }
    if (isGood(v)) out[k] = v;
  }
  return out;
}

/** Bentuk bersarang (draf master + ai_data_json) → state flat AiCvForm. */
export function mapAiCvDraft(draft: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [flat, paths] of Object.entries(AI_CV_PATHS)) {
    for (const p of paths) {
      const v = getPath(draft, p);
      if (isGood(v)) {
        out[flat] = String(v).trim();
        break;
      }
    }
  }
  return out;
}

/**
 * Balasan `getDrafCvMaster` → state flat AiCvForm.
 *
 * Backend mengembalikan `buildMasterNested(row)` + `AIDATAJSON` mentah; legacy
 * (`ai_form.ts` `ce()`) mem-parse lalu deep-merge AIDATAJSON di atasnya sebelum
 * memetakan. Tanpa langkah itu kunci khusus AI (promosi_id, alergi_id, …) tidak
 * pernah ikut terbaca.
 */
export function parseAiCvDraft(res: unknown): Record<string, string> {
  const r = (res || {}) as Record<string, unknown>;
  let ai: unknown = null;
  const raw = r.AIDATAJSON;
  if (typeof raw === 'string' && raw.trim() && raw !== '-') {
    try {
      ai = JSON.parse(raw);
    } catch {
      ai = null; // draf lama/rusak — pakai bagian master saja
    }
  }
  return mapAiCvDraft(mergeAiDraft(r, ai));
}
