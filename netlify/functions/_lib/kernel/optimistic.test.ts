import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabaseJson
vi.mock('../db/client', () => ({
  supabaseJson: vi.fn(),
}));

import { optimisticUpdate, optimisticUpdateWithRetry, readUpdatedAt } from './optimistic';
import { supabaseJson } from '../db/client';

const mockSupabaseJson = vi.mocked(supabaseJson);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('optimisticUpdate', () => {
  it('succeeds without If-Match when updated_at not provided', async () => {
    mockSupabaseJson.mockResolvedValue([{ id: 'row-1' }]);

    const result = await optimisticUpdate('database_candidate', 'row-1', {
      catatan_internal: 'new note',
    });

    expect(result.success).toBe(true);
    expect(mockSupabaseJson).toHaveBeenCalledWith(
      'PATCH',
      'database_candidate',
      expect.objectContaining({
        query: { id: 'eq.row-1' },
        body: { catatan_internal: 'new note' },
        headers: expect.not.objectContaining({
          'If-Match': expect.any(String),
        }),
      }),
    );
  });

  it('adds If-Match header when updated_at is provided', async () => {
    mockSupabaseJson.mockResolvedValue([{ id: 'row-1' }]);

    const result = await optimisticUpdate('database_candidate', 'row-1', {
      catatan_internal: 'new note',
    }, {
      updated_at: '2026-09-01T00:00:00Z',
    });

    expect(result.success).toBe(true);
    expect(mockSupabaseJson).toHaveBeenCalledWith(
      'PATCH',
      'database_candidate',
      expect.objectContaining({
        headers: expect.objectContaining({
          'If-Match': '"2026-09-01T00:00:00Z"',
        }),
      }),
    );
  });

  it('returns conflict when no row matched (P32: return=representation)', async () => {
    mockSupabaseJson.mockResolvedValue([]);

    const result = await optimisticUpdate('database_candidate', 'row-ghost', {
      catatan_internal: 'new note',
    });

    expect(result.success).toBe(false);
    expect(result.conflict).toBe(true);
    expect(mockSupabaseJson).toHaveBeenCalledWith(
      'PATCH',
      'database_candidate',
      expect.objectContaining({
        headers: expect.objectContaining({ Prefer: 'return=representation' }),
      }),
    );
  });

  it('returns conflict on 412 error', async () => {
    mockSupabaseJson.mockRejectedValue(new Error('HTTP 412 Precondition Failed'));

    const result = await optimisticUpdate('database_candidate', 'row-1', {
      catatan_internal: 'new note',
    }, {
      updated_at: '2026-09-01T00:00:00Z',
    });

    expect(result.success).toBe(false);
    expect(result.conflict).toBe(true);
  });

  it('rethrows non-412 errors', async () => {
    mockSupabaseJson.mockRejectedValue(new Error('HTTP 500'));

    await expect(
      optimisticUpdate('database_candidate', 'row-1', {
        catatan_internal: 'new note',
      }),
    ).rejects.toThrow('HTTP 500');
  });

  it('merges custom query params', async () => {
    mockSupabaseJson.mockResolvedValue(undefined);

    await optimisticUpdate('database_candidate', 'row-1', {
      catatan_internal: 'new note',
    }, {
      query: { id_kandidat: 'eq.ASJ001' },
    });

    expect(mockSupabaseJson).toHaveBeenCalledWith(
      'PATCH',
      'database_candidate',
      expect.objectContaining({
        query: expect.objectContaining({ id_kandidat: 'eq.ASJ001' }),
      }),
    );
  });
});

describe('readUpdatedAt', () => {
  it('returns updated_at from row', async () => {
    mockSupabaseJson.mockResolvedValue([{ updated_at: '2026-09-01T00:00:00Z' }]);

    const result = await readUpdatedAt('database_candidate', { id: 'eq.row-1' });

    expect(result).toBe('2026-09-01T00:00:00Z');
  });

  it('returns null when row not found', async () => {
    mockSupabaseJson.mockResolvedValue([]);

    const result = await readUpdatedAt('database_candidate', { id: 'eq.row-1' });

    expect(result).toBeNull();
  });

  it('returns null on error', async () => {
    mockSupabaseJson.mockRejectedValue(new Error('DB error'));

    const result = await readUpdatedAt('database_candidate', { id: 'eq.row-1' });

    expect(result).toBeNull();
  });
});
