/**
 * leaderboard.ts — papan peringkat game (kotoba · arcade · matematika).
 *
 * KENAPA ADA
 *   Sebelum ini skor ketiga game hanya hidup di `localStorage` per perangkat.
 *   Dua akibatnya nyata: siswa yang bermain di HP teman (atau setelah membersihkan
 *   data peramban) kehilangan rekornya, dan pengajar TIDAK PUNYA cara melihat
 *   siapa yang benar-benar berlatih — padahal itu justru yang ingin dipantau.
 *
 * BENTUK DATA
 *   `game_scores` menyimpan RIWAYAT (satu baris per kiriman), bukan satu baris
 *   per siswa. Papan peringkat mengambil skor TERTINGGI per (no_wa, game);
 *   riwayatnya tetap utuh untuk melihat perkembangan.
 *
 * `nama` DAN `kelas` DIAMBIL DARI DB, BUKAN DARI KLIEN
 *   Kalau klien yang mengirim, seorang siswa bisa mengirim nama orang lain atau
 *   kelas yang bukan kelasnya, dan papan peringkat akan menampilkan data palsu
 *   tanpa satu pun error. Server mencari sendiri lewat `no_wa` yang SUDAH
 *   diverifikasi gerbang sesi.
 */

import { supabaseJson, normalizeWa } from '../db/client';
import { hitungGenba } from '../../shared/genba-skor';
import { hitungCombo, hitungKotoba, hitungMatematika } from '../../shared/game-skor';

/**
 * Nama game yang sah — HARUS sama dengan CHECK constraint di migrasi 043.
 *
 * `genba` dan `combo` sengaja TERPISAH meski keduanya hidup di halaman
 * `/arcade`: skala skornya berbeda jauh (Genba ~ratusan, Combo ~puluhan ribu),
 * jadi satu papan bersama akan selalu dimenangkan pemain Combo dan papan Genba
 * berhenti berarti.
 */
export const GAME_SAH = ['kotoba', 'genba', 'combo', 'matematika'] as const;
export type GameId = (typeof GAME_SAH)[number];

export function gameSah(v: unknown): v is GameId {
  return typeof v === 'string' && (GAME_SAH as readonly string[]).includes(v);
}

/**
 * Batas skor yang diterima.
 *
 * SEJAK 2026-11-16 keempat game menghitung ulang skornya dari ronde
 * (`genba-skor.ts`, `game-skor.ts`), jadi angka ini bukan lagi pertahanan
 * utama — ia hanya jaring terakhir untuk hasil replay yang benar-benar
 * mustahil (mis. bug kurva loop). Kiriman tanpa ronde DITOLAK sebelum DB.
 */
const SKOR_MAKS = 1_000_000;

/**
 * ULTIMATE LOOP (2026-11-15): mode tanpa akhir butuh plafon lebih tinggi,
 * tetapi HANYA untuk kiriman yang memang membawa `detail.loop ≥ 1`. Tanpa
 * syarat itu, menaikkan batas global membuka pintu kiriman sampah 10 juta
 * dari klien yang bug — dan tes lama di `leaderboard.test.ts` yang menolak
 * 1.000.001 akan kehilangan maknanya.
 *
 * Angka ini HARUS sama dengan `SKOR_MAKS_ULTIMATE` di `src/lib/arcade.ts`.
 * Tidak di-import lintas lapisan sengaja: gerbang `verify:io` / depcruise
 * melarang netlify/functions mengimpor `src/`.
 */
const SKOR_MAKS_ULTIMATE = 10_000_000;

/** Harus sama dengan `PRESISI_MOD` di `src/lib/arcade.ts` (4 digit desimal). */
const PRESISI_MOD = 10_000;

interface BarisSkor {
  no_wa: string;
  nama: string;
  kelas: string;
  game: string;
  skor: number;
  detail: Record<string, unknown>;
  dibuat_pada: string;
}

/** Batas skor yang berlaku untuk satu kiriman. */
export function batasSkor(detail: Record<string, unknown>): number {
  const loop = Number(detail.loop);
  return Number.isFinite(loop) && loop >= 1 ? SKOR_MAKS_ULTIMATE : SKOR_MAKS;
}

