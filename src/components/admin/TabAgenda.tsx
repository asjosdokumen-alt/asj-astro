/**
 * TabAgenda.tsx — "Agenda & Jadwal Terdekat" as a sidebar tab.
 *
 * MOVED 2026-09-26 out of the admin dashboard header, together with
 * `TabTugas`. Both were mounted above EVERY tab, so the panel's top was
 * permanently occupied by two dashboard tiles and the tab content started
 * halfway down the page. They are now reached from the sidebar like any other
 * tab and render in the same content area as Jadwal Agenda.
 *
 * WIRED 2026-09-27 — the list is no longer a hard-coded empty state.
 * ---------------------------------------------------------------
 * Until this change `#dash-agenda-list` held a single `t('ui.schedule_empty')`
 * placeholder and nothing in the repo ever wrote to it, so the tab read
 * "Jadwal akan dimuat dari backend." forever. A repo-wide grep had found no
 * writer for that id — and the TODO recorded it as "known, not a bug, simply
 * not built".
 *
 * The premise behind that note was the part that was wrong. The data layer did
 * exist: `netlify/functions/schedule.js` exposes a full surface
 * (`simpanJadwalBaru`, `hapusJadwal`, …) and the `jadwal` tab already reads it
 * through `api.secure('getAppData', ['admin'])`, which returns `d.schedules`.
 * So this was never a missing backend — it was a component never connected to
 * one that was already there. Same source, same call, same shape as TabJadwal.
 *
 * WHAT "TERDEKAT" MEANS HERE. The heading promises the NEAREST schedules, not
 * all of them. Sorting is by `waktu` ascending, and entries whose `waktu` is
 * unparseable sort LAST rather than being dropped — a schedule with a malformed
 * date is still a real schedule and hiding it would be worse than misplacing it.
 * Only the first `NEAREST_LIMIT` are shown; the "Buka Kelola Jadwal" button is
 * the path to the full list, which is why it stays.
 *
 * NOT DONE ON PURPOSE: no search, no pagination, no relative-time phrasing
 * ("in 3 days"). The full table with edit and delete is one tab away and
 * duplicating it here would create a second place to keep correct.
 *
 * NAVIGATION
 * ----------
 * The card's only action is "Buka Kelola Jadwal", which switches to the
 * `jadwal` tab. `TAB_VIEWS` maps every tab to a prop-less component on purpose
 * (the typing is what stops a tab being added without a renderer), so this
 * cannot take a `setActiveTab` callback. It uses the same custom-event channel
 * AdminPanel already listens on for `openUndanganKelas` / `openPemberkasan` /
 * `openMatchmaking` rather than writing `location.hash`: assigning a hash value
 * equal to the current one fires no `hashchange`, and `#jadwal` is exactly the
 * case where the button must still work.
 */
import { useState, useEffect } from 'preact/hooks';
import api from '../../lib/apiClient';
import { t, useLang } from '../../store/i18n';

import type { Jadwal } from '../../types/api';
import Icon from '../ui/Icon';
import { Bar, Status } from '../ui/Skeleton';

/** Ask AdminPanel to switch tabs. */
export function gotoAdminTab(id: string): void {
  window.dispatchEvent(new CustomEvent('adminGotoTab', { detail: id }));
}

/** How many rows the compact tile shows before deferring to the `jadwal` tab. */
const NEAREST_LIMIT = 5;

/**
 * The slice of `getAppData` this tile reads. Declared locally ON PURPOSE rather
 * than widened onto the shared `AppDataResponse` / `AdminData`: `schedules` is
 * not part of that contract's declared shape (which is why `TabJadwal` reaches
 * for `any`), and adding a field to a type four other call sites share is a
 * bigger change than this tile justifies. If `schedules` ever lands on the
 * shared type, delete this and use it.
 */
interface AgendaAppData {
  success?: boolean;
  schedules?: Jadwal[];
}

/**
 * Sort key for `waktu`. Returns `Infinity` for anything unparseable so those
 * rows sink to the bottom instead of silently leading the list (a string that
 * sorts before every real date would otherwise look "nearest"). `Date.parse`
 * on an ISO-ish string is enough here — this is a presentation order, not a
 * business rule, and the full table is the place to audit the data itself.
 */
