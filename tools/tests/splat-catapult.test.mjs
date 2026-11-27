// Splat Catapult (مقلاع الألوان: Mega Paint-Cannon & Toppling Forts) in real Chromium:
// Drag-Anywhere slingshot, mid-air click/Space abilities, rotational fort toppling,
// simple keyboard aim, pause simulation/render freeze & restart, all 4 open worlds,
// solo win + save + quota retry, dynamic-camera 2P Fort Duel, Workshop, reduced motion,
// 1100x620 portal fit, and zero console/page/network errors.
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

const SAVE = (extra = {}) => ({
  v: 2,
  diff: 'mid',
  coins: 0,
  launcher: 0,
  launchers: [1, 0, 0, 0, 0],
  palette: 0,
  palettes: [1, 0, 0, 0],
  lv: Array.from({ length: 16 }, () => ({ s: 0, best: 0 })),
  ...extra
});

async function game(t, { save, dda = 0.35, reducedMotion = 'reduce', size = [1280, 720] } = {}) {
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
    const sc = window.sc = { results: [], failSave: false };
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
const clientPt = (page, wx, wy) => page.evaluate(([x, y]) => __game.worldToClient(x, y), [wx, wy]);

async function dragAnywhere(page, startWx, startWy, dx, dy) {
  const a = await clientPt(page, startWx, startWy);
  const b = await clientPt(page, startWx + dx, startWy + dy);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await step(page);
  assert.equal((await state(page)).dragging, true, 'drag started anywhere on playfield');
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await step(page);
  await page.mouse.up();
  await step(page);
}

test('title screen waits calmly; corner (3,3) click stays on title; difficulty tiers switch; Play opens Stage 1-1', async t => {
  const page = await game(t);
  await step(page, 25);
  assert.equal((await state(page)).screen, 'title');
  assert.equal(await page.locator('#titleStars b').textContent(), '0/48');
  assert.match(await page.locator('.logo').textContent(), /مقلاع الألوان/);

  // Top-left corner click must NOT start gameplay
  await page.mouse.click(3, 3);
  await step(page, 5);
  assert.equal((await state(page)).screen, 'title');

  // Difficulty selector: سهل gives +2 bonus shots, بطل enables wind gusts
  await page.locator('#diffEasy').click();
  await step(page);
  assert.equal((await state(page)).diff, 'easy');
  assert.equal((await state(page)).shotsLeft, 6);

  await page.locator('#diffHero').click();
  await step(page);
  assert.equal((await state(page)).diff, 'hero');
  assert.notEqual((await state(page)).wind, 0, 'hero difficulty activates wind');

  await page.locator('#diffMid').click();
  await page.locator('#btnPlay').click();
  await step(page);
  const s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.mode, 'solo');
  assert.equal(s.id, '1-1');
  assert.equal(s.shots, 0);
  assert.equal(s.goblinsLeft, 3);

  // Aim angle never drifts without player input
  const before = s.aimAngle;
  await run(page, 40);
  assert.equal((await state(page)).aimAngle, before, 'aimAngle unchanged when idle');
});

test('Drag-Anywhere mouse launch, mid-air click cluster split, and real 2D rotational fort toppling', async t => {
  const page = await game(t, { save: SAVE(), reducedMotion: 'no-preference' });
  await page.locator('#btnLevels').click();
  await step(page);
  // Pick Stage 1-2 (index 1, first projectile is cluster = الثلاثي المتفرّع)
  await page.locator('.lvl').nth(1).click();
  await step(page);
  let s = await state(page);
  assert.equal(s.id, '1-2');
  assert.equal(s.nextType, 'cluster');

  // Drag back starting in open mid-field (x=620, y=340 — far away from catapult!)
  await dragAnywhere(page, 620, 340, -118, 56);
  s = await state(page);
  assert.equal(s.shots, 1);
  assert.ok(s.activeProjectile, 'projectile launched via Drag-Anywhere');
  assert.equal(s.projectileCount, 1);

  await run(page, 14);
  assert.ok((await state(page)).trailLen > 0, 'paint trail emitted when motion is full');

  // Click mid-air to split cluster into 3 whistling mini-rockets!
  const mid = await clientPt(page, 640, 320);
  await page.mouse.click(mid.x, mid.y);
  await step(page);
  s = await state(page);
  assert.equal(s.activeProjectile.specialUsed, true);
  assert.equal(s.projectileCount, 3, 'cluster split into 3 mini-rockets on mid-air click');

  // Let rockets strike fort and verify genuine rotational toppling + neon paint splatters!
  await run(page, 150);
  const impactStats = await page.evaluate(() => ({
    maxRot: Math.max(...__game.world.blocks.map(b => Math.abs(b.rot))),
    splats: __game.world.splats.length
  }));
  assert.ok(impactStats.maxRot > 0.15, `fort beams rotated & toppled (maxRot=${impactStats.maxRot})`);
  assert.ok(impactStats.splats > 0, 'permanent neon paint splatters coated fort/ground');
});

