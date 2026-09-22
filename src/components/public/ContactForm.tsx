/**
 * ContactForm.tsx — the public contact form in the `#kontak` section.
 *
 * WHAT THIS IS, AND WHAT IT IS NOT
 * --------------------------------
 * This is the ONLY unauthenticated WRITE in the deployment. A visitor has no
 * account — that is the whole point of a company contact form, because requiring
 * one would mean only existing users could ask how to become one. The server side
 * of that decision (validation, length bounds, per-number rate limiting, the
 * honeypot, and why the reply is deliberately vague) lives in
 * `netlify/functions/contexts/contact/service.ts`; read that file for the
 * security reasoning. This file owns only what the visitor sees.
 *
 * THE HONEYPOT, AND WHY ITS LABEL IS INVISIBLE RATHER THAN ABSENT
 * --------------------------------------------------------------
 * A bot fills every input it can find; a person never sees this one. Two
 * consequences shape the markup:
 *
 *   - It is NOT `type="hidden"`. A naive scraper is often smart enough to skip
 *     explicitly hidden fields, which would defeat the trap. It is a normal text
 *     input that is visually hidden and removed from the tab order, so it looks
 *     like an ordinary field to anything parsing the DOM and like nothing at all
 *     to a person.
 *   - It carries `tabIndex={-1}` AND `aria-hidden`. Without both, a keyboard
 *     user would tab into an invisible box and a screen reader would announce a
 *     field that has no meaning. `autocomplete="off"` keeps a password manager
 *     from helpfully filling it in and getting an honest visitor silently
 *     blackholed — which is the one failure mode of a honeypot that actually
 *     harms someone.
 *
 * The `name` is `perusahaan` ("company"), which is plausible enough to attract a
 * bot that scrapes field names for something business-shaped, and is the exact
 * string `service.ts` reads via its `HONEYPOT_FIELD` constant.
 *
 * SESSION OPTIONS ARE NOT DEFAULTS, ON PURPOSE
 * -------------------------------------------
 * `apiClient` defaults to `requireAuth: true` and `onSessionInvalid: 'logout'`.
 * Left alone, an anonymous visitor would be REFUSED (no session) and then
 * redirected to `/` — so the form would look like it submitted and the page
 * would jump. Both are overridden for the obvious reason: this page is public.
 *
 * `silent: true` because this component owns its error presentation (inline
 * message + toast), and the client's own toast would otherwise double every
 * failure. `onSessionInvalid: 'throw'` rather than 'logout' for the same reason
 * the landing page's other public callers use it: a public visitor must never be
 * logged out or redirected by a background call.
 *
 * WHY A SUCCESS STATE RATHER THAN A RESET FORM
 * -------------------------------------------
 * A cleared form looks identical to one that failed silently. Replacing it with
 * a confirmation removes that ambiguity, states when a reply can be expected,
 * and offers the WhatsApp route for anyone who needs an answer sooner. The
 * confirmation is a live region (`role="status"`) so a screen-reader user hears
 * it instead of being left on a form that apparently did nothing.
 */
import { useState } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import { showToast } from '../Toast';
import { apiClient } from '../../lib/apiClient';
import { t, langStore } from '../../store/i18n';
import Icon from '../ui/Icon';

/** The server's answer. Both fields are optional because only `message` is guaranteed. */
interface KirimPesanRes {
  success?: boolean;
  message?: string;
}

interface Fields {
  nama: string;
  noWa: string;
  subjek: string;
  pesan: string;
  /** The honeypot. Always empty for a person; a bot fills it. */
  perusahaan: string;
}

const EMPTY: Fields = { nama: '', noWa: '', subjek: '', pesan: '', perusahaan: '' };

/**
 * Client-side limits, mirroring `service.ts` (MAX_NAMA 120, MAX_WA 40,
 * MAX_SUBJEK 160, MAX_PESAN 4000).
 *
 * Kept in sync with the server deliberately, and duplicated rather than shared:
 * the server file is bundled for a Node/Netlify runtime and this one for the
 * browser, and a shared constant would pull the whole service module (and its
 * database imports) into the client bundle. The duplication is bounded to four
 * numbers, and the server is the authority — these `maxLength` attributes stop a
 * visitor typing something that would be rejected, they do not enforce anything.
 */
