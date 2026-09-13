import { supabaseJson, pick, toText, findTable } from './client';
import { allColumns } from './schema.generated';
import { JOB_MAP_COLS } from './projections';
// db/jobs.js — repo lowongan (job_database/loker): mapJob, findJobs, lookup by kode.

// Kolom asli tabel job_database (hasil introspeksi):
//   code_job, tsk, kategori, pekerjaan, lokasi, gender, kuota, jumlah_kandidat,
//   status, syarat, keterangan, tahapan, format_cv, link_pamflet,
//   total_biaya, rincian_biaya, dokumen_share
function mapJob(row: any) {
  const pekerjaan = pick(row, [
    'pekerjaan',
    'nama_pekerjaan',
    'judul',
    'title',
    'pekerjaan_loker',
    'nama_loker',
    'posisi',
    'job',
  ]);
  const klien = pick(row, ['perusahaan', 'klien', 'company', 'client']);
  const code = toText(
    pick(row, ['code_job', 'code', 'kode', 'no_loker', 'id_loker', 'id_lowongan', 'id']),
  );
  const templateCv = pick(row, ['format_cv', 'template_cv', 'templatecv', 'cv_template']) || '';
  return {
    // id:0 + rowIndex=kode — persis perilaku backend asli (diverifikasi dari
    // situs live asjportal.netlify.app).
    id: 0,
    code,
    rowIndex: code,
    pekerjaan: klien ? pekerjaan + ' - ' + klien : pekerjaan,
    kategori: toText(pick(row, ['kategori', 'category', 'bidang', 'sektor'])),
    // status & gender dikirim MENTAH (persis backend asli — frontend sudah
    // menghandle nilai seperti "❌ CLOSE", "👨 Pria👩 Wanita").
    status: toText(pick(row, ['status', 'state', 'is_open'])),
    lokasi: toText(pick(row, ['lokasi', 'location', 'prefektur', 'kota', 'area'])),
    gender: toText(pick(row, ['gender', 'jenis_kelamin', 'jk'])),
    kuota: (() => {
      const kv = pick(row, ['kuota', 'quota', 'jml_kuota']);
      // Asli mengirim "" kalau kosong/0.
      return kv == null || kv === '' || kv === 0 ? '' : toText(kv);
    })(),
    jumlahKandidat: Number(pick(row, ['jumlah_kandidat', 'jumlahKandidat'])) || 0,
    syarat: toText(pick(row, ['syarat', 'persyaratan', 'requirements', 'requirement'])),
    keterangan: toText(pick(row, ['keterangan', 'deskripsi', 'description', 'info_tambahan'])),
    tahapan: toText(pick(row, ['tahapan', 'tahapan_seleksi'])),
    tsk: toText(pick(row, ['tsk', 'pengurus'])),
    dokumenShare: toText(pick(row, ['dokumen_share', 'dokumenshare', 'dokumen', 'docs_share'])),
    template: templateCv,
    templateCv,
    pamflet: toText(pick(row, ['link_pamflet', 'pamflet', 'poster', 'flyer', 'brosur'])),
    rincianBiaya: toText(pick(row, ['rincian_biaya', 'rincianbiaya', 'biaya_rincian', 'rincian'])),
    totalBiaya: toText(pick(row, ['total_biaya', 'totalbiaya', 'total'])),
    createdAt: toText(pick(row, ['created_at', 'createdat', 'tanggal', 'date_created', 'tgl'])),
    _raw: row,
  };
}

// Nama tabel asli (hasil introspeksi skema Supabase project):
//   job_database (lowongan), database_candidate + master_database_candidate
//   (kandidat), sys_config (konfigurasi/assets/pengumuman), database_tugas,
//   database_schedule, wa_templates, ai_form_submissions, user_sessions, dll.
//
// BUG FIX (2026-09-13): this used to call `findTable([...])` with no limit, so
// it inherited findTable's default `limit = 1`. That default is right for its
// intended purpose (probing whether a table exists), but findJobs() needs the
// ROWS, not a probe — so the public board served exactly ONE job out of 158 in
// the database. Legacy returned 159. The owner saw "data cuma masuk 1 doank".
//
// The limit is now explicit and matches the legacy board size (legacy fetched
// the whole table). Keep it as a named constant so the intent is not lost again.
const JOB_BOARD_LIMIT = 300;
export { JOB_BOARD_LIMIT };

async function findJobs() {
  return findTable(
    [
      'job_database',
      'jobs',
      'lokers',
      'loker',
      'lowongan',
      'job_listings',
      'joblistings',
      'tbl_jobs',
      'data_loker',
    ],
    JOB_BOARD_LIMIT,
  );
}

// Ada kandidat yang masih terikat ke job code? (cek hapus loker) — server-side.
async function countCandidatesForJob(code: string) {
  try {
    const rows = await supabaseJson('GET', 'database_candidate', {
      query: { select: 'id', id_loker_pilihan: 'eq.' + String(code), limit: '1' },
    });
    return Array.isArray(rows) ? rows.length > 0 : undefined;
  } catch {
    return undefined;
  }
}

// ===== Server-side targeted queries (lanjutan REVIEW.md S2) =====
// Semua helper di bawah punya kontrak sama dengan findCandidateByWaFiltered:
//  - baris/array ketemu → data
//  - query jalan tapi tidak ada yang cocok → null / []
//  - kolom/tabel tidak dikenal → undefined (caller fallback ke scan penuh)

// Kolom job yang dibaca mapJob — pengganti SELECT * di findJobByCodeFiltered.
// JOB_MAP_COLS lives in ./projections.ts (checked against the generated schema).

// Cari baris job per kode (code_job / code) — 1 baris, bukan scan semua loker.
// OPTIMIZED: pakai JOB_MAP_COLS alih-alih SELECT *; fallback SELECT *.
async function findJobByCodeFiltered(code: string) {
  const want = String(code || '').trim();
  if (!want) return undefined;
  let anyOk = false;
  for (const col of ['code_job', 'code']) {
    try {
      const rows = await supabaseJson('GET', 'job_database', {
        query: { select: JOB_MAP_COLS, limit: '1', [col]: 'eq.' + want },
      });
      anyOk = true;
      if (Array.isArray(rows) && rows.length) return rows[0];
    } catch {
      // Proyeksi gagal — ulangi dengan daftar kolom penuh yang eksplisit.
      try {
        const rows = await supabaseJson('GET', 'job_database', {
          query: { select: allColumns('job_database'), limit: '1', [col]: 'eq.' + want },
        });
        anyOk = true;
        if (Array.isArray(rows) && rows.length) return rows[0];
      } catch {
        /* kolom tidak ada — coba kolom berikutnya */
      }
    }
  }
  return anyOk ? null : undefined;
}

// Max nomor kode job TG###ASJ — server-side (desc, ambil 20 teratas).
async function maxJobCodeNumber() {
  try {
    const rows = await supabaseJson('GET', 'job_database', {
      query: { select: 'code_job', order: 'code_job.desc', limit: '20' },
    });
    if (!Array.isArray(rows) || rows.length === 0) return undefined;
    let max = 0;
    let found = false;
    for (const r of rows) {
      const m = String(r.code_job || r.code || '').match(/TG(\d+)ASJ/);
      if (m) {
        max = Math.max(max, parseInt(m[1], 10));
        found = true;
      }
    }
    return found ? max : undefined;
  } catch {
    return undefined;
  }
}

export { mapJob, findJobs, countCandidatesForJob, findJobByCodeFiltered, maxJobCodeNumber };
