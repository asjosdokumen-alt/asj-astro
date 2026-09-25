/**
 * AsjDossierCard.tsx — the candidate's ASJ DOSSIER, matching the legacy card.
 *
 * WHERE THIS COMES FROM. Legacy had ONE dossier — `#modal-cv`
 * (`assets/modals-shared.html:95`) — driven by ONE function,
 * `bukaDigitalCV(id)` (`js/admin_modal/cv.ts:18`). Both the admin panel and the
 * candidate dashboard opened that same modal; the candidate reached it from the
 * button "Lihat Profil Digital CV Saya" on `#page-kandidat`. This component is
 * the candidate-facing half of that modal, inlined onto the dashboard instead of
 * living behind a button (owner ruling 2026-09-25: "profil kok gini, harusnya
 * profil seperti ini kek legacy").
 *
 * ⚠ WHAT IS DELIBERATELY NOT HERE, AND MUST NEVER BE ADDED. The legacy modal
 * gated five blocks behind `isAdmin` / `isAdmin && isLolos` and hid every one of
 * them from candidates. They belong to the ADMIN panel
 * (`admin/CandidateProfileModal.tsx`), not to this card — owner ruling
 * 2026-09-25: "panel admin ya tetap di admin panel … karena ada yg privasi
 * khusus yg hanya boleh ada di admin".
 *
 *   1. `cv-pass-row` — "Password Kandidat" (`cv.ts:145`, `if (isAdmin)`).
 *   2. `btn-cv-edit-cepat` + `cv-edit-cepat-form` — "EDIT DATA CEPAT"
 *      (`isiEditCepatCv` returns early: `if (!isAdmin) return`, `cv.ts:396`).
 *   3. `btn-cv-dokumen` / `btn-cv-jft` / `btn-cv-ssw` — the document preview
 *      buttons, and `cv-inline-preview` behind them (`cv.ts:252-278`).
 *   4. `cv-pemberkasan-area` — "Dokumen Pelamar (Supabase)" with BUKA
 *      CV/JFT/SSW/FOTO/**KTP** and the Google-Drive folder link
 *      (`cv.ts:312`, `isAdmin && isLolos`). **BUKA KTP is the reason `nik` is
 *      not a prop on this component**: the KTP document is an admin-only
 *      surface, and a national ID number does not belong on a card a candidate
 *      forwards around.
 *   5. `cv-admin-notes-area` — the VIP toggle, "Catatan Internal (Private)" and
 *      "Catatan External (Kandidat)" (`cv.ts:283`). The external note reaches the
 *      candidate on the DASHBOARD as "Pesan / Evaluasi dari Admin"
 *      (`#k-dash-catatan-box`), not through this card.
 *
 * `CandidateDash.test.tsx` asserts this card renders none of those markers, so
 * re-adding one fails a test rather than quietly leaking a private field.
 *
 * PRESENTATIONAL ONLY. Props in, markup out: no fetch, no store, no query. It
 * takes an `onDownload` callback instead of importing the exporter, so the
 * component stays free of side effects and the dashboard owns the wiring.
 *
 * THEME-AWARE (owner ruling: "ikut tema"). The tinted chips reuse the legacy
 * literal classes (`bg-emerald-900/40`, `text-emerald-400`, …) ON PURPOSE: the
 * light-mode shim in `global.css` §5b–5d is keyed on exactly those literal names,
 * so they are theme-correct already. The one class that is NOT shimmed is the
 * legacy tile border (`border-sky-700/50`), which is why the tiles here use
 * `border-line-strong` instead — same shape, no dark border in light mode.
 */
import type { ComponentChildren } from 'preact';
import Icon from '../ui/Icon';
import { t } from '../../store/i18n';
import { ASJ_LOGO_URL } from '../../lib/vip';

