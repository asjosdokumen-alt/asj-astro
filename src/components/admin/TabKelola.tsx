/**
 * TabKelola.tsx — Admin loker management tab
 * Source: legacy/index.html page-admin → admin-kelola
 * Integrated: AdminJobEditModal, AdminShareModal
 */
import { useState, useEffect } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import { langStore, t } from '../../store/i18n';
import AdminJobEditModal, { type EditableJob } from './AdminJobEditModal';
import AdminShareModal from './AdminShareModal';
import Icon from '../ui/Icon';
import { LoadFailed, Status, TableRows } from '../ui/Skeleton';
import { useOverlayPresence } from '../ui/useOverlayPresence';
import api from '../../lib/apiClient';
import { adminDataPeek, loadAdminData, invalidateAdminData } from '../../store/adminData';
import {
  jobStatusBadgeClass,
  jobStatusKey,
  JOB_STATUS_LABEL_KEY,
  JOB_STATUS_WRITE,
  type JobStatusKey,
} from '../../lib/jobStatus';

/**
 * Berapa baris yang dirender sekaligus (permintaan pemilik 2026-10-22:
 * *"lowongan publik kok gak di 10 baris saja? … bisa saja pakai buka lebih
 * banyak"*). Daftar loker admin memang jarang lebih dari beberapa puluh, tapi
 * merender semuanya sekaligus membuat tabel panjang dan setiap kunjungan tab
 * membayar seluruh daftar.
 */
const LIMIT_INITIAL = 10;

// A15: share config needs dokumenShare/tsk; getAppData('admin') is admin-guarded
// so the session token must be attached (public fallback has no dokumenShare).
type Loker = {
  code: string; pekerjaan: string; status: string; kategori: string;
  gender: string; lokasi: string; kuota: string; keterangan: string;
  syarat?: string; templateCv?: string; pamflet?: string;
  updated_at?: string;
  tsk?: string;
  dokumenShare?: string;
};

/**
 * Warna pill TIDAK lagi ditentukan di sini — lihat `src/lib/jobStatus.ts`.
 * Dulu ada peta lokal yang mencocokkan nilai MENTAH secara persis, sehingga
 * `❌ CLOSE` (151 baris warisan) tidak cocok dengan kunci `CLOSE` dan tampil
 * sebagai teks mentah ber-emoji di samping baris yang `CLOSE` polos.
 */
type StatusFilter = 'ALL' | JobStatusKey;

