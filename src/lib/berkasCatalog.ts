/**
 * berkasCatalog.ts — Katalog dokumen pemberkasan (shared).
 *
 * Satu-satunya sumber kebenaran untuk daftar berkas modal "Pusat Pemberkasan"
 * (admin + kandidat self-service) DAN progres pemberkasan di dashboard
 * kandidat. Dibuat pada crosscheck A05 (2026-09-04) karena dua tempat itu
 * sebelumnya menduplikasi daftar dengan kode `jenisBerkas` yang BEDA dari
 * token backend — akibatnya sebagian besar dokumen di-upload ke Cloudinary
 * lalu di-ignore backend (tidak pernah di-persist ke kolom *_url).
 *
 * `jenis` = token FILE_LABEL_COLUMNS backend (contexts/documents/service.ts,
 * handler simpanBerkasTahapan). `key` = kunci pemberkasan_checklist/master
 * pendek (objek candidate.berkas dari attachBerkasBio). `label` = kunci i18n.
 */
export interface BerkasDef {
  /** Kunci pendek berkas (candidate.berkas[key], kolom *_url). */
  key: string;
  /** Token kanonik yang dikirim sebagai jenisBerkas ke backend. */
  jenis: string;
  /** Kunci i18n untuk label. */
  label: string;
  /** Ekstensi yang diterima input file. */
  accept: string;
  /** Dokumen "wajib/amber" (KTP & foto). */
  amber?: boolean;
}

export const BERKAS_TAHAP1: BerkasDef[] = [
  { key: "kk", jenis: "KK", label: "candidate.form_kk", accept: ".pdf" },
  { key: "akte", jenis: "AKTE", label: "candidate.form_akte", accept: ".pdf" },
  { key: "sd", jenis: "IJAZAH SD", label: "candidate.form_sd", accept: ".pdf" },
  { key: "smp", jenis: "IJAZAH SMP", label: "candidate.form_smp", accept: ".pdf" },
  { key: "sma", jenis: "IJAZAH SMA", label: "candidate.form_sma", accept: ".pdf" },
  { key: "univ", jenis: "UNIVERSITAS", label: "candidate.form_univ", accept: ".pdf" },
  { key: "pasport", jenis: "PASPORT", label: "candidate.form_passport", accept: ".pdf" },
  { key: "mcu", jenis: "MCU", label: "ui.doc7_mcu", accept: ".pdf" },
  { key: "kontrak", jenis: "KONTRAK", label: "ui.doc8_contract", accept: ".pdf" },
  { key: "cert", jenis: "SERTIFIKAT", label: "ui.doc9_cert_japan", accept: ".pdf" },
  { key: "ktp", jenis: "KTP", label: "ui.doc10_ktp", accept: ".pdf,.jpg,.jpeg,.png", amber: true },
  { key: "foto2", jenis: "FOTO 2X3", label: "candidate.form_photo", accept: ".jpg,.jpeg,.png", amber: true },
];

export const BERKAS_TAHAP2: BerkasDef[] = [
  { key: "ijinortu", jenis: "IZIN ORTU", label: "candidate.form_parent_permit", accept: ".pdf" },
  { key: "cpmi", jenis: "CPMI", label: "candidate.form_cpmi", accept: ".pdf" },
  { key: "kawin", jenis: "BUKU NIKAH", label: "candidate.form_marital", accept: ".pdf" },
  { key: "sehat", jenis: "SURAT SEHAT", label: "ui.doc4_health", accept: ".pdf" },
  { key: "bpjs", jenis: "BPJS", label: "candidate.form_bpjs", accept: ".pdf" },
  { key: "psikotes", jenis: "PSIKOTES", label: "candidate.form_psikotes", accept: ".pdf" },
];

export const ALL_BERKAS: BerkasDef[] = [...BERKAS_TAHAP1, ...BERKAS_TAHAP2];

/** key pendek → def (buat checklist/progres tanpa loop manual). */
export const BERKAS_BY_KEY: Record<string, BerkasDef> = Object.fromEntries(
  ALL_BERKAS.map((d) => [d.key, d]),
);

/** Dokumen dianggap sudah ada bila URL bukan placeholder ('-', 'null'). */
export function hasBerkasUrl(v: string | undefined | null): boolean {
  return !!v && v !== "-" && v !== "undefined" && v !== "null";
}

/**
 * Ekstensi file (tanpa titik, lowercase) dari atribut `accept`.
 * Parity legacy `ekstensiDariAccept()`: `".pdf,.jpg"` → `["pdf","jpg"]`.
 * Entri MIME (`image/*`) dibuang — katalog ini hanya memakai ekstensi.
 */
export function extensionsFromAccept(accept: string): string[] {
  return String(accept || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.startsWith("."))
    .map((s) => s.slice(1));
}

/** Ekstensi nama file, lowercase, tanpa titik. `"a.PDF"` → `"pdf"`. */
export function extensionOf(filename: string): string {
  const name = String(filename || "");
  const idx = name.lastIndexOf(".");
  if (idx < 0 || idx === name.length - 1) return "";
  return name.slice(idx + 1).toLowerCase();
}

/**
 * Cek ekstensi file terhadap `accept` dokumen.
 *
 * PARITY: legacy `prosesUploadPemberkasan` memanggil `cekUkuranFile` DAN
 * `cekEkstensiFile` untuk SETIAP input sebelum upload. Modal Astro hanya
 * memeriksa ukuran, sehingga file dengan tipe salah (mis. `.docx` di slot yang
 * minta `.pdf`) tetap ter-upload dan tersimpan sebagai dokumen rusak.
 *
 * Mengembalikan nama file yang ditolak, atau null bila lolos. File tanpa
 * ekstensi ditolak bila dokumen tidak mengizinkan ekstensi kosong.
 */
export function rejectExtension(def: BerkasDef, filename: string): string | null {
  const allowed = extensionsFromAccept(def.accept);
  if (!allowed.length) return null;
  const ext = extensionOf(filename);
  return allowed.includes(ext) ? null : filename;
}

