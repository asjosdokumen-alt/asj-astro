/**
 * contexts/notifications/repository.ts — Database queries for WA templates
 *
 * Owns: wa_templates
 * All DB access goes through kernel/http → supabaseJson
 */
import { normalizeWa, supabaseJson } from '../../_lib/db/client';
import { WA_TEMPLATE_COLS } from '../../_lib/db/projections';

/** Upsert a WA template */
export async function upsertWaTemplate(row: Record<string, any>, id?: string): Promise<void> {
  if (id && id !== '') {
    await supabaseJson('PATCH', 'wa_templates', {
      query: { id: 'eq.' + id },
      body: row,
      headers: { Prefer: 'return=minimal' },
    });
  } else {
    await supabaseJson('POST', 'wa_templates', {
      body: { id: 'WA' + Date.now(), ...row },
      headers: { Prefer: 'return=minimal' },
    });
  }
}

/** Delete a WA template by id */
export async function deleteWaTemplate(id: string): Promise<void> {
  await supabaseJson('DELETE', 'wa_templates', {
    query: { id: 'eq.' + id },
    headers: { Prefer: 'return=minimal' },
  });
}

/** Get all WA templates */
export async function getWaTemplates(): Promise<any[]> {
  const rows = await supabaseJson('GET', 'wa_templates', {
    query: { select: WA_TEMPLATE_COLS, limit: 100 },
  });
  return Array.isArray(rows) ? rows : [];
}

export { normalizeWa };
