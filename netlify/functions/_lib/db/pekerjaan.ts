/**
 * _lib/db/pekerjaan.ts — SATU pintu untuk riwayat kerja (`candidate_pekerjaan`).
 *
 * KENAPA BERKAS INI ADA
 *   Sebelum 2026-11-03 satu fakta pekerjaan hidup di empat tempat: kolom
 *   `pekerjaan_1..3_*`, `ai_data_json.pekerjaan[]`, `database_candidate`, dan
 *   `riwayat_pekerjaan_json` (yang tidak dibaca siapa pun). Terukur 70 entri
 *   tapi 65 unik, dengan `masuk` dan `tahun_masuk` saling bertentangan di dalam
 *   satu objek JSON. Setiap jalur simpan harus mengingat keempatnya.
 *
 *   Sekarang tabel `candidate_pekerjaan` adalah sumbernya, dan berkas ini
 *   pemegang satu-satunya aturan normalisasi. Pemanggil TIDAK boleh menulis
 *   tabel itu langsung: urutan, dedupe, dan pemetaan ejaan hidup di sini.
 *
 * ATURAN
 *   1. Baris tanpa nama perusahaan DIBUANG — kolomnya NOT NULL + CHECK.
 *   2. Duplikat = nama perusahaan sama (tanpa beda huruf besar/spasi) DAN tahun
 *      masuk sama. Itu kunci yang sama dengan UNIQUE INDEX di DB, jadi apa yang
 *      lolos di sini pasti lolos di sana.
 *   3. `masuk` menang atas `tahun_masuk` bila keduanya berbeda: `normalizeRiwayat`
 *      dan `sortRiwayatKronologis` membaca `masuk` lebih dulu, jadi memilih yang
 *      lain akan membuat urutan cetak berbeda dari yang tersimpan.
 *   4. Urutan = kronologis (tahun masuk naik); baris tanpa tahun diletakkan di
 *      akhir, mempertahankan urutan aslinya.
 */

import { supabaseJson } from './client';
import { log } from '../kernel/log';

export interface PekerjaanInput {
  perusahaan: string;
  perusahaan_jp: string | null;
  jabatan: string | null;
  jabatan_jp: string | null;
  tahun_masuk: string | null;
  tahun_keluar: string | null;
  gaji: string | null;
  jenis: string | null;
  bidang: string | null;
  catatan: string | null;
}

export interface PekerjaanRow extends PekerjaanInput {
  urutan: number;
}

const TEXT_KEYS = [
  'perusahaan', 'perusahaan_jp', 'jabatan', 'jabatan_jp',
  'tahun_masuk', 'tahun_keluar', 'gaji', 'jenis', 'bidang', 'catatan',
] as const;

function bersih(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return s === '' || s === '-' ? null : s;
}

function ambil(o: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = bersih(o[k]);
    if (v) return v;
  }
  return null;
}

/** Kunci duplikat — HARUS sama dengan UNIQUE INDEX di DB. */
export function kunciPekerjaan(p: Pick<PekerjaanInput, 'perusahaan' | 'tahun_masuk'>): string {
  const nama = String(p.perusahaan ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return `${nama}|${p.tahun_masuk ?? ''}`;
}

function tahunDari(s: string | null): number | null {
  const m = /(\d{4})/.exec(String(s ?? ''));
  return m ? Number(m[1]) : null;
}

/**
 * Rapikan daftar dari mana pun asalnya (form CV AI, ekstraksi AI, kolom slot).
 * Idempoten: memberi hasil yang sama untuk masukan yang sama.
 */
export function normalizePekerjaan(raw: unknown): PekerjaanInput[] {
  const list = Array.isArray(raw) ? raw : [];
  const terlihat = new Set<string>();
  const out: PekerjaanInput[] = [];

  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;

    const perusahaan = ambil(o, 'perusahaan', 'nama_perusahaan', 'perusahaan_id', 'namaPt', 'namaPerusahaan');
    if (!perusahaan) continue;

    const p: PekerjaanInput = {
      perusahaan,
      perusahaan_jp: ambil(o, 'perusahaan_jp', 'nama_perusahaan_jp'),
      jabatan: ambil(o, 'jabatan', 'jabatan_id', 'posisi'),
      jabatan_jp: ambil(o, 'jabatan_jp'),
      tahun_masuk: ambil(o, 'masuk', 'tahun_masuk', 'tahunMasuk'),
      tahun_keluar: ambil(o, 'keluar', 'tahun_keluar', 'tahunKeluar'),
      gaji: ambil(o, 'gaji', 'pendapatan'),
      jenis: ambil(o, 'jenis', 'jenis_pekerjaan', 'status_kerja'),
      bidang: ambil(o, 'bidang', 'industri'),
      catatan: ambil(o, 'catatan', 'keterangan'),
    };

    const k = kunciPekerjaan(p);
    if (terlihat.has(k)) continue;
    terlihat.add(k);
    out.push(p);
  }

  // Kronologis; yang tanpa tahun tetap di akhir dengan urutan aslinya.
  return out
    .map((p, i) => ({ p, i, y: tahunDari(p.tahun_masuk) }))
    .sort((a, b) => {
      if (a.y === null && b.y === null) return a.i - b.i;
      if (a.y === null) return 1;
      if (b.y === null) return -1;
      if (a.y !== b.y) return a.y - b.y;
      return a.i - b.i;
    })
    .map((x) => x.p);
}

