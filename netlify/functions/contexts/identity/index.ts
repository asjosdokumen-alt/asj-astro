/**
 * contexts/identity/index.ts — Public interface for the identity context
 *
 * Other contexts and surfaces import ONLY from this file.
 * Never import from ./service.ts or ./repository.ts directly.
 */

export {
  masterPins,
  checkAdminMaster,
  checkAdminPersonal,
  refreshAdminSession,
  loginKandidat,
  refreshKandidatSession,
  registerKandidat,
  changePassword,
  registerFcmToken,
  revokeSession,
  verifyToken,
  requireRole,
  requireAdmin,
  isOwnerOrAdmin,
} from './service';
