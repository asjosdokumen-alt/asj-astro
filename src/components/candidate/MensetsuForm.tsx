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
import { Fragment } from 'preact';
import { showToast } from '../Toast';
import { authStore } from '../../store/authReactive';
import { apiClient, type ApiError } from '../../lib/apiClient';
import { validate, kandidatLoginSchema } from '../../lib/schemas';
import { opsiUntukSoal } from '../../lib/mensetsuOpsi';
import { ucapkanJepang, LAJU_LAMBAT } from '../../lib/ttsJepang';
import SimulasiMensetsu from './SimulasiMensetsu';
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
  /** Status siswa ASJ. `null`/absen = tidak bisa dipastikan, lencana disembunyikan. */
  isVip?: boolean | null;
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
  /**
   * Panel admin: lewati gerbang login.
   *
   * Sama seperti `AiCvForm adminMode` — admin sudah punya sesi sendiri, dan
   * backend memeriksa kepemilikan lewat `isOwnerOrAdmin`, jadi menahan admin di
   * gerbang password kandidat hanya membuat fitur ini tidak bisa dipakai untuk
   * mendampingi siswa. Tanpa mode ini, `/wawancara` sebagai admin akan memakai
   * WA admin sendiri, bukan WA kandidat yang sedang dibuka.
   */
  adminMode?: boolean;
}

type Bidang = 'jp' | 'romaji' | 'arti';
type Draft = Record<string, Record<Bidang, string>>;

/* ── draft lokal (auto-save perangkat) ──────────────────────────────────────
 *
 * KENAPA ADA, PADAHAL SERVER SUDAH MENYIMPAN
 * ------------------------------------------
 * `simpanBaris` menulis ke DB saat `onBlur`. Artinya satu-satunya yang bisa
 * hilang adalah KOLOM YANG SEDANG DIKETIK ketika HP mati, tab ditutup, atau
 * halaman ter-refresh — dan justru kolom itu yang panjang (jawaban Jiko PR
 * bisa 4-5 baris).
 *
 * ATURAN GABUNG (jangan dibalik tanpa alasan)
 * -------------------------------------------
 * Saat memuat, server MENANG kalau kolomnya sudah berisi; draft lokal hanya
 * MENGISI YANG KOSONG. Kebalikannya (lokal selalu menang) akan menimpa koreksi
 * yang dilakukan admin di CV untuk soal yang tersambung kolom CV, dan itu
 * kerusakan yang tidak terlihat sampai siswa membuka halaman ini lagi.
 *
 * Kunci per-WA dan berversi, pola yang sama dengan `asj_kotoba_v1:`: draft satu
 * siswa tidak boleh muncul di perangkat siswa lain yang memakai HP bersama.
 */
const KUNCI_DRAFT = 'asj_mensetsu_v1:';

function bacaDraftLokal(wa: string): Draft {
  try {
    const raw = localStorage.getItem(KUNCI_DRAFT + wa);
    if (!raw) return {};
    const p = JSON.parse(raw) as unknown;
    if (!p || typeof p !== 'object') return {};
    const hasil: Draft = {};
    for (const [kode, nilai] of Object.entries(p as Record<string, unknown>)) {
      if (!nilai || typeof nilai !== 'object') continue;
      const v = nilai as Record<string, unknown>;
      hasil[kode] = {
        jp: typeof v.jp === 'string' ? v.jp : '',
        romaji: typeof v.romaji === 'string' ? v.romaji : '',
        arti: typeof v.arti === 'string' ? v.arti : '',
      };
    }
    return hasil;
  } catch {
    /* Mode privat / kuota penuh: fitur ini pelengkap, bukan syarat. */
    return {};
  }
}

function tulisDraftLokal(wa: string, draft: Draft): void {
  try {
    localStorage.setItem(KUNCI_DRAFT + wa, JSON.stringify(draft));
  } catch {
    /* Sama seperti di atas: gagal menyimpan draft tidak boleh memerahkan form. */
  }
}

/**
 * Gabungkan draft server dengan draft lokal: server menang, lokal mengisi yang
 * kosong. Mengembalikan juga berapa kolom yang benar-benar dipulihkan, supaya
 * pemanggil bisa memberi tahu siswa alih-alih diam-diam mengisi teks yang ia
 * tidak ingat menulisnya.
 */
function gabungDraft(server: Draft, lokal: Draft): { draft: Draft; dipulihkan: number } {
  const hasil: Draft = { ...server };
  let dipulihkan = 0;
  for (const [kode, v] of Object.entries(lokal)) {
    const ada = hasil[kode];
    if (!ada) continue;
    const kosongDiServer = !ada.jp.trim() && !ada.romaji.trim() && !ada.arti.trim();
    const adaIsiLokal = !!(v.jp.trim() || v.romaji.trim() || v.arti.trim());
    if (kosongDiServer && adaIsiLokal) {
      hasil[kode] = v;
      dipulihkan++;
    }
  }
  return { draft: hasil, dipulihkan };
}

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

