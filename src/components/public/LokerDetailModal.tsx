/**
 * LokerDetailModal.tsx — Job detail popup with rincian biaya
 * Migrated from legacy/js/01_public.ts bukaDetailLoker()
 * Modern Preact: TypeScript, i18n, theme-aware CSS vars
 *
 * B04 parity (2026-09-05) fixed two root mismatches vs bukaDetailLoker:
 *   1. jobTutupUntukLamar dropped LIST-CHECK/PENCARIAN/PENDAFTARAN/DAFTAR
 *      from the still-open set — jobs still recruiting showed a disabled
 *      "Lamar" button. Now imports the canonical rule (src/lib/jobPhase.ts).
 *   2. The pamflet was a static image; legacy opens bukaPamflet (full zoom)
 *      on click with a ui.click_zoom title, like the list rows. Now wired
 *      to PamfletModal.
 */
import { useState } from 'preact/hooks';
import { t } from '../../store/i18n';
import { jobTutupUntukLamar } from '../../lib/jobPhase';
import { jobCategoryLabel, jobGenderLabel, jobLocationLabel } from '../../lib/jobDisplay';
import Icon from '../ui/Icon';
import { useOverlay } from '../ui/useOverlay';
import PamfletModal from './PamfletModal';

interface Job { code: string; pekerjaan: string; status: string; tahapan: string; keterangan: string; kategori: string; kuota: string; gender: string; lokasi: string; syarat: string; rincianBiaya?: string; totalBiaya?: string; pamflet?: string; templateCv?: string; dokumenShare?: string; }
interface Props { job: Job; onClose: () => void; }
interface Step { nomor: string; nama: string; nominal: string; }
interface RSection { type: string; items: (Step | string)[]; }
interface Parsed { total: string; sections: RSection[]; }

function parseRincianBiaya(text: string): Parsed {
  const out: Parsed = { total: '', sections: [] };
  if (!text) return out;
  let cur: RSection | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim(); if (!line) continue;
    const mt = line.match(/^TOTAL\s*BIAYA\s*[:=]?\s*(.+)$/i);
    if (mt) { out.total = mt[1].trim(); continue; }
    const mh = line.match(/^(TAHAPAN\s*PEMBAYARAN|INCLUDE|EXCLUDE|BENEFIT|PERSYARATAN|CATATAN)\b/i);
    if (mh) { let key = mh[1].toUpperCase().replace(/\s+/g, '_'); if (key === 'TAHAPAN_PEMBAYARAN') key = 'TAHAPAN'; cur = { type: key, items: [] }; out.sections.push(cur); continue; }
    const ms = line.match(/^\s*(\d+)[.)]\s*(.+?)\s*[:=]\s*(.+)$/);
    if (ms) { if (!cur || cur.type !== 'TAHAPAN') { cur = { type: 'TAHAPAN', items: [] }; out.sections.push(cur); } cur.items.push({ nomor: ms[1], nama: ms[2].trim(), nominal: ms[3].trim() }); continue; }
    const content = line.replace(/^[•▪\-*]\s*/, '').trim();
    if (!cur) { cur = { type: 'INFO', items: [] }; out.sections.push(cur); } cur.items.push(content);
  }
  return out;
}

