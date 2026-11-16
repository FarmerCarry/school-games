import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../../js/offline.js', import.meta.url), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));

function events() {
  const listeners = new Map();
  return {
    addEventListener(type, callback) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(callback);
    },
    emit(type) { for (const callback of listeners.get(type) || []) callback(); }
  };
}

function worker(state = 'installing') {
  return {
    ...events(), state, requests: [], ready: true, version: 'page-v1', pending: [], hold: false,
    postMessage(message, ports) {
      this.requests.push(message);
      const reply = () => ports[0].postMessage({ type: 'sg:offline-status', id: message.id,
        ready: this.ready, count: this.ready ? 3 : 1, total: 3, version: this.version });
      if (this.hold) this.pending.push(reply); else reply();
    }
  };
}

function registration({ active = null, installing = null, update } = {}) {
  return {
    ...events(), active, installing, waiting: null, updates: 0,
    async update() { this.updates++; if (update) await update(this); }
  };
}

function controller(registrations, options = {}) {
  const status = { hidden: true, textContent: '', setAttribute(name, value) { this[name] = value; } };
  const retry = events(), timers = new Map(), timerHistory = [], session = new Map(Object.entries(options.session || {}));
  let calls = 0, nextTimer = 0, reloads = 0;
  const serviceWorker = {
    ...events(), controller: options.controlled === false ? null : {},
    async register() {
      const result = registrations[calls++];
      if (!result) throw new Error('unexpected registration');
      return result;
    }
  };
  const sessionStorage = options.sessionStorage === null ? null : {
    getItem: key => session.has(key) ? session.get(key) : null,
    setItem: (key, value) => { session.set(key, String(value)); }
  };
  class Channel {
    constructor() {
      let closed = false;
      this.port1 = { close() { closed = true; } };
      this.port2 = { postMessage: data => queueMicrotask(() => {
        if (!closed) this.port1.onmessage?.({ data });
      }) };
    }
  }
  const window = { ...events(), SG_OFFLINE_BUILD: options.build !== false, SG_OFFLINE_VERSION: 'page-v1',
    gameOpen: !!options.gameOpen, sessionStorage,
    SGUpdateSafe() { return !this.gameOpen; } };
  const document = { ...events(), readyState: 'complete', hidden: false,
    getElementById: id => ({ offlineStatus: status, offlineRetry: retry })[id] || null };
  vm.runInNewContext(source, {
    window, location: { protocol: options.protocol || 'https:', reload() { reloads++; } }, navigator: { serviceWorker }, MessageChannel: Channel,
    document,
    setTimeout(callback, delay) {
      const id = ++nextTimer;
      timers.set(id, { callback, delay }); timerHistory.push({ id, callback, delay });
      return id;
    },
    clearTimeout: id => timers.delete(id)
  });
  return { status, retry, window, document, serviceWorker, timers, timerHistory, session,
    get calls() { return calls; }, get reloads() { return reloads; } };
}

test('Retry registers again after the first worker fails and leaves an empty registration', async () => {
  const failed = worker(), stale = registration({ installing: failed });
  const replacement = registration({ active: worker('activated') });
  const page = controller([stale, replacement]);
  await flush();
  stale.installing = null; failed.state = 'redundant'; failed.emit('statechange');
  assert.equal(page.status['data-state'], 'unavailable');
  page.retry.emit('click');
  await flush();
  assert.equal(page.calls, 2, 'the stale registration is replaced without a page reload');
  assert.equal(stale.updates, 0, 'an empty registration cannot be repaired with update');
  assert.equal(page.status['data-state'], 'ready');
});

test('a rejected update that loses its installing worker recovers through register', async () => {
  const installing = worker();
  const stale = registration({ installing, update(owner) {
    owner.installing = null; installing.state = 'redundant'; installing.emit('statechange');
    throw new Error('InvalidStateError: registration was removed');
  } });
  const page = controller([stale, registration({ active: worker('activated') })]);
  await flush();
  page.retry.emit('click');
  await flush();
  assert.equal(stale.updates, 1);
  assert.equal(page.calls, 2);
  assert.equal(page.status['data-state'], 'ready');
});

