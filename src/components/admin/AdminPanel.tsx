/**
 * AdminPanel.tsx — Admin dashboard with fixed sidebar + tab routing
 * Source: legacy/index.html page-admin (lines 408-839)
 *
 * Layout:
 *   - Dashboard header (Agenda + Papan Tugas) — full width
 *   - Pengumuman Berjalan marquee — full width
 *   - Sidebar: fixed left (w-64) on desktop, slide-in drawer on mobile
 *   - Content area: pl-64 on desktop to offset sidebar
 */
import { useState, useEffect } from 'preact/hooks';
import type { FunctionComponent } from 'preact';
import { useStore } from '@nanostores/preact';
import { langStore, t } from '../../store/i18n';
import { showToast } from '../Toast';
import TabKelola from './TabKelola.tsx';
import TabPelamar from './TabPelamar.tsx';

import TabDbJob from './TabDbJob.tsx';
import TabTambah from './TabTambah.tsx';
import TabMail from './TabMail.tsx';
import TabJadwal from './TabJadwal.tsx';
import TabWA from './TabWA.tsx';
import PemberkasanModal from "./PemberkasanModal";
import UndanganKelasModal from "./UndanganKelasModal";
import TabConfig from './TabConfig.tsx';
import AdminAiCopilot from "./AdminAiCopilot";
import CandidateProfileModal from './CandidateProfileModal';
import EditCandidateModal from './EditCandidateModal';
import MatchmakingModal from './MatchmakingModal';
import Icon from '../ui/Icon';

function useModal<T = void>() {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<T | null>(null);
  return {
    isOpen: open,
    target,
    show: (t: T) => { setTarget(t); setOpen(true); },
    hide: () => { setOpen(false); setTarget(null); },
  };
}

/**
 * The tab routes, in sidebar order.
 *
 * ONE SOURCE OF TRUTH. This list used to be written THREE times — here, in the
 * initial `useState` guard, and in the `hashchange` guard — while `TabContent`
 * carried a fourth, independent set of `if` branches. The copies had already
 * diverged: `config` was missing from `TABS` (it has its own hard-coded sidebar
 * button, because it is pinned to the bottom rather than listed with the rest),
 * yet present in both guards, and nothing tied any of them to `TabContent`.
 *
 * So a new tab could be rendered by `TabContent`, un-reachable from a hash,
 * and invisible in the sidebar — or the reverse — and every copy would still
 * look self-consistent. Deriving the guards from this list, and typing the
 * renderer against it, is what makes those divergences impossible rather than
 * merely unlikely.
 */
const TABS = [
  { id: 'kelola',  icon: 'fa-globe',        labelKey: 'admin.tab_public_job' },
  { id: 'dbjob',   icon: 'fa-server',       labelKey: 'admin.tab_internal_db' },
  { id: 'tambah',  icon: 'fa-plus',         labelKey: 'admin.tab_add_job' },
  { id: 'pelamar', icon: 'fa-users',        labelKey: 'admin.tab_candidate' },
  { id: 'jadwal',  icon: 'fa-calendar-alt', labelKey: 'admin.tab_schedule' },
  { id: 'mail',    icon: 'fa-envelope',     labelKey: 'admin.tab_mail' },
  { id: 'wa',      icon: 'fa-whatsapp',     labelKey: 'ui.wa_pintar' },
] as const;

/**
 * `config` is a real tab but is NOT in `TABS`: it renders as a separate button
 * pinned to the bottom of the sidebar, not as one of the listed entries.
 */
const PINNED_TABS = ['config'] as const;

type Tab = (typeof TABS)[number]['id'] | (typeof PINNED_TABS)[number];

/** Every routable tab id, derived — never a second hand-written list. */
const TAB_IDS: readonly string[] = [...TABS.map((t) => t.id), ...PINNED_TABS];

const isTab = (v: string): v is Tab => TAB_IDS.includes(v);

/** A row on the "Papan Tugas Tim" board — local, in-session state only. */
interface TeamTask {
  id: number;
  text: string;
  done: boolean;
}

/**
 * Read the tab from `location.hash`, falling back to the first tab. Used by both
 * the initialiser and the `hashchange` listener so the two cannot disagree.
 */
function tabFromHash(): Tab {
  if (typeof window === 'undefined') return 'kelola';
  const h = window.location.hash.replace('#', '');
  return isTab(h) ? h : 'kelola';
}

