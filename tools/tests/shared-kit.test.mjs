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

/* ----------------------------------------------------- play statistics */
// docs/TELEMETRY.md "Kit": Kit.stats, Kit.track and sg:telemetry version 2, posted only
// while the portal says its anonymous statistics sender is on.
const telemetryOf = h => h.sent.filter(m => m && m.type === 'sg:telemetry');
const eventsOf = h => telemetryOf(h).flatMap(m => m.ev);
const preferences = (h, data, source = h.window.parent) => h.window.emit('message', {source, data: {type: 'sg:preferences', ...data}});
const zeros = [0, 0, 0, 0, 0, 0];
// Runs each timer scheduled so far once; timers they schedule wait for the next call.
function runTimers(h) {
  h.timers.forEach((fn, i) => { if (fn) { h.timers[i] = null; fn(); } });
}
const pending = h => h.timers.filter(Boolean).length;
// A ready game whose portal says the sender is on.
function on(options = {}) {
  const clock = options.clock || {now: 0}, h = harness({clock, ...options});
  h.Kit.ready(); preferences(h, {telemetry: true});
  return {h, clock};
}
const pauses = {
  blur: h => h.window.emit('blur'),
  hidden: h => { h.document.hidden = true; h.document.emit('visibilitychange'); h.document.hidden = false; h.document.emit('visibilitychange'); },
  'portal-escape': h => h.window.emit('keydown', {code: 'Tab', shiftKey: true}),
  portal: h => h.window.emit('message', {source: h.window.parent, data: {type: 'sg:pause', reason: 'portal'}}),
  'fullscreen-exit': h => { h.document.fullscreenElement = {}; h.document.emit('fullscreenchange'); h.document.fullscreenElement = null; h.document.emit('fullscreenchange'); },
  pagehide: h => h.window.emit('pagehide', {persisted: true})
};

// One session with every input: presses and clicks with event times, hits, misses, a
// cue, explicit reaction times, a tier, rounds, a quit, an end, a tutorial and pauses.
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

test('without the portal\'s telemetry: true Kit sends nothing but readiness, warnings and the portal hand-off, and starts no timer', () => {
  const run = (setup, options = {}) => {
    const clock = {now: 0}, raf = [], h = harness({clock, raf, ...options});
    setup(h);
    h.Kit.loop(() => {}, () => {});
    for (let i = 0; i < 5; i++) { clock.now += 16; raf.shift()?.(clock.now); }
    session(h, clock);
    h.window.emit('keydown', {code: 'Tab', shiftKey: true});
    return h;
  };
  for (const [name, setup, options] of [
    ['the portal never says', h => h.Kit.ready()],
    ['an older portal sends preferences without it', h => { h.Kit.ready(); preferences(h, {quiet: false}); }],
    ['told false', h => { h.Kit.ready(); preferences(h, {telemetry: false}); }],
    ['told true by another window', h => { h.Kit.ready(); preferences(h, {telemetry: true}, {}); }],
    ['told something that is not true', h => { h.Kit.ready(); for (const telemetry of ['true', 1, null, {}]) preferences(h, {telemetry}); }],
    ['told true before readiness, never ready', h => preferences(h, {telemetry: true})],
    ['told true, then the game failed', h => { h.Kit.ready(); preferences(h, {telemetry: true}); h.Kit.fail('boom'); }],
    ['standalone', h => { h.Kit.ready(); preferences(h, {telemetry: true}); }, {embedded: false}]
  ]) {
    const h = run(setup, options);
    assert.deepEqual(telemetryOf(h), [], name + ': no statistics');
    assert.deepEqual([...new Set(h.sent.map(m => m.type || m))].filter(t => !['sg:ready', 'sg:focus-portal', 'sg:error'].includes(t)), [], name);
    // A game that failed after its timer started stops the chain at the next tick.
    if (name.includes('failed')) assert.equal(pending(h), 0, name + ': no timer left');
    else assert.deepEqual(h.delays, [], name + ': no timers of its own');
  }
  // Told off, Kit drops what waited and counts nothing more: telling it on later sends
  // nothing from before.
  const clock = {now: 0}, h = harness({clock});
  h.Kit.ready();
  h.Kit.stats.round('L1'); h.Kit.track.hit();
  h.window.emit('keydown', {code: 'KeyA', timeStamp: -1}); clock.now = 10; h.window.emit('keydown', {code: 'KeyA', timeStamp: 5});
  preferences(h, {telemetry: false}); h.Kit.track.hit(); h.Kit.stats.end('win'); h.Kit.stats.round('L2');
  preferences(h, {telemetry: true}); runTimers(h);
  assert.deepEqual(eventsOf(h).filter(ev => ev[0] !== 'rs'), [], 'nothing from while it was off');
  assert.ok(telemetryOf(h).every(m => m.il.every(n => n === 0)));
});