export default function TabKelola() {
  const _lang = useStore(langStore);
  /* Render awal dari cache: kalau admin baru saja membuka tab lain, daftar ini
     sudah ada di memori dan tab terbuka TANPA skeleton. */
  const cached0 = adminDataPeek<{ jobs?: Loker[] }>();
  const [loker, setLoker] = useState<Loker[]>(cached0?.jobs ?? []);
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(LIMIT_INITIAL);
  const [loading, setLoading] = useState(!cached0);
  /** Permintaan GAGAL — beda dari daftar yang memang kosong. */
  const [failed, setFailed] = useState(false);
  /* Filter cepat: pemilik minta "cepat lihat lowongan yg open dan close". */
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  /** Kode yang sedang disimpan — mencegah klik ganda mengirim dua tulisan. */
  const [busyCode, setBusyCode] = useState<string | null>(null);
  /** Pesan kegagalan aksi; dulu gagal-ubah-status tidak bersuara sama sekali. */
  const [notice, setNotice] = useState<string | null>(null);
  const [editJob, setEditJob] = useState<Loker | null>(null);
  const [shareJob, setShareJob] = useState<Loker | null>(null);
  /* Exit window (2026-09-28) — see `useOverlayPresence`. */
  const editJobP = useOverlayPresence(editJob);
  const shareJobP = useOverlayPresence(shareJob);

  useEffect(() => { fetchLoker(); }, []);

  async function fetchLoker(force = false) {
    try {
      // §26 + `store/adminData`: SATU payload untuk enam tab admin. Tab ini
      // dulu memanggil `getAppData` sendiri setiap mount, jadi berpindah tab
      // = tarikan 107 KB lagi. Sekarang cache 5 menit dipakai bersama, dan
      // `force` hanya dipakai setelah aksi yang benar-benar mengubah data.
      //
      // `onSessionInvalid: 'throw'` dipertahankan (ada di `loadAdminData`):
      // sesi yang tidak bisa diverifikasi membuat daftar kosong, BUKAN logout
      // + redirect global. Perf bukan alasan untuk mengubah semantik sesi.
      const d = (await loadAdminData<{ success?: boolean; jobs?: Loker[] }>({ force })) || {};
      if (d.success) { setLoker(d.jobs || []); setFailed(false); }
    } catch (err) {
      // Dulu hanya `console.error`: daftarnya tetap kosong, dan layar
      // menampilkan "belum ada data" — admin tidak bisa membedakan "memang
      // tidak ada" dari "gagal memuat".
      console.error('[TabKelola]', err);
      setFailed(true);
    }
    finally { setLoading(false); }
  }

  const filtered = loker.filter(j => {
    if (statusFilter !== 'ALL' && jobStatusKey(j.status) !== statusFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (j.code || '').toLowerCase().includes(q) || (j.pekerjaan || '').toLowerCase().includes(q)
    );
  });

  /** Jumlah per status — dihitung dari SELURUH daftar, bukan hasil filter. */
  const counts = loker.reduce<Record<string, number>>((acc, j) => {
    const k = jobStatusKey(j.status);
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});

  /** Yang benar-benar dirender: 10 pertama, sisanya lewat "buka lebih banyak". */
  const visible = filtered.slice(0, limit);

  const toggleStatus = async (code: string, next: 'OPEN' | 'CLOSE') => {
    if (busyCode) return;
    setBusyCode(code);
    setNotice(null);
    try {
      const job = loker.find(j => j.code === code);
      const data = (await api.secure('ubahStatusJob', [code, JOB_STATUS_WRITE[next], job?.updated_at])) as {
        success?: boolean; error?: string;
      };
      if (data.success) {
        setLoker(prev => prev.map(j => j.code === code ? { ...j, status: JOB_STATUS_WRITE[next] } : j));
        // Status ikut di payload bersama — cache lama akan menampilkannya
        // sebagai OPEN/CLOSE yang salah di tab lain.
        invalidateAdminData();
      } else {
        // Dulu: `if (data.success) {...}` tanpa cabang lain — tombol tampak
        // tidak bereaksi, dan admin mengira kliknya tidak terdaftar.
        setNotice(data.error || 'Status gagal diubah.');
      }
    } catch (e) {
      console.error(e);
      setNotice('Status gagal diubah. Periksa koneksi lalu coba lagi.');
    } finally {
      setBusyCode(null);
    }
  };

  const deleteJob = async (code: string) => {
    if (!confirm('Yakin hapus loker ' + code + '?')) return;
    try {
      const data = (await api.secure('hapusJobData', [code])) as { success?: boolean; error?: string };
      if (data.success) {
        setLoker(prev => prev.filter(j => j.code !== code));
        invalidateAdminData();
      }
    } catch (e) { console.error(e); }
  };

  return (
    <div>
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-red-400 font-bold text-lg"><Icon name="globe" class="mr-2" /> {t('admin.tab_public_job')}</h2>
        <div class="relative w-72">
          <Icon name="search" class="absolute left-3 top-2.5 text-slate-300 text-sm" />
          <input type="text" value={search} onInput={e => { setSearch((e.target as HTMLInputElement).value); setLimit(LIMIT_INITIAL); }} placeholder={t('admin.search_placeholder')} class="min-h-11 w-full pl-9 p-2 rounded-lg bg-black/40 border border-slate-700 text-sm text-white outline-none focus:border-red-500 transition" />
        </div>
      </div>

      {/* Filter cepat + hitungan: pemilik ingin "cepat lihat lowongan yg open
          dan close" tanpa menggulir 10 baris. Angka diambil dari SELURUH daftar
          (bukan hasil filter), supaya terlihat berapa yang tutup di luar layar. */}
      <div class="flex flex-wrap items-center gap-2 mb-3">
        {(['ALL', 'OPEN', 'CLOSE'] as StatusFilter[]).map(f => {
          const active = statusFilter === f;
          const label = f === 'ALL' ? t('public.all') : t(JOB_STATUS_LABEL_KEY[f]);
          const n = f === 'ALL' ? loker.length : counts[f] || 0;
          return (
            <button
              key={f}
              type="button"
              onClick={() => { setStatusFilter(f); setLimit(LIMIT_INITIAL); }}
              aria-pressed={active}
              class={`min-h-11 px-4 rounded-full text-[11px] font-bold border transition ${active
                ? 'bg-red-600 text-white border-red-500'
                : 'bg-black/30 text-slate-300 border-slate-700 hover:border-slate-500'}`}
            >
              {label} <span class="opacity-70 tabular-nums">{n}</span>
            </button>
          );
        })}
      </div>

      {notice && (
        <p class="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300">
          {notice}
        </p>
      )}

      {loading ? (
        /* Kerangka tabel: 5 kolom, `min-w-[800px]`, sama dengan tabel aslinya. */
        <Status>
          <div class="u-scroll-x rounded-xl border border-slate-800">
            <table class="w-full min-w-[800px] text-sm text-left whitespace-nowrap">
              <tbody>
                <TableRows rows={6} widths={['h-4 w-16', 'h-4 w-3/4', 'h-4 w-24', 'h-4 w-20', 'h-4 w-24']} />
              </tbody>
            </table>
          </div>
        </Status>
      ) : (
        <div class="u-scroll-x rounded-xl border border-slate-800">
          <table class="w-full min-w-[800px] text-sm text-left whitespace-nowrap">
            <thead class="bg-slate-800 text-slate-300 text-[13px] font-semibold border-b border-slate-700">
              <tr>
                <th class="p-4">{t('table.code')}</th>
                <th class="p-4">{t('table.job')}</th>
                <th class="p-4 text-center">{t('table.status')}</th>
                <th class="p-4 text-center">{t('table.action')}</th>
                <th class="p-4 text-center">{t('table.delete')}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800">
              {filtered.length === 0 ? (
                failed
                  ? <tr><td colSpan={5} class="p-6"><LoadFailed onRetry={fetchLoker} /></td></tr>
                  : <tr><td colSpan={5} class="p-6 text-center text-slate-500">{t('ui.not_applied_general')}</td></tr>
              ) : visible.map(j => {
                const key = jobStatusKey(j.status);
                const busy = busyCode === j.code;
                return (
                <tr key={j.code} class="hover:bg-white/5 transition-colors">
                  <td class="p-4 font-mono text-red-300 font-bold">{j.code}</td>
                  <td class="p-4 font-bold text-white">{j.pekerjaan}</td>
                  <td class="p-4 text-center">
                    {/* Yang tampil = status KANONIK, bukan teks mentah DB. */}
                    <span
                      class={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${jobStatusBadgeClass(key)}`}
                      title={j.status || '(kosong)'}
                    >{t(JOB_STATUS_LABEL_KEY[key])}</span>
                  </td>
                  <td class="p-4 text-center">
                    <div class="flex flex-wrap justify-center gap-2">
                      <button type="button" onClick={() => toggleStatus(j.code, 'OPEN')} disabled={busy} class="min-h-11 inline-flex items-center px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-full text-[11px] text-white font-bold shadow transition">{t("status.open")}</button>
                      <button type="button" onClick={() => toggleStatus(j.code, 'CLOSE')} disabled={busy} class="min-h-11 px-3 py-1.5 bg-slate-600 hover:bg-slate-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-full text-[11px] text-white font-bold shadow transition">{t("status.close")}</button>
                      <button type="button" onClick={() => setEditJob(j)} class="min-h-11 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-full text-[11px] font-bold shadow transition"><Icon name="edit" /> Edit</button>
                      <button type="button" onClick={() => setShareJob(j)} class="min-h-11 px-3 py-1.5 bg-pink-600 hover:bg-pink-500 text-white rounded-full text-[11px] font-bold shadow transition"><Icon name="share-alt" /> Share</button>
                    </div>
                  </td>
                  <td class="p-4 text-center">
                    <button type="button" onClick={() => deleteJob(j.code)} aria-label={t('button.delete')} class="w-11 h-11 flex items-center justify-center bg-red-600 text-white rounded-full text-xs font-bold hover:scale-105 transition-transform mx-auto"><Icon name="trash" /></button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div class="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p class="text-xs text-slate-500">{filtered.length} {t('ui.jobs_suffix')}</p>
        {filtered.length > limit && (
          <button type="button" onClick={() => setLimit(prev => prev + LIMIT_INITIAL)}
            class="min-h-11 px-6 py-2.5 bg-slate-800 text-white rounded-full text-xs font-bold shadow-lg hover:bg-slate-700 transition">
            {t('button.more')} <Icon name="chevron-down" class="ml-2" />
          </button>
        )}
      </div>

      {editJobP.present && <AdminJobEditModal job={editJobP.held as EditableJob} onClose={() => setEditJob(null)} onSave={() => fetchLoker(true)} closing={editJobP.closing} />}
      {shareJobP.present && shareJobP.held && <AdminShareModal job={shareJobP.held} onClose={() => setShareJob(null)} onSave={() => fetchLoker(true)} closing={shareJobP.closing} />}
    </div>
  );
}
