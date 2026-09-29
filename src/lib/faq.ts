/**
 * faq.ts — the FAQ: questions the six MoU partner sites all answer, answered here
 * from OUR OWN authoritative documents.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * MEASURED 2026-09-29 (`docs/COMPANY_PAGE_ASSESSMENT_2026-09-29.md` §3.3, §4.1 item D):
 * JIPA publishes 6 Q&A, Flora and Japanesia answer cost/schedule questions inline,
 * and this site had **no FAQ at all**. The questions that recur across all six
 * partner sites are the same five: requirements, cost, instalments, the bridging
 * fund (`dana talang`), and how long the process takes. A visitor with those
 * questions currently has to open WhatsApp to get an answer the site already knows.
 *
 * ── ⚠ EVERY ANSWER IS COPIED, NOT WRITTEN ───────────────────────────────────
 * Each `text` below traces to a specific section of `docs/COMPANY_PROFILE_DATA.md`
 * (cited per entry in `source`), which is itself transcribed from the company's
 * own printed profile. Nothing here is composed to sound good. If an answer is
 * not in that document, the question is not asked — that is the whole rule, and
 * it is why there are five questions rather than the fifteen a marketing page
 * would carry.
 *
 * ── ⚠ ONE QUESTION IS DELIBERATELY ABSENT ───────────────────────────────────
 * "Berapa tinggi badan minimum?" would be the most natural sixth question, and it
 * is the one we cannot answer: §12 **K-3** records that the printed profile
 * contradicts itself on the women's minimum (page 3 says 145 cm, page 4 says
 * 150 cm) and the decision is still open with the owner. This is a SELECTION
 * criterion, so publishing either number would reject a candidate who should
 * have passed. The requirement entry below therefore names the document and the
 * intake range without asserting the disputed figure. Do not "complete" it.
 */

/** One question and its answer, both keyed for translation. */
export interface FaqEntry {
  /** Stable id — the React key and the anchor, never reordered. */
  id: string;
  question: { key: string; text: string };
  answer: { key: string; text: string };
  /**
   * Where the answer came from, in `docs/COMPANY_PROFILE_DATA.md`.
   * Not rendered; it exists so the next editor can verify without re-reading the
   * whole document, and so an unverifiable answer is visible as a missing source.
   */
  source: string;
}

/**
 * The questions.
 *
 * ORDER IS THE ORDER VISITORS ASK THEM IN: what the programme costs, what that
 * buys, whether it can be paid over time, whether there is help with the
 * upfront cost, and finally how long it takes. Cost first because it is the
 * question that ends the conversation when it goes unanswered.
 */
export const FAQ: FaqEntry[] = [
  {
    id: 'biaya',
    question: { key: 'profile.faq_q_cost', text: 'Berapa biaya programnya?' },
    answer: {
      key: 'profile.faq_a_cost',
      text: 'Biaya program adalah 6 juta rupiah.',
    },
    source: 'COMPANY_PROFILE_DATA.md §5 (Harga — h. 3)',
  },
  {
    id: 'cakupan',
    question: { key: 'profile.faq_q_includes', text: 'Biaya 6 juta itu untuk apa saja?' },
    answer: {
      key: 'profile.faq_a_includes',
      text: 'Mencakup empat hal: modul pembelajaran dan kamus, seragam lembaga, asrama, serta ujian JFT dan SSW masing-masing satu kali.',
    },
    source: 'COMPANY_PROFILE_DATA.md §5.1 (h. 3)',
  },
  {
    id: 'cicilan',
    question: { key: 'profile.faq_q_installment', text: 'Apakah biayanya bisa dicicil?' },
    answer: {
      key: 'profile.faq_a_installment',
      text: 'Bisa. Pembayaran dapat dilakukan secara bertahap (dicicil).',
    },
    source: 'COMPANY_PROFILE_DATA.md §5 (Skema bayar — h. 4)',
  },
  {
    id: 'dana-talang',
    question: { key: 'profile.faq_q_bridge', text: 'Bagaimana kalau belum ada biaya keberangkatan?' },
    answer: {
      key: 'profile.faq_a_bridge',
      text: 'Tersedia dana talang untuk membantu biaya keberangkatan.',
    },
    source: 'COMPANY_PROFILE_DATA.md §5 (Pembiayaan — h. 4)',
  },
  {
    id: 'persyaratan',
    question: { key: 'profile.faq_q_requirements', text: 'Apa syarat untuk ikut program?' },
    answer: {
      key: 'profile.faq_a_requirements',
      // ⚠ The women's height figure is INTENTIONALLY absent — see §12 K-3 above.
      text: 'Usia 18–28 tahun, pendidikan minimal SMA/SMK sederajat, sehat jasmani dan rohani, serta tidak bertato dan tidak bertindik. Untuk tinggi badan minimum dan syarat lain, silakan hubungi kami karena ada ketentuan yang berbeda antar jalur program.',
    },
    source: 'COMPANY_PROFILE_DATA.md §6 (h. 3 & h. 4); syarat tinggi badan tertunda — §12 K-3',
  },
  {
    id: 'alur',
    question: { key: 'profile.faq_q_process', text: 'Berapa lama prosesnya, dan tahapannya apa saja?' },
    answer: {
      key: 'profile.faq_a_process',
      text: 'Enam tahap: pendaftaran dan pemeriksaan dokumen, pelatihan bahasa dan budaya Jepang, wawancara kerja dengan perusahaan Jepang, pengurusan berkas di Indonesia, pemeriksaan kesehatan (MCU) dan tanda tangan kontrak beserta pengurusan COE, lalu keberangkatan ke Jepang.',
    },
    source: 'COMPANY_PROFILE_DATA.md §7 (h. 3)',
  },
];

/** The accent role for the section — `identity`, matching #tentang and #tim. */
export const FAQ_ACCENT = 'identity' as const;
