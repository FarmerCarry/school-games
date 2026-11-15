// Desk Karts (سباق المكاتب) in real Chromium: 1P keyboard & pointer driving, idle P1
// stationary guarantee, full 3-lap race completion + stars + DDA, 2P shared-screen mode
// (WASD + Arrows), pause freeze + zero paused redraws, restart, shop + storage quota
// retry, reduced motion, responsive [1100, 620] fit, and zero console/page/network errors.
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
  browser = await launchChromium({ args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
});
after(async () => {
  await browser?.close();
  await server?.close();
});

const SAVE = (open = 0, extra = {}) => ({
  v: 1,
  tracks: Array.from({ length: 8 }, (_, i) => ({ s: i < open ? 2 : 0, t: i < open ? 240 : 0, c: 0 })),
  coins: 0,
  paints: [1, 0, 0, 0, 0, 0],
  toppers: [1, 0, 0, 0, 0, 0],
  paint: 0,
  topper: 0,
  ...extra
});

async function game(t, { save, dda = 0.05, reducedMotion = 'reduce', size = [1280, 720] } = {}) {
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
    if (!sessionStorage.getItem('dk-seeded')) {
      sessionStorage.setItem('dk-seeded', '1');
      if (save !== undefined) {
        localStorage.setItem('sg:desk-karts:save', typeof save === 'string' ? save : JSON.stringify(save));
      }
    }
    let kit;
    const dk = window.dk = { results: [], failSave: false };
    Object.defineProperty(window, 'Kit', {
      configurable: true,
      get: () => kit,
      set(value) {
        kit = value;
        kit.loop = (update, render) => {
          dk.step = (n = 1) => { for (let i = 0; i < n; i++) { update(1 / 60); render(0); } };
          dk.run = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); render(0); };
          return { stop() {} };
        };
        const make = kit.dda;
        kit.dda = (slug, opts) => {
          const control = make.call(kit, slug, Object.assign({}, opts, { start: dda }));
          const origResult = control.result;
          control.result = outcome => {
            dk.results.push(outcome);
            return origResult.call(control, outcome);
          };
          return control;
        };
      }
    });
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key) {
      if (key === 'sg:desk-karts:save' && window.dk && window.dk.failSave) {
        throw new DOMException('Full storage fixture', 'QuotaExceededError');
      }
      return write.apply(this, arguments);
    };
  }, { save, dda });

  const page = await ctx.newPage();
  await page.goto(`${server.origin}/games/desk-karts/`, { timeout: 90000 });
  await page.waitForFunction(() => window.__game && window.dk.step);
  return page;
}

const state = page => page.evaluate(() => __game.state);
const step = (page, n = 1) => page.evaluate(n => dk.step(n), n);
const run = (page, n = 1) => page.evaluate(n => dk.run(n), n);
const stored = page => page.evaluate(() => {
  const raw = localStorage.getItem('sg:desk-karts:save');
  return raw ? JSON.parse(raw) : null;
});
const pagePoint = (page, x, y) => page.evaluate(([x, y]) => __game.point(x, y), [x, y]);

