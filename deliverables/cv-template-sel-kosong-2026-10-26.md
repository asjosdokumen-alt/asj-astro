# Sel CV yang masih kosong di 4 template — dan kolom yang perlu dibuat

> **STATUS 2026-10-27 — SUDAH DIKERJAKAN.** Migrasi `022_cv_field_gaps.sql` sudah
> DITERAPKAN ke Neon (41 kolom, semua nullable/additive; ledger 21 → 22 applied), dan
> `schema.generated.ts` diregenerasi dari DB live (26 → 28 tabel: ikut menangkap
> `wawancara_soal`/`wawancara_jawaban` dari migrasi 021 yang belum pernah masuk kontrak).
> Kedua form sudah menanyakan seluruh field baru, keempat renderer sudah membacanya, dan
> `buildMasterNested` sekarang membaca `keluarga_N_gaji` yang dulu hanya ditulis.
> Rincian yang **belum** dikerjakan ada di §11. Angka di bawah tetap dipertahankan sebagai
> catatan ukurannya, bukan sebagai daftar kerja yang belum jalan.

Terukur 2026-10-26 dari 4 renderer (`src/lib/cv-template-factory/renderers/`) + geometri
template `.xlsx` aslinya (zip/XML probe) + `schema.generated.ts` (203 kolom
`master_database_candidate`) + `deliverables/db-column-audit.csv` (isi per kolom, 234 baris).

Pertanyaan pemilik: *"banyak cell-cell yg kosong … tolong listkan mana saja yg gak ada datanya
dan perlu dibuatkan kolom baru dan dimasukkan di CV AI bagian kolom dan form master."*

**Ringkasnya: 93 sel berlabel di 4 template tidak pernah terisi.** Penyebabnya tiga, dan
bedanya penting — yang pertama **tidak butuh migrasi**:

| Sebab | Sel | Perbaikan |
|---|---|---|
| **A. Sumbernya sudah ada, renderer tidak membacanya** | 31 | sambungkan di `data.ts` + `buildMasterNested` (+ form) |
| **B. Tidak ada kolomnya sama sekali** | 62 | **39 kolom baru** (satu kolom menutup beberapa sel) |
| **C. Slot kurang** (pekerjaan 3 vs 4 baris, keluarga 5 vs 8) | 5 baris | opsional: `pekerjaan_4_*`, `keluarga_6..8_*` |

---

## 0. Rekap per template

| Template | Sel kosong | Tanpa migrasi | Perlu kolom baru |
|---|---:|---:|---:|
| Rirekisho Excel (Form Asli) `rirekisho-xlsx` | 12 | 11 | 1 |
| Rirekisho Excel (Firma Elga Pratama) `rirekisho-firma` | 28 | 8 | 20 |
| Rirekisho Excel (Form KINKI) `kinki` | 30 | 9 | 21 |
| CV 特定技能 (JIPA) `jipa` | 23 | 3 | 20 |
| **Total** | **93** | **31** | **62** |

> Angka "sel" = sel yang punya label di form tapi tidak pernah ditulis renderer dan tidak
> punya nilai turunan. Sel yang memang label/dropdown (mis. `N1..N5` di `K42:O42`) tidak
> dihitung.

---

## 1. Form Asli (`rirekisho-xlsx`) — 12 sel

| Sel | Label di form | Isi | Status | Sumber yang benar |
|---|---|---|---|---|
| `H42:I42` | 他 LAIN - LAIN (sertifikat lain) | sertifikat selain JLPT & SIM | kolom ADA (`ssw`); sertifikat lain butuh `sertifikat_lain` | `ssw`, lalu `sertifikat_lain` (§6-F1) |
| `D45` | 関係 HUBUNGAN | hubungan kenalan di Jepang | kolom ADA | `kenalan_di_jepang_hubungan` |
| `E45` | 職業 PEKERJAAN | pekerjaan kenalan | kolom ADA | `kenalan_di_jepang_pekerjaan` |
| `F45` | 年齢 USIA | usia kenalan | kolom ADA | `kenalan_di_jepang_usia` |
| `G45:I45` | 日本の住所 ALAMAT DI JEPANG | alamat kenalan | kolom ADA | `kenalan_di_jepang_alamat` / `_alamat_jp` |
| `A46:I46` | 付記 CATATAN TAMBAHAN | catatan bebas | **kolom baru** | `catatan_cv` (§6-F3) |
| `I29:I34` ×6 | 月収/円 GAJI (keluarga) | penghasilan anggota keluarga | kolom ADA | `keluarga_1..5_gaji` |

