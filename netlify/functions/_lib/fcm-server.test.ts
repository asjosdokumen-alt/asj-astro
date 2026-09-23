import { beforeAll, describe, expect, it } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import fs from 'fs';
import path from 'path';
import { buildPushPayload, __loadServiceAccountForTest } from './fcm-server';

describe('buildPushPayload', () => {
  it('membuat data message web push tanpa notification payload', () => {
    const payload = buildPushPayload(
      'token-1',
      'Berkas Baru!',
      'Budi mengunggah CV.',
      '/admin.html',
    );

    expect(payload).toEqual({
      message: {
        token: 'token-1',
        data: {
          title: 'Berkas Baru!',
          body: 'Budi mengunggah CV.',
          url: '/admin.html',
        },
        webpush: { headers: { Urgency: 'high' } },
      },
    });
    expect(payload.message).not.toHaveProperty('notification');
    expect(payload.message.webpush).not.toHaveProperty('notification');
  });

  it('menormalkan nilai kosong menjadi string yang aman untuk FCM', () => {
    expect(buildPushPayload('t', '', '', '')).toMatchObject({
      message: { data: { title: '', body: '', url: '/' } },
    });
  });
});

// ── Bundled credential resolution (Phase C follow-up, 2026-09-12) ────────────
//
// The service account moved out of the environment because AWS Lambda
// compatibility mode caps the total per-function env at 4 KB and this single
// value was ~2.4 KB (59 % of the budget) — the deploy died at function creation.
// See docs/HANDOFF_4KB_ENV_LIMIT.md.
//
// These tests cover the part that is NOT cosmetic: that a wrong or missing file
// fails visibly, and that the file's contents are what actually reaches the JWT
// signer. A test that only proved "no throw" would pass for a broken key.
describe('service-account resolution', () => {
  const SECRETS = path.join(process.cwd(), 'netlify', 'functions', 'secrets');
  const FILE = path.join(SECRETS, 'firebase-service-account.json');
  // Sibling parking spot for the real credential while a test mutates FILE.
  // Ignored by the same `secrets/*` rule, so it can never be committed.
  const BAK = FILE + '.bak';

  // The recovery recipe, in one place so both refusal messages carry a command
  // that actually works. `--filter <site>` is NOT a site selector — it is a
  // monorepo option, and `env:get` answers `No site id found` **on stdout with
  // exit code 0**, which reads like success. The site must be linked, and
  // `--context production` is mandatory because the default context is `dev`.
  // Measured 2026-09-23 while restoring this very credential.
  const RESTORE_HINT =
    'Restore it with:\n' +
    '  netlify link --name asjastro\n' +
    '  netlify env:get FIREBASE_SERVICE_ACCOUNT --context production';

  // `finally` does not run on a hard kill (Ctrl-C, a timeout SIGKILL, a closed
  // terminal, OOM). Two tests below overwrite or delete FILE, so such a kill
  // leaves a fixture — or nothing — where the live private key was. That is not
  // hypothetical: it is exactly how a 111-byte fixture was found sitting in the
  // repo on 2026-09-12. The in-memory backup dies with the process, so the
  // on-disk BAK is what makes the run recoverable. BAK is by definition the
  // pre-test state, so it always wins.
  //
  // ── 2026-09-17: the recovery above was NOT enough, and this is why ────────
  //
  // `recoverFromKilledRun()` was called only from `beforeAll`, and returned
  // silently when BAK was absent. Consider a kill that lands *after* `unpark()`
  // deleted BAK but while FILE still held a fixture (the two writes are not
  // atomic, and a kill can interrupt anywhere between them):
  //
  //     FILE = fixture (110 B)      BAK = absent
  //
  // The next run finds no BAK, repairs nothing, prints nothing, and then passes
  // 9/9 — because a 110-byte fixture is a perfectly VALID-SHAPE service account.
  // The suite goes green while the live private key has been replaced by a
  // placeholder. That is a silent data-loss path that reports success, which is
  // the worst possible shape for a failure. It was reproduced by hand: planting a
  // fixture with no BAK and running this file yields "9 passed", and FILE is left
  // holding `FIXTUREVALUE`.
  //
  // The fix is to make the test able to TELL a real credential from a fixture,
  // and to refuse to run rather than destroy the real one. A real Google service
  // account always has a `private_key_id` (40 hex chars); the fixtures written by
  // this file deliberately do not. Absence of that field is therefore a reliable
  // fixture signal, and it is checked BEFORE anything is mutated.

  // True when the file holds something that is NOT a real credential — i.e. a
  // fixture left behind by a killed run. Only a positive identification counts,
  // so a real key is never misread as a fixture.
  //
  // ── 2026-09-23: checking the ID ALONE was not enough, and this is why ─────
  //
  // This function used to return "real" as soon as `private_key_id` matched
  // /^[0-9a-f]{40}$/, and nothing else. The fixture written by the test below
  // copies the REAL private_key_id (81aae427…) and substitutes
  // `'x'.repeat(3000)` for the key — so it satisfied that test while being
  // useless as a credential. Measured on disk: `firebase-service-account.json`
  // held exactly that fixture — two keys, no `client_email`, a 3000-char
  // single-line "key" that `crypto.createPrivateKey` rejects with
  // `DECODER routines::unsupported` — while the test at the top of this file,
  // 'the credential on disk is a real one, not a fixture left by a killed run',
  // was PASSING on it. A guard that cannot fail on the thing it names is the
  // same class of defect as the 2026-09-17 silent data loss.
  //
  // The signal that actually separates the two is the KEY, not the id: a real
  // Google service account carries a PEM block. Absence of one is a fixture,
  // whatever the id looks like.
  const looksLikeFixture = (p: string) => {
    try {
      if (!fs.existsSync(p)) return false;
      const o = JSON.parse(fs.readFileSync(p, 'utf8'));
      const pk = typeof o?.private_key === 'string' ? o.private_key : '';
      // `_lib/fcm-server.ts` repairs double-escaped newlines; mirror that here so
      // a correctly-stored key is not misread as a fixture.
      const pem = pk.includes('\\n') ? pk.replace(/\\n/g, '\n') : pk;
      return !/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(pem);
    } catch {
      return false;
    }
  };

  // Repair a killed run, and REFUSE TO CONTINUE if the credential cannot be
  // shown to be real. Failing loudly here is the entire point: silently running
  // the mutation tests against a fixture is what destroyed the key.
  //
  // ── 2026-09-23: `BAK` WINS was itself a data-loss path ──────────────────────
  //
  // BAK normally holds the pre-test state, because park() copies FILE to BAK
  // before any test mutates FILE — so BAK winning is right. But BAK can itself
  // be a FIXTURE, and that is exactly what was on disk on 2026-09-23: both FILE
  // and BAK held `'x'.repeat(3000)`. Restoring that BAK would overwrite the real
  // key with filler — the 2026-09-17 destruction with the copies swapped, and
  // this time reachable by a plain `npx vitest run`.
  //
  // So BAK is now validated before it is trusted:
  //   · BAK is real                    -> restore it (unchanged behaviour)
  //   · BAK is a fixture, FILE is real -> BAK is stale litter; discard it, keep FILE
  //   · both are fixtures              -> refuse: there is nothing to restore from
  // What a recovery DID, so the caller can report it from ONE place. Returning a
  // verdict instead of warning here keeps the file at a single `console.warn`:
  // the lint ratchet counts `lint/suspicious/noConsole` and a second one is a new
  // diagnostic it refuses (+1, measured 2026-09-23). The ratchet is right — the
  // message belongs next to the call site, not buried in the recovery logic.
  const RECOVERY_NOTE = {
    restored:
      '[fcm-server.test] a .bak was left behind by a previous run (killed mid-test, or ' +
      'its cleanup delete was blocked); restored the credential from it',
    'discarded-fixture-bak':
      '[fcm-server.test] the .bak held a TEST FIXTURE, not the pre-test state; discarded ' +
      'it and kept the credential already on disk',
  } as const;

  const recoverFromKilledRun = (): keyof typeof RECOVERY_NOTE | null => {
    if (fs.existsSync(BAK)) {
      if (looksLikeFixture(BAK)) {
        if (looksLikeFixture(FILE)) {
          throw new Error(
            'netlify/functions/secrets/firebase-service-account.json AND its .bak both ' +
              'hold TEST FIXTURES, so there is nothing real to restore from. Refusing to ' +
              'run: the mutation tests below would report a green suite while the live ' +
              'private key is a placeholder.\n' +
              RESTORE_HINT,
          );
        }
        // FILE is real, so the fixture BAK is litter from a run that was killed (or
        // had its delete blocked) while FILE held a fixture. Deleting it is the whole
        // fix — and it must be deleted rather than left, because the next run would
        // otherwise let it win.
        fs.rmSync(BAK, { force: true });
        return 'discarded-fixture-bak';
      }
      fs.copyFileSync(BAK, FILE); // copyFileSync overwrites; rename does not on Windows
      fs.rmSync(BAK, { force: true });
      return 'restored';
    }
    if (looksLikeFixture(FILE)) {
      throw new Error(
        'netlify/functions/secrets/firebase-service-account.json holds a TEST FIXTURE ' +
          'and there is no .bak to restore it from. A previous run was killed between ' +
          'unpark() copying BAK back and rmSync deleting it. Refusing to run: these ' +
          'tests would report a green suite while destroying the real private key.\n' +
          RESTORE_HINT,
      );
    }
    return null;
  };

  // Park the real file, then put it back. Used by every test that touches FILE.
  const park = () => {
    if (fs.existsSync(FILE)) fs.copyFileSync(FILE, BAK);
  };
  const unpark = () => {
    if (fs.existsSync(BAK)) {
      fs.copyFileSync(BAK, FILE);
      fs.rmSync(BAK, { force: true });
    } else {
      fs.rmSync(FILE, { force: true });
    }
  };

  beforeAll(() => {
    // Loud on purpose: silently recovering would hide the fact that the credential
    // was replaced on disk for a while.
    //
    // The wording says "left behind", not "killed": a .bak is also left by a run
    // that COMPLETED — the sandbox delete shim refuses `unpark`'s rmSync once ~50
    // files have been deleted in a turn (`SAFE_DELETE_BULK_CONFIRM_REQUIRED`),
    // measured 2026-09-23. Blaming a kill for that would send the next reader
    // looking for a crash that never happened.
    const recovery = recoverFromKilledRun();
    if (recovery) console.warn(RECOVERY_NOTE[recovery]);
  });

  it('the credential on disk is a real one, not a fixture left by a killed run', () => {
    // The prerequisite for every mutation test below. If this fails, the suite
    // must not proceed: mutating a file we cannot identify is how the real key
    // was destroyed on 2026-09-17.
    if (!fs.existsSync(FILE)) return; // no credential installed locally is legitimate
    expect(looksLikeFixture(FILE)).toBe(false);
  });

  it('looksLikeFixture identifies a fixture and never a real credential', () => {
    // Both directions, because a guard that flags a real key as a fixture would
    // make the suite refuse to run in the normal case.
    park();
    try {
      // A fixture: valid JSON shape, but no `private_key_id`.
      fs.writeFileSync(FILE, JSON.stringify({ client_email: 'x', private_key: 'FIXTUREVALUE' }));
      expect(looksLikeFixture(FILE)).toBe(true);

      // The fixture that actually sat on disk on 2026-09-23: the REAL
      // private_key_id with the key replaced by filler. It is a fixture, and
      // until 2026-09-23 this line asserted the opposite — which is what let it
      // hide from the check at the top of this file.
      fs.writeFileSync(
        FILE,
        JSON.stringify({
          private_key_id: '81aae4277486586dbb3c894d0cbe8988db4ca22d',
          private_key: 'x'.repeat(3000),
        }),
      );
      expect(looksLikeFixture(FILE)).toBe(true);

      // A REAL key, generated here rather than faked with filler: a real PEM
      // must never be misread as a fixture, or the suite refuses to run on a
      // machine that is configured correctly.
      const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
      fs.writeFileSync(
        FILE,
        JSON.stringify({
          private_key_id: '81aae4277486586dbb3c894d0cbe8988db4ca22d',
          private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
        }),
      );
      expect(looksLikeFixture(FILE)).toBe(false);
    } finally {
      unpark();
    }
  });

  it('discards a fixture .bak instead of letting it overwrite a real credential', () => {
    // The state found on disk on 2026-09-23: BAK was a fixture. Restoring it
    // would have replaced the real key with filler. When FILE is real, the
    // fixture BAK is stale litter and the fix is to drop it — and to drop it
    // HERE, because leaving it means the next run lets it win.
    const savedFile = fs.existsSync(FILE) ? fs.readFileSync(FILE, 'utf8') : null;
    const savedBak = fs.existsSync(BAK) ? fs.readFileSync(BAK, 'utf8') : null;
    try {
      // A real FILE is generated rather than read, so this test asserts the same
      // thing on a machine with no credential installed (CI) as on one with.
      const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
      const real = JSON.stringify({
        private_key_id: '81aae4277486586dbb3c894d0cbe8988db4ca22d',
        private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
      });
      fs.writeFileSync(FILE, real);
      fs.writeFileSync(
        BAK,
        JSON.stringify({
          private_key_id: '81aae4277486586dbb3c894d0cbe8988db4ca22d',
          private_key: 'x'.repeat(3000),
        }),
      );

      expect(recoverFromKilledRun()).toBe('discarded-fixture-bak');
      expect(fs.existsSync(BAK)).toBe(false); // the fixture is gone
      expect(fs.readFileSync(FILE, 'utf8')).toBe(real); // and FILE was NOT overwritten
    } finally {
      if (savedFile !== null) fs.writeFileSync(FILE, savedFile);
      else if (fs.existsSync(FILE)) fs.rmSync(FILE, { force: true });
      if (savedBak !== null) fs.writeFileSync(BAK, savedBak);
      else if (fs.existsSync(BAK)) fs.rmSync(BAK, { force: true });
    }
  });

  it('refuses when the credential AND its .bak are both fixtures', () => {
    // Nothing real to restore from. Returning false here would let the mutation
    // tests run against filler and report green.
    const savedFile = fs.existsSync(FILE) ? fs.readFileSync(FILE, 'utf8') : null;
    const savedBak = fs.existsSync(BAK) ? fs.readFileSync(BAK, 'utf8') : null;
    try {
      const fixture = JSON.stringify({
        private_key_id: '81aae4277486586dbb3c894d0cbe8988db4ca22d',
        private_key: 'x'.repeat(3000),
      });
      fs.writeFileSync(FILE, fixture);
      fs.writeFileSync(BAK, fixture);
      expect(() => recoverFromKilledRun()).toThrow(/TEST FIXTURE/);
    } finally {
      if (savedFile !== null) fs.writeFileSync(FILE, savedFile);
      else if (fs.existsSync(FILE)) fs.rmSync(FILE, { force: true });
      if (savedBak !== null) fs.writeFileSync(BAK, savedBak);
      else if (fs.existsSync(BAK)) fs.rmSync(BAK, { force: true });
    }
  });

  it('refuses to run instead of destroying an unidentifiable credential', () => {
    // Reproduces the exact state that destroyed the key: a fixture in FILE and
    // no BAK. recoverFromKilledRun() must throw, not return false — returning
    // false is what let the mutations proceed and overwrite the real key.
    //
    // THE CREDENTIAL MAY NOT EXIST, and in CI it never does: the file is
    // gitignored, so a fresh checkout has no secrets/firebase-service-account.json
    // at all. Reading it unconditionally made this test fail in CI with
    // `ENOENT ... firebase-service-account.json` — measured 2026-09-18 on the
    // first CI run this repository ever executed, and ONLY there: locally the
    // real key is on disk, so the read succeeded and the test passed for a reason
    // that had nothing to do with what it asserts.
    //
    // The state under test is constructed below either way; `saved` only records
    // whether there was something to restore.
    const saved = fs.existsSync(FILE) ? fs.readFileSync(FILE, 'utf8') : null;
    try {
      fs.writeFileSync(FILE, JSON.stringify({ client_email: 'x', private_key: 'FIXTUREVALUE' }));
      if (fs.existsSync(BAK)) fs.rmSync(BAK, { force: true });
      expect(() => recoverFromKilledRun()).toThrow(/TEST FIXTURE/);
    } finally {
      if (saved !== null) {
        fs.writeFileSync(FILE, saved); // put the real credential back, byte for byte
      } else if (fs.existsSync(FILE)) {
        // There was no credential to restore, so leave the filesystem as we found
        // it rather than stranding a fixture that a later run could mistake for a
        // real one.
        fs.rmSync(FILE, { force: true });
      }
      if (fs.existsSync(BAK)) fs.rmSync(BAK, { force: true });
    }
  });

  it('documents that the file path is repo-relative and reachable from cwd', () => {
    // Guards the assumption candidatePaths() relies on: that tests run with
    // cwd = repo root. If this ever breaks, the resolution walk needs updating.
    expect(process.cwd()).toBe(path.resolve(__dirname, '..', '..', '..'));
    expect(FILE.startsWith(process.cwd())).toBe(true);
  });

  it('the committed example file is present and has the required shape', () => {
    const example = path.join(SECRETS, 'firebase-service-account.example.json');
    expect(fs.existsSync(example)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(example, 'utf8'));
    // The loader requires exactly these two; project_id is needed for the URL.
    expect(parsed).toHaveProperty('client_email');
    expect(parsed).toHaveProperty('private_key');
    expect(parsed).toHaveProperty('project_id');
  });

  it('the .gitignore rule excludes the real file but not the example', () => {
    // This is the one rule that must never regress: a committed private key is
    // permanent in git history. Asserted via the same matcher git uses.
    const { execFileSync } = require('node:child_process');
    const ignored = (rel: string) => {
      try {
        execFileSync('git', ['check-ignore', '-q', rel], { cwd: process.cwd() });
        return true;
      } catch {
        return false;
      }
    };
    expect(ignored('netlify/functions/secrets/firebase-service-account.json')).toBe(true);
    expect(ignored('netlify/functions/secrets/firebase-service-account.example.json')).toBe(false);
    expect(ignored('netlify/functions/secrets/README.md')).toBe(false);
  });

  it('normalises double-escaped newlines in private_key', () => {
    // The loader repairs "\\n" -> "\n" because the key is transported as JSON
    // (both via env and via file). A mis-normalised PEM fails to sign, so this
    // is asserted on the transformation itself rather than trusted.
    const escaped = '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n';
    const repaired = escaped.replace(/\\n/g, '\n');
    expect(repaired).toContain('\n');
    expect(repaired).not.toContain('\\n');
    expect(repaired.split('\n').filter(Boolean).length).toBe(3);
  });

  it('returns null when neither the file nor the env var is present', () => {
    // The honest failure mode: no credential anywhere must be null, not a
    // half-built object that later throws inside crypto.createSign.
    const savedEnv = process.env.FIREBASE_SERVICE_ACCOUNT;
    delete process.env.FIREBASE_SERVICE_ACCOUNT;
    park();
    try {
      fs.rmSync(FILE, { force: true });
      expect(__loadServiceAccountForTest({ reset: true })).toBeNull();
    } finally {
      unpark();
      if (savedEnv !== undefined) process.env.FIREBASE_SERVICE_ACCOUNT = savedEnv;
    }
  });

  it('prefers the FILE over the env var (file-first precedence)', () => {
    // Precedence is deliberate and the opposite of the usual order: the file is
    // the intended production source, the env var only a transition fallback.
    const savedEnv = process.env.FIREBASE_SERVICE_ACCOUNT;
    fs.mkdirSync(SECRETS, { recursive: true });
    park();
    try {
      fs.writeFileSync(
        FILE,
        JSON.stringify({
          client_email: 'from-file@example.iam.gserviceaccount.com',
          project_id: 'from-file',
          private_key: 'FILEVALUE',
        }),
      );
      process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({
        client_email: 'from-env@example.iam.gserviceaccount.com',
        project_id: 'from-env',
        private_key: 'ENVVALUE',
      });
      const resolved = __loadServiceAccountForTest({ reset: true });
      expect(resolved).not.toBeNull();
      expect(resolved!.client_email).toBe('from-file@example.iam.gserviceaccount.com');
      expect(resolved!.project_id).toBe('from-file');
    } finally {
      unpark();
      if (savedEnv !== undefined) process.env.FIREBASE_SERVICE_ACCOUNT = savedEnv;
      else delete process.env.FIREBASE_SERVICE_ACCOUNT;
      __loadServiceAccountForTest({ reset: true });
    }
  });

  it('falls back to the env var when the file is absent', () => {
    const savedEnv = process.env.FIREBASE_SERVICE_ACCOUNT;
    park();
    try {
      fs.rmSync(FILE, { force: true });
      process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({
        client_email: 'env-only@example.iam.gserviceaccount.com',
        project_id: 'env-only',
        private_key: 'ENVONLY',
      });
      const resolved = __loadServiceAccountForTest({ reset: true });
      expect(resolved).not.toBeNull();
      expect(resolved!.client_email).toBe('env-only@example.iam.gserviceaccount.com');
    } finally {
      unpark();
      if (savedEnv !== undefined) process.env.FIREBASE_SERVICE_ACCOUNT = savedEnv;
      else delete process.env.FIREBASE_SERVICE_ACCOUNT;
      __loadServiceAccountForTest({ reset: true });
    }
  });
});
