import { describe, it, expect } from 'vitest';
import { RIREKISHO_XLSX_BASE64 } from '../templates/rirekisho-xlsx.b64';
import {
  buildRirekishoWorkbook,
  buildValues,
  fitPhoto,
  patchAnchor,
  setCell,
} from './rirekisho-xlsx';
import type { CandidateData } from '../types';

const SHEET = 'xl/worksheets/sheet1.xml';
const DRAWING = 'xl/drawings/drawing1.xml';

/**
 * The geometry of the supplied workbook (`1.ANGGUN ARIANI__CV MAGANG COOP.xlsx`),
 * measured 2026-10-01 with a zip/XML probe. These are FROZEN on purpose.
 *
 * The owner's requirement is that the generated CV be the same size as the file
 * they sent — the photo must not stretch and no cell may be dropped even when it
 * is empty. Both are properties of these five numbers, so they are asserted
 * rather than described: a future edit that rebuilds the sheet instead of
 * patching it, or that trims "empty" rows, fails here instead of shipping a
 * shorter form.
 */
const SOURCE = {
  colElements: 9, // 9 <col> entries covering 26 columns (min/max ranges)
  rowElements: 1000,
  mergeCells: 83,
  cellElements: 25934,
  // 2026-10-29: kotak foto diturunkan dari bingkai SEL (A4:C14, 255x377 px),
  // bukan dari `ext` warisan berkas sumber (288x371 px = 33 px LEBIH LEBAR dari
  // bingkainya). Angka di sini = 251x373 px, yaitu bingkai dikurangi inset 2 px.
  photoCx: 2390775, // EMU — 251 px
  photoCy: 3552825, // EMU — 373 px
  // Nilai `ext` yang MASIH ADA di template (warisan berkas sumber). Dipakai
  // saat tidak ada foto: anchor tidak ditambal, jadi XML-nya tetap angka ini.
  templateCx: 2743200,
  templateCy: 3533775,
} as const;

async function loadZip(bytes: Uint8Array | Blob) {
  const JSZip = (await import('jszip')).default;
  return JSZip.loadAsync(bytes as never);
}

type Zip = Awaited<ReturnType<typeof loadZip>>;

