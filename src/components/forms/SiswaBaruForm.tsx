/**
 * SiswaBaruForm.tsx - Pendaftaran Siswa Baru + AI Chat Jeklin
 * Source: legacy siswa-baru.html + js/pages/siswa_baru.js (1:1 match)
 * Split panel: Chat AI (left) + Form Biodata Preview (right)
 *
 * C04 parity (2026-09-05) against js/pages/siswa_baru.js fixed root bugs:
 *  1. Chat posted action `processSiswaAIChat` to the WRONG surface function
 *     (/.netlify/functions/register → "Action not handled by this surface",
 *     the Sesi-6 QA "chat 404"). Legacy callAPI routes it to the ai surface;
 *     it now goes to getEndpoint('processSiswaAIChat') (ai-chat function).
 *  2. The payload was an array-of-one `[{message, history, biodata}]` and the
 *     backend reads a bare OBJECT {history, currentData} — so the user's
 *     just-typed message (sent in a field the handler ignores) was NEVER in
 *     history and the AI answered cold. Now the turn is appended to history
 *     (last 20, legacy v.slice(-20)) and the object is sent directly, legacy
 *     callAPI("processSiswaAIChat", {history, currentData}) style.
 *  3. AI data merge read `data.biodata` — the handler returns `data.data`
 *     with snake_case keys (wa_siswa/wa_ortu …); the form state is camelCase,
 *     so nothing ever auto-filled. Merged through a snake→camel map.
 *  4. Submit was a silent no-op: multipart FormData → /ai-form-submit, which
 *     JSON-parses bodies to {} → "not implemented" yet res.ok=true toasted
 *     SUCCESS. Legacy uploads ktp/kk/ijazah to Cloudinary then calls
 *     callAPI("submitDaftarSiswa", flatSnakeObject) — public, no session.
 *  5. Only `nama` was required; legacy saveToDatabase requires ALL 9 biodata
 *     fields + all 3 scans and lists what is missing in one toast.
 * All copy is keyed in both id/jp dictionaries (legacy-locale values).
 */
import { useState, useRef, useEffect } from 'preact/hooks';
import { showToast } from '../../components/Toast';
import { validate, waSchema, emailSchema } from '../../lib/schemas';
import { t, useLang } from '../../store/i18n';
import { apiClient, type ApiError } from '../../lib/apiClient';
import { uploadMany } from '../../lib/cloudinary';
import { SISWA_FILE_COLUMNS } from '../../lib/documentColumns';
import Icon from '../ui/Icon';
import AiUnavailableBanner from '../ui/AiUnavailableBanner';

interface ChatMessage {
  role: 'assistant' | 'user';
  text: string;
  time: string;
}

interface Biodata {
  nama: string; ttl: string; gender: string; agama: string;
  email: string; alamat: string; pendidikan: string;
  waSiswa: string; waOrtu: string;
}

const DRAFT_KEY = "asj_siswa_draft_v1";

const INIT: Biodata = {
  nama: '', ttl: '', gender: '', agama: '', email: '',
  alamat: '', pendidikan: '', waSiswa: '', waOrtu: ''
};

/** Server/DB column names are snake_case (legacy) — map form state ⇄ payload. */
const SNAKE_TO_CAMEL: Record<string, keyof Biodata> = {
  nama: 'nama', ttl: 'ttl', gender: 'gender', agama: 'agama',
  email: 'email', alamat: 'alamat', pendidikan: 'pendidikan',
  wa_siswa: 'waSiswa', wa_ortu: 'waOrtu',
};

function toSnakePayload(b: Biodata): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [snake, camel] of Object.entries(SNAKE_TO_CAMEL)) {
    out[snake] = b[camel] || '';
  }
  return out;
}

/**
 * Render legacy chat text: content is HTML-escaped at render (JSX) and the
 * legacy `**bold**` markers become <b> (parity `_()` in siswa_baru.js which
 * escapes then turns double-asterisk spans into bold).
 */
function renderChatText(text: string) {
  const parts = String(text || '').split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.length > 4 && p.startsWith('**') && p.endsWith('**')) {
      return <strong key={i} class="font-bold">{p.slice(2, -2)}</strong>;
    }
    return <span key={i}>{p}</span>;
  });
}

