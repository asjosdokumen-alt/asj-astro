import { useState, useEffect } from 'preact/hooks';
import Icon from '../ui/Icon';
import { useOverlay } from '../ui/useOverlay';
import api, { apiClient } from '../../lib/apiClient';
import { showToast } from '../Toast';
import { t } from '../../store/i18n';
import DocumentPreviewModal from '../DocumentPreviewModal';

interface Props {
  wa: string;
  nama: string;
  isOpen: boolean;
  onClose: () => void;
  /**
   * Row kandidat yang SUDAH ter-dekorasi (mapCandidate + berkas/bio/
   * applications dari getCandidatesPage) — dioper dari TabPelamar supaya
   * modal tidak perlu fetch ulang lewat getAppData mode 'kandidat'
   * (mode itu menolak sesi admin → modal selalu tampil kosong).
   */
  candidate?: Record<string, any> | null;
}

interface CandidateData {
  nama: string;
  wa: string;
  idKandidat?: string;
  gender?: string;
  usia?: string;
  fisik?: string;
  pendidikan?: string;
  tmplahir?: string;
  tgllahir?: string;
  email?: string;
  alamat?: string;
  jft?: string;
  ssw?: string;
  tahapan?: string;
  status?: string;
  catatanInternal?: string;
  catatanExternal?: string;
  isVIP?: boolean;
  isSiswaASJ?: boolean;
  foto?: string;
  /** URL berkas — parity tombol BUKA CV/JFT/SSW/FOTO dossier legacy (cvUrl/jftUrl/sswUrl/pasPhoto). */
  cvUrl?: string;
  jftUrl?: string;
  sswUrl?: string;
  applications?: Array<{
    code: string;
    kategori?: string;
    status: string;
  }>;
  berkas?: Record<string, string>;
  bio?: Record<string, string>;
}

// A class tag is [KELAS XX] or a bare [TAG]; [VIP] is not a class (legacy
// js/admin_modal/cv.ts), so it never marks a candidate as an ASJ student.
function hasClassTag(s: string): boolean {
  const tagRe = /\[(?:KELAS\s*)?([A-Z0-9]+)\]/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(s)) !== null) {
    if (m[1].toUpperCase() !== 'VIP') return true;
  }
  return false;
}

function mapApiToCandidate(c: Record<string, any>, fallbackNama: string, fallbackWa: string): CandidateData {
  const catatanInt = String(c.catatanInt || c.catatanInternal || '');
  const catatanExt = String(c.catatanExt || c.catatanExternal || '');
  const tb = c.tb ?? '';
  const bb = c.bb ?? '';
  // Fisik = TB/BB gabungan (legacy dossier: cv-tbbb = c.tbBb), bukan URL.
  const fisik = c.fisik || c.tbBb || ((tb || bb) ? [tb, bb].filter(Boolean).join(' / ') : '');
  return {
    nama: c.nama || fallbackNama,
    wa: c.wa || fallbackWa,
    idKandidat: c.idKandidat || c.id,
    gender: c.gender,
    usia: c.usia,
    fisik,
    pendidikan: c.pendidikan,
    tmplahir: c.bio?.tmplahir || c.tempatLahir || c.tmplahir,
    tgllahir: c.bio?.tgllahir || c.tglLahir || c.tgllahir,
    email: c.bio?.email || c.email,
    alamat: c.bio?.alamat || c.alamat_lengkap || c.alamat,
    // Tile JFT/SSW menampilkan NILAI teks (jftText/sswText) seperti legacy
    // dossier (cv-jft-nilai/cv-ssw) — URL sertifikat tetap di data.berkas.
    jft: c.jftText || c.jftNilai || '',
    ssw: c.sswText || c.sswBidang || '',
    tahapan: c.tahapan,
    status: c.status,
    catatanInternal: catatanInt,
    catatanExternal: catatanExt,
    // VIP = tag [VIP] di catatan internal (legacy isVipCatatan); KELAS/tag
    // lain = Siswa ASJ. [VIP] BUKAN tag kelas.
    isVIP: /\[VIP\]/i.test(catatanInt),
    isSiswaASJ: !!c.isSiswaASJ || hasClassTag(catatanInt),
    foto: c.berkas?.foto || c.pasPhoto || c.foto || '',
    // B03: surface sertifikat URL — row ter-dekorasi membawa cvUrl/jftUrl/sswUrl
    // (mapCandidate), dossier legacy #modal-cv membuka tombol BUKA CV/JFT/SSW/FOTO.
    cvUrl: c.cvUrl || c.berkas?.cv || c.fileCv || '',
    jftUrl: c.jftUrl || c.berkas?.jft || '',
    sswUrl: c.sswUrl || c.berkas?.ssw || '',
    applications: c.applications || [],
    berkas: c.berkas || {},
    bio: c.bio || {},
  };
}

