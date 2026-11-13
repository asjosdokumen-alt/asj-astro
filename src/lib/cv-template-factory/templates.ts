import { cvFactory } from './factory';
import type { CvTemplate, CandidateData, RenderContext, RenderResult } from './types';
import excelTemplate from './renderers/excel';
import docxTemplate from './renderers/docx';
import pdfTemplate from './renderers/pdf';
import rirekishoXlsxTemplate from './renderers/rirekisho-xlsx';
import rirekishoFirmaTemplate from './renderers/rirekisho-firma';
import kinkiTemplate from './renderers/kinki';
import jipaTemplate from './renderers/jipa';
import rirekishoDetailTemplate from './renderers/rirekisho-detail';
import kaigoHyogoTemplate from './renderers/kaigo-hyogo';

const rirekishoA4Template: CvTemplate = {
  id: 'rirekisho-a4',
  name: 'Rirekisho A4 (Template Asli)',
  type: 'rirekisho',
  description: 'Template CV rirekisho A4 asli yang sudah ada — format tabel Jepang standar',
  category: 'resume',
  icon: 'file-alt',
  // Tidak ditawarkan lagi: pilihannya hanya membuka pratinjau rirekisho yang
  // sudah bisa dibuka dari tombol lain (`onOpenRirekisho`), jadi di modal ia
  // terbaca sebagai template padahal tidak menghasilkan berkas apa pun.
  listed: false,
  async render(_data: CandidateData, _context: RenderContext): Promise<RenderResult> {
    return {
      success: true,
      mimeType: 'text/html',
      fileName: 'CV_Rirekisho_A4.html',
      html: '',
    };
  },
};

cvFactory.register(rirekishoA4Template);
cvFactory.register(excelTemplate);
cvFactory.register(docxTemplate);
cvFactory.register(pdfTemplate);
// The real rirekisho form as an .xlsx (column widths, row heights, merges and the
// pas-foto anchor of the supplied workbook, kept 1:1). Registered last so the
// long-standing templates keep their order in `CvTemplateSelector`.
cvFactory.register(rirekishoXlsxTemplate);
// Form kedua, dari berkas yang dikirim pemilik 2026-10-26 ("FIRMA ELGA PRATAMA").
// Layout, merge, dan tinggi barisnya berbeda dari form ASJ, jadi ia template
// tersendiri — bukan pengganti. Mesin XML-nya sama (`renderers/xlsx-form.ts`).
cvFactory.register(rirekishoFirmaTemplate);
// Form ketiga, dari `F:/1. MASTER CV MAGANG KINKI.xlsx` (2026-10-26). Ini form
// klien KINKI: 学歴 dua baris, 職歴 tiga blok, 家族構成 lima baris, ditambah
// できる作業 dan 性格診断テスト (MBTI). Tipenya TIDAK dibaca dari database —
// tidak ada kolomnya — melainkan disimpulkan `mbti.ts` dari kalimat kandidat.
cvFactory.register(kinkiTemplate);
// Form keempat, dari `F:/JIPA2026.xlsx` (2026-10-26). Form 特定技能 — bukan
// 実習生: ada 資格試験 (SSW/JLPT/JFT/SIM) dan 訪日経験, tanpa できる作業 dan
// tanpa 性格診断テスト. Mesin XML-nya tetap `renderers/xlsx-form.ts`.
cvFactory.register(jipaTemplate);
// Form kelima, dari `F:/template/*_CV.xlsx` (2026-11-04). Pemilik menyebutnya
// "template baru"; dua berkas yang dikirim ternyata layout YANG SAMA (80 merge
// identik) — jadi satu template, dua contoh isian. Beda dengan form ASJ: pas
// foto di I2:J9 dan blok personalia jauh lebih lengkap (視力, 長所/短所,
// 志望動機, 貯金額目標, 帰国後の仕事).
cvFactory.register(rirekishoDetailTemplate);
// Form keenam, dari `F:/template/HERLINA MEY REYGITA CAHYANI_CV.xlsx`
// (2026-11-13). Satu-satunya form DWIBAHASA: label Indonesia–Jepang berpasangan,
// 14 kolom (A–N), pas foto di M3:N10, ditambah blok 資格・免許, 家族構成 tujuh
// baris, dan esai 日本での目標. Berkas kosongnya
// (`CV KAIGO HYOGO履歴書 - 特定技能 2026年.xlsx`) punya 88 merge yang sama —
// jadi keduanya satu template: satu contoh isian, satu blanko.
cvFactory.register(kaigoHyogoTemplate);

export { cvFactory };

