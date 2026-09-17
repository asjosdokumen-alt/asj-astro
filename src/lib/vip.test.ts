/**
 * TESTS: src/lib/vip.ts — gerbang VIP / KELAS (§6, 2026-09-14)
 *
 * Ground truth legacy:
 *   • js/03_candidate.ts:119  isVipCatatan()      → bukaMasterEksternal()
 *   • js/pages/ai_form.ts:748 isAiVipCatatan()    → verifikasiAksesAiCv()
 *   • i18n/locales/{id,jp}/ui.js                  → vip_member, badge_official,
 *                                                   perfect_student, toast_ai_cv_locked
 *
 * Bug yang pernah ada: regex lama /\[(?:KELAS\s*[A-Z0-9]+|[A-Z0-9]+)\]/i cocok
 * dengan TAG KURUNG APA PUN ([MCU], [VISA], [NOTE]) sehingga fitur khusus siswa
 * terbuka untuk kandidat biasa. Pelajaran ini dipertahankan sebagai tes.
 */
import { describe, expect, it } from 'vitest';
import { isVipCatatan, aiCvAccessRedirect, ASJ_LOGO_URL } from './vip';

describe('isVipCatatan — predikat gate (parity legacy)', () => {
  it('tag literal [VIP] membuka akses', () => {
    expect(isVipCatatan('[VIP]')).toBe(true);
    expect(isVipCatatan('catatan biasa [VIP] catatan lain')).toBe(true);
  });

  it('[KELAS <kode>] membuka akses, case-insensitive, spasi bebas', () => {
    expect(isVipCatatan('[KELAS G] murid')).toBe(true);
    expect(isVipCatatan('[kelas lp2]')).toBe(true);
    expect(isVipCatatan('[KELAS   A1]')).toBe(true);
  });

  it('tag kurung LAIN tidak membuka akses (regresi regex terlalu longgar)', () => {
    expect(isVipCatatan('[MCU] sudah medis')).toBe(false);
    expect(isVipCatatan('[VISA] proses')).toBe(false);
    expect(isVipCatatan('[NOTE] internal')).toBe(false);
    // [VIP] tanpa kurung lengkap bukan tag.
    expect(isVipCatatan('VIP member')).toBe(false);
    // 'vip' huruf kecil TIDAK dihitung: legacy memakai includes('[VIP]')
    // (case-sensitive) untuk tag literal.
    expect(isVipCatatan('[vip]')).toBe(false);
  });

  it('kosong / null / undefined → false (tidak pernah membuka akses)', () => {
    expect(isVipCatatan('')).toBe(false);
    expect(isVipCatatan(null)).toBe(false);
    expect(isVipCatatan(undefined)).toBe(false);
  });
});

describe('aiCvAccessRedirect — penjaga halaman AI CV', () => {
  it('siswa ASJ (VIP atau KELAS) → null (boleh masuk)', () => {
    expect(aiCvAccessRedirect('[VIP]', '0812', 'Budi')).toBeNull();
    expect(aiCvAccessRedirect('[KELAS G]', '0812', 'Budi')).toBeNull();
  });

  it('non-siswa → /master dengan wa & nama ter-encode', () => {
    expect(aiCvAccessRedirect('kandidat umum', '0812', 'Budi Santoso')).toBe(
      '/master?wa=0812&nama=Budi%20Santoso',
    );
  });

  it('catatan kosong/null → tetap diarahkan (parity legacy isAiVipCatatan("") === false)', () => {
    expect(aiCvAccessRedirect('', '0812')).toBe('/master?wa=0812&nama=');
    expect(aiCvAccessRedirect(null, '0812')).toBe('/master?wa=0812&nama=');
  });

  it('wa dinamis (+, spasi) ikut di-encode supaya URL tidak rusak', () => {
    expect(aiCvAccessRedirect('x', '+62 812', undefined)).toBe('/master?wa=%2B62%20812&nama=');
  });
});

describe('ASJ_LOGO_URL', () => {
  it('aset logo ASJ untuk lencana ui.badge_official (parity legacy ASSETS.LOGO)', () => {
    expect(ASJ_LOGO_URL).toContain('asj-files/assets/logo_asj.png');
  });
});
