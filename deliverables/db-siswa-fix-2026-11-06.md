# Perbaikan data siswa dari `DATABASE SISWA ASJ.xlsx` — 2026-11-06

Sumber: `C:/Users/k89/Downloads/DATABASE SISWA ASJ.xlsx` (sheet `kelas h/i/j/k database`).
Tujuan: **hanya mengisi kolom yang masih kosong** + memperbaiki tanggal lahir yang bergeser.

## Ringkasan

| Tindakan | Jumlah |
|---|---|
| Tanggal lahir diperbaiki | **63** (62 di tabel + `ASJ00122`) |
| Kolom kosong diisi | **108** (+3 di `ASJ00122`) |
| Siswa di sheet yang tidak punya baris DB | 4 (+1 tanpa data) |

Kolom yang diisi:

- `kontak_darurat_wa`: 39
- `golongan_darah`: 35
- `nik`: 31
- `tb`: 1
- `bb`: 1
- `alamat_lengkap`: 1

## 1. Tanggal lahir yang diperbaiki

Penyebab: tanggal dari formulir tersimpan sebagai tengah malam WIB dalam bentuk UTC
(`...T17:00:00.000Z`), lalu dibaca sebagai tanggal UTC ⇒ **mundur satu hari**.
Kode `toDateOnly()` sudah diperbaiki; data lama belum.

Bukti silang: **107 dari 119** NIK yang ada di sheet meng-encode tanggal yang sama
dengan kolom `TL` sheet, dan hanya 7 yang cocok dengan nilai lama di DB.

