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
 * Pertanian & peternakan — dipisah per komoditas (permintaan pemilik
 * 2026-10-30: *"untuk yg ternak tolong di pisah petani/ternak bikin 1 1 job
 * spesifik yg lengkap"*).
 *
 * Kenapa dipisah dan bukan satu entri `PETANI / PERKEBUNAN`: satu nilai itu
 * mencampur empat bidang kerja yang berbeda ke dalam satu sel CV, sehingga
 *   - matchmaking tidak bisa menghitung berapa kandidat yang benar-benar
 *     pernah bekerja di kandang (畜産) versus di sawah (耕種),
 *   - sisi Jepang salah membaca pengalaman: 農業 di form SSW punya dua
 *     kategori uji yang terpisah — 耕種農業 dan 畜産農業 — dan seorang
 *     peternak sapi tidak boleh tercetak sebagai "petani".
 *
 * `PETANI / PERKEBUNAN` yang lama TIDAK dihapus (baris tersimpan memakainya);
 * ia hanya turun ke bawah daftar sebagai bentuk lama, dan `PEKERJAAN` tetap
 * memuat semua nilai lamanya tepat sekali.
 */
export const PEKERJAAN_PERTANIAN: Opsi[] = [
  // ── Tanaman (耕種) ──
  ['PETANI', 'PETANI (農家)'],
  ['PETANI PADI / SAWAH', 'PETANI PADI / SAWAH (稲作農家)'],
  ['PETANI SAYUR', 'PETANI SAYUR (野菜農家)'],
  ['PETANI BUAH', 'PETANI BUAH (果樹農家)'],
  ['PEKEBUN SAWIT', 'PEKEBUN SAWIT (オイルパーム農園)'],
  ['PEKEBUN KOPI / KAKAO', 'PEKEBUN KOPI / KAKAO (コーヒー・カカオ農園)'],
  ['PEKEBUN KARET', 'PEKEBUN KARET (ゴム農園)'],
  ['BURUH TANI', 'BURUH TANI (農業労働者)'],
  ['TUKANG KEBUN', 'TUKANG KEBUN (庭師)'],
  // ── Ternak (畜産) ──
  ['PETERNAK', 'PETERNAK (畜産農家)'],
  ['PETERNAK SAPI POTONG', 'PETERNAK SAPI POTONG (肉牛農家)'],
  ['PETERNAK SAPI PERAH', 'PETERNAK SAPI PERAH (乳牛農家)'],
  ['PETERNAK AYAM PEDAGING', 'PETERNAK AYAM PEDAGING / BROILER (養鶏・ブロイラー)'],
  ['PETERNAK AYAM PETELUR', 'PETERNAK AYAM PETELUR (採卵養鶏)'],
  ['PETERNAK KAMBING / DOMBA', 'PETERNAK KAMBING / DOMBA (山羊・羊農家)'],
  ['PETERNAK BABI', 'PETERNAK BABI (養豚農家)'],
  ['PETUGAS KANDANG / FEEDLOT', 'PETUGAS KANDANG / FEEDLOT (畜舎作業員)'],
  // ── Perairan ──
  ['BUDIDAYA IKAN', 'BUDIDAYA IKAN (養殖業)'],
  ['NELAYAN / ABK KAPAL', 'NELAYAN / ABK KAPAL (漁船員)'],
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
  // Entri per komoditas (petani/peternak) pindah ke `PEKERJAAN_PERTANIAN` di
  // atas 2026-10-30 — jangan diduplikasi di sini, `PEKERJAAN` akan menolaknya
  // (dua `<option>` dengan value sama) dan modul ini melempar saat load.
  ['PEKEBUN TEH', 'PEKEBUN TEH (茶農園)'],
  ['PENEBANG KAYU / LOGGING', 'PENEBANG KAYU / LOGGING (林業作業員)'],
  ['PEMBUDIDAYA JAMUR', 'PEMBUDIDAYA JAMUR (きのこ栽培)'],
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

/**
 * Urutan tampil daftar pekerjaan — BUKAN urutan penyimpanan.
 *
 * Pemilik 2026-10-30: *"dropdown pekerjaannya ga lengkap … karyawan swasta juga
 * gak ada"*. Nilainya sebenarnya ada (`PEKERJAAN_LEGACY` nomor 11), tapi ia
 * duduk di urutan ke-11 dari ~120 baris sehingga di layar ponsel terbaca
 * "tidak ada". Urutan lama juga menaruh `PETANI / PERKEBUNAN` di depan dan
 * `PETERNAK` jauh di bawah, padahal keduanya bidang yang paling sering dikirim
 * ASJ.
 *
 * Jadi 20 pekerjaan yang paling sering dipakai dinaikkan ke depan. Ini murni
 * tampilan: nilai yang DISIMPAN tidak berubah satu pun, dan setiap nilai lama
 * tetap ada tepat sekali di daftar (lihat `PEKERJAAN` di bawah).
 */
export const PEKERJAAN_UTAMA: string[] = [
  'OPERATOR PRODUKSI',
  'KARYAWAN SWASTA',
  'PETANI',
  'PETERNAK',
  'BURUH PABRIK',
  'OPERATOR MESIN',
  'ADMIN / STAFF ADMIN',
  'KASIR',
  'KOKI / CHEF',
  'PELAYAN / WAITER',
  'CLEANING SERVICE',
  'SATPAM / SECURITY',
  'SOPIR / DRIVER',
  'STAFF GUDANG',
  'PACKING / PENGEMASAN',
  'PERAWAT LANSIA / CAREGIVER',
  'TUKANG BANGUNAN',
  'WELDER / LAS',
  'MEKANIK',
  'TEKNISI',
];

/** Semua entri mentah, sebelum diurutkan untuk ditampilkan. */
const PEKERJAAN_POOL: Opsi[] = [
  ...PEKERJAAN_LEGACY,
  ...PEKERJAAN_PERTANIAN,
  ...PEKERJAAN_TAMBAHAN,
];

const PEKERJAAN_BY_VALUE = new Map<string, Opsi>(
  PEKERJAAN_POOL.map((row) => [row[0], row]),
);

/**
 * Full occupation list: the common ones first, then every legacy value (never
 * dropped — stored rows depend on them), then the rest.
 *
 * `uniqOpsi` is what makes the three blocks safe to overlap: `PETANI`,
 * `PETERNAK`, `BURUH TANI` and friends are listed in `PEKERJAAN_PERTANIAN` AND
 * named in `PEKERJAAN_UTAMA`, and a duplicated `<option value>` makes the
 * browser pick one of the two silently. `opsi-form.test.ts` pins that every
 * `PEKERJAAN_UTAMA` value really resolves, so a typo cannot quietly shorten
 * the front of the list.
 */
export const PEKERJAAN: Opsi[] = uniqOpsi([
  ...PEKERJAAN_UTAMA.map((v) => PEKERJAAN_BY_VALUE.get(v)).filter((r): r is Opsi => Boolean(r)),
  ...PEKERJAAN_POOL,
]);

function uniqOpsi(list: Opsi[]): Opsi[] {
  const seen = new Set<string>();
  const out: Opsi[] = [];
  for (const row of list) {
    if (seen.has(row[0])) continue;
    seen.add(row[0]);
    out.push(row);
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
   2. JURUSAN — school / university major
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * LPK / language-course majors.
 *
 * ASJ's own candidates come through an LPK, so the one major that actually
 * describes them — a Japanese-language course — had no entry at all. The owner
 * typed it by hand (2026-10-30: *"jurusan bahasa jepang tolong tambah"*) and
 * the free text landed as `bahasa JEPANG`, a different spelling in every row.
 * Same reason `JURUSAN` exists at all: one list, one spelling, so the printed
 * CV and the form cannot drift.
 */
export const JURUSAN_LPK: Opsi[] = [
  ['BAHASA JEPANG', 'BAHASA JEPANG (日本語コース)'],
  ['BAHASA JEPANG (PERSIAPAN KERJA / SSW)', 'BAHASA JEPANG — PERSIAPAN KERJA・特定技能 (日本語・SSW)'],
];

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
 * Every major, in the order a candidate would actually meet them: the LPK
 * Japanese course first (it is the shortest list and the one ASJ candidates
 * look for), then SMK, then SMA, then university. The education row labels each
 * entry with its level so the list stays readable when flattened into one
 * `<select>`.
 *
 * NOTE: values inside `JURUSAN_SMK`/`JURUSAN_SMA`/`JURUSAN_KULIAH` are already
 * unique across the three groups, so flattening cannot create a duplicate
 * `<option value>`. `JURUSAN` keeps that property — see the assertion below.
 */
export const JURUSAN: Opsi[] = [...JURUSAN_LPK, ...JURUSAN_SMK, ...JURUSAN_SMA, ...JURUSAN_KULIAH];

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
 * same person. The seven legacy values are kept byte-identical.
 *
 * ⚠ They are no longer FIRST in the dropdown. `HUBUNGAN_KELUARGA` (bottom of
 * this block) puts the gendered values ahead of the generic ones, because the
 * generic `KAKAK`/`ADIK`/`ANAK` are exactly what the owner asked to split —
 * leaving them at the top would keep them the easiest thing to pick. This
 * array stays the parity reference for the seven original values.
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

/**
 * Hubungan yang jenis kelaminnya MENGUBAH arti — dipisah atas permintaan
 * pemilik 2026-10-21: *"kakak laki laki dan perempuan di pisah kan karena
 * beda, begitu juga adik, anak laki/perempuan"*.
 *
 * Kenapa ini bukan sekadar kosmetik: `KAKAK (兄・姉)` mencampur dua kata Jepang
 * yang berbeda (兄 = kakak laki-laki, 姉 = kakak perempuan) ke dalam SATU nilai.
 * Rirekisho yang dicetak dari nilai itu tidak bisa memilih salah satunya, jadi
 * kolom 続柄 di CV kandidat selalu ambigu. Nilai baru di bawah memisahkannya
 * sehingga kanji yang tercetak sama dengan kenyataannya.
 *
 * Nilai lama (`ANAK`, `KAKAK`, `ADIK`, `KEPONAKAN`, `MENANTU`, `IPAR`) TIDAK
 * dihapus — baris yang sudah tersimpan memakainya, dan menghapusnya akan
 * membuat `<select>` tidak menemukan opsinya. Yang berubah hanya URUTAN: yang
 * spesifik tampil lebih dulu supaya pilihan default-nya benar, dan yang generik
 * turun ke bawah sebagai bentuk lama.
 */
export const HUBUNGAN_GENDER: Opsi[] = [
  ['ANAK LAKI-LAKI', 'ANAK LAKI-LAKI (息子)'],
  ['ANAK PEREMPUAN', 'ANAK PEREMPUAN (娘)'],
  ['KAKAK LAKI-LAKI', 'KAKAK LAKI-LAKI (兄)'],
  ['KAKAK PEREMPUAN', 'KAKAK PEREMPUAN (姉)'],
  ['ADIK LAKI-LAKI', 'ADIK LAKI-LAKI (弟)'],
  ['ADIK PEREMPUAN', 'ADIK PEREMPUAN (妹)'],
  ['KEPONAKAN LAKI-LAKI', 'KEPONAKAN LAKI-LAKI (甥)'],
  ['KEPONAKAN PEREMPUAN', 'KEPONAKAN PEREMPUAN (姪)'],
  ['MENANTU LAKI-LAKI', 'MENANTU LAKI-LAKI (婿)'],
  ['MENANTU PEREMPUAN', 'MENANTU PEREMPUAN (嫁)'],
  ['IPAR LAKI-LAKI', 'IPAR LAKI-LAKI (義理の兄弟)'],
  ['IPAR PEREMPUAN', 'IPAR PEREMPUAN (義理の姉妹)'],
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

/**
 * Daftar yang dipakai `<select>`: yang spesifik (berjenis kelamin) dulu, lalu
 * nilai generik lama, lalu sisanya.
 *
 * Setiap nilai legacy tetap ada TEPAT SEKALI — urutan ini hanya mengubah
 * tampilan, bukan kosakata yang disimpan. `HUBUNGAN_LEGACY` di atas tetap
 * menjadi daftar acuan tujuh nilai asli (dipakai tes paritas).
 */
export const HUBUNGAN_KELUARGA: Opsi[] = [
  ...HUBUNGAN_LEGACY.filter(([v]) => ['AYAH', 'IBU', 'SUAMI', 'ISTRI'].includes(v)),
  ...HUBUNGAN_GENDER,
  ...HUBUNGAN_LEGACY.filter(([v]) => ['ANAK', 'KAKAK', 'ADIK'].includes(v)),
  ...HUBUNGAN_TAMBAHAN,
];

/* ══════════════════════════════════════════════════════════════════════════
   3b. GOLONGAN DARAH — 血液型
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Blood type, ABO × Rh — the SINGLE list for both forms.
 *
 * Owner note: this list used to live in `aiCvPairs.ts` as `GOLDAR_PAIRS`, on the
 * grounds that it was an AI-CV-only enum. It is not any more: the CV Master form
 * needs the same options, and that file's own rule says a list shared with CV
 * Master belongs here. Two spellings of one enum is the drift this file exists
 * to prevent.
 *
 * MEASURED 2026-10-12 over the live DB (`master_database_candidate`, 234 rows):
 * the old list offered A/B/AB/O while the stored data already held Rh variants —
 *
 *   null 210 · "O" 10 · "B" 4 · "-" 4 · "A" 2 · "O+" 1 · "A+" 1 · "B+" 1
 *   · "AB +" 1   (ASJ00171 — note the SPACE)
 *
 * so `+`/`-` could not be chosen at all, and `"AB +"` matched no option, leaving
 * its `<select>` blank. Owner request: "tolong perbanyak kategorinya jgn a b ab o
 * tambahin + nya juga".
 *
 * The four PLAIN values stay deliberately: 16 real rows store them, and dropping
 * them would leave those rows holding a value the list does not know.
 *
 * Order is grouped by ABO so the four families read as blocks; the sentinel-like
 * `-` (unknown) stays last, where it has always been.
 */
export const GOLONGAN_DARAH: Opsi[] = [
  ['A', 'A (A型)'],
  ['A+', 'A+ (A型 Rh+)'],
  ['A-', 'A- (A型 Rh-)'],
  ['B', 'B (B型)'],
  ['B+', 'B+ (B型 Rh+)'],
  ['B-', 'B- (B型 Rh-)'],
  ['AB', 'AB (AB型)'],
  ['AB+', 'AB+ (AB型 Rh+)'],
  ['AB-', 'AB- (AB型 Rh-)'],
  ['O', 'O (O型)'],
  ['O+', 'O+ (O型 Rh+)'],
  ['O-', 'O- (O型 Rh-)'],
  ['-', '不明'],
];

/* ══════════════════════════════════════════════════════════════════════════
   3c. ENUM BERSAMA — daftar yang dipakai AI CV DAN CV Master
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * These seven lists moved here from `aiCvPairs.ts` on 2026-10-12.
 *
 * That file declares the enums that exist ONLY on the AI CV form; a list the CV
 * Master form also offers belongs here instead. These were on the wrong side of
 * that line, and `MasterFullForm.tsx` therefore carried its OWN inline copies —
 * and the two copies already disagreed:
 *
 *   agama — Master offered `['ISLAM','KRISTEN','HINDU','BUDHA','KATHOLIK']`
 *           while `AGAMA_PAIRS` held `BUDDHA`/`KATOLIK`, `KONGHUCU`,
 *           `LAINNYA`. Verified from source, not from data: the OLD
 *           `MasterFullForm.tsx` line 680 really did spell it `BUDHA`/
 *           `KATHOLIK`, and the OLD `aiCvPairs.ts` really did hold `BUDDHA`/
 *           `KATOLIK`.
 *
 * WHAT THE DATA ACTUALLY SHOWS (corrected 2026-10-12, second measurement)
 * ---------------------------------------------------------------------
 * An earlier draft of this comment claimed the drift had reached the table —
 * "`BUDHA` 3 rows, `KATHOLIK` 1". **That was wrong.** Re-measured against the
 * live DB (`gdwvffmevwtwnzrapjwy`, `master_database_candidate`), `agama` and
 * `religion` contain NO row spelled `BUDHA` or `KATHOLIK` — 0 rows for both:
 *
 *   agama     "ISLAM"×20 · "Islam"×3 · "ISLAM "×1
 *   religion  "ISLAM"×1
 *   agama_jp  "イスラム教"×9 · "イスラーム"×1 · "イスラム"×1
 *
 * So the drift was real in the CODE but had not yet been written by anyone. The
 * honest evidence that it was a KNOWN hazard is the workaround that already
 * existed for it: `AGAMA_JP` in
 * `cv-template-factory/renderers/rirekisho-xlsx.ts:112-122` carries BOTH
 * spellings — `BUDHA: '仏教', BUDDHA: '仏教'` — and `agamaLabel()` there does
 * `.toUpperCase().trim()`. Someone hit the misspelling and patched the renderer
 * instead of the form. Removing the second spelling is what makes that patch
 * unnecessary.
 *
 * The drift the DATA does show is case and whitespace (`"Islam"`, `"ISLAM "`),
 * which the same `.toUpperCase().trim()` silently absorbs — which is why nobody
 * ever saw it. `writeBodyFor()` now trims those on the way in.
 *
 * The `value` halves are unchanged, so no stored row is orphaned by the move.
 */

export const GENDER_PAIRS: Opsi[] = [
  ['LAKI-LAKI', '男性'],
  ['PEREMPUAN', '女性'],
];

export const AGAMA_PAIRS: Opsi[] = [
  ['ISLAM', 'イスラム教'],
  ['KRISTEN', 'キリスト教'],
  ['KATOLIK', 'カトリック'],
  ['HINDU', 'ヒンドゥー教'],
  ['BUDDHA', '仏教'],
  ['KONGHUCU', '儒教'],
  ['LAINNYA', 'その他'],
];

/**
 * Status pernikahan — EMPAT kategori.
 *
 * Pemilik 2026-10-12: "belum menikah, menikah, cerai, cerai meninggal?"
 * `CERAI MENINGGAL` (janda/duda) memang belum ada, dan itu kategori yang lazim
 * di rirekisho Jepang — di sana keempatnya dipisah tegas: 未婚 / 既婚 / 離婚 /
 * 死別. Tanpa kategori keempat, kandidat yang pasangannya meninggal hanya bisa
 * memilih `CERAI`, yang artinya berbeda.
 *
 * Nilai yang tersimpan di DB tetap yang lama (`BELUM MENIKAH`, `MENIKAH`,
 * `CERAI`) — hanya satu nilai BARU yang ditambahkan, jadi tidak ada baris lama
 * yang kehilangan opsinya. Ejaan lain yang terukur di DB (`SINGLE`,
 * `BELUM KAWIN`, `SUDAH MENIKAH`) ditangani `statusNikahDisplay()` saat
 * DITAMPILKAN; mengubahnya di data butuh migrasi yang belum dijalankan.
 */
export const STATUS_NIKAH_PAIRS: Opsi[] = [
  ['BELUM MENIKAH', '未婚'],
  ['MENIKAH', '既婚'],
  ['CERAI', '離婚'],
  ['CERAI MENINGGAL', '死別'],
];

export const TANGAN_PAIRS: Opsi[] = [
  ['KANAN', '右'],
  ['KIRI', '左'],
];

/** Legacy `ya_tidak`: the yes/no answer the employer reads as 有り/無し. */
export const YA_TIDAK_PAIRS: Opsi[] = [
  ['TIDAK', '無し'],
  ['YA', '有り'],
];

/** Legacy `RIWAYAT_JEPANG_PAIRS`. */
export const RIWAYAT_JEPANG_PAIRS: Opsi[] = [
  ['BELUM PERNAH', '未経験'],
  ['EKS MAGANG', '技能実習生'],
  ['EKS TOKUTEI GINO', '特定技能'],
];

/**
 * 雇用形態 — status kerja satu baris riwayat pekerjaan (migrasi 022).
 *
 * Dipakai DUA form (Master & CV AI) dan DUA renderer (KINKI `A26/A28/A30`,
 * Firma `O16/O18/O20`), jadi kosakatanya tinggal di sini — bukan diulang di
 * masing-masing `<select>`. Nilai yang DISIMPAN adalah versi Indonesia;
 * renderer yang menerjemahkannya ke 正社員/非正社員/… (`jenisKerjaJp`).
 */
export const JENIS_KERJA_PAIRS: Opsi[] = [
  ['KARYAWAN TETAP', 'Karyawan tetap (正社員)'],
  ['KARYAWAN KONTRAK', 'Kontrak / honorer (契約社員)'],
  ['KARYAWAN HARIAN', 'Harian / lepas (日雇い)'],
  ['PART TIME', 'Part time (アルバイト・パート)'],
  ['MAGANG', 'Magang / intern (インターン)'],
  ['MAGANG JEPANG', 'Magang Jepang / eks peserta (技能実習生)'],
  ['USAHA KELUARGA', 'Usaha keluarga (家業)'],
  ['WIRAUSAHA', 'Wirausaha / pemilik usaha (自営業)'],
  ['FREELANCE', 'Freelance (フリーランス)'],
  ['PNS / ASN', 'PNS / ASN (公務員)'],
  ['TNI / POLRI', 'TNI / Polri (自衛隊・警察)'],
  ['PENSIUNAN', 'Pensiunan (退職者)'],
  ['BELUM BEKERJA', 'Belum pernah bekerja (無職)'],
];

/**
 * 同居区分 — apakah anggota keluarga tinggal serumah (migrasi 022).
 * Dicetak Firma `N24:N30` (居住) dan JIPA `E33:E40` (同居区分).
 */
export const TINGGAL_PAIRS: Opsi[] = [
  ['SERUMAH', 'Serumah (同居)'],
  ['TERPISAH', 'Terpisah (別居)'],
  ['MANDIRI', 'Mandiri (独立)'],
];

/* ══════════════════════════════════════════════════════════════════════════
   3d. BIDANG SSW (特定技能) — SATU daftar untuk DUA form
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * 16 bidang resmi + tiga bidang yang dibuka 2024–2025, dipakai `<select>` CV
 * Master DAN datalist CV AI.
 *
 * Kenapa pindah ke sini: daftar ini dulu HIDUP DUA KALI — `SSW_OPTIONS` di
 * `MasterFullForm.tsx` (dengan label kanji) dan `SSW_OPTIONS` di
 * `AiCvForm.tsx` (string polos). Dua salinan yang sama sudah tidak sama:
 * yang di CV AI ketinggalan tanpa label kanji, dan menambah satu bidang berarti
 * dua suntingan.
 *
 * `LIVESTOCK` (畜産) ditambahkan 2026-10-30 atas permintaan pemilik — *"ssw
 * ternak juga gak ada"*. Di skema resmi 農業 memang satu bidang dengan dua
 * kategori kerja (耕種農業 / 畜産農業) dan dua uji terpisah, jadi kandidat
 * peternak tidak boleh hanya bisa memilih "AGRICULTURE".
 *
 * Nilai (kolom 1) adalah yang DISIMPAN ke `master_database_candidate.bidangssw`;
 * 16 nilai lama byte-identik dengan legacy, jadi baris lama tetap cocok.
 */
export const SSW_BIDANG: Opsi[] = [
  ['KAIGO', 'KAIGO (介護)'],
  ['BUILDING CLEANING', 'BUILDING CLEANING (ビルクリーニング)'],
  ['FOUNDRY & PLASTIC', 'FOUNDRY & PLASTIC (素形材産業)'],
  ['INDUSTRIAL MACHINERY', 'INDUSTRIAL MACHINERY (産業機械製造業)'],
  ['ELECTRIC & ELECTRONIC', 'ELECTRIC & ELECTRONIC (電気・電子情報)'],
  ['CONSTRUCTION', 'CONSTRUCTION (建設)'],
  ['SHIPBUILDING', 'SHIPBUILDING (造船・舶用工業)'],
  ['AUTOMOBILE REPAIR', 'AUTOMOBILE REPAIR (自動車整備)'],
  ['AVIATION', 'AVIATION (航空)'],
  ['ACCOMMODATION', 'ACCOMMODATION (宿泊)'],
  ['AGRICULTURE', 'AGRICULTURE (農業・耕種 / pertanian)'],
  ['LIVESTOCK', 'LIVESTOCK (農業・畜産 / peternakan)'],
  ['FISHERY', 'FISHERY (漁業)'],
  ['FOOD & BEVERAGE', 'FOOD & BEVERAGE (飲食料品製造業)'],
  ['RESTAURANT', 'RESTAURANT (外食業)'],
  ['FORESTRY', 'FORESTRY (林業)'],
  ['WOOD INDUSTRY', 'WOOD INDUSTRY (木材産業)'],
  ['AUTOMOBILE TRANSPORT', 'AUTOMOBILE TRANSPORT (自動車運送業)'],
  ['RAILWAY', 'RAILWAY (鉄道)'],
  ['RESOURCE CIRCULATION', 'RESOURCE CIRCULATION (資源循環)'],
];

/* ══════════════════════════════════════════════════════════════════════════
   3e. UJIAN & SERTIFIKAT JEPANG — ujian yang bisa diambil dari Indonesia
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Ujian bahasa & keterampilan yang punya pusat uji di Indonesia (Jakarta,
 * Surabaya, Medan, Makassar, …) — permintaan pemilik 2026-10-30: *"masukkan
 * dropdown semua prometric ujian yg bisa di indo id-jp nya beserta kasih tgl
 * lulus nya"*.
 *
 * Catatan yang menentukan isi daftar ini: **JFT-Basic dan seluruh 技能測定試験
 * (SSW) diselenggarakan CBT lewat Prometric** di Indonesia, sedangkan JLPT
 * tetap ujian kertas. Karena itu keduanya digabung dalam satu daftar "ujian
 * yang bisa diambil di Indonesia" — yang membedakan hanya penyelenggaranya,
 * dan itu urusan pendaftaran, bukan urusan CV.
 *
 * NILAI (kolom 1) adalah kode stabil yang disimpan; labelnya yang dibaca
 * kandidat dan yang tercetak di CV (lewat `pairDisplay`).
 */
export const UJIAN_BAHASA: Opsi[] = [
  // Nilai = kode yang DISIMPAN dan yang tercetak (`pairDisplay` menyusun
  // `nilai（kanji）`), jadi bagian yang informatif — "A2", "N4" — ada di nilai,
  // bukan di label. Labelnya kanji murni supaya tidak tercetak dua kali.
  ['JFT-BASIC A2', '国際交流基金日本語基礎テスト'],
  ['JLPT N1', '日本語能力試験 N1'],
  ['JLPT N2', '日本語能力試験 N2'],
  ['JLPT N3', '日本語能力試験 N3'],
  ['JLPT N4', '日本語能力試験 N4'],
  ['JLPT N5', '日本語能力試験 N5'],
  ['BJT', 'ビジネス日本語能力テスト'],
  ['JICWELS KAIGO', '介護日本語評価試験'],
  ['EPA KAIGO', 'EPA 介護福祉士候補者'],
  ['EPA KANGO', 'EPA 看護師候補者'],
  ['SKILL TEST 3KYU', '技能検定3級（技能実習修了試験）'],
];

/**
 * Ujian keterampilan SSW, diturunkan dari `SSW_BIDANG` — bukan diketik ulang.
 *
 * Kalau daftar ini disalin manual, menambah satu bidang di atas akan
 * meninggalkan ujiannya di sini, dan kandidat yang lulus uji bidang itu tidak
 * bisa memilihnya. Kode nilai diberi awalan `SSW ` supaya tidak bertabrakan
 * dengan `KAIGO` di `SSW_BIDANG` saat keduanya muncul di satu payload.
 */
export const UJIAN_SSW: Opsi[] = SSW_BIDANG.map(([v, l]) => [
  `SSW ${v}`,
  `SSW 技能測定試験 — ${l}`,
]);

/** Semua ujian dalam satu daftar: bahasa dulu, lalu keterampilan SSW. */
export const UJIAN_JP: Opsi[] = [...UJIAN_BAHASA, ...UJIAN_SSW];

/**
 * Level bahasa Jepang yang sah — nilai kolom `master_database_candidate.bahasa`.
 *
 * Sama kelasnya dengan daftar di atas: satu kosakata yang muncul di DUA tempat
 * dengan dua salinan. `AiCvForm.tsx` menyimpannya sebagai `JFT_OPTIONS` (dipakai
 * `<datalist>`, jadi sekadar saran untuk kolom teks bebas) dan
 * `MasterFullForm.tsx` menyimpannya sebagai literal di dalam `<select>` — dengan
 * satu entri tambahan, `'-'`, yang memang nilai DEFAULT form Master
 * (`MasterFullForm.tsx`, state awal `bhsJepang:'-'`) untuk "belum diisi".
 *
 * Karena itu `'-'` TIDAK dimasukkan ke daftar ini: ia penanda keadaan form
 * Master, bukan level. Form Master menambahkannya sendiri di depan daftar
 * (lihat `MasterFullForm.tsx`), sehingga kosakata levelnya tetap satu.
 *
 * Tanpa gloss kanji: entri ini sudah notasi Jepang (`N1`, `JFT BASIC A2`), dan
 * `labelJp`/`pairDisplay` tidak berlaku untuknya — maka bentuknya `string[]`,
 * bukan `Opsi[]`.
 */
export const BAHASA_JEPANG: string[] = [
  'N1', 'N2', 'N3', 'N4', 'N5', 'JFT BASIC A2', 'BELUM LULUS', 'BELUM TES',
];

/* ══════════════════════════════════════════════════════════════════════════
   3b. Kosakata field CV tambahan (migrasi 022, 2026-10-27)

   Semuanya dipakai DUA form (Master & CV AI) dan dicetak salah satu template
   CV. Nilai yang disimpan sengaja dipilih yang PERSIS tercetak di form Jepang
   (`技能実習2号`, `N4レベル`, `学習中`) — renderer menulisnya apa adanya, jadi
   menerjemahkan di renderer berarti dua kosakata untuk satu field.
   ══════════════════════════════════════════════════════════════════════════ */

/** ビザ種類 — JIPA `E54`. Label memberi terjemahan, nilai tetap istilah form. */
export const VISA_JEPANG: Opsi[] = [
  ['技能実習1号', '技能実習1号 (magang tahun 1)'],
  ['技能実習2号', '技能実習2号 (magang tahun 2–3)'],
  ['技能実習3号', '技能実習3号 (magang lanjutan)'],
  ['特定技能1号', '特定技能1号 (SSW)'],
  ['特定技能2号', '特定技能2号 (SSW lanjutan)'],
  ['留学', '留学 (pelajar)'],
  ['短期滞在', '短期滞在 (wisata/kunjungan)'],
  ['なし', 'なし (belum pernah)'],
];

/** 在留資格 — status tinggal kenalan di Jepang, JIPA `J43`. */
export const STATUS_TINGGAL_JP: Opsi[] = [
  ['技能実習1号', '技能実習1号'],
  ['技能実習2号', '技能実習2号'],
  ['技能実習3号', '技能実習3号'],
  ['特定技能1号', '特定技能1号'],
  ['特定技能2号', '特定技能2号'],
  ['留学', '留学'],
  ['家族滞在', '家族滞在'],
  ['定住者', '定住者'],
  ['永住者', '永住者'],
  ['日本人の配偶者等', '日本人の配偶者等'],
];

/**
 * 日本語力 — dropdown KINKI `I3`. Daftarnya HARUS sama dengan opsi di template;
 * nilai lain membuat selnya tidak sah.
 */
export const LEVEL_BAHASA_JEPANG: Opsi[] = [
  ['N5未習熟', 'N5未習熟 (belum menguasai N5)'],
  ['N5レベル', 'N5レベル (level N5)'],
  ['N5合格', 'N5合格 (lulus N5)'],
  ['N4レベル', 'N4レベル (level N4)'],
  ['N4合格', 'N4合格 (lulus N4)'],
  ['N3合格', 'N3合格 (lulus N3)'],
  ['N2合格', 'N2合格 (lulus N2)'],
];

/** 学習状況 — KINKI `T39`. */
export const STATUS_BELAJAR_JP: Opsi[] = [
  ['未学習', '未学習 (belum belajar)'],
  ['独学', '独学 (belajar sendiri)'],
  ['学習中', '学習中 (sedang belajar)'],
  ['修了', '修了 (selesai kursus)'],
];

/** 学習期間 — Firma `L31` / KINKI `T37`. Nilai berupa teks bebas yang ringkas. */
export const LAMA_BELAJAR_JP: Opsi[] = [
  ['3 bulan', '3 bulan'],
  ['6 bulan', '6 bulan'],
  ['1 tahun', '1 tahun'],
  ['1.5 tahun', '1,5 tahun'],
  ['2 tahun', '2 tahun'],
  ['3 tahun', '3 tahun'],
];

/** 英語レベル — KINKI `Q41`. */
export const LEVEL_INGGRIS: Opsi[] = [
  ['PEMULA', 'Pemula (dasar)'],
  ['MENENGAH', 'Menengah (bisa percakapan)'],
  ['MAHIR', 'Mahir (aktif kerja)'],
];

/** スポーツ — KINKI `E16`. Nilai = istilah Jepang yang dicetak. */
export const OLAHRAGA: Opsi[] = [
  ['ジョギング', 'Jogging (ジョギング)'],
  ['ハイキング', 'Hiking (ハイキング)'],
  ['フットサル', 'Futsal (フットサル)'],
  ['バドミントン', 'Badminton (バドミントン)'],
  ['バレーボール', 'Voli (バレーボール)'],
  ['バスケットボール', 'Basket (バスケットボール)'],
  ['サッカー', 'Sepak bola (サッカー)'],
  ['水泳', 'Renang (水泳)'],
  ['サイクリング', 'Bersepeda (サイクリング)'],
];

/** 性格診断 — 16 tipe, urutan sama dengan tabel `AF111:AF126` form KINKI. */
export const MBTI_TIPE: Opsi[] = [
  ['ISTJ', 'ISTJ 管理者型'], ['ISFJ', 'ISFJ 擁護者型'], ['INFJ', 'INFJ 提唱者型'], ['INTJ', 'INTJ 建築家型'],
  ['ISTP', 'ISTP 巨匠型'], ['ISFP', 'ISFP 冒険家型'], ['INFP', 'INFP 仲介者型'], ['INTP', 'INTP 論理学者型'],
  ['ESTP', 'ESTP 起業家型'], ['ESFP', 'ESFP エンターテイナー型'], ['ENFP', 'ENFP 広報運動家型'], ['ENTP', 'ENTP 討論者型'],
  ['ESTJ', 'ESTJ 幹部型'], ['ESFJ', 'ESFJ 領事官型'], ['ENFJ', 'ENFJ 主人公型'], ['ENTJ', 'ENTJ 指揮官型'],
];

/** …月取得予定 — KINKI `M4`. Nilainya ANGKA bulan (1–12) karena renderer
    menambahkan sendiri `月取得予定`. */
export const BULAN_SIM: Opsi[] = [
  ['1', '1月 (Januari)'], ['2', '2月 (Februari)'], ['3', '3月 (Maret)'],
  ['4', '4月 (April)'], ['5', '5月 (Mei)'], ['6', '6月 (Juni)'],
  ['7', '7月 (Juli)'], ['8', '8月 (Agustus)'], ['9', '9月 (September)'],
  ['10', '10月 (Oktober)'], ['11', '11月 (November)'], ['12', '12月 (Desember)'],
];

/* 地域 (KINKI `J19`) memakai `PROVINSI` yang sudah ada di atas — jangan bikin
   daftar kedua: dua daftar provinsi akan berbeda begitu ada pemekaran. */

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
 * The Japanese half of a label, for lists whose second element is bilingual.
 *
 * `PEKERJAAN` and friends put the kanji INSIDE the label —
 * `['OPERATOR PRODUKSI', 'OPERATOR PRODUKSI (工場作業員)']` — because the `value`
 * is deliberately the stable ASCII string that gets saved, and the candidate
 * needs to see both languages side by side. That is right for a dropdown.
 *
 * It is wrong for a CV column. Reading element 2 straight into `jabatan_jp`
 * writes `"OPERATOR PRODUKSI (工場作業員)"` into the kanji field, so the
 * employer's copy of the CV shows the Indonesian term where the Japanese should
 * be — the two halves of the CV disagreeing, which is the exact failure
 * `aiCvPairs.ts` exists to prevent. `GENDER_PAIRS` is unaffected by this
 * because its labels are already pure kanji (`'男性'`), so the two conventions
 * coexist in the codebase and any consumer that stores element 2 must handle
 * both.
 *
 * This returns the parenthesised kanji when there is one, and otherwise the
 * label unchanged — so it is a no-op for the already-pure lists rather than a
 * special case the caller has to know about.
 *
 *   'OPERATOR PRODUKSI (工場作業員)' → '工場作業員'
 *   '男性'                            → '男性'
 *   'KASIR (レジ係)'                  → 'レジ係'
 *   ''                                → ''
 */
export function labelJp(label: string): string {
  const s = String(label ?? '').trim();
  if (!s) return '';
  // Both bracket widths, because the list mixes them: most entries use full-width
  // （）, the ASCII ones exist where an entry was glossed by hand.
  const m = s.match(/[（(]([^）)]+)[）)]\s*$/);
  // `m?.[1]` rather than `m && m[1]` — the optional chain says the same thing
  // and is what the linter asks for, so this file stays free of new diagnostics.
  const inner = m?.[1]?.trim();
  if (inner) return inner;
  return s;
}

/**
 * The text a dropdown should show for one row — `ID（kanji）`, with no repetition.
 *
 * Two conventions meet here and this is the one function that reconciles them:
 *
 *   GENDER_PAIRS    `['LAKI-LAKI', '男性']`                  → `LAKI-LAKI（男性）`
 *   PEKERJAAN       `['KASIR', 'KASIR (レジ係)']`            → `KASIR（レジ係）`
 *   a non-matching  `['KASIR', 'レジ係']`                    → `KASIR（レジ係）`
 *
 * The naive `{value}（{label}）` is right only for the first shape. Against
 * PEKERJAAN it prints `KASIR（KASIR (レジ係)）` — the Indonesian term twice, with
 * the outer full-width brackets and the inner ASCII ones sitting next to each
 * other. That is what the AI CV family-occupation dropdown showed before this.
 */
export function pairDisplay(value: string, label: string): string {
  const v = String(value ?? '').trim();
  const jp = labelJp(label);
  if (!v) return jp;
  if (!jp) return v;
  return `${v}（${jp}）`;
}

/**
 * A stored blood type as the rirekisho cell prints it: `O 型`, `O 型 Rh+`.
 *
 * The CV cell used to be `gd + " 型"` (`RirekishoBuilder.tsx`), which is right
 * only for the four plain values. It broke twice the moment the option list
 * gained Rh variants:
 *
 *   `O+`  → `O+ 型`  — reads as the blood type "O+", with 型 stuck on the end;
 *   `''`  → `' 型'`  — a stray suffix in the cell when no type is recorded
 *                      (the old code blanked `'-'` and then appended anyway).
 *
 * `AB +` (the real ASJ00171 row, with a space) also normalises here, so a dirty
 * stored value still prints as a valid type rather than as its own oddity.
 *
 * Anything that is not an ABO(+Rh) token is returned UNCHANGED — this must never
 * invent a type for a value it does not understand.
 */
const GOLONGAN_DARAH_RE = /^(AB|A|B|O)\s*(?:型)?\s*(?:Rh)?\s*([+-])?$/i;

export function golonganDarahDisplay(v: unknown): string {
  const s = String(v ?? '').trim();
  if (!s || s === '-') return '';
  const m = GOLONGAN_DARAH_RE.exec(s);
  if (!m) return s;
  return `${m[1].toUpperCase()} 型${m[2] ? ` Rh${m[2]}` : ''}`;
}

/**
 * A stored marital status as the rirekisho cell prints it: `MENIKAH （既婚）`.
 *
 * This replaces a two-branch ternary in `RirekishoBuilder.tsx` that FABRICATED
 * an answer. It was:
 *
 *   (nik.includes('MENIKAH') && !nik.includes('BELUM')) ? 'MENIKAH （已婚）'
 *     : nik === '-' ? '' : 'BELUM MENIKAH （未婚）'
 *
 * so EVERY value that was not a plain "MENIKAH" fell through to
 * `BELUM MENIKAH （未婚）` — including `CERAI`, `CERAI MENINGGAL`, and an EMPTY
 * one. A divorced or widowed candidate's CV therefore stated they had never
 * married, and a candidate who had not answered was given an answer on their
 * behalf. Measured 2026-10-12: the live DB holds `CERAI`-family values, so this
 * was reachable, not theoretical.
 *
 * It also printed `已婚`, which is not the word a Japanese rirekisho uses —
 * the same pair list and the xlsx renderer both use `既婚`.
 *
 * An unknown value is returned UNCHANGED: this must never invent a status.
 * `'SINGLE'`/`'KAWIN'` are matched because the live DB really holds them.
 */
const STATUS_NIKAH_JP: Array<[RegExp, string]> = [
  // Widowed FIRST: `CERAI MENINGGAL` must not be read as a plain divorce.
  [/MENINGGAL|WIDOW|死別/, 'CERAI MENINGGAL （死別）'],
  [/CERAI|DIVORCE|離婚/, 'CERAI （離婚）'],
  [/BELUM|SINGLE/, 'BELUM MENIKAH （未婚）'],
  [/MENIKAH|KAWIN|既婚/, 'MENIKAH （既婚）'],
];

export function statusNikahDisplay(v: unknown): string {
  const s = String(v ?? '').trim();
  if (!s || s === '-') return '';
  const t = s.toUpperCase();
  const hit = STATUS_NIKAH_JP.find(([re]) => re.test(t));
  return hit ? hit[1] : s;
}

/**
 * The ID halves of a pair list — the option VALUES, without the kanji labels.
 *
 * Why this exists: a list shared between the AI CV form and the CV Master form
 * is one list, but the two forms do not want the same LABEL. The AI CV form is
 * read by the candidate and its dropdown shows `LAKI-LAKI（男性）`
 * (`pairDisplay`); the Master form is filled by ASJ staff and shows the plain
 * Indonesian term. Passing `GENDER_PAIRS` straight into the Master form's
 * `<F opts>` would print `男性` as the option text there — a dropdown the staff
 * cannot read — so the Master form takes the values and keeps its own labels.
 *
 * What MUST be shared is the value set: that is what gets written to the
 * database. `MasterFullForm.tsx` used to carry inline copies and the two had
 * drifted — it offered `BUDHA`/`KATHOLIK` where this file has `BUDDHA`/
 * `KATOLIK`, so the same religion could be stored two ways depending on which
 * form was used.
 *
 * CORRECTION (2026-10-12, second measurement): an earlier draft of this comment
 * asserted that the drift HAD reached the table ("`BUDHA` 3 rows, `KATHOLIK` 1").
 * That was not measured and is false — re-measured on the live DB,
 * `master_database_candidate.agama` and `.religion` hold 0 rows spelled either
 * way. The drift was real in the SOURCE (both spellings are still visible in
 * `git show 2dbcb44^`), and the hazard was real enough that
 * `rirekisho-xlsx.ts:112-122` already carried both spellings as a workaround —
 * but no row was ever written with the wrong one. Do not restore the row counts.
 *
 * Projecting from the one list is what makes the drift impossible to
 * reintroduce, whatever the current row count happens to be.
 */
export function valuesOf(list: Opsi[]): string[] {
  return list.map(([v]) => v);
}

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
