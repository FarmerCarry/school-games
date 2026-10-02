import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const earlierMissions = ['s150', 'c10', 'p3', 'j1', 's400', 'r5', 'z2', 'c25', 'p6'];
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

function fixture(overrides = {}) {
  return { best: 240, bestDist: 180.5, coins: 100, owned: ['red'], car: 'red',
    runs: 3, done: [...earlierMissions, 'buy'], giftAt: 123456789, gems: 2, music: false, ...overrides };
}

async function game(t, entries) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, [], 'game should not throw'); });
  await page.addInitScript(entries => {
    if (!sessionStorage.getItem('drift-fixture')) {
      for (const [key, value] of Object.entries(entries)) localStorage.setItem('sg:drift-king:' + key, JSON.stringify(value));
      sessionStorage.setItem('drift-fixture', '1');
    }
    // Keep the scene deterministic while exercising real UI and Storage writes.
    window.requestAnimationFrame = () => 0;
  }, entries);
  await page.goto(origin + '/games/drift-king/');
  await page.waitForFunction(() => window.__game?.debug);
  return page;
}

async function snapshot(page) {
  return page.evaluate(() => ({
    current: JSON.parse(JSON.stringify(__game.debug.save)),
    stored: Kit.store('drift-king').get('save', null),
    model: __game.model.id
  }));
}

async function openGarage(page) {
  await page.locator('#btnGarage').click();
}

async function chooseCar(page, id) {
  const index = await page.evaluate(id => DK.CARS.findIndex(car => car.id === id), id);
  await page.locator('#grid .gcard').nth(index).click();
}

async function exhaustStorage(page) {
  const size = await page.evaluate(() => {
    let lo = 0, hi = 10 * 1024 * 1024;
    while (lo + 1 < hi) {
      const mid = Math.floor((lo + hi) / 2);
      try { localStorage.setItem('quota-fixture', 'x'.repeat(mid)); lo = mid; } catch { hi = mid; }
    }
    localStorage.setItem('quota-fixture', 'x'.repeat(lo));
    return lo;
  });
  assert.ok(size > 0, 'fixture must fill actual browser storage');
}

async function saveFromPause(page) {
  await page.locator('#btnGarageClose').click();
  // The play button continuously bounces; use its native keyboard activation.
  await page.locator('#btnPlay').press('Enter');
  await page.locator('#btnPause').click();
}

test('legacy progress migrates as one complete record and stale legacy keys never override it', async t => {
  const legacy = fixture({ owned: ['red', 'taxi'], car: 'taxi' });
  const page = await game(t, legacy);
  assert.deepEqual((await snapshot(page)).current, { v: 1, ...legacy });
  assert.equal((await snapshot(page)).stored, null, 'migration waits for a successful save');
  await openGarage(page);
  await chooseCar(page, 'red');
  assert.deepEqual((await snapshot(page)).stored, { v: 1, ...legacy, car: 'red' });
  const unchanged = await page.evaluate(keys => Object.fromEntries(keys.map(key =>
    [key, JSON.parse(localStorage.getItem('sg:drift-king:' + key))])), Object.keys(legacy));
  assert.deepEqual(unchanged, legacy, 'new saves must not write any legacy fields');
  await page.evaluate(() => {
    localStorage.setItem('sg:drift-king:coins', '9999');
    localStorage.setItem('sg:drift-king:owned', '["red"]');
    localStorage.setItem('sg:drift-king:car', '"red"');
  });
  await page.reload();
  assert.deepEqual((await snapshot(page)).current, { v: 1, ...legacy, car: 'red' });
});

