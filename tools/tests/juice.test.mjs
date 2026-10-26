// shared/juice.js (docs/ARCHITECTURE.md "Juice") in a node:vm sandbox with a strict
// stand-in AudioContext that records every node, parameter event, start and stop.
// Node only; the sound itself is checked by ear and by rendering in Chromium.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../shared/juice.js', import.meta.url), 'utf8');
const kitSource = readFileSync(new URL('../../shared/kit.js', import.meta.url), 'utf8');
const SOUNDS = ['tap', 'select', 'back', 'toggle', 'error', 'hover', 'streak', 'impact', 'chime', 'coin', 'pop',
  'whoosh', 'jump', 'land', 'star', 'levelUp', 'fail', 'countdown'];
const LOW = ['tap', 'hover', 'streak', 'impact', 'coin', 'pop', 'whoosh', 'jump', 'land'];
const ODD = [undefined, null, NaN, -1, -Infinity, Infinity, 1e9, 0, 0.5, 1, 2, 3, 13, '2', true, false, {}, [], Symbol('odd'), () => 1, 10n];

// A stand-in for the Web Audio API that throws (and records) wherever a browser would
// throw, and a little more strictly: non-finite values, negative times, an exponential
// ramp to a value <= 0, unknown wave or filter types, a second start() or stop().
function audioApi() {
  const contexts = [], errors = [];
  const fail = (Kind, message) => { errors.push(message); throw new Kind(message); };
  const finite = (...values) => { if (!values.every(Number.isFinite)) fail(TypeError, 'non-finite ' + values.join(', ')); };
  class Param {
    constructor(value) { this.v = value; this.events = []; }
    get value() { return this.v; }
    set value(v) { finite(v); this.v = v; }
    add(kind, v, t, extra) { finite(v, t); if (t < 0) fail(RangeError, 'negative time'); this.events.push([kind, v, t].concat(extra ?? [])); return this; }
    setValueAtTime(v, t) { return this.add('set', v, t); }
    linearRampToValueAtTime(v, t) { return this.add('linear', v, t); }
    exponentialRampToValueAtTime(v, t) { if (!(v > 0)) fail(RangeError, 'exponential ramp to ' + v); return this.add('exp', v, t); }
    setTargetAtTime(v, t, c) { finite(c); return this.add('target', v, t, c); }
  }
  class Context {
    constructor() {
      this.currentTime = 0; this.sampleRate = 8000; this.state = 'running'; this.nodes = []; this.resumed = 0;
      this.destination = { kind: 'destination', outputs: [] };
      contexts.push(this);
    }
    node(kind, params, extra = {}) {
      const n = { kind, context: this, outputs: [], connect(target) { n.outputs.push(target); return target; }, disconnect() {}, ...extra };
      for (const [name, value] of Object.entries(params)) n[name] = new Param(value);
      this.nodes.push(n);
      return n;
    }
    source(kind, params, extra) {
      const n = this.node(kind, params, extra);
      n.start = (when = 0, offset = 0) => { finite(when, offset); if ('started' in n) fail(Error, 'started twice'); n.started = when; };
      n.stop = (when = 0) => { finite(when); if (!('started' in n) || 'stopped' in n) fail(Error, 'bad stop'); n.stopped = when; };
      return n;
    }
    createGain() { return this.node('gain', { gain: 1 }); }
    createDynamicsCompressor() { return this.node('compressor', { threshold: -24, knee: 30, ratio: 12, attack: 0.003, release: 0.25 }); }
    createBiquadFilter() {
      let type = 'lowpass';
      return this.node('filter', { frequency: 350, Q: 1, gain: 0 }, {
        get type() { return type; }, set type(v) { if (!['lowpass', 'highpass', 'bandpass'].includes(v)) fail(TypeError, 'filter ' + v); type = v; }
      });
    }
    createOscillator() {
      let type = 'sine';
      return this.source('oscillator', { frequency: 440, detune: 0 }, {
        get type() { return type; }, set type(v) { if (!['sine', 'triangle', 'square', 'sawtooth'].includes(v)) fail(TypeError, 'wave ' + v); type = v; }
      });
    }
    createBufferSource() { return this.source('buffer', { playbackRate: 1 }, { loop: false, buffer: null }); }
    createBuffer(channels, length, rate) {
      finite(channels, length, rate);
      const data = new Float32Array(length);
      return { length, sampleRate: rate, numberOfChannels: channels, getChannelData: () => data };
    }
    resume() { this.resumed++; const p = Promise.reject(new Error('not allowed yet')); this.caught = false; const c = p.catch.bind(p); p.catch = fn => { this.caught = true; return c(fn); }; return p; }
  }
  return { Context, contexts, errors };
}

