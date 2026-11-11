/**
 * StoryFilm.tsx — the "Satu Jalan" film band in `#alur`.
 *
 * WHY THIS IS A .tsx PRIMITIVE AND NOT AN INLINE `.map()` IN THE PAGE
 * ------------------------------------------------------------------
 * `index.astro` already states the rule: iterating inside an `.astro` TEMPLATE
 * breaks a hard invariant of this repo. The indexer resolves template
 * identifiers against the FRONTMATTER MODULE SCOPE only, so a `.map()` callback
 * parameter (`step`, `i`) is reported as an unresolved global — and
 * `indexer/src/build.test.ts` asserts that list is EMPTY.
 *
 * MEASURED, not assumed: the band shipped inline first and the indexer reported
 * `src/pages/index.astro:412 i` / `… step`, 13 entries, every one a callback
 * parameter. In a `.tsx` file the callback binds normally, so the same markup
 * produces zero unresolved refs.
 *
 * The band's styles stay in `index.astro` under `<style is:global>`: Astro scopes
 * a page's `<style>` with a `[data-astro-cid-…]` attribute that elements rendered
 * by ANOTHER file never carry, so scoped styles would silently not apply here.
 * `is:global` is the narrow cost of moving the list out; every selector is
 * prefixed `film-` so nothing else can collide.
 *
 * Server-rendered on purpose — no `client:` directive. The interaction is driven
 * by the inline script in `index.astro`, which queries `[data-film]`.
 */

export interface FilmStep {
  title: { key: string; text: string };
  body: { key: string; text: string };
}

/**
 * ── MEDIA UNTUK BAND "SATU JALAN" DI §ALUR ────────────────────────────────────
 *
 * Enam plate potret (1024x1464) + dua klip 5 detik, semuanya hasil generate
 * dengan satu model yang sama dan pakaian yang ikut tahap: polo Amanah di
 * pendaftaran/pelatihan/dokumen, putih-hitam di wawancara, dan kimono di Jepang.
 *
 * Enam plate 3:2 di `wide/` adalah adegan yang SAMA, dibingkai ulang supaya band
 * bisa menutup seluruh layar di desktop. Potretnya tetap dipakai tata letak
 * bertumpuk (ponsel / reduced-motion): crop 3:2 di bingkai potret memotong
 * subjeknya jadi dua.
 *
 * KENAPA PATH DITULIS LITERAL, BUKAN DIBENTUK DARI `step.image.name`.
 * `scripts/ci/verify-assets.mjs` membaca referensi `/assets/…webp` yang literal;
 * path yang dirakit (`/assets/story/${…}`) tidak terlihat olehnya, jadi keenam
 * berkas akan tampil sebagai "ada di disk, tidak dipublikasi" dan gate kehilangan
 * objek yang seharusnya ia jaga. Nama berkasnya sengaja TIDAK mengikuti
 * `langkah-N` supaya artinya terbaca tanpa membuka gambarnya.
 *
 * CATATAN URUTAN (2026-11-11). Langkah 05 situs berjudul "Document Preparing"
 * (MCU, tanda tangan kontrak, COE) — jadi platnya tangan menandatangani formulir
 * dengan stetoskop, BUKAN lagi adegan bandara. Adegan bandara tidak punya langkah
 * yang cocok di daftar pemilik (langkah 06 = paspor/visa/EKTLN, masih di
 * Indonesia), jadi ia dikeluarkan dari band dan disimpan di
 * `deliverables/story-3d/assets/wide/05-terbang.webp` sebagai spare.
 */
