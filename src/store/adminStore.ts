/**
 * adminStore.ts — Reactive Admin State (Nanostores)
 *
 * Centralized state for admin panel: modals, kandidat list, filters.
 * Replaces local useState in TabPelamar + InputManualModal.
 *
 * Pattern: same as authReactive.ts — atom for simple state,
 * reactive updates trigger auto re-render in all subscribers.
 */
import { atom } from 'nanostores';
import { authStore } from './authReactive';
import api from '../lib/apiClient';

export interface Kandidat {
  id: string;
  nama: string;
  wa: string;
  idLoker: string;
  tahapan: string;
  status: string;
  catatan: string;
  gender: string;
  usia: string;
  jft: string;
  // Kolom catatan mengikuti legacy: tampilan = catatanExt || catatan_admin.
  catatanExt?: string;
  catatanInt?: string;
  isVIP?: boolean;
  isSiswaASJ?: boolean;
  // pas_photo ter-dekorasi (mapCandidate) — fallback foto preview CV (A10).
  pasPhoto?: string;
  // Backend SUDAH mengirim ketiga field ini (mapCandidate di
  // `_lib/db/candidates.ts:57,82,83`), tapi interface ini tidak
  // mendeklarasikannya sehingga nilainya dibuang di sisi klien. Akibatnya
  // ekspor kandidat hanya bisa memuat 7 kolom, sementara legacy memuat 11
  // (Email + Tanggal Daftar hilang). Deklarasi di sini memulihkannya tanpa
  // perubahan backend sama sekali.
  email?: string;
  tanggalDaftar?: string;
  createdAt?: string;
}

// ── Modal State ──────────────────────────────────────────
export const inputModalOpen = atom<boolean>(false);
export const reportModalOpen = atom<boolean>(false);

// ── Kandidat List (reactive) ─────────────────────────────
export const kandidatList = atom<Kandidat[]>([]);
export const allKandidatList = atom<Kandidat[]>([]);
export const kandidatLoading = atom<boolean>(true);
// Total kandidat di server (getCandidatesPage.total) — dipakai teks "x dari y".
export const kandidatTotal = atom<number>(0);

// ── Filter State ─────────────────────────────────────────
export const adminSearch = atom<string>('');
export const adminFilterGender = atom<string>('all');
export const adminFilterAge = atom<string>('all');
export const adminFilterJft = atom<string>('all');
export const adminPage = atom<number>(0);
export const adminSimpleView = atom<boolean>(false);

export const PAGE_SIZE = 20;

// ── Modal Actions ────────────────────────────────────────
export function openInputModal() {
  inputModalOpen.set(true);
}

export function closeInputModal() {
  inputModalOpen.set(false);
}

export function openReportModal() {
  reportModalOpen.set(true);
}

export function closeReportModal() {
  reportModalOpen.set(false);
}

// ── Kandidat Actions ─────────────────────────────────────
export function addKandidat(k: Kandidat) {
  const current = kandidatList.get();
  kandidatList.set([k, ...current]);
  const allCurrent = allKandidatList.get();
  allKandidatList.set([k, ...allCurrent]);
}

export function setKandidatList(list: Kandidat[]) {
  kandidatList.set(list);
}

export function setAllKandidatList(list: Kandidat[]) {
  allKandidatList.set(list);
}

export function setKandidatLoading(loading: boolean) {
  kandidatLoading.set(loading);
}

// ── Filter Actions ───────────────────────────────────────
export function setAdminSearch(val: string) {
  adminSearch.set(val);
  adminPage.set(0); // reset page on search
}

export function setAdminFilterGender(val: string) {
  adminFilterGender.set(val);
  adminPage.set(0);
}

export function setAdminFilterAge(val: string) {
  adminFilterAge.set(val);
  adminPage.set(0);
}

export function setAdminFilterJft(val: string) {
  adminFilterJft.set(val);
  adminPage.set(0);
}

export function nextPage() {
  adminPage.set(adminPage.get() + 1);
}

export function resetPage() {
  adminPage.set(0);
}

export function toggleSimpleView() {
  adminSimpleView.set(!adminSimpleView.get());
}

