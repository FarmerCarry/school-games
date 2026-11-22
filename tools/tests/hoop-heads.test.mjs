import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';
import { testHoopRewards } from '../regressions-hoop.mjs';

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

async function openHoop(t, { interceptLoop = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  t.after(async () => {
    await context.close();
    assert.deepEqual(errors, [], 'no console or page errors');
  });

  if (interceptLoop) {
    await page.addInitScript(() => {
      let kit, update, render;
      const hh = window.hh = { failSave: false, ready: false };
      hh.step = (n = 1) => { for (let i = 0; i < n; i++) { update(1 / 60); render(0); } };
      hh.down = code => window.dispatchEvent(new KeyboardEvent('keydown', { code }));
      hh.up = code => window.dispatchEvent(new KeyboardEvent('keyup', { code }));
      hh.tap = code => { hh.down(code); hh.up(code); };
      Object.defineProperty(window, 'Kit', {
        configurable: true,
        get: () => kit,
        set(value) {
          kit = value;
          kit.loop = (u, r) => { update = u; render = r; hh.ready = true; return { running: true, stop() {} }; };
        }
      });
      const write = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key) {
        if (hh.failSave && key === 'sg:hoop-heads:save_v3') {
          throw new DOMException('Quota exceeded fixture', 'QuotaExceededError');
        }
        return write.apply(this, arguments);
      };
    });
  }

  await page.goto(`${server.origin}/games/hoop-heads/`, { waitUntil: 'load' });
  await page.waitForFunction(needLoop => window.__game && window.HH && (!needLoop || (window.hh && window.hh.ready)), interceptLoop, { timeout: 25000 });
  return page;
}

test('Hoop Heads 3D boots cleanly into live 3D title, starts 1P/2P matches, and supports locker purchases', async t => {
  const page = await openHoop(t, { interceptLoop: true });
  const check = await page.evaluate(() => {
    const titleVisible = !document.getElementById('scrTitle').hidden;
    const playVisible = !document.querySelector('[data-act="cpu"]').hidden;

    // Open Locker, buy Neon ball & Street Cap
    window.HH.save.coins = 100;
    document.querySelector('[data-act="shop"]').click();
    const shopState = window.__game.state;
    document.querySelector('[data-ball="neon"]').click();
    document.querySelector('[data-head="cap"]').click();
    const coinsLeft = window.HH.save.coins;
    const equipped = [window.HH.save.ball, window.HH.save.head];
    document.getElementById('shopBack').click();

    // Instant 1-click 1P Play
    document.querySelector('[data-act="cpu"]').click();
    const cpuState = window.__game.state;
    const cpuBall = window.__game.match.ballSkin;
    const cpuHead = window.__game.match.players[0].head;

    // 2P Mode via API
    window.__game.start({ mode: 'duo' });
    const duoMode = window.__game.match.mode;

    return { titleVisible, playVisible, shopState, coinsLeft, equipped, cpuState, cpuBall, cpuHead, duoMode };
  });

  assert.deepEqual(check, {
    titleVisible: true,
    playVisible: true,
    shopState: 'shop',
    coinsLeft: 35,
    equipped: ['neon', 'cap'],
    cpuState: 'play',
    cpuBall: 'neon',
    cpuHead: 'cap',
    duoMode: 'duo'
  });
});

