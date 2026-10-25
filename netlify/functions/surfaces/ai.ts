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
  // PUBLIC BY DESIGN — the `/siswa-baru` registration chat has no session. The
  // client posts it with `requireAuth: false` (SiswaBaruForm.test.tsx:104,
  // "pendaftaran siswa baru publik, tanpa sesi") and the handler itself takes no
  // sessionToken, so `s` is deliberately NOT forwarded. Do NOT "fix" this by
  // requiring a session: that would break public registration. The exposure is
  // bounded by the IP-only PUBLIC_AI_ACTIONS bucket in _lib/handlers.ts.
  processSiswaAIChat: async (p: unknown[], _s?: string) => {
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

  // ── Bank soal wawancara (mensetsu) ────────────────────────────────────────
  // Menggantikan simulator chat bebas: soal tetap (177 soal, 13 tahap) + isian
  // tiga lapis per soal.
  //
  // 🔴 ADMIN-ONLY SEJAK 2026-10-25 (keputusan pemilik: "untuk wawancara mending
  // kita tolak dulu, biar untuk internal dulu"). Sebelumnya `isOwnerOrAdmin`,
  // jadi kandidat bisa membuka miliknya sendiri lewat /wawancara. Sekarang
  // ketiga aksi ini `requireAdmin` — halaman publik hanya menampilkan pemberitahuan,
  // dan panel admin (TabPelamar, `adminMode`) tetap jalan karena sesinya admin.
  // Kalau fitur ini dibuka lagi untuk kandidat, kembalikan ke `isOwnerOrAdmin`
  // BERSAMAAN dengan menghapus kartu "belum dibuka" di MensetsuForm — dua tempat,
  // karena guard di sini yang sebenarnya menahan, bukan tampilannya.
  getBankWawancara: async (p: unknown[], s?: string) => {
    const { gabungBankDanJawaban } = await import('../_lib/wawancara/bank');
    const { requireAdmin } = await import('../contexts/identity');
    const guard = requireAdmin(s || '');
    if (guard.error) return { ...guard.error, message: 'Latihan wawancara sementara hanya untuk admin' };
    const wa = String(p?.[0] ?? '').trim();
    return { success: true, ...(await gabungBankDanJawaban(wa)) };
  },
  simpanJawabanWawancara: async (p: unknown[], s?: string) => {
    const { simpanJawaban } = await import('../_lib/wawancara/bank');
    const { requireAdmin } = await import('../contexts/identity');
    const guard = requireAdmin(s || '');
    if (guard.error) return { ...guard.error, message: 'Latihan wawancara sementara hanya untuk admin' };
    return simpanJawaban(String(p?.[0] ?? ''), String(p?.[1] ?? ''), (p?.[2] ?? {}) as Record<string, unknown>, 'siswa');
  },
  terjemahkanJawabanWawancara: async (p: unknown[], s?: string) => {
    const { terjemahkanJawaban } = await import('../_lib/wawancara/bank');
    const { requireAdmin } = await import('../contexts/identity');
    const guard = requireAdmin(s || '');
    if (guard.error) return { ...guard.error, message: 'Latihan wawancara sementara hanya untuk admin' };
    return terjemahkanJawaban(String(p?.[0] ?? ''), String(p?.[1] ?? ''), String(p?.[2] ?? ''));
  },
  getLinkWawancara: async (p: unknown[], s?: string) => {
    const { linkWawancara } = await import('../_lib/wawancara/bank');
    const { requireAdmin } = await import('../contexts/identity');
    // Minting a link embeds a candidate's WA + nama — admin-only, sama seperti
    // generateAiFormBridge.
    const guard = requireAdmin(s || '');
    if (guard.error) return guard.error;
    const { env } = await import('../_lib/env');
    // Tanpa env ini link akan menunjuk domain yang salah, dan siswa menerima
    // tautan mati — lebih baik gagal dengan pesan jelas daripada menebak host.
    const base = String(env('NETLIFY_SITE_URL') || '').replace(/\/$/, '');
    if (!base) {
      return { success: false, message: 'NETLIFY_SITE_URL belum diset di server; link tidak bisa dibuat.' };
    }
    return linkWawancara(String(p?.[0] ?? ''), String(p?.[1] ?? ''), base);
  },
};
