/**
 * candidates.test.ts — `attachApplications` must let the UI tell a JOB
 * APPLICATION apart from a BIODATA/DOCUMENT row.
 *
 * WHY THIS MATTERS
 *   `database_asj_form` holds two different kinds of row in one table:
 *
 *     (a) a real job application   -> `code_job` is filled ('KODE-JOB')
 *     (b) a biodata/document update -> `code_job` is empty, and the row carries
 *         a marker in `feedback_berkas`: '[BIODATA] …' or '[UPLOAD <LABEL>]'
 *
 *   Both reach the SAME admin approval path, so approving a passport scan wrote
 *   `status = 'LULUS'` on a row that is not an application at all. The candidate
 *   dashboard then rendered "Telah disetujui admin" for it, and because the
 *   stage machine is driven off the same status, the selection pipeline appeared
 *   to advance off a document review.
 *
 *   Migration 013 gives the DOCUMENT verdict its own column (`status_biodata`).
 *   Until that column is projected to the client, the only available signal is
 *   the row marker — so it has to survive `attachApplications` instead of being
 *   dropped on the floor. That is exactly what these tests pin.
 *
 * WHAT IS ASSERTED
 *   · `feedback_berkas` is carried through as `feedback`
 *   · a marked row with an empty `code_job` is distinguishable from a real one
 *   · the discriminator does NOT depend on `status` (a document row and an
 *     application row can both read 'LULUS'; that is the whole defect)
 *   · the shape stays additive — existing consumers keep their fields
 *
 * DB-free and network-free: `attachApplications` is a pure function over two
 * arrays. No mocking, because there is nothing to mock.
 */
import { describe, it, expect } from 'vitest';
import { attachApplications } from './candidates';

/** A candidate row as the caller would supply it (WA is the join key). */
const cand = (wa: string, extra: Record<string, unknown> = {}) => ({
  wa,
  tahapan: 'CHECK KAIWA',
  ...extra,
});

/** A real job application: code_job filled, no biodata marker. */
const realApp = (wa: string, status = 'LULUS') => ({
  no_wa: wa,
  code_job: 'JOB-001',
  status,
  kategory: 'TOKUTEI',
  timestamp: '2026-09-01T00:00:00Z',
  nama_lengkap: 'BUDI',
  file_cv: 'cv.pdf',
  feedback_berkas: '',
});

/** A biodata / document row: code_job EMPTY, marker present. */
const bioRow = (wa: string, status = 'LULUS', marker = '[BIODATA] paspor, ktp') => ({
  no_wa: wa,
  code_job: '',
  status,
  kategory: '',
  timestamp: '2026-09-02T00:00:00Z',
  nama_lengkap: 'BUDI',
  file_cv: '',
  feedback_berkas: marker,
});

describe('attachApplications', () => {
  it('attaches applications to the matching candidate by WA', () => {
    const out = attachApplications([cand('628111')], [realApp('628111')]);
    expect(out[0].applications).toHaveLength(1);
    expect(out[0].applications[0].code).toBe('JOB-001');
  });

  it('carries feedback_berkas through as `feedback`', () => {
    const out = attachApplications([cand('628111')], [bioRow('628111')]);
    expect(out[0].applications[0].feedback).toBe('[BIODATA] paspor, ktp');
  });

  it('carries an empty feedback as an empty string, not undefined', () => {
    const out = attachApplications([cand('628111')], [realApp('628111')]);
    // A consumer testing `feedback.includes(...)` must not have to guard for
    // undefined — the projection guarantees a string.
    expect(out[0].applications[0].feedback).toBe('');
  });

  // ── the defect itself ────────────────────────────────────────────────────
  // Both rows below read status 'LULUS'. A UI that keys off status alone cannot
  // tell them apart, which is why the marker must reach the client. This test
  // exists to make that impossibility explicit rather than implied.
  it('distinguishes a document approval from an application approval, at equal status', () => {
    const out = attachApplications(
      [cand('628111')],
      [realApp('628111', 'LULUS'), bioRow('628111', 'LULUS')],
    );
    const apps = out[0].applications;
    expect(apps).toHaveLength(2);

    const isBiodataRow = (a: { code: string; feedback: string }) =>
      !String(a.code || '').trim() && /\[BIODATA\]|\[UPLOAD /.test(a.feedback);

    const bio = apps.filter(isBiodataRow);
    const real = apps.filter((a) => !isBiodataRow(a));

    expect(bio).toHaveLength(1);
    expect(real).toHaveLength(1);
    // Same status, different meaning — the client can now separate them.
    expect(bio[0].status).toBe(real[0].status);
  });

  it('recognises the [UPLOAD <LABEL>] marker too, not only [BIODATA]', () => {
    const out = attachApplications([cand('628111')], [bioRow('628111', 'LULUS', '[UPLOAD PASPOR]')]);
    const a = out[0].applications[0];
    expect(/\[BIODATA\]|\[UPLOAD /.test(a.feedback)).toBe(true);
    expect(String(a.code || '').trim()).toBe('');
  });

  // ── additive-only ───────────────────────────────────────────────────────
  it('keeps every field existing consumers read', () => {
    const out = attachApplications([cand('628111')], [realApp('628111')]);
    const a = out[0].applications[0];
    for (const field of ['code', 'kategori', 'status', 'timestamp', 'nama', 'cv']) {
      expect(a, `missing field ${field}`).toHaveProperty(field);
    }
  });

  it('still stamps the candidate tahapan onto each application', () => {
    const out = attachApplications([cand('628111', { tahapan: 'MCU' })], [realApp('628111')]);
    expect(out[0].applications[0].tahapan).toBe('MCU');
  });

  it('returns the candidate list unchanged when forms is not an array', () => {
    const cands = [cand('628111')];
    expect(attachApplications(cands, undefined as unknown as [])).toBe(cands);
  });
});
