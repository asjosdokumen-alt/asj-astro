/**
 * _lib/kotoba/ssw.ts — bank kosakata kerja untuk 16 bidang 特定技能 (SSW),
 * dipakai `/kotoba` sebagai modul latihan per bidang.
 *
 * KENAPA TERPISAH DARI `bank.ts`
 * -----------------------------
 * Dua dataset dengan umur dan aturan berbeda. `bank.ts` adalah kosakata BUKU
 * (Minna no Nihongo, bab 1–50) yang penempatan babnya terikat silabus; berkas
 * ini adalah kosakata LAPANGAN yang terikat bidang kerja. Menyatukannya berarti
 * setiap kali satu bidang ditambah, sebaran bab di `bank.ts` ikut berubah —
 * dan sebaliknya. Pemisahan ini juga yang membuat endpointnya bisa berdiri
 * sendiri: siswa yang baru membuka satu bidang tidak perlu mengunduh 1 449 kata
 * buku, dan sebaliknya.
 *
 * ASAL DATA — dan batasnya
 * ------------------------
 * Daftar bidangnya mengikuti 16 bidang yang dibuka Jepang untuk 特定技能
 * (出入国在留管理庁): 介護, ビルクリーニング, 素形材・産業機械・電気電子情報
 * 関連製造業, 建設, 造船・舶用工業, 自動車整備, 航空, 宿泊, 農業, 漁業,
 * 飲食料品製造業, 外食業, 自動車運送業, 鉄道, 林業, 木材産業.
 *
 * Kosakatanya disusun dari istilah yang benar-benar dipakai di lapangan
 * (peralatan, prosedur, keselamatan) — BUKAN salinan buku teks resmi atau
 * daftar kata ujian 技能測定試験, karena tidak ada dokumen itu di tangan.
 * Artinya: kata di sini membantu siswa MENGENALI alat dan instruksi kerja,
 * bukan jaminan cakupan ujian. Kalau nanti daftar resmi per bidang didapat,
 * berkas inilah yang perlu disesuaikan lebih dulu.
 *
 * CARA MEMERIKSA
 * --------------
 * Sama seperti `bank.ts`: kolom `h` (kana) diubah ke romaji oleh konverter di
 * `e2e/kotoba-bank.test.ts` lalu dibandingkan dengan kolom `r`. Tes itu juga
 * menolak kunci `k|h` ganda DI DALAM satu bidang — kunci itulah yang dipakai
 * menyimpan progres hafalan siswa, jadi satu duplikat berarti dua kata berbagi
 * satu riwayat.
 *
 * BENTUK
 * ------
 * Tuple, alasannya sama dengan `bank.ts`: nama kunci berulang tidak ikut
 * di-bundle. Urutannya dikunci `KolomSsw` — jangan diubah tanpa `keKata()`.
 *
 * `b: 0` pada hasil konversi BUKAN bab buku. Ia ada supaya bentuk katanya sama
 * persis dengan `Kotoba` di `bank.ts`, sehingga `KotobaGame` bisa memakai satu
 * mesin kuis untuk dua sumber. Nilai 0 juga membuat pengelompokan pengecoh
 * "bab sama" otomatis berarti "bidang yang sama".
 */

/** Jenis kata — nilainya sama dengan `JenisKata` di `bank.ts`. */
export type JenisKataSsw = 'verb' | 'adj' | 'noun' | 'other';

/** Satu kata bidang dalam bentuk yang dikirim ke klien. */
export interface KotobaSsw {
  /** Selalu 0: penanda "bukan bab buku". Lihat catatan di atas. */
  b: 0;
  pos: JenisKataSsw;
  /** Tulisan kanji/katakana seperti tertulis di lapangan. */
  k: string;
  /** Cara baca hiragana. */
  h: string;
  /** Romaji — dipakai mode ketik dan pencarian. */
  r: string;
  /** Arti Bahasa Indonesia. */
  id: string;
}

/** Satu bidang kerja. */
export interface BidangSsw {
  /** Id stabil: dipakai sebagai kunci progres di localStorage. Jangan diganti. */
  id: string;
  /** Nama Indonesia. */
  nama: string;
  /** Nama resmi Jepang. */
  namaJp: string;
  /** Satu kalimat: apa yang dikerjakan di lapangan. */
  ringkas: string;
  kata: readonly KotobaSsw[];
}

/** Urutan kolom tuple: [jenis, kanji, hiragana, romaji, arti]. */
type KolomSsw = readonly [JenisKataSsw, string, string, string, string];

function keKata(t: KolomSsw): KotobaSsw {
  return { b: 0, pos: t[0], k: t[1], h: t[2], r: t[3], id: t[4] };
}

const KAIGO = [
  ['noun', '利用者', 'りようしゃ', 'riyousha', 'Pengguna layanan (klien)'],
  ['noun', '入居者', 'にゅうきょしゃ', 'nyuukyosha', 'Penghuni panti'],
  ['noun', '車椅子', 'くるまいす', 'kurumaisu', 'Kursi roda'],
  ['noun', '介助', 'かいじょ', 'kaijo', 'Bantuan perawatan'],
  ['noun', '移乗', 'いじょう', 'ijou', 'Pemindahan tubuh (kursi ↔ kasur)'],
  ['noun', 'おむつ', 'おむつ', 'omutsu', 'Popok'],
  ['noun', '着替え', 'きがえ', 'kigae', 'Ganti pakaian'],
  ['noun', '入浴', 'にゅうよく', 'nyuuyoku', 'Mandi (di panti)'],
  ['noun', '排泄', 'はいせつ', 'haisetsu', 'Buang air'],
  ['noun', '食事介助', 'しょくじかいじょ', 'shokujikaijo', 'Bantuan makan'],
  ['noun', '見守り', 'みまもり', 'mimamori', 'Pengawasan tanpa banyak campur'],
  ['noun', '転倒', 'てんとう', 'tentou', 'Terjatuh'],
  ['noun', '骨折', 'こっせつ', 'kossetsu', 'Patah tulang'],
  ['noun', '認知症', 'にんちしょう', 'ninchishou', 'Demensia'],
  ['noun', '褥瘡', 'じょくそう', 'jokusou', 'Luka tekan (dekubitus)'],
  ['noun', '体位変換', 'たいいへんかん', 'taiihenkan', 'Mengubah posisi tubuh'],
  ['noun', '申し送り', 'もうしおくり', 'moushiokuri', 'Serah terima antar-shift'],
  ['noun', '記録', 'きろく', 'kiroku', 'Catatan'],
  ['noun', '声かけ', 'こえかけ', 'koekake', 'Menyapa / memberi tahu klien'],
  ['noun', '安否確認', 'あんぴかくにん', 'anpikakunin', 'Memastikan klien baik-baik saja'],
  ['verb', '介助します', 'かいじょします', 'kaijoshimasu', 'Membantu (klien)'],
  ['verb', '移乗します', 'いじょうします', 'ijoushimasu', 'Memindahkan (klien)'],
  ['verb', '見守ります', 'みまもります', 'mimamorimasu', 'Mengawasi'],
  ['verb', '呼びかけます', 'よびかけます', 'yobikakemasu', 'Memanggil / menyapa klien'],
] as const satisfies readonly KolomSsw[];

