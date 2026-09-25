/**
 * AsjDossierCard.tsx — the candidate's identity card, in the legacy "ASJ DOSSIER"
 * layout (owner ruling 2026-09-25: "profil kok gini, harusnya profil seperti ini
 * kek legacy").
 *
 * PRESENTATIONAL ONLY. It takes props and renders; it fetches nothing, reads no
 * store and owns no modal. `CandidateDash` supplies every value from the row it
 * already has. That split is deliberate: DESIGN.md P4 says numbers come from data,
 * and a card that reached for its own source would be a second reader of the same
 * row.
 *
 * ⚠ "VERIFIED CANDIDATE" IS DECORATION, AND THE OWNER SAID SO. Verbatim
 * 2026-09-25: "verified candidat dari legacy hanya untuk game fikasi dulu ya gak
 * guna cuma buat looks saja. kan setiap yg daftar auto tervierified oleh admin".
 * There is NO verification column in the database — nothing verifies a candidate.
 * So this subtitle and the round check are a GAMIFICATION MOTIF carried over from
 * the legacy mockup, not a claim the data supports. Do NOT "wire it up" to a real
 * signal without a column to wire it to, and do not let a future reader mistake it
 * for an audit record: if the portal ever grows real verification, this label must
 * become conditional on it (DESIGN.md §7.2 — a fabricated claim on a company page
 * is a legal claim, not decoration).
 *
 * THEME-AWARE (owner ruling: "ikut tema"), not dark-in-both. Surfaces come from
 * the `@theme` tokens, so light mode gets `surface-raised`/`surface-sunken` and the
 * eyebrow labels stay legible in both. No arbitrary radius or hex values: T-04
 * replaced 39 of those with the five radius tokens, and the light-mode shim in
 * `global.css` is keyed on literal class names, so an invented value is a value
 * that breaks in the other theme.
 *
 * NOTHING IS INVENTED. A row whose value is missing is OMITTED rather than printed
 * as `-` or as an empty box (DESIGN.md P5). `realValue()` below is the same rule
 * `CandidateDash` applies to the job/stage strip, restated here because this
 * component must not depend on that file to be correct.
 */
import type { ComponentChildren } from 'preact';
import Icon from '../ui/Icon';
import { t } from '../../store/i18n';

export type AsjDossierCardProps = {
  nama: string;
  idKandidat?: string;
  /** Raw status word (`LULUS`, `PROSES`, …) — drives the chip under the photo. */
  status?: string;
  /** Digits-only WhatsApp number, as `mapCandidate` stores it. */
  wa?: string;
  /** `pas_photo` URL. Empty is normal; the initial letter stands in. */
  pasPhoto?: string;
  gender?: string;
  usia?: string;
  /** Pre-joined `"165 / 57"` from `mapCandidate`, which already applies its guard. */
  tbBb?: string;
  pendidikan?: string;
  /** Pre-joined `"PONOROGO, 1989-10-05"`. */
  ttl?: string;
  email?: string;
  /** `alamat_lengkap`. The KTP NUMBER (`nik`) is deliberately not a prop — a
   *  national ID number has no business on a card a candidate shows around. */
  alamat?: string;
  jftText?: string;
  sswText?: string;
  /** Job codes / categories the candidate applied to. Empty renders no block. */
  jobs: string[];
  /** Drives the badge row. See the icon-row note in the body. */
  isVIP?: boolean;
  isSiswaASJ?: boolean;
  /** Injected by the dashboard so this file does not own the crown/VIP artwork.
   *  Typed as an IMPORTED `ComponentChildren`, not `preact.ComponentChildren`:
   *  the indexer reports the bare `preact` namespace as an unresolved
   *  PRODUCTION reference and `build.test.ts` requires that list to be empty —
   *  measured 2026-09-25, "src/components/candidate/AsjDossierCard.tsx:66
   *  preact". Importing the type is the convention the rest of `src/` uses. */
  badge?: ComponentChildren;
  onEdit: () => void;
  onDownload: () => void;
};

/** `'-'`, `'null'`, `'undefined'` and whitespace all mean "no value" in this
 *  repo's projections — `mapCandidate` writes `'-'` for absent columns. */
function realValue(v: unknown): boolean {
  const s = String(v ?? '').trim();
  return !!s && s !== '-' && s !== 'null' && s !== 'undefined';
}

const value = (v: unknown): string => (realValue(v) ? String(v).trim() : '');

