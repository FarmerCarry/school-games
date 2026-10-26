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
  assert.deepEqual(lastStats(h), {type: 'sg:stats', version: 1, e: 0, f: [0, 0, 0, 0], m: 0, r: [['s', 'L1']], o: 'L1', om: 0}, 'moves, the wheel and busy() never open a window');
  key();                                                          // open until 29 000
  clock.now = 19000; h.window.emit('pointermove');                // until 39 000
  clock.now = 30000; h.window.emit('wheel');                      // until 50 000
  clock.now = 45000; h.Kit.stats.busy();                          // until 65 000
  clock.now = 90000; h.window.emit('pointermove'); h.Kit.stats.busy(); // closed: no effect
  clock.now = 100000; h.window.emit('pointerdown', {button: 0});  // a new window until 120 000
  clock.now = 104000; key();                                      // overlapping windows merge: until 124 000
  clock.now = 110000; h.Kit.stats.end('win');
  assert.deepEqual(lastStats(h), {type: 'sg:stats', version: 1, e: 56000 + 10000, f: [0, 0, 0, 0], m: 0, r: [['w', 'L1', 66000]], o: '', om: 0});
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
    assert.deepEqual(statsOf(h), [{type: 'sg:stats', version: 1, e: 3000, f: [0, 0, 0, 0], m: 0, r: [], o: 'main', om: 3000}], reason);
    clock.now = 9000; h.window.emit('pointermove'); h.window.emit('wheel'); h.Kit.stats.busy(); h.Kit.stats.frame(16);
    clock.now = 20000; runTimers(h);
    assert.equal(statsOf(h).length, 1, `${reason}: a disarmed game counts nothing for mouse moves, the wheel or busy()`);
    h.window.emit('keydown', {code: 'Space'});                    // armed again: open until 40 000
    clock.now = 21000; h.window.emit('pointermove');              // until 41 000
    clock.now = 30000; h.Kit.stats.end('lose');
    assert.deepEqual([lastStats(h).e, lastStats(h).r], [10000, [['l', 'main', 13000]]], reason);
  }
});

// om lets the portal keep the time of a round the child leaves open (Back, a portal
// restart, a reload): Kit puts a round's ms on its end or 'q' event only.
test('stats: every message carries om, the engaged ms so far in the round open now (0 when none)', () => {
  const clock = {now: 0}, h = harness({clock});
  h.Kit.ready(); h.window.emit('keydown', {code: 'KeyA'});         // open until 20 000
  clock.now = 1000; h.Kit.stats.round('L1');                       // 1 s engaged before the round
  clock.now = 4000; runTimers(h);                                  // the 10 s timer: 3 s into L1
  clock.now = 6000; h.window.emit('blur');                         // a pause cuts the window: 5 s
  h.window.emit('keydown', {code: 'KeyA'}); clock.now = 7500; h.Kit.stats.round('L2');
  clock.now = 9000; h.Kit.stats.end('win');
  assert.deepEqual(statsOf(h).map(m => [m.e, m.r, m.o, m.om]), [
    [1000, [['s', 'L1']], 'L1', 0],
    [3000, [], 'L1', 3000],
    [2000, [], 'L1', 5000],
    [1500, [['q', 'L1', 6500], ['s', 'L2']], 'L2', 0],
    [1500, [['w', 'L2', 1500]], '', 0]
  ]);
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
    {type: 'sg:stats', version: 1, e: 2500, f: [0, 0, 0, 0], m: 0, r: [['s', 'L1'], ['w', 'L1', 2000, 7], ['s', 'L2']], o: 'L2', om: 0},
    {type: 'sg:stats', version: 1, e: 500, f: [0, 0, 0, 0], m: 0, r: [['l', 'L2', 500]], o: '', om: 0},
    {type: 'sg:stats', version: 1, e: 200, f: [0, 0, 0, 0], m: 1, r: [], o: '', om: 0},
    {type: 'sg:stats', version: 1, e: 100, f: [0, 0, 0, 0], m: 0, r: [], o: '', om: 0}
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
    assert.deepEqual(Object.keys(m), ['type', 'version', 'e', 'f', 'm', 'r', 'o', 'om']);
    assert.ok(Number.isInteger(m.om) && m.om >= 0 && (m.o || !m.om), 'om is whole milliseconds, 0 with no open round');
    assert.ok(m.r.every(event => typeof event[0] === 'string' && event[0].length <= 1 && event.length <= 4));
    assert.ok(m.r.every(event => event.slice(1).every(v => typeof v === 'string' ? v.length <= 24 : Number.isFinite(v))));
  }
});

