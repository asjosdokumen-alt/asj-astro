// ==========================================
// TESTS: berkasCatalog ↔ backend FILE_LABEL_COLUMNS contract (#10 / C05)
//
// Why this test exists
//   The A05 root bug: the modal sent `jenisBerkas` tokens the backend did not
//   know ('SD', 'UNIV', 'CERT', 'FOTO2' — derived from the input element id).
//   The Cloudinary upload SUCCEEDED, the backend then looked the token up,
//   found nothing, and dropped it silently. The admin saw a green toast and the
//   document was never persisted — invisible data loss.
//
//   `netlify/functions/contexts/service-a05.test.ts` covers the backend half
//   (the alias table). What was NOT covered is the *pair*: nothing stopped a
//   client-side edit to berkasCatalog.ts from renaming a `jenis`, and the
//   mismatch would only ever show up as a missing document in production.
//
//   This test imports BOTH sides LIVE — no pinned copy to drift. A frontend
//   test importing the backend module is deliberate and verified working; the
//   repo's `documentColumns.test.ts` predates that and pins literals instead,
//   which is the weaker form. Assertions, thrice over:
//     (1) every `jenis` is a key of FILE_LABEL_COLUMNS
//     (2) its `pemberkasan` column is non-null — a token accepted but mapped to
//         null columns is thrown away just as silently
//     (3) its `key` equals that column minus the `_url` suffix, so
//         candidate.berkas / attachBerkasBio cannot drift from the DB either
// ==========================================
import { describe, it, expect } from 'vitest';
import {
  BERKAS_TAHAP1,
  BERKAS_TAHAP2,
  ALL_BERKAS,
  BERKAS_BY_KEY,
  hasBerkasUrl,
  extensionsFromAccept,
  extensionOf,
  rejectExtension,
} from './berkasCatalog';
import { FILE_LABEL_COLUMNS } from '../../netlify/functions/contexts/documents/service';

describe('berkasCatalog → FILE_LABEL_COLUMNS (C05 contract)', () => {
  it('every jenis is a key the backend recognises', () => {
    const unknown = ALL_BERKAS.filter((d) => !FILE_LABEL_COLUMNS[d.jenis]).map(
      (d) => `${d.key} → "${d.jenis}"`,
    );
    // An unknown token means storage gets the file and the DB never does.
    expect(unknown).toEqual([]);
  });

  it('every jenis maps to a non-null pemberkasan column', () => {
    const dead = ALL_BERKAS.filter(
      (d) => FILE_LABEL_COLUMNS[d.jenis].pemberkasan === null,
    ).map((d) => `${d.key} → "${d.jenis}"`);
    expect(dead).toEqual([]);
  });

  it("every key matches its column name minus the '_url' suffix", () => {
    const drift = ALL_BERKAS.filter((d) => {
      const col = FILE_LABEL_COLUMNS[d.jenis].pemberkasan as string;
      return col.replace(/_url$/, '') !== d.key;
    }).map((d) => `${d.key} ≠ ${FILE_LABEL_COLUMNS[d.jenis].pemberkasan}`);
    // candidate.berkas (prefill + Sudah/Belum marks) reads by `key`; the DB
    // writes by column. If these drift the modal shows "Belum" for a document
    // that is actually stored, and the overwrite confirmation never fires.
    expect(drift).toEqual([]);
  });

  it('the two stages together are the 18 documents legacy uploads', () => {
    expect(BERKAS_TAHAP1).toHaveLength(12);
    expect(BERKAS_TAHAP2).toHaveLength(6);
    // Legacy prosesUploadPemberkasan: 12 inputs stage 1, 6 inputs stage 2.
    expect(ALL_BERKAS).toHaveLength(18);
  });

  it('keys and jenis are unique (a duplicate silently shadows the other)', () => {
    expect(new Set(ALL_BERKAS.map((d) => d.key)).size).toBe(ALL_BERKAS.length);
    expect(new Set(ALL_BERKAS.map((d) => d.jenis)).size).toBe(ALL_BERKAS.length);
  });

  it('BERKAS_BY_KEY resolves every key to its own definition', () => {
    for (const d of ALL_BERKAS) {
      expect(BERKAS_BY_KEY[d.key]).toBe(d);
    }
  });

  it('every document declares an accept filter and an i18n label', () => {
    for (const d of ALL_BERKAS) {
      expect(d.accept, d.key).toMatch(/^\./);
      // dotted namespace, e.g. candidate.form_kk / ui.doc7_mcu (digits allowed).
      expect(d.label, d.key).toMatch(/^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/);
    }
  });

  it('only KTP and the studio photo are flagged amber (wajib)', () => {
    // Legacy marks exactly these two with the mandatory/amber styling.
    expect(ALL_BERKAS.filter((d) => d.amber).map((d) => d.key)).toEqual(['ktp', 'foto2']);
  });

  it('KTP accepts images as well as PDF; the ID photo accepts images only', () => {
    // Parity with the legacy <input accept> in modal-pemberkasan.
    expect(BERKAS_BY_KEY.ktp.accept).toContain('.jpg');
    expect(BERKAS_BY_KEY.ktp.accept).toContain('.pdf');
    expect(BERKAS_BY_KEY.foto2.accept).not.toContain('.pdf');
  });

  it('the legacy long labels resolve to the SAME column as the short token', () => {
    // Both vocabularies must live side by side: old rows and robots still speak
    // "CERTIFICATE JAPAN" while the rebuilt modal speaks "SERTIFIKAT".
    const pairs: [string, string][] = [
      ['SERTIFIKAT', 'CERTIFICATE JAPAN'],
      ['FOTO 2X3', 'PAS FOTO STUDIO'],
      ['IZIN ORTU', 'SURAT IJIN ORTU'],
      ['BUKU NIKAH', 'STATUS PERKAWINAN'],
      ['SURAT SEHAT', 'SURAT SEHAT PUSKESMAS'],
      ['PSIKOTES', 'HASIL PSIKOTES'],
      ['UNIVERSITAS', 'IJAZAH UNIVERSITAS'],
    ];
    for (const [short, legacy] of pairs) {
      expect(FILE_LABEL_COLUMNS[legacy].pemberkasan, legacy).toBe(
        FILE_LABEL_COLUMNS[short].pemberkasan,
      );
    }
  });
});

