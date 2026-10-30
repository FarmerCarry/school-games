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
  let exists = false, opened = 0, denied = false, updates = 0, activations = 0, fetchOverride;
  let matches = 0, reads = 0, activeMatches = 0, peakMatches = 0, matchHook;
  const cache = {
    async match(url) {
      matches++; activeMatches++; peakMatches = Math.max(peakMatches, activeMatches);
      try {
        await matchHook?.(String(url));
        const hit = entries.get(String(url))?.clone();
        if (hit) {
          const read = hit.arrayBuffer.bind(hit);
          hit.arrayBuffer = () => { reads++; return read(); };
        }
        return hit;
      } finally { activeMatches--; }
    },
    async put(url, response) { entries.set(String(url), response.clone()); }
  };
  const context = vm.createContext({
    URL, Response, Headers, Uint8Array, crypto: crypto.webcrypto,
    location: { origin: 'https://games.test' },
    caches: {
      async has(n) { return exists && n === name; },
      async keys() { return exists ? [name] : []; },
      async open() { opened++; exists = true; return cache; },
      async delete(n) { if (n === name) { exists = false; entries.clear(); } return true; }
    },
    self: { registration: { scope, async update() { updates++; } },
      async skipWaiting() { activations++; }, addEventListener(name, fn) { handlers[name] = fn; } },
    async fetch(url) {
      requests.push(url);
      if (denied) throw new Error('offline');
      const p = new URL(url).pathname.slice('/school-games/'.length);
      if (fetchOverride) return fetchOverride(p, bodies[p]);
      return new Response(bodies[p], { status: 200 });
    }
  });
  vm.runInContext(generators.SW_SOURCE('test', files), context);
  function seed(p, body = bodies[p]) {
    exists = true;
    entries.set(scope + p, new Response(body, { headers: { 'x-sg-hash': files[p] } }));
  }
  async function status(repair = false, from = scope, quick = false, id = 9) {
    let result, task;
    handlers.message({ data: { type: 'sg:offline-status', id, repair, quick }, source: { url: from },
      ports: [{ postMessage(value) { result = JSON.parse(JSON.stringify(value)); } }], waitUntil(value) { task = value; } });
    await task;
    return result;
  }
  async function request(p) {
    let response;
    const tasks = [];
    handlers.fetch({ request: { method: 'GET', url: scope + p }, respondWith(value) { response = value; }, waitUntil(value) { tasks.push(value); } });
    const result = await response;
    await Promise.all(tasks);
    return result;
  }
  function install() {
    let task;
    handlers.install({ waitUntil(value) { task = value; } });
    return task;
  }
  return { status, install, seed, request, requests, bodies, entries, scope,
    setDenied(v) { denied = v; }, setFetch(fn) { fetchOverride = fn; },
    setMatch(fn) { matchHook = fn; },
    get matches() { return matches; }, get reads() { return reads; },
    get peakMatches() { return peakMatches; },
    get exists() { return exists; }, get activations() { return activations; },
    get opened() { return opened; }, get updates() { return updates; } };
}

test('failed same-version installation preserves the active cache and later recovers', async () => {
  const w = worker();
  w.seed('index.html');
  w.setDenied(true);
  await assert.rejects(w.install(), /offline/);
  assert.equal(w.exists, true, 'the surviving worker keeps its cache');
  assert.equal(await w.entries.get(w.scope + 'index.html').clone().text(), 'portal');
  assert.equal((await w.status()).count, 1, 'the verified portal remains available offline');
  assert.equal(w.activations, 0, 'an incomplete install never takes over');
  w.setDenied(false);
  await w.install();
  assert.equal((await w.status()).ready, true);
  assert.equal(w.activations, 1);
});

test('a failed new installation settles concurrent writes and keeps the files it verified', async () => {
  const w = worker();
  let releaseFont, fontStarted, finished = false;
  const started = new Promise(resolve => { fontStarted = resolve; });
  const heldFont = new Promise(resolve => { releaseFont = resolve; });
  w.setFetch(async (p, body) => {
    if (p === 'games/demo/index.html') throw new Error('offline');
    if (p === 'shared/font.woff2') { fontStarted(); await heldFont; }
    return new Response(body);
  });
  const install = w.install().finally(() => { finished = true; });
  const rejected = assert.rejects(install, /offline/);
  await started;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(finished, false, 'the install waits for the in-flight writer');
  releaseFont();
  await rejected;
  assert.equal(w.activations, 0, 'a partial copy never takes over');
  assert.equal(w.exists, true, 'a slow line does not start again from zero');
  assert.deepEqual([...w.entries.keys()].sort(), [w.scope + 'index.html', w.scope + 'shared/font.woff2']);
  assert.equal((await w.status()).ready, false, 'and it is never reported as ready');
});

