import { supabaseJson, pick, toText, normalizeWa } from './client';
import { fetchAllKeyset } from './pagination';
import { TABLE_CANDIDATE, CANDIDATE_WA_COL, allColumns } from './schema.generated';
import { CAND_LIGHT_COLS, CAND_MAP_COLS } from './projections';
// db/candidates.js — repo kandidat (database_candidate): mapCandidate, query WA/ID,

// Kolom asli tabel database_candidate:
//   id, id_kandidat, nama_lengkap, nik, gender, usia, tb, bb, pendidikan,
//   no_wa, id_loker_pilihan, tahapan_seleksi, status_kandidat, tanggal_daftar,
//   catatan_admin, pas_photo, folder_url, jft, ssw, file_cv, password_kandidat,
//   no_pasport, email, tempat_lahir, tgl_lahir, alamat_lengkap,
//   catatan_internal, catatan_external, nilai_jft_text, bidang_ssw_text,
//   created_at, updated_at, password_diubah
function mapCandidate(row: Record<string, unknown>) {
  const nama = toText(pick(row, ['nama_lengkap', 'nama', 'name', 'full_name']));
  const wa = toText(
    pick(row, ['no_wa', 'wa', 'whatsapp', 'telepon', 'phone', 'no_hp', 'telp']),
  ).replace(/\D/g, '');
  const idKandidat = toText(pick(row, ['id_kandidat', 'id', 'kandidat_id', 'uid']));
  const catatanInt = toText(pick(row, ['catatan_internal', 'catatan_int']));
  // Single source of truth for ASJ student status — legacy semantics
  // (js/admin_modal/cv.ts): a class tag is [KELAS XX] or a bare [TAG];
  // [VIP] is NOT a class (it has its own toggle), so a VIP-only note does
  // not mark the candidate as an ASJ student.
  let catatanHasClassTag = false;
  {
    const tagRe = /\[(?:KELAS\s*)?([A-Z0-9]+)\]/gi;
    let tagM: RegExpExecArray | null;
    while ((tagM = tagRe.exec(catatanInt)) !== null) {
      if (tagM[1].toUpperCase() !== 'VIP') {
        catatanHasClassTag = true;
        break;
      }
    }
  }
  const tb = toText(pick(row, ['tb']));
  const bb = toText(pick(row, ['bb']));
  const tempatLahir = toText(pick(row, ['tempat_lahir', 'tempatLahir']));
  const tglLahir = toText(pick(row, ['tgl_lahir', 'tglLahir', 'tanggal_lahir']));
  return {
    idKandidat,
    id: idKandidat,
    nama,
    wa,
    gender: toText(pick(row, ['gender', 'jenis_kelamin', 'jk'])),
    usia: toText(pick(row, ['usia', 'umur'])),
    tb,
    bb,
    // Gabungan TB/BB & TTL (komentar asli: dihitung backend mapCandidate).
    tbBb:
      (tb && tb !== '-') || (bb && bb !== '-')
        ? [tb, bb].filter((x) => x && x !== '-').join(' / ')
        : '-',
    ttl: [tempatLahir, tglLahir].filter((x) => x && x !== '-').join(', ') || '-',
    pendidikan: toText(pick(row, ['pendidikan'])),
    pasPhoto: pick(row, ['pas_photo', 'pasPhoto', 'photo']) || '',
    email: toText(pick(row, ['email'])),
    tempatLahir,
    tglLahir,
    alamat: toText(pick(row, ['alamat_lengkap', 'alamat', 'address'])),
    jftText: toText(pick(row, ['nilai_jft_text', 'jft_text'])),
    sswText: toText(pick(row, ['bidang_ssw_text', 'ssw_text'])),
    catatanInt,
    catatanExt: toText(pick(row, ['catatan_external', 'catatan_ext'])),
    catatan: toText(pick(row, ['catatan_admin'])),
    isSiswaASJ: catatanHasClassTag,
    tahapan: toText(pick(row, ['tahapan_seleksi', 'tahapan'])),
    status: toText(pick(row, ['status_kandidat', 'status'])),
    idLoker: toText(pick(row, ['id_loker_pilihan', 'id_loker'])),
    folderUrl: pick(row, ['folder_url', 'folderUrl']) || '',
    jft: pick(row, ['jft', 'file_jft']) || '',
    ssw: pick(row, ['ssw', 'file_ssw']) || '',
    fileCv: pick(row, ['file_cv', 'fileCv', 'cv']) || '',
    // Alias jftUrl/sswUrl/cvUrl — dibaca modal CV admin (dossier) & dashboard.
    // Backend lama (Netlify GAS) mengembalikan nama ini; tanpa alias, tombol
    // FORMAT CV / SERTIF JFT / SERTIF SSW di dossier tidak pernah muncul.
    jftUrl: pick(row, ['jft', 'file_jft']) || '',
    sswUrl: pick(row, ['ssw', 'file_ssw']) || '',
    cvUrl: pick(row, ['file_cv', 'fileCv', 'cv']) || '',
    nik: toText(pick(row, ['nik'])),
    noPasport: toText(pick(row, ['no_pasport', 'no_paspor'])),
    tanggalDaftar: pick(row, ['tanggal_daftar', 'tanggalDaftar']) || '',
    createdAt: pick(row, ['created_at']) || '',
    _raw: row,
  };
}