// ── Fetch from API ───────────────────────────────────────
// P10 fix: Paginated fetch — request only the current page + filters
// instead of loading all candidates client-side. The server handles
// filtering and pagination, reducing payload size and client memory.
// NOTE: only kandidatList (halaman aktif TabPelamar) yang diisi di sini;
// allKandidatList milik konsumen penuh (TabDbJob count, ListKandidatModal,
// MatchmakingModal) — isi lewat fetchAllKandidat().
export async function fetchKandidatFromAPI() {
  setKandidatLoading(true);
  try {
    const search = adminSearch.get();
    const page = adminPage.get();
    // Lewat jalur apiClient (non-negotiable #3), bukan fetch mentah. Yang
    // didapat: batas waktu + AbortController, token yang DIREFRESH lewat
    // getFreshToken() alih-alih snapshot `authStore.get().sessionToken` yang
    // bisa sudah kedaluwarsa, dan satu tempat yang tahu cara memperlakukan sesi
    // mati. `getCandidatesPage` sengaja TIDAK ada di CACHEABLE_READS, jadi jalur
    // ini tidak menambah cache: kesegaran daftar kandidat tidak berubah, dan
    // `getEndpoint('getCandidatesPage')` memetakan ke endpoint yang PERSIS sama
    // (/.netlify/functions/candidates) seperti yang dipakai kode lama.
    const data = (await api.secure(
      'getCandidatesPage',
      [{ page: page + 1, pageSize: PAGE_SIZE, q: search || '' }],
      { onSessionInvalid: 'throw' },
    )) as { success?: boolean; total?: number | string; candidates?: Kandidat[] };

    if (data.success) {
      const k = data.candidates || [];
      setKandidatList(page === 0 ? k : [...kandidatList.get(), ...k]);
      kandidatTotal.set(Number(data.total) || kandidatTotal.get() + k.length);
    }
  } catch (err) {
    // `onSessionInvalid: 'throw'` adalah gerbang lokal tab ini: sesi yang tidak
    // bisa diverifikasi TIDAK memicu logout + redirect global, sama seperti
    // TabKelola (§26). Konsekuensinya cabang `else if (data.sessionInvalid)`
    // yang lama tidak punya padanan di sini — apiClient melempar SEBELUM
    // mengembalikan.
    //
    // Penggantinya sengaja lebih sempit: daftar dikosongkan HANYA kalau auth
    // store menyatakan sesinya benar-benar hilang. Sengaja BUKAN "kosongkan pada
    // setiap kegagalan": admin yang sedang menggulir di koneksi buruk tidak
    // boleh diberi tahu "tidak ada kandidat" hanya karena satu permintaan habis
    // waktu, dan barisnya sudah tampil di layar sebelum kegagalan itu — jadi
    // mempertahankannya tidak membocorkan apa pun yang baru.
    if (!authStore.get().isLoggedIn) {
      setKandidatList([]);
      setAllKandidatList([]);
      kandidatTotal.set(0);
    }
    console.error('[adminStore] fetchKandidat failed:', err);
  } finally {
    setKandidatLoading(false);
  }
}

// §26: penjaga in-flight + jendela kesegaran untuk fetchAllKandidat.
// Sebelumnya setiap mount TabDbJob dan setiap buka ListKandidatModal menembak
// ulang loop 200/halaman BERURUTAN (0,68–1,06 s per round trip) tanpa penjaga
// in-flight maupun cache. Sekarang: (a) panggilan bersamaan berbagi satu
// promise, (b) hasil dipakai ulang selama ALL_KANDIDAT_TTL_MS, (c) cache
// dikunci token supaya ganti akun di tab yang sama tidak membocorkan baris
// kandidat, (d) `{ force: true }` untuk refresh sengaja setelah operasi tulis.
const ALL_KANDIDAT_TTL_MS = 30 * 1000;
let allKandidatInflight: Promise<Kandidat[]> | null = null;
let allKandidatAt = 0;
let allKandidatToken: string | null = null;

