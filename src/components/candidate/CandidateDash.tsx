/**
 * CandidateDash.tsx — Candidate dashboard matching legacy 100%
 * Source: legacy/index.html page-kandidat (lines 840-1039)
 * Features: Student Card, tahapan pipeline, badge system, pemberkasan, all modals
 */
import { useState, useEffect } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import { authStore } from '../../store/authReactive';
import { langStore, t } from '../../store/i18n';
import ChangePasswordModal from '../ChangePasswordModal';
import CvMiniModal from '../CvMiniModal';
import InterviewSimulatorModal from './InterviewSimulatorModal';
import { isVipCatatan, ASJ_LOGO_URL } from '../../lib/vip';
import RirekishoBuilder from '../admin/RirekishoBuilder';
import CvTemplateSelector from '../CvTemplateSelector';
import EsignNaiteiModal, { allowedTahapanEsign } from '../EsignNaiteiModal';
import PemberkasanModal from '../admin/PemberkasanModal';
import { uploadBerkasToStorage } from "../../lib/uploadBerkas";
import { showToast } from "../Toast";
import Icon from '../ui/Icon';
import { apiClient } from '../../lib/apiClient';
import { ALL_BERKAS, hasBerkasUrl } from '../../lib/berkasCatalog';
import { computeCvMiniProgress, computeCvMasterProgress, computeOverallProgress } from '../../lib/profileProgress';
import LevelCard from './LevelCard';
import StepGuide from './StepGuide';
import { ErrorBoundary } from '../ErrorBoundary';

// `feedback` = `feedback_berkas` dari database_asj_form. Dipakai untuk
// memisahkan baris LAMARAN dari baris BIODATA/DOKUMEN (lihat isBiodataRow):
// baris biodata membawa penanda '[BIODATA] …' / '[UPLOAD <LABEL>]' dan
// code_job kosong, jadi ia tidak boleh memakai kosakata verifikasi lamaran.
type Riwayat = { jobCode: string; tahapan: string; status: string; tanggal: string; kategori?: string; feedback?: string; };
type CandidateData = {
  nama: string; wa: string; job: string; tahapan: string; status: string;
  isVIP: boolean; isSiswaASJ?: boolean; kelas?: string; idKandidat?: string;
  /** catatan internal mentah — sumber tag [VIP]/[KELAS x] utk gate wawancara (A16). */
  catatanInt?: string;
  cvMiniProgress: number; cvMasterProgress: number;
  riwayat: Riwayat[];
  jadwal: { id: string; nama: string; waktu: string; lokasi: string; link: string; }[];
  catatan: string; catatanExt?: string;
  berkasProgress: number; berkasTotal: number;
  berkasList: { label: string; done: boolean; }[];
  /** Map pendek berkas (kunci pemberkasan_checklist/master) utk prefill modal. */
  berkas?: Record<string, string>;
  /** Map pendek biodata (kunci c.bio) utk prefill modal. */
  bio?: Record<string, string>;
  /** Field CV mini (row mapCandidate ter-dekorasi) utk prefill modal — A09. */
  cvmini?: { gender: string; usia: string; tb: string; bb: string; pendidikan: string; jftText: string; sswText: string; } | null;
  /** pas_photo baris (mapCandidate) — fallback foto preview CV/rirekisho (A10). */
  pasPhoto?: string;
  needRevision: boolean; revisionNote: string;
  applications?: { code: string; cv: string; status: string; tahapan: string; }[];
};

// Hasil getAppData('kandidat') di backend = { candidates: [row],
// kandidatRiwayat, mySchedules } — row sudah di-dekorasi attachBerkasBio
// (berkas/bio) + attachApplications. Dashboard lama membaca `kandidatData`
// (kontrak GAS legacy) yang tidak pernah dikembalikan rebuild → semua field
// kosong & progres pemberkasan palsu 0/x. Adapter A05 (2026-09-04).
type KandidatApi = Record<string, any>;

function statusBadgeClass(status: string) {
  const s = (status || '').toUpperCase();
  if (s.includes('MENUNGGU') || s.includes('BARU') || s.includes('PENDING'))
    return 'bg-amber-900/40 text-amber-400 border-amber-500/30';
  if (s.includes('REVIEW') || s.includes('DIBACA') || s.includes('PROSES'))
    return 'bg-sky-900/40 text-sky-400 border-sky-500/30';
  if (s.includes('LULUS') || s.includes('APPROVE') || s.includes('LOLOS'))
    return 'bg-emerald-900/40 text-emerald-400 border-emerald-500/30';
  if (s.includes('GAGAL') || s.includes('REJECT') || s.includes('TOLAK'))
    return 'bg-red-900/40 text-red-400 border-red-500/30';
  return 'bg-slate-800 text-slate-300 border-slate-600';
}

function statusIcon(status: string) {
  const s = (status || '').toUpperCase();
  if (s.includes('MENUNGGU') || s.includes('BARU') || s.includes('PENDING')) return 'fa-clock';
  if (s.includes('REVIEW') || s.includes('DIBACA') || s.includes('PROSES')) return 'fa-user-check';
  if (s.includes('LULUS') || s.includes('APPROVE') || s.includes('LOLOS')) return 'fa-check-circle';
  if (s.includes('GAGAL') || s.includes('REJECT') || s.includes('TOLAK')) return 'fa-times-circle';
  return 'fa-info-circle';
}

