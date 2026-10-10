/**
 * TESTS: kesetiaan template — gaya, dropdown, gambar, dan sel gabungan harus
 * SELAMAT saat CV diisi dari database.
 *
 * KENAPA TES INI ADA
 * ------------------
 * Keputusan pemilik 2026-10-10: ganti SheetJS (`xlsx`) ke exceljs. Alasannya
 * terukur, dan tes ini yang menjaganya supaya tidak diam-diam mundur:
 *
 *   SheetJS build komunitas TIDAK menulis gaya (`XLSX.write` tak pernah
 *   mengeluarkan atribut `s`) dan tidak membaca data validation sama sekali.
 *   Diukur pada template rirekisho nyata: 62 sel bergaya -> 0, dropdown 8 -> 0,
 *   gambar tertanam hilang, pengaturan cetak hilang.
 *
 * Tes ini mengunci DUA hal yang berbeda:
 *   1. Mengisi nilai TIDAK merusak apa pun (gaya/dropdown/gambar/merges utuh).
 *   2. Menambah baris riwayat mewarisi gaya baris template DAN menggeser
 *      dropdown + sel gabungan yang ada di bawahnya — tiga hal yang `spliceRows`
 *      tidak kerjakan sendiri.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { Workbook as ExcelWorkbook } from 'exceljs';
import {
  applyFieldMap,
  applyRiwayatBlock,
  detectRiwayatBlock,
  readWorkbook,
  workbookToXlsxBlob,
  type RiwayatBlock,
} from '../src/lib/cv-template-factory/loaders/tEMPLATE-loader';
import type { CandidateData } from '../src/lib/cv-template-factory/types';

const CAND = {
  identitas: { nama_lengkap: 'ARIA UJI' },
} as unknown as CandidateData;

/** Cacah gaya yang BENAR-BENAR terlihat (bukan sekadar ada objeknya). */
function census(ws: {
  eachRow: (o: { includeEmpty: boolean }, cb: (r: { eachCell: (o: { includeEmpty: boolean }, cb: (c: StyleProbe) => void) => void }) => void) => void;
}) {
  const out = { styled: 0, border: 0, fill: 0, align: 0, numFmt: 0 };
  ws.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      const j = JSON.stringify(cell.style ?? {});
      if (/"bold":true|"rgb"|"name":"|"sz":/.test(j)) out.styled++;
      if (cell.border && Object.values(cell.border).some((b) => b?.style)) out.border++;
      if (cell.fill && cell.fill.type === 'pattern') out.fill++;
      if (cell.alignment && (cell.alignment.horizontal || cell.alignment.vertical)) out.align++;
      if (cell.numFmt && cell.numFmt !== 'General') out.numFmt++;
    });
  });
  return out;
}

interface StyleProbe {
  style?: unknown;
  border?: Record<string, { style?: string } | undefined>;
  fill?: { type?: string };
  alignment?: { horizontal?: string; vertical?: string };
  numFmt?: string;
}

/**
 * Alamat dropdown, DIURUTKAN.
 *
 * Urutan kunci di `dataValidations.model` tidak bermakna dan exceljs menulisnya
 * dalam urutan berbeda setelah round-trip — membandingkan array apa adanya
 * membuat tes gagal hanya karena urutan, bukan karena ada dropdown yang hilang.
 */
function dvKeys(wb: ExcelWorkbook): string[] {
  return Object.keys((wb.worksheets[0].dataValidations as unknown as { model?: Record<string, unknown> }).model ?? {}).sort();
}

async function styled(wb: ExcelWorkbook): Promise<ExcelWorkbook> {
  return readWorkbook(new Uint8Array(await (await workbookToXlsxBlob(wb)).arrayBuffer()));
}

function need(block: RiwayatBlock | null): RiwayatBlock {
  if (block === null) throw new Error('blok riwayat tidak terdeteksi');
  return block;
}

describe('mengisi nilai TIDAK merusak tampilan template', () => {
  it('font, isi, border, perataan, dan format angka bertahan', async () => {
    const wb = new ExcelWorkbook();
    const ws = wb.addWorksheet('CV');
    ws.getCell('B2').value = 'AGUS KHOCI';
    ws.getCell('B2').font = { bold: true, size: 14 };
    ws.getCell('B2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CB' } };
    ws.getCell('B2').border = { top: { style: 'thin' }, bottom: { style: 'thin' } };
    ws.getCell('B2').alignment = { horizontal: 'center' };

    await applyFieldMap(wb, { B2: 'identitas.nama_lengkap' }, CAND);
    const out = await styled(wb);
    const cell = out.worksheets[0].getCell('B2');

    expect(cell.value).toBe('ARIA UJI');
    expect(cell.font?.bold).toBe(true);
    expect(cell.font?.size).toBe(14);
    expect(cell.fill?.fgColor?.argb).toBe('FFFFF2CB');
    expect(cell.border?.top?.style).toBe('thin');
    expect(cell.alignment?.horizontal).toBe('center');
  });

  it('dropdown (dataValidation) bertahan — SheetJS menghapusnya', async () => {
    const wb = new ExcelWorkbook();
    const ws = wb.addWorksheet('CV');
    ws.getCell('B2').value = 'AGUS KHOCI';
    ws.getCell('D1').dataValidation = { type: 'list', allowBlank: true, formulae: ['"SD,SMP,SMA"'] };
    expect(dvKeys(wb)).toEqual(['D1']);

    await applyFieldMap(wb, { B2: 'identitas.nama_lengkap' }, CAND);
    const out = await styled(wb);
    expect(dvKeys(out)).toEqual(['D1']);
  });

  it('sel gabungan bertahan', async () => {
    const wb = new ExcelWorkbook();
    const ws = wb.addWorksheet('CV');
    ws.getCell('A1').value = 'AGUS KHOCI';
    ws.mergeCells('A1:C1');

    await applyFieldMap(wb, { A1: 'identitas.nama_lengkap' }, CAND);
    const out = await styled(wb);
    expect(out.worksheets[0].model.merges).toContain('A1:C1');
  });
});