**Catatan penting:** baris kenalan (`D45:G45`) punya kolomnya dan **sudah terisi** di DB
(`kenalan_di_jepang_hubungan` 1 baris, `_pekerjaan`/`_usia`/`_alamat` juga). Renderer hanya
menulis `A45` (nama). Ini murni bug renderer — 4 sel bisa langsung diisi tanpa migrasi.
`ssw` juga belum pernah dicetak di form ini; bisa masuk ke `H42` bersama `sertifikat_lain`.

---

## 2. Firma Elga Pratama (`rirekisho-firma`) — 28 sel

| Sel | Label | Status | Sumber |
|---|---|---|---|
| `D32:F32` | 日本語能力 Level Kemampuan Bahasa Jepang | kolom ADA | `bahasa` (2/234 terisi) |
| `L31:P31` | 日本語学習期間 Lama Belajar | **kolom baru** | `lama_belajar_jp` |
| `L32:P32` | 渡航経験 Negara Lain | **kolom baru** | `negara_lain` |
| `K33:P33` | その他事項 ket. lain-lain | **kolom baru** | `catatan_cv` |
| `O16`,`O18`,`O20` ×3 | 雇用形態 Form Pekerjaan | **kolom baru** | `pekerjaan_N_jenis` |
| `L24:L30` ×7 | 月収 Upah Bulanan (keluarga) | kolom ADA | `keluarga_N_gaji` |
| `N24:N30` ×7 | 居住 (同居/別居) | **kolom baru** | `keluarga_N_tinggal` |
| `O24:O30` ×7 | 電話 No Handphone (keluarga) | **kolom baru** | `keluarga_N_hp` |

**Salah isi senyap (bukan kosong):** `D9` 希望収入 membaca `raw.gaji_diharapkan` /
`raw.gaji_diinginkan` — dua kunci yang **tidak pernah ada** di respons `getDrafCvMaster`. Jadi
`D9` selalu jatuh ke bawaan template `15万円／月`, walaupun `harapan_gaji_yen` terisi 12 baris.
Perbaikannya satu baris di `data.ts` (baca `wawancara.gaji_yen`).

---

## 3. Form KINKI (`kinki`) — 30 sel

| Sel | Label | Status | Sumber |
|---|---|---|---|
| `A26`,`A28`,`A30` ×3 | 雇用形態 (kolom A blok 職歴) | **kolom baru** | `pekerjaan_N_jenis` |
| `J19` | 地域 (wilayah sekolah) | **kolom baru** | `wilayah_sekolah` |
| `M26`,`M28`,`M30` ×3 | 業種 (industri) | **kolom baru** | `pekerjaan_N_bidang` |
| `Z26`,`Z28`,`Z30` ×3 | 備考 (catatan kerja) | **kolom baru** | `pekerjaan_N_catatan` |
| `Q45:W45` | 計算テスト | **kolom baru** | `tes_hitung` |
| `X45:AB45` | 目標貯金（実習生３年間） | kolom ADA | `harapan_tabungan` (10/234) |
| `T37:W37` | 学習期間 | **kolom baru** | `lama_belajar_jp` |
| `T39:W39` | 学習状況 | **kolom baru** | `status_belajar_jp` |
| `Q41:S41` | 英語レベル | **kolom baru** | `level_bahasa_inggris` |
| `T41:W41` | その他外国語能力 | **kolom baru** | `bahasa_lain` |
| `X41:AD41` | 集団生活年数 | **kolom baru** | `tinggal_kursus_tahun` |
| `X47:AD47` | 日本での就業希望年数 | kolom ADA | `lamakerjadiharapkan` (9/234, 0 rujukan kode) |
| `AB51:AC51` | 体力試験 腕立て伏せ …回 | **kolom baru** | `tes_pushup` |
| `AB52:AC52` | 体力試験 スクワット …回 | **kolom baru** | `tes_squat` |
| `O9` | ジャカルタから…㎞ / 飛行機で…時間…分 | **kolom baru** | `jarak_jakarta_km` + `lama_penerbangan` |
| `I4` | 第…課中 (bab Minna no Nihongo) | **kolom baru** | `bab_belajar_jp` |
| `M4` | …月取得予定 (rencana ambil SIM) | **kolom baru** | `rencana_sim_bulan` |
| `J37:J43` ×7 | 月収 (keluarga) | kolom ADA | `keluarga_N_gaji` |

