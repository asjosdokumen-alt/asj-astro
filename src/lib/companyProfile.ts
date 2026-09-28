/**
 * companyProfile.ts — the company's static content, in one place.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * It is the counterpart of `jobDisplay.ts`: one module, one source, so no company
 * string is ever typed into markup. Every value below is traceable to the official
 * company profile, and the traceability is the point — a fabricated statistic on a
 * company page is a legal claim, not decoration.
 *
 * PROVENANCE. Every entry carries the page it came from in
 * `docs/COMPANY_PROFILE_DATA.md`. That document is the source of truth; this file
 * is its executable form. If the two disagree, the document wins.
 *
 * WHAT IS DELIBERATELY ABSENT
 * ---------------------------
 * 1. **Candidate / departure / partner counts.** A design mockup showed 500+, 200+
 *    and 50+. None of those numbers appears in the company profile, so none is here
 *    (docs/COMPANY_PROFILE_DATA.md §13).
 * 2. **The women's minimum height.** Page 3 says 145 cm and page 4 says 150 cm. It
 *    is a selection threshold, so shipping the wrong one would reject candidates who
 *    should pass. Only the figures BOTH pages agree on are rendered, and the
 *    disagreement is a recorded question for the owner (§12 K-3). Do not "fix" this
 *    by picking one.
 * 3. **Testimonials.** The profile contains none. The trust slot is filled with the
 *    four destination prefectures, which the document does prove.
 *
 * SHAPE. Every user-visible string is a pair: an i18n key and a literal fallback.
 * The literal is what a crawler and a no-JS visitor see; `translateDataLang()`
 * replaces it once the language store is read. The `profile` namespace is declared
 * in the NS list of `i18n.keys.test.ts`, so every key here is validated against BOTH
 * dictionaries — a missing Japanese key turns the gate red rather than silently
 * falling back to Indonesian.
 */

/** The six accent roles, from the closed list in DESIGN.md §3.2. */
export type AccentRole = 'identity' | 'jobs' | 'program' | 'exam' | 'critical' | 'legal';

/** A key plus its visible fallback. */
export interface Text {
  key: string;
  text: string;
}

/**
 * An illustration for a tile, in the repo's 1x/@2x WebP+AVIF ladder.
 *
 * `name` is the basename only — the component derives the four file URLs, so a
 * caller cannot supply a `@2x` path where a 1x is expected, the defect that
 * makes one DPR render a double-size file.
 *
 * `alt` is REQUIRED and never empty on purpose: these are content illustrations
 * that carry meaning (a factory for SSW placements, a book for language
 * training), not decoration. There is deliberately no `decorative` opt-out on
 * `TileImage` — the mascot component that used to carry one was removed on
 * 2026-09-24, and every tile here is content.
 */
export interface TileImage {
  name: string;
  alt: string;
  /** Intrinsic 1x dimensions, so the ratio is reserved before load (no CLS). */
  w: number;
  h: number;
}

/**
 * Icon + heading + one supporting line. The bento tile shape.
 *
 * `image` is OPTIONAL so the three existing call sites — "Why Japan",
 * "Program ASJ" and "Facilities" — keep rendering exactly as before. Only
 * "Program ASJ" passes it today. An optional field was chosen over a required
 * one because a required field would have forced two unrelated sections to
 * gain a field they have no data for, which is how a shared component starts
 * carrying per-caller noise.
 */
export interface Tile {
  icon: string;
  title: Text;
  body: Text;
  accent: AccentRole;
  image?: TileImage;
}

/**
 * A numbered step in a sequential flow.
 *
 * `image` was added 2026-09-28, when the owner supplied generated illustrations
 * for "Bagaimana Prosesnya?" — the six steps had been text-only since the
 * section existed. It is OPTIONAL for the same reason `Tile.image` is: a
 * required field would force every future step list to invent a picture. The
 * `alt` stays REQUIRED whenever the field is present, which `TileImage` already
 * enforces — a step illustration carries meaning (a classroom for the training
 * step), so it is content rather than decoration.
 */
export interface Step {
  title: Text;
  body: Text;
  image?: TileImage;
}

/**
 * A label–value row.
 *
 * `value` is a LITERAL, never a key: licence numbers, registration numbers and
 * proper nouns are the same in every language, and translating them would be a
 * defect. Only the label is translatable.
 */
