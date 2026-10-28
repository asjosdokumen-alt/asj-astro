/**
 * service-bulk-delete.test.ts — hapus massal lamaran (#15) harus benar saat
 * indeks bergeser.
 *
 * BUG YANG DIKUNCI TES INI
 *   `deleteForm` lama menerima **rowIndex**, bukan id. Kalau bulk delete meniru
 *   legacy (`js/api/forms.ts` memanggil `deleteForm` satu per satu dari klien),
 *   menghapus [2,3] berurutan akan menghapus baris 2, lalu baris yang tadinya 3
 *   sudah bergeser ke 2 — sehingga yang terhapus adalah baris 4, dan satu baris
 *   yang benar-benar dipilih lolos. Tidak ada error; hasilnya hanya "salah".
 *
 *   Karena itu handler menyelesaikan SEMUA index → id dulu, baru menghapus.
 *   Mock di bawah memodelkan pergeseran itu dengan jujur: array `forms` benar-
 *   benar dipangkas, jadi implementasi yang menghapus sambil me-resolve akan
 *   memerahkan tes ini.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/** Baris form tiruan — satu baris per index, dengan id stabil. */
type Row = { id: number; status: string };

let forms: Row[] = [];
const deletedIds: Array<string | number> = [];

/** Pencatat: berapa kali resolve dipanggil vs delete — untuk bukti urutan fase. */
const callLog: string[] = [];

/**
 * Dipakai describe `syncBiodataKeMail` di bawah (ditaruh di berkas ini, bukan
 * berkas baru: berkas tes baru di `src/**`/`netlify/**` menggeser `files.length`,
 * counter beku 603).
 */
let formsByWa: Record<string, unknown>[] = [];
const upserts: Record<string, unknown>[] = [];
const patches: Array<{ id: unknown; body: Record<string, unknown> }> = [];
const notified: unknown[][] = [];

/** Baris kandidat yang dikembalikan `findCandidateByWa` (null = belum terdaftar). */
let candidateRow: Record<string, unknown> | null = null;
/** Pencatat tulis langsung ke `database_candidate` (jalur sync tahapan). */
const candidateWrites: Array<{ method: string; table: string; body: Record<string, unknown> }> = [];

vi.mock('../../_lib/candidate-helpers', () => ({
  findCandidateByWa: async () => candidateRow,
  nextCandidateId: async () => 'ASJ99999',
}));

vi.mock('../identity', () => ({
  requireAdmin: (token: string) =>
    token === 'admin-ok' ? { ok: true } : { error: { success: false, error: 'sessionInvalid' } },
}));

vi.mock('../../_lib/cache', () => ({ cacheClear: () => {} }));

vi.mock('../../_lib/fcm-helpers', () => ({
  notifyAdmins: (...args: unknown[]) => {
    notified.push(args);
    return Promise.resolve();
  },
}));

vi.mock('./repository', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('./repository');
  return {
    ...actual,
    // getFormByIndex membaca dari array yang SAMA dengan yang dihapus,
    // jadi pergeseran index benar-benar terjadi di tes ini.
    getFormByIndex: async (idx: number) => {
      callLog.push(`resolve:${idx}`);
      return forms[idx] ? { ...forms[idx] } : null;
    },
    deleteForm: async (id: string | number) => {
      callLog.push(`delete:${id}`);
      deletedIds.push(id);
      const at = forms.findIndex((f) => f.id === Number(id));
      if (at >= 0) forms.splice(at, 1); // ← pergeseran nyata
    },
    patchForm: async (id: unknown, body: Record<string, unknown>) => {
      patches.push({ id, body });
    },
    getFormsByWa: async () => formsByWa,
    upsertForm: async (body: Record<string, unknown>) => {
      upserts.push(body);
    },
    mapForm: (f: unknown) => f,
    supabaseJson: async (method: string, table: string, init?: { body?: Record<string, unknown> }) => {
      candidateWrites.push({ method, table, body: (init?.body || {}) as Record<string, unknown> });
      return [];
    },
    normalizeWa: (v: unknown) => String(v ?? ''),
  };
});

