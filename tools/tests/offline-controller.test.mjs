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
    ...events(), state, requests: [], ready: true,
    postMessage(message, ports) {
      this.requests.push(message);
      ports[0].postMessage({ type: 'sg:offline-status', id: message.id,
        ready: this.ready, count: this.ready ? 3 : 1, total: 3 });
    }
  };
}

function registration({ active = null, installing = null, update } = {}) {
  return {
    ...events(), active, installing, waiting: null, updates: 0,
    async update() { this.updates++; if (update) await update(this); }
  };
}

function controller(registrations) {
  const status = { hidden: true, textContent: '', setAttribute(name, value) { this[name] = value; } };
  const retry = events(), timers = new Map(), timerHistory = [];
  let calls = 0, nextTimer = 0;
  const serviceWorker = {
    ...events(),
    async register() {
      const result = registrations[calls++];
      if (!result) throw new Error('unexpected registration');
      return result;
    }
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
  const window = { ...events(), SG_OFFLINE_BUILD: true };
  vm.runInNewContext(source, {
    window, location: { protocol: 'https:' }, navigator: { serviceWorker }, MessageChannel: Channel,
    document: { ...events(), readyState: 'complete', hidden: false,
      getElementById: id => id === 'offlineStatus' ? status : retry },
    setTimeout(callback, delay) {
      const id = ++nextTimer;
      timers.set(id, { callback, delay }); timerHistory.push({ id, callback, delay });
      return id;
    },
    clearTimeout: id => timers.delete(id)
  });
  return { status, retry, window, timers, timerHistory, get calls() { return calls; } };
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
