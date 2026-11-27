import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launchChromium } from './browser.mjs';
import { classroomNavigation, isRetryableNavigationError } from './classroom-nav.mjs';
import { startTestServer } from './test-server.mjs';
import { reportPassed } from './playtest-report.mjs';
import { clickControl } from './ui-input.mjs';
import { SHARED_TESTS, parseShard, parseSuiteArgs, selectSuiteFiles, shardFiles } from './test-suite.mjs';
import { DEFAULT_CHECK_CONCURRENCY, parseConcurrency, shouldRetryPlaytest } from './check-all.mjs';
import { PLAYTEST_BROWSER_ARGS, runPlaytest } from './playtest.mjs';

test('playtest failures include actions, evaluations, and every failed resource', () => {
  const clean = () => ({ pageErrors: [], consoleErrors: [], externalRequests: [], failedRequests: [], notes: [], evals: [] });
  assert.equal(reportPassed(clean()), true);
  for (const key of ['pageErrors', 'consoleErrors', 'externalRequests', 'failedRequests', 'notes']) {
    const report = clean(); report[key].push('failure');
    assert.equal(reportPassed(report), false, key);
  }
  const resource = clean(); resource.failedRequests.push('/favicon.ico :: HTTP 404');
  assert.equal(reportPassed(resource), false);
  const evaluation = clean(); evaluation.evals.push({ expr: 'missing()', error: 'ReferenceError' });
  assert.equal(reportPassed(evaluation), false);
});

test('downloaded-folder navigation retries only a file URL hang or abort', () => {
  // Locks the policy the Windows Edge job uses. `load` on file:// is the flake
  // (run 40967117213); a gameplay timeout must still fail the case.
  assert.deepEqual(classroomNavigation, { waitUntil: 'domcontentloaded', timeout: 10000 });
  const hung = 'page.goto: Timeout 10000ms exceeded.\nCall log:\n  - navigating to "file:///C:/games/road-hopper/index.html", waiting until "load"';
  assert.equal(isRetryableNavigationError(new Error(hung)), true);
  assert.equal(isRetryableNavigationError(new Error('page.goto: net::ERR_ABORTED at file:///C:/games/pool-party/index.html')), true);
  assert.equal(isRetryableNavigationError(new Error('locator.waitFor: Timeout 5000ms exceeded.')), false);
  assert.equal(isRetryableNavigationError(new Error('Timeout 10000ms exceeded.')), false);
  assert.equal(isRetryableNavigationError(new Error('road-hopper: primary input must change gameplay')), false);
  assert.equal(isRetryableNavigationError(new Error('catalog renders from a file URL')), false);
});

test('an explicit clickControl timeout bounds every step; the default keeps 5 s for visibility only', async () => {
  const calls = [];
  const button = {
    waitFor: async options => { calls.push(['waitFor', options]); },
    isEnabled: async options => { calls.push(['isEnabled', options]); return true; },
    evaluate: async (fn, arg, options) => { calls.push(['evaluate', options]); return true; },
    boundingBox: async options => { calls.push(['boundingBox', options]); return { x: 10, y: 20, width: 40, height: 30 }; }
  };
  const page = { locator: () => ({ first: () => button }), mouse: { click: async (x, y) => { calls.push(['click', x, y]); } } };
  await clickControl(page, '#play', { timeout: 20000 });
  assert.deepEqual(calls, [
    ['waitFor', { state: 'visible', timeout: 20000 }], ['isEnabled', { timeout: 20000 }],
    ['evaluate', { timeout: 20000 }], ['boundingBox', { timeout: 20000 }], ['click', 30, 35]
  ]);
  calls.length = 0;
  await clickControl(page, '#play');
  assert.deepEqual(calls, [
    ['waitFor', { state: 'visible', timeout: 5000 }], ['isEnabled', {}], ['evaluate', {}], ['boundingBox', {}], ['click', 30, 35]
  ]);
});

