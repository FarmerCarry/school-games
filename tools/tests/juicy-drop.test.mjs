// Juicy Drop (سلّة الفواكه) in real Chromium:
// Space & mouse fruit dropping, mouse + arrow aiming, merge combos, Combo Shake,
// 12-stage goals & World 2 ice melting, Endless mode & drops >= 5 coin guard,
// pause freeze, restart, shop + storage quota retry, focus isolation, and reduced motion.
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
  lv: Array.from({ length: 12 }, (_, i) => ({ s: i < open ? 2 : 0, hi: i < open ? 120 : 0 })),
  bestEndless: 0,
  coins: 0,
  jars: [1, 0, 0, 0, 0],
  faces: [1, 0, 0, 0, 0],
  jar: 0,
  face: 0,
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
    if (!sessionStorage.getItem('jd-seeded')) {
      sessionStorage.setItem('jd-seeded', '1');
      if (save !== undefined) {
        localStorage.setItem('sg:juicy-drop:save', typeof save === 'string' ? save : JSON.stringify(save));
      }
    }
    let kit;
    const jd = window.jd = { results: [], rounds: [], ends: [], hits: 0, misses: 0, failSave: false };
    Object.defineProperty(window, 'Kit', {
      configurable: true,
      get: () => kit,
      set(value) {
        kit = value;
        kit.loop = (update, render) => {
          jd.step = (n = 1) => { for (let i = 0; i < n; i++) { update(1 / 60); render(0); } };
          jd.run = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); render(0); };
          return { stop() {} };
        };
        const makeDda = kit.dda;
        kit.dda = (slug, opts) => {
          const control = makeDda.call(kit, slug, Object.assign({}, opts, { start: dda }));
          const origResult = control.result;
          control.result = outcome => { jd.results.push(outcome); return origResult.call(control, outcome); };
          return control;
        };
        const origRound = kit.stats.round;
        kit.stats.round = id => { jd.rounds.push(id); return origRound.call(kit.stats, id); };
        const origEnd = kit.stats.end;
        kit.stats.end = (code, score) => { jd.ends.push([code, score]); return origEnd.call(kit.stats, code, score); };
        const origHit = kit.track.hit;
        kit.track.hit = () => { jd.hits++; return origHit.call(kit.track); };
        const origMiss = kit.track.miss;
        kit.track.miss = () => { jd.misses++; return origMiss.call(kit.track); };
      }
    });
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key) {
      if (key === 'sg:juicy-drop:save' && window.jd && window.jd.failSave) {
        throw new DOMException('Full storage fixture', 'QuotaExceededError');
      }
      return write.apply(this, arguments);
    };
  }, { save, dda });

  const page = await ctx.newPage();
  await page.goto(`${server.origin}/games/juicy-drop/`, { timeout: 90000 });
  await page.waitForFunction(() => window.__game && window.jd && window.jd.step);
  return page;
}

const state = page => page.evaluate(() => __game.state);
const step = (page, n = 1) => page.evaluate(n => jd.step(n), n);
const run = (page, n = 1) => page.evaluate(n => jd.run(n), n);
const stored = page => page.evaluate(() => {
  const raw = localStorage.getItem('sg:juicy-drop:save');
  return raw ? JSON.parse(raw) : null;
});
const pagePoint = (page, x, y) => page.evaluate(([x, y]) => __game.point(x, y), [x, y]);

test('title waits quietly; first-visit Play opens Stage 1-1 with stationary cloud and drops === 0; returning Play opens Map', async t => {
  const page = await game(t);
  await step(page, 30);
  assert.equal((await state(page)).screen, 'title');
  assert.equal(await page.locator('#titleStars b').textContent(), '0/36');

  // Clicking corner (3, 3) to unlock audio does not start play.
  await page.mouse.click(3, 3);
  await step(page, 10);
  assert.equal((await state(page)).screen, 'title');

  for (const word of ['صوّب وأفلت', 'ادمج المتشابه', 'هزّ السلّة', 'اصنع البطيخة']) {
    assert.ok(await page.locator('.howto figcaption', { hasText: word }).isVisible(), word);
  }

  await page.locator('#btnPlay').click();
  await step(page);
  let s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.mode, 'stage');
  assert.equal(s.id, '1-1');
  assert.equal(s.cloudX, 640);
  assert.equal(s.drops, 0);
  assert.equal(s.fruits, 0);

  // Idle frames never move cloudX or drop fruits before player input!
  await run(page, 120);
  s = await state(page);
  assert.equal(s.cloudX, 640);
  assert.equal(s.drops, 0);
  assert.equal(s.fruits, 0);

  // With stars earned, #btnPlay opens the stage map instead.
  const returning = await game(t, { save: SAVE(2) });
  await returning.locator('#btnPlay').click();
  await step(returning);
  assert.equal((await state(returning)).screen, 'map');
});

