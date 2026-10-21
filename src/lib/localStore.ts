/**
 * localStore.ts — IndexedDB mirror for local-first reads
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * KENAPA ADA, DAN KENAPA TIDAK PAKAI LIBRARY
 * ═════════════════════════════════════════════════════════════════════════════
 * `apiClient` masih memakai sessionStorage dengan TTL 30 detik. Dua batas yang
 * tidak bisa diperbaiki dari dalam sesi itu:
 *
 *   1. 30 detik bukan selamanya. Admin yang membiarkan tab terbuka menarik
 *      payload penuh berulang kali — `fetchAllKandidat` saja adalah loop
 *      `getCandidatesPage` 200 baris/halaman, sampai 60 permintaan BERURUTAN.
 *   2. sessionStorage mati bersama tab. Setiap reload memulai dari nol, dan
 *      render pertama SELALU menunggu jaringan.
 *
 * IndexedDB menyelesa keduanya. TIDAK ada dependensi baru (`idb`, `dexie`,
 * `localforage`): CDN proyek ini sudah mati, jadi setiap dependensi harus
 *vendor-dari-node_modules dan itu biaya build untuk ±150 baris wrapper.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ATURAN YANG MUSTI DIPATUHI
 * ═════════════════════════════════════════════════════════════════════════════
 * 1. INDEXEDDB BUKAN SATU-SATUNYA JALAN. `indexedDB` tidak ada di jsdom, tidak
 *    ada di mode privat beberapa peramban, dan bisa melempar pada kuota penuh.
 *    Semua operasi lalu menerima backend; kalau IndexedDB tidak bisa dibuka,
 *    backend memori dipakai dan `durable === false` — pemanggil TIDAK boleh
 *    menganggap data lokal abadi. Jalur rusak tetap membaca dari jaringan.
 *
 * 2. SATU PEMILIK SATU WAKTU. sessionStorage hidup per-tab dan kuncinya sudah
 *    membawa identitas sesi; IndexedDB hidup bersama peramban. Tanpa penanda
 *    pemilik, ganti akun di tab yang sama akan menyajikan baris milik akun
 *    SEBELUMNYA. Karena itu `meta/owner` diperiksa sebelum dibaca, dan store
 *    dikosongkan ketika pemiliknya berbeda.
 *
 * 3. KUNCI, BUKAN POSISI. Baris disimpan per kunci tabel (`code_job`,
 *    `id_kandidat`, …). Delta dari server bersifat INKLUSIF (`gte`), jadi baris
 *    ber-watermark sama terkirim ulang; upsert menurut kunci membuat
 *    pengiriman ulang itu tidak berbahaya. Ini juga satu-satunya bentuk yang
 *    membuat penghapusan bisa direkonsiliasi (bandingkan kunci lokal dengan
 *    manifest server).
 * ═════════════════════════════════════════════════════════════════════════════
 */

/** Satu baris mirror: kuncinya, isinya, dan watermark-nya. */
export interface LocalEntry {
  key: string;
  row: unknown;
  updatedAt: string | null;
}

/**
 * Penyimpanan minimal yang dibutuhkan mirror. Sengaja KECIL: itu yang membuat
 * backend memori bisa dipakai di tes (jsdom tidak punya IndexedDB) dan di
 * peramban tanpa IndexedDB, tanpa satu pun cabang `if (isTest)` di logika.
 */
export interface LocalBackend {
  get(store: string, key: string): Promise<unknown>;
  put(store: string, key: string, value: unknown): Promise<void>;
  del(store: string, key: string): Promise<void>;
  keys(store: string): Promise<string[]>;
  clear(store: string): Promise<void>;
  /** true = bertahan setelah reload (IndexedDB). false = memori proses. */
  readonly durable: boolean;
}

/** Backend memori. Dipakai tes, dipakai peramban tanpa IndexedDB. */
export function createMemoryBackend(): LocalBackend {
  const stores = new Map<string, Map<string, unknown>>();
  const store = (name: string): Map<string, unknown> => {
    let s = stores.get(name);
    if (!s) {
      s = new Map();
      stores.set(name, s);
    }
    return s;
  };
  return {
    durable: false,
    async get(_store, key) {
      return store(_store).get(key);
    },
    async put(_store, key, value) {
      store(_store).set(key, value);
    },
    async del(_store, key) {
      store(_store).delete(key);
    },
    async keys(_store) {
      return Array.from(store(_store).keys());
    },
    async clear(_store) {
      store(_store).clear();
    },
  };
}

