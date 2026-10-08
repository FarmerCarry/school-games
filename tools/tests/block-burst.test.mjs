import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';
import { clickControl } from '../ui-input.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
let browser, server, origin;

before(async () => {
  server = await startTestServer(root);
  origin = server.origin;
  browser = await launchChromium();
});
after(async () => {
  if (browser) await browser.close();
  await server?.close();
});

// The game only advances through stepGame()/drawGame(), and every canvas readback is counted.
async function game(t, { reducedMotion = 'no-preference', clock = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(() => {
    window.readbacks = 0;
    for (const [proto, name] of [[HTMLCanvasElement.prototype, 'toDataURL'], [HTMLCanvasElement.prototype, 'toBlob'], [CanvasRenderingContext2D.prototype, 'getImageData']]) {
      const original = proto[name];
      proto[name] = function (...args) { window.readbacks++; return original.apply(this, args); };
    }
    let kit;
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = (update, render) => {
        window.stepGame = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); };
        window.drawGame = () => render(0);
        return { stop() {} };
      };
    } });
  });
  if (clock) await page.clock.install();
  await page.goto(`${origin}/games/block-burst/`);
  await page.waitForFunction(() => window.__game && window.stepGame);
  return page;
}
const fxVisibility = page => page.evaluate(() => getComputedStyle(document.getElementById('fx')).visibility);

test('title, skin change, map and fail panel draw thumbnails without reading canvases back', async t => {
  const page = await game(t);
  assert.equal(await page.locator('.logo-blocks i canvas').count(), 3);
  assert.equal(await page.locator('.mode-art canvas').count(), 2);
  assert.equal(await page.locator('#skins .sprev canvas').count(), 6);
  await clickControl(page, '#skins .skin');
  await clickControl(page, '#btnAdv');
  assert.equal(await page.locator('#worlds .wgem canvas').count(), 4);
  await page.evaluate(() => { __game.startLevel(9); __game.endNow(); stepGame(300); });
  assert.equal(await page.evaluate(() => __game.state), 'fail');
  assert.equal(await page.locator('#failGoal .gi canvas').count(), 2);
  assert.match(await page.locator('#failGoal').textContent(), /^بقي: .*النقاط 0 \/ 500$/);
  assert.equal(await page.evaluate(() => window.readbacks), 0);
});

test('a bomb dropped on an empty area is kept; over blocks it clears them', async t => {
  const page = await game(t);
  await clickControl(page, '#btnClassic');
  assert.equal(await page.evaluate(() => __game.run.bombs), 1);
  // click the bomb, then click where it should go (the board starts empty)
  await page.mouse.click(120, 612);
  await page.mouse.click(700, 400);
  assert.equal(await page.evaluate(() => __game.run.bombs), 1);
  assert.equal(await page.locator('#toast').textContent(), 'ضع القنبلة فوق المكعبات!');
  const area = [0, 1, 2, 8, 9, 10, 16, 17, 18];
  await page.evaluate(area => { for (const i of area) __game.run.cells[i] = 3; }, area);
  await page.mouse.click(120, 612);
  await page.mouse.click(485, 127); // the centre of that 3x3 area
  assert.deepEqual(await page.evaluate(area => [__game.run.bombs, area.filter(i => __game.run.cells[i]).length], area), [0, 0]);
});

test('failed saves warn with a retry, keep progress, and clear once a retry succeeds', async t => {
  const page = await game(t);
  await clickControl(page, '#btnClassic');
  await page.evaluate(() => {
    window.restoreStorage = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('sg:block-burst:')) throw new DOMException('full', 'QuotaExceededError');
      return window.restoreStorage.call(this, key, value);
    };
    __game.auto(2);
  });
  const progress = await page.evaluate(() => ({ moves: __game.run.moves, best: __game.save.best }));
  assert.equal(progress.moves, 2);
  assert.ok(progress.best > 0);
  assert.equal(await page.locator('.sg-save-status[data-state="failed"]').isVisible(), true);
  assert.equal(await page.evaluate(() => localStorage.getItem('sg:block-burst:run')), null);
  await page.locator('.sg-save-status button').click();
  assert.equal(await page.locator('.sg-save-status[data-state="failed"]').isVisible(), true, 'a failing retry keeps the warning');
  await page.evaluate(() => { Storage.prototype.setItem = window.restoreStorage; });
  await page.locator('.sg-save-status button').click();
  assert.equal(await page.locator('.sg-save-status[data-state="saved"]').isVisible(), true);
  assert.deepEqual(await page.evaluate(() => ({
    moves: JSON.parse(localStorage.getItem('sg:block-burst:run')).moves,
    best: JSON.parse(localStorage.getItem('sg:block-burst:best'))
  })), progress);
});