export type AsjDossierCardProps = {
  nama: string;
  idKandidat?: string;
  /** Raw status word (`LULUS`, `PROSES`, …). */
  status?: string;
  /** Pipeline stage (`MCU`, `PEMBERKASAN`, …) — joined with `status` in the box. */
  tahapan?: string;
  /** Digits-only WhatsApp number, as `mapCandidate` stores it. */
  wa?: string;
  /** `pas_photo` URL. Empty is normal; a user glyph stands in. */
  pasPhoto?: string;
  gender?: string;
  usia?: string;
  /** Pre-joined `"165 / 57"` from `mapCandidate`, which already applies its guard. */
  tbBb?: string;
  pendidikan?: string;
  /** Pre-joined `"PONOROGO, 1989-10-05"`. */
  ttl?: string;
  email?: string;
  /** `alamat_lengkap`. The KTP NUMBER (`nik`) is deliberately not a prop. */
  alamat?: string;
  jftText?: string;
  sswText?: string;
  /** Job codes the candidate applied to. Empty renders no block. */
  jobs: string[];
  /** Class tag (`[KELAS G]` → "G"), rendered as the legacy indigo chip. */
  kelas?: string;
  /** Injected by the dashboard so this file does not own the crown/VIP artwork. */
  badge?: ComponentChildren;
  onDownload: () => void;
};

/** `'-'`, `'null'`, `'undefined'` and whitespace all mean "no value" in this
 *  repo's projections — `mapCandidate` writes `'-'` for absent columns. */
function realValue(v: unknown): boolean {
  const s = String(v ?? '').trim();
  return !!s && s !== '-' && s !== 'null' && s !== 'undefined';
}

const value = (v: unknown): string => (realValue(v) ? String(v).trim() : '');

/** One label/value pair of the identity grid. `span` makes it full width —
 *  the legacy card gives Tempat/Tgl Lahir, Email and Alamat a row each. */
function Cell(props: { label: string; value: string; span?: boolean }) {
  return (
    <div class={props.span ? 'col-span-2 min-w-0' : 'min-w-0'}>
      <dt class="text-eyebrow font-bold uppercase text-fg-subtle mb-0.5">{props.label}</dt>
      <dd class="text-body-sm font-bold text-fg break-words">{props.value}</dd>
    </div>
  );
}

/** One of the two JFT/JLPT and SSW/BIDANG tiles. */
function Tile(props: { label: string; value: string; tone: 'sky' | 'emerald' }) {
  const bg = props.tone === 'sky' ? 'bg-sky-900/20' : 'bg-emerald-900/20';
  const fg = props.tone === 'sky' ? 'text-accent-sky' : 'text-accent-emerald';
  return (
    <dl class={`${bg} border border-line-strong p-2.5 rounded-card shadow-inner text-center min-w-0`}>
      <dt class={`text-eyebrow font-bold uppercase mb-1 ${fg}`}>{props.label}</dt>
      <dd class="text-body-sm font-bold text-fg break-words">{props.value}</dd>
    </dl>
  );
}

