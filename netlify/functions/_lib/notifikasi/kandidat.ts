/**
 * _lib/notifikasi/kandidat.ts — kotak masuk kandidat + pengiriman push.
 *
 * KENAPA TABEL, BUKAN HANYA PUSH
 * ------------------------------
 * Push adalah kanal terbaik, bukan kanal satu-satunya. Dua batas nyata:
 *   • di iOS web push hanya bekerja untuk web app yang DIPASANG ke Layar Utama,
 *     dan izinnya harus diminta dari gestur pengguna (WebKit, Feb 2023);
 *   • push bisa gagal tanpa jejak — token mati, izin dicabut, perangkat mati
 *     lebih lama dari masa simpan FCM.
 * Kalau satu-satunya salinan pemberitahuan ada di push, kegagalan itu berarti
 * informasinya HILANG, bukan tertunda.
 *
 * Karena itu urutannya selalu: TULIS baris dulu, baru kirim push. Kalau push
 * gagal, barisnya tetap ada dan muncul di dasbor.
 *
 * SATU PINTU UNTUK SEMUA PEMBERITAHUAN KANDIDAT
 * ---------------------------------------------
 * Sebelum ini, push ditulis langsung di tiga tempat berbeda (approve/reject,
 * upload dokumen, reminder jadwal) dengan judul yang dirakit sendiri-sendiri.
 * Akibatnya tidak ada satu pun yang bisa menjawab "apa saja yang pernah
 * diberitahukan ke siswa ini?". Sekarang semua lewat sini.
 */

import { normalizeWa, supabaseJson } from '../db/client';

export const JENIS_NOTIFIKASI = ['lamaran', 'dokumen', 'jadwal', 'sistem'] as const;
export type JenisNotifikasi = (typeof JENIS_NOTIFIKASI)[number];

const JUDUL_MAKS = 120;
const ISI_MAKS = 500;

export function jenisNotifikasiSah(v: unknown): v is JenisNotifikasi {
  return typeof v === 'string' && (JENIS_NOTIFIKASI as readonly string[]).includes(v);
}

function potong(v: unknown, maks: number): string {
  return String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, maks);
}

/**
 * URL tujuan klik. HANYA path relatif — bukan URL absolut.
 *
 * Notifikasi bisa memuat teks yang berasal dari data (nama loker, alasan admin).
 * Kalau nilai itu bisa menjadi URL absolut, satu baris data yang salah bisa
 * mengirim siswa ke domain lain. Path relatif menutup jalur itu tanpa
 * mengurangi fungsi: semua tujuan memang ada di origin yang sama.
 */
function urlAman(v: unknown): string {
  const s = String(v ?? '').trim();
  if (!s.startsWith('/') || s.startsWith('//')) return '/candidate';
  return s.slice(0, 300);
}

async function kirimPush(waList: string[], judul: string, isi: string, url: string): Promise<void> {
  try {
    const { getKandidatTokens } = await import('../fcm-helpers');
    const semua: string[] = [];
    for (const wa of waList) {
      const tokens = await getKandidatTokens(wa);
      for (const t of tokens) semua.push(t);
    }
    if (semua.length === 0) return;
    const fcm = await import('../fcm-server');
    await fcm.sendMulticast(semua, judul, isi, url);
  } catch {
    /* Push best-effort: barisnya sudah tersimpan, jadi tidak ada yang hilang. */
  }
}

export interface InputNotifikasi {
  wa: string;
  jenis: JenisNotifikasi | string;
  judul: string;
  isi?: string;
  url?: string;
}

/**
 * Simpan satu pemberitahuan, lalu kirim push. `success:false` hanya terjadi
 * kalau BARIS gagal disimpan — push yang gagal tidak mengubah hasil.
 */
export async function kirimNotifikasi(input: InputNotifikasi): Promise<{ success: boolean; id?: number }> {
  const wa = normalizeWa(String(input.wa ?? ''));
  if (!wa) return { success: false };
  if (!jenisNotifikasiSah(input.jenis)) return { success: false };
  const judul = potong(input.judul, JUDUL_MAKS);
  if (!judul) return { success: false };
  const isi = potong(input.isi, ISI_MAKS);
  const url = urlAman(input.url);

  try {
    const rows = await supabaseJson('POST', 'notifikasi_kandidat', {
      body: { no_wa: wa, jenis: input.jenis, judul, isi, url },
      headers: { Prefer: 'return=representation' },
    });
    const id = Array.isArray(rows) && rows[0] ? Number((rows[0] as { id?: unknown }).id) : undefined;
    await kirimPush([wa], judul, isi, url);
    return { success: true, id };
  } catch {
    return { success: false };
  }
}

/**
 * Kirim pemberitahuan yang SAMA ke banyak kandidat (mis. reminder jadwal).
 *
 * Satu POST berisi array, bukan N POST: jadwal bisa berisi 30 kandidat dan
 * cron berjalan tiap 10 menit — 30 round-trip berurutan menahan slot fungsi
 * jauh lebih lama daripada satu permintaan.
 */
export async function kirimNotifikasiBanyak(
  waList: string[],
  input: Omit<InputNotifikasi, 'wa'>,
): Promise<{ success: boolean; jumlah: number }> {
  if (!jenisNotifikasiSah(input.jenis)) return { success: false, jumlah: 0 };
  const judul = potong(input.judul, JUDUL_MAKS);
  if (!judul) return { success: false, jumlah: 0 };
  const isi = potong(input.isi, ISI_MAKS);
  const url = urlAman(input.url);
  const unik = Array.from(new Set(waList.map((w) => normalizeWa(String(w || ''))).filter(Boolean)));
  if (unik.length === 0) return { success: true, jumlah: 0 };

  try {
    await supabaseJson('POST', 'notifikasi_kandidat', {
      body: unik.map((wa) => ({ no_wa: wa, jenis: input.jenis, judul, isi, url })),
      headers: { Prefer: 'return=minimal' },
    });
    await kirimPush(unik, judul, isi, url);
    return { success: true, jumlah: unik.length };
  } catch {
    return { success: false, jumlah: 0 };
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
 * Tandai satu baris (atau SEMUA) sudah dibaca.
 * `id` disaring bersama `no_wa`, jadi satu siswa tidak bisa menandai baris
 * milik siswa lain walaupun tahu id-nya.
 */
export async function tandaiDibaca(waMentah: string, id?: unknown): Promise<{ success: boolean; jumlah: number }> {
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
