import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { startTestServer } from './test-server.mjs';
import { reportPassed } from './playtest-report.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function probe(actions, env = {}) {
  const result = spawnSync(process.execPath, [path.join(repo, 'tools/audio-probe.mjs'), 'fixture', '--actions-json', JSON.stringify(actions)], {
    env: { ...process.env, ...env }, encoding: 'utf8', timeout: 15000
  });
  assert.equal(result.error, undefined, result.error?.message);
  return result;
}

test('audio probe rejects unsupported and malformed actions before browser launch, including nested actions', () => {
  const missingBrowser = { PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: path.join(repo, 'missing-browser') };
  const invalid = [
    [{ clickSel: '#play' }], [{ holdMany: ['ArrowRight', 'ArrowUp'] }], [{ shot: 'screen' }],
    [{ repeat: 0, do: [{ reload: true }] }], [{ repeat: 2, do: [{ assert: 'true' }] }],
    [{ click: [1] }], [{ wait: -1 }], [{ hold: 'Space', ms: '20' }],
    [{ repeat: 1.5, do: [] }], [{ repeat: 2 }], [{ move: [1, 2], steps: 0 }],
    [{ wait: 0, press: 'Enter' }], [{ press: 'Enter', extra: true }], {}, [null]
  ];
  for (const actions of invalid) {
    const result = probe(actions, missingBrowser);
    assert.equal(result.status, 2, JSON.stringify(actions) + ': ' + result.stdout + result.stderr);
    assert.match(result.stderr, /audio-probe: actions/);
    assert.doesNotMatch(result.stdout + result.stderr, /PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH/);
  }
});

test('audio probe executes its supported subset and closes resources after action or launch failures', t => {
  const tempRoot = path.resolve(os.tmpdir());
  const root = fs.mkdtempSync(path.join(tempRoot, 'school-games-audio-test-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(root)), tempRoot);
    fs.rmSync(root, { recursive: true, force: true });
  });
  fs.mkdirSync(path.join(root, 'games/fixture'), { recursive: true });
  fs.writeFileSync(path.join(root, 'games/fixture/index.html'), '<!doctype html><link rel="icon" href="data:,"><style>body{margin:0}button{width:120px;height:80px}</style><button onclick="window.clicks=(window.clicks||0)+1">Play</button>');
  const env = { SG_ROOT: root };
  const result = probe([
    { wait: 0 }, { click: [20, 20] }, { move: [200, 200], steps: 1 },
    { eval: 'if (window.clicks !== 1) throw new Error("click was not executed")' },
    { press: 'Escape' }, { hold: 'ArrowLeft', ms: 0 }, { drag: [[200, 200], [220, 220]], steps: 1 },
    { repeat: 0, do: [{ eval: 'throw new Error("zero repeat ran")' }] },
    { repeat: 2, do: [{ eval: 'window.repeated=(window.repeated||0)+1' }] },
    { eval: 'if (window.repeated !== 2) throw new Error("repeat was not executed")' }
  ], env);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /no audio recorded/);
  const failed = probe([{ eval: 'throw new Error("action failure marker")' }], env);
  assert.equal(failed.status, 1, failed.stdout + failed.stderr);
  assert.match(failed.stdout, /action failure marker/);
  const unavailable = probe([], { ...env, PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: path.join(root, 'missing-browser') });
  assert.equal(unavailable.status, 1, unavailable.stdout + unavailable.stderr);
  assert.match(unavailable.stdout, /PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH/);
});

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

test('test server preserves fixture pages, alternate asset roots and cache policy', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'school-games-server-mount-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const assets = path.join(root, 'alternate');
  fs.mkdirSync(assets);
  fs.writeFileSync(path.join(assets, 'kit.js'), 'window.fixture = true;');
  fs.writeFileSync(path.join(root, 'outside.js'), 'not mounted');
  const { origin, close } = await startTestServer(root, {
    base: '/site/', pages: { '/parent': '<!doctype html><title>Parent</title>' },
    mounts: { '/shared/': assets }, cacheControl: null
  });
  t.after(close);
  const parent = await fetch(origin + '/parent');
  assert.equal(parent.headers.get('content-type'), 'text/html');
  assert.match(await parent.text(), /<title>Parent<\/title>/);
  assert.equal((await fetch(origin + '/parent/extra')).status, 404);
  const asset = await fetch(origin + '/shared/kit.js');
  assert.equal(asset.headers.get('content-type'), 'text/javascript');
  assert.equal(asset.headers.get('cache-control'), null);
  assert.equal(await asset.text(), 'window.fixture = true;');
  assert.equal((await fetch(origin + '/shared/%2e%2e%2foutside.js')).status, 403);
});
