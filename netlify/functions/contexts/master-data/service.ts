/**
 * contexts/master-data/service.ts — Business logic for master_database_candidate
 *
 * Other contexts and surfaces import ONLY from index.ts.
 */
import { findCandidateByWaFiltered, findCandidates } from '../../_lib/db/candidates';
import { fetchMasterByWa } from '../../_lib/db/master';
import * as session from '../../_lib/session';
import { requireRole, isOwnerOrAdmin } from '../identity';
import { syncBiodataKeMail } from '../applications';
import { nextCandidateId } from '../../_lib/candidate-helpers';
import { cacheClear } from '../../_lib/cache';
import { resolveFileUrl } from '../../_lib/storage';
import {
  findMasterByWa, patchMaster, upsertMaster, findCandidateRow,
  normalizeWa as nw, normalizeWa, pick, supabaseJson, supabaseUpsert,
  toText, APPLY_WA_COLS,
} from './repository';

// --- Constants (moved from actions-master.ts) ---

const MASTER_FIELD_LABEL: Record<string, string> = {
  nama_lengkap: 'nama', furigana: 'furigana', namapanggilan: 'panggilan',
  panggilan_katakana: 'panggilan katakana', gender: 'gender', tempat_lahir: 'tempat lahir',
  tgl_lahir: 'tgl lahir', usia: 'usia', agama: 'agama', status_pernikahan: 'status nikah',
  jumlah_anak: 'anak', nik: 'KTP/NIK', driver_license: 'SIM', alamat_lengkap: 'alamat',
  email: 'email', tb: 'tinggi', bb: 'berat', no_pasport: 'paspor', no_coe: 'nomor COE',
  golongan_darah: 'golongan darah', tangandominan: 'tangan dominan', ukuranbaju: 'ukuran baju',
  ukuransepatu: 'ukuran sepatu', ukuran_topi: 'ukuran topi', tahan_ac: 'tahan AC',
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

const MASTER_COLUMN_MAP: Record<string, string> = {
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
  tglTerbitPaspor: 'tgl_terbit_pasport', expPaspor: 'exp_pasport',
  kotaPaspor: 'kota_terbit_pasport', noCoe: 'no_coe',
};

const JP_TRANSLATE_MAP: Record<string, string> = {
  promosi: 'promosi_diri_jp', kelebihan: 'kelebihan_jp', kekurangan: 'kekurangan_jp',
  hobi: 'hobi_jp', keahlianKhusus: 'keahlian_khusus_jp', alasanBidang: 'alasan_memilih_bidang_jp',
  motivasiJepang: 'motivasi_ke_jepang_jp', keinginan: 'keinginan_pribadi_jp',
  rencanaPulang: 'rencana_setelah_pulang_jp', tujuanJepang: 'tujuan_ke_jepang_jp',
  penyakit: 'riwayat_medis_jp', alergi: 'alergi_jp', laka: 'riwayat_kecelakaan_jp',
  tempatLahir: 'tempat_lahir_jp', agama: 'agama_jp', alamat: 'alamat_jp',
};

const SNAKE_TO_CAMEL: Record<string, string> = {
  tempat_lahir: 'tempatLahir', tgl_lahir: 'tglLahir', alamat_lengkap: 'alamat',
  no_pasport: 'noPaspor', no_coe: 'noCoe', kota_pasport: 'kotaPaspor',
  tgl_pasport: 'tglTerbitPaspor', exp_pasport: 'expPaspor',
};

const MASTER_COLUMN_MISSING = new Set([
  'pendidikan_1_jurusan_id', 'pendidikan_2_jurusan_id', 'pendidikan_4_jurusan_id', 'pendidikan_5_jurusan_id',
  'pekerjaan_2_gaji', 'pekerjaan_3_gaji',
  'keluarga_1_gaji', 'keluarga_2_gaji', 'keluarga_3_gaji', 'keluarga_4_gaji', 'keluarga_5_gaji',
  'keluarga_2_hubungan', 'keluarga_2_nama', 'keluarga_2_usia', 'keluarga_2_pekerjaan',
  'keluarga_3_hubungan', 'keluarga_3_nama', 'keluarga_3_usia', 'keluarga_3_pekerjaan',
  'keluarga_4_hubungan', 'keluarga_4_nama', 'keluarga_4_usia', 'keluarga_4_pekerjaan',
  'keluarga_5_hubungan', 'keluarga_5_nama', 'keluarga_5_usia', 'keluarga_5_pekerjaan',
  'kenalan_di_jepang_pekerjaan', 'kenalan_di_jepang_usia', 'kenalan_di_jepang_alamat',
]);

// --- Helper functions (moved from actions-master.ts) ---

function cleanKey(s: string): string {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function entryHasAny(entry: any, keys: string[]): boolean {
  return keys.some((k) => { const val = entry[k]; return val !== undefined && val !== null && String(val).trim() !== '' && String(val).trim() !== '-'; });
}

function mergeRiwayatArrays(columns: any[], aiArr: any[] | null, keyFn: (e: any) => string): any[] {
  const seen = new Set(); const out: any[] = [];
  const lists: any[] = ([] as any[]).concat(Array.isArray(columns) ? columns : [], Array.isArray(aiArr) ? aiArr : []);
  for (const e of lists) { if (!e || typeof e !== 'object') continue; const k = keyFn(e); if (!k || seen.has(k)) continue; seen.add(k); out.push(e); }
  return out;
}

export function buildMasterNested(row: any): any {
  const v = (col: string, fallback = '') => {
    const x = row[col]; return x !== undefined && x !== null && x !== '' ? toText(x) : fallback !== undefined ? fallback : '';
  };
  let aiParsed: any = null;
  try { const raw = row.ai_data_json; if (typeof raw === 'string' && raw.trim() && raw !== '-') aiParsed = JSON.parse(raw); } catch { aiParsed = null; }
  const aiArrOf = (key: string) => (aiParsed && Array.isArray(aiParsed[key]) ? aiParsed[key] : null);
  return {
    identitas: {
      nama_lengkap: v('nama_lengkap'), katakana: v('furigana'), panggilan: v('namapanggilan'),
      panggilan_katakana: v('panggilan_katakana'), tempat_lahir: v('tempat_lahir'),
      tempat_lahir_jp: v('tempat_lahir_jp'), tgl_lahir: v('tgl_lahir'), umur: v('usia'),
      gender: v('gender'), agama: v('agama'), agama_jp: v('agama_jp'),
      golongan_darah: v('golongan_darah'), status_nikah: v('status_pernikahan'),
      status_pernikahan_jp: v('status_pernikahan_jp'), anak: v('jumlah_anak'),
      email: v('email'), alamat: v('alamat_lengkap'), alamat_jp: v('alamat_jp'),
      hp: v('no_wa'), hp_darurat: v('kontak_darurat_wa'), ktp: v('nik'),
      paspor: v('no_paspor'), sim: v('driver_license'), status_eks_jepang: v('status_eks_jepang'),
      no_coe: v('no_coe'), tgl_terbit_paspor: v('tgl_terbit_pasport'),
      exp_paspor: v('exp_pasport'), kota_terbit_paspor: v('kota_terbit_pasport'),
      kontak_darurat_nama: v('kontak_darurat_nama'), kontak_darurat_hubungan: v('kontak_darurat_hubungan'),
    },
    fisik: { tb: v('tb'), bb: v('bb'), topi: v('ukuran_topi'), baju: v('ukuranbaju'),
      sepatu: v('ukuransepatu'), tangan_dominan: v('tangandominan'), tahan_ac: v('tahan_ac') },
    medis: { mata_kiri: v('mata_kiri'), mata_kanan: v('mata_kanan'), kacamata: v('kacamata'),
      buta_warna: v('buta_warna'), tato: v('tato'), tindik: v('tindik'), rokok: v('merokok'),
      alkohol: v('minum_alkohol'), alergi_id: v('alergi'), alergi_jp: v('alergi_jp'),
      riwayat_medis_id: v('riwayat_penyakit'), riwayat_medis_jp: v('riwayat_medis_jp'),
      riwayat_kecelakaan_id: v('riwayat_kecelakaan'), riwayat_kecelakaan_jp: v('riwayat_kecelakaan_jp') },
    wawancara: {
      keinginan_id: v('keinginan_pribadi'), keinginan_jp: v('keinginan_pribadi_jp'),
      tujuan_ke_jepang: v('tujuan_ke_jepang'), tujuan_ke_jepang_jp: v('tujuan_ke_jepang_jp'),
      riwayat_jepang: v('status_eks_jepang'), promosi_id: v('promosi_diri'),
      promosi_jp: v('promosi_diri_jp'), kelebihan_id: v('kelebihan'), kelebihan_jp: v('kelebihan_jp'),
      kekurangan_id: v('kekurangan'), kekurangan_jp: v('kekurangan_jp'),
      hobi_id: v('hobi_dan_keterampilan'), hobi_jp: v('hobi_jp'),
      keahlian_khusus: v('keahlian_khusus'), keahlian_khusus_jp: v('keahlian_khusus_jp'),
      motivasi_ke_jepang: v('motivasi_ke_jepang'), motivasi_ke_jepang_jp: v('motivasi_ke_jepang_jp'),
      alasan_memilih_bidang: v('alasan_memilih_bidang'), alasan_memilih_bidang_jp: v('alasan_memilih_bidang_jp'),
      rencana_setelah_pulang: v('rencana_setelah_pulang'), rencana_setelah_pulang_jp: v('rencana_setelah_pulang_jp'),
      rencana_pulang_id: v('rencana_setelah_pulang'), rencana_pulang_jp: v('rencana_setelah_pulang_jp'),
      gaji_yen: v('harapan_gaji_yen'), tabungan: v('harapan_tabungan'),
      lama_di_jepang: (aiParsed && aiParsed.wawancara && aiParsed.wawancara.lama_di_jepang !== undefined ? toText(aiParsed.wawancara.lama_di_jepang) : ''),
    },
    sertifikasi: { bahasa: v('bahasa'), jft: v('jft'), ssw: v('ssw'),
      bidang: v('bidangssw') || v('bidang'), bahasa_jepang: v('jft'), nilai: v('jft'), lisensi: v('ssw') },
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
        aiArrOf('pendidikan'), (e) => cleanKey((e.tingkat || '') + (e.sekolah || e.sekolah_id || e.nama_sekolah || '')));
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
          tahun_keluar: v('pekerjaan_' + i + '_tahun_keluar'), gaji: v('pekerjaan_' + i + '_gaji') });
      }
      return mergeRiwayatArrays(arr.filter((e) => entryHasAny(e, ['perusahaan', 'nama_perusahaan', 'jabatan', 'masuk', 'keluar'])),
        aiArrOf('pekerjaan'), (e) => cleanKey((e.perusahaan || e.perusahaan_id || e.nama_perusahaan || '') + (e.jabatan || e.jabatan_id || '')));
    })(),
    keluarga: (function () {
      const arr: any[] = [];
      for (let i = 1; i <= 5; i++) {
        const nm = row['keluarga_' + i + '_nama'];
        if (nm === undefined || nm === null) continue;
        arr.push({ nama: toText(nm), umur: v('keluarga_' + i + '_usia'), usia: v('keluarga_' + i + '_usia'),
          hubungan: v('keluarga_' + i + '_hubungan'), hubungan_jp: v('keluarga_' + i + '_hubungan_jp'),
          pekerjaan: v('keluarga_' + i + '_pekerjaan'), pekerjaan_jp: v('keluarga_' + i + '_pekerjaan_jp') });
      }
      return mergeRiwayatArrays(arr.filter((e) => entryHasAny(e, ['nama', 'hubungan', 'umur', 'usia', 'pekerjaan'])),
        aiArrOf('keluarga'), (e) => cleanKey(e.nama || ''));
    })(),
    kenalan_jepang: (function () {
      const aiK = (aiParsed && aiParsed.kenalan_jepang) || {};
      const src = (col: string, aiKey: string) => { const c = v(col); const a = aiK[aiKey]; return c !== '' ? c : a !== undefined && a !== null ? toText(a) : ''; };
      return { nama_id: src('kenalan_di_jepang_nama', 'nama_id'), nama_jp: src('kenalan_di_jepang_nama_jp', 'nama_jp'),
        hubungan_id: src('kenalan_di_jepang_hubungan', 'hubungan_id'), hubungan_jp: src('kenalan_di_jepang_hubungan_jp', 'hubungan_jp'),
        pekerjaan_id: src('kenalan_di_jepang_pekerjaan', 'pekerjaan_id'), pekerjaan_jp: src('kenalan_di_jepang_pekerjaan_jp', 'pekerjaan_jp'),
        usia: src('kenalan_di_jepang_usia', 'usia'), alamat_id: src('kenalan_di_jepang_alamat', 'alamat_id'),
        alamat_jp: src('kenalan_di_jepang_alamat_jp', 'alamat_jp') };
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
  if (overflow.pendidikan) setSlot('pendidikan', overflow.pendidikan, (e) => cleanKey((e.tingkat || '') + (e.sekolah || '')));
  if (overflow.pekerjaan) setSlot('pekerjaan', overflow.pekerjaan, (e) => cleanKey(e.perusahaan || ''));
  if (overflow.keluarga) setSlot('keluarga', overflow.keluarga, (e) => cleanKey((e.nama || '') + (e.hubungan || '')));
  return ai;
}

export function buildMasterBody(d: any): Record<string, any> {
  const body: Record<string, any> = {};
  for (const [from, to] of Object.entries(SNAKE_TO_CAMEL)) {
    if (d[from] !== undefined && d[from] !== null && d[from] !== '' && d[to] === undefined) d[to] = d[from];
  }
  for (const [from, to] of [['jft_text', 'nilai'], ['jftText', 'nilai'], ['ssw_text', 'lisensi'], ['sswText', 'lisensi']] as const) {
    if (d[from] !== undefined && d[from] !== null && d[from] !== '' && d[to] === undefined) d[to] = d[from];
  }
  for (const [from, col] of Object.entries(MASTER_COLUMN_MAP)) {
    if (d[from] !== undefined && d[from] !== null && d[from] !== '') body[col] = String(d[from]);
  }
  const pickItem = (p: any, ...keys: string[]) => { for (const k of keys) { if (p[k] !== undefined && p[k] !== null) return p[k]; } return ''; };
  const setSlots = (prefix: string, list: any, count: number, defs: ReadonlyArray<readonly [string, ...string[]]>) => {
    if (!Array.isArray(list)) return;
    for (let i = 0; i < count; i++) {
      const p = list[i] || {};
      const vals: Record<string, string> = {};
      for (const [suffix, ...pickKeys] of defs) {
        const v = String(pickItem(p, ...pickKeys));
        if (v !== '') vals[prefix + (i + 1) + suffix] = v;
      }
      if (!Object.keys(vals).length) continue;
      Object.assign(body, vals);
    }
  };
  setSlots('pendidikan_', d.pendidikan, 5, [
    ['_tingkat', 'tingkat'],
    ['_nama_sekolah', 'nama_sekolah', 'namaSekolah', 'sekolah'],
    ['_jurusan_id', 'jurusan', 'jurusan_id'],
    ['_tahun_masuk', 'tahun_masuk', 'tahunMasuk', 'masuk'],
    ['_tahun_lulus', 'tahun_lulus', 'tahunLulus', 'lulus'],
  ] as const);
  setSlots('pekerjaan_', d.pekerjaan, 3, [
    ['_nama_perusahaan', 'nama_perusahaan', 'namaPt', 'namaPerusahaan', 'perusahaan'],
    ['_jabatan', 'jabatan', 'jabatan_id', 'posisi'],
    ['_tahun_masuk', 'tahun_masuk', 'tahunMasuk', 'masuk'],
    ['_tahun_keluar', 'tahun_keluar', 'tahunKeluar', 'keluar'],
    ['_gaji', 'gaji', 'pendapatan'],
  ] as const);
  setSlots('keluarga_', d.keluarga, 5, [
    ['_hubungan', 'hubungan', 'hubungan_id'],
    ['_nama', 'nama'],
    ['_usia', 'usia', 'umur'],
    ['_pekerjaan', 'pekerjaan', 'pekerjaan_id'],
    ['_gaji', 'gaji', 'pendapatan'],
  ] as const);
  for (const col of Object.keys(body)) { if (MASTER_COLUMN_MISSING.has(col)) delete body[col]; }
  return body;
}

async function autoTranslateToJp(idFields: Record<string, string>, existingJp?: Record<string, string>): Promise<Record<string, string>> {
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
    let aiParsed: any = null;
    try { const raw = row.ai_data_json; if (typeof raw === 'string' && raw.trim() && raw !== '-') aiParsed = JSON.parse(raw); } catch { aiParsed = null; }
    const aiKen = (aiParsed && aiParsed.kenalan_jepang) || {};
    const aiOf = (k: string) => { const x = aiKen[k]; return x !== undefined && x !== null ? toText(x) : ''; };
    const out: Record<string, any> = {
      NAMA_LENGKAP: v('nama_lengkap'), FURIGANA: v('furigana'), NAMAPANGGILAN: v('namapanggilan'),
      PANGGILAN_KATAKANA: v('panggilan_katakana'), TEMPAT_LAHIR: v('tempat_lahir'),
      TEMPAT_LAHIR_JP: v('tempat_lahir_jp'), TGL_LAHIR: v('tgl_lahir'), GENDER: v('gender'),
      USIA: v('usia'), AGAMA: v('agama'), AGAMA_JP: v('agama_jp'),
      STATUS_PERNIKAHAN: v('status_pernikahan'), STATUS_NIKAH_JP: v('status_pernikahan_jp'),
      JUMLAH_ANAK: v('jumlah_anak'), NIK: v('nik'), DRIVER_LICENSE: v('driver_license'),
      ALAMAT_LENGKAP: v('alamat_lengkap'), ALAMAT_JP: v('alamat_jp'), EMAIL: v('email'),
      TT: v('tb'), TB: v('tb'), BB: v('bb'), GOLONGAN_DARAH: v('golongan_darah'),
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
      NO_PASPORT: v('no_paspor'), TGL_TERBIT_PASPORT: v('tgl_terbit_pasport'),
      EXP_PASPORT: v('exp_pasport'), KOTA_TERBIT_PASPORT: v('kota_terbit_pasport'),
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
  } catch (e: any) { return { error: 'Gagal memuat data Master: ' + e.message }; }
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
  } catch (e: any) { return { error: e.message }; }
}

