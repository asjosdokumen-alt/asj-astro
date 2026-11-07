/**
 * _lib/asesmen/tes.ts — dua tes mandiri siswa: MBTI & Tes Mata Pra-MCU.
 *
 * ATURAN PRODUK (pemilik, 2026-11-06)
 * -----------------------------------
 *   1. Hanya SISWA (VIP / kelas LPK) — gerbangnya `tolakKecualiSiswa`, sama
 *      dengan bank kosakata dan simulasi matematika. Satu penjaga, satu tempat.
 *   2. Hanya saat ADMIN MENYALAKAN. Sakelarnya `sys_config` (`tes_mbti`,
 *      `tes_mata`), bukan tabel baru: isinya satu nilai, dan `sys_config`
 *      sudah menjadi tempat seluruh konfigurasi lain.
 *   3. SEKALI per siswa per jenis tes. Ditegakkan constraint
 *      `candidate_assessments_sekali`, bukan hanya tombol yang disembunyikan.
 *
 * KENAPA GAGAL-TERTUTUP
 * ---------------------
 * Kalau `sys_config` tidak terbaca, jawabannya "nonaktif", bukan "aktif".
 * Kebalikannya berarti satu gangguan database membuka dua tes yang pemiliknya
 * sedang tutup — dan tes ini hanya boleh dikerjakan sekali, jadi kesalahan itu
 * tidak bisa dibatalkan.
 *
 * NAMA & KELAS DIAMBIL DARI DB
 * ----------------------------
 * Sama seperti `game_scores`: klien yang mengirim nama bisa mengirim nama orang
 * lain, dan tab admin akan menampilkan data palsu tanpa satu pun error.
 */

import { normalizeWa, supabaseJson } from '../db/client';
import { DURASI_IQ_MENIT, VERSI_BANK_IQ, soalKlienIq } from './iq-bank';
import { nilaiIq, ringkasIq, tampilanIqSiswa, type HasilIqLengkap } from './iq-scorer';

export const TES_SAH = ['mbti', 'mata', 'iq'] as const;
export type JenisTes = (typeof TES_SAH)[number];

/** `sys_config.config_type` untuk tiap tes. Nilai `on` = aktif. */
const CONFIG_TYPE: Record<JenisTes, string> = {
  mbti: 'tes_mbti',
  mata: 'tes_mata',
  iq: 'tes_iq',
};

export function jenisTesSah(v: unknown): v is JenisTes {
  return typeof v === 'string' && (TES_SAH as readonly string[]).includes(v);
}

export interface StatusTes {
  aktif: Record<JenisTes, boolean>;
  selesai: Record<JenisTes, boolean>;
  hasil: Partial<Record<JenisTes, { ringkasan: string; hasil: unknown; dibuat_pada: string }>>;
}

/** Baca sakelar admin. Gagal baca = nonaktif (lihat komentar di atas). */
export async function bacaSakelar(): Promise<Record<JenisTes, boolean>> {
  const mati = { mbti: false, mata: false, iq: false };
  try {
    const rows = await supabaseJson('GET', 'sys_config', {
      query: {
        select: 'config_type,config_value,is_active',
        config_type: `in.(${CONFIG_TYPE.mbti},${CONFIG_TYPE.mata})`,
        limit: '20',
      },
    });
    if (!Array.isArray(rows)) return mati;
    const aktif = { ...mati };
    for (const r of rows as { config_type?: unknown; config_value?: unknown; is_active?: unknown }[]) {
      if (r.is_active === false) continue;
      const jenis = (Object.keys(CONFIG_TYPE) as JenisTes[]).find((j) => CONFIG_TYPE[j] === r.config_type);
      if (jenis && String(r.config_value ?? '').trim().toLowerCase() === 'on') aktif[jenis] = true;
    }
    return aktif;
  } catch {
    return mati;
  }
}

