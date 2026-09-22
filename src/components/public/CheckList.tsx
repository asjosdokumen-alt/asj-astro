/**
 * CheckList.tsx — a short list of items that all share one icon and one accent.
 *
 * WHY THIS EXISTS
 * ---------------
 * Four blocks on the landing page are the same shape: the programme inclusions, the
 * requirements, the document checklist, and the four mission points. Each is "a
 * marker and a line of text", and writing that markup four times is how the icon, the
 * gap and the accent end up different in each one.
 *
 * The missions are an `<ol>` and the other three are `<ul>`, and the difference is
 * not cosmetic: a mission list is an enumeration of points the document numbers, so
 * order is meaningful and the element should say so. That is why `as` is a prop
 * rather than a fixed choice — the caller knows, this component does not.
 *
 * WHY .tsx AND NOT .astro — see the long note in IconTileGrid.tsx. Short version: it
 * iterates, and iterating inside an `.astro` template breaks the indexer's
 * zero-unresolved invariant.
 */
import Icon from '../ui/Icon';
import { ACCENT_TEXT, type AccentRole } from '../../lib/accentClass';
import type { Text as ProfileText } from '../../lib/companyProfile';

export interface Props {
  items: ProfileText[];
  /** Sprite icon name for every marker. */
  icon?: string;
  accent?: AccentRole;
  /** `ol` when the order carries meaning, `ul` otherwise. */
  as?: 'ul' | 'ol';
  class?: string;
}

export default function CheckList({
  items,
  icon = 'check-circle',
  accent = 'identity',
  as = 'ul',
  class: className,
}: Props) {
  const list = ['space-y-3', className ?? ''].filter(Boolean).join(' ');
  const marker = `mt-0.5 shrink-0 ${ACCENT_TEXT[accent]}`;

  const children = items.map((item) => (
    <li key={item.key} class="flex items-start gap-2 text-body-sm text-fg-muted">
      <Icon name={icon} class={marker} />
      <span data-lang={item.key}>{item.text}</span>
    </li>
  ));

  // Two literal branches rather than a dynamic tag: `indexer/src/build.test.ts:502`
  // requires zero unresolved `template-component` records on this tree.
  return as === 'ol' ? <ol class={list}>{children}</ol> : <ul class={list}>{children}</ul>;
}