export interface Fact {
  label: Text;
  /**
   * The value. A plain string in the common case, or `Text` when it must
   * localise.
   *
   * THE RULE, CORRECTED 2026-09-27. This was `string` only, on a rule stated in
   * `FactList.tsx` as "the value is a literal, never a key… licence numbers,
   * registration numbers and proper nouns are identical in every language".
   * That is right for IDENTIFIERS and wrong for NAMES and QUANTITIES, and this
   * file contradicted it 150 lines further down: the placement rows carried a
   * translatable LABEL next to a hardcoded romanised `Miyazaki · Okayama`. Four
   * prefectures were translated nowhere and one of them was translated
   * elsewhere — the inconsistency is what makes it a defect rather than a
   * judgement call.
   *
   * The rule that replaces it: **an identifier is invariant; a name or a
   * quantity is not.** A licence number, a registration number, a company's
   * legal name, a person's name, an address and an email stay literal. A place
   * name, a price, a date with a month name and anything that reads as prose
   * carry a key.
   */
  value: string | Text;
}

/* ── Vision & mission (pages 2 and 5, verbatim) ─────────────────────────────
   The two pages carry the same text; page 2 prefixes it with "LPK" and page 5
   with "PT". "PT" is used because it is the legal name on the SK. Spelling is
   the document's own — an official vision statement is not ours to tidy, and
   correcting it needs the owner's approval (docs/COMPANY_PROFILE_DATA.md §3). */
export const VISION: Text = {
  key: 'profile.vision_body',
  text: 'Menjadikan PT AMANAH SAKURA JAPAN sebagai lembaga pendidikan yang profesional dan berkualitas yang dapat menghasilkan sumber daya manusia yang mampu berkompetisi di era global serta mampu menjawab tantangan sesuai dengan perkembangan ilmu pengetahuan dan teknologi melalui pengembangan pembelajaran Bahasa asing.',
};

export const MISSIONS: Text[] = [
  {
    key: 'profile.mission_1',
    text: 'Menyelenggarakan program pendidikan dan pelatihan bahasa Jepang secara profesional',
  },
  {
    key: 'profile.mission_2',
    text: 'Mencetak sumber daya manusia yang terampil dan profesional',
  },
  {
    key: 'profile.mission_3',
    text: 'Membangun kerja sama dengan dunia usaha dan industri di dalam dan luar negeri',
  },
  {
    key: 'profile.mission_4',
    text: 'Membuka peluang bekerja di luar negeri agar terciptanya lapangan pekerjaan',
  },
];

/* ── Why Japan (page 2) ─────────────────────────────────────────────────── */
export const WHY_JAPAN: Tile[] = [
  {
    icon: 'wallet',
    accent: 'jobs',
    title: { key: 'profile.why_wage_title', text: 'Gaji' },
    body: {
      key: 'profile.why_wage_body',
      text: 'Upah minimum 15–25 juta per bulan, berbanding lurus dengan biaya hidup dibanding Indonesia.',
    },
  },
  {
    icon: 'user-check',
    accent: 'program',
    title: { key: 'profile.why_exp_title', text: 'Pengalaman dan tantangan baru' },
    body: {
      key: 'profile.why_exp_body',
      text: 'Gaya hidup, budaya, dan kedisiplinan yang berbeda dari Indonesia.',
    },
  },
  {
    icon: 'sun',
    accent: 'exam',
    title: { key: 'profile.why_season_title', text: 'Kehidupan empat musim' },
    body: {
      key: 'profile.why_season_body',
      text: 'Musim semi, panas, gugur, dan dingin — Indonesia hanya punya dua.',
    },
  },
];

/** Page 2, condensed from a paragraph to one line. */
export const WHY_JAPAN_TIP: Text = {
  key: 'profile.why_tip',
  text: 'Tekanan kerja di Jepang lebih besar: pilih pekerjaan sesuai kemampuan yang paling dikuasai, dan galilah bahasa Jepang sedalam mungkin.',
};

/**
 * Program (pages 3 and 4).
 *
 * ARTWORK REPLACED 2026-09-28. The owner supplied three generated illustrations
 * and asked for them in place of the flat-vector scenes. Two consequences worth
 * recording, because both are measurable rather than stylistic:
 *
 *  - the ratio moved from 4:3 (1200x900) to 3:2 (600x400), which is the new
 *    source's own shape, so `IconTileGrid`'s `aspect-[3/2]` renders it with no
 *    crop. The declared `w`/`h` are the REAL size of the 1x file, per
 *    `docs/ILLUSTRATION_SPEC.md` §3.2 — the previous 1200x900 was also real,
 *    and the number is read from disk, never copied from a spec;
 *  - the source composite is 1790x879, so each card's slice is ~562px wide.
 *    The 600px 1x file is therefore a ~1.07x upscale and the 1200px @2x is
 *    synthetic — acceptable for flat illustration, and the reason the files
 *    are smaller than the 2400x1800 they replace.
 */
