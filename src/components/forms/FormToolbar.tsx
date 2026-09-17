/**
 * FormToolbar.tsx — Reusable toolbar for standalone form pages
 * Includes: Back to Portal + Theme toggle + Language toggle
 */
import { useStore } from '@nanostores/preact';
import { langStore, toggleLang, t } from '../../store/i18n';
import { themeStore, toggleTheme } from '../../store/theme';
import Icon from '../ui/Icon';

interface Props {
  titleKey?: string;
  title?: string;
}

export default function FormToolbar({ title, titleKey }: Props) {
  const lang = useStore(langStore);
  // Read the mode from the store rather than keeping local state, so a
  // toggle made on another page (or in another tab) shows up here too.
  const isDark = useStore(themeStore) !== "light";

  return (
    <div class="fixed top-0 left-0 right-0 z-[100] flex items-center justify-between px-3 py-2 bg-black/70 backdrop-blur-sm border-b border-white/10">
      <a href="/" aria-label={t('button.portal')} class="flex items-center gap-2 px-3 py-1.5 bg-black/50 hover:bg-black/80 text-white text-xs font-bold rounded-full border border-white/20 transition-[background-color,transform] hover:scale-105">
        <Icon name="arrow-left" /> <span class="hidden sm:inline">{t('button.portal')}</span>
      </a>
      {/* The page title IS the page's h1 — not a decorative <span>. Four form
          routes (/apply, /master, /ai-cv, /siswa-baru) rendered NO h1 at all,
          and /siswa-baru's only h1 sat inside a tab panel that is `display:none`
          on mobile. Measured 2026-09-14 at 390px: those pages exposed zero
          visible headings, so assistive tech got no page identity.
          It was also `hidden sm:inline`, so below 640px the bar was unlabelled.
          `min-w-0 truncate` is deliberate (see §11.1): the fix for a long title
          is to bound the text element, not to pad its container. */}
      {(titleKey ? t(titleKey) : title) && (
        <h1 class="min-w-0 flex-1 px-2 text-center text-xs font-bold text-slate-300 truncate">{titleKey ? t(titleKey) : title}</h1>
      )}
      <div class="flex items-center gap-2">
        <button onClick={toggleTheme} aria-label="Toggle theme" class="px-2.5 py-1.5 bg-black/50 hover:bg-black/80 text-white border border-white/20 rounded-full text-[11px] font-bold transition-colors flex items-center gap-1">
          <Icon name={isDark ? "moon" : "sun"} /> {isDark ? "Dark" : "Light"}
        </button>
        <button onClick={toggleLang} aria-label="Toggle language" class="px-2.5 py-1.5 bg-black/50 hover:bg-black/80 text-white border border-white/20 rounded-full text-[11px] font-bold transition-colors flex items-center gap-1">
          <Icon name="language" /> {lang === "id" ? "ID" : "JP"}
        </button>
      </div>
    </div>
  );
}