test('reduced motion skips confetti; otherwise the fx layer shows only while confetti flies', async t => {
  for (const reducedMotion of ['reduce', 'no-preference']) {
    const page = await game(t, { reducedMotion, clock: true });
    assert.equal(await fxVisibility(page), 'hidden');
    await page.evaluate(() => { __game.startLevel(0); __game.win(); stepGame(30); drawGame(); });
    assert.equal(await page.evaluate(() => __game.state), 'win');
    assert.equal(await fxVisibility(page), reducedMotion === 'reduce' ? 'hidden' : 'visible', reducedMotion);
    // The stars light up (with their own confetti) on timeouts: fire them all before the last check.
    await page.clock.runFor(1300);
    assert.equal(await page.locator('#winStars .on').count(), 3);
    await page.evaluate(() => { stepGame(480); drawGame(); }); // every confetti piece has landed
    assert.equal(await fxVisibility(page), 'hidden', reducedMotion);
  }
});

test('a paused game draws until its effects settle, then only after a resize, canvas restore or resume', async t => {
  const page = await game(t);
  const thumb = await page.evaluate(() => {
    // A GPU reset leaves a canvas blank: the title thumbnail repaints itself when restored.
    const art = document.querySelector('.art-classic canvas'), painted = () => art.getContext('2d').getImageData(0, 0, 160, 160).data.some((v, i) => i % 4 === 3 && v > 0);
    art.width = art.width;
    const wiped = painted();
    art.dispatchEvent(new Event('contextrestored'));
    return { wiped, restored: painted() };
  });
  assert.deepEqual(thumb, { wiped: false, restored: true });
  await page.evaluate(() => {
    const background = BBArt.background;
    window.paints = 0;
    BBArt.background = function (...args) { window.paints++; return (window.lastBg = background.apply(this, args)); };
    window.frames = n => { window.paints = 0; for (let i = 0; i < n; i++) { stepGame(); drawGame(); } return window.paints; };
  });
  const paused = await page.evaluate(() => {
    __game.classic(true); stepGame(150); // the start banner has gone
    __game.auto(1); // its score popup stays up for a second
    document.getElementById('btnPause').click();
    const settling = frames(10);
    stepGame(60);
    return { state: __game.state, settling, settled: frames(20) };
  });
  assert.deepEqual(paused, { state: 'pause', settling: 10, settled: 1 }, 'one last frame once the effects are over');
  await page.setViewportSize({ width: 1000, height: 600 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  assert.equal(await page.evaluate(() => frames(10)), 1, 'a resize draws the paused scene once');
  const restored = await page.evaluate(() => {
    const canvas = document.getElementById('game'), before = lastBg;
    canvas.width = canvas.width; // a restored 2D context has lost its pixels and drawing state
    canvas.dispatchEvent(new Event('contextrestored'));
    return { paints: frames(10), rebuilt: lastBg !== before, scale: canvas.getContext('2d').getTransform().a };
  });
  assert.equal(restored.paints, 1);
  assert.equal(restored.rebuilt, true, 'the cached background is rebuilt');
  assert.ok(restored.scale > 0.7 && restored.scale < 0.9, `the logical transform is reapplied (${restored.scale})`);
  await page.evaluate(() => document.getElementById('btnResume').click());
  assert.equal(await page.evaluate(() => frames(10)), 10, 'play draws every frame again');
});

test('a classic run whose save failed is continued from the menu instead of being lost', async t => {
  const page = await game(t);
  await clickControl(page, '#btnClassic');
  const run = await page.evaluate(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'sg:block-burst:run') throw new DOMException('full', 'QuotaExceededError');
      return setItem.call(this, key, value);
    };
    __game.auto(2);
    return { moves: __game.run.moves, score: __game.run.score };
  });
  const status = () => page.locator('.sg-save-status').getAttribute('data-state');
  assert.equal(await status(), 'failed');
  await clickControl(page, '#btnPause');
  await clickControl(page, '#btnPauseMenu');
  assert.equal(await page.locator('#classicSub').textContent(), 'النقاط الآن: ' + run.score);
  await clickControl(page, '#btnClassic');
  assert.deepEqual(await page.evaluate(() => ({ moves: __game.run.moves, score: __game.run.score })), run);
  assert.equal(await status(), 'failed', 'the continued run is still unsaved');
  // A new game drops that run; the warning clears only because a real write then succeeds.
  await page.evaluate(() => __game.title());
  await clickControl(page, '#btnNew');
  assert.equal(await page.evaluate(() => __game.run.moves), 0);
  assert.equal(await status(), 'saved');
});

