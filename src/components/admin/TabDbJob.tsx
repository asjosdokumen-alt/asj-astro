/**
 * TabDbJob.tsx — Admin DB Job Internal tab
 * Source: legacy/index.html page-admin → admin-dbjob
 */
import { useState, useEffect, useMemo } from 'preact/hooks';
import api from '../../lib/apiClient';
import { t } from '../../store/i18n';
import { showToast } from '../Toast';
import AdminJobEditModal from './AdminJobEditModal';
import AdminShareModal from './AdminShareModal';
import MatchmakingModal from './MatchmakingModal';
import ListKandidatModal from './ListKandidatModal';
import { useStore } from '@nanostores/preact';
import { allKandidatList, fetchAllKandidat } from '../../store/adminStore';
import Icon from '../ui/Icon';

interface DbJob {
  code: string; tsk: string; pekerjaan: string; kategori: string;
  lokasi: string; tahapan: string; statusInt: string; createdAt: string;
  gender?: string;
  kuota?: string;
  dokumenShare?: string;
}

export type { DbJob };

export type DbFilter = { search: string; bidang: string; tahapan: string };
export type DbSort = 'TERBARU' | 'TERLAMA' | 'TERBANYAK';

/**
 * A18 parity (legacy js/admin_modal/dbfilter.ts + render/admin.ts
 * filterDbJob): candidate count per job code — legacy keys ALL_CANDIDATES by
 * c.idLoker; multi-job idLoker (koma) dihitung untuk setiap kodenya.
 */
export function buildCandidateCountMap(
  cands: Array<{ idLoker?: string }>,
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const c of cands || []) {
    String(c.idLoker || '')
      .split(/[,;]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((code) => { map[code] = (map[code] || 0) + 1; });
  }
  return map;
}

/** Filter — parity filterDbJob: search pada code/tsk/pekerjaan/lokasi (lower), bidang/tahapan eksak. */
export function filterDbJobs(jobs: DbJob[], f: DbFilter): DbJob[] {
  const q = (f.search || '').toLowerCase();
  return jobs.filter((j) => {
    const ms =
      !q ||
      [j.code, j.tsk, j.pekerjaan, j.lokasi].some((x) =>
        (x || '').toLowerCase().includes(q),
      );
    return (
      ms &&
      (f.bidang === 'ALL' || j.kategori === f.bidang) &&
      (f.tahapan === 'ALL' || j.tahapan === f.tahapan)
    );
  });
}

/** Sort — parity filterDbJob (render/admin.ts): TERBANYAK = jumlah kandidat DESC;
 * TERBARU/TERLAMA = createdAt DESC/ASC dengan tie-break code (localeCompare). */
export function sortDbJobs(
  jobs: DbJob[],
  sortType: DbSort,
  countMap: Record<string, number>,
): DbJob[] {
  return jobs.slice().sort((a, b) => {
    if (sortType === 'TERBANYAK') {
      return (countMap[b.code] || 0) - (countMap[a.code] || 0);
    }
    const tA = new Date(a.createdAt || 0).getTime();
    const tB = new Date(b.createdAt || 0).getTime();
    if (tA === tB || Number.isNaN(tA) || Number.isNaN(tB)) {
      return sortType === 'TERLAMA'
        ? a.code.localeCompare(b.code)
        : b.code.localeCompare(a.code);
    }
    return sortType === 'TERLAMA' ? tA - tB : tB - tA;
  });
}

const STATUS_BADGE: Record<string, string> = {
  OPEN: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
  URGENT: 'bg-red-500/20 text-purple-400 border-red-500/40',
  CLOSE: 'bg-slate-500/20 text-slate-400 border-slate-500/40',
};

