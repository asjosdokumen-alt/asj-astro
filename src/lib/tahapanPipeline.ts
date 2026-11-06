/**
 * tahapanPipeline.ts — SATU pemilik urutan tahap seleksi untuk sisi tampilan.
 *
 * ── MASALAH YANG DIKUNCI (diukur 2026-11-06) ────────────────────────────────
 * Ada TIGA kosakata berbeda untuk hal yang sama, dan tidak ada satu pun yang
 * menjadi acuan:
 *
 *   1. `sys_config.list_tahapan` — daftar RESMI yang dikelola admin dari tab
 *      Pengaturan (10 nilai, terbaca di `configuration/repository.ts:14` dan
 *      diekspos ke katalog sebagai `tahapan` di `catalog/repository.ts:55`):
 *        LIST · CHECK KAIWA · MENDAN · MENSETSU · LOLOS USER · MCU PARPOR ·
 *        PROSES COE · TTD KONTRAK · VISA · FLIGHT
 *
 *   2. `TAHAPAN_STEPS` yang dulu ditulis langsung di `CandidateDash.tsx`:
 *        PENDAFTARAN · CHECK KAIWA · MENDAN · LOLOS USER · MCU · PEMBERKASAN ·
 *        NAITEI · COE · VISA · FLIGHT
 *
 *   3. Data warisan di `database_candidate.tahapan_seleksi`:
 *        `LIST` (92) · kosong (85) · `Pendaftaran` (51) · `Baru` (30) ·
 *        `Seleksi Berkas` (2) · `MCU PARPOR` (1)
 *
 * Akibatnya `MENSETSU` dan `TTD KONTRAK` — dua tahap yang SUNGGUH ADA di
 * dropdown admin — tidak dikenali kode dasbor, jatuh ke indeks 0, dan kandidat
 * yang sedang diwawancara melihat "PENDAFTARAN" dengan bilah kemajuan yang
 * MUNDUR ke 10%. Itu yang dilaporkan: "kok saya balik ke pendaftaran".
 *
 * ── ATURAN ──────────────────────────────────────────────────────────────────
 * Urutan kanonik = isi `list_tahapan`, titik. Nilai lama dipetakan lewat ALIAS
 * supaya kandidat yang sudah telanjur berada di `Pendaftaran`/`Baru` tidak
 * kehilangan posisinya. Nilai yang tidak dikenal TIDAK ditebak: indeksnya -1
 * dan labelnya nilai mentah, supaya UI tidak mengklaim tahap yang belum tentu
 * benar.
 *
 * Salinan daftar ini juga dipakai `admin/EditCandidateModal.tsx`, yang dulu
 * punya daftar hardcoded SENDIRI (`Baru`, `Pendaftaran`, `LIST`, `MCU PARPOR`,
 * `Wawancara`, `LULUS`) — hanya 2 dari 7 nilainya yang cocok dengan daftar
 * resmi. Itu sebabnya `Baru` dan `Pendaftaran` masuk ke database sejak awal.
 */

/**
 * Urutan kanonik. HARUS sama dengan `sys_config.list_tahapan`.
 *
 * Kalau admin menambah tahap baru di tab Pengaturan, tambahkan di sini juga —
 * `tahapanPipeline.test.ts` memaku panjang dan urutannya supaya perubahan
 * daftar resmi tidak lewat tanpa disadari.
 */
export const TAHAPAN_STEPS: readonly string[] = [
  'LIST',
  'CHECK KAIWA',
  'MENDAN',
  'MENSETSU',
  'LOLOS USER',
  'MCU PARPOR',
  'PROSES COE',
  'TTD KONTRAK',
  'VISA',
  'FLIGHT',
];

/**
 * Nilai lama / sinonim → indeks kanonik.
 *
 * Setiap baris di sini harus punya alasan yang bisa dibaca, bukan tebakan:
 * pemetaan yang salah membuat kandidat melihat kemajuan yang tidak pernah ia
 * capai. Yang tidak yakin, JANGAN dimasukkan — biarkan jatuh ke -1.
 */
