/**
 * contexts/configuration/service.ts — Business logic for sys_config + presets
 *
 * Other contexts and surfaces import ONLY from index.ts.
 * Never import from this file or repository.ts directly.
 */
import { requireRole } from '../identity';
import { safeError } from '../../_lib/kernel/errors';
import {
  resolveConfigType,
  replaceConfigItems,
  getRincianPresets as getRincianPresetsRepo,
  insertRincianPresets,
  deleteRincianPreset as deleteRincianPresetRepo,
} from './repository';

export async function handleUpdateSysConfig(payload: any[], sessionToken?: string) {
  const guard = requireRole(sessionToken || '', 'admin');
  if (guard.error) return guard.error;

  const key = String((payload && payload[0]) || '');
  const arr = (payload && payload[1]) || [];
  if (!key) return { success: false, error: 'Key konfigurasi tidak valid.' };

  const type = resolveConfigType(key);
  const items = Array.isArray(arr) ? arr.map((x: any) => String(x)) : [String(arr)];

  try {
    await replaceConfigItems(type, items);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: safeError('Gagal simpan konfigurasi.', e) };
  }
}

export async function handleGetRincianPresets(sessionToken?: string) {
  // C3 fix (2026-09-04): rincian presets are admin configuration data served
  // by the config surface — not readable anonymously or by kandidat sessions.
  const guard = requireRole(sessionToken || '', 'admin');
  if (guard.error) return guard.error;
  try {
    const rows = await getRincianPresetsRepo();
    const presets: Record<string, { id: string | number | undefined; item: string }[]> = {
      include: [],
      exclude: [],
      benefit: [],
      persyaratan: [],
    };
    for (const r of rows) {
      const cat = String(r.kategori || '').toLowerCase();
      if (presets[cat]) presets[cat].push({ id: r.id, item: String(r.item || '') });
    }
    return { success: true, presets };
  } catch (e: any) {
    return { success: false, error: safeError('Gagal memuat presets.', e) };
  }
}

export async function handleSaveRincianPreset(payload: any[], sessionToken?: string) {
  const guard = requireRole(sessionToken || '', 'admin');
  if (guard.error) return guard.error;

  const d = (payload && payload[0]) || {};
  const cat = String(d.kategori || '');
  const items = Array.isArray(d.item) ? d.item.map((x: any) => String(x)) : [String(d.item || '')];
  if (!cat || !items[0]) return { success: false, error: 'Kategori dan item wajib diisi.' };

  try {
    const lastId = await insertRincianPresets(cat, items);
    return { success: true, id: lastId };
  } catch (e: any) {
    return { success: false, error: safeError('Gagal simpan preset.', e) };
  }
}

export async function handleDeleteRincianPreset(payload: any[], sessionToken?: string) {
  const guard = requireRole(sessionToken || '', 'admin');
  if (guard.error) return guard.error;

  const id = String((payload && payload[0] && payload[0].id) || '');
  if (!id) return { success: false, error: 'ID preset tidak ditemukan.' };

  try {
    await deleteRincianPresetRepo(id);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: safeError('Gagal hapus preset.', e) };
  }
}

export async function handleRunMigration(payload: any[], sessionToken?: string) {
  const guard = requireRole(sessionToken || '', 'admin');
  if (guard.error) return guard.error;

  try {
    // Migration endpoint — kept for backward compatibility but discouraged
    return { success: true, results: [{ id: 'migration', status: 'OK' }], pendingSql: [] };
  } catch (e: any) {
    return { success: false, error: safeError('Gagal menjalankan migration.', e), results: [], pendingSql: [] };
  }
}
