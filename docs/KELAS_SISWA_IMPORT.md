# Impor kelas siswa — 2026-11-04

Sumber: `C:\Users\k89\Downloads\DATABASE SISWA ASJ.xlsx`, sheet **`siswa cari job`**,
kolom **G `kelas`** (`A クラス` … `K クラス`). Pemilik mengonfirmasi kolom ini
lewat tangkapan layar, 2026-11-04.

## Hasil

| | jumlah |
|---|---|
| Baris bernama di sheet | 154 |
| Punya kelas di sheet | 153 |
| **Berhasil ditulis ke DB** | **117** |
| Tidak bisa ditulis | 37 |

Ditulis ke **dua** tabel sekaligus: `database_candidate` (117) dan
`master_database_candidate` (117), dicocokkan lewat `id_kandidat` / `no_wa`.

Sebaran di `database_candidate` setelah impor:

| Kelas | Siswa |
|---|---|
| F | 3 |
| G | 6 |
| H | 12 |
| I | 28 |
| J | 34 |
| K | 34 |

## Kenapa kelas jadi KOLOM, bukan tag `[KELAS x]`

Sebelum migrasi 042, kelas hanya hidup sebagai teks `[KELAS K]` di
`catatan_internal`, diekstrak `mapCandidate()` dengan regex. Itu bekerja, tapi
kelas tidak bisa di-query, dan satu salah ketik di memo admin
(`[KELAS  k]`, `[KELAS K ]`) diam-diam mengeluarkan siswa dari kelasnya —
sekaligus **menutup gerbang VIP**-nya.

Migrasi `042_kelas_dan_papan_skor.sql` menambah kolom `kelas`. `mapCandidate()`
membaca **kolom lebih dulu**, lalu jatuh ke tag bila kolom kosong — jadi 39
kandidat lama yang hanya punya tag tidak kehilangan apa pun.

⚠ **`statusVip()` juga ikut diperbaiki.** Sebelumnya ia hanya membaca
`catatan_internal`; tanpa perubahan itu, 117 siswa yang kelasnya hanya ada di
kolom akan **ditolak** dari latihan kosakata, arcade, dan AI-CV. Ini sempat
terjadi dan tidak memunculkan error apa pun — hanya "bukan siswa".

## 37 yang TIDAK masuk

### a. Tidak ada di `database_candidate` maupun `master_database_candidate` (36)

Mereka siswa kelas lama (A–E seluruhnya) yang tidak pernah mendaftar lewat
portal, jadi tidak punya baris kandidat — dan tanpa `no_wa` tidak ada kunci yang
aman untuk membuatnya. Membuat baris kosong berisiko menghasilkan duplikat saat
mereka benar-benar mendaftar.

| Kelas | Nama |
|---|---|
| A | RATIH KUSUMA DEWI · WINDU ISTIANA |
| B | CINDY SURYANI · FAHRI MUKHRISIN ABE · NANDA KAYANA GIOVANI · SABILLA FEBRIYANAWATI · UMI HAYUNINGTYAS |
| C | MUHAMMAD SYAIFUDDIN NUR · MEI TINA INDRIANI |
| D | ARIEL NUR CAHYO · DWI KURNIAWAN · HADIAH FITRIYANINGSIH · SYIFA SYAIRA MARWA |
| E | AMMEY JUNIAR CAHYANING PUTRI |
| F | ANDRI MUTIYA · BINTANG KACA · DEA AYU PUTRI FERDILA · MERIS ERMAWATI · UMAIDATUN NUR JANAH · UMMI KHUSLUM |
| G | ABIZARD NAJIB MUSTOFA · AHMAD WIDODO · ANDREW DINATA WAHYUDI PUTRA · ANJANI SULISTIAWATI · DEVIANA AMANDA PUTRI · JELITA KINTAN AUDRIA · NABILA AULIA RAHMA · NURFADILA AGUSTYA · OLIVIA FRISKA NABELLA · RENITA WAHYU AGUSTINA PUTRI · ROSITA ULUM DAIMAH |
| H | ARNEDA THALIA SALSA BELA · KAROLINA SETIAWATI · SAIFURROHMAN AGUS SANTOSO |
| I | LHING LING NUR ELVINA · MOHAMMAD RIZKY AINUR ROFIQ |

### b. Ada di DB tetapi sheet-nya tidak menyebut kelas (1)

- **AGUSTINA MEGA SAFITRI** — satu-satunya baris di sheet dengan kolom kelas
  kosong; catatannya berbunyi "anggep saja anak asj sendiri". Perlu keputusan
  pemilik, bukan tebakan.

## Tiga nama yang ejaannya berbeda antara sheet dan DB

Ditulis **eksplisit** di skrip impor, bukan hasil pencarian kemiripan otomatis —
kemiripan nama bisa memilih orang yang salah, dan menulis kelas ke orang yang
salah lebih buruk daripada tidak menulis apa pun.

| Sheet | DB |
|---|---|
| RALFIANANDA PUTRA ALGRHIFAHRI | RALFIANANDA PUTRA ALGHIFARI |
| FITRINA ALYA RIVALIN | FITRIANA ALYA RIVALIN |
| DE'ILA RAHMA AGNISA | DEILA RAHMA AGNISA |

## Yang belum diverifikasi

Kelas diimpor **hanya dari kolom G**. Sheet `D` (kontak wali kelas K) dan
`kelas g/h/i/j/k database` (NIK, alamat, berkas) **tidak** diimpor — pemilik
meminta kelasnya saja. Kalau nanti data itu mau masuk, tiga hal perlu diputuskan
lebih dulu:

1. `kelas g database` tidak punya baris tabel sama sekali (25 baris tanpa
   header) dan memuat satu nama ganda (`ANDREANSYA YULIAN ZALVINO` di baris 4
   dan 5).
2. `kelas j database` baris 36 (`NATASYA PRIENDITA NURAZIZAH`) **bergeser satu
   kolom** — email ada di kolom alamat, sekolah di kolom KTP.
3. `kelas i database` baris 36 (`SOFYAN WAHYU RAHMADAN`) berada di luar blok
   data, tanpa nomor urut.

Ketiganya cacat sumber, bukan cacat impor.
