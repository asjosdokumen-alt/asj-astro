/**
 * TESTS: tombol kembali di toolbar halaman form — portal atau dashboard.
 *
 * KENAPA ADA
 * ----------
 * Pemilik 2026-11-01: "kandidat dari cv ai dan wawancara kembali ke portal,
 * gak ada kembali ke dashboard. Kalau di admin kan enak ada tombol ×-nya
 * langsung balik panel admin."
 *
 * Artinya tombol kembali harus mengikuti KONTEKS: kandidat yang membuka
 * `/ai-cv` atau `/wawancara` dari dasbornya kembali ke dasbor, bukan dilempar
 * ke portal. Tapi halaman portal sendiri (`/admin`, `/apply`, `/master`,
 * `/share`) tidak boleh ikut berubah — di sana portal memang tujuan yang benar.
 *
 * Tes ini mengunci keempat kemungkinan itu. Tanpa tes, `backTo` bisa dipasang
 * di semua rute (kandidat di `/admin` lalu diarahkan ke dasbor) atau tidak
 * dipasang sama sekali (keluhan pemilik kembali) tanpa satu gate pun berbunyi.
 *
 * KENAPA DI `e2e/`: `.test.tsx` di `src/` memindahkan counter beku `indexer`;
 * berkas di `e2e/` tidak dihitung (R13f-bis).
 */
import { render, screen, cleanup } from '@testing-library/preact';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import FormToolbar from '../src/components/forms/FormToolbar';
import { authStore } from '../src/store/authReactive';

type Peran = 'guest' | 'kandidat' | 'admin';

function masukSebagai(role: Peran) {
  authStore.set({
    role,
    name: role === 'guest' ? '' : 'Budi',
    wa: role === 'guest' ? '' : '081234567890',
    sessionToken: role === 'guest' ? '' : `uji-${role}`,
    refreshToken: '',
    isLoggedIn: role !== 'guest',
    lastChecked: role === 'guest' ? 0 : Date.now(),
  });
}

/** Satu-satunya anchor di toolbar adalah tombol kembali. */
function tombolKembali() {
  const a = screen.getByRole('link');
  return { href: a.getAttribute('href'), label: a.getAttribute('aria-label') };
}

describe('FormToolbar — tujuan tombol kembali', () => {
  beforeEach(() => {
    localStorage.clear();
    masukSebagai('guest');
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('tamu: tetap ke portal, walau halaman meminta dashboard', () => {
    render(<FormToolbar titleKey="toolbar.ai_cv" backTo="dashboard" />);
    /* Tamu tidak punya dasbor; mengarahkannya ke /candidate hanya akan
       memantulkan dia ke halaman login. */
    expect(tombolKembali()).toEqual({ href: '/', label: 'Portal' });
  });

  it('kandidat di /ai-cv: kembali ke DASBOR', () => {
    masukSebagai('kandidat');
    render(<FormToolbar titleKey="toolbar.ai_cv" backTo="dashboard" />);
    expect(tombolKembali()).toEqual({ href: '/candidate', label: 'Dashboard' });
  });

  it('kandidat di /wawancara: kembali ke DASBOR', () => {
    masukSebagai('kandidat');
    render(<FormToolbar titleKey="toolbar.mensetsu" backTo="dashboard" />);
    expect(tombolKembali()).toEqual({ href: '/candidate', label: 'Dashboard' });
  });

  it('kandidat di halaman portal (tanpa backTo): tetap ke portal', () => {
    masukSebagai('kandidat');
    /* /admin, /apply, /master, /share memakai default — jangan ikut berubah. */
    render(<FormToolbar titleKey="toolbar.admin" />);
    expect(tombolKembali()).toEqual({ href: '/', label: 'Portal' });
  });

  it('admin: tetap ke portal walau halaman meminta dashboard', () => {
    masukSebagai('admin');
    render(<FormToolbar titleKey="toolbar.ai_cv" backTo="dashboard" />);
    /* Admin tidak punya dasbor kandidat; /candidate akan menolaknya. */
    expect(tombolKembali()).toEqual({ href: '/', label: 'Portal' });
  });
});