/** Read a part, failing loudly instead of silently asserting against "". */
async function part(zip: Zip, path: string): Promise<string> {
  const file = zip.file(path);
  if (!file) throw new Error(`template is missing ${path}`);
  return file.async('string');
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const countCells = (xml: string) => (xml.match(/<c\s[^>]*?r="[A-Z]+\d+"/g) ?? []).length;
const countAll = (xml: string, re: RegExp) => (xml.match(re) ?? []).length;

/** The candidate whose workbook the template was extracted from. */
function anggun(): CandidateData {
  return {
    identitas: {
      nama_lengkap: 'ANGGUN ARIANI',
      katakana: 'アングン・アリアーニ',
      panggilan: 'アングン',
      tempat_lahir: 'LAMPUNG',
      tgl_lahir: '2007-06-11',
      umur: '19',
      gender: 'PEREMPUAN',
      agama: 'ISLAM',
      golongan_darah: 'O',
      status_nikah: 'BELUM MENIKAH',
      hp: '+62 878-4843-6446',
      alamat: 'DUSUN VI RT17 RW 6 KEL BUMI JAWA',
      alamat_jp: 'ハムレット VI RT17 RW 6 ブミ ジャワ',
      status_eks_jepang: 'TIDAK',
      paspor: 'TIDAK',
      sim: 'TIDAK',
    },
    fisik: { tb: '152', bb: '52', tangan_dominan: 'KANAN' },
    medis: { riwayat_medis: 'TIDAK' },
    pendidikan: [
      { masuk: '2014-07', lulus: '2017-06', sekolah: 'UPTD SMP N 2 PURBOLINGGA', jurusan: '' },
      { masuk: '2017-07', lulus: '2020-06', sekolah: 'SMA N 2 PURBOLINGGA', jurusan: 'IPA' },
    ],
    pekerjaan: [{ masuk: '2021-01', keluar: 'SEKARANG', perusahaan: 'CATERING HOME', jabatan: 'Staff' }],
    keluarga: [{ hubungan: 'IBU  母', nama: 'SUMIYATI', usia: '45', pekerjaan: 'IBU RUMAH TANGGA' }],
    sertifikasi: { jft: 'TIDAK', sim: 'TIDAK' },
    wawancara: { tujuan_ke_jepang_jp: '日本で働きたいです' },
    kenalan_jepang: { nama_id: '', nama_jp: '' },
    uploads: { photo: '' },
    raw: { idKandidat: 'P - 002' },
  } as unknown as CandidateData;
}

describe('rirekisho-xlsx · template geometry (the "same size as the original" contract)', () => {
  it('carries the source column widths, row heights and merges', async () => {
    const zip = await loadZip(b64ToBytes(RIREKISHO_XLSX_BASE64));
    const sheet = await part(zip, SHEET);

    expect(countAll(sheet, /<col\s/g)).toBe(SOURCE.colElements);
    expect(countAll(sheet, /<row\s/g)).toBe(SOURCE.rowElements);
    expect(countAll(sheet, /<mergeCell\s/g)).toBe(SOURCE.mergeCells);
    expect(countCells(sheet)).toBe(SOURCE.cellElements);
  });

  it('keeps the pas-foto anchor at the source size and position', async () => {
    const zip = await loadZip(b64ToBytes(RIREKISHO_XLSX_BASE64));
    const drawing = await part(zip, DRAWING);

    expect(drawing).toContain(`<xdr:ext cx="${SOURCE.templateCx}" cy="${SOURCE.templateCy}"/>`);
    expect(drawing).toContain('<xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>3</xdr:row>');
  });

  it('has no duplicate cell address, which would make setCell ambiguous', async () => {
    const zip = await loadZip(b64ToBytes(RIREKISHO_XLSX_BASE64));
    const sheet = await part(zip, SHEET);
    const addrs = sheet.match(/<c\s[^>]*?r="([A-Z]+\d+)"/g) ?? [];
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const a of addrs) {
      const id = /r="([A-Z]+\d+)"/.exec(a)?.[1] ?? '';
      if (seen.has(id)) dupes.push(id);
      seen.add(id);
    }
    expect(dupes).toEqual([]);
  });

  it('every address buildValues writes is actually rewritten by setCell', async () => {
    // Two different failures are possible here and BOTH are silent. An address the
    // template does not have makes setCell a no-op; so does an attribute order it
    // does not match, because setCell anchors on `<c r="X"` with `r` first.
    // Asserting that the sheet CHANGES catches both. Asserting only that the
    // address exists catches neither of the second kind — the template currently
    // writes `r` first in all 25,934 cells, and this is what would notice if that
    // ever stopped being true.
    const zip = await loadZip(b64ToBytes(RIREKISHO_XLSX_BASE64));
    const sheet = await part(zip, SHEET);
    const notRewritten = Object.keys(buildValues(anggun())).filter(
      (addr) => setCell(sheet, addr, 'X') === sheet,
    );
    expect(notRewritten).toEqual([]);
  });
});

describe('rirekisho-xlsx · setCell', () => {
  it('keeps the style index of the cell it rewrites', () => {
    const xml = '<row r="6"><c r="D6" s="21"/></row>';
    expect(setCell(xml, 'D6', 'ANGGUN ARIANI')).toBe(
      '<row r="6"><c r="D6" s="21" t="inlineStr"><is><t xml:space="preserve">ANGGUN ARIANI</t></is></c></row>',
    );
  });

  it('writes an empty value as a style-only cell instead of deleting it', () => {
    // "biarin tiap cell walau kosong jgn perpendek" — the border and fill live on
    // the cell, so removing it shortens the form.
    const xml = '<row r="21"><c r="F21" s="13"><is><t>stale</t></is></c></row>';
    expect(setCell(xml, 'F21', '')).toBe('<row r="21"><c r="F21" s="13"/></row>');
  });

  it('escapes XML metacharacters in the value', () => {
    const xml = '<c r="D6" s="21"/>';
    expect(setCell(xml, 'D6', 'A & B <C> "D"')).toContain('A &amp; B &lt;C&gt; &quot;D&quot;');
  });

  it('strips a stale shared-string type so the value is not resolved through sst', () => {
    const xml = '<c r="D6" s="21" t="s"><v>7</v></c>';
    const out = setCell(xml, 'D6', 'ANGGUN ARIANI');
    expect(out).not.toContain('t="s"');
    expect(out).toContain('t="inlineStr"');
  });

  it('leaves the sheet alone when the address is absent', () => {
    const xml = '<c r="D6" s="21"/>';
    expect(setCell(xml, 'Z99', 'x')).toBe(xml);
  });
});