test('the next install downloads only the missing files and then activates', async () => {
  const w = worker();
  const failing = new Set(['games/demo/index.html', 'shared/font.woff2']);
  w.setFetch(async (p, body) => {
    if (failing.has(p)) throw new Error('connection reset');
    return new Response(body);
  });
  await assert.rejects(w.install(), /connection reset/);
  assert.equal(w.activations, 0);
  failing.delete('shared/font.woff2');
  await assert.rejects(w.install(), /connection reset/, 'a second cut-off attempt still saves what it can');
  assert.equal(w.activations, 0);
  assert.equal(w.entries.size, 2);
  failing.clear();
  w.requests.length = 0;
  await w.install();
  assert.deepEqual(w.requests.map(url => new URL(url).pathname), ['/school-games/games/demo/index.html'], 'only the missing file');
  assert.equal(w.activations, 1, 'complete: it takes over');
  const ready = await w.status();
  assert.equal(ready.ready, true);
  assert.equal(ready.count, 3);
});

test('a resumed install downloads a saved file again when its label or bytes are wrong', async () => {
  const w = worker();
  w.seed('index.html', 'portal bytes cut off half-way');
  w.entries.set(w.scope + 'shared/font.woff2', new Response('font', { headers: { 'x-sg-hash': hash('older font') } }));
  w.seed('games/demo/index.html');
  w.entries.set(w.scope + 'games/demo/index.html', { headers: new Headers({ 'x-sg-hash': hash('game') }),
    clone() { return this; }, arrayBuffer() { return Promise.reject(new TypeError('unreadable')); } });
  await w.install();
  assert.deepEqual(w.requests.map(url => new URL(url).pathname).sort(),
    ['/school-games/games/demo/index.html', '/school-games/index.html', '/school-games/shared/font.woff2']);
  assert.equal(w.activations, 1);
  assert.equal((await w.status()).ready, true, 'every body is hashed and correct');
});

test('an install whose saved copy is lost before the end does not take over', async () => {
  const w = worker();
  let reads = 0;
  // One look per file while downloading; the browser evicts the font before the last look.
  w.setMatch(async () => { if (++reads === 4) w.entries.delete(w.scope + 'shared/font.woff2'); });
  await assert.rejects(w.install(), /incomplete shared\/font\.woff2/);
  assert.equal(w.activations, 0);
});

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

test('quick checks trust verified labels, still notice eviction, and repair re-reads bodies', async () => {
  const w = worker();
  Object.keys(w.bodies).forEach(p => w.seed(p));
  w.seed('games/demo/index.html', 'corrupt bytes with the old hash header');
  assert.equal((await w.status(false, w.scope, true)).ready, true, 'a quick check reads labels, not bodies');
  assert.equal((await w.status()).count, 2, 'a full check still hashes every body');
  w.entries.delete(w.scope + 'shared/font.woff2');
  const quick = await w.status(false, w.scope, true);
  assert.equal(quick.ready, false);
  assert.equal(quick.count, 2);
  assert.equal(w.requests.length, 0, 'a quick check never downloads');
  assert.equal((await w.status(true, w.scope, true)).ready, true, 'repair ignores quick and re-reads every body');
  assert.equal(w.requests.length, 2);
});

