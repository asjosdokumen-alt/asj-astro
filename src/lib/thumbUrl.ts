/**
 * thumbUrl.ts — request the SIZE WE RENDER, not the size we stored.
 *
 * WHY THIS EXISTS (egress, 2026-10-19)
 * ------------------------------------
 * The job board paints each poster at 48x64 CSS px (LokerTable) and 80x112
 * (LokerDetailModal), but `src` pointed at the ORIGINAL upload. Measured on the
 * live site, one cold desktop visit that clicks "Muat Lebih Banyak" five times
 * pulled **4.9 MB of posters to fill 48px thumbnails** — 3.99 MB from Cloudinary
 * and 0.56 MB from Supabase Storage. Supabase Storage serves these objects with
 * `Cache-Control: no-cache`, so every later view pays for them again; that is
 * the monthly-egress ceiling the owner keeps hitting.
 *
 * Both providers can resize on delivery, so the fix is a URL, not a migration:
 *
 *   Cloudinary  .../image/upload/v1787886300/DOKUMENASJ/663_dqyhli.jpg
 *            -> .../image/upload/w_96,h_128,c_fill,q_auto,f_auto/v1787886300/…
 *               163 KB -> ~4 KB, and `immutable` for 30 days (no repeat cost)
 *
 *   Supabase    …/storage/v1/object/public/asj-files/jobs/…/PAMFLET_….jpg
 *            -> …/storage/v1/render/image/public/asj-files/jobs/…?width=96…
 *               150 KB -> 5.8 KB (measured 2026-10-19 on the live project)
 *
 * `q_auto,f_auto` on Cloudinary additionally serves AVIF/WebP to browsers that
 * accept them, so the win is larger than the dimension cut alone.
 *
 * WHAT MUST NOT BE TRANSFORMED
 * ----------------------------
 * - `/raw/upload/` (xlsx/pdf) — Cloudinary does not resize non-images, and an
 *   inserted segment there produces a 404.
 * - Supabase objects that are not images (PDF/xlsx in the same bucket) — the
 *   render endpoint answers 400 for them. Hence the extension check.
 * - A URL that ALREADY carries a transformation. Re-inserting would stack
 *   `w_96` on top of whatever the caller asked for.
 * - Anything else (a CDN we do not know, a data: URL, `-`). Returned untouched,
 *   so callers can pass any string they already had.
 *
 * ⚠ DEPENDENCY: Supabase's `render/image` endpoint is a plan feature. Measured
 * working on the live project on 2026-10-19 (`200`, `x-transformations:
 * height:128,width:96`). If the project is ever moved to a plan without image
 * transformations, those URLs answer 402 and thumbnails disappear — the honest
 * symptom is a broken poster, not a wrong number.
 */

const CLOUDINARY_IMAGE = /^(https?:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/i;
const SUPABASE_PUBLIC = /^(https?:\/\/[^/]+)\/storage\/v1\/object\/public\/(.+)$/i;
const SUPABASE_RENDER = /\/storage\/v1\/render\/image\//i;
/** Cloudinary transformation params look like `w_96`, `c_fill`, `q_auto`. */
const CLOUDINARY_PARAM = /^[a-z]{1,3}_/;
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif)$/i;

/**
 * Thumbnail URL for `raw`, or `raw` itself when it cannot (or must not) be
 * transformed. Never throws: callers pass whatever the database held.
 */
export function thumbUrl(raw: string | null | undefined, w = 96, h = 128): string {
  const url = String(raw ?? '').trim();
  if (!url || url === '-') return url;

  const cdn = CLOUDINARY_IMAGE.exec(url);
  if (cdn) {
    const rest = cdn[2];
    const first = rest.split('/')[0] || '';
    // Already transformed? Leave the caller's decision alone.
    if (CLOUDINARY_PARAM.test(first)) return url;
    return `${cdn[1]}w_${w},h_${h},c_fill,q_auto,f_auto/${rest}`;
  }

  if (SUPABASE_RENDER.test(url)) return url;
  const sb = SUPABASE_PUBLIC.exec(url);
  if (sb) {
    const path = sb[2].split('?')[0];
    if (!IMAGE_EXT.test(path)) return url;
    return `${sb[1]}/storage/v1/render/image/public/${path}?width=${w}&height=${h}&resize=cover`;
  }

  return url;
}
