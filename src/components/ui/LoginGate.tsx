/**
 * LoginGate.tsx — formulir masuk kandidat yang dipakai bersama.
 *
 * KENAPA DIEKSTRAK
 * ----------------
 * `/kotoba`, `/matematika`, dan `/wawancara` masing-masing menulis formulir
 * gerbangnya sendiri (tiga salinan). Menambah salinan keempat untuk `/arcade`
 * akan mengulang pola yang justru jadi masalah: satu aturan yang hidup di empat
 * tempat ditegakkan di satu tempat dan dipercaya di tiga.
 *
 * Komponen ini adalah benih penggabungannya: `/arcade` memakainya sekarang, dan
 * tiga halaman lain menyusul tanpa mengubah perilakunya.
 *
 * BATAS YANG JUJUR: ini gerbang KLIEN. Ia menghentikan akses sambil lalu, bukan
 * penyerang — data yang benar-benar perlu dijaga harus ditolak di server
 * (seperti `getBankKotoba` → `tolakKecualiSiswa`). Untuk `/arcade`, yang dilindungi
 * hanya pengalaman (bukan data sensitif): seluruh kata ada di bundel.
 */
import { useState } from 'preact/hooks';
import { t } from '../../store/i18n';
import { authStore } from '../../store/authReactive';
import { validate, kandidatLoginSchema } from '../../lib/schemas';
import { apiClient } from '../../lib/apiClient';

interface Props {
  /** Dipanggil setelah sesi tersimpan di `authStore`. */
  onSuccess: (wa: string) => void;
}

export default function LoginGate({ onSuccess }: Props) {
  const [wa, setWa] = useState('');
  const [sandi, setSandi] = useState('');
  const [pesan, setPesan] = useState('');
  const [memuat, setMemuat] = useState(false);

  const masuk = async () => {
    const v = validate(kandidatLoginSchema, { wa: wa.trim(), password: sandi });
    if (!v.success) {
      setPesan(v.errors[0]);
      return;
    }
    setMemuat(true);
    setPesan('');
    try {
      const d = await apiClient<{ sessionToken?: string; token?: string; user?: string }>(
        'loginKandidat',
        [wa.trim(), sandi],
        { requireAuth: false, onSessionInvalid: 'throw', silent: true },
      );
      const token = d.sessionToken || d.token || '';
      authStore.set({
        ...authStore.get(),
        sessionToken: token,
        wa: wa.trim(),
        name: d.user || 'kandidat',
        isLoggedIn: true,
        role: 'kandidat',
        lastChecked: Date.now(),
      });
      onSuccess(wa.trim());
    } catch (e) {
      setPesan(e instanceof Error ? e.message : t('kotoba.galat_sesi'));
    } finally {
      setMemuat(false);
    }
  };

  return (
    <section
      aria-label={t('kotoba.gate_title')}
      class="max-w-md mx-auto my-8 rounded-card border border-line bg-surface p-6"
    >
      <h2 class="text-base font-black text-fg mb-1">{t('kotoba.gate_title')}</h2>
      <p class="text-[12px] text-fg-muted mb-4">{t('kotoba.gate_desc')}</p>

      <label for="arcade-gate-wa" class="block text-[11px] font-bold text-fg mb-1">
        {t('kotoba.gate_wa')}
      </label>
      <input
        id="arcade-gate-wa"
        type="tel"
        value={wa}
        onInput={(e) => setWa((e.target as HTMLInputElement).value)}
        placeholder="08xxxxxxxxxx"
        class="w-full mb-3 rounded-control bg-surface-sunken border border-line px-3 py-2 min-h-11 text-sm text-fg"
      />

      <label for="arcade-gate-pass" class="block text-[11px] font-bold text-fg mb-1">
        {t('kotoba.gate_pass')}
      </label>
      <input
        id="arcade-gate-pass"
        type="password"
        value={sandi}
        onInput={(e) => setSandi((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => {
          if ((e as KeyboardEvent).key === 'Enter') void masuk();
        }}
        class="w-full mb-3 rounded-control bg-surface-sunken border border-line px-3 py-2 min-h-11 text-sm text-fg"
      />

      {pesan && <p class="text-[12px] text-accent-red mb-3">{pesan}</p>}

      <button
        type="button"
        onClick={() => void masuk()}
        disabled={memuat}
        class="min-h-11 w-full rounded-control bg-accent-emerald px-4 text-sm font-bold text-canvas disabled:opacity-60"
      >
        {memuat ? '…' : t('kotoba.gate_submit')}
      </button>
    </section>
  );
}
