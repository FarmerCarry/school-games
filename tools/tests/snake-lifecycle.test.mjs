import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
let browser, server, origin;

before(async () => {
  server = await startTestServer(root, {
    pages: { '/snake-test-away': '<!doctype html><title>Away</title>' },
    // Keep the original server's cache headers so bfcache remains eligible.
    cacheControl: null
  });
  origin = server.origin;
  browser = await launchChromium({
    // Playwright disables this normal browser lifecycle by default.
    ignoreDefaultArgs: ['--disable-back-forward-cache']
  });
});

after(async () => {
  if (browser) await browser.close();
  await server?.close();
});

async function gamePage(t) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(() => {
    window.cacheRestores = 0;
    addEventListener('pageshow', e => { if (e.persisted) window.cacheRestores++; });
    let seed = 123456789;
    Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    // Exercise the actual update function while keeping simulation time deterministic.
    let kit;
    Object.defineProperty(window, 'Kit', {
      configurable: true,
      get: () => kit,
      set(value) {
        kit = value;
        kit.loop = (update, render) => {
          window.stepGame = (count = 1) => { for (let i = 0; i < count; i++) update(1 / 60); };
          window.renderGame = render;
          return { stop() {} };
        };
      }
    });
  });
  await page.goto(`${origin}/games/snake-arena/`);
  await page.waitForFunction(() => window.__game && window.stepGame && performance.now() > 300);
  await page.evaluate(() => document.getElementById('btnPlay').click());
  assert.equal(await page.evaluate(() => __game.state), 'play');
  return page;
}

async function backThroughCache(page) {
  const previous = await page.evaluate(() => window.cacheRestores);
  await page.goto(`${origin}/snake-test-away`);
  // A BFCache restoration does not fire a new load event.
  await page.goBack({ waitUntil: 'commit' });
  await page.waitForFunction(n => window.cacheRestores === n + 1, previous);
}

async function stats(page) {
  return page.evaluate(() => ({ current: __game.stats, stored: Kit.store('snake-arena').get('stats') }));
}

async function assertStats(page, expected) {
  const value = await stats(page);
  assert.deepEqual(value.current, expected);
  assert.deepEqual(value.stored, expected);
}

const empty = { bestLen: 0, totalKills: 0, bestKills: 0, games: 0, bestTime: 0, totalFood: 0, bestRank: 0, powerups: 0, top1Time: 0 };

for (const trigger of ['Escape', 'button']) {
  test(`Snake Arena ${trigger} pauses before a boundary collision and resumes into game over`, async t => {
    const page = await gamePage(t);
    const before = await page.evaluate(() => {
      const p = SA.world.player;
      p.hx = SA.world.R - p.r * 0.35 - 0.1; p.hy = 0; p.ang = p.want = 0; p.protect = 9999;
      SA.game.kb = true; SA.game.kbMouse.x = innerWidth / 2; SA.game.kbMouse.y = innerHeight / 2;
      return { x: p.hx, worldTime: SA.world.time };
    });
    const paused = await page.evaluate(trigger => {
      if (trigger === 'button') document.getElementById('btnPause').click();
      else window.dispatchEvent(new KeyboardEvent('keydown', { code: trigger }));
      stepGame(120);
      if (trigger !== 'button') window.dispatchEvent(new KeyboardEvent('keyup', { code: trigger }));
      return { state: __game.state, alive: SA.world.player.alive, x: SA.world.player.hx, worldTime: SA.world.time };
    }, trigger);
    assert.deepEqual(paused, { state: 'paused', alive: true, ...before });
    const after = await page.evaluate(() => {
      document.getElementById('btnResume').click();
      stepGame();
      const collisionState = __game.state;
      stepGame(120);
      return { collisionState, state: __game.state, alive: SA.world.player.alive, overVisible: !document.getElementById('over').hidden, games: __game.stats.games };
    });
    assert.deepEqual(after, { collisionState: 'dying', state: 'over', alive: false, overVisible: true, games: 1 });
  });
}

