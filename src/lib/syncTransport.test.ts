/**
 * syncTransport.test.ts — Penjaga transport client-side memanggil action yang
 * benar dengan argumen yang tepat.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncTransport } from './syncTransport';

const apiSecure = vi.fn();

vi.mock('./apiClient', () => ({
  default: { secure: (...args: unknown[]) => apiSecure(...args) },
}));

beforeEach(() => {
  apiSecure.mockReset();
});

describe('syncTransport', () => {
  it('probe memanggil syncProbe tanpa argumen', async () => {
    apiSecure.mockResolvedValue({
      success: true,
      tables: { jobs: { count: 159, watermark: 'w1' } },
    });
    const t = syncTransport('jobs', (r) => String((r as Record<string, unknown>).code || ''));
    const res = await t.probe();
    expect(apiSecure).toHaveBeenCalledWith('syncProbe', [], { onSessionInvalid: 'throw' });
    expect(res.tables?.jobs.count).toBe(159);
    expect(res.tables?.jobs.watermark).toBe('w1');
  });

  it('delta memanggil syncDelta dengan [table, since]', async () => {
    apiSecure.mockResolvedValue({ success: true, rows: [{ code: 'J1' }], nextSince: 'w2', more: false });
    const t = syncTransport('jobs', () => '');
    const res = await t.delta('w1');
    expect(apiSecure).toHaveBeenCalledWith('syncDelta', ['jobs', 'w1'], { onSessionInvalid: 'throw' });
    expect(res.success).toBe(true);
    expect(res.rows).toHaveLength(1);
  });

  it('manifest memanggil syncManifest dengan [table]', async () => {
    apiSecure.mockResolvedValue({ success: true, manifest: [{ id: 'J1', updatedAt: 'w1' }] });
    const t = syncTransport('jobs', () => '');
    const res = await t.manifest();
    expect(apiSecure).toHaveBeenCalledWith('syncManifest', ['jobs'], { onSessionInvalid: 'throw' });
    expect(res.success).toBe(true);
    expect(res.manifest).toHaveLength(1);
  });

  it('full() melempar — tarikan penuh lewat jalur baca aplikasi', async () => {
    const t = syncTransport('jobs', () => '');
    await expect(t.full()).rejects.toThrow('syncTransport.full() belum diimplementasikan');
  });
});
