// ==========================================
// TESTS: contexts/diagnostics — kontrak payload reportWebVital.
//
// Kenapa file ini ada (2026-09-12)
// -------------------------------
// `reportWebVital` pernah SELALU gagal di produksi tanpa jejak error apa pun.
// Klien mengirim metric terbungkus array — `callAPI("reportWebVital", [metric])`
// (terbukti di bundle legacy yang sudah ter-deploy) — sementara handler membaca
// `payload.name` langsung. Pada array, `payload.name` adalah `undefined`, jadi
// handler membalas `{ success:false, error:'invalid payload' }` untuk setiap
// laporan. Telemetri mati total, dan karena kegagalannya berbentuk respons
// "sukses terkirim" (HTTP 200 dengan body gagal), tidak ada yang menyadarinya.
//
// Test ini mengunci KEDUA bentuk payload supaya regresi yang sama tidak bisa
// kembali diam-diam:
//   1. array terbungkus  -> bentuk yang benar-benar dipakai klien
//   2. objek telanjang   -> bentuk manual/curl
//
// Handler ini sengaja PUBLIK (tanpa sesi): metrik performa bukan data pengguna.
// ==========================================
import { describe, it, expect } from 'vitest';
import { handleReportWebVital } from './service';

/** Bentuk persis yang dikirim klien: { name, value, rating, delta, id, navigationType }. */
const metric = {
  name: 'LCP',
  value: 2412.7,
  rating: 'needs-improvement',
  delta: 310.2,
  id: 'v6-1757663000000-123456789012',
  navigationType: 'navigate',
};

describe('handleReportWebVital — kontrak payload', () => {
  it('menerima metric TERBUNGKUS ARRAY (bentuk yang dikirim klien)', () => {
    // Regresi utama: ini bentuk nyatanya. Kalau ini gagal, telemetri mati lagi.
    expect(handleReportWebVital([metric])).toEqual({ success: true });
  });

  it('menerima metric sebagai OBJEK TELANJANG (pemanggil manual/curl)', () => {
    expect(handleReportWebVital(metric)).toEqual({ success: true });
  });

  it('menerima CLS (satu-satunya metric yang rating-nya pecahan 4 desimal)', () => {
    expect(handleReportWebVital([{ ...metric, name: 'CLS', value: 0.0231 }])).toEqual({ success: true });
  });

  it('menolak payload kosong / tanpa nama metric', () => {
    for (const bad of [undefined, null, [], {}, [{}], [{ value: 100 }]]) {
      expect(handleReportWebVital(bad), `payload ${JSON.stringify(bad)} harus ditolak`).toEqual({
        success: false,
        error: 'invalid payload',
      });
    }
  });
});
