/**
 * kernel/job-signal.ts — gerbang murah di depan sweep antrean job.
 *
 * KENAPA ADA
 * ----------
 * `job_queue` tetap satu-satunya ledger (Postgres/Neon). Tapi sweep cron
 * berjalan tiap 15 menit, dan SETIAP sweep hari ini mengirim minimal dua
 * request Neon: satu `rpc/claim_next_job` dan satu `DELETE idempotency_keys`.
 * Neon menidurkan compute setelah 5 menit idle, jadi sweep berinterval 15 menit
 * membuat compute bangun terus-menerus — biaya yang dibayar penuh walaupun
 * antreannya kosong.
 *
 * Modul ini menyediakan SATU kunci skalar di Upstash Redis:
 *
 *     asj:job:next = instant (epoch ms) paling awal antrean perlu dilihat lagi
 *
 * Sweep membaca kunci itu LEBIH DULU. Kalau jawabannya "idle", sweep tidak
 * mengirim satu pun request Neon. Kalau jawabannya "unknown" (Redis mati,
 * timeout, kunci hilang), sweep menjalankan jalur hari ini apa adanya.
 *
 * ── KENAPA SATU SKALAR, BUKAN ZSET PER-JOB ─────────────────────────────────
 * Nilai kunci ini BUKAN salinan antrean; ia cache dari `min(run_after)` yang
 * dihitung Postgres lewat `next_job_due()` (migrasi 061). Konsekuensinya:
 * kehilangan kunci = satu pembacaan Neon, bukan job yang hilang. Tidak ada
 * keadaan per-job yang bisa menjadi yatim atau basi, dan tidak ada balapan
 * pop-vs-claim (claim memilih menurut `run_after ASC`, bukan menurut id yang
 * di-pop).
 *
 * ── KONTRAK YANG TIDAK BOLEH DILANGGAR ─────────────────────────────────────
 *   1. TIDAK ADA metode di sini yang boleh melempar. Error/timeout/non-2xx
 *      dipetakan ke nilai netral ('unknown' / false). Gerbang yang mati harus
 *      berarti "jalur hari ini", bukan "antrean berhenti".
 *   2. `announce()` HANYA MENURUNKAN nilai (min), tidak pernah menaikkan.
 *   3. `settle()` adalah CAS KETAT: menaikkan nilai hanya bila nilai tersimpan
 *      masih PERSIS sama dengan yang dibaca saat pass dimulai. Kalau `enqueue`
 *      menurunkannya di tengah pass, nilai yang lebih kecil menang — job baru
 *      tidak pernah menjadi yatim karena balapan. Satu pengecualian yang
 *      disengaja: bila operand CAS-nya `null` ("kunci harus absen") dan kunci
 *      memang absen, `settle()` MENULIS. Itu satu-satunya jalur bangun-ulang
 *      setelah eviction / restart Redis / sweep pertama, dan tanpanya gerbang
 *      tidak akan pernah pulih dari 'unknown'.
 *   4. `jobSignal()` mengembalikan NULL OBJECT saat `JOB_SIGNAL_MODE` bukan
 *      `on`/`shadow` atau saat dua env Upstash belum diisi. Null object itulah
 *      kill switch: `peek → 'unknown'`, `announce/settle → true`,
 *      `lease → true` = perilaku hari ini, byte-for-byte.
 *
 * ── I/O ────────────────────────────────────────────────────────────────────
 * REST Upstash adalah HTTP biasa, jadi klien ini lewat `kernel/http.ts`
 * (`request()` dengan `BUDGETS.redis`) dan otomatis mendapat deadline-clamp,
 * circuit breaker, bulkhead per-dependency, dan metrik
 * `dependency.call.latency{dep=upstash}`. Tidak ada paket `@upstash/redis`:
 * dependency baru akan melewati `kernel/http.ts` dan ditolak io-boundary.
 */

import { request } from './http';
import { env } from '../env';
import { log } from './log';

/**
 * Jawaban gerbang.
 *   'idle'    — tidak ada yang bisa di-claim sekarang; sweep boleh dilewati.
 *   'due'     — ada yang jatuh tempo; jalankan loop claim seperti hari ini.
 *   'unknown' — tidak tahu (Redis mati/timeout/kunci hilang/env kosong);
 *               perlakukan sebagai jalur hari ini.
 */
export type Verdict = 'idle' | 'due' | 'unknown';

/** Nama lease sekali-pakai yang dipakai sweep (internal, bukan bagian port). */
type LeaseName = 'cleanup' | 'reconcile';

/**
 * Port gerbang antrean.
 *
 * Pemegang handle WAJIB memakai satu instance untuk satu pass sweep: `settle()`
 * memakai nilai yang dibaca `peek()` pada instance yang sama.
 */
