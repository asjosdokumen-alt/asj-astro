/**
 * metrics-receiver.ts — the Phase C reference receiver (item 11 + item 13)
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `_lib/metrics-sink.ts` ships one invocation's metrics payload to a URL you
 * choose and deliberately does nothing else: "It does not aggregate, alert, or
 * retain. That is the receiver's job." (docs/PHASE_C_OBSERVABILITY.md §4.3)
 *
 * This is that receiver. Two constraints from §4.3 drive every choice below:
 *
 *   1. **A SEPARATE function from `health.js`.** A broken receiver must never be
 *      able to take down the health probe that diagnoses the incident.
 *   2. **It is allowed to be lossy.** The sender is fire-and-forget, so this end
 *      need not be durable — it needs to evaluate rules and notify on
 *      transitions.
 *
 * ── WHAT THE PAYLOAD ACTUALLY CONTAINS (verified against the kernel) ────────
 * This matters, because it is easy to write a receiver that fires on metric
 * names the kernel never emits. The real conventions are:
 *
 *   increment(name, labels)  ->  key = "name.k1=v1.k2=v2"
 *     dependency.call{dep,outcome}      e.g. "dependency.call.dep=postgrest.outcome=error"
 *     handler.invoke{action}
 *     handler.error{action,code}        e.g. "handler.error.action=getAppData.code=PG_TIMEOUT"
 *     rate_limit.hit{action,key}
 *     sweep.processed / sweep.failed / sweep.cleaned   (from sweepMetrics(), no labels)
 *
 *   histogram(name, labels)  ->  {count, avg, p50, p95, max}
 *     dependency.call.latency{dep}
 *     handler.latency{action}
 *
 *   gauge(name, value, labels)
 *     sweep.duration_ms   (the only gauge the codebase currently sets)
 *
 * **Breaker state is NOT in the metrics payload.** It is exposed only by
 * `breaker.snapshot()` / `openCount()` in `kernel/resilience.ts`, read by
 * `_lib/health.ts`. So A5 ("breaker open > 2 min") is evaluable from the
 * *health endpoint*, not from a counter. This receiver does not pretend
 * otherwise — see `evaluateNotifyOnlyRules` for what it can honestly do.
 *
 * The rules this receiver implements, from §4.1, are the saturation-side ones
 * §4.1 says to configure FIRST (A4–A7), because they fire *before* users are
 * affected:
 *
 *   A4  queue depth (surfaced via health, not here)
 *   A6  dead-letter arrival          -> page
 *   A3' handler error-rate spike     -> page    (a local, windowless approximation)
 *   A7  DB unreachable               -> page    (surfaced via health, not here)
 *
 * A6 is the one this receiver can evaluate from counters alone, and it is the
 * most valuable: a dead-letter job is "committed work that will never complete"
 * (§3.3). A4/A5/A7 need the health probe and are covered by the §6 gate.
 */

import type { Handler } from '@netlify/functions';
import type { MetricsPayload } from './_lib/metrics-sink';

// ─── Config ──────────────────────────────────────────────────────────────────

/** Shared secret; the sender sends it as `Authorization: Bearer <token>`. */
function receiverToken(): string {
  return (process.env.METRICS_RECEIVER_TOKEN || '').trim();
}

/** Where to notify. Discord (`content`) / Slack (`text`) compatible. */
function notifyUrl(): string {
  return (process.env.METRICS_NOTIFY_URL || '').trim();
}

/**
 * Minimum gap between notifications for the same alert key.
 *
 * Without this, a condition that persists pages on every invocation, which
 * exhausts the receiver's own rate limit and makes the alert useless. §4.2's
 * runbooks assume "firing" is an edge, not a level.
 */
const RENOTIFY_MS = 10 * 60 * 1000;

/**
 * Error-rate alerting needs a baseline. §4.1 wants >2 % over 5 min; this
 * receiver has no 7-day store, so it uses a simpler local signal: a page when
 * errors in a single flush cross this count. Deliberately conservative — better
 * to under-page here than to cry wolf, since A1–A3 are the "users are already
 * affected" alerts and the runbook treats them differently.
 */
