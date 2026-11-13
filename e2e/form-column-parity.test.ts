/**
 * e2e/form-column-parity.test.ts — GATE paritas KOLOM antara Form Master dan CV AI.
 *
 * MASALAH YANG DIKUNCI
 *   Keluhan pemilik 2026-10-25: *"samakan cv ai dan form master"*. Yang terjadi
 *   berulang bukan satu bug, melainkan satu POLA: sebuah field ditambahkan ke
 *   salah satu form saja, dan tidak ada tes yang merah. Contoh nyata yang
 *   ditemukan hari itu: `tindik`, `no_coe`, tgl/exp/kota paspor, dan `lisensi2`
 *   hanya ada di Form Master; sebaliknya `kontak_darurat_nama`/`_hubungan` hanya
 *   ditanyakan CV AI. Semuanya lolos karena tidak ada yang membandingkan dua
 *   daftar.
 *
 *   `e2e/ai-cv-column-coverage.test.ts` menjaga arah SATU: setiap field CV AI
 *   punya tujuan kolom. Tes ini menjaga arah LAIN: kolom yang bisa ditulis Form
 *   Master harus bisa ditulis CV AI juga — kecuali yang alasannya dicatat di
 *   bawah. Dua tes, dua arah.
 *
 * KENAPA MEMBANDINGKAN PETA, BUKAN MEMANGGIL BUILDER
 *   Memanggil `buildMasterBody` dengan payload sintetis (percobaan 2026-10-25)
 *   menghasilkan selisih PALSU: payload itu harus menebak nama field tiap form,
 *   dan yang lupa ditebak muncul sebagai "tidak didukung". Peta kolom adalah
 *   deklarasi penulisnya sendiri, jadi tidak ada tebakan.
 *
 *   `JP_TRANSLATE_MAP` ikut di kedua sisi dengan sengaja: `alamat_jp` dan
 *   `tempat_lahir_jp` diisi lewat penerjemahan, bukan lewat peta field — dan
 *   sejak 2026-10-25 jalur CV AI memakai helper yang sama.
 */
import { describe, it, expect } from 'vitest';
import {
  MASTER_COLUMN_MAP,
  JP_TRANSLATE_MAP,
  AI_TO_MASTER_COLUMNS,
  buildMasterNested,
  buildRiwayatSlots,
} from '../netlify/functions/contexts/master-data';
import { TABLE_COLUMNS } from '../netlify/functions/_lib/db/schema.generated';
import { normalizeMasterData } from '../src/lib/cv-template-factory/data';
import type { CandidateData } from '../src/lib/cv-template-factory/types';
import { buildValues as kinkiValues, buildNumbers as kinkiNumbers } from '../src/lib/cv-template-factory/renderers/kinki';
import { buildValues as jipaValues } from '../src/lib/cv-template-factory/renderers/jipa';
import { buildValues as xlsxValues } from '../src/lib/cv-template-factory/renderers/rirekisho-xlsx';
import { buildValues as firmaValues } from '../src/lib/cv-template-factory/renderers/rirekisho-firma';
import { buildValues as detailValues } from '../src/lib/cv-template-factory/renderers/rirekisho-detail';

const MASTER = 'master_database_candidate';

/** Kolom yang bisa dihasilkan Form Master (`buildMasterBody` + auto-translate). */
function masterColumns(): Set<string> {
  return new Set([...Object.values(MASTER_COLUMN_MAP), ...Object.values(JP_TRANSLATE_MAP)]);
}

/** Kolom yang bisa dihasilkan CV AI (`masterColumnsFromAi` + auto-translate). */
function aiColumns(): Set<string> {
  const out = new Set<string>(Object.values(JP_TRANSLATE_MAP));
  for (const rows of Object.values(AI_TO_MASTER_COLUMNS)) {
    for (const row of rows) out.add(row[0]);
  }
  return out;
}

/**
 * Kolom yang hanya ditulis Form Master. Setiap entri WAJIB punya alasan —
 * daftar ini tempat keputusan dicatat, bukan tempat menyembunyikan kelalaian.
 */