export const PROGRAMS: Tile[] = [
  {
    icon: 'graduation-cap',
    accent: 'program',
    title: { key: 'profile.prog_magang_title', text: 'Magang' },
    body: {
      key: 'profile.prog_magang_body',
      text: 'Pendampingan dari pendaftaran sampai keberangkatan.',
    },
    image: {
      name: 'program-magang',
      alt: 'Ilustrasi peserta magang di depan gedung pelatihan, berlatar Gunung Fuji.',
      w: 600,
      h: 400,
    },
  },
  {
    icon: 'id-card',
    accent: 'jobs',
    title: { key: 'profile.prog_tg_title', text: 'Tokutei Ginou' },
    body: {
      key: 'profile.prog_tg_body',
      text: 'Perawat Lansia (Kaigo), Pengolahan Makanan, Restoran, Pertanian, Peternakan.',
    },
    image: {
      name: 'program-ssw',
      alt: 'Ilustrasi dua pekerja terampil berlatar cakrawala kota Tokyo saat senja.',
      w: 600,
      h: 400,
    },
  },
  {
    icon: 'language',
    accent: 'exam',
    title: { key: 'profile.prog_bahasa_title', text: 'Bahasa Jepang' },
    body: {
      key: 'profile.prog_bahasa_body',
      text: 'Pelatihan bahasa, keterampilan, dan pengenalan budaya Jepang.',
    },
    image: {
      name: 'program-bahasa',
      alt: 'Ilustrasi peserta menulis aksara Jepang dengan buku teks dan latar Gunung Fuji.',
      w: 600,
      h: 400,
    },
  },
];

/**
 * Page 3, the price table.
 *
 * THIS COMMENT USED TO SAY "a literal: a price is not translated", AND THAT WAS
 * WRONG in the same way the `Fact.value` rule was (see the `Fact` interface).
 * A price is a QUANTITY, not an identifier: `6 JUTA` means nothing to a reader
 * who does not parse Indonesian, and the unit is a word. It carries a key since
 * 2026-09-27; the Japanese side reads `600万ルピア`.
 *
 * Note the number is localised to the Japanese counting convention (万 = 10^4)
 * rather than transliterated, and the currency is named in katakana, so the JP
 * entry is not a word-for-word swap of the Indonesian one.
 */
export const PROGRAM_PRICE: Text = { key: 'profile.prog_price', text: '6 JUTA' };

export const PROGRAM_PAYMENT: Text = {
  key: 'profile.prog_payment',
  text: 'Bisa dicicil, dan tersedia dana talang untuk biaya keberangkatan.',
};

/**
 * Page 3, the four things the price already covers.
 *
 * WHY THIS SHIPS NEXT TO THE PRICE. A price shown without its inclusions is what
 * makes a candidate assume there are hidden costs; the document answers that
 * question explicitly, so the answer belongs beside the number.
 */
export const PROGRAM_INCLUDES: Text[] = [
  { key: 'profile.prog_inc_module', text: 'Modul Pembelajaran & Kamus' },
  { key: 'profile.prog_inc_uniform', text: 'Seragam Lembaga' },
  { key: 'profile.prog_inc_dorm', text: 'Asrama' },
  { key: 'profile.prog_inc_exam', text: 'Ujian JFT & SSW masing-masing 1 kali' },
];

/* ── Admission flow (page 3, verbatim) ──────────────────────────────────── */

/**
 * ILLUSTRATIONS ADDED 2026-09-28. The owner supplied one generated composite
 * containing all six steps and asked for it to be used here; the six slices are
 * cropped out of it (`langkah-1` … `langkah-6`), NOT the composite itself.
 *
 * WHY SLICES RATHER THAN THE WHOLE PICTURE. The composite has the step titles
 * and descriptions burned into its pixels. Dropping it in whole would replace
 * live, translatable `data-lang` text with a bitmap — the exact defect
 * `docs/ILLUSTRATION_SPEC.md` §2.1 rule 1 exists to prevent, and one this repo
 * can measure: `e2e/probe-untranslated.mjs` walks `[data-lang]` nodes, so the
 * strings would simply stop localising on the JP toggle. Every word on these
 * cards stays a `Text` with a key.
 *
 * The `w`/`h` are the measured size of the 1x files. All six share one ratio
 * (7:5) so a single `aspect-[7/5]` box can reserve their space before load —
 * the six source slices were 1.29–1.51, so a shared box unavoidably re-crops
 * each one, and 7:5 is the compromise that costs the least on the widest and
 * the tallest.
 */