**Dua hal yang bukan "kosong" tapi salah:**
1. **`I3` 日本語力** hanya terisi kalau `jft` berisi `N2..N5`. Kandidat yang punya JFT Basic
   (`A2`/`B1`) tidak cocok, sehingga sel memakai **bawaan template `N5レベル`** — level palsu.
   Perlu `level_bahasa_jepang` (enum) atau pemetaan JFT → level.
2. **`X43` 結婚の予定** selalu dicetak `未定` (hardcode). Kalau mau jujur, perlu
   `rencana_menikah`.
3. **Baris 42-43 keluarga** tidak pernah ditulis (`FAM_ROWS = 5`, template 7 baris) sehingga
   `‐` dan `万円` bawaan template menggantung tanpa angka.

---

## 4. CV 特定技能 / JIPA (`jipa`) — 23 sel

| Sel | Label | Status | Sumber |
|---|---|---|---|
| `B5` | CODE LOWONGAN | data ADA, tidak dikirim | `database_candidate.id_loker_pilihan` → kode lowongan (backend) |
| `J5` | 希望職種 Jenis kerja | kolom ADA | `bidangssw` / `bidang` |
| `E54:L54` | ビザ種類 JENIS VISA | **kolom baru** | `visa_jepang` |
| `E55:L55` | 在日期間 LAMA TINGGAL | **kolom baru** | `lama_di_jepang` (sekarang hanya `ai_data_json`) |
| `B46:E51` ×5 | 取得年月 (tanggal tiap sertifikat) | **kolom baru** | `sertifikat_lain_tanggal` |
| `L60:L61` | 日付 Th Bln Tanggal | otomatis | tanggal cetak — isi `TODAY()`, bukan kolom |
| `L27..L30` ×4 | 業種 Bidang kerja | **kolom baru** | `pekerjaan_N_bidang` |
| `E33..E40` ×8 | 同居区分 | **kolom baru** | `keluarga_N_tinggal` |
| `J43` | 在留資格(在留期間) | **kolom baru** | `kenalan_di_jepang_status_tinggal` |

`L60` sebaiknya diisi tanggal render (tidak perlu kolom). `B5` butuh satu join di
`getDrafCvMaster` (kolom `id_loker_pilihan` ada di `database_candidate`, sedangkan CV membaca
baris `master_database_candidate`) — bukan kolom baru.

---

## 5. Kolom yang SUDAH ADA tapi tidak dibaca (tanpa migrasi)

Ini daftar terpendek yang hasilnya paling besar: **31 sel** bisa terisi tanpa mengubah skema.

| Sumber | terisi | Dipakai untuk sel | Yang perlu diubah |
|---|---:|---|---|
| `kenalan_di_jepang_hubungan` / `_pekerjaan` / `_usia` / `_alamat` / `_alamat_jp` | 1 | asli `D45:G45` | `rirekisho-xlsx.ts` (4 baris) |
| `keluarga_1..5_gaji` | belum diukur | asli `I29:I34`, firma `L24:L30`, kinki `J37:J41` | `buildMasterNested` (belum memproyeksikan `gaji`) + `data.ts` |
| `harapan_tabungan` | 10 | kinki `X45` | `data.ts` |
| `lamakerjadiharapkan` | 9 | kinki `X47` | `buildMasterNested` → `wawancara` + `data.ts` |
| `bahasa` | 2 | firma `D32` | `firma.ts` (1 baris: `data.sertifikasi.bahasa`) |
| `bidangssw` / `bidang` | 23 / 0 | jipa `J5` | `jipa.ts` (1 baris) |
| `ssw` | — | asli `H42` | `rirekisho-xlsx.ts` |
| `database_candidate.id_loker_pilihan` | — | jipa `B5` (kode lowongan) | join di `getDrafCvMaster` — bukan kolom baru |
| tanggal cetak | — | jipa `L60` | `TODAY()` saat render |
| `pendidikan_N_sekolah_jp` | 7 | *kualitas, bukan sel kosong* — nama sekolah KINKI/JIPA | renderer: pakai `sekolah_jp` bila ada |
| `pekerjaan_N_perusahaan_jp` / `_jabatan_jp` | 4–6 | *kualitas* — perusahaan/jabatan KINKI/JIPA | idem |
| `keluarga_N_hubungan_jp` / `_pekerjaan_jp` | 6–7 | *kualitas* — label keluarga KINKI/JIPA | idem |

