// ==========================================
// TESTS: kolom tanggal tidak pernah lagi mencetak cap waktu ISO.
//
// KENAPA DI `e2e/`: tier `e2e` hanya menghitung mjs/cjs/js, jadi suite `.ts` di
// sini tidak menggerakkan counter beku (lihat catatan yang sama di
// `e2e/ai-cv-filter.test.ts` / `e2e/ai-cv-submit.test.ts`).
//
// KELUHAN PEMILIK (2026-10-12)
// ---------------------------
//   ":00:00.000Z tolong hapus ini kesalahan data itu harus nya murni tgl saja"
//
// Terukur atas DB live `gdwvffmevwtwnzrapjwy` (probe `F:/tmp/probe-dates.mjs`):
//
//   master_database_candidate.tgl_lahir   ISO 65 · yyyy-mm-dd 26 · dd-mm-yyyy 1
//   database_candidate.tgl_lahir          ISO 53 · yyyy-mm-dd 34 · dd-mm-yyyy 5
//   database_asj_form.tgl_lahir           ISO  4 · yyyy-mm-dd  7
//
// Jadi ada TIGA bentuk beredar untuk satu kolom yang sama, dan dua di antaranya
// salah cetak. Dua cacat pada bentuk ISO, bukan satu:
//   1. tidak terbaca (`2008-04-04T17:00:00.000Z`);
//   2. harinya MUNDUR satu — stempel itu tengah malam WIB yang disimpan UTC,
//      jadi tanggal yang dimaksud adalah 2008-04-05.
// Bentuk `dd-mm-yyyy` juga salah cetak untuk `<input type=date>`, yang hanya
// menerima `yyyy-mm-dd` — sebab itu tanggal lahir tampil KOSONG di modal Edit
// kandidat dan di form Master.
//
// KENAPA `yyyy-mm-dd` YANG DIPILIH (bukan `dd/mm/yyyy`)
// ----------------------------------------------------
// Itu bentuk yang SELURUH pipa sudah pakai: `<input type=date>`,
// `computeAge()` (`EditCandidateModal`), `birthDate()` (`rirekisho-xlsx`),
// `masterPrefill` dan `cv-template-factory` — semuanya memaku `yyyy-mm-dd`.
// Ia juga tidak ambigu (`05/04` bisa 5 April atau 4 Mei; data nyata memuat
// KEDUANYA bentuk terpisah-dash, jadi ambiguitas itu bukan teori).
//
// DUA BATAS, SATU IMPLEMENTASI
// ---------------------------
//   · BACA  — `toDateOnly()` dipakai di tiga titik: `mapCandidate` (list/dossier),
//             `buildMasterNested` (CV + blok master biodata), `attachBerkasBio`
//             (`bio.tgllahir` untuk berkas unduhan & prefill form).
//   · TULIS — `writeBodyFor()` di `db/client.ts`, SATU-satunya tempat semua
//             penulisan PostgREST lewat. Tanpa ini, sinkronisasi dari spreadsheet
//             atau jalur AI CV bisa menanam cap waktu baru lagi.
// ==========================================
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toDateOnly, writeBodyFor } from '../netlify/functions/_lib/db/client';
import { mapCandidate } from '../netlify/functions/_lib/db/candidates';
import { buildMasterNested } from '../netlify/functions/contexts/master-data/service';
import { attachBerkasBio } from '../netlify/functions/_lib/db/berkas';

// `attachBerkasBio` membaca DB lewat `supabaseJson`. Mock HANYA jalur baca itu —
// `importOriginal` menyisakan `toDateOnly`/`writeBodyFor` yang asli, sehingga
// satu berkas ini menguji implementasi yang benar-benar dikirim, bukan tiruannya.
const h = vi.hoisted(() => ({ supabaseJson: vi.fn() }));

vi.mock('../netlify/functions/_lib/db/client', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, supabaseJson: h.supabaseJson };
});

const ISO_WIB_MIDNIGHT = '2008-04-04T17:00:00.000Z'; // = 2008-04-05 00:00 WIB
const ISO_UTC_MIDNIGHT = '2008-04-05T00:00:00.000Z'; // = 2008-04-05 07:00 WIB

