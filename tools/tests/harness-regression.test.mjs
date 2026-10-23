import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { nodeTestArguments, testFileTimeoutMs } from '../test-suite.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let root;
const fixture = '<!doctype html><link rel="icon" href="data:,"><button id="play" onclick="window.clicks = (window.clicks || 0) + 1">Play</button>';

before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-harness-regression-'));
  fs.mkdirSync(path.join(root, 'games/rail-rush'), { recursive: true });
  fs.writeFileSync(path.join(root, 'index.html'), fixture);
  fs.writeFileSync(path.join(root, 'games/rail-rush/index.html'), fixture);
  fs.writeFileSync(path.join(root, 'games/rail-rush/thumb.svg'), '<svg viewBox="0 0 400 400"></svg>');
});
after(() => fs.rmSync(root, { recursive: true, force: true }));

test('check-all retains diagnostics from a child exiting with failure', () => {
  fs.writeFileSync(path.join(root, 'games/rail-rush/index.html'), fixture + '<script>throw new Error("child failure marker")</script>');
  const result = spawnSync(process.execPath, [path.join(repo, 'tools/check-all.mjs'), 'rail-rush'], {
    env: { ...process.env, SG_ROOT: root }, encoding: 'utf8', timeout: 40000
  });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /rail-rush: page error: Error: child failure marker/);
  assert.doesNotMatch(result.stdout, /harness crashed/);
});

test('shared and browser runs fail a stuck file by the test that was still running', t => {
  // Above the slowest file seen in CI (~48s) and below the 20-minute step limit,
  // so a hang is named before Actions kills the step.
  assert.ok(testFileTimeoutMs >= 5 * 60 * 1000 && testFileTimeoutMs <= 15 * 60 * 1000);
  assert.ok(nodeTestArguments(['tools/tests/example.test.mjs']).includes(`--test-timeout=${testFileTimeoutMs}`));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-stuck-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'stuck.test.mjs');
  fs.writeFileSync(file, [
    "import { test } from 'node:test';",
    "test('stuck test reports its name', () => new Promise(() => { setInterval(() => {}, 1000); }));",
    ''
  ].join('\n'));
  // The parent runner sets NODE_TEST_CONTEXT. A child `node --test` would see that and
  // skip the file ("run() is being called recursively") instead of timing out.
  const env = { ...process.env, GITHUB_ACTIONS: 'true' };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, [
    '--test', '--test-concurrency=1', '--test-timeout=500',
    '--test-reporter=./tools/github-test-reporter.mjs', '--test-reporter-destination=stderr',
    file
  ], {
    cwd: repo, encoding: 'utf8', timeout: 10000, env
  });
  assert.notEqual(result.status, 0);
  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(output, /\[test\] start .*stuck test reports its name/);
  assert.match(output, /timed out while running: stuck test reports its name/);
  assert.match(output, /::error .*title=Timed out%3A stuck test reports its name/);
});
