/**
 * MasterFullForm.tsx — Master Database 5-Step Form (master-full.html)
 * Source: legacy/master-full.html (1:1 match)
 * Steps: Identitas → Medis & Wawancara → Riwayat → Keluarga → Dokumen
 */
import { useState, useEffect } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import { showToast } from '../Toast';
import { authStore } from '../../store/authReactive';
import { validate, kandidatLoginSchema, waSchema, emailSchema } from '../../lib/schemas';
import { t, langStore, toggleLang } from '../../store/i18n';
import { getEndpoint } from "../../lib/apiEndpoint";
import Icon from '../ui/Icon';
import { uploadMany, UploadCollectionError } from '../../lib/cloudinary';
import { MASTER_FILE_COLUMNS } from '../../lib/documentColumns';
import { mapMasterNestedToForm } from '../../lib/masterPrefill';

/* ── Types ── */
interface EduRecord { jenjang: string; nama: string; thnAwal: string; thnAkhir: string; jurusan: string; alamat: string; }
interface JobRecord { perusahaan: string; jabatan: string; thnAwal: string; thnAkhir: string; gaji: string; alasan: string; }
interface FamRecord { nama: string; hubungan: string; usia: string; pekerjaan: string; }

interface MasterData {
  nama: string; furigana: string; panggilan: string; panggilanKatakana: string;
  tempatLahir: string; tglLahir: string; gender: string; usia: string;
  agama: string; statusNikah: string; anak: string; ktp: string; sim: string;
  alamat: string; email: string; tb: string; bb: string; goldar: string; tangan: string;
  baju: string; sepatu: string; topi: string; tahanAc: string;
  /* Medis */
  mataKiri: string; mataKanan: string; kacamata: string; butaWarna: string;
  tato: string; tindik: string; merokok: string; alkohol: string;
  penyakit: string; alergi: string; laka: string;
  /* Wawancara */
  promosi: string; kelebihan: string; kekurangan: string; keahlianKhusus: string;
  hobi: string; alasanBidang: string; motivasiJepang: string; keinginan: string;
  rencanaPulang: string; tujuanJepang: string; lamaJepang: string; gajiYen: string; tabungan: string;
  /* Sertifikasi */
  eksJepang: string; noCoe: string; noPaspor: string; tglTerbitPaspor: string;
  expPaspor: string; kotaPaspor: string; bhsJepang: string; nilai: string;
  lisensi: string; lisensiManual: string; lisensi2: string; lisensi2Manual: string;
  [key: string]: string;
}

const EMPTY: MasterData = {
  nama:'', furigana:'', panggilan:'', panggilanKatakana:'', tempatLahir:'', tglLahir:'',
  gender:'LAKI-LAKI', usia:'', agama:'ISLAM', statusNikah:'BELUM MENIKAH', anak:'0', ktp:'', sim:'',
  alamat:'', email:'', tb:'', bb:'', goldar:'-', tangan:'KANAN', baju:'', sepatu:'', topi:'', tahanAc:'YA',
  mataKiri:'', mataKanan:'', kacamata:'TIDAK', butaWarna:'TIDAK', tato:'TIDAK', tindik:'TIDAK',
  merokok:'TIDAK', alkohol:'TIDAK', penyakit:'', alergi:'', laka:'',
  promosi:'', kelebihan:'', kekurangan:'', keahlianKhusus:'', hobi:'', alasanBidang:'',
  motivasiJepang:'', keinginan:'', rencanaPulang:'', tujuanJepang:'', lamaJepang:'', gajiYen:'', tabungan:'',
  eksJepang:'BELUM PERNAH', noCoe:'', noPaspor:'', tglTerbitPaspor:'', expPaspor:'', kotaPaspor:'',
  bhsJepang:'-', nilai:'', lisensi:'-', lisensiManual:'', lisensi2:'-', lisensi2Manual:'',
};

const STEPS = [
  { icon: 'fa-user', key: 'master.step_personal' },
  { icon: 'fa-heartbeat', key: 'master.step_medical' },
  { icon: 'fa-briefcase', key: 'master.step_history' },
  { icon: 'fa-users', key: 'master.step_family' },
  { icon: 'fa-file-alt', key: 'master.step_documents' },
];

