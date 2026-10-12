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
import { cacheClear } from '../netlify/functions/_lib/cache';

/**
 * 45 baris: 30 laki-laki umur 30 dengan JFT B1/N3, lalu 15 perempuan umur 18
 * dengan JFT A2/N4. Yang perempuan/umur-18/A2 ada di BELAKANGAN, jadi filter yang
 * hanya melihat halaman pertama pasti tidak menemukannya.
 *
 * ⚠ FIXTURE INI DULU IKUT SALAH (diperbaiki 2026-10-12). Versi pertamanya menulis
 * `gender: 'P'` dan `jft: 'https://cdn/A2.pdf'`, yaitu BENTUK YANG SAMA dengan
 * asumsi implementasinya — jadi ia hijau sementara filter sebenarnya
 * mengembalikan nol baris untuk data nyata. Diukur atas DB live:
 *
 *   gender  → `PEREMPUAN` 79 baris, `LAKI-LAKI` 82, `-`/kosong/null 65;
 *             NOL baris bernilai `P`/`L`.
 *   jft     → kolom itu menyimpan URL DOKUMEN (85 baris); teks sertifikat ada di
 *             `nilai_jft_text` (4 baris terisi).
 *
 * Fixture harus menyerupai DB, bukan menyerupai bug.
 */
const h = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[] }));

function baris(i: number) {
  const perempuan = i >= 30;
  return {
    id: i + 1,
    id_kandidat: `KD${i + 1}`,
    nama_lengkap: `KANDIDAT ${i}`,
    no_wa: `6281000${i}`,
    gender: perempuan ? 'PEREMPUAN' : 'LAKI-LAKI',
    usia: perempuan ? '18' : '30',
    // Bentuk nyata: `jft` = URL dokumen (TANPA token sertifikat di dalamnya),
    // `nilai_jft_text` = teks sertifikat.
    jft: `https://cdn/berkas/KANDIDAT_${i + 1}_JFT.pdf`,
    nilai_jft_text: perempuan ? 'A2 / N4' : 'B1 / N3',
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
  // `loadCandidatesUnik()` memoisasi hasil per kriteria selama 25 detik
  // (`CAND_CACHE_TTL_MS`). Tanpa membersihkannya, tes yang mengganti fixture di
  // tengah berkas akan membaca baris yang di-cache oleh tes SEBELUMNYA dan
  // gagal dengan angka milik tes lain — terukur: "expected 15 to be 1".
  cacheClear();
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
    // Kode lama: kriteria diabaikan ⇒ 45. Versi 2026-10-12 pagi: 0, karena
    // 'p' dibandingkan huruf-per-huruf dengan 'PEREMPUAN'.
    expect(total).toBe(15);
    expect(rows).toHaveLength(15);
    // Bukti "bukan satu halaman": baris yang cocok ada di urutan ke-31 dst.
    for (const r of rows) expect(String(r.gender)).toBe('PEREMPUAN');
  });

  it('gender=l menghitung seluruh 30 baris laki-laki', async () => {
    const { total, rows } = await loadCandidatesUnik({ gender: 'l' }, { page: 1, pageSize: 20 });
    expect(total).toBe(30);
    for (const r of rows) expect(String(r.gender)).toBe('LAKI-LAKI');
  });

  it('gender tanpa nilai yang bisa dipakai tidak ikut ke mana pun', async () => {
    // Diukur di DB live: 65 dari 226 baris ber-`gender` `-`, kosong, atau null.
    // Baris itu tidak boleh muncul di filter "l" MAUPUN "p".
    h.rows = [
      { ...baris(0), id: 1, gender: '-' },
      { ...baris(1), id: 2, gender: '' },
      { ...baris(2), id: 3, gender: null },
      { ...baris(3), id: 4, gender: 'PEREMPUAN' },
    ];
    const p = await loadCandidatesUnik({ gender: 'p' }, { page: 1, pageSize: 20 });
    const l = await loadCandidatesUnik({ gender: 'l' }, { page: 1, pageSize: 20 });
    expect(p.total).toBe(1);
    expect(l.total).toBe(0);
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

  it('jft=a2 menghitung seluruh 15 baris bersertifikat A2/N4', async () => {
    const { total, rows } = await loadCandidatesUnik({ jft: 'a2' }, { page: 1, pageSize: 20 });
    expect(total).toBe(15);
    for (const r of rows) expect(String(r.nilai_jft_text)).toContain('A2');
  });

  it('jft=b1 menghitung seluruh 30 baris bersertifikat B1/N3', async () => {
    const { total } = await loadCandidatesUnik({ jft: 'b1' }, { page: 1, pageSize: 20 });
    expect(total).toBe(30);
  });

  it('jft dibaca dari nilai_jft_text, BUKAN dari URL dokumen di kolom `jft`', async () => {
    // 🔴 Inilah kesalahan yang membuat filter JFT selalu nol di data nyata:
    // kolom `jft` menyimpan URL (85 baris terisi di DB live), dan mencocokkan
    // 'a2' ke URL kebetulan "berhasil" hanya pada fixture yang mengarang URL
    // berisi 'A2'. Baris di bawah meniru URL nyata: tokennya tidak ada di sana.
    h.rows = [
      { ...baris(0), id: 1, jft: 'https://cdn/berkas/scan.pdf', nilai_jft_text: '' },
      { ...baris(1), id: 2, jft: 'https://cdn/berkas/lain.pdf', nilai_jft_text: 'A2 / N4' },
    ];
    const { total, rows } = await loadCandidatesUnik({ jft: 'a2' }, { page: 1, pageSize: 20 });
    expect(total).toBe(1);
    expect(rows[0].nilai_jft_text).toBe('A2 / N4');
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
