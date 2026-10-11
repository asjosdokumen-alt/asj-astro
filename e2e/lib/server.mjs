/**
 * server.mjs — "the local server this gate owns", in ONE place.
 *
 * WHY A SHARED MODULE
 * -------------------
 * SEVEN gates in this repo could not run at all, and none of them failed for the
 * reason it appeared to fail:
 *
 *   e2e:contrast  e2e:hover-contrast  e2e:dialog  e2e:drawer  e2e:aria-names
 *   e2e:labels    e2e:headings
 *
 * Every one reported `net::ERR_CONNECTION_REFUSED at http://localhost:4321/`,
 * which reads exactly like "the developer forgot to start the server". The
 * manifest therefore filed all seven as `infra` — "NOT run here (needs live
 * infra)". That classification is WRONG and expensive: these gates need no
 * database, no Supabase and no network. They need a process serving `dist/` on
 * localhost, which this repo already has (`server.cjs`).
 *
 * The real cause is documented at length in `responsive-sweep.mjs`: a server
 * started with `&` from this shell is KILLED from outside after 30-80 seconds,
 * leaving no JS-visible trace — not `uncaughtException`, not an exit code, not
 * an empty port listener. Measured with a `process.on('exit')` wrapper: the EXIT
 * marker is NEVER written. So `page.goto` answers `ERR_CONNECTION_REFUSED`, and
 * that is indistinguishable from "no server was ever started".
 *
 * Copying the fix into seven files would let the seven copies drift — and the
 * rule from `e2e/lib/aria-names.mjs` applies here too: a rule that exists in two
 * versions is a rule enforced in one version and believed in two. So the fix
 * lives here once.
 *
 * USAGE (gate owns its server)
 * ----------------------------
 *   import { ensureServer, stopServer } from './lib/server.mjs';
 *   await ensureServer();
 *   ... run playwright ...
 *   await stopServer();   // and still `process.exit(0)` explicitly
 *
 * USAGE (caller owns the server)
 * ------------------------------
 *   BASE_URL=http://localhost:4321 node e2e/test-contrast.mjs
 *   `ensureServer()` returns immediately and `stopServer()` never kills
 *   anything the gate did not start. This is what lets a battery run all seven
 *   gates against ONE server instead of seven.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import net from 'node:net';

const HERE = dirname(fileURLToPath(import.meta.url));
/* `e2e/lib/` → repo root is two levels up, not one. Getting this wrong makes
   `dist/index.html` look missing and raises a confusing "run npm run build"
   error from a tree that IS built. */
const REPO_ROOT = join(HERE, '..', '..');

const DEFAULT_PORT = 4321;
const READY_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 250;

let ownedServer = null;
let ownedPort = null;

/** True when something is already accepting TCP connections on `port`. */
export function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1');
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('error', () => resolve(false));
    /* A connect that neither succeeds nor errors must not hang the gate. */
    setTimeout(() => { socket.destroy(); resolve(false); }, 1_000);
  });
}

/**
 * Guarantee a server is serving `dist/` before the gate navigates.
 *
 * Returns the base URL to use, so a caller can write
 * `const base = await ensureServer()` instead of hardcoding a port.
 *
 * Throws — loudly, and with the ACTION to take — when it cannot. A gate that
 * navigates into `ERR_CONNECTION_REFUSED` and then reports a MEASUREMENT is
 * worse than a gate that refuses to start: the first invents findings (see
 * `test-contrast.mjs`, which printed `0:1 ... undefined on undefined` for every
 * route and read as 24 contrast failures when nothing had been measured).
 */
export async function ensureServer() {
  if (process.env.BASE_URL) {
    return process.env.BASE_URL;
  }

  const port = Number(new URL(process.env.BASE_URL || `http://localhost:${DEFAULT_PORT}`).port || DEFAULT_PORT);
  if (await portOpen(port)) {
    return `http://localhost:${port}`;
  }

  if (!existsSync(join(REPO_ROOT, 'dist', 'index.html'))) {
    throw new Error(
      `dist/index.html tidak ada — gate ini menyajikan build, bukan dev server.\n` +
      `  Jalankan: CODEBUDDY_SAFE_DELETE_ENABLED=0 npm run build`,
    );
  }

  ownedServer = spawn(process.execPath, [join(REPO_ROOT, 'server.cjs')], {
    cwd: REPO_ROOT,
    stdio: 'ignore',
    detached: false,
  });
  /* `unref()` is what makes the child outlive the job-shell. WITHOUT it this
     reproduces the exact bug the module exists to prevent: the server dies with
     the parent job and every navigation answers ERR_CONNECTION_REFUSED. */
  ownedServer.unref();
  ownedPort = port;

  /* A listen that never becomes ready is a real failure and must be reported as
     one — not silently turned into 24 phantom "findings". */
  ownedServer.on('error', (err) => {
    throw new Error(`server.cjs gagal dijalankan: ${err.message}`);
  });

  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await portOpen(port)) return `http://localhost:${port}`;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new Error(
    `server lokal tidak pernah siap di port ${port} setelah ${READY_TIMEOUT_MS} ms.\n` +
    `  Periksa: node server.cjs   (jalankan di depan, lihat pesan errornya)`,
  );
}

/**
 * Kill the server this module started, and only that one.
 *
 * Safe to call when the caller owned the server (`BASE_URL` set) or when no
 * server was ever started: it does nothing in both cases. A gate must still end
 * with an explicit `process.exit(0)` — a still-registered `page.route` holds the
 * event loop open, and `timeout` then kills with code 124, which CI reads as a
 * failure.
 */
export async function stopServer() {
  if (!ownedServer) return;
  try {
    ownedServer.kill();
  } catch {
    /* already gone — killing a dead child is not an error worth reporting */
  }
  ownedServer = null;
  ownedPort = null;
}

/** The port this module actually started (or null when it started none). */
export function ownedServerPort() {
  return ownedPort;
}