/* KOSONG sejak 2026-11-04. Satu-satunya entri lama adalah `ssw` dengan alasan
   "alias legacy: payload lama mengirim `ssw` langsung, form memakai `lisensi` →
   bidangssw; dua kolom untuk satu konsep".

   Alasan itu tidak berlaku lagi: `AI_TO_MASTER_COLUMNS.sertifikasi` sekarang
   memetakan `ssw`/`lisensi` ke kolom `ssw` JUGA, dan `buildMasterBody`
   mencerminkan `bidangssw` → `ssw`. Jadi kolom itu ditulis kedua jalur, dan
   tes "daftar pengecualian tidak basi" di bawah memang menuntut entri itu
   dihapus — membiarkannya berarti daftar ini menyimpan kebohongan. */
const MASTER_ONLY: Record<string, string> = {};

/**
 * Kolom yang hanya ditulis CV AI.
 */
const AI_ONLY: Record<string, string> = {
  kenalan_di_jepang_nama_jp: 'Form Master tidak punya input kanji untuk kenalan (hanya versi Indonesia + terjemahan otomatis tidak mencakup seksi ini)',
  kenalan_di_jepang_hubungan_jp: 'idem',
  kenalan_di_jepang_pekerjaan_jp: 'idem',
  kenalan_di_jepang_alamat_jp: 'idem',
  /* Migrasi 047. Keputusan pemilik 2026-11-05: DB harus punya pasangan Jepang
     untuk SEMUA field teks, supaya template bisa memilih sisi mana yang dicetak
     (kanji saja / ID-JP / ID saja). Pasangan ini diisi tombol Terjemahkan dan
     CV AI — tidak punya input sendiri di Form Master, dan itu disengaja:
     kandidat mengetik versi Indonesia, mesin yang mengisi versi Jepang. */
  bahasa_lain_jp: 'pasangan Jepang; diisi Terjemahkan/AI, tanpa input form',
  catatan_cv_jp: 'idem',
  kontak_darurat_nama_jp: 'idem (katakana nama kontak darurat)',
  level_bahasa_inggris_jp: 'idem',
  level_bahasa_jepang_jp: 'idem',
  sertifikat_lain_jp: 'idem',
};

