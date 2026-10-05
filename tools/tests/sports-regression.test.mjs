import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = path.resolve(repo, process.env.SG_ROOT || '.');
const now = Date.UTC(2026, 0, 2);
let browser, server, base;

before(async () => {
  server = await startTestServer(root);
  base = server.origin;
  browser = await launchChromium();
});

after(async () => {
  await browser?.close();
  await server?.close();
});

async function newPage(t, slug, save) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  t.after(() => context.close());
  // Gameplay advances explicitly in these tests; wall-clock absence advances independently.
  await context.addInitScript(() => {
    window.requestAnimationFrame = () => 0;
    const realNow = Date.now;
    Date.now = () => Number(localStorage.getItem('sports-test-time')) || realNow();
  });
  const page = await context.newPage();
  await page.goto(base);
  await page.evaluate(({ slug, save, now }) => {
    localStorage.setItem('sports-test-time', String(now));
    if (save) localStorage.setItem(`sg:${slug}:save`, JSON.stringify(save));
  }, { slug, save, now });
  await page.goto(`${base}/games/${slug}/`);
  return page;
}

async function returnAfter(page, slug, seconds) {
  // Leave at the current time; advance the clock while the game is actually closed.
  await page.goto(base);
  await page.evaluate(seconds => {
    localStorage.setItem('sports-test-time', String(Number(localStorage.getItem('sports-test-time')) + seconds * 1000));
  }, seconds);
  await page.goto(`${base}/games/${slug}/`);
}

test('Hoop Heads judges buzzer-beaters by the final score and keeps ties in overtime', async t => {
  const page = await newPage(t, 'hoop-heads');
  const results = await page.evaluate(() => {
    return [[0, 10], [10, 0], [8, 10]].map(scores => {
      __game.start({ mode: 'duo' });
      const m = __game.match;
      m.phase = 'play'; m.time = 0.001;
      m.players[0].score = scores[0]; m.players[1].score = scores[1];
      Object.assign(m.ball, {
        hidden: false, state: 'shot', holder: null, shooter: m.players[0],
        x: m.hoops[1].x, y: m.hoops[1].y - 1, vx: 0, vy: 300,
        pts: 2, touched: false, scoredT: 0
      });
      HH.stepMatch(m, 1 / 60);
      const result = { scores: m.players.map(p => p.score), winner: m.winner, ended: m.ended, timeUp: m.timeUp };
      if (!m.ended) {
        for (let i = 0; i < 105; i++) HH.stepMatch(m, 1 / 60);
        result.overtime = m.overtime;
      }
      return result;
    });
  });
  assert.deepEqual(results, [
    { scores: [2, 10], winner: 1, ended: true, timeUp: true },
    { scores: [12, 0], winner: 0, ended: true, timeUp: true },
    { scores: [10, 10], winner: -1, ended: false, timeUp: true, overtime: true }
  ]);
});

test('Pizza Empire preserves unclaimed offline earnings and collects later absences exactly once', async t => {
  const page = await newPage(t, 'pizza-clicker', {
    pizzas: 85, lifetime: 100, runBaked: 100,
    owned: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0], t: now - 3600000
  });
  const start = () => page.evaluate(() => document.getElementById('bPlay').click());
  const state = () => page.evaluate(() => ({
    modal: __game.modal, balance: __game.S.pizzas, pending: __game.S.pendingOffline,
    savedPending: JSON.parse(localStorage.getItem('sg:pizza-clicker:save')).pendingOffline
  }));
  await start();
  const initial = await state();
  assert.equal(initial.modal, 'offline');
  assert.ok(initial.pending > 300);
  assert.equal(initial.savedPending, initial.pending);
  await page.reload(); await start();
  assert.deepEqual(await state(), initial);
  await returnAfter(page, 'pizza-clicker', 3600); await start();
  const accumulated = await state();
  assert.ok(accumulated.pending > initial.pending);
  assert.equal(accumulated.balance, initial.balance);
  assert.equal(accumulated.savedPending, accumulated.pending);
  await page.evaluate(() => document.querySelector('#mcard [data-act="take"]').click());
  const collected = await state();
  assert.equal(collected.balance, initial.balance + accumulated.pending);
  assert.equal(collected.pending, 0);
  assert.equal(collected.savedPending, 0);
  assert.equal(collected.modal, null);
  await page.reload(); await start();
  assert.deepEqual(await state(), collected);
});

test('Critter Mart preserves unclaimed offline earnings and collects later absences exactly once', async t => {
  const page = await newPage(t, 'critter-mart', {
    v: 1, coins: 0, tut: 2, rate: 10, last: now - 3600000
  });
  const start = () => page.evaluate(() => document.getElementById('playBtn').click());
  const state = () => page.evaluate(() => ({
    mode: __game.mode, balance: __game.S().coins, earned: __game.S().stats.earned,
    pending: __game.S().pendingOffline,
    savedPending: JSON.parse(localStorage.getItem('sg:critter-mart:save')).pendingOffline
  }));
  await start();
  const initial = await state();
  assert.deepEqual(initial, { mode: 'welcome', balance: 0, earned: 0, pending: 4320, savedPending: 4320 });
  await page.reload(); await start();
  assert.deepEqual(await state(), initial);
  await returnAfter(page, 'critter-mart', 3600); await start();
  assert.deepEqual(await state(), { ...initial, pending: 8640, savedPending: 8640 });
  await page.evaluate(() => {
    document.getElementById('collectBtn').click();
    document.getElementById('collectBtn').click();
  });
  const collected = { mode: 'play', balance: 8640, earned: 8640, pending: 0, savedPending: 0 };
  assert.deepEqual(await state(), collected);
  await page.reload(); await start();
  assert.deepEqual(await state(), collected);
});