const MAX = { nama: 120, noWa: 40, subjek: 160, pesan: 4000 } as const;

/**
 * The shared class for the four text fields.
 *
 * WHY IT IS A CONSTANT AND NOT REPEATED FOUR TIMES. It was repeated four times,
 * byte-identically, which is how the field height drifted out of compliance
 * without anyone noticing: there was no single place that represented "the field
 * height", so there was nothing to check.
 *
 * MEASURED 2026-09-22 at a 390px viewport, before this change: each field
 * rendered 295x40. DESIGN.md:582 sets the minimum at 44px and, for buttons
 * inside a mobile form, at 48px. Submitting this form is the single conversion
 * the contact section exists for, so it gets the 48px tier rather than the 44px
 * floor. The submit button beside these fields already carried
 * `min-h-[44px]` (see the comment on it below), so the fields were the only
 * controls in this form under the standard.
 *
 * `min-h-12` (48px) and not `h-12`: the `pesan` field is a `resize-y` textarea
 * and a fixed height would fight the resize handle.
 */
const FIELD_CLASS =
  'min-h-12 rounded-control border border-line bg-surface px-3 py-2 text-body-sm text-fg';

export default function ContactForm() {
  const _lang = useStore(langStore);
  const [f, setF] = useState<Fields>(EMPTY);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof Fields) => (e: Event) =>
    setF((prev) => ({ ...prev, [k]: (e.target as HTMLInputElement | HTMLTextAreaElement).value }));

  const submit = async (e: Event) => {
    e.preventDefault();
    if (sending) return;

    // The visitor never sees the honeypot, so this branch is only reachable by
    // something that filled it programmatically. Report the same success the
    // honest path reports — a bot that gets an error learns to retry, a bot that
    // gets "sent" does not. Nothing is transmitted, so this costs one round trip
    // less than the real path.
    if (f.perusahaan.trim() !== '') {
      setSent(true);
      return;
    }

    setError('');
    setSending(true);
    try {
      // Order is the contract: `service.ts` destructures
      // `[nama, wa, subjek, pesan, honeypot]` positionally.
      const res = await apiClient<KirimPesanRes>(
        'kirimPesanKontak',
        [f.nama, f.noWa, f.subjek, f.pesan, f.perusahaan],
        { requireAuth: false, onSessionInvalid: 'throw', silent: true },
      );
      if (res && res.success === false) {
        // The server's own message is written for the visitor and is more
        // specific than anything this component could guess ("Nomor WhatsApp
        // wajib diisi..." vs a generic failure), so show it verbatim.
        setError(res.message || t('contact.failed'));
        return;
      }
      setSent(true);
      setF(EMPTY);
    } catch (err) {
      // `apiClient` throws on non-2xx and carries the server's message on the
      // Error (see its `!res.ok` branch). Falling back to the generic string
      // keeps a parse failure from replacing one error with a vaguer one.
      const msg = err instanceof Error && err.message ? err.message : t('contact.failed');
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div
        role="status"
        class="flex flex-col items-start gap-3 rounded-card border border-emerald-500/40 bg-emerald-900/15 p-6"
      >
        <span class="inline-flex items-center gap-2 text-card-title font-bold text-emerald-400">
          <Icon name="check-circle" />
          <span data-lang="contact.sent_title">{t('contact.sent_title')}</span>
        </span>
        <p class="text-body-sm text-fg-muted" data-lang="contact.sent_body">
          {t('contact.sent_body')}
        </p>
      </div>
    );
  }

  // Every control's id is derived from its own binding key, so the id, the
  // `for` and the `id` on the error message cannot drift apart. `e2e/test-labels.mjs`
  // fails on an unassociated label, and a hand-written id is how that happens.
  const idOf = (k: string) => `kontak-${k}`;

  return (
    <form onSubmit={submit} noValidate class="flex flex-col gap-4">
      <div class="grid gap-4 sm:grid-cols-2">
        <label class="flex flex-col gap-1.5" for={idOf('nama')}>
          <span class="text-caption font-bold uppercase text-fg" data-lang="contact.field_nama">
            {t('contact.field_nama')}
          </span>
          <input
            id={idOf('nama')}
            name="nama"
            type="text"
            required
            maxLength={MAX.nama}
            autocomplete="name"
            value={f.nama}
            onInput={set('nama')}
            class={FIELD_CLASS}
          />
        </label>

        <label class="flex flex-col gap-1.5" for={idOf('noWa')}>
          <span class="text-caption font-bold uppercase text-fg" data-lang="contact.field_wa">
            {t('contact.field_wa')}
          </span>
          <input
            id={idOf('noWa')}
            name="no_wa"
            type="tel"
            required
            maxLength={MAX.noWa}
            autocomplete="tel"
            inputMode="tel"
            placeholder="08xx-xxxx-xxxx"
            value={f.noWa}
            onInput={set('noWa')}
            class={FIELD_CLASS}
          />
        </label>
      </div>

      <label class="flex flex-col gap-1.5" for={idOf('subjek')}>
        <span class="text-caption font-bold uppercase text-fg" data-lang="contact.field_subjek">
          {t('contact.field_subjek')}
        </span>
        <input
          id={idOf('subjek')}
          name="subjek"
          type="text"
          required
          maxLength={MAX.subjek}
          value={f.subjek}
          onInput={set('subjek')}
          class={FIELD_CLASS}
        />
      </label>

      <label class="flex flex-col gap-1.5" for={idOf('pesan')}>
        <span class="text-caption font-bold uppercase text-fg" data-lang="contact.field_pesan">
          {t('contact.field_pesan')}
        </span>
        <textarea
          id={idOf('pesan')}
          name="pesan"
          required
          rows={5}
          maxLength={MAX.pesan}
          value={f.pesan}
          onInput={set('pesan')}
          class={`${FIELD_CLASS} resize-y`}
        />
      </label>

      {/* ── Honeypot ────────────────────────────────────────────────────────
          Read the note at the top of this file before changing anything here.
          The three attributes that matter are `tabIndex={-1}` (keyboard users
          cannot land in it), `aria-hidden` (screen readers do not announce it)
          and `autocomplete="off"` (a password manager does not fill it and so
          does not get an honest visitor silently discarded). Removing any one of
          them turns a bot trap into an accessibility defect. */}
      <div class="hidden" aria-hidden="true">
        <label class="flex flex-col gap-1.5" for={idOf('perusahaan')}>
          <span>Perusahaan</span>
          <input
            id={idOf('perusahaan')}
            name="perusahaan"
            type="text"
            tabIndex={-1}
            autocomplete="off"
            value={f.perusahaan}
            onInput={set('perusahaan')}
          />
        </label>
      </div>

      {error ? (
        <p
          role="alert"
          class="rounded-card border border-rose-500/40 bg-rose-900/15 px-4 py-3 text-body-sm text-rose-300"
        >
          {error}
        </p>
      ) : null}

      {/* ── The submit control ──────────────────────────────────────────────
          The classes are the `primary` variant of Button.astro transcribed,
          NOT invented, because `Button.astro` is an `.astro` component and
          cannot be imported into this `.tsx` island.

          The first version of this button used `bg-accent text-accent-fg`, and
          `verify:classes` failed it: `text-accent-fg` has no rule, so the label
          would have rendered unstyled. That gate was right and the cause is a
          documented trap — DESIGN.md §3.2 and `button.test.ts` are both explicit
          that `--color-accent` is the LIGHT accent for text and icons on a dark
          surface, and is far below AA as a SOLID FILL. The solid tiers are the
          -600/-700 steps; pink-600 is measured at 4.60:1 against white.

          The two rules Button.astro also enforces and this must keep:
            - `min-h-[44px]` — the §6.4 touch minimum as a min-height, so a later
              padding trim cannot push the target below the floor;
            - hover DARKENS (-600 -> -700). Every other button in the repo does;
              a control that lightens on hover reads as disabled. */}
      <div class="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={sending}
          class="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-control bg-pink-600 px-5 py-2.5 text-body-sm font-bold text-white transition select-none hover:bg-pink-700 disabled:opacity-50 disabled:pointer-events-none motion-reduce:transition-none"
        >
          <Icon name={sending ? 'spinner' : 'paper-plane'} spin={sending} />
          <span data-lang={sending ? 'contact.sending' : 'contact.send'}>
            {sending ? t('contact.sending') : t('contact.send')}
          </span>
        </button>
        <span class="text-caption text-fg-muted" data-lang="contact.privacy">
          {t('contact.privacy')}
        </span>
      </div>
    </form>
  );
}
