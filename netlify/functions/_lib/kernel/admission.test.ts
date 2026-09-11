// ==========================================
// TESTS: kernel/admission — priority classes and load shedding (Phase B)
//
// What these tests are actually defending:
//   1. P0 is NEVER shed. Authentication, session refresh and job-status
//      polling must survive saturation — otherwise the product locks users out
//      during exactly the incident where they need to get back in.
//   2. Shedding happens in priority order: P3 yields before P2 before P1.
//   3. Slots are always released. A leaked slot makes the instance shed itself
//      permanently, which is worse than the overload it was guarding against.
//   4. Degradation signals (PostgREST latency, open breaker) raise pressure
//      even when the instance is idle.
// ==========================================
import { describe, it, expect, afterEach } from 'vitest';

import {
  admit,
  release,
  priorityOf,
  tierOf,
  observeDependency,
  snapshot,
  resetForTests,
  shedResponse,
} from './admission';
import { breaker } from './resilience';
import { codeToStatus } from './errors';

afterEach(() => {
  resetForTests();
  breaker.reset('postgrest');
});

describe('admission — priority classification', () => {
  it('never sheds authentication, session refresh or job-status polling', () => {
    for (const a of [
      'ping', 'logout', 'loginKandidat', 'daftarKandidat',
      'checkAdminMaster', 'checkAdminPersonal',
      'refreshAdminSession', 'refreshKandidatSession',
      'gantiPasswordKandidat', 'getJobStatus', 'reportWebVital',
    ]) {
      expect(priorityOf(a), a).toBe(0);
    }
  });

  it('sheds bulk fan-out first and interactive AI second', () => {
    expect(priorityOf('kirimTawaranMassal')).toBe(3);
    expect(priorityOf('checkAndSendAgendaReminders')).toBe(3);
    expect(priorityOf('getMonthlyReport')).toBe(3);
    expect(priorityOf('processAIChat')).toBe(2);
    expect(priorityOf('simpanBiodataLengkap')).toBe(2);
  });

  it('defaults an unclassified action to P1 — safe by default, not shed-first', () => {
    expect(priorityOf('someActionAddedNextYear')).toBe(1);
    expect(priorityOf('getAppData')).toBe(1);
  });

  it('assigns tiers by the resource the action competes for', () => {
    expect(tierOf('kirimTawaranMassal')).toBe('bulk');
    expect(tierOf('processAIChat')).toBe('ai');
    expect(tierOf('parseDokumenBiodata')).toBe('ai');
    expect(tierOf('getAppData')).toBe('default');
  });
});

describe('admission — shedding', () => {
  it('sheds P1 once the default tier saturates, but still admits P0', () => {
    let admitted = 0;
    for (let i = 0; i < 60; i++) {
      const a = admit('getAppData');
      if (!a.admitted) break;
      admitted++;
    }
    // Shedding starts slightly below the raw cap, which is the point: the
    // remaining headroom is reserved for P0.
    expect(admitted).toBeGreaterThan(0);
    expect(admitted).toBeLessThanOrEqual(snapshot().caps.default);

    const p0 = admit('loginKandidat');
    expect(p0.admitted).toBe(true);
    expect(p0.priority).toBe(0);
  });

  it('sheds P3 before the bulk tier is full, with a longer backoff than P2', () => {
    const a1 = admit('kirimTawaranMassal');
    const a2 = admit('kirimTawaranMassal');
    const a3 = admit('kirimTawaranMassal');
    expect(a1.admitted).toBe(true);
    expect(a2.admitted).toBe(true);
    // Bulk work is told to back off harder than interactive work, because
    // retrying a fan-out immediately is what sustains the storm.
    expect(a3.admitted).toBe(false);
    expect(a3.retryAfter).toBe(10);
  });

  it('gives P2 a shorter backoff than P3', () => {
    let shed;
    for (let i = 0; i < 10; i++) {
      const a = admit('processAIChat');
      if (!a.admitted) { shed = a; break; }
    }
    expect(shed).toBeDefined();
    expect(shed!.retryAfter).toBe(5);
  });

  it('sheds only at near-total saturation for P1', () => {
    // A couple of in-flight requests must not shed ordinary traffic.
    admit('getAppData');
    admit('getAppData');
    expect(admit('getAppData').admitted).toBe(true);
  });
});

describe('admission — degradation signals', () => {
  it('raises pressure from observed PostgREST latency, even while idle', () => {
    // A healthy 40 ms RTT must read as zero pressure.
    for (let i = 0; i < 40; i++) observeDependency('postgrest', 40);
    expect(admit('getAppData').admitted).toBe(true);

    resetForTests();

    // Sustained degradation above the ceiling pins saturation to 1.
    for (let i = 0; i < 60; i++) observeDependency('postgrest', 2_500);
    expect(admit('kirimTawaranMassal').admitted).toBe(false);
    expect(admit('processAIChat').admitted).toBe(false);
    expect(admit('getAppData').admitted).toBe(false);
    // P0 still gets through — that is the invariant under every signal.
    expect(admit('loginKandidat').admitted).toBe(true);
  });

  it('ignores latency from dependencies other than PostgREST', () => {
    for (let i = 0; i < 60; i++) observeDependency('gemini', 9_000);
    expect(snapshot().postgrestEwmaMs).toBe(0);
    expect(admit('getAppData').admitted).toBe(true);
  });

  it('an open PostgREST breaker pins saturation so only P0 is admitted', () => {
    for (let i = 0; i < 5; i++) breaker.failure('postgrest');
    expect(breaker.getState('postgrest')).toBe('open');

    // Every action that needs PostgREST would fail anyway, so accepting more
    // of that work is pure waste.
    expect(admit('getAppData').admitted).toBe(false);
    expect(admit('kirimTawaranMasal' + 'l').admitted).toBe(false);
    expect(admit('loginKandidat').admitted).toBe(true);
  });
});

describe('admission — slot accounting', () => {
  it('release returns the slot so the instance does not shed itself', () => {
    const a = admit('getAppData');
    expect(snapshot().inflightTotal).toBe(1);
    release(a.tier);
    expect(snapshot().inflightTotal).toBe(0);
  });

  it('release is safe to call twice and never drives the count negative', () => {
    const a = admit('getAppData');
    release(a.tier);
    release(a.tier);
    expect(snapshot().inflightTotal).toBe(0);
    expect(snapshot().inflight.default).toBe(0);
    // A double release must not have freed a slot that a live request holds.
    const b = admit('getAppData');
    expect(b.admitted).toBe(true);
    expect(snapshot().inflightTotal).toBe(1);
  });

  it('tracks tiers independently so one cannot consume the instance', () => {
    admit('processAIChat');
    admit('kirimTawaranMassal');
    admit('getAppData');
    const s = snapshot();
    expect(s.inflight.ai).toBe(1);
    expect(s.inflight.bulk).toBe(1);
    expect(s.inflight.default).toBe(1);
    expect(s.inflightTotal).toBe(3);
  });
});

describe('admission — response contract', () => {
  it('shedResponse maps to HTTP 503 and is explicitly uncacheable', () => {
    const r = shedResponse(10);
    expect(r.code).toBe('OVERLOADED');
    expect(r.overloaded).toBe(true);
    expect(r.retryAfter).toBe(10);
    expect(r.success).toBe(false);
    // 503 not 400: a shed request is not a client input error.
    expect(codeToStatus(r.code)).toBe(503);
  });
});
