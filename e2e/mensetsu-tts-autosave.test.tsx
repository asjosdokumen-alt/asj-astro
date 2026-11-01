/**
 * TESTS: tombol dengar (Web Speech API) + draft perangkat di `/wawancara`.
 *
 * KENAPA ADA
 * ----------
 * Dua fitur ini menyentuh baris yang sama di 177 soal, dan keduanya gagal
 * dengan cara yang TIDAK terlihat:
 *
 *   • tombol dengar bisa ada tapi tidak pernah memanggil mesin suara (mis. karena
 *     `disabled` salah, atau karena teks yang dikirim kosong);
 *   • draft perangkat bisa memulihkan isi yang seharusnya MENANG dari server —
 *     menimpa koreksi admin pada soal yang tersambung kolom CV — atau tidak
 *     menyimpan apa pun sehingga janji "tidak hilang saat refresh" kosong.
 *
 * Keduanya diuji di sini pada satu baris soal (`W01`), dengan `apiClient` palsu.
 * Penjaga gerbangnya sendiri ada di `e2e/mensetsu-gate.test.tsx`.
 */
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MensetsuForm from '../src/components/candidate/MensetsuForm';
import { authStore } from '../src/store/authReactive';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/lib/apiClient', () => ({ apiClient: apiMock }));

const WA = '081234567890';
const KUNCI = `asj_mensetsu_v1:${WA}`;
const TAHAP = 'Pertanyaan & Pemahaman Diri';

/** Satu soal. `jawabanku` diisi per-tes sesuai keadaan server yang mau diuji. */
function bank(jawabanku: { jp: string; romaji: string; arti: string } = { jp: '', romaji: '', arti: '' }) {
  return {
    success: true,
    wa: WA,
    isVip: true,
    jumlah: 1,
    tahap: [TAHAP],
    soal: [
      {
        kode: 'W01',
        tahap: TAHAP,
        urutan: 1,
        jp: 'お名前は何ですか。',
        romaji: 'onamae wa nan desu ka.',
        arti: 'Siapa nama Anda?',
        jawaban_jp: null,
        jawaban_romaji: null,
        jawaban_arti: null,
        kolom_cv: null,
        sinkron_cv: false,
        jawabanku,
      },
    ],
  };
}

function loginSebagaiKandidat() {
  authStore.set({
    role: 'kandidat',
    name: 'Budi',
    wa: WA,
    sessionToken: 'uji-kandidat',
    refreshToken: '',
    isLoggedIn: true,
    lastChecked: Date.now(),
  });
}

/** Mesin suara palsu di `window` (jsdom tidak punya). */
function pasangSuara() {
  const diucapkan: { text: string; lang: string; rate: number }[] = [];
  class Ucapan {
    text: string;
    lang = '';
    rate = 1;
    pitch = 1;
    voice = null;
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(teks: string) {
      this.text = teks;
    }
  }
  const w = window as unknown as { speechSynthesis?: unknown; SpeechSynthesisUtterance?: unknown };
  w.speechSynthesis = {
    speak: (u: { text: string; lang: string; rate: number }) => diucapkan.push(u),
    cancel: () => {},
    getVoices: () => [{ name: 'Kyoko', lang: 'ja-JP' }],
  };
  w.SpeechSynthesisUtterance = Ucapan;
  return diucapkan;
}