test('telemetry: round starts and ends, hits, misses, reaction times, input latency and the counters', () => {
  const {h, clock} = on();
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
  const v2 = (e, il, ev, f = [0, 0, 0, 0]) => ({type: 'sg:telemetry', version: 2, e, f, il, ev});
  assert.deepEqual(h.sent.slice(1), [
    v2(1000, [1, 0, 0, 0, 0, 0], [['rs', 'L1', 3]]),
    // rx before each end: wall ms, inputs (the key repeat aside), idle lapses, pauses,
    // the reaction-time sum and count (450 + 1450 + 120 + 2000 ms) and the DDA level (none).
    v2(3000, [1, 1, 0, 1, 0, 0], [['rx', 3000, 3, 0, 0, 4020, 4, -1], ['re', 'q', 'L1', 3000, -1, 4, 2, 1, [1, 1, 0, 0, 1, 1]], ['rs', 'L2', 4]]),
    v2(1000, zeros, [['rx', 1000, 0, 0, 0, 0, 0, -1], ['re', 'l', 'L2', 1000, -1, 4, 0, 1, zeros]], [1, 0, 1, 0]),
    v2(0, zeros, [['rs', 'L3', 4]]),
    v2(1000, zeros, [['rx', 1000, 0, 0, 0, 0, 0, -1], ['re', 'w', 'L3', 1000, 120, 4, 0, 0, zeros]]),
    v2(0, zeros, [['rs', 'L4', 4]]),
    v2(1000, zeros, [['rx', 1000, 0, 0, 0, 0, 0, -1], ['re', 'd', 'L4', 1000, -1, 4, 0, 0, zeros]]),
    v2(0, [0, 0, 0, 0, 0, 1], [])
  ]);
  assert.deepEqual(h.clones, h.sent, 'every message survives structured cloning');
  assert.deepEqual(h.delays, [10000, 10000, 10000], 'one timer chain');
});

test('telemetry: key presses and clicks open 20 s engaged windows that merge; moves, the wheel and busy() only extend them', () => {
  const {h, clock} = on({clock: {now: 1000}});
  const key = () => h.window.emit('keydown', {code: 'KeyA'}), e = () => telemetryOf(h).reduce((sum, m) => sum + m.e, 0);
  h.window.emit('pointermove'); h.window.emit('wheel'); h.Kit.stats.busy();
  clock.now = 9000; h.Kit.stats.round('L1');
  assert.equal(e(), 0, 'moves, the wheel and busy() never open a window');
  key();                                                          // open until 29 000
  clock.now = 19000; h.window.emit('pointermove');                // until 39 000
  clock.now = 30000; h.window.emit('wheel');                      // until 50 000
  clock.now = 45000; h.Kit.stats.busy();                          // until 65 000
  clock.now = 90000; h.window.emit('pointermove'); h.Kit.stats.busy(); // closed: no effect
  clock.now = 100000; h.window.emit('pointerdown', {button: 0});  // a new window until 120 000
  clock.now = 104000; key();                                      // overlapping windows merge: until 124 000
  clock.now = 110000; h.Kit.stats.end('win');
  assert.equal(e(), 56000 + 10000);
  assert.equal(eventsOf(h).at(-1)[3], 66000, 'the round\'s engaged ms');
  // A key press or click in the round after its window lapsed is an idle lapse.
  assert.equal(eventsOf(h).find(ev => ev[0] === 'rx')[3], 1, 'one idle lapse (the click at 100 s)');
  clock.now = 200000; key();
  clock.now = 260000; h.Kit.stats.round('L2');
  assert.equal(e(), 66000 + 14000 + 20000, 'each window ends 20 s after its last input');
});

test('telemetry: every pause and pagehide cuts the window at once, posts, and disarms until a key press or click', () => {
  for (const [reason, pause] of Object.entries(pauses)) {
    const {h, clock} = on({clock: {now: 5000}});
    h.Kit.stats.round('main'); h.sent.length = 0;
    h.window.emit('pointerdown', {button: 0});
    clock.now = 8000; pause(h);
    assert.deepEqual(telemetryOf(h).map(m => m.e), [3000], reason);
    clock.now = 9000; h.window.emit('pointermove'); h.window.emit('wheel'); h.Kit.stats.busy(); h.Kit.stats.frame(16);
    clock.now = 20000; runTimers(h);
    assert.equal(telemetryOf(h).length, 1, `${reason}: a disarmed game counts nothing for mouse moves, the wheel or busy()`);
    h.window.emit('keydown', {code: 'Space'});                    // armed again: open until 40 000
    clock.now = 21000; h.window.emit('pointermove');              // until 41 000
    clock.now = 30000; h.Kit.stats.end('lose');
    assert.deepEqual(eventsOf(h).at(-1).slice(0, 4), ['re', 'l', 'main', 13000], reason);
    assert.equal(telemetryOf(h).at(-1).e, 10000, reason);
  }
});

