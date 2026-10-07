/**
 * kernel/events.ts — Domain event emitter for cross-context communication
 *
 * WHY THIS EXISTS
 * ---------------
 * Cross-context communication currently happens through direct function calls
 * or is missing entirely (e.g., notifying about a stage change requires the
 * caller to know about the notification context). This module provides typed
 * domain events with fire-and-forget semantics:
 *
 *   - Event handlers may never throw into their emitter
 *   - Event handlers may never assume they run before the response is returned
 *   - Events are dispatched synchronously in-process today
 *   - The signature is identical to what a future SNS/EventBridge publish
 *     would use, so promoting to a network hop is a one-file change
 *
 * USAGE
 * -----
 *   import { emit, on } from '../kernel/events';
 *
 *   // Emit an event (fire-and-forget):
 *   emit({ type: 'candidate.stageChanged', wa: '628...', from: 'OPEN', to: 'INTERVIEW' });
 *
 *   // Register a handler:
 *   on('candidate.stageChanged', async (event) => {
 *     await sendNotification(event.wa, `Stage berubah: ${event.from} → ${event.to}`);
 *   });
 *
 * DESIGN RULES:
 *   1. An event handler may NEVER throw into its emitter
 *   2. An event handler may NEVER assume it runs before the response is returned
 *   3. Events are typed — adding a new event type adds to the union below
 *   4. The signature is deliberately identical to SNS/EventBridge publish
 */

import { log } from './log';

// ── Event types ─────────────────────────────────────────────────────────────

export type DomainEvent =
  | CandidateStageChanged
  | ApplicationSubmitted
  | ApplicationApproved
  | ApplicationRejected
  | DocumentUploaded
  | JobStatusChanged
  | ConfigChanged
  | ReminderDue;

export interface CandidateStageChanged {
  type: 'candidate.stageChanged';
  wa: string;
  from: string;
  to: string;
  at: string;
}

export interface ApplicationSubmitted {
  type: 'application.submitted';
  wa: string;
  jobCode: string;
  at: string;
}

export interface ApplicationApproved {
  type: 'application.approved';
  wa: string;
  jobCode: string;
  at: string;
}

export interface ApplicationRejected {
  type: 'application.rejected';
  wa: string;
  jobCode: string;
  reason?: string;
  at: string;
}

export interface DocumentUploaded {
  type: 'document.uploaded';
  wa: string;
  kind: string;
  path: string;
  at: string;
}

export interface JobStatusChanged {
  type: 'job.statusChanged';
  jobCode: string;
  from: string;
  to: string;
  at: string;
}

export interface ConfigChanged {
  type: 'config.changed';
  key: string;
  at: string;
}

export interface ReminderDue {
  type: 'reminder.due';
  jadwalId: string;
  tugasId: string;
  at: string;
}

// ── Handler registry ────────────────────────────────────────────────────────

type EventHandler<T extends DomainEvent = DomainEvent> = (event: T) => Promise<void>;

const handlers = new Map<string, EventHandler[]>();

/**
 * Register a handler for a domain event.
 * Returns an unsubscribe function.
 */
export function on<T extends DomainEvent['type']>(
  eventType: T,
  handler: EventHandler<Extract<DomainEvent, { type: T }>>,
): () => void {
  const list = handlers.get(eventType) ?? [];
  list.push(handler as EventHandler);
  handlers.set(eventType, list);

  return () => {
    const current = handlers.get(eventType) ?? [];
    const idx = current.indexOf(handler as EventHandler);
    if (idx >= 0) current.splice(idx, 1);
  };
}

/**
 * Emit a domain event. All handlers are invoked fire-and-forget.
 *
 * RULES:
 *   - Never let a handler throw into the emitter (caught and logged)
 *   - Never await the handlers (they run after the response is sent)
 *   - Log the event for observability
 */
export function emit(event: DomainEvent): void {
  const handlerList = handlers.get(event.type) ?? [];

  log.info('event.emitted', {
    type: event.type,
    // Hash PII fields for safe logging
    wa: 'wa' in event && event.wa ? hashForLog(event.wa) : undefined,
    // `'jobCode' in event` narrows the `DomainEvent` union to the variants
    // that carry it, so no cast is needed to read it.
    jobCode: 'jobCode' in event ? event.jobCode : undefined,
  });

  for (const handler of handlerList) {
    void Promise.resolve()
      .then(() => handler(event))
      .catch((err) => {
        log.error('event.handler.failed', {
          type: event.type,
          err: String(err).slice(0, 200),
        });
      });
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

import { createHash } from 'node:crypto';

/** Hash a value for safe logging (first 8 hex chars). */
function hashForLog(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 8);
}

/**
 * Get the count of registered handlers for a given event type.
 * Useful for testing.
 */
export function handlerCount(eventType: DomainEvent['type']): number {
  return (handlers.get(eventType) ?? []).length;
}

/**
 * Remove all registered handlers. For testing only.
 */
export function resetHandlers(): void {
  handlers.clear();
}