describe('rirekisho-xlsx · fitPhoto never stretches', () => {
  const ratio = (r: { cx: number; cy: number }) => r.cx / r.cy;

  it('fills the CELL frame exactly for a frame-shaped photo', () => {
    // 251x373 px = kotak yang dihitung dari geometri sel A4:C14 (255x377) minus
    // inset 2 px tiap sisi.
    expect(fitPhoto(251, 373)).toEqual({
      cx: SOURCE.photoCx,
      cy: SOURCE.photoCy,
      colOff: 0,
      rowOff: 0,
    });
  });

  it('letterboxes a wide photo instead of widening it', () => {
    const fit = fitPhoto(1000, 100);
    expect(ratio(fit)).toBeCloseTo(10, 3);
    expect(fit.cx).toBeLessThanOrEqual(SOURCE.photoCx);
    expect(fit.cy).toBeLessThanOrEqual(SOURCE.photoCy);
    expect(fit.colOff).toBe(0);
    expect(fit.rowOff).toBeGreaterThan(0); // centred vertically
  });

  it('letterboxes a tall photo instead of stretching it', () => {
    const fit = fitPhoto(100, 1000);
    expect(ratio(fit)).toBeCloseTo(0.1, 3);
    expect(fit.cx).toBeLessThanOrEqual(SOURCE.photoCx);
    expect(fit.cy).toBeLessThanOrEqual(SOURCE.photoCy);
    expect(fit.rowOff).toBe(0);
    expect(fit.colOff).toBeGreaterThan(0); // centred horizontally
  });

  it('falls back to the bare anchor when the size is unknown', () => {
    expect(fitPhoto(0, 0)).toEqual({ cx: SOURCE.photoCx, cy: SOURCE.photoCy, colOff: 0, rowOff: 0 });
  });
});

describe('rirekisho-xlsx · patchAnchor', () => {
  it('rewrites the extent and both offsets', () => {
    const xml =
      '<xdr:ext cx="1" cy="2"/>' +
      '<xdr:from><xdr:col>0</xdr:col><xdr:colOff>5</xdr:colOff><xdr:row>3</xdr:row><xdr:rowOff>6</xdr:rowOff>';
    const out = patchAnchor(xml, { cx: 100, cy: 200, colOff: 7, rowOff: 8 });
    expect(out).toContain('<xdr:ext cx="100" cy="200"/>');
    expect(out).toContain('<xdr:colOff>7</xdr:colOff>');
    expect(out).toContain('<xdr:rowOff>8</xdr:rowOff>');
  });
});

describe('rirekisho-xlsx · buildValues', () => {
  const v = () => buildValues(anggun());

  it('fills the identity block at the addresses the source workbook uses', () => {
    const c = v();
    expect(c.D6).toBe('ANGGUN ARIANI');
    expect(c.D7).toBe('アングン・アリアーニ');
    expect(c.E4).toBe('P - 002');
    expect(c.H4).toBe('PEREMPUAN (女)');
    expect(c.H5).toBe('19');
    expect(c.H8).toBe('O');
    expect(c.D12).toBe('LAMPUNG');
    expect(c.D13).toBe('インドネシア');
    expect(c.E14).toBe('+62 878-4843-6446');
  });

  it('renders 生年月日 with the day, matching the cell\'s 年月日 number format', () => {
    // D10 is styled `yyyy"年"m"月"d"日"` in the source; text must carry the day.
    expect(v().D10).toBe('2007年6月11日');
  });

  it('renders the period columns as 年月, the shape the 期間 cells show', () => {
    expect(v().A20).toBe('2014年7月');
    expect(v().C20).toBe('2017年6月');
    expect(v().B20).toBe('-');
  });

  it('marks an open-ended job as 現在に至る', () => {
    expect(v().C25).toBe('現在に至る');
  });

  it('writes 無し for the relatives-in-Japan row when there are none', () => {
    expect(v().A45).toBe('無し');
  });

  it('never emits a key for a row the form does not have', () => {
    const rows = Object.keys(v())
      .map((k) => /^[A-Z]+(\d+)$/.exec(k)?.[1])
      .filter((r): r is string => !!r)
      .map(Number);
    expect(Math.max(...rows)).toBeLessThanOrEqual(SOURCE.rowElements);
  });
});

