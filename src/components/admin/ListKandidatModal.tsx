/**
 * ListKandidatModal.tsx — Shows candidates assigned to a specific job
 * Source: legacy/partials/modals-shared.html → modal-list-kandidat
 * Root parity (A04, 2026-09-04) vs legacy js/render/admin.ts (count cell →
 * bukaModalListKandidat) + js/admin_ops/candidates.ts:
 *   - Data: legacy draws from the FULL server-side candidate memory
 *     (ALL_CANDIDATES via ensureAllCandidates). The rebuild previously
 *     filtered the store's CURRENT PAGE only (≤20 rows) → count + list
 *     silently wrong beyond page 1. Now the store exposes
 *     fetchAllKandidat() (loops getCandidatesPage) and the modal refreshes
 *     it on every open; the TabDbJob count cell stays correct reactively.
 *   - Per-row buttons mirror legacy: 👁 bukaDigitalCV (opens the admin
 *     dossier = CandidateProfileModal via showCandidateHistory), WA chat,
 *     and keluarkanKandidatDariJob (tandaiGagalJob).
 *   - "Undang Grup" sends the legacy object payload
 *     { candidates:[{wa,nama}], jobCode, linkGrup, interval } to
 *     kirimTawaranMassal — surface enqueues it as a wa.broadcast job and
 *     the sweep-queue worker now actually sends it (was NOT_IMPL → silent
 *     dead flow).
 * Features: Copy WA, Undang Grup (bulk WA), Remove from job, dossier peek.
 */
import { useState, useEffect } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import { authStore } from '../../store/authReactive';
import { allKandidatList, fetchAllKandidat } from '../../store/adminStore';
import { t } from '../../store/i18n';
import { showToast } from '../Toast';
import Icon from '../ui/Icon';
import { getEndpoint } from '../../lib/apiEndpoint';

interface Props {
  jobCode: string;
  isOpen: boolean;
  onClose: () => void;
}

interface Kandidat {
  id?: string;
  nama?: string;
  wa?: string;
  idLoker?: string;
  tahapan?: string;
  status?: string;
}

