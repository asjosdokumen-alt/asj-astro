/**
 * rirekisho-detail.test.ts — form "Rirekisho Detail" (.xlsx).
 *
 * APA YANG DIJAGA, DAN KENAPA
 *   1. GEOMETRI. Template ini disalin dari berkas pemilik; kalau jumlah merge
 *      atau batas kolomnya bergeser, form cetaknya berubah bentuk tanpa satu pun
 *      error. Angka-angkanya dibekukan di sini.
 *   2. PRIVASI. Berkas sumbernya CV orang sungguhan. Template kosong yang masih
 *      memuat nama/alamat mereka akan mengirim data pribadi ke setiap kandidat
 *      yang mengunduh CV. Diuji dengan MEMBUKA zip-nya, bukan dengan percaya
 *      pada skrip generator.
 *   3. PETA SEL. Satu alamat salah = satu kolom CV salah isi. Setiap bagian
 *      (identitas, pendidikan, pekerjaan, keluarga) diuji terpisah.
 *   4. TIDAK MENGARANG. Kolom yang tidak punya data harus tetap kosong. Template
 *      contoh menulis `有` untuk 料理 dan `正常な視力` untuk 視力 — menyalinnya
 *      berarti mengklaim hal tentang kandidat yang tidak kita ketahui.
 */
import { describe, it, expect } from 'vitest';
import { RIREKISHO_DETAIL_BASE64 } from '../templates/rirekisho-detail.b64';
import { buildValues } from './rirekisho-detail';
import type { CandidateData } from '../types';

/** Kandidat kosong — semua bagian ada, semua nilai kosong. */
function kosong(): CandidateData {
  return {
    identitas: {},
    fisik: {},
    medis: {},
    pendidikan: [],
    pekerjaan: [],
    keluarga: [],
    sertifikasi: {},
    wawancara: {},
    kenalan_jepang: {},
    uploads: {},
    raw: {},
  } as CandidateData;
}

function kandidat(over: Partial<Record<keyof CandidateData, unknown>>): CandidateData {
  return { ...kosong(), ...over } as CandidateData;
}

async function bukaTemplate(): Promise<Record<string, string>> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(Buffer.from(RIREKISHO_DETAIL_BASE64, 'base64'));
  const out: Record<string, string> = {};
  for (const nama of Object.keys(zip.files)) {
    const berkas = zip.file(nama);
    // `zip.file()` mengembalikan null untuk entri direktori; `dir` sudah disaring
    // di bawah, tapi pemeriksaan null tetap ditulis supaya tidak perlu `!`.
    if (!berkas || zip.files[nama].dir) continue;
    out[nama] = await berkas.async('string');
  }
  return out;
}

describe('rirekisho-detail · geometri template', () => {
  it('punya 80 merge dan area A1:J40 — sama dengan berkas pemilik', async () => {
    const parts = await bukaTemplate();
    const sheet = parts['xl/worksheets/sheet1.xml'];
    expect((sheet.match(/<mergeCell /g) || []).length).toBe(80);
    expect(sheet.match(/<dimension[^>]*>/)?.[0]).toBe('<dimension ref="A1:J40"/>');
  });

  it('tidak menyimpan sel di luar kolom J', async () => {
    /* Sumbernya membawa 1 013 sel kosong bergaya sampai kolom AMI. Kalau itu
       kembali, `<dimension>` membengkak dan area cetak CV ikut melebar. */
    const parts = await bukaTemplate();
    const kolom = [...parts['xl/worksheets/sheet1.xml'].matchAll(/<c r="([A-Z]+)\d+"/g)].map(
      (m) => m[1],
    );
    const diLuar = kolom.filter((k) => k.length > 1 || k > 'J');
    expect([...new Set(diLuar)]).toEqual([]);
  });

  it('tab-nya bernama 履歴書, bukan nama orang', async () => {
    const parts = await bukaTemplate();
    expect(parts['xl/workbook.xml']).toContain('name="履歴書"');
  });
});

