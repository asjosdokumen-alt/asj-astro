/**
 * opsi-form.ts — SINGLE OWNER of the bilingual (ID/JP) dropdown lists used by
 * the candidate-facing forms.
 *
 * Why this file exists
 * --------------------
 * The legacy form (`master_full.ts`) had exactly two such lists: `SSW_LIST`
 * (16 official Tokutei Ginou fields) and `PEKERJAAN_LIST` (25 occupations).
 * The Astro port carried `SSW_LIST` over correctly, but the port never applied
 * `PEKERJAAN_LIST` to the CV Master form at all — the fields became free text.
 * School major (jurusan) never had a list in either version.
 *
 * Consequences of free text that actually bit the business:
 *   - "OPERATOR" / "Operator Produksi" / "operator produksi" stored as three
 *     different jobs, so matchmaking and reporting cannot group them;
 *   - the Japanese side of the CV is machine-translated from whatever the
 *     candidate typed, including typos;
 *   - a blank field is ambiguous: "did not fill in" or "does not have one".
 *
 * Shape contract
 * --------------
 * Every list is `Array<[value, label]>`:
 *   value — what gets SAVED to the database (stable, ASCII, never translated);
 *   label — what the candidate SEES (bilingual ID + Japanese).
 * This mirrors the legacy `SSW_LIST` and is why adding a language later cannot
 * corrupt stored rows.
 *
 * The `__LAINNYA__` sentinel is a separate, explicit concern — see
 * `withOther()` at the bottom. It is deliberately NOT baked into the arrays so
 * that `someValue()`/`resolveOther()` keep working on the raw data.
 *
 * Japanese glosses for the occupation list are carried over verbatim from the
 * legacy list where the entry already existed (marked in the comments); new
 * entries were glossed in the same style.
 */

/** Tuple form used by every list here: [savedValue, displayLabel]. */
export type Opsi = [string, string];

/* ══════════════════════════════════════════════════════════════════════════
   1. PEKERJAAN — occupation / jabatan
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * 25 entries carried over verbatim from legacy `PEKERJAAN_LIST`
 * (`master_full.ts:149-175`). Kept byte-identical, including order, because
 * these strings are already stored in existing candidate rows — changing a
 * value would orphan that data.
 */
export const PEKERJAAN_LEGACY: Opsi[] = [
  ['OPERATOR PRODUKSI', 'OPERATOR PRODUKSI (工場作業員)'],
  ['ADMIN / STAFF ADMIN', 'ADMIN / STAFF ADMIN (事務員)'],
  ['SALES / MARKETING', 'SALES / MARKETING (営業)'],
  ['KASIR', 'KASIR (レジ係)'],
  ['KOKI / CHEF', 'KOKI / CHEF (調理師)'],
  ['PELAYAN / WAITER', 'PELAYAN / WAITER (ウェイター)'],
  ['CLEANING SERVICE', 'CLEANING SERVICE (清掃員)'],
  ['SATPAM / SECURITY', 'SATPAM / SECURITY (警備員)'],
  ['SOPIR / DRIVER', 'SOPIR / DRIVER (運転手)'],
  ['BURUH PABRIK', 'BURUH PABRIK (工場労働者)'],
  ['KARYAWAN SWASTA', 'KARYAWAN SWASTA (会社員)'],
  ['PEGAWAI TOKO', 'PEGAWAI TOKO (店員)'],
  ['GURU / PENGAJAR', 'GURU / PENGAJAR (教師)'],
  ['PERAWAT', 'PERAWAT (看護師)'],
  ['MEKANIK', 'MEKANIK (整備士)'],
  ['TEKNISI', 'TEKNISI (技術者)'],
  ['WELDER / LAS', 'WELDER / LAS (溶接工)'],
  ['TUKANG BANGUNAN', 'TUKANG BANGUNAN (建設作業員)'],
  ['PETANI / PERKEBUNAN', 'PETANI / PERKEBUNAN (農業)'],
  ['NELAYAN', 'NELAYAN (漁師)'],
  ['RESEPSIONIS', 'RESEPSIONIS (受付)'],
  ['BARISTA', 'BARISTA (バリスタ)'],
  ['IBU RUMAH TANGGA', 'IBU RUMAH TANGGA (主婦)'],
  ['PELAJAR / MAHASISWA', 'PELAJAR / MAHASISWA (学生)'],
  ['BELUM BEKERJA', 'BELUM BEKERJA (無職)'],
];

/**
 * Additional occupations common in Indonesia, grouped roughly by sector.
 * Chosen so that the jobs actually advertised by ASJ (manufacturing, food,
 * care, construction, agriculture, hospitality, logistics, retail, services)
 * all have a matching entry — that is the whole point: if a candidate's real
 * job is not here, they pick "Lainnya" and the list failed.
 */
