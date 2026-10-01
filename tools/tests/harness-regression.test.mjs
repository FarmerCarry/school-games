import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

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

function play(actions, extra = []) {
  const result = spawnSync(process.execPath, [path.join(repo, 'tools/playtest.mjs'), '--path', '/index.html',
    '--out', path.join(root, 'screens'), '--actions-json', JSON.stringify(actions), ...extra], {
    env: { ...process.env, SG_ROOT: root }, encoding: 'utf8', timeout: 30000
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.ok(result.stdout.trim(), result.stderr);
  return { status: result.status, report: JSON.parse(result.stdout) };
}

test('successful clicks, evaluations, assertions and reloads report success', () => {
  const { status, report } = play([
    { clickText: 'Play' }, { clickSel: '#play' },
    { eval: 'window.clicks' }, { assert: 'window.clicks === 2' },
    { reload: true }, { assert: '!window.clicks' }
  ]);
  assert.equal(status, 0);
  assert.equal(report.ok, true);
  assert.equal(report.evals[0].value, 2);
  assert.deepEqual(report.harnessErrors, []);
});

for (const action of [{ clickSel: '#missing' }, { clickText: 'Missing button' }]) {
  test(`a missing ${Object.keys(action)[0]} fails the report and process`, () => {
    const { status, report } = play([action, { eval: '"must not run"' }]);
    assert.equal(status, 1);
    assert.equal(report.ok, false);
    assert.match(report.harnessErrors[0], /Timeout|timeout/);
    assert.deepEqual(report.evals, []);
  });
}

test('a thrown evaluation fails and preserves its error', () => {
  const { status, report } = play([{ eval: '(() => { throw new Error("regression marker"); })()' }]);
  assert.equal(status, 1);
  assert.equal(report.ok, false);
  assert.match(report.evals[0].error, /regression marker/);
  assert.match(report.harnessErrors[0], /regression marker/);
});

test('an assertion returning false fails with its custom message', () => {
  const { status, report } = play([{ assert: 'false', message: 'expected win screen' }]);
  assert.equal(status, 1);
  assert.equal(report.ok, false);
  assert.match(report.harnessErrors[0], /Assertion failed: expected win screen/);
});

test('a failed page navigation produces a failing report', () => {
  const { status, report } = play([], ['--path', '/missing.html']);
  assert.equal(status, 1);
  assert.equal(report.ok, false);
  assert.ok(report.failedRequests.some(request => request.includes('missing.html') && request.includes('404')));
});

test('a missing browser override gives an actionable report without hanging', () => {
  const result = spawnSync(process.execPath, [path.join(repo, 'tools/playtest.mjs'), '--path', '/index.html', '--actions-json', '[]'], {
    env: { ...process.env, SG_ROOT: root, PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: path.join(root, 'missing-chromium') },
    encoding: 'utf8', timeout: 10000
  });
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, false);
  assert.match(report.harnessErrors[0], /PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.*does not exist/);
  assert.match(report.harnessErrors[0], /npm run browsers:install/);
});

test('unknown game selections fail rather than checking zero games', () => {
  const result = spawnSync(process.execPath, [path.join(repo, 'tools/check-all.mjs'), 'not-a-game'], {
    env: { ...process.env, SG_ROOT: root }, encoding: 'utf8', timeout: 10000
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown game selection: not-a-game/);
  assert.doesNotMatch(result.stdout, /All good/);
});

test('check-all retains diagnostics from a child exiting with failure', () => {
  fs.writeFileSync(path.join(root, 'games/rail-rush/index.html'), fixture + '<script>throw new Error("child failure marker")</script>');
  const result = spawnSync(process.execPath, [path.join(repo, 'tools/check-all.mjs'), 'rail-rush'], {
    env: { ...process.env, SG_ROOT: root }, encoding: 'utf8', timeout: 40000
  });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /rail-rush: page error: Error: child failure marker/);
  assert.doesNotMatch(result.stdout, /harness crashed/);
});