describe('rirekisho-detail · data pribadi sumber TIDAK ikut terbawa', () => {
  it('sharedStrings hanya berisi label, tanpa nama/alamat/kota asal', async () => {
    const parts = await bukaTemplate();
    const ss = parts['xl/sharedStrings.xml'];
    /* Diambil dari kedua berkas contoh: nama kandidat, nama orang tua/saudara,
       desa, dan kota. Kalau salah satunya muncul lagi, berkas template membawa
       data pribadi orang lain. */
    for (const kata of [
      'ALVIN', 'RENO', 'YON', 'ARICKH', 'SOIRIN', 'NURJANAH', 'SHALWA',
      'SLAMET', 'INDAH', 'PONOROGO', 'NGUJUNG', 'MANGGE', 'MAGETAN',
    ]) {
      expect(ss.toUpperCase(), `template masih memuat "${kata}"`).not.toContain(kata);
    }
  });

  it('foto contoh sudah diganti PNG 1x1', async () => {
    const parts = await bukaTemplate();
    // PNG 1x1 transparan: 8 byte tanda tangan + IHDR dengan lebar/tinggi 1.
    expect(parts['xl/media/image1.png'].length).toBeLessThan(200);
  });
});

describe('rirekisho-detail · identitas (baris 5-9)', () => {
  it('menulis nama, furigana, tanggal lahir, dan alamat ke sel yang benar', () => {
    const v = buildValues(
      kandidat({
        identitas: {
          nama_lengkap: 'BUDI SANTOSO',
          katakana: 'ブディ・サントソ',
          tgl_lahir: '2005-10-28',
          alamat: 'JL. MAWAR 3, MAGETAN',
        },
      }),
    );
    expect(v.C5).toBe('ブディ・サントソ');
    expect(v.C6).toBe('BUDI SANTOSO');
    expect(v.C7).toBe('2005年10月28日');
    expect(v.C8).toBe('JL. MAWAR 3, MAGETAN');
  });

  it('agama dan status nikah ditulis dalam bahasa Jepang', () => {
    const v = buildValues(
      kandidat({ identitas: { agama: 'ISLAM', status_nikah: 'BELUM MENIKAH' } }),
    );
    expect(v.G5).toBe('イスラム教');
    expect(v.G6).toBe('未婚');
  });

  it('umur DIHITUNG dari tanggal lahir, bukan disalin dari kolom umur', () => {
    /* Berkas contoh menulis `20 歳` untuk orang yang lahir 2005-10-28 — sudah
       basi. Umur yang tersimpan sebagai teks tidak pernah menua sendiri. */
    const lahir2000 = buildValues(
      kandidat({ identitas: { tgl_lahir: '2000-01-01', umur: '20' } }),
    );
    const tahun = new Date().getFullYear() - 2000;
    const harap = `${tahun} 歳`;
    expect(lahir2000.G7).toBe(harap);
    expect(lahir2000.G7).not.toBe('20 歳');
  });

  it('jatuh ke kolom umur kalau tanggal lahirnya tidak ada', () => {
    const v = buildValues(kandidat({ identitas: { umur: '23' } }));
    expect(v.G7).toBe('23 歳');
  });

  it('tanpa tanggal lahir dan tanpa umur: sel tetap kosong', () => {
    expect(buildValues(kosong()).G7).toBe('');
  });
});