export const PEKERJAAN_TAMBAHAN: Opsi[] = [
  // ── Manufaktur & produksi ──
  ['OPERATOR MESIN', 'OPERATOR MESIN (機械オペレーター)'],
  ['QC / QUALITY CONTROL', 'QC / QUALITY CONTROL (品質管理)'],
  ['STAFF GUDANG', 'STAFF GUDANG (倉庫作業員)'],
  ['PACKING / PENGEMASAN', 'PACKING / PENGEMASAN (梱包作業員)'],
  ['OPERATOR FORKLIFT', 'OPERATOR FORKLIFT (フォークリフト運転手)'],
  ['TEKNISI LISTRIK', 'TEKNISI LISTRIK (電気工事士)'],
  ['TEKNISI MESIN', 'TEKNISI MESIN (機械技術者)'],
  ['OPERATOR CNC', 'OPERATOR CNC (CNCオペレーター)'],
  ['PENGELASAN ARGON', 'PENGELASAN ARGON (アルゴン溶接工)'],
  ['TUKANG BESI', 'TUKANG BESI (鉄筋工)'],
  ['TUKANG KAYU', 'TUKANG KAYU (大工)'],
  ['TUKANG CAT', 'TUKANG CAT (塗装工)'],
  ['TUKANG BATU', 'TUKANG BATU (左官)'],
  ['TUKANG GYPSUM', 'TUKANG GYPSUM (ボード工)'],
  ['TEKNISI AC', 'TEKNISI AC (空調技師)'],
  ['TEKNISI ELEKTRONIK', 'TEKNISI ELEKTRONIK (電子機器技術者)'],
  // ── Makanan & restoran ──
  ['TUKANG MASAK / COOK', 'TUKANG MASAK / COOK (料理人)'],
  ['PEMBUAT ROTI / BAKERY', 'PEMBUAT ROTI / BAKERY (パン職人)'],
  ['PENJAGA WARUNG', 'PENJAGA WARUNG (食堂店主)'],
  ['PELAYAN RESTORAN', 'PELAYAN RESTORAN (レストランスタッフ)'],
  ['BARISTA / BARTENDER', 'BARISTA / BARTENDER (バリスタ・バーテンダー)'],
  ['PENGOLAH MAKANAN', 'PENGOLAH MAKANAN (食品加工)'],
  // ── Pertanian, perikanan, kehutanan ──
  ['BURUH TANI', 'BURUH TANI (農業労働者)'],
  ['PETANI SAYUR', 'PETANI SAYUR (野菜農家)'],
  ['PEKEBUN SAWIT', 'PEKEBUN SAWIT (オイルパーム農園)'],
  ['PETERNAK', 'PETERNAK (畜産農家)'],
  ['BUDIDAYA IKAN', 'BUDIDAYA IKAN (養殖業)'],
  ['NELAYAN / ABK KAPAL', 'NELAYAN / ABK KAPAL (漁船員)'],
  // ── Kesehatan & perawatan ──
  ['PERAWAT LANSIA / CAREGIVER', 'PERAWAT LANSIA / CAREGIVER (介護士)'],
  ['BIDAN', 'BIDAN (助産師)'],
  ['ASISTEN APOTEKER', 'ASISTEN APOTEKER (薬局助手)'],
  ['FISIOTERAPIS', 'FISIOTERAPIS (理学療法士)'],
  // ── Perhotelan, pariwisata, jasa ──
  ['HOUSEKEEPING HOTEL', 'HOUSEKEEPING HOTEL (ホテル客室清掃)'],
  ['BELLBOY / PORTER', 'BELLBOY / PORTER (ベルボーイ)'],
  ['PEMANDU WISATA', 'PEMANDU WISATA (ツアーガイド)'],
  ['SALON / BARBER', 'SALON / BARBER (美容師・理容師)'],
  ['TUKANG JAHIT', 'TUKANG JAHIT (縫製工)'],
  ['PENJAHIT GARMEN', 'PENJAHIT GARMEN (アパレル縫製)'],
  ['LAUNDRY', 'LAUNDRY (クリーニング)'],
  // ── Transportasi & logistik ──
  ['KURIR / EKSPEDISI', 'KURIR / EKSPEDISI (配達員)'],
  ['SOPIR TRUK', 'SOPIR TRUK (トラック運転手)'],
  ['SOPIR OJEK / TAKSI', 'SOPIR OJEK / TAKSI (タクシー運転手)'],
  ['PELAUT', 'PELAUT (船員)'],
  // ── Retail & kantor ──
  ['PENJAGA TOKO', 'PENJAGA TOKO (店舗スタッフ)'],
  ['SUPERVISOR TOKO', 'SUPERVISOR TOKO (店長)'],
  ['KASIR RETAIL', 'KASIR RETAIL (レジ係)'],
  ['STAFF AKUNTANSI', 'STAFF AKUNTANSI (経理)'],
  ['STAFF HRD', 'STAFF HRD (人事)'],
  ['STAFF CUSTOMER SERVICE', 'STAFF CUSTOMER SERVICE (カスタマーサービス)'],
  ['OPERATOR TELEPON / CALL CENTER', 'OPERATOR TELEPON / CALL CENTER (コールセンター)'],
  ['RESEPSIONIS KLINIK', 'RESEPSIONIS KLINIK (受付)'],
  ['SEKRETARIS', 'SEKRETARIS (秘書)'],
  ['DATA ENTRY', 'DATA ENTRY (データ入力)'],
  // ── Teknologi & profesional ──
  ['PROGRAMMER / IT', 'PROGRAMMER / IT (プログラマー)'],
  ['DESAINER GRAFIS', 'DESAINER GRAFIS (グラフィックデザイナー)'],
  ['OPERATOR KOMPUTER', 'OPERATOR KOMPUTER (コンピュータオペレーター)'],
  ['TEKNISI JARINGAN', 'TEKNISI JARINGAN (ネットワーク技術者)'],
  // ── Keamanan & kebersihan ──
  ['PETUGAS KEBERSIHAN', 'PETUGAS KEBERSIHAN (清掃員)'],
  ['TUKANG KEBUN', 'TUKANG KEBUN (庭師)'],
  ['PENJAGA MALAM', 'PENJAGA MALAM (夜間警備)'],
  ['PEMADAM KEBAKARAN', 'PEMADAM KEBAKARAN (消防士)'],
  // ── Pendidikan & sosial ──
  ['GURU TK / PAUD', 'GURU TK / PAUD (幼稚園教諭)'],
  ['GURU SD', 'GURU SD (小学校教諭)'],
  ['GURU SMP / SMA', 'GURU SMP / SMA (中学校・高校教諭)'],
  ['DOSEN', 'DOSEN (大学講師)'],
  ['GURU LES / TUTOR', 'GURU LES / TUTOR (家庭教師)'],
  ['USTADZ / PENGAJAR AGAMA', 'USTADZ / PENGAJAR AGAMA (宗教教師)'],
  // ── Pemerintahan & keamanan negara ──
  ['PNS / ASN', 'PNS / ASN (公務員)'],
  ['TNI', 'TNI (軍人)'],
  ['POLRI', 'POLRI (警察官)'],
  // ── Wirausaha & status lain ──
  ['WIRAUSAHA / PEMILIK USAHA', 'WIRAUSAHA / PEMILIK USAHA (自営業)'],
  ['PEDAGANG / PKL', 'PEDAGANG / PKL (露天商)'],
  ['FREELANCE', 'FREELANCE (フリーランス)'],
  ['PENSIUNAN', 'PENSIUNAN (退職者)'],
  ['TIDAK BEKERJA', 'TIDAK BEKERJA (無職)'],
];

