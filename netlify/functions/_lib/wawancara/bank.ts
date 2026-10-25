/**
 * _lib/wawancara/bank.ts — bank soal wawancara (mensetsu) + jawaban kandidat.
 *
 * SUMBER KEBENARAN
 *   `wawancara_soal` (migrasi 021) menyimpan 177 soal dalam 13 tahap alur
 *   wawancara. Tiap soal memuat tiga lapis pertanyaan (jp/romaji/arti) dan tiga
 *   lapis CONTOH jawaban. Contoh itu helper untuk siswa, bukan jawaban siswa.
 *
 *   `wawancara_jawaban` menyimpan jawaban per kandidat, kunci (wa, soal_kode).
 *
 * SOAL YANG SAMA DENGAN KOLOM CV — kenapa TIDAK disalin
 *   Sebagian soal menanyakan hal yang juga merupakan kolom CV: Jiko PR
 *   (`promosi_diri`), kelebihan, kekurangan, keahlian khusus, hobi, tujuan ke
 *   Jepang, rencana setelah pulang, harapan tabungan. Menyalin nilainya ke
 *   tabel jawaban berarti dua salinan yang harus disamakan terus-menerus, dan
 *   itu sudah terbukti gagal di repo ini (lihat identity-sync).
 *
 *   Karena itu, untuk soal yang punya `kolom_cv`:
 *     - BACA  : nilai `arti`/`jp` diambil dari master_database_candidate,
 *               sehingga perubahan di CV AI langsung terlihat di sini.
 *     - TULIS : `arti` ditulis ke `kolom_cv`, `jp` ke `kolom_cv_jp` — jadi
 *               mengisi di sini juga mengubah CV.
 *   Yang tetap disimpan di `wawancara_jawaban` hanya `romaji` (tidak ada
 *   kolomnya di CV) dan `arti` sebagai cermin untuk soal yang tidak dipetakan.
 */
import { supabaseJson, normalizeWa } from '../db/client';
import { fetchMasterByWa } from '../db/master';
import { geminiGenerate, parseJsonLoose } from '../ai/providers';
import { AppError, Errors } from '../kernel/errors';

export type Soal = {
  kode: string;
  tahap: string;
  urutan: number;
  jp: string;
  romaji: string;
  arti: string;
  jawaban_jp: string | null;
  jawaban_romaji: string | null;
  jawaban_arti: string | null;
  kolom_cv: string | null;
  kolom_cv_jp: string | null;
};

export type Jawaban = { jp: string; romaji: string; arti: string; sumber: string };

/** Kolom yang dibaca dari bank. Eksplisit: `select=*` menarik kolom masa depan
 *  yang belum tentu dipahami pemanggil, dan PostgREST menolak nama kolom yang
 *  tidak ada — jadi daftar ini juga berfungsi sebagai kontrak. */
const SOAL_COLS =
  'kode,tahap,urutan,jp,romaji,arti,jawaban_jp,jawaban_romaji,jawaban_arti,kolom_cv,kolom_cv_jp';

/**
 * Pesan galat khusus saat tabel belum ter-expose.
 *
 * Neon Data API meng-cache skema dan TIDAK menyegarkannya lewat
 * `NOTIFY pgrst, 'reload schema'` (terukur 2026-10-20 untuk migrasi 018, dan
 * terulang 2026-10-25 untuk migrasi 021). Tanpa pesan ini, gejalanya adalah
 * daftar kosong tanpa sebab — persis kelas kegagalan senyap yang gate
 * verify-migrations dibuat untuk mencegah.
 */
const PESAN_BELUM_TEREXPOSE =
  'Bank soal wawancara belum terbaca: tabel wawancara_soal belum ada di schema cache ' +
  'Neon Data API. Buka Neon Console → Data API → Refresh schema cache, lalu coba lagi.';

function belumTerexpose(e: unknown) {
  return /PGRST205|schema cache|does not exist/i.test(String(e));
}

/** Seluruh soal aktif, urut sesuai alur wawancara. */
export async function ambilBank(): Promise<Soal[]> {
  try {
    const rows = await supabaseJson('GET', 'wawancara_soal', {
      query: { select: SOAL_COLS, aktif: 'eq.true', order: 'kode.asc', limit: '400' },
    });
    return Array.isArray(rows) ? (rows as Soal[]) : [];
  } catch (e) {
    if (belumTerexpose(e)) throw Errors.serviceUnavailable(PESAN_BELUM_TEREXPOSE);
    throw e;
  }
}

