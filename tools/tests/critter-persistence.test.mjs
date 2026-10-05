import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
let browser, server, origin, definitions;

before(async () => {
  const sandbox = { window: {} };
  vm.runInNewContext(await fs.readFile(path.join(repo, 'games/critter-mart/data.js'), 'utf8'), sandbox);
  definitions = sandbox.window.CM.UNLOCKS;
  server = http.createServer(async (req, res) => {
    try {
      let file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
      if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
      if ((await fs.stat(file)).isDirectory()) file = path.join(file, 'index.html');
      res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' }).end(await fs.readFile(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await launchChromium();
});
after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

function fixture(overrides = {}) {
  const un = {};
  definitions.filter(d => d.cost > 0 && d.id !== 'statue').forEach(d => { un[d.id] = true; });
  const shelves = {};
  definitions.filter(d => d.kind === 'shelf').forEach(d => { shelves[d.id] = 8; });
  return { v: 1, coins: 0, un, paid: {}, up: {}, shelves, mach: {}, piles: {}, carry: [],
    stats: { earned: 0, served: 0, play: 900 }, last: Date.now(), rate: 0, tut: 6, lvl: 11,
    px: 700, py: 1750, done: false, pendingOffline: 0, ...overrides };
}

async function gamePage(t, save, meta = {}, init) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(({ save, meta }) => {
    if (!sessionStorage.getItem('critterFixture')) {
      localStorage.setItem('sg:critter-mart:save', JSON.stringify(save));
      localStorage.setItem('sg:critter-mart:meta', JSON.stringify(meta));
      sessionStorage.setItem('critterFixture', '1');
    }
    let seed = 123456789;
    Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    let kit;
    Object.defineProperty(window, 'Kit', {
      configurable: true, get: () => kit,
      set(value) {
        kit = value;
        kit.loop = update => {
          window.stepGame = (count = 1) => { for (let i = 0; i < count; i++) update(1 / 60); };
          return { stop() {} };
        };
      }
    });
  }, { save, meta });
  if (init) await page.addInitScript(init);
  await page.goto(origin + '/games/critter-mart/');
  await page.waitForFunction(() => window.__game && window.stepGame);
  return page;
}

test('a denied save retains earned coins and purchases until retry can persist them', async t => {
  const page = await gamePage(t, fixture({ coins: 1000 }));
  const previous = await page.evaluate(() => localStorage.getItem('sg:critter-mart:save'));
  await page.evaluate(() => {
    window.restoreStorage = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'sg:critter-mart:save') throw new DOMException('blocked', 'SecurityError');
      return window.restoreStorage.call(this, key, value);
    };
    __game.start(); __game.give(500); __game.tp(1646, 918); stepGame();
  });
  await page.locator('.cm-upg-row').first().click();
  const earned = await page.evaluate(() => ({ coins: __game.S().coins, up: structuredClone(__game.S().up) }));
  assert.equal(earned.up.speed, 1);
  assert.equal(await page.evaluate(() => localStorage.getItem('sg:critter-mart:save')), previous);
  assert.equal(await page.locator('.sg-save-status[data-state="failed"]').isVisible(), true);
  await page.evaluate(() => { __game.pause(); document.getElementById('menuBtn').click(); });
  assert.equal(await page.evaluate(() => __game.mode), 'pause', 'failed Save & Quit keeps the current session');
  await page.locator('.sg-save-status button').click();
  assert.equal(await page.locator('.sg-save-status[data-state="failed"]').isVisible(), true);
  await page.evaluate(() => { Storage.prototype.setItem = window.restoreStorage; });
  await page.locator('.sg-save-status button').click();
  assert.equal(await page.locator('.sg-save-status[data-state="failed"]').count(), 0);
  await page.reload();
  assert.deepEqual(await page.evaluate(() => ({ coins: __game.S().coins, up: __game.S().up })), earned);
});

