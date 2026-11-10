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
import { COMBO_SOAL, GENBA_ZONA, SHIFT_GENBA } from '../src/lib/arcade';
import { authStore } from '../src/store/authReactive';
import { langStore } from '../src/store/i18n';

/** `/arcade` bergerbang login; tes perilaku game harus masuk dulu. */
function loginSebagaiSiswa() {
  authStore.set({
    role: 'kandidat',
    name: 'Budi',
    wa: '081234567890',
    sessionToken: 'uji-kandidat',
    refreshToken: '',
    isLoggedIn: true,
    lastChecked: Date.now(),
  });
}

const tombol = (): HTMLButtonElement[] => [...document.querySelectorAll('button')] as HTMLButtonElement[];
const cariTombol = (teks: string): HTMLButtonElement | undefined =>
  tombol().find((b) => (b.textContent || '').includes(teks));

const perintahTeks = (): string =>
  document.querySelector('[data-testid="arcade-perintah"]')?.textContent?.trim() ?? '';

/** ID rak yang SEDANG ditampilkan (subset 4–6, bukan seluruh 12). */
const rakTampil = (): string[] =>
  [...document.querySelectorAll('[data-zona]')].map((el) => el.getAttribute('data-zona') || '');

/**
 * Tombol rak berdasarkan ID.
 *
 * JANGAN mencari rak lewat teks Jepangnya: pada 8 rak (mode rapat) label Jepang
 * disembunyikan supaya kartunya muat, sehingga `cariTombol(zona)` tidak
 * menemukan apa pun — dan tesnya gagal pada undian, bukan pada perilaku.
 */
const rakId = (id: string): HTMLButtonElement | null =>
  document.querySelector(`[data-zona="${id}"]`) as HTMLButtonElement | null;

describe('arcade — gerbang login', () => {
  afterEach(() => {
    cleanup();
  });

  it('belum login: formulir masuk tampil, TIDAK ada permainan', () => {
    authStore.set({
      role: 'kandidat', name: '', wa: '', sessionToken: '', refreshToken: '',
      isLoggedIn: false, lastChecked: 0,
    });
    render(<ArcadeGame />);

    /* Dua arah sekaligus: formulir ADA, dan tombol "Mulai Shift" TIDAK ADA.
       Menguji salah satu saja akan lolos untuk gerbang yang tidak memasang apa
       pun (formulir hilang) atau yang tidak menutup apa pun (permainan tetap
       tampil). */
    expect(document.querySelector('input[type="password"]')).toBeTruthy();
    expect(cariTombol('Mulai Shift')).toBeUndefined();
  });
});

