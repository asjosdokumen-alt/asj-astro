/**
 * TESTS: isi bank kosakata — Minna no Nihongo Bab 1–50 dan 16 bidang SSW.
 *
 * KENAPA ADA
 * ----------
 * Sampai 2026-10-31 tidak ada satu pun tes yang membaca ISI `bank.ts`. Yang
 * dijaga `e2e/kotoba-guard.test.ts` hanya "siapa yang boleh menerima bank",
 * dan `e2e/kotoba-gate.test.tsx` hanya "apakah permainan dirender". Artinya
 * sebuah baris dengan cara baca salah, bab yang hilang, atau kata yang
 * terdaftar dua kali bisa masuk tanpa satu gate pun menyentuhnya — dan
 * kesalahannya baru terlihat oleh siswa, sebagai jawaban yang mustahil.
 *
 * Yang diperiksa di sini, dan mengapa masing-masing:
 *
 *   1. BAB 1–50 LENGKAP. `BAB_KOTOBA` diturunkan dari data, jadi bab yang
 *      kosong akan hilang dari pemilih bab tanpa error. Tes ini yang menahan
 *      "bab 41 hilang" agar tidak lolos sebagai "memang tidak ada".
 *   2. TIDAK ADA KUNCI `k|h` GANDA. `kunciKata()` di `KotobaGame` memakai
 *      kanji+cara baca sebagai kunci progres hafalan. Satu duplikat berarti dua
 *      baris berbagi satu riwayat — dan di kuis, dua pilihan jawaban yang
 *      tampak sama.
 *   3. ROMAJI COCOK DENGAN KANA. Kolom `h` diubah ke romaji oleh konverter di
 *      bawah lalu dibandingkan dengan kolom `r`. Inilah pemeriksaan yang dulu
 *      dijalankan sebagai skrip sekali pakai saat menulis bank; sekarang ia
 *      berjalan setiap suite. Satu pengecualian didaftarkan eksplisit
 *      (`パーティー`), bukan disembunyikan di normalisasi.
 *   4. TIAP BIDANG SSW PUNYA KATA KERJA DAN KATA BENDA. Bidang yang isinya
 *      hanya daftar alat akan lolos hitungan "≥ 15 kata" tapi tidak bisa
 *      dipakai untuk kalimat kerja.
 *
 * KENAPA DI `e2e/`: berkas `.ts` di dalam `netlify/functions/` ikut dianggap
 * function oleh Netlify, dan berkas `.ts` baru di `src/` atau `netlify/`
 * memindahkan counter beku `indexer` (R13f-bis). Tier `e2e` tidak menghitung
 * `.ts`.
 */
import { describe, it, expect } from 'vitest';
import { BANK_KOTOBA, BAB_KOTOBA, JUMLAH_KOTOBA } from '../netlify/functions/_lib/kotoba/bank';
import { BIDANG_SSW, JUMLAH_SSW } from '../netlify/functions/_lib/kotoba/ssw';

/**
 * Konverter kana → romaji, ditulis mengikuti konvensi bank ini:
 *   • おう/おお dipertahankan (`ginkouin`, `toori`), bukan dipanjangkan;
 *   • づ = `zu` (こづつみ → kozutsumi), walau satu entri lama memakai `dzu`;
 *   • っ + ち/ちゃ = `cch` (スイッチ → suicchi), konvensi yang dipakai bank;
 *   • ー menggandakan vokal terakhir (コーヒー → koohii);
 *   • ん selalu `n`, tidak berubah menurut huruf berikutnya.
 *
 * Ini BUKAN konverter Hepburn umum: tujuannya membandingkan kolom `r` dengan
 * kolom `h` memakai ejaan yang bank ini pakai, bukan mengajarkan ejaan baku.
 */
const KANA: Record<string, string> = {
  あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o',
  か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko',
  さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so',
  た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to',
  な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no',
  は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho',
  ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo',
  や: 'ya', ゆ: 'yu', よ: 'yo',
  ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro',
  わ: 'wa', を: 'o', ん: 'n',
  が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go',
  ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo',
  だ: 'da', ぢ: 'ji', づ: 'zu', で: 'de', ど: 'do',
  ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo',
  ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po',
  ぁ: 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o',
  ゃ: 'ya', ゅ: 'yu', ょ: 'yo', ゎ: 'wa', ゔ: 'vu',
};