export const FLOW_STEPS: Step[] = [
  {
    title: { key: 'profile.step_reg_title', text: 'Registration' },
    body: {
      key: 'profile.step_reg_body',
      text: 'Pemeriksaan kesehatan, dokumen, dan mengisi form pendaftaran.',
    },
    image: {
      name: 'langkah-1',
      alt: 'Ilustrasi peserta mengisi formulir pendaftaran di meja pendaftaran.',
      w: 560,
      h: 400,
    },
  },
  {
    title: { key: 'profile.step_train_title', text: 'Training & Education' },
    body: {
      key: 'profile.step_train_body',
      text: 'Pelatihan bahasa Jepang, keterampilan, dan pengenalan budaya Jepang.',
    },
    image: {
      name: 'langkah-2',
      alt: 'Ilustrasi kelas pelatihan bahasa Jepang dengan pengajar di depan papan tulis.',
      w: 560,
      h: 400,
    },
  },
  {
    title: { key: 'profile.step_interview_title', text: 'Interview' },
    body: {
      key: 'profile.step_interview_body',
      text: 'Wawancara kerja dengan perusahaan Jepang.',
    },
    image: {
      name: 'langkah-3',
      alt: 'Ilustrasi wawancara kerja antara peserta dan pewawancara dari perusahaan Jepang.',
      w: 560,
      h: 400,
    },
  },
  {
    title: { key: 'profile.step_doc_title', text: 'Employment Document' },
    body: { key: 'profile.step_doc_body', text: 'Kepengurusan berkas di Indonesia.' },
    image: {
      name: 'langkah-4',
      alt: 'Ilustrasi petugas menyusun tumpukan berkas kepengurusan di kantor.',
      w: 560,
      h: 400,
    },
  },
  {
    title: { key: 'profile.step_prep_title', text: 'Document Preparing' },
    // Step 5 carries TWO things in the source document. It stays one step: splitting
    // it would turn a six-step official flow into seven, which is a different flow.
    body: {
      key: 'profile.step_prep_body',
      text: 'Pemeriksaan kesehatan (MCU) dan tanda tangan kontrak kerja, lalu kepengurusan berkas imigrasi Jepang (COE).',
    },
    image: {
      name: 'langkah-5',
      alt: 'Ilustrasi pemeriksaan kesehatan dan penandatanganan kontrak kerja beserta dokumen COE.',
      w: 560,
      h: 400,
    },
  },
  {
    title: { key: 'profile.step_go_title', text: 'GO TO JAPAN' },
    body: {
      key: 'profile.step_go_body',
      text: 'Pengurusan paspor, visa, dan EKTLN di Indonesia.',
    },
    image: {
      name: 'langkah-6',
      alt: 'Ilustrasi peserta membawa paspor dan koper menuju pesawat menuju Jepang.',
      w: 560,
      h: 400,
    },
  },
];

/* ── Requirements (page 3) ──────────────────────────────────────────────── */
export const REQUIREMENTS: Text[] = [
  { key: 'profile.req_age', text: 'Pria/wanita, umur 18–28 tahun' },
  { key: 'profile.req_edu', text: 'Pendidikan minimal SMA/SMK sederajat' },
  { key: 'profile.req_marital', text: 'Belum atau sudah menikah' },
  // ⚠ ONLY the figures both source pages agree on. Page 3 says the women's minimum
  // height is 145 cm and page 4 says 150 cm; shipping either would reject candidates
  // who should pass. The men's figures (160 cm / 50 kg) are identical on both pages,
  // so they ship and the women's figure waits for the owner (COMPANY_PROFILE_DATA §12 K-3).
  { key: 'profile.req_body', text: 'Tinggi badan minimal pria 160 cm, berat badan 50 kg' },
  { key: 'profile.req_health', text: 'Sehat jasmani dan rohani' },
  { key: 'profile.req_tattoo', text: 'Tidak bertato dan bertindik' },
  { key: 'profile.req_vision', text: 'Tidak buta warna dan bebas TBC' },
];

/**
 * Page 4's document list, which is the longer of the two the document contains:
 * it adds the parental consent letter and the birth certificate that page 3 omits.
 */
