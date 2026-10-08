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

test('classroom preset is transient across independent game storage and restores personal preferences', () => {
  const a = harness({stored: {'sg:site:motion': '"full"', 'sg:site:muted': 'false'}});
  const b = harness({reduce: true, stored: {'sg:site:motion': '"system"', 'sg:site:muted': 'true'}});
  const originals = [a, b].map(h => Object.fromEntries(h.values));
  const button = a.Kit.muteButton();
  const apply = (h, classroom) => h.window.emit('message', {source: h.window.parent, data: {type: 'sg:preferences', classroom}});
  for (const h of [a, b]) {
    apply(h, true);
    assert.equal(h.Kit.audio.muted, true);
    assert.equal(h.Kit.motion.reduced(), true);
    h.Kit.audio.toggleMute();
    assert.equal(h.Kit.audio.muted, true, 'mute shortcut cannot undo classroom quiet');
  }
  assert.equal(button.disabled, true);
  // The portal disables the preset while B is open. A is later recreated,
  // exactly as separate file:// game storage behaves on a downloaded site.
  apply(b, false);
  assert.equal(b.Kit.audio.muted, true, 'B keeps its personal mute preference');
  assert.equal(b.Kit.motion.preference, 'system');
  assert.equal(b.Kit.motion.reduced(), true, 'B still follows its system preference');
  const revisitedA = harness({stored: Object.fromEntries(a.values)});
  apply(revisitedA, false);
  assert.equal(revisitedA.Kit.audio.muted, false);
  assert.equal(revisitedA.Kit.motion.reduced(), false);
  assert.deepEqual([a, b].map(h => Object.fromEntries(h.values)), originals, 'classroom never writes personal preferences');
  apply(a, false);
  assert.equal(a.Kit.audio.muted, false);
  assert.equal(button.disabled, false);
  assert.equal(button.getAttribute('aria-pressed'), 'false');
});