export default function AsjDossierCard(props: AsjDossierCardProps) {
  const nama = value(props.nama);
  const idKandidat = value(props.idKandidat);
  const status = value(props.status);
  const tahapan = value(props.tahapan);
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
  const kelas = value(props.kelas);
  const jobs = props.jobs.filter(realValue);

  /* `STATUS & TAHAPAN` joins the two fields the legacy box shows. It never
   * repeats one value twice: the legacy card rendered "LULUS (LULUS)" because
   * `tahapan` and `status` happened to hold the same word, and copying that
   * would print a value twice for no reason. */
  const statusLine = [...new Set([tahapan, status].filter(Boolean))].join(' · ');

  return (
    <section class="rounded-panel bg-surface-raised border border-line-strong p-5 md:p-6 mb-6 md:mb-8 max-w-4xl mx-auto text-left">
      {/* ── Header: logo, wordmark, subtitle, verified mark ── */}
      <header class="flex items-center justify-between gap-3 pb-4 mb-6 border-b border-line">
        <div class="flex items-center gap-4 min-w-0">
          <img src={ASJ_LOGO_URL} alt="" aria-hidden="true" class="w-10 h-10 md:w-12 md:h-12 object-contain shrink-0" />
          <div class="min-w-0">
            <p class="text-card-title font-black tracking-wider text-fg">{t('dossier.brand')}</p>
            <p class="text-eyebrow font-bold uppercase text-accent">{t('dossier.verified')}</p>
          </div>
        </div>
        <Icon name="check-circle" class="text-accent-sky text-2xl md:text-3xl shrink-0" />
      </header>

      {/* ── Body: photo column + identity column ── */}
      <div class="flex flex-col md:flex-row gap-6 mb-6">
        <div class="w-full md:w-1/3 flex flex-col items-center gap-3">
          <div class="w-32 h-40 rounded-card bg-surface-sunken border border-line-strong grid place-items-center overflow-hidden shrink-0">
            {photo
              ? <img src={photo} alt={nama} class="w-full h-full object-cover" />
              : <Icon name="user" class="text-5xl text-fg-subtle" />}
          </div>
          <div class="w-full flex flex-col items-center gap-2">
            {idKandidat && (
              <span class="w-full text-center px-4 py-1.5 rounded-pill bg-surface-sunken border border-line-strong text-accent-sky text-caption font-mono font-bold shadow-inner break-all">
                {idKandidat}
              </span>
            )}
            {statusLine && (
              <div class="w-full px-2 py-1.5 rounded-control bg-emerald-900/40 border border-emerald-500/50">
                <p class="text-eyebrow font-bold uppercase text-accent-emerald mb-0.5">{t('dossier.status_stage')}</p>
                <p class="text-caption font-bold text-fg leading-tight break-words">{statusLine}</p>
              </div>
            )}
          </div>
        </div>

        <div class="w-full md:w-2/3 space-y-4 min-w-0">
          <div>
            <h3 class="text-section font-black uppercase text-fg break-words">{nama}</h3>
            {(props.badge || kelas) && (
              <div class="flex flex-wrap items-center gap-2 mt-1">
                {props.badge}
                {kelas && (
                  <span class="px-2 py-0.5 bg-indigo-900/60 text-indigo-300 border border-indigo-500/50 rounded text-eyebrow font-bold whitespace-nowrap">
                    <Icon name="users" class="mr-1" />{kelas.toUpperCase()}
                  </span>
                )}
              </div>
            )}
            {wa && (
              <a
                href={`https://wa.me/${wa}`}
                target="_blank"
                rel="noopener noreferrer"
                class="text-accent-emerald text-body-sm font-bold hover:opacity-80 transition-opacity inline-flex items-center gap-1 mt-1"
              >
                <Icon name="whatsapp" class="text-lg" />
                <span>{wa}</span>
              </a>
            )}
          </div>

          {/* Label/value grid. Each row is OMITTED when it has no value, so a
              candidate who never filled the master biodata sees a shorter card
              rather than a card full of dashes (DESIGN.md P5). */}
          {(gender || usia || tbBb || pendidikan || ttl || email || alamat) && (
            <dl class="grid grid-cols-2 gap-x-4 gap-y-4 border-t border-b border-line py-4">
              {gender && <Cell label={t('ui.cv_gender')} value={gender} />}
              {usia && <Cell label={t('ui.cv_usia')} value={usia + t('ui.age_years_suffix')} />}
              {tbBb && <Cell label={t('ui.cv_fisik')} value={tbBb} />}
              {pendidikan && <Cell label={t('ui.cv_pendidikan')} value={pendidikan} />}
              {ttl && <Cell span label={t('ui.cv_ttl')} value={ttl} />}
              {email && <Cell span label={t('ui.cv_email')} value={email} />}
              {alamat && <Cell span label={t('dossier.address_ktp')} value={alamat} />}
            </dl>
          )}

          {(jftText || sswText) && (
            <div class="grid grid-cols-2 gap-3">
              {jftText && <Tile tone="sky" label={t('ui.jft_jlpt')} value={jftText} />}
              {sswText && <Tile tone="emerald" label={t('ui.ssw_field')} value={sswText} />}
            </div>
          )}
        </div>
      </div>

      {jobs.length > 0 && (
        <div class="mb-5 bg-surface-sunken p-4 rounded-card border border-line-strong">
          <h4 class="text-caption font-bold uppercase text-fg-subtle mb-2">{t('ui.cv_jobs_header')}:</h4>
          <div class="flex flex-wrap gap-2">
            {jobs.map((j) => (
              <span key={j} class="rounded-control bg-surface border border-line-strong px-2.5 py-1 text-caption font-bold text-fg break-all">{j}</span>
            ))}
          </div>
        </div>
      )}

      {/* ── CTA. The same artefact the admin panel produces, from the same
             formatter (`src/lib/biodataExport.ts`) — legacy served both surfaces
             from one `downloadBiodataLengkap()`. ── */}
      <button
        type="button"
        onClick={props.onDownload}
        class="w-full mt-2 inline-flex items-center justify-center gap-2 py-3 min-h-[48px] rounded-control bg-surface-sunken border border-emerald-500/50 hover:bg-emerald-700 text-accent-emerald hover:text-white text-caption font-bold transition-colors select-none"
      >
        <Icon name="download" />
        {t('ui.cv_download_biodata')}
      </button>
    </section>
  );
}