test('denied metadata writes keep their warning until metadata and progress both recover', async t => {
  const page = await gamePage(t, fixture(), {}, () => {
    window.restoreStorage = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'sg:critter-mart:meta') throw new DOMException('blocked', 'SecurityError');
      return window.restoreStorage.call(this, key, value);
    };
  });
  await page.evaluate(() => { __game.start(); __game.pause(); document.getElementById('musicBtn').click(); });
  assert.equal(await page.evaluate(() => __game.save()), false);
  assert.equal(await page.locator('.sg-save-status[data-state="failed"]').isVisible(), true);
  await page.evaluate(() => { Storage.prototype.setItem = window.restoreStorage; });
  await page.locator('.sg-save-status button').click();
  assert.equal(await page.evaluate(() => Kit.store('critter-mart').get('meta').music), false);
  assert.equal(await page.locator('.sg-save-status[data-state="failed"]').count(), 0);
});

async function snapshot(page) {
  return page.evaluate(() => ({ state: __game.state(), save: Kit.store('critter-mart').get('save'), meta: Kit.store('critter-mart').get('meta') }));
}

function totalJuice(data) {
  const shelf = Number(data.state.shelves.find(s => s.startsWith('juice:')).split(':')[1]);
  return shelf + data.state.helperStacks.reduce((n, h) => n + h.stack.filter(type => type === 'juice').length, 0) + data.state.recoveryCarry.filter(type => type === 'juice').length;
}

test('stable helper inventories survive repeated checkpoints and reloads with full destinations', async t => {
  const helperCarry = { farmer1: ['juice', 'juice'], farmer2: ['popcorn'], farmer3: ['icecream', 'icecream'] };
  // Disable customer spawning so inventory conservation is independent of sales.
  const page = await gamePage(t, fixture({ tut: 0, helperCarry }));
  for (let cycle = 0; cycle < 3; cycle++) {
    await page.evaluate(() => { __game.start(); stepGame(120); __game.pause(); __game.save(); __game.save(); });
    const data = await snapshot(page);
    assert.deepEqual(Object.fromEntries(data.state.helperStacks.map(h => [h.id, h.stack])), helperCarry);
    assert.deepEqual(data.save.helperCarry, helperCarry);
    assert.deepEqual(data.state.recoveryCarry, []);
    await page.reload();
  }
  assert.deepEqual((await snapshot(page)).save.helperCarry, helperCarry);
});

test('a helper deposits available stock and retains overflow instead of throwing it away', async t => {
  const save = fixture({ tut: 0, helperCarry: { farmer1: ['juice', 'juice', 'juice', 'juice'] } });
  delete save.un.farmer2; delete save.un.farmer3;
  save.shelves.juiceShelf = 7;
  const page = await gamePage(t, save);
  assert.equal(totalJuice(await snapshot(page)), 11);
  await page.evaluate(() => { __game.start(); stepGame(1000); __game.pause(); });
  const data = await snapshot(page);
  assert.equal(totalJuice(data), 11);
  assert.ok(data.state.shelves.includes('juice:8'));
  assert.deepEqual(data.save.helperCarry.farmer1, ['juice', 'juice', 'juice']);
  await page.reload();
  assert.equal(totalJuice(await snapshot(page)), 11);
  assert.deepEqual((await snapshot(page)).save.helperCarry.farmer1, ['juice', 'juice', 'juice']);
});

test('unmatched helper stock uses a persistent recovery queue without duplication', async t => {
  const save = fixture({ tut: 0, helperCarry: { removedFarmer: ['juice', 'juice', 'unknown-item', '__proto__', null] }, recoveryCarry: ['juice'] });
  save.shelves.juiceShelf = 7;
  delete save.un.farmer1; delete save.un.farmer2; delete save.un.farmer3;
  const page = await gamePage(t, save);
  assert.deepEqual((await snapshot(page)).state.recoveryCarry, ['juice', 'juice', 'juice']);
  for (let cycle = 0; cycle < 3; cycle++) {
    await page.evaluate(() => { __game.start(); stepGame(); __game.pause(); __game.save(); });
    const data = await snapshot(page);
    assert.ok(data.state.shelves.includes('juice:8'));
    assert.deepEqual(data.state.recoveryCarry, ['juice', 'juice']);
    assert.deepEqual(data.save.recoveryCarry, ['juice', 'juice']);
    assert.deepEqual(data.save.helperCarry, {});
    assert.equal(totalJuice(data), 10);
    await page.reload();
  }
});

