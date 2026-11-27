// Run checks that do not depend on SG_ROOT once; browser checks cover both builds in CI.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Node applies --test-timeout to each file, because the file is a test and
// subtests inherit it. On the 23 October 2026 main run the slowest file was
// about 48 seconds (browser) and this shared suite finished in 41 seconds.
// Ten minutes fails a stuck file. The spec reporter never prints the test
// that is still running, and this limit does not cut off a file that is merely slow.
// tools/github-test-reporter.mjs names that test. The workflow step limit is
// the backstop when the event loop itself is wedged and this timer cannot run.
export const testFileTimeoutMs = 10 * 60 * 1000;

// Checks that do not read SG_ROOT run once in the shared suite rather than
// twice across source and built targets.
export const SHARED_TESTS = new Set([
  'asset-budgets.test.mjs',
  'asset-optimization.test.mjs',
  'balance-replay.test.mjs',
  'ball-storm-engine.test.mjs',
  'balloon-blast-engine.test.mjs',
  'beat-dash-engine.test.mjs',
  'board-rules.test.mjs',
  'bonk-garden-engine.test.mjs',
  'bubble-bop-rules.test.mjs',
  'build-safety.test.mjs',
  'cake-guards-engine.test.mjs',
  'catalog-precache.test.mjs',
  'chaos-island-engine.test.mjs',
  'classroom-files.test.mjs',
  'cloud-hop-engine.test.mjs',
  'desk-karts-engine.test.mjs',
  'dino-3d-engine.test.mjs',
  'egg-rush-engine.test.mjs',
  'engine-regressions.test.mjs',
  'fire-and-ice-engine.test.mjs',
  'frog-pinball-engine.test.mjs',
  'harness-regression.test.mjs',
  'hoop-heads-engine.test.mjs',
  'juice.test.mjs',
  'juicy-drop-engine.test.mjs',
  'key-runner-engine.test.mjs',
  'keyboard-obby-engine.test.mjs',
  'level-verifiers.test.mjs',
  'lucky-lake-engine.test.mjs',
  'magic-crayon-engine.test.mjs',
  'math-gates-engine.test.mjs',
  'moto-balance.test.mjs',
  'offline-controller.test.mjs',
  'offline-download.test.mjs',
  'offline-readiness.test.mjs',
  'perf-measurement.test.mjs',
  'pool-position-rules.test.mjs',
  'recess-kitchen-engine.test.mjs',
  'robo-swarm-engine.test.mjs',
  'sandwich-tower-engine.test.mjs',
  'seek-zoom-engine.test.mjs',
  'shared-artkit.test.mjs',
  'shared-kit.test.mjs',
  'shared-webgl.test.mjs',
  'shortcut-factory-engine.test.mjs',
  'splat-catapult-engine.test.mjs',
  'steady-hand-engine.test.mjs',
  'telemetry-rules.test.mjs',
  'thumb-encoding.test.mjs',
  'toy-castle-engine.test.mjs',
  'typing-test-engine.test.mjs',
  'word-garden-engine.test.mjs',
  'zoom-plus-one-engine.test.mjs'
]);

// Relative weights for deterministic shard balancing: multi-game full-catalog
// sweeps land in separate shards and software-WebGL 3D suites spread evenly.
export const SHARD_WEIGHTS = new Map([
  ['telemetry-catalog.test.mjs', 12],
  ['zero-bgm.test.mjs', 10],
  ['telemetry-client.test.mjs', 6],
  ['light-graphics.test.mjs', 5],
  ['portal-improvements.test.mjs', 4],
  ['runtime-cleanup.test.mjs', 4],
  ['shared-lifecycle.test.mjs', 4],
  ['portal-cleanup.test.mjs', 3],
  ['portal-regression.test.mjs', 3],
  ['runtime-warn.test.mjs', 3],
  // 3D WebGL games (heavier under software rendering)
  ['air-hockey.test.mjs', 2],
  ['chaos-island.test.mjs', 2],
  ['desk-karts.test.mjs', 2],
  ['dino-3d.test.mjs', 2],
  ['egg-rush.test.mjs', 2],
  ['fire-and-ice-regression.test.mjs', 2],
  ['golf-controls.test.mjs', 2],
  ['golf-feedback.test.mjs', 2],
  ['hoop-heads.test.mjs', 2],
  ['juicy-drop.test.mjs', 2],
  ['keyboard-obby.test.mjs', 2],
  ['magic-crayon.test.mjs', 2],
  ['neon-slope.test.mjs', 2],
  ['rail-rush-feedback.test.mjs', 2],
  ['recess-kitchen.test.mjs', 2],
  ['road-hopper.test.mjs', 2],
  ['shortcut-factory.test.mjs', 2],
  ['splat-strike-regression.test.mjs', 2],
  ['toy-castle.test.mjs', 2]
]);

