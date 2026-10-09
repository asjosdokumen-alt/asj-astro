/**
 * TESTS: riwayatKeyOf — identitas baris riwayat (pendidikan/pekerjaan/keluarga).
 *
 * KENAPA DI `e2e/`
 * ---------------
 * Sama seperti `e2e/biodata-export.test.ts`: `indexer` menghitung SELURUH berkas
 * di bawah `src/**`, jadi `.test.ts` baru di sana memindahkan counter beku.
 * Berkas `.ts` di `e2e/` tidak dihitung, dan vitest tetap menjalankannya.
 *
 * BUG YANG DIKUNCI
 * ----------------
 * Kunci lama menyambung `tingkat + sekolah`. Dua sumber riwayat menulis tingkat
 * dengan ejaan berbeda — kolom master `SMA/SMK`, `ai_data_json` `SMK` — untuk
 * sekolah yang SAMA. Kunci jadi berbeda, `mergeArrRiwayat` mempertahankan
 * keduanya, dan baris kembar muncul di form AI CV, rirekisho, DAN berkas
 * unduhan biodata. Terukur pada AGUS KHOCI (ASJ00040): 11 baris untuk 4 sekolah.
 */
import { describe, it, expect } from 'vitest';
import { riwayatKeyOf, mergeArrRiwayat } from '../src/lib/helpers_cv';

describe('riwayatKeyOf — identitas baris riwayat', () => {
  it('baris yang SAMA dari dua sumber menghasilkan kunci yang sama', () => {
    // Kolom master: sekolah + tingkat panjang.
    const dariKolom = { tingkat: 'SMA/SMK', sekolah: 'SMK RADEN PATAH', jurusan_id: 'TEKNIK PERMESINAN' };
    // ai_data_json: ejaan pendek + nama sekolah di kunci lain.
    const dariAi = { tingkat: 'SMK', sekolah: '', sekolah_id: 'SMK RADEN PATAH', jurusan: 'TEKNIK PERMESINAN' };
    expect(riwayatKeyOf('pendidikan', dariKolom)).toBe(riwayatKeyOf('pendidikan', dariAi));
  });

  it('beda sekolah tetap beda baris', () => {
    const a = { tingkat: 'SMP', sekolah: 'SMPN 4 MOJOKERTO' };
    const b = { tingkat: 'SMP', sekolah: 'SMPN 1 PONOROGO' };
    expect(riwayatKeyOf('pendidikan', a)).not.toBe(riwayatKeyOf('pendidikan', b));
  });

  it('tanpa nama sekolah, tingkat yang jadi identitas', () => {
    expect(riwayatKeyOf('pendidikan', { tingkat: 'SD' })).toBe(riwayatKeyOf('pendidikan', { tingkat: 'sd' }));
  });

  it('dua masa kerja di perusahaan yang sama tetap DUA baris (periode masuk kunci)', () => {
    const a = { perusahaan: 'PT X', jabatan: 'OPERATOR', masuk: '2015', keluar: '2017' };
    const b = { perusahaan: 'PT X', jabatan: 'OPERATOR', masuk: '2019', keluar: '2021' };
    expect(riwayatKeyOf('pekerjaan', a)).not.toBe(riwayatKeyOf('pekerjaan', b));
  });

  it('pekerjaan: ejaan perusahaan/nama_perusahaan tidak memecah baris', () => {
    expect(riwayatKeyOf('pekerjaan', { perusahaan: 'PT X' })).toBe(
      riwayatKeyOf('pekerjaan', { nama_perusahaan: 'PT X' }),
    );
  });

  it('keluarga: nama yang jadi identitas', () => {
    expect(riwayatKeyOf('keluarga', { nama: 'Suparno', hubungan: 'AYAH' })).toBe(
      riwayatKeyOf('keluarga', { nama: 'suparno', hubungan_id: 'AYAH' }),
    );
  });
});

describe('mergeArrRiwayat + riwayatKeyOf — kasus AGUS KHOCI', () => {
  it('11 baris (5 kolom + 10 ai, saling tumpang tindih) menyusut jadi 7', () => {
    const kolom = [
      { tingkat: 'SD', sekolah: '' },
      { tingkat: 'SMP', sekolah: 'SMPN 4 MOJOKERTO' },
      { tingkat: 'SMA/SMK', sekolah: 'SMK RADEN PATAH' },
      { tingkat: 'LPK BAHASA', sekolah: '' },
      { tingkat: 'SMK', sekolah: '' },
    ];
    const ai = [
      { tingkat: 'SMK', sekolah: '', sekolah_id: 'SMK RADEN PATAH' },
      { tingkat: 'SMP', sekolah: 'SMPN 4 MOJOKERTO', sekolah_id: 'SMPN 4 MOJOKERTO' },
      { tingkat: 'SD', sekolah: 'SMK RADEN PATAH' },
      { tingkat: 'LPK BAHASA', sekolah: '' },
      { tingkat: 'SMK', sekolah: '', sekolah_id: 'SMK RADEN PATAH' },
      { tingkat: 'LPK', sekolah: 'SMK RADEN PATAH', sekolah_id: 'LPK BAHASA' },
      { tingkat: 'SMA', sekolah: 'SMK RADEN PATAH', sekolah_id: 'SMAN 1' },
      { tingkat: 'SD', sekolah: '', sekolah_id: 'SMAN 1' },
      { tingkat: 'SD', sekolah: '', sekolah_id: 'SDN BALONGSARI II' },
      { tingkat: 'SD', sekolah: '', sekolah_id: 'SDN BALONGSARI II' },
    ];
    const merged = mergeArrRiwayat(kolom, ai, (e) => riwayatKeyOf('pendidikan', e));
    // 11 pada perilaku lama; 7 sekarang — sisa 2 baris adalah nilai nyata yang
    // hanya ada di ai_data_json (SMAN 1 / SDN BALONGSARI II), bukan duplikat.
    expect(merged).toHaveLength(7);
  });
});
