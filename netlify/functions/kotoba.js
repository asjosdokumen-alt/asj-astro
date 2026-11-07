/**
 * kotoba.js — permukaan latihan & asesmen siswa.
 *
 * Dipisah dari ai-chat.js 2026-11-05 karena data banknya (ssw 200 KB + bank
 * 120 KB + n5 24 KB + matematika 15 KB) tidak pernah dipakai jalur chat, dan
 * membuat ai-chat.js melewati plafon keras 600 KB (terukur 603,5 KB).
 *
 * 2026-11-06: entry ini juga menampung TES_ACTIONS (MBTI & Tes Mata Pra-MCU).
 * Bukan karena "tes itu latihan", tetapi karena keduanya berbagi sifat yang
 * sama: dipanggil siswa, satu query pendek, dan tidak pernah bersamaan dengan
 * jalur chat. Menambah fungsi Netlify baru hanya untuk empat action akan
 * menambah satu cold start dan satu baseline bundle tanpa memisahkan apa pun.
 */
import { adapt } from './_lib/netlify-adapter.js';
import { makeSurfaceHandler } from './_lib/netlify-wrapper-surface.js';
import { KOTOBA_ACTIONS } from './surfaces/kotoba.js';
import { TES_ACTIONS } from './surfaces/tes.js';
export default adapt(makeSurfaceHandler([KOTOBA_ACTIONS, TES_ACTIONS], [
  'getBankKotoba', 'getBankSsw', 'getBankMatematika',
  'getStatusTes', 'simpanHasilTes', 'getHasilTesAdmin', 'setTesAktif',
  // Asesmen penalaran (2026-11-07). Daftar ini adalah gerbang entry: action
  // yang tidak disebut di sini dijawab 404 oleh fungsi ini, lalu klien
  // mengulang ke catch-all — jalan, tetapi lewat dua perjalanan dan tanpa
  // seorang pun menyadarinya. Gerbangnya di `action-registry.test.ts`.
  'getSoalIq', 'simpanHasilIq', 'resetHasilIq', 'tulisMataKeCv',
]));