export function parseShard(spec) {
  const match = /^([1-9]\d*)\/([1-9]\d*)$/.exec(String(spec ?? '').trim());
  if (!match) throw new Error(`Invalid shard "${spec}": expected i/n (e.g. 1/4)`);
  const index = Number(match[1]);
  const total = Number(match[2]);
  if (index > total) throw new Error(`Invalid shard "${spec}": shard index ${index} exceeds total ${total}`);
  return { index, total };
}

export function shardFiles(files, shard, weights = SHARD_WEIGHTS) {
  if (!shard) return [...files];
  const { index, total } = typeof shard === 'string' ? parseShard(shard) : shard;
  const bins = Array.from({ length: total }, () => ({ weight: 0, files: [] }));
  const ranked = [...files].sort((a, b) => {
    const wa = weights.get(path.basename(a)) ?? 1;
    const wb = weights.get(path.basename(b)) ?? 1;
    return wb - wa || (a < b ? -1 : a > b ? 1 : 0);
  });
  for (const file of ranked) {
    let target = bins[0];
    for (let i = 1; i < bins.length; i++) {
      if (bins[i].weight < target.weight ||
        (bins[i].weight === target.weight && bins[i].files.length < target.files.length)) {
        target = bins[i];
      }
    }
    target.files.push(file);
    target.weight += weights.get(path.basename(file)) ?? 1;
  }
  const chosen = new Set(bins[index - 1].files);
  return files.filter(file => chosen.has(file));
}

export function selectSuiteFiles(suite, { shard = null, testFiles = null } = {}) {
  if (!['all', 'shared', 'browser'].includes(suite)) {
    throw new Error('Expected test suite: all, shared, or browser');
  }
  const files = (testFiles
    ? [...testFiles]
    : fs.readdirSync(path.join(repo, 'tools/tests')).filter(file => file.endsWith('.test.mjs'))
  ).sort();
  if (!testFiles) {
    for (const file of SHARED_TESTS) {
      if (!files.includes(file)) throw new Error(`Missing shared test: ${file}`);
    }
  }
  const selected = files
    .filter(file => suite === 'all' || SHARED_TESTS.has(file) === (suite === 'shared'))
    .map(file => `tools/tests/${file}`);
  if (suite === 'shared') selected.push('tools/test-tooling.mjs');
  return shardFiles(selected, shard);
}

export function parseSuiteArgs(argv) {
  const suite = argv[0];
  let shard = null;
  let list = false;
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--list') list = true;
    else if (arg.startsWith('--shard=')) shard = parseShard(arg.slice('--shard='.length));
    else if (arg === '--shard') {
      if (i + 1 >= argv.length) throw new Error('Missing value for --shard');
      shard = parseShard(argv[++i]);
    } else throw new Error(`Unknown option: ${arg}`);
  }
  return { suite, shard, list };
}

export function nodeTestArguments(files) {
  return [
    '--test', '--test-concurrency=1', `--test-timeout=${testFileTimeoutMs}`,
    '--test-reporter=spec', '--test-reporter-destination=stdout',
    '--test-reporter=./tools/github-test-reporter.mjs', '--test-reporter-destination=stderr',
    ...files
  ];
}

function main() {
  const { suite, shard, list } = parseSuiteArgs(process.argv.slice(2));
  const selected = selectSuiteFiles(suite, { shard });
  if (list) {
    for (const file of selected) console.log(file);
    return;
  }
  if (!selected.length) {
    console.log(`No test files selected for suite "${suite}"${shard ? ` (shard ${shard.index}/${shard.total})` : ''}.`);
    return;
  }
  const result = spawnSync(process.execPath, nodeTestArguments(selected), { cwd: repo, env: process.env, stdio: 'inherit' });
  if (result.error) console.error(result.error.message);
  process.exitCode = result.status ?? 1;
}

const entry = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (entry === fileURLToPath(import.meta.url)) main();
