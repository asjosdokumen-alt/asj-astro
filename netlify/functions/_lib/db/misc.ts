import { supabaseJson, supabasePaged, pick, toText, findTable } from './client';
// db/misc.js — repo misc: admins, settings/assets, pengumuman, query paginated.

// Query paginated dengan Range header + total dari Content-Range. Pakai
// helper terpusat supabasePaged (client.js).
async function queryPaged(table: string, { page = 1, pageSize = 50, q = '' } = {}) {
  const start = (page - 1) * pageSize;
  const end = start + pageSize - 1;
  const params = { select: '*' };
  if (q && q.trim()) {
    // P31 fix: buang karakter metagrammar PostgREST ( ) , * sebelum interpolasi
    // ke or= — needle user tidak boleh mengubah struktur filter.
    const needle = q
      .trim()
      .replace(/'/g, "''")
      .replace(/[()*,]/g, ' ')
      .replace(/s+/g, ' ')
      .trim();
    // PostgREST or= wajib dibungkus kurung, kalau tidak gagal (HTTP 400).
    // @ts-expect-error JS→TS migration
    params.or = `(nama_lengkap.ilike.*${needle}*,no_wa.ilike.*${needle}*)`;
  }
  const qs = new URLSearchParams(params).toString();
  return supabasePaged(table, qs, { start, end });
}

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

export { queryPaged, findAdmins, findSettings, findAnnouncements, findAssets, findPengumuman };