| ID | Nama | Kelas | Lama | Baru | Sebab |
|---|---|---|---|---|---|
| ASJ00087 | ALFIYATU NIDA MILATI | - | 2005-09-11 | **2005-09-12** | bergeser -1 hari |
| ASJ00089 | IRA DWI FEBRIYANTI | H | 2004-12-09 | **2004-12-10** | bergeser -1 hari |
| ASJ00090 | ADI SUYATNO | H | 1999-09-02 | **1999-09-03** | bergeser -1 hari |
| ASJ00091 | KHEN ZAIR ALI BIN SUDARNESTY | I | 2004-08-23 | **2004-08-24** | bergeser -1 hari |
| ASJ00092 | DICKY SAPUTRA | H | 2005-12-30 | **2005-12-31** | bergeser -1 hari |
| ASJ00093 | YOGA AJI SAPUTRA | I | 2000-05-09 | **2000-05-10** | bergeser -1 hari |
| ASJ00099 | MUHAMMAD RIFKY ALFAREZ | J | 2003-03-25 | **2003-03-26** | bergeser -1 hari |
| ASJ00101 | CALVIN MARSHALL OCTARA | J | 2006-10-12 | **2006-10-13** | bergeser -1 hari |
| ASJ00102 | KAVITA EKA AULIA FIRDIAN | H | 2002-09-12 | **2002-09-13** | bergeser -1 hari |
| ASJ00103 | HARUN EFENDI | I | 1998-11-25 | **1998-11-26** | bergeser -1 hari |
| ASJ00105 | DEWI ANJANI | J | 2007-08-07 | **2007-08-08** | bergeser -1 hari |
| ASJ00106 | MEILA PRADINA WANTI | I | 2007-05-12 | **2007-05-13** | bergeser -1 hari |
| ASJ00107 | REIHAN OKTA NOVRIANDA | J | 2006-11-14 | **2006-11-15** | bergeser -1 hari |
| ASJ00108 | DINA EKA YULIANA | J | 2005-06-21 | **2005-06-22** | bergeser -1 hari |
| ASJ00111 | LILIN AYU ANDHYNI | I | 2002-07-26 | **2002-07-27** | bergeser -1 hari |
| ASJ00114 | AHMAD FADILLAH | I | 2005-05-07 | **2005-05-08** | bergeser -1 hari |
| ASJ00115 | YUNI EKA RIZKY AMALIA PUTRI | J | 2001-06-13 | **2001-06-14** | bergeser -1 hari |
| ASJ00116 | GISELA AURELIA | I | 2007-05-31 | **2007-06-01** | bergeser -1 hari |
| ASJ00117 | HAEKAL NABIL ALFATIH | J | 2008-02-09 | **2008-02-10** | bergeser -1 hari |
| ASJ00118 | REZA FAJAR PRADIKA | I | 2002-06-11 | **2002-06-12** | bergeser -1 hari |
| ASJ00121 | SEPTIAN DWI EFENDI | I | 2005-09-08 | **2005-09-09** | bergeser -1 hari |
| ASJ00123 | YUSUF AFFENDI | - | 2002-05-27 | **2002-05-28** | bergeser -1 hari |
| ASJ00125 | ENZZEL RIKA OKATAVIANA | H | 2003-01-17 | **2003-01-18** | bergeser -1 hari |
| ASJ00128 | LUKMAN HAKIM | J | 2004-06-21 | **2004-06-22** | bergeser -1 hari |
| ASJ00129 | SANTI SETIAWATI | H | 2004-03-29 | **2004-03-30** | bergeser -1 hari |
| ASJ00131 | GISHELA ANGELING HIJRAH | I | 2006-05-26 | **2006-05-27** | bergeser -1 hari |
| ASJ00134 | ERIKA BETRISYA | H | 2006-09-19 | **2006-09-20** | bergeser -1 hari |
| ASJ00137 | SINTI SYETIRA | H | 2000-01-22 | **2000-01-23** | bergeser -1 hari |
| ASJ00142 | YOHANA | J | 01-08-2001 | **2001-08-01** | beda -205 hari (bukan geser) |
| ASJ00143 | FAIQ FADHAIL RAJWA PRAYANI | H | 2004-05-10 | **2004-05-11** | bergeser -1 hari |
| ASJ00144 | MUHAMAD ANGGA SAPUTRA | I | 2007-06-28 | **2007-06-29** | bergeser -1 hari |
| ASJ00146 | AHSIN MUHAMMAD | I | 2000-12-05 | **2000-12-06** | bergeser -1 hari |
| ASJ00148 | ANIS AGUSTIN | J | 2001-05-07 | **2001-08-05** | beda -90 hari (bukan geser) |
| ASJ00149 | WIWIN HARIATI | I | 2004-03-17 | **2004-03-18** | bergeser -1 hari |
| ASJ00150 | ZAINATUTS TSANIAH | I | 2002-09-10 | **2002-09-11** | bergeser -1 hari |
| ASJ00151 | SUKMA ARUM ROYANA | - | 2003-03-20 | **2003-03-21** | bergeser -1 hari |
| ASJ00152 | ALZA ANNISA NIDZAAN KHOFIFAH | J | 2006-01-13 | **2006-01-14** | bergeser -1 hari |
| ASJ00153 | FAHRU DWI NUR PRASETYA | I | 2005-02-27 | **2005-02-28** | bergeser -1 hari |
| ASJ00154 | MUHAMMAD NIJAM | - | 1999-05-22 | **1999-05-23** | bergeser -1 hari |
| ASJ00157 | RISMA DWI RAHAYU | J | 2008-04-04 | **2008-04-05** | bergeser -1 hari |
| ASJ00158 | ARBI ALVIANSYAH | I | 2006-03-03 | **2006-03-04** | bergeser -1 hari |
| ASJ00159 | REVIN ANTHONIO NOVRI ANDHI | J | 2006-11-26 | **2006-11-27** | bergeser -1 hari |
| ASJ00160 | MIFTACHUL ICHWA SYAVAUDIN | I | 2006-10-27 | **2006-10-28** | bergeser -1 hari |
| ASJ00161 | DAVID AGIFA SAPUTRA | H | 2005-11-06 | **2005-11-07** | bergeser -1 hari |
| ASJ00162 | RINGGA NUR WIRAATMAJA | J | 2008-01-18 | **2008-01-19** | bergeser -1 hari |
| ASJ00163 | WAHYU ALI MUSTOFA | J | 2007-07-17 | **2007-07-18** | bergeser -1 hari |
| ASJ00166 | MUHAMMAD FATIHUL HAQ | - | 2006-12-08 | **2006-12-09** | bergeser -1 hari |
| ASJ00167 | TONY HERMAWAN | J | 2002-04-13 | **2002-04-14** | bergeser -1 hari |
| ASJ00168 | DIMAS RADITYA SUQIRMAN | J | 2004-06-18 | **2004-06-19** | bergeser -1 hari |
| ASJ00169 | AGHNIYA CITRA INDIANI | I | 2006-12-02 | **2006-12-03** | bergeser -1 hari |
| ASJ00170 | ADITYA RIZKI PRATAMA | J | 2007-07-09 | **2007-07-10** | bergeser -1 hari |
| ASJ00172 | DEVI DWI RATNASARI | H | 2007-05-19 | **2007-05-20** | bergeser -1 hari |
| ASJ00175 | TITANIA PUTRI PRATIWI | I | 2003-05-17 | **2003-05-18** | bergeser -1 hari |
| ASJ00177 | ALVINA DAMAYANTI | I | 2008-05-06 | **2008-05-07** | bergeser -1 hari |
| ASJ00180 | MUHAMAD ALIF CHOIRUL ARIFIN | I | 2005-11-24 | **2005-11-25** | bergeser -1 hari |
| ASJ00183 | YOGA PRAMUDIYA WAHDANI | - | 2004-12-09 | **2004-12-10** | bergeser -1 hari |
| ASJ00184 | ALMA NUR ISTIQOMAH | J | 2004-05-03 | **2004-05-04** | bergeser -1 hari |
| ASJ00185 | KRISNA ADITYA | I | 2004-07-07 | **2004-07-08** | bergeser -1 hari |
| ASJ00186 | APRILIA ANGGREINI | J | 2008-04-13 | **2008-04-14** | bergeser -1 hari |
| ASJ00220 | DEILA RAHMA AGNISA | I | 2005-06-04 | **2007-03-13** | beda -647 hari (bukan geser) |
| ASJ00222 | SATRIA PUTRA DEWANGGA | - | (kosong) | **2008-02-05** | kosong |
| ASJ00230 | NATASYA PRIENDITA NURAZIZAH | - | 2020-10-17 | **2006-10-17** | beda 5114 hari (bukan geser) |

