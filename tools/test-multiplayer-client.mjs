import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../shared/multiplayer-client.js', import.meta.url), 'utf8');
const storageKey = 'sg:multiplayer:connect-four';
const identity = { name: 'Mona', token: 'saved-token' };

function fakeClock() {
  let now = 0, nextId = 0;
  const tasks = new Map();
  return {
    get now() { return now; },
    get pending() { return tasks.size; },
    setTimeout(callback, delay = 0) {
      const id = ++nextId;
      tasks.set(id, { callback, at: now + delay });
      return id;
    },
    clearTimeout(id) { tasks.delete(id); },
    advance(milliseconds) {
      const until = now + milliseconds;
      for (let count = 0; ; count++) {
        const next = [...tasks].filter(([, task]) => task.at <= until)
          .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!next) break;
        assert.ok(count < 1000, 'Transport must not create an unbounded timer loop');
        tasks.delete(next[0]);
        now = next[1].at;
        next[1].callback();
      }
      now = until;
    }
  };
}

function transport({ saved = identity, respond } = {}) {
  const clock = fakeClock();
  const storage = new Map(saved ? [[storageKey, JSON.stringify(saved)]] : []);
  const sockets = [], joins = [], statuses = [], received = [];
  class WebSocket {
    static OPEN = 1;
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      sockets.push(this);
      clock.setTimeout(() => {
        if (this.readyState !== 0) return;
        this.readyState = WebSocket.OPEN;
        this.onopen?.();
      });
    }
    send(json) {
      assert.equal(this.readyState, WebSocket.OPEN);
      const message = JSON.parse(json);
      assert.equal(message.type, 'join', 'Recovery must only try to join, never evict the old connection');
      joins.push({ ...message, at: clock.now });
      clock.setTimeout(() => {
        if (this.readyState !== WebSocket.OPEN) return;
        const response = respond(message, clock.now, joins.length);
        this.onmessage?.({ data: JSON.stringify(response) });
      }, 100);
    }
    close() {
      if (this.readyState === 3) return;
      this.readyState = 3;
      clock.setTimeout(() => this.onclose?.());
    }
  }
  const window = { SG_MULTIPLAYER_URL: 'wss://school.example/ws', WebSocket };
  vm.runInNewContext(source, {
    window, WebSocket, URL,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    sessionStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key)
    }
  });
  const client = window.SGMultiplayer.create({
    game: 'connect-four',
    onStatus: status => statuses.push({ status, at: clock.now }),
    onMessage: message => received.push(message)
  });
  return { client, clock, sockets, joins, statuses, received, storage };
}

const welcome = { type: 'welcome', id: 'student-id', ...identity };
const activeSession = { type: 'error', code: 'session-active' };

test('refresh resumes when the old hosted socket lingers for more than ten seconds', () => {
  const h = transport({ respond: (_, now) => now < 11000 ? activeSession : welcome });
  h.client.connect(identity.name);
  h.clock.advance(10000);
  assert.equal(h.client.isOnline(), false);
  assert.notEqual(h.statuses.at(-1).status, 'unavailable', 'A lingering old socket must not end refresh recovery early');
  h.clock.advance(50000);
  assert.equal(h.client.isOnline(), true);
  assert.equal(h.client.id(), welcome.id);
  assert.ok(h.statuses.find(item => item.status === 'online').at >= 11000);
  assert.ok(h.joins.length > 3, 'Recovery must outlast the original two retries');
  assert.ok(h.joins.every(join => join.token === identity.token));
  assert.equal(h.received.length, 1);
  assert.equal(h.received[0].type, 'welcome');
  assert.equal(h.clock.pending, 0, 'Successful recovery must stop all retry and join timers');
});

test('a genuinely active duplicate tab stops after a bounded retry window without dropping its token', () => {
  const h = transport({ respond: () => activeSession });
  h.client.connect(identity.name);
  h.clock.advance(120000);
  assert.equal(h.client.isOnline(), false);
  assert.equal(h.statuses.at(-1).status, 'unavailable');
  assert.ok(h.joins.length > 3 && h.joins.length <= 9, 'Session collision retries must be patient but bounded');
  assert.ok(h.joins.every(join => join.token === identity.token));
  assert.ok(h.sockets.every(socket => socket.readyState === 3));
  assert.equal(JSON.parse(h.storage.get(storageKey)).token, identity.token);
  assert.equal(h.clock.pending, 0);
  const count = h.joins.length;
  h.clock.advance(120000);
  assert.equal(h.joins.length, count, 'No silent retry loop may remain after giving up');
});

test('explicit disconnect or logout cancels a pending session-collision retry', () => {
  for (const leave of [false, true]) {
    const h = transport({ respond: () => activeSession });
    h.client.connect(identity.name);
    h.clock.advance(100);
    assert.equal(h.statuses.at(-1).status, 'reconnecting');
    h.client.disconnect(leave);
    h.clock.advance(120000);
    assert.equal(h.joins.length, 1);
    assert.equal(h.client.isOnline(), false);
    assert.equal(h.statuses.at(-1).status, 'idle');
    assert.equal(h.client.canResume(), !leave);
    assert.equal(h.clock.pending, 0);
  }
});

test('an expired token still recovers by joining once with a fresh session', () => {
  const freshWelcome = { ...welcome, id: 'new-student-id', token: 'new-token' };
  const h = transport({ respond: message => message.token === identity.token
    ? { type: 'error', code: 'invalid-session' } : freshWelcome });
  h.client.connect(identity.name);
  h.clock.advance(10000);
  assert.equal(h.client.isOnline(), true);
  assert.equal(h.client.id(), freshWelcome.id);
  assert.equal(h.joins.length, 2);
  assert.equal(h.joins[0].token, identity.token);
  assert.equal(h.joins[1].token, undefined);
  assert.equal(h.joins[1].name, identity.name);
  assert.equal(JSON.parse(h.storage.get(storageKey)).token, freshWelcome.token);
  assert.equal(h.clock.pending, 0);
});

test('session-active without a saved token does not enter the refresh retry path', () => {
  const h = transport({ saved: null, respond: () => activeSession });
  h.client.connect(identity.name);
  h.clock.advance(120000);
  assert.equal(h.joins.length, 1);
  assert.equal(h.statuses.at(-1).status, 'unavailable');
  assert.equal(h.client.isOnline(), false);
  assert.equal(h.clock.pending, 0);
});
