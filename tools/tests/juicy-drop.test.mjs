// Juicy Drop: Turbo Monster-Fruit Blaster (سلة الفواكه) in real Chromium:
// Open modes (Classic, Crate Smash, 90s Turbo Rush) & difficulties (Easy, Mid, Hero),
// exact-X mouse + Arrow aiming & Space/click dropping (never random X jumps),
// chain merges, Fever Mode + Rainbow Wildcard, all 3 Action Gadgets (Bomb, Shake, Swap),
// Crate Smash & Rush stars, overflow warning/grace & drops >= 3 coin guard,
// pause freeze, resume/restart, shop + storage quota retry, focus isolation, and reduced motion.
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

const SAVE = (extra = {}) => ({
  v: 2,
  coins: 0,
  best: { classic: 0, crates: 0, rush: 0 },
  stars: { crates: 0, rush: 0 },
  dropper: 0,
  droppers: [1, 0, 0, 0],
  tank: 0,
  tanks: [1, 0, 0, 0],
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

test('title waits quietly; all 3 modes & 3 difficulties are open from start; #btnPlay launches Classic immediately', async t => {
  const page = await game(t, {
    save: SAVE({ coins: 14, best: { classic: 420, crates: 880, rush: 1350 } })
  });
  await step(page, 30);
  assert.equal((await state(page)).screen, 'title');
  assert.equal(await page.locator('#titleCoins b').textContent(), '14');
  assert.equal(await page.locator('#titleBest b').textContent(), '420');

  // Clicking corner (3, 3) to unlock audio does not start play.
  await page.mouse.click(3, 3);
  await step(page, 10);
  assert.equal((await state(page)).screen, 'title');

  for (const label of ['الدمج الكلاسيكي', 'تحطيم الصناديق', 'سباق الـ 90 ثانية']) {
    assert.ok(await page.locator('.mode-card b', { hasText: label }).isVisible(), label);
  }
  for (const diffLabel of ['سهل', 'متوسط', 'بطل']) {
    assert.ok(await page.locator('.diff-pill', { hasText: diffLabel }).isVisible(), diffLabel);
  }

  // Switching mode updates high-score chip dynamically before launching.
  await page.locator('#modeCrates').click();
  assert.equal(await page.locator('#titleBest b').textContent(), '880');
  await page.locator('#modeClassic').click();
  assert.equal(await page.locator('#titleBest b').textContent(), '420');

  // Default #btnPlay opens Classic + Mid immediately with stationary dropper and zero drops.
  await page.locator('#btnPlay').click();
  await step(page);
  let s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.mode, 'classic');
  assert.equal(s.diff, 'mid');
  assert.equal(s.cloudX, 640);
  assert.equal(s.drops, 0);
  assert.equal(s.fruits.length, 0);
  assert.equal(await page.evaluate(() => jd.rounds.at(-1)), 'classic_mid');

  // Idle frames never move cloudX or drop fruits before player input!
  await run(page, 120);
  s = await state(page);
  assert.equal(s.cloudX, 640);
  assert.equal(s.drops, 0);
  assert.equal(s.fruits.length, 0);

  // Return to title, pick Crate Smash + Easy -> wider tank, 5 crates, Easy gadget loadout.
  await page.locator('#btnPause').click();
  await step(page);
  await page.locator('#btnPauseHome').click();
  await step(page);
  assert.equal(await page.evaluate(() => jd.ends.at(-1)[0]), 'quit');

  await page.locator('#modeCrates').click();
  await page.locator('#diffEasy').click();
  await page.locator('#btnPlay').click();
  await step(page);
  s = await state(page);
  assert.equal(s.mode, 'crates');
  assert.equal(s.diff, 'easy');
  assert.equal(s.crates, 5);
  assert.deepEqual(s.gadgets, { bomb: 2, shake: 2, swap: 3 });
  assert.equal(await page.evaluate(() => __game.world.jar.hw), 276);
  assert.equal(await page.evaluate(() => jd.rounds.at(-1)), 'crates_easy');

  // Return to title, pick 90s Turbo Rush + Hero -> moving bumper, 90s clock, doubled gadgets.
  await page.locator('#btnPause').click();
  await step(page);
  await page.locator('#btnPauseHome').click();
  await step(page);
  await page.locator('#modeRush').click();
  await page.locator('#diffHero').click();
  await page.locator('#btnPlay').click();
  await step(page);
  s = await state(page);
  assert.equal(s.mode, 'rush');
  assert.equal(s.diff, 'hero');
  assert.equal(s.timeLeft, 90);
  assert.deepEqual(s.gadgets, { bomb: 2, shake: 2, swap: 2 });
  assert.ok(await page.evaluate(() => __game.world.bumper !== null), 'Hero Rush spawns moving bumper');
});

test('exact-X mouse & Arrow aiming, Space/click dropping without random X jumps, chain merges, Fever Mode & Rainbow Wildcard', async t => {
  const page = await game(t, { reducedMotion: 'no-preference' });
  await page.locator('#btnPlay').click();
  await step(page);

  // Move mouse to x = 540 inside tank and click to drop right where aimed.
  const pLeft = await pagePoint(page, 540, 320);
  await page.mouse.move(pLeft.x, pLeft.y);
  await step(page, 2);
  assert.ok(Math.abs((await state(page)).cloudX - 540) < 2);

  await page.mouse.click(pLeft.x, pLeft.y);
  await step(page, 2);
  let s = await state(page);
  assert.equal(s.drops, 1);
  assert.equal(s.fruits.length, 1);
  assert.ok(Math.abs(s.fruits[0].x - 540) < 2, 'clicked fruit spawns at aimed X');

  // Arrow keys steer cloudX smoothly in both directions.
  await run(page, 22);
  const beforeRight = (await state(page)).cloudX;
  await page.keyboard.down('ArrowRight');
  await step(page, 14);
  await page.keyboard.up('ArrowRight');
  const afterRight = (await state(page)).cloudX;
  assert.ok(afterRight > beforeRight + 50, `${afterRight} > ${beforeRight}`);

  await page.keyboard.down('ArrowLeft');
  await step(page, 6);
  await page.keyboard.up('ArrowLeft');
  const aimedX = (await state(page)).cloudX;
  assert.ok(aimedX < afterRight - 15, `${aimedX} < ${afterRight}`);

  // Space drops right at aimedX — NEVER randomly teleports cloudX!
  await page.keyboard.press('Space');
  await step(page, 2);
  s = await state(page);
  assert.equal(s.drops, 2);
  assert.equal(s.cloudX, aimedX, 'Space never teleports cloudX');
  assert.ok(Math.abs(s.fruits[1].x - aimedX) < 1.5, 'Space spawns fruit at exact cloudX');

  // Force identical Kiwis (tier 2) + near-full Fever Gauge -> merge triggers Fever Mode & Rainbow Wildcard!
  await page.evaluate(() => {
    const w = __game.world;
    w.fruits.length = 0;
    w.currentTier = 2;
    w.nextTier = 2;
    w.fever = 88;
  });
  await run(page, 22);
  const center = await pagePoint(page, 640, 300);
  await page.mouse.click(center.x, center.y);
  await run(page, 70);
  await page.evaluate(() => { __game.world.currentTier = 2; });
  await page.mouse.click(center.x, center.y);
  await run(page, 70);

  s = await state(page);
  assert.ok(s.merges >= 1, 'identical monster-fruits merged');
  assert.ok(s.score >= 24, 'merge awarded points');
  assert.ok((await page.evaluate(() => jd.hits)) >= 1, 'merge tracked Kit.track.hit()');
  assert.equal(s.feverActive, true, 'full Fever Gauge launched Fever Mode');
  assert.equal(s.currentPower, 'rainbow', 'Fever Mode armed free Rainbow Wildcard');

  // Dropping the Rainbow Wildcard onto the Tier-3 Lemon merges into Tier-4 Karate Orange!
  await page.mouse.click(center.x, center.y);
  await run(page, 70);
  s = await state(page);
  assert.ok(s.merges >= 2, 'Rainbow Wildcard merged with existing fruit');
  assert.ok(s.fruits.some(f => f.tier === 4), 'evolved into Tier-4 fruit');
});

test('all 3 Action Gadgets work via HUD buttons (#btnBomb, #btnShake, #btnSwap) and Digit1/2/3 hotkeys', async t => {
  const page = await game(t);
  await page.locator('#diffEasy').click();
  await page.locator('#btnPlay').click();
  await step(page);

  // Easy loadout starts with 2 Bombs, 2 Shakes, 3 Swaps.
  assert.equal(await page.locator('#cntBomb').textContent(), '2');
  assert.equal(await page.locator('#cntShake').textContent(), '2');
  assert.equal(await page.locator('#cntSwap').textContent(), '3');

  // 1) Juice Bomb (#btnBomb & Digit1): blasts the 3 smallest clutter fruits each time without dropping!
  await page.evaluate(() => {
    const w = __game.world;
    w.fruits.length = 0;
    JDEngine.spawnFruit(w, 0, 420, 640, 0, 0);
    JDEngine.spawnFruit(w, 0, 470, 640, 0, 0);
    JDEngine.spawnFruit(w, 1, 525, 640, 0, 0);
    JDEngine.spawnFruit(w, 1, 585, 640, 0, 0);
    JDEngine.spawnFruit(w, 2, 650, 635, 0, 0);
    JDEngine.spawnFruit(w, 3, 725, 628, 0, 0);
    JDEngine.spawnFruit(w, 7, 815, 584, 0, 0); // Tier-7 Boxing Melon survives both Bombs!
  });
  await page.locator('#btnBomb').click();
  await step(page, 2);
  let s = await state(page);
  assert.equal(s.drops, 0, 'clicking #btnBomb never drops a fruit');
  assert.equal(s.fruits.length, 4, 'first Bomb blasted 3 smallest clutter fruits');
  assert.equal(await page.locator('#cntBomb').textContent(), '1');

  await page.keyboard.press('Digit1');
  await step(page, 2);
  s = await state(page);
  assert.equal(s.fruits.length, 1, 'second Bomb via Digit1 blasted next 3 smallest fruits');
  assert.equal(s.fruits[0].tier, 7, 'highest-tier monster fruit preserved');
  assert.equal(await page.locator('#cntBomb').textContent(), '0');
  assert.match(await page.locator('#btnBomb').getAttribute('class'), /empty/);

  // 2) Tank Shake (#btnShake & Digit2): jolts separated matching fruits together and decrements count!
  await page.evaluate(() => {
    const w = __game.world;
    w.fruits.length = 0;
    JDEngine.spawnFruit(w, 3, 598, 625, 0, 0);
    JDEngine.spawnFruit(w, 3, 682, 625, 0, 0);
  });
  await page.locator('#btnShake').click();
  await run(page, 45);
  s = await state(page);
  assert.ok(s.merges >= 1, 'Tank Shake jolted separated fruits into merging');
  assert.equal(await page.locator('#cntShake').textContent(), '1');

  await page.keyboard.press('Digit2');
  await step(page, 2);
  assert.equal(await page.locator('#cntShake').textContent(), '0');
  assert.match(await page.locator('#btnShake').getAttribute('class'), /empty/);

  // 3) Swap (#btnSwap & Digit3): swaps current & next fruit cleanly!
  await page.evaluate(() => {
    const w = __game.world;
    w.currentTier = 0;
    w.nextTier = 3;
  });
  await page.locator('#btnSwap').click();
  await step(page, 2);
  s = await state(page);
  assert.equal(s.currentTier, 3);
  assert.equal(s.nextTier, 0);
  assert.equal(await page.locator('#cntSwap').textContent(), '2');

  await page.keyboard.press('Digit3');
  await step(page, 2);
  s = await state(page);
  assert.equal(s.currentTier, 0);
  assert.equal(await page.locator('#cntSwap').textContent(), '1');
});

test('Crate Smash win, 90s Turbo Rush win/time-up, and Classic overflow grace + drops >= 3 coin guard', async t => {
  const page = await game(t);

  // 1) Crate Smash win awards 3 stars & coins, records win telemetry & DDA.
  await page.locator('#modeCrates').click();
  await page.locator('#btnPlay').click();
  await step(page);
  await page.evaluate(() => {
    const w = __game.world;
    w.drops = 6;
    w.crates.length = 1;
    w.crates[0].x = 640;
    w.crates[0].y = 630;
    w.crates[0].hp = 1;
    JDEngine.spawnFruit(w, 2, 634, 560, 0, 0);
    JDEngine.spawnFruit(w, 2, 646, 560, 0, 0);
  });
  await run(page, 30);
  let s = await state(page);
  assert.equal(s.screen, 'win');
  assert.equal(s.won, true);
  assert.equal(s.stars, 3);
  assert.equal(await page.locator('#endStars svg.on').count(), 3);
  assert.equal(await page.evaluate(() => jd.ends.at(-1)[0]), 'win');
  assert.equal(await page.evaluate(() => jd.results.at(-1)), 1);
  assert.equal((await stored(page)).stars.crates, 3);
  assert.ok((await stored(page)).coins >= 12);

  // 2) 90s Turbo Rush win (score >= 3-star target) and lose (score below 1-star target on time-up).
  await page.locator('#btnEndHome').click();
  await step(page);
  await page.locator('#modeRush').click();
  await page.locator('#btnPlay').click();
  await step(page);
  await page.evaluate(() => {
    const w = __game.world;
    w.drops = 5;
    w.score = 1950;
    w.timeLeft = 0.04;
  });
  await run(page, 8);
  s = await state(page);
  assert.equal(s.screen, 'win');
  assert.equal(s.stars, 3);
  assert.equal((await stored(page)).stars.rush, 3);
  assert.equal((await stored(page)).best.rush, 1950);

  await page.locator('#btnEndAgain').click();
  await step(page);
  assert.equal((await state(page)).drops, 0);
  await page.evaluate(() => {
    const w = __game.world;
    w.drops = 4;
    w.score = 90;
    w.timeLeft = 0.04;
  });
  await run(page, 8);
  s = await state(page);
  assert.equal(s.screen, 'over');
  assert.equal(s.won, false);
  assert.equal(await page.locator('#endTitle').textContent(), 'انتهى الوقت!');
  assert.equal(await page.evaluate(() => jd.ends.at(-1)[0]), 'lose');

  // 3) Classic overflow warns first, waits for grace timer, guards coins when drops < 3, and pays when drops >= 3!
  await page.locator('#btnEndHome').click();
  await step(page);
  await page.locator('#modeClassic').click();
  await page.locator('#btnPlay').click();
  await step(page);

  const coinsBefore = (await stored(page)).coins;
  await page.evaluate(() => {
    const w = __game.world;
    w.drops = 2; // < 3 drops -> zero coin reward!
    w.score = 300;
    w.crates.push({ id: 99, x: 640, y: 215, r: 44, hp: 5, maxHp: 5, kind: 'ice', prize: 2, hitAnim: 0 });
    const f = JDEngine.spawnFruit(w, 5, 640, 114, 0, 0);
    f.landed = true;
    f.age = 2.0;
  });
  await run(page, 35); // ~0.58s -> warning active, not over yet!
  s = await state(page);
  assert.equal(s.warning, true, 'overflow rim warning activates first');
  assert.equal(s.over, false, 'grace timer prevents instant cheap game-over');

  await run(page, 145); // past maxOverTime -> overflow!
  s = await state(page);
  assert.equal(s.screen, 'over');
  assert.equal(s.over, true);
  assert.ok((await page.evaluate(() => jd.misses)) >= 1, 'overflow tracked Kit.track.miss()');
  assert.equal(await page.evaluate(() => jd.ends.at(-1)[0]), 'end');
  assert.equal((await stored(page)).coins, coinsBefore, 'zero coins paid when drops < 3');

  // Play again with drops >= 3 -> awards coins!
  await page.locator('#btnEndAgain').click();
  await step(page);
  await page.evaluate(() => {
    const w = __game.world;
    w.drops = 6;
    w.merges = 3;
    w.score = 440;
    w.overTimer = w.maxOverTime - 0.05;
    w.crates.push({ id: 99, x: 640, y: 215, r: 44, hp: 5, maxHp: 5, kind: 'ice', prize: 2, hitAnim: 0 });
    const f = JDEngine.spawnFruit(w, 5, 640, 114, 0, 0);
    f.landed = true;
    f.age = 2.0;
  });
  await run(page, 10);
  assert.equal((await state(page)).screen, 'over');
  assert.ok((await stored(page)).coins > coinsBefore, 'coins awarded when drops >= 3');
  assert.equal((await stored(page)).best.classic, 440);
});

test('Pause (#btnPause, KeyP, Escape, blur) freezes simulation completely; Resume & Restart (#btnRestart, KeyR) work', async t => {
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
    fruits: __game.state.fruits
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

  // Restart via #btnRestart resets time, drops, score, and fruits to 0.
  await page.locator('#btnPause').click();
  await step(page);
  await page.locator('#btnRestart').click();
  let s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.time, 0);
  assert.equal(s.drops, 0);
  assert.equal(s.score, 0);
  assert.equal(s.fruits.length, 0);
  await step(page);

  // KeyR during active play also restarts cleanly.
  await page.mouse.click(c.x, c.y);
  await step(page, 4);
  assert.equal((await state(page)).drops, 1);
  await page.keyboard.press('KeyR');
  await step(page);
  s = await state(page);
  assert.ok(s.time <= 0.02);
  assert.equal(s.drops, 0);
  assert.equal(s.fruits.length, 0);
});