describe('/wawancara — suara & draft perangkat', () => {
  beforeEach(() => {
    localStorage.clear();
    apiMock.mockReset();
    apiMock.mockResolvedValue(bank());
    loginSebagaiKandidat();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    const w = window as unknown as { speechSynthesis?: unknown; SpeechSynthesisUtterance?: unknown };
    delete w.speechSynthesis;
    delete w.SpeechSynthesisUtterance;
  });

  it('draft lokal mengisi kolom yang KOSONG di server, dan memberi tahu siswa', async () => {
    localStorage.setItem(
      KUNCI,
      JSON.stringify({ W01: { jp: 'テストです。', romaji: 'tesuto desu.', arti: 'Ini ujian.' } }),
    );

    render(<MensetsuForm />);

    const jp = (await screen.findByPlaceholderText('tulis jawaban Jepang…')) as HTMLTextAreaElement;
    await waitFor(() => expect(jp.value).toBe('テストです。'));
    expect((screen.getByPlaceholderText('romaji…') as HTMLInputElement).value).toBe('tesuto desu.');
    expect((screen.getByPlaceholderText('arti jawaban…') as HTMLInputElement).value).toBe('Ini ujian.');
  });

  it('nilai SERVER menang atas draft lokal (koreksi admin tidak boleh tertimpa)', async () => {
    apiMock.mockResolvedValue(bank({ jp: 'サーバーの答え。', romaji: 'saabaa no kotae.', arti: 'Jawaban server.' }));
    localStorage.setItem(
      KUNCI,
      JSON.stringify({ W01: { jp: 'ローカルの答え。', romaji: 'rookaru no kotae.', arti: 'Jawaban lokal.' } }),
    );

    render(<MensetsuForm />);

    const jp = (await screen.findByPlaceholderText('tulis jawaban Jepang…')) as HTMLTextAreaElement;
    await waitFor(() => expect(jp.value).toBe('サーバーの答え。'));
  });

  it('ketikan disimpan ke perangkat setelah jeda, tanpa perlu blur', async () => {
    render(<MensetsuForm />);

    const arti = (await screen.findByPlaceholderText('arti jawaban…')) as HTMLInputElement;
    arti.value = 'Saya Budi dari Malang.';
    fireEvent.input(arti);

    /* Debounce 400 ms — beri ruang lebih. */
    await waitFor(
      () => {
        const raw = localStorage.getItem(KUNCI) || '';
        expect(raw).toContain('Saya Budi dari Malang.');
      },
      { timeout: 2000 },
    );
  });

  it('tombol "Dengar soal" mengirim teks Jepang dengan lang ja-JP', async () => {
    const diucapkan = pasangSuara();
    render(<MensetsuForm />);

    const tombol = (await screen.findByTestId('dengar-soal-W01')) as HTMLButtonElement;
    fireEvent.click(tombol);

    await waitFor(() => expect(diucapkan).toHaveLength(1));
    expect(diucapkan[0]?.text).toBe('お名前は何ですか。');
    expect(diucapkan[0]?.lang).toBe('ja-JP');
  });

  it('tombol "Dengar jawaban saya" mati selama kolom Jepang kosong, hidup setelah diisi', async () => {
    render(<MensetsuForm />);

    const tombol = (await screen.findByTestId('dengar-jawab-W01')) as HTMLButtonElement;
    expect(tombol.disabled).toBe(true);

    const jp = screen.getByPlaceholderText('tulis jawaban Jepang…') as HTMLTextAreaElement;
    jp.value = '私の名前はブディです。';
    fireEvent.input(jp);

    await waitFor(() => expect(tombol.disabled).toBe(false));
  });

  /* ── MENULIS HANYA KALAU BERUBAH ──────────────────────────────────────────
   *
   * Ketiga kolom memanggil `simpanBaris` dari `onBlur` tanpa syarat, dan satu
   * simpanan = satu PATCH ke `master_database_candidate` (untuk 8 soal
   * ber-kolom CV) + satu upsert ke `wawancara_jawaban`. Menjelajahi bank berarti
   * ~6 permintaan tulis per baris yang dibuka, ~1000 untuk 177 baris — dan
   * `updated_at` berhenti berarti "kapan siswa terakhir mengubah".
   *
   * 🪤 KENAPA LEWAT TOMBOL "Simpan", BUKAN `fireEvent.blur`: jsdom tidak
   * mengantarkan event `blur` ke handler Preact di sini — dibuktikan dengan
   * mematikan pemeriksa sidik lalu menjalankan ulang: pemanggilan tetap nol,
   * artinya yang gagal bukan pemeriksanya, melainkan event-nya tidak pernah
   * sampai. Tes "blur tidak menulis apa pun" karena itu HIJAU TANPA MENGUKUR
   * APA PUN (kelas R16). Tombol "Simpan" memakai `simpanBaris` yang sama —
   * jalur kode yang diuji identik, pemicunya saja yang bisa dipercaya di jsdom. */
  it('menekan Simpan dua kali tanpa mengubah apa pun hanya menulis sekali', async () => {
    apiMock.mockResolvedValue(
      bank({ jp: '私の名前はブディです。', romaji: 'watashi no namae wa budi desu.', arti: 'Nama saya Budi.' }),
    );
    render(<MensetsuForm />);

    const arti = (await screen.findByPlaceholderText('arti jawaban…')) as HTMLInputElement;
    await waitFor(() => expect(arti.value).toBe('Nama saya Budi.'));

    apiMock.mockClear();
    /* Ubah → Simpan: satu tulisan. */
    arti.value = 'Nama saya Budi, dari Malang.';
    fireEvent.input(arti);
    await new Promise((r) => setTimeout(r, 0));
    fireEvent.click(screen.getAllByText('Simpan')[0] as Element);
    await waitFor(() =>
      expect(apiMock.mock.calls.filter((c) => c[0] === 'simpanJawabanWawancara')).toHaveLength(1),
    );

    /* Simpan lagi tanpa perubahan: tidak ada tulisan kedua. */
    fireEvent.click(screen.getAllByText('Simpan')[0] as Element);
    await new Promise((r) => setTimeout(r, 50));
    expect(apiMock.mock.calls.filter((c) => c[0] === 'simpanJawabanWawancara')).toHaveLength(1);
  });
});
