import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
