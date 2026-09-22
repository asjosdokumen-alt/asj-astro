/**
 * ContactForm.test.tsx — the public contact island.
 *
 * WHAT THIS GATE IS FOR, AND WHAT IT DELIBERATELY DOES NOT TEST
 * ------------------------------------------------------------
 * This file did not exist when the component shipped, and that was a real gap:
 * every other claim about the form was pinned somewhere else, so nothing would
 * have failed if the island broke in the browser. The four claims below are the
 * ones that no other suite makes.
 *
 *   1. CALL ARGUMENT ORDER. `service.ts` destructures its payload POSITIONALLY
 *      (`[nama, wa, subjek, pesan, honeypot]`), so transposing two fields in the
 *      call site is a silent data-corruption bug: the form still submits, still
 *      reports success, and the message body arrives in the subject column. No
 *      type can catch it — both are `string`. Only asserting the actual argument
 *      array does. This is the highest-value test in the file.
 *
 *   2. THE SESSION OPTIONS. `apiClient` defaults to `requireAuth: true` and
 *      `onSessionInvalid: 'logout'`. An anonymous visitor would be refused and
 *      then redirected, so the form would appear to submit and the page would
 *      jump. The options object is asserted literally, because "the request was
 *      made" is equally true in the broken configuration.
 *
 *   3. THE HONEYPOT TRAP SHORT-CIRCUITS. A bot that fills `perusahaan` must be
 *      shown the SAME success an honest visitor sees, and must produce NO
 *      request. Both halves matter: a different response teaches the bot to
 *      retry, and a request would charge the database for every bot hit.
 *
 *   4. LABEL ASSOCIATION ON THE RENDERED DOM. `e2e/test-labels.mjs` covers this
 *      in a browser, but it costs a full build + server; this is the same claim
 *      as a unit test, and it is what failed when the id/`for` pair was written
 *      by hand in an earlier iteration.
 *
 * WHAT IS NOT HERE: server-side validation bounds, rate limiting, and the
 * honeypot's own `HONEYPOT_FIELD` constant are pinned in
 * `netlify/functions/contexts/contact/service.ts`'s own concerns — this file
 * must not duplicate them or the two copies will drift.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// `apiClient` is mocked rather than stubbed at the HTTP layer: the claim under
// test is "what did this component ASK FOR", and a mock is the only object that
// can answer it without also re-testing apiClient's own retry/cache behaviour
// (which has its own suite in src/lib/apiClient.test.ts).
const apiClient = vi.fn();
vi.mock('../../lib/apiClient', () => ({
  apiClient: (...args: unknown[]) => apiClient(...args),
}));

// The toast is a side effect of the error path only; mocking it keeps a failed
// assertion from also queueing a real toast on the shared nanostores atom.
vi.mock('../Toast', () => ({ showToast: vi.fn() }));

const { default: ContactForm } = await import('./ContactForm');

/** Fill the four visible fields. Anything omitted stays empty. */
function fill(values: Partial<Record<'Nama Lengkap' | 'Nomor WhatsApp' | 'Subjek' | 'Pesan', string>>) {
  for (const [label, value] of Object.entries(values)) {
    fireEvent.input(screen.getByLabelText(new RegExp(`^${label}$`)), { target: { value } });
  }
}

beforeEach(() => {
  apiClient.mockReset();
  apiClient.mockResolvedValue({ success: true });
});

afterEach(cleanup);

describe('ContactForm', () => {
  it('sends the five fields in the order service.ts destructures them', async () => {
    render(<ContactForm />);
    fill({
      'Nama Lengkap': 'Budi Santoso',
      'Nomor WhatsApp': '081234567890',
      'Subjek': 'Tanya lowongan',
      'Pesan': 'Apakah masih ada kuota?',
    });

    fireEvent.submit(screen.getByRole('button', { name: /kirim/i }).closest('form') as HTMLFormElement);

    await waitFor(() => expect(apiClient).toHaveBeenCalledTimes(1));
    // THE ASSERTION THAT MATTERS. `toEqual` on the whole array, not
    // `toHaveBeenCalledWith(expect.anything(), expect.anything())` — the point
    // is the ORDER, and a subset match cannot see a swap.
    expect(apiClient).toHaveBeenCalledWith(
      'kirimPesanKontak',
      ['Budi Santoso', '081234567890', 'Tanya lowongan', 'Apakah masih ada kuota?', ''],
      expect.anything(),
    );
  });

  it('opts out of the authenticated defaults, because this page is public', async () => {
    render(<ContactForm />);
    fill({ 'Nama Lengkap': 'Ani', 'Nomor WhatsApp': '0812', 'Subjek': 'Halo', 'Pesan': 'Ping' });
    fireEvent.submit(screen.getByRole('button', { name: /kirim/i }).closest('form') as HTMLFormElement);

    await waitFor(() => expect(apiClient).toHaveBeenCalledTimes(1));
    const opts = apiClient.mock.calls[0][2];
    expect(opts).toEqual({ requireAuth: false, onSessionInvalid: 'throw', silent: true });
  });

  it('shows a bot the same success as a person, and sends nothing', async () => {
    render(<ContactForm />);
    // Only the invisible field is filled — exactly what an automated filler does.
    fireEvent.input(screen.getByLabelText('Perusahaan'), { target: { value: 'PT Contoh' } });
    fireEvent.submit(screen.getByRole('button', { name: /kirim/i }).closest('form') as HTMLFormElement);

    await waitFor(() => expect(screen.getByRole('status')).toBeTruthy());
    // No request is the second half of the claim: the trap must be free.
    expect(apiClient).not.toHaveBeenCalled();
  });

  it('associates every control with its own label', () => {
    const { container } = render(<ContactForm />);
    const ids = Array.from(container.querySelectorAll('input, textarea')).map((n) => n.id);
    expect(ids).toHaveLength(5);
    for (const id of ids) {
      // A label whose `for` matches this id must exist. The honeypot's label is
      // included: it is visually hidden, not absent, so it must still associate.
      expect(container.querySelector(`label[for="${id}"]`)).not.toBeNull();
    }
  });

  it('surfaces the server message rather than a generic failure', async () => {
    apiClient.mockResolvedValue({ success: false, message: 'Nomor WhatsApp wajib diisi.' });
    render(<ContactForm />);
    fill({ 'Nama Lengkap': 'Ani', 'Nomor WhatsApp': '', 'Subjek': 'Halo', 'Pesan': 'Ping' });
    fireEvent.submit(screen.getByRole('button', { name: /kirim/i }).closest('form') as HTMLFormElement);

    // The server's text is written FOR the visitor and is more specific than
    // anything this component could guess, so it must be shown verbatim.
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Nomor WhatsApp wajib diisi.'));
  });
});
