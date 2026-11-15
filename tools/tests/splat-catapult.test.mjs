// Splat Catapult (مقلاع الألوان) in real Chromium:
// Mouse drag-and-release launch, mid-air click special, keyboard Arrow/Space aim & special,
// pause simulation/render freeze & restart, solo win + save + quota retry, 2P hotseat duel,
// shop skins/frames, reduced motion, smaller portal viewport, and zero console/page errors.
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
  lv: Array.from({ length: 16 }, (_, i) => ({ s: i < open ? 2 : 0, best: i < open ? 1800 : 0 })),
  coins: 0,
  skins: [1, 0, 0, 0, 0, 0],
  frames: [1, 0, 0, 0, 0],
  skin: 0,
  frame: 0,
  coach: true,
  ...extra
});

async function game(t, { save, dda = 0.3, reducedMotion = 'reduce', size = [1280, 720] } = {}) {
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
    if (!sessionStorage.getItem('sc-seeded')) {
      sessionStorage.setItem('sc-seeded', '1');
      if (save !== undefined) {
        localStorage.setItem('sg:splat-catapult:save', typeof save === 'string' ? save : JSON.stringify(save));
      }
    }
    let kit;
    const sc = window.sc = { results: [], failSave: false, draws: 0 };
    const origDrawImage = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function () {
      if (this.canvas && this.canvas.id === 'game') sc.draws++;
      return origDrawImage.apply(this, arguments);
    };
    Object.defineProperty(window, 'Kit', {
      configurable: true,
      get: () => kit,
      set(value) {
        kit = value;
        kit.loop = (update, render) => {
          sc.step = (n = 1) => { for (let i = 0; i < n; i++) { update(1 / 60); render(0); } };
          sc.run = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); render(0); };
          return { stop() {} };
        };
        const make = kit.dda;
        kit.dda = (slug, opts) => {
          const control = make.call(kit, slug, Object.assign({}, opts, { start: dda }));
          const origResult = control.result;
          control.result = outcome => { sc.results.push(outcome); return origResult.call(control, outcome); };
          return control;
        };
      }
    });
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key) {
      if (key === 'sg:splat-catapult:save' && window.sc && window.sc.failSave) {
        throw new DOMException('Full storage fixture', 'QuotaExceededError');
      }
      return write.apply(this, arguments);
    };
  }, { save, dda });

  const page = await ctx.newPage();
  await page.goto(`${server.origin}/games/splat-catapult/`, { timeout: 90000 });
  await page.waitForFunction(() => window.__game && window.sc && window.sc.step);
  return page;
}

const state = page => page.evaluate(() => __game.state);
const step = (page, n = 1) => page.evaluate(n => sc.step(n), n);
const run = (page, n = 1) => page.evaluate(n => sc.run(n), n);
const stored = page => page.evaluate(() => {
  const raw = localStorage.getItem('sg:splat-catapult:save');
  return raw ? JSON.parse(raw) : null;
});
const pagePoint = (page, x, y) => page.evaluate(([x, y]) => __game.point(x, y), [x, y]);

async function dragAndRelease(page, dx, dy) {
  const sl = await page.evaluate(() => __game.sling);
  const start = await pagePoint(page, sl.x, sl.y);
  const end = await pagePoint(page, sl.x + dx, sl.y + dy);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await step(page);
  assert.equal((await state(page)).dragging, true, 'started dragging slingshot pouch');
  await page.mouse.move(end.x, end.y, { steps: 6 });
  await step(page);
  await page.mouse.up();
  await step(page);
}

test('title screen waits calmly; corner click stays on title; Play enters Level 1-1 on fresh save and shows wordless coach', async t => {
  const page = await game(t);
  await step(page, 30);
  assert.equal((await state(page)).screen, 'title');
  assert.equal(await page.locator('#titleStars b').textContent(), '0/48');
  assert.match(await page.locator('.logo').textContent(), /مقلاع الألوان/);

  // Clicking (3, 3) top-left corner must NOT start gameplay
  await page.mouse.click(3, 3);
  await step(page, 5);
  assert.equal((await state(page)).screen, 'title');

  await page.locator('#btnPlay').click();
  await step(page);
  let s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.mode, 'solo');
  assert.equal(s.level, 0);
  assert.equal(s.id, '1-1');
  assert.equal(s.shots, 0);
  assert.equal(s.botsLeft, 2);

  // Wordless coach hand appears after idle wait without firing
  await run(page, 95);
  s = await state(page);
  assert.equal(s.coach, true);
  assert.equal(s.shots, 0);
});

