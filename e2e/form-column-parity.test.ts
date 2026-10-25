/**
 * e2e/form-column-parity.test.ts — GATE paritas KOLOM antara Form Master dan CV AI.
 *
 * MASALAH YANG DIKUNCI
 *   Keluhan pemilik 2026-10-25: *"samakan cv ai dan form master"*. Yang terjadi
 *   berulang bukan satu bug, melainkan satu POLA: sebuah field ditambahkan ke
 *   salah satu form saja, dan tidak ada tes yang merah. Contoh nyata yang
 *   ditemukan hari itu: `tindik`, `no_coe`, tgl/exp/kota paspor, dan `lisensi2`
 *   hanya ada di Form Master; sebaliknya `kontak_darurat_nama`/`_hubungan` hanya
 *   ditanyakan CV AI. Semuanya lolos karena tidak ada yang membandingkan dua
 *   daftar.
 *
 *   `e2e/ai-cv-column-coverage.test.ts` menjaga arah SATU: setiap field CV AI
 *   punya tujuan kolom. Tes ini menjaga arah LAIN: kolom yang bisa ditulis Form
 *   Master harus bisa ditulis CV AI juga — kecuali yang alasannya dicatat di
 *   bawah. Dua tes, dua arah.
 *
 * KENAPA MEMBANDINGKAN PETA, BUKAN MEMANGGIL BUILDER
 *   Memanggil `buildMasterBody` dengan payload sintetis (percobaan 2026-10-25)
 *   menghasilkan selisih PALSU: payload itu harus menebak nama field tiap form,
 *   dan yang lupa ditebak muncul sebagai "tidak didukung". Peta kolom adalah
 *   deklarasi penulisnya sendiri, jadi tidak ada tebakan.
 *
 *   `JP_TRANSLATE_MAP` ikut di kedua sisi dengan sengaja: `alamat_jp` dan
 *   `tempat_lahir_jp` diisi lewat penerjemahan, bukan lewat peta field — dan
 *   sejak 2026-10-25 jalur CV AI memakai helper yang sama.
 */
import { describe, it, expect } from 'vitest';
import { MASTER_COLUMN_MAP, JP_TRANSLATE_MAP, AI_TO_MASTER_COLUMNS } from '../netlify/functions/contexts/master-data';
import { TABLE_COLUMNS } from '../netlify/functions/_lib/db/schema.generated';

const MASTER = 'master_database_candidate';

/** Kolom yang bisa dihasilkan Form Master (`buildMasterBody` + auto-translate). */
function masterColumns(): Set<string> {
  return new Set([...Object.values(MASTER_COLUMN_MAP), ...Object.values(JP_TRANSLATE_MAP)]);
}

/** Kolom yang bisa dihasilkan CV AI (`masterColumnsFromAi` + auto-translate). */
function aiColumns(): Set<string> {
  const out = new Set<string>(Object.values(JP_TRANSLATE_MAP));
  for (const rows of Object.values(AI_TO_MASTER_COLUMNS)) {
    for (const row of rows) out.add(row[0]);
  }
  return out;
}

/**
 * Kolom yang hanya ditulis Form Master. Setiap entri WAJIB punya alasan —
 * daftar ini tempat keputusan dicatat, bukan tempat menyembunyikan kelalaian.
 */
const MASTER_ONLY: Record<string, string> = {
  ssw: 'alias legacy: payload lama mengirim `ssw` langsung. Form memakai `lisensi` → bidangssw. Dua kolom untuk satu konsep — kandidat konsolidasi, bukan field form.',
};

/**
 * Kolom yang hanya ditulis CV AI.
 */
const AI_ONLY: Record<string, string> = {
  kenalan_di_jepang_nama_jp: 'Form Master tidak punya input kanji untuk kenalan (hanya versi Indonesia + terjemahan otomatis tidak mencakup seksi ini)',
  kenalan_di_jepang_hubungan_jp: 'idem',
  kenalan_di_jepang_pekerjaan_jp: 'idem',
  kenalan_di_jepang_alamat_jp: 'idem',
};

describe('paritas kolom Form Master ↔ CV AI', () => {
  it('kontrol: kedua peta benar-benar terbaca (bukan himpunan kosong)', () => {
    expect(masterColumns().size).toBeGreaterThan(50);
    expect(aiColumns().size).toBeGreaterThan(50);
  });

  it('kolom yang hanya ditulis Form Master sama dengan daftar beralasan', () => {
    const ai = aiColumns();
    const only = [...masterColumns()].filter((c) => !ai.has(c)).sort();
    expect(only).toEqual(Object.keys(MASTER_ONLY).sort());
  });

  it('kolom yang hanya ditulis CV AI sama dengan daftar beralasan', () => {
    const master = masterColumns();
    const only = [...aiColumns()].filter((c) => !master.has(c)).sort();
    expect(only).toEqual(Object.keys(AI_ONLY).sort());
  });

  it('setiap kolom di kedua peta ADA di kontrak (salah ejaan = 400 PGRST204)', () => {
    const contract = new Set(TABLE_COLUMNS[MASTER] || []);
    const outside = [...new Set([...masterColumns(), ...aiColumns()])].filter((c) => !contract.has(c)).sort();
    expect(outside).toEqual([]);
  });

  it('daftar pengecualian tidak basi: tidak boleh menyebut kolom yang sudah paritas', () => {
    const master = masterColumns();
    const ai = aiColumns();
    const stale = [
      ...Object.keys(MASTER_ONLY).filter((c) => ai.has(c)),
      ...Object.keys(AI_ONLY).filter((c) => master.has(c)),
    ];
    // Kalau sebuah kolom akhirnya ditulis kedua jalur, entri pengecualiannya
    // harus DIHAPUS — kalau tidak, daftar ini pelan-pelan menjadi kebohongan.
    expect(stale).toEqual([]);
  });
});
