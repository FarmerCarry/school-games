// shared/webgl.js (Kit.webgl). Node only: exercises software-GPU detection, DPR clamping,
// fenceSync/finish pacing, context-loss wiring, nogl fallback, deferred boot3D, and size budget.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const kitSource = readFileSync(path.join(repo, 'shared/kit.js'), 'utf8');
const webglSource = readFileSync(path.join(repo, 'shared/webgl.js'), 'utf8');
const require = createRequire(import.meta.url);

function mockGl({ renderer = 'ANGLE (Intel, UHD 620)', unmasked = '', hasFence = true, signaled = true, lost = false } = {}) {
  let lostCalls = 0, finishes = 0, flushes = 0, deleted = 0, syncSeq = 0;
  const gl = {
    RENDERER: 0x1f01,
    SYNC_GPU_COMMANDS_COMPLETE: 0x9117,
    SYNC_STATUS: 0x9114,
    SIGNALED: 0x9119,
    UNSIGNALED: 0x9118,
    TIMEOUT_EXPIRED: 0x911b,
    ALREADY_SIGNALED: 0x911a,
    SYNC_FLUSH_COMMANDS_BIT: 1,
    getParameter(p) {
      if (p === 0x1f01) return renderer;
      if (p === 0x9246) return unmasked;
      return '';
    },
    getExtension(name) {
      if (name === 'WEBGL_debug_renderer_info' && unmasked) return { UNMASKED_RENDERER_WEBGL: 0x9246 };
      if (name === 'WEBGL_lose_context') return { loseContext() { lostCalls++; } };
      return null;
    },
    isContextLost() { return lost; },
    flush() { flushes++; },
    finish() { finishes++; },
    setSignaled(v) { signaled = v; },
    setLost(v) { lost = v; },
    get stats() { return { lostCalls, finishes, flushes, deleted, syncSeq }; }
  };
  if (hasFence) {
    gl.fenceSync = () => ({ id: ++syncSeq });
    gl.getSyncParameter = () => (signaled ? gl.SIGNALED : gl.UNSIGNALED);
    gl.clientWaitSync = () => (signaled ? gl.ALREADY_SIGNALED : gl.TIMEOUT_EXPIRED);
    gl.deleteSync = () => { deleted++; };
  }
  return gl;
}

function harness({ glFactory, dpr = 2, clock = { now: 0 } } = {}) {
  const elements = new Map();
  const bodyChildren = [];
  const makeEl = (tag, id = '') => {
    const listeners = {}, attrs = {};
    const el = {
      tagName: tag.toUpperCase(), id, className: '', hidden: false, textContent: '', children: [],
      setAttribute(k, v) { attrs[k] = String(v); },
      getAttribute(k) { return attrs[k]; },
      appendChild(child) { this.children.push(child); if (child.id) elements.set(child.id, child); return child; },
      addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
      removeEventListener(type, fn) {
        const list = listeners[type];
        if (list) { const i = list.indexOf(fn); if (i >= 0) list.splice(i, 1); }
      },
      emit(type, ev = {}) { for (const fn of (listeners[type] || []).slice()) fn(ev); },
      getContext(kind) { return glFactory ? glFactory(kind) : null; }
    };
    if (id) elements.set(id, el);
    return el;
  };
  const body = makeEl('body');
  body.appendChild = child => { bodyChildren.push(child); if (child.id) elements.set(child.id, child); return child; };
  const document = {
    hidden: false,
    documentElement: makeEl('html'),
    body,
    createElement: tag => makeEl(tag),
    getElementById: id => elements.get(id) || null,
    addEventListener() {}
  };
  const timers = [], rafs = [];
  const window = {
    document, parent: null, devicePixelRatio: dpr,
    performance: { now: () => clock.now },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    addEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    requestAnimationFrame(fn) { rafs.push(fn); return rafs.length; },
    cancelAnimationFrame(id) { rafs[id - 1] = null; }
  };
  window.parent = window;
  const context = {
    window, document, console, Intl, WeakSet,
    setTimeout(fn, ms) { timers.push({ fn, ms, cleared: false }); return timers.length; },
    clearTimeout(id) { if (timers[id - 1]) timers[id - 1].cleared = true; },
    requestAnimationFrame: window.requestAnimationFrame,
    cancelAnimationFrame: window.cancelAnimationFrame
  };
  vm.runInNewContext(kitSource, context, { filename: 'kit.js' });
  let canvasCreates = 0;
  const baseCreate = document.createElement;
  document.createElement = tag => { if (tag === 'canvas') canvasCreates++; return baseCreate(tag); };
  vm.runInNewContext(webglSource, context, { filename: 'webgl.js' });
  assert.equal(canvasCreates, 0, 'loading webgl.js does not create a canvas or touch WebGL');
  return { window, document, elements, bodyChildren, timers, rafs, makeEl, Kit: window.Kit, webgl: window.Kit.webgl, clock };
}