/** Nama + kelas dari DB. `null` = kandidat tidak ditemukan. */
async function identitasSiswa(wa: string): Promise<{ nama: string; kelas: string } | null> {
  const cari = async (tabel: string) => {
    const rows = await supabaseJson('GET', tabel, {
      query: { select: 'nama_lengkap,kelas', no_wa: `eq.${wa}`, limit: '1' },
    });
    return Array.isArray(rows) && rows.length ? (rows[0] as Record<string, unknown>) : null;
  };
  try {
    const r = (await cari('master_database_candidate')) || (await cari('database_candidate'));
    if (!r) return null;
    return {
      nama: String(r.nama_lengkap ?? '').trim(),
      kelas: String(r.kelas ?? '').trim().toUpperCase(),
    };
  } catch {
    return null;
  }
}

/** Status satu siswa: sakelar, sudah dikerjakan atau belum, dan hasilnya. */
export async function statusTes(waMentah: string): Promise<Record<string, unknown>> {
  const wa = normalizeWa(String(waMentah ?? ''));
  const aktif = await bacaSakelar();
  const kosong: StatusTes = {
    aktif,
    selesai: { mbti: false, mata: false, iq: false },
    hasil: {},
  };
  if (!wa) return { success: true, wa: '', ...kosong };

  try {
    const rows = await supabaseJson('GET', 'candidate_assessments', {
      query: {
        select: 'jenis,ringkasan,hasil,dibuat_pada',
        no_wa: `eq.${wa}`,
        limit: '10',
      },
    });
    if (!Array.isArray(rows)) return { success: true, wa, ...kosong };
    const status: StatusTes = { aktif, selesai: { mbti: false, mata: false, iq: false }, hasil: {} };
    for (const r of rows as { jenis?: unknown; ringkasan?: unknown; hasil?: unknown; dibuat_pada?: unknown }[]) {
      if (!jenisTesSah(r.jenis)) continue;
      status.selesai[r.jenis] = true;
      status.hasil[r.jenis] = {
        /* `ringkasan` untuk 'iq' memuat "34/40 · skala 121" — angka penuh yang
           menurut keputusan pemilik 2026-11-07 hanya boleh dilihat admin. Jalur
           ini melayani SISWA, jadi ringkasannya dikosongkan dan `hasil`-nya
           dipotong ke bentuk siswa. Kalau tidak, angkanya tetap sampai ke HP
           lewat tab Network meski tidak digambar di layar. */
        ringkasan: r.jenis === 'iq' ? '' : String(r.ringkasan ?? ''),
        hasil: r.jenis === 'iq' ? (tampilanIqSiswa(r.hasil) ?? {}) : (r.hasil ?? {}),
        dibuat_pada: String(r.dibuat_pada ?? ''),
      };
    }
    return { success: true, wa, ...status };
  } catch {
    /* Hasil tidak terbaca BUKAN alasan membuka tes lagi: siswa bisa kehilangan
       kesempatan keduanya. Sakelar tetap dilaporkan; `selesai` dibiarkan
       kosong dan klien akan mencoba lagi saat menyimpan. */
    return { success: true, wa, ...kosong, hasilTidakTerbaca: true };
  }
}

/** Batas ukuran payload — 40 jawaban + 14 plate masih jauh di bawah ini. */
const HASIL_MAKS_BYTE = 16 * 1024;

/**
 * Validasi bentuk hasil. Yang diperiksa HANYA bentuk dan rentang, bukan
 * kebenaran: MBTI tidak punya jawaban benar, dan Ishihara dihitung di klien.
 * Yang dicegah adalah nilai mustahil (visus 99, skor 999) yang akan merusak
 * tampilan admin.
 */
