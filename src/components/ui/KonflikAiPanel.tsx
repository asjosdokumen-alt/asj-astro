/**
 * KonflikAiPanel.tsx — "data yang mana yang dipakai?"
 *
 * KENAPA ADA (keputusan pemilik 2026-11-09)
 * -----------------------------------------
 * Ketika AI mengekstrak data dari teks yang ditempel, satu kolom bisa SUDAH
 * berisi nilai lain. Dua perilaku sebelumnya sama-sama salah:
 *
 *   • menimpa otomatis → data yang benar bisa hilang karena salah baca model;
 *   • mengabaikan diam-diam → admin menempel data, layar tidak berubah, dan
 *     kesimpulannya "AI-nya rusak" (itulah yang dilaporkan).
 *
 * Panel ini menampilkan kolom yang BENTROK saja, dengan default "pakai yang
 * lama" (aman), pilihan per baris, dan satu tombol untuk memaksa semua memakai
 * data dari chat.
 *
 * TEKS SENGAJA BAHASA INDONESIA, tanpa `t()`: ini permukaan admin, umurnya
 * pendek (satu keputusan lalu hilang), dan menambah 6 kunci ke dua kamus untuk
 * dialog yang hanya dilihat admin bukan pertukaran yang sepadan. Preseden:
 * label "Detail opsional" di AiCvForm.
 */
import { useState } from 'preact/hooks';
import type { KonflikKolom } from '../../lib/aiCvDraft';
import { t } from '../../store/i18n';

interface Props {
  konflik: KonflikKolom[];
  /** Nama kolom yang dibaca manusia (mis. `nama_lengkap` → "Nama Lengkap"). */
  label: (key: string) => string;
  /** Dipanggil dengan pilihan per kolom: 'lama' (pertahankan) atau 'baru'. */
  onTerapkan: (pilihan: Record<string, 'lama' | 'baru'>) => void;
  /** Tutup tanpa mengubah apa pun (kolom yang bentrok dibiarkan seperti semula). */
  onBatal: () => void;
}

export default function KonflikAiPanel({ konflik, label, onTerapkan, onBatal }: Props) {
  // Default 'lama' untuk SETIAP baris: tombol yang paling mudah ditekan harus
  // yang paling aman. Memilih 'baru' adalah tindakan sadar per kolom.
  const [pilihan, setPilihan] = useState<Record<string, 'lama' | 'baru'>>(() =>
    Object.fromEntries(konflik.map((k) => [k.key, 'lama' as const])),
  );
  if (!konflik.length) return null;

  const pilih = (key: string, v: 'lama' | 'baru') =>
    setPilihan((p) => ({ ...p, [key]: v }));

  return (
    <div class="rounded-control border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
      <p class="text-[11px] font-bold text-amber-900 dark:text-amber-300">
        {t('ai.konflik_judul').replace('{n}', String(konflik.length))}
      </p>
      <div class="max-h-56 overflow-y-auto space-y-2 pr-1">
        {konflik.map((k) => (
          <div key={k.key} class="rounded border border-line-strong bg-surface-raised p-2">
            <p class="text-[11px] font-bold text-fg mb-1">{label(k.key)}</p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              <button
                type="button"
                aria-pressed={pilihan[k.key] === 'lama'}
                onClick={() => pilih(k.key, 'lama')}
                class={
                  'text-left text-[11px] px-2 py-1.5 min-h-11 rounded border transition ' +
                  (pilihan[k.key] === 'lama'
                    ? 'border-sky-500 bg-sky-500/15 text-fg font-bold'
                    : 'border-line-strong text-fg-muted hover:border-sky-400')
                }
              >
                <span class="block text-[10px] uppercase tracking-wide opacity-70">{t('ai.konflik_sekarang')}</span>
                <span class="block break-words">{k.lama}</span>
              </button>
              <button
                type="button"
                aria-pressed={pilihan[k.key] === 'baru'}
                onClick={() => pilih(k.key, 'baru')}
                class={
                  'text-left text-[11px] px-2 py-1.5 min-h-11 rounded border transition ' +
                  (pilihan[k.key] === 'baru'
                    ? 'border-emerald-500 bg-emerald-500/15 text-fg font-bold'
                    : 'border-line-strong text-fg-muted hover:border-emerald-400')
                }
              >
                <span class="block text-[10px] uppercase tracking-wide opacity-70">{t('ai.konflik_dari_chat')}</span>
                <span class="block break-words">{k.baru}</span>
              </button>
            </div>
          </div>
        ))}
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onTerapkan(pilihan)}
          class="flex-1 min-h-11 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-control text-[11px] font-bold"
        >
          {t('ai.konflik_terapkan')}
        </button>
        <button
          type="button"
          onClick={() => onTerapkan(Object.fromEntries(konflik.map((k) => [k.key, 'baru' as const])))}
          class="flex-1 min-h-11 px-3 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-control text-[11px] font-bold"
        >
          {t('ai.konflik_paksa')}
        </button>
        <button
          type="button"
          onClick={onBatal}
          class="min-h-11 px-3 py-2 border border-line-strong text-fg-muted rounded-control text-[11px] font-bold"
        >
          {t('ai.konflik_batal')}
        </button>
      </div>
    </div>
  );
}
