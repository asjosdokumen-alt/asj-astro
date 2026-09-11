/**
 * TabKelola.tsx — Admin loker management tab
 * Source: legacy/index.html page-admin → admin-kelola
 * Integrated: AdminJobEditModal, AdminShareModal
 */
import { useState, useEffect } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import { langStore, t } from '../../store/i18n';
import AdminJobEditModal from './AdminJobEditModal';
import AdminShareModal from './AdminShareModal';
import Icon from '../ui/Icon';
import api from '../../lib/apiClient';
import { authStore } from '../../store/authReactive';
import { getEndpoint } from '../../lib/apiEndpoint';

// A15: share config needs dokumenShare/tsk; getAppData('admin') is admin-guarded
// so the session token must be attached (public fallback has no dokumenShare).
type Loker = {
  code: string; pekerjaan: string; status: string; kategori: string;
  gender: string; lokasi: string; kuota: string; keterangan: string;
  syarat?: string; templateCv?: string; pamflet?: string;
  updated_at?: string;
  tsk?: string;
  dokumenShare?: string;
};

const STATUS_BADGE: Record<string, string> = {
  OPEN: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
  URGENT: 'bg-red-500/20 text-red-400 border-red-500/40',
  CLOSE: 'bg-slate-500/20 text-slate-400 border-slate-500/40',
};

export default function TabKelola() {
  const _lang = useStore(langStore);
  const [loker, setLoker] = useState<Loker[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [editJob, setEditJob] = useState<Loker | null>(null);
  const [shareJob, setShareJob] = useState<Loker | null>(null);

  useEffect(() => { fetchLoker(); }, []);

  async function fetchLoker() {
    try {
      const res = await fetch(getEndpoint('getAppData'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'getAppData', args: ['admin'],
          sessionToken: authStore.get().sessionToken || '',
        }),
      });
      const data = await res.json();
      if (data.success && data.jobs) setLoker(data.jobs);
      else if (data.sessionInvalid) setLoker([]);
    } catch (err) { console.error('[TabKelola]', err); }
    finally { setLoading(false); }
  }

  const filtered = loker.filter(j =>
    !search || (j.code || '').toLowerCase().includes(search.toLowerCase()) ||
    (j.pekerjaan || '').toLowerCase().includes(search.toLowerCase())
  );

  const getBadge = (s: string) => STATUS_BADGE[(s || '').toUpperCase()] || STATUS_BADGE.CLOSE;

  const toggleStatus = async (code: string, newStatus: string) => {
    try {
      const job = loker.find(j => j.code === code);
      const data = (await api.secure('ubahStatusJob', [code, newStatus, job?.updated_at])) as {
        success?: boolean; error?: string;
      };
      if (data.success) {
        setLoker(prev => prev.map(j => j.code === code ? { ...j, status: newStatus } : j));
      }
    } catch (e) { console.error(e); }
  };

  const deleteJob = async (code: string) => {
    if (!confirm('Yakin hapus loker ' + code + '?')) return;
    try {
      const data = (await api.secure('hapusJobData', [code])) as { success?: boolean; error?: string };
      if (data.success) setLoker(prev => prev.filter(j => j.code !== code));
    } catch (e) { console.error(e); }
  };

  return (
    <div>
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-red-400 font-bold text-lg"><Icon name="globe" class="mr-2" /> {t('admin.tab_public_job')}</h2>
        <div class="relative w-72">
          <Icon name="search" class="absolute left-3 top-2.5 text-slate-300 text-sm" />
          <input type="text" value={search} onInput={e => setSearch((e.target as HTMLInputElement).value)} placeholder={t('admin.search_placeholder')} class="w-full pl-9 p-2 rounded-lg bg-black/40 border border-slate-700 text-sm text-white outline-none focus:border-red-500 transition" />
        </div>
      </div>

      {loading ? (
        <div class="text-center py-8"><Icon spin name="spinner" class="text-2xl text-red-400" /><p class="text-slate-500 mt-2 text-sm">{t('ui.loading')}</p></div>
      ) : (
        <div class="u-scroll-x rounded-xl border border-slate-800">
          <table class="w-full min-w-[800px] text-sm text-left whitespace-nowrap">
            <thead class="bg-slate-800 text-slate-300 text-sm uppercase border-b border-slate-700 tracking-wider">
              <tr>
                <th class="p-4">{t('table.code')}</th>
                <th class="p-4">{t('table.job')}</th>
                <th class="p-4 text-center">{t('table.status')}</th>
                <th class="p-4 text-center">{t('table.action')}</th>
                <th class="p-4 text-center">{t('table.delete')}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800">
              {filtered.length === 0 ? (
                <tr><td colSpan={5} class="p-6 text-center text-slate-500">{t('ui.not_applied_general')}</td></tr>
              ) : filtered.map(j => (
                <tr key={j.code} class="hover:bg-white/5 transition-colors">
                  <td class="p-4 font-mono text-red-300 font-bold">{j.code}</td>
                  <td class="p-4 font-bold text-white">{j.pekerjaan}</td>
                  <td class="p-4 text-center">
                    <span class={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${getBadge(j.status)}`}>{j.status}</span>
                  </td>
                  <td class="p-4 text-center">
                    <div class="flex flex-wrap justify-center gap-2">
                      <button onClick={() => toggleStatus(j.code, 'OPEN')} class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-full text-[10px] text-white font-bold shadow transition">OPEN</button>
                      <button onClick={() => toggleStatus(j.code, 'CLOSE')} class="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 rounded-full text-[10px] text-white font-bold shadow transition">CLOSE</button>
                      <button onClick={() => setEditJob(j)} class="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-full text-[10px] font-bold shadow transition"><Icon name="edit" /> Edit</button>
                      <button onClick={() => setShareJob(j)} class="px-3 py-1.5 bg-pink-600 hover:bg-pink-500 text-white rounded-full text-[10px] font-bold shadow transition"><Icon name="share-alt" /> Share</button>
                    </div>
                  </td>
                  <td class="p-4 text-center">
                    <button onClick={() => deleteJob(j.code)} class="w-10 h-10 flex items-center justify-center bg-red-600 text-white rounded-full text-xs font-bold shadow-lg hover:scale-105 transition-transform mx-auto"><Icon name="trash" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p class="text-xs text-slate-500 mt-3">{filtered.length} {t('ui.jobs_suffix')}</p>

      {editJob && <AdminJobEditModal job={editJob as any} onClose={() => setEditJob(null)} onSave={() => fetchLoker()} />}
      {shareJob && <AdminShareModal job={shareJob} onClose={() => setShareJob(null)} />}
    </div>
  );
}
