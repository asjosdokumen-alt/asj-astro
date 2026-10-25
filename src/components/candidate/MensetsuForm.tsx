/**
 * MensetsuForm.tsx — Latihan wawancara Jepang: chat kiri, isian kanan.
 *
 * MENGGANTIKAN InterviewSimulatorModal (chat bebas "Jeklin Sensei")
 *   Simulator lama tidak punya soal tetap, tidak punya isian, dan tidak bisa
 *   dihafal. Di sini soalnya adalah bank 177 soal (tabel `wawancara_soal`,
 *   migrasi 021) yang sudah diurutkan mengikuti alur mensetsu 13 tahap.
 *
 * DUA PANEL, SATU DATA
 *   Kiri  : AI menanyakan soal dari bank, satu per satu. Siswa menjawab dalam
 *           Bahasa Indonesia; jawaban itu diterjemahkan ke Jepang + cara baca
 *           lalu langsung masuk ke baris yang sama di kanan.
 *   Kanan : seluruh soal tahap aktif, tiap baris tiga lapis (日本語 / cara baca /
 *           Indonesia) yang bisa diedit manual dan disimpan.
 *
 *   Jadi "AI memakai soal di samping" benar-benar satu sumber: yang ditanyakan
 *   di kiri adalah baris yang sama yang tampak di kanan.
 *
 * SINKRON CV
 *   Delapan soal (Jiko PR, kelebihan, kekurangan, keahlian, hobi, tujuan,
 *   rencana pulang, tabungan) jawabannya ADALAH kolom CV. Backend menulis ke
 *   kolom itu, jadi mengubah Jiko PR di CV AI langsung terlihat di sini dan
 *   sebaliknya. Baris seperti itu ditandai "tersambung CV".
 */
import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { showToast } from '../Toast';
import { authStore } from '../../store/authReactive';
import { apiClient, type ApiError } from '../../lib/apiClient';
import { validate, kandidatLoginSchema } from '../../lib/schemas';
import { t } from '../../store/i18n';

interface Soal {
  kode: string;
  tahap: string;
  urutan: number;
  jp: string;
  romaji: string;
  arti: string;
  jawaban_jp: string | null;
  jawaban_romaji: string | null;
  jawaban_arti: string | null;
  kolom_cv: string | null;
  sinkron_cv: boolean;
  jawabanku: { jp: string; romaji: string; arti: string };
}

interface BankRes {
  success?: boolean;
  wa?: string;
  jumlah?: number;
  tahap?: string[];
  soal?: Soal[];
  error?: string;
  message?: string;
  sessionInvalid?: boolean;
}

interface Props {
  /** WA dari URL (`?wa=`) atau dari panel admin. */
  waTarget?: string;
}

type Bidang = 'jp' | 'romaji' | 'arti';
type Draft = Record<string, Record<Bidang, string>>;

/** `?wa=` pada URL — pola yang sama dengan /ai-cv: bukan token, hanya pengisi
 *  awal. Kandidat tetap memasukkan passwordnya sendiri. */
function waFromUrl(): string {
  if (typeof window === 'undefined') return '';
  try {
    return new URLSearchParams(window.location.search).get('wa') || '';
  } catch {
    return '';
  }
}

function namaFromUrl(): string {
  if (typeof window === 'undefined') return '';
  try {
    return new URLSearchParams(window.location.search).get('nama') || '';
  } catch {
    return '';
  }
}

/** Satu pesan chat yang berisi satu soal. Murni — tidak menangkap state. */
function pesanSoal(s: Soal) {
  return {
    dari: 'ai' as const,
    teks: `${s.jp}\n(${s.romaji})\n\nArtinya: ${s.arti}\n\nJawab dalam Bahasa Indonesia — nanti saya ubah ke Jepang + cara bacanya.`,
  };
}