describe('hasBerkasUrl — the "sudah ada / timpa" predicate', () => {
  it('treats a real URL as present', () => {
    expect(hasBerkasUrl('https://x/y.pdf')).toBe(true);
  });

  it('treats every legacy placeholder as absent', () => {
    // These are the values actually found in stored rows. Treating them as
    // present would make the modal claim a document exists when it does not,
    // and would fire a pointless "will be overwritten" confirmation.
    for (const v of ['', '-', 'null', 'undefined', null, undefined]) {
      expect(hasBerkasUrl(v as any)).toBe(false);
    }
  });
});

describe('extension guard (#10 — parity legacy cekEkstensiFile)', () => {
  it('extensionsFromAccept parses a dotted accept list', () => {
    expect(extensionsFromAccept('.pdf')).toEqual(['pdf']);
    expect(extensionsFromAccept('.pdf,.jpg,.jpeg,.png')).toEqual(['pdf', 'jpg', 'jpeg', 'png']);
    expect(extensionsFromAccept(' .PDF , .JPG ')).toEqual(['pdf', 'jpg']);
  });

  it('extensionsFromAccept drops MIME entries (this catalog is extension-only)', () => {
    expect(extensionsFromAccept('image/*,.pdf')).toEqual(['pdf']);
    expect(extensionsFromAccept('')).toEqual([]);
  });

  it('extensionOf is lowercase and survives dots in the name', () => {
    expect(extensionOf('Scan KTP.PDF')).toBe('pdf');
    expect(extensionOf('a.b.c.jpg')).toBe('jpg');
    expect(extensionOf('noext')).toBe('');
    expect(extensionOf('trailing.')).toBe('');
    expect(extensionOf('')).toBe('');
  });

  it('rejects a document whose extension is not in its accept list', () => {
    // The real bug: legacy checked this and the rebuilt modal did not, so a
    // wrong-typed file was uploaded and persisted as a broken document.
    expect(rejectExtension(BERKAS_BY_KEY.sd, 'ijazah.docx')).toBe('ijazah.docx');
    expect(rejectExtension(BERKAS_BY_KEY.sd, 'ijazah.png')).toBe('ijazah.png');
  });

  it('accepts a correct extension, case-insensitively', () => {
    expect(rejectExtension(BERKAS_BY_KEY.sd, 'ijazah.pdf')).toBeNull();
    expect(rejectExtension(BERKAS_BY_KEY.sd, 'IJAZAH.PDF')).toBeNull();
    expect(rejectExtension(BERKAS_BY_KEY.ktp, 'ktp.JPG')).toBeNull();
  });

  it('lets KTP through as an image but not the ID photo as a PDF', () => {
    expect(rejectExtension(BERKAS_BY_KEY.ktp, 'ktp.png')).toBeNull();
    expect(rejectExtension(BERKAS_BY_KEY.foto2, 'foto.pdf')).toBe('foto.pdf');
  });

  it('rejects a file with no extension at all', () => {
    expect(rejectExtension(BERKAS_BY_KEY.sd, 'ijazah')).toBe('ijazah');
  });

  it('every catalog document can be satisfied by at least one name', () => {
    // Guards against an accept typo that would make a slot un-fillable.
    for (const d of ALL_BERKAS) {
      const first = extensionsFromAccept(d.accept)[0];
      expect(first, d.key).toBeTruthy();
      expect(rejectExtension(d, `x.${first}`), d.key).toBeNull();
    }
  });
});
