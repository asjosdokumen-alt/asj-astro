/**
 * companyProfile.test.ts — guards the company data module against the two ways it
 * can go wrong silently.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `companyProfile.ts` is a list of strings, and a wrong string here is not a
 * rendering bug — it is a published claim about a real company. Two specific
 * failures are one careless copy-paste away, and neither would be caught by any
 * other gate in this repo:
 *
 *   1. **The mockup's numbers.** The design reference showed "500+ kandidat",
 *      "200+ berangkat" and "50+ perusahaan Jepang". None of those appears in the
 *      official company profile. They look plausible, which is exactly the danger.
 *   2. **The disputed women's height.** Page 3 of the profile says 145 cm and page
 *      4 says 150 cm. Both are one character from the other, so "fixing" the
 *      omission by picking one is the most likely future edit — and it would
 *      publish a selection threshold nobody has confirmed.
 *
 * The i18n dictionary-coverage gate already proves every key here exists in both
 * dictionaries. This file proves the CONTENT is one we are allowed to publish.
 */
import { describe, expect, it } from 'vitest';
import * as profile from './companyProfile';
import {
  FACILITIES,
  FLOW_STEPS,
  HISTORY,
  LEGAL_FACTS,
  MISSIONS,
  PLACEMENTS,
  PLACEMENT_PREFECTURES,
  PROGRAMS,
  PROGRAM_INCLUDES,
  REQUIREMENTS,
  REQUIREMENT_DOCS,
  TEAM,
  VISION,
  WHY_JAPAN,
  type Text,
} from './companyProfile';

/** Every `Text` in the module, flattened, so the key rules can be checked once. */
function allTexts(): Text[] {
  const groups: Text[][] = [
    [VISION],
    MISSIONS,
    PROGRAM_INCLUDES,
    REQUIREMENTS,
    REQUIREMENT_DOCS,
  ];
  const tiles = [...WHY_JAPAN, ...PROGRAMS, ...FACILITIES];
  for (const tile of tiles) groups.push([tile.title, tile.body]);
  for (const step of FLOW_STEPS) groups.push([step.title, step.body]);
  for (const fact of [...LEGAL_FACTS, ...PLACEMENTS]) groups.push([fact.label]);
  return groups.flat();
}

/** Recursively collect every string reachable from a value. */
function walkStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const item of value) walkStrings(item, out);
  else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) walkStrings(item, out);
  }
  return out;
}

/**
 * Every string in EVERY export, discovered rather than listed.
 *
 * WHY NOT A HAND-WRITTEN LIST OF COLLECTIONS. The first version of this file
 * enumerated the collections it knew about, and a mutation test proved that was not
 * enough: adding a brand-new export containing "500+ kandidat" passed, because the
 * ban never looked at it. Walking the module's own exports means a future collection
 * is covered the moment it exists, with no edit here.
 *
 * WHY NOT SCAN THE SOURCE TEXT INSTEAD. Because this file's own docblock quotes the
 * banned figures while explaining them, so a source scan would flag the explanation.
 * Reading the module's VALUES sidesteps that: comments never become values.
 */
function everyExportedString(): string[] {
  return Object.values(profile).flatMap((value) => walkStrings(value));
}

describe('companyProfile — keys', () => {
  it('namespaces every key under profile.', () => {
    const bad = allTexts().filter((t) => !t.key.startsWith('profile.'));
    expect(bad.map((t) => t.key)).toEqual([]);
  });

  it('uses each key exactly once', () => {
    const keys = allTexts().map((t) => t.key);
    const seen = new Map<string, number>();
    for (const k of keys) seen.set(k, (seen.get(k) ?? 0) + 1);
    const dupes = [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k);
    // A duplicate key is not cosmetic: translateDataLang() writes the SAME string
    // into both elements, so the second one silently shows the first one's copy.
    expect(dupes).toEqual([]);
  });

  it('never ships an empty string', () => {
    const empty = everyExportedString().filter((s) => !s.trim());
    expect(empty).toEqual([]);
  });
});

describe('companyProfile — content we are NOT allowed to publish', () => {
  it('contains none of the mockup statistics', () => {
    // Measured against the official company profile: it states no candidate,
    // departure or partner count anywhere (docs/COMPANY_PROFILE_DATA.md §13).
    const banned = ['500+', '200+', '50+', '5+ tahun', 'sejak 2015', '2015'];
    const hits = everyExportedString().filter((s) => banned.some((b) => s.toLowerCase().includes(b)));
    expect(hits).toEqual([]);
  });

  it('contains neither disputed women\u2019s height figure', () => {
    // 145 cm (page 3) vs 150 cm (page 4). Only the figures BOTH pages agree on may
    // ship, and the men's 160 cm / 50 kg is the only such pair. If someone resolves
    // this by editing the module, this test is the thing that stops them publishing
    // an unconfirmed threshold — the owner decides, not the source file.
    const banned = ['145 cm', '150 cm', '145cm', '150cm'];
    const hits = everyExportedString().filter((s) => banned.some((b) => s.includes(b)));
    expect(hits).toEqual([]);
  });

  it('keeps the agreed men\u2019s figures, so the ban above is not vacuous', () => {
    // Without this, deleting the whole requirement row would also pass.
    const body = REQUIREMENTS.map((r) => r.text).join(' ');
    expect(body).toContain('160 cm');
    expect(body).toContain('50 kg');
  });

  it('carries no placeholder-shaped legal value', () => {
    const suspicious = /xxx|0000000|contoh|placeholder|isi di sini/i;
    const hits = LEGAL_FACTS.map((f) => f.value).filter((v) => suspicious.test(v));
    expect(hits).toEqual([]);
  });

  it('keeps every legal number in the shape the document prints it', () => {
    const byLabel = Object.fromEntries(LEGAL_FACTS.map((f) => [f.label.key, f.value]));
    // Exact strings from docs/COMPANY_PROFILE_DATA.md §2. A single mistyped digit in
    // a registration number is a false legal claim, and nothing else would catch it.
    expect(byLabel['profile.legal_sk']).toBe('AHU-0063921.AH.01.01.TAHUN 2023');
    expect(byLabel['profile.legal_regno']).toBe('4023082735107914');
    expect(byLabel['profile.legal_register']).toBe('AHU-0167587.AH.01.11.TAHUN 2023');
  });
});

