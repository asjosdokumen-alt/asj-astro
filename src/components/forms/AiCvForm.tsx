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
import { apiClient, type ApiError } from '../../lib/apiClient';
import { aiCvAccessRedirect } from '../../lib/vip';
import { validate, waSchema, kandidatLoginSchema } from '../../lib/schemas';

import type { ChatMessage } from '../../types/api';
import Icon from '../ui/Icon';
import AiUnavailableBanner from '../ui/AiUnavailableBanner';
import { mapAiCvDraft } from '../../lib/aiCvDraft';
import { uploadMany, type UploadCollectionError } from '../../lib/cloudinary';
import { AI_FILE_COLUMNS } from '../../lib/documentColumns';
import { AI_CV_FLAT_KEYS, parseAiCvDraft } from '../../lib/aiCvDraft';
import { PAIRED_FIELDS, resolvePairEdit, jpOf, GENDER_PAIRS, AGAMA_PAIRS, GOLDAR_PAIRS, STATUS_NIKAH_PAIRS, TANGAN_PAIRS, YA_TIDAK_PAIRS, RIWAYAT_JEPANG_PAIRS, SEPATU_PAIRS, BAJU_PAIRS, TOPI_PAIRS } from '../../lib/aiCvPairs';
import { PEKERJAAN, HUBUNGAN_KELUARGA, labelJp, pairDisplay, type Opsi } from '../../lib/opsi-form';
import { levelOptions, sortEduRows } from '../../lib/cvRows';
import { joinPeriod, monthLabel, monthOptions, splitPeriod, yearOptions } from '../../lib/cvPeriod';
import { useOverlay } from '../ui/useOverlay';

