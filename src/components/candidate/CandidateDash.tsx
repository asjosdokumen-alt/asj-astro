/**
 * CandidateDash.tsx — Candidate dashboard matching legacy 100%
 * Source: legacy/index.html page-kandidat (lines 840-1039)
 * Features: Student Card, tahapan pipeline, badge system, pemberkasan, all modals
 */
import { useState, useEffect } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import { authStore } from '../../store/authReactive';
import { t, useLang } from '../../store/i18n';
import ChangePasswordModal from '../ChangePasswordModal';
import CvMiniModal from '../CvMiniModal';
import InterviewSimulatorModal from './InterviewSimulatorModal';
import { isVipFlags, ASJ_LOGO_URL } from '../../lib/vip';
import RirekishoBuilder from '../admin/RirekishoBuilder';
import EsignNaiteiModal, { allowedTahapanEsign } from '../EsignNaiteiModal';
import PemberkasanModal from '../admin/PemberkasanModal';
import { uploadBerkasToStorage } from "../../lib/uploadBerkas";
import { showToast } from "../Toast";
import Icon from '../ui/Icon';
import { useOverlayPresence } from '../ui/useOverlayPresence';
import { apiClient } from '../../lib/apiClient';
import { ALL_BERKAS, hasBerkasUrl } from '../../lib/berkasCatalog';
import { computeCvMiniProgress, computeCvMasterProgress, computeOverallProgress } from '../../lib/profileProgress';
import LevelCard from './LevelCard';
import StepGuide from './StepGuide';
import AsjDossierCard from './AsjDossierCard';
import CandidateSkeleton from './CandidateSkeleton';
import { downloadBiodataText } from '../../lib/biodataExport';
import { ErrorBoundary } from '../ErrorBoundary';

