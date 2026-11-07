/**
 * tes.test.ts — aturan backend dua tes mandiri.
 *
 * YANG DIJAGA
 *   Berkas ini tidak menyentuh DB. Yang diuji adalah aturan yang, kalau salah,
 *   tidak memunculkan satu pun error di layar:
 *
 *   1. Daftar jenis tes di sini HARUS sama dengan CHECK constraint migrasi.
 *      Kalau berbeda, `simpanHasil` meloloskan nilai yang ditolak DB dan siswa
 *      menerima "coba lagi" yang tidak akan pernah berhasil.
 *   2. GAGAL-TERTUTUP: saat `sys_config` tidak terbaca (DB mati / env kosong),
 *      sakelar harus dibaca NONAKTIF. Kebalikannya membuka tes yang pemiliknya
 *      sedang tutup — dan tes ini hanya boleh dikerjakan sekali, jadi kesalahan
 *      itu tidak bisa dibatalkan.
 *   3. Penolakan di depan (WA kosong, jenis asing) terjadi SEBELUM menyentuh DB.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { TES_SAH, bacaSakelar, jenisTesSah, setAktif, simpanHasil, tipeSakelar } from './tes';

/* `supabaseJson` di-stub supaya satu kasus bisa memeriksa QUERY yang dikirim,
   bukan hanya hasilnya. Tanpa ini, bug "sakelar iq menyala tetapi terbaca
   mati" tidak bisa dibuktikan dari tes: nilainya tetap `false` baik karena
   query-nya kurang satu tipe maupun karena DB-nya memang kosong. */
vi.mock('../db/client', async (importOriginal) => {
  const asli = await importOriginal<typeof import('../db/client')>();
  return { ...asli, supabaseJson: vi.fn() };
});

describe('jenis tes', () => {
  it('tepat tiga jenis yang dipakai aplikasi', () => {
    expect([...TES_SAH]).toEqual(['mbti', 'mata', 'iq']);
    for (const j of TES_SAH) expect(jenisTesSah(j)).toBe(true);
  });

  it('menolak nilai asing dan non-string', () => {
    for (const v of ['', 'MBTI', 'eye', 'kepribadian', null, undefined, 0, {}]) {
      expect(jenisTesSah(v)).toBe(false);
    }
  });
});

describe('CHECK constraint di migrasi cocok dengan TES_SAH', () => {
  /* Migrasi TERAKHIR yang mendefinisikan constraint ini yang dibaca, bukan 048.
     Nomor berkasnya bergeser setiap kali daftar jenis bertambah (051 menambah
     'iq'), dan tes yang menunjuk satu nomor akan merah bukan karena aturannya
     berubah — persis kegagalan yang pernah terjadi pada `claim_next_job`. */
  const dir = new URL('../../../../migrations/', import.meta.url);
  const berkasMigrasi = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => ({ nama: f, isi: readFileSync(new URL(f, dir), 'utf8') }))
    .filter((f) => /candidate_assessments_jenis_sah/i.test(f.isi));
  const terakhir = berkasMigrasi[berkasMigrasi.length - 1];
  const berkas = terakhir?.isi || '';
  const cocok = /CHECK\s*\(\s*jenis\s+IN\s*\(([^)]*)\)\s*\)/i.exec(berkas);

  it('migrasi memuat daftar jenis yang bisa dibaca', () => {
    expect(cocok, `pola CHECK (jenis IN (...)) tidak ditemukan di ${terakhir?.nama || 'migrasi mana pun'}`).toBeTruthy();
  });

  it('daftar di migrasi SAMA dengan TES_SAH', () => {
    const dariMigrasi = (cocok?.[1] || '')
      .split(',')
      .map((x) => x.trim().replace(/^'|'$/g, ''))
      .filter(Boolean)
      .sort();
    expect(dariMigrasi).toEqual([...TES_SAH].sort());
  });

  it('ada constraint unik (no_wa, jenis) — aturan "sekali per siswa"', () => {
    expect(/UNIQUE\s*\(\s*no_wa\s*,\s*jenis\s*\)/i.test(berkas)).toBe(true);
  });
});

