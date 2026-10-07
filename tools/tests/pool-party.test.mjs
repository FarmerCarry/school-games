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
  await browser?.close();
  await server?.close();
});

// 1280x720 makes page pixels equal the game's logical pixels. The loop is stepped
// by hand so pointer events can land between two updates, as they do in Chrome.
// stepGame only updates; play(n) also draws, and `paints` counts drawn frames.
async function game(t) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(() => {
    let kit;
    window.paints = 0;
    window.restorable = [];
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = (update, render) => {
        window.stepGame = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); };
        window.play = (n = 1) => { for (let i = 0; i < n; i++) { update(1 / 60); render(0); } };
        return { stop() {} };
      };
    } });
    const fill = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect = function (x, y, w, h) {
      if (this.canvas.id === 'game' && this.fillStyle === '#130c33' && x === 0 && y === 0 && w === 1280 && h === 720) window.paints++;
      return fill.apply(this, arguments);
    };
    const listen = HTMLCanvasElement.prototype.addEventListener;
    HTMLCanvasElement.prototype.addEventListener = function (type) {
      if (type === 'contextrestored') window.restorable.push(this);
      return listen.apply(this, arguments);
    };
  });
  await page.goto(`${origin}/games/pool-party/`);
  await page.waitForFunction(() => window.__game && window.stepGame);
  return page;
}

async function startCpuMatch(page) {
  await page.keyboard.press('Enter');
  await page.evaluate(() => stepGame(2));
  assert.equal(await page.evaluate(() => __game.screen), 'game');
}

test('a pull that arrives in the same frame as the press keeps the aim the guide showed', async t => {
  const page = await game(t);
  await page.evaluate(() => { __game.trick(0); stepGame(2); });
  const [, cx, cy] = await page.evaluate(() => __game.balls().find(b => b[0] === 0));
  const preset = await page.evaluate(() => __game.aim);
  const hover = { x: cx + Math.cos(preset) * 200, y: cy + Math.sin(preset) * 200 };
  await page.mouse.move(hover.x, hover.y);
  await page.evaluate(() => stepGame(1));
  const shown = await page.evaluate(() => __game.aim);

  await page.mouse.down();
  await page.mouse.move(hover.x - 60, hover.y + 45);
  await page.evaluate(() => stepGame(1));
  assert.equal(await page.evaluate(() => __game.aim), shown, 'the first pull must not re-aim the shot');
  assert.ok(Math.abs(await page.evaluate(() => __game.power) - 0.3) < 1e-6, 'power is measured from the press point');

  await page.mouse.move(hover.x - 120, hover.y + 90);
  await page.mouse.up();
  await page.evaluate(() => stepGame(1));
  assert.deepEqual(await page.evaluate(() => [__game.phase, __game.aim]), ['strike', shown]);
});

test('pressing on the cue ball in hand and dragging at once moves the ball', async t => {
  const page = await game(t);
  await startCpuMatch(page);
  assert.equal(await page.evaluate(() => __game.inHand), true);
  const [, cx, cy] = await page.evaluate(() => __game.balls().find(b => b[0] === 0));
  await page.mouse.move(cx, cy);
  await page.evaluate(() => stepGame(1));
  await page.mouse.down();
  await page.mouse.move(cx - 40, cy + 30);
  await page.evaluate(() => stepGame(1));
  await page.mouse.up();
  await page.evaluate(() => stepGame(1));
  assert.deepEqual(await page.evaluate(() => __game.balls().find(b => b[0] === 0)), [0, cx - 40, cy + 30]);
  assert.deepEqual(await page.evaluate(() => [__game.phase, __game.inHand, __game.power]), ['aim', true, 0]);
});

