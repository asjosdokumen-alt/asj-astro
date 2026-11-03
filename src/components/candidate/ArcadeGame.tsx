/**
 * ArcadeGame.tsx — dua game refleks untuk `/arcade`.
 *
 * ASAL RANCANGAN: pemilik mengirim desain + kode HTML siap pakai (2026-11-04).
 * Yang saya AMBIL adalah data dan mekaniknya; yang saya TINGGALKAN adalah
 * bentuk kodenya: berkas itu memuat Tailwind dari CDN dan memakai `onclick`
 * global. Repo ini PWA yang harus jalan OFFLINE dan komponennya Preact — CDN
 * berarti game mati begitu jaringan mati, dan `onclick` global tidak bisa
 * diuji.
 *
 * YANG DIPERTAHANKAN DARI DESAIN
 *   • 2-tap (pilih barang → ketuk rak), bukan drag-and-drop: drag bentrok
 *     dengan scroll dan pull-to-refresh di HP.
 *   • Perintah dirakit acak dari 4 warna × 4 barang × 4 lokasi = 128 variasi.
 *   • Mode Choukai (teks disembunyikan) untuk melatih mendengar.
 *   • Kalimat disusun dengan partikel yang benar (を untuk objek, に untuk
 *     tujuan, で untuk tempat aksi) — bukan sekadar kata ditempel.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '../../store/i18n';
import { authStore } from '../../store/authReactive';
import LoginGate from '../ui/LoginGate';
import { bunyi, ucap } from '../../lib/tts';
import {
  COMBO_SOAL,
  GENBA_ZONA,
  buatPerintah,
  buatPilihan,
  cekGenba,
  kocokKartu,
  kartuBenar,
  type Kartu,
  type Perintah,
  type PilihanGenba,
} from '../../lib/arcade';

const NYAWA_AWAL = 3;
const DURASI_GENBA_MS = 8000;
const KUNCI_LEMAH = 'asj_arcade_lemah';

interface CatatanLemah {
  judul: string;
  detail: string;
}

function bacaLemah(): CatatanLemah[] {
  try {
    const raw = localStorage.getItem(KUNCI_LEMAH);
    return raw ? (JSON.parse(raw) as CatatanLemah[]) : [];
  } catch {
    return [];
  }
}

function simpanLemah(n: CatatanLemah[]): void {
  try {
    localStorage.setItem(KUNCI_LEMAH, JSON.stringify(n.slice(0, 30)));
  } catch {
    /* kuota penuh / mode privat */
  }
}

