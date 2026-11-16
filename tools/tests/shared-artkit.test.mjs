// shared/artkit.js (docs/ARCHITECTURE.md "Art kit"). Node only: a vm sandbox
// exercises Kit.art without a browser. Math.random is stubbed to throw.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const artSource = readFileSync(path.join(repo, 'shared/artkit.js'), 'utf8');
const kitSource = readFileSync(path.join(repo, 'shared/kit.js'), 'utf8');
const require = createRequire(import.meta.url);

function mockCtx(extra = {}) {
  const store = {};
  return new Proxy(store, {
    get(target, prop) {
      if (prop in extra) return extra[prop];
      if (prop in target) return target[prop];
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (prop === 'getTransform') return () => ({ a: 1, d: 1 });
      if (prop === 'measureText') return () => ({ width: 12 });
      if (typeof prop === 'symbol') return undefined;
      const fn = () => {};
      target[prop] = fn;
      return fn;
    },
    set(target, prop, value) { target[prop] = value; return true; }
  });
}
function mockCanvas() {
  return { width: 1, height: 1, style: {}, getContext: () => mockCtx() };
}

function harness({ reduce = false, stored = {}, clock, nav = {}, fonts } = {}) {
  const listeners = {};
  const values = new Map(Object.entries(stored));
  const styles = [];
  const document = {
    hidden: false, documentElement: { attrs: {}, style: {},
      setAttribute(name, value) { this.attrs[name] = String(value); },
      getAttribute(name) { return this.attrs[name]; }
    },
    head: { appendChild(el) { styles.push(el); } },
    body: { appendChild() {} },
    createElement(tag) {
      if (tag === 'canvas') return mockCanvas();
      return { tag, id: '', textContent: '' };
    },
    getElementById(id) { return styles.find(el => el.id === id) || null; },
    addEventListener() {},
    fonts: fonts || { ready: Promise.resolve() }
  };
  const window = {
    document, parent: null, innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
    navigator: { hardwareConcurrency: 8, deviceMemory: 8, ...nav },
    localStorage: {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: key => values.delete(key)
    },
    addEventListener() {}, matchMedia: () => ({ matches: reduce, addEventListener() {}, addListener() {} }),
    getComputedStyle: () => ({ getPropertyValue: () => 'Fredoka, sans-serif' }),
    performance: clock ? { now: () => clock.now } : { now: () => 0 }
  };
  window.parent = window;
  const raf = [];
  let allocs = 0;
  const BaseF = Float32Array;
  function CountF(n) { allocs++; return new BaseF(n); }
  const context = {
    window, document, console, Intl, WeakSet, Map, Promise, Proxy,
    setTimeout() { return 0; }, clearTimeout() {},
    requestAnimationFrame(fn) { raf.push(fn); return raf.length; }, cancelAnimationFrame() {},
    Float32Array: CountF
  };
  vm.runInNewContext(kitSource, context, { filename: 'kit.js' });
  const marks = { timers: 0, dom: 0, storage: 0, random: 0, net: 0 };
  const realTimeout = context.setTimeout;
  context.setTimeout = () => { marks.timers++; return 0; };
  context.setInterval = () => { marks.timers++; return 0; };
  context.fetch = () => { marks.net++; };
  const create = document.createElement;
  document.createElement = tag => { marks.dom++; return create(tag); };
  const setItem = window.localStorage.setItem;
  window.localStorage.setItem = (key, value) => { marks.storage++; return setItem(key, value); };
  vm.runInNewContext('Math.random = function () { throw new Error("Math.random"); };', context);
  vm.runInNewContext(artSource, context, { filename: 'artkit.js' });
  // Load itself must not have called the spies. Restore the DOM helpers, but
  // leave Math.random throwing for the exercise below.
  if (marks.timers || marks.dom || marks.storage || marks.net) {
    throw new Error('artkit did work at load: ' + JSON.stringify(marks));
  }
  context.setTimeout = realTimeout;
  document.createElement = create;
  window.localStorage.setItem = setItem;
  return { window, document, styles, values, raf, marks, Kit: window.Kit, art: window.Kit.art, allocs: () => allocs, resetAlloc: () => { allocs = 0; }, clock };
}

test('loading without Kit defines nothing and does not throw', () => {
  const window = {};
  assert.doesNotThrow(() => vm.runInNewContext(artSource, { window }, { filename: 'artkit.js' }));
  assert.equal(window.Kit, undefined);
  assert.equal(window.Art, undefined);
});

