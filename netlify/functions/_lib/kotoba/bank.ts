/**
 * _lib/kotoba/bank.ts — bank kosakata Minna no Nihongo (Bab 1–25) untuk
 * minigame `/kotoba`.
 *
 * ASAL DATA
 * ---------
 * Dipindahkan 2026-10-27 dari minigame mandiri milik pemilik (`GAME.html`).
 * Isinya 216 kosakata pilihan dari 25 bab — BUKAN seluruh kosakata Minna
 * (satu bab aslinya ±40 kata). Karena itu salinan UI menyebut "kosakata
 * pilihan", bukan "lengkap": klaim berlebih pada materi belajar membuat siswa
 * mengira sudah menghafal semuanya.
 *
 * KENAPA DI SINI, BUKAN DI KLIEN
 * ------------------------------
 * Gerbang "khusus siswa ASJ" harus NYATA. Kalau bank dikirim sebagai bagian
 * bundel JS, siapa pun bisa membacanya tanpa sesi dan gerbangnya hanya kosmetik
 * — persis yang tidak boleh terjadi pada `/wawancara` (lihat `tolakKecualiSiswa`
 * di `surfaces/ai.ts`). Jadi bank hidup di sisi server dan hanya keluar lewat
 * `getBankKotoba` yang dijaga penjaga yang sama.
 *
 * BENTUK RINGKAS
 * --------------
 * Tabelnya array-of-tuple, bukan array objek. 216 baris objek berarti ~5 KB
 * nama kunci berulang (`b:`, `pos:`, `k:` …) yang ikut di-bundle ke entry
 * `ai-chat` dan dibayar setiap cold start. Urutan kolomnya dikunci di
 * `KolomKotoba` di bawah — jangan diubah tanpa mengubah `keKotoba()`.
 */

/** Jenis kata. Nilainya dipakai sebagai kunci filter di klien. */
export type JenisKata = 'verb' | 'adj' | 'noun' | 'other';

/** Satu kosakata dalam bentuk yang dikirim ke klien. */
export interface Kotoba {
  /** Bab Minna no Nihongo (1–25). */
  b: number;
  pos: JenisKata;
  /** Tulisan kanji/katakana/hiragana seperti tertulis di buku. */
  k: string;
  /** Cara baca hiragana. */
  h: string;
  /** Romaji — dipakai mode ketik dan pencarian. */
  r: string;
  /** Arti Bahasa Indonesia. */
  id: string;
}

/**
 * Urutan kolom tuple: [bab, jenis, kanji, hiragana, romaji, arti].
 *
 * `satisfies` dipakai supaya salah urutan/tipe ketahuan saat typecheck, bukan
 * saat siswa melihat "Saya" di tempat cara baca.
 */
type KolomKotoba = readonly [number, JenisKata, string, string, string, string];

