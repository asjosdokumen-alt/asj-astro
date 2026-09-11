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

type Tab = 'kelola' | 'dbjob' | 'tambah' | 'pelamar' | 'jadwal' | 'mail' | 'wa' | 'config';

const TABS: { id: Tab; icon: string; labelKey: string }[] = [
  { id: 'kelola',  icon: 'fa-globe',        labelKey: 'admin.tab_public_job' },
  { id: 'dbjob',   icon: 'fa-server',       labelKey: 'admin.tab_internal_db' },
  { id: 'tambah',  icon: 'fa-plus',         labelKey: 'admin.tab_add_job' },
  { id: 'pelamar', icon: 'fa-users',        labelKey: 'admin.tab_candidate' },
  { id: 'jadwal',  icon: 'fa-calendar-alt', labelKey: 'admin.tab_schedule' },
  { id: 'mail',    icon: 'fa-envelope',     labelKey: 'admin.tab_mail' },
  { id: 'wa',      icon: 'fa-whatsapp',     labelKey: 'ui.wa_pintar' },
];

export default function AdminPanel() {
  const _lang = useStore(langStore);
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    if (typeof window === 'undefined') return 'kelola' as Tab;
    var h = window.location.hash.replace('#', '');
    return (['kelola','dbjob','tambah','pelamar','jadwal','mail','wa','config'].includes(h) ? h : 'kelola') as Tab;
  });

  // Listen for hash changes from BottomNav
  useEffect(() => {
    const onHashChange = () => {
      var h = window.location.hash.replace('#', '');
      if (['kelola','dbjob','tambah','pelamar','jadwal','mail','wa','config'].includes(h)) {
        setActiveTab(h as Tab);
      }
    };
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

  return (
    <div class="space-y-6">

      <div class="u-grid-auto u-grid-auto--wide gap-4">
        {/* KIRI: AGENDA HARIAN */}
        <div class="bg-slate-900 border border-slate-700 p-4 rounded-xl shadow-lg flex flex-col h-full min-h-[300px]">
          <div class="flex justify-between items-center mb-3">
            <h3 class="text-sm font-bold text-white"><Icon name="calendar-check" class="text-amber-400 mr-2" /> <span data-lang="ui.agenda_recent">{t('ui.agenda_recent')}</span></h3>
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
          <h3 class="text-sm font-bold text-white mb-3"><Icon name="tasks" class="text-pink-400 mr-2" /> <span data-lang="admin.task_board">{t('admin.task_board')}</span></h3>
          <div class="flex gap-2 mb-3">
            <input type="text" id="todo-input" class="flex-1 bg-black p-2.5 rounded-lg text-sm text-white border border-slate-600 outline-none focus:border-pink-500 transition" placeholder={t('admin.task_placeholder')} aria-label={t('admin.task_placeholder')} />
            <button class="bg-red-600 hover:bg-red-500 px-5 rounded-lg text-sm text-white font-bold transition shadow-lg" aria-label={t('button.add')}><Icon name="plus" /></button>
          </div>
          <div id="todo-list" class="flex-1 u-scroll-area custom-scrollbar pr-2 space-y-2" style={{ maxHeight: '190px' }}></div>
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
          <button onClick={() => setSidebarOpen(false)} class="text-slate-400 hover:text-white p-1 transition lg:hidden" aria-label={t("ui.close")}><Icon name="times" class="text-lg" /></button>
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

function TabContent({ tab }: { tab: Tab }) {
  if (tab === "kelola")  return <TabKelola />;
  if (tab === "pelamar") return <TabPelamar />;
  
  if (tab === "jadwal")  return <TabJadwal />;
  if (tab === "mail")    return <TabMail />;
  if (tab === "tambah")  return <TabTambah />;
  if (tab === "dbjob")   return <TabDbJob />;
  if (tab === "wa")      return <TabWA />;
  if (tab === "config")  return <TabConfig />;
  return <TabPlaceholder tab={tab} />;
}

function TabPlaceholder({ tab }: { tab: string }) {
  return (
    <div class="text-center py-8">
      <Icon name="tools" class="text-3xl text-slate-600 mb-3" />
      <p class="text-slate-500">Tab "{tab}" sedang dalam migrasi.</p>
    </div>
  );
}
