/**
 * boundary.test.ts — roadmap row 8 (violations half): the pure violations
 * evaluator over synthetic module graphs, one fixture per ported rule kind,
 * plus real-repo assertions pinned to the oracle run of the repo's own
 * depcruise binary (10 violations on this tree: 2 error + 8 warn).
 */

import { describe, expect, it } from 'vitest';
import { get as httpGet } from 'node:http';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import type { DumpDoc } from './dump.js';
import { buildIndex } from './build.js';
import { dumpDoc } from './dump.js';
import { loadForbidRules } from './boundary.js';
import { indexFromDoc, violationsOf, type ForbidRule, type QueryIndex } from './query.js';
import { bind, createIndexServer } from './serve.js';

const ROOT = process.cwd(); // buildIndex normalizes backslashes

function mkDoc(files: Array<[number, string]>, edges: Array<{ from: number; to: number | string; type?: number }>, rootDir = '/r'): DumpDoc {
  return {
    epoch: 1,
    rootDir,
    stats: { fileCount: files.length, symbolCount: 0, referenceCount: 0, unresolvedCount: 0, memoryBytes: 0 },
    files: files.map(([idx, path]) => ({ idx, path, id: 'file:' + path })),
    symbols: [],
    refs: [],
    unresolved: [],
    unresolvedImports: [],
    symbolEdges: [],
    exportSurfaces: [],
    importEdges: edges.map((e) => ({ from: e.from, to: e.to, type: e.type ?? 3, specifier: '' })),
  } as unknown as DumpDoc;
}

const rule = (r: Partial<ForbidRule> & { name: string }): ForbidRule => ({ severity: 'error', from: {}, to: {}, ...r });

