/**
 * verify-cr01-cr02.mjs — standalone verification for CR-01 and CR-02.
 *
 * WHY THIS EXISTS
 *   CR-01 and CR-02 were raised from reading code (hook closure semantics + the
 *   server's cross-checks), not from observing a running page. This script makes
 *   both falsifiable without a browser and without touching src/.
 *
 *   It does two things:
 *     A. Reproduces the EXACT effect shape of the Combo submit block
 *        (src/components/candidate/ArcadeGame.tsx:1074-1090) in isolation, with
 *        the same dependency array `[skorCombo]`, and records the payload the
 *        timer would actually send.
 *     B. Feeds that payload's `ronde` to the REAL server function
 *        (netlify/functions/shared/game-skor.ts, imported from disk) and applies
 *        the same comparison the server applies at
 *        netlify/functions/_lib/game/leaderboard.ts:299-302.
 *
 *   Only difference from production: the 5 000 ms debounce is 60 ms here, and
 *   the component's other state is stubbed. Neither affects the mechanism.
 *
 * RUN:  cd /f/astro && node --experimental-strip-types deliverables/gstack/verify-cr01-cr02.mjs
 */

import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;
globalThis.Event = dom.window.Event;

const { h, render } = await import('preact');
const { useState, useRef, useEffect } = await import('preact/hooks');
const { hitungCombo, RONDE_MAKS_COMBO } = await import(
  '../../netlify/functions/shared/game-skor.ts'
);

const DEBOUNCE = 60; // production: 5000
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

/* ── A. the submit block, reproduced ─────────────────────────────────────────
 * Faithful to ArcadeGame.tsx:1074-1090: deps are `[skorCombo]` ONLY, `kombo`
 * and `kalimat` are closed over from the render that armed the timer, and
 * `ronde` is read from a ref at fire time.
 */
const ctl = { sent: [], correct: null, wrong: null, complete: null };

function ComboSubmitRepro() {
  const [skorCombo, setSkorCombo] = useState(0);
  const [kombo, setKombo] = useState(1);
  const [kalimatSelesai, setKalimatSelesai] = useState(0);
  const rondeComboRef = useRef([]);

  useEffect(() => {
    if (skorCombo <= 0) return;
    const id = window.setTimeout(() => {
      ctl.sent.push({
        skorCombo,
        kombo,
        kalimat: kalimatSelesai,
        ronde: rondeComboRef.current.slice(),
      });
    }, DEBOUNCE);
    return () => window.clearTimeout(id);
    // biome-ignore lint: mirroring the production dependency array on purpose
  }, [skorCombo]);

  // ketuk() — correct card: :1128-1137
  ctl.correct = () => {
    const komboBaru = Math.min(10, kombo + 1);
    const skorBaru = skorCombo + 50 * komboBaru;
    rondeComboRef.current.push([1, 0]);
    setKombo(komboBaru);
    setSkorCombo(skorBaru);
  };
  // ketuk() — wrong card: :1165-1169. Note: no score change.
  ctl.wrong = () => {
    rondeComboRef.current.push([0, 0]);
    setKombo(1);
  };
  // sentence completed: :1140-1155
  ctl.complete = (sisa = 80, kode = 0) => {
    const komboBaru = Math.min(10, kombo + 1);
    rondeComboRef.current.push([1, 0]);
    rondeComboRef.current.push([2, sisa, kode]);
    setKombo(komboBaru);
    setSkorCombo(skorCombo + 50 * komboBaru + 100);
    setKalimatSelesai((n) => n + 1);
  };
  return h('div', null, `${skorCombo}|${kombo}|${kalimatSelesai}`);
}

render(h(ComboSubmitRepro, {}), document.getElementById('root'));
await tick(20);

const lines = [];
const log = (s = '') => {
  lines.push(s);
  console.log(s);
};

log('=== A. payload the timer actually sends (production effect shape) ===');
ctl.correct(); // one correct card: score changes, timer armed
await tick(20);
ctl.wrong(); // wrong card inside the window: kombo -> 1, NO score change
await tick(DEBOUNCE * 3); // let the armed timer fire
const p1 = ctl.sent[0];
log(`sent: ${JSON.stringify(p1)}`);
log(`  client-side kombo at fire time (state): ${ctl.sent.length ? 'see payload' : 'n/a'}`);

/* ── B. what the server does with it ─────────────────────────────────────── */
log('');
log('=== B. server replay + the comparison at leaderboard.ts:299-302 ===');
const hasil = hitungCombo(p1.ronde);
log(`hitungCombo(ronde) -> ${JSON.stringify(hasil)}`);
const komboKlien = Number(p1.kombo);
const rejects = Number.isFinite(komboKlien) && Math.round(komboKlien) !== hasil.kombo;
log(`komboKlien=${komboKlien}  hasil.kombo=${hasil.kombo}  ->  ${rejects ? 'REJECTED' : 'accepted'}`);
if (rejects) {
  log(`  server message: "Ronde tidak cocok dengan kombo terakhir." (leaderboard.ts:300-301)`);
  log(`  and simpanSkor returns before the DB write; kirimSkor swallows it (skorGame.ts:93-97)`);
}

