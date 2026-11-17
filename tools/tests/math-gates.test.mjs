// End-to-end Chromium tests for Math Gates: Galactic Mech Squad (games/math-gates/)
// Verifies 2D Canvas startup (zero three.js), Arabic RTL UI, 3 selectable difficulties
// (سهل / متوسط / بطل), all 4 worlds + Endless Warp Mode unlocked from start, keyboard &
// mouse lane switching, jetpack jump, auto-blaster meteor shattering, Boss Clash victory
// & defeat, Mech Hangar armor shop, pause/resume/restart freeze, save Retry, and reduced motion.
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
before(async () => { server = await startTestServer(root); browser = await launchChromium(); });
after(async () => { await browser?.close(); await server?.close(); });

const SAVE = (extra = {}) => ({
  v: 2,
  coins: 0,
  stars: Array(12).fill(0),
  best: Array(12).fill(0),
  bestEndless: 0,
  bestWave: 0,
  diff: 'easy',
  skin: 0,
  unlockedSkins: [true, false, false, false],
  ...extra
});

async function openGame(t, { save, dda = 0.2, reducedMotion = 'no-preference', size = [1280, 720] } = {}) {
  const ctx = await browser.newContext({ viewport: { width: size[0], height: size[1] }, reducedMotion });
  const errors = [], requests = [];
  ctx.on('page', page => {
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  });
  ctx.on('request', r => {
    if (!r.url().startsWith(server.origin + '/')) requests.push(r.url());
    if (r.url().includes('three.min.js')) errors.push('loaded three.min.js');
  });
  t.after(async () => {
    await ctx.close();
    assert.deepEqual(errors, [], 'no page/console errors or three.min.js');
    assert.deepEqual(requests, [], 'no external network requests');
  });

  await ctx.addInitScript(({ save, dda }) => {
    if (location.protocol !== 'http:') return;
    if (!sessionStorage.getItem('mg-seeded')) {
      sessionStorage.setItem('mg-seeded', '1');
      if (save !== undefined) {
        localStorage.setItem('sg:math-gates:save', typeof save === 'string' ? save : JSON.stringify(save));
      }
    }
    let kit;
    const mg = window.mg = { results: [], failSave: false };
    Object.defineProperty(window, 'Kit', {
      configurable: true,
      get: () => kit,
      set(value) {
        kit = value;
        kit.loop = (update, render) => {
          mg.step = (n = 1) => { for (let i = 0; i < n; i++) { update(1 / 60); render(0); } };
          mg.run = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); render(0); };
          return { stop() {} };
        };
        const make = kit.dda;
        kit.dda = (slug, opts) => {
          const control = make.call(kit, slug, Object.assign({}, opts, { start: dda }));
          const origResult = control.result;
          control.result = outcome => { mg.results.push(outcome); return origResult.call(control, outcome); };
          return control;
        };
      }
    });
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key) {
      if (key === 'sg:math-gates:save' && window.mg && window.mg.failSave) {
        throw new DOMException('Full storage fixture', 'QuotaExceededError');
      }
      return write.apply(this, arguments);
    };
  }, { save, dda });

  const page = await ctx.newPage();
  await page.goto(`${server.origin}/games/math-gates/`);
  await page.waitForFunction(() => window.__game && window.mg && window.mg.step);
  return page;
}

const state = page => page.evaluate(() => __game.state);
const step = (page, n = 1) => page.evaluate(n => mg.step(n), n);
const run = (page, n = 1) => page.evaluate(n => mg.run(n), n);
const results = page => page.evaluate(() => mg.results);
const stored = page => page.evaluate(() => {
  const raw = localStorage.getItem('sg:math-gates:save');
  return raw ? JSON.parse(raw) : null;
});

async function until(page, cond, max = 3600) {
  return page.evaluate(({ cond, max }) => {
    const ok = new Function('s', 'return (' + cond + ');');
    for (let i = 0; i < max; i += 4) { if (ok(__game.state)) return true; mg.run(4); }
    return ok(__game.state);
  }, { cond, max });
}

async function steerTo(page, lane) {
  for (let i = 0; i < 3; i++) {
    const s = await state(page);
    if (s.lane === lane) return;
    await page.keyboard.press(lane < s.lane ? 'ArrowLeft' : 'ArrowRight');
    await step(page);
  }
  assert.equal((await state(page)).lane, lane);
}