describe('toDateOnly — satu bentuk baku: yyyy-mm-dd', () => {
  it('cap waktu ISO → tanggal WIB, harinya TIDAK mundur', () => {
    expect(toDateOnly(ISO_WIB_MIDNIGHT)).toBe('2008-04-05');
    expect(toDateOnly('2004-01-16T17:00:00.000Z')).toBe('2004-01-17');
    expect(toDateOnly('2007-01-07T17:00:00.000Z')).toBe('2007-01-08');
  });

  it('cap waktu ISO tengah malam UTC (hasil tulis baru) → hari yang sama', () => {
    // Menulis `2008-04-05` ke kolom `timestamptz` lalu membacanya kembali
    // menghasilkan bentuk ini. Bulat-balik harus stabil, bukan bergeser tiap simpan.
    expect(toDateOnly(ISO_UTC_MIDNIGHT)).toBe('2008-04-05');
  });

  it('offset zona eksplisit ikut dihormati', () => {
    expect(toDateOnly('2008-04-04T17:00:00+07:00')).toBe('2008-04-04');
  });

  it('bentuk warisan dd-mm-yyyy / dd/mm/yyyy → yyyy-mm-dd', () => {
    // Dua contoh INI diambil dari baris nyata di DB.
    expect(toDateOnly('05-04-2008')).toBe('2008-04-05'); // ASJ00181 (Adellia)
    expect(toDateOnly('01-08-2001')).toBe('2001-08-01');
    expect(toDateOnly('05/04/2008')).toBe('2008-04-05');
    expect(toDateOnly('1/8/2001')).toBe('2001-08-01');
  });

  it('yyyy-mm-dd yang sudah benar dibiarkan apa adanya (tidak ada churn)', () => {
    expect(toDateOnly('2006-11-25')).toBe('2006-11-25');
    expect(toDateOnly('2006/11/25')).toBe('2006-11-25');
    expect(toDateOnly('2006-1-5')).toBe('2006-01-05');
  });

  it('cap waktu tanpa zona → bagian tanggalnya saja, TANPA geser hari', () => {
    expect(toDateOnly('2008-04-04 00:00:00')).toBe('2008-04-04');
    expect(toDateOnly('2008-04-04T00:00:00')).toBe('2008-04-04');
  });

  it('kosong, tanda hubung, dan teks biasa tidak disentuh', () => {
    expect(toDateOnly('')).toBe('');
    expect(toDateOnly(null)).toBe('');
    expect(toDateOnly(undefined)).toBe('');
    expect(toDateOnly('-')).toBe('-');
    expect(toDateOnly('SMA')).toBe('SMA');
    expect(toDateOnly('2006')).toBe('2006');
    expect(toDateOnly('lahir 2008')).toBe('lahir 2008');
  });
});

describe('writeBodyFor — tanggal dikoersi di SATU titik tulis', () => {
  it('master_database_candidate: cap waktu ISO tidak masuk DB', () => {
    const { body, dropped } = writeBodyFor('master_database_candidate', {
      nama_lengkap: 'ADELLIA',
      tgl_lahir: ISO_WIB_MIDNIGHT,
      tgl_terbit_pasport: '2020-01-01T17:00:00.000Z',
      exp_pasport: '2030-01-01T17:00:00.000Z',
    }) as { body: Record<string, string>; dropped: string[] };
    expect(dropped).toEqual([]);
    expect(body.tgl_lahir).toBe('2008-04-05');
    expect(body.tgl_terbit_pasport).toBe('2020-01-02');
    expect(body.exp_pasport).toBe('2030-01-02');
    expect(body.nama_lengkap).toBe('ADELLIA'); // kolom non-tanggal utuh
  });

  it('database_candidate & database_asj_form ikut dikoersi', () => {
    const c = writeBodyFor('database_candidate', { tgl_lahir: '05-04-2008' }) as {
      body: Record<string, string>;
    };
    expect(c.body.tgl_lahir).toBe('2008-04-05');
    const f = writeBodyFor('database_asj_form', [{ tgl_lahir: '2004-01-16T17:00:00.000Z' }]) as {
      body: Record<string, string>[];
    };
    expect(f.body[0].tgl_lahir).toBe('2004-01-17'); // badan berbentuk larik pun dikoersi
  });

  it('kolom cap waktu MESIN tidak ikut dikoersi (peta sengaja sempit)', () => {
    const { body } = writeBodyFor('master_database_candidate', {
      created_at: '2026-10-12T03:04:05.000Z',
      updated_at: '2026-10-12T03:04:05.000Z',
      ai_updated_at: '2026-10-12T03:04:05.000Z',
    }) as { body: Record<string, string> };
    // Jamnya NYATA di kolom-kolom ini — memotongnya jadi tanggal = kehilangan data.
    expect(body.created_at).toBe('2026-10-12T03:04:05.000Z');
    expect(body.updated_at).toBe('2026-10-12T03:04:05.000Z');
    expect(body.ai_updated_at).toBe('2026-10-12T03:04:05.000Z');
  });

  it('tabel di luar kontrak tidak disentuh', () => {
    const { body } = writeBodyFor('tabel_yang_tidak_ada', { tgl_lahir: ISO_WIB_MIDNIGHT }) as {
      body: Record<string, string>;
    };
    expect(body.tgl_lahir).toBe(ISO_WIB_MIDNIGHT);
  });
});

