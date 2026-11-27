// Browser integration tests for Lucky Lake (بحيرة الحظ) in headless Chromium.
// Supports SG_ROOT for testing both source and built _site bundles.
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

async function openGame(t, { save, dda = 0.25, size = [1280, 720] } = {}) {
  const ctx = await browser.newContext({ viewport: { width: size[0], height: size[1] }, reducedMotion: 'reduce' });
  const errors = [];
  const external = [];
  ctx.on('page', page => {
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  });
  ctx.on('request', req => {
    if (!req.url().startsWith(server.origin + '/')) external.push(req.url());
  });
  t.after(async () => {
    await ctx.close();
    assert.deepEqual(errors, [], 'no page or console errors');
    assert.deepEqual(external, [], 'no external network requests');
  });

  await ctx.addInitScript(({ save, dda }) => {
    if (location.protocol !== 'http:') return;
    if (!sessionStorage.getItem('ll-seeded')) {
      sessionStorage.setItem('ll-seeded', '1');
      if (save !== undefined) {
        localStorage.setItem('sg:lucky-lake:save', typeof save === 'string' ? save : JSON.stringify(save));
      }
    }
    let kit;
    const ll = window.ll = { results: [], failSave: false };
    Object.defineProperty(window, 'Kit', {
      configurable: true,
      get: () => kit,
      set(val) {
        kit = val;
        kit.loop = (update, render) => {
          ll.step = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); render(0); };
          ll.render = () => render(0);
          return { running: true, stop() {} };
        };
        const origDda = kit.dda;
        kit.dda = (slug, opts) => {
          const ctrl = origDda.call(kit, slug, Object.assign({}, opts, { start: dda }));
          const origRes = ctrl.result;
          ctrl.result = out => { ll.results.push(out); return origRes.call(ctrl, out); };
          return ctrl;
        };
      }
    });
    const origSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key) {
      if (key === 'sg:lucky-lake:save' && window.ll && window.ll.failSave) {
        throw new DOMException('QuotaExceeded', 'QuotaExceededError');
      }
      return origSet.apply(this, arguments);
    };
  }, { save, dda });

  const page = await ctx.newPage();
  await page.goto(`${server.origin}/games/lucky-lake/`);
  await page.waitForFunction(() => !!window.__game && !!window.ll?.step);
  return page;
}

const getState = page => page.evaluate(() => window.__game.state);
const step = (page, n = 1) => page.evaluate(n => window.ll.step(n), n);
const getSave = page => page.evaluate(() => JSON.parse(localStorage.getItem('sg:lucky-lake:save') || 'null'));

test('title screen shows 5 immediately open Arabic waters; Play starts solo with 0 casts', async t => {
  const page = await openGame(t);
  await step(page, 20);
  const st0 = await getState(page);
  assert.equal(st0.screen, 'title');
  assert.equal(st0.tripOpen, false);
  assert.equal(await page.locator('.ll-water-card').count(), 5);

  await page.locator('#btnPlay').click();
  await step(page, 30);
  const st1 = await getState(page);
  assert.equal(st1.screen, 'play');
  assert.equal(st1.mode, 'solo');
  assert.equal(st1.p1.casts, 0, 'negative-input: clicking #btnPlay must not cast hook');
  assert.equal(st1.trip, 0);
  assert.ok(st1.fish.length >= 8);
});

test('both mouse click in water and Space key cast hook and haul non-blocking catches', async t => {
  const page = await openGame(t);
  await page.locator('#diffEasy').click();
  await page.locator('#btnPlay').click();
  await step(page, 2);

  // 1. Mouse click at a visible treasure chest or fish
  const target = await page.evaluate(() => {
    const f = window.__game.state.fish.find(e => !e.hazard && !e.boss) || { x: 760, y: 470 };
    return window.__game.point(f.x, f.y);
  });
  await page.mouse.move(target.x, target.y);
  await page.mouse.click(target.x, target.y);
  await step(page, 3);
  assert.equal((await getState(page)).p1.casts, 1);

  // Step until hook returns and lands catch (deep/heavy catches can take >90 frames)
  for (let i = 0; i < 12; i++) {
    await step(page, 30);
    if ((await getState(page)).p1.state === 'ready') break;
  }
  const afterMouse = await getState(page);
  assert.equal(afterMouse.screen, 'play', 'catch never opens a blocking modal');
  assert.equal(afterMouse.p1.state, 'ready');

  // 2. Space key casts again and A/D steers boat
  const xBefore = afterMouse.p1.x;
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down('KeyD');
  await step(page, 18);
  await page.keyboard.up('KeyD');
  assert.ok((await getState(page)).p1.x > xBefore + 20, 'KeyD steers boat right');

  await page.keyboard.press('Space');
  await step(page, 2);
  assert.equal((await getState(page)).p1.casts, 2);
});