describe('gagal-tertutup', () => {
  /* Tanpa env DB di test, `supabaseJson` melempar dan `bacaSakelar` menangkapnya.
     Itu justru jalur yang diuji: gangguan DB tidak boleh membuka tes. */
  it('sakelar dibaca nonaktif saat DB tidak terbaca', async () => {
    const s = await bacaSakelar();
    expect(s).toEqual({ mbti: false, mata: false, iq: false });
  });

  /* ── Regresi 2026-11-07 ───────────────────────────────────────────────────
   * Pemilik menyalakan sakelar Asesmen Penalaran, panel menampilkan toggle
   * menyala, tetapi halaman menjawab "belum dibuka". Sebabnya: query
   * `config_type=in.(tes_mbti,tes_mata)` ditulis harfiah, jadi baris `tes_iq`
   * tidak pernah diambil — dan `bacaSakelar` selalu menjawab `iq:false`.
   * Dua kasus di bawah mengunci dua sisi bug itu: daftar tipenya lengkap, DAN
   * baris 'on' untuk jenis mana pun benar-benar menyalakan jenis itu. */
  it('setiap jenis tes punya baris sakelar yang dibaca', () => {
    const tipe = tipeSakelar();
    expect(tipe).toHaveLength(TES_SAH.length);
    expect([...tipe].sort()).toEqual(['tes_iq', 'tes_mata', 'tes_mbti']);
  });

  it('sakelar iq yang menyala di DB terbaca menyala (bukan selalu mati)', async () => {
    const { supabaseJson } = await import('../db/client');
    vi.mocked(supabaseJson).mockResolvedValueOnce([
      { config_type: 'tes_iq', config_value: 'on', is_active: true },
    ]);
    const s = await bacaSakelar();
    expect(s.iq).toBe(true);

    /* Dan query-nya memang meminta tes_iq — bukan hanya hasilnya kebetulan. */
    const query = vi.mocked(supabaseJson).mock.calls.at(-1)?.[2]?.query;
    expect(String(query?.config_type)).toContain('tes_iq');
  });

  it('simpanHasil menolak dengan `nonaktif` saat sakelar tidak terbaca', async () => {
    const r = await simpanHasil({
      wa: '6281234567890',
      jenis: 'mbti',
      hasil: { tipe: 'INTJ', persentase: { E: 10, I: 90, S: 20, N: 80, T: 70, F: 30, J: 60, P: 40 }, jumlahTerjawab: 40 },
    });
    expect(r.success).toBe(false);
    expect(r.nonaktif).toBe(true);
  });
});

describe('penolakan sebelum DB', () => {
  it('WA kosong ditolak', async () => {
    const r = await simpanHasil({ wa: '  ', jenis: 'mbti', hasil: {} });
    expect(r).toEqual({ success: false, message: 'Nomor WA kosong.' });
  });

  it('jenis asing ditolak', async () => {
    const r = await simpanHasil({ wa: '6281234567890', jenis: 'kepribadian', hasil: {} });
    expect(r.success).toBe(false);
    expect(String(r.message)).toContain('Jenis tes');
  });

  it('setAktif menolak jenis asing tanpa menyentuh DB', async () => {
    const r = await setAktif('kepribadian', true);
    expect(r.success).toBe(false);
    expect(String(r.message)).toContain('Jenis tes');
  });
});

describe('mode uji admin', () => {
  /* Pemilik 2026-11-07, setelah mencoba lewat panel: *"gini doang hasilnya,
     gak ada nilai iq-nya berapa"*. Di mode uji tidak ada baris yang ditulis,
     jadi angka penuh harus ikut di RESPONS — kalau tidak, satu-satunya orang
     yang boleh melihatnya tidak pernah melihatnya sama sekali. */
  it('mengembalikan angka penuh untuk admin, dan tetap memotong bentuk siswa', async () => {
    const { nilaiIqTanpaSimpan } = await import('./tes');
    const { pilihSoalIq } = await import('./iq-bank');
    const wa = '6281234567890';
    const jawaban: Record<string, number> = {};
    for (const s of pilihSoalIq(wa)) jawaban[s.id] = s.kunci;

    const r = nilaiIqTanpaSimpan(wa, jawaban, 600) as {
      uji?: boolean;
      admin?: { benar: number; maks: number; skala: number; rincian: Record<string, unknown> };
      tampilan?: Record<string, unknown>;
    };

    expect(r.uji).toBe(true);
    expect(r.admin?.benar).toBe(40);
    expect(r.admin?.maks).toBe(40);
    expect(r.admin?.skala).toBe(130);
    expect(r.admin?.rincian).toBeTruthy();
    // Bentuk siswa tetap tanpa angka — dua tampilan dalam satu respons.
    expect(r.tampilan).not.toHaveProperty('skala');
    expect(r.tampilan).not.toHaveProperty('benar');
  });
});