/** Jawaban tersimpan milik satu kandidat, dipetakan per kode soal. */
export async function ambilJawaban(wa: string): Promise<Record<string, Jawaban>> {
  const nw = normalizeWa(wa);
  if (!nw) return {};
  try {
    const rows = await supabaseJson('GET', 'wawancara_jawaban', {
      query: { select: 'soal_kode,jp,romaji,arti,sumber', wa: 'eq.' + nw, limit: '400' },
    });
    const out: Record<string, Jawaban> = {};
    for (const r of Array.isArray(rows) ? rows : []) {
      const k = String((r as any).soal_kode || '');
      if (!k) continue;
      out[k] = {
        jp: String((r as any).jp || ''),
        romaji: String((r as any).romaji || ''),
        arti: String((r as any).arti || ''),
        sumber: String((r as any).sumber || 'siswa'),
      };
    }
    return out;
  } catch (e) {
    // Tabel jawaban belum ter-expose: bank tetap bisa ditampilkan (read-only).
    if (belumTerexpose(e)) return {};
    throw e;
  }
}

/** Nilai kolom CV yang dipetakan ke soal, untuk satu kandidat. */
async function ambilKolomCv(wa: string, kolom: string[]): Promise<Record<string, string>> {
  const unik = [...new Set(kolom.filter(Boolean))];
  if (!unik.length) return {};
  const rows = await fetchMasterByWa([normalizeWa(wa)]);
  const row: any = (Array.isArray(rows) ? rows : [])[0];
  if (!row) return {};
  const out: Record<string, string> = {};
  for (const k of unik) {
    const v = row[k];
    if (v !== null && v !== undefined && String(v).trim() !== '') out[k] = String(v);
  }
  return out;
}

/**
 * Gabungkan bank + jawaban kandidat + kolom CV menjadi bentuk yang dipakai UI.
 *
 * Untuk soal ber-`kolom_cv`, nilai CV MENANG atas jawaban tersimpan: itulah
 * inti sinkronisasinya. Kalau CV kosong, jawaban tersimpan dipakai apa adanya
 * (mis. kandidat mengisi lewat halaman wawancara sebelum CV-nya pernah diisi).
 */
export async function gabungBankDanJawaban(wa: string) {
  const [bank, jawaban] = await Promise.all([ambilBank(), ambilJawaban(wa)]);
  const kolom = bank.flatMap((s) => [s.kolom_cv, s.kolom_cv_jp]).filter(Boolean) as string[];
  const cv = await ambilKolomCv(wa, kolom);

  const soal = bank.map((s) => {
    const j = jawaban[s.kode] || { jp: '', romaji: '', arti: '', sumber: '' };
    let arti = j.arti;
    let jp = j.jp;
    if (s.kolom_cv && cv[s.kolom_cv]) arti = cv[s.kolom_cv];
    if (s.kolom_cv_jp && cv[s.kolom_cv_jp]) jp = cv[s.kolom_cv_jp];
    return {
      ...s,
      jawabanku: { jp, romaji: j.romaji, arti },
      sinkron_cv: Boolean(s.kolom_cv),
    };
  });

  return {
    wa: normalizeWa(wa),
    jumlah: soal.length,
    tahap: [...new Set(soal.map((s) => s.tahap))],
    soal,
  };
}

/**
 * Simpan satu jawaban. Kalau soal dipetakan ke kolom CV, kolom CV ikut ditulis
 * — itu yang membuat perubahan terlihat di CV AI.
 */
export async function simpanJawaban(
  wa: string,
  kode: string,
  val: { jp?: string; romaji?: string; arti?: string },
  sumber: 'siswa' | 'ai' = 'siswa',
) {
  const nw = normalizeWa(wa);
  if (!nw) throw new AppError('VALIDATION_FAILED', { message: 'Nomor WA tidak valid.' });
  const kodeBersih = String(kode || '').trim();
  if (!kodeBersih) throw new AppError('VALIDATION_FAILED', { message: 'Kode soal kosong.' });

  const bank = await ambilBank();
  const soal = bank.find((s) => s.kode === kodeBersih);
  if (!soal) throw new AppError('VALIDATION_FAILED', { message: 'Soal tidak dikenal: ' + kodeBersih });

  const jp = String(val.jp ?? '').trim();
  const romaji = String(val.romaji ?? '').trim();
  const arti = String(val.arti ?? '').trim();

  // 1) Kolom CV lebih dulu: kalau ini gagal, jangan simpan salinan yang
  //    membuat dua sumber berbeda pendapat.
  if (soal.kolom_cv) {
    const body: Record<string, string> = {};
    body[soal.kolom_cv] = arti;
    if (soal.kolom_cv_jp) body[soal.kolom_cv_jp] = jp;
    try {
      await supabaseJson('PATCH', 'master_database_candidate', {
        query: { no_wa: 'eq.' + nw },
        body,
        headers: { Prefer: 'return=minimal' },
      });
    } catch (e) {
      throw new AppError('VALIDATION_FAILED', { message: 'Gagal menyimpan ke kolom CV (' + soal.kolom_cv + '): ' + String(e).slice(0, 160) });
    }
  }

  // 2) Jawaban tersimpan: romaji selalu di sini; arti/jp sebagai cermin.
  try {
    await supabaseJson('POST', 'wawancara_jawaban', {
      query: { on_conflict: 'wa,soal_kode' },
      body: {
        wa: nw,
        soal_kode: kodeBersih,
        jp,
        romaji,
        arti,
        sumber,
        updated_at: new Date().toISOString(),
      },
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    });
  } catch (e) {
    if (belumTerexpose(e)) throw Errors.serviceUnavailable(PESAN_BELUM_TEREXPOSE);
    throw e;
  }

  return { success: true, kode: kodeBersih, sinkron_cv: Boolean(soal.kolom_cv) };
}

