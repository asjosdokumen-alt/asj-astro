/**
 * gallery.ts — the photo gallery (R3), and the deliberate omissions behind it.
 *
 * WHY THIS FILE EXISTS AT ALL, AND WHY IT IS SHORT
 * ------------------------------------------------
 * Twenty-six company photographs exist and were sitting unused outside the repo.
 * Shipping all of them would have been the easy move and the wrong one: several
 * are not photographs of the company at all, and two are actively unsafe to
 * publish. Every entry below earns its place, and every omission is recorded here
 * rather than left as a silent gap — so the next person does not "helpfully" add
 * the missing files back.
 *
 * WHAT WAS LEFT OUT, AND WHY
 * --------------------------
 *   - `legal-ahu-0063921-2023.webp` and `legal-akta-09-2023.webp`
 *     Full-page scans of the ministerial decree and the notarial deed. These carry
 *     the personal signature and the printed name of an official who is not our
 *     employee and did not consent to appearing on a job portal. They also carry a
 *     QR code and a personal NIP. The licence NUMBERS already ship as text in
 *     LEGAL_FACTS, which is the part a candidate actually needs to verify the
 *     company. The scans add no verification value that the numbers do not, and
 *     they publish a third party's signature. Omitted deliberately.
 *
 *   - `fasilitas-kelas-bahasa-1.webp`
 *     A CCTV frame, not a photograph: a timestamp is burned into the image
 *     ("02-03-2025 10:01:52"), the camera's own brand is watermarked in the corner,
 *     and students are visible from a surveillance angle. Publishing it tells a
 *     candidate the classroom is monitored, which is not the message this section
 *     exists to send. A better classroom photo of the same room already exists
 *     (`fasilitas-kelas-bahasa-2.webp`), so nothing is lost. Omitted deliberately.
 *
 *   - `poster-rekrutmen.webp`
 *     A recruitment flyer with marketing text baked into the picture ("AYO Kerja ke
 *     Jepang", "HANYA 6 Jt"). Those claims are already rendered as real, translatable
 *     text in PROGRAMS and PROGRAM_PRICE. Shipping the flyer would duplicate them at
 *     842x1192 px, freeze them out of the language toggle, and show a price that
 *     cannot be updated without redrawing an image. Omitted deliberately.
 *
 *   - `galeri-mensetsu-*.webp` (5 files)
 *     Interview-day posters with a designed frame, a title band and a contact
 *     footer composited in. As gallery tiles they read as advertisements rather than
 *     as photographs of the day, and the footer duplicates contact details that the
 *     page already shows as text. Kept out of the gallery.
 *
 * WHAT THAT LEAVES
 * ----------------
 * Nine genuine photographs, all pointing the same direction: people, rooms, and
 * arrival in Japan. That is the story this section has to tell.
 *
 * THREE OF THEM WERE NOT GENUINE UNTIL 2026-09-20
 * -----------------------------------------------
 * This file's whole premise is "every entry is a photograph of the company". Three
 * entries broke it, and the thing that hid the break was the gate below it: the test
 * checks that each `src` EXISTS ON DISK and that its declared size matches, and all
 * three did. The bytes were simply not of this company.
 *
 * The mapping that produced them (`F:\desain\_cp_assets.py`) pointed three slots at
 * PDF bleed artwork instead of photographs:
 *   - `tim-koirul-mustakim.webp`   held Tokyo Skytree + cherry blossom
 *   - `tim-hadi-prasojo.webp`      held a red-maple footpath
 *   - `galeri-keberangkatan-1.webp` held a red maple and a pagoda
 * The two real portraits were invisible for a mundane reason: `_cp_images.py`
 * discarded images under 40,000 pixels, and the portraits measure 41,087 (barely
 * through) and 25,800 (never written at all). The real departure photographs — four
 * of them, participants holding an ASJ banner at the airport — were never mapped.
 *
 * The lesson is recorded here because it is cheap to re-learn: `gallery.test.ts`
 * proves the file is PRESENT, and nothing it checks can prove the file is CORRECT.
 * "Ada di disk" is not "benar". If you add an entry, look at the picture.
 *
 * WHY `alt` IS NOT OPTIONAL AND IS NOT A KEY
 * ------------------------------------------
 * Alt text describes a specific photograph's content, so it cannot be a translation
 * key the way a heading can — the same key would have to describe nine different
 * pictures. It is written per photo, in Indonesian, and the captions are keys so
 * the language toggle still reaches the surrounding UI. `Object.freeze` guards the
 * array because `getPublicData()` hands out a shared object and sorting one
 * consumer's copy in place would reorder it for every other consumer.
 */

