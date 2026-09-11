/**
 * AiCvForm.tsx — AI CV Chat + Preview Form (ai_form.html)
 * Source: legacy/ai_form.html (1:1 match)
 * Split panel: Chat AI Jeklin (left 35%) + CV Preview Form (right 65%)
 */
import { useState, useRef, useEffect } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import { showToast } from '../Toast';
import { authStore } from '../../store/authReactive';
import { t, langStore, toggleLang } from '../../store/i18n';
import { apiClient } from '../../lib/apiClient';
import { validate, waSchema, kandidatLoginSchema } from '../../lib/schemas';

import type { ChatMessage } from '../../types/api';
import Icon from '../ui/Icon';
import { getEndpoint } from '../../lib/apiEndpoint';
import { uploadMany, UploadCollectionError } from '../../lib/cloudinary';
import { AI_FILE_COLUMNS } from '../../lib/documentColumns';

interface CvData {
  nama: string; katakana: string; panggilan: string; panggilan_katakana: string;
  tmplahir: string; tgllahir: string; umur: string; gender: string; agama: string;
  goldar: string; status: string; anak: string; email: string; alamat: string;
  hp: string; hpdarurat: string; ktp: string; paspor: string; sim: string;
  tb: string; bb: string; tangan: string; sepatu: string; baju: string; topi: string; tahan_ac: string;
  matakanan: string; matakiri: string; kacamata: string; butawarna: string; tato: string;
  rokok: string; alkohol: string;
  alergi_id: string; alergi_jp: string; medis_id: string; medis_jp: string; laka_id: string; laka_jp: string;
  riwayatjepang: string;
  promo_id: string; promo_jp: string; lebih_id: string; lebih_jp: string;
  kurang_id: string; kurang_jp: string; hobi_id: string; hobi_jp: string;
  keahlian_id: string; keahlian_jp: string; moti_id: string; moti_jp: string;
  alasan_id: string; alasan_jp: string; pulang_id: string; pulang_jp: string;
  keinginan_id: string; keinginan_jp: string; tujuan_id: string; tujuan_jp: string;
  lama: string; gaji_yen: string; tabungan: string;
  bhs_jepang: string; nilai: string; lisensi: string;
  kenalan_nama_id: string; kenalan_nama_jp: string; kenalan_hub_id: string; kenalan_hub_jp: string;
  kenalan_kerja_id: string; kenalan_kerja_jp: string; kenalan_usia: string;
  kenalan_alamat_id: string; kenalan_alamat_jp: string;
  [key: string]: string;
}

const CV_FIELDS = [
  'nama','katakana','panggilan','panggilan_katakana','tmplahir','tgllahir','umur','gender','agama',
  'goldar','status','anak','email','alamat','hp','hpdarurat','ktp','paspor','sim',
  'tb','bb','tangan','sepatu','baju','topi','tahan_ac',
  'matakanan','matakiri','kacamata','butawarna','tato','rokok','alkohol',
  'alergi_id','alergi_jp','medis_id','medis_jp','laka_id','laka_jp',
  'riwayatjepang','promo_id','promo_jp','lebih_id','lebih_jp','kurang_id','kurang_jp',
  'hobi_id','hobi_jp','keahlian_id','keahlian_jp','moti_id','moti_jp',
  'alasan_id','alasan_jp','pulang_id','pulang_jp','keinginan_id','keinginan_jp',
  'tujuan_id','tujuan_jp','lama','gaji_yen','tabungan',
  'bhs_jepang','nilai','lisensi',
  'kenalan_nama_id','kenalan_nama_jp','kenalan_hub_id','kenalan_hub_jp',
  'kenalan_kerja_id','kenalan_kerja_jp','kenalan_usia','kenalan_alamat_id','kenalan_alamat_jp'
] as const;

const EMPTY_CV: CvData = Object.fromEntries(CV_FIELDS.map(k => [k, ''])) as CvData;

const SUGGESTIONS = [
  'Perkenalkan diriku',
  'Isi data pendidikan',
  'Terjemahkan semua kolom ke JP',
  'Lengkapi data keluarga',
  'Isi pengalaman kerja',
  'Lengkapi data wawancara',
];


/** Strip dangerous HTML tags — prevents XSS from AI output. */
const waFromUrl = () => { try { return new URLSearchParams(window.location.search).get('wa') || ''; } catch { return ''; } };

function sanitizeAiHtml(text: string): string {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/<[^>]*>/g, '');
}

const JEKLIN_IMG = 'https://gdwvffmevwtwnzrapjwy.supabase.co/storage/v1/object/public/asj-files/assets/jeklin.png';

