/**
 * TESTS: `bio` harus memuat kolom identitas dari master DAN dari
 * `ai_data_json` — "datanya harusnya cuma 1" (pemilik 2026-10-13).
 *
 * Terukur atas 226 kandidat (gdw, 2026-10-13): `usia` 32 · `tb` 44 · `bb` 46 ·
 * `gender` 2 berisi di master tapi KOSONG di `database_candidate`, dan **21**
 * kandidat punya `gender` HANYA di `ai_data_json`. Rirekisho/CV membaca
 * `getDrafCvMaster` (master + AI) jadi ia menampilkannya; dossier profil hanya
 * punya baris kandidat + `bio`, jadi ia menampilkan "-".
 *
 * KENAPA DI `e2e/`: tier counter beku `indexer` menghitung berkas `.ts` di bawah
 * `netlify/functions`, jadi tes `.ts` di sana menggeser angka yang HANYA boleh
 * di-baseline ulang team-lead. Tier `e2e/` hanya menghitung mjs/cjs/js (R13f-bis).
 */
import { describe, expect, it } from 'vitest';
import { buildBioFromMaster } from '../netlify/functions/_lib/db/berkas';

describe('buildBioFromMaster — identitas dari master dan ai_data_json', () => {
  it('mengisi gender/usia/tb/bb dari kolom master', () => {
    const bio = buildBioFromMaster({ gender: 'LAKI-LAKI', usia: '19', tb: '169 cm', bb: '86 kg' });
    expect(bio.gender).toBe('LAKI-LAKI');
    expect(bio.usia).toBe('19');
    expect(bio.tb).toBe('169 cm');
    expect(bio.bb).toBe('86 kg');
  });

  it('jatuh ke ai_data_json saat kolom master KOSONG (21 kandidat nyata)', () => {
    // Bentuk baris `MASTER_LIGHT_COLS`: sub-objek `ai_data_json.identitas`
    // diambil lewat JSON-path PostgREST dengan alias `ai_*`.
    const bio = buildBioFromMaster({ gender: '', usia: '', ai_gender: 'PEREMPUAN', ai_umur: '22' });
    expect(bio.gender).toBe('PEREMPUAN');
    expect(bio.usia).toBe('22');
  });

  it('master MENANG atas ai_data_json (urutan sama dengan makeV di CV)', () => {
    const bio = buildBioFromMaster({ gender: 'LAKI-LAKI', ai_gender: 'PEREMPUAN' });
    expect(bio.gender).toBe('LAKI-LAKI');
  });

  it("sentinel kosong tetap kosong, bukan '-'", () => {
    const bio = buildBioFromMaster({ gender: '-', usia: '', ai_gender: '-' });
    expect(bio.gender).toBe('');
    expect(bio.usia).toBe('');
  });
});