test('a rejected update preserves an old active worker and repairs its cache', async () => {
  const active = worker('activated'); active.ready = false;
  const old = registration({ active, update() { throw new Error('network unavailable'); } });
  const page = controller([old]);
  await flush();
  assert.equal(page.status['data-state'], 'unavailable');
  active.ready = true;
  page.retry.emit('click');
  await flush();
  assert.equal(page.calls, 1, 'a working old registration is not discarded');
  assert.equal(old.active, active);
  assert.equal(old.updates, 1);
  assert.equal(active.requests.at(-1).repair, true);
  assert.equal(active.requests.at(-1).quick, false, 'Retry re-hashes every cached body');
  assert.equal(page.status['data-state'], 'ready');
});

test('routine checks are quick and reconnecting while ready does not re-hash the cache', async () => {
  const active = worker('activated');
  const page = controller([registration({ active })]);
  await flush();
  assert.equal(page.status['data-state'], 'ready');
  assert.deepEqual([active.requests.at(-1).repair, active.requests.at(-1).quick], [false, true]);
  page.window.emit('online');
  await flush();
  assert.deepEqual([active.requests.at(-1).repair, active.requests.at(-1).quick], [false, true]);
  active.ready = false;
  page.window.emit('focus');
  await flush();
  assert.equal(page.status['data-state'], 'unavailable');
  active.ready = true;
  page.window.emit('online');
  await flush();
  assert.deepEqual([active.requests.at(-1).repair, active.requests.at(-1).quick], [true, false], 'an incomplete copy is repaired on reconnect');
  assert.equal(page.status['data-state'], 'ready');
});

test('callbacks from the old registration cannot overwrite or cancel replacement installation', async () => {
  const oldWorker = worker(), old = registration({ installing: oldWorker });
  const newWorker = worker(), replacement = registration({ installing: newWorker });
  const page = controller([old, replacement]);
  await flush();
  const oldTimer = page.timerHistory.find(timer => timer.delay === 45000);
  old.installing = null; oldWorker.state = 'redundant'; oldWorker.emit('statechange');
  page.retry.emit('click');
  await flush();
  const newTimer = page.timerHistory.filter(timer => timer.delay === 45000).at(-1);
  assert.equal(page.status['data-state'], 'preparing');
  oldTimer.callback(); // A timer callback may already be queued when it is cleared.
  oldWorker.emit('statechange');
  old.installing = worker(); old.emit('updatefound');
  assert.equal(page.status['data-state'], 'preparing');
  assert.equal(page.timers.has(newTimer.id), true, 'old events cannot clear the new install timeout');
  replacement.installing = null; replacement.active = newWorker;
  newWorker.state = 'activated'; newWorker.emit('statechange');
  await flush();
  assert.equal(page.status['data-state'], 'ready');
});

test('coming online also retries an empty registration left by a failed first install', async () => {
  const failed = worker(), stale = registration({ installing: failed });
  const page = controller([stale, registration({ active: worker('activated') })]);
  await flush();
  stale.installing = null; failed.state = 'redundant'; failed.emit('statechange');
  page.window.emit('online');
  await flush();
  assert.equal(page.calls, 2);
  assert.equal(page.status['data-state'], 'ready');
});

test('focus after a failed first install keeps the failure instead of claiming preparation', async () => {
  const failed = worker(), stale = registration({ installing: failed });
  const page = controller([stale, registration({ active: worker('activated') })]);
  await flush();
  stale.installing = null; failed.state = 'redundant'; failed.emit('statechange');
  const text = page.status.textContent;
  page.window.emit('focus'); page.document.emit('visibilitychange');
  await flush();
  assert.equal(page.status['data-state'], 'unavailable', 'nothing is installing');
  assert.equal(page.status.textContent, text);
  assert.equal(page.retry.hidden, false);
  page.retry.emit('click');
  await flush();
  assert.equal(page.calls, 2);
  assert.equal(page.status['data-state'], 'ready');
});

test('first install and unchanged worker never reload', async () => {
  const installing = worker(), owner = registration({ installing });
  const page = controller([owner]);
  await flush();
  owner.installing = null; owner.active = installing;
  installing.state = 'activated'; installing.emit('statechange');
  page.serviceWorker.emit('controllerchange');
  await flush();
  page.window.emit('focus');
  await flush();
  assert.equal(page.status['data-state'], 'ready');
  assert.equal(page.reloads, 0);
});