/** One boxed cell of the 2x2 grid. */
function Field(props: { label: string; value: string }) {
  return (
    <dl class="rounded-card bg-surface-sunken border border-line-strong p-3 min-w-0">
      <dt class="text-eyebrow font-bold uppercase text-fg-subtle">{props.label}</dt>
      <dd class="mt-1 text-body-sm font-bold text-fg break-words">{props.value}</dd>
    </dl>
  );
}

/** A full-width label/value row, no box — matches the legacy stack. */
function Row(props: { label: string; value: string }) {
  return (
    <div class="min-w-0">
      <dt class="text-eyebrow font-bold uppercase text-fg-subtle">{props.label}</dt>
      <dd class="mt-1 text-body-sm font-bold text-fg break-words">{props.value}</dd>
    </div>
  );
}

/** One of the two side-by-side tiles (JFT/JLPT, SSW/BIDANG). */
function Tile(props: { label: string; value: string; tone: 'sky' | 'emerald' }) {
  const tone = props.tone === 'sky' ? 'text-accent-sky' : 'text-accent-emerald';
  return (
    <dl class="rounded-card bg-surface-sunken border border-line-strong p-3 text-center min-w-0">
      <dt class="text-eyebrow font-bold uppercase text-fg-subtle">{props.label}</dt>
      <dd class={`mt-1 text-body-sm font-black ${tone}`}>{props.value}</dd>
    </dl>
  );
}

