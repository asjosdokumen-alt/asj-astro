/**
 * kotoba/n5.ts — 174 kata N5 tambahan dari materi "KANJI N5 LENGKAP.xlsx".
 *
 * ASAL DAN BATASNYA
 * -----------------
 * Berkas sumbernya bukan tabel kanji, melainkan daftar kosakata N5 multi-kolom
 * tanpa arti Indonesia. Dari 733 pasangan kata+bacaan di sana, 536 sudah ada di
 * bank buku (Minna); 197 sisanya dianggap baru.
 *
 * 197 itu TIDAK bisa dipakai apa adanya. Yang dibuang/ diperbaiki sebelum masuk:
 *   • 1 kanji rusak hasil ekstraksi (`鸚⒳맑` → 天丼);
 *   • anotasi kurung dari sumber (`「お」正月`, `「色々」…`);
 *   • 3 bacaan yang salah di sumber (`辞書/じいしょ`, `女の人/おんあのひと`,
 *     `入学祝い/にゅがくいわい`);
 *   • 12 duplikat bentuk kamus vs ます (掛かる/掛かります, 飛ぶ/飛びます, …);
 *   • 11 pasangan yang TIDAK konsisten — kanji bentuk kamus dengan bacaan ます
 *     (mis. `掛かる/かかります`). Itu akan mengajari bacaan yang keliru, jadi
 *     dibuang alih-alih ditebak bentuk ます-nya (死ぬ→死にます tidak beraturan).
 *
 * Hasil akhir: 174 entri. ARTINYA SAYA TULIS SENDIRI (Bahasa Indonesia) — berkas
 * sumber tidak memuat arti sama sekali. Romaji diturunkan dari kana dengan
 * konverter yang sama seperti bank lain, jadi ejaannya konsisten.
 *
 * Yang TIDAK diklaim: ini bukan daftar resmi N5, dan bukan pengganti buku. Ia
 * mengisi celah kata yang belum ada di bank buku, bukan menggantikannya.
 */

/** [kanji, hiragana, romaji, arti, jenis kata] */
type KolomN5 = readonly [string, string, string, string, 'verb' | 'adj' | 'noun' | 'other'];

export interface KotobaN5 {
  /** Selalu 0: bukan bab buku. Klien memakainya untuk melewati filter bab. */
  b: 0;
  k: string;
  h: string;
  r: string;
  id: string;
  pos: 'verb' | 'adj' | 'noun' | 'other';
}

