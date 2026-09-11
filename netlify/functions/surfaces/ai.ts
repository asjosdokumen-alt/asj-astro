/**
 * surfaces/ai.ts — AI surface (chat, interview, CV)
 *
 * Phase 5: Actions that would hold a function slot too long are enqueued as
 * background jobs. Returns 202 + jobId. Client polls via getJobStatus.
 *
 * (Note: "too long" is an occupancy judgement, not the platform ceiling. The
 * Netlify synchronous limit is 60 s; see kernel/deadline.ts.)
 */
import { handleGetJobStatus } from '../_lib/kernel/job-queue';

/**
 * A16 parity (2026-09-05): processAiInterview used to be enqueued as an
 * 'ai.interview' background job — but an interactive interview chat turn has
 * to feel live (legacy callAPI returns the reply synchronously). With the
 * 2-minute sweep the candidate waited minutes per answer. Like the admin AI
 * copilot chat (A11), it now calls the real handler synchronously. The sweep
 * worker for 'ai.interview' stays registered so legacy queued jobs still
 * drain. No action currently requires background enqueue here.
 */
const BACKGROUND_ACTIONS = new Set<string>([]);

export const AI_ACTIONS: Record<string, (payload: unknown[], sessionToken?: string) => Promise<unknown>> = {
  processAIChat: async (p: unknown[], s?: string) => {
    const ai = await import('../contexts/ai-orchestration');
    return ai.handleProcessAIChat(p, s);
  },
  processSiswaAIChat: async (p: unknown[], s?: string) => {
    const ai = await import('../contexts/ai-orchestration');
    return ai.handleProcessSiswaAIChat(p);
  },
  processAiInterview: async (p: unknown[], s?: string) => {
    const ai = await import('../_lib/ai/chat');
    return ai.handleProcessAiInterview(p, s);
  },
  processAdminAIChat: async (p: unknown[], s?: string) => {
    const { handleProcessAdminAIChat } = await import('../_lib/ai/chat');
    return handleProcessAdminAIChat(p, s);
  },
  generateWawancaraModel: async (p: unknown[], s?: string) => {
    const { handleGenerateWawancaraModel } = await import('../_lib/ai/chat');
    return handleGenerateWawancaraModel(p, s);
  },
  simpanHasilWawancara: async (p: unknown[], s?: string) => {
    const { handleSimpanHasilWawancara } = await import('../_lib/ai/chat');
    return handleSimpanHasilWawancara(p, s);
  },
  selesaikanWawancara: async (p: unknown[], s?: string) => {
    const { handleSelesaikanWawancara } = await import('../_lib/ai/chat');
    return handleSelesaikanWawancara(p, s);
  },
  getHasilWawancara: async (p: unknown[], s?: string) => {
    const { handleGetHasilWawancara } = await import('../_lib/ai/chat');
    return handleGetHasilWawancara(p, s);
  },
  getAdminAiContext: async (p: unknown[], s?: string) => {
    const { handleGetAdminAiContext } = await import('../_lib/ai/cv');
    return handleGetAdminAiContext(p, s);
  },
  buildAdminAiCandidateSummary: async (p: unknown[], s?: string) => {
    const { handleBuildAdminAiCandidateSummary } = await import('../_lib/ai/cv');
    return handleBuildAdminAiCandidateSummary(p, s);
  },
  submitDataAsj: async (p: unknown[], s?: string) => {
    const { handleSubmitDataAsj } = await import('../_lib/ai/cv');
    return handleSubmitDataAsj(p, s);
  },
  simpanDataTtdNaitei: async (p: unknown[], s?: string) => {
    const { handleSimpanDataTtdNaitei } = await import('../_lib/ai/cv');
    return handleSimpanDataTtdNaitei(p, s);
  },
  saveSignature: async (p: unknown[], s?: string) => {
    const { handleSaveSignature } = await import('../_lib/ai/cv');
    return handleSaveSignature(p, s);
  },
  processUploadDoc: async () => ({
    success: false,
    message: 'processUploadDoc has been moved to /ingest function',
  }),
  getJobStatus: async (p: unknown[], s?: string) => handleGetJobStatus(p, s),
};