const RAW = [
  // ── BAB 1
  [1, 'noun', '私', 'わたし', 'watashi', 'Saya'],
  [1, 'noun', '学生', 'がくせい', 'gakusei', 'Pelajar / Mahasiswa'],
  [1, 'noun', '先生', 'せんせい', 'sensei', 'Guru / Dosen'],
  [1, 'noun', '会社員', 'かいしゃいん', 'kaishain', 'Pegawai perusahaan'],
  [1, 'noun', '医者', 'いしゃ', 'isha', 'Dokter'],
  [1, 'noun', '研究者', 'けんきゅうしゃ', 'kenkyuusha', 'Peneliti'],
  [1, 'noun', '病院', 'びょういん', 'byouin', 'Rumah sakit'],
  [1, 'other', '誰', 'だれ', 'dare', 'Siapa'],
  [1, 'other', '何歳', 'なんさい', 'nansai', 'Berapa umur'],
  // ── BAB 2
  [2, 'other', 'これ', 'これ', 'kore', 'Ini (dekat pembicara)'],
  [2, 'other', 'それ', 'それ', 'sore', 'Itu (dekat lawan bicara)'],
  [2, 'other', 'あれ', 'あれ', 'are', 'Itu (jauh dari keduanya)'],
  [2, 'noun', '本', 'ほん', 'hon', 'Buku'],
  [2, 'noun', '辞書', 'じしょ', 'jisho', 'Kamus'],
  [2, 'noun', '雑誌', 'ざっし', 'zasshi', 'Majalah'],
  [2, 'noun', '新聞', 'しんぶん', 'shinbun', 'Koran'],
  [2, 'noun', '鍵', 'かぎ', 'kagi', 'Kunci'],
  [2, 'noun', '時計', 'とけい', 'tokei', 'Jam tangan / Arloji'],
  [2, 'noun', '傘', 'かさ', 'kasa', 'Payung'],
  [2, 'noun', '車', 'くるま', 'kuruma', 'Mobil'],
  // ── BAB 3
  [3, 'other', 'ここ', 'ここ', 'koko', 'Di sini'],
  [3, 'other', 'どこ', 'どこ', 'doko', 'Di mana'],
  [3, 'noun', '教室', 'きょうしつ', 'kyoushitsu', 'Ruang kelas'],
  [3, 'noun', '食堂', 'しょくどう', 'shokudou', 'Kantin / Tempat makan'],
  [3, 'noun', '事務所', 'じむしょ', 'jimusho', 'Kantor'],
  [3, 'noun', '受付', 'うけつけ', 'uketsuke', 'Meja resepsionis'],
  [3, 'noun', '部屋', 'へや', 'heya', 'Kamar'],
  [3, 'noun', '国', 'くに', 'kuni', 'Negara'],
  [3, 'other', '幾ら', 'いくら', 'ikura', 'Berapa harganya'],
  // ── BAB 4
  [4, 'verb', '起きます', 'おきます', 'okimasu', 'Bangun tidur'],
  [4, 'verb', '寝ます', 'ねます', 'nemasu', 'Tidur'],
  [4, 'verb', '働きます', 'はたらきます', 'hatarakimasu', 'Bekerja'],
  [4, 'verb', '休みます', 'やすみます', 'yasumimasu', 'Beristirahat / Cuti'],
  [4, 'verb', '勉強します', 'べんきょうします', 'benkyoushimasu', 'Belajar'],
  [4, 'verb', '終わります', 'おわります', 'owarimasu', 'Selesai / Berakhir'],
  [4, 'noun', '今', 'いま', 'ima', 'Sekarang'],
  [4, 'noun', '朝', 'あさ', 'asa', 'Pagi'],
  [4, 'noun', '昼', 'ひる', 'hiru', 'Siang'],
  [4, 'noun', '晩', 'ばん', 'ban', 'Malam'],
  [4, 'noun', '昨日', 'きのう', 'kinou', 'Kemarin'],
  [4, 'noun', '明日', 'あした', 'ashita', 'Besok'],
  // ── BAB 5
  [5, 'verb', '行きます', 'いきます', 'ikimasu', 'Pergi'],
  [5, 'verb', '来ます', 'きます', 'kimasu', 'Datang'],
  [5, 'verb', '帰ります', 'かえります', 'kaerimasu', 'Pulang'],
  [5, 'noun', '飛行機', 'ひこうき', 'hikouki', 'Pesawat terbang'],
  [5, 'noun', '電車', 'でんしゃ', 'densha', 'Kereta listrik'],
  [5, 'noun', '地下鉄', 'ちかてつ', 'chikatetsu', 'Kereta bawah tanah'],
  [5, 'noun', '自転車', 'じてんしゃ', 'jitensha', 'Sepeda'],
  [5, 'other', '歩いて', 'あるいて', 'aruite', 'Jalan kaki'],
  [5, 'noun', '友達', 'ともだち', 'tomodachi', 'Teman'],
  // ── BAB 6
  [6, 'verb', '食べます', 'たべます', 'tabemasu', 'Makan'],
  [6, 'verb', '飲みます', 'のみます', 'nomimasu', 'Minum'],
  [6, 'verb', '見ます', 'みます', 'mimasu', 'Melihat / Menonton'],
  [6, 'verb', '聞きます', 'ききます', 'kikimasu', 'Mendengarkan'],
  [6, 'verb', '読みます', 'よみます', 'yomimasu', 'Membaca'],
  [6, 'verb', '書きます', 'かきます', 'kakimasu', 'Menulis'],
  [6, 'verb', '買います', 'かいます', 'kaimasu', 'Membeli'],
  [6, 'verb', '撮ります', 'とります', 'torimasu', 'Mengambil (foto)'],
  [6, 'noun', '魚', 'さかな', 'sakana', 'Ikan'],
  [6, 'noun', '野菜', 'やさい', 'yasai', 'Sayuran'],
  // ── BAB 7
  [7, 'verb', '切ります', 'きります', 'kirimasu', 'Memotong'],
  [7, 'verb', '送ります', 'おくります', 'okurimasu', 'Mengirim'],
  [7, 'verb', 'あげます', 'あげます', 'agemasu', 'Memberi (ke orang lain)'],
  [7, 'verb', 'もらいます', 'もらいます', 'moraimasu', 'Menerima'],
  [7, 'verb', '貸します', 'かします', 'kashimasu', 'Meminjamkan'],
  [7, 'verb', '借ります', 'かります', 'karimasu', 'Meminjam'],
  [7, 'verb', '教えます', 'おしえます', 'oshiemasu', 'Mengajar / Memberitahu'],
  [7, 'verb', '習います', 'ならいます', 'naraimasu', 'Belajar (dari orang)'],
  [7, 'noun', '鋏', 'はさみ', 'hasami', 'Gunting'],
  [7, 'noun', '箸', 'はし', 'hashi', 'Sumpit'],
  // ── BAB 8
  [8, 'adj', '綺麗[な]', 'きれい[な]', 'kirei[na]', 'Cantik / Bersih'],
  [8, 'adj', '静か[な]', 'しずか[な]', 'shizuka[na]', 'Tenang / Sunyi'],
  [8, 'adj', '賑やか[な]', 'にぎやか[な]', 'nigiyaka[na]', 'Ramai'],
  [8, 'adj', '有名[な]', 'ゆうめい[な]', 'yuumei[na]', 'Terkenal'],
  [8, 'adj', '親切[な]', 'しんせつ[な]', 'shinsetsu[na]', 'Ramah / Baik'],
  [8, 'adj', '便利[な]', 'べんり[な]', 'benri[na]', 'Praktis'],
  [8, 'adj', '新しい', 'あたらしい', 'atarashii', 'Baru'],
  [8, 'adj', '古い', 'ふるい', 'furui', 'Lama / Kuno'],
  [8, 'adj', '暑い', 'あつい', 'atsui', 'Panas (cuaca)'],
  [8, 'adj', '寒い', 'さむい', 'samui', 'Dingin (cuaca)'],
  [8, 'adj', '冷たい', 'つめたい', 'tsumetai', 'Dingin (benda)'],
  [8, 'adj', '難しい', 'むずかしい', 'muzukashii', 'Sukar / Sulit'],
  [8, 'adj', '易しい', 'やさしい', 'yasashii', 'Mudah / Gampang'],
  // ── BAB 9
  [9, 'verb', '分かります', 'わかります', 'wakarimasu', 'Mengerti / Paham'],
  [9, 'verb', 'あります', 'あります', 'arimasu', 'Ada (benda mati)'],
  [9, 'adj', '好き[な]', 'すき[な]', 'suki[na]', 'Suka'],
  [9, 'adj', '嫌い[な]', 'きらい[な]', 'kirai[na]', 'Benci / Tidak suka'],
  [9, 'adj', '上手[な]', 'じょうず[な]', 'jouzu[na]', 'Pandai / Mahir'],
  [9, 'adj', '下手[な]', 'へた[な]', 'heta[na]', 'Kurang mahir'],
  [9, 'noun', '料理', 'りょうり', 'ryouri', 'Masakan'],
  [9, 'noun', '時間', 'じかん', 'jikan', 'Waktu'],
  [9, 'noun', '用事', 'ようじ', 'youji', 'Urusan kerjaan'],
  // ── BAB 10
  [10, 'verb', 'います', 'います', 'imasu', 'Ada (makhluk hidup)'],
  [10, 'noun', '上', 'うえ', 'ue', 'Atas'],
  [10, 'noun', '下', 'した', 'shita', 'Bawah'],
  [10, 'noun', '前', 'まえ', 'mae', 'Depan'],
  [10, 'noun', '後ろ', 'うしろ', 'ushiro', 'Belakang'],
  [10, 'noun', '右', 'みぎ', 'migi', 'Kanan'],
  [10, 'noun', '左', 'ひだり', 'hidari', 'Kiri'],
  [10, 'noun', '中', 'なか', 'naka', 'Dalam'],
  [10, 'noun', '隣', 'となり', 'tonari', 'Sebelah / Berdampingan'],
  // ── BAB 11
  [11, 'noun', '一つ', 'ひとつ', 'hitotsu', 'Satu buah'],
  [11, 'noun', '二つ', 'ふたつ', 'futatsu', 'Dua buah'],
  [11, 'noun', '一人', 'ひとり', 'hitori', 'Satu orang'],
  [11, 'noun', '二人', 'ふたり', 'futari', 'Dua orang'],
  [11, 'noun', '切手', 'きって', 'kitte', 'Prangko'],
  [11, 'noun', '封筒', 'ふうとう', 'fuutou', 'Amplop'],
  [11, 'other', 'どのくらい', 'どのくらい', 'donokurai', 'Berapa lama / banyak'],
  // ── BAB 12
  [12, 'adj', '簡単[な]', 'かんたん[な]', 'kantan[na]', 'Mudah / Sederhana'],
  [12, 'adj', '近い', 'ちかい', 'chikai', 'Dekat'],
  [12, 'adj', '遠い', 'とおい', 'tooi', 'Jauh'],
  [12, 'adj', '速い', 'はやい', 'hayai', 'Cepat'],
  [12, 'adj', '遅い', 'おそい', 'osoi', 'Lambat'],
  [12, 'adj', '多い', 'おおい', 'ooi', 'Banyak'],
  [12, 'adj', '少ない', 'すくない', 'sukunai', 'Sedikit'],
  [12, 'adj', '暖かい', 'あたたかい', 'atatakai', 'Hangat'],
  [12, 'adj', '涼しい', 'すずしい', 'suzushii', 'Sejuk'],
  // ── BAB 13
  [13, 'verb', '遊びます', 'あそびます', 'asobimasu', 'Bermain / Bersenang-senang'],
  [13, 'verb', '泳ぎます', 'およぎます', 'oyogimasu', 'Berenang'],
  [13, 'verb', '迎えます', 'むかえます', 'mukaemasu', 'Menjemput'],
  [13, 'verb', '疲れます', 'つかれます', 'tsukaremasu', 'Lelah / Capek'],
  [13, 'adj', '欲しい', 'ほしい', 'hoshii', 'Ingin (suatu barang)'],
  [13, 'adj', '広い', 'ひろい', 'hiroi', 'Luas'],
  [13, 'adj', '狭い', 'せまい', 'semai', 'Sempit'],
  // ── BAB 14
  [14, 'verb', '点けます', 'つけます', 'tsukemasu', 'Menyalakan (alat/lampu)'],
  [14, 'verb', '消します', 'けします', 'keshimasu', 'Mematikan / Memadamkan'],
  [14, 'verb', '開けます', 'あけます', 'akemasu', 'Membuka'],
  [14, 'verb', '閉めます', 'しめます', 'shimemasu', 'Menutup'],
  [14, 'verb', '急ぎます', 'いそぎます', 'isogimasu', 'Buru-buru / Lekas'],
  [14, 'verb', '待ちます', 'まちます', 'machimasu', 'Menunggu'],
  [14, 'verb', '止めます', 'とめます', 'tomemasu', 'Menghentikan'],
  [14, 'verb', '手伝います', 'てつだいます', 'tetsudaimasu', 'Membantu'],
  [14, 'verb', '呼びます', 'よびます', 'yobimasu', 'Memanggil'],
  // ── BAB 15
  [15, 'verb', '立ちます', 'たちます', 'tachimasu', 'Berdiri'],
  [15, 'verb', '座ります', 'すわります', 'suwarimasu', 'Duduk'],
  [15, 'verb', '使います', 'つかいます', 'tsukaimasu', 'Menggunakan'],
  [15, 'verb', '置きます', 'おきます', 'okimasu', 'Meletakkan'],
  [15, 'verb', '作ります', 'つくります', 'tsukurimasu', 'Membuat'],
  [15, 'verb', '売ります', 'うります', 'urimasu', 'Menjual'],
  [15, 'verb', '知ります', 'しります', 'shirimasu', 'Mengetahui / Kenal'],
  [15, 'verb', '住みます', 'すみます', 'sumimasu', 'Tinggal / Menetap'],
  // ── BAB 16
  [16, 'verb', '乗ります', 'のります', 'norimasu', 'Naik kendaraan'],
  [16, 'verb', '降ります', 'おります', 'orimasu', 'Turun kendaraan'],
  [16, 'verb', '乗り換えます', 'のりかえます', 'norikaemasu', 'Ganti kendaraan / Transit'],
  [16, 'verb', '浴びます', 'あびます', 'abimasu', 'Mandi (shower)'],
  [16, 'verb', '入れます', 'いれます', 'iremasu', 'Memasukkan'],
  [16, 'verb', '出します', 'だします', 'dashimasu', 'Mengeluarkan / Tarik uang'],
  [16, 'verb', '押します', 'おします', 'oshimasu', 'Menekan / Mendorong'],
  [16, 'adj', '若い', 'わかい', 'wakai', 'Muda'],
  [16, 'adj', '長い', 'ながい', 'nagai', 'Panjang'],
  [16, 'adj', '明るい', 'あかるい', 'akarui', 'Terang'],
  [16, 'adj', '暗い', 'くらい', 'kurai', 'Gelap'],
  // ── BAB 17
  [17, 'verb', '覚えます', 'おぼえます', 'oboemasu', 'Mengingat / Menghafal'],
  [17, 'verb', '忘れます', 'わすれます', 'wasuremasu', 'Lupa'],
  [17, 'verb', '無くします', 'なくします', 'nakushimasu', 'Kehilangan'],
  [17, 'verb', '払います', 'はらいます', 'haraimasu', 'Membayar'],
  [17, 'verb', '返します', 'かえします', 'kaeshimasu', 'Mengembalikan'],
  [17, 'verb', '脱ぎます', 'ぬぎます', 'nugimasu', 'Membuka pakaian / sepatu'],
  [17, 'verb', '心配します', 'しんぱいします', 'shinpaishimasu', 'Khawatir'],
  [17, 'adj', '危ない', 'あぶない', 'abunai', 'Berbahaya'],
  [17, 'adj', '大切[な]', 'たいせつ[な]', 'taisetsu[na]', 'Penting / Berharga'],
  // ── BAB 18
  [18, 'verb', 'できます', 'できます', 'dekimasu', 'Bisa / Mampu'],
  [18, 'verb', '洗います', 'あらいます', 'araimasu', 'Mencuci'],
  [18, 'verb', '弾きます', 'ひきます', 'hikimasu', 'Memainkan alat musik'],
  [18, 'verb', '歌います', 'うたいます', 'utaimasu', 'Menyanyi'],
  [18, 'verb', '集めます', 'あつめます', 'atsumemasu', 'Mengumpulkan'],
  [18, 'verb', '捨てます', 'すてます', 'sutemasu', 'Membuang'],
  [18, 'verb', '運転します', 'うんてんします', 'untenshimasu', 'Menyetir kendaraan'],
  [18, 'noun', '趣味', 'しゅみ', 'shumi', 'Hobi'],
  // ── BAB 19
  [19, 'verb', '登ります', 'のぼります', 'noborimasu', 'Mendaki gunung'],
  [19, 'verb', '泊まります', 'とまります', 'tomarimasu', 'Menginap di hotel'],
  [19, 'verb', '掃除します', 'そうじします', 'soujishimasu', 'Membersihkan ruangan'],
  [19, 'verb', '洗濯します', 'せんたくします', 'sentakushimasu', 'Mencuci pakaian'],
  [19, 'verb', '練習します', 'れんしゅうします', 'renshuushimasu', 'Berlatih'],
  [19, 'adj', '眠い', 'ねむい', 'nemui', 'Mengantuk'],
  [19, 'adj', '強い', 'つよい', 'tsuyoi', 'Kuat'],
  [19, 'adj', '弱い', 'よわい', 'yowai', 'Lemah'],
  // ── BAB 20
  [20, 'verb', '要ります', 'いります', 'irimasu', 'Memerlukan / Butuh'],
  [20, 'verb', '調べます', 'しらべます', 'shirabemasu', 'Mengecek / Meneliti'],
  [20, 'verb', '直します', 'なおします', 'naoshimasu', 'Memperbaiki'],
  [20, 'noun', '言葉', 'ことば', 'kotoba', 'Kosakata / Bahasa'],
  [20, 'noun', '物価', 'ぶっか', 'bukka', 'Harga kebutuhan'],
  // ── BAB 21
  [21, 'verb', '思います', 'おもいます', 'omoimasu', 'Berpikir / Mengira'],
  [21, 'verb', '言います', 'いいます', 'iimasu', 'Berkata'],
  [21, 'verb', '足ります', 'たります', 'tarimasu', 'Cukup'],
  [21, 'verb', '勝ちます', 'かちます', 'kachimasu', 'Menang'],
  [21, 'verb', '負けます', 'まけます', 'makemasu', 'Kalah'],
  [21, 'verb', '役に立ちます', 'やくにたちます', 'yakunitachimasu', 'Berguna / Bermanfaat'],
  [21, 'adj', '無駄[な]', 'むだ[な]', 'muda[na]', 'Sia-sia / Percuma'],
  [21, 'noun', '意見', 'いけん', 'iken', 'Pendapat'],
  // ── BAB 22
  [22, 'verb', '着ます', 'きます', 'kimasu', 'Memakai baju atas / kemeja'],
  [22, 'verb', '履きます', 'はきます', 'hakimasu', 'Memakai sepatu / celana'],
  [22, 'verb', '被ります', 'かぶります', 'kaburimasu', 'Memakai topi'],
  [22, 'verb', '掛けます', 'かけます', 'kakemasu', 'Memakai kacamata'],
  [22, 'verb', '生まれます', 'うまれます', 'umaremasu', 'Lahir'],
  [22, 'noun', '帽子', 'ぼうし', 'boushi', 'Topi'],
  [22, 'noun', '眼鏡', 'めがね', 'megane', 'Kacamata'],
  // ── BAB 23
  [23, 'verb', '回します', 'まわします', 'mawashimasu', 'Memutar knop'],
  [23, 'verb', '引きます', 'ひきます', 'hikimasu', 'Menarik'],
  [23, 'verb', '変えます', 'かえます', 'kaemasu', 'Mengubah'],
  [23, 'verb', '触ります', 'さわります', 'sawarimasu', 'Menyentuh'],
  [23, 'verb', '渡ります', 'わたります', 'watarimasu', 'Menyeberang jalan'],
  [23, 'verb', '曲がります', 'まがります', 'magarimasu', 'Belok (arah)'],
  [23, 'noun', '交差点', 'こうさてん', 'kousaten', 'Perempatan jalan'],
  [23, 'noun', '橋', 'はし', 'hashi', 'Jembatan'],
  // ── BAB 24
  [24, 'verb', 'くれます', 'くれます', 'kuremasu', 'Memberi (kepada saya)'],
  [24, 'verb', '連れて行きます', 'つれていきます', 'tsureteikimasu', 'Mengajak pergi'],
  [24, 'verb', '連れて来ます', 'つれてきます', 'tsuretekimasu', 'Mengajak datang'],
  [24, 'verb', '案内します', 'あんないします', 'annaishimasu', 'Memandu arah'],
  [24, 'verb', '説明します', 'せつめいします', 'setsumeishimasu', 'Menjelaskan detail'],
  [24, 'noun', '準備', 'じゅんび', 'junbi', 'Persiapan'],
  // ── BAB 25
  [25, 'verb', '考えます', 'かんがえます', 'kangaemasu', 'Memikirkan'],
  [25, 'verb', '着きます', 'つきます', 'tsukimasu', 'Tiba di tujuan'],
  [25, 'noun', '田舎', 'いなか', 'inaka', 'Desa / Kampung halaman'],
  [25, 'other', 'もし', 'もし', 'moshi', 'Kalau / Seandainya'],
  [25, 'verb', '頑張ります', 'がんばります', 'ganbarimasu', 'Berjuang sungguh-sungguh'],] as const satisfies readonly KolomKotoba[];