// Drives P1 cleanly around the track using real Playwright keyboard events in small frame chunks.
async function driveRace1P(page, maxChunks = 360) {
  await page.keyboard.down('ArrowUp');
  let steerHeld = '';
  try {
    for (let c = 0; c < maxChunks; c++) {
      const decision = await page.evaluate(() => {
        const st = __game.state;
        if (st.finished || st.screen !== 'play') return { done: true };
        const k = st.karts[0];
        const info = __game.trackInfo;
        const wrapS = s => { s = s % info.len; return s < 0 ? s + info.len : s; };
        const targetS = wrapS(k.s + 92 + k.speed * 0.2);
        let wantOff = 0;
        for (const hz of info.hazards) {
          const ds = wrapS(hz.s - k.s);
          if (ds > 0 && ds < 160) wantOff = hz.off >= 0 ? -info.w * 0.28 : info.w * 0.28;
        }
        for (const bm of info.bumpers) {
          const ds = wrapS(bm.s - k.s);
          if (ds > 0 && ds < 175) wantOff = bm.off >= 0 ? -info.w * 0.34 : info.w * 0.34;
        }
        const aim = __game.at(targetS);
        const tx = aim.x + aim.nx * wantOff, ty = aim.y + aim.ny * wantOff;
        let diff = Math.atan2(ty - k.y, tx - k.x) - k.ang;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        return {
          done: false,
          dir: diff > 0.11 ? 'ArrowRight' : diff < -0.11 ? 'ArrowLeft' : '',
          useItem: !!k.item
        };
      });
      if (decision.done) break;
      if (decision.dir !== steerHeld) {
        if (steerHeld) await page.keyboard.up(steerHeld);
        steerHeld = decision.dir;
        if (steerHeld) await page.keyboard.down(steerHeld);
      }
      if (decision.useItem) await page.keyboard.press('Space');
      await run(page, 5);
    }
  } finally {
    if (steerHeld) await page.keyboard.up(steerHeld);
    await page.keyboard.up('ArrowUp');
  }
}

test('title screen loads cleanly; Play starts Track 1-1 immediately; idle P1 stays at p1Dist === 0 until keys are pressed', async t => {
  const page = await game(t);
  await step(page, 20);
  assert.equal((await state(page)).screen, 'title');
  assert.equal(await page.locator('#titleStars b').textContent(), '0/24');
  for (const label of ['القيادة والتوجيه', 'مفاجآت الصناديق', '3 لفات للفوز']) {
    assert.ok(await page.locator('.howto figcaption', { hasText: label }).isVisible(), label);
  }
  assert.ok(await page.locator('#btnTwo').isVisible(), '2P button visible on title');

  await page.locator('#btnPlay').click();
  await step(page);
  let s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.id, '1-1');
  assert.equal(s.humans, 1);
  assert.equal(s.p1Dist, 0);
  assert.equal(s.p1GasTime, 0);

  // Run 4 full seconds without player input: AI bots drive away, P1 never moves or gets pushed!
  await run(page, 60 * 4);
  s = await state(page);
  assert.equal(s.p1Dist, 0, 'idle P1 never moves');
  assert.equal(s.p1GasTime, 0, 'idle P1 gasTime stays 0');
  assert.equal(s.p1Inputs, 0, 'idle P1 inputs stays 0');
  assert.ok(s.karts[1].dist > 400, 'AI bots actively race around the track');

  // Holding ArrowUp immediately accelerates P1 forward!
  await page.keyboard.down('ArrowUp');
  await run(page, 40);
  await page.keyboard.up('ArrowUp');
  s = await state(page);
  assert.ok(s.p1Dist > 60, `ArrowUp drove P1 forward: ${s.p1Dist}`);
  assert.ok(s.p1GasTime > 0.5);
  assert.ok(s.p1Inputs >= 40);
});

test('optional pointer steering: moving mouse alone does nothing, holding mouse button drives toward pointer', async t => {
  const page = await game(t, { reducedMotion: 'no-preference' });
  await page.keyboard.press('Enter');
  await step(page);

  const ahead = await page.evaluate(() => __game.at(160));
  const pt = await pagePoint(page, ahead.x, ahead.y);

  // Hovering without button down does not move P1.
  await page.mouse.move(pt.x, pt.y);
  await run(page, 30);
  assert.equal((await state(page)).p1Dist, 0);

  // Holding mouse button down accelerates and steers P1 toward pointer.
  await page.mouse.down();
  await run(page, 45);
  await page.mouse.up();
  const s = await state(page);
  assert.ok(s.p1Dist > 80, `pointer hold drove P1: ${s.p1Dist}`);
  assert.ok(s.p1GasTime > 0.6);
});