const DIGRAPH: Record<string, string> = {
  きゃ: 'kya', きゅ: 'kyu', きょ: 'kyo',
  しゃ: 'sha', しゅ: 'shu', しょ: 'sho',
  ちゃ: 'cha', ちゅ: 'chu', ちょ: 'cho',
  にゃ: 'nya', にゅ: 'nyu', にょ: 'nyo',
  ひゃ: 'hya', ひゅ: 'hyu', ひょ: 'hyo',
  みゃ: 'mya', みゅ: 'myu', みょ: 'myo',
  りゃ: 'rya', りゅ: 'ryu', りょ: 'ryo',
  ぎゃ: 'gya', ぎゅ: 'gyu', ぎょ: 'gyo',
  じゃ: 'ja', じゅ: 'ju', じょ: 'jo',
  びゃ: 'bya', びゅ: 'byu', びょ: 'byo',
  ぴゃ: 'pya', ぴゅ: 'pyu', ぴょ: 'pyo',
  ふぁ: 'fa', ふぃ: 'fi', ふぇ: 'fe', ふぉ: 'fo',
  ちぇ: 'che', しぇ: 'she', じぇ: 'je',
  てぃ: 'ti', でぃ: 'di',
};

const VOKAL = new Set(['a', 'i', 'u', 'e', 'o']);

function kanaKeRomaji(kana: string): string {
  let out = '';
  for (let i = 0; i < kana.length; i++) {
    const c = kana[i];
    if (c === 'っ') {
      const sisa = kana.slice(i + 1);
      const berikut = DIGRAPH[sisa.slice(0, 2)] ?? KANA[sisa[0]] ?? '';
      /* っ + ち/ちゃ → `cch`, bukan `tch`: bank ini menulis スイッチ sebagai
         `suicchi`. Bukan pilihan Hepburn, tapi konsistensi data lebih penting
         daripada baku — dan `normalRomaji()` di klien menyamakan keduanya. */
      if (berikut.startsWith('ch')) out += 'c';
      else if (berikut[0]) out += berikut[0];
      continue;
    }
    if (c === 'ー') {
      const akhir = out[out.length - 1];
      if (VOKAL.has(akhir)) out += akhir;
      continue;
    }
    const dua = kana.slice(i, i + 2);
    if (DIGRAPH[dua]) {
      out += DIGRAPH[dua];
      i++;
      continue;
    }
    if (KANA[c]) out += KANA[c];
    /* Sisanya (angka, ？, ～, [ ], ・) dilewati: kolom `h` kadang memuat tanda
       baca yang tidak berbunyi, mis. `おなまえは？`. */
  }
  return out;
}

/**
 * Bentuk kanonik untuk PERBANDINGAN saja.
 *
 * `dzu` → `zu`: づ ditulis dua cara di bank ini (`kozutsumi` vs
 * `katadzukemasu`), keduanya benar.
 * `tch` → `cch`: サンドイッチ ditulis `sandoitchi` (Hepburn), konverter
 * menghasilkan `sandoicchi`.
 */
function kanonik(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    .replace(/dzu/g, 'zu')
    .replace(/tch/g, 'cch');
}

/**
 * Pengecualian yang DISENGAJA, satu per satu.
 *
 * `パーティー`: てぃ ditulis `tei` di bank (`paateii`), sedangkan konverter
 * menghasilkan `ti`. Ejaan bank yang dipakai karena itu yang sudah dihafal
 * siswa; mengubahnya berarti mengubah kunci progres.
 */
const PENGECUALIAN = new Map<string, string>([['パーティー', 'paateii']]);

function romajiSalah(daftar: readonly { k: string; h: string; r: string }[]) {
  return daftar
    .filter((v) => {
      const harap = PENGECUALIAN.get(v.k) ?? kanaKeRomaji(v.h);
      return kanonik(harap) !== kanonik(v.r);
    })
    .map((v) => `${v.k} (${v.h}) → tertulis "${v.r}", seharusnya "${kanaKeRomaji(v.h)}"`);
}

