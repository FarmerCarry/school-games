import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { classroomNavigation, isRetryableNavigationError } from './classroom-nav.mjs';
import { startTestServer } from './test-server.mjs';
import { reportPassed } from './playtest-report.mjs';

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
