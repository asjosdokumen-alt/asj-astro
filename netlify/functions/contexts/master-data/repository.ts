/**
 * contexts/master-data/repository.ts — Database queries for master_database_candidate
 *
 * Owns: master_database_candidate
 */
import { normalizeWa, pick, supabaseJson, supabaseUpsert, toText, toDateOnly, normalizeBloodType, APPLY_WA_COLS, writeBodyFor } from '../../_lib/db/client';
import { allColumns } from '../../_lib/db/schema.generated';
import { findCandidateByWaFiltered, findCandidates } from '../../_lib/db/candidates';
import { fetchMasterByWa } from '../../_lib/db/master';
import { syncPekerjaan } from '../../_lib/db/pekerjaan';
import { nextCandidateId } from '../../_lib/candidate-helpers';

export async function findMasterByWa(wa: string): Promise<any | null> {
  const want = normalizeWa(wa);
  if (!want) return null;
  let rows = await fetchMasterByWa([want]);
  if (rows === null) {
    // Fallback TARGETED lewat index unik `master_database_candidate_no_wa_key`
    // — pengganti scan `select <169 kolom> limit 500` TANPA filter yang diukur
    // 1,35 MB/permintaan (2026-10-20, JSON penuh 500 baris). Scan itu juga tidak
    // punya nilai tutup: 233/234 baris tersimpan kanonik `628…` (sudah ketemu
    // lewat `eq`), dan satu-satunya penyimpangan (`622342782945`) dinormalisasi
    // menjadi '' oleh normalizeWa — jadi TIDAK ADA baris yang hanya bisa
    // ditemukan dengan menarik seluruh tabel.
    //
    // Bentuk lokal (`0…`) ikut di daftar `in.(…)`: kalau ada baris yang tersimpan
    // belum ternormalisasi, keduanya tetap satu query, dan index unik pada no_wa
    // membatasi hasil maksimal dua baris. `limit` tetap dipasang sebagai pagar
    // keras: seandainya index unik itu hilang, kerusakan terburuk tetap 10 baris
    // (±70 KB), bukan 1,35 MB.
    //
    // Berbeda dari fetchMasterByWa, kegagalan di sini DITERUSKAN apa adanya —
    // persis seperti fallback lama. "Database mati" tidak boleh berubah menjadi
    // "kandidat tidak ditemukan" hanya karena bentuk query-nya berbeda.
    const local = want.startsWith('628') ? '0' + want.slice(2) : '';
    const forms = local ? [want, local] : [want];
    rows = await supabaseJson('GET', 'master_database_candidate', {
      query: {
        select: allColumns('master_database_candidate'),
        limit: '10',
        no_wa: `in.(${forms.join(',')})`,
      },
    });
  }
  const arr = Array.isArray(rows) ? rows : [];
  return arr.find((r) => normalizeWa(String(r.no_wa || '')) === want) || null;
}

/** id_kandidat untuk tabel anak: dari body kalau ada, kalau tidak dari baris. */
async function idKandidatUntuk(id: string, body: Record<string, unknown>): Promise<string> {
  const dariBody = String(body.id_kandidat ?? '').trim();
  if (dariBody) return dariBody;
  const rows = await supabaseJson('GET', 'master_database_candidate', {
    query: { select: 'id_kandidat', id: `eq.${id}`, limit: '1' },
  });
  const row = Array.isArray(rows) ? rows[0] : null;
  return String(row?.id_kandidat ?? '').trim();
}

/**
 * @param pekerjaan Daftar riwayat kerja LENGKAP dari form (boleh lebih dari 3).
 *   `undefined`/`null` = pemanggil tidak punya daftar; tabel anak lalu diturunkan
 *   dari kolom slot, dan `syncPekerjaan` menolak menyusutkan daftar yang ada.
 */
export async function patchMaster(
  id: string,
  body: Record<string, any>,
  pekerjaan?: unknown[] | null,
): Promise<void> {
  // `writeBodyFor` membuang kolom yang tidak ada di kontrak skema dan mencatatnya
  // sebagai drift. Ia menggantikan `MASTER_COLUMN_MISSING` — daftar tangan yang
  // sudah basi (migrasi 019 MENAMBAH kolomnya, daftar itu tetap menghapus
  // nilainya). Menyaring di sini, bukan di pemanggil, berarti SEMUA penulis
  // master (form, CV AI, edit admin, pemberkasan) memakai satu penjaga.
  const resolved = writeBodyFor('master_database_candidate', body);
  await supabaseJson('PATCH', 'master_database_candidate', {
    query: { id: `eq.${id}` },
    body: resolved.body,
    headers: { Prefer: 'return=minimal' },
  });
  // Tabel anak ikut disinkronkan di SINI, bukan di tiap handler: sembilan titik
  // panggil menulis master, dan satu yang lupa akan membuat riwayat kerja
  // berbeda antara rirekisho dan form — persis kelas bug yang sedang dihapus.
  const idKandidat = await idKandidatUntuk(id, body);
  const eksplisit = Array.isArray(pekerjaan) ? { __pekerjaanLengkap: pekerjaan } : body;
  await syncPekerjaan(idKandidat, eksplisit, Array.isArray(pekerjaan));
}

export async function upsertMaster(
  body: Record<string, any>,
  pekerjaan?: unknown[] | null,
): Promise<void> {
  const resolved = writeBodyFor('master_database_candidate', body);
  await supabaseUpsert('master_database_candidate', resolved.body as typeof body, ['no_wa'], {
    headers: { Prefer: 'return=minimal' },
  });
  const idKandidat = String(body.id_kandidat ?? '').trim();
  if (idKandidat) {
    const eksplisit = Array.isArray(pekerjaan) ? { __pekerjaanLengkap: pekerjaan } : body;
    await syncPekerjaan(idKandidat, eksplisit, Array.isArray(pekerjaan));
  }
}

export async function findCandidateRow(wa: string): Promise<any | null> {
  let c = await findCandidateByWaFiltered(wa);
  if (c === undefined) {
    const found = await findCandidates();
    const want = normalizeWa(wa);
    c = found.rows.find((r) => normalizeWa(String(pick(r, ['no_wa', 'wa', 'whatsapp', 'telepon', 'phone', 'no_hp']) || '')) === want) || null;
  }
  return c;
}

export { normalizeWa, pick, toText, toDateOnly, normalizeBloodType, supabaseJson, supabaseUpsert, nextCandidateId, APPLY_WA_COLS };
