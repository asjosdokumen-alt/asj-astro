import type { CandidateData } from './types';
import { getPath, isGood, makeV, fmtMonthYearJp, mergeArrRiwayat } from '../helpers_cv';

const KEYOF: Record<string, (e: Record<string, unknown>) => string> = {
  pendidikan: (e) => (String(e.tingkat || '') + String(e.sekolah || e.sekolah_id || e.nama_sekolah || '')).toLowerCase().replace(/[^a-z0-9]/g, ''),
  pekerjaan: (e) => (String(e.perusahaan || e.perusahaan_id || e.nama_perusahaan || '') + String(e.jabatan || e.jabatan_id || '')).toLowerCase().replace(/[^a-z0-9]/g, ''),
  keluarga: (e) => String(e.nama || '').toLowerCase().replace(/[^a-z0-9]/g, ''),
};

export function normalizeMasterData(row: Record<string, unknown>): CandidateData {
  let ai: Record<string, unknown> = {};
  try {
    const raw = row.AIDATAJSON;
    if (typeof raw === 'string' && raw.trim() && raw !== '-') ai = JSON.parse(raw);
  } catch { /* ignore */ }

  const v = makeV(row, ai);
  const getArr = (key: string) => mergeArrRiwayat(getPath(row, key), getPath(ai, key), KEYOF[key]);

  const pendidikan = getArr('pendidikan');
  const pekerjaan = getArr('pekerjaan');
  const keluarga = getArr('keluarga');

  const uploads = row.uploads as Record<string, unknown> | undefined;

  return {
    identitas: {
      nama_lengkap: v('NAMALENGKAP', 'NAMA', 'nama_lengkap'),
      katakana: v('FURIGANA', 'KATAKANA', 'NAMAKATAKANA', 'furigana', 'identitas.katakana'),
      panggilan: v('NAMAPANGGILAN', 'PANGGILAN', 'namapanggilan', 'identitas.panggilan'),
      panggilan_katakana: v('PANGGILANKATAKANA', 'KATAKANAPANGGILAN', 'PANGGILANJP', 'panggilan_katakana'),
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
    },
    fisik: {
      tb: v('TB', 'TINGGI', 'fisik.tb'),
      bb: v('BB', 'BERAT', 'fisik.bb'),
      topi: v('UKURANTONI', 'UKURANTOPI', 'fisik.topi'),
      baju: v('UKURANBAJU', 'fisik.baju'),
      sepatu: v('UKURANSEPATU', 'fisik.sepatu'),
      tangan_dominan: v('TANGANDOMINAN', 'TANGAN', 'fisik.tangan_dominan'),
      tahan_ac: v('TAHANAC', 'fisik.tahan_ac'),
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