export default function AsjDossierCard(props: AsjDossierCardProps) {
  const nama = value(props.nama);
  const idKandidat = value(props.idKandidat);
  const status = value(props.status);
  const wa = value(props.wa);
  const photo = value(props.pasPhoto);
  const gender = value(props.gender);
  const usia = value(props.usia);
  const tbBb = value(props.tbBb);
  const pendidikan = value(props.pendidikan);
  const ttl = value(props.ttl);
  const email = value(props.email);
  const alamat = value(props.alamat);
  const jftText = value(props.jftText);
  const sswText = value(props.sswText);
  const jobs = props.jobs.filter(realValue);

  /* THE BADGE ROW IS DATA-DRIVEN, AND TWO LEGACY GLYPHS DO NOT EXIST.
     The legacy card shows a flag, a medal, a star and a seal. `src/icons/sprite-map.ts`
     has no `flag`, `flag-checkered`, `seal` or `certificate`, and `Icon` renders
     NOTHING for an unknown name (a DEV-only console warning) — so copying the
     mockup would have produced two silently empty slots. Each glyph below is
     driven by a real signal instead, and the whole row disappears when there is
     no signal at all. `medal` has no source and is therefore absent on purpose. */
  const badges: { icon: string; title: string }[] = [];
  if (props.isSiswaASJ) badges.push({ icon: 'graduation-cap', title: t('ui.student_id') });
  if (props.isVIP) badges.push({ icon: 'star', title: t('ui.vip_member') });
  if (status.toUpperCase().includes('LULUS')) badges.push({ icon: 'check-double', title: t('status.pass') });

  return (
    <section class="rounded-panel bg-surface-raised border border-line-strong p-5 md:p-6 mb-6 md:mb-8 max-w-4xl mx-auto text-left">
      {/* ── Header ── */}
      <header class="flex items-start justify-between gap-3 pb-4 mb-5 border-b border-line">
        <div class="min-w-0">
          <p class="text-card-title font-black uppercase tracking-wide text-fg">{t('dossier.brand')}</p>
          <p class="text-eyebrow font-bold uppercase text-accent">{t('dossier.verified')}</p>
        </div>
        <span class="shrink-0 grid place-items-center w-9 h-9 rounded-pill bg-surface-sunken border border-line-strong" aria-hidden="true">
          <Icon name="check-circle" class="text-accent-emerald" />
        </span>
      </header>

      {/* ── Body: photo column + identity column ── */}
      <div class="u-grid-auto u-grid-auto--wide gap-5">
        <div class="flex flex-col items-center gap-3">
          <div class="w-28 h-32 rounded-card overflow-hidden shrink-0 bg-surface-sunken border border-line-strong grid place-items-center">
            {photo
              ? <img src={photo} alt={nama} class="w-full h-full object-cover" />
              : <span class="text-section font-black text-fg-subtle" aria-hidden="true">{nama.slice(0, 1).toUpperCase() || '?'}</span>}
          </div>
          {idKandidat && (
            <span class="rounded-control bg-surface-sunken border border-line-strong px-3 py-1.5 font-mono text-eyebrow font-bold text-fg-muted break-all text-center">
              {idKandidat}
            </span>
          )}
          {status && (
            <span class="rounded-pill border border-line-strong bg-surface-sunken px-3 py-1 text-caption font-bold text-accent-emerald">
              {status}
            </span>
          )}
        </div>

        <div class="min-w-0">
          <div class="flex items-start justify-between gap-3">
            <h3 class="text-section font-black uppercase text-fg break-words min-w-0">{nama}</h3>
            {/* The write view. The card is the READ view of the profile, so the
                edit affordance belongs on the card rather than behind a separate
                button further down the page. */}
            <button
              type="button"
              onClick={props.onEdit}
              class="shrink-0 inline-flex items-center gap-1.5 rounded-control border border-line-strong bg-surface-sunken hover:bg-surface text-fg-muted hover:text-fg px-3 py-2 text-caption font-bold transition-colors"
            >
              <Icon name="user-edit" />
              <span>{t('ui.update_cv_mini')}</span>
            </button>
          </div>

          {(badges.length > 0 || props.badge) && (
            <div class="flex items-center gap-2 mt-2 text-fg-subtle">
              {props.badge}
              {badges.map((b) => (
                <span key={b.icon} title={b.title} class="inline-flex items-center text-accent-amber"><Icon name={b.icon} /></span>
              ))}
            </div>
          )}

          {wa && (
            <a
              href={`https://wa.me/${wa}`}
              target="_blank"
              rel="noopener noreferrer"
              class="mt-3 inline-flex items-center gap-2 w-full rounded-control bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2.5 font-bold transition-colors"
            >
              <Icon name="whatsapp" />
              <span class="font-mono">{wa}</span>
            </a>
          )}

          {(gender || usia || tbBb || pendidikan) && (
            <dl class="grid grid-cols-2 gap-3 mt-4">
              {gender && <Field label={t('ui.cv_gender')} value={gender} />}
              {usia && <Field label={t('ui.cv_usia')} value={usia + t('ui.age_years_suffix')} />}
              {tbBb && <Field label={t('ui.cv_fisik')} value={tbBb} />}
              {pendidikan && <Field label={t('ui.cv_pendidikan')} value={pendidikan} />}
            </dl>
          )}
        </div>
      </div>

      {/* ── Full-width rows. Each is omitted when there is no value, so a
             candidate who never filled the master biodata sees a shorter card
             rather than a card full of dashes. ── */}
      {(ttl || email || alamat) && (
        <dl class="mt-5 space-y-3">
          {ttl && <Row label={t('ui.cv_ttl')} value={ttl} />}
          {email && <Row label={t('ui.cv_email')} value={email} />}
          {alamat && <Row label={t('dossier.address_ktp')} value={alamat} />}
        </dl>
      )}

      {(jftText || sswText) && (
        <div class="grid grid-cols-2 gap-3 mt-4">
          {jftText && <Tile label={t('ui.jft_jlpt')} value={jftText} tone="sky" />}
          {sswText && <Tile label={t('ui.ssw_field')} value={sswText} tone="emerald" />}
        </div>
      )}

      {jobs.length > 0 && (
        <div class="mt-4 rounded-card bg-surface-sunken border border-line-strong p-4">
          <p class="text-eyebrow font-bold uppercase text-fg-muted">{t('ui.cv_jobs_header')}:</p>
          <div class="mt-2 flex flex-wrap gap-2">
            {jobs.map((j) => (
              <span key={j} class="rounded-control bg-surface border border-line-strong px-2.5 py-1 text-caption font-bold text-fg break-all">{j}</span>
            ))}
          </div>
        </div>
      )}

      {/* ── CTA. Wired to the Rirekisho builder the dashboard already mounts, so
             this button produces the real document rather than a second, invented
             download path. ── */}
      <button
        type="button"
        onClick={props.onDownload}
        class="mt-5 w-full inline-flex items-center justify-center gap-2 font-bold rounded-control transition-colors select-none min-h-[48px] px-6 py-3 text-body-sm bg-emerald-700 hover:bg-emerald-800 text-white uppercase"
      >
        <Icon name="download" />
        {t('ui.cv_download_biodata')}
      </button>
    </section>
  );
}
