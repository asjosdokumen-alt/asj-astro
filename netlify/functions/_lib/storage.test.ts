// ==========================================
// TESTS: isVarianOf & stemAliases (storage.js — helper Supabase Storage).
// Alur upload harus MENIMPA file lama per tipe dokumen: varian bertimestamp
// (KK_1786683312223.pdf) maupun polos (KK.jpg) ikut dihapus sebelum upload
// baru, supaya tombol KK/KTP/CV di share view tidak pernah dobel.
// ==========================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

// `uploadBase64` (see the S7 describe block at the bottom) must not touch the
// network, and `.env.local` at the repo root makes `supabaseUrl()` resolve for
// real. Stub ONLY `request`, spreading the actual module so `BUDGETS` /
// `HttpError` / `TimeoutError` (imported elsewhere in this graph) stay real.
// `storageRequest` never inspects the URL/key it is handed, so stubbing
// `request` alone is sufficient — `db/client` and `env` are deliberately left
// REAL so the `isAllowedDocumentUrl` tests below keep exercising the true
// host-resolution path instead of a mock.
const { requestMock } = vi.hoisted(() => ({
  requestMock: vi.fn(async () => ({ ok: true, text: async () => '{}' })),
}));
vi.mock('./kernel/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./kernel/http')>();
  return { ...actual, request: requestMock };
});

import { isVarianOf, stemAliases, isAllowedDocumentUrl, isAllowedUploadExtension, mimeFromName, uploadBase64 } from './storage';
import { buildRingkasData } from './ai/cv';

describe('isVarianOf', () => {
  it('varian bertimestamp terdeteksi (KK_1786….pdf milik stem KK)', () => {
    expect(isVarianOf('KK_1786683312223.pdf', 'KK')).toBe(true);
    expect(isVarianOf('KTP_1786700397069.pdf', 'KTP')).toBe(true);
    expect(isVarianOf('CVFILE_1786683307401.xlsx', 'CVFILE')).toBe(true);
  });

  it('varian polos terdeteksi (KK.jpg, KTP.png)', () => {
    expect(isVarianOf('KK.jpg', 'KK')).toBe(true);
    expect(isVarianOf('KTP.png', 'KTP')).toBe(true);
  });

  it('stem berbeda tidak tertabrak (KTP bukan varian KK)', () => {
    expect(isVarianOf('KTP_1786683311216.pdf', 'KK')).toBe(false);
    expect(isVarianOf('KK_1786683312223.pdf', 'KTP')).toBe(false);
    expect(isVarianOf('CVFILE_1786.pdf', 'CV')).toBe(false);
  });

  it('alias ikut tertabrak via stemAliases (KARTU_KELUARGA = KK)', () => {
    const stems = ['KK'].concat(stemAliases('KK'));
    expect(stems.some((s) => isVarianOf('KARTU_KELUARGA_123.pdf', s))).toBe(true);
  });

  it('nama kosong / stem kosong aman', () => {
    expect(isVarianOf('', 'KK')).toBe(false);
    expect(isVarianOf('KK.pdf', '')).toBe(false);
  });
});

describe('stemAliases', () => {
  it('KK <-> KARTU_KELUARGA, PHOTOFILE <-> PAS_PHOTO/FOTO', () => {
    expect(stemAliases('KK')).toContain('KARTU_KELUARGA');
    expect(stemAliases('KARTU_KELUARGA')).toContain('KK');
    expect(stemAliases('PHOTOFILE')).toContain('PAS_PHOTO');
    expect(stemAliases('PAS_PHOTO')).toContain('PHOTOFILE');
  });

  it('CV / CVFILE / CV_REVISI saling alias', () => {
    expect(stemAliases('CV')).toContain('CVFILE');
    expect(stemAliases('CVFILE')).toContain('CV');
    expect(stemAliases('CV_REVISI')).toContain('CV');
  });

  it('stem tanpa alias mengembalikan array kosong', () => {
    expect(stemAliases('KTP')).toEqual([]);
  });
});

