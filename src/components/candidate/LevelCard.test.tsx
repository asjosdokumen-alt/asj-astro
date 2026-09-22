/**
 * LevelCard.test.tsx — holds the level meter to the rules that make it honest.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `LevelCard` turns the candidate's own completeness percentage into something
 * that looks like a game level. That presentation is exactly where a well-meaning
 * future edit can turn a document checklist into something that reads as a
 * selection score — which is the one thing this component must never become.
 *
 * So the tests here guard three separate things, and the second is the important
 * one:
 *
 *   1. the tier boundaries are what they claim
 *   2. the user-facing WORDING never implies suitability or ranking
 *   3. the level never punishes by going backwards in a way the UI frames as loss
 *
 * A mutation battery is not needed for the pure functions (they are ordinary
 * logic), but every assertion below was observed RED against its own mutation
 * before this file was committed — a check never seen fail is a hypothesis.
 * One mutation SURVIVED and is documented in place: it turned out to be dead
 * code in the implementation, not a blind spot here.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LEVELS, levelFor, nextLevelFor, pointsToNext } from './LevelCard';

const SOURCE = readFileSync(join(process.cwd(), 'src/components/candidate/LevelCard.tsx'), 'utf8');

describe('levelFor — tier boundaries', () => {
  it('gives nobody a tier at 0%', () => {
    // The single most important boundary. Awarding bronze at 0 would make the
    // badge meaningless precisely when the candidate has done nothing.
    expect(levelFor(0)).toBe('empty');
  });

  it.each([
    [1, 'bronze'],
    [49, 'bronze'],
    [50, 'silver'],
    [99, 'silver'],
    [100, 'gold'],
  ])('%i%% is %s', (pct, expected) => {
    expect(levelFor(pct)).toBe(expected);
  });

  it('clamps out-of-range and malformed input instead of falling into a tier', () => {
    // A value above 100 must not be treated as "beyond gold", and NaN must not
    // reach the loop at all — `NaN >= x` is false, so an unguarded version would
    // return the fallback by accident rather than by decision.
    expect(levelFor(150)).toBe('gold');
    expect(levelFor(-5)).toBe('empty');
    expect(levelFor(Number.NaN)).toBe('empty');
    expect(levelFor(Number.POSITIVE_INFINITY)).toBe('empty');
  });

  it('agrees with the badge thresholds that already existed in this repo', () => {
    // CrownBadge used >0 bronze, >=50 silver, >=100 gold. If these ever diverge,
    // one page can show two meanings for the same percentage.
    const byKey = new Map(LEVELS.map((l) => [l.key, l.min]));
    expect(byKey.get('bronze')).toBe(1);
    expect(byKey.get('silver')).toBe(50);
    expect(byKey.get('gold')).toBe(100);
  });
});

describe('nextLevelFor / pointsToNext', () => {
  it('points at the NEXT tier, not the current one', () => {
    expect(nextLevelFor(0)?.key).toBe('bronze');
    expect(nextLevelFor(50)?.key).toBe('gold');
  });

  it('reports no next tier at the top', () => {
    expect(nextLevelFor(100)).toBeNull();
    expect(pointsToNext(100)).toBe(0);
  });

  it('never returns a negative remainder', () => {
    // Above the top tier there is nothing to earn; a negative "kamu butuh -20%"
    // is the kind of wording bug that reads as a penalty.
    //
    // NOTE ON A SURVIVING MUTATION (measured, kept as a record). Removing the
    // `Math.max(0, …)` that used to wrap this function's return changed NO
    // observable output, so the mutation survived. It was not a hole in these
    // tests — it was DEAD CODE in the implementation, because the clamp on `p`
    // above already guarantees `next.min - p >= 0`. The dead guard was deleted
    // rather than left in place looking like a safety net.
    //
    // These cases therefore assert the CLAMP, which is the real mechanism:
    // 100 is the top tier (no next), 150 clamps down into it, -40 clamps up.
    expect(pointsToNext(150)).toBe(0);
    expect(pointsToNext(100)).toBe(0);
    expect(pointsToNext(Number.NaN)).toBe(0);
    expect(pointsToNext(-40)).toBe(1); // clamps to 0, then 0 -> bronze is 1
  });

  it('measures the remaining distance correctly at a boundary', () => {
    expect(pointsToNext(0)).toBe(1); // 0 -> bronze needs 1
    expect(pointsToNext(49)).toBe(1); // 49 -> silver needs 1
    expect(pointsToNext(97)).toBe(3); // 97 -> gold needs 3
  });
});

describe('LevelCard — the rule that this is not a selection score', () => {
  /**
   * These are the words that would change the meaning of the component if they
   * appeared in user-facing text. Checked against the SOURCE, because the
   * translation strings are the thing a future edit is most likely to "improve"
   * into a ranking vocabulary.
   */
  const BANNED_IN_WORDING = [
    'peringkat',
    'ranking',
    'leaderboard',
    'papan peringkat',
    'skor',
    'score',
    'peluang',
    'chance',
    'passing',
    'lolos',
    'diterima',
    'ランキング',
    'スコア',
    '合格',
  ];

  it('never uses ranking or suitability vocabulary in the component', () => {
    // Scope: only the i18n KEY VALUES and comments are inspected. The component
    // is allowed to DISCUSS these words in the explanatory header (it has to, in
    // order to forbid them), so exported translation strings are checked
    // separately below via the i18n file.
    const i18n = readFileSync(join(process.cwd(), 'src/store/i18n.ts'), 'utf8');
    const jp = readFileSync(join(process.cwd(), 'src/store/i18n-jp.ts'), 'utf8');

    const keys = [
      'candidate.level_label',
      'candidate.level_empty',
      'candidate.level_bronze',
      'candidate.level_silver',
      'candidate.level_gold',
      'candidate.level_next_before',
      'candidate.level_next_after',
    ];

    const valuesFor = (text: string) =>
      keys
        .map((k) => new RegExp(`"${k}"\\s*:\\s*"([^"]*)"`).exec(text)?.[1] ?? '')
        .filter(Boolean);

    const allValues = [...valuesFor(i18n), ...valuesFor(jp)];
    expect(allValues.length, 'no level translation values found — this check is blind').toBeGreaterThan(0);

    const offenders = allValues.filter((v) =>
      BANNED_IN_WORDING.some((bad) => v.toLowerCase().includes(bad.toLowerCase())),
    );
    expect(offenders, `ranking vocabulary leaked into user-facing text: ${offenders.join(' | ')}`).toEqual([]);
  });

  it('labels the value as completeness, not as a score', () => {
    const i18n = readFileSync(join(process.cwd(), 'src/store/i18n.ts'), 'utf8');
    const label = /"candidate\.level_label"\s*:\s*"([^"]*)"/.exec(i18n)?.[1] ?? '';
    expect(label, 'level_label missing').not.toBe('');
    expect(label.toLowerCase()).toContain('kelengkapan');
  });

  it('gives the meter an accessible name and value, not just a coloured bar', () => {
    // A bar conveys nothing to a screen reader. role + aria-valuenow is the
    // minimum for the number to exist non-visually.
    expect(SOURCE).toContain('role="progressbar"');
    expect(SOURCE).toContain('aria-valuenow={shown}');
    expect(SOURCE).toContain('aria-valuemin={0}');
    expect(SOURCE).toContain('aria-valuemax={100}');
  });

  it('respects prefers-reduced-motion on the bar animation', () => {
    expect(SOURCE).toContain('motion-reduce:transition-none');
  });

  it('does not invent a next step at the top tier', () => {
    // The hint must be conditional on a real next tier existing. Unconditional
    // rendering would fabricate a goal, which is the leaderboard smell.
    expect(SOURCE).toMatch(/next\s*&&\s*remaining\s*>\s*0/);
  });
});