test('real mouse drag-and-release launches balloon, and mid-air click triggers trick special ability', async t => {
  const page = await game(t, { save: SAVE(2), reducedMotion: 'no-preference' });
  await page.locator('#btnLevels').click();
  await step(page);
  // Pick Level 1-2 (index 1), whose first balloon is `triple` (ثلاثي التوت)!
  await page.locator('.lvl').nth(1).click();
  await step(page);
  let s = await state(page);
  assert.equal(s.id, '1-2');
  assert.equal(s.currentBalloon, 'triple');

  // Drag back-left and release!
  await dragAndRelease(page, -95, 42);
  s = await state(page);
  assert.equal(s.shots, 1);
  assert.ok(s.activeProjectile, 'projectile launched into flight');
  assert.equal(s.projectileCount, 1);

  await run(page, 12);
  assert.ok((await state(page)).trail > 0, 'paint trail emitted when motion is allowed');

  // Click mid-air to split `triple` balloon into 3 spread berries!
  const mid = await pagePoint(page, 640, 320);
  await page.mouse.click(mid.x, mid.y);
  await step(page);
  s = await state(page);
  assert.equal(s.activeProjectile.specialUsed, true);
  assert.equal(s.projectileCount, 3, 'triple balloon split into 3 berries on mid-air click');
});

test('keyboard controls via Kit.keys adjust aim, fire on tap or hold-charge, trigger mid-air special, and never hijack focused buttons', async t => {
  const page = await game(t);
  await page.keyboard.press('Enter');
  await step(page);
  let s0 = await state(page);
  assert.equal(s0.screen, 'play');

  // ArrowUp increases angle; ArrowLeft pulls back more power
  await page.keyboard.press('ArrowUp');
  await step(page);
  let s1 = await state(page);
  assert.ok(s1.aimAngle > s0.aimAngle, `ArrowUp raised angle: ${s0.aimAngle} -> ${s1.aimAngle}`);

  await page.keyboard.press('ArrowLeft');
  await step(page);
  let s2 = await state(page);
  assert.ok(s2.aimPower > s1.aimPower, `ArrowLeft increased pull power: ${s1.aimPower} -> ${s2.aimPower}`);

  // Tapping Space launches immediately
  await page.keyboard.press('Space');
  await step(page);
  let s3 = await state(page);
  assert.equal(s3.shots, 1);
  assert.ok(s3.activeProjectile);

  // Advance 8 frames in flight, then press Space to trigger classic mid-air surge!
  await run(page, 8);
  await page.keyboard.press('Space');
  await step(page);
  assert.equal((await state(page)).activeProjectile.specialUsed, true, 'Space mid-air activated special');

  // Wait for shot to settle, then test hold-Space charge & release!
  await run(page, 220);
  assert.equal((await state(page)).phase, 'aim');
  const powBefore = (await state(page)).aimPower;
  await page.keyboard.down('Space');
  await run(page, 10);
  const powCharged = (await state(page)).aimPower;
  assert.notEqual(powCharged, powBefore, 'holding Space charges power');
  await page.keyboard.up('Space');
  await step(page);
  assert.equal((await state(page)).shots, 2, 'releasing Space fires charged shot');

  // Native focused button receives Enter/Space without raw keydown interference
  await page.locator('#btnPause').focus();
  await page.keyboard.press('Enter');
  await step(page);
  assert.equal((await state(page)).screen, 'pause');
});

