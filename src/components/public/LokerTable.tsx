/**
 * LokerTable.tsx - Public job listing table with status filters
 * Source: legacy/js/render/public.ts renderPublicFiltered()
 * Matches legacy: sorting, limit 10, pamflet, gender badges,
 * Detail/Template/Apply buttons, filter counts, syarat + keterangan
 */
import { useState, useEffect } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import PamfletModal from "./PamfletModal";
import { langStore, t } from '../../store/i18n';
import { themeStore, toggleTheme } from '../../store/theme';
import { jobTutupUntukLamar } from '../../lib/jobPhase';
import {
  jobCategoryLabel,
  jobGenderLabel,
  jobLocationLabel,
  jobTitleLabel,
} from '../../lib/jobDisplay';
import { getPublicData } from '../../lib/publicData';
import { ErrorBoundary } from '../ErrorBoundary';
import LokerDetailModal from './LokerDetailModal';
import Icon from '../ui/Icon';

// NOTE: Shared Job type available at types/api.ts
// This local interface extends it with public-view specific fields
interface Job {
  code: string;
  pekerjaan: string;
  status: string;
  tahapan: string;
  keterangan: string;
  kategori: string;
  kuota: string;
  gender: string;
  lokasi: string;
  syarat: string;
  rincianBiaya?: string;
  totalBiaya?: string;
  pamflet?: string;
  templateCv?: string;
  dokumenShare?: string;
  createdAt?: string;
}

const LIMIT_INITIAL = 10;
// ─── Named Constants ───
const TABLE_MIN_WIDTH = "700px";
const COL_WIDTH = { CODE: "w-24", ACTION: "w-28" } as const;
const COL_MIN_WIDTH = { JOB: "180px", REQ: "140px" } as const;