/** Full occupation list: legacy first (never reorder those), then additions. */
export const PEKERJAAN: Opsi[] = [...PEKERJAAN_LEGACY, ...PEKERJAAN_TAMBAHAN];

/* ══════════════════════════════════════════════════════════════════════════
   2. JURUSAN — school / university major
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * SMK majors, grouped by the official Indonesian "bidang keahlian" families.
 * Names follow the Kemendikbud spektrum keahlian SMK so the same major is
 * spelled the same way in every candidate's CV. Values keep the common
 * abbreviation candidates recognise ("TKJ", "TKR"), because that is what they
 * will search for.
 */
export const JURUSAN_SMK: Opsi[] = [
  // Teknologi & rekayasa
  ['TEKNIK KOMPUTER & JARINGAN (TKJ)', 'TEKNIK KOMPUTER & JARINGAN / TKJ (コンピュータ・ネットワーク)'],
  ['REKAYASA PERANGKAT LUNAK (RPL)', 'REKAYASA PERANGKAT LUNAK / RPL (ソフトウェア開発)'],
  ['MULTIMEDIA', 'MULTIMEDIA (マルチメディア)'],
  ['TEKNIK ELEKTRONIKA INDUSTRI', 'TEKNIK ELEKTRONIKA INDUSTRI (電子工学)'],
  ['TEKNIK INSTALASI TENAGA LISTRIK', 'TEKNIK INSTALASI TENAGA LISTRIK (電気設備)'],
  ['TEKNIK MESIN', 'TEKNIK MESIN (機械工学)'],
  ['TEKNIK KENDARAAN RINGAN (TKR)', 'TEKNIK KENDARAAN RINGAN / TKR (自動車工学)'],
  ['TEKNIK SEPEDA MOTOR (TSM)', 'TEKNIK SEPEDA MOTOR / TSM (オートバイ整備)'],
  ['TEKNIK PENGELASAN', 'TEKNIK PENGELASAN (溶接技術)'],
  ['TEKNIK GAMBAR BANGUNAN', 'TEKNIK GAMBAR BANGUNAN (建築製図)'],
  ['TEKNIK KONSTRUKSI BATU & BETON', 'TEKNIK KONSTRUKSI BATU & BETON (建築施工)'],
  ['TEKNIK KONSTRUKSI BAJA', 'TEKNIK KONSTRUKSI BAJA (鉄骨施工)'],
  ['TEKNIK PENDINGIN & TATA UDARA', 'TEKNIK PENDINGIN & TATA UDARA (空調冷凍)'],
  ['TEKNIK MEKATRONIKA', 'TEKNIK MEKATRONIKA (メカトロニクス)'],
  ['TEKNIK OTOMOTIF', 'TEKNIK OTOMOTIF (自動車工学)'],
  ['TEKNIK PERMESINAN', 'TEKNIK PERMESINAN (機械加工)'],
  // Bisnis & manajemen
  ['AKUNTANSI', 'AKUNTANSI (会計)'],
  ['ADMINISTRASI PERKANTORAN', 'ADMINISTRASI PERKANTORAN (事務)'],
  ['BISNIS DARING & PEMASARAN', 'BISNIS DARING & PEMASARAN (オンライン販売・マーケティング)'],
  ['MANAJEMEN LOGISTIK', 'MANAJEMEN LOGISTIK (物流管理)'],
  ['OTOMATISASI TATA KELOLA PERKANTORAN', 'OTOMATISASI TATA KELOLA PERKANTORAN (事務オートメーション)'],
  ['PERBANKAN & KEUANGAN', 'PERBANKAN & KEUANGAN (銀行・金融)'],
  ['RETAIL / BISNIS RITEL', 'RETAIL / BISNIS RITEL (小売)'],
  // Pariwisata & kuliner
  ['TATA BOGA', 'TATA BOGA (調理)'],
  ['TATA BUSANA', 'TATA BUSANA (服飾)'],
  ['TATA KECANTIKAN & SPA', 'TATA KECANTIKAN & SPA (美容・スパ)'],
  ['TATA RIAS', 'TATA RIAS (メイクアップ)'],
  ['PERHOTELAN', 'PERHOTELAN (ホテル)'],
  ['USAHA PERJALANAN WISATA', 'USAHA PERJALANAN WISATA (旅行業)'],
  ['PATISERI / BAKERY', 'PATISERI / BAKERY (製菓・製パン)'],
  // Pertanian & lingkungan
  ['AGRIBISNIS TANAMAN PANGAN & HORTIKULTURA', 'AGRIBISNIS TANAMAN PANGAN & HORTIKULTURA (作物・園芸)'],
  ['AGRIBISNIS PERKEBUNAN', 'AGRIBISNIS PERKEBUNAN (農業)'],
  ['AGRIBISNIS PETERNAKAN', 'AGRIBISNIS PETERNAKAN (畜産)'],
  ['AGRIBISNIS PERIKANAN', 'AGRIBISNIS PERIKANAN (水産)'],
  ['TEKNIK BUDIDAYA PERAIRAN', 'TEKNIK BUDIDAYA PERAIRAN (養殖)'],
  ['TEKNOLOGI PENGOLAHAN HASIL PERTANIAN', 'TEKNOLOGI PENGOLAHAN HASIL PERTANIAN (農産物加工)'],
  ['KEHUTANAN', 'KEHUTANAN (林業)'],
  // Kesehatan & sosial
  ['ASISTEN KEPERAWATAN', 'ASISTEN KEPERAWATAN (看護補助)'],
  ['FARMASI KLINIS & KOMUNITAS', 'FARMASI KLINIS & KOMUNITAS (薬学)'],
  ['TEKNOLOGI LABORATORIUM MEDIK', 'TEKNOLOGI LABORATORIUM MEDIK (臨床検査)'],
  // Seni & kreatif
  ['DESAIN KOMUNIKASI VISUAL', 'DESAIN KOMUNIKASI VISUAL (ビジュアルデザイン)'],
  ['ANIMASI', 'ANIMASI (アニメーション)'],
  ['DESAIN PRODUK KREATIF', 'DESAIN PRODUK KREATIF (プロダクトデザイン)'],
  ['PEMBUATAN POLA', 'PEMBUATAN POLA (型紙製作)'],
  ['KRIYA KAYU', 'KRIYA KAYU (木工芸)'],
  ['KRIYA KULIT', 'KRIYA KULIT (皮革工芸)'],
  ['KRIYA TEKSTIL', 'KRIYA TEKSTIL (テキスタイル工芸)'],
  ['KRIYA KERAMIK', 'KRIYA KERAMIK (陶芸)'],
  ['SENI MUSIK', 'SENI MUSIK (音楽)'],
  ['SENI TARI', 'SENI TARI (舞踊)'],
  ['SENI TEATER', 'SENI TEATER (演劇)'],
  // Umum / non-teknis
  ['MIPA / IPA', 'MIPA / IPA (理科)'],
  ['TEKNOLOGI INFORMASI', 'TEKNOLOGI INFORMASI (情報技術)'],
];

