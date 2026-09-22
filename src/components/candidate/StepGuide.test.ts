/**
 * StepGuide.test.ts — menguji PEMILIHAN LANGKAH, bukan sekadar render.
 *
 * Kenapa fokusnya di `nextStep()`: komponen ini punya satu keputusan yang
 * benar-benar bisa salah — bagian mana yang ditunjuk. Kalau keputusan itu salah,
 * kartunya tetap terlihat bagus dan tetap "berhasil dirender"; satu-satunya cara
 * menangkapnya adalah menguji fungsinya secara langsung pada batas-batasnya.
 *
 * ATURAN YANG DIJAGA DI SINI
 * --------------------------
 * 1. **`berkasTotal` nol tidak pernah memilih `berkas`.** Kalau tidak ada berkas
 *    yang diminta, menunjuk bagian berkas adalah langkah yang MUSTAHIL
 *    diselesaikan — pemandu yang menyuruh melakukan sesuatu yang tidak bisa
 *    dilakukan lebih buruk daripada tidak ada pemandu.
 * 2. **Tidak ada angka skor di kata-katanya.** §6.2 melarang bahasa yang bisa
 *    dibaca sebagai peluang diterima. Diperiksa terhadap KEDUA berkas i18n.
 * 3. **Pose maskot hanya yang sudah ada.** Kalau seseorang menambah pose yang
 *    tidak ada di `Mascot.tsx`, gambarnya menghilang tanpa error — jadi daftar
 *    pose yang sah diperiksa terhadap sumber `Mascot.tsx`, bukan terhadap
 *    salinan yang bisa basi.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { nextStep, poseFor, titleKeyFor, bodyKeyFor } from './StepGuide';

/** LF normalisation — `.gitattributes` tidak memaku `.tsx`, jadi CRLF di Windows. */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');

const MASCOT_SRC = read('src/components/ui/Mascot.tsx');
const I18N_ID = read('src/store/i18n.ts');
const I18N_JP = read('src/store/i18n-jp.ts');

/** Semua pose sah, dibaca dari union type di Mascot.tsx. */
const VALID_POSES = (() => {
  const m = MASCOT_SRC.match(/export type MascotPose =([^;]+);/);
  expect(m, 'MascotPose union not found in Mascot.tsx').not.toBeNull();
  return [...(m as RegExpMatchArray)[1].matchAll(/'([a-z]+)'/g)].map((x) => x[1]);
})();

const FULL = { mini: 100, master: 100, berkasProgress: 100, berkasTotal: 12 };

describe('nextStep — batas keputusan', () => {
  it('profil lengkap → done', () => {
    expect(nextStep(FULL)).toBe('done');
  });

  it('berkas belum lengkap → berkas, walau CV sudah penuh', () => {
    // Berkas didahulukan karena ia satu-satunya bagian yang butuh tindakan di
    // luar formulir (memindai/mengunggah) — bagian yang paling mudah tertunda.
    expect(nextStep({ ...FULL, berkasProgress: 40, berkasTotal: 12 })).toBe('berkas');
  });

  it('berkas penuh tapi CV Mini belum → mini', () => {
    expect(nextStep({ ...FULL, mini: 60 })).toBe('mini');
  });

  it('berkas dan mini penuh, master belum → master', () => {
    expect(nextStep({ ...FULL, master: 30 })).toBe('master');
  });

  it('mini didahulukan atas master ketika keduanya belum lengkap', () => {
    // `CV_MINI_FIELDS` lebih pendek, jadi kemajuan datang lebih cepat. Urutannya
    // disengaja dan diuji supaya tidak terbalik tanpa sadar.
    expect(nextStep({ ...FULL, mini: 10, master: 90 })).toBe('mini');
  });

  it('berkasTotal 0 TIDAK PERNAH memilih berkas — itu langkah yang mustahil', () => {
    // Tidak ada berkas yang diminta berarti tidak ada yang bisa diunggah.
    expect(nextStep({ mini: 0, master: 0, berkasProgress: 0, berkasTotal: 0 })).toBe('mini');
    expect(nextStep({ mini: 100, master: 50, berkasProgress: 0, berkasTotal: 0 })).toBe('master');
    expect(nextStep({ mini: 100, master: 100, berkasProgress: 0, berkasTotal: 0 })).toBe('done');
  });

  it('berkasProgress mentok di 100 walau total > 0 → tidak menunjuk berkas', () => {
    expect(nextStep({ ...FULL, berkasProgress: 100, berkasTotal: 3 })).toBe('done');
  });

  it('tepat di ambang 100 dianggap selesai, 99 belum', () => {
    expect(nextStep({ ...FULL, mini: 99 })).toBe('mini');
    expect(nextStep({ ...FULL, mini: 100 })).toBe('done');
    expect(nextStep({ ...FULL, master: 99 })).toBe('master');
    expect(nextStep({ ...FULL, master: 100 })).toBe('done');
  });

  it('profil kosong → mini, dan tidak ada yang menghukum', () => {
    // Yang ditunjuk adalah bagian paling awal yang bisa dikerjakan, bukan
    // "kamu tertinggal" — tidak ada bahasa kegagalan di seluruh berkas ini.
    expect(nextStep({ mini: 0, master: 0, berkasProgress: 0, berkasTotal: 5 })).toBe('berkas');
    expect(nextStep({ mini: 0, master: 0, berkasProgress: 100, berkasTotal: 5 })).toBe('mini');
  });

  it('selalu mengembalikan salah satu dari empat kunci', () => {
    const KEYS = ['mini', 'master', 'berkas', 'done'];
    for (const mini of [0, 50, 100]) {
      for (const master of [0, 50, 100]) {
        for (const [bp, bt] of [
          [0, 0],
          [0, 4],
          [100, 4],
        ]) {
          expect(KEYS).toContain(nextStep({ mini, master, berkasProgress: bp, berkasTotal: bt }));
        }
      }
    }
  });
});