export const REQUIREMENT_DOCS: Text[] = [
  { key: 'profile.doc_form', text: 'Mengisi form yang sudah disediakan' },
  { key: 'profile.doc_consent', text: 'Surat izin orang tua' },
  { key: 'profile.doc_ktp', text: 'Scan/foto copy KTP' },
  { key: 'profile.doc_birth', text: 'Scan/foto copy akta lahir' },
  { key: 'profile.doc_kk', text: 'Scan/foto copy Kartu Keluarga' },
  { key: 'profile.doc_diploma', text: 'Scan/foto copy ijazah (SD/MI, SMP/MTS, SMA/SMK)' },
  { key: 'profile.doc_photo', text: 'Pas foto 3×4 sebanyak 2 lembar' },
];

/* ── Legality (pages 6 and 7) ───────────────────────────────────────────────
   Six rows, all traceable. This section could not exist before the company
   profile arrived: the roadmap deliberately withheld it rather than print
   placeholder licence numbers (docs/LANDING_PAGE_ROADMAP.md §4).

   THREE OF THE SIX CARRY KEYS since 2026-09-27, and the split is the point of
   the rule above rather than an arbitrary line. `AHU-…`, the company-register
   number and the registration number are IDENTIFIERS and stay literal — a
   translated registration number would be a defect. `Badan hukum` is a legal
   DESCRIPTION (`Perseroan Terbatas (PT), Swasta Nasional`), `Akta Notaris`
   contains a DATE WITH A MONTH NAME, and `Kedudukan` is a PLACE: all three
   change with the language. Leaving them literal is how this section shipped
   with four Indonesian strings on an otherwise-Japanese page. */
export const LEGAL_FACTS: Fact[] = [
  {
    label: { key: 'profile.legal_form', text: 'Badan hukum' },
    value: { key: 'profile.legal_form_value', text: 'Perseroan Terbatas (PT), Swasta Nasional' },
  },
  // An identifier: unchanged in every language, so deliberately literal.
  { label: { key: 'profile.legal_sk', text: 'SK Kemenkumham' }, value: 'AHU-0063921.AH.01.01.TAHUN 2023' },
  {
    label: { key: 'profile.legal_deed', text: 'Akta Notaris' },
    // The notary's NAME is invariant; the date's month name is not.
    value: { key: 'profile.legal_deed_value', text: 'Nomor 09, 15 Agustus 2023 — Notaris Setya Budhi, S.H.' },
  },
  // An identifier.
  { label: { key: 'profile.legal_regno', text: 'Nomor pendaftaran' }, value: '4023082735107914' },
  // An identifier.
  { label: { key: 'profile.legal_register', text: 'Daftar Perseroan' }, value: 'AHU-0167587.AH.01.11.TAHUN 2023' },
  {
    label: { key: 'profile.legal_seat', text: 'Kedudukan' },
    value: { key: 'profile.legal_seat_value', text: 'Kabupaten Ponorogo, Jawa Timur' },
  },
];

/* ── Facilities (pages 11-15 and the price inclusions on page 3) ────────── */
export const FACILITIES: Tile[] = [
  {
    icon: 'laptop-code',
    accent: 'jobs',
    title: { key: 'profile.fac_class_title', text: 'Kelas Bahasa Jepang' },
    body: { key: 'profile.fac_class_body', text: 'Kelas tatap muka dengan pengajar bersertifikat JLPT N1.' },
  },
  {
    icon: 'building',
    accent: 'identity',
    title: { key: 'profile.fac_office_title', text: 'Ruang Kantor' },
    body: { key: 'profile.fac_office_body', text: 'Kantor operasional di Ponorogo, Jawa Timur.' },
  },
  {
    icon: 'comments',
    accent: 'identity',
    title: { key: 'profile.fac_guest_title', text: 'Ruang Tamu' },
    body: { key: 'profile.fac_guest_body', text: 'Ruang penerimaan untuk wali dan calon peserta.' },
  },
  {
    icon: 'hotel',
    accent: 'program',
    title: { key: 'profile.fac_dorm_title', text: 'Asrama' },
    body: {
      key: 'profile.fac_dorm_body',
      text: 'Kasur, WiFi, dapur, tempat cuci, dan kendaraan operasional.',
    },
  },
  {
    icon: 'tshirt',
    accent: 'exam',
    title: { key: 'profile.fac_uniform_title', text: 'Seragam & Modul' },
    body: { key: 'profile.fac_uniform_body', text: 'Seragam lembaga serta modul pembelajaran dan kamus.' },
  },
  {
    icon: 'clipboard-check',
    accent: 'legal',
    title: { key: 'profile.fac_exam_title', text: 'Ujian JFT & SSW' },
    body: { key: 'profile.fac_exam_body', text: 'Masing-masing satu kali ujian, termasuk dalam biaya program.' },
  },
];