/** SMA/MA major (penjurusan). */
export const JURUSAN_SMA: Opsi[] = [
  ['IPA (MIPA)', 'IPA / MIPA (理科)'],
  ['IPS', 'IPS (社会科学)'],
  ['BAHASA', 'BAHASA (言語)'],
  ['KEAGAMAAN', 'KEAGAMAAN (宗教)'],
  ['ILMU BUDAYA & BAHASA', 'ILMU BUDAYA & BAHASA (人文科学)'],
  ['UMUM / TIDAK ADA JURUSAN', 'UMUM / TIDAK ADA JURUSAN (普通科)'],
];

/**
 * University programs (D3/D4/S1). Covers the fields ASJ candidates realistically
 * come from rather than mirroring an exhaustive national catalog — an
 * unlisted program is exactly what "Lainnya" is for.
 */
export const JURUSAN_KULIAH: Opsi[] = [
  ['TEKNIK MESIN (D3/S1)', 'TEKNIK MESIN — KULIAH D3/S1 (機械工学)'],
  ['TEKNIK ELEKTRO (D3/S1)', 'TEKNIK ELEKTRO (電気工学)'],
  ['TEKNIK INFORMATIKA (S1)', 'TEKNIK INFORMATIKA (情報工学)'],
  ['SISTEM INFORMASI (S1)', 'SISTEM INFORMASI (情報システム)'],
  ['TEKNIK SIPIL (S1)', 'TEKNIK SIPIL (土木工学)'],
  ['ARSITEKTUR (S1)', 'ARSITEKTUR (建築学)'],
  ['TEKNIK INDUSTRI (S1)', 'TEKNIK INDUSTRI (経営工学)'],
  ['TEKNIK KIMIA (S1)', 'TEKNIK KIMIA (化学工学)'],
  ['AGROTEKNOLOGI (S1)', 'AGROTEKNOLOGI (農業工学)'],
  ['PETENAKAN (S1)', 'PETERNAKAN (畜産学)'],
  ['BUDIDAYA PERAIRAN (S1)', 'BUDIDAYA PERAIRAN (水産養殖)'],
  ['AKUNTANSI (D3/S1)', 'AKUNTANSI (会計学)'],
  ['MANAJEMEN (D3/S1)', 'MANAJEMEN (経営学)'],
  ['EKONOMI PEMBANGUNAN (S1)', 'EKONOMI PEMBANGUNAN (経済学)'],
  ['ADMINISTRASI BISNIS (D3/S1)', 'ADMINISTRASI BISNIS (経営管理)'],
  ['ADMINISTRASI NEGARA (S1)', 'ADMINISTRASI NEGARA (行政学)'],
  ['ILMU HUKUM (S1)', 'ILMU HUKUM (法学)'],
  ['ILMU KOMUNIKASI (S1)', 'ILMU KOMUNIKASI (コミュニケーション学)'],
  ['HUBUNGAN INTERNASIONAL (S1)', 'HUBUNGAN INTERNASIONAL (国際関係)'],
  ['SASTRA JEPANG (S1)', 'SASTRA JEPANG (日本語文学)'],
  ['SASTRA INGGRIS (S1)', 'SASTRA INGGRIS (英語文学)'],
  ['PENDIDIKAN BAHASA JEPANG (S1)', 'PENDIDIKAN BAHASA JEPANG (日本語教育)'],
  ['PENDIDIKAN GURU SD (S1)', 'PENDIDIKAN GURU SD (初等教育)'],
  ['PENDIDIKAN GURU PAUD (S1)', 'PENDIDIKAN GURU PAUD (幼児教育)'],
  ['KEBIDANAN (D3/S1)', 'KEBIDANAN (助産学)'],
  ['ILMU KEPERAWATAN (S1)', 'ILMU KEPERAWATAN (看護学)'],
  ['FARMASI (S1)', 'FARMASI (薬学)'],
  ['GIZI (D3/S1)', 'GIZI (栄養学)'],
  ['KESEHATAN MASYARAKAT (S1)', 'KESEHATAN MASYARAKAT (公衆衛生)'],
  ['PSIKOLOGI (S1)', 'PSIKOLOGI (心理学)'],
  ['DESAIN KOMUNIKASI VISUAL (S1)', 'DESAIN KOMUNIKASI VISUAL — KULIAH S1 (ビジュアルデザイン)'],
  ['DESAIN PRODUK (S1)', 'DESAIN PRODUK (プロダクトデザイン)'],
  ['TATA BOGA / PARIWISATA (D3/S1)', 'TATA BOGA / PARIWISATA (調理・観光)'],
  ['PERHOTELAN (D3/S1)', 'PERHOTELAN (ホテル学)'],
  ['AGAMA / SYARIAH (S1)', 'AGAMA / SYARIAH (宗教学)'],
];