export async function handleSubmitMasterForm(payload: any[], sessionToken?: string) {
  cacheClear();
  const d = (payload && payload[0]) || {};
  const wa = nw(String(d.wa || ''));
  const t = session.verifyToken(sessionToken);
  if (!t || (t.role !== 'kandidat' && t.role !== 'admin')) return { success: false, sessionInvalid: true, message: 'Sesi tidak valid' };
  if (!wa) return { success: false, message: 'Nomor WA wajib diisi.' };
  if (!isOwnerOrAdmin(sessionToken, wa)) return { success: false, error: 'Akses ditolak: nomor WA tidak sesuai sesi.' };
  try {
    let row = await findMasterByWa(wa);
    const nama = String(d.nama || '').trim().toUpperCase() || 'KANDIDAT';
    const folder = 'master/' + nama.replace(/[^A-Z0-9_-]/g, '_');
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
      if (row) { for (const [fk, jc] of Object.entries(JP_TRANSLATE_MAP)) { const v = row[jc]; if (v !== undefined && v !== null && String(v).trim()) existingJp[jc] = String(v); } }
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

    if (row && row.id !== undefined) {
      await patchMaster(row.id, body);
    } else {
      body.id_kandidat = await nextCandidateId();
      await upsertMaster(body);
    }

    try {
      if (aiOverflow) {
        let aiBase: any = null;
        if (row && row.ai_data_json) { try { const parsed = JSON.parse(row.ai_data_json); if (parsed && typeof parsed === 'object') aiBase = parsed; } catch { aiBase = null; } }
        const aiNew = mergeAiOverflow(aiBase, aiOverflow);
        const aiPatch = { ai_data_json: JSON.stringify(aiNew), ai_updated_at: new Date().toISOString() };
        if (row && row.id !== undefined) { await patchMaster(row.id, aiPatch); }
        else {
          const rows2 = await supabaseJson('GET', 'master_database_candidate', { query: { select: '*', no_wa: 'eq.' + wa, limit: 5 } });
          const r2 = (Array.isArray(rows2) ? rows2 : []).find((r: any) => nw(String(r.no_wa || '')) === wa);
          if (r2 && r2.id !== undefined) await patchMaster(r2.id, aiPatch);
        }
      }
    } catch { /* ai merge non-fatal */ }

    try {
      let c = await findCandidateByWaFiltered(wa);
      if (c === undefined) { const candFound = await findCandidates(); const want = nw(wa); c = candFound.rows.find((r) => nw(String(pick(r, APPLY_WA_COLS) || '')) === want) || null; }
      const candBody: Record<string, any> = { nama_lengkap: nama };
      for (const [col, dbCol] of [['gender', 'gender'], ['usia', 'usia'], ['tb', 'tb'], ['bb', 'bb'], ['nik', 'nik'], ['email', 'email'], ['tempat_lahir', 'tempat_lahir'], ['tgl_lahir', 'tgl_lahir'], ['alamat_lengkap', 'alamat_lengkap']] as const) {
        if (body[dbCol] !== undefined) candBody[col] = body[dbCol];
      }
      if (fileUrls.pas_photo) candBody.pas_photo = fileUrls.pas_photo;
      if (fileUrls.jft_url) candBody.jft = fileUrls.jft_url;
      if (fileUrls.ssw_url) candBody.ssw = fileUrls.ssw_url;
      if (fileUrls.file_cv) candBody.file_cv = fileUrls.file_cv;
      if (c && c.id !== undefined) { await supabaseJson('PATCH', 'database_candidate', { query: { id: 'eq.' + c.id }, body: candBody, headers: { Prefer: 'return=minimal' } }); }
    } catch { /* sync non-fatal */ }

    try { if (changedLabels.length) await syncBiodataKeMail(wa, nama, changedLabels); } catch { /* non-fatal */ }
    return { success: true };
  } catch (e: any) { return { success: false, error: 'Gagal simpan Master: ' + e.message }; }
}

