/**
 * InputManualModal.tsx — Modal form input kandidat manual
 * Source: legacy/assets/modals-shared.html → modal-input-manual
 * Matched 1:1 with legacy screenshot
 */
import { useState } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import { inputModalOpen, closeInputModal } from '../../store/adminStore';
// t() dipakai di baris ~146 tetapi tidak diimpor → ReferenceError saat render.
import { t } from '../../store/i18n';
import Icon from '../ui/Icon';
import { useOverlay } from '../ui/useOverlay';
import api from '../../lib/apiClient';
import { showToast } from '../Toast';
import { uploadToCloudinary } from '../../lib/cloudinary';

// Props: no longer needed — reads from store directly
// Kept minimal for backward compat

const EXTRA_DOC_TYPES = [
  { value: 'PAS PHOTO', label: 'PAS PHOTO' },
  { value: 'CV', label: 'CV' },
  { value: 'JFT', label: 'JFT (Sertifikat Bahasa Jepang)' },
  { value: 'SSW', label: 'SSW (Sertifikat SSW)' },
  { value: 'KTP', label: 'KTP' },
  { value: 'KK', label: 'KK (Kartu Keluarga)' },
  { value: 'AKTE', label: 'AKTE KELAHIRAN' },
  { value: 'IJAZAH SD', label: 'IJAZAH SD' },
  { value: 'IJAZAH SMP', label: 'IJAZAH SMP' },
  { value: 'IJAZAH SMA', label: 'IJAZAH SMA' },
  { value: 'UNIVERSITAS', label: 'IJAZAH UNIVERSITAS' },
  { value: 'SIM', label: 'SIM (Surat Izin Mengemudi)' },
  { value: 'PASPORT', label: 'PASPORT' },
  { value: 'MCU', label: 'MCU (Medical Check Up)' },
  { value: 'EKTLN', label: 'EKTLN (Kartu Tenaga Kerja)' },
  { value: 'KONTRAK KERJA', label: 'KONTRAK KERJA' },
  { value: 'SERTIFIKAT JAPAN', label: 'SERTIFIKAT JAPAN' },
  { value: 'SURAT IJIN ORTU', label: 'SURAT IJIN ORTU' },
  { value: 'PERNYATAAN CPMI', label: 'PERNYATAAN CPMI' },
  { value: 'STATUS PERKAWINAN', label: 'STATUS PERKAWINAN' },
  { value: 'SURAT SEHAT', label: 'SURAT SEHAT PUSKESMAS' },
  { value: 'BPJS', label: 'BPJS KETENAGAKERJAAN' },
  { value: 'PSIKOTES', label: 'HASIL PSIKOTES' },
  { value: 'LAINNYA', label: 'LAINNYA' },
];

