import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
const earlierMissions = ['s150', 'c10', 'p3', 'j1', 's400', 'r5', 'z2', 'c25', 'p6'];
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
  assert.equal(await page.locator('.sg-save-status').isHidden(), true, 'a rejected purchase changes nothing; its toast is enough');
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

test('restart or menu from pause keeps a best the run already beat without counting the run', async t => {
  const saved = { v: 1, ...fixture() };
  const page = await game(t, { save: saved });
  await page.locator('#btnPlay').press('Enter');
  await page.evaluate(() => __game.debug.skip(300));
  await page.locator('#btnPause').click();
  await page.locator('#btnRestart').click();
  let { stored } = await snapshot(page);
  assert.equal(stored.best, 300);
  assert.ok(stored.bestDist >= 300, 'the best-distance flag moves with the record');
  assert.equal(stored.runs, saved.runs, 'an abandoned run is not counted');
  await page.evaluate(() => __game.debug.skip(400));
  await page.locator('#btnPause').click();
  await page.locator('#btnMenu').click();
  ({ stored } = await snapshot(page));
  assert.deepEqual([stored.best, stored.runs, stored.coins, stored.done], [400, saved.runs, saved.coins, saved.done]);
  assert.equal(await page.locator('#tBest').textContent(), '400');
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
  const status = page.locator('.sg-save-status');
  assert.equal(await status.getAttribute('data-state'), 'failed', 'the unsaved reward shows the save warning');
  await saveFromPause(page);
  assert.deepEqual((await snapshot(page)).stored, rewarded);
  assert.equal(await status.getAttribute('data-state'), 'saved', 'a confirmed later save clears the warning');
  await page.reload();
  assert.deepEqual((await snapshot(page)).current, rewarded);
  await openGarage(page);
  await chooseCar(page, 'taxi');
  assert.deepEqual((await snapshot(page)).stored, rewarded);
});

test('a failed gift save keeps the saved record, warns, and Retry writes the gift', async t => {
  const saved = { v: 1, ...fixture({ giftAt: 0 }) };
  const page = await game(t, { save: saved });
  await exhaustStorage(page);
  // A plain click: the title's bottom row used to swallow clicks on this button.
  await page.locator('#btnGift').click();
  await page.locator('#giftBox').click();
  const status = page.locator('.sg-save-status');
  assert.equal(await status.getAttribute('data-state'), 'failed');
  let { current, stored } = await snapshot(page);
  assert.deepEqual(stored, saved, 'a failed write keeps the saved progress');
  assert.ok(current.coins > saved.coins && current.giftAt > 0, 'the gift still counts in this session');
  await page.evaluate(() => localStorage.removeItem('quota-fixture'));
  await status.locator('button').click();
  ({ current, stored } = await snapshot(page));
  assert.deepEqual(stored, current);
  assert.equal(await status.getAttribute('data-state'), 'saved');
});

test('on a 4:3 screen and in small portal frames the save warning keeps clear of the how-to line, garage prices and results buttons', async t => {
  const page = await game(t, { save: { v: 1, ...fixture() } });
  const resize = async (width, height) => {
    await page.setViewportSize({ width, height });
    // timer polling: requestAnimationFrame is stubbed by the fixture
    await page.waitForFunction(width => document.getElementById('c').style.width === width + 'px', width, { polling: 50 });
  };
  await resize(1024, 768);
  await page.evaluate(() => {
    Storage.prototype.setItem = () => { throw new DOMException('fixture', 'QuotaExceededError'); };
    __game.debug.addCoins(0);
  });
  // the full message (as in the 6 s after a failure, however slow the run) or the folded badge
  const covered = (selector, compact = false) => page.evaluate(async ([selector, compact]) => {
    await document.fonts.ready;
    const panel = document.querySelector('.sg-save-status:not([hidden])');
    panel.setAttribute('data-compact', String(compact));
    // settle the panel's pop-in; the looping title animations are far from the warning
    for (const a of document.getAnimations()) if (a.effect.getComputedTiming().endTime !== Infinity) a.finish();
    const b = panel.getBoundingClientRect();
    return [...document.querySelectorAll(selector)].filter(e => {
      const r = e.getBoundingClientRect();
      return r.left < b.right && b.left < r.right && r.top < b.bottom && b.top < r.bottom;
    }).length;
  }, [selector, compact]);
  const both = async selector => [await covered(selector), await covered(selector, true)];
  const title = '.howto, #btnPlay, .card.missions', cars = '#grid .gname, #grid .nbtn';
  assert.equal(await covered(title), 0);
  await openGarage(page);
  assert.equal(await covered(cars), 0);
  // the portal's game frame on 1280x720 and 1280x1024 screens, and on 1366x768 at 125 %
  for (const [width, height] of [[942, 530], [789, 444]]) {
    await resize(width, height);
    assert.deepEqual(await both(cars), [0, 0], `garage at ${width}x${height}`);
  }
  await page.locator('#btnGarageClose').click();
  assert.deepEqual(await both(title), [0, 0], 'title at 789x444');
  assert.equal(await page.evaluate(() => {
    __game.debug.start(); __game.debug.skip(40);
    for (let i = 0; i < 1200 && __game.mode !== 'over'; i++) __game.debug.stepN(1);
    return __game.mode;
  }), 'over');
  assert.deepEqual(await both('#over button'), [0, 0], 'results at 789x444');
});