const ALIAS: Record<string, number> = {
  // Kosong = baris kandidat ada tapi tahapnya belum pernah diisi. Baris
  // `database_candidate` hanya lahir saat pendaftaran (`identity/service.ts`
  // menulis `status_kandidat: 'BARU'`), jadi tahap paling awal adalah
  // satu-satunya nilai yang mungkin — bukan tebakan.
  '': 0,
  PENDAFTARAN: 0,
  BARU: 0,
  DAFTAR: 0,
  'SELEKSI BERKAS': 0,

  // Wawancara. `Wawancara` berasal dari dropdown hardcoded modal admin yang
  // sudah dibuang; `INTERVIEW` dari impor spreadsheet.
  WAWANCARA: 3,
  INTERVIEW: 3,

  // Pemeriksaan medis + paspor. `PEMBERKASAN` ditaruh di sini karena di urutan
  // lama ia berada tepat setelah MCU, dan di urutan baru tidak ada tahap
  // berkas tersendiri.
  MCU: 5,
  MEDICAL: 5,
  PARPOR: 5,
  'MCU & PARPOR': 5,
  PEMBERKASAN: 5,

  // COE. `NAITEI` (surat penerimaan) mendahului COE di urutan lama.
  COE: 6,
  NAITEI: 6,

  KONTRAK: 7,

  BERANGKAT: 9,
  DEPARTURE: 9,
};

/**
 * Label tampilan untuk nilai kanonik.
 *
 * `LIST` adalah singkatan admin yang tidak berarti apa pun bagi kandidat;
 * "PENDAFTARAN" adalah kata yang sudah dipakai dasbor sejak awal. Nilainya
 * TETAP `LIST` di database dan di panel admin — hanya kata yang dibaca
 * kandidat yang berbeda.
 */
const LABEL: Record<string, string> = {
  LIST: 'PENDAFTARAN',
};

const URUT_PANJANG = [...TAHAPAN_STEPS].sort((a, b) => b.length - a.length);

function rapikan(nilai: unknown): string {
  return String(nilai ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

/**
 * Indeks tahap pada urutan kanonik.
 *
 * -1 = nilai tidak dikenal. Pemanggil WAJIB menanganinya (tampilkan nilai
 * mentah), bukan memperlakukannya sebagai 0.
 */
export function tahapanStepIndex(tahapan: unknown): number {
  const s = rapikan(tahapan);
  const persis = TAHAPAN_STEPS.indexOf(s);
  if (persis >= 0) return persis;
  const alias = ALIAS[s];
  if (alias !== undefined) return alias;

  /* Cocok sebagian, terpanjang lebih dulu: "PROSES MCU PARPOR" harus jatuh ke
     `MCU PARPOR` (5), bukan ke `MCU` — dan tanpa pengurutan ini `MCU` yang
     lebih pendek bisa menang tergantung urutan array. */
  for (const step of URUT_PANJANG) {
    if (s.includes(step)) return TAHAPAN_STEPS.indexOf(step);
  }
  return -1;
}

/** Label tampilan untuk satu nilai kanonik (mis. `LIST` → `PENDAFTARAN`). */
export function tahapanLabel(step: string): string {
  return LABEL[step] ?? step;
}

/**
 * Label untuk nilai MENTAH apa pun — kanonik, warisan, atau tidak dikenal.
 * Nilai tidak dikenal dikembalikan apa adanya: lebih baik kandidat membaca
 * "LULUS" daripada UI diam-diam mengakuinya sebagai "PENDAFTARAN".
 */
export function tahapanLabelDari(tahapan: unknown): string {
  const s = rapikan(tahapan);
  const i = tahapanStepIndex(s);
  return i >= 0 ? tahapanLabel(TAHAPAN_STEPS[i]) : s;
}

/**
 * Kemajuan 0–100 untuk bilah progres.
 *
 * Tahap tidak dikenal menghasilkan 0, bukan 10: bilah yang bergerak tanpa
 * dasar sama menyesatkannya dengan bilah yang mundur.
 */
export function tahapanProgress(tahapan: unknown): number {
  const i = tahapanStepIndex(tahapan);
  if (i < 0) return 0;
  return Math.round(((i + 1) / TAHAPAN_STEPS.length) * 100);
}

/**
 * Opsi dropdown yang tidak menghapus nilai yang tidak dikenal.
 *
 * Dipakai `EditCandidateModal` untuk kolom `tahapan` dan `status`. Tanpa ini,
 * `<select value="Gagal">` yang opsinya tidak memuat `Gagal` akan tampil
 * sebagai opsi pertama (`- Pilih -`), dan menyimpan formulir MENGHAPUS status
 * kandidat tanpa admin pernah memintanya. Terukur 2026-11-06: 7 baris
 * berstatus `Gagal`, 45 `Pending`, 1 `BARU`, 1 `LIST`, 1 `MCU PARPOR` — tidak
 * satu pun ada di daftar opsi modal.
 */
export function opsiDenganNilaiSaatIni(opsi: readonly string[], nilai: unknown): string[] {
  const v = String(nilai ?? '').trim();
  if (!v || opsi.includes(v)) return [...opsi];
  return [...opsi, v];
}
