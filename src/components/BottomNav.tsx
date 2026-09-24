/**
 * BottomNav.tsx — Compact single-row bottom nav (Preact island)
 * Admin: 6 icon buttons, Menu toggles sidebar
 * Kandidat: 3 buttons with center dashboard bubble
 *
 * TOUCH TARGETS. MEASURED (2026-09-25, Playwright, /admin + /candidate at 390px):
 * every button here rendered 40x16 — the `h-11` on the row was never on the
 * buttons, so each one collapsed to its own glyph height. 16px fails WCAG 2.5.8
 * AA (24x24) outright, and DESIGN.md §5.1/§7 ask for 44px. The size now sits on
 * the element that receives the tap (`w-11 h-11` = 44x44), not on the row: a gap
 * or a row height is not part of the target.
 */
import { useStore } from '@nanostores/preact';
import { authStore } from '../store/authReactive';
import { logoutSupabase } from '../store/userStore';
import { t, langStore } from '../store/i18n';
import Icon from './ui/Icon';

export default function BottomNav({ show = false }: { show?: boolean }) {
  const _lang = useStore(langStore);
  const auth = useStore(authStore);
  // Mounted on every BaseLayout page; only portal pages (admin/candidate) ask
  // for it. (Gated via prop rather than `{showBottomNav && <BottomNav/>}` in
  // the .astro — Astro 5.12 codegen mis-compiles a JS `&&`/ternary wrapping a
  // client:only island and emits the expression text as visible output.)
  if (!show || !auth.isLoggedIn) return null;

  async function handleLogout() {
    await logoutSupabase();
    window.location.href = '/';
  }

  if (auth.role === 'admin') {
    function switchTab(tab: string) {
      if (window.location.pathname === '/admin') {
        window.location.hash = tab;
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      } else {
        window.location.href = '/admin#' + tab;
      }
    }

    return (
      <div id="bottom-nav-admin" class="md:hidden fixed bottom-0 left-0 right-0 bg-slate-950/95 backdrop-blur border-t border-slate-800 z-[90]">
        <div class="flex justify-around items-center h-11 px-1">
          <button onClick={() => {
            const sidebar = document.querySelector('[id*="admin-sidebar"]') as HTMLElement;
            if (sidebar) sidebar.classList.toggle('-translate-x-full');
          }} class="flex flex-col items-center justify-center text-slate-400 hover:text-red-400 active:scale-90 transition w-11 h-11" aria-label={t("bottomnav.menu")}>
            <Icon name="bars" class="text-xs" />
          </button>
          <button onClick={() => switchTab('kelola')} class="flex flex-col items-center justify-center text-slate-400 hover:text-white active:scale-90 transition w-11 h-11" aria-label={t("bottomnav.loker")}>
            <Icon name="briefcase" class="text-xs" />
          </button>
          <button onClick={() => switchTab('pelamar')} class="flex flex-col items-center justify-center text-slate-400 hover:text-white active:scale-90 transition w-11 h-11" aria-label={t("bottomnav.pelamar")}>
            <Icon name="users" class="text-xs" />
          </button>
          <button onClick={() => switchTab('mail')} class="flex flex-col items-center justify-center text-slate-400 hover:text-white active:scale-90 transition w-11 h-11" aria-label={t("bottomnav.mail")}>
            <Icon name="envelope" class="text-xs" />
          </button>
          <button onClick={() => switchTab('wa')} class="flex flex-col items-center justify-center text-slate-400 hover:text-emerald-400 active:scale-90 transition w-11 h-11" aria-label={t("bottomnav.wa")}>
            <Icon name="whatsapp" class="text-xs" />
          </button>
          <button onClick={() => switchTab('config')} class="flex flex-col items-center justify-center text-slate-400 hover:text-white active:scale-90 transition w-11 h-11" aria-label={t("bottomnav.config")}>
            <Icon name="cogs" class="text-xs" />
          </button>
        </div>
      </div>
    );
  }

  // Kandidat: 3 buttons, center is raised circle
  return (
    <div id="bottom-nav-kandidat" class="md:hidden fixed bottom-0 left-0 right-0 bg-slate-950/95 backdrop-blur border-t border-slate-800 z-[90]">
      <div class="flex justify-around items-center h-11 px-6">
        <a href="/public" class="flex items-center justify-center text-slate-400 hover:text-white active:scale-90 transition w-11 h-11" aria-label={t("bottomnav.cari")}>
          <Icon name="globe" class="text-xs" />
        </a>
        <a href="/candidate" class="relative -top-2 flex items-center justify-center w-11 h-11" aria-label={t("bottomnav.dashboard")}>
          <div class="w-9 h-9 bg-emerald-600 rounded-full flex items-center justify-center text-white border-2 border-slate-950 shadow-md active:scale-95 transition">
            <Icon name="id-card" class="text-sm" />
          </div>
        </a>
        <button onClick={handleLogout} class="flex items-center justify-center text-slate-400 hover:text-red-400 active:scale-90 transition w-11 h-11" aria-label={t("bottomnav.keluar")}>
          <Icon name="power-off" class="text-xs" />
        </button>
      </div>
    </div>
  );
}