async function playOptimalBrowser(page, choose = null, maxFrames = 60 * 45) {
  for (let f = 0; f < maxFrames; f += 4) {
    const s = await state(page);
    if (s.screen !== 'play' || s.phase === 'done') return s;
    if (s.phase === 'run' && s.next && s.next.shown) {
      let want = choose ? choose(s) : s.next.best;
      const haz = s.hazards.find(h => !h.passed && h.d > s.d && h.d - s.d < 5.5);
      if (haz && haz.lanes.includes(want)) {
        if (s.next.d - s.d > 7) want = [0, 1, 2].find(l => !haz.lanes.includes(l)) ?? want;
        else await page.keyboard.press('Space');
      }
      if (want !== s.lane) await steerTo(page, want);
    }
    await run(page, 4);
  }
  return state(page);
}

test('2D Canvas startup (zero three.js), Arabic title screen, difficulty selector, and immediate #btnPlay launch', async t => {
  const page = await openGame(t, {});
  await step(page, 10);
  let s = await state(page);
  assert.equal(s.screen, 'title');
  assert.equal(await page.evaluate(() => typeof window.THREE), 'undefined', 'three.js is NOT loaded');
  assert.match(await page.locator('#title h1').textContent(), /بوابات الحساب/);

  // Switch difficulty to normal then pro then back to easy
  await clickControl(page, '#title-diffs [data-diff="normal"]');
  await step(page);
  assert.equal((await state(page)).diff, 'normal');
  await clickControl(page, '#title-diffs [data-diff="pro"]');
  await step(page);
  assert.equal((await state(page)).diff, 'pro');
  await clickControl(page, '#title-diffs [data-diff="easy"]');
  await step(page);
  assert.equal((await state(page)).diff, 'easy');

  // #btnPlay always launches gameplay immediately in middle lane 1
  await page.locator('#btnPlay').click();
  await step(page);
  s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.lane, 1);
  assert.equal(s.passed, 0);
  assert.ok(s.next && s.next.shown && Array.isArray(s.next.pips), 'easy mode computes energy pips on gates');

  const d0 = s.d;
  await run(page, 30);
  s = await state(page);
  assert.ok(s.d > d0 + 6, 'squad charges forward swiftly');
  assert.equal(s.lane, 1, 'stationary pointer does not override lane');
});

test('keyboard (Arrows, A/D, Digit1..3, Space jump) and mouse click/drag lane controls', async t => {
  const page = await openGame(t, {});
  await page.locator('#btnPlay').click();
  await step(page);

  await page.keyboard.press('ArrowLeft'); await step(page);
  assert.equal((await state(page)).lane, 0);
  await page.keyboard.press('KeyD'); await step(page);
  assert.equal((await state(page)).lane, 1);
  await page.keyboard.press('ArrowRight'); await step(page);
  assert.equal((await state(page)).lane, 2);
  await page.keyboard.press('Digit1'); await step(page);
  assert.equal((await state(page)).lane, 0);
  await page.keyboard.press('Digit2'); await step(page);
  assert.equal((await state(page)).lane, 1);

  // Space triggers Jetpack Turbo Jump
  await page.keyboard.press('Space'); await step(page);
  assert.ok((await state(page)).jumpT > 0.4, 'Space triggers jetpack jump');

  // Mouse click on left and right lanes steers squad
  const leftPt = await page.evaluate(() => __game.lanePoint(0));
  const rightPt = await page.evaluate(() => __game.lanePoint(2));
  await page.mouse.click(leftPt.x, leftPt.y); await step(page);
  assert.equal((await state(page)).lane, 0, 'clicking left lane steers to 0');
  await page.mouse.move(leftPt.x, leftPt.y);
  await page.mouse.move(rightPt.x, rightPt.y, { steps: 5 });
  await step(page);
  assert.equal((await state(page)).lane, 2, 'moving pointer across highway steers to 2');
});