const MEDIA = [
  {
    portrait: '/assets/story/01-daftar.webp',
    wide: '/assets/story/wide/01-daftar.webp',
    mp4: '/assets/story/01-daftar.mp4',
    mp4w: '/assets/story/wide/01-daftar.mp4',
    focus: '64% 50%',
    alt: 'Ilustrasi peserta mengisi formulir pendaftaran dengan pulpen di atas meja, memakai polo LPK Amanah.',
  },
  {
    portrait: '/assets/story/02-latihan.webp',
    wide: '/assets/story/wide/02-latihan.webp',
    mp4: '/assets/story/02-latihan.mp4',
    mp4w: '/assets/story/wide/02-latihan.mp4',
    focus: '60% 46%',
    alt: 'Ilustrasi pengajar di depan papan tulis berisi hiragana, memakai polo LPK Amanah, dengan peserta duduk di depan kelas.',
  },
  {
    portrait: '/assets/story/03-wawancara.webp',
    wide: '/assets/story/wide/03-wawancara.webp',
    mp4: null,
    mp4w: null,
    focus: '62% 50%',
    alt: 'Ilustrasi wawancara kerja: peserta berkemeja putih dan blazer hitam berhadapan dengan pewawancara.',
  },
  {
    portrait: '/assets/story/04-dokumen.webp',
    wide: '/assets/story/wide/04-dokumen.webp',
    mp4: null,
    mp4w: null,
    focus: '58% 52%',
    alt: 'Ilustrasi tangan memegang paspor di atas meja dengan berkas dan pena, lengan polo LPK Amanah.',
  },
  {
    portrait: '/assets/story/05-mcu.webp',
    wide: '/assets/story/wide/05-mcu.webp',
    mp4: '/assets/story/05-mcu.mp4',
    mp4w: '/assets/story/wide/05-mcu.mp4',
    focus: '58% 52%',
    alt: 'Ilustrasi tangan menandatangani formulir pemeriksaan kesehatan di atas clipboard, dengan stetoskop dan pena di meja, lengan polo LPK Amanah.',
  },
  {
    portrait: '/assets/story/06-tiba.webp',
    wide: '/assets/story/wide/06-tiba.webp',
    mp4: '/assets/story/06-tiba.mp4',
    mp4w: '/assets/story/wide/06-tiba.mp4',
    focus: '62% 46%',
    alt: 'Ilustrasi peserta tiba di Jepang dengan kimono dan koper, berlatar Gunung Fuji dan lentera jalan.',
  },
] as const;

/**
 * ── CODA ──────────────────────────────────────────────────────────────────────
 *
 * Frame penutup, BUKAN langkah ketujuh. Ia memakai plat langkah 01 lagi — bukan
 * karena asetnya kurang, tapi karena itulah argumennya: di referensi 58 detik,
 * filmnya berakhir dengan kembali ke frame pertama (siklus benih -> panen ->
 * benih). Tanpa frame ini, band berhenti setelah "GO TO JAPAN" dan enam langkah
 * terbaca sebagai daftar yang habis.
 *
 * Path-nya ditulis literal dan sengaja SAMA dengan entri pertama `MEDIA`:
 * `verify-assets` membaca string `/assets/...webp`, bukan identitas objek, jadi
 * berbagi konstanta tidak menghemat apa pun dan hanya menyembunyikan fakta
 * bahwa frame yang sama dipakai dua kali.
 *
 * Tidak punya nomor dan tidak punya titik di rel — keduanya milik enam langkah.
 */
const CODA = {
  portrait: '/assets/story/01-daftar.webp',
  wide: '/assets/story/wide/01-daftar.webp',
  focus: '62% 50%',
  alt: 'Ilustrasi peserta mengisi formulir pendaftaran — frame yang sama dengan langkah pertama, diredupkan sebagai penutup siklus.',
} as const;

export interface Props {
  /** The six flow steps, straight from `FLOW_STEPS`. */
  steps: FilmStep[];
}

