/**
 * MasterFullForm.tsx — Master Database 5-Step Form (master-full.html)
 * Source: legacy/master-full.html (1:1 match)
 * Steps: Identitas → Medis & Wawancara → Riwayat → Keluarga → Dokumen
 */
import { useState, useEffect } from 'preact/hooks';
import { showToast } from '../Toast';
import { authStore } from '../../store/authReactive';
import { validate, kandidatLoginSchema, waSchema, emailSchema } from '../../lib/schemas';
import { t, useLang } from '../../store/i18n';
import { apiClient } from "../../lib/apiClient";
import Icon from '../ui/Icon';
import { uploadMany, UploadCollectionError } from '../../lib/cloudinary';
import { MASTER_FILE_COLUMNS } from '../../lib/documentColumns';
import { mapMasterNestedToForm } from '../../lib/masterPrefill';
import {
  PEKERJAAN, JURUSAN, KOTA, HUBUNGAN_KELUARGA,
  SENTINEL_LAINNYA, withOther, withEmpty, selectState, resolveOther,
} from '../../lib/opsi-form';
import type { Opsi } from '../../lib/opsi-form';
import { useOverlay } from '../ui/useOverlay';

/* ── Types ──
   `jurusan` dan `jabatan` menyimpan NILAI AKHIR yang akan dikirim ke server
   (yaitu hasil `resolveOther`: entri daftar, atau teks manual bila kandidat
   memilih "Lainnya"). `*Manual` hanya menampung teks yang sedang diketik di
   kotak manual — ia bukan bagian dari payload, dan sengaja dipisah supaya
   memilih "Lainnya" lalu kembali ke daftar tidak menghapus teks itu. */
interface EduRecord { jenjang: string; nama: string; thnAwal: string; thnAkhir: string; jurusan: string; jurusanManual: string; alamat: string; }
interface JobRecord { perusahaan: string; jabatan: string; jabatanManual: string; thnAwal: string; thnAkhir: string; gaji: string; alasan: string; }
interface FamRecord { nama: string; hubungan: string; usia: string; pekerjaan: string; pekerjaanManual: string; }

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

/* ── Bidang SSW (Tokutei Ginou) ──────────────────────────────────────────
   PARITY: legacy master_full.ts `SSW_LIST` — 16 bidang resmi di Indonesia.
   Value = nama Inggris (inilah yang DISIMPAN ke DB), label = nama + kanji.
   Sebelumnya form ini memakai daftar kode `AA…AU` yang salah: kandidat bisa
   menyimpan nilai yang bukan bidang SSW mana pun, dan nilai itu tidak akan
   pernah cocok dengan data legacy. */
const SSW_OPTIONS: Array<[string, string]> = [
  ['KAIGO', 'KAIGO (介護)'],
  ['BUILDING CLEANING', 'BUILDING CLEANING (ビルクリーニング)'],
  ['FOUNDRY & PLASTIC', 'FOUNDRY & PLASTIC (素形材産業)'],
  ['INDUSTRIAL MACHINERY', 'INDUSTRIAL MACHINERY (産業機械製造業)'],
  ['ELECTRIC & ELECTRONIC', 'ELECTRIC & ELECTRONIC (電気・電子情報)'],
  ['CONSTRUCTION', 'CONSTRUCTION (建設)'],
  ['SHIPBUILDING', 'SHIPBUILDING (造船・舶用工業)'],
  ['AUTOMOBILE REPAIR', 'AUTOMOBILE REPAIR (自動車整備)'],
  ['AVIATION', 'AVIATION (航空)'],
  ['ACCOMMODATION', 'ACCOMMODATION (宿泊)'],
  ['AGRICULTURE', 'AGRICULTURE (農業)'],
  ['FISHERY', 'FISHERY (漁業)'],
  ['FOOD & BEVERAGE', 'FOOD & BEVERAGE (飲食料品製造業)'],
  ['RESTAURANT', 'RESTAURANT (外食業)'],
  ['FORESTRY', 'FORESTRY (林業)'],
  ['WOOD INDUSTRY', 'WOOD INDUSTRY (木材産業)'],
];

/** Sentinel "ketik manual" — legacy memakai `__LAINNYA__`, BUKAN 'Lainnya'. */
const SSW_SENTINEL = '__LAINNYA__';

/** Opsi lengkap satu select SSW, termasuk opsi kosong legacy + sentinel. */
const SSW_OPTS: Array<[string, string]> = [
  ['', 'Pilih / 選択'],
  ...SSW_OPTIONS,
  [SSW_SENTINEL, '✍️ Lainnya / その他 (ketik manual)'],
];

const EMPTY: MasterData = {
  nama:'', furigana:'', panggilan:'', panggilanKatakana:'', tempatLahir:'', tglLahir:'',
  gender:'LAKI-LAKI', usia:'', agama:'ISLAM', statusNikah:'BELUM MENIKAH', anak:'0', ktp:'', sim:'',
  alamat:'', email:'', tb:'', bb:'', goldar:'-', tangan:'KANAN', baju:'', sepatu:'', topi:'', tahanAc:'YA',
  mataKiri:'', mataKanan:'', kacamata:'TIDAK', butaWarna:'TIDAK', tato:'TIDAK', tindik:'TIDAK',
  merokok:'TIDAK', alkohol:'TIDAK', penyakit:'', alergi:'', laka:'',
  promosi:'', kelebihan:'', kekurangan:'', keahlianKhusus:'', hobi:'', alasanBidang:'',
  motivasiJepang:'', keinginan:'', rencanaPulang:'', tujuanJepang:'', lamaJepang:'', gajiYen:'', tabungan:'',
  eksJepang:'BELUM PERNAH', noCoe:'', noPaspor:'', tglTerbitPaspor:'', expPaspor:'', kotaPaspor:'',
  bhsJepang:'-', nilai:'', lisensi:'', lisensiManual:'', lisensi2:'', lisensi2Manual:'',
};

const STEPS = [
  { icon: 'fa-user', key: 'master.step_personal' },
  { icon: 'fa-heartbeat', key: 'master.step_medical' },
  { icon: 'fa-briefcase', key: 'master.step_history' },
  { icon: 'fa-users', key: 'master.step_family' },
  { icon: 'fa-file-alt', key: 'master.step_documents' },
];

/**
 * Bentuk jawaban dua action yang sekarang dipanggil lewat apiClient.
 *
 * Ditulis eksplisit, bukan `apiClient<any>`: `lint-ratchet` menolak berkas yang
 * sudah punya diagnostik lalu bertambah (kondisi 3), dan satu `any` baru di sini
 * cukup untuk memerahkan gate itu. `getDrafCvMaster` tidak butuh tipe sendiri —
 * `ApiResponse` bawaan klien sudah cukup, karena `identitas`/`uploads`
 * diteruskan ke helper yang parameternya `any`.
 */
interface LoginKandidatRes {
  sessionToken?: string; token?: string; user?: string;
}
interface SubmitMasterRes {
  success?: boolean; message?: string; error?: string;
}