describe('arcade — Genba Order Rush', () => {
  beforeEach(() => {
    localStorage.clear();
    loginSebagaiSiswa();
  });
  afterEach(() => {
    cleanup();
  });

  it('perintah memakai pola yang benar dan meja berisi 6 barang + 8 rak', async () => {
    render(<ArcadeGame />);
    cariTombol('Mulai Shift')?.click();

    await waitFor(() => expect(perintahTeks()).toContain('おいてください'));

    /* Pola: `<warna> <barang> を <zona> に おいてください`. Partikelnya bagian
       dari yang diuji — kalau `を`/`に` hilang, siswa belajar kalimat yang salah. */
    expect(perintahTeks()).toMatch(/^\S+ \S+ を .+ に おいてください$/);

    /* Sejak 2026-11-05 rak yang digambar adalah SUBSET (4 pada gelombang 1),
       bukan kedua belas rak: di layar 390 px dua belas rak mendorong meja kerja
       ke bawah lipatan. Yang perlu dibuktikan: jumlahnya sesuai aturan, dan rak
       yang benar ADA di antaranya. */
    const rak = rakTampil();
    expect(rak).toHaveLength(4);
    const zonaPerintah = perintahTeks().match(/を (.+?) に おいてください$/)?.[1] ?? '';
    const idBenar = GENBA_ZONA.find((z) => z.jp === zonaPerintah)?.id;
    expect(idBenar, `zona tak dikenal: ${zonaPerintah}`).toBeTruthy();
    expect(rak).toContain(idBenar);
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

  /* REGRESI: ketukan kedua setelah gagal TIDAK boleh memakan nyawa lagi.
     Dulu `fase` tetap 'main' dan `dipilih` tetap terpasang selama jeda 1,1 detik,
     jadi mengetuk rak salah dua kali menghabiskan dua nyawa sekaligus. */
  it('salah dua kali cepat hanya menghabiskan SATU nyawa', async () => {
    render(<ArcadeGame />);
    cariTombol('Mulai Shift')?.click();
    await waitFor(() => expect(perintahTeks()).toContain('おいてください'));

    const awal = perintahTeks().match(/^(\S+) (\S+) を (.+?) に おいてください$/);
    expect(awal).toBeTruthy();
    const [, warna, barang, zona] = awal as RegExpMatchArray;

    const kartu = cariTombol(`${warna}${barang}`);
    kartu?.click();
    await waitFor(() => expect(cariTombol(`${warna}${barang}`)?.getAttribute('aria-pressed')).toBe('true'));

    /* Rak yang SALAH. Pemetaan ini WAJIB eksplisit: label di layar berbahasa
       Indonesia sedangkan `zona` berbahasa Jepang, jadi menebak dengan
       `includes()` selalu "tidak cocok" dan bisa memilih rak yang justru BENAR —
       tesnya lalu lolos atau gagal karena undian, bukan karena perilaku.

       Sejak rak di-SUBSET, pilihan salah harus diambil dari rak yang benar-benar
       dirender. Menulis daftar tangan (atau memakai seluruh GENBA_ZONA) membuat
       tes mengetuk tombol yang tidak ada, dan `undefined?.click()` lolos tanpa
       menguji apa pun. */
    const idBenar = GENBA_ZONA.find((z) => z.jp === zona)?.id;
    expect(idBenar, `zona tak dikenal: ${zona}`).toBeTruthy();
    const idSalah = rakTampil().find((id) => id !== idBenar);
    expect(idSalah, 'tidak ada rak salah di layar').toBeTruthy();
    const labelSalah = GENBA_ZONA.find((z) => z.id === idSalah)?.id_;
    const rakSalah = cariTombol(labelSalah ?? 'Rak Atas');
    expect(rakSalah, `rak salah "${labelSalah}" tidak ada`).toBeTruthy();
    rakSalah?.click();
    /* Beri satu frame supaya state ter-commit — MENIRU manusia yang mengetuk dua
       kali berjarak ~100 ms. Dua klik dalam tick yang sama sama-sama membaca
       `nyawa` lama, jadi hasilnya 2 pada kedua versi dan tesnya tidak mengukur
       apa pun. */
    await new Promise((r) => setTimeout(r, 60));
    rakSalah?.click();

    /* Jeda TETAP, bukan `waitFor`: `waitFor` berhenti begitu kondisinya benar,
       dan kondisinya sudah benar (2 helm) SEBELUM ketukan kedua diproses — jadi
       ia tidak pernah melihat kerusakan yang dicari. */
    await new Promise((r) => setTimeout(r, 150));
    const helm = (document.body.textContent || '').match(/⛑️/g) || [];
    expect(helm.length, 'ketukan kedua memakan nyawa lagi').toBe(2);
  }, 15000);

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

    const idRak = GENBA_ZONA.find((z) => z.jp === zona)?.id ?? '';
    const rak = rakId(idRak);
    expect(rak, `rak "${zona}" tidak ada`).toBeTruthy();
    rak?.click();

    /* Bukti jawaban benar adalah SKOR, bukan "perintahnya berubah".
       Versi pertama memeriksa teks perintah berganti — dan itu RAPUH: perintah
       dirakit acak, jadi undian bisa menghasilkan kalimat yang sama persis dan
       tesnya merah padahal perilakunya benar (terukur: gagal sekali di suite
       penuh, lolos 3/3 sendirian). Skor tidak bisa kebetulan.

       Angka pastinya TIDAK dikunci: sejak 2026-11-05 bonus kecepatan berlaku
       pada jawaban PERTAMA juga (0–50), jadi hasilnya 100–150. Mengunci ¥100
       membuat tes ini merah setiap kali ekonomi skornya diubah, padahal yang
       perlu dibuktikan adalah skornya NAIK. */
    await waitFor(() => {
      const angka = Number((document.body.textContent || '').match(/¥\s*(\d+)/)?.[1] ?? '0');
      expect(angka).toBeGreaterThanOrEqual(100);
    });
  });

  /* REGRESI 2026-11-05: versi pertama berjalan terus sampai tiga kesalahan,
     jadi satu-satunya akhir yang mungkin adalah KALAH. Tes ini menuntut akhir
     yang MENANG — 12 pesanan benar harus menghasilkan kartu hasil dengan nilai
     dan bintang. Kalau `target` salah, atau `selesaikan` tidak pernah dipanggil,
     shift berjalan selamanya dan tes ini kehabisan waktu. */
  it('12 pesanan selesai mengakhiri shift dengan nilai dan bintang', async () => {
    render(<ArcadeGame />);
    cariTombol('Mulai Shift')?.click();
    await waitFor(() => expect(perintahTeks()).toContain('おいてください'));

    const total = SHIFT_GENBA.reguler.pesanan;
    for (let n = 1; n <= total; n++) {
      const m = perintahTeks().match(/^(\S+) (\S+) を (.+?) に おいてください$/);
      expect(m, `pesanan ${n} tak terbaca: ${perintahTeks()}`).toBeTruthy();
      const [, warna, barang, zona] = m as RegExpMatchArray;
      const kartu = cariTombol(`${warna}${barang}`);
      expect(kartu, `pesanan ${n}: ${warna}${barang} tidak ada di meja`).toBeTruthy();
      kartu?.click();
      await waitFor(() => expect(cariTombol(`${warna}${barang}`)?.getAttribute('aria-pressed')).toBe('true'));
      const idRak = GENBA_ZONA.find((z) => z.jp === zona)?.id ?? '';
      const rak = rakId(idRak);
      expect(rak, `pesanan ${n}: rak "${zona}" tidak ada`).toBeTruthy();
      rak?.click();
      if (n < total) {
        await waitFor(() => expect(document.body.textContent || '').toContain(`Pesanan ${n}/${total}`));
      }
    }

    /* Kartu hasil, bukan layar permainan. `Nilai shift` hanya ada di kartu itu. */
    await waitFor(() => expect(document.body.textContent || '').toContain('Nilai shift'));
    const teks = document.body.textContent || '';
    expect(teks).toContain(`${total}/${total}`);
    expect(teks).toContain('Bonus shift');
    /* Bintang S/A/B/C: minimal satu bintang terisi untuk shift tanpa salah. */
    expect(teks).toContain('★');
  }, 40000);

  /* Koreksi yang bisa DILIHAT: dulu satu-satunya umpan balik salah adalah satu
     baris teks. Sekarang rak yang benar ikut disorot, jadi siswa melihat
     tujuan yang seharusnya — bukan hanya membaca kalimatnya. */
  it('jawaban salah menyorot rak yang seharusnya', async () => {
    render(<ArcadeGame />);
    cariTombol('Mulai Shift')?.click();
    await waitFor(() => expect(perintahTeks()).toContain('おいてください'));

    const m = perintahTeks().match(/^(\S+) (\S+) を (.+?) に おいてください$/);
    expect(m).toBeTruthy();
    const [, warna, barang, zona] = m as RegExpMatchArray;
    cariTombol(`${warna}${barang}`)?.click();
    await waitFor(() => expect(cariTombol(`${warna}${barang}`)?.getAttribute('aria-pressed')).toBe('true'));

    const idBenar = GENBA_ZONA.find((z) => z.jp === zona)?.id;
    const idSalah = rakTampil().find((id) => id !== idBenar);
    const labelSalah = GENBA_ZONA.find((z) => z.id === idSalah)?.id_;
    cariTombol(labelSalah ?? 'Rak Atas')?.click();

    const rakBenar = cariTombol(GENBA_ZONA.find((z) => z.id === idBenar)?.id_ ?? 'Rak Atas');
    /* Sejak 2026-11-10 penandanya `data-target`, bukan nama kelas
       `border-accent-emerald`. Kelas itu mengikat PERILAKU (rak tujuan
       disorot) ke satu rona palet — dan rona itulah yang diganti. Atribut
       tetap membuktikan hal yang sama dan tidak bisa lolos karena kebetulan
       rona lain muncul di class list. */
    await waitFor(() => expect(rakBenar?.getAttribute('data-target')).toBe('true'));
  }, 15000);

  /* Fitur 2026-11-10: jawaban benar memicu ledakan dua belas partikel di kartu
     perintah. Diuji karena ini satu-satunya bagian "juice" yang punya bentuk
     DOM — kalau kelasnya hilang atau partikelnya tidak dirender, tidak ada
     gerbang lain di repo ini yang akan melihatnya (kanvas tidak akan terlihat
     sama sekali). */
  it('jawaban benar memunculkan ledakan partikel', async () => {
    render(<ArcadeGame />);
    cariTombol('Mulai Shift')?.click();
    await waitFor(() => expect(perintahTeks()).toContain('おいてください'));

    const m = perintahTeks().match(/^(\S+) (\S+) を (.+?) に おいてください$/);
    expect(m).toBeTruthy();
    const [, warna, barang, zona] = m as RegExpMatchArray;
    cariTombol(`${warna}${barang}`)?.click();
    await waitFor(() => expect(cariTombol(`${warna}${barang}`)?.getAttribute('aria-pressed')).toBe('true'));
    rakId(GENBA_ZONA.find((z) => z.jp === zona)?.id ?? '')?.click();

    await waitFor(() => expect(document.querySelectorAll('.arc-partikel')).toHaveLength(12));
  }, 15000);

  /* Keluhan pemilik 2026-11-05: "cuma 4 pilihan tempat, bukannya jadi gampang?"
     Empat adalah DASAR, bukan atap. Tes ini mengunci perilaku yang menjawabnya:
     empat jawaban benar berturut menambah rak, dan satu kesalahan
     mengembalikannya. */
  it('rak bertambah saat kombo panas dan kembali setelah salah', async () => {
    render(<ArcadeGame />);
    cariTombol('Mulai Shift')?.click();
    await waitFor(() => expect(perintahTeks()).toContain('おいてください'));
    expect(rakTampil()).toHaveLength(4);

    for (let n = 1; n <= 4; n++) {
      const m = perintahTeks().match(/^(\S+) (\S+) を (.+?) に おいてください$/);
      expect(m, `pesanan ${n} tak terbaca`).toBeTruthy();
      const [, warna, barang, zona] = m as RegExpMatchArray;
      cariTombol(`${warna}${barang}`)?.click();
      await waitFor(() => expect(cariTombol(`${warna}${barang}`)?.getAttribute('aria-pressed')).toBe('true'));
      const idRak = GENBA_ZONA.find((z) => z.jp === zona)?.id ?? '';
      rakId(idRak)?.click();
      if (n < 4) await waitFor(() => expect(document.body.textContent || '').toContain(`Pesanan ${n}/12`));
    }

    await waitFor(() => expect(rakTampil()).toHaveLength(6));

    /* Satu kesalahan → kombo 0 → pesanan berikutnya kembali ke 4 rak. */
    const m = perintahTeks().match(/^(\S+) (\S+) を (.+?) に おいてください$/);
    expect(m).toBeTruthy();
    const [, warna, barang, zona] = m as RegExpMatchArray;
    const idBenar = GENBA_ZONA.find((z) => z.jp === zona)?.id;
    const idSalah = rakTampil().find((id) => id !== idBenar);
    cariTombol(`${warna}${barang}`)?.click();
    await waitFor(() => expect(cariTombol(`${warna}${barang}`)?.getAttribute('aria-pressed')).toBe('true'));
    cariTombol(GENBA_ZONA.find((z) => z.id === idSalah)?.id_ ?? 'Rak Atas')?.click();

    await waitFor(() => expect(rakTampil()).toHaveLength(4), { timeout: 5000 });
  }, 30000);

  /* "Latih yang salah" adalah alasan catatan itu ada. Tanpa tes ini, tombolnya
     bisa tampil dan tidak melakukan apa pun — dan tidak ada yang menangkapnya,
     karena catatan salah tetap terlihat benar. */
  it('tiga kesalahan membuka latihan ulang dari catatan', async () => {
    render(<ArcadeGame />);
    cariTombol('Mulai Shift')?.click();
    await waitFor(() => expect(perintahTeks()).toContain('おいてください'));

    for (let n = 0; n < 3; n++) {
      const m = perintahTeks().match(/^(\S+) (\S+) を (.+?) に おいてください$/);
      expect(m, `kesalahan ${n + 1}: perintah tak terbaca`).toBeTruthy();
      const [, warna, barang, zona] = m as RegExpMatchArray;
      const idBenar = GENBA_ZONA.find((z) => z.jp === zona)?.id;
      const idSalah = rakTampil().find((id) => id !== idBenar);
      cariTombol(`${warna}${barang}`)?.click();
      await waitFor(() => expect(cariTombol(`${warna}${barang}`)?.getAttribute('aria-pressed')).toBe('true'));
      cariTombol(GENBA_ZONA.find((z) => z.id === idSalah)?.id_ ?? 'Rak Atas')?.click();
      /* Jeda tetap: setelah kesalahan ada jeda 1,1 dtk sebelum perintah baru,
         dan `waitFor` akan lolos terlalu cepat pada pohon yang belum berubah. */
      await new Promise((r) => setTimeout(r, 1400));
    }

    await waitFor(() => expect(document.body.textContent || '').toContain('Nilai shift'));
    const latih = cariTombol('Latih yang salah');
    expect(latih, 'tombol latih tidak ada di kartu hasil').toBeTruthy();
    expect(latih?.disabled, 'latih harus aktif setelah ada catatan salah').toBe(false);
    latih?.click();

    /* Kembali ke playfield, dan label HUD menyatakan mode latihan. */
    await waitFor(() => expect(perintahTeks()).toContain('おいてください'));
    expect(document.body.textContent || '').toContain('Latih yang salah');
    expect(rakTampil()).toHaveLength(4);
  }, 30000);
});

