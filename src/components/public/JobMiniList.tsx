/**
 * JobMiniList.tsx — the five most recent open vacancies, as a compact list.
 *
 * WHY THIS IS NOT LokerTable WITH `limit={5}`.
 * LokerTable is 400+ lines of filter bar, status chips, gender badges, a
 * pamflet modal, a detail modal and an apply button. Embedding it to show five
 * rows would ship all of that a second time, and — worse — two independent
 * copies of "which jobs are recruiting" that can disagree on the same page.
 * This component reads the SAME `getPublicData()` cache and the SAME
 * `jobTutupUntukLamar()` rule, so the two can never drift; it simply renders
 * less. The single-flight cache in publicData.ts means the second consumer
 * costs no extra request.
 *
 * WHY .tsx AND NOT .astro — see the long note in IconTileGrid.tsx. Short
 * version: it iterates, and iterating inside an `.astro` template breaks the
 * indexer's zero-unresolved invariant because template interpolations resolve
 * against the frontmatter module scope only, not a nested callback scope.
 *
 * WHY THE FILTER IS APPLIED BEFORE THE SLICE, NOT AFTER.
 * "The 5 newest jobs" and "the 5 newest jobs that are still open" are different
 * lists, and the second is the useful one. Slicing first and then filtering
 * yields a list that is silently SHORTER than five whenever a recent job has
 * closed — a bug that looks like a data problem and is not. Filter first, then
 * take five. Measured consequence: the count shown is `Math.min(5, open)`,
 * never a claim that there are five.
 *
 * THE ORDER IS `createdAt` DESCENDING, and jobs with no usable date sink to the
 * bottom rather than to the top. A missing date is not "newest"; sorting on
 * `undefined` naively puts them first and pins a stale row to the head of a
 * list whose entire job is to look current.
 */
import { useEffect, useState } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import { langStore, t } from '../../store/i18n';
import { jobLocationLabel, jobTitleLabel } from '../../lib/jobDisplay';
import { jobTutupUntukLamar } from '../../lib/jobPhase';
import { getPublicData } from '../../lib/publicData';
import Icon from '../ui/Icon';
import Mascot from '../ui/Mascot';

/** Public-view projection of a `jobs` row. Same shape LokerTable declares. */
interface Job {
  code: string;
  pekerjaan: string;
  status: string;
  tahapan: string;
  lokasi: string;
  kategori: string;
  createdAt?: string;
}

export interface Props {
  /** How many rows to show. Five is the spec's number (LANDING_PAGE_SPEC §4, R2). */
  limit?: number;
  /** Where "Lihat Semua Lowongan →" points. */
  allHref?: string;
  class?: string;
}

/**
 * Timestamp for ordering, or null when the row has no usable date.
 *
 * `Date.parse('')` is NaN and `Date.parse('2026-13-45')` is also NaN, so both
 * fall out here together — which is the behaviour we want: an unparseable date
 * is as uninformative as a missing one.
 */
