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

function harness({ glFactory, dpr = 2, clock = { now: 0 }, stored = {} } = {}) {
  const elements = new Map();
  const bodyChildren = [];
  const makeEl = (tag, id = '') => {
    const listeners = {}, attrs = {};
    const el = {
      tagName: tag.toUpperCase(), id, className: '', hidden: false, textContent: '', children: [],
      width: 0, height: 0,
      setAttribute(k, v) { attrs[k] = String(v); },
      getAttribute(k) { return attrs[k]; },
      appendChild(child) { this.children.push(child); if (child.id) elements.set(child.id, child); return child; },
      addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
      removeEventListener(type, fn) {
        const list = listeners[type];
        if (list) { const i = list.indexOf(fn); if (i >= 0) list.splice(i, 1); }
      },
      emit(type, ev = {}) { for (const fn of (listeners[type] || []).slice()) fn(ev); },
      getContext(kind) {
        if (kind === '2d') {
          return {
            createRadialGradient: () => ({ addColorStop() {} }),
            fillRect() {}
          };
        }
        return glFactory ? glFactory(kind) : null;
      }
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
  const values = new Map(Object.entries(stored));
  const timers = [], rafs = [];
  const window = {
    document, parent: null, devicePixelRatio: dpr,
    performance: { now: () => clock.now },
    localStorage: {
      getItem: k => values.get(k) ?? null,
      setItem: (k, v) => values.set(k, String(v)),
      removeItem: k => values.delete(k)
    },
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

test('pixelRatio and createRenderer auto-protect software GPUs and respect sg:site:gfx-light', () => {
  const softH = harness({ glFactory: () => mockGl({ renderer: 'ANGLE', unmasked: 'Google SwiftShader' }), dpr: 2 });
  assert.equal(softH.webgl.pixelRatio(), 0.75, 'auto-detects software GPU when opts.software is omitted');

  for (const val of ['1', 'true']) {
    const h = harness({ glFactory: () => mockGl({ renderer: 'Intel UHD' }), dpr: 2, stored: { 'sg:site:gfx-light': val } });
    assert.equal(h.webgl.pixelRatio(), 0.75, 'honors sg:site:gfx-light=' + val);
    assert.equal(h.webgl.pixelRatio({ gfx: { light: false } }), 1.5, 'explicit gfx.light=false overrides site flag');
    assert.equal(h.webgl.pixelRatio({ light: false }), 1.5, 'explicit opts.light=false overrides site flag');
    let capturedParams = null, setRatio = null;
    const gl = mockGl({ renderer: 'Intel UHD' });
    h.window.THREE = {
      WebGLRenderer: class {
        constructor(p) { capturedParams = p; }
        setPixelRatio(r) { setRatio = r; }
        getContext() { return gl; }
      }
    };
    const res = h.webgl.createRenderer(h.makeEl('canvas'));
    assert.equal(res.software, false);
    assert.equal(res.light, true);
    assert.equal(res.ratio, 0.75);
    assert.equal(setRatio, 0.75);
    assert.equal(capturedParams.antialias, false, 'disables MSAA under sg:site:gfx-light=' + val);
  }
});

test('uploadRange, shrinkCount, and blobShadowPool skip 0-count uploads and write compact instanced shadows', () => {
  const h = harness();
  const attr = { updateRanges: [], needsUpdate: false };
  h.webgl.uploadRange(attr, 0);
  assert.equal(attr.needsUpdate, false, 'skips GPU upload when count === 0');
  assert.equal(attr.updateRanges.length, 0);
  h.webgl.uploadRange(attr, 48);
  assert.equal(attr.needsUpdate, true);
  assert.equal(attr.updateRanges.length, 1);
  assert.deepEqual({ ...attr.updateRanges[0] }, { start: 0, count: 48 });
  const rngRef = attr.updateRanges[0];
  attr.needsUpdate = false;
  h.webgl.uploadRange(attr, 32);
  assert.equal(attr.updateRanges[0], rngRef, 'reuses range object without allocating');
  assert.equal(attr.updateRanges[0].count, 32);

  const mesh = { count: 10, instanceMatrix: { count: 8, updateRanges: [], needsUpdate: false } };
  assert.equal(h.webgl.shrinkCount(mesh, 0), 0);
  assert.equal(mesh.count, 0);
  assert.equal(mesh.instanceMatrix.needsUpdate, false, 'shrinkCount(0) skips GPU upload');
  assert.equal(h.webgl.shrinkCount(mesh, 12), 8, 'clamps to capacity');
  assert.equal(mesh.count, 8);
  assert.equal(mesh.instanceMatrix.needsUpdate, true);
  assert.equal(mesh.instanceMatrix.updateRanges[0].count, 128);

  const added = [], removed = [];
  let disposed = 0, rotated = 0, usage = null;
  h.window.THREE = {
    DynamicDrawUsage: 35048,
    CanvasTexture: class { constructor(c) { this.image = c; } dispose() { disposed++; } },
    PlaneGeometry: class { rotateX(a) { rotated = a; } dispose() { disposed++; } },
    MeshBasicMaterial: class { constructor(o) { this.opts = o; } dispose() { disposed++; } },
    InstancedMesh: class {
      constructor(g, m, n) {
        this.geometry = g; this.material = m; this.count = n;
        this.instanceMatrix = {
          count: n, array: new Float32Array(n * 16), updateRanges: [], needsUpdate: false,
          setUsage(u) { usage = u; }
        };
      }
    }
  };
  const scene = { add: m => added.push(m), remove: m => removed.push(m) };
  const pool = h.webgl.blobShadowPool(scene, 4, { opacity: 0.5, yOffset: 0.02 });
  assert.equal(added.length, 1);
  assert.equal(pool.mesh.count, 0);
  assert.equal(usage, 35048);
  assert.ok(Math.abs(rotated + Math.PI / 2) < 1e-6);
  assert.equal(pool.commit(), 0);
  assert.equal(pool.mesh.instanceMatrix.needsUpdate, false);
  assert.equal(pool.add(3, 0, -5, 2, 1.5), 0);
  assert.equal(pool.add(1, 0, 2, 1, 1, Math.PI / 2), 1);
  assert.equal(pool.commit(), 2);
  assert.equal(pool.mesh.count, 2);
  assert.equal(pool.mesh.instanceMatrix.needsUpdate, true);
  assert.equal(pool.mesh.instanceMatrix.updateRanges[0].count, 32);
  const a = pool.mesh.instanceMatrix.array;
  assert.equal(a[0], 2); assert.equal(a[10], 1.5); assert.equal(a[12], 3); assert.ok(Math.abs(a[13] - 0.02) < 1e-6); assert.equal(a[14], -5);
  assert.ok(Math.abs(a[16]) < 1e-6 && Math.abs(a[18] + 1) < 1e-6 && Math.abs(a[24] - 1) < 1e-6, 'writes Y rotation cleanly');
  pool.clear();
  assert.equal(pool.mesh.count, 0);
  pool.dispose();
  assert.equal(removed.length, 1);
  assert.equal(disposed, 3);
});

test('minified shared/webgl.js stays compact and fits webglBytes budget', () => {
  const esbuild = require('esbuild');
  const code = esbuild.transformSync(webglSource, { loader: 'js', minify: true, target: 'chrome100', legalComments: 'none', charset: 'utf8' }).code;
  const bytes = Buffer.byteLength(code);
  const budgets = JSON.parse(readFileSync(path.join(repo, 'tools/asset-budgets.json'), 'utf8'));
  assert.ok(bytes <= budgets.webglBytes, bytes + ' exceeds webglBytes ' + budgets.webglBytes);
});
