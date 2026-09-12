
/**
 * auth.js — Auth surface entry point
 *
 * Handles: checkAdminMaster, checkAdminPersonal, refreshAdminSession,
 *          loginKandidat, refreshKandidatSession, daftarKandidat,
 *          gantiPasswordKandidat, registerFcmToken, logout
 *
 * Surface-specific routing enables concurrent scaling:
 * auth requests don't block AI or document processing.
 */
import { adapt } from './_lib/netlify-adapter.js';
import { makeSurfaceHandler } from './_lib/netlify-wrapper-surface.js';
import { AUTH_ACTIONS } from './surfaces/auth.js';
export default adapt(makeSurfaceHandler(AUTH_ACTIONS, [
  'checkAdminMaster', 'checkAdminPersonal', 'refreshAdminSession',
  'loginKandidat', 'refreshKandidatSession', 'daftarKandidat',
  'gantiPasswordKandidat', 'registerFcmToken', 'logout',
]));