test('real mouse click, mouse aiming, ArrowLeft/ArrowRight steering, Space dropping, merge combos, and Combo Shake', async t => {
  const page = await game(t, { reducedMotion: 'no-preference' });
  await page.locator('#btnPlay').click();
  await step(page);

  // Move mouse to x = 560 inside jar and click to drop first fruit.
  const pLeft = await pagePoint(page, 560, 320);
  await page.mouse.move(pLeft.x, pLeft.y);
  await step(page, 2);
  assert.ok(Math.abs((await state(page)).cloudX - 560) < 2);

  await page.mouse.click(pLeft.x, pLeft.y);
  await step(page, 2);
  let s = await state(page);
  assert.equal(s.drops, 1);
  assert.equal(s.fruits, 1);

  // Arrow keys steer cloudX smoothly even after mouse movement.
  await run(page, 25);
  const beforeArrow = (await state(page)).cloudX;
  await page.keyboard.down('ArrowRight');
  await step(page, 12);
  await page.keyboard.up('ArrowRight');
  const afterArrow = (await state(page)).cloudX;
  assert.ok(afterArrow > beforeArrow + 40, `${afterArrow} > ${beforeArrow}`);

  // Space drops at current cloudX and then steps cloudX for one-button play.
  await page.keyboard.press('Space');
  await step(page, 2);
  s = await state(page);
  assert.equal(s.drops, 2);
  assert.notEqual(s.cloudX, afterArrow);

  // Force identical Dates (tier 2 -> Fig tier 3, keeping Stage 1-1 active) to verify merge + Combo Shake!
  await page.evaluate(() => {
    const w = __game.world;
    w.fruits.length = 0;
    w.currentTier = 2;
    w.nextTier = 2;
    w.shakeCharge = 65;
  });
  await run(page, 25);
  const center = await pagePoint(page, 640, 300);
  await page.mouse.click(center.x, center.y);
  await run(page, 75);
  await page.evaluate(() => { __game.world.currentTier = 2; });
  await page.mouse.click(center.x, center.y);
  await run(page, 75);

  s = await state(page);
  assert.ok(s.merges >= 1, 'identical fruits merged');
  assert.ok(s.score >= 14, 'merge awarded points');
  assert.equal(s.shakeCharge, 100, 'shake meter charged to 100');
  assert.match(await page.locator('#btnShake').getAttribute('class'), /ready/);

  const dropsBeforeShake = s.drops;
  await page.locator('#btnShake').click();
  await step(page, 2);
  s = await state(page);
  assert.equal(s.shakesUsed, 1, 'Combo Shake activated by #btnShake');
  assert.equal(s.shakeCharge, 0);
  assert.equal(s.drops, dropsBeforeShake, 'clicking #btnShake never drops a fruit');

  // Also verify KeyS activates Combo Shake when charged.
  await page.evaluate(() => { __game.world.shakeCharge = 100; });
  await step(page);
  await page.keyboard.press('KeyS');
  await step(page, 2);
  assert.equal((await state(page)).shakesUsed, 2);
});