/* ── Placement (pages 13 and 14) ────────────────────────────────────────────
   Four prefectures, read off the dated interview banners. This is the trust slot
   the mockup filled with testimonials the document does not contain.

   The values carry keys since 2026-09-27: a prefecture is a NAME, so it is not
   invariant across languages. The kanji is the form a Japanese reader needs —
   a romanised "Kagoshima" in an otherwise-Japanese page is the defect this
   file's own `value` rule used to forbid, while permitting it in practice. */
export const PLACEMENTS: Fact[] = [
  {
    label: { key: 'profile.place_food', text: 'Pengolahan Makanan' },
    value: { key: 'profile.place_food_area', text: 'Miyazaki · Okayama' },
  },
  {
    label: { key: 'profile.place_farm', text: 'Pertanian' },
    value: { key: 'profile.place_farm_area', text: 'Miyazaki · Nagano' },
  },
  {
    label: { key: 'profile.place_livestock', text: 'Peternakan' },
    value: { key: 'profile.place_livestock_area', text: 'Kagoshima' },
  },
];

/**
 * Counted from PLACEMENTS, not typed — the hero stat and this list cannot drift.
 *
 * Kept in the ROMANISED form on purpose: this array is the counting source and
 * is also read by the hero stat and by tests. The localised display strings live
 * in the dictionary under `profile.place_area_*`, so the two representations
 * cannot disagree about how many prefectures there are.
 */
export const PLACEMENT_PREFECTURES = ['Miyazaki', 'Okayama', 'Nagano', 'Kagoshima'] as const;

/* ── About (page 2) ─────────────────────────────────────────────────────────
   Three paragraphs. The first is the profile's own welcome, reproduced
   verbatim — including its spelling. An official statement is not ours to
   tidy, and correcting it needs the owner's approval (COMPANY_PROFILE_DATA §3).
   The other two are editorial, assembled from facts the document states
   elsewhere; they are marked as such rather than passed off as quotes. */
export const ABOUT_WELCOME: Text = {
  key: 'profile.about_welcome',
  text: 'Kami berkomitmen meningkatkan kemampuan sumber daya manusia untuk memperdayakan diri sendiri dan mampu menghadapi dunia kerja dan untuk meningkatkan keahlian.',
};

export const ABOUT_PARAGRAPHS: Text[] = [
  {
    key: 'profile.about_p1',
    text: 'PT Amanah Sakura Japan adalah lembaga pelatihan dan penempatan kerja yang berkedudukan di Kabupaten Ponorogo, Jawa Timur. Kami menyiapkan calon pekerja migran Indonesia untuk masuk ke dunia kerja Jepang melalui jalur magang dan Tokutei Ginou.',
  },
  {
    key: 'profile.about_p2',
    text: 'Pendampingan kami berjalan sejak pendaftaran, pelatihan bahasa, ujian JFT dan SSW, hingga keberangkatan dan penempatan. Setiap tahap punya pengajarnya sendiri, dan struktur organisasi kami bisa diperiksa di bagian Tim.',
  },
];

/* ── Team (pages 8 and 10) ──────────────────────────────────────────────────
   Seven posts from the official structure chart on page 8, in its own order.
   Names appear ONLY where the document publishes them — and where it does, the
   name is used, because `name: null` would understate a structure the company
   printed itself.

   WHY THE JOB TITLES ARE CHECKED BY A TEST, NOT BY EYE. Page 8 is signed
   "Hormat Kami, PT AMANAH SAKURA JAPAN, KOIRUL MUSTAKIM, Direktur", and the chart
   lists TRIYA SUMARYATI separately as Komisaris. An earlier revision of this
   constant labelled Koirul Mustakim "Komisaris" and omitted Triya entirely, so the
   page handed the top post to the wrong person while looking perfectly normal. A
   swapped title is invisible to every rendering gate — see the `team` describe
   block in companyProfile.test.ts, which pins each title to its documented holder.

   WHY HADI PRASOJO APPEARS ONCE. He is Manager cum Education & Training Manager —
   one post with two names in the document, not two people and not two jobs.
   Listing him twice rendered two cards and granted him the Direktur title. The
   N1 credential (page 10) is the strongest trust signal the company has, so it is
   attached as his note rather than duplicated as its own row.

   WHY `name` IS `Text | null` AND NOT A PLAIN STRING. A person's name is a NAME,
   not an identifier, so it translates — see the rule comment above `Fact.value`.
   These six names were literals until e2e/probe-untranslated.mjs reported them as
   unchanged text on /, /loker and /public, all six inside a section whose every
   other word was Japanese. The company publishes the kana spelling itself, so
   there is no guesswork in the translation; the JP spelling is カタカナ. */