// ---------------------------------------------------------------------------
// A05 parity (2026-09-04): simpanBiodataLengkap — form biodata pemberkasan
// (KTKLN & Visa) dari modal "Pusat Pemberkasan". Legacy
// js/03_candidate.ts prosesSimpanBiodataLengkap mengirim satu payload datar
// dengan NAMA KUNCI LEGACY (nama_ayah, no_pasport, ...). master_database_candidate
// sudah restruktur ke format JP — pasangan [from, to] memetakan kunci payload
// ke KOLOM ASLI tabel. Field legacy tanpa kolom di-drop (diabaikan) —
// memasukkannya membuat PostgREST menolak SELURUH PATCH (400). Yang di-drop:
// ttl_ayah, ttl_ibu, nama_ibu (skema keluarga hanya punya keluarga_1_nama;
// anggota 2+ hanya *_hubungan_jp), nama_shacou, telp_perusahaan,
// web_perusahaan, alamat_perusahaan.
// ---------------------------------------------------------------------------
const BIO_LENGKAP_MASTER_COLS: ReadonlyArray<readonly [string, string]> = [
  ['email', 'email'], ['tempat_lahir', 'tempat_lahir'], ['tgl_lahir', 'tgl_lahir'],
  ['alamat_lengkap', 'alamat_lengkap'], ['no_coe', 'no_coe'], ['exp_pasport', 'exp_pasport'],
  ['no_pasport', 'no_paspor'], ['kota_pasport', 'kota_terbit_pasport'],
  ['tgl_pasport', 'tgl_terbit_pasport'],
  ['nama_ayah', 'keluarga_1_nama'],
  ['nama_perusahaan', 'pekerjaan_1_nama_perusahaan'],
] as const;

// Kolom biodata yang juga dibaca mapCandidate dari database_candidate.
// Kolom sumber (from) adalah kolom asli master_database_candidate (no_paspor);
// kolom tujuan (to) adalah kolom database_candidate (no_pasport).
export const BIO_LENGKAP_CAND_SYNC: ReadonlyArray<readonly [string, string]> = [
  ['email', 'email'], ['tempat_lahir', 'tempat_lahir'], ['tgl_lahir', 'tgl_lahir'],
  ['alamat_lengkap', 'alamat_lengkap'], ['no_paspor', 'no_pasport'],
] as const;

export function buildCandSyncPatch(master: Record<string, string>): Record<string, string> {
  const candPatch: Record<string, string> = {};
  for (const [from, to] of BIO_LENGKAP_CAND_SYNC) {
    if (master[from]) candPatch[to] = master[from];
  }
  return candPatch;
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
    return { success: true };
  } catch (e: any) {
    return { success: false, error: 'Gagal menyimpan biodata: ' + e.message };
  }
}

export { MASTER_COLUMN_MISSING, buildAiOverflow, mergeAiOverflow, findMasterByWa };