// Tarik SEMUA kandidat (loop halaman getCandidatesPage, pageSize 200) ke
// allKandidatList — padanan legacy ALL_CANDIDATES memory (ensureAllCandidates)
// untuk TabDbJob count + ListKandidatModal + MatchmakingModal. Baris sudah
// ter-dekorasi (berkas/bio/applications) oleh backend.
export async function fetchAllKandidat(opts: { force?: boolean } = {}): Promise<Kandidat[]> {
  const token = authStore.get().sessionToken || '';
  const cachedRows = allKandidatList.get();
  const fresh =
    cachedRows.length > 0 &&
    allKandidatToken === token &&
    allKandidatAt > 0 &&
    Date.now() - allKandidatAt < ALL_KANDIDAT_TTL_MS;
  if (!opts.force && fresh) return cachedRows;
  // Satu loop sekaligus: pemanggil kedua menumpang promise yang sedang jalan
  // alih-alih memulai paginasi kedua.
  if (allKandidatInflight) return allKandidatInflight;

  allKandidatInflight = (async () => {
    const pageSize = 200;
    const out: any[] = [];
    try {
      for (let page = 1; page <= 60; page++) {
        // Jalur apiClient, sama alasannya dengan fetchKandidatFromAPI di atas:
        // batas waktu + token yang di-refresh. Loop ini bisa menembak sampai 60
        // permintaan berurutan, jadi tanpa batas waktu satu permintaan yang
        // menggantung menahan seluruh paginasi — dan itulah yang terjadi pada
        // versi fetch mentah.
        const data = (await api.secure(
          'getCandidatesPage',
          [{ page, pageSize, q: '' }],
          { onSessionInvalid: 'throw' },
        )) as { success?: boolean; total?: number | string; candidates?: any[] };
        if (!data?.success) break;
        const rows = data.candidates || [];
        out.push(...rows);
        const total = Number(data.total) || 0;
        if (rows.length < pageSize || out.length >= total || rows.length === 0) break;
      }
    } catch (err) {
      console.error('[adminStore] fetchAllKandidat failed:', err);
    }
    // Dedupe by WA (baris terakhir menang) supaya count akurat.
    const byWa = new Map<string, any>();
    for (const r of out) {
      const w = String(r && (r.wa || '')).trim();
      byWa.set(w || String(out.indexOf(r)), r);
    }
    const rows = [...byWa.values()];
    setAllKandidatList(rows);
    kandidatTotal.set(rows.length);
    // Hanya cap kesegaran saat loop benar-benar berhasil — kegagalan jaringan
    // tidak boleh membuat daftar kosong dianggap "segar" selama 30 s.
    if (out.length > 0) {
      allKandidatAt = Date.now();
      allKandidatToken = token;
    }
    return rows;
  })();

  try {
    return await allKandidatInflight;
  } finally {
    allKandidatInflight = null;
  }
}

// ── Mail State ──────────────────────────────────────────
export const mailFilterStatus = atom<string>('MENUNGGU');
export const mailSearchText = atom<string>('');
export const mailList = atom<any[]>([]);

export function setMailFilterStatus(val: string) {
  mailFilterStatus.set(val);
}

export function setMailSearchText(val: string) {
  mailSearchText.set(val);
}



export async function fetchMailFromAPI() {
  try {
    // `force` — the callers are not all plain reads: TabMail re-fetches right
    // after marking a message read or deleting it, and `getAppData` is a
    // CACHEABLE_READ. Without `force` the refresh that follows the write would be
    // served the PRE-write payload for up to 30 s, so the admin's own action
    // would look like it did nothing. `force` skips the read and rewrites the
    // cache, so every other caller gets the new payload too.
    //
    // `silent` — this function has never surfaced a toast (it only logged), and
    // the client's toast is per-call. Leaving it on would invent a new user-visible
    // failure for a path that deliberately stayed quiet.
    const data = (await api.secure('getAppData', ['admin'], {
      force: true,
      silent: true,
      onSessionInvalid: 'throw',
    })) as { success?: boolean; formInbox?: unknown[] };
    if (data?.success) {
      mailList.set(data.formInbox || []);
    }
  } catch (err) {
    console.error('[adminStore] fetchMail failed:', err);
  }
}