function StepTimeline({ sections }: { sections: RSection[] }) {
  const byType: Record<string, RSection[]> = {};
  for (const s of sections) { const k = s.type === 'TAHAPAN_PEMBAYARAN' ? 'TAHAPAN' : s.type; (byType[k] ??= []).push(s); }
  const itemsOf = (arr?: RSection[]): (Step | string)[] => { if (!arr) return []; const o: (Step | string)[] = []; for (const s of arr) if (s.items) o.push(...s.items.filter(Boolean)); return o; };
  const stepAll = itemsOf(byType.TAHAPAN as unknown as RSection[]);
  const incItems = itemsOf(byType.INCLUDE); const excItems = itemsOf(byType.EXCLUDE);
  const benItems = itemsOf(byType.BENEFIT); const perItems = itemsOf(byType.PERSYARATAN);
  const catItems = itemsOf(byType.CATATAN); const infoItems = itemsOf(byType.INFO);
  return (<>
    {stepAll.length > 0 && (<div class="mb-6"><h4 class="text-xs font-black text-white uppercase tracking-widest mb-4"><Icon name="stairs" class="mr-1.5 text-amber-400" />{t('ui.payment_stage')}</h4><div class="space-y-0">{(stepAll as Step[]).map((st, i) => { const last = i === stepAll.length - 1; return (<div key={i} class={'flex gap-3 relative pb-5' + (last ? ' last:pb-0' : '')}><div class="flex flex-col items-center"><div class="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-emerald-500/20 border border-emerald-400/60 text-emerald-400 text-xs font-black">{i + 1}</div>{!last && <div class="w-px flex-1 bg-emerald-500/25 my-1"></div>}</div><div class="flex-1 pt-1.5"><div class="flex flex-wrap items-center justify-between gap-2"><p class="font-black text-white text-[13px] tracking-wide">{st.nama || String(st)}</p>{st.nominal && <span class="px-3 py-1 bg-emerald-600 text-white rounded-full text-xs font-black shadow">{st.nominal}</span>}</div></div></div>); })}</div></div>)}
    {(incItems.length > 0 || excItems.length > 0) && (<div class="u-grid-auto u-grid-auto--form gap-4 mb-6">{incItems.length > 0 && <div class="bg-emerald-900/15 border border-emerald-500/30 rounded-2xl p-4"><h5 class="text-emerald-400 font-black text-[11px] uppercase tracking-widest mb-3"><Icon name="check-circle" class="mr-1" />{t('ui.include')}</h5><div class="flex flex-wrap gap-2">{incItems.map((x, i) => <span key={i} class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-900/40 text-emerald-300 border border-emerald-500/40 rounded-full text-[10px] font-bold">{String(x)}</span>)}</div></div>}{excItems.length > 0 && <div class="bg-rose-900/15 border border-rose-500/30 rounded-2xl p-4"><h5 class="text-rose-400 font-black text-[11px] uppercase tracking-widest mb-3"><Icon name="times-circle" class="mr-1" />{t('ui.exclude')}</h5><div class="flex flex-wrap gap-2">{excItems.map((x, i) => <span key={i} class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-900/40 text-rose-300 border border-rose-500/40 rounded-full text-[10px] font-bold">{String(x)}</span>)}</div></div>}</div>)}
    {(benItems.length > 0 || perItems.length > 0) && (<div class="u-grid-auto u-grid-auto--form gap-4 mb-6">{benItems.length > 0 && <div class="bg-amber-900/15 border border-amber-500/30 rounded-2xl p-4"><h4 class="text-xs font-black text-amber-400 uppercase tracking-widest mb-3"><Icon name="star" class="mr-1.5" />{t('ui.benefit')}</h4><ul class="space-y-2">{benItems.map((x, i) => <li key={i} class="flex items-start text-xs text-slate-300"><Icon name="circle-check" class="text-amber-500 mt-0.5 mr-2 text-[10px]" />{String(x)}</li>)}</ul></div>}{perItems.length > 0 && <div class="bg-slate-900/60 border border-slate-700 rounded-2xl p-4"><h4 class="text-xs font-black text-sky-400 uppercase tracking-widest mb-3"><Icon name="clipboard-check" class="mr-1.5" />{t('ui.requirements')}</h4><ul class="space-y-2">{perItems.map((x, i) => <li key={i} class="flex items-start text-xs text-slate-300"><Icon name="check" class="text-emerald-500 mt-0.5 mr-2 text-[10px]" />{String(x)}</li>)}</ul></div>}</div>)}
    {catItems.length > 0 && <div class="bg-sky-900/15 border border-sky-500/30 rounded-2xl p-4 mb-6"><h4 class="text-xs font-black text-sky-400 uppercase tracking-widest mb-2"><Icon name="info-circle" class="mr-1.5" />{t('ui.note')}</h4><p class="text-[11px] text-slate-300 leading-relaxed whitespace-pre-wrap">{catItems.map(String).join('\n')}</p></div>}
    {infoItems.length > 0 && <div class="bg-slate-900/60 border border-slate-700 rounded-2xl p-4 mb-6"><h4 class="text-xs font-black text-slate-300 uppercase tracking-widest mb-2"><Icon name="info" class="mr-1.5" />{t('ui.info_lain')}</h4><p class="text-[11px] text-slate-300 leading-relaxed whitespace-pre-wrap">{infoItems.map(String).join('\n')}</p></div>}
  </>);
}