// Portal mode: no Kit; window.Juice with its own context on the first gesture.
function portal({ stored = {}, audio = true } = {}) {
  const api = audioApi(), listeners = {}, values = new Map(Object.entries(stored));
  const window = {
    localStorage: { getItem: key => values.get(key) ?? null },
    addEventListener(type, fn, capture) { (listeners[type] ||= []).push({ fn, capture }); }
  };
  if (audio) window.AudioContext = api.Context;
  const emit = (type, event = {}) => (listeners[type] || []).forEach(l => l.fn(event));
  vm.runInNewContext(source, { window });
  return { ...api, window, listeners, values, emit, J: window.Juice };
}
// Game mode against a stand-in Kit.audio.
function game({ muted = false } = {}) {
  const api = audioApi(), ctx = new api.Context(), listeners = {};
  const master = ctx.createGain();
  master.gain.value = 0.5;
  const window = { Kit: { audio: { ctx: null, master: null, muted } }, addEventListener(type) { listeners[type] = true; } };
  vm.runInNewContext(source, { window });
  return { ...api, ctx, master, window, listeners, kit: window.Kit.audio, J: window.Kit.juice, attach() { Object.assign(window.Kit.audio, { ctx, master }); } };
}
const sources = ctx => ctx.nodes.filter(n => n.kind === 'oscillator' || n.kind === 'buffer');
// Calls every sound with every odd argument, each 30 ms after the last (past the dedupe).
function playAll(J, ctx, args = ODD) {
  for (const name of SOUNDS) for (const arg of args) { ctx.currentTime += 0.03; J[name](arg); }
}

test('juice: every documented sound exists and survives odd arguments without a single invalid audio call', () => {
  const h = portal();
  assert.deepEqual(Object.keys(h.J).sort(), [...SOUNDS, 'setQuiet'].sort(), 'exactly the documented API: no music, loop or play()');
  h.emit('pointerdown');
  const ctx = h.contexts[0];
  assert.doesNotThrow(() => playAll(h.J, ctx));
  assert.deepEqual(h.errors, [], 'no audio call a browser would reject');
  assert.ok(sources(ctx).length > SOUNDS.length * 10, 'the sounds really played');
  for (const fn of [h.J.setQuiet]) for (const arg of ODD) assert.doesNotThrow(() => fn(arg));
  for (const name of SOUNDS) assert.doesNotThrow(() => h.J[name].call(null, 1, 2, 3));
});

