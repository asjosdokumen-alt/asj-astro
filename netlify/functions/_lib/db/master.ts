import { supabaseJson } from './client';
import { allColumns } from './schema.generated';
import { MASTER_LIGHT_COLS } from './projections';
// db/master.js — repo master biodata/CV (master_database_candidate).

// Kolom RINGAN master_database_candidate — hanya kolom yang benar-benar
// dibaca attachBerkasBio (BERKAS_COLUMNS *_url + BIO_COLUMNS + pencocok WA).
// MASTER_LIGHT_COLS lives in ./projections.ts and is checked against the
// generated schema by projections.test.ts.

// Tarik master_database_candidate hanya untuk WA di daftar.
// Only no_wa column exists in this table — wa/whatsapp don't exist.
async function fetchMasterByWa(waList: string[]) {
  const inList = waList.join(',');
  try {
    const rows = await supabaseJson('GET', 'master_database_candidate', {
      query: { select: allColumns('master_database_candidate'), limit: '500', no_wa: 'in.(' + inList + ')' },
    });
    if (Array.isArray(rows)) return rows;
  } catch {
    /* fallback scan penuh */
  }
  return null;
}

// Master RINGAN (proyeksi MASTER_LIGHT_COLS) untuk attachBerkasBio.
//
// RPC DULU, baru proyeksi PostgREST — dan urutannya bukan selera.
//
// `master_database_candidate.ai_data_json` bertipe **text**, jadi empat field
// `ai_*` yang dipinta lewat JSON-path PostgREST
// (`ai_gender:ai_data_json->identitas->gender`) SENYAP kembali sebagai null:
// HTTP 200, nilai null, padahal datanya ada (terukur 2026-10-20 atas DB live:
// 56 dari 234 baris punya `identitas.gender`/`umur`; di lapisan SQL operasinya
// bahkan tidak ada — "operator does not exist: text -> unknown"). Cast
// `::jsonb` di dalam `select` juga tidak bisa: PostgREST menjawab 400 PGRST100.
//
// Karena itu fungsi `public.master_light(wa_list text[])` (migrasi 018)
// melakukan cast itu DI DALAM SQL. Bentuk barisnya sama persis dengan proyeksi
// lama — 24 kolom ringan + empat `ai_*` yang kini benar-benar terisi — sehingga
// `buildBioFromMaster()` di berkas.ts tidak perlu diubah.
//
// The retry that used to follow this call asked for no projection at all, which
// PostgREST reads as `*` — i.e. the fallback silently restored the 169-column
// row the light projection exists to avoid. It now retries with the same
// explicit projection, so a failure here is a real failure.
async function fetchMasterLightByWa(waList: string[]) {
  // RPC (migrasi 018): satu round-trip, `ai_*` terisi. Dipanggil POST +
  // body — pola yang sama dengan rpc/claim_next_job di kernel/job-queue.ts.
  //
  // CATATAN OPERASIONAL (terukur 2026-10-20): Neon Data API meng-cache skema
  // dan TIDAK menyegarkannya otomatis, jadi setelah migrasi 018 dijalankan,
  // panggilan ini menjawab **404 PGRST202** sampai cache disegarkan lewat
  // Console (Data API → Refresh schema cache) atau PATCH Management API.
  // `NOTIFY pgrst, 'reload schema'` TIDAK cukup — sudah dicoba, cache tetap
  // basi. Sampai refresh dilakukan, catch di bawah yang jalan: perilakunya
  // identik dengan sebelum migrasi (proyeksi lama, bug-nya masih ada), jadi
  // deploy TIDAK rusak — hanya perbaikannya yang menunggu satu klik di Console.
  try {
    const rows = await supabaseJson('POST', 'rpc/master_light', {
      body: { wa_list: waList },
    });
    if (Array.isArray(rows)) return rows;
  } catch {
    /* RPC belum ada (migrasi 018 belum jalan / cache Neon belum disegarkan)
       atau gagal — jalur lama dipakai */
  }
  // Fallback: proyeksi PostgREST. Deliberately WITHOUT the four `ai_*`
  // JSON-path aliases — they answer 200 + null, which is the bug itself, and a
  // fallback that keeps them would look like it worked while returning nothing.
  try {
    const light = await supabaseJson('GET', 'master_database_candidate', {
      query: { select: MASTER_LIGHT_COLS, limit: '500', no_wa: 'in.(' + waList.join(',') + ')' },
    });
    if (Array.isArray(light)) return light;
  } catch {
    /* query gagal — caller memakai scan penuh berproyeksi */
  }
  return null;
}

export { fetchMasterByWa, fetchMasterLightByWa };