// Nama tabel kandidat yang umum (urutan prioritas) — dipakai findCandidates &
// findAllCandidatesLight supaya jalur cepat & fallback mencari tabel yang sama.
async function findCandidates(): Promise<{ table: string; rows: any[] }> {
  return { table: TABLE_CANDIDATE, rows: [] };
}

// Fetch SEMUA baris satu tabel — keyset (cursor), bukan Range/OFFSET.
//
// The old version paged with `Range: start-end`, i.e. OFFSET/LIMIT, which is
// unstable under concurrent writes: an insert between two pages shifts every
// later row, so the next page repeats one row and drops another, silently. It
// also always paid one extra round-trip to discover the end. Keyset paging asks
// for `id > <last seen>` and uses a `+1` look-ahead, so it is stable and needs
// no extra request. See ./pagination.ts.
//
// `key` is `id` because it is the only column on database_candidate that is
// unique, NOT NULL and totally ordered (bigint) — verified against production:
// 226 rows, 226 distinct ids, 0 nulls.
async function fetchPagedAll(table: string, select: string, key = 'id') {
  return fetchAllKeyset(table, select, { key });
}
// Kolom RINGAN untuk daftar admin — cukup untuk dedupe by WA + filter kata
// kunci + urut updated_at (TIDAK membawa kolom berat seperti catatan/nik/email).
// CAND_LIGHT_COLS / CAND_MAP_COLS live in ./projections.ts and are checked
// against the generated schema by projections.test.ts. The local copy that used
// to sit here had already drifted from its own comment (it claimed to omit
// password_kandidat and catatan_internal while listing both).

// Semua baris kandidat bentuk RINGAN (proyeksi) — paginasi penuh TANPA batas
// 300 baris (admin list sebelumnya diam-diam terpotong saat >300 kandidat).
// Return: array (tabel ditemukan, boleh kosong) | undefined (tidak dikenal —
// caller fallback scan penuh). Urutan TIDAK dijamin — caller tetap dedupe+sort.
async function findAllCandidatesLight() {
  try {
    return await fetchPagedAll(TABLE_CANDIDATE, CAND_LIGHT_COLS);
  } catch {
    return undefined;
  }
}

// Baris PENUH untuk daftar id (halaman daftar admin) — pengganti scan 300
// baris `select *`: hanya id di halaman yang ditarik. undefined → gagal.
// OPTIMIZED: pakai CAND_MAP_COLS (proyeksi kolom yang dibaca mapCandidate)
// alih-alih SELECT * — kolom yang tidak pernah dibaca tidak ikut.
async function findCandidatesByIds(ids: (string | number)[]) {
  const list = [
    ...new Set((Array.isArray(ids) ? ids : []).map((x) => String(x).trim()).filter(Boolean)),
  ];
  if (!list.length) return [];
  try {
    const rows = await supabaseJson('GET', 'database_candidate', {
      query: { select: CAND_MAP_COLS, id: 'in.(' + list.join(',') + ')' },
    });
    return Array.isArray(rows) ? rows : undefined;
  } catch {
    // Fallback: SELECT * bila proyeksi kolom tidak cocok (skema berbeda)
    try {
      const rows = await supabaseJson('GET', 'database_candidate', {
        query: { select: allColumns('database_candidate'), id: 'in.(' + list.join(',') + ')' },
      });
      return Array.isArray(rows) ? rows : undefined;
    } catch {
      return undefined;
    }
  }
}

