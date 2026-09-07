/**
 * contexts/configuration/repository.ts — Database queries for sys_config + rincian_presets
 *
 * Owns: sys_config (read/write), rincian_presets
 * All DB access goes through kernel/http → supabaseJson
 */
import { supabaseJson } from '../../_lib/db/client';
import { findSettings } from '../../_lib/db/misc';

const CONFIG_TYPE_MAP: Record<string, string> = {
  kategori: 'list_kategori',
  gender: 'list_gender',
  tahapan: 'list_tahapan',
  tsk: 'tsk',
  lokasi: 'list_lokasi',
  syarat: 'list_syarat',
  lokasiZoom: 'lokasi__link_zoom',
  statusLoker: 'list_status_loker',
  statusForm: 'status_form',
  statusLamaran: 'list_status_lamaran',
  broadcast: 'broadcast',
  pengumuman: 'broadcast',
};

function resolveConfigType(key: string): string {
  return CONFIG_TYPE_MAP[key] || key;
}

/** Delete all sys_config rows for a given type, then insert new items */
export async function replaceConfigItems(type: string, items: string[]): Promise<void> {
  const settings = await findSettings();
  const rows = Array.isArray(settings.rows) ? settings.rows : [];
  const toDelete = rows.filter((r: Record<string, unknown>) => String(r.config_type || '') === type).map((r: Record<string, unknown>) => r.id);

  // P28 fix: batch delete + insert (satu HTTP call masing-masing) — loop lama
  // N+1 dan non-atomik (gagal di tengah meninggalkan konfigurasi parsial).
  if (toDelete.length > 0) {
    await supabaseJson('DELETE', 'sys_config', {
      query: { id: 'in.(' + toDelete.join(',') + ')' },
      headers: { Prefer: 'return=minimal' },
    });
  }

  const insertItems = items
    .filter((item) => item)
    .map((item) => ({
      config_type: type,
      config_value: item,
      is_active: true,
      created_at: new Date().toISOString(),
    }));
  if (insertItems.length > 0) {
    await supabaseJson('POST', 'sys_config', {
      body: insertItems,
      headers: { Prefer: 'return=minimal' },
    });
  }
}

/** Get all rincian_presets */
export async function getRincianPresets(): Promise<import("../../_lib/db/row-types").SysConfigRawRow[]> {
  const rows = await supabaseJson('GET', 'rincian_presets', {
    query: { select: '*', limit: 500 },
  });
  return Array.isArray(rows) ? rows : [];
}

/** Insert rincian_presets */
export async function insertRincianPresets(
  kategori: string,
  items: string[],
): Promise<string | null> {
  let lastId: string | null = null;
  for (const item of items) {
    if (!item) continue;
    const rows = await supabaseJson('POST', 'rincian_presets', {
      body: { kategori: kategori, item, created_at: new Date().toISOString() },
      headers: { Prefer: 'return=representation' },
    });
    if (Array.isArray(rows) && rows[0]) lastId = rows[0].id;
  }
  return lastId;
}

/** Delete a rincian_preset by id */
export async function deleteRincianPreset(id: string): Promise<void> {
  await supabaseJson('DELETE', 'rincian_presets', {
    query: { id: 'eq.' + id },
    headers: { Prefer: 'return=minimal' },
  });
}

export { resolveConfigType };