export interface JobSignal {
  /** Baca gerbang. TIDAK PERNAH melempar. Error/timeout ⇒ 'unknown'. */
  peek(now: number): Promise<Verdict>;

  /** Turunkan gerbang ke `atMs` (min). TIDAK PERNAH melempar. false = gagal. */
  announce(atMs: number): Promise<boolean>;

  /**
   * Naikkan gerbang ke `next` HANYA bila nilai tersimpan masih persis
   * `expected`. `next === null` berarti antrean kosong ⇒ sentinel jauh
   * (`Date.now() + 365 hari`).
   *
   * `expected === null` BUKAN kasus tepi — ia berarti "kunci harus MASIH TIDAK
   * ADA", dan itu operand CAS yang paling penting. Tanpa cabang ini, kunci yang
   * hilang (eviction, restart Redis, sweep pertama) tidak akan pernah dibangun
   * ulang: `GET` mengembalikan nil, `tonumber(nil)` tidak pernah sama dengan
   * angka apa pun, jadi CAS selalu menolak menulis, `peek()` selamanya
   * 'unknown', dan SETIAP sweep membayar jalur Neon penuh — tepat biaya yang
   * modul ini ada untuk menghapus, di kasus yang paling sering terjadi (antrean
   * kosong). Dengan `null` sebagai operand, SATU sweep yang menemukan kunci
   * hilang membangunnya kembali, sekali, secara atomik.
   */
  settle(expected: number | null, next: number | null): Promise<boolean>;

  /** Lease sekali-pakai. true = pemanggil ini yang menjalankan tugas. */
  lease(name: LeaseName): Promise<boolean>;

  /**
   * Nilai mentah `asj:job:next` yang dibaca `peek()` TERAKHIR (epoch ms), atau
   * null bila kunci tidak ada / peek gagal.
   *
   * Ini operand CAS untuk `settle()`. Dibutuhkan karena `peek()` hanya
   * mengembalikan verdict; tanpa nilai mentahnya, `settle()` tidak punya
   * pembanding dan CAS-nya akan menulis nilai basi.
   *
   * null adalah OPERAND YANG SAH, bukan "tidak ada operand": `peek()` juga
   * mengembalikan 'unknown' ketika kunci benar-benar absen, dan dalam kasus itu
   * `settle(null, …)` adalah satu-satunya cara membangun ulang kunci. Karena
   * itu pemanggil WAJIB meneruskan nilai ini apa adanya — menggantinya dengan
   * `Date.now()` (seperti yang sempat dilakukan sweep) membuat CAS tidak pernah
   * cocok dan kunci tidak pernah kembali.
   */
  readonly observed: number | null;
}

/** `asj:job:next` — instant paling awal antrean perlu dilihat (epoch ms). */
const KEY_NEXT = 'asj:job:next';

/** Lease 6 jam. Sweep berjalan tiap 15 menit, jadi 1 dari 24 sweep memegangnya. */
const KEY_LEASE: Record<LeaseName, string> = {
  cleanup: 'asj:job:lease:cleanup',
  reconcile: 'asj:job:lease:reconcile',
};

/** TTL lease dalam detik: 6 jam. */
const LEASE_TTL_SECONDS = 21_600;

/**
 * Sentinel "antrean kosong, jangan lihat lagi sampai ada yang mengumumkan".
 * Satu tahun ke depan. Ini yang membuat sweep kosong berbiaya nol tanpa batas
 * waktu: `enqueue()` selalu menurunkan nilai ini lewat `announce()`.
 */
const EMPTY_SENTINEL_MS = 365 * 86_400_000;

// ── Skrip Lua ────────────────────────────────────────────────────────────────
//
// Setiap skrip diberi penanda di baris komentar pertamanya (`-- asj:*`). Penanda
// itu bukan hiasan: unit test memakainya untuk mengenali skrip mana yang sedang
// dieksekusi oleh fake Redis, karena `request()` di-mock di batas HTTP dan tidak
// ada server Redis sungguhan di suite.
//
// Semua skrip mengembalikan angka/array sederhana supaya bisa dibaca sebagai
// JSON lewat REST (`{"result": ...}`).

/**
 * gate.lua — KEYS[1]=asj:job:next, ARGV[1]=now(ms).
 * Balik `{kode, nilai}`:
 *   {-1, ''}      kunci tidak ada  ⇒ 'unknown'
 *   {0,  '<ms>'}  nilai > now      ⇒ 'idle'
 *   {1,  '<ms>'}  nilai <= now     ⇒ 'due'
 * Nilai mentah ikut dikembalikan supaya `settle()` punya operand CAS tanpa
 * pembacaan kedua (satu perintah, bukan dua).
 */
