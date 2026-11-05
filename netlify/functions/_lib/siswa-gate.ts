/**
 * siswa-gate.ts — satu penjaga untuk semua bank soal "khusus siswa ASJ".
 *
 * KENAPA DIPINDAH KE SINI (2026-11-05)
 * ------------------------------------
 * Penjaga ini dulu tinggal di `surfaces/ai.ts`. Bank kosakata (kotoba, SSW,
 * matematika) juga di sana, dan itulah sebabnya `ai-chat.js` menanggung
 * **344 KB** data bank yang tidak pernah dipakai jalur chat — `kotoba/ssw.ts`
 * 200 KB + `kotoba/bank.ts` 120 KB + `kotoba/n5.ts` 24 KB. Terukur di gate
 * `bundle:size`: ai-chat.js 603,5 KB, melewati plafon keras 600 KB.
 *
 * Supaya bank bisa pindah ke entry sendiri TANPA ikut menyeret seluruh
 * `AI_ACTIONS`, penjaganya harus hidup di modul yang ringan. Modul ini hanya
 * memuat import dinamis, jadi beratnya nol sampai benar-benar dipanggil.
 *
 * ATURAN YANG DIJAGA (jangan disederhanakan):
 *   admin    → selalu boleh (panel TabPelamar memanggil dengan `adminMode`);
 *   kandidat → hanya WA-nya SENDIRI (`isOwnerOrAdmin`) DAN bertanda siswa ASJ
 *              (`statusVip`: `[VIP]` atau `[KELAS xx]`).
 *
 * `null` = boleh lanjut; selain itu = objek galat siap dikirim ke klien.
 */
export async function tolakKecualiSiswa(sessionToken: string | undefined, wa: string) {
  const { isOwnerOrAdmin, requireAdmin } = await import('../contexts/identity');
  if (!requireAdmin(sessionToken || '').error) return null;
  if (!isOwnerOrAdmin(sessionToken, wa)) {
    return { success: false, sessionInvalid: true, message: 'Sesi tidak valid' };
  }
  const { statusVip } = await import('../_lib/wawancara/bank');
  const vip = await statusVip(wa);
  // `null` = pemeriksaan gagal (DB tidak terjangkau). Jangan bilang "bukan
  // siswa": itu menuduh kandidat atas kegagalan kita sendiri.
  if (vip === null) {
    return { success: false, message: 'Gagal memeriksa status siswa. Coba lagi sebentar.' };
  }
  if (!vip) {
    return {
      success: false,
      isVip: false,
      message: 'Latihan wawancara khusus siswa ASJ (VIP / Kelas LPK).',
    };
  }
  return null;
}
