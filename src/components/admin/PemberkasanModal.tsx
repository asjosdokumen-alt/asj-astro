/**
 * PemberkasanModal.tsx — Modal "Pusat Pemberkasan" (Tahap 1, Tahap 2, Biodata).
 *
 * A05 parity cross-check (2026-09-04) terhadap legacy
 * partials/modals-shared.html `#modal-pemberkasan` + js/03_candidate.ts
 * (bukaModalPemberkasan / prosesUploadPemberkasan / prosesSimpanBiodataLengkap).
 *
 * Root bugs yang diperbaiki di sini:
 *   1. jenisBerkas lama mengirim `inp.id.toUpperCase()` ('SD','UNIV','CERT',
 *      'FOTO2', ...) — token itu TIDAK ada di FILE_LABEL_COLUMNS backend, jadi
 *      sebagian besar dokumen ter-upload ke Cloudinary lalu di-ignore backend
 *      (tidak pernah di-persist). Kini memakai `jenis` kanonik dari
 *      src/lib/berkasCatalog.ts.
 *   2. Tombol "Simpan Biodata" memanggil action simpanBiodataLengkap yang
 *      NOT_IMPL di surface → sekarang di-wire ke contexts/master-data dan
 *      dipanggil dengan payload legacy.
 *   3. Tidak ada prefill checklist (Sudah/Belum per dokumen), auto-fill
 *      biodata dari c.bio, gating panel berdasarkan tahapan kandidat, atau
 *      konfirmasi timpa file lama — semuanya di-parity-kan di sini.
 *   4. Upload tanpa retry → serial dengan retry (3x, backoff), seperti legacy.
 */
import { useState, useEffect } from "preact/hooks";
import { authStore } from "../../store/authReactive";
import { t } from "../../store/i18n";
import { uploadBerkasToStorage } from "../../lib/uploadBerkas";
import { apiClient, type ApiError } from "../../lib/apiClient";
import {
  BERKAS_TAHAP1,
  BERKAS_TAHAP2,
  rejectExtension,
  type BerkasDef,
} from "../../lib/berkasCatalog";
import Icon from "../ui/Icon";
import { useOverlay } from "../ui/useOverlay";
import { showToast } from "../Toast";
import DocumentPreviewModal from "../DocumentPreviewModal";

interface CandidateCtx {
  tahapan?: string;
  berkas?: Record<string, string>;
  bio?: Record<string, string>;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  waTarget: string;
  namaTarget: string;
  /** Row kandidat ter-dekorasi (berkas/bio/tahapan) untuk prefill — opsional. */
  candidate?: CandidateCtx | null;
  /** Admin boleh buka semua panel & kandidat mana pun (guard tetap di backend). */
  isAdmin?: boolean;
}

const MAX_FILE_BYTES = 5 * 1024 * 1024;

// Tahapan kandidat → panel yang boleh dibuka — regex sama persis dengan
// legacy bukaModalPemberkasan.
const RE_T1 = /LOLOS|PEMBERKASAN|MCU|MEDICAL|MEDIKAL|PARPOR|PASPOR|PASPORT|MATCH|TERIMA|SIAP/i;
const RE_T2 = /TTD|KONTRAK|VISA|COE|KTKLN|SISKOP|FLIGHT|BERANGKAT|TERBANG|TIKET|E-ID/i;

// Kunci pendek c.bio (attachBerkasBio) → kunci payload simpanBiodataLengkap.
const BIO_SHORT_TO_LONG: Record<string, string> = {
  email: "email",
  tmplahir: "tempat_lahir",
  tgllahir: "tgl_lahir",
  alamat: "alamat_lengkap",
  ayah: "nama_ayah",
  ttlayah: "ttl_ayah",
  ibu: "nama_ibu",
  ttlibu: "ttl_ibu",
  pasport: "no_pasport",
  coe: "no_coe",
  kotapasport: "kota_pasport",
  tglpasport: "tgl_pasport",
  exppasport: "exp_pasport",
  pt: "nama_perusahaan",
  shacou: "nama_shacou",
  telppt: "telp_perusahaan",
  webpt: "web_perusahaan",
  alamatpt: "alamat_perusahaan",
};