const LUA_GATE = `-- asj:gate
local v = redis.call('GET', KEYS[1])
if not v then return {-1, ''} end
if tonumber(v) > tonumber(ARGV[1]) then return {0, v} end
return {1, v}`;

/**
 * announce.lua — KEYS[1]=asj:job:next, ARGV[1]=atMs.
 * MIN: tulis hanya bila kunci belum ada atau nilainya lebih besar. Tidak pernah
 * menaikkan, sehingga dua enqueue bersamaan tidak bisa saling menimpa ke nilai
 * yang lebih jauh.
 */
const LUA_ANNOUNCE = `-- asj:announce
local v = redis.call('GET', KEYS[1])
if (not v) or tonumber(v) > tonumber(ARGV[1]) then
  redis.call('SET', KEYS[1], ARGV[1])
  return 1
end
return 0`;

/**
 * settle.lua — KEYS[1]=asj:job:next, ARGV[1]=expected ('' = kunci harus ABSEN),
 * ARGV[2]=next.
 *
 * Tiga kasus, semuanya atomik di dalam SATU skrip (tidak ada GET-then-SET
 * terpisah, jadi tidak ada jendela balapan di antara keduanya):
 *
 *   1. kunci ABSEN dan ARGV[1] == ''  ⇒ SET, return 1.
 *      Jalur "bangun ulang": kunci di-evict, Redis restart, atau sweep pertama.
 *   2. kunci ABSEN dan ARGV[1] != ''  ⇒ return 0.
 *      Seseorang membuatnya di antara `peek()` dan `settle()`; nilai yang lebih
 *      kecil menang, jadi jangan ditimpa.
 *   3. kunci ADA dan ARGV[1] != '' dan nilainya PERSIS sama ⇒ SET, return 1.
 *      Selain itu return 0 — `enqueue` sudah menurunkannya di tengah pass.
 *
 * `''` dipakai sebagai penanda "absen" karena ARGV selalu string dan nilai
 * kunci selalu angka: tidak ada nilai sah yang bisa bentrok dengannya.
 */
const LUA_SETTLE = `-- asj:settle
local v = redis.call('GET', KEYS[1])
if not v then
  if ARGV[1] == '' then
    redis.call('SET', KEYS[1], ARGV[2])
    return 1
  end
  return 0
end
if ARGV[1] ~= '' and tonumber(v) == tonumber(ARGV[1]) then
  redis.call('SET', KEYS[1], ARGV[2])
  return 1
end
return 0`;

// ── Null object = kill switch ────────────────────────────────────────────────

/**
 * Mode `off`/env tidak lengkap. Setiap metode memetakan ke perilaku hari ini:
 *   peek    → 'unknown'  ⇒ sweep menjalankan loop claim seperti hari ini
 *   announce→ true       ⇒ enqueue tidak pernah gagal karena Redis
 *   settle  → true       ⇒ tidak ada yang perlu di-CAS
 *   lease   → true       ⇒ cleanup jalan TIAP sweep, persis hari ini
 */
const NULL_SIGNAL: JobSignal = {
  observed: null,
  async peek(): Promise<Verdict> {
    return 'unknown';
  },
  async announce(): Promise<boolean> {
    return true;
  },
  async settle(): Promise<boolean> {
    return true;
  },
  async lease(): Promise<boolean> {
    return true;
  },
};

// ── Implementasi Upstash REST ────────────────────────────────────────────────

class UpstashSignal implements JobSignal {
  private lastObserved: number | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  get observed(): number | null {
    return this.lastObserved;
  }

  async peek(now: number): Promise<Verdict> {
    // Setiap pembacaan mereset operand CAS: `observed` hanya boleh berarti
    // "nilai yang dibaca pembacaan ini".
    this.lastObserved = null;
    try {
      const raw = await this.evalScript(LUA_GATE, [KEY_NEXT], [now]);
      if (!Array.isArray(raw) || raw.length < 2) return 'unknown';

      const code = Number(raw[0]);
      const nilai = raw[1] === '' || raw[1] === null || raw[1] === undefined
        ? null
        : Number(raw[1]);

      if (!Number.isFinite(code)) return 'unknown';
      if (code === -1) return 'unknown'; // kunci tidak ada
      if (nilai === null || !Number.isFinite(nilai)) return 'unknown';

      this.lastObserved = nilai;
      if (code === 0) return 'idle';
      if (code === 1) return 'due';
      return 'unknown';
    } catch (err) {
      // Redis mati / timeout / non-2xx / deadline habis. Gerbang TIDAK boleh
      // menjatuhkan sweep: 'unknown' berarti "jalur hari ini".
      log.warn('job.signal.peek-failed', { err: String(err) });
      return 'unknown';
    }
  }