export default function MasterFullForm() {
  const lang = useStore(langStore);
  const [step, setStep] = useState(1);
  const [data, setData] = useState<MasterData>({ ...EMPTY });
  const [eduList, setEduList] = useState<EduRecord[]>([{ jenjang:'', nama:'', thnAwal:'', thnAkhir:'', jurusan:'', alamat:'' }]);
  const [jobList, setJobList] = useState<JobRecord[]>([{ perusahaan:'', jabatan:'', thnAwal:'', thnAkhir:'', gaji:'', alasan:'' }]);
  const [famList, setFamList] = useState<FamRecord[]>([{ nama:'', hubungan:'', usia:'', pekerjaan:'' }]);
  const [daruratNama, setDaruratNama] = useState('');
  const [daruratHubungan, setDaruratHubungan] = useState('');
  const [daruratWa, setDaruratWa] = useState('');
  const [kenalan, setKenalan] = useState({ nama:'', usia:'', hubungan:'', pekerjaan:'', alamat:'' });
  const [files, setFiles] = useState<Record<string, File|null>>({});
  const [fileNames, setFileNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loginGate, setLoginGate] = useState(true);
  const [gatePass, setGatePass] = useState('');
  const [gateMsg, setGateMsg] = useState('');
  const [gateWa, setGateWa] = useState('');

  /** C02 prefill (2026-09-05): muat data master yang sudah ada via getDrafCvMaster
      supaya form tidak mulai kosong. Draft localStorage (asj_master_<wa>) menang
      untuk data; dokumen lama tetap ditampilkan. */
  const applyUploads = (up: any) => {
    setFileNames(f => ({
      ...f,
      photo: up.photo || f.photo, jft: up.jft || f.jft, ssw: up.ssw || f.ssw,
      ijazahSd: up.ijazahSd || f.ijazahSd, ijazahSmp: up.ijazahSmp || f.ijazahSmp,
      ijazahSma: up.ijazahSma || f.ijazahSma, univ: up.univ || f.univ,
      ktpFile: up.ktp || f.ktpFile, kk: up.kk || f.kk,
    }));
  };

  const loadServerDraft = async (wa: string) => {
    const token = authStore.get().sessionToken;
    if (!token || !wa) return;
    try {
      const res = await fetch(getEndpoint('getDrafCvMaster'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ action: 'getDrafCvMaster', payload: [wa], sessionToken: token }),
      });
      const d = await res.json();
      if (!d || !d.identitas) return;
      applyUploads(d.uploads || {});
      if (localStorage.getItem('asj_master_' + wa)) return; // draft lokal menang
      const p = mapMasterNestedToForm(d);
      setData(prev => ({ ...EMPTY, ...p.data, wa: prev.wa || '' }));
      setEduList(p.eduList);
      setJobList(p.jobList);
      setFamList(p.famList);
      setKenalan(p.kenalan);
      setDaruratNama(p.daruratNama);
      setDaruratHubungan(p.daruratHubungan);
      setDaruratWa(p.daruratWa);
    } catch { /* prefill non-fatal */ }
  };

  useEffect(() => {
    const u = new URLSearchParams(window.location.search);
    const wa = u.get('wa') || '';
    setGateWa(wa);
    const saved = localStorage.getItem('asj_master_' + wa);
    if (saved) { try { setData({ ...EMPTY, ...JSON.parse(saved) }); } catch {} }
    // Check auth
    const auth = authStore.get();
    if (auth.sessionToken && auth.wa) {
      setLoginGate(false);
      setData(d => ({ ...d, wa: auth.wa || '' }));
      loadServerDraft(auth.wa);
    }
  }, []);

  const gateLogin = async () => {
    const vg = validate(kandidatLoginSchema, { wa: gateWa, password: gatePass }); if (!vg.success) { setGateMsg(vg.errors[0]); return; }
    try {
      const res = await fetch(getEndpoint('loginKandidat'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'loginKandidat', payload: [{ wa: gateWa, password: gatePass }] }) });
      if (res.ok) {
        const d = await res.json();
        authStore.set({...authStore.get(), sessionToken: d.sessionToken || d.token || '', wa: gateWa, name: d.user || 'kandidat', isLoggedIn: true, role: 'kandidat', lastChecked: Date.now() });
        setData(prev => ({ ...prev, wa: gateWa }));
        setLoginGate(false);
        loadServerDraft(gateWa);
      } else {
        setGateMsg('Password salah atau akun tidak ditemukan.');
      }
    } catch { setGateMsg('Error koneksi.'); }
  };

  /** Update single field in master data */
  const upd = (k: string, v: string) => setData(d => ({ ...d, [k]: v }));

  const changeStep = (dir: number) => {
    const next = step + dir;
    if (next >= 1 && next <= 5) setStep(next);
  };

  const submitMaster = async (isDraft: boolean) => {
    if (!isDraft) {
      if (data.nama) { const vn = validate(waSchema, data.wa || ""); if (!vn.success) { showToast(vn.errors[0], "error"); return; } }
      if (data.email) { const ve = validate(emailSchema, data.email); if (!ve.success) { showToast(ve.errors[0], "error"); return; } }
    }
    setSaving(true);
    if (isDraft) {
      // M4 parity: legacy draft is localStorage-only (asj_master_<wa>),
      // never posted to the server.
      localStorage.setItem('asj_master_' + data.wa, JSON.stringify(data));
      showToast(t('toast.draft_saved'), 'success');
      setSaving(false);
      return;
    }
    try {
      // M1/M2 parity fix (2026-09-04): legacy uploads each file to Cloudinary
      // first, then posts a flat JSON payload via submitMasterForm. The old
      // code sent raw FormData without an action field, so the JSON dispatcher
      // parsed it as action=ping -> no-op pong (false-success toast).
      let fileUrls: Record<string, string>;
      try {
        fileUrls = await uploadMany(files, MASTER_FILE_COLUMNS);
      } catch (ue) {
        const ue2 = ue as UploadCollectionError;
        showToast('Gagal upload ' + (fileNames[ue2.key] || ue2.key) + ': ' + ue2.message, 'error');
        setSaving(false);
        return;
      }
      const payload: Record<string, unknown> = {
        ...data,
        pendidikan: eduList.filter(e => e.jenjang).map(e => ({
          tingkat: e.jenjang, nama_sekolah: e.nama,
          tahun_masuk: e.thnAwal, tahun_lulus: e.thnAkhir, jurusan: e.jurusan,
        })),
        pekerjaan: jobList.filter(j => j.perusahaan).map(j => ({
          nama_perusahaan: j.perusahaan, jabatan: j.jabatan,
          tahun_masuk: j.thnAwal, tahun_keluar: j.thnAkhir, gaji: j.gaji,
        })),
        keluarga: famList.filter(f => f.nama).map(f => ({
          nama: f.nama, hubungan: f.hubungan, usia: f.usia, pekerjaan: f.pekerjaan,
        })),
        daruratNama, daruratHubungan, daruratWa,
        kenalanNama: kenalan.nama, kenalanHubungan: kenalan.hubungan,
        kenalanPekerjaan: kenalan.pekerjaan, kenalanUsia: kenalan.usia, kenalanAlamat: kenalan.alamat,
        ...fileUrls,
      };
      const token = authStore.get().sessionToken;
      const res = await fetch(getEndpoint('submitMasterForm'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ action: 'submitMasterForm', payload: [payload], sessionToken: token })
      });
      const data2 = await res.json();
      if (res.ok && data2.success) {
        localStorage.setItem('asj_master_' + data.wa, JSON.stringify(data));
        showToast(isDraft ? t('toast.draft_saved') : t('toast.saved'), 'success');
      } else {
        showToast((data2.message || data2.error || t('toast.failed')) as string, 'error');
      }
    } catch (e) { showToast('Error: ' + (e as Error).message, 'error'); }
    finally { setSaving(false); }
  };

  const handleFile = (k: string, file: File|null) => {
    if (!file) return;
    setFiles(f => ({ ...f, [k]: file }));
    setFileNames(f => ({ ...f, [k]: file!.name }));
  };

  /* ── Helper: Input field ── */
  const F = (p: { label: string; k: string; type?: string; ph?: string; opts?: string[]; disabled?: boolean; twoCol?: boolean }) => {
    const v = data[p.k] || '';
    if (p.opts) {
      return (
        <div class={p.twoCol ? '' : 'mb-3'}>
          <label class="label">{p.label}</label>
          <select class="input" value={v} onChange={(e) => upd(p.k, (e.target as HTMLSelectElement).value)}>
            {p.opts.map(o => <option value={o}>{o}</option>)}
          </select>
        </div>
      );
    }
    return (
      <div class={p.twoCol ? '' : 'mb-3'}>
        <label class="label">{p.label}</label>
        <input type={p.type || 'text'} class="input" value={v} placeholder={p.ph || ''}
          disabled={p.disabled}
          onInput={(e) => upd(p.k, (e.target as HTMLInputElement).value)} />
      </div>
    );
  };

  /* ── Login Gate ── */
  if (loginGate) {
    return (
      <div class="fixed inset-0 u-modal-shell z-50 bg-black/85 flex items-center justify-center p-4">
        <div class="bg-[#0b1220] border border-sky-500/30 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
          <div class="text-center mb-4">
            <div class="text-2xl mb-1"><Icon name="lock" class="text-sky-400" /></div>
            <div class="font-bold text-white text-sm">{t("ai_cv.verify_account")}</div>
            <div class="text-slate-400 text-xs mt-1">{t("form.connected_wa")} <span class="text-sky-400 font-bold">{gateWa}</span></div>
            <div class="text-slate-500 text-[11px] mt-1">{t("form.enter_password_desc")}</div>
          </div>
          <label class="label">{t("form.mf_password")}</label>
          <input type="password" class="input" value={gatePass} placeholder="••••••••"
            onInput={(e) => setGatePass((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => { if ((e as KeyboardEvent).key === 'Enter') gateLogin(); }} />
          <button onClick={gateLogin} class="w-full mt-3 bg-sky-600 hover:bg-sky-500 text-white rounded-xl py-2.5 text-sm font-bold">{t("login.btn_masuk")}</button>
          {gateMsg && <div class="text-rose-400 text-xs text-center mt-2">{gateMsg}</div>}
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", background: '#020617', color: '#fff', paddingBottom: 90, paddingTop: 42 }}>
      {/* Hero */}
      <div class="relative h-[220px] overflow-hidden">
        <img src="https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=1600&q=80" class="absolute inset-0 w-full h-full object-cover brightness-[.35]" alt="" />
        <div class="absolute inset-0 bg-gradient-to-b from-black/25 to-[#020617]"></div>
        <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center w-full z-10">
          <img src="/assets/logo.png" class="w-20 h-20 rounded-full mx-auto shadow-[0_10px_25px_rgba(0,0,0,.5)]" alt="Logo ASJ" />
          <div class="text-2xl font-black mt-2 uppercase" style={{ color: '#38bdf8' }}>ASJ DOSSIER</div>
          <div class="text-[11px] mt-1" style={{ color: '#cbd5e1', letterSpacing: 2 }}>MASTER DATABASE SYSTEM</div>
        </div>
        <button onClick={() => toggleLang()}
          class="absolute top-3 right-3 z-10 px-3 py-1.5 bg-sky-600/80 hover:bg-sky-500 text-white rounded-full text-[11px] font-bold shadow-lg border border-sky-400/40 transition">
          <Icon name="language" class="mr-1" /><span>{lang === 'id' ? 'ID' : 'JP'}</span>
        </button>
      </div>

      <main class="max-w-[600px] mx-auto px-4 -mt-8 relative z-20">
        <div style={{ background: 'rgba(15,23,42,.95)', border: '1px solid #1e293b', borderRadius: 24, padding: 25, boxShadow: '0 25px 50px rgba(0,0,0,.5)' }}>
          {/* Stepper */}
          <div class="flex justify-between items-center relative mb-8">
            <div class="absolute top-[15px] left-[10%] right-[10%] h-[2px]" style={{ background: '#334155', zIndex: 1 }}></div>
            {STEPS.map((s, i) => {
              const num = i + 1;
              const isActive = step === num;
              const done = step > num;
              return (
                <div class="relative z-[2] flex flex-col items-center gap-1 w-[20%]">
                  <div class={`w-8 h-8 rounded-full flex justify-center items-center text-xs font-extrabold transition ${done ? 'bg-[#0284c7] border-[#0284c7] text-white' : isActive ? 'bg-[#38bdf8] border-[#38bdf8] text-[#020617] shadow-[0_0_15px_rgba(56,189,248,.4)]' : 'bg-[#1e293b] border-2 border-[#334155] text-[#64748b]'}`}
                    style={{ border: done ? '2px solid #0284c7' : isActive ? '2px solid #38bdf8' : '' }}>
                    <Icon name={s.icon} />
                  </div>
                  <div class={`text-[9px] font-extrabold text-center transition ${isActive ? 'text-[#38bdf8]' : done ? 'text-[#0284c7]' : 'text-[#64748b]'}`}>{t(s.key)}</div>
                </div>
              );
            })}
          </div>

          {/* ═══ STEP 1: IDENTITAS ═══ */}
          {step === 1 && (
            <div class="animate-[fadeIn_.4s_ease]">
              <div class="bg-sky-900/20 border border-sky-500/30 p-3 rounded-xl mb-4 text-xs text-sky-400 font-bold">
                <Icon name="info-circle" class="mr-1" /> {t("form.connected_wa")}: <span>{data.wa || gateWa}</span>
              </div>
              <div class="section-title">Identitas Dasar</div>
              <F label={t("form.mf_nama")} k="nama" />
              <div class="grid grid-cols-2 gap-3">
                <F label={t("form.mf_furigana")} k="furigana" ph={t("form.mf_ph_teks_jepang")} twoCol />
                <F label={t("form.mf_panggilan")} k="panggilan" twoCol />
              </div>
              <F label={t("form.mf_panggilan_ktk")} k="panggilanKatakana" ph={t("form.mf_ph_teks_jepang")} />
              <F label={t("form.mf_tempat_lahir")} k="tempatLahir" ph={t("form.mf_ph_auto_jp")} />
              <div class="grid grid-cols-2 gap-3">
                <F label={t("master.tgl_lahir")} k="tglLahir" type="date" twoCol />
                <F label={t("form.mf_gender")} k="gender" opts={['LAKI-LAKI','PEREMPUAN']} twoCol />
              </div>
              <div class="grid grid-cols-2 gap-3">
                <F label={t("form.mf_usia")} k="usia" type="number" twoCol />
                <F label={t("form.mf_agama")} k="agama" opts={['ISLAM','KRISTEN','HINDU','BUDHA','KATHOLIK']} twoCol />
              </div>
              <div class="grid grid-cols-2 gap-3">
                <F label={t("form.mf_status_nikah")} k="statusNikah" opts={['BELUM MENIKAH','MENIKAH','CERAI']} twoCol />
                <F label={t("form.mf_anak")} k="anak" type="number" ph="0 jika tidak ada" twoCol />
              </div>
              <div class="grid grid-cols-2 gap-3">
                <F label={t("form.mf_ktp")} k="ktp" type="number" twoCol />
                <F label={t("form.mf_sim")} k="sim" ph={t("form.mf_ph_sim")} twoCol />
              </div>

              <div class="section-title mt-6">Kontak & Fisik</div>
              <F label={t("form.mf_alamat")} k="alamat" ph={t("form.mf_ph_auto_jp")} />
              <F label={t("form.mf_email")} k="email" type="email" />
              <div class="grid grid-cols-2 gap-3">
                <F label={t("form.mf_tb")} k="tb" type="number" twoCol />
                <F label={t("form.mf_bb")} k="bb" type="number" twoCol />
              </div>
              <div class="grid grid-cols-2 gap-3">
                <F label={t("form.mf_goldar")} k="goldar" opts={['-','A','B','AB','O']} twoCol />
                <F label={t("form.mf_tangan")} k="tangan" opts={['KANAN','KIRI']} twoCol />
              </div>
              <div class="grid grid-cols-2 gap-3">
                <F label={t("form.mf_baju")} k="baju" ph={t("form.mf_ph_baju")} twoCol />
                <F label={t("form.mf_sepatu")} k="sepatu" type="number" twoCol />
              </div>
              <div class="grid grid-cols-2 gap-3">
                <F label={t("form.mf_topi")} k="topi" twoCol />
                <F label={t("form.mf_tahan_ac")} k="tahanAc" opts={['YA','TIDAK']} twoCol />
              </div>
            </div>
          )}

          {/* ═══ STEP 2: MEDIS & WAWANCARA ═══ */}
          {step === 2 && (
            <div class="animate-[fadeIn_.4s_ease]">
              <div class="section-title">Catatan Medis</div>
              <div class="grid grid-cols-2 gap-3">
                <F label={t("form.mf_mata_kiri")} k="mataKiri" ph={t("form.mf_ph_visus")} twoCol />
                <F label={t("form.mf_mata_kanan")} k="mataKanan" ph={t("form.mf_ph_visus")} twoCol />
              </div>
              <div class="grid grid-cols-2 gap-3">
                <F label={t("form.mf_kacamata")} k="kacamata" opts={['TIDAK','YA']} twoCol />
                <F label={t("form.mf_buta_warna")} k="butaWarna" opts={['TIDAK','YA']} twoCol />
              </div>
              <div class="grid grid-cols-2 gap-3">
                <F label={t("form.mf_tato")} k="tato" opts={['TIDAK','YA']} twoCol />
                <F label={t("form.mf_tindik")} k="tindik" opts={['TIDAK','YA']} twoCol />
              </div>
              <div class="grid grid-cols-2 gap-3">
                <F label={t("form.mf_merokok")} k="merokok" opts={['TIDAK','YA']} twoCol />
                <F label={t("form.mf_alkohol")} k="alkohol" opts={['TIDAK','YA']} twoCol />
              </div>
              <F label={t("form.mf_penyakit")} k="penyakit" ph={t("form.mf_ph_deskripsi")} />
              <F label={t("form.mf_alergi")} k="alergi" ph={t("form.mf_ph_alergi")} />
              <F label={t("form.mf_laka")} k="laka" ph={t("form.mf_ph_deskripsi")} />

              <div class="section-title mt-6">Wawancara & Jiko PR (CV)</div>
              <F label={t("form.mf_promosi")} k="promosi" ph={t("form.mf_ph_promosi")} />
              <F label={t("form.mf_kelebihan")} k="kelebihan" ph={t("form.mf_ph_kelebihan")} />
              <F label={t("form.mf_kekurangan")} k="kekurangan" ph={t("form.mf_ph_kekurangan")} />
              <F label={t("form.mf_keahlian")} k="keahlianKhusus" ph={t("form.mf_ph_keahlian")} />
              <F label={t("form.mf_hobi")} k="hobi" ph={t("form.mf_ph_hobi")} />
              <F label={t("form.mf_alasan_bidang")} k="alasanBidang" />
              <F label={t("form.mf_motivasi")} k="motivasiJepang" />
              <F label={t("form.mf_keinginan")} k="keinginan" />
              <F label={t("form.mf_rencana_pulang")} k="rencanaPulang" />
              <F label={t("form.mf_tujuan_jepang")} k="tujuanJepang" />
              <div class="grid grid-cols-2 gap-3">
                <F label={t("form.mf_lama_jepang")} k="lamaJepang" type="number" ph="Misal: 3" twoCol />
                <F label={t("form.mf_gaji_yen")} k="gajiYen" type="number" ph="Misal: 200000" twoCol />
              </div>
              <F label={t("form.mf_tabungan")} k="tabungan" ph={t("form.mf_ph_misal_tabungan")} />
            </div>
          )}

          {/* ═══ STEP 3: RIWAYAT ═══ */}
          {step === 3 && (
            <div class="animate-[fadeIn_.4s_ease]">
              <div class="section-title">Riwayat Pendidikan (Maks 5)</div>
              {eduList.map((edu, i) => (
                <div class="p-3 rounded-xl mb-3" style={{ background: '#0f172a', border: '1px dashed #334155' }}>
                  <div class="flex justify-between items-center mb-2">
                    <span class="text-[10px] font-extrabold" style={{ color: '#94a3b8' }}>Pendidikan #{i + 1}</span>
                    {eduList.length > 1 && <button onClick={() => setEduList(l => l.filter((_, j) => j !== i))} class="text-rose-400 text-[10px] font-bold"><Icon name="trash" class="mr-1" />Hapus</button>}
                  </div>
                  <div class="grid grid-cols-2 gap-3">
                    <div class="mb-3"><label class="label">Jenjang</label>
                      <select class="input" value={edu.jenjang} onChange={(e) => { const v = [...eduList]; v[i].jenjang = (e.target as HTMLSelectElement).value; setEduList(v); }}>
                        <option value="">{t("form.mf_pilih")}</option><option value="SD">SD</option><option value="SMP">SMP</option><option value="SMA/SMK">SMA/SMK</option><option value="D3">D3</option><option value="S1">S1</option><option value="S2">S2</option>
                      </select>
                    </div>
                    <div class="mb-3"><label class="label">Nama Sekolah</label>
                      <input class="input" value={edu.nama} onInput={(e) => { const v = [...eduList]; v[i].nama = (e.target as HTMLInputElement).value; setEduList(v); }} /></div>
                    <div class="mb-3"><label class="label">Tahun Awal</label>
                      <input class="input" type="number" value={edu.thnAwal} onInput={(e) => { const v = [...eduList]; v[i].thnAwal = (e.target as HTMLInputElement).value; setEduList(v); }} /></div>
                    <div class="mb-3"><label class="label">Tahun Akhir</label>
                      <input class="input" type="number" value={edu.thnAkhir} onInput={(e) => { const v = [...eduList]; v[i].thnAkhir = (e.target as HTMLInputElement).value; setEduList(v); }} /></div>
                    <div class="mb-3"><label class="label">Jurusan</label>
                      <input class="input" value={edu.jurusan} onInput={(e) => { const v = [...eduList]; v[i].jurusan = (e.target as HTMLInputElement).value; setEduList(v); }} /></div>
                    <div class="mb-3"><label class="label">Alamat Sekolah</label>
                      <input class="input" value={edu.alamat} onInput={(e) => { const v = [...eduList]; v[i].alamat = (e.target as HTMLInputElement).value; setEduList(v); }} /></div>
                  </div>
                </div>
              ))}
              {eduList.length < 5 && <button onClick={() => setEduList(l => [...l, { jenjang:'', nama:'', thnAwal:'', thnAkhir:'', jurusan:'', alamat:'' }])} class="text-sky-400 text-xs font-bold mb-6"><Icon name="plus" class="mr-1" />Tambah Pendidikan</button>}

              <div class="section-title mt-6">Riwayat Pekerjaan (Maks 3)</div>
              {jobList.map((job, i) => (
                <div class="p-3 rounded-xl mb-3" style={{ background: '#0f172a', border: '1px dashed #334155' }}>
                  <div class="flex justify-between items-center mb-2">
                    <span class="text-[10px] font-extrabold" style={{ color: '#94a3b8' }}>Pekerjaan #{i + 1}</span>
                    {jobList.length > 1 && <button onClick={() => setJobList(l => l.filter((_, j) => j !== i))} class="text-rose-400 text-[10px] font-bold"><Icon name="trash" class="mr-1" />Hapus</button>}
                  </div>
                  <div class="grid grid-cols-2 gap-3">
                    <div class="mb-3"><label class="label">Perusahaan</label>
                      <input class="input" value={job.perusahaan} onInput={(e) => { const v = [...jobList]; v[i].perusahaan = (e.target as HTMLInputElement).value; setJobList(v); }} /></div>
                    <div class="mb-3"><label class="label">Jabatan</label>
                      <input class="input" value={job.jabatan} onInput={(e) => { const v = [...jobList]; v[i].jabatan = (e.target as HTMLInputElement).value; setJobList(v); }} /></div>
                    <div class="mb-3"><label class="label">Tahun Awal</label>
                      <input class="input" type="number" value={job.thnAwal} onInput={(e) => { const v = [...jobList]; v[i].thnAwal = (e.target as HTMLInputElement).value; setJobList(v); }} /></div>
                    <div class="mb-3"><label class="label">Tahun Akhir</label>
                      <input class="input" type="number" value={job.thnAkhir} onInput={(e) => { const v = [...jobList]; v[i].thnAkhir = (e.target as HTMLInputElement).value; setJobList(v); }} /></div>
                    <div class="mb-3"><label class="label">Gaji</label>
                      <input class="input" value={job.gaji} onInput={(e) => { const v = [...jobList]; v[i].gaji = (e.target as HTMLInputElement).value; setJobList(v); }} /></div>
                    <div class="mb-3"><label class="label">Alasan Berhenti</label>
                      <input class="input" value={job.alasan} onInput={(e) => { const v = [...jobList]; v[i].alasan = (e.target as HTMLInputElement).value; setJobList(v); }} /></div>
                  </div>
                </div>
              ))}
              {jobList.length < 3 && <button onClick={() => setJobList(l => [...l, { perusahaan:'', jabatan:'', thnAwal:'', thnAkhir:'', gaji:'', alasan:'' }])} class="text-sky-400 text-xs font-bold"><Icon name="plus" class="mr-1" />Tambah Pekerjaan</button>}
            </div>
          )}

          {/* ═══ STEP 4: KELUARGA ═══ */}
          {step === 4 && (
            <div class="animate-[fadeIn_.4s_ease]">
              <div class="section-title">Anggota Keluarga (Maks 5)</div>
              {famList.map((fam, i) => (
                <div class="p-3 rounded-xl mb-3" style={{ background: '#0f172a', border: '1px dashed #334155' }}>
                  <div class="flex justify-between items-center mb-2">
                    <span class="text-[10px] font-extrabold" style={{ color: '#94a3b8' }}>Keluarga #{i + 1}</span>
                    {famList.length > 1 && <button onClick={() => setFamList(l => l.filter((_, j) => j !== i))} class="text-rose-400 text-[10px] font-bold"><Icon name="trash" class="mr-1" />Hapus</button>}
                  </div>
                  <div class="grid grid-cols-2 gap-3">
                    <div class="mb-3"><label class="label">Nama</label>
                      <input class="input" value={fam.nama} onInput={(e) => { const v = [...famList]; v[i].nama = (e.target as HTMLInputElement).value; setFamList(v); }} /></div>
                    <div class="mb-3"><label class="label">Hubungan</label>
                      <select class="input" value={fam.hubungan} onChange={(e) => { const v = [...famList]; v[i].hubungan = (e.target as HTMLSelectElement).value; setFamList(v); }}>
                        <option value="">{t("form.mf_pilih")}</option><option value="Ayah">Ayah</option><option value="Ibu">Ibu</option><option value="Suami">Suami</option><option value="Istri">Istri</option><option value="Anak">Anak</option><option value="Saudara">Saudara</option><option value="Lainnya">Lainnya</option>
                      </select>
                    </div>
                    <div class="mb-3"><label class="label">Usia</label>
                      <input class="input" type="number" value={fam.usia} onInput={(e) => { const v = [...famList]; v[i].usia = (e.target as HTMLInputElement).value; setFamList(v); }} /></div>
                    <div class="mb-3"><label class="label">Pekerjaan</label>
                      <input class="input" value={fam.pekerjaan} onInput={(e) => { const v = [...famList]; v[i].pekerjaan = (e.target as HTMLInputElement).value; setFamList(v); }} /></div>
                  </div>
                </div>
              ))}
              {famList.length < 5 && <button onClick={() => setFamList(l => [...l, { nama:'', hubungan:'', usia:'', pekerjaan:'' }])} class="text-sky-400 text-xs font-bold mb-6"><Icon name="plus" class="mr-1" />Tambah Keluarga</button>}

              <div class="section-title mt-6">Kontak Darurat (Wajib)</div>
              <div class="p-4 rounded-xl" style={{ background: '#0f172a', border: '1px solid rgba(14,165,233,.3)' }}>
                <div class="mb-3"><label class="label">Nama Kontak Darurat</label>
                  <input class="input" value={daruratNama} onInput={(e) => setDaruratNama((e.target as HTMLInputElement).value)} /></div>
                <div class="grid grid-cols-2 gap-3">
                  <div class="mb-3"><label class="label">Hubungan</label>
                    <input class="input" value={daruratHubungan} placeholder="Istri / Orang Tua" onInput={(e) => setDaruratHubungan((e.target as HTMLInputElement).value)} /></div>
                  <div class="mb-3"><label class="label">No. WA Darurat</label>
                    <input class="input" type="number" value={daruratWa} onInput={(e) => setDaruratWa((e.target as HTMLInputElement).value)} /></div>
                </div>
              </div>

              <div class="section-title mt-6">Kenalan di Jepang</div>
              <div class="p-4 rounded-xl" style={{ background: '#0f172a', border: '1px dashed #334155' }}>
                <div class="grid grid-cols-2 gap-3">
                  <div class="mb-3"><label class="label">Nama Kenalan</label>
                    <input class="input" value={kenalan.nama} placeholder="Kosongkan jika tidak ada" onInput={(e) => setKenalan(k => ({ ...k, nama: (e.target as HTMLInputElement).value }))} /></div>
                  <div class="mb-3"><label class="label">Usia</label>
                    <input class="input" type="number" value={kenalan.usia} placeholder="Misal: 30" onInput={(e) => setKenalan(k => ({ ...k, usia: (e.target as HTMLInputElement).value }))} /></div>
                  <div class="mb-3"><label class="label">Hubungan</label>
                    <input class="input" value={kenalan.hubungan} placeholder="Teman / Saudara" onInput={(e) => setKenalan(k => ({ ...k, hubungan: (e.target as HTMLInputElement).value }))} /></div>
                  <div class="mb-3"><label class="label">Pekerjaan</label>
                    <input class="input" value={kenalan.pekerjaan} placeholder="Karyawan / Mahasiswa" onInput={(e) => setKenalan(k => ({ ...k, pekerjaan: (e.target as HTMLInputElement).value }))} /></div>
                </div>
                <div class="mb-3"><label class="label">Alamat di Jepang</label>
                  <input class="input" value={kenalan.alamat} placeholder="Kota / Prefektur (Otomatis diterjemahkan)" onInput={(e) => setKenalan(k => ({ ...k, alamat: (e.target as HTMLInputElement).value }))} /></div>
              </div>
            </div>
          )}

          {/* ═══ STEP 5: DOKUMEN ═══ */}
          {step === 5 && (
            <div class="animate-[fadeIn_.4s_ease]">
              <div class="section-title">Status & Paspor</div>
              <F label={t("form.mf_eks_jepang")} k="eksJepang" opts={['BELUM PERNAH','EKS MAGANG','EKS TOKUTEI GINO']} />
              <F label={t("form.mf_no_coe")} k="noCoe" ph="Kosongkan jika tidak ada" />
              <div class="mt-4"></div>
              <F label={t("form.mf_no_paspor")} k="noPaspor" ph="Kosongkan jika belum punya" />
              <div class="grid grid-cols-2 gap-3">
                <F label={t("form.mf_tgl_terbit")} k="tglTerbitPaspor" type="date" twoCol />
                <F label={t("form.mf_exp")} k="expPaspor" type="date" twoCol />
              </div>
              <F label={t("form.mf_kota_paspor")} k="kotaPaspor" ph="Misal: SURABAYA" />

              <div class="section-title mt-6">Sertifikasi & Bahasa (Japanese Qualifications)</div>
              <div class="grid grid-cols-2 gap-3">
                <F label={t("form.mf_bhs_jepang")} k="bhsJepang" opts={['-','N1','N2','N3','N4','N5','JFT BASIC A2','BELUM LULUS','BELUM TES']} twoCol />
                <F label={t("form.mf_nilai")} k="nilai" ph="Misal: 120/180" twoCol />
              </div>
              <F label={t("form.mf_lisensi")} k="lisensi" opts={['-','AA','AB','AC','AD','AE','AF','AG','AH','AI','AJ','AK','AL','AM','AN','AO','AP','AQ','AR','AS','AT','AU','Lainnya']} />
              {data.lisensi === 'Lainnya' && <F label={t("master.ketik_bidang")} k="lisensiManual" ph="その他の職種を入力" />}
              <F label={t("form.mf_ssw2")} k="lisensi2" opts={['-','AA','AB','AC','AD','AE','AF','AG','AH','AI','AJ','AK','AL','AM','AN','AO','AP','AQ','AR','AS','AT','AU','Lainnya']} />
              {data.lisensi2 === 'Lainnya' && <F label={t("master.ketik_bidang2")} k="lisensi2Manual" ph="その他の職種を入力" />}

              <div class="section-title mt-6">Upload Dokumen (MAX 2MB)</div>
              {[
                { k: 'photo', label: 'PAS PHOTO (JPG/PNG)', icon: 'fa-camera', accept: '.jpg,.jpeg,.png' },
                { k: 'jft', label: 'SERTIFIKAT JFT (PDF)', icon: 'fa-file-pdf', accept: '.pdf' },
                { k: 'ssw', label: 'SERTIFIKAT SSW (PDF)', icon: 'fa-file-signature', accept: '.pdf' },
                { k: 'ijazahSd', label: 'IJAZAH SD (PDF)', icon: 'fa-graduation-cap', accept: '.pdf' },
                { k: 'ijazahSmp', label: 'IJAZAH SMP (PDF)', icon: 'fa-graduation-cap', accept: '.pdf' },
                { k: 'ijazahSma', label: 'IJAZAH SMA (PDF)', icon: 'fa-graduation-cap', accept: '.pdf' },
                { k: 'univ', label: 'IJAZAH UNIVERSITAS (PDF)', icon: 'fa-university', accept: '.pdf' },
                { k: 'ktpFile', label: 'KTP (PDF)', icon: 'fa-id-card', accept: '.pdf' },
                { k: 'kk', label: 'KK (PDF)', icon: 'fa-users', accept: '.pdf' },
              ].map(doc => (
                <div class="flex justify-between items-center p-4 rounded-2xl mb-4" style={{ background: '#0f172a', border: '1px solid #334155' }}>
                  <div>
                    <div class="text-xs font-extrabold text-white">{doc.label}</div>
                    <div class="text-[10px] mt-1" style={{ color: '#94a3b8', wordBreak: 'break-all' }}>{fileNames[doc.k] || 'Belum ada file'}</div>
                  </div>
                  <label class="cursor-pointer px-4 py-2 rounded-lg font-extrabold text-[11px]" style={{ background: '#38bdf8', color: '#020617' }}>
                    PILIH
                    <input type="file" accept={doc.accept} class="hidden" onChange={(e) => handleFile(doc.k, (e.target as HTMLInputElement).files?.[0] || null)} />
                  </label>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Nav Bar */}
      <div class="fixed bottom-0 left-0 w-full py-4 px-5 z-50 flex justify-between gap-4" style={{ background: 'rgba(2,6,23,.95)', borderTop: '1px solid #1e293b' }}>
        {step > 1 && <button onClick={() => changeStep(-1)} class="flex-1 py-4 rounded-[14px] text-[13px] font-extrabold" style={{ background: '#1e293b', color: '#cbd5e1' }}><Icon name="arrow-left" class="mr-1" /> Kembali</button>}
        <button onClick={() => submitMaster(true)} class="flex-1 py-4 rounded-[14px] text-[13px] font-extrabold text-white" style={{ background: '#d97706' }}><Icon name="save" class="mr-1" /> Draft</button>
        {step < 5 && <button onClick={() => changeStep(1)} class="flex-1 py-4 rounded-[14px] text-[13px] font-extrabold" style={{ background: '#38bdf8', color: '#020617', boxShadow: '0 5px 15px rgba(56,189,248,.3)' }}>Lanjut <Icon name="arrow-right" class="ml-1" /></button>}
        {step === 5 && <button onClick={() => submitMaster(false)} disabled={saving} class="flex-1 py-4 rounded-[14px] text-[13px] font-extrabold text-white disabled:opacity-50" style={{ background: '#10b981', color: '#020617', boxShadow: '0 5px 15px rgba(16,185,129,.3)' }}>{saving ? 'Menyimpan...' : 'Simpan Final'}</button>}
      </div>
    </div>
  );
}