// `feedback` = `feedback_berkas` dari database_asj_form. Dipakai untuk
// memisahkan baris LAMARAN dari baris BIODATA/DOKUMEN (lihat isBiodataRow):
// baris biodata membawa penanda '[BIODATA] …' / '[UPLOAD <LABEL>]' dan
// code_job kosong, jadi ia tidak boleh memakai kosakata verifikasi lamaran.
type Riwayat = { jobCode: string; tahapan: string; status: string; tanggal: string; kategori?: string; feedback?: string; };
type CandidateData = {
  nama: string; wa: string; job: string; tahapan: string; status: string;
  isVIP: boolean; isSiswaASJ?: boolean; kelas?: string; idKandidat?: string;
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
  /**
   * Identitas untuk `AsjDossierCard` (2026-09-25).
   *
   * SEMUA field ini SUDAH ADA di baris `mapCandidate` — adapter lama cuma tidak
   * membacanya. Jadi ini murni plumbing: tidak ada perubahan backend, SQL, atau
   * migrasi. Urutan fallback-nya `row.<field>` lalu `row.bio.<singkatan>` karena
   * `attachBerkasBio` menaruh biodata master di `bio` dengan kunci PENDEK
   * (`tmplahir`, `tgllahir`, `email`, `alamat` — lihat BIO_SHORT_TO_LONG di
   * PemberkasanModal), dan baris kandidat sendiri bisa kosong.
   *
   * `nik` SENGAJA tidak ada di sini. Nomor KTP tidak boleh muncul di permukaan
   * yang dipegang kandidat.
   */
  tempatLahir?: string; tglLahir?: string; ttl?: string;
  email?: string; alamat?: string;
  tbBb?: string; gender?: string; usia?: string; tb?: string; bb?: string; pendidikan?: string;
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
  const _lang = useLang();
  const [data, setData] = useState<CandidateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showCvMiniModal, setShowCvMiniModal] = useState(false);
  const [showESign, setShowESign] = useState(false);
  const [showPemberkasan, setShowPemberkasan] = useState(false);
  const [showRirekisho, setShowRirekisho] = useState(false);
  const [showInterview, setShowInterview] = useState(false);
  const [selectedLoker, setSelectedLoker] = useState<string | null>(null);

  /* ── Exit animation (2026-09-28) ──────────────────────────────────────
     Six overlays on this dashboard, every one of them conditionally
     rendered — so each was removed on the same frame its state flipped and
     CSS had nothing left to animate. These hooks keep the node mounted for
     one exit transition and report whether we are inside that window.

     They are fed the BOOLEAN states directly. `useOverlayPresence` decides
     presence by truthiness rather than `!== null` for exactly this reason:
     see its header, and `useOverlayPresence.test.tsx`, whose FIRST case is a
     boolean that has never been opened. */
  const passwordModal = useOverlayPresence(showPasswordModal);
  const cvMiniModal = useOverlayPresence(showCvMiniModal);
  const esignModal = useOverlayPresence(showESign);
  const pemberkasanModal = useOverlayPresence(showPemberkasan);
  const rirekishoModal = useOverlayPresence(showRirekisho);
  const interviewModal = useOverlayPresence(showInterview);

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
        const berkasMap: Record<string, string> = row?.berkas || legacyD.berkas || {};
        const berkasList = ALL_BERKAS.map((def) => ({
          label: def.label,
          done: hasBerkasUrl(berkasMap[def.key]),
        }));
        setData({
          nama: row?.nama || legacyD.nama || user.name || 'Kandidat', wa,
          job: row?.idLoker || legacyD.job || '-', tahapan: row?.tahapan || legacyD.tahapan || '-',
          status: row?.status || legacyD.status || '-',
          // ── Lencana "Siswa Resmi ASJ": tag `[VIP]` LITERAL saja ────────────
          // Case-SENSITIVE, sengaja, dan sudah menjadi keputusan legacy: gate
          // fitur memakai `isVipCatatan` (`[VIP]` ATAU `[KELAS xx]`, lihat
          // lib/vip.ts), sedangkan LENCANA ini memakai `includes('[VIP]')` —
          // persis js/engine/dashboard.ts:218. Sebelumnya di sini regex
          // /\[VIP\]/i (case-INsensitive), sehingga catatan `[vip]` huruf kecil
          // memberi lencana padahal gerbang AI CV/simulator MENOLAKnya. Dua
          // predikat itu menjadi TIDAK SEPAKAT untuk kandidat yang sama — persis
          // divergensi yang dilaporkan. Tag `[vip]` non-kanonikal BUKAN VIP.
          //
          // 2026-10-05: `isVIP`/`kelas` kini datang dari SERVER (`mapCandidate`),
          // bukan dari `catatanInt` mentah — memo internal tidak lagi dikirim ke
          // kandidat (lihat `toKandidatView` di `_lib/db/candidates.ts`). Server
          // memakai input yang sama (`catatan_internal || catatan_admin`), jadi
          // perilakunya identik.
          isVIP: !!row?.isVIP || !!legacyD.isVIP,
          isSiswaASJ: !!row?.isSiswaASJ || !!legacyD.isSiswaASJ,
          kelas: row?.kelas || legacyD.kelas || '',
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
          /* ── KOTAK "PESAN / EVALUASI DARI ADMIN" = catatan EXTERNAL SAJA ──
             DIPERBAIKI 2026-09-25. Sebelumnya baris ini membaca `row.catatan`,
             dan `mapCandidate` memetakan `catatan` dari kolom **`catatan_admin`**
             (`_lib/db/candidates.ts:65`) — sebuah memo sisi-admin yang diisi dari
             `EditCandidateModal` (`contexts/registry/service.ts:24`). Akibatnya
             kandidat melihat memo internal admin, dan **tidak pernah** melihat
             `catatan_ext` — catatan yang memang ditulis admin UNTUK dia
             (`service.ts:39,57,112` menulisnya; legacy membacanya di
             `js/engine/init.ts:449`: `myData.catatanExt` → `#k-dash-catatan-ext`).
             Jadi ini bocor DAN kehilangan fitur sekaligus.

             Konvensi repo sendiri sudah menuliskannya dua kali: "Kolom catatan
             mengikuti legacy: catatanExt || catatan"
             (`lib/candidateExport.ts:85`, `store/adminStore.ts:25`). Baris itu
             berlaku untuk kolom EKSPOR milik admin; untuk permukaan KANDIDAT,
             legacy memakai `catatanExt` TANPA fallback — dan itu yang dipakai di
             sini, karena `catatan_admin` memang bukan untuk kandidat.

             Ketahuan dari probe browser yang menaruh teks bertanda di
             `catatan` dan memeriksa DOM: teks itu MUNCUL di dasbor kandidat. */
          catatan: row?.catatanExt || legacyD.catatanExt || '',
          /** Nilai mentah `catatan_ext`, disimpan terpisah supaya konsumen yang
           *  butuh field aslinya tidak perlu menebak dari `catatan`. */
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
          // ── Identitas untuk kartu dossier ──
          // `ttl` di-join dari dua kolom NYATA (tempat + tanggal lahir), bukan
          // diformat ulang dari satu string: kalau salah satu kosong, yang tampil
          // hanya yang ada. `mapCandidate` sudah menyediakan `ttl` sendiri di
          // sebagian jalur, jadi ia dipakai lebih dulu bila ada.
          tempatLahir: String(row?.tempatLahir || row?.bio?.tmplahir || ''),
          tglLahir: String(row?.tglLahir || row?.bio?.tgllahir || ''),
          ttl: String(
            row?.ttl
              || [row?.tempatLahir || row?.bio?.tmplahir, row?.tglLahir || row?.bio?.tgllahir]
                .filter(Boolean)
                .join(', '),
          ),
          email: String(row?.email || row?.bio?.email || ''),
          alamat: String(row?.alamat || row?.bio?.alamat || ''),
          tbBb: String(row?.tbBb || ''),
          gender: String(row?.gender || ''),
          usia: String(row?.usia || ''),
          tb: String(row?.tb || ''),
          bb: String(row?.bb || ''),
          pendidikan: String(row?.pendidikan || ''),
          needRevision: !!legacyD.needRevision, revisionNote: legacyD.revisionNote || '',
          applications: row?.applications || legacyD.applications || [],
        });
      }
    } catch (e) { console.error('[CandidateDash]', e); }
    finally { setLoading(false); }
  }

  // Keadaan `loading` = KERANGKA halaman, bukan spinner di tengah bidang kosong.
  // Alasannya (dan bentuk tiap bloknya) ada di `CandidateSkeleton.tsx`.
  if (loading) return <CandidateSkeleton />;
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
      if (!isVipFlags(data)) {
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
      if (!isVipFlags(data)) {
        showToast(t('ui.toast_ai_cv_locked'), 'info');
        return;
      }
      window.location.href = '/ai-cv';
    }