/** Detail dinormalisasi di server: klien tidak boleh menyelundupkan angka liar. */
function rapikanDetail(detail: Record<string, unknown>): Record<string, unknown> {
  const presisi = Number(detail.presisi);
  const loop = Number(detail.loop);
  return {
    ...detail,
    presisi: Number.isFinite(presisi)
      ? Math.min(PRESISI_MOD - 1, Math.max(0, Math.round(presisi)))
      : 0,
    loop: Number.isFinite(loop) ? Math.min(99_999, Math.max(0, Math.round(loop))) : 0,
    ultimate: Number.isFinite(loop) && loop >= 1,
  };
}

function presisiBaris(r: BarisSkor): number {
  const p = Number(r.detail?.presisi);
  return Number.isFinite(p) ? Math.min(PRESISI_MOD - 1, Math.max(0, Math.round(p))) : 0;
}

function loopBaris(r: BarisSkor): number {
  const l = Number(r.detail?.loop);
  return Number.isFinite(l) ? Math.max(0, Math.round(l)) : 0;
}

/** Kunci utama papan: skor × 10.000 + digit presisi (reaksi milidetik nyata). */
export function kunciPapan(r: BarisSkor): number {
  return Math.max(0, Math.round(Number(r.skor) || 0)) * PRESISI_MOD + presisiBaris(r);
}

/**
 * Urutan TOTAL — tidak ada dua baris yang bisa berakhir "seri".
 *
 * 1. skor + presisi (turun)  2. kedalaman Ultimate Loop (turun)
 * 3. waktu kirim (naik: yang lebih dulu menang)  4. nomor WA (leksikal)
 *
 * Langkah 4 bukan angka acak dan bukan hadiah: `no_wa` unik per siswa, jadi
 * ia pemecah seri deterministik yang tidak pernah sama untuk dua orang.
 */
export function bandingPapan(a: BarisSkor, b: BarisSkor): number {
  const ka = kunciPapan(a), kb = kunciPapan(b);
  if (ka !== kb) return kb - ka;
  const la = loopBaris(a), lb = loopBaris(b);
  if (la !== lb) return lb - la;
  const ta = Date.parse(a.dibuat_pada || '') || 0;
  const tb = Date.parse(b.dibuat_pada || '') || 0;
  if (ta !== tb) return ta - tb;
  return String(a.no_wa).localeCompare(String(b.no_wa));
}

/** Skor yang ditampilkan: "4.550,3712". Sama persis dengan format di kartu hasil. */
export function skorTampil(r: BarisSkor): string {
  const s = Math.max(0, Math.round(Number(r.skor) || 0));
  return `${s.toLocaleString('id-ID')},${String(presisiBaris(r)).padStart(4, '0')}`;
}

/** Identitas siswa dari DB — sumber `nama`/`kelas` yang dipakai saat menyimpan. */
async function identitas(wa: string): Promise<{ nama: string; kelas: string } | null> {
  try {
    const rows = await supabaseJson('GET', 'database_candidate', {
      query: {
        select: 'nama_lengkap,kelas,catatan_internal',
        no_wa: `eq.${normalizeWa(wa)}`,
        limit: '1',
      },
    });
    if (!Array.isArray(rows) || !rows.length) return null;
    const r = rows[0] as { nama_lengkap?: unknown; kelas?: unknown; catatan_internal?: unknown };
    const kelasKolom = String(r.kelas ?? '').trim().toUpperCase();
    /* Cadangan tag `[KELAS xx]`: kandidat lama menyimpan kelasnya di memo.
       Tanpa cadangan ini, papan peringkat kelas akan mengelompokkan mereka
       sebagai "(tanpa kelas)" padahal kelasnya ada. */
    const tag = /\[KELAS\s*([A-Z0-9]+)\]/i.exec(String(r.catatan_internal ?? ''));
    return {
      nama: String(r.nama_lengkap ?? '').trim(),
      kelas: kelasKolom || (tag ? tag[1].toUpperCase() : ''),
    };
  } catch {
    return null;
  }
}

