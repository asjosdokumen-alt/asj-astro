/**
 * surfaces/tes.ts — dua tes mandiri siswa (MBTI & Tes Mata Pra-MCU).
 *
 * KENAPA SURFACE SENDIRI
 * ----------------------
 * Isinya bukan latihan dan bukan chat: ia MENULIS satu baris yang tidak boleh
 * ditulis dua kali (`candidate_assessments_sekali`). Mencampurnya ke
 * `surfaces/kotoba.ts` akan membuat berkas "bank soal latihan" berisi penulis
 * data pribadi siswa — dan setiap orang yang menambah latihan baru harus
 * membaca aturan "sekali seumur hidup" yang tidak ada hubungannya.
 *
 * Entry point-nya tetap `kotoba.js` (lihat `makeSurfaceHandler([...])` di sana):
 * satu fungsi Netlify tambahan berarti satu cold start tambahan dan baseline
 * bundle baru, sementara beban kerjanya sama-sama satu query pendek.
 *
 * GERBANG
 * -------
 *   getStatusTes / simpanHasilTes → `tolakKecualiSiswa` (siswa VIP / admin)
 *   getHasilTesAdmin / setTesAktif → `requireAdmin` (hanya admin)
 * Tidak ada satu pun action di sini yang boleh dijawab tanpa sesi.
 */
import { tolakKecualiSiswa } from '../_lib/siswa-gate';

export const TES_ACTIONS: Record<
  string,
  (payload: unknown[], sessionToken?: string) => Promise<unknown>
> = {
  /**
   * Status untuk satu siswa: sakelar admin, sudah dikerjakan atau belum, dan
   * hasil yang sudah tersimpan. Satu permintaan, karena halaman tes butuh
   * ketiganya sekaligus — tiga permintaan berarti tiga status memuat dan
   * kemungkinan tampil setengah jadi.
   */
  getStatusTes: async (p: unknown[], s?: string) => {
    const wa = String(p?.[0] ?? '').trim();
    const tolak = await tolakKecualiSiswa(s, wa);
    if (tolak) return tolak;
    const { statusTes } = await import('../_lib/asesmen/tes');
    return statusTes(wa);
  },

  /**
   * Simpan hasil. Sekali per jenis — penegaknya constraint DB, bukan tombol.
   * Klien yang mencoba mengirim dua kali menerima `{ sudah: true }`, bukan
   * hasil yang tertimpa diam-diam.
   */
  simpanHasilTes: async (p: unknown[], s?: string) => {
    const d = (p?.[0] || {}) as { wa?: unknown; jenis?: unknown; hasil?: unknown; ulang?: unknown };
    const wa = String(d.wa ?? '').trim();
    const tolak = await tolakKecualiSiswa(s, wa);
    if (tolak) return tolak;
    const { simpanHasil } = await import('../_lib/asesmen/tes');
    /* `ulang: true` = kandidat menekan "Tes Ulang" dan hasil baru MENGGANGGU
       yang lama. Tanpa ini, satu hasil yang salah terkunci selamanya. */
    return simpanHasil({ wa, jenis: d.jenis, hasil: d.hasil, ulang: d.ulang === true });
  },

  /** Daftar hasil untuk tab admin. */
  getHasilTesAdmin: async (p: unknown[], s?: string) => {
    const { requireAdmin } = await import('../contexts/identity');
    const guard = requireAdmin(s || '');
    if (guard.error) return guard.error;
    const { daftarHasil } = await import('../_lib/asesmen/tes');
    return daftarHasil(p?.[0], Number(p?.[1]) || 500);
  },

  /**
   * Asesmen penalaran: soal + penilaian.
   *
   * Dua action terpisah dari `getStatusTes`/`simpanHasilTes` karena bentuk
   * datanya berbeda: yang ini mengirim SOAL (tanpa kunci) dan menerima JAWABAN
   * mentah, bukan hasil yang sudah dihitung klien.
   */
  getSoalIq: async (p: unknown[], s?: string) => {
    const wa = String(p?.[0] ?? '').trim();
    const tolak = await tolakKecualiSiswa(s, wa);
    if (tolak) return tolak;
    const { soalIqUntuk } = await import('../_lib/asesmen/tes');
    return soalIqUntuk(wa);
  },

  simpanHasilIq: async (p: unknown[], s?: string) => {
    const d = (p?.[0] || {}) as { wa?: unknown; jawaban?: unknown; durasiDetik?: unknown; uji?: unknown };
    const wa = String(d.wa ?? '').trim();

    /* Mode uji: nilai saja, JANGAN simpan. Gerbangnya `requireAdmin`, bukan
       `tolakKecualiSiswa` — kalau tidak, siswa bisa mengirim `uji: true` untuk
       melihat hasil tanpa memakai kesempatan satu-satunya, lalu mengulang
       sampai puas. */
    if (d.uji === true) {
      const { requireAdmin } = await import('../contexts/identity');
      const guard = requireAdmin(s || '');
      if (guard.error) return guard.error;
      const { nilaiIqTanpaSimpan } = await import('../_lib/asesmen/tes');
      return nilaiIqTanpaSimpan(wa, d.jawaban, d.durasiDetik);
    }

    const tolak = await tolakKecualiSiswa(s, wa);
    if (tolak) return tolak;
    const { simpanHasilIq } = await import('../_lib/asesmen/tes');
    return simpanHasilIq({ wa, jawaban: d.jawaban, durasiDetik: d.durasiDetik });
  },

  /** Buka ulang SATU siswa — admin saja, dan sengaja bukan bagian sakelar. */
  resetHasilIq: async (p: unknown[], s?: string) => {
    const { requireAdmin } = await import('../contexts/identity');
    const guard = requireAdmin(s || '');
    if (guard.error) return guard.error;
    const { resetHasilIq } = await import('../_lib/asesmen/tes');
    return resetHasilIq(String(p?.[0] ?? '').trim());
  },

  /**
   * Tulis hasil tes mata ke kolom CV. Admin saja, per siswa, dan hanya dari
   * tombol — lihat komentar `tulisMataKeCv` untuk alasan tidak otomatis.
   */
  tulisMataKeCv: async (p: unknown[], s?: string) => {
    const { requireAdmin } = await import('../contexts/identity');
    const guard = requireAdmin(s || '');
    if (guard.error) return guard.error;
    const { tulisMataKeCv } = await import('../_lib/asesmen/tes');
    return tulisMataKeCv(String(p?.[0] ?? '').trim());
  },

  /** Sakelar buka/tutup satu tes. Admin saja. */
  setTesAktif: async (p: unknown[], s?: string) => {
    const { requireAdmin } = await import('../contexts/identity');
    const guard = requireAdmin(s || '');
    if (guard.error) return guard.error;
    const d = (p?.[0] || {}) as { jenis?: unknown; aktif?: unknown };
    const { setAktif } = await import('../_lib/asesmen/tes');
    return setAktif(d.jenis, d.aktif);
  },
};