test('personal storage changes during classroom mode take effect after the override ends', () => {
  const h = harness();
  const apply = classroom => h.window.emit('message', {source: h.window.parent, data: {type: 'sg:preferences', classroom}});
  apply(true);
  h.values.set('sg:site:motion', '"full"'); h.values.set('sg:site:muted', 'false');
  h.window.emit('storage', {key: null});
  assert.equal(h.Kit.audio.muted, true); assert.equal(h.Kit.motion.reduced(), true);
  apply(false);
  assert.equal(h.Kit.audio.muted, false); assert.equal(h.Kit.motion.reduced(), false);
  assert.equal(h.Kit.motion.preference, 'full');
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

/* ---------------------------------------------------------- play stats */
const statsOf = h => h.sent.filter(m => m && m.type === 'sg:stats');
const lastStats = h => statsOf(h).at(-1);
// Runs each timer scheduled so far once; timers they schedule wait for the next call.
function runTimers(h) {
  h.timers.forEach((fn, i) => { if (fn) { h.timers[i] = null; fn(); } });
}
const pending = h => h.timers.filter(Boolean).length;
const pauses = {
  blur: h => h.window.emit('blur'),
  hidden: h => { h.document.hidden = true; h.document.emit('visibilitychange'); h.document.hidden = false; h.document.emit('visibilitychange'); },
  'portal-escape': h => h.window.emit('keydown', {code: 'Tab', shiftKey: true}),
  'session-ended': h => h.window.emit('message', {source: h.window.parent, data: {type: 'sg:pause', reason: 'session-ended'}}),
  'fullscreen-exit': h => { h.document.fullscreenElement = {}; h.document.emit('fullscreenchange'); h.document.fullscreenElement = null; h.document.emit('fullscreenchange'); },
  pagehide: h => h.window.emit('pagehide', {persisted: false})
};

test('stats: key presses and clicks open 20 s engaged windows that merge; moves, the wheel and busy() only extend them', () => {
  const clock = {now: 1000}, h = harness({clock}), key = () => h.window.emit('keydown', {code: 'KeyA'});
  h.Kit.ready();
  h.window.emit('pointermove'); h.window.emit('wheel'); h.Kit.stats.busy();
  clock.now = 9000; h.Kit.stats.round('L1');
  assert.deepEqual(lastStats(h), {type: 'sg:stats', version: 1, e: 0, f: [0, 0, 0, 0], m: 0, r: [['s', 'L1']], o: 'L1'}, 'moves, the wheel and busy() never open a window');
  key();                                                          // open until 29 000
  clock.now = 19000; h.window.emit('pointermove');                // until 39 000
  clock.now = 30000; h.window.emit('wheel');                      // until 50 000
  clock.now = 45000; h.Kit.stats.busy();                          // until 65 000
  clock.now = 90000; h.window.emit('pointermove'); h.Kit.stats.busy(); // closed: no effect
  clock.now = 100000; h.window.emit('pointerdown', {button: 0});  // a new window until 120 000
  clock.now = 104000; key();                                      // overlapping windows merge: until 124 000
  clock.now = 110000; h.Kit.stats.end('win');
  assert.deepEqual(lastStats(h), {type: 'sg:stats', version: 1, e: 56000 + 10000, f: [0, 0, 0, 0], m: 0, r: [['w', 'L1', 66000]], o: ''});
  clock.now = 200000; key();
  clock.now = 260000; h.Kit.stats.round('L2');
  assert.equal(lastStats(h).e, 14000 + 20000, 'each window ends 20 s after its last input');
});

test('stats: every pause and pagehide cuts the window at once, posts, and disarms until a key press or click', () => {
  for (const [reason, pause] of Object.entries(pauses)) {
    const clock = {now: 5000}, h = harness({clock});
    h.Kit.ready(); h.Kit.stats.round('main'); h.sent.length = 0;
    h.window.emit('pointerdown', {button: 0});
    clock.now = 8000; pause(h);
    assert.deepEqual(statsOf(h), [{type: 'sg:stats', version: 1, e: 3000, f: [0, 0, 0, 0], m: 0, r: [], o: 'main'}], reason);
    clock.now = 9000; h.window.emit('pointermove'); h.window.emit('wheel'); h.Kit.stats.busy(); h.Kit.stats.frame(16);
    clock.now = 20000; runTimers(h);
    assert.equal(statsOf(h).length, 1, `${reason}: a disarmed game counts nothing for mouse moves, the wheel or busy()`);
    h.window.emit('keydown', {code: 'Space'});                    // armed again: open until 40 000
    clock.now = 21000; h.window.emit('pointermove');              // until 41 000
    clock.now = 30000; h.Kit.stats.end('lose');
    assert.deepEqual([lastStats(h).e, lastStats(h).r], [10000, [['l', 'main', 13000]]], reason);
  }
});

test('stats: round() records an open round as a quit, end() needs an open round, ids and results go out raw', () => {
  const clock = {now: 0}, h = harness({clock});
  h.Kit.ready(); h.window.emit('pointerdown', {button: 0}); h.sent.length = 0;
  clock.now = 1000; h.Kit.stats.end('win', 5);
  assert.deepEqual(h.sent, [], 'end() without an open round is ignored');
  h.Kit.stats.round('L3');
  clock.now = 4000; h.Kit.stats.round('L3');
  clock.now = 6500; h.Kit.stats.end('lose'); h.Kit.stats.end('win');
  h.Kit.stats.round('endless'); clock.now = 8000; h.Kit.stats.end('end', 950.5);
  h.Kit.stats.round('w1-4'); h.Kit.stats.end('draw', NaN);
  h.Kit.stats.round('x'.repeat(30)); h.Kit.stats.end('WIN', -3);
  h.Kit.stats.round(12);
  assert.deepEqual(statsOf(h).map(m => [m.e, m.r, m.o]), [
    [1000, [['s', 'L3']], 'L3'],
    [3000, [['q', 'L3', 3000], ['s', 'L3']], 'L3'],
    [2500, [['l', 'L3', 2500]], ''],
    [0, [['s', 'endless']], 'endless'],
    [1500, [['e', 'endless', 1500, 950.5]], ''],
    [0, [['s', 'w1-4']], 'w1-4'],
    [0, [['d', 'w1-4', 0]], ''],
    [0, [['s', 'x'.repeat(24)]], 'x'.repeat(24)],
    // Kit does not clean or clamp; the portal checks ids, codes and numbers.
    [0, [['W', 'x'.repeat(24), 0, -3]], ''],
    [0, [['s', '12']], '12']
  ]);
});

test('stats: each tutorial step is sent at most once per page load, and 32 waiting events post at once', () => {
  const h = harness({clock: {now: 0}});
  h.Kit.stats.tutorial('start'); h.Kit.stats.tutorial('start'); h.Kit.ready();
  h.Kit.stats.tutorial('done'); h.Kit.stats.tutorial('start'); h.Kit.stats.tutorial('done');
  assert.deepEqual(h.sent, [{type: 'sg:ready', version: 1}], 'tutorial steps wait for the next post');
  runTimers(h);
  assert.deepEqual(statsOf(h).map(m => m.r), [[['t', 'start'], ['t', 'done']]]);
  h.Kit.stats.tutorial('done'); h.Kit.stats.round('L1');
  assert.deepEqual(lastStats(h).r, [['s', 'L1']]);
  for (let i = 0; i < 31; i++) h.Kit.stats.tutorial('step' + i);
  assert.equal(statsOf(h).length, 2);
  h.Kit.stats.tutorial('step31');
  assert.equal(statsOf(h).length, 3); assert.equal(lastStats(h).r.length, 32);
});

test('stats: frames count only while engaged, armed and in a round, never the first frame after start or show', () => {
  const clock = {now: 1000}, raf = [], h = harness({clock, raf});
  let updates = 0;
  h.Kit.ready(); h.Kit.loop(() => updates++, () => {});
  const frame = ms => { clock.now += ms; raf.splice(0).forEach(fn => fn(clock.now)); };
  const counted = () => { runTimers(h); return statsOf(h).reduce((sum, m) => sum.map((n, i) => n + m.f[i]), [0, 0, 0, 0]); };
  frame(16); frame(16);                                   // first frame, then not engaged
  h.window.emit('keydown', {code: 'KeyA'}); frame(16);    // engaged, but no round open
  assert.deepEqual(counted(), [0, 0, 0, 0]);
  h.Kit.stats.round('main');
  for (const ms of [16, 20, 30, 34, 100, 250, 300]) frame(ms);
  assert.deepEqual(counted(), [2, 2, 2, 1], 'smooth <= 20 ms, ok <= 34 ms, choppy <= 250 ms, stall');
  h.document.hidden = true; h.document.emit('visibilitychange'); frame(16);
  h.document.hidden = false; h.document.emit('visibilitychange');
  h.window.emit('keydown', {code: 'KeyA'}); frame(16); frame(16);
  assert.deepEqual(counted(), [3, 2, 2, 1], 'hidden frames and the first frame after showing are skipped');
  h.window.emit('blur'); frame(16); h.window.emit('pointermove'); frame(16); h.Kit.stats.frame(16);
  assert.deepEqual(counted(), [3, 2, 2, 1], 'a paused game counts no frames');
  h.window.emit('pointerdown', {button: 0});
  for (const ms of [16, 0, -5, NaN, undefined, 400]) h.Kit.stats.frame(ms);
  assert.deepEqual(counted(), [4, 2, 2, 2], 'Kit.stats.frame() uses the same gate and buckets');
  h.Kit.stats.end('end'); frame(16); h.Kit.stats.frame(16);
  assert.deepEqual(counted(), [4, 2, 2, 2], 'no frames once the round has ended');
  assert.ok(updates > 0, 'the loop still runs its updates');
});

test('stats: one 10 s timer chain starts at the first Kit.ready() and stops once the game has failed', () => {
  const clock = {now: 0}, h = harness({clock});
  h.Kit.stats.round('L1');
  assert.equal(h.timers.length, 0, 'no timer at load or before Kit.ready()');
  h.Kit.ready(); h.Kit.ready();
  for (let i = 0; i < 3; i++) h.window.emit('message', {source: h.window.parent, data: {type: 'sg:request-ready'}});
  assert.deepEqual([pending(h), h.delays], [1, [10000]]);
  assert.deepEqual(statsOf(h), [], 'Kit.ready() itself never posts statistics');
  runTimers(h);
  assert.deepEqual(statsOf(h).map(m => m.r), [[['s', 'L1']]], 'the timer posts what waited for readiness');
  runTimers(h);
  assert.equal(statsOf(h).length, 1, 'no post without unsent data');
  assert.deepEqual([pending(h), h.delays], [1, [10000, 10000, 10000]], 'each tick schedules exactly one more');
  h.window.emit('keydown', {code: 'KeyA'}); clock.now = 5000;
  h.window.emit('error', {message: 'boom'}); h.Kit.ready();
  assert.deepEqual(h.sent.map(m => m.type).slice(-1), ['sg:error'], 'error handlers post no statistics');
  runTimers(h);
  assert.equal(pending(h), 0, 'the chain stops after a failure');
  assert.equal(h.sent.at(-1).type, 'sg:error');
});

test('stats: nothing is posted at load or before Kit.ready(); afterwards round(), end(), pauses and pagehide post changes', () => {
  const clock = {now: 0}, h = harness({clock});
  h.window.emit('pointerdown', {button: 0}); h.Kit.stats.round('L1');
  clock.now = 2000; h.Kit.stats.end('win', 7); h.window.emit('blur'); h.window.emit('pagehide');
  assert.deepEqual(h.sent, [], 'nothing before readiness');
  h.Kit.ready();
  assert.deepEqual(h.sent, [{type: 'sg:ready', version: 1}]);
  h.window.emit('keydown', {code: 'KeyA'}); clock.now = 2500; h.Kit.stats.round('L2');
  clock.now = 3000; h.Kit.stats.end('lose');
  h.Kit.audio.toggleMute(); clock.now = 3200; h.window.emit('blur');
  h.window.emit('keydown', {code: 'KeyA'}); clock.now = 3300; h.window.emit('pagehide');
  h.window.emit('pagehide'); h.window.emit('blur');
  assert.deepEqual(statsOf(h), [
    {type: 'sg:stats', version: 1, e: 2500, f: [0, 0, 0, 0], m: 0, r: [['s', 'L1'], ['w', 'L1', 2000, 7], ['s', 'L2']], o: 'L2'},
    {type: 'sg:stats', version: 1, e: 500, f: [0, 0, 0, 0], m: 0, r: [['l', 'L2', 500]], o: ''},
    {type: 'sg:stats', version: 1, e: 200, f: [0, 0, 0, 0], m: 1, r: [], o: ''},
    {type: 'sg:stats', version: 1, e: 100, f: [0, 0, 0, 0], m: 0, r: [], o: ''}
  ], 'repeated pauses with nothing new post nothing');
});

test('stats: a standalone game counts but never posts', () => {
  const clock = {now: 0}, raf = [], h = harness({clock, raf, embedded: false});
  h.Kit.ready(); h.Kit.loop(() => {}, () => {});
  h.window.emit('keydown', {code: 'KeyA'}); h.Kit.stats.round('L1'); h.Kit.stats.tutorial('start'); h.Kit.audio.toggleMute();
  clock.now = 3000; h.Kit.stats.frame(16); raf.splice(0).forEach(fn => fn(3000)); h.Kit.stats.end('win', 3);
  for (let i = 0; i < 40; i++) h.Kit.stats.tutorial('t' + i);
  h.window.emit('blur'); h.window.emit('pagehide'); runTimers(h); runTimers(h);
  assert.deepEqual(h.sent, []);
});

test('stats: only the child\'s own mute toggles count', () => {
  const h = harness({clock: {now: 0}}), button = h.Kit.muteButton();
  const prefs = data => h.window.emit('message', {source: h.window.parent, data: {type: 'sg:preferences', ...data}});
  h.Kit.ready();
  button.emit('click'); h.window.emit('keydown', {code: 'KeyM'});
  h.Kit.audio.setMuted(true); prefs({quiet: false});
  prefs({classroom: true}); h.Kit.audio.toggleMute(); h.window.emit('keydown', {code: 'KeyM'});
  runTimers(h);
  assert.deepEqual(statsOf(h).map(m => [m.e, m.m]), [[0, 2]], 'mute toggles alone are a change worth posting');
});

test('stats: every call is safe with any argument, and every payload survives JSON and structured cloning', () => {
  const clock = {now: 0}, h = harness({clock});
  const odd = [undefined, null, true, 0, -1, NaN, Infinity, '', 'L1', 'win', {}, [], [1, 2], Object.create(null), Symbol('s'), () => 1, 10n, {toString() { throw new Error('odd'); }}];
  const calls = () => {
    for (const a of odd) for (const b of odd) { h.Kit.stats.round(a); h.Kit.stats.end(a, b); h.Kit.stats.tutorial(a); h.Kit.stats.busy(a); h.Kit.stats.frame(a); }
  };
  assert.doesNotThrow(calls, 'before Kit.ready()');
  h.Kit.ready(); h.window.emit('keydown', {code: 'KeyA'}); clock.now = 500;
  assert.doesNotThrow(() => { calls(); runTimers(h); h.window.emit('blur'); });
  assert.ok(statsOf(h).length > odd.length);
  assert.deepEqual(h.clones, h.sent, 'structured clones match the JSON copies');
  for (const m of statsOf(h)) {
    assert.deepEqual(Object.keys(m), ['type', 'version', 'e', 'f', 'm', 'r', 'o']);
    assert.ok(m.r.every(event => typeof event[0] === 'string' && event[0].length <= 1 && event.length <= 4));
    assert.ok(m.r.every(event => event.slice(1).every(v => typeof v === 'string' ? v.length <= 24 : Number.isFinite(v))));
  }
});

test('stats: every recorded timer is safe to run at any moment, with or without window.performance', () => {
  for (const embedded of [true, false]) {
    const h = harness({embedded});
    h.Kit.ready(); h.window.emit('keydown', {code: 'KeyA'}); h.Kit.stats.round('L1');
    for (let i = 0; i < 4; i++) assert.doesNotThrow(() => h.timers.filter(Boolean).forEach(fn => fn()));
    h.Kit.fail('stop');
    assert.doesNotThrow(() => h.timers.filter(Boolean).forEach(fn => fn()));
    assert.ok(statsOf(h).every(m => Number.isInteger(m.e) && m.e >= 0), 'the Date.now() fallback gives whole milliseconds');
  }
});
