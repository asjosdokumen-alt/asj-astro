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

/* ==========================================================================
 * 2026-10-29 — jalur REKAM (MediaRecorder), pengganti SpeechRecognition.
 *
 * Laporan pemilik: "rekam suara gak bisa baik dari hp maupun dari destop".
 * Penyebab yang paling mungkin bukan izin (dua perangkat sekaligus), melainkan
 * `service-not-allowed` — layanan suara peramban tidak tersedia — yang dulu
 * ditampilkan sebagai "Izin mikrofon ditolak". Jalur rekam tidak memakai
 * layanan itu sama sekali.
 *
 * Yang diuji di sini adalah KONTRAK MODUL, bukan audionya: alasan gagal harus
 * DIBEDAKAN (izin vs perangkat tidak ada vs dipakai aplikasi lain), karena
 * pesan yang salah membuat pemilik mencari izin yang tidak pernah diminta.
 * ========================================================================== */
import { dukunganRekam, buatPerekamAudio } from '../src/lib/ttsJepang';

type G = Record<string, unknown>;

function fakeMediaRecorder(hasil: { ok: boolean }) {
  return class FakeMR {
    static isTypeSupported(m: string) {
      return m.startsWith('audio/webm');
    }
    mimeType = 'audio/webm';
    ondataavailable: ((e: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    /** Sama seperti MediaRecorder sungguhan: `stop()` kedua MELEMPAR. */
    private state: 'inactive' | 'recording' = 'inactive';
    start() {
      this.state = 'recording';
    }
    stop() {
      if (this.state !== 'recording') {
        const e = new Error('InvalidStateError') as Error & { name: string };
        e.name = 'InvalidStateError';
        throw e;
      }
      this.state = 'inactive';
      this.ondataavailable?.({ data: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' }) });
      this.onstop?.();
    }
    get ok() {
      return hasil.ok;
    }
  };
}

describe('rekam suara — kontrak jalur cadangan', () => {
  afterEach(() => {
    const g = globalThis as G;
    delete g.MediaRecorder;
    delete g.navigator;
    delete g.isSecureContext;
  });

  it('tanpa MediaRecorder → dukunganRekam false dan buatPerekamAudio null', () => {
    const g = globalThis as G;
    delete g.MediaRecorder;
    expect(dukunganRekam()).toBe(false);
    expect(buatPerekamAudio()).toBeNull();
  });

  it('izin ditolak (NotAllowedError) → alasan "ditolak", bukan pesan umum', async () => {
    const g = globalThis as G;
    g.MediaRecorder = fakeMediaRecorder({ ok: true });
    g.isSecureContext = true;
    g.navigator = {
      mediaDevices: {
        getUserMedia: async () => {
          const e = new Error('denied') as Error & { name: string };
          e.name = 'NotAllowedError';
          throw e;
        },
      },
    };
    const p = buatPerekamAudio();
    if (!p) throw new Error('perekam tidak dibuat');
    await expect(p.mulai()).resolves.toBe('ditolak');
    expect(p.aktif()).toBe(false);
  });

  it('mikrofon tidak ada / sedang dipakai → alasan dibedakan', async () => {
    const g = globalThis as G;
    g.MediaRecorder = fakeMediaRecorder({ ok: true });
    g.isSecureContext = true;
    const pasang = (name: string) => {
      g.navigator = {
        mediaDevices: {
          getUserMedia: async () => {
            const e = new Error(name) as Error & { name: string };
            e.name = name;
            throw e;
          },
        },
      };
    };
    pasang('NotFoundError');
    const p1 = buatPerekamAudio();
    if (!p1) throw new Error('perekam tidak dibuat');
    await expect(p1.mulai()).resolves.toBe('tidak-ada');
    pasang('NotReadableError');
    const p2 = buatPerekamAudio();
    if (!p2) throw new Error('perekam tidak dibuat');
    await expect(p2.mulai()).resolves.toBe('dipakai');
  });

  it('konteks tidak aman (http) → "tidak-aman" tanpa meminta izin', async () => {
    const g = globalThis as G;
    g.MediaRecorder = fakeMediaRecorder({ ok: true });
    g.isSecureContext = false;
    g.navigator = { mediaDevices: { getUserMedia: async () => { throw new Error('should not be called'); } } };
    const p = buatPerekamAudio();
    if (!p) throw new Error('perekam tidak dibuat');
    await expect(p.mulai()).resolves.toBe('tidak-aman');
  });

  it('getUserMedia dipanggil sebagai METODE — `this` tidak boleh hilang', async () => {
    /* Terukur 2026-10-30 di Chromium: `const f = navigator.mediaDevices.getUserMedia;
       await f({audio:true})` melempar
         TypeError: Failed to execute 'getUserMedia' on 'MediaDevices': Illegal invocation
       Kode lama memisahkan metode itu dari objeknya, jadi setiap rekaman gagal
       dengan alasan 'lain' (pesan generik) dan mikrofon TIDAK PERNAH menyala —
       keluhan pemilik "masih gak bisa rekam suara". Stub di bawah meniru
       perilaku Chromium: ia menolak kalau `this` bukan objeknya sendiri. */
    const g = globalThis as G;
    g.MediaRecorder = fakeMediaRecorder({ ok: true });
    g.isSecureContext = true;
    const mediaDevices = {
      async getUserMedia(this: unknown) {
        if (this !== mediaDevices) {
          const e = new Error('Illegal invocation') as Error & { name: string };
          e.name = 'TypeError';
          throw e;
        }
        return { getTracks: () => [{ stop() {} }] };
      },
    };
    g.navigator = { mediaDevices };
    const p = buatPerekamAudio();
    if (!p) throw new Error('perekam tidak dibuat');
    await expect(p.mulai()).resolves.toBeNull();
    expect(p.aktif()).toBe(true);
    p.buang();
  });

  it('berhasil mulai → aktif, dan hentikan mengembalikan blob + mime', async () => {
    const g = globalThis as G;
    g.MediaRecorder = fakeMediaRecorder({ ok: true });
    g.isSecureContext = true;
    g.navigator = {
      mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) },
    };
    const p = buatPerekamAudio();
    if (!p) throw new Error('perekam tidak dibuat');
    await expect(p.mulai()).resolves.toBeNull();
    expect(p.aktif()).toBe(true);
    const hasil = await p.hentikan();
    expect(hasil?.mime).toContain('audio/webm');
    expect(hasil?.blob.size).toBeGreaterThan(0);
  });
});

// ==========================================
// 2026-10-29 — auto-stop 45 detik TIDAK boleh membuang rekaman.
//
// `maksDetik` memanggil `stop()` sendiri, lalu memberi tahu komponen, yang
// memanggil `hentikan()`. Versi pertama memanggil `stop()` untuk kedua kalinya,
// yang MELEMPAR pada recorder nonaktif, lalu mengembalikan `null` — rekaman
// terpanjang yang justru paling butuh ditranskripsi dibuang, dengan pesan
// "rekaman tidak bisa diproses".
// ==========================================
describe('rekam suara — auto-stop dan pemanggilan ganda', () => {
  afterEach(() => {
    const g = globalThis as G;
    delete g.MediaRecorder;
    delete g.navigator;
    delete g.isSecureContext;
  });

  function pasang() {
    const g = globalThis as G;
    g.MediaRecorder = fakeMediaRecorder({ ok: true });
    g.isSecureContext = true;
    g.navigator = {
      mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) },
    };
  }

  it('hentikan() dipanggil dua kali → satu rekaman, bukan null', async () => {
    pasang();
    const p = buatPerekamAudio();
    if (!p) throw new Error('perekam tidak dibuat');
    await p.mulai();
    const a = p.hentikan();
    const b = p.hentikan();
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra?.blob.size).toBeGreaterThan(0);
    expect(rb?.blob.size).toBe(ra?.blob.size);
  });

  it('batas waktu: stop() oleh timer + hentikan() dari komponen → blob tetap ada', async () => {
    pasang();
    let padaBatas: (() => void) | undefined;
    const p = buatPerekamAudio({ maksDetik: 1, onBatasWaktu: () => padaBatas?.() });
    if (!p) throw new Error('perekam tidak dibuat');
    await p.mulai();

    // Tiru timer: recorder berhenti lebih dulu, komponen menyusul.
    const dihentikan = p.hentikan();
    padaBatas = () => { void p.hentikan(); };
    padaBatas();

    const hasil = await dihentikan;
    expect(hasil, 'rekaman yang dihentikan timer tidak boleh hilang').toBeTruthy();
    expect(hasil?.blob.size).toBeGreaterThan(0);
  });
});
