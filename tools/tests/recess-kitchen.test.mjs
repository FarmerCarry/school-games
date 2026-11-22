// Recess Kitchen 3D (games/recess-kitchen/) in real Chromium:
// Title screen with zero idle audio, 1P keyboard movement/dash/full burger cooking & serving,
// 2P Co-op independent controls & telemetry, Endless Rush, Wardrobe purchase & save quota retry,
// Pause freeze & Restart reset, Result stars & level unlock, and native HTML keyboard isolation.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';
import { testNativeControlGame } from '../regressions-keyboard.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
let browser, server;

before(async () => {
  server = await startTestServer(root);
  browser = await launchChromium({ args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
});

after(async () => {
  await browser?.close();
  await server?.close();
});

async function openGame(t, { save, dda = 0.35, reducedMotion = 'reduce', size = [1280, 720] } = {}) {
  const ctx = await browser.newContext({ viewport: { width: size[0], height: size[1] }, reducedMotion });
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

  await ctx.addInitScript(({ save, dda }) => {
    if (location.protocol !== 'http:') return;
    if (!sessionStorage.getItem('rk3-seeded')) {
      sessionStorage.setItem('rk3-seeded', '1');
      if (save !== undefined) {
        localStorage.setItem('sg:recess-kitchen:save3', typeof save === 'string' ? save : JSON.stringify(save));
      }
    }
    let kit;
    const rk = window.rk = { results: [], rounds: [], ends: [], hits: 0, misses: 0, failSave: false, audioStarts: 0 };

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
          rk.step = (n = 1) => { for (let i = 0; i < n; i++) { update(1 / 60); render(0); } };
          rk.run = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); render(0); };
          return { stop() {} };
        };
        const makeDda = kit.dda;
        kit.dda = (slug, opts) => {
          const ctrl = makeDda.call(kit, slug, Object.assign({}, opts, { start: dda }));
          const origRes = ctrl.result;
          ctrl.result = outcome => { rk.results.push(outcome); return origRes.call(ctrl, outcome); };
          return ctrl;
        };
        if (kit.stats) {
          const origRound = kit.stats.round;
          const origEnd = kit.stats.end;
          kit.stats.round = id => { rk.rounds.push(id); return origRound.call(kit.stats, id); };
          kit.stats.end = function (outcome, score) {
            rk.ends.push({ outcome, score, argc: arguments.length });
            return origEnd.apply(kit.stats, arguments);
          };
        }
        if (kit.track) {
          const origHit = kit.track.hit;
          const origMiss = kit.track.miss;
          kit.track.hit = () => { rk.hits++; return origHit.call(kit.track); };
          kit.track.miss = () => { rk.misses++; return origMiss.call(kit.track); };
        }
      }
    });

    const origSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key) {
      if (key === 'sg:recess-kitchen:save3' && window.rk && window.rk.failSave) {
        throw new DOMException('Quota exceeded fixture', 'QuotaExceededError');
      }
      return origSetItem.apply(this, arguments);
    };
  }, { save, dda });

  const page = await ctx.newPage();
  await page.goto(`${server.origin}/games/recess-kitchen/`, { timeout: 90000 });
  await page.waitForFunction(() => window.__game && window.rk && window.rk.step, null, { timeout: 30000 });
  return page;
}

const state = page => page.evaluate(() => __game.state);
const run = (page, n = 1) => page.evaluate(n => rk.run(n), n);

test('title waits with zero idle audio; Play starts 1-1; ArrowRight moves Chef 1 right cleanly', async t => {
  const page = await openGame(t);
  await run(page, 40);
  assert.equal((await state(page)).screen, 'title');
  assert.equal(await page.evaluate(() => rk.audioStarts), 0, 'zero audio on idle title screen');

  await page.click('#btnPlay');
  await run(page, 6);
  const s0 = await state(page);
  assert.equal(s0.screen, 'play');
  assert.equal(s0.id, '1-1');
  assert.equal(s0.atStart, true);
  assert.equal(s0.orders.length, 1);
  assert.deepEqual(await page.evaluate(() => rk.rounds), ['L1']);

  const xBefore = s0.chefs[0].x;
  await page.keyboard.down('ArrowRight');
  await run(page, 18);
  await page.keyboard.up('ArrowRight');
  const s1 = await state(page);
  assert.ok(s1.chefs[0].x > xBefore + 0.5, `Chef 1 moves right cleanly (${xBefore} -> ${s1.chefs[0].x})`);
  assert.equal(s1.atStart, false);
});

