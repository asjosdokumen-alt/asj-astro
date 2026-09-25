/**
 * TabJadwal.tsx - Jadwal Agenda tab
 * Source: legacy admin.html admin-jadwal (lines 668-697)
 */
import { useState, useEffect } from 'preact/hooks';
import api from '../../lib/apiClient';
import { showToast } from '../Toast';
import { t } from '../../store/i18n';

import type { Jadwal } from '../../types/api';
import Icon from '../ui/Icon';

export default function TabJadwal() {
  const [jadwal, setJadwal] = useState<Jadwal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [tskList, setTskList] = useState<string[]>([]);
  const [nama, setNama] = useState('');
  const [loker, setLoker] = useState('');
  const [waktu, setWaktu] = useState('');
  const [lokasi, setLokasi] = useState('');
  const [tsk, setTsk] = useState('');
  const [link, setLink] = useState('');

  async function load() {
    try {
      const d: any = await api.secure('getAppData', ['admin']);
      if (d && d.success) { setJadwal(d.schedules || []); if (d.dropdowns?.tsk) setTskList(d.dropdowns.tsk); }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    try {
      const d: any = await api.secure('simpanJadwalBaru', [{ nama, loker, waktu, lokasi, tsk, link }]);
      if (d && d.success) { showToast(t('ui.toast_schedule_saved'), 'success'); await load(); } else showToast(t('ui.toast_error_prefix') + ((d && d.error) || ''), 'error');
    } catch (e: unknown) { showToast(t('alert.network') + (e instanceof Error ? e.message : String(e)), 'error'); }
  }

  const ic = 'w-full p-2.5 rounded-lg bg-black/60 border border-slate-700 text-white text-sm outline-none focus:border-amber-500 transition';

  if (loading) return <div class="text-center py-8"><Icon spin name="spinner" class="text-2xl text-amber-400" /><p class="text-slate-500 mt-2 text-sm">{t("admin.jadwal_loading")}</p></div>;

  return (<div>
    <div class='flex justify-between items-center border-b border-amber-900/50 pb-4 mb-4'>
      <h2 class='text-amber-400 font-bold text-lg'><Icon name="calendar-alt" class="mr-2" /> {t("admin.tab_schedule")}</h2>
      <button onClick={()=>setShowForm(!showForm)} class='px-5 py-2 bg-amber-600 text-white rounded-lg text-sm font-bold hover:bg-amber-500 shadow-lg transition'><Icon name="plus" class="mr-1" /> {showForm ? t("ui.close") : t("admin.new_schedule")}</button>
    </div>

    {showForm && <div class='bg-black/40 border border-slate-700 rounded-xl p-5 mb-5 shadow-inner'>
      {/* EXPLICIT grid, not `.u-grid-auto` — see AdminJobEditModal.tsx for the
          full measurement. The `md:col-span-2` submit row below forces an
          IMPLICIT 0px track on `.u-grid-auto` whenever auto-fit yields one
          track; an explicit grid has a fixed count and cannot. `lg:` because
          `--u-grid-min` (24rem) keeps the single-track regime past `md`. */}
      <form onSubmit={handleSubmit} class='grid grid-cols-1 lg:grid-cols-2 gap-4'>
        <div><label class='block text-xs font-bold text-slate-300 mb-1.5' for="tj-nama">{t("admin.jadwal_nama")}</label><input type='text' id="tj-nama" value={nama} onInput={(e)=>setNama((e.target as HTMLInputElement).value)} required class={ic} /></div>
        <div><label class='block text-xs font-bold text-slate-300 mb-1.5' for="tj-id-loker">{t("admin.jadwal_id_loker")}</label><input type='text' id="tj-id-loker" value={loker} onInput={(e)=>setLoker((e.target as HTMLInputElement).value)} placeholder='UMUM / ASJ...' class={ic} /></div>
        <div><label class='block text-xs font-bold text-slate-300 mb-1.5' for="tj-waktu">{t("admin.schedule_waktu")}</label><input type='datetime-local' id="tj-waktu" value={waktu} onInput={(e)=>setWaktu((e.target as HTMLInputElement).value)} required class={ic} /></div>
        <div><label class='block text-xs font-bold text-slate-300 mb-1.5' for="tj-lokasi">{t("admin.jadwal_lokasi")}</label><input type='text' id="tj-lokasi" value={lokasi} onInput={(e)=>setLokasi((e.target as HTMLInputElement).value)} placeholder='Zoom / Kantor...' class={ic} /></div>
        <div><label class='block text-xs font-bold text-slate-300 mb-1.5' for="tj-pengurus">{t("admin.jadwal_pengurus")}</label><select id="tj-pengurus" value={tsk} onInput={(e)=>setTsk((e.target as HTMLSelectElement).value)} required class={ic}><option value=''>-</option>{tskList.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
        <div><label class='block text-xs font-bold text-slate-300 mb-1.5' for="tj-link">{t("admin.jadwal_link")}</label><input type='url' id="tj-link" value={link} onInput={(e)=>setLink((e.target as HTMLInputElement).value)} placeholder='https://...' class={ic} /></div>
        <div class='lg:col-span-2 mt-2'><button type='submit' class='w-full py-4 rounded-xl bg-amber-600 hover:bg-amber-500 font-bold text-white text-sm shadow-lg transition'><Icon name="save" class="mr-2" /> {t("admin.save_schedule")}</button></div>
      </form>
    </div>}

    {/* MEASURED DEFECT (2026-09-25), item 5: this table carried
        `min-w-[800px]` and NO scroll wrapper. At 390px the container is 375px
        while the table's `scrollWidth` was 816px (2.2x) — so the whole page
        scrolled sideways, not just the table. Two changes, both measured:
          1. `.u-scroll-x` now wraps the table, so any residual overflow is
             contained inside the box and scrolls rather than pushing the page.
          2. the floor drops 800px -> 640px. 800px was an arbitrary number
             picked for a desktop table; 640px keeps all five columns legible
             (measured at 390/768/1280) while cutting the phone-side horizontal
             scroll distance by 20%. `.u-scroll-x` is what makes the smaller
             floor safe — without it a 640px table would still break the page. */}
    <div class='u-scroll-x'>
    <table class='w-full min-w-[640px] text-sm text-left whitespace-nowrap'>
      <thead class='bg-slate-800 text-slate-300 text-[13px] font-semibold border-b border-slate-700'><tr>
        <th class='p-4'>{t("admin.jadwal_col_id")}</th><th class='p-4'>{t("admin.jadwal_col_agenda")}</th><th class='p-4'>{t("admin.jadwal_col_job")}</th><th class='p-4'>{t("admin.jadwal_col_lokasi")}</th><th class='p-4 text-center'>{t("admin.aksi")}</th>
      </tr></thead>
      <tbody class='divide-y divide-slate-800'>
        {jadwal.length===0 ? <tr><td colSpan={5} class='p-6 text-center text-slate-500'>{t("admin.jadwal_empty")}</td></tr> :
        jadwal.map(j => (
          <tr key={j.id} class='border-b border-slate-800 hover:bg-white/5'>
            <td class='p-4 font-mono text-amber-300 font-bold'>{j.id}</td>
            <td class='p-4 font-bold text-white'>{j.nama}</td>
            <td class='p-4'><div class='text-white font-bold'>{j.loker || '-'}</div><div class='text-[11px] text-slate-400 mt-1'>{j.waktu || '-'}</div></td>
            <td class='p-4'><div class='text-white'>{j.lokasi || '-'}</div>{j.link && <a href={j.link} target='_blank' class='text-xs text-sky-400 hover:underline'>{t("admin.jadwal_link_zoom")}</a>}</td>
            <td class='p-4 text-center'><button onClick={() => { setNama(j.nama); setLoker(j.loker || ""); setWaktu(j.waktu || ""); setLokasi(j.lokasi || ""); setTsk(j.tsk || ""); setLink(j.link || ""); setShowForm(true); }} class="min-h-11 inline-flex items-center px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded font-bold shadow text-[11px] cursor-pointer"><Icon name="edit" /> Edit</button><button onClick={async () => { if(!confirm(t('ui.confirm_delete_schedule'))) return; try { const d: any = await api.secure('hapusJadwal', [j.id]); if(d && d.success){showToast(t('ui.toast_schedule_deleted'),'success'); await load();} else showToast(t('ui.toast_error_prefix')+(d?.error||''),'error'); } catch(e){showToast(t('alert.network'),'error');} }} class="min-h-11 inline-flex items-center ml-2 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded font-bold shadow text-[11px] cursor-pointer"><Icon name="trash" /></button></td>
          </tr>))}
      </tbody>
    </table>
    </div>
  </div>);
}