if (!data) return <div class="text-center py-12"><p class="text-slate-400">{t('ui.toast_data_not_found')}</p><a href="/" class="mt-4 inline-block px-6 py-3 bg-emerald-600 text-white rounded-full font-bold">{t('button.back')}</a></div>;

  const overallProgress = computeOverallProgress(data.cvMiniProgress, data.cvMasterProgress);
  // `crown` DIHAPUS 2026-09-30 bersama kartu "CV Progress": variabel itu hanya
  // dipakai kalimat "Silver Crown! Selesaikan Master Profile" di kartu tersebut,
  // dan ambang yang sama sudah dihitung ulang di dalam `CrownBadge` (baris 167)
  // serta `LevelCard.levelFor`. Meninggalkannya berarti satu variabel mati yang
  // menambah diagnostik lint tanpa mengubah apa pun.

  // Filter riwayat by selected loker
  const filteredRiwayat = selectedLoker
    ? data.riwayat.filter(r => r.jobCode === selectedLoker)
    : data.riwayat;
  const sortedRiwayat = [...filteredRiwayat].sort((a, b) => (b.tanggal || '').localeCompare(a.tanggal || ''));
  const uniqueLokers = [...new Set(data.riwayat.map(r => r.jobCode).filter(Boolean))];

  /* `realValue`, `hasRealJob` and `hasRealTahapan` stood here. They existed to
     stop the old header pill from printing "Job Dilamar: -" for a candidate who
     had never applied, and they are gone with that pill (2026-09-25, the dossier
     card replaced the header). THE RULE DID NOT GO WITH THEM — `AsjDossierCard`
     restates it as its own `realValue()` and omits every row without a value, so
     the same `-` / `'null'` / `'undefined'` guard still governs what is shown.
     If a value-guarded row is added back to THIS file, bring the helper back with
     it rather than inlining a truthiness check: `'-'` is truthy. */

  // Job yang dilamar: kode loker utama dulu, lalu kode lain dari riwayat —
  // di-dedupe, karena kandidat yang melamar satu loker punya keduanya sama.
  const dossierJobs = [...new Set([data.job, ...uniqueLokers].filter(Boolean))];

  return (
    <ErrorBoundary>
    <div class="pb-16">
      {/* ── THE DOSSIER CARD IS THE PROFILE'S HEADER ──
          Owner ruling 2026-09-25: "profil kok gini, harusnya profil seperti ini
          kek legacy". This card replaces the generic greeting that used to open
          the dashboard (an `id-card` icon, a "Selamat datang, {nama}" heading and
          a job/stage pill) — the same facts, in the legacy identity-card layout
          the owner asked for. The gamification badges that lived in that heading
          move here rather than disappearing, so the tested
          `title="ui.badge_official"` contract on the VIP logo is preserved.

          NOTHING ELSE MOVED. The VIP student card (QR + class), the CV progress
          bars, the schedule, the admin note, the application pipeline and the
          action grid are untouched below it. */}
      <AsjDossierCard
        nama={data.nama}
        idKandidat={data.idKandidat}
        status={data.status}
        tahapan={data.tahapan}
        wa={data.wa}
        pasPhoto={data.pasPhoto}
        gender={data.gender}
        usia={data.usia}
        tbBb={data.tbBb}
        pendidikan={data.pendidikan}
        ttl={data.ttl}
        email={data.email}
        alamat={data.alamat}
        jftText={data.cvmini?.jftText}
        sswText={data.cvmini?.sswText}
        jobs={dossierJobs}
        kelas={data.kelas}
        badge={
          <>
            <CrownBadge progress={overallProgress} />
            {data.isVIP && <img src={ASJ_LOGO_URL} alt="" title={t('ui.badge_official')} class="inline-block w-6 h-6 align-middle object-contain rounded-full border border-accent-emerald" />}
          </>
        }
        /* The CTA produces the SAME artefact the admin panel produces, from the
           same formatter — legacy served both surfaces from one
           `downloadBiodataLengkap()`. Wiring it to `RirekishoBuilder` instead
           would have put a second, different document behind a label that says
           "Download Full Biodata".

           Berkasnya memuat SELURUH baris master (bukan hanya `bio` yang ikut di
           payload kandidat): `getDrafCvMaster` mengembalikan
           `buildMasterNested(row)`. Diambil saat unduh supaya payload dashboard
           tidak ikut membawa 169 kolom master. Gagal ambil ⇒ berkas tetap dibuat
           dari data yang sudah ada. */
        onDownload={async () => {
          let master: Record<string, unknown> | undefined;
          try {
            const m = (await apiClient('getDrafCvMaster', [data.wa], {
              onSessionInvalid: 'throw',
              silent: true,
            })) as Record<string, unknown> | null;
            if (m && !m.error) master = m;
          } catch {
            /* master opsional */
          }
          downloadBiodataText({
            nama: data.nama,
            wa: data.wa,
            idKandidat: data.idKandidat,
            gender: data.gender,
            usia: data.usia,
            fisik: data.tbBb,
            pendidikan: data.pendidikan,
            tmplahir: data.tempatLahir,
            tgllahir: data.tglLahir,
            email: data.email,
            alamat: data.alamat,
            jft: data.cvmini?.jftText,
            ssw: data.cvmini?.sswText,
            tahapan: data.tahapan,
            status: data.status,
            isVIP: data.isVIP,
            isSiswaASJ: data.isSiswaASJ,
            kelas: data.kelas,
            /* "Job Yang Dilamar" tampil di kartu ini tepat di atas tombol, jadi ia
               harus ikut ke berkasnya. `applications` (kode + status, dari mail)
               dipakai lebih dulu; `dossierJobs` jadi jaring pengaman ketika belum
               ada baris mail sama sekali. */
            applications: (data.applications || []).map((a) => ({ code: a.code, status: a.status })),
            jobs: dossierJobs,
            berkas: data.berkas,
            bio: data.bio,
            master,
          });
        }}
      />

      {/* ── Satu kontainer (§4.1) + rail kanan (§4.3) ──
          Sebelumnya seluruh dashboard dibungkus `.glass-panel` dengan
          `max-w-4xl mx-auto`: 896 px di dalam `main` 1265 px, jadi 369 px
          (29%) ruang kanan kosong sementara §3.5 sudah menetapkan rail
          22rem = 352 px. Sekarang halamannya grid: kolom utama + rail.

          Kolom utama = 1265 - 352 - 24(gap) = 889 px, yaitu lebar baca yang
          SAMA dengan 896 px sebelumnya — jadi tata letak isinya tidak
          berubah; yang berubah hanya ruang mati di kanan yang kini terpakai.

          `flex flex-col` TANPA gap: setiap seksi sudah membawa
          `mb-6 md:mb-8` sendiri, jadi ritme vertikalnya persis seperti
          sebelumnya. Menambahkan gap akan menggandakannya. */}
      <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
        <div class="min-w-0 flex flex-col">
        {/* ── Sapaan: h2 pertama halaman ──
            `h1` rute ini dipegang FormToolbar ("Dashboard Kandidat"), jadi sapaan
            tidak boleh jadi `h1` kedua — `e2e/test-headings.mjs` menuntut TEPAT
            satu. Yang hilang sebelumnya bukan `h1`, melainkan lapisan `h2`:
            outline-nya H1 -> H3 -> H4, melompati satu tingkat, sehingga pembaca
            layar tidak punya daftar isi yang bisa dipakai. */}
        <h2 class="mb-6 md:mb-8 text-left">
          <span class="block text-lg md:text-xl font-black text-white">
            {t('dash.welcome')} {data.nama}
          </span>
          <span class="block text-xs text-fg-muted mt-1">
            {[data.job, data.tahapan].filter(Boolean).join(' · ') || t('dash.greeting_subtitle_empty')}
          </span>
        </h2>

        {/* ── DIGITAL STUDENT CARD (VIP only) ── */}
        {(data.isVIP || data.isSiswaASJ) && data.idKandidat && (
          <div class="max-w-sm mx-auto mb-8 relative group">
            <div class="absolute -inset-1 bg-gradient-to-r from-amber-400 to-yellow-600 rounded-panel blur opacity-25 group-hover:opacity-60 transition duration-1000"></div>
            <div class="relative w-full h-56 md:h-64 bg-gradient-to-tr from-slate-900 via-slate-800 to-slate-900 border border-slate-700 rounded-panel p-6 flex flex-col justify-between overflow-hidden text-left transform transition-transform duration-500 hover:scale-105">
              <div class="absolute -right-10 -top-10 text-slate-800/50 text-[10rem] opacity-20 transform rotate-12 pointer-events-none"><Icon name="sun" /></div>
              <div class="flex justify-between items-start z-10">
                <div class="flex items-center gap-3">
                  <div class="w-11 h-11 bg-white rounded-full overflow-hidden flex items-center justify-center border border-slate-600">
                    <img src="/icons/logo-asj.webp" alt="Logo ASJ" class="w-full h-full object-cover scale-110" />
                  </div>
                  <div>
                    <h3 class="text-white font-black text-sm tracking-widest">{t('ui.student_id')}</h3>
                    <p class="text-amber-400 text-[11px] font-bold uppercase tracking-[0.2em]">{data.kelas || t('ui.vip_member')}</p>
                  </div>
                </div>
                <Icon name="check-circle" class="text-emerald-400 text-xl shadow-[0_0_10px_rgba(118,185,0,0.5)] rounded-full" />
              </div>
              <div class="flex justify-between items-center mt-auto z-10">
                <div>
                  <p class="text-slate-300 text-[11px] uppercase font-bold mb-0.5">{t('ui.student_name')}</p>
                  <p class="text-white font-black text-sm tracking-wide leading-tight break-words line-clamp-2 max-w-[170px]">{data.nama}</p>
                  <p class="text-slate-300 text-[11px] uppercase font-bold mt-3 mb-0.5">{t('ui.reg_id')}</p>
                  <p class="text-sky-300 font-mono text-sm font-bold">{data.idKandidat}</p>
                </div>
                <div class="bg-white p-2 rounded-xl border-2 border-slate-200">
                  <img src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(data.idKandidat || '')}`} alt="QR Code" class="w-20 h-20 md:w-24 md:h-24 object-contain" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Kelengkapan: SATU meter untuk seluruh halaman ──
            Sebelum 2026-09-30 di sini ada kartu "CV Progress" dengan DUA bar
            (CV Mini + Master Profil), lalu di bawahnya `LevelCard` mencetak
            ULANG kedua angka yang sama, lalu `Progres Pemberkasan` menambah
            bar ketiga dengan persentase yang sama pula. Terukur di DOM: 7
            string persen, 12 bar, dan `100%`/`0%`/`50%` masing-masing tampil
            dua kali. Sekarang angka-angka itu jadi LEGENDA dari satu bar, dan
            pemandu langkah duduk DI DALAM kartu yang sama karena keduanya
            membahas subjek yang sama.

            Diletakkan paling atas di antara kartu-kartu isi dengan sengaja:
            ia menjawab "bagaimana keadaan saya" sebelum yang lain menjawab
            "apa isinya", dan itu juga yang membuatnya jadi
            `role="progressbar"` PERTAMA di halaman. */}
        <LevelCard
          percent={overallProgress}
          mini={data.cvMiniProgress}
          master={data.cvMasterProgress}
          berkasDone={data.berkasList.filter(b => b.done).length}
          berkasTotal={data.berkasTotal}
          vip={data.isVIP}
        >
          <StepGuide
            variant="inline"
            mini={data.cvMiniProgress}
            master={data.cvMasterProgress}
            berkasProgress={data.berkasProgress}
            berkasTotal={data.berkasTotal}
          />
        </LevelCard>

        {/* ── Jadwal Panel ── */}
        {data.jadwal.length > 0 && (
          <div class="mb-6 md:mb-8 bg-amber-500/10 border border-amber-500/40 p-5 md:p-6 rounded-panel text-left relative overflow-hidden">
            <div class="absolute -right-4 -top-4 text-amber-500/10 text-7xl"><Icon name="calendar-alt" /></div>
            {/* `animate-pulse` REMOVED 2026-09-30 (§1.2 rejects kinetic type, and
                §6.5 keeps motion out of anything that carries meaning). Three
                elements pulsed `infinite 2s`: this icon, the Daftar Lamaran
                icon, and — worst — a whole sentence of instruction text. A
                heading icon that blinks forever competes with the heading for
                attention and never stops. The icons keep their accent colour. */}
            <h2 class="relative z-10 text-lg font-black text-accent-amber mb-4"><Icon name="calendar-check" class="mr-2 text-accent-red" /> {t('ui.your_schedule')}</h2>
            <div class="relative z-10 space-y-3">
              {data.jadwal.map((j, i) => (
                <div key={i} class="bg-surface-raised/60 border border-amber-500/30 rounded-xl p-4">
                  <div class="flex justify-between"><span class="font-bold text-white text-sm">{j.nama}</span><span class="text-[11px] text-accent-amber font-mono">{j.waktu}</span></div>
                  <p class="text-xs text-slate-400 mt-1"><Icon name="map-marker-alt" class="mr-1" />{j.lokasi}</p>
                  {j.link && <a href={j.link} target="_blank" class="text-[11px] text-accent-sky underline mt-1 inline-block">{t('ui.open_link')}</a>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── "PROFIL" BUTTON REMOVED 2026-09-25 — LEGACY HAS NO SUCH BUTTON ──
            Legacy's candidate page (`#page-kandidat`) reached the dossier through
            exactly ONE affordance, "Lihat Profil Digital CV Saya" →
            `bukaDigitalCV(currentKandidatId)`, and edited the profile through
            "Update CV Mini" in the action grid below. This extra button opened
            `CvMiniModal` — the same modal the grid's "Update Profil" opens — so it
            was a third path to a two-path job, and it appeared in no legacy
            markup. Removed rather than kept as a convenience: the owner asked for
            the page to match legacy ("lihat legacy saja kira kira samain").
            `button.profil` was deleted from BOTH dictionaries with it; it had no
            other consumer. */}

        {/* ── Status Lamaran Terkini (with tahapan pipeline) ── */}
        <div class="mb-6 md:mb-8 bg-sky-500/10 border border-sky-500/30 p-5 md:p-6 rounded-panel relative overflow-hidden text-left">
          <div class="absolute -right-6 -top-10 text-sky-500/10 text-[10rem]"><Icon name="rocket" /></div>
          <div class="relative z-10">
            <h2 class="text-xl font-black text-accent-sky mb-2"><Icon name="bolt" class="mr-2 text-accent-amber" /> {t('ui.app_status_latest')}</h2>
            <p class="text-sm text-slate-300 mb-5">{t('dash.app_status_desc')}</p>
            {/* DUA PEMBUNGKUS DIHAPUS 2026-09-30 (review r2 §U1).
                Di sini dulu ada bingkai gradien
                (`mt-6 p-1 rounded-panel bg-gradient-to-r from-sky-500/30
                to-emerald-500/30 border shadow-xl`) yang membungkus satu
                permukaan lagi (`bg-surface rounded-card p-5 md:p-6`).
                Keduanya adalah kedalaman ke-3 dan ke-4 dari lima tepi
                bersarang, dan tidak satu pun membedakan isinya dari kartu
                induk: yang terukur hanyalah 30 px lebar hilang di desktop dan
                42 px di ponsel. Daftar ini sudah punya `h3` sendiri sebagai
                judul, jadi pengelompokannya tidak bergantung pada bingkai itu.
                Entri riwayat membawa `bg-black/60` + border sendiri, jadi ia
                tetap terbaca sebagai kartu di atas permukaan seksi. */}
            <div>
                {/* Judul panel ini dulu memakai kunci i18n YANG SAMA dengan h3 di
                    atasnya (ui.app_status_latest), jadi outline terbaca
                    "Status Lamaran Terkini" dua kali berurutan. Sekarang ia punya
                    label sendiri yang menyebut isinya: daftar loker yang dilamar. */}
                <h3 class="mt-6 text-sm md:text-base font-black text-white mb-4 uppercase"><Icon name="satellite-dish" class="mr-2 text-sky-400" /> {t('ui.app_list_title')}</h3>
                {/* Loker pills */}
                {uniqueLokers.length > 1 && (
                  <div class="flex flex-wrap gap-1.5 mb-3">
                    <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider self-center">{t('ui.pilih_loker')}</span>
                    {uniqueLokers.map(code => (
                      <button onClick={() => setSelectedLoker(selectedLoker === code ? null : code)}
                        class={`min-h-11 inline-flex items-center justify-center px-3 rounded-full border text-[11px] font-black transition ${selectedLoker === code ? 'bg-emerald-600 text-white border-emerald-400' : 'bg-slate-800 text-slate-300 border-slate-600 hover:border-emerald-500/60'}`}>
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
                      <div key={i} class="u-cv-auto u-cv-auto--card flex flex-col p-4 rounded-2xl border border-slate-700/50 bg-black/60 hover:bg-black/80 transition-colors mb-3 overflow-hidden">
                        <div class="flex flex-col sm:flex-row justify-between sm:items-start gap-3 mb-1">
                          <div class="min-w-0">
                            <div class="text-sm font-black text-white tracking-wide"><Icon name="building" class="text-slate-500 mr-2" />{r.jobCode || '-'} <span class="text-[11px] px-1.5 py-0.5 bg-slate-800 border border-slate-600 rounded ml-2 font-normal">{(r.tanggal || '').substring(0, 10)}</span></div>
                            {r.kategori && <div class="text-[11px] text-slate-400 mt-1"><Icon name="tag" class="mr-1 text-sky-500/70" /> {r.kategori}</div>}
                          </div>
                          <span class={`inline-flex items-start gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] md:text-xs font-bold max-w-full break-words text-left ${statusBadgeClass(r.status)}`}>
                            <Icon name={statusIcon(r.status)} class="mt-0.5 flex-shrink-0" /> {statusText(r.status, isBiodataRow(r))}
                          </span>
                        </div>
                        {/* Tahapan pipeline */}
                        <div class="mt-3">
                          <div class="flex items-center justify-between mb-1.5">
                            <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider"><Icon name="route" class="mr-1 text-sky-400" /> {t('form.txt_tahapan_saat_ini')}</span>
                            <span class="text-[11px] font-black text-emerald-400"><Icon name="map-pin" /> {TAHAPAN_STEPS[stepIdx] || r.tahapan}</span>
                          </div>
                          {/* `role="progressbar"` + nama yang bisa dibaca.
                              Sebelumnya bar ini hanya sebuah div: lebar dan
                              warnanya menyampaikan "sudah sampai tahap mana",
                              dan pembaca layar tidak menerima apa pun — padahal
                              inilah status lamaran kandidat.

                              Aman terhadap `CandidateDash.test.tsx`, yang
                              membaca `document.querySelector('[role="progressbar"]')`
                              dan menuntut `aria-valuenow` = kelengkapan profil.
                              Bar itu milik LevelCard, dan LevelCard dirender
                              SEBELUM kartu ini (ia kartu isi pertama di panel),
                              jadi ia tetap `[role="progressbar"]` pertama.
                              Menaruh bar ini di atasnya akan membuat asersi itu
                              membaca angka yang salah — bukan gagal, tapi LULUS
                              dengan makna yang berbeda, yang lebih buruk. */}
                          <div
                            class="w-full bg-slate-800 rounded-full h-1.5 border border-slate-700/50"
                            role="progressbar"
                            aria-valuenow={progressPct}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label={`${r.jobCode} — ${TAHAPAN_STEPS[stepIdx] || r.tahapan}`}
                          >
                            {/* `scaleX`, NOT `width`. P7 (§3.7) allows only
                                `opacity` and `transform`; a `transition-[width]`
                                animates a LAYOUT property, so every frame reflows
                                the row and its ten sibling labels. `scaleX` is
                                compositor-only and paints the identical result —
                                `w-full` + `origin-left` is what makes the scaled
                                box grow from the left edge instead of the centre.
                                The bare `transition-transform` inherits the repo's
                                default 180 ms (`--default-transition-duration`). */}
                            <div class="w-full bg-gradient-to-r from-emerald-600 to-sky-500 h-1.5 rounded-full origin-left transition-transform motion-reduce:transition-none" style={`transform:scaleX(${progressPct / 100})`}></div>
                          </div>
                          {/* Rantai 10 tahap: dirender SEKALI, untuk lamaran
                              terbaru saja (`sortedRiwayat` menurun, jadi `i === 0`
                              adalah yang terbaru).

                              Kenapa. Diukur 2026-09-30: baris label ini memakan
                              **119 px dari 323 px** tinggi satu entri di ponsel —
                              36%, anak terbesar di dalam kartu. Dan isinya IDENTIK
                              untuk setiap entri, karena urutan tahap adalah sifat
                              PROSES, bukan sifat satu lamaran. Tiga lamaran berarti
                              tiga salinan daftar yang sama: 357 px dari 1002 px isi
                              kotak gulir, di ponsel.

                              Yang TIDAK dihapus: bar di atasnya (posisi) dan nama
                              tahap di baris `txt_tahapan_saat_ini` (tahap aktif).
                              Jadi "saya di mana" tetap terjawab di setiap entri;
                              yang tersisa sekali hanyalah "urutannya apa saja".

                              Kalau nanti urutannya perlu terlihat juga saat
                              menggulir ke entri lama, pindahkan blok ini ke ATAS
                              kotak gulir sebagai legenda bersama — jangan
                              mengembalikannya per entri. */}
                          {i === 0 && (
                            <div class="flex flex-wrap justify-between gap-x-2 gap-y-1 mt-1.5">
                              {TAHAPAN_STEPS.map((nm, si) => {
                                const done = si < stepIdx;
                                const active = si === stepIdx;
                                return <span key={si} class={`flex items-center gap-1 text-[11px] font-bold whitespace-nowrap ${done ? 'text-emerald-400' : active ? 'text-amber-400' : 'text-slate-500'}`}><Icon name={done ? 'check-circle' : 'circle'} class="flex-shrink-0" /> {nm}</span>;
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
          </div>
        </div>
        {data.needRevision && (
          <div class="bg-red-500/10 border border-red-500/40 rounded-panel p-5 md:p-6 mb-6 md:mb-8 text-left">
            <h3 class="text-accent-red font-bold mb-2 text-lg"><Icon name="exclamation-triangle" class="mr-2" /> {t('candidate.doc_revise_title')}</h3>
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
              class="w-full py-3.5 bg-red-600 hover:bg-red-500 text-white rounded-full text-sm font-bold transition-colors"
            >
              <Icon name="upload" class="mr-2" />{t('button.upload_revise')}
            </button>
          </div>
        )}

        {/* Pemandu langkah + Level kelengkapan DIHAPUS dari sini 2026-09-30.
            Keduanya sekarang hidup di dalam SATU kartu kelengkapan di atas
            (lihat komentar di blok `LevelCard`). Yang tersisa di sini hanya
            berkas — satu-satunya bagian yang punya isi sendiri (daftar 18
            dokumen) dan karena itu tidak bisa dilipat ke dalam meter. */}

        {/* ── Pemberkasan Progress ── */}
        {data.berkasTotal > 0 && (
          <div class="mb-8">
            <div class="bg-black/60 border border-emerald-500/30 rounded-panel p-5 md:p-6 mb-4 text-left">
              {/* Persentase + bar DIHAPUS 2026-09-30: keduanya sudah ada di
                  legenda meter kelengkapan di atas, dan bar ini adalah bar
                  ke-12 di halaman untuk angka yang sama. Yang tersisa di sini
                  hanya yang benar-benar milik kartu ini — daftar dokumennya
                  dan berapa yang sudah masuk. */}
              <div class="flex items-center justify-between flex-wrap gap-2">
                <h2 class="text-sm font-black text-accent-emerald uppercase tracking-widest"><Icon name="tasks" class="mr-1.5" /> {t('ui.berkas_progress')}</h2>
              </div>
              {/* Daftar 18 dokumen adalah BAHAN RUJUKAN, bukan bacaan
                  berurutan: kandidat membukanya untuk mengecek satu baris,
                  bukan untuk membaca dari atas ke bawah. Terbuka terus, ia
                  memakan 442 px di ponsel untuk daftar yang isinya masih 0/18.
                  `<details>` memberi buka-tutup NATIF — tanpa state hook, tanpa
                  JS — dan polanya sudah ada di repo ini (`FaqList.tsx`), jadi
                  `summary`-nya memakai kelas yang sama, termasuk cincin fokus
                  keyboard yang sama.

                  Hitungannya PINDAH ke dalam `summary`: ia sekarang jadi label
                  buka-tutupnya sekaligus, jadi satu teks melayani dua maksud
                  dan tidak ada angka yang tampil dua kali di kartu ini.

                  Tombol "Lengkapi Berkas" sengaja tetap di LUAR `<details>`:
                  ia satu-satunya aksi di kartu ini, dan menguburnya di balik
                  buka-tutup akan membuat aksi utama halaman ini tidak terlihat. */}
              <details class="mt-1">
                {/* `min-h-11` for the 44 px touch floor (§6.4). Measured before:
                    24 px tall. `list-item` is KEPT — it is what draws the native
                    disclosure marker; swapping it for `flex` alone would make the
                    control look like static text. */}
                <summary class="min-h-11 flex cursor-pointer list-item items-center gap-2 pt-2 text-xs font-bold text-accent-emerald marker:text-accent-emerald focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-sky">
                  {data.berkasList.filter(b => b.done).length}/{data.berkasTotal}{t('ui.doc_count_suffix')}
                </summary>
                <div class="grid grid-cols-2 gap-1.5 max-h-44 u-scroll-area custom-scrollbar pr-1 pt-3">
                  {data.berkasList.map((b, i) => (
                    <div key={i} class={`flex items-center gap-2 text-xs px-2 py-1 rounded ${b.done ? 'text-emerald-400' : 'text-slate-500'}`}>
                      <Icon name={b.done ? 'check-circle' : 'circle'} /> {t(b.label)}
                    </div>
                  ))}
                </div>
              </details>
            </div>
            {/* Gradient CTA — `from-emerald-700 to-sky-700`, hover DARKENS.
                White on this family's 600/500 stops fails the 4.5 floor at
                text-sm/700 normal size (emerald-600 = 3.77, emerald-500 = 2.54);
                the 700 stops are 5.48 and the hover darkens to the 800s (7.56).
                Same pair as the install button and the 404 link. */}
            <button data-testid="cmt-pemberkasan" onClick={() => setShowPemberkasan(true)} class="w-full py-4 bg-gradient-to-r from-emerald-700 to-sky-700 hover:from-emerald-800 hover:to-sky-800 text-white rounded-panel font-black shadow-[0_0_20px_rgba(90,141,0,0.4)] hover:-translate-y-1 transition text-sm md:text-base border border-emerald-400/30 text-center">
              <Icon name="folder-open" class="mr-2" />{t('ui.complete_berkas_biodata')}
            </button>
            <p class="text-sm text-emerald-400 mt-3 font-bold text-center"><Icon name="info-circle" class="mr-1" /> {t('ui.berkas_stage_hint')}</p>
          </div>
        )}

        {/* Dulu `inline-block px-6` di dalam panel yang `text-center`, jadi
            tombol ini mengambang 124px di tengah kolom 846px — satu-satunya
            elemen di halaman yang tepinya tidak sejajar dengan apa pun. Sekarang
            selebar kolomnya, seperti setiap kartu lain di atasnya. */}
        <a href="/public" class="w-full inline-flex items-center justify-center gap-2 px-6 py-3 min-h-11 bg-surface-raised border border-line-strong hover:border-accent-sky text-slate-200 rounded-control font-bold transition text-sm">{t('button.view_public_jobs')}</a>
        </div>

        {/* ── Rail kanan (§4.3) ──
            Pola "satu DOM, dua bentuk": TIDAK ada markah kedua. Di ≥1280 px
            ia kolom sticky 22 rem di kanan; di bawah itu ia mengalir setelah
            kolom utama sebagai kartu bertumpuk, urutan sama.

            Isinya yang KONTEKSTUAL saja. Yang primer tetap di kolom utama:
            kelengkapan, jadwal, status lamaran, berkas. "Jadwalmu" SENGAJA
            tidak dipindah ke sini meskipun usulan awal review menaruhnya di
            rail: di ponsel rail mengalir ke BAWAH, dan jadwal MCU adalah hal
            yang paling terikat waktu di halaman ini — menurunkannya ke bawah
            "Progres Pemberkasan" akan jadi regresi, bukan perbaikan.

            `xl:self-start` wajib: tanpa itu item grid meregang setinggi kolom
            utama dan `sticky` tidak punya ruang untuk bergerak. */}
        <aside class="min-w-0 flex flex-col xl:sticky xl:top-[5.5rem] xl:self-start">
              {/* ── Catatan Admin ── */}
              {data.catatan && (
                <div class="mb-6 md:mb-8 bg-sky-900/20 border border-sky-500/30 p-5 md:p-6 rounded-panel text-center">
                  <p class="text-xs text-sky-400 font-bold uppercase mb-2"><Icon name="envelope-open-text" class="mr-1" /> {t('ui.admin_eval_msg')}</p>
                  <p class="text-sm text-slate-200 italic">"{data.catatan}"</p>
                </div>
              )}

                  {/* Action buttons grid */}
                  {/* Action buttons grid — bobot seragam, SENGAJA.
                      Dulu tujuh tombol ini punya tujuh warna pekat (sky/violet/rose/
                      amber/slate/putih/teal) masing-masing dengan glow dan
                      `hover:-translate-y-1`, jadi ketujuhnya berteriak bersamaan dan
                      tidak ada satu pun yang terbaca sebagai "kerjakan ini dulu".
                      Aksi utama halaman ini adalah "Lengkapi Berkas" — satu-satunya
                      CTA bergradien, di kartu atas — jadi tujuh ini turun pangkat
                      jadi aksi SEKUNDER yang seragam: satu permukaan, satu border,
                      dan warna hanya tinggal di ikonnya.

                      Kenapa TIDAK disembunyikan di menu overflow: enam di antaranya
                      membuka modal yang diukur `e2e/test-candidate-modals.mjs`, dan
                      gate itu menuntut pemicunya ADA dan bisa diklik TANPA satu klik
                      tambahan. Jadi bobotnya yang diturunkan, bukan keberadaannya —
                      kalau tidak, "merapikan" di sini sama dengan mematikan gate.

                      `min-h-11` = 44px, lantai sentuh proyek ini (DESIGN.md:691).
                      Sebelumnya tinggi tombol ditentukan `py-3` (12+12+20 = 44px):
                      pas di ambang, dan jatuh di bawahnya begitu line-height font
                      berubah. Sekarang eksplisit, jadi tidak bergantung pada itu. */}
                  <div class="u-grid-auto u-grid-auto--cards gap-3 mt-5">
                    <button data-testid="cmt-cvmini" onClick={() => setShowCvMiniModal(true)} class="w-full flex items-center gap-2.5 px-4 py-3 min-h-11 bg-surface-raised border border-line-strong hover:border-accent-sky text-slate-200 rounded-control text-sm font-bold transition text-left"><Icon name="user-edit" class="text-accent-sky shrink-0" /> {t('ui.update_cv_mini')}</button>
                    <button data-testid="cmt-interview" onClick={openInterview} class="w-full flex items-center gap-2.5 px-4 py-3 min-h-11 bg-surface-raised border border-line-strong hover:border-accent-violet text-slate-200 rounded-control text-sm font-bold transition text-left"><Icon name="microphone-alt" class="text-accent-violet shrink-0" /> {t('ui.interview_practice')}</button>
                    <button data-testid="cmt-esign" onClick={openEsign} class="w-full flex items-center gap-2.5 px-4 py-3 min-h-11 bg-surface-raised border border-line-strong hover:border-accent-red text-slate-200 rounded-control text-sm font-bold transition text-left"><Icon name="signature" class="text-accent-red shrink-0" /> {t('ui.esign_naitei')}</button>
                    <button onClick={openAiCvMaster} class="w-full flex items-center gap-2.5 px-4 py-3 min-h-11 bg-surface-raised border border-line-strong hover:border-accent-amber text-slate-200 rounded-control text-sm font-bold transition text-left cursor-pointer"><Icon name="robot" class="text-accent-amber shrink-0" /> {t('ui.ai_cv_assistant')}</button>
                    <a href="/master" class="w-full flex items-center gap-2.5 px-4 py-3 min-h-11 bg-surface-raised border border-line-strong hover:border-accent-emerald text-slate-200 rounded-control text-sm font-bold transition text-left"><Icon name="clipboard-list" class="text-accent-emerald shrink-0" /> {t('ui.master_full_form')}</a>
                    {/* ── "Pilih Template CV" WAS HERE AND IS NOT COMING BACK ──
                        Owner ruling 2026-09-25: "template cv itu fitur admin bukan
                        buat kandidat". The feature still exists — it is the admin's,
                        at `admin/TabPelamar.tsx` (the button) and
                        `CvTemplateSelector.tsx` (`isAdmin={true}`). Only the candidate
                        entry point is gone, so the component and its
                        `button.pilih_template_cv` key are still LIVE and must not be
                        cleaned up as orphans.

                        The candidate keeps `RirekishoBuilder` below ("Preview Desain
                        CV"), which is the read/preview side of the same feature — so
                        removing this button takes away a chooser, not the ability to
                        see a CV. */}
          <button data-testid="cmt-rirekisho" onClick={() => setShowRirekisho(true)} class="w-full flex items-center gap-2.5 px-4 py-3 min-h-11 bg-surface-raised border border-line-strong hover:border-accent-red text-slate-200 rounded-control text-sm font-bold transition text-left"><Icon name="file-alt" class="text-accent-red shrink-0" /> {t('candidate.btn_preview_cv')}</button>
                    <button data-testid="cmt-password" onClick={() => setShowPasswordModal(true)} class="w-full flex items-center gap-2.5 px-4 py-3 min-h-11 bg-surface-raised border border-line-strong hover:border-accent-sky text-slate-200 rounded-control text-sm font-bold transition text-left"><Icon name="key" class="text-accent-sky shrink-0" /> {t('ui.change_password')}</button>
                  </div>
        </aside>
      </div>

      {/* ── Modals ──
          Each is held mounted for one exit transition (2026-09-28). The
          PRESENCE flags decide what renders, not the raw booleans: the state
          flips to false on the same frame the user clicks close, so gating on
          it would remove the node before CSS could animate it out. `closing`
          is handed to the modal, which forwards it to `useOverlay` — that is
          what marks the shell `data-closing="true"` (see `motion.css` §5b).

          The `isOpen` prop is deliberately still passed as the RAW boolean.
          The modals render themselves while `closing` is true and keep
          `open` true for the same window, so the dialog semantics survive the
          animation instead of being torn down halfway through it. */}
      {passwordModal.present && <ChangePasswordModal closing={passwordModal.closing} onClose={() => setShowPasswordModal(false)} />}
      {cvMiniModal.present && <CvMiniModal closing={cvMiniModal.closing} onClose={() => setShowCvMiniModal(false)} prefill={data.cvmini || undefined} />}
{rirekishoModal.present && <RirekishoBuilder waTarget={user?.wa || data.wa} isOpen={showRirekisho} onClose={() => setShowRirekisho(false)} fotoFallback={data.pasPhoto || undefined} closing={rirekishoModal.closing} />}
      {esignModal.present && <EsignNaiteiModal isOpen={showESign} wa={user?.wa || ""} onClose={() => setShowESign(false)} closing={esignModal.closing} />}
      {pemberkasanModal.present && <PemberkasanModal isOpen={showPemberkasan} onClose={() => setShowPemberkasan(false)} closing={pemberkasanModal.closing} waTarget={user?.wa || ""} namaTarget={user?.name || ""} candidate={data ? { tahapan: data.tahapan, berkas: data.berkas || {}, bio: data.bio || {} } : null} />}
      {interviewModal.present && data && (
        <InterviewSimulatorModal wa={user?.wa || data.wa || ''} nama={data.nama} onClose={() => setShowInterview(false)} closing={interviewModal.closing} />
      )}
    </div>
    </ErrorBoundary>
  );
}