describe('arcade — hub dan tingkat', () => {
  beforeEach(() => {
    localStorage.clear();
    loginSebagaiSiswa();
  });
  afterEach(() => {
    cleanup();
  });

  it('tutorial tampil sekali, lalu tidak muncul lagi setelah dimengerti', async () => {
    render(<ArcadeGame />);
    expect(document.body.textContent || '').toContain('Cara kerja');
    cariTombol('Mengerti')?.click();
    /* Preact menaruh pembaruan state di microtask: membaca DOM tepat setelah
       klik masih melihat pohon LAMA. `waitFor`, bukan `expect` langsung —
       kegagalan pertama tes ini persis karena itu. */
    await waitFor(() => expect(document.body.textContent || '').not.toContain('Cara kerja'));

    /* Render ulang = kunjungan berikutnya. Kalau penanda tidak tersimpan,
       tutorial akan muncul lagi dan tes ini menangkapnya. */
    cleanup();
    render(<ArcadeGame />);
    expect(document.body.textContent || '').not.toContain('Cara kerja');
  });

  it('tingkat Magang menurunkan jumlah pesanan shift menjadi 8', async () => {
    render(<ArcadeGame />);
    cariTombol('Magang')?.click();
    await waitFor(() => expect(document.body.textContent || '').toContain('8 Pesanan'));
    /* Baris bintang ikut tampil — kosong (☆) pada perangkat yang belum pernah
       menyelesaikan shift, dan itu keadaan yang benar. */
    expect(document.body.textContent || '').toContain('☆☆☆');
  });

  /* `t()` membaca store lewat `.get()`, dan nanostores tidak memberi tahu
     Preact lewat `get()`. Tanpa `useLang()` di komponen, label tetap bahasa
     lama sampai ada render lain — bug yang tidak terlihat sampai seseorang
     benar-benar mengganti bahasa di halaman ini. */
  it('mengganti bahasa saat halaman terbuka ikut mengganti label', async () => {
    langStore.set('id');
    render(<ArcadeGame />);
    expect(document.body.textContent || '').toContain('Genba Rush');

    langStore.set('jp');
    await waitFor(() => expect(document.body.textContent || '').toContain('現場ラッシュ'));
    langStore.set('id');
  });
});

