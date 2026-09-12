// ingest.js — Standalone wrapper for document ingestion (admin AI Copilot).
//
// HANYA membundel surfaces/ingest.ts + deps-nya. Function lain TIDAK perlu
// membundel library berat ini.
//
// Dipanggil frontend: `parseDokumenBiodata` — alur dua langkah
// (parse → submitMasterForm) di src/components/admin/AdminAiCopilot.tsx.
//
// RIWAYAT (2026-09-12): file ini dulu sebuah stub yang selalu menjawab
// NOT_IMPLEMENTED, sementara implementasi aslinya hidup di surfaces/ingest.ts
// dan hanya bisa dicapai lewat catch-all bridge-links (karena parseDokumenBiodata
// tidak terdaftar di SURFACE_ENDPOINTS frontend). Akibatnya fitur admin yang
// benar-benar dipakai menggantung pada catch-all. Sekarang entry point inilah
// yang melayaninya secara langsung.
//
// Penanganan error TIDAK ditulis di sini: makeSurfaceHandler + kernel sudah
// memetakan error ke GENERIC_ERROR_MESSAGE (satu pemilik pesan, playbook §3.3
// "never leak"), jadi menambah catch kedua hanya akan menutupi bug dan
// menduplikasi pesan generik.
import { adapt } from './_lib/netlify-adapter.js';
import { makeSurfaceHandler } from './_lib/netlify-wrapper-surface.js';
import { INGEST_ACTIONS } from './surfaces/ingest.js';

export default adapt(makeSurfaceHandler(INGEST_ACTIONS, ['parseDokumenBiodata']));
