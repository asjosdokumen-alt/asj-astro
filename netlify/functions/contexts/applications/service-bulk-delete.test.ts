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

vi.mock('../identity', () => ({
  requireAdmin: (token: string) =>
    token === 'admin-ok' ? { ok: true } : { error: { success: false, error: 'sessionInvalid' } },
}));

vi.mock('../../_lib/cache', () => ({ cacheClear: () => {} }));

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
    patchForm: async () => {},
    mapForm: (f: unknown) => f,
    supabaseJson: async () => [],
    normalizeWa: (v: unknown) => String(v ?? ''),
  };
});

const { handleHapusFormTerpilih, MAX_BULK_DELETE } = await import('./service');

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