describe('rirekisho-detail · personalia (baris 11-20)', () => {
  it('berat dan tinggi memakai satuan seperti form', () => {
    const v = buildValues(kandidat({ fisik: { bb: '65', tb: '173 cm' } }));
    expect(v.B12).toBe('65 kg');
    expect(v.E12).toBe('173 cm');
  });

  it('kelebihan/kekurangan/motivasi diambil dari blok wawancara', () => {
    const v = buildValues(
      kandidat({
        wawancara: {
          kelebihan: 'TEKUN',
          kekurangan: 'PEMALU',
          motivasi_ke_jepang: 'INGIN BELAJAR',
          tabungan: '200万円',
          rencana_pulang: 'USAHA TANI',
        },
      }),
    );
    expect(v.C14).toBe('TEKUN');
    expect(v.H14).toBe('PEMALU');
    expect(v.F16).toBe('INGIN BELAJAR');
    expect(v.F17).toBe('200万円');
    expect(v.F18).toBe('USAHA TANI');
  });

  it('menjawab 有/無 hanya kalau datanya ada', () => {
    const ya = buildValues(kandidat({ medis: { rokok: 'YA', alkohol: 'TIDAK', tato: 'TIDAK' } }));
    expect(ya.E13).toBe('有');
    expect(ya.I13).toBe('無');
    expect(ya.I12).toBe('無');
  });

  it('TIDAK mengarang jawaban untuk kolom yang tidak punya data', () => {
    /* Template contoh berisi `有` (料理), `正常な視力` (視力), dan `無`
       (在日親戚). Ketiganya tidak punya kolom database — menyalinnya berarti
       mengklaim hal tentang kandidat yang tidak kita ketahui. */
    const v = buildValues(kosong());
    expect(v.F15, '料理 tidak punya sumber data').toBe('');
    expect(v.B11, '視力 tidak punya sumber data').toBe('');
    expect(v.D15, '集団生活経験 kosong kalau kolomnya kosong').toBe('');
    expect(v.E11).toBe('');
    expect(v.J15).toBe('');
  });

  it('視力 diisi kalau angka matanya ada', () => {
    const v = buildValues(kandidat({ medis: { mata_kiri: '1.0', mata_kanan: '0.8' } }));
    expect(v.B11).toBe('1.0 / 0.8');
  });

  it('在留資格: 無 kalau negatif, dan kolom berikutnya kosong', () => {
    const tidak = buildValues(kandidat({ identitas: { visa_jepang: 'TIDAK' } }));
    expect(tidak.F19).toBe('無');
    expect(tidak.F20).toBe('');
  });
});

