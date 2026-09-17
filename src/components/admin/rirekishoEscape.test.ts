// ==========================================
// TESTS: RirekishoBuilder — escaping invariant (playbook §4.2)
//
// The A4 sheet is rendered via dangerouslySetInnerHTML (baris ~237), so every
// candidate-controlled value (getDrafCvMaster + AIDATAJSON) MUST pass esc()
// before it is concatenated into the HTML string. Satu interpolasi mentah =
// stored XSS di sesi admin.
//
// Invariant di-pin di sini: payload <img src=x onerror=alert(1)> / <script>
// yang masuk ke builder mana pun keluar sebagai &lt;img / &lt;script —
// tidak pernah tag mentah.
// ==========================================
import { describe, it, expect } from 'vitest';
import {
  buildEduRows,
  buildJobRows,
  buildFamRows,
  buildCvIdentitas,
  buildKertasA4,
} from './RirekishoBuilder';
import { makeV } from '../../lib/helpers_cv';
const XSS = '<img src=x onerror=alert(1)>';
const SCRIPT = '<script>alert(1)</script>';

/** Tidak ada img/script mentah di html; versi ter-escape memang ada. */
function expectEscaped(html: string) {
  expect(html).not.toMatch(/<(img|script)/i);
  expect(html).toContain('&lt;img');
}

describe('buildEduRows — urutan baku SD → SMP → SMA di kertas A4 (parity legacy)', () => {
  /**
   * Extract the two NAMA SEKOLAH cells (colspan=2) per row, in render order.
   * All 5 rows always render and empty rows still emit a "-" placeholder, so
   * rows without a school are dropped rather than compared.
   */
  function sekolahInOrder(html: string): string[] {
    return html
      .split('<tr>')
      .slice(1)
      .map((r) => (r.split('</td>')[3] || '').replace(/<[^>]*>/g, '').replace(/-+$/, '').trim())
      .filter((s) => s && s !== '-');
  }

  it('masukan terbalik SMA/SMP/SD dirender SD → SMP → SMA', () => {
    const html = buildEduRows(
      [
        { tingkat: 'SMA', masuk: '2010-04', sekolah: 'SMAN 1' },
        { tingkat: 'SMP', masuk: '2007-07', sekolah: 'SMPN 3' },
        { tingkat: 'SD', masuk: '2001-07', sekolah: 'SDN 5' },
      ],
      makeV({}, {}),
    );
    // Baris berisi nama sekolah saja; baris kosong tetap dirender (padding).
    expect(sekolahInOrder(html)).toEqual(['SDN 5', 'SMPN 3', 'SMAN 1']);
    expect(html.indexOf('SDN 5')).toBeLessThan(html.indexOf('SMPN 3'));
    expect(html.indexOf('SMPN 3')).toBeLessThan(html.indexOf('SMAN 1'));
  });

  it('jenjang panjang terurut baku juga (SD/SMP/SMA/S1)', () => {
    const html = buildEduRows(
      [
        { tingkat: 'S1', masuk: '2015-09', sekolah: 'UNIV A' },
        { tingkat: 'SMA', masuk: '2008-07', sekolah: 'SMAN 2' },
        { tingkat: 'SMP', masuk: '2005-07', sekolah: 'SMPN 1' },
        { tingkat: 'SD', masuk: '1999-07', sekolah: 'SDN 9' },
      ],
      makeV({}, {}),
    );
    expect(sekolahInOrder(html)).toEqual(['SDN 9', 'SMPN 1', 'SMAN 2', 'UNIV A']);
  });

  it('TIDAK memutasi array pemanggil (data yang dipegang UI tidak ikut berubah)', () => {
    const input = [
      { tingkat: 'SMA', masuk: '2010-04', sekolah: 'SMAN 1' },
      { tingkat: 'SD', masuk: '2001-07', sekolah: 'SDN 5' },
    ];
    buildEduRows(input, makeV({}, {}));
    expect(input.map((e) => e.tingkat)).toEqual(['SMA', 'SD']);
  });
});

describe('buildJobRows / buildFamRows — kunci *_id dari CV AI tampil sebagai nama', () => {
  // Entri yang SUDAH dinormalkan di titik gabung (RirekishoBuilder.load →
  // normalizeRiwayatFor). Tanpa normalizer, nama perusahaan/jabatan/anggota
  // keluarga dirender kosong walau tanggal & gajinya ada.
  it('pekerjaan: perusahaan/jabatan bentuk kanonikal dirender', () => {
    const html = buildJobRows(
      [{ perusahaan: 'PT SEJAHTERA', jabatan: 'OPERATOR', masuk: '2015-03', keluar: '2018-09' }],
      makeV({}, {}),
    );
    expect(html).toContain('PT SEJAHTERA');
    expect(html).toContain('OPERATOR');
    expect(html).toContain('2015年3月');
  });

  it('keluarga: hubungan/nama/umur/pekerjaan dirender', () => {
    const html = buildFamRows(
      [{ hubungan: 'AYAH', nama: 'BUDI', umur: '55', pekerjaan: 'PETANI' }],
      makeV({}, {}),
    );
    expect(html).toContain('AYAH');
    expect(html).toContain('BUDI');
    expect(html).toContain('55歳');
    expect(html).toContain('PETANI');
  });
});

describe('RirekishoBuilder — invariant escape (playbook §4.2)', () => {
  it('buildEduRows — sekolah & jurusan dari master di-escape', () => {
    const html = buildEduRows(
      [{ masuk: '2015-04', lulus: '2018-03', sekolah: XSS, jurusan_id: SCRIPT }],
      makeV({}, {}),
    );
    expectEscaped(html);
  });

  it('buildEduRows — fallback v() (AIDATAJSON) juga di-escape', () => {
    const v = makeV({}, { PENDIDIKAN1NAMASEKOLAH: XSS, PENDIDIKAN1JURUSAN: SCRIPT });
    const html = buildEduRows([{}], v);
    expectEscaped(html);
  });

  it('buildJobRows — masuk/keluar/perusahaan/jabatan/gaji di-escape', () => {
    const html = buildJobRows(
      [{ masuk: XSS, keluar: XSS, perusahaan: XSS, jabatan: SCRIPT, gaji: XSS }],
      makeV({}, {}),
    );
    expectEscaped(html);
  });

  it('buildFamRows — nama/usia/hubungan/pekerjaan/gaji di-escape', () => {
    const html = buildFamRows(
      [{
        hubungan: XSS, hubungan_jp: XSS, nama: XSS, umur: XSS,
        pekerjaan: SCRIPT, pekerjaan_jp: XSS, gaji: XSS,
      }],
      makeV({}, {}),
    );
    expectEscaped(html);
  });

  it('buildCvIdentitas — nr/gd dikembalikan mentah, sheet yang meng-escape', () => {
    const id = buildCvIdentitas(makeV({}, { IDKANDIDAT: XSS, GOLONGANDARAH: SCRIPT }));
    // Kontrak: builder identitas mem-pypass nilai — pemanggil (sheet) wajib esc().
    expect(id.nr).toBe(XSS);
    const html = buildKertasA4({
      v: makeV({ NAMALENGKAP: XSS }, {}),
      foto: '', btn: '', tgl: XSS, wa: '62812',
      ...id, edu: '', job: '', fam: '',
    });
    expectEscaped(html);
  });
});
