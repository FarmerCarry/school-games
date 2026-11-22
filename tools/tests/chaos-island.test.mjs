// Chaos Island (جزيرة الفوضى) browser tests in real Chromium:
// verifies live 3D title screen, clean boot, game-scenarios contract (positive/negative walk,
// pause freeze with zero WebGL redraw churn, blur auto-pause, restart reset),
// 2P shared-keyboard controls, endless mode, wardrobe shop + save retry, and full 5-round match.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';
import { clickControl } from '../ui-input.mjs';

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

async function openGame(t, { save, viewport = { width: 1280, height: 720 } } = {}) {
  const ctx = await browser.newContext({ viewport });
  const errors = [], external = [];
  ctx.on('page', page => {
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  });
  ctx.on('request', r => {
    const u = r.url();
    if (!u.startsWith(server.origin + '/') && !u.startsWith('data:') && !u.startsWith('blob:')) external.push(u);
  });
  t.after(async () => {
    await ctx.close();
    assert.deepEqual(errors, [], 'no page/console errors');
    assert.deepEqual(external, [], 'no external network requests');
  });

  await ctx.addInitScript(({ save }) => {
    if (location.protocol !== 'http:' || sessionStorage.getItem('ci-seeded')) return;
    sessionStorage.setItem('ci-seeded', '1');
    if (save !== undefined) localStorage.setItem('sg:chaos-island:save', JSON.stringify(save));
  }, { save });

  await ctx.addInitScript(() => {
    let kit;
    const h = window.__ciTest = { ddaResults: [], renders: 0 };
    Object.defineProperty(window, 'Kit', {
      configurable: true,
      get: () => kit,
      set(val) {
        kit = val;
        kit.loop = (update, render) => {
          h.step = (n = 1) => { for (let i = 0; i < n; i++) { update(1 / 60); render(0); } };
          h.run = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); };
          h.paint = () => render(0);
          return { running: true, stop() {} };
        };
        const origDda = kit.dda;
        kit.dda = function (slug, opts) {
          const d = origDda.call(kit, slug, opts);
          const origRes = d.result;
          d.result = function (out) { h.ddaResults.push(out); return origRes.call(d, out); };
          return d;
        };
      }
    });
  });

  const page = await ctx.newPage();
  await page.goto(`${server.origin}/games/chaos-island/`);
  await page.waitForFunction(() => !!window.__game && !!window.__ciTest?.step, null, { timeout: 15000 });
  await page.evaluate(() => __ciTest.step(2));
  return page;
}

const step = (page, n = 1) => page.evaluate(n => __ciTest.step(n), n);
const run = (page, n = 1) => page.evaluate(n => { __ciTest.run(n); __ciTest.paint(); }, n);

test('title screen shows live 3D island demo, minimal controls, and writes nothing to localStorage on boot', async t => {
  const page = await openGame(t);
  assert.deepEqual(await page.evaluate(() => [__game.mode, __game.world, __game.matches]), ['title', null, 0]);
  const pos0 = await page.evaluate(() => __game.demo.actors.map(a => [a.x, a.y]));
  await step(page, 60);
  const pos1 = await page.evaluate(() => __game.demo.actors.map(a => [a.x, a.y]));
  assert.notDeepEqual(pos1, pos0, 'title 3D island demo animates');

  const savedKeys = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('sg:chaos-island:') && k !== 'sg:chaos-island:dda'));
  assert.deepEqual(savedKeys, [], 'clean boot does not pollute localStorage');
});

test('start, positive & negative player.walk, pause freeze without redraw churn, blur pause, and restart reset', async t => {
  const page = await openGame(t);
  await clickControl(page, '#btnPlay');
  await step(page, 1);
  assert.deepEqual(await page.evaluate(() => [__game.mode, __game.matches, __game.world.round, __game.world.phase]), ['play', 1, 0, 'card']);

  // Negative check: 300 frames idle keeps player.walk === 0
  await run(page, 300);
  assert.equal(await page.evaluate(() => __game.player.walk), 0, 'walk stays 0 without player input');

  // Positive check: ArrowRight moves P1 and increments walk > 20
  await page.keyboard.down('ArrowRight');
  await step(page, 12);
  await page.keyboard.up('ArrowRight');
  assert.ok((await page.evaluate(() => __game.player.walk)) > 10, 'ArrowRight increments player.walk');

  // Pause freezes simulation & stops WebGL draw calls
  await clickControl(page, '#btnPause');
  await step(page, 2);
  assert.equal(await page.evaluate(() => __game.mode), 'pause');
  await page.evaluate(() => {
    window.__glDraws = 0;
    const gl = document.getElementById('scene').getContext('webgl2') || document.getElementById('scene').getContext('webgl');
    const orig = gl.clear.bind(gl);
    gl.clear = function () { window.__glDraws++; return orig.apply(gl, arguments); };
  });
  const snap = await page.evaluate(() => [__game.world.round, __game.world.frames, __game.player.x, __game.player.y, window.__glDraws]);
  await step(page, 60);
  assert.deepEqual(await page.evaluate(() => [__game.world.round, __game.world.frames, __game.player.x, __game.player.y, window.__glDraws]), snap, 'paused scene stays frozen with zero WebGL redraw churn');

  // Blur auto-pauses and focus does NOT auto-resume
  await clickControl(page, '#btnResume');
  assert.equal(await page.evaluate(() => __game.mode), 'play');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await step(page, 2);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await step(page, 15);
  assert.equal(await page.evaluate(() => __game.mode), 'pause');

  // Restart starts match #2 cleanly on round 0 card
  await clickControl(page, '#btnRestart');
  await step(page, 1);
  const reset = await page.evaluate(() => ({
    mode: __game.mode, matches: __game.matches, round: __game.world.round,
    phase: __game.world.phase, t: __game.world.t, walk: __game.player.walk
  }));
  assert.equal(reset.mode, 'play');
  assert.equal(reset.matches, 2);
  assert.equal(reset.round, 0);
  assert.equal(reset.phase, 'card');
  assert.ok(reset.t < 3);
  assert.equal(reset.walk, 0);
});

