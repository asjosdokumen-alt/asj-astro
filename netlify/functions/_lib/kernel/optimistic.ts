/**
 * kernel/optimistic.ts — Optimistic concurrency control via If-Match
 *
 * WHY THIS EXISTS
 * ---------------
 * Without optimistic concurrency, two admin users editing the same candidate
 * simultaneously causes last-write-wins — the first edit is silently overwritten.
 * This module adds If-Match header support so PostgREST rejects updates when
 * the row has been modified since the client last read it.
 *
 * HOW IT WORKS
 * ------------
 * 1. Client reads a row (gets updated_at)
 * 2. Client sends update with the last known updated_at
 * 3. Server adds If-Match: "updated_at_value" header
 * 4. If the row was modified since the read, PostgREST returns 412 Precondition Failed
 * 5. We retry once with fresh data, or return CONFLICT to the client
 *
 * USAGE
 * -----
 *   import { optimisticUpdate } from '../kernel/optimistic';
 *
 *   const result = await optimisticUpdate('database_candidate', id, {
 *     body: { catatan_internal: 'new note' },
 *     updated_at: lastKnownUpdatedAt,
 *   });
 *
 *   // Or with automatic retry:
 *   const result = await optimisticUpdateWithRetry('database_candidate', id, {
 *     body: { catatan_internal: 'new note' },
 *     updated_at: lastKnownUpdatedAt,
 *     maxRetries: 1,
 *   });
 */

import { supabaseJson } from '../db/client';
import { AppError } from './errors';
import { log } from './log';

interface OptimisticOpts {
  /** The last known updated_at value from the client. */
  updated_at?: string | null;
  /** Additional query params (e.g., { id_kandidat: 'eq.ASJ001' }) */
  query?: Record<string, string>;
  /** Extra headers to merge. */
  headers?: Record<string, string>;
  /** Whether to retry on conflict. Default: false. */
  retryOnConflict?: boolean;
}

interface UpdateResult {
  success: boolean;
  conflict?: boolean;
  error?: string;
}

/**
 * Optimistic update with If-Match header.
 *
 * If updated_at is provided, adds If-Match header so PostgREST rejects
 * stale updates (returns 412). If not provided, behaves like a normal update.
 */
export async function optimisticUpdate(
  table: string,
  rowId: string,
  body: Record<string, unknown>,
  opts: OptimisticOpts = {},
): Promise<UpdateResult> {
  const headers: Record<string, string> = {
    Prefer: 'return=representation',
    ...opts.headers,
  };

  // Add If-Match header for optimistic concurrency
  if (opts.updated_at) {
    headers['If-Match'] = `"${opts.updated_at}"`;
  }

  const query: Record<string, string> = {
    id: 'eq.' + rowId,
    ...opts.query,
  };

  try {
    const rows = await supabaseJson('PATCH', table, {
      query,
      body,
      headers,
    });
    // P32 fix: return=representation — sukses HANYA jika >=1 baris benar-benar
    // ter-update (return=minimal lama selalu "sukses" walau id tidak match).
    if (Array.isArray(rows) && rows.length > 0) return { success: true };
    return { success: false, conflict: true, error: 'Data tidak ditemukan atau telah diubah. Silakan segarkan halaman.' };
  } catch (e: unknown) {
    const msg = String(e);

    // 412 Precondition Failed = conflict
    if (msg.includes('412') || msg.includes('Precondition Failed')) {
      log.warn('optimistic.conflict', { table, rowId });
      return { success: false, conflict: true, error: 'Data telah diubah oleh pengguna lain. Silakan segarkan halaman.' };
    }

    throw e;
  }
}

/**
 * Optimistic update with automatic retry on conflict.
 *
 * On conflict, re-reads the row's updated_at and retries once.
 */
export async function optimisticUpdateWithRetry(
  table: string,
  rowId: string,
  body: Record<string, unknown>,
  opts: OptimisticOpts = {},
): Promise<UpdateResult> {
  const maxRetries = 1;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await optimisticUpdate(table, rowId, body, opts);

    if (result.success || !result.conflict) return result;

    // Conflict: try to re-read updated_at and retry
    if (attempt < maxRetries) {
      try {
        const rows = await supabaseJson('GET', table, {
          query: {
            select: 'updated_at',
            id: 'eq.' + rowId,
            limit: '1',
          },
        });
        if (Array.isArray(rows) && rows.length > 0) {
          const candidate = rows[0] as Record<string, unknown>;
          const freshUpdatedAt = typeof candidate.updated_at === 'string' ? candidate.updated_at : null;
          if (freshUpdatedAt) {
            log.info('optimistic.retry', { table, rowId, attempt: attempt + 1 });
            opts.updated_at = freshUpdatedAt;
            continue;
          }
        }
      } catch {
        // If re-read fails, return the conflict error
      }
    }
  }

  return { success: false, conflict: true, error: 'Data telah diubah oleh pengguna lain. Silakan segarkan halaman.' };
}

/**
 * Read a row's updated_at for optimistic concurrency.
 * Returns null if the row doesn't exist.
 */
export async function readUpdatedAt(
  table: string,
  query: Record<string, string>,
): Promise<string | null> {
  try {
    const rows = await supabaseJson('GET', table, {
      query: {
        select: 'updated_at',
        ...query,
        limit: '1',
      },
    });
    if (Array.isArray(rows) && rows.length > 0) {
      const candidate = rows[0] as Record<string, unknown>;
      return typeof candidate.updated_at === 'string' ? candidate.updated_at : null;
    }
    return null;
  } catch {
    return null;
  }
}