const { handleHapusFormTerpilih, MAX_BULK_DELETE, syncBiodataKeMail, handleApproveForm, handleReviewForm } = await import('./service');

beforeEach(() => {
  // id sengaja TIDAK sama dengan index (id mulai 101) supaya tertukar
  // index↔id tidak lolos secara kebetulan.
  forms = [
    { id: 101, status: 'MENUNGGU' },
    { id: 102, status: 'MENUNGGU' },
    { id: 103, status: 'MENUNGGU' },
    { id: 104, status: 'MENUNGGU' },
    { id: 105, status: 'MENUNGGU' },
  ];
  deletedIds.length = 0;
  callLog.length = 0;
});

describe('handleHapusFormTerpilih — guard', () => {
  it('menolak tanpa sesi admin', async () => {
    const res: any = await handleHapusFormTerpilih([[0]], 'bukan-admin');
    expect(res.success).toBe(false);
    expect(deletedIds).toHaveLength(0);
  });

  it('menolak daftar kosong', async () => {
    const res: any = await handleHapusFormTerpilih([[]], 'admin-ok');
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/tidak ada baris/i);
  });

  it('menolak daftar yang seluruhnya index invalid', async () => {
    const res: any = await handleHapusFormTerpilih([['x', -1, 1.5, null]], 'admin-ok');
    expect(res.success).toBe(false);
  });

  it('menolak melebihi batas MAX_BULK_DELETE (tidak menghapus apa pun)', async () => {
    const tooMany = Array.from({ length: MAX_BULK_DELETE + 1 }, (_, i) => i);
    const res: any = await handleHapusFormTerpilih([tooMany], 'admin-ok');
    expect(res.success).toBe(false);
    expect(deletedIds).toHaveLength(0);
  });
});

describe('handleHapusFormTerpilih — pergeseran index', () => {
  it('menghapus [1,3] → id 102 & 104, BUKAN 102 & 105', async () => {
    const res: any = await handleHapusFormTerpilih([[1, 3]], 'admin-ok');
    expect(res.success).toBe(true);
    expect(res.deleted).toBe(2);
    // Inilah bug yang dicegah: tanpa resolve-dulu, index 3 sudah bergeser
    // setelah index 1 dihapus sehingga yang terambil jadi id 105.
    expect(deletedIds.sort()).toEqual([102, 104]);
    expect(forms.map((f) => f.id)).toEqual([101, 103, 105]);
  });

  it('menghapus index berurutan [0,1,2] → id 101,102,103', async () => {
    const res: any = await handleHapusFormTerpilih([[0, 1, 2]], 'admin-ok');
    expect(res.success).toBe(true);
    expect(deletedIds.sort()).toEqual([101, 102, 103]);
    expect(forms.map((f) => f.id)).toEqual([104, 105]);
  });

  it('SEMUA index diselesaikan lebih dulu, baru ada delete (fase terpisah)', async () => {
    await handleHapusFormTerpilih([[0, 2, 4]], 'admin-ok');
    const firstDelete = callLog.findIndex((c) => c.startsWith('delete:'));
    const lastResolve = callLog.map((c) => c.startsWith('resolve:')).lastIndexOf(true);
    expect(firstDelete).toBeGreaterThan(lastResolve);
  });
});