function periksaHasil(jenis: JenisTes, hasil: unknown): { ok: true; nilai: Record<string, unknown> } | { ok: false; pesan: string } {
  if (!hasil || typeof hasil !== 'object' || Array.isArray(hasil)) {
    return { ok: false, pesan: 'Hasil tes kosong.' };
  }
  const h = hasil as Record<string, unknown>;
  const angka = (v: unknown, min: number, maks: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= min && n <= maks;
  };

  if (jenis === 'mbti') {
    const tipe = String(h.tipe ?? '').toUpperCase();
    if (!/^[EI][SN][TF][JP]$/.test(tipe)) return { ok: false, pesan: 'Tipe MBTI tidak sah.' };
    const p = h.persentase as Record<string, unknown> | undefined;
    if (!p || typeof p !== 'object') return { ok: false, pesan: 'Persentase MBTI kosong.' };
    for (const k of ['E', 'I', 'S', 'N', 'T', 'F', 'J', 'P']) {
      if (!angka(p[k], 0, 100)) return { ok: false, pesan: `Persentase ${k} tidak sah.` };
    }
    const jumlah = Number(h.jumlahTerjawab);
    if (!angka(jumlah, 1, 200)) return { ok: false, pesan: 'Jumlah jawaban tidak sah.' };
    return { ok: true, nilai: { ...h, tipe } };
  }

  // mata
  const ish = h.ishihara as Record<string, unknown> | undefined;
  if (!ish || typeof ish !== 'object') return { ok: false, pesan: 'Hasil Ishihara kosong.' };
  if (!angka(ish.skor, 0, 24)) return { ok: false, pesan: 'Skor Ishihara tidak sah.' };
  if (typeof ish.status !== 'string' || !ish.status.trim()) return { ok: false, pesan: 'Status Ishihara kosong.' };
  const visus = h.visus as Record<string, unknown> | undefined;
  if (!visus || typeof visus !== 'object') return { ok: false, pesan: 'Visus kosong.' };
  if (!angka(visus.kanan, 0, 2) || !angka(visus.kiri, 0, 2)) {
    return { ok: false, pesan: 'Nilai visus tidak sah.' };
  }
  return { ok: true, nilai: h };
}

function ringkas(jenis: JenisTes, h: Record<string, unknown>): string {
  if (jenis === 'mbti') {
    const p = (h.persentase || {}) as Record<string, unknown>;
    const tipe = String(h.tipe ?? '');
    return `${tipe} · E ${Math.round(Number(p.E) || 0)}/I ${Math.round(Number(p.I) || 0)} · S ${Math.round(
      Number(p.S) || 0,
    )}/N ${Math.round(Number(p.N) || 0)} · T ${Math.round(Number(p.T) || 0)}/F ${Math.round(
      Number(p.F) || 0,
    )} · J ${Math.round(Number(p.J) || 0)}/P ${Math.round(Number(p.P) || 0)}`;
  }
  const ish = (h.ishihara || {}) as Record<string, unknown>;
  const v = (h.visus || {}) as Record<string, unknown>;
  return `${String(ish.status ?? '').slice(0, 60)} · OD ${Number(v.kanan ?? 0).toFixed(1)} / OS ${Number(
    v.kiri ?? 0,
  ).toFixed(1)}`;
}

/**
 * Tulis hasil tes ke kolom CV yang sudah ada.
 *
 * KENAPA ADA (pemilik, 2026-11-06): *"hasilnya tulis db dan sync kan cv ai
 * dropdown mbti … begitu juga dengan mata kanan kiri … isi manual bebas jgn di
 * lock"*. Jadi hasil tes MENGISI kolom `mbti` / `mata_kanan` / `mata_kiri`
 * supaya admin tidak perlu mengetik ulang — tetapi kolomnya tetap bisa diedit
 * manual di form CV.
 *
 * HANYA MENGISI YANG KOSONG. Nilai yang sudah diisi admin dipertahankan: tes
 * ini fitur baru, dan menimpa ketikan manual diam-diam akan membuat admin
 * kehilangan pekerjaan yang sudah dilakukan. Yang dilewati dilaporkan kembali
 * supaya UI bisa mengatakannya.
 */
