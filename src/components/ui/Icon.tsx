/**
 * Icon.tsx — SVG sprite icon (Preact)
 *
 * Replaces Font Awesome's webfont + CDN CSS with a subset sprite built by
 * `npm run icons` (scripts/build-icon-sprite.mjs).
 *
 * The sprite lives at `/icons/sprite.svg` and is referenced via `<use>`.
 * This avoids inlining ~85 KB of SVG markup into every page's HTML,
 * saving bandwidth and reducing parse time on repeat navigation.
 *
 * SIZING / COLOUR
 * ---------------
 * The svg is `1em` square with `fill: currentColor`. That means every
 * existing call site keeps working unchanged — `text-2xl` scales it and
 * `text-pink-300` colours it, exactly like the old `<i>` did.
 *
 * ACCESSIBILITY
 * -------------
 * Decorative BY DEFAULT (aria-hidden). The old `<i>` elements frequently
 * omitted aria-hidden, so screen readers would announce nothing useful or,
 * worse, read out ligature junk. Pass `label` when the icon carries meaning
 * on its own (no adjacent text), which switches it to role="img".
 *
 * SYMBOL RESOLUTION
 * -----------------
 * The prefix (`fas-` vs `fab-`) comes from the generated manifest, NOT from
 * a prop. Brand glyphs such as `whatsapp` exist only under `fab-`, so a
 * caller writing `<Icon name="whatsapp" />` must not have to know that.
 */
import type { JSX } from 'preact';
import { SPRITE_IDS } from '../../icons/sprite-map';

export interface IconProps {
  /** Icon name, `fa-` prefix optional, e.g. "times", "fa-times", "whatsapp". */
  name: string;
  /** Rotate continuously. Replaces the `fa-spin` modifier class. */
  spin?: boolean;
  /** Extra classes — typically sizing (`text-2xl`) and colour. */
  class?: string;
  /**
   * Accessible name. Omit for decorative icons (the common case).
   * Provide it when the icon is the only thing conveying the meaning.
   */
  label?: string;
}

export default function Icon({
  name,
  spin = false,
  class: className,
  label,
}: IconProps): JSX.Element {
  // Defensive: allow "fas-times" or "fa-times" as well as "times".
  const bare = name.replace(/^fa[bsrl]?-/, '');
  const id = SPRITE_IDS[bare];

  if (!id && import.meta.env?.DEV) {
    console.warn(`[Icon] "${bare}" is not in the sprite — run \`npm run icons\`.`);
  }

  return (
    <svg
      class={['asj-icon', spin ? 'animate-spin' : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
      // 1em keeps `text-*` size utilities working; currentColor keeps
      // `text-*` colour utilities working.
      width="1em"
      height="1em"
      fill="currentColor"
      viewBox={undefined}
      // Never focusable — icons are never interactive on their own.
      focusable="false"
      aria-hidden={label ? undefined : 'true'}
      role={label ? 'img' : undefined}
      aria-label={label}
    >
      {/* Unknown name: render nothing rather than an invisible <use>, and
          say so in the console — a typo here is otherwise silent. */}
      {id ? <use href={`/icons/sprite.svg#${id}`} /> : null}
    </svg>
  );
}
