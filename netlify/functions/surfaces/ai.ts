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

/**
 * Penjaga bersama tiga aksi bank soal wawancara (mensetsu).
 *
 * RIWAYAT, jangan dibalik tanpa membaca ini:
 *   • sebelum 2026-10-25 ketiganya `isOwnerOrAdmin` — kandidat mana pun yang
 *     punya sesi bisa membuka 177 soalnya sendiri;
 *   • 2026-10-25 pemilik meminta "tolak dulu, biar untuk internal dulu" ⇒
 *     `requireAdmin`, dan halaman publik berhenti di kartu "belum dibuka";
 *   • 2026-10-26 pemilik menemukan murid VIP-nya (ASJ00188) tetap tidak bisa
 *     masuk — kartu penutup itu tidak pernah membaca flag siswa. "Internal"
 *     ternyata = SISWA, jadi aturannya sekarang:
 *
 *       admin  → selalu boleh (panel TabPelamar memanggil dengan `adminMode`);
 *       kandidat → hanya WA-nya SENDIRI (`isOwnerOrAdmin`) DAN bertanda siswa
 *                  ASJ (`statusVip`: `[VIP]` atau `[KELAS xx]`).
 *
 * Konsekuensi yang diterima pemilik: 136 dari 226 kandidat tidak bertanda siswa,
 * jadi tautan `/wawancara?wa=…` yang terlanjur dibagikan ke mereka akan berhenti
 * di kartu "khusus siswa ASJ" — bukan error, tapi juga bukan bank soal.
 *
 * `null` = boleh lanjut; selain itu = objek galat siap dikirim ke klien.
 */
async function tolakKecualiSiswa(sessionToken: string | undefined, wa: string) {
  const { isOwnerOrAdmin, requireAdmin } = await import('../contexts/identity');
  if (!requireAdmin(sessionToken || '').error) return null;
  if (!isOwnerOrAdmin(sessionToken, wa)) {
    return { success: false, sessionInvalid: true, message: 'Sesi tidak valid' };
  }
  const { statusVip } = await import('../_lib/wawancara/bank');
  const vip = await statusVip(wa);
  // `null` = pemeriksaan gagal (DB tidak terjangkau). Jangan bilang "bukan
  // siswa": itu menuduh kandidat atas kegagalan kita sendiri.
  if (vip === null) {
    return { success: false, message: 'Gagal memeriksa status siswa. Coba lagi sebentar.' };
  }
  if (!vip) {
    return {
      success: false,
      isVip: false,
      message: 'Latihan wawancara khusus siswa ASJ (VIP / Kelas LPK).',
    };
  }
  return null;
}

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
  // 🔴 SISWA ASJ SAJA SEJAK 2026-10-26 — lihat `tolakKecualiSiswa` di atas untuk
  // riwayat lengkapnya (25 Okt: admin-only; 26 Okt: dibuka lagi untuk siswa).
  // Halaman publik menampilkan gerbang login lalu kartu "khusus siswa ASJ";
  // panel admin (TabPelamar, `adminMode`) tetap jalan karena sesinya admin.
  getBankWawancara: async (p: unknown[], s?: string) => {
    const wa = String(p?.[0] ?? '').trim();
    const tolak = await tolakKecualiSiswa(s, wa);
    if (tolak) return tolak;
    const { gabungBankDanJawaban } = await import('../_lib/wawancara/bank');
    return { success: true, ...(await gabungBankDanJawaban(wa)) };
  },
  simpanJawabanWawancara: async (p: unknown[], s?: string) => {
    const wa = String(p?.[0] ?? '');
    const tolak = await tolakKecualiSiswa(s, wa);
    if (tolak) return tolak;
    const { simpanJawaban } = await import('../_lib/wawancara/bank');
    return simpanJawaban(wa, String(p?.[1] ?? ''), (p?.[2] ?? {}) as Record<string, unknown>, 'siswa');
  },
  terjemahkanJawabanWawancara: async (p: unknown[], s?: string) => {
    const wa = String(p?.[0] ?? '');
    const tolak = await tolakKecualiSiswa(s, wa);
    if (tolak) return tolak;
    const { terjemahkanJawaban } = await import('../_lib/wawancara/bank');
    return terjemahkanJawaban(wa, String(p?.[1] ?? ''), String(p?.[2] ?? ''));
  },
  // ── Bank kosakata (kotoba) — minigame hafalan ────────────────────────────
  // Gerbang SAMA PERSIS dengan bank soal wawancara di atas, dan itu disengaja:
  // pemilik meminta fitur ini "sama seperti interview dan CV AI, hanya untuk
  // yang bertag VIP". Satu penjaga berarti satu tempat yang bisa salah, bukan
  // dua definisi "siswa ASJ" yang bisa berbeda diam-diam.
  //
  // Bank kosakata TIDAK dikirim ke non-siswa — bukan cuma disembunyikan di UI.
  // Isinya materi belajar, bukan rahasia, tapi gerbang yang hanya kosmetik akan
  // membuat label "khusus siswa" di dasbor jadi klaim kosong.
  getBankKotoba: async (p: unknown[], s?: string) => {
    const wa = String(p?.[0] ?? '').trim();
    const tolak = await tolakKecualiSiswa(s, wa);
    if (tolak) return tolak;
    const { BANK_KOTOBA, BAB_KOTOBA, JUMLAH_KOTOBA } = await import('../_lib/kotoba/bank');
    return {
      success: true,
      wa,
      isVip: true,
      jumlah: JUMLAH_KOTOBA,
      bab: BAB_KOTOBA,
      kosakata: BANK_KOTOBA,
    };
  },
  // ── Bank soal matematika (`/matematika`) — simulasi tes seleksi ───────────
  // Gerbang SAMA PERSIS dengan bank soal wawancara dan bank kosakata di atas,
  // dan itu disengaja (satu penjaga = satu tempat yang bisa salah). Yang
  // dikirim hanya ke siswa ASJ adalah SOAL CERITA + pembahasannya; generator
  // angka hidup di klien karena soal aritmetika acak tak terbatas tidak punya
  // nilai rahasia — yang punya nilai adalah 69 soal pabrik dan cara
  // mengerjakannya.
  getBankMatematika: async (p: unknown[], s?: string) => {
    const wa = String(p?.[0] ?? '').trim();
    const tolak = await tolakKecualiSiswa(s, wa);
    if (tolak) return tolak;
    const { ringkasBank } = await import('../_lib/matematika/bank');
    return { success: true, wa, isVip: true, ...ringkasBank() };
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