test('the hard CPU still plans and shoots when updates run without drawn frames', async t => {
  const page = await game(t);
  for (const key of ['ArrowLeft', 'ArrowLeft']) { await page.keyboard.press(key); await page.evaluate(() => stepGame(1)); }
  assert.equal(await page.evaluate(() => __game.save.opp), 'hard');
  await startCpuMatch(page);
  await page.evaluate(() => __game.shoot(0.05));
  const updates = await page.evaluate(() => {
    for (let i = 1; i <= 3600; i++) {
      stepGame(1);
      if (__game.turn === 1 && (__game.phase === 'strike' || __game.phase === 'rolling')) return i;
    }
    return -1;
  });
  assert.ok(updates > 0, 'the CPU took its shot');
});

function blockWrites(page, pattern) {
  return page.evaluate(source => {
    const blocked = new RegExp(source);
    window.restoreStorage = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (blocked.test(key)) throw new DOMException('Storage is full', 'QuotaExceededError');
      return window.restoreStorage.call(this, key, value);
    };
  }, pattern);
}
const stored = (page, key) => page.evaluate(k => JSON.parse(localStorage.getItem('sg:pool-party:' + k)), key);

test('a failed match save warns, keeps earlier progress and saves on retry', async t => {
  const page = await game(t);
  await startCpuMatch(page);
  await blockWrites(page, '^sg:pool-party:');
  await page.evaluate(() => __game.win(0));
  const status = page.locator('.sg-save-status');
  assert.equal(await status.getAttribute('data-state'), 'failed');
  assert.equal(await status.isVisible(), true);
  assert.equal(await stored(page, 'coins'), null, 'nothing was written');
  const earned = await page.evaluate(() => __game.save);
  assert.equal(earned.coins, 140);

  await status.locator('button').click();
  assert.equal(await status.getAttribute('data-state'), 'failed', 'a retry that also fails keeps the warning');
  await page.evaluate(() => { Storage.prototype.setItem = window.restoreStorage; });
  await status.locator('button').click();
  assert.equal(await status.getAttribute('data-state'), 'saved');
  await page.reload();
  await page.waitForFunction(() => window.__game);
  assert.deepEqual(await page.evaluate(() => __game.save), earned);
});

test('a purchase whose item cannot be saved does not store the lower coin total', async t => {
  const page = await game(t);
  await page.evaluate(() => __game.coins(100));
  await clickControl(page, '#btnShop');
  await blockWrites(page, '^sg:pool-party:owned$');
  const candy = page.locator('#shopCues .item').nth(1);
  await candy.click();
  assert.equal(await page.evaluate(() => __game.save.coins), 40, 'the purchase still works for this session');
  assert.equal(await page.locator('.sg-save-status').getAttribute('data-state'), 'failed');
  assert.equal(await stored(page, 'coins'), 100);
  assert.deepEqual(await stored(page, 'owned'), { cues: ['classic'], felts: ['green'] });

  await page.evaluate(() => { Storage.prototype.setItem = window.restoreStorage; });
  await page.locator('.sg-save-status button').click();
  assert.equal(await stored(page, 'coins'), 40);
  assert.deepEqual((await stored(page, 'owned')).cues, ['classic', 'candy']);
});

test('a save that fails at the coins keeps the first-win bonus for a later win', async t => {
  const page = await game(t);
  await startCpuMatch(page);
  await blockWrites(page, '^sg:pool-party:coins$');
  await page.evaluate(() => __game.win(0));
  assert.equal(await page.locator('.sg-save-status').getAttribute('data-state'), 'failed');
  assert.equal(await stored(page, 'coins'), null);
  assert.equal(await stored(page, 'wins'), null, 'the win that gates the bonus is not stored without its coins');

  await page.reload();
  await page.waitForFunction(() => window.__game && window.stepGame);
  await startCpuMatch(page);
  await page.evaluate(() => __game.win(0));
  assert.equal(await stored(page, 'coins'), 140, 'the next first win pays the reward and the bonus');
  assert.deepEqual(await stored(page, 'wins'), { easy: 1, medium: 0, hard: 0 });
});