/**
 * Apakah baris riwayat ini benar-benar LAMARAN LOKER, atau hanya baris
 * biodata/dokumen?
 *
 * `database_asj_form` menyimpan dua jenis baris dalam satu tabel:
 *
 *   (a) lamaran loker sungguhan   -> code_job terisi ('KODE-JOB')
 *   (b) biodata / update dokumen  -> code_job KOSONG; penandanya ada di
 *       feedback_berkas sebagai '[BIODATA] …' atau '[UPLOAD <LABEL>]'
 *
 * Konsekuensinya fatal kalau tidak dibedakan: keduanya melewati jalur approve
 * yang sama, jadi menyetujui scan paspor menulis status mail 'LULUS' — dan
 * baris biodata itu ikut menampilkan "Telah disetujui admin" seolah ada
 * LAMARAN yang diterima. Itu juga yang membuat tahapan seleksi terlihat maju.
 *
 * Baris (b) TIDAK BOLEH memakai kosakata verifikasi lamaran. Dipisah di sini,
 * bukan di `statusText`, supaya kedua pemanggil bisa memilih kosakata yang
 * benar alih-alih berbagi satu teks yang salah untuk salah satunya.
 */
function isBiodataRow(r: Riwayat) {
  if (String(r.jobCode || '').trim() && r.jobCode !== '-') return false;
  const marker = String((r as { feedback?: string }).feedback || '').toUpperCase();
  return marker.includes('[BIODATA]') || marker.includes('[UPLOAD ');
}

/**
 * Status → teks untuk kandidat.
 *
 * `LULUS` sengaja TIDAK memakai `form.txt_lamaran_lulus` ("Lamaran Lulus").
 * Server sudah menyebut peristiwanya sebagai persetujuan — push notification
 * di contexts/applications/service.ts:141 berbunyi "Lamaran ... disetujui!" /
 * "telah disetujui", dan event domainnya bernama `application.approved`. UI
 * yang menulis "Lulus" membuat kandidat membaca ini sebagai kelulusan tahapan
 * seleksi, padahal yang disetujui admin adalah BERKAS/dokumennya.
 *
 * Karena itu teksnya menyebut objek yang disetujui: "Berkas telah disetujui
 * admin" untuk baris dokumen, "Telah disetujui admin" untuk lamaran loker.
 * Satu kolom `status_biodata` di database (migrasi 013) adalah sumber yang
 * benar; sampai kolom itu diproyeksikan ke sini, penanda baris dipakai agar
 * dashboard berhenti mengklaim hal yang belum terjadi.
 */
function statusText(status: string, biodata = false) {
  const s = (status || '').toUpperCase();
  if (s.includes('MENUNGGU') || s.includes('BARU') || s.includes('PENDING'))
    return biodata ? t('ui.biodata_menunggu') : t('form.txt_menunggu_review');
  if (s.includes('REVIEW') || s.includes('DIBACA') || s.includes('PROSES'))
    return t('form.txt_review_admin');
  if (s.includes('LULUS') || s.includes('APPROVE') || s.includes('LOLOS'))
    return biodata ? t('ui.biodata_approved_by_admin') : t('ui.status_approved_by_admin');
  if (s.includes('GAGAL') || s.includes('REJECT') || s.includes('TOLAK'))
    return t('form.txt_lamaran_gagal');
  return t('form.txt_diproses');
}

// Tahapan pipeline steps
const TAHAPAN_STEPS = ['PENDAFTARAN', 'CHECK KAIWA', 'MENDAN', 'LOLOS USER', 'MCU', 'PEMBERKASAN', 'NAITEI', 'COE', 'VISA', 'FLIGHT'];
function tahapanStepIndex(tahapan: string) {
  const t = (tahapan || '').toUpperCase();
  for (let i = 0; i < TAHAPAN_STEPS.length; i++) {
    if (t.includes(TAHAPAN_STEPS[i])) return i;
  }
  return 0;
}

function CrownBadge({ progress }: { progress: number }) {
  if (progress >= 100) return <span class="text-lg" title={t("candidate.badge_gold_title")}>👑</span>;
  if (progress >= 50) return <span class="text-lg" title={t("candidate.badge_silver_title")}>🥈</span>;
  if (progress > 0) return <span class="text-lg" title={t("candidate.badge_bronze_title")}>🥉</span>;
  return null;
}

export default function CandidateDash() {
  const user = useStore(authStore);
  const _lang = useStore(langStore);
  const [data, setData] = useState<CandidateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showCvMiniModal, setShowCvMiniModal] = useState(false);
  const [showESign, setShowESign] = useState(false);
  const [showPemberkasan, setShowPemberkasan] = useState(false);
  const [showRirekisho, setShowRirekisho] = useState(false);