describe('buildRingkasData (konteks AI chat)', () => {
  it('memuat TB/BB & ukuran yang terisi, tanpa data kosong', () => {
    const out = buildRingkasData({
      identitas: { nama_lengkap: 'AGUS KHOCI', ktp: '', paspor: '' },
      fisik: { tb: '165', bb: '57', topi: '', baju: 'L' },
      sertifikasi: { jft: 'A2' },
      pendidikan: [{ tingkat: 'SMK', sekolah: 'SMAN 1', tahun_lulus: '2015' }],
    });
    expect(out).toContain('Tinggi badan: 165 cm');
    expect(out).toContain('Berat badan: 57 kg');
    expect(out).toContain('Ukuran baju: L');
    expect(out).toContain('Bahasa Jepang (JLPT/JFT): A2');
    expect(out).not.toContain('NIK KTP'); // kosong -> tidak dilist sebagai terisi
    expect(out).not.toContain('Ukuran topi'); // kosong -> tidak dilist
  });

  it('menangani input kosong/tanpa data', () => {
    expect(buildRingkasData(undefined)).toBe('');
    expect(buildRingkasData({})).toBe('');
  });
});

describe('isAllowedDocumentUrl (C6 — https-only + storage-host allow-list)', () => {
  it('menerima https dari host penyimpanan resmi (supabase/cloudinary/GCS, subdomain boleh)', () => {
    expect(isAllowedDocumentUrl('https://abcdefgh.supabase.co/storage/v1/object/public/asj-files/master/AB/CV.pdf')).toBe(true);
    expect(isAllowedDocumentUrl('https://supabase.co/x.pdf')).toBe(true);
    expect(isAllowedDocumentUrl('https://res.cloudinary.com/asj/image/upload/v1/cv.pdf')).toBe(true);
    expect(isAllowedDocumentUrl('https://storage.googleapis.com/asj-docs/cv.pdf')).toBe(true);
  });

  it('host mirip tapi di luar allow-list tetap ditolak (firebasestorage bukan storage.googleapis.com)', () => {
    expect(isAllowedDocumentUrl('https://firebasestorage.googleapis.com/v0/b/asj/o/cv.pdf')).toBe(false);
    expect(isAllowedDocumentUrl('https://notstorage.googleapis.com.evil.com/cv.pdf')).toBe(false);
  });

  it('menolak skema non-https walau host di allow-list', () => {
    expect(isAllowedDocumentUrl('http://res.cloudinary.com/cv.pdf')).toBe(false);
    expect(isAllowedDocumentUrl('ftp://supabase.co/cv.pdf')).toBe(false);
    expect(isAllowedDocumentUrl('javascript:alert(1)')).toBe(false);
  });

  it('menolak host di luar allow-list (termasuk lookalike subdomain)', () => {
    expect(isAllowedDocumentUrl('https://evil.example.com/cv.pdf')).toBe(false);
    expect(isAllowedDocumentUrl('https://supabase.co.evil.com/cv.pdf')).toBe(false);
    expect(isAllowedDocumentUrl('https://evil.supabase.co.evil.com/cv.pdf')).toBe(false);
    expect(isAllowedDocumentUrl('https://supabase.co.evil.com')).toBe(false);
  });

  it('menolak input non-URL / kosong', () => {
    expect(isAllowedDocumentUrl('')).toBe(false);
    expect(isAllowedDocumentUrl('not a url')).toBe(false);
    expect(isAllowedDocumentUrl('cv.pdf')).toBe(false);
    expect(isAllowedDocumentUrl(undefined as unknown as string)).toBe(false);
  });
});