const KURIININGU = [
  ['noun', '清掃', 'せいそう', 'seisou', 'Pembersihan'],
  ['noun', '床', 'ゆか', 'yuka', 'Lantai'],
  ['noun', '廊下', 'ろうか', 'rouka', 'Koridor'],
  ['noun', '階段', 'かいだん', 'kaidan', 'Tangga'],
  ['noun', '窓ガラス', 'まどがらす', 'madogarasu', 'Kaca jendela'],
  ['noun', '洗剤', 'せんざい', 'senzai', 'Detergen / cairan pembersih'],
  ['noun', '雑巾', 'ぞうきん', 'zoukin', 'Kain lap'],
  ['noun', 'モップ', 'もっぷ', 'moppu', 'Mop'],
  ['noun', 'ほうき', 'ほうき', 'houki', 'Sapu'],
  ['noun', '掃除機', 'そうじき', 'soujiki', 'Penyedot debu'],
  ['noun', 'ゴミ袋', 'ごみぶくろ', 'gomibukuro', 'Kantong sampah'],
  ['noun', '分別', 'ぶんべつ', 'bunbetsu', 'Pemilahan sampah'],
  ['noun', 'トイレ', 'といれ', 'toire', 'Toilet'],
  ['noun', '消毒', 'しょうどく', 'shoudoku', 'Disinfeksi'],
  ['noun', '換気', 'かんき', 'kanki', 'Ventilasi'],
  ['noun', '点検', 'てんけん', 'tenken', 'Pemeriksaan'],
  ['noun', '危険防止', 'きけんぼうし', 'kikenboushi', 'Pencegahan bahaya'],
  ['verb', '滑ります', 'すべります', 'suberimasu', 'Licin / terpeleset'],
  ['verb', '拭きます', 'ふきます', 'fukimasu', 'Mengelap'],
  ['noun', '汚れ', 'よごれ', 'yogore', 'Kotoran / noda'],
  ['verb', '磨きます', 'みがきます', 'migakimasu', 'Menggosok'],
  ['verb', '集めます', 'あつめます', 'atsumemasu', 'Mengumpulkan (sampah)'],
] as const satisfies readonly KolomSsw[];

const INSHOKUHIN = [
  ['noun', '食材', 'しょくざい', 'shokuzai', 'Bahan makanan'],
  ['noun', '原料', 'げんりょう', 'genryou', 'Bahan baku'],
  ['noun', '加工', 'かこう', 'kakou', 'Pengolahan'],
  ['noun', '加熱', 'かねつ', 'kanetsu', 'Pemanasan'],
  ['noun', '冷却', 'れいきゃく', 'reikyaku', 'Pendinginan'],
  ['noun', '冷凍', 'れいとう', 'reitou', 'Pembekuan'],
  ['noun', '殺菌', 'さっきん', 'sakkin', 'Sterilisasi'],
  ['noun', '衛生', 'えいせい', 'eisei', 'Higiene'],
  ['noun', '手洗い', 'てあらい', 'tearai', 'Cuci tangan'],
  ['noun', '異物', 'いぶつ', 'ibutsu', 'Benda asing'],
  ['noun', '賞味期限', 'しょうみきげん', 'shoumikigen', 'Batas kualitas (boleh lewat sedikit)'],
  ['noun', '消費期限', 'しょうひきげん', 'shouhikigen', 'Batas konsumsi (tidak boleh lewat)'],
  ['noun', '包装', 'ほうそう', 'housou', 'Pengemasan'],
  ['noun', '検品', 'けんぴん', 'kenpin', 'Inspeksi produk'],
  ['noun', '計量', 'けいりょう', 'keiryou', 'Penimbangan / pengukuran'],
  ['noun', '温度管理', 'おんどかんり', 'ondokanri', 'Kontrol suhu'],
  ['noun', '作業着', 'さぎょうぎ', 'sagyougi', 'Pakaian kerja'],
  ['noun', '手袋', 'てぶくろ', 'tebukuro', 'Sarung tangan'],
  ['noun', '帽子', 'ぼうし', 'boushi', 'Topi kerja'],
  ['noun', '混入', 'こんにゅう', 'konnyuu', 'Tercampur (benda asing)'],
  ['verb', '洗います', 'あらいます', 'araimasu', 'Mencuci (bahan)'],
  ['verb', '切ります', 'きります', 'kirimasu', 'Memotong'],
  ['verb', '詰めます', 'つめます', 'tsumemasu', 'Mengisi (ke kemasan)'],
  ['verb', '検査します', 'けんさします', 'kensashimasu', 'Memeriksa'],
] as const satisfies readonly KolomSsw[];