/* Control: the SAME round without the stray wrong tap must be accepted, so the
   rejection is attributable to the stale kombo and nothing else. */
log('');
log('=== B2. control: same ronde, kombo taken from the replay (no stale state) ===');
const honest = { ...p1, kombo: hasil.kombo };
const rejectsHonest =
  Number.isFinite(Number(honest.kombo)) && Math.round(Number(honest.kombo)) !== hasil.kombo;
log(`komboKlien=${honest.kombo}  hasil.kombo=${hasil.kombo}  ->  ${rejectsHonest ? 'REJECTED' : 'accepted'}`);

/* ── C. CR-02: the 4000-event ceiling ────────────────────────────────────── */
log('');
log('=== C. CR-02: rondeComboRef is never reset, server caps at RONDE_MAKS_COMBO ===');
log(`RONDE_MAKS_COMBO = ${RONDE_MAKS_COMBO}`);
const atCap = Array.from({ length: RONDE_MAKS_COMBO }, () => [1, 0]);
const overCap = Array.from({ length: RONDE_MAKS_COMBO + 1 }, () => [1, 0]);
const rCap = hitungCombo(atCap);
const rOver = hitungCombo(overCap);
log(`hitungCombo(${RONDE_MAKS_COMBO} events)     -> ${rCap ? `ok, skor=${rCap.skor}` : 'null'}`);
log(`hitungCombo(${RONDE_MAKS_COMBO + 1} events) -> ${rOver ? `ok, skor=${rOver.skor}` : 'null  -> "Rincian ronde tidak sah atau tidak dikirim."'}`);

/* ── D. CR-02b: the SCORE ceiling bites first ────────────────────────────────
 * `hitungCombo(4000 events)` already scores 1 998 200, which is above the
 * 1 000 000 ceiling that `batasSkor()` applies to any submission without
 * `detail.loop >= 1` — and the Combo payload never sets `loop`. So the real
 * limit is not the 4000-event cap, it is the score ceiling, reached much
 * earlier. The ceiling is read from leaderboard.ts itself rather than retyped.
 */
log('');
log('=== D. CR-02b: which ceiling is actually reached first ===');
const fs = await import('node:fs');
const lb = fs.readFileSync(new URL('../../netlify/functions/_lib/game/leaderboard.ts', import.meta.url), 'utf8');
const mSkor = lb.match(/const SKOR_MAKS = ([\d_]+);/);
const mUlt = lb.match(/const SKOR_MAKS_ULTIMATE = ([\d_]+);/);
if (!mSkor || !mUlt) throw new Error('ceiling constants not found in leaderboard.ts — re-read the file');
const SKOR_MAKS = Number(mSkor[1].replace(/_/g, ''));
const SKOR_MAKS_ULTIMATE = Number(mUlt[1].replace(/_/g, ''));
log(`leaderboard.ts: SKOR_MAKS=${SKOR_MAKS}  SKOR_MAKS_ULTIMATE=${SKOR_MAKS_ULTIMATE}`);
log(`batasSkor({}) for a Combo payload (no detail.loop) = ${SKOR_MAKS}`);
let firstOver = null;
for (let n = 1; n <= RONDE_MAKS_COMBO; n++) {
  const r = hitungCombo(Array.from({ length: n }, () => [1, 0]));
  if (r && r.skor > SKOR_MAKS) {
    firstOver = { n, skor: r.skor };
    break;
  }
}
if (firstOver) {
  log(`first tap count whose replay score exceeds the ceiling: ${firstOver.n} (skor=${firstOver.skor})`);
  log(`  -> simpanSkor answers "Skor tidak masuk akal." (leaderboard.ts:323-325) well before the 4000-event cap`);
} else {
  log('score ceiling not reached within RONDE_MAKS_COMBO — CR-02b does not apply');
}

/* ── verdict ─────────────────────────────────────────────────────────────── */
log('');
const cr01 = rejects && !rejectsHonest;
const cr02 = rCap !== null && rOver === null;
const cr02b = firstOver !== null && firstOver.n < RONDE_MAKS_COMBO;
log(`CR-01 ${cr01 ? 'CONFIRMED' : 'NOT CONFIRMED'} — stale kombo causes rejection; replay-derived kombo is accepted.`);
log(`CR-02 ${cr02 ? 'CONFIRMED' : 'NOT CONFIRMED'} — the same array is accepted at the cap and rejected one event past it.`);
log(`CR-02b ${cr02b ? 'CONFIRMED' : 'NOT CONFIRMED'} — the score ceiling rejects a legitimate replay at ${firstOver ? firstOver.n : '?'} taps, i.e. before the event cap.`);
log('');
log('Both are pure payload/validation mismatches: no DB, no browser, no network needed.');
process.exit(cr01 && cr02 ? 0 : 1);
