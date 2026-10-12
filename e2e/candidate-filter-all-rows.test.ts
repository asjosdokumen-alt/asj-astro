// ==========================================
// TESTS: filter kandidat admin menjangkau SELURUH baris, bukan satu halaman.
//
// KENAPA DI `e2e/`: tier `e2e` hanya menghitung mjs/cjs/js, jadi suite `.ts` di
// sini tidak menggerakkan counter beku yang hanya boleh di-baseline ulang
// team-lead (lihat catatan yang sama di `e2e/ai-cv-submit.test.ts`).
//
// YANG DIUJI
// ----------
// `loadCandidatesUnik()` menerima `{ q, gender, age, jft }` dan menyaring
// SELURUH baris sebelum memotong per halaman, sehingga `total` yang dikirim ke
// layar = jumlah yang benar-benar cocok.
//
// Sebelum 2026-10-12 hanya `q` yang sampai ke repository; gender/usia/JFT
// disaring di browser atas 20 baris yang sudah dimuat. Tes ini merah di kode
// lama dengan cara yang tepat: `total` sama dengan JUMLAH SELURUH BARIS (45),
// bukan jumlah yang cocok (15) — karena kriterianya diabaikan sama sekali.
//
// Kenapa "bukan satu halaman" penting: baris yang cocok sengaja diletakkan di
// URUTAN TERAKHIR. Filter yang hanya bekerja atas halaman pertama akan
// mengembalikan nol baris untuk kriteria itu.
// ==========================================
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadCandidatesUnik } from '../netlify/functions/contexts/catalog';

/**
 * 45 baris: 30 laki-laki umur 30 dengan JFT B1, lalu 15 perempuan umur 18
 * dengan JFT A2. Yang perempuan/umur-18/A2 ada di BELAKANGAN, jadi filter yang
 * hanya melihat halaman pertama pasti tidak menemukannya.
 */
const h = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[] }));

function baris(i: number) {
  const perempuan = i >= 30;
  return {
    id: i + 1,
    id_kandidat: `KD${i + 1}`,
    nama_lengkap: `KANDIDAT ${i}`,
    no_wa: `6281000${i}`,
    gender: perempuan ? 'P' : 'L',
    usia: perempuan ? '18' : '30',
    jft: perempuan ? 'https://cdn/A2.pdf' : 'https://cdn/B1.pdf',
    status_kandidat: 'BARU',
    id_loker_pilihan: 'TG658',
    tahapan_seleksi: 'LIST',
    // Urutan daftar memakai kolom timestamp ini (`tsOf` + `urutkan`), dan
    // `updated_at` yang makin besar dianggap makin baru.
    updated_at: `2026-01-01T00:${String(i).padStart(2, '0')}:00Z`,
  };
}

// `vi.mock` diangkat (hoisted), jadi hanya jalur baca yang diganti — sisa modul
// tetap asli. WAJIB `../netlify/...`: path literal `../../netlify/...` dari
// `e2e/` menunjuk ke luar repo dan mock-nya tidak pernah mengikat.
vi.mock('../netlify/functions/_lib/db/candidates', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    findAllCandidatesLight: vi.fn(async () => h.rows),
    findCandidatesByIds: vi.fn(async (ids: unknown[]) => {
      const mau = new Set((Array.isArray(ids) ? ids : []).map((x) => String(x)));
      return h.rows.filter((r) => mau.has(String(r.id)));
    }),
    findCandidates: vi.fn(async () => ({ rows: [] })),
  };
});

beforeEach(() => {
  h.rows = Array.from({ length: 45 }, (_, i) => baris(i));
});

describe('loadCandidatesUnik — kriteria disaring atas seluruh baris', () => {
  it('mock benar-benar mengikat (bukan tes yang lulus karena tidak mengukur apa pun)', async () => {
    const mod = await import('../netlify/functions/_lib/db/candidates');
    expect(vi.isMockFunction(mod.findAllCandidatesLight)).toBe(true);
    expect(vi.isMockFunction(mod.findCandidatesByIds)).toBe(true);
  });

  it('tanpa kriteria: total = seluruh baris (kontrol positif)', async () => {
    const { total, rows } = await loadCandidatesUnik({}, { page: 1, pageSize: 20 });
    expect(total).toBe(45);
    expect(rows).toHaveLength(20);
  });

  it('gender=all/age=all/jft=all sama dengan tanpa kriteria', async () => {
    const { total } = await loadCandidatesUnik(
      { gender: 'all', age: 'all', jft: 'all' },
      { page: 1, pageSize: 20 },
    );
    expect(total).toBe(45);
  });

  it('gender=p menghitung seluruh 15 baris perempuan, dan mengembalikannya', async () => {
    const { total, rows } = await loadCandidatesUnik({ gender: 'p' }, { page: 1, pageSize: 20 });
    // Kode lama: kriteria diabaikan ⇒ 45.
    expect(total).toBe(15);
    expect(rows).toHaveLength(15);
    // Bukti "bukan satu halaman": baris yang cocok ada di urutan ke-31 dst.
    for (const r of rows) expect(String(r.gender)).toBe('P');
  });

  it('age=under20 menghitung seluruh 15 baris umur 18', async () => {
    const { total, rows } = await loadCandidatesUnik({ age: 'under20' }, { page: 1, pageSize: 20 });
    expect(total).toBe(15);
    for (const r of rows) expect(Number(r.usia)).toBeLessThan(20);
  });

  it('age=over25 menghitung seluruh 30 baris umur 30', async () => {
    const { total } = await loadCandidatesUnik({ age: 'over25' }, { page: 1, pageSize: 20 });
    expect(total).toBe(30);
  });

  it('jft=a2 menghitung seluruh 15 baris bersertifikat A2', async () => {
    const { total, rows } = await loadCandidatesUnik({ jft: 'a2' }, { page: 1, pageSize: 20 });
    expect(total).toBe(15);
    for (const r of rows) expect(String(r.jft).toLowerCase()).toContain('a2');
  });

  it('kriteria gabungan: perempuan + A2 tetap 15, dan totalnya konsisten dengan halaman', async () => {
    const { total, rows } = await loadCandidatesUnik(
      { gender: 'p', age: 'under20', jft: 'a2' },
      { page: 1, pageSize: 20 },
    );
    expect(total).toBe(15);
    expect(rows).toHaveLength(15);
  });

  it('q mencari di SELURUH baris: "KANDIDAT 44" ada di urutan terakhir', async () => {
    const { total, rows } = await loadCandidatesUnik({ q: 'KANDIDAT 44' }, { page: 1, pageSize: 20 });
    expect(total).toBe(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].nama_lengkap).toBe('KANDIDAT 44');
  });

  it('kriteria tak dikenal mengembalikan nol baris, bukan seluruh baris', async () => {
    // Perilaku lama di klien: ember usia yang tidak dikenal = tidak cocok dengan
    // siapa pun. Menjaga paritas itu penting supaya "belum memilih" (`all`)
    // tidak pernah tertukar dengan "nilai kosong/salah".
    const { total } = await loadCandidatesUnik({ age: 'entah' }, { page: 1, pageSize: 20 });
    expect(total).toBe(0);
  });
});