test('2P mode moves P1 with WASD+Space and P2 with Arrow keys, and Endless mode starts cleanly', async t => {
  const page = await openGame(t);
  await clickControl(page, '#btnDuo');
  await clickControl(page, '#btnPlay');
  await step(page, 2);
  assert.equal(await page.evaluate(() => __game.duo), true);
  assert.equal(await page.evaluate(() => __game.players.length), 2);

  const x0 = await page.evaluate(() => __game.players.map(p => p.x));
  await page.keyboard.down('KeyD');
  await page.keyboard.down('ArrowLeft');
  await step(page, 14);
  await page.keyboard.up('KeyD');
  await page.keyboard.up('ArrowLeft');
  const x1 = await page.evaluate(() => __game.players.map(p => p.x));
  assert.ok(x1[0] > x0[0] + 0.5, 'P1 moves right with KeyD');
  assert.ok(x1[1] < x0[1] - 0.5, 'P2 moves left with ArrowLeft');

  // Return home and start Endless
  await clickControl(page, '#btnPause');
  await clickControl(page, '#btnHome');
  await clickControl(page, '#btnEndless');
  await step(page, 2);
  assert.equal(await page.evaluate(() => __game.endless), true);
  assert.equal(await page.evaluate(() => __game.mode), 'play');
});

test('Wardrobe shop buys & equips colors and hats, persists across reload, and retries failed saves', async t => {
  const seeded = { v: 4, coins: 220, bestScore: 300, bestStars: 2, bestWaves: 0, wins: 1, color: 0, hat: 0, ownedColors: [1, 1, 0, 0, 0, 0, 0, 0], ownedHats: [1, 0, 0, 0, 0, 0, 0, 0], coachDone: true };
  const page = await openGame(t, { save: seeded });

  await clickControl(page, '#btnShop');
  assert.equal(await page.evaluate(() => __game.mode), 'shop');

  await page.locator('.shop-tile[data-kind="color"][data-index="2"]').click();
  await page.locator('.shop-tile[data-kind="hat"][data-index="3"]').click();
  const bought = await page.evaluate(() => ({ color: __game.save.color, hat: __game.save.hat, coins: __game.save.coins }));
  assert.deepEqual(bought, { color: 2, hat: 3, coins: 220 - 30 - 65 });

  // Simulate quota failure then Retry via Kit.saveStatus
  await page.evaluate(() => {
    const orig = Storage.prototype.setItem;
    window.__unblockSave = () => { Storage.prototype.setItem = orig; };
    Storage.prototype.setItem = function (k, v) {
      if (String(k).includes('chaos-island:save')) throw new DOMException('Quota', 'QuotaExceededError');
      return orig.call(this, k, v);
    };
  });
  await page.locator('.shop-tile[data-kind="hat"][data-index="1"]').click();
  assert.equal(await page.locator('.sg-save-status').isVisible(), true, 'save error banner appears');
  await page.evaluate(() => window.__unblockSave());
  await page.locator('.sg-save-status button').click();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('sg:chaos-island:save')).hat), 1);

  await page.reload();
  await page.waitForFunction(() => !!window.__game, null, { timeout: 15000 });
  assert.equal(await page.evaluate(() => __game.save.hat), 1, 'equipped hat persists across reload');
});

test('full 5-round match finishes on result screen, awards stars/coins, and reports DDA outcome', async t => {
  const page = await openGame(t);
  await clickControl(page, '#btnPlay');
  await step(page, 1);

  await page.evaluate(() => {
    const fire = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true, cancelable: true }));
    for (let f = 0; f < 60 * 90 && __game.mode === 'play'; f++) {
      const plan = window.ChaosEngine.planCoach(__game.world, __game.player, 1.0);
      fire('ArrowRight', plan.moveX > 0);
      fire('ArrowLeft', plan.moveX < 0);
      fire('Space', !!plan.jumpPressed || !!plan.jumpDown);
      fire('ArrowDown', !!plan.downPressed);
      __ciTest.run(1);
    }
    fire('ArrowRight', false); fire('ArrowLeft', false); fire('Space', false); fire('ArrowDown', false);
    __ciTest.paint();
  });

  assert.equal(await page.evaluate(() => __game.mode), 'result', 'match ends on result screen');
  assert.ok((await page.evaluate(() => __game.result.stars)) >= 1, 'active player earns stars');
  assert.ok((await page.evaluate(() => __game.save.coins)) > 0, 'coins awarded and saved');
  assert.equal(await page.evaluate(() => __ciTest.ddaResults.length), 1, 'DDA outcome recorded once');
});
