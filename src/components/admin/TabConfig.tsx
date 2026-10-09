/**
 * TabConfig.tsx - Pengaturan Sistem tab
 * Source: legacy admin.html admin-config (lines 802-861)
 */
import { useState, useEffect } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import api from '../../lib/apiClient';
import { showToast } from '../Toast';
import { t, langStore } from '../../store/i18n';

import type { ConfigGroup } from '../../types/api';
import Icon from '../ui/Icon';
import { Bar, Status } from '../ui/Skeleton';
import { normalizeMasterData } from '../../lib/cv-template-factory/data';
import { analyzeFromExample, detectRiwayatBlock } from '../../lib/cv-template-factory/loaders/tEMPLATE-loader';
import { encodeTemplateRecord, decodeTemplateRecord, type CvTemplateRecord } from '../../lib/cv-template-factory/templates';
import { uploadBerkasToStorage } from '../../lib/uploadBerkas';

/** Baris dari `getTemplateCvList` — `record` masih JSON mentah. */
type TemplateRow = { rowId: string; record: string; nama: string; aktif: boolean };

const RIWAYAT_TIPE = ['pendidikan', 'pekerjaan', 'keluarga'] as const;
/** Field kunci tiap tabel riwayat — dipakai `detectRiwayatBlock`. */
const RIWAYAT_KEY: Record<(typeof RIWAYAT_TIPE)[number], string> = {
  pendidikan: 'tingkat',
  pekerjaan: 'perusahaan',
  keluarga: 'nama',
};

