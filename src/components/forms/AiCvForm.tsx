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
import { aiCvAccessRedirect } from '../../lib/vip';
import { validate, waSchema, kandidatLoginSchema } from '../../lib/schemas';

import type { ChatMessage } from '../../types/api';
import Icon from '../ui/Icon';
import AiUnavailableBanner from '../ui/AiUnavailableBanner';
import { getEndpoint } from '../../lib/apiEndpoint';
import { uploadMany, UploadCollectionError } from '../../lib/cloudinary';
import { AI_FILE_COLUMNS } from '../../lib/documentColumns';
import { AI_CV_FLAT_KEYS, parseAiCvDraft } from '../../lib/aiCvDraft';
import { useOverlay } from '../ui/useOverlay';

interface CvData {
  nama: string; katakana: string; panggilan: string; panggilan_katakana: string;
  tmplahir: string; tgllahir: string; umur: string; gender: string; agama: string;
  goldar: string; status: string; anak: string; email: string; alamat: string;
  hp: string; hpdarurat: string; ktp: string; paspor: string; sim: string;
  paspor_status: string; sim_status: string;
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

const CV_FIELDS = AI_CV_FLAT_KEYS;

const EMPTY_CV: CvData = Object.fromEntries(CV_FIELDS.map(k => [k, ''])) as CvData;

const SUGGESTIONS = [
  'Perkenalkan diriku',
  'Isi data pendidikan',
  'Terjemahkan semua kolom ke JP',
  'Lengkapi data keluarga',
  'Isi pengalaman kerja',
  'Lengkapi data wawancara',
];

/* ── Satuan di dalam field ──────────────────────────────────────────────
   PARITY ai_form.html:135,159,160,215,216,282 — legacy menempelkan satuan
   DI DALAM field (span absolut di kanan), bukan di label: `170 cm` tetap
   terbaca sebagai angka bersatuan, dan lebar kolom tidak ikut melar.
   Tidak diterjemahkan: legacy pun menampilkannya sama di kedua bahasa. */
type Unit = 'thn' | 'cm' | 'kg' | 'yen';

/* ── Warna aksen per seksi ──────────────────────────────────────────────
   Peta kelas EKSPLISIT. Sebelumnya `text-${color}-400` (template literal):
   Tailwind v4 hanya meng-emit utility yang literalnya terlihat di sumber,
   jadi kelas itu hanya ikut ter-build karena kebetulan ada file lain yang
   memuat string yang sama. Tambah warna di sini, bukan di pemanggil. */
const SECTION_COLORS: Record<string, string> = {
  sky: 'text-sky-400',
  amber: 'text-amber-400',
  red: 'text-red-400',
  purple: 'text-purple-400',
  emerald: 'text-emerald-400',
  blue: 'text-blue-400',
  orange: 'text-orange-400',
  pink: 'text-pink-400',
};

/* ── Warna aksen baris unggahan ─────────────────────────────────────────
   PARITY ai_form.html:294-370 — tiap baris punya warnanya sendiri, dan
   label memakai nada -400 dari warna tile -600-nya (foto sky, JFT amber,
   SSW emerald, KTP rose, KK orange, dst). Pasangan tile+label ditulis
   sebagai literal supaya Tailwind benar-benar meng-emit keduanya, dan
   supaya tidak ada jalan bagi keduanya untuk diam-diam berbeda. */
type UploadColor = 'sky' | 'amber' | 'emerald' | 'rose' | 'orange' | 'violet' | 'teal' | 'indigo';
const UPLOAD_COLORS: Record<UploadColor, { tile: string; label: string }> = {
  sky: { tile: 'bg-sky-600', label: 'text-sky-400' },
  amber: { tile: 'bg-amber-600', label: 'text-amber-400' },
  emerald: { tile: 'bg-emerald-600', label: 'text-emerald-400' },
  rose: { tile: 'bg-rose-600', label: 'text-rose-400' },
  orange: { tile: 'bg-orange-600', label: 'text-orange-400' },
  violet: { tile: 'bg-violet-600', label: 'text-violet-400' },
  teal: { tile: 'bg-teal-600', label: 'text-teal-400' },
  indigo: { tile: 'bg-indigo-600', label: 'text-indigo-400' },
};

/* ── Datalist (autocomplete) ────────────────────────────────────────────
   PARITY ai_form.html:227-245 — field bahasa Jepang & lisensi tetap
   `readonly` (isinya datang dari AI), tapi `list=` memberi kandidat daftar
   nilai resmi yang sah. Tanpa ini ejaan bebas kandidat masuk apa adanya. */
const JFT_OPTIONS = ['N1', 'N2', 'N3', 'N4', 'N5', 'JFT BASIC A2', 'BELUM LULUS', 'BELUM TES'];
const SSW_OPTIONS = [
  'KAIGO', 'BUILDING CLEANING', 'FOUNDRY & PLASTIC', 'INDUSTRIAL MACHINERY',
  'ELECTRIC & ELECTRONIC', 'CONSTRUCTION', 'SHIPBUILDING', 'AUTOMOBILE REPAIR',
  'AVIATION', 'ACCOMMODATION', 'AGRICULTURE', 'FISHERY', 'FOOD & BEVERAGE',
  'RESTAURANT', 'FORESTRY', 'WOOD INDUSTRY',
];

/* Field lain yang jawabannya pasti (enum), jadi diberi datalist juga.
   Datalist dipakai (bukan <select>) karena field-field ini `readonly` —
   isinya datang dari AI, jadi yang dibutuhkan adalah saran ejaan yang sah,
   bukan pemaksa pilihan.
   CATATAN (2026-09-14): dulu di sini ada `ai_pekerjaan_options` /
   `ai_jurusan_options` / `ai_hubungan_options` yang mengimpor PEKERJAAN,
   JURUSAN, dan HUBUNGAN_KELUARGA dari lib/opsi-form.ts. Ketiganya DIHAPUS:
   bagian pendidikan/pekerjaan/keluarga di form ini masih placeholder
   (`ai_cv.dynamic_ai_data`) sehingga tidak ada satu pun field yang menunjuk
   ke sana — datalist tanpa `list=` adalah markup mati yang tampak benar di
   diff. `AiCvForm.test.tsx` sekarang menolak datalist yatim, jadi kalau
   baris dinamis itu kelak punya field sungguhan, tambahkan datalist-nya
   bersama field-nya, bukan lebih dulu. */
const GENDER_OPTIONS = ['LAKI-LAKI', 'PEREMPUAN'];
const AGAMA_OPTIONS = ['ISLAM', 'KRISTEN', 'KATOLIK', 'HINDU', 'BUDDHA', 'KONGHUCU', 'LAINNYA'];
const GOLDAR_OPTIONS = ['A', 'B', 'AB', 'O', '-'];
const STATUS_NIKAH_OPTIONS = ['BELUM MENIKAH', 'MENIKAH', 'CERAI'];
const TANGAN_OPTIONS = ['KANAN', 'KIRI'];
const YA_TIDAK = ['YA', 'TIDAK'];
const EKS_JEPANG_OPTIONS = ['BELUM PERNAH', 'EKS MAGANG', 'EKS TOKUTEI GINO'];

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

/**
 * P2 (2026-09-14): dipakai dua cara.
 *  - Kandidat  : `<AiCvForm />` di /ai-cv — perilaku lama, tanpa props.
 *  - Admin     : `<AiCvForm waTarget={k.wa} adminMode />` dari tab Pelamar —
 *                gate login dilewati dan draf CV kandidat dimuat dulu.
 */
interface AiCvFormProps {
  /** WA kandidat yang CV-nya dibuka (mode admin). */
  waTarget?: string;
  /** Lewati gate login; backend sudah memberi admin akses ke WA mana pun. */
  adminMode?: boolean;
}

export default function AiCvForm({ waTarget, adminMode }: AiCvFormProps = {}) {
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
  const [loadingDraft, setLoadingDraft] = useState(!!waTarget);
  // §6.5 row 3: set when the backend answers `code: 'AI_UNAVAILABLE'`.
  const [aiDown, setAiDown] = useState<string | null>(null);
  // C03 (2026-09-05): login gate pola MasterFullForm — backend minta sesi untuk
  // chat (processAIChat H4) DAN simpan (submitDataAsj); apiClient tanpa sesi
  // redirect ke '/' → seluruh state CV hilang. Gate saat mount + guard di
  // saveToDatabase supaya sesi yang hilang tidak pernah drop CV diam-diam.
  //
  // P2 (2026-09-14): saat dipasang sebagai panel admin (tab Pelamar), gate-nya
  // DILEWATI. Backend sudah mengizinkan admin: `isOwnerOrAdmin()` benar untuk
  // `role:'admin'` di WA mana pun, dan `submitDataAsj` menerima sesi admin.
  // Yang kurang cuma UI-nya — kandidat sering salah isi, admin yang membetulkan.
  const [loginGate, setLoginGate] = useState(() => {
    if (adminMode) return false;
    const a = authStore.get();
    return !a.sessionToken || !a.isLoggedIn;
  });
  const [gateWa, setGateWa] = useState(waFromUrl);
  const [gatePass, setGatePass] = useState('');
  const [gateMsg, setGateMsg] = useState('');
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // §4.1(a) — this is a modal WALL, not a dismissible dialog: the state is
  // cleared only by a successful `gateLogin()`, and the form behind it is not
  // rendered at all (early return below). So it takes the dialog semantics and
  // the Tab trap, but NOT the two dismissal routes the hook offers by default
  // — there is no "close" for this overlay to mean, and inventing one would be
  // a silent behaviour change. It carries no <h1>-<h6> (its title is a styled
  // <div>), so the accessible name has to come from `label`.
  const gateOverlay = useOverlay({
    open: loginGate,
    onClose: () => {},
    closeOnEscape: false,
    closeOnBackdrop: false,
    label: t('ai_cv.verify_account'),
  });

  const now = () => new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

  useEffect(() => {
    setMessages([{ role: 'assistant',
      text: t('ai_cv.bot_greeting'),
      time: now() }]);
    setShowSuggestions(true);
  }, []);

  // P2 (2026-09-14): mode admin memuat draf CV kandidat lebih dulu.
  // `getDrafCvMaster` mengembalikan bentuk bersarang + `AIDATAJSON` mentah;
  // `parseAiCvDraft` mem-parse, deep-merge (AI menang), lalu memetakan ke kunci
  // flat. Tanpa langkah ini admin melihat form KOSONG dan menekan Simpan —
  // yang akan menghapus CV kandidat, persis kebalikan dari yang diminta.
  useEffect(() => {
    if (!waTarget) return;
    let alive = true;
    (async () => {
      try {
        const res = await apiClient<Record<string, unknown>>('getDrafCvMaster', [waTarget]);
        if (!alive) return;
        const loaded = parseAiCvDraft(res);
        if (Object.keys(loaded).length === 0 && typeof res?.error === 'string') {
          showToast(String(res.error), 'error');
        }
        // hp = WA kandidat; kalau master belum punya no_wa, pakai target supaya
        // payload simpan tetap membawa nomor yang benar.
        setCv(prev => ({ ...prev, ...loaded, hp: loaded.hp || prev.hp || waTarget }));
      } catch (e) {
        if (alive) showToast('Gagal memuat draf CV: ' + (e as Error).message, 'error');
      } finally {
        if (alive) setLoadingDraft(false);
      }
    })();
    return () => { alive = false; };
  }, [waTarget]);

  // §6 parity verifikasiAksesAiCv() (legacy js/pages/ai_form.ts:771): halaman AI
  // CV (flow=master) khusus Siswa ASJ. Kandidat non-siswa yang membuka URL-nya
  // langsung diarahkan ke Form Master Lengkap — bukan sekadar ditolak server.
  //
  // Tiga aturan legacy dipertahankan (semuanya soal menghindari loop reload /
  // logout admin): admin (adminMode) lewat; tanpa sesi kandidat valid → JANGAN
  // panggil getAppData (apiClient melakukan logout+redirect ke '/' saat
  // sessionInvalid → loop tanpa akhir); gagal jaringan → jangan blokir.
  useEffect(() => {
    if (adminMode) return;
    const a = authStore.get();
    if (!a.isLoggedIn || a.role !== 'kandidat' || !a.sessionToken) return;
    const wa = a.wa || waFromUrl();
    if (!wa) return;
    let alive = true;
    (async () => {
      try {
        const res = await apiClient<Record<string, unknown>>('getAppData', ['kandidat', wa]);
        if (!alive || !res) return;
        if (res.sessionInvalid) return; // tak bisa diverifikasi → jangan redirect
        const cand = Array.isArray((res as { candidates?: unknown }).candidates)
          ? ((res as { candidates: Record<string, unknown>[] }).candidates[0] ?? null)
          : null;
        const my = (res as { myData?: Record<string, unknown> }).myData;
        // Bentuk respons tak dikenal (tak ada candidates[] maupun myData) →
        // jangan redirect: kita tidak bisa memverifikasi, dan legacy pun
        // fail-open pada keadaan yang tak bisa diverifikasi.
        if (!cand && !my) return;
        let catatan = cand ? String(cand.catatanInt || cand.catatan || '') : '';
        if (!catatan && my) catatan = String(my.catatanInt || '');
        const redirect = aiCvAccessRedirect(catatan, wa, a.name);
        if (redirect) window.location.href = redirect;
      } catch { /* gagal jaringan → jangan blokir (fallback aman legacy) */ }
    })();
    return () => { alive = false; };
  }, [adminMode]);

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
      // Read the body even on a non-2xx: an AI outage answers 503 with the
      // friendly copy in `reply` plus `code: 'AI_UNAVAILABLE'` (§6.5 row 3).
      let data: any = null;
      try { data = await res.json(); } catch { /* non-JSON error body */ }
      const aiUnavailable = !!(data && data.code === 'AI_UNAVAILABLE');
      setAiDown(aiUnavailable ? String(data.error || data.reply || '') || null : null);
      // §6 parity: server menolak VIP dengan { success:false, error } TANPA
      // `reply` (chat.ts flow=master). Dulu itu jatuh ke copy generik "Jeklin
      // sibuk" → user tidak tahu kenapa ditolak. `reply` tetap prioritas
      // (AI_UNAVAILABLE mengirim copy ramah di sana); `error` jadi cadangan.
      addBot(String(data?.reply || data?.error || '') || 'Waduh sistem Jeklin lagi sibuk kak, coba beberapa saat lagi ya!');
      if (res.ok && !aiUnavailable) {
        if (data.cvData) {
          setCv(prev => ({ ...prev, ...data.cvData }));
          showToast(t('toast.saved'), 'success');
        }
        if (data.suggestions && data.suggestions.length > 0) {
          setTimeout(() => setShowSuggestions(true), 500) /* SUGGESTION_DELAY_MS */;
        }
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
    if (!adminMode && (!auth.sessionToken || !auth.isLoggedIn)) {
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
          // Legacy menyimpan status paspor/SIM di identitas.* (ai_form.ts
          // enableSimPasporConditional). Tanpa ini jawaban "TIDAK ADA" hilang:
          // kolom nomor cuma kosong, tanpa penanda kandidat memang tidak punya.
          paspor_status: cv.paspor_status || (cv.paspor ? 'ADA' : ''),
          sim_status: cv.sim_status || (cv.sim ? 'ADA' : ''),
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
      <div ref={gateOverlay.containerRef} class="fixed inset-0 u-modal-shell z-50 bg-black/85 flex items-center justify-center p-4">
        <div class="bg-[#0b1220] border border-amber-500/30 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
          <div class="text-center mb-4">
            <div class="text-2xl mb-1 text-amber-400"><Icon name="lock" /></div>
            <div class="font-bold text-white text-sm">{t("ai_cv.verify_account")}</div>
            <div class="text-slate-400 text-xs mt-1">{t("ai_cv.login_required_desc")}</div>
          </div>
          <label for="ai-gate-wa" class="label">{t("login.wa_label")}</label>
          <input id="ai-gate-wa" type="tel" class="input" value={gateWa} placeholder="08xxxxxxxxxx"
            onInput={(e) => setGateWa((e.target as HTMLInputElement).value)} />
          <label for="ai-gate-pass" class="label mt-3">{t("form.mf_password")}</label>
          <input id="ai-gate-pass" type="password" class="input" value={gatePass} placeholder="••••••••"
            onInput={(e) => setGatePass((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => { if ((e as KeyboardEvent).key === 'Enter') gateLogin(); }} />
          <button onClick={gateLogin} class="w-full mt-3 bg-amber-600 hover:bg-amber-500 text-white rounded-xl py-2.5 text-sm font-bold">{t("login.btn_masuk")}</button>
          {gateMsg && <div class="text-rose-400 text-xs text-center mt-2">{gateMsg}</div>}
        </div>
      </div>
    );
  }

  // P2: menahan form sampai draf kandidat selesai dimuat. Tanpa ini admin bisa
  // menekan Simpan di atas form yang masih kosong — dan menghapus CV kandidat.
  if (loadingDraft) {
    return (
      // §4.1(a) — a wait screen, not a dialog: the correct semantics is a
      // live region, and trapping focus in a screen with nothing to act on
      // would be worse than leaving it free. Same treatment MasterFullForm
      // already uses for its "Menyinkronkan Data…" overlay.
      <div class="fixed inset-0 u-modal-shell z-50 bg-black/85 flex items-center justify-center p-4" role="status" aria-live="polite">
        <div class="text-center">
          <div class="text-2xl mb-2 text-amber-400"><Icon spin name="spinner" /></div>
          <div class="text-slate-300 text-xs font-bold">{t("ai_cv.loading_draft")}</div>
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

        {aiDown && (
          <div class="p-3 shrink-0">
            <AiUnavailableBanner message={aiDown} />
          </div>
        )}

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
                {/* h2, not h1: the page h1 is the FormToolbar title. /ai-cv had
                    NO h1 at all before this (§23) — this panel heading was it,
                    and it only appears once the CV preview panel is open. */}
                <h2 class="text-sm md:text-base font-black text-white">{t("form.preview_cv")}</h2>
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
              {/* PARITY ai_form.html:134 — legacy `type="date"` (date picker),
                  bukan teks bebas. */}
              <Field label={t("cv.field_tgl_lahir")} id="tgllahir" value={cv.tgllahir} readonly type="date" />
              <Field label={t("form.mf_usia")} id="umur" value={cv.umur} center readonly unit="thn" />
              <Field label={t("form.mf_gender")} id="gender" value={cv.gender} center readonly list="ai_gender_options" />
              <Field label={t("form.mf_agama")} id="agama" value={cv.agama} center readonly list="ai_agama_options" />
              <Field label={t("form.mf_goldar")} id="goldar" value={cv.goldar} center readonly list="ai_goldar_options" />
              <Field label={t("cv.field_status_nikah")} id="status" value={cv.status} center readonly list="ai_status_nikah_options" />
              <Field label={t("form.mf_anak")} id="anak" value={cv.anak} center readonly />
              <Field label={t("form.mf_email")} id="email" value={cv.email} span={2} readonly />
              <Field label={t("cv.field_alamat")} id="alamat" value={cv.alamat} span={3} spanMd={3} readonly />
              <Field label={t("form.mf_kontak")} id="hp" value={cv.hp} readonly />
              <Field label={t("form.mf_darurat_wa")} id="hpdarurat" value={cv.hpdarurat} readonly />
              <Field label={t("form.mf_ktp")} id="ktp" value={cv.ktp} span={2} readonly />
              <StatusNumber label={t("form.mf_no_paspor")} statusLabel={t("form.mf_paspor_status")}
                status={cv.paspor_status} value={cv.paspor} statusKey="paspor_status" valueKey="paspor"
                ph={t("form.mf_ph_no_paspor")} basis="38%" span={2} onChange={updateCv} />
              <StatusNumber label={t("form.mf_sim")} statusLabel={t("form.mf_sim_status")}
                status={cv.sim_status} value={cv.sim} statusKey="sim_status" valueKey="sim"
                ph={t("form.mf_ph_no_sim")} basis="42%" onChange={updateCv} />
            </div>
            <datalist id="ai_gender_options">{GENDER_OPTIONS.map(o => <option key={o} value={o} />)}</datalist>
            <datalist id="ai_agama_options">{AGAMA_OPTIONS.map(o => <option key={o} value={o} />)}</datalist>
            <datalist id="ai_goldar_options">{GOLDAR_OPTIONS.map(o => <option key={o} value={o} />)}</datalist>
            <datalist id="ai_status_nikah_options">{STATUS_NIKAH_OPTIONS.map(o => <option key={o} value={o} />)}</datalist>
            <datalist id="ai_tangan_options">{TANGAN_OPTIONS.map(o => <option key={o} value={o} />)}</datalist>
            <datalist id="ai_ya_tidak_options">{YA_TIDAK.map(o => <option key={o} value={o} />)}</datalist>
            <datalist id="ai_eks_jepang_options">{EKS_JEPANG_OPTIONS.map(o => <option key={o} value={o} />)}</datalist>
          </Section>

          <div class="u-grid-auto u-grid-auto--form gap-3 mb-3">
            <Section title={t("ai_cv.sec_fisik")} icon="fa-child" color="amber">
              <div class="grid grid-cols-3 gap-2">
                <Field label={t("form.mf_tb")} id="tb" value={cv.tb} center readonly unit="cm" />
                <Field label={t("form.mf_bb")} id="bb" value={cv.bb} center readonly unit="kg" />
                <Field label={t("cv.field_tgn_dominan")} id="tangan" value={cv.tangan} center readonly list="ai_tangan_options" />
                <Field label={t("form.mf_sepatu")} id="sepatu" value={cv.sepatu} center readonly />
                <Field label={t("form.mf_baju")} id="baju" value={cv.baju} center readonly />
                <Field label={t("form.mf_topi")} id="topi" value={cv.topi} center readonly />
                <div class="col-span-3"><Field label={t("cv.field_tahan_ac")} id="tahan_ac" value={cv.tahan_ac} readonly list="ai_ya_tidak_options" /></div>
              </div>
            </Section>
            <Section title={t("ai_cv.sec_medis")} icon="fa-notes-medical" color="red">
              <div class="grid grid-cols-4 gap-2">
                <Field label={t("cv.field_mata_kanan")} id="matakanan" value={cv.matakanan} center readonly />
                <Field label={t("cv.field_mata_kiri")} id="matakiri" value={cv.matakiri} center readonly />
                <div class="col-span-2"><Field label={t("form.mf_kacamata")} id="kacamata" value={cv.kacamata} center readonly list="ai_ya_tidak_options" /></div>
                <div class="col-span-2"><Field label={t("cv.field_butawarna")} id="butawarna" value={cv.butawarna} readonly list="ai_ya_tidak_options" /></div>
                <div class="col-span-2"><Field label={t("form.mf_tato")} id="tato" value={cv.tato} readonly list="ai_ya_tidak_options" /></div>
                <Field label={t("form.mf_merokok")} id="rokok" value={cv.rokok} center readonly list="ai_ya_tidak_options" />
                <Field label={t("form.mf_alkohol")} id="alkohol" value={cv.alkohol} center readonly list="ai_ya_tidak_options" />
              </div>
              <div class="col-span-4 space-y-1 mt-2 p-2 bg-slate-800/40 rounded border border-slate-700/50">
                <TextAreaPair groupLabel={t("form.mf_alergi")} idId="alergi_id" idJp="alergi_jp" valueId={cv.alergi_id} valueJp={cv.alergi_jp} onChange={updateCv} />
                <TextAreaPair groupLabel={t("form.mf_penyakit")} idId="medis_id" idJp="medis_jp" valueId={cv.medis_id} valueJp={cv.medis_jp} onChange={updateCv} />
                <TextAreaPair groupLabel={t("cv.field_laka")} idId="laka_id" idJp="laka_jp" valueId={cv.laka_id} valueJp={cv.laka_jp} onChange={updateCv} />
              </div>
            </Section>
          </div>

          <Section title={t("ai_cv.sec_jiko")} icon="fa-comments" color="purple" borderLeft>
            <div class="mb-2"><Field label={t("cv.field_riwayat_jp")} id="riwayatjepang" value={cv.riwayatjepang} readonly span={1} list="ai_eks_jepang_options" /></div>
            <div class="u-grid-auto u-grid-auto--form gap-3">
              <div class="space-y-2">
                <TextAreaPair label={t("cv.field_promo_diri")} helper={t("form.ai_promosi_helper")} idId="promo_id" idJp="promo_jp" valueId={cv.promo_id} valueJp={cv.promo_jp} onChange={updateCv} />
                <TextAreaPair label={t("cv.field_kelebihan")} helper={t("form.ai_kelebihan_helper")} idId="lebih_id" idJp="lebih_jp" valueId={cv.lebih_id} valueJp={cv.lebih_jp} onChange={updateCv} />
                <TextAreaPair label={t("cv.field_kekurangan")} helper={t("form.ai_kekurangan_helper")} idId="kurang_id" idJp="kurang_jp" valueId={cv.kurang_id} valueJp={cv.kurang_jp} onChange={updateCv} />
                <TextAreaPair label={t("cv.hobi")} helper={t("form.ai_hobi_helper")} idId="hobi_id" idJp="hobi_jp" valueId={cv.hobi_id} valueJp={cv.hobi_jp} onChange={updateCv} />
                <TextAreaPair label={t("cv.field_keahlian")} helper={t("form.ai_keahlian_helper")} idId="keahlian_id" idJp="keahlian_jp" valueId={cv.keahlian_id} valueJp={cv.keahlian_jp} onChange={updateCv} />
              </div>
              <div class="space-y-2">
                <TextAreaPair label={t("cv.motivasi")} helper={t("form.ai_motivasi_helper")} idId="moti_id" idJp="moti_jp" valueId={cv.moti_id} valueJp={cv.moti_jp} onChange={updateCv} />
                <TextAreaPair label={t("cv.field_alasan_bidang")} helper={t("form.ai_alasan_helper")} idId="alasan_id" idJp="alasan_jp" valueId={cv.alasan_id} valueJp={cv.alasan_jp} onChange={updateCv} />
                <TextAreaPair label={t("cv.field_rencana_pulang")} helper={t("form.ai_rencana_helper")} idId="pulang_id" idJp="pulang_jp" valueId={cv.pulang_id} valueJp={cv.pulang_jp} onChange={updateCv} />
                <TextAreaPair label={t("cv.field_target_pribadi")} helper={t("form.ai_keinginan_helper")} idId="keinginan_id" idJp="keinginan_jp" valueId={cv.keinginan_id} valueJp={cv.keinginan_jp} onChange={updateCv} />
                <TextAreaPair label={t("cv.field_tujuan_jepang")} helper={t("form.ai_tujuan_helper")} idId="tujuan_id" idJp="tujuan_jp" valueId={cv.tujuan_id} valueJp={cv.tujuan_jp} onChange={updateCv} />
                <div class="grid grid-cols-3 gap-2">
                  <Field label={t("cv.field_lama_jp")} id="lama" value={cv.lama} center readonly unit="thn" />
                  <Field label={t("cv.field_target_gaji")} id="gaji_yen" value={cv.gaji_yen} center readonly jp unit="yen" />
                  <Field label={t("cv.field_target_nabung")} id="tabungan" value={cv.tabungan} center readonly jp />
                </div>
              </div>
            </div>
          </Section>

          <div class="u-grid-auto u-grid-auto--cards gap-3 mb-3">
            <Section title={t("ai_cv.sec_pendidikan")} icon="fa-graduation-cap" color="emerald">
              <div class="grid grid-cols-3 gap-1.5 p-1.5 bg-slate-800/50 rounded border border-slate-700 mb-2">
                <Field label={t("cv.field_bhs_jepang")} id="bhs_jepang" value={cv.bhs_jepang} readonly list="ai_jft_options" />
                <Field label={t("cv.field_nilai_jp")} id="nilai" value={cv.nilai} readonly />
                <Field label={t("cv.field_lisensi_ssw")} id="lisensi" value={cv.lisensi} readonly list="ai_ssw_options" />
              </div>
              <datalist id="ai_jft_options">
                {JFT_OPTIONS.map(o => <option key={o} value={o} />)}
              </datalist>
              <datalist id="ai_ssw_options">
                {SSW_OPTIONS.map(o => <option key={o} value={o} />)}
              </datalist>
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
              <Field label={t("cv.field_kenalan_usia")} id="kenalan_usia" value={cv.kenalan_usia} readonly unit="thn" />
              <div class="col-span-2 md:col-span-4 mt-1 grid grid-cols-2 gap-2">
                <Field label={t("cv.field_kenalan_alamat_id")} id="kenalan_alamat_id" value={cv.kenalan_alamat_id} readonly />
                <Field label={t("cv.field_kenalan_alamat_jp")} id="kenalan_alamat_jp" value={cv.kenalan_alamat_jp} jp readonly />
              </div>
            </div>
          </Section>

          <div class="u-grid-auto u-grid-auto--cards gap-3 mb-3">
            <UploadRow type="foto" label={t("cv.upload_foto")} icon="fa-camera" color="sky" accept="image/*" status={docStatus['foto']} preview={fotoPreview} onUpload={handleDocUpload} />
            <UploadRow type="jft" label={t("cv.upload_jft")} icon="fa-file-pdf" color="amber" accept=".pdf" status={docStatus['jft']} onUpload={handleDocUpload} />
            <UploadRow type="ssw" label={t("cv.upload_ssw")} icon="fa-file-signature" color="emerald" accept=".pdf" status={docStatus['ssw']} onUpload={handleDocUpload} />
          </div>
          <div class="u-grid-auto u-grid-auto--cards gap-3">
            {/* PARITY ai_form.html:325-370 — enam dokumen ini (KTP, KK, dan
                keempat ijazah) menerima `.pdf,image/*`; keempat baris ijazah
                sempat di-port sebagai `.pdf` saja, jadi scan/foto ijazah tidak
                bisa diunggah sama sekali. Bug yang sama sudah diperbaiki di CV
                Master (§4.1 #3) — ini sisa yang terlewat di form AI. */}
            <UploadRow type="ktp" label={t("cv.upload_ktp")} icon="fa-id-card" color="rose" accept=".pdf,image/*" status={docStatus['ktp']} onUpload={handleDocUpload} />
            <UploadRow type="kk" label={t("cv.upload_kk")} icon="fa-users" color="orange" accept=".pdf,image/*" status={docStatus['kk']} onUpload={handleDocUpload} />
            <UploadRow type="ijazahSd" label={t("cv.upload_ijazah_sd")} icon="fa-graduation-cap" color="violet" accept=".pdf,image/*" status={docStatus['ijazahSd']} onUpload={handleDocUpload} />
            <UploadRow type="ijazahSmp" label={t("cv.upload_ijazah_smp")} icon="fa-graduation-cap" color="sky" accept=".pdf,image/*" status={docStatus['ijazahSmp']} onUpload={handleDocUpload} />
            <UploadRow type="ijazahSma" label={t("cv.upload_ijazah_sma")} icon="fa-graduation-cap" color="teal" accept=".pdf,image/*" status={docStatus['ijazahSma']} onUpload={handleDocUpload} />
            <UploadRow type="univ" label={t("cv.upload_ijazah_univ")} icon="fa-university" color="indigo" accept=".pdf,image/*" status={docStatus['univ']} onUpload={handleDocUpload} />
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
      {/* Judul seksi memakai metrik `.section-title` yang sama dengan CV Master
          supaya kedua form terasa satu keluarga (legacy pun begitu:
          `class="section-title text-purple-400"`). Kelasnya dipisah karena
          `.section-title` mengunci warna ke accent-sky — ia unlayered, jadi
          warna itu akan mengalahkan utility warna per-seksi di bawah. */}
      <h2 class={`section-title-accent ${SECTION_COLORS[color] || 'text-slate-400'}`}>
        <Icon name={icon} class="mr-1" /> {title}
      </h2>
      {children}
    </div>
  );
}

function Field({ label, id, value, readonly, center, jp, span, spanMd, unit, type, list }: {
  label: string; id: string; value: string; readonly?: boolean; center?: boolean;
  jp?: boolean; span?: number; spanMd?: number; unit?: Unit; type?: string; list?: string;
}) {
  const spanClass = span === 3 ? 'col-span-3' : span === 2 ? 'col-span-2' : '';
  const mdSpanClass = spanMd === 3 ? 'md:col-span-3' : spanMd === 2 ? 'md:col-span-2' : '';
  return (
    <div class={`${spanClass} ${mdSpanClass}`}>
      <label class="block text-[11px] text-[#e2e8f0] mb-0.5" for={`ai_${id}`}>{label}</label>
      <div class="relative">
        <input id={`ai_${id}`} type={type || 'text'} value={value} readonly={readonly} list={list}
          class={`input-micro w-full bg-slate-800 border border-slate-600 rounded p-1 text-[12px] ${center ? 'text-center' : ''} ${unit ? 'pr-7' : ''} ${jp ? 'text-pink-300 font-bold' : 'text-white'}`} />
        {unit && (
          <span class="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-fg-subtle pointer-events-none">{unit}</span>
        )}
      </div>
    </div>
  );
}

/**
 * Status + nomor dalam satu baris (legacy ai_form.html:150-151).
 *
 * Paritas: legacy `enableSimPasporConditional()` menyembunyikan kolom nomor saat
 * status `TIDAK ADA`, dan menurunkan status dari ada/tidaknya nomor tersimpan.
 *
 * Satu perbedaan yang DISENGAJA: legacy men-default status ke `TIDAK ADA` saat
 * data masih kosong, lalu `syncSimPasporVisibility()` MENGOSONGKAN nomor yang
 * baru dimuat — nomor paspor/SIM kandidat yang sudah tersimpan hilang tanpa
 * peringatan, dan ikut tersimpan kosong. Di sini status kosong dibiarkan kosong
 * ("—"), nomor tidak pernah dihapus diam-diam, dan `TIDAK ADA` hanya
 * mengosongkan nomor bila kandidat/admin memang memilihnya.
 */
function StatusNumber({ label, statusLabel, status, value, statusKey, valueKey, ph, basis, span, onChange }: {
  label: string; statusLabel: string; status: string; value: string;
  statusKey: string; valueKey: string; ph: string; basis: string; span?: number;
  onChange: (field: string, value: string) => void;
}) {
  // Status tersimpan menang; kalau belum ada, turunkan dari ada/tidaknya nomor.
  const shown = status || (value ? 'ADA' : '');
  const numberHidden = shown === 'TIDAK ADA';
  // Dibangun per-render, bukan di module scope: t() membaca langStore saat
  // dipanggil, jadi array module-level akan membeku di bahasa saat import.
  const options = [
    { value: '', label: '\u2014' },
    { value: 'ADA', label: t('form.mf_status_ada') },
    { value: 'TIDAK ADA', label: t('form.mf_status_tidak_ada') },
  ];
  return (
    <div class={span === 2 ? 'col-span-2' : ''}>
      <label class="block text-[11px] text-[#e2e8f0] mb-0.5" for={`ai_${statusKey}`}>{label}</label>
      <div class="flex gap-1">
        <select id={`ai_${statusKey}`} value={shown} aria-label={statusLabel}
          onChange={(e) => {
            const next = (e.target as HTMLSelectElement).value;
            onChange(statusKey, next);
            if (next === 'TIDAK ADA') onChange(valueKey, '');
          }}
          class="input-micro bg-slate-800 border border-slate-600 rounded p-1 text-[12px] text-white"
          style={{ flex: numberHidden ? '1 1 100%' : `0 0 ${basis}` }}>
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {!numberHidden && (
          <input id={`ai_${valueKey}`} type="text" value={value} placeholder={ph}
            onInput={(e) => onChange(valueKey, (e.target as HTMLInputElement).value)}
            class="input-micro bg-slate-800 border border-slate-600 rounded p-1 text-[12px] text-white"
            style={{ flex: '1 1 auto', minWidth: 0 }} />
        )}
      </div>
    </div>
  );
}

/** FIXED: TextAreaPair now reads from cv state + writes via onChange */
function TextAreaPair({ label, groupLabel, helper, idId, idJp, valueId, valueJp, onChange }: {
  label?: string; groupLabel?: string; helper?: string; idId: string; idJp: string; valueId: string; valueJp: string;
  onChange: (field: string, value: string) => void;
}) {
  /* groupLabel names BOTH textareas: a for= can only ever name one of them, which
     is why the medical blocks use this instead of a bare <label>.
     <fieldset>+<legend> rather than role="group"+aria-labelledby, because the name
     then comes from the DOM structure itself — there is no id that can drift out
     from under it, and `for=` can never name two controls. The resets are load-
     bearing: a raw fieldset draws a border, pads, and sizes to min-content, which
     breaks the 2-column grid inside it. */
  const fields = (
    <>
      {label && <label class="block text-[11px] text-[#e2e8f0] mb-0.5" for={`ai_${idId}`}>{label}</label>}
      {/* PARITY ai_form.html:202-213 — paragraf petunjuk di antara label dan
          field. Legacy memakai `text-[9px] italic`; di sini `text-fg-subtle`
          supaya benar di kedua tema tanpa perlu shim, dan tanpa italic supaya
          teks Jepangnya tetap tegak dan terbaca. */}
      {helper && <p class="text-[10px] text-fg-subtle leading-tight mb-1">{helper}</p>}
      <div class="grid grid-cols-2 gap-2">
        <textarea id={`ai_${idId}`} value={valueId} rows={2}
          onInput={(e) => onChange(idId, (e.target as HTMLTextAreaElement).value)}
          class="input-micro w-full bg-slate-800 border border-slate-600 rounded p-1 text-[12px] text-white resize-none" placeholder={t("ui.ph_id")} />
        <textarea id={`ai_${idJp}`} value={valueJp} rows={2}
          onInput={(e) => onChange(idJp, (e.target as HTMLTextAreaElement).value)}
          class="input-micro w-full bg-slate-800 border border-slate-600 rounded p-1 text-[12px] text-purple-300 font-bold resize-none" placeholder={t("ui.ph_jp")} />
      </div>
    </>
  );
  if (!groupLabel) return <div>{fields}</div>;
  return (
    <fieldset class="border-0 p-0 m-0 min-w-0">
      <legend class="block text-[11px] text-[#e2e8f0] mb-0.5 p-0">{groupLabel}</legend>
      {fields}
    </fieldset>
  );
}

function UploadRow({ type, label, icon, color, accept, status, preview, onUpload }: {
  type: string; label: string; icon: string; color: UploadColor; accept: string; status?: string;
  preview?: string | null; onUpload?: (type: string, file: File | null) => void;
}) {
  const c = UPLOAD_COLORS[color];
  return (
    <div class="bg-slate-900/60 border border-slate-700 p-3 rounded-lg shadow flex items-center gap-3">
      <div class={`w-10 h-10 rounded ${c.tile} flex items-center justify-center text-white text-lg flex-shrink-0`}>
        <Icon name={icon} />
      </div>
      <div class="flex-1 overflow-hidden">
        <div class="flex items-center gap-2">
          <label class={`block text-xs font-bold ${c.label} mb-0.5`} for={`ai_doc_${type}`}>{label}</label>
          {status && <span class="text-[9px] text-emerald-400 font-medium"><Icon name="check" class="mr-0.5" />{status}</span>}
        </div>
        <input id={`ai_doc_${type}`} type="file" accept={accept}
          onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0] || null; onUpload?.(type, f); }}
          class="w-full text-[9px] text-slate-400 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-slate-800 file:text-white cursor-pointer" />
      </div>
      {/* PARITY ai_form.html:299 — legacy benar-benar menampilkan pratinjau foto
          (`#previewFoto`, h-14 w-12) di kanan baris. Sebelumnya state
          `fotoPreview` di-set tapi tidak pernah dirender: state mati, dan
          kandidat tidak pernah tahu fotonya sudah masuk atau belum. */}
      {preview && (
        <img src={preview} alt="" class="h-14 w-12 object-cover rounded border border-slate-600 shadow flex-shrink-0" />
      )}
    </div>
  );
}
