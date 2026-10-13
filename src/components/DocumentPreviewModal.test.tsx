// ==========================================
// TESTS: DocumentPreviewModal (B03 parity, 2026-09-05)
//
// Legacy ground truth: js/init/preview.ts previewFileInFrame() +
// js/03_candidate.ts bukaPreviewDokumen() — satu pintu preview inline:
//   image/PDF -> native/gview iframe, Office -> MS Office viewer,
//   unsupported (zip/dll) -> pesan + tombol Unduh (anti auto-download),
//   Drive folder link -> window.open tab fallback.
// Root bugs pinned here:
//   - seluruh chrome hard-coded (loading/error/fallback/unduh) → t() keys
//     (id+jp; preview_loading/preview_unavailable jp ditambah dll)
//   - Drive folder URL (tak bisa di-preview) harus fallback ke tab baru
//     (parity bukaPreviewDokumen), bukan iframe kosong
// ==========================================
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import DocumentPreviewModal, { isDriveFolder } from './DocumentPreviewModal';

vi.mock('../store/i18n', () => ({ t: (k: string) => k }));

const openSpy = vi.fn();
vi.stubGlobal('open', openSpy);

const baseProps = { url: '', title: 'Dokumen', onClose: vi.fn() };

function renderAt(url: string, extra: Record<string, unknown> = {}) {
  return render(<DocumentPreviewModal {...baseProps} url={url} onClose={vi.fn()} {...extra} />);
}

