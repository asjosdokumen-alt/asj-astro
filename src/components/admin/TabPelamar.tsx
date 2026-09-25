/**
 * TabPelamar.tsx — Admin candidate database tab
 * Source: legacy/index.html page-admin → admin-pelamar
 * With modals: Input Manual, Laporan Bulanan, Toggle View
 */
import { useEffect, useState } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import {
  kandidatList, kandidatTotal, kandidatLoading,
  adminSearch, adminFilterGender, adminFilterAge, adminFilterJft,
  adminPage, adminSimpleView, PAGE_SIZE,
  setAdminSearch, setAdminFilterGender, setAdminFilterAge, setAdminFilterJft,
  nextPage, toggleSimpleView, resetPage,
  openInputModal, openReportModal,
  fetchKandidatFromAPI,
} from '../../store/adminStore';
import InputManualModal from './InputManualModal.tsx';
import RirekishoBuilder from './RirekishoBuilder';
import AiCvForm from '../forms/AiCvForm';
import { ASJ_LOGO_URL } from '../../lib/vip';
import CvTemplateSelector from '../CvTemplateSelector';
import LaporanBulananModal from './LaporanBulananModal.tsx';
import WAPintarModal from '../WAPintarModal';
import api from '../../lib/apiClient';
import { normalizeWaInput } from '../../lib/schemas';
import {
  buildExcelBuffer,
  exportFilename,
  toCsvText,
} from '../../lib/candidateExport';

import type { Kandidat } from "../../store/adminStore";
import type { WaTemplate } from '../../types/api';
import { t, langStore } from '../../store/i18n';
import { showToast } from '../Toast';
import Icon from '../ui/Icon';