export default function AiCvForm() {
  const lang = useStore(langStore);
  const [tab, setTab] = useState<'chat' | 'form'>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [cv, setCv] = useState<CvData>(EMPTY_CV);
  const [docs, setDocs] = useState<Record<string, File | null>>({});
  const [docStatus, setDocStatus] = useState<Record<string, string>>({});
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(true);
  // C03 (2026-09-05): login gate pola MasterFullForm — backend minta sesi untuk
  // chat (processAIChat H4) DAN simpan (submitDataAsj); apiClient tanpa sesi
  // redirect ke '/' → seluruh state CV hilang. Gate saat mount + guard di
  // saveToDatabase supaya sesi yang hilang tidak pernah drop CV diam-diam.
  const [loginGate, setLoginGate] = useState(() => {
    const a = authStore.get();
    return !a.sessionToken || !a.isLoggedIn;
  });
  const [gateWa, setGateWa] = useState(waFromUrl);
  const [gatePass, setGatePass] = useState('');
  const [gateMsg, setGateMsg] = useState('');
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const now = () => new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

  useEffect(() => {
    setMessages([{ role: 'assistant',
      text: t('ai_cv.bot_greeting'),
      time: now() }]);
    setShowSuggestions(true);
  }, []);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages, sending]);

  /** Add assistant message to chat */
  const addBot = (text: string) => {
    setMessages(prev => [...prev, { role: 'assistant', text, time: now() }]);
  };

  const handleSend = async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || sending) return;
    setMessages(prev => [...prev, { role: 'user', text: msg, time: now() }]);
    setInput('');
    setSending(true);
    setShowSuggestions(false);
    try {
      const trimmedHistory = messages.slice(-20).map(m => ({ role: m.role, content: m.text }));
      const token = authStore.get().sessionToken;
      const res = await fetch(getEndpoint('processAIChat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        body: JSON.stringify({ action: 'processAIChat', payload: [{ message: msg, history: trimmedHistory, cvData: cv }], ...(token ? { sessionToken: token } : {}) })
      });
      if (res.ok) {
        const data = await res.json();
        addBot(data.reply || 'Jeklin bingung nih kak, coba tanya lagi ya!');
        if (data.cvData) {
          setCv(prev => ({ ...prev, ...data.cvData }));
          showToast(t('toast.saved'), 'success');
        }
        if (data.suggestions && data.suggestions.length > 0) {
          setTimeout(() => setShowSuggestions(true), 500) /* SUGGESTION_DELAY_MS */;
        }
      } else {
        addBot('Waduh sistem Jeklin lagi sibuk kak, coba beberapa saat lagi ya!');
      }
    } catch {
      addBot('Waduh Jeklin lagi sibuk nih, coba beberapa saat lagi ya!');
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleDocUpload = (type: string, file: File | null) => {
    if (!file) return;
    setDocs(prev => ({ ...prev, [type]: file }));
    setDocStatus(prev => ({ ...prev, [type]: file.name }));
    if (type === 'foto' && file.type.startsWith('image/')) {
      setFotoPreview(URL.createObjectURL(file));
    }
  };

  /** C03 parity (pola MasterFullForm.gateLogin): login kandidat via loginKandidat. */
  const gateLogin = async () => {
    const wa = gateWa.trim();
    const vg = validate(kandidatLoginSchema, { wa, password: gatePass });
    if (!vg.success) { setGateMsg(vg.errors[0]); return; }
    try {
      const res = await fetch(getEndpoint('loginKandidat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'loginKandidat', payload: [{ wa, password: gatePass }] }),
      });
      if (res.ok) {
        const d = await res.json();
        authStore.set({ ...authStore.get(), sessionToken: d.sessionToken || d.token || '', wa, name: d.user || 'kandidat', isLoggedIn: true, role: 'kandidat', lastChecked: Date.now() });
        setCv(prev => ({ ...prev, hp: prev.hp || wa }));
        setLoginGate(false);
      } else {
        setGateMsg('Password salah atau akun tidak ditemukan.');
      }
    } catch { setGateMsg('Error koneksi.'); }
  };

  const saveToDatabase = async () => {
    // AI2/AI3 parity (2026-09-04): legacy ai_form uploads docs to Cloudinary
    // first, then posts a flat JSON object to submitDataAsj (nested
    // ai_data_json sections). The old code sent raw FormData to
    // /ai-form-submit, which the JSON dispatcher no-ops (false-success toast
    // — nothing was saved).
    // C03 guard: tanpa sesi, buka gate login (bukan apiClient yang redirect ke
    // '/' dan menghapus seluruh CV). Sesi expired di tengah jalan ditangani
    // guard yang sama pada klik berikutnya.
    const auth = authStore.get();
    if (!auth.sessionToken || !auth.isLoggedIn) {
      setGateWa(cv.hp || waFromUrl() || auth.wa);
      setLoginGate(true);
      return;
    }
    if (!cv.hp) { showToast('Nomor WA belum diisi.', 'error'); return; }
    const vw = validate(waSchema, cv.hp);
    if (!vw.success) { showToast(vw.errors[0], 'error'); return; }
    try {
      let fileUrls: Record<string, string>;
      try {
        fileUrls = await uploadMany(docs, AI_FILE_COLUMNS);
      } catch (ue) {
        const ue2 = ue as UploadCollectionError;
        showToast('Gagal upload ' + (docStatus[ue2.key] || ue2.key) + ': ' + ue2.message, 'error');
        return;
      }
      const payload = {
        context: { wa: cv.hp },
        identitas: {
          nama_lengkap: cv.nama, katakana: cv.katakana, panggilan: cv.panggilan,
          panggilan_katakana: cv.panggilan_katakana, tempat_lahir: cv.tmplahir,
          tgl_lahir: cv.tgllahir, umur: cv.umur, gender: cv.gender, agama: cv.agama,
          golongan_darah: cv.goldar, status_nikah: cv.status, anak: cv.anak,
          email: cv.email, alamat: cv.alamat, hp: cv.hp, hp_darurat: cv.hpdarurat,
          ktp: cv.ktp, paspor: cv.paspor, sim: cv.sim,
          status_eks_jepang: cv.riwayatjepang,
        },
        fisik: { tb: cv.tb, bb: cv.bb, tangan_dominan: cv.tangan, sepatu: cv.sepatu, baju: cv.baju, topi: cv.topi, tahan_ac: cv.tahan_ac },
        medis: {
          mata_kiri: cv.matakiri, mata_kanan: cv.matakanan, kacamata: cv.kacamata,
          buta_warna: cv.butawarna, tato: cv.tato, rokok: cv.rokok, alkohol: cv.alkohol,
          alergi_id: cv.alergi_id, alergi_jp: cv.alergi_jp,
          riwayat_medis_id: cv.medis_id, riwayat_medis_jp: cv.medis_jp,
          riwayat_kecelakaan_id: cv.laka_id, riwayat_kecelakaan_jp: cv.laka_jp,
        },
        wawancara: {
          promosi_id: cv.promo_id, promosi_jp: cv.promo_jp,
          kelebihan_id: cv.lebih_id, kelebihan_jp: cv.lebih_jp,
          kekurangan_id: cv.kurang_id, kekurangan_jp: cv.kurang_jp,
          hobi_id: cv.hobi_id, hobi_jp: cv.hobi_jp,
          keahlian_khusus: cv.keahlian_id, keahlian_khusus_jp: cv.keahlian_jp,
          motivasi_ke_jepang: cv.moti_id, motivasi_ke_jepang_jp: cv.moti_jp,
          alasan_memilih_bidang: cv.alasan_id, alasan_memilih_bidang_jp: cv.alasan_jp,
          rencana_setelah_pulang: cv.pulang_id, rencana_setelah_pulang_jp: cv.pulang_jp,
          keinginan_pribadi: cv.keinginan_id, keinginan_pribadi_jp: cv.keinginan_jp,
          tujuan_ke_jepang: cv.tujuan_id, tujuan_ke_jepang_jp: cv.tujuan_jp,
          riwayat_jepang: cv.riwayatjepang, gaji_yen: cv.gaji_yen, tabungan: cv.tabungan,
        },
        sertifikasi: { bahasa: cv.bhs_jepang, jft: cv.nilai, ssw: cv.lisensi, bidang: cv.lisensi },
        kenalan_jepang: {
          nama_id: cv.kenalan_nama_id, nama_jp: cv.kenalan_nama_jp,
          hubungan_id: cv.kenalan_hub_id, hubungan_jp: cv.kenalan_hub_jp,
          pekerjaan_id: cv.kenalan_kerja_id, pekerjaan_jp: cv.kenalan_kerja_jp,
          usia: cv.kenalan_usia,
          alamat_id: cv.kenalan_alamat_id, alamat_jp: cv.kenalan_alamat_jp,
        },
        ...fileUrls,
      };
      const data2 = await apiClient('submitDataAsj', [payload]);
      if (data2.success) {
        showToast(t('toast.saved'), 'success');
      } else {
        showToast((data2.message || data2.error || 'Gagal menyimpan.') as string, 'error');
      }
    } catch (e) {
      const msg = (e as Error).message;
      if (msg !== 'No valid session' && msg !== 'Session expired') {
        showToast('Error: ' + msg, 'error');
      }
    }
  };

  const updateCv = (field: string, value: string) => setCv(prev => ({ ...prev, [field]: value }));

  if (loginGate) {
    return (
      <div class="fixed inset-0 u-modal-shell z-50 bg-black/85 flex items-center justify-center p-4">
        <div class="bg-[#0b1220] border border-amber-500/30 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
          <div class="text-center mb-4">
            <div class="text-2xl mb-1 text-amber-400"><Icon name="lock" /></div>
            <div class="font-bold text-white text-sm">{t("ai_cv.verify_account")}</div>
            <div class="text-slate-400 text-xs mt-1">{t("ai_cv.login_required_desc")}</div>
          </div>
          <label class="label">{t("login.wa_label")}</label>
          <input type="tel" class="input" value={gateWa} placeholder="08xxxxxxxxxx"
            onInput={(e) => setGateWa((e.target as HTMLInputElement).value)} />
          <label class="label mt-3">{t("form.mf_password")}</label>
          <input type="password" class="input" value={gatePass} placeholder="••••••••"
            onInput={(e) => setGatePass((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => { if ((e as KeyboardEvent).key === 'Enter') gateLogin(); }} />
          <button onClick={gateLogin} class="w-full mt-3 bg-amber-600 hover:bg-amber-500 text-white rounded-xl py-2.5 text-sm font-bold">{t("login.btn_masuk")}</button>
          {gateMsg && <div class="text-rose-400 text-xs text-center mt-2">{gateMsg}</div>}
        </div>
      </div>
    );
  }

  return (
    <div class="flex flex-col md:flex-row h-[calc(100dvh-42px)] w-full relative pt-[42px]" style={{ height: '100dvh' }}>
      {/* Mobile Tab */}
      <div class="md:hidden flex w-full bg-slate-900 border-b border-slate-800 z-50">
        <button onClick={() => setTab('chat')} class={tab === 'chat' ? 'flex-1 py-3 text-xs font-bold bg-amber-600/20 text-amber-400 border-b-2 border-amber-500' : 'flex-1 py-3 text-xs font-bold text-slate-400'}>
          <Icon name="crown" class="mr-2" />{t('form.ai_cv_chat')}
        </button>
        <button onClick={() => setTab('form')} class={tab === 'form' ? 'flex-1 py-3 text-xs font-bold bg-amber-600/20 text-amber-400 border-b-2 border-amber-500' : 'flex-1 py-3 text-xs font-bold text-slate-400'}>
          <Icon name="file-alt" class="mr-2" />{t('form.preview_cv')}
        </button>
      </div>

      {/* Chat Panel */}
      <div class={`${tab === 'chat' ? 'flex' : 'hidden'} md:flex w-full md:w-[35%] h-full md:h-full bg-slate-900 border-r border-slate-800 flex-col z-20`}>
        <div class="p-3 bg-slate-950 border-b border-slate-800 flex items-center gap-3 relative overflow-hidden">
          <div class="absolute -top-4 -right-4 w-16 h-16 bg-amber-500 rounded-full blur-2xl opacity-20"></div>
          <div class="w-10 h-10 rounded-full bg-amber-500 p-0.5 shadow-[0_0_15px_rgba(245,158,11,0.4)] flex-shrink-0">
            <img src={JEKLIN_IMG} alt="Qween Jeklin" class="w-full h-full rounded-full object-cover" />
          </div>
          <div>
            <h2 class="text-sm font-bold text-amber-400">Qween Jeklin</h2>
            <p class="text-[10px] text-slate-400"><span class="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 animate-pulse"></span>{t("ai_cv.hrd_tagline")}</p>
          </div>
        </div>

        <div ref={chatRef} class="flex-1 u-scroll-area p-3 space-y-4 pb-16 md:pb-4">
          {messages.map((msg, i) => (
            <div key={i} class={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} fade-in`}>
              {msg.role === 'assistant' && (
                <img src={JEKLIN_IMG} alt="Jeklin" class="w-8 h-8 rounded-full object-cover shadow-sm border border-amber-400 flex-shrink-0 mt-1" />
              )}
              <div class={`${msg.role === 'user' ? 'bg-sky-600 text-white rounded-tr-none' : 'bg-slate-800 text-slate-200 border border-amber-500/20 rounded-tl-none'} rounded-2xl px-4 py-2.5 max-w-[80%] shadow-md`}>
                <p class="text-xs leading-relaxed whitespace-pre-wrap m-0" dangerouslySetInnerHTML={{ __html: sanitizeAiHtml(msg.text).replace(/\*\*(.*?)\*\*/g, '<b>$1</b>') }}></p>
                <p class={`text-[9px] mt-1 ${msg.role === 'user' ? 'text-sky-200' : 'text-slate-500'}`}>{msg.time}</p>
              </div>
            </div>
          ))}
          {sending && (
            <div class="flex items-start gap-3 fade-in">
              <img src={JEKLIN_IMG} alt="Jeklin" class="w-8 h-8 rounded-full object-cover shadow-sm border border-amber-400 flex-shrink-0" />
              <div class="bg-slate-800 p-3.5 rounded-2xl rounded-tl-none shadow-md border border-amber-500/20 flex gap-1.5 items-center h-10" style={{ width: 'fit-content' }}>
                <div class="w-2 h-2 bg-amber-500/80 rounded-full animate-bounce"></div>
                <div class="w-2 h-2 bg-amber-500/80 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }}></div>
                <div class="w-2 h-2 bg-amber-500/80 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></div>
              </div>
            </div>
          )}
        </div>

        {/* Suggestion Pills */}
        {showSuggestions && !sending && (
          <div class="px-3 pb-2 flex gap-2 u-scroll-x flex-nowrap scrollbar-hide">
            {SUGGESTIONS.map((s, i) => (
              <button key={i} onClick={() => handleSend(s)}
                class="whitespace-nowrap px-4 py-2 bg-slate-800 hover:bg-slate-700 text-amber-400 text-xs rounded-full transition-colors font-medium border border-slate-700 flex-shrink-0 shadow-sm">
                {s}
              </button>
            ))}
          </div>
        )}

        <div class="p-3 bg-slate-950 border-t border-slate-800 flex gap-2">
          <input ref={inputRef} type="text" value={input}
            onInput={(e) => setInput((e.target as HTMLInputElement).value)}
            onKeyDown={handleKeyDown}
            class="flex-1 bg-slate-800 text-xs text-white px-4 py-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-amber-500 transition-colors"
            placeholder={t('form.placeholder_chat')} />
          <button onClick={() => handleSend()} disabled={sending}
            class="bg-amber-600 hover:bg-amber-500 text-white px-4 py-2.5 rounded-xl transition shadow-[0_4px_10px_0_rgba(245,158,11,0.3)] disabled:opacity-50">
            <Icon name="paper-plane" />
          </button>
        </div>
      </div>

      {/* Form Panel */}
      <main class={`${tab === 'form' ? 'flex' : 'hidden'} md:flex w-full md:w-[65%] h-[calc(100vh-42px)] md:h-full u-scroll-area bg-slate-950 p-3 md:p-6`}>
        <div class="max-w-5xl mx-auto pb-20 w-full">
          <div class="flex justify-between items-center mb-4 bg-slate-900/50 p-3 rounded-xl border border-slate-800">
            <div class="flex items-center gap-3">
              <img src="https://gdwvffmevwtwnzrapjwy.supabase.co/storage/v1/object/public/asj-files/assets/logo_asj.png" alt="ASJ" class="h-8 md:h-10 object-contain" />
              <div>
                <h1 class="text-sm md:text-base font-black text-white">{t("form.preview_cv")}</h1>
                <p class="text-[10px] md:text-[11px] text-slate-400">{t('form.cv_edit_hint')}</p>
              </div>
            </div>
            <div class="flex gap-2">
              <button onClick={saveToDatabase} class="bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] md:text-xs font-bold px-4 py-2 rounded-lg transition shadow-lg flex items-center gap-2">
                <Icon name="cloud-upload-alt" />{t('button.save_db')}
              </button>
              <button onClick={() => toggleLang()} class="bg-sky-600 hover:bg-sky-500 text-white text-[10px] md:text-xs font-bold px-3 py-2 rounded-lg transition shadow-lg">
                <Icon name="language" class="mr-1" />{lang === 'id' ? 'ID' : 'JP'}
              </button>
            </div>
          </div>

          {sending && (
            <div class="text-[10px] text-amber-400 font-bold mb-3 bg-amber-900/20 p-2 rounded border border-amber-500/20 flex items-center">
              <Icon spin name="magic" class="mr-2" />{t('form.ai_analyzing')}
            </div>
          )}

          <Section title={t("ai_cv.sec_identitas")} icon="fa-address-card" color="sky">
            <div class="grid grid-cols-2 md:grid-cols-5 gap-2">
              <Field label={t("cv.field_nama")} id="nama" value={cv.nama} span={2} readonly />
              <Field label={t("form.mf_furigana")} id="katakana" value={cv.katakana} span={2} jp />
              <Field label={t("form.mf_panggilan")} id="panggilan" value={cv.panggilan} readonly />
              <Field label={t("form.mf_panggilan_ktk")} id="panggilan_katakana" value={cv.panggilan_katakana} jp />
              <Field label={t("cv.field_tmp_lahir")} id="tmplahir" value={cv.tmplahir} readonly />
              <Field label={t("cv.field_tgl_lahir")} id="tgllahir" value={cv.tgllahir} readonly />
              <Field label={t("form.mf_usia")} id="umur" value={cv.umur} center readonly />
              <Field label={t("form.mf_gender")} id="gender" value={cv.gender} center readonly />
              <Field label={t("form.mf_agama")} id="agama" value={cv.agama} center readonly />
              <Field label={t("form.mf_goldar")} id="goldar" value={cv.goldar} center readonly />
              <Field label={t("cv.field_status_nikah")} id="status" value={cv.status} center readonly />
              <Field label={t("form.mf_anak")} id="anak" value={cv.anak} center readonly />
              <Field label={t("form.mf_email")} id="email" value={cv.email} span={2} readonly />
              <Field label={t("cv.field_alamat")} id="alamat" value={cv.alamat} span={3} spanMd={3} readonly />
              <Field label={t("form.mf_kontak")} id="hp" value={cv.hp} readonly />
              <Field label={t("form.mf_darurat_wa")} id="hpdarurat" value={cv.hpdarurat} readonly />
              <Field label={t("form.mf_ktp")} id="ktp" value={cv.ktp} span={2} readonly />
              <Field label={t("form.mf_no_paspor")} id="paspor" value={cv.paspor} span={2} readonly />
              <Field label={t("form.mf_sim")} id="sim" value={cv.sim} readonly />
            </div>
          </Section>

          <div class="u-grid-auto u-grid-auto--form gap-3 mb-3">
            <Section title={t("ai_cv.sec_fisik")} icon="fa-child" color="amber">
              <div class="grid grid-cols-3 gap-2">
                <Field label={t("form.mf_tb")} id="tb" value={cv.tb} center readonly />
                <Field label={t("form.mf_bb")} id="bb" value={cv.bb} center readonly />
                <Field label={t("cv.field_tgn_dominan")} id="tangan" value={cv.tangan} center readonly />
                <Field label={t("form.mf_sepatu")} id="sepatu" value={cv.sepatu} center readonly />
                <Field label={t("form.mf_baju")} id="baju" value={cv.baju} center readonly />
                <Field label={t("form.mf_topi")} id="topi" value={cv.topi} center readonly />
                <div class="col-span-3"><Field label={t("cv.field_tahan_ac")} id="tahan_ac" value={cv.tahan_ac} readonly /></div>
              </div>
            </Section>
            <Section title={t("ai_cv.sec_medis")} icon="fa-notes-medical" color="red">
              <div class="grid grid-cols-4 gap-2">
                <Field label={t("cv.field_mata_kanan")} id="matakanan" value={cv.matakanan} center readonly />
                <Field label={t("cv.field_mata_kiri")} id="matakiri" value={cv.matakiri} center readonly />
                <div class="col-span-2"><Field label={t("form.mf_kacamata")} id="kacamata" value={cv.kacamata} center readonly /></div>
                <div class="col-span-2"><Field label={t("cv.field_butawarna")} id="butawarna" value={cv.butawarna} readonly /></div>
                <div class="col-span-2"><Field label={t("form.mf_tato")} id="tato" value={cv.tato} readonly /></div>
                <Field label={t("form.mf_merokok")} id="rokok" value={cv.rokok} center readonly />
                <Field label={t("form.mf_alkohol")} id="alkohol" value={cv.alkohol} center readonly />
              </div>
              <div class="col-span-4 space-y-1 mt-2 p-2 bg-slate-800/40 rounded border border-slate-700/50">
                <div class="grid grid-cols-2 gap-2">
                  <label class="block text-[11px] text-[#e2e8f0]">{t("form.mf_alergi")}</label>
                  <div></div>
                </div>
                <TextAreaPair idId="alergi_id" idJp="alergi_jp" valueId={cv.alergi_id} valueJp={cv.alergi_jp} onChange={updateCv} />
                <div class="grid grid-cols-2 gap-2"><label class="block text-[11px] text-[#e2e8f0]">{t("form.mf_penyakit")}</label><div></div></div>
                <TextAreaPair idId="medis_id" idJp="medis_jp" valueId={cv.medis_id} valueJp={cv.medis_jp} onChange={updateCv} />
                <div class="grid grid-cols-2 gap-2"><label class="block text-[11px] text-[#e2e8f0]">{t("cv.field_laka")}</label><div></div></div>
                <TextAreaPair idId="laka_id" idJp="laka_jp" valueId={cv.laka_id} valueJp={cv.laka_jp} onChange={updateCv} />
              </div>
            </Section>
          </div>

          <Section title={t("ai_cv.sec_jiko")} icon="fa-comments" color="purple" borderLeft>
            <div class="mb-2"><Field label={t("cv.field_riwayat_jp")} id="riwayatjepang" value={cv.riwayatjepang} readonly span={1} /></div>
            <div class="u-grid-auto u-grid-auto--form gap-3">
              <div class="space-y-2">
                <TextAreaPair label={t("cv.field_promo_diri")} idId="promo_id" idJp="promo_jp" valueId={cv.promo_id} valueJp={cv.promo_jp} onChange={updateCv} />
                <TextAreaPair label={t("cv.field_kelebihan")} idId="lebih_id" idJp="lebih_jp" valueId={cv.lebih_id} valueJp={cv.lebih_jp} onChange={updateCv} />
                <TextAreaPair label={t("cv.field_kekurangan")} idId="kurang_id" idJp="kurang_jp" valueId={cv.kurang_id} valueJp={cv.kurang_jp} onChange={updateCv} />
                <TextAreaPair label={t("cv.hobi")} idId="hobi_id" idJp="hobi_jp" valueId={cv.hobi_id} valueJp={cv.hobi_jp} onChange={updateCv} />
                <TextAreaPair label={t("cv.field_keahlian")} idId="keahlian_id" idJp="keahlian_jp" valueId={cv.keahlian_id} valueJp={cv.keahlian_jp} onChange={updateCv} />
              </div>
              <div class="space-y-2">
                <TextAreaPair label={t("cv.motivasi")} idId="moti_id" idJp="moti_jp" valueId={cv.moti_id} valueJp={cv.moti_jp} onChange={updateCv} />
                <TextAreaPair label={t("cv.field_alasan_bidang")} idId="alasan_id" idJp="alasan_jp" valueId={cv.alasan_id} valueJp={cv.alasan_jp} onChange={updateCv} />
                <TextAreaPair label={t("cv.field_rencana_pulang")} idId="pulang_id" idJp="pulang_jp" valueId={cv.pulang_id} valueJp={cv.pulang_jp} onChange={updateCv} />
                <TextAreaPair label={t("cv.field_target_pribadi")} idId="keinginan_id" idJp="keinginan_jp" valueId={cv.keinginan_id} valueJp={cv.keinginan_jp} onChange={updateCv} />
                <TextAreaPair label={t("cv.field_tujuan_jepang")} idId="tujuan_id" idJp="tujuan_jp" valueId={cv.tujuan_id} valueJp={cv.tujuan_jp} onChange={updateCv} />
                <div class="grid grid-cols-3 gap-2">
                  <Field label={t("cv.field_lama_jp")} id="lama" value={cv.lama} center readonly />
                  <Field label={t("cv.field_target_gaji")} id="gaji_yen" value={cv.gaji_yen} center readonly jp />
                  <Field label={t("cv.field_target_nabung")} id="tabungan" value={cv.tabungan} center readonly jp />
                </div>
              </div>
            </div>
          </Section>

          <div class="u-grid-auto u-grid-auto--cards gap-3 mb-3">
            <Section title={t("ai_cv.sec_pendidikan")} icon="fa-graduation-cap" color="emerald">
              <div class="grid grid-cols-3 gap-1.5 p-1.5 bg-slate-800/50 rounded border border-slate-700 mb-2">
                <Field label={t("cv.field_bhs_jepang")} id="bhs_jepang" value={cv.bhs_jepang} readonly />
                <Field label={t("cv.field_nilai_jp")} id="nilai" value={cv.nilai} readonly />
                <Field label={t("cv.field_lisensi_ssw")} id="lisensi" value={cv.lisensi} readonly />
              </div>
              <div class="text-[9px] text-slate-500 italic py-1">{t("ai_cv.dynamic_ai_data")}</div>
            </Section>
            <Section title={t("ai_cv.sec_pekerjaan")} icon="fa-briefcase" color="blue">
              <div class="text-[9px] text-slate-500 italic py-1">{t("ai_cv.dynamic_ai_data")}</div>
            </Section>
            <Section title={t("ai_cv.sec_keluarga")} icon="fa-users" color="orange">
              <div class="text-[9px] text-slate-500 italic py-1">{t("ai_cv.dynamic_ai_data")}</div>
            </Section>
          </div>

          <Section title={t("ai_cv.sec_kenalan")} icon="fa-user-friends" color="pink">
            <div class="u-grid-auto u-grid-auto--dense gap-2">
              <Field label={t("cv.field_kenalan_nama_id")} id="kenalan_nama_id" value={cv.kenalan_nama_id} readonly />
              <Field label={t("cv.field_kenalan_nama_jp")} id="kenalan_nama_jp" value={cv.kenalan_nama_jp} jp readonly />
              <Field label={t("cv.field_kenalan_hub_id")} id="kenalan_hub_id" value={cv.kenalan_hub_id} readonly />
              <Field label={t("cv.field_kenalan_hub_jp")} id="kenalan_hub_jp" value={cv.kenalan_hub_jp} jp readonly />
              <Field label={t("cv.field_kenalan_kerja_id")} id="kenalan_kerja_id" value={cv.kenalan_kerja_id} readonly />
              <Field label={t("cv.field_kenalan_kerja_jp")} id="kenalan_kerja_jp" value={cv.kenalan_kerja_jp} jp readonly />
              <Field label={t("cv.field_kenalan_usia")} id="kenalan_usia" value={cv.kenalan_usia} readonly />
              <div class="col-span-2 md:col-span-4 mt-1 grid grid-cols-2 gap-2">
                <Field label={t("cv.field_kenalan_alamat_id")} id="kenalan_alamat_id" value={cv.kenalan_alamat_id} readonly />
                <Field label={t("cv.field_kenalan_alamat_jp")} id="kenalan_alamat_jp" value={cv.kenalan_alamat_jp} jp readonly />
              </div>
            </div>
          </Section>

          <div class="u-grid-auto u-grid-auto--cards gap-3 mb-3">
            <UploadRow type="foto" label={t("cv.upload_foto")} icon="fa-camera" bg="bg-sky-600" accept="image/*" status={docStatus['foto']} onUpload={handleDocUpload} />
            <UploadRow type="jft" label={t("cv.upload_jft")} icon="fa-file-pdf" bg="bg-amber-600" accept=".pdf" status={docStatus['jft']} onUpload={handleDocUpload} />
            <UploadRow type="ssw" label={t("cv.upload_ssw")} icon="fa-file-signature" bg="bg-emerald-600" accept=".pdf" status={docStatus['ssw']} onUpload={handleDocUpload} />
          </div>
          <div class="u-grid-auto u-grid-auto--cards gap-3">
            <UploadRow type="ktp" label={t("cv.upload_ktp")} icon="fa-id-card" bg="bg-rose-600" accept=".pdf,image/*" status={docStatus['ktp']} onUpload={handleDocUpload} />
            <UploadRow type="kk" label={t("cv.upload_kk")} icon="fa-users" bg="bg-orange-600" accept=".pdf,image/*" status={docStatus['kk']} onUpload={handleDocUpload} />
            <UploadRow type="ijazahSd" label={t("cv.upload_ijazah_sd")} icon="fa-graduation-cap" bg="bg-violet-600" accept=".pdf" status={docStatus['ijazahSd']} onUpload={handleDocUpload} />
            <UploadRow type="ijazahSmp" label={t("cv.upload_ijazah_smp")} icon="fa-graduation-cap" bg="bg-sky-600" accept=".pdf" status={docStatus['ijazahSmp']} onUpload={handleDocUpload} />
            <UploadRow type="ijazahSma" label={t("cv.upload_ijazah_sma")} icon="fa-graduation-cap" bg="bg-teal-600" accept=".pdf" status={docStatus['ijazahSma']} onUpload={handleDocUpload} />
            <UploadRow type="univ" label={t("cv.upload_ijazah_univ")} icon="fa-university" bg="bg-indigo-600" accept=".pdf" status={docStatus['univ']} onUpload={handleDocUpload} />
          </div>
        </div>
      </main>
    </div>
  );
}

/* === Sub-components === */

function Section({ title, icon, color, borderLeft, children }: {
  title: string; icon: string; color: string; borderLeft?: boolean; children: preact.ComponentChildren;
}) {
  return (
    <div class={`bg-slate-900/40 border border-slate-800 rounded-lg p-3 mb-3 shadow ${borderLeft ? 'border-l-2 border-l-purple-500' : ''}`}>
      <h2 class={`text-[13px] font-bold uppercase tracking-wide mb-2 border-b border-slate-800/50 pb-1 text-${color}-400`}>
        <Icon name={icon} class="mr-1" /> {title}
      </h2>
      {children}
    </div>
  );
}

function Field({ label, id, value, readonly, center, jp, span, spanMd }: {
  label: string; id: string; value: string; readonly?: boolean; center?: boolean;
  jp?: boolean; span?: number; spanMd?: number;
}) {
  const spanClass = span === 3 ? 'col-span-3' : span === 2 ? 'col-span-2' : '';
  const mdSpanClass = spanMd === 3 ? 'md:col-span-3' : spanMd === 2 ? 'md:col-span-2' : '';
  return (
    <div class={`${spanClass} ${mdSpanClass}`}>
      <label class="block text-[11px] text-[#e2e8f0] mb-0.5">{label}</label>
      <input type="text" value={value} readonly={readonly}
        class={`w-full bg-slate-800 border border-slate-600 rounded p-1 text-[12px] outline-none ${center ? 'text-center' : ''} ${jp ? 'text-pink-300 font-bold' : 'text-white'}`} />
    </div>
  );
}

/** FIXED: TextAreaPair now reads from cv state + writes via onChange */
function TextAreaPair({ label, idId, idJp, valueId, valueJp, onChange }: {
  label?: string; idId: string; idJp: string; valueId: string; valueJp: string;
  onChange: (field: string, value: string) => void;
}) {
  return (
    <div>
      {label && <label class="block text-[11px] text-[#e2e8f0] mb-0.5">{label}</label>}
      <div class="grid grid-cols-2 gap-2">
        <textarea value={valueId} rows={2}
          onInput={(e) => onChange(idId, (e.target as HTMLTextAreaElement).value)}
          class="w-full bg-slate-800 border border-slate-600 rounded p-1 text-[12px] text-white outline-none resize-none" placeholder="ID..." />
        <textarea value={valueJp} rows={2}
          onInput={(e) => onChange(idJp, (e.target as HTMLTextAreaElement).value)}
          class="w-full bg-slate-800 border border-slate-600 rounded p-1 text-[12px] text-purple-300 font-bold outline-none resize-none" placeholder="JP..." />
      </div>
    </div>
  );
}

function UploadRow({ type, label, icon, bg, accept, status, onUpload }: {
  type: string; label: string; icon: string; bg: string; accept: string; status?: string;
  onUpload?: (type: string, file: File | null) => void;
}) {
  return (
    <div class="bg-slate-900/60 border border-slate-700 p-3 rounded-lg shadow flex items-center gap-3">
      <div class={`w-10 h-10 rounded ${bg} flex items-center justify-center text-white text-lg flex-shrink-0`}>
        <Icon name={icon} />
      </div>
      <div class="flex-1 overflow-hidden">
        <div class="flex items-center gap-2">
          <label class="block text-xs font-bold text-white mb-0.5">{label}</label>
          {status && <span class="text-[9px] text-emerald-400 font-medium"><Icon name="check" class="mr-0.5" />{status}</span>}
        </div>
        <input type="file" accept={accept}
          onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0] || null; onUpload?.(type, f); }}
          class="w-full text-[9px] text-slate-400 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-slate-800 file:text-white cursor-pointer" />
      </div>
    </div>
  );
}
