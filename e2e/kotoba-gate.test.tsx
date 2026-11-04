/**
 * TESTS: siapa yang boleh membuka minigame kosakata `/kotoba`.
 *
 * KENAPA DI `e2e/`: `indexer` menghitung SELURUH berkas di bawah `src/**`, jadi
 * `.test.tsx` baru di sana memindahkan counter beku. `e2e/**\/*.test.tsx` masuk
 * proyek `frontend` (jsdom) dan tidak menggerakkan counter apa pun.
 *
 * YANG DIUJI (tiga tingkat yang sama dengan `/wawancara`)
 * -----------------------------------------------------
 *   (a) belum login        ⇒ gerbang login, TIDAK ada permainan, dan TIDAK ada
 *                            kartu "khusus siswa" (status belum diketahui —
 *                            jangan menuduh sebelum tahu);
 *   (b) login, bukan siswa ⇒ kartu "khusus siswa ASJ", bukan permainan;
 *   (c) login, siswa ASJ   ⇒ permainan benar-benar dirender;
 *   (d) admin              ⇒ tanpa gerbang (dipakai panel admin).
 *
 * (c) dan (d) ada supaya (a)/(b) tidak bisa hijau hanya karena SEMUA diblokir —
 * gerbang yang tidak pernah membuka apa pun juga akan lulus dua tes pertama.
 *
 * Penjaga sebenarnya di server (`e2e/kotoba-guard.test.ts`); berkas ini menjaga
 * perilaku yang terlihat, supaya kartu dan guard tidak berbeda pendapat.
 */
import { render, screen, cleanup, waitFor } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import KotobaGame, { dalamRentangBab, jatuhTempo, JARAK_HARI, hitungStreak, tanggalLokal, gelarDari, GELAR } from '../src/components/candidate/KotobaGame';
import { authStore } from '../src/store/authReactive';

/* `vi.hoisted` wajib: `vi.mock` diangkat ke atas `const`. */
const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/lib/apiClient', () => ({ apiClient: apiMock }));

/** Bank mini — cukup untuk membuktikan permainan dirender. */
const BANK_SISWA = {
  success: true,
  isVip: true,
  jumlah: 4,
  bab: [1],
  kosakata: [
    { b: 1, pos: 'noun', k: '私', h: 'わたし', r: 'watashi', id: 'Saya' },
    { b: 1, pos: 'noun', k: '学生', h: 'がくせい', r: 'gakusei', id: 'Pelajar' },
    { b: 1, pos: 'noun', k: '先生', h: 'せんせい', r: 'sensei', id: 'Guru' },
    { b: 1, pos: 'noun', k: '医者', h: 'いしゃ', r: 'isha', id: 'Dokter' },
    { b: 1, pos: 'noun', k: '病院', h: 'びょういん', r: 'byouin', id: 'Rumah sakit' },
  ],
};

const TOLAK_NON_SISWA = { success: false, isVip: false, message: 'khusus siswa ASJ' };

/** Kanji → arti, untuk menemukan tombol jawaban yang BENAR di tes ronde. */
const ARTI: Record<string, string> = Object.fromEntries(
  BANK_SISWA.kosakata.map((v) => [v.k, v.id]),
);

function loginSebagai(role: 'admin' | 'kandidat') {
  authStore.set({
    role,
    name: role === 'admin' ? 'admin' : 'Budi',
    wa: '081234567890',
    sessionToken: `uji-${role}`,
    refreshToken: '',
    isLoggedIn: true,
    lastChecked: Date.now(),
  });
}