test('simple keyboard aim (ArrowUp/ArrowRight), KeyC swap, single-press Space launch & mid-air special, and focused button safety', async t => {
  const page = await game(t);
  await page.locator('#btnPlay').click();
  await step(page);
  await page.evaluate(() => document.activeElement?.blur());

  const s0 = await state(page);
  assert.equal(s0.nextType, 'bomb');

  // Hold ArrowUp to raise positive elevation angle; hold ArrowRight to raise power
  await page.keyboard.down('ArrowUp');
  await run(page, 8);
  await page.keyboard.up('ArrowUp');
  const s1 = await state(page);
  assert.ok(s1.aimAngle > s0.aimAngle, `ArrowUp raised aimAngle: ${s0.aimAngle} -> ${s1.aimAngle}`);

  await page.keyboard.down('ArrowRight');
  await run(page, 8);
  await page.keyboard.up('ArrowRight');
  const s2 = await state(page);
  assert.ok(s2.aimPower > s1.aimPower, `ArrowRight raised aimPower: ${s1.aimPower} -> ${s2.aimPower}`);

  // KeyC swaps active projectile with next in queue
  await page.keyboard.press('KeyC');
  await step(page);
  assert.equal((await state(page)).nextType, 'cluster');
  await page.keyboard.press('KeyC');
  await step(page);
  assert.equal((await state(page)).nextType, 'bomb');

  // Single Space press fires immediately; second Space press mid-air triggers shockwave surge!
  await page.keyboard.press('Space');
  await step(page);
  assert.equal((await state(page)).shots, 1);
  assert.equal((await state(page)).phase, 'flight');

  await run(page, 10);
  await page.keyboard.press('Space');
  await step(page);
  assert.equal((await state(page)).activeProjectile.specialUsed, true, 'Space mid-air activated special');

  // Focused native UI button handles Enter without firing or hijacking
  await page.locator('#btnPause').focus();
  await page.keyboard.press('Enter');
  await step(page);
  assert.equal((await state(page)).screen, 'pause');
});