const BIO_FIELDS: { field: string; label: string; type?: string; textarea?: boolean; span2?: boolean }[] = [
  { field: "email", label: "candidate.bio_email", type: "email" },
  { field: "tempat_lahir", label: "candidate.bio_pob" },
  { field: "tgl_lahir", label: "candidate.form_dob", type: "date" },
  { field: "alamat_lengkap", label: "candidate.bio_address", textarea: true, span2: true },
  { field: "nama_ayah", label: "candidate.bio_father" },
  { field: "ttl_ayah", label: "candidate.bio_father_dob" },
  { field: "nama_ibu", label: "candidate.bio_mother" },
  { field: "ttl_ibu", label: "candidate.bio_mother_dob" },
  { field: "no_pasport", label: "candidate.bio_pass_num" },
  { field: "no_coe", label: "candidate.bio_coe_num" },
  { field: "kota_pasport", label: "ui.passport_city" },
  { field: "tgl_pasport", label: "candidate.bio_pass_issue", type: "date" },
  { field: "exp_pasport", label: "candidate.bio_pass_exp", type: "date" },
  { field: "nama_perusahaan", label: "candidate.bio_comp_name" },
  { field: "nama_shacou", label: "candidate.bio_shacou" },
  { field: "telp_perusahaan", label: "ui.company_phone" },
  { field: "web_perusahaan", label: "candidate.bio_comp_web" },
  { field: "alamat_perusahaan", label: "candidate.bio_comp_address", textarea: true, span2: true },
];

// Tone panel: class Tailwind literal (dinamis tidak bisa di-purge Tailwind).
const PANEL_TONE: Record<string, { border: string; btn: string; titleIcon: string }> = {
  emerald: {
    border: "border-emerald-500/40",
    btn: "bg-emerald-900/40 font-bold text-emerald-400 hover:bg-emerald-900/60",
    titleIcon: "text-emerald-300",
  },
  sky: {
    border: "border-sky-500/40",
    btn: "bg-sky-900/40 font-bold text-sky-400 hover:bg-sky-900/60",
    titleIcon: "text-sky-300",
  },
  amber: {
    border: "border-amber-500/40",
    btn: "bg-amber-900/40 font-bold text-amber-400 hover:bg-amber-900/60",
    titleIcon: "text-amber-300",
  },
};

// c.bio kadang membawa tanggal legacy DD/MM/YYYY → ISO untuk <input type=date>.
function toIsoDate(v: string): string {
  if (!v) return "";
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(v)) return v.split("/").reverse().join("-");
  return v;
}

function hasUrl(v: string | undefined): boolean {
  return !!v && v !== "-" && v !== "undefined" && v !== "null";
}

// Hoisted ke module scope (TINGGI fix): definisi komponen di dalam body
// komponen membuat identitas tipe berubah tiap render parent, sehingga
// subtree di-unmount/mount ulang setiap setBio — fokus input hilang tiap
// ketikan dan file yang dipilih di input berkas-* ter-reset.
// Semua ketergantungan closure diteruskan via props.
function FileInput({ def, statusNode, disabled }: { def: BerkasDef; statusNode: any; disabled: boolean }) {
  return (
    <div>
      <div class="flex justify-between items-center mb-1">
        <label for={`berkas-${def.key}`} class={`text-xs font-bold ${def.amber ? "text-amber-400" : "text-emerald-300"}`}>
          {t(def.label)}
        </label>
        {statusNode}
      </div>
      <input
        type="file"
        id={`berkas-${def.key}`}
        accept={def.accept}
        disabled={disabled}
        class={`w-full text-xs text-slate-400 file:mr-2 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-bold ${def.amber
          ? "file:bg-amber-900/40 file:text-amber-300"
          : "file:bg-slate-700 file:text-white"
        } disabled:opacity-40`}
      />
    </div>
  );
}

