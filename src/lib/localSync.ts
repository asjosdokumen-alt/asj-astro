/**
 * localSync.ts — mesin local-first di atas mirror IndexedDB
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ALUR, DAN MENGAPA TIAP LANGKAH ADA
 * ═════════════════════════════════════════════════════════════════════════════
 * `apiClient` masih memakai sessionStorage 30 detik, yang berarti render
 * pertama SELALU menunggu jaringan. Mesin ini membuat render pertama membaca
 * mirror, lalu menyelesaikan perbedaan dengan SATU permintaan probe:
 *
 *   1. Mirror kosong           → tarik penuh (jalur baca lama), simpan, catat
 *                                watermark dari probe. Satu-satunya kali biaya
 *                                penuh dibayar.
 *   2. Watermark & jumlah SAMA → tidak ada yang berubah. Nol permintaan data,
 *                               hanya probe.
 *   3. Ada perbedaan           → delta (`gte`), lalu — HANYA kalau jumlah tidak
 *                               cocok — manifest.
 *
 * Yang TIDAK dilakukan sengaja:
 *
 *   - Delta tidak pernah dipakai untuk menggantikan pembacaan BERFILTER.
 *     `fetchKandidatFromAPI` menyaring di server (`saringKandidat`); mirror
 *     tidak tahu apa-apa soal filter itu, jadi memaksakan local-first di situ
 *     akan membuat layar menunjukkan baris yang sudah tidak cocok.
 *   - Delta tidak pernah dipakai untuk tabel yang kontraknya POSISIONAL.
 *     Mail inbox bekerja dengan `rowIndex` = `offset` di urutan
 *     `timestamp.desc`, dan posisi sebuah baris yang berubah hanya diketahui
 *     server. Mengira posisi itu dari delta berarti aksi admin bisa mengenai
 *     kandidat LAIN. Karena itu mail memakai jalur baca sendiri yang ringan.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * DUA HAL YANG MUDAH RUSAK TANPA TERLIHAT
 * ═════════════════════════════════════════════════════════════════════════════
 * 1. PENGHAPUSAN butuh JUMLAH SETELAH delta, bukan sebelum.
 *
 *    Watermark hanya menjawab "apa yang BERUBAH". Bandingkan jumlah lokal
 *    dengan jumlah server SEBELUM delta diterapkan: satu hapus + satu tambah
 *    menghasilkan jumlah yang sama, dan baris terhapus akan tinggal di mirror
 *    selamanya. Setelah delta diterapkan, tambahan sudah masuk hitungan lokal,
 *    jadi selisih yang tersisa memang penghapusan.
 *
 * 2. WATERMARK = watermark baris TERAKHIR yang dikirim, bukan waktu server.
 *
 *    Kalau jawaban dipotong `limit`, `nextSince` menunjuk baris terakhir yang
 *    benar-benar terkirim. Memakai waktu server akan melompati baris di
 *    antaranya — dan itu hilang tanpa suara.
 * ═════════════════════════════════════════════════════════════════════════════
 */
import type { LocalEntry, LocalTable } from './localStore';

/** Bentuk jawaban `syncProbe` yang dibaca mesin ini. */
export interface SyncProbeResponse {
  success?: boolean;
  error?: string;
  v?: number;
  tables?: Record<string, { count: number; watermark: string | null }>;
}

/** Satu halaman `syncDelta`. */
export interface SyncDeltaPage {
  success?: boolean;
  rows?: unknown[];
  nextSince?: string | null;
  more?: boolean;
  error?: string;
}

/** Jawaban `syncManifest`. */
export interface SyncManifestResponse {
  success?: boolean;
  manifest?: Array<{ id: string; updatedAt: string | null }>;
  error?: string;
}

/**
 * Transport: satu-satunya tempat mesin ini menyentuh jaringan.
 *
 * Dipisah supaya tes bisa memakai transport tiruan DAN supaya aplikasi bisa
 * mengganti jalur baca penuh (loop `getCandidatesPage`, `getAppData`, …) tanpa
 * mengubah mesin. `full()` hanya dipakai ketika mirror kosong.
 */
export interface SyncTransport<T> {
  /** Nama tabel — kunci di jawaban probe. */
  readonly table: string;
  probe(): Promise<SyncProbeResponse>;
  delta(since: string): Promise<SyncDeltaPage>;
  manifest(): Promise<SyncManifestResponse>;
  /** Tarik penuh. Urutan & kelengkapannya adalah urusan jalur baca aplikasi. */
  full(): Promise<T[]>;
  /** Kunci baris — dipakai upsert dan perbandingan manifest. */
  keyOf(row: T): string;
}