/* ------------------------------------------------------------- Kit v2 */
// docs/ARCHITECTURE.md "Kit v2": Kit.profile, Kit.track, Kit.dda and sg:telemetry version 2.
const telemetryOf = h => h.sent.filter(m => m && m.type === 'sg:telemetry');
const preferences = (h, data, source = h.window.parent) => h.window.emit('message', {source, data: {type: 'sg:preferences', ...data}});
const zeros = [0, 0, 0, 0, 0, 0];

test('v2: sg:preferences sets the band, player and telemetry only from valid values and never stores them', () => {
  const h = harness(), seen = [], given = [];
  const stored = JSON.stringify([...h.values]);
  assert.deepEqual([h.Kit.profile.band, h.Kit.profile.player], ['', '']);
  // Copies: objects made inside the vm context have their own prototypes.
  const off = h.Kit.profile.onChange(change => { given.push(change); seen.push({...change}); });
  preferences(h, {band: '8-9', player: 'p1'});
  assert.deepEqual(seen, [{band: '8-9', player: 'p1'}]);
  preferences(h, {band: '8-9', player: 'p1', classroom: false}); preferences(h, {});
  assert.equal(seen.length, 1, 'listeners fire only on an actual change');
  for (const band of ['12', '6–7', ' 6-7', '10-11 ', '6-7\n', 7, null, true, ['6-7'], {}, 'toString', '__proto__', 'constructor']) preferences(h, {band});
  for (const player of ['P1', 'p', 'p123456789', 'x1', 'p1 ', 'p-1', 'p1\n', 'p_1', 1, null, ['p1'], {}]) preferences(h, {player});
  assert.deepEqual([h.Kit.profile.band, h.Kit.profile.player, seen.length], ['8-9', 'p1', 1], 'invalid fields are ignored');
  preferences(h, {band: '10-11'}); preferences(h, {player: 'p0a9z'}); preferences(h, {band: '6-7', player: 'p12345678'}); preferences(h, {band: '', player: ''});
  assert.deepEqual(seen.slice(1), [{band: '10-11', player: 'p1'}, {band: '10-11', player: 'p0a9z'}, {band: '6-7', player: 'p12345678'}, {band: '', player: ''}]);
  given.at(-1).band = '8-9';
  assert.equal(h.Kit.profile.band, '', 'listeners get a copy');
  off(); preferences(h, {band: '8-9'});
  assert.equal(seen.length, 5, 'unsubscribed');
  preferences(h, {band: '6-7', player: 'p9', telemetry: true}, {});
  assert.deepEqual([h.Kit.profile.band, h.Kit.profile.player], ['8-9', ''], 'a foreign window cannot set the profile');
  assert.equal(JSON.stringify([...h.values]), stored, 'profile and telemetry preferences are never stored');
  assert.deepEqual([h.sent, h.delays, h.document.body.children], [[], [], []]);
});

// One session with every v2 input: presses and clicks with event times, hits,
// misses, a cue, explicit reaction times, a tier, rounds, a quit, an end and pauses.
function session(h, clock) {
  clock.now = 1000; h.window.emit('keydown', {code: 'KeyA', timeStamp: 990});
  h.Kit.stats.round('L1');
  h.Kit.track.hit(); h.Kit.track.miss(); h.Kit.track.cue(); h.Kit.track.tier(2);
  clock.now = 1400; h.window.emit('pointerdown', {button: 0, timeStamp: 1395});
  h.Kit.track.react(250); h.Kit.stats.frame(16);
  clock.now = 2000; h.Kit.stats.round('L2');
  clock.now = 3000; h.Kit.stats.end('win', 5);
  h.Kit.stats.tutorial('start'); h.Kit.audio.toggleMute();
  clock.now = 3500; h.window.emit('keydown', {code: 'KeyB', timeStamp: 3499});
  clock.now = 5000; runTimers(h); h.window.emit('blur'); h.window.emit('pagehide');
}

