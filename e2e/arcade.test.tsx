/**
 * TESTS: dua game arcade `/arcade` — Genba Order Rush & Kotoba Combo Builder.
 *
 * KENAPA DI `e2e/`: `indexer` menghitung seluruh berkas di bawah `src/**`, jadi
 * suite baru di sana memindahkan counter beku. `e2e/**\/*.test.tsx` masuk proyek
 * `frontend` (jsdom) dan tidak menggerakkan counter apa pun.
 *
 * YANG DIUJI — perilaku yang terlihat, bukan implementasi:
 *   1. Genba: perintah muncul, meja punya 6 barang, rak 4, dan menjawab BENAR
 *      benar-benar memajukan perintah (skor naik), sedangkan menjawab SALAH
 *      menampilkan koreksi.
 *   2. Combo: target kalimat tampil, mengetuk kartu yang benar mengisi rel, dan
 *      kartu jebakan menghasilkan umpan balik + kombo kembali ke x1.
 *
 * Soal di Genba dirakit ACAK, jadi tes tidak boleh menebak warna/barangnya —
 * ia MEMBACA perintahnya lebih dulu, lalu memilih yang cocok. Tes yang menebak
 * akan hijau hanya kalau undiannya kebetulan benar.
 */
import { render, screen, cleanup, waitFor } from '@testing-library/preact';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import ArcadeGame from '../src/components/candidate/ArcadeGame';
import { COMBO_SOAL } from '../src/lib/arcade';

const tombol = (): HTMLButtonElement[] => [...document.querySelectorAll('button')] as HTMLButtonElement[];
const cariTombol = (teks: string): HTMLButtonElement | undefined =>
  tombol().find((b) => (b.textContent || '').includes(teks));

const perintahTeks = (): string =>
  document.querySelector('[data-testid="arcade-perintah"]')?.textContent?.trim() ?? '';

describe('arcade — Genba Order Rush', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
  });

  it('perintah memakai pola yang benar dan meja berisi 6 barang + 4 rak', async () => {
    render(<ArcadeGame />);
    cariTombol('Mulai Shift')?.click();

    await waitFor(() => expect(perintahTeks()).toContain('おいてください'));

    /* Pola: `<warna> <barang> を <zona> に おいてください`. Partikelnya bagian
       dari yang diuji — kalau `を`/`に` hilang, siswa belajar kalimat yang salah. */
    expect(perintahTeks()).toMatch(/^\S+ \S+ を .+ に おいてください$/);

    /* 4 rak + 6 barang = 10 tombol di area permainan, ditambah 2 tab. */
    expect(cariTombol('Rak Atas')).toBeTruthy();
    expect(cariTombol('Kotak Kanan')).toBeTruthy();
  });

  /* REGRESI: kehabisan waktu dengan nyawa masih tersisa dulu MENGAKIBATKAN
     LAYAR MACET — sumbu 0, perintah tidak berganti, tidak ada yang bisa
     diketuk. Versi pertama saya hanya mengurangi nyawa di dalam efek timer
     tanpa memanggil jalur `gagal()`, sehingga perintah berikutnya tidak pernah
     dipasang. */
  it('kehabisan waktu memajukan perintah (tidak mengunci layar)', async () => {
    render(<ArcadeGame />);
    cariTombol('Mulai Shift')?.click();
    await waitFor(() => expect(perintahTeks()).toContain('おいてください'));
    const awal = perintahTeks();

    /* Batas waktu 8 detik; beri ruang untuk jeda 1,1 detik sebelum perintah
       berikutnya dipasang. */
    await waitFor(() => expect(perintahTeks()).not.toBe(awal), { timeout: 14000 });
  }, 20000);

  it('memilih barang lalu rak yang BENAR memajukan perintah', async () => {
    render(<ArcadeGame />);
    cariTombol('Mulai Shift')?.click();
    await waitFor(() => expect(perintahTeks()).toContain('おいてください'));

    const awal = perintahTeks();
    const m = awal.match(/^(\S+) (\S+) を (.+?) に おいてください$/);
    expect(m, `perintah tak terbaca: ${awal}`).toBeTruthy();
    const [, warna, barang, zona] = m as RegExpMatchArray;

    /* Barang di meja diberi label `<warna.jp><barang.jp>` tanpa spasi. */
    const kartuBarang = cariTombol(`${warna}${barang}`);
    expect(kartuBarang, `barang ${warna}${barang} tidak ada di meja`).toBeTruthy();
    kartuBarang?.click();

    /* Tunggu state `dipilih` ter-commit SEBELUM mengetuk rak. Mengetuk keduanya
       dalam satu frame membuat handler rak masih membaca `dipilih = null` dan
       kliknya diabaikan — di browser manusia tidak mungkin secepat itu, tapi
       tes bisa, dan itulah yang membuat tes ini merah saat pertama ditulis. */
    await waitFor(() => expect(cariTombol(`${warna}${barang}`)?.getAttribute('aria-pressed')).toBe('true'));

    const rak = cariTombol(zona);
    expect(rak, `rak "${zona}" tidak ada`).toBeTruthy();
    rak?.click();

    /* Perintah berganti — bukan pesan salah. */
    await waitFor(() => expect(perintahTeks()).not.toBe(awal));
  });
});

describe('arcade — Kotoba Combo Builder', () => {
  afterEach(() => {
    cleanup();
  });

  it('target kalimat tampil dan kartu pertama yang benar mengisi rel', async () => {
    render(<ArcadeGame />);
    cariTombol('Combo Kalimat')?.click();

    await waitFor(() => expect(screen.getByTestId('arcade-target')).toBeTruthy());
    expect(screen.getByTestId('arcade-target').textContent).toContain(COMBO_SOAL[0].indo);

    const pertama = COMBO_SOAL[0].urutan[0].jp;
    const kartu = tombol().find((b) => (b.textContent || '').trim() === pertama);
    expect(kartu, `kartu "${pertama}" tidak ada`).toBeTruthy();
    kartu?.click();

    /* Rel menampilkan kata yang baru diketuk. */
    await waitFor(() => {
      const rel = document.body.textContent || '';
      expect(rel).toContain(pertama);
    });
  });

  it('kartu jebakan memberi umpan balik dan kombo kembali ke x1', async () => {
    render(<ArcadeGame />);
    cariTombol('Combo Kalimat')?.click();
    await waitFor(() => expect(screen.getByTestId('arcade-target')).toBeTruthy());

    /* Ambil jebakan pertama soal 1 — ia TIDAK pernah sah di posisi mana pun. */
    const jebakan = COMBO_SOAL[0].jebakan[0].jp;
    const kartu = tombol().find((b) => (b.textContent || '').trim() === jebakan);
    expect(kartu, `kartu jebakan "${jebakan}" tidak ada`).toBeTruthy();
    kartu?.click();

    /* Umpan balik muncul, dan kombo jatuh ke x1. */
    await waitFor(() => expect(document.body.textContent || '').toContain('x1'));
    expect(document.body.textContent || '').not.toContain('x2');
  });
});