describe('batas baca — mapCandidate, buildMasterNested, attachBerkasBio', () => {
  it('mapCandidate: tglLahir & ttl bersih, tidak ada cap waktu', () => {
    const c = mapCandidate({
      id_kandidat: 'ASJ00181',
      nama_lengkap: 'ADELLIA',
      tempat_lahir: 'PONOROGO',
      tgl_lahir: ISO_WIB_MIDNIGHT,
    });
    expect(c.tglLahir).toBe('2008-04-05');
    expect(c.ttl).toBe('PONOROGO, 2008-04-05');
    // `_raw` SENGAJA membawa baris DB apa adanya (ia dipakai sebagai jalan
    // keluar), jadi yang diperiksa adalah field yang benar-benar dikirim ke
    // layar — bukan seluruh objek.
    const { _raw, ...terkirim } = c as Record<string, unknown>;
    expect(_raw, 'kontrol: _raw memang ada').toBeTruthy();
    expect(JSON.stringify(terkirim)).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  });

  it('buildMasterNested: identitas & paspor bersih (jalur CV + blok master biodata)', () => {
    const n = buildMasterNested({
      nama_lengkap: 'ADELLIA',
      tgl_lahir: ISO_WIB_MIDNIGHT,
      tgl_terbit_pasport: '2020-01-01T17:00:00.000Z',
      exp_pasport: '2030-01-01T17:00:00.000Z',
    });
    expect(n.identitas.tgl_lahir).toBe('2008-04-05');
    expect(n.identitas.tgl_terbit_paspor).toBe('2020-01-02');
    expect(n.identitas.exp_paspor).toBe('2030-01-02');
  });

  it('attachBerkasBio: bio.tgllahir bersih — sumber baris "Tanggal Lahir" unduhan', async () => {
    const masterRow = [
      {
        id: 1,
        id_kandidat: 'ASJ00181',
        no_wa: '6281234567890',
        tempat_lahir: 'PONOROGO',
        tgl_lahir: ISO_WIB_MIDNIGHT,
        tgl_terbit_pasport: '2020-01-01T17:00:00.000Z',
        exp_pasport: '2030-01-01T17:00:00.000Z',
      },
    ];
    // BARIS master kini dibaca lewat RPC `master_light` DULU (migrasi 018 —
    // ia yang membuat cast `ai_data_json::jsonb` bisa dilakukan), dan baru
    // jatuh ke proyeksi PostgREST biasa kalau RPC-nya tidak ada. Mock mengikuti
    // kontrak itu: jalur utama dilayani RPC, dan GET tetap dilayani supaya
    // jalur fallback juga tersedia untuk tes yang memicunya.
    h.supabaseJson.mockImplementation(async (_method: string, table: string) => {
      if (table === 'rpc/master_light' || table === 'master_database_candidate') return masterRow;
      return [];
    });
    const out = await attachBerkasBio([{ wa: '6281234567890', nama: 'ADELLIA' }]);
    expect(out[0].bio.tgllahir).toBe('2008-04-05');
    expect(out[0].bio.tglpasport).toBe('2020-01-02');
    expect(out[0].bio.exppasport).toBe('2030-01-02');
  });
});

beforeEach(() => {
  h.supabaseJson.mockReset();
});