describe('companyProfile — team (docs/COMPANY_PROFILE_DATA.md §4)', () => {
  it('names the Direktur and the Komisaris to the right people', () => {
    // The org chart on page 8 is signed "KOIRUL MUSTAKIM, Direktur", and it lists
    // TRIYA SUMARYATI as Komisaris. Two separate people. An earlier revision of the
    // module labelled Koirul Mustakim "Komisaris" and never mentioned Triya at all —
    // which is the failure mode this test exists for: a title is a claim about who
    // runs the company, and swapping two titles is invisible to every other gate.
    const byRole = new Map(TEAM.map((p) => [p.role.key, p.name]));
    expect(byRole.get('profile.team_direktur')).toBe('Koirul Mustakim');
    expect(byRole.get('profile.team_komisaris')).toBe('Triya Sumaryati');
  });

  it('gives every person the document publishes a name', () => {
    // §4 publishes Ayok Wahyu Saputro (Admin), Rian Hari Wijaya and Wiwit T Syafitri
    // (Instruktur Bahasa). Leaving them anonymous in the module understates the
    // structure the company actually printed — `name: null` is for a role the
    // document does NOT name, not for one it does.
    const named = TEAM.filter((p) => p.name).map((p) => p.name);
    for (const expected of [
      'Koirul Mustakim',
      'Triya Sumaryati',
      'Hadi Prasojo',
      'Ayok Wahyu Saputro',
      'Rian Hari Wijaya',
      'Wiwit T Syafitri',
    ]) {
      expect(named).toContain(expected);
    }
  });

  it('does not list one person twice in the same job', () => {
    // Hadi Prasojo holds Manager / Education & Training Manager — one post, not two.
    // He was previously listed as both Direktur AND Education Manager, which would
    // render two cards for one person and hand him a title the document gives to
    // someone else.
    const pairs = TEAM.map((p) => `${p.name ?? ''}|${p.role.key}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it('uses each role key exactly once', () => {
    const keys = TEAM.map((p) => p.role.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('companyProfile — history (docs/COMPANY_PROFILE_DATA.md §1, §2)', () => {
  it('dates the company to the deed the document prints', () => {
    // The landing page's "Tentang Kami" is required to carry sejarah. Every date
    // here comes from §1/§2 and is quoted, not inferred: the mockup's "Berdiri Sejak
    // 2015" is banned by a test above, so the only admissible year is 2023.
    const body = HISTORY.map((h) => `${h.title.text} ${h.body.text}`).join(' ');
    expect(body).toContain('2023');
    expect(body).toContain('15 Agustus 2023');
    expect(body).toContain('AHU-0063921.AH.01.01.TAHUN 2023');
  });

  it('has one entry per documented milestone', () => {
    expect(HISTORY).toHaveLength(3);
  });

  it('keeps every history key namespaced and unique', () => {
    const keys = HISTORY.flatMap((h) => [h.title.key, h.body.key]);
    expect(keys.filter((k) => !k.startsWith('profile.'))).toEqual([]);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('companyProfile — counts that must match the document', () => {
  it('has the documented cardinalities', () => {
    expect(WHY_JAPAN).toHaveLength(3); // page 2
    expect(PROGRAMS).toHaveLength(3); // page 3
    expect(PROGRAM_INCLUDES).toHaveLength(4); // page 3
    expect(FLOW_STEPS).toHaveLength(6); // page 3 — six steps, and step 5 stays one step
    expect(REQUIREMENTS).toHaveLength(7); // page 3
    expect(REQUIREMENT_DOCS).toHaveLength(7); // page 4, the longer of the two lists
    expect(MISSIONS).toHaveLength(4); // pages 2 and 5
    expect(LEGAL_FACTS).toHaveLength(6); // pages 6 and 7
    expect(FACILITIES).toHaveLength(6); // pages 11-15 plus the price inclusions
  });

  it('derives the prefecture list from the placements it belongs to', () => {
    // The hero stat and this list must not be able to disagree.
    expect(PLACEMENT_PREFECTURES).toHaveLength(4);
    const joined = PLACEMENTS.map((p) => p.value).join(' ');
    for (const pref of PLACEMENT_PREFECTURES) expect(joined).toContain(pref);
  });
});