describe('bank kosakata buku — Minna no Nihongo Bab 1–50', () => {
  it('berisi 1 449 kata dan babnya 1–50 tanpa lubang', () => {
    /* Angka ini sengaja eksplisit: ia yang membuat "bab 26–50 sudah ditambah"
       bisa dibuktikan, bukan diklaim. Kalau kata ditambah, ubah angkanya —
       jangan longgarkan ke `toBeGreaterThan`, karena tes yang selalu benar
       tidak menjaga apa pun. */
    /* 1449 -> 1440 (2026-11-03): 19 kata sifat-な membawa anotasi `[な]` di
       kolom tulisan/bacaan/romaji (mode ketik jadi meminta siswa mengetik
       tanda kurung), dan setelah anotasi itu dilepas terlihat 8 kata yang
       terdaftar DUA KALI (bab awal + tambahan bab 26-50). Duplikatnya dibuang
       dari bab yang lebih akhir; `kunciKata()` memakai kanji+bacaan, jadi
       salinan kedua berbagi kunci progres yang sama. 1449 - 1 (賑やか) - 8 = 1440. */
    expect(JUMLAH_KOTOBA).toBe(1440);
    expect(BANK_KOTOBA.length).toBe(1440);
    expect([...BAB_KOTOBA]).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
  });

  /* Cacat 2026-11-03: 19 kata sifat-な menyimpan anotasi tata bahasa `[な]` di
     kolom TULISAN, BACAAN, dan ROMAJI — jadi kartu menampilkan "綺麗[な]" dan
     mode ketik menuntut siswa mengetik tanda kurung. Anotasi itu juga
     MENYEMBUNYIKAN 8 duplikat: kata yang sama terdaftar di bab awal DAN di
     tambahan bab 26–50, dan karena `kunciKata()` memakai kanji+bacaan, kedua
     salinan berbagi kunci progres yang sama. */
  it('tidak ada anotasi tata bahasa yang bocor ke kolom tulisan/bacaan/romaji', () => {
    const bocor = BANK_KOTOBA
      .filter((v) => /[[\]()（）]/.test(v.k) || /[[\]()（）]/.test(v.h) || /[[\]()（）]/.test(v.r))
      .map((v) => `${v.k} / ${v.h} / ${v.r}`);
    expect(bocor, 'tanda kurung di kolom yang dicetak atau diketik').toEqual([]);
  });

  it('tidak ada kata terdaftar dua kali (kanji + bacaan sama)', () => {
    const terlihat = new Map<string, string>();
    const ganda: string[] = [];
    for (const v of BANK_KOTOBA) {
      const kunci = `${v.k}|${v.h}`;
      if (terlihat.has(kunci)) ganda.push(`${v.k} (${v.h}) — bab ${terlihat.get(kunci)} & ${v.b}`);
      else terlihat.set(kunci, String(v.b));
    }
    expect(ganda, 'kata ganda berbagi kunci progres, jadi ronde bisa menanyakannya dua kali').toEqual([]);
  });

  it('kata sifat-な dibaca dan ditulis tanpa anotasi', () => {
    // Spot-check yang dulu rusak; kalau anotasi kembali, ini yang pertama merah.
    const cari = (kanji: string) => BANK_KOTOBA.find((v) => v.k === kanji);
    expect(cari('綺麗')).toMatchObject({ h: 'きれい', r: 'kirei' });
    expect(cari('大丈夫')).toMatchObject({ h: 'だいじょうぶ', r: 'daijoubu' });
    expect(cari('無理')).toMatchObject({ h: 'むり', r: 'muri' });
    expect(cari('不便')).toMatchObject({ h: 'ふべん', r: 'fuben' });
  });

  it('tiap bab 26–50 punya cukup kata untuk satu ronde utuh', () => {
    const perBab = new Map<number, number>();
    for (const v of BANK_KOTOBA) perBab.set(v.b, (perBab.get(v.b) ?? 0) + 1);
    const tipis = Array.from({ length: 25 }, (_, i) => i + 26)
      .map((b) => [b, perBab.get(b) ?? 0] as const)
      .filter(([, n]) => n < 15);
    /* 15, bukan 20: ronde berjalan sampai nyawa habis (3 nyawa), jadi 15 kata
       sudah lebih dari cukup; yang dicegah di sini adalah bab yang isinya 3–4
       kata dan terasa seperti salah filter. */
    expect(tipis).toEqual([]);
  });

  it('tidak ada kunci kanji+cara baca yang ganda', () => {
    const seen = new Map<string, number>();
    const ganda: string[] = [];
    for (const v of BANK_KOTOBA) {
      const kunci = `${v.k}|${v.h}`;
      const sudah = seen.get(kunci);
      if (sudah !== undefined) ganda.push(`${v.k} (bab ${sudah} dan ${v.b})`);
      else seen.set(kunci, v.b);
    }
    /* Duplikat bukan sekadar boros: `kunciKata()` memakainya untuk progres, dan
       `buatPilihan()` membuang teks jawaban yang sudah dipakai — sehingga satu
       kata bisa muncul sebagai pengecoh yang tidak mungkin dipilih. */
    expect(ganda).toEqual([]);
  });

  it('setiap romaji cocok dengan cara bacanya', () => {
    expect(romajiSalah(BANK_KOTOBA)).toEqual([]);
  });

  it('jenis kata hanya dari empat nilai yang dikenal klien', () => {
    const asing = BANK_KOTOBA.filter((v) => !['verb', 'adj', 'noun', 'other'].includes(v.pos));
    expect(asing.map((v) => `${v.k}=${v.pos}`)).toEqual([]);
  });
});

