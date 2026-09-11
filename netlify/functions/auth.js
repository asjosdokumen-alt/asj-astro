'use strict';
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
const { makeSurfaceHandler } = require('./_lib/netlify-wrapper-surface');
const { AUTH_ACTIONS } = require('./surfaces/auth');
exports.handler = makeSurfaceHandler(AUTH_ACTIONS, [
  'checkAdminMaster', 'checkAdminPersonal', 'refreshAdminSession',
  'loginKandidat', 'refreshKandidatSession', 'daftarKandidat',
  'gantiPasswordKandidat', 'registerFcmToken', 'logout',
]);
