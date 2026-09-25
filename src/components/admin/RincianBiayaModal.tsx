/**
 * RincianBiayaModal.tsx — Rincian Biaya & Tahapan builder (admin)
 * Port of legacy partials/modals-shared.html #modal-rincian-builder +
 * js/13_rincian_builder.ts (openRincianBuilder / rbSerialize /
 * rbSeedFromText / rbSavePreset / rbUnsavePreset).
 *
 * The builder composes the WA-format text stored in job row columns
 * total_biaya + rincian_biaya. The serialized format is parsed by the public
 * job detail popup (src/components/public/LokerDetailModal.tsx
 * parseRincianBiaya) and by this modal's own seed parser, so text is
 * round-trip stable (TOTAL BIAYA / TAHAPAN PEMBAYARAN numbered / INCLUDE /
 * EXCLUDE / BENEFIT / PERSYARATAN bullets / CATATAN).
 *
 * A12 root bugs this fixes:
 *   - Astro job add tab rendered "Buka Editor Rincian" as a DEAD button and
 *     never persisted rincian_biaya (TabTambah only sent totalBiaya).
 *   - The admin job EDIT modal had no total cost / rincian fields at all,
 *     while legacy edit form carries ef-total-biaya + ef-rincian-biaya.
 *   - Preset collection actions (getRincianPresets / saveRincianPreset /
 *     deleteRincianPreset) exist on the config surface but were never called
 *     from the UI.
 */
import { useEffect, useMemo, useState } from 'preact/hooks';
import { api } from '../../lib/apiClient';
import { showToast } from '../Toast';
import { t } from '../../store/i18n';
import Icon from '../ui/Icon';
import { useOverlay } from '../ui/useOverlay';

// ── Pure helpers (exported for tests) ───────────────────────────────────────

export const RB_SECS = ['include', 'exclude', 'benefit', 'persyaratan'] as const;
export type RincianSec = (typeof RB_SECS)[number];

export interface RincianRow {
  nama: string;
  nominal: string;
}

export interface RincianState {
  total: string;
  rows: RincianRow[];
  sel: Record<RincianSec, string[]>;
  catatan: string;
}

/** Preset DEFAULT (fallback) — dipakai kalau koleksi DB kosong/gagal dimuat. */
export const DEFAULT_PRESETS: Record<RincianSec, string[]> = {
  include: [
    'TIKET PESAWAT',
    'VISA (SUBSIDI 1JT)',
    'ASURANSI KESEHATAN',
    'TRAINING BAHASA JEPANG 3 BULAN',
    'SURAT-SURAT ADMINISTRASI',
  ],
  exclude: [
    'PASPOR',
    'MCU (MEDICAL CHECK UP)',
    'EKTLN',
    'AKOMODASI SEHARI-HARI',
    'MAKAN SEHARI-HARI',
  ],
  benefit: [
    'PENEMPATAN KAISHA/KLINIK',
    'GAJI POKOK 180.000 YEN UP',
    'BANTUAN GAJI: LEMBUR & KENIKMATAN LAINNYA',
    'SUBSIDI GAJI / KUOTA BIAYA KOKO',
    'KAIGO PASAL 2 JOMPO',
  ],
  persyaratan: [
    'MENGIRIM CV SESUAI FORMAT JOB TERKAIT',
    'MENGIRIM SERTIFIKAT JLPT/JFT & SSW ATAU SENMONKYU (1 FILE PDF)',
    'USIA 18-28 TAHUN',
    'PUNYA PENGALAMAN KERJA DI INDONESIA',
    'MENGIKUTI TRAINING BAHASA JEPANG (BELUM LULUS JFT/JLPT)',
  ],
};

export const DEFAULT_TAHAPAN_ROWS: RincianRow[] = [
  { nama: 'TTD KONTRAK', nominal: '' },
  { nama: 'COE (CERTIFICATE OF ELIGIBILITY) TERBIT', nominal: '' },
];

export const DEFAULT_CATATAN =
  'APABILA PERUSAHAAN (KAISHA) MEMBATALKAN PROSES KEBERANGKATAN, BIAYA YANG TELAH DIBAYARKAN AKAN DIKEMBALIKAN SESUAI KETENTUAN YANG BERLAKU.';

