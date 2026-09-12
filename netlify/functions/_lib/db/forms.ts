import { supabaseJson, toText, normalizeWa } from './client';
import { allColumns } from './schema.generated';
import { FORM_LIGHT_COLS } from './projections';
// db/forms.js — repo mail inbox (database_asj_form): mapForm, findForms, query per WA.

// ===== Mail inbox (database_asj_form) =====
// Kolom asli: id, timestamp, code_job, kategory, nama_lengkap, no_wa, gender,
// usia, tb, bb, pas_photo, jft, ssw, file_cv, folder_name, folder_id,
// folder_url, status, email, tempat_lahir, tgl_lahir, alamat_lengkap,
// created_at, updated_at, keterangan, ai_data_json, feedback_berkas
function mapForm(row: Record<string, any>, i: number) {
  return {
    rowIndex: i,
    id: row.id,
    timestamp: toText(row.timestamp || row.created_at),
    code: toText(row.code_job),
    kategori: toText(row.kategory),
    nama: toText(row.nama_lengkap),
    wa: toText(row.no_wa).replace(/\D/g, ''),
    status: toText(row.status) || 'MENUNGGU',
    folderUrl: row.folder_url || '',
    photo: row.pas_photo || '',
    jft: row.jft || '',
    ssw: row.ssw || '',
    cv: row.file_cv || '',
    keterangan: toText(row.keterangan),
    // Aktivitas terakhir kandidat (status UPDATE): "[BIODATA] email diubah · [UPLOAD KTP]".
    feedback: toText(row.feedback_berkas),
    // Dokumen tambahan dari keterangan "NAMA:URL;NAMA2:URL2;..." — dipakai
    // mail inbox untuk menampilkan SEMUA yang di-upload kandidat + preview.
    docs: parseDocs(toText(row.keterangan)),
  };
}

