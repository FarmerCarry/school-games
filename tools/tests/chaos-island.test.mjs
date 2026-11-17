// Chaos Island in real Chromium: verifies live title demo, all 4 open battle islands,
// 3 difficulty tiers, exact game-scenarios contract (positive & negative player.walk,
// pause freeze with zero redraw churn, restart reset), active Belly-Dash & double-jump,
// 2P Co-Op & Rival modes, Island Shop purchases & persistence, save retry, and full match end.
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
    const h = window.__ciTest = { ddaResults: [] };
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
  await page.waitForFunction(() => !!window.__game && !!window.__ciTest?.step);
  await page.evaluate(() => __ciTest.step(2));
  return page;
}

const step = (page, n = 1) => page.evaluate(n => __ciTest.step(n), n);
const run = (page, n = 1) => page.evaluate(n => { __ciTest.run(n); __ciTest.paint(); }, n);

test('title screen shows live demo brawl, all 4 islands unlocked, and writes nothing to save on boot', async t => {
  const page = await openGame(t);
  assert.deepEqual(await page.evaluate(() => [__game.mode, __game.world, __game.matches]), ['title', null, 0]);
  const pos0 = await page.evaluate(() => __game.demo.actors.map(a => [a.x, a.y]));
  await step(page, 90);
  const pos1 = await page.evaluate(() => __game.demo.actors.map(a => [a.x, a.y]));
  assert.notDeepEqual(pos1, pos0, 'title background brawl animates');

  const isles = await page.evaluate(() => [...document.querySelectorAll('#islandBar .isle-btn')].map(b => b.textContent.trim()));
  assert.equal(isles.length, 4, 'all 4 islands available immediately');
  assert.ok(isles[0].includes('بركان القراصنة') && isles[3].includes('جزيرة الجليد الآلي'));

  const savedKeys = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('sg:chaos-island:') && k !== 'sg:chaos-island:dda'));
  assert.deepEqual(savedKeys, [], 'clean boot does not pollute localStorage');
});

test('start, positive & negative player.walk, pause freeze without redraw churn, and restart contract', async t => {
  const page = await openGame(t);
  await clickControl(page, '#btnPlay');
  await step(page, 1);
  assert.deepEqual(await page.evaluate(() => [__game.mode, __game.matches, __game.world.round, __game.world.phase]), ['play', 1, 0, 'card']);

  // Negative check: 450 frames (~7.5s) with NO keys/mouse pressed keeps player.walk === 0
  await run(page, 450);
  assert.equal(await page.evaluate(() => __game.player.walk), 0, 'player.walk stays 0 without intentional P1 movement');

  // Positive check: holding ArrowRight increments player.walk > 8 immediately
  await page.keyboard.down('ArrowRight');
  await step(page, 10);
  await page.keyboard.up('ArrowRight');
  assert.ok((await page.evaluate(() => __game.player.walk)) > 25, 'ArrowRight walks right and increments player.walk');

  // Pause via #btnPause freezes snapshot and stops canvas redraws
  await page.evaluate(() => {
    window.__fills = 0;
    const ctx = document.getElementById('game').getContext('2d');
    const orig = ctx.drawImage;
    ctx.drawImage = function () { window.__fills++; return orig.apply(this, arguments); };
  });
  await clickControl(page, '#btnPause');
  await step(page, 2);
  assert.equal(await page.evaluate(() => __game.mode), 'pause');
  const snap = await page.evaluate(() => [__game.world.round, __game.world.frames, __game.player.x, __game.player.y, window.__fills]);
  await step(page, 90);
  assert.deepEqual(await page.evaluate(() => [__game.world.round, __game.world.frames, __game.player.x, __game.player.y, window.__fills]), snap, 'frozen while paused');

  // Blur auto-pauses and focus does NOT auto-resume
  await clickControl(page, '#btnResume');
  assert.equal(await page.evaluate(() => __game.mode), 'play');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await step(page, 2);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await step(page, 15);
  assert.equal(await page.evaluate(() => __game.mode), 'pause');

  // Restart begins fresh match #2 at round 0 card phase with t < 3
  await clickControl(page, '#btnRestart');
  await step(page, 1);
  const resetState = await page.evaluate(() => ({
    mode: __game.mode,
    matches: __game.matches,
    round: __game.world.round,
    phase: __game.world.phase,
    t: __game.world.t,
    walk: __game.player.walk
  }));
  assert.equal(resetState.mode, 'play');
  assert.equal(resetState.matches, 2);
  assert.equal(resetState.round, 0);
  assert.equal(resetState.phase, 'card');
  assert.ok(resetState.t < 3);
  assert.equal(resetState.walk, 0);
});

