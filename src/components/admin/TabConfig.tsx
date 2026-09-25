/**
 * TabConfig.tsx - Pengaturan Sistem tab
 * Source: legacy admin.html admin-config (lines 802-861)
 */
import { useState, useEffect } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import api from '../../lib/apiClient';
import { showToast } from '../Toast';
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
  const [pengumuman, setPengumuman] = useState('');
  const [editingConfig, setEditingConfig] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  async function load() {
    try {
      const d: any = await api.secure('getAppData', ['admin']);
      if (d && d.success) { setConfigs(d.sysConfig?.length ? d.sysConfig : configs); if (d.pengumuman) setPengumuman(d.pengumuman); }
    } catch (e) { console.warn('[TabConfig] API unavailable, using defaults', e); } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleSaveConfig(id: string) {
    const options = editValue.split('\n').map(s => s.trim()).filter(Boolean);
    try {
      const d: any = await api.secure('updateSysConfig', [{ id, options }]);
      if (d && d.success) { setEditingConfig(null); showToast(t('ui.toast_config_saved'), 'success'); await load(); } else showToast(t('ui.toast_error_prefix') + ((d && d.error) || ''), 'error');
    } catch (e: unknown) { showToast(t('alert.network') + (e instanceof Error ? e.message : String(e)), 'error'); }
  }

  async function handleSavePengumuman() {
    try {
      const d: any = await api.secure('updateSysConfig', [{ text: pengumuman }]);
      if (d && d.success) showToast(t('ui.toast_announcement_saved'), 'success'); else showToast(t('ui.toast_error_prefix') + ((d && d.error) || ''), 'error');
    } catch (e: unknown) { showToast(t('alert.network') + (e instanceof Error ? e.message : String(e)), 'error'); }
  }

  if (loading) return <div class="text-center py-8"><Icon spin name="spinner" class="text-2xl text-slate-400" /><p class="text-slate-500 mt-2 text-sm">{t('ui.loading')}</p></div>;

  return (<div>
    <h2 class="text-white font-bold mb-6 border-b border-slate-700 pb-3 text-lg"><Icon name="cogs" class="mr-2 text-slate-300" /> {t('admin.tab_config_title')}</h2>
    <p class="text-sm text-slate-300 mb-6">{t('admin.sys_config_desc')}</p>

    <div class="bg-black/40 border border-slate-600/40 p-5 rounded-xl mb-6 shadow-inner">
      <h3 class="text-sm font-bold text-slate-300 mb-2 uppercase tracking-wider"><Icon name="database" class="mr-1" /> {t('admin.db_migration_auto')}</h3>
      <p class="text-xs text-slate-300 mb-3">{t("admin.db_migrate_cli_only")}</p>
      <div class="bg-black/60 border border-slate-600/40 rounded-lg p-3">
        <p class="text-xs font-bold text-slate-400 mb-1">{t("admin.run_from_terminal")}</p>
        <pre class="text-xs text-emerald-300 whitespace-pre-wrap font-mono">npm run migrate:status
npm run migrate:up</pre>
      </div>
    </div>

    <div class="u-grid-auto u-grid-auto--panels gap-6 mb-6">
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
              <div class="flex flex-wrap gap-1 mb-2">{c.options.slice(0, 5).map(o => <span key={o} class="px-2 py-0.5 bg-slate-800 border border-slate-700 rounded text-[11px] text-slate-400">{o}</span>)}{c.options.length > 5 && <span class="text-[11px] text-slate-500">+{c.options.length - 5} {t('admin.more_suffix')}</span>}</div>
              <button onClick={() => { setEditingConfig(c.id); setEditValue(c.options.join('\n')); }} class="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-lg transition border border-slate-700"><Icon name="edit" class="mr-1" /> {t('button.edit')}</button>
            </div>
          )}
        </div>
      ))}
    </div>

    <div class="bg-black/40 border border-rose-500/50 p-5 rounded-xl flex flex-col shadow-inner">
      <h3 class="text-sm font-bold text-rose-400 mb-2 uppercase tracking-wider"><Icon name="bullhorn" class="mr-1" /> {t('admin.marquee_announcement')}</h3>
      <p class="text-xs text-slate-300 mb-3">{t("admin.marquee_hint")}</p>
      <div class="flex gap-2">
        <input type="text" value={pengumuman} onInput={(e) => setPengumuman((e.target as HTMLInputElement).value)} placeholder={t("admin.announce_ph")} class="flex-1 bg-slate-800 border border-slate-600 rounded-lg text-sm px-4 py-2.5 text-white outline-none focus:border-rose-500" />
        <button onClick={handleSavePengumuman} class="bg-rose-600 hover:bg-rose-500 text-white px-6 py-2.5 rounded-lg text-sm font-bold transition shadow-lg"><Icon name="save" class="mr-1" /> {t('admin.save_and_publish')}</button>
      </div>
    </div>
  </div>);
}
