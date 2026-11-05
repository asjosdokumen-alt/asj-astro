/**
 * kotoba.js — bank soal latihan (kosakata buku, SSW, matematika).
 *
 * Dipisah dari ai-chat.js 2026-11-05 karena data banknya (ssw 200 KB + bank
 * 120 KB + n5 24 KB + matematika 15 KB) tidak pernah dipakai jalur chat, dan
 * membuat ai-chat.js melewati plafon keras 600 KB (terukur 603,5 KB).
 * Entry ini hanya memuat surface kotoba — tidak ada model, tidak ada chat.
 */
import { adapt } from './_lib/netlify-adapter.js';
import { makeSurfaceHandler } from './_lib/netlify-wrapper-surface.js';
import { KOTOBA_ACTIONS } from './surfaces/kotoba.js';
export default adapt(makeSurfaceHandler(KOTOBA_ACTIONS, [
  'getBankKotoba', 'getBankSsw', 'getBankMatematika',
]));