// Kolom WA yang umum di tabel kandidat (database_candidate / master) — dipakai
// query targeted (findCandidateByWaFiltered) & filter WA-set di attachBerkasBio.
// CANDIDATE_WA_COL imported from schema.generated.ts

// Cari kandidat via query SERVER-SIDE (filter kolom WA) — bukan tarik 300 baris
// lalu filter di JS. Return: row (ketemu) | null (tidak ketemu, query jalan) |
// undefined (kolom tidak cocok — caller pakai fallback scan).
// OPTIMIZED: pakai CAND_MAP_COLS alih-alih SELECT * — kolom berat yang tidak
// dibaca mapCandidate tidak ikut. Fallback SELECT * bila proyeksi gagal.
async function findCandidateByWaFiltered(wa: string) {
  const want = normalizeWa(wa);
  // Fase 3.18: probe 3 kolom WA (no_wa / wa / whatsapp) dijalankan PARALEL —
  // dulu berurutan (sampai 3 roundtrip serial bila kolom pertama tidak cocok
  // skema). Prioritas hasil tetap no_wa → wa → whatsapp (urutan CAND_WA_COLS).
  const cols = [CANDIDATE_WA_COL];
  const settled = await Promise.allSettled(
    cols.map((col) =>
      supabaseJson('GET', 'database_candidate', {
        query: { select: CAND_MAP_COLS, limit: '5', [col]: 'eq.' + want },
      }),
    ),
  );
  let anySucceed = false;
  for (let i = 0; i < cols.length; i++) {
    const r = settled[i];
    if (r.status === 'rejected') {
      // Proyeksi kolom mungkin tidak cocok — coba SELECT * untuk kolom ini
      try {
        const rows = await supabaseJson('GET', 'database_candidate', {
          query: { select: allColumns('database_candidate'), limit: '5', [cols[i]]: 'eq.' + want },
        });
        if (Array.isArray(rows) && rows.length) {
          const hit = rows.find((x) => normalizeWa(x[CANDIDATE_WA_COL] || '') === want);
          if (hit) return hit;
        }
        anySucceed = true;
      } catch {
        /* kolom ini tidak ada di skema */
      }
      continue;
    }
    anySucceed = true;
    const rows = r.value;
    if (!Array.isArray(rows) || rows.length === 0) continue;
    const hit = rows.find((x) => normalizeWa(x[CANDIDATE_WA_COL] || '') === want);
    if (hit) return hit;
  }
  return anySucceed ? null : undefined;
}

// Max nomor id kandidat (ASJ#####) dari kolom id_kandidat — server-side.
// FIX 2026-08-16: id_kandidat juga dialokasikan ke master_database_candidate
// (handleSubmitMasterForm → nextCandidateId). Kalau master sudah memakai id
// yang >= max(database_candidate), INSERT master berikutnya 409 duplicate key
// (kasus nyata: ASJ00226 di master vs max 225 di database_candidate → simpan
// biodata kandidat baru gagal permanen). Ambil max dari KEDUA tabel.
async function maxCandidateIdNumber() {
  try {
    const tables = ['database_candidate', 'master_database_candidate'];
    let max = 0;
    let found = false;
    for (const table of tables) {
      const rows = await supabaseJson('GET', table, {
        query: { select: 'id_kandidat', order: 'id_kandidat.desc', limit: '5' },
      });
      if (!Array.isArray(rows)) continue;
      for (const r of rows) {
        const m = String(r.id_kandidat || '').match(/ASJ(\d+)/i);
        if (m) {
          max = Math.max(max, parseInt(m[1], 10));
          found = true;
        }
      }
    }
    return found ? max : undefined;
  } catch {
    return undefined;
  }
}