const KOLOM: readonly KolomN5[] = [
  ['食品', 'しょくひん', 'shokuhin', 'Makanan', 'noun'],
  ['豚肉', 'ぶたにく', 'butaniku', 'Daging babi', 'noun'],
  ['辞書', 'じしょ', 'jisho', 'Kamus', 'noun'],
  ['茶色', 'ちゃいろ', 'chairo', 'Warna cokelat', 'noun'],
  ['紫', 'むらさき', 'murasaki', 'Ungu', 'noun'],
  ['夜', 'よる', 'yoru', 'Malam', 'noun'],
  ['映画', 'えいが', 'eiga', 'Film', 'noun'],
  ['番号', 'ばんごう', 'bangou', 'Nomor', 'noun'],
  ['次の', 'つぎの', 'tsugino', 'Berikutnya', 'noun'],
  ['普通', 'ふつう', 'futsuu', 'Biasa', 'noun'],
  ['急行', 'きゅうこう', 'kyuukou', 'Kereta ekspres', 'noun'],
  ['玄関', 'げんかん', 'genkan', 'Pintu masuk rumah', 'noun'],
  ['歯が痛い', 'はがいたい', 'hagaitai', 'Gigi sakit', 'noun'],
  ['頭が痛い', 'あたまがいたい', 'atamagaitai', 'Kepala sakit', 'noun'],
  ['せきが出ます', 'せきがでます', 'sekigademasu', 'Batuk', 'verb'],
  ['宿題', 'しくだい', 'shikudai', 'Pekerjaan rumah', 'noun'],
  ['分かりました', 'わかりました', 'wakarimashita', 'Mengerti', 'noun'],
  ['お腹が痛い', 'おなかがいたい', 'onakagaitai', 'Perut sakit', 'noun'],
  ['妻', 'つま', 'tsuma', 'Istri', 'noun'],
  ['貸してください', 'かしてください', 'kashitekudasai', 'Tolong pinjamkan', 'other'],
  ['残念ですね', 'ざんねんですね', 'zannendesune', 'Sayang sekali', 'other'],
  ['一緒にいかがですか', 'いっしょにいかがですか', 'isshoniikagadesuka', 'Bagaimana kalau bersama-sama?', 'other'],
  ['また今度お願いします', 'またこんどおねがいします', 'matakondoonegaishimasu', 'Lain kali saja', 'verb'],
  ['恋愛', 'れんあい', 'renai', 'Percintaan', 'noun'],
  ['喜劇', 'きげき', 'kigeki', 'Komedi', 'noun'],
  ['水泳', 'すいえい', 'suiei', 'Berenang', 'noun'],
  ['女の人', 'おんなのひと', 'onnanohito', 'Perempuan', 'noun'],
  ['洗面所', 'せんめんじょ', 'senmenjo', 'Kamar cuci muka', 'noun'],
  ['台所', 'だいどころ', 'daidokoro', 'Dapur', 'noun'],
  ['寝室', 'しんしつ', 'shinshitsu', 'Kamar tidur', 'noun'],
  ['廊下', 'ろうか', 'rouka', 'Koridor', 'noun'],
  ['いい天気ですね', 'いいてんきですね', 'iitenkidesune', 'Cuacanya bagus ya', 'other'],
  ['お出かけですか', 'おでかけですか', 'odekakedesuka', 'Mau keluar?', 'other'],
  ['行ってきます', 'いってきます', 'ittekimasu', 'Saya pergi dulu', 'verb'],
  ['定食', 'ていしょく', 'teishoku', 'Paket makanan', 'noun'],
  ['天丼', 'てんどん', 'tendon', 'Donburi tempura', 'noun'],
  ['お好み焼き', 'おこのみやき', 'okonomiyaki', 'Okonomiyaki', 'noun'],
  ['牛丼', 'ぎゅうどん', 'gyuudon', 'Donburi daging sapi', 'noun'],
  ['焼き肉', 'やきにく', 'yakiniku', 'Daging bakar', 'noun'],
  ['野菜いため', 'やさいいため', 'yasaiitame', 'Tumis sayur', 'noun'],
  ['漬物', 'つけもの', 'tsukemono', 'Acar', 'noun'],
  ['焼きそば', 'やきそば', 'yakisoba', 'Yakisoba', 'noun'],
  ['鶏肉', 'とりにく', 'toriniku', 'Daging ayam', 'noun'],
  ['牛肉', 'ぎゅうにく', 'gyuuniku', 'Daging sapi', 'noun'],
  ['お帰りなさい', 'おかえりなさい', 'okaerinasai', 'Selamat datang kembali', 'noun'],
  ['祇園祭', 'ぎおんまつり', 'gionmatsuri', 'Festival Gion', 'noun'],
  ['お正月', 'おしょうがつ', 'oshougatsu', 'Tahun baru', 'noun'],
  ['のどが乾きます', 'かわきます', 'kawakimasu', 'Haus', 'verb'],
  ['ご注文は', 'ごちゅうもんは', 'gochuumonha', 'Pesanan Anda?', 'noun'],
  ['少々お待ち下さい', 'しょうしょうおまちください', 'shoushouomachikudasai', 'Mohon tunggu sebentar', 'noun'],
  ['博物館', 'はくぶつかん', 'hakubutsukan', 'Museum', 'noun'],
  ['植物園', 'しょくぶつえん', 'shokubutsuen', 'Kebun raya', 'noun'],
  ['教会', 'きょうかい', 'kyoukai', 'Gereja', 'noun'],
  ['体育館', 'たいいくかん', 'taiikukan', 'Gedung olahraga', 'noun'],
  ['入国管理局', 'にゅうこくかんりきょく', 'nyuukokukanrikyoku', 'Kantor imigrasi', 'noun'],
  ['警察所', 'けいさつしょ', 'keisatsusho', 'Kantor polisi', 'noun'],
  ['高校', 'こうこう', 'koukou', 'SMA', 'noun'],
  ['中学校', 'ちゅうがっこう', 'chuugakkou', 'SMP', 'noun'],
  ['小学校', 'しょうがっこう', 'shougakkou', 'SD', 'noun'],
  ['幼稚園', 'ようちえん', 'youchien', 'Taman kanak-kanak', 'noun'],
  ['肉屋', 'にくや', 'nikuya', 'Toko daging', 'noun'],
  ['パン屋', 'ぱんや', 'panya', 'Toko roti', 'noun'],
  ['魚屋', 'さかなや', 'sakanaya', 'Toko ikan', 'noun'],
  ['八百屋', 'やおや', 'yaoya', 'Toko sayur', 'noun'],
  ['問題', 'もんだい', 'mondai', 'Soal / masalah', 'noun'],
  ['お釣り', 'おつり', 'otsuri', 'Uang kembalian', 'noun'],
  ['切符売り場', 'きっぷうりば', 'kippuuriba', 'Loket tiket', 'noun'],
  ['自動券売機', 'じどけんばいき', 'jidokenbaiki', 'Mesin tiket otomatis', 'noun'],
  ['精算機', 'せいさんき', 'seisanki', 'Mesin penyesuai tarif', 'noun'],
  ['改札口', 'かいさつぐち', 'kaisatsuguchi', 'Pintu tiket', 'noun'],
  ['入口', 'いりぐち', 'iriguchi', 'Pintu masuk', 'noun'],
  ['東口', 'ひがしぐち', 'higashiguchi', 'Pintu timur', 'noun'],
  ['西口', 'にしぐち', 'nishiguchi', 'Pintu barat', 'noun'],
  ['南口', 'みなみぐち', 'minamiguchi', 'Pintu selatan', 'noun'],
  ['北口', 'きたぐち', 'kitaguchi', 'Pintu utara', 'noun'],
  ['中央口', 'ちゅうおうぐち', 'chuuouguchi', 'Pintu tengah', 'noun'],
  ['売店', 'ばいてん', 'baiten', 'Kios', 'noun'],
  ['タクシー乗り場', 'たくしーのりば', 'takushiinoriba', 'Pangkalan taksi', 'noun'],
  ['バス停', 'ばすてい', 'basutei', 'Halte bus', 'noun'],
  ['特急', 'とっきゅう', 'tokkyuu', 'Kereta super ekspres', 'noun'],
  ['電気辞書', 'でんきじしょ', 'denkijisho', 'Kamus elektronik', 'noun'],
  ['公務員', 'こうむいん', 'koumuin', 'Pegawai negeri', 'noun'],
  ['駅員', 'えきいん', 'ekiin', 'Petugas stasiun', 'noun'],
  ['店員', 'てんいん', 'tenin', 'Pelayan toko', 'noun'],
  ['調理師', 'ちょうりし', 'chourishi', 'Juru masak', 'noun'],
  ['理容師', 'りようし', 'riyoushi', 'Tukang cukur', 'noun'],
  ['美容師', 'びようし', 'biyoushi', 'Penata rambut', 'noun'],
  ['弁護士', 'べんごし', 'bengoshi', 'Pengacara', 'noun'],
  ['看護師', 'かんごし', 'kangoshi', 'Perawat', 'noun'],
  ['警察官', 'けいさつかん', 'keisatsukan', 'Polisi', 'noun'],
  ['外交官', 'がいこうかん', 'gaikoukan', 'Diplomat', 'noun'],
  ['政治家', 'せいじか', 'seijika', 'Politikus', 'noun'],
  ['画家', 'がか', 'gaka', 'Pelukis', 'noun'],
  ['作家', 'さっか', 'sakka', 'Penulis', 'noun'],
  ['音楽家', 'おんがくか', 'ongakuka', 'Musisi', 'noun'],
  ['建築家', 'けんちくか', 'kenchikuka', 'Arsitek', 'noun'],
  ['歌手', 'かしゅ', 'kashu', 'Penyanyi', 'noun'],
  ['俳優', 'はいゆう', 'haiyuu', 'Aktor', 'noun'],
  ['お引き出しですか', 'おひきだしですか', 'ohikidashidesuka', 'Mau tarik tunai?', 'other'],
  ['次に', 'つぎに', 'tsugini', 'Selanjutnya', 'noun'],
  ['暗証番号', 'あんしょうばんごう', 'anshoubangou', 'Nomor PIN', 'noun'],
  ['金額', 'きんがく', 'kingaku', 'Jumlah uang', 'noun'],
  ['痛いです', 'いたいです', 'itaidesu', 'Sakit', 'other'],
  ['血が出ます', 'ちがでます', 'chigademasu', 'Berdarah', 'verb'],
  ['吐き気がします', 'はきけがします', 'hakikegashimasu', 'Mual', 'verb'],
  ['食欲がありません', 'しょくよくがありません', 'shokuyokugaarimasen', 'Tidak nafsu makan', 'other'],
  ['肩がこります', 'かたがこります', 'katagakorimasu', 'Bahu pegal', 'verb'],
  ['体がだるい', 'からだがだるい', 'karadagadarui', 'Badan lemas', 'noun'],
  ['骨', 'ほね', 'hone', 'Tulang', 'noun'],
  ['盲腸', 'もうちょう', 'mouchou', 'Usus buntu', 'noun'],
  ['ぎっくり腰', 'ぎっくりごし', 'gikkurigoshi', 'Pinggang keseleo', 'noun'],
  ['骨折', 'こっせつ', 'kossetsu', 'Patah tulang', 'noun'],
  ['本当ですか', 'ほんとうですか', 'hontoudesuka', 'Benar?', 'other'],
  ['飛び込みます', 'とびこみます', 'tobikomimasu', 'Melompat masuk', 'verb'],
  ['逆立ちします', 'さかだちします', 'sakadachishimasu', 'Berdiri dengan tangan', 'verb'],
  ['持ち上げます', 'もちあげます', 'mochiagemasu', 'Mengangkat', 'verb'],
  ['転びます', 'ころびます', 'korobimasu', 'Terjatuh', 'verb'],
  ['振り向きます', 'ふりむきます', 'furimukimasu', 'Menoleh', 'verb'],
  ['伝統文化', 'でんとうぶんか', 'dentoubunka', 'Budaya tradisional', 'noun'],
  ['娯楽', 'ごらく', 'goraku', 'Hiburan', 'noun'],
  ['能', 'のう', 'nou', 'Teater Noh', 'noun'],
  ['文楽', 'ぶんらく', 'bunraku', 'Teater Bunraku', 'noun'],
  ['漫才', 'まんざい', 'manzai', 'Komedi berpasangan', 'noun'],
  ['落語', 'らくご', 'rakugo', 'Komedi monolog', 'noun'],
  ['囲碁', 'いご', 'igo', 'Catur go', 'noun'],
  ['将棋', 'しょうぎ', 'shougi', 'Catur shogi', 'noun'],
  ['久しぶりですね', 'ひさしぶりですね', 'hisashiburidesune', 'Lama tak jumpa', 'other'],
  ['もう帰らないと', 'もうかえらないと', 'moukaeranaito', 'Harus pulang', 'noun'],
  ['役職名', 'やくしょくめい', 'yakushokumei', 'Nama jabatan', 'noun'],
  ['村', 'むら', 'mura', 'Desa', 'noun'],
  ['知事', 'ちじ', 'chiji', 'Gubernur', 'noun'],
  ['市長', 'しちょう', 'shichou', 'Wali kota', 'noun'],
  ['町長', 'ちょうちょう', 'chouchou', 'Kepala kota', 'noun'],
  ['村長', 'そんちょう', 'sonchou', 'Kepala desa', 'noun'],
  ['学長', 'がくちょう', 'gakuchou', 'Rektor', 'noun'],
  ['校長', 'こうちょう', 'kouchou', 'Kepala sekolah', 'noun'],
  ['園長', 'えんちょう', 'enchou', 'Kepala taman kanak-kanak', 'noun'],
  ['会長', 'かいちょう', 'kaichou', 'Ketua', 'noun'],
  ['重役', 'じゅうやく', 'juuyaku', 'Direktur', 'noun'],
  ['院長', 'いんちょう', 'inchou', 'Kepala rumah sakit', 'noun'],
  ['看護師長', 'かんごしちょう', 'kangoshichou', 'Kepala perawat', 'noun'],
  ['頭取', 'とうどり', 'toudori', 'Presiden bank', 'noun'],
  ['支店長', 'してんちょう', 'shitenchou', 'Kepala cabang', 'noun'],
  ['駅長', 'えきちょう', 'ekichou', 'Kepala stasiun', 'noun'],
  ['署長', 'しょちょう', 'shochou', 'Kepala kepolisian', 'noun'],
  ['お弁当', 'おべんとう', 'obentou', 'Bekal makan', 'noun'],
  ['お探しですか', 'おさがしですか', 'osagashidesuka', 'Sedang mencari?', 'other'],
  ['万里の長城', 'ばんりのちょうじょう', 'banrinochoujou', 'Tembok Besar China', 'noun'],
  ['衣服', 'いふく', 'ifuku', 'Pakaian', 'noun'],
  ['手袋', 'てぶくろ', 'tebukuro', 'Sarung tangan', 'noun'],
  ['帯', 'おび', 'obi', 'Ikat pinggang kimono', 'noun'],
  ['建物', 'たてもの', 'tatemono', 'Bangunan', 'noun'],
  ['通り', 'どおり', 'doori', 'Jalan', 'noun'],
  ['一方通行', 'いっぽうつうこう', 'ippoutsuukou', 'Jalan satu arah', 'noun'],
  ['駐車禁止', 'ちゅうしゃきんし', 'chuushakinshi', 'Dilarang parkir', 'noun'],
  ['右折禁止', 'うせつきんし', 'usetsukinshi', 'Dilarang belok kanan', 'noun'],
  ['贈答の習慣', 'ぞうとうのしゅうかん', 'zoutounoshuukan', 'Kebiasaan memberi hadiah', 'noun'],
  ['お年玉', 'おとしだま', 'otoshidama', 'Angpao tahun baru', 'noun'],
  ['入学祝い', 'にゅうがくいわい', 'nyuugakuiwai', 'Hadiah masuk sekolah', 'noun'],
  ['結婚祝い', 'けっこんいわい', 'kekkoniwai', 'Hadiah pernikahan', 'noun'],
  ['出産祝い', 'しゅっさんいわい', 'shussaniwai', 'Hadiah kelahiran', 'noun'],
  ['お香典', 'おこうでん', 'okouden', 'Uang duka', 'noun'],
  ['卒業祝い', 'そつぎょういわい', 'sotsugyouiwai', 'Hadiah kelulusan', 'noun'],
  ['色々お世話になりました', 'いろいろおせわになりました', 'iroiroosewaninarimashita', 'Terima kasih atas segalanya', 'noun'],
  ['人の一生', 'ひとのいっしょう', 'hitonoisshou', 'Kehidupan seseorang', 'noun'],
  ['赤ちゃん', 'あかちゃん', 'akachan', 'Bayi', 'noun'],
  ['青年', 'せいねん', 'seinen', 'Pemuda', 'noun'],
  ['中年', 'ちゅうねん', 'chuunen', 'Usia menengah', 'noun'],
  ['老人', 'ろうじん', 'roujin', 'Lansia', 'noun'],
  ['保育園', 'ほいくえん', 'hoikuen', 'Taman asuhan', 'noun'],
  ['専門学校', 'せんもんがっこう', 'senmongakkou', 'Sekolah kejuruan', 'noun'],
  ['学校を出ます', 'がっこうをでます', 'gakkouodemasu', 'Lulus sekolah', 'verb'],
  ['再婚します', 'さいこんします', 'saikonshimasu', 'Menikah lagi', 'verb'],
  ['仕事やめます', 'しごとやめます', 'shigotoyamemasu', 'Berhenti kerja', 'verb'],
];

export const N5_KATA: readonly KotobaN5[] = KOLOM.map(([k, h, r, id, pos]) => ({ b: 0 as const, k, h, r, id, pos }));

/** Jumlah kata — dipakai kop halaman dan tes. */
export const JUMLAH_N5: number = N5_KATA.length;
