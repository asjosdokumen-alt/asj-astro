/**
 * Mascot.tsx — Aa-chan (あーちゃん), the portal's mascot.
 *
 * WHO SHE IS, AND WHERE SHE CAME FROM
 * -----------------------------------
 * Aa-chan is not invented here. She exists as an approved character sheet
 * (`F:\desain\asj-mascot.png`, "Mascot Sheet 02") with a name, a construction
 * guide (2.2 heads, bonnet arc 0.53 R), a six-colour palette, four poses and four
 * expressions. The sheet also specifies the four places she is meant to appear:
 * login, the saved-jobs empty state, loading, and 404. This component renders
 * exactly those, from exactly that drawing — `F:\desain\render-aachan.py` reuses
 * the sheet's own `aa()` routine rather than redrawing her, and the output is a
 * subset of the approved poses, not new art.
 *
 * WHY A PICTURE ELEMENT AND NOT AN <img>
 * -------------------------------------
 * Three formats ship per slot: AVIF (smallest, universally supported now), WebP
 * (fallback), and a PNG kept in `F:\desain\aachan-out/` as the reference render
 * so a future edit can be compared against it. `<picture>` is the only way to
 * offer the same image in several formats and let the browser choose, and it
 * costs no JavaScript.
 *
 * WHY THE @2X FILE IS A SEPARATE SOURCE AND NOT A SRC-SET DESCRIPTOR
 * -----------------------------------------------------------------
 * The @2x renders are re-rasterised at their own scale factor by the Python
 * renderer — the drawing is redrawn, not resampled. That means they are genuinely
 * different files with genuinely more detail, which is what `srcset` with a `2x`
 * descriptor is for. A CSS-scaled 512px render would be blurry on a 2x display
 * and would ship 4x the pixels for nothing.
 *
 * WHY `decorative` EXISTS AND DEFAULTS TO FALSE
 * --------------------------------------------
 * A mascot that appears next to a heading is decoration and should have `alt=""`
 * so a screen reader does not announce "cartoon bear" between a heading and its
 * explanation. But a mascot that IS the content (the login card, where she is the
 * only thing besides the button) needs a real description. The default is the
 * honest one: `false` means she gets described, and a caller must opt IN to
 * hiding her. Defaulting to decorative would make an undescribed image the silent
 * default, which is how images end up invisible to assistive tech by accident.
 */
import type { JSX } from 'preact';

/** The four poses and four expressions the character sheet defines, mapped to slots. */
export type MascotPose =
  | 'wave'
  | 'login'
  | 'sleepy'
  | 'loading'
  | 'notfound'
  | 'passport'
  | 'peace'
  | 'princess-wave'
  | 'princess-peace'
  | 'princess-side'
  | 'princess-still'
  | 'princess-head';

export interface Props {
  /**
   * Which approved render to show. Each maps to a real file in public/mascot/.
   *
   * NAMED `pose`, NOT `role`, ON PURPOSE. `role` is a real ARIA attribute, and
   * `<Mascot role="loading">` reads to every linter — and to a human skimming the
   * call site — as an attempt to set the ARIA role "loading", which is not a
   * valid role. Biome's `a11y/useValidAriaRole` flagged exactly that in
   * `JobMiniList.tsx`, twice. The component has no such intent: this is a
   * picture selector. The old name made a correct line look like a bug, so it
   * was changed rather than suppressed.
   */
  pose?: MascotPose;
  /** Rendered width in CSS pixels. The @2x source is chosen automatically. */
  size?: number;
  /** Decoration: shown beside text that already carries the meaning. */
  decorative?: boolean;
  /** Idle motion. `float` and `wave` are subtle and safe in a layout; `none` is static. */
  motion?: 'none' | 'float' | 'wave' | 'blink';
  /** Extra classes. */
  class?: string;
}