/**
 * Gender chip. Uses the semantic `gender-badge--*` classes (see global.css §5b)
 * instead of the old literal `bg-blue-900/50` etc., which stayed dark-on-dark
 * when the theme flipped to light sakura.
 */
function GenderBadge({ gender }: { gender: string }) {
  const v = (gender || '').toUpperCase();
  if (v.includes('LAKI') || v.includes('PRIA') || v === 'L') return <span class="gender-badge gender-badge--male px-2.5 py-1 rounded font-bold"><Icon name="mars" class="mr-1" />{t('candidate.gender_l')}</span>;
  if (v.includes('WANITA') || v.includes('PEREMPUAN') || v === 'P') return <span class="gender-badge gender-badge--female px-2.5 py-1 rounded font-bold"><Icon name="venus" class="mr-1" />{t('candidate.gender_p')}</span>;
  return <span class="gender-badge gender-badge--mixed px-2.5 py-1 rounded font-bold"><Icon name="venus-mars" class="mr-1" />{jobGenderLabel(gender) || '-'}</span>;
}
export default function LokerDetailModal({ job, onClose }: Props) {
  const st = (job.status || '').toUpperCase();
  const isOpen = st.includes('OPEN') || st.includes('URGENT');
  const isUrgent = st.includes('URGENT');
  const parsed = parseRincianBiaya(job.rincianBiaya || '');
  const total = job.totalBiaya || parsed.total || '';
  const tutupLamar = jobTutupUntukLamar(job);
  const waMsg = 'Halo Admin ASJ, saya tertarik lowongan ' + job.code + ' (' + job.pekerjaan + '). Mohon info lebih lanjut.';
  const WA_NUMBER = '6287889502004';
  const syaratList = job.syarat && job.syarat !== '-'
    ? String(job.syarat).split(',').map(s => s.trim()).filter(Boolean) : [];
  const pamfletUrl = job.pamflet && job.pamflet !== '-' && job.pamflet.length > 5 ? job.pamflet : '';

  const [zoomOpen, setZoomOpen] = useState(false);
  const { containerRef, onBackdropClick } = useOverlay({ open: true, onClose });

  return (
    <>
    <div class="fixed inset-0 u-modal-shell bg-black/70 backdrop-blur-md z-[150] flex items-center justify-center p-4" ref={containerRef} onClick={onBackdropClick}>
      <div class="bg-slate-900 border border-slate-700 rounded-[2rem] w-full max-w-lg max-h-[85vh] u-scroll-area shadow-2xl custom-scrollbar" onClick={(e: MouseEvent) => e.stopPropagation()}>
        <div class="sticky top-0 bg-slate-900/95 backdrop-blur-sm border-b border-slate-700 p-4 flex items-center justify-between z-10">
          <span class="text-sky-400 font-mono text-xs font-bold">{job.code}</span>
          <button onClick={onClose} class="text-slate-400 hover:text-white p-1"><Icon name="times" class="text-xl" /></button>
        </div>
        <div class="p-5">
          <div class="flex items-start gap-4 mb-6">
            {pamfletUrl && <img src={pamfletUrl} loading="lazy" decoding="async" title={t('ui.click_zoom')} onClick={() => setZoomOpen(true)} class="w-20 h-28 object-cover rounded-xl border border-slate-600 shadow-lg cursor-pointer hover:scale-105 transition flex-shrink-0" alt={t('ui.alt_pamflet')} />}
            <div class="flex-1 min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-sky-400 font-mono text-xs font-bold">{job.code}</span>
                {isUrgent ? <span class="px-2.5 py-1 bg-amber-500 text-white rounded-full text-[10px] font-black animate-pulse"><Icon name="bolt" class="mr-1" />{t('status.urgent')}</span>
                : isOpen ? <span class="px-2.5 py-1 bg-emerald-600 text-white rounded-full text-[10px] font-black"><Icon name="door-open" class="mr-1" />{t('status.open')}</span>
                : <span class="px-2.5 py-1 bg-red-700/80 text-white rounded-full text-[10px] font-black"><Icon name="door-closed" class="mr-1" />{t('status.close')}</span>}
                {job.kuota && job.kuota !== '-' && <span class="px-2 py-0.5 bg-slate-800 text-slate-300 border border-slate-600 rounded-full text-[9px] font-bold"><Icon name="users" class="mr-1" />{t('ui.quota')}: {job.kuota}</span>}
              </div>
              <h3 class="text-xl md:text-2xl font-black text-white mt-1.5 leading-tight">{job.pekerjaan}</h3>
              <div class="flex flex-wrap items-center gap-2 mt-3 text-[11px]">
                <GenderBadge gender={job.gender} />
                {job.lokasi && <span class="px-2.5 py-1 bg-slate-800 text-slate-300 border border-slate-600 rounded font-bold"><Icon name="map-marker-alt" class="mr-1 text-red-400" />{jobLocationLabel(job.lokasi)}</span>}
              </div>
              {job.kategori && <div class="text-[10px] text-slate-500 mt-2"><Icon name="tag" class="mr-1 text-sky-500/70" />{jobCategoryLabel(job.kategori)}</div>}
            </div>
          </div>
          {total && <div class="bg-gradient-to-r from-emerald-900/40 to-sky-900/30 border border-emerald-500/40 rounded-2xl p-5 mb-6 text-center"><p class="text-[10px] font-bold uppercase tracking-[4px] text-emerald-400 mb-1"><Icon name="wallet" class="mr-1" />{t('ui.detail_total_title')}</p><p class="text-4xl font-black text-white tracking-wide">{total}</p><p class="text-[10px] text-slate-400 mt-1">{t('ui.detail_total_sub')}</p></div>}
          <StepTimeline sections={parsed.sections} />
          {syaratList.length > 0 && <div class="bg-slate-900/60 border border-slate-700 rounded-2xl p-5 mb-6"><h4 class="text-xs font-black text-sky-400 uppercase tracking-widest mb-4"><Icon name="clipboard-check" class="mr-1.5" />{t('ui.detail_syarat')}</h4><ul class="u-grid-auto u-grid-auto--form gap-x-6 gap-y-2.5">{syaratList.map((s, i) => <li key={i} class="flex items-start text-xs text-slate-300"><Icon name="check" class="text-emerald-500 mt-0.5 mr-2 text-[10px]" />{s}</li>)}</ul></div>}
          {job.keterangan && job.keterangan !== '-' && <div class="bg-sky-900/15 border border-sky-500/30 rounded-2xl p-5 mb-6"><h4 class="text-xs font-black text-sky-400 uppercase tracking-widest mb-2"><Icon name="info-circle" class="mr-1.5" />{t('ui.detail_keterangan')}</h4><p class="text-[11px] text-slate-300 leading-relaxed whitespace-pre-wrap">{job.keterangan}</p></div>}
          <div class="flex flex-col sm:flex-row gap-3">
            {job.templateCv && <a href={job.templateCv} target="_blank" download class="flex-1 px-5 py-3.5 bg-sky-600 hover:bg-sky-500 text-white text-sm font-bold text-center rounded-xl shadow transition"><Icon name="download" class="mr-1.5" />{t('button.format')}</a>}
            {tutupLamar ? <button disabled class="flex-1 px-5 py-3.5 bg-slate-600 text-white text-sm font-black text-center rounded-xl shadow-inner opacity-60 cursor-not-allowed"><Icon name="door-closed" class="mr-1.5" />{t('button.closed')}</button>
            : <a href={'/apply?job=' + encodeURIComponent(job.code)} class="flex-1 px-5 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-black text-center rounded-xl shadow transition"><Icon name="paper-plane" class="mr-1.5" />{t('button.apply_now')}</a>}
            <a href={'https://wa.me/' + WA_NUMBER + '?text=' + encodeURIComponent(waMsg)} target="_blank" class="flex-1 px-5 py-3.5 bg-[#25D366] hover:bg-[#1fbd5b] text-white text-sm font-bold text-center rounded-xl shadow transition"><Icon name="whatsapp" class="mr-1.5" />{t('button.chat_wa')}</a>
          </div>
        </div>
      </div>
    </div>
    <PamfletModal isOpen={zoomOpen} url={pamfletUrl} onClose={() => setZoomOpen(false)} />
    </>
  );
}