export default function ArcadeGame() {
  /* Gerbang login — sama seperti /kotoba, /matematika, dan /wawancara.
     BATASNYA JUJUR: ini gerbang KLIEN. Seluruh kata arcade ada di bundel, jadi
     ia menghentikan akses sambil lalu, bukan penyerang; data yang benar-benar
     perlu dijaga harus ditolak di server (lihat `getBankKotoba`). */
  /* Admin tidak digerbang: di `/kotoba` dan `/matematika` admin boleh memeriksa
     permainan tanpa login kandidat, dan `/arcade` harus sama — kalau tidak,
     satu-satunya orang yang perlu MEMERIKSA game justru yang tertahan. */
  const [masuk, setMasuk] = useState(() => {
    const a = authStore.get();
    return !!a.isLoggedIn && (a.role === 'admin' || a.role === 'kandidat');
  });
  const [tab, setTab] = useState<'genba' | 'combo'>('genba');
  const [lemah, setLemah] = useState<CatatanLemah[]>(() => bacaLemah());

  const catatLemah = (judul: string, detail: string) => {
    setLemah((prev) => {
      if (prev.some((x) => x.judul === judul)) return prev;
      const baru = [{ judul, detail }, ...prev];
      simpanLemah(baru);
      return baru;
    });
  };

  /* ── GAME 1 ─────────────────────────────────────────────────────────── */
  const [perintah, setPerintah] = useState<Perintah | null>(null);
  const [pilihan, setPilihan] = useState<PilihanGenba[]>([]);
  const [dipilih, setDipilih] = useState<string | null>(null);
  const [nyawa, setNyawa] = useState(NYAWA_AWAL);
  const [skor, setSkor] = useState(0);
  const [sisa, setSisa] = useState(100);
  const [pesan, setPesan] = useState('');
  const [choukai, setChoukai] = useState(false);
  const [fase, setFase] = useState<'idle' | 'main' | 'selesai'>('idle');
  /**
   * Sedang menunggu perintah berikutnya setelah satu kesalahan.
   *
   * Tanpa penanda ini, `fase` tetap 'main' dan `dipilih` tetap terpasang selama
   * jeda 1,1 detik — sehingga ketukan kedua pada rak yang salah MENGHABISKAN
   * NYAWA LAGI, dan ketukan pada rak yang benar memberi poin setelah permainan
   * sudah menyatakan salah. Ditemukan saat review 2026-11-04.
   */
  const [menunggu, setMenunggu] = useState(false);

  /** Perintah berikutnya. `ronde` dipakai sebagai kunci timer. */
  const berikut = () => {
    const p = buatPerintah();
    setPerintah(p);
    setPilihan(buatPilihan(p));
    setDipilih(null);
    setPesan('');
    setMenunggu(false);
    ucap(p.jp, skor >= 500 ? 1.05 : 0.9);
  };

  const mulai = () => {
    setNyawa(NYAWA_AWAL);
    setSkor(0);
    setMenunggu(false);
    setFase('main');
    berikut();
  };

  /* `gagal` dibuat ulang tiap render; efek timer menyimpannya di ref supaya
     memasukkannya ke daftar dependensi tidak me-restart hitungan setiap render. */
  const gagalRef = useRef<(alasan: string) => void>(() => {});

  /** Satu kali salah: nyawa berkurang, catatan disimpan, perintah berganti. */
  const gagal = (alasan: string) => {
    if (!perintah) return;
    bunyi(false);
    const sisaNyawa = nyawa - 1;
    setNyawa(sisaNyawa);
    setPesan(alasan);
    catatLemah(
      `${perintah.warna.jp} ${perintah.barang.jp} → ${perintah.zona.jp}`,
      `Artinya: ${perintah.warna.id_} ${perintah.barang.id_} ditaruh di ${perintah.zona.id_}`,
    );
    if (sisaNyawa <= 0) {
      setFase('selesai');
      return;
    }
    setMenunggu(true);
    window.setTimeout(() => {
      if (sisaNyawa > 0) berikut();
    }, 1100);
  };
  gagalRef.current = gagal;

  const taruh = (zonaId: string) => {
    if (!perintah || !dipilih || fase !== 'main' || menunggu) return;
    if (cekGenba(perintah, dipilih, zonaId)) {
      bunyi(true);
      setSkor((n) => n + 100);
      berikut();
    } else {
      gagal(`${t('arcade.salah_harusnya')} ${perintah.warna.id_} ${perintah.barang.id_} → ${perintah.zona.id_}`);
    }
  };

  /* Timer per perintah. `perintah` cukup sebagai pemicu: `setPerintah` selalu
     memasang objek BARU, jadi identitasnya berubah di setiap perintah — bahkan
     kalau kebetulan kata-katanya sama. */
  useEffect(() => {
    if (fase !== 'main' || !perintah) return;
    const mulaiMs = Date.now();
    const id = window.setInterval(() => {
      const lewat = Date.now() - mulaiMs;
      const s = Math.max(0, 100 - (lewat / DURASI_GENBA_MS) * 100);
      setSisa(s);
      if (s <= 0) {
        window.clearInterval(id);
        /* Lewat `gagal()` — BUKAN penurunan nyawa sendiri. Versi pertama saya
           hanya mengurangi nyawa di sini, tanpa memanggil perintah berikutnya,
           sehingga siswa yang kehabisan waktu dengan nyawa masih tersisa
           terkurung di layar yang sama dengan sumbu 0 dan tidak bisa apa-apa. */
        gagalRef.current(t('arcade.waktu_habis'));
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [fase, perintah]);

  /* ── GAME 2 ─────────────────────────────────────────────────────────── */
  const [soalIdx, setSoalIdx] = useState(0);
  const [langkah, setLangkah] = useState(0);
  const [kartu, setKartu] = useState<Kartu[]>([]);
  const [tray, setTray] = useState<string[]>([]);
  const [kombo, setKombo] = useState(1);
  const [balas, setBalas] = useState('');
  const [skorCombo, setSkorCombo] = useState(0);
  /**
   * Tingkat kesulitan Combo.
   *
   * `normal` mewarnai kartu menurut jenis kata (partikel kuning, benda biru,
   * kerja merah) — dan itu ternyata MEMBERI JAWABAN: siswa bisa memilih kartu
   * kuning berikutnya tanpa tahu partikel mana yang benar. `sulit` menghapus
   * warna itu, jadi partikel harus ditentukan dari tata bahasa.
   */
  const [level, setLevel] = useState<'normal' | 'sulit' | 'hell'>('normal');

  /* Hell memakai kalimat PANJANG (dua klausa) yang terpisah dari daftar biasa,
     supaya level mudah tidak ikut kebanjiran kalimat 10–13 kartu. */
  const daftarCombo = level === 'hell' ? COMBO_SOAL.filter((x) => x.hell) : COMBO_SOAL.filter((x) => !x.hell);
  const soal = daftarCombo[soalIdx % daftarCombo.length];

  const muatSoal = (idx: number) => {
    const daftar = level === 'hell' ? COMBO_SOAL.filter((x) => x.hell) : COMBO_SOAL.filter((x) => !x.hell);
    const s = daftar[idx % daftar.length];
    setSoalIdx(idx);
    setLangkah(0);
    setTray([]);
    setKartu(kocokKartu(s));
    setBalas('');
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: muat ulang hanya saat LEVEL berganti; muatSoal dibuat ulang tiap render sehingga memasukkannya ke daftar akan mengulang tanpa henti
  useEffect(() => {
    muatSoal(0);
  }, [level]);

  const ketuk = (k: Kartu, indeks: number) => {
    /* KALIMAT SUDAH SELESAI — abaikan ketukan berikutnya.
       Tanpa penjaga ini, selama jeda 1,6 detik sebelum soal berganti kartu
       masih bisa diketuk, dan ketukan pada kartu pertama soal LAMA ikut
       memanggil `muatSoal(soalIdx + 1)` lagi — soal bisa melompat dua kali. */
    if (langkah >= soal.urutan.length) return;

    if (kartuBenar(soal, langkah, k)) {
      bunyi(true);
      ucap(k.jp, 1);
      const l = langkah + 1;
      /* Kombo yang DIPAKAI adalah kombo setelah kenaikan: kartu pertama sebuah
         kalimat bernilai x2, bukan x1. Sebelumnya `setSkorCombo` membaca
         `kombo` lama sehingga ketukan pertama selalu dinilai seolah tidak ada
         rangkaian — dan angka di layar (x2) tidak cocok dengan skor yang masuk. */
      const komboBaru = kombo + 1;
      setLangkah(l);
      setTray((tr) => [...tr, k.jp]);
      setKombo(komboBaru);
      setSkorCombo((n) => n + 50 * komboBaru);
      setKartu((ks) => ks.filter((_, i) => i !== indeks));
      if (l === soal.urutan.length) {
        setBalas(t('arcade.sempurna'));
        window.setTimeout(() => muatSoal(soalIdx + 1), 1600);
      }
    } else {
      bunyi(false);
      setKombo(1);
      const harap = soal.urutan[langkah];
      setBalas(k.jenis === 'particle' ? k.ket : `${t('arcade.butuh')} ${harap?.jp ?? ''} — ${harap?.ket ?? ''}`);
      catatLemah(`${soal.indo} — ${k.jp}`, k.ket);
    }
  };

  const hapusLemah = () => {
    setLemah([]);
    simpanLemah([]);
  };

  if (!masuk) {
    return <LoginGate onSuccess={() => setMasuk(true)} />;
  }

  return (
    <div class="max-w-md mx-auto">
      {/* Tab */}
      <div class="mb-3 grid grid-cols-2 gap-2">
        {(['genba', 'combo'] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            aria-pressed={tab === id}
            class={`min-h-11 rounded-control border px-3 text-[12px] font-bold ${
              tab === id ? 'border-accent-violet bg-accent-violet/10 text-accent-violet' : 'border-line bg-surface-raised text-fg-muted'
            }`}
          >
            {id === 'genba' ? `📦 ${t('arcade.tab_genba')}` : `🃏 ${t('arcade.tab_combo')}`}
          </button>
        ))}
      </div>

      {tab === 'genba' ? (
        <section aria-label={t('arcade.tab_genba')}>
          {/* `flex-wrap` + jarak: pada 320 px label Choukai yang panjang menempel
              ke "¥ 0" tanpa celah (terukur di browser 2026-11-04). Tiga item di
              satu baris tidak muat, jadi barisnya harus boleh patah. */}
          <div class="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-fg-muted">
            <label class="flex items-center gap-1.5 min-w-0">
              <input type="checkbox" checked={choukai} onChange={(e) => setChoukai((e.target as HTMLInputElement).checked)} />
              <span class="break-words">{t('arcade.choukai')}</span>
            </label>
            <span class="font-bold text-fg">¥ {skor}</span>
            <span role="img" aria-label={`${t('arcade.nyawa')}: ${Math.max(0, nyawa)}`}>
              {'⛑️'.repeat(Math.max(0, nyawa)) || '💀'}
            </span>
          </div>

          <div class="mb-2 rounded-card border border-line bg-surface-sunken p-3">
            <div class="mb-1 flex items-center justify-between">
              <span class="text-[11px] font-bold text-fg-muted">{t('arcade.perintah_senpai')}</span>
              <button
                type="button"
                onClick={() => perintah && ucap(perintah.jp, skor >= 500 ? 1.05 : 0.9)}
                class="min-h-9 rounded-control border border-line px-2 text-[11px] font-bold text-fg"
              >
                🔊 {t('arcade.ulangi')}
              </button>
            </div>
            {/* `break-words`: perintah bisa panjang (`しろい はこ を ひだり の はこ に
                おいてください`) dan pada layar 320 px teks ini pernah melebar
                keluar kartu, bukan membungkus. */}
            <p class="text-base font-bold text-fg break-words" data-testid="arcade-perintah">
              {perintah ? (choukai ? '🔊 ？？？' : perintah.jp) : t('arcade.mulai_hint')}
            </p>
            {perintah && !choukai && <p class="mt-0.5 text-[11px] italic text-fg-muted">{perintah.romaji}</p>}
            {pesan && <p class="mt-1 text-[11px] font-bold text-accent-red">{pesan}</p>}
            <div class="mt-2 h-1.5 w-full overflow-hidden rounded-pill bg-surface-raised" role="progressbar" aria-valuenow={Math.round(sisa)} aria-valuemin={0} aria-valuemax={100}>
              <div class="h-full bg-emerald-400" style={`transform:scaleX(${sisa / 100});transform-origin:left`} />
            </div>
          </div>

          {fase === 'idle' || fase === 'selesai' ? (
            <button type="button" onClick={mulai} class="mb-2 min-h-11 w-full rounded-control bg-accent-violet px-4 text-sm font-bold text-white">
              ▶️ {fase === 'idle' ? t('arcade.mulai') : t('arcade.cobagi')}
            </button>
          ) : (
            <p class="mb-2 text-center text-[11px] text-fg-muted">
              {dipilih ? t('arcade.ketuk_rak') : t('arcade.pilih_barang')}
            </p>
          )}

          <div class="mb-2 grid grid-cols-2 gap-2">
            {/* Satu array, bukan dua yang dipasangkan lewat INDEKS.
                Versi sebelumnya memetakan `['ue','shita','hidari','migi']` lalu
                mengambil label dari array terpisah dengan `[i]` — mengurutkan
                ulang salah satunya membuat tombol "Rak Atas" menaruh barang ke
                みぎ tanpa satu pun error. Ditemukan saat review UI 2026-11-04. */}
            {GENBA_ZONA.map((z) => {
              return (
                <button
                  key={z.id}
                  type="button"
                  onClick={() => taruh(z.id)}
                  class="min-h-14 rounded-card border-2 border-dashed border-line bg-surface-sunken px-1 py-1.5 text-center"
                >
                  <span class="block text-[11px] text-fg-muted break-words">{z.ikon} {z.jp}</span>
                  <span class="block text-sm font-bold text-fg">{z.id_}</span>
                </button>
              );
            })}
          </div>

          <div class="grid grid-cols-3 gap-2 rounded-card border border-line bg-surface-sunken p-2">
            {(pilihan.length ? pilihan : []).map((p) => (
              <button
                key={p.kunci}
                type="button"
                onClick={() => {
                  setDipilih(p.kunci);
                  ucap(`${p.warna.jp} ${p.barang.jp}`, 1);
                }}
                aria-pressed={dipilih === p.kunci}
                class={`min-h-16 rounded-control border-2 p-1 text-center ${p.warna.kelas} ${
                  dipilih === p.kunci ? 'ring-4 ring-white' : ''
                }`}
              >
                <span class="block text-xl">{p.barang.ikon}</span>
                <span class="block text-[11px] font-bold">{p.warna.jp}{p.barang.jp}</span>
              </button>
            ))}
          </div>
        </section>
      ) : (
        <section aria-label={t('arcade.tab_combo')}>
          <div class="mb-2 flex items-center justify-between text-[12px]">
            <span class="rounded-control border border-line bg-surface-raised px-2 py-1 font-bold text-fg-muted">🔥 x{kombo}</span>
            <span class="rounded-control border border-line bg-surface-sunken px-2 py-1 text-fg-muted">{soal.bab}</span>
            <button
              type="button"
              onClick={() => setLevel((l) => (l === 'normal' ? 'sulit' : l === 'sulit' ? 'hell' : 'normal'))}
              aria-pressed={level !== 'normal'}
              class={`min-h-9 rounded-control border px-2 py-1 font-bold ${
                level !== 'normal' ? 'border-accent-red bg-accent-red/10 text-accent-red' : 'border-line bg-surface-raised text-fg-muted'
              }`}
            >
              {level === 'hell' ? t('arcade.level_hell') : level === 'sulit' ? t('arcade.level_sulit') : t('arcade.level_normal')}
            </button>
            <span class="font-bold text-fg">¥ {skorCombo}</span>
          </div>

          <div class="mb-2 rounded-card border border-line bg-surface-sunken p-3 text-center">
            <p class="text-[11px] font-bold text-fg-muted">{t('arcade.susun')}</p>
            <p class="text-sm font-bold text-fg" data-testid="arcade-target">“{soal.indo}”</p>
            {balas && <p class="mt-1 text-[11px] font-bold text-accent-amber">{balas}</p>}
          </div>

          <div class="mb-2 flex min-h-16 flex-wrap items-center justify-center gap-1.5 rounded-card border-2 border-dashed border-line p-2">
            {tray.length === 0 ? (
              <span class="text-[11px] text-fg-muted">{t('arcade.ketuk_berurutan')}</span>
            ) : (
              tray.map((w, i) => (
                <span key={i} class="rounded-control border border-line bg-surface-raised px-2 py-1 text-sm font-bold text-fg">
                  {w}
                </span>
              ))
            )}
          </div>

          <div class="grid grid-cols-3 gap-2 rounded-card border border-line bg-surface-sunken p-2">
            {kartu.map((k, i) => (
              <button
                key={`${k.jp}-${i}`}
                type="button"
                onClick={() => ketuk(k, i)}
                class={`min-h-12 rounded-control border-2 px-1 text-sm font-bold break-words ${
                  level !== 'normal'
                    ? 'border-line bg-surface-raised text-fg'
                    : k.jenis === 'particle'
                      ? 'border-amber-300 bg-amber-400 text-slate-900'
                      : k.jenis === 'verb'
                        ? 'border-rose-400 bg-rose-600 text-white'
                        : 'border-blue-400 bg-blue-600 text-white'
                }`}
              >
                {k.jp}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Evaluasi */}
      <div class="mt-3 flex items-center justify-between rounded-card border border-line bg-surface-raised px-3 py-2 text-[11px]">
        <span class="text-fg-muted">
          {t('arcade.evaluasi')}: <b class="text-fg">{lemah.length}</b>
        </span>
        {lemah.length > 0 && (
          <button type="button" onClick={hapusLemah} class="rounded-control border border-line px-2 py-1 font-bold text-fg-muted">
            {t('arcade.bersihkan')}
          </button>
        )}
      </div>
      {lemah.length > 0 && (
        <ul class="mt-2 space-y-1">
          {lemah.slice(0, 6).map((n, i) => (
            <li key={i} class="rounded-control border border-line bg-surface-sunken px-2 py-1 text-[11px]">
              <b class="text-fg">{n.judul}</b>
              <span class="block text-fg-muted">{n.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
