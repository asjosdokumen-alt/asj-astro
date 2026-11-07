/**
 * GalleryGrid.tsx — the photo gallery (R3).
 *
 * WHY .tsx AND NOT .astro
 * -----------------------
 * Same reason as IconTileGrid.tsx, PersonGrid.tsx and StepList.tsx: it iterates,
 * and a `.map()` inside an `.astro` template is reported by the indexer as an
 * unresolved global. `indexer/src/build.test.ts` asserts zero unresolved records,
 * so the list lives here.
 *
 * NO LIGHTBOX, DELIBERATELY
 * -------------------------
 * The obvious next feature is a click-to-zoom overlay. It is not here because a
 * second modal component means a second focus trap, a second Escape handler and a
 * second scroll lock, and `e2e/test-dialog.mjs` already proves the app has exactly
 * one dialog contract. A gallery that opens its own overlay would be a third place
 * for that contract to drift. The tiles are large enough to read; zoom can arrive
 * later, reusing the existing modal, rather than inventing a parallel one.
 *
 * WHY `loading="lazy"` IS SET PER TILE AND NOT ON THE FIRST ONE
 * ------------------------------------------------------------
 * The first row is within a screen of the hero on a desktop viewport, so letting
 * it load eagerly gives a painted gallery instead of a pop-in. Everything after
 * the third tile is genuinely below the fold and is deferred.
 *
 * WHY THE ASPECT BOX IS EXPLICIT
 * ------------------------------
 * Every tile reserves `4 / 3` and the image inside uses `object-cover`. Without a
 * reserved box the nine images would each set their own height as they arrive and
 * push the footer down in nine steps — the same layout shift class the hero was
 * measured for.
 */
import type { GalleryItem } from '../../lib/gallery';

export interface Props {
  items: readonly GalleryItem[];
  class?: string;
}

export default function GalleryGrid({ items, class: className }: Props) {
  const grid = ['grid gap-4 sm:grid-cols-2 lg:grid-cols-3', className ?? ''].filter(Boolean).join(' ');

  return (
    // `data-scroll-item` — see §9f. The grid drifts with scroll; the real
    // photographs inside stay completely static (no idle `.u-alive`, no hover
    // `.u-zoom`), per owner ruling that only non-photo illustrations carry
    // moving animations on the landing page.
    <ul class={grid} data-scroll-item>
      {items.map((item, index) => (
        <li key={item.src} class="rounded-card overflow-hidden border border-line bg-surface">
          <div class="aspect-[4/3] overflow-hidden bg-surface-raised">
            {/* Real photographs stay static on purpose — continuous `.u-alive`
                and ambient motion overlays belong exclusively to non-photo
                illustrations on `/`. */}
            <img
              src={item.src}
              srcSet={item.srcSet}
              /* Tile = 3 kolom di lg (32vw ≈ 410 px @1280), 2 di sm, 1 di HP.
                 Diukur 2026-11-07: tile 383 px desktop / 331–352 px di HP —
                 angka di bawah mengikuti itu, bukan tebakan. */
              sizes="(min-width: 1024px) 32vw, (min-width: 640px) 48vw, 88vw"
              alt={item.alt}
              width={item.width}
              height={item.height}
              loading={index < 3 ? 'eager' : 'lazy'}
              decoding="async"
              class="h-full w-full object-cover"
            />
          </div>
          <p data-lang={item.captionKey} class="px-4 py-3 text-body-sm text-fg-muted">
            {item.caption}
          </p>
        </li>
      ))}
    </ul>
  );
}