test('the only global is Kit.art, and nothing runs at load', () => {
  const h = harness();
  assert.equal(h.window.Art, undefined);
  assert.equal(h.art.version, 1);
  assert.equal(h.document.getElementById('sg-art'), null);
  assert.equal(h.document.documentElement.getAttribute('data-sg-art'), undefined);
  assert.equal(h.allocs(), 0);
  assert.equal(h.styles.length, 0);
});

test('Math.random is never used, pools stay capped, and CSS is injected once under html[data-sg-art]', () => {
  const h = harness();
  const ctx = mockCtx();
  const canvas = mockCanvas();
  assert.doesNotThrow(() => {
    h.art.init({ canvas, ctx, mode: '2d', theme: 'candy' });
    assert.equal(h.art.theme, 'candy');
    assert.equal(h.art.quality.tier, 2);
    assert.equal(h.document.documentElement.getAttribute('data-sg-art'), '2');
    const style = h.document.getElementById('sg-art');
    assert.ok(style);
    assert.match(style.textContent, /html\[data-sg-art\] \.sg-btn/);
    assert.match(style.textContent, /html\[data-sg-art="0"\]/);
    assert.match(style.textContent, /padding-inline/);
    assert.doesNotMatch(style.textContent, /margin-left|padding-left|\bleft:/);
    h.art.init({ canvas, ctx, mode: '2d' });
    assert.equal(h.styles.length, 1, 'the style tag is injected once');
    h.art.shade('#336699', -0.5);
    h.art.shade('#336699', -0.5);
    assert.equal(h.art.ramp('#000000', '#ffffff', 3).length, 3);
    h.art.round(ctx, 0, 0, 40, 20, 6);
    h.art.blob(ctx, 10, 10, 12, 0.2, 1);
    h.art.outlined(ctx, '#3ddc84', 3);
    h.art.gloss(ctx, 0, 0, 40, 20, 8);
    h.art.shadow(ctx, 0, 0, 40, 20, 0.4);
    const sprite = h.art.sprite('coin', 16, 16, c => { c.fillRect(0, 0, 16, 16); });
    h.art.blit(ctx, sprite, 8, 8, { rot: 0.2, sx: 1, sy: 1, alpha: 1 });
    h.art.bake('floor', 32, 32, c => c.fillRect(0, 0, 32, 32));
    h.art.glow('#ffcc00', 12);
    h.art.vignette(ctx, 100, 80, 0.3);
    h.art.sky('day', 32, 32, h.art.stops());
    const layer = h.art.layer(sprite, 0.4);
    layer.draw(ctx, 10, 4);
    const fx = h.art.fx();
    h.resetAlloc();
    for (const shape of ['dot', 'star', 'confetti', 'spark', 'smoke']) fx.burst(4, 4, { n: 3, shape, color: '#fff', speed: 20, life: 0.4, size: 4 });
    fx.update(0.016); fx.draw(ctx);
    const afterWarm = h.allocs();
    for (let i = 0; i < 10; i++) { fx.burst(4, 4, { n: 5, shape: 'star', color: '#fff' }); fx.update(0.016); fx.draw(ctx); }
    assert.equal(h.allocs(), afterWarm, 'the particle pool does not allocate after warm-up');
    const spring = h.art.spring();
    spring.kick(2); spring.update(0.016);
    assert.notEqual(spring.sy, 1);
    h.art.shake.add(0.4); h.art.shake.update(0.016); h.art.shake.apply(ctx);
    h.art.hitstop(30);
    h.art.blink();
    const hero = {};
    h.art.blink(hero);
    const tw = h.art.tween(0, 10, 200, h.art.ease.outBack);
    tw.update(0.05);
    h.art.tween(0, 1, 100, h.art.ease.outElastic).update(0.02);
    h.art.tween(0, 1, 100, h.art.ease.inOut).update(0.02);
    h.art.tween(0, 1, 100, h.art.ease.outQuad).update(0.02);
    h.art.pop('+10', 20, 20, { color: '#ffcc00', size: 28 });
    h.art.pop.update(0.05); h.art.pop.draw(ctx);
    h.art.flash('#ffffff', 80);
    h.art.flash.update(0.016); h.art.flash.draw(ctx, 100, 80);
    const tex = h.art.texture('decal', 8, 8, c => c.fillRect(0, 0, 8, 8));
    assert.ok(tex.canvas);
    assert.equal(typeof h.art.three.pixelRatio(), 'number');
    assert.equal(h.art.three.lights(null), null);
    assert.ok(h.art.three.blobShadow().canvas);
    h.art.quality.frame(16);
    assert.ok(h.art.rand() >= 0 && h.art.rand() < 1);
    const a = harness();
    const b = harness();
    assert.equal(a.art.rand(), b.art.rand(), 'the art stream is its own seeded generator');
  });
});

