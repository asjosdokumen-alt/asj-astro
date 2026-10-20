// ==========================================
// TESTS: contexts/sync/repository — BENTUK QUERY (2026-10-20)
//
// service.test.ts menstub `./repository`, jadi keputusan yang justru MUDAH
// rusak diam-diam — arah batas `gte`, batas keras 1000, proyeksi 11 kolom —
// tidak terukur di sana. Berkas ini memakunya.
//
//   1. BATAS INKLUSIF (`gte`, bukan `gt`). Migrasi 017 memberi 159 job SATU
//      nilai `updated_at` yang sama. Dengan `gt`, klien yang menyimpan
//      watermark dari jawaban sebelumnya melompati seluruh baris ber-nilai
//      sama itu, dan tidak ada cara baginya untuk mengetahui yang hilang.
//   2. PROYEKSI RINGAN. `master_database_candidate` punya 169 kolom. Delta
//      yang menarik semuanya adalah tepat biaya yang dihindari local-first.
//   3. BATAS 1000 pada probe = JUMLAH yang jujur. Tanpa `-1`, tabel besar
//      akan terbaca "1000 baris" selamanya, dan penghapusan tak terdeteksi.
// ==========================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => ({
  /** Isi tiap panggilan supabaseJson, dikonsumsi satu per satu. */
  answers: [] as unknown[],
  calls: [] as Array<{ method: string; table: string; opts: { query?: Record<string, unknown> } }>,
  throwNext: false,
}));

vi.mock('../../_lib/db/client', () => ({
  supabaseJson: vi.fn(async (method: string, table: string, opts: { query?: Record<string, unknown> }) => {
    m.calls.push({ method, table, opts });
    if (m.throwNext) {
      m.throwNext = false;
      throw new Error('column unknown');
    }
    return m.answers.length > 0 ? m.answers.shift() : [];
  }),
}));

import {
  SYNC_LIMIT,
  isSyncKey,
  syncRowsSince,
  syncWatermarks,
  syncManifest,
} from './repository';

const q = (i: number) => m.calls[i].opts.query as Record<string, string>;

beforeEach(() => {
  m.answers = [];
  m.calls = [];
  m.throwNext = false;
});

describe('syncRowsSince — batas inklusif & proyeksi', () => {
  it('pakai gte, bukan gt (migrasi 017: baris lama berbagi satu updated_at)', async () => {
    await syncRowsSince('jobs', '2026-10-20T00:00:00Z');
    expect(q(0).updated_at).toBe('gte.2026-10-20T00:00:00Z');
  });

  it('diurut ascending + limit SYNC_LIMIT (potong di server, bukan di klien)', async () => {
    await syncRowsSince('master', 'w');
    expect(q(0).order).toBe('updated_at.asc.nullslast');
    expect(q(0).limit).toBe(String(SYNC_LIMIT));
  });

  it('master terproyeksi 11 kolom — bukan select * (169 kolom)', async () => {
    await syncRowsSince('master', 'w');
    const select = q(0).select.split(',');
    expect(select).toHaveLength(11);
    expect(select).toContain('updated_at');
    expect(select).toContain('id_kandidat');
    expect(select).not.toContain('*');
  });

  it('kolom master TIDAK memuat kolom berat yang sudah dibuktikan berlebihan', async () => {
    await syncRowsSince('master', 'w');
    const select = q(0).select;
    // nama kolom-kolom ini ada di RPC `master_light` yang dibuang karena
    // memang tidak pernah dirender jalur baca.
    for (const berat of ['foto_url', 'berkas', 'catatan_ext', 'raw_payload']) {
      expect(select).not.toContain(berat);
    }
  });

  it('tabel lain select * sesuai jalur baca (form & kandidat belum didekorasi)', async () => {
    await syncRowsSince('forms', 'w');
    expect(q(0).select).toBe('*');
  });
});

describe('syncWatermarks — satu permintaan per tabel, jujur soal jumlah', () => {
  it('SATU permintaan per tabel (4 tabel = 4 permintaan), select hanya kunci+waktu', async () => {
    await syncWatermarks();
    expect(m.calls).toHaveLength(4);
    for (const c of m.calls) {
      expect(c.method).toBe('GET');
      // Dua kolom per baris, bukan 169.
      expect((c.opts.query as Record<string, string>).select.split(',')).toHaveLength(2);
    }
    expect(m.calls[0].table).toBe('job_database');
    expect(q(0).order).toBe('updated_at.desc.nullslast');
    expect(q(0).limit).toBe('1000');
  });

  it('watermark = updated_at baris PERTAMA (order desc), bukan urutan array', async () => {
    m.answers = [
      [
        { code_job: 'B', updated_at: '2026-10-20T11:00:00Z' },
        { code_job: 'A', updated_at: '2026-10-20T10:00:00Z' },
      ],
    ];
    const out = await syncWatermarks();
    expect(out.jobs).toEqual({ count: 2, watermark: '2026-10-20T11:00:00Z' });
  });

  it('>= 1000 baris → count -1 ("tidak diketahui"), BUKAN 1000', async () => {
    m.answers = [Array.from({ length: 1000 }, (_, i) => ({ code_job: `J${i}`, updated_at: 'w' }))];
    const out = await syncWatermarks();
    // Kalau cacat "count: rows.length" kembali, baris yang benar-benar 1000
    // akan terbaca sebagai jumlah pasti — dan penghapusan tak pernah terlihat.
    expect(out.jobs.count).toBe(-1);
  });

  it('satu tabel error → entri -1, TIDAK membatalkan tabel lain', async () => {
    m.throwNext = true;
    m.answers = [[{ id_kandidat: 'A', updated_at: 'w' }]];
    const out = await syncWatermarks();
    expect(out.jobs).toEqual({ count: -1, watermark: null });
    expect(out.master).toEqual({ count: 1, watermark: 'w' });
  });

  it('jawaban non-array → -1, bukan crash', async () => {
    m.answers = [{ error: 'nope' }];
    const out = await syncWatermarks();
    expect(out.jobs.count).toBe(-1);
  });
});

describe('syncManifest — pasangan (kunci, waktu) saja', () => {
  it('select kunci+updated_at, limit 1000, urut menurut kunci', async () => {
    await syncManifest('candidates');
    expect(q(0).select).toBe('id_kandidat,updated_at');
    expect(q(0).limit).toBe('1000');
    expect(q(0).order).toBe('id_kandidat.asc');
  });
});

describe('isSyncKey — nama tabel hanya milik sendiri', () => {
  it('menerima keempat nama sah', () => {
    expect(isSyncKey('jobs')).toBe(true);
    expect(isSyncKey('candidates')).toBe(true);
  });

  it('menolak nama warisan prototype (toString/constructor) — hasOwn, bukan "in"', async () => {
    // `in` akan mengembalikan true untuk 'toString' dan menyelidiki tabel
    // 'undefined' — ibarat "tabel tidak dikenal" dijawab dengan query.
    expect(isSyncKey('toString')).toBe(false);
    expect(isSyncKey('constructor')).toBe(false);
    expect(isSyncKey(42)).toBe(false);
    expect(isSyncKey(null)).toBe(false);
  });
});