describe('rirekisho-xlsx · buildRirekishoWorkbook', () => {
  it('produces a workbook whose geometry is unchanged after a full fill', async () => {
    const blob = await buildRirekishoWorkbook(anggun());
    expect(blob.size).toBeGreaterThan(0);

    const zip = await loadZip(blob);
    const sheet = await part(zip, SHEET);

    // Nothing trimmed, nothing rebuilt: the form is exactly as long as the original.
    expect(countAll(sheet, /<row\s/g)).toBe(SOURCE.rowElements);
    expect(countAll(sheet, /<mergeCell\s/g)).toBe(SOURCE.mergeCells);
    expect(countCells(sheet)).toBe(SOURCE.cellElements);
    expect(countAll(sheet, /<col\s/g)).toBe(SOURCE.colElements);

    // And the values really landed.
    expect(sheet).toContain('ANGGUN ARIANI');
    expect(sheet).toContain('2007年6月11日');

    // Tanpa foto, anchor TIDAK ditambal — XML-nya masih angka template.
    const drawing = await part(zip, DRAWING);
    expect(drawing).toContain(`<xdr:ext cx="${SOURCE.templateCx}" cy="${SOURCE.templateCy}"/>`);
  });

  it('names the file <NAMA KANDIDAT>_CV, tanpa nama template', async () => {
    // Pemilik 2026-10-26: "penamaan nya namakandidat_CV, jgn digabung dengan
    // template". Nama kosong jatuh ke KANDIDAT, bukan berkas `_CV.xlsx`.
    const t = (await import('./rirekisho-xlsx')).default;
    const res = await t.render(anggun(), { waTarget: 'x', isAdmin: true });
    expect(res.success).toBe(true);
    expect(res.fileName).toBe('ANGGUN_ARIANI_CV.xlsx');
  });

  it('names the sheet tab after the candidate, not the template', async () => {
    const t = (await import('./rirekisho-xlsx')).default;
    const res = await t.render(anggun(), { waTarget: 'x', isAdmin: true });
    if (!res.blob) throw new Error('render tidak menghasilkan blob');
    const zip = await loadZip(new Uint8Array(await res.blob.arrayBuffer()));
    const wb = await part(zip, 'xl/workbook.xml');
    expect(wb).toContain('name="ANGGUN ARIANI"');
  });
});

/**
 * Kolom yang sudah ada tetapi tidak pernah dibaca (2026-10-27).
 *
 * `D45:G45` (関係/職業/年齢/住所 kenalan) punya kolomnya sejak migrasi 019 dan
 * terisi, `keluarga_N_gaji` sudah lama ditulis `buildRiwayatSlots`, dan `ssw`
 * belum pernah dicetak di form ini. Renderer lama hanya menulis NAMA kenalan.
 */
describe('rirekisho-xlsx · kolom yang sudah ada tetapi dulu tidak dibaca', () => {
  const lengkap = (): CandidateData => {
    const d = anggun();
    d.sertifikasi = { ...d.sertifikasi, ssw: '1号 飲食料品製造業', sertifikat_lain: '簿記3級', catatan_cv: 'Bersedia kerja shift' };
    d.kenalan_jepang = {
      nama_id: 'TANAKA', nama_jp: 'タナカ', hubungan_id: 'PAMAN', hubungan_jp: 'おじ',
      pekerjaan_id: 'KARYAWAN', pekerjaan_jp: '会社員', usia: '45',
      alamat_id: 'TOKYO', alamat_jp: '東京都新宿区',
    };
    d.keluarga = [{ ...(d.keluarga[0] as Record<string, unknown>), gaji: '120000' }];
    return d;
  };

  it('他資格 memuat SSW dan sertifikat lain', () => {
    expect(buildValues(lengkap()).H42).toBe('1号 飲食料品製造業 / 簿記3級');
  });

  it('付記 diisi catatan_cv', () => {
    expect(buildValues(lengkap()).A46).toBe('Bersedia kerja shift');
  });

  it('kenalan: hubungan, pekerjaan, usia, alamat ikut tercetak', () => {
    const c = buildValues(lengkap());
    expect(c.A45).toBe('タナカ');
    expect(c.D45).toBe('おじ');
    expect(c.E45).toBe('会社員');
    expect(c.F45).toBe('45');
    expect(c.G45).toBe('東京都新宿区');
  });

  it('月収 keluarga terisi dari kolom', () => {
    expect(buildValues(lengkap()).I29).toBe('¥   120000');
  });
});

