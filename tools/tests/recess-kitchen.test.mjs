// Recess Kitchen (Snack Flip & Bump Party) Playwright Chromium browser tests.
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

async function openGame(t, { save, reducedMotion = 'reduce' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion });
  const errors = [], requests = [];
  ctx.on('page', page => {
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  });
  ctx.on('request', r => { if (!r.url().startsWith(server.origin + '/')) requests.push(r.url()); });
  t.after(async () => {
    await ctx.close();
    assert.deepEqual(errors, [], 'no console or page errors');
    assert.deepEqual(requests, [], 'no external network requests');
  });

  await ctx.addInitScript(({ save }) => {
    if (location.protocol !== 'http:') return;
    if (!sessionStorage.getItem('rk4-seeded')) {
      sessionStorage.setItem('rk4-seeded', '1');
      if (save !== undefined) localStorage.setItem('sg:recess-kitchen:save4', JSON.stringify(save));
    }
    let kit;
    const rk = window.rk = { rounds: [], ends: [], dda: [], hits: 0, failSave: false, audioStarts: 0 };
    const origStart = window.AudioScheduledSourceNode && window.AudioScheduledSourceNode.prototype.start;
    if (origStart) {
      window.AudioScheduledSourceNode.prototype.start = function () {
        rk.audioStarts++;
        return origStart.apply(this, arguments);
      };
    }
    Object.defineProperty(window, 'Kit', {
      configurable: true,
      get: () => kit,
      set(value) {
        kit = value;
        kit.loop = (update, render) => {
          rk.run = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); render(0); };
          return { stop() {} };
        };
        const makeDda = kit.dda;
        kit.dda = (slug, opts) => {
          const ctrl = makeDda.call(kit, slug, opts);
          const origRes = ctrl.result;
          ctrl.result = o => { rk.dda.push(o); return origRes.call(ctrl, o); };
          return ctrl;
        };
        const origRound = kit.stats.round, origEnd = kit.stats.end;
        kit.stats.round = id => { rk.rounds.push(id); return origRound.call(kit.stats, id); };
        kit.stats.end = function (outcome, score) {
          rk.ends.push({ outcome, score, argc: arguments.length });
          return origEnd.apply(kit.stats, arguments);
        };
        const origHit = kit.track.hit;
        kit.track.hit = () => { rk.hits++; return origHit.call(kit.track); };
      }
    });
    const origSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key) {
      if (key === 'sg:recess-kitchen:save4' && window.rk.failSave) {
        throw new DOMException('Quota fixture', 'QuotaExceededError');
      }
      return origSet.apply(this, arguments);
    };
  }, { save });

  const page = await ctx.newPage();
  await page.goto(`${server.origin}/games/recess-kitchen/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.rk && window.rk.run, null, { timeout: 15000 });
  return page;
}

const state = page => page.evaluate(() => __game.state);
const run = (page, n = 1) => page.evaluate(n => rk.run(n), n);

test('title attract animates with zero idle audio; 1-click Play launches solo match; Space & Click flip chef', async t => {
  const page = await openGame(t);
  await run(page, 60);
  const st0 = await state(page);
  assert.equal(st0.screen, 'title');
  assert.equal(st0.phase, 'title');
  assert.equal(await page.evaluate(() => rk.audioStarts), 0, 'zero idle audio on title');

  // Clicking empty corner does NOT start game
  await page.mouse.click(4, 4);
  assert.equal((await state(page)).screen, 'title');

  // 1-click Play!
  await page.click('#btnPlay');
  await run(page, 4);
  let s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.mode, 'solo');
  assert.equal(s.atStart, true);
  assert.deepEqual(await page.evaluate(() => rk.rounds), ['solo']);

  // Space jumps chef 1
  await page.keyboard.press('Space');
  await run(page, 6);
  s = await state(page);
  assert.ok(s.jumps >= 1, 'Space flips P1 chef');
  assert.equal(s.atStart, false);

  // Let chef land, then mouse click also flips chef!
  await run(page, 65);
  const jBefore = (await state(page)).jumps;
  const pt = await page.evaluate(() => __game.point(640, 360));
  await page.mouse.click(pt.x, pt.y);
  await run(page, 6);
  assert.ok((await state(page)).jumps > jBefore, 'canvas click flips P1 chef');
});

test('pause freezes time silently, restart resets score/jumps, and solo match win reports numeric score & DDA', async t => {
  const page = await openGame(t);
  await page.click('#btnPlay');
  await run(page, 12);
  await page.keyboard.press('Space');
  await run(page, 6);

  // Pause freezes time with zero audio
  await page.click('#btnPause');
  const p0 = await state(page);
  assert.equal(p0.screen, 'pause');
  const a0 = await page.evaluate(() => rk.audioStarts);
  await run(page, 60);
  const p1 = await state(page);
  assert.equal(p1.time, p0.time, 'time freezes when paused');
  assert.equal(await page.evaluate(() => rk.audioStarts), a0, 'zero audio while paused');

  // Restart resets cleanly
  await page.click('#btnRestart');
  await run(page, 4);
  const r0 = await state(page);
  assert.equal(r0.screen, 'play');
  assert.equal(r0.jumps, 0);
  assert.deepEqual(r0.goals, [0, 0]);

  // Score 5th goal to win solo match
  await page.evaluate(() => {
    __game.world.goals = [4, 1];
    __game.world.snacks[0].x = RK.W - RK.GOAL_W + 30;
    __game.world.snacks[0].y = RK.GOAL_TOP + 90;
    rk.run(4);
  });
  const endState = await state(page);
  assert.equal(endState.screen, 'result');
  const tele = await page.evaluate(() => ({ ends: rk.ends, dda: rk.dda, coins: __game.save.coins }));
  const lastEnd = tele.ends[tele.ends.length - 1];
  assert.equal(lastEnd.outcome, 'win');
  assert.equal(lastEnd.score, 5, 'reports numeric score');
  assert.equal(tele.dda.length, 1, 'solo match feeds DDA');
  assert.ok(tele.coins >= 60, 'coins awarded on win');

  // Sub-second retry via Enter after 0.35s lock!
  await run(page, 30);
  await page.keyboard.press('Enter');
  assert.equal((await state(page)).screen, 'play');
});

test('1-click 2P mode uses W vs ArrowUp, reports duo end without solo DDA, and hat closet handles save retry', async t => {
  const page = await openGame(t, {
    save: { v: 4, coins: 80, hats: [0], hat: 0, wins: 1, matches: 1, bestGoals: 5, duoWins: [0, 0] }
  });

  // Open Hats drawer, test quota failure & retry
  await page.click('#btnHats');
  assert.equal((await state(page)).screen, 'hats');
  await page.evaluate(() => { rk.failSave = true; });
  await page.locator('.hat-card[data-hat="1"]').click();
  await page.waitForSelector('.sg-save-status:not([hidden])');
  await page.evaluate(() => { rk.failSave = false; });
  await page.locator('.sg-save-status button').click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sg:recess-kitchen:save4')));
  assert.equal(saved.hat, 1);
  assert.equal(saved.coins, 55);
  await page.click('#btnHatsBack');

  // 1-click 2P local mode
  await page.click('#btnDuo');
  await run(page, 4);
  assert.equal((await state(page)).mode, 'duo');
  await page.keyboard.press('KeyW');
  await page.keyboard.press('ArrowUp');
  await run(page, 6);
  const s = await state(page);
  assert.ok(s.chefs[0].jumps >= 1, 'P1 flips with W');
  assert.ok(s.chefs[1].jumps >= 1, 'P2 flips with ArrowUp');

  // Finish 2P match
  await page.evaluate(() => {
    __game.world.goals = [4, 3];
    __game.world.snacks[0].x = RK.W - RK.GOAL_W + 30;
    __game.world.snacks[0].y = RK.GOAL_TOP + 90;
    rk.run(4);
  });
  assert.equal((await state(page)).screen, 'result');
  const tele = await page.evaluate(() => ({ ends: rk.ends, dda: rk.dda }));
  assert.equal(tele.ends[tele.ends.length - 1].outcome, 'end');
  assert.equal(tele.ends[tele.ends.length - 1].argc, 1, '2P omits score');
  assert.equal(tele.dda.length, 0, '2P does not touch solo DDA');
});