export interface SyncStats {
  /** Dari mana baris yang dikembalikan berasal. */
  source: 'local' | 'network' | 'local-offline';
  localAtStart: number;
  /** Baris yang diterapkan (upsert). Delta inklusif berarti ini menghitung
   *  juga pengiriman ulang baris ber-watermark sama — bukan "baris baru". */
  applied: number;
  deleted: number;
  pages: number;
  probeUsed: boolean;
  deltaUsed: boolean;
  manifestUsed: boolean;
  /** true kalau mirror tidak tahan reload (peramban tanpa IndexedDB). */
  volatile: boolean;
  /** Diisi kalau salah satu langkah gagal; baris lokal tetap dikembalikan. */
  error?: string;
}

export interface SyncResult<T> {
  rows: T[];
  stats: SyncStats;
}

/**
 * Baca local-first: kembalikan baris secepat mungkin, rekonsiliasi di belakang.
 *
 * `onLocal` dipanggil dengan baris mirror SEBELUM permintaan jaringan apa pun
 * (selagi mirror ada isinya) supaya pemanggil bisa langsung merender. Kalau
 * rekonsiliasi mengubah sesuatu, `onUpdate` dipanggil dengan baris final.
 */
export async function localFirst<T>(
  table: LocalTable,
  transport: SyncTransport<T>,
  opts: {
    onLocal?: (rows: T[]) => void;
    onUpdate?: (rows: T[]) => void;
    /** Lewati pemeriksaan "tidak berubah" — dipakai setelah operasi tulis. */
    force?: boolean;
  } = {},
): Promise<SyncResult<T>> {
  const stats: SyncStats = {
    source: 'local',
    localAtStart: 0,
    applied: 0,
    deleted: 0,
    pages: 0,
    probeUsed: false,
    deltaUsed: false,
    manifestUsed: false,
    volatile: !table.durable,
  };

  const local = await table.all();
  const localRows = local.map((e) => e.row as T);
  const localWatermark = await table.watermark();
  stats.localAtStart = localRows.length;

  // Watermark kosong = tabel ini belum pernah disinkronkan, jadi delta tidak
  // punya titik awal. Tarik penuh; itu memang satu-satunya kali biaya penuh
  // dibayar.
  //
  // Sengaja BUKAN "mirror kosong": tabel yang benar-benar nol baris juga
  // menghasilkan mirror kosong, tapi watermarksnya ADA. Mengira itu "belum
  // pernah disinkronkan" akan menarik penuh setiap kali tabel kosong — dan
  // tabel kosong justru kasus paling sering untuk instance baru.
  if (!localWatermark) {
    try {
      const fresh = await pullFull(table, transport, stats);
      stats.source = 'network';
      opts.onUpdate?.(fresh);
      return { rows: fresh, stats };
    } catch (e) {
      stats.error = (e as Error).message || 'full read failed';
      // Tarik penuh gagal. Kalau mirror tadi ada isinya, pakai itu; kalau
      // tidak, lempar supaya pemanggil memperlihatkan galatnya sendiri.
      if (localRows.length > 0) {
        stats.source = 'local-offline';
        opts.onLocal?.(localRows);
        return { rows: localRows, stats };
      }
      throw e;
    }
  }

  opts.onLocal?.(localRows);

  // --- probe: satu permintaan, menjawab "ada yang berubah?" -----------------
  let probe: SyncProbeResponse;
  try {
    probe = await transport.probe();
  } catch (e) {
    // Jaringan mati. Mirror tetap benar sampai pembaca berikutnya, dan
    // aplikasi tidak boleh menampilkan layar kosong gara-gara probe gagal.
    stats.source = 'local-offline';
    stats.error = (e as Error).message || 'probe failed';
    return { rows: localRows, stats };
  }
  stats.probeUsed = true;
  const srv = probe.tables?.[transport.table];
  if (!probe.success || !srv) {
    // Jawaban probe tidak memuat tabel ini (bentuk jawaban tidak dikenal, atau
    // tabel tak terjangkau). Jangan menebak: sajikan mirror.
    stats.source = 'local';
    stats.error = probe.error || 'probe: table missing';
    return { rows: localRows, stats };
  }

  if (srv.watermark === localWatermark && srv.count === localRows.length && !opts.force) {
    stats.source = 'local';
    return { rows: localRows, stats };
  }

  // --- delta: SATU halaman --------------------------------------------------
  // Tidak ada loop halaman, dan itu keputusan yang disengaja. Paging butuh
  // kursor komposit (`updated_at`, kunci) supaya baris ber-watermark SAMA tidak
  // terkirim dua kali — migrasi 017 memberi 226 kandidat SATU nilai
  // `updated_at`, jadi halaman kedua akan mengembalikan halaman pertama lagi,
  // selamanya. Server karena itu menjawab `more: true` hanya untuk mengatakan
  // "yang berubah lebih banyak daripada satu halaman", dan jawaban itu
  // ditangani dengan tarik penuh di bawah — bukan dengan loop.
  const byKey = new Map<string, T>();
  for (const r of localRows) byKey.set(transport.keyOf(r), r);
  let lastWatermark = localWatermark;

  try {
    const res = await transport.delta(localWatermark);
    stats.deltaUsed = true;
    if (!res.success) throw new Error(res.error || 'delta failed');
    stats.pages = 1;
    for (const raw of Array.isArray(res.rows) ? res.rows : []) {
      const row = raw as T;
      byKey.set(transport.keyOf(row), row);
      stats.applied++;
    }
    if (res.nextSince) lastWatermark = res.nextSince;

    if (res.more) {
      // Lebih banyak perubahan daripada satu halaman: pertahankan watermark
      // lama dan tarik penuh. Menggeser watermark ke halaman pertama akan
      // membuat sisa baris itu tidak pernah terkirim — count memang akan
      // berbeda, tapi manifest hanya menjawab KUNCI, bukan ISI baris.
      stats.source = 'network';
      const fresh = await pullFull(table, transport, stats);
      opts.onUpdate?.(fresh);
      return { rows: fresh, stats };
    }
  } catch (e) {
    stats.error = (e as Error).message || 'delta failed';
    // Simpan apa pun yang sudah masuk — termasuk hasil setengah jalan. Baris
    // yang tidak sempat terkirim akan terkirim di percobaan berikutnya karena
    // watermark TIDAK ikut maju saat delta gagal.
    await table.putMany(Array.from(byKey.values()).map((r) => toEntry(transport.keyOf(r), r)));
    const partial = await table.all();
    stats.source = 'local';
    return { rows: partial.map((e) => e.row as T), stats };
  }

  await table.putMany(Array.from(byKey.values()).map((r) => toEntry(transport.keyOf(r), r)));

  // --- penghapusan: HANYA kalau jumlah tidak cocok setelah delta ------------
  // `byKey.size` sudah termasuk baris tambahan dari delta, jadi selisih yang
  // tersisa memang penghapusan. Membandingkan SEBELUM delta akan menyembunyikan
  // pasangan hapus+tambah.
  if (srv.count !== byKey.size) {
    try {
      const man = await transport.manifest();
      stats.manifestUsed = true;
      const live = new Set((man.manifest || []).map((m) => String(m.id)));
      const stale: string[] = [];
      for (const k of Array.from(byKey.keys())) {
        if (!live.has(k)) stale.push(k);
      }
      if (stale.length > 0) {
        await table.deleteKeys(stale);
        stats.deleted = stale.length;
      }
    } catch (e) {
      // Manifest gagal: pertahankan mirror apa adanya. Menghapus berdasarkan
      // jumlah saja akan membuang baris yang sebenarnya masih ada.
      stats.error = (e as Error).message || 'manifest failed';
    }
  }

  await table.setWatermark(lastWatermark);

  // Baca ulang mirror sebagai kebenaran: kalau manifest menghapus baris,
  // `byKey` di memori masih memuatnya, dan yang dikirim ke layar harus sama
  // dengan yang tersimpan.
  const final = await table.all();
  const rowsOut = final.map((e) => e.row as T);
  stats.source = 'local';
  opts.onUpdate?.(rowsOut);
  return { rows: rowsOut, stats };
}