async function sinkronKeCv(
  wa: string,
  jenis: JenisTes,
  hasil: Record<string, unknown>,
): Promise<{ ditulis: string[]; dilewati: string[] }> {
  const kosong = (v: unknown) => {
    const s = String(v ?? '').trim();
    return s === '' || s === '-';
  };
  try {
    const rows = await supabaseJson('GET', 'master_database_candidate', {
      query: { select: 'mbti,mata_kanan,mata_kiri', no_wa: `eq.${wa}`, limit: '1' },
    });
    if (!Array.isArray(rows) || !rows.length) return { ditulis: [], dilewati: [] };
    const r = rows[0] as Record<string, unknown>;
    const patch: Record<string, string> = {};
    const dilewati: string[] = [];

    if (jenis === 'mbti') {
      const tipe = String(hasil.tipe ?? '').toUpperCase();
      if (!tipe) return { ditulis: [], dilewati: [] };
      if (kosong(r.mbti)) patch.mbti = tipe;
      else if (String(r.mbti).trim().toUpperCase() !== tipe) dilewati.push('mbti');
    } else {
      const v = (hasil.visus || {}) as Record<string, unknown>;
      const angka = (x: unknown) => {
        const n = Number(x);
        return Number.isFinite(n) && n > 0 ? n.toFixed(1) : '<0.1';
      };
      const kanan = angka(v.kanan);
      const kiri = angka(v.kiri);
      if (kosong(r.mata_kanan)) patch.mata_kanan = kanan;
      else if (String(r.mata_kanan).trim() !== kanan) dilewati.push('mata_kanan');
      if (kosong(r.mata_kiri)) patch.mata_kiri = kiri;
      else if (String(r.mata_kiri).trim() !== kiri) dilewati.push('mata_kiri');
    }

    if (Object.keys(patch).length) {
      await supabaseJson('PATCH', 'master_database_candidate', {
        query: { no_wa: `eq.${wa}` },
        body: patch,
        headers: { Prefer: 'return=minimal' },
      });
    }
    return { ditulis: Object.keys(patch), dilewati };
  } catch {
    /* Sinkronisasi CV adalah BONUS: kegagalannya tidak boleh membatalkan hasil
       tes yang sudah tersimpan. */
    return { ditulis: [], dilewati: [] };
  }
}

/**
 * Simpan hasil SEKALI. `sudah: true` = siswa ini sudah pernah mengerjakan;
 * hasil lama TIDAK ditimpa.
 */
export async function simpanHasil(input: {
  wa: string;
  jenis: unknown;
  hasil: unknown;
}): Promise<Record<string, unknown>> {
  const wa = normalizeWa(String(input.wa ?? ''));
  if (!wa) return { success: false, message: 'Nomor WA kosong.' };
  if (!jenisTesSah(input.jenis)) return { success: false, message: 'Jenis tes tidak dikenal.' };

  const sakelar = await bacaSakelar();
  if (!sakelar[input.jenis]) {
    return { success: false, nonaktif: true, message: 'Tes ini sedang ditutup admin.' };
  }

  const cek = periksaHasil(input.jenis, input.hasil);
  if (!cek.ok) return { success: false, message: cek.pesan };

  const teks = JSON.stringify(cek.nilai);
  if (teks.length > HASIL_MAKS_BYTE) return { success: false, message: 'Hasil tes terlalu besar.' };

  const id = await identitasSiswa(wa);
  if (!id) return { success: false, message: 'Kandidat tidak ditemukan.' };

  try {
    await supabaseJson('POST', 'candidate_assessments', {
      body: {
        no_wa: wa,
        nama: id.nama,
        kelas: id.kelas,
        jenis: input.jenis,
        ringkasan: ringkas(input.jenis, cek.nilai),
        hasil: cek.nilai,
      },
      headers: { Prefer: 'return=minimal' },
    });
  } catch (e) {
    /* 23505 = unique_violation. Jangan laporkan sebagai galat umum: siswa perlu
       tahu bahwa tesnya SUDAH tersimpan, bukan bahwa penyimpanan gagal. */
    const pesan = String((e as { message?: unknown })?.message ?? e);
    if (/duplicate key|23505|sudah ada/i.test(pesan)) {
      return { success: false, sudah: true, message: 'Tes ini sudah pernah kamu kerjakan.' };
    }
    return { success: false, message: 'Gagal menyimpan hasil tes. Coba lagi.' };
  }

  return { success: true, jenis: input.jenis, ringkasan: ringkas(input.jenis, cek.nilai), cv: await sinkronKeCv(wa, input.jenis, cek.nilai) };
}