// Cari baris kandidat per id_kandidat / id — dipakai lookup by ID (admin).
// OPTIMIZED: pakai CAND_MAP_COLS alih-alih SELECT *; fallback SELECT *.
async function findCandidateByIdFiltered(id: string) {
  const want = String(id || '').trim();
  if (!want) return undefined;
  let anyOk = false;
  for (const col of ['id_kandidat', 'id']) {
    try {
      const rows = await supabaseJson('GET', 'database_candidate', {
        query: { select: CAND_MAP_COLS, limit: '1', [col]: 'eq.' + want },
      });
      anyOk = true;
      if (Array.isArray(rows) && rows.length) return rows[0];
    } catch {
      // Proyeksi mungkin gagal — coba SELECT *
      try {
        const rows = await supabaseJson('GET', 'database_candidate', {
          query: { select: allColumns('database_candidate'), limit: '1', [col]: 'eq.' + want },
        });
        anyOk = true;
        if (Array.isArray(rows) && rows.length) return rows[0];
      } catch {
        /* kolom tidak ada / tipe tidak cocok — coba berikutnya */
      }
    }
  }
  return anyOk ? null : undefined;
}

// Kandidat yang terkait ke satu kode job (id_loker_pilihan bisa berisi banyak
// kode dipisah koma) — filter server-side; caller TETAP memverifikasi token
// eksak di JS supaya ilike tidak salah tangkap (mis. TG9ASJ vs TG90ASJ).
// OPTIMIZED: pakai CAND_MAP_COLS alih-alih SELECT *; fallback SELECT *.
async function findCandidatesByJobFiltered(code: string) {
  const want = String(code || '').trim();
  if (!want) return undefined;
  try {
    const rows = await supabaseJson('GET', 'database_candidate', {
      query: { select: CAND_MAP_COLS, limit: '500', id_loker_pilihan: 'ilike.*' + want + '*' },
    });
    return Array.isArray(rows) ? rows : undefined;
  } catch {
    // Fallback SELECT * bila proyeksi tidak cocok
    try {
      const rows = await supabaseJson('GET', 'database_candidate', {
        query: { select: allColumns('database_candidate'), limit: '500', id_loker_pilihan: 'ilike.*' + want + '*' },
      });
      return Array.isArray(rows) ? rows : undefined;
    } catch {
      return undefined;
    }
  }
}

// Lampirkan daftar lamaran (database_asj_form) ke tiap kandidat — dipakai
// dashboard kandidat & modal CV admin untuk menampilkan SEMUA job yang
// dilamar (satu kandidat boleh punya banyak lamaran di mail inbox).
function attachApplications(candidates: Record<string, any>[], forms: Record<string, any>[]) {
  if (!Array.isArray(candidates) || !Array.isArray(forms)) return candidates;
  const byWa = new Map();
  for (const f of forms) {
    const w = normalizeWa(String(f.no_wa || f.wa || f.whatsapp || ''));
    if (!w) continue;
    if (!byWa.has(w)) byWa.set(w, []);
    byWa.get(w).push({
      code: toText(f.code_job || f.code || ''),
      kategori: toText(f.kategory || f.kategori || ''),
      status: toText(f.status || 'MENUNGGU'),
      timestamp: toText(f.timestamp || f.created_at || ''),
      nama: toText(f.nama_lengkap || f.nama || ''),
      // CV milik lamaran loker ini (CV per loker: JOB<code>_CV di folder master).
      cv: toText(f.file_cv || ''),
    });
  }
  for (const c of candidates) {
    const w = normalizeWa(String(c.wa || ''));
    const apps = byWa.get(w) || [];
    // Attach tahapan dari database_candidate supaya frontend progress bar
    // pakai tahapan aktual (bukan status mail yang bisa误导).
    const tahapan = toText(c.tahapan || '');
    apps.forEach((a: any) => { a.tahapan = tahapan; });
    apps.sort((a: any, b: any) => String(b.timestamp).localeCompare(String(a.timestamp)));
    c.applications = apps;
  }
  return candidates;
}

export {
  mapCandidate,
  findCandidates,
  findAllCandidatesLight,
  findCandidatesByIds,
  findCandidateByWaFiltered,
  findCandidateByIdFiltered,
  findCandidatesByJobFiltered,
  maxCandidateIdNumber,
  attachApplications,
};