test('pause freezes [time, p1, fish] completely, Escape resumes, and Restart resets casts & trip', async t => {
  const page = await openGame(t);
  await page.locator('#btnPlay').click();
  await step(page, 10);
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('Space');
  await step(page, 8);
  assert.equal((await getState(page)).p1.casts, 1);

  await page.locator('#btnPause').click();
  assert.equal((await getState(page)).screen, 'pause');

  const snap1 = await page.evaluate(() => JSON.stringify([__game.state.time, __game.state.p1, __game.state.fish]));
  await step(page, 60);
  const snap2 = await page.evaluate(() => JSON.stringify([__game.state.time, __game.state.p1, __game.state.fish]));
  assert.equal(snap2, snap1, 'simulation must stay 100% frozen while paused');

  // Escape from a focused pause button resumes play without restarting
  await page.locator('#btnRestart').focus();
  await page.keyboard.press('Escape');
  assert.equal((await getState(page)).screen, 'play');
  assert.equal((await getState(page)).p1.casts, 1);

  // Pause again and click #btnRestart
  await page.locator('#btnPause').click();
  await page.locator('#btnRestart').click();
  await step(page, 2);
  const resetState = await getState(page);
  assert.equal(resetState.screen, 'play');
  assert.equal(resetState.p1.casts, 0);
  assert.equal(resetState.trip, 0);
});

test('harbor shop purchases, monster album badges, and QuotaExceededError save recovery', async t => {
  const seeded = {
    v: 3, coins: 600, boat: 0, boats: [true, false, false, false],
    upgrades: { magnet: 0, reel: 0, shock: 0 },
    waters: [0, 1, 2, 3, 4].map(() => ({ stars: 2, best: 900, boss: true })),
    book: { turbo_shark: { count: 3, maxWeight: 95 } },
    totalCaught: 3
  };
  const page = await openGame(t, { save: seeded });

  // Open Monster Album
  await page.locator('#btnBook').click();
  assert.equal((await getState(page)).screen, 'book');
  assert.equal(await page.locator('#bookCount').textContent(), '1/25');
  await page.locator('#btnBookClose').click();

  // Open Harbor Shop and test save failure + retry banner
  await page.locator('#btnShop').click();
  await page.evaluate(() => { window.ll.failSave = true; });
  await page.locator('#boatShelf .ll-buy-btn').nth(1).click(); // Buy rocket boat (120 coins)

  const banner = page.locator('.sg-save-status');
  assert.equal(await banner.isVisible(), true);
  assert.equal(await banner.getAttribute('data-state'), 'failed');

  await page.evaluate(() => { window.ll.failSave = false; });
  await banner.locator('button').click();
  assert.equal(await banner.getAttribute('data-state'), 'saved');

  const stored = await getSave(page);
  assert.equal(stored.boat, 1);
  assert.equal(stored.boats[1], true);
  assert.equal(stored.coins, 480);
});

test('2P derby (WASD+Space vs Arrows+Enter) and timed round end summary', async t => {
  const page = await openGame(t);
  await page.locator('.ll-water-card').nth(4).click(); // Water 5: Cyber Abyss
  await page.locator('#modeVersus').click();
  await page.locator('#btnPlay').click();
  await step(page, 2);

  const st = await getState(page);
  assert.equal(st.mode, 'versus');
  assert.equal(st.water, 4);
  assert.ok(st.p1 && st.p2);

  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('Space');
  await page.keyboard.press('Enter');
  await step(page, 4);
  const castSt = await getState(page);
  assert.equal(castSt.p1.casts, 1);
  assert.equal(castSt.p2.casts, 1);

  // Advance full 75s derby to Result screen
  await step(page, 75 * 60 + 10);
  assert.equal((await getState(page)).screen, 'result');
});