test('a cached body that can no longer be read is replaced with a verified download', async () => {
  const w = worker();
  Object.keys(w.bodies).forEach(p => w.seed(p));
  assert.equal(await (await w.request('index.html')).text(), 'portal');
  assert.equal(w.requests.length, 0, 'readable entries are served from the cache');
  const url = w.scope + 'games/demo/index.html';
  w.entries.set(url, { status: 200, statusText: 'OK', headers: new Headers({ 'x-sg-hash': hash('game') }),
    clone() { return this; }, arrayBuffer() { return Promise.reject(new TypeError('Failed to fetch')); } });
  assert.equal(await (await w.request('games/demo/index.html')).text(), 'game');
  assert.equal(w.requests.length, 1);
  assert.match(w.requests[0], /games\/demo\/index\.html\?sg=/);
  assert.equal(await w.entries.get(url).clone().text(), 'game', 'the verified copy replaces the damaged entry');
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

test('simultaneous tab readiness requests share cache reads and keep separate reply IDs', async () => {
  const w = worker();
  Object.keys(w.bodies).forEach(p => w.seed(p));
  const results = await Promise.all([11, 12, 13].map(id => w.status(false, w.scope, true, id)));
  assert.ok(results.every(result => result.ready && result.count === 3));
  assert.deepEqual(results.map(result => result.id), [11, 12, 13]);
  assert.equal(w.opened, 1);
  assert.equal(w.matches, 3, 'each file is read once for the whole burst');
  assert.equal(w.reads, 0, 'routine checks do not re-read file bodies');
  assert.equal(w.requests.length, 0);
  w.entries.delete(w.scope + 'shared/font.woff2');
  assert.equal((await w.status(false, w.scope, true)).ready, false, 'later checks still detect new eviction');
  assert.equal(w.matches, 6, 'results are shared only while a scan is active');
});

test('a full verification satisfies simultaneous full and quick requests', async () => {
  const w = worker();
  Object.keys(w.bodies).forEach(p => w.seed(p));
  w.seed('games/demo/index.html', 'damaged game');
  const results = await Promise.all([w.status(), w.status(), w.status(false, w.scope, true)]);
  assert.ok(results.every(result => !result.ready && result.count === 2));
  assert.equal(w.matches, 3);
  assert.equal(w.reads, 3);
});

test('queued repairs upgrade a quick check once and preserve full integrity verification', async () => {
  const w = worker();
  Object.keys(w.bodies).forEach(p => w.seed(p));
  w.seed('games/demo/index.html', 'damaged game');
  const results = await Promise.all([
    w.status(false, w.scope, true), w.status(true), w.status(true), w.status(true)
  ]);
  assert.ok(results.every(result => result.ready));
  assert.equal(w.opened, 2, 'one quick scan followed by one shared repair');
  assert.equal(w.matches, 6);
  assert.equal(w.reads, 3);
  assert.equal(w.requests.length, 1, 'the damaged body is downloaded once');
  assert.ok(w.peakMatches <= 4, 'disk-read concurrency stays bounded');
  assert.equal(await w.entries.get(w.scope + 'games/demo/index.html').clone().text(), 'game');
});

test('a failing scan settles outstanding reads before a queued repair recovers', async () => {
  const w = worker();
  Object.keys(w.bodies).forEach(p => w.seed(p));
  let release, fail = true, finished = false;
  const held = new Promise(resolve => { release = resolve; });
  w.setMatch(async url => {
    if (url.endsWith('index.html') && fail) { fail = false; throw new Error('disk read failed'); }
    await held;
  });
  const first = w.status(false, w.scope, true).then(result => { finished = true; return result; });
  const repair = w.status(true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(finished, false, 'the failed request waits for sibling disk reads');
  assert.equal(w.opened, 1, 'repair has not overlapped the unfinished scan');
  release();
  assert.equal((await first).ready, false);
  assert.equal((await repair).ready, true);
  assert.equal(w.opened, 2);
  assert.ok(w.peakMatches <= 4);
  assert.equal((await w.status(false, w.scope, true)).ready, true, 'the lock is released after recovery');
});

// CacheStorage shared by the workers of several versions of one deployment, in creation
// order. A handle of a deleted cache writes nowhere, as in the browser.
function cacheStorage() {
  const stores = new Map();
  const caches = {
    async has(name) { return stores.has(name); },
    async keys() { return [...stores.keys()]; },
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return {
        async match(url) { return entries.get(String(url))?.clone(); },
        async put(url, response) { entries.set(String(url), response.clone()); },
        async keys() { return [...entries.keys()].map(url => ({ url })); },
        async delete(request) { return entries.delete(String(request.url || request)); }
      };
    },
    async delete(name) { return stores.delete(name); }
  };
  return { stores, caches, names: () => [...stores.keys()].map(name => name.slice(name.indexOf('|') + 1)) };
}
// One published version: its sw.js run against the shared storage. blocked: paths the
// school's filter answers with its own page.
function published(storage, version, bodies, blocked = new Set()) {
  const scope = 'https://games.test/school-games/', handlers = {}, requests = [];
  const files = Object.fromEntries(Object.entries(bodies).map(([p, b]) => [p, hash(b)]));
  vm.runInContext(generators.SW_SOURCE(version, files), vm.createContext({
    URL, Response, Headers, Uint8Array, Set, crypto: crypto.webcrypto, location: { origin: 'https://games.test' }, caches: storage.caches,
    self: { registration: { scope, async update() {} }, clients: { async claim() {} }, async skipWaiting() {},
      addEventListener(name, fn) { handlers[name] = fn; } },
    async fetch(url) {
      const p = new URL(url).pathname.slice('/school-games/'.length);
      requests.push(p);
      return blocked.has(p) ? new Response('blocked by the school filter', { status: 403 }) : new Response(bodies[p]);
    }
  }));
  const run = type => { let task; handlers[type]({ waitUntil(value) { task = value; } }); return task; };
  return { requests, install: () => run('install'), activate: () => run('activate') };
}

test('a failing install of a newer version takes over an older partial copy and deletes it, so they never pile up', async () => {
  const storage = cacheStorage();
  const v1 = published(storage, 'v1', { 'index.html': 'portal 1', 'games/a/index.html': 'a 1', 'games/b/index.html': 'b 1' });
  await v1.install(); await v1.activate();
  const blocked = new Set(['games/b/index.html']);
  const v2 = published(storage, 'v2', { 'index.html': 'portal 2', 'games/a/index.html': 'a 2', 'games/b/index.html': 'b 2' }, blocked);
  await assert.rejects(v2.install(), /HTTP 403/);
  assert.deepEqual(storage.names(), ['v1', 'v2|partial', 'v2'], 'the failed install keeps its verified files, marked as partial');
  // Another evening publish while the filter still blocks game b: only a changed.
  const v3 = published(storage, 'v3', { 'index.html': 'portal 2', 'games/a/index.html': 'a 3', 'games/b/index.html': 'b 2' }, blocked);
  await assert.rejects(v3.install(), /HTTP 403/);
  assert.deepEqual(v3.requests.sort(), ['games/a/index.html', 'games/b/index.html'], 'the portal saved by the v2 attempt is copied, not downloaded again');
  assert.deepEqual(storage.names(), ['v1', 'v3|partial', 'v3'], 'the partial v2 copy is gone: the active version and one partial copy at most');
  assert.equal(storage.stores.get([...storage.stores.keys()][0]).size, 3, 'the active version is untouched');
  blocked.clear();
  const again = published(storage, 'v3', { 'index.html': 'portal 2', 'games/a/index.html': 'a 3', 'games/b/index.html': 'b 2' });
  await again.install();
  assert.deepEqual(again.requests, ['games/b/index.html'], 'the next attempt downloads only what is missing');
  assert.deepEqual(storage.names(), ['v1', 'v3'], 'a complete install is no longer marked partial');
  await again.activate();
  assert.deepEqual(storage.names(), ['v3']);
});

test('a failed reinstall that shares the active version\'s cache never marks it, so no other install deletes it', async () => {
  const storage = cacheStorage(), bodies = { 'index.html': 'portal 1', 'games/a/index.html': 'a 1', 'games/b/index.html': 'b 1' };
  const v1 = published(storage, 'v1', bodies);
  await v1.install(); await v1.activate();
  const active = storage.stores.get([...storage.stores.keys()][0]);
  active.delete([...active.keys()].find(url => url.endsWith('games/b/index.html'))); // evicted
  await assert.rejects(published(storage, 'v1', bodies, new Set(['games/b/index.html'])).install(), /HTTP 403/);
  assert.deepEqual(storage.names(), ['v1']);
  await assert.rejects(published(storage, 'v2', { ...bodies, 'games/a/index.html': 'a 2' }, new Set(['games/b/index.html'])).install(), /HTTP 403/);
  assert.deepEqual(storage.names(), ['v1', 'v2|partial', 'v2'], 'the shared active cache stays');
  assert.equal(active.size, 2);
});

test('an install that cannot even mark its copy as partial stops before saving anything', async () => {
  const storage = cacheStorage(), open = storage.caches.open;
  storage.caches.open = async name => { if (name.endsWith('|partial')) throw new DOMException('full', 'QuotaExceededError'); return open(name); };
  await assert.rejects(published(storage, 'v1', { 'index.html': 'portal 1' }).install(), /full/);
  assert.deepEqual(storage.names(), [], 'no unmarked partial copy is left behind');
});