function stampOf(job: Job): number | null {
  if (!job.createdAt) return null;
  const ms = Date.parse(job.createdAt);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Newest first, undated last. Returns a NEW array — `jobs` comes from a shared
 * cache object on the module scope, so sorting in place would reorder it for
 * every other consumer of `getPublicData()`.
 */
function newestFirst(jobs: Job[]): Job[] {
  return [...jobs].sort((a, b) => {
    const sa = stampOf(a);
    const sb = stampOf(b);
    if (sa === null && sb === null) return 0;
    if (sa === null) return 1;
    if (sb === null) return -1;
    return sb - sa;
  });
}

export default function JobMiniList({ limit = 5, allHref = '#loker', class: className }: Props) {
  const _lang = useStore(langStore);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const data = await getPublicData();
        if (!live) return;
        if (data.success && data.jobs) {
          setJobs(data.jobs as unknown as Job[]);
        } else {
          setFailed(true);
        }
      } catch {
        // No console.error here on purpose: `noConsole` is "warn" for src/ in
        // biome.json, so a log would add a lint diagnostic to a file the ratchet
        // counts. The failure is not swallowed — `setFailed(true)` below renders
        // the "could not load" state, which is a strictly better signal than a
        // console line the visitor never sees.
        if (live) setFailed(true);
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  // Filter BEFORE slicing — see the note at the top of this file.
  const open = newestFirst(jobs.filter((j) => !jobTutupUntukLamar(j)));
  const shown = open.slice(0, limit);

  const wrapper = ['rounded-card bg-surface border border-line overflow-hidden', className ?? '']
    .filter(Boolean)
    .join(' ');

  /* Three distinct states, and the difference matters to a reader deciding
     whether to trust the page. A spinner must never be shown for a settled
     "none"; and an error must not be shown as "none", because "there are no
     vacancies" and "we could not find out" are opposite claims. The same rule
     the hero's live count follows with its em dash. */
  if (loading) {
    return (
      <div class={wrapper}>
        <p class="flex items-center gap-3 px-5 py-6 text-body-sm text-fg-muted">
          {/* Aa-chan, sparkle-eyed, while the request is in flight. Decorative:
              the sentence beside her already says "loading", so an `alt` would
              only repeat it. 40px keeps the row the same height as the plain
              text it replaces, so swapping states does not shift the layout. */}
          <Mascot pose="loading" size={40} decorative motion="float" class="shrink-0" />
          {t('public.loading')}
        </p>
      </div>
    );
  }

  if (failed) {
    return (
      <div class={wrapper}>
        <p class="px-5 py-6 text-body-sm text-fg-muted">
          <Icon name="exclamation-triangle" class="mr-2" />
          {t('public.load_error')}
        </p>
      </div>
    );
  }

  if (shown.length === 0) {
    return (
      <div class={wrapper}>
        {/* The sheet's "EMPTY STATE" slot: Aa-chan asleep. A settled "there are
            no vacancies" is the one state on this list that a visitor could
            misread as a fault, so it gets a face rather than a bare line of
            grey text. Decorative — `public.empty` already carries the meaning
            in words, and a screen reader announcing a sleepy bear first would
            delay the actual answer. */}
        <div class="flex flex-col items-center gap-2 px-5 py-8 text-center">
          <Mascot pose="sleepy" size={88} decorative motion="float" />
          <p class="text-body-sm text-fg-muted">{t('public.empty')}</p>
        </div>
      </div>
    );
  }

  return (
    <div class={wrapper}>
      <ul class="divide-y divide-line">
        {shown.map((job) => (
          <li key={job.code} class="min-w-0">
            {/* The row is ONE link, not a row with a link inside it. A row that
                looks clickable but only responds on the words "Lihat Detail"
                is the classic small-target defect on a phone. This is also why
                there is no separate "Lihat Detail →" control: the whole row IS
                the target, and the arrow is the affordance.

                `min-h-12` (48px) IS MEASURED, NOT TASTE. With `py-4` alone the
                row came out 42px tall — two pixels under the 44px floor, which
                no screenshot reveals but a ruler does (measured with
                e2e/measure-mini-rows.mjs at 390px: all five rows 42px, FAIL).
                `min-h-12` puts the floor in the markup so a later change to the
                padding or the title size cannot silently drop it back under.
                `items-center` keeps the two-line content vertically centred
                inside that taller box rather than pinned to the top. */}
            <a
              href={allHref}
              class="group flex min-h-12 items-center gap-3 min-w-0 px-5 py-4 no-underline"
            >
              <span class="shrink-0 rounded bg-surface-raised border border-line px-2 py-0.5 text-caption font-mono font-bold text-fg-muted">
                {job.code}
              </span>
              <span class="min-w-0 flex-1">
                <span class="block text-body-sm font-bold text-fg break-words group-hover:text-accent-sky">
                  {jobTitleLabel(job.pekerjaan)}
                </span>
                <span class="mt-0.5 block text-caption text-fg-muted break-words">
                  {jobLocationLabel(job.lokasi)}
                </span>
              </span>
              <Icon
                name="arrow-right"
                class="shrink-0 text-fg-muted group-hover:text-accent-sky"
              />
            </a>
          </li>
        ))}
      </ul>
      <a
        href={allHref}
        class="block border-t border-line px-5 py-3 text-body-sm font-bold text-accent-sky hover:underline"
      >
        {t('profile.mini_all')}
      </a>
    </div>
  );
}
