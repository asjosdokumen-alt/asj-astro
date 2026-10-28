/**
 * master-folder-parity.test.ts — satu aturan folder untuk PENULIS dan PEMBACA.
 *
 * KENAPA
 *   Aturan `master/<NAMA>` ditulis lima kali dengan dua regex berbeda:
 *
 *     penulis (documents ×3, master-data)   replace(/[^A-Z0-9_-]/g, '_')
 *     pembaca (catalog / share view)        replace(/\s+/g, '_')
 *
 *   Untuk nama yang memuat karakter di luar `[A-Z0-9_ -]` keduanya menyimpang:
 *   `M. RIZKY` disimpan di `master/M__RIZKY` tapi dibaca dari `master/M._RIZKY`.
 *   Pembaca lalu mendaftar folder yang tidak ada, dan seluruh dokumen di
 *   belakangnya hilang dari layar — tanpa error, karena "tidak ada berkas" dan
 *   "folder salah" menghasilkan array kosong yang sama.
 *
 *   Nama Indonesia rutin memuat titik, apostrof, atau koma (`M. FAUZI`,
 *   `SITI NUR'AINI`), jadi ini bukan input teoretis.
 *
 * KENAPA DI e2e/ (R13f-bis): tanpa DOM; `.ts` di tier e2e tidak dihitung counter
 * beku `indexer`. Tanpa baris exclude di vitest.config.ts ia jalan DUA KALI.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { masterFolder } from '../netlify/functions/_lib/db/berkas';
import { REPO_ROOT } from '../scripts/lib/load-env.mjs';

describe('masterFolder — aturan penulis menang, karena di situlah dokumennya sudah ada', () => {
  it('nama bertitik/apostrof memakai aturan PENULIS, bukan aturan pembaca yang lama', () => {
    // Yang lama (pembaca): 'master/M._RIZKY' — folder yang tidak pernah ditulis.
    expect(masterFolder('M. RIZKY')).toBe('master/M__RIZKY');
    expect(masterFolder("SITI NUR'AINI")).toBe('master/SITI_NUR_AINI');
    expect(masterFolder('BUDI, S.Pd')).toBe('master/BUDI__S_PD');
  });

  it('nama normal tidak berubah sedikit pun — ~300 MB dokumen tetap ketemu', () => {
    expect(masterFolder('BUDI SANTOSO')).toBe('master/BUDI_SANTOSO');
    expect(masterFolder('ASJ-001')).toBe('master/ASJ-001');
    expect(masterFolder('budi')).toBe('master/BUDI');
    expect(masterFolder('  BUDI  ')).toBe('master/BUDI');
  });

  it('tidak ada lagi regex sanitasi kedua di jalur baca maupun tulis', () => {
    // Gerbang anti-kambuh: satu implementasi, bukan lima. Kalau ada yang
    // menulis ulang `'master/' + nama.replace(...)` di berkas mana pun, tes ini
    // merah sebelum dua folder yang berbeda lahir lagi.
    const files = [
      'netlify/functions/contexts/catalog/service.ts',
      'netlify/functions/contexts/documents/service.ts',
      'netlify/functions/contexts/master-data/service.ts',
    ];
    for (const f of files) {
      const src = readFileSync(`${REPO_ROOT}/${f}`, 'utf8');
      expect(src, `${f} masih menyusun folder master sendiri`).not.toMatch(/["']master\/["']\s*\+/);
      expect(src, `${f} masih menyusun folder master sendiri`).not.toMatch(/master\/\$\{/);
    }
  });
});