/**
 * Simpan satu skor. Mengembalikan skor terbaik siswa itu untuk game tersebut,
 * supaya klien bisa langsung menampilkan "rekor kamu" tanpa permintaan kedua.
 */
export async function simpanSkor(input: {
  wa: string;
  game: unknown;
  skor: unknown;
  detail?: unknown;
}): Promise<Record<string, unknown>> {
  const wa = normalizeWa(String(input.wa ?? ''));
  if (!wa) return { success: false, message: 'Nomor WA kosong.' };
  if (!gameSah(input.game)) {
    return { success: false, message: 'Nama game tidak dikenal.' };
  }

  /* Detail MENTAH disimpan dulu: jalur Genba membutuhkan `ronde` dan `tingkat`
     sebelum `rapikanDetail` menjepit angkanya. */
  const mentah =
    input.detail && typeof input.detail === 'object' && !Array.isArray(input.detail)
      ? (input.detail as Record<string, unknown>)
      : {};

  const skorKlien = Number(input.skor);
  if (!Number.isFinite(skorKlien) || skorKlien < 0) {
    return { success: false, message: 'Skor tidak masuk akal.' };
  }

  let skor: number;
  let detail: Record<string, unknown>;

  if (input.game === 'genba') {
    /* SEJAK 2026-11-16: skor Genba dihitung ULANG dari ronde. Angka kiriman
       hanya disimpan sebagai `skorKlien` untuk audit selisih — bukan dipakai.
       Kiriman tanpa ronde DITOLAK, bukan diterima dengan plafon lama: kalau
       tidak, celahnya cuma berpindah ke "jangan kirim ronde". */
    const hasil = hitungGenba(mentah.tingkat, mentah.ronde);
    if (!hasil) {
      return { success: false, message: 'Rincian ronde tidak sah atau tidak dikirim.' };
    }
    /* Dua angka yang bisa dibandingkan tanpa memalsukan ronde.
       Toleransinya disengaja:
       • `pesanan` — klien mereset penghitung ke 0 begitu satu fase tuntas, jadi
         0 selalu sah (mis. berhenti tepat di pergantian gelombang).
       • `loop` — klien mengirim nomor gelombang BERJALAN, replay menghitung
         gelombang TUNTAS; selisih 1 karena itu normal (gugur di gelombang
         pertama). Selisih lebih besar berarti yang dikirim bukan run ini.
       Yang disimpan tetap angka replay, bukan angka klien. */
    const pesananKlien = Number(mentah.pesanan);
    if (
      Number.isFinite(pesananKlien) &&
      Math.round(pesananKlien) !== hasil.pesananAkhir &&
      Math.round(pesananKlien) !== 0
    ) {
      return { success: false, message: 'Ronde tidak cocok dengan jumlah pesanan.' };
    }
    const loopKlien = Number(mentah.loop);
    if (Number.isFinite(loopKlien) && Math.abs(Math.round(loopKlien) - hasil.loopDimainkan) > 1) {
      return { success: false, message: 'Kedalaman loop tidak cocok dengan ronde.' };
    }
    skor = hasil.skor;
    detail = rapikanDetail({
      ...mentah,
      presisi: hasil.presisi,
      /* Yang dicatat untuk papan adalah gelombang yang DIMAINKAN — sama dengan
         arti `loop` di klien dan di `bandingPapan`. */
      loop: hasil.loopDimainkan,
      ultimate: hasil.loopDimainkan >= 1,
      diverifikasi: true,
      skorKlien: Math.round(skorKlien),
      /* Array ronde TIDAK disimpan: satu kiriman bisa membawa ratusan event dan
         tabel ini menerima banyak kiriman. Jumlahnya cukup untuk audit. */
      ronde: Array.isArray(mentah.ronde) ? mentah.ronde.length : 0,
    });
  } else if (input.game === 'matematika') {
    /* Skor Matematika = benar × 50 dan tidak bergantung waktu, jadi replay-nya
       cukup dari hasil tiap soal. Angka kiriman tetap diabaikan: klien bisa
       mengirim `999999`, dan tanpa replay papan hanya bisa menolak yang > 1
       juta. */
    const hasil = hitungMatematika(mentah.ronde, mentah.total);
    if (!hasil) {
      return { success: false, message: 'Rincian ronde tidak sah atau tidak dikirim.' };
    }
    const benarKlien = Number(mentah.benar);
    if (Number.isFinite(benarKlien) && Math.round(benarKlien) !== hasil.benar) {
      return { success: false, message: 'Ronde tidak cocok dengan jumlah benar.' };
    }
    skor = hasil.skor;
    detail = rapikanDetail({
      ...mentah,
      benar: hasil.benar,
      total: hasil.total,
      /* Akurasi ikut dihitung ulang: ia tampil di papan admin, dan angka yang
         dikirim klien bisa saja tidak cocok dengan rondenya. */
      akurasi: Math.round((hasil.benar / hasil.total) * 100),
      diverifikasi: true,
      skorKlien: Math.round(skorKlien),
      ronde: hasil.total,
    });
  } else if (input.game === 'kotoba') {
    /* Kotoba: skor dari urutan jawaban, bukan angka kiriman. Setiap event
       membawa penanda tingkat/mode karena keduanya bisa berubah di tengah
       ronde. */
    const hasil = hitungKotoba(mentah.ronde);
    if (!hasil) {
      return { success: false, message: 'Rincian ronde tidak sah atau tidak dikirim.' };
    }
    const benarKlien = Number(mentah.benar);
    if (Number.isFinite(benarKlien) && Math.round(benarKlien) !== hasil.benar) {
      return { success: false, message: 'Ronde tidak cocok dengan jumlah benar.' };
    }
    const komboKlien = Number(mentah.kombo);
    if (Number.isFinite(komboKlien) && Math.round(komboKlien) !== hasil.komboMaks) {
      return { success: false, message: 'Ronde tidak cocok dengan kombo tertinggi.' };
    }
    skor = hasil.skor;
    detail = rapikanDetail({
      ...mentah,
      benar: hasil.benar,
      /* Di Kotoba, `kombo` di detail berarti kombo TERTINGGI (dipakai papan
         sebagai konteks), bukan kombo terakhir. */
      kombo: hasil.komboMaks,
      diverifikasi: true,
      skorKlien: Math.round(skorKlien),
      ronde: Array.isArray(mentah.ronde) ? mentah.ronde.length : 0,
    });
  } else if (input.game === 'combo') {
    const hasil = hitungCombo(mentah.ronde);
    if (!hasil) {
      return { success: false, message: 'Rincian ronde tidak sah atau tidak dikirim.' };
    }
    const kalimatKlien = Number(mentah.kalimat);
    if (Number.isFinite(kalimatKlien) && Math.round(kalimatKlien) !== hasil.kalimat) {
      return { success: false, message: 'Ronde tidak cocok dengan jumlah kalimat.' };
    }
    const komboKlien = Number(mentah.kombo);
    if (Number.isFinite(komboKlien) && Math.round(komboKlien) !== hasil.kombo) {
      return { success: false, message: 'Ronde tidak cocok dengan kombo terakhir.' };
    }
    skor = hasil.skor;
    detail = rapikanDetail({
      ...mentah,
      kalimat: hasil.kalimat,
      /* Di Combo, `kombo` adalah kombo TERAKHIR (klien mengirim state itu). */
      kombo: hasil.kombo,
      diverifikasi: true,
      skorKlien: Math.round(skorKlien),
      ronde: Array.isArray(mentah.ronde) ? mentah.ronde.length : 0,
    });
  } else {
    /* TIDAK TERCAPAI hari ini: keempat game di `GAME_SAH` punya cabang replay
       sendiri. Dipertahankan sebagai jaring bila daftar itu bertambah tanpa
       cabang baru — lebih baik MENOLAK daripada diam-diam menerima angka
       klien lagi. */
    return { success: false, message: 'Game ini belum punya verifikasi skor.' };
  }

  /* Batas dihitung SETELAH detail dirapikan, supaya plafon Ultimate Loop hanya
     berlaku bagi kiriman yang benar-benar membawa kedalaman loop. */
  if (skor > batasSkor(detail)) {
    return { success: false, message: 'Skor tidak masuk akal.' };
  }

  const id = await identitas(wa);
  if (!id) return { success: false, message: 'Kandidat tidak ditemukan.' };

  try {
    await supabaseJson('POST', 'game_scores', {
      body: {
        no_wa: wa,
        nama: id.nama,
        kelas: id.kelas,
        game: input.game,
        // Dibulatkan: skor pecahan (mis. rata-rata) akan tampil aneh di papan.
        skor: Math.round(skor),
        detail,
      },
      headers: { Prefer: 'return=minimal' },
    });
  } catch {
    return { success: false, message: 'Gagal menyimpan skor. Coba lagi.' };
  }

  const terbaik = await rekorTerbaik(wa, input.game);
  return { success: true, game: input.game, skor: Math.round(skor), terbaik };
}