test('legacy saves lacking helper fields load with empty inventories and keep ordinary progress', async t => {
  const page = await gamePage(t, fixture({ coins: 123 }));
  const data = await snapshot(page);
  assert.equal(data.state.coins, 123);
  assert.ok(data.state.helperStacks.every(h => h.stack.length === 0));
  assert.deepEqual(data.state.recoveryCarry, []);
  assert.equal(data.state.finalePending, false);
});

test('pointer upgrade purchases restore movement, upgrade shortcuts and pause keys', async t => {
  const page = await gamePage(t, fixture({ coins: 1000 }));
  await page.evaluate(() => { __game.start(); __game.tp(1646, 918); stepGame(); });
  await page.locator('.cm-upg-row').first().click();
  assert.equal(await page.evaluate(() => document.activeElement.id), 'game');
  assert.equal((await snapshot(page)).save.up.speed, 1);
  await page.keyboard.press('Digit2');
  await page.evaluate(() => stepGame());
  assert.equal((await snapshot(page)).save.up.carry, 1, 'number shortcuts still buy upgrades at the desk');
  await page.keyboard.press('Escape');
  await page.evaluate(() => stepGame());
  assert.equal((await snapshot(page)).state.mode, 'pause');
  await page.keyboard.press('Escape');
  await page.evaluate(() => stepGame());
  assert.equal((await snapshot(page)).state.mode, 'play');
  const before = (await snapshot(page)).state.player.y;
  await page.keyboard.down('KeyS');
  await page.evaluate(() => stepGame(24));
  await page.keyboard.up('KeyS');
  assert.ok((await snapshot(page)).state.player.y > before + 20, 'WASD moves after a pointer purchase');
});

test('keyboard upgrade purchases preserve native activation and Tab navigation', async t => {
  const page = await gamePage(t, fixture({ coins: 1000 }));
  await page.evaluate(() => { __game.start(); __game.tp(1646, 918); stepGame(); });
  const rows = page.locator('.cm-upg-row');
  await rows.first().focus();
  await page.keyboard.press('Enter');
  assert.equal((await snapshot(page)).save.up.speed, 1);
  assert.equal(await rows.first().evaluate(row => document.activeElement === row), true);
  await page.keyboard.press('Tab');
  assert.equal(await rows.nth(1).evaluate(row => document.activeElement === row), true);
  await page.keyboard.press('Space');
  assert.equal((await snapshot(page)).save.up.carry, 1);
  assert.equal(await rows.nth(1).evaluate(row => document.activeElement === row), true);
  await page.locator('#game').focus();
  await page.keyboard.press('Digit3');
  await page.evaluate(() => stepGame());
  assert.equal((await snapshot(page)).save.up.grow, 1);
});

test('normal final-pad payment survives reload before its delay and records completion once', async t => {
  const page = await gamePage(t, fixture({ coins: 6000 }));
  await page.evaluate(() => { __game.start(); __game.tp(960, 1845); stepGame(110); __game.pause(); });
  const bought = await snapshot(page);
  assert.equal(bought.save.un.statue, true);
  assert.equal(bought.save.coins, 0);
  assert.equal(bought.save.done, false);
  assert.equal(bought.save.finalePending, true);
  assert.ok(bought.save.completionTime > 900 && bought.save.completionTime < bought.save.stats.play);
  assert.equal(bought.save.cheat, undefined);
  const finishTime = bought.save.completionTime;
  for (let cycle = 0; cycle < 3; cycle++) {
    await page.reload();
    await page.evaluate(() => __game.start());
    const data = await snapshot(page);
    assert.equal(data.state.mode, 'finale');
    assert.equal(data.save.done, true);
    assert.equal(data.save.finalePending, true);
    assert.equal(data.save.completionTime, finishTime);
    assert.equal(data.meta.best, finishTime);
    assert.equal(data.state.coins, 0);
    assert.equal(data.save.stats.served, bought.save.stats.served);
  }
  await page.evaluate(() => document.getElementById('keepBtn').click());
  assert.equal((await snapshot(page)).save.finalePending, false);
  await page.reload();
  await page.evaluate(() => __game.start());
  assert.equal((await snapshot(page)).state.mode, 'play');
  assert.equal((await snapshot(page)).meta.best, finishTime);
});

