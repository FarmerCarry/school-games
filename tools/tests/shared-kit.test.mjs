import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../shared/kit.js', import.meta.url), 'utf8');
// clock: injected window.performance; raf: collects requestAnimationFrame callbacks;
// embedded false: a standalone page (window.parent === window).
function harness({ reduce = false, stored = {}, clock, raf, embedded = true } = {}) {
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
  const window = target(), document = target(), query = target(), sent = [], clones = [], timers = [], delays = [];
  document.documentElement = target('HTML'); document.body = target('BODY'); document.createElement = target;
  document.hidden = false;
  const values = new Map(Object.entries(stored));
  window.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  // structuredClone throws for anything postMessage could not send.
  const postMessage = message => { clones.push(structuredClone(message)); sent.push(JSON.parse(JSON.stringify(message))); };
  window.parent = embedded ? { postMessage } : window;
  if (!embedded) window.postMessage = postMessage;
  if (clock) window.performance = { now: () => clock.now };
  window.focus = () => {}; query.matches = reduce; window.matchMedia = () => query;
  const context = { window, document, console, Intl, WeakSet,
    setTimeout: (fn, ms) => { delays.push(ms); timers.push(fn); return timers.length; }, clearTimeout: id => { timers[id - 1] = null; }
  };
  if (raf) Object.assign(context, { requestAnimationFrame: fn => raf.push(fn), cancelAnimationFrame() {} });
  vm.runInNewContext(source, context);
  return { window, document, query, sent, clones, timers, delays, Kit: window.Kit, values };
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
  const failed = harness();
  failed.window.emit('error', {target: {tagName: 'SCRIPT'}});
  failed.window.emit('unhandledrejection', {reason: 'also'});
  failed.Kit.ready();
  failed.window.emit('message', {source: failed.window.parent, data: {type: 'sg:request-ready'}});
  assert.deepEqual(failed.sent, [{type: 'sg:error', version: 1, message: 'Game script failed to load'}]);
});

test('after ready a stray error warns at most once per 10 s and a burst pauses before it fails', () => {
  const clock = {now: 0}, h = harness({clock}), order = [];
  h.Kit.lifecycle({
    reset() { order.push('reset'); },
    pause(reason) { order.push(reason); if (reason === 'error' && order.length === 2) throw new Error('save hook'); }
  });
  h.Kit.ready();
  h.sent.length = 0;
  h.window.emit('error', {message: 'stray', error: {message: 'x'.repeat(300)}});
  h.window.emit('unhandledrejection', {reason: 'again'});
  h.window.emit('error', {target: {tagName: 'IMG'}});
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].type, 'sg:warn');
  assert.equal(h.sent[0].message.length, 240);
  assert.deepEqual(order, [], 'one warning does not pause or fail the game');
  h.Kit.ready();
  h.window.emit('message', {source: h.window.parent, data: {type: 'sg:request-ready'}});
  assert.ok(h.sent.filter(m => m.type === 'sg:ready').length >= 1, 'the game stays ready');
  clock.now = 10000;
  h.window.emit('error', {message: 'later'});
  assert.deepEqual(h.sent.filter(m => m.type === 'sg:warn').map(m => m.message), ['x'.repeat(240), 'later']);
  for (let i = 0; i < 3; i++) h.window.emit('error', {message: 'burst ' + i});
  assert.equal(h.sent.filter(m => m.type === 'sg:error').length, 0, 'four errors in the window are still warnings');
  h.window.emit('error', {message: 'burst fatal'});
  assert.deepEqual(order, ['reset', 'error']);
  assert.equal(h.sent.at(-1).type, 'sg:error');
  assert.equal(h.sent.at(-1).message, 'burst fatal');
  assert.deepEqual(h.sent.map(m => m.type).filter(type => type === 'sg:stats' || type === 'sg:telemetry'), [], 'handlers post no statistics');
  const after = h.sent.length;
  h.window.emit('error', {message: 'too late'});
  h.window.emit('unhandledrejection', {reason: 'too late'});
  h.Kit.fail('again');
  h.Kit.ready();
  assert.equal(h.sent.length, after, 'a failed game reports nothing further');
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
  for (const data of [{type: 'sg:pause'}, {type: 'sg:preferences', quiet: true, reducedMotion: true}, {type: 'sg:preferences', classroom: true}]) h.window.emit('message', {source: {}, data});
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