describe('DocumentPreviewModal (B03)', () => {
  beforeEach(() => {
    openSpy.mockReset();
  });
  afterEach(() => cleanup());

  it('isDriveFolder: link folder Google Drive terdeteksi', () => {
    expect(isDriveFolder('https://drive.google.com/drive/folders/1AbC')).toBe(true);
    expect(isDriveFolder('https://drive.google.com/file/d/1AbC/view')).toBe(false);
  });

  it('drive folder → buka tab baru + tutup modal (parity bukaPreviewDokumen)', () => {
    const onClose = vi.fn();
    render(<DocumentPreviewModal url="https://drive.google.com/drive/folders/1AbC" title="Folder" onClose={onClose} />);
    expect(openSpy).toHaveBeenCalledWith('https://drive.google.com/drive/folders/1AbC', '_blank', 'noopener');
    expect(onClose).toHaveBeenCalled();
  });

  it('gambar → img src + loading via key', async () => {
    renderAt('https://res.cloudinary.com/x/image/upload/foto.jpg');
    const img = screen.getByRole('img') as HTMLImageElement;
    expect(img.src).toContain('foto.jpg');
    // chrome via t() keys (regresi hard-coded "Memuat pratinjau...")
    expect(screen.getByText('ui.preview_loading')).toBeTruthy();
    fireEvent.load(img);
    await waitFor(() => expect(screen.queryByText('ui.preview_loading')).toBeNull());
  });

  it('PDF → Google Docs Viewer wrapper (parity preview.ts FIX 2026-08-19)', () => {
    renderAt('https://x.supabase.co/storage/ktp.pdf');
    const frame = document.querySelector('iframe') as HTMLIFrameElement;
    expect(frame.src).toContain('https://docs.google.com/gview?url=');
    expect(frame.src).toContain(encodeURIComponent('https://x.supabase.co/storage/ktp.pdf'));
  });

  it('Office (docx) → MS Office viewer + fallback timer', () => {
    renderAt('https://x.supabase.co/storage/kontrak.docx');
    const frame = document.querySelector('iframe') as HTMLIFrameElement;
    expect(frame.src).toContain('https://view.officeapps.live.com/op/embed.aspx?src=');
  });

  it('tipe tak dikenal (.zip) → pesan via key + tombol Unduh (anti auto-download)', () => {
    renderAt('https://x.supabase.co/storage/berkas.zip');
    expect(screen.getAllByText(/ui\.preview_unavailable/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('ui.preview_unavailable_hint').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('ui.download').length).toBeGreaterThanOrEqual(1);
  });

  it('previewOnly → catatan admin-only, tanpa tombol unduh', () => {
    renderAt('https://x.supabase.co/storage/berkas.zip', { previewOnly: true });
    expect(screen.getAllByText('ui.preview_admin_only_download').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryAllByText('ui.download').length).toBe(0);
  });

  it('gagal load → error via key + unduh tersedia', async () => {
    renderAt('https://res.cloudinary.com/x/image/upload/foto.jpg');
    const img = screen.getByRole('img') as HTMLImageElement;
    fireEvent.error(img);
    await waitFor(() => expect(screen.getByText('ui.preview_load_failed')).toBeTruthy());
    expect(screen.getByText('ui.download')).toBeTruthy();
  });

  // ==========================================
  // REGRESSION: a spreadsheet must NOT be handed straight to an iframe.
  //
  // MEASURED 2026-10-11 on production `share?job=TG591ASJ` in Chromium — the
  // owner's report "buka preview cv malah auto donload juga". HAR timeline:
  //
  //   75206 REQ  <CV .xlsx>              ← iframe mounted here
  //   75216 REQ  cdn.sheetjs.com/xlsx…   ← SheetJS only STARTED loading here
  //   75482 DOWNLOAD 1._DWI_AYU_ANGGRAINI_CV.xlsx
  //
  // The component rendered `<iframe src={url}>` while the client-side SheetJS
  // render was still in flight. Supabase serves these as
  // `application/vnd.openxmlformats-…spreadsheetml.sheet` with no
  // `Content-Disposition: inline`, so an iframe makes the browser DOWNLOAD it.
  // PDFs (the JFT/SSW siblings) render inline, which is why only the CV showed
  // the bug.
  //
  // The assertion is deliberately about ORDER, not about the final state: a
  // test that only waits for the spreadsheet to appear would pass on the buggy
  // version too, because the download happens *first* and the render *later*.
  // What must be pinned is that no raw `iframe[src=<the file>]` is ever
  // mounted for a spreadsheet.
  // ==========================================
  it('spreadsheet (.xlsx) → TIDAK pernah memasang iframe src mentah (anti auto-download)', async () => {
    const xlsxUrl = 'https://x.supabase.co/storage/master/X/1._X_CV.xlsx';
    renderAt(xlsxUrl);

    // Give the async SheetJS path a chance to run. It will fail in jsdom (no
    // network, no SheetJS), which lands us in the documented fallback — and
    // THAT is exactly the moment the old code exposed the raw iframe.
    await waitFor(() => {
      const frames = Array.from(document.querySelectorAll('iframe'));
      const raw = frames.find((f) => (f as HTMLIFrameElement).src.includes('.xlsx'));
      expect(raw, 'a raw iframe pointing at the .xlsx causes a browser download').toBeUndefined();
    }, { timeout: 3000 });
  });
});

// ==========================================
// 2026-10-13 — "tiap mo buka preview mengdonload"
//
// MEASURED pada hari itu: host vendor SheetJS **tidak bisa dihubungi sama
// sekali** — `curl -I https://cdn.sheetjs.com/...` menjawab `http=000` (menggantung
// 11 s lalu ditolak), dari jaringan yang sama dengan pemilik. Jadi
// `loadXlsxVendor()` SELALU gagal, render spreadsheet SELALU batal, dan tiap
// CV `.xlsx` jatuh ke cabang iframe `src={url}` — yang membuat browser
// MENGUNDUH berkasnya, bukan menampilkannya.
//
// `xlsx` sudah menjadi dependensi repo ini dan sudah dibundel untuk browser oleh
// dua pemanggil lain (`candidateExport.ts`, loader template CV) dengan pola
// `await import('xlsx')`. Jadi CDN itu bukan cuma mati — ia berlebih.
//
// Dua sifat yang dikunci di sini, dan keduanya MERAH di HEAD:
//   1. SheetJS tidak boleh dimuat dari CDN eksternal.
//   2. Saat render gagal, TIDAK boleh ada iframe `src={url}` — harus keadaan
//      "tidak bisa dipratinjau" + tombol Unduh (aksi eksplisit pengguna).
//
// ⚠ Kenapa tes lama (`spreadsheet (.xlsx) → TIDAK pernah memasang iframe src
// mentah`) tidak menangkap ini: `waitFor` atas assertion NEGATIF lulus pada
// tick pertama, saat render masih tertunda — jadi ia tidak pernah menunggu
// kegagalan yang justru memunculkan iframe itu. Tes di bawah menunggu keadaan
// AKHIR, bukan keadaan antara.
// ==========================================
describe('DocumentPreviewModal — spreadsheet tanpa CDN & tanpa auto-download', () => {
  /** Simulasi kondisi produksi: setiap <script> yang dipasang gagal dimuat. */
  function failEveryScript() {
    const append = document.head.appendChild.bind(document.head);
    const appended: string[] = [];
    const spy = vi.spyOn(document.head, 'appendChild').mockImplementation((node: Node) => {
      const el = node as HTMLScriptElement;
      if (el.tagName === 'SCRIPT') {
        appended.push(el.src);
        queueMicrotask(() => el.onerror?.(new Event('error')));
        return node;
      }
      return append(node);
    });
    return { appended, restore: () => spy.mockRestore() };
  }

  it('SheetJS TIDAK dimuat dari CDN eksternal', async () => {
    const { appended, restore } = failEveryScript();
    const fetchSpy = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetchSpy);
    try {
      renderAt('https://x.supabase.co/storage/master/X/1._X_CV.xlsx');
      await waitFor(() => expect(screen.getByText('ui.preview_unavailable')).toBeTruthy(), { timeout: 5000 });
      expect(appended.filter((s) => /^https?:\/\//.test(s)), 'CDN eksternal sebagai jalur muat SheetJS').toEqual([]);
    } finally {
      restore();
      vi.unstubAllGlobals();
    }
  });

  it('render gagal → keadaan "tidak bisa dipratinjau", BUKAN iframe src mentah', async () => {
    const { restore } = failEveryScript();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    try {
      renderAt('https://x.supabase.co/storage/master/X/1._X_CV.xlsx');
      // Tunggu keadaan AKHIR: kalau iframe mentah yang menang, teks ini tidak
      // akan pernah muncul dan tes gagal di sini — persis bug yang dilaporkan.
      await waitFor(() => expect(screen.getByText('ui.preview_unavailable')).toBeTruthy(), { timeout: 5000 });
      const raw = Array.from(document.querySelectorAll('iframe')).find((f) =>
        (f as HTMLIFrameElement).src.includes('.xlsx'));
      expect(raw, 'iframe src mentah = browser mengunduh berkasnya').toBeUndefined();
      // Tombol Unduh tetap tersedia — unduhan harus jadi AKSI pengguna.
      expect(screen.getAllByText('ui.download').length).toBeGreaterThanOrEqual(1);
    } finally {
      restore();
      vi.unstubAllGlobals();
    }
  });
});