export interface Person {
  name: Text | null;
  role: Text;
  note?: Text;
}

export const TEAM: Person[] = [
  { name: { key: 'profile.team_name_direktur', text: 'Koirul Mustakim' }, role: { key: 'profile.team_direktur', text: 'Direktur' } },
  { name: { key: 'profile.team_name_komisaris', text: 'Triya Sumaryati' }, role: { key: 'profile.team_komisaris', text: 'Komisaris' } },
  {
    name: { key: 'profile.team_name_edu_manager', text: 'Hadi Prasojo' },
    role: { key: 'profile.team_edu_manager', text: 'Manager / Education & Training Manager' },
    note: { key: 'profile.team_n1_note', text: 'Pemegang JLPT N1, sertifikat N1A225127J' },
  },
  { name: { key: 'profile.team_name_admin', text: 'Ayok Wahyu Saputro' }, role: { key: 'profile.team_admin', text: 'Staf Administrasi' } },
  { name: { key: 'profile.team_name_instructor', text: 'Rian Hari Wijaya' }, role: { key: 'profile.team_instructor', text: 'Pengajar Bahasa Jepang' } },
  { name: { key: 'profile.team_name_instructor_2', text: 'Wiwit T Syafitri' }, role: { key: 'profile.team_instructor_2', text: 'Pengajar Bahasa Jepang' } },
];

/** Page 10. Rendered as a credential card, not buried in prose. */
export const CREDENTIAL: Fact = {
  label: { key: 'profile.cred_jlpt_label', text: 'Sertifikasi pengajar' },
  value: 'JLPT N1 — N1A225127J',
};

/* ── History (pages 1, 6 and 9) ─────────────────────────────────────────────
   The brief for "Tentang Kami" asks for sejarah, and the page previously had
   none — it explained what the company does but never when it started or on what
   authority. Every date here is quoted from the official profile, never inferred:

     · 15 Agustus 2023 — the deed of establishment (§1, §2.1, notarial act No. 09)
     · 28 Agustus 2023 — the ministry decision accepting the company (§2.1)
     · 2023            — the competency-based training certificate (§2.3)

   WHY THE FIRST ENTRY LEADS WITH THE DEED AND NOT THE YEAR. "SINCE 2023" is on the
   cover, but the mockup claimed "Sejak 2015" and the module still banned 2015, so
   the year alone is the field a future edit is most likely to get wrong. Anchoring
   the date to the notarial act and the ministry number means the entry carries its
   own evidence: anyone changing it has to change a verifiable document reference
   too.

   The wording is editorial — assembled from facts the profile states elsewhere —
   and is not presented as a quotation from the company. Only §3's vision, mission
   and welcome are verbatim, and those keep their original spelling. */
export interface Milestone {
  title: Text;
  body: Text;
}

export const HISTORY: Milestone[] = [
  {
    title: { key: 'profile.history_1_title', text: '15 Agustus 2023 — Pendirian' },
    body: {
      key: 'profile.history_1_body',
      text: 'PT Amanah Sakura Japan didirikan di Kabupaten Ponorogo berdasarkan Akta Notaris Nomor 09 tanggal 15 Agustus 2023, dibuat di hadapan Notaris Setya Budhi, S.H.',
    },
  },
  {
    title: { key: 'profile.history_2_title', text: '28 Agustus 2023 — Pengesahan Badan Hukum' },
    body: {
      key: 'profile.history_2_body',
      text: 'Kementerian Hukum dan Hak Asasi Manusia Republik Indonesia mengesahkan pendirian badan hukum perseroan melalui keputusan AHU-0063921.AH.01.01.TAHUN 2023, dengan nomor pendaftaran 4023082735107914.',
    },
  },
  {
    title: { key: 'profile.history_3_title', text: '2023 — Pelatihan Berbasis Kompetensi' },
    body: {
      key: 'profile.history_3_body',
      text: 'Lembaga menyelenggarakan Program Pelatihan Berbasis Kompetensi dengan judul Pelatihan Bahasa Jepang, dan menyiapkan pengajar bersertifikat JLPT N1 untuk membimbing peserta hingga siap bekerja di Jepang.',
    },
  },
];