test('an upgraded worker auto-reloads an idle portal tab while deferring a tab with an open game', async () => {
  const active = worker('activated'); active.version = 'page-v2';
  const owner = registration({ active });
  const idle = controller([owner]), playing = controller([owner], { gameOpen: true });
  await flush();
  assert.equal(idle.reloads, 1, 'idle portal tab reloads into the verified upgrade');
  assert.equal(idle.session.get('sg:offline:reloaded'), 'page-v2');
  assert.equal(playing.reloads, 0, 'tab with an open game keeps its live session');
  playing.window.gameOpen = false; playing.window.emit('sg:sessionchange');
  await flush();
  assert.equal(playing.reloads, 1, 'closing the game reloads into the verified upgrade');
  assert.deepEqual([active.requests.at(-1).repair, active.requests.at(-1).quick], [false, true]);
});

test('sessionStorage loop guard prevents repeated reloads if stale HTML is served again', async () => {
  const active = worker('activated'); active.version = 'page-v2';
  const owner = registration({ active });
  const page = controller([owner], { session: { 'sg:offline:reloaded': 'page-v2' } });
  await flush();
  assert.equal(page.reloads, 0, 'already-attempted version does not loop');
  active.version = 'page-v3';
  page.window.emit('focus');
  await flush();
  assert.equal(page.reloads, 1, 'a newer version still reloads once');
});

test('incomplete upgrades and failed installs retain the old working version without reloading', async () => {
  const old = worker('activated'), next = worker(); next.version = 'page-v2';
  const owner = registration({ active: old, installing: next });
  const page = controller([owner]);
  await flush();
  assert.equal(page.reloads, 0);
  owner.installing = null; next.state = 'redundant'; next.emit('statechange');
  await flush();
  assert.equal(page.status['data-state'], 'ready');
  assert.equal(page.reloads, 0);
  next.ready = false; next.state = 'activated'; owner.active = next;
  page.serviceWorker.emit('controllerchange');
  await flush();
  assert.equal(page.status['data-state'], 'unavailable');
  assert.equal(page.reloads, 0);
  next.ready = true; page.window.emit('focus');
  await flush();
  assert.equal(page.reloads, 1);
});

test('a hard-reloaded uncontrolled page never reloads to the older cached version', async () => {
  // Ctrl+F5 bypasses the worker: the page is the newest build from the network
  // while the previous complete version stays active and the new one installs.
  const old = worker('activated'), next = worker(); old.version = 'page-v0';
  const owner = registration({ active: old, installing: next });
  const page = controller([owner], { controlled: false });
  await flush();
  assert.equal(page.status['data-state'], 'ready');
  assert.equal(page.reloads, 0);
  owner.installing = null; next.state = 'redundant'; next.emit('statechange');
  page.window.emit('focus');
  await flush();
  assert.equal(page.status['data-state'], 'ready');
  assert.equal(page.reloads, 0, 'a failed install still leaves only the older cached version');
  const newer = worker('activated'); newer.version = 'page-v2';
  owner.active = newer; page.serviceWorker.controller = newer;
  page.serviceWorker.emit('controllerchange');
  await flush();
  assert.equal(page.reloads, 1, 'a later complete version that claims the page auto-reloads');
});

test('game sessions defer auto-refresh and a launch during verification prevents reload', async () => {
  const active = worker('activated'); active.version = 'page-v2';
  const page = controller([registration({ active })], { gameOpen: true });
  await flush();
  for (const state of ['running', 'paused', 'menu', 'handoff']) {
    page.window.gameOpen = true; page.window.emit('sg:sessionchange');
    await flush();
    assert.equal(page.reloads, 0, state);
  }
  active.hold = true;
  page.window.gameOpen = false; page.window.emit('sg:sessionchange');
  page.window.gameOpen = true; page.window.emit('sg:sessionchange');
  active.pending.shift()();
  await flush();
  assert.equal(page.reloads, 0, 'post-await session check protects the newly opened game');
  active.hold = false;
  page.window.gameOpen = false; page.window.emit('sg:sessionchange');
  await flush();
  assert.equal(page.reloads, 1, 'returning to the games list reloads into the verified upgrade');
});

