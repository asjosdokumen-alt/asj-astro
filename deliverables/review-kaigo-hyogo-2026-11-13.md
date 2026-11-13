# Template CV ke-6 — "Kaigo Hyogo" (履歴書 特定技能)

**Tanggal:** 2026-11-13 · **Berkas sumber:** `F:/template/HERLINA MEY REYGITA CAHYANI_CV.xlsx`
(kandidat ASJ00191) · **Kembarannya (blanko):** `F:/template/CV KAIGO HYOGO履歴書 - 特定技能 2026年.xlsx`

**Hasil:** form keenam terdaftar sebagai `kaigo-hyogo` dan bisa dipilih di
`CvTemplateSelector`. CV Herlina sudah digenerate **dari database** dan
dibandingkan sel-per-sel dengan berkas aslinya: **85 sel sama, 20 beda,
7 sel hanya ada di berkas asli, 3 sel hanya ada di hasil generate** — seluruh
selisih dijelaskan di §4, tidak ada satu pun yang disebabkan renderer.

---

## 1. Apa yang dibangun

| Bagian | Berkas | Isi |
|---|---|---|
| Aset template kosong | `src/lib/cv-template-factory/templates/kaigo-hyogo.b64.ts` | 24.779 byte (dari 1.468.987), 88 merge, `A1:N44`, foto PNG 1x1 |
| Generator aset | `deliverables/kosongkan-kaigo.mjs` | kosongkan 102 sel data, buang 952 baris + 528 sel kosong, bangun ulang `sharedStrings`, ganti foto |
| Renderer | `src/lib/cv-template-factory/renderers/kaigo-hyogo.ts` | peta 101 sel, 6 bagian |
| Tes | `renderers/kaigo-hyogo.test.ts` | **30 tes**: geometri, PII, peta sel, anchor merge |
| Registrasi | `templates.ts` + `templates.test.ts` | daftar jadi 10 template, 6 yang ditawarkan |
| Gerbang paritas | `e2e/form-column-parity.test.ts` | template ke-6 ikut diukur arah template → form |

Aset dibuat dari **berkas Herlina**, bukan dari blanko, karena blanko tidak punya
anchor gambar: foto harus bisa diganti per kandidat, dan anchor `oneCellAnchor`
di `M3:N10` hanya ada di berkas yang sudah difotoi. Yang diambil dari berkas
Herlina hanya layout-nya — seluruh isi dikosongkan, `descr` diganti `Pas Foto`,
dan `sharedStrings` dibangun ulang sehingga **nama, alamat, nomor HP, NIK, dan
nama keluarga Herlina tidak ada lagi di dalam aset** (diuji dengan membuka zip,
bukan dengan percaya pada skripnya).

## 2. Tata letak yang dipetakan

```
1-2    kepala (NO, 作成日, pas foto M3:N10)     21-26  pekerjaan (4 baris)
3-11   identitas (ふりがな…現住所, 趣味)          27-31  sertifikat (3 baris)
12-14  riwayat ke Jepang                        32-40  keluarga (7 baris)
15-20  pendidikan (4 baris)                     41-43  tujuan ke Jepang
                                                44     追加情報 (pertanyaan)
```

Nilai yang **diturunkan**, bukan disalin: `E5` 年齢 (dari tanggal lahir),
`M2` 作成日 (tanggal generate), `B23` 在職中 (saat tanggal keluar kosong).
Nilai yang **diterjemahkan** ke bentuk Jepang: 性別, 既婚・未婚, 利き手, 有/無,
血液型, 学歴 (SMK → 職業学校), 続柄 (kanji), jenis pekerjaan keluarga.

## 3. Perbandingan geometri

| Properti | Asli | Generate | Hasil |
|---|---|---|---|
| Merge | 88 | 88 | **identik** (urutan sama) |
| Tinggi baris 1–44 | — | — | **identik** |
| Lebar kolom (12 `<col>`) | — | — | **identik** |
| `pageSetup` / `printOptions` / `pageMargins` / `sheetView` | — | — | **identik** |
| Baris | 996 | 44 | 952 baris kosong (borderId=0) dibuang |

Baris 45–996 di berkas asli berisi 13.776 sel kosong tanpa garis; `<dimension>`
`A1:Z996` itulah yang membuat area cetak melebar jadi beberapa halaman. Setelah
dibuang, `A1:N44` = persis form-nya. Ini satu-satunya perubahan struktural, dan
disengaja.

## 4. Selisih sel-per-sel (20 beda · 7 hilang · 3 tambahan)

### 4.1 Berbeda karena datanya memang berbeda di database

| Sel | Berkas asli | Generate (DB) | Keterangan |
|---|---|---|---|
| `H6` 身長 | 157 | **153** | master `tb=153`. Berkas contoh dibuat sebelum data diperbarui |
| `K6` 体重 | 54 | **55** | master `bb=55` |
| `B3` ふりがな | ルリナ・… | **ヘルリナ・…** | DB `furigana` benar (`HE` → ヘ); berkas contoh kehilangan satu huruf |
| `B9` 現住所 | …PONOROGO | …PONOROGO **JAWA TIMUR 63453** | DB lebih lengkap |
| `B11` 趣味 | 小説を読むことです | **趣味は**小説を読むことです。 | teks Jepang dari DB apa adanya |
| `B17`/`A18`/`B18`/`A19`/`B19` | 2020-06 / 2020-07 / 2023-06 / 2023-07 / 2025-05 | **2019-06 / 2019-06 / 2022-06 / 2022-07 / 2025-06** | tanggal pendidikan di berkas contoh tidak cocok dengan master |
| `H35` 母の仕事 | 自営業 | **家事** | master `IBU RUMAH TANGGA`; berkas contoh menulis 自営業 (bertentangan dengan DB) |
| `A42` 日本での目標 | …目的は日本の介護… | …目的は**、**日本の介護… | versi DB yang dipakai (ada tanda baca) |
| `C23` 会社名 | Pondok Lansia … | PONDOK LANSIA … | DB menyimpan huruf besar; form lain juga huruf besar |
| `M2` 作成日 | 2026年 11月 12日 | 2026年 11月 13日 | tanggal CV dibuat |