describe('handleHapusFormTerpilih — idempotensi & input kotor', () => {
  it('index duplikat hanya dihapus sekali', async () => {
    const res: any = await handleHapusFormTerpilih([[2, 2, 2]], 'admin-ok');
    expect(res.deleted).toBe(1);
    expect(deletedIds).toEqual([103]);
  });

  it('index yang tidak ada dilaporkan notFound, sisanya tetap terhapus', async () => {
    const res: any = await handleHapusFormTerpilih([[0, 99]], 'admin-ok');
    expect(res.success).toBe(true);
    expect(res.notFound).toEqual([99]);
    expect(deletedIds).toEqual([101]);
  });

  it('index di luar jangkauan saja → deleted 0, tidak melempar', async () => {
    const res: any = await handleHapusFormTerpilih([[50]], 'admin-ok');
    expect(res.deleted).toBe(0);
    expect(res.notFound).toEqual([50]);
    expect(deletedIds).toHaveLength(0);
  });

  it('index sebagai string angka tetap diterima (klien mengirim string)', async () => {
    const res: any = await handleHapusFormTerpilih([['0', '1']], 'admin-ok');
    expect(res.deleted).toBe(2);
    expect(deletedIds.sort()).toEqual([101, 102]);
  });

  it('payload yang bukan array tidak melempar', async () => {
    const res: any = await handleHapusFormTerpilih([undefined], 'admin-ok');
    expect(res.success).toBe(false);
  });
});

// ==========================================
// TESTS: syncBiodataKeMail — push dan jejak Mail tidak boleh berbeda syarat
//
// BUG YANG DIKUNCI TES INI (dilaporkan pemilik 2026-10-29)
//   "update biodata → ada notif, tapi saya refresh Mail, kosong."
//   Penyebabnya bukan FCM: `syncBiodataKeMail` menulis jejak ke Mail HANYA kalau
//   kandidat sudah punya baris `database_asj_form`, sementara `notifyAdmins`
//   dipanggil tanpa syarat itu. Kode sendiri mencatat 51 baris form untuk 226
//   kandidat, jadi untuk mayoritas kandidat push terkirim dan Mail kosong.
//
//   Jalur upload sudah benar sejak dulu (`syncFormMailDariUpload`:
//   `if (!targets.length) targets = [{}]`), jadi yang diperbaiki adalah
//   ASIMETRINYA, bukan aturan barunya.
// ==========================================
describe('syncBiodataKeMail — jejak Mail punya syarat yang sama dengan push', () => {
  const WA = '628111222333';

  beforeEach(() => {
    formsByWa = [];
    upserts.length = 0;
    patches.length = 0;
    notified.length = 0;
  });

  it('KONTROL: kandidat yang sudah punya baris → patch, bukan upsert', async () => {
    formsByWa = [{ id: 7, no_wa: WA, status: 'MENUNGGU', feedback_berkas: '' }];

    await syncBiodataKeMail(WA, 'BUDI', ['Nama']);

    expect(patches).toHaveLength(1);
    expect(patches[0].id).toBe(7);
    expect(upserts).toHaveLength(0);
    expect(notified).toHaveLength(1);
  });

  it('kandidat TANPA baris form → satu baris [BIODATA] dibuat, bukan nol', async () => {
    formsByWa = [];

    await syncBiodataKeMail(WA, 'BUDI', ['Nama', 'Alamat']);

    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({
      no_wa: WA,
      code_job: '',
      nama_lengkap: 'BUDI',
      status: 'MENUNGGU',
    });
    expect(String(upserts[0].feedback_berkas)).toContain('[BIODATA]');
    expect(String(upserts[0].feedback_berkas)).toContain('Nama, Alamat');
  });

  it('push menunjuk #mail — barisnya kini benar-benar ada di sana', async () => {
    formsByWa = [];

    await syncBiodataKeMail(WA, 'BUDI', ['Nama']);

    expect(notified).toHaveLength(1);
    expect(notified[0][2]).toBe('/admin.html#mail');
  });

  it('kandidat yang sudah punya baris tidak ikut di-upsert (tidak ada baris ganda)', async () => {
    formsByWa = [{ id: 9, no_wa: WA, status: 'LULUS', feedback_berkas: 'lama' }];

    await syncBiodataKeMail(WA, 'BUDI', ['Nama']);

    expect(upserts).toHaveLength(0);
    // Status yang sudah LULUS naik jadi UPDATE — perilaku lama, jangan berubah.
    expect(patches[0].body.status).toBe('UPDATE');
    expect(String(patches[0].body.feedback_berkas)).toContain('[[PREV:LULUS]]');
  });
});