export default function ListKandidatModal({ jobCode, isOpen, onClose }: Props) {
  const allCandidates = useStore(allKandidatList);
  const [showUndangPanel, setShowUndangPanel] = useState(false);
  const [linkGrup, setLinkGrup] = useState('');
  const [interval, setInterval_] = useState(5);
  const [sending, setSending] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  // Legacy behaviour: pastikan memori kandidat penuh + segar setiap buka.
  useEffect(() => {
    if (isOpen) {
      fetchAllKandidat();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, jobCode]);

  if (!isOpen) return null;

  const cands = (allCandidates as any[]).filter(
    (c: any) => c && c.idLoker && String(c.idLoker).includes(jobCode),
  );

  // Copy all WA numbers to clipboard (format sama dengan legacy)
  function copyAllWa() {
    const txt = `*LIST KANDIDAT JOB ${jobCode}* Total: ${cands.length} Pelamar\n\n` +
      cands
        .map((c: Kandidat, i: number) => `${i + 1}. ${c.nama} - WA: ${c.wa}`)
        .join('\n');
    navigator.clipboard.writeText(txt).then(
      () => showToast('Berhasil disalin!', 'success'),
      () => showToast('Gagal menyalin', 'error')
    );
  }

  // Padanan legacy keluarkanKandidatDariJob(wa, jobCode) → tandaiGagalJob
  async function removeFromJob(wa: string) {
    if (!confirm(`Hapus kandidat dari job ${jobCode}?`)) return;
    setRemoving(wa);
    try {
      const res = await fetch(getEndpoint('tandaiGagalJob'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'tandaiGagalJob',
          args: [wa, jobCode],
          sessionToken: authStore.get().sessionToken || '',
        }),
      });
      const data = await res.json();
      if (data && data.success) {
        showToast('Kandidat ditandai GAGAL & dilepas dari job', 'success');
        fetchAllKandidat();
      } else {
        showToast((data && data.error) || 'Gagal menghapus kandidat.', 'error');
      }
    } catch {
      showToast('Network error', 'error');
    } finally {
      setRemoving(null);
    }
  }

  // Undang Grup: payload OBJECT legacy { candidates, jobCode, linkGrup,
  // interval } — handleKirimTawaranMassal backend membaca bentuk ini
  // (bukan array [waList, pesan, interval] seperti rebuild lama). Surface
  // men-queue sbg wa.broadcast; worker sweep-queue yg mengirim (sudah
  // diimplementasikan — sebelumnya NOT_IMPL jadi tidak pernah terkirim).
  async function sendUndangan() {
    if (!linkGrup) {
      showToast('Link grup WA wajib diisi', 'error');
      return;
    }
    if (cands.length === 0) {
      showToast('Tidak ada kandidat di job ini', 'error');
      return;
    }
    setSending(true);
    try {
      const res = await fetch(getEndpoint('kirimTawaranMassal'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'kirimTawaranMassal',
          args: [
            {
              candidates: cands.map((c: Kandidat) => ({ wa: c.wa, nama: c.nama })),
              jobCode,
              linkGrup,
              interval,
            },
          ],
          sessionToken: authStore.get().sessionToken || '',
        }),
      });
      const data = await res.json();
      if (data && data.success) {
        showToast(`Undangan ${cands.length} kandidat masuk antrian pengiriman.`, 'success');
        setShowUndangPanel(false);
        setLinkGrup('');
      } else {
        showToast((data && data.error) || 'Gagal mengirim', 'error');
      }
    } catch {
      showToast('Network error', 'error');
    } finally {
      setSending(false);
    }
  }

  return (
    <div class="fixed inset-0 u-modal-shell bg-black/80 backdrop-blur-md z-[250] flex items-center justify-center p-4">
      <div class="glass-panel p-6 md:p-8 rounded-[2rem] w-full max-w-md shadow-2xl relative max-h-[90vh] flex flex-col border border-sky-500/50">
        <button onClick={onClose} class="absolute top-5 right-6 text-slate-400 hover:text-white z-[100]">
          <Icon name="times" class="text-2xl" />
        </button>
        <h3 class="text-xl font-bold text-sky-400 mb-2 border-b border-sky-900/50 pb-3">
          <Icon name="list-ol" class="mr-2" /> List Kandidat
        </h3>
        <p class="text-xs text-slate-400 mb-4">
          Loker Code: <span class="font-bold text-white text-sm">{jobCode}</span>
        </p>

        {/* Action buttons */}
        <div class="flex gap-2 mb-3">
          <button onClick={copyAllWa}
            class="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-bold text-xs transition">
            <Icon name="copy" class="mr-1" /> Copy WA
          </button>
          <button onClick={() => setShowUndangPanel(!showUndangPanel)}
            class="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-xs transition">
            <Icon name="whatsapp" class="mr-1" /> Undang Grup
          </button>
        </div>

        {/* Undang Grup panel */}
        {showUndangPanel && (
          <div class="bg-black/40 border border-emerald-500/30 p-3 rounded-xl mb-3 space-y-2">
            <input type="text" value={linkGrup} onInput={(e) => setLinkGrup((e.target as HTMLInputElement).value)}
              placeholder={t("admin.ph_grup_wa")}
              class="w-full p-2.5 rounded-lg bg-black/60 border border-slate-700 text-sm text-white outline-none focus:border-emerald-500" />
            <input type="number" value={interval} onInput={(e) => setInterval_(parseInt((e.target as HTMLInputElement).value) || 5)}
              placeholder={t("admin.ph_jeda_pesan")}
              class="w-full p-2.5 rounded-lg bg-black/60 border border-slate-700 text-sm text-white outline-none focus:border-emerald-500" />
            <button onClick={sendUndangan} disabled={sending}
              class="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold transition disabled:opacity-50">
              {sending ? 'Mengirim…' : 'Mulai Kirim Undangan'}
            </button>
          </div>
        )}

        {/* Candidate list */}
        <div class="flex-1 u-scroll-area custom-scrollbar pr-2 mb-4 space-y-2">
          {cands.length === 0 ? (
            <div class="text-center text-slate-500 py-4">{t("admin.manual_empty")}</div>
          ) : (
            cands.map((c: Kandidat, i: number) => (
              <div key={c.wa || c.id}
                class="p-3 bg-black/40 border border-slate-700 rounded-lg flex justify-between items-center">
                <div class="min-w-0">
                  <span class="text-slate-500 text-[10px] mr-1">{i + 1}.</span>
                  <span class="font-bold text-white text-xs">{c.nama || '-'}</span>
                  <span class="text-slate-500 text-[10px] ml-2">{c.wa}</span>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                  {/* Padanan legacy 👁 bukaDigitalCV — buka dossier kandidat */}
                  <button
                    onClick={() =>
                      window.dispatchEvent(
                        new CustomEvent('showCandidateHistory', { detail: { wa: c.wa, nama: c.nama } })
                      )
                    }
                    class="w-7 h-7 flex items-center justify-center bg-sky-900/50 hover:bg-sky-600 text-sky-400 hover:text-white rounded-full transition shadow"
                    title={t('admin.tt_lihat_profil')}>
                    <Icon name="eye" class="text-xs" />
                  </button>
                  <a href={`https://wa.me/${c.wa}`} target="_blank" rel="noopener"
                    class="w-7 h-7 flex items-center justify-center bg-emerald-900/50 hover:bg-emerald-600 text-emerald-400 hover:text-white rounded-full transition"
                    title="Chat WA">
                    <Icon name="whatsapp" class="text-xs" />
                  </a>
                  <button onClick={() => removeFromJob(c.wa || '')} disabled={removing === c.wa}
                    class="px-2 py-1 bg-red-900/40 hover:bg-red-600 disabled:opacity-50 text-red-400 hover:text-white rounded text-[10px] font-bold transition"
                    title={t('admin.tt_tandai_gagal')}>
                    {removing === c.wa ? <Icon spin name="spinner" class="text-xs" /> : <Icon name="times" class="text-xs" />} Hapus
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <p class="text-[10px] text-slate-500 text-center">{cands.length} kandidat</p>
      </div>
    </div>
  );
}