test('Snake Arena repeated BFCache checkpoints merge progress once, including final records and unlocks', async t => {
  const page = await gamePage(t);
  // Seed earned run totals to isolate checkpoint accounting from random arena encounters.
  await page.evaluate(() => {
    Object.assign(SA.game.run, { t: 5.1, kills: 2, food: 10.7, powerups: 1, bestRank: 6, top1T: 2 });
    __game.setMass(100);
    document.getElementById('btnPause').click();
  });
  const first = { bestLen: 100, totalKills: 2, bestKills: 2, games: 1, bestTime: 5, totalFood: 10, bestRank: 6, powerups: 1, top1Time: 2 };
  await backThroughCache(page);
  await assertStats(page, first);
  await backThroughCache(page);
  await assertStats(page, first);
  assert.deepEqual(await page.evaluate(() => {
    document.getElementById('btnResume').click();
    __game.god();
    SA.game.run.unlockT = 0;
    stepGame();
    return { sunny: !!SA.game.run.announced.sunny, bee: !!SA.game.run.announced.bee };
  }), { sunny: false, bee: false });

  await page.evaluate(() => {
    Object.assign(SA.game.run, { t: 10.9, kills: 4, food: 20.1, powerups: 2, bestRank: 4, top1T: 6 });
    __game.setMass(200);
    document.getElementById('btnPause').click();
  });
  const second = { bestLen: 200, totalKills: 4, bestKills: 4, games: 1, bestTime: 10, totalFood: 20, bestRank: 4, powerups: 2, top1Time: 6 };
  await backThroughCache(page);
  await assertStats(page, second);
  await page.evaluate(() => {
    document.getElementById('btnResume').click();
    Object.assign(SA.game.run, { t: 12.2, kills: 5, food: 21.9, powerups: 3, bestRank: 4, top1T: 6 });
    __game.setMass(150); // Boosting below the checkpoint peak must not lower the record.
    __game.killPlayer();
    stepGame(120);
  });
  const final = { bestLen: 200, totalKills: 5, bestKills: 5, games: 1, bestTime: 12, totalFood: 21, bestRank: 4, powerups: 3, top1Time: 6 };
  assert.equal(await page.evaluate(() => __game.state), 'over');
  await assertStats(page, final);
  assert.deepEqual(await page.evaluate(() => ({
    bee: SA.reqMet(SA.SKINS.find(s => s.id === 'bee').req, __game.stats),
    sunny: SA.reqMet(SA.SKINS.find(s => s.id === 'sunny').req, __game.stats)
  })), { bee: true, sunny: false });
  await backThroughCache(page);
  await assertStats(page, final);
  await page.evaluate(() => { document.getElementById('btnOMenu').click(); stepGame(180); });
  await backThroughCache(page);
  await assertStats(page, final);
  await page.reload();
  await assertStats(page, final);
});

test('Snake Arena a cached short run remains eligible after resuming, while quick restarts stay excluded', async t => {
  const page = await gamePage(t);
  await page.evaluate(() => {
    SA.game.run.t = 2;
    __game.setMass(99);
    document.getElementById('btnPause').click();
  });
  await backThroughCache(page);
  assert.deepEqual(await page.evaluate(() => __game.stats), empty);
  await page.evaluate(() => {
    document.getElementById('btnResume').click();
    Object.assign(SA.game.run, { t: 3.1, kills: 1, food: 2.7, powerups: 1, bestRank: 7 });
    document.getElementById('btnPause').click();
    SA.game.lastStart = 0;
    document.getElementById('btnRestart').click();
  });
  const earned = { bestLen: 99, totalKills: 1, bestKills: 1, games: 1, bestTime: 3, totalFood: 2, bestRank: 7, powerups: 1, top1Time: 0 };
  await assertStats(page, earned);
  await page.evaluate(() => {
    SA.game.run.t = 2;
    __game.setMass(500);
    document.getElementById('btnPause').click();
    SA.game.lastStart = 0;
    document.getElementById('btnRestart').click();
    document.getElementById('btnPause').click();
    document.getElementById('btnMenu').click();
    stepGame(120);
  });
  await backThroughCache(page);
  await assertStats(page, earned);
});

test('Snake Arena cached runs finalized by restart and menu count once and retain earlier records', async t => {
  const page = await gamePage(t);
  await page.evaluate(() => {
    Object.assign(SA.game.run, { t: 5, kills: 3, food: 10.5, powerups: 2, bestRank: 2, top1T: 3 });
    __game.setMass(400);
    document.getElementById('btnPause').click();
  });
  await backThroughCache(page);
  await page.evaluate(() => {
    Object.assign(SA.game.run, { t: 6, kills: 4, food: 12.5, powerups: 3 });
    SA.game.lastStart = 0;
    document.getElementById('btnRestart').click();
    Object.assign(SA.game.run, { t: 3.5, kills: 1, food: 5.7, powerups: 1, bestRank: 9, top1T: 0 });
    __game.setMass(20);
    document.getElementById('btnPause').click();
  });
  await backThroughCache(page);
  await backThroughCache(page);
  const checkpoint = { bestLen: 400, totalKills: 5, bestKills: 4, games: 2, bestTime: 6, totalFood: 17, bestRank: 2, powerups: 4, top1Time: 3 };
  await assertStats(page, checkpoint);
  await page.evaluate(() => {
    Object.assign(SA.game.run, { t: 4, kills: 2, food: 6.2, powerups: 2 });
    document.getElementById('btnMenu').click();
    stepGame(180);
  });
  const final = { ...checkpoint, totalKills: 6, totalFood: 18, powerups: 5 };
  await assertStats(page, final);
  await backThroughCache(page);
  await page.evaluate(() => { SA.game.lastStart = 0; document.getElementById('btnPlay').click(); });
  await assertStats(page, final);
});

