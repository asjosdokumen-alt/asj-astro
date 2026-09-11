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