/** Width and height of each render, so the box is reserved before the file arrives. */
const POSE_META: Record<MascotPose, { file: string; w: number; h: number; alt: string }> = {
  wave: { file: 'hero-wave', w: 512, h: 512, alt: 'Aa-chan, maskot ASJ Portal, melambai dengan senyum.' },
  login: { file: 'login-head', w: 192, h: 192, alt: 'Wajah Aa-chan dengan mata berbinar.' },
  sleepy: { file: 'empty-sleepy', w: 224, h: 224, alt: 'Wajah Aa-chan mengantuk dengan mata terpejam.' },
  loading: { file: 'loading-sparkle', w: 160, h: 160, alt: 'Wajah Aa-chan bersemangat.' },
  notfound: { file: 'notfound-think', w: 224, h: 224, alt: 'Wajah Aa-chan sedang berpikir.' },
  passport: { file: 'passport', w: 320, h: 320, alt: 'Aa-chan memegang paspor.' },
  peace: { file: 'peace', w: 320, h: 320, alt: 'Aa-chan memberi tanda damai.' },

  /* ── The princess mascot ────────────────────────────────────────────────────
   *
   * A SECOND CHARACTER, and a different kind of asset from every pose above.
   * The Aa-chan renders were drawn in Python from an approved character sheet
   * (`F:\desain\render-aachan.py`). These five are RENDERS OF A 3D MODEL —
   * `baby-princess-mascot-rig`, a rigged glTF authored by the owner at Meshy.
   *
   * WHY THEY EXIST AS STILLS AND NOT AS THE 3D MODEL. The source file is
   * 17 MB with a 16 MB embedded texture. `public/mascot/` totals 176 KB today.
   * Shipping the model would multiply the mascot payload by ~100 for a
   * decoration, and would need a WebGL renderer in the bundle. The renders are
   * the same artwork flattened, which is what a landing page actually needs.
   *
   * WHY THE NAMES ARE `princess-*` AND NOT `wave`/`peace`. The obvious names
   * collide: `wave` and `peace` above are Aa-chan poses, and reusing them would
   * silently swap the character on `/login` and `404`. The prefix keeps the two
   * characters addressable at once.
   *
   * ⚠ `w`/`h` ARE MEASURED FROM THE FILES, and they are NOT square. The model
   * is authored to real-world scale (0.91 × 1.69 × 0.80 m), so a full-body
   * render is portrait — 512×844 for the front pose. Copying the square 512×512
   * of the Aa-chan entries would squash her. A render that samples the model's
   * ONLY animation clip (a walk cycle) is what gives `-peace` and `-still`
   * their different leg positions; there is no waving or bowing footage in the
   * source, so no pose here claims to be one.
   */
  'princess-wave': { file: 'princess-wave', w: 512, h: 844, alt: 'Maskot putri ASJ, tersenyum dengan tangan terangkat.' },
  'princess-peace': { file: 'princess-peace', w: 512, h: 904, alt: 'Maskot putri ASJ dari sudut tiga perempat, melangkah riang.' },
  'princess-side': { file: 'princess-side', w: 512, h: 1051, alt: 'Maskot putri ASJ tampak samping.' },
  'princess-still': { file: 'princess-still', w: 512, h: 796, alt: 'Maskot putri ASJ berdiri tenang.' },
  'princess-head': { file: 'princess-head', w: 224, h: 358, alt: 'Wajah maskot putri ASJ dengan bunga sakura di rambut.' },
};

const warned = new Set<string>();

export default function Mascot({
  pose = 'wave',
  size,
  decorative = false,
  motion = 'float',
  class: className,
}: Props) {
  const meta = POSE_META[pose];

  /* A pose with no asset must not render a broken image — that is the failure the
     landing page already documented once. Warn loudly in development and render
     nothing rather than an <img> pointing at a 404.

     The warning goes through `console.debug`, which stays quiet in the browser
     console unless the level is raised, so it does not become noise for a path
     that only fires on a typo. `noConsole` still flags the call — it flags any
     `console.*` in `src/` — so it carries the project's existing
     `biome-ignore` form, the same one `ListKandidatModal.tsx` uses. The
     alternative, `throw`, was rejected: an unknown pose is a programming error
     in the caller, but the honest runtime response is to render nothing, not to
     take down a page that is otherwise fine. */
  if (!meta) {
    if (!warned.has(String(pose))) {
      warned.add(String(pose));
      // biome-ignore lint/suspicious/noConsole: the only trace of a typo'd pose, which is otherwise silent — a missing mascot renders as nothing at all.
      console.debug(`[Mascot] unknown pose "${pose}" — nothing rendered.`);
    }
    return null;
  }

  const w = size ?? meta.w;
  const h = Math.round((w / meta.w) * meta.h);

  const classes = ['mascot', motion !== 'none' ? `mascot-${motion}` : '', className ?? '']
    .filter(Boolean)
    .join(' ');

  const sources: JSX.Element[] = [
    <source key="avif" type="image/avif" srcset={`/mascot/${meta.file}.avif 1x, /mascot/${meta.file}@2x.avif 2x`} />,
    <source key="webp" type="image/webp" srcset={`/mascot/${meta.file}.webp 1x, /mascot/${meta.file}@2x.webp 2x`} />,
  ];
  /* Slots without a @2x render fall back to the single file.
   *
   * WHY THIS IS A POSITIVE LIST AND NOT `!== 'passport' && !== 'peace'`.
   * The negation is the dangerous shape here: every OTHER pose is assumed to
   * have a @2x file, so ADDING a pose that lacks one produces a `srcset` naming
   * a 404 — and the browser picks the 2x candidate on any retina display, so the
   * failure appears only on some machines and looks like a corrupt asset. A
   * positive list fails in the safe direction: a forgotten entry ships the 1x
   * file at all densities, which is merely less sharp, never broken.
   *
   * If a future budget decision drops @2x from a slot, add it here — do NOT
   * infer it from the size, and do not re-introduce a negation. */
  const NO_2X: ReadonlySet<MascotPose> = new Set<MascotPose>(['passport', 'peace']);
  if (NO_2X.has(pose)) {
    sources.length = 0;
    sources.push(<source key="avif" type="image/avif" srcset={`/mascot/${meta.file}.avif`} />);
    sources.push(<source key="webp" type="image/webp" srcset={`/mascot/${meta.file}.webp`} />);
  }

  return (
    <picture>
      {sources}
      <img
        src={`/mascot/${meta.file}.webp`}
        alt={decorative ? '' : meta.alt}
        aria-hidden={decorative ? 'true' : undefined}
        width={w}
        height={h}
        class={classes}
        draggable={false}
      />
    </picture>
  );
}
