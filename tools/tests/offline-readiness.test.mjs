import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';

const source = fs.readFileSync(new URL('../build.mjs', import.meta.url), 'utf8');
const generators = vm.createContext({});
vm.runInContext(source.slice(source.indexOf('function SW_SOURCE(')), generators);
const hash = body => crypto.createHash('sha256').update(body).digest('hex').slice(0, 16);

function worker() {
  const scope = 'https://games.test/school-games/';
  const bodies = { 'index.html': 'portal', 'games/demo/index.html': 'game', 'shared/font.woff2': 'font' };
  const files = Object.fromEntries(Object.entries(bodies).map(([p, b]) => [p, hash(b)]));
  const name = 'sg-v2-' + encodeURIComponent(scope) + '|test';
  const entries = new Map(), handlers = {}, requests = [];
  let exists = false, opened = 0, denied = false, updates = 0;
  const cache = {
    async match(url) { return entries.get(String(url))?.clone(); },
    async put(url, response) { entries.set(String(url), response.clone()); }
  };
  const context = vm.createContext({
    URL, Response, Headers, Uint8Array, crypto: crypto.webcrypto,
    location: { origin: 'https://games.test' },
    caches: { async has(n) { return exists && n === name; }, async open() { opened++; exists = true; return cache; } },
    self: { registration: { scope, async update() { updates++; } }, addEventListener(name, fn) { handlers[name] = fn; } },
    async fetch(url) {
      requests.push(url);
      if (denied) throw new Error('offline');
      const p = new URL(url).pathname.slice('/school-games/'.length);
      return new Response(bodies[p], { status: 200 });
    }
  });
  vm.runInContext(generators.SW_SOURCE('test', files), context);
  function seed(p, body = bodies[p]) {
    exists = true;
    entries.set(scope + p, new Response(body, { headers: { 'x-sg-hash': files[p] } }));
  }
  async function status(repair = false, from = scope) {
    let result, task;
    handlers.message({ data: { type: 'sg:offline-status', id: 9, repair }, source: { url: from },
      ports: [{ postMessage(value) { result = JSON.parse(JSON.stringify(value)); } }], waitUntil(value) { task = value; } });
    await task;
    return result;
  }
  return { status, seed, requests, bodies, entries, scope, setDenied(v) { denied = v; }, get opened() { return opened; }, get updates() { return updates; } };
}

test('offline readiness refuses missing and partial caches without creating them', async () => {
  const w = worker();
  assert.deepEqual(await w.status(), { ready: false, count: 0, total: 3, version: 'test', type: 'sg:offline-status', id: 9 });
  assert.equal(w.opened, 0);
  w.seed('index.html');
  assert.equal((await w.status()).ready, false);
  assert.equal(w.requests.length, 0, 'inspection never downloads without a repair request');
});

test('offline readiness requires valid bodies as well as saved hash headers', async () => {
  const w = worker();
  Object.keys(w.bodies).forEach(p => w.seed(p));
  assert.equal((await w.status()).ready, true);
  w.seed('games/demo/index.html', 'corrupt bytes with the old hash header');
  assert.equal((await w.status()).count, 2);
  const repaired = await w.status(true);
  assert.equal(repaired.ready, true);
  assert.equal(w.requests.length, 1);
  assert.match(w.requests[0], /games\/demo\/index\.html\?sg=/);
});

test('retry repairs an evicted cache and offline retry never claims success', async () => {
  const w = worker();
  w.setDenied(true);
  assert.equal((await w.status(true)).ready, false);
  assert.equal(w.updates, 1);
  w.setDenied(false);
  assert.equal((await w.status(true)).ready, true);
  assert.equal((await w.status()).count, 3);
});

test('only a portal client in this exact deployment can request offline status', async () => {
  const w = worker();
  assert.equal(await w.status(true, 'https://games.test/another/index.html'), undefined);
  assert.equal(await w.status(true, w.scope + 'games/demo/index.html'), undefined);
  assert.equal(w.requests.length, 0);
});