/** Small surface-call helper.
 *
 *  Dulu mengirim payload sebagai OBJEK telanjang dan menarik `code` dari body
 *  error sendiri. Keduanya kini ditangani `apiClient`: handler
 *  (`unwrapPayloadArgs`) menerima ARRAY maupun objek — bentuk array itu yang
 *  dikirim setiap pemanggil apiClient lain, termasuk AiCvForm — dan `ApiError`
 *  membawa `code`/`status`/`retryAfter` server apa adanya.
 *
 *  Yang didapat dari konversi ini: batas waktu 20 s. Sebelumnya tidak ada sama
 *  sekali, dan karena `finally` tidak pernah jalan selama fetch masih pending,
 *  satu koneksi macet mengunci tombol kirim untuk selamanya.
 *
 *  `requireAuth: false` — permukaan ini publik (pendaftaran siswa baru, tanpa
 *  sesi). `silent: true` — pemanggil punya toast-nya sendiri ("siswa.failed" +
 *  pesan server), jadi tanpa ini user melihat DUA toast untuk satu kegagalan. */
async function postAction(action: string, payload: unknown): Promise<any> {
  return apiClient(action, [payload], {
    requireAuth: false,
    onSessionInvalid: 'throw',
    silent: true,
  });
}

type SubmitPhase = 'idle' | 'uploading' | 'saving' | 'done';

