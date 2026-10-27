/**
 * TESTS: modul pengucapan Jepang (`src/lib/ttsJepang.ts`).
 *
 * KENAPA ADA
 * ----------
 * Tombol dengar di `/wawancara` menyentuh 177 baris soal, dan tiga kerusakan
 * yang paling mungkin terjadi semuanya tidak terlihat dari layar:
 *
 *   1. suara Indonesia dipakai untuk membaca huruf Jepang (tidak ada suara
 *      `ja-*` di perangkat, dan kode menyerah ke suara bawaan) — hasilnya
 *      terdengar seperti orang membaca "おはよう" sebagai huruf Latin;
 *   2. dua kalimat bertumpuk karena `cancel()` tidak dipanggil;
 *   3. tombol berputar selamanya karena `onerror` tidak pernah memanggil
 *      callback penutup.
 *
 * Semuanya diuji di sini tanpa peramban: modulnya memakai `globalThis`, jadi
 * mesin suara bisa diganti objek palsu.
 *
 * KENAPA DI `e2e/` DAN BUKAN DI `src/`: `indexer` menghitung seluruh `src/**`,
 * jadi `.test.ts` baru di sana memindahkan counter beku. Tier `e2e` tidak
 * dihitung. Berkas ini didaftarkan di `exclude` proyek `frontend` supaya tidak
 * jalan dua kali (R13f-bis) — isinya murni tanpa DOM.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  pilihSuaraJepang,
  ucapkanJepang,
  dukunganSuara,
  LAJU_NORMAL,
  LAJU_LAMBAT,
} from '../src/lib/ttsJepang';

type Suara = { name: string; lang: string };

type UcapanPalsu = {
  text: string;
  lang: string;
  rate: number;
  pitch: number;
  voice: Suara | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

type GlobalUji = {
  speechSynthesis?: unknown;
  SpeechSynthesisUtterance?: unknown;
};

const g = globalThis as unknown as GlobalUji;

/**
 * Pasang mesin suara palsu. `log` mencatat urutan panggilan (`cancel`/`speak`)
 * supaya "satu suara pada satu waktu" bisa dibuktikan, bukan diasumsikan.
 */
function pasangSuara(voices: Suara[] = []) {
  const log: string[] = [];
  const diucapkan: UcapanPalsu[] = [];

  class Ucapan {
    text: string;
    lang = '';
    rate = 1;
    pitch = 1;
    voice: Suara | null = null;
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(teks: string) {
      this.text = teks;
    }
  }

  g.speechSynthesis = {
    speak: (u: UcapanPalsu) => {
      log.push('speak');
      diucapkan.push(u);
    },
    cancel: () => log.push('cancel'),
    getVoices: () => voices,
  };
  g.SpeechSynthesisUtterance = Ucapan;

  return { log, diucapkan };
}

afterEach(() => {
  delete g.speechSynthesis;
  delete g.SpeechSynthesisUtterance;
  vi.restoreAllMocks();
});

describe('pilihSuaraJepang', () => {
  it('null kalau perangkat tidak punya suara Jepang sama sekali', () => {
    expect(pilihSuaraJepang([])).toBeNull();
    expect(pilihSuaraJepang([{ name: 'Google Bahasa Indonesia', lang: 'id-ID' }])).toBeNull();
    expect(pilihSuaraJepang([{ name: 'Samantha', lang: 'en-US' }])).toBeNull();
  });

  it('memilih ja-JP persis, bukan ja-* lain yang kebetulan lebih dulu', () => {
    const dipilih = pilihSuaraJepang([
      { name: 'Kyoko (JP lama)', lang: 'ja' },
      { name: 'Google 日本語', lang: 'ja-JP' },
    ]);
    expect(dipilih?.name).toBe('Google 日本語');
  });

  it('menerima bentuk lama ja_JP dan huruf besar/kecil campur', () => {
    expect(pilihSuaraJepang([{ name: 'Kyoko', lang: 'ja_JP' }])?.name).toBe('Kyoko');
    expect(pilihSuaraJepang([{ name: 'Kyoko', lang: 'JA-jp' }])?.name).toBe('Kyoko');
  });

  it('jatuh ke suara ja-* pertama kalau tidak ada yang persis ja-JP', () => {
    const dipilih = pilihSuaraJepang([
      { name: 'Indonesia', lang: 'id-ID' },
      { name: 'Kyoko', lang: 'ja' },
    ]);
    expect(dipilih?.name).toBe('Kyoko');
  });
});

