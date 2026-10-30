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

// A tab's sessionStorage survives its reloads; pass the same one to model the reloaded page.
function tabStorage() {
  const items = new Map();
  return { items, getItem: key => items.has(key) ? items.get(key) : null, setItem(key, value) { items.set(key, String(value)); } };
}

function controller(registrations, options = {}) {
  const status = { hidden: true, textContent: '', setAttribute(name, value) { this[name] = value; } };
  const retry = events(), update = { hidden: true }, refresh = events(), timers = new Map(), timerHistory = [];
  const clock = { now: 1000 };
  let calls = 0, nextTimer = 0, reloads = 0;
  const serviceWorker = {
    ...events(), controller: options.controlled === false ? null : {},
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
  // SGUpdateQuiet (js/site.js): -1 while a game is open, else the quiet time on the home
  // screen. 0 by default: someone has just used the page, so nothing reloads by itself.
  const window = { ...events(), SG_OFFLINE_BUILD: options.build !== false, SG_OFFLINE_VERSION: 'page-v1', gameOpen: false, quiet: options.quiet ?? 0,
    sessionStorage: options.storage || tabStorage(),
    SGUpdateSafe() { return !this.gameOpen; },
    SGUpdateQuiet() { return this.gameOpen ? -1 : this.quiet; } };
  if (options.signal === false) delete window.SGUpdateQuiet;
  const document = { ...events(), readyState: 'complete', hidden: !!options.hidden,
    getElementById: id => ({ offlineStatus: status, offlineRetry: retry, offlineUpdate: update, offlineRefresh: refresh })[id] };
  vm.runInNewContext(source, {
    window, location: { protocol: options.protocol || 'https:', reload() { reloads++; } }, navigator: { serviceWorker }, MessageChannel: Channel,
    document, performance: { now: () => clock.now },
    setTimeout(callback, delay) {
      const id = ++nextTimer;
      timers.set(id, { callback, delay }); timerHistory.push({ id, callback, delay });
      return id;
    },
    clearTimeout: id => timers.delete(id)
  });
  return { status, retry, update, refresh, window, document, serviceWorker, timers, timerHistory, clock,
    // The automatic-update timer is the only one that calls back into plan().
    adoptTimers: () => [...timers.values()].filter(timer => timer.delay !== 45000 && timer.delay !== 15000),
    get calls() { return calls; }, get reloads() { return reloads; } };
}
// Run the pending automatic-update timer, as the browser would after its delay.
function fire(page) {
  const pending = page.adoptTimers();
  assert.equal(pending.length, 1, 'one automatic-update timer is pending');
  for (const [id, timer] of page.timers) if (timer === pending[0]) page.timers.delete(id);
  pending[0].callback();
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

test('first install and unchanged worker never offer an update or reload', async () => {
  const installing = worker(), owner = registration({ installing });
  const page = controller([owner]);
  await flush();
  assert.equal(page.update.hidden, true);
  owner.installing = null; owner.active = installing;
  installing.state = 'activated'; installing.emit('statechange');
  page.serviceWorker.emit('controllerchange');
  await flush();
  page.window.emit('focus');
  await flush();
  assert.equal(page.status['data-state'], 'ready');
  assert.equal(page.update.hidden, true);
  page.refresh.emit('click');
  await flush();
  assert.equal(page.reloads, 0);
});

test('an already-upgraded worker on the first reply offers only an explicit tab-local refresh', async () => {
  const active = worker('activated'); active.version = 'page-v2';
  const owner = registration({ active });
  const first = controller([owner]), second = controller([owner]);
  await flush();
  assert.equal(first.update.hidden, false, 'page identity detects upgrade without controllerchange');
  assert.equal(second.update.hidden, false);
  assert.equal(first.reloads, 0);
  first.refresh.emit('click');
  await flush();
  assert.equal(first.reloads, 1);
  assert.equal(second.reloads, 0, 'another tab does not consent by sharing the same worker');
  assert.deepEqual([active.requests.at(-1).repair, active.requests.at(-1).quick], [false, true]);
});

test('incomplete upgrades and failed installs retain the old working version without an update prompt', async () => {
  const old = worker('activated'), next = worker(); next.version = 'page-v2';
  const owner = registration({ active: old, installing: next });
  const page = controller([owner]);
  await flush();
  assert.equal(page.update.hidden, true);
  owner.installing = null; next.state = 'redundant'; next.emit('statechange');
  await flush();
  assert.equal(page.status['data-state'], 'ready');
  assert.equal(page.update.hidden, true);
  next.ready = false; next.state = 'activated'; owner.active = next;
  page.serviceWorker.emit('controllerchange');
  await flush();
  assert.equal(page.status['data-state'], 'unavailable');
  assert.equal(page.update.hidden, true);
  next.ready = true; page.window.emit('focus');
  await flush();
  assert.equal(page.update.hidden, false);
  assert.equal(page.reloads, 0);
});

test('a hard-reloaded uncontrolled page never offers the older cached version as an update', async () => {
  // Ctrl+F5 bypasses the worker: the page is the newest build from the network
  // while the previous complete version stays active and the new one installs.
  const old = worker('activated'), next = worker(); old.version = 'page-v0';
  const owner = registration({ active: old, installing: next });
  const page = controller([owner], { controlled: false });
  await flush();
  assert.equal(page.status['data-state'], 'ready');
  assert.equal(page.update.hidden, true);
  page.refresh.emit('click');
  await flush();
  assert.equal(page.reloads, 0);
  owner.installing = null; next.state = 'redundant'; next.emit('statechange');
  page.window.emit('focus');
  await flush();
  assert.equal(page.status['data-state'], 'ready');
  assert.equal(page.update.hidden, true, 'a failed install still leaves only the older cached version');
  const newer = worker('activated'); newer.version = 'page-v2';
  owner.active = newer; page.serviceWorker.controller = newer;
  page.serviceWorker.emit('controllerchange');
  await flush();
  assert.equal(page.update.hidden, false, 'a later complete version that claims the page is a real update');
  assert.equal(page.reloads, 0);
});

test('game sessions defer refresh and a launch during awaited verification prevents reload', async () => {
  const active = worker('activated'); active.version = 'page-v2';
  const page = controller([registration({ active })]);
  await flush();
  for (const state of ['running', 'paused', 'menu', 'handoff']) {
    page.window.gameOpen = true; page.window.emit('sg:sessionchange');
    assert.equal(page.update.hidden, true, state);
    page.refresh.emit('click');
    await flush();
    assert.equal(page.reloads, 0, state);
  }
  page.window.gameOpen = false; page.window.emit('sg:sessionchange');
  assert.equal(page.update.hidden, false);
  active.hold = true;
  page.refresh.emit('click');
  assert.equal(page.refresh.disabled, true);
  page.window.gameOpen = true; page.window.emit('sg:sessionchange');
  active.pending.shift()();
  await flush();
  assert.equal(page.reloads, 0, 'post-await session check protects the newly opened game');
  page.window.gameOpen = false; page.window.emit('sg:sessionchange');
  assert.equal(page.update.hidden, false);
  assert.equal(page.reloads, 0, 'closing a game still requires new explicit consent');
  active.hold = false; page.refresh.emit('click');
  await flush();
  assert.equal(page.reloads, 1);
});

test('refresh rejects incomplete, timed-out and stale-worker verification', async () => {
  const active = worker('activated'); active.version = 'page-v2';
  const owner = registration({ active }), page = controller([owner]);
  await flush();
  active.ready = false; page.refresh.emit('click');
  await flush();
  assert.equal(page.reloads, 0);
  assert.equal(page.update.hidden, true);
  active.ready = true; page.window.emit('focus'); await flush();
  active.hold = true; page.refresh.emit('click');
  [...page.timers.values()].find(timer => timer.delay === 15000).callback();
  await flush();
  assert.equal(page.reloads, 0);
  assert.equal(page.update.hidden, true);
  active.hold = false; page.window.emit('focus'); await flush();
  active.hold = true; page.refresh.emit('click');
  const newer = worker('activated'); newer.version = 'page-v3'; owner.active = newer;
  active.pending.at(-1)();
  await flush();
  assert.equal(page.reloads, 0, 'a different active worker requires a new verification and consent');
  assert.equal(page.update.hidden, false);
});

test('an initial status from a superseded worker cannot announce its stale update', async () => {
  const old = worker('activated'); old.hold = true; old.version = 'page-v2';
  const owner = registration({ active: old }), page = controller([owner]);
  await flush();
  const current = worker('activated'); current.ready = false; current.version = 'page-v3';
  owner.active = current; page.serviceWorker.emit('controllerchange');
  old.pending.shift()(); await flush();
  assert.equal(page.update.hidden, true);
  assert.equal(page.status['data-state'], 'unavailable');
  assert.equal(page.reloads, 0);
});

test('losing the active worker clears a previously verified update until replacement is ready', async () => {
  const active = worker('activated'); active.version = 'page-v2';
  const owner = registration({ active }), page = controller([owner]);
  await flush();
  assert.equal(page.update.hidden, false);
  const next = worker(); next.version = 'page-v3';
  owner.active = null; owner.installing = next;
  owner.emit('updatefound'); page.window.emit('focus');
  await flush();
  assert.equal(page.update.hidden, true, 'an installing worker is not a completed update');
  assert.equal(page.status['data-state'], 'preparing');
  owner.installing = null; next.state = 'redundant'; next.emit('statechange');
  page.retry.emit('click'); await flush();
  assert.equal(page.update.hidden, true, 'failed re-registration cannot retain old availability');
  assert.equal(page.reloads, 0);
});

test('source and downloaded-folder pages never register or offer updates', async () => {
  for (const options of [{ build: false }, { protocol: 'file:' }]) {
    const page = controller([], options);
    await flush();
    assert.equal(page.calls, 0);
    assert.equal(page.update.hidden, true);
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

// Automatic adoption (js/offline.js plan): a tab left on a quiet home screen moves to the
// newer verified build by itself; nobody using it ever loses a game, a timer or a step.
const QUIET = 75000;
function upgraded(options = {}) {
  const active = worker('activated'); active.version = 'page-v2';
  const owner = registration({ active });
  return { active, owner, page: controller([owner], options) };
}

test('a quiet home screen reloads into a verified update by itself, once per tab and version', async () => {
  const storage = tabStorage();
  const { active, page } = upgraded({ quiet: QUIET, storage });
  await flush();
  assert.equal(page.reloads, 1, 'no click needed');
  assert.equal(active.requests.length, 2, 'the version is verified again right before the reload');
  assert.deepEqual([active.requests.at(-1).repair, active.requests.at(-1).quick], [false, true]);
  assert.equal(storage.items.get('sg:site:adopted'), 'page-v2');
  // The reloaded page is still the old build (it should not be): keep the button, no loop.
  const again = controller([registration({ active })], { quiet: 10 * QUIET, storage });
  await flush();
  assert.equal(again.reloads, 0);
  assert.equal(again.update.hidden, false, 'the explicit button still offers it');
  assert.equal(again.adoptTimers().length, 0, 'and nothing keeps polling');
  again.refresh.emit('click');
  await flush();
  assert.equal(again.reloads, 1);
  // A later version is tried once more.
  const newer = worker('activated'); newer.version = 'page-v3';
  const third = controller([registration({ active: newer })], { quiet: QUIET, storage });
  await flush();
  assert.equal(third.reloads, 1);
});

test('automatic adoption waits for the whole quiet period, and input restarts it', async () => {
  const { page } = upgraded({ quiet: 10000 });
  await flush();
  assert.equal(page.reloads, 0);
  assert.equal(page.update.hidden, false, 'the button is offered meanwhile');
  assert.deepEqual(page.adoptTimers().map(timer => timer.delay), [QUIET - 10000]);
  page.window.quiet = 35000; // a click 35 s ago
  fire(page); await flush();
  assert.equal(page.reloads, 0);
  assert.deepEqual(page.adoptTimers().map(timer => timer.delay), [QUIET - 35000]);
  page.window.quiet = QUIET + 5;
  fire(page); await flush();
  assert.equal(page.reloads, 1);
});

test('never by itself while a game is open, another screen shows or the tab is hidden', async () => {
  const { page } = upgraded({ quiet: 20 * 60000 });
  page.window.gameOpen = true; // SGUpdateSafe() false and SGUpdateQuiet() -1
  await flush();
  for (let i = 0; i < 4; i++) { fire(page); await flush(); }
  assert.equal(page.reloads, 0, 'an open game is never reloaded, however long it is left');
  assert.deepEqual(page.adoptTimers().map(timer => timer.delay), [30000]);
  page.window.gameOpen = false;
  page.window.SGUpdateQuiet = () => -1; // a category page or a half-made player
  page.window.emit('sg:sessionchange'); await flush();
  fire(page); await flush();
  assert.equal(page.reloads, 0);
  page.window.SGUpdateQuiet = () => 20 * 60000;
  page.window.SGUpdateSafe = () => false; // the classroom timer runs
  page.window.emit('sg:sessionchange'); await flush();
  assert.equal(page.reloads, 0);
  page.window.SGUpdateSafe = () => true;
  page.document.hidden = true;
  page.window.emit('sg:sessionchange'); await flush();
  assert.equal(page.reloads, 0, 'a hidden tab waits');
  assert.equal(page.adoptTimers().length, 0, 'without a timer');
  page.document.hidden = false;
  page.document.emit('visibilitychange'); await flush();
  assert.equal(page.reloads, 1, 'and reloads as soon as it is visible on a quiet home screen');
});

test('closing a game (the idle hand-over) on a long-quiet home screen adopts at once', async () => {
  const { page } = upgraded({ quiet: 20 * 60000 });
  page.window.gameOpen = true;
  await flush();
  assert.equal(page.reloads, 0);
  page.window.gameOpen = false; // the hand-over closed the game; nobody has used the page
  page.window.emit('sg:sessionchange'); await flush();
  assert.equal(page.reloads, 1);
});

test('a game launched or input during the automatic verification prevents that reload', async () => {
  const { active, page } = upgraded({ quiet: QUIET });
  active.hold = true;
  await flush(); active.pending.shift()(); await flush(); // the readiness check
  assert.equal(active.pending.length, 1, 'the automatic verification is pending');
  page.window.gameOpen = true; page.window.emit('sg:sessionchange');
  active.pending.shift()(); await flush();
  assert.equal(page.reloads, 0, 'the newly opened game is kept');
  page.window.gameOpen = false; page.window.quiet = 0; page.window.emit('sg:sessionchange'); await flush();
  assert.equal(page.reloads, 0, 'closing it is use: wait again');
  page.window.quiet = QUIET; fire(page); await flush();
  assert.equal(active.pending.length, 1);
  page.window.quiet = 2000; // a key press while the worker answered
  active.pending.shift()(); await flush();
  assert.equal(page.reloads, 0);
  page.window.quiet = QUIET; fire(page); await flush();
  active.pending.shift()(); await flush();
  assert.equal(page.reloads, 1);
});

test('no reload by itself for an incomplete version, an uncontrolled page, an older site.js or blocked storage', async () => {
  const incomplete = upgraded({ quiet: QUIET });
  incomplete.active.ready = false;
  await flush();
  assert.equal(incomplete.page.reloads, 0);
  const uncontrolled = upgraded({ quiet: QUIET, controlled: false });
  await flush();
  assert.equal(uncontrolled.page.reloads, 0);
  const older = upgraded({ signal: false });
  await flush();
  assert.equal(older.page.reloads, 0);
  assert.equal(older.page.update.hidden, false);
  const blocked = upgraded({ quiet: QUIET, storage: { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('SecurityError'); } } });
  await flush();
  assert.equal(blocked.page.reloads, 0, 'without a memory of the attempt it could loop');
  blocked.page.refresh.emit('click'); await flush();
  assert.equal(blocked.page.reloads, 1, 'the button still works');
});

test('a sessionStorage that reads but cannot be written (full) means no automatic reload, not a loop', async () => {
  const storage = { getItem() { return null; }, setItem() { throw new Error('QuotaExceededError'); } };
  const { active, page } = upgraded({ quiet: QUIET, storage });
  active.hold = true;
  await flush();
  // Answer each request as the worker would; a loop asks again at once, with no timer.
  for (let i = 0; i < 20 && active.pending.length; i++) { active.pending.shift()(); await flush(); }
  assert.equal(page.reloads, 0, 'the attempt cannot be remembered across the reload');
  assert.equal(active.requests.length, 2, 'the readiness check and one verification, then it stops');
  assert.equal(page.adoptTimers().length, 0, 'and nothing keeps polling');
  page.window.quiet = 10 * QUIET;
  page.window.emit('sg:sessionchange'); page.document.emit('visibilitychange'); await flush();
  while (active.pending.length) { active.pending.shift()(); await flush(); }
  assert.equal(page.reloads, 0);
  assert.equal(active.requests.length, 3, 'coming back into view only checks readiness again');
  assert.equal(page.update.hidden, false, 'the button still offers the update');
  page.refresh.emit('click'); await flush();
  active.pending.shift()(); await flush();
  assert.equal(page.reloads, 1, 'and it works');
});

test('a tab left open asks for a newer worker when it comes back into view, at most hourly', async () => {
  const active = worker('activated'), owner = registration({ active });
  const page = controller([owner]);
  await flush();
  page.document.emit('visibilitychange'); page.window.emit('focus'); await flush();
  assert.equal(owner.updates, 0, 'registering just checked');
  page.clock.now += 3600000;
  page.document.emit('visibilitychange'); page.window.emit('focus'); await flush();
  assert.equal(owner.updates, 1);
  page.clock.now += 1800000;
  page.document.emit('visibilitychange'); await flush();
  assert.equal(owner.updates, 1);
  page.clock.now += 3600000;
  owner.installing = worker();
  page.document.emit('visibilitychange'); await flush();
  assert.equal(owner.updates, 1, 'not while a version is installing');
  owner.installing = null;
  owner.update = () => Promise.reject(new Error('offline'));
  page.document.emit('visibilitychange'); await flush();
  assert.equal(page.status['data-state'], 'ready', 'a failed check changes nothing');
});
