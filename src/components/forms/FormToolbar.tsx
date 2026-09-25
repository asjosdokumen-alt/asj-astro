/**
 * FormToolbar.tsx — Reusable toolbar for standalone form pages
 * Includes: Back to Portal + Theme toggle + Language toggle
 */
import { useStore } from '@nanostores/preact';
import { toggleLang, t, useLang } from '../../store/i18n';
import { themeStore, toggleTheme } from '../../store/theme';
import Icon from '../ui/Icon';

interface Props {
  titleKey?: string;
  title?: string;
}

export default function FormToolbar({ title, titleKey }: Props) {
  const lang = useLang();
  // Read the mode from the store rather than keeping local state, so a
  // toggle made on another page (or in another tab) shows up here too.
  const isDark = useStore(themeStore) !== "light";

  return (
    <div class="fixed top-0 left-0 right-0 z-[100] flex items-center justify-between px-3 py-2 bg-black/70 backdrop-blur-sm border-b border-white/10">
      {/* ⚠ MEASURED 2026-09-25 at 390px: this back control rendered **38x26** —
          26px tall, on EVERY gated route (/admin, /candidate, /apply, /master,
          /ai-cv, /share, /siswa-baru). It was the only control in this bar that
          never got the `min-h-11` the two beside it received, so the bar's
          PRIMARY action was the smallest target in it: under WCAG 2.5.8 AA's
          24px on the height and well under the project's 44px floor
          (DESIGN.md:582, :691). `min-h-11 min-w-11` puts the floor on the anchor
          itself, which is what receives the tap. */}
      <a href="/" aria-label={t('button.portal')} class="min-h-11 min-w-11 flex items-center justify-center gap-2 px-3 py-1.5 bg-black/50 hover:bg-black/80 text-white text-xs font-bold rounded-full border border-white/20 transition-[background-color,transform] hover:scale-105">
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

        ⚠ THE TEXT LABEL IS NOW `hidden sm:inline`, AND THAT IS A WIDTH FIX.
        MEASURED 2026-09-25 at 390px: the two pills rendered 62px + 54px = 116px
        of a 390px bar, leaving ~200px for the title — and the owner's complaint
        was exactly this, "menu terlihat terlalu lonjong/melebar sehingga kurang
        proporsional". A pill whose job is a two-state toggle does not need its
        label at phone width: the ICON already carries the state (moon/sun), and
        `aria-label` carries it for assistive tech. Hiding the text keeps the
        44px target and the tap area, and hands ~80px back to the title, which is
        the element that was being truncated. The label returns at `sm:` where
        there is room for it. */}
      <div class="flex items-center gap-2">
        <button onClick={toggleTheme} aria-label={isDark ? "Aktifkan tema terang" : "Aktifkan tema gelap"} title={isDark ? "Dark" : "Light"} class="min-h-11 px-2.5 py-1.5 bg-black/50 hover:bg-black/80 text-white border border-white/20 rounded-full text-[11px] font-bold transition-colors flex items-center gap-1">
          <Icon name={isDark ? "moon" : "sun"} /> <span class="hidden sm:inline">{isDark ? "Dark" : "Light"}</span>
        </button>
        <button onClick={toggleLang} aria-label={lang === "id" ? "Ganti ke bahasa Jepang" : "Ganti ke bahasa Indonesia"} title={lang === "id" ? "ID" : "JP"} class="min-h-11 px-2.5 py-1.5 bg-black/50 hover:bg-black/80 text-white border border-white/20 rounded-full text-[11px] font-bold transition-colors flex items-center gap-1">
          <Icon name="language" /> <span class="hidden sm:inline">{lang === "id" ? "ID" : "JP"}</span>
        </button>
      </div>
    </div>
  );
}