/**
 * Every major, in the order a candidate would actually meet them:
 * SMK first (the overwhelming majority of ASJ applicants), then SMA, then
 * university. The education row labels each entry with its level so the list
 * stays readable when flattened into one `<select>`.
 *
 * NOTE: values inside `JURUSAN_SMK`/`JURUSAN_SMA`/`JURUSAN_KULIAH` are already
 * unique across the three groups, so flattening cannot create a duplicate
 * `<option value>`. `JURUSAN` keeps that property — see the assertion below.
 */
export const JURUSAN: Opsi[] = [...JURUSAN_SMK, ...JURUSAN_SMA, ...JURUSAN_KULIAH];

/* ══════════════════════════════════════════════════════════════════════════
   3. LISTS for other fields whose answer is a finite, known set
   ══════════════════════════════════════════════════════════════════════════ */

/** 38 provinces of Indonesia (as of the 2022–2024 pemekaran), for alamat/domisili. */
export const PROVINSI: Opsi[] = [
  ['ACEH', 'ACEH (アチェ)'],
  ['SUMATERA UTARA', 'SUMATERA UTARA (北スマトラ)'],
  ['SUMATERA BARAT', 'SUMATERA BARAT (西スマトラ)'],
  ['RIAU', 'RIAU (リアウ)'],
  ['KEPULAUAN RIAU', 'KEPULAUAN RIAU (リアウ諸島)'],
  ['JAMBI', 'JAMBI (ジャンビ)'],
  ['BENGKULU', 'BENGKULU (ブンクル)'],
  ['SUMATERA SELATAN', 'SUMATERA SELATAN (南スマトラ)'],
  ['KEPULAUAN BANGKA BELITUNG', 'KEPULAUAN BANGKA BELITUNG (バンカ・ブリトゥン諸島)'],
  ['LAMPUNG', 'LAMPUNG (ランプン)'],
  ['BANTEN', 'BANTEN (バンテン)'],
  ['DKI JAKARTA', 'DKI JAKARTA (ジャカルタ首都特別州)'],
  ['JAWA BARAT', 'JAWA BARAT (西ジャワ)'],
  ['JAWA TENGAH', 'JAWA TENGAH (中部ジャワ)'],
  ['DI YOGYAKARTA', 'DI YOGYAKARTA (ジョグジャカルタ特別州)'],
  ['JAWA TIMUR', 'JAWA TIMUR (東ジャワ)'],
  ['BALI', 'BALI (バリ)'],
  ['NUSA TENGGARA BARAT', 'NUSA TENGGARA BARAT (西ヌサ・トゥンガラ)'],
  ['NUSA TENGGARA TIMUR', 'NUSA TENGGARA TIMUR (東ヌサ・トゥンガラ)'],
  ['KALIMANTAN BARAT', 'KALIMANTAN BARAT (西カリマンタン)'],
  ['KALIMANTAN TENGAH', 'KALIMANTAN TENGAH (中部カリマンタン)'],
  ['KALIMANTAN SELATAN', 'KALIMANTAN SELATAN (南カリマンタン)'],
  ['KALIMANTAN TIMUR', 'KALIMANTAN TIMUR (東カリマンタン)'],
  ['KALIMANTAN UTARA', 'KALIMANTAN UTARA (北カリマンタン)'],
  ['SULAWESI UTARA', 'SULAWESI UTARA (北スラウェシ)'],
  ['GORONTALO', 'GORONTALO (ゴロンタロ)'],
  ['SULAWESI TENGAH', 'SULAWESI TENGAH (中部スラウェシ)'],
  ['SULAWESI BARAT', 'SULAWESI BARAT (西スラウェシ)'],
  ['SULAWESI SELATAN', 'SULAWESI SELATAN (南スラウェシ)'],
  ['SULAWESI TENGGARA', 'SULAWESI TENGGARA (南東スラウェシ)'],
  ['MALUKU', 'MALUKU (マルク)'],
  ['MALUKU UTARA', 'MALUKU UTARA (北マルク)'],
  ['PAPUA', 'PAPUA (パプア)'],
  ['PAPUA BARAT', 'PAPUA BARAT (西パプア)'],
  ['PAPUA SELATAN', 'PAPUA SELATAN (南パプア)'],
  ['PAPUA TENGAH', 'PAPUA TENGAH (中部パプア)'],
  ['PAPUA PEGUNUNGAN', 'PAPUA PEGUNUNGAN (パプア山岳)'],
  ['PAPUA BARAT DAYA', 'PAPUA BARAT DAYA (南西パプア)'],
];

