/**
 * TabConfig.tsx - Pengaturan Sistem tab
 * Source: legacy admin.html admin-config (lines 802-861)
 */
import { useState, useEffect } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import { authStore } from '../../store/authReactive';
import { t, langStore } from '../../store/i18n';

import type { ConfigGroup } from '../../types/api';
import Icon from '../ui/Icon';

export default function TabConfig() {
  const _lang = useStore(langStore);
  const [configs, setConfigs] = useState<ConfigGroup[]>([
    { id: 'tsk_list', label: 'TSK / Pengurus', options: ['TSK-001', 'TSK-002', 'TSK-003'] },
    { id: 'tahapan_db', label: 'Tahapan Internal DB', options: ['Persiapan', 'Dokumen', 'MCU', 'Wawancara', 'Keberangkatan'] },
    { id: 'bidang_kerja', label: 'Bidang Pekerjaan', options: ['Manufaktur', 'Pertanian', 'Perikanan', 'Konstruksi', 'Perawatan Lansia', 'Logistik', 'F&B', 'Perhotelan'] },
    { id: 'lokasi_penempatan', label: 'Lokasi Penempatan', options: ['Tokyo', 'Osaka', 'Nagoya', 'Fukuoka', 'Sapporo', 'Sendai', 'Yokohama'] },
    { id: 'pendidikan', label: 'Pendidikan', options: ['SD', 'SMP', 'SMA/SMK', 'D3', 'S1', 'S2'] },
    { id: 'status_lamaran', label: 'Status Lamaran', options: ['Baru', 'Review', 'Diterima', 'Ditolak', 'On Hold'] },
    { id: 'tahapan_progres', label: 'Tahapan Progres', options: ['Pendaftaran', 'Seleksi', 'Dokumen', 'MCU', 'Wawancara', 'Keberangkatan'] },
    { id: 'gender', label: 'Gender', options: ['Laki-laki', 'Perempuan'] },
    { id: 'jenjang_pendidikan', label: 'Jenjang Pendidikan', options: ['SD', 'SMP', 'SMA/SMK', 'D3', 'S1', 'S2'] },
  ]);
  const [loading, setLoading] = useState(true);
  const [migrating, setMigrating] = useState(false);
  const [migStatus, setMigStatus] = useState('');
  const [migResults, setMigResults] = useState<string[]>([]);
  const [migPending, setMigPending] = useState('');
  const [pengumuman, setPengumuman] = useState('');
  const [editingConfig, setEditingConfig] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const r = await fetch('/.netlify/functions/get-app-data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: "getAppData", args: ["admin"], sessionToken: authStore.get().sessionToken || "" }) });
        const d = await r.json();
        if (d.success) { setConfigs(d.sysConfig?.length ? d.sysConfig : configs); if (d.pengumuman) setPengumuman(d.pengumuman); }
      } catch (e) { console.warn('[TabConfig] API unavailable, using defaults', e); } finally { setLoading(false); }
    } load(); }, []);

  async function handleMigrate() {
    setMigrating(true); setMigStatus('Running...'); setMigResults([]);
    try {
      const r = await fetch('/.netlify/functions/run-migration', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionToken: authStore.get().sessionToken || "" }) });
      const d = await r.json();
      if (d.success) { setMigStatus('Done!'); setMigResults(d.results || []); if (d.pendingSQL) setMigPending(d.pendingSQL); }
      else setMigStatus('Failed: ' + (d.error || 'Unknown'));
    } catch (e) { setMigStatus('Error: ' + e); }
    setMigrating(false);
  }

  async function handleSaveConfig(id: string) {
    const options = editValue.split('\n').map(s => s.trim()).filter(Boolean);
    try {
      const r = await fetch('/.netlify/functions/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, options, sessionToken: authStore.get().sessionToken || "" }) });
      const d = await r.json();
      if (d.success) { setEditingConfig(null); location.reload(); } else alert('Failed: ' + d.error);
    } catch (e) { alert('Error: ' + e); }
  }

  async function handleSavePengumuman() {
    try {
      const r = await fetch('/.netlify/functions/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: pengumuman, sessionToken: authStore.get().sessionToken || "" }) });
      const d = await r.json();
      if (d.success) alert('Pengumuman saved!'); else alert('Failed: ' + d.error);
    } catch (e) { alert('Error: ' + e); }
  }

  if (loading) return <div class="text-center py-8"><Icon spin name="spinner" class="text-2xl text-slate-400" /><p class="text-slate-500 mt-2 text-sm">{t('ui.loading')}</p></div>;

  return (<div>
    <h2 class="text-white font-bold mb-6 border-b border-slate-700 pb-3 text-lg"><Icon name="cogs" class="mr-2 text-slate-300" /> {t('admin.tab_config_title')}</h2>
    <p class="text-sm text-slate-300 mb-6">{t('admin.sys_config_desc')}</p>

    <div class="bg-black/40 border border-indigo-500/40 p-5 rounded-xl mb-6 shadow-inner">
      <h3 class="text-sm font-bold text-indigo-400 mb-2 uppercase tracking-wider"><Icon name="database" class="mr-1" /> {t('admin.db_migration_auto')}</h3>
      <p class="text-xs text-slate-300 mb-3">Jalankan pembaruan struktur &amp; pembersihan data: seed preset rincian biaya, cek kolom loker/master, normalisasi gender, rapikan nama, dan bersihkan NIK.</p>
      <div class="flex flex-wrap gap-2 items-center">
        <button onClick={handleMigrate} disabled={migrating} class="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-lg text-sm font-bold transition shadow-lg disabled:opacity-50"><Icon name="play" class="mr-1" /> {migrating ? 'Running...' : t('admin.run_migration')}</button>
        <span class="text-xs text-slate-300">{migStatus}</span>
      </div>
      {migResults.length > 0 && <div class="mt-3 space-y-1.5">{migResults.map((r, i) => <div key={i} class="text-xs text-slate-300">{r}</div>)}</div>}
      {migPending && <div class="mt-3"><p class="text-xs font-bold text-amber-400 mb-1">SQL yang perlu dijalankan manual:</p><pre class="bg-black/60 border border-amber-500/30 rounded-lg p-3 text-xs text-amber-200 whitespace-pre-wrap max-h-48 overflow-y-auto custom-scrollbar">{migPending}</pre></div>}
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
      {configs.map(c => (
        <div key={c.id} class="bg-black/40 border border-slate-700 p-4 rounded-xl shadow-inner">
          <h4 class="text-sm font-bold text-slate-300 mb-2">{c.label}</h4>
          {editingConfig === c.id ? (
            <div>
              <textarea value={editValue} onInput={(e) => setEditValue((e.target as HTMLTextAreaElement).value)} rows={6} class="w-full p-2.5 rounded-lg bg-black/60 border border-slate-600 text-white text-xs outline-none focus:border-indigo-500 transition font-mono"></textarea>
              <div class="flex gap-2 mt-2">
                <button onClick={() => handleSaveConfig(c.id)} class="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition">{t('button.save')}</button>
                <button onClick={() => setEditingConfig(null)} class="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold rounded-lg transition">{t('button.cancel')}</button>
              </div>
            </div>
          ) : (
            <div>
              <div class="text-xs text-slate-500 mb-2">{c.options.length} {t('admin.options_suffix')}</div>
              <div class="flex flex-wrap gap-1 mb-2">{c.options.slice(0, 5).map(o => <span key={o} class="px-2 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] text-slate-400">{o}</span>)}{c.options.length > 5 && <span class="text-[10px] text-slate-500">+{c.options.length - 5} {t('admin.more_suffix')}</span>}</div>
              <button onClick={() => { setEditingConfig(c.id); setEditValue(c.options.join('\n')); }} class="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-lg transition border border-slate-700"><Icon name="edit" class="mr-1" /> {t('button.edit')}</button>
            </div>
          )}
        </div>
      ))}
    </div>

    <div class="bg-black/40 border border-rose-500/50 p-5 rounded-xl flex flex-col shadow-inner">
      <h3 class="text-sm font-bold text-rose-400 mb-2 uppercase tracking-wider"><Icon name="bullhorn" class="mr-1" /> {t('admin.marquee_announcement')}</h3>
      <p class="text-xs text-slate-300 mb-3">Teks ini akan muncul berjalan (Marquee) di semua halaman.</p>
      <div class="flex gap-2">
        <input type="text" value={pengumuman} onInput={(e) => setPengumuman((e.target as HTMLInputElement).value)} placeholder={t("admin.announce_ph")} class="flex-1 bg-slate-800 border border-slate-600 rounded-lg text-sm px-4 py-2.5 text-white outline-none focus:border-rose-500" />
        <button onClick={handleSavePengumuman} class="bg-rose-600 hover:bg-rose-500 text-white px-6 py-2.5 rounded-lg text-sm font-bold transition shadow-lg"><Icon name="save" class="mr-1" /> {t('admin.save_and_publish')}</button>
      </div>
    </div>
  </div>);
}
