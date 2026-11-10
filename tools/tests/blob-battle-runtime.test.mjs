import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
let browser, server;

before(async () => {
  server = await startTestServer(root);
  browser = await launchChromium();
});
after(async () => {
  await browser?.close();
  await server?.close();
});

// Drives Blob Battle's own update/render callbacks so frame and save counts are exact
// (and, given a seed, a repeatable Math.random).
async function blob(t, viewport = { width: 960, height: 540 }, seed = 0) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(seed => {
    if (seed) Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    let kit, update, render;
    const runtime = window.runtime = { paints: 0, failSave: false, canvases: [] };
    runtime.step = count => { for (let i = 0; i < count; i++) { update(1 / 60); render(0); } };
    runtime.render = () => render(0);
    const create = Document.prototype.createElement;
    Document.prototype.createElement = function (name) {
      const el = create.apply(this, arguments);
      if (String(name).toLowerCase() === 'canvas') runtime.canvases.push(el);
      return el;
    };
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = (u, r) => { update = u; render = r; return { stop() {} }; };
    } });
    // Every scene paint starts with one full-screen fill of the 1280x720 view.
    const fill = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect = function (x, y, w, h) {
      if (this.canvas.id === 'c' && x === 0 && y === 0 && w === 1280 && h === 720) runtime.paints++;
      return fill.apply(this, arguments);
    };
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key) {
      if (runtime.failSave && key.startsWith('sg:blob-battle:')) throw new DOMException('Full storage fixture', 'QuotaExceededError');
      return write.apply(this, arguments);
    };
  }, seed);
  await page.goto(`${server.origin}/games/blob-battle/`);
  await page.waitForFunction(() => window.__game);
  await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => setTimeout(resolve, 0)); });
  return page;
}

test('Blob Battle draws its "+6" eat popups the right way round', async t => {
  const page = await blob(t, undefined, 20261023);
  const drawn = await page.evaluate(() => {
    document.getElementById('btnPlay').click(); runtime.step(2);
    const seen = [], fill = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (s) {
      if (this.canvas.id === 'c') seen.push([String(s), this.direction]);
      return fill.apply(this, arguments);
    };
    __game.setMass(20000); runtime.step(2); // a sudden giant swallows the gold pellets around it
    CanvasRenderingContext2D.prototype.fillText = fill;
    return seen;
  });
  const plus = drawn.filter(([s]) => /^\+\d+$/.test(s));
  assert.ok(plus.length > 0, 'an eat popup is drawn');
  assert.deepEqual([...new Set(plus.map(([, dir]) => dir))], ['ltr'], 'in an RTL run "+6" would read "6+"');
  assert.ok(drawn.some(([s, dir]) => /[\u0600-\u06FF]/.test(s) && dir === 'rtl'), 'Arabic text still runs right to left');
});

test('Blob Battle repaints its sprite canvases after a GPU reset wipes them', async t => {
  const page = await blob(t);
  await page.evaluate(() => { document.getElementById('btnPlay').click(); runtime.step(30); document.getElementById('pauseBtn').click(); runtime.step(5); });
  const result = await page.evaluate(() => {
    // the pellet sheet and the three virus sizes are never attached to the page
    const sprites = runtime.canvases.filter(c => !c.isConnected &&
      ((c.width === 544 && c.height === 144) || (c.width === c.height && [200, 100, 50].includes(c.width))));
    const painted = c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; return d.some((v, i) => i % 4 === 3 && v > 0); };
    const wipe = () => sprites.forEach(c => { c.width = c.width; });
    const out = { count: sprites.length, before: sprites.every(painted) };
    wipe();
    out.wiped = sprites.some(painted);
    const sheet = sprites.find(c => c.width === 544);
    runtime.paints = 0;
    sheet.dispatchEvent(new Event('contextrestored'));
    runtime.step(30);
    out.ownRestore = sprites.every(painted);
    out.ownPaints = runtime.paints;
    wipe();
    runtime.paints = 0;
    document.getElementById('c').dispatchEvent(new Event('contextrestored'));
    runtime.step(30);
    out.mainRestore = sprites.every(painted);
    out.mainPaints = runtime.paints;
    return out;
  });
  assert.equal(result.count, 4, 'one pellet sheet and three virus sizes');
  assert.equal(result.before, true);
  assert.equal(result.wiped, false, 'the fixture really wipes the sprites');
  assert.equal(result.ownRestore, true, "a sprite canvas's own restore event repaints the sprites");
  assert.equal(result.ownPaints, 1, 'and repaints the paused scene once');
  assert.equal(result.mainRestore, true, 'a main canvas restore also repaints the sprites');
  assert.equal(result.mainPaints, 1);
});
