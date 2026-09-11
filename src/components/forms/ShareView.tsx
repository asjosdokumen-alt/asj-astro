/**
 * ShareView.tsx — Candidate Viewer for the TSK (share.html)
 * Source: legacy/share.html + js/pages/share.ts (1:1 parity).
 *
 * B06 parity (2026-09-05) fixed ROOT bugs:
 *  1. Data contract: the view read invented fields (id/nama/wa/photo/cvUrl/
 *     jftUrl/…) but the backend returns id_kandidat/nama_lengkap/no_wa/
 *     pas_photo/file_cv/jft/ssw/nilai_jft_text/bidang_ssw_text/extraDocs and
 *     job {code,name,tsk} — every card rendered with undefined name/gender,
 *     no document buttons, and a wa.me/<undefined> link. Now adapted exactly
 *     like legacy renderGrid + the backend response shape.
 *  2. Token gate: legacy opened by ?job alone; the viewer now requires
 *     ?job=CODE&tk=<per-job token> (docs/PARITY_CHECKLIST.md B06) and the
 *     token is forwarded to the GET endpoint.
 *  3. Card parity with legacy renderGrid: photo (click → zoom preview, fallback
 *     avatar), gender/age/tb/bb chips, JFT (nilai_jft_text) & SSW
 *     (bidang_ssw_text) chips, CV/JFT/SSW buttons + one button per extra
 *     folder doc (shareDocTypeOf/shareExtraDocLabel), whole-card selection
 *     (overlay button, aria-pressed), corner check.
 *  4. Filters use legacy semantics: gender = female only when the text
 *     contains PEREMPUAN, age bands treat unknown age 0 as NOT <20, JFT
 *     matches A2/N4 or B1/N3 text.
 *  5. "Kirim Pilihan" builds the legacy WA message (greet + job code/name,
 *     numbered selected names with ID) and opens wa.me/6287889502004 — the
 *     old code had no number and a throwaway message.
 *  6. Chrome copy lives in the shared dicts (share.*) — the old component
 *     kept an inline id/jp map that never synced with the portal; language
 *     now follows langStore (localStorage asj_lang, same key as legacy).
 */
import { useEffect, useState } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import { langStore } from '../../store/i18n';
import { t } from '../../store/i18n';
import { shareDocTypeOf, shareExtraDocLabel } from '../../lib/shareDocs';
import DocumentPreviewModal from '../DocumentPreviewModal';
import Icon from '../ui/Icon';

interface ShareCandidate {
  id_kandidat: string;
  no_wa: string;
  nama_lengkap: string;
  gender: string;
  usia: number | string;
  tb: number | string;
  bb: number | string;
  pas_photo: string;
  file_cv: string;
  jft: string;
  ssw: string;
  nilai_jft_text: string;
  bidang_ssw_text: string;
  extraDocs?: { name: string; url: string }[];
}

interface JobInfo { code: string; name: string; tsk: string; }

interface DocButton { type: string; label: string; url: string; }

const ADMIN_WA = '6287889502004';

/** Deterministic initials avatar (legacy ui-avatars parity). */
function avatarFor(nama: string): string {
  return 'https://ui-avatars.com/api/?name=' + encodeURIComponent(nama) + '&background=0D8ABC&color=fff';
}

const MAIN_TYPES = new Set(['CV', 'JFT', 'SSW', 'FOTO']);

/** Main CV/JFT/SSW + extra-doc buttons for a candidate (legacy card order). */
function docButtonsFor(c: ShareCandidate): DocButton[] {
  const out: DocButton[] = [];
  const pushMain = (url: string, type: string) => {
    const u = String(url || '').trim();
    if (u && u !== '-') out.push({ type, label: type, url: u });
  };
  pushMain(c.file_cv, 'CV');
  pushMain(c.jft, 'JFT');
  pushMain(c.ssw, 'SSW');
  const seen = new Set<string>();
  for (const d of c.extraDocs || []) {
    const type = shareDocTypeOf(d.name);
    if (MAIN_TYPES.has(type)) continue; // main buttons above
    if (seen.has(type)) continue; // 1 type = 1 button
    seen.add(type);
    out.push({ type, label: shareExtraDocLabel(d.name), url: d.url });
  }
  return out;
}

