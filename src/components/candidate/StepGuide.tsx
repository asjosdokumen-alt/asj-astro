/**
 * StepGuide.tsx — "langkah berikutnya", ditunjukkan oleh sebuah ikon.
 *
 * APA INI
 * -------
 * Satu kartu yang menjawab satu pertanyaan: **apa satu hal berikutnya yang perlu
 * saya lakukan?** Kandidat yang membuka dashboard melihat beberapa bar progres
 * (CV Mini, Master Profil, berkas) dan sebuah angka kelengkapan, tetapi tidak
 * ada satu pun yang mengatakan langkah mana yang harus dikerjakan lebih dulu.
 * Kartu ini memilih SATU langkah dari data yang sudah ada, dan menampilkan ikon
 * langkah itu di sebelahnya sebagai penunjuk.
 *
 * Sumber data: argumen yang SUDAH dipakai `CandidateDash`
 * (`cvMiniProgress`, `cvMasterProgress`, `berkasProgress`/`berkasTotal`).
 * Tidak ada state baru, tidak ada request, tidak ada tabel.
 *
 * ATURAN YANG DIPEGANG (docs/ILLUSTRATION_SPEC.md §6.2)
 * ----------------------------------------------------
 * 1. **Tidak ada skor seleksi.** Kartu ini tidak menampilkan angka sama sekali —
 *    hanya langkah, dan persentase kelengkapan bagian yang bersangkutan sebagai
 *    konteks. "27% CV Mini" adalah pernyataan tentang FORMULIR, bukan tentang
 *    penilaian. Yang dilarang adalah angka yang bisa dibaca sebagai peluang
 *    diterima ("skor profil 72", "peringkat 12 dari 40", "peluang lolos 80%").
 * 2. **Tidak ada urutan yang menghukum.** Langkah dipilih dari yang PALING
 *    BELUM lengkap, jadi menyelesaikan bagian apa pun memajukan pemandu. Tidak
 *    ada "kamu gagal langkah 2", dan tidak ada kemunduran yang dirayakan —
 *    kalau berkas ditolak dan progres turun, kartu hanya menunjuk bagian itu
 *    lagi tanpa kata yang menyalahkan.
 * 3. **Ikonnya tidak pernah menghakimi.** Ikon dipilih dari yang SUDAH ADA di
 *    sprite; tidak ada gambar baru yang dihasilkan di sini. Tidak ada ikon
 *    peringatan atau tanda silang, karena tidak ada langkah yang gagal — kartu
 *    ini menunjuk, bukan menilai.
 *
 * KENAPA PEMILIHAN LANGKAH ADA DI BERKAS TERPISAH DAN BUKAN DI DALAM KOMPONEN
 * --------------------------------------------------------------------------
 * `nextStep()` adalah fungsi murni: masuk angka, keluar satu kunci. Itu membuat
 * aturannya bisa diuji tanpa merender apa pun, dan yang lebih penting — membuat
 * "bagian mana yang dipilih" bisa DIBUKTIKAN, bukan hanya terlihat benar di satu
 * tangkapan layar. Komponennya sendiri hanya memetakan kunci ke teks dan ikon.
 *
 * KENAPA TIDAK ADA `h1`/`h2` DI SINI
 * ----------------------------------
 * Kartu ini muncul di dalam dashboard yang sudah punya `h2` sambutan
 * (`CandidateDash.tsx`). Ia memakai `h3` supaya tetap berada di bawah judul
 * sambutan dalam urutan heading, dan `e2e/test-headings.mjs` tetap melihat satu
 * `h1` per rute.
 */
import Icon from '../ui/Icon';
import { t } from '../../store/i18n';

/** Bagian progres yang dikenal pemandu. */
export type StepKey = 'mini' | 'master' | 'berkas' | 'done';

/** Satu bagian: seberapa lengkap, dan berapa sisa. */
export interface StepInput {
  /** Persentase bagian ini (0-100). */
  mini: number;
  master: number;
  /** Berkas: `progress` dari `berkasProgress`, `total` dari `berkasTotal`. */
  berkasProgress: number;
  berkasTotal: number;
}