const EMPTY_SEL = (): Record<RincianSec, string[]> => ({
  include: [],
  exclude: [],
  benefit: [],
  persyaratan: [],
});

export function emptyRincianState(): RincianState {
  return { total: '', rows: [], sel: EMPTY_SEL(), catatan: '' };
}

/** Serialize builder state → the exact legacy text format (rbSerialize parity). */
export function rincianSerialize(st: RincianState): string {
  const out: string[] = [];
  const total = (st.total || '').trim();
  if (total) out.push('TOTAL BIAYA: ' + total);
  out.push('');
  const filledRows = st.rows.filter((r) => (r.nama || '').trim());
  const steps: string[] = [];
  filledRows.forEach((r, i) => {
    const n = (r.nama || '').trim();
    const nom = (r.nominal || '').trim();
    steps.push(i + 1 + '. ' + n + (nom ? ' : ' + nom : ''));
  });
  if (steps.length) {
    out.push('TAHAPAN PEMBAYARAN');
    steps.forEach((s) => out.push(s));
    out.push('');
  }
  for (const sec of RB_SECS) {
    const items = (st.sel[sec] || []).filter(Boolean);
    if (items.length) {
      out.push(sec.toUpperCase());
      items.forEach((x) => out.push('• ' + x));
      out.push('');
    }
  }
  const catatan = (st.catatan || '').trim();
  if (catatan) {
    out.push('CATATAN');
    catatan.split('\n').forEach((l) => out.push(l));
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Seed builder state from existing rincian text (rbSeedFromText parity).
 * Parses the same format LokerDetailModal.parseRincianBiaya understands.
 */
export function parseRincianState(text: string): RincianState {
  const st = emptyRincianState();
  if (!text) return st;
  let cur: string | null = null;
  const info: string[] = [];
  const catLines: string[] = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const mt = line.match(/^TOTAL\s*BIAYA\s*[:=]?\s*(.+)$/i);
    if (mt) {
      st.total = mt[1].trim();
      continue;
    }
    const mh = line.match(/^(TAHAPAN\s*PEMBAYARAN|INCLUDE|EXCLUDE|BENEFIT|PERSYARATAN|CATATAN)\b/i);
    if (mh) {
      let key = mh[1].toUpperCase().replace(/\s+/g, '_');
      if (key === 'TAHAPAN_PEMBAYARAN') key = 'TAHAPAN';
      cur = key;
      continue;
    }
    if (cur === 'TAHAPAN') {
      const ms = line.match(/^\s*\d+[.)]\s*(.+)$/);
      if (ms) {
        const body = ms[1].trim();
        const sep = body.search(/\s*[:=]\s*/);
        if (sep >= 0) {
          st.rows.push({
            nama: body.slice(0, sep).trim(),
            nominal: body.slice(sep).replace(/^\s*[:=]\s*/, '').trim(),
          });
        } else {
          st.rows.push({ nama: body, nominal: '' });
        }
        continue;
      }
      const plain = line.replace(/^[•▪\-*]\s*/, '').trim();
      if (plain) st.rows.push({ nama: plain, nominal: '' });
      continue;
    }
    if (cur === 'INCLUDE' || cur === 'EXCLUDE' || cur === 'BENEFIT' || cur === 'PERSYARATAN') {
      const item = line.replace(/^[•▪\-*]\s*/, '').trim();
      const secKey = cur.toLowerCase() as RincianSec;
      if (item) st.sel[secKey].push(item);
      continue;
    }
    if (cur === 'CATATAN') {
      catLines.push(line.replace(/^[•▪\-*]\s*/, ''));
      continue;
    }
    // INFO / baris bebas → gabungkan ke catatan (legacy round-trip).
    info.push(line.replace(/^[•▪\-*]\s*/, ''));
  }
  const merged = [...catLines, ...info].join('\n').trim();
  st.catatan = merged || '';
  return st;
}

