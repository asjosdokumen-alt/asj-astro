/**
 * InterviewSimulatorModal.tsx — Simulator Wawancara VIP (Jeklin Sensei)
 * Port of legacy #modal-interview (partials/modals-shared.html) +
 * js/ai_copilot/interview.ts (bukaSimulatorInterview / mulaiWawancaraInterview
 * / sendInterviewMessage / selesaikanWawancaraInterview /
 * kirimHasilWawancaraKeAdmin / cobaParseJsonLoose).
 *
 * A16 parity crosscheck (2026-09-05) fixed root bugs:
 *  1. THE FEATURE NEVER EXISTED in Astro — the "Latihan Interview" button in
 *     CandidateDash was an <a href="/ai-cv"> pointing at the AI CV Master
 *     page (which is what the *next* button "AI CV Master Assistant" is for).
 *     Legacy bukaSimulatorInterview opens a live chat with Jeklin Sensei; the
 *     whole chat modal was never ported. This component is that port.
 *  2. The VIP/KELAS gate ran client-side in legacy (isVipCatatan: literal
 *     [VIP] or [KELAS xx] — tightened, any bracketed tag no longer counts).
 *     Gate is restored before the modal opens (toast ui.toast_feature_locked,
 *     same as legacy) via the exported canAccessInterview() helper.
 *  3. Backend contract: the ai surface enqueued processAiInterview as a
 *     2-minute sweep job — an interactive chat turn must return live; it now
 *     calls the real handler synchronously (fixed in surfaces/ai.ts + the
 *     handler's args-array unwrap in _lib/ai/chat.ts). The client therefore
 *     reads {reply} directly, exactly like legacy callAPI.
 *  4. All copy was hard-coded Indonesian in legacy; every string now has an
 *     id + jp key (ui.iv_*, ui.ai_interview_*, admin.interview_ph).
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '../../store/i18n';
import Icon from '../ui/Icon';
import { useOverlay } from '../ui/useOverlay';
import { showToast } from '../Toast';
import api from '../../lib/apiClient';

export interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  /** Nomor WA kandidat (sesi). */
  wa: string;
  /** Nama kandidat — dipakai AI untuk sapaan (nama-san). */
  nama: string;
  onClose: () => void;
}

/** VIP / KELAS gate — parity legacy js/03_candidate.ts isVipCatatan(). */
export function canAccessInterview(catatanInt: string | undefined | null): boolean {
  const c = String(catatanInt || '');
  return c.includes('[VIP]') || /\[KELAS\s*[A-Z0-9]+\]/i.test(c);
}

/** JSON loose parser — parity legacy cobaParseJsonLoose (interview.ts). */
export function parseJsonLooseChat(text: string): Record<string, unknown> | null {
  let txt = String(text || '').trim();
  txt = txt.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try {
    return JSON.parse(txt) as Record<string, unknown>;
  } catch {
    const start = txt.indexOf('{');
    const end = txt.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(txt.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        /* gagal */
      }
    }
    return null;
  }
}

/**
 * Bubble message untuk hasil wawancara — parity legacy kirimHasilWawancaraKeAdmin.
 * Emoji/format lama dipertahankan; teks lewat t() (id+jp).
 */
export function buildHasilSummaryText(
  hasil: { score?: unknown; nilai?: unknown; biodata?: Record<string, unknown> | null; rekomendasi?: unknown },
  sentOk: boolean,
): string {
  const score = hasil.score !== undefined && hasil.score !== null ? String(hasil.score) + '/10' : '-';
  const nilai = hasil.nilai ? ' (' + String(hasil.nilai) + ')' : '';
  const nField = hasil.biodata ? Object.keys(hasil.biodata).length : 0;
  let msg =
    '📊 **' + t('ui.iv_res_title') + '**\n' +
    t('ui.iv_res_skor') + score + nilai + '\n' +
    t('ui.iv_res_bio_fields').replace('{n}', String(nField));
  if (hasil.rekomendasi) msg += '\n' + t('ui.iv_res_rekom') + String(hasil.rekomendasi);
  msg += '\n' + (sentOk ? t('ui.iv_res_sent_ok') : t('ui.iv_res_sent_fail'));
  return msg;
}

/** Parse **bold** menjadi segmen teks biasa/bold (Preact meng-escape otomatis). */
export function boldSegments(text: string): { text: string; bold: boolean }[] {
  return String(text)
    .split(/\*\*/)
    .map((s, i) => ({ text: s, bold: i % 2 === 1 }));
}