/** Ambil daftar dari kolom slot `pekerjaan_1..3_*` pada satu body/row. */
export function pekerjaanDariSlot(row: Record<string, unknown>): PekerjaanInput[] {
  const list: Record<string, unknown>[] = [];
  for (let i = 1; i <= 3; i++) {
    const nama = row[`pekerjaan_${i}_nama_perusahaan`];
    if (nama === undefined || nama === null || String(nama).trim() === '') continue;
    list.push({
      perusahaan: nama,
      perusahaan_jp: row[`pekerjaan_${i}_perusahaan_jp`],
      jabatan: row[`pekerjaan_${i}_jabatan`],
      jabatan_jp: row[`pekerjaan_${i}_jabatan_jp`],
      tahun_masuk: row[`pekerjaan_${i}_tahun_masuk`],
      tahun_keluar: row[`pekerjaan_${i}_tahun_keluar`],
      gaji: row[`pekerjaan_${i}_gaji`],
      jenis: row[`pekerjaan_${i}_jenis`],
      bidang: row[`pekerjaan_${i}_bidang`],
      catatan: row[`pekerjaan_${i}_catatan`],
    });
  }
  return normalizePekerjaan(list);
}

/** Baca riwayat satu kandidat, urut tersimpan. */
export async function fetchCandidatePekerjaan(idKandidat: string): Promise<PekerjaanRow[]> {
  if (!idKandidat) return [];
  const rows = await supabaseJson('GET', 'candidate_pekerjaan', {
    query: {
      select: `urutan,${TEXT_KEYS.join(',')}`,
      id_kandidat: `eq.${idKandidat}`,
      order: 'urutan.asc',
      limit: '100',
    },
  });
  return Array.isArray(rows) ? (rows as PekerjaanRow[]) : [];
}

/**
 * Ganti SELURUH riwayat satu kandidat, satu transaksi (RPC 034).
 *
 * Atomik dengan sengaja: hapus-lalu-tulis lewat dua permintaan REST bisa
 * kehilangan data kalau INSERT gagal setelah DELETE berhasil, dan menukar urutan
 * tidak bisa diselesaikan dengan upsert per slot karena bentrok UNIQUE.
 *
 * @returns jumlah baris yang tertulis.
 */
export async function replaceCandidatePekerjaan(
  idKandidat: string,
  list: unknown,
): Promise<number> {
  const rows = normalizePekerjaan(list);
  const hasil = await supabaseJson('POST', 'rpc/replace_candidate_pekerjaan', {
    body: { p_id_kandidat: idKandidat, p_rows: rows },
  });
  return typeof hasil === 'number' ? hasil : rows.length;
}

/**
 * Sinkronkan tabel anak dari sebuah body tulis master.
 *
 * `lengkap` = body memuat daftar LENGKAP (bukan tambalan parsial). Hanya kalau
 * itu benar, daftar kosong boleh menghapus semua baris — pemanggil yang hanya
 * mengirim sebagian kolom tidak boleh menghapus riwayat yang masih ada.
 *
 * TIDAK PERNAH melempar: kegagalan sinkronisasi dicatat, karena menggagalkan
 * simpan CV hanya karena tabel turunan bermasalah akan membuat kandidat
 * kehilangan seluruh isiannya.
 */
export async function syncPekerjaan(
  idKandidat: string,
  body: Record<string, unknown>,
  lengkap: boolean,
): Promise<void> {
  if (!idKandidat) return;
  try {
    const eksplisit = Array.isArray(body.__pekerjaanLengkap)
      ? (body.__pekerjaanLengkap as unknown[])
      : null;
    const daftar = eksplisit ?? pekerjaanDariSlot(body);

    // Tanpa daftar eksplisit DAN tanpa slot terisi, ini tambalan parsial:
    // jangan sentuh apa pun.
    if (!eksplisit && daftar.length === 0) return;
    if (!lengkap && daftar.length === 0) return;

    /* JANGAN MEMANGKAS TANPA DAFTAR LENGKAP.
       Beberapa jalur menulis slot sebagian: `contexts/ingestion` mengisi HANYA
       `pekerjaan_1_nama_perusahaan` dari satu string hasil parsing CV. Kalau
       daftar turunan slot (1 baris) menggantikan riwayat yang sudah punya 5,
       empat baris hilang tanpa error. Karena itu penggantian yang MENYUSUT hanya
       boleh terjadi lewat daftar eksplisit, yang berarti pemanggil menyatakan
       "ini daftar lengkap". */
    if (!eksplisit) {
      const ada = await fetchCandidatePekerjaan(idKandidat);
      if (daftar.length < ada.length) {
        log.info('pekerjaan.skip-shrink', { idKandidat, slot: daftar.length, tersimpan: ada.length });
        return;
      }
    }

    await replaceCandidatePekerjaan(idKandidat, daftar);
  } catch (err) {
    log.warn('pekerjaan.sync-failed', { idKandidat, err: String(err) });
  }
}
