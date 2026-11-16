/// <reference types="astro/client" />

// Hanya variabel PUBLIC_* yang boleh dideklarasikan di sini —
// ImportMetaEnv ini ikut ter-bundle di sisi klien (island).
// Secret server (SUPABASE_SERVICE_ROLE_KEY, SESSION_SECRET, GEMINI_API_KEY,
// ADMIN_PASSWORD, dsb.) hanya dibaca lewat process.env di netlify/functions
// sehingga tidak pernah lolos type-check dari kode klien.
interface ImportMetaEnv {
  readonly PUBLIC_SUPABASE_URL: string;
  readonly PUBLIC_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// ── pdfjs-dist ───────────────────────────────────────────────────────────────
// Paket ini MENGIRIM `"types": "types/src/pdf.d.ts"` di package.json, tetapi
// berkasnya tidak ada di distribusi npm-nya (diperiksa 2026-11-16) — sehingga
// setiap impor jatuh ke TS7016. Deklarasi di bawah hanya memuat yang benar-benar
// dipakai `DocumentPreviewModal` (gambar halaman ke <canvas>); bukan tiruan API
// lengkap, supaya tidak berpura-pura menaungi fungsi yang tak pernah dipanggil.
declare module 'pdfjs-dist' {
  export interface PdfViewport {
    width: number;
    height: number;
  }
  export interface PdfPage {
    getViewport(params: { scale: number }): PdfViewport;
    render(params: {
      canvasContext: CanvasRenderingContext2D;
      viewport: PdfViewport;
      transform?: number[];
    }): { promise: Promise<void> };
  }
  export interface PdfDocument {
    numPages: number;
    getPage(n: number): Promise<PdfPage>;
    destroy(): Promise<void>;
  }
  export const GlobalWorkerOptions: { workerSrc: string };
  export function getDocument(src: { data: Uint8Array }): { promise: Promise<PdfDocument> };
}

// Impor aset gaya Vite (`?url`) mengembalikan URL aset, bukan modulnya.
declare module '*?url' {
  const url: string;
  export default url;
}
