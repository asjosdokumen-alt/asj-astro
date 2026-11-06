import { describe, expect, it } from 'vitest';
import {
  TAHAPAN_STEPS,
  opsiDenganNilaiSaatIni,
  tahapanLabel,
  tahapanLabelDari,
  tahapanProgress,
  tahapanStepIndex,
} from './tahapanPipeline';

/**
 * Yang diuji di sini bukan "apakah fungsinya jalan", tapi dua hal yang pernah
 * rusak di produksi:
 *
 *   1. dua tahap yang ADA di dropdown admin (`MENSETSU`, `TTD KONTRAK`) tidak
 *      dikenali, sehingga kandidat di tahap itu melihat "PENDAFTARAN";
 *   2. daftar urutan di dasbor berbeda dari daftar resmi `sys_config`, jadi
 *      tidak ada satu pun acuan yang bisa dipakai bersama.
 */
describe('tahapanPipeline — urutan kanonik', () => {
  it('sama dengan isi sys_config.list_tahapan, urut sesuai pipeline', () => {
    // Nilai ini dibaca langsung dari DB (2026-11-06). Kalau daftar resmi
    // berubah, tes ini merah — bukan diam-diam berbeda lagi.
    expect([...TAHAPAN_STEPS]).toEqual([
      'LIST',
      'CHECK KAIWA',
      'MENDAN',
      'MENSETSU',
      'LOLOS USER',
      'MCU PARPOR',
      'PROSES COE',
      'TTD KONTRAK',
      'VISA',
      'FLIGHT',
    ]);
  });

  it('setiap tahap dikenali pada indeksnya sendiri', () => {
    TAHAPAN_STEPS.forEach((step, i) => {
      expect(tahapanStepIndex(step), step).toBe(i);
    });
  });

  /* REGRESI UTAMA: dulu keduanya tidak ada di daftar dan jatuh ke 0. */
  it('MENSETSU dan TTD KONTRAK tidak lagi jatuh ke awal pipeline', () => {
    expect(tahapanStepIndex('MENSETSU')).toBe(3);
    expect(tahapanStepIndex('TTD KONTRAK')).toBe(7);
    expect(tahapanLabelDari('MENSETSU')).toBe('MENSETSU');
    expect(tahapanLabelDari('TTD KONTRAK')).toBe('TTD KONTRAK');
  });

  it('tidak peka huruf besar/kecil dan spasi berlebih', () => {
    expect(tahapanStepIndex('  mcu   parpor ')).toBe(5);
    expect(tahapanStepIndex('proses coe')).toBe(6);
    expect(tahapanStepIndex('visa')).toBe(8);
  });
});

describe('tahapanPipeline — nilai warisan', () => {
  it('Pendaftaran dan Baru berada di awal, bukan dianggap tak dikenal', () => {
    expect(tahapanStepIndex('Pendaftaran')).toBe(0);
    expect(tahapanStepIndex('Baru')).toBe(0);
    expect(tahapanStepIndex('Seleksi Berkas')).toBe(0);
  });

  it('tahap kosong = awal pipeline', () => {
    // Baris `database_candidate` hanya lahir saat pendaftaran, jadi tahap
    // paling awal adalah satu-satunya nilai yang mungkin.
    expect(tahapanStepIndex('')).toBe(0);
    expect(tahapanStepIndex(null)).toBe(0);
    expect(tahapanStepIndex(undefined)).toBe(0);
  });

  it('singkatan lama dipetakan ke tahap kanoniknya', () => {
    expect(tahapanStepIndex('MCU')).toBe(5);
    expect(tahapanStepIndex('COE')).toBe(6);
    expect(tahapanStepIndex('Wawancara')).toBe(3);
    expect(tahapanStepIndex('Pemberkasan')).toBe(5);
  });

  it('cocok sebagian memilih tahap TERPANJANG', () => {
    expect(tahapanStepIndex('PROSES MCU PARPOR')).toBe(5);
    expect(tahapanStepIndex('SELESAI TTD KONTRAK')).toBe(7);
  });

  it('nilai tak dikenal menghasilkan -1, bukan 0', () => {
    expect(tahapanStepIndex('LULUS')).toBe(-1);
    expect(tahapanStepIndex('entah apa')).toBe(-1);
    // Labelnya nilai mentah — UI tidak mengklaim tahap yang belum tentu benar.
    expect(tahapanLabelDari('LULUS')).toBe('LULUS');
  });
});

describe('tahapanPipeline — label & kemajuan', () => {
  it('LIST dibaca kandidat sebagai PENDAFTARAN', () => {
    expect(tahapanLabel('LIST')).toBe('PENDAFTARAN');
    expect(tahapanLabelDari('LIST')).toBe('PENDAFTARAN');
    expect(tahapanLabel('VISA')).toBe('VISA');
  });

  it('kemajuan naik sepanjang pipeline dan berakhir 100', () => {
    const angka = TAHAPAN_STEPS.map((s) => tahapanProgress(s));
    for (let i = 1; i < angka.length; i++) {
      expect(angka[i], TAHAPAN_STEPS[i]).toBeGreaterThan(angka[i - 1]);
    }
    expect(angka[0]).toBe(10);
    expect(angka[angka.length - 1]).toBe(100);
  });

  it('tahap tak dikenal tidak diberi kemajuan palsu', () => {
    expect(tahapanProgress('LULUS')).toBe(0);
    expect(tahapanProgress('')).toBe(10);
  });
});

describe('opsiDenganNilaiSaatIni', () => {
  const STATUS = ['', 'Aktif', 'LULUS', 'GAGAL', 'Non-Aktif'] as const;

  it('menambahkan nilai yang tidak ada di daftar', () => {
    // Tanpa ini, membuka modal edit untuk baris `Gagal` menampilkan "- Pilih -"
    // dan menyimpannya MENGHAPUS status kandidat.
    expect(opsiDenganNilaiSaatIni(STATUS, 'Gagal')).toEqual([...STATUS, 'Gagal']);
    expect(opsiDenganNilaiSaatIni(STATUS, 'Pending')).toEqual([...STATUS, 'Pending']);
  });

  it('tidak menggandakan nilai yang sudah ada', () => {
    expect(opsiDenganNilaiSaatIni(STATUS, 'GAGAL')).toEqual([...STATUS]);
    expect(opsiDenganNilaiSaatIni(STATUS, '')).toEqual([...STATUS]);
  });

  it('daftar asli tidak ikut berubah', () => {
    const asli = [...STATUS];
    opsiDenganNilaiSaatIni(STATUS, 'Gagal');
    expect([...STATUS]).toEqual(asli);
  });
});
