// Run checks that do not depend on SG_ROOT once; browser checks cover both builds in CI.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const suite = process.argv[2];
if (!['all', 'shared', 'browser'].includes(suite)) throw new Error('Expected test suite: all, shared, or browser');
const shared = new Set([
  'board-rules.test.mjs', 'build-safety.test.mjs', 'asset-budgets.test.mjs',
  'asset-optimization.test.mjs', 'harness-regression.test.mjs',
  'balance-replay.test.mjs', 'classroom-files.test.mjs', 'offline-controller.test.mjs',
  'offline-readiness.test.mjs', 'shared-kit.test.mjs', 'level-verifiers.test.mjs',
  'engine-regressions.test.mjs', 'moto-balance.test.mjs'
]);
const files = fs.readdirSync(path.join(repo, 'tools/tests')).filter(file => file.endsWith('.test.mjs')).sort();
for (const file of shared) {
  if (!files.includes(file)) throw new Error(`Missing shared test: ${file}`);
}
const selected = files.filter(file => suite === 'all' || shared.has(file) === (suite === 'shared'))
  .map(file => `tools/tests/${file}`);
if (suite === 'shared') selected.push('tools/test-tooling.mjs');
const result = spawnSync(process.execPath, [
  '--test', '--test-concurrency=1', '--test-reporter=spec', '--test-reporter-destination=stdout',
  '--test-reporter=./tools/github-test-reporter.mjs', '--test-reporter-destination=stderr', ...selected
], { cwd: repo, env: process.env, stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