// ==========================================
// 2026-10-29 — sel harus berisi nilai yang SAH untuk dropdown form ini
// ==========================================
// Semua kasus di bawah berasal dari data produksi (268 baris) dan dari daftar
// dropdown yang benar-benar tertanam di template (`K29:Z29` untuk 続柄,
// `J4:K4` gender, `J10:N10` agama, `J11:K11` untuk 有/無).
describe('rirekisho-xlsx · nilai sel cocok dengan daftar dropdown template', () => {
  it('続柄 memuat KANJI, dan ejaannya mengikuti daftar K29:Z29', () => {
    const d = anggun();
    d.keluarga = [
      { hubungan: 'AYAH', nama: 'A' },
      { hubungan: 'IBU  母', nama: 'B' },
      { hubungan: 'KAKAK PEREMPUAN', nama: 'C' },
      { hubungan: 'TETANGGA', nama: 'D' },
    ];
    const c = buildValues(d);
    // Dulu sel ini berisi "AYAH" saja: kolom 続柄 satu-satunya kolom Jepang
    // yang berisi huruf Latin, dan nilainya tidak ada di daftar dropdown.
    expect(c.A29).toBe('AYAH  父');
    // Nilai yang SUDAH bilingual tidak diubah menjadi satu bahasa.
    expect(c.A30).toBe('IBU  母');
    expect(c.A31).toBe('KAKAK PEREMPUAN  姉');
    // Hubungan yang tidak dikenal TIDAK dikarang kanjinya.
    expect(c.A32).toBe('TETANGGA');
  });

  it('kanji dari kolom `hubungan_jp` menang, dan bentuk sopan dirapikan', () => {
    const d = anggun();
    d.keluarga = [{ hubungan: 'AYAH', hubungan_jp: 'お父さん', nama: 'A' }];
    expect(buildValues(d).A29).toBe('AYAH  父');
  });

  it('旅券の有無 mencetak 有/無, BUKAN nomor paspor', () => {
    const d = anggun();
    d.identitas.paspor = 'C1234567';
    expect(buildValues(d).H12).toBe('ADA\u3000（有）');
  });

  it('`BELUM PERNAH` dan `TIDAK ADA` = 無, bukan 有', () => {
    const d = anggun();
    d.identitas.status_eks_jepang = 'BELUM PERNAH';
    d.medis.riwayat_medis = 'TIDAK ADA';
    const c = buildValues(d);
    expect(c.H11).toBe('TIDAK\u3000（無）');
    expect(c.H14).toBe('TIDAK\u3000（無）');
  });

  it('gender memakai ejaan daftar: `LAKI LAKI` (spasi), bukan `LAKI-LAKI`', () => {
    const d = anggun();
    d.identitas.gender = 'LAKI-LAKI';
    // 113 dari 268 kandidat memakai ejaan berstrip di database.
    expect(buildValues(d).H4).toBe('LAKI LAKI (男)');
  });

  it('agama memakai ejaan daftar J10:N10 (キリスト / ヒンドゥー)', () => {
    const d = anggun();
    d.identitas.agama = 'KRISTEN';
    expect(buildValues(d).H10).toBe('KRISTEN\u3000（キリスト）');
    d.identitas.agama = 'HINDU';
    expect(buildValues(d).H10).toBe('HINDU\u3000（ヒンドゥー）');
  });

  it('usia keluarga kosong tidak mencetak "歳" telanjang', () => {
    const d = anggun();
    d.keluarga = [{ hubungan: 'IBU', nama: 'B' }];
    expect(buildValues(d).F29).toBe('');
  });
});