/**
 * Terjemahkan jawaban Bahasa Indonesia menjadi Jepang + cara baca.
 *
 * Dipakai tombol "Isi otomatis Jepang" pada baris: siswa menulis arti saja,
 * AI melengkapi dua lapis lainnya. Hasilnya disimpan, jadi bukan sekadar
 * pratinjau yang hilang saat halaman ditutup.
 */
export async function terjemahkanJawaban(wa: string, kode: string, artiMentah: string) {
  const arti = String(artiMentah || '').trim();
  if (!arti) throw new AppError('VALIDATION_FAILED', { message: 'Tulis dulu jawaban Bahasa Indonesianya.' });
  if (arti.length > 600) throw new AppError('VALIDATION_FAILED', { message: 'Jawaban terlalu panjang (maks 600 karakter).' });

  const bank = await ambilBank();
  const soal = bank.find((s) => s.kode === String(kode || '').trim());
  if (!soal) throw new AppError('VALIDATION_FAILED', { message: 'Soal tidak dikenal.' });

  const system = `Kamu penerjemah untuk LPK pengirim pemagang ke Jepang.

Pertanyaan wawancara: ${soal.jp} (${soal.arti})

Kandidat menjawab dalam Bahasa Indonesia:
"${arti}"

Tugas: ubah jawaban itu menjadi JAWABAN BAHASA JEPANG yang wajar diucapkan
kandidat saat mensetsu, lalu beri cara baca romaji.

Aturan:
- Sudut pandang orang pertama, sopan wawancara (です/ます), 1-3 kalimat pendek.
- Pertahankan MAKNA jawaban kandidat. Jangan menambah fakta baru, jangan
  mengarang nama/sekolah/angka yang tidak disebut kandidat.
- Pakai kanji sebagaimana orang Jepang menulis; nama asing/tempat Indonesia
  ditulis katakana.
- Field "jp" HANYA huruf Jepang dan tanda baca Jepang — tanpa huruf latin.
- "romaji" huruf kecil, tanpa huruf Jepang.
- "arti" = jawaban Indonesia yang sudah dirapikan (tanpa mengubah makna).

Balas HANYA JSON: {"jp":"...","romaji":"...","arti":"..."}`;

  const r = await geminiGenerate(system, [], { bestEffort: true });
  const text = String((r && (r as any).reply) || '').trim();
  const parsed: any = parseJsonLoose(text);
  if (!parsed || typeof parsed !== 'object') {
    throw new AppError('VALIDATION_FAILED', { message: 'AI tidak mengembalikan terjemahan yang bisa dibaca. Coba lagi.' });
  }

  const jp = String(parsed.jp || '').trim();
  const romaji = String(parsed.romaji || '').trim();
  const artiRapi = String(parsed.arti || arti).trim();

  // Validasi: jp wajib huruf Jepang dan tidak boleh mengandung romaji. Tanpa ini
  // model kecil kadang menjawab dengan romaji di field jp, dan hasilnya masuk DB.
  if (!/[\u3040-\u30ff\u4e00-\u9fff]/.test(jp)) {
    throw new AppError('VALIDATION_FAILED', { message: 'AI tidak menghasilkan huruf Jepang. Coba lagi.' });
  }
  if (/[A-Za-z]{3,}/.test(jp)) {
    throw new AppError('VALIDATION_FAILED', { message: 'Hasil AI masih memuat huruf latin. Coba lagi.' });
  }

  await simpanJawaban(wa, soal.kode, { jp, romaji, arti: artiRapi }, 'ai');
  return { success: true, kode: soal.kode, jp, romaji, arti: artiRapi };
}

/** Link yang bisa dikirim ke siswa untuk mengisi sendiri. */
export function linkWawancara(wa: string, nama: string, base: string) {
  const nw = normalizeWa(wa);
  const akar = String(base || '').replace(/\/+$/, '');
  const q = new URLSearchParams({ wa: nw });
  if (nama) q.set('nama', String(nama));
  return { url: akar + '/wawancara?' + q.toString() };
}