export default function CandidateProfileModal({ wa, nama, isOpen, onClose, candidate }: Props) {
  const [data, setData] = useState<CandidateData | null>(null);
  // Row MENTAH (ter-dekorasi mapCandidate / getExistingCandidateJsonByWa) —
  // diteruskan apa adanya ke openCandidateEdit supaya EditCandidateModal
  // terisi penuh (A19: dulu yang dikirim data ter-map — fisik digabung,
  // tmplahir ≠ tempatLahir → prefill kosong, defect class A01–A03).
  const [row, setRow] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [catatanInternal, setCatatanInternal] = useState('');
  const [catatanExternal, setCatatanExternal] = useState('');
  const [isVIP, setIsVIP] = useState(false);
  // B03: preview dokumen inline — parity legacy un()/bukaPreviewDokumen di #modal-cv.
  const [preview, setPreview] = useState<{ url: string; title: string } | null>(null);
  const { containerRef, onBackdropClick } = useOverlay({ open: isOpen, onClose });

  // Row yang sudah ter-dekorasi (dari getCandidatesPage) — kalau ada, tidak
  // perlu fetch sama sekali (fix: getAppData mode 'kandidat' menolak sesi
  // admin, jadi modal lama selalu kosong saat dibuka dari TabPelamar).
  const seed =
    candidate && typeof candidate === 'object' && Object.keys(candidate).length > 0
      ? candidate
      : null;

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    const apply = (c: Record<string, any>) => {
      const mapped = mapApiToCandidate(c, nama, wa);
      setData(mapped);
      setRow(c);
      setCatatanInternal(mapped.catatanInternal ?? '');
      setCatatanExternal(mapped.catatanExternal ?? '');
      setIsVIP(mapped.isVIP ?? false);
    };
    if (seed) {
      apply(seed);
      return () => controller.abort();
    }
    if (!wa) {
      setData({ nama, wa, applications: [] });
      return () => controller.abort();
    }
    // Fallback (pemanggil lain yang hanya punya WA): getExistingCandidateJsonByWa
    // — di-guard isOwnerOrAdmin di backend, jadi aman untuk sesi admin.
    setLoading(true);
    setData(null);
    // Sudah TIDAK `fetch` mentah (dikonversi 2026-09-18).
    //
    // Komentar yang dulu ada di sini menyatakan konversinya ditunda karena
    // "`apiClient` belum punya opsi `signal`". Itu tidak benar sejak awal:
    // opsi `signal` ADA di klien, dan doc comment-nya justru menyebut berkas
    // INI sebagai alasan opsi itu dibuat. Penundaan itu tidak pernah dicabut.
    //
    // Pembatalan saat unmount TETAP ADA: `signal` diteruskan ke klien, yang
    // menggabungkannya dengan batas waktu 20 s miliknya sendiri. Abort dari
    // sini bukan kegagalan — ia dilempar ulang sebagai AbortError dan tidak
    // pernah memunculkan toast "timed out" (lihat opsi `signal` di apiClient).
    //
    // `requireAuth: false` — sama dengan perilaku lama: token tetap dikirim,
    // tetapi pemeriksaan sesi diserahkan ke penjaga isOwnerOrAdmin di server.
    // Setiap kegagalan (non-2xx, sessionInvalid, abort) berakhir seperti dulu:
    // data kosong, tanpa logout/redirect global.
    // `silent: true` — fallback ini senyap; tidak ada toast yang diharapkan.
    apiClient<{ success?: boolean; data?: Record<string, unknown> }>(
      'getExistingCandidateJsonByWa',
      [wa],
      {
        requireAuth: false,
        onSessionInvalid: 'throw',
        silent: true,
        signal: controller.signal,
      },
    )
      .then(d => {
        if (controller.signal.aborted) return;
        if (!d || d.success === false || !d.data) {
          setData({ nama, wa, applications: [] });
          return;
        }
        apply(d.data);
      })
      .catch(e => {
        if (e.name === 'AbortError') return;
        setData({ nama, wa, applications: [] });
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [isOpen, wa, seed]);

  if (!isOpen) return null;

  // Parity dengan legacy simpanCatatanCv (js/admin_modal/cv.ts): tulis ulang
  // tag [VIP] sesuai toggle & pertahankan tag kelas ([KELAS X] / [X]), lalu
  // simpan catatan internal + external via updateCatatanKandidat.
  const handleSaveCatatan = async () => {
    if (!data || !data.wa) return;
    setSaving(true);
    try {
      let intNote = catatanInternal.trim();
      if (isVIP) {
        if (!/\[VIP\]/i.test(intNote)) intNote = intNote ? '[VIP] ' + intNote : '[VIP]';
      } else {
        intNote = intNote.replace(/\[VIP\]\s*/gi, '').trim();
      }
      // Tag kelas ([KELAS X] / [X]) TIDAK ditulis ulang otomatis: teksarea
      // menampilkan catatan mentah (termasuk tag), jadi apa yang admin lihat
      // adalah apa yang tersimpan — tanpa duplikasi tag diam-diam.
      const extNote = catatanExternal.trim();
      // `silent: true` — catch di bawah sudah menampilkan toast, dan ia membaca
      // `e.message` yang kini berisi pesan server (lihat apiClient). Tanpa
      // silent, satu kegagalan muncul dua kali.
      const out = (await api.secure(
        'updateCatatanKandidat',
        [{ wa: data.wa, catatanInternal: intNote, catatanExternal: extNote }],
        { onSessionInvalid: 'throw', silent: true },
      )) as { success?: boolean; error?: string };
      if (out && out.success) {
        const patched = { ...data, catatanInternal: intNote, catatanExternal: extNote, isVIP };
        setData(patched);
        setCatatanInternal(intNote);
        setCatatanExternal(extNote);
        showToast(t('ui.toast_eval_note_saved'), 'success');
        window.dispatchEvent(new CustomEvent('candidates-changed', { detail: { wa: data.wa } }));
      } else {
        showToast(String((out && out.error) || t('ui.cv_save_failed')), 'error');
      }
    } catch (e) {
      showToast(t('alert.network') + (e instanceof Error ? e.message : String(e)), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadBiodata = () => {
    if (!data) return;
    const lines = [
      `BIODATA KANDIDAT`,
      `================`,
      `Nama: ${data.nama}`,
      `WA: ${data.wa}`,
      `ID: ${data.idKandidat || '-'}`,
      `Gender: ${data.gender || '-'}`,
      `Usia: ${data.usia || '-'} Tahun`,
      `Tempat Lahir: ${data.tmplahir || '-'}`,
      `Tanggal Lahir: ${data.tgllahir || '-'}`,
      `Email: ${data.email || '-'}`,
      `Alamat: ${data.alamat || '-'}`,
      `JFT: ${data.jft || '-'}`,
      `SSW: ${data.ssw || '-'}`,
      `Fisik: ${data.fisik || '-'}`,
      `Pendidikan: ${data.pendidikan || '-'}`,
      `Tahapan: ${data.tahapan || '-'}`,
      `Status: ${data.status || '-'}`,
      `VIP: ${data.isVIP ? 'YA' : 'TIDAK'}`,
      ``,
      `BERKAS:`,
      ...Object.entries(data.berkas || {}).filter(([, v]) => v).map(([k, v]) => `  ${k}: ${v}`),
      ``,
      `BIODATA DETAIL:`,
      ...Object.entries(data.bio || {}).filter(([, v]) => v).map(([k, v]) => `  ${k}: ${v}`),
    ].join('\n');
    const blob = new Blob([lines], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `biodata-${data.idKandidat || data.wa}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div class="fixed inset-0 u-modal-shell bg-black/80 backdrop-blur-md z-[200] flex items-center justify-center p-4" onClick={onBackdropClick}>
      <div ref={containerRef} class="glass-panel p-6 rounded-[2rem] w-full max-w-2xl max-h-[90vh] u-scroll-area shadow-2xl relative">
        <button onClick={onClose} class="absolute top-4 right-5 text-slate-400 hover:text-white z-[100]">
          <Icon name="times" class="text-2xl" />
        </button>

        {loading || !data ? (
          <div class="text-center py-12">
            <Icon spin name="spinner" class="text-2xl text-sky-400" />
            <p class="text-slate-500 mt-2 text-sm">{t('ui.loading_candidates')}</p>
          </div>
        ) : (
          <>
            {/* 1. Digital Student Card */}
            <div class="flex items-start gap-4 mb-6 p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
              <div class="w-20 h-20 rounded-lg bg-sky-600/20 border-2 border-sky-500/40 flex items-center justify-center overflow-hidden shrink-0">
                {data.foto ? (
                  <img src={data.foto} alt={data.nama} class="w-full h-full object-cover" />
                ) : (
                  <span class="text-sky-400 text-2xl font-bold">{data.nama.charAt(0).toUpperCase()}</span>
                )}
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <h2 class="text-lg font-bold text-white truncate">{data.nama}</h2>
                  {data.isSiswaASJ ? (
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">{t('ui.cv_siswa_asj')}</span>
                  ) : (
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-500/20 text-slate-400 border border-slate-500/40">{t('ui.cv_eksternal')}</span>
                  )}
                </div>
                <p class="text-xs text-emerald-400 font-mono mt-1">📱 {data.wa}</p>
                {data.idKandidat && (
                  <span class="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-600/30 text-sky-300 border border-sky-500/40">{data.idKandidat}</span>
                )}
                {(data.tahapan || data.status) && (
                  <div class="mt-2 flex items-center gap-1.5 flex-wrap">
                    <span class="text-[10px] text-slate-500 uppercase">{t('ui.cv_status_label')}</span>
                    {data.tahapan && (
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">{data.tahapan}</span>
                    )}
                    {data.status && (
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/40">{data.status}</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* 2. Biodata */}
            <div class="mb-4 p-4 bg-slate-800/30 rounded-xl border border-slate-700/30">
              <h3 class="text-xs font-bold text-sky-400 mb-3 uppercase">{t('ui.cv_bio_header')}</h3>
              <div class="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span class="text-[10px] text-slate-500 uppercase">{t('ui.cv_gender')}</span>
                  <p class="text-white font-bold">{data.gender || '-'}</p>
                </div>
                <div>
                  <span class="text-[10px] text-slate-500 uppercase">{t('ui.cv_usia')}</span>
                  <p class="text-white font-bold">{data.usia ? `${data.usia}${t('ui.age_years_suffix')}` : '-'}</p>
                </div>
                <div>
                  <span class="text-[10px] text-slate-500 uppercase">{t('ui.cv_fisik')}</span>
                  <p class="text-white font-bold">{data.fisik || '-'}</p>
                </div>
                <div>
                  <span class="text-[10px] text-slate-500 uppercase">{t('ui.cv_pendidikan')}</span>
                  <p class="text-white font-bold">{data.pendidikan || '-'}</p>
                </div>
                <div>
                  <span class="text-[10px] text-slate-500 uppercase">{t('ui.cv_ttl')}</span>
                  <p class="text-white font-bold">{data.tmplahir && data.tgllahir ? `${data.tmplahir}, ${data.tgllahir}` : data.tmplahir || data.tgllahir || '-'}</p>
                </div>
                <div>
                  <span class="text-[10px] text-slate-500 uppercase">{t('ui.cv_email')}</span>
                  <p class="text-white font-bold">{data.email || '-'}</p>
                </div>
                <div class="col-span-2">
                  <span class="text-[10px] text-slate-500 uppercase">{t('ui.cv_alamat')}</span>
                  <p class="text-white font-bold">{data.alamat || '-'}</p>
                </div>
              </div>
              <div class="flex gap-3 mt-3">
                <div class="flex-1 p-2 bg-sky-900/30 rounded-lg border border-sky-500/20 text-center">
                  <span class="text-[10px] text-sky-400 uppercase font-bold">{t('ui.jft_jlpt')}</span>
                  <p class="text-white font-bold text-sm">{data.jft || '-'}</p>
                </div>
                <div class="flex-1 p-2 bg-emerald-900/30 rounded-lg border border-emerald-500/20 text-center">
                  <span class="text-[10px] text-emerald-400 uppercase font-bold">{t('ui.ssw_field')}</span>
                  <p class="text-white font-bold text-sm">{data.ssw || '-'}</p>
                </div>
              </div>
            </div>

            {/* 3. Edit Data Cepat */}
            <button
              onClick={() => {
                // Row mentah supaya EditCandidateModal (A03) ter-prefill penuh:
                // gender/usia/tempatLahir/tglLahir/tb/bb/jftText/sswText/catatanInt.
                window.dispatchEvent(new CustomEvent('openCandidateEdit', { detail: row || data }));
              }}
              class="w-full mb-4 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-sm font-bold transition flex items-center justify-center gap-2"
            >
              <Icon name="edit" /> {t('ui.edit_quick_cv')}
            </button>

            {/* 3b. Pemberkasan & Biodata */}
            <button
              onClick={() => {
                window.dispatchEvent(new CustomEvent('openPemberkasan', { detail: { wa: data.wa, nama: data.nama, candidate: data } }));
              }}
              class="w-full mb-4 px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-sm font-bold transition flex items-center justify-center gap-2"
            >
              <Icon name="folder-open" /> {t('ui.complete_berkas_biodata')}
            </button>

            {/* 3c. Preview Dokumen — BUKA CV/JFT/SSW/FOTO (parity dossier legacy btn-cv-jft/dll) */}
            {(data.foto || data.cvUrl || data.jftUrl || data.sswUrl) && (
              <div class="mb-4 p-4 bg-slate-800/30 rounded-xl border border-slate-700/30">
                <h3 class="text-xs font-bold text-sky-400 mb-3 uppercase">{t('ui.doc_preview_title')}</h3>
                <div class="flex flex-wrap gap-2">
                  {data.foto && (
                    <button onClick={() => setPreview({ url: data.foto!, title: t('ui.open_photo') })}
                      class="px-3 py-2 bg-slate-700 hover:bg-sky-600 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer">
                      <Icon name="camera" class="text-xs" /> {t('ui.open_photo')}
                    </button>
                  )}
                  {data.cvUrl && (
                    <button onClick={() => setPreview({ url: data.cvUrl!, title: t('ui.open_cv') })}
                      class="px-3 py-2 bg-slate-700 hover:bg-sky-600 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer">
                      <Icon name="file-alt" class="text-xs" /> {t('ui.open_cv')}
                    </button>
                  )}
                  {data.jftUrl && (
                    <button onClick={() => setPreview({ url: data.jftUrl!, title: t('ui.open_jft') })}
                      class="px-3 py-2 bg-slate-700 hover:bg-sky-600 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer">
                      <Icon name="file-pdf" class="text-xs" /> {t('ui.open_jft')}
                    </button>
                  )}
                  {data.sswUrl && (
                    <button onClick={() => setPreview({ url: data.sswUrl!, title: t('ui.open_ssw') })}
                      class="px-3 py-2 bg-slate-700 hover:bg-sky-600 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer">
                      <Icon name="file-pdf" class="text-xs" /> {t('ui.open_ssw')}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* 4. Job Yang Dilamar */}
            <div class="mb-4 p-4 bg-slate-800/30 rounded-xl border border-slate-700/30">
              <h3 class="text-xs font-bold text-sky-400 mb-3 uppercase">{t('ui.cv_jobs_header')}</h3>
              {(!data.applications || data.applications.length === 0) ? (
                <p class="text-slate-500 text-sm">{t('ui.cv_no_applications')}</p>
              ) : (
                <div class="flex flex-wrap gap-2">
                  {data.applications.map((app, i) => (
                    <div key={i} class="flex items-center gap-2 px-3 py-1.5 bg-slate-800 rounded-lg border border-slate-700/50">
                      <Icon name="briefcase" class="text-sky-400 text-xs" />
                      <span class="text-white text-sm font-bold">{app.kategori || app.code}</span>
                      <span class={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        app.status === 'LULUS' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' :
                        app.status === 'Aktif' ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40' :
                        'bg-slate-600/50 text-slate-300 border border-slate-600'
                      }`}>{app.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 5. Download Full Biodata */}
            <button
              onClick={handleDownloadBiodata}
              class="w-full mb-4 px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-sm font-bold transition flex items-center justify-center gap-2"
            >
              <Icon name="download" /> {t('ui.cv_download_biodata')}
            </button>

            {/* 6. Evaluasi Kandidat (VIP Toggle) */}
            <div class="mb-4 p-4 bg-slate-800/30 rounded-xl border border-slate-700/30">
              <h3 class="text-xs font-bold text-sky-400 mb-3 uppercase">{t('ui.cand_eval')}</h3>
              <button
                onClick={() => setIsVIP(!isVIP)}
                class={`w-full px-4 py-2 rounded-lg text-sm font-bold transition flex items-center justify-center gap-2 ${
                  isVIP
                    ? 'bg-amber-600 hover:bg-amber-500 text-white'
                    : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                }`}
              >
                {isVIP ? t('ui.cv_vip_on') : t('ui.cv_vip_off')}
              </button>
            </div>

            {/* 7. Catatan Internal & External */}
            <div class="mb-4 space-y-3">
              <div>
                <label class="text-xs font-bold text-red-400 uppercase mb-1 block" for="cpm-note-int">{t('ui.note_internal')}</label>
                <textarea
                  id="cpm-note-int"
                  value={catatanInternal}
                  onInput={(e) => setCatatanInternal((e.target as HTMLTextAreaElement).value)}
                  placeholder={t('ui.cv_note_int_ph')}
                  class="w-full p-3 bg-slate-800/50 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 outline-none focus:border-sky-500 transition resize-none"
                  rows={3}
                />
              </div>
              <div>
                <label class="text-xs font-bold text-sky-400 uppercase mb-1 block" for="cpm-note-ext">{t('ui.note_external')}</label>
                <textarea
                  id="cpm-note-ext"
                  value={catatanExternal}
                  onInput={(e) => setCatatanExternal((e.target as HTMLTextAreaElement).value)}
                  placeholder={t('ui.cv_note_ext_ph')}
                  class="w-full p-3 bg-slate-800/50 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 outline-none focus:border-sky-500 transition resize-none"
                  rows={3}
                />
              </div>
            </div>

            {/* 8. Simpan + Footer */}
            <div class="flex flex-col gap-2 mt-4 pt-4 border-t border-slate-700/50">
              <button
                onClick={handleSaveCatatan}
                disabled={saving}
                class="w-full px-4 py-2.5 bg-pink-600 hover:bg-pink-500 disabled:opacity-60 text-white rounded-lg text-sm font-bold transition flex items-center justify-center gap-2"
              >
                {saving ? <><Icon spin name="spinner" /> {t('ui.saving')}</> : <><Icon name="save" /> {t('ui.cv_save_eval')}</>}
              </button>
              <div class="flex gap-2">
                <a
                  href={`https://wa.me/${data.wa}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-bold transition flex items-center justify-center gap-2"
                >
                  <Icon name="whatsapp" /> {t('ui.cv_wa')}
                </a>
                <button onClick={onClose} class="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-bold transition">
                  {t('ui.close')}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
      {preview && (
        <DocumentPreviewModal url={preview.url} title={preview.title} onClose={() => setPreview(null)} />
      )}
    </div>
  );
}