/* ── Backend IndexedDB (ditulis tangan; tidak ada wrapper library) ───────── */

const DB_NAME = 'asj_local_v1';
const DB_VERSION = 1;
const ROW_STORE = 'rows';
const META_STORE = 'meta';

/** True kalau peramban menyediakan IndexedDB. jsdom: false. */
export function hasIndexedDb(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    // Beberapa peramban melempar saat properti ini disentuh dari context
    // tanpa window (worker, dll.) — itu berarti "tidak tersedia".
    return false;
  }
}

/**
 * Backend IndexedDB, atau `null` kalau tidak tersedia / gagal dibuka.
 *
 * `open()` bisa gagal karena kuota, karena versi, atau karena peramban yang
 * memblokir storage (Safari private history, IT policy). Semua itu jatuh ke
 * backend memori — bukan ke exception yang mematikan render.
 */
export async function createIdbBackend(): Promise<LocalBackend | null> {
  if (!hasIndexedDb()) return null;
  let db: IDBDatabase;
  try {
    db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(ROW_STORE)) d.createObjectStore(ROW_STORE);
        if (!d.objectStoreNames.contains(META_STORE)) d.createObjectStore(META_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('indexedDB open blocked'));
    });
  } catch {
    return null;
  }

  // Ringkas tapi jujur: satu transaksi per operasi. Mirror ini menulis sedikit
  // (satu delta ±200 baris), jadi overhead transaksi bukan yang dominan —
  // payload jaringan yang dominan, dan itu yang sedang dihindari.
  const run = <T>(
    mode: IDBTransactionMode,
    store: string,
    op: (s: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      let t: IDBTransaction;
      try {
        t = db.transaction([ROW_STORE, META_STORE], mode);
      } catch (e) {
        reject(e);
        return;
      }
      let req: IDBRequest<T>;
      try {
        req = op(t.objectStore(store));
      } catch (e) {
        reject(e);
        return;
      }
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      t.onabort = () => reject(t.error);
    });

  return {
    durable: true,
    get(_store, key) {
      return run('readonly', _store, (s) => s.get(key) as IDBRequest<unknown>);
    },
    put(_store, key, value) {
      return run('readwrite', _store, (s) => s.put(value, key) as IDBRequest<IDBValidKey>).then(() => undefined);
    },
    del(_store, key) {
      return run('readwrite', _store, (s) => s.delete(key) as IDBRequest<undefined>);
    },
    keys(_store) {
      return run('readonly', _store, (s) => s.getAllKeys() as IDBRequest<IDBValidKey[]>).then((k) => k.map(String));
    },
    clear(_store) {
      return run('readwrite', _store, (s) => s.clear() as IDBRequest<undefined>);
    },
  };
}

/* Penyimpanan di atas backend ─────────────────────────────────────────────── */

/** Nama store IDB untuk satu tabel aplikasi. */
export function rowStore(_table: string): string {
  return ROW_STORE;
}

/** Kunci baris di dalam mirror: `<tabel>␟<kunci baris>`. */
export function entryKey(table: string, key: string): string {
  return `${table}\u001f${key}`;
}

/** Ambil nama tabel dari kunci mirror. */
export function tableOf(entry: string): string {
  const i = entry.indexOf('\u001f');
  return i < 0 ? entry : entry.slice(0, i);
}

/** Ambil kunci baris dari kunci mirror. */
export function keyOfEntry(entry: string): string {
  const i = entry.indexOf('\u001f');
  return i < 0 ? entry : entry.slice(i + 1);
}

/**
 * Mirror satu tabel.
 *
 * Semua metode membaca `owner` dulu: kalau store ini milik sesi lain, isinya
 * dibuang sebelum dibaca (aturan 2 di header). Itu juga sebabnya `read` bisa
 * mengembalikan array kosong padahal `keys()` backend berisi — dan pemanggil
 * memperlakukan kosong sebagai "tarik penuh", bukan "tabel ini nol baris".
 */
