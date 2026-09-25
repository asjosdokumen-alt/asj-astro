/**
 * LevelCard.tsx — the candidate's progress presented as a level, not a score.
 *
 * WHY THIS EXISTS
 * ---------------
 * The dashboard already computed three completeness numbers
 * (`computeCvMiniProgress`, `computeCvMasterProgress`, `computeOverallProgress`)
 * and rendered them as a bare percentage plus a CrownBadge emoji. That is
 * accurate but it reads as bookkeeping. The owner asked to give the app a
 * game-like feel for a young audience, and the cheapest honest way to do that is
 * to present the number the candidate ALREADY has as a level with a visible
 * next step.
 *
 * NO NEW DATA, NO NEW BACKEND. Every value here is derived from numbers the
 * dashboard already fetched. Nothing is invented and nothing is stored.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * THE ONE RULE THIS COMPONENT EXISTS TO KEEP
 * ────────────────────────────────────────────────────────────────────────────
 * This is a COMPLETENESS meter, not a selection score.
 *
 * It is tempting to call this "rank", "score", or "XP" and to add a leaderboard.
 * Do not. These numbers measure how much of the candidate's own paperwork is
 * filled in. They do NOT measure suitability, and a job seeker must never be
 * shown a number they could reasonably read as "my chance of being accepted".
 * §6.2 of docs/ILLUSTRATION_SPEC.md states this; the test file enforces the
 * wording, because wording is what leaks the meaning.
 *
 * Corollary, also enforced: the level must never go DOWN as a punishment. If a
 * document is removed the bar reflects reality (that is honest), but nothing
 * here frames a decrease as failure — no red, no minus, no "you lost X".
 */
import { t } from '../../store/i18n';
import Icon from '../ui/Icon';

/**
 * The three tiers, lowest first. Thresholds are chosen to match the badges that
 * ALREADY existed in this repo (CrownBadge: >0 bronze, >=50 silver, >=100 gold)
 * so the page cannot show two different meanings for the same percentage.
 *
 * `key` values are stable identifiers used by the tests; the human-facing text
 * lives in i18n and is translated.
 */
export const LEVELS = [
  { key: 'bronze', min: 1, icon: 'circle' },
  { key: 'silver', min: 50, icon: 'star' },
  { key: 'gold', min: 100, icon: 'crown' },
] as const;

export type LevelKey = (typeof LEVELS)[number]['key'] | 'empty';

/**
 * Which level a completeness percentage corresponds to.
 *
 * 0 is deliberately its own case ("empty"), not bronze: a candidate who has not
 * filled anything has not earned a tier, and awarding bronze at 0% would make
 * the badge meaningless the moment it is most visible.
 */
export function levelFor(percent: number): LevelKey {
  // Clamp first: a malformed or out-of-range value must not silently land in
  // the gold branch, and NaN must not fall through to a tier either.
  if (!Number.isFinite(percent)) return 'empty';
  const p = Math.max(0, Math.min(100, percent));
  if (p <= 0) return 'empty';
  // Walk from the top down so the highest satisfied tier wins.
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (p >= LEVELS[i].min) return LEVELS[i].key;
  }
  return 'empty';
}

/** The next tier above `percent`, or null when already at the top. */
export function nextLevelFor(percent: number): { key: LevelKey; min: number } | null {
  if (!Number.isFinite(percent)) return null;
  const p = Math.max(0, Math.min(100, percent));
  const next = LEVELS.find((l) => p < l.min);
  return next ? { key: next.key, min: next.min } : null;
}

/**
 * Points remaining to the next tier. Never negative — at or above the top tier
 * this is 0, which is what the caller checks before rendering the hint.
 *
 * The clamp on `p` below is what makes the result non-negative: `nextLevelFor`
 * returns null at/above the top tier, and below it `next.min > p` by
 * construction. A mutation battery confirmed the `Math.max(...)` guard that used
 * to wrap the return was DEAD CODE — removing it changed no observable output,
 * because the clamp already guarantees the subtraction cannot go negative.
 * Dead code that looks like a safety net is worse than none: it implies a
 * guarantee is being defended here when it is actually defended above.
 */
