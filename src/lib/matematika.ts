/**
 * lib/matematika.ts — generator soal untuk halaman `/matematika`.
 *
 * PEMBAGIAN TUGAS (jangan dibalik)
 * --------------------------------
 *   • Soal CERITA + pembahasannya tinggal di server
 *     (`netlify/functions/_lib/matematika/bank.ts`) karena itu materi yang
 *     nilainya nyata, dan gerbang "khusus siswa ASJ" harus menyembunyikan
 *     sesuatu. Tanpa jawaban `getBankMatematika`, ronde tidak bisa dibentuk.
 *   • Soal ANGKA (kraepelin, kabataku, deret, satuan, logika) dibuat di sini.
 *     Jumlahnya tak terbatas dan nilainya justru pada pengulangan, bukan pada
 *     kerahasiaan — mengirimkannya lewat jaringan hanya menambah latensi per
 *     soal tanpa menyembunyikan apa pun.
 *
 * KENAPA SEMUA JAWABAN BULAT/DESIMAL PENDEK
 * -----------------------------------------
 * Jawaban diketik di numpad buatan sendiri. Setiap generator di bawah dijaga
 * agar hasilnya berhenti pada 1–2 angka desimal (dan pembagian selalu bulat),
 * sebab membandingkan `parseFloat` dengan hasil pecahan panjang akan menyalahkan
 * jawaban yang benar. Perbandingannya sendiri memakai toleransi 1e-9.
 */

export type Kesulitan = 'easy' | 'medium' | 'hard';
export type KesulitanPilih = Kesulitan | 'mixed';
export type KategoriId = 'kraepelin' | 'kabataku' | 'deret' | 'satuan' | 'logika' | 'cerita';

/** Satu soal siap tampil. Bentuknya sengaja rata, bukan union per jenis. */
export interface Soal {
  /** Unik di dalam satu ronde — dipakai sebagai `key` dan penanda riwayat. */
  id: string;
  kategori: KategoriId;
  /** Label kecil di atas soal ("KRAEPELIN 1 DIGIT", "STOK GUDANG", …). */
  tag: string;
  diff: Kesulitan;
  /** Teks pertanyaan. Deret ditulis sebagai barisan dipisah koma. */
  tanya: string;
  jawab: number;
  satuan: string;
  pembahasan: string;
  input: 'numpad' | 'pilihan';
  /** Hanya untuk `input: 'pilihan'` — 4 opsi, sudah diacak. */
  pilihan?: number[];
  /** Aturan kraepelin: tulis angka satuan saja. Menyalakan petunjuk khusus. */
  kraepelin?: boolean;
}

/** Satu baris bank cerita seperti yang dikirim server. */
export interface SoalCeritaBank {
  kode: string;
  tag: string;
  diff: Kesulitan;
  q: string;
  ans: number;
  unit: string;
  exp: string;
}

/** Bentuk balasan `getBankMatematika`. */
export interface BankMatematikaRes {
  success?: boolean;
  isVip?: boolean | null;
  jumlah?: number;
  kategori?: { id: KategoriId; jp: string; soal: number; detik: number }[];
  cerita?: SoalCeritaBank[];
  message?: string;
  sessionInvalid?: boolean;
}

/* ── utilitas acak ────────────────────────────────────────────────────────── */

function acak(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pilih<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T;
}

/** Acak Fisher–Yates. `sort(() => Math.random() - 0.5)` tidak seragam. */
function kocok<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = out[i] as T;
    const b = out[j] as T;
    out[i] = b;
    out[j] = a;
  }
  return out;
}

/**
 * Empat pilihan yang selalu memuat jawaban benar, tidak pernah negatif, dan
 * tidak pernah kembar. `langkah` menentukan jarak pengganggu — untuk angka
 * ratusan, selisih 1 terlalu mudah dibedakan dari hasil hitungan.
 */
function buatPilihan(jawab: number, langkah: number): number[] {
  const bulat = (n: number) => Math.round(n * 100) / 100;
  const kandidat = [1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 10, -10, 20, -20];
  const set = new Set<number>([bulat(jawab)]);
  for (const k of kandidat) {
    if (set.size >= 4) break;
    const v = bulat(jawab + k * langkah);
    if (v > 0) set.add(v);
  }
  // Jaring pengaman: jawaban 1 dengan langkah 1 bisa kehabisan kandidat positif.
  let naik = 1;
  while (set.size < 4) {
    const v = bulat(jawab + naik * langkah);
    if (v > 0) set.add(v);
    naik++;
  }
  return kocok([...set]);
}

