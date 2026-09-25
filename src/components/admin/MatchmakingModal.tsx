/**
 * MatchmakingModal.tsx — AI Headhunter (Match) admin modal
 * Port of legacy partials/modals-shared.html #modal-matchmaking +
 * js/12_esign_match.ts (bukaMatchmaking / jalankanMatchmaking /
 * kirimTawaranMassal).
 *
 * A14 parity crosscheck (2026-09-05) against legacy ground truth fixed root
 * bugs:
 *  1. RULE "belum terdaftar di Job ini" hilang — legacy meng-exclude kandidat
 *     yang idLoker-nya sudah berisi kode job ini (jangan menawari kandidat
 *     yang sudah mendaftar di job yang sama). Astro lama tidak mengecek sama
 *     sekali.
 *  2. Sertifikat dibaca dari field FILE (jft/ssw) — legacy memakai teks nilai
 *     (jftText/sswText: '-'-berarti belum ada). Sort prioritas kelengkapan,
 *     aturan "Wajib JFT/SSW", dan badge hasil kini konsisten memakai teks.
 *  3. Gender auto-fill hanya mengenali 'LAKI'/'PEREMPUAN' — legacy juga
 *     'PRIA'/'WANITA'. Keduanya kini didukung.
 *  4. Hasil di-render tanpa batas — legacy menampilkan maksimal 30.
 *  5. kirimTawaranMassal lewat raw fetch tanpa session + tanpa linkGrup &
 *     customMessage (kontrak legacy: { candidates, jobCode, linkGrup,
 *     customMessage }). Kini api.secure + payload lengkap + konfirmasi
 *     (parity legacy window.confirm).
 *  6. Semua copy hard-coded → t() dengan key legacy (ui.ai_headhunter,
 *     ui.search_criteria, ui.start_specific_search, ui.match_hint,
 *     ui.no_match, ui.sifting_db, ui.send_offer_all, dst id+jp).
 */
import { useState, useEffect } from 'preact/hooks';
import Icon from '../ui/Icon';
import { useOverlay } from '../ui/useOverlay';
import { showToast } from '../Toast';
import api from '../../lib/apiClient';
import { t } from '../../store/i18n';

interface Candidate {
  wa: string;
  nama: string;
  gender?: string;
  usia?: string;
  tb?: string;
  bb?: string;
  pendidikan?: string;
  tahapan?: string;
  status?: string;
  pasPhoto?: string;
  /** Nama/teks JFT & SSW — sumber kebenaran kelengkapan (legacy jftText/sswText). */
  jftText?: string;
  sswText?: string;
  /** Job yang sedang diikuti kandidat — dipakai rule "belum terdaftar di job ini". */
  idLoker?: string;
}

interface Job {
  code: string;
  pekerjaan: string;
  gender?: string;
  kuota?: string;
  lokasi?: string;
}

interface Props {
  job: Job;
  candidates: Candidate[];
  isOpen: boolean;
  onClose: () => void;
}

const GENDER_OPTIONS = [
  { value: 'ALL', label: t('ui.gender_all') },
  { value: 'L', label: t('candidate.gender_l') },
  { value: 'P', label: t('candidate.gender_p') },
];

const PENDIDIKAN_OPTIONS = [
  { value: 0, label: t('ui.edu_none') },
  { value: 3, label: t('ui.edu_sma') },
  { value: 4, label: t('ui.edu_diploma') },
  { value: 5, label: t('ui.edu_s1') },
];

/** Gender auto-fill dari syarat job — parity legacy (LAKI/PRIA & PEREMPUAN/WANITA). */
export function genderFromJob(reqGender?: string): 'L' | 'P' | 'ALL' {
  const g = String(reqGender || '').toUpperCase();
  if (g.includes('LAKI') || g.includes('PRIA')) return 'L';
  if (g.includes('PEREMPUAN') || g.includes('WANITA')) return 'P';
  return 'ALL';
}

export function hasCert(v?: string): boolean {
  const s = String(v || '').trim();
  return s !== '' && s !== '-';
}

function getPendidikanScore(pendidikan: string): number {
  const t = String(pendidikan || '').toUpperCase();
  if (t.includes('S1') || t.includes('SARJANA')) return 5;
  if (t.includes('D3') || t.includes('D4') || t.includes('DIPLOMA')) return 4;
  if (t.includes('SMA') || t.includes('SMK') || t.includes('MA') || t.includes('SLTA')) return 3;
  if (t.includes('SMP') || t.includes('SD')) return 2;
  return 0;
}