const ERROR_BURST = 10;

// ─── Parsed-metric helpers ───────────────────────────────────────────────────

/**
 * Split a kernel metric key into its base name and labels.
 *
 * `"dependency.call.dep=postgrest.outcome=error"` ->
 *   { base: "dependency.call", labels: { dep: "postgrest", outcome: "error" } }
 *
 * The kernel serializes labels as `.k=v` appended to the name (see
 * `increment()`), so a `.` can appear in either role. We split on the FIRST
 * `.segment=value` boundary, which is unambiguous because a base name never
 * contains `=`.
 */
function parseKey(key: string): { base: string; labels: Record<string, string> } {
  const parts = key.split('.');
  const baseParts: string[] = [];
  const labels: Record<string, string> = {};
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq === -1) {
      // Still in the base name — but once we have seen a label, a plain segment
      // would mean a malformed key; treat it as base for tolerance.
      if (Object.keys(labels).length === 0) baseParts.push(part);
    } else {
      labels[part.slice(0, eq)] = part.slice(eq + 1);
    }
  }
  return { base: baseParts.join('.'), labels };
}

/** Sum every counter whose base name matches, across all label combinations. */
function sumByBase(counters: Record<string, number>, base: string): number {
  let n = 0;
  for (const [key, value] of Object.entries(counters)) {
    if (parseKey(key).base === base) n += value;
  }
  return n;
}

/** Every failure outcome for a dependency, summed. */
function depFailures(counters: Record<string, number>, dep: string): number {
  let n = 0;
  for (const [key, value] of Object.entries(counters)) {
    const { base, labels } = parseKey(key);
    if (base === 'dependency.call' && labels.dep === dep && labels.outcome !== 'success') n += value;
  }
  return n;
}

// ─── Alert state ─────────────────────────────────────────────────────────────

interface AlertState {
  since: number;
  lastNotified: number;
  notified: boolean;
}

/**
 * The state store.
 *
 * In-memory is a deliberate starting point, not an oversight: correct within a
 * warm instance, lossy across cold starts. §4.3 calls state "the one piece of
 * Phase C that is genuinely not trivial". To make it durable, replace the two
 * methods with a Postgres/Redis implementation — nothing else changes.
 */
class AlertStore {
  private firing = new Map<string, AlertState>();

  observe(key: string, now: number): AlertState {
    let st = this.firing.get(key);
    if (!st) {
      st = { since: now, lastNotified: 0, notified: false };
      this.firing.set(key, st);
    }
    return st;
  }

  clear(key: string, now: number): number | null {
    const st = this.firing.get(key);
    if (!st) return null;
    this.firing.delete(key);
    return now - st.since;
  }

  /**
   * True when `key` is firing and should be notified now.
   *
   * `minFiringMs = 0` means "the event itself is the trigger" (a dead-letter
   * arrival), as opposed to "the condition must persist" (a latency window).
   */
  shouldNotify(key: string, minFiringMs: number, now: number): boolean {
    const st = this.firing.get(key);
    if (!st) return false;
    if (now - st.since < minFiringMs) return false;
    if (st.notified && now - st.lastNotified < RENOTIFY_MS) return false;
    st.notified = true;
    st.lastNotified = now;
    return true;
  }
}

// Module scope: survives between invocations on a warm instance, which is what
// makes any window-based rule evaluable at all.
const store = new AlertStore();

// ─── Notify ──────────────────────────────────────────────────────────────────

async function notify(text: string): Promise<void> {
  const url = notifyUrl();
  if (!url) {
    console.log('[receiver] notify skipped — METRICS_NOTIFY_URL not set:', text.replace(/\n/g, ' | '));
    return;
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // `content` is Discord's field, `text` is Slack's. Sending both lets one
      // URL work for either without a config flag.
      body: JSON.stringify({ content: text, text }),
      signal: controller.signal,
    });
    clearTimeout(timer);
  } catch (e) {
    // Never let a notification failure become a receiver failure — the same
    // discipline the sender follows in the other direction.
    console.warn('[receiver] notify failed:', String((e as Error)?.message ?? e));
  }
}