test('a failure folds into a badge; repeated autosave failures stay folded, Retry unfolds', () => {
  const h = harness(); let attempts = 0;
  const status = h.Kit.saveStatus({retry() { attempts++; status.failed(); }});
  const panel = h.document.body.children[0], retry = panel.children[1];
  status.failed();
  assert.equal(panel.getAttribute('data-compact'), 'false', 'a new failure shows the full message');
  h.timers.filter(Boolean).forEach(fn => fn());
  assert.equal(panel.getAttribute('data-compact'), 'true', 'the message folds into a corner badge');
  assert.equal(panel.hidden, false); assert.equal(retry.hidden, false);
  status.failed();
  assert.equal(panel.getAttribute('data-compact'), 'true', 'a repeated autosave failure does not unfold it');
  retry.emit('click');
  assert.equal(attempts, 1);
  assert.equal(panel.getAttribute('data-compact'), 'false', 'a failed Retry shows the message again');
  status.saved();
  assert.equal(panel.getAttribute('data-compact'), 'false');
});

/* --------------------------------------------------------------- Kit.dda */
const results = (dda, outcomes) => outcomes.map(outcome => { dda.result(outcome); return dda.level; });

test('Kit.dda starts a PC with no results in the middle, or at opts.start, without side effects', () => {
  const h = harness();
  assert.equal(h.Kit.dda('g').level, 0.35);
  assert.equal(h.Kit.dda('g', {start: 0.9}).level, 0.9);
  assert.equal(h.Kit.dda('g', {start: 0}).level, 0);
  for (const start of [-0.1, 1.1, NaN, '0.5', null]) assert.equal(h.Kit.dda('g', {start}).level, 0.35);
  assert.deepEqual([[...h.values], h.delays, h.sent], [[], [], []], 'reading a controller stores, schedules and posts nothing');
});

test('Kit.dda follows the update rule with mercy and hot streaks, clamps, and maps levels to tiers', () => {
  const h = harness(), dda = h.Kit.dda('g');
  assert.deepEqual(results(dda, [true, true, true, true, 0.5, false, false, false, 1, 0.95, 0.9, 0.2]),
    [0.4, 0.441, 0.54, 0.629, 0.606, 0.537, 0.382, 0.236, 0.259, 0.277, 0.327, 0.29],
    'step 0.18 / sqrt(1 + n / 2); the 3rd and 4th great tries add half a step; the 2nd and 3rd poor ones drop a step');
  assert.equal(dda.tier, 2);
  for (const odd of ['x', NaN, undefined, null, {}, Infinity, -Infinity, '1', Symbol('s')]) dda.result(odd);
  assert.equal(dda.level, 0.29, 'odd outcomes are ignored');
  assert.deepEqual(JSON.parse(h.values.get('sg:g:dda')), {main: [0.29, 12]}, 'n counts only real results');
  const high = h.Kit.dda('g', {id: 'hi', start: 0.98});
  assert.deepEqual(results(high, [7, 1, 1]), [1, 1, 1], 'clamped at 1; numbers above 1 count as 1');
  assert.equal(high.tier, 5);
  const low = h.Kit.dda('g', {id: 'lo', start: 0.05});
  assert.deepEqual(results(low, [-3, 0]), [0, 0], 'clamped at 0');
  assert.equal(low.tier, 1);
  // The step never falls below 0.03 (from about 70 results on).
  h.values.set('sg:g:dda', JSON.stringify({late: [0.5, 100]}));
  assert.deepEqual(results(h.Kit.dda('g', {id: 'late'}), [1]), [0.508]);
  const custom = h.Kit.dda('g', {id: 'c', start: 0.5, target: 0.5, tiers: 3});
  assert.deepEqual(results(custom, [0.5, 0.75]), [0.5, 0.537]);
  const tiers = (opts, levels) => levels.map(start => h.Kit.dda('t', {...opts, start}).tier);
  assert.deepEqual(tiers({}, [0, 0.199, 0.21, 0.5, 0.8, 0.81, 0.999, 1]), [1, 1, 2, 3, 4, 5, 5, 5], 'tier = 1 + floor(level * tiers * 0.9999)');
  assert.deepEqual(tiers({tiers: 3}, [0, 0.33, 0.34, 0.67, 1]), [1, 1, 2, 3, 3]);
  assert.deepEqual(tiers({tiers: 12}, [1]), [9], 'at most 9 tiers');
  for (const n of [0, undefined, NaN, -2]) assert.deepEqual(tiers({tiers: n}, [1]), [5], 'default 5 tiers');
  const picker = h.Kit.dda('t', {start: 0.5});
  assert.deepEqual([picker.pick(['a', 'b', 'c', 'd', 'e']), picker.pick(['a', 'b']), picker.value(10, 20)], ['c', 'b', 15]);
});