test('juice: every source is a one-shot that starts after a silent envelope start and stops within 1.5 s', () => {
  const h = portal();
  h.emit('keydown');
  const ctx = h.contexts[0];
  playAll(h.J, ctx, [undefined, 0, 0.5, 1, 2, 3, 40, -5, 1e9]);
  const all = sources(ctx);
  for (const s of all) {
    assert.ok(Number.isFinite(s.started) && Number.isFinite(s.stopped), s.kind + ' is started and stopped');
    assert.ok(s.stopped > s.started && s.stopped <= s.started + 1.5, `${s.kind} stops ${s.stopped - s.started} s after its start`);
    assert.ok(s.loop !== true, 'never loops');
    if (s.kind === 'buffer') assert.ok(s.buffer && s.buffer.length === ctx.sampleRate, 'noise uses the cached one-second buffer');
  }
  assert.equal(new Set(all.filter(s => s.kind === 'buffer').map(s => s.buffer)).size, 1, 'one noise buffer for the context');
  // Each voice gain starts silent, rises, and falls exponentially before its source stops.
  const bus = ctx.nodes.find(n => n.kind === 'compressor') && ctx.nodes.find(n => n.kind === 'gain' && n.outputs[0]?.kind === 'compressor');
  const voices = ctx.nodes.filter(n => n.kind === 'gain' && n.outputs[0] === bus);
  assert.equal(voices.length, all.length, 'one envelope per source, all on the juice bus');
  for (const g of voices) {
    const [first, attack, fall] = g.gain.events;
    assert.deepEqual([first[0], first[1], attack[0], fall[0], g.gain.events.length], ['set', 0, 'linear', 'exp', 3]);
    assert.ok(attack[1] > 0 && attack[1] <= 0.6 && fall[1] <= attack[1] / 999, 'falls about 60 dB');
  }
  const longest = Math.max(...all.map(s => s.stopped - s.started));
  assert.ok(longest <= 1.42, 'no source is longer than 1.42 s');
  assert.deepEqual(h.errors, []);
});

test('juice: bus -> limiter -> master, made once per context, with a fast first release', () => {
  const h = portal();
  h.emit('pointerdown'); h.emit('pointerdown'); h.emit('keydown');
  assert.equal(h.contexts.length, 1, 'one context, however many gestures');
  const ctx = h.contexts[0];
  ctx.currentTime = 2;
  h.J.tap(); ctx.currentTime += 0.1; h.J.select();
  const [master, bus] = ctx.nodes.filter(n => n.kind === 'gain');
  const limiters = ctx.nodes.filter(n => n.kind === 'compressor');
  assert.equal(limiters.length, 1);
  const [limit] = limiters;
  assert.deepEqual([master.gain.value, master.outputs], [0.5, [ctx.destination]]);
  assert.deepEqual([bus.outputs, limit.outputs], [[limit], [master]]);
  assert.deepEqual([limit.threshold.value, limit.knee.value, limit.ratio.value], [-6, 4, 12]);
  assert.deepEqual(limit.release.events, [['set', 0.002, 2], ['set', 0.25, 2.05]],
    'a new compressor starts fully turned down: a 2 ms release lets the first sounds through');
});

test('juice: the portal makes no AudioContext before a gesture and follows sg:site:muted and the classroom flag', () => {
  const h = portal();
  assert.deepEqual(Object.keys(h.listeners).sort(), ['keydown', 'pointerdown', 'storage']);
  assert.ok(h.listeners.pointerdown[0].capture && h.listeners.keydown[0].capture, 'gestures are caught in the capture phase');
  playAll(h.J, { currentTime: 0 });
  assert.equal(h.contexts.length, 0, 'nothing before the first gesture');
  h.emit('pointerdown');
  const ctx = h.contexts[0], count = () => ctx.nodes.length;
  const before = count();
  h.values.set('sg:site:muted', 'true');
  playAll(h.J, ctx);
  assert.equal(count(), before, 'muted: no audio nodes at all');
  h.emit('storage', { key: 'sg:site:muted' });
  const master = ctx.nodes[0];
  assert.deepEqual(master.gain.events.at(-1).slice(0, 2), ['target', 0], 'what still sounds is cut');
  h.values.set('sg:site:muted', 'false'); h.emit('storage', { key: null });
  assert.deepEqual(master.gain.events.at(-1).slice(0, 2), ['target', 0.5]);
  h.J.setQuiet(true);
  assert.deepEqual(master.gain.events.at(-1).slice(0, 2), ['target', 0]);
  playAll(h.J, ctx);
  assert.equal(count(), before, 'classroom quiet: no audio nodes');
  h.J.setQuiet(false);
  ctx.currentTime += 1; h.J.tap();
  assert.ok(count() > before, 'sound again');
  for (const raw of ['not json', '1', '"yes"']) {
    const other = portal({ stored: { 'sg:site:muted': raw } });
    other.emit('pointerdown'); other.J.tap();
    // master, then (when sounding) bus + limiter and tap's oscillator, noise, filter and two envelopes
    assert.equal(other.contexts[0].nodes.length, raw === 'not json' ? 1 + 2 + 5 : 1, `stored ${raw}`);
  }
  const startsMuted = portal({ stored: { 'sg:site:muted': 'true' } });
  startsMuted.emit('pointerdown');
  assert.equal(startsMuted.contexts[0].nodes[0].gain.value, 0, 'the master starts silent when muted');
  const none = portal({ audio: false });
  assert.doesNotThrow(() => { none.emit('pointerdown'); playAll(none.J, { currentTime: 0 }); });
});