test('loading without Kit defines nothing and does not throw', () => {
  const window = {};
  assert.doesNotThrow(() => vm.runInNewContext(webglSource, { window }, { filename: 'webgl.js' }));
  assert.equal(window.Kit, undefined);
});

test('software-renderer detection checks RENDERER and WEBGL_debug_renderer_info, caches, and releases probe context', () => {
  const probeGl = mockGl({ renderer: 'WebKit WebGL', unmasked: 'Google SwiftShader' });
  let probes = 0;
  const h = harness({ glFactory: () => { probes++; return probeGl; } });
  const p1 = h.webgl.probe();
  assert.deepEqual({ ...p1 }, { ok: true, software: true, renderer: 'Google SwiftShader' });
  assert.equal(probeGl.stats.lostCalls, 1, 'probe releases its temporary context');
  assert.equal(h.webgl.isSoftware(), true);
  assert.equal(probes, 1, 'probe result is cached');
  for (const name of ['llvmpipe (LLVM 15)', 'Microsoft Basic Render Driver', 'Mesa Offscreen', 'Direct3D11 WARP', 'Software Rasterizer']) {
    const g = mockGl({ renderer: 'ANGLE', unmasked: name });
    assert.equal(h.webgl.isSoftware(g), true, name);
    assert.equal(g.stats.lostCalls, 0, 'inspecting a live context never loses it');
  }
  assert.equal(h.webgl.isSoftware(mockGl({ renderer: 'ANGLE (Intel, UHD 630)' })), false);
  const none = harness({ glFactory: () => null });
  assert.deepEqual({ ...none.webgl.probe() }, { ok: false, software: false, renderer: '' });
  assert.equal(none.webgl.isSoftware(), false);
});

test('pixelRatio clamps cleanly for hardware, software, Kit.gfx light, and low modes', () => {
  const h = harness({ glFactory: () => mockGl({ renderer: 'Intel UHD' }), dpr: 2 });
  assert.equal(h.webgl.pixelRatio(), 1.5);
  assert.equal(h.webgl.pixelRatio({ max: 1.25 }), 1.25);
  assert.equal(h.webgl.pixelRatio({ software: true }), 0.75);
  assert.equal(h.webgl.pixelRatio({ software: true, softRatio: 0.7 }), 0.7);
  assert.equal(h.webgl.pixelRatio({ gfx: { light: true } }), 0.75);
  assert.equal(h.webgl.pixelRatio({ low: true }), 0.5);
  assert.equal(h.webgl.pixelRatio({ low: true, lowRatio: 0.6 }), 0.6);
});