async function rekorTerbaik(wa: string, game: GameId): Promise<number> {
  try {
    const rows = await supabaseJson('GET', 'game_scores', {
      query: { select: 'skor', no_wa: `eq.${wa}`, game: `eq.${game}`, order: 'skor.desc', limit: '1' },
    });
    if (!Array.isArray(rows) || !rows.length) return 0;
    return Number((rows[0] as { skor?: unknown }).skor) || 0;
  } catch {
    return 0;
  }
}

/**
 * Papan peringkat satu game.
 *
 * `limit` dibatasi di sisi server: tanpa batas, permintaan "semua" akan menarik
 * seluruh riwayat dan memuatnya ke memori fungsi.
 */
export async function papanPeringkat(game: unknown, limit = 50): Promise<Record<string, unknown>> {
  if (!gameSah(game)) return { success: false, message: 'Nama game tidak dikenal.' };
  const n = Math.min(Math.max(Number(limit) || 50, 1), 200);
  try {
    /* Diambil lebih banyak daripada `n` karena penyaringan "satu baris per
       siswa" terjadi setelah ini — seorang siswa dengan sepuluh kiriman bisa
       menghabiskan seluruh jatah kalau diambil tepat `n`. */
    const rows = await supabaseJson('GET', 'game_scores', {
      query: {
        select: 'no_wa,nama,kelas,game,skor,detail,dibuat_pada',
        game: `eq.${game}`,
        order: 'skor.desc,dibuat_pada.asc',
        limit: String(Math.min(n * 20, 2000)),
      },
    });
    if (!Array.isArray(rows)) return { success: true, game, peringkat: [] };

    /**
     * URUTKAN SEBELUM DEDUplikasi. Kalau deduplikasi dilakukan lebih dulu
     * (seperti versi lama yang mengandalkan `order` SQL), siswa dengan dua
     * kiriman berskor sama tapi presisi berbeda akan diwakili baris yang
     * kebetulan datang lebih dulu — dan papan menampilkan presisi yang SALAH.
     * Urutan total di `bandingPapan` juga menjamin tidak ada posisi seri.
     */
    const semua = (rows as BarisSkor[]).slice().sort(bandingPapan);
    const terlihat = new Set<string>();
    const peringkat: Array<BarisSkor & { skorTampil: string; presisi: number; loop: number }> = [];
    for (const r of semua) {
      if (terlihat.has(r.no_wa)) continue;
      terlihat.add(r.no_wa);
      peringkat.push({
        ...r,
        skorTampil: skorTampil(r),
        presisi: presisiBaris(r),
        loop: loopBaris(r),
      });
      if (peringkat.length >= n) break;
    }
    return { success: true, game, peringkat };
  } catch {
    return { success: false, message: 'Gagal memuat papan peringkat.' };
  }
}

/**
 * Ringkasan ketiga game sekaligus — yang dipakai tab admin.
 *
 * Dijalankan berurutan, bukan paralel: satu koneksi DB yang sama, dan tiga
 * permintaan bersamaan tidak membuatnya lebih cepat di fungsi serverless.
 */
export async function ringkasPapan(limit = 10): Promise<Record<string, unknown>> {
  const hasil: Record<string, unknown> = {};
  for (const g of GAME_SAH) {
    const r = await papanPeringkat(g, limit);
    hasil[g] = r.success ? (r.peringkat as BarisSkor[]) : [];
  }
  return { success: true, papan: hasil };
}
