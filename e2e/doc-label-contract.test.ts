/**
 * TESTS: kontrak label dokumen — klien admin ↔ kolom penyimpanan backend.
 *
 * KENAPA DI `e2e/`: `indexer` menghitung SELURUH berkas di bawah `src/**`, jadi
 * `.test.ts` baru di sana memindahkan counter beku.
 *
 * BUG YANG DIKUNCI
 * ----------------
 * `handleSimpanBerkasTahapan` memetakan `jenisBerkas` lewat `fileLabelKey` →
 * `FILE_LABEL_COLUMNS`. Label yang tidak ada di tabel itu membuat SELURUH
 * penulisan dilewati — dan fungsinya tetap `return { success: true }`.
 *
 * Diukur pada `InputManualModal.EXTRA_DOC_TYPES` sebelum perbaikan: 7 dari 24
 * pilihan TIDAK punya kolom, termasuk `PAS PHOTO` (pilihan PERTAMA/default;
 * tabelnya memakai `PAS_PHOTO`). Admin mengunggah pas foto, melihat
 * "berhasil", dan berkasnya tidak tercatat di mana pun.
 *
 * Tes ini menjaga agar daftar pilihan klien dan tabel backend tidak pernah
 * berbeda lagi.
 */
import { describe, it, expect } from 'vitest';
import { FILE_LABEL_COLUMNS, fileLabelKey } from '../netlify/functions/contexts/documents/service';
import { EXTRA_DOC_TYPES } from '../src/components/admin/InputManualModal';

describe('fileLabelKey — normalisasi spasi/garis bawah', () => {
  it('"PAS PHOTO" menemukan kolom "PAS_PHOTO"', () => {
    expect(fileLabelKey('PAS PHOTO')).toBe('PAS_PHOTO');
    expect(FILE_LABEL_COLUMNS.PAS_PHOTO).toBeTruthy();
  });

  it('label yang MEMANG memuat spasi tetap ketemu lewat jalur aslinya', () => {
    // Normalisasi tidak boleh memutus label yang sudah bekerja: "KARTU
    // KELUARGA" → "KARTU_KELUARGA" TIDAK ada di tabel.
    expect(fileLabelKey('KARTU KELUARGA')).toBe('KARTU KELUARGA');
    expect(fileLabelKey('SURAT IJIN ORTU')).toBe('SURAT IJIN ORTU');
    expect(fileLabelKey('HASIL PSIKOTES')).toBe('HASIL PSIKOTES');
  });

  it('tidak membedakan besar/kecil huruf dan spasi di tepi', () => {
    expect(fileLabelKey('  pas photo ')).toBe('PAS_PHOTO');
    expect(fileLabelKey('jft')).toBe('JFT');
  });

  it('label yang benar-benar tidak dikenal tetap null (tidak menebak)', () => {
    expect(fileLabelKey('DOKUMEN ANTARIKSA')).toBeNull();
    expect(fileLabelKey('')).toBeNull();
  });
});

describe('setiap pilihan di form input manual punya kolom penyimpanan', () => {
  it('EXTRA_DOC_TYPES seluruhnya terpetakan', () => {
    const tidakTerpetakan = EXTRA_DOC_TYPES
      .map((d) => d.value)
      .filter((v) => fileLabelKey(v) === null);
    expect(tidakTerpetakan, `jenis tanpa kolom: ${tidakTerpetakan.join(', ')}`).toEqual([]);
  });

  it('setiap label terpetakan menunjuk minimal satu kolom', () => {
    for (const d of EXTRA_DOC_TYPES) {
      const key = fileLabelKey(d.value);
      expect(key, d.value).not.toBeNull();
      const map = FILE_LABEL_COLUMNS[key as string];
      const adaKolom = Boolean(map.cand || map.master || map.pemberkasan);
      expect(adaKolom, `${d.value} → ${key} tidak punya kolom`).toBe(true);
    }
  });
});