// Parse keterangan mail menjadi daftar dokumen {nama, url} (format NAMA:URL;...).
function parseDocs(keterangan: string) {
  const out: { nama: string; url: string }[] = [];
  String(keterangan || '')
    .split(';')
    .forEach((chunk) => {
      const i = chunk.indexOf(':');
      if (i <= 0) return;
      const nama = chunk.slice(0, i).trim();
      const url = chunk.slice(i + 1).trim();
      if (!nama || !url || !/^https?:\/\//i.test(url)) return;
      out.push({ nama, url });
    });
  return out;
}

// Kolom RINGAN mail inbox (database_asj_form) — gabungan semua kolom yang
// benar-benar dibaca dari baris form: mapForm (formInbox admin),
// attachApplications (lamaran per WA), parseDocs (keterangan NAMA:URL;...).
// `select *` lama ikut kolom berat (ai_data_json, dll.) yang tidak pernah
// dibaca dari formInbox.
// FORM_LIGHT_COLS imported from schema.generated.ts

// Urutan form konsisten (dipakai getAppData DAN handler review/approve/reject/
// delete yang menerima rowIndex = posisi di array ini).
// This is the fallback path, so it asks for every column the table has — but
// names them, rather than relying on PostgREST's implicit `*`. Consumers
// (documents, jobs, registry, catalog) read columns outside FORM_LIGHT_COLS
// such as ai_data_json and folder_id, so the narrow projection is not an option
// here.
async function findForms() {
  const rows = await supabaseJson('GET', 'database_asj_form', {
    query: { select: allColumns('database_asj_form'), order: 'timestamp.desc', limit: 500 },
  });
  return Array.isArray(rows) ? rows : [];
}

// Baris mail RINGAN (proyeksi FORM_LIGHT_COLS) untuk getAppData admin —
// mapForm & attachApplications hanya membaca kolom di proyeksi ini, jadi
// kolom berat tidak perlu ikut. Urutan TETAP timestamp.desc (sama dengan
// findForms) supaya rowIndex di frontend konsisten dengan
// findFormByIndexFiltered. Return: array | undefined (skema tidak cocok →
// caller fallback findForms()).
async function findFormsLight() {
  try {
    const rows = await supabaseJson('GET', 'database_asj_form', {
      query: { select: FORM_LIGHT_COLS, order: 'timestamp.desc', limit: 500 },
    });
    return Array.isArray(rows) ? rows : undefined;
  } catch {
    return undefined;
  }
}

// Semua baris mail (database_asj_form) untuk satu WA — urutan timestamp.desc
// sama dengan findForms() supaya "baris pertama" konsisten.
// OPTIMIZED: pakai FORM_LIGHT_COLS alih-alih SELECT * — mapForm &
// attachApplications hanya membaca kolom di proyeksi ini.
//
// P0-1 (docs/DB_PERFORMANCE_AUDIT.md): the `or=(no_wa.eq.X,wa.eq.X)` attempt that
// used to run first could never succeed — `database_asj_form` has no `wa` column,
// so PostgREST answered 400 and the caller paid two failed round-trips (~78 ms at
// the measured 39 ms RTT) before the working query ran. It is gone; `no_wa` is the
// only WA column this schema has.
async function findFormsByWa(wa: string) {
  const want = normalizeWa(wa);
  if (!want) return [];
  try {
    const light = await supabaseJson('GET', 'database_asj_form', {
      query: { select: FORM_LIGHT_COLS, limit: '100', order: 'timestamp.desc', no_wa: 'eq.' + want },
    });
    if (Array.isArray(light)) return light;
  } catch {
    /* proyeksi gagal — coba kolom penuh */
  }
  try {
    const full = await supabaseJson('GET', 'database_asj_form', {
      query: {
        select: allColumns('database_asj_form'),
        limit: '100',
        order: 'timestamp.desc',
        no_wa: 'eq.' + want,
      },
    });
    if (Array.isArray(full)) return full;
  } catch {
    /* jalur berikutnya */
  }
  return undefined;
}

// Insert baris mail dengan anti-duplikat (no_wa, code_job): upsert
// on_conflict kalau constraint unik sudah ada di DB; kalau belum (HTTP 400
// 42P10), fallback INSERT biasa. Race GET-then-POST (dua request paralel
// sama-sama tidak menemukan baris) tidak lagi bikin baris dobel begitu
// constraint dibuat via:
//   ALTER TABLE database_asj_form
//   ADD CONSTRAINT database_asj_form_no_wa_code_job_key UNIQUE (no_wa, code_job);
async function upsertFormRow(body: Record<string, unknown>) {
  try {
    await supabaseJson('POST', 'database_asj_form', {
      query: { on_conflict: 'no_wa,code_job' },
      body,
      headers: { Prefer: 'return=minimal,resolution=merge-duplicates' },
    });
  } catch (e) {
    // Constraint belum ada → INSERT biasa (perilaku lama). Error lain diteruskan.
    if (!String((e as Error).message || '').includes('42P10')) throw e;
    await supabaseJson('POST', 'database_asj_form', {
      body,
      headers: { Prefer: 'return=minimal' },
    });
  }
}

// Baris mail pada posisi index urutan timestamp.desc — pengganti scan 500
// baris untuk aksi admin yang menerima rowIndex dari frontend (review/approve/
// reject/hapus/tandai dibaca).
async function findFormByIndexFiltered(idx: number) {
  const i = Number(idx);
  if (!Number.isInteger(i) || i < 0) return undefined;
  try {
    const rows = await supabaseJson('GET', 'database_asj_form', {
      query: { select: allColumns('database_asj_form'), order: 'timestamp.desc', limit: '1', offset: String(i) },
    });
    return Array.isArray(rows) ? rows[0] || null : undefined;
  } catch {
    return undefined;
  }
}

// Baris mail untuk daftar WA (in-filter) — share-data extra docs &
// attachApplications halaman kandidat. Hanya membaca kolom ringan
// (keterangan/no_wa/dll.), jadi proyeksi FORM_LIGHT_COLS dipakai dulu; kalau
// gagal, jalur kedua memakai kolom penuh eksplisit. undefined → scan penuh.
// P0-1: the `wa.in.(…)` arm of the old `or=` was removed for the same reason as
// findFormsByWa — the column does not exist, so it always cost a failed request.
async function findFormsByWaList(waList: string[]) {
  const list = [
    ...new Set((Array.isArray(waList) ? waList : []).map((w) => normalizeWa(w)).filter(Boolean)),
  ];
  if (!list.length) return [];
  const inList = list.join(',');
  try {
    const light = await supabaseJson('GET', 'database_asj_form', {
      query: { select: FORM_LIGHT_COLS, limit: '500', no_wa: 'in.(' + inList + ')' },
    });
    if (Array.isArray(light)) return light;
  } catch {
    /* proyeksi gagal — coba kolom penuh */
  }
  try {
    const full = await supabaseJson('GET', 'database_asj_form', {
      query: { select: allColumns('database_asj_form'), limit: '500', no_wa: 'in.(' + inList + ')' },
    });
    if (Array.isArray(full)) return full;
  } catch {
    /* jalur berikutnya */
  }
  return undefined;
}

export {
  mapForm,
  parseDocs,
  findForms,
  findFormsLight,
  findFormsByWa,
  findFormByIndexFiltered,
  findFormsByWaList,
  upsertFormRow,
};
