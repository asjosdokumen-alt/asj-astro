/**
 * accentClass.ts — the accent-role → utility map, in one place.
 *
 * WHY THIS EXISTS
 * ---------------
 * The six accent roles (DESIGN.md §3.2) map onto semantic colour tokens, and that
 * mapping is needed by every component that paints an accent: section titles, bento
 * tiles, list rows, step numbers. Writing it out per component is how the closed
 * list quietly becomes an open one — the seventh role gets invented at a call site
 * because adding it there was easier than adding it here.
 *
 * Each value is a token utility (`text-accent`, `text-accent-sky`, …) rather than a
 * palette step, so the colour follows the theme instead of being pinned. That is
 * also why there is no dark/light pair here: `theme.css` already flips the token.
 *
 * TYPES. `AccentRole` is exported so a component can accept a role and get a
 * compile error on a seventh value, rather than silently falling through to a
 * default colour.
 */
export type AccentRole = 'identity' | 'jobs' | 'program' | 'exam' | 'critical' | 'legal';

export const ACCENT_TEXT: Record<AccentRole, string> = {
  identity: 'text-accent',
  jobs: 'text-accent-sky',
  program: 'text-accent-emerald',
  exam: 'text-accent-amber',
  critical: 'text-accent-red',
  legal: 'text-accent-violet',
};

/**
 * Border tint for tiles that carry an accent edge. Kept as a separate map rather
 * than derived from the text class, because Tailwind emits utilities on demand and
 * a computed name would never appear in the stylesheet — the class would exist in
 * the markup and style nothing, which `verify:classes` would then flag.
 */
export const ACCENT_BORDER: Record<AccentRole, string> = {
  identity: 'border-accent/40',
  jobs: 'border-accent-sky/40',
  program: 'border-accent-emerald/40',
  exam: 'border-accent-amber/40',
  critical: 'border-accent-red/40',
  legal: 'border-accent-violet/40',
};