> Tambahan: `ASJ00122` (SATRIA PUTRA DEWANGGA) juga dibetulkan — `2008-02-04` → `2008-02-05`,
> NIK dan kontak darurat diisi. Baris ini kembar dengan `ASJ00222` (lihat §4).

## 2. Kolom kosong yang diisi

| ID | Nama | Kolom | Nilai |
|---|---|---|---|
| ASJ00087 | ALFIYATU NIDA MILATI | `golongan_darah` | O |
| ASJ00087 | ALFIYATU NIDA MILATI | `kontak_darurat_wa` | 6282245068515 |
| ASJ00087 | ALFIYATU NIDA MILATI | `nik` | 3502155209050003 |
| ASJ00089 | IRA DWI FEBRIYANTI | `golongan_darah` | B |
| ASJ00089 | IRA DWI FEBRIYANTI | `nik` | 3502205002070001 |
| ASJ00090 | ADI SUYATNO | `golongan_darah` | O |
| ASJ00090 | ADI SUYATNO | `kontak_darurat_wa` | 6285869036400 |
| ASJ00090 | ADI SUYATNO | `nik` | 3326080309990022 |
| ASJ00091 | KHEN ZAIR ALI BIN SUDARNESTY | `kontak_darurat_wa` | 6282140945706 |
| ASJ00092 | DICKY SAPUTRA | `golongan_darah` | O |
| ASJ00092 | DICKY SAPUTRA | `kontak_darurat_wa` | 6281217896125 |
| ASJ00092 | DICKY SAPUTRA | `nik` | 3522153112050003 |
| ASJ00093 | YOGA AJI SAPUTRA | `golongan_darah` | A |
| ASJ00093 | YOGA AJI SAPUTRA | `kontak_darurat_wa` | 6285648839164 |
| ASJ00093 | YOGA AJI SAPUTRA | `nik` | 3503081005000004 |
| ASJ00100 | NAIA TRI OCTAVIANI | `kontak_darurat_wa` | 6285235557176 |
| ASJ00102 | KAVITA EKA AULIA FIRDIAN | `golongan_darah` | O |
| ASJ00102 | KAVITA EKA AULIA FIRDIAN | `nik` | 3173075309021001 |
| ASJ00103 | HARUN EFENDI | `kontak_darurat_wa` | 6281249901343 |
| ASJ00105 | DEWI ANJANI | `kontak_darurat_wa` | 6285702492811 |
| ASJ00106 | MEILA PRADINA WANTI | `golongan_darah` | A |
| ASJ00106 | MEILA PRADINA WANTI | `kontak_darurat_wa` | 6281359661376 |
| ASJ00106 | MEILA PRADINA WANTI | `nik` | 3502125305070001 |
| ASJ00111 | LILIN AYU ANDHYNI | `golongan_darah` | AB |
| ASJ00111 | LILIN AYU ANDHYNI | `kontak_darurat_wa` | 6281553398807 |
| ASJ00111 | LILIN AYU ANDHYNI | `nik` | 3520126707020002 |
| ASJ00114 | AHMAD FADILLAH | `golongan_darah` | B |
| ASJ00114 | AHMAD FADILLAH | `kontak_darurat_wa` | 6285204287216 |
| ASJ00116 | GISELA AURELIA | `golongan_darah` | A |
| ASJ00116 | GISELA AURELIA | `kontak_darurat_wa` | 62886970452042 |
| ASJ00116 | GISELA AURELIA | `nik` | 1803044106070002 |
| ASJ00118 | REZA FAJAR PRADIKA | `kontak_darurat_wa` | 6281319462338 |
| ASJ00120 | AZMATUL A'LA ZAHRANI | `kontak_darurat_wa` | 6285655395121 |
| ASJ00121 | SEPTIAN DWI EFENDI | `golongan_darah` | B |
| ASJ00121 | SEPTIAN DWI EFENDI | `kontak_darurat_wa` | 62881036109329 |
| ASJ00121 | SEPTIAN DWI EFENDI | `nik` | 3505050909050001 |
| ASJ00123 | YUSUF AFFENDI | `golongan_darah` | O |
| ASJ00123 | YUSUF AFFENDI | `nik` | 3502042805020001 |
| ASJ00125 | ENZZEL RIKA OKATAVIANA | `golongan_darah` | O |
| ASJ00125 | ENZZEL RIKA OKATAVIANA | `nik` | 3501095801030001 |
| ASJ00129 | SANTI SETIAWATI | `golongan_darah` | O |
| ASJ00129 | SANTI SETIAWATI | `nik` | 3502147003040001 |
| ASJ00131 | GISHELA ANGELING HIJRAH | `golongan_darah` | A |
| ASJ00131 | GISHELA ANGELING HIJRAH | `kontak_darurat_wa` | 6281385816252 |
| ASJ00131 | GISHELA ANGELING HIJRAH | `nik` | 3302132705060001 |
| ASJ00133 | RESANDO DIVANIKA YUSTIOGA | `golongan_darah` | O |
| ASJ00133 | RESANDO DIVANIKA YUSTIOGA | `kontak_darurat_wa` | 6289603232384 |
| ASJ00137 | SINTI SYETIRA | `golongan_darah` | O |
| ASJ00137 | SINTI SYETIRA | `nik` | 3502126301000001 |
| ASJ00141 | DWI PANCA SAIFUL ARIF | `kontak_darurat_wa` | 628139372268 |
| ASJ00143 | FAIQ FADHAIL RAJWA PRAYANI | `golongan_darah` | A |
| ASJ00143 | FAIQ FADHAIL RAJWA PRAYANI | `nik` | 3175021105041004 |
| ASJ00144 | MUHAMAD ANGGA SAPUTRA | `golongan_darah` | A |
| ASJ00144 | MUHAMAD ANGGA SAPUTRA | `kontak_darurat_wa` | 6285604993435 |
| ASJ00144 | MUHAMAD ANGGA SAPUTRA | `nik` | 3504132906070006 |
| ASJ00146 | AHSIN MUHAMMAD | `golongan_darah` | O |
| ASJ00146 | AHSIN MUHAMMAD | `kontak_darurat_wa` | 6285691698658 |
| ASJ00146 | AHSIN MUHAMMAD | `nik` | 3216070612000007 |
| ASJ00149 | WIWIN HARIATI | `golongan_darah` | B |
| ASJ00149 | WIWIN HARIATI | `kontak_darurat_wa` | 6285251052572 |
| ASJ00149 | WIWIN HARIATI | `nik` | 3502155803040002 |
| ASJ00150 | ZAINATUTS TSANIAH | `golongan_darah` | B |
| ASJ00150 | ZAINATUTS TSANIAH | `kontak_darurat_wa` | 6285811261058 |
| ASJ00150 | ZAINATUTS TSANIAH | `nik` | 3520125109020001 |
| ASJ00151 | SUKMA ARUM ROYANA | `golongan_darah` | O |
| ASJ00151 | SUKMA ARUM ROYANA | `kontak_darurat_wa` | 6285645505732 |
| ASJ00151 | SUKMA ARUM ROYANA | `nik` | 3506106103030004 |
| ASJ00154 | MUHAMMAD NIJAM | `golongan_darah` | A |
| ASJ00154 | MUHAMMAD NIJAM | `nik` | 1806132305990002 |
| ASJ00158 | ARBI ALVIANSYAH | `golongan_darah` | B |
| ASJ00158 | ARBI ALVIANSYAH | `kontak_darurat_wa` | 6281330147862 |
| ASJ00158 | ARBI ALVIANSYAH | `nik` | 3502180403060003 |
| ASJ00160 | MIFTACHUL ICHWA SYAVAUDIN | `golongan_darah` | B |
| ASJ00160 | MIFTACHUL ICHWA SYAVAUDIN | `kontak_darurat_wa` | 6285749358359 |
| ASJ00160 | MIFTACHUL ICHWA SYAVAUDIN | `nik` | 3520122810060001 |
| ASJ00161 | DAVID AGIFA SAPUTRA | `golongan_darah` | O |
| ASJ00161 | DAVID AGIFA SAPUTRA | `kontak_darurat_wa` | 6281332407605 |
| ASJ00161 | DAVID AGIFA SAPUTRA | `nik` | 3521080711050002 |
| ASJ00165 | ANGGUN ARIANI | `kontak_darurat_wa` | 6289524010825 |
| ASJ00167 | TONY HERMAWAN | `kontak_darurat_wa` | 6285188183677 |
| ASJ00168 | DIMAS RADITYA SUQIRMAN | `kontak_darurat_wa` | 6281259605240 |
| ASJ00169 | AGHNIYA CITRA INDIANI | `golongan_darah` | B |
| ASJ00169 | AGHNIYA CITRA INDIANI | `kontak_darurat_wa` | 6282330302485 |
| ASJ00170 | ADITYA RIZKI PRATAMA | `golongan_darah` | A |
| ASJ00170 | ADITYA RIZKI PRATAMA | `kontak_darurat_wa` | 6282337058094 |
| ASJ00172 | DEVI DWI RATNASARI | `golongan_darah` | O |
| ASJ00172 | DEVI DWI RATNASARI | `nik` | 3502166005070001 |
| ASJ00175 | TITANIA PUTRI PRATIWI | `golongan_darah` | B |
| ASJ00175 | TITANIA PUTRI PRATIWI | `kontak_darurat_wa` | 6285295935379 |
| ASJ00175 | TITANIA PUTRI PRATIWI | `nik` | 3502134505030001 |
| ASJ00177 | ALVINA DAMAYANTI | `golongan_darah` | O |
| ASJ00177 | ALVINA DAMAYANTI | `kontak_darurat_wa` | 6285805321943 |
| ASJ00180 | MUHAMAD ALIF CHOIRUL ARIFIN | `golongan_darah` | A |
| ASJ00180 | MUHAMAD ALIF CHOIRUL ARIFIN | `kontak_darurat_wa` | 6285749865968 |
| ASJ00180 | MUHAMAD ALIF CHOIRUL ARIFIN | `nik` | 3519022511050001 |
| ASJ00183 | YOGA PRAMUDIYA WAHDANI | `golongan_darah` | B |
| ASJ00183 | YOGA PRAMUDIYA WAHDANI | `nik` | 3502161012040004 |
| ASJ00185 | KRISNA ADITYA | `kontak_darurat_wa` | 6289516516310 |
| ASJ00188 | BUDI TRISNANTO | `kontak_darurat_wa` | 6281227930289 |
| ASJ00220 | DEILA RAHMA AGNISA | `kontak_darurat_wa` | 6282139968585 |
| ASJ00222 | SATRIA PUTRA DEWANGGA | `golongan_darah` | B |
| ASJ00222 | SATRIA PUTRA DEWANGGA | `kontak_darurat_wa` | 628213357331 |
| ASJ00222 | SATRIA PUTRA DEWANGGA | `nik` | 3502150502080001 |
| ASJ00230 | NATASYA PRIENDITA NURAZIZAH | `alamat_lengkap` | Jalan Punden, Dusun Kelingan, Desa Glonggong, Kecamatan Dolopo, Kabupaten Madiun, Jawa Timur (63174) |
| ASJ00230 | NATASYA PRIENDITA NURAZIZAH | `bb` | 68 |
| ASJ00230 | NATASYA PRIENDITA NURAZIZAH | `kontak_darurat_wa` | 6285649688521 |
| ASJ00230 | NATASYA PRIENDITA NURAZIZAH | `nik` | 3521115710060001 |
| ASJ00230 | NATASYA PRIENDITA NURAZIZAH | `tb` | 156 |

