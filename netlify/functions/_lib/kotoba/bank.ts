/**
 * _lib/kotoba/bank.ts — bank kosakata Minna no Nihongo (Bab 1–25) untuk
 * minigame `/kotoba`.
 *
 * ASAL DATA
 * ---------
 * 216 kosakata pertama dipindahkan 2026-10-27 dari minigame mandiri milik
 * pemilik (`GAME.html`); 216 berikutnya ditambahkan pada hari yang sama atas
 * permintaan pemilik ("banyakin yg tetap dalam tatabahasa minna no nihonggo
 * bab 1-25"), tetap di dalam lingkup Bab 1–25 dan tema tiap bab.
 *
 * Seluruhnya 432 kosakata. Ini BUKAN seluruh Minna I (satu bab aslinya ±40
 * kata, jadi Bab 1–25 berisi ±1.400 kata) — karena itu salinan UI menyebut
 * "kosakata pilihan", bukan "lengkap": klaim berlebih pada materi belajar
 * membuat siswa mengira sudah menghafal semuanya.
 *
 * CARA MEMERIKSA TAMBAHAN (jangan tambah kata tanpa ini)
 * -----------------------------------------------------
 * Setiap baris baru diperiksa dengan konverter kana→romaji yang ditulis
 * terpisah: cara baca (kolom `h`) diubah ke romaji lalu dibandingkan dengan
 * kolom `r`. Tiga kesalahan tertangkap dengan cara itu sebelum masuk
 * (`宝くじ` sempat tertulis たくじ, `フォーク` butuh ふぉ, satu arti dobel
 * dengan `引きます`). Menambah kata dengan membaca sekilas jauh lebih mudah
 * salah daripada menambah baris kode — periksa, jangan percaya mata.
 *
 * Satu pengecualian yang disengaja: `サンドイッチ` ditulis `sandoitchi`
 * (Hepburn baku), bukan `sandoicchi` yang dihasilkan konverter secara
 * harfiah. `normalRomaji()` di `KotobaGame` menyamakan keduanya, jadi siswa
 * yang mengetik versi mana pun dinilai benar.
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
 * Tabelnya array-of-tuple, bukan array objek. 432 baris objek berarti ~10 KB
 * nama kunci berulang (`b:`, `pos:`, `k:` …) yang ikut di-bundle ke entry
 * `ai-chat` dan dibayar setiap cold start. Urutan kolomnya dikunci di
 * `KolomKotoba` di bawah — jangan diubah tanpa mengubah `keKotoba()`.
 *
 * Sebaran per bab: 1:22 2:28 3:21 4:30 5:14 6:23 7:21 8:33 9:16 10:22 11:18 12:20 13:14 14:13 15:14 16:19 17:16 18:13 19:10 20:8 21:11 22:14 23:13 24:9 25:10
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
  [1, 'noun', '教師', 'きょうし', 'kyoushi', 'Guru (profesi)'],
  [1, 'noun', '留学生', 'りゅうがくせい', 'ryuugakusei', 'Mahasiswa asing'],
  [1, 'noun', '大学', 'だいがく', 'daigaku', 'Universitas'],
  [1, 'noun', '会社', 'かいしゃ', 'kaisha', 'Perusahaan'],
  [1, 'noun', '銀行員', 'ぎんこういん', 'ginkouin', 'Pegawai bank'],
  [1, 'noun', 'エンジニア', 'えんじにあ', 'enjinia', 'Insinyur'],
  [1, 'noun', '日本', 'にほん', 'nihon', 'Jepang'],
  [1, 'noun', 'インドネシア', 'いんどねしあ', 'indoneshia', 'Indonesia'],
  [1, 'noun', 'アメリカ', 'あめりか', 'amerika', 'Amerika'],
  [1, 'noun', '中国', 'ちゅうごく', 'chuugoku', 'Tiongkok'],
  [1, 'other', 'あの人', 'あのひと', 'anohito', 'Orang itu'],
  [1, 'other', '初めまして', 'はじめまして', 'hajimemashite', 'Senang berkenalan'],
  [1, 'other', 'どうぞよろしく', 'どうぞよろしく', 'douzoyoroshiku', 'Mohon bantuannya'],
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
  [2, 'noun', '鉛筆', 'えんぴつ', 'enpitsu', 'Pensil'],
  [2, 'noun', '万年筆', 'まんねんひつ', 'mannenhitsu', 'Pena tinta'],
  [2, 'noun', 'ボールペン', 'ぼーるぺん', 'boorupen', 'Pulpen'],
  [2, 'noun', '消しゴム', 'けしごむ', 'keshigomu', 'Penghapus'],
  [2, 'noun', 'ノート', 'のーと', 'nooto', 'Buku catatan'],
  [2, 'noun', '手帳', 'てちょう', 'techou', 'Buku agenda'],
  [2, 'noun', '名刺', 'めいし', 'meishi', 'Kartu nama'],
  [2, 'noun', 'テレビ', 'てれび', 'terebi', 'Televisi'],
  [2, 'noun', 'ラジオ', 'らじお', 'rajio', 'Radio'],
  [2, 'noun', 'カメラ', 'かめら', 'kamera', 'Kamera'],
  [2, 'noun', 'パソコン', 'ぱそこん', 'pasokon', 'Komputer'],
  [2, 'noun', '机', 'つくえ', 'tsukue', 'Meja'],
  [2, 'noun', '椅子', 'いす', 'isu', 'Kursi'],
  [2, 'noun', 'お土産', 'おみやげ', 'omiyage', 'Oleh-oleh'],
  [2, 'noun', 'コーヒー', 'こーひー', 'koohii', 'Kopi'],
  [2, 'noun', '英語', 'えいご', 'eigo', 'Bahasa Inggris'],
  [2, 'noun', '日本語', 'にほんご', 'nihongo', 'Bahasa Jepang'],
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
  [3, 'noun', 'エレベーター', 'えれべーたー', 'erebeetaa', 'Lift'],
  [3, 'noun', 'エスカレーター', 'えすかれーたー', 'esukareetaa', 'Eskalator'],
  [3, 'noun', '自動販売機', 'じどうはんばいき', 'jidouhanbaiki', 'Mesin penjual otomatis'],
  [3, 'noun', '電話', 'でんわ', 'denwa', 'Telepon'],
  [3, 'noun', '靴', 'くつ', 'kutsu', 'Sepatu'],
  [3, 'noun', 'ネクタイ', 'ねくたい', 'nekutai', 'Dasi'],
  [3, 'noun', 'ワイン', 'わいん', 'wain', 'Anggur'],
  [3, 'noun', 'デパート', 'でぱーと', 'depaato', 'Toko serba ada'],
  [3, 'noun', '美術館', 'びじゅつかん', 'bijutsukan', 'Museum seni'],
  [3, 'noun', 'レストラン', 'れすとらん', 'resutoran', 'Restoran'],
  [3, 'noun', '本屋', 'ほんや', 'honya', 'Toko buku'],
  [3, 'noun', 'ビル', 'びる', 'biru', 'Gedung'],
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
  [4, 'noun', '毎朝', 'まいあさ', 'maiasa', 'Setiap pagi'],
  [4, 'noun', '毎晩', 'まいばん', 'maiban', 'Setiap malam'],
  [4, 'noun', '毎日', 'まいにち', 'mainichi', 'Setiap hari'],
  [4, 'noun', '朝ご飯', 'あさごはん', 'asagohan', 'Sarapan'],
  [4, 'noun', '昼ご飯', 'ひるごはん', 'hirugohan', 'Makan siang'],
  [4, 'noun', '晩ご飯', 'ばんごはん', 'bangohan', 'Makan malam'],
  [4, 'noun', '午前', 'ごぜん', 'gozen', 'Pagi (AM)'],
  [4, 'noun', '午後', 'ごご', 'gogo', 'Sore (PM)'],
  [4, 'noun', '先週', 'せんしゅう', 'senshuu', 'Pekan lalu'],
  [4, 'noun', '今週', 'こんしゅう', 'konshuu', 'Pekan ini'],
  [4, 'noun', '来週', 'らいしゅう', 'raishuu', 'Pekan depan'],
  [4, 'noun', '先月', 'せんげつ', 'sengetsu', 'Bulan lalu'],
  [4, 'noun', '今月', 'こんげつ', 'kongetsu', 'Bulan ini'],
  [4, 'noun', '来月', 'らいげつ', 'raigetsu', 'Bulan depan'],
  [4, 'noun', '去年', 'きょねん', 'kyonen', 'Tahun lalu'],
  [4, 'noun', '今年', 'ことし', 'kotoshi', 'Tahun ini'],
  [4, 'noun', '来年', 'らいねん', 'rainen', 'Tahun depan'],
  [4, 'noun', '試験', 'しけん', 'shiken', 'Ujian'],
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
  [5, 'noun', '新幹線', 'しんかんせん', 'shinkansen', 'Kereta cepat Shinkansen'],
  [5, 'noun', 'バス', 'ばす', 'basu', 'Bus'],
  [5, 'noun', 'タクシー', 'たくしー', 'takushii', 'Taksi'],
  [5, 'noun', '船', 'ふね', 'fune', 'Kapal'],
  [5, 'other', '一人で', 'ひとりで', 'hitoride', 'Sendirian'],
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
  [6, 'noun', '卵', 'たまご', 'tamago', 'Telur'],
  [6, 'noun', '肉', 'にく', 'niku', 'Daging'],
  [6, 'noun', 'パン', 'ぱん', 'pan', 'Roti'],
  [6, 'noun', 'お茶', 'おちゃ', 'ocha', 'Teh'],
  [6, 'noun', 'お酒', 'おさけ', 'osake', 'Minuman keras'],
  [6, 'noun', '果物', 'くだもの', 'kudamono', 'Buah'],
  [6, 'noun', '水', 'みず', 'mizu', 'Air'],
  [6, 'noun', '牛乳', 'ぎゅうにゅう', 'gyuunyuu', 'Susu'],
  [6, 'noun', 'ジュース', 'じゅーす', 'juusu', 'Jus'],
  [6, 'noun', 'お菓子', 'おかし', 'okashi', 'Kue / camilan'],
  [6, 'noun', 'ご飯', 'ごはん', 'gohan', 'Nasi / makan'],
  [6, 'noun', 'サンドイッチ', 'さんどいっち', 'sandoitchi', 'Sandwich'],
  [6, 'noun', 'たばこ', 'たばこ', 'tabako', 'Rokok'],
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
  [7, 'noun', '手紙', 'てがみ', 'tegami', 'Surat'],
  [7, 'noun', '葉書', 'はがき', 'hagaki', 'Kartu pos'],
  [7, 'noun', '小包', 'こづつみ', 'kozutsumi', 'Paket kiriman'],
  [7, 'noun', '荷物', 'にもつ', 'nimotsu', 'Barang bawaan'],
  [7, 'noun', 'お金', 'おかね', 'okane', 'Uang'],
  [7, 'noun', '切符', 'きっぷ', 'kippu', 'Karcis'],
  [7, 'noun', 'スプーン', 'すぷーん', 'supuun', 'Sendok'],
  [7, 'noun', 'フォーク', 'ふぉーく', 'fooku', 'Garpu'],
  [7, 'noun', 'ナイフ', 'ないふ', 'naifu', 'Pisau'],
  [7, 'noun', '皿', 'さら', 'sara', 'Piring'],
  [7, 'noun', 'コップ', 'こっぷ', 'koppu', 'Gelas'],
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
  [8, 'adj', '元気[な]', 'げんき[な]', 'genki[na]', 'Sehat / bersemangat'],
  [8, 'adj', '暇[な]', 'ひま[な]', 'hima[na]', 'Senggang'],
  [8, 'adj', '丈夫[な]', 'じょうぶ[な]', 'joubu[na]', 'Kokoh / kuat'],
  [8, 'adj', '大きい', 'おおきい', 'ookii', 'Besar'],
  [8, 'adj', '小さい', 'ちいさい', 'chiisai', 'Kecil'],
  [8, 'adj', '高い', 'たかい', 'takai', 'Tinggi / mahal'],
  [8, 'adj', '安い', 'やすい', 'yasui', 'Murah'],
  [8, 'adj', '低い', 'ひくい', 'hikui', 'Rendah'],
  [8, 'adj', '面白い', 'おもしろい', 'omoshiroi', 'Menarik (seru)'],
  [8, 'adj', '美味しい', 'おいしい', 'oishii', 'Lezat'],
  [8, 'adj', '忙しい', 'いそがしい', 'isogashii', 'Sibuk'],
  [8, 'adj', '楽しい', 'たのしい', 'tanoshii', 'Menyenangkan'],
  [8, 'adj', '白い', 'しろい', 'shiroi', 'Putih'],
  [8, 'adj', '黒い', 'くろい', 'kuroi', 'Hitam'],
  [8, 'adj', '赤い', 'あかい', 'akai', 'Merah'],
  [8, 'adj', '青い', 'あおい', 'aoi', 'Biru'],
  [8, 'noun', '桜', 'さくら', 'sakura', 'Bunga sakura'],
  [8, 'noun', '山', 'やま', 'yama', 'Gunung'],
  [8, 'noun', '町', 'まち', 'machi', 'Kota'],
  [8, 'noun', '食べ物', 'たべもの', 'tabemono', 'Makanan'],
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
  [9, 'noun', '音楽', 'おんがく', 'ongaku', 'Musik'],
  [9, 'noun', '歌', 'うた', 'uta', 'Lagu'],
  [9, 'noun', 'スポーツ', 'すぽーつ', 'supootsu', 'Olahraga'],
  [9, 'noun', '旅行', 'りょこう', 'ryokou', 'Perjalanan'],
  [9, 'noun', '買い物', 'かいもの', 'kaimono', 'Belanja'],
  [9, 'noun', '食事', 'しょくじ', 'shokuji', 'Makan (formal)'],
  [9, 'noun', 'ダンス', 'だんす', 'dansu', 'Tarian'],
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
  [10, 'noun', '男の人', 'おとこのひと', 'otokonohito', 'Laki-laki'],
  [10, 'noun', '女の人', 'おんなのひと', 'onnanohito', 'Perempuan'],
  [10, 'noun', '男の子', 'おとこのこ', 'otokonoko', 'Anak laki-laki'],
  [10, 'noun', '女の子', 'おんなのこ', 'onnanoko', 'Anak perempuan'],
  [10, 'noun', '犬', 'いぬ', 'inu', 'Anjing'],
  [10, 'noun', '猫', 'ねこ', 'neko', 'Kucing'],
  [10, 'noun', '木', 'き', 'ki', 'Pohon'],
  [10, 'noun', '物', 'もの', 'mono', 'Benda'],
  [10, 'noun', '箱', 'はこ', 'hako', 'Kotak'],
  [10, 'noun', '冷蔵庫', 'れいぞうこ', 'reizouko', 'Kulkas'],
  [10, 'noun', '棚', 'たな', 'tana', 'Rak'],
  [10, 'noun', 'ベッド', 'べっど', 'beddo', 'Tempat tidur'],
  [10, 'noun', '本棚', 'ほんだな', 'hondana', 'Rak buku'],
  // ── BAB 11
  [11, 'noun', '一つ', 'ひとつ', 'hitotsu', 'Satu buah'],
  [11, 'noun', '二つ', 'ふたつ', 'futatsu', 'Dua buah'],
  [11, 'noun', '一人', 'ひとり', 'hitori', 'Satu orang'],
  [11, 'noun', '二人', 'ふたり', 'futari', 'Dua orang'],
  [11, 'noun', '切手', 'きって', 'kitte', 'Prangko'],
  [11, 'noun', '封筒', 'ふうとう', 'fuutou', 'Amplop'],
  [11, 'other', 'どのくらい', 'どのくらい', 'donokurai', 'Berapa lama / banyak'],
  [11, 'noun', '三つ', 'みっつ', 'mittsu', 'Tiga buah'],
  [11, 'noun', '四つ', 'よっつ', 'yottsu', 'Empat buah'],
  [11, 'noun', '五つ', 'いつつ', 'itsutsu', 'Lima buah'],
  [11, 'noun', '六つ', 'むっつ', 'muttsu', 'Enam buah'],
  [11, 'noun', '七つ', 'ななつ', 'nanatsu', 'Tujuh buah'],
  [11, 'noun', '八つ', 'やっつ', 'yattsu', 'Delapan buah'],
  [11, 'noun', '九つ', 'ここのつ', 'kokonotsu', 'Sembilan buah'],
  [11, 'noun', '十', 'とお', 'too', 'Sepuluh buah'],
  [11, 'other', 'いくつ', 'いくつ', 'ikutsu', 'Berapa buah'],
  [11, 'other', '〜枚', 'まい', 'mai', '…lembar (kaunter)'],
  [11, 'other', '〜台', 'だい', 'dai', '…unit mesin (kaunter)'],
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
  [12, 'noun', '季節', 'きせつ', 'kisetsu', 'Musim'],
  [12, 'noun', '春', 'はる', 'haru', 'Musim semi'],
  [12, 'noun', '夏', 'なつ', 'natsu', 'Musim panas'],
  [12, 'noun', '秋', 'あき', 'aki', 'Musim gugur'],
  [12, 'noun', '冬', 'ふゆ', 'fuyu', 'Musim dingin'],
  [12, 'noun', '天気', 'てんき', 'tenki', 'Cuaca'],
  [12, 'noun', '雨', 'あめ', 'ame', 'Hujan'],
  [12, 'noun', '雪', 'ゆき', 'yuki', 'Salju'],
  [12, 'noun', '風', 'かぜ', 'kaze', 'Angin'],
  [12, 'noun', '月', 'つき', 'tsuki', 'Bulan'],
  [12, 'noun', '星', 'ほし', 'hoshi', 'Bintang'],
  // ── BAB 13
  [13, 'verb', '遊びます', 'あそびます', 'asobimasu', 'Bermain / Bersenang-senang'],
  [13, 'verb', '泳ぎます', 'およぎます', 'oyogimasu', 'Berenang'],
  [13, 'verb', '迎えます', 'むかえます', 'mukaemasu', 'Menjemput'],
  [13, 'verb', '疲れます', 'つかれます', 'tsukaremasu', 'Lelah / Capek'],
  [13, 'adj', '欲しい', 'ほしい', 'hoshii', 'Ingin (suatu barang)'],
  [13, 'adj', '広い', 'ひろい', 'hiroi', 'Luas'],
  [13, 'adj', '狭い', 'せまい', 'semai', 'Sempit'],
  [13, 'noun', '海', 'うみ', 'umi', 'Laut'],
  [13, 'noun', '川', 'かわ', 'kawa', 'Sungai'],
  [13, 'noun', '温泉', 'おんせん', 'onsen', 'Pemandian air panas'],
  [13, 'noun', '祭り', 'まつり', 'matsuri', 'Festival'],
  [13, 'noun', '正月', 'しょうがつ', 'shougatsu', 'Tahun baru'],
  [13, 'noun', 'お寺', 'おてら', 'otera', 'Kuil Buddha'],
  [13, 'noun', '神社', 'じんじゃ', 'jinja', 'Kuil Shinto'],
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
  [14, 'noun', '窓', 'まど', 'mado', 'Jendela'],
  [14, 'noun', '電気', 'でんき', 'denki', 'Listrik / lampu'],
  [14, 'noun', 'ガス', 'がす', 'gasu', 'Gas'],
  [14, 'noun', '水道', 'すいどう', 'suidou', 'Air ledeng'],
  // ── BAB 15
  [15, 'verb', '立ちます', 'たちます', 'tachimasu', 'Berdiri'],
  [15, 'verb', '座ります', 'すわります', 'suwarimasu', 'Duduk'],
  [15, 'verb', '使います', 'つかいます', 'tsukaimasu', 'Menggunakan'],
  [15, 'verb', '置きます', 'おきます', 'okimasu', 'Meletakkan'],
  [15, 'verb', '作ります', 'つくります', 'tsukurimasu', 'Membuat'],
  [15, 'verb', '売ります', 'うります', 'urimasu', 'Menjual'],
  [15, 'verb', '知ります', 'しります', 'shirimasu', 'Mengetahui / Kenal'],
  [15, 'verb', '住みます', 'すみます', 'sumimasu', 'Tinggal / Menetap'],
  [15, 'noun', '薬', 'くすり', 'kusuri', 'Obat'],
  [15, 'noun', 'お風呂', 'おふろ', 'ofuro', 'Bak mandi'],
  [15, 'noun', 'シャワー', 'しゃわー', 'shawaa', 'Shower'],
  [15, 'noun', '石鹸', 'せっけん', 'sekken', 'Sabun'],
  [15, 'noun', 'タオル', 'たおる', 'taoru', 'Handuk'],
  [15, 'noun', '歯', 'は', 'ha', 'Gigi'],
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
  [16, 'noun', '空港', 'くうこう', 'kuukou', 'Bandara'],
  [16, 'noun', '駅', 'えき', 'eki', 'Stasiun'],
  [16, 'noun', '銀行', 'ぎんこう', 'ginkou', 'Bank'],
  [16, 'noun', '郵便局', 'ゆうびんきょく', 'yuubinkyoku', 'Kantor pos'],
  [16, 'noun', '図書館', 'としょかん', 'toshokan', 'Perpustakaan'],
  [16, 'noun', '公園', 'こうえん', 'kouen', 'Taman kota'],
  [16, 'noun', '喫茶店', 'きっさてん', 'kissaten', 'Kedai kopi'],
  [16, 'noun', '映画館', 'えいがかん', 'eigakan', 'Bioskop'],
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
  [17, 'noun', '健康', 'けんこう', 'kenkou', 'Kesehatan'],
  [17, 'noun', '病気', 'びょうき', 'byouki', 'Penyakit'],
  [17, 'noun', '熱', 'ねつ', 'netsu', 'Demam'],
  [17, 'noun', '風邪', 'かぜ', 'kaze', 'Masuk angin'],
  [17, 'noun', '怪我', 'けが', 'kega', 'Luka / cedera'],
  [17, 'noun', '入院', 'にゅういん', 'nyuuin', 'Rawat inap'],
  [17, 'noun', '退院', 'たいいん', 'taiin', 'Keluar dari rumah sakit'],
  // ── BAB 18
  [18, 'verb', 'できます', 'できます', 'dekimasu', 'Bisa / Mampu'],
  [18, 'verb', '洗います', 'あらいます', 'araimasu', 'Mencuci'],
  [18, 'verb', '弾きます', 'ひきます', 'hikimasu', 'Memainkan alat musik'],
  [18, 'verb', '歌います', 'うたいます', 'utaimasu', 'Menyanyi'],
  [18, 'verb', '集めます', 'あつめます', 'atsumemasu', 'Mengumpulkan'],
  [18, 'verb', '捨てます', 'すてます', 'sutemasu', 'Membuang'],
  [18, 'verb', '運転します', 'うんてんします', 'untenshimasu', 'Menyetir kendaraan'],
  [18, 'noun', '趣味', 'しゅみ', 'shumi', 'Hobi'],
  [18, 'noun', 'ピアノ', 'ぴあの', 'piano', 'Piano'],
  [18, 'noun', 'ギター', 'ぎたー', 'gitaa', 'Gitar'],
  [18, 'noun', '絵', 'え', 'e', 'Lukisan'],
  [18, 'noun', '写真', 'しゃしん', 'shashin', 'Foto'],
  [18, 'noun', '日記', 'にっき', 'nikki', 'Buku harian'],
  // ── BAB 19
  [19, 'verb', '登ります', 'のぼります', 'noborimasu', 'Mendaki gunung'],
  [19, 'verb', '泊まります', 'とまります', 'tomarimasu', 'Menginap di hotel'],
  [19, 'verb', '掃除します', 'そうじします', 'soujishimasu', 'Membersihkan ruangan'],
  [19, 'verb', '洗濯します', 'せんたくします', 'sentakushimasu', 'Mencuci pakaian'],
  [19, 'verb', '練習します', 'れんしゅうします', 'renshuushimasu', 'Berlatih'],
  [19, 'adj', '眠い', 'ねむい', 'nemui', 'Mengantuk'],
  [19, 'adj', '強い', 'つよい', 'tsuyoi', 'Kuat'],
  [19, 'adj', '弱い', 'よわい', 'yowai', 'Lemah'],
  [19, 'noun', '運動', 'うんどう', 'undou', 'Olahraga / bergerak'],
  [19, 'noun', '散歩', 'さんぽ', 'sanpo', 'Jalan-jalan santai'],
  // ── BAB 20
  [20, 'verb', '要ります', 'いります', 'irimasu', 'Memerlukan / Butuh'],
  [20, 'verb', '調べます', 'しらべます', 'shirabemasu', 'Mengecek / Meneliti'],
  [20, 'verb', '直します', 'なおします', 'naoshimasu', 'Memperbaiki'],
  [20, 'noun', '言葉', 'ことば', 'kotoba', 'Kosakata / Bahasa'],
  [20, 'noun', '物価', 'ぶっか', 'bukka', 'Harga kebutuhan'],
  [20, 'noun', '給料', 'きゅうりょう', 'kyuuryou', 'Gaji'],
  [20, 'noun', '家賃', 'やちん', 'yachin', 'Sewa rumah'],
  [20, 'noun', '電気代', 'でんきだい', 'denkidai', 'Tagihan listrik'],
  // ── BAB 21
  [21, 'verb', '思います', 'おもいます', 'omoimasu', 'Berpikir / Mengira'],
  [21, 'verb', '言います', 'いいます', 'iimasu', 'Berkata'],
  [21, 'verb', '足ります', 'たります', 'tarimasu', 'Cukup'],
  [21, 'verb', '勝ちます', 'かちます', 'kachimasu', 'Menang'],
  [21, 'verb', '負けます', 'まけます', 'makemasu', 'Kalah'],
  [21, 'verb', '役に立ちます', 'やくにたちます', 'yakunitachimasu', 'Berguna / Bermanfaat'],
  [21, 'adj', '無駄[な]', 'むだ[な]', 'muda[na]', 'Sia-sia / Percuma'],
  [21, 'noun', '意見', 'いけん', 'iken', 'Pendapat'],
  [21, 'noun', '経験', 'けいけん', 'keiken', 'Pengalaman'],
  [21, 'noun', '約束', 'やくそく', 'yakusoku', 'Janji'],
  [21, 'noun', '将来', 'しょうらい', 'shourai', 'Masa depan'],
  // ── BAB 22
  [22, 'verb', '着ます', 'きます', 'kimasu', 'Memakai baju atas / kemeja'],
  [22, 'verb', '履きます', 'はきます', 'hakimasu', 'Memakai sepatu / celana'],
  [22, 'verb', '被ります', 'かぶります', 'kaburimasu', 'Memakai topi'],
  [22, 'verb', '掛けます', 'かけます', 'kakemasu', 'Memakai kacamata'],
  [22, 'verb', '生まれます', 'うまれます', 'umaremasu', 'Lahir'],
  [22, 'noun', '帽子', 'ぼうし', 'boushi', 'Topi'],
  [22, 'noun', '眼鏡', 'めがね', 'megane', 'Kacamata'],
  [22, 'noun', '洋服', 'ようふく', 'youfuku', 'Pakaian'],
  [22, 'noun', '上着', 'うわぎ', 'uwagi', 'Jaket / atasan'],
  [22, 'noun', 'シャツ', 'しゃつ', 'shatsu', 'Kemeja'],
  [22, 'noun', 'スカート', 'すかーと', 'sukaato', 'Rok'],
  [22, 'noun', 'ズボン', 'ずぼん', 'zubon', 'Celana panjang'],
  [22, 'noun', '靴下', 'くつした', 'kutsushita', 'Kaus kaki'],
  [22, 'noun', 'スーツ', 'すーつ', 'suutsu', 'Setelan jas'],
  // ── BAB 23
  [23, 'verb', '回します', 'まわします', 'mawashimasu', 'Memutar knop'],
  [23, 'verb', '引きます', 'ひきます', 'hikimasu', 'Menarik'],
  [23, 'verb', '変えます', 'かえます', 'kaemasu', 'Mengubah'],
  [23, 'verb', '触ります', 'さわります', 'sawarimasu', 'Menyentuh'],
  [23, 'verb', '渡ります', 'わたります', 'watarimasu', 'Menyeberang jalan'],
  [23, 'verb', '曲がります', 'まがります', 'magarimasu', 'Belok (arah)'],
  [23, 'noun', '交差点', 'こうさてん', 'kousaten', 'Perempatan jalan'],
  [23, 'noun', '橋', 'はし', 'hashi', 'Jembatan'],
  [23, 'noun', '角', 'かど', 'kado', 'Sudut / tikungan'],
  [23, 'noun', '道', 'みち', 'michi', 'Jalan'],
  [23, 'noun', '信号', 'しんごう', 'shingou', 'Lampu lalu lintas'],
  [23, 'noun', '駐車場', 'ちゅうしゃじょう', 'chuushajou', 'Tempat parkir'],
  [23, 'noun', '坂', 'さか', 'saka', 'Tanjakan'],
  // ── BAB 24
  [24, 'verb', 'くれます', 'くれます', 'kuremasu', 'Memberi (kepada saya)'],
  [24, 'verb', '連れて行きます', 'つれていきます', 'tsureteikimasu', 'Mengajak pergi'],
  [24, 'verb', '連れて来ます', 'つれてきます', 'tsuretekimasu', 'Mengajak datang'],
  [24, 'verb', '案内します', 'あんないします', 'annaishimasu', 'Memandu arah'],
  [24, 'verb', '説明します', 'せつめいします', 'setsumeishimasu', 'Menjelaskan detail'],
  [24, 'noun', '準備', 'じゅんび', 'junbi', 'Persiapan'],
  [24, 'noun', '引っ越し', 'ひっこし', 'hikkoshi', 'Pindahan rumah'],
  [24, 'noun', 'お祝い', 'おいわい', 'oiwai', 'Ucapan selamat'],
  [24, 'noun', 'お見舞い', 'おみまい', 'omimai', 'Menjenguk orang sakit'],
  // ── BAB 25
  [25, 'verb', '考えます', 'かんがえます', 'kangaemasu', 'Memikirkan'],
  [25, 'verb', '着きます', 'つきます', 'tsukimasu', 'Tiba di tujuan'],
  [25, 'noun', '田舎', 'いなか', 'inaka', 'Desa / Kampung halaman'],
  [25, 'other', 'もし', 'もし', 'moshi', 'Kalau / Seandainya'],
  [25, 'verb', '頑張ります', 'がんばります', 'ganbarimasu', 'Berjuang sungguh-sungguh'],
  [25, 'noun', '台風', 'たいふう', 'taifuu', 'Topan'],
  [25, 'noun', '地震', 'じしん', 'jishin', 'Gempa bumi'],
  [25, 'noun', '火事', 'かじ', 'kaji', 'Kebakaran'],
  [25, 'noun', '事故', 'じこ', 'jiko', 'Kecelakaan'],
  [25, 'noun', '宝くじ', 'たからくじ', 'takarakuji', 'Lotre'],
] as const satisfies readonly KolomKotoba[];

/** Tuple → objek. Satu-satunya tempat urutan kolom `RAW` diartikan. */
function keKotoba(t: KolomKotoba): Kotoba {
  return { b: t[0], pos: t[1], k: t[2], h: t[3], r: t[4], id: t[5] };
}

/**
 * Bank lengkap, sudah dalam bentuk objek.
 *
 * Dibangun sekali per proses (modul dievaluasi sekali per lambda instance),
 * bukan per permintaan — 432 pemetaan objek tidak mahal, tapi tidak ada
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
