import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
let browser, server;
before(async () => { server = await startTestServer(root); browser = await launchChromium(); });
after(async () => { await browser?.close(); await server?.close(); });

async function game(t, { saved } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(saved => {
    if (saved !== undefined) localStorage.setItem('sg:castle-crash:stars', saved);
    let kit;
    const cc = window.cc = { stats: [], failSave: false };
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = (update, render) => {
        cc.step = (n = 1) => { for (let i = 0; i < n; i++) { update(1 / 60); render(); } };
        cc.run = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); };
        return { stop() {} };
      };
      for (const name of ['round', 'end', 'tutorial']) {
        const call = kit.stats[name];
        kit.stats[name] = function (...args) { cc.stats.push([name, ...args]); return call.apply(this, args); };
      }
    } });
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key) {
      if (String(key).startsWith('sg:castle-crash:') && cc.failSave) throw new DOMException('Full storage fixture', 'QuotaExceededError');
      return write.apply(this, arguments);
    };
  }, saved === undefined ? null : saved);
  await page.goto(`${server.origin}/games/castle-crash/`);
  await page.waitForFunction(() => window.__game && window.cc && window.cc.step);
  return page;
}

test('a level records w1-1 and exactly one end', async t => {
  const page = await game(t);
  await page.locator('#bPlay').click();
  await page.evaluate(() => { cc.step(2); __game.solve(); cc.run(2500); cc.step(1); });
  assert.equal(await page.evaluate(() => __game.state), 'result');
  const stats = await page.evaluate(() => cc.stats.filter(s => s[0] !== 'tutorial'));
  const rounds = stats.filter(s => s[0] === 'round');
  const ends = stats.filter(s => s[0] === 'end');
  assert.deepEqual(rounds, [['round', 'w1-1']]);
  assert.equal(ends.length, 1);
  assert.ok(ends[0][1] === 'win' || ends[0][1] === 'lose');
  assert.ok(ends[0][2] >= 0 && ends[0][2] <= 3);
});

test('keyboard aiming and firing work without the mouse', async t => {
  const page = await game(t);
  await page.locator('#bPlay').click();
  await page.evaluate(() => { document.activeElement && document.activeElement.blur(); cc.step(2); });
  const before = await page.evaluate(() => __game.aim);
  await page.keyboard.down('ArrowUp');
  await page.evaluate(() => cc.step(12));
  await page.keyboard.up('ArrowUp');
  const after = await page.evaluate(() => __game.aim);
  assert.ok(after > before + 0.05, `aim ${before} -> ${after}`);
  await page.keyboard.press('Space');
  await page.evaluate(() => cc.step(4));
  assert.equal(await page.evaluate(() => __game.phase), 'fly');
  assert.equal(await page.evaluate(() => __game.shots), 1);
});

test('a mouse drag fires', async t => {
  const page = await game(t);
  await page.locator('#bPlay').click();
  await page.evaluate(() => cc.step(2));
  const sling = await page.evaluate(() => __game.slingPoint());
  await page.mouse.move(sling.x, sling.y);
  await page.mouse.down();
  await page.mouse.move(sling.x - 90, sling.y + 50, { steps: 6 });
  await page.evaluate(() => cc.step(2));
  await page.mouse.up();
  await page.evaluate(() => cc.step(4));
  assert.equal(await page.evaluate(() => __game.phase), 'fly');
  assert.ok(await page.evaluate(() => __game.shots) >= 1);
});

test('a 2P duel records duel:pvp and the turns alternate', async t => {
  const page = await game(t);
  await page.locator('#bDuel').click();
  await page.evaluate(() => { document.activeElement && document.activeElement.blur(); cc.step(2); });
  assert.equal(await page.evaluate(() => __game.session.turn), 0);
  await page.keyboard.press('Space');
  await page.evaluate(() => cc.step(3));
  assert.equal(await page.evaluate(() => __game.phase), 'fly');
  await page.evaluate(() => { cc.run(500); cc.step(1); });
  assert.equal(await page.evaluate(() => __game.session.turn), 1, 'the turn passes to player 2');
  await page.evaluate(() => __game.endNow());
  await page.evaluate(() => cc.step(1));
  const stats = await page.evaluate(() => cc.stats);
  assert.deepEqual(stats.filter(s => s[0] === 'round'), [['round', 'duel:pvp']]);
  assert.deepEqual(stats.filter(s => s[0] === 'end'), [['end', 'end']]);
});

test('pause freezes the physics, restart resets, and a failed save is shown', async t => {
  const page = await game(t);
  await page.locator('#bPlay').click();
  await page.evaluate(() => cc.step(8));
  const clock = await page.evaluate(() => __game.clock);
  await page.keyboard.press('KeyP');
  await page.evaluate(() => cc.step(1));
  assert.equal(await page.evaluate(() => __game.state), 'pause');
  await page.evaluate(() => cc.step(30));
  assert.equal(await page.evaluate(() => __game.clock), clock);
  await page.locator('#bRestart').click();
  await page.evaluate(() => cc.step(2));
  assert.equal(await page.evaluate(() => __game.state), 'play');
  assert.equal(await page.evaluate(() => __game.shots), 0);
  assert.equal(await page.evaluate(() => __game.phase), 'aim');
  await page.evaluate(() => { cc.failSave = true; __game.solve(); cc.run(2500); cc.step(1); });
  assert.equal(await page.locator('.sg-save-status').getAttribute('data-state'), 'failed');
});
