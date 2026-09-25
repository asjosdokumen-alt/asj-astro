import { useState, useEffect } from 'preact/hooks';
import Icon from '../ui/Icon';
import { useOverlay } from '../ui/useOverlay';
import api from '../../lib/apiClient';
import { showToast } from '../Toast';
import { uploadToCloudinary } from '../../lib/cloudinary';
import { t } from '../../store/i18n';

interface Props {
  candidate: {
    wa: string;
    nama: string;
    // Field mengikuti mapCandidate (row ter-dekorasi getCandidatesPage) +
    // alias legacy — bukan nama lama (tmplahir/fisik) yang bikin prefill kosong.
    gender?: string;
    usia?: string;
    tempatLahir?: string;
    tglLahir?: string;
    tb?: string;
    bb?: string;
    pendidikan?: string;
    jftText?: string;
    sswText?: string;
    tahapan?: string;
    status?: string;
    catatan?: string; // catatan_admin — fallback bila catatanExt kosong
    catatanInt?: string; // catatan_internal — pemilik tag [VIP]/[KELAS]
    catatanExt?: string; // catatan_external — catatan utk kandidat
    isVIP?: boolean;
    isSiswaASJ?: boolean;
  };
  isOpen: boolean;
  onClose: () => void;
}

const GENDER_OPTIONS = ['', 'LAKI-LAKI', 'PEREMPUAN'];
const PENDIDIKAN_OPTIONS = ['', 'SD', 'SMP', 'SMA', 'SMK', 'MA', 'D1', 'D2', 'D3', 'S1', 'S2', 'S3'];
const TAHAPAN_OPTIONS = ['', 'Baru', 'Pendaftaran', 'LIST', 'MCU PARPOR', 'Wawancara', 'LULUS'];
const STATUS_OPTIONS = ['', 'Aktif', 'LULUS', 'GAGAL', 'Non-Aktif'];

// Jenis berkas = token FILE_LABEL_COLUMNS backend (simpanBerkasTahapan),
// bukan nama kolom — dulu tombol upload cuma nembak Cloudinary tanpa persist.
const DOC_UPLOADS: { jenis: string; label: string; accept: string }[] = [
  { jenis: 'PAS_PHOTO', label: 'Pas Photo', accept: 'image/*' },
  { jenis: 'CV', label: 'CV / Rirekisho', accept: '.pdf,.doc,.docx,.xls,.xlsx,image/*' },
  { jenis: 'JFT', label: 'Sertif JFT', accept: '.pdf,image/*' },
  { jenis: 'SSW', label: 'Sertif SSW', accept: '.pdf,image/*' },
  { jenis: 'KTP', label: 'KTP', accept: '.pdf,image/*' },
  { jenis: 'KK', label: 'KK', accept: '.pdf,image/*' },
  { jenis: 'IJAZAH SD', label: 'Ijazah SD', accept: '.pdf,image/*' },
  { jenis: 'IJAZAH SMP', label: 'Ijazah SMP', accept: '.pdf,image/*' },
  { jenis: 'IJAZAH SMA', label: 'Ijazah SMA', accept: '.pdf,image/*' },
  { jenis: 'UNIVERSITAS', label: 'Ijazah Universitas', accept: '.pdf,image/*' },
];