test('pause freezes physics AND canvas redraws; Resume continues; Restart resets shots to 0', async t => {
  const page = await game(t);
  await page.locator('#btnPlay').click();
  await step(page);
  await page.keyboard.press('Space');
  await run(page, 10);

  const snap = () => page.evaluate(() => JSON.stringify([__game.state.time, __game.state.activeProjectile, __game.state.botsLeft]));

  for (const how of ['button', 'KeyP', 'Escape', 'blur']) {
    if (how === 'button') await page.locator('#btnPause').click();
    else if (how === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    else await page.keyboard.press(how);
    await step(page);

    let s = await state(page);
    assert.equal(s.screen, 'pause', how);
    assert.equal(s.paused, true, how);

    const frozen = await snap();
    const drawsBefore = await page.evaluate(() => sc.draws);
    await run(page, 60);
    const drawsAfter = await page.evaluate(() => sc.draws);
    assert.equal(await snap(), frozen, `${how}: physics completely frozen while paused`);
    assert.equal(drawsAfter, drawsBefore, `${how}: canvas not redrawn while paused and !dirty`);

    await page.locator('#btnResume').click();
    await step(page);
    assert.equal((await state(page)).screen, 'play');
    await step(page, 4);
    assert.notEqual(await snap(), frozen, 'simulation advances again after resume');
  }

  // Restart from pause resets shots to 0
  await page.locator('#btnPause').click();
  await step(page);
  await page.locator('#btnRestart').click();
  await step(page);
  const sr = await state(page);
  assert.equal(sr.screen, 'play');
  assert.equal(sr.shots, 0);
  assert.equal(sr.botsLeft, 2);
});

test('solo victory awards stars & coins, persists save, handles QuotaExceededError with Retry, and unlocks next level', async t => {
  const page = await game(t, { save: SAVE(0) });
  await page.evaluate(() => { sc.failSave = true; });
  await page.locator('#btnPlay').click();
  await step(page);

  // Clear Level 1-1 in 1-2 shots
  let guard = 0;
  while ((await state(page)).screen === 'play' && !(await state(page)).celebrate && guard++ < 4) {
    if ((await state(page)).phase === 'aim') {
      await dragAndRelease(page, -92, 42);
      await run(page, 25);
      const mid = await pagePoint(page, 640, 320);
      await page.mouse.click(mid.x, mid.y);
    }
    await run(page, 180);
  }
  assert.equal((await state(page)).botsLeft, 0, 'all bots in Level 1-1 cleared');
  assert.equal((await page.evaluate(() => sc.results)).length, 1, 'recorded 1 DDA result on solo win');

  // Verify storage quota warning & retry via Kit.saveStatus
  const status = page.locator('.sg-save-status');
  assert.equal(await status.getAttribute('data-state'), 'failed');
  assert.equal((await stored(page)).lv[0].s, 0, 'disk write blocked while failSave=true');
  assert.ok((await page.evaluate(() => __game.save)).lv[0].s >= 1, 'in-memory save kept stars');

  await page.evaluate(() => { sc.failSave = false; });
  await status.locator('button').click();
  assert.equal(await status.getAttribute('data-state'), 'saved');
  assert.ok((await stored(page)).lv[0].s >= 1, 'Retry persisted stars to localStorage');

  // Wait for celebration -> Result screen -> Enter goes to Level 1-2
  await run(page, 120);
  assert.equal((await state(page)).screen, 'result');
  assert.equal(await page.locator('#scrResult').isVisible(), true);
  await run(page, 60);
  await page.keyboard.press('Enter');
  await step(page);
  assert.equal((await state(page)).id, '1-2');

  // Corrupted save recovers cleanly to fresh save
  const badPage = await game(t, { save: 'broken{' });
  assert.equal((await state(badPage)).screen, 'title');
  assert.equal(await badPage.locator('#titleStars b').textContent(), '0/48');
});

test('2-Player Hotseat Duel alternates turns on the same mouse/keyboard, never touches solo DDA, and crowns winner', async t => {
  const page = await game(t);
  await page.locator('#btnDuel').click();
  await step(page);

  let s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.mode, 'duel');
  assert.equal(s.turn, 1);
  assert.equal(s.p1Bots, 3);
  assert.equal(s.p2Bots, 3);

  // Turn 1 -> P1 fires via Space -> settles -> becomes Turn 2!
  await page.keyboard.press('Space');
  await run(page, 220);
  s = await state(page);
  if (s.winner === 0) {
    assert.equal(s.turn, 2, 'turn alternated to Player 2');
    // P2 aims weak short shot so P1 can win cleanly
    for (let k = 0; k < 6; k++) await page.keyboard.press('ArrowLeft');
    await step(page);
    await page.keyboard.press('Space');
    await run(page, 220);
    assert.equal((await state(page)).turn, 1, 'turn alternated back to Player 1');
  }

  // Finish rival fort so Player 1 wins
  let guard = 0;
  while ((await state(page)).winner === 0 && guard++ < 14) {
    const cur = await state(page);
    if (cur.turn === 1) {
      if (cur.p2Bots === 1) {
        await dragAndRelease(page, -108, 56);
      } else {
        await dragAndRelease(page, -96, 48);
      }
      await run(page, 28);
      await page.keyboard.press('Space');
      await run(page, 200);
    } else {
      await dragAndRelease(page, 32, 12);
      await run(page, 180);
    }
  }

  s = await state(page);
  assert.equal(s.winner, 1);
  assert.equal(s.p2Bots, 0);
  assert.deepEqual(await page.evaluate(() => sc.results), [], '2P duel never calls dda.result');

  await run(page, 120);
  assert.equal((await state(page)).screen, 'result');
  assert.match(await page.locator('#resDuelText').textContent(), /فاز اللاعب 1/);
});

