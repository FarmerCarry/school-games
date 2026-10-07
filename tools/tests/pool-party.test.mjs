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
async function game(t) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(() => {
    let kit;
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = update => { window.stepGame = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); }; return { stop() {} }; };
    } });
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
