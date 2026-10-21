/**
 * contexts/sync/service.ts — Handler probe & delta untuk store lokal-first
 *
 * Tiga aksi, SEMUA khusus admin (requireAdmin). Alasannya bukan formalitas:
 * delta membaca SELURUH isi tabel, bukan baris milik satu WA. Jalur kandidat
 * tetap `getAppData` yang memang sudah memfilter per WA.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ATURAN BATAS YANG MUSTI DIPATUHI (dan mengapa)
 * ═════════════════════════════════════════════════════════════════════════════
 * 1. BATAS INKLUSIF (`gte`, bukan `gt`), dan klien dedupe menurut kunci.
 *
 *    Dua baris bisa punya `updated_at` yang SAMA PERSIS — apalagi baris lama
 *    yang kolom waktunya baru dibuat (migrasi 017): 159 job berbagi satu nilai
 *    sampai seseorang menyentuh salah satunya. Dengan `gt`, klien yang
 *    menyimpan watermark dari jawaban sebelumnya akan MELOMPATI setiap baris
 *    yang nilainya sama dengan watermark itu. Dengan `gte`, baris itu terkirim
 *    ulang dan dedupe menurut kunci membuang duplikatnya. Kesalahan ke arah
 *    "kirim ulang" hanya berbiaya beberapa byte; kesalahan ke arah "lewati"
 *    berarti baris hilang dari UI tanpa cara mengetahui.
 *
 * 2. PENGHAPUSAN TIDAK BISA dideteksi dari watermark.
 *
 *    Watermark hanya menjawab "apa yang BERUBAH". Baris yang dihapus tidak
 *    mengubah watermark siapa pun dan tidak muncul di delta mana pun — jadi
 *    tanpa langkah tambahan ia akan tinggal di store lokal SELAMANYA. Karena
 *    itu ada DUA mekanisme, dan keduanya dipakai:
 *      - `syncProbe` mengembalikan JUMLAH baris. Jumlah lokal ≠ jumlah server
 *        ⇒ ada penghapusan ⇒ klien minta manifest.
 *      - `syncManifest` mengembalikan pasangan (kunci, watermark) untuk SEMUA
 *        baris. Klien membandingkan kunci lokal vs manifest: yang tidak ada di
 *        manifest itu yang dihapus.
 *    Jumlah saja tidak cukup — satu hapus + satu tambah menghasilkan jumlah
 *    yang sama. Manifest yang menutup celah itu, dan ia hanya ditarik ketika
 *    jumlahnya memang berbeda.
 *
 * 3. BARIS DIKEMBALIKAN SUDAH DIDEKORASI, bukan mentah.
 *
 *    Dekorator yang dipakai PERSIS yang dipakai jalur baca (`mapJob`,
 *    `mapCandidate` + `stripRaw`), supaya bentuk yang disimpan klien sama
 *    dengan bentuk yang sudah ia render. Dekorator terpisah akan jadi sumber
 *    kebenaran kedua, dan itu persis cacat yang mau dihindari.
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { requireAdmin } from '../identity';
import { guardPayload, text, optionalTextOrEmpty } from '../../_lib/kernel/guard';
import { mapJob, mapCandidate, stripRaw } from '../catalog/repository';
import {
  SYNC_TABLES, SYNC_LIMIT, isSyncKey,
  syncWatermarks, syncRowsSince, syncManifest,
} from './repository';

/** Ringkas: apa yang berubah, dan berapa banyak isi tiap tabel. */
export async function handleSyncProbe(payload: unknown[], sessionToken?: string) {
  const gate = requireAdmin(sessionToken || '');
  if ('error' in gate) return gate.error;
  // Payload probe memang KOSONG, dan `guardPayload` menolak payload kosong
  // (ia wajib 1..n argumen). Jadi pemeriksaannya ditulis eksplisit di sini:
  // probe menerima nol argumen, dan menolak argumen berlebih alih-alih
  // mengabaikannya diam-diam — klien yang mengirim sesuatu berarti mengira ada
  // opsi yang tidak ada.
  if (Array.isArray(payload) && payload.length > 0) {
    return { success: false, error: 'syncProbe tidak menerima argumen.' };
  }
  try {
    const tables = await syncWatermarks();
    return {
      success: true,
      // Versi bentuk jawaban. Klien yang melihat versi yang tidak dikenal
      // mengabaikan probe dan memakai jalur penuh — bukan melempar.
      v: 1,
      limit: SYNC_LIMIT,
      tables,
    };
  } catch (e) {
    return { success: false, error: (e as Error).message || 'Probe gagal' };
  }
}

