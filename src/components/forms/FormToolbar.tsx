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
      <a href="/" aria-label={t('button.portal')} class="flex items-center gap-2 px-3 py-1.5 bg-black/50 hover:bg-black/80 text-white text-xs font-bold rounded-full border border-white/20 transition-all hover:scale-105">
        <Icon name="arrow-left" /> <span class="hidden sm:inline">{t('button.portal')}</span>
      </a>
      {(titleKey ? t(titleKey) : title) && <span class="text-xs font-bold text-slate-300 hidden sm:inline">{titleKey ? t(titleKey) : title}</span>}
      <div class="flex items-center gap-2">
        <button onClick={toggleTheme} aria-label="Toggle theme" class="px-2.5 py-1.5 bg-black/50 hover:bg-black/80 text-white border border-white/20 rounded-full text-[11px] font-bold transition-all flex items-center gap-1">
          <Icon name={isDark ? "moon" : "sun"} /> {isDark ? "Dark" : "Light"}
        </button>
        <button onClick={toggleLang} aria-label="Toggle language" class="px-2.5 py-1.5 bg-black/50 hover:bg-black/80 text-white border border-white/20 rounded-full text-[11px] font-bold transition-all flex items-center gap-1">
          <Icon name="language" /> {lang === "id" ? "ID" : "JP"}
        </button>
      </div>
    </div>
  );
}