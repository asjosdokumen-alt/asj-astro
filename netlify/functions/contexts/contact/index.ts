/**
 * contexts/contact/index.ts — Public interface for the contact context
 *
 * Owns: database_asj_kontak (write), inbound public enquiries
 * Other contexts and surfaces import ONLY from this file.
 */
export { handleKirimPesanKontak } from './service';