// ─── Rule evaluation ─────────────────────────────────────────────────────────

async function evaluate(payload: MetricsPayload): Promise<string[]> {
  const now = Date.now();
  const fired: string[] = [];
  const counters = payload.counters ?? {};

  // ── A6 — dead-letter arrival. Any arrival pages (§4.1: "any arrival").
  // `sweep.failed` is the sweep's own failure count; a dead-letter job is the
  // durable consequence. Either reaching a non-zero value is worth a page.
  const sweepFailed = sumByBase(counters, 'sweep.failed');
  if (sweepFailed > 0) {
    const key = 'A6:sweep.failed';
    store.observe(key, now);
    if (store.shouldNotify(key, 0, now)) {
      fired.push(`A6 dead-letter / sweep failure: ${sweepFailed} in this flush`);
    }
  } else {
    store.clear('A6:sweep.failed', now);
  }

  // ── A3' — handler error burst. A windowless local approximation of §4.1 A3.
  const handlerErrors = sumByBase(counters, 'handler.error');
  if (handlerErrors >= ERROR_BURST) {
    const key = 'A3:error-burst';
    store.observe(key, now);
    if (store.shouldNotify(key, 0, now)) {
      // Name the offending actions so the runbook has a starting point.
      const byAction = new Map<string, number>();
      for (const [k, v] of Object.entries(counters)) {
        const { base, labels } = parseKey(k);
        if (base === 'handler.error' && labels.action) {
          byAction.set(labels.action, (byAction.get(labels.action) ?? 0) + v);
        }
      }
      const top = [...byAction.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
      fired.push(
        `A3 error burst: ${handlerErrors} handler errors` +
          (top.length ? ` — top: ${top.map(([a, n]) => `${a}×${n}`).join(', ')}` : ''),
      );
    }
  } else {
    store.clear('A3:error-burst', now);
  }

  // ── A5-adjacent — upstream (dependency) failure burst. The breaker's own
  // open-for duration is NOT in this payload (see the header note), so this
  // reports the failures that would open one, which is the actionable half.
  for (const dep of ['postgrest', 'gemini', 'fonnte', 'fcm']) {
    const fails = depFailures(counters, dep);
    const key = `dep:${dep}`;
    if (fails >= ERROR_BURST) {
      store.observe(key, now);
      if (store.shouldNotify(key, 0, now)) {
        fired.push(`upstream failures: ${dep} ×${fails} in this flush (breaker may open — check /health)`);
      }
    } else {
      store.clear(key, now);
    }
  }

  return fired;
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ ok: false, error: 'POST only' }) };
  }

  // Fail closed, same model as health.js: an unconfigured receiver token means
  // refuse, rather than accepting anonymous writes.
  const expected = receiverToken();
  if (!expected) {
    return {
      statusCode: 503,
      body: JSON.stringify({ ok: false, error: 'METRICS_RECEIVER_TOKEN not configured' }),
    };
  }
  const got = (event.headers.authorization ?? event.headers.Authorization ?? '').trim();
  if (got !== 'Bearer ' + expected) {
    return { statusCode: 401, body: JSON.stringify({ ok: false, error: 'unauthorized' }) };
  }

  let payload: MetricsPayload;
  try {
    payload = JSON.parse(event.body ?? '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'invalid JSON' }) };
  }

  try {
    const fired = await evaluate(payload);
    if (fired.length) {
      await notify('**[ASJ Portal]**\n' + fired.map((f) => '• ' + f).join('\n'));
    }
    // Always 200 on a well-formed, authenticated payload — even when rules
    // fired. The sender treats non-2xx as "receiver rejected", and an alert is
    // not a rejection.
    return { statusCode: 200, body: JSON.stringify({ ok: true, firedCount: fired.length }) };
  } catch (e) {
    // Mirrors the sender's rule 2: a receiver bug must not make the sender log
    // a rejection, or the log stream fills with noise about the wrong component.
    console.error('[receiver] evaluate failed:', String((e as Error)?.message ?? e));
    return { statusCode: 200, body: JSON.stringify({ ok: true, firedCount: 0, noted: 'eval-error' }) };
  }
};