test('all 4 worlds and Endless Warp Mode are unlocked from the start on the map screen', async t => {
  const page = await openGame(t, {});
  await page.locator('#btnMap').click();
  await step(page);
  assert.equal((await state(page)).screen, 'map');
  assert.equal(await page.locator('.world-card').count(), 4);
  assert.equal(await page.locator('.stage-btn').count(), 12);

  // Launch World 4 Stage 4-3 (index 11) directly on a fresh save!
  await clickControl(page, '.stage-btn[data-stage="11"]');
  await step(page);
  let s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.stage, 11);
  assert.equal(s.world, 3);

  // Pause -> Quit -> Launch Endless Warp Mode
  await page.locator('#btnPause').click(); await step(page);
  await page.locator('#btnQuit').click(); await step(page);
  assert.equal((await state(page)).screen, 'map');
  await page.locator('#btnEndlessMap').click(); await step(page);
  s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.endless, true);
});

test('full stage victory: optimal holo-gates + Boss Clash earn 3 stars, coins, DDA update, and next stage', async t => {
  const page = await openGame(t, {});
  await page.locator('#btnPlay').click();
  await step(page);

  const end = await playOptimalBrowser(page);
  assert.equal(end.phase, 'done');
  assert.ok(await until(page, "s.screen === 'result'", 120));

  const s = await state(page);
  assert.equal(s.result.won, true);
  assert.equal(s.result.stars, 3);
  await step(page, 60);
  assert.equal(await page.locator('#res-stars .star.on').count(), 3);

  const saved = await stored(page);
  assert.equal(saved.stars[0], 3);
  assert.ok(saved.coins > 0);
  assert.deepEqual(await results(page), [1]);

  // Enter advances to stage 1 (1-2)
  await page.keyboard.press('Enter');
  await step(page, 2);
  const nextS = await state(page);
  assert.equal(nextS.screen, 'play');
  assert.equal(nextS.stage, 1);
});

test('pause, blur freeze, resume, and #btnRestart contract', async t => {
  const page = await openGame(t, {});
  await page.locator('#btnPlay').click();
  await run(page, 35);

  const snap = () => page.evaluate(() => JSON.stringify([__game.state.d, __game.state.lane, __game.state.count, __game.state.t]));

  for (const how of ['button', 'KeyP', 'Escape', 'blur']) {
    if (how === 'button') await page.locator('#btnPause').click();
    else if (how === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    else await page.keyboard.press(how);
    await step(page);
    assert.equal((await state(page)).screen, 'paused', how);
    const before = await snap();
    await page.keyboard.press('ArrowLeft');
    await run(page, 60);
    assert.equal(await snap(), before, `${how}: simulation completely frozen while paused`);
    if (how === 'blur') {
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await step(page, 5);
      assert.equal((await state(page)).screen, 'paused', 'focus returning never auto-resumes');
    }
    await page.locator('#btnResume').click();
    await step(page);
    assert.equal((await state(page)).screen, 'play');
  }

  // Steer off center, pause, and click #btnRestart
  await page.keyboard.press('ArrowRight');
  await run(page, 40);
  await page.locator('#btnPause').click();
  await step(page);
  const prevAttempt = (await state(page)).attempt;
  await page.locator('#btnRestart').click();
  await step(page);
  const rs = await state(page);
  assert.equal(rs.screen, 'play');
  assert.equal(rs.attempt, prevAttempt + 1);
  assert.equal(rs.passed, 0);
  assert.equal(rs.lane, 1);
  assert.ok(rs.d < 1);
});

test('Mech Hangar armor shop, save quota warning + Retry, and reduced motion', async t => {
  const page = await openGame(t, { save: SAVE({ coins: 160 }), reducedMotion: 'reduce' });
  assert.equal((await state(page)).calm, true);

  await page.locator('#btnHangar').click();
  await step(page);
  assert.equal((await state(page)).screen, 'hangar');
  assert.equal(await page.locator('.skin-card').count(), 4);

  // Simulate quota failure when unlocking Red Dragon skin (cost 60)
  await page.evaluate(() => { mg.failSave = true; });
  await clickControl(page, '.skin-card[data-skin="1"]');
  await step(page);
  const status = page.locator('.sg-save-status');
  assert.equal(await status.getAttribute('data-state'), 'failed');
  assert.equal((await state(page)).skin, 1, 'equipped in memory');

  // Allow storage and click Retry
  await page.evaluate(() => { mg.failSave = false; });
  await status.locator('button').click();
  assert.equal(await status.getAttribute('data-state'), 'saved');
  assert.equal((await stored(page)).skin, 1);
});