// ==========================================
// TESTS: menyetujui DOKUMEN tidak boleh menandai kandidat "LULUS"
//
// Keluhan pemilik 2026-10-29: "update biodata kan gak perlu lulus dari admin;
// banyak status lulus yang bikin bingung; kalau dokumen itu approve, kalau
// lulus itu lulus tahapan."
//
// Penyebabnya ada di `syncCandidateDariForm`: menyetujui satu baris Mail
// menulis `status_kandidat = 'LULUS'` pada kandidat — termasuk untuk baris yang
// `code_job`-nya KOSONG, yaitu baris biodata/dokumen yang bukan lamaran loker.
// Akibatnya menyetujui scan paspor menandai orangnya lulus seleksi.
//
// `database_asj_form` memang menyimpan dua jenis baris (lihat `isBiodataRow` di
// CandidateDash.tsx): lamaran punya `code_job`, biodata/dokumen tidak. Yang
// boleh menggerakkan status kandidat hanya yang pertama.
// ==========================================
describe('handleApproveForm — persetujuan dokumen bukan kelulusan tahapan', () => {
  const WA = '628111222333';

  beforeEach(() => {
    forms = [{ id: 55, status: 'MENUNGGU' }];
    patches.length = 0;
    candidateWrites.length = 0;
    candidateRow = { id: 3, status_kandidat: 'BARU' };
  });

  it('baris BIODATA (code_job kosong) → tidak menulis status_kandidat LULUS', async () => {
    forms = [{ id: 55, status: 'MENUNGGU', no_wa: WA, code_job: '', nama_lengkap: 'BUDI' } as never];

    await handleApproveForm([0], 'admin-ok');

    // Baris Mail-nya tetap disetujui…
    expect(patches[0].body.status).toBe('LULUS');
    // …tapi kandidatnya TIDAK ikut dinyatakan lulus.
    const patchCandidate = candidateWrites.find((w) => w.table === 'database_candidate');
    if (patchCandidate) {
      expect(patchCandidate.body.status_kandidat).toBeUndefined();
      expect(patchCandidate.body.id_loker_pilihan).toBeUndefined();
    }
  });

  it('KONTROL: lamaran sungguhan (code_job terisi) tetap menandai LULUS', async () => {
    forms = [{ id: 56, status: 'MENUNGGU', no_wa: WA, code_job: 'TG1ASJ', nama_lengkap: 'BUDI' } as never];

    await handleApproveForm([0], 'admin-ok');

    const patchCandidate = candidateWrites.find((w) => w.table === 'database_candidate');
    expect(patchCandidate).toBeDefined();
    expect(patchCandidate?.body.status_kandidat).toBe('LULUS');
    expect(patchCandidate?.body.id_loker_pilihan).toBe('TG1ASJ');
  });
});

// ==========================================
// TESTS: `handleReviewForm` menulis nilai yang SAMA dengan keranjang UI
//
// Nilai lama `REVIEW ADMIN` (dengan spasi) tidak cocok dengan keranjang
// `REVIEW` di TabMail, jadi baris yang sedang ditinjau menghilang dari semua
// filter. UI sekarang menormalkan nilai lama, tapi penulisnya juga harus
// berhenti membuat nilai baru yang salah.
// ==========================================
describe('handleReviewForm — nilai status sama dengan keranjang UI', () => {
  it('menulis REVIEW, bukan REVIEW ADMIN', async () => {
    forms = [{ id: 77, status: 'MENUNGGU', no_wa: '628111222333', code_job: 'TG1ASJ' } as never];
    patches.length = 0;
    candidateRow = { id: 3 };

    await handleReviewForm([0], 'admin-ok');

    expect(patches[0].body.status).toBe('REVIEW');
  });
});