test('sprite LRU respects the tier cap and rebuilds when the scale bucket changes', () => {
  const h = harness();
  const canvas = mockCanvas();
  h.art.init({ canvas, ctx: canvas.getContext('2d'), mode: '2d' });
  let draws = 0;
  const draw = () => { draws++; };
  const first = h.art.sprite('s0', 1000, 1000, draw);
  for (let i = 1; i < 17; i++) h.art.sprite('s' + i, 1000, 1000, draw);
  const again = h.art.sprite('s0', 1000, 1000, draw);
  assert.notEqual(again.canvas, first.canvas, 'the oldest sprite is evicted past 16 MP');
  const low = harness({ stored: { 'sg:art:tier': '0' } });
  low.art.init({ canvas: mockCanvas(), ctx: mockCtx(), mode: '2d' });
  const kept = low.art.sprite('a0', 1000, 1000, () => {});
  for (let i = 1; i < 9; i++) low.art.sprite('a' + i, 1000, 1000, () => {});
  const rebuilt = low.art.sprite('a0', 1000, 1000, () => {});
  assert.notEqual(rebuilt.canvas, kept.canvas, 'tier 0 evicts past 8 MP');
  const view = h.Kit.fit(canvas, 1280, 720);
  draws = 0;
  h.art.sprite('hero', 24, 24, draw);
  h.art.sprite('hero', 24, 24, draw);
  assert.equal(draws, 1);
  view.scale = 2;
  h.art.sprite('hero', 24, 24, draw);
  assert.equal(draws, 2, 'a new DPR×scale bucket redraws the sprite');
});

test('tier changes follow the frame-time rules and a failed save is ignored', () => {
  const clock = { now: 0 };
  const h = harness({ clock });
  let seen = [];
  h.art.init({ canvas: mockCanvas(), ctx: mockCtx(), mode: '2d' });
  h.art.quality.on(tier => seen.push(tier));
  assert.equal(h.art.quality.tier, 2);
  const feed = (ms, dur) => {
    let left = dur;
    while (left > 0) {
      const step = Math.min(ms, left);
      clock.now += step;
      h.art.quality.frame(step);
      left -= step;
    }
  };
  clock.now = 1000;
  h.art.quality.frame(40);
  clock.now = 2500;
  h.art.quality.frame(40);
  assert.equal(h.art.quality.tier, 2, 'the first 3 s are ignored');
  clock.now = 3000;
  feed(30, 2100);
  assert.equal(h.art.quality.tier, 1, 'over 22 ms for 2 s steps down one tier');
  feed(30, 2100);
  assert.equal(h.art.quality.tier, 0);
  h.document.hidden = true;
  feed(40, 5000);
  assert.equal(h.art.quality.tier, 0, 'a hidden tab is ignored');
  h.document.hidden = false;
  h.art.quality.frame(400);
  feed(30, 1500);
  assert.equal(h.art.quality.tier, 0, 'a gap above 250 ms restarts the bad window');
  feed(10, 10000);
  assert.equal(h.art.quality.tier, 1, 'under 14 ms for 8 s steps up one tier');
  const at = h.art.quality.tier;
  feed(10, 8000);
  assert.equal(h.art.quality.tier, at, 'an upgrade waits out the 20 s cooldown');
  feed(10, 13000);
  assert.equal(h.art.quality.tier, 2);
  feed(10, 30000);
  assert.equal(h.art.quality.tier, 2, 'the tier never climbs above the start tier');
  assert.ok(seen.includes(1) && seen.includes(0) && seen.at(-1) === 2);

  const weak = harness({ nav: { hardwareConcurrency: 2, deviceMemory: 8 } });
  weak.art.init({ canvas: mockCanvas(), ctx: mockCtx(), mode: '2d' });
  assert.equal(weak.art.quality.tier, 1);
  const slow = harness({ stored: { 'sg:art:tier': '0' }, nav: { hardwareConcurrency: 8, deviceMemory: 8 } });
  slow.art.init({ canvas: mockCanvas(), ctx: mockCtx(), mode: '2d' });
  assert.equal(slow.art.quality.tier, 0);
  const memory = harness({ nav: { hardwareConcurrency: 8, deviceMemory: 2 } });
  memory.art.init({ canvas: mockCanvas(), ctx: mockCtx(), mode: '2d' });
  assert.equal(memory.art.quality.tier, 1);

  const full = harness();
  full.window.localStorage.setItem = () => { throw new Error('full'); };
  assert.doesNotThrow(() => full.art.init({ canvas: mockCanvas(), ctx: mockCtx(), mode: '2d' }));
  assert.equal(full.document.documentElement.getAttribute('data-sg-art'), '2');
});