export default function MatchmakingModal({ job, candidates, isOpen, onClose }: Props) {
  const [filters, setFilters] = useState({
    gender: genderFromJob(job.gender),
    usiaMin: '',
    usiaMax: '',
    tbMin: '',
    bbMax: '',
    pendidikan: 0,
    keyword: '',
    jft: false,
    ssw: false,
  });
  const [results, setResults] = useState<Candidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [sending, setSending] = useState(false);
  const { containerRef, onBackdropClick } = useOverlay({ open: isOpen, onClose });

  useEffect(() => {
    if (isOpen) {
      setFilters({
        gender: genderFromJob(job.gender),
        usiaMin: '',
        usiaMax: '',
        tbMin: '',
        bbMax: '',
        pendidikan: 0,
        keyword: '',
        jft: false,
        ssw: false,
      });
      setResults([]);
      setSearched(false);
    }
  }, [isOpen, job]);

  const setFilter = (key: string, value: string | number | boolean) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const runMatchmaking = () => {
    setSearching(true);

    setTimeout(() => {
      const jobCodeUpper = String(job.code || '').toUpperCase();
      const filtered = candidates.filter((c) => {
        // Rule 1: Status harus AKTIF
        if (c.status?.toUpperCase() !== 'AKTIF') return false;
        // Rule 1b (legacy): kandidat yang SUDAH terdaftar di job ini tidak ditawari lagi
        if (jobCodeUpper && String(c.idLoker || '').toUpperCase().includes(jobCodeUpper)) return false;

        // Rule 2: Gender
        if (filters.gender !== 'ALL') {
          const cGender = String(c.gender || '').toUpperCase();
          if (filters.gender === 'L' && (cGender.includes('PEREMPUAN') || cGender === 'P' || cGender.includes('WANITA'))) return false;
          if (filters.gender === 'P' && (cGender.includes('LAKI') || cGender === 'L' || cGender.includes('PRIA'))) return false;
        }

        // Rule 3: Usia
        const cUsia = parseInt(String(c.usia || '').replace(/\D/g, '')) || 0;
        const min = parseInt(filters.usiaMin) || 0;
        const max = parseInt(filters.usiaMax) || 99;
        if (cUsia > 0 && (cUsia < min || cUsia > max)) return false;

        // Rule 4: Tinggi Badan
        const cTb = parseInt(String(c.tb || '').replace(/\D/g, '')) || 0;
        const tbMin = parseInt(filters.tbMin) || 0;
        if (tbMin > 0 && cTb > 0 && cTb < tbMin) return false;

        // Rule 5: Berat Badan
        const cBb = parseInt(String(c.bb || '').replace(/\D/g, '')) || 0;
        const bbMax = parseInt(filters.bbMax) || 999;
        if (bbMax < 999 && cBb > 0 && cBb > bbMax) return false;

        // Rule 6: Pendidikan
        if (filters.pendidikan > 0 && getPendidikanScore(c.pendidikan || '') < filters.pendidikan) return false;

        // Rule 7: Sertifikat (teks nilai, parity legacy jftText/sswText)
        if (filters.jft && !hasCert(c.jftText)) return false;
        if (filters.ssw && !hasCert(c.sswText)) return false;

        // Rule 8: Keyword
        if (filters.keyword) {
          const globalText = JSON.stringify(c).toUpperCase();
          const keywords = filters.keyword.split(',').map((k) => k.trim().toUpperCase()).filter((k) => k !== '');
          if (!keywords.some((k) => globalText.includes(k))) return false;
        }

        return true;
      });

      // Sort by completeness (photo, JFT, SSW) — parity legacy jftText/sswText
      filtered.sort((a, b) => {
        const scoreA = (a.pasPhoto && a.pasPhoto !== '-' ? 1 : 0) + (hasCert(a.jftText) ? 2 : 0) + (hasCert(a.sswText) ? 2 : 0);
        const scoreB = (b.pasPhoto && b.pasPhoto !== '-' ? 1 : 0) + (hasCert(b.jftText) ? 2 : 0) + (hasCert(b.sswText) ? 2 : 0);
        return scoreB - scoreA;
      });

      setResults(filtered.slice(0, 30)); // legacy: batasi 30 agar tidak lag
      setSearching(false);
      setSearched(true);
    }, 500);
  };

  const sendBlast = async () => {
    if (results.length === 0) {
      showToast(t('ui.toast_no_cand_offer'), 'error');
      return;
    }
    if (!window.confirm(t('ui.confirm_offer_n').replace('{n}', String(results.length)))) return;

    setSending(true);
    const linkPortal = window.location.origin + window.location.pathname.replace(/[^/]*$/, '');
    const customMessage = t('ui.offer_msg_template')
      .replace('{nama}', '{nama}')
      .replace('{job_code}', String(job.code || ''))
      .replace('{link_grup}', linkPortal);

    try {
      const data = (await api.secure('kirimTawaranMassal', [
        {
          candidates: results,
          jobCode: job.code,
          linkGrup: linkPortal,
          customMessage,
        },
      ])) as { success: boolean; results?: Array<{ success: boolean }>; error?: string };

      if (data.success) {
        const sent = data.results?.filter((r) => r.success).length || 0;
        showToast(t('ui.toast_offer_sent_n').replace('{n}', String(sent)), 'success');
        onClose();
      } else {
        showToast(t('ui.toast_offer_send_failed') + (data.error || ''), 'error');
      }
    } catch (e) {
      showToast(t('ui.toast_network_error_prefix') + (e instanceof Error ? e.message : String(e)), 'error');
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div class="fixed inset-0 u-modal-shell bg-black/80 backdrop-blur-md z-[300] flex items-center justify-center p-4" onClick={onBackdropClick}>
      <div ref={containerRef} onClick={(e) => e.stopPropagation()} class="glass-panel p-6 rounded-[2rem] w-full max-w-3xl shadow-2xl relative border border-violet-500/50 max-h-[90vh] flex flex-col">
        <button onClick={onClose} aria-label={t('ui.close')} class="absolute top-4 right-5 text-slate-400 hover:text-white z-[100]">
          <Icon name="times" class="text-2xl" />
        </button>

        <h2 class="text-lg font-bold text-violet-400 mb-1 flex items-center gap-2">
          <Icon name="search" class="text-violet-400" /> {t('ui.ai_headhunter')}
        </h2>
        <p class="text-xs text-slate-300 mb-4">
          {t('ui.target_job')} <span class="font-bold text-white uppercase">{job.code} - {job.pekerjaan}</span>
        </p>

        {/* Filter Panel */}
        <div class="bg-violet-900/20 border border-violet-500/30 p-4 rounded-xl mb-4">
          <h4 class="text-xs font-bold text-violet-400 mb-3">
            <Icon name="filter" class="mr-1" /> {t('ui.search_criteria')}
          </h4>

          <div class="u-grid-auto u-grid-auto--dense gap-3 mb-3">
            <div>
              <label class="text-[11px] text-slate-400 uppercase font-bold" for="mm-gender">{t('candidate.form_gender')}</label>
              <select id="mm-gender" value={filters.gender} onChange={(e) => setFilter('gender', (e.target as HTMLSelectElement).value)} class="w-full p-2 bg-slate-800/50 border border-slate-700 rounded-lg text-sm text-white outline-none focus:border-violet-500">
                {GENDER_OPTIONS.map((g) => (
                  <option key={g.value} value={g.value}>{g.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label class="text-[11px] text-slate-400 uppercase font-bold" for="mm-usia-min">{t('ui.age_range')} (Min)</label>
              <input id="mm-usia-min" type="number" value={filters.usiaMin} onInput={(e) => setFilter('usiaMin', (e.target as HTMLInputElement).value)} placeholder="18" class="w-full p-2 bg-slate-800/50 border border-slate-700 rounded-lg text-sm text-white outline-none focus:border-violet-500" />
            </div>
            <div>
              <label class="text-[11px] text-slate-400 uppercase font-bold" for="mm-usia-max">{t('ui.age_range')} (Max)</label>
              <input id="mm-usia-max" type="number" value={filters.usiaMax} onInput={(e) => setFilter('usiaMax', (e.target as HTMLInputElement).value)} placeholder="35" class="w-full p-2 bg-slate-800/50 border border-slate-700 rounded-lg text-sm text-white outline-none focus:border-violet-500" />
            </div>
            <div>
              <label class="text-[11px] text-slate-400 uppercase font-bold" for="mm-tb-min">{t('ui.min_height')}</label>
              <input id="mm-tb-min" type="number" value={filters.tbMin} onInput={(e) => setFilter('tbMin', (e.target as HTMLInputElement).value)} placeholder="150" class="w-full p-2 bg-slate-800/50 border border-slate-700 rounded-lg text-sm text-white outline-none focus:border-violet-500" />
            </div>
          </div>
          <div class="u-grid-auto u-grid-auto--dense gap-3 mb-3">
            <div>
              <label class="text-[11px] text-slate-400 uppercase font-bold" for="mm-bb-max">{t('ui.max_weight')}</label>
              <input id="mm-bb-max" type="number" value={filters.bbMax} onInput={(e) => setFilter('bbMax', (e.target as HTMLInputElement).value)} placeholder="80" class="w-full p-2 bg-slate-800/50 border border-slate-700 rounded-lg text-sm text-white outline-none focus:border-violet-500" />
            </div>
            <div>
              <label class="text-[11px] text-slate-400 uppercase font-bold" for="mm-pendidikan">{t('ui.min_education')}</label>
              <select id="mm-pendidikan" value={filters.pendidikan} onChange={(e) => setFilter('pendidikan', Number((e.target as HTMLSelectElement).value))} class="w-full p-2 bg-slate-800/50 border border-slate-700 rounded-lg text-sm text-white outline-none focus:border-violet-500">
                {PENDIDIKAN_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label class="text-[11px] text-slate-400 uppercase font-bold" for="mm-keyword">{t('ui.experience_skills')}</label>
              <input id="mm-keyword" type="text" value={filters.keyword} onInput={(e) => setFilter('keyword', (e.target as HTMLInputElement).value)} placeholder={t('ui.kw_ph')} class="w-full p-2 bg-slate-800/50 border border-slate-700 rounded-lg text-sm text-white outline-none focus:border-violet-500" />
            </div>
            <div class="flex items-end gap-4">
              <label class="flex items-center gap-2 text-[11px] text-slate-400 uppercase font-bold cursor-pointer">
                <input type="checkbox" checked={filters.jft} onChange={(e) => setFilter('jft', (e.target as HTMLInputElement).checked)} class="accent-violet-500" /> {t('ui.require_jft')}
              </label>
              <label class="flex items-center gap-2 text-[11px] text-slate-400 uppercase font-bold cursor-pointer">
                <input type="checkbox" checked={filters.ssw} onChange={(e) => setFilter('ssw', (e.target as HTMLInputElement).checked)} class="accent-violet-500" /> {t('ui.require_ssw')}
              </label>
            </div>
          </div>
          <button onClick={runMatchmaking} disabled={searching} class="w-full py-3 bg-violet-600 hover:bg-violet-500 text-white rounded-xl font-bold shadow-lg transition disabled:opacity-50">
            <Icon name="search" class="mr-1" /> {searching ? t('ui.sifting_db') : t('ui.start_specific_search')}
          </button>
        </div>

        {/* Results */}
        <div class="flex-1 u-scroll-area custom-scrollbar">
          {results.length === 0 && !searched && (
            <div class="text-center p-6 text-slate-400 text-xs italic bg-black/30 rounded-xl border border-slate-700/50 mb-4">
              <Icon name="robot" class="text-3xl mb-3 mx-auto text-slate-600" />
              <br />
              {t('ui.match_hint')}
            </div>
          )}
          {results.length === 0 && searched && !searching && (
            <div class="text-center p-6 text-slate-400 text-xs italic bg-red-900/20 rounded-xl border border-red-500/30 mb-4">
              <Icon name="times-circle" class="text-3xl text-red-500 mb-3 mx-auto" />
              <br />
              {t('ui.no_match')}
            </div>
          )}
          {results.length > 0 && (
            <>
              <p class="text-xs text-violet-400 font-bold mb-2">
                {t('ui.found_n').replace('{n}', String(results.length))}
              </p>
              <div class="space-y-2">
                {results.map((c) => (
                  <div key={c.wa} class="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
                    <div class="flex items-center gap-3">
                      {c.pasPhoto && c.pasPhoto !== '-' ? (
                        <img src={c.pasPhoto} alt={c.nama} class="w-10 h-10 rounded-full object-cover border-2 border-violet-500" />
                      ) : (
                        <div class="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-slate-400 text-xs">
                          <Icon name="user" />
                        </div>
                      )}
                      <div>
                        <p class="font-bold text-white text-sm">{c.nama}</p>
                        <p class="text-[11px] text-slate-400">{c.gender || '-'} | {c.usia || '-'} {t('ui.years_short')} | TB {c.tb || '-'} | {c.pendidikan || '-'}</p>
                      </div>
                    </div>
                    <div class="flex items-center gap-2">
                      {hasCert(c.jftText) && <span class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-sky-500/20 text-sky-400 border border-sky-500/40">JFT</span>}
                      {hasCert(c.sswText) && <span class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40">SSW</span>}
                      <button onClick={() => window.open(`https://wa.me/${c.wa}`, '_blank')} class="w-7 h-7 flex items-center justify-center bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs cursor-pointer">
                        <Icon name="whatsapp" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={sendBlast} disabled={sending} class="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold shadow-lg transition mt-4 disabled:opacity-50">
                <Icon name="whatsapp" class="mr-1" /> {sending ? t('ui.sending') : t('ui.send_offer_all')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