test('v2: nothing is posted for telemetry while it is unset or false, before ready, standalone or after a failure', () => {
  const run = (setup, options = {}) => {
    const clock = {now: 0}, h = harness({clock, ...options});
    setup(h);
    session(h, clock);
    return h;
  };
  const unset = run(h => h.Kit.ready());
  assert.ok(statsOf(unset).length >= 4);
  for (const telemetry of [false, 'true', 1, null, {}]) {
    const h = run(h => { h.Kit.ready(); preferences(h, {telemetry}); });
    assert.deepEqual(telemetryOf(h), [], String(telemetry));
    assert.deepEqual(h.sent, unset.sent, 'v1 is unchanged');
  }
  const notReady = run(h => preferences(h, {telemetry: true}));
  assert.deepEqual(notReady.sent, [], 'nothing before Kit.ready()');
  const standalone = run(h => { h.Kit.ready(); preferences(h, {telemetry: true}); }, {embedded: false});
  assert.deepEqual(standalone.sent, [], 'a standalone game never posts');
  const failed = run(h => { h.Kit.ready(); preferences(h, {telemetry: true}); h.Kit.fail('boom'); });
  assert.deepEqual(telemetryOf(failed), [], 'nothing after a failure');
  const on = run(h => { h.Kit.ready(); preferences(h, {telemetry: true}); });
  assert.ok(telemetryOf(on).length > 0);
  assert.deepEqual(statsOf(on), statsOf(unset), 'sg:stats version 1 is byte-for-byte the same with telemetry on');
  assert.deepEqual(on.delays, [10000, 10000], 'no new timers');
  // Switching telemetry off drops what waits and stops collecting.
  const clock = {now: 0}, h = harness({clock});
  h.Kit.ready(); preferences(h, {telemetry: true});
  h.window.emit('keydown', {code: 'KeyA', timeStamp: -1}); clock.now = 10; h.window.emit('keydown', {code: 'KeyA', timeStamp: 5});
  preferences(h, {telemetry: false}); h.Kit.track.hit(); h.Kit.stats.round('L1');
  preferences(h, {telemetry: true}); runTimers(h);
  assert.deepEqual(telemetryOf(h), []);
});