function GenderIcon({ gender }: { gender: string }) {
  const p = String(gender || '').toUpperCase().includes('PEREMPUAN');
  return p
    ? <span class="text-pink-400"><Icon name="venus" /></span>
    : <span class="text-sky-400"><Icon name="mars" /></span>;
}

function genderLabel(gender: string): string {
  const g = String(gender || '');
  if (g.toUpperCase().includes('PEREMPUAN')) return t('share.gender_f');
  return g ? t('share.gender_m') : '-';
}

export default function ShareView() {
  const lang = useStore(langStore);
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const code = (params?.get('job') || '').trim();
  const tk = (params?.get('tk') || '').trim();

  const [candidates, setCandidates] = useState<ShareCandidate[]>([]);
  const [job, setJob] = useState<JobInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterGender, setFilterGender] = useState('all');
  const [filterAge, setFilterAge] = useState('all');
  const [filterJft, setFilterJft] = useState('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<{ url: string; title: string } | null>(null);

  useEffect(() => {
    let alive = true;
    if (!code) { setError(t('share.err_msg')); setLoading(false); return; }
    setLoading(true);
    setError('');
    fetch('/.netlify/functions/share-data?job=' + encodeURIComponent(code) + (tk ? '&tk=' + encodeURIComponent(tk) : ''))
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || 'Access Denied');
        if (!alive) return;
        setJob(data.job || null);
        setCandidates(data.candidates || []);
        setSelected(new Set());
      })
      .catch((e: Error) => { if (alive) setError(e.message || t('share.err_msg')); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [code, tk]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /** Legacy submitSelection — WA message to the admin number. */
  const submitSelection = () => {
    if (!job || selected.size === 0) return;
    let msg = t('share.wa_greet') + ' *' + job.code + ' - ' + (job.name || '') + '*:\n\n';
    let i = 1;
    for (const id of selected) {
      const c = candidates.find((x) => String(x.id_kandidat) === id);
      if (c) msg += i + '. ' + (c.nama_lengkap || 'Candidate') + ' (ID: ' + c.id_kandidat + ')\n';
      i++;
    }
    msg += '\n' + t('share.wa_closing');
    window.open('https://wa.me/' + ADMIN_WA + '?text=' + encodeURIComponent(msg), '_blank');
  };

  const openPreview = (url: string, title: string) => setPreview({ url, title });
  const closePreview = () => setPreview(null);

  const filtered = candidates.filter((c) => {
    const g = String(c.gender || '').toUpperCase().includes('PEREMPUAN') ? 'p' : 'l';
    if (filterGender !== 'all' && g !== filterGender) return false;
    const usia = parseInt(String(c.usia), 10) || 0;
    if (filterAge === 'under20' && (usia === 0 || usia >= 20)) return false;
    if (filterAge === '20to25' && (usia < 20 || usia > 25)) return false;
    if (filterAge === 'over25' && usia <= 25) return false;
    const jftText = String(c.nilai_jft_text || '').toUpperCase();
    if (filterJft === 'a2' && !jftText.includes('A2') && !jftText.includes('N4')) return false;
    if (filterJft === 'b1' && !jftText.includes('B1') && !jftText.includes('N3')) return false;
    return true;
  });

  // Re-render text on language change is automatic via useStore(langStore).
  void lang;

  return (
    <div class="min-h-screen bg-slate-950 pt-[42px] overflow-x-hidden text-slate-100 relative selection:bg-pink-500/30">
      {/* Ambient BG */}
      <div class="fixed inset-0 u-modal-shell pointer-events-none z-0 overflow-hidden">
        <div class="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-pink-600/20 rounded-full blur-[120px]"></div>
        <div class="absolute bottom-[-10%] right-[-5%] w-[600px] h-[600px] bg-rose-600/10 rounded-full blur-[130px]"></div>
      </div>

      {/* Header */}
      <header class="sticky top-0 z-50 bg-slate-900/[.97] border-b border-slate-700/50 shadow-2xl">
        <div class="max-w-7xl mx-auto px-3 md:px-8 py-3 md:py-4 flex flex-wrap md:flex-nowrap justify-between items-center gap-2 md:gap-4">
          <div class="flex items-center gap-3 md:gap-4 min-w-0">
            <img src="https://gdwvffmevwtwnzrapjwy.supabase.co/storage/v1/object/public/asj-files/assets/logo_asj.png" alt="ASJ Logo" class="w-10 h-10 md:w-14 md:h-14 object-contain" />
            <div class="min-w-0">
              <h1 class="text-sm sm:text-lg md:text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-200 to-white leading-tight truncate">PT AMANAH SAKURA JAPAN</h1>
              <p class="text-[9px] md:text-xs font-bold text-pink-300 tracking-[0.2em] uppercase mt-0.5">
                <Icon name="lock" class="mr-1 text-[8px] opacity-70" /> {t('share.secure_title')}
              </p>
            </div>
          </div>
          <div class="flex items-center gap-2 md:gap-3 w-full md:w-auto justify-between md:justify-end mt-2 md:mt-0">
            <button
              onClick={() => langStore.set(langStore.get() === 'id' ? 'jp' : 'id')}
              class="px-2.5 py-1.5 md:px-3 bg-slate-800/80 border border-slate-600/50 rounded-lg text-[11px] md:text-xs font-bold flex items-center gap-1.5 shrink-0"
            >
              <Icon name="language" class="text-pink-400" />
              <span class={langStore.get() === 'id' ? 'text-pink-400 font-black' : 'text-slate-500'}>ID</span>
              <span class="text-slate-500">|</span>
              <span class={langStore.get() === 'jp' ? 'text-pink-400 font-black' : 'text-slate-500'}>JP</span>
            </button>
            {job && (
              <div class="text-right flex flex-col items-end">
                <div class="inline-flex items-center gap-2 px-2.5 py-1 bg-slate-800/80 border border-slate-600/50 rounded-full mb-1">
                  <span class="relative flex h-1.5 w-1.5"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span class="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span></span>
                  <span class="text-[8px] md:text-[9px] font-bold text-slate-300 tracking-widest uppercase">{job.code}</span>
                </div>
                <h2 class="text-[11px] sm:text-sm md:text-base font-bold text-white uppercase tracking-wide truncate max-w-full">{job.name}</h2>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main */}
      <main class="max-w-7xl mx-auto px-4 md:px-8 py-10 relative z-10">
        {/* Loading */}
        {loading && (
          <div class="u-grid-auto u-grid-auto--panels gap-4 md:gap-6 animate-[fadeIn_0.8s_ease-out]">
            {[1, 2, 3].map((i) => (
              <div key={i} class="bg-slate-900/[.97] border border-slate-700/50 rounded-2xl p-4 md:p-5">
                <div class="flex gap-3 md:gap-4">
                  <div class="w-[72px] h-[96px] md:w-[84px] md:h-[112px] bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800 bg-[length:200%_100%] animate-[loading_1.5s_infinite] rounded-lg"></div>
                  <div class="flex-1 space-y-3 py-1">
                    <div class="h-4 bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800 bg-[length:200%_100%] animate-[loading_1.5s_infinite] rounded w-3/4"></div>
                    <div class="h-3 bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800 bg-[length:200%_100%] animate-[loading_1.5s_infinite] rounded w-1/2"></div>
                    <div class="h-8 bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800 bg-[length:200%_100%] animate-[loading_1.5s_infinite] rounded w-full mt-4"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div class="text-center py-20 animate-[fadeIn_0.8s_ease-out]">
            <div class="w-24 h-24 bg-rose-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-rose-500/20">
              <Icon name="exclamation-triangle" class="text-4xl text-rose-500" />
            </div>
            <h2 class="text-xl font-bold text-white mb-2">{t('share.err_title')}</h2>
            <p class="text-slate-400 text-sm">{error}</p>
          </div>
        )}

        {/* Filters */}
        {!loading && !error && candidates.length > 0 && (
          <div class="mb-6 flex flex-wrap items-center gap-2 md:gap-3 p-3 md:p-4 bg-slate-900/[.97] rounded-xl border border-slate-700/50 animate-[fadeIn_0.8s_ease-out] shadow-lg">
            <div class="flex items-center gap-2 mr-1"><Icon name="filter" class="text-pink-400" /><span class="text-xs md:text-sm font-bold text-slate-200">{t('share.filter')}</span></div>
            <select value={filterGender} onChange={(e) => setFilterGender((e.target as HTMLSelectElement).value)}
              class="flex-1 sm:flex-none min-w-[120px] bg-slate-800/80 border border-slate-600 text-slate-200 text-[11px] md:text-xs font-bold rounded-lg px-2 md:px-3 py-2 focus:outline-none focus:border-pink-500 cursor-pointer">
              <option value="all">{t('share.gen_all')}</option>
              <option value="l">{t('share.gen_l')}</option>
              <option value="p">{t('share.gen_p')}</option>
            </select>
            <select value={filterAge} onChange={(e) => setFilterAge((e.target as HTMLSelectElement).value)}
              class="flex-1 sm:flex-none min-w-[100px] bg-slate-800/80 border border-slate-600 text-slate-200 text-[11px] md:text-xs font-bold rounded-lg px-2 md:px-3 py-2 focus:outline-none focus:border-pink-500 cursor-pointer">
              <option value="all">{t('share.age_all')}</option>
              <option value="under20">&lt; 20</option>
              <option value="20to25">20 - 25</option>
              <option value="over25">&gt; 25</option>
            </select>
            <select value={filterJft} onChange={(e) => setFilterJft((e.target as HTMLSelectElement).value)}
              class="flex-1 sm:flex-none min-w-[130px] bg-slate-800/80 border border-slate-600 text-slate-200 text-[11px] md:text-xs font-bold rounded-lg px-2 md:px-3 py-2 focus:outline-none focus:border-pink-500 cursor-pointer">
              <option value="all">{t('share.jft_all')}</option>
              <option value="a2">A2 / N4</option>
              <option value="b1">B1 / N3</option>
            </select>
          </div>
        )}

        {/* Candidates Grid */}
        {!loading && !error && candidates.length > 0 && (
          <div class="u-grid-auto u-grid-auto--panels gap-4 md:gap-6 animate-[fadeIn_0.8s_ease-out] pb-16">
            {filtered.map((c) => {
              const isSel = selected.has(c.id_kandidat);
              const nama = c.nama_lengkap || 'Candidate';
              const photo = c.pas_photo && c.pas_photo !== '-' ? c.pas_photo : avatarFor(nama);
              const buttons = docButtonsFor(c);
              const gText = String(c.gender || '');
              const isP = gText.toUpperCase().includes('PEREMPUAN');
              const usia = parseInt(String(c.usia), 10) || 0;
              return (
                <div key={c.id_kandidat}
                  class={`bg-slate-900/[.97] border rounded-2xl p-4 md:p-5 t-elevate hover:shadow-pink-500/10 relative group cursor-pointer flex flex-col ${isSel ? 'border-pink-400 shadow-[0_0_15px_rgba(244,114,182,0.3)]' : 'border-slate-700/50 hover:border-pink-500/50'}`}>
                  <button
                    type="button"
                    aria-pressed={isSel}
                    aria-label={`${t('share.select')} ${nama} — ${c.id_kandidat}`}
                    onClick={() => toggleSelect(c.id_kandidat)}
                    class="absolute inset-0 z-10 w-full h-full cursor-pointer bg-transparent border-0 rounded-2xl"
                  />
                  <div class={`absolute top-3 right-3 w-5 h-5 md:w-6 md:h-6 rounded-full border-2 flex items-center justify-center z-10 shadow-lg pointer-events-none transition-colors ${isSel ? 'bg-pink-500 text-white border-pink-500' : 'bg-slate-800/50 border-slate-600 text-transparent'}`}>
                    <Icon name="check" class="text-[10px] md:text-xs" />
                  </div>

                  <div class="flex gap-3 md:gap-4 mb-3 md:mb-4 relative">
                    <div class="w-[72px] h-[96px] md:w-[84px] md:h-[112px] shrink-0 rounded-xl overflow-hidden bg-slate-800 border ${isSel ? 'border-pink-400' : 'border-slate-600'} shadow-inner relative z-20 group/photo cursor-pointer" title={t('ui.click_zoom')}
                      onClick={(e) => { e.stopPropagation(); openPreview(photo, 'Foto - ' + nama); }}>
                      <img src={photo} loading="lazy" decoding="async" alt={nama} class="w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).onerror = null; (e.target as HTMLImageElement).src = avatarFor(nama); }} />
                      {photo.includes('ui-avatars') ? null : (
                        <div class="absolute inset-0 bg-black/60 opacity-0 group-hover/photo:opacity-100 transition-opacity flex items-center justify-center text-white"><Icon name="camera" class="text-lg drop-shadow-md" /></div>
                      )}
                    </div>
                    <div class="flex-1 flex flex-col justify-center min-w-0">
                      <h3 class="text-xs md:text-sm font-bold text-white mb-2 line-clamp-2 leading-tight pr-4">{nama}</h3>
                      <div class="grid grid-cols-2 gap-y-1.5 gap-x-2 text-[10px] md:text-[11px] text-slate-300 mb-2 w-full mt-1">
                        <div class="flex items-center gap-1.5 whitespace-nowrap overflow-hidden text-ellipsis bg-slate-800/50 rounded-md px-1.5 py-0.5 border border-slate-700/50">
                          <span class="w-3 text-center"><GenderIcon gender={gText} /></span>
                          <span class="font-medium">{genderLabel(gText)}</span>
                        </div>
                        <div class="flex items-center gap-1.5 whitespace-nowrap overflow-hidden text-ellipsis bg-slate-800/50 rounded-md px-1.5 py-0.5 border border-slate-700/50">
                          <Icon name="ruler-vertical" class="text-emerald-400 opacity-80 w-3 text-center" />
                          <span class="font-medium">{c.tb && c.tb !== '-' ? c.tb + ' cm' : '-'}</span>
                        </div>
                        <div class="flex items-center gap-1.5 whitespace-nowrap overflow-hidden text-ellipsis bg-slate-800/50 rounded-md px-1.5 py-0.5 border border-slate-700/50">
                          <Icon name="id-card" class="text-amber-400 opacity-80 w-3 text-center" />
                          <span class="font-medium">{c.bb && c.bb !== '-' ? c.bb + ' kg' : '-'}</span>
                        </div>
                        <div class="flex items-center gap-1.5 whitespace-nowrap overflow-hidden text-ellipsis bg-slate-800/50 rounded-md px-1.5 py-0.5 border border-slate-700/50">
                          <Icon name="user" class="text-pink-300 opacity-80 w-3 text-center" />
                          <span class="font-medium">{usia ? usia + ' ' + t('share.age_yr') : '-'}</span>
                        </div>
                      </div>
                      <div class="flex flex-wrap gap-1.5 mt-auto pt-1">
                        {c.nilai_jft_text && c.nilai_jft_text !== '-' && (
                          <span class="px-2 py-0.5 bg-purple-900/40 text-purple-300 text-[9px] font-bold rounded-md border border-purple-700/50"><Icon name="language" class="mr-1" />{c.nilai_jft_text}</span>
                        )}
                        {c.bidang_ssw_text && c.bidang_ssw_text !== '-' && (
                          <span class="px-2 py-0.5 bg-emerald-900/40 text-emerald-300 text-[9px] font-bold rounded-md border border-emerald-700/50"><Icon name="briefcase" class="mr-1" />{c.bidang_ssw_text}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div class="flex flex-wrap gap-2 w-full relative z-20 mt-auto" onClick={(e) => e.stopPropagation()}>
                    {buttons.map((b, i) => {
                      const main = b.type === 'CV' || b.type === 'JFT' || b.type === 'SSW';
                      const accent = b.type === 'CV'
                        ? 'bg-pink-600/20 hover:bg-pink-600 border-pink-500/50 text-pink-300 hover:text-white'
                        : b.type === 'JFT'
                          ? 'bg-purple-600/20 hover:bg-purple-600 border-purple-500/50 text-purple-400 hover:text-white'
                          : b.type === 'SSW'
                            ? 'bg-emerald-600/20 hover:bg-emerald-600 border-emerald-500/50 text-emerald-400 hover:text-white'
                            : 'bg-amber-600/20 hover:bg-amber-600 border-amber-500/50 text-amber-400 hover:text-white';
                      return (
                        <button key={i} onClick={() => openPreview(b.url, b.label + ' - ' + nama)}
                          class={`flex-1 py-2 md:py-2.5 rounded-lg font-bold text-center transition flex flex-col items-center justify-center gap-1 w-full border text-[10px] md:text-xs ${accent}`}>
                          <Icon name={main ? (b.type === 'CV' ? 'file-pdf' : b.type === 'JFT' ? 'file-pdf' : 'file-alt') : 'file-alt'} class="text-xs md:text-sm opacity-80" />
                          {b.label}
                        </button>
                      );
                    })}
                    {buttons.length === 0 && (
                      <div class="w-full text-center text-[10px] text-slate-600 font-bold py-1">-</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && candidates.length === 0 && (
          <div class="text-center py-20 animate-[fadeIn_0.8s_ease-out]">
            <div class="w-24 h-24 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6 border border-slate-700">
              <Icon name="folder-open" class="text-4xl text-slate-500" />
            </div>
            <h2 class="text-xl font-bold text-white mb-2">{t('share.empty_title')}</h2>
            <p class="text-slate-400 text-sm">{t('share.empty_msg')}</p>
          </div>
        )}
      </main>

      {/* Selection Bar */}
      {selected.size > 0 && (
        <div class="fixed bottom-0 left-0 right-0 p-4 md:p-6 z-[90] flex justify-center">
          <div class="bg-slate-900/95 border-t border-x border-pink-500/50 rounded-t-2xl px-6 py-4 flex items-center justify-between gap-4 md:gap-8 shadow-[0_-10px_30px_rgba(0,0,0,0.5)] min-w-[320px] max-w-2xl w-full">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 md:w-12 md:h-12 bg-pink-500/20 rounded-full flex items-center justify-center text-pink-400 border border-pink-500/30">
                <Icon name="check-double" class="md:text-lg" />
              </div>
              <div class="flex items-end gap-2">
                <span class="text-xl md:text-2xl font-black text-white leading-none">{selected.size}</span>
                <span class="text-[10px] md:text-xs font-bold text-pink-300 uppercase tracking-wider mb-0.5">{t('share.sel_count')}</span>
              </div>
            </div>
            <button onClick={submitSelection} class="px-5 py-2.5 md:px-6 md:py-3 bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white font-bold text-xs md:text-sm rounded-xl shadow-lg hover:shadow-pink-500/25 transition-shadow flex items-center gap-2">
              <Icon name="whatsapp" class="text-lg" /> {t('share.sel_btn')}
            </button>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {preview && (
        <DocumentPreviewModal
          url={preview.url}
          title={preview.title}
          onClose={closePreview}
          previewOnly={false}
        />
      )}
    </div>
  );
}