export class LocalTable {
  constructor(
    private readonly backend: LocalBackend,
    private readonly table: string,
    private readonly owner: string,
  ) {}

  get durable(): boolean {
    return this.backend.durable;
  }

  /** Semua baris milik tabel ini, setelah saringan pemilik. */
  async all(): Promise<LocalEntry[]> {
    await this.enforceOwner();
    const keys = await this.backend.keys(ROW_STORE);
    const mine = keys.filter((k) => tableOf(String(k)) === this.table);
    const out: LocalEntry[] = [];
    for (const k of mine) {
      const raw = await this.backend.get(ROW_STORE, String(k));
      if (!raw || typeof raw !== 'object') continue;
      const rec = raw as { key?: unknown; row?: unknown; updatedAt?: unknown };
      out.push({
        key: keyOfEntry(String(k)),
        row: rec.row,
        updatedAt: typeof rec.updatedAt === 'string' ? rec.updatedAt : null,
      });
    }
    return out;
  }

  /** Upsert menurut kunci. Pengiriman ulang delta (gte inklusif) aman. */
  async putMany(entries: LocalEntry[]): Promise<number> {
    if (entries.length === 0) return 0;
    await this.enforceOwner();
    for (const e of entries) {
      await this.backend.put(ROW_STORE, entryKey(this.table, e.key), {
        key: e.key,
        row: e.row,
        updatedAt: e.updatedAt,
      });
    }
    return entries.length;
  }

  /** Hapus kunci yang sudah tidak ada di server (hasil manifest). */
  async deleteKeys(keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    await this.enforceOwner();
    for (const k of keys) {
      await this.backend.del(ROW_STORE, entryKey(this.table, k));
    }
    return keys.length;
  }

  /** Watermark terakhir yang BERHASIL disimpan untuk tabel ini. */
  async watermark(): Promise<string | null> {
    await this.enforceOwner();
    const v = await this.backend.get(META_STORE, this.metaKey('watermark'));
    return typeof v === 'string' && v ? v : null;
  }

  async setWatermark(w: string | null): Promise<void> {
    await this.enforceOwner();
    if (w) await this.backend.put(META_STORE, this.metaKey('watermark'), w);
    else await this.backend.del(META_STORE, this.metaKey('watermark'));
  }

  /** Kosongkan seluruh baris tabel ini (diganti pemilik, atau resync penuh). */
  async clearTable(): Promise<void> {
    const keys = await this.backend.keys(ROW_STORE);
    for (const k of keys) {
      if (tableOf(String(k)) === this.table) await this.backend.del(ROW_STORE, String(k));
    }
    await this.backend.del(META_STORE, this.metaKey('watermark'));
  }

  private metaKey(field: string): string {
    return `${this.table}\u001f${field}`;
  }

  /**
   * Satu pemeriksaan pemilik untuk SEMUA operasi.
   *
   * Ditulis ke `meta/owner`, bukan dibandingkan di memori: proses bisa mati di
   * antara penulisan baris dan penulisan tanda pemilik, dan yang bertahan harus
   * tetap konsisten setelah reload.
   */
  private async enforceOwner(): Promise<void> {
    const stored = await this.backend.get(META_STORE, 'owner');
    if (stored === this.owner) return;
    // Sesi berbeda ⇒ tidak ada satu pun byte lama yang boleh terpakai.
    await this.backend.clear(ROW_STORE);
    await this.backend.clear(META_STORE);
    await this.backend.put(META_STORE, 'owner', this.owner);
  }
}

/**
 * Buka mirror. `owner` adalah identitas sesi (tag dari token, BUKAN tokennya).
 *
 * Mengembalikan null kalau IndexedDB tidak tersedia — pemanggil yang meminta
 * "harus tahan reload" perlu tahu bedanya, dan yang cukup render cepat bisa
 * memakai `createMemoryBackend()` langsung.
 */
export async function openLocalTable(
  table: string,
  owner: string,
  opts: { backend?: LocalBackend; allowMemory?: boolean } = {},
): Promise<LocalTable | null> {
  const backend = opts.backend || (await createIdbBackend());
  if (backend) return new LocalTable(backend, table, owner);
  return opts.allowMemory ? new LocalTable(createMemoryBackend(), table, owner) : null;
}