interface CvData {
  nama: string; katakana: string; panggilan: string; panggilan_katakana: string;
  tmplahir: string; tgllahir: string; umur: string; gender: string; agama: string;
  /* JP halves of the paired identity columns. Legacy kept these as separate
     columns too (`identitas.gender_jp` / `agama_jp` / `status_nikah_jp`) because
     the employer reads the kanji, not the Indonesian. They are filled
     automatically by `resolvePairEdit` — see `aiCvPairs.ts`. */
  gender_jp: string; agama_jp: string; status_jp: string;
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

/** Balasan `loginKandidat` (surfaces/auth.ts → identity.loginKandidat). */
interface LoginKandidatRes {
  sessionToken?: string;
  token?: string;
  user?: string;
}

/**
 * Balasan `processAIChat`.
 *
 * `data` adalah objek BERSARANG (`{identitas, fisik, medis, …}`) — bentuk yang
 * diminta prompt di _lib/ai/chat.ts, bukan kunci flat. Karena itu ia harus lewat
 * `mapAiCvDraft` sebelum masuk ke state flat `cv`; menebarnya langsung hanya
 * menambahkan kunci `identitas`/`fisik` yang tidak dirender siapa pun.
 */
interface ProcessAIChatRes {
  reply?: string;
  error?: string;
  data?: unknown;
  suggestions?: string[];
}

const EMPTY_CV: CvData = Object.fromEntries(CV_FIELDS.map(k => [k, ''])) as CvData;

/**
 * Repeatable row shapes for the three dynamic CV sections.
 *
 * Legacy kept these as `arrayFields` (`ai_form.ts:309-341`) and rendered them
 * with `renderEditableArray`, capping the lists at 5 / 3 / 5. The port shipped
 * the section headings with a "Belum ada data…" placeholder and no controls, so
 * there was no way to enter education, work history, or family at all — the CV
 * could describe a person's height but not their school.
 *
 * The caps are the legacy caps, not arbitrary: the printed CV template has
 * fixed rows, and a sixth entry would be silently dropped at render time. The
 * UI stops at the cap so the candidate is never asked for data that cannot be
 * shown.
 */
interface EduRow {
  tingkat: string; sekolah_id: string; sekolah_jp: string;
  jurusan_id: string; jurusan_jp: string; masuk: string; lulus: string;
}
interface JobRow {
  perusahaan_id: string; perusahaan_jp: string; jabatan_id: string; jabatan_jp: string;
  masuk: string; keluar: string; gaji: string;
}
interface FamRow {
  hubungan_id: string; hubungan_jp: string; nama: string; katakana: string;
  umur: string; pekerjaan_id: string; pekerjaan_jp: string; gaji: string;
}

const EDU_MAX = 5;
const JOB_MAX = 3;
const FAM_MAX = 5;

const EMPTY_EDU: EduRow = { tingkat: '', sekolah_id: '', sekolah_jp: '', jurusan_id: '', jurusan_jp: '', masuk: '', lulus: '' };
const EMPTY_JOB: JobRow = { perusahaan_id: '', perusahaan_jp: '', jabatan_id: '', jabatan_jp: '', masuk: '', keluar: '', gaji: '' };
const EMPTY_FAM: FamRow = { hubungan_id: '', hubungan_jp: '', nama: '', katakana: '', umur: '', pekerjaan_id: '', pekerjaan_jp: '', gaji: '' };

/** School levels — legacy `TINGKAT_OPTIONS`, and the canonical order. */

/**
 * Periods are month+year controls now — see `MonthYearField` and
 * `lib/cvPeriod.ts`. The old years-only `<select>` and its local
 * `yearOptions()` helper lived here; the helper moved to cvPeriod.ts unchanged
 * (a stored year outside the window must stay selectable, or opening an old CV
 * and saving it would erase that year) and is now shared by both halves.
 */

/** Balasan `loginKandidat` (surfaces/auth.ts → identity.loginKandidat). */

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

/* Enum fields (gender, agama, goldar, …) no longer keep their option lists here.
   They are `<PairSelect>`s over the registry in `lib/aiCvPairs.ts`, which is the
   single owner of both halves (Indonesian + kanji) and is also what
   `opsi-form.ts` feeds — so the two forms cannot drift apart. Seven local
   arrays used to sit at this spot (GENDER_OPTIONS, AGAMA_OPTIONS,
   GOLDAR_OPTIONS, STATUS_NIKAH_OPTIONS, TANGAN_OPTIONS, YA_TIDAK,
   EKS_JEPANG_OPTIONS); they became dead once the dropdowns landed and were
   removed 2026-09-19. Add an enum by extending `aiCvPairs.ts`, never here.
   The note this replaced also said the dynamic sections were placeholders with
   no fields — no longer true: pendidikan/pekerjaan/keluarga are real repeaters
   (EDU_MAX/JOB_MAX/FAM_MAX) and `AiCvForm.test.tsx` covers them. */

/** Strip dangerous HTML tags — prevents XSS from AI output. */
const waFromUrl = () => { try { return new URLSearchParams(window.location.search).get('wa') || ''; } catch { return ''; } };

/**
 * Whole years between an ISO `YYYY-MM-DD` birth date and today.
 *
 * Returns '' for anything that is not a real date, so the caller can keep the
 * existing value instead of wiping the field — legacy `syncUmurFromTglLahir`
 * behaved the same way, and a blank derived field is worse than a stale one
 * because nothing tells the candidate it stopped being computed.
 */
export function ageFromIso(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
  if (!m) return '';
  const y = Number(m[1]), mo = Number(m[2]) - 1, d = Number(m[3]);
  const born = new Date(y, mo, d);
  // Reject rollovers (2024-02-31 becomes March) — a nonsense date must not
  // silently produce a plausible age.
  if (born.getFullYear() !== y || born.getMonth() !== mo || born.getDate() !== d) return '';
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const beforeBirthday = now.getMonth() < mo || (now.getMonth() === mo && now.getDate() < d);
  if (beforeBirthday) age -= 1;
  return age >= 0 && age < 130 ? String(age) : '';
}

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

/**
 * The save button's two glyphs, named as constants on purpose.
 *
 * `scripts/build-icon-sprite.mjs` harvests *every* string literal inside an
 * `name={ … }` expression, because that is how it finds icons behind ternaries.
 * A literal that is really a state value — `name={phase === 'done' ? … }` —
 * is then mistaken for a glyph called `done`, which does not exist, and the
 * build reports an unresolvable token. Hoisting the glyphs out keeps the state
 * comparison out of the scanner's view. (The `fa-…` warning from
 * `Icon.test.ts` is the same class of false positive, documented in
 * `docs/archive/HANDOVER.md`.)
 */
const SAVE_ICON_BUSY = 'cloud-upload-alt';
const SAVE_ICON_DONE = 'check';

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
  /**
   * Which fields the candidate edited by hand. Drives the `border-sky-400`
   * marker (legacy `enableManualPreview`) so a human correction is always
   * distinguishable from an AI guess.
   */
  const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set());
  /**
   * Save-button phase. Legacy had five visible states (`saveToDatabase`,
   * `ai_form.ts:1702-1800`); the port had none, so a candidate could fire the
   * same submit twice during a slow document upload and the second request
   * would overwrite the first with an identical payload.
   */
  const [savePhase, setSavePhase] = useState<'idle' | 'extCheck' | 'uploading' | 'saving' | 'done'>('idle');
  /* The three dynamic sections. Seeded with one empty row each so the section
     is usable immediately — legacy showed a row and a "tambah" button too. */
  const [eduList, setEduList] = useState<EduRow[]>([{ ...EMPTY_EDU }]);
  const [jobList, setJobList] = useState<JobRow[]>([{ ...EMPTY_JOB }]);
  const [famList, setFamList] = useState<FamRow[]>([{ ...EMPTY_FAM }]);
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
      // Giliran user HARUS ada di dalam `history`: handleProcessAIChat hanya
      // membaca flow/history/lang/currentData dan TIDAK pernah membaca field
      // `message`. `messages` di sini masih nilai render sebelumnya (setMessages
      // di atas belum diterapkan), jadi mengirisnya apa adanya membuat model
      // tidak pernah melihat kalimat yang baru diketik user. Pola yang sama
      // dipakai SiswaBaruForm (`next.slice(-20)`).
      const trimmedHistory = [...messages, { role: 'user' as const, text: msg }]
        .slice(-20)
        .map(m => ({ role: m.role, content: m.text }));
      // Lewat apiClient, bukan fetch mentah. Dua hal yang didapat: batas waktu
      // 20 s (sebelumnya koneksi macet menahan `sending` selamanya, sehingga
      // input chat terkunci permanen — `finally` tidak pernah jalan selama
      // fetch masih pending), dan `code` server yang terbawa di ApiError.
      //
      // `currentData` — bukan `cvData`. Handler membangun blok "DATA KANDIDAT
      // SAAT INI" dari `p.currentData`; kunci lain diabaikan diam-diam.
      const data = await apiClient<ProcessAIChatRes>(
        'processAIChat',
        [{ history: trimmedHistory, currentData: cv }],
        { onSessionInvalid: 'throw', silent: true },
      );
      setAiDown(null);
      // §6 parity: server menolak VIP dengan { success:false, error } TANPA
      // `reply` (chat.ts flow=master). `reply` tetap prioritas; `error` cadangan.
      addBot(String(data?.reply || data?.error || '') || 'Waduh sistem Jeklin lagi sibuk kak, coba beberapa saat lagi ya!');
      // `data.data` — handler mengembalikan `{ reply, data: aiData }`, dan itu
      // kunci yang sama yang dibaca SiswaBaruForm (`res.data`). Membaca
      // `cvData` membuat data hasil ekstraksi AI tidak pernah masuk ke form,
      // padahal modelnya sudah membayarnya.
      // `data.data` BERSARANG (lihat ProcessAIChatRes) — dipetakan dulu ke kunci
      // flat lewat tabel yang sama dengan pemuatan draf. Menebar objek bersarang
      // langsung ke state flat hanya menambah kunci `identitas`/`fisik` yang
      // tidak dirender siapa pun, jadi tidak ada satu kolom pun yang terisi.
      const patch = data.data ? mapAiCvDraft(data.data) : {};
      if (Object.keys(patch).length > 0) {
        setCv(prev => ({ ...prev, ...patch }));
        showToast(t('toast.saved'), 'success');
      }
      if (data.suggestions && data.suggestions.length > 0) {
        setTimeout(() => setShowSuggestions(true), 500) /* SUGGESTION_DELAY_MS */;
      }
    } catch (e) {
      // apiClient melempar untuk SEMUA kegagalan, jadi percabangan `res.ok` yang
      // lama harus dibawa ulang di sini — dengan kode server, bukan hanya teks.
      const err = e as ApiError;
      if (err.code === 'AI_UNAVAILABLE') {
        // §6.5 baris 3 — banner + copy ramah yang SERVER tulis. Kode ini sampai
        // ke sini hanya karena apiClient membawanya (ApiError.code); selama ia
        // hanya membawa `message`, satu-satunya cara melihatnya adalah tetap
        // memakai fetch mentah.
        setAiDown(err.message || null);
        addBot(err.message || 'Waduh sistem Jeklin lagi sibuk kak, coba beberapa saat lagi ya!');
      } else if (err.status) {
        // Server menjawab dengan pesannya sendiri (mis. penolakan VIP: 400 +
        // `error`). Pakai pesan itu — copy generik membuat user tidak tahu
        // kenapa ditolak.
        setAiDown(null);
        addBot(err.message || 'Waduh sistem Jeklin lagi sibuk kak, coba beberapa saat lagi ya!');
      } else {
        // Transport gagal (timeout / offline): tidak ada pesan server untuk
        // ditampilkan, jadi copy ramah yang lama.
        setAiDown(null);
        addBot('Waduh Jeklin lagi sibuk nih, coba beberapa saat lagi ya!');
      }
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
      // KONTRAK WIRE: kernel/validate.ts memvalidasi loginKandidat dengan
      // z.tuple([waField, passwordField]) — payload WAJIB DUA PRIMITIF.
      // Bentuk lama [{wa,password}] ditolak zod ("Array must contain at least
      // 2 element(s)"), sehingga gate ini tidak pernah bisa lolos dan user
      // selalu melihat "Password salah atau akun tidak ditemukan." LoginModal
      // sudah memakai [wa, password]; hanya kedua gate ini yang menyimpang.
      //
      // `requireAuth: false` WAJIB — ini gerbang login itu sendiri.
      const d = await apiClient<LoginKandidatRes>('loginKandidat', [wa, gatePass], {
        requireAuth: false,
        onSessionInvalid: 'throw',
        silent: true,
      });
      authStore.set({ ...authStore.get(), sessionToken: d.sessionToken || d.token || '', wa, name: d.user || 'kandidat', isLoggedIn: true, role: 'kandidat', lastChecked: Date.now() });
      setCv(prev => ({ ...prev, hp: prev.hp || wa }));
      setLoginGate(false);
    } catch (e) {
      // apiClient melempar untuk HTTP gagal MAUPUN kegagalan jaringan, jadi
      // pemisahan lama (`res.ok`) harus dibawa ulang di sini. `status` hanya ada
      // kalau server benar-benar menjawab — tanpa pemisahan ini, password salah
      // terbaca sebagai masalah koneksi.
      const err = e as ApiError;
      setGateMsg(err.status ? 'Password salah atau akun tidak ditemukan.' : 'Error koneksi.');
    }
  };

  /**
   * Whether the last save finished. Kept as a plain boolean rather than inlined
   * into the icon expression so the sprite scanner cannot mistake the `'done'`
   * state value for a glyph name (see `SAVE_ICON_BUSY`).
   */
  const saveDone = savePhase === 'done';

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

    // ── Extension guard (legacy `ai_form.ts:1714-1736`) ──────────────────
    // `accept=` on the input is a hint to the file picker, not a guarantee:
    // drag-and-drop, "All files", and a renamed extension all get past it. The
    // server would then store a file the CV builder cannot open, and the failure
    // surfaces days later as an unreadable document. Checked BEFORE anything is
    // uploaded so no wasted bytes leave the device.
    //
    // The two rules differ by document class, matching legacy and
    // `storage-helper.ts`: certificates are exactly PDF; identity documents and
    // diplomas may be a phone photo or a PDF.
    setSavePhase('extCheck');
    const DOC_EXT_RULES: Record<string, string[]> = {
      jft: ['pdf'], ssw: ['pdf'],
      foto: ['jpg', 'jpeg', 'png'],
      ktp: ['pdf', 'jpg', 'jpeg', 'png'],
      kk: ['pdf', 'jpg', 'jpeg', 'png'],
      ijazahSd: ['pdf', 'jpg', 'jpeg', 'png'],
      ijazahSmp: ['pdf', 'jpg', 'jpeg', 'png'],
      ijazahSma: ['pdf', 'jpg', 'jpeg', 'png'],
      univ: ['pdf', 'jpg', 'jpeg', 'png'],
    };
    for (const [key, file] of Object.entries(docs)) {
      if (!file) continue;
      const allowed = DOC_EXT_RULES[key];
      if (!allowed) continue;
      const ext = String(file.name || '').split('.').pop()?.toLowerCase() || '';
      if (!allowed.includes(ext)) {
        setSavePhase('idle');
        showToast(`${file.name}: format harus ${allowed.join(' / ').toUpperCase()}`, 'error');
        return;
      }
    }

    try {
      let fileUrls: Record<string, string>;
      setSavePhase('uploading');
      try {
        fileUrls = await uploadMany(docs, AI_FILE_COLUMNS);
      } catch (ue) {
        const ue2 = ue as UploadCollectionError;
        setSavePhase('idle');
        showToast('Gagal upload ' + (docStatus[ue2.key] || ue2.key) + ': ' + ue2.message, 'error');
        return;
      }
      setSavePhase('saving');
      const payload = {
        context: { wa: cv.hp },
        identitas: {
          nama_lengkap: cv.nama, katakana: cv.katakana, panggilan: cv.panggilan,
          panggilan_katakana: cv.panggilan_katakana, tempat_lahir: cv.tmplahir,
          tgl_lahir: cv.tgllahir, umur: cv.umur, gender: cv.gender, agama: cv.agama,
          /* The kanji halves of the paired columns. `PairSelect` fills them from
             the registry, but they are separate columns on the printed CV and the
             candidate may hand-correct them — so they must be sent, not
             re-derived. Omitting them left the employer's copy with a blank
             kanji column even though the Indonesian half was correct. */
          gender_jp: cv.gender_jp, agama_jp: cv.agama_jp, status_nikah_jp: cv.status_jp,
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
        /* The three dynamic sections. Rows the candidate never filled in are
           dropped rather than sent as empty objects: this payload is what the
           employer's CV is built from, and a blank row would print as an empty
           line in the work history. Unlike CV Master, position is NOT padded —
           there is no legacy rule requiring a fixed row count here. */
        pendidikan: eduList
          .filter(e => e.sekolah_id || e.tingkat)
          .map(e => ({
            tingkat: e.tingkat, nama_sekolah: e.sekolah_id, nama_sekolah_jp: e.sekolah_jp,
            jurusan: e.jurusan_id, jurusan_jp: e.jurusan_jp,
            tahun_masuk: e.masuk, tahun_lulus: e.lulus,
          })),
        pekerjaan: jobList
          .filter(j => j.perusahaan_id || j.jabatan_id)
          .map(j => ({
            nama_perusahaan: j.perusahaan_id, nama_perusahaan_jp: j.perusahaan_jp,
            jabatan: j.jabatan_id, jabatan_jp: j.jabatan_jp,
            tahun_masuk: j.masuk, tahun_keluar: j.keluar, gaji: j.gaji,
          })),
        keluarga: famList
          .filter(f => f.nama || f.hubungan_id)
          .map(f => ({
            hubungan: f.hubungan_id, hubungan_jp: f.hubungan_jp, nama: f.nama,
            katakana: f.katakana, umur: f.umur,
            pekerjaan: f.pekerjaan_id, pekerjaan_jp: f.pekerjaan_jp, gaji: f.gaji,
          })),
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
        setSavePhase('done');
        showToast(t('toast.saved'), 'success');
        // Legacy left the button green and let the candidate see the result;
        // returning to idle immediately would make a second submit one click
        // away on a screen that already saved.
      } else {
        setSavePhase('idle');
        showToast((data2.message || data2.error || 'Gagal menyimpan.') as string, 'error');
      }
    } catch (e) {
      setSavePhase('idle');
      const msg = (e as Error).message;
      if (msg !== 'No valid session' && msg !== 'Session expired') {
        showToast('Error: ' + msg, 'error');
      }
    }
  };

  const updateCv = (field: string, value: string) => setCv(prev => ({ ...prev, [field]: value }));

  /**
   * The only writer for a hand edit on the CV.
   *
   * Three things must happen together, and legacy only got away with doing two
   * because its state was a mutable object:
   *
   *   1. write the field the candidate touched;
   *   2. write its ID↔JP partner, so the two halves cannot disagree (legacy
   *      `setPairedValue`, `ai_form.ts:292-308`);
   *   3. record that a HUMAN wrote it, so the field stays marked and a later AI
   *      reply that contradicts it does not look identical to a fresh fill.
   *
   * Kept as one function rather than three inline handlers so a new field
   * cannot be added with only the first step — the defect that left every
   * paired identity field half-empty in the port.
   */
  const handleManualEdit = (field: string, value: string) => {
    setCv(prev => ({ ...prev, ...resolvePairEdit(field, value) }));
    setTouchedFields(prev => (prev.has(field) ? prev : new Set(prev).add(field)));
  };

  /**
   * Manual edit for a *pair* field, where the value arrives as the ID half.
   * Same as `handleManualEdit` but marks the JP column too, so the pair is
   * visibly attributable as one correction rather than two.
   */
  const handlePairEdit = (field: string, value: string) => {
    setCv(prev => ({ ...prev, ...resolvePairEdit(field, value) }));
    setTouchedFields(prev => {
      const next = new Set(prev).add(field);
      const partner = PAIRED_FIELDS[field]?.partner;
      if (partner) next.add(partner);
      return next;
    });
  };

  /**
   * Age is derived, never asked twice.
   *
   * Legacy `syncUmurFromTglLahir()` recomputed it whenever the birth date
   * changed. The port dropped the rule, so a candidate who corrects their birth
   * date keeps the old age and the CV contradicts itself on a field the
   * employer checks against documents.
   */
  const handleTglLahir = (value: string) => {
    setCv(prev => ({ ...prev, tgllahir: value, umur: ageFromIso(value) || prev.umur }));
    setTouchedFields(prev => (prev.has('tgllahir') ? prev : new Set(prev).add('tgllahir')));
  };

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
        <button onClick={() => setTab('chat')} class={tab === 'chat' ? 'flex-1 min-h-11 py-3 text-xs font-bold bg-amber-600/20 text-amber-400 border-b-2 border-amber-500' : 'flex-1 min-h-11 py-3 text-xs font-bold text-slate-400'}>
          <Icon name="crown" class="mr-2" />{t('form.ai_cv_chat')}
        </button>
        <button onClick={() => setTab('form')} class={tab === 'form' ? 'flex-1 min-h-11 py-3 text-xs font-bold bg-amber-600/20 text-amber-400 border-b-2 border-amber-500' : 'flex-1 min-h-11 py-3 text-xs font-bold text-slate-400'}>
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
              {/* The button carries its own progress. Legacy `saveToDatabase`
                  ran five visible states; the port had none, which let a
                  candidate fire the same submit twice while a large document
                  upload was still running. `disabled` is the load-bearing part:
                  the colour and label are for legibility, but only `disabled`
                  prevents the duplicate write. */}
              <button onClick={saveToDatabase} disabled={savePhase !== 'idle' && savePhase !== 'done'}
                aria-live="polite"
                class={`${savePhase === 'done' ? 'bg-sky-600' : 'bg-emerald-600 hover:bg-emerald-500'} ${savePhase !== 'idle' && savePhase !== 'done' ? 'opacity-60 cursor-not-allowed' : ''} text-white text-[10px] md:text-xs font-bold px-4 py-2 rounded-lg transition shadow-lg flex items-center gap-2`}>
                <Icon spin={savePhase === 'uploading' || savePhase === 'saving'}
                  name={saveDone ? SAVE_ICON_DONE : SAVE_ICON_BUSY} />
                {savePhase === 'extCheck' ? t('ai_cv.btn_saving')
                  : savePhase === 'uploading' ? t('ai_cv.btn_uploading')
                    : savePhase === 'saving' ? t('ai_cv.btn_saving_db')
                      : savePhase === 'done' ? t('ai_cv.btn_saved')
                        : t('button.save_db')}
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
            {/* Every field here is editable — see `Field` and `handleManualEdit`.
                The paired ones (gender/agama/status) are `<select>` over a
                registry so the ID and JP halves cannot disagree; the rest take
                free text. */}
            <div class="grid grid-cols-2 md:grid-cols-5 gap-2">
              <Field label={t("cv.field_nama")} id="nama" value={cv.nama} span={2}
                touched={touchedFields.has('nama')} onInput={(v) => handleManualEdit('nama', v)} />
              <Field label={t("form.mf_furigana")} id="katakana" value={cv.katakana} span={2} jp
                touched={touchedFields.has('katakana')} onInput={(v) => handleManualEdit('katakana', v)} />
              <Field label={t("form.mf_panggilan")} id="panggilan" value={cv.panggilan}
                touched={touchedFields.has('panggilan')} onInput={(v) => handleManualEdit('panggilan', v)} />
              <Field label={t("form.mf_panggilan_ktk")} id="panggilan_katakana" value={cv.panggilan_katakana} jp
                touched={touchedFields.has('panggilan_katakana')} onInput={(v) => handleManualEdit('panggilan_katakana', v)} />
              <Field label={t("cv.field_tmp_lahir")} id="tmplahir" value={cv.tmplahir}
                touched={touchedFields.has('tmplahir')} onInput={(v) => handleManualEdit('tmplahir', v)} />
              {/* PARITY ai_form.html:134 — legacy `type="date"` (date picker),
                  bukan teks bebas. Editing it recomputes `umur` so the CV cannot
                  show an age that contradicts its own birth date. */}
              <Field label={t("cv.field_tgl_lahir")} id="tgllahir" value={cv.tgllahir} type="date"
                touched={touchedFields.has('tgllahir')} onInput={handleTglLahir} />
              <Field label={t("form.mf_usia")} id="umur" value={cv.umur} center unit="thn"
                touched={touchedFields.has('umur')} onInput={(v) => handleManualEdit('umur', v)} />
              <PairSelect label={t("form.mf_gender")} id="gender" value={cv.gender} pairs={GENDER_PAIRS}
                touched={touchedFields.has('gender')} testId="ai-pair-gender"
                onChange={(v) => handlePairEdit('gender', v)} />
              <JpField label={t("form.mf_gender_jp")} id="gender_jp" value={cv.gender_jp}
                touched={touchedFields.has('gender_jp')} onInput={(v) => handleManualEdit('gender_jp', v)} />
              <PairSelect label={t("form.mf_agama")} id="agama" value={cv.agama} pairs={AGAMA_PAIRS}
                touched={touchedFields.has('agama')} testId="ai-pair-agama"
                onChange={(v) => handlePairEdit('agama', v)} />
              <JpField label={t("form.mf_agama_jp")} id="agama_jp" value={cv.agama_jp}
                touched={touchedFields.has('agama_jp')} onInput={(v) => handleManualEdit('agama_jp', v)} />
              <PairSelect label={t("form.mf_goldar")} id="goldar" value={cv.goldar} pairs={GOLDAR_PAIRS}
                touched={touchedFields.has('goldar')} testId="ai-pair-goldar"
                onChange={(v) => handlePairEdit('goldar', v)} />
              <PairSelect label={t("cv.field_status_nikah")} id="status" value={cv.status} pairs={STATUS_NIKAH_PAIRS}
                touched={touchedFields.has('status')} testId="ai-pair-status"
                onChange={(v) => handlePairEdit('status', v)} />
              <JpField label={t("cv.field_status_nikah_jp")} id="status_jp" value={cv.status_jp}
                touched={touchedFields.has('status_jp')} onInput={(v) => handleManualEdit('status_jp', v)} />
              <Field label={t("form.mf_anak")} id="anak" value={cv.anak} center
                touched={touchedFields.has('anak')} onInput={(v) => handleManualEdit('anak', v)} />
              <Field label={t("form.mf_email")} id="email" value={cv.email} span={2}
                touched={touchedFields.has('email')} onInput={(v) => handleManualEdit('email', v)} />
              <Field label={t("cv.field_alamat")} id="alamat" value={cv.alamat} span={3} spanMd={3}
                touched={touchedFields.has('alamat')} onInput={(v) => handleManualEdit('alamat', v)} />
              <Field label={t("form.mf_kontak")} id="hp" value={cv.hp}
                touched={touchedFields.has('hp')} onInput={(v) => handleManualEdit('hp', v)} />
              <Field label={t("form.mf_darurat_wa")} id="hpdarurat" value={cv.hpdarurat}
                touched={touchedFields.has('hpdarurat')} onInput={(v) => handleManualEdit('hpdarurat', v)} />
              <Field label={t("form.mf_ktp")} id="ktp" value={cv.ktp} span={2}
                touched={touchedFields.has('ktp')} onInput={(v) => handleManualEdit('ktp', v)} />
              <StatusNumber label={t("form.mf_no_paspor")} statusLabel={t("form.mf_paspor_status")}
                status={cv.paspor_status} value={cv.paspor} statusKey="paspor_status" valueKey="paspor"
                ph={t("form.mf_ph_no_paspor")} basis="38%" span={2} onChange={handleManualEdit} />
              <StatusNumber label={t("form.mf_sim")} statusLabel={t("form.mf_sim_status")}
                status={cv.sim_status} value={cv.sim} statusKey="sim_status" valueKey="sim"
                ph={t("form.mf_ph_no_sim")} basis="42%" onChange={handleManualEdit} />
            </div>
          </Section>

          <div class="u-grid-auto u-grid-auto--form gap-3 mb-3">
            <Section title={t("ai_cv.sec_fisik")} icon="fa-child" color="amber">
              <div class="grid grid-cols-3 gap-2">
                <Field label={t("form.mf_tb")} id="tb" value={cv.tb} center unit="cm"
                  touched={touchedFields.has('tb')} onInput={(v) => handleManualEdit('tb', v)} />
                <Field label={t("form.mf_bb")} id="bb" value={cv.bb} center unit="kg"
                  touched={touchedFields.has('bb')} onInput={(v) => handleManualEdit('bb', v)} />
                <PairSelect label={t("cv.field_tgn_dominan")} id="tangan" value={cv.tangan} pairs={TANGAN_PAIRS}
                  touched={touchedFields.has('tangan')} onChange={(v) => handlePairEdit('tangan', v)} />
                {/* Sizes are dropdowns because the ID and JP conventions differ:
                    a bare "XL" is ambiguous on a Japanese form (legacy
                    `SEPATU_PAIRS`/`BAJU_PAIRS`/`TOPI_PAIRS`). */}
                <PairSelect label={t("form.mf_sepatu")} id="sepatu" value={cv.sepatu} pairs={SEPATU_PAIRS}
                  touched={touchedFields.has('sepatu')} onChange={(v) => handlePairEdit('sepatu', v)} />
                <PairSelect label={t("form.mf_baju")} id="baju" value={cv.baju} pairs={BAJU_PAIRS}
                  touched={touchedFields.has('baju')} onChange={(v) => handlePairEdit('baju', v)} />
                <PairSelect label={t("form.mf_topi")} id="topi" value={cv.topi} pairs={TOPI_PAIRS}
                  touched={touchedFields.has('topi')} onChange={(v) => handlePairEdit('topi', v)} />
                <div class="col-span-3">
                  <PairSelect label={t("cv.field_tahan_ac")} id="tahan_ac" value={cv.tahan_ac} pairs={YA_TIDAK_PAIRS}
                    touched={touchedFields.has('tahan_ac')} onChange={(v) => handlePairEdit('tahan_ac', v)} />
                </div>
              </div>
            </Section>
            <Section title={t("ai_cv.sec_medis")} icon="fa-notes-medical" color="red">
              <div class="grid grid-cols-4 gap-2">
                <Field label={t("cv.field_mata_kanan")} id="matakanan" value={cv.matakanan} center
                  touched={touchedFields.has('matakanan')} onInput={(v) => handleManualEdit('matakanan', v)} />
                <Field label={t("cv.field_mata_kiri")} id="matakiri" value={cv.matakiri} center
                  touched={touchedFields.has('matakiri')} onInput={(v) => handleManualEdit('matakiri', v)} />
                <div class="col-span-2">
                  <PairSelect label={t("form.mf_kacamata")} id="kacamata" value={cv.kacamata} pairs={YA_TIDAK_PAIRS}
                    touched={touchedFields.has('kacamata')} onChange={(v) => handlePairEdit('kacamata', v)} />
                </div>
                <div class="col-span-2">
                  <PairSelect label={t("cv.field_butawarna")} id="butawarna" value={cv.butawarna} pairs={YA_TIDAK_PAIRS}
                    touched={touchedFields.has('butawarna')} onChange={(v) => handlePairEdit('butawarna', v)} />
                </div>
                <div class="col-span-2">
                  <PairSelect label={t("form.mf_tato")} id="tato" value={cv.tato} pairs={YA_TIDAK_PAIRS}
                    touched={touchedFields.has('tato')} onChange={(v) => handlePairEdit('tato', v)} />
                </div>
                <PairSelect label={t("form.mf_merokok")} id="rokok" value={cv.rokok} pairs={YA_TIDAK_PAIRS}
                  touched={touchedFields.has('rokok')} onChange={(v) => handlePairEdit('rokok', v)} />
                <PairSelect label={t("form.mf_alkohol")} id="alkohol" value={cv.alkohol} pairs={YA_TIDAK_PAIRS}
                  touched={touchedFields.has('alkohol')} onChange={(v) => handlePairEdit('alkohol', v)} />
              </div>
              <div class="col-span-4 space-y-1 mt-2 p-2 bg-slate-800/40 rounded border border-slate-700/50">
                <TextAreaPair groupLabel={t("form.mf_alergi")} idId="alergi_id" idJp="alergi_jp" valueId={cv.alergi_id} valueJp={cv.alergi_jp} onChange={updateCv} />
                <TextAreaPair groupLabel={t("form.mf_penyakit")} idId="medis_id" idJp="medis_jp" valueId={cv.medis_id} valueJp={cv.medis_jp} onChange={updateCv} />
                <TextAreaPair groupLabel={t("cv.field_laka")} idId="laka_id" idJp="laka_jp" valueId={cv.laka_id} valueJp={cv.laka_jp} onChange={updateCv} />
              </div>
            </Section>
          </div>

          <Section title={t("ai_cv.sec_jiko")} icon="fa-comments" color="purple" borderLeft>
            <div class="mb-2">
              <PairSelect label={t("cv.field_riwayat_jp")} id="riwayatjepang" value={cv.riwayatjepang} pairs={RIWAYAT_JEPANG_PAIRS}
                touched={touchedFields.has('riwayatjepang')} onChange={(v) => handlePairEdit('riwayatjepang', v)} />
            </div>
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
                  <Field label={t("cv.field_lama_jp")} id="lama" value={cv.lama} center unit="thn"
                    touched={touchedFields.has('lama')} onInput={(v) => handleManualEdit('lama', v)} />
                  <Field label={t("cv.field_target_gaji")} id="gaji_yen" value={cv.gaji_yen} center jp unit="yen"
                    touched={touchedFields.has('gaji_yen')} onInput={(v) => handleManualEdit('gaji_yen', v)} />
                  <Field label={t("cv.field_target_nabung")} id="tabungan" value={cv.tabungan} center jp
                    touched={touchedFields.has('tabungan')} onInput={(v) => handleManualEdit('tabungan', v)} />
                </div>
              </div>
            </div>
          </Section>

          <div class="u-grid-auto u-grid-auto--cards gap-3 mb-3">
            <Section title={t("ai_cv.sec_pendidikan")} icon="fa-graduation-cap" color="emerald">
              <div class="grid grid-cols-3 gap-1.5 p-1.5 bg-slate-800/50 rounded border border-slate-700 mb-2">
                {/* These keep `list=` for suggestion but are now editable, so the
                    datalist finally does what it was meant to: the AI's value is
                    corrected against the official JFT/SSW spellings instead of
                    being locked in with a typo. */}
                <Field label={t("cv.field_bhs_jepang")} id="bhs_jepang" value={cv.bhs_jepang} list="ai_jft_options"
                  touched={touchedFields.has('bhs_jepang')} onInput={(v) => handleManualEdit('bhs_jepang', v)} />
                <Field label={t("cv.field_nilai_jp")} id="nilai" value={cv.nilai}
                  touched={touchedFields.has('nilai')} onInput={(v) => handleManualEdit('nilai', v)} />
                <Field label={t("cv.field_lisensi_ssw")} id="lisensi" value={cv.lisensi} list="ai_ssw_options"
                  touched={touchedFields.has('lisensi')} onInput={(v) => handleManualEdit('lisensi', v)} />
              </div>
              <datalist id="ai_jft_options">
                {JFT_OPTIONS.map(o => <option key={o} value={o} />)}
              </datalist>
              <datalist id="ai_ssw_options">
                {SSW_OPTIONS.map(o => <option key={o} value={o} />)}
              </datalist>
              {/* Dynamic rows, capped at the legacy maximum (EDU_MAX). The cap is
                  a property of the printed CV template: a sixth row would be
                  dropped at render time, so the form must not accept one. */}
              {eduList.map((edu, i) => (
                <RepeaterRow key={i} index={i} label={t('ai_cv.row_pendidikan')}
                  removable={eduList.length > 1}
                  onRemove={() => setEduList(l => l.filter((_, j) => j !== i))}>
                  <div class="grid grid-cols-2 gap-2">
                    <RowSelect label={t('ai_cv.row_tingkat')} id={`ai-edu-tingkat-${i}`} value={edu.tingkat}
                      options={levelOptions(edu.tingkat)}
                      onChange={(v) => setEduList(l => sortEduRows(l.map((r, j) => j === i ? { ...r, tingkat: v } : r)))} />
                    <MonthYearField label={t('ai_cv.row_masuk')} id={`ai-edu-masuk-${i}`} value={edu.masuk}
                      yearLabel={t('cv.field_year')} monthLabelText={t('cv.field_month')}
                      onChange={(v) => setEduList(l => l.map((r, j) => j === i ? { ...r, masuk: v } : r))} />
                    <Field label={t('ai_cv.row_sekolah')} id={`edu-sekolah-id-${i}`} value={edu.sekolah_id}
                      onInput={(v) => setEduList(l => l.map((r, j) => j === i ? { ...r, sekolah_id: v } : r))} />
                    <Field label={t('ai_cv.row_sekolah_jp')} id={`edu-sekolah-jp-${i}`} value={edu.sekolah_jp} jp
                      onInput={(v) => setEduList(l => l.map((r, j) => j === i ? { ...r, sekolah_jp: v } : r))} />
                    <Field label={t('ai_cv.row_jurusan')} id={`edu-jurusan-id-${i}`} value={edu.jurusan_id}
                      onInput={(v) => setEduList(l => l.map((r, j) => j === i ? { ...r, jurusan_id: v } : r))} />
                    <Field label={t('ai_cv.row_jurusan_jp')} id={`edu-jurusan-jp-${i}`} value={edu.jurusan_jp} jp
                      onInput={(v) => setEduList(l => l.map((r, j) => j === i ? { ...r, jurusan_jp: v } : r))} />
                    <MonthYearField label={t('ai_cv.row_lulus')} id={`ai-edu-lulus-${i}`} value={edu.lulus}
                      yearLabel={t('cv.field_year')} monthLabelText={t('cv.field_month')}
                      onChange={(v) => setEduList(l => l.map((r, j) => j === i ? { ...r, lulus: v } : r))} />
                  </div>
                </RepeaterRow>
              ))}
              {eduList.length < EDU_MAX && (
                <button type="button" onClick={() => setEduList(l => [...l, { ...EMPTY_EDU }])}
                  class="text-sky-400 text-[11px] font-bold mb-1">
                  <Icon name="plus" class="mr-1" />{t('ai_cv.row_tambah')}
                </button>
              )}
            </Section>
            <Section title={t("ai_cv.sec_pekerjaan")} icon="fa-briefcase" color="blue">
              {jobList.map((job, i) => (
                <RepeaterRow key={i} index={i} label={t('ai_cv.row_pekerjaan')}
                  removable={jobList.length > 1}
                  onRemove={() => setJobList(l => l.filter((_, j) => j !== i))}>
                  <div class="grid grid-cols-2 gap-2">
                    <Field label={t('ai_cv.row_perusahaan')} id={`job-perusahaan-id-${i}`} value={job.perusahaan_id}
                      onInput={(v) => setJobList(l => l.map((r, j) => j === i ? { ...r, perusahaan_id: v } : r))} />
                    <Field label={t('ai_cv.row_perusahaan_jp')} id={`job-perusahaan-jp-${i}`} value={job.perusahaan_jp} jp
                      onInput={(v) => setJobList(l => l.map((r, j) => j === i ? { ...r, perusahaan_jp: v } : r))} />
                    <ComboSelect label={t('ai_cv.row_jabatan')} id={`job-jabatan-id-${i}`} value={job.jabatan_id}
                      pairs={PEKERJAAN} placeholder={t('ai_cv.combo_hint')}
                      onInput={(v) => setJobList(l => l.map((r, j) => j === i ? { ...r, jabatan_id: v } : r))}
                      onPick={(v) => setJobList(l => l.map((r, j) => {
                        if (j !== i) return r;
                        const jp = v ? jpOf(PEKERJAAN, v) : '';
                        // A hit fills the kanji from the registry; free text
                        // leaves whatever is there so the candidate can write it
                        // themselves. Never blank it — that would erase a
                        // translation on the next keystroke.
                        return { ...r, jabatan_jp: jp || r.jabatan_jp };
                      }))} />
                    <Field label={t('ai_cv.row_jabatan_jp')} id={`job-jabatan-jp-${i}`} value={job.jabatan_jp} jp
                      onInput={(v) => setJobList(l => l.map((r, j) => j === i ? { ...r, jabatan_jp: v } : r))} />
                    <MonthYearField label={t('ai_cv.row_masuk')} id={`ai-job-masuk-${i}`} value={job.masuk}
                      yearLabel={t('cv.field_year')} monthLabelText={t('cv.field_month')}
                      onChange={(v) => setJobList(l => l.map((r, j) => j === i ? { ...r, masuk: v } : r))} />
                    <MonthYearField label={t('ai_cv.row_keluar')} id={`ai-job-keluar-${i}`} value={job.keluar}
                      yearLabel={t('cv.field_year')} monthLabelText={t('cv.field_month')}
                      onChange={(v) => setJobList(l => l.map((r, j) => j === i ? { ...r, keluar: v } : r))} />
                    <Field label={t('ai_cv.row_gaji')} id={`job-gaji-${i}`} value={job.gaji}
                      onInput={(v) => setJobList(l => l.map((r, j) => j === i ? { ...r, gaji: v } : r))} />
                  </div>
                </RepeaterRow>
              ))}
              {jobList.length < JOB_MAX && (
                <button type="button" onClick={() => setJobList(l => [...l, { ...EMPTY_JOB }])}
                  class="text-sky-400 text-[11px] font-bold mb-1">
                  <Icon name="plus" class="mr-1" />{t('ai_cv.row_tambah')}
                </button>
              )}
            </Section>
            <Section title={t("ai_cv.sec_keluarga")} icon="fa-users" color="orange">
              {famList.map((fam, i) => (
                <RepeaterRow key={i} index={i} label={t('ai_cv.row_keluarga')}
                  removable={famList.length > 1}
                  onRemove={() => setFamList(l => l.filter((_, j) => j !== i))}>
                  <div class="grid grid-cols-2 gap-2">
                    <PairSelect label={t('ai_cv.row_hubungan')} id={`fam-hubungan-${i}`} value={fam.hubungan_id}
                      pairs={HUBUNGAN_KELUARGA}
                      onChange={(v) => setFamList(l => l.map((r, j) => {
                        if (j !== i) return r;
                        const jp = jpOf(HUBUNGAN_KELUARGA, v);
                        return { ...r, hubungan_id: v, hubungan_jp: jp || r.hubungan_jp };
                      }))} />
                    <Field label={t('ai_cv.row_nama')} id={`fam-nama-${i}`} value={fam.nama}
                      onInput={(v) => setFamList(l => l.map((r, j) => j === i ? { ...r, nama: v } : r))} />
                    <Field label={t('ai_cv.row_katakana')} id={`fam-katakana-${i}`} value={fam.katakana} jp
                      onInput={(v) => setFamList(l => l.map((r, j) => j === i ? { ...r, katakana: v } : r))} />
                    <Field label={t('form.mf_usia')} id={`fam-umur-${i}`} value={fam.umur} unit="thn"
                      onInput={(v) => setFamList(l => l.map((r, j) => j === i ? { ...r, umur: v } : r))} />
                    <ComboSelect label={t('ai_cv.row_pekerjaan')} id={`fam-pekerjaan-id-${i}`} value={fam.pekerjaan_id}
                      pairs={PEKERJAAN} placeholder={t('ai_cv.combo_hint')}
                      onInput={(v) => setFamList(l => l.map((r, j) => j === i ? { ...r, pekerjaan_id: v } : r))}
                      onPick={(v) => setFamList(l => l.map((r, j) => {
                        if (j !== i) return r;
                        const jp = v ? jpOf(PEKERJAAN, v) : '';
                        return { ...r, pekerjaan_jp: jp || r.pekerjaan_jp };
                      }))} />
                    <Field label={t('ai_cv.row_gaji')} id={`fam-gaji-${i}`} value={fam.gaji}
                      onInput={(v) => setFamList(l => l.map((r, j) => j === i ? { ...r, gaji: v } : r))} />
                  </div>
                </RepeaterRow>
              ))}
              {famList.length < FAM_MAX && (
                <button type="button" onClick={() => setFamList(l => [...l, { ...EMPTY_FAM }])}
                  class="text-sky-400 text-[11px] font-bold mb-1">
                  <Icon name="plus" class="mr-1" />{t('ai_cv.row_tambah')}
                </button>
              )}
            </Section>
          </div>

          <Section title={t("ai_cv.sec_kenalan")} icon="fa-user-friends" color="pink">
            <div class="u-grid-auto u-grid-auto--dense gap-2">
              <Field label={t("cv.field_kenalan_nama_id")} id="kenalan_nama_id" value={cv.kenalan_nama_id}
                touched={touchedFields.has('kenalan_nama_id')} onInput={(v) => handleManualEdit('kenalan_nama_id', v)} />
              <Field label={t("cv.field_kenalan_nama_jp")} id="kenalan_nama_jp" value={cv.kenalan_nama_jp} jp
                touched={touchedFields.has('kenalan_nama_jp')} onInput={(v) => handleManualEdit('kenalan_nama_jp', v)} />
              {/* Relation and occupation are the two paired fields legacy kept
                  in sync (`KENALAN_PAIRS` / `PEKERJAAN_PAIRS`). Choosing the
                  Indonesian term fills the kanji automatically, which is the
                  only way the two columns stay consistent. */}
              <PairSelect label={t("cv.field_kenalan_hub_id")} id="kenalan_hub_id" value={cv.kenalan_hub_id}
                pairs={HUBUNGAN_KELUARGA}
                touched={touchedFields.has('kenalan_hub_id')}
                onChange={(v) => handleManualEdit('kenalan_hub_id', v)} />
              <Field label={t("cv.field_kenalan_hub_jp")} id="kenalan_hub_jp" value={cv.kenalan_hub_jp} jp
                touched={touchedFields.has('kenalan_hub_jp')} onInput={(v) => handleManualEdit('kenalan_hub_jp', v)} />
              <PairSelect label={t("cv.field_kenalan_kerja_id")} id="kenalan_kerja_id" value={cv.kenalan_kerja_id}
                pairs={PEKERJAAN}
                touched={touchedFields.has('kenalan_kerja_id')}
                onChange={(v) => handleManualEdit('kenalan_kerja_id', v)} />
              <Field label={t("cv.field_kenalan_kerja_jp")} id="kenalan_kerja_jp" value={cv.kenalan_kerja_jp} jp
                touched={touchedFields.has('kenalan_kerja_jp')} onInput={(v) => handleManualEdit('kenalan_kerja_jp', v)} />
              <Field label={t("cv.field_kenalan_usia")} id="kenalan_usia" value={cv.kenalan_usia} unit="thn"
                touched={touchedFields.has('kenalan_usia')} onInput={(v) => handleManualEdit('kenalan_usia', v)} />
              <div class="col-span-2 md:col-span-4 mt-1 grid grid-cols-2 gap-2">
                <Field label={t("cv.field_kenalan_alamat_id")} id="kenalan_alamat_id" value={cv.kenalan_alamat_id}
                  touched={touchedFields.has('kenalan_alamat_id')} onInput={(v) => handleManualEdit('kenalan_alamat_id', v)} />
                <Field label={t("cv.field_kenalan_alamat_jp")} id="kenalan_alamat_jp" value={cv.kenalan_alamat_jp} jp
                  touched={touchedFields.has('kenalan_alamat_jp')} onInput={(v) => handleManualEdit('kenalan_alamat_jp', v)} />
              </div>
            </div>
            {/* The occupation suggestion list that stood here is gone. It
                existed to feed two plain text inputs via `list=`, and both are
                now ComboSelects that carry their own list — so nothing pointed
                at it. The test that forbids an unreferenced suggestion list is
                what caught this, rather than a reviewer noticing a dead node.
                (Written without repeating the tag shape: that test scans this
                file as TEXT, so a tag spelled out inside a comment reads as a
                live element to it.) */}
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