/** Baris mirror: kuncinya, isinya, dan watermark kolom `updated_at`-nya. */
function toEntry(key: string, row: unknown): LocalEntry {
  const updatedAt =
    row && typeof row === 'object' && typeof (row as { updated_at?: unknown }).updated_at === 'string'
      ? (row as { updated_at: string }).updated_at
      : null;
  return { key, row, updatedAt };
}

/**
 * Tarik penuh lewat jalur baca aplikasi, lalu simpan sebagai mirror.
 *
 * Watermark diambil dari PROBE, bukan dari baris: menjadikan watermark dari
 * data yang baru dibaca akan melewati baris yang berubah di antara probe dan
 * tarikan penuh. Kalau probe gagal, watermark dibiarkan kosong — tarikan
 * berikutnya akan mendelta dari awal, yang berbiaya beberapa byte dan tidak
 * pernah melewati baris.
 */
async function pullFull<T>(
  table: LocalTable,
  transport: SyncTransport<T>,
  stats: SyncStats,
): Promise<T[]> {
  let watermark: string | null = null;
  try {
    const probe = await transport.probe();
    stats.probeUsed = true;
    watermark = probe.tables?.[transport.table]?.watermark ?? null;
  } catch {
    watermark = null;
  }
  const rows = await transport.full();
  if (rows.length === 0) {
    throw new Error('full read returned no rows');
  }
  await table.putMany(rows.map((r) => toEntry(transport.keyOf(r), r)));
  await table.setWatermark(watermark);
  return rows;
}