test('pause freezes physics AND canvas redraws; Resume continues; Restart resets shots=0 and time<0.5', async t => {
  const page = await game(t);
  await page.locator('#btnPlay').click();
  await step(page);
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('Space');
  await run(page, 10);

  const snap = () => page.evaluate(() => JSON.stringify([__game.state.time, __game.state.aimAngle, __game.state.shots, __game.state.activeProjectile]));

  for (const how of ['button', 'KeyP', 'Escape', 'blur']) {
    if (how === 'button') await page.locator('#btnPause').click();
    else if (how === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    else { await page.evaluate(() => document.activeElement?.blur()); await page.keyboard.press(how); }
    await step(page);

    const s = await state(page);
    assert.equal(s.screen, 'pause', how);
    assert.equal(s.paused, true, how);

    const frozen = await snap();
    const drawsBefore = (await state(page)).draws;
    await run(page, 60);
    const drawsAfter = (await state(page)).draws;
    assert.equal(await snap(), frozen, `${how}: simulation frozen while paused`);
    assert.equal(drawsAfter, drawsBefore, `${how}: canvas not redrawn while paused`);

    await page.locator('#btnResume').click();
    await step(page);
    assert.equal((await state(page)).screen, 'play');
    await run(page, 4);
    assert.notEqual(await snap(), frozen, 'simulation advances after resume');
  }

  // Restart from pause resets stage cleanly
  await page.locator('#btnPause').click();
  await step(page);
  await page.locator('#btnRestart').click();
  await step(page);
  const sr = await state(page);
  assert.equal(sr.screen, 'play');
  assert.equal(sr.shots, 0);
  assert.ok(sr.time < 0.5);
  assert.equal(sr.goblinsLeft, 3);
});

test('all 4 Open Worlds unlocked on fresh save; solo win awards stars/coins, handles QuotaExceededError retry, and recovers bad save', async t => {
  const page = await game(t, { save: SAVE() });
  await page.locator('#btnLevels').click();
  await step(page);
  assert.equal(await page.locator('.world-box').count(), 4, 'all 4 worlds displayed');
  assert.equal(await page.locator('.lvl').count(), 16, 'all 16 stages displayed');

  // Jump straight to World 4 Stage 4-1 on a brand-new save!
  await page.locator('.lvl[data-stage="12"]').click();
  await step(page);
  assert.equal((await state(page)).id, '4-1');

  // Now play Stage 1-1 with storage quota blocked, win, and test Retry!
  await page.evaluate(() => { sc.failSave = true; __game.startStage(0); });
  await step(page);

  // Aim TNT-domino chain reaction strike on Stage 1-1 and launch via Space
  await page.evaluate(() => {
    document.activeElement?.blur();
    __game.engine.setAim(__game.world, 0.32, 0.72);
  });
  await page.keyboard.press('Space');
  await run(page, 210);

  assert.equal((await state(page)).screen, 'result', 'Stage 1-1 cleared to result screen');
  assert.equal((await page.evaluate(() => sc.results)).length, 1, 'recorded 1 solo DDA result');

  const status = page.locator('.sg-save-status');
  assert.equal(await status.getAttribute('data-state'), 'failed');
  assert.equal((await stored(page)).lv[0].s, 0, 'disk write blocked while failSave=true');
  assert.ok((await page.evaluate(() => __game.save.lv[0].s)) >= 1, 'in-memory save kept stars');

  await page.evaluate(() => { sc.failSave = false; });
  await status.locator('button').click();
  assert.equal(await status.getAttribute('data-state'), 'saved');
  assert.ok((await stored(page)).lv[0].s >= 1, 'Retry persisted stars to localStorage');

  // Enter advances to Stage 1-2
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('Enter');
  await step(page);
  assert.equal((await state(page)).id, '1-2');

  // Corrupted save recovers cleanly
  const badPage = await game(t, { save: 'broken{' });
  assert.equal((await state(badPage)).screen, 'title');
  assert.equal(await badPage.locator('#titleStars b').textContent(), '0/48');
});

test('2P Fort Duel pans dynamic camera across battlefield, alternates turns, crowns winner, and never touches solo DDA', async t => {
  const page = await game(t, { reducedMotion: 'no-preference' });
  await page.locator('#btnDuel').click();
  await step(page);

  let s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.mode, 'duel');
  assert.equal(s.turn, 1);
  assert.equal(s.p1Goblins, 3);
  assert.equal(s.p2Goblins, 3);
  assert.ok(s.camZoom < 1, 'Duel camera zooms out to frame catapult & battlefield');
  const startCamX = s.camX;

  // Player 1 fires across arena -> camera pans rightward following projectile!
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('Space');
  await run(page, 35);
  assert.ok((await state(page)).camX > startCamX + 80, 'Dynamic camera tracks flying paint-rocket rightward');

  await run(page, 210);
  s = await state(page);
  if (s.winner === 0) {
    assert.equal(s.turn, 2, 'turn alternated to Player 2');
    // Player 2 fires a weak shot
    await page.evaluate(() => { __game.engine.setAim(__game.world, 0.4, 0.25); __game.engine.fire(__game.world); });
    await run(page, 200);
    assert.equal((await state(page)).turn, 1, 'turn alternated back to Player 1');
  }

  // Clear Player 2's fort so Player 1 wins
  let guard = 0;
  while ((await state(page)).winner === 0 && guard++ < 12) {
    const cur = await state(page);
    if (cur.turn === 1) {
      const pwr = 0.84 + (guard % 3) * 0.06;
      await page.evaluate(pw => { __game.engine.setAim(__game.world, 0.56, pw); __game.engine.fire(__game.world); }, pwr);
      await run(page, 32);
      await page.evaluate(() => __game.engine.activateSpecial(__game.world));
      await run(page, 210);
    } else {
      await page.evaluate(() => { __game.engine.setAim(__game.world, 0.35, 0.24); __game.engine.fire(__game.world); });
      await run(page, 180);
    }
  }

  s = await state(page);
  assert.equal(s.winner, 1);
  assert.equal(s.p2Goblins, 0);
  assert.equal(s.screen, 'result');
  assert.match(await page.locator('#resDuelText').textContent(), /فاز اللاعب 1/);
  assert.deepEqual(await page.evaluate(() => sc.results), [], '2P Fort Duel never touches solo DDA');
});

test('Catapult Workshop unlocks launchers & palettes; mute & KeyM work; reduced motion suppresses trails; fits 1100x620', async t => {
  const page = await game(t, { save: SAVE({ coins: 35 }), reducedMotion: 'reduce', size: [1100, 620] });
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

  // Open Catapult Workshop (ورشة المقلاع)
  await page.locator('#btnShop').click();
  await step(page);
  assert.equal((await state(page)).screen, 'shop');

  // Unaffordable المقلاع الذهبي (price 65) stays locked
  await page.locator('#shelfLaunchers .tile').nth(4).click();
  await step(page);
  assert.equal((await stored(page)).launcher, 0);

  // Buy مدفع التنين (price 15) + لهب البركان palette (price 12)
  await page.locator('#shelfLaunchers .tile').nth(1).click();
  await step(page);
  assert.equal((await stored(page)).launcher, 1);
  assert.equal((await stored(page)).coins, 20);

  await page.locator('#shelfPalettes .tile').nth(1).click();
  await step(page);
  assert.equal((await stored(page)).palette, 1);
  assert.equal((await stored(page)).coins, 8);

  await page.keyboard.press('Escape');
  await step(page);
  assert.equal((await state(page)).screen, 'title');

  // Verify reduced motion suppresses projectile trails
  await page.locator('#btnPlay').click();
  await step(page);
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('Space');
  for (let i = 0; i < 45; i++) {
    await step(page);
    assert.equal((await state(page)).trailLen, 0, 'no projectile trail under reduced motion');
  }
});