export default function LokerTable() {
  const _lang = useStore(langStore);
  // Single source of truth — see store/theme.ts. Local state here used to
  // drift out of sync with FormToolbar's copy of the same toggle.
  const isDark = useStore(themeStore) !== "light";
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filter, setFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(LIMIT_INITIAL);
  const [pamfletUrl, setPamfletUrl] = useState("");
  const [showPamflet, setShowPamflet] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [error, setError] = useState("");

  useEffect(() => { fetchJobs(); }, []);

  async function fetchJobs() {
    setError("");
    setLoading(true);
    try {
      const data = await getPublicData();
      if (data.success && data.jobs) setJobs(data.jobs as unknown as Job[]);
      else setError(t("public.load_error"));
    } catch (err) {
      console.error("[LokerTable] fetch error:", err);
      setError(t("public.load_error"));
    } finally {
      setLoading(false);
    }
  }

  const filtered = filter === "ALL"
    ? jobs
    : jobs.filter((j) => (j.status || "").toUpperCase().includes(filter));

  const sorted = [...filtered].sort((a, b) => {
    const aO = (a.status || "").toUpperCase().includes("OPEN") ? 1 : 0;
    const bO = (b.status || "").toUpperCase().includes("OPEN") ? 1 : 0;
    if (aO !== bO) return bO - aO;
    const tA = a.createdAt ? new Date(a.createdAt).getTime() : parseInt((a.code || "").replace(/\D/g, "")) || 0;
    const tB = b.createdAt ? new Date(b.createdAt).getTime() : parseInt((b.code || "").replace(/\D/g, "")) || 0;
    return tB - tA;
  });

  const displayed = sorted.slice(0, limit);

  function getStatusBadge(status: string) {
    const s = (status || "").toUpperCase();
    if (s.includes("OPEN"))
      return <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[10px] font-bold bg-emerald-600 text-white border-emerald-400/60"><Icon name="door-open" /> {t("status.open")}</span>;
    if (s.includes("URGENT"))
      return <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[10px] font-bold bg-red-600 text-white border-red-400/60 animate-pulse"><Icon name="exclamation-triangle" /> {t("status.urgent")}</span>;
    if (s.includes("CLOSE"))
      return <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[10px] font-bold bg-red-600 text-white border-red-400/60"><Icon name="door-closed" /> {t("status.close")}</span>;
    return <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[10px] font-bold bg-slate-800 text-slate-300 border-slate-600"><Icon name="tag" /> {status || "-"}</span>;
  }

  function getGenderBadge(gender: string) {
    const g = (gender || "").toUpperCase();
    // The API packs both options into one cell ("👨 Pria👩 Wanita"), so the
    // label goes through jobDisplay so JP mode reads 男性 / 女性. The raw text
    // is still the fallback for any value we have not catalogued.
    const lbl = jobGenderLabel(gender) || "-";
    if (g.includes("PRIA") || g.includes("LAKI"))
      return <span class="px-2 py-0.5 bg-blue-900/50 text-blue-300 border border-blue-500/50 rounded text-[10px] font-bold shadow-sm whitespace-nowrap"><Icon name="mars" class="mr-1" /> {lbl}</span>;
    if (g.includes("WANITA") || g.includes("PEREMPUAN"))
      return <span class="px-2 py-0.5 bg-pink-900/50 text-pink-300 border border-pink-500/50 rounded text-[10px] font-bold shadow-sm whitespace-nowrap"><Icon name="venus" class="mr-1" /> {lbl}</span>;
    return <span class="px-2 py-0.5 bg-purple-900/50 text-purple-300 border border-purple-500/50 rounded text-[10px] font-bold shadow-sm whitespace-nowrap"><Icon name="venus-mars" class="mr-1" /> {lbl}</span>;
  }  /** Open the native Astro apply wizard (apply.astro) — same route the
   *  detail modal's "Lamar" uses. B04 (2026-09-05): this used to call the
   *  legacy generateFormBridge, whose backend handler still points at the
   *  removed legacy page /apply-full.html → a 404 (or a WA fallback) on
   *  every row apply. Legacy had ONE action (lamarJob) for row and detail;
   *  both now converge on the Astro-native /apply?job= surface.
   */
  function openForm(job: Job) {
    if (jobTutupUntukLamar(job)) return;
    window.location.assign('/apply?job=' + encodeURIComponent(job.code));
  }

  function filterCount(s: string) {
    if (s === "ALL") return jobs.length;
    return jobs.filter(j => (j.status || "").toUpperCase().includes(s)).length;
  }

  const fDefs = [
    { key: "ALL", icon: "fa-th-large", lbl: t("public.all"), cls: "bg-slate-700 hover:bg-slate-600 text-white" },
    { key: "OPEN", icon: "fa-door-open", lbl: t("public.open"), cls: "bg-emerald-600 hover:bg-emerald-500 text-white" },
    { key: "URGENT", icon: "fa-bolt", lbl: t("public.urgent"), cls: "bg-amber-500 hover:bg-amber-400 text-white" },
    { key: "CLOSE", icon: "fa-door-closed", lbl: t("public.close"), cls: "bg-red-600 hover:bg-red-500 text-white" },
  ];

  return (
    <ErrorBoundary>
    <div class="animate-fade-in">
      <div class="flex flex-wrap justify-between items-center p-4 rounded-xl border border-slate-700 shadow-lg mb-6 gap-4 bg-slate-900">
        <div class="flex gap-2 items-center flex-wrap">
          <span class="text-xs font-bold text-slate-300 mr-1 uppercase tracking-widest"><Icon name="paint-brush" /> {t("ui.theme")}</span>
          <button onClick={toggleTheme} class="px-3 py-2 bg-white/10 hover:bg-white/20 text-slate-200 border border-white/25 rounded-full text-xs font-bold transition-colors shadow-lg flex items-center gap-1.5">
            <Icon name={isDark ? "moon" : "sun"} /> {isDark ? "Dark" : "Light"}
          </button>
        </div>
        <div class="flex gap-2 items-center flex-wrap">
          <span class="text-xs font-bold text-slate-300 mr-2 uppercase tracking-widest"><Icon name="filter" /> {t("public.filter")}</span>
           {fDefs.map(fd => {
            const btnCls = "px-4 py-2 rounded-lg text-sm font-bold shadow-md transition " + (filter === fd.key ? fd.cls : "bg-slate-700 hover:bg-slate-600 text-slate-200");
            const cntCls = "px-1.5 py-0.5 rounded-full text-[9px] ml-0.5 font-black " + (filter === fd.key ? "bg-white/30 text-white" : "bg-slate-900 text-slate-200");
            return (
              <button key={fd.key} onClick={() => { setFilter(fd.key); setLimit(LIMIT_INITIAL); }} class={btnCls}>
                <Icon name={fd.icon} class="mr-1" /> {fd.lbl} <span class={cntCls}>{filterCount(fd.key)}</span>
              </button>
            );
          })}
          <span class="text-xs text-slate-500 font-bold ml-2">{displayed.length} / {filtered.length} {t("public.lowongan_count")}</span>
        </div>
      </div>
      <div class="u-scroll-x rounded-xl border border-slate-800 shadow-xl bg-slate-900">
        <table class="w-full min-w-[700px] text-left text-sm whitespace-nowrap">
          <thead class="bg-slate-800 text-slate-200 text-sm uppercase tracking-wider font-bold border-b border-slate-700">
            <tr>
              <th scope="col" class="p-2 text-center w-24">{t("table.code")}</th>
              <th scope="col" class="p-2 max-w-[220px]">{t("table.job")}</th>
              <th scope="col" class="p-1.5 text-center w-24">{t("table.status")}</th>
              <th scope="col" class="p-2">{t("table.req")}</th>
              <th scope="col" class="p-1.5 text-center w-20">{t("table.action")}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-white/5">
            {loading ? (
              <tr><td colSpan={5} class="p-8 text-center text-slate-500"><Icon spin name="spinner" class="mr-2" /> {t("public.loading")}</td></tr>
            ) : error ? (
              <tr><td colSpan={5} class="p-10 text-center text-rose-400 font-bold"><Icon name="exclamation-triangle" class="mr-2" /> {t("public.load_error")} <button onClick={() => fetchJobs()} class="ml-3 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-bold shadow-lg transition"><Icon name="sync-alt" class="mr-1" /> {t("button.retry")}</button></td></tr>
            ) : displayed.length === 0 ? (
              <tr><td colSpan={5} class="p-10 text-center text-slate-500 font-bold">{t("public.empty")}</td></tr>
            ) : displayed.map((job, i) => (
              <tr key={job.code || i} class="rt-row border-b border-slate-800 hover:bg-white/5 transition">
                <td data-label={t("table.code")} class="p-2 font-mono text-xs text-center font-bold align-top text-sky-400">{job.code || "-"}</td>
                <td data-label={t("table.job")} class="rt-full p-2 align-top whitespace-normal max-w-[220px]">
                  <div class="flex items-start gap-4">
                    {job.pamflet && job.pamflet !== "-" && job.pamflet.length > 5 && (
                      <img src={job.pamflet} width={48} height={64} loading="lazy" decoding="async" class="hidden sm:block w-12 h-16 md:w-12 md:h-16 object-cover rounded-lg border border-slate-600 shadow-md cursor-pointer hover:scale-105 transition-transform flex-shrink-0" title={t("ui.click_zoom")} alt={t("ui.alt_pamflet")} onClick={() => { setPamfletUrl(job.pamflet || ""); setShowPamflet(true); }} />
                    )}
                    <div class="flex flex-col pt-1">
                      <span class="font-bold text-base text-white leading-tight">{jobTitleLabel(job.pekerjaan) || "-"}</span>
                      {job.kategori && jobCategoryLabel(job.kategori) && (
                        <span class="text-[10px] text-slate-400 mt-0.5">{jobCategoryLabel(job.kategori)}</span>
                      )}
                      <div class="flex flex-wrap items-center gap-2 mt-2">
                        <span class="text-[11px] text-slate-300"><Icon name="map-marker-alt" class="mr-1 text-red-400" /> {jobLocationLabel(job.lokasi) || "-"}</span>
                        {getGenderBadge(job.gender)}
                      </div>
                    </div>
                  </div>
                </td>
                <td data-label={t("table.status")} class="p-1 text-center align-top text-xs w-24">{getStatusBadge(job.status)}</td>
                <td data-label={t("table.req")} class="rt-full p-2 text-xs text-slate-300 whitespace-normal leading-relaxed align-top">
                  {(job.syarat || "").split(",").map(s => s.trim()).filter(Boolean).join(", ")}
                  {job.keterangan && job.keterangan !== "-" && (
                    <div class="mt-2 pt-2 border-t border-slate-700/50 text-[10px] text-amber-300/90 leading-relaxed"><Icon name="info-circle" class="mr-1" /> {job.keterangan}</div>
                  )}
                </td>
                <td data-label={t("table.action")} class="rt-full p-1 align-top w-20">
                  <div class="flex flex-row gap-1 items-center justify-center">
                    <button onClick={() => setSelectedJob(job)} class="px-2 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg shadow-[0_4px_15px_rgba(245,158,11,0.4)] transition text-[10px] font-black border border-amber-500/50" title={t("button.detail")}><Icon name="eye" /> <span class="hidden sm:inline">{t("button.detail")}</span></button>
                    {job.templateCv && job.templateCv !== "-" && (
                      <a href={job.templateCv} target="_blank" class="inline-flex items-center justify-center px-2 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg shadow-[0_4px_15px_rgba(2,132,199,0.4)] transition text-[10px] font-bold border border-sky-500/50"><Icon name="download" /> <span class="hidden sm:inline">{t("button.format")}</span></a>
                    )}
                    {jobTutupUntukLamar(job) ? (
                      <button disabled class="px-2 py-1.5 bg-slate-600 rounded-lg text-white text-[10px] font-bold opacity-50 cursor-not-allowed shadow-inner border border-slate-500">{t("button.closed")}</button>
                    ) : (
                      <button onClick={() => openForm(job)} class="px-2 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg shadow-[0_4px_15px_rgba(5,150,105,0.4)] transition text-[11px] font-bold border border-emerald-500/50"><Icon name="paper-plane" /> <span class="hidden sm:inline">{t("button.apply")}</span></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length > limit && (
        <div class="p-5 text-center">
          <button onClick={() => setLimit(prev => prev + 10)} class="px-6 py-2.5 bg-slate-800 text-white rounded-full text-xs font-bold shadow-lg hover:bg-slate-700 transition">
            {t("button.more")} <Icon name="chevron-down" class="ml-2" />
          </button>
        </div>
      )}

      {selectedJob && <LokerDetailModal job={selectedJob} onClose={() => setSelectedJob(null)} />}
          <PamfletModal isOpen={showPamflet} url={pamfletUrl} onClose={() => setShowPamflet(false)} />
</div>
    </ErrorBoundary>
  );
}