export default function TabConfig() {
  const _lang = useStore(langStore);
  const [configs, setConfigs] = useState<ConfigGroup[]>([
    { id: 'tsk_list', label: 'TSK / Pengurus', options: ['TSK-001', 'TSK-002', 'TSK-003'] },
    { id: 'tahapan_db', label: 'Tahapan Internal DB', options: ['Persiapan', 'Dokumen', 'MCU', 'Wawancara', 'Keberangkatan'] },
    { id: 'bidang_kerja', label: 'Bidang Pekerjaan', options: ['Manufaktur', 'Pertanian', 'Perikanan', 'Konstruksi', 'Perawatan Lansia', 'Logistik', 'F&B', 'Perhotelan'] },
    { id: 'lokasi_penempatan', label: 'Lokasi Penempatan', options: ['Tokyo', 'Osaka', 'Nagoya', 'Fukuoka', 'Sapporo', 'Sendai', 'Yokohama'] },
    { id: 'pendidikan', label: 'Pendidikan', options: ['SD', 'SMP', 'SMA/SMK', 'D3', 'S1', 'S2'] },
    { id: 'status_lamaran', label: 'Status Lamaran', options: ['Baru', 'Review', 'Diterima', 'Ditolak', 'On Hold'] },
    { id: 'tahapan_progres', label: 'Tahapan Progres', options: ['Pendaftaran', 'Seleksi', 'Dokumen', 'MCU', 'Wawancara', 'Keberangkatan'] },
    { id: 'gender', label: 'Gender', options: ['Laki-laki', 'Perempuan'] },
    { id: 'jenjang_pendidikan', label: 'Jenjang Pendidikan', options: ['SD', 'SMP', 'SMA/SMK', 'D3', 'S1', 'S2'] },
  ]);
  const [loading, setLoading] = useState(true);
  const [pengumuman, setPengumuman] = useState('');
  const [editingConfig, setEditingConfig] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  // ── Template CV (2026-10-10) ──────────────────────────────────────────────
  // Admin mengisi template xlsx dengan data SATU kandidat nyata lalu meng-upload
  // sekali; peta sel→field disimpulkan dari contoh itu (`analyzeFromExample`).
  // Semua dihitung di BROWSER — server hanya menyimpan record di `sys_config`.
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [tplNama, setTplNama] = useState('');
  const [tplContohWa, setTplContohWa] = useState('');
  const [tplFile, setTplFile] = useState<File | null>(null);
  const [tplBusy, setTplBusy] = useState(false);
  const [tplInfo, setTplInfo] = useState('');
  const [tplFieldMap, setTplFieldMap] = useState<Record<string, string>>({});
  const [tplAmbiguous, setTplAmbiguous] = useState<Record<string, string[]>>({});
  const [tplPilihan, setTplPilihan] = useState<Record<string, string>>({});
  const [tplRiwayat, setTplRiwayat] = useState<CvTemplateRecord['riwayat']>({});
  const [tplBelum, setTplBelum] = useState<string[]>([]);

  async function loadTemplates() {
    try {
      const d = (await api.secure('getTemplateCvList', [])) as { success?: boolean; templates?: TemplateRow[] };
      if (d?.success) setTemplates(d.templates || []);
    } catch {
      // Daftar template bukan hal yang memblokir tab ini — jangan gagalkan load().
    }
  }

  async function handleAnalisaTemplate() {
    const wa = tplContohWa.replace(/\D/g, '');
    if (!tplFile) { showToast(t('admin.tpl_err_file'), 'error'); return; }
    if (!wa) { showToast(t('admin.tpl_err_wa'), 'error'); return; }
    setTplBusy(true);
    setTplInfo('');
    try {
      // Data kandidat contoh: tanpa ini tidak ada nilai yang bisa dicocokkan.
      const m = (await api.secure('getDrafCvMaster', [wa], {
        onSessionInvalid: 'throw',
        silent: true,
      })) as Record<string, unknown> | null;
      if (!m?.error) throw new Error(String(m?.error || 'Data master kandidat contoh tidak ditemukan.'));
      const data = normalizeMasterData(m);
      const XLSX = await import('xlsx');
      const wb = XLSX.read(new Uint8Array(await tplFile.arrayBuffer()), { type: 'array' });

      const { fieldMap, ambiguous, unmatched } = await analyzeFromExample(wb, data);
      const riwayat: CvTemplateRecord['riwayat'] = {};
      for (const tipe of RIWAYAT_TIPE) {
        const blk = await detectRiwayatBlock(
          wb,
          (data[tipe] || []) as Array<Record<string, unknown>>,
          RIWAYAT_KEY[tipe],
        );
        if (blk) riwayat[tipe] = blk;
      }
      setTplFieldMap(fieldMap);
      setTplAmbiguous(ambiguous);
      setTplPilihan({});
      setTplRiwayat(riwayat);
      setTplBelum(unmatched);
      setTplInfo(
        `${Object.keys(fieldMap).length} sel terpetakan · ${Object.keys(ambiguous).length} perlu Anda pilih · ` +
          `${Object.keys(riwayat).length} tabel riwayat · ${unmatched.length} field belum tertampung`,
      );
    } catch (e: unknown) {
      showToast(t('alert.network') + (e instanceof Error ? e.message : String(e)), 'error');
    } finally {
      setTplBusy(false);
    }
  }

  async function handleSimpanTemplate() {
    const nama = tplNama.trim();
    if (!nama) { showToast(t('admin.tpl_err_name'), 'error'); return; }
    if (!tplFile) { showToast(t('admin.tpl_err_nofile'), 'error'); return; }
    // Sel ambiguous yang BELUM dipilih tidak diikutkan: kalau ikut, satu nilai
    // bisa ditulis ke sel yang salah. Sisanya tetap dipakai.
    const fieldMap = { ...tplFieldMap };
    for (const cell of Object.keys(tplAmbiguous)) {
      if (tplPilihan[cell]) fieldMap[cell] = tplPilihan[cell];
      else delete fieldMap[cell];
    }
    setTplBusy(true);
    try {
      const id = `tpl-${nama.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
      const fileUrl = await uploadBerkasToStorage(tplFile, { key: id, folder: 'cv-templates' });
      const record: CvTemplateRecord = {
        id,
        nama,
        tipe: 'xlsx',
        fileUrl,
        fieldMap,
        contohWa: tplContohWa.replace(/\D/g, ''),
        aktif: true,
        updatedAt: new Date().toISOString(),
      };
      if (Object.keys(tplAmbiguous).length) record.ambiguous = tplAmbiguous;
      if (Object.keys(tplRiwayat || {}).length) record.riwayat = tplRiwayat;
      const d = (await api.secure('simpanTemplateCv', [{ record: encodeTemplateRecord(record) }])) as {
        success?: boolean;
        error?: string;
      };
      if (!d?.success) throw new Error(String(d?.error || 'Gagal menyimpan template.'));
      showToast(t('admin.tpl_toast_saved'), 'success');
      setTplFile(null);
      setTplInfo('');
      setTplFieldMap({});
      setTplAmbiguous({});
      setTplRiwayat({});
      setTplBelum([]);
      await loadTemplates();
    } catch (e: unknown) {
      showToast(t('alert.network') + (e instanceof Error ? e.message : String(e)), 'error');
    } finally {
      setTplBusy(false);
    }
  }

  async function handleHapusTemplate(rowId: string) {
    if (!window.confirm(t('admin.tpl_del_confirm'))) return;
    try {
      const d = (await api.secure('hapusTemplateCv', [{ rowId }])) as { success?: boolean; error?: string };
      if (!d?.success) throw new Error(String(d?.error || 'Gagal menghapus template.'));
      showToast(t('admin.tpl_toast_deleted'), 'success');
      await loadTemplates();
    } catch (e: unknown) {
      showToast(t('alert.network') + (e instanceof Error ? e.message : String(e)), 'error');
    }
  }

  async function load() {
    try {
      const d: any = await api.secure('getAppData', ['admin']);
      if (d && d.success) { setConfigs(d.sysConfig?.length ? d.sysConfig : configs); if (d.pengumuman) setPengumuman(d.pengumuman); }
    } catch (e) { console.warn('[TabConfig] API unavailable, using defaults', e); } finally { setLoading(false); }
    // Daftar template CV dimuat lewat `load()` supaya efek mount tetap punya
    // SATU dependensi (`load`) — dua panggilan di dalam efek menambah satu
    // diagnostik `useExhaustiveDependencies` di berkas yang sudah punya.
    await loadTemplates();
  }

  useEffect(() => { load(); }, []);

  async function handleSaveConfig(id: string) {
    const options = editValue.split('\n').map(s => s.trim()).filter(Boolean);
    try {
      const d: any = await api.secure('updateSysConfig', [{ id, options }]);
      if (d && d.success) { setEditingConfig(null); showToast(t('ui.toast_config_saved'), 'success'); await load(); } else showToast(t('ui.toast_error_prefix') + ((d && d.error) || ''), 'error');
    } catch (e: unknown) { showToast(t('alert.network') + (e instanceof Error ? e.message : String(e)), 'error'); }
  }

  async function handleSavePengumuman() {
    try {
      const d: any = await api.secure('updateSysConfig', [{ text: pengumuman }]);
      if (d && d.success) showToast(t('ui.toast_announcement_saved'), 'success'); else showToast(t('ui.toast_error_prefix') + ((d && d.error) || ''), 'error');
    } catch (e: unknown) { showToast(t('alert.network') + (e instanceof Error ? e.message : String(e)), 'error'); }
  }

  // Kerangka, bukan spinner: bentuk tab ini sudah diketahui sebelum datanya tiba
  // (judul + deskripsi + baris pengaturan). Lihat `../ui/Skeleton.tsx` untuk
  // alasan palet dan kontrak a11y-nya.
  if (loading) return (
    <Status>
      <Bar class="h-6 w-56 mb-6" />
      <Bar class="h-4 w-2/3 mb-6" />
      <div class="space-y-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} class="space-y-2">
            <Bar class="h-4 w-32" />
            <Bar class="h-11 w-full rounded-control" />
          </div>
        ))}
      </div>
    </Status>
  );

  return (<div>
    <h2 class="text-white font-bold mb-6 border-b border-slate-700 pb-3 text-lg"><Icon name="cogs" class="mr-2 text-slate-300" /> {t('admin.tab_config_title')}</h2>
    <p class="text-sm text-slate-300 mb-6">{t('admin.sys_config_desc')}</p>

    <div class="bg-black/40 border border-slate-600/40 p-5 rounded-xl mb-6">
      <h3 class="text-sm font-bold text-slate-300 mb-2 uppercase tracking-wider"><Icon name="database" class="mr-1" /> {t('admin.db_migration_auto')}</h3>
      <p class="text-xs text-slate-300 mb-3">{t("admin.db_migrate_cli_only")}</p>
      <div class="bg-black/60 border border-slate-600/40 rounded-lg p-3">
        <p class="text-xs font-bold text-slate-400 mb-1">{t("admin.run_from_terminal")}</p>
        <pre class="text-xs text-emerald-300 whitespace-pre-wrap font-mono">npm run migrate:status
npm run migrate:up</pre>
      </div>
    </div>

    <div class="u-grid-auto u-grid-auto--panels gap-6 mb-6">
      {configs.map(c => (
        <div key={c.id} class="bg-black/40 border border-slate-700 p-4 rounded-xl">
          <h4 class="text-sm font-bold text-slate-300 mb-2">{c.label}</h4>
          {editingConfig === c.id ? (
            <div>
              <textarea value={editValue} onInput={(e) => setEditValue((e.target as HTMLTextAreaElement).value)} rows={6} class="w-full p-2.5 rounded-lg bg-black/60 border border-slate-600 text-white text-xs outline-none focus:border-violet-500 transition font-mono"></textarea>
              <div class="flex gap-2 mt-2">
                <button onClick={() => handleSaveConfig(c.id)} class="min-h-11 flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition">{t('button.save')}</button>
                <button onClick={() => setEditingConfig(null)} class="min-h-11 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold rounded-lg transition">{t('button.cancel')}</button>
              </div>
            </div>
          ) : (
            <div>
              <div class="text-xs text-slate-500 mb-2">{c.options.length} {t('admin.options_suffix')}</div>
              <div class="flex flex-wrap gap-1 mb-2">{c.options.slice(0, 5).map(o => <span key={o} class="px-2 py-0.5 bg-slate-800 border border-slate-700 rounded text-[11px] text-slate-400">{o}</span>)}{c.options.length > 5 && <span class="text-[11px] text-slate-500">+{c.options.length - 5} {t('admin.more_suffix')}</span>}</div>
              <button onClick={() => { setEditingConfig(c.id); setEditValue(c.options.join('\n')); }} class="min-h-11 w-full py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-lg transition border border-slate-700"><Icon name="edit" class="mr-1" /> {t('button.edit')}</button>
            </div>
          )}
        </div>
      ))}
    </div>

    <div class="bg-black/40 border border-rose-500/50 p-5 rounded-xl flex flex-col">
      <h3 class="text-sm font-bold text-rose-400 mb-2 uppercase tracking-wider"><Icon name="bullhorn" class="mr-1" /> {t('admin.marquee_announcement')}</h3>
      <p class="text-xs text-slate-300 mb-3">{t("admin.marquee_hint")}</p>
      <div class="flex gap-2">
        <input type="text" value={pengumuman} onInput={(e) => setPengumuman((e.target as HTMLInputElement).value)} placeholder={t("admin.announce_ph")} class="flex-1 bg-slate-800 border border-slate-600 rounded-lg text-sm px-4 py-2.5 text-white outline-none focus:border-rose-500" />
        <button onClick={handleSavePengumuman} class="min-w-11 min-h-11 bg-rose-600 hover:bg-rose-500 text-white px-6 py-2.5 rounded-lg text-sm font-bold transition"><Icon name="save" class="mr-1" /> {t('admin.save_and_publish')}</button>
      </div>
    </div>

    <div class="bg-black/40 border border-sky-700/40 p-5 rounded-xl">
      <h3 class="text-sm font-bold text-sky-300 mb-2 uppercase tracking-wider"><Icon name="file-alt" class="mr-1" /> {t('admin.tpl_title')}</h3>
      <p class="text-xs text-slate-300 mb-3">{t('admin.tpl_hint')}</p>
      <div class="flex flex-wrap gap-2 mb-3">
        <input type="text" value={tplNama} onInput={(e) => setTplNama((e.target as HTMLInputElement).value)} placeholder={t('admin.tpl_name_ph')} class="min-h-11 flex-1 min-w-[200px] bg-slate-800 border border-slate-600 rounded-lg text-sm px-3 text-white outline-none focus:border-sky-500" />
        <input type="text" value={tplContohWa} onInput={(e) => setTplContohWa((e.target as HTMLInputElement).value)} placeholder={t('admin.tpl_wa_ph')} class="min-h-11 flex-1 min-w-[200px] bg-slate-800 border border-slate-600 rounded-lg text-sm px-3 text-white outline-none focus:border-sky-500" />
        <input type="file" accept=".xlsx" onChange={(e) => setTplFile((e.target as HTMLInputElement).files?.[0] || null)} aria-label={t('admin.tpl_file_aria')} class="min-h-11 flex-1 min-w-[220px] text-xs text-slate-300 file:mr-2 file:min-h-11 file:px-3 file:bg-slate-700 file:text-white file:border-0 file:rounded-lg" />
        <button type="button" onClick={handleAnalisaTemplate} disabled={tplBusy} class="min-h-11 px-4 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition"><Icon name="eye" class="mr-1" /> {t('admin.tpl_analyze')}</button>
        <button type="button" onClick={handleSimpanTemplate} disabled={tplBusy} class="min-h-11 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition"><Icon name="save" class="mr-1" /> {t('admin.tpl_save')}</button>
      </div>

      {tplInfo && <p class="text-xs text-slate-400 mb-2">{tplInfo}</p>}

      {Object.keys(tplAmbiguous).length > 0 && (
        <div class="bg-black/60 border border-amber-600/40 rounded-lg p-3 mb-3">
          <p class="text-xs font-bold text-amber-400 mb-2">{t('admin.tpl_ambiguous_hint')}</p>
          <div class="space-y-2">
            {Object.entries(tplAmbiguous).map(([cell, paths]) => (
              <div key={cell} class="flex items-center gap-2">
                <span class="text-xs font-mono text-slate-400 w-16">{cell}</span>
                <select value={tplPilihan[cell] || ''} onChange={(e) => setTplPilihan((p) => ({ ...p, [cell]: (e.target as HTMLSelectElement).value }))} class="min-h-11 flex-1 bg-slate-800 border border-slate-600 rounded-lg text-xs px-2 text-white outline-none focus:border-amber-500">
                  <option value="">{t('admin.tpl_empty_cell')}</option>
                  {paths.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {tplBelum.length > 0 && (
        <p class="text-xs text-slate-500 mb-3">{t('admin.tpl_unmatched')} {tplBelum.slice(0, 12).join(', ')}{tplBelum.length > 12 ? ' …' : ''}</p>
      )}

      <h4 class="text-xs font-bold text-slate-300 mb-2 uppercase tracking-wider">{t('admin.tpl_saved_list')} ({templates.length})</h4>
      {templates.length === 0 ? (
        <p class="text-xs text-slate-500">{t('admin.tpl_none')}</p>
      ) : (
        <ul class="space-y-2">
          {templates.map((tpl) => {
            const rec = decodeTemplateRecord(tpl.record);
            return (
              <li key={tpl.rowId} class="flex items-center gap-2 bg-black/60 border border-slate-700 rounded-lg px-3 py-2">
                <Icon name="file-alt" class="text-sky-400" />
                <span class="text-xs text-white font-bold flex-1">{tpl.nama || tpl.rowId}</span>
                <span class="text-[11px] text-slate-500">
                  {rec ? `${Object.keys(rec.fieldMap).length} ${t('admin.tpl_cells')}` : t('admin.tpl_broken')}
                  {rec?.riwayat ? ` · ${Object.keys(rec.riwayat).length} ${t('admin.tpl_riwayat')}` : ''}
                </span>
                <button type="button" onClick={() => handleHapusTemplate(tpl.rowId)} class="min-w-11 min-h-11 inline-flex items-center justify-center text-rose-400 hover:text-rose-300" aria-label={`${t('admin.tpl_del_aria')} ${tpl.nama || tpl.rowId}`}><Icon name="trash" /></button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  </div>);
}