describe('rirekisho-detail · pendidikan (3 baris), pekerjaan (2 baris), keluarga (5 baris)', () => {
  it('pendidikan mengisi A/B/C/G/I pada 3 baris', () => {
    const v = buildValues(
      kandidat({
        pendidikan: [
          { masuk: '2012', lulus: '2018', sekolah: 'SDN 1', tingkat: '小学校' },
          { masuk: '2018', lulus: '2021', sekolah: 'SMPN 2', tingkat: '中学校' },
          { masuk: '2021', lulus: '2024', sekolah: 'SMKN 3', tingkat: '高等学校', jurusan: 'OTOMOTIF' },
        ],
      }),
    );
    expect(v.C23).toBe('SDN 1');
    expect(v.G23).toBe('小学校');
    expect(v.C25).toBe('SMKN 3');
    expect(v.I25).toBe('OTOMOTIF');
    // Tidak ada yang ditulis ke baris 26 — itu judul 職歴.
    expect(v.C26).toBeUndefined();
    expect(v.A26).toBeUndefined();
  });

  it('LPK TIDAK masuk 学歴, sehingga SD/SMP/SMK tetap tampil', () => {
    /* Pemilik 2026-11-04: "cukup sd smp smk … lpk gak perlu di masukkan".
       Kalau LPK ikut, ia mendorong SD keluar dari 3 baris — dan itulah yang
       terjadi sebelum penyaringan ini ada. */
    const v = buildValues(
      kandidat({
        pendidikan: [
          { masuk: '2012', lulus: '2018', sekolah: 'SDN MANGGE 3', tingkat: 'SD' },
          { masuk: '2018', lulus: '2021', sekolah: 'SMPN 2 BARAT', tingkat: 'SMP' },
          { masuk: '2021', lulus: '2024', sekolah: 'SMKN 2 JIWAN', tingkat: 'SMK', jurusan: 'TSM' },
          { masuk: '2024', lulus: '2026', sekolah: 'LPK AMANAH SAKURA JAPAN', tingkat: 'LPK' },
        ],
      }),
    );
    expect(v.C23).toBe('SDN MANGGE 3');
    expect(v.C24).toBe('SMPN 2 BARAT');
    expect(v.C25).toBe('SMKN 2 JIWAN');
    expect(Object.values(v)).not.toContain('LPK AMANAH SAKURA JAPAN');
  });

  it('lebih dari 3 riwayat: yang TERTUA dibuang, bukan yang terbaru', () => {
    /* `batasiRiwayatSekolah` membuang entri non-LPK paling tua supaya CV
       memuat pendidikan terakhir. Kalau arahnya terbalik, CV siswa SMK akan
       menampilkan SD-nya saja dan menghapus keahlian yang justru dijual. */
    const v = buildValues(
      kandidat({
        pendidikan: [
          { masuk: '2006', lulus: '2012', sekolah: 'SDN 1' },
          { masuk: '2012', lulus: '2015', sekolah: 'SMPN 2' },
          { masuk: '2015', lulus: '2018', sekolah: 'SMKN 3' },
          { masuk: '2018', lulus: '2022', sekolah: 'POLITEKNIK' },
        ],
      }),
    );
    expect(v.C23).toBe('SMPN 2');
    expect(v.C25).toBe('POLITEKNIK');
  });

  it('pekerjaan mengisi A/B/C/G dan berhenti di 2 baris', () => {
    const v = buildValues(
      kandidat({
        pekerjaan: [
          { masuk: '2025-05', keluar: '2025-11', perusahaan: 'SHOPEE', jabatan: 'GUDANG' },
          { masuk: '2026-01', keluar: '2026-05', perusahaan: 'NASI PADANG', jabatan: 'DAPUR' },
          { masuk: '2026-06', perusahaan: 'KETIGA' },
        ],
      }),
    );
    expect(v.C28).toBe('SHOPEE');
    expect(v.G28).toBe('GUDANG');
    expect(v.C29).toBe('NASI PADANG');
    expect(v.C30).toBeUndefined(); // baris 30 = judul 家族
  });

  it('pekerjaan yang masih berjalan ditulis 現在に至る, bukan kosong', () => {
    /* Tanpa cabang ini `new Date('SEKARANG')` = NaN dan selnya kosong, sehingga
       CV terbaca seperti orang yang berhenti kerja tanpa tanggal. */
    const v = buildValues(
      kandidat({
        pekerjaan: [{ masuk: '2025-05', keluar: 'SEKARANG', perusahaan: 'PABRIK' }],
      }),
    );
    expect(v.A28).toBe('2025/05');
    expect(v.B28).toBe('現在に至る');
  });

  it('keluarga mengisi A/D/E/F dan TIDAK menyentuh kolom I', () => {
    const v = buildValues(
      kandidat({
        keluarga: [
          { nama: 'SLAMET', hubungan: '父', usia: '45', pekerjaan: 'SATPAM' },
          { nama: 'INDAH', hubungan: '母', usia: '45', pekerjaan: 'IRT' },
        ],
      }),
    );
    expect(v.A32).toBe('SLAMET');
    expect(v.D32).toBe('父');
    expect(v.E32).toBe('45 歳');
    expect(v.F32).toBe('SATPAM');
    /* `I32` = 在日親戚 untuk baris pertama — `無` kalau tidak ada kenalan di
       Jepang, seperti berkas contoh. */
    expect(v.I32).toBe('無');
    /* `I33` berisi PERTANYAAN 「日本へ行く事に家族は」 di template aslinya —
       renderer tidak boleh menimpanya. `I34` jawabannya, jadi DITULIS (kosong
       kalau kolom `restu_keluarga` belum diisi). */
    expect(v.I33, 'I33 berisi pertanyaan template').toBeUndefined();
    expect(v.I34).toBe('');
    for (const sel of ['I35', 'I36']) {
      expect(v[sel], `${sel} tidak boleh ditulis`).toBeUndefined();
    }
  });

  /* Empat sel yang dulu kosong karena kolomnya belum ada (migrasi 044). */
  it('集団生活経験, 料理, 個人収入, 家族の賛否 terisi dari kolomnya', () => {
    const v = buildValues(
      kandidat({
        wawancara: {
          kelompok_tinggal: 'YA',
          bisa_memasak: 'YA',
          penghasilan: '3 juta',
          restu_keluarga: 'YA',
        },
      }),
    );
    expect(v.D15).toBe('有');
    expect(v.F15).toBe('有');
    expect(v.D17).toBe('3 JUTA');
    expect(v.I34).toBe('賛成');
  });

  it('jawaban 反対 ikut tercetak, bukan disembunyikan sebagai 無', () => {
    /* Keluarga yang MENOLAK adalah informasi penting bagi pengajar; menyamakannya
       dengan 無 akan menghilangkan alasan kenapa kandidat ini berisiko. */
    const v = buildValues(kandidat({ wawancara: { restu_keluarga: 'TIDAK' } }));
    expect(v.I34).toBe('反対');
  });

  it('kolom baru kosong: sel tetap kosong, tidak dikarang', () => {
    const v = buildValues(kosong());
    expect(v.F15).toBe('');
    expect(v.D17).toBe('');
    expect(v.I34).toBe('');
  });

  it('keluarga berhenti di 5 baris — baris 37 tidak ditulis', () => {
    const lima = Array.from({ length: 7 }, (_, i) => ({ nama: `ANAK ${i + 1}` }));
    const v = buildValues(kandidat({ keluarga: lima }));
    expect(v.A36).toBe('ANAK 5');
    expect(v.A37).toBeUndefined();
  });
});