function waktuKey(j: Jadwal): number {
  const ts = Date.parse(j.waktu ?? '');
  return Number.isNaN(ts) ? Number.POSITIVE_INFINITY : ts;
}

export default function TabAgenda() {
  useLang();
  const [jadwal, setJadwal] = useState<Jadwal[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // `api.secure` is not generic (it always resolves the default
        // `ApiResponse`), so the narrower shape is applied here rather than
        // loosening the caller to `any` the way TabJadwal does.
        const d = (await api.secure('getAppData', ['admin'])) as AgendaAppData;
        if (!alive) return;
        if (d?.success) setJadwal(d.schedules || []);
        else setFailed(true);
      } catch {
        if (alive) setFailed(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const nearest = [...jadwal].sort((a, b) => waktuKey(a) - waktuKey(b)).slice(0, NEAREST_LIMIT);

  return (
    <div>
      <div class="flex justify-between items-center border-b border-amber-900/50 pb-4 mb-4">
        <h2 class="text-amber-400 font-bold text-lg">
          <Icon name="calendar-check" class="mr-2" /> {t('ui.agenda_recent')}
        </h2>
        {jadwal.length > 0 && (
          <span class="text-[11px] text-slate-500 font-bold">
            {nearest.length}/{jadwal.length}
          </span>
        )}
      </div>

      <div id="dash-agenda-list" class="u-scroll-area custom-scrollbar pr-2 space-y-2" style={{ maxHeight: '380px' }}>
        {loading ? (
          /* Shared skeleton, not a spinner. MEASURED 2026-10-01: this was the
             LAST of the ten admin tabs still rendering a spinner while the other
             nine already used `Skeleton.tsx` (`2543971`). A skeleton tells the
             admin the SHAPE of what is coming — here, a list of short schedule
             cards — which a spinner cannot. The four bars mirror the real card's
             `rounded-lg border px-3 py-2` box, and `Status` keeps the same
             `admin.jadwal_loading` sentence so nothing is lost. */
          <Status labelKey="admin.jadwal_loading" class="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} class="rounded-lg border border-slate-800 bg-black/30 px-3 py-2">
                <Bar class="h-4 w-2/3 mb-2" />
                <Bar class="h-3 w-1/3" />
              </div>
            ))}
          </Status>
        ) : failed ? (
          // Distinct from the empty state on purpose: "could not load" and
          // "nothing scheduled" are different facts and only one of them is
          // about the data. Showing the empty sentence after a failed fetch
          // would tell the admin there is nothing scheduled when the truth is
          // that nobody knows.
          <p class="text-xs text-rose-400">{t('ui.toast_error_prefix')}{t('alert.network')}</p>
        ) : nearest.length === 0 ? (
          <p class="text-xs text-slate-500">{t('admin.jadwal_none')}</p>
        ) : (
          nearest.map((j) => (
            <div
              key={j.id}
              class="rounded-lg border border-slate-800 bg-black/30 px-3 py-2"
            >
              <div class="flex items-baseline justify-between gap-2">
                <span class="text-sm font-bold text-slate-200 truncate">{j.nama}</span>
                <span class="text-[11px] text-amber-400 font-bold whitespace-nowrap">
                  {j.waktu}
                </span>
              </div>
              {(j.loker || j.lokasi) && (
                <div class="text-[11px] text-slate-500 truncate mt-0.5">
                  {[j.loker, j.lokasi].filter(Boolean).join(' · ')}
                </div>
              )}
              {j.tsk && (
                <div class="text-[11px] text-slate-500 truncate mt-0.5">
                  <Icon name="clipboard-list" class="mr-1" />
                  {j.tsk}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <button
        type="button"
        onClick={() => gotoAdminTab('jadwal')}
        class="min-h-11 mt-4 text-xs text-amber-400 font-bold hover:text-amber-300 hover:bg-black/50 w-full text-center py-2 bg-black/30 rounded-lg transition border border-slate-800"
      >
        {t('ui.open_schedule')} <Icon name="arrow-right" class="ml-1" />
      </button>
    </div>
  );
}
