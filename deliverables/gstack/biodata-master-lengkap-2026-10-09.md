# Download Biodata — SELURUH data master masuk (2026-10-09, lanjutan)

Koreksi pemilik atas perbaikan sebelumnya: *"bukan gitu saya maunya semua data
master nya ke donload … jadi lengkap semua"*, dengan satu berkas CV berisi
seluruh jawaban kandidat sebagai contoh.

Jadi yang kurang bukan label — **isinya**. Berkas yang diunduh hanya memuat
`bio`, yaitu 11 kunci yang kebetulan ikut di payload kandidat, sementara baris
`master_database_candidate` punya **169 kolom**: data diri lengkap, fisik &
ukuran, kesehatan, wawancara + **jawaban kanji**, sertifikasi, riwayat
pendidikan/pekerjaan/keluarga, kenalan di Jepang, dan tautan dokumen.

## Perubahan

| berkas | apa |
|---|---|
| `src/lib/biodataExport.ts` | blok **DATA MASTER (LENGKAP)**: seluruh objek master dirender berkelompok dengan label manusia (termasuk penanda `(Kanji)`), alias kolom tidak dicetak dua kali, `AIDATAJSON` dibuang |
| `src/components/admin/CandidateProfileModal.tsx` | unduhan mengambil master lebih dulu (`getDrafCvMaster`) lalu menyerahkannya ke formatter |
| `src/components/candidate/CandidateDash.tsx` | idem, untuk tombol di kartu kandidat |
| `e2e/biodata-export.test.ts` | +7 tes (total 17) untuk blok master |

**Kenapa diambil saat unduh, bukan ikut di payload.** `MASTER_LIGHT_COLS`
sengaja sempit: payload kandidat dibaca 500 baris sekaligus, dan 169 kolom ×
500 baris bukan harga yang pantas dibayar setiap kali dashboard dibuka.
`getDrafCvMaster` sudah ada, sudah ber-guard sesi (admin atau pemilik WA), dan
sudah mengembalikan `buildMasterNested(row)` — jadi unduhan memakainya apa
adanya. Gagal ambil ⇒ berkas tetap dibuat dari data yang sudah ada.

**Rapi, bukan sekadar banyak.** Master menggantikan bagian `BIODATA DETAIL`
(`bio` adalah subset-nya, jadi mencetak keduanya = mengulang). Alias kolom
dilewati hanya ketika kolom kanoniknya ada — `nama_sekolah`/`sekolah`,
`tahun_masuk`/`masuk`, `nilai`/`jft`, `lisensi`/`ssw`, `rencana_pulang_id`/
`rencana_setelah_pulang`, dst. — sehingga tidak ada nilai yang hilang **dan**
tidak ada yang tercetak dua kali. Lebar kolom label 31 karakter supaya titik
dua sejajar sampai label terpanjang ("Rencana Setelah Pulang (Kanji)").

## Bukti pada data nyata

Dirender lewat jalur kode ASLI (`mapCandidate` + `attachBerkasBio` +
`buildMasterNested` + `buildBiodataText`) untuk **AGUS KHOCI / ASJ00040**
(wa `6282130442661`, baris master 169 kolom): **227 baris, 9.131 karakter**,
10 kelompok master terisi.

⚠ Berkas hasil berisi PII kandidat (NIK, nomor HP, nama orang tua) sehingga
**tidak di-commit** — ditulis ke `F:/tmp/` dan ditampilkan langsung.

## Gate

- Tes baru **dibuktikan bisa merah**: blok master dimatikan ⇒ **5 tes gagal**.
- `tsc --noEmit` **exit 0** · `lint-ratchet` **PASSED** (2 diagnostik baru
  dibetulkan di sumber, bukan di baseline).
- vitest `frontend` + `backend`: **171 berkas · 2090 tes**; 1 merah = artefak
  sandbox `spawnSync git EBUSY` di `_lib/fcm-server.test.ts` (tidak terkait).

## Temuan data yang BUKAN dari perbaikan ini (perlu keputusan)

Terlihat saat merender data nyata — semuanya berasal dari data/merge backend,
bukan dari formatter:

1. **`RIWAYAT PENDIDIKAN` berisi 11 entri padahal aslinya 3.** `buildMasterNested`
   menggabungkan 5 slot kolom dengan array `ai_data_json.pendidikan`
   (`mergeRiwayatArrays`), dan hasil gabungannya memunculkan ulang entri lama
   dengan pasangan kolom yang tertukar (mis. "Tingkat: SD" + "Sekolah Id: SMAN 1").
   Karena `getDrafCvMaster` memakai fungsi yang sama, **form master di aplikasi
   pun menampilkan 11 entri itu** — jadi ini bug data/merge, bukan bug unduhan.
2. **`NIK KTP : 0`** dan **`No. WA Darurat : 82130442661`** (hilang awalan `62`)
   pada baris AGUS KHOCI — nilai kolomnya memang begitu.
3. **`JOB YANG DILAMAR` kosong** untuk kandidat ini meski ada 1 baris mail:
   baris itu bukan lamaran loker (`code_job` kosong — baris biodata/dokumen),
   jadi memang tidak dihitung sebagai lamaran.
