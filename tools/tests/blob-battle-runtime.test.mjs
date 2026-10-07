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

// Drives Blob Battle's own update/render callbacks so frame and save counts are exact.
async function blob(t, viewport = { width: 960, height: 540 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(() => {
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
  });
  await page.goto(`${server.origin}/games/blob-battle/`);
  await page.waitForFunction(() => window.__game);
  await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => setTimeout(resolve, 0)); });
  return page;
}

const paintsOver = (page, frames) => page.evaluate(n => { runtime.paints = 0; runtime.step(n); return runtime.paints; }, frames);

test('Blob Battle draws a paused scene once, redraws it after resize and context restore, then resumes', async t => {
  const page = await blob(t);
  await page.evaluate(() => { document.getElementById('btnPlay').click(); runtime.step(60); });
  assert.equal(await page.evaluate(() => __game.info().state), 'play');
  assert.equal(await paintsOver(page, 30), 30, 'live play paints every frame');
  await page.evaluate(() => document.getElementById('pauseBtn').click());
  assert.equal(await page.evaluate(() => __game.info().state), 'pause');
  assert.equal(await paintsOver(page, 30), 1, 'pausing paints the frozen scene once');
  assert.equal(await paintsOver(page, 120), 0, 'a settled pause performs no scene paints');

  await page.setViewportSize({ width: 1000, height: 600 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  assert.equal(await paintsOver(page, 30), 1, 'a resize repaints the paused scene once');
  assert.equal(await paintsOver(page, 60), 0);

  const restored = await page.evaluate(() => {
    const canvas = document.getElementById('c'), ctx = canvas.getContext('2d');
    // A restored 2D context has lost its pixels and drawing state.
    canvas.width = canvas.width;
    canvas.dispatchEvent(new Event('contextrestored'));
    runtime.paints = 0; runtime.step(30);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    return { paints: runtime.paints, visible: pixels.some((value, i) => i % 4 === 3 && value > 0) };
  });
  assert.equal(restored.paints, 1, 'context restore repaints the paused scene');
  assert.equal(restored.visible, true, 'the restored paused canvas is not blank');

  const before = await page.evaluate(() => __game.info().T);
  await page.evaluate(() => document.getElementById('btnResume').click());
  assert.equal(await paintsOver(page, 30), 30, 'resuming paints every frame again');
  assert.ok(await page.evaluate(() => __game.info().T) > before, 'the simulation resumes');
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

// Pellets are drawn from a sheet of pre-painted sizes. Shrinking a sprite more than 2x with the
// default filter makes small pellets jagged and lets them crawl with the camera (squares, L-shapes,
// colour fringes from the next cell), so check the chosen sizes and compare the drawn pixels with
// anti-aliased circles at the same sub-pixel positions, at the zooms of mid and late game in the
// 1100x620 portal frame.
test('Blob Battle draws round, stable pellets when zoomed out in the portal frame', async t => {
  const page = await blob(t, { width: 1100, height: 620 });
  const result = await page.evaluate(() => {
    const main = document.getElementById('c'), g = main.getContext('2d');
    let draws = [];
    const drawImage = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (img, sx, sy, sw, sh, dx, dy, dw) {
      if (this.canvas === main && arguments.length === 9) {
        const m = this.getTransform();
        draws.push({ img, sx, sy, sw, sh, dx, dy, dw, a: m.a, d: m.d, e: m.e, f: m.f });
      }
      return drawImage.apply(this, arguments);
    };
    const ref = document.createElement('canvas'), rg = ref.getContext('2d', { willReadFrequently: true });
    const sheetPixels = new Map(), sheetPx = img => {
      if (!sheetPixels.has(img)) sheetPixels.set(img, img.getContext('2d').getImageData(0, 0, img.width, img.height).data);
      return sheetPixels.get(img);
    };
    const out = { drawn: 0, worstShrink: 0, gutterLeaks: 0, errors: [] };
    for (const z of [0.3, 0.4, 0.5]) for (const step of [0, 0.25, 0.5, 0.75]) {
      // move the camera by a quarter of a device pixel at a time
      const k = Math.min(innerWidth / 1280, innerHeight / 720) * devicePixelRatio * z;
      __game.camera(1700 + step / k, 1700, z);
      draws = [];
      runtime.render();
      const W = main.width, H = main.height, px = g.getImageData(0, 0, W, H).data;
      for (const d of draws) {
        if (d.dw !== 16) continue; // fully grown pellets only
        out.drawn++;
        out.worstShrink = Math.max(out.worstShrink, d.sw / (d.dw * d.a));
        // the one-pixel ring around the source cell must be clear, or the filter mixes in a neighbour
        const sp = sheetPx(d.img), sw = d.img.width;
        for (let i = -1; i <= d.sw; i++) for (const [x, y] of [[i, -1], [i, d.sh], [-1, i], [d.sw, i]]) {
          const X = d.sx + x, Y = d.sy + y;
          if (X >= 0 && Y >= 0 && X < sw && Y < d.img.height && sp[(Y * sw + X) * 4 + 3] > 0) { out.gutterLeaks++; break; }
        }
        // pixel check against an anti-aliased circle (with the same highlight) at the same spot
        const cx = d.a * (d.dx + 8) + d.e, cy = d.d * (d.dy + 8) + d.f, r = 7 * d.a, h = Math.ceil(r + 2);
        const x0 = Math.floor(cx) - h, y0 = Math.floor(cy) - h, n = 2 * h + 1;
        if (x0 < 0 || y0 < 0 || x0 + n > W || y0 + n > H) continue;
        const at = (x, y) => ((y0 + y) * W + x0 + x) * 4, bg = px.slice(at(0, 0), at(0, 0) + 3);
        let clean = true; // skip pellets touched by a grid line, a blob or another pellet
        for (let i = 0; i < n && clean; i++) for (const [x, y] of [[i, 0], [i, n - 1], [0, i], [n - 1, i]]) {
          const o = at(x, y);
          if (Math.abs(px[o] - bg[0]) + Math.abs(px[o + 1] - bg[1]) + Math.abs(px[o + 2] - bg[2]) > 6) { clean = false; break; }
        }
        if (!clean) continue;
        const c = (Math.floor(d.sy + d.sh / 2) * sw + Math.floor(d.sx + d.sw / 2)) * 4;
        ref.width = ref.height = n;
        rg.fillStyle = `rgb(${bg[0]},${bg[1]},${bg[2]})`; rg.fillRect(0, 0, n, n);
        const rx = cx - x0, ry = cy - y0, u = r / 7;
        rg.fillStyle = `rgb(${sp[c]},${sp[c + 1]},${sp[c + 2]})`; rg.beginPath(); rg.arc(rx, ry, r, 0, Math.PI * 2); rg.fill();
        rg.fillStyle = 'rgba(255,255,255,0.55)'; rg.beginPath(); rg.arc(rx - 2.2 * u, ry - 2.2 * u, 2.2 * u, 0, Math.PI * 2); rg.fill();
        const rp = rg.getImageData(0, 0, n, n).data;
        let diff = 0;
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
          const o = at(x, y), q = (y * n + x) * 4;
          diff += (Math.abs(px[o] - rp[q]) + Math.abs(px[o + 1] - rp[q + 1]) + Math.abs(px[o + 2] - rp[q + 2])) / 765;
        }
        out.errors.push(diff / (Math.PI * r * r)); // wrong pixels per pellet area
      }
    }
    out.errors.sort((a, b) => a - b);
    out.checked = out.errors.length;
    out.median = out.errors[out.errors.length >> 1];
    delete out.errors;
    return out;
  });
  assert.ok(result.drawn > 1000, `pellets are drawn from the sprite sheet (${result.drawn})`);
  assert.ok(result.worstShrink <= 2.001, `no pellet sprite is shrunk more than 2x (worst ${result.worstShrink.toFixed(2)}x)`);
  assert.equal(result.gutterLeaks, 0, 'every source cell has a clear gutter');
  assert.ok(result.checked > 300, `enough pellets on plain floor to compare (${result.checked})`);
  // Measured in headless Chromium: about 0.04 with the size chain, 0.06-0.10 with one shrunk 64px sprite.
  assert.ok(result.median < 0.055, `pellets match anti-aliased circles (median error ${result.median.toFixed(3)})`);
});

test('Blob Battle warns about failed saves, keeps them queued, and clears the warning after a retry', async t => {
  const page = await blob(t);
  const panel = () => page.evaluate(() => {
    const el = document.querySelector('.sg-save-status');
    return el && !el.hidden ? el.getAttribute('data-state') : 'hidden';
  });
  assert.equal(await panel(), 'hidden');
  // A skin choice that cannot be written stays queued for the next save.
  await page.evaluate(() => { localStorage.removeItem('sg:blob-battle:skin'); runtime.failSave = true; document.getElementById('skinPrev').click(); });
  assert.equal(await panel(), 'failed', 'a failed skin write shows the warning');
  await page.evaluate(() => { document.getElementById('btnPlay').click(); runtime.step(30); document.getElementById('pauseBtn').click(); });
  assert.equal(await panel(), 'failed', 'a failed stats save keeps the warning');
  assert.equal(await page.evaluate(() => localStorage.getItem('sg:blob-battle:skin')), null);

  await page.evaluate(() => { runtime.failSave = false; document.querySelector('.sg-save-status button').click(); });
  assert.equal(await panel(), 'saved', 'a successful retry confirms the save');
  const saved = await page.evaluate(() => ({ skin: JSON.parse(localStorage.getItem('sg:blob-battle:skin')),
    rounds: typeof JSON.parse(localStorage.getItem('sg:blob-battle:stats')).rounds }));
  assert.deepEqual(saved, { skin: 'mint', rounds: 'number' }, 'the retry writes the stats and the queued skin');
});