**Tambahan di luar 31 sel itu — `harapan_gaji_yen` (12 terisi) bukan sel kosong, tapi salah
isi:** firma `D9` 希望収入 membaca `raw.gaji_diharapkan` / `raw.gaji_diinginkan` — dua kunci
yang **tidak pernah ada** di respons `getDrafCvMaster`, jadi selalu jatuh ke bawaan template
`15万円／月`. Perbaikannya satu baris di `data.ts`.

⚠️ `pendidikan_N_sekolah_jp`, `pekerjaan_N_perusahaan_jp`, `keluarga_N_hubungan_jp` terisi
tapi **0 rujukan kode** (audit 2026-10-25). Form KINKI/JIPA adalah form **Jepang** — mencetak
nama sekolah/perusahaan Indonesia di sana kurang tepat; kolom kanjinya sudah ada, tinggal
dipakai.

---

## 6. Kolom baru yang perlu dibuat (39 kolom: A–F; G opsional)

Semua `text` (mengikuti gaya tabel: teks bebas, satu kolom satu nilai), kecuali disebut lain.
"N" = slot 1..3 untuk pekerjaan, 1..5 untuk keluarga.

### A. Pekerjaan — 9 kolom
| # | Kolom | Isi | Sel | Form Master | CV AI |
|---|---|---|---|---|---|
| A1 | `pekerjaan_N_jenis` | 正社員 / 非正社員 / アルバイト / インターン / 家業 | kinki `A26/28/30`, firma `O16/18/20` | step 3, per baris kerja | baris pekerjaan: `jenis` |
| A2 | `pekerjaan_N_bidang` | 業種 (industri) | kinki `M26/28/30`, jipa `L27..L30` | step 3, per baris | baris pekerjaan: `bidang` |
| A3 | `pekerjaan_N_catatan` | 備考 | kinki `Z26/28/30` | step 3, per baris | baris pekerjaan: `catatan` |

### B. Keluarga — 10 kolom
| # | Kolom | Isi | Sel | Form Master | CV AI |
|---|---|---|---|---|---|
| B1 | `keluarga_N_tinggal` | 同居 / 別居 / 独立 | jipa `E33..E40` (8), firma `N24..N30` (7) | step 4, per baris | baris keluarga: `tinggal` |
| B2 | `keluarga_N_hp` | 電話番号 | firma `O24..O30` (7) | step 4, per baris | baris keluarga: `hp` |

### C. Kenalan & perjalanan — 4 kolom
| # | Kolom | Isi | Sel | Form Master | CV AI |
|---|---|---|---|---|---|
| C1 | `kenalan_di_jepang_status_tinggal` | 在留資格(在留期間) | jipa `J43` | step 5 | seksi Kenalan: `status_tinggal` |
| C2 | `visa_jepang` | ビザ種類 | jipa `E54` | step 5 | seksi Jiko/baru: `visa` |
| C3 | `lama_di_jepang` | 在日期間 | jipa `E55` | step 3 (sudah ada `lamaJepang`, hanya tanpa kolom) | `lama` (sudah ada) |
| C4 | `negara_lain` | 渡航経験 negara lain | firma `L32` | step 5 | seksi Jiko: `negara_lain` |

