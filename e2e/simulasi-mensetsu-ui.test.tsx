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

/** Bank 8 soal — dipakai untuk menguji pilihan "Semua" (di atas batas 5). */
const BANK_8 = {
  ...BANK,
  jumlah: 8,
  soal: Array.from({ length: 8 }, (_, i) =>
    soal(`W0${i + 1}`, i + 1, `質問${i + 1}ですか。`, `Pertanyaan ${i + 1}?`),
  ),
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
       tidak akan pernah ada. Sejak 2026-10-29 kalimatnya tidak lagi menyebut
       "hanya Chrome/Edge": jalur rekam (MediaRecorder + transkripsi server)
       bekerja juga di Safari/Firefox, jadi yang perlu dikatakan adalah
       "perangkat ini tidak bisa merekam". */
    await waitFor(() => expect(screen.getByText(/tidak bisa merekam suara/)).toBeTruthy());
  });

  it('pilihan "Semua" mengambil SELURUH bank, bukan potongan 5/10/15', async () => {
    apiMock.mockResolvedValue(BANK_8);
    render(<MensetsuForm />);
    await waitFor(() => expect(screen.getByTestId('tab-simulasi')).toBeTruthy());
    fireEvent.click(screen.getByTestId('tab-simulasi'));
    await waitFor(() => expect(screen.getByTestId('simulasi-mulai')).toBeTruthy());

    /* Bawaan: 5 soal, walau banknya 8. */
    fireEvent.click(screen.getByTestId('simulasi-mulai'));
    await waitFor(() => expect(screen.getByTestId('simulasi-soal')).toBeTruthy());
    expect(screen.getByText('/ 5')).toBeTruthy();

    /* Kembali ke pengaturan lewat layar hasil, pilih "Semua", mulai lagi → 8. */
    fireEvent.click(screen.getByText('Akhiri simulasi'));
    await waitFor(() => expect(screen.getByText('Ganti pengaturan')).toBeTruthy());
    fireEvent.click(screen.getByText('Ganti pengaturan'));
    await waitFor(() => expect(screen.getByTestId('simulasi-mulai')).toBeTruthy());
    fireEvent.click(screen.getByTestId('simulasi-semua'));
    fireEvent.click(screen.getByTestId('simulasi-mulai'));
    await waitFor(() => expect(screen.getByText('/ 8')).toBeTruthy());
  }, 20000);

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

  /* ── mode mensetsu: soal hanya diucapkan ──────────────────────────────────
     Ini yang menaikkan kesulitan TANPA menaikkan level bahasa (ambang resmi
     特定技能1号 adalah A2, dan JFT-Basic tidak punya bagian berbicara — jadi
     "mendengar lalu menjawab" adalah satu-satunya hal yang benar-benar diuji
     wawancara tetapi tidak diuji tes).

     Tiga arah diuji, karena "teks soal tidak ada" juga benar kalau komponennya
     rusak dan tidak merender apa pun:
       • mode latihan (bawaan) → teks soal HARUS ada (kontrol negatif);
       • mode mensetsu          → teks soal TIDAK ada, panel dengar ada;
       • setelah "Buka teks"    → teks muncul DAN terhitung di layar hasil. */
  it('mode mensetsu menyembunyikan teks soal, dan menghitung berapa kali dibuka', async () => {
    const g = globalThis as unknown as Record<string, unknown>;
    const asliSynth = g.speechSynthesis;
    const asliUtt = g.SpeechSynthesisUtterance;

    /* jsdom tidak punya mesin suara. Tanpa stub ini `ucapkanJepang` mengembalikan
       false, dan komponen dengan BENAR membuka teksnya — perangkat tanpa suara
       Jepang tidak boleh diberi layar kosong. Tes ini akan mengukur jalur
       cadangan itu, bukan jalur mensetsu, dan tetap hijau. */
    class UttStub {
      lang = '';
      rate = 1;
      pitch = 1;
      voice: unknown = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      text: string;
      constructor(text: string) {
        this.text = text;
      }
    }
    g.SpeechSynthesisUtterance = UttStub;
    g.speechSynthesis = { cancel() {}, speak() {}, getVoices: () => [] };

    try {
      render(<MensetsuForm />);
      await waitFor(() => expect(screen.getByTestId('tab-simulasi')).toBeTruthy());
      fireEvent.click(screen.getByTestId('tab-simulasi'));
      await waitFor(() => expect(screen.getByTestId('simulasi-mulai')).toBeTruthy());

      /* KONTROL NEGATIF — mode bawaan masih memperlihatkan soal. Kalau baris
         ini merah, "teks tersembunyi" di bawah tidak membuktikan apa-apa. */
      expect(screen.getByTestId('simulasi-mode-latihan').getAttribute('aria-pressed')).toBe('true');
      fireEvent.click(screen.getByTestId('simulasi-mode-mensetsu'));
      expect(screen.getByTestId('simulasi-mode-mensetsu').getAttribute('aria-pressed')).toBe('true');

      fireEvent.click(screen.getByTestId('simulasi-mulai'));
      await waitFor(() => expect(screen.getByTestId('simulasi-mendengarkan')).toBeTruthy());
      expect(screen.queryByTestId('simulasi-soal')).toBeNull();

      /* Membuka teks = satu kejadian yang dihitung, bukan jalan pintas gratis. */
      fireEvent.click(screen.getByTestId('simulasi-lihat-teks'));
      await waitFor(() => expect(screen.getByTestId('simulasi-soal')).toBeTruthy());
      expect(screen.queryByTestId('simulasi-lihat-teks')).toBeNull();

      for (let i = 0; i < 2; i++) {
        const kotak = screen.getByTestId('simulasi-transkrip') as HTMLTextAreaElement;
        kotak.value = '私の名前はブディと申します。';
        fireEvent.input(kotak);
        fireEvent.click(screen.getByTestId('simulasi-kirim'));
        if (i === 0) {
          /* Soal kedua juga hanya didengar — teksnya tertutup lagi. */
          await waitFor(() => expect(screen.getByTestId('simulasi-mendengarkan')).toBeTruthy());
          fireEvent.click(screen.getByTestId('simulasi-lihat-teks'));
          await waitFor(() => expect(screen.getByTestId('simulasi-soal')).toBeTruthy());
        }
      }

      await waitFor(() => expect(screen.getByTestId('simulasi-hasil-terbuka')).toBeTruthy());
      /* Dua soal, dua kali buka teks. Angka ini yang membuat "boleh buka teks"
         jujur: jalan pintasnya ada, tapi tidak gratis. */
      expect(screen.getByTestId('simulasi-hasil-terbuka').textContent).toContain(': 2');
    } finally {
      g.speechSynthesis = asliSynth;
      g.SpeechSynthesisUtterance = asliUtt;
    }
  }, 20000);
});

