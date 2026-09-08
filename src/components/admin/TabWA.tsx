/**
 * TabWA.tsx - WA Pintar tab
 * Source: legacy admin.html admin-wa (lines 747-799) + js/08_wa_pintar.js
 *
 * B02 parity fixes:
 *  - Old save/delete posted raw {nama, isi}/{id} bodies to /.netlify/functions/config
 *    — a dead contract; the real actions are simpanWaTemplate [id?, nama, isi] and
 *    hapusWaTemplate [id] on the notify surface (admin-guarded).
 *  - Reads went through raw fetch to get-app-data; now api.secure (session auto-inject,
 *    routing, cache).
 *  - alert()/confirm()/location.reload() → showToast + in-place refetch (parity legacy
 *    showToast + refreshDataDinamis('wa')).
 *  - All copy via t() keys (id+jp), values from legacy locales.
 */
import { useState, useEffect } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import api from '../../lib/apiClient';
import { showToast } from '../Toast';
import { t, langStore } from '../../store/i18n';

import type { WaTemplate } from '../../types/api';
import Icon from '../ui/Icon';

export default function TabWA() {
  const _lang = useStore(langStore);
  const [templates, setTemplates] = useState<WaTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [nama, setNama] = useState('');
  const [isi, setIsi] = useState('');

  async function load() {
    try {
      const d: any = await api.secure('getAppData', ['admin']);
      if (d && d.success) setTemplates(Array.isArray(d.waTemplates) ? d.waTemplates : []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!nama.trim()) { showToast(t('admin.wa_template_name_wajib'), 'error'); return; }
    setSaving(true);
    try {
      // B02: kontrak simpanWaTemplate [id?, nama, isi] — parity legacy callAPI("simpanWaTemplate", [id, nama, isi, S])
      const r: any = await api.secure('simpanWaTemplate', [editingId, nama.trim(), isi]);
      if (r && r.success) {
        showToast(t('ui.toast_wa_template_saved'), 'success');
        setEditingId(''); setNama(''); setIsi('');
        await load();
      } else {
        showToast(t('ui.toast_error_prefix') + ((r && r.error) || ''), 'error');
      }
    } catch (err: any) {
      showToast(t('alert.network') + (err && err.message ? err.message : String(err)), 'error');
    } finally { setSaving(false); }
  }

  function handleEdit(tpl: WaTemplate) { setEditingId(tpl.id); setNama(tpl.nama); setIsi(tpl.isi); }
  function handleCancel() { setEditingId(''); setNama(''); setIsi(''); }

  async function handleDelete(id: string) {
    if (!confirm(t('ui.confirm_delete_template'))) return;
    try {
      const r: any = await api.secure('hapusWaTemplate', [id]);
      if (r && r.success) {
        showToast(t('ui.template_deleted'), 'success');
        await load();
      } else {
        showToast(t('ui.toast_error_prefix') + ((r && r.error) || ''), 'error');
      }
    } catch (err: any) {
      showToast(t('alert.network') + (err && err.message ? err.message : String(err)), 'error');
    }
  }

  const ic = 'w-full p-2.5 rounded-lg bg-black/60 border border-slate-600 text-white text-sm outline-none focus:border-emerald-500 transition';

  if (loading) return <div class="text-center py-8"><Icon spin name="spinner" class="text-2xl text-emerald-400" /><p class="text-slate-500 mt-2 text-sm">{t('ui.memuat_template')}</p></div>;

  return (<div>
    <h2 class="text-emerald-400 font-bold mb-6 border-b border-emerald-900/50 pb-3 text-lg"><Icon name="whatsapp" class="mr-2" /> {t('ui.manage_wa_templates')}</h2>

    <div class="mb-6 bg-emerald-950/60 p-5 rounded-2xl border-2 border-emerald-500/70 shadow-[0_0_25px_rgba(16,185,129,0.3)] flex flex-col sm:flex-row sm:items-center gap-4">
      <div class="flex-1">
        <div class="flex items-center gap-2 mb-1.5"><span class="text-[9px] font-black uppercase tracking-widest bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 rounded-full px-2.5 py-1"><Icon name="star" class="text-amber-400 mr-1" /> {t('ui.featured_badge')}</span></div>
        <h3 class="text-sm font-bold text-emerald-300 uppercase tracking-widest mb-1"><Icon name="whatsapp" class="text-emerald-400 mr-1" /> {t('ui.invite_class_title')}</h3>
        <p class="text-xs text-slate-300 leading-relaxed">{t('ui.invite_class_wa_desc')}</p>
      </div>
      <button onClick={() => { window.dispatchEvent(new CustomEvent("openUndanganKelas")); }} class="px-5 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold text-center rounded-xl shadow-lg shadow-emerald-900/60 transition hover:-translate-y-0.5 shrink-0 cursor-pointer"><Icon name="whatsapp" class="text-white text-lg mr-1" /> {t('ui.start_invite')}</button>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class="lg:col-span-1 bg-black/40 p-5 rounded-2xl border border-slate-700 flex flex-col h-fit">
        <h3 class="text-sm font-bold text-slate-300 uppercase tracking-widest mb-4">{editingId ? t('ui.template_edit_title') : t('ui.new_template')}</h3>
        <form onSubmit={handleSubmit} class="space-y-4">
          <div><label class="block text-xs font-bold text-slate-300 mb-1">{t('ui.template_name')}</label><input type="text" value={nama} onInput={(e) => setNama((e.target as HTMLInputElement).value)} required placeholder={t('admin.wa_template_ph_nama')} class={ic} /></div>
          <div><label class="block text-xs font-bold text-slate-300 mb-1">{t('ui.template_message')}</label><textarea value={isi} onInput={(e) => setIsi((e.target as HTMLTextAreaElement).value)} required rows={8} placeholder={t('admin.wa_template_ph_isi')} class={ic + ' leading-relaxed'}></textarea>
            <p class="text-[9px] text-emerald-400/80 mt-1.5 leading-relaxed font-mono bg-emerald-900/20 p-2 rounded" dangerouslySetInnerHTML={{ __html: t('ui.template_code_hint') }} />
          </div>
          <div class="flex gap-2 pt-2">
            <button type="submit" disabled={saving} class="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold shadow-lg transition text-sm"><Icon name="save" class="mr-1" /> {saving ? t('ui.saving') : t('ui.save_template')}</button>
            {editingId && <button type="button" onClick={handleCancel} class="px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-bold shadow-lg transition text-sm"><Icon name="times" /></button>}
          </div>
        </form>
      </div>

      <div class="lg:col-span-2">
        <h3 class="text-sm font-bold text-slate-300 uppercase tracking-widest mb-4"><Icon name="list" class="mr-1" /> {t('ui.template_saved')}</h3>
        {templates.length === 0 ? <p class="text-slate-500 text-sm text-center py-8">{t('ui.template_empty')}</p> :
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates.map(tpl => (
            <div key={tpl.id} class="bg-slate-800/80 border border-slate-700 rounded-xl p-4 hover:border-emerald-500/50 transition">
              <div class="flex items-center justify-between mb-2"><span class="text-emerald-400 font-bold text-sm">{tpl.nama}</span></div>
              <pre class="text-xs text-slate-300 bg-black/40 rounded-lg p-3 mb-3 whitespace-pre-wrap max-h-32 overflow-y-auto custom-scrollbar">{tpl.isi}</pre>
              <div class="flex gap-2">
                <button onClick={() => handleEdit(tpl)} class="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition"><Icon name="edit" class="mr-1" /> {t('ui.template_edit')}</button>
                <button onClick={() => handleDelete(tpl.id)} class="px-3 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-lg transition"><Icon name="trash" /></button>
              </div>
            </div>
          ))}</div>}
        </div>
    </div>

  </div>);
}