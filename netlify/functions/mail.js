'use strict';
/**
 * mail.js — Application review surface entry point
 *
 * Handles: reviewForm, approveForm, rejectForm, deleteForm, tandaiDibacaForm
 */
const { makeSurfaceHandler } = require('./_lib/netlify-wrapper-surface');
const { MAIL_ACTIONS } = require('./surfaces/mail');
exports.handler = makeSurfaceHandler(MAIL_ACTIONS, [
  'reviewForm', 'approveForm', 'rejectForm', 'deleteForm', 'tandaiDibacaForm',
]);