test('Kit.dda keeps one state per PC and id, shared by every controller of that id, and resets', () => {
  const h = harness(), dda = h.Kit.dda('g'), boss = h.Kit.dda('g', {id: 'boss'});
  dda.result(true); boss.result(false);
  assert.deepEqual(JSON.parse(h.values.get('sg:g:dda')), {main: [0.4, 1], boss: [0.22, 1]});
  // The next page load (a new controller) carries on from the saved level.
  assert.equal(harness({stored: Object.fromEntries(h.values)}).Kit.dda('g').level, 0.4);
  boss.reset();
  assert.deepEqual(JSON.parse(h.values.get('sg:g:dda')), {main: [0.4, 1]});
  assert.equal(boss.level, 0.35);
});

test('Kit.dda carries over the newest player\'s level from saves made when the site had player profiles', () => {
  // Old shape: { <player or '_' + band>: { <id>: [level, n] } }, the newest player last.
  const old = {_: {main: [0.2, 3]}, 'p1': {main: [0.5, 9], boss: [0.7, 2]}, '_8-9': {main: [0.6, 4]}};
  const h = harness({stored: {'sg:g:dda': JSON.stringify(old)}});
  assert.equal(h.Kit.dda('g').level, 0.6, 'the newest entry with that id wins');
  assert.equal(h.Kit.dda('g', {id: 'boss'}).level, 0.7);
  h.Kit.dda('g').result(true);
  assert.deepEqual(JSON.parse(h.values.get('sg:g:dda')), {main: [0.629, 5], boss: [0.7, 2]}, 'the first save writes the new shape');
  for (const junk of ['"x"', '[1,2]', '{"main":[2,1],"p1":{"main":"x"}}', 'not json']) {
    assert.equal(harness({stored: {'sg:g:dda': junk}}).Kit.dda('g').level, 0.35, junk);
  }
});

test('Kit records no play statistics and sends nothing but readiness, warnings and the portal hand-off', () => {
  const clock = {now: 0}, raf = [], h = harness({clock, raf});
  for (const name of ['stats', 'track', 'profile']) assert.equal(name in h.Kit, false, 'Kit.' + name + ' is gone');
  h.Kit.ready();
  h.Kit.loop(() => {}, () => {});
  for (let i = 0; i < 5; i++) { clock.now += 16; raf.shift()?.(clock.now); }
  h.window.emit('keydown', {code: 'KeyA'}); h.window.emit('pointerdown', {button: 0});
  h.window.emit('pointermove'); h.window.emit('wheel'); h.window.emit('pagehide', {});
  h.window.emit('blur');
  h.window.emit('keydown', {code: 'Tab', shiftKey: true});
  for (const fn of h.timers) fn?.();
  assert.deepEqual([...new Set(h.sent.map(m => m.type || m))].sort(), ['sg:focus-portal', 'sg:ready']);
  assert.deepEqual(h.timers.filter(Boolean), [], 'no timers of its own');
});
