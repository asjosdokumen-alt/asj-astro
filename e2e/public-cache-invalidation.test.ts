/**
 * public-cache-invalidation.test.ts — `cacheClear()` tidak boleh jalan pada
 * permintaan yang DITOLAK.
 *
 * KENAPA
 *   Empat handler menulis (apply, daftar siswa, simpan berkas, simpan master)
 *   memanggil `cacheClear()` sebagai pernyataan PERTAMA — sebelum cek sesi,
 *   sebelum validasi payload, sebelum guard kepemilikan. `cacheClear()` itu
 *   global: ia membuang `public-base` (job board + dropdown + pengumuman) dan
 *   seluruh halaman kandidat yang sedang di-cache.
 *
 *   `submitApply` dan `submitDaftarSiswa` PUBLIK by design. Jadi satu POST `{}`
 *   ke endpoint itu ditolak dengan pesan "data tidak lengkap" — dan tetap
 *   mengosongkan cache. Diulang dalam loop, cache tidak pernah hangat dan setiap
 *   pengunjung membayar pembacaan PostgREST penuh yang justru ingin dihindari
 *   cache itu.
 *
 *   Yang dikunci di sini bukan "cache masih ada isinya setelah sukses", melainkan
 *   sisi sebaliknya: penolakan TIDAK menyentuh cache sama sekali.
 *
 * KENAPA DI e2e/
 *   Handler-level, tanpa DOM. `.ts` di tier e2e tidak dihitung counter beku
 *   `indexer` (R13f-bis), dan tanpa baris `exclude` di vitest.config.ts ia jalan
 *   DUA KALI.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { cacheClear, cacheGet, cacheSet } from '../netlify/functions/_lib/cache';
import { handleSubmitMasterForm } from '../netlify/functions/contexts/master-data/service';
import { handleSubmitApply } from '../netlify/functions/contexts/documents/service';
import { handleSubmitDaftarSiswa } from '../netlify/functions/contexts/registration/service';

const SENTINEL = { jobs: [{ code: 'TG1', pekerjaan: 'SENTINEL' }] };

function seed(): void {
  cacheClear();
  cacheSet('public-base', SENTINEL, 60_000);
}

function stillCached(): unknown {
  return cacheGet('public-base');
}

describe('permintaan yang ditolak tidak mengosongkan cache publik', () => {
  beforeEach(seed);

  it('submitMasterForm tanpa sesi → ditolak, cache UTUH', async () => {
    const out = (await handleSubmitMasterForm([{}], undefined)) as { success?: boolean };
    expect(out.success).toBe(false);
    expect(stillCached()).toEqual(SENTINEL);
  });

  it('submitApply dengan payload kosong → ditolak, cache UTUH', async () => {
    const out = (await handleSubmitApply([{}], undefined)) as { success?: boolean };
    expect(out.success).toBe(false);
    expect(stillCached()).toEqual(SENTINEL);
  });

  it('submitDaftarSiswa tanpa nama → ditolak, cache UTUH', async () => {
    const out = (await handleSubmitDaftarSiswa({})) as { success?: boolean };
    expect(out.success).toBe(false);
    expect(stillCached()).toEqual(SENTINEL);
  });

  it('KONTROL: seed benar-benar terpasang (tes tidak lulus secara hampa)', () => {
    expect(stillCached()).toEqual(SENTINEL);
  });
});