describe('paritas kolom Form Master ↔ CV AI', () => {
  it('kontrol: kedua peta benar-benar terbaca (bukan himpunan kosong)', () => {
    expect(masterColumns().size).toBeGreaterThan(50);
    expect(aiColumns().size).toBeGreaterThan(50);
  });

  it('kolom yang hanya ditulis Form Master sama dengan daftar beralasan', () => {
    const ai = aiColumns();
    const only = [...masterColumns()].filter((c) => !ai.has(c)).sort();
    expect(only).toEqual(Object.keys(MASTER_ONLY).sort());
  });

  it('kolom yang hanya ditulis CV AI sama dengan daftar beralasan', () => {
    const master = masterColumns();
    const only = [...aiColumns()].filter((c) => !master.has(c)).sort();
    expect(only).toEqual(Object.keys(AI_ONLY).sort());
  });

  it('setiap kolom di kedua peta ADA di kontrak (salah ejaan = 400 PGRST204)', () => {
    const contract = new Set(TABLE_COLUMNS[MASTER] || []);
    const outside = [...new Set([...masterColumns(), ...aiColumns()])].filter((c) => !contract.has(c)).sort();
    expect(outside).toEqual([]);
  });

  it('daftar pengecualian tidak basi: tidak boleh menyebut kolom yang sudah paritas', () => {
    const master = masterColumns();
    const ai = aiColumns();
    const stale = [
      ...Object.keys(MASTER_ONLY).filter((c) => ai.has(c)),
      ...Object.keys(AI_ONLY).filter((c) => master.has(c)),
    ];
    // Kalau sebuah kolom akhirnya ditulis kedua jalur, entri pengecualiannya
    // harus DIHAPUS — kalau tidak, daftar ini pelan-pelan menjadi kebohongan.
    expect(stale).toEqual([]);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   ARAH KETIGA — template → form
   ═══════════════════════════════════════════════════════════════════════════
   Dua gate di atas menjaga Master ↔ AI dan AI → kolom. Tidak ada yang menjaga
   arah yang persis ditanyakan pemilik 2026-11-12: *"daftar semua pertanyaan
   dari ke 5 template ada di cv ai dan form master?"* — waktu itu dijawab dengan
   pengukuran TANGAN (`deliverables/review-cakupan-template-2026-11-12.md`), dan
   dokumen itu sendiri mencatat "belum ada gerbang otomatis". Ini gerbangnya.

   TIGA LAPIS, semuanya diukur (bukan daftar yang diketik manusia):

   1. Setiap path `seksi.kunci` yang dibaca pemetaan nilai sebuah template harus
      ADA di kontrak `normalizeMasterData`. Kalau tidak, renderer membaca field
      yang tidak pernah ada — persis kelas `identitas.jft` dan `sertifikasi.sim`,
      yang diam-diam jatuh ke sisi kanan `??`.
   2. Field itu harus punya KOLOM yang mengisinya. Diukur dengan perturbasi satu
      kolom: `buildMasterNested` → `normalizeMasterData`, lalu lihat path mana
      yang berubah dari baseline. Path tanpa kolom = sel yang SELALU kosong.
   3. Kolom pengisi itu harus bisa ditulis salah satu form (Master atau CV AI).

   CAKUPAN: yang direkam adalah lapisan PEMETAAN NILAI (`buildValues` /
   `buildNumbers`), karena di situlah seluruh pembacaan field hidup. `render()`
   sendiri merakit zip dan memanggil `fetch`/`createImageBitmap`, yang tidak ada
   di lingkungan tes ini — sisa pembacaannya hanya `uploads.photo` dan nama sheet.
   `uploads.*` (berkas) dan `raw.*` (baris mentah) punya kontrak sendiri di bawah.
*/

/** Kolom tabel master, dari kontrak skema (bukan dari peta form). */
const CONTRACT_COLUMNS: string[] = [...(TABLE_COLUMNS[MASTER] || [])];

/**
 * Nilai probe. DUA bentuk, karena satu nilai tidak bisa memenuhi dua aturan:
 *
 * • `PROBE` = tanggal sah. Kolom tanggal melewati `toDateOnly` dan membuang
 *   nilai non-tanggal, jadi probe teks membuat kolom tanggal tampak "tidak
 *   mengisi apa pun".
 * • `PROBE_JP` = mengandung katakana. `rapikanBarisJp` MENGHAPUS kunci `_jp`
 *   yang isinya bukan huruf Jepang (nilainya dipindah ke sisi Indonesia), jadi
 *   probe Latin membuat SEMUA field `_jp` tampak "tidak ada di kontrak" —
 *   artefak pengukuran, bukan cacat renderer. Terukur pada percobaan pertama.
 */
const PROBE = '2001-02-03';
const PROBE_JP = 'テスト2001';

/** Kolom `_jp`/`katakana` diprobe dengan teks Jepang; sisanya dengan tanggal. */
function probeFor(col: string): string {
  return /_jp$|_katakana$/.test(col) ? PROBE_JP : PROBE;
}

/**
 * Baris pancing. `buildMasterNested` melewati baris riwayat yang kolom kuncinya
 * kosong (`pendidikan_N_tingkat`, `pekerjaan_N_nama_perusahaan`,
 * `keluarga_N_nama`), jadi tanpa pancing ini tidak ada satu pun elemen array
 * yang terbentuk dan seluruh field riwayat tampak "tanpa kolom".
 */
const RIWAYAT_SEED: Record<string, string> = {
  pendidikan_1_tingkat: 'SMA',
  pekerjaan_1_nama_perusahaan: 'PT UJI',
  keluarga_1_nama: 'UJI',
};

/**
 * Bentuk datar `CandidateData` → `path → nilai`.
 *
 * Elemen array diringkas menjadi `seksi[].kunci`: template membaca baris ke-0,
 * ke-1, … dengan kunci yang sama, jadi nomor indeks bukan informasi.
 */
function snapshot(row: Record<string, unknown>): Map<string, string> {
  const data = normalizeMasterData(buildMasterNested(row)) as unknown as Record<string, unknown>;
  const out = new Map<string, string>();
  for (const [section, value] of Object.entries(data)) {
    if (section === 'raw') continue;
    if (Array.isArray(value)) {
      const first = value[0] as Record<string, unknown> | undefined;
      if (!first) continue;
      for (const [k, v] of Object.entries(first)) out.set(`${section}[].${k}`, String(v));
    } else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) out.set(`${section}.${k}`, String(v));
    }
  }
  return out;
}

/** Baris dengan SETIAP kolom terisi nilai probe yang sesuai jenisnya. */
function fullRow(): Record<string, string> {
  return Object.fromEntries(CONTRACT_COLUMNS.map((c) => [c, probeFor(c)]));
}

/**
 * `path → kolom-kolom yang mengisinya`, diukur satu kolom setiap kali.
 *
 * Baseline sengaja memuat `RIWAYAT_SEED`, dan kolom seed diprobe SENDIRIAN
 * (tanpa seed) — kalau tidak, seed akan ikut terhitung sebagai pengisi setiap
 * path riwayat pada setiap perturbasi.
 */
function measuredFeeds(): Map<string, Set<string>> {
  const base = snapshot(RIWAYAT_SEED);
  const out = new Map<string, Set<string>>();
  for (const col of CONTRACT_COLUMNS) {
    const probe = probeFor(col);
    const row = col in RIWAYAT_SEED ? { [col]: probe } : { ...RIWAYAT_SEED, [col]: probe };
    for (const [path, value] of snapshot(row)) {
      if (base.get(path) === value) continue;
      let set = out.get(path);
      if (!set) { set = new Set(); out.set(path, set); }
      set.add(col);
    }
  }
  return out;
}

/**
 * Rekam setiap path yang DIBACA `run`, termasuk elemen array.
 *
 * Dipakai Proxy (bukan grep atas sumber) supaya alias dan cabang `??` ikut
 * terukur apa adanya: yang tercatat adalah yang benar-benar dievaluasi.
 */
function recordReads(data: CandidateData, run: (d: CandidateData) => unknown): string[] {
  const seen = new Set<string>();
  const wrap = (value: unknown, path: string): unknown => {
    if (value === null || typeof value !== 'object') return value;
    return new Proxy(value as object, {
      get(target, prop, receiver) {
        const read = Reflect.get(target, prop, receiver);
        if (typeof prop === 'symbol' || prop === 'length' || typeof read === 'function') return read;
        const next = `${path ? `${path}.` : ''}${String(prop)}`;
        if (read === null || typeof read !== 'object') {
          seen.add(next.replace(/\.\d+(?=\.|$)/g, '[]'));
          return read;
        }
        return wrap(read, next);
      },
    });
  };
  run(wrap(data, '') as CandidateData);
  /* `seksi[]` tanpa kunci = pembacaan elemen pertama pada array KOSONG
     (`data.keluarga[0]` saat tidak ada riwayat). Itu bukan field. */
  return [...seen].filter((p) => !p.endsWith('[]'));
}

/** Lima template yang ditawarkan pemilih, dengan fungsi pemetaan nilainya. */
const TEMPLATES: Array<{ id: string; read: (d: CandidateData) => unknown }> = [
  { id: 'rirekisho-xlsx', read: (d) => xlsxValues(d) },
  { id: 'rirekisho-firma', read: (d) => firmaValues(d) },
  { id: 'kinki', read: (d) => { kinkiValues(d); kinkiNumbers(d); } },
  { id: 'jipa', read: (d) => jipaValues(d) },
  { id: 'rirekisho-detail', read: (d) => detailValues(d) },
];

/**
 * Dataset KETIGA: struktur seksi tetap, semua kunci daun HILANG (bukan `'-'`).
 *
 * `normalizeMasterData` tidak pernah mengembalikan `undefined` — field kosong
 * menjadi string sentinel `'-'`. Akibatnya rantai `a ?? b` TIDAK PERNAH
 * mengevaluasi `b`, dan bacaan mati di sisi kanan tidak terlihat oleh dua
 * dataset di atas. Terbukti lewat uji mutasi 2026-11-13: mengembalikan
 * `data.sertifikasi.jft ?? id.jft` ke `kinki.ts` tetap HIJAU. Dataset ini
 * membuat `??` benar-benar jatuh, jadi sisi kanannya ikut terekam.
 */
function strippedData(): CandidateData {
  const strip = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(strip);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, strip(x)]));
    }
    return undefined;
  };
  return strip(normalizeMasterData(buildMasterNested({}))) as CandidateData;
}

