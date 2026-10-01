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
  photoCx: 2743200, // EMU — 3.00in
  photoCy: 3533775, // EMU — 3.86in
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

    expect(drawing).toContain(`<xdr:ext cx="${SOURCE.photoCx}" cy="${SOURCE.photoCy}"/>`);
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

  it('reproduces the source placement exactly for a source-shaped photo', () => {
    // The supplied photo is 288x371 px, which at 96 DPI is the anchor box itself.
    expect(fitPhoto(288, 371)).toEqual({
      cx: SOURCE.photoCx,
      cy: SOURCE.photoCy,
      colOff: 0,
      rowOff: 0,
    });
  });

  it('letterboxes a wide photo instead of widening it', () => {
    const fit = fitPhoto(1000, 100);
    expect(ratio(fit)).toBeCloseTo(10, 5);
    expect(fit.cx).toBeLessThanOrEqual(SOURCE.photoCx);
    expect(fit.cy).toBeLessThanOrEqual(SOURCE.photoCy);
    expect(fit.colOff).toBe(0);
    expect(fit.rowOff).toBeGreaterThan(0); // centred vertically
  });

  it('letterboxes a tall photo instead of stretching it', () => {
    const fit = fitPhoto(100, 1000);
    expect(ratio(fit)).toBeCloseTo(0.1, 5);
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

    // The drawing still carries the source anchor when no photo was supplied.
    const drawing = await part(zip, DRAWING);
    expect(drawing).toContain(`<xdr:ext cx="${SOURCE.photoCx}" cy="${SOURCE.photoCy}"/>`);
  });

  it('names the file after the candidate, stripped of unsafe characters', async () => {
    const t = (await import('./rirekisho-xlsx')).default;
    const res = await t.render(anggun(), { waTarget: 'x', isAdmin: true });
    expect(res.success).toBe(true);
    expect(res.fileName).toBe('CV_Rirekisho_ANGGUN_ARIANI.xlsx');
  });
});