### D. Pendidikan & bahasa — 6 kolom
| # | Kolom | Isi | Sel | Form Master | CV AI |
|---|---|---|---|---|---|
| D1 | `wilayah_sekolah` | 地域 (kota/provinsi sekolah) | kinki `J19` | step 3, per baris pendidikan | baris pendidikan: `wilayah` |
| D2 | `lama_belajar_jp` | 日本語学習期間 (bulan/tahun) | firma `L31`, kinki `T37` | step 5 | seksi Pendidikan: `lama_belajar_jp` |
| D3 | `status_belajar_jp` | 学習状況 (学習中 / 修了 / 独学) | kinki `T39` | step 5 | idem: `status_belajar_jp` |
| D4 | `bab_belajar_jp` | 第…課中 | kinki `I4` | step 5 | idem: `bab_belajar_jp` |
| D5 | `level_bahasa_inggris` | 英語レベル | kinki `Q41` | step 5 | idem: `bhs_inggris` |
| D6 | `bahasa_lain` | その他外国語能力 | kinki `T41` | step 5 | idem: `bahasa_lain` |

### E. Tes & fisik — 7 kolom
| # | Kolom | Isi | Sel | Form Master | CV AI |
|---|---|---|---|---|---|
| E1 | `tes_hitung` | 計算テスト (skor) | kinki `Q45` | step 3 (grup "tes") | seksi Fisik: `tes_hitung` |
| E2 | `tes_pushup` | 腕立て伏せ …回 | kinki `AB51` | step 3 | idem: `tes_pushup` |
| E3 | `tes_squat` | スクワット …回 | kinki `AB52` | step 3 | idem: `tes_squat` |
| E4 | `tinggal_kursus_tahun` | 集団生活年数 | kinki `X41` | step 3 | idem: `tinggal_kursus` |
| E5 | `jarak_jakarta_km` | ジャカルタから…㎞ | kinki `O9` | step 1 (alamat) | seksi Identitas: `jarak_jakarta` |
| E6 | `lama_penerbangan` | 飛行機で…時間…分 | kinki `O9` | step 1 | idem: `lama_penerbangan` |
| E7 | `rencana_sim_bulan` | …月取得予定 | kinki `M4` | step 5 | seksi Identitas: `rencana_sim` |

### F. Sertifikat & catatan — 3 kolom
| # | Kolom | Isi | Sel | Form Master | CV AI |
|---|---|---|---|---|---|
| F1 | `sertifikat_lain` | 他資格 (selain JLPT/SSW/SIM) | asli `H42` (bisa juga dari `ssw`), jipa baris 4-5 dari 5 | step 5 | seksi Pendidikan: `sertifikat_lain` |
| F2 | `sertifikat_lain_tanggal` | 取得年月 | jipa `B46:B51` | step 5 | idem: `sertifikat_lain_tgl` |
| F3 | `catatan_cv` | 付記 / その他事項 | asli `A46`, firma `K33` | step 5 | seksi Jiko: `catatan_cv` |

### G. Opsional — mengganti tebakan dengan data (4 kolom)
| # | Kolom | Sekarang | Kalau ada kolomnya |
|---|---|---|---|
| G1 | `olahraga` | `E16` スポーツ ditebak dari kata di teks hobi | centang pasti |
| G2 | `mbti` | `Q47`+`U48..U52` **disimpulkan** `inferMbti()` dari kalimat | tipe stabil, bisa dikoreksi admin |
| G3 | `kemampuan_kerja` | 13 kotak `できる作業` dicentang dari kata di `keahlian_khusus` | pilihan eksplisit |
| G4 | `level_bahasa_jepang` | `I3` hanya terisi kalau `jft` ber-N; selain itu `N5レベル` bawaan template | level jujur |

---

## 7. Slot yang kurang (bukan kolom baru, tapi bikin baris kosong)

| Template | Baris di form | Slot DB | Akibat |
|---|---:|---:|---|
| asli — keluarga | 6 | 5 | 1 baris kosong |
| firma — keluarga | 7 | 5 | 2 baris kosong |
| kinki — keluarga | 7 (renderer hanya menulis 5) | 5 | 2 baris menggantung `‐ / 万円` |
| jipa — keluarga | 8 | 5 | 3 baris kosong |
| jipa — pekerjaan | 4 | 3 | 1 baris kosong |

Pilihan: (a) tambah `keluarga_6..8_*` (21 kolom) + `pekerjaan_4_*` (8 kolom); atau
(b) simpan sisanya di `riwayat_keluarga_json` / `riwayat_pekerjaan_json` (kolomnya sudah ada,
`keluarga` 10/234) dan tambah slot di form. Untuk pemakaian nyata (mayoritas ≤5 anggota
keluarga), (b) lebih murah — cukup renderer membaca array JSON melebihi 5.