export default function StoryFilm({ steps }: Props) {
  const total = String(steps.length).padStart(2, '0');

  return (
    <div class="film" data-film>
      <div class="film-track" data-film-track>
        <div class="film-stage">
          {steps.map((step, i) => {
            const m = MEDIA[i];
            return (
              <article class={`film-ch${i === 0 ? ' is-on' : ''}`} data-film-ch>
                <div class="film-plate">
                  <picture>
                    <source media="(min-width: 861px)" srcset={m.wide} width="1536" height="904" />
                    <img
                      src={m.portrait}
                      alt={m.alt}
                      width="1024"
                      height="1464"
                      loading={i === 0 ? 'eager' : 'lazy'}
                      decoding="async"
                      class="film-img"
                      style={`object-position:${m.focus}`}
                    />
                  </picture>
                  {/* The clip duplicates the poster still, so it is decorative.
                      `aria-hidden` sits on the WRAPPER, not on the video:
                      `lint/a11y/noAriaHiddenOnFocusable` treats a `<video>` as
                      focusable and rejects the attribute on it, and swapping in
                      `role="presentation"` trips the opposite rule
                      (`noInteractiveElementToNoninteractiveRole`). A plain div is
                      neither, and the attribute inherits to the video.

                      DUA SUMBER, satu per tata letak. Klip potret tidak bisa
                      mengisi frame 16:9 tanpa membuang ~58% tingginya — terukur:
                      wajah memenuhi layar dan kepala terpotong di tepi bawah.
                      Jadi desktop memakai render lanskap dari plat `wide/` yang
                      sama, dan ponsel memakai render potret. Keduanya mulai dari
                      frame yang identik dengan poster masing-masing, jadi tidak
                      ada lompatan saat video mulai. Hanya SATU yang `display`
                      pada satu waktu; penggerak memilih lewat `data-vid`. */}
                  {m.mp4 || m.mp4w ? (
                    <div class="film-vidwrap" aria-hidden="true">
                      {m.mp4w ? (
                        <video
                          class="film-vid film-vid--w"
                          data-vid="w"
                          src={m.mp4w}
                          poster={m.wide}
                          muted
                          loop
                          playsInline
                          preload="none"
                        />
                      ) : null}
                      {m.mp4 ? (
                        <video
                          class="film-vid film-vid--p"
                          data-vid="p"
                          src={m.mp4}
                          poster={m.portrait}
                          muted
                          loop
                          playsInline
                          preload="none"
                        />
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div class="film-scrim" aria-hidden="true" />
                <div class="film-copy">
                  <span class="film-n">
                    {(i + 1).toString().padStart(2, '0')} <i>/ {total}</i>
                  </span>
                  <h3 data-lang={step.title.key}>{step.title.text}</h3>
                  <p class="film-body" data-lang={step.body.key}>
                    {step.body.text}
                  </p>
                </div>
              </article>
            );
          })}

          {/* CODA — lihat catatan di `CODA` di atas. `data-film-ch` sengaja
              dipasang supaya frame ini ikut matematika progres yang sama di
              `paint()`; yang tidak ia dapat hanyalah nomor babak dan titik rel.
              Badan teksnya memakai `.film-body` supaya tetap sampai pada ketukan
              kedua (38%), bukan muncul serentak dengan judulnya. */}
          <article class="film-ch film-coda" data-film-ch>
            <div class="film-plate">
              <picture>
                <source media="(min-width: 861px)" srcset={CODA.wide} width="1536" height="904" />
                <img
                  src={CODA.portrait}
                  alt={CODA.alt}
                  width="1024"
                  height="1464"
                  loading="lazy"
                  decoding="async"
                  class="film-img"
                  style={`object-position:${CODA.focus}`}
                />
              </picture>
            </div>
            <div class="film-scrim film-scrim-coda" aria-hidden="true" />
            <div class="film-copy film-copy-coda">
              <span class="film-n film-loop" aria-hidden="true">
                ↺
              </span>
              <p class="film-coda-t" data-lang="profile.loop_title">
                Dan peserta berikutnya mulai dari sini.
              </p>
              <p class="film-body film-coda-b" data-lang="profile.loop_body">
                Enam langkah yang sama, untuk setiap orang: dari formulir di Ponorogo sampai
                tiba di Jepang, lalu kembali ke awal.
              </p>
            </div>
          </article>

          <div class="film-hud" aria-hidden="true">
            <i class="film-x tl" />
            <i class="film-x tr" />
            <i class="film-x bl" />
            <i class="film-x br" />
          </div>
          <div class="film-rail" aria-hidden="true">
            {steps.map((_, i) => (
              <span class={`film-dot${i === 0 ? ' is-on' : ''}`} data-film-dot />
            ))}
          </div>
          <div class="film-foot" aria-hidden="true">
            <span class="film-brand">ASJ · Satu Jalan</span>
            <span class="film-coord" data-film-coord>
              PONOROGO · 7.86°S 111.46°E
            </span>
          </div>
          <div class="film-progress" aria-hidden="true">
            <i data-film-progress />
          </div>
        </div>
      </div>
    </div>
  );
}