export default function MensetsuForm({ waTarget = '', adminMode = false }: Props) {
  const auth = authStore.get();
  // Admin tidak melewati gerbang password kandidat (lihat catatan `adminMode`).
  const [loginGate, setLoginGate] = useState(!adminMode && !auth.isLoggedIn);
  const [gateWa, setGateWa] = useState(waFromUrl() || waTarget);
  const [gatePass, setGatePass] = useState('');
  const [gateMsg, setGateMsg] = useState('');
  // Admin yang membuka /wawancara?wa=… harus melihat kandidat ITU, bukan dirinya
  // sendiri — `auth.wa` milik admin. Kandidat biasa tetap memakai sesinya.
  const [wa, setWa] = useState(
    waTarget || (auth.role === 'admin' ? waFromUrl() : '') || (auth.isLoggedIn ? auth.wa || '' : ''),
  );

  const [memuat, setMemuat] = useState(false);
  const [galat, setGalat] = useState('');
  /** Status siswa ASJ dari server. `null` = belum/tidak diketahui. */
  const [vip, setVip] = useState<boolean | null>(null);
  const [tahap, setTahap] = useState<string[]>([]);
  const [soal, setSoal] = useState<Soal[]>([]);
  const [draft, setDraft] = useState<Draft>({});
  const [tahapAktif, setTahapAktif] = useState(0);
  const [sibuk, setSibuk] = useState<Record<string, Bidang | 'terjemah' | 'simpan' | ''>>({});
  const [contoh, setContoh] = useState<Record<string, boolean>>({});
  /**
   * Baris mana yang sedang dibacakan mesin suara. Kunci = `<kode>:<bagian>`
   * (`soal`, `contoh`, `jawab`) — satu kunci per tombol, supaya menekan tombol
   * pertanyaan tidak ikut menyalakan tombol jawaban di baris yang sama.
   */
  const [memutar, setMemutar] = useState<Record<string, boolean>>({});
  /** Tab aktif: 'bank' = menyiapkan naskah, 'simulasi' = latihan berwaktu. */
  const [mode, setMode] = useState<'bank' | 'simulasi'>('bank');
  /**
   * Lembar cetak sedang menampilkan SELURUH tahap (1–13), bukan tahap aktif.
   *
   * Hanya hidup selama dialog cetak: `cetak()` menyalakannya, menunggu dua
   * frame supaya browser sempat menata lembar yang jauh lebih panjang, lalu
   * mengembalikannya. Tanpa jeda itu `window.print()` memotret DOM lama dan
   * yang tercetak tetap satu tahap.
   */
  const [cetakSemua, setCetakSemua] = useState(false);

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
        if (adminMode) {
          setGalat('Sesi admin tidak valid. Muat ulang halaman lalu masuk lagi.');
          return;
        }
        setLoginGate(true);
        setGateMsg('Sesi tidak valid. Silakan masuk lagi.');
        return;
      }
      /* Bukan siswa ASJ: server sengaja menjawab `success:false` + `isVip:false`
         TANPA bank soal. Jangan lanjut ke "Bank soal kosong. Hubungi admin." —
         pesan itu menyalahkan bank, padahal yang kurang adalah status siswa. */
      if (d.success === false && d.isVip === false) {
        setVip(false);
        setSoal([]);
        setTahap([]);
        return;
      }
      const daftar = Array.isArray(d.soal) ? d.soal : [];
      setSoal(daftar);
      setVip(typeof d.isVip === 'boolean' ? d.isVip : null);
      setTahap(Array.isArray(d.tahap) ? d.tahap : []);
      const awal: Draft = {};
      for (const s of daftar) {
        awal[s.kode] = {
          jp: s.jawabanku?.jp || '',
          romaji: s.jawabanku?.romaji || '',
          arti: s.jawabanku?.arti || '',
        };
      }
      /* Draft perangkat hanya MENGISI kolom yang kosong di server — lihat
         "ATURAN GABUNG" di kepala berkas. */
      const { draft: gabungan, dipulihkan } = gabungDraft(awal, bacaDraftLokal(nomor));
      setDraft(gabungan);
      if (dipulihkan > 0) showToast(t('wawancara.draft_dipulihkan'), 'info');
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
    // `pesanSoal` murni (tanpa state). `adminMode` DIPAKAI di dalam (cabang
    // `sessionInvalid`), jadi ia harus jadi dependensi — tanpa itu callback
    // menyimpan nilai lama dan admin bisa terlempar ke gerbang password.
  }, [adminMode]);

  useEffect(() => {
    if (!loginGate && wa) void muat(wa);
  }, [loginGate, wa, muat]);

  /**
   * Tulis draft ke perangkat, ditunda 400 ms.
   *
   * Tanpa penundaan ini setiap ketikan menulis seluruh draft (177 soal) ke
   * localStorage — pada HP kelas bawah itu membuat mengetik terasa patah-patah.
   * 400 ms cukup untuk menyatukan satu kata, dan tetap jauh lebih cepat
   * daripada risiko kehilangan ketikan.
   */
  useEffect(() => {
    if (!wa) return;
    if (!Object.keys(draft).length) return;
    const id = window.setTimeout(() => tulisDraftLokal(wa, draft), 400);
    return () => window.clearTimeout(id);
  }, [wa, draft]);

  /**
   * Bacakan satu potong teks Jepang.
   *
   * `ucapkanJepang` mengembalikan `false` saat perangkat tidak punya mesin suara
   * atau teksnya kosong — di situlah satu-satunya pesan muncul. Tombolnya
   * sendiri TIDAK disembunyikan saat tidak didukung: tombol yang hilang membuat
   * siswa mengira fiturnya belum jadi, sedangkan pesan "aktifkan paket suara
   * Jepang" memberi tahu apa yang harus dilakukan.
   */
  const putar = (kunci: string, teks: string, laju?: number) => {
    const ok = ucapkanJepang(teks, {
      laju,
      onSelesai: () => setMemutar((m) => ({ ...m, [kunci]: false })),
    });
    if (!ok) {
      showToast(t('wawancara.suara_tidak_ada'), 'error');
      return;
    }
    setMemutar((m) => ({ ...m, [kunci]: true }));
  };

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
      <section aria-label={t('wawancara.gate_title')} class="max-w-md mx-auto my-8 rounded-card border border-line bg-surface p-6">
        <h2 class="text-base font-black text-fg mb-1">{t('wawancara.gate_title')}</h2>
        <p class="text-[12px] text-fg-muted mb-4">
          Masuk dengan nomor WhatsApp dan password akun Anda untuk membuka latihan wawancara.
        </p>
        <label for="mensetsu-gate-wa" class="block text-[11px] font-bold text-fg mb-1">Nomor WhatsApp</label>
        <input
          id="mensetsu-gate-wa"
          type="tel"
          value={gateWa}
          onInput={(e) => setGateWa((e.target as HTMLInputElement).value)}
          placeholder="08xxxxxxxxxx"
          class="w-full mb-3 rounded-lg bg-surface-raised border border-line px-3 py-2 text-sm text-fg"
        />
        <label for="mensetsu-gate-pass" class="block text-[11px] font-bold text-fg mb-1">Password</label>
        <input
          id="mensetsu-gate-pass"
          type="password"
          value={gatePass}
          onInput={(e) => setGatePass((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => { if ((e as KeyboardEvent).key === 'Enter') void gateLogin(); }}
          class="w-full mb-3 rounded-lg bg-surface-raised border border-line px-3 py-2 text-sm text-fg"
        />
        {gateMsg && <p class="text-[12px] text-rose-400 mb-3">{gateMsg}</p>}
        <button type="button" onClick={() => void gateLogin()} class="w-full min-h-11 rounded-lg bg-accent-violet hover:bg-accent-violet/90 text-canvas text-sm font-bold">
          Masuk
        </button>
        {/* Jalan keluar untuk kandidat yang nomornya BELUM terdaftar. Tanpa ini
            mereka melihat "Password salah atau akun tidak ditemukan." dan tidak
            punya tempat menuju — pendaftaran hanya ada di menu atas. Pesan
            galatnya sendiri sengaja TIDAK dibedakan (anti-enumerasi, S9). */}
        <p class="mt-3 text-center text-[12px] text-fg-muted">
          {t('auth.belum_punya_akun')}{' '}
          <button
            type="button"
            data-testid="mensetsu-gate-daftar"
            onClick={() => window.dispatchEvent(new CustomEvent('asj-kandidat-register'))}
            class="font-bold text-accent-violet underline hover:no-underline"
          >
            {t('header.register')}
          </button>
        </p>
      </section>
    );
  }

  /* ── render: khusus siswa ASJ (VIP / KELAS) ────────────────────────────── */
  /**
   * Keputusan pemilik 2026-10-26, membalik penutupan 2026-10-25.
   *
   * Kronologinya penting supaya tidak ada yang "memperbaiki" ini ke arah lain:
   * 25 Okt halaman ditutup untuk SEMUA non-admin ("biar untuk internal dulu"),
   * lalu pemilik menemukan muridnya yang VIP (Budi Trisnanto, ASJ00188) tetap
   * tidak bisa masuk — karena kartu penutup tidak pernah membaca flag VIP.
   * "Internal" ternyata berarti SISWA, jadi sekarang:
   *
   *   1. belum login        ⇒ gerbang login (blok di atas);
   *   2. login, bukan siswa ⇒ kartu ini;
   *   3. login, siswa ASJ   ⇒ bank soal.
   *
   * Status siswa dihitung SERVER (`statusVip` di `_lib/wawancara/bank.ts`,
   * predikat yang sama dengan lencana "Siswa Resmi ASJ"). Sebelum `muat()`
   * selesai nilainya `null` — JANGAN putuskan apa pun saat belum tahu, kalau
   * tidak siswa VIP melihat kedipan kartu ini sebelum bank soalnya datang.
   *
   * Penjaga SEBENARNYA tetap di server (`surfaces/ai.ts`): `getBankWawancara`
   * tidak mengirim satu soal pun untuk non-siswa, dan simpan/terjemah menolak.
   * Kartu ini hanya cermin supaya orang tidak menebak-nebak.
   */
  if (!adminMode && auth.role !== 'admin' && vip === false) {
    return (
      <section
        aria-label={t('wawancara.khusus_vip_judul')}
        data-testid="mensetsu-khusus-vip"
        class="max-w-md mx-auto my-8 rounded-card border border-line bg-surface p-6 text-center"
      >
        <h2 class="text-base font-black text-fg mb-2">{t('wawancara.khusus_vip_judul')}</h2>
        <p class="text-[12.5px] text-fg-muted leading-relaxed">{t('wawancara.khusus_vip_isi')}</p>
      </section>
    );
  }

  /* ── render: utama ─────────────────────────────────────────────────────── */
  const sibukBaris = (kode: string) => sibuk[kode] || '';

  /**
   * Baris yang ditampilkan lembar cetak.
   *
   * Mode satu tahap: soal tahap aktif, bernomor 1..n.
   * Mode semua tahap: seluruh bank, dikelompokkan per tahap, nomor mulai dari 1
   * di setiap tahap, dan tiap kelompok diberi judul. `judul` kosong = bukan
   * awal tahap, jadi tidak ada judul ganda.
   */
  const barisTampil = cetakSemua
    ? tahap.flatMap((nama, ti) => {
        const daftar = soal.filter((x) => x.tahap === nama);
        return daftar.map((s, i) => ({ s, nomor: i + 1, judul: i === 0 ? `${ti + 1}. ${nama}` : '' }));
      })
    : soalTahap.map((s, i) => ({ s, nomor: i + 1, judul: '' }));

  /**
   * Cetak, lalu kembalikan tampilan.
   *
   * Dua `requestAnimationFrame` BUKAN hiasan: `window.print()` memotret DOM
   * yang sudah ditata, dan lembar 177 soal butuh satu frame penuh untuk
   * berubah dari 1 tahap menjadi 13. Satu frame saja masih mencetak versi lama.
   */
  const cetak = (semua: boolean) => {
    setCetakSemua(semua);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.print();
        setCetakSemua(false);
      });
    });
  };

  return (
    <div>
      {/* ── Tab mode ──
          DUA mode, satu halaman. Halaman terpisah berarti gerbang "khusus
          siswa ASJ" yang ketiga — dan gerbang yang bisa berbeda diam-diam
          adalah persis yang diperingatkan di kepala `wawancara.astro`.
          Lembar cetak (`[data-cetak]`) hanya ada di tab Bank Soal, jadi
          `cetak-sembunyi` di sini cukup: mencetak dari tab Simulasi tidak
          masuk akal. */}
      <div class="cetak-sembunyi mb-3 grid grid-cols-2 gap-1.5 rounded-control border border-line bg-surface-sunken p-1">
        <button
          type="button"
          onClick={() => setMode('bank')}
          aria-pressed={mode === 'bank'}
          data-testid="tab-bank"
          class={`min-h-11 rounded-[0.6rem] text-[12px] font-bold transition-colors motion-reduce:transition-none ${
            mode === 'bank' ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted'
          }`}
        >
          {t('simulasi.tab_bank')}
        </button>
        <button
          type="button"
          onClick={() => setMode('simulasi')}
          aria-pressed={mode === 'simulasi'}
          data-testid="tab-simulasi"
          class={`min-h-11 rounded-[0.6rem] text-[12px] font-bold transition-colors motion-reduce:transition-none ${
            mode === 'simulasi' ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted'
          }`}
        >
          {t('simulasi.tab_simulasi')}
        </button>
      </div>

      {mode === 'simulasi' ? (
        <SimulasiMensetsu soal={soal} draft={draft} onKeBank={() => setMode('bank')} />
      ) : (
    <div class="grid grid-cols-1 lg:grid-cols-[35%_65%] gap-3 items-start">
      {/* ── kiri: AI menanyakan soal ─────────────────────────────────────── */}
      <section class="cetak-sembunyi rounded-card border border-line bg-surface flex flex-col lg:sticky lg:top-2 h-[70vh] lg:h-[calc(100vh-120px)]">
        <header class="px-3 py-2 border-b border-line flex items-center justify-between">
          <div>
            <h2 class="text-sm font-black text-fg">Qween Jeklin — Latihan Mensetsu</h2>
            <p class="text-[11px] text-fg-muted">
              {tahapSekarang ? `Tahap ${tahapAktif + 1}/${tahap.length} · ${tahapSekarang}` : 'Memuat…'}
            </p>
            {/* Status siswa ASJ. INFORMASI, bukan gerbang: lihat catatan di
                `_lib/wawancara/bank.ts` — mengunci halaman ini berdasarkan tag
                akan memutus tautan yang sudah dikirim ke kandidat non-VIP. */}
            {vip !== null && (
              <span
                class={`mt-1 inline-block rounded border px-1.5 py-0.5 text-[10px] font-bold ${vip ? 'border-accent-emerald text-accent-emerald' : 'border-line text-fg-subtle'}`}
              >
                {vip ? t('ui.badge_official') : t('wawancara.belum_vip')}
              </span>
            )}
          </div>
          {admin && (
            <button type="button" onClick={() => void salinLink()} class="min-h-9 px-2 py-1 rounded-lg bg-surface-raised hover:bg-surface-sunken text-fg border border-line text-[11px] font-bold">
              Link siswa
            </button>
          )}
        </header>

        <div ref={chatRef} class="flex-1 overflow-y-auto px-3 py-3 space-y-2">
          {chat.map((m, i) => (
            <div key={i} class={m.dari === 'ai' ? 'text-[12.5px] text-fg whitespace-pre-wrap rounded-lg bg-surface-raised px-3 py-2' : 'text-[12.5px] text-fg whitespace-pre-wrap rounded-lg bg-surface-raised px-3 py-2 ml-6'}>
              {m.teks}
            </div>
          ))}
          {memuat && <p class="text-[12px] text-fg-muted">{t('wawancara.loading_bank')}</p>}
          {galat && <p class="text-[12px] text-rose-400">{galat}</p>}
        </div>

        <footer class="border-t border-line p-2">
          <textarea
            rows={2}
            value={jawabanChat}
            onInput={(e) => setJawabanChat((e.target as HTMLTextAreaElement).value)}
            onKeyDown={(e) => {
              const ev = e as KeyboardEvent;
              if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); void kirimChat(); }
            }}
            placeholder="Jawab dalam Bahasa Indonesia… (Enter kirim, Shift+Enter baris baru)"
            class="w-full rounded-lg bg-surface-raised border border-line px-3 py-2 text-sm text-fg resize-y"
          />
          <div class="flex gap-2 mt-2">
            <button
              type="button"
              onClick={() => void kirimChat()}
              disabled={!jawabanChat.trim() || !soalAktif || sibukBaris(soalAktif?.kode || '') === 'terjemah'}
              class="flex-1 min-h-11 rounded-lg bg-accent-violet hover:bg-accent-violet/90 disabled:opacity-50 text-canvas text-sm font-bold"
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
              class="min-h-11 px-3 rounded-lg bg-surface-raised hover:bg-surface-sunken disabled:opacity-40 text-fg border border-line text-[11px] font-bold"
            >
              Lewati
            </button>
          </div>
        </footer>
      </section>

      {/* ── kanan: seluruh soal tahap aktif ──────────────────────────────── */}
      {/* `data-cetak` = satu-satunya bagian yang boleh tercetak. Aturan
          cetaknya ada di `styles/layout.css` §5b, BUKAN di halaman: panel ini
          dipakai di `/wawancara` DAN di overlay admin, dan aturan yang hanya
          menempel di halaman membuat tombol Cetak/PDF dari admin mencetak
          seluruh panel admin beserta chat (laporan pemilik 2026-10-25). */}
      <section data-cetak class="rounded-card border border-line bg-surface">
        <div class="cetak-sembunyi px-3 py-2 border-b border-line flex flex-wrap gap-1.5">
          {tahap.map((t, i) => (
            <button
              key={t}
              type="button"
              onClick={() => mulaiTahap(i, tahap, soal)}
              class={`min-h-8 px-2 py-1 rounded-md text-[11px] font-bold border ${i === tahapAktif ? 'bg-accent-violet border-accent-violet text-canvas' : 'bg-surface-raised border-line text-fg hover:bg-surface-sunken'}`}
            >
              {i + 1}. {t}
            </button>
          ))}
          <div class="ml-auto flex gap-1.5">
            <button
              type="button"
              data-cetak-aksi="tahap"
              onClick={() => cetak(false)}
              class="min-h-8 px-2 py-1 rounded-md text-[11px] font-bold border border-line bg-surface-raised text-fg hover:bg-surface-sunken"
            >
              {t('wawancara.cetak_tahap')}
            </button>
            <button
              type="button"
              data-cetak-aksi="semua"
              onClick={() => cetak(true)}
              title={`${tahap.length} tahap, ${soal.length} soal`}
              class="min-h-8 px-2 py-1 rounded-md text-[11px] font-bold border border-accent-violet text-accent-violet hover:bg-surface-sunken"
            >
              {t('wawancara.cetak_semua')}
            </button>
          </div>
        </div>

        {/* Kepala lembar cetak. Di layar tidak tampil (`cetak-saja`), di kertas
            menjadi satu-satunya penanda tahap — halaman admin tidak punya judul
            yang ikut tercetak. */}
        {tahap.length > 0 && (
          <div class="cetak-saja px-3 pt-3 pb-1">
            <p class="text-[10px] uppercase tracking-wide text-fg-muted">{t('toolbar.mensetsu')}</p>
            <h2 class="text-[15px] font-black text-fg">
              {cetakSemua ? t('wawancara.semua_tahap') : tahapSekarang}
            </h2>
            <p class="text-[11px] text-fg-muted">
              {cetakSemua
                ? `${tahap.length} tahap · ${soal.length} soal`
                : `Tahap ${tahapAktif + 1} dari ${tahap.length} · ${soalTahap.length} soal`}
            </p>
          </div>
        )}

        {barisTampil.length === 0 ? (
          <p class="p-4 text-[12px] text-fg-muted">{memuat ? 'Memuat…' : galat || 'Tidak ada soal pada tahap ini.'}</p>
        ) : (
          <ul class="divide-y divide-line">
            {barisTampil.map(({ s, nomor, judul }) => {
              const d = draft[s.kode] || { jp: '', romaji: '', arti: '' };
              const status = sibukBaris(s.kode);
              return (
                <Fragment key={s.kode}>
                  {/* Judul kelompok saat mencetak SEMUA tahap. Di mode satu
                      tahap `judul` selalu kosong, jadi tidak pernah muncul. */}
                  {judul && (
                    <li class="cetak-tahap px-3 pt-4 pb-1 text-[12px] font-black text-fg">{judul}</li>
                  )}
                  <li class={`p-3 ${s.kode === soalAktif?.kode ? 'bg-surface-raised' : ''}`}>
                    <div class="flex items-start gap-3">
                      <span class="text-[11px] text-fg-subtle w-5 text-right shrink-0">{nomor}</span>
                    <div class="min-w-0 flex-1">
                      <p class="text-[14px] text-fg leading-snug" lang="ja">{s.jp}</p>
                      <p class="text-[11.5px] text-fg-muted">{s.romaji}</p>
                      <p class="text-[12px] text-fg">{s.arti}</p>
                      {/* Dengar soal: pertanyaan diucapkan pewawancara, bukan
                          dibaca siswa. Dua laju karena siswa N5/N4 butuh
                          kalimat yang lebih pelan sebelum bisa mengikuti
                          kecepatan normal. */}
                      <div class="cetak-sembunyi mt-1 flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          data-testid={`dengar-soal-${s.kode}`}
                          aria-label={t('wawancara.dengar')}
                          aria-pressed={!!memutar[`${s.kode}:soal`]}
                          onClick={() => putar(`${s.kode}:soal`, s.jp)}
                          class="inline-flex items-center gap-1 rounded-md border border-line bg-surface-raised px-2 py-1 text-[11px] font-bold text-fg-muted"
                        >
                          <span aria-hidden="true">{memutar[`${s.kode}:soal`] ? '🔉' : '🔊'}</span>
                          {t('wawancara.dengar')}
                        </button>
                        <button
                          type="button"
                          data-testid={`dengar-soal-lambat-${s.kode}`}
                          aria-label={t('wawancara.dengar_lambat')}
                          aria-pressed={!!memutar[`${s.kode}:soal-lambat`]}
                          onClick={() => putar(`${s.kode}:soal-lambat`, s.jp, LAJU_LAMBAT)}
                          class="inline-flex items-center gap-1 rounded-md border border-line bg-surface-raised px-2 py-1 text-[11px] font-bold text-fg-muted"
                        >
                          <span aria-hidden="true">🐢</span>
                          {t('wawancara.dengar_lambat')}
                        </button>
                      </div>
                      {s.sinkron_cv && (
                        <p class="cetak-sembunyi mt-1 inline-block text-[10px] font-bold text-accent-emerald border border-accent-emerald rounded px-1.5 py-0.5">
                          tersambung CV — {s.kolom_cv}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Salinan cetak dari jawaban. Bukan hiasan: `<textarea rows={2}>`
                      memotong jawaban yang lebih panjang saat dicetak (Chrome
                      tidak menggulung isi kontrol form di kertas), sedangkan
                      lembar ini dipakai untuk menghafal — jadi jawabannya harus
                      utuh. Kolom kosong tetap bergaris supaya bisa ditulis tangan. */}
                  <div class="cetak-saja mt-1">
                    <p class="cetak-baris">
                      <span class="cetak-kunci">日本語</span>
                      <span class="cetak-nilai" lang="ja">{d.jp}</span>
                    </p>
                    <p class="cetak-baris">
                      <span class="cetak-kunci">Cara baca</span>
                      <span class="cetak-nilai">{d.romaji}</span>
                    </p>
                    <p class="cetak-baris">
                      <span class="cetak-kunci">Indonesia</span>
                      <span class="cetak-nilai">{d.arti}</span>
                    </p>
                  </div>

                  {/* Soal sifat (長所/短所/特技): siswa memilih dari daftar materi
                      LPK, lalu cara baca + artinya terisi. Versi Jepangnya
                      sengaja TIDAK diisi otomatis — itu bagian yang harus
                      dilatih, dan tombol "Isi Jepang otomatis" ada untuk itu. */}
                  {opsiUntukSoal(s.jp) && (
                    <label class="cetak-sembunyi mt-2 grid grid-cols-[68px_1fr] gap-2 items-center">
                      <span class="text-[10px] uppercase tracking-wide text-fg-muted">{t('wawancara.pilih_sifat')}</span>
                      <select
                        class="w-full rounded-md bg-surface-sunken border border-line px-2 py-1 text-[12.5px] text-fg"
                        onChange={(e) => {
                          const el = e.target as HTMLSelectElement;
                          const opsi = opsiUntukSoal(s.jp) || [];
                          const o = opsi[Number(el.value)];
                          if (!o) return;
                          setDraft((x) => ({
                            ...x,
                            [s.kode]: { jp: d.jp, romaji: o.ro, arti: o.arti },
                          }));
                        }}
                      >
                        <option value="">— pilih dari daftar ({(opsiUntukSoal(s.jp) || []).length} pilihan) —</option>
                        {(opsiUntukSoal(s.jp) || []).map((o, oi) => (
                          <option value={oi}>{o.ro} — {o.arti}</option>
                        ))}
                      </select>
                    </label>
                  )}

                  <div class="cetak-sembunyi mt-2 grid gap-1.5">
                    <label class="grid grid-cols-[68px_1fr] gap-2 items-center">
                      <span class="text-[10px] uppercase tracking-wide text-fg-muted">日本語</span>
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
                        class="w-full rounded-md bg-surface-sunken border border-line px-2 py-1 text-[13px] text-fg"
                      />
                    </label>
                    <label class="grid grid-cols-[68px_1fr] gap-2 items-center">
                      <span class="text-[10px] uppercase tracking-wide text-fg-muted">Cara baca</span>
                      <input
                        value={d.romaji}
                        onInput={(e) => {
                          const v = (e.target as HTMLInputElement).value;
                          setDraft((x) => ({ ...x, [s.kode]: { ...d, romaji: v } }));
                        }}
                        onBlur={() => void simpanBaris(s.kode, true)}
                        placeholder="romaji…"
                        class="w-full rounded-md bg-surface-sunken border border-line px-2 py-1 text-[12.5px] text-fg"
                      />
                    </label>
                    <label class="grid grid-cols-[68px_1fr] gap-2 items-center">
                      <span class="text-[10px] uppercase tracking-wide text-fg-muted">Indonesia</span>
                      <input
                        value={d.arti}
                        onInput={(e) => {
                          const v = (e.target as HTMLInputElement).value;
                          setDraft((x) => ({ ...x, [s.kode]: { ...d, arti: v } }));
                        }}
                        onBlur={() => void simpanBaris(s.kode, true)}
                        placeholder="arti jawaban…"
                        class="w-full rounded-md bg-surface-sunken border border-line px-2 py-1 text-[12.5px] text-fg"
                      />
                    </label>

                    {/* Dengar jawaban SENDIRI. Ini bagian yang paling sering
                        terlewat: siswa bisa membaca jawabannya dengan lancar
                        di kepala, lalu tersendat saat harus mengucapkannya.
                        Tombol mati selama kolom Jepang kosong — tidak ada yang
                        bisa dibacakan. */}
                    <div class="flex flex-wrap items-center gap-1.5 pl-[76px]">
                      <button
                        type="button"
                        data-testid={`dengar-jawab-${s.kode}`}
                        aria-label={t('wawancara.dengar_jawaban')}
                        aria-pressed={!!memutar[`${s.kode}:jawab`]}
                        disabled={!d.jp.trim()}
                        onClick={() => putar(`${s.kode}:jawab`, d.jp)}
                        class="inline-flex items-center gap-1 rounded-md border border-line bg-surface-raised px-2 py-1 text-[11px] font-bold text-fg-muted disabled:opacity-40"
                      >
                        <span aria-hidden="true">🗣️</span>
                        {t('wawancara.dengar_jawaban')}
                      </button>
                      <button
                        type="button"
                        data-testid={`dengar-jawab-lambat-${s.kode}`}
                        aria-label={t('wawancara.dengar_lambat')}
                        aria-pressed={!!memutar[`${s.kode}:jawab-lambat`]}
                        disabled={!d.jp.trim()}
                        onClick={() => putar(`${s.kode}:jawab-lambat`, d.jp, LAJU_LAMBAT)}
                        class="inline-flex items-center gap-1 rounded-md border border-line bg-surface-raised px-2 py-1 text-[11px] font-bold text-fg-muted disabled:opacity-40"
                      >
                        <span aria-hidden="true">🐢</span>
                        {t('wawancara.dengar_lambat')}
                      </button>
                    </div>
                  </div>

                  <div class="cetak-sembunyi mt-2 flex flex-wrap items-center gap-2">
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
                      class="min-h-9 px-2.5 rounded-md border border-accent-emerald text-accent-emerald text-[11px] font-bold"
                    >
                      {contoh[s.kode] ? 'Sembunyikan contoh' : 'Contoh jawaban'}
                    </button>
                    {s.kode !== soalAktif?.kode && (
                      <button
                        type="button"
                        onClick={() => {
                          // Saat mencetak SEMUA tahap, soal yang diklik bisa
                          // berasal dari tahap lain: pindahkan dulu tahapnya,
                          // kalau tidak `idxTanya` menunjuk soal yang salah.
                          const ti = tahap.indexOf(s.tahap);
                          if (ti >= 0 && ti !== tahapAktif) setTahapAktif(ti);
                          const si = soal.filter((x) => x.tahap === s.tahap).findIndex((x) => x.kode === s.kode);
                          setIdxTanya(Math.max(0, si));
                          tanya(s);
                        }}
                        class="min-h-9 px-2.5 rounded-md border border-line-strong text-fg text-[11px] font-bold"
                      >
                        Tanya ini di chat
                      </button>
                    )}
                  </div>

                  {contoh[s.kode] && (
                    <div class="mt-2 border-l-2 border-accent-emerald pl-2.5 text-[12.5px] text-accent-emerald space-y-1">
                      <p lang="ja" class="text-[13.5px]">{s.jawaban_jp}</p>
                      <p class="text-fg-muted">{s.jawaban_romaji}</p>
                      <p>{s.jawaban_arti}</p>
                      {/* Contoh jawaban dibacakan supaya siswa mendengar jeda
                          dan akusen kalimatnya, bukan hanya tahu artinya. */}
                      {s.jawaban_jp && (
                        <div class="cetak-sembunyi flex flex-wrap items-center gap-1.5 pt-0.5">
                          <button
                            type="button"
                            data-testid={`dengar-contoh-${s.kode}`}
                            aria-label={t('wawancara.dengar_contoh')}
                            aria-pressed={!!memutar[`${s.kode}:contoh`]}
                            onClick={() => putar(`${s.kode}:contoh`, String(s.jawaban_jp))}
                            class="inline-flex items-center gap-1 rounded-md border border-line bg-surface-raised px-2 py-1 text-[11px] font-bold text-fg-muted"
                          >
                            <span aria-hidden="true">🔊</span>
                            {t('wawancara.dengar_contoh')}
                          </button>
                          <button
                            type="button"
                            data-testid={`dengar-contoh-lambat-${s.kode}`}
                            aria-label={t('wawancara.dengar_lambat')}
                            aria-pressed={!!memutar[`${s.kode}:contoh-lambat`]}
                            onClick={() => putar(`${s.kode}:contoh-lambat`, String(s.jawaban_jp), LAJU_LAMBAT)}
                            class="inline-flex items-center gap-1 rounded-md border border-line bg-surface-raised px-2 py-1 text-[11px] font-bold text-fg-muted"
                          >
                            <span aria-hidden="true">🐢</span>
                            {t('wawancara.dengar_lambat')}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  </li>
                </Fragment>
              );
            })}
          </ul>
        )}
      </section>
        </div>
      )}
    </div>
  );
}