test('v2: sg:telemetry follows sg:stats with the same e and f, round starts and ends, hits, misses and reaction times', () => {
  const clock = {now: 0}, h = harness({clock});
  h.Kit.ready(); preferences(h, {telemetry: true});
  h.Kit.track.tier(3);
  clock.now = 1000; h.window.emit('keydown', {code: 'KeyA', timeStamp: 995});      // latency 5 ms
  clock.now = 2000; h.Kit.stats.round('L1');
  h.Kit.track.hit(); h.Kit.track.hit(); h.Kit.track.miss();
  h.Kit.track.cue();
  clock.now = 2450; h.window.emit('keydown', {code: 'Space', timeStamp: 2440});    // reaction 450 ms, latency 10 ms
  h.Kit.track.cue();
  clock.now = 2600; h.window.emit('keydown', {code: 'Space', timeStamp: 2600, repeat: true}); // repeats count neither
  clock.now = 3900; h.window.emit('pointerdown', {button: 0, timeStamp: 3860});     // reaction 1450 ms, latency 40 ms
  h.window.emit('pointerdown', {button: 0, timeStamp: 3899});                       // no cue left; latency 1 ms
  for (const ms of [120, 2000, -1, NaN, Infinity, '300', null, undefined, {}]) h.Kit.track.react(ms);
  h.Kit.track.tier(4);
  clock.now = 5000; h.Kit.stats.round('L2');                                         // L1 becomes a quit
  h.Kit.stats.frame(16); h.Kit.stats.frame(40); h.Kit.track.miss();
  clock.now = 6000; h.Kit.stats.end('lose');
  h.Kit.stats.round('L3');
  clock.now = 7000; h.Kit.stats.end('win', 120); h.Kit.stats.end('draw', 3);
  h.Kit.stats.round('L4');
  clock.now = 8000; h.Kit.stats.end('draw', -5);
  runTimers(h);                                                                      // nothing new
  h.window.emit('keydown', {code: 'KeyA', timeStamp: 7900});                         // only the latency changes
  runTimers(h);
  const v1 = (e, r, o, f = [0, 0, 0, 0]) => ({type: 'sg:stats', version: 1, e, f, m: 0, r, o, om: 0});
  const v2 = (e, il, ev, f = [0, 0, 0, 0]) => ({type: 'sg:telemetry', version: 2, e, f, il, ev});
  assert.deepEqual(h.sent.slice(1), [
    v1(1000, [['s', 'L1']], 'L1'),
    v2(1000, [1, 0, 0, 0, 0, 0], [['rs', 'L1', 3]]),
    v1(3000, [['q', 'L1', 3000], ['s', 'L2']], 'L2'),
    v2(3000, [1, 1, 0, 1, 0, 0], [['re', 'q', 'L1', 3000, -1, 4, 2, 1, [1, 1, 0, 0, 1, 1]], ['rs', 'L2', 4]]),
    v1(1000, [['l', 'L2', 1000]], '', [1, 0, 1, 0]),
    v2(1000, zeros, [['re', 'l', 'L2', 1000, -1, 4, 0, 1, zeros]], [1, 0, 1, 0]),
    v1(0, [['s', 'L3']], 'L3'),
    v2(0, zeros, [['rs', 'L3', 4]]),
    v1(1000, [['w', 'L3', 1000, 120]], ''),
    v2(1000, zeros, [['re', 'w', 'L3', 1000, 120, 4, 0, 0, zeros]]),
    v1(0, [['s', 'L4']], 'L4'),
    v2(0, zeros, [['rs', 'L4', 4]]),
    v1(1000, [['d', 'L4', 1000, -5]], ''),
    v2(1000, zeros, [['re', 'd', 'L4', 1000, -1, 4, 0, 0, zeros]]),
    v2(0, [0, 0, 0, 0, 0, 1], [])
  ]);
  assert.deepEqual(h.clones, h.sent, 'every message survives structured cloning');
  for (const [i, m] of h.sent.entries()) {
    if (m.type !== 'sg:telemetry') continue;
    assert.deepEqual(Object.keys(m), ['type', 'version', 'e', 'f', 'il', 'ev']);
    const before = h.sent[i - 1];
    if (before.type === 'sg:stats') assert.deepEqual([m.e, m.f], [before.e, before.f], 'the same deltas as the sg:stats just before');
  }
  assert.deepEqual(h.delays, [10000, 10000, 10000]);
});

test('v2: input latency is performance.now() minus the event time, only for a valid time within 0..1000 ms', () => {
  const clock = {now: 5000}, h = harness({clock});
  h.Kit.ready(); preferences(h, {telemetry: true});
  const press = timeStamp => h.window.emit('keydown', {code: 'KeyA', timeStamp});
  for (const ms of [0, 7.9, 8, 15.9, 16, 32.9, 33, 49.9, 50, 99.9, 100, 1000]) press(5000 - ms);
  for (const t of [5000.5, 3999.5, 0, -5, NaN, Infinity, -Infinity, undefined, null, '4990', {valueOf() { return 4990; }}]) press(t);
  h.window.emit('keydown', {code: 'KeyA', timeStamp: 4990, repeat: true});
  h.window.emit('pointerdown', {button: 0, timeStamp: 4980});
  runTimers(h);
  assert.deepEqual(telemetryOf(h), [{type: 'sg:telemetry', version: 2, e: 0, f: [0, 0, 0, 0], il: [2, 2, 3, 2, 2, 2], ev: []}],
    'buckets < 8, < 16, < 33, < 50, < 100 and the rest; posted even with nothing for sg:stats');
  assert.deepEqual(statsOf(h), []);
  // Without window.performance there is no latency.
  const plain = harness();
  plain.Kit.ready(); preferences(plain, {telemetry: true});
  plain.window.emit('keydown', {code: 'KeyA', timeStamp: 1}); plain.Kit.stats.round('L1');
  assert.deepEqual(telemetryOf(plain).map(m => m.il), [zeros]);
});