describe('rirekisho-detail · peta sel tidak keluar dari form', () => {
  it('semua alamat yang ditulis berada di dalam A1:J40', () => {
    /* Satu alamat salah ketik (mis. `K23`) akan lolos tanpa error dan menulis
       ke kolom yang tidak dicetak — CV-nya tampak kosong di bagian itu. */
    const v = buildValues(
      kandidat({
        identitas: {
          nama_lengkap: 'A', katakana: 'ア', tgl_lahir: '2000-01-01', alamat: 'B',
          agama: 'ISLAM', status_nikah: 'BELUM', golongan_darah: 'O', visa_jepang: 'TIDAK',
        },
        fisik: { bb: '60', tb: '170', tangan_dominan: 'KANAN', tinggal_kursus_tahun: '1' },
        medis: { mata_kiri: '1', mata_kanan: '1', rokok: 'TIDAK', alkohol: 'TIDAK', tato: 'TIDAK', riwayat_medis: 'TIDAK' },
        wawancara: { kelebihan: 'X', kekurangan: 'Y', motivasi_ke_jepang: 'Z', tabungan: 'T', rencana_pulang: 'R' },
        pendidikan: [{ masuk: '2012', lulus: '2018', sekolah: 'S', tingkat: 'T', jurusan: 'J' }],
        pekerjaan: [{ masuk: '2025-01', keluar: '2025-02', perusahaan: 'P', jabatan: 'J' }],
        keluarga: [{ nama: 'N', hubungan: 'H', usia: '40', pekerjaan: 'P' }],
        sertifikasi: { catatan_cv: 'CATATAN' },
      }),
    );
    const diluar = Object.keys(v).filter((addr) => {
      const m = /^([A-Z]+)(\d+)$/.exec(addr);
      if (!m) return true;
      return m[1] > 'J' || Number(m[2]) > 40;
    });
    expect(diluar).toEqual([]);
  });
});

