/**
 * _lib/notifikasi/kotak-masuk.ts — SISI BACA/TULIS kotak masuk kandidat.
 *
 * KENAPA DIPISAH DARI `kandidat.ts`
 * ---------------------------------
 * `kandidat.ts` mengirim push, jadi ia menyeret `fcm-helpers` + `fcm-server`.
 * Endpoint yang hanya MEMBACA kotak masuk tidak butuh kemampuan mengirim.
 * Terukur 2026-11-06: `notify.js` 91,7 → 127,4 KB setelah tiga action baca
 * ditambahkan, semata karena satu modul menanggung dua pekerjaan.
 *
 * Pembagiannya:
 *   kotak-masuk.ts  → validasi, tulis baris, daftar, tandai dibaca (DB saja)
 *   kandidat.ts     → tulis baris LALU kirim push (memakai berkas ini)
 *
 * Aturan yang tidak boleh bercabang: `JENIS_NOTIFIKASI` harus sama dengan CHECK
 * constraint migrasi 049. Kalau berbeda, penulisan ditolak DB dan
 * pemberitahuannya hilang tanpa jejak.
 */

import { normalizeWa, supabaseJson } from '../db/client';

export const JENIS_NOTIFIKASI = ['lamaran', 'dokumen', 'jadwal', 'sistem'] as const;
export type JenisNotifikasi = (typeof JENIS_NOTIFIKASI)[number];

export const JUDUL_MAKS = 120;
export const ISI_MAKS = 500;

export function jenisNotifikasiSah(v: unknown): v is JenisNotifikasi {
  return typeof v === 'string' && (JENIS_NOTIFIKASI as readonly string[]).includes(v);
}

export function potong(v: unknown, maks: number): string {
  return String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maks);
}

/**
 * URL tujuan klik. HANYA path relatif — bukan URL absolut.
 *
 * Notifikasi bisa memuat teks yang berasal dari data (nama loker, alasan admin).
 * Kalau nilai itu bisa menjadi URL absolut, satu baris data yang salah bisa
 * mengirim siswa ke domain lain. Path relatif menutup jalur itu tanpa
 * mengurangi fungsi: semua tujuan memang ada di origin yang sama.
 */
export function urlAman(v: unknown): string {
  const s = String(v ?? '').trim();
  if (!s.startsWith('/') || s.startsWith('//')) return '/candidate';
  return s.slice(0, 300);
}

export interface InputNotifikasi {
  wa: string;
  jenis: JenisNotifikasi | string;
  judul: string;
  isi?: string;
  url?: string;
}

/** Baris yang sudah divalidasi dan dinormalisasi, siap ditulis. */
export interface BarisBaru {
  wa: string;
  jenis: JenisNotifikasi;
  judul: string;
  isi: string;
  url: string;
}

/**
 * Validasi + normalisasi SEBELUM menyentuh DB. `null` = ditolak.
 * Dipisah supaya pemanggil bisa memutuskan lebih awal tanpa round-trip.
 */
export function siapkan(input: InputNotifikasi): BarisBaru | null {
  const wa = normalizeWa(String(input.wa ?? ''));
  if (!wa) return null;
  if (!jenisNotifikasiSah(input.jenis)) return null;
  const judul = potong(input.judul, JUDUL_MAKS);
  if (!judul) return null;
  return {
    wa,
    jenis: input.jenis,
    judul,
    isi: potong(input.isi, ISI_MAKS),
    url: urlAman(input.url),
  };
}

/** Sama seperti `siapkan`, untuk pemberitahuan yang ditujukan ke BANYAK siswa. */
export function siapkanDasar(
  input: Omit<InputNotifikasi, 'wa'>,
): Omit<BarisBaru, 'wa'> | null {
  if (!jenisNotifikasiSah(input.jenis)) return null;
  const judul = potong(input.judul, JUDUL_MAKS);
  if (!judul) return null;
  return {
    jenis: input.jenis,
    judul,
    isi: potong(input.isi, ISI_MAKS),
    url: urlAman(input.url),
  };
}

/** Tulis satu baris. TIDAK mengirim push — itu tugas `kandidat.ts`. */
export async function tulisSatu(baris: BarisBaru): Promise<{ success: boolean; id?: number }> {
  try {
    const rows = await supabaseJson('POST', 'notifikasi_kandidat', {
      body: { no_wa: baris.wa, jenis: baris.jenis, judul: baris.judul, isi: baris.isi, url: baris.url },
      headers: { Prefer: 'return=representation' },
    });
    const id = Array.isArray(rows) && rows[0] ? Number((rows[0] as { id?: unknown }).id) : undefined;
    return { success: true, id };
  } catch {
    return { success: false };
  }
}

/**
 * Tulis baris yang SAMA untuk banyak kandidat.
 *
 * Satu POST berisi array, bukan N POST: jadwal bisa berisi 30 kandidat dan
 * cron berjalan tiap 10 menit — 30 round-trip berurutan menahan slot fungsi
 * jauh lebih lama daripada satu permintaan.
 */