export default function TabDbJob() {
  const [jobs, setJobs] = useState<DbJob[]>([]);
  const [sortType, setSortType] = useState('TERBARU');
  const [fBidang, setFBidang] = useState('ALL');
  const [fTahapan, setFTahapan] = useState('ALL');
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  // Opsi chip filter dari dropdown config (getAppData admin → dropdowns) —
  // parity renderDbFilters legacy (DROPDOWNS.kategori / DROPDOWNS.tahapan).
  const [fBidangOpts, setFBidangOpts] = useState<string[]>([]);
  const [fTahapanOpts, setFTahapanOpts] = useState<string[]>([]);
  const [editJob, setEditJob] = useState<DbJob | null>(null);
  const [shareJob, setShareJob] = useState<DbJob | null>(null);
  const [matchJob, setMatchJob] = useState<DbJob | null>(null);
  const [listJobCode, setListJobCode] = useState<string | null>(null);
  const allCandidates = useStore(allKandidatList);

  useEffect(() => { fetchLoker(); }, []);
  // Muat SEMUA kandidat (loop halaman) — count cell + ListKandidatModal +
  // MatchmakingModal butuh set penuh, bukan hanya halaman pertama (P10).
  useEffect(() => { fetchAllKandidat(); }, []);

  async function fetchLoker() {
    try {
      const d: any = await api.secure('getAppData', ['admin']);
      if (d && d.success) {
        setJobs(d.dbJobs || d.jobs || []);
        const drop: Record<string, string[]> = d.dropdowns || {};
        if (Array.isArray(drop.kategori)) setFBidangOpts(drop.kategori);
        if (Array.isArray(drop.tahapan)) setFTahapanOpts(drop.tahapan);
      }
    } catch (err) {
      console.error('[TabDbJob] Failed:', err);
    } finally {
      setLoading(false);
    }
  }

  // A18: jumlah kandidat per job — satu sumber untuk sort TERBANYAK & sel count.
  const countMap = useMemo(
    () => buildCandidateCountMap(allCandidates as Array<{ idLoker?: string }>),
    [allCandidates],
  );
  const filtered = useMemo(
    () =>
      sortDbJobs(
        filterDbJobs(jobs, { search, bidang: fBidang, tahapan: fTahapan }),
        sortType as DbSort,
        countMap,
      ),
    [jobs, search, fBidang, fTahapan, sortType, countMap],
  );
  const catOptions = useMemo(
    () => [...new Set([...fBidangOpts, ...jobs.map((j) => j.kategori).filter(Boolean)])],
    [fBidangOpts, jobs],
  );
  const tahapOptions = useMemo(
    () => [...new Set([...fTahapanOpts, ...jobs.map((j) => j.tahapan).filter(Boolean)])],
    [fTahapanOpts, jobs],
  );

  function badgeColor(t: string) {
    const u = (t || '-').toUpperCase();
    if (/OPEN/.test(u)) return 'bg-emerald-600 text-white border-emerald-400/60';
    if (/URGENT/.test(u)) return 'bg-red-600 text-white border-red-400/60 animate-pulse';
    if (/CLOSE/.test(u)) return 'bg-red-600 text-white border-red-400/60';
    return 'bg-slate-800 text-slate-300 border-slate-600';
  }

  return (
    <div>
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-purple-400 font-bold text-lg"><Icon name="server" class="mr-2" /> {t('admin.history_internal')}</h2>
        <div class="relative w-72">
          <Icon name="search" class="absolute left-3 top-2.5 text-slate-300 text-sm" />
          <input
            type="text"
            value={search}
            onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
            placeholder={t("db.placeholder_search")}
            class="min-h-11 w-full pl-9 p-2 rounded-lg bg-black/40 border border-slate-700 text-sm text-white outline-none focus:border-purple-500 transition"
          />
        </div>
      </div>

      <div class="flex flex-col gap-3 mb-5 bg-black/30 p-4 rounded-lg border border-purple-900/30 text-sm">
        <div class="flex items-center gap-2 u-scroll-x whitespace-nowrap pb-1">
          <span class="text-xs font-bold text-slate-300 mr-2 uppercase tracking-widest"><Icon name="sort-amount-down" class="mr-1" /> {t('admin.sort')}</span>
          {[
            {id: 'TERBARU', l: t('admin.sort_newest')},
            {id: 'TERLAMA', l: t('admin.sort_oldest')},
            {id: 'TERBANYAK', l: t('admin.sort_most')},
          ].map(o => (
            <button key={o.id} onClick={() => setSortType(o.id)}
              class={'px-4 py-1.5 rounded-full font-bold transition ' + (sortType === o.id ? 'bg-purple-600 text-white shadow-lg' : 'bg-slate-700 text-slate-300 hover:bg-slate-600')}>
              {o.l}
            </button>
          ))}
        </div>
        {/* Chip filter bidang (kategori) — parity filter-bidang-container */}
        {catOptions.length > 0 && (
          <div class="flex items-center gap-2 u-scroll-x whitespace-nowrap pb-1 custom-scrollbar">
            <button onClick={() => setFBidang('ALL')}
              class={'px-3 py-1 rounded-full font-bold transition text-xs ' + (fBidang === 'ALL' ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700')}>
              {t('public.all')}
            </button>
            {catOptions.map((kat) => (
              <button key={kat} onClick={() => setFBidang(kat)}
                class={'px-3 py-1 rounded-full font-bold transition text-xs ' + (fBidang === kat ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700')}>
                {kat}
              </button>
            ))}
          </div>
        )}
        {/* Chip filter tahapan — parity filter-tahapan-container */}
        {tahapOptions.length > 0 && (
          <div class="flex items-center gap-2 u-scroll-x whitespace-nowrap pb-1 custom-scrollbar">
            <button onClick={() => setFTahapan('ALL')}
              class={'px-3 py-1 rounded-full font-bold transition text-xs ' + (fTahapan === 'ALL' ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700')}>
              {t('public.all')}
            </button>
            {tahapOptions.map((thp) => (
              <button key={thp} onClick={() => setFTahapan(thp)}
                class={'px-3 py-1 rounded-full font-bold transition text-xs ' + (fTahapan === thp ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700')}>
                {thp}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div class="text-center py-8"><Icon spin name="spinner" class="text-2xl text-purple-400" /><p class="text-slate-500 mt-2 text-sm">{t('ui.loading')}</p></div>
      ) : (
        <div class="u-scroll-x rounded-xl border border-slate-800">
          <table class="w-full min-w-[900px] text-sm text-left whitespace-nowrap">
            <thead class="bg-slate-800 text-slate-300 text-[13px] font-semibold border-b border-slate-700">
              <tr>
                <th scope="col" class="p-4">{t('table.code')}</th>
                <th scope="col" class="p-4">{t('table.tsk')}</th>
                <th scope="col" class="p-4">{t('table.field_location')}</th>
                <th scope="col" class="p-4 text-center">{t('table.candidate_count')}</th>
                <th scope="col" class="p-4 text-center">{t('table.stage_status')}</th>
                <th scope="col" class="p-4 text-center">{t('table.action_db')}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800">
              {filtered.length === 0 ? (
                <tr><td colSpan={6} class="p-6 text-center text-slate-500">{t('db.empty')}</td></tr>
              ) : filtered.slice(0, limit).map(db => (
                <tr key={db.code} class="border-b border-slate-800 hover:bg-white/5">
                  <td class="p-4 font-mono text-purple-300 font-bold">{db.code}</td>
                  <td class="p-4">{db.tsk || '-'}</td>
                  <td class="p-4">
                    <div class="font-bold text-white text-[13px]">{db.pekerjaan || '-'}</div>
                    <div class="text-[11px] text-slate-400 font-bold mt-1.5">
                      <span class="text-sky-400"><Icon name="tag" class="mr-1" />{db.kategori || '-'}</span>
                      <span class="mx-1.5">&bull;</span>
                      <span class="text-amber-300"><Icon name="map-marker-alt" class="text-red-400 mr-1" />{db.lokasi || '-'}</span>
                    </div>
                  </td>
                  <td class="p-4 text-center cursor-pointer group" onClick={() => setListJobCode(db.code)}>
                    <div class="inline-block px-4 py-1.5 bg-sky-900/30 group-hover:bg-sky-600 rounded-lg transition-colors">
                      <span class="text-sky-400 group-hover:text-white font-bold text-lg">{countMap[db.code] || 0}</span>
                    </div>
                  </td>
                  <td class="p-4 text-center"><span class={'inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-bold ' + badgeColor(db.tahapan)}><Icon name="chevron-circle-right" /> {db.tahapan || '-'}</span></td>
                  <td class="p-4 text-center">
                    <button onClick={() => setEditJob(db)} class="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded font-bold shadow text-[11px] cursor-pointer"><Icon name="edit" /> Edit</button>
                    <button onClick={() => setShareJob(db)} class="min-h-11 inline-flex items-center ml-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-bold shadow text-[11px] cursor-pointer"><Icon name="share-alt" /> Share</button>
                    <button onClick={() => setMatchJob(db)} class="ml-2 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded font-bold shadow text-[11px] cursor-pointer"><Icon name="search" /> {t('admin.btn_match')}</button>
                    <button onClick={async () => { try { const d: any = await api.secure('downloadJobDocs', [db.code]); if(d && d.zipBase64){const b=atob(d.zipBase64);const u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);const bl=new Blob([u],{type:"application/zip"});const url=URL.createObjectURL(bl);const a=document.createElement("a");a.href=url;a.download=d.fileName||"Docs_"+db.code+".zip";a.click();URL.revokeObjectURL(url);} else {showToast(t('ui.toast_error_prefix')+(d?.error||''),"error");} } catch(e: unknown) {showToast(t('alert.network')+(e instanceof Error ? e.message : String(e)),"error");} }} class="ml-2 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded font-bold shadow text-[11px] cursor-pointer"><Icon name="download" /> Docs</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editJob && <AdminJobEditModal job={editJob as any} onClose={() => setEditJob(null)} onSave={() => fetchLoker()} />}
      {shareJob && <AdminShareModal job={shareJob} onClose={() => setShareJob(null)} />}
      {listJobCode && <ListKandidatModal jobCode={listJobCode} isOpen={!!listJobCode} onClose={() => setListJobCode(null)} />}
      {matchJob && <MatchmakingModal job={matchJob} candidates={allCandidates} isOpen={!!matchJob} onClose={() => setMatchJob(null)} />}
      <p class="text-xs text-slate-500 mt-3">{filtered.length} job internal</p>
    </div>
  );
}