/**
 * One repeatable row on a dynamic CV section.
 *
 * Extracted so the three sections (education / work / family) share the delete
 * affordance and the dashed-row look instead of each spelling its own. Legacy
 * rendered these with string-built HTML (`renderEditableArray`), which is why
 * its own docs list "no role attributes / no focus management" among the
 * defects — building the rows as components means the controls are real
 * elements with real labels.
 */
function RepeaterRow({ index, label, onRemove, removable, children }: {
  index: number; label: string; onRemove: () => void; removable: boolean;
  children: preact.ComponentChildren;
}) {
  return (
    <div class="p-2 rounded-lg mb-2 bg-slate-800/40 border border-dashed border-slate-600">
      <div class="flex justify-between items-center mb-2">
        <span class="text-[10px] font-bold text-fg-muted">{label} #{index + 1}</span>
        {removable && (
          <button type="button" onClick={onRemove}
            class="text-rose-400 text-[10px] font-bold hover:text-rose-300"
            aria-label={`${label} ${index + 1}: ${t('button.delete')}`}>
            <Icon name="trash" class="mr-1" />{t('button.delete')}
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

/** A labelled `<select>` for the dynamic rows (school level, year, month). */
function RowSelect({ label, id, value, options, onChange }: {
  label: string; id: string; value: string; options: string[]; onChange: (v: string) => void;
}) {
  return (
    <div>
      <label class="block text-[11px] text-[#e2e8f0] mb-0.5" for={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange((e.target as HTMLSelectElement).value)}
        class="input-micro w-full bg-slate-800 border border-slate-600 rounded p-1 text-[12px] text-white">
        {options.map(o => <option key={o} value={o}>{o || '\u2014'}</option>)}
      </select>
    </div>
  );
}

/**
 * Month + year for a school or employment period.
 *
 * Two controls rather than one `<input type="month">`, and that is the whole
 * point of the component. Legacy used the native month input, which SILENTLY
 * DISCARDS a value it cannot parse — and most stored periods are a bare year
 * ("2021"), because that is all the old form ever asked for. Opening one of
 * those in a month input shows nothing, so saving it writes nothing back: the
 * year disappears with no error anywhere.
 *
 * Splitting the value lets a year-only period be *displayed* as a year, which
 * is what it is, and keeps `joinPeriod` able to return it unchanged. The month
 * stays genuinely optional — no default is invented
 * (see cvPeriod.ts for why that is the property under test).
 *
 * The year is a `<select>`, not a text input: the `masuk`/`lulus` fields feed
 * the CV's chronology, and free-text years were the original cause of a work
 * history that sorted into the wrong order (legacy `ai_form.ts:369-377`).
 */
function MonthYearField({ label, id, value, yearLabel, monthLabelText, onChange }: {
  label: string; id: string; value: string;
  yearLabel: string; monthLabelText: string;
  onChange: (stored: string) => void;
}) {
  const { year, month } = splitPeriod(value);
  /**
   * A month picked before a year has no year to attach to, and
   * `joinPeriod('', '02')` is `''` — so without this the candidate's choice is
   * silently thrown away and the year they pick a moment later arrives with the
   * month already forgotten. Remembering it here makes the two controls
   * order-independent, which matters because "month, then year" is the order
   * the fields are laid out in.
   *
   * It is pending state, not stored state: it never reaches `onChange` until a
   * year exists, so a half-filled period is never written to the payload.
   */
  const [pendingMonth, setPendingMonth] = useState('');
  const liveMonth = month || pendingMonth;

  const emit = (y: string, m: string) => {
    if (!y) { setPendingMonth(m); return; }   // hold the month until there is a year
    setPendingMonth('');
    onChange(joinPeriod(y, m));
  };
  return (
    <div>
      <span class="block text-[11px] text-[#e2e8f0] mb-0.5">{label}</span>
      <div class="flex gap-1">
        <select id={`${id}-month`} aria-label={monthLabelText}
          value={liveMonth} onChange={(e) => emit(year, (e.target as HTMLSelectElement).value)}
          class="input-micro flex-1 min-w-0 bg-slate-800 border border-slate-600 rounded p-1 text-[12px] text-white">
          {monthOptions().map(m => <option key={m} value={m}>{m ? monthLabel(m) : '\u2014'}</option>)}
        </select>
        <select id={`${id}-year`} aria-label={yearLabel}
          value={year} onChange={(e) => emit((e.target as HTMLSelectElement).value, liveMonth)}
          class="input-micro flex-1 min-w-0 bg-slate-800 border border-slate-600 rounded p-1 text-[12px] text-white">
          {yearOptions(year).map(y => <option key={y} value={y}>{y || '\u2014'}</option>)}
        </select>
      </div>
    </div>
  );
}

/**
 * One labelled control on the CV.
 *
 * `readonly` is NOT the default any more. Legacy `enableManualPreview()`
 * (`ai_form.ts:438-459`) removed `readonly` from every input and textarea at
 * init, so the candidate could always correct what the AI had written — the
 * header label "Edit manual aktif" was true. The port left every field locked,
 * which meant an AI mistranslation could not be fixed by the person who knows
 * the answer. Locking is now opt-in via `readonly`, and it is used only for
 * values the candidate must not touch (nothing, currently).
 *
 * `touched` marks a field the candidate edited by hand. Legacy painted those
 * `border-sky-400`; the point is that a human correction must stay visibly
 * distinguishable from an AI guess when the two disagree.
 */
function Field({ label, id, value, readonly, center, jp, span, spanMd, unit, type, list, onInput, touched }: {
  label: string; id: string; value: string; readonly?: boolean; center?: boolean;
  jp?: boolean; span?: number; spanMd?: number; unit?: Unit; type?: string; list?: string;
  onInput?: (value: string) => void; touched?: boolean;
}) {
  const spanClass = span === 3 ? 'col-span-3' : span === 2 ? 'col-span-2' : '';
  const mdSpanClass = spanMd === 3 ? 'md:col-span-3' : spanMd === 2 ? 'md:col-span-2' : '';
  const domId = `ai_${id}`;
  return (
    <div class={`${spanClass} ${mdSpanClass}`}>
      <label class="block text-[11px] text-[#e2e8f0] mb-0.5" for={domId}>{label}</label>
      <div class="relative">
        <input id={domId} type={type || 'text'} value={value} readonly={readonly} list={list}
          onInput={onInput ? (e) => onInput((e.target as HTMLInputElement).value) : undefined}
          class={`input-micro w-full bg-slate-800 border ${touched ? 'border-sky-400' : 'border-slate-600'} rounded p-1 text-[12px] ${center ? 'text-center' : ''} ${unit ? 'pr-7' : ''} ${jp ? 'text-pink-300 font-bold' : 'text-white'}`} />
        {unit && (
          <span class="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-fg-subtle pointer-events-none">{unit}</span>
        )}
      </div>
    </div>
  );
}

/**
 * A paired ID↔JP field, rendered as a real `<select>`.
 *
 * Legacy built these at runtime (`enableStaticPairSelects`, `ai_form.ts:475-515`)
 * by replacing the `<input readonly>` in the DOM. Doing it declaratively means
 * the control exists in the source, so it can be tested and cannot silently
 * fail to attach.
 *
 * The label shows both halves — `MENIKAH（既婚）` — because a candidate who only
 * reads Indonesian still needs to recognise the kanji the employer will see.
 * The stored value is always the ID half; `onChange` receives it and the pair
 * registry fills the JP column.
 */
function PairSelect({ label, id, value, pairs, span, spanMd, onChange, touched, testId }: {
  label: string; id: string; value: string; pairs: Opsi[]; span?: number; spanMd?: number;
  onChange: (value: string) => void; touched?: boolean; testId?: string;
}) {
  const spanClass = span === 3 ? 'col-span-3' : span === 2 ? 'col-span-2' : '';
  const mdSpanClass = spanMd === 3 ? 'md:col-span-3' : spanMd === 2 ? 'md:col-span-2' : '';
  // A value the registry does not know (typed by an older AI, or free text from
  // a previous session) is kept as its own option rather than silently dropped.
  // Legacy did the same, and dropping it would erase stored data on first edit.
  const known = pairs.some(([v]) => v === value);
  const domId = `ai_${id}`;
  return (
    <div class={`${spanClass} ${mdSpanClass}`}>
      <label class="block text-[11px] text-[#e2e8f0] mb-0.5" for={domId}>{label}</label>
      <select id={domId} data-testid={testId}
        value={value}
        onChange={(e) => onChange((e.target as HTMLSelectElement).value)}
        class={`input-micro w-full bg-slate-800 border ${touched ? 'border-sky-400' : 'border-slate-600'} rounded p-1 text-[12px] text-white`}>
        <option value="">{'\u2014'}</option>
        {pairs.map(([v, l]) => <option key={v} value={v}>{pairDisplay(v, l)}</option>)}
        {!known && value && <option value={value}>{value}</option>}
      </select>
    </div>
  );
}

/**
 * Type-to-filter input with an auto-appearing suggestion list.
 *
 * The owner asked for this shape explicitly — "jgn dropdown bikin model ketikan
 * bila ada auto milih dropdown tersebut" — and it is the right control for the
 * occupation lists specifically, because a plain `<select>` over 100 entries is
 * unusable on a phone while a plain text input loses the pairing: the CV has an
 * ID column and a kanji column, and if the candidate types free text nothing can
 * fill the second one.
 *
 * So the behaviour is chosen per keystroke:
 *
 *   - text matches a list entry exactly → that entry is selected, and the
 *     caller receives it through `onPick`, so the JP column is filled from the
 *     registry (`jpOf`) rather than being left for the candidate to hand-write.
 *   - text does not match anything → it is kept verbatim and `onPick('')`
 *     fires, which marks the JP half manual. A candidate whose job is not on the
 *     list is never blocked, and never silently loses what they typed.
 *
 * Suggestions appear on focus and filter as they type. Keyboard: ArrowUp/Down
 * move, Enter accepts, Escape closes the list without clearing the text.
 *
 * `role="combobox"` + `aria-expanded` + `aria-autocomplete="list"` are not
 * decoration: a screen reader that is told this is a plain text box will not
 * announce that a list of 100 options is available underneath it.
 */
function ComboSelect({ label, id, value, pairs, placeholder, onInput, onPick, span, spanMd }: {
  label: string; id: string; value: string; pairs: Opsi[]; placeholder?: string;
  onInput: (text: string) => void; onPick: (value: string) => void;
  span?: number; spanMd?: number;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const spanClass = span === 3 ? 'col-span-3' : span === 2 ? 'col-span-2' : '';
  const mdSpanClass = spanMd === 3 ? 'md:col-span-3' : spanMd === 2 ? 'md:col-span-2' : '';
  const domId = `ai_${id}`;
  const listId = `${domId}-list`;

  const q = (value || '').trim().toLowerCase();
  // Filter on BOTH halves: a candidate who knows the job by its Japanese name
  // should find it too, and legacy's manual box was kanji-agnostic.
  const matches = q
    ? pairs.filter(([v, l]) => v.toLowerCase().includes(q) || labelJp(l).includes(value.trim()))
    : pairs;
  const shown = matches.slice(0, 50);

  // Close on outside click. Not merely cosmetic: without it the list floats over
  // the next row's controls and swallows the click that was meant for them.
  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [open]);

  const choose = (v: string) => {
    onInput(v); onPick(v); setOpen(false); setActive(-1);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      setActive(a => {
        const next = e.key === 'ArrowDown' ? a + 1 : a - 1;
        if (next < -1) return shown.length - 1;
        if (next >= shown.length) return -1;
        return next;
      });
      return;
    }
    if (e.key === 'Enter' && open && active >= 0 && shown[active]) { e.preventDefault(); choose(shown[active][0]); return; }
    if (e.key === 'Escape') { setOpen(false); setActive(-1); }
  };

  return (
    <div class={`${spanClass} ${mdSpanClass}`} ref={wrapRef}>
      <label class="block text-[11px] text-[#e2e8f0] mb-0.5" for={domId}>{label}</label>
      <div class="relative">
        <input id={domId} type="text" value={value} placeholder={placeholder}
          autocomplete="off" role="combobox" aria-expanded={open} aria-controls={listId}
          aria-autocomplete="list" aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          onInput={(e) => {
            const text = (e.target as HTMLInputElement).value;
            onInput(text);
            // An exact hit resolves the pair immediately; anything else marks the
            // JP half manual by reporting no match.
            const hit = pairs.find(([v]) => v === text.trim());
            onPick(hit ? hit[0] : '');
            setOpen(true); setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          class="input-micro w-full bg-slate-800 border border-slate-600 rounded p-1 text-[12px] text-white" />
        {open && (
          <ul id={listId} class="absolute z-20 left-0 right-0 mt-0.5 max-h-48 overflow-auto bg-slate-800 border border-slate-600 rounded shadow-lg">
            {shown.length === 0 && (
              <li class="px-2 py-1 text-[11px] text-slate-400">{t('ai_cv.combo_manual')}</li>
            )}
            {shown.map(([v, l], idx) => (
              <li key={v} id={`${listId}-${idx}`}
                onMouseDown={(e) => { e.preventDefault(); choose(v); }}
                class={`px-2 py-1 text-[11px] cursor-pointer ${idx === active ? 'bg-sky-600 text-white' : 'text-slate-200 hover:bg-slate-700'}`}>
                {pairDisplay(v, l)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * The Japanese half of a paired field, editable in place.
 *
 * A pair is two columns on the printed CV, not one. `PairSelect` fills this from
 * the registry, but the candidate must still be able to correct the kanji when
 * the registry's wording does not fit (legacy `enableManualPreview()` made every
 * input editable — including these — and the port had dropped them entirely, so
 * the kanji column was always empty on submit).
 */
function JpField({ label, id, value, span, onInput, touched }: {
  label: string; id: string; value: string; span?: number;
  onInput: (value: string) => void; touched?: boolean;
}) {
  const spanClass = span === 3 ? 'col-span-3' : span === 2 ? 'col-span-2' : '';
  const domId = `ai_${id}`;
  return (
    <div class={spanClass}>
      <label class="block text-[11px] text-fg-subtle mb-0.5" for={domId}>{label}</label>
      <input id={domId} type="text" value={value} lang="ja"
        onInput={(e) => onInput((e.target as HTMLInputElement).value)}
        class={`input-micro w-full bg-slate-800 border ${touched ? 'border-sky-400' : 'border-slate-600'} rounded p-1 text-[12px] text-pink-300 font-bold`} />
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