export interface GalleryItem {
  /** Path under `public/`. Verified to exist before shipping — see the test. */
  src: string;
  /** Describes THIS photograph. Not translated. */
  alt: string;
  /** Caption under the tile. Translatable, hence a key plus fallback. */
  captionKey: string;
  caption: string;
  /**
   * Intrinsic pixel size. Declared so the browser can reserve the box before the
   * image arrives — a gallery without intrinsic dimensions reflows the whole page
   * on load, which is the layout shift the hero was already measured for.
   */
  width: number;
  height: number;
}

export const GALLERY: readonly GalleryItem[] = Object.freeze([
  {
    src: '/assets/fasilitas-gedung.webp',
    alt: 'Peserta dan staf berfoto bersama di depan kantor LPK Amanah Sakura Japan dengan seragam batik.',
    captionKey: 'profile.gal_gedung',
    caption: 'Kantor & peserta di Ponorogo',
    width: 1600,
    height: 1066,
  },
  {
    // CONSENT — ANSWERED BY THE OWNER, 2026-09-23. The owner holds full authority
    // over this application and ruled this photograph publishable. Recorded as
    // what it is: a decision about what this site publishes, NOT a record that the
    // ~20 people in uniform were asked. §11.2 makes consent a prerequisite; only
    // the owner can say whether it is met, and the ruling is theirs to give.
    // Keep the two claims apart if this is ever reviewed — "the owner approved it"
    // and "they agreed to it" are not the same sentence, and this note is the
    // first one. The photograph still shows ~20 identifiable faces in uniform.
    src: '/assets/fasilitas-grup-staf.webp',
    alt: 'Staf pengajar dan pengurus LPK Amanah Sakura Japan berfoto bersama.',
    captionKey: 'profile.gal_staf',
    caption: 'Tim pengajar dan pengurus',
    width: 1400,
    height: 1141,
  },
  {
    src: '/assets/fasilitas-kelas-bahasa-2.webp',
    alt: 'Peserta pria berbaris rapi mengenakan kemeja putih dan dasi hitam dengan nomor dada, siap sesi wawancara.',
    captionKey: 'profile.gal_kelas',
    caption: 'Persiapan wawancara kerja',
    width: 1139,
    height: 738,
  },
  {
    src: '/assets/fasilitas-ruang-tamu-1.webp',
    alt: 'Empat peserta menunjukkan dokumen di depan dinding bertuliskan LPK Amanah Sakura Japan.',
    captionKey: 'profile.gal_tamu',
    caption: 'Penyerahan dokumen peserta',
    width: 1400,
    height: 1050,
  },
  {
    // CONSENT — ANSWERED BY THE OWNER, 2026-09-23. Publishable by the owner's
    // ruling; see the note on `fasilitas-grup-staf.webp` above for what that does
    // and does not claim. This is the largest such group on the page: ~50
    // identifiable faces in uniform.
    src: '/assets/fasilitas-grup-siswa-1.webp',
    alt: 'Peserta pelatihan berfoto bersama mengenakan seragam lembaga.',
    captionKey: 'profile.gal_siswa',
    caption: 'Angkatan peserta pelatihan',
    width: 1400,
    height: 766,
  },
  {
    // CONSENT — ANSWERED BY THE OWNER, 2026-09-23. Publishable by the owner's
    // ruling; see the note on `fasilitas-grup-staf.webp` above for what that does
    // and does not claim. It shows an identifiable group at a departure event.
    //
    // THE FILE WAS WRONG UNTIL 2026-09-20, AND THE DIMENSIONS ARE THE PROOF.
    // This entry used to declare 828x1021 while the asset on disk measured
    // 828x1021 — consistent, and still wrong: both described a red-maple and
    // pagoda bleed image lifted off company-profile page 1, not a photograph of
    // anyone leaving. The real departure photographs are the four small images on
    // page 1 (xrefs 26, 680, 819, 820); xref 26 now backs this entry at its own
    // measured size. `gallery.test.ts` only ever checked that the file EXISTS, so
    // a right-sized file with the wrong picture passed every gate. See the long
    // note at the top of this file.
    src: '/assets/galeri-keberangkatan-1.webp',
    alt: 'Peserta berfoto bersama memegang spanduk LPK Amanah Sakura Japan sebelum terbang ke Jepang.',
    captionKey: 'profile.gal_berangkat',
    caption: 'Pelepasan keberangkatan',
    width: 309,
    height: 233,
  },
  {
    // CONSENT — ANSWERED BY THE OWNER, 2026-09-23. Publishable by the owner's
    // ruling; see the note on `fasilitas-grup-staf.webp` above. This is the
    // sharpest case of the distinction that note draws: the subject is a NAMED
    // individual, and §11.2 is explicit that a public role and a certification do
    // not imply consent to appear in a public repo. An owner's ruling to publish
    // is a decision about this site; it is not the person agreeing.
    //
    // THE FILE WAS WRONG UNTIL 2026-09-20. It held a red-maple footpath — bleed
    // artwork from page 2 — under a caption naming a person. The real portrait is
    // xref 788 (150x172), which the original extractor never even wrote to disk:
    // it filtered on `w*h >= 40000` and this image measures 25,800. A caption
    // naming a human being was the only thing standing between a stock photo and
    // a public claim that this was him.
    src: '/assets/tim-hadi-prasojo.webp',
    alt: 'Hadi Prasojo, Education & Training Manager pemegang sertifikat JLPT N1.',
    captionKey: 'profile.gal_n1',
    caption: 'Pengajar bersertifikat JLPT N1',
    width: 150,
    height: 172,
  },
  {
    // THE ALT AND THE CAPTION WERE BOTH FALSE UNTIL 2026-09-23. They described a
    // guest room — "Ruang tamu untuk menerima wali dan calon peserta beserta
    // keluarganya" / "Ruang penerimaan wali". Opened and looked at, the file shows
    // three young men standing in front of the LPK sign, each holding up a
    // document. A caption is a claim about the picture, and this was a claim about
    // a DIFFERENT picture — the same defect as the two entries above that once
    // carried a red-maple bleed under a caption naming a person.
    //
    // A WRONG ALT IS NOT A CONSENT QUESTION, which is why it was fixed regardless
    // of the owner's ruling below: a screen reader and a crawler are misled by it
    // no matter who agreed to be photographed.
    src: '/assets/fasilitas-ruang-tamu-3.webp',
    alt: 'Tiga peserta berdiri memegang dokumen masing-masing di depan dinding bertuliskan LPK Amanah Sakura Japan.',
    captionKey: 'profile.gal_layanan',
    caption: 'Peserta dengan dokumen',
    width: 1400,
    height: 1050,
  },
]);