const KENSETSU = [
  ['noun', '現場', 'げんば', 'genba', 'Lokasi proyek'],
  ['noun', '工事', 'こうじ', 'kouji', 'Pekerjaan konstruksi'],
  ['noun', '足場', 'あしば', 'ashiba', 'Perancah'],
  ['noun', 'ヘルメット', 'へるめっと', 'herumetto', 'Helm proyek'],
  ['noun', '安全帯', 'あんぜんたい', 'anzentai', 'Sabuk pengaman kerja'],
  ['noun', '図面', 'ずめん', 'zumen', 'Gambar teknik'],
  ['noun', '測量', 'そくりょう', 'sokuryou', 'Pengukuran lahan'],
  ['noun', '鉄筋', 'てっきん', 'tekkin', 'Besi beton'],
  ['noun', 'コンクリート', 'こんくりーと', 'konkuriito', 'Beton'],
  ['noun', '型枠', 'かたわく', 'katawaku', 'Bekisting'],
  ['noun', '重機', 'じゅうき', 'juuki', 'Alat berat'],
  ['noun', 'クレーン', 'くれーん', 'kureen', 'Crane'],
  ['noun', '高所作業', 'こうしょさぎょう', 'koushosagyou', 'Kerja di ketinggian'],
  ['noun', '墜落', 'ついらく', 'tsuiraku', 'Jatuh dari ketinggian'],
  ['noun', '騒音', 'そうおん', 'souon', 'Kebisingan'],
  ['noun', '粉塵', 'ふんじん', 'funjin', 'Debu'],
  ['noun', '片付け', 'かたづけ', 'katadzuke', 'Merapikan'],
  ['noun', '完了', 'かんりょう', 'kanryou', 'Selesai'],
  ['noun', '合図', 'あいず', 'aizu', 'Isyarat'],
  ['noun', '指示', 'しじ', 'shiji', 'Instruksi'],
  ['verb', '組み立てます', 'くみたてます', 'kumitatemasu', 'Merakit'],
  ['verb', '運びます', 'はこびます', 'hakobimasu', 'Mengangkut'],
  ['verb', '掘ります', 'ほります', 'horimasu', 'Menggali'],
  ['verb', '締めます', 'しめます', 'shimemasu', 'Mengencangkan (baut)'],
] as const satisfies readonly KolomSsw[];

const SEIZOU = [
  ['noun', '工場', 'こうじょう', 'koujou', 'Pabrik'],
  ['noun', '生産', 'せいさん', 'seisan', 'Produksi'],
  ['noun', '組立', 'くみたて', 'kumitate', 'Perakitan'],
  ['noun', '部品', 'ぶひん', 'buhin', 'Komponen'],
  ['noun', '製品', 'せいひん', 'seihin', 'Produk'],
  ['noun', '品質', 'ひんしつ', 'hinshitsu', 'Mutu'],
  ['noun', '不良品', 'ふりょうひん', 'furyouhin', 'Produk cacat'],
  ['noun', '工具', 'こうぐ', 'kougu', 'Peralatan tangan'],
  ['noun', '治具', 'じぐ', 'jigu', 'Jig (alat bantu pegang)'],
  ['noun', 'ライン', 'らいん', 'rain', 'Lini produksi'],
  ['noun', '稼働', 'かどう', 'kadou', 'Mesin beroperasi'],
  ['noun', '保守', 'ほしゅ', 'hoshu', 'Perawatan'],
  ['noun', '保護具', 'ほごぐ', 'hogogu', 'Alat pelindung diri'],
  ['noun', '整理整頓', 'せいりせいとん', 'seiriseiton', 'Rapi dan teratur (5S)'],
  ['noun', '工程', 'こうてい', 'koutei', 'Tahapan proses'],
  ['noun', '在庫', 'ざいこ', 'zaiko', 'Stok'],
  ['noun', '出荷', 'しゅっか', 'shukka', 'Pengiriman barang'],
  ['noun', '検査', 'けんさ', 'kensa', 'Pemeriksaan'],
  ['noun', '安全教育', 'あんぜんきょういく', 'anzenkyouiku', 'Pendidikan keselamatan'],
  ['noun', '異常', 'いじょう', 'ijou', 'Kelainan / abnormal'],
  ['verb', '組み立てます', 'くみたてます', 'kumitatemasu', 'Merakit'],
  ['verb', '加工します', 'かこうします', 'kakoushimasu', 'Memproses'],
  ['verb', '測定します', 'そくていします', 'sokuteishimasu', 'Mengukur'],
  ['verb', '報告します', 'ほうこくします', 'houkokushimasu', 'Melaporkan'],
] as const satisfies readonly KolomSsw[];

const GAISHOKU = [
  ['noun', '接客', 'せっきゃく', 'sekkyaku', 'Melayani tamu'],
  ['noun', '注文', 'ちゅうもん', 'chuumon', 'Pesanan'],
  ['noun', '献立', 'こんだて', 'kondate', 'Menu / susunan hidangan'],
  ['noun', '調理', 'ちょうり', 'chouri', 'Proses memasak'],
  ['noun', '盛り付け', 'もりつけ', 'moritsuke', 'Penataan di piring'],
  ['noun', '配膳', 'はいぜん', 'haizen', 'Menyajikan ke meja'],
  ['noun', '下膳', 'げぜん', 'gezen', 'Mengangkat piring kotor'],
  ['noun', '厨房', 'ちゅうぼう', 'chuubou', 'Dapur restoran'],
  ['noun', '食器', 'しょっき', 'shokki', 'Peralatan makan'],
  ['noun', '洗浄', 'せんじょう', 'senjou', 'Pencucian'],
  ['noun', '異物混入', 'いぶつこんにゅう', 'ibutsukonnyuu', 'Kontaminasi benda asing'],
  ['noun', '食物アレルギー', 'しょくもつあれるぎー', 'shokumotsuarerugii', 'Alergi makanan'],
  ['noun', '会計', 'かいけい', 'kaikei', 'Pembayaran'],
  ['noun', '満席', 'まんせき', 'manseki', 'Kursi penuh'],
  ['noun', '営業', 'えいぎょう', 'eigyou', 'Operasional (jam buka)'],
  ['noun', 'お通し', 'おとおし', 'otooshi', 'Hidangan pembuka (otomatis)'],
  ['noun', '取り分け', 'とりわけ', 'toriwake', 'Membagi ke piring kecil'],
  ['noun', '布巾', 'ふきん', 'fukin', 'Lap kain dapur'],
  ['noun', '売り切れ', 'うりきれ', 'urikire', 'Habis terjual'],
  ['noun', '片付け', 'かたづけ', 'katadzuke', 'Merapikan meja'],
  ['verb', '提供します', 'ていきょうします', 'teikyoushimasu', 'Menyajikan / menyediakan'],
  ['verb', '運びます', 'はこびます', 'hakobimasu', 'Mengantar hidangan'],
  ['verb', '片付けます', 'かたづけます', 'katadzukemasu', 'Membereskan meja'],
  ['verb', '洗います', 'あらいます', 'araimasu', 'Mencuci'],
] as const satisfies readonly KolomSsw[];