/** Tuple → objek. Satu-satunya tempat urutan kolom `RAW` diartikan. */
function keKotoba(t: KolomKotoba): Kotoba {
  return { b: t[0], pos: t[1], k: t[2], h: t[3], r: t[4], id: t[5] };
}

/**
 * Bank lengkap, sudah dalam bentuk objek.
 *
 * Dibangun sekali per proses (modul dievaluasi sekali per lambda instance),
 * bukan per permintaan — 216 pemetaan objek tidak mahal, tapi tidak ada
 * gunanya diulang setiap kali siswa membuka halaman.
 */
export const BANK_KOTOBA: readonly Kotoba[] = RAW.map(keKotoba);

/**
 * Daftar bab yang benar-benar punya isi.
 *
 * Diturunkan dari data, bukan ditulis `1..25`: kalau suatu saat sebuah bab
 * dikosongkan, pemilih bab tidak boleh tetap menawarkannya dan menjawab
 * "tidak ada kata".
 */
export const BAB_KOTOBA: readonly number[] = [...new Set(BANK_KOTOBA.map((x) => x.b))].sort((a, b) => a - b);

/** Jumlah kosakata — dipakai kop halaman dan lembar cetak. */
export const JUMLAH_KOTOBA: number = BANK_KOTOBA.length;
