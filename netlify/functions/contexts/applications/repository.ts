/**
 * contexts/applications/repository.ts — Database queries for application forms (mail inbox)
 *
 * Owns: database_asj_form
 * All DB access goes through kernel/http → supabaseJson
 */
import { normalizeWa, pick, supabaseJson, supabaseUpsert } from '../../_lib/db/client';
import { allColumns } from '../../_lib/db/schema.generated';
import { clientFor } from '../../_lib/kernel/db';
import {
  findFormByIndexFiltered,
  findForms,
  findFormsByWa,
  mapForm,
  upsertFormRow,
} from '../../_lib/db/forms';

export async function getFormByIndex(idx: number): Promise<import("../../_lib/db/row-types").FormRawRow | null> {
  let f = await findFormByIndexFiltered(idx);
  if (f === undefined) {
    const forms = await findForms();
    f = forms[idx] || null;
  }
  return f;
}

export async function getFormsByWa(wa: string): Promise<import("../../_lib/db/row-types").FormRawRow[]> {
  let rows = await findFormsByWa(wa);
  if (rows === undefined) {
    rows = await supabaseJson('GET', 'database_asj_form', {
      query: { select: allColumns('database_asj_form'), limit: 500 },
    });
  }
  return Array.isArray(rows) ? rows : [];
}

export async function patchForm(id: string | number, body: Record<string, unknown>, sessionToken?: string): Promise<void> {
  const client = clientFor('applications.patchForm', sessionToken);
  await supabaseJson('PATCH', 'database_asj_form', {
    query: { id: `eq.${id}` },
    body,
    headers: { Prefer: 'return=minimal' },
    overrideKey: client.apikey,
    overrideAuthKey: client.authKey,
  } as Record<string, unknown>);
}

export async function deleteForm(id: string | number, sessionToken?: string): Promise<void> {
  const client = clientFor('applications.deleteForm', sessionToken);
  await supabaseJson('DELETE', 'database_asj_form', {
    query: { id: `eq.${id}` },
    headers: { Prefer: 'return=minimal' },
    overrideKey: client.apikey,
    overrideAuthKey: client.authKey,
  } as Record<string, unknown>);
}

/**
 * M-3: one DELETE for the whole selection. The previous per-id loop cost
 * 2N PostgREST round-trips (resolve + delete) and could 504 halfway through,
 * leaving rows gone with no report. PostgREST's `in.(…)` makes the delete
 * atomic from the caller's point of view.
 *
 * IDs come from the database, but they are still interpolated into a query
 * string — only digits or a tight alphanumeric set are allowed, and string
 * ids are quoted so a comma cannot become an extra filter value.
 */
export async function deleteFormsByIds(ids: Array<string | number>, sessionToken?: string): Promise<void> {
  if (ids.length === 0) return;
  const values = ids.map((raw) => {
    const id = String(raw);
    if (/^\d+$/.test(id)) return id;
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
      throw new Error('ID form tidak valid untuk penghapusan massal.');
    }
    return `"${id}"`;
  });
  const client = clientFor('applications.deleteFormsByIds', sessionToken);
  await supabaseJson('DELETE', 'database_asj_form', {
    query: { id: `in.(${values.join(',')})` },
    headers: { Prefer: 'return=minimal' },
    overrideKey: client.apikey,
    overrideAuthKey: client.authKey,
  } as Record<string, unknown>);
}

export async function upsertForm(body: Record<string, unknown>): Promise<void> {
  await upsertFormRow(body);
}

export { normalizeWa, pick, mapForm, supabaseJson, supabaseUpsert };