const NOUGYOU = [
  ['noun', '畑', 'はたけ', 'hatake', 'Ladang'],
  ['noun', '田んぼ', 'たんぼ', 'tanbo', 'Sawah'],
  ['noun', '種', 'たね', 'tane', 'Benih'],
  ['noun', '苗', 'なえ', 'nae', 'Bibit'],
  ['noun', '収穫', 'しゅうかく', 'shuukaku', 'Panen'],
  ['noun', '農協', 'のうきょう', 'noukyou', 'Koperasi pertanian'],
  ['noun', '農薬', 'のうやく', 'nouyaku', 'Pestisida'],
  ['noun', '肥料', 'ひりょう', 'hiryou', 'Pupuk'],
  ['noun', '灌漑', 'かんがい', 'kangai', 'Irigasi'],
  ['noun', 'ビニールハウス', 'びにーるはうす', 'biniiruhausu', 'Rumah plastik (greenhouse)'],
  ['noun', 'トラクター', 'とらくたー', 'torakutaa', 'Traktor'],
  ['noun', '草刈り', 'くさかり', 'kusakari', 'Memotong rumput'],
  ['noun', '害虫', 'がいちゅう', 'gaichuu', 'Hama'],
  ['noun', '暑さ対策', 'あつさたいさく', 'atsusataisaku', 'Antisipasi cuaca panas'],
  ['noun', '腰', 'こし', 'koshi', 'Pinggang'],
  ['noun', '熱中症', 'ねっちゅうしょう', 'netchuushou', 'Heatstroke'],
  ['noun', '土', 'つち', 'tsuchi', 'Tanah'],
  ['noun', '農業', 'のうぎょう', 'nougyou', 'Pertanian'],
  ['noun', '田植え', 'たうえ', 'taue', 'Menanam padi'],
  ['noun', '鍬', 'くわ', 'kuwa', 'Cangkul'],
  ['verb', '植えます', 'うえます', 'uemasu', 'Menanam'],
  ['verb', '摘みます', 'つみます', 'tsumimasu', 'Memetik'],
  ['verb', '運びます', 'はこびます', 'hakobimasu', 'Mengangkut hasil'],
  ['verb', '撒きます', 'まきます', 'makimasu', 'Menabur (pupuk)'],
] as const satisfies readonly KolomSsw[];

const GYOGYOU = [
  ['noun', '漁船', 'ぎょせん', 'gyosen', 'Kapal ikan'],
  ['noun', '漁港', 'ぎょこう', 'gyokou', 'Pelabuhan ikan'],
  ['noun', '網', 'あみ', 'ami', 'Jaring'],
  ['noun', '釣り', 'つり', 'tsuri', 'Memancing'],
  ['noun', '水揚げ', 'みずあげ', 'mizuage', 'Bongkar hasil tangkapan'],
  ['noun', '鮮度', 'せんど', 'sendo', 'Kesegaran'],
  ['noun', '氷', 'こおり', 'koori', 'Es'],
  ['noun', '冷蔵', 'れいぞう', 'reizou', 'Pendinginan'],
  ['noun', '船酔い', 'ふなよい', 'funayoi', 'Mabuk laut'],
  ['noun', '救命胴衣', 'きゅうめいどうい', 'kyuumeidoui', 'Pelampung'],
  ['noun', '転落', 'てんらく', 'tenraku', 'Terjatuh (ke laut)'],
  ['noun', '養殖', 'ようしょく', 'youshoku', 'Budidaya'],
  ['noun', '貝', 'かい', 'kai', 'Kerang'],
  ['noun', '海藻', 'かいそう', 'kaisou', 'Rumput laut'],
  ['noun', '釣り針', 'つりばり', 'tsuribari', 'Mata kail'],
  ['noun', 'ロープ', 'ろーぷ', 'roopu', 'Tali tambang'],
  ['noun', '波', 'なみ', 'nami', 'Ombak'],
  ['noun', '潮', 'しお', 'shio', 'Pasang / arus laut'],
  ['noun', '機関', 'きかん', 'kikan', 'Mesin kapal'],
  ['noun', '航海', 'こうかい', 'koukai', 'Pelayaran'],
  ['verb', '引きます', 'ひきます', 'hikimasu', 'Menarik'],
  ['verb', '冷やします', 'ひやします', 'hiyashimasu', 'Mendinginkan'],
  ['verb', '積みます', 'つみます', 'tsumimasu', 'Memuat'],
  ['verb', '縛ります', 'しばります', 'shibarimasu', 'Mengikat'],
] as const satisfies readonly KolomSsw[];