/** Jarak pengganggu yang masuk akal untuk besaran jawabannya. */
function langkahUntuk(jawab: number): number {
  const abs = Math.abs(jawab);
  if (abs >= 1000) return 100;
  if (abs >= 100) return 10;
  if (abs >= 20) return 2;
  return 1;
}

/* ── Kraepelin (hitung cepat 1 digit) ─────────────────────────────────────── */

/**
 * Aturan aslinya: jumlahkan, lalu tulis ANGKA SATUAN saja (8 + 7 = 15 → 5).
 * Versi HTML hanya punya penjumlahan dua angka untuk semua tingkat; di sini
 * tingkat menambah VARIASI, bukan sekadar angka lebih besar — karena angka
 * 1–9 sudah mentok dan menaikkannya akan merusak aturan satu digit.
 */
function buatKraepelin(diff: Kesulitan): Omit<Soal, 'id' | 'kategori' | 'diff'> {
  let tanya = '';
  let mentah = 0;
  let langkah = '';

  if (diff === 'easy') {
    const a = acak(1, 9);
    const b = acak(1, 9);
    mentah = a + b;
    tanya = `${a}  ＋  ${b}`;
    langkah = `${a} + ${b} = ${mentah}`;
  } else if (diff === 'medium') {
    if (Math.random() < 0.5) {
      const a = acak(5, 9);
      const b = acak(1, a - 1);
      mentah = a - b;
      tanya = `${a}  −  ${b}`;
      langkah = `${a} − ${b} = ${mentah}`;
    } else {
      const a = acak(2, 9);
      const b = acak(2, 9);
      mentah = a + b;
      tanya = `${a}  ＋  ${b}`;
      langkah = `${a} + ${b} = ${mentah}`;
    }
  } else {
    const a = acak(1, 9);
    const b = acak(1, 9);
    const c = acak(1, 9);
    mentah = a + b + c;
    tanya = `${a}  ＋  ${b}  ＋  ${c}`;
    langkah = `${a} + ${b} + ${c} = ${mentah}`;
  }

  const jawab = ((mentah % 10) + 10) % 10;
  return {
    tag: 'KRAEPELIN 1 DIGIT',
    tanya,
    jawab,
    satuan: '',
    input: 'numpad',
    kraepelin: true,
    pembahasan: `${langkah}. Aturan kraepelin: tulis angka satuannya saja → ${jawab}.`,
  };
}

/* ── Kabataku (urutan operasi) ────────────────────────────────────────────── */