test('full 3-lap 1P race on Track 1-1: wins 1st, awards 3 stars & coins, updates DDA, and unlocks Track 1-2', async t => {
  const page = await game(t, { dda: 0 });
  await page.locator('#btnPlay').click();
  await step(page);

  await driveRace1P(page, 360);
  let s = await state(page);
  assert.equal(s.finished, true, 'completed 3 laps');
  assert.equal(s.p1Lap, 3);
  assert.equal(s.p1Rank, 1, 'won 1st place');
  assert.deepEqual(await page.evaluate(() => dk.results), [1], 'DDA recorded 1P victory');

  const saved = await stored(page);
  assert.equal(saved.tracks[0].s, 3, 'saved 3 stars');
  assert.ok(saved.coins >= 6, 'earned star + track coins');

  // Step through celebration into #scrResult and star pop animations.
  await run(page, 180);
  s = await state(page);
  assert.equal(s.screen, 'result');
  assert.equal(s.stars, 3);
  assert.equal(await page.locator('#scrResult').isVisible(), true);
  assert.equal(await page.locator('#resStars svg.on').count(), 3);
  assert.match(await page.locator('#resTitle').textContent(), /[\u0600-\u06FF]/);

  // Enter advances to newly unlocked Track 1-2!
  await page.keyboard.press('Enter');
  await step(page);
  s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.id, '1-2');
});

test('2-player shared-screen mode (#btnTwo): P1 (WASD+Q) and P2 (Arrows+Enter) race together with 2 AI bots', async t => {
  const page = await game(t);
  await page.locator('#btnTwo').click();
  await step(page);

  let s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.humans, 2);
  assert.equal(s.karts.length, 4);
  assert.equal(s.karts[0].human, true);
  assert.equal(s.karts[1].human, true);
  assert.equal(s.karts[2].human, false);
  assert.equal(s.karts[3].human, false);

  // Drive both human karts simultaneously with WASD (P1) and Arrows (P2).
  await page.keyboard.down('KeyW');
  await page.keyboard.down('ArrowUp');
  await page.keyboard.down('KeyD');
  await page.keyboard.down('ArrowLeft');
  await run(page, 55);
  await page.keyboard.up('KeyD');
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.up('KeyW');
  await page.keyboard.up('ArrowUp');

  s = await state(page);
  assert.ok(s.p1Dist > 90 && s.p1GasTime > 0.7, `P1 moved with WASD: ${s.p1Dist}`);
  assert.ok(s.p2Dist > 90 && s.p2GasTime > 0.7, `P2 moved with Arrows: ${s.p2Dist}`);
});

