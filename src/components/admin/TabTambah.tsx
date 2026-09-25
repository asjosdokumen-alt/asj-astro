/**
 * TabTambah.tsx - Form Input Loker Baru
 * Legacy: admin.html #admin-tambah #form-tambah-job → js/api/jobs.ts
 * submitFormAdmin() → callAPI('simpanJobBaru', [data]).
 *
 * A12 parity fixes (2026-09-05):
 *   - "Buka Editor Rincian" was a DEAD button (no onClick) and rincian_biaya
 *     was never sent — the whole rincian biaya builder is missing. Now opens
 *     RincianBiayaModal and sends totalBiaya + rincianBiaya.
 *   - Submit used a raw multipart FormData POST with action 'submitFormAdmin'
 *     — no Astro backend handler exists for that action name (the jobs
 *     surface maps simpanJobBaru). Replaced with api.secure('simpanJobBaru')
 *     and the exact legacy payload shape (status ✅ OPEN, jmlKandidat 0,
 *     tahapanDB, lokasi/syarat join(', '), templateCv/pamflet URLs from
 *     Cloudinary, dokumenShare).
 */
import { useState, useEffect } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import { showToast } from '../Toast';
import { t, langStore } from '../../store/i18n';
import { uploadToCloudinary } from '../../lib/cloudinary';
import { api } from '../../lib/apiClient';
import { authStore } from '../../store/authReactive';
import Icon from '../ui/Icon';
import RincianBiayaModal, { parseRincianState, rincianSerialize, rincianSummary } from './RincianBiayaModal';

interface DD {
  tsk: string[];
  tahapan: string[];
  kategori: string[];
  gender: string[];
  lokasi: string[];
  syarat: string[];
}
const RF: string[] = ['CV', 'JFT', 'SSW', 'SIM A', 'KTP', 'KK', 'AKTE', 'IJAZAH', 'IJAZAH SD', 'IJAZAH SMP', 'IJAZAH SMA', 'UNIVERSITAS', 'ALL'];