/** Path yang dibaca tiap template, gabungan data KOSONG, PENUH, dan TANPA kunci. */
function templateReads(): Map<string, string[]> {
  const empty = normalizeMasterData(buildMasterNested({}));
  const full = normalizeMasterData(buildMasterNested(fullRow()));
  const stripped = strippedData();
  const out = new Map<string, string[]>();
  for (const t of TEMPLATES) {
    // Tiga dataset: sebagian renderer hanya membaca field B kalau field A terisi
    // (satu dataset akan melaporkan cakupan lebih sempit dari kenyataan), dan
    // cabang `??` hanya jatuh kalau nilainya benar-benar tidak ada.
    const paths = new Set([
      ...recordReads(empty, t.read),
      ...recordReads(full, t.read),
      ...recordReads(stripped, t.read),
    ]);
    out.set(t.id, [...paths].sort());
  }
  return out;
}

/**
 * Kolom yang bisa ditulis salah satu form.
 *
 * Tiga sumber, semuanya DIMINTA dari penulisnya — tidak ada yang diketik tangan:
 * peta Form Master, peta CV AI, dan slot riwayat (`buildRiwayatSlots` dengan
 * `lengkap: true` memaksa semua slot keluar walau nilainya kosong).
 */
function writableColumns(): Set<string> {
  const out = new Set([...masterColumns(), ...aiColumns()]);
  const slots = buildRiwayatSlots({ pendidikan: [{}], pekerjaan: [{}], keluarga: [{}] }, true);
  for (const col of Object.keys(slots)) out.add(col);
  /* `no_wa` = kunci join: ditulis pemanggil secara eksplisit, bukan lewat peta
     (`ai-cv-column-coverage.test.ts` mencatat alasan yang sama). */
  out.add('no_wa');
  return out;
}