// Parity legacy bukaSuperEditKandidat: usia dihitung ulang dari tgl_lahir
// (fallback: nilai tersimpan). Mengembalikan null kalau tanggal tidak valid.
function computeAge(tglLahir: string): number | null {
  if (!tglLahir || tglLahir === '-') return null;
  const dob = new Date(tglLahir);
  if (isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age > 0 ? age : null;
}

export default function EditCandidateModal({ candidate, isOpen, onClose }: Props) {
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [form, setForm] = useState({
    gender: candidate.gender || '',
    usia: candidate.usia || '',
    tempatLahir: candidate.tempatLahir || '',
    tglLahir: candidate.tglLahir || '',
    tb: candidate.tb || '',
    bb: candidate.bb || '',
    pendidikan: candidate.pendidikan || '',
    jftText: candidate.jftText || '',
    sswText: candidate.sswText || '',
    tahapan: candidate.tahapan || '',
    status: candidate.status || 'Aktif',
    catatanExt: candidate.catatanExt ?? candidate.catatan ?? '',
  });
  // VIP = tag [VIP] di catatan INTERNAL (legacy bukaSuperEditKandidat membaca
  // c.catatanInt) — bukan catatan_admin seperti rebuild lama.
  //
  // Case-SENSITIVE, disengaja (legacy `includes('[VIP]')`, lib/vip.ts): versi
  // /\[VIP\]/i yang dulu ada di sini menyalakan toggle untuk catatan `[vip]`,
  // padahal isVipCatatan (gerbang AI CV/simulator) menolaknya — toggle dan
  // gerbang tidak sepakat untuk kandidat yang sama.
  const [isVIP, setIsVIP] = useState(() => (candidate.catatanInt || '').includes('[VIP]'));
  const { containerRef, onBackdropClick } = useOverlay({ open: isOpen, onClose });

  useEffect(() => {
    if (isOpen) {
      const prefill = {
        gender: candidate.gender || '',
        usia: candidate.usia || '',
        tempatLahir: candidate.tempatLahir || '',
        tglLahir: candidate.tglLahir || '',
        tb: candidate.tb || '',
        bb: candidate.bb || '',
        pendidikan: candidate.pendidikan || '',
        jftText: candidate.jftText || '',
        sswText: candidate.sswText || '',
        tahapan: candidate.tahapan || '',
        status: candidate.status || 'Aktif',
        catatanExt: candidate.catatanExt ?? candidate.catatan ?? '',
      };
      const age = computeAge(prefill.tglLahir);
      setForm({ ...prefill, usia: age !== null ? String(age) : prefill.usia });
      setIsVIP((candidate.catatanInt || '').includes('[VIP]'));
    }
  }, [isOpen, candidate]);

  const setField = (key: string, value: string) => {
    setForm(prev => {
      const next = { ...prev, [key]: value };
      // Parity legacy: usia dihitung ulang saat tgl_lahir berubah (bisa
      // di-override manual setelahnya lewat input Usia).
      if (key === 'tglLahir') {
        const age = computeAge(value);
        if (age !== null) next.usia = String(age);
      }
      return next;
    });
  };

  const toggleVIP = () => setIsVIP(!isVIP);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Lewat klien bersama (non-negotiable #3): batas waktu + AbortController,
      // dan token yang DIREFRESH lewat getFreshToken() alih-alih snapshot
      // `authStore.get().sessionToken` yang bisa sudah kedaluwarsa.
      //
      // `silent: true` di kedua situs di bawah: catch-nya SUDAH menampilkan toast
      // sendiri, jadi tanpa itu satu kegagalan dilaporkan dua kali. `silent`
      // mematikan TOAST klien, bukan throw-nya — `err.message` tetap membawa pesan
      // server (83b3541), sehingga pesan di toast tetap yang paling spesifik.
      const data = (await api.secure('updateKandidatSuper', [{
        wa: candidate.wa,
        gender: form.gender,
        usia: form.usia,
        tempatLahir: form.tempatLahir,
        tglLahir: form.tglLahir,
        tb: form.tb,
        bb: form.bb,
        pendidikan: form.pendidikan,
        jftText: form.jftText,
        sswText: form.sswText,
        tahapan: form.tahapan,
        status: form.status,
        // Parity legacy simpanSuperEditKandidat: catatan external +
        // toggle VIP internal dikirim SEKALI di updateKandidatSuper.
        catatanExt: form.catatanExt,
        isVip: isVIP,
      }], { onSessionInvalid: 'throw', silent: true })) as { success?: boolean; error?: string };
      if (data && data.success) {
        showToast('Data kandidat berhasil disimpan!', 'success');
        window.dispatchEvent(new CustomEvent('candidates-changed', { detail: { wa: candidate.wa } }));
        onClose();
      } else {
        showToast((data && data.error) || 'Gagal menyimpan data.', 'error');
      }
    } catch (e) {
      showToast('Network error: ' + (e instanceof Error ? e.message : String(e)), 'error');
    } finally {
      setSaving(false);
    }
  };

  // Upload dokumen → Cloudinary lalu SIMPAN (simpanBerkasTahapan). Dulu hanya
  // upload ke Cloudinary tanpa persist URL — tombol palsu.
  const handleFileUpload = async (jenis: string, file: File) => {
    setUploading(jenis);
    try {
      const url = await uploadToCloudinary(file);
      if (!url) throw new Error('Cloudinary tidak mengembalikan URL.');
      const data = (await api.secure('simpanBerkasTahapan', [{
        wa: candidate.wa,
        nama: String(candidate.nama || 'KANDIDAT').toUpperCase(),
        jenisBerkas: jenis,
        fileUrl: url,
      }], { onSessionInvalid: 'throw', silent: true })) as { success?: boolean; error?: string };
      if (data && data.success) showToast(jenis + ' tersimpan.', 'success');
      else showToast((data && data.error) || 'Gagal menyimpan ' + jenis + '.', 'error');
    } catch (e) {
      showToast('Gagal upload ' + jenis + ': ' + (e instanceof Error ? e.message : String(e)), 'error');
    } finally {
      setUploading(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div class="fixed inset-0 u-modal-shell bg-black/80 backdrop-blur-md z-[200] flex items-center justify-center p-4" onClick={onBackdropClick}>
      <div ref={containerRef} onClick={e => e.stopPropagation()} class="glass-panel p-6 rounded-[2rem] w-full max-w-lg max-h-[90vh] u-scroll-area shadow-2xl relative">
        <button onClick={onClose} class="absolute top-4 right-5 text-slate-400 hover:text-white z-[100]">
          <Icon name="times" class="text-2xl" />
        </button>

        <h2 class="text-lg font-bold text-white mb-1 flex items-center gap-2">
          <Icon name="edit" class="text-sky-400" /> {t("admin.edit_data_kandidat")}
        </h2>
        <p class="text-xs text-slate-400 mb-4">{candidate.nama} — {candidate.wa}</p>

        <div class="flex items-center gap-3 mb-4 p-2 bg-slate-800/30 rounded-xl border border-slate-700/50">
          <span class="text-xs text-slate-400 font-bold">{t("admin.privilege_tag")}</span>
          <button onClick={toggleVIP} class={`relative w-11 h-6 rounded-full transition-colors ${isVIP ? 'bg-amber-500' : 'bg-slate-600'}`}>
            <span class={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isVIP ? 'translate-x-5' : ''}`} />
          </button>
          <span class={`text-xs font-bold ${isVIP ? 'text-amber-400' : 'text-slate-500'}`}>
            {isVIP ? '[VIP] Aktif' : 'Non-VIP'}
          </span>
        </div>

        <div class="space-y-3">
          {/* Gender */}
          <div>
            <label class="text-[10px] text-slate-500 uppercase font-bold" for="ec-gender">{t("admin.edit_gender")}</label>
            <select id="ec-gender" value={form.gender} onChange={e => setField('gender', (e.target as HTMLSelectElement).value)} class="w-full p-2 bg-slate-800/50 border border-slate-700 rounded-lg text-sm text-white outline-none focus:border-sky-500">
              {GENDER_OPTIONS.map(g => <option key={g} value={g}>{g || '- Pilih -'}</option>)}
            </select>
          </div>

          {/* Usia + TB + BB */}
          <div class="grid grid-cols-3 gap-3">
            <div>
              <label class="text-[10px] text-slate-500 uppercase font-bold" for="ec-usia">{t("ui.cv_usia")}</label>
              <input id="ec-usia" type="number" value={form.usia} onInput={e => setField('usia', (e.target as HTMLInputElement).value)} class="w-full p-2 bg-slate-800/50 border border-slate-700 rounded-lg text-sm text-white outline-none focus:border-sky-500" />
            </div>
            <div>
              <label class="text-[10px] text-slate-500 uppercase font-bold" for="ec-tb">{t("admin.edit_tb")}</label>
              <input id="ec-tb" type="number" value={form.tb} onInput={e => setField('tb', (e.target as HTMLInputElement).value)} class="w-full p-2 bg-slate-800/50 border border-slate-700 rounded-lg text-sm text-white outline-none focus:border-sky-500" />
            </div>
            <div>
              <label class="text-[10px] text-slate-500 uppercase font-bold" for="ec-bb">{t("admin.edit_bb")}</label>
              <input id="ec-bb" type="number" value={form.bb} onInput={e => setField('bb', (e.target as HTMLInputElement).value)} class="w-full p-2 bg-slate-800/50 border border-slate-700 rounded-lg text-sm text-white outline-none focus:border-sky-500" />
            </div>
          </div>

          {/* Tempat Lahir + Tgl Lahir */}
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-[10px] text-slate-500 uppercase font-bold" for="ec-tempat-lahir">{t("admin.edit_tempat_lahir")}</label>
              <input id="ec-tempat-lahir" type="text" value={form.tempatLahir} onInput={e => setField('tempatLahir', (e.target as HTMLInputElement).value)} class="w-full p-2 bg-slate-800/50 border border-slate-700 rounded-lg text-sm text-white outline-none focus:border-sky-500" />
            </div>
            <div>
              <label class="text-[10px] text-slate-500 uppercase font-bold" for="ec-tgl-lahir">{t("admin.edit_tgl_lahir")}</label>
              <input id="ec-tgl-lahir" type="date" value={form.tglLahir} onInput={e => setField('tglLahir', (e.target as HTMLInputElement).value)} class="w-full p-2 bg-slate-800/50 border border-slate-700 rounded-lg text-sm text-white outline-none focus:border-sky-500" />
            </div>
          </div>

          {/* Pendidikan */}
          <div>
            <label class="text-[10px] text-slate-500 uppercase font-bold" for="ec-pendidikan">{t("admin.edit_pendidikan")}</label>
            <select id="ec-pendidikan" value={form.pendidikan} onChange={e => setField('pendidikan', (e.target as HTMLSelectElement).value)} class="w-full p-2 bg-slate-800/50 border border-slate-700 rounded-lg text-sm text-white outline-none focus:border-sky-500">
              {PENDIDIKAN_OPTIONS.map(p => <option key={p} value={p}>{p || '- Pilih -'}</option>)}
            </select>
          </div>

          {/* JFT + SSW */}
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-[10px] text-slate-500 uppercase font-bold" for="ec-jft">{t("admin.edit_jft")}</label>
              <input id="ec-jft" type="text" value={form.jftText} onInput={e => setField('jftText', (e.target as HTMLInputElement).value)} class="w-full p-2 bg-slate-800/50 border border-slate-700 rounded-lg text-sm text-white outline-none focus:border-sky-500" />
            </div>
            <div>
              <label class="text-[10px] text-slate-500 uppercase font-bold" for="ec-ssw">{t("admin.edit_ssw")}</label>
              <input id="ec-ssw" type="text" value={form.sswText} onInput={e => setField('sswText', (e.target as HTMLInputElement).value)} class="w-full p-2 bg-slate-800/50 border border-slate-700 rounded-lg text-sm text-white outline-none focus:border-sky-500" />
            </div>
          </div>

          {/* Tahapan + Status */}
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-[10px] text-slate-500 uppercase font-bold" for="ec-tahapan">{t("admin.edit_tahapan")}</label>
              <select id="ec-tahapan" value={form.tahapan} onChange={e => setField('tahapan', (e.target as HTMLSelectElement).value)} class="w-full p-2 bg-slate-800/50 border border-slate-700 rounded-lg text-sm text-white outline-none focus:border-sky-500">
                {TAHAPAN_OPTIONS.map(t => <option key={t} value={t}>{t || '- Pilih -'}</option>)}
              </select>
            </div>
            <div>
              <label class="text-[10px] text-slate-500 uppercase font-bold" for="ec-status">{t("admin.edit_status")}</label>
              <select id="ec-status" value={form.status} onChange={e => setField('status', (e.target as HTMLSelectElement).value)} class="w-full p-2 bg-slate-800/50 border border-slate-700 rounded-lg text-sm text-white outline-none focus:border-sky-500">
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s || '- Pilih -'}</option>)}
              </select>
            </div>
          </div>
          {/* Catatan External (legacy: textarea super-edit = catatanExt) */}
          <div>
            <label class="text-[10px] text-slate-500 uppercase font-bold" for="ec-catatan-ext">{t("admin.edit_catatan_ext")}</label>
            <textarea id="ec-catatan-ext" value={form.catatanExt} onInput={e => setField('catatanExt', (e.target as HTMLTextAreaElement).value)} rows={3} class="w-full p-2 bg-slate-800/50 border border-slate-700 rounded-lg text-sm text-white outline-none focus:border-sky-500 resize-none" placeholder={t("admin.ph_feedback")} />
          </div>

          {/* Document Upload */}
          <div class="border-t border-slate-700/50 pt-3 mt-3">
            <div class="text-[10px] text-slate-500 uppercase font-bold flex items-center gap-1 mb-2">
              <Icon name="file-arrow-up" class="text-sky-400" /> {t("admin.upload_dokumen")}
            </div>
            <div class="grid grid-cols-2 gap-2">
              {DOC_UPLOADS.map(doc => (
                <label key={doc.jenis} class="flex items-center gap-2 p-2 bg-slate-800/30 rounded-lg border border-slate-700/50 hover:border-sky-500/50 cursor-pointer transition">
                  <Icon name="upload" class="text-slate-500 text-xs" />
                  <span class="text-xs text-slate-400 truncate">{doc.label}</span>
                  <input type="file" accept={doc.accept} class="hidden" onChange={e => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) handleFileUpload(doc.jenis, f); }} />
                  {uploading === doc.jenis && <Icon spin name="spinner" class="text-sky-400 text-xs ml-auto" />}
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div class="flex gap-2 mt-5 pt-4 border-t border-slate-700/50">
          <button
            onClick={handleSave}
            disabled={saving}
            class="flex-1 px-4 py-2.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white rounded-lg text-sm font-bold transition flex items-center justify-center gap-2"
          >
            {saving ? <><Icon spin name="spinner" /> {t("admin.saving")}</> : <><Icon name="save" /> {t("button.save")}</>}
          </button>
          <button onClick={onClose} class="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-bold transition">
            {t("button.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