## 3. Siswa di sheet yang TIDAK dibuatkan baris

Tidak dibuat karena tidak punya baris kandidat di DB — membuat baris baru berisiko
duplikat saat mereka benar-benar mendaftar. Datanya ada di sheet kalau pemilik mau
dibuatkan.

| Nama | Kelas | Tanggal lahir | WA |
|---|---|---|---|
| ARNEDA THALIA SALSA BELA | H | 2005-07-14 | 0838-5719-5658 |
| SAIFURROHMAN AGUS SANTOSO | H | 1997-05-09 | 0881-3590-369 |
| MOHAMMAD RIZKY AINUR ROFIQ | I | 2005-06-05 | 0856-4858-7365 |
| SOFYAN WAHYU RAHMADAN | I | 2007-09-20 | 0857-0458-4182 |
| LHING LHING | I | - | - (baris sheet kosong) |

## 4. Temuan lain (TIDAK diubah)

- **Baris ganda**: `SATRIA PUTRA DEWANGGA` punya dua baris master — `ASJ00122` (kelas J,
  WA benar, terhubung ke pipeline) dan `ASJ00222` (tanpa kelas, WA `622342782945` rusak).
  Data sheet sudah masuk ke **ASJ00122**; ASJ00222 dibiarkan.
- **Nomor WA rusak** (sudah terisi, jadi tidak ditimpa): `ASJ00220` DEILA
  `628581541420` (sheet: `6285815414204`), `ASJ00222` SATRIA `622342782945`
  (sheet: `6282342782945`).
- **`usia`** tersimpan sebagai teks dan tidak dihitung ulang: 22 baris kini berbeda
  satu tahun dari tanggal lahir yang sudah dibetulkan.
- **Satu baris sheet bergeser kolom**: di sheet `kelas j`, baris 36 (NATASYA PRIENDITA
  NURAZIZAH) memakai urutan kolom sheet K (email di kolom 16, alamat di kolom 22).
  Alamat sudah ditulis dari kolom 22, bukan dari kolom 16.