describe('arcade — Kotoba Combo Builder', () => {
  beforeEach(() => {
    loginSebagaiSiswa();
  });
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

  it('kartu pertama bernilai x2 — kombo yang dipakai adalah SETELAH kenaikan', async () => {
    render(<ArcadeGame />);
    cariTombol('Combo Kalimat')?.click();
    await waitFor(() => expect(screen.getByTestId('arcade-target')).toBeTruthy());

    const pertama = COMBO_SOAL[0].urutan[0].jp;
    tombol().find((b) => (b.textContent || '').trim() === pertama)?.click();

    /* Sebelum diperbaiki, ketukan pertama dinilai dengan kombo LAMA (x1) ⇒ 50,
       padahal layar sudah menampilkan x2. Angka di layar dan skor yang masuk
       harus sama. */
    await waitFor(() => expect(document.body.textContent || '').toContain('¥ 100'));
  });

  /* Penjaga `langkah >= urutan.length` — dan apa yang SEBENARNYA dicegahnya.
     Klaim awal saya ("soal bisa melompat dua kali") TIDAK terbukti: setelah
     urutan habis, `kartuBenar` selalu false, jadi ketukan masuk ke cabang salah
     dan tidak pernah memanggil `muatSoal`. Yang benar-benar terjadi adalah
     ketukan nyasar selama jeda 1,6 detik MERESET kombo ke x1 dan memunculkan
     umpan balik "salah" padahal kalimatnya sudah selesai — itulah yang diukur
     tes ini. */
  it('setelah kalimat selesai, ketukan nyasar tidak mereset kombo', async () => {
    render(<ArcadeGame />);
    cariTombol('Combo Kalimat')?.click();
    await waitFor(() => expect(screen.getByTestId('arcade-target')).toBeTruthy());

    for (const k of COMBO_SOAL[0].urutan) {
      tombol().find((b) => (b.textContent || '').trim() === k.jp)?.click();
      await new Promise((r) => setTimeout(r, 30));
    }
    /* Lima kartu benar ⇒ kombo x6 (mulai dari x1 lalu naik tiap ketukan). */
    const komboSelesai = (document.body.textContent || '').match(/x(\d+)/)?.[1];
    expect(komboSelesai).toBe('6');

    /* Ketuk kartu jebakan yang masih tersisa, selagi jeda 1,6 detik berjalan. */
    const sisa = COMBO_SOAL[0].jebakan[0].jp;
    tombol().find((b) => (b.textContent || '').trim() === sisa)?.click();

    await new Promise((r) => setTimeout(r, 60));
    expect((document.body.textContent || '').match(/x(\d+)/)?.[1], 'kombo tereset oleh ketukan nyasar').toBe('6');
  }, 15000);

  /* Level Sulit menghapus WARNA jenis kata — dan warna itulah yang selama ini
     memberi jawaban: kartu partikel kuning membuat siswa bisa memilih "kuning
     berikutnya" tanpa tahu partikel mana yang benar. */
  it('level Sulit menghapus warna petunjuk jenis kata', async () => {
    render(<ArcadeGame />);
    cariTombol('Combo Kalimat')?.click();
    await waitFor(() => expect(screen.getByTestId('arcade-target')).toBeTruthy());

    const kartuPartikel = () =>
      tombol().find((b) => (b.textContent || '').trim() === 'で' || (b.textContent || '').trim() === 'を');
    expect(kartuPartikel(), 'kartu partikel tidak ada').toBeTruthy();
    expect(kartuPartikel()?.className, 'normal seharusnya berwarna').toContain('amber');

    const toggle = tombol().find((b) => (b.textContent || '').trim() === 'Normal');
    expect(toggle, 'tombol level tidak ada').toBeTruthy();
    toggle?.click();

    await waitFor(() => expect(kartuPartikel()?.className).not.toContain('amber'));
  });

  /* Level Hell memakai kalimat PANJANG (dua klausa) yang terpisah dari daftar
     biasa — supaya level mudah tidak ikut kebanjiran kalimat 10–13 kartu. */
  it('level Hell memakai kalimat panjang, bukan kalimat pendek', async () => {
    render(<ArcadeGame />);
    cariTombol('Combo Kalimat')?.click();
    await waitFor(() => expect(screen.getByTestId('arcade-target')).toBeTruthy());

    /* normal -> sulit -> hell */
    for (let i = 0; i < 2; i++) {
      const t = tombol().find((b) => ['Normal', 'Sulit'].includes((b.textContent || '').trim()));
      expect(t, 'tombol level tidak ada').toBeTruthy();
      t?.click();
      await new Promise((r) => setTimeout(r, 80));
    }

    const panjang = COMBO_SOAL.filter((x) => x.hell).map((x) => x.indo);
    expect(panjang.length).toBeGreaterThan(0);
    await waitFor(() => {
      const teks = screen.getByTestId('arcade-target').textContent || '';
      expect(panjang.some((p) => teks.includes(p))).toBe(true);
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

  it('tombol Batal 1 mengembalikan kartu terakhir dari rel ke meja', async () => {
    render(<ArcadeGame />);
    cariTombol('Combo Kalimat')?.click();
    await waitFor(() => expect(screen.getByTestId('arcade-target')).toBeTruthy());

    const pertama = COMBO_SOAL[0].urutan[0].jp;
    tombol().find((b) => (b.textContent || '').trim() === pertama)?.click();
    await waitFor(() => expect(document.body.textContent || '').toContain('Langkah 1/'));

    cariTombol('Batal 1')?.click();
    await waitFor(() => expect(document.body.textContent || '').toContain('Langkah 0/'));
    expect(tombol().some((b) => (b.textContent || '').trim() === pertama)).toBe(true);
  });
});