export default function TabTambah() {
  const _lang = useStore(langStore);
  const user = useStore(authStore);
  const [dd, setDd] = useState<DD>({ tsk: [], tahapan: [], kategori: [], gender: [], lokasi: [], syarat: [] });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [tsk, setTsk] = useState('');
  const [tahapan, setTahapan] = useState('');
  const [kuota, setKuota] = useState('');
  const [kategori, setKategori] = useState('');
  const [pekerjaan, setPekerjaan] = useState('');
  const [gender, setGender] = useState('');
  const [lokasi, setLokasi] = useState<string[]>([]);
  const [customLokasi, setCustomLokasi] = useState('');
  const [syarat, setSyarat] = useState<string[]>([]);
  const [customSyarat, setCustomSyarat] = useState('');
  const [reqFiles, setReqFiles] = useState<string[]>(RF);
  const [customReqFile, setCustomReqFile] = useState('');
  const [keterangan, setKeterangan] = useState('');
  const [totalBiaya, setTotalBiaya] = useState('');
  const [rincianBiaya, setRincianBiaya] = useState('');
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [pamfletFile, setPamfletFile] = useState<File | null>(null);
  const [rbOpen, setRbOpen] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const d = await api.get('getAppData', ['admin']);
        if (d && (d as Record<string, any>).success && (d as Record<string, any>).dropdowns) {
          setDd((d as Record<string, any>).dropdowns);
        }
      } catch (e) { console.error(e); } finally { setLoading(false); }
    }
    load();
  }, []);

  function tog(a: string[], s: (v: string[]) => void, v: string) {
    s(a.includes(v) ? a.filter((x) => x !== v) : [...a, v]);
  }

  const onRincianApply = (total: string, rincian: string) => {
    setTotalBiaya(total);
    setRincianBiaya(rincian);
  };

  async function handleSubmit(e: Event) {
    e.preventDefault();
    setSubmitting(true);
    try {
      let templateCv = '-';
      let pamflet = '-';
      if (templateFile) {
        const url = await uploadToCloudinary(templateFile);
        if (url) templateCv = url;
      }
      if (pamfletFile) {
        const url = await uploadToCloudinary(pamfletFile);
        if (url) pamflet = url;
      }
      const arrLok = lokasi.slice();
      if (customLokasi.trim()) arrLok.push(customLokasi.trim());
      const arrSyr = syarat.slice();
      if (customSyarat.trim()) arrSyr.push(customSyarat.trim());
      const arrReq = reqFiles.slice();
      if (customReqFile.trim()) {
        customReqFile.split(',').forEach((val) => {
          if (val.trim() && !arrReq.includes(val.trim())) arrReq.push(val.trim());
        });
      }
      const payload = {
        admin: user.name || 'Admin',
        tsk: tsk || '-',
        kategori,
        pekerjaan,
        lokasi: arrLok.length ? arrLok.join(', ') : '-',
        gender,
        templateCv,
        status: '✅ OPEN',
        kuota: kuota || '-',
        jmlKandidat: '0',
        syarat: arrSyr.length ? arrSyr.join(', ') : '-',
        keterangan: keterangan || '-',
        pamflet,
        tahapanDB: tahapan || '-',
        totalBiaya,
        rincianBiaya,
        dokumenShare: arrReq.join(','),
      };
      const res = await api.secure('simpanJobBaru', [payload]);
      if (res && res.success) {
        showToast(t('ui.toast_job_created'), 'success');
        setTsk(''); setTahapan(''); setKuota(''); setKategori(''); setPekerjaan('');
        setGender(''); setLokasi([]); setCustomLokasi(''); setSyarat([]); setCustomSyarat('');
        setReqFiles(RF); setCustomReqFile(''); setKeterangan(''); setTotalBiaya('');
        setRincianBiaya(''); setTemplateFile(null); setPamfletFile(null);
      } else {
        showToast((res && (res as Record<string, any>).error) || 'Gagal simpan loker.', 'error');
      }
    } catch (err) {
      showToast('Network error: ' + ((err as Error).message || String(err)), 'error');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div class="text-center py-8">
        <Icon spin name="spinner" class="text-2xl text-red-400" />
        <p class="text-slate-500 mt-2 text-sm">{t('ui.loading')}</p>
      </div>
    );
  }

  const ic = 'w-full p-3 rounded-lg bg-black/40 border border-slate-700 text-sm text-white outline-none focus:border-red-500 transition';
  const lc = 'block text-sm font-bold text-slate-300 mb-1.5';
  const rl = 'block text-sm text-red-400 mb-1.5 font-bold';

  const rbSt = parseRincianState(rincianBiaya);
  if (totalBiaya.trim() && !rbSt.total.trim()) rbSt.total = totalBiaya.trim();
  const rbSummary = rincianBiaya || totalBiaya ? rincianSummary(rbSt) : t('ui.summary_empty');

  return (
    <div>
      <h2 class="text-red-400 font-bold mb-6 border-b border-red-900/50 pb-3 text-lg">
        <Icon name="plus-circle" class="mr-2" /> {t('admin.title_input_loker')}
      </h2>
      {/* EXPLICIT grid, not `.u-grid-auto` — see AdminJobEditModal.tsx for the
          full measurement. Two direct children below carry `md:col-span-2`
          (the total/rincian block and the submit row); on `.u-grid-auto` those
          force an IMPLICIT 0px track whenever auto-fit yields one track. An
          explicit grid has a fixed count and cannot. `lg:` because
          `--u-grid-min` (24rem) keeps the single-track regime past `md`. */}
      <form onSubmit={handleSubmit} class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="space-y-5">
          <div class="p-4 bg-red-900/10 border border-red-900/30 rounded-xl grid grid-cols-2 gap-4">
            <div class="col-span-2">
              <div class="block text-xs font-bold text-red-400 mb-1 uppercase tracking-widest">
                <Icon name="lock" class="mr-1" /> {t('admin.internal_db_info')}
              </div>
            </div>
            <div>
              <label for="tt-tsk" class={rl}>{t('admin.tsk_pengurus')}</label>
              <select id="tt-tsk" value={tsk} onInput={(e) => setTsk((e.target as HTMLSelectElement).value)} required class={ic}>
                <option value="">-</option>
                {dd.tsk.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </div>
            <div>
              <label for="tt-tahapan" class={rl}>{t('admin.tahapan_internal')}</label>
              <select id="tt-tahapan" value={tahapan} onInput={(e) => setTahapan((e.target as HTMLSelectElement).value)} required class={ic}>
                <option value="">-</option>
                {dd.tahapan.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </div>
            <div class="col-span-2">
              <label for="tt-kuota" class={rl}>{t('admin.kuota_dibutuhkan')}</label>
              <input id="tt-kuota" type="text" value={kuota} onInput={(e) => setKuota((e.target as HTMLInputElement).value)} required class="w-full p-3 rounded-lg bg-black border border-slate-700 text-sm text-white outline-none focus:border-red-500 transition" />
            </div>
          </div>
          <div>
            <label for="tt-kategori" class={lc}>{t('admin.kategori_bidang')}</label>
            <select id="tt-kategori" value={kategori} onInput={(e) => setKategori((e.target as HTMLSelectElement).value)} required class={ic}>
              <option value="">-</option>
              {dd.kategori.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>
          <div>
            <label for="tt-pekerjaan" class={lc}>{t('admin.nama_pekerjaan')}</label>
            <input id="tt-pekerjaan" type="text" value={pekerjaan} onInput={(e) => setPekerjaan((e.target as HTMLInputElement).value)} required class={ic} />
          </div>
          <div>
            <label for="tt-gender" class={lc}>{t('admin.gender_label')}</label>
            <select id="tt-gender" value={gender} onInput={(e) => setGender((e.target as HTMLSelectElement).value)} required class={ic}>
              <option value="">-</option>
              {dd.gender.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>
          <div>
            <label for="tt-template-file" class="block text-xs font-bold text-sky-400 mb-1.5 uppercase">
              <Icon name="file-excel" class="mr-1" /> {t('admin.upload_format_cv')}
            </label>
            <input id="tt-template-file" type="file" accept=".pdf,.xls,.xlsx,.doc,.docx" onChange={(e) => setTemplateFile((e.target as HTMLInputElement).files?.[0] || null)} class="w-full text-sm text-slate-400 file:mr-2 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-bold file:bg-sky-900/50 file:text-sky-400 hover:file:bg-sky-900/80 cursor-pointer" />
          </div>
          <div>
            <label for="tt-pamflet-file" class="block text-xs font-bold text-pink-400 mb-1.5 uppercase">
              <Icon name="image" class="mr-1" /> {t('admin.upload_pamflet')}
            </label>
            <input id="tt-pamflet-file" type="file" accept="image/*" onChange={(e) => setPamfletFile((e.target as HTMLInputElement).files?.[0] || null)} class="w-full text-sm text-slate-400 file:mr-2 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-bold file:bg-pink-900/50 file:text-pink-400 hover:file:bg-pink-900/80 cursor-pointer" />
          </div>
        </div>
        <div class="space-y-5">
          <fieldset class="border-0 p-0 m-0 min-w-0">
            <legend class={`${lc} p-0`}>{t('admin.penempatan_lokasi')}</legend>
            <div class="grid grid-cols-2 gap-2 h-28 u-scroll-area p-3 bg-black/40 border border-slate-700 rounded-lg text-sm text-slate-300 mb-2">
              {dd.lokasi.map((l) => (
                <label key={l} class="flex items-center gap-2 cursor-pointer hover:text-white transition">
                  <input type="checkbox" checked={lokasi.includes(l)} onChange={() => tog(lokasi, setLokasi, l)} class="accent-red-500 w-5 h-5" /> {l}
                </label>
              ))}
            </div>
            <input type="text" value={customLokasi} onInput={(e) => setCustomLokasi((e.target as HTMLInputElement).value)} placeholder={t('admin.custom_lokasi')} class={ic} />
          </fieldset>
          <fieldset class="border-0 p-0 m-0 min-w-0">
            <legend class={`${lc} p-0`}>{t('admin.syarat_kandidat')}</legend>
            <div class="grid grid-cols-2 gap-2 h-24 u-scroll-area p-3 bg-black/40 border border-slate-700 rounded-lg text-sm text-slate-300 mb-2">
              {dd.syarat.map((s) => (
                <label key={s} class="flex items-center gap-2 cursor-pointer hover:text-white transition">
                  <input type="checkbox" checked={syarat.includes(s)} onChange={() => tog(syarat, setSyarat, s)} class="accent-red-500 w-5 h-5" /> {s}
                </label>
              ))}
            </div>
            <input type="text" value={customSyarat} onInput={(e) => setCustomSyarat((e.target as HTMLInputElement).value)} placeholder={t('admin.custom_syarat')} class={ic} />
          </fieldset>
          <fieldset class="border-0 p-0 m-0 min-w-0">
            <legend class={`${lc} p-0`}><Icon name="file-upload" class="mr-1" /> {t('admin.syarat_dokumen')}</legend>
            <div class="grid grid-cols-2 gap-2 h-24 u-scroll-area p-3 bg-black/40 border border-slate-700 rounded-lg text-sm text-slate-300 mb-2">
              {RF.map((f) => (
                <label key={f} class="flex items-center gap-2 cursor-pointer hover:text-white transition">
                  <input type="checkbox" checked={reqFiles.includes(f)} onChange={() => tog(reqFiles, setReqFiles, f)} class={'accent-' + (f === 'ALL' ? 'pink' : 'red') + '-500 w-5 h-5'} /> {f}
                </label>
              ))}
            </div>
            <input type="text" value={customReqFile} onInput={(e) => setCustomReqFile((e.target as HTMLInputElement).value)} placeholder={t('admin.custom_dokumen')} class={ic} />
          </fieldset>
          <div>
            <label for="tt-keterangan" class={lc}>{t('admin.keterangan_publik')}</label>
            <textarea id="tt-keterangan" value={keterangan} onInput={(e) => setKeterangan((e.target as HTMLTextAreaElement).value)} rows={2} class={ic} />
          </div>
        </div>
        <div class="lg:col-span-2 u-grid-auto u-grid-auto--form gap-6">
          <div>
            <label for="tt-total-biaya" class="block text-sm font-bold text-emerald-400 mb-1.5 uppercase">
              <Icon name="wallet" class="mr-1" /> {t('ui.total_cost')} {t('admin.cth_25_jt')}
            </label>
            <input id="tt-total-biaya" type="text" value={totalBiaya} onInput={(e) => setTotalBiaya((e.target as HTMLInputElement).value)} placeholder={t('ui.total_cost_ph')} class={ic} />
          </div>
          <div>
            <div class="block text-sm font-bold text-emerald-400 mb-1.5 uppercase">
              <Icon name="list-check" class="mr-1" /> {t('ui.rincian_biaya')}
            </div>
            <button type="button" onClick={() => setRbOpen(true)} class="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-black uppercase shadow-lg transition">
              <Icon name="edit" class="mr-1" /> {t('ui.open_rincian_editor')}
            </button>
            <div class="text-xs font-bold text-emerald-300 mt-1.5 min-h-[16px]">{rbSummary}</div>
          </div>
        </div>
        <div class="lg:col-span-2 mt-4">
          <button type="submit" disabled={submitting} class="w-full py-4 rounded-xl bg-red-600 hover:bg-red-500 font-black tracking-widest text-white shadow-[0_0_15px_rgba(220,38,38,0.5)] transition text-base disabled:opacity-50">
            <Icon name="cloud-upload-alt" spin={submitting} class="mr-2" /> {submitting ? t('ui.uploading_job') : t('ui.upload_job')}
          </button>
        </div>
      </form>

      <RincianBiayaModal
        open={rbOpen}
        initialTotal={totalBiaya}
        initialRincian={rincianBiaya}
        onApply={onRincianApply}
        onClose={() => setRbOpen(false)}
      />
    </div>
  );
}
