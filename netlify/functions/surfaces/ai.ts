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
import { tolakKecualiSiswa } from '../_lib/siswa-gate';

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
/* Penjaganya pindah ke `_lib/siswa-gate.ts` (2026-11-05) supaya bank
   soal bisa punya entry sendiri tanpa menyeret seluruh AI_ACTIONS. */

export const AI_ACTIONS: Record<string, (payload: unknown[], sessionToken?: string) => Promise<unknown>> = {
  processAIChat: async (p: unknown[], s?: string) => {
    const ai = await import('../contexts/ai-orchestration');
    return ai.handleProcessAIChat(p, s);
  },
  // "Terjemahkan semua kolom ke JP" — aksi DETERMINISTIK, bukan pesan chat.
  //
  // Dulu tombol itu mengirim kalimat ke `processAIChat`, jadi kelengkapannya
  // bergantung pada model: baris pendidikan/pekerjaan/keluarga dan `katakana`
  // tidak pernah ikut karena penggabungan balik di klien hanya mengenal kolom
  // tunggal. Gerbang VIP-nya SAMA dengan flow=master (satu fungsi), karena
  // aksi ini juga membakar kuota Gemini.
  terjemahkanKolomCv: async (p: unknown[], s?: string) => {
    const { handleTerjemahkanKolomCv } = await import('../_lib/ai/chat');
    return handleTerjemahkanKolomCv(p, s);
  },
  // Rekaman suara Mode Simulasi → teks Jepang. Jalur cadangan yang TIDAK
  // bergantung pada `SpeechRecognition` peramban; gerbangnya sama (VIP).
  transkripsikanSuara: async (p: unknown[], s?: string) => {
    const { handleTranskripsikanSuara } = await import('../_lib/ai/chat');
    return handleTranskripsikanSuara(p, s);
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
  // ── Papan peringkat game ─────────────────────────────────────────────────
  // Pemilik 2026-11-04: *"game yg bisa ada leaderboardnya … kasih di menu admin
  // supaya bisa check langsung"*.
  //
  // Gerbangnya `tolakKecualiSiswa` — sama dengan bank kosakata. `wa` diambil
  // dari argumen dan diverifikasi sesi, jadi siswa tidak bisa mengirim skor atas
  // nama orang lain; `nama`/`kelas` malah diambil ulang dari DB di dalam
  // `simpanSkor` (lihat komentarnya).
  simpanSkorGame: async (p: unknown[], s?: string) => {
    const wa = String(p?.[0] ?? '').trim();
    const tolak = await tolakKecualiSiswa(s, wa);
    if (tolak) return tolak;
    const { simpanSkor } = await import('../_lib/game/leaderboard');
    return simpanSkor({ wa, game: p?.[1], skor: p?.[2], detail: p?.[3] });
  },
  // ADMIN atau SISWA VIP. Untuk pemanggil siswa, `no_wa` peserta lain disamarkan
  // (`***`) agar privasi nomor telepon terjaga, sementara baris milik sendiri
  // tetap bisa ditandai di papan peringkat dalam game (`/arcade` & `/kotoba`).
  getPapanSkor: async (p: unknown[], s?: string) => {
    const { requireAdmin } = await import('../contexts/identity');
    const guard = requireAdmin(s || '');
    const wa = String(p?.[2] ?? '').trim();
    if (guard.error) {
      const tolak = await tolakKecualiSiswa(s, wa);
      if (tolak) return guard.error;
    }
    const { ringkasPapan, papanPeringkat } = await import('../_lib/game/leaderboard');
    const game = p?.[0];
    const limit = p?.[1];
    /* Tanpa `game` → ringkasan keempat papan (yang dipakai tab admin sekaligus).
       Dengan `game` → satu papan penuh, untuk daftar per game. */
    const res =
      game === undefined || game === null || game === ''
        ? await ringkasPapan(Number(limit) || 10)
        : await papanPeringkat(game, Number(limit) || 50);
    if (guard.error && res.success) {
      const { normalizeWa } = await import('../_lib/db/client');
      const waSaya = normalizeWa(wa);
      const saring = (daftar: unknown) =>
        Array.isArray(daftar)
          ? daftar.map((r: Record<string, unknown>) => ({
              ...r,
              no_wa: normalizeWa(String(r.no_wa ?? '')) === waSaya ? waSaya : '***',
            }))
          : daftar;
      if (Array.isArray(res.peringkat)) res.peringkat = saring(res.peringkat);
      if (res.papan && typeof res.papan === 'object') {
        for (const [k, v] of Object.entries(res.papan as Record<string, unknown>)) {
          (res.papan as Record<string, unknown>)[k] = saring(v);
        }
      }
    }
    return res;
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