/** Major cities, for tempat lahir / kota paspor / kota domisili. */
export const KOTA: Opsi[] = [
  ['JAKARTA', 'JAKARTA (ジャカルタ)'],
  ['SURABAYA', 'SURABAYA (スラバヤ)'],
  ['BANDUNG', 'BANDUNG (バンドン)'],
  ['MEDAN', 'MEDAN (メダン)'],
  ['SEMARANG', 'SEMARANG (スマラン)'],
  ['MAKASSAR', 'MAKASSAR (マカッサル)'],
  ['PALEMBANG', 'PALEMBANG (パレンバン)'],
  ['TANGERANG', 'TANGERANG (タンゲラン)'],
  ['DEPOK', 'DEPOK (デポック)'],
  ['BEKASI', 'BEKASI (ブカシ)'],
  ['BOGOR', 'BOGOR (ボゴール)'],
  ['BATAM', 'BATAM (バタム)'],
  ['PEKANBARU', 'PEKANBARU (プカンバル)'],
  ['PADANG', 'PADANG (パダン)'],
  ['BANDAR LAMPUNG', 'BANDAR LAMPUNG (バンダルランプン)'],
  ['YOGYAKARTA', 'YOGYAKARTA (ジョグジャカルタ)'],
  ['SOLO / SURAKARTA', 'SOLO / SURAKARTA (スラカルタ)'],
  ['MALANG', 'MALANG (マラン)'],
  ['KEDIRI', 'KEDIRI (クディリ)'],
  ['DENPASAR', 'DENPASAR (デンパサール)'],
  ['MATARAM', 'MATARAM (マタラム)'],
  ['BANJARMASIN', 'BANJARMASIN (バンジャルマシン)'],
  ['BALIKPAPAN', 'BALIKPAPAN (バリクパパン)'],
  ['SAMARINDA', 'SAMARINDA (サマリンダ)'],
  ['PONTIANAK', 'PONTIANAK (ポンティアナック)'],
  ['MANADO', 'MANADO (マナド)'],
  ['MAKASSAR / UJUNG PANDANG', 'MAKASSAR / UJUNG PANDANG (ウジュンパンダン)'],
  ['KENDARI', 'KENDARI (ケンダリ)'],
  ['AMBON', 'AMBON (アンボン)'],
  ['JAYAPURA', 'JAYAPURA (ジャヤプラ)'],
  ['CIREBON', 'CIREBON (チルボン)'],
  ['TASIKMALAYA', 'TASIKMALAYA (タシクマラヤ)'],
  ['SERANG', 'SERANG (スラン)'],
  ['JEMBER', 'JEMBER (ジュンベル)'],
  ['MADIUN', 'MADIUN (マディウン)'],
  ['BLITAR', 'BLITAR (ブリタール)'],
  ['SUKABUMI', 'SUKABUMI (スカブミ)'],
  ['KARAWANG', 'KARAWANG (カラワン)'],
];

/** jenis SIM — a closed set, so it should never be free text. */
export const SIM: Opsi[] = [
  ['', 'Pilih / 選択'],
  ['TIDAK PUNYA', 'TIDAK PUNYA (なし)'],
  ['SIM A', 'SIM A (普通自動車)'],
  ['SIM B1', 'SIM B1 (中型自動車)'],
  ['SIM B2', 'SIM B2 (大型自動車)'],
  ['SIM C', 'SIM C (普通自動二輪)'],
  ['SIM C1', 'SIM C1 (小型自動二輪)'],
  ['SIM A UMUM', 'SIM A UMUM (普通自動車・営業)'],
  ['SIM B1 UMUM', 'SIM B1 UMUM (中型自動車・営業)'],
  ['SIM B2 UMUM', 'SIM B2 UMUM (大型自動車・営業)'],
  ['SIM C UMUM', 'SIM C UMUM (二輪・営業)'],
  ['SIM INTERNASIONAL (IDP)', 'SIM INTERNASIONAL / IDP (国際運転免許)'],
];