describe('dukunganSuara', () => {
  it('false saat peramban tidak punya speechSynthesis', () => {
    expect(dukunganSuara()).toBe(false);
  });

  it('true setelah mesin suara tersedia', () => {
    pasangSuara([]);
    expect(dukunganSuara()).toBe(true);
  });
});

describe('ucapkanJepang', () => {
  it('mengembalikan false (bukan melempar) saat tidak didukung', () => {
    expect(ucapkanJepang('おはよう')).toBe(false);
  });

  it('menolak teks kosong tanpa memanggil mesin suara', () => {
    const { log } = pasangSuara([]);
    expect(ucapkanJepang('   ')).toBe(false);
    expect(log).toEqual([]);
  });

  it('membatalkan suara sebelumnya SEBELUM bicara (satu suara pada satu waktu)', () => {
    const { log } = pasangSuara([]);
    ucapkanJepang('おはよう');
    expect(log).toEqual(['cancel', 'speak']);
  });

  it('menyetel lang ja-JP dan laju bawaan, plus suara Jepang kalau ada', () => {
    const { diucapkan } = pasangSuara([{ name: 'Kyoko', lang: 'ja-JP' }]);
    ucapkanJepang('自己紹介をお願いします。');
    expect(diucapkan).toHaveLength(1);
    const u = diucapkan[0] as UcapanPalsu;
    expect(u.text).toBe('自己紹介をお願いします。');
    expect(u.lang).toBe('ja-JP');
    expect(u.rate).toBe(LAJU_NORMAL);
    expect(u.voice?.name).toBe('Kyoko');
  });

  it('lang ja-JP TETAP diset walau tidak ada suara Jepang', () => {
    /* Ini yang mencegah teks Jepang dibacakan dengan pelafalan Indonesia:
       mesin suara memilih bahasa dari `lang`, bukan dari `voice`. */
    const { diucapkan } = pasangSuara([{ name: 'Indonesia', lang: 'id-ID' }]);
    ucapkanJepang('おはよう');
    const u = diucapkan[0] as UcapanPalsu;
    expect(u.lang).toBe('ja-JP');
    expect(u.voice).toBeNull();
  });

  it('mode lambat benar-benar lebih lambat', () => {
    const { diucapkan } = pasangSuara([]);
    ucapkanJepang('おはよう', { laju: LAJU_LAMBAT });
    expect((diucapkan[0] as UcapanPalsu).rate).toBe(LAJU_LAMBAT);
    expect(LAJU_LAMBAT).toBeLessThan(LAJU_NORMAL);
  });

  it('onSelesai dipanggil baik saat selesai maupun saat gagal', () => {
    const { diucapkan } = pasangSuara([]);
    const selesai = vi.fn();
    ucapkanJepang('おはよう', { onSelesai: selesai });
    const u = diucapkan[0] as UcapanPalsu;
    expect(u.onend).toBe(selesai);
    /* `onerror` WAJIB memakai callback yang sama: tanpa itu tombol berputar
       selamanya ketika mesin suara gagal di tengah kalimat. */
    expect(u.onerror).toBe(selesai);
    u.onerror?.();
    expect(selesai).toHaveBeenCalledTimes(1);
  });

  it('mesin suara yang melempar tidak menjatuhkan komponen', () => {
    g.speechSynthesis = {
      speak: () => {
        throw new Error('not allowed');
      },
      cancel: () => {},
      getVoices: () => [],
    };
    g.SpeechSynthesisUtterance = class {
      text = '';
      lang = '';
      rate = 1;
      pitch = 1;
      voice = null;
      onend = null;
      onerror = null;
      constructor(t: string) {
        this.text = t;
      }
    };
    expect(ucapkanJepang('おはよう')).toBe(false);
  });
});