test('auto-refresh rejects incomplete, timed-out and stale-worker verification', async () => {
  const active = worker('activated'); active.version = 'page-v2';
  const owner = registration({ active }), page = controller([owner], { gameOpen: true });
  await flush();
  active.ready = false; page.window.gameOpen = false; page.window.emit('sg:sessionchange');
  await flush();
  assert.equal(page.reloads, 0);
  assert.equal(page.status['data-state'], 'unavailable');
  page.window.gameOpen = true; active.ready = true; page.window.emit('focus'); await flush();
  active.hold = true; page.window.gameOpen = false; page.window.emit('sg:sessionchange');
  [...page.timers.values()].find(timer => timer.delay === 15000).callback();
  await flush();
  assert.equal(page.reloads, 0);
  assert.equal(page.status['data-state'], 'unavailable');
  page.window.gameOpen = true; active.hold = false; page.window.emit('focus'); await flush();
  active.hold = true; page.window.gameOpen = false; page.window.emit('sg:sessionchange');
  const newer = worker('activated'); newer.version = 'page-v3'; newer.hold = true; owner.active = newer;
  active.pending.at(-1)();
  await flush();
  assert.equal(page.reloads, 0, 'a different active worker requires its own verification before reloading');
  newer.pending.at(-1)();
  await flush();
  newer.pending.at(-1)();
  await flush();
  assert.equal(page.reloads, 1);
  assert.equal(page.session.get('sg:offline:reloaded'), 'page-v3');
});

test('an initial status from a superseded worker cannot reload into its stale update', async () => {
  const old = worker('activated'); old.hold = true; old.version = 'page-v2';
  const owner = registration({ active: old }), page = controller([owner]);
  await flush();
  const current = worker('activated'); current.ready = false; current.version = 'page-v3';
  owner.active = current; page.serviceWorker.emit('controllerchange');
  old.pending.shift()(); await flush();
  assert.equal(page.status['data-state'], 'unavailable');
  assert.equal(page.reloads, 0);
});

test('losing the active worker clears a previously verified update until replacement is ready', async () => {
  const active = worker('activated'); active.version = 'page-v2';
  const owner = registration({ active }), page = controller([owner], { gameOpen: true });
  await flush();
  const next = worker(); next.version = 'page-v3';
  owner.active = null; owner.installing = next;
  owner.emit('updatefound'); page.window.emit('focus');
  await flush();
  assert.equal(page.status['data-state'], 'preparing');
  owner.installing = null; next.state = 'redundant'; next.emit('statechange');
  page.retry.emit('click'); await flush();
  page.window.gameOpen = false; page.window.emit('sg:sessionchange'); await flush();
  assert.equal(page.reloads, 0, 'failed re-registration cannot retain old availability');
});

test('source and downloaded-folder pages never register or reload', async () => {
  for (const options of [{ build: false }, { protocol: 'file:' }]) {
    const page = controller([], options);
    await flush();
    assert.equal(page.calls, 0);
    assert.equal(page.reloads, 0);
    if (options.protocol) assert.equal(page.status['data-state'], 'local');
  }
});

test('focus and visibility share the pending readiness check without queuing another scan', async () => {
  const active = worker('activated'), page = controller([registration({ active })]);
  await flush();
  const before = active.requests.length;
  active.hold = true;
  page.window.emit('focus'); page.document.emit('visibilitychange'); page.window.emit('focus');
  assert.equal(active.requests.length, before + 1);
  active.pending.shift()(); await flush();
  assert.equal(active.requests.length, before + 1);
  assert.equal(page.status['data-state'], 'ready');
  active.hold = false; active.ready = false;
  page.window.emit('focus'); await flush();
  assert.equal(page.status['data-state'], 'unavailable', 'a later visit still checks eviction');
});

test('Retry upgrades a pending quick check once; focus events do not repeat the repair', async () => {
  const active = worker('activated'), page = controller([registration({ active })]);
  await flush();
  const before = active.requests.length;
  active.hold = true;
  page.window.emit('focus');
  page.retry.emit('click'); page.retry.emit('click'); await flush();
  assert.equal(active.requests.length, before + 1);
  active.pending.shift()(); await flush();
  assert.equal(active.requests.length, before + 2);
  assert.equal(active.requests.at(-1).repair, true);
  page.window.emit('focus'); page.document.emit('visibilitychange'); page.retry.emit('click'); await flush();
  active.pending.shift()(); await flush();
  assert.equal(active.requests.length, before + 2);
  assert.equal(page.status['data-state'], 'ready');
});