test('offline collection takes precedence over a pending finale and credits once', async t => {
  const save = fixture({ pendingOffline: 25, finalePending: true, completionTime: 123 });
  save.un.statue = true;
  const page = await gamePage(t, save);
  await page.evaluate(() => __game.start());
  assert.equal((await snapshot(page)).state.mode, 'welcome');
  await page.evaluate(() => document.getElementById('collectBtn').click());
  const data = await snapshot(page);
  assert.equal(data.state.mode, 'finale');
  assert.equal(data.save.done, true);
  assert.equal(data.save.pendingOffline, 0);
  assert.equal(data.save.coins, 25);
  assert.equal(data.save.stats.earned, 25);
  assert.equal(data.meta.best, 123);
  await page.reload();
  await page.evaluate(() => __game.start());
  assert.equal((await snapshot(page)).state.mode, 'finale');
  assert.equal((await snapshot(page)).state.coins, 25);
  assert.equal((await snapshot(page)).save.stats.earned, 25);
});

test('leaving the finale through its menu acknowledges it durably', async t => {
  const save = fixture({ done: true, finalePending: true, completionTime: 123 });
  save.un.statue = true;
  const page = await gamePage(t, save, { best: 123 });
  await page.evaluate(() => { __game.start(); document.getElementById('finMenuBtn').click(); });
  assert.equal((await snapshot(page)).state.mode, 'title');
  assert.equal((await snapshot(page)).save.finalePending, false);
  await page.reload();
  await page.evaluate(() => __game.start());
  assert.equal((await snapshot(page)).state.mode, 'play');
  assert.equal((await snapshot(page)).meta.best, 123);
});

test('legacy final purchase with done=false recovers its saved completion time', async t => {
  const save = fixture({ stats: { earned: 17, served: 3, play: 987 } });
  save.un.statue = true;
  const page = await gamePage(t, save);
  assert.equal((await snapshot(page)).save.completionTime, 987);
  await page.evaluate(() => __game.start());
  const data = await snapshot(page);
  assert.equal(data.state.mode, 'finale');
  assert.equal(data.meta.best, 987);
  assert.equal(data.save.done, true);
  assert.equal(data.save.stats.served, 3);
  assert.equal(data.save.stats.earned, 17);
});

test('completed legacy saves remain acknowledged', async t => {
  const save = fixture({ done: true });
  save.un.statue = true;
  const page = await gamePage(t, save, { best: 400 });
  await page.evaluate(() => __game.start());
  const data = await snapshot(page);
  assert.equal(data.state.mode, 'play');
  assert.equal(data.state.finalePending, false);
  assert.equal(data.meta.best, 400);
});

for (const condition of [{ name: 'a better existing record', cheat: false, best: 100 }, { name: 'a cheated run', cheat: true, best: 0 }]) {
  test(`completion preserves ${condition.name}`, async t => {
    const save = fixture({ finalePending: true, completionTime: 300, cheat: condition.cheat });
    save.un.statue = true;
    const page = await gamePage(t, save, { best: condition.best });
    await page.evaluate(() => __game.start());
    const data = await snapshot(page);
    assert.equal(data.state.mode, 'finale');
    assert.equal(data.save.done, true);
    assert.equal(data.meta.best, condition.best);
    assert.equal(data.save.finaleWasBest, false);
  });
}