const SHUKUHAKU = [
  ['noun', '客室', 'きゃくしつ', 'kyakushitsu', 'Kamar tamu'],
  ['noun', 'ベッドメイク', 'べっどめいく', 'beddomeiku', 'Merapikan tempat tidur'],
  ['noun', 'チェックイン', 'ちぇっくいん', 'chekkuin', 'Check-in'],
  ['noun', 'チェックアウト', 'ちぇっくあうと', 'chekkuauto', 'Check-out'],
  ['noun', 'フロント', 'ふろんと', 'furonto', 'Resepsionis'],
  ['noun', '浴衣', 'ゆかた', 'yukata', 'Yukata (pakaian kamar)'],
  ['noun', '備品', 'びひん', 'bihin', 'Perlengkapan kamar'],
  ['noun', '苦情', 'くじょう', 'kujou', 'Keluhan tamu'],
  ['noun', 'おもてなし', 'おもてなし', 'omotenashi', 'Keramahan menyambut'],
  ['noun', '布団', 'ふとん', 'futon', 'Futon'],
  ['noun', 'シーツ', 'しーつ', 'shiitsu', 'Seprai'],
  ['noun', '予約管理', 'よやくかんり', 'yoyakukanri', 'Pengelolaan reservasi'],
  ['noun', 'アメニティ', 'あめにてぃ', 'ameniti', 'Perlengkapan mandi tamu'],
  ['noun', 'ルームキー', 'るーむきー', 'ruumukii', 'Kunci kamar'],
  ['noun', '朝食会場', 'ちょうしょくかいじょう', 'choushokukaijou', 'Ruang sarapan'],
  ['noun', '館内', 'かんない', 'kannai', 'Di dalam gedung hotel'],
  ['noun', '案内', 'あんない', 'annai', 'Pemanduan / informasi'],
  ['noun', '忘れ物', 'わすれもの', 'wasuremono', 'Barang tertinggal'],
  ['noun', '鍵', 'かぎ', 'kagi', 'Kunci'],
  ['noun', '清掃', 'せいそう', 'seisou', 'Pembersihan kamar'],
  ['verb', '掃除します', 'そうじします', 'soujishimasu', 'Membersihkan kamar'],
  ['verb', '交換します', 'こうかんします', 'koukanshimasu', 'Mengganti (sprei/handuk)'],
  ['verb', '案内します', 'あんないします', 'annaishimasu', 'Memandu tamu'],
  ['verb', '確認します', 'かくにんします', 'kakuninshimasu', 'Memeriksa'],
] as const satisfies readonly KolomSsw[];

const SEIBI = [
  ['noun', '整備', 'せいび', 'seibi', 'Perawatan kendaraan'],
  ['noun', '点検', 'てんけん', 'tenken', 'Pemeriksaan'],
  ['noun', 'エンジン', 'えんじん', 'enjin', 'Mesin'],
  ['noun', 'オイル', 'おいる', 'oiru', 'Oli'],
  ['noun', 'タイヤ', 'たいや', 'taiya', 'Ban'],
  ['noun', 'ブレーキ', 'ぶれーき', 'bureeki', 'Rem'],
  ['noun', 'バッテリー', 'ばってりー', 'batterii', 'Aki'],
  ['noun', 'レンチ', 'れんち', 'renchi', 'Kunci pas'],
  ['noun', 'ジャッキ', 'じゃっき', 'jakki', 'Dongkrak'],
  ['noun', '交換', 'こうかん', 'koukan', 'Penggantian'],
  ['noun', '調整', 'ちょうせい', 'chousei', 'Penyetelan'],
  ['noun', '試運転', 'しうんてん', 'shiunten', 'Uji jalan'],
  ['noun', '車検', 'しゃけん', 'shaken', 'Uji kendaraan (shaken)'],
  ['noun', '排気ガス', 'はいきがす', 'haikigasu', 'Gas buang'],
  ['noun', '洗車', 'せんしゃ', 'sensha', 'Cuci mobil'],
  ['noun', 'オイル交換', 'おいるこうかん', 'oirukoukan', 'Ganti oli'],
  ['noun', 'ブレーキパッド', 'ぶれーきぱっど', 'bureekipaddo', 'Kampas rem'],
  ['noun', 'エアフィルター', 'えあふぃるたー', 'eafirutaa', 'Filter udara'],
  ['noun', '燃料', 'ねんりょう', 'nenryou', 'Bahan bakar'],
  ['noun', '工具', 'こうぐ', 'kougu', 'Peralatan tangan'],
  ['verb', '交換します', 'こうかんします', 'koukanshimasu', 'Mengganti'],
  ['verb', '締めます', 'しめます', 'shimemasu', 'Mengencangkan'],
  ['verb', '測定します', 'そくていします', 'sokuteishimasu', 'Mengukur'],
  ['verb', '洗います', 'あらいます', 'araimasu', 'Mencuci'],
] as const satisfies readonly KolomSsw[];

const KOUKUU = [
  ['noun', '滑走路', 'かっそうろ', 'kassouro', 'Landasan pacu'],
  ['noun', '駐機場', 'ちゅうきじょう', 'chuukijou', 'Apron (tempat parkir pesawat)'],
  ['noun', '搭乗', 'とうじょう', 'toujou', 'Naik pesawat (boarding)'],
  ['noun', '手荷物', 'てにもつ', 'tenimotsu', 'Bagasi kabin'],
  ['noun', '預け荷物', 'あずけにもつ', 'azukenimotsu', 'Bagasi tercatat'],
  ['noun', '保安検査', 'ほあんけんさ', 'hoankensa', 'Pemeriksaan keamanan'],
  ['noun', '誘導', 'ゆうどう', 'yuudou', 'Pemanduan (marshalling)'],
  ['noun', '給油', 'きゅうゆ', 'kyuuyu', 'Pengisian bahan bakar'],
  ['noun', '安全確認', 'あんぜんかくにん', 'anzenkakunin', 'Pemeriksaan keselamatan'],
  ['noun', '車両', 'しゃりょう', 'sharyou', 'Kendaraan ground support'],
  ['noun', '救命', 'きゅうめい', 'kyuumei', 'Penyelamatan'],
  ['noun', '貨物', 'かもつ', 'kamotsu', 'Kargo'],
  ['noun', '旅客', 'りょかく', 'ryokaku', 'Penumpang'],
  ['noun', '出発便', 'しゅっぱつびん', 'shuppatsubin', 'Penerbangan berangkat'],
  ['noun', '到着便', 'とうちゃくびん', 'touchakubin', 'Penerbangan datang'],
  ['noun', '遅延', 'ちえん', 'chien', 'Keterlambatan'],
  ['noun', '欠航', 'けっこう', 'kekkou', 'Penerbangan dibatalkan'],
  ['noun', '地上業務', 'ちじょうぎょうむ', 'chijougyoumu', 'Pekerjaan darat'],
  ['noun', '誘導路', 'ゆうどうろ', 'yuudouro', 'Taxiway'],
  ['noun', '整備士', 'せいびし', 'seibishi', 'Teknisi perawatan pesawat'],
  ['verb', '運びます', 'はこびます', 'hakobimasu', 'Mengangkut bagasi'],
  ['verb', '確認します', 'かくにんします', 'kakuninshimasu', 'Memeriksa'],
  ['verb', '誘導します', 'ゆうどうします', 'yuudoushimasu', 'Memandu pesawat'],
  ['verb', '積み込みます', 'つみこみます', 'tsumikomimasu', 'Memuat ke pesawat'],
] as const satisfies readonly KolomSsw[];