/** Baris yang berubah sejak `since`, sudah didekorasi sesuai jalur baca. */
export async function handleSyncDelta(payload: unknown[], sessionToken?: string) {
  const gate = requireAdmin(sessionToken || '');
  if ('error' in gate) return gate.error;

  // `since` sengaja BUKAN `text(...)` — dan `optionalText` juga tidak cukup:
  // keduanya MELEMPAR untuk string kosong, sehingga kasus "klien belum punya
  // watermark" akan menjadi 400 alih-alih jawaban jujur yang menyuruhnya
  // menarik penuh. Ini jebakan "optional vs blank" yang sama seperti
  // `updateDokumenShare` ('' untuk MENGOSONGKAN daftar): di sini string kosong
  // bukan nilai yang sah, TAPI ia harus sampai ke pemeriksaan di bawah supaya
  // pesannya berguna, bukan jadi 400 tanpa penjelasan.
  const [tableRaw, sinceRaw, limitRaw] = guardPayload(payload, [
    text('tabel', 32),
    optionalTextOrEmpty('sejak', 40),
    // 6 karakter: cukup untuk "99999". Panjangnya dibatasi supaya string
    // sampah tidak masuk ke parseInt; NILAINYA tetap dijepit di bawah.
    optionalTextOrEmpty('batas', 6),
  ]) as [string, string, string];

  if (!isSyncKey(tableRaw)) {
    return { success: false, error: `Tabel tidak dikenal: ${tableRaw}` };
  }
  // Tanpa `since`, delta tidak punya arti. Klien yang belum pernah menyimpan
  // watermark HARUS menarik penuh dulu (`getAppData`) — jawabannya jujur,
  // bukan diam-diam mengembalikan seluruh tabel dan dipanggil "delta".
  if (!sinceRaw) {
    return { success: false, error: 'Parameter "sejak" wajib diisi.' };
  }
  const limit = Math.min(Math.max(parseInt(limitRaw || '', 10) || SYNC_LIMIT, 1), SYNC_LIMIT);

  try {
    const rows = await syncRowsSince(tableRaw, sinceRaw);
    if (!Array.isArray(rows)) return { success: true, rows: [], nextSince: null };

    const decorated = rows.slice(0, limit).map((r) => decorate(tableRaw, r));
    // `nextSince` = watermark baris TERAKHIR yang dikirim, bukan serverNow().
    // Kalau dipotong oleh limit, klien melanjutkan dari situ — serverNow()
    // akan melompati baris yang belum terkirim.
    const last = rows[Math.min(limit, rows.length) - 1];
    return {
      success: true,
      table: tableRaw,
      rows: decorated,
      count: decorated.length,
      nextSince: last?.updated_at || null,
      // 🔴 `more: true` berarti "yang berubah LEBIH BANYAK daripada satu
      //    halaman", dan klien DILARANG meng-loop halaman.
      //
      //    Paging butuh kursor komposit (updated_at, kunci) supaya baris
      //    ber-watermark SAMA tidak terkirim dua kali — dan migrasi 017 memberi
      //    226 baris `database_candidate` SATU nilai `updated_at` yang sama.
      //    Dengan cursor satu kolom, halaman kedua akan mengembalikan halaman
      //    pertama lagi, selamanya. Karena itu jawaban ini TIDAK dipaginasi:
      //    yang berubah melebihi limit ditarik PENUH oleh klien (`full()`),
      //    yang sekaligus menegakkan ulang watermark dari probe.
      more: rows.length >= limit,
    };
  } catch (e) {
    return { success: false, error: (e as Error).message || 'Delta gagal' };
  }
}

/** Pasangan (kunci, watermark) untuk SELURUH baris — dipakai saat ada hapus. */
export async function handleSyncManifest(payload: unknown[], sessionToken?: string) {
  const gate = requireAdmin(sessionToken || '');
  if ('error' in gate) return gate.error;

  const [tableRaw] = guardPayload(payload, [text('tabel', 32)]) as [string];
  if (!isSyncKey(tableRaw)) {
    return { success: false, error: `Tabel tidak dikenal: ${tableRaw}` };
  }

  try {
    const rows = await syncManifest(tableRaw);
    const { key: k } = SYNC_TABLES[tableRaw];
    const manifest = Array.isArray(rows)
      ? rows.map((r) => ({ id: String(r[k]), updatedAt: r.updated_at || null }))
      : [];
    return { success: true, table: tableRaw, manifest, count: manifest.length };
  } catch (e) {
    return { success: false, error: (e as Error).message || 'Manifest gagal' };
  }
}

/** Dekorasi satu baris dengan fungsi yang SAMA dengan jalur baca. */
function decorate(table: string, row: Record<string, unknown>): Record<string, unknown> {
  if (table === 'jobs') {
    const j = mapJob(row);
    return { ...j, code: j.code || String(row.code_job || '') };
  }
  if (table === 'candidates') {
    return stripRaw([mapCandidate(row) as Record<string, unknown>])[0];
  }
  if (table === 'master') {
    // Proyeksi ringan sudah dilakukan di repository (`SYNC_SELECT.master` =
    // 11 kolom, bukan 169). Dekorasinya identitas — jadi cukup diteruskan.
    return { ...row };
  }
  // forms: draf CV master apa adanya. Bentuknya sudah kecil dan belum punya
  // dekorator tersendiri di jalur baca (dibalut `allForms` mentah).
  return { ...row };
}
