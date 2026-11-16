/**
 * cv-jp-terms.ts — kamus istilah Indonesia → Jepang untuk form CV cetak.
 *
 * KENAPA DIPISAH
 * --------------
 * Database menyimpan banyak kolom dalam bahasa Indonesia (jurusan, jabatan,
 * pekerjaan keluarga, jenis pekerjaan). Form yang dicetak untuk klien Jepang
 * tidak boleh memuat kata "MANAJEMEN PERKANTORAN" atau "PETANI" — pemilik
 * harus mengetik ulang kanjinya sendiri setiap kali mengirim CV.
 *
 * Tabel ini lahir di `renderers/kinki.ts` (2026-11-12). Sejak form "Standar"
 * (FIRMA, template no. 2 di pemilih) juga mencetak kolom yang sama, daftarnya
 * dipindahkan ke sini supaya form itu tidak menyalin tabel yang sudah ada.
 *
 * ⚠️ `kinki.ts` MASIH memakai salinannya sendiri. Pemilik 2026-11-16 meminta
 * perbaikan dikerjakan per template (no. 2 dulu, no. 3-6 di sesi terpisah),
 * jadi `kinki.ts` sengaja TIDAK disentuh di sesi ini. Saat template no. 3
 * dirawat, hapus `JP_TERMS`/`jpTerm`/`sudahJp` di sana dan impor dari sini —
 * dua daftar yang hidup berdampingan akan menyimpang diam-diam, dan itu sudah
 * terjadi pada `kouritsu()`/`tingkatJp()` sebelum 2026-10-30.
 *
 * ATURAN
 * ------
 *   • Kolom `*_jp` dari database SELALU menang; tabel ini hanya jaring saat
 *     kolom itu kosong.
 *   • Teks yang sudah berisi kana/kanji TIDAK diterjemahkan lagi (`sudahJp`).
 *   • Kunci dicocokkan pada teks UPPERCASE tanpa tanda baca, persis dulu, lalu
 *     frasa TERPANJANG yang terkandung (mis. "PETERNAKAN AYAM" → 畜産業).
 *   • Istilah yang tidak dikenal dikembalikan APA ADANYA. Menerjemahkan teks
 *     bebas dengan kamus karangan lebih buruk daripada mencetak aslinya.
 */

/** Teks sudah berisi kana/kanji? Kalau ya, jangan diterjemahkan lagi. */
export function sudahJp(v: unknown): boolean {
  return /[\u3040-\u30ff\u4e00-\u9faf]/.test(String(v ?? ''));
}

/** `-` di database berarti "belum ada", bukan tanda minus yang dicetak. */
function bersih(v: unknown): string {
  const t = String(v ?? '').trim();
  return /^(tidak(\s+(ada|punya|pernah|memiliki))?|belum(\s+pernah)?|no|none|nihil|-|—|無|0)$/i.test(t)
    ? ''
    : t;
}

/**
 * Istilah Indonesia → Jepang untuk kolom yang dicetak apa adanya.
 * Kunci harus UPPERCASE dan tanpa tanda baca (lihat `jpTerm`).
 */