test('completing Stage 1-1 awards 3 stars & coins, records DDA & telemetry, and unlocks Stage 1-2; World 2 melts ice', async t => {
  const page = await game(t, { save: SAVE(4) });
  await page.locator('#btnLevels').click();
  await step(page);
  await page.locator('.lvl').nth(0).click();
  await step(page);
  assert.equal((await state(page)).id, '1-1');

  // Drop two Figs (tier 3) at center to craft a Lemon (tier 4) and win Stage 1-1!
  await page.evaluate(() => {
    const w = __game.world;
    w.currentTier = 3;
    w.nextTier = 3;
  });
  const center = await pagePoint(page, 640, 300);
  await page.mouse.click(center.x, center.y);
  await run(page, 75);
  await page.mouse.click(center.x, center.y);
  await run(page, 75);

  let s = await state(page);
  assert.equal(s.done, true);
  assert.equal(s.won, true);
  assert.equal(s.stars, 3);
  assert.deepEqual(await page.evaluate(() => jd.results), [1]);
  assert.deepEqual(await page.evaluate(() => jd.ends[jd.ends.length - 1][0]), 'win');

  await run(page, 90);
  s = await state(page);
  assert.equal(s.screen, 'result');
  await run(page, 90);
  assert.equal(await page.locator('#resStars svg.on').count(), 3);
  assert.ok((await stored(page)).lv[0].s === 3);

  // Enter advances to Stage 1-2.
  await page.keyboard.press('Enter');
  await step(page);
  assert.equal((await state(page)).id, '1-2');

  // Open World 2 Stage 2-1 (index 4) and verify frosted cubes spawn & melt on adjacent merge!
  await page.keyboard.press('Escape');
  await step(page);
  await page.locator('#btnMap').click();
  await step(page);
  await page.locator('.lvl').nth(4).click();
  await step(page);
  s = await state(page);
  assert.equal(s.id, '2-1');
  assert.equal(s.ices, 2);

  await page.evaluate(() => {
    const w = __game.world;
    const ic = w.ices[0];
    JD.addFruit(w, 0, ic.x - 16, ic.y - ic.r - 16, 0, 0);
    JD.addFruit(w, 0, ic.x + 8, ic.y - ic.r - 16, 0, 0);
  });
  await run(page, 25);
  assert.equal((await state(page)).ices, 1, 'adjacent merge melted one ice cube');
});

test('Endless mode (#btnEndless), overflow warning/end grace, and drops >= 5 coin guard', async t => {
  const page = await game(t);
  await page.locator('#btnEndless').click();
  await step(page);
  let s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.mode, 'endless');
  assert.equal(await page.evaluate(() => jd.rounds[jd.rounds.length - 1]), 'endless');

  // 1) Under 5 drops: settled fruit above TOP_Y warns after 1.2s, ends after 2.8s+grace, pays ZERO coins!
  await page.evaluate(() => {
    const w = __game.world;
    w.drops = 3;
    w.score = 250;
    const ic = JD.addIce(w, 5, 640, JD.TOP_Y + 62, 2);
    const f = JD.addFruit(w, 5, 640, ic.y - ic.r - 56, 0, 0);
    f.landed = true;
    f.age = 2;
  });
  await run(page, 80); // ~1.33s -> warning active, not over yet
  s = await state(page);
  assert.equal(s.warning, true, 'overflow warns after 1.2s');
  assert.equal(s.over, false, 'not over yet before 2.8s');

  await run(page, 150); // past 2.8s + grace -> overflow!
  s = await state(page);
  assert.equal(s.over, true);
  assert.equal(s.done, true);
  assert.equal((await page.evaluate(() => __game.save)).coins, 0, 'zero endless coins when drops < 5');
  assert.equal(await page.evaluate(() => jd.ends[jd.ends.length - 1][0]), 'end');

  // Wait for result screen and play again with drops >= 5 -> pays coins!
  await run(page, 70);
  assert.equal((await state(page)).screen, 'result');
  await run(page, 40);
  await page.locator('#resAgain').click();
  await step(page);
  assert.equal((await state(page)).drops, 0);

  await page.evaluate(() => {
    const w = __game.world;
    w.drops = 8;
    w.score = 320;
    w.overTime = 3.2;
    const ic = JD.addIce(w, 5, 640, JD.TOP_Y + 62, 2);
    const f = JD.addFruit(w, 5, 640, ic.y - ic.r - 56, 0, 0);
    f.landed = true;
    f.age = 2;
  });
  await run(page, 30);
  assert.equal((await state(page)).over, true);
  assert.ok((await stored(page)).coins >= 10, 'endless coins awarded when drops >= 5');
  assert.equal((await stored(page)).bestEndless, 320);
});

test('Pause (#btnPause, KeyP, Escape, blur) freezes simulation completely; Resume & Restart work', async t => {
  const page = await game(t);
  await page.locator('#btnPlay').click();
  await step(page);

  const c = await pagePoint(page, 620, 280);
  await page.mouse.click(c.x, c.y);
  await step(page, 8);

  const snap = () => page.evaluate(() => JSON.stringify({
    t: __game.state.time,
    cloudX: __game.state.cloudX,
    drops: __game.state.drops,
    fy: __game.world.fruits.map(f => f.y)
  }));

  for (const how of ['button', 'KeyP', 'Escape', 'blur']) {
    if (how === 'button') await page.locator('#btnPause').click();
    else if (how === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    else await page.keyboard.press(how);
    await step(page);
    assert.equal((await state(page)).screen, 'pause', how);

    const frozen = await snap();
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await run(page, 90);
    assert.equal((await state(page)).screen, 'pause', 'focus never auto-resumes');
    assert.equal(await snap(), frozen, how + ': simulation completely frozen while paused');

    await page.locator('#btnResume').click();
    await step(page, 4);
    assert.equal((await state(page)).screen, 'play');
    assert.notEqual(await snap(), frozen, 'simulation resumes after #btnResume');
  }

  // Restart from pause resets drops, score, and fruits to 0.
  await page.locator('#btnPause').click();
  await step(page);
  await page.locator('#btnRestart').click();
  await step(page);
  const s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.drops, 0);
  assert.equal(s.score, 0);
  assert.equal(s.fruits, 0);
});