test('saved values are normalized without dropping valid owned cars', async t => {
  const raw = fixture({ v: 1, best: '240.9', bestDist: '180.5', coins: '123.8',
    owned: ['taxi', 'taxi', 'missing-car', null], car: 'missing-car', runs: -3,
    done: ['buy', 'buy', 'missing-mission', null], giftAt: 'Infinity', gems: {}, music: 'false' });
  const page = await game(t, { ...fixture({ coins: 9999 }), save: raw });
  const expected = { v: 1, best: 240, bestDist: 180.5, coins: 123, owned: ['red', 'taxi'],
    car: 'red', runs: 0, done: ['buy'], giftAt: 0, gems: 0, music: true };
  assert.deepEqual((await snapshot(page)).current, expected);
  await openGarage(page);
  await chooseCar(page, 'red');
  assert.deepEqual((await snapshot(page)).stored, expected);
  await page.reload();
  assert.deepEqual((await snapshot(page)).current, expected);
});

test('real quota failure during first migration preserves legacy coins and denies the purchase', async t => {
  const legacy = fixture();
  const page = await game(t, legacy);
  await openGarage(page);
  await exhaustStorage(page);
  await page.evaluate(() => { window.purchaseSounds = 0; DK.snd.buy = () => { purchaseSounds++; }; });
  await chooseCar(page, 'taxi');
  assert.deepEqual(await snapshot(page), { current: { v: 1, ...legacy }, stored: null, model: 'red' });
  assert.equal(await page.evaluate(() => purchaseSounds), 0, 'failed purchase must not celebrate');
  assert.match(await page.locator('#toast').textContent(), /لم تُخصم العملات/);
  assert.equal(await page.locator('#gCoins').textContent(), '100');
  await page.reload();
  assert.deepEqual((await snapshot(page)).current, { v: 1, ...legacy });
  await page.evaluate(() => localStorage.removeItem('quota-fixture'));
  await openGarage(page);
  await chooseCar(page, 'taxi');
  const expected = { v: 1, ...legacy, coins: 40, owned: ['red', 'taxi'], car: 'taxi' };
  assert.deepEqual((await snapshot(page)).stored, expected);
  await page.reload();
  assert.deepEqual((await snapshot(page)).current, expected);
});

test('a rejected purchase cannot reappear in a later save and retry awards its mission exactly once', async t => {
  const saved = { v: 1, ...fixture({ done: earlierMissions }) };
  const page = await game(t, { save: saved });
  await openGarage(page);
  await exhaustStorage(page);
  await chooseCar(page, 'taxi');
  assert.deepEqual(await snapshot(page), { current: saved, stored: saved, model: 'red' });
  await page.evaluate(() => localStorage.removeItem('quota-fixture'));
  await saveFromPause(page);
  assert.deepEqual((await snapshot(page)).stored, saved, 'later checkpoints must not resurrect a failed purchase');
  await page.locator('#btnMenu').click();
  await openGarage(page);
  await chooseCar(page, 'taxi');
  const expected = { ...saved, coins: 80, owned: ['red', 'taxi'], car: 'taxi', done: [...earlierMissions, 'buy'] };
  assert.deepEqual((await snapshot(page)).stored, expected);
  await page.reload();
  assert.deepEqual((await snapshot(page)).current, expected);
  await openGarage(page);
  await chooseCar(page, 'taxi');
  assert.deepEqual((await snapshot(page)).stored, expected, 'selecting an owned car must not charge or reward again');
});

test('a mission-save failure after purchase retains a coherent purchase and retries the reward once', async t => {
  const saved = { v: 1, ...fixture({ done: earlierMissions }) };
  const page = await game(t, { save: saved });
  await openGarage(page);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    let attempts = 0;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'sg:drift-king:save' && ++attempts === 2) throw new DOMException('fixture', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await chooseCar(page, 'taxi');
  const purchase = { ...saved, coins: 40, owned: ['red', 'taxi'], car: 'taxi' };
  const rewarded = { ...purchase, coins: 80, done: [...earlierMissions, 'buy'] };
  assert.deepEqual(await snapshot(page), { current: rewarded, stored: purchase, model: 'taxi' });
  await saveFromPause(page);
  assert.deepEqual((await snapshot(page)).stored, rewarded);
  await page.reload();
  assert.deepEqual((await snapshot(page)).current, rewarded);
  await openGarage(page);
  await chooseCar(page, 'taxi');
  assert.deepEqual((await snapshot(page)).stored, rewarded);
});