describe('rirekisho-detail · render penuh: nilai benar-benar masuk ke sel', () => {
  /**
   * Peta sel yang benar belum tentu menghasilkan berkas yang benar: `setCell`
   * hanya menulis bila alamatnya ADA di template, dan alamat yang salah ketik
   * dilewati TANPA suara. Tes ini membangun workbook sungguhan lalu MEMBACA
   * ULANG sel-nya dari zip hasil render — satu-satunya cara memastikan rantai
   * `buildValues → setCell → zip` utuh.
   *
   * `setCell` menulis `t="inlineStr"` (`<is><t>…</t></is>`), BUKAN indeks
   * sharedStrings. Pembaca pertama saya mengira shared string dan mengembalikan
   * string kosong untuk semua sel — tesnya merah padahal berkasnya benar.
   */
  async function renderBaca(
    data: CandidateData,
  ): Promise<{ baca: (a: string) => string; workbook: string; sheet: string }> {
    const { buildDetailWorkbook } = await import('./rirekisho-detail');
    const blob = await buildDetailWorkbook(data);
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const sheetFile = zip.file('xl/worksheets/sheet1.xml');
    const wbFile = zip.file('xl/workbook.xml');
    if (!sheetFile || !wbFile) throw new Error('workbook hasil render tidak lengkap');
    const sheet = await sheetFile.async('string');
    // Bukan `unescape`: itu nama fungsi global, dan menutupinya bikin biome merah.
    const bukaEntitas = (t: string) =>
      t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    const baca = (a: string): string => {
      /* `(?:/>|>…</c>)` WAJIB: sel kosong ditulis `<c r="C9" s="12"/>`, dan
         pola yang hanya mencari `>` akan mencocokinya lalu menelan isi sel
         BERIKUTNYA sampai `</c>` pertama — pembaca pertama saya mengembalikan
         angka milik sel lain karena itu. */
      const m = new RegExp(`<c r="${a}"([^>]*?)(?:/>|>([\\s\\S]*?)</c>)`).exec(sheet);
      if (!m || m[2] === undefined) return '';
      const inline = /<t[^>]*>([\s\S]*?)<\/t>/.exec(m[2]);
      if (inline) return bukaEntitas(inline[1]);
      const v = /<v>([^<]*)<\/v>/.exec(m[2]);
      return v ? v[1] : '';
    };
    return { baca, workbook: await wbFile.async('string'), sheet };
  }

  it('nama, furigana, alamat, keluarga, dan catatan terbaca kembali', async () => {
    const { baca } = await renderBaca(
      kandidat({
        identitas: {
          nama_lengkap: 'BUDI SANTOSO',
          katakana: 'ブディ・サントソ',
          tgl_lahir: '2000-01-01',
          alamat: 'JL. MAWAR 3',
        },
        keluarga: [{ nama: 'SLAMET', hubungan: '父', usia: '45', pekerjaan: 'SATPAM' }],
        sertifikasi: { catatan_cv: 'CATATAN UJI' },
      }),
    );
    expect(baca('C6')).toBe('BUDI SANTOSO');
    expect(baca('C5')).toBe('ブディ・サントソ');
    expect(baca('C8')).toBe('JL. MAWAR 3');
    expect(baca('A32')).toBe('SLAMET');
    expect(baca('E32')).toBe('45 歳');
    expect(baca('A40')).toBe('CATATAN UJI');
  }, 20000);

  it('sel yang tidak dipetakan tetap kosong — tidak ada tulisan liar', async () => {
    const { baca, sheet } = await renderBaca(kandidat({ identitas: { nama_lengkap: 'BUDI' } }));
    expect(baca('K5')).toBe('');
    expect(baca('C9')).toBe('');
    /* `I33` memuat PERTANYAAN template 「日本へ行く事に家族は」 sebagai shared
       string. Renderer tidak boleh menimpanya — kalau tertimpa, tipenya berubah
       jadi `inlineStr` dan pertanyaannya hilang dari form cetak. */
    expect(sheet).toMatch(/<c r="I33"[^>]*t="s"/);
  }, 20000);

  it('nama tab mengikuti nama kandidat, bukan nama orang di berkas sumber', async () => {
    const { workbook } = await renderBaca(
      kandidat({ identitas: { nama_lengkap: 'BUDI SANTOSO' } }),
    );
    expect(workbook).toContain('BUDI SANTOSO');
    expect(workbook).not.toContain('ALVIN');
  }, 20000);
});
