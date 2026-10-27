/**
 * SimulasiMensetsu.tsx — Mode Simulasi wawancara (`/wawancara` → tab "Simulasi").
 *
 * BEDA DENGAN TAB BANK SOAL
 * -------------------------
 * Bank soal = menulis dan menyiapkan naskah. Mode ini = latihan mental:
 * soal diacak, ada batas waktu per jawaban, dan siswa MENJAWAB DENGAN SUARA
 * (kalau perambannya mendukung), lalu dinilai.
 *
 * KENAPA KOMPONEN TERPISAH, TAPI BUKAN HALAMAN TERPISAH
 * -----------------------------------------------------
 * Gerbang "khusus siswa ASJ" ada di `MensetsuForm` dan di server
 * (`tolakKecualiSiswa`). Halaman baru berarti gerbang ketiga yang bisa berbeda
 * diam-diam — persis yang diperingatkan di kepala `wawancara.astro`. Jadi mode
 * ini hidup DI DALAM halaman yang sudah bergerbang, memakai bank yang sudah
 * diambil, dan menerima `draft` dari induknya.
 *
 * KENAPA PENILAIANNYA DETERMINISTIK (lihat `lib/simulasiMensetsu.ts`)
 * --------------------------------------------------------------------
 * Jawaban mensetsu itu pribadi; tidak ada kunci jawaban. Yang diukur: seberapa
 * banyak kalimat yang SUDAH DISIAPKAN siswa benar-benar terucap, pengisi suara
 * (えーと/あのー), ketepatan waktu, dan bentuk sopan. Semuanya bisa dihitung di
 * perangkat tanpa biaya dan tanpa mengirim suara siapa pun ke server.
 *
 * BATASAN PERAMBAN YANG DITERIMA
 * ------------------------------
 * `SpeechRecognition` hanya ada di Chrome/Edge. Di Safari iOS dan Firefox
 * mikrofon tidak muncul dan siswa mengetik — jalur ketik SELALU tersedia, jadi
 * mode ini tidak pernah mati total karena peramban.
 */
import { useState, useEffect, useRef } from 'preact/hooks';
import { t } from '../../store/i18n';
import { showToast } from '../Toast';
import { ucapkanJepang, dukunganDengar, buatPendengar, type Pendengar } from '../../lib/ttsJepang';
import {
  nilaiJawaban,
  pilihSoalAcak,
  ringkasTahap,
  type HasilNilai,
  type SoalSimulasi,
} from '../../lib/simulasiMensetsu';

type Layar = 'atur' | 'main' | 'hasil';

interface DraftMap {
  [kode: string]: { jp: string; romaji: string; arti: string };
}

interface Props {
  soal: SoalSimulasi[];
  /** Draft jawaban siswa dari tab Bank Soal — dipakai sebagai acuan penilaian. */
  draft: DraftMap;
  /** Kembali ke tab Bank Soal (dipakai saat belum ada jawaban yang disiapkan). */
  onKeBank: () => void;
}

interface BarisHasil {
  soal: SoalSimulasi;
  transkrip: string;
  nilai: HasilNilai;
  detik: number;
}

const PILIHAN_JUMLAH = [5, 10, 15];
const PILIHAN_WAKTU = [30, 60, 90];

