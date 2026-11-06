/**
 * job-docs.js — unduhan ZIP dokumen per loker (SATU action).
 *
 * Entry sempit, disengaja: `archiver` + rantai `readable-stream` hanya dipakai
 * di sini. Sebelumnya action ini menumpang `files.js` dan membawa ~70 KB
 * dependensi ZIP ke setiap unggahan kandidat (terukur 2026-11-06: files.js
 * 600,1 KB, melewati plafon keras 600 KB).
 */
import { adapt } from './_lib/netlify-adapter.js';
import { makeSurfaceHandler } from './_lib/netlify-wrapper-surface.js';
import { JOB_DOCS_ACTIONS } from './surfaces/job-docs.js';

export default adapt(makeSurfaceHandler([JOB_DOCS_ACTIONS], ['downloadJobDocs']));
