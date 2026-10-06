import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { clickControl } from '../ui-input.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
let browser, server, origin;

before(async () => {
  server = http.createServer(async (req, res) => {
    try {
      let file = path.resolve(root, '.' + new URL(req.url, 'http://local').pathname);
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

async function game(t) {
  const context = await browser.newContext(), page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(() => {
    let kit;
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = update => { window.stepGame = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); }; return { stop() {} }; };
    } });
  });
  await page.goto(`${origin}/games/pizza-clicker/`);
  await clickControl(page, '#bPlay');
  return page;
}

test('denied saves retain earned pizza and purchases, block leaving, and recover on retry', async t => {
  const page = await game(t);
  const previous = await page.evaluate(() => localStorage.getItem('sg:pizza-clicker:save'));
  await page.evaluate(() => {
    window.restoreStorage = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'sg:pizza-clicker:save') throw new DOMException('blocked', 'SecurityError');
      return window.restoreStorage.call(this, key, value);
    };
    __game.add(1000); __game.buy(0); __game.save();
  });
  const earned = await page.evaluate(() => ({ pizzas: __game.S.pizzas, owned: __game.S.owned.slice() }));
  assert.equal(earned.owned[0], 1);
  assert.equal(await page.evaluate(() => localStorage.getItem('sg:pizza-clicker:save')), previous);
  await page.locator('#bPause').click();
  await page.locator('#bMenu').click();
  assert.equal(await page.evaluate(() => __game.mode), 'pause');
  await page.locator('.sg-save-status button').click();
  assert.equal(await page.locator('.sg-save-status[data-state="failed"]').isVisible(), true);
  await page.evaluate(() => { Storage.prototype.setItem = window.restoreStorage; });
  await page.locator('.sg-save-status button').click();
  assert.equal(await page.locator('.sg-save-status[data-state="failed"]').count(), 0);
  await page.locator('#bMenu').click();
  assert.equal(await page.evaluate(() => __game.mode), 'title');
  await page.reload();
  assert.deepEqual(await page.evaluate(() => ({ pizzas: __game.S.pizzas, owned: __game.S.owned })), earned);
});

test('focus-loss pause preserves idle credit once and menu return cannot count it twice', async t => {
  const page = await game(t);
  const before = await page.evaluate(() => {
    let clock = Date.now(); Date.now = () => clock;
    window.advanceAway = seconds => { clock += seconds * 1000; };
    __game.add(1000); __game.buy(0);
    window.dispatchEvent(new Event('blur'));
    return { pizzas: __game.S.pizzas, playTime: __game.S.playTime };
  });
  assert.equal(await page.evaluate(() => __game.mode), 'pause');
  await page.evaluate(() => { stepGame(120); advanceAway(60); });
  assert.deepEqual(await page.evaluate(() => ({ pizzas: __game.S.pizzas, playTime: __game.S.playTime })), before);
  await page.locator('#bResume').click();
  const collected = await page.evaluate(() => __game.S.pizzas);
  assert.ok(collected > before.pizzas);
  await page.evaluate(() => { window.dispatchEvent(new Event('blur')); advanceAway(60); });
  await page.locator('#bMenu').click();
  const fromMenu = await page.evaluate(() => __game.S.pizzas);
  assert.ok(fromMenu > collected);
  await clickControl(page, '#bPlay');
  await page.evaluate(() => advanceAway(60));
  await page.locator('#bPause').click();
  await page.locator('#bResume').click();
  assert.equal(await page.evaluate(() => __game.S.pizzas), fromMenu, 'a manual pause adds no already-collected away interval');
});
