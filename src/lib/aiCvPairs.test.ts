/**
 * aiCvPairs.test.ts — the paired ID↔JP registry for the AI CV form.
 *
 * Why these tests exist
 * ---------------------
 * The registry replaced a runtime DOM trick (`enableStaticPairSelects`,
 * `ai_form.ts:475-515`) that swapped `<input readonly>` for a `<select>` after
 * page load. That trick failed silently: if the field id was not found, the
 * loop simply skipped it and the form rendered a text box — no error, no
 * warning, and the reviewer saw a plausible screen.
 *
 * A registry can be checked directly, so the failure modes that used to be
 * invisible are asserted here instead of discovered by a candidate:
 *
 *   1. a pair that is one-directional (ID fills JP, but not the reverse);
 *   2. a partner key that names a column the form never sends;
 *   3. a value in a list colliding with a different list's value, so the
 *      partner lookup returns the wrong kanji.
 */
import { describe, it, expect } from 'vitest';
import {
  PAIRED_FIELDS,
  JP_HALF_OF,
  resolvePairEdit,
  jpOf,
  idOf,
  GENDER_PAIRS,
  AGAMA_PAIRS,
  GOLDAR_PAIRS,
  STATUS_NIKAH_PAIRS,
  YA_TIDAK_PAIRS,
  SEPATU_PAIRS,
  BAJU_PAIRS,
  TOPI_PAIRS,
  RIWAYAT_JEPANG_PAIRS,
} from './aiCvPairs';
import { AI_CV_FLAT_KEYS, AI_CV_PATHS } from './aiCvDraft';
import { PEKERJAAN } from './opsi-form';

describe('aiCvPairs — every pair is complete and two-directional', () => {
  it('every list has [id, jp] tuples with both halves non-empty', () => {
    const lists = {
      GENDER_PAIRS, AGAMA_PAIRS, GOLDAR_PAIRS, STATUS_NIKAH_PAIRS,
      YA_TIDAK_PAIRS, SEPATU_PAIRS, BAJU_PAIRS, TOPI_PAIRS, RIWAYAT_JEPANG_PAIRS,
    };
    for (const [name, list] of Object.entries(lists)) {
      expect(list.length, `${name} must not be empty`).toBeGreaterThan(0);
      for (const row of list) {
        expect(row, `${name} row must be a 2-tuple`).toHaveLength(2);
        expect(String(row[0]).trim(), `${name}: id half empty`).not.toBe('');
        expect(String(row[1]).trim(), `${name}: jp half empty`).not.toBe('');
      }
    }
  });

  it('no list repeats its ID half (a duplicate would make jpOf ambiguous)', () => {
    const lists = { GENDER_PAIRS, AGAMA_PAIRS, GOLDAR_PAIRS, STATUS_NIKAH_PAIRS, YA_TIDAK_PAIRS, SEPATU_PAIRS, BAJU_PAIRS, TOPI_PAIRS, RIWAYAT_JEPANG_PAIRS };
    for (const [name, list] of Object.entries(lists)) {
      const ids = list.map(([v]) => v);
      expect(new Set(ids).size, `${name} has a duplicate ID value`).toBe(ids.length);
    }
  });

  it('no list repeats its JP half (a duplicate would make idOf ambiguous)', () => {
    const lists = { GENDER_PAIRS, AGAMA_PAIRS, GOLDAR_PAIRS, STATUS_NIKAH_PAIRS, YA_TIDAK_PAIRS, SEPATU_PAIRS, BAJU_PAIRS, TOPI_PAIRS, RIWAYAT_JEPANG_PAIRS };
    for (const [name, list] of Object.entries(lists)) {
      const jps = list.map(([, v]) => v);
      expect(new Set(jps).size, `${name} has a duplicate JP value`).toBe(jps.length);
    }
  });

  it('JP_HALF_OF mirrors PAIRED_FIELDS — no pair is one-directional', () => {
    for (const [field, cfg] of Object.entries(PAIRED_FIELDS)) {
      if (!cfg.partner) continue;
      const back = JP_HALF_OF[cfg.partner];
      // A pair registered ID→JP but with no JP→ID entry means editing the
      // Japanese column by hand leaves the Indonesian column stale. That is
      // the exact drift the registry exists to prevent.
      expect(back, `${field} -> ${cfg.partner} has no reverse entry`).toBeDefined();
      expect(back.partner).toBe(field);
      expect(back.pairs).toBe(cfg.pairs);
    }
  });

  it('every partner column is a key the form actually sends', () => {
    // A partner that is not in AI_CV_FLAT_KEYS still lives in React state, but
    // it will never appear in the payload — the kanji would be typed, shown,
    // and then dropped on submit. Catching it here is cheaper than catching it
    // in production data.
    for (const cfg of Object.values(PAIRED_FIELDS)) {
      if (!cfg.partner) continue;
      expect(AI_CV_FLAT_KEYS as readonly string[]).toContain(cfg.partner);
      expect(AI_CV_PATHS[cfg.partner], `${cfg.partner} has no payload path`).toBeDefined();
    }
  });

  it('every paired field is itself a flat key', () => {
    for (const field of Object.keys(PAIRED_FIELDS)) {
      expect(AI_CV_FLAT_KEYS as readonly string[]).toContain(field);
    }
  });
});