test('pacer and whenDrawn pace software frames via fenceSync and fall back to finish() on WebGL1', () => {
  const clock = { now: 100 };
  const gl = mockGl({ renderer: 'WebKit WebGL', unmasked: 'SwiftShader', hasFence: true, signaled: false });
  const h = harness({ glFactory: () => gl, clock });
  const p = h.webgl.pacer(gl, { software: true });
  assert.equal(p.mayDraw(100, false), true);
  p.markDrawn();
  assert.equal(gl.stats.syncSeq, 1);
  assert.equal(gl.stats.flushes, 1);
  assert.equal(p.mayDraw(120, false), false, 'waits while fence is unsignaled');
  assert.equal(p.mayDraw(120, true), true, 'playing frames bypass menu pacing');
  gl.setSignaled(true);
  clock.now = 160;
  assert.equal(p.mayDraw(160, false), false, 'respects busy * 2 cooldown after 60 ms frame');
  assert.equal(p.mayDraw(220, false), true, 'allows next draw once cooldown passes');
  assert.equal(gl.stats.deleted, 1);

  let drawn = 0;
  gl.setSignaled(false);
  p.whenDrawn(() => { drawn++; }, 5000);
  assert.equal(drawn, 0);
  gl.setSignaled(true);
  h.timers.filter(t => !t.cleared).forEach(t => t.fn());
  assert.equal(drawn, 1);
  p.dispose();

  // WebGL1 fallback (no fenceSync): uses finish() and still invokes done().
  const gl1 = mockGl({ renderer: 'SwiftShader', hasFence: false });
  let done1 = 0;
  const p1 = h.webgl.pacer(gl1, { software: true });
  p1.markDrawn();
  assert.equal(gl1.stats.finishes, 1);
  h.webgl.whenDrawn(gl1, () => { done1++; });
  assert.equal(done1, 1);
  assert.equal(gl1.stats.finishes, 2);
});

test('watchContext prevents default, toggles notice, fires callbacks, and detaches cleanly', () => {
  const h = harness();
  const canvas = h.makeEl('canvas');
  const notice = h.makeEl('div', 'ctxNotice');
  notice.hidden = true;
  const events = [];
  const w = h.webgl.watchContext(canvas, {
    notice: 'ctxNotice',
    onLost: () => events.push('lost'),
    onRestored: () => events.push('restored')
  });
  assert.equal(w.lost, false);
  let prevented = false;
  canvas.emit('webglcontextlost', { preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(w.lost, true);
  assert.equal(notice.hidden, false);
  canvas.emit('webglcontextrestored', {});
  assert.equal(w.lost, false);
  assert.equal(notice.hidden, true);
  assert.deepEqual(events, ['lost', 'restored']);
  w.detach();
  canvas.emit('webglcontextlost', { preventDefault() {} });
  assert.equal(w.lost, false);
});

test('showNoGL reveals an existing #nogl or creates an Arabic fallback panel and hides targets', () => {
  const h = harness();
  const title = h.makeEl('div', 'title');
  const created = h.webgl.showNoGL({ hide: 'title' });
  assert.equal(title.hidden, true);
  assert.equal(created.id, 'sg-nogl');
  assert.equal(created.hidden, false);
  assert.equal(created.getAttribute('role'), 'alert');
  assert.match(created.children[0].children[1].textContent, /ثلاثية الأبعاد/);

  const h2 = harness();
  const existing = h2.makeEl('div', 'nogl');
  existing.hidden = true;
  const shown = h2.webgl.showNoGL();
  assert.equal(shown, existing);
  assert.equal(existing.hidden, false);
});

test('boot runs once via rAF + setTimeout(0) or fallback timer when rAF is blocked', () => {
  const h = harness();
  let runs = 0;
  h.webgl.boot(() => { runs++; });
  assert.equal(runs, 0);
  h.rafs.shift()();
  assert.equal(runs, 0, 'defers via setTimeout(0) after rAF');
  h.timers.filter(t => !t.cleared).forEach(t => t.fn());
  assert.equal(runs, 1, 'fallback timer does not run it a second time');

  const h2 = harness();
  let runs2 = 0;
  h2.webgl.boot(() => { runs2++; }, { fallbackMs: 80 });
  // Simulate test-offline.mjs where rAF never fires: fallback timer still boots once.
  h2.timers.filter(t => !t.cleared).forEach(t => t.fn());
  assert.equal(runs2, 1);
});

test('minified shared/webgl.js stays compact and fits webglBytes budget', () => {
  const esbuild = require('esbuild');
  const code = esbuild.transformSync(webglSource, { loader: 'js', minify: true, target: 'chrome100', legalComments: 'none', charset: 'utf8' }).code;
  const bytes = Buffer.byteLength(code);
  const budgets = JSON.parse(readFileSync(path.join(repo, 'tools/asset-budgets.json'), 'utf8'));
  assert.ok(bytes <= budgets.webglBytes, bytes + ' exceeds webglBytes ' + budgets.webglBytes);
});