test('telemetry: frames count only while engaged and in a round, never the first frame after start or show', () => {
  const clock = {now: 1000}, raf = [], {h} = on({clock, raf});
  let updates = 0;
  h.Kit.loop(() => updates++, () => {});
  const frame = ms => { clock.now += ms; raf.splice(0).forEach(fn => fn(clock.now)); };
  const counted = () => { runTimers(h); return telemetryOf(h).reduce((sum, m) => sum.map((n, i) => n + m.f[i]), [0, 0, 0, 0]); };
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

test('telemetry: one 10 s timer chain, only while ready and on, that stops after a failure or when told off', () => {
  const clock = {now: 0}, h = harness({clock});
  h.Kit.stats.round('L1');
  preferences(h, {telemetry: true});
  assert.equal(h.timers.length, 0, 'no timer at load or before Kit.ready()');
  h.Kit.ready(); h.Kit.ready();
  for (let i = 0; i < 3; i++) { h.window.emit('message', {source: h.window.parent, data: {type: 'sg:request-ready'}}); preferences(h, {telemetry: true}); }
  assert.deepEqual([pending(h), h.delays], [1, [10000]]);
  assert.deepEqual(telemetryOf(h), [], 'Kit.ready() itself never posts statistics');
  runTimers(h);
  assert.deepEqual(eventsOf(h), [['rs', 'L1', 0]], 'the timer posts what waited for readiness');
  runTimers(h);
  assert.equal(telemetryOf(h).length, 1, 'no post without unsent data');
  assert.deepEqual([pending(h), h.delays], [1, [10000, 10000, 10000]], 'each tick schedules exactly one more');
  h.window.emit('keydown', {code: 'KeyA'}); clock.now = 5000;
  const before = h.sent.length;
  h.window.emit('error', {message: 'boom'});
  assert.deepEqual(h.sent.slice(before).map(m => m.type), ['sg:warn'], 'a runtime warning posts no statistics');
  assert.equal(pending(h), 1, 'one warning does not stop the timer');
  h.Kit.fail('boom');
  assert.equal(h.sent.at(-1).type, 'sg:error', 'Kit.fail posts no statistics');
  runTimers(h);
  assert.equal(pending(h), 0, 'the chain stops after a failure');
  assert.equal(h.sent.at(-1).type, 'sg:error');
  // Told off: the timer is cleared at once.
  const off = on().h;
  assert.equal(pending(off), 1);
  preferences(off, {telemetry: false});
  assert.equal(pending(off), 0);
});

test('telemetry: a round still open when the page goes away ends as a quit, unless the page is kept in the back-forward cache', () => {
  const {h, clock} = on();
  h.Kit.track.tier(2);
  clock.now = 1000; h.Kit.stats.round('L1');
  h.Kit.track.hit();
  clock.now = 4000; h.window.emit('pagehide', {persisted: true});                  // kept: no quit yet
  clock.now = 5000; h.window.emit('keydown', {code: 'KeyA'});
  h.Kit.track.miss();
  clock.now = 9000; h.window.emit('pagehide', {persisted: false});                 // gone: a quit
  assert.deepEqual(eventsOf(h), [['rs', 'L1', 2], ['rx', 8000, 1, 0, 0, 0, 0, -1], ['re', 'q', 'L1', 4000, -1, 2, 1, 1, zeros]]);
  h.window.emit('pagehide', {persisted: false}); h.Kit.stats.end('win');
  assert.equal(eventsOf(h).length, 3, 'nothing more for that round');
});

test('telemetry: input latency is performance.now() minus the event time, only for a valid time within 0..1000 ms', () => {
  const {h} = on({clock: {now: 5000}});
  const press = timeStamp => h.window.emit('keydown', {code: 'KeyA', timeStamp});
  for (const ms of [0, 7.9, 8, 15.9, 16, 32.9, 33, 49.9, 50, 99.9, 100, 1000]) press(5000 - ms);
  for (const t of [5000.5, 3999.5, 0, -5, NaN, Infinity, -Infinity, undefined, null, '4990', {valueOf() { return 4990; }}]) press(t);
  h.window.emit('keydown', {code: 'KeyA', timeStamp: 4990, repeat: true});
  h.window.emit('pointerdown', {button: 0, timeStamp: 4980});
  runTimers(h);
  assert.deepEqual(telemetryOf(h).map(m => m.il), [[2, 2, 3, 2, 2, 2]], 'buckets < 8, < 16, < 33, < 50, < 100 and the rest');
  // Without window.performance there is no latency.
  const plain = harness();
  plain.Kit.ready(); preferences(plain, {telemetry: true});
  plain.window.emit('keydown', {code: 'KeyA', timeStamp: 1}); plain.Kit.stats.round('L1');
  assert.deepEqual(telemetryOf(plain).map(m => m.il), [zeros]);
});

test('telemetry: Kit.track keeps the latest valid tier, a pause clears a cue, and a cue is answered only by a click or a key the game accepts', () => {
  const {h, clock} = on();
  h.Kit.track.tier(2);
  h.Kit.stats.round('L1');
  for (const n of [-1, 10, NaN, Infinity, '3', null, {}, Symbol('t')]) h.Kit.track.tier(n);
  h.Kit.track.cue(); h.window.emit('blur');
  clock.now = 900; h.window.emit('keydown', {code: 'KeyA'});
  h.Kit.track.cue();
  clock.now = 1000; h.window.emit('keydown', {code: 'KeyB', ctrlKey: true});      // not a game key
  clock.now = 1100; h.window.emit('keydown', {code: 'KeyC', isComposing: true});  // not a game key
  clock.now = 1200; h.window.emit('keydown', {code: 'KeyD'});                     // 300 ms
  clock.now = 1500; h.Kit.track.tier(7.8);
  h.Kit.stats.end('win');
  const rx = eventsOf(h).find(ev => ev[0] === 'rx'), re = eventsOf(h).at(-1);
  assert.deepEqual([rx[5], rx[6], re[5], re[8]], [300, 1, 7, [0, 1, 0, 0, 0, 0]]);
  for (const call of ['hit', 'miss', 'cue', 'react', 'tier']) assert.doesNotThrow(() => h.Kit.track[call](Symbol('odd')));
});

test('telemetry: rx counts one pause per stop of play: a blur with the hidden page after it, or both fullscreen exits, are one', () => {
  const {pagehide, ...each} = pauses;
  const stops = {
    ...each,
    'a tab switch (blur, then hidden)': h => { h.window.emit('blur'); h.document.hidden = true; h.document.emit('visibilitychange'); h.document.hidden = false; },
    'Shift+Tab, then the blur as the portal takes the focus': h => { each['portal-escape'](h); h.window.emit('blur'); },
    'leaving fullscreen (Kit\'s own, then the portal\'s sg:pause)': h => {
      each['fullscreen-exit'](h);
      h.window.emit('message', {source: h.window.parent, data: {type: 'sg:pause', reason: 'fullscreen-exit'}});
    }
  };
  for (const [name, pause] of Object.entries(stops)) {
    const {h, clock} = on({clock: {now: 1000}});
    h.Kit.stats.round('L1');
    pause(h);                                                     // before any input: play was running
    clock.now = 2000; h.window.emit('keydown', {code: 'Space'});
    clock.now = 3000; pause(h);
    h.window.emit('blur');                                        // already paused: no input since
    clock.now = 4000; h.window.emit('pointerdown', {button: 0});
    clock.now = 5000; pause(h);
    h.Kit.stats.end('win');
    const rx = eventsOf(h).find(ev => ev[0] === 'rx');
    assert.equal(rx[4], 3, `${name}: ${JSON.stringify(rx)}`);
  }
});

test('telemetry: a round\'s wall time always covers its engaged time, wherever a millisecond turns between two clock reads', () => {
  for (let step = 0.05; step < 1; step += 0.05) for (let start = 0; start < 1; start += 0.1) {
    let t = 1000 + start;
    const h = harness({clock: {get now() { return t += step; }}});
    preferences(h, {telemetry: true});
    h.Kit.ready();
    h.window.emit('pointerdown', {button: 0});
    h.Kit.stats.round('local');
    for (let i = 0; i < 4; i++) h.window.emit('pointerdown', {button: 0});
    h.Kit.stats.end('e');
    const ev = eventsOf(h), rx = ev.find(e => e[0] === 'rx'), re = ev.find(e => e[0] === 're');
    assert.ok(rx[1] >= re[3], `step ${step.toFixed(2)}, start ${start.toFixed(1)}: wall ${rx[1]} ms, engaged ${re[3]} ms`);
  }
});

test('telemetry: round events made before readiness or before the portal says wait, at most 400, and go out at most 64 to a message', () => {
  const clock = {now: 0}, h = harness({clock});
  h.Kit.track.tier(1);
  for (let i = 0; i < 50; i++) h.Kit.stats.round('L1');
  h.Kit.stats.end('win', 9);
  h.Kit.ready();
  assert.deepEqual(h.sent, [{type: 'sg:ready', version: 1}], 'nothing until the portal says');
  preferences(h, {telemetry: true});
  runTimers(h);
  const expected = [['rs', 'L1', 1]], rx = ['rx', 0, 0, 0, 0, 0, 0, -1];
  for (let i = 1; i < 50; i++) expected.push(rx, ['re', 'q', 'L1', 0, -1, 1, 0, 0, zeros], ['rs', 'L1', 1]);
  expected.push(rx, ['re', 'w', 'L1', 0, 9, 1, 0, 0, zeros]);
  assert.deepEqual(telemetryOf(h).map(m => m.ev.length), [64, 64, 22]);
  assert.deepEqual(eventsOf(h), expected);
  // A page whose portal never says keeps at most 400 events.
  const quiet = harness({clock});
  quiet.Kit.ready();
  for (let i = 0; i < 300; i++) quiet.Kit.stats.round('L1');
  preferences(quiet, {telemetry: true}); runTimers(quiet);
  const kept = eventsOf(quiet);
  assert.equal(kept.length, 400);
  assert.ok(kept.every((ev, i) => ev[0] !== 'rx' || kept[i + 1][0] === 're'), 'an rx and its re go in together');
});

test('telemetry: every read of a Kit.dda controller reports its tier and level for the round events', () => {
  const {h} = on();
  const dda = h.Kit.dda('g', {start: 0.6, tiers: 4});
  h.Kit.stats.round('a');
  h.Kit.stats.end('end');
  assert.deepEqual(eventsOf(h).slice(-2)[0].at(-1), -1, 'no DDA level before the first read');
  dda.tier;
  h.Kit.stats.round('b'); h.Kit.stats.end('win');
  dda.result(true);
  const low = h.Kit.dda('g', {id: 'low', start: 0.1});
  low.value(1, 2);
  h.Kit.stats.round('c'); h.Kit.stats.end('win');
  const ev = eventsOf(h), starts = ev.filter(e => e[0] === 'rs'), extras = ev.filter(e => e[0] === 'rx');
  assert.deepEqual(starts.map(e => e[2]), [0, 3, 1], 'the tier of the last read');
  assert.deepEqual(extras.map(e => e[7]), [-1, 600, 100], 'the level in thousandths of the last read, sticky until the next');
});

test('telemetry: tutorial start and done go once per page; any other step is ignored', () => {
  const {h} = on();
  for (const step of ['start', 'start', 'done', 'middle', 'Start', '', null, {}, 'done']) h.Kit.stats.tutorial(step);
  runTimers(h);
  assert.deepEqual(eventsOf(h), [['tu', 's'], ['tu', 'd']]);
});

test('telemetry: every call is safe with any argument, and every payload survives JSON and structured cloning', () => {
  const {h, clock} = on();
  const odd = [undefined, null, true, 0, -1, NaN, Infinity, '', 'L1', 'win', {}, [], [1, 2], Object.create(null), Symbol('s'), () => 1, 10n, {toString() { throw new Error('odd'); }}];
  const calls = () => {
    for (const a of odd) for (const b of odd) { h.Kit.stats.round(a); h.Kit.stats.end(a, b); h.Kit.stats.tutorial(a); h.Kit.stats.busy(a); h.Kit.stats.frame(a); }
  };
  assert.doesNotThrow(calls);
  h.window.emit('keydown', {code: 'KeyA'}); clock.now = 500;
  assert.doesNotThrow(() => { calls(); runTimers(h); h.window.emit('blur'); });
  assert.ok(telemetryOf(h).length > 1);
  assert.deepEqual(h.clones, h.sent, 'structured clones match the JSON copies');
  for (const m of telemetryOf(h)) {
    assert.deepEqual(Object.keys(m), ['type', 'version', 'e', 'f', 'il', 'ev']);
    assert.ok(m.ev.length <= 64);
    assert.ok(m.ev.every(e => ['rs', 'rx', 're', 'tu'].includes(e[0]) && e.slice(1).every(v => typeof v === 'string' ? v.length <= 24 : Array.isArray(v) || Number.isFinite(v))));
  }
});
