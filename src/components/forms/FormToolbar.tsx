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
      {/*
        `min-h-11` (44px) on both controls -- the project's documented touch
        floor (DESIGN.md:582, :691 "Target sentuh | >=44 px").

        MEASURED 2026-09-22 at a 390px viewport, before this change: both
        rendered 31px tall (`px-2.5 py-1.5` on `text-[11px]`). These are the same
        two controls already brought to the floor in `App.tsx` (the landing
        header); leaving this copy at 31px would have made the theme toggle a
        different size depending on which page you were on.

        `min-h-` rather than `h-`: the label text sits beside an icon and the
        padding is asymmetric, so a fixed height would centre the content by
        clipping rather than by layout. The bar itself is `py-2`, so it grows by
        13px per control -- measured, not assumed: the toolbar is 8px taller at
        390px after this change, which keeps it well inside the thumb zone.
      */}
      <div class="flex items-center gap-2">
        <button onClick={toggleTheme} aria-label="Toggle theme" class="min-h-11 px-2.5 py-1.5 bg-black/50 hover:bg-black/80 text-white border border-white/20 rounded-full text-[11px] font-bold transition-colors flex items-center gap-1">
          <Icon name={isDark ? "moon" : "sun"} /> {isDark ? "Dark" : "Light"}
        </button>
        <button onClick={toggleLang} aria-label="Toggle language" class="min-h-11 px-2.5 py-1.5 bg-black/50 hover:bg-black/80 text-white border border-white/20 rounded-full text-[11px] font-bold transition-colors flex items-center gap-1">
          <Icon name="language" /> {lang === "id" ? "ID" : "JP"}
        </button>
      </div>
    </div>
  );
}