test('picking an opponent writes only that setting until a save has failed', async t => {
  const page = await game(t);
  await page.evaluate(() => {
    window.writes = [];
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key) { writes.push(key.replace('sg:pool-party:', '')); return write.apply(this, arguments); };
  });
  await page.keyboard.press('ArrowLeft');
  await page.evaluate(() => stepGame(1));
  assert.deepEqual(await page.evaluate(() => writes.splice(0)), ['opp'], 'an older tab cannot overwrite coins by picking an opponent');

  await blockWrites(page, '^sg:pool-party:');
  await page.keyboard.press('ArrowLeft');
  await page.evaluate(() => stepGame(1));
  const status = page.locator('.sg-save-status');
  assert.equal(await status.getAttribute('data-state'), 'failed');
  assert.ok((await status.boundingBox()).y < 40, 'on the title the warning sits at the top, clear of the how-to-play row');
  await page.evaluate(() => { Storage.prototype.setItem = window.restoreStorage; writes.length = 0; });
  await page.keyboard.press('ArrowLeft');
  await page.evaluate(() => stepGame(1));
  assert.equal(await status.getAttribute('data-state'), 'saved');
  const written = await page.evaluate(() => writes);
  assert.deepEqual(written.slice(0, 4), ['owned', 'cue', 'felt', 'coins'], 'after a failure the whole save is written, items first');
  assert.ok(written.includes('opp') && written.includes('wins'));
});

test('a paused game draws once, then only after a resize or a canvas restore', async t => {
  const page = await game(t);
  await startCpuMatch(page);
  await page.evaluate(() => play(10));
  await page.keyboard.press('KeyP');
  const paused = await page.evaluate(() => {
    paints = 0; play(30);
    return { screen: __game.screen, paints };
  });
  assert.deepEqual(paused, { screen: 'pause', paints: 1 });

  await page.setViewportSize({ width: 1000, height: 600 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  assert.equal(await page.evaluate(() => { paints = 0; play(20); return paints; }), 1, 'resize redraws once');

  const restored = await page.evaluate(() => {
    const canvas = document.getElementById('game'), ctx = canvas.getContext('2d');
    canvas.width = canvas.width; // a restored 2D context has lost its pixels and drawing state
    canvas.dispatchEvent(new Event('contextrestored'));
    paints = 0; play(20);
    const main = { paints, scale: ctx.getTransform().a };
    // the cached table layer is an offscreen canvas with its own restore event
    let tables = 0;
    const renderTable = PoolArt.renderTable;
    PoolArt.renderTable = function () { tables++; return renderTable.apply(this, arguments); };
    restorable.filter(c => c !== canvas).forEach(c => c.dispatchEvent(new Event('contextrestored')));
    paints = 0; play(20);
    return { main, table: { paints, tables } };
  });
  assert.deepEqual(restored, { main: { paints: 1, scale: 1000 / 1280 }, table: { paints: 1, tables: 1 } });

  await page.keyboard.press('KeyP');
  assert.deepEqual(await page.evaluate(() => { paints = 0; play(10); return [__game.screen, paints]; }), ['game', 10]);
});

test('reduced motion skips confetti and the pot zoom but keeps the slow motion', async t => {
  const page = await game(t);
  const shot = () => page.evaluate(() => {
    __game.trick(0); stepGame(2);
    const aim = __game.autoAim();
    __game.shoot(aim.power);
    let zoom = 1, slow = 1;
    for (let i = 0; i < 600 && (__game.phase === 'strike' || __game.phase === 'rolling'); i++) {
      stepGame(1); zoom = Math.max(zoom, __game.zoom); slow = Math.min(slow, __game.timeScale);
    }
    return { zoom: zoom > 1.01, slow: slow < 0.8, phase: __game.phase, confetti: __game.confetti };
  });
  assert.deepEqual(await shot(), { zoom: true, slow: true, phase: 'won', confetti: 120 });
  await page.evaluate(() => Kit.motion.setPreference('reduce'));
  assert.equal(await page.evaluate(() => __game.confetti), 0, 'switching to reduced motion clears falling confetti');
  assert.deepEqual(await shot(), { zoom: false, slow: true, phase: 'won', confetti: 0 });
});