const [showCvTemplateSelector, setShowCvTemplateSelector] = useState(false);
  const [showInterview, setShowInterview] = useState(false);
  const [selectedLoker, setSelectedLoker] = useState<string | null>(null);

  useEffect(() => { loadDashboard(); }, []);

  // Refresh setelah aksi modal (upload berkas / simpan biodata) men-dispatch
  // candidates-changed — supaya progres & prefill tidak basi (A05).
  useEffect(() => {
    const h = () => { loadDashboard(); };
    window.addEventListener('candidates-changed', h);
    return () => window.removeEventListener('candidates-changed', h);
  }, []);

  async function loadDashboard() {
    try {
      const wa = user.wa || JSON.parse(localStorage.getItem('asj_kandidat_session') || '{}').wa;
      if (!wa) { window.location.href = '/'; return; }
      // ── LEWAT apiClient, BUKAN fetch mentah ──────────────────────────────
      // `getAppData` ADA di CACHEABLE_READS. Fetch mentah melewati cache baca
      // 30 s di apiClient, jadi payload yang sama ditarik ulang setiap mount —
      // cacat yang persis sama sudah diperbaiki di TabKelola (§26), dan
      // CandidateDash adalah sisa terbesarnya.
      //
      // DUA OPSI DI BAWAH DIPILIH UNTUK MEMPERTAHANKAN PERILAKU, bukan untuk
      // memperbaikinya, supaya perubahan ini punya tepat SATU akibat:
      //
      //   requireAuth: false  Perilaku lama mengirim permintaan dengan token apa
      //                       pun yang ada — termasuk token kosong — lalu membaca
      //                       `success` dari badan jawaban. Menuntut sesi di sini
      //                       akan mengubah SIAPA yang boleh memuat dashboard,
      //                       dan perubahan ini soal cache, bukan soal sesi.
      //   onSessionInvalid:   Perilaku lama pada sesi mati: `success:false`,
      //     'throw'           dashboard tetap kosong. Default 'logout' akan
      //                       menambah toast + logout + redirect global — aksi
      //                       sesi yang tidak diminta siapa pun di sini.
      //
      // `silent: true` juga mempertahankan apa adanya: catch di bawah hanya
      // mencatat ke konsol dan tidak pernah menampilkan toast, jadi membiarkan
      // apiClient menambah toast akan mengubah permukaan error pada saat yang
      // sama. Itu keputusan UX tersendiri, bukan efek samping konversi ini.
      const result: KandidatApi = await apiClient('getAppData', ['kandidat'], {
        requireAuth: false,
        onSessionInvalid: 'throw',
        silent: true,
      });
      if (result.success) {
        const row: any = (Array.isArray(result.candidates) && result.candidates[0]) || null;
        const legacyD = result.kandidatData || {};
        const catatanInt = row?.catatanInt || row?.catatan || '';
        const berkasMap: Record<string, string> = row?.berkas || legacyD.berkas || {};
        // Catatan mentah disimpan utk gate VIP/KELAS wawancara (parity legacy
        // bukaSimulatorInterview → isVipCatatan pada catatanInt sendiri).
        const kelasMatch = /\[KELAS\s*([A-Z0-9]+)\]/i.exec(String(catatanInt));
        const berkasList = ALL_BERKAS.map((def) => ({
          label: def.label,
          done: hasBerkasUrl(berkasMap[def.key]),
        }));
        setData({
          nama: row?.nama || legacyD.nama || user.name || 'Kandidat', wa,
          job: row?.idLoker || legacyD.job || '-', tahapan: row?.tahapan || legacyD.tahapan || '-',
          status: row?.status || legacyD.status || '-',
          isVIP: /\[VIP\]/i.test(catatanInt) || !!legacyD.isVIP,
          isSiswaASJ: !!row?.isSiswaASJ || !!legacyD.isSiswaASJ,
          catatanInt,
          kelas: (kelasMatch && kelasMatch[1]) || legacyD.kelas || '',
          idKandidat: row?.idKandidat || legacyD.idKandidat || '',
          // Progres profil DIHITUNG dari data nyata baris kandidat + objek bio,
          // bukan dibaca dari `result.kandidatData` yang tidak pernah dikirim
          // backend (lihat src/lib/profileProgress.ts untuk bukti lengkap).
          // `legacyD.cv*Progress` dipertahankan sebagai fallback HANYA untuk
          // kompatibilitas bila suatu saat backend mengirimnya lagi.
          cvMiniProgress: legacyD.cvMiniProgress ?? computeCvMiniProgress(row),
          cvMasterProgress: legacyD.cvMasterProgress ?? computeCvMasterProgress(row?.bio),
          riwayat: (result.kandidatRiwayat || legacyD.riwayat || []).map((a: any) => ({
            jobCode: a.code || a.jobCode || '-', tahapan: a.tahapan || '-',
            status: a.status || '-', tanggal: a.timestamp || a.tanggal || '',
            kategori: a.kategori || '', cv: a.cv || '',
            // Pembeda lamaran vs biodata. Tanpa ini baris biodata tampil
            // sebagai "Telah disetujui admin" padahal tidak ada lamaran.
            feedback: a.feedback || a.feedback_berkas || '',
          })),
          jadwal: (result.mySchedules || legacyD.jadwal || []).map((s: any) => ({
            id: s.id || '', nama: s.agenda || s.nama || '', waktu: s.waktu || '',
            lokasi: s.lokasi || '', link: s.link || '',
          })),
          catatan: row?.catatan || legacyD.catatan || '',
          catatanExt: row?.catatanExt || legacyD.catatanExt || '',
          berkasProgress: berkasList.length
            ? Math.round((berkasList.filter((b) => b.done).length / berkasList.length) * 100)
            : 0,
          berkasTotal: berkasList.length,
          berkasList,
          berkas: berkasMap,
          bio: row?.bio || legacyD.bio || {},
          // A09 CV-mini prefill — sama dgn legacy bukaModalCvMini yang membaca
          // baris kandidat sendiri (gender/usia/tb/bb/pendidikan/jftText/sswText).
          cvmini: row
            ? {
                gender: String(row?.gender || ''),
                usia: String(row?.usia || ''),
                tb: String(row?.tb || ''),
                bb: String(row?.bb || ''),
                pendidikan: String(row?.pendidikan || ''),
                jftText: String(row?.jftText || ''),
                sswText: String(row?.sswText || ''),
              }
            : null,
          pasPhoto: String(row?.pasPhoto || ''),
          needRevision: !!legacyD.needRevision, revisionNote: legacyD.revisionNote || '',
          applications: row?.applications || legacyD.applications || [],
        });
      }
    } catch (e) { console.error('[CandidateDash]', e); }
    finally { setLoading(false); }
  }

  if (loading) return <div class="text-center py-12"><Icon spin name="spinner" class="text-3xl text-emerald-400 mb-4" /><p class="text-slate-400">{t('ui.loading')}</p></div>;
    function openEsign() {
      // A07 parity bukaModalTtd: kandidat hanya boleh saat tahapan masuk
      // Lolos/Pemberkasan..Naitei; admin selalu bisa (guard tetap backend).
      if (user.role !== 'admin' && !allowedTahapanEsign(data?.tahapan)) {
        showToast(t('ui.toast_naitei_locked'), 'error');
        return;
      }
      setShowESign(true);
    }

    function openInterview() {
      // A16 parity bukaSimulatorInterview: eksklusif VIP / KELAS LPK (tag
      // [VIP] / [KELAS xx] di catatan internal — legacy isVipCatatan).
      if (!(user?.wa || data?.wa)) {
        showToast(t('ui.toast_session_invalid_relogin'), 'error');
        return;
      }
      if (!isVipCatatan(data?.catatanInt)) {
        showToast(t('ui.toast_feature_locked'), 'info');
        return;
      }
      setShowInterview(true);
    }

    /**
     * §6 parity legacy bukaMasterEksternal() (js/03_candidate.ts:124): AI CV
     * Master eksklusif Siswa ASJ — tag [VIP] ATAU [KELAS xx] di catatan internal.
     * Non-siswa: toast info, halaman TIDAK dibuka (dulu tombol ini <a href="/ai-cv">
     * tanpa gate, jadi kandidat luar masuk lalu ditolak server dengan pesan generik).
     * Server tetap memutuskan sendiri (processAIChat flow=master) — ini cuma UX.
     */
    function openAiCvMaster() {
      if (!(user?.wa || data?.wa)) {
        showToast(t('ui.toast_session_invalid_relogin'), 'error');
        return;
      }
      if (!isVipCatatan(data?.catatanInt)) {
        showToast(t('ui.toast_ai_cv_locked'), 'info');
        return;
      }
      window.location.href = '/ai-cv';
    }

