/**
 * TabMail.tsx — Admin mail inbox tab
 * Source: legacy/index.html page-admin → admin-mail
 * Filters: MENUNGGU, REVIEW, LULUS, GAGAL, SEMUA
 */
import { useEffect, useState } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import {
  mailFilterStatus, mailSearchText, mailList,
  setMailFilterStatus, setMailSearchText, fetchMailFromAPI,
} from '../../store/adminStore';
import { t, langStore } from '../../store/i18n';
import { showToast } from '../Toast';
import Icon from '../ui/Icon';
import api from '../../lib/apiClient';

const STATUSES = ['MENUNGGU', 'REVIEW', 'LULUS', 'GAGAL', 'SEMUA'] as const;

const STATUS_COLORS: Record<string, string> = {
  MENUNGGU: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
  REVIEW: 'bg-sky-500/20 text-sky-400 border-sky-500/40',
  LULUS: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
  GAGAL: 'bg-red-500/20 text-red-400 border-red-500/40',
};

export default function TabMail() {
  const _lang = useStore(langStore);
  const filterStatus = useStore(mailFilterStatus);
  const searchText = useStore(mailSearchText);
  const mail = useStore(mailList);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => { fetchMailFromAPI(); }, []);

  const toggleAll = () => {
    setSelected((prev) =>
      prev.size === filtered.length && filtered.length > 0
        ? new Set()
        : new Set(filtered.map((m) => String(m.id ?? m.wa ?? m.nama ?? '')))
    );
  };

  const toggleOne = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const act = async (action: string, id: unknown, okMsg: string) => {
    try {
      const d: any = await api.secure(action, [id]);
      if (d && d.success) {
        showToast(okMsg, 'success');
        fetchMailFromAPI();
      } else {
        showToast(String(d?.error || d?.message || 'Gagal'), 'error');
      }
    } catch (e) {
      showToast('Error: ' + (e instanceof Error ? e.message : String(e)), 'error');
    }
  };

  /**
   * Hapus massal lamaran terpilih (#15).
   *
   * Baris dikirim sebagai **index pada daftar `filtered`**, karena backend
   * (`deleteForm`) memang bekerja dengan rowIndex. Backend menyelesaikan semua
   * index → id lebih dulu, jadi mengirim daftar ini aman — pergeseran index
   * ditangani di sana, bukan di sini.
   *
   * Konfirmasi menyebut jumlah + menegaskan data kandidat TIDAK ikut terhapus,
   * persis teks legacy (`hapusFormMailTerpilih`).
   */
  const deleteSelected = async () => {
    if (selected.size === 0) {
      showToast(t('ui.select_mail_first'), 'error');
      return;
    }
    const idxs: number[] = [];
    filtered.forEach((m, i) => {
      if (selected.has(String(m.id ?? m.wa ?? m.nama ?? ''))) idxs.push(i);
    });
    if (idxs.length === 0) {
      showToast(t('ui.select_mail_first'), 'error');
      return;
    }
    if (!window.confirm(t('ui.confirm_delete_mail_selected').replace('{n}', String(idxs.length)))) return;
    try {
      const d: any = await api.secure('hapusFormTerpilih', [idxs]);
      if (d && d.success) {
        showToast(t('ui.toast_mail_deleted_n').replace('{n}', String(d.deleted ?? idxs.length)), 'success');
        setSelected(new Set());
        await fetchMailFromAPI();
      } else {
        showToast(String(d?.error || t('ui.toast_error_prefix')), 'error');
        await fetchMailFromAPI();
      }
    } catch (e) {
      showToast(t('ui.toast_error_prefix') + (e instanceof Error ? e.message : String(e)), 'error');
    }
  };

  const filtered = mail.filter((m) => {
    const matchStatus = filterStatus === 'SEMUA' || (m.status || '').toUpperCase() === filterStatus;
    const matchSearch = !searchText ||
      (m.nama || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (m.wa || '').includes(searchText) ||
      (m.idLoker || '').toLowerCase().includes(searchText.toLowerCase());
    return matchStatus && matchSearch;
  });

  // Status counts
  const counts = { MENUNGGU: 0, REVIEW: 0, LULUS: 0, GAGAL: 0 };
  mail.forEach(m => {
    const s = (m.status || '').toUpperCase();
    if (s in counts) counts[s as keyof typeof counts]++;
  });

  return (
    <div class="bg-slate-900 rounded-xl border border-sky-900/50 p-4 shadow-xl u-scroll-x">
      {/* Header */}
      <div class="flex flex-wrap justify-between items-center gap-3 border-b border-sky-900/50 pb-4 mb-4">
        <h2 class="text-sky-400 font-bold text-lg"><Icon name="envelope" class="mr-2" /> {t('admin.mail_inbox')}</h2>
        <div class="flex flex-wrap items-center gap-2">
          <input type="text" value={searchText}
            onInput={(e) => setMailSearchText((e.target as HTMLInputElement).value)}
            placeholder={t("admin.search_mail")}
            class="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:border-sky-500 outline-none w-52" />

          {/* Status filter buttons */}
          <div class="flex bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
            {STATUSES.map((s) => (
              <button key={s} onClick={() => setMailFilterStatus(s)}
                class={`px-3 py-2 text-xs font-bold transition ${
                  filterStatus === s
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700'
                }`}>
                {s === 'SEMUA' ? t('status.all') : s === 'MENUNGGU' ? t('status.waiting') : s === 'REVIEW' ? t('status.review') : s === 'LULUS' ? t('status.pass') : s === 'GAGAL' ? t('status.fail') : s}
              </button>
            ))}
          </div>

          <button onClick={() => fetchMailFromAPI()}
            class="px-5 py-2 bg-sky-600 text-white rounded-lg text-sm font-bold hover:bg-sky-500 shadow-lg transition">
            <Icon name="sync-alt" class="mr-1" /> {t('admin.refresh_mail')}
          </button>

          {/* Hapus terpilih — hanya muncul saat ada baris dipilih, supaya tidak
              jadi tombol mati yang membingungkan. */}
          {selected.size > 0 && (
            <button onClick={deleteSelected}
              class="px-5 py-2 bg-rose-600 text-white rounded-lg text-sm font-bold hover:bg-rose-500 shadow-lg transition">
              <Icon name="trash" class="mr-1" /> {t('ui.delete_selected_mail')} ({selected.size})
            </button>
          )}
        </div>
      </div>

      {/* Status counts */}
      <div class="flex items-center gap-2 mb-3">
        <span class="text-xs font-bold text-slate-300 uppercase tracking-wider">{t('table.status')}:</span>
        <span class="text-xs font-bold text-slate-300">
          {t('status.waiting')}: {counts.MENUNGGU} | {t('status.review')}: {counts.REVIEW} | {t('status.pass')}: {counts.LULUS} | {t('status.fail')}: {counts.GAGAL} | Total: {mail.length}
        </span>
      </div>

      {/* Table */}
      <div class="u-scroll-x rounded-xl border border-slate-800">
        <table class="w-full min-w-[900px] text-sm text-left whitespace-nowrap">
          <thead class="bg-slate-800 text-slate-300 text-sm uppercase border-b border-slate-700 tracking-wider">
            <tr>
              <th scope="col" class="p-4 text-center">
                <input type="checkbox" class="w-5 h-5 accent-rose-500 cursor-pointer"
                  checked={selected.size === filtered.length && filtered.length > 0}
                  onChange={toggleAll} />
              </th>
              <th scope="col" class="p-4">{t('table.upload_date')}</th>
              <th scope="col" class="p-4">{t('table.job_code')}</th>
              <th scope="col" class="p-4">{t('admin.kategori_bidang')}</th>
              <th scope="col" class="p-4">{t('table.full_name')}</th>
              <th scope="col" class="p-4">{t('ui.wa')}</th>
              <th scope="col" class="p-4 text-center">{t('table.status')}</th>
              <th scope="col" class="p-4 text-center">{t('table.doc_folder')}</th>
              <th scope="col" class="p-4 text-center">{t('table.action_review')}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-800">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} class="p-6 text-center text-slate-500">{t('admin.no_mail_found')}</td>
              </tr>
            ) : filtered.map((m, i) => (
              <tr key={m.id || i} class="hover:bg-white/5 transition-colors">
                <td class="p-4 text-center">
                  <input type="checkbox" class="w-4 h-4 accent-rose-500 cursor-pointer"
                    checked={selected.has(String(m.id ?? m.wa ?? m.nama ?? ''))}
                    onChange={() => toggleOne(String(m.id ?? m.wa ?? m.nama ?? ''))} />
                </td>
                <td class="p-4 text-xs text-slate-400">{m.timestamp || '-'}</td>
                <td class="p-4"><span class="font-mono text-purple-300 text-xs">{m.idLoker || '-'}</span></td>
                <td class="p-4 text-xs text-slate-400">{m.kategori || '-'}</td>
                <td class="p-4 font-bold text-white text-sm">{m.nama || '-'}</td>
                <td class="p-4 font-mono text-sky-300 text-xs">{m.wa || '-'}</td>
                <td class="p-4 text-center">
                  <span class={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${STATUS_COLORS[m.status] || 'bg-slate-500/20 text-slate-400 border-slate-500/40'}`}>
                    {m.status || '-'}
                  </span>
                </td>
                <td class="p-4 text-center">
                  <button disabled class="px-2 py-1 bg-slate-700/40 text-slate-500 rounded text-[10px] font-bold shadow cursor-not-allowed" title="Segera hadir">
                    <Icon name="folder-open" class="mr-1" /> {t('button.view')}
                  </button>
                </td>
                <td class="p-4 text-center">
                  <div class="flex flex-wrap justify-center gap-1">
                    <button onClick={() => act('approveForm', m.id ?? m.wa, 'Lamaran LULUS')} class="px-2 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[10px] font-bold shadow transition">
                      <Icon name="check" class="mr-1" /> {t('button.pass')}
                    </button>
                    <button onClick={() => act('reviewForm', m.id ?? m.wa, 'Status REVIEW')} class="px-2 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded text-[10px] font-bold shadow transition">
                      <Icon name="eye" class="mr-1" /> {t('button.review')}
                    </button>
                    <button onClick={() => { if (window.confirm(t('admin.confirm_reject_application'))) act('rejectForm', m.id ?? m.wa, 'Lamaran GAGAL'); }} class="px-2 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded text-[10px] font-bold shadow transition">
                      <Icon name="times" class="mr-1" /> {t('button.reject')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