describe('baris riwayat tambahan mewarisi gaya template', () => {
  const SHEET = [
    ['RIWAYAT PENDIDIKAN', '', ''],
    ['Tingkat', 'Nama Sekolah', 'Tahun Masuk'],
    ['SD', 'SDN 1 CARANGREJO', '2013'],
    ['SMP', 'MTS AL-AZHAR', '2019'],
    ['SMA', 'MAN 1 PONOROGO', '2022'],
  ];
  const EX = [
    { tingkat: 'SD', sekolah: 'SDN 1 CARANGREJO', masuk: '2013' },
    { tingkat: 'SMP', sekolah: 'MTS AL-AZHAR', masuk: '2019' },
    { tingkat: 'SMA', sekolah: 'MAN 1 PONOROGO', masuk: '2022' },
  ];

  async function styledSheet(): Promise<ExcelWorkbook> {
    const wb = new ExcelWorkbook();
    const ws = wb.addWorksheet('CV');
    ws.addRows(SHEET as never[]);
    for (let r = 3; r <= 5; r++) {
      for (const col of ['A', 'B', 'C']) {
        ws.getCell(`${col}${r}`).border = { top: { style: 'thin' }, bottom: { style: 'thin' } };
      }
    }
    return wb;
  }

  it('baris baru punya border yang sama dengan baris contoh', async () => {
    const wb = await styledSheet();
    const block = need(await detectRiwayatBlock(wb, EX, 'tingkat'));
    await applyRiwayatBlock(wb, block, [
      ...EX,
      { tingkat: 'S1', sekolah: 'UNIV BRAWIJAYA', masuk: '2025' },
      { tingkat: 'S2', sekolah: 'UNIV INDONESIA', masuk: '2029' },
    ]);
    const out = await styled(wb);
    const ws = out.worksheets[0];
    expect(ws.getCell('B6').value).toBe('UNIV BRAWIJAYA');
    expect(ws.getCell('B6').border?.bottom?.style).toBe('thin');
    expect(ws.getCell('B7').border?.bottom?.style).toBe('thin');
    // baris contoh sendiri tidak boleh kehilangan gayanya
    expect(ws.getCell('B3').border?.bottom?.style).toBe('thin');
  });

  it('dropdown di BAWAH tabel ikut bergeser (termasuk rentang sumbernya)', async () => {
    const wb = await styledSheet();
    const ws0 = wb.worksheets[0];
    ws0.getCell('A7').dataValidation = { type: 'list', allowBlank: true, formulae: ['$J$7:$Z$7'] };
    expect(dvKeys(wb)).toEqual(['A7']);

    const block = need(await detectRiwayatBlock(wb, EX, 'tingkat'));
    await applyRiwayatBlock(wb, block, [
      ...EX,
      { tingkat: 'S1', sekolah: 'UNIV BRAWIJAYA', masuk: '2025' },
      { tingkat: 'S2', sekolah: 'UNIV INDONESIA', masuk: '2029' },
    ]);

    const out = await styled(wb);
    const keys = dvKeys(out);
    expect(keys).toEqual(['A9']);
    const model = (out.worksheets[0].dataValidations as unknown as { model: Record<string, { formulae?: string[] }> }).model;
    expect(model.A9.formulae).toEqual(['$J$9:$Z$9']);
  });
});

describe('template rirekisho nyata — diukur, bukan diasumsikan', () => {
  const SRC = 'deliverables/gstack/_rirekisho-excel-sample-2026-10-01.xlsx';

  it('gaya, dropdown, gambar, dan merges selamat dari read -> write', async () => {
    const wb = await readWorkbook(new Uint8Array(fs.readFileSync(SRC)));
    const before = census(wb.worksheets[0] as never);
    const dvBefore = dvKeys(wb);
    const imagesBefore = wb.worksheets[0].getImages().length;
    const mergesBefore = (wb.worksheets[0].model.merges ?? []).length;

    // Bukti bahwa template ini memang kaya gaya — kalau nol, tesnya tak bermakna.
    expect(before.styled).toBeGreaterThan(0);
    expect(before.border).toBeGreaterThan(0);
    expect(dvBefore.length).toBeGreaterThan(0);
    expect(imagesBefore).toBeGreaterThan(0);

    const out = await styled(wb);
    expect(census(out.worksheets[0] as never)).toEqual(before);
    expect(dvKeys(out)).toEqual(dvBefore);
    expect(out.worksheets[0].getImages().length).toBe(imagesBefore);
    expect((out.worksheets[0].model.merges ?? []).length).toBe(mergesBefore);
  });
});