describe('/kotoba — siswa ASJ saja', () => {
  beforeEach(() => {
    localStorage.clear();
    apiMock.mockReset();
    apiMock.mockResolvedValue(BANK_SISWA);
    /* Status auth bocor antar-tes kalau tidak direset: `authStore` adalah atom
       modul, bukan state komponen. */
    authStore.set({
      role: 'guest',
      name: '',
      wa: '',
      sessionToken: '',
      refreshToken: '',
      isLoggedIn: false,
      lastChecked: 0,
    });
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('tanpa sesi: gerbang login, bukan permainan dan bukan kartu "khusus siswa"', () => {
    render(<KotobaGame />);

    expect(document.querySelector('input[type="password"]')).toBeTruthy();
    expect(document.querySelector('input[type="tel"]')).toBeTruthy();
    /* Tab mode hanya ada di permainan. */
    expect(screen.queryByText('Flashcard')).toBeNull();
    /* Status siswa belum diketahui sebelum login — jangan menuduh. */
    expect(screen.queryByTestId('kotoba-khusus-vip')).toBeNull();
  });

  it('kandidat login yang bukan siswa: kartu "khusus siswa ASJ", permainan tidak dirender', async () => {
    loginSebagai('kandidat');
    apiMock.mockResolvedValue(TOLAK_NON_SISWA);

    render(<KotobaGame />);

    await waitFor(() => expect(screen.getByTestId('kotoba-khusus-vip')).toBeTruthy());
    expect(screen.queryByText('Flashcard')).toBeNull();
    /* Pesan "bank kosong" akan menyalahkan data, padahal statusnya yang kurang. */
    expect(screen.queryByText(/Bank kosakata kosong/)).toBeNull();
  });

  it('kandidat login yang siswa ASJ: permainan benar-benar dirender', async () => {
    loginSebagai('kandidat');

    render(<KotobaGame />);

    await waitFor(() => expect(screen.getByText('Flashcard')).toBeTruthy());
    expect(screen.queryByTestId('kotoba-khusus-vip')).toBeNull();
    /* Satu soal pilihan ganda = empat tombol jawaban. Tanpa ini, "dirender"
       bisa berarti cangkang kosong yang tidak bisa dimainkan. */
    await waitFor(() => {
      const opsi = [...document.querySelectorAll('button')].filter((b) =>
        b.className.includes('rounded-control border text-left'),
      );
      expect(opsi.length).toBe(4);
    });
  });

  it('admin: tanpa gerbang login (dipakai panel admin)', async () => {
    loginSebagai('admin');

    render(<KotobaGame />);

    expect(document.querySelector('input[type="password"]')).toBeNull();
    await waitFor(() => expect(screen.getByText('Flashcard')).toBeTruthy());
  });

  /* ── Bentuk ronde ──────────────────────────────────────────────────────
     Pemilik 2026-10-27: "kok cuma 5 ronde ya gak kek game html yg asli
     sampai nyawanya mati". Dua tes di bawah mengunci KEDUA arah, dan keduanya
     perlu: kalau hanya "berjalan >10 soal" yang diuji, ronde yang tidak pernah
     berakhir sama sekali akan lulus. */

  it('ronde TIDAK berhenti setelah 10 soal — berjalan sampai nyawa habis', async () => {
    loginSebagai('kandidat');
    render(<KotobaGame />);
    await waitFor(() => expect(screen.getByTestId('kotoba-soal')).toBeTruthy());

    /* Jawab BENAR dua belas kali — lebih dari batas 10 soal yang dulu dipakai. */
    for (let i = 0; i < 12; i++) {
      const kana = screen.getByTestId('kotoba-soal').textContent || '';
      const arti = ARTI[kana];
      expect(arti, `soal tak dikenal: ${kana}`).toBeTruthy();
      const tombol = [...document.querySelectorAll('button')]
        .filter((b) => b.className.includes('rounded-control border text-left'))
        .find((b) => b.querySelector('span')?.textContent === arti);
      expect(tombol, `opsi "${arti}" tidak ada`).toBeTruthy();
      tombol?.click();
      /* Jeda 750 ms antar soal (yang benar) — beri ruang lebih. */
      await new Promise((r) => setTimeout(r, 900));
    }

    expect(screen.queryByTestId('kotoba-hasil')).toBeNull();
    expect(screen.getByTestId('kotoba-soal')).toBeTruthy();
  }, 30000);

  it('ronde BERAKHIR saat nyawa habis — tiga jawaban salah', async () => {
    loginSebagai('kandidat');
    render(<KotobaGame />);
    await waitFor(() => expect(screen.getByTestId('kotoba-soal')).toBeTruthy());

    for (let i = 0; i < 3; i++) {
      const kana = screen.getByTestId('kotoba-soal').textContent || '';
      const arti = ARTI[kana];
      const salah = [...document.querySelectorAll('button')]
        .filter((b) => b.className.includes('rounded-control border text-left'))
        .find((b) => b.querySelector('span')?.textContent !== arti);
      salah?.click();
      await new Promise((r) => setTimeout(r, 1600));
    }

    await waitFor(() => expect(screen.getByTestId('kotoba-hasil')).toBeTruthy());
  }, 30000);

  /* Mode kilat: waktu habis = salah.
     Bar `sisaWaktu` sudah ada di layar sejak dulu tetapi TIDAK PERNAH bergerak —
     ia hanya direset 100 di setiap soal, jadi menggambar sesuatu yang tidak
     benar. Tes ini mengunci bahwa ia benar-benar menghabiskan waktu dan bahwa
     kehabisan waktu MEMAKAN nyawa, bukan diam saja. */
  /* Bom Sakura: satu hitungan untuk SELURUH ronde, bukan per soal.
     Yang diuji adalah angka pada sumbunya benar-benar turun — bukan sekadar
     "layar hasil muncul", karena tes semacam itu lolos walau timernya mati
     (kesalahan yang sudah sekali saya buat di mode kilat). */
  it('Bom Sakura: sumbu 60 detik berjalan dan berkurang', async () => {
    loginSebagai('kandidat');
    render(<KotobaGame />);
    await waitFor(() => expect(screen.getByTestId('kotoba-soal')).toBeTruthy());

    const tab = [...document.querySelectorAll('button')].find((b) =>
      (b.textContent || '').includes('Bom Sakura'),
    );
    expect(tab, 'tab Bom Sakura tidak ada').toBeTruthy();
    tab?.click();

    const bacaSumbu = () => {
      const el = document.querySelector('[role="timer"]');
      const m = (el?.textContent || '').match(/(\d+)\s*d/);
      return m ? Number(m[1]) : NaN;
    };
    await waitFor(() => expect(Number.isNaN(bacaSumbu())).toBe(false));
    /* REGRESI: Bom Sakura harus merender 4 tombol pilihan ganda, BUKAN input ketik romaji. */
    const opsi = [...document.querySelectorAll('button')].filter((b) =>
      b.className.includes('rounded-control border text-left'),
    );
    expect(opsi.length).toBe(4);
    expect(document.querySelector('#kotoba-ketik')).toBeNull();
    const awal = bacaSumbu();
    expect(awal).toBeGreaterThan(50);

    await new Promise((r) => setTimeout(r, 1500));
    expect(bacaSumbu(), 'sumbu tidak berkurang').toBeLessThan(awal);
  }, 30000);

  it('mode kilat memperpendek batas waktu (4 s), bukan menambah timer kedua', async () => {
    loginSebagai('kandidat');
    render(<KotobaGame />);
    await waitFor(() => expect(screen.getByTestId('kotoba-soal')).toBeTruthy());

    const cariTombol = () =>
      [...document.querySelectorAll('button')].find((b) => (b.textContent || '').includes('Kilat'));
    const nilaiBar = () => Number(document.querySelector('[aria-valuenow]')?.getAttribute('aria-valuenow'));

    /* UKUR LAJU, bukan sekadar "ada yang berubah". Timer bawaan 9 detik; kilat
       4 detik. Setelah 1,2 detik: normal ~87, kilat ~70. Ambang 80 memisahkan
       keduanya dengan jarak yang cukup jauh sehingga tidak flaky.
       Percobaan pertama saya hanya menunggu layar hasil muncul — tes itu LOLOS
       walau timer sengaja dimatikan, jadi ia tidak mengukur apa pun. */
    const sebelum = nilaiBar();
    expect(sebelum).toBeGreaterThan(80);

    cariTombol()?.click();
    await waitFor(() => {
      const kini = cariTombol();
      expect(kini?.getAttribute('aria-pressed')).toBe('true');
    });

    await new Promise((r) => setTimeout(r, 1200));
    const sesudah = nilaiBar();
    expect(sesudah, `bar ${sebelum} -> ${sesudah}; kilat tidak memperpendek waktu`).toBeLessThan(80);
  }, 30000);
});

// ==========================================
// Rentang bab — "bab 1 sampai 10", bukan satu bab.
//
// Pemilik 2026-11-03: *"bank kotoba kanji tolong bikin pilihannya secara
// universal bisa milih kek milih bab 1- bab 10, milih bab 1-25 begitu?"*.
// Dulu filternya satu <select> per bab, jadi memilih "1 sampai 10" berarti
// bermain sepuluh kali. Aturannya diuji di sini sebagai fungsi murni: tanpa
// render, tanpa bank, jadi angkanya tidak bisa lolos karena kebetulan.
// ==========================================
describe('kotoba — rentang bab', () => {
  it('dua batas kosong = semua bab', () => {
    for (const b of [0, 1, 25, 50]) expect(dalamRentangBab(b, '', '')).toBe(true);
  });

  it('bab 1 sampai 10 memuat 1..10 dan menolak 11', () => {
    for (let b = 1; b <= 10; b++) expect(dalamRentangBab(b, '1', '10')).toBe(true);
    expect(dalamRentangBab(11, '1', '10')).toBe(false);
    expect(dalamRentangBab(0, '1', '10')).toBe(false);
  });

  it('bab 1 sampai 25', () => {
    expect(dalamRentangBab(1, '1', '25')).toBe(true);
    expect(dalamRentangBab(25, '1', '25')).toBe(true);
    expect(dalamRentangBab(26, '1', '25')).toBe(false);
  });

  it('batas yang DIBALIK dibaca sebagai rentang yang sama, bukan kosong', () => {
    // Menukar dua kotak itu kekeliruan wajar; menjawab "0 kata" membuat siswa
    // mengira banknya rusak. Rentang 25→10 dibaca sebagai 10..25.
    expect(dalamRentangBab(5, '25', '10')).toBe(false);
    expect(dalamRentangBab(10, '25', '10')).toBe(true);
    expect(dalamRentangBab(17, '25', '10')).toBe(true);
    expect(dalamRentangBab(25, '25', '10')).toBe(true);
    expect(dalamRentangBab(9, '25', '10')).toBe(false);
    expect(dalamRentangBab(26, '25', '10')).toBe(false);
  });

  it('satu batas saja tetap bekerja', () => {
    expect(dalamRentangBab(3, '3', '')).toBe(true);
    expect(dalamRentangBab(2, '3', '')).toBe(false);
    expect(dalamRentangBab(3, '', '3')).toBe(true);
    expect(dalamRentangBab(4, '', '3')).toBe(false);
  });
});

// ==========================================
// Spaced repetition (Leitner). Pemilik 2026-11-03: *"lanjut sesuai rekom"*.
//
// Sebelum ini progres hanya menyimpan benar/salah TANPA waktu, jadi tidak ada
// cara tahu kata mana yang jatuh tempo — siswa hanya bisa mengulang satu bab
// penuh. Jadwal diuji sebagai fungsi murni supaya ambangnya tidak bisa bergeser
// diam-diam.
// ==========================================
describe('kotoba — jatuh tempo (Leitner)', () => {
  const HARI = 86_400_000;
  const kini = 1_800_000_000_000;

  it('kata yang BELUM pernah dijawab bukan "jatuh tempo"', () => {
    // Kalau ini true, filter "jatuh tempo" akan menampilkan seluruh bank dan
    // artinya hilang.
    expect(jatuhTempo(undefined, kini)).toBe(false);
  });

  it('kotak 1: besok sudah jatuh tempo, hari ini belum', () => {
    expect(jatuhTempo({ salah: 0, benar: 1, kotak: 1, terakhir: kini }, kini)).toBe(false);
    expect(jatuhTempo({ salah: 0, benar: 1, kotak: 1, terakhir: kini - HARI }, kini)).toBe(true);
  });

  it('kotak 5 baru jatuh tempo setelah 16 hari', () => {
    expect(jatuhTempo({ salah: 0, benar: 5, kotak: 5, terakhir: kini - 15 * HARI }, kini)).toBe(false);
    expect(jatuhTempo({ salah: 0, benar: 5, kotak: 5, terakhir: kini - 16 * HARI }, kini)).toBe(true);
  });

  it('catatan LAMA tanpa kotak/terakhir diperlakukan sebagai kotak 1 yang jatuh tempo', () => {
    // Progres sebelum perubahan ini tidak punya field baru; membuangnya berarti
    // menghapus riwayat yang masih berharga.
    expect(jatuhTempo({ salah: 2, benar: 1 }, kini)).toBe(true);
  });

  it('kotak di luar rentang dijepit, bukan membuat indeks meleset', () => {
    expect(JARAK_HARI.length).toBe(5);
    expect(jatuhTempo({ salah: 0, benar: 0, kotak: 99, terakhir: kini - 16 * HARI }, kini)).toBe(true);
    expect(jatuhTempo({ salah: 0, benar: 0, kotak: 0, terakhir: kini }, kini)).toBe(false);
  });
});

// ==========================================
// Streak harian — penggerak kebiasaan, bukan skor. Diuji sebagai fungsi murni
// supaya aturan "bolong = kembali ke 1" tidak bisa berubah tanpa ketahuan.
// ==========================================
describe('kotoba — streak harian', () => {
  it('pertama kali bermain → 1', () => {
    expect(hitungStreak(undefined, '2026-11-03', '2026-11-02')).toEqual({ hari: '2026-11-03', jumlah: 1 });
  });

  it('hari yang sama TIDAK menambah', () => {
    const s = { hari: '2026-11-03', jumlah: 4 };
    expect(hitungStreak(s, '2026-11-03', '2026-11-02')).toEqual(s);
  });

  it('berturut-turut menambah satu', () => {
    expect(hitungStreak({ hari: '2026-11-02', jumlah: 4 }, '2026-11-03', '2026-11-02')).toEqual({
      hari: '2026-11-03',
      jumlah: 5,
    });
  });

  it('bolong sehari → kembali ke 1, bukan melanjutkan', () => {
    // Ini yang membedakan streak dari "total hari bermain".
    expect(hitungStreak({ hari: '2026-11-01', jumlah: 9 }, '2026-11-03', '2026-11-02')).toEqual({
      hari: '2026-11-03',
      jumlah: 1,
    });
  });

  it('tanggalLokal memakai waktu LOKAL, bukan UTC', () => {
    // 1 Januari 00:30 lokal: `toISOString()` bisa saja masih 31 Desember.
    const d = new Date(2026, 0, 1, 0, 30);
    expect(tanggalLokal(d)).toBe('2026-01-01');
  });
});

// ==========================================
// Gelar siswa. Diukur dari KATA YANG DIKUASAI, bukan skor ronde: skor bisa
// dinaikkan dengan mengulang bab yang sama, sedangkan "dikuasai" hanya bertambah
// kalau sebuah kata benar tiga kali tanpa salah.
// ==========================================
describe('kotoba — gelar', () => {
  it('tangga gelar naik tepat di ambangnya, tidak melompat', () => {
    expect(gelarDari(0)).toBe('kotoba.gelar_kohai');
    expect(gelarDari(49)).toBe('kotoba.gelar_kohai');
    expect(gelarDari(50)).toBe('kotoba.gelar_senpai');
    expect(gelarDari(149)).toBe('kotoba.gelar_senpai');
    expect(gelarDari(150)).toBe('kotoba.gelar_master');
    expect(gelarDari(399)).toBe('kotoba.gelar_master');
    expect(gelarDari(400)).toBe('kotoba.gelar_siap');
  });

  it('ambangnya menurun, dan yang terendah 0 — tidak ada celah', () => {
    /* Kalau daftar tidak terurut menurun, `gelarDari` akan mengembalikan gelar
       yang salah untuk sebagian angka tanpa error apa pun. */
    for (let i = 1; i < GELAR.length; i++) expect(GELAR[i].min).toBeLessThan(GELAR[i - 1].min);
    expect(GELAR[GELAR.length - 1].min).toBe(0);
  });
});

// ==========================================
// "Kata dikuasai" harus GLOBAL, bukan mengikuti filter.
//
// Ditemukan saat review 2026-11-04: angka ini dulu dihitung dari `pool` yang
// sudah tersaring, sehingga memilih sumber/rentang bab membuat seolah siswa
// LUPA kata yang sudah dikuasai — dan gelar yang diturunkan darinya ikut
// turun tanpa alasan.
// ==========================================
describe('kotoba — kata dikuasai tidak ikut filter', () => {
  const WA = '081234567890';
  const bacaJumlah = () => {
    const m = (document.body.textContent || '').match(/(\d+)\s+dikuasai/);
    return m ? Number(m[1]) : NaN;
  };

  beforeEach(() => {
    localStorage.clear();
    /* Mock API wajib dipasang ulang di sini: blok describe ini berada di luar
       `beforeEach` milik tes gerbang, jadi tanpanya komponen merender layar
       galat dan bukan permainan. */
    apiMock.mockReset();
    apiMock.mockResolvedValue(BANK_SISWA);
    /* Kelima kata di bank tiruan ditandai dikuasai (benar >= 3, salah 0). */
    const kata: Record<string, { salah: number; benar: number }> = {};
    for (const k of ['私|わたし', '学生|がくせい', '先生|せんせい', '医者|いしゃ', '病院|びょういん']) {
      kata[k] = { salah: 0, benar: 3 };
    }
    localStorage.setItem(`asj_kotoba_v1:${WA}`, JSON.stringify({ rekor: 0, kata }));
    loginSebagai('kandidat');
  });

  afterEach(() => {
    cleanup();
  });

  it('berpindah sumber ke N5 (yang kosong) tidak mengurangi jumlah yang dikuasai', async () => {
    render(<KotobaGame />);
    await waitFor(() => expect(screen.getByTestId('kotoba-soal')).toBeTruthy());
    await waitFor(() => expect(bacaJumlah()).toBe(5));

    /* Sumber N5 kosong di bank tiruan ini ⇒ `pool` menjadi nol kata. Dengan
       perhitungan lama (dari `pool`), angka "dikuasai" ikut jatuh ke 0 — seolah
       siswa lupa semua yang sudah dikuasai hanya karena berpindah tab. */
    const tabN5 = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === 'N5');
    expect(tabN5, 'tombol sumber N5 tidak ada').toBeTruthy();
    tabN5?.click();

    await new Promise((r) => setTimeout(r, 150));
    expect(bacaJumlah(), 'angka ikut turun karena berpindah sumber').toBe(5);
  }, 20000);
});
