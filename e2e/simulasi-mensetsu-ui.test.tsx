/**
 * TESTS: Mode Simulasi di `/wawancara` — tab, ronde, dan penilaian yang terlihat.
 *
 * KENAPA ADA
 * ----------
 * Mesin penilaiannya sudah diuji terpisah (`e2e/simulasi-mensetsu.test.ts`).
 * Yang belum terjaga adalah SAMBUNGANNYA: apakah tab benar-benar berpindah,
 * apakah ronde berjalan sampai selesai, dan apakah nilai yang muncul di layar
 * benar-benar berasal dari mesin itu — bukan angka yang dipaku di JSX.
 *
 * (c) di bawah ini yang menutup celah paling berbahaya: mode yang selalu
 * menampilkan "0" juga akan lulus tes "layar hasil muncul".
 */
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MensetsuForm from '../src/components/candidate/MensetsuForm';
import { authStore } from '../src/store/authReactive';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/lib/apiClient', () => ({ apiClient: apiMock }));

const WA = '081234567890';
const TAHAP = 'Pembuka & Perkenalan Diri';

function soal(kode: string, urutan: number, jp: string, arti: string, jawabanku = '') {
  return {
    kode,
    tahap: TAHAP,
    urutan,
    jp,
    romaji: 'romaji',
    arti,
    jawaban_jp: '私の名前はブディと申します。',
    jawaban_romaji: 'watashi no namae wa Budi to moushimasu.',
    jawaban_arti: 'Nama saya Budi.',
    kolom_cv: null,
    sinkron_cv: false,
    jawabanku: { jp: jawabanku, romaji: '', arti: '' },
  };
}

const BANK = {
  success: true,
  wa: WA,
  isVip: true,
  jumlah: 2,
  tahap: [TAHAP],
  soal: [soal('W01', 1, 'お名前は何ですか。', 'Siapa nama Anda?'), soal('W02', 2, 'どこから来ましたか。', 'Anda datang dari mana?')],
};

function login() {
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

describe('/wawancara — Mode Simulasi', () => {
  beforeEach(() => {
    localStorage.clear();
    apiMock.mockReset();
    apiMock.mockResolvedValue(BANK);
    login();
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('tab "Simulasi" membuka layar pengaturan, bukan lembar bank soal', async () => {
    render(<MensetsuForm />);
    await waitFor(() => expect(screen.getByTestId('tab-simulasi')).toBeTruthy());

    fireEvent.click(screen.getByTestId('tab-simulasi'));

    await waitFor(() => expect(screen.getByTestId('simulasi-mulai')).toBeTruthy());
    expect(screen.queryByText('Cetak semua tahap')).toBeNull();
  });

  it('jsdom tidak punya mikrofon: jalur ketik tetap ditawarkan', async () => {
    render(<MensetsuForm />);
    await waitFor(() => expect(screen.getByTestId('tab-simulasi')).toBeTruthy());
    fireEvent.click(screen.getByTestId('tab-simulasi'));

    /* Peringatan peramban HARUS muncul supaya siswa tidak menunggu tombol yang
       tidak akan pernah ada. */
    await waitFor(() => expect(screen.getByText(/belum mendukung perekaman suara/)).toBeTruthy());
  });

  it('ronde berjalan sampai layar hasil, dan nilainya berasal dari mesin penilaian', async () => {
    render(<MensetsuForm />);
    await waitFor(() => expect(screen.getByTestId('tab-simulasi')).toBeTruthy());
    fireEvent.click(screen.getByTestId('tab-simulasi'));
    await waitFor(() => expect(screen.getByTestId('simulasi-mulai')).toBeTruthy());
    fireEvent.click(screen.getByTestId('simulasi-mulai'));

    /* Bank hanya punya 2 soal, jadi ronde = 2 meskipun pengaturan meminta 5. */
    await waitFor(() => expect(screen.getByTestId('simulasi-soal')).toBeTruthy());
    const soalPertama = screen.getByTestId('simulasi-soal').textContent;

    for (let i = 0; i < 2; i++) {
      const kotak = screen.getByTestId('simulasi-transkrip') as HTMLTextAreaElement;
      /* Jawaban yang sama persis dengan acuan → kecocokan isi harus penuh. */
      kotak.value = '私の名前はブディと申します。';
      fireEvent.input(kotak);
      fireEvent.click(screen.getByTestId('simulasi-kirim'));
      /* Soal terakhir langsung menutup ronde — jangan tunggu kotak yang sudah
         tidak ada lagi. */
      if (i === 0) await waitFor(() => expect(screen.getByTestId('simulasi-transkrip')).toBeTruthy());
    }

    await waitFor(() => expect(screen.getByText('Hasil simulasi')).toBeTruthy());
    /* Nilai harus dari mesin: jawaban identik dengan acuan tidak mungkin 0. */
    const skor = [...document.querySelectorAll('b')].map((b) => Number(b.textContent));
    expect(skor.some((n) => n >= 60)).toBe(true);
    expect(soalPertama).toBeTruthy();
  }, 20000);
});