test('v2: Kit.track counts nothing before Kit.ready(), clears a cue on pause and keeps the latest valid tier', () => {
  const clock = {now: 0}, h = harness({clock});
  preferences(h, {telemetry: true});
  h.Kit.track.tier(2);
  h.Kit.stats.round('L1'); h.Kit.track.hit(); h.Kit.track.miss(); h.Kit.track.cue(); h.Kit.track.react(100);
  clock.now = 100; h.window.emit('keydown', {code: 'KeyA', timeStamp: 90});
  h.Kit.ready();
  for (const n of [-1, 10, NaN, Infinity, '3', null, {}, Symbol('t')]) h.Kit.track.tier(n);
  h.Kit.track.cue(); h.window.emit('blur');
  clock.now = 900; h.window.emit('keydown', {code: 'KeyA'});
  clock.now = 1500; h.Kit.track.tier(7.8);
  h.Kit.stats.end('win');
  assert.deepEqual(telemetryOf(h).flatMap(m => m.ev), [['rs', 'L1', 2], ['re', 'w', 'L1', 600, -1, 7, 0, 0, zeros]],
    'no hits, misses or reaction times before readiness or across a pause');
  for (const call of ['hit', 'miss', 'cue', 'react', 'tier']) assert.doesNotThrow(() => h.Kit.track[call](Symbol('odd')));
});

test('v2: round events wait for Kit.ready() like v1 events, and go out at most 64 to a message', () => {
  const clock = {now: 0}, h = harness({clock});
  preferences(h, {telemetry: true});                      // the portal can switch telemetry on before readiness
  h.Kit.track.tier(1);
  for (let i = 0; i < 50; i++) h.Kit.stats.round('L1');
  h.Kit.stats.end('win', 9);
  assert.deepEqual(h.sent, []);
  h.Kit.ready();
  assert.deepEqual(h.sent, [{type: 'sg:ready', version: 1}]);
  runTimers(h);
  const expected = [['rs', 'L1', 1]];
  for (let i = 1; i < 50; i++) expected.push(['re', 'q', 'L1', 0, -1, 1, 0, 0, zeros], ['rs', 'L1', 1]);
  expected.push(['re', 'w', 'L1', 0, 9, 1, 0, 0, zeros]);
  assert.deepEqual(h.sent.slice(1).map(m => m.type), ['sg:stats', 'sg:telemetry', 'sg:telemetry']);
  assert.deepEqual(telemetryOf(h).map(m => m.ev.length), [64, 36]);
  assert.deepEqual(telemetryOf(h).flatMap(m => m.ev), expected);
  // Switching telemetry off before readiness drops the waiting events.
  const late = harness({clock});
  preferences(late, {telemetry: true}); late.Kit.stats.round('L1');
  preferences(late, {telemetry: false}); preferences(late, {telemetry: true});
  late.Kit.ready(); runTimers(late);
  assert.deepEqual(telemetryOf(late), []);
});

/* --------------------------------------------------------------- Kit.dda */
const results = (dda, outcomes) => outcomes.map(outcome => { dda.result(outcome); return dda.level; });

test('v2: Kit.dda seeds a new player from the age band or opts.start, without side effects', () => {
  for (const [band, level] of [['6-7', 0.12], ['8-9', 0.38], ['10-11', 0.6], ['', 0.35]]) {
    const h = harness();
    preferences(h, {band});
    assert.equal(h.Kit.dda('g').level, level, band);
  }
  const h = harness();
  preferences(h, {band: '6-7'});
  assert.equal(h.Kit.dda('g', {start: 0.9}).level, 0.9);
  assert.equal(h.Kit.dda('g', {start: 0}).level, 0);
  for (const start of [-0.1, 1.1, NaN, '0.5', null]) assert.equal(h.Kit.dda('g', {start}).level, 0.12);
  // A band that arrives after the controller was made still seeds it (no results yet).
  const late = harness(), dda = late.Kit.dda('g');
  assert.equal(dda.level, 0.35);
  preferences(late, {band: '10-11'});
  assert.equal(dda.level, 0.6);
  assert.deepEqual([[...late.values], late.delays, late.sent], [[], [], []], 'reading a controller stores, schedules and posts nothing');
});

