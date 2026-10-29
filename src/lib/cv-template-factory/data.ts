import type { CandidateData } from './types';
import { getPath, makeV, mergeArrRiwayat, normalizeRiwayatFor, getTingkatVal, sortRiwayatKronologis, riwayatKeyOf } from '../helpers_cv';

const KEYOF: Record<string, (e: Record<string, unknown>) => string> = {
  pendidikan: (e) => riwayatKeyOf('pendidikan', e),
  pekerjaan: (e) => riwayatKeyOf('pekerjaan', e),
  keluarga: (e) => riwayatKeyOf('keluarga', e),
};

export function normalizeMasterData(row: Record<string, unknown>): CandidateData {
  let ai: Record<string, unknown> = {};
  try {
    const raw = row.AIDATAJSON;
    if (typeof raw === 'string' && raw.trim() && raw !== '-') ai = JSON.parse(raw);
  } catch { /* ignore */ }

  const v = makeV(row, ai);
  const getArr = (key: string) => mergeArrRiwayat(getPath(row, key), getPath(ai, key), KEYOF[key], normalizeRiwayatFor(key));

  // KRONOLOGIS (paling lama dulu) di sini, di satu tempat kedua array digabung,
  // supaya setiap renderer (excel/pdf/docx/rirekisho) mewarisinya.
  //
  // SEBELUM 2026-10-29: pendidikan diurutkan per JENJANG (SD → SMA) dan
  // pekerjaan TIDAK diurutkan sama sekali. Untuk data yang konsisten keduanya
  // kebetulan sama, tetapi rirekisho Jepang membaca TAHUN, bukan jenjang —
  // kandidat yang masuk SMK setelah SMA tercetak terbalik. Laporan pemilik:
  // "riwayat sekolah gak urut, riwayat kerja gak auto urut sesuai tahun dan
  // bulan kerjanya".
  const pendidikan = sortRiwayatKronologis(getArr('pendidikan'), {
    // Tanggal mulai sama (jarang): jenjang yang lebih rendah dulu.
    tiebreak: (a, b) => getTingkatVal(a.tingkat) - getTingkatVal(b.tingkat),
  });
  const pekerjaan = sortRiwayatKronologis(getArr('pekerjaan'));
  const keluarga = getArr('keluarga');

  const uploads = row.uploads as Record<string, unknown> | undefined;

  return {
    identitas: {
      // 🔴 `identitas.nama_lengkap` WAJIB ada di daftar: `getDrafCvMaster`
      // mengembalikan bentuk BERSARANG dan `makeV` hanya mencari di TOP-LEVEL.
      // Tanpa ini sel NAMA di CV Excel/PDF/DOCX kosong (pratinjau HTML benar).
      nama_lengkap: v('NAMALENGKAP', 'NAMA', 'nama_lengkap', 'identitas.nama_lengkap'),
      katakana: v('FURIGANA', 'KATAKANA', 'NAMAKATAKANA', 'furigana', 'identitas.katakana'),
      panggilan: v('NAMAPANGGILAN', 'PANGGILAN', 'namapanggilan', 'identitas.panggilan'),
      panggilan_katakana: v('PANGGILANKATAKANA', 'KATAKANAPANGGILAN', 'PANGGILANJP', 'panggilan_katakana', 'identitas.panggilan_katakana'),
      tempat_lahir: v('TEMPATLAHIR', 'identitas.tempat_lahir'),
      tempat_lahir_jp: v('TEMPATLAHIRJP', 'identitas.tempat_lahir_jp'),
      tgl_lahir: v('TGLLAHIR', 'TANGGALLAHIR', 'identitas.tgl_lahir'),
      umur: v('USIA', 'UMUR', 'identitas.umur'),
      gender: v('GENDER', 'JENISKELAMIN', 'identitas.gender'),
      agama: v('AGAMA', 'identitas.agama'),
      agama_jp: v('AGAMAJP', 'identitas.agama_jp'),
      golongan_darah: v('GOLONGANDARAH', 'GOLDAR', 'identitas.golongan_darah'),
      status_nikah: v('STATUSPERNIKAHAN', 'STATUSNIKAH', 'identitas.status_nikah'),
      anak: v('JUMLAHANAK', 'identitas.anak'),
      email: v('EMAIL', 'identitas.email'),
      alamat: v('ALAMATLENGKAP', 'ALAMAT', 'identitas.alamat'),
      alamat_jp: v('ALAMATJP', 'identitas.alamat_jp'),
      hp: v('NOHP', 'WA', 'no_wa', 'identitas.hp'),
      hp_darurat: v('KONTAKDARURATWA', 'identitas.hp_darurat'),
      ktp: v('NIK', 'ktp', 'identitas.ktp'),
      paspor: v('PASPOR', 'no_paspor', 'identitas.paspor'),
      sim: v('SIM', 'driver_license', 'identitas.sim'),
      status_eks_jepang: v('PERNAHKEJEPANG', 'STATUSEKSJEPANG', 'identitas.status_eks_jepang'),
      no_coe: v('NOCOE', 'identitas.no_coe'),
      kontak_darurat_nama: v('KONTAKDARURATNAMA', 'identitas.kontak_darurat_nama'),
      kontak_darurat_hubungan: v('KONTAKDARURATHUBUNGAN', 'identitas.kontak_darurat_hubungan'),
      /* ── Perjalanan & tambahan identitas (migrasi 022) ─────────────────── */
      visa_jepang: v('VISAJEPANG', 'identitas.visa_jepang'),
      negara_lain: v('NEGARALAIN', 'identitas.negara_lain'),
      jarak_jakarta_km: v('JARAKJAKARTA', 'identitas.jarak_jakarta_km'),
      lama_penerbangan: v('LAMAPENERBANGAN', 'identitas.lama_penerbangan'),
      rencana_sim_bulan: v('RENCANASIM', 'identitas.rencana_sim_bulan'),
      wilayah_sekolah: v('WILAYAHSEKOLAH', 'identitas.wilayah_sekolah'),
    },
    fisik: {
      tb: v('TB', 'TINGGI', 'fisik.tb'),
      bb: v('BB', 'BERAT', 'fisik.bb'),
      topi: v('UKURANTONI', 'UKURANTOPI', 'fisik.topi'),
      baju: v('UKURANBAJU', 'fisik.baju'),
      sepatu: v('UKURANSEPATU', 'fisik.sepatu'),
      tangan_dominan: v('TANGANDOMINAN', 'TANGAN', 'fisik.tangan_dominan'),
      tahan_ac: v('TAHANAC', 'fisik.tahan_ac'),
      /* ── Tes & kebiasaan fisik (migrasi 022) ───────────────────────────── */
      tes_hitung: v('TESHITUNG', 'fisik.tes_hitung'),
      tes_pushup: v('TESPUSHUP', 'fisik.tes_pushup'),
      tes_squat: v('TESSQUAT', 'fisik.tes_squat'),
      tinggal_kursus_tahun: v('TINGGALKURSUS', 'fisik.tinggal_kursus_tahun'),
      olahraga: v('OLAHRAGA', 'fisik.olahraga'),
    },
    medis: {
      mata_kiri: v('MATAKIRI', 'medis.mata_kiri'),
      mata_kanan: v('MATAKANAN', 'medis.mata_kanan'),
      kacamata: v('KACAMATA', 'medis.kacamata'),
      buta_warna: v('BUTAWARNA', 'medis.buta_warna'),
      tato: v('TATO', 'medis.tato'),
      tindik: v('TINDIK', 'medis.tindik'),
      rokok: v('MEROKOK', 'medis.rokok'),
      alkohol: v('MINUMALKOHOL', 'medis.alkohol'),
      alergi: v('ALERGI', 'medis.alergi'),
      alergi_jp: v('ALERGIJP', 'medis.alergi_jp'),
      riwayat_medis: v('RIWAYATPENYAKIT', 'RIWAYATPENYAKITID', 'medis.riwayat_medis_id'),
      riwayat_medis_jp: v('RIWAYATPENYAKITJP', 'medis.riwayat_medis_jp'),
      riwayat_kecelakaan: v('RIWAYATKECELAKAAN', 'medis.riwayat_kecelakaan_id'),
      riwayat_kecelakaan_jp: v('RIWAYATKECELAKAANJP', 'medis.riwayat_kecelakaan_jp'),
    },
    pendidikan,
    pekerjaan,
    keluarga,
    sertifikasi: {
      bahasa: v('BAHASA', 'sertifikasi.bahasa'),
      jft: v('JFT', 'JFTTEXT', 'sertifikasi.bahasa_jepang', 'sertifikasi.nilai'),
      nilai: v('NILAIJFT', 'sertifikasi.nilai'),
      ssw: v('SSW', 'SSWTEXT', 'sertifikasi.lisensi'),
      lisensi: v('LISENSI', 'sertifikasi.lisensi'),
      bidang: v('BIDANG', 'BIDANGSSW', 'sertifikasi.bidang'),
      /* ── Bahasa & sertifikat tambahan (migrasi 022) ────────────────────── */
      lama_belajar_jp: v('LAMABELAJARJP', 'sertifikasi.lama_belajar_jp'),
      status_belajar_jp: v('STATUSBELAJARJP', 'sertifikasi.status_belajar_jp'),
      bab_belajar_jp: v('BABBELAJARJP', 'sertifikasi.bab_belajar_jp'),
      level_bahasa_inggris: v('LEVELINGGRIS', 'sertifikasi.level_bahasa_inggris'),
      bahasa_lain: v('BAHASALAIN', 'sertifikasi.bahasa_lain'),
      level_bahasa_jepang: v('LEVELJEPANG', 'sertifikasi.level_bahasa_jepang'),
      sertifikat_lain: v('SERTIFIKATLAIN', 'sertifikasi.sertifikat_lain'),
      catatan_cv: v('CATATANCV', 'sertifikasi.catatan_cv'),
    },
    wawancara: {
      tujuan_ke_jepang: v('TUJUANKEJEPANG', 'MOTIVASIKEJEPANG', 'MOTIVASIID', 'wawancara.tujuan_ke_jepang', 'wawancara.motivasi_id'),
      tujuan_ke_jepang_jp: v('TUJUANKEJEPANGJP', 'MOTIVASIKEJEPANGJP', 'MOTIVASIJP', 'wawancara.tujuan_ke_jepang_jp', 'wawancara.motivasi_jp'),
      rencana_pulang: v('RENCANAPULANG', 'RENCANASETELAHPULANG', 'wawancara.rencana_setelah_pulang'),
      rencana_pulang_jp: v('RENCANAPULANGJP', 'wawancara.rencana_pulang_jp'),
      kelebihan: v('KELEBIHAN', 'KELEBIHANID', 'wawancara.kelebihan_id'),
      kelebihan_jp: v('KELEBIHANJP', 'wawancara.kelebihan_jp'),
      kekurangan: v('KEKURANGAN', 'KEKURANGANID', 'wawancara.kekurangan_id'),
      kekurangan_jp: v('KEKURANGANJP', 'wawancara.kekurangan_jp'),
      hobi: v('HOBI', 'HOBIID', 'wawancara.hobi_id'),
      hobi_jp: v('HOBIJP', 'wawancara.hobi_jp'),
      motivasi_ke_jepang: v('MOTIVASIKEJEPANG', 'MOTIVASIID', 'wawancara.motivasi_ke_jepang', 'wawancara.motivasi_id'),
      motivasi_ke_jepang_jp: v('MOTIVASIKEJEPANGJP', 'MOTIVASIJP', 'wawancara.motivasi_jp'),
      // 🔴 `getDrafCvMaster` mengembalikan bentuk BERSARANG, dan di bentuk itu
      // kuncinya bernama `wawancara.promosi_jp` — BUKAN `promosi_diri_jp`
      // (`buildMasterNested`, service.ts:374). Renderer form KINKI dulu membaca
      // `raw.promosi_diri_jp`, yang tidak pernah ada, sehingga 性格診断テスト
      // keluar kosong untuk SEMUA kandidat. Dua baris ini yang menutupnya.
      promosi: v('PROMOSIDIRI', 'promosi_diri', 'wawancara.promosi_id', 'wawancara.promosi'),
      promosi_jp: v('PROMOSIDIRIJP', 'promosi_diri_jp', 'wawancara.promosi_jp'),
      keahlian_khusus: v('KEAHLIANKHUSUS', 'keahlian_khusus', 'wawancara.keahlian_khusus'),
      keahlian_khusus_jp: v('KEAHLIANKHUSUSJP', 'keahlian_khusus_jp', 'wawancara.keahlian_khusus_jp'),
      /* 在日期間 & MBTI (migrasi 022). `lama_di_jepang` dulu hanya hidup di
         `ai_data_json`; `mbti` dulu disimpulkan `inferMbti()`. */
      lama_di_jepang: v('LAMADIJEPANG', 'wawancara.lama_di_jepang'),
      mbti: v('MBTI', 'wawancara.mbti'),
      /* Lama KERJA yang diharapkan — KINKI `X47` 就業希望年数. */
      lamakerja_diharapkan: v('LAMAKERJADIHARAPKAN', 'wawancara.lamakerja_diharapkan'),
      /* Harapan gaji & tabungan — Firma `D9` (希望収入), KINKI `X45` (目標貯金).
         Kolomnya sudah lama ada dan terisi (12 & 10 baris) tetapi tidak pernah
         dipetakan di sini, jadi kedua sel selalu memakai angka bawaan form. */
      gaji_yen: v('HARAPANGAJIYEN', 'wawancara.gaji_yen'),
      tabungan: v('HARAPANTABUNGAN', 'wawancara.tabungan'),
    },
    kenalan_jepang: {
      nama_id: v('KENALANNAMAID', 'KENALANDIJEPANGNAMA', 'kenalan_jepang.nama_id'),
      nama_jp: v('KENALANNAMAJP', 'kenalan_jepang.nama_jp'),
      hubungan_id: v('KENALANHUBID', 'KENALANDIJEPANGHUBUNGAN', 'kenalan_jepang.hubungan_id'),
      hubungan_jp: v('KENALANHUBJP', 'kenalan_jepang.hubungan_jp'),
      pekerjaan_id: v('KENALANKERJAID', 'KENALANDIJEPANGPEKERJAAN', 'kenalan_jepang.pekerjaan_id'),
      pekerjaan_jp: v('KENALANKERJAJP', 'kenalan_jepang.pekerjaan_jp'),
      usia: v('KENALANUSIA', 'KENALANDIJEPANGUSIA', 'kenalan_jepang.usia'),
      alamat_id: v('KENALANALAMATID', 'KENALANDIJEPANGALAMAT', 'kenalan_jepang.alamat_id'),
      alamat_jp: v('KENALANALAMATJP', 'kenalan_jepang.alamat_jp'),
      /* 在留資格(在留期間) — JIPA `J43` (migrasi 022). */
      status_tinggal: v('KENALANSTATUSTINGGAL', 'kenalan_jepang.status_tinggal'),
    },
    uploads: {
      photo: (uploads && uploads.photo) || (row as Record<string, unknown>).pas_photo || '',
      cv: (uploads && uploads.cv) || (row as Record<string, unknown>).file_cv || '',
      jft: (uploads && uploads.jft) || (row as Record<string, unknown>).jft_url || '',
      ssw: (uploads && uploads.ssw) || (row as Record<string, unknown>).ssw_url || '',
      ktp: (uploads && uploads.ktp) || (row as Record<string, unknown>).ktp_url || '',
      kk: (uploads && uploads.kk) || (row as Record<string, unknown>).kk_url || '',
      ijazah_sd: (uploads && uploads.ijazahSd) || (row as Record<string, unknown>).ijazah_sd_url || '',
      ijazah_smp: (uploads && uploads.ijazahSmp) || (row as Record<string, unknown>).ijazah_smp_url || '',
      ijazah_sma: (uploads && uploads.ijazahSma) || (row as Record<string, unknown>).ijazah_sma_url || '',
      univ: (uploads && uploads.univ) || (row as Record<string, unknown>).univ_url || '',
      sim: (uploads && uploads.sim) || (row as Record<string, unknown>).driver_license_url || (row as Record<string, unknown>).sim_url || '',
    },
    raw: row,
  };
}