test('reduced motion disables shake, hit-stop and flash, and hit-stop does not change update dt', () => {
  const h = harness();
  const canvas = mockCanvas();
  h.art.init({ canvas, ctx: canvas.getContext('2d'), mode: '2d' });
  const moved = [];
  const ctx = mockCtx({ translate: (x, y) => moved.push([x, y]) });
  h.art.shake.add(0.6);
  h.art.shake.update(0.016);
  h.art.shake.apply(ctx);
  assert.ok(moved.length === 1, 'a mild shake offsets the world');
  h.art.hitstop(5000);
  const before = moved.length;
  h.art.shake.update(1);
  h.art.shake.apply(ctx);
  assert.ok(moved.length > before, 'hit-stop freezes the shake offset instead of clearing it');
  const dts = [];
  h.art.loop(dt => dts.push(dt), () => {});
  const pump = t => { const fn = h.raf.shift(); fn(t); };
  pump(0); pump(50); pump(100);
  assert.ok(dts.length >= 1);
  for (const dt of dts) assert.ok(Math.abs(dt - 1 / 60) < 1e-9, dt);

  h.Kit.motion.setPreference('reduce');
  const quiet = [];
  const qctx = mockCtx({ translate: (x, y) => quiet.push([x, y]), fillRect: () => quiet.push('fill') });
  h.art.shake.add(1);
  h.art.shake.update(0.05);
  h.art.shake.apply(qctx);
  assert.equal(quiet.length, 0);
  h.art.hitstop(5000);
  const fx = h.art.fx(30);
  fx.burst(10, 10, { n: 4, speed: 200, life: 2, size: 6, shape: 'dot', color: '#fff' });
  fx.update(0.5);
  const drawn = [];
  fx.draw(mockCtx({ drawImage: (image, x) => drawn.push(x) }));
  assert.ok(drawn.every(x => Math.abs(x - 10) < 8), 'reduced motion fades particles in place');
  h.art.flash('#fff', 200);
  h.art.flash.draw(qctx, 20, 20);
  assert.equal(quiet.includes('fill'), false);
  const spring = h.art.spring();
  spring.kick(4);
  spring.update(0.016);
  assert.equal(spring.sx, 1);
  assert.equal(spring.sy, 1);
  const tw = h.art.tween(0, 5, 1000, h.art.ease.outQuad);
  tw.update(0.01);
  assert.equal(tw.v, 5);
});

test('WebGL helpers follow the tier and do not require three.js', () => {
  const h = harness({ stored: { 'sg:art:tier': '0' } });
  h.window.devicePixelRatio = 3;
  h.art.init({ canvas: mockCanvas(), ctx: mockCtx(), mode: 'webgl' });
  assert.equal(h.art.three.pixelRatio(), 0.75);
  const high = harness();
  high.window.devicePixelRatio = 3;
  high.art.init({ canvas: mockCanvas(), ctx: mockCtx(), mode: 'webgl' });
  assert.equal(high.art.three.pixelRatio(), 1.5);
  const scene = { added: [], add(node) { this.added.push(node); } };
  high.window.THREE = {
    CanvasTexture: function (canvas) { this.canvas = canvas; this.needsUpdate = false; },
    HemisphereLight: function (sky, ground) { this.sky = sky; this.ground = ground; },
    DirectionalLight: function () { this.position = { set() {} }; this.castShadow = false; },
    PlaneGeometry: function () {},
    MeshBasicMaterial: function (opts) { this.opts = opts; },
    Mesh: function (geo, mat) { this.geo = geo; this.mat = mat; this.rotation = { x: 0 }; }
  };
  const lights = high.art.three.lights(scene, {});
  assert.equal(scene.added.length, 2);
  assert.equal(lights.sun.castShadow, true);
  const tex = high.art.texture('ground', 8, 8, c => c.fillRect(0, 0, 8, 8));
  assert.equal(tex.needsUpdate, true);
  const shadow = high.art.three.blobShadow();
  assert.ok(Math.abs(shadow.rotation.x + Math.PI / 2) < 1e-9);
  h.window.THREE = high.window.THREE;
  const lowScene = { added: [], add(node) { this.added.push(node); } };
  const lowLights = h.art.three.lights(lowScene, {});
  assert.equal(lowLights.sun.castShadow, false);
});

