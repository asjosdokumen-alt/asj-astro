/**
 * interview-shared.ts — Pure helpers for the AI interview simulator (A16)
 *
 * Legacy source of truth: js/ai_copilot/interview.ts + js/03_candidate.ts.
 *
 * isVipCatatan is the VIP/KELAS feature gate (interview simulator + AI CV
 * master). Legacy TIGHTENED this (2026-09): the old broad regex
 * /\[(?:KELAS\s*[A-Z0-9]+|[A-Z0-9]+)\]/i matched ANY bracketed tag —
 * [MCU], [VISA], [NOTE] all counted as VIP. Now only a literal `[VIP]`
 * tag or `[KELAS xx]` unlocks the feature. Kept here (DB/AI-free) so the
 * backend gate and the frontend gate share one rule, and tests can pin it.
 */

/** VIP / KELAS feature gate — parity legacy js/03_candidate.ts isVipCatatan(). */
export function isVipCatatan(catatan: unknown): boolean {
  const c = String(catatan || '');
  return c.includes('[VIP]') || /\[KELAS\s*[A-Z0-9]+\]/i.test(c);
}

/**
 * Normalize the payload shape of the AI chat handlers.
 *
 * Legacy GAS sent a single OBJECT `{wa, candidateName, history}`; the Astro
 * apiClient and the job queue always send an ARRAY of args `[{wa, ...}]`.
 * Every sibling handler unwraps `payload[0]` — processAiInterview did not,
 * so `wa`/`candidateName`/`history` were silently dropped (the chat ran with
 * no candidate context and empty history on every turn).
 *
 * The SAME hole existed in processAIChat and processSiswaAIChat, which read
 * `p.history` / `p.currentData` straight off the array: Jeklin lost the whole
 * conversation history and the "DATA KANDIDAT SAAT INI" block on every turn.
 * Hence the generic name — three handlers share this rule, not one.
 */
export function unwrapPayloadArgs(payload: unknown): Record<string, unknown> {
  if (Array.isArray(payload)) {
    if (payload.length > 0) {
      const first = payload[0];
      return (first && typeof first === 'object' ? first : {}) as Record<string, unknown>;
    }
    return {};
  }
  if (payload && typeof payload === 'object') {
    return payload as Record<string, unknown>;
  }
  return {};
}

/** History cap — parity legacy sendInterviewMessage slice(-20). */
export function lastHistory<T = { role?: string; content?: unknown }>(
  history: unknown,
  max = 20,
): T[] {
  const arr = (Array.isArray(history) ? history : []) as T[];
  return max > 0 ? arr.slice(-max) : arr.slice();
}
