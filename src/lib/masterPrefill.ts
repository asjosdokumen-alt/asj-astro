/**
 * masterPrefill.ts — Map nested master draft (buildMasterNested shape from
 * getDrafCvMaster) to MasterFullForm state. Pure (DB-free, testable).
 *
 * C02 prefill (2026-09-05): form dibuka dari link ?wa=xxx harus menampilkan
 * data master yang sudah ada (bukan form kosong) supaya edit tidak menimpa
 * kolom yang tidak disentuh. Draft localStorage (asj_master_<wa>) tetap
 * menang di komponen kalau ada — mapper ini dipakai untuk data server.
 */

/* C09 dropdown (2026-09-14): `*Manual` ditambahkan supaya bentuk record yang
   keluar dari prefill sama persis dengan state MasterFullForm. Nilainya selalu
   kosong di sini: prefill memasukkan nilai yang tersimpan ke field utama, dan
   `selectState()` di komponen yang memutuskan apakah nilai itu cocok daftar
   (→ select) atau tidak (→ select parkir di `__LAINNYA__` + teks di kotak
   manual). Tanpa field ini, TypeScript menolak karena state mengharapkannya
   dan nilai lama yang tidak ada di daftar akan tampak hilang. */
export interface PrefillEdu { jenjang: string; nama: string; thnAwal: string; thnAkhir: string; jurusan: string; jurusanManual: string; alamat: string; status: string; }
export interface PrefillJob { perusahaan: string; jabatan: string; jabatanManual: string; thnAwal: string; thnAkhir: string; gaji: string; alasan: string; jenis: string; bidang: string; catatan: string; }
export interface PrefillFam { nama: string; hubungan: string; usia: string; pekerjaan: string; pekerjaanManual: string; tinggal: string; hp: string; gaji: string; }
export interface PrefillKenalan { nama: string; usia: string; hubungan: string; pekerjaan: string; alamat: string; }

export interface MasterFormPrefill {
  data: Record<string, string>;
  eduList: PrefillEdu[];
  jobList: PrefillJob[];
  famList: PrefillFam[];
  kenalan: PrefillKenalan;
  daruratNama: string;
  daruratHubungan: string;
  daruratWa: string;
}

const s = (v: unknown): string => (v === undefined || v === null ? '' : String(v));

const emptyEdu: PrefillEdu = { jenjang: '', nama: '', thnAwal: '', thnAkhir: '', jurusan: '', jurusanManual: '', alamat: '', status: '' };
const emptyJob: PrefillJob = { perusahaan: '', jabatan: '', jabatanManual: '', thnAwal: '', thnAkhir: '', gaji: '', alasan: '', jenis: '', bidang: '', catatan: '' };
const emptyFam: PrefillFam = { nama: '', hubungan: '', usia: '', pekerjaan: '', pekerjaanManual: '', tinggal: '', hp: '', gaji: '' };