const UNSOU = [
  ['noun', '配送', 'はいそう', 'haisou', 'Pengiriman barang'],
  ['noun', '荷積み', 'にづみ', 'nizumi', 'Muat barang'],
  ['noun', '荷降ろし', 'におろし', 'nioroshi', 'Bongkar barang'],
  ['noun', '運行', 'うんこう', 'unkou', 'Operasi kendaraan'],
  ['noun', '点呼', 'てんこ', 'tenko', 'Pemeriksaan awak sebelum jalan'],
  ['noun', '拘束時間', 'こうそくじかん', 'kousokujikan', 'Jam kerja terikat'],
  ['noun', '休息', 'きゅうそく', 'kyuusoku', 'Istirahat'],
  ['noun', '渋滞', 'じゅうたい', 'juutai', 'Kemacetan'],
  ['noun', '高速道路', 'こうそくどうろ', 'kousokudouro', 'Jalan tol'],
  ['noun', '納品書', 'のうひんしょ', 'nouhinsho', 'Surat jalan'],
  ['noun', '伝票', 'でんぴょう', 'denpyou', 'Slip / nota'],
  ['noun', '積載', 'せきさい', 'sekisai', 'Kapasitas muat'],
  ['noun', '安全運転', 'あんぜんうんてん', 'anzenunten', 'Mengemudi aman'],
  ['noun', '車間距離', 'しゃかんきょり', 'shakankyori', 'Jarak aman antar-kendaraan'],
  ['noun', '法定速度', 'ほうていそくど', 'houteisokudo', 'Batas kecepatan resmi'],
  ['noun', '運行管理者', 'うんこうかんりしゃ', 'unkoukanrisha', 'Pengelola operasi armada'],
  ['noun', '過積載', 'かせきさい', 'kasekisai', 'Muat berlebih'],
  ['noun', 'ドライバー', 'どらいばー', 'doraibaa', 'Pengemudi'],
  ['noun', '荷台', 'にだい', 'nidai', 'Bak truk'],
  ['noun', '点検', 'てんけん', 'tenken', 'Pemeriksaan kendaraan'],
  ['verb', '積みます', 'つみます', 'tsumimasu', 'Memuat'],
  ['verb', '降ろします', 'おろします', 'oroshimasu', 'Menurunkan barang'],
  ['verb', '確認します', 'かくにんします', 'kakuninshimasu', 'Memeriksa'],
  ['verb', '休みます', 'やすみます', 'yasumimasu', 'Istirahat'],
] as const satisfies readonly KolomSsw[];

const TETSUDOU = [
  ['noun', '線路', 'せんろ', 'senro', 'Rel'],
  ['noun', '駅員', 'えきいん', 'ekiin', 'Petugas stasiun'],
  ['noun', '改札', 'かいさつ', 'kaisatsu', 'Gerbang tiket'],
  ['noun', 'ホーム', 'ほーむ', 'hoomu', 'Peron'],
  ['noun', '乗務', 'じょうむ', 'joumu', 'Dinas sebagai awak kereta'],
  ['noun', '運転士', 'うんてんし', 'untenshi', 'Masinis'],
  ['noun', '車掌', 'しゃしょう', 'shashou', 'Kondektur'],
  ['noun', '保線', 'ほせん', 'hosen', 'Perawatan jalur'],
  ['noun', '架線', 'かせん', 'kasen', 'Kabel listrik atas'],
  ['noun', '定刻', 'ていこく', 'teikoku', 'Tepat waktu'],
  ['noun', '遅延', 'ちえん', 'chien', 'Keterlambatan'],
  ['noun', '緊急停止', 'きんきゅうていし', 'kinkyuuteishi', 'Berhenti darurat'],
  ['noun', '信号機', 'しんごうき', 'shingouki', 'Sinyal kereta'],
  ['noun', '踏切', 'ふみきり', 'fumikiri', 'Perlintasan kereta'],
  ['noun', '車内放送', 'しゃないほうそう', 'shanaihousou', 'Pengumuman di dalam kereta'],
  ['noun', '乗客', 'じょうきゃく', 'joukyaku', 'Penumpang'],
  ['noun', '切符', 'きっぷ', 'kippu', 'Tiket'],
  ['noun', '定期券', 'ていきけん', 'teikiken', 'Tiket langganan'],
  ['noun', 'ホームドア', 'ほーむどあ', 'hoomudoa', 'Pintu peron'],
  ['noun', '点検', 'てんけん', 'tenken', 'Pemeriksaan'],
  ['verb', '点検します', 'てんけんします', 'tenkenshimasu', 'Memeriksa'],
  ['verb', '案内します', 'あんないします', 'annaishimasu', 'Memandu penumpang'],
  ['verb', '停止します', 'ていしします', 'teishishimasu', 'Menghentikan'],
  ['verb', '確認します', 'かくにんします', 'kakuninshimasu', 'Memastikan'],
] as const satisfies readonly KolomSsw[];