export function pointsToNext(percent: number): number {
  const next = nextLevelFor(percent);
  if (!next) return 0;
  const p = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0;
  return Math.round(next.min - p);
}

export interface LevelCardProps {
  /** 0–100 completeness from `computeOverallProgress`. NOT a suitability score. */
  percent: number;
  /** Optional per-section completeness, shown as small bars. */
  mini?: number;
  master?: number;
}

export default function LevelCard({ percent, mini, master }: LevelCardProps) {
  const level = levelFor(percent);
  const next = nextLevelFor(percent);
  const remaining = pointsToNext(percent);

  // Rounded only for display; the tier decision above uses the raw value so a
  // 99.6% cannot display "100%" while still being bronze.
  const shown = Math.round(Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0);

  const label = level === 'empty' ? t('candidate.level_empty') : t(`candidate.level_${level}`);
  // Real sprite symbol, verified present in src/icons/sprite-map.ts. The `empty`
  // tier has no badge glyph — showing a tier icon at 0% would grant a reward for
  // nothing, which is the opposite of what this meter means.
  const iconName = level === 'empty' ? 'circle' : (LEVELS.find((l) => l.key === level)?.icon ?? 'circle');

  return (
    <div class="w-full max-w-xl mx-auto mb-6 text-left" data-level={level}>
      <div class="bg-black/60 border border-slate-700/60 rounded-[2rem] p-5">
        <div class="flex items-center justify-between flex-wrap gap-3 mb-3">
          <div class="flex items-center gap-3 min-w-0">
            <span
              class="flex-shrink-0 w-11 h-11 rounded-2xl grid place-items-center border border-slate-600/60 bg-slate-800/80 text-lg"
              aria-hidden="true"
            >
              <Icon name={iconName} />
            </span>
            <div class="min-w-0">
              <div class="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                {t('candidate.level_label')}
              </div>
              <div class="text-base md:text-lg font-black text-white truncate">{label}</div>
            </div>
          </div>
          <span class="text-2xl font-black text-white tabular-nums">{shown}%</span>
        </div>

        {/* The meter. `aria` carries the meaning for screen readers, since a
            coloured bar conveys nothing to them. */}
        <div
          class="h-2.5 bg-slate-800 rounded-full overflow-hidden border border-slate-700/50"
          role="progressbar"
          aria-valuenow={shown}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t('candidate.level_label')}
        >
          <div
            class="h-full bg-gradient-to-r from-emerald-600 to-sky-500 rounded-full transition-[width] duration-500 motion-reduce:transition-none"
            style={`width:${shown}%`}
          />
        </div>

        {/* Per-section breakdown, only when the caller supplies it. */}
        {(typeof mini === 'number' || typeof master === 'number') && (
          <div class="flex flex-wrap gap-x-5 gap-y-1.5 mt-3">
            {typeof mini === 'number' && (
              <span class="text-[11px] font-bold text-slate-400">
                {t('candidate.level_mini')}: <span class="text-slate-200 tabular-nums">{Math.round(mini)}%</span>
              </span>
            )}
            {typeof master === 'number' && (
              <span class="text-[11px] font-bold text-slate-400">
                {t('candidate.level_master')}:{' '}
                <span class="text-slate-200 tabular-nums">{Math.round(master)}%</span>
              </span>
            )}
          </div>
        )}

        {/* The next step. Omitted entirely at the top tier — there is no next
            step, and inventing one would be the leaderboard smell. */}
        {next && remaining > 0 && (
          <p class="text-[11px] text-slate-400 mt-3 font-bold">
            <Icon name="info-circle" class="mr-1 text-sky-400" />
            {t('candidate.level_next_before')} <span class="text-white">{remaining}%</span>{' '}
            {t('candidate.level_next_after')}
          </p>
        )}
      </div>
    </div>
  );
}
