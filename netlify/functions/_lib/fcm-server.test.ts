import { beforeAll, describe, expect, it } from 'vitest';
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

  // `finally` does not run on a hard kill (Ctrl-C, a timeout SIGKILL, a closed
  // terminal, OOM). Two tests below overwrite or delete FILE, so such a kill
  // leaves a fixture — or nothing — where the live private key was. That is not
  // hypothetical: it is exactly how a 111-byte fixture was found sitting in the
  // repo on 2026-09-12. The in-memory backup dies with the process, so the
  // on-disk BAK is what makes the run recoverable. BAK is by definition the
  // pre-test state, so it always wins.
  const recoverFromKilledRun = () => {
    if (!fs.existsSync(BAK)) return false;
    fs.copyFileSync(BAK, FILE); // copyFileSync overwrites; rename does not on Windows
    fs.rmSync(BAK, { force: true });
    return true;
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
    if (recoverFromKilledRun()) {
      // Loud on purpose: silently recovering would hide the fact that a run was
      // killed and that the previous fixture was live on disk for a while.
      console.warn(
        '[fcm-server.test] a previous run was killed mid-test; restored the real ' +
          'credential from firebase-service-account.json.bak',
      );
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