/**
 * Ambang "bagian ini sudah beres". Sengaja 100, bukan 80: pemandu yang
 * menyatakan sebuah bagian selesai padahal masih ada field kosong akan membuat
 * kandidat berhenti mengisi. 100 juga membuat aturannya mudah dibaca ulang.
 */
const COMPLETE = 100;

/**
 * Pilih SATU langkah berikutnya.
 *
 * URUTANNYA DISENGAJA, dan alasannya bukan kepentingan seleksi:
 * 1. **berkas** lebih dulu kalau ada berkas yang belum diunggah — ini satu-satunya
 *    bagian yang butuh tindakan di luar formulir (memindai, mengunggah), jadi ia
 *    yang paling lama dan paling mudah tertunda.
 * 2. lalu **mini** sebelum **master** — data dasar adalah prasyarat yang masuk akal
 *    untuk detail, dan `CV_MINI_FIELDS` lebih pendek sehingga memberi kemajuan
 *    lebih cepat.
 * 3. **master** terakhir.
 * 4. `done` kalau ketiganya utuh.
 *
 * Kalau `berkasTotal` nol, bagian berkas **tidak pernah** dipilih: tidak ada
 * berkas yang diminta berarti tidak ada yang bisa diunggah, dan menunjuk bagian
 * kosong akan jadi langkah yang mustahil diselesaikan.
 */
export function nextStep(input: StepInput): StepKey {
  const { mini, master, berkasProgress, berkasTotal } = input;

  const berkasDone = berkasTotal <= 0 || berkasProgress >= COMPLETE;
  if (!berkasDone) return 'berkas';

  if (mini < COMPLETE) return 'mini';
  if (master < COMPLETE) return 'master';

  return 'done';
}

/**
 * Ikon pendamping untuk sebuah langkah. Semua nama ini ADA di sprite
 * (`src/icons/sprite-map.ts`); `Icon.test.ts` fails the build if one is not, and
 * `StepGuide.test.ts` pins the four here. A name that is missing from the sheet
 * renders as NOTHING — no error, no broken image, just a blank space — which is
 * why the set is asserted against the generated map rather than trusted.
 */
export type StepIcon = 'file-upload' | 'id-card' | 'user-edit' | 'circle-check';

export function iconFor(key: StepKey): StepIcon {
  if (key === 'berkas') return 'file-upload';
  if (key === 'mini') return 'id-card';
  if (key === 'master') return 'user-edit';
  return 'circle-check';
}

/** Kunci terjemahan judul langkah. Dipisah agar bisa diperiksa test. */
export function titleKeyFor(key: StepKey): string {
  return `candidate.step_${key}_title`;
}

/** Kunci terjemahan kalimat penjelas langkah. */
export function bodyKeyFor(key: StepKey): string {
  return `candidate.step_${key}_body`;
}

export interface Props extends StepInput {
  /** Kelas tambahan dari pemanggil. */
  class?: string;
}

export default function StepGuide({
  mini,
  master,
  berkasProgress,
  berkasTotal,
  class: className = '',
}: Props) {
  const key = nextStep({ mini, master, berkasProgress, berkasTotal });

  const classes = [
    'bg-black/60 border border-sky-500/30 rounded-[2rem] p-5 mb-4 text-left',
    'flex items-center gap-4',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div class={classes} data-step-guide={key}>
      {/* Ikon sebagai PENDAMPING teks, bukan isi: kalimatnya sudah membawa
          makna, jadi ikonnya dekoratif (`Icon` merender `aria-hidden` secara
          bawaan) supaya pembaca layar tidak mendengar sesuatu di antara judul
          dan penjelasannya. Dulu di sini ada maskot; owner memutuskan maskot
          dihapus dari situs (2026-09-24), jadi yang tersisa adalah ikon yang
          menunjukkan BAGIAN mana yang ditunjuk. */}
      <div class="shrink-0">
        <Icon name={iconFor(key)} class="text-5xl text-sky-400" />
      </div>

      <div class="min-w-0 flex-1">
        <p class="text-[11px] font-black text-sky-400 uppercase tracking-widest mb-0.5">
          {t('candidate.step_label')}
        </p>
        <h3 class="text-base font-black text-white mb-1">{t(titleKeyFor(key))}</h3>
        <p class="text-sm text-fg-muted">{t(bodyKeyFor(key))}</p>
      </div>
    </div>
  );
}