export default function InterviewSimulatorModal({ wa, nama, onClose }: Props) {
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState<null | 'ask' | 'summarize'>(null);
  const msgsRef = useRef<ChatMsg[]>([]);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const chatBoxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { containerRef, onBackdropClick } = useOverlay({ open: true, onClose });

  msgsRef.current = msgs;

  const appendMsg = (m: ChatMsg) => {
    if (mountedRef.current) setMsgs((prev) => [...prev, m]);
  };

  // Auto-scroll ke bubble terbaru.
  useEffect(() => {
    const el = chatBoxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, busy]);

  // Fokus kembali ke input setelah AI selesai menjawab.
  useEffect(() => {
    if (!busy && mountedRef.current && inputRef.current) inputRef.current.focus();
  }, [busy]);

  useEffect(() => {
    mountedRef.current = true;
    // Reset chat & langsung mulai — AI menyapa + pertanyaan pertama sesuai
    // bidang SSW kandidat (parity bukaSimulatorInterview → mulaiWawancaraInterview).
    setMsgs([]);
    void runTurn([], true);
    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const processReply = (replyText: string) => {
    const reply = String(replyText || '');
    const marker = reply.indexOf('===HASIL===');
    if (marker >= 0) {
      // Wawancara selesai: pisahkan ucapan penutup & JSON hasil (parity legacy).
      const chatPart = reply.slice(0, marker).trim();
      const hasilTxt = reply.slice(marker + '===HASIL==='.length).trim();
      if (chatPart) appendMsg({ role: 'assistant', content: chatPart });
      const hasil = parseJsonLooseChat(hasilTxt);
      if (hasil) {
        void saveHasilKeAdmin(hasil);
      } else if (hasilTxt) {
        appendMsg({ role: 'assistant', content: hasilTxt });
      }
    } else if (reply) {
      appendMsg({ role: 'assistant', content: reply });
    }
  };

  // Kirim hasil wawancara → ai_form_submissions (submitted_via='interview')
  // supaya admin bisa lihat & update biodata (parity kirimHasilWawancaraKeAdmin).
  const saveHasilKeAdmin = async (hasil: Record<string, unknown>) => {
    let sentOk = false;
    try {
      const res = (await api.secure('simpanHasilWawancara', [{ wa, hasil }])) as {
        success?: boolean;
      };
      sentOk = !!(res && res.success);
    } catch {
      sentOk = false;
    }
    appendMsg({ role: 'assistant', content: buildHasilSummaryText(hasil, sentOk) });
  };

  const runTurn = async (history: ChatMsg[], isGreeting: boolean) => {
    if (busyRef.current || !mountedRef.current) return;
    busyRef.current = true;
    setBusy('ask');
    try {
      const res = (await api.secure('processAiInterview', [
        { wa, candidateName: nama, history: history.slice(-20) },
      ])) as { reply?: string; error?: string } | null;
      if (!mountedRef.current) return;
      const r = res && typeof res.reply === 'string' && res.reply
        ? res.reply
        : res && res.error
          ? res.error
          : '';
      if (r) processReply(r);
    } catch {
      if (!mountedRef.current) return;
      // Parity: greeting gagal → sapaan fallback; giliran user → pesan putus.
      const fallback = isGreeting
        ? t('ui.iv_greet_fallback').replace('{name}', String(nama || ''))
        : t('ui.iv_err_disconnect');
      appendMsg({ role: 'assistant', content: fallback });
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setBusy(null);
    }
  };

  const sendMessage = () => {
    const text = input.trim();
    if (!text || busyRef.current) return;
    const nextHistory = [...msgsRef.current, { role: 'user' as const, content: text }];
    setInput('');
    appendMsg(nextHistory[nextHistory.length - 1]);
    void runTurn(nextHistory, false);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Selesai → rangkum transcript via Gemini → simpan hasil ke admin.
  const selesaikan = async () => {
    if (busyRef.current) return;
    if (msgsRef.current.length === 0) {
      showToast(t('ui.ai_interview_not_started'), 'info');
      return;
    }
    busyRef.current = true;
    setBusy('summarize');
    try {
      const res = (await api.secure('selesaikanWawancara', [
        { wa, history: msgsRef.current },
      ])) as { success?: boolean; hasil?: Record<string, unknown>; error?: string } | null;
      if (!mountedRef.current) return;
      if (!res || res.success === false) {
        throw new Error((res && res.error) || 'AI sibuk');
      }
      await saveHasilKeAdmin(res.hasil || {});
      showToast(t('ui.ai_interview_sent'), 'success');
    } catch (err) {
      if (mountedRef.current) {
        const errText = err instanceof Error ? err.message : String(err);
        appendMsg({
          role: 'assistant',
          content: t('ui.iv_err_summarize').replace('{e}', errText || 'AI sibuk'),
        });
      }
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setBusy(null);
    }
  };

  const typingLabel =
    busy === 'summarize' ? t('ui.ai_interview_summarizing') : t('ui.iv_typing');

  return (
    <div
      class="fixed inset-0 u-modal-shell bg-black/90 backdrop-blur-md z-[300] flex flex-col justify-end md:justify-center items-center md:p-4"
      ref={containerRef}
      onClick={onBackdropClick}
    >
      <div
        class="glass-panel w-full md:max-w-2xl h-[90vh] md:h-[80vh] md:rounded-[2rem] rounded-t-[2rem] shadow-2xl relative border-t border-violet-500/50 flex flex-col overflow-hidden bg-slate-950"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div class="px-6 py-4 bg-gradient-to-r from-violet-900/80 to-slate-900 border-b border-violet-500/30 flex justify-between items-center z-10">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-violet-500 flex items-center justify-center shadow-[0_0_15px_rgba(139,92,246,0.5)] flex-shrink-0 text-white text-lg">
              <Icon name="microphone-alt" />
            </div>
            <div>
              <h3 class="text-base font-black text-white tracking-wide">Jeklin Sensei</h3>
              <p class="text-xs text-violet-300 font-bold uppercase tracking-widest animate-pulse">
                {t('ui.interview_sim')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={t('public.close')}
            class="text-slate-400 hover:text-white transition"
          >
            <Icon name="times" class="text-2xl" />
          </button>
        </div>

        {/* Chat area */}
        <div
          ref={chatBoxRef}
          class="flex-1 u-scroll-area p-5 space-y-4 bg-slate-900/50 custom-scrollbar"
        >
          {msgs.map((m, i) => {
            const segs = boldSegments(m.content);
            return m.role === 'user' ? (
              <div key={i} class="flex justify-end gap-3 fade-in">
                <div
                  class="bg-violet-600 text-white text-sm p-3.5 rounded-2xl rounded-tr-none shadow-md max-w-[85%]"
                  data-testid="iv-user-bubble"
                >
                  <p class="whitespace-pre-wrap m-0 leading-relaxed">
                    {segs.map((s, j) =>
                      s.bold ? <b key={j}>{s.text}</b> : <span key={j}>{s.text}</span>,
                    )}
                  </p>
                </div>
              </div>
            ) : (
              <div key={i} class="flex items-start gap-3 fade-in">
                <div class="w-8 h-8 rounded-full bg-violet-500 flex items-center justify-center shadow-sm border border-violet-400 flex-shrink-0 text-slate-100 text-sm">
                  <Icon name="microphone-alt" />
                </div>
                <div
                  class="bg-slate-800 text-slate-200 text-sm p-3.5 rounded-2xl rounded-tl-none shadow-md border border-violet-500/30 max-w-[85%]"
                  data-testid="iv-ai-bubble"
                >
                  <p class="whitespace-pre-wrap m-0 leading-relaxed">
                    {segs.map((s, j) =>
                      s.bold ? <b key={j}>{s.text}</b> : <span key={j}>{s.text}</span>,
                    )}
                  </p>
                </div>
              </div>
            );
          })}
          {busy && (
            <div class="flex items-start gap-3">
              <div class="w-8 h-8 rounded-full bg-violet-500 flex items-center justify-center shadow-sm border border-violet-400 flex-shrink-0 text-slate-100 text-sm">
                <Icon name="microphone-alt" />
              </div>
              <div class="bg-slate-800 p-3.5 rounded-2xl rounded-tl-none shadow-md border border-violet-500/30">
                <div class="flex items-center gap-2">
                  <div class="flex gap-1.5 items-center">
                    <span class="w-2 h-2 bg-violet-400/80 rounded-full animate-bounce" />
                    <span
                      class="w-2 h-2 bg-violet-400/80 rounded-full animate-bounce"
                      style="animation-delay: 0.15s"
                    />
                    <span
                      class="w-2 h-2 bg-violet-400/80 rounded-full animate-bounce"
                      style="animation-delay: 0.3s"
                    />
                  </div>
                  <span class="text-xs text-violet-400 font-bold">{typingLabel}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input area */}
        <div class="p-4 bg-slate-900 border-t border-slate-800">
          <div class="flex items-end gap-2">
            <textarea
              ref={inputRef}
              rows={2}
              value={input}
              disabled={!!busy}
              onInput={(e) => setInput((e.target as HTMLTextAreaElement).value)}
              onKeyDown={onKeyDown}
              placeholder={t('admin.interview_ph')}
              aria-label={t('admin.interview_ph')}
              class="w-full p-3 bg-black/60 border border-slate-700 rounded-xl text-white text-sm outline-none focus:border-violet-500 transition resize-none custom-scrollbar disabled:opacity-50"
            />
            <button
              onClick={selesaikan}
              disabled={!!busy}
              title={t('ui.ai_interview_done_btn')}
              aria-label={t('ui.ai_interview_done_btn')}
              class="w-14 h-14 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl flex flex-col items-center justify-center shadow-lg transition active:scale-95 flex-shrink-0 disabled:opacity-50"
            >
              <Icon name="check-double" class="text-lg" />
              <span class="text-[7px] font-black leading-none mt-0.5">{t('ui.ai_interview_done_text')}</span>
            </button>
            <button
              onClick={sendMessage}
              disabled={!!busy}
              aria-label={t('ui.iv_send')}
              class="w-14 h-14 bg-violet-600 hover:bg-violet-500 text-white rounded-xl flex items-center justify-center shadow-lg transition active:scale-95 flex-shrink-0 disabled:opacity-50"
            >
              <Icon name="paper-plane" class="text-xl" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
