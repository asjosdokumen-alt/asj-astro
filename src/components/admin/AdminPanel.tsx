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
import { t, useLang } from '../../store/i18n';
import { showToast } from '../Toast';
import TabKelola from './TabKelola.tsx';
import TabPelamar from './TabPelamar.tsx';

import TabDbJob from './TabDbJob.tsx';
import TabTambah from './TabTambah.tsx';
import TabMail from './TabMail.tsx';
import TabJadwal from './TabJadwal.tsx';
import TabAgenda from './TabAgenda.tsx';
import TabTugas from './TabTugas.tsx';
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
  /* Appended 2026-09-26. These two were the dashboard header tiles — mounted
     above EVERY tab, which is why the panel's top was always occupied and the
     tab content started halfway down. They are now ordinary tabs. Appended
     rather than inserted so the seven established entries keep their positions
     and nobody's muscle memory moves; reorder freely if you'd rather they sit
     next to `jadwal`. */
  { id: 'agenda',  icon: 'fa-calendar-check', labelKey: 'admin.tab_agenda' },
  { id: 'tugas',   icon: 'fa-tasks',          labelKey: 'admin.tab_tugas' },
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
  const _lang = useLang();
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
    /* Tab-to-tab navigation from inside a tab view. `TAB_VIEWS` maps every tab
       to a PROP-LESS component (that typing is what stops a tab shipping
       without a renderer), so a view cannot be handed `setActiveTab`. This is
       the same custom-event channel the six listeners above already use.
       Guarded by `isTab` so a bad detail cannot set a tab that has no view. */
    const onGotoTab = (e: Event) => { const d = String((e as CustomEvent).detail || ''); if (isTab(d)) setActiveTab(d); };
    window.addEventListener('openAdminAiCopilot', onAiCopilot);
    window.addEventListener('openUndanganKelas', onUndangan);
    window.addEventListener('openPemberkasan', onPemberkasan);
      window.addEventListener('openMatchmaking', onMatchmaking);
    window.addEventListener('openCandidateEdit', onEdit);
    window.addEventListener('showCandidateHistory', onHistory);
    window.addEventListener('adminGotoTab', onGotoTab);
    return () => {
      window.removeEventListener('openAdminAiCopilot', onAiCopilot);
      window.removeEventListener('openUndanganKelas', onUndangan);
      window.removeEventListener('openPemberkasan', onPemberkasan);
      window.removeEventListener('openMatchmaking', onMatchmaking);
      window.removeEventListener('openCandidateEdit', onEdit);
      window.removeEventListener('showCandidateHistory', onHistory);
      window.removeEventListener('adminGotoTab', onGotoTab);
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

  /* Papan Tugas Tim moved out of this file on 2026-09-26 — it is now the
     `tugas` tab (`TabTugas.tsx`) with its state in `store/adminTasks.ts`. It
     had to become a store rather than stay component state: a tab unmounts when
     the admin switches away, which would have dropped every task. */

  return (
    <div class="space-y-6">

      {/* The dashboard header (Agenda + Papan Tugas) used to sit here, mounted
          above EVERY tab. Both tiles are now ordinary sidebar tabs — `agenda`
          and `tugas` — so the panel's top is free and the tab content starts at
          the top of the page. Removed 2026-09-26 at the owner's request. */}

      <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ zIndex: 30 }} class="min-h-11 sticky top-2 ml-1 mb-2 px-3 py-1.5 inline-flex items-center bg-slate-800 hover:bg-red-600 text-slate-400 hover:text-white rounded-lg text-xs font-bold transition-colors duration-200 border border-slate-700 hover:border-red-500 shadow-lg inline-flex items-center gap-1.5">
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
        class={`fixed top-[var(--u-toolbar-h)] left-0 h-[calc(100%-var(--u-toolbar-h))] w-64 bg-slate-900 border-r border-slate-700 p-3 flex flex-col gap-1 shadow-2xl u-scroll-area transition-transform duration-300 ease-in-out
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
            class={`min-h-11 w-full px-3 py-2.5 rounded-lg text-sm font-bold transition text-left flex items-center gap-2 ${
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
        <button onClick={() => aiCopilot.show({ wa: '', nama: '' })} class="min-h-11 w-full px-3 py-2.5 rounded-lg text-sm font-bold transition text-left flex items-center gap-2 bg-violet-900/50 text-violet-400 hover:bg-violet-600 hover:text-white border border-violet-500/30" title="AI HR Copilot">
          <Icon name="robot" class="w-5 text-center" /> <span>AI HR</span>
        </button>
        <button onClick={() => setActiveTab('config')} class={`min-h-11 w-full px-3 py-2.5 rounded-lg text-sm font-bold transition text-left flex items-center gap-2 mt-auto ${activeTab === 'config' ? 'bg-red-600 text-white shadow-md' : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'}`} aria-label={t('ui.settings')}>
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
  agenda:  () => <TabAgenda />,
  tugas:   () => <TabTugas />,
  config:  () => <TabConfig />,
};

function TabContent({ tab }: { tab: Tab }) {
  const View = TAB_VIEWS[tab];
  return <View />;
}