---

## 8. Urutan pengerjaan yang disarankan

| Tahap | Isi | Migrasi | Sel yang tertutup | Status |
|---|---|---|---|---|
| **0** | Sambungkan sumber yang sudah ada (§5) + perbaiki `D9` | tidak | 31 | ✅ 2026-10-27 |
| **1** | `pekerjaan_N_jenis`, `_bidang`, `_catatan` + `keluarga_N_tinggal`, `_hp` | 19 kolom | 38 | ✅ |
| **2** | Bahasa & tes KINKI (`wilayah_sekolah`, D2–D6, E1–E4, E7) | 11 kolom | 12 | ✅ |
| **3** | JIPA: `visa_jepang`, `lama_di_jepang`, `kenalan_..._status_tinggal`, `negara_lain` | 4 kolom | 4 | ✅ |
| **4** | `sertifikat_lain`, `catatan_cv`, `jarak_jakarta_km`, `lama_penerbangan` | 5 kolom | 8 | ✅ (kecuali tanggal sertifikat, §11) |
| **5** | Opsional G1–G4 | 4 kolom | (kualitas) | ✅ G1, G2, G4 — G3 belum |

31 + 38 + 12 + 4 + 8 = **93** sel. `sertifikat_lain` sendiri tidak menutup sel yang kosong
hari ini (`H42` sudah bisa diisi `ssw`) — ia menutup **kandidat yang punya sertifikat selain
SSW/JLPT/SIM**, dan 2 baris kosong di blok 資格試験 JIPA.

Tahap 0 **tidak menyentuh skema** dan sudah menutup sepertiga sel kosong — kerjakan dulu.

---

## 9. Sesi 2026-10-26 — foto JIPA (bukan daftar, tapi hasil)

Foto JIPA diperbaiki (permintaan terpisah di sesi yang sama):

| Bug | Terukur | Perbaikan |
|---|---|---|
| Kotak foto = ukuran gambar, bukan sel | `ext` aset 9753600×14630400 EMU = **10,67 × 16 inci**; sel `B6:E13` hanya **192×208 px (2,00×2,17 in)** | `photoRange: 'B6:E13'` — kotak dihitung dari geometri sheet (`cellRangeEmu`) |
| `patchAnchor` **tidak pernah menambal** drawing JIPA | drawing JIPA tanpa prefix `xdr:`; regex lama hanya `<xdr:ext …>` → tidak ada yang cocok, XML dikembalikan apa adanya | pola dibuat prefix-opsional; prefix asli dipertahankan saat menulis |
| Foto diregangkan ke rasio kotak | `drawImage(bmp, 0, 0, w, h)` | `coverCrop()` — isi kotak, buang lebihnya, rasio utuh |

Hasil: foto 188×204 px (2 px inset), `ext` 1790700×1943100 EMU, `colOff`/`rowOff` 19050 —
di dalam bingkai `B6:E13`, tidak lagi menutupi halaman. Tes: `e2e/jipa.test.ts` (15 tes,
2 di antaranya merah sebelum perbaikan).

---

## 10. Bukti sesi 2026-10-26

| Periksa | Hasil |
|---|---|
| `e2e/jipa.test.ts` | 15/15 hijau (2 merah sebelum perbaikan) |
| `e2e/rirekisho-firma.test.ts` + `rirekisho-xlsx.test.ts` | 47/47 hijau |
| `tsc --noEmit` | exit 0 |
| `lint-ratchet` | PASSED — 0 diagnostik baru |
| suite penuh | 253/257 berkas · 3058/3066 tes — **4 berkas merah, semuanya bukan dari perubahan ini**: `service-reminder-cron` & `admission` (ENOENT `agenda-reminders.ts` / `sweep-queue.ts` — dua berkas itu sudah di-`rename` jadi `.disabled` sebelum sesi ini), `kernel-db-role` (menunggu role `service_role`, DB sekarang `asj_service`), `master-light-rpc` (kontrak kolom RPC) |

---

## 11. Sesi 2026-10-27 — migrasi 022 + kedua form

**Yang berubah**