  async announce(atMs: number): Promise<boolean> {
    if (!Number.isFinite(atMs)) return false;
    try {
      await this.evalScript(LUA_ANNOUNCE, [KEY_NEXT], [Math.trunc(atMs)]);
      // 1 maupun 0 sama-sama sukses: 0 hanya berarti gerbang sudah lebih rendah.
      return true;
    } catch (err) {
      log.warn('job.signal.announce-error', { err: String(err) });
      return false;
    }
  }

  async settle(expected: number | null, next: number | null): Promise<boolean> {
    // `null` ⇒ operand CAS "kunci harus absen"; skrip membandingkannya dengan
    // '' dan menulis bila kunci memang tidak ada. Angka ⇒ CAS nilai persis.
    if (expected !== null && !Number.isFinite(expected)) return false;
    const target = next === null ? Date.now() + EMPTY_SENTINEL_MS : next;
    if (!Number.isFinite(target)) return false;
    try {
      const raw = await this.evalScript(LUA_SETTLE, [KEY_NEXT], [
        expected === null ? '' : String(Math.trunc(expected)),
        Math.trunc(target),
      ]);
      return Number(raw) === 1;
    } catch (err) {
      log.warn('job.signal.settle-failed', { err: String(err) });
      return false;
    }
  }

  async lease(name: LeaseName): Promise<boolean> {
    const key = KEY_LEASE[name];
    try {
      // Lease tidak butuh Lua: REST Upstash menerima `SET key 1 NX EX <ttl>`
      // sebagai segmen URL. `result: "OK"` = lease didapat, `null` = sudah
      // dipegang sweep lain.
      const res = await request(`${this.baseUrl}/set/${key}/1/NX/EX/${LEASE_TTL_SECONDS}`, {
        method: 'POST',
        budgetKey: 'redis',
        action: `redis.lease.${name}`,
        headers: { Authorization: `Bearer ${this.token}` },
      });
      const text = (await res.text()) || 'null';
      const parsed = JSON.parse(text) as { result?: unknown } | null;
      return parsed?.result === 'OK';
    } catch (err) {
      // Gagal mengambil lease = JANGAN menjalankan tugasnya. Cleanup yang
      // terlewat satu putaran tidak merusak apa pun; dua cleanup bersamaan juga
      // tidak, tetapi menebak "berhasil" akan membuat lease kehilangan arti.
      log.warn('job.signal.lease-failed', { name, err: String(err) });
      return false;
    }
  }

  /** `EVAL <skrip> <numkeys> <key...> <argv...>` lewat REST Upstash. */
  private async evalScript(
    script: string,
    keys: string[],
    args: Array<string | number>,
  ): Promise<unknown> {
    const body = JSON.stringify([
      'EVAL',
      script,
      String(keys.length),
      ...keys,
      ...args.map((a) => String(a)),
    ]);

    const res = await request(this.baseUrl, {
      method: 'POST',
      budgetKey: 'redis',
      action: 'redis.eval',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
      },
      body,
    });

    const text = (await res.text()) || 'null';
    const parsed = JSON.parse(text) as { result?: unknown; error?: unknown } | null;
    if (parsed && typeof parsed === 'object' && parsed.error) {
      // Upstash menjawab 200 dengan `{"error": "..."}` untuk kesalahan skrip.
      throw new Error(`Upstash error: ${String(parsed.error).slice(0, 120)}`);
    }
    return parsed?.result ?? null;
  }
}

// ── Pabrik ───────────────────────────────────────────────────────────────────

/**
 * Bangun port gerbang.
 *
 * Mengembalikan NULL OBJECT (perilaku hari ini) bila:
 *   - `JOB_SIGNAL_MODE` tidak diisi, `off`, atau nilai tak dikenal, ATAU
 *   - `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` belum diisi.
 *
 * Handle TIDAK di-cache: satu pass sweep memakai satu handle supaya
 * `peek()`/`settle()` berbagi operand CAS, dan `enqueue()` boleh membuat handle
 * sekali pakai tanpa risiko keadaan bocor antar-request.
 */
export function jobSignal(): JobSignal {
  const mode = (env('JOB_SIGNAL_MODE') || 'off').trim().toLowerCase();
  if (mode !== 'on' && mode !== 'shadow') return NULL_SIGNAL;

  const url = (env('UPSTASH_REDIS_REST_URL') || '').trim().replace(/\/+$/, '');
  const token = (env('UPSTASH_REDIS_REST_TOKEN') || '').trim();
  // Deploy tanpa Upstash HARUS tetap jalan: env kosong = null object.
  if (!url || !token) return NULL_SIGNAL;

  return new UpstashSignal(url, token);
}