export const JP_TERMS: Record<string, string> = {
  // ── 家族構成: 職業 ──────────────────────────────────────────────────────
  PETANI: '農家', 'BURUH TANI': '農業労働者', PETERNAK: '畜産家', PETENAK: '畜産家', NELAYAN: '漁師',
  'IBU RUMAH TANGGA': '主婦', 'RUMAH TANGGA': '主婦', PELAJAR: '学生', MAHASISWA: '大学生',
  KARYAWAN: '会社員', 'KARYAWAN SWASTA': '会社員', 'KARYAWAN PABRIK': '工場勤務',
  WIRASWASTA: '自営業', PENGUSAHA: '実業家', PEDAGANG: '商人', PEMILIK: '経営者',
  GURU: '教師', DOSEN: '大学教授', SOPIR: '運転手', SUPIR: '運転手', SATPAM: '警備員',
  TUKANG: '職人', BURUH: '労働者', PNS: '公務員', TNI: '軍人', POLRI: '警察官',
  PENSIUNAN: '退職者', 'TIDAK BEKERJA': '無職', SERABUTAN: '日雇い', PERAWAT: '看護師',
  'KEPALA DESA': '村長', PEKEBUN: '農園主', 'PETERNAK AYAM': '養鶏業',
  WAITER: 'ウェイター', 'PELAYAN TOKO': '販売員', 'BURUH BANGUNAN': '建設作業員',
  // ── 職歴: 業種 ─────────────────────────────────────────────────────────
  PERTANIAN: '農業', PETERNAKAN: '畜産業', PERKEBUNAN: '農園', PERIKANAN: '漁業',
  KEHUTANAN: '林業', KONSTRUKSI: '建設業', BANGUNAN: '建設業', MANUFAKTUR: '製造業',
  PABRIK: '製造業', PERDAGANGAN: '商業', JASA: 'サービス業', KULINER: '飲食業',
  RESTORAN: '飲食業', 'RUMAH MAKAN': '飲食業', HOTEL: 'ホテル業', PARIWISATA: '観光業',
  TEKSTIL: '繊維業', GARMEN: '縫製業', OTOMOTIF: '自動車業', ELEKTRONIK: '電子業',
  PERTAMBANGAN: '鉱業', KESEHATAN: '医療', PENDIDIKAN: '教育', TRANSPORTASI: '運輸業',
  LOGISTIK: '物流業', KOPERASI: '協同組合', BANK: '銀行', ASURANSI: '保険',
  TEKNOLOGI: 'IT業', INFORMASI: '情報通信業', KONVEKSI: '縫製業',
  // ── 職歴: 職種 ─────────────────────────────────────────────────────────
  OPERATOR: 'オペレーター',
  'OPERATOR PRODUKSI': '製造オペレーター',
  'OPERATOR MESIN': '機械オペレーター',
  'KITCHEN HELPER': '調理補助',
  SEKRETARIS: '秘書',
  STAF: 'スタッフ', STAFF: 'スタッフ', ADMIN: '事務', ADMINISTRASI: '事務',
  'STAFF ADMINISTRASI': '事務', 'ADMINISTRASI PERKANTORAN': '事務',
  TEKNISI: '技術者', MEKANIK: '整備士', MONTIR: '整備士', LAS: '溶接工', WELDER: '溶接工', PENGELAS: '溶接工',
  GUDANG: '倉庫作業', 'JURU MASAK': '調理師', KOKI: '調理師', PELAYAN: '接客', KASIR: 'レジ係',
  MANDOR: '現場監督', KEPALA: '責任者', SALES: '営業', MARKETING: '営業',
  PENJAHIT: '縫製作業', PEMANEN: '収穫作業', PENYADAP: '搾乳作業', PETUGAS: '係員',
  'QUALITY CONTROL': '品質管理', PACKING: '梱包作業', 'BAGIAN PACKING': '梱包作業',
  DRIVER: '運転手', KURIR: '配達員',
  // ── 学歴: 専攻 ─────────────────────────────────────────────────────────
  MULTIMEDIA: 'マルチメディア', 'TEKNIK KOMPUTER': 'コンピューター技術',
  'TEKNIK KOMPUTER DAN JARINGAN': 'コンピューターネットワーク', TKJ: 'コンピューターネットワーク',
  RPL: 'ソフトウェア開発', 'REKAYASA PERANGKAT LUNAK': 'ソフトウェア開発',
  'TEKNIK OTOMOTIF': '自動車', 'TATA BOGA': '調理', PERHOTELAN: 'ホテル',
  'BAHASA JEPANG': '日本語', AKUNTANSI: '会計', IPA: '理科', IPS: '社会',
  'TEKNIK MESIN': '機械', MESIN: '機械', 'TEKNIK ELEKTRO': '電気', ELEKTRO: '電気',
  // Pemesinan = machining. Tanpa kunci ini "TEKNIK PEMESINAN" hanya cocok pada
  // kata "MESIN" dan tercetak 機械 — kurang satu tingkat dari 機械加工.
  'TEKNIK PEMESINAN': '機械加工', PEMESINAN: '機械加工', PERMESINAN: '機械加工',
  'TEKNIK PENGELASAN': '溶接', 'TEKNIK PEMBANGKIT': '発電',
  KEPERAWATAN: '看護', HUKUM: '法律', EKONOMI: '経済', MANAJEMEN: '経営',
  DESAIN: 'デザイン', SENI: '芸術', SIPIL: '土木', 'TEKNIK SIPIL': '土木',
  KIMIA: '化学', FISIKA: '物理', BIOLOGI: '生物', MATEMATIKA: '数学',
  SEJARAH: '歴史', GEOGRAFI: '地理', SOSIOLOGI: '社会学', PSIKOLOGI: '心理学',
  KOMUNIKASI: 'コミュニケーション', BISNIS: 'ビジネス',
  'MANAJEMEN PERKANTORAN BISNIS': '事務管理・ビジネス',
  'MANAJEMEN PERKANTORAN': '事務管理', OTKP: '事務管理',
  'OTOMATISASI TATA KELOLA PERKANTORAN': '事務管理',
  'BISNIS DARING DAN PEMASARAN': 'オンラインビジネス・販売', BDP: 'ビジネス',
  'TEKNIK KENDARAAN RINGAN': '自動車整備', 'KENDARAAN RINGAN': '自動車整備',
  'TEKNIK SEPEDA MOTOR': '自動車整備', 'TEKNIK ALAT BERAT': '重機整備',
  'AKUNTANSI DAN KEUANGAN LEMBAGA': '会計・金融', PERBANKAN: '銀行業務',
  'TATA KECANTIKAN': '美容', 'TATA BUSANA': '服飾', FARMASI: '薬学',
};

/**
 * Terjemahkan istilah Indonesia yang lazim; teks Jepang / nama diri dibiarkan.
 * Cocok persis dulu, lalu frasa terpanjang yang terkandung, sisanya teks asli.
 */
export function jpTerm(v: unknown): string {
  const t = bersih(v);
  if (!t || sudahJp(t)) return t;
  const key = t.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  if (JP_TERMS[key]) return JP_TERMS[key];
  let bestKey = '';
  for (const k of Object.keys(JP_TERMS)) {
    if (key.includes(k) && k.length > bestKey.length) bestKey = k;
  }
  return bestKey ? JP_TERMS[bestKey] : t;
}