### 4.2 Berbeda karena keputusan format (perlu persetujuan pemilik)

| Sel | Asli | Generate | Alasan |
|---|---|---|---|
| `K19` 学歴 SMK | 職業学校 | **職業学校（ADMINISTRASI PERKANTORAN）** | placeholder template sendiri berbunyi *「*Jika SMK Tuliskan jurusannya」*; berkas contoh melewatkannya |
| `J23` 仕事 | 介護 | **PERAWAT LANSIA / CAREGIVER** | `jabatan_jp` kosong di DB, dan daftar `Referensi` template tidak punya 介護 — menerjemahkan sendiri = mengarang |
| `A29`–`A31` 取得年月 | 2026年2月16日 / 6月2日 / 7月21日 | **2026年 2月 / 6月 / 7月** | DB hanya menyimpan bulan (`sertifikat_lain`), hari tidak ada di kolom mana pun |
| `J29` 資格 (kanan) | JFT Basic A2 | **A2** | nama sudah ada di `C29`; kolom kanan dipakai untuk level/nilai |
| `J30`/`J31` | (kosong) | **合格** | DB mencatat `(nilai 合格)` untuk kedua ujian |
| `M1` NO | (kosong) | **ASJ00191** | nomor kandidat agensi; satu-satunya nomor yang kita punya. **Bisa dibatalkan** kalau kolom itu milik klien |

### 4.3 Hanya ada di berkas asli — datanya KOSONG di database (7 sel)

| Sel | Isi asli | Kolom DB |
|---|---|---|
| `K5` 利き手 | 右 | `tangandominan` — kosong |
| `F6`/`F7` 視力 | 1 / 1 | `mata_kanan`, `mata_kiri` — kosong |
| `E8` 喫煙 | 無 | `merokok` — kosong |
| `H8` 飲酒 | 無 | `minum_alkohol` — kosong |
| `K8` 血液型 | O | `golongan_darah` — kosong |
| `B13` 渡航時期 | 無し | `status_eks_jepang` — kosong |

`B13` **sengaja tidak** diisi `無し`: itu pernyataan "belum pernah ke Jepang",
dan data yang kosong bukan bukti itu. Tujuh sel ini akan terisi sendiri begitu
kandidat/agensi melengkapi kolomnya — tidak perlu ubah kode.

### 4.4 Hanya ada di hasil generate (3 sel)

`M1` (NO), `J30`, `J31` — lihat §4.2.

### 4.5 Sel yang sengaja tidak diisi

| Sel | Alasan |
|---|---|
| `C14` 特定技能残日数 | tidak ada kolomnya; berkas contoh juga kosong |
| `I13` 渡航目的 | tidak ada kolomnya |
| `B44:N44` 追加情報 | sel itu berisi PERTANYAAN template, bukan jawaban |
| `A43` | baris komentar yang disediakan untuk agensi |

## 5. Bug yang ditemukan perbandingan ini

🔴 **`既婚・未婚` ditulis ke `C8`, padahal merge-nya `B8:C8`.** Excel hanya
membaca nilai di sel **anchor** (kiri-atas), jadi sel itu akan tampak kosong
saat berkasnya dibuka — tanpa satu pun error, dan tanpa satu pun tes merah.
Diperbaiki di renderer + generator aset, dan sekarang dijaga tes
*"setiap sel yang ditulis adalah sel ANCHOR dari merge-nya"* (30 tes, hijau).

## 6. Gerbang

| Gerbang | Hasil |
|---|---|
| `kaigo-hyogo.test.ts` | **30/30** |
| `templates.test.ts` | 21/21 (10 terdaftar · 6 ditawarkan) |
| `CvTemplateSelector.test.tsx` + `factory.test.ts` | 15/15 |
| `e2e/form-column-parity.test.ts` | **11/11** (template ke-6 ikut diukur) |
| `tsc --noEmit` | bersih |
| `lint-ratchet` | PASSED (1968 → 1968) |
| Counter indexer | `files.length` 650→**653**, `ts` 365→**368**, `fileCount` 650→**653** — +3 berkas `.ts` baru, terukur |

## 7. Cara mengulang

```bash
node deliverables/kosongkan-kaigo.mjs                      # aset dari berkas klien
node deliverables/verify-kaigo-aset.mjs                    # PII + geometri aset
node deliverables/bandingkan-kaigo.mjs "<asli>" "<hasil>"  # sel-per-sel
node deliverables/bandingkan-kaigo-geometri.mjs "<asli>" "<hasil>"
node deliverables/cek-kaigo-hasil.mjs "<hasil>"            # buka dengan exceljs
```

Hasil generate untuk Herlina: `F:/template/HERLINA MEY REYGITA CAHYANI_CV (generate dari DB).xlsx`
(sengaja **di luar repo** — berisi PII; `deliverables/cv/` hanya menyimpan form kosong).