function buatKabataku(diff: Kesulitan): Omit<Soal, 'id' | 'kategori' | 'diff'> {
  let tanya = '';
  let jawab = 0;
  let pembahasan = '';

  if (diff === 'easy') {
    const a = acak(5, 20);
    const b = acak(2, 9);
    const c = acak(1, 15);
    if (Math.random() > 0.5) {
      jawab = a + b * c;
      tanya = `${a} + ${b} × ${c}`;
      pembahasan = `Perkalian didahulukan: ${b} × ${c} = ${b * c}, lalu ${a} + ${b * c} = ${jawab}.`;
    } else {
      const d = acak(2, 9);
      jawab = a * d - c;
      tanya = `${a} × ${d} − ${c}`;
      pembahasan = `Perkalian didahulukan: ${a} × ${d} = ${a * d}, lalu ${a * d} − ${c} = ${jawab}.`;
    }
  } else if (diff === 'medium') {
    const mode = acak(1, 3);
    if (mode === 1) {
      const a = acak(10, 35);
      const b = acak(5, 20);
      const c = acak(2, 6);
      jawab = (a - b) * c;
      tanya = `(${a} − ${b}) × ${c}`;
      pembahasan = `Kurung dulu: ${a} − ${b} = ${a - b}, lalu × ${c} = ${jawab}.`;
    } else if (mode === 2) {
      const a = acak(5, 15);
      const b = acak(20, 40);
      const c = acak(10, 30);
      jawab = a - b + c;
      tanya = `${a} − ${b} + ${c}`;
      pembahasan = `Hitung dari kiri: ${a} − ${b} = ${a - b}, lalu + ${c} = ${jawab}.`;
    } else {
      const b = acak(3, 9);
      const c = acak(3, 12);
      const a = b * c;
      const d = acak(2, 15);
      jawab = a / b + d;
      tanya = `${a} ÷ ${b} + ${d}`;
      pembahasan = `Pembagian didahulukan: ${a} ÷ ${b} = ${a / b}, lalu + ${d} = ${jawab}.`;
    }
  } else {
    const mode = acak(1, 3);
    if (mode === 1) {
      const a = acak(40, 100);
      const b = acak(2, 6);
      const c = acak(3, 8);
      const d = acak(10, 50);
      jawab = a - b * c * 2 + d;
      tanya = `${a} − ${b * c} × 2 + ${d}`;
      pembahasan = `Kalikan dulu: ${b * c} × 2 = ${b * c * 2}. Lalu ${a} − ${b * c * 2} + ${d} = ${jawab}.`;
    } else if (mode === 2) {
      const a = acak(2, 9);
      const b = acak(3, 9);
      const c = acak(1, 5);
      const d = acak(1, 8);
      jawab = a + b * (c + d);
      tanya = `${a} + ${b} × (${c} + ${d})`;
      pembahasan = `Kurung dulu: ${c} + ${d} = ${c + d}. Lalu ${b} × ${c + d} = ${b * (c + d)}, lalu + ${a} = ${jawab}.`;
    } else {
      const a = acak(4, 12);
      const b = acak(4, 9);
      const c = acak(2, 5);
      const d = acak(2, 6);
      jawab = a * b - c * d;
      tanya = `${a} × ${b} − ${c} × ${d}`;
      pembahasan = `Dua perkalian dulu: ${a} × ${b} = ${a * b} dan ${c} × ${d} = ${c * d}. Lalu ${a * b} − ${c * d} = ${jawab}.`;
    }
  }

  return {
    tag: 'KABATAKU / URUTAN OPERASI',
    tanya,
    jawab,
    satuan: '',
    input: 'numpad',
    pembahasan,
  };
}

/* ── Deret angka ──────────────────────────────────────────────────────────── */

function buatDeret(diff: Kesulitan): Omit<Soal, 'id' | 'kategori' | 'diff'> {
  const pola = diff === 'easy' ? acak(1, 1) : diff === 'medium' ? acak(1, 3) : acak(2, 5);
  const baris: number[] = [];
  let jawab = 0;
  let pembahasan = '';

  if (pola === 1) {
    const mulai = acak(2, 12);
    const beda = acak(2, 6);
    for (let i = 0; i < 4; i++) baris.push(mulai + beda * i);
    jawab = mulai + beda * 4;
    pembahasan = `Pola bertambah tetap +${beda}. ${mulai + beda * 3} + ${beda} = ${jawab}.`;
  } else if (pola === 2) {
    const mulai = acak(1, 9);
    const lompat = [2, 4, 6, 8];
    baris.push(mulai);
    for (const l of lompat.slice(0, 3)) baris.push((baris[baris.length - 1] as number) + l);
    jawab = (baris[baris.length - 1] as number) + 8;
    pembahasan = `Lompatannya bertambah 2: +2, +4, +6, +8. ${baris[baris.length - 1]} + 8 = ${jawab}.`;
  } else if (pola === 3) {
    const mulai = acak(1, 4);
    const rasio = acak(2, 3);
    for (let i = 0; i < 4; i++) baris.push(mulai * rasio ** i);
    jawab = mulai * rasio ** 4;
    pembahasan = `Pola dikali ${rasio} setiap langkah. ${mulai * rasio ** 3} × ${rasio} = ${jawab}.`;
  } else if (pola === 4) {
    const a1 = acak(2, 6);
    const b1 = acak(20, 30);
    baris.push(a1, b1, a1 + 2, b1 - 2, a1 + 4, b1 - 4);
    jawab = a1 + 6;
    pembahasan = `Dua deret berselang: urutan ganjil naik 2 (${a1}, ${a1 + 2}, ${a1 + 4}, ${jawab}), urutan genap turun 2.`;
  } else {
    const a = acak(1, 4);
    const b = acak(2, 6);
    baris.push(a, b, a + b, a + 2 * b, 2 * a + 3 * b);
    jawab = 3 * a + 5 * b;
    pembahasan = `Setiap suku = jumlah dua suku sebelumnya (seperti Fibonacci). ${2 * a + 3 * b} + ${a + 2 * b} = ${jawab}.`;
  }

  return {
    tag: 'DERET ANGKA (SPI)',
    tanya: `${baris.join('  ,  ')}  ,  ?`,
    jawab,
    satuan: '',
    input: 'numpad',
    pembahasan,
  };
}

