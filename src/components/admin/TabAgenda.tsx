/**
 * TabAgenda.tsx — "Agenda & Jadwal Terdekat" as a sidebar tab.
 *
 * MOVED 2026-09-26 out of the admin dashboard header, together with
 * `TabTugas`. Both were mounted above EVERY tab, so the panel's top was
 * permanently occupied by two dashboard tiles and the tab content started
 * halfway down the page. They are now reached from the sidebar like any other
 * tab and render in the same content area as Jadwal Agenda.
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
 *
 * ⚠ KNOWN, UNCHANGED: the list below has never been populated. `#dash-agenda-list`
 * is a hard-coded empty state — a repo-wide grep found no writer for that id in
 * the Astro tree, so this tab will show "Jadwal akan dimuat dari backend." until
 * someone wires it. That was already true of the dashboard card; moving it did
 * not create the gap and does not close it. Reported, not silently "fixed".
 */
import { t, useLang } from '../../store/i18n';
import Icon from '../ui/Icon';

/** Ask AdminPanel to switch tabs. */
export function gotoAdminTab(id: string): void {
  window.dispatchEvent(new CustomEvent('adminGotoTab', { detail: id }));
}

export default function TabAgenda() {
  useLang();

  return (
    <div>
      <div class="flex justify-between items-center border-b border-amber-900/50 pb-4 mb-4">
        <h2 class="text-amber-400 font-bold text-lg">
          <Icon name="calendar-check" class="mr-2" /> {t('ui.agenda_recent')}
        </h2>
      </div>

      <div id="dash-agenda-list" class="u-scroll-area custom-scrollbar pr-2 space-y-2" style={{ maxHeight: '380px' }}>
        <p class="text-xs text-slate-500">{t('ui.schedule_empty')}</p>
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