test('v2: Kit.dda follows the update rule with mercy and hot streaks, clamps, and maps levels to tiers', () => {
  const h = harness(), dda = h.Kit.dda('g');
  assert.deepEqual(results(dda, [true, true, true, true, 0.5, false, false, false, 1, 0.95, 0.9, 0.2]),
    [0.4, 0.441, 0.54, 0.629, 0.606, 0.537, 0.382, 0.236, 0.259, 0.277, 0.327, 0.29],
    'step 0.18 / sqrt(1 + n / 2); the 3rd and 4th great tries add half a step; the 2nd and 3rd poor ones drop a step');
  assert.equal(dda.tier, 2);
  for (const odd of ['x', NaN, undefined, null, {}, Infinity, -Infinity, '1', Symbol('s')]) dda.result(odd);
  assert.equal(dda.level, 0.29, 'odd outcomes are ignored');
  assert.deepEqual(JSON.parse(h.values.get('sg:g:dda')), {_: {main: [0.29, 12]}}, 'n counts only real results');
  const high = h.Kit.dda('g', {id: 'hi', start: 0.98});
  assert.deepEqual(results(high, [7, 1, 1]), [1, 1, 1], 'clamped at 1; numbers above 1 count as 1');
  assert.equal(high.tier, 5);
  const low = h.Kit.dda('g', {id: 'lo', start: 0.05});
  assert.deepEqual(results(low, [-3, 0]), [0, 0], 'clamped at 0');
  assert.equal(low.tier, 1);
  // The step never falls below 0.03 (from about 70 results on).
  h.values.set('sg:g:dda', JSON.stringify({_: {late: [0.5, 100]}}));
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

test('v2: Kit.dda keeps one state per player, at most 16 players, reloads on player change and resets', () => {
  const h = harness(), dda = h.Kit.dda('g'), other = h.Kit.dda('g', {id: 'boss'});
  preferences(h, {band: '8-9', player: 'p1'});
  dda.result(true); other.result(false);
  const p1 = dda.level;
  assert.equal(p1, 0.43);
  preferences(h, {player: 'p2'});
  assert.equal(dda.level, 0.38, 'a new player starts from the seed');
  dda.result(false);
  preferences(h, {player: ''});
  assert.equal(dda.level, 0.38, 'a guest has its own state');
  preferences(h, {player: 'p1'});
  assert.equal(dda.level, p1, 'back to the first player');
  assert.deepEqual(JSON.parse(h.values.get('sg:g:dda')), {p1: {main: [0.43, 1], boss: [0.25, 1]}, p2: {main: [0.25, 1]}});
  for (let i = 3; i <= 20; i++) { preferences(h, {player: 'p' + i}); dda.result(true); }
  let saved = JSON.parse(h.values.get('sg:g:dda'));
  assert.deepEqual(Object.keys(saved), ['p5', 'p6', 'p7', 'p8', 'p9', 'p10', 'p11', 'p12', 'p13', 'p14', 'p15', 'p16', 'p17', 'p18', 'p19', 'p20']);
  preferences(h, {player: 'p5'}); dda.result(true);
  preferences(h, {player: 'p21'}); dda.result(true);
  saved = JSON.parse(h.values.get('sg:g:dda'));
  assert.deepEqual([Object.keys(saved).length, Object.keys(saved)[0], Object.keys(saved).slice(-2)], [16, 'p7', ['p5', 'p21']], 'the least recently saved player is dropped');
  preferences(h, {player: 'p5'});
  assert.equal(dda.level, 0.471, 'p5 kept both results');
  dda.reset();
  assert.equal(dda.level, 0.38, 'reset returns to the seed');
  assert.equal(JSON.parse(h.values.get('sg:g:dda')).p5.main, undefined);
  // Damaged or foreign saved data never breaks the controller.
  for (const raw of ['not json', '"text"', '[1,2]', '{"p5":{"main":[2,5]}}', '{"p5":{"main":[0.5,0]}}', '{"p5":{"main":"x"}}', '{"p5":7}', '{"p5":[0.5,3]}', 'null']) {
    const fresh = harness({stored: {'sg:g:dda': raw}});
    preferences(fresh, {player: 'p5'});
    const d = fresh.Kit.dda('g');
    assert.equal(d.level, 0.35, raw);
    assert.doesNotThrow(() => d.result(true), raw);
    assert.equal(d.level, 0.4, raw);
    // An array where an object belongs would drop every later save in JSON.
    assert.deepEqual(JSON.parse(fresh.values.get('sg:g:dda')).p5, {main: [0.4, 1]}, 'the result is saved: ' + raw);
  }
  // A huge saved count (beyond int32) keeps the smallest step instead of a NaN level.
  const huge = harness({stored: {'sg:g:dda': JSON.stringify({_: {main: [0.5, 3e9]}})}}), big = huge.Kit.dda('g');
  big.result(true);
  assert.deepEqual([big.level, big.tier, big.pick(['a', 'b', 'c', 'd', 'e'])], [0.508, 3, 'c']);
  const blocked = harness();
  blocked.window.localStorage.setItem = () => { throw new Error('blocked'); };
  const b = blocked.Kit.dda('g');
  b.result(true);
  assert.equal(b.level, 0.4, 'a failed write keeps the level in memory');
});

test('v2: every read of dda.tier reports it to Kit.track.tier for the round events', () => {
  const h = harness();
  h.Kit.ready(); preferences(h, {telemetry: true, band: '10-11'});
  const dda = h.Kit.dda('g', {tiers: 5});
  assert.equal(dda.tier, 3);
  h.Kit.stats.round('L1');
  dda.result(true);
  dda.pick([1, 2, 3, 4, 5]);
  h.Kit.stats.end('win');
  assert.deepEqual(telemetryOf(h).flatMap(m => m.ev).map(event => event[0] === 'rs' ? event[2] : event[5]), [3, 4]);
  // A game that reads only level or value() still reports its tier (0 means "no DDA").
  for (const read of [d => d.level, d => d.value(1, 2)]) {
    const g = harness();
    g.Kit.ready(); preferences(g, {telemetry: true, band: '10-11'});
    read(g.Kit.dda('g'));
    g.Kit.stats.round('L1'); g.Kit.stats.end('win');
    assert.deepEqual(telemetryOf(g).flatMap(m => m.ev).map(event => event[0] === 'rs' ? event[2] : event[5]), [3, 3], String(read));
  }
});

test('v2: a cue is answered only by a click or a key the game accepts, and switching telemetry off drops it', () => {
  const clock = {now: 0}, h = harness({clock});
  h.Kit.ready(); preferences(h, {telemetry: true});
  h.Kit.stats.round('L1'); h.Kit.track.cue();
  const button = {closest: selector => selector.includes('button') ? button : null};
  const rejected = [{code: 'ControlLeft', ctrlKey: true}, {code: 'AltLeft', altKey: true}, {code: 'MetaLeft', metaKey: true},
    {code: 'KeyA', isComposing: true}, {code: 'Tab'}, {code: 'Enter', target: button}];
  for (const [i, key] of rejected.entries()) { clock.now = 100 + i; h.window.emit('keydown', {timeStamp: clock.now - 1, ...key}); }
  clock.now = 900; h.window.emit('keydown', {code: 'Space', timeStamp: 899});        // 900 ms
  h.Kit.track.cue(); clock.now = 1000; h.window.emit('pointerdown', {button: 0, timeStamp: 999}); // 100 ms
  runTimers(h);
  h.Kit.track.cue(); preferences(h, {telemetry: false});
  clock.now = 9000; preferences(h, {telemetry: true}); h.window.emit('pointerdown', {button: 0, timeStamp: 8999});
  h.Kit.stats.end('win');
  const [re] = telemetryOf(h).flatMap(m => m.ev).filter(event => event[0] === 're');
  assert.deepEqual(re[8], [1, 0, 0, 1, 0, 0], 'rejected keys and a cue from before telemetry went off are not timed');
  assert.deepEqual(telemetryOf(h).reduce((sum, m) => sum.map((n, i) => n + m.il[i]), zeros), [9, 0, 0, 0, 0, 0], 'every press still counts for input latency');
});