test('the first-move hint drags a tray piece to where it fits; its text covers no gem and not that piece', async t => {
  const page = await game(t);
  const moves = await page.evaluate(() => {
    let seed = 7;
    Math.random = () => (seed = seed * 16807 % 2147483647) / 2147483647;
    const N = 8, out = [], range = [...Array(N).keys()];
    const inLine = (line, [y, x]) => (line.row != null ? y === line.row : x === line.col);
    for (const level of [0, 1, 2]) for (let k = 0; k < 16; k++) {
      __game.startLevel(level);
      const m = __game.hint, run = __game.run, mask = BBCore.maskFromBoard(run.cells), all = [];
      run.tray.forEach((p, slot) => {
        if (p) for (let r = 0; r <= N - p.shape.h; r++) for (let c = 0; c <= N - p.shape.w; c++) {
          if (BBCore.fits(mask, p.shape, r, c)) all.push({ slot, r, c, h: p.shape.h, cells: p.shape.cells.map(([y, x]) => [r + y, c + x]) });
        }
      });
      const move = m && all.find(p => p.slot === m.slot && p.r === m.r && p.c === m.c);
      if (!move) { out.push({ level, fits: false }); continue; }
      const res = { level, fits: true, gem: !!m.gem };
      // the text row holds no gem and is not a row the hand's piece lands on
      res.textClear = range.every(x => !run.gems[m.textRow * N + x]) && (m.textRow < m.r || m.textRow >= m.r + move.h);
      if (level === 1) {
        // no gems: a spot in a row or column that already holds blocks (the board centre is filled)
        res.byBlocks = move.cells.some(([y, x]) => range.some(b => run.cells[y * N + b] || run.cells[b * N + x]));
      } else {
        // the gem row or column with the fewest empty cells that a piece can reach, filled as far as any piece can
        const lines = [];
        for (const a of range) for (const line of [{ row: a }, { col: a }]) {
          const idx = range.map(b => (line.row != null ? a * N + b : b * N + a));
          const empty = idx.filter(i => !run.cells[i]).length;
          const most = Math.max(0, ...all.map(p => p.cells.filter(cell => inLine(line, cell)).length));
          if (idx.some(i => run.gems[i]) && empty && most) lines.push({ key: JSON.stringify(line), empty, most });
        }
        const target = lines.find(l => l.key === JSON.stringify(m.line));
        res.target = !!target && target.empty === Math.min(...lines.map(l => l.empty)) &&
          move.cells.filter(cell => inLine(m.line, cell)).length === target.most;
        res.textTop = m.textRow === 1;
      }
      out.push(res);
    }
    return out;
  });
  const expected = m => (m.level === 1 ? { level: 1, fits: true, gem: false, textClear: true, byBlocks: true }
    : { level: m.level, fits: true, gem: true, textClear: true, target: true, textTop: m.textTop });
  for (const m of moves) assert.deepEqual(m, expected(m), JSON.stringify(moves));
  assert.ok(moves.filter(m => m.level === 0).every(m => m.textTop), 'level 1 keeps its tip text at the top');
  assert.ok(moves.filter(m => m.level === 2 && m.textTop).length >= 12, 'level 3 mostly keeps its tip text at the top');
  // The hint draws its text on that row, under the hand (the hand is the only rotate(-0.3)).
  const drawn = await page.evaluate(() => {
    const ys = [], order = [], proto = CanvasRenderingContext2D.prototype, fill = proto.fillText, rot = proto.rotate;
    proto.fillText = function (s, x, y) { if (/^(املأ|اسحب)/.test(s)) { ys.push(y); order.push('text'); } return fill.apply(this, arguments); };
    proto.rotate = function (a) { if (a === -0.3) order.push('hand'); return rot.apply(this, arguments); };
    __game.startLevel(2); stepGame(170); drawGame();
    proto.fillText = fill; proto.rotate = rot;
    return { ys, order, row: __game.hint.textRow };
  });
  assert.deepEqual(drawn.ys, [34 + 62 * (drawn.row + 0.5)]);
  assert.deepEqual(drawn.order, ['text', 'hand']);
});