export function mapMasterNestedToForm(n: any): MasterFormPrefill {
  const id = (n && n.identitas) || {};
  const fs = (n && n.fisik) || {};
  const md = (n && n.medis) || {};
  const ww = (n && n.wawancara) || {};
  const st = (n && n.sertifikasi) || {};
  const kj = (n && n.kenalan_jepang) || {};
  const data: Record<string, string> = {
    nama: s(id.nama_lengkap), furigana: s(id.katakana), panggilan: s(id.panggilan),
    panggilanKatakana: s(id.panggilan_katakana), tempatLahir: s(id.tempat_lahir),
    tglLahir: s(id.tgl_lahir), usia: s(id.umur), gender: s(id.gender), agama: s(id.agama),
    goldar: s(id.golongan_darah), statusNikah: s(id.status_nikah), anak: s(id.anak),
    email: s(id.email), alamat: s(id.alamat), ktp: s(id.ktp), sim: s(id.sim),
    noPaspor: s(id.paspor), noCoe: s(id.no_coe),
    tglTerbitPaspor: s(id.tgl_terbit_paspor), expPaspor: s(id.exp_paspor),
    kotaPaspor: s(id.kota_terbit_paspor),
    eksJepang: s(id.status_eks_jepang),
    tb: s(fs.tb), bb: s(fs.bb), topi: s(fs.topi), baju: s(fs.baju),
    sepatu: s(fs.sepatu), tangan: s(fs.tangan_dominan), tahanAc: s(fs.tahan_ac),
    mataKiri: s(md.mata_kiri), mataKanan: s(md.mata_kanan), kacamata: s(md.kacamata),
    butaWarna: s(md.buta_warna), tato: s(md.tato), tindik: s(md.tindik),
    merokok: s(md.rokok), alkohol: s(md.alkohol),
    alergi: s(md.alergi_id), penyakit: s(md.riwayat_medis_id), laka: s(md.riwayat_kecelakaan_id),
    promosi: s(ww.promosi_id), kelebihan: s(ww.kelebihan_id), kekurangan: s(ww.kekurangan_id),
    keahlianKhusus: s(ww.keahlian_khusus), hobi: s(ww.hobi_id),
    alasanBidang: s(ww.alasan_memilih_bidang), motivasiJepang: s(ww.motivasi_ke_jepang),
    keinginan: s(ww.keinginan_pribadi), rencanaPulang: s(ww.rencana_setelah_pulang),
    tujuanJepang: s(ww.tujuan_ke_jepang), lamaJepang: s(ww.lama_di_jepang),
    gajiYen: s(ww.gaji_yen), tabungan: s(ww.tabungan),
    bhsJepang: s(st.bahasa || st.bahasa_jepang), nilai: s(st.jft || st.nilai),
    lisensi: s(st.bidang || st.lisensi), lisensi2: s(st.ssw),
    /* ── Migrasi 022 ──────────────────────────────────────────────────────
       Tanpa baris-baris ini form terbuka KOSONG untuk field baru, lalu satu
       tekan "Simpan" menuliskan kosong itu kembali — pola yang sama dengan
       `keinginan`/`motivasi` di `aiCvDraft.ts`. */
    visa: s(id.visa_jepang), negaraLain: s(id.negara_lain),
    jarakJakarta: s(id.jarak_jakarta_km), lamaPenerbangan: s(id.lama_penerbangan),
    rencanaSim: s(id.rencana_sim_bulan), wilayahSekolah: s(id.wilayah_sekolah),
    lamaBelajarJp: s(st.lama_belajar_jp), statusBelajarJp: s(st.status_belajar_jp),
    babBelajarJp: s(st.bab_belajar_jp), levelJepang: s(st.level_bahasa_jepang),
    bhsInggris: s(st.level_bahasa_inggris), bahasaLain: s(st.bahasa_lain),
    sertifikatLain: s(st.sertifikat_lain), catatanCv: s(st.catatan_cv),
    tesHitung: s(fs.tes_hitung), tesPushup: s(fs.tes_pushup), tesSquat: s(fs.tes_squat),
    tinggalKursus: s(fs.tinggal_kursus_tahun), olahraga: s(fs.olahraga),
    mbti: s(ww.mbti), kenalanStatusTinggal: s(kj.status_tinggal),
  };
  const eduList: PrefillEdu[] = (Array.isArray(n?.pendidikan) ? n.pendidikan : []).slice(0, 5).map((p: any) => ({
    jenjang: s(p.tingkat), nama: s(p.sekolah || p.nama_sekolah), thnAwal: s(p.tahun_masuk || p.masuk),
    thnAkhir: s(p.tahun_lulus || p.lulus), jurusan: s(p.jurusan || p.jurusan_id), jurusanManual: '', alamat: '',
    status: s(p.status_sekolah),
  }));
  const jobList: PrefillJob[] = (Array.isArray(n?.pekerjaan) ? n.pekerjaan : []).slice(0, 3).map((j: any) => ({
    perusahaan: s(j.perusahaan || j.nama_perusahaan), jabatan: s(j.jabatan), jabatanManual: '',
    thnAwal: s(j.tahun_masuk || j.masuk), thnAkhir: s(j.tahun_keluar || j.keluar),
    gaji: s(j.gaji), alasan: '',
    jenis: s(j.jenis), bidang: s(j.bidang), catatan: s(j.catatan),
  }));
  const famList: PrefillFam[] = (Array.isArray(n?.keluarga) ? n.keluarga : []).slice(0, 5).map((k: any) => ({
    nama: s(k.nama), hubungan: s(k.hubungan), usia: s(k.usia || k.umur), pekerjaan: s(k.pekerjaan), pekerjaanManual: '',
    tinggal: s(k.tinggal), hp: s(k.hp), gaji: s(k.gaji),
  }));
  return {
    data,
    eduList: eduList.length ? eduList : [emptyEdu],
    jobList: jobList.length ? jobList : [emptyJob],
    famList: famList.length ? famList : [emptyFam],
    kenalan: { nama: s(kj.nama_id), usia: s(kj.usia), hubungan: s(kj.hubungan_id), pekerjaan: s(kj.pekerjaan_id), alamat: s(kj.alamat_id) },
    daruratNama: s(id.kontak_darurat_nama),
    daruratHubungan: s(id.kontak_darurat_hubungan),
    daruratWa: s(id.hp_darurat),
  };
}