/**
 * Photographs that exist in the folder but must NOT be published, with the reason.
 * Exported so the test can assert they never appear in GALLERY — and so the next
 * person finds the reasoning here instead of re-discovering it.
 */
export const GALLERY_EXCLUDED: readonly { src: string; why: string }[] = Object.freeze([
  {
    src: '/assets/legal-ahu-0063921-2023.webp',
    why: 'Scan of a ministerial decree: third-party signature, printed name, NIP and QR code, none consented to.',
  },
  {
    src: '/assets/legal-akta-09-2023.webp',
    why: 'Scan of a notarial deed: same third-party personal-data exposure as the decree.',
  },
  {
    src: '/assets/fasilitas-kelas-bahasa-1.webp',
    why: 'CCTV frame — burned-in timestamp, camera-brand watermark, surveillance angle.',
  },
  { src: '/assets/poster-rekrutmen.webp', why: 'Price and marketing claims baked into pixels; they ship as live text.' },
  {
    // REMOVED FROM THE GALLERY ON 2026-09-23, after being opened and looked at.
    // This is the same defect as `fasilitas-kelas-bahasa-1.webp` above, and the
    // same reasoning applies — which is why it is recorded here rather than
    // merely deleted: a frame from a recording is not a photograph of a room.
    src: '/assets/fasilitas-ruang-kantor-1.webp',
    why: 'Frame from a screen/video recording, not a photograph: a playback timestamp (9:07:54), an audio icon and player controls (10 / 1X / skip) are burned into the pixels, with four people at their desks. Its alt and caption claimed "Ruang kantor operasional", i.e. a room. A candidate reading that caption is shown a video still instead — and a site that publishes its own monitoring footage tells a candidate the office is watched.',
  },
]);