/** Daftar hasil untuk tab admin. `jenis` opsional. */
export async function daftarHasil(jenis?: unknown, limit = 500): Promise<Record<string, unknown>> {
  const n = Math.min(Math.max(Number(limit) || 500, 1), 1000);
  const query: Record<string, string> = {
    select: 'id,no_wa,nama,kelas,jenis,ringkasan,dibuat_pada',
    order: 'dibuat_pada.desc',
    limit: String(n),
  };
  if (jenisTesSah(jenis)) query.jenis = `eq.${jenis}`;
  try {
    const rows = await supabaseJson('GET', 'candidate_assessments', { query });
    return { success: true, hasil: Array.isArray(rows) ? rows : [] };
  } catch {
    return { success: false, message: 'Gagal memuat hasil tes.' };
  }
}

/**
 * Nyalakan/matikan satu tes. Menulis `sys_config` — bukan tabel baru — supaya
 * tidak ada DDL untuk sesuatu yang isinya satu kata.
 */
export async function setAktif(jenis: unknown, aktif: unknown): Promise<Record<string, unknown>> {
  if (!jenisTesSah(jenis)) return { success: false, message: 'Jenis tes tidak dikenal.' };
  const type = CONFIG_TYPE[jenis];
  try {
    // Hapus dulu: satu jenis hanya boleh punya satu baris, dan nilai lama
    // `off`/`on` ganda akan membuat pembacaan bergantung urutan.
    await supabaseJson('DELETE', 'sys_config', {
      query: { config_type: `eq.${type}` },
      headers: { Prefer: 'return=minimal' },
    });
    if (aktif) {
      await supabaseJson('POST', 'sys_config', {
        body: { config_type: type, config_value: 'on', is_active: true },
        headers: { Prefer: 'return=minimal' },
      });
    }
    return { success: true, jenis, aktif: Boolean(aktif) };
  } catch {
    return { success: false, message: 'Gagal menyimpan pengaturan tes.' };
  }
}

/* ── Asesmen penalaran ('iq') ──────────────────────────────────────────────
 *
 * Tiga fungsi di bawah SENGAJA terpisah dari `simpanHasil` di atas, meski
 * tabelnya sama. Bedanya bukan gaya: MBTI dan Tes Mata tidak punya jawaban
 * benar (klien menghitung, server memvalidasi bentuk), sedangkan tes ini punya
 * kunci yang tidak boleh keluar dari server. Menyatukannya berarti satu fungsi
 * dengan dua aturan kepercayaan yang berbeda — dan aturan yang bercampur adalah
 * aturan yang cepat atau lambat dilonggarkan di jalur yang salah.
 */

/**
 * Soal untuk satu siswa. Kalau ia sudah pernah mengerjakan, soal TIDAK
 * dikirim — yang dikirim tampilan hasilnya, supaya "sekali seumur hidup"
 * tidak bergantung pada tombol yang disembunyikan.
 */
export async function soalIqUntuk(waMentah: string): Promise<Record<string, unknown>> {
  const wa = normalizeWa(String(waMentah ?? ''));
  const sakelar = await bacaSakelar();
  if (!sakelar.iq) return { success: false, nonaktif: true, message: 'Tes ini sedang ditutup admin.' };

  if (wa) {
    try {
      const rows = await supabaseJson('GET', 'candidate_assessments', {
        query: { select: 'hasil', no_wa: `eq.${wa}`, jenis: 'eq.iq', limit: '1' },
      });
      if (Array.isArray(rows) && rows.length) {
        const isi = tampilanIqSiswa((rows[0] as { hasil?: unknown }).hasil);
        return { success: true, sudah: true, tampilan: isi };
      }
    } catch {
      /* Hasil tidak terbaca BUKAN alasan mengirim soal lagi: satu gangguan
         database akan membakar kesempatan satu-satunya siswa. */
      return { success: false, message: 'Gagal memeriksa status tes. Coba lagi sebentar.' };
    }
  }

  return {
    success: true,
    sudah: false,
    versi: VERSI_BANK_IQ,
    durasiMenit: DURASI_IQ_MENIT,
    soal: soalKlienIq(wa),
  };
}

