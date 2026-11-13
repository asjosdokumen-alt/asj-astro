/** Supported CV template output formats */
export type TemplateType = 'rirekisho' | 'docx' | 'xlsx' | 'pdf';

/** Context passed to every template renderer */
export interface RenderContext {
  waTarget: string;
  isAdmin: boolean;
  templateId?: string;
  locale?: 'id' | 'jp';
}

/** Result of rendering a template */
export interface RenderResult {
  success: boolean;
  mimeType: string;
  fileName: string;
  blob?: Blob;
  html?: string;
  error?: string;
}

/**
 * Normalized candidate data available to ALL templates
 *
 * ── FIELD YANG SUDAH SIAP TETAPI BELUM DICETAK ──────────────────────────────
 * Sebagian jawaban sudah mengalir sampai objek ini padahal belum ada template
 * yang mencetaknya. Kalau Anda menulis template BARU dan modelnya membutuhkan
 * salah satu field di bawah, cukup baca field itu di `buildValues` — tidak ada
 * migrasi, kolom, atau perubahan form yang perlu menyusul:
 *
 *   `pekerjaan[i].alasan` — "Alasan Berhenti" / 退職理由 (migrasi 057).
 *     Form Master merender inputnya, CV AI mengumpulkannya, `buildMasterNested`
 *     mengembalikannya. Kelima aset template yang ada TIDAK punya sel berlabel
 *     退職理由 (terukur 2026-11-13: 0 kemunculan di kelima berkas), jadi
 *     nilainya memang belum pernah tercetak — bukan karena datanya hilang.
 *
 * Penjaganya `e2e/form-column-parity.test.ts` (`PREPARED_NOT_PRINTED`): selama
 * belum ada yang mencetak, tes memastikan kolomnya tetap bisa diisi form. Begitu
 * satu renderer membacanya, tes itu MERAH dan entri tersebut wajib dipindah ke
 * cakupan biasa — supaya daftar "siap pakai" tidak pernah jadi tempat sampah.
 */
export interface CandidateData {
  identitas: Record<string, unknown>;
  fisik: Record<string, unknown>;
  medis: Record<string, unknown>;
  pendidikan: Array<Record<string, unknown>>;
  /** `alasan` (退職理由) sudah tersedia di tiap baris — lihat catatan di atas. */
  pekerjaan: Array<Record<string, unknown>>;
  keluarga: Array<Record<string, unknown>>;
  sertifikasi: Record<string, unknown>;
  wawancara: Record<string, unknown>;
  kenalan_jepang: Record<string, unknown>;
  uploads: Record<string, unknown>;
  raw: Record<string, unknown>; // original flat row from getDrafCvMaster
}

/** Template definition contract */
export interface CvTemplate {
  id: string;
  name: string;
  type: TemplateType;
  description?: string;
  category: 'resume' | 'form' | 'report' | 'custom';
  icon?: string;
  /**
   * Tampil di `CvTemplateSelector`? Default `true`.
   *
   * `false` = template tetap terdaftar (bisa dipanggil `cvFactory.render(id)` dan
   * tetap diuji) tapi TIDAK ditawarkan ke admin. Dipakai 2026-10-26 untuk empat
   * template lama yang ternyata tidak menghasilkan CV yang dipakai: pilihan di
   * modal jadi dua form Excel yang benar-benar dicetak, tanpa menghapus kode
   * yang mungkin masih dirujuk.
   */
  listed?: boolean;
  render(data: CandidateData, context: RenderContext): Promise<RenderResult>;
}