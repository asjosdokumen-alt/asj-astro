/**
 * job-status.test.ts — tabel keputusan status lowongan untuk TAMPILAN.
 *
 * MASALAH YANG DIKUNCI (dilaporkan pemilik 2026-10-25): panel admin menampilkan
 * `❌ CLOSE` di satu baris dan `CLOSE` di baris lain. Penyebabnya bukan tombol,
 * melainkan data: kolom `job_database.status` berisi teks bebas dari sistem lama
 * (`❌ CLOSE` 151 baris, `CLOSE`, `SELESAI / CLOSE`, `PROSES INTERVIEW`,
 * `PEMBERKASAN`, `APPROVED`, kosong), dan panel admin mencetak nilai MENTAH itu
 * sementara warnanya dicari lewat pencocokan persis.
 *
 * KENAPA DI `e2e/`
 * Murni tanpa DOM dan tanpa jaringan (R13f-bis: tes `.ts` baru masuk `e2e/`
 * supaya counter beku `indexer` — yang menghitung `src/**` — tidak bergeser).
 * Wajib terdaftar di `exclude` project frontend `vitest.config.ts`, kalau tidak
 * ia jalan DUA KALI.
 *
 * HUBUNGAN DENGAN BACKEND: aturan yang sama hidup di `normalizeStatus()`
 * (`netlify/functions/_lib/db/client.ts`). Tabel di bawah adalah paritasnya —
 * kalau salah satu berubah, tes ini yang harus gagal lebih dulu.
 */
import { describe, expect, it } from 'vitest';
import {
  JOB_STATUS_LABEL_KEY,
  JOB_STATUS_WRITE,
  jobStatusBadgeClass,
  jobStatusKey,
  jobStatusText,
} from '../src/lib/jobStatus';

describe('jobStatusKey — nilai mentah DB → kunci kanonik', () => {
  const cases: Array<[unknown, string]> = [
    // yang benar-benar ada di database (diukur 2026-10-25)
    ['❌ CLOSE', 'CLOSE'],
    ['CLOSE', 'CLOSE'],
    ['SELESAI / CLOSE', 'CLOSE'],
    // `sys_config.list_status_loker` menawarkan CANCEL — tanpa aturan ini ia
    // jatuh ke OPEN karena tidak mengandung kata CLOSE.
    ['CANCEL', 'CLOSE'],
    ['DIBATALKAN', 'CLOSE'],
    ['PROSES INTERVIEW', 'OPEN'],
    ['PEMBERKASAN', 'OPEN'],
    ['APPROVED', 'OPEN'],
    ['', 'CLOSE'],
    // varian lain yang harus ikut aturan backend
    ['close', 'CLOSE'],
    ['  Close  ', 'CLOSE'],
    ['TUTUP', 'CLOSE'],
    ['selesai', 'CLOSE'],
    ['✅ OPEN', 'OPEN'],
    ['OPEN', 'OPEN'],
    ['URGENT', 'URGENT'],
    ['❌ CLOSE URGENT', 'URGENT'],
    [null, 'CLOSE'],
    [undefined, 'CLOSE'],
  ];

  for (const [raw, expected] of cases) {
    it(`${JSON.stringify(raw)} → ${expected}`, () => {
      expect(jobStatusKey(raw)).toBe(expected);
    });
  }

  it('emoji dan spasi tidak lagi membedakan dua baris yang sama artinya', () => {
    expect(jobStatusKey('❌ CLOSE')).toBe(jobStatusKey('CLOSE'));
    expect(jobStatusKey('❌ CLOSE')).toBe(jobStatusKey('SELESAI / CLOSE'));
  });
});

describe('label & kelas pill', () => {
  it('setiap kunci punya kunci i18n', () => {
    expect(JOB_STATUS_LABEL_KEY.OPEN).toBe('status.open');
    expect(JOB_STATUS_LABEL_KEY.CLOSE).toBe('status.close');
    expect(JOB_STATUS_LABEL_KEY.URGENT).toBe('status.urgent');
  });

  it('kelas pill berbeda antar status (OPEN ≠ CLOSE)', () => {
    expect(jobStatusBadgeClass('OPEN')).not.toBe(jobStatusBadgeClass('CLOSE'));
    expect(jobStatusBadgeClass('URGENT')).not.toBe(jobStatusBadgeClass('CLOSE'));
  });

  it('teks untuk tabel statis = kunci kanonik, bukan nilai mentah', () => {
    expect(jobStatusText('❌ CLOSE')).toBe('CLOSE');
    expect(jobStatusText('PROSES INTERVIEW')).toBe('OPEN');
  });
});

describe('nilai yang DITULIS ke database', () => {
  it('hanya OPEN dan CLOSE, tanpa emoji', () => {
    expect(Object.keys(JOB_STATUS_WRITE).sort()).toEqual(['CLOSE', 'OPEN']);
    expect(JOB_STATUS_WRITE.OPEN).toBe('OPEN');
    expect(JOB_STATUS_WRITE.CLOSE).toBe('CLOSE');
    for (const v of Object.values(JOB_STATUS_WRITE)) {
      expect(v).not.toMatch(/[^\x20-\x7E]/); // ASCII saja
    }
  });
});
