import { pick, toText, findTable } from './client';
// db/misc.js — repo misc: admins, settings/assets, pengumuman.

// `queryPaged()` lived here and was never called by anything — a generic
// paged query builder whose only projection was `select: '*'`. It was deleted
// rather than projected, because dead code that asks for every column is a
// liability, not a fallback. The Range-based helper it called
// (`supabasePaged`) went the same way on 2026-09-12, replaced by keyset paging
// in ./pagination.ts.

async function findAdmins() {
  return findTable([
    'user_sessions',
    'admin_users',
    'admins',
    'admin',
    'staff',
    'users',
    'pengguna',
  ]);
}

// findTable() defaults to limit=1 because it was written to answer "does this
// table exist?". Callers that need the ROWS must pass a limit explicitly, and
// findSettings() never did — so every reader of the config table saw exactly
// ONE row of it.
//
// MEASURED 2026-09-16 against the live database: sys_config holds 158 rows
// across 11 config_type values (list_lokasi 57, tsk 36, list_syarat 15,
// list_kategori 15, list_tahapan 10, lokasi__link_zoom 7, status_form 6,
// list_status_loker 4, list_status_lamaran 4, list_gender 3, broadcast 1).
// With limit=1 the single row that came back was
//     id=bd43a55a-...  config_type="tsk"  config_value="TSK VIBE"
// so loadPublicBase() built dropdowns = { tsk: ["TSK VIBE"] } and every other
// key — tahapan, kategori, gender, lokasi, syarat — was simply ABSENT. The
// add-job form renders its selects from those keys, so it showed a job-type
// list holding one item and no work-stage / category / gender lists at all.
//
// The same defect had a second, worse edge: replaceConfigItems() in
// contexts/configuration finds the rows to delete through findSettings(), so
// editing any list deleted AT MOST ONE row and then inserted the whole list
// back. Measured signature in production data: tsk has 36 rows but only 35
// distinct values, with "TSK MAHER" present twice.
const SETTINGS_ROW_LIMIT = 500;

async function findSettings() {
  return findTable(
    [
      'sys_config',
      'assets',
      'settings',
      'app_config',
      'config',
      'system_config',
      'pengaturan',
      'site_config',
    ],
    SETTINGS_ROW_LIMIT,
  );
}

async function findAnnouncements() {
  return findTable(['pengumuman', 'announcements', 'announcement', 'marquee'], SETTINGS_ROW_LIMIT);
}

// Bangun objek assets ({LOGO, BANNER, FOOTER, SOCIAL}) dari tabel settings jika ada.
async function findAssets() {
  const found = await findSettings();
  for (const row of found.rows) {
    const logo =
      pick(row, ['logo', 'LOGO', 'logo_url', 'logoUrl', 'assets_logo']) ||
      (row.assets && typeof row.assets === 'object' && row.assets.LOGO);
    if (logo) {
      const nested = (k: string) => (row.assets && typeof row.assets === 'object' && row.assets[k]) || null;
      return {
        LOGO: logo,
        BANNER: {
          TOKYO:
            pick(row, ['banner_tokyo', 'banner', 'BANNER_TOKYO']) ||
            nested('BANNER')?.TOKYO ||
            null,
          SAKURA:
            pick(row, ['banner_sakura', 'banner_sakura_url']) || nested('BANNER')?.SAKURA || null,
        },
        FOOTER: {
          TOKYO:
            pick(row, ['footer_tokyo', 'footer', 'footer_momiji']) ||
            nested('FOOTER')?.TOKYO ||
            null,
          SAKURA: pick(row, ['footer_sakura']) || nested('FOOTER')?.SAKURA || null,
        },
        SOCIAL: {
          whatsapp:
            pick(row, ['wa_admin', 'whatsapp_admin', 'social_wa']) ||
            nested('SOCIAL')?.whatsapp ||
            null,
          instagram:
            pick(row, ['ig', 'instagram', 'social_ig']) || nested('SOCIAL')?.instagram || null,
          tiktok: pick(row, ['tiktok', 'social_tiktok']) || nested('SOCIAL')?.tiktok || null,
          maps: pick(row, ['maps', 'maps_link', 'lokasi_maps']) || nested('SOCIAL')?.maps || null,
        },
      };
    }
  }
  return null;
}

async function findPengumuman() {
  const ann = await findAnnouncements();
  for (const row of ann.rows) {
    const txt = pick(row, ['pengumuman', 'teks', 'isi', 'text', 'message', 'marquee']);
    if (txt) return toText(txt);
  }
  const settings = await findSettings();
  for (const row of settings.rows) {
    const txt = pick(row, ['pengumuman', 'marquee', 'announcement', 'teks_pengumuman']);
    if (txt) return toText(txt);
  }
  return '';
}

export { findAdmins, findSettings, findAnnouncements, findAssets, findPengumuman };