/** Short summary shown under the trigger (rbSummaryHtml parity). */
export function rincianSummary(st: RincianState): string {
  const parts: string[] = [];
  const total = (st.total || '').trim();
  if (total) parts.push('💵 Total ' + total);
  const steps = st.rows.filter((r) => (r.nama || '').trim()).length;
  if (steps) parts.push(steps + ' tahapan');
  for (const sec of RB_SECS) {
    const n = (st.sel[sec] || []).filter(Boolean).length;
    if (!n) continue;
    if (sec === 'include') parts.push('Include ' + n);
    else if (sec === 'exclude') parts.push('Exclude ' + n);
    else if (sec === 'benefit') parts.push('Benefit ' + n);
    else parts.push('Syarat ' + n);
  }
  if ((st.catatan || '').trim()) parts.push('📝 Catatan');
  return parts.length ? '✅ ' + parts.join(' • ') : t('ui.summary_empty');
}

/** Thousand-dot formatting for nominal inputs ('6000000' → '6.000.000'). */
export function fmtNominal(raw: string): string {
  const num = String(raw || '').replace(/[^\d]/g, '');
  if (!num || num === '0') return '';
  return num.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// ── Collection (DB rincian_presets) ─────────────────────────────────────────

interface PresetItem {
  id?: string;
  item: string;
}

interface Props {
  open: boolean;
  initialTotal?: string;
  initialRincian?: string;
  onApply: (total: string, rincian: string) => void;
  onClose: () => void;
}

const SECTION_LABEL: Record<RincianSec, () => string> = {
  include: () => t('ui.include'),
  exclude: () => t('ui.exclude'),
  benefit: () => t('ui.benefit'),
  persyaratan: () => t('ui.requirements'),
};

// Icon sprite test (Icon.test.ts) requires icon names NOT to appear inside
// JSX expressions together with other string literals — keep them in a data
// map referenced by identifier only.
const SECTION_ICON: Record<RincianSec, string> = {
  include: 'check-circle',
  exclude: 'times-circle',
  benefit: 'star',
  persyaratan: 'clipboard-check',
};
const SECTION_ICON_CLS: Record<RincianSec, string> = {
  include: 'text-emerald-400',
  exclude: 'text-rose-400',
  benefit: 'text-amber-400',
  persyaratan: 'text-sky-400',
};

export default function RincianBiayaModal({ open, initialTotal = '', initialRincian = '', onApply, onClose }: Props) {
  // Builder state mirrors legacy DOM state.
  const [total, setTotal] = useState('');
  const [rows, setRows] = useState<RincianRow[]>([]);
  const [sel, setSel] = useState<Record<RincianSec, string[]>>(EMPTY_SEL());
  const [catatan, setCatatan] = useState('');
  // chips: DB collection ∪ custom/seed extras (per section)
  const [chips, setChips] = useState<Record<RincianSec, PresetItem[]>>({
    include: [],
    exclude: [],
    benefit: [],
    persyaratan: [],
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [customInput, setCustomInput] = useState<Record<RincianSec, string>>({
    include: '',
    exclude: '',
    benefit: '',
    persyaratan: '',
  });

  // Reset + seed whenever the modal opens (legacy openRincianBuilder).
  useEffect(() => {
    if (!open) return;
    const seeded = parseRincianState(initialRincian || '');
    setTotal((initialTotal || seeded.total || '').trim());
    setRows(
      seeded.rows.length
        ? seeded.rows
        : DEFAULT_TAHAPAN_ROWS.map((r) => ({ ...r })),
    );
    setSel(seeded.sel);
    setCatatan(seeded.catatan || DEFAULT_CATATAN);
    setChips({
      include: [],
      exclude: [],
      benefit: [],
      persyaratan: [],
    });
    setCustomInput({ include: '', exclude: '', benefit: '', persyaratan: '' });
    setSaving(false);
    setLoading(true);
    // Load the DB preset collection (fallback default presets on failure).
    api
      .secure('getRincianPresets', [])
      .then((res: Record<string, any>) => {
        const presets = res && res.success && res.presets ? res.presets : {};
        const next = {} as Record<RincianSec, PresetItem[]>;
        for (const sec of RB_SECS) {
          const list: PresetItem[] = Array.isArray(presets[sec]) ? presets[sec] : [];
          // Fallback ke preset default kalau koleksi kosong (parity legacy).
          const base =
            list && list.length ? list : DEFAULT_PRESETS[sec].map((item) => ({ item }));
          const seedItems = (seeded.sel[sec] || []).map((item) => ({ item }));
          const merged: PresetItem[] = [];
          const seen = new Set<string>();
          for (const it of [...base, ...seedItems]) {
            const key = String(it.item || '').trim().toUpperCase();
            if (!key || seen.has(key)) continue;
            seen.add(key);
            merged.push(it);
          }
          next[sec] = merged;
        }
        setChips(next);
      })
      .catch(() => {
        // Fallback default presets (legacy rbLoadPresetsFromDb cb(false)).
        const next = {} as Record<RincianSec, PresetItem[]>;
        for (const sec of RB_SECS) {
          const seedItems = (seeded.sel[sec] || []).map((item) => ({ item }));
          const merged: PresetItem[] = [];
          const seen = new Set<string>();
          for (const it of [...DEFAULT_PRESETS[sec].map((item) => ({ item })), ...seedItems]) {
            const key = String(it.item || '').trim().toUpperCase();
            if (!key || seen.has(key)) continue;
            seen.add(key);
            merged.push(it);
          }
          next[sec] = merged;
        }
        setChips(next);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const st: RincianState = useMemo(
    () => ({ total, rows, sel, catatan }),
    [total, rows, sel, catatan],
  );
  const preview = useMemo(() => rincianSerialize(st), [st]);

  const toggleChip = (sec: RincianSec, item: string) => {
    setSel((prev) => {
      const list = prev[sec] || [];
      const on = list.some((x) => x.trim().toUpperCase() === item.trim().toUpperCase());
      return {
        ...prev,
        [sec]: on
          ? list.filter((x) => x.trim().toUpperCase() !== item.trim().toUpperCase())
          : [...list, item],
      };
    });
  };

  const upsertChip = (sec: RincianSec, item: string, id?: string) => {
    setChips((prev) => {
      const list = prev[sec] || [];
      const key = item.trim().toUpperCase();
      if (list.some((c) => String(c.item).trim().toUpperCase() === key)) return prev;
      return { ...prev, [sec]: [...list, { item, id }] };
    });
  };

  const addCustom = (sec: RincianSec) => {
    const val = (customInput[sec] || '').trim().toUpperCase();
    if (!val) return;
    upsertChip(sec, val, undefined);
    toggleChip(sec, val);
    setCustomInput((prev) => ({ ...prev, [sec]: '' }));
  };

  const toggleFavorite = async (sec: RincianSec, chip: PresetItem) => {
    const key = String(chip.item || '').trim().toUpperCase();
    const existing = (chips[sec] || []).find(
      (c) => c.id && String(c.item).trim().toUpperCase() === key,
    );
    try {
      if (existing && existing.id) {
        const res = await api.secure('deleteRincianPreset', [{ id: existing.id }]);
        if (res && res.success === false) throw new Error(String(res.error || ''));
        // Hapus dari koleksi — chip tetap tampil (parity legacy bintang ☆).
        setChips((prev) => ({
          ...prev,
          [sec]: (prev[sec] || []).map((c) =>
            String(c.item).trim().toUpperCase() === key ? { item: c.item } : c,
          ),
        }));
      } else {
        const res = await api.secure('saveRincianPreset', [{ kategori: sec, item: chip.item }]);
        if (res && res.success === false) throw new Error(String(res.error || ''));
        const id = res && (res as Record<string, unknown>).id !== undefined
          ? String((res as Record<string, unknown>).id)
          : undefined;
        setChips((prev) => ({
          ...prev,
          [sec]: (prev[sec] || []).map((c) =>
            String(c.item).trim().toUpperCase() === key ? { item: c.item, id } : c,
          ),
        }));
        showToast(t('ui.toast_fav_added'), 'success');
      }
    } catch (e) {
      showToast(
        (e instanceof Error ? e.message : '') ||
          (existing && existing.id ? t('ui.toast_fav_remove_failed') : t('ui.toast_fav_save_failed')),
        'error',
      );
    }
  };

  const apply = () => {
    setSaving(true);
    onApply((total || '').trim(), rincianSerialize(st));
    setSaving(false);
    onClose();
  };

  const moveRow = (idx: number, delta: number) => {
    const target = idx + delta;
    if (target < 0 || target >= rows.length) return;
    setRows((prev) => {
      const next = prev.slice();
      const [row] = next.splice(idx, 1);
      next.splice(target, 0, row);
      return next;
    });
  };

  const removeRow = (idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const { containerRef, onBackdropClick } = useOverlay({ open, onClose });

  if (!open) return null;

  const inputCls =
    'w-full p-2.5 rounded-lg bg-black/60 border border-slate-700 text-white text-sm outline-none focus:border-emerald-500 transition';

  return (
    <div
      class="fixed inset-0 u-modal-shell bg-black/80 backdrop-blur-md z-[350] flex items-center justify-center p-3 md:p-5"
      ref={containerRef}
      onClick={onBackdropClick}
    >
      <div class="bg-slate-900 border border-emerald-700/40 rounded-[2rem] w-full max-w-3xl max-h-[92vh] u-scroll-area shadow-2xl p-6 md:p-8">
        <div class="flex justify-between items-start mb-1">
          <h3 class="text-xl font-black text-emerald-400">
            <Icon name="list-check" class="mr-2" /> {t('ui.rincian_biaya')}
          </h3>
          <button onClick={onClose} class="text-slate-400 hover:text-white transition" aria-label={t('ui.close')}>
            <Icon name="times" class="text-2xl" />
          </button>
        </div>
        <p class="text-xs text-slate-400 mb-2 leading-relaxed">{t('ui.rincian_builder_hint')}</p>
        <p class="text-[11px] text-slate-500 mb-5 leading-relaxed">{t('ui.star_hint')}</p>

        <div class="mb-5">
          <label for="rb-total" class="block text-xs font-bold text-emerald-400 mb-1 uppercase">
            <Icon name="wallet" class="mr-1" /> {t('ui.total_cost')}
          </label>
          <input
            id="rb-total"
            type="text"
            value={total}
            onInput={(e) => setTotal((e.target as HTMLInputElement).value)}
            placeholder={t('ui.total_cost_ph')}
            class={inputCls}
          />
        </div>

        <div class="mb-5">
          <div class="flex items-center justify-between mb-2">
            <div class="text-xs font-bold text-amber-400 uppercase tracking-widest">
              <Icon name="stairs" class="mr-1" /> {t('ui.payment_stage')}
            </div>
            <button
              type="button"
              onClick={() => setRows((prev) => [...prev, { nama: '', nominal: '' }])}
              class="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold transition"
            >
              <Icon name="plus" class="mr-1" /> {t('ui.add_stage')}
            </button>
          </div>
          <div class="space-y-1.5">
            {rows.map((r, i) => (
              <div key={i} class="flex gap-1.5 items-center">
                <input
                  type="text"
                  aria-label={`${t('ui.stage_name_label')} ${i + 1}`}
                  value={r.nama}
                  onInput={(e) =>
                    setRows((prev) => prev.map((x, xi) => (xi === i ? { ...x, nama: (e.target as HTMLInputElement).value } : x)))
                  }
                  placeholder={t('ui.stage_name_ph')}
                  class="flex-1 p-2 rounded-lg bg-black/60 border border-slate-700 text-white text-xs outline-none focus:border-amber-500 transition"
                />
                <input
                  type="text"
                  inputmode="numeric"
                  aria-label={`${t('ui.stage_amount_label')} ${i + 1}`}
                  value={r.nominal}
                  onInput={(e) => {
                    const v = fmtNominal((e.target as HTMLInputElement).value);
                    setRows((prev) =>
                      prev.map((x, xi) => (xi === i ? { ...x, nominal: v } : x)),
                    );
                  }}
                  onBlur={(e) => {
                    const v = fmtNominal((e.target as HTMLInputElement).value);
                    const suffix = v ? v + ' jt' : '';
                    (e.target as HTMLInputElement).value = suffix;
                    setRows((prev) =>
                      prev.map((x, xi) => (xi === i ? { ...x, nominal: suffix } : x)),
                    );
                  }}
                  placeholder="0"
                  class="w-28 p-2 rounded-lg bg-black/60 border border-slate-700 text-emerald-300 text-xs font-bold outline-none focus:border-amber-500 transition text-right"
                />
                <button
                  type="button"
                  onClick={() => moveRow(i, -1)}
                  title="↑"
                  aria-label="↑"
                  class="w-7 h-7 flex items-center justify-center bg-slate-700/50 hover:bg-slate-600 text-slate-300 rounded-lg text-xs font-bold transition flex-shrink-0"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveRow(i, 1)}
                  title="↓"
                  aria-label="↓"
                  class="w-7 h-7 flex items-center justify-center bg-slate-700/50 hover:bg-slate-600 text-slate-300 rounded-lg text-xs font-bold transition flex-shrink-0"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  aria-label={t('ui.delete_stage')}
                  title={t('ui.delete_stage')}
                  class="w-7 h-7 flex items-center justify-center bg-red-900/40 hover:bg-red-600 text-red-300 hover:text-white rounded-lg text-xs font-bold transition flex-shrink-0"
                >
                  <Icon name="times" />
                </button>
              </div>
            ))}
          </div>
          <p class="text-[11px] text-slate-500 mt-1">{t('ui.stage_example')}</p>
        </div>

        <div class="u-grid-auto u-grid-auto--form gap-5 mb-5">
          {RB_SECS.map((sec) => (
            <div key={sec}>
              <div class="block text-xs font-bold mb-2 uppercase tracking-widest">
                <Icon name={SECTION_ICON[sec]} class={'mr-1 ' + SECTION_ICON_CLS[sec]} />
                {SECTION_LABEL[sec]()}
              </div>
              <div class="flex flex-wrap gap-1.5 mb-2">
                {loading
                  ? null
                  : (chips[sec] || []).map((c, i) => {
                      const on = (sel[sec] || []).some(
                        (x) => x.trim().toUpperCase() === String(c.item).trim().toUpperCase(),
                      );
                      return (
                        <button
                          type="button"
                          key={sec + '-' + i}
                          class={
                            'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border transition cursor-pointer ' +
                            (on
                              ? 'bg-emerald-600 text-white border-emerald-400/60'
                              : 'bg-slate-800 text-slate-300 border-slate-600 hover:border-emerald-400/50')
                          }
                          onClick={() => toggleChip(sec, c.item)}
                        >
                          <span
                            role="button"
                            tabIndex={0}
                            title={c.id ? t('ui.remove_fav') : t('ui.add_fav')}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFavorite(sec, c);
                            }}
                            class={'mr-0.5 ' + (c.id ? 'text-amber-400' : 'text-slate-500')}
                          >
                            {c.id ? '★' : '☆'}
                          </span>
                          {c.item}
                        </button>
                      );
                    })}
              </div>
              <div class="flex gap-2">
                <input
                  type="text"
                  aria-label={`${SECTION_LABEL[sec]()}: ${t('ui.custom_item_label')}`}
                  value={customInput[sec] || ''}
                  onInput={(e) =>
                    setCustomInput((prev) => ({
                      ...prev,
                      [sec]: (e.target as HTMLInputElement).value,
                    }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addCustom(sec);
                    }
                  }}
                  placeholder={t('ui.custom_item_ph')}
                  class="flex-1 p-2 rounded-lg bg-black/60 border border-slate-700 text-white text-xs outline-none focus:border-emerald-500 transition"
                />
                <button
                  type="button"
                  onClick={() => addCustom(sec)}
                  class="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-sm font-bold transition"
                >
                  +
                </button>
              </div>
            </div>
          ))}
        </div>

        <div class="mb-5">
          <label for="rb-note" class="block text-xs font-bold text-sky-400 uppercase tracking-widest mb-2">
            <Icon name="info-circle" class="mr-1" /> {t('ui.note')}
          </label>
          <textarea
            id="rb-note"
            rows={4}
            value={catatan}
            onInput={(e) => setCatatan((e.target as HTMLTextAreaElement).value)}
            placeholder={t('ui.catatan_ph')}
            class="w-full p-3 rounded-lg bg-black/60 border border-slate-700 text-white text-sm outline-none focus:border-sky-500 transition leading-relaxed"
          />
        </div>

        <div class="mb-6">
          <div class="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
            <Icon name="eye" class="mr-1" /> {t('ui.preview_detail')}
          </div>
          <pre class="bg-black/60 border border-slate-700 rounded-xl p-3 text-xs text-emerald-300 whitespace-pre-wrap max-h-40 u-scroll-area">
            {preview || t('ui.empty_rincian')}
          </pre>
        </div>

        <button
          onClick={apply}
          disabled={saving}
          class="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black shadow-lg transition text-base disabled:opacity-50"
        >
          <Icon name="save" spin={saving} class="mr-2" /> {t('ui.save_rincian')}
        </button>
      </div>
    </div>
  );
}