export default function AdminPanel() {
  const _lang = useStore(langStore);
  const [activeTab, setActiveTab] = useState<Tab>(tabFromHash);

  // Listen for hash changes from BottomNav
  useEffect(() => {
    const onHashChange = () => setActiveTab(tabFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    const onAiCopilot = (e: Event) => aiCopilot.show((e as CustomEvent).detail);
    const onEdit = (e: Event) => { const d = (e as CustomEvent).detail; editModal.show(d); };
    const onHistory = (e: Event) => { const d = (e as CustomEvent).detail; profile.show({ wa: d.wa, nama: d.nama, candidate: d.candidate || null }); };
    const onUndangan = () => undangan.show();
    const onMatchmaking = (e: Event) => matchmaking.show((e as CustomEvent).detail);
    const onPemberkasan = (e: Event) => { const d = (e as CustomEvent).detail; pemberkasan.show(d); };
    window.addEventListener('openAdminAiCopilot', onAiCopilot);
    window.addEventListener('openUndanganKelas', onUndangan);
    window.addEventListener('openPemberkasan', onPemberkasan);
      window.addEventListener('openMatchmaking', onMatchmaking);
    window.addEventListener('openCandidateEdit', onEdit);
    window.addEventListener('showCandidateHistory', onHistory);
    return () => {
      window.removeEventListener('openAdminAiCopilot', onAiCopilot);
      window.removeEventListener('openUndanganKelas', onUndangan);
      window.removeEventListener('openPemberkasan', onPemberkasan);
      window.removeEventListener('openMatchmaking', onMatchmaking);
      window.removeEventListener('openCandidateEdit', onEdit);
      window.removeEventListener('showCandidateHistory', onHistory);
    };
  }, []);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // Listen for bottom nav toggle
  useEffect(() => {
    const handler = () => setSidebarOpen(prev => !prev);
    window.addEventListener("asj-toggle-sidebar", handler);
    return () => window.removeEventListener("asj-toggle-sidebar", handler);
  }, []);
  const undangan = useModal();
  const aiCopilot = useModal<{wa: string; nama: string; id?: string}>();
  const pemberkasan = useModal<{wa: string; nama: string; candidate?: Record<string, any> | null}>();
  const profile = useModal<{wa: string; nama: string; candidate?: Record<string, any> | null}>();
  const editModal = useModal<any>();
  const matchmaking = useModal<{job: any; candidates: any[]}>();

  /* ─── Papan Tugas Tim (team task board) ────────────────────────────────
     This card used to be inert: the input had no state binding, the + button
     had no onClick, and #todo-list was never written to — a repo-wide grep for
     todo-input / todo-list found no other writer in the tree, so the card
     looked live and did nothing. Local component state is the intended scope:
     the board is a scratchpad for the current admin session, and it is honest
     about that rather than pretending to persist. NO network call, no DB table
     and no Supabase write — a task does not survive a reload, by design. */
  const [tasks, setTasks] = useState<TeamTask[]>([]);
  const [taskDraft, setTaskDraft] = useState("");

  function addTask() {
    const text = taskDraft.trim();
    if (!text) return; // an empty / whitespace-only draft is not a task
    setTasks((prev) => [...prev, { id: Date.now() + prev.length, text, done: false }]);
    setTaskDraft("");
  }
  function toggleTask(id: number) {
    setTasks((prev) => prev.map((tk) => (tk.id === id ? { ...tk, done: !tk.done } : tk)));
  }
  function removeTask(id: number) {
    setTasks((prev) => prev.filter((tk) => tk.id !== id));
  }

  return (
    <div class="space-y-6">

      <div class="u-grid-auto u-grid-auto--wide gap-4">
        {/* KIRI: AGENDA HARIAN */}
        <div class="bg-slate-900 border border-slate-700 p-4 rounded-xl shadow-lg flex flex-col h-full min-h-[300px]">
          <div class="flex justify-between items-center mb-3">
            {/* h2, not h3: this card is a sibling of the tab content, whose headings are all
               h2 — as h3 the page outline skipped 1 -> 3 and the h2 came last (measured §24). */}
            <h2 class="text-sm font-bold text-white"><Icon name="calendar-check" class="text-amber-400 mr-2" /> <span data-lang="ui.agenda_recent">{t('ui.agenda_recent')}</span></h2>
            <span class="text-xs bg-amber-900/40 text-amber-400 px-2 py-1 rounded-md font-bold" id="dash-admin-name">Admin</span>
          </div>
          <div id="dash-agenda-list" class="flex-1 u-scroll-area custom-scrollbar pr-2 space-y-2" style={{ maxHeight: '200px' }}>
            <p class="text-xs text-slate-500">{t('ui.schedule_empty')}</p>
          </div>
          <button onClick={() => setActiveTab('jadwal')} class="mt-3 text-xs text-amber-400 font-bold hover:text-amber-300 hover:bg-black/50 w-full text-center py-2 bg-black/30 rounded-lg transition border border-slate-800">
            {t('ui.open_schedule')} <Icon name="arrow-right" class="ml-1" />
          </button>
        </div>
        {/* KANAN: PAPAN TUGAS TIM */}
        <div class="bg-slate-900 border border-slate-700 p-4 rounded-xl shadow-lg flex flex-col h-full min-h-[300px]">
          {/* h2, not h3: sibling of the tab content — see the note on the agenda card above. */}
          <h2 class="text-sm font-bold text-white mb-3"><Icon name="tasks" class="text-pink-400 mr-2" /> <span data-lang="admin.task_board">{t('admin.task_board')}</span></h2>
          <div class="flex gap-2 mb-3">
            <input type="text" id="todo-input" value={taskDraft} onInput={(e) => setTaskDraft((e.target as HTMLInputElement).value)} onKeyDown={(e) => { if (e.key === 'Enter') addTask(); }} class="flex-1 bg-black p-2.5 rounded-lg text-sm text-white border border-slate-600 outline-none focus:border-pink-500 transition" placeholder={t('admin.task_placeholder')} aria-label={t('admin.task_placeholder')} />
            <button type="button" onClick={addTask} class="bg-red-600 hover:bg-red-500 px-5 rounded-lg text-sm text-white font-bold transition shadow-lg" aria-label={t('button.add')}><Icon name="plus" /></button>
          </div>
          <div id="todo-list" class="flex-1 u-scroll-area custom-scrollbar pr-2 space-y-2" style={{ maxHeight: '190px' }}>
            {tasks.length === 0 && (
              <p class="text-xs text-slate-500">{t('admin.task_empty')}</p>
            )}
            {tasks.map((task) => (
              <div key={task.id} class="flex items-center gap-2 bg-black/40 border border-slate-700 rounded-lg px-3 py-2">
                <input type="checkbox" checked={task.done} onChange={() => toggleTask(task.id)} aria-label={t('admin.task_done')} class="accent-pink-500 shrink-0" />
                <span class={"flex-1 min-w-0 break-words text-sm " + (task.done ? "line-through text-slate-500" : "text-white")}>{task.text}</span>
                <button type="button" onClick={() => removeTask(task.id)} aria-label={t('button.delete')} class="text-slate-400 hover:text-red-400 transition shrink-0"><Icon name="times" /></button>
              </div>
            ))}
          </div>
        </div>
      </div>

      
      <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ zIndex: 30 }} class="sticky top-2 ml-1 mb-2 px-3 py-1.5 bg-slate-800 hover:bg-red-600 text-slate-400 hover:text-white rounded-lg text-xs font-bold transition-colors duration-200 border border-slate-700 hover:border-red-500 shadow-lg inline-flex items-center gap-1.5">
        <Icon name="bars" /> {t("ui.menu")}
      </button>


      {sidebarOpen && (
        <div style={{ zIndex: 95 }} class="fixed inset-0 u-modal-shell bg-black/60 transition-opacity duration-300 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          role="button"
          tabIndex={0}
          aria-label={t("admin.close_sidebar")}
        />
      )}


      <aside
        role="navigation"
        id="admin-sidebar" aria-label="Admin sidebar"
        class={`fixed top-0 left-0 h-full w-64 bg-slate-900 border-r border-slate-700 p-3 flex flex-col gap-1 shadow-2xl u-scroll-area transition-transform duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0`}
        style={{ zIndex: 96 }}
        onClick={(e: Event) => e.stopPropagation()}
      >
        <div class="flex items-center justify-between px-2 py-2 mb-2 border-b border-slate-700">
          <span class="text-xs font-bold text-slate-500 uppercase tracking-widest"><Icon name="th-large" class="mr-1" /> {t("ui.menu")}</span>
          {/* MEASURED (2026-09-25, /admin at 390 + 768, both themes): `p-1`
              around an 18px glyph rendered 24x32 — under WCAG 2.5.8 AA's 24px on
              the width, and the only control that closes the mobile sidebar.
              min-w/min-h put the 44px floor on the button itself. */}
          <button onClick={() => setSidebarOpen(false)} class="text-slate-400 hover:text-white p-1 min-w-11 min-h-11 inline-flex items-center justify-center transition lg:hidden" aria-label={t("ui.close")}><Icon name="times" class="text-lg" /></button>
        </div>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setSidebarOpen(false); }}
            class={`w-full px-3 py-2.5 rounded-lg text-sm font-bold transition text-left flex items-center gap-2 ${
              activeTab === tab.id
                ? 'bg-red-600 text-white shadow-md'
                : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
            aria-label={t(tab.labelKey)}
          >
            <Icon name={tab.icon} class="w-5 text-center" /> <span>{t(tab.labelKey)}</span>
          </button>
        ))}
        <div class="flex-1"></div>
        <button onClick={() => aiCopilot.show({ wa: '', nama: '' })} class="w-full px-3 py-2.5 rounded-lg text-sm font-bold transition text-left flex items-center gap-2 bg-violet-900/50 text-violet-400 hover:bg-violet-600 hover:text-white border border-violet-500/30" title="AI HR Copilot">
          <Icon name="robot" class="w-5 text-center" /> <span>AI HR</span>
        </button>
        <button onClick={() => setActiveTab('config')} class={`w-full px-3 py-2.5 rounded-lg text-sm font-bold transition text-left flex items-center gap-2 mt-auto ${activeTab === 'config' ? 'bg-red-600 text-white shadow-md' : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'}`} aria-label={t('ui.settings')}>
          <Icon name="cog" class="w-5 text-center" /> <span>{t('ui.settings')}</span>
        </button>
      </aside>


      <div class="pl-0 lg:pl-64 min-w-0">
        <div class="bg-slate-900 p-4 rounded-xl border border-slate-700 shadow-xl u-scroll-x">
          <TabContent tab={activeTab} />
        </div>
      </div>

      {pemberkasan.isOpen && <PemberkasanModal isOpen={pemberkasan.isOpen} onClose={pemberkasan.hide} waTarget={pemberkasan.target?.wa || ''} namaTarget={pemberkasan.target?.nama || ''} candidate={pemberkasan.target?.candidate || null} isAdmin />}
      {undangan.isOpen && <UndanganKelasModal isOpen={undangan.isOpen} onClose={undangan.hide} />}
      {aiCopilot.isOpen && <AdminAiCopilot candidateWa={aiCopilot.target?.wa} candidateId={aiCopilot.target?.id} onClose={aiCopilot.hide} />}
      {profile.isOpen && <CandidateProfileModal wa={profile.target?.wa || ''} nama={profile.target?.nama || ''} candidate={profile.target?.candidate} isOpen={profile.isOpen} onClose={profile.hide} />}
      {editModal.isOpen && editModal.target && <EditCandidateModal candidate={editModal.target} isOpen={editModal.isOpen} onClose={editModal.hide} />}
      {matchmaking.isOpen && matchmaking.target && <MatchmakingModal job={matchmaking.target.job} candidates={matchmaking.target.candidates} isOpen={matchmaking.isOpen} onClose={matchmaking.hide} />}
    </div>
  );
}

/**
 * Every routable tab, mapped to its renderer.
 *
 * Keyed by `Tab`, so TypeScript fails the build if a tab is added to `TABS` or
 * `PINNED_TABS` without a component here — which is the divergence that a chain
 * of `if` branches could not catch. The old shape returned
 * `<TabPlaceholder tab={tab} />` as a fallback, so a missing branch rendered a
 * plausible-looking "sedang dalam migrasi" panel instead of failing.
 */
const TAB_VIEWS: Record<Tab, FunctionComponent> = {
  kelola:  () => <TabKelola />,
  pelamar: () => <TabPelamar />,
  jadwal:  () => <TabJadwal />,
  mail:    () => <TabMail />,
  tambah:  () => <TabTambah />,
  dbjob:   () => <TabDbJob />,
  wa:      () => <TabWA />,
  config:  () => <TabConfig />,
};

function TabContent({ tab }: { tab: Tab }) {
  const View = TAB_VIEWS[tab];
  return <View />;
}