test('Hoop Heads 3D controls move at full speed while charging, jump, dunk, and shoot cleanly', async t => {
  const page = await openHoop(t, { interceptLoop: true });
  const res = await page.evaluate(() => {
    window.__game.start({ mode: 'duo' });
    window.__game.skipIntro();
    hh.step(1);
    const m = window.__game.match;
    const p0 = m.players[0];

    // 1. Jump tap
    window.__game.give(0, 420);
    hh.tap('KeyW');
    hh.step(1);
    const jumped = !p0.onGround && p0.vy < -600;
    hh.step(75);

    // 2. Move right while holding shoot (zero movement freeze!)
    window.__game.give(0, 500);
    hh.down('KeyD');
    hh.down('Space');
    hh.step(18);
    const mobileVx = p0.vx;
    const gaugeShown = !document.getElementById('shotGauge').hidden;
    hh.up('Space');
    hh.up('KeyD');
    hh.step(2);
    const shotFired = m.ball.state === 'shot' && m.ball.vy < -300;

    // 3. Slam Dunk near hoop
    window.__game.give(0, 960);
    hh.tap('KeyS');
    hh.step(1);
    const dunkStarted = !!p0.dunk;
    hh.step(60);

    return {
      jumped,
      mobileFree: mobileVx > 300,
      gaugeShown,
      shotFired,
      dunkStarted,
      score: p0.score
    };
  });

  assert.deepEqual(res, {
    jumped: true,
    mobileFree: true,
    gaugeShown: true,
    shotFired: true,
    dunkStarted: true,
    score: 2
  });
});

test('Hoop Heads 3D result screen blocks mashed keys during lock, warns & retries failed saves, and freezes paused draws', async t => {
  const page = await openHoop(t, { interceptLoop: true });

  // 1. Paused single-frame freeze & resize redraw
  const paused = await page.evaluate(() => {
    window.__game.start({ mode: 'duo' });
    window.__game.skipIntro();
    hh.step(10);
    hh.tap('KeyP');
    const before = window.__game.draws;
    hh.step(1);
    const afterFirst = window.__game.draws - before;
    hh.step(40);
    const idleDraws = window.__game.draws - before - afterFirst;
    return { state: window.__game.state, afterFirst, idleDraws };
  });
  assert.deepEqual(paused, { state: 'pause', afterFirst: 1, idleDraws: 0 });

  await page.setViewportSize({ width: 1024, height: 600 });
  const afterResize = await page.evaluate(() => {
    const before = window.__game.draws;
    window.dispatchEvent(new Event('resize'));
    hh.step(15);
    return window.__game.draws - before;
  });
  assert.ok(afterResize >= 1, 'resize redraws paused frame');

  // Resume advances match clock
  const resumed = await page.evaluate(() => {
    const t0 = window.__game.match.time;
    document.getElementById('pResume').click();
    hh.step(30);
    return { state: window.__game.state, moved: window.__game.match.time < t0 };
  });
  assert.deepEqual(resumed, { state: 'play', moved: true });

  // 2. Result lock + failed save warning & retry
  const resFlow = await page.evaluate(() => {
    hh.failSave = true;
    window.__game.start({ mode: 'cpu', stage: 0 });
    window.__game.endNow(0);
    for (let i = 0; i < 120 && window.__game.state !== 'result'; i++) hh.step(1);
    const atResult = window.__game.state;
    const panel = document.querySelector('.sg-save-status');
    const failedShown = panel && !panel.hidden && panel.dataset.state === 'failed';

    // Mashed Enter during lock must not skip result
    hh.tap('Enter');
    hh.step(2);
    const lockedStill = window.__game.state;

    // Retry save succeeds
    hh.failSave = false;
    panel.querySelector('button').click();
    const savedState = panel.dataset.state;
    const storedGames = window.HH.store.get('save_v3', null)?.stats?.games;

    // After lock expires, Enter starts a new match
    hh.step(40);
    hh.tap('Enter');
    hh.step(2);
    const restarted = window.__game.state;

    return { atResult, failedShown, lockedStill, savedState, storedGames, restarted };
  });

  assert.deepEqual(resFlow, {
    atResult: 'result',
    failedShown: true,
    lockedStill: 'result',
    savedState: 'saved',
    storedGames: 1,
    restarted: 'play'
  });
});

test('Hoop Heads 3D rewards & 5-stage ladder persistence match regression contract', async t => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  const { checks } = await testHoopRewards({ page, baseURL: `${server.origin}/` });
  assert.equal(checks, 4);
});