if (!data) return <div class="text-center py-12"><p class="text-slate-400">{t('ui.toast_data_not_found')}</p><a href="/" class="mt-4 inline-block px-6 py-3 bg-emerald-600 text-white rounded-full font-bold">{t('button.back')}</a></div>;

  const overallProgress = computeOverallProgress(data.cvMiniProgress, data.cvMasterProgress);
  const crown = overallProgress >= 100 ? 'gold' : overallProgress >= 50 ? 'silver' : overallProgress > 0 ? 'bronze' : 'none';

  // Filter riwayat by selected loker
  const filteredRiwayat = selectedLoker
    ? data.riwayat.filter(r => r.jobCode === selectedLoker)
    : data.riwayat;
  const sortedRiwayat = [...filteredRiwayat].sort((a, b) => (b.tanggal || '').localeCompare(a.tanggal || ''));
  const uniqueLokers = [...new Set(data.riwayat.map(r => r.jobCode).filter(Boolean))];

  // Nilai kosong dari backend datang sebagai '-' (lihat mapCandidate / adapter
  // loadDashboard), jadi '-' harus diperlakukan sama dengan kosong.
  const realValue = (v: unknown) => {
    const s = String(v ?? '').trim();
    return !!s && s !== '-' && s !== 'null' && s !== 'undefined';
  };
  const hasRealJob = realValue(data.job);
  const hasRealTahapan = realValue(data.tahapan);

  return (
    <ErrorBoundary>
    <div class="pb-16">
      <div class="glass-panel p-5 sm:p-8 md:p-10 rounded-[2.5rem] shadow-2xl text-center max-w-4xl mx-auto relative overflow-hidden">
        <Icon name="id-card" class="text-5xl md:text-6xl text-emerald-400 mb-4 md:mb-6 drop-shadow-xl" />
        <h2 class="text-2xl md:text-3xl font-black text-white mb-3">{t('candidate.welcome')}, {data.nama} <CrownBadge progress={overallProgress} />{data.isVIP && <img src={ASJ_LOGO_URL} alt="" title={t('ui.badge_official')} class="inline-block w-8 h-8 md:w-10 md:h-10 ml-3 align-middle object-contain rounded-full border border-emerald-500/50 drop-shadow-[0_0_15px_rgba(52,211,153,0.8)]" />}</h2>
        {/* Job & tahapan HANYA dirender bila kandidat benar-benar punya lamaran.
            Sebelumnya baris ini selalu tampil dan mencetak '-' untuk job — kandidat
            yang belum pernah melamar melihat "Job Dilamar: -", yang terbaca seperti
            ada pekerjaan umum padahal memang tidak ada lamaran sama sekali. */}
        {(hasRealJob || hasRealTahapan) && (
          <div class="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1 px-4 py-3 md:px-8 md:py-4 bg-black/40 border border-emerald-500/30 rounded-full text-sm text-slate-300 mb-5 md:mb-6 shadow-inner w-full md:w-auto">
            {hasRealJob && (<>
              <span>{t('candidate.job_applied')}</span> <span class="font-black text-emerald-400">{data.job}</span>
            </>)}
            {hasRealJob && hasRealTahapan && <span class="text-slate-500">|</span>}
            {hasRealTahapan && (<>
              <span>{t('candidate.stage')}</span> <span class="font-black text-sky-400">{data.tahapan}</span> ({statusText(data.status)})
            </>)}
          </div>
        )}

        {/* ── DIGITAL STUDENT CARD (VIP only) ── */}
        {(data.isVIP || data.isSiswaASJ) && data.idKandidat && (
          <div class="max-w-sm mx-auto mb-8 relative group">
            <div class="absolute -inset-1 bg-gradient-to-r from-amber-400 to-yellow-600 rounded-[2rem] blur opacity-25 group-hover:opacity-60 transition duration-1000"></div>
            <div class="relative w-full h-56 md:h-64 bg-gradient-to-tr from-slate-900 via-slate-800 to-slate-900 border border-slate-700 rounded-[2rem] p-6 shadow-2xl flex flex-col justify-between overflow-hidden text-left transform transition-transform duration-500 hover:scale-105">
              <div class="absolute -right-10 -top-10 text-slate-800/50 text-[10rem] opacity-20 transform rotate-12 pointer-events-none"><Icon name="sun" /></div>
              <div class="flex justify-between items-start z-10">
                <div class="flex items-center gap-3">
                  <div class="w-11 h-11 bg-white rounded-full shadow-lg overflow-hidden flex items-center justify-center border border-slate-600">
                    <img src="https://gdwvffmevwtwnzrapjwy.supabase.co/storage/v1/object/public/asj-files/assets/logo-removebg-preview.webp" alt="Logo ASJ" class="w-full h-full object-cover scale-110" />
                  </div>
                  <div>
                    <h3 class="text-white font-black text-sm tracking-widest">{t('ui.student_id')}</h3>
                    <p class="text-amber-400 text-[9px] font-bold uppercase tracking-[0.2em]">{data.kelas || t('ui.vip_member')}</p>
                  </div>
                </div>
                <Icon name="check-circle" class="text-emerald-400 text-xl shadow-[0_0_10px_rgba(118,185,0,0.5)] rounded-full" />
              </div>
              <div class="flex justify-between items-center mt-auto z-10">
                <div>
                  <p class="text-slate-300 text-[9px] uppercase font-bold mb-0.5">{t('ui.student_name')}</p>
                  <p class="text-white font-black text-sm tracking-wide leading-tight break-words line-clamp-2 max-w-[170px]">{data.nama}</p>
                  <p class="text-slate-300 text-[9px] uppercase font-bold mt-3 mb-0.5">{t('ui.reg_id')}</p>
                  <p class="text-sky-300 font-mono text-sm font-bold">{data.idKandidat}</p>
                </div>
                <div class="bg-white p-2 rounded-xl shadow-lg border-2 border-slate-200">
                  <img src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(data.idKandidat || '')}`} alt="QR Code" class="w-20 h-20 md:w-24 md:h-24 object-contain" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── CV Progress ── */}
        <div class="max-w-xl mx-auto mb-6 md:mb-8 bg-black/40 border border-slate-700 p-4 md:p-5 rounded-2xl text-left shadow-lg">
          <div class="flex justify-between items-center mb-2">
            <span class="text-sm font-bold text-slate-300"><Icon name="id-badge" class="text-sky-400 mr-1" /> {t('ui.cv_mini_basic')}</span>
            <span class="text-sm font-bold text-sky-400">{data.cvMiniProgress}%</span>
          </div>
          <div class="w-full bg-slate-800 rounded-full h-2.5 mb-4 shadow-inner">
            <div class="bg-gradient-to-r from-sky-600 to-sky-400 h-2.5 rounded-full transition-[width] duration-1000" style={`width:${data.cvMiniProgress}%`}></div>
          </div>
          <div class="flex justify-between items-center mb-2">
            <span class="text-sm font-bold text-slate-300"><Icon name="file-signature" class="text-emerald-400 mr-1" /> {t('ui.cv_master_detail')}</span>
            <span class="text-sm font-bold text-emerald-400">{data.cvMasterProgress}%</span>
          </div>
          <div class="w-full bg-slate-800 rounded-full h-2.5 shadow-inner">
            <div class="bg-gradient-to-r from-emerald-600 to-emerald-400 h-2.5 rounded-full transition-[width] duration-1000" style={`width:${data.cvMasterProgress}%`}></div>
          </div>
          <p class="text-xs text-slate-300 mt-4 italic text-center font-bold">{data.isVIP && data.cvMiniProgress === 100 && data.cvMasterProgress === 100 ? <span class="text-amber-400 font-black tracking-widest not-italic"><Icon name="star" class="mr-1" /> {t('ui.perfect_student')} <Icon name="star" class="ml-1" /></span> : <>{crown === 'gold' ? t('ui.profile_100') : crown === 'silver' ? t('ui.profile_silver_next') : t('ui.profile_incomplete')} <Icon name="medal" /></>}</p>
        </div>

        {/* ── Jadwal Panel ── */}
        {data.jadwal.length > 0 && (
          <div class="mb-6 md:mb-8 max-w-xl mx-auto bg-gradient-to-r from-amber-950 to-rose-950 border border-amber-500/40 p-5 rounded-[2rem] text-left shadow-xl relative overflow-hidden">
            <div class="absolute -right-4 -top-4 text-amber-500/10 text-7xl"><Icon name="calendar-alt" /></div>
            <h3 class="relative z-10 text-lg font-black text-amber-400 mb-4"><Icon name="calendar-check" class="mr-2 text-rose-400 animate-pulse" /> {t('ui.your_schedule')}</h3>
            <div class="relative z-10 space-y-3">
              {data.jadwal.map((j, i) => (
                <div key={i} class="bg-black/30 border border-amber-900/50 rounded-xl p-4">
                  <div class="flex justify-between"><span class="font-bold text-white text-sm">{j.nama}</span><span class="text-[10px] text-amber-400 font-mono">{j.waktu}</span></div>
                  <p class="text-xs text-slate-400 mt-1"><Icon name="map-marker-alt" class="mr-1" />{j.lokasi}</p>
                  {j.link && <a href={j.link} target="_blank" class="text-[10px] text-sky-400 underline mt-1 inline-block">{t('ui.open_link')}</a>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Catatan Admin ── */}
        {data.catatan && (
          <div class="mb-8 max-w-xl mx-auto bg-sky-900/20 border border-sky-500/30 p-5 rounded-2xl text-center shadow-lg">
            <p class="text-xs text-sky-400 font-bold uppercase mb-2"><Icon name="envelope-open-text" class="mr-1" /> {t('ui.admin_eval_msg')}</p>
            <p class="text-sm text-slate-200 italic">"{data.catatan}"</p>
          </div>
        )}

        {/* ── Profil button ── */}
        <div class="mb-6 md:mb-8 flex justify-center">
          <button onClick={() => setShowCvMiniModal(true)} class="px-6 py-3 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-full font-bold shadow-lg hover:scale-105 transition text-sm"><Icon name="user-circle" class="mr-2 text-sky-400" /> {t('button.profil')}</button>
        </div>

        {/* ── Status Lamaran Terkini (with tahapan pipeline) ── */}
        <div class="mb-6 md:mb-8 bg-gradient-to-r from-sky-950 to-indigo-950 border border-sky-500/30 p-5 md:p-8 rounded-[2rem] shadow-xl relative overflow-hidden text-left">
          <div class="absolute -right-6 -top-10 text-sky-500/10 text-[10rem]"><Icon name="rocket" /></div>
          <div class="relative z-10">
            <h3 class="text-xl font-black text-sky-300 mb-2"><Icon name="bolt" class="mr-2 text-amber-400" /> {t('ui.app_status_latest')}</h3>
            <p class="text-sm text-slate-300 mb-5">{t('ui.cv_type_hint')}</p>
            <div class="mt-6 p-1 rounded-[1.5rem] bg-gradient-to-r from-sky-500/30 to-emerald-500/30 border border-slate-700/50 shadow-xl">
              <div class="bg-[#0f172a] rounded-[1.3rem] p-5 md:p-7">
                {/* Judul panel ini dulu memakai kunci i18n YANG SAMA dengan h3 di
                    atasnya (ui.app_status_latest), jadi outline terbaca
                    "Status Lamaran Terkini" dua kali berurutan. Sekarang ia punya
                    label sendiri yang menyebut isinya: daftar loker yang dilamar. */}
                <h4 class="text-sm md:text-base font-black text-white mb-4 uppercase"><Icon name="satellite-dish" class="mr-2 text-sky-400 animate-pulse" /> {t('ui.app_list_title')}</h4>
                {/* Loker pills */}
                {uniqueLokers.length > 1 && (
                  <div class="flex flex-wrap gap-1.5 mb-3">
                    <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider self-center">{t('ui.pilih_loker')}</span>
                    {uniqueLokers.map(code => (
                      <button onClick={() => setSelectedLoker(selectedLoker === code ? null : code)}
                        class={`px-2.5 py-1 rounded-full border text-[10px] font-black transition ${selectedLoker === code ? 'bg-emerald-600 text-white border-emerald-400' : 'bg-slate-800 text-slate-300 border-slate-600 hover:border-emerald-500/60'}`}>
                        {code}
                      </button>
                    ))}
                  </div>
                )}
                <div class="space-y-3 max-h-[300px] u-scroll-area custom-scrollbar pr-2">
                  {sortedRiwayat.length === 0 ? (
                    <p class="text-slate-500 text-sm text-center py-4">{selectedLoker ? t('ui.no_app_for_loker') : t('ui.no_app_yet_general')}</p>
                  ) : sortedRiwayat.map((r, i) => {
                    const stepIdx = tahapanStepIndex(r.tahapan || r.status);
                    const progressPct = Math.round(((stepIdx + 1) / TAHAPAN_STEPS.length) * 100);
                    return (
                      <div key={i} class="u-cv-auto u-cv-auto--card flex flex-col p-4 rounded-2xl border border-slate-700/50 bg-black/60 hover:bg-black/80 transition-colors shadow-lg mb-3 overflow-hidden">
                        <div class="flex flex-col sm:flex-row justify-between sm:items-start gap-3 mb-1">
                          <div class="min-w-0">
                            <div class="text-sm font-black text-white tracking-wide"><Icon name="building" class="text-slate-500 mr-2" />{r.jobCode || '-'} <span class="text-[9px] px-1.5 py-0.5 bg-slate-800 border border-slate-600 rounded ml-2 font-normal">{(r.tanggal || '').substring(0, 10)}</span></div>
                            {r.kategori && <div class="text-[11px] text-slate-400 mt-1"><Icon name="tag" class="mr-1 text-sky-500/70" /> {r.kategori}</div>}
                          </div>
                          <span class={`inline-flex items-start gap-1.5 px-3 py-1.5 rounded-xl border text-[10px] md:text-xs font-bold max-w-full break-words text-left shadow-sm ${statusBadgeClass(r.status)}`}>
                            <Icon name={statusIcon(r.status)} class="mt-0.5 flex-shrink-0" /> {statusText(r.status, isBiodataRow(r))}
                          </span>
                        </div>
                        {/* Tahapan pipeline */}
                        <div class="mt-3">
                          <div class="flex items-center justify-between mb-1.5">
                            <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider"><Icon name="route" class="mr-1 text-sky-400" /> {t('form.txt_tahapan_saat_ini')}</span>
                            <span class="text-[10px] font-black text-emerald-400"><Icon name="map-pin" /> {TAHAPAN_STEPS[stepIdx] || r.tahapan}</span>
                          </div>
                          <div class="w-full bg-slate-800 rounded-full h-1.5 border border-slate-700/50">
                            <div class="bg-gradient-to-r from-emerald-600 to-sky-500 h-1.5 rounded-full transition-[width] duration-1000" style={`width:${progressPct}%`}></div>
                          </div>
                          <div class="flex flex-wrap justify-between gap-x-2 gap-y-1 mt-1.5">
                            {TAHAPAN_STEPS.map((nm, si) => {
                              const done = si < stepIdx;
                              const active = si === stepIdx;
                              return <span key={si} class={`flex items-center gap-1 text-[9px] font-bold whitespace-nowrap ${done ? 'text-emerald-400' : active ? 'text-amber-400' : 'text-slate-500'}`}><Icon name={done ? 'check-circle' : 'circle'} class="flex-shrink-0" /> {nm}</span>;
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            {/* Action buttons grid */}
            <div class="u-grid-auto u-grid-auto--cards gap-3 mt-5">
              <button onClick={() => setShowCvMiniModal(true)} class="w-full px-3 py-3 bg-sky-600 hover:bg-sky-500 text-white rounded-full text-sm font-bold shadow-[0_0_15px_rgba(118,185,0,0.5)] hover:-translate-y-1 transition"><Icon name="user-edit" class="mr-1.5" /> {t('ui.update_cv_mini')}</button>
              <button onClick={openInterview} class="w-full px-3 py-3 bg-violet-600 hover:bg-violet-500 border border-violet-400/50 text-white rounded-full text-sm font-bold shadow-[0_0_15px_rgba(124,58,237,0.5)] hover:-translate-y-1 transition"><Icon name="microphone-alt" class="mr-1.5" /> {t('ui.interview_practice')}</button>
              <button onClick={openEsign} class="w-full px-3 py-3 bg-rose-600 hover:bg-rose-500 text-white rounded-full text-sm font-bold shadow-[0_0_15px_rgba(225,29,72,0.4)] hover:-translate-y-1 transition"><Icon name="signature" class="mr-1.5" /> {t('ui.esign_naitei')}</button>
              <button onClick={openAiCvMaster} class="w-full px-3 py-3 bg-amber-600 hover:bg-amber-500 border border-amber-400/50 text-white rounded-full text-sm font-bold shadow-lg hover:-translate-y-1 transition cursor-pointer"><Icon name="robot" class="mr-1.5" /> {t('ui.ai_cv_assistant')}</button>
              <a href="/master" class="w-full px-3 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white rounded-full text-sm font-bold shadow-lg hover:-translate-y-1 transition text-center"><Icon name="clipboard-list" class="mr-1.5 text-sky-400" /> {t('ui.master_full_form')}</a>
              
                            <button onClick={() => setShowCvTemplateSelector(true)} class="w-full px-3 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white rounded-full text-sm font-bold shadow-lg hover:-translate-y-1 transition"><Icon name="file-alt" class="mr-1.5 text-sky-400" /> {t('button.pilih_template_cv')}</button>
<button onClick={() => setShowRirekisho(true)} class="w-full px-3 py-3 bg-slate-200 hover:bg-white text-slate-900 rounded-full text-sm font-bold shadow-lg hover:-translate-y-1 transition"><Icon name="file-alt" class="mr-1.5 text-red-600" /> {t('candidate.btn_preview_cv')}</button>
              <button onClick={() => setShowPasswordModal(true)} class="w-full px-3 py-3 bg-teal-600 hover:bg-teal-500 text-white rounded-full text-sm font-bold shadow-lg hover:-translate-y-1 transition"><Icon name="key" class="mr-1.5" /> {t('ui.change_password')}</button>
            </div>
          </div>
        </div>
        {data.needRevision && (
          <div class="bg-red-950 border border-red-500/40 rounded-[2rem] p-5 mb-6 md:mb-8 text-left">
            <h3 class="text-red-400 font-bold mb-2 text-lg"><Icon name="exclamation-triangle" class="mr-2" /> {t('candidate.doc_revise_title')}</h3>
            <p class="text-sm text-slate-300 mb-5">{data.revisionNote || t('candidate.doc_revise_desc')}</p>
            <button
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.pdf,.jpg,.jpeg,.png';
                input.onchange = async (e) => {
                  const file = (e.target as HTMLInputElement).files?.[0];
                  if (!file) return;
                  showToast(t('toast.uploading') + ' ' + file.name, 'info');
                  try {
                    const fileUrl = await uploadBerkasToStorage(file, { key: 'revisi_' + Date.now() });
                    // Lewat apiClient, sama seperti pembacaan getAppData di atas.
                    // Sebelumnya `fetch` mentah + `res.json()` tanpa memeriksa
                    // `res.ok` dan tanpa batas waktu.
                    //
                    // `requireAuth: false` — SENGAJA sama dengan pembacaan di
                    // atas: token tetap dikirim, tetapi pemeriksaan sesi
                    // diserahkan ke server, yang punya gerbang role 'kandidat'
                    // DAN penjaga IDOR (payload[0] harus sama dengan WA sesi).
                    // Menolak lebih awal di klien akan mengganti pesan server
                    // ("Akses ditolak: nomor WA tidak sesuai sesi.") dengan
                    // "No valid session" yang tidak menjelaskan apa pun.
                    // `onSessionInvalid: 'throw'` — perilaku lama pada sesi mati
                    // adalah `success:false` + toast, bukan logout + redirect.
                    // `silent: true` — catch di bawah sudah menampilkan pesannya.
                    //
                    // Akibatnya: non-2xx kini masuk ke catch (dulu `res.json()`
                    // mengembalikan body dan `resData.success` yang memutuskan),
                    // jadi pesan server muncul dengan awalan "Error upload: ".
                    const resData = await apiClient<{ success?: boolean; error?: string }>(
                      'simpanRevisiKandidat',
                      [user?.wa || '', { url: fileUrl, name: file.name }],
                      { requireAuth: false, onSessionInvalid: 'throw', silent: true },
                    );
                    if (resData.success) {
                      showToast(t('toast.upload_revise_success'), 'success');
                      loadDashboard();
                    } else {
                      showToast(resData.error || t('toast.upload_revise_failed'), 'error');
                    }
                  } catch (err) {
                    showToast('Error upload: ' + ((err as Error).message || 'Unknown'), 'error');
                  }
                };
                input.click();
              }}
              class="w-full py-3.5 bg-red-600 hover:bg-red-500 text-white rounded-full text-sm font-bold shadow-lg transition-colors"
            >
              <Icon name="upload" class="mr-2" />{t('button.upload_revise')}
            </button>
          </div>
        )}

        {/* ── Pemandu langkah (Aa-chan) ──
            Kartu yang menjawab "apa satu hal berikutnya?". Diletakkan SEBELUM
            LevelCard karena menjawab pertanyaan yang lebih mendesak: LevelCard
            mengatakan seberapa jauh, StepGuide mengatakan ke mana. Semua
            angkanya datang dari data yang sudah ada di sini — tidak ada state
            baru dan tidak ada request baru. */}
        <StepGuide
          mini={data.cvMiniProgress}
          master={data.cvMasterProgress}
          berkasProgress={data.berkasProgress}
          berkasTotal={data.berkasTotal}
        />

        {/* ── Level kelengkapan profil ──
            Angka yang SAMA dengan CrownBadge di atas (overallProgress), tapi
            disajikan sebagai tingkat + langkah berikutnya. Sumber datanya tidak
            berubah: computeOverallProgress dari profileProgress.ts — mengukur
            KELENGKAPAN BERKAS, bukan penilaian seleksi. Jangan ubah jadi "skor". */}
        {data.berkasTotal > 0 && (
          <LevelCard percent={overallProgress} mini={data.cvMiniProgress} master={data.cvMasterProgress} />
        )}

        {/* ── Pemberkasan Progress ── */}
        {data.berkasTotal > 0 && (
          <div class="mb-8 max-w-xl mx-auto">
            <div class="bg-black/60 border border-emerald-500/30 rounded-[2rem] p-5 mb-4 text-left">
              <div class="flex items-center justify-between flex-wrap gap-2 mb-3">
                <h4 class="text-sm font-black text-emerald-400 uppercase tracking-widest"><Icon name="tasks" class="mr-1.5" /> {t('ui.berkas_progress')}</h4>
                <span class="text-lg font-black text-white">{Math.round(data.berkasProgress)}%</span>
              </div>
              <div class="h-2.5 bg-slate-800 rounded-full overflow-hidden mb-3">
                <div class="h-full bg-gradient-to-r from-emerald-600 to-sky-500 rounded-full transition-[width] duration-500" style={`width:${data.berkasProgress}%`}></div>
              </div>
              <div class="flex flex-wrap items-center gap-2 mb-4">
                <span class="text-xs font-bold text-white">{data.berkasList.filter(b => b.done).length}/{data.berkasTotal}{t('ui.doc_count_suffix')}</span>
              </div>
              <div class="grid grid-cols-2 gap-1.5 max-h-44 u-scroll-area custom-scrollbar pr-1">
                {data.berkasList.map((b, i) => (
                  <div key={i} class={`flex items-center gap-2 text-xs px-2 py-1 rounded ${b.done ? 'text-emerald-400' : 'text-slate-500'}`}>
                    <Icon name={b.done ? 'check-circle' : 'circle'} /> {t(b.label)}
                  </div>
                ))}
              </div>
            </div>
            <button onClick={() => setShowPemberkasan(true)} class="w-full py-4 bg-gradient-to-r from-emerald-600 to-sky-600 hover:from-emerald-500 hover:to-sky-500 text-white rounded-[1.5rem] font-black shadow-[0_0_20px_rgba(90,141,0,0.4)] hover:-translate-y-1 transition text-sm md:text-base border border-emerald-400/30 text-center">
              <Icon name="folder-open" class="mr-2" />{t('ui.complete_berkas_biodata')}
            </button>
            <p class="text-sm text-emerald-400 mt-3 font-bold animate-pulse text-center"><Icon name="info-circle" class="mr-1" /> {t('ui.berkas_stage_hint')}</p>
          </div>
        )}

        <a href="/public" class="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-full font-bold shadow-lg hover:scale-105 transition text-sm inline-block">{t('button.view_public_jobs')}</a>
      </div>

      {/* ── Modals ── */}
      {showPasswordModal && <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />}
      {showCvMiniModal && <CvMiniModal onClose={() => setShowCvMiniModal(false)} prefill={data.cvmini || undefined} />}
      {showCvTemplateSelector && <CvTemplateSelector waTarget={user?.wa || data.wa} isAdmin={false} onClose={() => setShowCvTemplateSelector(false)} onOpenRirekisho={() => { setShowCvTemplateSelector(false); setShowRirekisho(true); }} />}
{showRirekisho && <RirekishoBuilder waTarget={user?.wa || data.wa} isOpen={showRirekisho} onClose={() => setShowRirekisho(false)} fotoFallback={data.pasPhoto || undefined} />}
      {showESign && <EsignNaiteiModal isOpen={showESign} wa={user?.wa || ""} onClose={() => setShowESign(false)} />}
      {showPemberkasan && <PemberkasanModal isOpen={showPemberkasan} onClose={() => setShowPemberkasan(false)} waTarget={user?.wa || ""} namaTarget={user?.name || ""} candidate={data ? { tahapan: data.tahapan, berkas: data.berkas || {}, bio: data.bio || {} } : null} />}
      {showInterview && data && (
        <InterviewSimulatorModal wa={user?.wa || data.wa || ''} nama={data.nama} onClose={() => setShowInterview(false)} />
      )}
    </div>
    </ErrorBoundary>
  );
}