export async function tulisBanyak(
  waList: string[],
  dasar: Omit<BarisBaru, 'wa'>,
): Promise<{ success: boolean; jumlah: number; wa: string[] }> {
  const unik = Array.from(new Set(waList.map((w) => normalizeWa(String(w || ''))).filter(Boolean)));
  if (unik.length === 0) return { success: true, jumlah: 0, wa: [] };
  try {
    await supabaseJson('POST', 'notifikasi_kandidat', {
      body: unik.map((wa) => ({
        no_wa: wa,
        jenis: dasar.jenis,
        judul: dasar.judul,
        isi: dasar.isi,
        url: dasar.url,
      })),
      headers: { Prefer: 'return=minimal' },
    });
    return { success: true, jumlah: unik.length, wa: unik };
  } catch {
    return { success: false, jumlah: 0, wa: [] };
  }
}

export interface BarisNotifikasi {
  id: number;
  jenis: string;
  judul: string;
  isi: string;
  url: string;
  dibaca_pada: string | null;
  dibuat_pada: string;
}

/**
 * Daftar kotak masuk + jumlah belum dibaca.
 *
 * Dua permintaan, bukan satu: `belumDibaca` dihitung dari SELURUH baris belum
 * dibaca, sedangkan daftar dibatasi `limit`. Menghitung dari daftar yang
 * terpotong akan menampilkan badge "3" padahal ada 12 — badge yang berbohong
 * lebih buruk daripada tidak ada badge.
 */
export async function daftarNotifikasi(
  waMentah: string,
  limit = 50,
): Promise<{ success: boolean; notifikasi: BarisNotifikasi[]; belumDibaca: number }> {
  const wa = normalizeWa(String(waMentah ?? ''));
  if (!wa) return { success: false, notifikasi: [], belumDibaca: 0 };
  const n = Math.min(Math.max(Number(limit) || 50, 1), 200);
  try {
    const rows = await supabaseJson('GET', 'notifikasi_kandidat', {
      query: {
        select: 'id,jenis,judul,isi,url,dibaca_pada,dibuat_pada',
        no_wa: `eq.${wa}`,
        order: 'dibuat_pada.desc',
        limit: String(n),
      },
    });
    const belum = await supabaseJson('GET', 'notifikasi_kandidat', {
      query: { select: 'id', no_wa: `eq.${wa}`, dibaca_pada: 'is.null', limit: '1000' },
    });
    return {
      success: true,
      notifikasi: Array.isArray(rows) ? (rows as BarisNotifikasi[]) : [],
      belumDibaca: Array.isArray(belum) ? belum.length : 0,
    };
  } catch {
    return { success: false, notifikasi: [], belumDibaca: 0 };
  }
}

/**
 * Hapus satu baris. Tanpa `id`, yang dihapus adalah semua baris yang SUDAH
 * DIBACA — "bersihkan kotak masuk" tanpa menyentuh yang belum dibaca.
 *
 * `no_wa` selalu ikut disaring (sama seperti `tandaiDibaca`): satu siswa tidak
 * bisa menghapus baris milik siswa lain walaupun tahu id-nya.
 */
export async function hapusNotifikasi(
  waMentah: string,
  id?: unknown,
): Promise<{ success: boolean; jumlah: number }> {
  const wa = normalizeWa(String(waMentah ?? ''));
  if (!wa) return { success: false, jumlah: 0 };
  const query: Record<string, string> = { no_wa: `eq.${wa}` };
  const n = Number(id);
  if (Number.isFinite(n) && n > 0) query.id = `eq.${Math.trunc(n)}`;
  else query.dibaca_pada = 'not.is.null';
  try {
    const rows = await supabaseJson('DELETE', 'notifikasi_kandidat', {
      query,
      // `representation` supaya jumlah yang benar-benar terhapus bisa
      // dilaporkan; UI memakainya untuk mengoreksi daftar kalau angkanya
      // berbeda dari yang dihapus optimistis.
      headers: { Prefer: 'return=representation' },
    });
    return { success: true, jumlah: Array.isArray(rows) ? rows.length : 0 };
  } catch {
    return { success: false, jumlah: 0 };
  }
}

/**
 * Tandai satu baris (atau SEMUA) sudah dibaca.
 * `id` disaring bersama `no_wa`, jadi satu siswa tidak bisa menandai baris
 * milik siswa lain walaupun tahu id-nya.
 */
export async function tandaiDibaca(
  waMentah: string,
  id?: unknown,
): Promise<{ success: boolean; jumlah: number }> {
  const wa = normalizeWa(String(waMentah ?? ''));
  if (!wa) return { success: false, jumlah: 0 };
  const query: Record<string, string> = { no_wa: `eq.${wa}` };
  const n = Number(id);
  if (Number.isFinite(n) && n > 0) query.id = `eq.${Math.trunc(n)}`;
  else query.dibaca_pada = 'is.null';
  try {
    const rows = await supabaseJson('PATCH', 'notifikasi_kandidat', {
      query,
      body: { dibaca_pada: new Date().toISOString() },
      // `representation`, bukan `minimal`: UI memakai jumlah yang benar-benar
      // berubah untuk memperbarui badge. Angka karangan ("1") akan membuat
      // badge tetap menyala setelah "tandai semua".
      headers: { Prefer: 'return=representation' },
    });
    return { success: true, jumlah: Array.isArray(rows) ? rows.length : 0 };
  } catch {
    return { success: false, jumlah: 0 };
  }
}