/* ── Konversi satuan ──────────────────────────────────────────────────────── */

function buatSatuan(diff: Kesulitan): Omit<Soal, 'id' | 'kategori' | 'diff'> {
  if (diff === 'easy') {
    const mode = acak(1, 4);
    if (mode === 1) {
      const cm = acak(2, 30) * 50;
      const jawab = cm / 100;
      return {
        tag: 'KONVERSI SATUAN',
        tanya: `${cm} cm = ? m`,
        jawab,
        satuan: 'm',
        input: 'numpad',
        pembahasan: `1 m = 100 cm. ${cm} ÷ 100 = ${jawab} m.`,
      };
    }
    if (mode === 2) {
      const g = acak(2, 20) * 500;
      const jawab = g / 1000;
      return {
        tag: 'KONVERSI SATUAN',
        tanya: `${g} gram = ? kg`,
        jawab,
        satuan: 'kg',
        input: 'numpad',
        pembahasan: `1 kg = 1.000 gram. ${g} ÷ 1.000 = ${jawab} kg.`,
      };
    }
    if (mode === 3) {
      const menit = acak(2, 12) * 30;
      const jawab = menit / 60;
      return {
        tag: 'KONVERSI SATUAN',
        tanya: `${menit} menit = ? jam`,
        jawab,
        satuan: 'jam',
        input: 'numpad',
        pembahasan: `1 jam = 60 menit. ${menit} ÷ 60 = ${jawab} jam.`,
      };
    }
    const ml = acak(2, 20) * 250;
    const jawab = ml / 1000;
    return {
      tag: 'KONVERSI SATUAN',
      tanya: `${ml} mL = ? liter`,
      jawab,
      satuan: 'liter',
      input: 'numpad',
      pembahasan: `1 liter = 1.000 mL. ${ml} ÷ 1.000 = ${jawab} liter.`,
    };
  }

  if (diff === 'medium') {
    const mode = acak(1, 4);
    if (mode === 1) {
      const m = acak(2, 25) * 25;
      const jawab = m * 100;
      return {
        tag: 'KONVERSI SATUAN',
        tanya: `${m} m = ? cm`,
        jawab,
        satuan: 'cm',
        input: 'numpad',
        pembahasan: `1 m = 100 cm. ${m} × 100 = ${jawab} cm.`,
      };
    }
    if (mode === 2) {
      const kg = acak(2, 30) * 250;
      const jawab = kg * 1000;
      return {
        tag: 'KONVERSI SATUAN',
        tanya: `${kg} kg = ? gram`,
        jawab,
        satuan: 'gram',
        input: 'numpad',
        pembahasan: `1 kg = 1.000 gram. ${kg} × 1.000 = ${jawab} gram.`,
      };
    }
    if (mode === 3) {
      const jam = acak(2, 9) * 0.5;
      const jawab = jam * 60;
      return {
        tag: 'KONVERSI SATUAN',
        tanya: `${jam} jam = ? menit`,
        jawab,
        satuan: 'menit',
        input: 'numpad',
        pembahasan: `1 jam = 60 menit. ${jam} × 60 = ${jawab} menit.`,
      };
    }
    const liter = acak(2, 12) * 0.5;
    const jawab = liter * 1000;
    return {
      tag: 'KONVERSI SATUAN',
      tanya: `${liter} liter = ? mL`,
      jawab,
      satuan: 'mL',
      input: 'numpad',
      pembahasan: `1 liter = 1.000 mL. ${liter} × 1.000 = ${jawab} mL.`,
    };
  }

  const mode = acak(1, 3);
  if (mode === 1) {
    const km = acak(2, 12);
    const jawab = km * 1000;
    return {
      tag: 'KONVERSI SATUAN',
      tanya: `${km} km = ? meter`,
      jawab,
      satuan: 'meter',
      input: 'numpad',
      pembahasan: `1 km = 1.000 meter. ${km} × 1.000 = ${jawab} meter.`,
    };
  }
  if (mode === 2) {
    const ton = acak(2, 9) * 0.5;
    const jawab = ton * 1000;
    return {
      tag: 'KONVERSI SATUAN',
      tanya: `${ton} ton = ? kg`,
      jawab,
      satuan: 'kg',
      input: 'numpad',
      pembahasan: `1 ton = 1.000 kg. ${ton} × 1.000 = ${jawab} kg.`,
    };
  }
  const jam = acak(1, 4);
  const menit = acak(1, 11) * 5;
  const jawab = jam * 60 + menit;
  return {
    tag: 'KONVERSI SATUAN',
    tanya: `${jam} jam ${menit} menit = ? menit`,
    jawab,
    satuan: 'menit',
    input: 'numpad',
    pembahasan: `${jam} × 60 = ${jam * 60} menit. ${jam * 60} + ${menit} = ${jawab} menit.`,
  };
}