function Panel({
  title,
  icon,
  tone,
  open,
  onToggle,
  children,
}: {
  title: string;
  icon: string;
  tone: keyof typeof PANEL_TONE;
  open: boolean;
  onToggle: () => void;
  children?: any;
}) {
  const c = PANEL_TONE[tone];
  return (
    <div class={`bg-black/40 border ${c.border} rounded-[2rem] overflow-hidden text-left shadow-lg`}>
      <button
        type="button"
        onClick={onToggle}
        class={`w-full p-5 flex justify-between items-center ${c.btn} transition-colors`}
      >
        <span class="text-sm md:text-base">
          <Icon name={icon} class={`mr-2 ${c.titleIcon}`} />
          {title}
        </span>
        <Icon
          name="chevron-down"
          class={`transition-transform duration-300 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div class="p-6 border-t border-slate-700/50 space-y-4">{children}</div>
      )}
    </div>
  );
}

function BioInput({
  field,
  label,
  type = "text",
  textarea,
  span2,
  value,
  onChange,
}: {
  field: string;
  label: string;
  type?: string;
  textarea?: boolean;
  span2?: boolean;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div class={span2 ? "lg:col-span-2" : ""}>
      <label for={`bio-${field}`} class="block text-xs text-slate-400 mb-1 font-bold">{t(label)}</label>
      {textarea ? (
        <textarea
          id={`bio-${field}`}
          rows={2}
          value={value}
          onInput={(e: Event) => onChange((e.target as HTMLTextAreaElement).value)}
          class="w-full p-2.5 rounded-lg bg-black/60 border border-slate-700 text-white text-sm outline-none focus:border-amber-500"
        />
      ) : (
        <input
          id={`bio-${field}`}
          type={type}
          value={value}
          onInput={(e: Event) => onChange((e.target as HTMLInputElement).value)}
          class="w-full p-2.5 rounded-lg bg-black/60 border border-slate-700 text-white text-sm outline-none focus:border-amber-500"
        />
      )}
    </div>
  );
}

function Section({ label }: { label: string }) {
  return (
    <div class="lg:col-span-2 border-b border-slate-700/50 pb-1 mt-2">
      <h4 class="text-sm font-bold text-amber-400">{t(label)}</h4>
    </div>
  );
}


export default function PemberkasanModal({
  isOpen,
  onClose,
  waTarget,
  namaTarget,
  candidate,
  isAdmin,
}: Props) {
  const auth = authStore.get();
  const isAdminRole = isAdmin ?? auth.role === "admin";

  const tahapan = (candidate?.tahapan || "").toString().toUpperCase();
  const isT2Stage = RE_T2.test(tahapan);
  const canT1 = isAdminRole || RE_T1.test(tahapan) || isT2Stage;
  const canT2 = isAdminRole || isT2Stage;
  const canBio = isAdminRole || canT1;
  const locked = !isAdminRole && !canT1 && !canT2 && !canBio;

  const [t1Open, setT1Open] = useState(false);
  const [t2Open, setT2Open] = useState(false);
  const [bioOpen, setBioOpen] = useState(false);
  const [uploading, setUploading] = useState<1 | 2 | null>(null);
  const [savingBio, setSavingBio] = useState(false);
  const [bio, setBio] = useState<Record<string, string>>({});
  // Versi berkas saat modal dibuka — basis cek "file lama" (konfirmasi timpa).
  const [snapshotBerkas, setSnapshotBerkas] = useState<Record<string, string>>({});
  // B03: preview inline (parity legacy setStatusBerkas → bukaPreviewDokumen).
  const [preview, setPreview] = useState<{ url: string; title: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      const prefill: Record<string, string> = {};
      const bioShort = candidate?.bio || {};
      for (const [short, long] of Object.entries(BIO_SHORT_TO_LONG)) {
        const v = bioShort[short];
        if (v !== undefined && v !== null) {
          prefill[long] = long === "tgl_lahir" ? toIsoDate(String(v)) : String(v);
        }
      }
      setBio(prefill);
      setSnapshotBerkas(candidate?.berkas || {});
      setT1Open(canT1);
      setT2Open(canT2 && (isAdminRole || isT2Stage));
      setBioOpen(canBio && !locked);
      setUploading(null);
      setSavingBio(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, waTarget, namaTarget]);

  const { containerRef, onBackdropClick } = useOverlay({ open: isOpen, onClose });

  const refreshAfterChange = () => {
    window.dispatchEvent(new CustomEvent("candidates-changed", { detail: { wa: waTarget } }));
  };

  /**
   * Panggilan surface admin lewat klien.
   *
   * Dulu `fetch` sendiri + `res.json()` tanpa memeriksa `res.ok`, tanpa batas
   * waktu: koneksi macet menggantung selamanya dengan tombol "uploading"
   * menyala. Body-nya juga memakai kunci `args` (server menerimanya lewat
   * `body.payload || body.args`, jadi ini bukan bug — tapi `payload` adalah
   * kunci yang dipakai setiap pemanggil lain).
   *
   * `onSessionInvalid: 'throw'` — panel ini menangani sesi mati SENDIRI (catch
   * di bawah menampilkan pesannya). Default 'logout' akan me-redirect admin
   * keluar dari modal di tengah unggahan multi-berkas.
   * `silent: true` — setiap pemanggil sudah punya toast sendiri
   * ("ui.toast_failed_prefix" + pesan server); tanpa ini satu kegagalan
   * memunculkan dua toast.
   * `requireAuth` dibiarkan default (true): ini aksi admin, sesi wajib.
   */
  const postAction = async (action: string, args: unknown[]) => {
    return apiClient(action, args, { onSessionInvalid: "throw", silent: true });
  };

  const handleUpload = async (tahap: 1 | 2) => {
    if (!waTarget) {
      showToast(t("ui.toast_target_invalid"), "error");
      return;
    }
    const defs = tahap === 1 ? BERKAS_TAHAP1 : BERKAS_TAHAP2;
    const picked: { def: BerkasDef; file: File }[] = [];
    for (const def of defs) {
      const el = document.getElementById(`berkas-${def.key}`) as HTMLInputElement | null;
      const f = el?.files?.[0];
      if (!f) continue;
      // Guard ekstensi (#10, parity legacy cekEkstensiFile). Sebelum ini hanya
      // ukuran yang diperiksa, jadi file dengan tipe salah tetap ter-upload dan
      // tersimpan sebagai dokumen rusak — admin melihat toast sukses.
      const badExt = rejectExtension(def, f.name);
      if (badExt) {
        showToast(t("ui.toast_file_ext_bad").replace("{nama}", badExt), "error");
        continue;
      }
      if (f.size > MAX_FILE_BYTES) {
        showToast(
          t("ui.toast_file_too_big")
            .replace("{nama}", f.name)
            .replace("{mb}", String(MAX_FILE_BYTES / 1024 / 1024)),
          "error",
        );
        continue;
      }
      picked.push({ def, file: f });
    }
    if (!picked.length) {
      showToast(t("ui.toast_pick_min_one"), "error");
      return;
    }

    // Konfirmasi timpa file lama (parity legacy) sebelum upload apa pun.
    const akanDitimpa = picked.filter((p) => hasUrl(snapshotBerkas[p.def.key]));
    if (akanDitimpa.length) {
      const list = akanDitimpa.map((p) => p.def.jenis).join(", ");
      if (!window.confirm(`File berikut sudah ada dan akan DITIMPA: ${list}. Lanjutkan?`)) {
        return;
      }
    }

    setUploading(tahap);
    try {
      let ok = 0;
      let lastErr = "";
      for (const { def, file } of picked) {
        try {
          // Upload ke storage Supabase: untuk role kandidat folder SELALU
          // kandidat/<wa> (dipaksa server); admin memakai master/<NAMA> (parity
          // legacy). Menggantikan uploadToCloudinary (2026-09-08).
          const url = await uploadBerkasToStorage(file, {
            key: def.key,
            folder:
              isAdminRole
                ? "master/" +
                  String(namaTarget || "KANDIDAT")
                    .toUpperCase()
                    .replace(/[^A-Z0-9_-]/g, "_")
                : "kandidat",
          });
          const data = await postAction("simpanBerkasTahapan", [
            {
              wa: waTarget,
              nama: String(namaTarget || "KANDIDAT").toUpperCase(),
              jenisBerkas: def.jenis,
              fileUrl: url,
            },
          ]);
          if (data && data.success) {
            ok++;
            setSnapshotBerkas((prev) => ({ ...prev, [def.key]: url }));
          } else {
            lastErr = `${def.jenis}: ${(data && (data.error || data.message)) || "gagal disimpan"}`;
          }
        } catch (e) {
          lastErr = `${def.jenis}: ${e instanceof Error ? e.message : String(e)}`;
        }
      }
      if (ok > 0) {
        showToast(
          t("ui.toast_uploaded_n").replace("{n}", String(ok)) + t("ui.toast_docs_exclaim"),
          "success",
        );
        refreshAfterChange();
        onClose();
      } else {
        showToast(lastErr || "Gagal mengunggah dokumen.", "error");
      }
    } finally {
      setUploading(null);
    }
  };

  const handleSaveBio = async () => {
    if (!waTarget) return;
    setSavingBio(true);
    try {
      const payload: Record<string, string> = { wa: waTarget, nama: String(namaTarget || "").trim() };
      for (const f of BIO_FIELDS) {
        const v = bio[f.field];
        if (v !== undefined && v !== null) payload[f.field] = String(v).trim();
      }
      const data = await postAction("simpanBiodataLengkap", [payload]);
      if (data && data.success) {
        showToast(t("ui.toast_biodata_saved"), "success");
        refreshAfterChange();
        onClose();
      } else {
        showToast(
          t("ui.toast_failed_prefix") + ((data && (data.error || data.message)) || "gagal simpan"),
          "error",
        );
      }
    } catch (e) {
      // Klien MELEMPAR untuk non-2xx (dulu `res.json()` mengembalikan body dan
      // handler membaca `data.success`). Server yang MENOLAK — ada `.status` —
      // bukan kegagalan jaringan, jadi label "failed" yang lama dipertahankan;
      // hanya transport/abort yang berlabel network_error. Tanpa cabang ini,
      // setiap 400 "VALIDATION_FAILED" akan dilaporkan sebagai network error.
      const err = e as ApiError;
      const msg = err.message || String(e);
      showToast(
        (err.status ? t("ui.toast_failed_prefix") : t("ui.toast_network_error_prefix")) + msg,
        "error",
      );
    } finally {
      setSavingBio(false);
    }
  };

  if (!isOpen) return null;

  // B03: legacy setStatusBerkas → window.bukaPreviewDokumen — preview INLINE
  // dalam modal ("bukan buka tab baru"); Astro lama memakai <a target=_blank>
  // yang membuang admin ke tab baru (PDF sering ter-download di mobile, bukan
  // preview — persis masalah FIX 2026-08-19 legacy dengan gview wrapper).
  const statusMark = (key: string, title: string) => {
    const url = snapshotBerkas[key];
    if (hasUrl(url)) {
      return (
        <button
          type="button"
          onClick={() => setPreview({ url: String(url), title })}
          class="text-emerald-400 hover:text-emerald-300 underline text-[9px] font-bold cursor-pointer"
        >
          <Icon name="check-circle" class="mr-1" />
          {t("ui.uploaded_view")}
        </button>
      );
    }
    return (
      <span class="text-rose-400 text-[9px] font-bold">
        <Icon name="times-circle" class="mr-1" />
        {t("ui.not_yet")}
      </span>
    );
  };

  return (
    <div
      class="fixed inset-0 u-modal-shell bg-black/80 backdrop-blur-md z-[260] flex items-center justify-center p-4"
      ref={containerRef}
      onClick={onBackdropClick}
    >
      <div class="glass-panel p-6 md:p-8 rounded-[2.5rem] w-full max-w-4xl shadow-[0_0_40px_rgba(0,0,0,0.8)] relative max-h-[90vh] u-scroll-area custom-scrollbar">
        <button
          type="button"
          onClick={onClose}
          class="absolute top-6 right-6 text-slate-400 hover:text-white transition z-[100]"
          aria-label={t("public.close")}
        >
          <Icon name="times" class="text-2xl" />
        </button>

        <h3 class="text-xl md:text-2xl font-black text-white mb-2 uppercase tracking-wide border-b border-slate-700/50 pb-4">
          <Icon name="folder-open" class="text-emerald-400 mr-2" />
          {t("ui.berkas_center")}
        </h3>
        <p class="text-sm text-emerald-400 font-bold mb-6">
          {t("ui.candidate_label")}{" "}
          <span class="text-white bg-slate-800 px-2 py-0.5 rounded">
            {String(namaTarget || "").toUpperCase()}
          </span>
          {tahapan && (
            <span class="ml-2 text-[10px] text-slate-400 bg-slate-800/60 px-2 py-0.5 rounded-full border border-slate-700">
              {tahapan}
            </span>
          )}
        </p>

        {locked ? (
          <div class="p-6 text-center bg-rose-950/30 border border-rose-500/30 rounded-2xl">
            <Icon name="lock" class="text-rose-400 text-2xl mb-2" />
            <p class="text-sm font-bold text-rose-300">{t("ui.upload_locked")}</p>
          </div>
        ) : (
          <div class="space-y-4">
            {canT1 && (
              <Panel
                title={t("ui.stage1_short")}
                icon="file-alt"
                tone="emerald"
                open={t1Open}
                onToggle={() => setT1Open(!t1Open)}
              >
                <div class="u-grid-auto u-grid-auto--form gap-5">
                  {BERKAS_TAHAP1.map((def) => (
                    <FileInput key={def.key} def={def} statusNode={statusMark(def.key, t(def.label))} disabled={uploading !== null} />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => handleUpload(1)}
                  disabled={uploading !== null}
                  class="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold shadow-lg transition mt-4 disabled:opacity-50"
                >
                  <Icon name="cloud-upload-alt" class="mr-1" />
                  {uploading === 1 ? t("ui.uploading") : t("ui.upload_berkas_tahap_1")}
                </button>
              </Panel>
            )}

            {canT2 && (
              <Panel
                title={t("ui.stage2_short")}
                icon="plane-departure"
                tone="sky"
                open={t2Open}
                onToggle={() => setT2Open(!t2Open)}
              >
                <div class="u-grid-auto u-grid-auto--form gap-5">
                  {BERKAS_TAHAP2.map((def) => (
                    <FileInput key={def.key} def={def} statusNode={statusMark(def.key, t(def.label))} disabled={uploading !== null} />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => handleUpload(2)}
                  disabled={uploading !== null}
                  class="w-full py-4 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-bold shadow-lg transition mt-4 disabled:opacity-50"
                >
                  <Icon name="cloud-upload-alt" class="mr-1" />
                  {uploading === 2 ? t("ui.uploading") : t("ui.upload_berkas_tahap_2")}
                </button>
              </Panel>
            )}

            {canBio && (
              <Panel
                title={t("candidate.biodata_title")}
                icon="user-edit"
                tone="amber"
                open={bioOpen}
                onToggle={() => setBioOpen(!bioOpen)}
              >
                {/* EXPLICIT grid, not `.u-grid-auto`. MEASURED DEFECT
                    (2026-09-25): at 768px this resolved to
                    `grid-template-columns: 481px 223px` and at 1280px to a
                    ragged `398.656px 398.672px 398.656px` with the span-2
                    children only 817px wide — because the `md:col-span-2`
                    children (the two span2 BioInputs and every Section
                    header) force an IMPLICIT track on `.u-grid-auto` once
                    auto-fit yields fewer tracks than the span needs, and
                    `.u-grid-auto > * { min-width: 0 }` lets it collapse to
                    0px. An explicit grid has a fixed track count and cannot
                    create an implicit one. `lg:` because `--u-grid-min` is
                    24rem = 384px, so the single-track regime extends past
                    `md`. Same remedy as SiswaBaruForm.tsx (commit dc88113). */}
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Section label="candidate.bio_personal" />
                  {BIO_FIELDS.slice(0, 4).map((f) => (
                    <BioInput key={f.field} {...f} value={bio[f.field] || ""} onChange={(v) => setBio({ ...bio, [f.field]: v })} />
                  ))}
                  <Section label="ui.family_data" />
                  {BIO_FIELDS.slice(4, 8).map((f) => (
                    <BioInput key={f.field} {...f} value={bio[f.field] || ""} onChange={(v) => setBio({ ...bio, [f.field]: v })} />
                  ))}
                  <Section label="candidate.bio_passport" />
                  {BIO_FIELDS.slice(8, 13).map((f) => (
                    <BioInput key={f.field} {...f} value={bio[f.field] || ""} onChange={(v) => setBio({ ...bio, [f.field]: v })} />
                  ))}
                  <Section label="ui.company_data" />
                  {BIO_FIELDS.slice(13).map((f) => (
                    <BioInput key={f.field} {...f} value={bio[f.field] || ""} onChange={(v) => setBio({ ...bio, [f.field]: v })} />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleSaveBio}
                  disabled={savingBio || uploading !== null}
                  class="w-full py-4 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold shadow-lg transition mt-4 text-sm disabled:opacity-50"
                >
                  <Icon name="save" class="mr-1" />
                  {savingBio ? t("ui.saving") : t("ui.save_biodata")}
                </button>
              </Panel>
            )}
          </div>
        )}
      </div>
      {preview && (
        <DocumentPreviewModal
          url={preview.url}
          title={preview.title}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}