const RINGYOU = [
  ['noun', '森林', 'しんりん', 'shinrin', 'Hutan'],
  ['noun', '伐採', 'ばっさい', 'bassai', 'Penebangan'],
  ['noun', '植林', 'しょくりん', 'shokurin', 'Penanaman hutan'],
  ['noun', 'チェンソー', 'ちぇんそー', 'chensoo', 'Gergaji mesin'],
  ['noun', '安全帽', 'あんぜんぼう', 'anzenbou', 'Helm keselamatan'],
  ['noun', '枝打ち', 'えだうち', 'edauchi', 'Pemangkasan dahan'],
  ['noun', '搬出', 'はんしゅつ', 'hanshutsu', 'Pengeluaran kayu dari hutan'],
  ['noun', '傾斜地', 'けいしゃち', 'keishachi', 'Lereng / tanah miring'],
  ['noun', '蜂', 'はち', 'hachi', 'Lebah'],
  ['noun', '熊', 'くま', 'kuma', 'Beruang'],
  ['noun', '山道', 'やまみち', 'yamamichi', 'Jalan gunung'],
  ['noun', '無線', 'むせん', 'musen', 'Radio komunikasi'],
  ['noun', '造林', 'ぞうりん', 'zourin', 'Penghijauan hutan'],
  ['noun', '下草刈り', 'したくさがり', 'shitakusagari', 'Memotong rumput bawah'],
  ['noun', '林道', 'りんどう', 'rindou', 'Jalan hutan'],
  ['noun', '間伐', 'かんばつ', 'kanbatsu', 'Penjarangan pohon'],
  ['noun', '伐倒', 'ばっとう', 'battou', 'Menumbangkan pohon'],
  ['noun', 'チェンソー油', 'ちぇんそーゆ', 'chensooyu', 'Oli gergaji mesin'],
  ['noun', '木材', 'もくざい', 'mokuzai', 'Kayu'],
  ['noun', 'ヘルメット', 'へるめっと', 'herumetto', 'Helm'],
  ['verb', '切ります', 'きります', 'kirimasu', 'Menebang / memotong'],
  ['verb', '運びます', 'はこびます', 'hakobimasu', 'Mengeluarkan kayu'],
  ['verb', '植えます', 'うえます', 'uemasu', 'Menanam'],
  ['verb', '点検します', 'てんけんします', 'tenkenshimasu', 'Memeriksa'],
] as const satisfies readonly KolomSsw[];

const MOKUZAI = [
  ['noun', '木材', 'もくざい', 'mokuzai', 'Kayu'],
  ['noun', '製材', 'せいざい', 'seizai', 'Penggergajian kayu'],
  ['noun', '乾燥', 'かんそう', 'kansou', 'Pengeringan'],
  ['noun', '集成材', 'しゅうせいざい', 'shuuseizai', 'Kayu laminasi'],
  ['noun', '合板', 'ごうはん', 'gouhan', 'Kayu lapis'],
  ['noun', '寸法', 'すんぽう', 'sunpou', 'Dimensi'],
  ['noun', '木屑', 'きくず', 'kikuzu', 'Serbuk kayu'],
  ['noun', 'のこぎり', 'のこぎり', 'nokogiri', 'Gergaji tangan'],
  ['noun', '釘', 'くぎ', 'kugi', 'Paku'],
  ['noun', '接着剤', 'せっちゃくざい', 'setchakuzai', 'Perekat'],
  ['noun', '防虫', 'ぼうちゅう', 'bouchuu', 'Anti hama kayu'],
  ['noun', '木目', 'もくめ', 'mokume', 'Serat kayu'],
  ['noun', '板材', 'いたざい', 'itazai', 'Papan kayu'],
  ['noun', '柱', 'はしら', 'hashira', 'Tiang'],
  ['noun', '梁', 'はり', 'hari', 'Balok'],
  ['noun', '含水率', 'がんすいりつ', 'gansuiritsu', 'Kadar air'],
  ['noun', '製材所', 'せいざいしょ', 'seizaisho', 'Tempat penggergajian'],
  ['noun', '木工', 'もっこう', 'mokkou', 'Pekerjaan kayu'],
  ['noun', '研磨', 'けんま', 'kenma', 'Pengamplasan'],
  ['noun', '割れ', 'われ', 'ware', 'Retak / pecah'],
  ['verb', '切ります', 'きります', 'kirimasu', 'Menggergaji'],
  ['verb', '削ります', 'けずります', 'kezurimasu', 'Menyerut'],
  ['verb', '乾かします', 'かわかします', 'kawakashimasu', 'Mengeringkan'],
  ['verb', '組み立てます', 'くみたてます', 'kumitatemasu', 'Merakit'],
] as const satisfies readonly KolomSsw[];

const ZOUSEN = [
  ['noun', '造船', 'ぞうせん', 'zousen', 'Pembuatan kapal'],
  ['noun', '溶接', 'ようせつ', 'yousetsu', 'Pengelasan'],
  ['noun', '鉄板', 'てっぱん', 'teppan', 'Pelat baja'],
  ['noun', '塗装', 'とそう', 'tosou', 'Pengecatan'],
  ['noun', '艤装', 'ぎそう', 'gisou', 'Pemasangan perlengkapan kapal'],
  ['noun', '船体', 'せんたい', 'sentai', 'Badan kapal'],
  ['noun', '火花', 'ひばな', 'hibana', 'Percikan api'],
  ['noun', '火災', 'かさい', 'kasai', 'Kebakaran'],
  ['noun', '閉所', 'へいしょ', 'heisho', 'Ruang tertutup'],
  ['noun', '酸欠', 'さんけつ', 'sanketsu', 'Kekurangan oksigen'],
  ['noun', '完成', 'かんせい', 'kansei', 'Selesai'],
  ['noun', '進水', 'しんすい', 'shinsui', 'Peluncuran kapal ke air'],
  ['noun', '溶接機', 'ようせつき', 'yousetsuki', 'Mesin las'],
  ['noun', '溶接面', 'ようせつめん', 'yousetsumen', 'Kedok las'],
  ['noun', 'ブラスト', 'ぶらすと', 'burasuto', 'Sandblasting'],
  ['noun', '船台', 'せんだい', 'sendai', 'Galangan (landasan kapal)'],
  ['noun', '機関室', 'きかんしつ', 'kikanshitsu', 'Kamar mesin'],
  ['noun', '塗料', 'とりょう', 'toryou', 'Cat'],
  ['noun', '足場', 'あしば', 'ashiba', 'Perancah'],
  ['noun', '点検', 'てんけん', 'tenken', 'Pemeriksaan'],
  ['verb', '溶接します', 'ようせつします', 'yousetsushimasu', 'Mengelas'],
  ['verb', '塗ります', 'ぬります', 'nurimasu', 'Mengecat'],
  ['verb', '削ります', 'けずります', 'kezurimasu', 'Menggerinda'],
  ['verb', '確認します', 'かくにんします', 'kakuninshimasu', 'Memeriksa'],
] as const satisfies readonly KolomSsw[];