/**
 * Nilai + simpan. Angka penuh masuk database, yang kembali ke klien hanya
 * bentuk siswa (lihat `tampilanIqSiswa`).
 */
export async function simpanHasilIq(input: {
  wa: string;
  jawaban: unknown;
  durasiDetik: unknown;
}): Promise<Record<string, unknown>> {
  const wa = normalizeWa(String(input.wa ?? ''));
  if (!wa) return { success: false, message: 'Nomor WA kosong.' };

  const sakelar = await bacaSakelar();
  if (!sakelar.iq) return { success: false, nonaktif: true, message: 'Tes ini sedang ditutup admin.' };

  const id = await identitasSiswa(wa);
  if (!id) return { success: false, message: 'Kandidat tidak ditemukan.' };

  /* Penilaian memakai `wa` yang SUDAH dinormalkan, bukan kiriman mentah klien:
     seed pemilih soal harus sama dengan seed saat soal dikirim, kalau tidak
     kunci yang dipakai menilai bukan kunci untuk soal yang dilihat siswa. */
  const penuh: HasilIqLengkap = nilaiIq(wa, input.jawaban, input.durasiDetik);

  try {
    await supabaseJson('POST', 'candidate_assessments', {
      body: {
        no_wa: wa,
        nama: id.nama,
        kelas: id.kelas,
        jenis: 'iq',
        ringkasan: ringkasIq(penuh),
        hasil: penuh,
      },
      headers: { Prefer: 'return=minimal' },
    });
  } catch (e) {
    const pesan = String((e as { message?: unknown })?.message ?? e);
    if (/duplicate key|23505|sudah ada/i.test(pesan)) {
      return { success: false, sudah: true, message: 'Tes ini sudah pernah kamu kerjakan.' };
    }
    return { success: false, message: 'Gagal menyimpan hasil tes. Coba lagi.' };
  }

  return { success: true, jenis: 'iq', tampilan: tampilanIqSiswa(penuh) };
}

/**
 * Buka ulang untuk SATU siswa. Tindakan admin, bukan sakelar: siswa yang HP-nya
 * mati di tengah ujian tidak boleh kehilangan kesempatan satu-satunya, tetapi
 * membuka untuk semua orang berarti tes ini tidak lagi mengukur apa pun.
 */
export async function resetHasilIq(waMentah: string): Promise<Record<string, unknown>> {
  const wa = normalizeWa(String(waMentah ?? ''));
  if (!wa) return { success: false, message: 'Nomor WA kosong.' };
  try {
    await supabaseJson('DELETE', 'candidate_assessments', {
      query: { no_wa: `eq.${wa}`, jenis: 'eq.iq' },
      headers: { Prefer: 'return=minimal' },
    });
    return { success: true, wa };
  } catch {
    return { success: false, message: 'Gagal membuka ulang tes siswa ini.' };
  }
}

/**
 * Mode uji admin: nilai SAJA, tanpa menulis.
 *
 * Dipisah dari `simpanHasilIq` supaya "jangan menyimpan" tidak pernah menjadi
 * cabang di dalam jalur yang menyimpan. Pemeriksaan admin dilakukan pemanggil
 * (`surfaces/tes.ts` → `requireAdmin`), karena hanya di sana sesi tersedia.
 */
export function nilaiIqTanpaSimpan(
  waMentah: string,
  jawaban: unknown,
  durasiDetik: unknown,
): Record<string, unknown> {
  const wa = normalizeWa(String(waMentah ?? ''));
  const penuh = nilaiIq(wa, jawaban, durasiDetik);
  return { success: true, uji: true, tampilan: tampilanIqSiswa(penuh) };
}