test('pause freezes simulation and skips canvas redraws; Resume and #btnRestart work cleanly', async t => {
  const page = await game(t, { save: SAVE(4) });
  await page.locator('#btnLevels').click();
  await step(page);
  await page.locator('.lvl').nth(2).click();
  await step(page);
  assert.equal((await state(page)).id, '2-1');

  await page.keyboard.down('ArrowUp');
  await run(page, 30);
  await page.keyboard.up('ArrowUp');
  assert.ok((await state(page)).p1Dist > 40);

  const snap = () => page.evaluate(() => JSON.stringify([__game.state.time, __game.state.clock, __game.state.karts]));
  for (const how of ['KeyP', 'Escape', 'button', 'blur']) {
    if (how === 'button') await page.locator('#btnPause').click();
    else if (how === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    else await page.keyboard.press(how);
    await step(page);

    const s0 = await state(page);
    assert.equal(s0.screen, 'pause', how);
    assert.equal(s0.paused, true);
    const frozenSnap = await snap();
    const rendersAtPause = s0.renders;

    await run(page, 90);
    assert.equal(await snap(), frozenSnap, `${how}: karts and clock stay 100% frozen`);
    assert.equal((await state(page)).renders, rendersAtPause, `${how}: paused screen skips canvas redraws`);

    if (how === 'KeyP') await page.keyboard.press('KeyP');
    else await page.locator('#btnResume').click();
    await step(page);
    assert.equal((await state(page)).screen, 'play');
    await run(page, 5);
    assert.notEqual(await snap(), frozenSnap, 'simulation resumes cleanly');
  }

  // Restart from pause menu resets p1Dist and time to 0.
  await page.locator('#btnPause').click();
  await step(page);
  await page.locator('#btnRestart').click();
  await step(page);
  const restarted = await state(page);
  assert.equal(restarted.screen, 'play');
  assert.equal(restarted.p1Dist, 0);
  assert.equal(restarted.time, 0);
  assert.equal(restarted.clock, 0);
});

test('shop purchases, storage quota failure + Retry via Kit.saveStatus, damaged saves, and mute key M', async t => {
  const page = await game(t, { save: SAVE(2, { coins: 12 }) });
  assert.equal(await page.locator('#titleStars b').textContent(), '4/24');
  assert.equal(await page.locator('#titleCoins b').textContent(), '12');

  await page.locator('#btnShop').click();
  await step(page);
  assert.equal((await state(page)).screen, 'shop');

  // Simulate full disk while buying a kart paint color!
  await page.evaluate(() => { dk.failSave = true; });
  await page.locator('#shelfPaints .tile').nth(1).click(); // price 3
  await step(page);

  const status = page.locator('.sg-save-status');
  assert.equal(await status.getAttribute('data-state'), 'failed', 'quota warning shown');
  assert.equal((await stored(page)).paints[1], 0, 'disk still has old save');
  assert.equal((await page.evaluate(() => __game.save)).paint, 1, 'in-memory save kept new paint');

  // Free disk and click Retry button on Kit.saveStatus banner.
  await page.evaluate(() => { dk.failSave = false; });
  await status.locator('button').click();
  assert.equal(await status.getAttribute('data-state'), 'saved');
  assert.equal((await stored(page)).paint, 1);
  assert.equal((await stored(page)).coins, 9);

  // Also buy rubber ducky topper (price 4).
  await page.locator('#shelfToppers .tile').nth(1).click();
  await step(page);
  assert.equal((await stored(page)).topper, 1);
  assert.equal((await stored(page)).coins, 5);
  assert.match(await page.locator('#shelfToppers .tile').nth(1).getAttribute('class'), /wear/);

  // Escape returns to title; mute button and KeyM toggle mute without starting a race.
  await page.keyboard.press('Escape');
  await step(page);
  assert.equal((await state(page)).screen, 'title');
  assert.equal(await page.evaluate(() => Kit.audio.muted), false);
  await page.locator('.sg-mute').click();
  assert.equal(await page.evaluate(() => Kit.audio.muted), true);
  await page.keyboard.press('KeyM');
  await step(page);
  assert.equal(await page.evaluate(() => Kit.audio.muted), false);
  assert.equal((await state(page)).screen, 'title');

  // Damaged save JSON recovers cleanly to a fresh save.
  const broken = await game(t, { save: '{corrupt-json' });
  assert.equal(await broken.locator('#titleStars b').textContent(), '0/24');
});

test('reduced motion suppresses trails, shake, and confetti; [1100, 620] portal frame fits all UI controls', async t => {
  const page = await game(t, { reducedMotion: 'reduce', size: [1100, 620] });
  const canvasBox = await page.locator('#game').boundingBox();
  assert.ok(canvasBox.width <= 1100 && canvasBox.height <= 620);

  for (const sel of ['#btnPlay', '#btnTwo', '#btnLevels', '#btnShop', '.howto .card >> nth=2']) {
    const b = await page.locator(sel).boundingBox();
    assert.ok(
      b.x >= canvasBox.x && b.x + b.width <= canvasBox.x + canvasBox.width && b.y + b.height <= canvasBox.y + canvasBox.height,
      `${sel} fits inside scaled canvas`
    );
  }

  await page.locator('#btnPlay').click();
  await step(page);
  await page.keyboard.down('ArrowUp');
  await page.keyboard.down('ArrowRight');
  await run(page, 60);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('ArrowUp');

  const s = await state(page);
  assert.ok(s.p1Dist > 80);
  assert.equal(s.trail, 0, 'no skid/boost trails in reduced motion');
  assert.equal(s.shake, 0, 'no screen shake in reduced motion');
  assert.equal(s.fx, 0, 'no particle bursts in reduced motion');
});