export default function SimulasiMensetsu({ soal, draft, onKeBank }: Props) {
  const [layar, setLayar] = useState<Layar>('atur');

  /* ── pengaturan ───────────────────────────────────────────────────────── */
  const [jumlah, setJumlah] = useState(5);
  const [cakupan, setCakupan] = useState('semua');
  const [batasDetik, setBatasDetik] = useState(60);
  const [suaraOtomatis, setSuaraOtomatis] = useState(true);

  /* ── ronde ────────────────────────────────────────────────────────────── */
  const [ronde, setRonde] = useState<SoalSimulasi[]>([]);
  const [idx, setIdx] = useState(0);
  const [transkrip, setTranskrip] = useState('');
  const [mendengar, setMendengar] = useState(false);
  const [sisaWaktu, setSisaWaktu] = useState(60);
  const [hasil, setHasil] = useState<BarisHasil[]>([]);

  const mulaiRef = useRef(0);
  const dasarRef = useRef('');
  const pendengarRef = useRef<Pendengar | null>(null);
  const kirimRef = useRef<() => void>(() => {});

  const daftarTahap = ringkasTahap(soal);
  const bisaDengar = dukunganDengar();
  const soalAktif = ronde[idx];

  /* Acuan penilaian: jawaban Jepang milik siswa lebih dulu, contoh bank kalau
     belum ada. `bank` sengaja ditandai di layar hasil — menilai siswa terhadap
     kalimat yang tidak pernah ia tulis harus terlihat, bukan disembunyikan. */
  const acuanUntuk = (s: SoalSimulasi) => ({
    teks: String(draft[s.kode]?.jp || s.jawaban_jp || '').trim(),
    dari: draft[s.kode]?.jp?.trim() ? ('siswa' as const) : s.jawaban_jp ? ('bank' as const) : ('tidak-ada' as const),
  });

  const adaJawabanSiap = soal.some((s) => !!draft[s.kode]?.jp?.trim());

  /* ── ronde ────────────────────────────────────────────────────────────── */
  const mulai = () => {
    const pool = cakupan === 'semua' ? soal : soal.filter((s) => s.tahap === cakupan);
    const dipilih = pilihSoalAcak(pool, jumlah);
    if (!dipilih.length) {
      showToast(t('simulasi.tidak_ada_soal'), 'error');
      return;
    }
    setRonde(dipilih);
    setIdx(0);
    setHasil([]);
    setTranskrip('');
    setSisaWaktu(batasDetik);
    setLayar('main');
    mulaiRef.current = Date.now();
    if (suaraOtomatis) ucapkanJepang(dipilih[0]?.jp ?? '');
  };

  const selesai = () => {
    hentikanMikrofon();
    setLayar('hasil');
  };

  /**
   * Pindah ke soal berikutnya, atau tutup ronde.
   *
   * Sengaja TIDAK memakai updater `setIdx((i) => …)`: efek samping di dalam
   * updater (memulai timer, memutar suara) dijalankan dua kali oleh React di
   * StrictMode, dan suara pertanyaan akan terdengar dua kali bertumpuk.
   */
  const lanjut = () => {
    const next = idx + 1;
    if (next >= ronde.length) {
      selesai();
      return;
    }
    setTranskrip('');
    setSisaWaktu(batasDetik);
    setIdx(next);
    mulaiRef.current = Date.now();
    if (suaraOtomatis) ucapkanJepang(ronde[next]?.jp ?? '');
  };

  const kirim = () => {
    if (layar !== 'main' || !soalAktif) return;
    hentikanMikrofon();
    const acuan = acuanUntuk(soalAktif);
    const detik = Math.max(1, Math.round((Date.now() - mulaiRef.current) / 1000));
    const nilai = nilaiJawaban({
      transkrip,
      acuan: acuan.teks,
      acuanDari: acuan.dari === 'bank' ? 'bank' : 'siswa',
      detikTerpakai: detik,
      batasDetik,
    });
    setHasil((h) => [...h, { soal: soalAktif, transkrip, nilai, detik }]);
    lanjut();
  };
  kirimRef.current = kirim;

  /* Timer. Efek "waktu habis" dipisah supaya tidak ada efek samping di dalam
     updater setState (React memanggilnya dua kali di StrictMode). */
  useEffect(() => {
    if (layar !== 'main') return;
    const id = window.setInterval(() => setSisaWaktu((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => window.clearInterval(id);
  }, [layar]);

  useEffect(() => {
    if (layar !== 'main' || sisaWaktu > 0) return;
    /* Waktu habis = kirim apa adanya. Jawaban kosong tetap dinilai nol dan
       dicatat "lewat waktu" — itu informasi yang berguna, bukan kegagalan UI. */
    kirimRef.current();
  }, [sisaWaktu, layar]);

  /* ── mikrofon ─────────────────────────────────────────────────────────── */
  const hentikanMikrofon = () => {
    pendengarRef.current?.hentikan();
    pendengarRef.current = null;
    setMendengar(false);
  };

  const alihMikrofon = () => {
    if (mendengar) {
      hentikanMikrofon();
      return;
    }
    const p = buatPendengar({
      onTranskrip: (teks, final) => {
        setTranskrip(dasarRef.current ? `${dasarRef.current} ${teks}`.trim() : teks);
        if (final) setMendengar(false);
      },
      onSelesai: () => setMendengar(false),
      onGalat: (kode) => {
        setMendengar(false);
        showToast(
          kode === 'not-allowed' || kode === 'service-not-allowed'
            ? t('simulasi.mikrofon_ditolak')
            : t('simulasi.mikrofon_galat'),
          'error',
        );
      },
    });
    if (!p) {
      showToast(t('simulasi.mikrofon_tidak_ada'), 'info');
      return;
    }
    /* Suara pertanyaan dimatikan dulu: mikrofon yang mendengar TTS akan
       menyalin pertanyaannya sendiri sebagai jawaban. */
    pendengarRef.current = p;
    dasarRef.current = transkrip.trim();
    p.mulai();
    setMendengar(true);
  };

  useEffect(() => () => pendengarRef.current?.hentikan(), []);

  /* ── layar: pengaturan ────────────────────────────────────────────────── */
  if (layar === 'atur') {
    return (
      <div class="rounded-card border border-line bg-surface p-4">
        <h2 class="text-[15px] font-black text-fg">{t('simulasi.judul')}</h2>
        <p class="mt-1 text-[12px] leading-relaxed text-fg-muted">{t('simulasi.ket')}</p>

        {!adaJawabanSiap && (
          <div class="mt-3 rounded-control border border-accent-amber/40 bg-accent-amber/10 p-3 text-[12px] leading-relaxed text-fg">
            {t('simulasi.belum_ada_jawaban')}{' '}
            <button type="button" onClick={onKeBank} class="font-black underline">
              {t('simulasi.ke_bank')}
            </button>
          </div>
        )}

        <div class="mt-4">
          <p class="mb-1.5 text-[11px] font-extrabold uppercase tracking-wider text-fg-muted">{t('simulasi.jumlah_soal')}</p>
          <div class="grid grid-cols-3 gap-1.5">
            {PILIHAN_JUMLAH.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setJumlah(n)}
                aria-pressed={jumlah === n}
                class={`min-h-11 rounded-control border text-[12px] font-bold ${
                  jumlah === n ? 'border-accent-violet bg-accent-violet/10 text-accent-violet' : 'border-line bg-surface-raised text-fg-muted'
                }`}
              >
                {n} {t('simulasi.soal')}
              </button>
            ))}
          </div>
        </div>

        <div class="mt-3">
          <p class="mb-1.5 text-[11px] font-extrabold uppercase tracking-wider text-fg-muted">{t('simulasi.cakupan')}</p>
          <select
            value={cakupan}
            onChange={(e) => setCakupan((e.target as HTMLSelectElement).value)}
            class="w-full min-h-11 rounded-control border border-line bg-surface-sunken px-2 text-[12.5px] text-fg"
          >
            <option value="semua">
              {t('simulasi.semua_tahap')} ({soal.length})
            </option>
            {daftarTahap.map((d) => (
              <option key={d.tahap} value={d.tahap}>
                {d.tahap} ({d.jumlah})
              </option>
            ))}
          </select>
        </div>

        <div class="mt-3">
          <p class="mb-1.5 text-[11px] font-extrabold uppercase tracking-wider text-fg-muted">{t('simulasi.batas_waktu')}</p>
          <div class="grid grid-cols-3 gap-1.5">
            {PILIHAN_WAKTU.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setBatasDetik(n)}
                aria-pressed={batasDetik === n}
                class={`min-h-11 rounded-control border text-[12px] font-bold ${
                  batasDetik === n ? 'border-accent-violet bg-accent-violet/10 text-accent-violet' : 'border-line bg-surface-raised text-fg-muted'
                }`}
              >
                {n} {t('simulasi.detik')}
              </button>
            ))}
          </div>
        </div>

        <label class="mt-3 flex items-center gap-2 text-[12px] font-bold text-fg">
          <input
            type="checkbox"
            checked={suaraOtomatis}
            onChange={(e) => setSuaraOtomatis((e.target as HTMLInputElement).checked)}
            class="h-4 w-4"
          />
          {t('simulasi.suara_otomatis')}
        </label>

        {!bisaDengar && (
          <p class="mt-3 rounded-control border border-line bg-surface-sunken p-3 text-[11.5px] leading-relaxed text-fg-muted">
            {t('simulasi.mikrofon_tidak_ada')}
          </p>
        )}

        <button
          type="button"
          onClick={mulai}
          data-testid="simulasi-mulai"
          class="mt-4 w-full min-h-12 rounded-control bg-accent-violet text-canvas text-sm font-extrabold"
        >
          {t('simulasi.mulai')}
        </button>
      </div>
    );
  }

  /* ── layar: hasil ─────────────────────────────────────────────────────── */
  if (layar === 'hasil') {
    const rata = hasil.length ? Math.round(hasil.reduce((a, b) => a + b.nilai.total, 0) / hasil.length) : 0;
    const grade = rata >= 85 ? 'A' : rata >= 70 ? 'B' : rata >= 55 ? 'C' : 'D';
    const warna: Record<string, string> = {
      A: 'border-accent-emerald bg-accent-emerald/10 text-accent-emerald',
      B: 'border-accent-sky bg-accent-sky/10 text-accent-sky',
      C: 'border-accent-amber bg-accent-amber/10 text-accent-amber',
      D: 'border-accent-red bg-accent-red/10 text-accent-red',
    };
    return (
      <div class="space-y-3">
        <div class="rounded-card border border-line bg-surface p-4 text-center">
          <div class={`mb-2 inline-block rounded-control border-2 px-4 py-1 text-2xl font-black ${warna[grade] ?? ''}`}>{grade}</div>
          <h2 class="text-[15px] font-black text-fg">{t('simulasi.hasil_judul')}</h2>
          <p class="mt-1 text-[12px] text-fg-muted">
            {t('simulasi.skor_total')}: <b class="text-fg">{rata}</b> / 100 · {hasil.length} {t('simulasi.soal')}
          </p>
        </div>

        <div class="space-y-2">
          {hasil.map((h, i) => (
            <div key={`${h.soal.kode}-${i}`} class="rounded-card border border-line bg-surface p-3">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="text-[10px] font-bold uppercase text-fg-muted">{h.soal.tahap}</p>
                  <p class="text-[13px] font-bold text-fg" lang="ja">
                    {h.soal.jp}
                  </p>
                </div>
                <span class={`shrink-0 rounded-control border px-2 py-0.5 text-[12px] font-black ${warna[h.nilai.grade] ?? ''}`}>
                  {h.nilai.total}
                </span>
              </div>

              <div class="mt-1.5 grid grid-cols-2 gap-1 text-[11px] text-fg-muted">
                <span>
                  {t('simulasi.aspek_kecocokan')}: {h.nilai.aspek.kecocokan === null ? '—' : `${h.nilai.aspek.kecocokan}/50`}
                </span>
                <span>
                  {t('simulasi.aspek_kelancaran')}: {h.nilai.aspek.kelancaran}/25
                </span>
                <span>
                  {t('simulasi.aspek_waktu')}: {h.nilai.aspek.waktu}/15 ({h.detik}s)
                </span>
                <span>
                  {t('simulasi.aspek_sopan')}: {h.nilai.aspek.sopan}/10
                </span>
              </div>

              {h.transkrip && (
                <p class="mt-1.5 rounded-control border border-line bg-surface-sunken p-2 text-[12px] text-fg" lang="ja">
                  {h.transkrip}
                </p>
              )}

              <p class="mt-1 text-[10px] font-bold text-fg-muted">
                {h.nilai.acuan === 'siswa' ? t('simulasi.acuan_siswa') : h.nilai.acuan === 'bank' ? t('simulasi.acuan_bank') : t('simulasi.acuan_tidak_ada')}
              </p>

              <ul class="mt-1 space-y-0.5 text-[11.5px] text-fg-muted">
                {h.nilai.catatan.map((c, ci) => (
                  <li key={`${c.kode}-${ci}`}>
                    · {t(`simulasi.catatan_${c.kode}`)}
                    {typeof c.angka === 'number' ? ` (${c.angka})` : ''}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div class="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={mulai}
            class="min-h-12 rounded-control bg-accent-violet text-canvas text-xs font-extrabold"
          >
            {t('simulasi.ulangi')}
          </button>
          <button
            type="button"
            onClick={() => setLayar('atur')}
            class="min-h-12 rounded-control border border-line bg-surface-raised text-xs font-extrabold text-fg"
          >
            {t('simulasi.ganti_pengaturan')}
          </button>
        </div>
      </div>
    );
  }

  /* ── layar: main ──────────────────────────────────────────────────────── */
  const acuanAktif = soalAktif ? acuanUntuk(soalAktif) : { teks: '', dari: 'tidak-ada' as const };
  return (
    <div class="space-y-3">
      <div class="flex items-center justify-between gap-2 rounded-card border border-line bg-surface p-3">
        <div>
          <span class="block text-[10px] font-bold uppercase tracking-wider text-fg-muted">{t('simulasi.nomor')}</span>
          <div class="flex items-baseline gap-1">
            <span class="text-lg font-black text-fg">{String(idx + 1).padStart(2, '0')}</span>
            <span class="text-xs font-semibold text-fg-muted">/ {ronde.length}</span>
          </div>
        </div>
        <div class="text-right">
          <span class="block text-[10px] font-bold uppercase tracking-wider text-fg-muted">{t('simulasi.sisa_waktu')}</span>
          <span class={`text-lg font-black ${sisaWaktu <= 10 ? 'text-accent-red' : 'text-accent-violet'}`}>{sisaWaktu}s</span>
        </div>
      </div>

      <div class="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
        <div
          class="h-full bg-gradient-to-r from-accent-violet to-accent-sky transition-[width] duration-300 motion-reduce:transition-none"
          style={{ width: `${(sisaWaktu / Math.max(1, batasDetik)) * 100}%` }}
        />
      </div>

      <div class="rounded-card border border-line bg-surface p-4">
        <p class="text-[10px] font-bold uppercase tracking-wider text-fg-muted">{soalAktif?.tahap}</p>
        <p class="mt-1 text-[16px] font-bold leading-snug text-fg" lang="ja" data-testid="simulasi-soal">
          {soalAktif?.jp}
        </p>
        <p class="text-[11.5px] text-fg-muted">{soalAktif?.romaji}</p>
        <p class="text-[12px] text-fg">{soalAktif?.arti}</p>

        <div class="mt-2 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => ucapkanJepang(soalAktif?.jp ?? '')}
            class="inline-flex min-h-11 items-center gap-1 rounded-md border border-line bg-surface-raised px-2.5 text-[11px] font-bold text-fg-muted"
          >
            <span aria-hidden="true">🔊</span>
            {t('wawancara.dengar')}
          </button>
          <span class="text-[10.5px] text-fg-muted">
            {acuanAktif.dari === 'siswa' ? t('simulasi.acuan_siswa') : acuanAktif.dari === 'bank' ? t('simulasi.acuan_bank') : t('simulasi.acuan_tidak_ada')}
          </span>
        </div>
      </div>

      <div class="rounded-card border border-line bg-surface p-3">
        <div class="flex items-center justify-between gap-2">
          <span class="text-[11px] font-extrabold uppercase tracking-wider text-fg-muted">{t('simulasi.jawaban')}</span>
          <button
            type="button"
            onClick={alihMikrofon}
            aria-pressed={mendengar}
            data-testid="simulasi-mikrofon"
            class={`inline-flex min-h-11 items-center gap-1.5 rounded-control border px-3 text-[11.5px] font-bold ${
              mendengar ? 'border-accent-red bg-accent-red/10 text-accent-red' : 'border-line bg-surface-raised text-fg-muted'
            }`}
          >
            <span aria-hidden="true">{mendengar ? '⏹' : '🎙'}</span>
            {mendengar ? t('simulasi.berhenti_dengar') : t('simulasi.mulai_dengar')}
          </button>
        </div>
        <textarea
          rows={3}
          lang="ja"
          value={transkrip}
          onInput={(e) => setTranskrip((e.target as HTMLTextAreaElement).value)}
          placeholder={t('simulasi.ketik_jawaban')}
          data-testid="simulasi-transkrip"
          class="mt-2 w-full rounded-control border border-line bg-surface-sunken px-2 py-1.5 text-[13px] text-fg"
        />
        <div class="mt-2 grid grid-cols-[1fr_auto] gap-2">
          <button
            type="button"
            onClick={kirim}
            data-testid="simulasi-kirim"
            class="min-h-11 rounded-control bg-accent-violet text-canvas text-[12.5px] font-extrabold"
          >
            {t('simulasi.kirim')}
          </button>
          <button
            type="button"
            onClick={kirim}
            class="min-h-11 rounded-control border border-line bg-surface-raised px-3 text-[11.5px] font-bold text-fg-muted"
          >
            {t('simulasi.lewati')}
          </button>
        </div>
      </div>

      <button type="button" onClick={selesai} class="min-h-11 w-full text-[11px] font-bold text-fg-muted">
        {t('simulasi.akhiri')}
      </button>
    </div>
  );
}