/**
 * Path yang dibaca template tetapi TIDAK punya kolom yang bisa ditulis form.
 * Setiap entri WAJIB punya alasan. Ini tempat keputusan dicatat, bukan tempat
 * menyembunyikan kelalaian — tes terakhir menuntut daftar ini tidak basi.
 */
const NO_FORM_FIELD_BY_DESIGN: Record<string, string> = {};

describe('paritas template → form (field yang dicetak ⊆ field yang bisa diisi)', () => {
  it('kontrol: perekam benar-benar melihat field (bukan himpunan kosong)', () => {
    for (const [id, paths] of templateReads()) {
      expect(paths.length, `${id} tidak membaca field apa pun`).toBeGreaterThan(20);
    }
  });

  it('tidak ada bacaan MATI: setiap field yang dibaca template ada di kontrak data', () => {
    const contract = new Set(snapshot(fullRow()).keys());
    /* `raw.*` adalah baris mentah yang dikembalikan `handleGetDrafCvMaster`:
       bentuk bersarang `buildMasterNested` + dua kunci yang ditempel handler. */
    const rawKeys = new Set([...Object.keys(buildMasterNested({})), 'AIDATAJSON', 'id_kandidat']);
    const dead: string[] = [];
    for (const [id, paths] of templateReads()) {
      for (const path of paths) {
        if (path.startsWith('raw.')) {
          if (!rawKeys.has(path.slice(4))) dead.push(`${id}: ${path}`);
          continue;
        }
        if (!contract.has(path)) dead.push(`${id}: ${path}`);
      }
    }
    expect(dead).toEqual([]);
  });

  it('setiap field yang dicetak punya kolom pengisi yang bisa ditulis form', () => {
    const writable = writableColumns();
    const feeds = measuredFeeds();
    const orphans: string[] = [];
    for (const [id, paths] of templateReads()) {
      for (const path of paths) {
        /* `uploads.*` = berkas unggahan (foto, KTP, ijazah), bukan pertanyaan
           form; kolomnya diisi alur unggah, bukan oleh kedua form ini. */
        if (path.startsWith('raw.') || path.startsWith('uploads.') || path in NO_FORM_FIELD_BY_DESIGN) continue;
        const sources = [...(feeds.get(path) ?? [])];
        if (sources.length === 0) { orphans.push(`${id}: ${path} ← tidak ada kolom`); continue; }
        if (!sources.some((c) => writable.has(c))) {
          orphans.push(`${id}: ${path} ← ${sources.join(', ')} (tidak ditulis form mana pun)`);
        }
      }
    }
    expect(orphans).toEqual([]);
  });

  it('daftar pengecualian tidak basi: tidak boleh menyebut field yang sudah punya kolom', () => {
    const writable = writableColumns();
    const feeds = measuredFeeds();
    const stale = Object.keys(NO_FORM_FIELD_BY_DESIGN).filter((path) =>
      [...(feeds.get(path) ?? [])].some((c) => writable.has(c)),
    );
    expect(stale).toEqual([]);
  });
});
