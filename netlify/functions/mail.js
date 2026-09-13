
/**
 * mail.js — Application review surface entry point
 *
 * Handles: reviewForm, approveForm, rejectForm, deleteForm, hapusFormTerpilih,
 *          tandaiDibacaForm
 */
import { adapt } from './_lib/netlify-adapter.js';
import { makeSurfaceHandler } from './_lib/netlify-wrapper-surface.js';
import { MAIL_ACTIONS } from './surfaces/mail.js';
export default adapt(makeSurfaceHandler(MAIL_ACTIONS, [
  'reviewForm', 'approveForm', 'rejectForm', 'deleteForm', 'hapusFormTerpilih',
  'tandaiDibacaForm',
]));