export default function MasterFullForm() {
  /* ⚠ THE CALL STAYS, THE BINDING DOES NOT. `useLang()` is a SUBSCRIPTION, not a
     read: it re-renders this island when the dictionary changes (including the
     lazy JP dictionary landing via `jpReady`). The VALUE stopped being used when
     the hero's own language button was removed on 2026-09-25, but deleting the
     call would silently stop live language switching on this form — the labels
     would only update on a reload. So it is called for its effect, with no
     binding, which is also what keeps `noUnusedVariables` quiet. */
  useLang();
  const [step, setStep] = useState(1);
  const [data, setData] = useState<MasterData>({ ...EMPTY });
  const [eduList, setEduList] = useState<EduRecord[]>([{ jenjang:'', nama:'', thnAwal:'', thnAkhir:'', jurusan:'', jurusanManual:'', alamat:'' }]);
  const [jobList, setJobList] = useState<JobRecord[]>([{ perusahaan:'', jabatan:'', jabatanManual:'', thnAwal:'', thnAkhir:'', gaji:'', alasan:'' }]);
  const [famList, setFamList] = useState<FamRecord[]>([{ nama:'', hubungan:'', usia:'', pekerjaan:'', pekerjaanManual:'' }]);
  const [kotaPasporManual, setKotaPasporManual] = useState('');
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
  /* P3 §4.1 #5 — badge "Belum tersimpan".
     Legacy master-full.html:336 punya `#unsaved-badge`; di sana `N` (snapshot)
     diisi SETELAH data server selesai dimuat, dan badge muncul hanya kalau
     `N !== ""` DAN state sekarang berbeda. Dua sifat itu penting dan keduanya
     dipertahankan di sini:
       1. `dirty` tidak pernah true selama `baseline` masih null — form yang
          baru dibuka dan belum termuat tidak boleh mengaku ada perubahan;
       2. yang dibandingkan adalah bentuk terserialisasi (`signature()`), bukan
          jumlah keystroke, supaya mengetik lalu menghapus kembali tidak
          menyisakan badge palsu.
     Legacy mendengarkan event `input` di seluruh dokumen
     (`querySelectorAll("input, select, textarea")`). Di Preact kita tidak
     boleh menyentuh DOM di luar render, jadi signature dihitung di render dan
     `dirty` diturunkan sebagai nilai turunan — bukan state yang di-set dari
     handler, sehingga tidak ada kesempatan desinkronisasi. */
  const [baseline, setBaseline] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  /* P3 §4.1 #6 — overlay "Menyinkronkan Data…". Legacy punya `#loading` dan
     menampilkannya tepat sebelum `getMasterDataByWa` dan menyembunyikannya di
     `.then()` maupun `.catch()`. Di sini dihitung dari state supaya overlay
     tidak bisa tertinggal kalau permintaan gagal. */
  const [syncing, setSyncing] = useState(false);

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
    if (!token || !wa) { setLoaded(true); return; }
    setSyncing(true);
    try {
      // ── Lewat apiClient, BUKAN fetch mentah ─────────────────────────────
      // `getDrafCvMaster` ADA di CACHEABLE_READS, dan fetch mentah melewati
      // cache baca 30 s (§26 — cacat yang sama dengan TabKelola, CandidateDash
      // dan ApplyFullForm).
      //
      // `requireAuth` dibiarkan default (true) dengan sengaja: fungsi ini sudah
      // punya gerbangnya sendiri di atas — `if (!token || !wa) return` — jadi
      // menuntut sesi di sini TIDAK mengubah siapa yang sampai ke baris ini.
      // `onSessionInvalid: 'throw'` + `silent: true` mempertahankan perilaku
      // lama: catch di bawah memang menelan kegagalan prefill, dan default
      // 'logout' akan me-redirect user yang sedang mengisi form.
      const d = await apiClient('getDrafCvMaster', [wa], {
        onSessionInvalid: 'throw',
        silent: true,
      });
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
    finally {
      /* Selalu dilepas, termasuk saat gagal — kalau tidak, satu error jaringan
         mengunci form di bawah overlay. */
      setSyncing(false);
      setLoaded(true);
    }
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

  /* P3 §4.1 #5 — signature untuk deteksi perubahan.
     Legacy membandingkan 56 field teks + tingkat pendidikan + nama perusahaan
     (`R.map(...)`, lalu `edu_tk_*`, lalu `job_nm_*`). Di sini cakupannya
     sengaja lebih luas: seluruh `data`, ketiga daftar dinamis, dan kenalan.
     Kalau cakupannya lebih sempit dari yang bisa diedit user, badge akan
     berbohong (ada perubahan tapi badge diam) — itu lebih buruk daripada badge
     yang sesekali muncul karena perubahan sepele. */
  const signature = () => JSON.stringify([data, eduList, jobList, famList, kenalan, kotaPasporManual, daruratNama, daruratHubungan, daruratWa]);

  /* Baseline diambil SEKALI setelah data server selesai dimuat. Kalau diambil
     saat mount, `data` masih kosong lalu langsung ditimpa hasil prefill —
     badge akan langsung menyala padahal user belum menyentuh apa pun. */
  useEffect(() => {
    if (!loaded || baseline !== null) return;
    setBaseline(signature());
  }, [loaded, baseline]);

  const dirty = baseline !== null && signature() !== baseline;

  /* P3 §4.1 #5 — peringatan sebelum menutup tab dengan perubahan belum
     disimpan, sama seperti legacy (`beforeunload` → `preventDefault`). */
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const gateLogin = async () => {
    const vg = validate(kandidatLoginSchema, { wa: gateWa, password: gatePass }); if (!vg.success) { setGateMsg(vg.errors[0]); return; }
    try {
      // `requireAuth: false` WAJIB — ini justru gerbang login itu sendiri, jadi
      // menuntut sesi sebelum login akan mengunci form untuk selamanya.
      // `onSessionInvalid: 'throw'`: default 'logout' tidak masuk akal pada
      // sebuah PERCOBAAN login.
      // KONTRAK WIRE: kernel/validate.ts memvalidasi loginKandidat dengan
      // z.tuple([waField, passwordField]), jadi payload-nya DUA PRIMITIF.
      // Bentuk lama `[{ wa, password }]` ditolak zod ("Array must contain at
      // least 2 element(s)") — gate ini tidak pernah bisa lolos dan user selalu
      // melihat "Password salah atau akun tidak ditemukan." LoginModal memakai
      // [wa, password] dan memang jalan; hanya kedua gate yang menyimpang.
      const d = await apiClient<LoginKandidatRes>('loginKandidat', [gateWa, gatePass], {
        requireAuth: false,
        onSessionInvalid: 'throw',
        silent: true,
      });
      authStore.set({...authStore.get(), sessionToken: d.sessionToken || d.token || '', wa: gateWa, name: d.user || 'kandidat', isLoggedIn: true, role: 'kandidat', lastChecked: Date.now() });
      setData(prev => ({ ...prev, wa: gateWa }));
      setLoginGate(false);
      loadServerDraft(gateWa);
    } catch (e) {
      // PERBEDAAN YANG DISENGAJA. Dulu `res.ok` memisahkan HTTP gagal
      // ("Password salah…") dari kegagalan jaringan ("Error koneksi.").
      // apiClient melempar untuk KEDUANYA, jadi pemisahan itu harus dibawa ulang
      // di sini — tanpa ini, password yang salah akan terbaca sebagai masalah
      // koneksi, dan pesan itulah yang dilihat user.
      const msg = (e as Error).message || '';
      setGateMsg(/^HTTP /.test(msg) ? 'Password salah atau akun tidak ditemukan.' : 'Error koneksi.');
    }
  };

  /** Update single field in master data */
  const upd = (k: string, v: string) => setData(d => ({ ...d, [k]: v }));

  const changeStep = (dir: number) => {
    const next = step + dir;
    if (next >= 1 && next <= 5) setStep(next);
  };

  const submitMaster = async (isDraft: boolean) => {
    /* P3 §4.1 #7 — validasi nama wajib.
       Legacy (master_full.ts `submitMaster`):
         if (!n && !i.trim()) { showToast(tr("form.mf_alert_nama_wajib")); $(1-p); return; }
       Yaitu: HANYA pada simpan final (`!isDraft`), dan setelah toast ia
       MELOMPAT ke step 1 supaya user langsung melihat field yang kosong.
       Tanpa ini, submit final bisa lolos tanpa nama — dan nama adalah satu-
       satunya kolom yang dipakai mencocokkan kandidat di seluruh alur. */
    if (!isDraft && !(data.nama || '').trim()) {
      showToast(t('form.mf_alert_nama_wajib'), 'error');
      setStep(1);
      return;
    }
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
      /* Baseline digeser setelah simpan berhasil. Legacy melakukan hal yang
         sama: `N = L()` dipanggil tepat setelah pemuatan selesai, sehingga
         badge padam begitu perubahan benar-benar tersimpan. */
      setBaseline(signature());
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
      // readManualSelect parity: kalau select SSW = sentinel, yang disimpan
      // adalah teks manualnya, bukan string sentinel itu sendiri.
      const resolveSsw = (sel: string, manual: string) => (sel === SSW_SENTINEL ? manual : sel);
      /* C09: jurusan/jabatan/pekerjaan memakai aturan resolve yang sama dengan
         select SSW — `resolveOther`. Ini sudah benar untuk nilai legacy yang
         TIDAK ada di daftar: nilai seperti itu tersimpan langsung di field
         utama (bukan sentinel), jadi `resolveOther` mengembalikannya apa
         adanya dan data lama tidak hilang saat user menyimpan ulang tanpa
         menyentuh baris itu. Detail keempat kasusnya ada di doc `opsi-form.ts`. */
      const resolveRow = resolveOther;
      const payload: Record<string, unknown> = {
        ...data,
        lisensi: resolveSsw(data.lisensi, data.lisensiManual),
        lisensi2: resolveSsw(data.lisensi2, data.lisensi2Manual),
        // Kota terbit paspor juga pasangan select+manual (lihat ManualSelect di
        // step 5) — nilai akhirnya di-resolve dengan aturan yang sama.
        kotaPaspor: resolveRow(data.kotaPaspor, kotaPasporManual),
        // POSISI BARIS DIJAGA (parity legacy master_full.ts): pendidikan
        // selalu dikirim 5 elemen, baris kosong = {}. Kalau baris kosong
        // difilter, baris LPK yang ada di posisi 5 bergeser ke posisi 4 setiap
        // kali form disimpan ulang. Job & keluarga TIDAK dipad seperti legacy.
        pendidikan: Array.from({ length: 5 }, (_, i) => {
          const e = eduList[i];
          return e && e.jenjang
            ? { tingkat: e.jenjang, nama_sekolah: e.nama, tahun_masuk: e.thnAwal, tahun_lulus: e.thnAkhir, jurusan: resolveRow(e.jurusan, e.jurusanManual) }
            : {};
        }),
        pekerjaan: jobList.filter(j => j.perusahaan).map(j => ({
          nama_perusahaan: j.perusahaan, jabatan: resolveRow(j.jabatan, j.jabatanManual),
          tahun_masuk: j.thnAwal, tahun_keluar: j.thnAkhir, gaji: j.gaji,
        })),
        keluarga: famList.filter(f => f.nama).map(f => ({
          nama: f.nama, hubungan: f.hubungan, usia: f.usia, pekerjaan: resolveRow(f.pekerjaan, f.pekerjaanManual),
        })),
        daruratNama, daruratHubungan, daruratWa,
        kenalanNama: kenalan.nama, kenalanHubungan: kenalan.hubungan,
        kenalanPekerjaan: kenalan.pekerjaan, kenalanUsia: kenalan.usia, kenalanAlamat: kenalan.alamat,
        ...fileUrls,
      };
      // Lewat apiClient: batas waktu 20 s (fetch mentah tidak punya satu pun),
      // dan `Authorization` + `sessionToken` disuntik klien.
      // `onSessionInvalid: 'throw'` + `silent: true`: catch di bawah sudah
      // menampilkan toast sendiri, jadi default 'logout' maupun toast klien akan
      // menggandakan pesan pada satu kegagalan.
      const data2 = await apiClient<SubmitMasterRes>('submitMasterForm', [payload], {
        onSessionInvalid: 'throw',
        silent: true,
      });
      if (data2.success) {
        localStorage.setItem('asj_master_' + data.wa, JSON.stringify(data));
        setBaseline(signature());
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

  /* ── Helper: Input field ──
     `opts` menerima string (label = value) ATAU pasangan [value, label] —
     daftar SSW perlu label kanji sementara yang disimpan tetap nama Inggris.
     `rows` mengubah field jadi <textarea>: legacy memakai textarea untuk 9
     field (alamat, penyakit, alergi, laka, promosi, alasanBidang,
     motivasiJepang, keinginan, rencanaPulang). Tanpa ini jawaban panjang
     kandidat terpotong jadi satu baris. */
  const F = (p: { label: string; k: string; type?: string; ph?: string; opts?: Array<string | [string, string]>; disabled?: boolean; twoCol?: boolean; rows?: number }) => {
    const v = data[p.k] || '';
    if (p.opts) {
      const pairs: Array<[string, string]> = p.opts.map(o => (Array.isArray(o) ? o : [o, o]));
      // Jangan hilangkan nilai yang tidak ada di daftar. Data lama bisa berisi
      // '-' (default form versi sebelumnya) atau kode dari daftar SSW yang
      // salah ('AA'…'AU'); kalau tidak dirender sebagai opsi sendiri, nilainya
      // diam-diam terhapus begitu user menyimpan ulang.
      if (v && !pairs.some(([val]) => val === v)) pairs.unshift([v, v]);
      return (
        <div class={p.twoCol ? '' : 'mb-3'}>
          <label class="label" for={`mf-${p.k}`}>{p.label}</label>
          <select id={`mf-${p.k}`} class="input" value={v} onChange={(e) => upd(p.k, (e.target as HTMLSelectElement).value)}>
            {pairs.map(([val, label]) => <option value={val}>{label}</option>)}
          </select>
        </div>
      );
    }
    if (p.rows) {
      return (
        <div class={p.twoCol ? '' : 'mb-3'}>
          <label class="label" for={`mf-${p.k}`}>{p.label}</label>
          <textarea id={`mf-${p.k}`} class="input resize-y" rows={p.rows} value={v} placeholder={p.ph || ''}
            disabled={p.disabled}
            onInput={(e) => upd(p.k, (e.target as HTMLTextAreaElement).value)} />
        </div>
      );
    }
    return (
      <div class={p.twoCol ? '' : 'mb-3'}>
        <label class="label" for={`mf-${p.k}`}>{p.label}</label>
        <input id={`mf-${p.k}`} type={p.type || 'text'} class="input" value={v} placeholder={p.ph || ''}
          disabled={p.disabled}
          onInput={(e) => upd(p.k, (e.target as HTMLInputElement).value)} />
      </div>
    );
  };

  /** Select bidang SSW. PARITY legacy `readManualSelect`: nilai yang DISIMPAN
   *  adalah nama bidang SSW, ATAU teks manual bila user memilih sentinel
   *  `__LAINNYA__`. Karena itu saat prefill, nilai yang bukan salah satu
   *  bidang SSW diperlakukan sebagai entri manual ⇒ select di-set ke sentinel
   *  dan teksnya masuk ke field manual, persis seperti perilaku legacy.
   *  Tanpa ini, nilai manual dari data lama tidak akan tampil di mana pun. */
  const SswField = ({ label, k, kManual, labelManual }: { label: string; k: string; kManual: string; labelManual: string }) => {
    const stored = data[k] || '';
    const sel = !stored ? '' : SSW_OPTIONS.some(([v]) => v === stored) ? stored : SSW_SENTINEL;
    return (
      <>
        <div class="mb-3">
          <label class="label" for={`mf-${k}`}>{label}</label>
          <select id={`mf-${k}`} class="input" value={sel} onChange={(e) => upd(k, (e.target as HTMLSelectElement).value)}>
            {SSW_OPTS.map(([val, lab]) => <option value={val}>{lab}</option>)}
          </select>
        </div>
        {sel === SSW_SENTINEL && <F label={labelManual} k={kManual} ph="その他の職種を入力" />}
      </>
    );
  };

  /** Select generik untuk daftar di `lib/opsi-form.ts` (pekerjaan, jurusan,
   *  kota terbit paspor, hubungan keluarga).
   *
   *  Satu komponen untuk semua pasangan select+manual supaya tidak ada dua
   *  tafsir tentang sentinel:
   *
   *    - nilai yang tersimpan tapi TIDAK ada di daftar → select parkir di
   *      `__LAINNYA__` dan teks aslinya muncul di kotak manual (jadi nilai
   *      lama tidak hilang saat form disimpan ulang — legacy
   *      `fillManualSelect`);
   *    - yang DISIMPAN ke `value` adalah teks manual, bukan sentinel
   *      (legacy `readManualSelect`).
   *
   *  `value` = nilai akhir (yang dikirim ke server). `manualKey` = field
   *  terpisah yang menyimpan apa yang sedang diketik; dipisah supaya memilih
   *  "Lainnya" lalu kembali ke daftar tidak menghapus teks yang sudah diketik,
   *  dan tiap baris (pendidikan #1..#5, pekerjaan #1..#3, keluarga #1..#5)
   *  punya kotak manualnya sendiri.
   *
   *  `onChange(patch)` menerima partial record yang harus digabung ke baris —
   *  jadi pemanggil di dalam `.map()` bisa langsung menulis `v[i] = {...v[i], ...patch}`. */
  const ManualSelect = ({ id, label, list, value, manual, onChange }: {
    id: string; label: string; list: Opsi[]; value: string; manual: string;
    onChange: (patch: { value: string; manual: string }) => void;
  }) => {
    const { select, manual: derived } = selectState(list, value);
    /* Saat select parkir di sentinel karena nilai lama tidak ada di daftar,
       `manual` milik pemanggil masih kosong — yang punya teks itu adalah
       `derived` (isi `value` yang tidak dikenali daftar). Pakai `manual` kalau
       user sudah mengetik, kalau belum pakai `derived`, supaya teks lama
       langsung terlihat dan tidak terlihat seperti hilang. */
    const shown = manual || (select === SENTINEL_LAINNYA ? derived : '');
    return (
      <>
        <div class="mb-3">
          <label class="label" for={id}>{label}</label>
          <select id={id} class="input" value={select}
            onChange={(e) => {
              const next = (e.target as HTMLSelectElement).value;
              /* Pilih entri daftar → buang teks manual (tidak relevan lagi).
                 Pilih "Lainnya" → PERTAHANKAN teks yang sudah ada supaya
                 berpindah pilihan bolak-balik tidak menghapus ketikan user.
                 Nilai akhir selalu di-resolve oleh pemanggil lewat
                 `resolveOther(select, manual)`. */
              onChange({ value: next, manual: next === SENTINEL_LAINNYA ? shown : '' });
            }}>
            {withOther(list, value).map(([val, lab]) => <option value={val}>{lab}</option>)}
          </select>
        </div>
        {select === SENTINEL_LAINNYA && (
          <div class="mb-3">
            <input class="input" value={shown} placeholder={t('form.mf_ketik_manual')}
              onInput={(e) => onChange({ value: SENTINEL_LAINNYA, manual: (e.target as HTMLInputElement).value })} />
          </div>
        )}
      </>
    );
  };

  /* ── Login Gate ── */
  if (loginGate) {
    return (
      <div ref={gateOverlay.containerRef} class="fixed inset-0 u-modal-shell z-50 bg-black/85 flex items-center justify-center p-4">
        <div class="bg-[#0b1220] border border-sky-500/30 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
          <div class="text-center mb-4">
            <div class="text-2xl mb-1"><Icon name="lock" class="text-sky-400" /></div>
            <div class="font-bold text-white text-sm">{t("ai_cv.verify_account")}</div>
            <div class="text-slate-400 text-xs mt-1">{t("form.connected_wa")} <span class="text-sky-400 font-bold">{gateWa}</span></div>
            <div class="text-slate-500 text-[11px] mt-1">{t("form.enter_password_desc")}</div>
          </div>
          <label for="mf-gate-pass" class="label">{t("form.mf_password")}</label>
          <input id="mf-gate-pass" type="password" class="input" value={gatePass} placeholder="••••••••"
            onInput={(e) => setGatePass((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => { if ((e as KeyboardEvent).key === 'Enter') gateLogin(); }} />
          <button onClick={gateLogin} class="w-full mt-3 bg-sky-600 hover:bg-sky-500 text-white rounded-xl py-2.5 text-sm font-bold">{t("login.btn_masuk")}</button>
          {gateMsg && <div class="text-rose-400 text-xs text-center mt-2">{gateMsg}</div>}
        </div>
      </div>
    );
  }

  return (
    <div class="bg-canvas text-fg" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", paddingBottom: 90, paddingTop: 42 }}>
      {/* Hero
          P3 §4.1 #8 — aset hero. Sebelumnya banner Unsplash di-hotlink dari
          pihak ketiga, padahal legacy memakai aset Supabase milik sendiri
          (`master-full.html:85` → asj-files/assets/dark_tokyo_banner.webp).
          Hotlink berarti halaman ini bergantung pada Unsplash yang bisa saja
          memblokir CORS/hotlink, berubah gambar, atau menagih — dan yang
          paling penting: aset legacy sudah ada di infrastruktur sendiri.
          Dikembalikan ke aset legacy supaya sekaligus konsisten dengan
          CandidateDash yang memang sudah memakai bucket yang sama.
          Logo memakai URL yang sama dengan CandidateDash; `/assets/logo.png`
          yang lama tidak pernah ada di `public/`, jadi itu gambar rusak. */}
      <div class="relative h-[220px] overflow-hidden">
        <img src="https://gdwvffmevwtwnzrapjwy.supabase.co/storage/v1/object/public/asj-files/assets/dark_tokyo_banner.webp" class="absolute inset-0 w-full h-full object-cover brightness-[.35]" alt="" />
        <div class="absolute inset-0 bg-gradient-to-b from-black/25 to-canvas"></div>
        <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center w-full z-10">
          <img src="https://gdwvffmevwtwnzrapjwy.supabase.co/storage/v1/object/public/asj-files/assets/logo-removebg-preview.webp" class="w-20 h-20 rounded-full mx-auto shadow-[0_10px_25px_rgba(0,0,0,.5)] object-contain" alt="Logo ASJ" />
          <div class="text-2xl font-black mt-2 uppercase text-accent-sky">{t("master.form_brand")}</div>
          <div class="text-[11px] mt-1 text-fg-muted" style={{ letterSpacing: 2 }}>{t("master.form_sub")}</div>
        </div>
        {/* ⚠ THE HERO'S OWN LANGUAGE BUTTON WAS REMOVED 2026-09-25 — IT WAS A
            DUPLICATE, AND IT STACKED.

            MEASURED at 390px on `/master` (and `/ai-cv`, which mounts the same
            form): TWO language toggles were visible at once — this floating pill
            at `absolute top-3 right-3 z-10` (51x31px, under the 44px touch
            floor) and the one `FormToolbar` renders 42px above it. The owner's
            report was "menu yang saling menumpuk"; this was the stacking.

            `FormToolbar` is mounted by EVERY route that mounts this form
            (`master.astro:7`, `ai-cv.astro:11`), so removing this one leaves the
            toggle reachable on all of them — verified by grep, not assumed: the
            only consumers of `MasterFullForm` are those two pages, and both
            mount the toolbar. Do not re-add a language control here; put it in
            the toolbar if it needs to move. */}

        {/* P3 §4.1 #5 — badge "Belum tersimpan" (legacy #unsaved-badge).
            Ditaruh di hero supaya terlihat dari step mana pun tanpa scroll.
            `aria-live` diberi karena kemunculannya adalah umpan balik status,
            bukan hiasan.
            (Dulu komentarnya berbunyi "sebelah tombol bahasa" — tombol itu sudah
            tidak ada di sini, lihat catatan di atas.) */}
        {dirty && (
          <span aria-live="polite"
            class="absolute top-3 left-3 z-10 px-3 py-1.5 rounded-full text-[11px] font-bold bg-amber-500/90 text-[#3b2503] shadow-lg animate-pulse">
            <Icon name="circle" class="mr-1" />{t('form.mf_unsaved')}
          </span>
        )}
      </div>

      <main class="max-w-[600px] mx-auto px-4 -mt-8 relative z-20">
        <div class="bg-surface/95 border border-line rounded-3xl p-6 shadow-2xl">
          {/* Stepper */}
          <div class="flex justify-between items-center relative mb-8">
            <div class="absolute top-[15px] left-[10%] right-[10%] h-[2px] bg-line z-[1]"></div>
            {STEPS.map((s, i) => {
              const num = i + 1;
              const isActive = step === num;
              const done = step > num;
              return (
                <div class="relative z-[2] flex flex-col items-center gap-1 w-[20%]">
                  <div class={`w-8 h-8 rounded-full flex justify-center items-center text-xs font-extrabold transition border-2 ${done ? 'bg-[#0284c7] border-[#0284c7] text-white' : isActive ? 'bg-[#38bdf8] border-[#38bdf8] text-[#020617] shadow-[0_0_15px_rgba(56,189,248,.4)]' : 'bg-surface-raised border-line text-fg-subtle'}`}>
                    <Icon name={s.icon} />
                  </div>
                  <div class={`text-[11px] font-extrabold text-center transition ${isActive || done ? 'text-accent-sky' : 'text-fg-subtle'}`}>{t(s.key)}</div>
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
              <h2 class="section-title">{t("master.section_identitas")}</h2>
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

              <h2 class="section-title mt-6">{t("form.mf_kontak")}</h2>
              <F label={t("form.mf_alamat")} k="alamat" ph={t("form.mf_ph_auto_jp")} rows={2} />
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
              <h2 class="section-title">{t("master.section_medis")}</h2>
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
              <F label={t("form.mf_penyakit")} k="penyakit" ph={t("form.mf_ph_deskripsi")} rows={2} />
              <F label={t("form.mf_alergi")} k="alergi" ph={t("form.mf_ph_alergi")} rows={2} />
              <F label={t("form.mf_laka")} k="laka" ph={t("form.mf_ph_deskripsi")} rows={2} />

              <h2 class="section-title mt-6">{t("form.mf_wawancara")}</h2>
              <F label={t("form.mf_promosi")} k="promosi" ph={t("form.mf_ph_promosi")} rows={3} />
              <F label={t("form.mf_kelebihan")} k="kelebihan" ph={t("form.mf_ph_kelebihan")} />
              <F label={t("form.mf_kekurangan")} k="kekurangan" ph={t("form.mf_ph_kekurangan")} />
              <F label={t("form.mf_keahlian")} k="keahlianKhusus" ph={t("form.mf_ph_keahlian")} />
              <F label={t("form.mf_hobi")} k="hobi" ph={t("form.mf_ph_hobi")} />
              <F label={t("form.mf_alasan_bidang")} k="alasanBidang" rows={2} />
              <F label={t("form.mf_motivasi")} k="motivasiJepang" rows={2} />
              <F label={t("form.mf_keinginan")} k="keinginan" rows={2} />
              <F label={t("form.mf_rencana_pulang")} k="rencanaPulang" rows={2} />
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
              <h2 class="section-title">{t("form.mf_riwayat_pendidikan")}</h2>
              {eduList.map((edu, i) => (
                <div class="p-3 rounded-xl mb-3 bg-surface-raised border border-dashed border-line">
                  <div class="flex justify-between items-center mb-2">
                    <span class="text-[11px] font-extrabold text-fg-muted">Pendidikan #{i + 1}</span>
                    {eduList.length > 1 && <button onClick={() => setEduList(l => l.filter((_, j) => j !== i))} class="text-rose-400 text-[11px] font-bold"><Icon name="trash" class="mr-1" />{t("button.delete")}</button>}
                  </div>
                  <div class="grid grid-cols-2 gap-3">
                    <div class="mb-3"><label class="label" for={`mf-edu-jenjang-${i}`}>{t("master.edu_jenjang")}</label>
                      <select class="input" id={`mf-edu-jenjang-${i}`} value={edu.jenjang} onChange={(e) => { const v = [...eduList]; v[i].jenjang = (e.target as HTMLSelectElement).value; setEduList(v); }}>
                        <option value="">{t("form.mf_pilih")}</option><option value="SD">SD</option><option value="SMP">SMP</option><option value="SMA/SMK">{t("master.edu_sma")}</option><option value="D3">D3</option><option value="S1">S1</option><option value="S2">S2</option>
                      </select>
                    </div>
                    <div class="mb-3"><label class="label" for={`mf-edu-nama-${i}`}>{t("master.edu_sekolah")}</label>
                      <input class="input" id={`mf-edu-nama-${i}`} value={edu.nama} onInput={(e) => { const v = [...eduList]; v[i].nama = (e.target as HTMLInputElement).value; setEduList(v); }} /></div>
                    <div class="mb-3"><label class="label" for={`mf-edu-thn-awal-${i}`}>{t("master.edu_tahun_awal")}</label>
                      <input class="input" id={`mf-edu-thn-awal-${i}`} type="number" value={edu.thnAwal} onInput={(e) => { const v = [...eduList]; v[i].thnAwal = (e.target as HTMLInputElement).value; setEduList(v); }} /></div>
                    <div class="mb-3"><label class="label" for={`mf-edu-thn-akhir-${i}`}>{t("master.edu_tahun_akhir")}</label>
                      <input class="input" id={`mf-edu-thn-akhir-${i}`} type="number" value={edu.thnAkhir} onInput={(e) => { const v = [...eduList]; v[i].thnAkhir = (e.target as HTMLInputElement).value; setEduList(v); }} /></div>
                    <ManualSelect id={`mf-edu-jurusan-${i}`} label={t("master.edu_jurusan")} list={JURUSAN}
                      value={edu.jurusan} manual={edu.jurusanManual}
                      onChange={(p) => { const v = [...eduList]; v[i] = { ...v[i], jurusan: p.value === SENTINEL_LAINNYA ? SENTINEL_LAINNYA : p.value, jurusanManual: p.manual }; setEduList(v); }} />
                    <div class="mb-3"><label class="label" for={`mf-edu-alamat-${i}`}>{t("master.edu_alamat")}</label>
                      <input class="input" id={`mf-edu-alamat-${i}`} value={edu.alamat} onInput={(e) => { const v = [...eduList]; v[i].alamat = (e.target as HTMLInputElement).value; setEduList(v); }} /></div>
                  </div>
                </div>
              ))}
              {eduList.length < 5 && <button onClick={() => setEduList(l => [...l, { jenjang:'', nama:'', thnAwal:'', thnAkhir:'', jurusan:'', jurusanManual:'', alamat:'' }])} class="text-sky-400 text-xs font-bold mb-6"><Icon name="plus" class="mr-1" />{t("master.edu_tambah")}</button>}

              <h2 class="section-title mt-6">{t("form.mf_riwayat_pekerjaan")}</h2>
              {jobList.map((job, i) => (
                <div class="p-3 rounded-xl mb-3 bg-surface-raised border border-dashed border-line">
                  <div class="flex justify-between items-center mb-2">
                    <span class="text-[11px] font-extrabold text-fg-muted">Pekerjaan #{i + 1}</span>
                    {jobList.length > 1 && <button onClick={() => setJobList(l => l.filter((_, j) => j !== i))} class="text-rose-400 text-[11px] font-bold"><Icon name="trash" class="mr-1" />{t("button.delete")}</button>}
                  </div>
                  <div class="grid grid-cols-2 gap-3">
                    <div class="mb-3"><label class="label" for={`mf-job-perusahaan-${i}`}>{t("master.kerja_perusahaan")}</label>
                      <input class="input" id={`mf-job-perusahaan-${i}`} value={job.perusahaan} onInput={(e) => { const v = [...jobList]; v[i].perusahaan = (e.target as HTMLInputElement).value; setJobList(v); }} /></div>
                    <ManualSelect id={`mf-kerja-jabatan-${i}`} label={t("master.kerja_jabatan")} list={PEKERJAAN}
                      value={job.jabatan} manual={job.jabatanManual}
                      onChange={(p) => { const v = [...jobList]; v[i] = { ...v[i], jabatan: p.value, jabatanManual: p.manual }; setJobList(v); }} />
                    <div class="mb-3"><label class="label" for={`mf-job-thn-awal-${i}`}>{t("master.edu_tahun_awal")}</label>
                      <input class="input" id={`mf-job-thn-awal-${i}`} type="number" value={job.thnAwal} onInput={(e) => { const v = [...jobList]; v[i].thnAwal = (e.target as HTMLInputElement).value; setJobList(v); }} /></div>
                    <div class="mb-3"><label class="label" for={`mf-job-thn-akhir-${i}`}>{t("master.edu_tahun_akhir")}</label>
                      <input class="input" id={`mf-job-thn-akhir-${i}`} type="number" value={job.thnAkhir} onInput={(e) => { const v = [...jobList]; v[i].thnAkhir = (e.target as HTMLInputElement).value; setJobList(v); }} /></div>
                    <div class="mb-3"><label class="label" for={`mf-job-gaji-${i}`}>Gaji</label>
                      <input class="input" id={`mf-job-gaji-${i}`} value={job.gaji} onInput={(e) => { const v = [...jobList]; v[i].gaji = (e.target as HTMLInputElement).value; setJobList(v); }} /></div>
                    <div class="mb-3"><label class="label" for={`mf-job-alasan-${i}`}>{t("master.kerja_alasan")}</label>
                      <input class="input" id={`mf-job-alasan-${i}`} value={job.alasan} onInput={(e) => { const v = [...jobList]; v[i].alasan = (e.target as HTMLInputElement).value; setJobList(v); }} /></div>
                  </div>
                </div>
              ))}
              {jobList.length < 3 && <button onClick={() => setJobList(l => [...l, { perusahaan:'', jabatan:'', jabatanManual:'', thnAwal:'', thnAkhir:'', gaji:'', alasan:'' }])} class="text-sky-400 text-xs font-bold"><Icon name="plus" class="mr-1" />{t("master.kerja_tambah")}</button>}
            </div>
          )}

          {/* ═══ STEP 4: KELUARGA ═══ */}
          {step === 4 && (
            <div class="animate-[fadeIn_.4s_ease]">
              <h2 class="section-title">{t("master.fam_title")}</h2>
              {famList.map((fam, i) => (
                <div class="p-3 rounded-xl mb-3 bg-surface-raised border border-dashed border-line">
                  <div class="flex justify-between items-center mb-2">
                    <span class="text-[11px] font-extrabold text-fg-muted">{t("master.fam_member")} #{i + 1}</span>
                    {famList.length > 1 && <button onClick={() => setFamList(l => l.filter((_, j) => j !== i))} class="text-rose-400 text-[11px] font-bold"><Icon name="trash" class="mr-1" />{t("button.delete")}</button>}
                  </div>
                  <div class="grid grid-cols-2 gap-3">
                    <div class="mb-3"><label class="label" for={`mf-fam-nama-${i}`}>{t("form.mf_nama_keluarga")}</label>
                      <input class="input" id={`mf-fam-nama-${i}`} value={fam.nama} onInput={(e) => { const v = [...famList]; v[i].nama = (e.target as HTMLInputElement).value; setFamList(v); }} /></div>
                    <div class="mb-3"><label class="label" for={`mf-fam-hubungan-${i}`}>{t("master.fam_hubungan")}</label>
                      {/* PARITY: legacy memakai nilai UPPERCASE (AYAH/IBU/…) dan
                          TANPA sentinel. Sebelumnya form ini memakai TitleCase,
                          sehingga hubungan yang disimpan dari sini tidak akan
                          pernah cocok dengan data legacy untuk orang yang sama.

                          `withEmpty`, BUKAN `withOther`: baris keluarga tidak
                          punya kotak teks manual, dan payload mengirim
                          `hubungan` apa adanya (tanpa `resolveRow`). Dengan
                          `withOther` kandidat bisa memilih "Lainnya" lalu yang
                          tersimpan adalah string literal `__LAINNYA__`. */}
                      <select class="input" id={`mf-fam-hubungan-${i}`} value={fam.hubungan} onChange={(e) => { const v = [...famList]; v[i].hubungan = (e.target as HTMLSelectElement).value; setFamList(v); }}>
                        {withEmpty(HUBUNGAN_KELUARGA, fam.hubungan).map(([val, lab]) => <option value={val}>{lab}</option>)}
                      </select>
                    </div>
                    <div class="mb-3"><label class="label" for={`mf-fam-usia-${i}`}>{t("ui.cv_usia")}</label>
                      <input class="input" id={`mf-fam-usia-${i}`} type="number" value={fam.usia} onInput={(e) => { const v = [...famList]; v[i].usia = (e.target as HTMLInputElement).value; setFamList(v); }} /></div>
                    <ManualSelect id={`mf-fam-pekerjaan-${i}`} label={t("master.fam_pekerjaan")} list={PEKERJAAN}
                      value={fam.pekerjaan} manual={fam.pekerjaanManual}
                      onChange={(p) => { const v = [...famList]; v[i] = { ...v[i], pekerjaan: p.value, pekerjaanManual: p.manual }; setFamList(v); }} />
                  </div>
                </div>
              ))}
              {famList.length < 5 && <button onClick={() => setFamList(l => [...l, { nama:'', hubungan:'', usia:'', pekerjaan:'', pekerjaanManual:'' }])} class="text-sky-400 text-xs font-bold mb-6"><Icon name="plus" class="mr-1" />{t("master.fam_tambah")}</button>}

              <h2 class="section-title mt-6">{t("master.darurat_title")}</h2>
              <div class="p-4 rounded-xl bg-surface-raised border border-sky-500/30">
                <div class="mb-3"><label class="label" for={`mf-darurat-nama`}>{t("master.darurat_nama")}</label>
                  <input class="input" id={`mf-darurat-nama`} value={daruratNama} onInput={(e) => setDaruratNama((e.target as HTMLInputElement).value)} /></div>
                <div class="grid grid-cols-2 gap-3">
                  <div class="mb-3"><label class="label" for={`mf-darurat-hubungan`}>{t("master.fam_hubungan")}</label>
                    <input class="input" id={`mf-darurat-hubungan`} value={daruratHubungan} placeholder={t("master.ph_istri_ortu")} onInput={(e) => setDaruratHubungan((e.target as HTMLInputElement).value)} /></div>
                  <div class="mb-3"><label class="label" for={`mf-darurat-wa`}>{t("master.darurat_wa")}</label>
                    <input class="input" id={`mf-darurat-wa`} type="number" value={daruratWa} onInput={(e) => setDaruratWa((e.target as HTMLInputElement).value)} /></div>
                </div>
              </div>

              <h2 class="section-title mt-6">{t("master.kenalan_title")}</h2>
              <div class="p-4 rounded-xl bg-surface-raised border border-dashed border-line">
                <div class="grid grid-cols-2 gap-3">
                  <div class="mb-3"><label class="label" for={`mf-kenalan-nama`}>{t("master.kenalan_nama")}</label>
                    <input class="input" id={`mf-kenalan-nama`} value={kenalan.nama} placeholder={t("master.ph_kosongkan")} onInput={(e) => setKenalan(k => ({ ...k, nama: (e.target as HTMLInputElement).value }))} /></div>
                  <div class="mb-3"><label class="label" for={`mf-kenalan-usia`}>{t("ui.cv_usia")}</label>
                    <input class="input" id={`mf-kenalan-usia`} type="number" value={kenalan.usia} placeholder={t("ui.ph_misal_30")} onInput={(e) => setKenalan(k => ({ ...k, usia: (e.target as HTMLInputElement).value }))} /></div>
                  <div class="mb-3"><label class="label" for={`mf-kenalan-hubungan`}>{t("master.fam_hubungan")}</label>
                    <input class="input" id={`mf-kenalan-hubungan`} value={kenalan.hubungan} placeholder={t("master.ph_teman_saudara")} onInput={(e) => setKenalan(k => ({ ...k, hubungan: (e.target as HTMLInputElement).value }))} /></div>
                  <div class="mb-3"><label class="label" for={`mf-kenalan-pekerjaan`}>{t("master.fam_pekerjaan")}</label>
                    <input class="input" id={`mf-kenalan-pekerjaan`} value={kenalan.pekerjaan} placeholder={t("master.ph_karyawan_mahasiswa")} onInput={(e) => setKenalan(k => ({ ...k, pekerjaan: (e.target as HTMLInputElement).value }))} /></div>
                </div>
                <div class="mb-3"><label class="label" for={`mf-kenalan-alamat`}>{t("master.kenalan_alamat")}</label>
                  <input class="input" id={`mf-kenalan-alamat`} value={kenalan.alamat} placeholder={t("master.ph_kota_prefektur")} onInput={(e) => setKenalan(k => ({ ...k, alamat: (e.target as HTMLInputElement).value }))} /></div>
              </div>
            </div>
          )}

          {/* ═══ STEP 5: DOKUMEN ═══ */}
          {step === 5 && (
            <div class="animate-[fadeIn_.4s_ease]">
              <h2 class="section-title">{t("master.status_passport")}</h2>
              <F label={t("form.mf_eks_jepang")} k="eksJepang" opts={['BELUM PERNAH','EKS MAGANG','EKS TOKUTEI GINO']} />
              <F label={t("form.mf_no_coe")} k="noCoe" ph={t("master.ph_kosongkan")} />
              <div class="mt-4"></div>
              <F label={t("form.mf_no_paspor")} k="noPaspor" ph={t("master.ph_kosongkan_belum")} />
              <div class="grid grid-cols-2 gap-3">
                <F label={t("form.mf_tgl_terbit")} k="tglTerbitPaspor" type="date" twoCol />
                <F label={t("form.mf_exp")} k="expPaspor" type="date" twoCol />
              </div>
              {/* C09: kota terbit paspor punya jawaban pasti (kota di Indonesia),
                  jadi tidak perlu diketik manual. Legacy menyimpan nilai ini
                  UPPERCASE (`.toUpperCase()`), dan `KOTA` memang UPPERCASE.
                  Kota di luar daftar tetap bisa diisi lewat sentinel "Lainnya".
                  `value` menyimpan NILAI AKHIR (yang dikirim ke server);
                  `kotaPasporManual` hanya menampung ketikan di kotak manual —
                  dan itu yang diutamakan saat menyimpan (lihat `resolveRow`). */}
              <ManualSelect id="mf-kota-paspor" label={t("form.mf_kota_paspor")} list={KOTA}
                value={data.kotaPaspor} manual={kotaPasporManual}
                onChange={(p) => { upd("kotaPaspor", p.value); setKotaPasporManual(p.manual); }} />

              <h2 class="section-title mt-6">{t("form.mf_sertifikasi")}</h2>
              <div class="grid grid-cols-2 gap-3">
                <F label={t("form.mf_bhs_jepang")} k="bhsJepang" opts={['-','N1','N2','N3','N4','N5','JFT BASIC A2','BELUM LULUS','BELUM TES']} twoCol />
                <F label={t("form.mf_nilai")} k="nilai" ph="Misal: 120/180" twoCol />
              </div>
              <SswField label={t("form.mf_lisensi")} k="lisensi" kManual="lisensiManual" labelManual={t("master.ketik_bidang")} />
              <SswField label={t("form.mf_ssw2")} k="lisensi2" kManual="lisensi2Manual" labelManual={t("master.ketik_bidang2")} />

              <h2 class="section-title mt-6">{t("master.upload_doc_max")}</h2>
              {[
                { k: 'photo', label: 'PAS PHOTO (JPG/PNG)', icon: 'fa-camera', accept: '.jpg,.jpeg,.png' },
                { k: 'jft', label: 'SERTIFIKAT JFT (PDF)', icon: 'fa-file-pdf', accept: '.pdf' },
                { k: 'ssw', label: 'SERTIFIKAT SSW (PDF)', icon: 'fa-file-signature', accept: '.pdf' },
                // PARITY legacy master-full.html: enam dokumen ini menerima
                // .pdf,image/* — kandidat sering hanya punya foto/scan, dan
                // sebelumnya `accept=".pdf"` membuatnya tidak bisa diunggah.
                { k: 'ijazahSd', label: 'IJAZAH SD (PDF/JPG)', icon: 'fa-graduation-cap', accept: '.pdf,image/*' },
                { k: 'ijazahSmp', label: 'IJAZAH SMP (PDF/JPG)', icon: 'fa-graduation-cap', accept: '.pdf,image/*' },
                { k: 'ijazahSma', label: 'IJAZAH SMA (PDF/JPG)', icon: 'fa-graduation-cap', accept: '.pdf,image/*' },
                { k: 'univ', label: 'IJAZAH UNIVERSITAS (PDF/JPG)', icon: 'fa-university', accept: '.pdf,image/*' },
                { k: 'ktpFile', label: 'KTP (PDF/JPG)', icon: 'fa-id-card', accept: '.pdf,image/*' },
                { k: 'kk', label: 'KK (PDF/JPG)', icon: 'fa-users', accept: '.pdf,image/*' },
              ].map(doc => (
                <div class="flex justify-between items-center p-4 rounded-2xl mb-4 bg-surface-raised border border-line">
                  <div>
                    <div class="text-xs font-extrabold text-fg">{doc.label}</div>
                    <div class="text-[11px] mt-1 text-fg-muted" style={{ wordBreak: 'break-all' }}>{fileNames[doc.k] || 'Belum ada file'}</div>
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
      <div class="fixed bottom-0 left-0 w-full py-4 px-5 z-50 flex justify-between gap-4 bg-canvas/95 border-t border-line">
        {step > 1 && <button onClick={() => changeStep(-1)} class="flex-1 py-4 rounded-[14px] text-[13px] font-extrabold bg-surface-raised text-fg-muted"><Icon name="arrow-left" class="mr-1" /> {t("button.back")}</button>}
        <button onClick={() => submitMaster(true)} class="flex-1 py-4 rounded-[14px] text-[13px] font-extrabold text-white" style={{ background: '#d97706' }}><Icon name="save" class="mr-1" /> Draft</button>
        {step < 5 && <button onClick={() => changeStep(1)} class="flex-1 py-4 rounded-[14px] text-[13px] font-extrabold" style={{ background: '#38bdf8', color: '#020617', boxShadow: '0 5px 15px rgba(56,189,248,.3)' }}>{t("master.next")} <Icon name="arrow-right" class="ml-1" /></button>}
        {step === 5 && <button onClick={() => submitMaster(false)} disabled={saving} class="flex-1 py-4 rounded-[14px] text-[13px] font-extrabold text-white disabled:opacity-50" style={{ background: '#10b981', color: '#020617', boxShadow: '0 5px 15px rgba(16,185,129,.3)' }}>{saving ? 'Menyimpan...' : 'Simpan Final'}</button>}
      </div>

      {/* P3 §4.1 #6 — overlay "Menyinkronkan Data…" (legacy #loading).
          Legacy memakai `bg-black/85`; di sini `bg-canvas/92` supaya ikut
          bertema terang, konsisten dengan perbaikan §3 yang memindahkan form
          ini dari warna gelap hardcode ke token semantik. */}
      {syncing && (
        <div class="fixed inset-0 z-[9999] flex items-center justify-center bg-canvas/92" role="status" aria-live="polite">
          <div class="text-center">
            <div class="w-[70px] h-[70px] rounded-full border-4 border-line border-t-accent-sky mx-auto animate-spin"></div>
            <h2 class="mt-5 text-lg font-extrabold text-fg">{t('form.mf_sync')}</h2>
          </div>
        </div>
      )}
    </div>
  );
}