/* ── Logika & perbandingan (pilihan ganda) ────────────────────────────────── */

function buatLogika(diff: Kesulitan): Omit<Soal, 'id' | 'kategori' | 'diff'> {
  if (diff === 'easy') {
    /* Empat ekspresi, jawabannya yang paling BESAR.
       Nilainya HARUS empat-empatnya berbeda — kalau dua ekspresi kebetulan sama
       dan keduanya terbesar, tombol pilihan ganda akan punya dua jawaban benar.
       Karena itu diulang sampai unik; peluang gagal 40 kali berturut-turut
       praktis nol, dan kalau pun terjadi `buatPilihan` tetap menghasilkan empat
       angka berbeda (walau pengganggunya bukan ekspresi di soal). */
    let nilai: number[] = [];
    let tanya = '';
    for (let coba = 0; coba < 40; coba++) {
      const a = acak(3, 9);
      const b = acak(3, 9);
      const c = acak(4, 12);
      const d = acak(20, 40);
      const e = acak(4, 9);
      const f = acak(2, 5);
      const g = acak(2, 8);
      const h = acak(6, 15);
      nilai = [a * b, d - c, e * f, g + h];
      tanya = `${a} × ${b}   /   ${d} − ${c}   /   ${e} × ${f}   /   ${g} + ${h}`;
      if (new Set(nilai).size === 4) break;
    }
    const unik = [...new Set(nilai)];
    const terbesar = Math.max(...nilai);
    return {
      tag: 'PENALARAN — MANA PALING BESAR',
      tanya,
      jawab: terbesar,
      satuan: '',
      input: 'pilihan',
      pilihan: unik.length === 4 ? kocok(unik) : buatPilihan(terbesar, langkahUntuk(terbesar)),
      pembahasan: `Hitung tiap pilihan, lalu ambil yang terbesar: ${terbesar}.`,
    };
  }

  if (diff === 'medium') {
    const mode = acak(1, 2);
    if (mode === 1) {
      const x = acak(2, 5);
      const y = acak(3, 8);
      const bagian = acak(3, 12);
      const total = (x + y) * bagian;
      const jawab = y * bagian;
      return {
        tag: 'PERBANDINGAN SENILAI',
        tanya: `A : B = ${x} : ${y}. Jika total ${total}, berapa B?`,
        jawab,
        satuan: '',
        input: 'numpad',
        pembahasan: `Total bagian = ${x} + ${y} = ${x + y}. Satu bagian = ${total} ÷ ${x + y} = ${bagian}. B = ${y} × ${bagian} = ${jawab}.`,
      };
    }
    /* Jam selesai SENGAJA ditampilkan, bukan diminta: jawaban berupa jam:menit
       tidak bisa diketik di numpad tanpa aturan penulisan yang membingungkan
       (11.45 itu 11,45 jam atau 11:45?). Yang ditanya durasinya — itu angka. */
    const fmt = (n: number) => `${String(Math.floor(n / 60) % 24).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
    const mulai = acak(6, 9) * 60 + acak(0, 3) * 15;
    const durasi = acak(2, 7) * 30 + acak(0, 1) * 15;
    return {
      tag: 'WAKTU KERJA',
      tanya: `Mulai pukul ${fmt(mulai)} dan selesai pukul ${fmt(mulai + durasi)}. Berapa MENIT lama bekerjanya?`,
      jawab: durasi,
      satuan: 'menit',
      input: 'numpad',
      pembahasan: `Selisih waktu ${fmt(mulai)} → ${fmt(mulai + durasi)} = ${durasi} menit.`,
    };
  }

  // hard — rasio berbalik nilai
  const mesin1 = acak(3, 8);
  const jam1 = acak(4, 12);
  const mesin2 = mesin1 + acak(1, 4);
  const total = mesin1 * jam1;
  const jawab = total / mesin2;
  const bulat = Number.isInteger(jawab);
  return {
    tag: 'PERBANDINGAN BERBALIK NILAI',
    tanya: `${mesin1} mesin menyelesaikan order dalam ${jam1} jam. Berapa jam jika dipakai ${mesin2} mesin?`,
    jawab: bulat ? jawab : Math.round(jawab * 10) / 10,
    satuan: 'jam',
    input: 'numpad',
    pembahasan: `Total kerja = ${mesin1} × ${jam1} = ${total} jam-mesin. ${total} ÷ ${mesin2} = ${bulat ? jawab : (Math.round(jawab * 10) / 10).toFixed(1)} jam.`,
  };
}

/* ── Soal cerita dari bank server ─────────────────────────────────────────── */

function buatCerita(
  diff: Kesulitan,
  bank: SoalCeritaBank[],
  dipakai: Set<string>,
): Omit<Soal, 'id' | 'kategori' | 'diff'> | null {
  const cocok = bank.filter((s) => s.diff === diff && !dipakai.has(s.kode));
  // Kalau tingkat itu habis, jangan gagal: ambil dari seluruh bank yang belum
  // dipakai. Ronde yang berhenti di tengah karena bank kecil justru bug yang
  // dilaporkan pemilik pada versi HTML aslinya.
  const kandidat = cocok.length ? cocok : bank.filter((s) => !dipakai.has(s.kode));
  if (!kandidat.length) return null;
  const s = pilih(kandidat);
  dipakai.add(s.kode);
  return {
    tag: s.tag,
    tanya: s.q,
    jawab: s.ans,
    satuan: s.unit,
    input: 'pilihan',
    pilihan: buatPilihan(s.ans, langkahUntuk(s.ans)),
    pembahasan: s.exp,
  };
}

/* ── Ronde ────────────────────────────────────────────────────────────────── */

const URUTAN: Kesulitan[] = ['easy', 'medium', 'hard'];

/**
 * Bentuk satu ronde. `kesulitan = 'mixed'` mengacak tingkat PER SOAL — sama
 * seperti versi HTML aslinya.
 *
 * `bank` hanya diperlukan kategori `cerita`; untuk kategori lain boleh kosong
 * (halaman tetap bisa dipakai walau bank cerita gagal dimuat).
 */
export function buatRonde(
  kategori: KategoriId,
  kesulitan: KesulitanPilih,
  jumlah: number,
  bank: SoalCeritaBank[] = [],
): Soal[] {
  const hasil: Soal[] = [];
  const dipakai = new Set<string>();
  const tingkat = (): Kesulitan => (kesulitan === 'mixed' ? pilih(URUTAN) : kesulitan);

  for (let i = 0; i < jumlah; i++) {
    const diff = tingkat();
    let isi: Omit<Soal, 'id' | 'kategori' | 'diff'> | null = null;

    if (kategori === 'kraepelin') isi = buatKraepelin(diff);
    else if (kategori === 'kabataku') isi = buatKabataku(diff);
    else if (kategori === 'deret') isi = buatDeret(diff);
    else if (kategori === 'satuan') isi = buatSatuan(diff);
    else if (kategori === 'logika') isi = buatLogika(diff);
    else isi = buatCerita(diff, bank, dipakai);

    if (!isi) break;
    hasil.push({ ...isi, id: `${kategori}-${i}-${Math.random().toString(36).slice(2, 7)}`, kategori, diff });
  }

  return hasil;
}

/**
 * Bandingkan jawaban siswa dengan kunci.
 *
 * Toleransi 1e-9, bukan `===`: jawaban desimal (2,5 / 7,5 / 112,5) melewati
 * `parseFloat` dan pembulatan float bisa membuat selisih 1e-16. Koma diterima
 * sebagai pemisah desimal karena papan ketik Indonesia memakainya.
 */
export function jawabanBenar(masukan: string, kunci: number): boolean {
  const bersih = masukan.trim().replace(',', '.');
  if (!bersih) return false;
  const n = Number.parseFloat(bersih);
  if (!Number.isFinite(n)) return false;
  return Math.abs(n - kunci) < 1e-9;
}

/** Format jawaban untuk ditampilkan di daftar evaluasi. */
export function tampilAngka(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100).replace('.', ',');
}