test('1P full burger cook, assemble, serve, pause freeze, and restart reset', async t => {
  const page = await openGame(t);
  await page.click('#btnPlay');
  await run(page, 4);

  // Move to patty crate, pick up, cook on stove, combine at bun crate, serve at window
  const servedOk = await page.evaluate(() => {
    const w = __game.world;
    const c = w.chefs[0];
    const placeAndAct = kind => {
      const st = w.stations.find(s => s.kind === kind);
      const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
      for (const [dx, dy] of dirs) {
        const nc = st.c + dx, nr = st.r + dy;
        if (nc >= 0 && nc < w.cols && nr >= 0 && nr < w.rows && !w.grid[nr][nc]) {
          c.x = nc + 0.5; c.y = nr + 0.5; c.fx = -dx; c.fy = -dy;
          break;
        }
      }
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true, cancelable: true }));
      rk.run(2);
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ' }));
      rk.run(2);
    };
    placeAndAct('crate_patty');
    placeAndAct('stove');
    rk.run(170); // finish grilling patty
    placeAndAct('stove');
    placeAndAct('crate_bun');
    placeAndAct('serve');
    return { served: w.served, score: w.score, hits: rk.hits };
  });
  assert.equal(servedOk.served, 1);
  assert.ok(servedOk.score >= 100);
  assert.equal(servedOk.hits, 1);

  // Pause freezes time and stays silent
  await page.click('#btnPause');
  await run(page, 2);
  const paused0 = await state(page);
  assert.equal(paused0.screen, 'pause');
  const audioBefore = await page.evaluate(() => rk.audioStarts);
  await run(page, 60);
  const paused1 = await state(page);
  assert.equal(paused1.time, paused0.time, 'simulation time freezes while paused');
  assert.equal(await page.evaluate(() => rk.audioStarts), audioBefore, 'zero audio while paused');

  // Restart resets cleanly
  await page.click('#btnRestart');
  await run(page, 4);
  const reset = await state(page);
  assert.equal(reset.screen, 'play');
  assert.equal(reset.atStart, true);
  assert.equal(reset.served, 0);
  assert.equal(reset.score, 0);
});

test('2P Co-op independent controls, Endless Rush, Wardrobe purchase, and save quota retry', async t => {
  const page = await openGame(t, {
    save: { v: 3, levels: Array.from({ length: 9 }, () => ({ stars: 0, best: 0 })), bestScore: 0, bestEndless: 0, coins: 100, aprons: [0], hats: [0], apron: 0, hat: 0, tutorialDone: true }
  });

  // Wardrobe purchase + save failure & retry
  await page.click('#btnWardrobe');
  await page.evaluate(() => { rk.failSave = true; });
  await page.locator('#apronGrid .skin-card').nth(1).click(); // costs 40 coins
  await page.waitForSelector('.sg-save-status:not([hidden])');
  await page.evaluate(() => { rk.failSave = false; });
  await page.locator('.sg-save-status button').click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sg:recess-kitchen:save3')));
  assert.equal(saved.apron, 1);
  assert.equal(saved.coins, 60);
  await page.click('#btnShopBack');

  // 2P Co-op independent movement + telemetry end without score or DDA
  await page.click('#btnDuo');
  await page.click('#btnPlay');
  await run(page, 4);
  const s0 = await state(page);
  assert.equal(s0.chefs.length, 2);
  await page.keyboard.down('KeyD');
  await page.keyboard.down('ArrowLeft');
  await run(page, 18);
  await page.keyboard.up('KeyD');
  await page.keyboard.up('ArrowLeft');
  const s1 = await state(page);
  assert.ok(s1.chefs[0].x > s0.chefs[0].x + 0.4, 'P1 moves right with KeyD');
  assert.ok(s1.chefs[1].x < s0.chefs[1].x - 0.4, 'P2 moves left with ArrowLeft');

  // Fast-forward 2P round end
  await page.evaluate(() => { __game.world.timeLeft = 0.05; rk.run(8); });
  assert.equal((await state(page)).screen, 'result');
  const tele = await page.evaluate(() => ({ ends: rk.ends, dda: rk.results }));
  assert.equal(tele.ends[tele.ends.length - 1].outcome, 'end');
  assert.equal(tele.ends[tele.ends.length - 1].argc, 1, '2P rounds report end without score');
  assert.equal(tele.dda.length, 0, '2P rounds never feed solo DDA');

  // Return home and start Endless Rush
  await page.click('#btnResHome');
  await page.click('#btnDuo'); // back to 1P
  await page.click('#btnEndless');
  await run(page, 4);
  const endState = await state(page);
  assert.equal(endState.screen, 'play');
  assert.equal(endState.id, 'endless');
});

test('solo round win unlocks level 1-2, awards stars & coins, and reports DDA', async t => {
  const page = await openGame(t);
  await page.click('#btnPlay');
  await run(page, 4);
  await page.evaluate(() => {
    __game.world.score = 450;
    __game.world.served = 3;
    __game.world.humanMoved = true;
    __game.world.timeLeft = 0.05;
    rk.run(10);
  });
  const res = await page.evaluate(() => ({ screen: __game.state.screen, result: __game.result, save: __game.save, dda: rk.results }));
  assert.equal(res.screen, 'result');
  assert.equal(res.result.won, true);
  assert.equal(res.result.stars, 2);
  assert.equal(res.save.levels[0].stars, 2);
  assert.equal(res.dda.length, 1);
  assert.equal(await page.locator('#btnNext').isHidden(), false, 'Next level button shown after unlock');
});

test('native HTML controls stay isolated from gameplay keyboard handlers', async () => {
  await testNativeControlGame({ browser, origin: server.origin, slug: 'recess-kitchen' });
});