describe('bank kosakata bidang kerja — 16 bidang SSW', () => {
  it('berisi 16 bidang, id unik, dan 1 859 kata', () => {
    expect(BIDANG_SSW.length).toBe(16);
    expect(new Set(BIDANG_SSW.map((b) => b.id)).size).toBe(16);
    /* Angka eksplisit, sama alasannya dengan bank buku: perluasan harus bisa
       dibuktikan, bukan diklaim.
       1 061 -> 1 859 (2026-11-03): +798 kata untuk bidang `inshokuhin`, diekstrak
       dari 5 PDF Kotoba/kanji materi LPK ASJ (7.PENGOLAHAN MAKANAN, bab 1–5).
       Bacaan dan artinya dari materi itu sendiri; 51 entri yang urainya rusak
       dibuang. Bidang lain belum disentuh — angkanya akan naik lagi kalau
       materi bidang lain diekstrak dengan cara yang sama. */
    expect(JUMLAH_SSW).toBe(1859);
    const jumlah = BIDANG_SSW.reduce((n, b) => n + b.kata.length, 0);
    expect(jumlah).toBe(JUMLAH_SSW);
  });

  it('setiap bidang punya nama Indonesia, nama Jepang, dan ringkasan', () => {
    const kosong = BIDANG_SSW.filter(
      (b) => !b.nama.trim() || !b.namaJp.trim() || b.ringkas.trim().length < 20,
    );
    /* `ringkas` yang terlalu pendek ("Bersih-bersih.") tidak memberi tahu apa
       pun kepada siswa yang memilih bidang — dan itulah satu-satunya gunanya. */
    expect(kosong.map((b) => b.id)).toEqual([]);
  });

  it('tiap bidang punya minimal 50 kata, termasuk kata kerja dan kata benda', () => {
    const laporan = BIDANG_SSW.map((b) => {
      const kerja = b.kata.filter((v) => v.pos === 'verb').length;
      const benda = b.kata.filter((v) => v.pos === 'noun').length;
      return { id: b.id, n: b.kata.length, kerja, benda };
    }).filter((x) => x.n < 50 || x.kerja < 8 || x.benda < 20);
    /* 50, bukan 15: 15 kata cukup untuk satu ronde, tapi tidak cukup untuk
       belajar satu bidang. Batas 8 kata kerja menahan bidang yang isinya cuma
       daftar alat. */
    expect(laporan).toEqual([]);
  });

  it('tiap bidang mengisi kelima kategori, dan kategori "kerja" berisi kata kerja', () => {
    const KATEGORI = ['alat', 'kerja', 'aman', 'mutu', 'kantor'];
    const laporan: string[] = [];
    for (const b of BIDANG_SSW) {
      const per = new Map<string, number>();
      for (const v of b.kata) per.set(v.cat, (per.get(v.cat) ?? 0) + 1);
      for (const c of KATEGORI) {
        const n = per.get(c) ?? 0;
        /* 8 per kategori: cukup untuk satu ronde utuh (3 nyawa) tanpa
           mengulang kata yang sama dua kali. */
        if (n < 8) laporan.push(`${b.id}/${c}=${n}`);
      }
      const kerjaVerb = b.kata.filter((v) => v.cat === 'kerja' && v.pos === 'verb').length;
      if (kerjaVerb < 8) laporan.push(`${b.id}/kerja-verb=${kerjaVerb}`);
    }
    expect(laporan).toEqual([]);
  });

  it('kategori hanya dari lima nilai yang dikenal klien', () => {
    const asing = BIDANG_SSW.flatMap((b) =>
      b.kata.filter((v) => !['alat', 'kerja', 'aman', 'mutu', 'kantor'].includes(v.cat)).map((v) => `${b.id}/${v.k}`),
    );
    expect(asing).toEqual([]);
  });

  it('tidak ada kunci kanji+cara baca ganda di dalam satu bidang', () => {
    const ganda: string[] = [];
    for (const b of BIDANG_SSW) {
      const seen = new Set<string>();
      for (const v of b.kata) {
        const kunci = `${v.k}|${v.h}`;
        if (seen.has(kunci)) ganda.push(`${b.id}: ${v.k}`);
        seen.add(kunci);
      }
    }
    /* Antar-bidang boleh berulang (点検 muncul di kebersihan dan di kereta);
       DI DALAM satu bidang tidak, karena kunci progres hanya kanji+cara baca. */
    expect(ganda).toEqual([]);
  });

  it('setiap romaji cocok dengan cara bacanya', () => {
    const semua = BIDANG_SSW.flatMap((b) => b.kata.map((v) => ({ ...v, k: `${b.id}/${v.k}` })));
    expect(romajiSalah(semua)).toEqual([]);
  });

  it('semua kata bidang bertanda b:0 — bukan bab buku', () => {
    const salah = BIDANG_SSW.flatMap((b) => b.kata.filter((v) => v.b !== 0).map((v) => `${b.id}/${v.k}`));
    expect(salah).toEqual([]);
  });
});
