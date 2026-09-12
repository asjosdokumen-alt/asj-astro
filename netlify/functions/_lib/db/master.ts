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
// The retry that used to follow this call asked for no projection at all, which
// PostgREST reads as `*` — i.e. the fallback silently restored the 169-column
// row the light projection exists to avoid. It now retries with the same
// explicit projection, so a failure here is a real failure.
async function fetchMasterLightByWa(waList: string[]) {
  const inList = waList.join(',');
  try {
    const light = await supabaseJson('GET', 'master_database_candidate', {
      query: { select: MASTER_LIGHT_COLS, limit: '500', no_wa: 'in.(' + inList + ')' },
    });
    if (Array.isArray(light)) return light;
  } catch {
    /* query gagal — caller memakai scan penuh berproyeksi */
  }
  return null;
}

export { fetchMasterByWa, fetchMasterLightByWa };