/** Bank for gaji/tabungan rekening. */
export const BANK: Opsi[] = [
  ['BCA', 'BCA (バンク・セントラル・アジア)'],
  ['BRI', 'BRI (ブミ・ラキャット・インドネシア銀行)'],
  ['BNI', 'BNI (インドネシア国立銀行)'],
  ['MANDIRI', 'MANDIRI (マンディリ銀行)'],
  ['BJB', 'BJB (西ジャワ州立銀行)'],
  ['BANK JATIM', 'BANK JATIM (東ジャワ州立銀行)'],
  ['BTN', 'BTN (国民貯蓄銀行)'],
  ['CIMB NIAGA', 'CIMB NIAGA (チム・ニアガ銀行)'],
  ['PERMATA', 'PERMATA (プルマタ銀行)'],
  ['DANAMON', 'DANAMON (ダナモン銀行)'],
  ['MAYBANK', 'MAYBANK (メイバンク)'],
  ['PANIN', 'PANIN (パニン銀行)'],
  ['BSI (SYARIAH)', 'BSI (インドネシア・シャリア銀行)'],
  ['MUAMALAT', 'MUAMALAT (ムアマラット銀行)'],
  ['SEABANK', 'SEABANK (シーバンク)'],
  ['JAGO', 'JAGO (ジャゴ)'],
  ['BLU / BCA DIGITAL', 'BLU / BCA DIGITAL (ブルー)'],
];

/**
 * Family relationship (`KELUARGA_n_HUBUNGAN`).
 *
 * PARITY: legacy `master_full.js` builds this select inline with exactly seven
 * options, all UPPERCASE, and **no sentinel**:
 *   AYAH, IBU, SUAMI, ISTRI, ANAK, KAKAK, ADIK
 * The pre-C09 Astro form used TitleCase (`Ayah`, `Ibu`, …) — that was a real
 * parity bug: a family row saved from this form could never match the same
 * relationship saved from the legacy form, so the two UIs disagreed on the
 * same person. The seven legacy values are kept byte-identical and FIRST.
 *
 * The extra rows below are the same kind of "definite answer" expansion the
 * user asked for (kakek/nenek/paman/bibi/…). They are additive: they never
 * change what legacy data maps to, they only stop the candidate from having
 * to type "KAKEK" into a free-text box.
 */
export const HUBUNGAN_LEGACY: Opsi[] = [
  ['AYAH', 'AYAH (父)'],
  ['IBU', 'IBU (母)'],
  ['SUAMI', 'SUAMI (夫)'],
  ['ISTRI', 'ISTRI (妻)'],
  ['ANAK', 'ANAK (子)'],
  ['KAKAK', 'KAKAK (兄・姉)'],
  ['ADIK', 'ADIK (弟・妹)'],
];

export const HUBUNGAN_TAMBAHAN: Opsi[] = [
  ['KAKEK', 'KAKEK (祖父)'],
  ['NENEK', 'NENEK (祖母)'],
  ['PAMAN', 'PAMAN (叔父)'],
  ['BIBI', 'BIBI (叔母)'],
  ['SEPUPU', 'SEPUPU (いとこ)'],
  ['KEPONAKAN', 'KEPONAKAN (甥・姪)'],
  ['MERTUA', 'MERTUA (義理の親)'],
  ['MENANTU', 'MENANTU (婿・嫁)'],
  ['IPAR', 'IPAR (義理の兄弟)'],
  ['SAUDARA', 'SAUDARA (親族)'],
  ['TETANGGA', 'TETANGGA (隣人)'],
  ['KERABAT', 'KERABAT (親戚)'],
];

export const HUBUNGAN_KELUARGA: Opsi[] = [...HUBUNGAN_LEGACY, ...HUBUNGAN_TAMBAHAN];

/* ══════════════════════════════════════════════════════════════════════════
   4. Sentinel helpers — "Lainnya / ketik manual"
   ══════════════════════════════════════════════════════════════════════════ */

/** Sentinel value. Legacy used `__LAINNYA__`, never the plain word. */
export const SENTINEL_LAINNYA = '__LAINNYA__';

/**
 * Empty first option, matching legacy `'<option value="">Pilih / 選択</option>'`.
 *
 * Exported only so `opsi-form.test.ts` can assert `withOther`'s row order
 * (empty first, sentinel last) by identity rather than by re-spelling the
 * strings. No component reads it; treat it as internal.
 */
export const OPSI_KOSONG: Opsi = ['', 'Pilih / 選択'];

/** Sentinel option row — see `OPSI_KOSONG`; test-facing only. */
export const OPSI_LAINNYA: Opsi = [SENTINEL_LAINNYA, '✍️ Lainnya / その他 (ketik manual)'];

/**
 * Build the full `<select>` option list for one dropdown:
 * empty → data → sentinel.
 *
 * `extraValue` keeps a value that is not in the list visible instead of
 * silently dropping it on the next save. This is legacy `fillManualSelect`
 * (`master_full.ts:240-258`): a stored value outside the list is shown in the
 * manual box with the select parked on the sentinel.
 */