export default function TabPelamar() {
  const _lang = useStore(langStore);
  useEffect(() => { fetchKandidatFromAPI(); }, []);

  // Refresh daftar setelah evaluasi kandidat (catatan/VIP) disimpan dari
  // CandidateProfileModal — padanan legacy refreshDataDinamis('pelamar').
  useEffect(() => {
    const onCandidatesChanged = () => { fetchKandidatFromAPI(); };
    window.addEventListener('candidates-changed', onCandidatesChanged);
    return () => window.removeEventListener('candidates-changed', onCandidatesChanged);
  }, []);
  const kandidat = useStore(kandidatList);
  const [rirekWa, setRirekWa] = useState("");
  const fotoFallbackFor = (wa: string) => {
    const k = kandidat.find((c) => c.wa === wa);
    return k && k.pasPhoto ? String(k.pasPhoto) : undefined;
  };
  const [showRirek, setShowRirek] = useState(false);
  // P2 (2026-09-14): panel CV AI admin. Sama komponennya dengan dashboard CV AI
  // kandidat (/ai-cv) — bedanya admin melewati gate login (backend sudah
  // mengizinkan: isOwnerOrAdmin() benar untuk role:'admin' di WA mana pun).
  // Dipakai untuk membetulkan CV kandidat yang salah isi.
  const [aiCvWa, setAiCvWa] = useState('');
const [showCvTemplateSelector, setShowCvTemplateSelector] = useState(false);
  // B02: WA Pintar — legacy per-row button bukaModalWaPintar(idKandidat) opens
  // the smart-sender modal with template picker (js/08_wa_pintar.js); Astro's
  // old button was a bare wa.me link with no template/message support.
  const [waTemplates, setWaTemplates] = useState<WaTemplate[]>([]);
  const [waTarget, setWaTarget] = useState<{ nama: string; job: string; phone: string } | null>(null);
  useEffect(() => {
    // Templates datang dari getAppData (parity legacy window.ALL_WA_TEMPLATES).
    api.secure('getAppData', ['admin']).then((d: any) => {
      if (d && d.success) setWaTemplates(Array.isArray(d.waTemplates) ? d.waTemplates : []);
    }).catch(() => { /* non-blokir: modal tetap bisa dipakai manual */ });
  }, []);
  const totalAll = useStore(kandidatTotal);
  const loading = useStore(kandidatLoading);
  const search = useStore(adminSearch);
  const filterGender = useStore(adminFilterGender);
  const filterAge = useStore(adminFilterAge);
  const filterJft = useStore(adminFilterJft);
  const page = useStore(adminPage);
  const simpleView = useStore(adminSimpleView);


  // fetchKandidat moved to adminStore.fetchKandidatFromAPI()

  const filtered = kandidat.filter((k) => {
    const matchSearch = !search ||
      (k.nama || '').toLowerCase().includes(search.toLowerCase()) ||
      (k.wa || '').includes(search) ||
      (k.idLoker || '').toLowerCase().includes(search.toLowerCase()) ||
      (k.tahapan || '').toLowerCase().includes(search.toLowerCase());
    const matchGender = filterGender === 'all' || (k.gender || '').toLowerCase() === filterGender;
    const matchJft = filterJft === 'all' || (k.jft || '').toLowerCase().includes(filterJft);
    const usia = parseInt(String(k.usia || ''), 10);
    const matchAge = filterAge === 'all' ||
      (filterAge === 'under20' && !isNaN(usia) && usia < 20) ||
      (filterAge === '20to25' && !isNaN(usia) && usia >= 20 && usia <= 25) ||
      (filterAge === 'over25' && !isNaN(usia) && usia > 25);
    return matchSearch && matchGender && matchJft && matchAge;
  });

  const shown = filtered.slice(0, (page + 1) * PAGE_SIZE);

  // Ekspor memakai satu sumber kebenaran: `src/lib/candidateExport.ts`.
  // Definisi kolom TIDAK ditulis di sini — itulah yang membuat CSV lama hanya
  // 7 kolom sementara legacy 11, dan membuat Excel mustahil konsisten.
  // `filtered` = baris setelah filter aktif, jadi ekspor selalu mengikuti
  // apa yang sedang dilihat admin (perilaku legacy).
  function exportCsv() {
    const blob = new Blob([toCsvText(filtered)], { type: 'text/csv;charset=utf-8;' });
    triggerDownload(blob, exportFilename('csv'));
    showToast(t('ui.toast_csv_downloaded').replace('{n}', String(filtered.length)), 'success');
  }

  async function exportExcel() {
    try {
      // xlsx diimpor dinamis di dalam buildExcelBuffer — tidak membebani bundle awal.
      const buf = await buildExcelBuffer(filtered);
      const blob = new Blob([buf], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      triggerDownload(blob, exportFilename('xlsx'));
      showToast(t('ui.toast_excel_downloaded').replace('{n}', String(filtered.length)), 'success');
    } catch (e) {
      showToast(t('ui.toast_error_prefix') + (e instanceof Error ? e.message : String(e)), 'error');
    }
  }

  function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Revoke tertunda: melepas URL sinkron bisa membatalkan unduhan di beberapa
    // browser (legacy memakai 5 detik — paritas perilaku).
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }



  return (
    <div>
      {/* Header with buttons */}
      <div class="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-sky-900/50 pb-4 mb-4 gap-4">
        <h2 class="text-sky-400 font-bold text-lg"><Icon name="users" class="mr-2" /> {t('admin.candidate_database')}</h2>
        <div class="flex flex-wrap gap-3 w-full md:w-auto">
          <div class="relative flex-1 md:w-64">
            <Icon name="search" class="absolute left-3 top-2.5 text-slate-300 text-sm" />
            <input type="text" value={search} onInput={(e) => { setAdminSearch((e.target as HTMLInputElement).value); resetPage(); }}
              placeholder={t("pelamar.placeholder_search")}
              class="min-h-11 w-full pl-9 p-2 rounded-lg bg-black/40 border border-slate-700 text-sm text-white outline-none focus:border-sky-500 transition" />
          </div>
          <button onClick={() => openInputModal()} class="px-5 py-2 bg-sky-600 text-white rounded-lg text-sm font-bold hover:bg-sky-500 shadow-lg transition whitespace-nowrap"><Icon name="user-plus" class="mr-1" /> {t('admin.input_manual')}</button>
          <button onClick={() => toggleSimpleView()} class="px-5 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-bold shadow-lg transition whitespace-nowrap">
            <Icon name={simpleView ? 'table-list' : 'table-cells-large'} class="mr-1" /> {simpleView ? t('admin.view_full') : t('admin.view_simple')}
          </button>
          <button onClick={exportCsv} class="px-5 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-sm font-bold shadow-lg transition whitespace-nowrap"><Icon name="file-csv" class="mr-1" /> {t('admin.export_csv')}</button>
          <button onClick={exportExcel} class="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-bold shadow-lg transition whitespace-nowrap"><Icon name="file-excel" class="mr-1" /> {t('admin.export_excel')}</button>
          <button onClick={() => openReportModal()} class="px-5 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded-lg text-sm font-bold shadow-lg transition whitespace-nowrap"><Icon name="chart-bar" class="mr-1" /> {t('admin.monthly_report')}</button>
        </div>
      </div>

      {/* Filters */}
      <div class="flex flex-wrap gap-3 mb-4 p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
        <div class="flex items-center gap-2 text-sky-400 font-bold text-sm mr-2"><Icon name="filter" /> {t('admin.filter')}</div>
        <select value={filterGender} onChange={(e) => { setAdminFilterGender((e.target as HTMLSelectElement).value); }}
          class="bg-black/40 border border-slate-700 text-slate-300 text-sm rounded-lg px-3 py-1.5 focus:border-sky-500 outline-none">
          <option value="all">{t('share.gen_all')}</option><option value="l">{t('share.gen_l')}</option><option value="p">{t('share.gen_p')}</option>
        </select>
        <select value={filterAge} onChange={(e) => { setAdminFilterAge((e.target as HTMLSelectElement).value); }}
          class="bg-black/40 border border-slate-700 text-slate-300 text-sm rounded-lg px-3 py-1.5 focus:border-sky-500 outline-none">
          <option value="all">{t('share.age_all')}</option><option value="under20">&lt; 20</option><option value="20to25">20 - 25</option><option value="over25">&gt; 25</option>
        </select>
        <select value={filterJft} onChange={(e) => { setAdminFilterJft((e.target as HTMLSelectElement).value); }}
          class="bg-black/40 border border-slate-700 text-slate-300 text-sm rounded-lg px-3 py-1.5 focus:border-sky-500 outline-none">
          <option value="all">{t('share.jft_all')}</option><option value="a2">A2 / N4</option><option value="b1">B1 / N3</option>
        </select>
      </div>

      {loading ? (
        <div class="text-center py-8"><Icon spin name="spinner" class="text-2xl text-sky-400" /><p class="text-slate-500 mt-2 text-sm">{t('admin.loading_candidates')}</p></div>
      ) : simpleView ? (
        /* Simple View — compact list */
        <div class="space-y-2">
          {shown.length === 0 ? (
            <p class="text-slate-500 text-sm text-center py-8">{t('admin.no_candidates')}</p>
          ) : shown.map((k) => (
            <div key={k.id || k.wa} class="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700/50 hover:bg-white/5 transition">
              <div class="flex items-center gap-3">
                <span class="font-mono text-sky-300 font-bold text-xs">{k.id || k.wa}</span>
                <span class="font-bold text-white text-sm">{k.nama}{(k.isVIP || k.isSiswaASJ) && <img src={ASJ_LOGO_URL} alt="" title={t('ui.badge_official')} class="inline-block w-4 h-4 ml-1 align-middle object-contain rounded-full border border-emerald-500/50 drop-shadow-md" />}</span>
                <span class="font-mono text-purple-300 text-xs">{k.idLoker}</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-sky-500/20 text-sky-400 border border-sky-500/40">{k.tahapan}</span>
                <button onClick={() => window.open("https://wa.me/" + (k.wa || ""), "_blank")} class="w-7 h-7 flex items-center justify-center bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs cursor-pointer"><Icon name="whatsapp" /></button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Full View — table */
        <div class="u-scroll-x rounded-xl border border-slate-800">
          <table class="w-full min-w-[900px] text-sm text-left whitespace-nowrap">
            <thead class="bg-slate-800 text-slate-300 text-[13px] font-semibold border-b border-slate-700">
              <tr>
                <th scope="col" class="p-4">{t('table.candidate_id')}</th>
                <th scope="col" class="p-4">{t('table.full_name')}</th>
                <th scope="col" class="p-4">{t('table.job_applied')}</th>
                <th scope="col" class="p-4">{t('table.stage_and_status')}</th>
                <th scope="col" class="p-4">{t('table.admin_notes')}</th>
                <th scope="col" class="p-4 text-center">{t('table.action')}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800">
              {shown.length === 0 ? (
                <tr><td colSpan={6} class="p-6 text-center text-slate-500">{t('admin.no_candidates')}</td></tr>
              ) : shown.map((k) => (
                <tr key={k.id || k.wa} class="hover:bg-white/5 transition-colors">
                  <td class="p-4 font-mono text-sky-300 font-bold text-xs">{k.id || k.wa || '-'}</td>
                  <td class="p-4 font-bold text-white">{k.nama || '-'}{(k.isVIP || k.isSiswaASJ) && <img src={ASJ_LOGO_URL} alt="" title={t('ui.badge_official')} class="inline-block w-4 h-4 ml-1 align-middle object-contain rounded-full border border-emerald-500/50 drop-shadow-md" />}</td>
                  <td class="p-4"><span class="font-mono text-purple-300 text-xs">{k.idLoker || '-'}</span></td>
                  <td class="p-4">
                    <span class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-sky-500/20 text-sky-400 border border-sky-500/40">{k.tahapan || '-'}</span>
                    <span class="ml-1 text-xs text-slate-400">{k.status || '-'}</span>
                  </td>
                  <td class="p-4 text-xs text-slate-400 max-w-[200px] truncate" title={k.catatanExt || k.catatan || ''}>{(k.catatanExt || k.catatan) || '-'}</td>
                  <td class="p-4 text-center">
                    <div class="flex flex-wrap justify-center gap-1">
                      <button onClick={() => { window.dispatchEvent(new CustomEvent("showCandidateHistory", { detail: { wa: k.wa, nama: k.nama, candidate: k } })); }} class="w-8 h-8 flex items-center justify-center bg-slate-700 hover:bg-slate-600 text-white rounded text-xs shadow transition cursor-pointer"><Icon name="clock" /></button>
                      <button onClick={()=>{setShowCvTemplateSelector(true);}} class="px-2 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-[11px] font-bold shadow transition"><Icon name="file-alt" class="mr-1 text-sky-400" /> {t('button.pilih_template_cv')}</button>
<button onClick={()=>{setRirekWa(k.wa);setShowRirek(true);}} class="px-2 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded text-[11px] font-bold shadow transition"><Icon name="file-alt" class="mr-1" /> CV</button>
                      <button onClick={() => { window.dispatchEvent(new CustomEvent("openCandidateEdit", { detail: k })); }} class="px-2 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-bold shadow transition cursor-pointer"><Icon name="edit" class="mr-1" /> {t('button.edit')}</button>
                      <button onClick={() => { setAiCvWa(k.wa); }} title={t('admin.btn_cv_ai')} class="px-2 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded text-[11px] font-bold shadow transition cursor-pointer"><Icon name="robot" class="mr-1" /> {t('admin.btn_cv_ai')}</button>
                      <button onClick={() => { window.dispatchEvent(new CustomEvent("openAdminAiCopilot", { detail: { id: k.id, wa: k.wa, nama: k.nama } })); }} title={t('ui.ai_copilot')} class="px-2 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[11px] font-bold shadow transition cursor-pointer"><Icon name="comments" class="mr-1" /> {t('admin.btn_ai_hr')}</button>
                      <button title={t('ui.send_wa_call')} aria-label={t('ui.send_wa_call')} onClick={() => setWaTarget({ nama: k.nama || k.wa || '', job: k.idLoker || '', phone: normalizeWaInput(k.wa || '') })} class="w-8 h-8 flex items-center justify-center bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs shadow transition cursor-pointer"><Icon name="whatsapp" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div class="flex items-center justify-between gap-3 mt-4 pt-3 border-t border-sky-900/50 text-sm">
        <span class="text-slate-300 font-bold text-xs">{filtered.length} {t('admin.of')} {totalAll} {t('admin.candidates')}</span>
        {shown.length < filtered.length && (
          <button onClick={() => nextPage()} class="px-4 py-2 bg-sky-600 text-white rounded-lg text-xs font-bold hover:bg-sky-500 transition shadow-lg"><Icon name="chevron-down" class="mr-1" /> {t('button.more')}</button>
        )}
      </div>

      {/* Modals */}
      <InputManualModal />
      <LaporanBulananModal />
      {waTarget && (
        <WAPintarModal candidateName={waTarget.nama} candidateJob={waTarget.job} phone={waTarget.phone}
          templates={waTemplates} onClose={() => setWaTarget(null)} />
      )}
          {showCvTemplateSelector && <CvTemplateSelector waTarget={rirekWa} isAdmin={true} onClose={() => setShowCvTemplateSelector(false)} onOpenRirekisho={() => { setShowCvTemplateSelector(false); setShowRirek(true); }} />}
            <RirekishoBuilder waTarget={rirekWa} isOpen={showRirek} onClose={()=>setShowRirek(false)} fotoFallback={fotoFallbackFor(rirekWa)} />

      {/* Panel CV AI admin — komponen yang SAMA dengan dashboard kandidat
          (/ai-cv). `adminMode` melewati gate login; backend sudah mengizinkan
          admin membaca & menulis CV kandidat mana pun (isOwnerOrAdmin). */}
      {aiCvWa && (
        <div class="fixed inset-0 z-[150] bg-slate-950">
          <AiCvForm waTarget={aiCvWa} adminMode />
          <button onClick={() => setAiCvWa('')} title={t('button.close')} aria-label={t('button.close')}
            class="fixed top-2 right-3 z-[200] w-9 h-9 flex items-center justify-center rounded-full bg-rose-600 hover:bg-rose-500 text-white shadow-lg transition cursor-pointer">
            <Icon name="times" />
          </button>
        </div>
      )}
</div>
  );
}