/* ── Contact detail rows (pages 5, 8 and 9) ─────────────────────────────── */
export const CONTACT_EMAIL_ROW: Fact = {
  label: { key: 'profile.contact_email', text: 'Surel' },
  value: 'amanahsakurajapan@gmail.com',
};

export const CONTACT_LOCATION: Fact = {
  label: { key: 'profile.contact_located', text: 'Lokasi' },
  value: { key: 'profile.contact_located_value', text: 'Kabupaten Ponorogo, Jawa Timur' },
};

/** Ponorogo town centre, for the map embed. The address is street-level; a
 *  pin at the regency centre is honest about its precision, whereas inventing
 *  a specific latitude for the office would not be. */
export const MAP_EMBED_QUERY = 'Ponorogo, Jawa Timur';

/* ── Contact (pages 5, 8 and 9) ─────────────────────────────────────────── */

/**
 * The street address, as a translatable `Text`.
 *
 * WHY AN ADDRESS IS KEYED BUT AN EMAIL IS NOT. This is the same rule as the names:
 * an identifier is invariant, a NAME is not. `amanahsakurajapan@gmail.com` below is
 * an ADDRESS YOU TYPE — rewriting it breaks the mailto and the reader's ability to
 * copy it — so it stays a literal in both languages. A postal address is the
 * opposite: it is a place NAME, and a Japanese reader who cannot read the Latin
 * transliteration of "Kec. Sukorejo, Kab. Ponorogo" is meant to get the kana form.
 * The prefecture names inside it (Jawa Timur → 東ジャワ州) already have a key of their
 * own in `profile.contact_located_value`, so leaving the street line unkeyed meant
 * one contact block rendered half in Japanese and half in Indonesian.
 *
 * THE INDONESIAN TEXT STAYS THE ADDRESS OF RECORD. The JP string is a reading aid,
 * not a replacement: an envelope or a courier form is filled in with the Indonesian
 * line, so `text` here is the canonical value and the JP dictionary supplies the
 * gloss. If the two ever disagree the Indonesian one wins.
 *
 * WHY THE KEY IS `_value`. `profile.contact_address` ALREADY EXISTED and means
 * the LABEL ("Alamat" / "住所" — the heading above the address). Reusing that key
 * for the street line itself made the id dictionary carry the same key twice, and
 * the repo's duplicate-key check caught it immediately. The `_value` suffix is the
 * existing convention for the pair: `<thing>` is the label, `<thing>_value` is
 * what sits under it (see `profile.contact_located` /
 * `profile.contact_located_value` right above).
 */
export const CONTACT_ADDRESS: Text = {
  key: 'profile.contact_address_value',
  text: 'Jl. Kyai Ageng Musakaf, Rw 03 Rt 03, Dukuh Ngujung, Desa Gandu Kepuh, Kec. Sukorejo, Kab. Ponorogo, Jawa Timur',
};

/** Both numbers are on the letterhead; the repo previously carried only the second. */
export const CONTACT_PHONES = ['0821-3178-1435', '0878-8950-2004'] as const;
export const CONTACT_WHATSAPP = '6287889502004';
/** An identifier: typed, copied, and pasted into a mail client. Never translated. */
export const CONTACT_EMAIL = 'amanahsakurajapan@gmail.com';

/**
 * The Instagram handle from the profile's own banners.
 *
 * ⚠ THIS DIFFERS FROM WHAT `Footer.astro` SHIPS. The footer links to
 * `instagram.com/amahsakurajp` while every banner in the company profile prints
 * `@amanah_sakura_japan`. The profile is the authoritative source, so the value
 * here is the profile's — and the footer is corrected in L4, in the same commit as
 * the other contact-source change, rather than leaving two handles live at once.
 * See docs/COMPANY_PROFILE_DATA.md §12 K-2.
 */
export const CONTACT_INSTAGRAM = 'amanah_sakura_japan';

/**
 * The TikTok handle, added 2026-09-24 with the `#kontak` QR tiles.
 *
 * ⚠ THIS VALUE COMES FROM `Footer.astro`, NOT FROM THE COMPANY PROFILE. Unlike
 * `CONTACT_INSTAGRAM` above, the profile prints no TikTok handle, so the only
 * source is the footer's existing `footer-tk` link
 * (`https://tiktok.com/@amahsakurajp`). It lives here so the QR tile and the
 * footer icon cannot drift into two hardcoded copies of one URL; if the owner
 * confirms a different handle, correct it here AND in Footer.astro together.
 */
export const CONTACT_TIKTOK = 'amahsakurajp';