// ==========================================
// 2026-10-31 — MODE WAWANCARA PENUH ("persis wawancara")
//
// Permintaan pemilik: "bikin mode khusus ... yg kek persis wawancara".
//
// Yang diuji di sini adalah ALURNYA, bukan kalimatnya — kalimat ritual dan
// susulan diuji di `e2e/simulasi-mensetsu.test.ts`. Tiga hal yang tidak akan
// terlihat dari tes mana pun kalau tidak ditulis di sini:
//
//   1. ritual masuk muncul SEBELUM soal pertama, dan ritual keluar SESUDAH
//      soal terakhir (urutan ini yang membuatnya terasa seperti wawancara);
//   2. susulan benar-benar MENGGANTIKAN soal berikutnya — bukan muncul sebagai
//      teks tambahan di kartu yang sama;
//   3. rata-rata di layar hasil hanya dari pertanyaan utama, sedangkan susulan
//      dilaporkan terpisah (mencampurnya akan membuat nilai turun karena soal
//      yang memang tidak ada naskahnya).
// ==========================================
describe('/wawancara — mode wawancara penuh', () => {
  beforeEach(() => {
    localStorage.clear();
    apiMock.mockReset();
    apiMock.mockResolvedValue(BANK);
    login();

    /* Mode penuh menyembunyikan teks soal, dan komponen dengan BENAR membuka
       teksnya kalau perangkat tidak punya suara Jepang. Tanpa stub ini tes di
       bawah mengukur jalur cadangan, bukan jalur wawancara. */
    class UttStub {
      lang = '';
      rate = 1;
      pitch = 1;
      voice: unknown = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      text: string;
      constructor(text: string) {
        this.text = text;
      }
    }
    vi.stubGlobal('SpeechSynthesisUtterance', UttStub);
    vi.stubGlobal('speechSynthesis', { cancel() {}, speak() {}, getVoices: () => [] });
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('ritual masuk → tiap soal diikuti susulan → ritual keluar → hasil', async () => {
    render(<MensetsuForm />);
    await waitFor(() => expect(screen.getByTestId('tab-simulasi')).toBeTruthy());
    fireEvent.click(screen.getByTestId('tab-simulasi'));
    await waitFor(() => expect(screen.getByTestId('simulasi-mulai')).toBeTruthy());

    fireEvent.click(screen.getByTestId('simulasi-mode-penuh'));
    /* Bank 2 soal → 4 langkah. Angkanya ditampilkan SEBELUM mulai, supaya
       siswa tidak kaget di tengah ronde. */
    expect(screen.getByTestId('simulasi-mode-penuh-jumlah').textContent).toContain('4');

    fireEvent.click(screen.getByTestId('simulasi-mulai'));

    /* 1. Ritual masuk — bukan soal. */
    await waitFor(() => expect(screen.getByTestId('simulasi-ritual-judul')).toBeTruthy());
    expect(screen.getByTestId('simulasi-ritual-judul').textContent).toBe('Masuk ruangan (入室)');
    expect(screen.queryByTestId('simulasi-transkrip')).toBeNull();
    for (const i of [0, 1]) {
      const kotak = screen
        .getByTestId(`simulasi-ritual-masuk-${i}`)
        .querySelector('input[type="checkbox"]') as HTMLInputElement;
      fireEvent.click(kotak);
    }
    fireEvent.click(screen.getByTestId('simulasi-ritual-lanjut'));

    /* 2. Soal pertama: teks TERSEMBUNYI. */
    await waitFor(() => expect(screen.getByTestId('simulasi-mendengarkan')).toBeTruthy());
    expect(screen.queryByTestId('simulasi-soal')).toBeNull();
    expect(screen.queryByTestId('simulasi-susulan-badge')).toBeNull();
    fireEvent.click(screen.getByTestId('simulasi-lihat-teks'));
    await waitFor(() => expect(screen.getByTestId('simulasi-soal')).toBeTruthy());

    const jawab = async (teks: string) => {
      const kotak = screen.getByTestId('simulasi-transkrip') as HTMLTextAreaElement;
      kotak.value = teks;
      fireEvent.input(kotak);
      fireEvent.click(screen.getByTestId('simulasi-kirim'));
    };

    await jawab('私の名前はブディと申します。');

    /* 3. Langkah kedua BUKAN soal kedua — ia susulan atas soal pertama. */
    await waitFor(() => expect(screen.getByTestId('simulasi-susulan-badge')).toBeTruthy());
    fireEvent.click(screen.getByTestId('simulasi-lihat-teks'));
    await waitFor(() => expect(screen.getByTestId('simulasi-soal')).toBeTruthy());
    await jawab('はい、がんばります。');

    /* 4. Langkah ketiga kembali ke pertanyaan utama — tanpa badge susulan. */
    await waitFor(() => expect(screen.getByTestId('simulasi-mendengarkan')).toBeTruthy());
    expect(screen.queryByTestId('simulasi-susulan-badge')).toBeNull();
    fireEvent.click(screen.getByTestId('simulasi-lihat-teks'));
    await waitFor(() => expect(screen.getByTestId('simulasi-soal')).toBeTruthy());
    await jawab('私の名前はブディと申します。');

    /* 5. Susulan soal kedua, lalu ritual keluar. */
    await waitFor(() => expect(screen.getByTestId('simulasi-susulan-badge')).toBeTruthy());
    fireEvent.click(screen.getByTestId('simulasi-lihat-teks'));
    await waitFor(() => expect(screen.getByTestId('simulasi-soal')).toBeTruthy());
    await jawab('はい、がんばります。');

    await waitFor(() => expect(screen.getByTestId('simulasi-ritual-judul')).toBeTruthy());
    expect(screen.getByTestId('simulasi-ritual-judul').textContent).toBe('Keluar ruangan (退室)');
    fireEvent.click(screen.getByTestId('simulasi-ritual-lanjut'));

    /* 6. Hasil: susulan terpisah dari nilai utama, ritual tercatat. */
    await waitFor(() => expect(screen.getByTestId('simulasi-hasil-penuh')).toBeTruthy());
    const ringkas = screen.getByTestId('simulasi-hasil-penuh').textContent ?? '';
    expect(ringkas).toContain('Pertanyaan susulan: 2');
    expect(ringkas).toContain('Ritual dicentang: 2/4');
    expect(document.querySelectorAll('[data-jenis="utama"]').length).toBe(2);
    expect(document.querySelectorAll('[data-jenis="susulan"]').length).toBe(2);
    /* Empat langkah, empat kali teks dibuka — dan itu terlihat, bukan gratis. */
    expect(screen.getByTestId('simulasi-hasil-terbuka').textContent).toContain(': 4');
  }, 30000);
});

// ==========================================
// 2026-10-29 — jalur REKAM, bukan SpeechRecognition.
//
// Laporan pemilik: "rekam suara gak bisa baik dari hp maupun dari destop".
// jsdom tidak punya SpeechRecognition DAN tidak punya MediaRecorder, jadi
// seluruh jalur mikrofon dulu tidak pernah tersentuh tes. Di sini keduanya
// dipalsukan untuk memaku sambungannya: tekan Rekam → berhenti → server
// men-transkripsi → teks masuk ke kotak jawaban.
// ==========================================
describe('/wawancara — rekam suara (MediaRecorder)', () => {
  class FakeMR {
    static isTypeSupported(m: string) {
      return m.startsWith('audio/webm');
    }
    mimeType = 'audio/webm';
    ondataavailable: ((e: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    private state: 'inactive' | 'recording' = 'inactive';
    start() {
      this.state = 'recording';
    }
    stop() {
      if (this.state !== 'recording') throw new Error('InvalidStateError');
      this.state = 'inactive';
      this.ondataavailable?.({ data: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' }) });
      this.onstop?.();
    }
  }

  beforeEach(() => {
    localStorage.clear();
    apiMock.mockReset();
    apiMock.mockImplementation(async (action: string) => {
      if (action === 'transkripsikanSuara') return { success: true, teks: '私はブディと申します。' };
      return BANK;
    });
    login();
    vi.stubGlobal('MediaRecorder', FakeMR);
    vi.stubGlobal('isSecureContext', true);
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) },
    });
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.unstubAllGlobals();
    // @ts-expect-error — jsdom tidak punya mediaDevices sama sekali.
    delete globalThis.navigator.mediaDevices;
  });

  it('rekam → berhenti → transkrip server masuk ke kotak jawaban', async () => {
    render(<MensetsuForm />);
    await waitFor(() => expect(screen.getByTestId('tab-simulasi')).toBeTruthy());
    fireEvent.click(screen.getByTestId('tab-simulasi'));
    await waitFor(() => expect(screen.getByTestId('simulasi-mulai')).toBeTruthy());
    fireEvent.click(screen.getByTestId('simulasi-mulai'));

    const mic = await screen.findByTestId('simulasi-mikrofon');
    fireEvent.click(mic);
    // Tombolnya berubah menjadi "Stop rekam" hanya setelah izin diberikan.
    await waitFor(() => expect(mic.getAttribute('aria-pressed')).toBe('true'));

    fireEvent.click(mic);

    await waitFor(() => {
      const call = apiMock.mock.calls.find((c) => c[0] === 'transkripsikanSuara');
      if (!call) throw new Error('transkripsikanSuara tidak dipanggil');
      const p = (call[1] as Array<{ mime: string; data: string }>)[0];
      expect(p.mime).toContain('audio/webm');
      expect(p.data.length).toBeGreaterThan(0);
    });

    await waitFor(() => {
      const kotak = screen.getByTestId('simulasi-transkrip') as HTMLTextAreaElement;
      expect(kotak.value).toBe('私はブディと申します。');
    });
  });
});