export default function SiswaBaruForm() {
  const _lang = useLang();
  const [tab, setTab] = useState<'chat' | 'form'>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [biodata, setBiodata] = useState<Biodata>(INIT);
  const [docs, setDocs] = useState<Record<string, File | null>>({});
  const [docStatus, setDocStatus] = useState<Record<string, string>>({});
  const [submitPhase, setSubmitPhase] = useState<SubmitPhase>('idle');
  // §6.5 row 3: set when the backend answers `code: 'AI_UNAVAILABLE'`.
  const [aiDown, setAiDown] = useState<string | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Load draft from localStorage
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft.savedAt && Date.now() - draft.savedAt > 86400000) {
          showToast(t('siswa.draft_stale'), 'warning');
        }
        if (draft.biodata) setBiodata(draft.biodata);
        if (draft.docs) {
          setDocStatus(draft.docStatus || {});
        }
        if (draft.messages && draft.messages.length > 0) {
          setMessages(draft.messages);
          return;
        }
      }
    } catch {}
    const t0 = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    setMessages([{ role: 'assistant', text: t('siswa.greeting'), time: t0 }]);
  }, []);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);
  // Auto-save to localStorage every 30s + on change
  useEffect(() => {
    const timer = setInterval(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({
          biodata, messages, docStatus, savedAt: Date.now()
        }));
      } catch {}
    }, 30000);
    return () => clearInterval(timer);
  }, [biodata, messages, docStatus]);

  // Save before unload
  useEffect(() => {
    const save = () => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({
          biodata, messages, docStatus, savedAt: Date.now()
        }));
      } catch {}
    };
    window.addEventListener('beforeunload', save);
    return () => window.removeEventListener('beforeunload', save);
  }, [biodata, messages, docStatus]);


  /** Current time string for chat messages */
  const now = () => new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    // Legacy xe(): push the user turn into history FIRST, then send the last 20
    // messages as {history, currentData} — the handler never reads a bare
    // "message" field, so the turn must live inside history.
    const next = [...messages, { role: 'user' as const, text, time: now() }];
    setMessages(next);
    setInput('');
    setSending(true);
    try {
      const history = next
        .slice(-20)
        .map(m => ({ role: m.role, content: m.text }));
      const res = await postAction('processSiswaAIChat', {
        history,
        currentData: toSnakePayload(biodata),
      });
      const reply = res && typeof res.reply === 'string' && res.reply ? res.reply : '...';
      setMessages(prev => [...prev, { role: 'assistant', text: reply, time: now() }]);
      setAiDown(null);
      // Legacy: s.data → u = Object.assign({}, u, s.data) then re-render inputs.
      if (res && res.data && typeof res.data === 'object') {
        const patch: Partial<Biodata> = {};
        for (const [snake, camel] of Object.entries(SNAKE_TO_CAMEL)) {
          const v = res.data[snake];
          if (typeof v === 'string' && v.trim()) patch[camel] = v.trim();
        }
        if (Object.keys(patch).length > 0) {
          setBiodata(prev => ({ ...prev, ...patch }));
        }
      }
    } catch (e) {
      // `code` kini datang dari apiClient (ApiError) alih-alih diambil sendiri
      // dari body error. §6.5 baris 3: hanya AI_UNAVAILABLE yang menyalakan banner.
      const err = e as ApiError;
      setAiDown(err.code === 'AI_UNAVAILABLE' ? err.message || null : null);
      setMessages(prev => [...prev, { role: 'assistant', text: t('siswa.chat_error'), time: now() }]);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleDocUpload = (e: Event, type: string) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    setDocs(prev => ({ ...prev, [type]: file }));
    setDocStatus(prev => ({ ...prev, [type]: file.name }));
  };

  /** Legacy saveToDatabase() requires EVERY field + every scan and lists the
   *  missing ones in one toast (form.siswa_missing_header + bullets + footer). */
  const missingFields = (): string[] => {
    const missing: string[] = [];
    const fieldLabels: Record<keyof Biodata, string> = {
      nama: t('siswa.field_nama'),
      ttl: t('siswa.field_ttl'),
      gender: t('siswa.field_gender'),
      agama: t('siswa.field_agama'),
      email: t('siswa.field_email'),
      alamat: t('siswa.field_alamat'),
      pendidikan: t('siswa.field_pendidikan'),
      waSiswa: t('siswa.field_wa_siswa'),
      waOrtu: t('siswa.field_wa_ortu'),
    };
    for (const key of Object.keys(fieldLabels) as (keyof Biodata)[]) {
      if (!String(biodata[key] || '').trim()) missing.push('- ' + fieldLabels[key]);
    }
    const docLabels: Record<string, string> = {
      ktp: t('siswa.field_ktp'),
      kk: t('siswa.field_kk'),
      ijazah: t('siswa.field_ijazah'),
    };
    for (const key of Object.keys(docLabels)) {
      if (!docs[key]) missing.push('- ' + docLabels[key]);
    }
    return missing;
  };

  const handleSubmit = async () => {
    if (submitPhase === 'uploading' || submitPhase === 'saving' || submitPhase === 'done') return;
    const missing = missingFields();
    if (missing.length > 0) {
      const msg = t('siswa.missing_header') + '\n' + missing.join('\n') + '\n' + t('siswa.missing_footer');
      showToast(msg, 'error');
      // Legacy: on mobile jump straight to the form so the user can fill gaps.
      if (typeof window !== 'undefined' && window.innerWidth < 768) setTab('form');
      return;
    }
    if (biodata.waSiswa) { const vw = validate(waSchema, biodata.waSiswa); if (!vw.success) { showToast(vw.errors[0], 'error'); return; } }
    if (biodata.email) { const ve = validate(emailSchema, biodata.email); if (!ve.success) { showToast(ve.errors[0], 'error'); return; } }
    let failedStage: 'upload' | 'save' | null = null;
    setSubmitPhase('uploading');
    try {
      // Legacy: upload ktp/kk/ijazah → Cloudinary first, then send the URLs.
      failedStage = 'upload';
      const urls = await uploadMany(docs, SISWA_FILE_COLUMNS);
      failedStage = 'save';
      setSubmitPhase('saving');
      const payload = { ...toSnakePayload(biodata), ktp: urls.ktp || null, kk: urls.kk || null, ijazah: urls.ijazah || null };
      const res = await postAction('submitDaftarSiswa', payload);
      if (res && res.success) {
        try { localStorage.removeItem(DRAFT_KEY); } catch {}
        setSubmitPhase('done');
        showToast(t('siswa.success'), 'success');
      } else {
        setSubmitPhase('idle');
        showToast(t('siswa.failed') + ' ' + String((res && (res.message || res.error)) || ''), 'error');
      }
    } catch (e: unknown) {
      // Label by the stage that actually failed: upload-stage error →
      // upload_failed; save-stage network error → network_error. (FIX 2026-09-05:
      // phaseBefore ditangkap di entry → selalu 'idle' saat klik pertama, jadi
      // upload gagal di-label network_error dan save gagal di-label upload_failed.)
      setSubmitPhase('idle');
      if (failedStage === 'upload') {
        showToast(t('siswa.upload_failed') + ' ' + ((e as Error)?.message || ''), 'error');
      } else {
        showToast(t('siswa.network_error'), 'error');
      }
    }
  };

  const BIODATA_FIELDS = [
    { id: 'nama' as const, label: t('siswa.field_nama'), span: true },
    { id: 'ttl' as const, label: t('siswa.field_ttl') },
    { id: 'gender' as const, label: t('siswa.field_gender') },
    { id: 'agama' as const, label: t('siswa.field_agama') },
    { id: 'email' as const, label: t('siswa.field_email') },
    { id: 'alamat' as const, label: t('siswa.field_alamat'), span: true },
    { id: 'pendidikan' as const, label: t('siswa.field_pendidikan'), span: true },
    { id: 'waSiswa' as const, label: t('siswa.field_wa_siswa') },
    { id: 'waOrtu' as const, label: t('siswa.field_wa_ortu') }
  ];

  const DOC_FIELDS = [
    { type: 'ktp', label: t('siswa.field_ktp'), icon: 'fa-id-card', bg: 'bg-sky-600' },
    { type: 'kk', label: t('siswa.field_kk'), icon: 'fa-users', bg: 'bg-amber-600' },
    { type: 'ijazah', label: t('siswa.field_ijazah'), icon: 'fa-graduation-cap', bg: 'bg-emerald-600' }
  ];

  const submitLabel = () => {
    if (submitPhase === 'uploading') return t('siswa.upload_doc');
    if (submitPhase === 'saving') return t('siswa.saving');
    if (submitPhase === 'done') return '✓ ' + t('siswa.success_btn');
    return t('siswa.submit_btn');
  };

  return (
    <div class="flex flex-col md:flex-row h-[calc(100dvh-42px)] w-full relative pt-[42px]">
      {/* Mobile Tab */}
      <div class="md:hidden flex w-full bg-slate-900 border-b border-slate-800 z-50">
        <button onClick={() => setTab('chat')} class={tab === 'chat' ? 'flex-1 min-h-11 py-3 text-xs font-bold bg-amber-600/20 text-amber-400 border-b-2 border-amber-500' : 'flex-1 min-h-11 py-3 text-xs font-bold text-slate-400'}>
          <Icon name="crown" class="mr-2" />{t('siswa.tab_chat')}
        </button>
        <button onClick={() => setTab('form')} class={tab === 'form' ? 'flex-1 min-h-11 py-3 text-xs font-bold bg-amber-600/20 text-amber-400 border-b-2 border-amber-500' : 'flex-1 min-h-11 py-3 text-xs font-bold text-slate-400'}>
          <Icon name="file-alt" class="mr-2" />{t('siswa.tab_form')}
        </button>
      </div>

      {/* Chat Panel */}
      <div class={`${tab === 'chat' ? 'flex' : 'hidden'} md:flex w-full md:w-[40%] h-full md:h-full bg-slate-900 border-r border-slate-800 flex-col z-20`}>
        <div class="p-3 bg-slate-950 border-b border-slate-800 flex items-center gap-3 relative overflow-hidden">
          <div class="absolute -top-4 -right-4 w-16 h-16 bg-amber-500 rounded-full blur-2xl opacity-20"></div>
          <div class="w-10 h-10 rounded-full bg-amber-500 p-0.5 shadow-[0_0_15px_rgba(245,158,11,0.4)] flex-shrink-0">
            <img src="https://gdwvffmevwtwnzrapjwy.supabase.co/storage/v1/object/public/asj-files/assets/jeklin.png" alt="Qween Jeklin" class="w-full h-full rounded-full object-cover" />
          </div>
          <div>
            <h2 class="text-sm font-bold text-amber-400">Qween Jeklin</h2>
            <p class="text-[11px] text-slate-400"><span class="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 animate-pulse"></span>{t('siswa.assistant')}</p>
          </div>
        </div>
        {aiDown && (
          <div class="p-3 shrink-0">
            <AiUnavailableBanner message={aiDown} />
          </div>
        )}
        <div ref={chatRef} class="flex-1 u-scroll-area p-4 space-y-4 pb-16 md:pb-4">
          {messages.map((msg, i) => (
            <div key={i} class={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div class={`${msg.role === 'user' ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-200'} rounded-xl px-4 py-2.5 max-w-[80%] shadow-lg`}>
                <p class="text-xs leading-relaxed whitespace-pre-wrap">{renderChatText(msg.text)}</p>
                <p class={`text-[11px] mt-1 ${msg.role === 'user' ? 'text-amber-200' : 'text-slate-500'}`}>{msg.time}</p>
              </div>
            </div>
          ))}
          {sending && (
            <div class="flex justify-start">
              <div class="bg-slate-800 rounded-xl px-4 py-2.5 shadow-lg">
                <div class="flex gap-1.5 items-center h-8"><div class="w-2 h-2 bg-amber-500/80 rounded-full animate-bounce"></div><div class="w-2 h-2 bg-amber-500/80 rounded-full animate-bounce" style="animation-delay:0.15s"></div><div class="w-2 h-2 bg-amber-500/80 rounded-full animate-bounce" style="animation-delay:0.3s"></div></div>
              </div>
            </div>
          )}
        </div>
        <div class="p-3 bg-slate-950 border-t border-slate-800 flex gap-2">
          <input ref={inputRef} type="text" value={input}
            onInput={(e) => setInput((e.target as HTMLInputElement).value)}
            onKeyDown={handleKeyDown}
            class="flex-1 bg-slate-800 text-xs text-white px-4 py-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-amber-500 transition-colors"
            placeholder={t('siswa.placeholder_chat')} />
          <button onClick={handleSend} disabled={sending} aria-label={t('siswa.send')}
            class="bg-amber-600 hover:bg-amber-500 text-white px-4 py-2.5 rounded-xl transition shadow-[0_4px_10px_0_rgba(245,158,11,0.3)] disabled:opacity-50">
            <Icon name="paper-plane" />
          </button>
        </div>
      </div>

      {/* Form Panel */}
      <main class={`${tab === 'form' ? 'flex' : 'hidden'} md:flex w-full md:w-[60%] h-[calc(100vh-42px)] md:h-full u-scroll-area bg-slate-950 p-4 md:p-8`}>
        <div class="max-w-3xl mx-auto pb-20 w-full">
          <div class="flex justify-between items-center mb-6 bg-slate-900/50 p-4 rounded-xl border border-slate-800">
            <div class="flex items-center gap-3">
              <img src="https://gdwvffmevwtwnzrapjwy.supabase.co/storage/v1/object/public/asj-files/assets/logo_asj.png" alt="ASJ Logo" class="h-10 object-contain" />
              <div>
                {/* h2, not h1: the page h1 is the FormToolbar title. This panel
                    heading was the page's ONLY h1, and because it lives inside a
                    tab panel it is `display:none` on mobile — so at 390px the
                    document had no h1 at all (measured §23). */}
                <h2 class="text-sm md:text-lg font-black text-white">{t('siswa.form_title')}</h2>
                <p class="text-[11px] text-slate-400">{t('siswa.form_hint')}</p>
              </div>
            </div>
            <button onClick={handleSubmit} disabled={submitPhase === 'uploading' || submitPhase === 'saving' || submitPhase === 'done'}
              class={`${submitPhase === 'done' ? 'bg-sky-600 hover:bg-sky-500' : 'bg-emerald-600 hover:bg-emerald-500'} min-h-11 text-white text-[11px] md:text-xs font-bold px-5 py-2.5 rounded-lg transition shadow-[0_0_15px_rgba(16,185,129,0.4)] flex items-center gap-2`}>
              <Icon name="paper-plane" />{submitLabel()}
            </button>
          </div>
          {sending && (
            <div class="text-[11px] text-amber-400 font-bold mb-4 bg-amber-900/20 p-2 rounded border border-amber-500/20 flex items-center">
              <Icon spin name="magic" class="mr-2" />{t('siswa.analyzing')}
            </div>
          )}
          <div class="bg-slate-900/40 border border-slate-800 rounded-xl p-5 mb-5">
            {/* Was an ad-hoc <h2> that re-implemented `.section-title` by hand
                (text-xs font-bold text-sky-400 mb-4 uppercase tracking-wider
                border-b border-slate-800 pb-2) with two raw palette values
                instead of the tokens. MasterFullForm and AiCvForm already use
                `.section-title` (12 and 4 times), so this was the last
                hand-rolled member of that family. The dead utilities were
                removed rather than left behind: `.section-title` is unlayered,
                so it beats every layered Tailwind utility on the same element
                and any one left here would be a rule that never applies. */}
            <h2 class="section-title section-title--flush">
              <Icon name="address-card" class="mr-1" />{t('siswa.data_pribadi')}
            </h2>
            {/* EXPLICIT 2-up grid, not `.u-grid-auto--form`.
                MEASURED DEFECT (2026-09-25, probe at 768/1280): the auto-fit
                form grid resolved to `grid-template-columns: 330.797px 0px`
                and the `md:col-span-2` child forced that 0px IMPLICIT second
                track. `.u-grid-auto > * { min-width: 0 }` lets the implicit
                track's content shrink to nothing, so the 1-span children that
                landed in it rendered 18x34 — their labels wrapped one letter
                per line. The phantom track cannot occur in an explicit grid.

                WHY `lg`, NOT `md`: `--u-grid-min` is 24rem (384px), and at a
                768px viewport this panel is only ~331px wide, so `auto-fit`
                could never fit 384px twice — the 2-up layout the spans ask for
                was structurally unreachable at every width this form is used
                at. Switching to 2 columns at `md` would therefore re-shape 3
                fields that were rendering full-width (330.8 -> 157.4px at 768),
                whereas `lg` keeps the single-column shape users already see and
                only fixes the collapsed ones. Measured collateral over the
                non-affected fields: lg = 397px total, md = 917px.
                The `span` rows become full width at `lg` and up, which is what
                the `md:col-span-2` these replaced was reaching for. */}
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {BIODATA_FIELDS.map(f => (
                <div key={f.id} class={f.span ? 'lg:col-span-2' : ''}>
                  <label class="block text-[11px] font-bold text-slate-400 mb-1" for={`sw-${f.id}`}>{f.label}</label>
                  <input id={`sw-${f.id}`} type="text" value={biodata[f.id]} onInput={(e) => setBiodata(prev => ({ ...prev, [f.id]: (e.target as HTMLInputElement).value }))}
                    class="min-h-11 w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-white outline-none" />
                </div>
              ))}
            </div>
          </div>
          <div class="u-grid-auto u-grid-auto--cards gap-4">
            {DOC_FIELDS.map(d => (
              <div key={d.type} class="bg-slate-900 border border-slate-700 p-4 rounded-xl flex items-center gap-3">
                <div class={`w-12 h-12 rounded-lg ${d.bg} flex items-center justify-center text-white text-xl flex-shrink-0`}>
                  <Icon name={d.icon} />
                </div>
                <div class="flex-1 overflow-hidden">
                  <label class="block text-[11px] font-bold text-sky-400 mb-1" for={`sw-doc-${d.type}`}>{d.label}</label>
                  {/* MEASURED (2026-09-25, /siswa-baru at 768/1280): the native
                      file control's own box was 21.5px tall — under WCAG 2.5.8
                      AA's 24px. min-h-11 lifts the target to the 44px floor. */}
                  <input id={`sw-doc-${d.type}`} type="file" accept=".pdf,image/*" onChange={(e) => handleDocUpload(e, d.type)}
                    class="w-full min-h-11 text-[11px] text-slate-400 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-slate-800 file:text-white cursor-pointer" />
                  {docStatus[d.type] && <div class="text-[11px] text-emerald-400 mt-1 font-bold truncate"><Icon name="check" class="mr-0.5" />{docStatus[d.type]}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