export function withOther(list: Opsi[], extraValue?: string): Opsi[] {
  const out: Opsi[] = [OPSI_KOSONG, ...list];
  if (extraValue && extraValue !== SENTINEL_LAINNYA && !list.some(([v]) => v === extraValue)) {
    out.splice(1, 0, [extraValue, extraValue]);
  }
  out.push(OPSI_LAINNYA);
  return out;
}

/**
 * Build a `<select>` option list WITHOUT the "Lainnya" sentinel:
 * empty → data.
 *
 * Use this for fields that are a genuine closed set AND have no manual text
 * box next to them. `withOther` is wrong there: it offers "✍️ Lainnya / ketik
 * manual" but there is nowhere to type, and unless the field is also run
 * through `resolveOther` the literal sentinel string gets persisted as the
 * answer — the exact bug the sentinel pattern exists to prevent.
 *
 * `HUBUNGAN_KELUARGA` is the live example: legacy renders that select with no
 * sentinel (`master_full.js`), the Astro form has no manual box for it, and the
 * payload passes `hubungan` through untouched.
 *
 * `extraValue` behaves as in `withOther`: an out-of-list stored value is kept
 * visible (as its own option) instead of being silently replaced on re-save.
 * That case is not hypothetical — a legacy row could hold a value this list
 * does not know, and dropping it would rewrite the candidate's data.
 */
export function withEmpty(list: Opsi[], extraValue?: string): Opsi[] {
  const out: Opsi[] = [OPSI_KOSONG, ...list];
  if (extraValue && extraValue !== SENTINEL_LAINNYA && !list.some(([v]) => v === extraValue)) {
    out.splice(1, 0, [extraValue, extraValue]);
  }
  return out;
}

/**
 * True when `value` is one of the list's canonical values.
 *
 * Used internally by `selectState`; exported so `opsi-form.test.ts` can pin the
 * exact-match rule (case-sensitive, no fuzzy matching) on its own.
 */
export function isKnown(list: Opsi[], value: string): boolean {
  return list.some(([v]) => v === value);
}

/**
 * Decide which `<select>` value to show for a stored string, and whether the
 * manual text box must appear — legacy `fillManualSelect` + `onPekerjaanSelect`
 * combined.
 *
 *   ''               → empty option, no manual box
 *   known value      → that value, no manual box
 *   unknown non-empty→ sentinel, manual box showing the original text
 */
export function selectState(list: Opsi[], stored: string): { select: string; manual: string } {
  const v = (stored || '').trim();
  if (!v) return { select: '', manual: '' };
  if (v === SENTINEL_LAINNYA) return { select: SENTINEL_LAINNYA, manual: '' };
  if (isKnown(list, v)) return { select: v, manual: '' };
  return { select: SENTINEL_LAINNYA, manual: v };
}

/**
 * What to actually SAVE for a select+manual pair — legacy `readManualSelect`
 * (`master_full.ts:260-264`). The sentinel itself is never persisted; when the
 * candidate chose "Lainnya", the manual text is what goes to the database.
 */
/**
 * What to actually SAVE for a select+manual pair — legacy `readManualSelect`
 * (`master_full.ts:260-264`). The sentinel itself is never persisted; when the
 * candidate chose "Lainnya", the manual text is what goes to the database.
 *
 * Covers all four states a pair can be in, which is why callers do NOT need a
 * separate "keep the old value" helper:
 *
 *   stored = ''            manual = ''      → ''            (nothing filled)
 *   stored = list value    manual = ''      → list value    (picked from list)
 *   stored = off-list text manual = ''      → off-list text (prefilled legacy
 *                                                           value the user has
 *                                                           not touched yet)
 *   stored = sentinel      manual = 'X'     → 'X'           (picked "Lainnya")
 *   stored = sentinel      manual = ''      → ''            (picked "Lainnya"
 *                                                           but typed nothing)
 *
 * The off-list row is the one worth remembering: `selectState` shows such a
 * value with the select parked on the sentinel, but the text stays in the main
 * field until the user types in the manual box. Since it is not the sentinel,
 * the first branch is skipped and the original string is returned — the value
 * survives a re-save the user never intended to change.
 */
export function resolveOther(select: string, manual: string): string {
  if (select === SENTINEL_LAINNYA) return (manual || '').trim();
  return select || '';
}

/* Assertion (module load, dev only): the flattened JURUSAN + PEKERJAAN lists
   must not contain duplicate values, or two <option>s in one select would share
   a value and the browser would silently pick one.

   THROWS rather than logging. The comment here used to promise "an immediate,
   obvious failure" while calling `console.error`, which is neither immediate
   (the run continues) nor obvious (it is one line in a console the developer
   may not be watching) — and it tripped the repo's own `noConsole` rule, so the
   gate was the only thing that noticed. A duplicate option value is a data bug
   that cannot be recovered from at runtime, so failing loudly at module load is
   both the correct severity and the honest description of the intent. `DEV`
   keeps it out of production, where a bad list should not take the page down. */
if (import.meta.env?.DEV) {
  for (const list of [
    ['JURUSAN', JURUSAN],
    ['PEKERJAAN', PEKERJAAN],
  ] as const) {
    const [name, values] = list;
    const seen = new Set<string>();
    for (const [v] of values) {
      if (seen.has(v)) {
        throw new Error(`[opsi-form] duplicate ${name} value: ${JSON.stringify(v)}`);
      }
      seen.add(v);
    }
  }
}
