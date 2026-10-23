import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';

// Paint Tanks (tank-splat): saving, beginner help, reduced motion, floor and wall art and paused redraws.
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

// The test drives update/render itself, so frames and saves are deterministic.
async function game(t, entries = {}) {
  const context = await browser.newContext({ viewport: { width: 960, height: 540 }, serviceWorkers: 'block' });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(entries => {
    for (const [key, value] of Object.entries(entries)) localStorage.setItem('sg:tank-splat:' + key, JSON.stringify(value));
    let kit, update, render;
    const runtime = window.runtime = { failKeys: [], layerDraws: 0, texts: [], textYs: [], dashes: 0, dashPath: [], dashOffset: null };
    runtime.step = seconds => { for (let i = 0; i < Math.round(seconds * 60); i++) update(1 / 60); };
    runtime.draw = count => { for (let i = 0; i < count; i++) render(0); };
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = (u, r) => { update = u; render = r; return { stop() {} }; };
    } });
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key) {
      if (runtime.failKeys.includes(key)) throw new DOMException('Full storage fixture', 'QuotaExceededError');
      return write.apply(this, arguments);
    };
    const proto = CanvasRenderingContext2D.prototype, drawImage = proto.drawImage, fillText = proto.fillText, setLineDash = proto.setLineDash;
    const lineTo = proto.lineTo, dashOffset = Object.getOwnPropertyDescriptor(proto, 'lineDashOffset');
    let dashing = false;
    proto.drawImage = function (img) {
      if (this.canvas.id === 'cv' && img instanceof HTMLCanvasElement) runtime.layerDraws++;
      return drawImage.apply(this, arguments);
    };
    proto.fillText = function (text, x, y) {
      if (this.canvas.id === 'cv') { runtime.texts.push(text); runtime.textYs.push(text + '@' + y); }
      return fillText.apply(this, arguments);
    };
    // Records the points of the last dashed (guide or laser) path on the game canvas.
    proto.setLineDash = function (dash) {
      if (this.canvas.id === 'cv') { dashing = dash.length > 0; if (dashing) { runtime.dashes++; runtime.dashPath = []; } }
      return setLineDash.apply(this, arguments);
    };
    proto.lineTo = function (x, y) {
      if (dashing && this.canvas.id === 'cv') runtime.dashPath.push([x, y]);
      return lineTo.apply(this, arguments);
    };
    Object.defineProperty(proto, 'lineDashOffset', { configurable: true, get: dashOffset.get, set(value) {
      if (this.canvas.id === 'cv') runtime.dashOffset = value;
      dashOffset.set.call(this, value);
    } });
  }, entries);
  await page.goto(`${server.origin}/games/tank-splat/`);
  await page.waitForFunction(() => window.__game && window.runtime);
  return page;
}

// Start a campaign stage whose computer tanks never shoot, and run the countdown.
async function startQuietStage(page, stage) {
  await page.evaluate(stage => {
    __game.start(stage);
    __game.app.game.tanks.forEach(t => { if (t.bot) t.bot.p = Object.assign({}, t.bot.p, { maxBalls: 0 }); });
    runtime.step(3);
  }, stage);
  assert.equal(await page.evaluate(() => __game.app.game.state), 'play');
}

const stored = (page, key) => page.evaluate(key => Kit.store('tank-splat').get(key, null), key);
const saveState = page => page.evaluate(() => {
  const panel = document.querySelector('.sg-save-status');
  return panel && !panel.hidden ? panel.getAttribute('data-state') : 'hidden';
});

test('a failed purchase save warns, keeps the old coins and saves everything on retry', async t => {
  const page = await game(t, { coins: 100 });
  await page.evaluate(() => __game.show('shop'));
  await page.evaluate(() => { runtime.failKeys = ['sg:tank-splat:hats']; });
  await page.locator('#items .item').nth(1).click(); // party hat, 30 coins
  assert.equal(await saveState(page), 'failed');
  assert.equal(await stored(page, 'coins'), 100, 'coins must not be saved without the item');
  assert.equal(await stored(page, 'hats'), null);
  assert.deepEqual(await page.evaluate(() => [__game.save.coins, __game.save.hats]), [70, [0, 1]]);

  await page.evaluate(() => { runtime.failKeys = []; });
  await page.locator('.sg-save-status button').click();
  assert.equal(await saveState(page), 'saved');
  assert.equal(await stored(page, 'coins'), 70);
  assert.deepEqual(await stored(page, 'hats'), [0, 1]);
  assert.equal((await stored(page, 'equip'))[0].hat, 1);
});

