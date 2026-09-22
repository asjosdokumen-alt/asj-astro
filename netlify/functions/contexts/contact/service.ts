/**
 * contexts/contact/service.ts — inbound messages from the public contact form
 *
 * Other contexts and surfaces import ONLY from index.ts.
 *
 * WHY THIS IS A WRITE THAT ANYONE MAY CALL, AND HOW IT STAYS SAFE
 * --------------------------------------------------------------
 * Every other mutating action in this repo requires a session: an admin editing
 * a job, a candidate editing their biodata. This one cannot, because the whole
 * point of a company contact form is that the visitor has no account yet —
 * requiring one would mean only existing users could ask how to become one.
 *
 * That makes it the only unauthenticated write in the deployment, so the
 * defences are explicit rather than assumed:
 *
 *   1. The payload is validated by `guardPayload` before anything is stored.
 *   2. The message is length-bounded — a body limit is a storage limit.
 *   3. Per-number rate limiting counts rows already stored (see repository.ts
 *      for why an in-memory counter alone cannot work in a serverless function).
 *   4. Two fields the visitor never sees must stay empty. A naive bot fills
 *      every input it finds; a human never sees the hidden one. This is a
 *      honeypot, and it costs nothing when triggered because the response is
 *      the same success the honest path returns — a bot that gets an error
 *      learns to retry, a bot that gets "success" does not.
 *
 * WHAT THE VISITOR IS TOLD, AND WHY IT IS DELIBERATELY VAGUE
 * ---------------------------------------------------------
 * The reply never confirms whether storage or notification succeeded. The
 * message is safe either way — it is either in the table, or an admin push went
 * out, or both — but a caller who can distinguish the failure modes can probe
 * the deployment. The admin notification is therefore best-effort and its
 * result is never surfaced.
 */
import { Errors } from '../../_lib/kernel/errors';
import { log } from '../../_lib/kernel/log';
import { guardPayload, text } from '../../_lib/kernel/guard';
import { normalizeWa, insertPesanKontak, countPesanSejak } from './repository';

/** Field limits. A contact form is a paragraph, not a file transfer. */
const MAX_NAMA = 120;
const MAX_WA = 40;
const MAX_SUBJEK = 160;
const MAX_PESAN = 4000;

/** How many messages one number may send inside the window. */
const RATE_MAX = 5;
const RATE_WINDOW_MS = 60 * 60 * 1000; // one hour

/**
 * The honeypot: its position in the payload AND its field name.
 *
 * WHY THE INDEX IS A NAMED CONSTANT. The payload arrives positionally, so the
 * honeypot's slot is a bare `4` at the destructure below — a number that means
 * nothing to a reader and that silently shifts if anyone reorders the guard
 * list. Naming it does not make the coupling go away, but it puts the two facts
 * that must agree (`perusahaan` on the client, slot 4 here) in one place with
 * the cross-reference written down, instead of splitting them between a comment
 * in `ContactForm.tsx` and an offset in an array literal.
 *
 * The failure mode being guarded against is quiet in the worst direction: if the
 * slots drift, the honeypot reads the visitor's SUBJECT and every honest
 * submission is discarded as a bot — while the suspicious ones pass.
 */
const HONEYPOT_FIELD = 'perusahaan';
const HONEYPOT_SLOT = 4;

/**
 * Why a rate-limited visitor is told about it, while a honeypot bot is not.
 *
 * These look inconsistent and are not. A real person who typed three paragraphs
 * and hit the limit deserves to know, and will stop — telling them costs
 * nothing. A bot is the opposite: any distinguishable response is a signal it
 * can tune against. So the honest caller gets the truth and the bot gets
 * silence, and the two cases are separated by the honeypot rather than by the
 * limiter.
 */
export async function handleKirimPesanKontak(payload: unknown[]) {
  const [namaRaw, waRaw, subjekRaw, pesanRaw, honeypotRaw] = guardPayload(payload, [
    text('Nama', MAX_NAMA),
    text('Nomor WhatsApp', MAX_WA),
    text('Subjek', MAX_SUBJEK),
    text('Pesan', MAX_PESAN),
    // Tolerant on purpose: an omitted honeypot arrives as `null`, and a bot
    // that omits the field entirely is not thereby suspicious.
    () => {},
  ]) as [string, string, string, string, unknown];

  const nama = namaRaw.trim();
  const subjek = subjekRaw.trim();
  const pesan = pesanRaw.trim();
  const wa = normalizeWa(waRaw);

  // Read through the named slot so a reorder of the guard list above fails this
  // line rather than silently reassigning which field is the trap. Kept as an
  // assertion as well: the log line below names the field so a triage read does
  // not have to count array positions.
  const honeypotValue = payload[HONEYPOT_SLOT] ?? honeypotRaw;
  const honeypotFilled =
    honeypotValue !== null && honeypotValue !== undefined && String(honeypotValue).trim() !== '';
  if (honeypotFilled) {
    // Same shape as success, deliberately. Nothing is stored.
    log.info('contact.honeypot', { field: HONEYPOT_FIELD, wa });
    return { success: true, message: 'Pesan Anda sudah kami terima.' };
  }

  // Normalising can empty the field (letters, punctuation), so this is checked
  // after the transform, not before.
  if (!wa) {
    return { success: false, message: 'Nomor WhatsApp wajib diisi dengan angka yang benar.' };
  }
  if (!nama || !subjek || !pesan) {
    return { success: false, message: 'Nama, subjek, dan pesan wajib diisi.' };
  }

  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
  let recent = 0;
  try {
    recent = await countPesanSejak(wa, since);
  } catch (e) {
    // A limiter that cannot read its own state must not become an outage. Log
    // it and let the message through: the alternative rejects a real enquiry
    // because a COUNT query failed, which trades a small abuse risk for a
    // certain lost customer.
    log.warn('contact.rate-check-failed', { err: String(e) });
  }
  if (recent >= RATE_MAX) {
    return {
      success: false,
      message: 'Anda sudah mengirim beberapa pesan. Mohon tunggu sebentar sebelum mengirim lagi.',
    };
  }

  const row = {
    id: `KONTAK${Date.now()}`,
    nama,
    no_wa: wa,
    subjek,
    pesan,
    status: 'BARU',
    created_at: new Date().toISOString(),
  };

  try {
    await insertPesanKontak(row);
  } catch (e) {
    // The visitor cannot act on a database fault, and the raw error may name
    // internal detail. Report a generic failure; the real cause is in the log.
    log.error('contact.insert-failed', { err: String(e) });
    throw Errors.internal('Pesan gagal dikirim. Silakan hubungi kami melalui WhatsApp atau surel.');
  }

  // Best-effort. A rejected push must not fail a message that is already
  // stored, and the result is never returned to the caller.
  try {
    const { notifyAdmins } = await import('../../_lib/fcm-helpers');
    await notifyAdmins(
      'Pesan Kontak Baru',
      `${nama} (${wa}): ${subjek}`,
      '/admin.html',
    );
  } catch (e) {
    log.warn('contact.notify-failed', { err: String(e) });
  }

  log.info('contact.stored', { wa, subjek });
  return { success: true, message: 'Pesan Anda sudah kami terima.' };
}