/**
 * 16 bidang, urut seperti urutan resmi (介護 dulu), karena itu urutan yang
 * dicari orang saat membuka halaman.
 *
 * `ringkas` sengaja satu kalimat: ia tampil di kartu pemilih bidang, dan kartu
 * yang isinya paragraf tidak dibaca.
 */
export const BIDANG_SSW: readonly BidangSsw[] = [
  {
    id: 'kaigo',
    nama: 'Perawatan Lansia (Kaigo)',
    namaJp: '介護',
    ringkas: 'Membantu lansia mandi, makan, berpindah posisi, dan memantau keselamatan.',
    kata: KAIGO.map(keKata),
  },
  {
    id: 'kuriiningu',
    nama: 'Pembersihan Gedung',
    namaJp: 'ビルクリーニング',
    ringkas: 'Membersihkan lantai, kaca, toilet, dan memilah sampah di gedung.',
    kata: KURIININGU.map(keKata),
  },
  {
    id: 'inshokuhin',
    nama: 'Pengolahan Makanan',
    namaJp: '飲食料品製造業',
    ringkas: 'Mengolah, memanaskan, mendinginkan, mengemas, dan memeriksa produk makanan.',
    kata: INSHOKUHIN.map(keKata),
  },
  {
    id: 'kensetsu',
    nama: 'Konstruksi',
    namaJp: '建設',
    ringkas: 'Bekerja di proyek bangunan: bekisting, besi beton, perancah, alat berat.',
    kata: KENSETSU.map(keKata),
  },
  {
    id: 'seizou',
    nama: 'Manufaktur Mesin & Elektronik',
    namaJp: '素形材・産業機械・電気電子情報関連製造業',
    ringkas: 'Merakit komponen di lini produksi dan menjaga mutu serta keselamatan kerja.',
    kata: SEIZOU.map(keKata),
  },
  {
    id: 'gaishoku',
    nama: 'Restoran (Gaishoku)',
    namaJp: '外食業',
    ringkas: 'Melayani tamu, menyiapkan hidangan, dan menjaga kebersihan dapur.',
    kata: GAISHOKU.map(keKata),
  },
  {
    id: 'nougyou',
    nama: 'Pertanian',
    namaJp: '農業',
    ringkas: 'Menanam, merawat, dan memanen sayur serta padi di ladang dan rumah plastik.',
    kata: NOUGYOU.map(keKata),
  },
  {
    id: 'gyogyou',
    nama: 'Perikanan',
    namaJp: '漁業',
    ringkas: 'Bekerja di kapal ikan: menangkap, mendinginkan, dan membongkar hasil laut.',
    kata: GYOGYOU.map(keKata),
  },
  {
    id: 'shukuhaku',
    nama: 'Perhotelan',
    namaJp: '宿泊',
    ringkas: 'Merapikan kamar, melayani tamu di front desk, dan menyiapkan sarapan.',
    kata: SHUKUHAKU.map(keKata),
  },
  {
    id: 'seibi',
    nama: 'Perawatan Otomotif',
    namaJp: '自動車整備',
    ringkas: 'Memeriksa, mengganti, dan menyetel komponen kendaraan di bengkel.',
    kata: SEIBI.map(keKata),
  },
  {
    id: 'koukuu',
    nama: 'Aviasi (Ground Handling)',
    namaJp: '航空',
    ringkas: 'Menangani bagasi, memandu pesawat di apron, dan memeriksa keselamatan.',
    kata: KOUKUU.map(keKata),
  },
  {
    id: 'unsou',
    nama: 'Transportasi Barang',
    namaJp: '自動車運送業',
    ringkas: 'Mengemudi truk, memuat-bongkar barang, dan mengelola jam kerja serta istirahat.',
    kata: UNSOU.map(keKata),
  },
  {
    id: 'tetsudou',
    nama: 'Perkeretaapian',
    namaJp: '鉄道',
    ringkas: 'Menjaga jalur, mengoperasikan kereta, dan melayani penumpang di stasiun.',
    kata: TETSUDOU.map(keKata),
  },
  {
    id: 'ringyou',
    nama: 'Kehutanan',
    namaJp: '林業',
    ringkas: 'Menebang, memangkas, dan mengeluarkan kayu dari hutan dengan aman.',
    kata: RINGYOU.map(keKata),
  },
  {
    id: 'mokuzai',
    nama: 'Industri Kayu',
    namaJp: '木材産業',
    ringkas: 'Menggergaji, mengeringkan, dan merakit kayu menjadi bahan bangunan.',
    kata: MOKUZAI.map(keKata),
  },
  {
    id: 'zousen',
    nama: 'Galangan Kapal',
    namaJp: '造船・舶用工業',
    ringkas: 'Mengelas, mengecat, dan memasang perlengkapan badan kapal.',
    kata: ZOUSEN.map(keKata),
  },
];

/** Jumlah kata seluruh bidang — dipakai kop halaman dan tes. */
export const JUMLAH_SSW: number = BIDANG_SSW.reduce((n, b) => n + b.kata.length, 0);
