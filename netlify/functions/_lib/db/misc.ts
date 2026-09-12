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

async function findSettings() {
  return findTable([
    'sys_config',
    'assets',
    'settings',
    'app_config',
    'config',
    'system_config',
    'pengaturan',
    'site_config',
  ]);
}

async function findAnnouncements() {
  return findTable(['pengumuman', 'announcements', 'announcement', 'marquee']);
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
