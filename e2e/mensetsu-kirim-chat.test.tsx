/**
 * TESTS: jawaban yang diketik di panel chat `/wawancara` — apakah ia SELAMAT
 * kalau penerjemahan AI gagal?
 *
 * KENAPA ADA
 * ----------
 * `kirimChat()` mengirim jawaban Indonesia ke `terjemahkanJawabanWawancara`,
 * dan SATU-SATUNYA penulisan ke DB terjadi di dalam aksi itu. Artinya: kalau
 * model kehabisan waktu (deadline 12 dtk, rantai 4 dtk/model), jawaban yang
 * baru saja diketik siswa tidak tersimpan di mana pun kecuali draft
 * `localStorage` di perangkat itu — dan draft itu hilang begitu ia berpindah
 * HP atau membersihkan peramban. Di layar, pesannya sudah muncul di chat
 * ("Sudah tersimpan." tidak, tapi pesan siswa tampil), jadi kehilangannya
 * tidak terlihat seperti kehilangan.
 *
 * Yang diuji: urutannya. Simpan dulu teks Indonesia, baru terjemahkan. Kalau
 * penerjemahan gagal, jawabannya tetap ada dan tinggal diisi Jepangnya nanti.
 */
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MensetsuForm from '../src/components/candidate/MensetsuForm';
import { authStore } from '../src/store/authReactive';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/lib/apiClient', () => ({ apiClient: apiMock }));

const WA = '081234567890';

const BANK = {
  success: true,
  wa: WA,
  isVip: true,
  jumlah: 2,
  tahap: ['Pembuka & Perkenalan Diri'],
  soal: ['W01', 'W02'].map((kode, i) => ({
    kode,
    tahap: 'Pembuka & Perkenalan Diri',
    urutan: i + 1,
    jp: 'お名前は何ですか。',
    romaji: 'onamae wa nan desu ka.',
    arti: 'Siapa nama Anda?',
    jawaban_jp: null,
    jawaban_romaji: null,
    jawaban_arti: null,
    kolom_cv: null,
    sinkron_cv: false,
    jawabanku: { jp: '', romaji: '', arti: '' },
  })),
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

describe('/wawancara — jawaban chat saat AI gagal', () => {
  beforeEach(() => {
    localStorage.clear();
    apiMock.mockReset();
    apiMock.mockImplementation(async (action: string) => {
      if (action === 'terjemahkanJawabanWawancara') throw new Error('DEADLINE_EXCEEDED');
      if (action === 'simpanJawabanWawancara') return { success: true };
      return BANK;
    });
    login();
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('jawaban Indonesia disimpan LEBIH DULU, walau penerjemahan gagal', async () => {
    render(<MensetsuForm />);
    await waitFor(() => expect(screen.getByTestId('tab-simulasi')).toBeTruthy());

    const kotak = (await screen.findByPlaceholderText(/Jawab dalam Bahasa Indonesia/i)) as
      | HTMLTextAreaElement
      | null;
    expect(kotak).toBeTruthy();
    if (!kotak) return;
    kotak.value = 'Nama saya Budi.';
    fireEvent.input(kotak);
    fireEvent.click(screen.getByText('Kirim & terjemahkan'));

    await waitFor(() => {
      const simpan = apiMock.mock.calls.find((c) => c[0] === 'simpanJawabanWawancara');
      expect(simpan, 'jawaban harus tersimpan sebelum AI dipanggil').toBeTruthy();
      const [, payload] = simpan as [string, [string, string, Record<string, string>]];
      expect(payload[0]).toBe(WA);
      expect(payload[1]).toBe('W01');
      /* `jp` kosong: terjemahan belum ada. Yang penting teks Indonesia-nya
         tidak hilang. Kolom CV tidak ikut dikosongkan (lihat bank.ts). */
      expect(payload[2]).toMatchObject({ arti: 'Nama saya Budi.' });
    });

    /* Dan AI-nya memang dicoba setelah itu — bukan dilewati. */
    expect(apiMock.mock.calls.some((c) => c[0] === 'terjemahkanJawabanWawancara')).toBe(true);
  });
});