test('juice: a suspended portal context is resumed by each gesture and its rejection is caught', () => {
  const h = portal();
  h.emit('pointerdown');
  const ctx = h.contexts[0];
  ctx.state = 'suspended';
  h.emit('keydown');
  assert.deepEqual([ctx.resumed, ctx.caught], [1, true]);
  ctx.resume = () => undefined;
  assert.doesNotThrow(() => h.emit('pointerdown'), 'an old resume() without a promise');
  ctx.resume = () => { throw new Error('closed'); };
  assert.doesNotThrow(() => h.emit('pointerdown'));
});

test('juice: games play into Kit.audio.master, only once Kit has a context, and follow Kit mute', () => {
  const h = game();
  assert.equal(h.window.Juice, undefined, 'games get Kit.juice, not window.Juice');
  assert.deepEqual(h.listeners, {}, 'Kit owns the gestures in a game');
  playAll(h.J, h.ctx);
  assert.equal(h.ctx.nodes.length, 1, 'nothing before Kit.audio.unlock() made a context');
  h.attach();
  h.kit.muted = true;
  playAll(h.J, h.ctx);
  assert.equal(h.ctx.nodes.length, 1, 'nothing while Kit is muted');
  h.kit.muted = false;
  h.J.coin(2);
  const limit = h.ctx.nodes.find(n => n.kind === 'compressor');
  assert.deepEqual(limit.outputs, [h.master], 'the limiter feeds Kit.audio.master');
  h.J.setQuiet(true); h.ctx.currentTime += 1; const n = h.ctx.nodes.length; h.J.coin(2);
  assert.equal(h.ctx.nodes.length, n, 'setQuiet also silences a game');
  // Loading twice keeps the first engine.
  const first = h.J;
  vm.runInNewContext(source, { window: h.window });
  assert.equal(h.window.Kit.juice, first);
});

test('juice: works on the real Kit audio graph', () => {
  const api = audioApi(), listeners = {};
  const target = () => ({ addEventListener(type, fn) { (listeners[type] ||= []).push(fn); }, setAttribute() {} });
  const window = target(), document = target();
  Object.assign(window, { AudioContext: api.Context, localStorage: { getItem: () => null, setItem() {} }, focus() {} });
  window.parent = window;
  document.documentElement = target();
  const context = { window, document };
  vm.runInNewContext(kitSource, context);
  vm.runInNewContext(source, context);
  const { Kit } = window;
  Kit.juice.levelUp();
  assert.equal(api.contexts.length, 0);
  for (const fn of listeners.pointerdown) fn({ button: 0 });
  const ctx = api.contexts[0];
  ctx.currentTime = 1;
  Kit.juice.levelUp();
  const limit = ctx.nodes.find(n => n.kind === 'compressor');
  assert.deepEqual(limit.outputs, [Kit.audio.master]);
  assert.deepEqual(Kit.audio.master.outputs, [ctx.destination], 'Kit itself adds no limiter');
  Kit.audio.setMuted(true);
  const n = ctx.nodes.length;
  ctx.currentTime = 3; Kit.juice.levelUp();
  assert.equal(ctx.nodes.length, n);
  assert.deepEqual(api.errors, []);
});