export default function InputManualModal() {
  const open = useStore(inputModalOpen);
  const onClose = closeInputModal;
  const [nama, setNama] = useState('');
  const [wa, setWa] = useState('');
  const [loker, setLoker] = useState('');
  const [gender, setGender] = useState('');
  const [usia, setUsia] = useState('');
  const [tinggi, setTinggi] = useState('');
  const [berat, setBerat] = useState('');
  const [pendidikan, setPendidikan] = useState('');
  const [saving, setSaving] = useState(false);

  // File states
  const [photo, setPhoto] = useState<File | null>(null);
  const [cv, setCv] = useState<File | null>(null);
  const [jft, setJft] = useState<File | null>(null);
  const [ssw, setSsw] = useState<File | null>(null);
  const [extraDocs, setExtraDocs] = useState<{ type: string; file: File | null }[]>([
    { type: 'PAS PHOTO', file: null }
  ]);

  function addExtraDoc() {
    setExtraDocs([...extraDocs, { type: 'PAS PHOTO', file: null }]);
  }

  function removeExtraDoc(i: number) {
    if (extraDocs.length <= 1) return; // keep at least 1 row
    setExtraDocs(extraDocs.filter((_, idx) => idx !== i));
  }

  function updateExtraDocType(i: number, type: string) {
    const updated = [...extraDocs];
    updated[i] = { ...updated[i], type };
    setExtraDocs(updated);
  }

  function updateExtraDocFile(i: number, file: File | null) {
    const updated = [...extraDocs];
    updated[i] = { ...updated[i], file };
    setExtraDocs(updated);
  }

  // Parity legacy prosesUploadKandidat (js/api/candidates.ts): file utama
  // diupload ke Cloudinary → payload JSON action simpanKandidatDanUpload
  // (dulu raw FormData tanpa `action` → dispatcher menolak & jadi no-op
  // "pong" HTTP 200 — false success), lalu dokumen lain via
  // simpanBerkasTahapan.
  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!nama.trim() || !wa.trim()) return;
    setSaving(true);
    try {
      const files: { label: string; name: string; url: string }[] = [];
      const mainDocs: { label: string; file: File | null }[] = [
        { label: 'PAS_PHOTO', file: photo },
        { label: 'CV', file: cv },
        { label: 'JFT', file: jft },
        { label: 'SSW', file: ssw },
      ];
      for (const d of mainDocs) {
        if (d.file) {
          const url = await uploadToCloudinary(d.file);
          if (!url) throw new Error('Cloudinary tidak mengembalikan URL.');
          files.push({ label: d.label, name: d.file.name, url });
        }
      }
      const payload = {
        nama: nama.trim(),
        wa: wa.trim(),
        loker: loker.trim() || 'UMUM',
        gender,
        usia,
        tb: tinggi,
        bb: berat,
        pendidikan,
        files,
      };
      // `silent: true` — catch TERLUAR fungsi ini sudah menampilkan toast, dan
      // ia juga menangani kegagalan Cloudinary. Tanpa silent, satu kegagalan
      // akan dilaporkan dua kali. Pesan server tidak hilang: klien melemparnya
      // dan catch terluar mencetak `err.message`.
      const data = (await api.secure('simpanKandidatDanUpload', [payload], {
        onSessionInvalid: 'throw',
        silent: true,
      })) as { success?: boolean; error?: string };
      if (!data || !data.success) {
        showToast((data && data.error) || 'Gagal menyimpan kandidat.', 'error');
        return;
      }
      const namaUpper = String(nama.trim()).toUpperCase();
      for (const d of extraDocs) {
        if (!d.file) continue;
        try {
          const url = await uploadToCloudinary(d.file);
          if (!url) continue;
          // `silent: true` — catch di bawah menyebut JENIS dokumen yang gagal
          // ("Gagal upload <jenis>."), konteks yang tidak mungkin diketahui
          // klien. Satu toast yang menyebut dokumen mana lebih berguna daripada
          // dua, yang salah satunya generik.
          const lj = (await api.secure(
            'simpanBerkasTahapan',
            [{ wa: wa.trim(), nama: namaUpper, jenisBerkas: d.type, fileUrl: url }],
            { onSessionInvalid: 'throw', silent: true },
          )) as { success?: boolean; error?: string };
          if (!(lj && lj.success)) {
            showToast('Gagal simpan ' + d.type + ': ' + ((lj && lj.error) || 'respon tak dikenal'), 'error');
          }
        } catch (err) {
          showToast('Gagal upload ' + d.type + '.', 'error');
        }
      }
      showToast('Kandidat berhasil disimpan!', 'success');
      window.dispatchEvent(new CustomEvent('candidates-changed', { detail: { wa: wa.trim() } }));
      setNama(''); setWa(''); setLoker(''); setGender(''); setUsia('');
      setTinggi(''); setBerat(''); setPendidikan('');
      setPhoto(null); setCv(null); setJft(null); setSsw(null);
      setExtraDocs([{ type: 'PAS PHOTO', file: null }]);
      onClose();
    } catch (err) {
      showToast('Network error: ' + (err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  const { containerRef, onBackdropClick } = useOverlay({ open, onClose });

  /* THE RENDER GUARD MUST SIT AFTER THE HOOK, NOT BEFORE IT.
     It used to be `if (!open) return null;` above the `useOverlay` call, so the
     hook was SKIPPED entirely while the modal was closed — and this component is
     mounted unconditionally (`TabPelamar.tsx:255` renders `<InputManualModal />`
     with no props), so that happened on every visit to the Pelamar tab. The
     result was a hooks-order violation: the dialog semantics were correct on the
     FIRST open and LOST on every open after it (measured in a real browser:
     open #2 had role=null, aria-modal=null and focus NOT moved inside). Passing
     the REAL `open` state (instead of the old hardcoded `true`) plus moving the
     guard below the hook makes every hook run unconditionally and re-run its
     effects on each open/close. The rendered markup and classes are unchanged. */
  if (!open) return null;

  return (
    <div class="fixed inset-0 u-modal-shell bg-black/80 z-[9999] flex items-center justify-center p-4" ref={containerRef} onClick={onBackdropClick}>
      <div class="bg-slate-900 border border-sky-900/50 rounded-2xl w-full max-w-lg max-h-[90vh] u-scroll-area shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div class="p-6">
          <div class="flex justify-between items-center mb-4 border-b border-sky-900/50 pb-3">
            <h3 class="text-xl font-bold text-sky-400"><Icon name="user-plus" class="mr-2" /> {t("admin.input_manual_title")}</h3>
            <button onClick={onClose} class="text-slate-400 hover:text-white transition"><Icon name="times" class="text-2xl" /></button>
          </div>
          <form onSubmit={handleSubmit} class="space-y-4">
            {/* Search existing candidate */}
            <div class="bg-sky-900/20 p-3 rounded-xl border border-sky-500/30">
              <label class="block text-xs font-bold text-sky-400 mb-1" for="im-cari">{t("admin.manual_cari_title")}</label>
              <input type="text" id="im-cari" placeholder={t("input.placeholder_auto")}
                class="w-full p-2.5 rounded-lg bg-black/60 border border-slate-700 text-white text-sm outline-none focus:border-sky-500 transition" />
              <p class="text-[9px] text-slate-400 mt-1">{t("admin.keep_existing_docs")}</p>
            </div>

            {/* Basic info */}
            <div><label class="block text-xs font-bold text-slate-400 mb-1" for="im-nama">{t("admin.manual_nama")}</label>
              <input type="text" id="im-nama" value={nama} onInput={(e) => setNama((e.target as HTMLInputElement).value)}
                required class="w-full p-2.5 rounded-lg bg-black/60 border border-slate-700 text-white text-sm outline-none focus:border-sky-500 transition" /></div>
            <div><label class="block text-xs font-bold text-slate-400 mb-1" for="im-wa">{t("admin.manual_wa")}</label>
              <input type="tel" id="im-wa" value={wa} onInput={(e) => setWa((e.target as HTMLInputElement).value)}
                required placeholder="08..." class="w-full p-2.5 rounded-lg bg-black/60 border border-slate-700 text-white text-sm outline-none focus:border-sky-500 transition" /></div>
            <div><label class="block text-xs font-bold text-slate-400 mb-1" for="im-job">{t("admin.manual_job")}</label>
              <input type="text" id="im-job" value={loker} onInput={(e) => setLoker((e.target as HTMLInputElement).value)}
                placeholder={t("admin.ph_umum_kode")} class="w-full p-2.5 rounded-lg bg-black/60 border border-slate-700 text-white text-sm outline-none focus:border-sky-500 transition" /></div>

            {/* Physical data */}
            <div class="grid grid-cols-2 gap-3">
              <div><label class="block text-xs font-bold text-slate-400 mb-1" for="im-gender">{t("admin.edit_gender")}</label>
                <select id="im-gender" value={gender} onChange={(e) => setGender((e.target as HTMLSelectElement).value)}
                  class="w-full p-2.5 rounded-lg bg-black/60 border border-slate-700 text-white text-sm outline-none focus:border-sky-500 transition">
                  <option value="">-</option><option value="LAKI-LAKI">{t("option.LAKI-LAKI")}</option><option value="PEREMPUAN">{t("admin.manual_perempuan")}</option>
                </select></div>
              <div><label class="block text-xs font-bold text-slate-400 mb-1" for="im-usia">{t("ui.cv_usia")}</label>
                <input type="number" id="im-usia" value={usia} onInput={(e) => setUsia((e.target as HTMLInputElement).value)}
                  min="15" max="60" class="w-full p-2.5 rounded-lg bg-black/60 border border-slate-700 text-white text-sm outline-none focus:border-sky-500 transition" /></div>
              <div><label class="block text-xs font-bold text-slate-400 mb-1" for="im-tinggi">{t("admin.manual_tinggi")}</label>
                <input type="number" id="im-tinggi" value={tinggi} onInput={(e) => setTinggi((e.target as HTMLInputElement).value)}
                  min="100" max="250" class="w-full p-2.5 rounded-lg bg-black/60 border border-slate-700 text-white text-sm outline-none focus:border-sky-500 transition" /></div>
              <div><label class="block text-xs font-bold text-slate-400 mb-1" for="im-berat">{t("admin.manual_berat")}</label>
                <input type="number" id="im-berat" value={berat} onInput={(e) => setBerat((e.target as HTMLInputElement).value)}
                  min="30" max="200" class="w-full p-2.5 rounded-lg bg-black/60 border border-slate-700 text-white text-sm outline-none focus:border-sky-500 transition" /></div>
              <div class="col-span-2"><label class="block text-xs font-bold text-slate-400 mb-1" for="im-pendidikan">{t("admin.manual_pendidikan")}</label>
                {/* C09: jenjang disamakan dengan MasterFullForm (SD…S2) supaya
                    admin yang membuat entri manual tidak menghasilkan nilai
                    yang tidak bisa dipilih kandidat di form utamanya. */}
                <select id="im-pendidikan" value={pendidikan} onChange={(e) => setPendidikan((e.target as HTMLSelectElement).value)}
                  class="w-full p-2.5 rounded-lg bg-black/60 border border-slate-700 text-white text-sm outline-none focus:border-sky-500 transition">
                  <option value="">-</option><option value="SD">SD</option><option value="SMP">SMP</option><option value="SMA">SMA</option><option value="SMK">SMK</option><option value="MA">MA</option><option value="D3">D3</option><option value="S1">S1</option><option value="S2">S2</option>
                </select></div>
            </div>

            {/* File uploads */}
            <div class="p-4 bg-sky-900/20 border border-sky-500/30 rounded-xl space-y-3">
              <div><label class="block text-xs font-bold text-sky-400 mb-1" for="im-pas">{t("admin.manual_pas")}</label>
                <input type="file" id="im-pas" accept="image/*" onChange={(e) => setPhoto((e.target as HTMLInputElement).files?.[0] || null)}
                  class="w-full text-sm text-slate-400 file:mr-2 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-bold file:bg-slate-700 file:text-white" />
                {photo && <span class="block mt-1 text-xs font-bold text-emerald-400">{photo.name}</span>}</div>
              <div><label class="block text-xs font-bold text-sky-400 mb-1" for="im-cv">{t("admin.manual_cv")}</label>
                <input type="file" id="im-cv" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.png" onChange={(e) => setCv((e.target as HTMLInputElement).files?.[0] || null)}
                  class="w-full text-sm text-slate-400 file:mr-2 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-bold file:bg-slate-700 file:text-white" />
                {cv && <span class="block mt-1 text-xs font-bold text-emerald-400">{cv.name}</span>}</div>
              <div><label class="block text-xs font-bold text-sky-400 mb-1" for="im-jft">{t("admin.manual_jft_pdf")}</label>
                <input type="file" id="im-jft" accept=".pdf" onChange={(e) => setJft((e.target as HTMLInputElement).files?.[0] || null)}
                  class="w-full text-sm text-slate-400 file:mr-2 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-bold file:bg-slate-700 file:text-white" />
                {jft && <span class="block mt-1 text-xs font-bold text-emerald-400">{jft.name}</span>}</div>
              <div><label class="block text-xs font-bold text-sky-400 mb-1" for="im-ssw">{t("admin.manual_ssw_pdf")}</label>
                <input type="file" id="im-ssw" accept=".pdf" onChange={(e) => setSsw((e.target as HTMLInputElement).files?.[0] || null)}
                  class="w-full text-sm text-slate-400 file:mr-2 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-bold file:bg-slate-700 file:text-white" />
                {ssw && <span class="block mt-1 text-xs font-bold text-emerald-400">{ssw.name}</span>}</div>
            </div>

            {/* Extra docs — legacy layout with column headers + +/- buttons */}
            <fieldset class="p-4 bg-emerald-900/20 border border-emerald-500/30 rounded-xl space-y-2">
              <legend class="block text-xs font-bold text-emerald-400 mb-2 p-0"><Icon name="folder-plus" class="mr-1" /> {t("ui.form_other_docs")}</legend>
              <div class="flex gap-2 items-center text-[10px] font-bold text-slate-400 px-1">
                <span class="w-40">{t("admin.manual_jenis_doc")}</span>
                <span class="flex-1">{t("admin.manual_file")}</span>
                <span class="w-8 text-center"></span>
              </div>
              {extraDocs.map((d, i) => (
                <div key={i} class="flex gap-2 items-center">
                  <select aria-label={`${t("admin.manual_jenis_doc")} ${i + 1}`} value={d.type} onChange={(e) => updateExtraDocType(i, (e.target as HTMLSelectElement).value)}
                    class="w-40 p-2 rounded-lg bg-black/60 border border-slate-700 text-white text-xs outline-none focus:border-sky-500 transition">
                    {EXTRA_DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <div class="flex-1 flex items-center gap-2">
                    <label class="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold rounded cursor-pointer transition">
                      <Icon name="upload" class="text-[10px]" /> Choose File
                      <input type="file" accept=".pdf,.jpg,.jpeg,.png" class="hidden"
                        onChange={(e) => updateExtraDocFile(i, (e.target as HTMLInputElement).files?.[0] || null)} />
                    </label>
                    <span class="text-[10px] text-slate-400 truncate">{d.file ? d.file.name : 'No file chosen'}</span>
                  </div>
                  <button type="button" onClick={() => removeExtraDoc(i)}
                    class="w-8 h-8 flex items-center justify-center bg-red-600 hover:bg-red-500 text-white rounded text-xs transition">
                    <Icon name="minus" />
                  </button>
                </div>
              ))}
              <div class="flex items-center gap-2 pt-1">
                <button type="button" onClick={addExtraDoc}
                  class="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition">
                  <Icon name="plus" class="mr-1" /> {t("button.add")}
                </button>
                <button type="button" onClick={() => removeExtraDoc(extraDocs.length - 1)}
                  class="px-4 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold transition">
                  <Icon name="minus" class="mr-1" /> {t("button.delete")}
                </button>
              </div>
            </fieldset>

            <button type="submit" disabled={saving}
              class="w-full py-4 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-bold shadow-lg transition mt-2 disabled:opacity-50">
              {saving ? <><Icon spin name="spinner" class="mr-1" /> {t("admin.saving")}</> : <><Icon name="save" class="mr-1" /> {t("admin.save_upload")}</>}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