| Lapisan | Berkas | Isi |
|---|---|---|
| Skema | `migrations/022_cv_field_gaps.sql` | 41 kolom `text` nullable + `COMMENT ON COLUMN` untuk 10 di antaranya |
| Kontrak | `netlify/functions/_lib/db/schema.generated.ts` | diregenerasi dari DB live (`--from-db`), 26 → 28 tabel |
| Baca | `contexts/master-data/service.ts` → `buildMasterNested` | 41 field baru + `keluarga_N_gaji` (dulu hanya ditulis) + `lamakerjadiharapkan` |
| Tulis | `MASTER_COLUMN_MAP` (+26), `AI_TO_MASTER_COLUMNS` (+25 baris), `buildRiwayatSlots` (+5 slot) | jalur Form Master **dan** CV AI |
| Pemetaan CV | `src/lib/cv-template-factory/data.ts` | 30 kunci baru (`gaji_yen`, `tabungan`, `lamakerja`, `visa`, `tes_*`, `mbti`, …) |
| Form | `MasterFullForm.tsx`, `AiCvForm.tsx`, `masterPrefill.ts`, `aiCvDraft.ts` | pertanyaan baru di step 1/2/3/4/5 dan di seksi Identitas/Fisik/Pendidikan/Jiko/Kenalan |
| Enum | `src/lib/opsi-form.ts` | `JENIS_KERJA_PAIRS`, `TINGGAL_PAIRS` — satu pemilik, dipakai dua form |
| Renderer | `rirekisho-xlsx`, `rirekisho-firma`, `kinki`, `jipa` (+ `mbti.ts` → `mbtiFromCode`) | 62 sel kini terisi dari kolom |

**Dua kebocoran yang ikut tertutup** (bukan sel kosong, tapi data hilang senyap):
`firma D9` membaca `raw.gaji_diharapkan` yang tidak pernah ada (selalu `15万円／月`), dan
`AiCvForm` mengumpulkan `cv.lama` (Lama di Jepang) tetapi **tidak pernah mengirimnya** —
nilainya hilang setiap simpan.

**Sengaja TIDAK ditambahkan** (dengan alasan, bukan lupa):

| Yang belum | Alasan |
|---|---|
| `sertifikat_lain_tanggal` (JIPA `B46:E51`) | tanggal perolehan tiap sertifikat diisi **agensi** per lamaran, bukan data kandidat — komentar asli `jipa.ts` sudah menyatakan itu |
| `pekerjaan_4_*` (JIPA baris ke-4) | +8 kolom untuk satu baris yang jarang terpakai; slot 3 menutup mayoritas kandidat |
| `keluarga_6..8_*` (JIPA 8 baris, Firma 7) | +21 kolom; 5 anggota menutup mayoritas. Opsi lain: baca `riwayat_keluarga_json` untuk baris >5 |
| `kemampuan_kerja` (13 kotak できる作業) | kotak masih dicentang dari kata di `keahlian_khusus`; pilihan eksplisit = UI multi-select terbesar, nilainya kecil |
| `B5` CODE LOWONGAN (JIPA) | butuh join `database_candidate.id_loker_pilihan` di `getDrafCvMaster` — bukan kolom, pekerjaan backend tersendiri |
| `L60` tanggal cetak (JIPA) | bisa diisi `TODAY()` saat render; belum dikerjakan supaya tidak mengubah berkas secara diam-diam |

---

## 12. Bukti sesi 2026-10-27

| Periksa | Hasil |
|---|---|
| `migrate.mjs status` | 22 applied · 0 pending · 0 drifted |
| kolom baru di DB | 41 (diverifikasi lewat `information_schema`) |
| `tsc --noEmit` | exit 0 |
| `lint-ratchet` | PASSED (0 diagnostik baru; 6 `useTemplate` sempat muncul lalu diperbaiki dengan template literal) |
| gate kolom | `ai-cv-column-coverage` 4/4 · `form-column-parity` 5/5 |
| round-trip | `actions-master.test.ts` 13/13 — payload form → kolom → `buildMasterNested` |
| renderer | kinki 25/25 · jipa 18/18 · firma 12/12 · asli 27/27 |
| form | `AiCvForm.test.tsx` 72/72 · `MasterFullForm.test.tsx` · `masterPrefill.test.ts` 7/7 · `i18n.keys` |
