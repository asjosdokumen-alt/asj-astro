/**
 * RejectMailModal.tsx — composer alasan penolakan lamaran (#12).
 *
 * PARITY LEGACY
 *   Legacy: `assets/modals-shared.html` → `#modal-reject-mail`, dibuka oleh
 *   `js/api/forms.ts:prosesRejectForm(id)` yang mengosongkan textarea, lalu
 *   `submitRejectForm()` mengirim `callAPI('rejectForm', [id, currentAdminName, reason])`.
 *
 *   Sebelum modal ini ada, repo Astro menolak lamaran dengan
 *   `window.confirm(...)` dan alasan **hardcoded** `'Lamaran GAGAL'`. Backend
 *   memang sudah menerima argumen ke-3 sebagai alasan (`handleRejectForm` →
 *   `handleFormStatus(..., 'GAGAL', reason)`), jadi alasannya selalu
 *   "Lamaran ditolak" default — padahal UI legacy menjanjikan teks itu muncul di
 *   Dashboard Kandidat. Jadi gap-nya nyata dan berdampak ke kandidat.
 *
 * CATATAN PENTING soal argumen ke-2 (`currentAdminName`)
 *   Legacy mengirim **nama admin**, bukan session token, di posisi ke-2. Di repo
 *   baru posisi itu sudah dipakai `sessionToken` oleh `api.secure`, jadi nama
 *   admin tidak dikirim dari klien — identitas diambil server dari sesi, yang
 *   justru lebih benar (klien tidak bisa memalsukan nama admin).
 */
import { useState } from 'preact/hooks';
import { t } from '../../store/i18n';
import Icon from '../ui/Icon';
import { useOverlay } from '../ui/useOverlay';

interface Props {
  /** Nama kandidat, untuk ditampilkan di judul supaya admin yakin barisnya benar. */
  candidateName?: string;
  onCancel: () => void;
  /** Dipanggil dengan alasan final. Induk yang mengirim ke backend. */
  onConfirm: (reason: string) => void | Promise<void>;
}

export default function RejectMailModal({ candidateName, onCancel, onConfirm }: Props) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  // §25: this component used to hardcode role/aria-modal in the markup with no
  // hook behind them — i.e. it told assistive tech the page was inert while
  // focus stayed free to wander out. The hook now installs the trap AND writes
  // the semantics, so the claim and the behaviour cannot drift apart.
  //
  // No `label`: the hook names the dialog after its first heading (the <h3>
  // below), which is the same text a sighted user reads as the title.
  const { containerRef, onBackdropClick } = useOverlay({ open: true, onClose: onCancel });

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // Alasan kosong dikirim apa adanya (''), BUKAN diisi teks karangan di
      // sini: backend memakai fallback 'Lamaran ditolak' sendiri
      // (`handleRejectForm`), jadi kandidat tidak pernah melihat pesan kosong
      // dan UI tidak menciptakan alasan yang tidak ditulis admin.
      await onConfirm(reason.trim());
    } catch {
      // Induk yang menampilkan toast error; di sini cukup jangan biarkan
      // promise rejection-nya lepas (jadi unhandled rejection). Modal tetap
      // terbuka + tombol aktif supaya admin bisa coba lagi.
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={containerRef} onClick={onBackdropClick}
      class="fixed inset-0 u-modal-shell bg-black/90 backdrop-blur-md z-[200] flex items-center justify-center p-4">
      <div class="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden border border-slate-700 bg-slate-900 flex flex-col">
        <div class="p-5 border-b border-slate-700 bg-slate-900 flex justify-between items-center">
          <h3 class="text-white font-bold text-lg">
            <Icon name="ban" class="text-red-500 mr-2" />
            {t('ui.reject_app')}
            {candidateName ? <span class="text-slate-400 font-normal text-sm ml-2">— {candidateName}</span> : null}
          </h3>
          <button type="button" onClick={onCancel} class="text-slate-400 hover:text-white transition" aria-label={t('public.close')}>
            <Icon name="times" class="text-xl" />
          </button>
        </div>

        <div class="p-6 bg-slate-800/50 flex flex-col gap-4">
          <div class="bg-red-900/20 border border-red-500/30 p-3 rounded-lg">
            <p class="text-sm text-slate-300">{t('ui.reject_reason_hint')}</p>
          </div>
          <textarea value={reason}
            onInput={(e) => setReason((e.target as HTMLTextAreaElement).value)}
            placeholder={t('ui.reject_reason_ph')}
            aria-label={t('ui.reject_reason_ph')}
            class="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white text-sm focus:border-sky-500 outline-none h-32 resize-none" />
        </div>

        <div class="p-4 border-t border-slate-700 bg-slate-900 flex justify-end gap-2">
          <button onClick={onCancel} disabled={busy}
            class="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-bold transition disabled:opacity-50">
            {t('button.cancel')}
          </button>
          <button onClick={submit} disabled={busy}
            class="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-bold transition disabled:opacity-50">
            <Icon name={busy ? 'spinner' : 'ban'} spin={busy} class="mr-1" />
            {t('ui.set_fail')}
          </button>
        </div>
      </div>
    </div>
  );
}