describe('violationsOf over synthetic module graphs', () => {
  it('flags a forbid cross-boundary import', () => {
    const index = indexFromDoc(
      mkDoc(
        [
          [0, 'pkg/kernel/a.ts'],
          [1, 'pkg/contexts/b.ts'],
          [2, 'pkg/lib/c.ts'],
        ],
        [
          { from: 0, to: 1 },
          { from: 0, to: 2 },
        ],
      ),
    );
    const view = violationsOf(index, [rule({ name: 'kernel-no-context', from: { path: '^pkg/kernel/' }, to: { path: '^pkg/contexts/' } })]);
    expect(view.total).toBe(1);
    expect(view.errors).toBe(1);
    expect(view.warnings).toBe(0);
    expect(view.violations[0]).toMatchObject({ ruleName: 'kernel-no-context', from: 'pkg/kernel/a.ts', to: 'pkg/contexts/b.ts', type: 'import' });
  });

  it('honors a pathNot exception on the to side (owner barrel rule shape)', () => {
    const index = indexFromDoc(
      mkDoc(
        [
          [0, 'pkg/contexts/catalog/service.ts'],
          [1, 'pkg/contexts/applications/repository.ts'],
          [2, 'pkg/contexts/identity/service.ts'],
          [3, 'pkg/contexts/identity/index.ts'],
          [4, 'pkg/contexts/identity/sub/helpers.ts'],
        ],
        [
          { from: 0, to: 1 }, // other context's repository — pathNot-exempt, allowed
          { from: 0, to: 2 }, // other context's service — pathNot-exempt, allowed
          { from: 0, to: 4 }, // other context's non-owner file — the violation
          { from: 3, to: 2 }, // own-context index → own service — allowed
        ],
      ),
    );
    const view = violationsOf(index, [
      rule({ name: 'contexts-no-cross-context', from: { path: '^pkg/contexts/' }, to: { path: '^pkg/contexts/', pathNot: '^pkg/contexts/[^/]+/(service|repository|index)[.]ts$' } }),
    ]);
    expect(view.violations.map((v) => v.from + ' -> ' + v.to)).toEqual(['pkg/contexts/catalog/service.ts -> pkg/contexts/identity/sub/helpers.ts']);
  });

  it('applies a from-side pathNot and an OR-ed to.path array', () => {
    const index = indexFromDoc(
      mkDoc(
        [
          [0, 'pkg/kernel/engine.spec.ts'],
          [1, 'pkg/contexts/applications/service.ts'],
          [2, 'pkg/surfaces/one.ts'],
          [3, 'pkg/lib/db.ts'],
        ],
        [
          { from: 0, to: 1 },
          { from: 0, to: 2 },
          { from: 0, to: 3 },
        ],
      ),
    );
    const view = violationsOf(index, [
      rule({ name: 'kernel-no-context-or-surface', from: { path: '^pkg/kernel/', pathNot: 'spec[.]ts$' }, to: { path: ['^pkg/contexts/', '^pkg/surfaces/'] } }),
    ]);
    expect(view.total).toBe(0); // the only kernel file (engine.spec.ts) is excluded by from.pathNot
    const noPathNot = violationsOf(index, [
      rule({ name: 'kernel-no-context-or-surface', from: { path: '^pkg/kernel/' }, to: { path: ['^pkg/contexts/', '^pkg/surfaces/'] } }),
    ]);
    expect(noPathNot.total).toBe(2);
    expect(noPathNot.violations.map((v) => v.to)).toEqual(['pkg/contexts/applications/service.ts', 'pkg/surfaces/one.ts']);
  });

  it('filters by dependencyTypes the index can express', () => {
    const index = indexFromDoc(
      mkDoc(
        [
          [0, 'pkg/app/a.ts'],
          [1, 'pkg/core/b.ts'],
        ],
        [
          { from: 0, to: 1, type: 3 }, // imports (static)
          { from: 0, to: 1, type: 5 }, // dynamic import
          { from: 0, to: 1, type: 6 }, // re-export
        ],
      ),
    );
    const staticOnly = violationsOf(index, [rule({ name: 'no-core', dependencyTypes: ['import'], from: { path: '^pkg/app/' }, to: { path: '^pkg/core/' } })]);
    expect(staticOnly.total).toBe(1); // only the static edge matches the filter
    expect(staticOnly.violations[0].type).toBe('import');
    const allKinds = violationsOf(index, [rule({ name: 'no-core', from: { path: '^pkg/app/' }, to: { path: '^pkg/core/' } })]);
    expect(allKinds.total).toBe(1); // same from-to pair dedupes across edge kinds
  });

  it('dedupes duplicate edges per (rule, from, to) and ignores module-id targets', () => {
    const index = indexFromDoc(
      mkDoc(
        [
          [0, 'pkg/contexts/catalog/service.ts'],
          [1, 'pkg/db/client.ts'],
          [2, 'pkg/contexts/other/service.ts'],
        ],
        [
          { from: 0, to: 1, type: 5 }, // two import() sites → same target
          { from: 0, to: 1, type: 5 },
          { from: 2, to: 1, type: 3 },
          { from: 0, to: 'ext:some-pkg' }, // module ids never match path rules
          { from: 0, to: 'unresolved:./nope' },
        ],
      ),
    );
    const view = violationsOf(index, [rule({ name: 'contexts-no-raw-db', from: { path: '^pkg/contexts/' }, to: { path: '^pkg/db/client[.]ts$' } })]);
    expect(view.total).toBe(2); // catalog once (not twice) + other
    expect(view.violations.filter((v) => v.from.startsWith('pkg/contexts/catalog'))).toHaveLength(1);
  });

  it('answers zero on legacy snapshots without importEdges', () => {
    const doc = mkDoc([[0, 'pkg/kernel/a.ts']], [{ from: 0, to: 1 }]);
    const legacy = { ...doc, importEdges: undefined } as unknown as DumpDoc;
    const view = violationsOf(indexFromDoc(legacy), [rule({ name: 'r', from: { path: '^pkg/' }, to: { path: '^pkg/' } })]);
    expect(view.total).toBe(0);
  });

  it('flags one circular violation per cycle member set (depcruise semantics)', () => {
    // contexts cycle: service(ctx) → _lib/helper → index(ctx) → service. All three
    // edges are circular, two originate in contexts — but they share one cycle
    // member set, and depcruise collapses them into a single violation (verified
    // live on the real tree: index→service and service→cv report once).
    const index = indexFromDoc(
      mkDoc(
        [
          [0, 'pkg/contexts/alpha/service.ts'],
          [1, 'pkg/_lib/helper.ts'],
          [2, 'pkg/contexts/alpha/index.ts'],
        ],
        [
          { from: 0, to: 1 },
          { from: 1, to: 2 },
          { from: 2, to: 0 },
        ],
      ),
    );
    const view = violationsOf(index, [rule({ name: 'no-circular', from: { path: '^pkg/contexts/' }, to: { circular: true } })]);
    expect(view.total).toBe(1);
    expect(view.errors).toBe(1);
    const members = [...(view.violations[0].cycle ?? [])].sort();
    expect(members).toEqual(['pkg/_lib/helper.ts', 'pkg/contexts/alpha/index.ts', 'pkg/contexts/alpha/service.ts'].sort());
  });

  it('reports a self-import as circular and honors to.circular:false as the inverse', () => {
    const index = indexFromDoc(
      mkDoc(
        [
          [0, 'pkg/contexts/alpha/service.ts'],
          [1, 'pkg/contexts/alpha/index.ts'],
        ],
        [
          { from: 0, to: 0 }, // self-import
          { from: 0, to: 1 }, // acyclic
        ],
      ),
    );
    const circ = violationsOf(index, [rule({ name: 'no-self', to: { circular: true } })]);
    expect(circ.total).toBe(1);
    expect(circ.violations[0].from).toBe('pkg/contexts/alpha/service.ts');
    expect(circ.violations[0].to).toBe('pkg/contexts/alpha/service.ts');
    expect(circ.violations[0].cycle).toEqual(['pkg/contexts/alpha/service.ts']);
    const acyclic = violationsOf(index, [rule({ name: 'no-noncircular', to: { circular: false } })]);
    expect(acyclic.total).toBe(1); // only the acyclic edge matches
    expect(acyclic.violations[0].to).toBe('pkg/contexts/alpha/index.ts');
  });


  it('circular:false rules keep per-edge violations (member-set dedupe is circular:true only)', () => {
    const index = indexFromDoc(
      mkDoc(
        [
          [0, 'pkg/a.ts'],
          [1, 'pkg/b.ts'],
          [2, 'pkg/c.ts'],
          [3, 'pkg/d.ts'],
        ],
        [
          { from: 0, to: 1 }, // acyclic
          { from: 0, to: 2 }, // acyclic — distinct edge, must report separately
          { from: 0, to: 3 }, // a↔d cycle
          { from: 3, to: 0 },
        ],
      ),
    );
    const view = violationsOf(index, [rule({ name: 'no-noncircular', to: { circular: false } })]);
    expect(view.total).toBe(2); // a→b and a→c; d→a is circular (d→a→d) and a↔d edges excluded
    expect(view.violations.map((v) => v.to).sort()).toEqual(['pkg/b.ts', 'pkg/c.ts']);
  });

  it('keeps non-circular edges silent and combines path filters with to.circular', () => {
    const index = indexFromDoc(
      mkDoc(
        [
          [0, 'pkg/contexts/alpha/service.ts'],
          [1, 'pkg/_lib/a.ts'],
          [2, 'pkg/_lib/b.ts'],
          [3, 'pkg/contexts/beta/service.ts'],
        ],
        [
          { from: 0, to: 1 },
          { from: 1, to: 2 },
          { from: 2, to: 0 }, // completes the cycle back to contexts/alpha
          { from: 3, to: 2 }, // beta only imports _lib; never circular
        ],
      ),
    );
    const view = violationsOf(index, [rule({ name: 'no-circular', from: { path: '^pkg/contexts/' }, to: { circular: true } })]);
    expect(view.total).toBe(1);
    expect(view.violations[0].from).toBe('pkg/contexts/alpha/service.ts');
    expect(new Set(view.violations[0].cycle)).toEqual(new Set(['pkg/contexts/alpha/service.ts', 'pkg/_lib/a.ts', 'pkg/_lib/b.ts']));
    const none = violationsOf(index, [rule({ name: 'no-circular', from: { path: '^pkg/contexts/beta/' }, to: { circular: true } })]);
    expect(none.total).toBe(0);
  });
});

