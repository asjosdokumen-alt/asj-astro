/* 🔴 REGISTRASI 5 RENDERER BAWAAN ADALAH SIDE EFFECT — impor ini WAJIB.
 *
 * `./templates` memanggil `cvFactory.register(...)` lima kali saat modulnya
 * dievaluasi. Tanpa impor di bawah, `cvFactory.list()` mengembalikan array
 * KOSONG: modal "Pilih Template CV" tampil tanpa satu pun pilihan, walaupun
 * kelima renderer masih ada, lulus tes, dan `templates.test.ts` hijau.
 *
 * Itu persis regresi 2026-11-12: `aca84be` menghapus satu-satunya berkas yang
 * mengimpor `./templates` (ia memakainya untuk `decodeTemplateRecord`), dan
 * tidak ada tes yang merah — `templates.test.ts` mengimpor `./templates`
 * langsung, sedangkan `CvTemplateSelector.test.tsx` MEM-MOCK `cvFactory`.
 *
 * Diletakkan di ENTRI, bukan di komponen: setiap pemakai `cvFactory` harus
 * mendapat daftar yang terisi. Entri ini hanya diimpor `CvTemplateSelector`,
 * jadi bundle lain tidak ikut menggemuk. Penjaganya: `templates.test.ts`
 * mengimpor `cvFactory` dari `./index` (bukan `./templates`) — kalau baris ini
 * hilang, daftarnya kosong dan tesnya merah.
 */
import './templates';
export { cvFactory } from './factory';
export { xlsxPreviewHtml } from './preview';
export type { CvTemplate, CandidateData, RenderContext, RenderResult, TemplateType } from './types';
export { normalizeMasterData } from './data';
/* Hanya jalur "isi berkas sendiri" yang masih hidup: pengguna memilih .xlsx /
   .docx / .pdf lalu nilainya ditulis ke `{{placeholder}}`. Fitur "unggah
   template lalu analisa" (peta sel dipelajari dari contoh) DIHENTIKAN pemilik
   2026-11-12 — hasil parse-nya tidak bisa dipercaya dan biayanya mahal. */
export {
  loadExcelTemplate,
  loadDocxTemplate,
  loadPdfTemplate,
  flattenDataForPlaceholders,
  readWorkbook,
} from './loaders/tEMPLATE-loader';
export type { ExcelTemplateOptions } from './loaders/tEMPLATE-loader';
