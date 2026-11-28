// Shortcut Factory (Toy Claw Rush) Playwright Chromium browser tests.
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
    if (!sessionStorage.getItem('sf2-seeded')) {
      sessionStorage.setItem('sf2-seeded', '1');
      if (save !== undefined) localStorage.setItem('sg:shortcut-factory:save2', JSON.stringify(save));
    }
    let kit;
    const sf = window.sf = { rounds: [], ends: [], dda: [], failSave: false, audioStarts: 0 };
    const origStart = window.AudioScheduledSourceNode && window.AudioScheduledSourceNode.prototype.start;
    if (origStart) {
      window.AudioScheduledSourceNode.prototype.start = function () {
        sf.audioStarts++;
        return origStart.apply(this, arguments);
      };
    }
    Object.defineProperty(window, 'Kit', {
      configurable: true,
      get: () => kit,
      set(value) {
        kit = value;
        kit.loop = (update, render) => {
          sf.run = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); render(0); };
          return { stop() {} };
        };
        const makeDda = kit.dda;
        kit.dda = (slug, opts) => {
          const ctrl = makeDda.call(kit, slug, opts);
          const origRes = ctrl.result;
          ctrl.result = o => { sf.dda.push(o); return origRes.call(ctrl, o); };
          return ctrl;
        };
        const origRound = kit.stats.round, origEnd = kit.stats.end;
        kit.stats.round = id => { sf.rounds.push(id); return origRound.call(kit.stats, id); };
        kit.stats.end = function (outcome, score) {
          sf.ends.push({ outcome, score, argc: arguments.length });
          return origEnd.apply(kit.stats, arguments);
        };
      }
    });
    const origSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key) {
      if (key === 'sg:shortcut-factory:save2' && window.sf.failSave) {
        throw new DOMException('Quota fixture', 'QuotaExceededError');
      }
      return origSet.apply(this, arguments);
    };
  }, { save });

  const page = await ctx.newPage();
  await page.goto(`${server.origin}/games/shortcut-factory/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.sf && window.sf.run, null, { timeout: 15000 });
  return page;
}

const state = page => page.evaluate(() => __game.state);
const run = (page, n = 1) => page.evaluate(n => sf.run(n), n);

test('title runs live factory attract silently; 1-click Play drops claw via Space and Mouse Click; Pause freezes & Restart resets', async t => {
  const page = await openGame(t);
  await run(page, 60);
  const s0 = await state(page);
  assert.equal(s0.screen, 'title');
  assert.equal(s0.phase, 'title');
  assert.equal(await page.evaluate(() => sf.audioStarts), 0, 'zero idle audio on title');

  // Empty click on title corner does NOT start game
  await page.mouse.click(4, 4);
  assert.equal((await state(page)).screen, 'title');

  // 1-click Play straight into Stage 1
  await page.click('#btnPlay');
  await run(page, 4);
  let s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.level, 0);
  assert.equal(s.drops, 0);
  assert.deepEqual(await page.evaluate(() => sf.rounds), ['L1']);

  // Space drops claw!
  await page.keyboard.press('Space');
  await run(page, 5);
  s = await state(page);
  assert.equal(s.drops, 1);
  assert.equal(s.atStart, false);
  assert.notEqual(s.clawState, 'swing');

  // Wait for claw to return, then canvas Left-Click drops claw!
  await run(page, 90);
  assert.equal((await state(page)).clawState, 'swing');
  const pt = await page.evaluate(() => __game.point(640, 420));
  await page.mouse.click(pt.x, pt.y);
  await run(page, 4);
  assert.equal((await state(page)).drops, 2, 'mouse click drops claw');

  // Pause freezes simulation silently
  await page.click('#btnPause');
  const p0 = await state(page);
  assert.equal(p0.screen, 'pause');
  const a0 = await page.evaluate(() => sf.audioStarts);
  await run(page, 60);
  const p1 = await state(page);
  assert.equal(p1.time, p0.time, 'paused simulation stays frozen');
  assert.equal(await page.evaluate(() => sf.audioStarts), a0, 'zero audio while paused');

  // Restart resets drops & score
  await page.click('#btnRestart');
  await run(page, 4);
  const r = await state(page);
  assert.equal(r.screen, 'play');
  assert.equal(r.drops, 0);
  assert.equal(r.score, 0);
});

test('winning Stage 1 awards stars, reports numeric score, unlocks Stage 2, and allows 1-click upgrade on Result Card + save retry', async t => {
  const page = await openGame(t);
  await page.click('#btnPlay');
  await run(page, 4);

  // Reach 2-star score and finish timer
  await page.evaluate(() => {
    __game.world.score = 320;
    __game.world.coinsEarned = 80;
    __game.world.grabs = 6;
    __game.world.timeLeft = 0.02;
    sf.run(5);
  });
  const res = await state(page);
  assert.equal(res.screen, 'result');
  assert.equal(res.won, true);
  assert.equal(res.stars, 2);

  const tele = await page.evaluate(() => ({ ends: sf.ends, dda: sf.dda, save: __game.save }));
  assert.equal(tele.ends[0].outcome, 'win');
  assert.equal(tele.ends[0].score, 320);
  assert.equal(tele.dda.length, 1);
  assert.equal(tele.save.stars[0], 2);
  assert.equal(await page.locator('#btnNext').isHidden(), false);

  // Buy Turbo Claw right on the Result Card with save quota retry test!
  await page.evaluate(() => { sf.failSave = true; });
  await page.locator('#resUpgrades .upg-card[data-upg="turbo"]').click();
  await page.waitForSelector('.sg-save-status:not([hidden])');
  await page.evaluate(() => { sf.failSave = false; });
  await page.locator('.sg-save-status button').click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sg:shortcut-factory:save2')));
  assert.equal(saved.upg.turbo, 1, '1-click Result Card upgrade saved');

  // Launch Stage 2 right from Result Card!
  await page.click('#btnNext');
  await run(page, 4);
  assert.equal((await state(page)).level, 1);
});

test('Stage Map and Endless mode launch cleanly', async t => {
  const page = await openGame(t, {
    save: { v: 2, coins: 120, stars: [3, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], best: Array(12).fill(0), endlessBest: 0, upg: { turbo: 1, grip: 0, magnet: 0, gold: 0 } }
  });

  await page.click('#btnMap');
  assert.equal((await state(page)).screen, 'map');
  assert.equal(await page.locator('#mapGrid .lvl-btn').count(), 12);
  await page.locator('#mapGrid .lvl-btn[data-level="2"]').click();
  await run(page, 4);
  assert.equal((await state(page)).level, 2);

  await page.click('#btnPause');
  await page.click('#btnHome');
  await page.click('#btnEndless');
  await run(page, 4);
  const es = await state(page);
  assert.equal(es.screen, 'play');
  assert.equal(es.endless, true);
});
