#!/usr/bin/env node
/**
 * biome-run.mjs — shared Biome invocation for the lint gates.
 *
 * WHY THIS EXISTS
 *   Two gates need Biome: `lint-ratchet.mjs` (whole tree, frozen debt) and
 *   `review-gate.mjs` (changed lines only, no new violations). Both must resolve
 *   the binary the same way, or one of them silently lints a different tree.
 *
 * WHY NOT `npx biome`
 *   Same reason `typecheck-ratchet.mjs` invokes tsc by absolute path rather than
 *   through npx: the npx shim is a `.cmd` on Windows and resolves through a
 *   second layer we do not control. Invoking the package entry point directly
 *   with the running Node keeps the gate identical on Windows and on Linux CI.
 *
 * CONFIG DIAGNOSTICS ARE A TOOLING ERROR, NOT A FINDING
 *   Biome reports a malformed `biome.json` as a diagnostic with the category
 *   `deserialize`. If that were filtered out and ignored, a broken config would
 *   look exactly like a clean tree — the gate would go green by breaking. It is
 *   surfaced as `configErrors` so callers can exit 2 instead.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const LOCAL_BIN = path.resolve('node_modules', '@biomejs', 'biome', 'bin', 'biome');

/** @returns {{cmd: string, args: string[]}} */
export function resolveBiome() {
  if (fs.existsSync(LOCAL_BIN)) return { cmd: process.execPath, args: [LOCAL_BIN] };
  return { cmd: 'npx', args: ['biome'] };
}

/** Normalise a Biome diagnostic path to forward slashes. */
export function normalisePath(p) {
  return String(p || '').replace(/\\/g, '/');
}

/**
 * Run `biome check` over `targets` and return parsed diagnostics.
 *
 * @param {string[]} targets files or directories; defaults to the whole tree
 * @returns {{diagnostics: Array, configErrors: Array, raw: object}}
 */
export function runBiomeCheck(targets = ['.']) {
  const { cmd, args } = resolveBiome();
  const argv = [...args, 'check', ...targets, '--reporter=json', '--max-diagnostics=none'];

  let out = '';
  try {
    out = execFileSync(cmd, argv, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 256 * 1024 * 1024,
    });
  } catch (err) {
    // Biome exits 1 whenever diagnostics exist — that is the normal path here.
    out = err.stdout || '';
    if (!out.trim()) {
      throw new Error(
        `biome failed to run (${cmd} ${argv.join(' ')}): ${err.stderr || err.message}`
      );
    }
  }

  let parsed;
  try {
    parsed = JSON.parse(out);
  } catch (err) {
    throw new Error(`biome produced unparseable JSON: ${err.message}`);
  }

  const all = parsed.diagnostics || [];
  return {
    diagnostics: all
      .filter((d) => d.category !== 'deserialize')
      .map((d) => ({
        severity: d.severity,
        category: d.category,
        message: d.message,
        file: normalisePath(d.location?.path),
        line: d.location?.start ? d.location.start.line : 0,
      })),
    configErrors: all.filter((d) => d.category === 'deserialize'),
    raw: parsed,
  };
}