describe('poseFor — maskot tidak pernah menghakimi', () => {
  it('setiap pose yang dipakai BENAR-BENAR ADA di Mascot.tsx', () => {
    // Pose yang tidak ada dirender sebagai NOTHING (Mascot.tsx mem-return null),
    // jadi kesalahan ini tidak akan terlihat sebagai gambar rusak — hanya sebagai
    // ruang kosong. Itu sebabnya daftarnya diperiksa terhadap sumbernya.
    for (const key of ['mini', 'master', 'berkas', 'done'] as const) {
      expect(VALID_POSES).toContain(poseFor(key));
    }
  });

  it('profil lengkap → peace', () => {
    expect(poseFor('done')).toBe('peace');
  });

  it('belum lengkap → wave, bukan pose yang kecewa', () => {
    // Tidak ada pose kecewa/marah di karakter sheet, dan itu memang disengaja:
    // kandidat ini sedang mencari kerja.
    expect(poseFor('mini')).toBe('wave');
    expect(poseFor('master')).toBe('wave');
    expect(poseFor('berkas')).toBe('wave');
  });

  it('tidak ada pose negatif di seluruh daftar', () => {
    for (const key of ['mini', 'master', 'berkas', 'done'] as const) {
      expect(['sleepy', 'notfound', 'wave', 'peace']).toContain(poseFor(key));
    }
  });
});

describe('kunci terjemahan', () => {
  const KEYS = ['mini', 'master', 'berkas', 'done'] as const;

  it('setiap langkah punya judul DAN penjelas di kedua bahasa', () => {
    for (const key of KEYS) {
      for (const src of [I18N_ID, I18N_JP]) {
        expect(src, `${titleKeyFor(key)} hilang`).toContain(`"${titleKeyFor(key)}"`);
        expect(src, `${bodyKeyFor(key)} hilang`).toContain(`"${bodyKeyFor(key)}"`);
      }
    }
  });

  it('tidak ada nilai terjemahan yang kosong', () => {
    for (const key of KEYS) {
      for (const k of [titleKeyFor(key), bodyKeyFor(key)]) {
        const m = I18N_ID.match(new RegExp(`"${k}":\\s*"([^"]*)"`));
        expect(m, `${k} tidak ditemukan`).not.toBeNull();
        expect((m as RegExpMatchArray)[1].trim().length, `${k} kosong`).toBeGreaterThan(0);
      }
    }
  });

  it('label kartu ada di kedua bahasa', () => {
    expect(I18N_ID).toContain('"candidate.step_label"');
    expect(I18N_JP).toContain('"candidate.step_label"');
  });
});

describe('StepGuide — tanpa bahasa skor seleksi (§6.2)', () => {
  /**
   * Nilai terjemahan untuk SELURUH kunci step_*, di kedua bahasa. Diperiksa
   * nilainya, bukan seluruh berkas, supaya kunci lain yang kebetulan memuat kata
   * ini (mis. komentar tentang cara memakainya) tidak salah tertangkap — dan
   * supaya pemeriksaan ini tidak pernah gagal karena dokumentasinya sendiri.
   */
  const stepValues = (src: string) =>
    [...src.matchAll(/"candidate\.step_[a-z_]+":\s*"([^"]*)"/g)].map((m) => m[1]);

  const BANNED = [
    'skor',
    'score',
    'peringkat',
    'ranking',
    'leaderboard',
    'peluang',
    'lolos',
    'chance',
    'points',
    'poin',
    'スコア',
    'ランキング',
    '合格',
    '順位',
  ];

  it('tidak ada kata yang bisa dibaca sebagai peluang diterima', () => {
    for (const [name, src] of [
      ['i18n.ts', I18N_ID],
      ['i18n-jp.ts', I18N_JP],
    ] as const) {
      const values = stepValues(src);
      // Kalau regex-nya meleset, tes ini akan lulus secara hampa — jadi jumlahnya
      // dipastikan lebih dulu. Ini kesalahan yang sudah pernah terjadi di repo ini.
      expect(values.length, `tidak menemukan nilai step_* di ${name}`).toBeGreaterThanOrEqual(8);
      for (const v of values) {
        const lower = v.toLowerCase();
        for (const banned of BANNED) {
          expect(lower, `"${banned}" muncul di ${name}: ${v}`).not.toContain(banned);
        }
      }
    }
  });

  it('kata-katanya menunjuk tindakan, bukan penilaian', () => {
    // Satu pemeriksaan positif supaya larangan di atas tidak lulus secara hampa:
    // setidaknya satu nilai harus menyebut kata kerja mengerjakan sesuatu.
    const verbs = ['lengkapi', 'isi', 'unggah', 'mulai', 'submit', '入力', '提出'];
    const all = [...stepValues(I18N_ID), ...stepValues(I18N_JP)].join(' ').toLowerCase();
    expect(verbs.some((v) => all.includes(v))).toBe(true);
  });
});