test('juice: at most 14 voices; busy gameplay sounds are skipped when full, UI and reward cues still play', () => {
  const h = portal();
  h.emit('pointerdown');
  const ctx = h.contexts[0];
  const played = [];
  for (let k = 0; k < 40; k++) {
    ctx.currentTime = k * 0.026;
    const n = ctx.nodes.length;
    h.J.whoosh(0);                                // one 0.42 s noise voice
    played.push(ctx.nodes.length > n);
  }
  const voices = sources(ctx).map(s => [s.started, s.started + 0.42]);
  const overlap = t => voices.filter(([a, b]) => a <= t && t < b).length;
  assert.equal(Math.max(...voices.map(([a]) => overlap(a))), 14, 'the cap is reached and held');
  assert.ok(played.includes(false) && played.filter(Boolean).length < 40, 'some were skipped');
  assert.deepEqual(played.slice(0, 14), Array(14).fill(true));
  assert.equal(played[14], false);
  // Full again: a pop is skipped, a level-up still plays.
  ctx.currentTime = 2; for (let k = 0; k < 14; k++) { ctx.currentTime += 0.026; h.J.whoosh(0); }
  let n = ctx.nodes.length; h.J.pop(); assert.equal(ctx.nodes.length, n, 'low priority skipped when full');
  for (const name of SOUNDS.filter(s => !LOW.includes(s))) { n = ctx.nodes.length; h.J[name](1); assert.ok(ctx.nodes.length > n, name + ' plays when full'); }
});

test('juice: the same sound within 25 ms plays once; other sounds are not held back', () => {
  const h = portal();
  h.emit('pointerdown');
  const ctx = h.contexts[0];
  ctx.currentTime = 1;
  const count = () => sources(ctx).length;
  h.J.tap(); const one = count();
  h.J.tap(); ctx.currentTime = 1.024; h.J.tap();
  assert.equal(count(), one, 'mashing within 25 ms adds nothing');
  h.J.pop();
  assert.ok(count() > one, 'a different sound plays at once');
  const two = count();
  ctx.currentTime = 1.0251; h.J.tap();
  assert.equal(count(), two + one, 'the same sound 25 ms later plays');
  ctx.currentTime = 1.03; h.J.streak(1); const s = count(); ctx.currentTime = 1.04; h.J.streak(9);
  assert.equal(count(), s, 'arguments do not make it a different sound');
});

test('juice: each play varies its pitch by at most 2 %, keeping its own intervals', () => {
  const h = portal();
  h.emit('pointerdown');
  const ctx = h.contexts[0];
  const ratios = [];
  for (let k = 0; k < 300; k++) {
    ctx.currentTime = 1 + k * 0.03;
    const from = ctx.nodes.length;
    h.J.select();
    const [a, b] = ctx.nodes.slice(from).filter(n => n.kind === 'oscillator').map(o => o.frequency.events[0][1]);
    ratios.push(a / 784);
    assert.ok(Math.abs(b / a - 1175 / 784) < 1e-9, 'both notes move together');
  }
  assert.ok(ratios.every(r => r >= 0.98 && r <= 1.02), 'within 2 %');
  assert.ok(Math.max(...ratios) - Math.min(...ratios) > 0.03, 'and it does vary');
  // The streak climbs a pentatonic ladder and stays at the top.
  const base = [];
  for (const n of [1, 2, 3, 4, 5, 6, 13, 99]) {
    ctx.currentTime += 0.1;
    const from = ctx.nodes.length;
    h.J.streak(n);
    const [o] = ctx.nodes.slice(from).filter(node => node.kind === 'oscillator');
    base.push(o.frequency.events[1][1]);
  }
  const semitones = base.map(f => 12 * Math.log2(f / 392));
  assert.deepEqual(semitones.map(s => Math.round(s) || 0).slice(0, 6), [0, 2, 4, 7, 9, 12]);
  assert.ok(Math.abs(semitones[6] - 28) < 0.4 && Math.abs(semitones[7] - 28) < 0.4, 'capped at the 13th step');
});

test('juice: the script has no timers, loops or music', () => {
  const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  for (const banned of [/setInterval/, /setTimeout/, /requestAnimationFrame/, /\.loop\s*=/, /\bmusic\b/i, /\bfetch\b/, /\bconsole\b/, /\.then\s*\(/]) {
    assert.doesNotMatch(code, banned);
  }
});