test('test server serves the site icon and reports real missing/unsafe paths', async () => {
  const tempRoot = path.resolve(os.tmpdir());
  const root = fs.mkdtempSync(path.join(tempRoot, 'school-games-server-test-'));
  fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html><title>fixture</title>');
  fs.writeFileSync(path.join(root, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  const { origin, close } = await startTestServer(root, { base: '/school-games/' });
  try {
    for (const uri of ['/favicon.ico', '/school-games/favicon.ico']) {
      const res = await fetch(origin + uri);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-type'), 'image/svg+xml');
      assert.match(await res.text(), /^<svg/);
    }
    assert.equal((await fetch(origin + '/school-games/')).status, 200);
    assert.equal((await fetch(origin + '/school-games/missing.js')).status, 404);
    assert.equal((await fetch(origin + '/elsewhere')).status, 404);
    assert.equal((await fetch(origin + '/school-games/%2e%2e%2foutside')).status, 403);
    assert.equal((await fetch(origin + '/school-games/%zz')).status, 400);
  } finally {
    await close();
    assert.equal(path.dirname(path.resolve(root)), tempRoot);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('test-suite sharding validates specs and partitions browser tests with 100% coverage and zero overlap', () => {
  assert.ok(SHARED_TESTS.has('perf-measurement.test.mjs'), 'perf-measurement runs once in shared');
  assert.deepEqual(parseShard('1/4'), { index: 1, total: 4 });
  assert.deepEqual(parseShard('4/4'), { index: 4, total: 4 });
  for (const bad of ['', '0/4', '5/4', '1/0', '1', 'a/b', '1/2/3']) {
    assert.throws(() => parseShard(bad), /Invalid shard/, bad);
  }
  assert.deepEqual(parseSuiteArgs(['browser', '--shard=2/4', '--list']), { suite: 'browser', shard: { index: 2, total: 4 }, list: true });
  assert.deepEqual(parseSuiteArgs(['browser', '--shard', '3/4']), { suite: 'browser', shard: { index: 3, total: 4 }, list: false });
  assert.throws(() => parseSuiteArgs(['browser', '--unknown']), /Unknown option/);

  const fullBrowser = selectSuiteFiles('browser');
  const fullShared = selectSuiteFiles('shared');
  assert.ok(fullShared.includes('tools/tests/perf-measurement.test.mjs'));
  assert.ok(!fullBrowser.includes('tools/tests/perf-measurement.test.mjs'));

  const seen = new Set();
  const shards = [];
  for (let i = 1; i <= 4; i++) {
    const slice = selectSuiteFiles('browser', { shard: `${i}/4` });
    assert.ok(slice.length > 0, `shard ${i}/4 is non-empty`);
    // Deterministic across repeated calls
    assert.deepEqual(slice, shardFiles(fullBrowser, { index: i, total: 4 }));
    for (const file of slice) {
      assert.equal(seen.has(file), false, `duplicate file across shards: ${file}`);
      seen.add(file);
    }
    shards.push(slice);
  }
  assert.deepEqual([...seen].sort(), [...fullBrowser].sort(), 'shard union equals full browser suite');
  const telemetryShard = shards.findIndex(s => s.includes('tools/tests/telemetry-catalog.test.mjs'));
  const bgmShard = shards.findIndex(s => s.includes('tools/tests/zero-bgm.test.mjs'));
  assert.notEqual(telemetryShard, bgmShard, 'heavy full-catalog browser suites are placed in separate shards');
});

test('check-all concurrency parsing and crash/hang retry policy', () => {
  assert.equal(parseConcurrency(undefined), DEFAULT_CHECK_CONCURRENCY);
  assert.equal(parseConcurrency(''), DEFAULT_CHECK_CONCURRENCY);
  assert.equal(parseConcurrency('2'), 2);
  for (const bad of ['0', '-1', '1.5', 'fast']) {
    assert.throws(() => parseConcurrency(bad), /Invalid SG_CHECK_CONCURRENCY/, bad);
  }
  const base = { ok: false, pageErrors: [], consoleErrors: [], externalRequests: [], failedRequests: [], notes: [], harnessErrors: [] };
  assert.equal(shouldRetryPlaytest({ ...base, ok: true }), false);
  assert.equal(shouldRetryPlaytest({ ...base, pageErrors: ['Error: boom'], harnessErrors: ['Timeout 20000ms'] }, { concurrency: 3 }), false);
  assert.equal(shouldRetryPlaytest({ ...base, consoleErrors: ['bad'], harnessErrors: ['Target closed'] }, { concurrency: 3 }), false);
  assert.equal(shouldRetryPlaytest({ ...base, harnessErrors: ['Target page, context or browser has been closed'] }, { concurrency: 1 }), true);
  assert.equal(shouldRetryPlaytest({ ...base, harnessErrors: ['Error: Playtest timed out after 120000ms'] }, { concurrency: 1 }), true);
  assert.equal(shouldRetryPlaytest({ ...base, harnessErrors: ['Assertion failed'] }, { concurrency: 1 }), false);
  assert.equal(shouldRetryPlaytest({ ...base, harnessErrors: ['Timeout 20000ms exceeded'] }, { concurrency: 1 }), false);
  assert.equal(shouldRetryPlaytest({ ...base, harnessErrors: ['Timeout 20000ms exceeded'] }, { concurrency: 3 }), true);
  assert.equal(shouldRetryPlaytest({ ...base, harnessErrors: ['any error'] }, { concurrency: 1, browserConnected: false }), true);
});

test('runPlaytest reuses one browser across isolated contexts without leaking storage or errors', async t => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'school-games-playtest-reuse-'));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  const server = await startTestServer(tempRoot, {
    pages: {
      '/games/ok/index.html': '<!doctype html><link rel="icon" href="data:,"><script>localStorage.setItem("leaked","yes"); window.value = 42;</script>',
      '/games/check/index.html': '<!doctype html><link rel="icon" href="data:,"><script>window.leaked = localStorage.getItem("leaked");</script>',
      '/games/err/index.html': '<!doctype html><link rel="icon" href="data:,"><script>throw new Error("isolated boom");</script>'
    }
  });
  t.after(() => server.close());
  const browser = await launchChromium({ args: PLAYTEST_BROWSER_ARGS });
  t.after(() => browser.close());

  const [r1, r2, r3] = await Promise.all([
    runPlaytest({ browser, origin: server.origin, slug: 'ok', outDir: path.join(tempRoot, 'out-ok'), actions: [{ eval: 'window.value' }] }),
    runPlaytest({ browser, origin: server.origin, slug: 'check', outDir: path.join(tempRoot, 'out-check'), actions: [{ eval: 'window.leaked' }] }),
    runPlaytest({ browser, origin: server.origin, slug: 'err', outDir: path.join(tempRoot, 'out-err'), actions: [{ wait: 50 }] })
  ]);
  assert.equal(browser.isConnected(), true, 'shared browser remains connected');
  assert.equal(r1.ok, true);
  assert.equal(r1.evals[0].value, 42);
  assert.equal(r2.ok, true);
  assert.equal(r2.evals[0].value, null, 'localStorage did not leak between BrowserContexts');
  assert.equal(r3.ok, false);
  assert.ok(r3.pageErrors.some(e => e.includes('isolated boom')));
  assert.equal(r1.pageErrors.length, 0, 'errors in one context do not contaminate siblings');
});
