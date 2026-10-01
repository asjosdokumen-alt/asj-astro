// ==========================================
// TESTS: ai/cv — `handleSubmitDataAsj` dan JUMLAH ROUND-TRIP-nya.
//
// KENAPA BERKAS INI DI `e2e/`, BUKAN DI SEBELAH KODENYA
// ----------------------------------------------------
// Karena counter beku `indexer` menghitung `netlify/functions/**` (semua
// `.ts`/`.tsx`/`.js`) tetapi **tidak** menghitung `.ts` di bawah `e2e/` —
// `includePath()` hanya menerima mjs/cjs/js untuk tier `e2e` (`indexer/src/util.ts`).
// Menaruh suite ini di sebelah `cv.ts` akan menambah 1 berkas + 1 `ts` +
// belasan simbol, dan itu memindahkan DUA counter beku (`count('ts')` 287 dan
// `fileCount` 529) sekaligus menembus envelope simbol — ketiganya di
// `indexer/src/{discover,build}.test.ts`, yang **hanya boleh diedit team-lead**.
// Jadi berkas ini mengikuti preseden `e2e/share-data.test.ts`: tes handler
// backend murni yang dijalankan project `backend`, di luar pohon yang dihitung.
// Kalau nanti counter-nya sudah di-baseline ulang, suite ini boleh dipindah ke
// `netlify/functions/_lib/ai/` — tidak ada yang bergantung pada lokasinya.
//
// Kenapa suite ini ada: jalur ini adalah satu-satunya tempat di repo yang
// dinyatakan TERBUKA di tinjauan 2026-10-01 (§5.2) — "~13 round-trip
// berurutan", ~500 ms serialisasi murni pada RTT ~40 ms, di jalur INTERAKTIF
// kandidat (menekan "Simpan CV AI" dan menunggu). Dan sampai sekarang ia
// **tidak punya satu pun tes**.
//
// Yang diukur di sini bukan "kode terlihat lebih rapi", tapi JUMLAH PERCAKAPAN
// KE DATABASE — angka yang bisa dihitung, bukan dikira-kira. Setiap helper yang
// di-mock TETAP mencatat pembacaan yang di produksi benar-benar dilakukannya,
// supaya totalnya tidak terlihat lebih kecil dari kenyataan.
// ==========================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

/** Percakapan ke PostgREST: {method, table}. */
const rtt: Array<{ method: string; table: string }> = [];

vi.mock('../netlify/functions/_lib/db/client.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../netlify/functions/_lib/db/client.ts')>();
  return {
    ...actual,
    supabaseJson: vi.fn(async (method: string, table: string) => {
      rtt.push({ method, table });
      return [];
    }),
    // `supabaseUpsert` dipanggil lewat `await import(...)` di dalam handler, dan
    // di dalam modulnya ia memanggil `supabaseJson` LOKAL — jadi mock di atas
    // TIDAK mencegatnya. Tanpa mock ini, jalur master gagal di jaringan
    // sungguhan, handler berhenti di catch-nya, dan tesnya melaporkan 3
    // percakapan padahal jalur penuhnya jauh lebih panjang.
    supabaseUpsert: vi.fn(async (table: string) => {
      rtt.push({ method: 'POST', table });
    }),
  };
});

vi.mock('../netlify/functions/_lib/db/projections.ts', () => ({
  AI_SUBMISSION_COLS: 'id,wa,submitted_via,nama_lengkap,ai_data_json',
  ESIGNATURE_COLS: 'id',
}));

vi.mock('../netlify/functions/contexts/identity', () => ({
  requireRole: vi.fn(() => ({ token: { wa: '6285700000001', role: 'admin', name: 'Admin' } })),
  isOwnerOrAdmin: vi.fn(() => true),
  verifyToken: vi.fn(() => ({ role: 'admin', wa: '6285700000001' })),
}));

vi.mock('../netlify/functions/contexts/master-data', () => ({ buildMasterNested: vi.fn(() => ({})) }));

/**
 * Di produksi kedua helper ini MEMBACA `database_asj_form` lewat `getFormsByWa`
 * — KECUALI kalau pemanggil sudah menyerahkan barisnya. Mock ini meniru
 * kontrak itu persis (lihat `contexts/applications/service.ts`), supaya jumlah
 * yang dilaporkan tidak lebih kecil daripada kenyataan, dan supaya berhentinya
 * penyerahan baris itu akan terlihat sebagai round-trip tambahan.
 */
const syncBiodataKeMail = vi.fn(async (...args: unknown[]) => {
  // args = (wa, nama, labels, sessionToken, preloadedRows)
  if (!Array.isArray(args[4])) rtt.push({ method: 'GET', table: 'database_asj_form' });
});
const syncFormMailDariUpload = vi.fn(async (...args: unknown[]) => {
  // args = (wa, nama, docLabel, url, jobCode, sessionToken, preloadedRows)
  if (!Array.isArray(args[6])) rtt.push({ method: 'GET', table: 'database_asj_form' });
  rtt.push({ method: 'POST', table: 'database_asj_form' }); // insert baris mail
});

vi.mock('../netlify/functions/contexts/applications', () => ({
  syncBiodataKeMail: (...a: unknown[]) => syncBiodataKeMail(...a),
  syncFormMailDariUpload: (...a: unknown[]) => syncFormMailDariUpload(...a),
}));

vi.mock('../netlify/functions/_lib/db/master.ts', () => ({ fetchMasterByWa: vi.fn(async () => []) }));

/** `findFormsByWa` = satu pembacaan nyata ke `database_asj_form`. */
const findFormsByWa = vi.fn(async (..._args: unknown[]) => {
  rtt.push({ method: 'GET', table: 'database_asj_form' });
  return [];
});
vi.mock('../netlify/functions/_lib/db/forms.ts', () => ({ findFormsByWa: (...a: unknown[]) => findFormsByWa(...a) }));