describe('violations over the real repo (oracle-pinned)', () => {
  it('loads the repo config with all 6 rules ported (incl. the §5.4 no-circular) and none skipped', async () => {
    const loaded = await loadForbidRules(ROOT);
    expect(loaded.rules.map((r) => r.name).sort()).toEqual(
      ['contexts-no-cross-context', 'contexts-no-raw-db', 'kernel-no-context-or-surface', 'no-circular', 'surfaces-no-cross-surface', 'surfaces-no-old-actions'].sort(),
    );
    expect(loaded.skipped).toEqual([]);
    const nc = loaded.rules.find((r) => r.name === 'no-circular')!;
    expect(nc.severity).toBe('error');
    expect(nc.to.circular).toBe(true);
    expect(nc.from.path).toEqual(['^netlify/functions/contexts/']);
    expect(loaded.rules.every((r) => r.severity === 'error' || r.severity === 'warn')).toBe(true);
  });

  it('matches the depcruise oracle: 0 violations on this tree after the warning sweep', async () => {
    const loaded = await loadForbidRules(ROOT);
    const index = indexFromDoc(dumpDoc(buildIndex(ROOT)));
    const view = violationsOf(index, loaded.rules);
    // Drift fixes + the warning sweep landed: APPLY_WA_COLS moved cv.ts ->
    // _lib/db/client.ts (no-circular clean), characterisation.test.ts moved out
    // of _lib/kernel, all 7 contexts services now route their _lib/db/client
    // helpers through their own repository, and surfaces/auth.ts delegates
    // registerFcmToken to contexts/identity instead of the legacy
    // _lib/actions-auth dispatcher. Zero rules are skipped; the config's 6
    // forbid rules all evaluate over the module graph with nothing to report.
    expect(view.total).toBe(0);
    expect(view.errors).toBe(0);
    expect(view.warnings).toBe(0);
    expect(view.violations).toEqual([]);

    // ── AND NOW ACTUALLY RUN THE ORACLE ──────────────────────────────────────
    // This test has been NAMED "matches the depcruise oracle" since it was
    // written, and until 2026-09-17 it never executed the binary. It re-derived
    // the same verdict from `boundary.ts`, a hand-written reimplementation of
    // dependency-cruiser's semantics. So the name was a claim rather than a
    // measurement, and it made audit A-07 read as "two competing layering
    // checkers, one wired" when the measured truth is "one wired checker
    // (`boundary`) plus one reference implementation nobody ran".
    //
    // The distinction has teeth. `boundary.ts` MIRRORS depcruise by hand against
    // the same `.dependency-cruiser.cjs`, so the only thing that can catch a
    // drift in that mirroring is running the real binary — and a mirror that
    // drifts is worse than no oracle, because the suite keeps saying "matches
    // the oracle" while both sides move. Cost on this tree: ~6 s.
    const cruise = spawnSync(
      process.execPath,
      [
        join(ROOT, 'node_modules/dependency-cruiser/bin/dependency-cruise.mjs'),
        'netlify/functions',
        '--config',
        '.dependency-cruiser.cjs',
        '--output-type',
        'err',
      ],
      { cwd: ROOT, encoding: 'utf8' },
    );
    expect(
      cruise.status,
      `depcruise oracle disagrees with boundary.ts (exit ${cruise.status}):\n${cruise.stdout ?? ''}${cruise.stderr ?? ''}`,
    ).toBe(0);
  }, 120000);});