test('shop unlocks balloon skins & slingshot frames; mute button & KeyM work; reduced motion suppresses shake/trail/fx; fits 1100x620', async t => {
  const page = await game(t, { save: SAVE(2, { coins: 20 }), reducedMotion: 'reduce', size: [1100, 620] });
  const canvasBox = await page.locator('#game').boundingBox();
  assert.ok(canvasBox.width <= 1100 && canvasBox.height <= 620);
  for (const sel of ['#btnPlay', '#btnDuel', '#btnLevels', '#btnShop']) {
    const b = await page.locator(sel).boundingBox();
    assert.ok(b.x >= canvasBox.x && b.x + b.width <= canvasBox.x + canvasBox.width && b.y + b.height <= canvasBox.y + canvasBox.height, sel);
  }

  // Mute button and KeyM toggle without leaving title
  await page.locator('.sg-mute').click();
  assert.equal(await page.evaluate(() => Kit.audio.muted), true);
  await page.keyboard.press('KeyM');
  await step(page);
  assert.equal(await page.evaluate(() => Kit.audio.muted), false);
  assert.equal((await state(page)).screen, 'title');

  // Open Shop & buy skin 1 (price 8) + frame 1 (price 10)
  await page.locator('#btnShop').click();
  await step(page);
  assert.equal((await state(page)).screen, 'shop');

  // Unaffordable galaxy skin (price 42) does not buy
  await page.locator('#shelfSkins .tile').nth(5).click();
  await step(page);
  assert.equal((await stored(page)).skin, 0);

  await page.locator('#shelfSkins .tile').nth(1).click();
  await step(page);
  assert.equal((await stored(page)).skin, 1);
  assert.equal((await stored(page)).coins, 12);

  await page.locator('#shelfFrames .tile').nth(1).click();
  await step(page);
  assert.equal((await stored(page)).frame, 1);
  assert.equal((await stored(page)).coins, 2);

  await page.keyboard.press('Escape');
  await step(page);
  assert.equal((await state(page)).screen, 'title');

  // Verify reduced motion during gameplay: zero trail, zero shake, zero particle fx
  await page.locator('#btnLevels').click();
  await step(page);
  await page.locator('.lvl').nth(0).click();
  await step(page);
  await page.keyboard.press('Space');
  for (let i = 0; i < 90; i++) {
    await step(page);
    const st = await state(page);
    assert.equal(st.trail, 0, 'no trail under reduced motion');
    assert.equal(st.shake, 0, 'no screen shake under reduced motion');
    assert.equal(st.fx, 0, 'no particle bursts under reduced motion');
  }
});