describe('aiCvPairs — resolvePairEdit', () => {
  it('ID -> JP: choosing the Indonesian term fills the matching kanji', () => {
    const patch = resolvePairEdit('gender', 'PEREMPUAN');
    expect(patch).toEqual({ gender: 'PEREMPUAN', gender_jp: '女性' });
  });

  it('JP -> ID: editing the kanji column fills the Indonesian term', () => {
    const patch = resolvePairEdit('gender_jp', '男性');
    expect(patch).toEqual({ gender_jp: '男性', gender: 'LAKI-LAKI' });
  });

  it('fields with no partner column never invent one', () => {
    // Shoe size has no JP twin — the bilingual label lives in the one value.
    const patch = resolvePairEdit('sepatu', '40');
    expect(patch).toEqual({ sepatu: '40' });
    expect(Object.keys(patch)).toHaveLength(1);
  });

  it('a free-text value outside the registry is kept and overwrites nothing', () => {
    // Legacy guarded the same case: "nilai bebas di luar registry — partner
    // dibiarkan". Overwriting here would silently destroy a value the
    // candidate or an older AI wrote.
    const patch = resolvePairEdit('gender', 'LAKI-LAKI/BEBAS');
    expect(patch).toEqual({ gender: 'LAKI-LAKI/BEBAS' });
    expect(patch.gender_jp).toBeUndefined();
  });

  it('an empty value clears only its own field', () => {
    const patch = resolvePairEdit('status', '');
    expect(patch).toEqual({ status: '' });
    expect(patch.status_jp).toBeUndefined();
  });

  it('every paired enum maps its first value to a non-empty JP half', () => {
    // Guards against a list whose JP labels were left blank for some rows.
    for (const [field, cfg] of Object.entries(PAIRED_FIELDS)) {
      if (!cfg.partner) continue;
      const patch = resolvePairEdit(field, cfg.pairs[0][0]);
      expect(patch[cfg.partner], `${field} -> ${cfg.partner} produced nothing`).toBeTruthy();
    }
  });
});

describe('aiCvPairs — lookups', () => {
  it('jpOf / idOf round-trip every row', () => {
    for (const [id, jp] of STATUS_NIKAH_PAIRS) {
      expect(jpOf(STATUS_NIKAH_PAIRS, id)).toBe(jp);
      expect(idOf(STATUS_NIKAH_PAIRS, jp)).toBe(id);
    }
  });

  it('lookups return empty string for an unknown value rather than undefined', () => {
    // Callers branch on truthiness; returning undefined would still work but
    // leaks an unexpected type into the patch, which is how `undefined` ends up
    // in a controlled input and React switches it to uncontrolled.
    expect(jpOf(GENDER_PAIRS, 'NOPE')).toBe('');
    expect(idOf(GENDER_PAIRS, 'NOPE')).toBe('');
  });
});

/**
 * PEKERJAAN is the one list shared by TWO questions on the same form — the
 * candidate's own work history (`job.jabatan`) and their family members'
 * occupations (`fam.pekerjaan`) — so a defect in it appears twice, and the two
 * places have to offer the same set. These tests are about that sharing and
 * about which half of the label reaches the kanji column.
 */
describe('aiCvPairs — PEKERJAAN, the shared occupation list', () => {
  it('offers every occupation, with a Japanese gloss on each', () => {
    // The owner's report was "jenis pekerjaan ... kok dikit". The list is not
    // short (100 rows); what was missing was any test that the whole set is
    // reachable. A truncated or half-glossed entry would print a CV with an
    // occupation in Indonesian only, which the employer cannot read.
    expect(PEKERJAAN.length).toBe(100);
    for (const [id, label] of PEKERJAAN) {
      expect(String(id).trim(), 'occupation value empty').not.toBe('');
      // Every row must actually carry kanji, not just a Latin label — this is
      // the "ga sama form id jp nya" half of the report.
      expect(/[\u3000-\u30ff\u4e00-\u9fff]/.test(label), `${id}: no Japanese in ${JSON.stringify(label)}`).toBe(true);
    }
  });

  it('has no duplicate value (a duplicate makes one of the two rows unreachable)', () => {
    const ids = PEKERJAAN.map(([v]) => v);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('jpOf extracts the kanji, never the whole bilingual label', () => {
    // THE BUG THIS FIXES: PEKERJAAN labels are 'ID (kanji)', so returning
    // element 2 verbatim wrote 'OPERATOR PRODUKSI (工場作業員)' into jabatan_jp.
    // The employer's copy of the CV then showed the Indonesian term where the
    // Japanese belongs — the two halves of the CV disagreeing, which is the
    // exact failure this registry exists to prevent.
    expect(jpOf(PEKERJAAN, 'OPERATOR PRODUKSI')).toBe('工場作業員');
    expect(jpOf(PEKERJAAN, 'KASIR')).toBe('レジ係');
  });

  it('no jpOf result ever carries the ID label or its brackets', () => {
    // Asserted over the whole list rather than three samples: the convention is
    // uniform today, and this is the test that fails if one entry is added in
    // the other shape.
    for (const [id] of PEKERJAAN) {
      const jp = jpOf(PEKERJAAN, id);
      expect(jp, `${id}: jpOf returned empty`).not.toBe('');
      expect(jp, `${id}: kanji half still contains brackets`).not.toMatch(/[（()）]/);
      expect(jp, `${id}: kanji half still contains the ID text`).not.toContain(id);
    }
  });

  it('idOf accepts the pure kanji that jpOf writes (the two must be inverse)', () => {
    // Before the fix idOf matched the raw label, so round-tripping a PEKERJAAN
    // row was impossible: jpOf wrote '工場作業員' and idOf could not read it back.
    for (const [id] of PEKERJAAN.slice(0, 20)) {
      expect(idOf(PEKERJAAN, jpOf(PEKERJAAN, id))).toBe(id);
    }
  });
});