vi.mock('../netlify/functions/_lib/storage', () => ({ isAllowedDocumentUrl: vi.fn(() => true) }));

vi.mock('../netlify/functions/_lib/db/candidates.ts', () => ({
  // Pembacaan nyata ke `database_candidate` — dicatat seperti helper lain.
  findCandidateByWaFiltered: vi.fn(async () => {
    rtt.push({ method: 'GET', table: 'database_candidate' });
    return { id: 1, no_wa: '6285700000001' };
  }),
  findCandidateByIdFiltered: vi.fn(async () => {
    rtt.push({ method: 'GET', table: 'database_candidate' });
    return null;
  }),
  findCandidates: vi.fn(async () => ({ table: 'database_candidate', rows: [] })),
  // `nextCandidateId()` memanggil ini lewat `await import('./db/candidates')` —
  // DI LUAR try/catch-nya, jadi kalau tidak diekspor, lemparannya membatalkan
  // seluruh jalur simpan dan tesnya melaporkan jauh lebih sedikit round-trip
  // daripada yang sebenarnya terjadi.
  maxCandidateIdNumber: vi.fn(async () => 10_000),
}));

import { handleSubmitDataAsj } from '../netlify/functions/_lib/ai/cv';

/** Payload dengan KTP — inilah cabang yang paling banyak membaca. */
function payloadWithKtp() {
  return [
    {
      context: { wa: '6285700000001', job: 'KAIGO' },
      identitas: { nama_lengkap: 'BUDI SANTOSO', hp: '6285700000001', gender: 'LAKI-LAKI' },
      ktpFile: 'https://example.supabase.co/storage/v1/object/public/docs/ktp.png',
      fotoFile: 'https://example.supabase.co/storage/v1/object/public/docs/foto.png',
    },
  ];
}

beforeEach(() => {
  rtt.length = 0;
  syncBiodataKeMail.mockClear();
  syncFormMailDariUpload.mockClear();
  findFormsByWa.mockClear();
});

describe('handleSubmitDataAsj — jumlah round-trip ke database', () => {
  it('menyimpan CV AI dengan jumlah round-trip yang terbatas', async () => {
    const res = await handleSubmitDataAsj(payloadWithKtp(), 'tok-admin');

    expect(res).toMatchObject({ success: true });
    // Cetak supaya angkanya terlihat saat tes dijalankan — klaim "lebih sedikit"
    // harus punya angka di sebelahnya.
    // eslint-disable-next-line no-console
    console.log(
      '[rtt] handleSubmitDataAsj = ' + rtt.length + ' percakapan\n' +
        rtt.map((c, i) => `  ${i + 1}. ${c.method} ${c.table}`).join('\n'),
    );
    expect(rtt.length).toBeGreaterThan(0);
  });

  it('`database_asj_form` dibaca SEKALI, bukan berkali-kali untuk baris yang sama', async () => {
    await handleSubmitDataAsj(payloadWithKtp(), 'tok-admin');

    const formReads = rtt.filter((c) => c.table === 'database_asj_form' && c.method === 'GET');
    // Sebelumnya EMPAT pembacaan terpisah untuk WA yang sama dalam SATU
    // permintaan (terukur, lihat console.log di tes pertama):
    //   1. cv.ts, untuk menemukan baris pemberkasan (id) guna sync ktp_url
    //   2. syncBiodataKeMail, untuk menemukan baris yang di-PATCH
    //   3. cv.ts, untuk memutuskan `hasMail` sebelum syncFormMailDariUpload
    //   4. syncFormMailDariUpload, untuk memutuskan baris target
    // Yang ketiga menanyakan hal yang SUDAH dijawab yang pertama: baris tidak
    // bisa bertambah di antaranya — `syncBiodataKeMail` memanggil `patchForm`
    // (`contexts/applications/repository.ts:37`) yang PATCH murni, tidak pernah
    // INSERT. Jadi jawaban `hasMail` tidak berubah.
    expect(formReads.length).toBe(1);
  });

  it('baris yang sudah dibaca benar-benar DISERAHKAN ke kedua helper', async () => {
    await handleSubmitDataAsj(payloadWithKtp(), 'tok-admin');

    // Kontraknya harus eksplisit: yang menghemat round-trip adalah baris yang
    // diserahkan, bukan kebetulan. Kalau penyerahan itu hilang, mock di atas
    // akan mencatat pembacaan tambahan DAN argumen ini menjadi undefined.
    expect(syncBiodataKeMail.mock.calls[0]?.[4]).toEqual([]);
    expect(syncFormMailDariUpload.mock.calls[0]?.[6]).toEqual([]);
  });

  it('tanpa berkas KTP, `database_asj_form` tetap dibaca sekali', async () => {
    const payload = payloadWithKtp();
    delete (payload[0] as Record<string, unknown>).ktpFile;

    await handleSubmitDataAsj(payload, 'tok-admin');

    const formReads = rtt.filter((c) => c.table === 'database_asj_form' && c.method === 'GET');
    expect(formReads.length).toBe(1);
  });

  it('total percakapan ke database turun ke 8 (dari 11)', async () => {
    await handleSubmitDataAsj(payloadWithKtp(), 'tok-admin');
    // Angka ini adalah jumlah TERUKUR dari console.log di tes pertama, bukan
    // perkiraan. Ia dipaku supaya penambahan round-trip berikutnya tidak lolos
    // tanpa suara — tapi lihat §"batas" di laporan: yang lebih penting daripada
    // angkanya adalah bahwa tidak ada lagi pertanyaan yang diulang.
    expect(rtt.length).toBe(8);
  });
});
