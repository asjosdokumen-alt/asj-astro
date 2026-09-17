/**
 * vip.ts — gerbang VIP / KELAS LPK (satu sumber kebenaran di frontend).
 *
 * Parity legacy:
 *   • js/03_candidate.ts:119  isVipCatatan()
 *   • js/pages/ai_form.ts:748 isAiVipCatatan()
 *   • backend netlify/functions/_lib/ai/interview-shared.ts
 *
 * Tag literal `[VIP]` ATAU `[KELAS <kode>]` di `catatan_internal`.
 * Tag kurung LAIN ([MCU], [VISA], [NOTE]) sengaja TIDAK dihitung — regex lama
 * /\[(?:KELAS\s*[A-Z0-9]+|[A-Z0-9]+)\]/i terlalu longgar dan pernah membuka
 * fitur khusus siswa untuk kandidat biasa.
 *
 * Catatan penting: gate (AI CV / simulator wawancara) memakai predikat INI,
 * sedangkan lencana "Siswa Resmi ASJ" di dashboard & tabel admin memakai tag
 * `[VIP]` literal saja (legacy `catatanInt.includes('[VIP]')`). Dua hal berbeda.
 */

/**
 * URL logo ASJ untuk lencana "Siswa Resmi ASJ" (`ui.badge_official`).
 * Aset yang sama dipakai legacy (ASSETS.LOGO, fallback logo_asj.png).
 */
export const ASJ_LOGO_URL =
  'https://gdwvffmevwtwnzrapjwy.supabase.co/storage/v1/object/public/asj-files/assets/logo_asj.png';

/** True bila catatan internal menandai siswa ASJ (VIP atau KELAS LPK). */
export function isVipCatatan(catatanInt: string | null | undefined): boolean {
  const c = String(catatanInt || '');
  return c.includes('[VIP]') || /\[KELAS\s*[A-Z0-9]+\]/i.test(c);
}

/**
 * Target redirect untuk penjaga halaman AI CV (`/ai-cv`); `null` = boleh masuk.
 *
 * Parity legacy verifikasiAksesAiCv() (js/pages/ai_form.ts:771): kandidat
 * NON-siswa yang membuka /ai-cv langsung diarahkan ke Form Master Lengkap,
 * bukan sekadar ditolak server dengan pesan generik.
 */
export function aiCvAccessRedirect(
  catatanInt: unknown,
  wa: string,
  nama?: string,
): string | null {
  if (isVipCatatan(String(catatanInt ?? ''))) return null;
  return '/master?wa=' + encodeURIComponent(wa) + '&nama=' + encodeURIComponent(nama || '');
}
