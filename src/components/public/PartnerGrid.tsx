/**
 * PartnerGrid.tsx — the "Mitra Kami" grid: one slot per MoU partner.
 *
 * WHY THE SLOTS CAN BE EMPTY, AND WHY THAT IS THE WHOLE POINT
 * -----------------------------------------------------------
 * ASJ is a small LPK without SO status, so the departure to Japan is executed
 * by partner LPKs/PTs (SOs) under an MoU. The owner asked for this section to be
 * built now, with the names filled in later. So a slot renders EITHER a named
 * partner with a logo OR an honest "not yet published" state — and the empty
 * state is a first-class rendering, not a placeholder to be replaced.
 *
 * The alternative — writing six plausible company names so the grid looks
 * finished — would put a real company's name on a partnership it never agreed
 * to. A blank card costs a little polish; a fabricated one is a false statement
 * about a third party on a page whose entire purpose is to be trusted by
 * prospective MoU partners. The blank is the cheaper mistake by a wide margin.
 *
 * WHY THE EMPTY STATE IS NOT SILENTLY HIDDEN
 * ------------------------------------------
 * An unfilled slot could be dropped from the DOM, which would make the section
 * look finished at a glance. It is kept VISIBLE on purpose: the section should
 * read as "the network exists and here is where each partner goes", and a grid
 * that grows from 0 to 6 cards as names arrive would hide exactly how much of
 * the MoU work is still outstanding. The `data-filled` attribute on each <li>
 * lets a test count filled vs empty without reading the copy.
 *
 * ── WHY THE SCROLL DRIFT IS ON THE <ul>, NOT THE <li> ──────────────────────
 * Same rule as PersonGrid/IconTileGrid (motion.css §9d, measured): a CSS
 * animation on `transform` overrides a `transition` on the same property of the
 * SAME element, so a scroll-linked transform on the card would silently kill the
 * card's hover recipe. The container carries `data-scroll-item` and the drift
 * lands on `[data-scroll-item] > *`, so the card's own transform stays free.
 *
 * ── WHY .tsx AND NOT .astro ────────────────────────────────────────────────
 * It iterates, and iterating inside an `.astro` template breaks the indexer's
 * zero-unresolved invariant — see the long note in IconTileGrid.tsx.
 */
import type { Partner } from '../../lib/partners';

export interface Props {
  partners: Partner[];
  class?: string;
}

/** The label a slot shows while its name is unknown, keyed so it localises. */
const SLOT_PENDING_KEY = 'profile.mitra_slot_pending';

export default function PartnerGrid({ partners, class: className }: Props) {
  const grid = ['grid gap-4 sm:grid-cols-2 lg:grid-cols-3', className ?? '']
    .filter(Boolean)
    .join(' ');

  return (
    <ul class={grid} data-scroll-item>
      {partners.map((partner) => {
        const filled = partner.name !== null;
        return (
          <li
            key={partner.slot}
            data-filled={filled ? 'true' : 'false'}
            class="u-surface-depth flex flex-col items-center justify-center gap-3 rounded-card border border-line bg-surface p-5 text-center min-h-[8.5rem]"
          >
            {partner.logo && filled ? (
              <img
                src={`/assets/mitra/${partner.logo}.webp`}
                alt=""
                aria-hidden="true"
                width="120"
                height="48"
                loading="lazy"
                decoding="async"
                class="h-12 w-auto object-contain"
              />
            ) : (
              /* The empty logo slot. A dashed box rather than nothing, because
                 the SIZE of the slot is information: it says a logo goes here
                 and has not arrived, which a collapsed card would not. */
              <span
                aria-hidden="true"
                class="flex h-12 w-[7.5rem] items-center justify-center rounded-control border border-dashed border-line/60 text-caption text-fg-muted"
              >
                + LOGO
              </span>
            )}
            <span class="text-card-title font-bold text-fg">
              {filled ? (
                <span data-lang={partner.name?.key}>{partner.name?.text}</span>
              ) : (
                <span class="text-fg-muted font-normal italic" data-lang={SLOT_PENDING_KEY}>
                  Slot belum diisi
                </span>
              )}
            </span>
            <span class="text-caption uppercase font-bold text-accent">
              {partner.kind}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