export default function MensetsuForm({ waTarget = '' }: Props) {
  const auth = authStore.get();
  const [loginGate, setLoginGate] = useState(!auth.isLoggedIn);
  const [gateWa, setGateWa] = useState(waFromUrl() || waTarget);
  const [gatePass, setGatePass] = useState('');
  const [gateMsg, setGateMsg] = useState('');
  const [wa, setWa] = useState(waTarget || (auth.isLoggedIn ? auth.wa || '' : ''));

  const [memuat, setMemuat] = useState(false);
  const [galat, setGalat] = useState('');
  const [tahap, setTahap] = useState<string[]>([]);
  const [soal, setSoal] = useState<Soal[]>([]);
  const [draft, setDraft] = useState<Draft>({});
  const [tahapAktif, setTahapAktif] = useState(0);
  const [sibuk, setSibuk] = useState<Record<string, Bidang | 'terjemah' | 'simpan' | ''>>({});
  const [contoh, setContoh] = useState<Record<string, boolean>>({});

  const [chat, setChat] = useState<Array<{ dari: 'ai' | 'siswa'; teks: string }>>([]);
  const [jawabanChat, setJawabanChat] = useState('');
  const [idxTanya, setIdxTanya] = useState(0);
  const chatRef = useRef<HTMLDivElement | null>(null);

  const admin = auth.role === 'admin';

  /* ── login gate (pola sama dengan AiCvForm.gateLogin) ───────────────────── */
  const gateLogin = async () => {
    const vg = validate(kandidatLoginSchema, { wa: gateWa.trim(), password: gatePass });
    if (!vg.success) {
      setGateMsg(vg.errors[0]);
      return;
    }
    try {
      // KONTRAK WIRE: loginKandidat memakai z.tuple → payload WAJIB dua primitif.
      const d = await apiClient<{ sessionToken?: string; token?: string; user?: string }>(
        'loginKandidat',
        [gateWa.trim(), gatePass],
        { requireAuth: false, onSessionInvalid: 'throw', silent: true },
      );
      const token = d.sessionToken || d.token || '';
      authStore.set({
        ...authStore.get(),
        sessionToken: token,
        wa: gateWa.trim(),
        name: d.user || 'kandidat',
        isLoggedIn: true,
        role: 'kandidat',
        lastChecked: Date.now(),
      });
      setWa(gateWa.trim());
      setLoginGate(false);
    } catch (e) {
      const err = e as ApiError;
      setGateMsg(err.status ? 'Password salah atau akun tidak ditemukan.' : 'Error koneksi.');
    }
  };

  /**
   * Mulai satu tahap: reset pertanyaan ke nomor 1 dan buka chat dengan soalnya.
   *
   * Dijalankan dari handler (bukan useEffect yang mengawasi `tahapAktif`):
   * dengan cara itu daftar soal yang dipakai selalu yang baru dimuat, bukan
   * state yang belum tentu sudah ter-flush di render yang sama.
   */
  const mulaiTahap = (i: number, daftarTahap: string[], daftarSoal: Soal[]) => {
    setTahapAktif(i);
    setIdxTanya(0);
    const nama = daftarTahap[i] || '';
    const pertama = daftarSoal.find((x) => x.tahap === nama);
    setChat(pertama ? [pesanSoal(pertama)] : []);
  };

  /* ── muat bank ─────────────────────────────────────────────────────────── */
  const muat = useCallback(async (nomor: string) => {
    if (!nomor) return;
    setMemuat(true);
    setGalat('');
    try {
      const d = await apiClient<BankRes>('getBankWawancara', [nomor], {
        onSessionInvalid: 'throw',
        silent: true,
      });
      if (d.sessionInvalid) {
        setLoginGate(true);
        setGateMsg('Sesi tidak valid. Silakan masuk lagi.');
        return;
      }
      const daftar = Array.isArray(d.soal) ? d.soal : [];
      setSoal(daftar);
      setTahap(Array.isArray(d.tahap) ? d.tahap : []);
      const awal: Draft = {};
      for (const s of daftar) {
        awal[s.kode] = {
          jp: s.jawabanku?.jp || '',
          romaji: s.jawabanku?.romaji || '',
          arti: s.jawabanku?.arti || '',
        };
      }
      setDraft(awal);
      if (!daftar.length) setGalat('Bank soal kosong. Hubungi admin.');
      const daftarTahap = Array.isArray(d.tahap) ? d.tahap : [];
      setTahapAktif(0);
      setIdxTanya(0);
      const pertama = daftar.find((x) => x.tahap === daftarTahap[0]);
      setChat(pertama ? [pesanSoal(pertama)] : []);
    } catch (e) {
      const err = e as ApiError;
      setGalat(err.message || 'Gagal memuat bank soal.');
    } finally {
      setMemuat(false);
    }
    // `pesanSoal` murni (tanpa state), jadi tidak perlu jadi dependensi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loginGate && wa) void muat(wa);
  }, [loginGate, wa, muat]);

  /* ── soal tahap aktif ──────────────────────────────────────────────────── */
  const tahapSekarang = tahap[tahapAktif] || '';
  const soalTahap = soal.filter((s) => s.tahap === tahapSekarang);
  const soalAktif: Soal | undefined = soalTahap[idxTanya];

  /* ── chat: AI menanyakan soal berikutnya ───────────────────────────────── */
  const tanya = (s?: Soal) => {
    if (!s) return;
    setChat((c) => [
      ...c,
      {
        dari: 'ai',
        teks: `${s.jp}\n(${s.romaji})\n\nArtinya: ${s.arti}\n\nJawab dalam Bahasa Indonesia — nanti saya ubah ke Jepang + cara bacanya.`,
      },
    ]);
  };

  useEffect(() => {
    // `chat` dibaca di sini, bukan hanya `chatRef`: tanpa itu biome benar
    // menilai dependensinya berlebih, dan efeknya memang tidak akan pernah
    // jalan lagi setelah pesan pertama.
    if (!chat.length) return;
    const el = chatRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat]);

  /* ── simpan satu baris ─────────────────────────────────────────────────── */
  const simpanBaris = async (kode: string, senyap = false) => {
    const d = draft[kode];
    if (!d) return;
    setSibuk((s) => ({ ...s, [kode]: 'simpan' }));
    try {
      await apiClient('simpanJawabanWawancara', [wa, kode, d], { onSessionInvalid: 'throw' });
      if (!senyap) showToast('Tersimpan.', 'success');
    } catch (e) {
      showToast((e as ApiError).message || 'Gagal menyimpan.', 'error');
    } finally {
      setSibuk((s) => ({ ...s, [kode]: '' }));
    }
  };

  /* ── terjemahkan: Indonesia → Jepang + cara baca ────────────────────────── */
  const terjemahkan = async (kode: string, dariChat = false): Promise<boolean> => {
    const arti = (draft[kode]?.arti || '').trim();
    if (!arti) {
      showToast('Tulis dulu jawaban Bahasa Indonesianya.', 'error');
      return false;
    }
    setSibuk((s) => ({ ...s, [kode]: 'terjemah' }));
    try {
      const r = await apiClient<{ jp?: string; romaji?: string; arti?: string }>(
        'terjemahkanJawabanWawancara',
        [wa, kode, arti],
        { onSessionInvalid: 'throw' },
      );
      const jp = String(r.jp || '');
      const romaji = String(r.romaji || '');
      const artiRapi = String(r.arti || arti);
      setDraft((d) => ({ ...d, [kode]: { jp, romaji, arti: artiRapi } }));
      if (dariChat) {
        setChat((c) => [
          ...c,
          { dari: 'ai', teks: `${jp}\n(${romaji})\n\nSudah tersimpan.` },
        ]);
      } else {
        showToast('Jepang + cara baca terisi.', 'success');
      }
      return true;
    } catch (e) {
      showToast((e as ApiError).message || 'Gagal menerjemahkan.', 'error');
      return false;
    } finally {
      setSibuk((s) => ({ ...s, [kode]: '' }));
    }
  };

  /* ── kirim jawaban dari panel chat ─────────────────────────────────────── */
  const kirimChat = async () => {
    const teks = jawabanChat.trim();
    if (!teks || !soalAktif) return;
    const kode = soalAktif.kode;
    setChat((c) => [...c, { dari: 'siswa', teks }]);
    setJawabanChat('');
    setDraft((d) => ({ ...d, [kode]: { ...(d[kode] || { jp: '', romaji: '', arti: '' }), arti: teks } }));

    // Terjemahkan memakai teks yang baru saja ditulis (state belum tentu segar).
    setSibuk((s) => ({ ...s, [kode]: 'terjemah' }));
    try {
      const r = await apiClient<{ jp?: string; romaji?: string; arti?: string }>(
        'terjemahkanJawabanWawancara',
        [wa, kode, teks],
        { onSessionInvalid: 'throw' },
      );
      setDraft((d) => ({
        ...d,
        [kode]: { jp: String(r.jp || ''), romaji: String(r.romaji || ''), arti: String(r.arti || teks) },
      }));
      setChat((c) => [
        ...c,
        { dari: 'ai', teks: `${String(r.jp || '')}\n(${String(r.romaji || '')})\n\nSudah tersimpan.` },
      ]);
      const berikut = idxTanya + 1;
      if (berikut < soalTahap.length) {
        setIdxTanya(berikut);
        tanya(soalTahap[berikut]);
      } else {
        setChat((c) => [
          ...c,
          { dari: 'ai', teks: 'Tahap ini selesai. Jawabanmu sudah tersimpan semua — lanjut ke tahap berikutnya lewat tombol di atas, atau periksa di tabel kanan.' },
        ]);
      }
    } catch (e) {
      showToast((e as ApiError).message || 'Gagal menerjemahkan.', 'error');
    } finally {
      setSibuk((s) => ({ ...s, [kode]: '' }));
    }
  };

  /* ── link untuk siswa ──────────────────────────────────────────────────── */
  const salinLink = async () => {
    const nomor = (wa || '').trim();
    if (!nomor) {
      showToast('Nomor WA belum ada.', 'error');
      return;
    }
    const base = typeof window !== 'undefined' ? window.location.origin : '';
    const url = `${base}/wawancara?wa=${encodeURIComponent(nomor)}&nama=${encodeURIComponent(namaFromUrl())}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Link disalin. Kirim ke siswa — dia tetap memasukkan passwordnya sendiri.', 'success');
    } catch {
      showToast(url, 'info');
    }
  };

  /* ── render: gate ──────────────────────────────────────────────────────── */
  if (loginGate) {
    return (
      <section aria-label={t('wawancara.gate_title')} class="max-w-md mx-auto my-8 rounded-card border border-slate-700 bg-slate-900 p-6">
        <h2 class="text-base font-black text-white mb-1">{t('wawancara.gate_title')}</h2>
        <p class="text-[12px] text-slate-400 mb-4">
          Masuk dengan nomor WhatsApp dan password akun Anda untuk membuka latihan wawancara.
        </p>
        <label for="mensetsu-gate-wa" class="block text-[11px] font-bold text-slate-300 mb-1">Nomor WhatsApp</label>
        <input
          id="mensetsu-gate-wa"
          type="tel"
          value={gateWa}
          onInput={(e) => setGateWa((e.target as HTMLInputElement).value)}
          placeholder="08xxxxxxxxxx"
          class="w-full mb-3 rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-white"
        />
        <label for="mensetsu-gate-pass" class="block text-[11px] font-bold text-slate-300 mb-1">Password</label>
        <input
          id="mensetsu-gate-pass"
          type="password"
          value={gatePass}
          onInput={(e) => setGatePass((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => { if ((e as KeyboardEvent).key === 'Enter') void gateLogin(); }}
          class="w-full mb-3 rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-white"
        />
        {gateMsg && <p class="text-[12px] text-rose-400 mb-3">{gateMsg}</p>}
        <button type="button" onClick={() => void gateLogin()} class="w-full min-h-11 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold">
          Masuk
        </button>
      </section>
    );
  }

  /* ── render: utama ─────────────────────────────────────────────────────── */
  const sibukBaris = (kode: string) => sibuk[kode] || '';

  return (
    <div class="grid grid-cols-1 lg:grid-cols-[35%_65%] gap-3 items-start">
      {/* ── kiri: AI menanyakan soal ─────────────────────────────────────── */}
      <section class="rounded-card border border-slate-700 bg-slate-900 flex flex-col lg:sticky lg:top-2 h-[70vh] lg:h-[calc(100vh-120px)]">
        <header class="px-3 py-2 border-b border-slate-700 flex items-center justify-between">
          <div>
            <h2 class="text-sm font-black text-white">Qween Jeklin — Latihan Mensetsu</h2>
            <p class="text-[11px] text-slate-400">
              {tahapSekarang ? `Tahap ${tahapAktif + 1}/${tahap.length} · ${tahapSekarang}` : 'Memuat…'}
            </p>
          </div>
          {admin && (
            <button type="button" onClick={() => void salinLink()} class="min-h-9 px-2 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-[11px] font-bold">
              Link siswa
            </button>
          )}
        </header>

        <div ref={chatRef} class="flex-1 overflow-y-auto px-3 py-3 space-y-2">
          {chat.map((m, i) => (
            <div key={i} class={m.dari === 'ai' ? 'text-[12.5px] text-slate-200 whitespace-pre-wrap rounded-lg bg-slate-800/70 px-3 py-2' : 'text-[12.5px] text-white whitespace-pre-wrap rounded-lg bg-violet-600/30 px-3 py-2 ml-6'}>
              {m.teks}
            </div>
          ))}
          {memuat && <p class="text-[12px] text-slate-400">{t('wawancara.loading_bank')}</p>}
          {galat && <p class="text-[12px] text-rose-400">{galat}</p>}
        </div>

        <footer class="border-t border-slate-700 p-2">
          <textarea
            rows={2}
            value={jawabanChat}
            onInput={(e) => setJawabanChat((e.target as HTMLTextAreaElement).value)}
            onKeyDown={(e) => {
              const ev = e as KeyboardEvent;
              if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); void kirimChat(); }
            }}
            placeholder="Jawab dalam Bahasa Indonesia… (Enter kirim, Shift+Enter baris baru)"
            class="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-white resize-y"
          />
          <div class="flex gap-2 mt-2">
            <button
              type="button"
              onClick={() => void kirimChat()}
              disabled={!jawabanChat.trim() || !soalAktif || sibukBaris(soalAktif?.kode || '') === 'terjemah'}
              class="flex-1 min-h-11 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-bold"
            >
              Kirim & terjemahkan
            </button>
            <button
              type="button"
              onClick={() => {
                const next = idxTanya + 1;
                if (next < soalTahap.length) { setIdxTanya(next); tanya(soalTahap[next]); }
              }}
              disabled={idxTanya + 1 >= soalTahap.length}
              class="min-h-11 px-3 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white text-[11px] font-bold"
            >
              Lewati
            </button>
          </div>
        </footer>
      </section>

      {/* ── kanan: seluruh soal tahap aktif ──────────────────────────────── */}
      <section class="rounded-card border border-slate-700 bg-slate-900">
        <div class="px-3 py-2 border-b border-slate-700 flex flex-wrap gap-1.5">
          {tahap.map((t, i) => (
            <button
              key={t}
              type="button"
              onClick={() => mulaiTahap(i, tahap, soal)}
              class={`min-h-8 px-2 py-1 rounded-md text-[11px] font-bold border ${i === tahapAktif ? 'bg-violet-600 border-violet-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'}`}
            >
              {i + 1}. {t}
            </button>
          ))}
        </div>

        {soalTahap.length === 0 ? (
          <p class="p-4 text-[12px] text-slate-400">{memuat ? 'Memuat…' : galat || 'Tidak ada soal pada tahap ini.'}</p>
        ) : (
          <ul class="divide-y divide-slate-800">
            {soalTahap.map((s, i) => {
              const d = draft[s.kode] || { jp: '', romaji: '', arti: '' };
              const status = sibukBaris(s.kode);
              return (
                <li key={s.kode} class={`p-3 ${i === idxTanya ? 'bg-slate-800/40' : ''}`}>
                  <div class="flex items-start gap-3">
                    <span class="text-[11px] text-slate-500 w-5 text-right shrink-0">{i + 1}</span>
                    <div class="min-w-0 flex-1">
                      <p class="text-[14px] text-white leading-snug" lang="ja">{s.jp}</p>
                      <p class="text-[11.5px] text-slate-400">{s.romaji}</p>
                      <p class="text-[12px] text-slate-300">{s.arti}</p>
                      {s.sinkron_cv && (
                        <p class="mt-1 inline-block text-[10px] font-bold text-emerald-300 border border-emerald-700 rounded px-1.5 py-0.5">
                          tersambung CV — {s.kolom_cv}
                        </p>
                      )}
                    </div>
                  </div>

                  <div class="mt-2 grid gap-1.5">
                    <label class="grid grid-cols-[68px_1fr] gap-2 items-center">
                      <span class="text-[10px] uppercase tracking-wide text-slate-400">日本語</span>
                      <textarea
                        rows={2}
                        lang="ja"
                        value={d.jp}
                        onInput={(e) => {
                          const v = (e.target as HTMLTextAreaElement).value;
                          setDraft((x) => ({ ...x, [s.kode]: { ...d, jp: v } }));
                        }}
                        onBlur={() => void simpanBaris(s.kode, true)}
                        placeholder="tulis jawaban Jepang…"
                        class="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1 text-[13px] text-white"
                      />
                    </label>
                    <label class="grid grid-cols-[68px_1fr] gap-2 items-center">
                      <span class="text-[10px] uppercase tracking-wide text-slate-400">Cara baca</span>
                      <input
                        value={d.romaji}
                        onInput={(e) => {
                          const v = (e.target as HTMLInputElement).value;
                          setDraft((x) => ({ ...x, [s.kode]: { ...d, romaji: v } }));
                        }}
                        onBlur={() => void simpanBaris(s.kode, true)}
                        placeholder="romaji…"
                        class="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1 text-[12.5px] text-white"
                      />
                    </label>
                    <label class="grid grid-cols-[68px_1fr] gap-2 items-center">
                      <span class="text-[10px] uppercase tracking-wide text-slate-400">Indonesia</span>
                      <input
                        value={d.arti}
                        onInput={(e) => {
                          const v = (e.target as HTMLInputElement).value;
                          setDraft((x) => ({ ...x, [s.kode]: { ...d, arti: v } }));
                        }}
                        onBlur={() => void simpanBaris(s.kode, true)}
                        placeholder="arti jawaban…"
                        class="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1 text-[12.5px] text-white"
                      />
                    </label>
                  </div>

                  <div class="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void terjemahkan(s.kode)}
                      disabled={status === 'terjemah' || !d.arti.trim()}
                      class="min-h-9 px-2.5 rounded-md bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white text-[11px] font-bold"
                    >
                      {status === 'terjemah' ? 'Menerjemahkan…' : 'Isi Jepang otomatis'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void simpanBaris(s.kode)}
                      disabled={status === 'simpan'}
                      class="min-h-9 px-2.5 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-[11px] font-bold"
                    >
                      {status === 'simpan' ? 'Menyimpan…' : 'Simpan'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setContoh((c) => ({ ...c, [s.kode]: !c[s.kode] }))}
                      class="min-h-9 px-2.5 rounded-md border border-emerald-700 text-emerald-300 text-[11px] font-bold"
                    >
                      {contoh[s.kode] ? 'Sembunyikan contoh' : 'Contoh jawaban'}
                    </button>
                    {i !== idxTanya && (
                      <button
                        type="button"
                        onClick={() => { setIdxTanya(i); tanya(s); }}
                        class="min-h-9 px-2.5 rounded-md border border-slate-600 text-slate-300 text-[11px] font-bold"
                      >
                        Tanya ini di chat
                      </button>
                    )}
                  </div>

                  {contoh[s.kode] && (
                    <div class="mt-2 border-l-2 border-emerald-700 pl-2.5 text-[12.5px] text-emerald-200/90 space-y-1">
                      <p lang="ja" class="text-[13.5px]">{s.jawaban_jp}</p>
                      <p class="text-emerald-200/70">{s.jawaban_romaji}</p>
                      <p>{s.jawaban_arti}</p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