test('the first two stages show an aim guide and explain a self-splat', async t => {
  const page = await game(t);
  await startQuietStage(page, 0);
  assert.equal(await page.evaluate(() => __game.app.game.guide), true);
  assert.ok(await page.evaluate(() => { runtime.dashes = 0; runtime.draw(1); return runtime.dashes; }) > 0, 'guide line drawn');
  // A shot straight at a wall comes back 10 px beside the way out instead of hidden under it. With the
  // nose at the wall that bounce is under the tank, so an arrow on the wall points back at it instead.
  assert.deepEqual(await page.evaluate(() => {
    const g = __game.app.game, m = g.maze, t = g.tanks[0], home = [t.x, t.y, t.a], drawBounce = TS_ART.drawBounce, marks = [];
    TS_ART.drawBounce = (...args) => { marks.push(args.slice(1, 3)); return drawBounce(...args); };
    try {
      for (let cell = 0; cell < m.cols * m.rows; cell++) for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        const c = TS_MAZE.cellCenter(m, cell), ux = Math.cos(a), uy = Math.sin(a), hit = TS_MAZE.raycast(m, c.x, c.y, ux, uy, 7, 1000);
        const d = hit && hit.t; // copied: raycast reuses its result object
        if (!d || d < 60 || d > 240) continue;
        t.x = c.x; t.y = c.y; t.a = a; runtime.draw(1);
        const end = runtime.dashPath[runtime.dashPath.length - 1], headOn = runtime.dashPath.length;
        const side = Math.abs((end[0] - t.x) * uy - (end[1] - t.y) * ux), marked = marks.length;
        t.a = a + 0.5; runtime.draw(1);
        const angled = runtime.dashPath.length <= 2 && marks.length === 0;
        t.x = c.x + ux * (d - 12); t.y = c.y + uy * (d - 12); t.a = a; runtime.draw(1);
        const mark = marks[marks.length - 1], wall = mark && Math.round(Math.hypot(mark[0] - (t.x + ux * 19), mark[1] - (t.y + uy * 19)));
        return [headOn, Math.round(side), marked, angled, marks.length, wall];
      }
    } finally {
      // the self-splat check below needs the tank back at its spawn, away from the bot
      TS_ART.drawBounce = drawBounce; [t.x, t.y, t.a] = home;
    }
  }), [3, 10, 0, true, 1, 0]);

  // The player's own ball comes back at them.
  await page.evaluate(() => {
    const g = __game.app.game, t = g.tanks[0], c = Math.cos(t.a), s = Math.sin(t.a);
    g.balls.push({ x: t.x + 60 * c, y: t.y + 60 * s, vx: -330 * c, vy: -330 * s, r: 7, owner: t, life: 5, age: 1,
      bounces: 1, maxB: 6, safe: false, dist: 200, color: t.pal.paint, sq: 0, sqA: 0, giant: false });
    t.active++;
    runtime.step(0.3);
  });
  const selfPop = () => page.evaluate(() => __game.app.game.pops.some(p => p.text === 'كرتك ارتدّت عليك!'));
  assert.deepEqual([await page.evaluate(() => __game.app.game.selfOut), await selfPop()], [true, true]);
  await page.evaluate(() => runtime.step(1));
  assert.equal(await page.evaluate(() => __game.app.game.state), 'roundEnd');
  assert.equal(await selfPop(), false, 'the banner pill replaces the popup');
  assert.ok(await page.evaluate(() => { runtime.texts.length = 0; runtime.draw(1); return runtime.texts.includes('انتبه: كراتك ترتدّ وتلطّخك!'); }));
  await page.evaluate(() => runtime.step(2.5));
  assert.deepEqual(await page.evaluate(() => [__game.app.game.round, __game.app.game.selfOut]), [2, false]);
  assert.equal(await page.evaluate(() => {
    const g = __game.app.game, p = { x: 640, y: 120, text: 'x', color: '#fff', size: 30, life: 3, max: 3 };
    g.pops.push(p); runtime.step(2); return p.y;
  }), 100, 'popups stop rising below the HUD');

  await startQuietStage(page, 2);
  assert.equal(await page.evaluate(() => __game.app.game.guide), false);
  assert.equal(await page.evaluate(() => { runtime.dashes = 0; runtime.draw(1); return runtime.dashes; }), 0, 'no guide from stage 3');
  assert.equal(await page.evaluate(() => { __game.startFree(1, 1); return __game.app.game.guide; }), false);
});

test('a paused match keeps its last frame until something changes', async t => {
  const page = await game(t);
  await startQuietStage(page, 0);
  const draws = frames => page.evaluate(frames => { runtime.layerDraws = 0; runtime.draw(frames); return runtime.layerDraws; }, frames);
  assert.equal(await draws(2), 6, 'three cached layers per playing frame');
  await page.locator('#pauseBtn').click();
  assert.equal(await page.evaluate(() => __game.app.screen), 'pause');
  assert.equal(await draws(1), 3, 'one frame when pausing');
  assert.equal(await draws(10), 0, 'paused frames are skipped');
  await page.evaluate(() => { runtime.resized = new Promise(resolve => addEventListener('resize', resolve, { once: true })); });
  await page.setViewportSize({ width: 800, height: 450 });
  await page.evaluate(() => runtime.resized);
  assert.equal(await draws(3), 3, 'redrawn once after a resize');
  await page.evaluate(() => document.getElementById('cv').dispatchEvent(new Event('contextrestored')));
  assert.equal(await draws(3), 3, 'redrawn once after the canvas is restored');
  await page.locator('#scr-pause [data-act="resume"]').click();
  assert.equal(await draws(2), 6, 'every frame again after resuming');
});

test('a match won and then left from a pause during the celebration keeps its coins and stars', async t => {
  const page = await game(t);
  await startQuietStage(page, 0);
  for (let round = 0; round < 3; round++) {
    await page.evaluate(last => {
      const g = __game.app.game;
      __game.winRound();
      for (let i = 0; i < 600 && g.state === 'play'; i++) runtime.step(1 / 60);
      for (let i = 0; i < 600 && !last && g.state !== 'play'; i++) runtime.step(1 / 60);
    }, round === 2);
  }
  assert.deepEqual(await page.evaluate(() => [__game.app.game.state, __game.app.game.over]), ['roundEnd', true]);
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => __game.app.screen), 'pause');
  await page.locator('#scr-pause [data-act="menu"]').click();
  assert.equal(await page.evaluate(() => __game.app.screen), 'title');
  assert.ok(await stored(page, 'coins') > 0, 'the match coins are saved');
  assert.ok((await stored(page, 'stars'))[0] > 0, 'stage 1 is won');
});