test('difficulty selector, Belly-Dash (Space), Double-Jump (ArrowUp), and 2P Co-Op & Rival modes work', async t => {
  const page = await openGame(t);
  await page.locator('.diff-btn[data-diff="hero"]').click();
  await page.locator('.isle-btn[data-isle="2"]').click();
  await clickControl(page, '#btnDuoCoop');
  await step(page, 1);

  const cfg = await page.evaluate(() => ({
    diff: __game.diff,
    isl: __game.world.isl.id,
    duo: __game.duo,
    duoMode: __game.duoMode,
    hearts: __game.player.maxHearts,
    humans: __game.world.actors.filter(a => a.isHuman).length
  }));
  assert.deepEqual(cfg, { diff: 'hero', isl: 'alien', duo: true, duoMode: 'coop', hearts: 2, humans: 2 });

  // P1 jumps + double-jumps with KeyW and dashes with Space; P2 walks with ArrowRight + dashes with Enter
  await page.keyboard.down('KeyW'); await step(page, 3); await page.keyboard.up('KeyW');
  await step(page, 6);
  await page.keyboard.down('KeyW'); await step(page, 2); await page.keyboard.up('KeyW');
  assert.ok(await page.evaluate(() => __game.player.flipT > 0), 'P1 double-jump triggers flip');

  await page.keyboard.down('Space'); await step(page, 2); await page.keyboard.up('Space');
  assert.ok(await page.evaluate(() => __game.player.dashCd > 0), 'Space triggers P1 Belly-Dash');

  const p2x0 = await page.evaluate(() => __game.world.actors[1].x);
  await page.keyboard.down('ArrowRight'); await step(page, 12); await page.keyboard.up('ArrowRight');
  assert.ok((await page.evaluate(() => __game.world.actors[1].x)) > p2x0 + 30, 'ArrowRight moves P2 in 2P mode');
});

test('Island Shop unlocks & equips helmets and trails, persists across reload, and retries failed saves', async t => {
  const seeded = { v: 3, coins: 200, stars: 3, wins: 1, diff: 'normal', island: 0, helm: 'h_bandana', trail: 't_spark', owned: { h_bandana: 1, t_spark: 1 }, best: [0, 0, 0, 0] };
  const page = await openGame(t, { save: seeded });

  await clickControl(page, '#btnShop');
  assert.equal(await page.evaluate(() => __game.mode), 'shop');

  await page.locator('[data-item="h_dino"]').click();
  await page.locator('[data-item="t_fire"]').click();
  const afterBuy = await page.evaluate(() => ({ helm: __game.save.helm, trail: __game.save.trail, coins: __game.save.coins }));
  assert.equal(afterBuy.helm, 'h_dino');
  assert.equal(afterBuy.trail, 't_fire');
  assert.equal(afterBuy.coins, 200 - 60 - 45);

  // Simulate quota failure then Retry via Kit.saveStatus
  await page.evaluate(() => {
    const orig = Storage.prototype.setItem;
    window.__unblockSave = () => { Storage.prototype.setItem = orig; };
    Storage.prototype.setItem = function (k, v) {
      if (String(k).includes('chaos-island:save')) throw new DOMException('Quota', 'QuotaExceededError');
      return orig.call(this, k, v);
    };
  });
  await page.locator('[data-item="h_pirate"]').click();
  assert.equal(await page.locator('.sg-save-status').isVisible(), true, 'save error banner appears');
  await page.evaluate(() => window.__unblockSave());
  await page.locator('.sg-save-status button').click();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('sg:chaos-island:save')).helm), 'h_pirate');

  await page.reload();
  await page.waitForFunction(() => !!window.__game);
  assert.equal(await page.evaluate(() => __game.save.helm), 'h_pirate', 'equipped helmet persists across reload');
});

test('full 3-round match reaches result screen, awards coins/stars, and records DDA outcome', async t => {
  const page = await openGame(t);
  await clickControl(page, '#btnPlay');
  await step(page, 1);

  // Autoplay P1 via CIEngine.planCoach until match ends
  await page.evaluate(() => {
    for (let f = 0; f < 60 * 75 && __game.mode === 'play'; f++) {
      const plan = window.CIEngine.planCoach(__game.world, __game.player, 1.0);
      const fire = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true, cancelable: true }));
      fire('ArrowRight', plan.moveX > 0);
      fire('ArrowLeft', plan.moveX < 0);
      fire('ArrowUp', !!plan.jump);
      fire('Space', !!plan.dashPressed);
      __ciTest.run(1);
    }
    __ciTest.paint();
  });

  assert.equal(await page.evaluate(() => __game.mode), 'result', 'match finishes on #scrResult');
  assert.ok((await page.evaluate(() => __game.save.coins)) >= 8, 'coins awarded and saved');
  assert.equal(await page.evaluate(() => __ciTest.ddaResults.length), 1, 'DDA outcome recorded');
});