test('Shop buys jars & faces, storage quota failure warns and Retry saves, focus isolation, [1100,620] fit, and reduced motion', async t => {
  const page = await game(t, { save: SAVE(1, { coins: 15 }), size: [1100, 620], reducedMotion: 'reduce' });

  // Fit check inside [1100, 620] portal frame
  const canvasBox = await page.locator('#game').boundingBox();
  assert.ok(canvasBox.width <= 1100 && canvasBox.height <= 620);
  for (const sel of ['#btnPlay', '#btnEndless', '#btnLevels', '#btnShop', '.howto .card >> nth=3']) {
    const b = await page.locator(sel).boundingBox();
    assert.ok(b.x >= canvasBox.x && b.x + b.width <= canvasBox.x + canvasBox.width && b.y + b.height <= canvasBox.y + canvasBox.height, sel);
  }

  // KeyM toggles mute and never starts the game
  assert.equal(await page.evaluate(() => Kit.audio.muted), false);
  await page.keyboard.press('KeyM');
  await step(page);
  assert.equal(await page.evaluate(() => Kit.audio.muted), true);
  assert.equal((await state(page)).screen, 'title');

  // Shop purchase + QuotaExceededError + Retry via Kit.saveStatus
  await page.locator('#btnShop').click();
  await step(page);
  assert.equal((await state(page)).screen, 'shop');

  // Too expensive item (candy bowl = 30 coins) wiggles and does not buy
  await page.locator('#shelfJars .tile').nth(4).click();
  await step(page);
  assert.equal((await page.evaluate(() => __game.save)).jar, 0);

  // Trigger storage failure when buying basket jar (6 coins)
  await page.evaluate(() => { jd.failSave = true; });
  await page.locator('#shelfJars .tile').nth(1).click();
  await step(page);

  const status = page.locator('.sg-save-status');
  assert.equal(await status.getAttribute('data-state'), 'failed');
  assert.equal((await page.evaluate(() => __game.save)).jar, 1, 'kept in memory');
  assert.equal((await stored(page)).jar, 0, 'storage write had failed');

  await page.evaluate(() => { jd.failSave = false; });
  await status.locator('button').click();
  assert.equal(await status.getAttribute('data-state'), 'saved');
  assert.equal((await stored(page)).jar, 1);

  // Buy Cool Sunglasses face pack (6 coins -> 3 coins left)
  await page.locator('#shelfFaces .tile').nth(1).click();
  await step(page);
  assert.equal((await stored(page)).face, 1);
  assert.equal((await stored(page)).coins, 3);

  // Return to title and start Endless to test focused button isolation & reduced motion
  await page.keyboard.press('Escape');
  await step(page);
  await page.locator('#btnEndless').click();
  await step(page);

  // Focusing #btnPause and pressing Space pauses instead of dropping a fruit!
  await page.locator('#btnPause').focus();
  await page.keyboard.press('Space');
  await step(page);
  assert.equal((await state(page)).screen, 'pause');
  assert.equal((await state(page)).drops, 0);
  await page.locator('#btnResume').click();
  await step(page);

  // Reduced motion keeps fx === 0 and shake === 0 during merges!
  await page.evaluate(() => {
    const w = __game.world;
    JD.addFruit(w, 2, 640, 620, 0, 0);
    JD.addFruit(w, 2, 660, 620, 0, 0);
  });
  await step(page, 6);
  const s = await state(page);
  assert.ok(s.merges >= 1);
  assert.equal(s.fx, 0, 'no particles under reduced motion');
  assert.equal(s.shake, 0, 'no screen shake under reduced motion');

  // Malformed saves boot cleanly
  const broken = await game(t, { save: 'not-json{' });
  assert.equal((await state(broken)).screen, 'title');
  assert.equal(await broken.locator('#titleStars b').textContent(), '0/36');
});