test('Snake Arena warns when a save fails and clears it only after a confirmed retry', async t => {
  const page = await gamePage(t);
  const failed = await page.evaluate(() => {
    window.nativeSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new DOMException('Full storage fixture', 'QuotaExceededError'); };
    Object.assign(SA.game.run, { t: 5, kills: 1 });
    __game.killPlayer();
    stepGame(120);
    const status = document.querySelector('.sg-save-status');
    return { state: __game.state, visible: !status.hidden, status: status.dataset.state, games: __game.stats.games };
  });
  assert.deepEqual(failed, { state: 'over', visible: true, status: 'failed', games: 1 });
  const retried = await page.evaluate(() => {
    Storage.prototype.setItem = window.nativeSetItem;
    document.querySelector('.sg-save-status button').click();
    return document.querySelector('.sg-save-status').dataset.state;
  });
  assert.equal(retried, 'saved');
  const value = await stats(page);
  assert.equal(value.current.games, 1);
  assert.deepEqual(value.stored, value.current);
});

test('Snake Arena preference saves keep newer stats from another tab but send pending stats', async t => {
  const page = await gamePage(t);
  const result = await page.evaluate(() => {
    const store = Kit.store('snake-arena'), newer = { ...__game.stats, games: 7, bestLen: 321 };
    store.set('stats', newer); // another tab finished rounds after this one loaded
    document.getElementById('btnDice').click();
    const kept = { stats: store.get('stats'), name: store.get('name') === __game.prefs.name };
    // A round whose stats write fails stays pending until the next preference save.
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new DOMException('Full storage fixture', 'QuotaExceededError'); };
    Object.assign(SA.game.run, { t: 5, kills: 1 });
    __game.killPlayer();
    stepGame(120);
    Storage.prototype.setItem = setItem;
    document.getElementById('btnDice').click();
    return { newer, kept, current: __game.stats, stored: store.get('stats'), status: document.querySelector('.sg-save-status').dataset.state };
  });
  assert.deepEqual(result.kept, { stats: result.newer, name: true });
  assert.equal(result.current.games, 1);
  assert.deepEqual(result.stored, result.current);
  assert.equal(result.status, 'saved');
});

test('Snake Arena draws a paused scene once, redraws it after resize or context restore, and resumes', async t => {
  const page = await gamePage(t);
  const draws = await page.evaluate(() => {
    let n = 0;
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function () { if (this.canvas.id === 'cv') n++; return draw.apply(this, arguments); };
    const frames = count => { n = 0; for (let i = 0; i < count; i++) renderGame(0); return n; };
    stepGame(30); frames(1);
    document.getElementById('btnPause').click();
    const first = frames(1), idle = frames(30);
    dispatchEvent(new Event('resize'));
    const resized = frames(1), resizedIdle = frames(30);
    document.getElementById('cv').dispatchEvent(new Event('contextrestored'));
    const restored = frames(1), restoredIdle = frames(30);
    document.getElementById('btnResume').click();
    stepGame();
    const playing = [frames(1), frames(1)];
    return { first: first > 0, idle, resized: resized > 0, resizedIdle, restored: restored > 0, restoredIdle, playing: playing.every(c => c > 0) };
  });
  assert.deepEqual(draws, { first: true, idle: 0, resized: true, resizedIdle: 0, restored: true, restoredIdle: 0, playing: true });
});

test('Snake Arena keeps the camera still and pops snakes with one small burst under reduced motion', async t => {
  const page = await gamePage(t);
  const result = await page.evaluate(() => {
    Kit.motion.setPreference('reduce');
    SA.game.shake = 22;
    stepGame();
    const cam = [SA.game.shake, SA.render.cam.sx, SA.render.cam.sy];
    let bursts = 0;
    const burst = SA.render.burst;
    SA.render.burst = function () { bursts++; return burst.apply(this, arguments); };
    __game.trapBot(); // a bot right next to the player, well inside the camera view
    SA.world.killSnake(SA.world.snakes[1], null, 'border');
    stepGame();
    return { cam, bursts };
  });
  assert.deepEqual(result, { cam: [0, 0, 0], bursts: 1 });
});