test('Shop buys droppers & tanks, storage quota failure warns and Retry saves, focus isolation, [1100,620] fit, and reduced motion', async t => {
  const page = await game(t, { save: SAVE({ coins: 60 }), size: [1100, 620], reducedMotion: 'reduce' });

  // Fit check inside [1100, 620] portal viewport
  const canvasBox = await page.locator('#game').boundingBox();
  assert.ok(canvasBox.width <= 1100 && canvasBox.height <= 620);
  for (const sel of ['#btnPlay', '#btnShop', '#modeClassic', '#modeCrates', '#modeRush', '#diffEasy', '#diffHero']) {
    const b = await page.locator(sel).boundingBox();
    assert.ok(
      b.x >= canvasBox.x &&
      b.x + b.width <= canvasBox.x + canvasBox.width &&
      b.y + b.height <= canvasBox.y + canvasBox.height,
      sel
    );
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
  assert.equal((await state(page)).shopOpen, true);
  assert.ok(await page.locator('#scrShop').isVisible());

  // Too-expensive item (Gold Tank = 90 coins > 60) wiggles and does not buy
  await page.locator('#shelfTanks .shop-tile').nth(3).click();
  await step(page);
  assert.equal((await page.evaluate(() => __game.save)).tank, 0);

  // Trigger storage failure when buying Lightning Cloud dropper (25 coins)
  await page.evaluate(() => { jd.failSave = true; });
  await page.locator('#shelfDroppers .shop-tile').nth(1).click();
  await step(page);

  const status = page.locator('.sg-save-status');
  assert.equal(await status.getAttribute('data-state'), 'failed');
  assert.equal((await page.evaluate(() => __game.save)).dropper, 1, 'kept in memory');
  assert.equal((await stored(page)).dropper, 0, 'storage write had failed');

  await page.evaluate(() => { jd.failSave = false; });
  await status.locator('button').click();
  assert.equal(await status.getAttribute('data-state'), 'saved');
  assert.equal((await stored(page)).dropper, 1);
  assert.equal((await stored(page)).coins, 35);

  // Buy Magma Tank theme (30 coins -> 5 coins left)
  await page.locator('#shelfTanks .shop-tile').nth(1).click();
  await step(page);
  assert.equal((await stored(page)).tank, 1);
  assert.equal((await stored(page)).coins, 5);

  // Close shop with Escape and start Classic to test focused button isolation & reduced motion
  await page.keyboard.press('Escape');
  await step(page);
  assert.equal((await state(page)).shopOpen, false);
  await page.locator('#btnPlay').click();
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
    JDEngine.spawnFruit(w, 2, 640, 620, 0, 0);
    JDEngine.spawnFruit(w, 2, 652, 620, 0, 0);
  });
  await step(page, 6);
  const s = await state(page);
  assert.ok(s.merges >= 1);
  assert.equal(s.fx, 0, 'no particles under reduced motion');
  assert.equal(s.shake, 0, 'no screen shake under reduced motion');

  // Malformed saves boot cleanly
  const broken = await game(t, { save: 'not-json{' });
  assert.equal((await state(broken)).screen, 'title');
  assert.equal(await broken.locator('#titleCoins b').textContent(), '0');
  assert.equal(await broken.locator('#titleBest b').textContent(), '0');
});
