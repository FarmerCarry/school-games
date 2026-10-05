import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../shared/kit.js', import.meta.url), 'utf8');
function harness({ reduce = false, stored = {} } = {}) {
  function target(tagName = '') {
    const listeners = {}, attributes = {}, children = [];
    return {
      tagName, children, hidden: false,
      addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
      emit(type, details = {}) {
        const event = { code: '', target: this, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, stopImmediatePropagation() { this.stopped = true; }, ...details };
        for (const fn of listeners[type] || []) { fn(event); if (event.stopped) break; }
        return event;
      },
      setAttribute(name, value) { attributes[name] = value; },
      getAttribute(name) { return attributes[name]; },
      appendChild(child) { children.push(child); }, blur() {}, closest() { return null; }
    };
  }
  const window = target(), document = target(), query = target(), sent = [], timers = [];
  document.documentElement = target('HTML'); document.body = target('BODY'); document.createElement = target;
  document.hidden = false;
  const values = new Map(Object.entries(stored));
  window.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  window.parent = { postMessage: message => sent.push(JSON.parse(JSON.stringify(message))) };
  window.focus = () => {}; query.matches = reduce; window.matchMedia = () => query;
  vm.runInNewContext(source, { window, document, console, Intl, WeakSet,
    setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout: id => { timers[id - 1] = null; }
  });
  return { window, document, query, sent, timers, Kit: window.Kit, values };
}

test('loading Kit alone never signals game readiness; failure prevents a later false ready', () => {
  const h = harness();
  assert.deepEqual(h.sent, []);
  h.window.emit('message', {source: h.window.parent, data: {type: 'sg:request-ready'}});
  assert.deepEqual(h.sent, []);
  h.Kit.ready();
  assert.deepEqual(h.sent, [{type: 'sg:ready', version: 1}]);
  h.sent.length = 0;
  h.window.emit('message', {source: h.window.parent, data: {type: 'sg:request-ready'}});
  assert.equal(h.sent[0].type, 'sg:ready');
  h.sent.length = 0;
  h.window.emit('error', {target: {tagName: 'SCRIPT'}});
  h.Kit.ready();
  h.window.emit('message', {source: h.window.parent, data: {type: 'sg:request-ready'}});
  assert.deepEqual(h.sent.map(m => m.type), ['sg:error']);
});

test('focus, visibility and portal escape clear held inputs before semantic pause without auto resume', () => {
  const h = harness(), calls = [];
  const pointer = h.Kit.pointer({width: 100, height: 100, toLogical: (x, y) => ({x, y})});
  h.Kit.lifecycle({ reset() { calls.push('reset'); }, pause(reason) {
    assert.equal(h.Kit.keys.down('ArrowRight'), false);
    assert.equal(pointer.down || pointer.right || pointer.pressed || pointer.released, false);
    calls.push(reason);
  }});
  for (const reason of ['blur', 'hidden', 'portal-escape', 'session-ended']) {
    h.window.emit('keydown', {code: 'ArrowRight'});
    h.window.emit('pointerdown', {button: 0, clientX: 3, clientY: 4});
    assert.equal(pointer.down, true);
    if (reason === 'blur') h.window.emit('blur');
    if (reason === 'hidden') { h.document.hidden = true; h.document.emit('visibilitychange'); }
    if (reason === 'portal-escape') h.window.emit('keydown', {code: 'Tab', shiftKey: true});
    if (reason === 'session-ended') h.window.emit('message', {source: h.window.parent, data: {type: 'sg:pause', reason}});
    assert.deepEqual(calls.slice(-2), ['reset', reason]);
    const count = calls.length;
    h.document.hidden = false; h.document.emit('visibilitychange'); h.window.emit('focus');
    assert.equal(calls.length, count, 'returning focus does not invoke a resume');
  }
  assert.ok(h.sent.includes('sg:focus-portal'));
});

test('foreign windows cannot pause a game or change its preferences', () => {
  const h = harness(); let pauses = 0;
  h.Kit.lifecycle({pause() { pauses++; }});
  for (const data of [{type: 'sg:pause'}, {type: 'sg:preferences', quiet: true, reducedMotion: true}]) h.window.emit('message', {source: {}, data});
  assert.equal(pauses, 0); assert.equal(h.Kit.audio.muted, false); assert.equal(h.Kit.motion.reduced(), false);
});

test('reduced motion follows system defaults and persists explicit overrides', () => {
  const h = harness({reduce: true});
  const shake = h.Kit.shake(); shake.add(9); shake.update(.01);
  assert.equal(shake.power + Math.abs(shake.x) + Math.abs(shake.y), 0);
  h.Kit.motion.setPreference('full'); shake.add(9); shake.update(.01);
  assert.equal(shake.power, 8.6);
  assert.equal(h.values.get('sg:site:motion'), '"full"');
  h.Kit.motion.setPreference('system');
  h.query.matches = false; h.query.emit('change');
  assert.equal(h.Kit.motion.reduced(), false);
  h.query.matches = true; h.query.emit('change'); shake.update(.01);
  assert.equal(shake.power + Math.abs(shake.x) + Math.abs(shake.y), 0);
  assert.equal(h.document.documentElement.getAttribute('data-sg-motion'), 'reduce');
  const particles = h.Kit.particles(); particles.burst(10, 10);
  assert.equal(particles.list.length, 0, 'decorative bursts respect reduced motion');
  h.Kit.motion.setPreference('full'); particles.burst(10, 10);
  assert.ok(particles.list.length > 0);
  h.Kit.motion.setPreference('reduce'); particles.update(.01);
  assert.equal(particles.list.length, 0, 'existing decorative particles clear on preference change');
});

test('mute toggle exposes persisted state and follows mouse, shortcut and storage updates', () => {
  const h = harness({stored: {'sg:site:muted': 'true'}}), button = h.Kit.muteButton();
  assert.equal(button.getAttribute('aria-pressed'), 'true');
  button.emit('click'); assert.equal(button.getAttribute('aria-pressed'), 'false');
  h.window.emit('keydown', {code: 'KeyM'}); assert.equal(button.getAttribute('aria-pressed'), 'true');
  h.values.set('sg:site:muted', 'false'); h.window.emit('storage', {key: 'sg:site:muted'});
  assert.equal(button.getAttribute('aria-pressed'), 'false');
});

test('save failure stays visible across failed retries and clears only after confirmed success', () => {
  const h = harness(); let attempts = 0;
  const status = h.Kit.saveStatus({retry() { attempts++; status.failed(); }});
  const panel = h.document.body.children[0], retry = panel.children[1];
  assert.equal(panel.hidden, true);
  status.failed(); retry.emit('click');
  assert.equal(attempts, 1); assert.equal(panel.hidden, false); assert.equal(retry.hidden, false);
  assert.equal(panel.getAttribute('data-state'), 'failed');
  status.saved(); assert.equal(panel.children[0].textContent, 'تم الحفظ'); assert.equal(retry.hidden, true);
  status.failed();
  h.timers.filter(Boolean).forEach(fn => fn());
  assert.equal(panel.hidden, false, 'an old success timer cannot hide a new failure');
  status.saved(); h.timers.filter(Boolean).forEach(fn => fn());
  assert.equal(panel.hidden, true);
});
