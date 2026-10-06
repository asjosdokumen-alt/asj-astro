/**
 * surfaces/auth.ts — Auth surface (narrow registry)
 *
 * One of 8 deployment surfaces. Handles only identity-related actions:
 *   checkAdminMaster, checkAdminPersonal, refreshAdminSession,
 *   loginKandidat, refreshKandidatSession, daftarKandidat,
 *   gantiPasswordKandidat, registerFcmToken
 *
 * This surface imports ONLY from contexts/identity — never from other
 * contexts or from _lib/ directly (except kernel utilities).
 *
 * MIGRATION NOTE:
 *   This surface is currently a thin wrapper. The old actions-auth.ts
 *   remains as the dispatcher entry point until all surfaces are extracted.
 *   After Phase 4, the dispatcher routes directly to surface registries.
 */

import { validatePayload, schemas } from '../_lib/kernel/validate';
import { normalizeWa } from '../shared/wa-rules';
import * as identity from '../contexts/identity';

/**
 * Surface registry: action name → handler function.
 * Used by the dispatcher to route requests.
 */
export const AUTH_ACTIONS: Record<string, (payload: unknown[], sessionToken?: string) => Promise<unknown>> = {
  checkAdminMaster: async (payload) => {
    const [pin] = validatePayload(payload, schemas.adminMasterPin);
    return identity.checkAdminMaster(pin);
  },

  checkAdminPersonal: async (payload) => {
    const [name, pin] = validatePayload(payload, schemas.adminPersonalPin);
    return identity.checkAdminPersonal(name, pin);
  },

  refreshAdminSession: async (payload) => {
    const [rt] = validatePayload(payload, schemas.refreshToken);
    return identity.refreshAdminSession(rt);
  },

  loginKandidat: async (payload) => {
    const [rawWa, password] = validatePayload(payload, schemas.kandidatLogin);
    const wa = normalizeWa(rawWa);
    return identity.loginKandidat(wa, password);
  },

  refreshKandidatSession: async (payload) => {
    const [rt] = validatePayload(payload, schemas.refreshToken);
    return identity.refreshKandidatSession(rt);
  },

  daftarKandidat: async (payload) => {
    const [nama, rawWa, password, usia] = validatePayload(payload, schemas.kandidatRegister);
    const wa = normalizeWa(rawWa);
    return identity.registerKandidat(nama, wa, password, usia);
  },

  gantiPasswordKandidat: async (payload, sessionToken) => {
    const [rawWa, lama, baru] = validatePayload(payload, schemas.gantiPassword);
    const wa = normalizeWa(rawWa);
    // A08 fix: legacy contract (actions-auth.ts handleGantiPasswordKandidat)
    // is candidate-owner-ONLY — an admin or another candidate must never
    // change a password, and rejection is sessionInvalid before any DB read.
    // isOwnerOrAdmin stays for admin document/catalog reads, not passwords.
    const owner = identity.requireRole(sessionToken || '', 'kandidat');
    if ('error' in owner) return owner.error;
    if (normalizeWa(owner.token.wa || '') !== wa) {
      return { success: false, sessionInvalid: true, message: 'Sesi kandidat tidak valid' };
    }
    return identity.changePassword(wa, lama, baru);
  },

  registerFcmToken: (payload, sessionToken) => identity.registerFcmToken(payload, sessionToken),

  logout: async () => ({ success: true }),
};