describe('isAllowedUploadExtension (S7 — allow-list tipe upload server-side)', () => {
  // The set must be a SUPERSET of every `accept=` in src/components/** minus
  // active content (see the coupling note in _lib/storage.ts). These are the
  // extensions the UI actually offers — INCLUDING the ones a too-narrow set
  // would have broken (.doc/.xls/.csv/.txt/.gif). That is the point of listing
  // them: it fails loudly if the allow-list is narrowed again.
  const UI_OFFERED = [
    'pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', // gif/bmp via `image/*`
    'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt',
  ];

  it('menerima SEMUA tipe yang ditawarkan UI (termasuk doc/xls/csv/txt/gif)', () => {
    for (const ext of UI_OFFERED) {
      expect(isAllowedUploadExtension(ext), ext).toBe(true);
    }
  });

  it('doc/xls/csv/txt/gif khususnya — set sempit pertama akan GAGAL di sini', () => {
    // Regresi yang dicegah: allow-list pertama (pdf/jpg/jpeg/png/webp/docx/xlsx)
    // menolak kelimanya, padahal semuanya ditawarkan `accept=` di src/components.
    for (const ext of ['doc', 'xls', 'csv', 'txt', 'gif']) {
      expect(isAllowedUploadExtension(ext), ext).toBe(true);
    }
  });

  it('tipe dokumen lawas dari peta MIME lama tetap diterima', () => {
    for (const ext of ['ppt', 'pptx', 'rtf', 'odt']) {
      expect(isAllowedUploadExtension(ext), ext).toBe(true);
    }
  });

  it('case-insensitive & toleran titik depan (PDF, .JPG)', () => {
    expect(isAllowedUploadExtension('PDF')).toBe(true);
    expect(isAllowedUploadExtension('.JPG')).toBe(true);
  });

  it('menolak konten AKTIF/executable (svg, html, js, mjs, cjs, exe, sh)', () => {
    for (const ext of ['svg', 'html', 'htm', 'js', 'mjs', 'cjs', 'exe', 'sh']) {
      expect(isAllowedUploadExtension(ext), ext).toBe(false);
    }
  });

  it('menolak ekstensi asing & input kosong', () => {
    for (const ext of ['php', 'bin', 'zip', 'apk', 'bat', '', undefined]) {
      expect(isAllowedUploadExtension(ext), String(ext)).toBe(false);
    }
  });
});

describe('mimeFromName (S7 — tipe allow-list punya MIME iner)', () => {
  it('memetakan tipe yang diizinkan', () => {
    expect(mimeFromName('a.pdf')).toBe('application/pdf');
    expect(mimeFromName('a.png')).toBe('image/png');
    expect(mimeFromName('a.doc')).toBe('application/msword');
    expect(mimeFromName('a.xls')).toBe('application/vnd.ms-excel');
    expect(mimeFromName('a.csv')).toBe('text/csv');
    expect(mimeFromName('a.txt')).toBe('text/plain');
    expect(mimeFromName('a.docx')).toContain('wordprocessingml');
    expect(mimeFromName('a.xlsx')).toContain('spreadsheetml');
  });

  it('svg tidak lagi punya MIME (regresi: dulu image/svg+xml)', () => {
    expect(mimeFromName('x.svg')).toBe('application/octet-stream');
  });
});

// ==========================================
// TESTS: uploadBase64 — gerbang allow-list SEBELUM menyentuh storage (S7).
//
// `uploadBase64` menurunkan Content-Type dari NAMA FILE yang dikirim klien dan
// dulu menerima ekstensi apa pun (peta MIME-nya bahkan memuat svg). Sekarang
// ekstensi di luar allow-list harus ditolak TANPA memanggil storage sama sekali.
// Dipisah dari blok allow-list di atas karena blok itu hanya menguji fungsi
// murni; di sini gerbangnya benar-benar dieksekusi lewat jalur upload.
// ==========================================
describe('uploadBase64 — gerbang allow-list sebelum storage (S7)', () => {
  beforeEach(() => {
    requestMock.mockClear();
  });

  it('menolak .svg tanpa memanggil storage sama sekali', async () => {
    const out = await uploadBase64('ZmFrZQ==', 'folder', 'evil.svg');
    expect(out).toBeNull();
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('menolak ekstensi aktif/asing lain (html, js, exe, bin) sebelum storage', async () => {
    for (const ext of ['html', 'js', 'exe', 'bin']) {
      requestMock.mockClear();
      const out = await uploadBase64('ZmFrZQ==', 'folder', `x.${ext}`);
      expect(out, ext).toBeNull();
      expect(requestMock, ext).not.toHaveBeenCalled();
    }
  });

  it('melanjutkan untuk ekstensi yang diizinkan (storage dipanggil)', async () => {
    const out = await uploadBase64('ZmFrZQ==', 'folder', 'ok.pdf');
    expect(String(out)).toContain('folder/ok.pdf');
    expect(requestMock).toHaveBeenCalled();
  });
});