test('fonts.ready rebuilds sprites once, and the minified kit fits artBytes', async () => {
  let resolveFonts;
  const fonts = { ready: new Promise(resolve => { resolveFonts = resolve; }) };
  const h = harness({ fonts });
  h.art.init({ canvas: mockCanvas(), ctx: mockCtx(), mode: '2d' });
  let draws = 0;
  h.art.sprite('label', 20, 10, () => { draws++; });
  assert.equal(draws, 1);
  resolveFonts();
  await fonts.ready;
  await Promise.resolve();
  h.art.sprite('label', 20, 10, () => { draws++; });
  assert.equal(draws, 2);

  const esbuild = require('esbuild');
  const code = esbuild.transformSync(artSource, { loader: 'js', minify: true, target: 'chrome100', legalComments: 'none', charset: 'utf8' }).code;
  const bytes = Buffer.byteLength(code);
  const budgets = JSON.parse(readFileSync(path.join(repo, 'tools/asset-budgets.json'), 'utf8'));
  assert.ok(bytes <= 14500, bytes + ' exceeds 14500');
  assert.ok(bytes <= budgets.artBytes, bytes + ' exceeds artBytes ' + budgets.artBytes);
});

test('a built page that loads the kit rewrites ?v= and the review page is not shipped', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'artkit-build-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (file, content) => {
    const target = path.join(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  };
  write('tools/build.mjs', readFileSync(path.join(repo, 'tools/build.mjs')));
  for (const helper of ['svg-data-uri.mjs', 'zip.mjs']) write('tools/lib/' + helper, readFileSync(path.join(repo, 'tools/lib', helper)));
  write('index.html', '<!doctype html><html><body><script src="js/catalog.js"></script><script src="js/site.js"></script><script src="js/offline.js"></script></body></html>');
  write('js/catalog.js', 'window.GAMES = [{ slug: "demo" }];');
  write('js/site.js', 'window.portalReady = true;');
  write('js/offline.js', readFileSync(path.join(repo, 'js/offline.js'), 'utf8'));
  write('teacher.html', '<!doctype html><html><head><link rel="stylesheet" href="css/teacher.css"></head><body><script src="js/catalog.js"></script><script src="js/teacher.js"></script></body></html>');
  write('js/teacher.js', 'window.SGTeacher = {};');
  write('css/teacher.css', 'main { color: navy; }');
  write('games/demo/index.html', '<!doctype html><html><body><script src="../../shared/artkit.js"></script><script src="game.js"></script></body></html>');
  write('games/demo/game.js', 'window.gameReady = true;');
  write('games/demo/thumb.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"></svg>');
  write('shared/game.css', 'body { color: blue; }');
  write('shared/artkit.js', artSource);
  write('shared/fonts/LICENSE-Test.txt', 'Test font license');
  write('lib/three/three.min.js', 'window.THREE = {};');
  write('lib/three/LICENSE', 'Test library license');
  write('favicon.svg', '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  write('manifest.webmanifest', '{"name":"Art kit fixture","start_url":"./"}');
  write('tools/artkit-demo.html', '<!doctype html><title>demo</title>');
  const result = spawnSync(process.execPath, [path.join(root, 'tools/build.mjs'), '--no-minify', '--out', '_site'], { cwd: root, encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const html = readFileSync(path.join(root, '_site/games/demo/index.html'), 'utf8');
  const built = readFileSync(path.join(root, '_site/shared/artkit.js'));
  const version = crypto.createHash('sha256').update(built).digest('hex').slice(0, 8);
  assert.match(html, new RegExp('src="../../shared/artkit\\.js\\?v=' + version + '"'));
  assert.equal(existsSync(path.join(root, '_site/tools/artkit-demo.html')), false);
  const worker = readFileSync(path.join(root, '_site/sw.js'), 'utf8');
  assert.ok(worker.includes('"shared/artkit.js"'));
});
