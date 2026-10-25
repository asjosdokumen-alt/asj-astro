/**
 * mensetsuOpsi.ts — pilihan sifat untuk soal 長所 / 短所 / 特技.
 *
 * Sumber: kekurangan.pdf (22) + kelebihan.pdf (27) di folder materi LPK,
 * diekstrak ke deliverables/mensetsu-opsi-sifat.json. Ditaruh di frontend, bukan
 * di DB: isinya daftar rujukan yang tidak berubah per kandidat, dan memuatnya di
 * sini menghindari satu round-trip tambahan hanya untuk 49 baris.
 *
 * Bentuk sengaja hanya {ro, arti}: versi Jepangnya TIDAK disediakan, karena
 * tujuannya latihan — siswa memilih sifat, lalu menulis/menerjemahkan sendiri
 * kalimat Jepangnya.
 */
export interface OpsiSifat {
  ro: string;
  arti: string;
}

export const OPSI_KEKURANGAN: OpsiSifat[] = [
  { ro: "Shinpaisei na tokoro", arti: "Terlalu cemas sebelum melakukan sesuatu" },
  { ro: "Yūjū fudan na tokoro", arti: "Bimbang menentukan, terlalu memikirkan sekitar" },
  { ro: "My pēsu na tokoro", arti: "Santai, tidak peduli pendapat orang" },
  { ro: "Kincho shiyasui", arti: "Mudah gugup" },
  { ro: "Makezugirai", arti: "Benci kalah, sulit menerima kekalahan" },
  { ro: "Sekkachi", arti: "Tidak sabaran" },
  { ro: "Kyōchō-sei ga tarinai", arti: "Kurang bisa bekerja sama" },
  { ro: "Ganko", arti: "Keras kepala" },
  { ro: "Shiyaga semai", arti: "Sudut pandang sempit" },
  { ro: "Mendō gari", arti: "Tidak suka hal ribet" },
  { ro: "Tsui kangae sugite shimau", arti: "Selalu banyak berpikir" },
  { ro: "Hito ni kibishii", arti: "Keras kepada orang" },
  { ro: "Jiko shuchō ga hageshii", arti: "Bersikeras pada pendapat sendiri" },
  { ro: "O hito yoshi", arti: "Terlalu mudah percaya orang" },
  { ro: "Hito no tanomi o kotowarenai", arti: "Tidak bisa menolak permintaan orang" },
  { ro: "Tamekomi yasui", arti: "Sering memendam masalah, mudah stres" },
  { ro: "Rikutsupoi", arti: "Suka berdalih" },
  { ro: "Happō bijin", arti: "Memilih pergaulan agar tidak dipandang buruk" },
  { ro: "Jukukōgata", arti: "Terlalu banyak berpikir saat memutuskan" },
  { ro: "Hito no mae de hanasu no ga nigate", arti: "Tidak suka berbicara di depan banyak orang" },
  { ro: "Ankiryoku ga hikui", arti: "Mudah lupa / sulit menghafal" },
  { ro: "Rikairyoku ga hikui", arti: "Sulit cepat memahami penjelasan" },
];

export const OPSI_KELEBIHAN: OpsiSifat[] = [
  { ro: "Majime na hito", arti: "Orang yang serius dan sungguh-sungguh" },
  { ro: "Sekinin-kan ga tsuyoi", arti: "Bertanggung jawab" },
  { ro: "Akarui hito", arti: "Orang yang ceria" },
  { ro: "Komyunikēshon nōryoku ga takai", arti: "Bisa berkomunikasi dengan baik" },
  { ro: "Shinchō ni susumeru hito", arti: "Melakukan sesuatu dengan hati-hati" },
  { ro: "Maemuki na hito", arti: "Selalu berpikir positif" },
  { ro: "Kihai dekiru hito", arti: "Peduli / perhatian pada orang sekitar" },
  { ro: "Kyōchō-sei ga aru", arti: "Bisa bekerja sama dengan baik" },
  { ro: "Shitashimiyasui hito", arti: "Mudah akrab dengan orang" },
  { ro: "Sunaona hito", arti: "Jujur" },
  { ro: "Seijitsu na hito", arti: "Tulus" },
  { ro: "Yakusoku o mamoru hito", arti: "Bisa menepati janji" },
  { ro: "Hataraku chikara ga aru hito", arti: "Punya kekuatan untuk bekerja" },
  { ro: "Kadai hakken-ryoku ga aru hito", arti: "Mampu menemukan titik masalah" },
  { ro: "Shigoto supīdo ga hayai hito", arti: "Bekerja cepat" },
  { ro: "Rikairyoku ga takai hito", arti: "Mudah memahami" },
  { ro: "Sutoresu taisei", arti: "Tidak mudah stres" },
  { ro: "Tassei iyoku ga aru hito", arti: "Selalu ingin berkembang" },
  { ro: "Kimerareta koto o yarinuku chikara", arti: "Menuntaskan apa yang sudah ditentukan" },
  { ro: "Nintai-ryoku ga aru hito", arti: "Sabar" },
  { ro: "Charenji seishin ga aru hito", arti: "Suka tantangan baru" },
  { ro: "Manabu shisei ga aru hito", arti: "Mau belajar" },
  { ro: "Nebaridzuyoi hito", arti: "Gigih" },
  { ro: "Kanjō o kontorōru dekiru", arti: "Bisa mengontrol emosi" },
  { ro: "Jūnansei ga aru hito", arti: "Fleksibel" },
  { ro: "Jōnetsu na hito", arti: "Punya gairah/semangat kerja" },
  { ro: "Don&#x27;na shigoto demo omoshiromi o mitsukeru kōkishin", arti: "Ingin tahu &amp; menemukan kesenangan di pekerjaan apa pun" },
];

/**
 * Pilih daftar sifat yang cocok untuk satu soal, dari teks Jepangnya.
 * Mengembalikan null kalau soal itu bukan soal sifat.
 */
export function opsiUntukSoal(jp: string): OpsiSifat[] | null {
  const t = String(jp || "").trim();
  if (/^短所/.test(t)) return OPSI_KEKURANGAN;
  if (/^長所/.test(t)) return OPSI_KELEBIHAN;
  if (/^特技|特徴/.test(t)) return OPSI_KELEBIHAN;
  return null;
}
