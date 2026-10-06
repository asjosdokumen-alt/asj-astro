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

/** Flag VIP yang DIHITUNG SERVER (`mapCandidate`) — pengganti memo mentah. */
export interface VipFlags {
  /** Tag literal `[VIP]` (case-SENSITIVE). */
  isVIP?: boolean;
  /** Kode `[KELAS xx]` (case-INSENSITIVE); kosong bila tidak ada. */
  kelas?: string;
}

/**
 * Predikat gate yang sama dengan `isVipCatatan`, tapi dari flag yang dikirim
 * server alih-alih dari memo mentah.
 *
 * `catatan_internal` / `catatan_admin` TIDAK LAGI sampai ke browser (lihat
 * `toKandidatView` di `netlify/functions/_lib/db/candidates.ts`): keduanya memo
 * sisi admin. Jadi gate AI CV / simulator wawancara dihitung dari dua flag yang
 * sudah diturunkan server:
 *
 *   `isVIP` (tag `[VIP]` literal) ATAU `kelas` (`[KELAS xx]`).
 *
 * Hasilnya PERSIS `isVipCatatan` — termasuk TIDAK membuka gate untuk tag kurung
 * lain seperti `[MCU]`/`[VISA]`/`[NOTE]` yang dulu pernah bocor (lihat komentar
 * `isVipCatatan`).
 */
export function isVipFlags(flags: VipFlags | null | undefined): boolean {
  return !!flags?.isVIP || !!flags?.kelas;
}

/**
 * Target redirect untuk penjaga halaman AI CV (`/ai-cv`); `null` = boleh masuk.
 *
 * Parity legacy verifikasiAksesAiCv() (js/pages/ai_form.ts:771): kandidat
 * NON-siswa yang membuka /ai-cv langsung diarahkan ke Form Master Lengkap,
 * bukan sekadar ditolak server dengan pesan generik.
 *
 * Sejak 2026-10-05 menerima FLAG hasil turunan server (`isVIP`/`kelas`), bukan
 * memo mentah — memo itu tidak lagi dikirim ke kandidat.
 */
export function aiCvAccessRedirect(
  flags: VipFlags | null | undefined,
  wa: string,
  nama?: string,
): string | null {
  if (isVipFlags(flags)) return null;
  return '/master?wa=' + encodeURIComponent(wa) + '&nama=' + encodeURIComponent(nama || '');
}
