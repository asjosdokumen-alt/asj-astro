
/**
 * ai-chat.js — AI surface entry point
 *
 * Handles: processAIChat, processSiswaAIChat, processAdminAIChat,
 *          processAiInterview, processUploadDoc,
 *          generateWawancaraModel, simpanHasilWawancara, selesaikanWawancara,
 *          getHasilWawancara, getAdminAiContext, buildAdminAiCandidateSummary,
 *          submitDataAsj, simpanDataTtdNaitei, saveSignature,
 *          getBankWawancara, simpanJawabanWawancara,
 *          terjemahkanJawabanWawancara, getLinkWawancara,
 *          getBankKotoba, getBankMatematika
 *
 * Bank soal wawancara (2026-10-25) sengaja menumpang entry ini, bukan fungsi
 * baru: satu fungsi tambahan berarti cold start tambahan dan bobot bundle yang
 * harus di-baseline ulang di gate bundle:size, sementara beban kerjanya sama —
 * membaca satu tabel + satu panggilan model.
 *
 * AI requests are slow (5-30s) — separate function prevents blocking other surfaces.
 *
 * `processAiFormSubmit` was removed 2026-09-12: it was a ghost name — no
 * implementation anywhere, never called by src/, and zero occurrences in the
 * legacy codebase it was supposedly carried over from. It only ever produced
 * NOT_IMPLEMENTED. `processUploadDoc` is kept deliberately: it is a legacy
 * compatibility shim that returns a "moved to /ingest" notice rather than a
 * silent failure.
 */
import { adapt } from './_lib/netlify-adapter.js';
import { makeSurfaceHandler } from './_lib/netlify-wrapper-surface.js';
import { AI_ACTIONS } from './surfaces/ai.js';
export default adapt(makeSurfaceHandler(AI_ACTIONS, [
  'processAIChat', 'processSiswaAIChat', 'processAdminAIChat',
  'processAiInterview', 'processUploadDoc',
  'generateWawancaraModel', 'simpanHasilWawancara', 'selesaikanWawancara',
  'getHasilWawancara', 'getAdminAiContext', 'buildAdminAiCandidateSummary',
  'submitDataAsj', 'simpanDataTtdNaitei', 'saveSignature', 'getJobStatus',
  'getBankWawancara', 'simpanJawabanWawancara',
  'terjemahkanJawabanWawancara', 'getLinkWawancara',
  // Deterministic "Terjemahkan semua kolom" — see surfaces/ai.ts.
  'terjemahkanKolomCv',
  // Rekaman suara Mode Simulasi → teks (tanpa SpeechRecognition).
  'transkripsikanSuara',
  'getBankKotoba', 'getBankMatematika',
]));