describe('HTTP surface: /violations', () => {
  function getJson(port: number, path: string): Promise<{ status: number; body: Record<string, unknown> }> {
    return new Promise((resolveP, reject) => {
      const req = httpGet({ host: '127.0.0.1', port, path }, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolveP({ status: res.statusCode ?? 0, body: data ? JSON.parse(data) : {} }));
      });
      req.on('error', reject);
    });
  }

  it('serves the repo violations over HTTP with the shared error contract', async () => {
    const index = indexFromDoc(dumpDoc(buildIndex(ROOT)));
    const server = createIndexServer({ index, source: 'test', history: [] });
    const port = await bind(server, 0);
    try {
      const res = await getJson(port, '/violations');
      expect(res.status).toBe(200);
      const body = res.body as { total: number; errors: number; warnings: number; clean: boolean; violations: Array<{ ruleName: string; cycle?: string[] }> };
      expect(body.total).toBe(0);
      expect(body.errors).toBe(0);
      expect(body.warnings).toBe(0);
      // clean follows the gate: no error-severity violation
      expect(body.violations).toEqual([]);
      expect(body.clean).toBe(true);
      const root = await getJson(port, '/');
      expect(((root.body as { endpoints: string[] }).endpoints)).toContain('/violations');
    } finally {
      await new Promise<void>((done) => server.close(() => done()));
    }
  });

  it('404s when the served doc root has no .dependency-cruiser.cjs', async () => {
    const index = indexFromDoc(mkDoc([[0, 'a.ts']], [], 'Z:/no-such-root'));
    const server = createIndexServer({ index, source: 'test', history: [] });
    const port = await bind(server, 0);
    try {
      const res = await getJson(port, '/violations');
      expect(res.status).toBe(404);
    } finally {
      await new Promise<void>((done) => server.close(() => done()));
    }
  });
});
